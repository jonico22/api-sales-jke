import { Prisma, MovementStatus } from '@prisma/client'; // Import MovementStatus if exported, or use string? Prisma exports it.
import prisma from '@/config/prisma';
import { redis } from '@/config/redis';
import {
  PaginatedResult,
  getPrismaPaginationParams,
  buildPaginatedResult,
  PaginationQuery,
} from '@/utils/pagination';
import { formatToLimaTime, convertLimaDateRangeToUTC } from '@/utils/dateFormatter';
import { createProductBranchMovementSchema, updateProductBranchMovementSchema } from './productBranchMovement.validation';

const CACHE_PREFIX = 'branch_movements:';
const CACHE_TTL_LIST = 300;
const CACHE_TTL_SINGLE = 600;

export interface ProductBranchMovementFilters {
  originBranchId?: string;
  destinationBranchId?: string;
  productId?: string;
  status?: MovementStatus;
  batchId?: string;
  dateFrom?: string;
  dateTo?: string;
}

export class ProductBranchMovementService {
  /**
   * Get All with Pagination and Filters
   */
  static async getAll(
    paginationQuery?: PaginationQuery,
    filters?: ProductBranchMovementFilters
  ): Promise<PaginatedResult<any>> {
    const page = paginationQuery?.page ?? 1;
    const limit = paginationQuery?.limit ?? 10;
    const sortBy = paginationQuery?.sortBy ?? 'movementDate';
    const sortOrder = paginationQuery?.sortOrder ?? 'desc';

    // Cache Key
    const cacheKeyParts = [
      CACHE_PREFIX,
      'list',
      filters?.originBranchId || 'all',
      filters?.destinationBranchId || 'all',
      filters?.productId || 'all',
      filters?.status || 'all',
      filters?.batchId || 'all',
      filters?.dateFrom || 'all',
      filters?.dateTo || 'all',
      page,
      limit,
      sortBy,
      sortOrder
    ];
    const cacheKey = cacheKeyParts.join(':');

    // 1. Return Cache
    const cached = await redis.get<PaginatedResult<any>>(cacheKey);
    if (cached) return cached;

    // 2. Build Query
    const prismaParams = getPrismaPaginationParams(page, limit, sortBy, sortOrder);
    const whereClause: any = {};

    if (filters?.originBranchId) whereClause.originBranchId = filters.originBranchId;
    if (filters?.destinationBranchId) whereClause.destinationBranchId = filters.destinationBranchId;
    if (filters?.productId) whereClause.productId = filters.productId;
    if (filters?.status) whereClause.status = filters.status;
    if (filters?.batchId) whereClause.batchId = filters.batchId;

    if (filters?.dateFrom || filters?.dateTo) {
      whereClause.movementDate = {};
      const dateRange = convertLimaDateRangeToUTC(filters.dateFrom, filters.dateTo);
      if (dateRange.from) whereClause.movementDate.gte = dateRange.from;
      if (dateRange.to) whereClause.movementDate.lte = dateRange.to;
    }

    // 3. Execute
    const [data, total] = await prisma.$transaction([
      prisma.productBranchMovement.findMany({
        where: whereClause,
        skip: prismaParams.skip,
        take: prismaParams.take,
        orderBy: prismaParams.orderBy ?? { movementDate: 'desc' },
        include: {
          originBranch: { select: { id: true, name: true, code: true } },
          destinationBranch: { select: { id: true, name: true, code: true } },
          product: { select: { id: true, name: true, code: true } },
        },
      }),
      prisma.productBranchMovement.count({ where: whereClause }),
    ]);

    // Format
    const formattedData = data.map(item => ({
      ...item,
      movementDate: formatToLimaTime(item.movementDate),
      createdAt: formatToLimaTime(item.createdAt),
      updatedAt: formatToLimaTime(item.updatedAt),
      receivedAt: item.receivedAt ? formatToLimaTime(item.receivedAt) : null,
    }));

    const result = buildPaginatedResult(formattedData, page, limit, total);

    // 4. Set Cache
    await redis.set(cacheKey, result, CACHE_TTL_LIST);
    return result;
  }

  static async getById(id: string) {
    const cacheKey = `${CACHE_PREFIX}${id}`;
    const cached = await redis.get(cacheKey);
    if (cached) return cached;

    const movement = await prisma.productBranchMovement.findUnique({
      where: { id },
      include: {
        originBranch: true,
        destinationBranch: true,
        product: true,
      },
    });

    if (movement) await redis.set(cacheKey, movement, CACHE_TTL_SINGLE);
    return movement;
  }

