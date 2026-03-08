
import prisma from '@/config/prisma';
import { redis } from '@/config/redis';
import { CreateOrderItemInput, OrderItemFilters } from './orderItem.schema';
import {
  PaginatedResult,
  getPrismaPaginationParams,
  buildPaginatedResult,
  PaginationQuery,
} from '@/utils/pagination';
import { OrderItem } from '@prisma/client';

const CACHE_PREFIX = 'orderItems:';
const CACHE_TTL_LIST = 300;
const CACHE_TTL_SINGLE = 600;

export const OrderItemService = {
  /**
   * Create Order Item
   * NOTE: Usually OrderItems are created via OrderService, but standalone logic is here.
   */
  create: async (data: CreateOrderItemInput) => {
    const product = await prisma.product.findUnique({
      where: { id: data.productId }
    });

    if (!product) throw new Error(`Producto no encontrado: ${data.productId}`);

    const costPrice = Number(product.priceCost);
    const quantity = data.quantity;
    const unitPrice = Number(data.unitPrice);
    const discount = Number(data.discount || 0);

    const total = (unitPrice * quantity) - discount;
    // Assuming tax is calculated backwards from total or standard 18%
    const subtotal = total / 1.18;
    const taxAmount = total - subtotal;

    const newItem = await prisma.orderItem.create({
      data: {
        orderId: data.orderId,
        productId: data.productId,
        quantity: quantity,
        unitPrice: unitPrice,
        costPrice: costPrice,
        subtotal: subtotal, // Storing with high precision in DB
        discount: discount,
        taxAmount: taxAmount,
        total: total,
        comment: data.comment
      }
    });

    // ─── BACKGROUND: Cache Invalidation ────────────────────────────
    setImmediate(async () => {
      try {
        await redis.deleteKeysByPrefix(`${CACHE_PREFIX}list:`);
      } catch (e) {
        console.error('[OrderItemService] Error background (create):', e);
      }
    });

    return newItem;
  },

  /**
   * Get All with Pagination & Filters
   */
  getAll: async (
    paginationQuery?: PaginationQuery,
    filters?: OrderItemFilters
  ): Promise<PaginatedResult<OrderItem>> => {
    const page = paginationQuery?.page ?? 1;
    const limit = paginationQuery?.limit ?? 20;
    const sortBy = paginationQuery?.sortBy ?? 'id'; // OrderItem doesn't always have createdAt
    const sortOrder = paginationQuery?.sortOrder ?? 'desc';

    const cacheKey = [
      CACHE_PREFIX, 'list',
      filters?.orderId || 'all',
      filters?.productId || 'all',
      filters?.search || 'all',
      page, limit, sortBy, sortOrder
    ].join(':');

    const cached = await redis.get<PaginatedResult<OrderItem>>(cacheKey);
    if (cached) return cached;

    const prismaParams = getPrismaPaginationParams(page, limit, sortBy, sortOrder);
    const whereClause: any = {};

    if (filters?.orderId) whereClause.orderId = filters.orderId;
    if (filters?.productId) whereClause.productId = filters.productId;

    if (filters?.minQuantity || filters?.maxQuantity) {
      whereClause.quantity = {};
      if (filters.minQuantity) whereClause.quantity.gte = filters.minQuantity;
      if (filters.maxQuantity) whereClause.quantity.lte = filters.maxQuantity;
    }

    if (filters?.minTotal || filters?.maxTotal) {
      whereClause.total = {};
      if (filters.minTotal) whereClause.total.gte = filters.minTotal;
      if (filters.maxTotal) whereClause.total.lte = filters.maxTotal;
    }

    if (filters?.search) {
      whereClause.OR = [
        { comment: { contains: filters.search, mode: 'insensitive' } },
        { product: { name: { contains: filters.search, mode: 'insensitive' } } }
      ];
    }

    const [data, total] = await prisma.$transaction([
      prisma.orderItem.findMany({
        where: whereClause,
        include: {
          product: { select: { id: true, name: true, code: true } },
          order: { select: { id: true, orderCode: true } }
        },
        skip: prismaParams.skip,
        take: prismaParams.take,
        orderBy: prismaParams.orderBy,
      }),
      prisma.orderItem.count({ where: whereClause })
    ]);

    const result = buildPaginatedResult(data, page, limit, total);
    await redis.set(cacheKey, result, CACHE_TTL_LIST);

    return result;
  },

  getById: async (id: string) => {
    const cacheKey = `${CACHE_PREFIX}${id}`;
    const cached = await redis.get<OrderItem>(cacheKey);
    if (cached) return cached;

    const item = await prisma.orderItem.findUnique({
      where: { id },
      include: {
        order: { select: { id: true, orderCode: true, status: true, totalAmount: true } },
        product: { select: { id: true, name: true, code: true, price: true, imageId: true } },
      },
    });

    if (item) await redis.set(cacheKey, item, CACHE_TTL_SINGLE);
    return item;
  },

  update: async (id: string, data: any) => {
    const updated = await prisma.orderItem.update({ where: { id }, data: data });

    setImmediate(async () => {
      try {
        await Promise.all([
          redis.del(`${CACHE_PREFIX}${id}`),
          redis.deleteKeysByPrefix(`${CACHE_PREFIX}list:`)
        ]);
      } catch (e) {
        console.error('[OrderItemService] Error background (update):', e);
      }
    });

    return updated;
  },

  delete: async (id: string) => {
    const deleted = await prisma.orderItem.delete({ where: { id } });

    setImmediate(async () => {
      try {
        await Promise.all([
          redis.del(`${CACHE_PREFIX}${id}`),
          redis.deleteKeysByPrefix(`${CACHE_PREFIX}list:`)
        ]);
      } catch (e) {
        console.error('[OrderItemService] Error background (delete):', e);
      }
    });

    return deleted;
  },
};
