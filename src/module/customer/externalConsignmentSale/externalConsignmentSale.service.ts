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
import { DomainRuleAppError, NotFoundAppError } from '@/utils/domain-errors';

type CreateInput = z.infer<typeof createExternalConsignmentSaleSchema>;
type UpdateInput = z.infer<typeof updateExternalConsignmentSaleSchema>;
type Filters = z.infer<typeof filterExternalConsignmentSaleSchema>['query'];

const CACHE_PREFIX = 'externalSales:';
const CACHE_TTL_LIST = 300; // 5 minutos
const CACHE_TTL_SINGLE = 600; // 10 minutos
const LIST_CACHE_PREFIX = `${CACHE_PREFIX}list:`;

const buildNextDeliveryStatus = (remainingStock: number) => (remainingStock === 0 ? 'sold_out' : 'active');

export const createExternalConsignmentSale = async (input: CreateInput) => {
  const created = await prisma.$transaction(async (tx) => {
    const delivered = await tx.deliveredConsignmentAgreement.findUnique({
      where: { id: input.deliveredConsignmentId },
      select: {
        id: true,
        deliveredStock: true,
      },
    });

    if (!delivered) {
      throw new NotFoundAppError('Entrega en consignación no encontrada', {
        deliveredConsignmentId: input.deliveredConsignmentId,
      });
    }

    const soldAggregate = await tx.externalConsignmentSale.aggregate({
      where: { deliveredConsignmentId: input.deliveredConsignmentId },
      _sum: { soldQuantity: true },
    });

    const soldQuantity = soldAggregate._sum.soldQuantity ?? 0;
    const availableStock = delivered.deliveredStock - soldQuantity;

    if (input.soldQuantity > availableStock) {
      throw new DomainRuleAppError('La venta excede el stock restante de la consignación', {
        availableStock,
        soldQuantity: input.soldQuantity,
        deliveredConsignmentId: input.deliveredConsignmentId,
      });
    }

    const netTotal = input.netTotal ?? (input.reportedSalePrice - (input.totalCommissionAmount || 0));
    const data = {
      ...input,
      netTotal,
    };

    const sale = await tx.externalConsignmentSale.create({ data });
    const remainingStock = availableStock - input.soldQuantity;

    await tx.deliveredConsignmentAgreement.update({
      where: { id: input.deliveredConsignmentId },
      data: {
        remainingStock,
        status: buildNextDeliveryStatus(remainingStock),
      },
    });

    return sale;
  });

  // Invalidate List Cache
  await redis.deleteKeysByPrefix(LIST_CACHE_PREFIX);

  return created;
};

