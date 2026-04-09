import prisma from '@/config/prisma';
import { convertLimaDateRangeToUTC } from '@/utils/dateFormatter';
import { PaginationQuery } from '@/utils/pagination';
import { CategoryFilters } from './category.schema';

export const CATEGORY_CACHE_PREFIX = 'categories';
export const CATEGORY_CACHE_TTL_LIST = 300;
export const CATEGORY_CACHE_TTL_SINGLE = 600;
export const CATEGORY_CACHE_TTL_SELECT = 900;

export const isUuid = (value: string) =>
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(value);

export const resolveCategorySocietyId = async (societyRef?: string) => {
  if (!societyRef) {
    return undefined;
  }

  if (isUuid(societyRef)) {
    return societyRef;
  }

  const society = await prisma.society.findUnique({
    where: { code: societyRef },
    select: { id: true },
  });

  return society?.id ?? null;
};

export const buildCategoryListCacheKey = (
  resolvedSocietyId: string | undefined,
  page: number,
  limit: number,
  sortBy: string,
  sortOrder: string,
  filters?: CategoryFilters
) =>
  [
    CATEGORY_CACHE_PREFIX,
    'list',
    resolvedSocietyId || 'all',
    filters?.isActive !== undefined ? filters.isActive : 'all',
    filters?.createdBy || 'all',
    filters?.createdAtFrom || 'all',
    filters?.createdAtTo || 'all',
    filters?.updatedAtFrom || 'all',
    filters?.updatedAtTo || 'all',
    filters?.search || 'all',
    page,
    limit,
    sortBy,
    sortOrder,
  ].join(':');

export const buildCategoryWhereClause = (
  resolvedSocietyId?: string,
  filters?: CategoryFilters
) => {
  const whereClause: any = { isDeleted: false };

  if (resolvedSocietyId) {
    whereClause.societyId = resolvedSocietyId;
  }

  if (filters?.search) {
    whereClause.OR = [
      { name: { contains: filters.search, mode: 'insensitive' } },
      { code: { contains: filters.search, mode: 'insensitive' } },
    ];
  }

  if (filters?.isActive !== undefined) {
    whereClause.isActive = filters.isActive;
  }

  if (filters?.createdBy) {
    whereClause.createdBy = filters.createdBy;
  }

  if (filters?.createdAtFrom || filters?.createdAtTo) {
    whereClause.createdAt = {};
    const dateRange = convertLimaDateRangeToUTC(filters.createdAtFrom, filters.createdAtTo);
    if (dateRange.from) {
      whereClause.createdAt.gte = dateRange.from;
    }
    if (dateRange.to) {
      whereClause.createdAt.lte = dateRange.to;
    }
  }

  if (filters?.updatedAtFrom || filters?.updatedAtTo) {
    whereClause.updatedAt = {};
    const dateRange = convertLimaDateRangeToUTC(filters.updatedAtFrom, filters.updatedAtTo);
    if (dateRange.from) {
      whereClause.updatedAt.gte = dateRange.from;
    }
    if (dateRange.to) {
      whereClause.updatedAt.lte = dateRange.to;
    }
  }

  return whereClause;
};

export const buildCategorySelectCacheKey = (societyCode?: string) =>
  `${CATEGORY_CACHE_PREFIX}:select:${societyCode || 'all'}`;

export const getCategoryListParams = (paginationQuery?: PaginationQuery) => ({
  page: paginationQuery?.page ?? 1,
  limit: paginationQuery?.limit ?? 10,
  sortBy: paginationQuery?.sortBy || 'createdAt',
  sortOrder: paginationQuery?.sortOrder || 'desc',
});
