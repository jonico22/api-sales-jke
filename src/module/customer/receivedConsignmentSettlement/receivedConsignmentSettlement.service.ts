import prisma from '@/config/prisma';
import {
  createReceivedConsignmentSettlementSchema,
  updateReceivedConsignmentSettlementSchema,
  filterReceivedConsignmentSettlementSchema,
} from './receivedConsignmentSettlement.validation';
import { z } from 'zod';
import { redis } from '@/config/redis';
import {
  PaginatedResult,
  getPrismaPaginationParams,
  buildPaginatedResult,
  PaginationQuery,
} from '@/utils/pagination';
import { ReceivedConsignmentSettlement } from '@prisma/client';

type CreateInput = z.infer<typeof createReceivedConsignmentSettlementSchema>;
type UpdateInput = z.infer<typeof updateReceivedConsignmentSettlementSchema>;
type Filters = z.infer<typeof filterReceivedConsignmentSettlementSchema>['query'];

const CACHE_PREFIX = 'settlements:';
const CACHE_TTL_LIST = 300; // 5 minutos
const CACHE_TTL_SINGLE = 600; // 10 minutos

export const createReceivedConsignmentSettlement = async (input: CreateInput) => {
  const data = input;
  const created = await prisma.receivedConsignmentSettlement.create({ data });

  // Invalidate List Cache
  await redis.deleteKeysByPrefix(`${CACHE_PREFIX}list:`);

  return created;
};

export const updateReceivedConsignmentSettlement = async (id: string, input: UpdateInput) => {
  const updated = await prisma.receivedConsignmentSettlement.update({ where: { id }, data: input });

  // Invalidate Cache
  await redis.del(`${CACHE_PREFIX}${id}`);
  await redis.deleteKeysByPrefix(`${CACHE_PREFIX}list:`);

  return updated;
};

export const deleteReceivedConsignmentSettlement = async (id: string) => {
  const deleted = await prisma.receivedConsignmentSettlement.delete({ where: { id } });

  // Invalidate Cache
  await redis.del(`${CACHE_PREFIX}${id}`);
  await redis.deleteKeysByPrefix(`${CACHE_PREFIX}list:`);

  return deleted;
};

export const getReceivedConsignmentSettlementById = async (id: string) => {
  const cacheKey = `${CACHE_PREFIX}${id}`;

  // Try Cache
  const cached = await redis.get<ReceivedConsignmentSettlement>(cacheKey);
  if (cached) return cached;

  const item = await prisma.receivedConsignmentSettlement.findUnique({
    where: { id },
    include: {
      outgoingAgreement: { select: { id: true, agreementCode: true } },
      orderPayment: true,
      currency: true,
    },
  });

  if (item) await redis.set(cacheKey, item, CACHE_TTL_SINGLE);

  return item;
};

export const getAllReceivedConsignmentSettlements = async (
  paginationQuery?: PaginationQuery,
  filters?: Filters
): Promise<PaginatedResult<ReceivedConsignmentSettlement>> => {
  const page = paginationQuery?.page ?? 1;
  const limit = paginationQuery?.limit ?? 10;
  const sortBy = paginationQuery?.sortBy || 'createdAt';
  const sortOrder = paginationQuery?.sortOrder || 'desc';

  // Resolve societyId from filters
  let resolvedSocietyId = filters?.societyId;
  const societyCode = filters?.societyCode || filters?.societyId;

  if (!resolvedSocietyId && societyCode) {
    const isUuid = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(societyCode);
    if (isUuid) {
      resolvedSocietyId = societyCode;
    } else {
      const society = await prisma.society.findUnique({ where: { code: societyCode } });
      if (society) {
        resolvedSocietyId = society.id;
      } else {
        return buildPaginatedResult([], page, limit, 0);
      }
    }
  }

  // Cache Key
  const cacheKeyParts = [
    CACHE_PREFIX,
    'list',
    resolvedSocietyId || 'all',
    filters?.status || 'all',
    filters?.settlementDateFrom?.toISOString() || 'all',
    filters?.settlementDateTo?.toISOString() || 'all',
    page,
    limit,
    sortBy,
    sortOrder
  ];
  const cacheKey = cacheKeyParts.join(':');

  // 1. Try Cache
  const cached = await redis.get<PaginatedResult<ReceivedConsignmentSettlement>>(cacheKey);
  if (cached) return cached;

  // 2. Database Query
  const prismaParams = getPrismaPaginationParams(page, limit, sortBy, sortOrder);

  const where: any = {};
  if (resolvedSocietyId) where.outgoingAgreement = { societyId: resolvedSocietyId };
  if (filters?.outgoingAgreementId) where.outgoingAgreementId = filters.outgoingAgreementId;
  if (filters?.status) where.status = filters.status;

  if (filters?.settlementDateFrom || filters?.settlementDateTo) {
    where.settlementDate = {};
    if (filters.settlementDateFrom) where.settlementDate.gte = filters.settlementDateFrom;
    if (filters.settlementDateTo) where.settlementDate.lte = filters.settlementDateTo;
  }

  const [data, total] = await prisma.$transaction([
    prisma.receivedConsignmentSettlement.findMany({
      where,
      skip: prismaParams.skip,
      take: prismaParams.take,
      orderBy: prismaParams.orderBy ?? { createdAt: sortOrder },
      include: {
        outgoingAgreement: { select: { id: true, agreementCode: true } },
        currency: true,
      },
    }),
    prisma.receivedConsignmentSettlement.count({ where }),
  ]);

  const result = buildPaginatedResult(data, page, limit, total);

  // 3. Set Cache
  await redis.set(cacheKey, result, CACHE_TTL_LIST);

  return result;
};