  /**
   * Create Transfer: Reserves stock at Origin
   */
  static async create(data: any) {
    const validated = createProductBranchMovementSchema.parse(data);

    // Transaction: Verify Stock -> Reserve -> Create Record
    const result = await prisma.$transaction(async (tx) => {
      // 1. Check Origin Stock
      const originStock = await tx.branchOfficeProduct.findUnique({
        where: {
          productId_branchOfficeId: {
            productId: validated.productId,
            branchOfficeId: validated.originBranchId
          }
        }
      });

      if (!originStock) throw new Error('Product not found in origin branch');
      if (originStock.availableStock < validated.quantityMoved) {
        throw new Error(`Insufficient stock in origin. Available: ${originStock.availableStock}, Requested: ${validated.quantityMoved}`);
      }

      // 2. Reserve Stock (Move from Available to Reserved)
      await tx.branchOfficeProduct.update({
        where: { id: originStock.id },
        data: {
          availableStock: { decrement: validated.quantityMoved },
          reservedStock: { increment: validated.quantityMoved }
        }
      });

      // 3. Create Movement Record
      return await tx.productBranchMovement.create({
        data: {
          originBranchId: validated.originBranchId,
          destinationBranchId: validated.destinationBranchId,
          productId: validated.productId,
          quantityMoved: validated.quantityMoved,
          notes: validated.notes,
          referenceCode: validated.referenceCode,
          status: 'PENDING',
          createdBy: validated.createdBy,
          // Add batchId if provided in data, though schema for create might need update or we treat as extra
          // Assuming data has it or we add to validation. For now, let's allow it if passed
          batchId: (data as any).batchId,
        }
      });
    });

    // Invalidate List Cache
    await redis.deleteKeysByPrefix(`${CACHE_PREFIX}list:`);
    return result;
  }

  /**
   * Update Transfer: Confirm or Cancel
   */
  static async update(id: string, data: Prisma.ProductBranchMovementUpdateInput) {
    // We expect specific status changes for logic
    // Using simple update schema for now, but logic depends on status transition

    // First fetch current to know state
    const current = await prisma.productBranchMovement.findUnique({ where: { id } });
    if (!current) throw new Error('Movement not found');

    if (current.status !== 'PENDING' && data.status) {
      // If trying to change status but already finalized
      if (data.status !== current.status) {
        throw new Error(`Cannot change status of a ${current.status} movement.`);
      }
    }

    const result = await prisma.$transaction(async (tx) => {
      let updatedMovement;

      if (data.status === 'COMPLETED' && current.status === 'PENDING') {
        // CONFIRM TRANSFER
        // 1. Origin: -Physical, -Reserved
        await tx.branchOfficeProduct.updateMany({
          where: { productId: current.productId, branchOfficeId: current.originBranchId },
          data: {
            physicalStock: { decrement: current.quantityMoved },
            reservedStock: { decrement: current.quantityMoved }
          }
        });

        // 2. Destination: +Physical, +Available
        // Ensure record exists
        let destStock = await tx.branchOfficeProduct.findUnique({
          where: {
            productId_branchOfficeId: {
              productId: current.productId,
              branchOfficeId: current.destinationBranchId
            }
          }
        });

        if (!destStock) {
          // Create if not exists (Assume stock 0 initial)
          destStock = await tx.branchOfficeProduct.create({
            data: {
              productId: current.productId,
              branchOfficeId: current.destinationBranchId,
              physicalStock: 0,
              availableStock: 0,
              reservedStock: 0
            }
          });
        }

        await tx.branchOfficeProduct.update({
          where: { id: destStock.id },
          data: {
            physicalStock: { increment: current.quantityMoved },
            availableStock: { increment: current.quantityMoved },
            lastRestockedAt: new Date()
          }
        });

        // 3. Update Movement
        updatedMovement = await tx.productBranchMovement.update({
          where: { id },
          data: {
            ...data,
            receivedAt: new Date(), // Auto-set
            status: 'COMPLETED'
          }
        });

      } else if (data.status === 'CANCELLED' && current.status === 'PENDING') {
        // CANCEL TRANSFER
        // 1. Origin: +Available, -Reserved (Return to stock)
        await tx.branchOfficeProduct.updateMany({
          where: { productId: current.productId, branchOfficeId: current.originBranchId },
          data: {
            availableStock: { increment: current.quantityMoved },
            reservedStock: { decrement: current.quantityMoved }
          }
        });

        // 2. Update Movement
        updatedMovement = await tx.productBranchMovement.update({
          where: { id },
          data: {
            ...data,
            status: 'CANCELLED'
          }
        });
      } else {
        // Just metadata update (notes, etc)
        updatedMovement = await tx.productBranchMovement.update({
          where: { id },
          data
        });
      }

      return updatedMovement;
    });

    // Invalidate Cache
    await redis.del(`${CACHE_PREFIX}${id}`);
    await redis.deleteKeysByPrefix(`${CACHE_PREFIX}list:`);

    return result;
  }

  static async delete(id: string) {
    // Only allow delete if PENDING? Or soft delete? 
    // For Safety: Only allow delete if PENDING (and restore stock) or just soft delete.
    // Let's implement Strict Delete: Restore stock if PENDING.
    const current = await prisma.productBranchMovement.findUnique({ where: { id } });
    if (!current) return; // Already gone

    await prisma.$transaction(async (tx) => {
      if (current.status === 'PENDING') {
        // Rollback reservation
        await tx.branchOfficeProduct.updateMany({
          where: { productId: current.productId, branchOfficeId: current.originBranchId },
          data: {
            availableStock: { increment: current.quantityMoved },
            reservedStock: { decrement: current.quantityMoved }
          }
        });
      }
      // If Completed, we usually DO NOT delete history. But if user forces...
      // For now, let's standard delete.
      await tx.productBranchMovement.delete({ where: { id } });
    });

    await redis.del(`${CACHE_PREFIX}${id}`);
    await redis.deleteKeysByPrefix(`${CACHE_PREFIX}list:`);
  }
}
