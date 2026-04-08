import prisma from '@/config/prisma';
import { redis } from '@/config/redis';
import { TransactionType } from '@prisma/client';

export const INVENTORY_CACHE_PREFIX = 'inventory';
export const INVENTORY_CACHE_TTL_LIST = 60;

export interface InventoryFiltersLike {
  societyId?: string;
  societyCode?: string;
  branchId?: string;
  productId?: string;
  type?: TransactionType;
  startDate?: string;
  endDate?: string;
  search?: string;
}

export const resolveInventorySocietyId = async (filters?: InventoryFiltersLike) => {
  let resolvedSocietyId = filters?.societyId;

  if (!resolvedSocietyId && filters?.societyCode) {
    const society = await prisma.society.findUnique({ where: { code: filters.societyCode } });
    if (!society) return null;
    resolvedSocietyId = society.id;
  }

  return resolvedSocietyId || null;
};

export const buildInventoryCacheKey = (
  resolvedSocietyId: string | null,
  page: number,
  limit: number,
  sortBy: string,
  sortOrder: 'asc' | 'desc',
  filters?: InventoryFiltersLike
) => {
  return [
    INVENTORY_CACHE_PREFIX,
    'list',
    resolvedSocietyId || 'all',
    filters?.branchId || 'all',
    filters?.productId || 'all',
    filters?.type || 'all',
    filters?.startDate || 'all',
    filters?.endDate || 'all',
    page,
    limit,
    sortBy,
    sortOrder
  ].join(':');
};

export const buildInventoryWhereClause = (
  resolvedSocietyId: string | null,
  filters?: InventoryFiltersLike
) => {
  const whereClause: any = {};

  if (resolvedSocietyId) {
    whereClause.product = { societyId: resolvedSocietyId };
  }
  if (filters?.branchId) whereClause.branchOfficeId = filters.branchId;
  if (filters?.productId) whereClause.productId = filters.productId;
  if (filters?.type) whereClause.type = filters.type;

  if (filters?.startDate || filters?.endDate) {
    whereClause.date = {};
    if (filters.startDate) whereClause.date.gte = new Date(filters.startDate);
    if (filters.endDate) whereClause.date.lte = new Date(filters.endDate);
  }

  if (filters?.search) {
    const searchObj = { contains: filters.search, mode: 'insensitive' as const };
    whereClause.OR = [
      { documentNumber: searchObj },
      { product: { name: searchObj } }
    ];
  }

  return whereClause;
};

export const getSignedAdjustmentQuantity = (type: TransactionType, quantity: number) => {
  return type === TransactionType.ADJUSTMENT_SUB
    ? -Math.abs(quantity)
    : Math.abs(quantity);
};

export const getSaleExitQuantity = (quantity: number) => -Math.abs(quantity);

export const invalidateInventoryListCache = async () => {
  await redis.deleteKeysByPrefix(`${INVENTORY_CACHE_PREFIX}:list:`);
};

export const invalidateInventoryDomainCaches = async () => {
  await Promise.all([
    redis.deleteKeysByPrefix('products:'),
    redis.deleteKeysByPrefix('products:select:'),
    redis.deleteKeysByPrefix('branch_office_products:'),
    invalidateInventoryListCache()
  ]);
};
