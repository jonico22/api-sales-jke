import prisma from '@/config/prisma';
import {
  createOutgoingConsignmentAgreementSchema,
  updateOutgoingConsignmentAgreementSchema,
  filterOutgoingConsignmentAgreementSchema,
} from './outgoingConsignmentAgreement.validation';
import { z } from 'zod';
import { redis } from '@/config/redis';
import {
  PaginatedResult,
  getPrismaPaginationParams,
  buildPaginatedResult,
  PaginationQuery,
} from '@/utils/pagination';
import { OutgoingConsignmentAgreement } from '@prisma/client';

type CreateAgreementInput = z.infer<typeof createOutgoingConsignmentAgreementSchema>;
type UpdateAgreementInput = z.infer<typeof updateOutgoingConsignmentAgreementSchema>;
type AgreementFilters = z.infer<typeof filterOutgoingConsignmentAgreementSchema>['query'];

const CACHE_PREFIX = 'outgoingConsignments:';
const CACHE_TTL_LIST = 300; // 5 minutos
const CACHE_TTL_SINGLE = 600; // 10 minutos

export const createAgreement = async (input: CreateAgreementInput) => {
  const created = await prisma.outgoingConsignmentAgreement.create({ data: input });

  // Invalidate List Cache
  await redis.deleteKeysByPrefix(`${CACHE_PREFIX}list:`);

  return created;
};

export const updateAgreement = async (id: string, input: UpdateAgreementInput) => {
  const updated = await prisma.outgoingConsignmentAgreement.update({ where: { id }, data: input });

  // Invalidate Cache
  await redis.del(`${CACHE_PREFIX}${id}`);
  await redis.deleteKeysByPrefix(`${CACHE_PREFIX}list:`);

  return updated;
};

export const deleteAgreement = async (id: string) => {
  const deleted = await prisma.outgoingConsignmentAgreement.delete({ where: { id } });

  // Invalidate Cache
  await redis.del(`${CACHE_PREFIX}${id}`);
  await redis.deleteKeysByPrefix(`${CACHE_PREFIX}list:`);

  return deleted;
};

export const getAgreementById = async (id: string) => {
  const cacheKey = `${CACHE_PREFIX}${id}`;

  // Try Cache
  const cached = await redis.get<OutgoingConsignmentAgreement>(cacheKey);
  if (cached) return cached;

  const agreement = await prisma.outgoingConsignmentAgreement.findUnique({
    where: { id },
    include: {
      society: true,
      branch: true,
      partner: true,
      currency: true,
    },
  });

  if (agreement) await redis.set(cacheKey, agreement, CACHE_TTL_SINGLE);

  return agreement;
};

export const getAllAgreements = async (
  paginationQuery?: PaginationQuery,
  filters?: AgreementFilters
): Promise<PaginatedResult<OutgoingConsignmentAgreement>> => {
  const page = paginationQuery?.page ?? 1;
  const limit = paginationQuery?.limit ?? 10;
  const sortBy = paginationQuery?.sortBy ?? 'createdAt';
  const sortOrder = paginationQuery?.sortOrder ?? 'desc';

  // Cache Key
  const cacheKeyParts = [
    CACHE_PREFIX,
    'list',
    filters?.societyId || 'all',
    filters?.branchId || 'all',
    filters?.partnerId || 'all',
    filters?.status || 'all',
    filters?.search || 'all',
    page,
    limit,
    sortBy,
    sortOrder
  ];
  const cacheKey = cacheKeyParts.join(':');

  // 1. Try Cache
  const cached = await redis.get<PaginatedResult<OutgoingConsignmentAgreement>>(cacheKey);
  if (cached) return cached;

  // 2. Database Query
  const prismaParams = getPrismaPaginationParams(page, limit, sortBy, sortOrder);

  const where: any = {};
  if (filters?.societyId) where.societyId = filters.societyId;
  if (filters?.branchId) where.branchId = filters.branchId;
  if (filters?.partnerId) where.partnerId = filters.partnerId;
  if (filters?.status) where.status = filters.status;

  if (filters?.search) {
    where.OR = [
      { agreementCode: { contains: filters.search, mode: 'insensitive' } },
      { notes: { contains: filters.search, mode: 'insensitive' } },
    ];
  }

  const [data, total] = await prisma.$transaction([
    prisma.outgoingConsignmentAgreement.findMany({
      where,
      skip: prismaParams.skip,
      take: prismaParams.take,
      orderBy: prismaParams.orderBy ?? { createdAt: sortOrder },
      include: {
        society: { select: { id: true, name: true } },
        branch: { select: { id: true, name: true } },
        partner: { select: { id: true, firstName: true, lastName: true, companyName: true } },
        currency: true,
      },
    }),
    prisma.outgoingConsignmentAgreement.count({ where }),
  ]);

  const result = buildPaginatedResult(data, page, limit, total);

  // 3. Set Cache
  await redis.set(cacheKey, result, CACHE_TTL_LIST);

  return result;
};
