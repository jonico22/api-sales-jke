import prisma from '@/config/prisma';
import {
  createExternalConsignmentSaleSchema,
  updateExternalConsignmentSaleSchema,
  filterExternalConsignmentSaleSchema,
} from './externalConsignmentSale.validation';
import { z } from 'zod';
import { redis } from '@/config/redis';
import {
  PaginatedResult,
  getPrismaPaginationParams,
  buildPaginatedResult,
  PaginationQuery,
} from '@/utils/pagination';
import { ExternalConsignmentSale } from '@prisma/client';

type CreateInput = z.infer<typeof createExternalConsignmentSaleSchema>;
type UpdateInput = z.infer<typeof updateExternalConsignmentSaleSchema>;
type Filters = z.infer<typeof filterExternalConsignmentSaleSchema>['query'];

const CACHE_PREFIX = 'externalSales:';
const CACHE_TTL_LIST = 300; // 5 minutos
const CACHE_TTL_SINGLE = 600; // 10 minutos

export const createExternalConsignmentSale = async (input: CreateInput) => {
  // Logic: Calculate netTotal
  // netTotal = reportedSalePrice - (totalCommissionAmount || 0)
  const netTotal = input.netTotal ?? (input.reportedSalePrice - (input.totalCommissionAmount || 0));

  const data = {
    ...input,
    netTotal,
  };

  const created = await prisma.externalConsignmentSale.create({ data });

  // Invalidate List Cache
  await redis.deleteKeysByPrefix(`${CACHE_PREFIX}list:`);

  return created;
};

export const updateExternalConsignmentSale = async (id: string, input: UpdateInput) => {
  // If prices update, we re-calculate netTotal IF not provided explicitly
  // But for partial updates it's tricky. 
  // Simplified: If user provides cost/comm, likely should provide netTotal or we trust input.
  // For robustness, we could fetch existing, merge, then recalc.
  // Assuming frontend sends correct data for now or this is a simple update.

  const updated = await prisma.externalConsignmentSale.update({ where: { id }, data: input });

  // Invalidate Cache
  await redis.del(`${CACHE_PREFIX}${id}`);
  await redis.deleteKeysByPrefix(`${CACHE_PREFIX}list:`);

  return updated;
};

export const deleteExternalConsignmentSale = async (id: string) => {
  const deleted = await prisma.externalConsignmentSale.delete({ where: { id } });

  // Invalidate Cache
  await redis.del(`${CACHE_PREFIX}${id}`);
  await redis.deleteKeysByPrefix(`${CACHE_PREFIX}list:`);

  return deleted;
};

export const getExternalConsignmentSaleById = async (id: string) => {
  const cacheKey = `${CACHE_PREFIX}${id}`;

  // Try Cache
  const cached = await redis.get<ExternalConsignmentSale>(cacheKey);
  if (cached) return cached;

  const item = await prisma.externalConsignmentSale.findUnique({
    where: { id },
    include: {
      deliveredConsignment: {
        include: {
          product: true
        }
      },
    },
  });

  if (item) await redis.set(cacheKey, item, CACHE_TTL_SINGLE);

  return item;
};

export const getAllExternalConsignmentSales = async (
  paginationQuery?: PaginationQuery,
  filters?: Filters
): Promise<PaginatedResult<ExternalConsignmentSale>> => {
  const page = paginationQuery?.page ?? 1;
  const limit = paginationQuery?.limit ?? 10;
  const sortBy = paginationQuery?.sortBy ?? 'createdAt';
  const sortOrder = paginationQuery?.sortOrder ?? 'desc';

  // Cache Key
  const cacheKeyParts = [
    CACHE_PREFIX,
    'list',
    filters?.deliveredConsignmentId || 'all',
    filters?.reportedSaleDateFrom?.toISOString() || 'all',
    filters?.reportedSaleDateTo?.toISOString() || 'all',
    page,
    limit,
    sortBy,
    sortOrder
  ];
  const cacheKey = cacheKeyParts.join(':');

  // 1. Try Cache
  const cached = await redis.get<PaginatedResult<ExternalConsignmentSale>>(cacheKey);
  if (cached) return cached;

  // 2. Database Query
  const prismaParams = getPrismaPaginationParams(page, limit, sortBy, sortOrder);

  const where: any = {};
  if (filters?.deliveredConsignmentId) where.deliveredConsignmentId = filters.deliveredConsignmentId;

  if (filters?.reportedSaleDateFrom || filters?.reportedSaleDateTo) {
    where.reportedSaleDate = {};
    if (filters.reportedSaleDateFrom) where.reportedSaleDate.gte = filters.reportedSaleDateFrom;
    if (filters.reportedSaleDateTo) where.reportedSaleDate.lte = filters.reportedSaleDateTo;
  }

  if (filters?.minSalePrice !== undefined || filters?.maxSalePrice !== undefined) {
    where.reportedSalePrice = {};
    if (filters.minSalePrice !== undefined) where.reportedSalePrice.gte = filters.minSalePrice;
    if (filters.maxSalePrice !== undefined) where.reportedSalePrice.lte = filters.maxSalePrice;
  }

  const [data, total] = await prisma.$transaction([
    prisma.externalConsignmentSale.findMany({
      where,
      skip: prismaParams.skip,
      take: prismaParams.take,
      orderBy: prismaParams.orderBy ?? { createdAt: sortOrder },
      include: {
        deliveredConsignment: {
          include: {
            product: { select: { id: true, name: true, code: true } }
          }
        }
      },
    }),
    prisma.externalConsignmentSale.count({ where }),
  ]);

  const result = buildPaginatedResult(data, page, limit, total);

  // 3. Set Cache
  await redis.set(cacheKey, result, CACHE_TTL_LIST);

  return result;
};
