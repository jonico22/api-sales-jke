import prisma from '@/config/prisma';
import {
  createDeliveredConsignmentAgreementSchema,
  updateDeliveredConsignmentAgreementSchema,
  filterDeliveredConsignmentAgreementSchema,
} from './deliveredConsignmentAgreement.validation';
import { z } from 'zod';
import { redis } from '@/config/redis';
import {
  PaginatedResult,
  getPrismaPaginationParams,
  buildPaginatedResult,
  PaginationQuery,
} from '@/utils/pagination';
import { DeliveredConsignmentAgreement } from '@prisma/client';
import { DomainRuleAppError } from '@/utils/domain-errors';

type CreateInput = z.infer<typeof createDeliveredConsignmentAgreementSchema>;
type UpdateInput = z.infer<typeof updateDeliveredConsignmentAgreementSchema>;
type Filters = z.infer<typeof filterDeliveredConsignmentAgreementSchema>['query'];

const CACHE_PREFIX = 'deliveredConsignments:';
const CACHE_TTL_LIST = 300; // 5 minutos
const CACHE_TTL_SINGLE = 600; // 10 minutos
const UUID_REGEX = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

const resolveSocietyFilter = async (societyIdOrCode?: string) => {
  if (!societyIdOrCode) return undefined;
  if (UUID_REGEX.test(societyIdOrCode)) return societyIdOrCode;

  const society = await prisma.society.findUnique({ where: { code: societyIdOrCode } });
  return society?.id;
};

export const create = async (input: CreateInput) => {
  // Logic: Calculate totals if not provided
  const deliveredStock = input.deliveredStock;
  const costPrice = input.costPrice;
  const suggestedSalePrice = input.suggestedSalePrice;

  // Ensure totals are calculated
  const data = {
    ...input,
    remainingStock: input.remainingStock ?? deliveredStock,
    totalCost: input.totalCost ?? (deliveredStock * costPrice),
    totalValue: input.totalValue ?? (deliveredStock * suggestedSalePrice),
  };

  if (data.remainingStock > deliveredStock) {
    throw new DomainRuleAppError('El stock restante no puede ser mayor al stock entregado', {
      deliveredStock,
      remainingStock: data.remainingStock,
    });
  }

  const created = await prisma.deliveredConsignmentAgreement.create({ data });

  // Invalidate List Cache
  await redis.deleteKeysByPrefix(`${CACHE_PREFIX}list:`);

  return created;
};

export const update = async (id: string, input: UpdateInput) => {
  const existing = await prisma.deliveredConsignmentAgreement.findUnique({ where: { id } });
  if (!existing) {
    throw new DomainRuleAppError('Entrega en consignación no encontrada', { id });
  }

  const deliveredStock = input.deliveredStock ?? existing.deliveredStock;
  const remainingStock = input.remainingStock ?? existing.remainingStock ?? deliveredStock;
  const costPrice = input.costPrice ?? Number(existing.costPrice);
  const suggestedSalePrice = input.suggestedSalePrice ?? Number(existing.suggestedSalePrice);

  if (remainingStock > deliveredStock) {
    throw new DomainRuleAppError('El stock restante no puede ser mayor al stock entregado', {
      deliveredStock,
      remainingStock,
    });
  }

  const data = {
    ...input,
    totalCost: input.totalCost ?? (deliveredStock * costPrice),
    totalValue: input.totalValue ?? (deliveredStock * suggestedSalePrice),
    remainingStock,
  };

  const updated = await prisma.deliveredConsignmentAgreement.update({ where: { id }, data });

  // Invalidate Cache
  await redis.del(`${CACHE_PREFIX}${id}`);
  await redis.deleteKeysByPrefix(`${CACHE_PREFIX}list:`);

  return updated;
};

export const remove = async (id: string) => {
  const deleted = await prisma.deliveredConsignmentAgreement.delete({ where: { id } });

  // Invalidate Cache
  await redis.del(`${CACHE_PREFIX}${id}`);
  await redis.deleteKeysByPrefix(`${CACHE_PREFIX}list:`);

  return deleted;
};

export const getById = async (id: string) => {
  const cacheKey = `${CACHE_PREFIX}${id}`;

  // Try Cache
  const cached = await redis.get<DeliveredConsignmentAgreement>(cacheKey);
  if (cached) return cached;

  const item = await prisma.deliveredConsignmentAgreement.findUnique({
    where: { id },
    include: {
      consignmentAgreement: true,
      product: true,
      branch: true,
    },
  });

  if (item) await redis.set(cacheKey, item, CACHE_TTL_SINGLE);

  return item;
};

export const getAll = async (
  paginationQuery?: PaginationQuery,
  filters?: Filters
): Promise<PaginatedResult<DeliveredConsignmentAgreement>> => {
  const page = paginationQuery?.page ?? 1;
  const limit = paginationQuery?.limit ?? 10;
  const sortBy = paginationQuery?.sortBy || 'createdAt';
  const sortOrder = paginationQuery?.sortOrder || 'desc';

  // Resolve societyId from filters
  let resolvedSocietyId: string | undefined;
  const societyCode = filters?.societyCode || filters?.societyId;

  if (societyCode) {
    resolvedSocietyId = await resolveSocietyFilter(societyCode);
    if (!resolvedSocietyId) {
      return buildPaginatedResult([], page, limit, 0);
    }
  }

  // Cache Key
  const cacheKeyParts = [
    CACHE_PREFIX,
    'list',
    resolvedSocietyId || 'all',
    filters?.productId || 'all',
    filters?.branchId || 'all',
    filters?.status || 'all',
    filters?.deliveryDateFrom?.toISOString() || 'all',
    filters?.deliveryDateTo?.toISOString() || 'all',
    page,
    limit,
    sortBy,
    sortOrder
  ];
  const cacheKey = cacheKeyParts.join(':');

  // 1. Try Cache
  const cached = await redis.get<PaginatedResult<DeliveredConsignmentAgreement>>(cacheKey);
  if (cached) return cached;

  // 2. Database Query
  const prismaParams = getPrismaPaginationParams(page, limit, sortBy, sortOrder);

  const where: any = {};
  if (resolvedSocietyId) where.consignmentAgreement = { societyId: resolvedSocietyId };
  if (filters?.consignmentAgreementId) where.consignmentAgreementId = filters.consignmentAgreementId;
  if (filters?.productId) where.productId = filters.productId;
  if (filters?.branchId) where.branchId = filters.branchId;
  if (filters?.status) where.status = filters.status;

  if (filters?.deliveryDateFrom || filters?.deliveryDateTo) {
    where.deliveryDate = {};
    if (filters.deliveryDateFrom) where.deliveryDate.gte = filters.deliveryDateFrom;
    if (filters.deliveryDateTo) where.deliveryDate.lte = filters.deliveryDateTo;
  }

  const [data, total] = await prisma.$transaction([
    prisma.deliveredConsignmentAgreement.findMany({
      where,
      skip: prismaParams.skip,
      take: prismaParams.take,
      orderBy: prismaParams.orderBy ?? { createdAt: sortOrder },
      include: {
        consignmentAgreement: { select: { id: true, agreementCode: true } },
        product: { select: { id: true, name: true, code: true } },
        branch: { select: { id: true, name: true } },
      },
    }),
    prisma.deliveredConsignmentAgreement.count({ where }),
  ]);

  const result = buildPaginatedResult(data, page, limit, total);

  // 3. Set Cache
  await redis.set(cacheKey, result, CACHE_TTL_LIST);

  return result;
};