export const updateExternalConsignmentSale = async (id: string, input: UpdateInput) => {
  const updated = await prisma.$transaction(async (tx) => {
    const existing = await tx.externalConsignmentSale.findUnique({
      where: { id },
      select: {
        id: true,
        deliveredConsignmentId: true,
        soldQuantity: true,
        reportedSalePrice: true,
        totalCommissionAmount: true,
        unitSalePrice: true,
        reportedSaleDate: true,
        remarks: true,
        documentReference: true,
        netTotal: true,
      },
    });

    if (!existing) {
      throw new NotFoundAppError('Venta externa no encontrada', { id });
    }

    const deliveredConsignmentId = input.deliveredConsignmentId ?? existing.deliveredConsignmentId;
    const delivered = await tx.deliveredConsignmentAgreement.findUnique({
      where: { id: deliveredConsignmentId },
      select: {
        id: true,
        deliveredStock: true,
      },
    });

    if (!delivered) {
      throw new NotFoundAppError('Entrega en consignación no encontrada', {
        deliveredConsignmentId,
      });
    }

    const soldAggregate = await tx.externalConsignmentSale.aggregate({
      where: { deliveredConsignmentId },
      _sum: { soldQuantity: true },
    });

    const totalSoldIncludingExisting = soldAggregate._sum.soldQuantity ?? 0;
    const soldExcludingExisting =
      deliveredConsignmentId === existing.deliveredConsignmentId
        ? totalSoldIncludingExisting - existing.soldQuantity
        : totalSoldIncludingExisting;

    const nextSoldQuantity = input.soldQuantity ?? existing.soldQuantity;
    const availableStock = delivered.deliveredStock - soldExcludingExisting;

    if (nextSoldQuantity > availableStock) {
      throw new DomainRuleAppError('La venta excede el stock restante de la consignación', {
        availableStock,
        soldQuantity: nextSoldQuantity,
        deliveredConsignmentId,
      });
    }

    const reportedSalePrice = input.reportedSalePrice ?? Number(existing.reportedSalePrice);
    const totalCommissionAmount =
      input.totalCommissionAmount ?? Number(existing.totalCommissionAmount ?? 0);

    const data = {
      ...input,
      netTotal: input.netTotal ?? (reportedSalePrice - totalCommissionAmount),
    };

    const sale = await tx.externalConsignmentSale.update({ where: { id }, data });
    const nextRemainingStock = availableStock - nextSoldQuantity;

    await tx.deliveredConsignmentAgreement.update({
      where: { id: deliveredConsignmentId },
      data: {
        remainingStock: nextRemainingStock,
        status: buildNextDeliveryStatus(nextRemainingStock),
      },
    });

    if (deliveredConsignmentId !== existing.deliveredConsignmentId) {
      const previousAggregate = await tx.externalConsignmentSale.aggregate({
        where: { deliveredConsignmentId: existing.deliveredConsignmentId },
        _sum: { soldQuantity: true },
      });
      const previousRemainingStock =
        (await tx.deliveredConsignmentAgreement.findUnique({
          where: { id: existing.deliveredConsignmentId },
          select: { deliveredStock: true },
        }))!.deliveredStock - (previousAggregate._sum.soldQuantity ?? 0);

      await tx.deliveredConsignmentAgreement.update({
        where: { id: existing.deliveredConsignmentId },
        data: {
          remainingStock: previousRemainingStock,
          status: buildNextDeliveryStatus(previousRemainingStock),
        },
      });
    }

    return sale;
  });

  // Invalidate Cache
  await redis.del(`${CACHE_PREFIX}${id}`);
  await redis.deleteKeysByPrefix(LIST_CACHE_PREFIX);

  return updated;
};

export const deleteExternalConsignmentSale = async (id: string) => {
  const deleted = await prisma.$transaction(async (tx) => {
    const existing = await tx.externalConsignmentSale.findUnique({
      where: { id },
      select: {
        id: true,
        deliveredConsignmentId: true,
      },
    });

    if (!existing) {
      throw new NotFoundAppError('Venta externa no encontrada', { id });
    }

    const deletedSale = await tx.externalConsignmentSale.delete({ where: { id } });
    const delivered = await tx.deliveredConsignmentAgreement.findUnique({
      where: { id: existing.deliveredConsignmentId },
      select: {
        deliveredStock: true,
      },
    });

    if (!delivered) {
      throw new NotFoundAppError('Entrega en consignación no encontrada', {
        deliveredConsignmentId: existing.deliveredConsignmentId,
      });
    }

    const soldAggregate = await tx.externalConsignmentSale.aggregate({
      where: { deliveredConsignmentId: existing.deliveredConsignmentId },
      _sum: { soldQuantity: true },
    });
    const remainingStock = delivered.deliveredStock - (soldAggregate._sum.soldQuantity ?? 0);

    await tx.deliveredConsignmentAgreement.update({
      where: { id: existing.deliveredConsignmentId },
      data: {
        remainingStock,
        status: buildNextDeliveryStatus(remainingStock),
      },
    });

    return deletedSale;
  });

  // Invalidate Cache
  await redis.del(`${CACHE_PREFIX}${id}`);
  await redis.deleteKeysByPrefix(LIST_CACHE_PREFIX);

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
    LIST_CACHE_PREFIX.slice(0, -1),
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
