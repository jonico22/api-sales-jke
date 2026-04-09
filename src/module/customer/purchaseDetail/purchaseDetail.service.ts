import prisma from '@/config/prisma';
import { createPurchaseDetailSchema, updatePurchaseDetailSchema, purchaseDetailFiltersSchema } from './purchaseDetail.schema';
import { z } from 'zod';
import { redis } from '@/config/redis';
import {
  PaginatedResult,
  getPrismaPaginationParams,
  buildPaginatedResult,
  PaginationQuery,
} from '@/utils/pagination';
import { PurchaseDetail } from '@prisma/client';
import { ConflictAppError, NotFoundAppError } from '@/utils/domain-errors';

type CreatePurchaseDetailInput = z.infer<typeof createPurchaseDetailSchema>;
type UpdatePurchaseDetailInput = z.infer<typeof updatePurchaseDetailSchema>;
type PurchaseDetailFilters = z.infer<typeof purchaseDetailFiltersSchema>['query'];

const CACHE_PREFIX = 'purchaseDetails:';
const CACHE_TTL_LIST = 300; // 5 minutos
const CACHE_TTL_SINGLE = 600; // 10 minutos

const PURCHASE_CACHE_PREFIX = 'purchases:';
const PURCHASE_DASHBOARD_CACHE_KEYS = ['cash-flow'] as const;

const recalculatePurchaseTotals = async (tx: any, purchaseId: string) => {
  const aggregate = await tx.purchaseDetail.aggregate({
    where: { purchaseId },
    _sum: {
      subtotal: true,
      taxAmount: true,
      total: true,
    },
  });

  return tx.purchase.update({
    where: { id: purchaseId },
    data: {
      subTotal: Number(aggregate._sum.subtotal || 0),
      taxAmount: Number(aggregate._sum.taxAmount || 0),
      totalAmount: Number(aggregate._sum.total || 0),
      updatedAt: new Date(),
    },
  });
};

const ensureMutablePurchase = async (tx: any, purchaseId: string) => {
  const purchase = await tx.purchase.findUnique({
    where: { id: purchaseId },
    select: { id: true, societyId: true, status: true },
  });

  if (!purchase) {
    throw new NotFoundAppError('Compra no encontrada', { purchaseId });
  }

  if (purchase.status === 'COMPLETED') {
    throw new ConflictAppError('No se puede modificar el detalle de una compra completada', {
      purchaseId,
    });
  }

  return purchase;
};

const invalidatePurchaseDetailCaches = async (purchaseId?: string, purchaseDetailId?: string, societyId?: string) => {
  const cacheOperations = [
    redis.deleteKeysByPrefix(`${CACHE_PREFIX}list:`),
    redis.deleteKeysByPrefix(`${PURCHASE_CACHE_PREFIX}list:`),
  ];

  if (purchaseDetailId) {
    cacheOperations.unshift(redis.del(`${CACHE_PREFIX}${purchaseDetailId}`));
  }

  if (purchaseId) {
    cacheOperations.push(redis.del(`${PURCHASE_CACHE_PREFIX}${purchaseId}`));
  }

  if (societyId) {
    cacheOperations.push(
      ...PURCHASE_DASHBOARD_CACHE_KEYS.map(key => redis.deleteKeysByPrefix(`dashboard:${key}:${societyId}`))
    );
  }

  await Promise.all(cacheOperations);
};

