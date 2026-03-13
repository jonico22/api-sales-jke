import { Prisma, MovementStatus, TransactionType } from '@prisma/client'; // Import MovementStatus if exported, or use string? Prisma exports it.
import prisma from '@/config/prisma';
import { redis } from '@/config/redis';
import { InventoryService } from '@/module/inventory/inventory.service';
import { BranchOfficeProductService } from '@/module/customer/branchOfficeProduct/branchofficeproduct.service';
import {
  PaginatedResult,
  getPrismaPaginationParams,
  buildPaginatedResult,
  PaginationQuery,
} from '@/utils/pagination';
import { formatToLimaTime, convertLimaDateRangeToUTC } from '@/utils/dateFormatter';
import { createProductBranchMovementSchema, updateProductBranchMovementSchema, bulkCreateProductBranchMovementSchema } from './productBranchMovement.validation';

const CACHE_PREFIX = 'branch_movements:';
const CACHE_TTL_LIST = 300;
const CACHE_TTL_SINGLE = 600;

export interface ProductBranchMovementFilters {
  societyId?: string;
  societyCode?: string;
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
    const societyValue = filters?.societyCode || filters?.societyId;
    const cacheKeyParts = [
      CACHE_PREFIX,
      'list',
      societyValue || 'all',
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

    // Filter by Society (via originBranch)
    if (filters?.societyCode) {
      const society = await prisma.society.findUnique({ where: { code: filters.societyCode } });
      if (society) {
        whereClause.originBranch = { societyId: society.id };
      } else {
        return buildPaginatedResult([], page, limit, 0);
      }
    } else if (filters?.societyId) {
      whereClause.originBranch = { societyId: filters.societyId };
    }

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

    // 1. Resolve product info for error messages
    const product = await prisma.product.findUnique({ where: { id: validated.productId } });
    if (!product) throw new Error('Producto no encontrado');

    // 2. Check Stock
    const originStock = await prisma.branchOfficeProduct.findUnique({
      where: {
        productId_branchOfficeId: {
          productId: validated.productId,
          branchOfficeId: validated.originBranchId
        }
      }
    });

    if (!originStock) throw new Error(`El producto "${product.name}" no está registrado en la sucursal de origen`);
    if (originStock.availableStock < validated.quantityMoved) {
      throw new Error(`Stock insuficiente para "${product.name}". Disponible: ${originStock.availableStock}, Solicitado: ${validated.quantityMoved}`);
    }

    // 3. Transaction
    const result = await prisma.$transaction(async (tx) => {
      // A. Reserve Stock (Branch + Global)
      await InventoryService.reserveStock(validated.productId, validated.originBranchId, validated.quantityMoved, tx);

      // B. Create Movement
      const movement = await tx.productBranchMovement.create({
        data: {
          originBranchId: validated.originBranchId,
          destinationBranchId: validated.destinationBranchId,
          productId: validated.productId,
          quantityMoved: validated.quantityMoved,
          notes: validated.notes,
          referenceCode: validated.referenceCode,
          status: 'PENDING',
          createdBy: validated.createdBy,
          batchId: (data as any).batchId,
        }
      });

      // C. Log Transaction (TRANSFER_OUT)
      // Note: InventoryService.logTransaction expects signed quantity for certain types or handles it.
      // We'll log as TRANSFER_OUT with negative quantity.
      await InventoryService.logTransaction({
        productId: validated.productId,
        branchOfficeId: validated.originBranchId,
        type: TransactionType.TRANSFER_OUT,
        quantity: -validated.quantityMoved,
        unitCost: Number(product.priceCost) || 0,
        totalCost: (Number(product.priceCost) || 0) * validated.quantityMoved,
        referenceId: movement.id,
        referenceType: 'TRANSFER',
        documentNumber: validated.referenceCode
      }, tx);

      return movement;
    });

    // 4. Background Processing
    setImmediate(async () => {
      try {
        await redis.deleteKeysByPrefix(`${CACHE_PREFIX}list:`);
      } catch (e) {
        console.error('[MovementService] Cache error:', e);
      }
    });

    return result;
  }

