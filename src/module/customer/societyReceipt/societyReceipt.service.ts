import prisma from '@/config/prisma';
import { redis } from '@/config/redis';
import { SocietyReceipt, ReceiptStatus } from '@prisma/client';
import {
  PaginatedResult,
  getPrismaPaginationParams,
  buildPaginatedResult,
  PaginationQuery,
} from '@/utils/pagination';
import { formatToLimaTime, convertLimaDateRangeToUTC } from '@/utils/dateFormatter';
import { societyReceiptSchema, updateSocietyReceiptSchema } from './societyReceipt.validation';

// Cache Constants
const CACHE_PREFIX = 'society_receipts:';
const CACHE_TTL_LIST = 300; // 5 min
const CACHE_TTL_SINGLE = 600; // 10 min

export interface SocietyReceiptFilters {
  search?: string;
  societyId?: string;
  receiptTypeId?: string;
  status?: ReceiptStatus;
  dateFrom?: string;
  dateTo?: string;
}

export const createSocietyReceipt = async (data: any) => {
  const validated = societyReceiptSchema.parse(data);
  const created = await prisma.societyReceipt.create({
    data: validated,
    include: {
      currency: true,
      tax: true,
      receiptType: true,
      orderPayment: true,
      file: true,
    }
  });

  // Invalidate Cache
  await redis.deleteKeysByPrefix(`${CACHE_PREFIX}list:`);
  return created;
}

export const getAllSocietyReceipts = async (
  paginationQuery?: PaginationQuery,
  filters?: SocietyReceiptFilters
): Promise<PaginatedResult<SocietyReceipt>> => {
  const page = paginationQuery?.page ?? 1;
  const limit = paginationQuery?.limit ?? 10;
  const sortBy = paginationQuery?.sortBy ?? 'createdAt';
  const sortOrder = paginationQuery?.sortOrder ?? 'desc';

  // Cache Key
  const cacheKeyParts = [
    CACHE_PREFIX,
    'list',
    filters?.societyId || 'all',
    filters?.receiptTypeId || 'all',
    filters?.status || 'all',
    filters?.search || 'all',
    filters?.dateFrom || 'all',
    filters?.dateTo || 'all',
    page,
    limit,
    sortBy,
    sortOrder
  ];
  const cacheKey = cacheKeyParts.join(':');

  // 1. Try Cache
  const cached = await redis.get<PaginatedResult<SocietyReceipt>>(cacheKey);
  if (cached) return cached;

  // 2. Build Query
  const prismaParams = getPrismaPaginationParams(page, limit, sortBy, sortOrder);
  const whereClause: any = {};

  if (filters?.societyId) whereClause.societyId = filters.societyId;
  if (filters?.receiptTypeId) whereClause.receiptTypeId = filters.receiptTypeId;
  if (filters?.status) whereClause.status = filters.status;

  if (filters?.search) {
    whereClause.OR = [
      { series: { contains: filters.search, mode: 'insensitive' } },
      { receiptNumber: { contains: filters.search, mode: 'insensitive' } },
    ];
  }

  if (filters?.dateFrom || filters?.dateTo) {
    whereClause.issueDate = {};
    const dateRange = convertLimaDateRangeToUTC(filters.dateFrom, filters.dateTo);
    if (dateRange.from) whereClause.issueDate.gte = dateRange.from;
    if (dateRange.to) whereClause.issueDate.lte = dateRange.to;
  }

  // 3. Execute
  const [data, total] = await prisma.$transaction([
    prisma.societyReceipt.findMany({
      where: whereClause,
      skip: prismaParams.skip,
      take: prismaParams.take,
      orderBy: prismaParams.orderBy ?? { createdAt: sortOrder },
      include: {
        currency: true,
        tax: true,
        receiptType: true,
        orderPayment: true,
        file: true,
      },
    }),
    prisma.societyReceipt.count({ where: whereClause }),
  ]);

  // Format Dates
  const formattedData = data.map(item => ({
    ...item,
    issueDate: formatToLimaTime(item.issueDate) as any,
    createdAt: formatToLimaTime(item.createdAt) as any,
    updatedAt: item.updatedAt ? formatToLimaTime(item.updatedAt) as any : item.updatedAt,
  }));

  const result = buildPaginatedResult(formattedData, page, limit, total);

  // 4. Set Cache
  await redis.set(cacheKey, result, CACHE_TTL_LIST);

  return result;
}

export const getSocietyReceiptById = async (id: string) => {
  const cacheKey = `${CACHE_PREFIX}${id}`;
  const cached = await redis.get<SocietyReceipt>(cacheKey);
  if (cached) return cached;

  const receipt = await prisma.societyReceipt.findUnique({
    where: { id },
    include: {
      currency: true,
      tax: true,
      receiptType: true,
      orderPayment: true,
      file: true,
    },
  });

  if (receipt) await redis.set(cacheKey, receipt, CACHE_TTL_SINGLE);
  return receipt;
}

export const updateSocietyReceipt = async (id: string, data: any) => {
  const validated = updateSocietyReceiptSchema.parse(data);
  const updated = await prisma.societyReceipt.update({
    where: { id },
    data: validated,
    include: {
      currency: true,
      tax: true,
      receiptType: true,
      orderPayment: true,
      file: true,
    },
  });

  // Invalidate Cache
  await redis.del(`${CACHE_PREFIX}${id}`);
  await redis.deleteKeysByPrefix(`${CACHE_PREFIX}list:`);

  return updated;
}

export const deleteSocietyReceipt = async (id: string) => {
  const deleted = await prisma.societyReceipt.delete({ where: { id } });

  // Invalidate Cache
  await redis.del(`${CACHE_PREFIX}${id}`);
  await redis.deleteKeysByPrefix(`${CACHE_PREFIX}list:`);

  return deleted;
}