export const getAllPurchaseDetails = async (
  paginationQuery?: PaginationQuery,
  filters?: PurchaseDetailFilters
): Promise<PaginatedResult<PurchaseDetail>> => {
  const page = paginationQuery?.page ?? 1;
  const limit = paginationQuery?.limit ?? 10;
  const sortBy = paginationQuery?.sortBy ?? 'createdAt';
  const sortOrder = paginationQuery?.sortOrder ?? 'desc';

  // Cache Key
  const cacheKeyParts = [
    CACHE_PREFIX,
    'list',
    filters?.purchaseId || 'all',
    filters?.productId || 'all',
    filters?.expirationDateFrom?.toISOString() || 'all',
    filters?.expirationDateTo?.toISOString() || 'all',
    page,
    limit,
    sortBy,
    sortOrder
  ];
  const cacheKey = cacheKeyParts.join(':');

  // 1. Try Cache
  const cached = await redis.get<PaginatedResult<PurchaseDetail>>(cacheKey);
  if (cached) return cached;

  // 2. Database Query
  const prismaParams = getPrismaPaginationParams(page, limit, sortBy, sortOrder);

  const whereClause: any = {
    ...(filters?.purchaseId && { purchaseId: filters.purchaseId }),
    ...(filters?.productId && { productId: filters.productId }),
  };

  if (filters?.expirationDateFrom || filters?.expirationDateTo) {
    whereClause.expirationDate = {};
    if (filters.expirationDateFrom) whereClause.expirationDate.gte = filters.expirationDateFrom;
    if (filters.expirationDateTo) whereClause.expirationDate.lte = filters.expirationDateTo;
  }

  const [data, total] = await prisma.$transaction([
    prisma.purchaseDetail.findMany({
      where: whereClause,
      skip: prismaParams.skip,
      take: prismaParams.take,
      orderBy: prismaParams.orderBy ?? { createdAt: sortOrder },
      include: {
        purchase: { select: { id: true, purchaseCode: true, purchaseDate: true } },
        product: { select: { id: true, name: true, code: true } },
      },
    }),
    prisma.purchaseDetail.count({ where: whereClause }),
  ]);

  const result = buildPaginatedResult(data, page, limit, total);

  // 3. Set Cache
  await redis.set(cacheKey, result, CACHE_TTL_LIST);

  return result;
}

export const getPurchaseDetailById = async (id: string) => {
  const cacheKey = `${CACHE_PREFIX}${id}`;

  // Try Cache
  const cached = await redis.get<PurchaseDetail>(cacheKey);
  if (cached) return cached;

  const purchaseDetail = await prisma.purchaseDetail.findUnique({
    where: { id },
    include: {
      purchase: true,
      product: true,
    },
  })

  if (purchaseDetail) await redis.set(cacheKey, purchaseDetail, CACHE_TTL_SINGLE);

  return purchaseDetail;
}

export const createPurchaseDetail = async (data: CreatePurchaseDetailInput) => {
  const { created, purchase } = await prisma.$transaction(async tx => {
    const purchase = await ensureMutablePurchase(tx, data.purchaseId);

    const created = await tx.purchaseDetail.create({
      data,
    });

    await recalculatePurchaseTotals(tx, data.purchaseId);

    return { created, purchase };
  });

  await invalidatePurchaseDetailCaches(data.purchaseId, undefined, purchase.societyId);

  return created;
}

export const updatePurchaseDetail = async (id: string, data: UpdatePurchaseDetailInput) => {
  const { updated, purchaseId, societyId } = await prisma.$transaction(async tx => {
    const existing = await tx.purchaseDetail.findUnique({
      where: { id },
      select: { id: true, purchaseId: true },
    });

    if (!existing) {
      throw new NotFoundAppError('Detalle de compra no encontrado', { purchaseDetailId: id });
    }

    const targetPurchaseId = data.purchaseId ?? existing.purchaseId;
    const purchase = await ensureMutablePurchase(tx, targetPurchaseId);

    const updated = await tx.purchaseDetail.update({
      where: { id },
      data,
    });

    if (existing.purchaseId !== targetPurchaseId) {
      await recalculatePurchaseTotals(tx, existing.purchaseId);
    }
    await recalculatePurchaseTotals(tx, targetPurchaseId);

    return { updated, purchaseId: targetPurchaseId, societyId: purchase.societyId };
  });

  await invalidatePurchaseDetailCaches(purchaseId, id, societyId);

  return updated;
}

export const deletePurchaseDetail = async (id: string) => {
  const { deleted, purchaseId, societyId } = await prisma.$transaction(async tx => {
    const existing = await tx.purchaseDetail.findUnique({
      where: { id },
      select: { id: true, purchaseId: true },
    });

    if (!existing) {
      throw new NotFoundAppError('Detalle de compra no encontrado', { purchaseDetailId: id });
    }

    const purchase = await ensureMutablePurchase(tx, existing.purchaseId);

    const deleted = await tx.purchaseDetail.delete({
      where: { id },
    });

    await recalculatePurchaseTotals(tx, existing.purchaseId);

    return { deleted, purchaseId: existing.purchaseId, societyId: purchase.societyId };
  });

  await invalidatePurchaseDetailCaches(purchaseId, id, societyId);

  return deleted;
}
