
import { prisma } from '@/config/prisma';
import { TransactionType } from '@prisma/client';
import { redis } from '@/config/redis';
import {
    buildInventoryCacheKey,
    buildInventoryWhereClause,
    getSignedAdjustmentQuantity,
    INVENTORY_CACHE_TTL_LIST,
    resolveInventorySocietyId,
} from './inventory.helpers';
import {
    applyCancelReservation,
    applyConfirmStockOutput,
    applyManualAdjustmentStock,
    applyReserveStock,
    buildSaleExitLogInput,
    createInventoryTransactionRecord,
    invalidateConfirmedStockCaches,
    resolveAdjustmentUnitCost,
    scheduleInventoryDomainInvalidation,
    scheduleInventoryListInvalidation,
} from './inventory.service.support';
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

export const InventoryService = {
    /**
     * Logs a stock movement in the Kardex (InventoryTransaction).
     * NOTE: Internal Helper. Call this INSIDE a prisma.$transaction usually.
     */
    logTransaction: async (data: LogTransactionInput, tx?: any) => {
        const db = tx || prisma;
        const record = await createInventoryTransactionRecord(db, data);
        scheduleInventoryListInvalidation();

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
        const sortBy = paginationQuery?.sortBy || 'date';
        const sortOrder = paginationQuery?.sortOrder || 'desc';

        const resolvedSocietyId = await resolveInventorySocietyId(filters);
        if (!resolvedSocietyId && filters?.societyCode) {
            return buildPaginatedResult([], page, limit, 0);
        }

        const cacheKey = buildInventoryCacheKey(
            resolvedSocietyId,
            page,
            limit,
            sortBy,
            sortOrder,
            filters
        );

        // 1. Try Cache
        const cached = await redis.get(cacheKey);
        if (cached) return cached;

        // 2. Query
        const prismaParams = getPrismaPaginationParams(page, limit, sortBy, sortOrder);
        const whereClause = buildInventoryWhereClause(resolvedSocietyId, filters);

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
        await redis.set(cacheKey, result, INVENTORY_CACHE_TTL_LIST);

        return result;
    },

    /**
     * Manual Adjustment
     */
    createAdjustment: async (data: CreateAdjustmentInput, userId?: string) => {
        // Transactional Update
        const result = await prisma.$transaction(async (tx) => {
            const unitCost = await resolveAdjustmentUnitCost(tx, data.productId, data.unitCost);
            const signedQuantity = getSignedAdjustmentQuantity(data.type, data.quantity);

            await applyManualAdjustmentStock(tx, {
                productId: data.productId,
                branchOfficeId: data.branchOfficeId,
                signedQuantity,
            });

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
        }, {
            timeout: 15000
        });

        scheduleInventoryDomainInvalidation('adjustment');

        return result;
    },

    reserveStock: async (productId: string, branchId: string, quantity: number, tx: any) => {
        return applyReserveStock(tx, { productId, branchId, quantity });
    },

    confirmStockOutput: async (input: LogTransactionInput, tx: any) => {
        await applyConfirmStockOutput(tx, {
            productId: input.productId,
            branchOfficeId: input.branchOfficeId,
            quantity: input.quantity,
        });

        const log = await InventoryService.logTransaction(buildSaleExitLogInput(input), tx);
        await invalidateConfirmedStockCaches();

        return log;
    },

    /**
     * Cancel Reservation (Order Cancelled)
     * Increases Available, Decreases Reserved.
     * Also increments Global Product Stock (Available) to return stock.
     */
    cancelReservation: async (productId: string, branchId: string, quantity: number, tx: any) => {
        await applyCancelReservation(tx, { productId, branchId, quantity });
        scheduleInventoryDomainInvalidation('cancelReservation');
    }
};
