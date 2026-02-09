
import { prisma } from '@/config/prisma';
import { TransactionType } from '@prisma/client';
import { redis } from '@/config/redis';
import {
    PaginatedResult,
    getPrismaPaginationParams,
    buildPaginatedResult,
    PaginationQuery,
} from '@/utils/pagination';
import { z } from 'zod';
import { inventoryFilterSchema, createAdjustmentSchema } from './inventory.schema';

// Types derived from Schema
type InventoryFilters = z.infer<typeof inventoryFilterSchema>['query'];
type CreateAdjustmentInput = z.infer<typeof createAdjustmentSchema>['body'];

export interface LogTransactionInput {
    productId: string;
    branchOfficeId: string;
    type: TransactionType;
    quantity: number; // Positive for IN, Negative for OUT
    unitCost: number; // Snapshot cost
    totalCost: number; // Snapshot total cost
    referenceId?: string;
    referenceType?: string;
    documentNumber?: string;
    date?: Date;
}

const CACHE_PREFIX = 'inventory:';
const CACHE_TTL_LIST = 60; // 1 minuto (Kardex changes frequently)

export const InventoryService = {
    /**
     * Logs a stock movement in the Kardex (InventoryTransaction).
     * NOTE: Internal Helper. Call this INSIDE a prisma.$transaction usually.
     */
    logTransaction: async (data: LogTransactionInput, tx?: any) => {
        const db = tx || prisma;

        // We assume the Caller has already updated the Stock in BranchOfficeProduct.
        // So we fetch the Current Stock to record the snapshot.
        const branchProduct = await db.branchOfficeProduct.findUnique({
            where: {
                productId_branchOfficeId: {
                    productId: data.productId,
                    branchOfficeId: data.branchOfficeId,
                },
            },
        });

        if (!branchProduct) {
            // Fallback if product branch relation doesn't exist (should involve creation logic upstream)
            throw new Error(`Product ${data.productId} not found in branch ${data.branchOfficeId} during Kardex Log`);
        }

        const currentStock = branchProduct.physicalStock;
        // Reverse engineer previous stock based on the transaction quantity
        // new = old + quantity  => old = new - quantity
        const previousStock = currentStock - data.quantity;

        const record = await db.inventoryTransaction.create({
            data: {
                date: data.date || new Date(),
                productId: data.productId,
                branchOfficeId: data.branchOfficeId,
                type: data.type,
                quantity: data.quantity,
                previousStock: previousStock,
                newStock: currentStock,
                unitCost: data.unitCost,
                totalCost: data.totalCost,
                referenceId: data.referenceId,
                referenceType: data.referenceType,
                documentNumber: data.documentNumber,
            },
        });

        // Invalidate Cache
        await redis.deleteKeysByPrefix(`${CACHE_PREFIX}list:`);

        return record;
    },

    /**
     * List Kardex (Standard GetAll)
     */
    getAll: async (
        paginationQuery?: PaginationQuery,
        filters?: InventoryFilters
    ) => {
        const page = paginationQuery?.page ?? 1;
        const limit = paginationQuery?.limit ?? 20;
        const sortBy = paginationQuery?.sortBy ?? 'date';
        const sortOrder = paginationQuery?.sortOrder ?? 'desc';

        // Cache Key
        const cacheKeyParts = [
            CACHE_PREFIX,
            'list',
            filters?.branchId || 'all',
            filters?.productId || 'all',
            filters?.type || 'all',
            filters?.startDate || 'all',
            filters?.endDate || 'all',
            page, limit, sortBy, sortOrder
        ];
        const cacheKey = cacheKeyParts.join(':');

        // 1. Try Cache
        const cached = await redis.get(cacheKey);
        if (cached) return cached;

        // 2. Query
        const prismaParams = getPrismaPaginationParams(page, limit, sortBy, sortOrder);
        const whereClause: any = {};

        if (filters?.branchId) whereClause.branchOfficeId = filters.branchId;
        if (filters?.productId) whereClause.productId = filters.productId;
        if (filters?.type) whereClause.type = filters.type;

        if (filters?.startDate || filters?.endDate) {
            whereClause.date = {};
            if (filters.startDate) whereClause.date.gte = new Date(filters.startDate);
            if (filters.endDate) whereClause.date.lte = new Date(filters.endDate);
        }

        if (filters?.search) {
            // Optional: Search by document number or product name
            whereClause.OR = [
                { documentNumber: { contains: filters.search, mode: 'insensitive' } },
                { product: { name: { contains: filters.search, mode: 'insensitive' } } }
            ];
        }

        const [data, total] = await prisma.$transaction([
            prisma.inventoryTransaction.findMany({
                where: whereClause,
                include: {
                    product: { select: { id: true, name: true, code: true } },
                    branchOffice: { select: { id: true, name: true } },
                },
                skip: prismaParams.skip,
                take: prismaParams.take,
                orderBy: prismaParams.orderBy,
            }),
            prisma.inventoryTransaction.count({ where: whereClause }),
        ]);

        const result = buildPaginatedResult(data, page, limit, total);

        // 3. Set Cache
        await redis.set(cacheKey, result, CACHE_TTL_LIST);

        return result;
    },

    /**
     * Manual Adjustment
     */
    createAdjustment: async (data: CreateAdjustmentInput, userId?: string) => {
        // Transactional Update
        const result = await prisma.$transaction(async (tx) => {
            // 1. Get current product cost if not provided
            let unitCost = data.unitCost;
            if (unitCost === undefined) {
                const product = await tx.product.findUnique({ where: { id: data.productId } });
                if (!product) throw new Error("Producto no encontrado");
                unitCost = Number(product.priceCost);
            }

            // 2. Determine quantity sign (ADD or SUB)
            const signedQuantity = data.type === TransactionType.ADJUSTMENT_SUB
                ? -Math.abs(data.quantity)
                : Math.abs(data.quantity);

            // 3. Update Branch Stock
            const branchProduct = await tx.branchOfficeProduct.upsert({
                where: {
                    productId_branchOfficeId: {
                        productId: data.productId,
                        branchOfficeId: data.branchOfficeId
                    }
                },
                update: {
                    physicalStock: { increment: signedQuantity },
                    availableStock: { increment: signedQuantity },
                    ...(signedQuantity > 0 ? { lastRestockedAt: new Date() } : {})
                },
                create: {
                    productId: data.productId,
                    branchOfficeId: data.branchOfficeId,
                    physicalStock: signedQuantity,
                    availableStock: signedQuantity,
                    lastRestockedAt: new Date()
                }
            });

            // 3.1 [NEW] Sync Global Product Stock (Physical)
            await tx.product.update({
                where: { id: data.productId },
                data: { stock: { increment: signedQuantity } }
            });

            // 4. Log Transaction
            return InventoryService.logTransaction({
                date: new Date(),
                productId: data.productId,
                branchOfficeId: data.branchOfficeId,
                type: data.type,
                quantity: signedQuantity,
                unitCost: unitCost,
                totalCost: unitCost * Math.abs(signedQuantity),
                referenceType: 'MANUAL_ADJUSTMENT',
                documentNumber: data.notes,
            }, tx);
        });

        // Invalidate Caches
        await redis.deleteKeysByPrefix('products:');
        await redis.deleteKeysByPrefix('products:select:'); // Explicitly clear select cache
        await redis.deleteKeysByPrefix('branch_office_products:');
        await redis.deleteKeysByPrefix(`${CACHE_PREFIX}list:`);

        return result;
    },

    reserveStock: async (productId: string, branchId: string, quantity: number, tx: any) => {
        // Reserve Stock: affects Available and Reserved, NOT Physical.
        // So Global Product Stock (Physical) is UNCHANGED.
        return tx.branchOfficeProduct.upsert({
            where: {
                productId_branchOfficeId: { productId, branchOfficeId: branchId }
            },
            update: {
                availableStock: { decrement: quantity },
                reservedStock: { increment: quantity }
            },
            create: {
                productId,
                branchOfficeId: branchId,
                physicalStock: 0,
                availableStock: -quantity,
                reservedStock: quantity
            }
        });
    },

    confirmStockOutput: async (input: LogTransactionInput, tx: any) => {
        // 1. Update Branch Stock
        await tx.branchOfficeProduct.update({
            where: {
                productId_branchOfficeId: {
                    productId: input.productId,
                    branchOfficeId: input.branchOfficeId
                }
            },
            data: {
                physicalStock: { decrement: input.quantity },
                reservedStock: { decrement: input.quantity }
            }
        });

        // 1.1 [NEW] Sync Global Product Stock (Physical)
        await tx.product.update({
            where: { id: input.productId },
            data: { stock: { decrement: input.quantity } }
        });

        // 2. Log Transaction (SALE_EXIT)
        return InventoryService.logTransaction({
            ...input,
            quantity: -Math.abs(input.quantity), // Ensure negative for EXIT
            type: TransactionType.SALE_EXIT
        }, tx);
    },

    /**
     * Cancel Reservation (Order Cancelled)
     * Increases Available, Decreases Reserved. Physical remains same.
     */
    cancelReservation: async (productId: string, branchId: string, quantity: number, tx: any) => {
        return tx.branchOfficeProduct.update({
            where: {
                productId_branchOfficeId: { productId, branchOfficeId: branchId }
            },
            data: {
                availableStock: { increment: quantity },
                reservedStock: { decrement: quantity }
            }
        });
    }
};
