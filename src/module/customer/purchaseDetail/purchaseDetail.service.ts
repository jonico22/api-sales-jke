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
import { convertLimaDateRangeToUTC } from '@/utils/dateFormatter';

type CreatePurchaseDetailInput = z.infer<typeof createPurchaseDetailSchema>;
type UpdatePurchaseDetailInput = z.infer<typeof updatePurchaseDetailSchema>;
type PurchaseDetailFilters = z.infer<typeof purchaseDetailFiltersSchema>['query'];

const CACHE_PREFIX = 'purchaseDetails:';
const CACHE_TTL_LIST = 300; // 5 minutos
const CACHE_TTL_SINGLE = 600; // 10 minutos

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
  const created = await prisma.purchaseDetail.create({
    data,
  })

  // Invalidate List Cache
  await redis.deleteKeysByPrefix(`${CACHE_PREFIX}list:`);

  return created;
}

export const updatePurchaseDetail = async (id: string, data: UpdatePurchaseDetailInput) => {
  const updated = await prisma.purchaseDetail.update({
    where: { id },
    data,
  })

  // Invalidate Cache
  await redis.del(`${CACHE_PREFIX}${id}`);
  await redis.deleteKeysByPrefix(`${CACHE_PREFIX}list:`);

  return updated;
}

export const deletePurchaseDetail = async (id: string) => {
  const deleted = await prisma.purchaseDetail.delete({
    where: { id },
  })

  // Invalidate Cache
  await redis.del(`${CACHE_PREFIX}${id}`);
  await redis.deleteKeysByPrefix(`${CACHE_PREFIX}list:`);

  return deleted;
}
