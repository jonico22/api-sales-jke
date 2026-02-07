import prisma from '@/config/prisma';
import { redis } from '@/config/redis';
import { PaymentStatus } from '@prisma/client';
import {
  PaginatedResult,
  getPrismaPaginationParams,
  buildPaginatedResult,
} from '@/utils/pagination';
import { convertLimaDateRangeToUTC, formatToLimaTime } from '@/utils/dateFormatter';
import { CashShiftService } from '../cashShift/cashShift.service';

const CACHE_PREFIX = 'order_payments:';
const CACHE_TTL_LIST = 300; // 5 min

export const orderPaymentService = {
  create: async (data: any) => {
    // Si el pago CONFIRMS la orden, actualizar el estado de la Orden (lógica de negocio futura)

    const created = await prisma.orderPayment.create({
      data: {
        ...data,
        status: data.status || 'PENDING'
      }
    });

    // Invalidar cache
    await redis.deleteKeysByPrefix(`${CACHE_PREFIX}list:`);
    if (created.orderId) {
      await redis.del(`orders:${created.orderId}`); // Invalidar orden también

      // [INTEGRATION] Cash Shift - Automatic Registration
      // "If a box was registered... otherwise don't ask"
      try {
        const order = await prisma.order.findUnique({
          where: { id: created.orderId },
          select: { branchId: true }
        });

        if (order && order.branchId && data.createdBy) {
          await CashShiftService.registerPaymentMovement(
            created,
            data.createdBy,
            order.branchId,
            data.societyId
          );
        }
      } catch (error) {
        // Graceful degradation: If cash logic fails (e.g. db error implies no critical block for sale)
        // Or if we want strictness, we'd throw.
        // User asked: "sino no le debe pedir" -> Non-blocking.
        console.error('Error auto-registering cash movement:', error);
      }
    }

    return created;
  },

  findAll: async (filters: any = {}): Promise<PaginatedResult<any>> => {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 10;
    const sortBy = filters.sortBy ?? 'createdAt';
    const sortOrder = filters.sortOrder ?? 'desc';

    // Cache Key
    const cacheKeyParts = [
      CACHE_PREFIX,
      'list',
      filters.societyId || 'all',
      filters.orderId || 'all',
      filters.status || 'all',
      filters.paymentMethod || 'all',
      filters.search || 'all',
      filters.dateFrom || 'all',
      filters.dateTo || 'all',
      page, limit, sortBy, sortOrder
    ];
    const cacheKey = cacheKeyParts.join(':');

    // 1. Check Cache
    const cached = await redis.get<PaginatedResult<any>>(cacheKey);
    if (cached) return cached;

    const prismaParams = getPrismaPaginationParams(page, limit, sortBy, sortOrder);
    const whereClause: any = {};

    if (filters.societyId) whereClause.societyId = filters.societyId;
    if (filters.orderId) whereClause.orderId = filters.orderId;
    if (filters.status) whereClause.status = filters.status;
    if (filters.paymentMethod) whereClause.paymentMethod = filters.paymentMethod;

    if (filters.search) {
      whereClause.OR = [
        { referenceCode: { contains: filters.search, mode: 'insensitive' } },
        { notes: { contains: filters.search, mode: 'insensitive' } }
      ];
    }

    // Fechas
    if (filters.dateFrom || filters.dateTo) {
      whereClause.paymentDate = {};
      const dateRange = convertLimaDateRangeToUTC(filters.dateFrom, filters.dateTo);
      if (dateRange.from) whereClause.paymentDate.gte = dateRange.from;
      if (dateRange.to) whereClause.paymentDate.lte = dateRange.to;
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