  /**
   * Create Bulk Transfer: Reserves stock for multiple items
   */
  static async createBulk(data: any) {
    const validated = bulkCreateProductBranchMovementSchema.parse(data);
    const batchId = `BATCH-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`.toUpperCase();

    const productIds = validated.items.map(i => i.productId);

    // 1. Resolve Products and Stocks in single query (Optimized)
    const combinedStocks = await BranchOfficeProductService.getProductsStockForBulk(
      validated.originBranchId,
      productIds
    );

    const stockMap = new Map(combinedStocks.map(s => [s.productId, s]));

    // 2. Validate all items before starting transaction
    const errors: string[] = [];
    for (const item of validated.items) {
      const stockInfo = stockMap.get(item.productId);
      const product = stockInfo?.product;

      if (!product) {
        errors.push(`Producto ID ${item.productId} no encontrado o no registrado en la sucursal de origen`);
        continue;
      }

      const available = stockInfo?.availableStock ?? 0;

      if (available < item.quantityMoved) {
        errors.push(`Stock insuficiente para "${product.name}". Disponible: ${available}, Solicitado: ${item.quantityMoved}`);
      }
    }

    if (errors.length > 0) {
      throw new Error(`No se pudo procesar el traslado en bloque:\n${errors.join('\n')}`);
    }

    // 3. atomic Transaction
    const results = await prisma.$transaction(async (tx) => {
      const movements = [];

      for (const item of validated.items) {
        const stockInfo = stockMap.get(item.productId)!;
        const product = stockInfo.product;

        // A. Reserve Stock (Branch + Global)
        await InventoryService.reserveStock(item.productId, validated.originBranchId, item.quantityMoved, tx);

        // B. Create Movement
        const movement = await tx.productBranchMovement.create({
          data: {
            originBranchId: validated.originBranchId,
            destinationBranchId: validated.destinationBranchId,
            productId: item.productId,
            quantityMoved: item.quantityMoved,
            notes: item.notes,
            referenceCode: validated.referenceCode,
            status: 'PENDING',
            createdBy: validated.createdBy,
            batchId: batchId,
          }
        });

        // C. Log Transaction (TRANSFER_OUT)
        await InventoryService.logTransaction({
          productId: item.productId,
          branchOfficeId: validated.originBranchId,
          type: TransactionType.TRANSFER_OUT,
          quantity: -item.quantityMoved,
          unitCost: Number(product.priceCost) || 0,
          totalCost: (Number(product.priceCost) || 0) * item.quantityMoved,
          referenceId: movement.id,
          referenceType: 'TRANSFER',
          documentNumber: validated.referenceCode
        }, tx);

        movements.push(movement);
      }

      return { batchId, count: movements.length, movements };
    });

    // 4. Background Processing
    setImmediate(async () => {
      try {
        await redis.deleteKeysByPrefix(`${CACHE_PREFIX}list:`);
        await redis.deleteKeysByPrefix('products:'); // Stocks updated
        await redis.deleteKeysByPrefix('branch_office_products:');
      } catch (e) {
        console.error('[MovementService] Bulk Cache error:', e);
      }
    });

    return results;
  }

