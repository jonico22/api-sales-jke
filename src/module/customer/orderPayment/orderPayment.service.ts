
import prisma from '@/config/prisma';
import { redis } from '@/config/redis';
import { PaymentStatus } from '@prisma/client';
import {
  PaginatedResult,
  getPrismaPaginationParams,
  buildPaginatedResult,
  PaginationQuery
} from '@/utils/pagination';
import { convertLimaDateRangeToUTC, formatToLimaTime, toLimaTimezone } from '@/utils/dateFormatter';
import { CashShiftService } from '../cashShift/cashShift.service';
import { CreateOrderPaymentInput, PaymentFilters } from './orderPayment.schema';
import { NotFoundAppError } from '@/utils/domain-errors';

const CACHE_PREFIX = 'order_payments:';
const CACHE_TTL_LIST = 300; // 5 min

export const OrderPaymentService = {
  create: async (data: CreateOrderPaymentInput) => {
    // ─── 1. PARALLEL: Resolve & Validate Entities ─────────────────────
    const [societyResult, currencyResult, orderResult] = await Promise.all([
      // Society (ID or Code)
      (async () => {
        let society = await prisma.society.findUnique({ where: { id: data.societyId } });
        if (!society) society = await prisma.society.findUnique({ where: { code: data.societyId } });
        if (!society) {
          throw new NotFoundAppError(`Sociedad no encontrada (ID/Code: ${data.societyId})`, {
            societyIdOrCode: data.societyId,
          });
        }
        return society;
      })(),
      // Currency (ID or Code)
      (async () => {
        let currency = await prisma.currency.findUnique({ where: { id: data.currencyId } });
        if (!currency) currency = await prisma.currency.findUnique({ where: { code: data.currencyId } });
        if (!currency) {
          throw new NotFoundAppError(`Moneda no encontrada (ID/Code: ${data.currencyId})`, {
            currencyIdOrCode: data.currencyId,
          });
        }
        return currency;
      })(),
      // Order (Optional, ID or Code)
      (async () => {
        if (!data.orderId) return null;
        let order = await prisma.order.findUnique({ where: { id: data.orderId } });
        if (!order) order = await prisma.order.findUnique({ where: { orderCode: data.orderId } });
        if (!order) {
          throw new NotFoundAppError(`Pedido no encontrado (ID/Code: ${data.orderId})`, {
            orderIdOrCode: data.orderId,
          });
        }
        return order;
      })()
    ]);

    // ─── 2. Crear el pago ─────────────────────────────────────────────
    const finalData = {
      ...data,
      societyId: societyResult.id,
      currencyId: currencyResult.id,
      orderId: orderResult?.id || undefined,
      status: data.status || PaymentStatus.PENDING,
      paymentDate: data.paymentDate ? toLimaTimezone(data.paymentDate) : toLimaTimezone(new Date())
    };

    const created = await prisma.orderPayment.create({
      data: finalData
    });

    // ─── 3. BACKGROUND: Cache + CashShift (fire-and-forget) ──────────
    const resolvedSocietyId = societyResult.id;
    const resolvedOrderId = created.orderId;
    const createdBy = data.createdBy;

    setImmediate(async () => {
      try {
        // A. Invalidar cache
        await redis.deleteKeysByPrefix(`${CACHE_PREFIX}list:`);

        if (resolvedOrderId) {
          await redis.del(`orders:${resolvedOrderId}`);

          // B. [INTEGRATION] Cash Shift - Automatic Registration
          const order = await prisma.order.findUnique({
            where: { id: resolvedOrderId },
            select: { branchId: true }
          });

          if (order && order.branchId && createdBy) {
            await CashShiftService.registerPaymentMovement(
              created,
              createdBy,
              order.branchId,
              resolvedSocietyId
            );
          }
        }
      } catch (error) {
        console.error('[OrderPayment] ❌ Error en procesamiento background (create):', error);
      }
    });

    return created;
  },

  getAll: async (
    paginationQuery?: PaginationQuery,
    filters?: PaymentFilters
  ): Promise<PaginatedResult<any>> => {
    const page = paginationQuery?.page ?? 1;
    const limit = paginationQuery?.limit ?? 10;
    const sortBy = paginationQuery?.sortBy ?? 'createdAt';
    const sortOrder = paginationQuery?.sortOrder ?? 'desc';

    // Cache Key
    const cacheKeyParts = [
      CACHE_PREFIX,
      'list',
      filters?.societyId || 'all',
      filters?.orderId || 'all',
      filters?.status || 'all',
      filters?.paymentMethod || 'all',
      filters?.search || 'all',
      filters?.dateFrom || 'all',
      filters?.dateTo || 'all',
      filters?.createdBy || 'all',
      filters?.amountFrom || 'all',
      filters?.amountTo || 'all',
      page, limit, sortBy, sortOrder
    ];
    const cacheKey = cacheKeyParts.join(':');

    // 1. Check Cache
    const cached = await redis.get<PaginatedResult<any>>(cacheKey);
    if (cached) return cached;

    const prismaParams = getPrismaPaginationParams(page, limit, sortBy, sortOrder);
    const whereClause: any = {};

    if (filters?.societyId) whereClause.societyId = filters.societyId;
    if (filters?.orderId) whereClause.orderId = filters.orderId;
    if (filters?.status) whereClause.status = filters.status;
    if (filters?.paymentMethod) whereClause.paymentMethod = filters.paymentMethod;
    if (filters?.createdBy) whereClause.createdBy = filters.createdBy;

    if (filters?.search) {
      whereClause.OR = [
        { referenceCode: { contains: filters.search, mode: 'insensitive' } },
        { notes: { contains: filters.search, mode: 'insensitive' } }
      ];
    }

    // Fechas
    if (filters?.dateFrom || filters?.dateTo) {
      whereClause.paymentDate = {};
      const dateRange = convertLimaDateRangeToUTC(filters.dateFrom, filters.dateTo);
      if (dateRange.from) whereClause.paymentDate.gte = dateRange.from;
      if (dateRange.to) whereClause.paymentDate.lte = dateRange.to;
    }

    // Amount Range
    if (filters?.amountFrom || filters?.amountTo) {
      whereClause.amount = {};
      if (filters.amountFrom) whereClause.amount.gte = filters.amountFrom;
      if (filters.amountTo) whereClause.amount.lte = filters.amountTo;
    }

    // 2. Query
    const [data, total] = await prisma.$transaction([
      prisma.orderPayment.findMany({
        where: whereClause,
        include: {
          currency: true,
          order: { select: { orderCode: true, totalAmount: true } },
          image: true
        },
        skip: prismaParams.skip,
        take: prismaParams.take,
        orderBy: prismaParams.orderBy
      }),
      prisma.orderPayment.count({ where: whereClause })
    ]);

    // 3. Format & Cache
    const formattedData = data.map(item => ({
      ...item,
      paymentDate: formatToLimaTime(item.paymentDate),
      createdAt: formatToLimaTime(item.createdAt),
      updatedAt: formatToLimaTime(item.updatedAt),
    }));

    const result = buildPaginatedResult(formattedData, page, limit, total);
    await redis.set(cacheKey, result, CACHE_TTL_LIST);

    return result;
  },

  findById: async (id: string) => {
    return prisma.orderPayment.findUnique({
      where: { id },
      include: {
        currency: true,
        order: true,
        image: true
      },
    })
  },

  update: async (id: string, data: any) => {
    const updated = await prisma.orderPayment.update({ where: { id }, data: { ...data } });

    // Invalidar cache
    await redis.deleteKeysByPrefix(`${CACHE_PREFIX}list:`);
    if (updated.orderId) {
      await redis.del(`orders:${updated.orderId}`);
    }

    return updated;
  },

  delete: async (id: string) => {
    const deleted = await prisma.orderPayment.delete({ where: { id } });

    await redis.deleteKeysByPrefix(`${CACHE_PREFIX}list:`);
    if (deleted.orderId) {
      await redis.del(`orders:${deleted.orderId}`);
    }

    return deleted;
  },
};
