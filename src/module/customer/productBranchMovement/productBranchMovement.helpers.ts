import prisma from '@/config/prisma';
import { MovementStatus } from '@prisma/client';
import { convertLimaDateRangeToUTC } from '@/utils/dateFormatter';
import { PaginationQuery } from '@/utils/pagination';

export interface ProductBranchMovementFilters {
  societyId?: string;
  societyCode?: string;
  originBranchId?: string;
  destinationBranchId?: string;
  productId?: string;
  status?: MovementStatus;
  batchId?: string;
  dateFrom?: string;
  dateTo?: string;
}

export const PRODUCT_BRANCH_MOVEMENT_CACHE_PREFIX = 'branch_movements';
export const PRODUCT_BRANCH_MOVEMENT_CACHE_TTL_LIST = 300;
export const PRODUCT_BRANCH_MOVEMENT_CACHE_TTL_SINGLE = 600;

export const buildProductBranchMovementListCacheKey = (
  page: number,
  limit: number,
  sortBy: string,
  sortOrder: string,
  filters?: ProductBranchMovementFilters
) =>
  [
    PRODUCT_BRANCH_MOVEMENT_CACHE_PREFIX,
    'list',
    filters?.societyCode || filters?.societyId || 'all',
    filters?.originBranchId || 'all',
    filters?.destinationBranchId || 'all',
    filters?.productId || 'all',
    filters?.status || 'all',
    filters?.batchId || 'all',
    filters?.dateFrom || 'all',
    filters?.dateTo || 'all',
    page,
    limit,
    sortBy,
    sortOrder,
  ].join(':');

export const buildProductBranchMovementWhereClause = async (filters?: ProductBranchMovementFilters) => {
  const whereClause: any = {};

  if (filters?.societyCode) {
    const society = await prisma.society.findUnique({
      where: { code: filters.societyCode },
      select: { id: true },
    });
    if (!society) {
      return null;
    }
    whereClause.originBranch = { societyId: society.id };
  } else if (filters?.societyId) {
    whereClause.originBranch = { societyId: filters.societyId };
  }

  if (filters?.originBranchId) whereClause.originBranchId = filters.originBranchId;
  if (filters?.destinationBranchId) whereClause.destinationBranchId = filters.destinationBranchId;
  if (filters?.productId) whereClause.productId = filters.productId;
  if (filters?.status) whereClause.status = filters.status;
  if (filters?.batchId) whereClause.batchId = filters.batchId;

  if (filters?.dateFrom || filters?.dateTo) {
    whereClause.movementDate = {};
    const dateRange = convertLimaDateRangeToUTC(filters.dateFrom, filters.dateTo);
    if (dateRange.from) whereClause.movementDate.gte = dateRange.from;
    if (dateRange.to) whereClause.movementDate.lte = dateRange.to;
  }

  return whereClause;
};

export const getProductBranchMovementListParams = (paginationQuery?: PaginationQuery) => ({
  page: paginationQuery?.page ?? 1,
  limit: paginationQuery?.limit ?? 10,
  sortBy: paginationQuery?.sortBy ?? 'movementDate',
  sortOrder: paginationQuery?.sortOrder ?? 'desc',
});

export const buildBulkTransferBatchId = () =>
  `BATCH-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`.toUpperCase();

export const buildTransferAllBatchId = () =>
  `TRANSFER-ALL-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`.toUpperCase();