  /**
   * Update Transfer: Confirm or Cancel
   */
  static async update(id: string, data: Prisma.ProductBranchMovementUpdateInput) {
    const current = await prisma.productBranchMovement.findUnique({
      where: { id },
      include: { product: true }
    });
    if (!current) throw new Error('Movimiento no encontrado');

    if (current.status !== 'PENDING' && data.status) {
      if (data.status !== current.status) {
        throw new Error(`No se puede cambiar el estado de un movimiento que ya está ${current.status}.`);
      }
    }

    const result = await prisma.$transaction(async (tx) => {
      let updatedMovement;

      if (data.status === 'COMPLETED' && current.status === 'PENDING') {
        // CONFIRM TRANSFER
        // 1. Origin: -Physical, -Reserved (STOCK EXIT)
        await tx.branchOfficeProduct.updateMany({
          where: { productId: current.productId, branchOfficeId: current.originBranchId },
          data: {
            physicalStock: { decrement: current.quantityMoved },
            reservedStock: { decrement: current.quantityMoved }
          }
        });

        // 2. Destination: +Physical, +Available (STOCK ENTRY)
        const destStock = await tx.branchOfficeProduct.upsert({
          where: {
            productId_branchOfficeId: {
              productId: current.productId,
              branchOfficeId: current.destinationBranchId
            }
          },
          update: {
            physicalStock: { increment: current.quantityMoved },
            availableStock: { increment: current.quantityMoved },
            lastRestockedAt: new Date()
          },
          create: {
            productId: current.productId,
            branchOfficeId: current.destinationBranchId,
            physicalStock: current.quantityMoved,
            availableStock: current.quantityMoved,
            lastRestockedAt: new Date()
          }
        });

        // 3. Global: +Available (Arrival makes them available again)
        await tx.product.update({
          where: { id: current.productId },
          data: { stock: { increment: current.quantityMoved } }
        });

        // 4. Log Transaction (TRANSFER_IN) at Destination
        await InventoryService.logTransaction({
          productId: current.productId,
          branchOfficeId: current.destinationBranchId,
          type: TransactionType.TRANSFER_IN,
          quantity: current.quantityMoved,
          unitCost: Number(current.product.priceCost) || 0,
          totalCost: (Number(current.product.priceCost) || 0) * current.quantityMoved,
          referenceId: current.id,
          referenceType: 'TRANSFER',
          documentNumber: current.referenceCode || undefined
        }, tx);

        // 5. Update Movement Status
        updatedMovement = await tx.productBranchMovement.update({
          where: { id },
          data: {
            ...data,
            receivedAt: new Date(),
            status: 'COMPLETED'
          }
        });

      } else if (data.status === 'CANCELLED' && current.status === 'PENDING') {
        // CANCEL TRANSFER: Rollback Reservation
        await InventoryService.cancelReservation(current.productId, current.originBranchId, current.quantityMoved, tx);

        updatedMovement = await tx.productBranchMovement.update({
          where: { id },
          data: {
            ...data,
            status: 'CANCELLED'
          }
        });
      } else {
        // Standard metadata update
        updatedMovement = await tx.productBranchMovement.update({
          where: { id },
          data
        });
      }

      return updatedMovement;
    });

    // Background processing
    setImmediate(async () => {
      try {
        await redis.del(`${CACHE_PREFIX}${id}`);
        await redis.deleteKeysByPrefix(`${CACHE_PREFIX}list:`);
        await redis.deleteKeysByPrefix('products:');
        await redis.deleteKeysByPrefix('branch_office_products:');
      } catch (e) {
        console.error('[MovementService] Update background error:', e);
      }
    });

    return result;
  }

  static async delete(id: string) {
    const current = await prisma.productBranchMovement.findUnique({ where: { id } });
    if (!current) return;

    await prisma.$transaction(async (tx) => {
      if (current.status === 'PENDING') {
        // Restore stock if deleting a pending transfer
        await InventoryService.cancelReservation(current.productId, current.originBranchId, current.quantityMoved, tx);
      }
      await tx.productBranchMovement.delete({ where: { id } });
    });

    setImmediate(async () => {
      try {
        await redis.del(`${CACHE_PREFIX}${id}`);
        await redis.deleteKeysByPrefix(`${CACHE_PREFIX}list:`);
      } catch (e) {
        console.error('[MovementService] Delete background error:', e);
      }
    });
  }
}
