import prisma from '@/config/prisma';
import { convertLimaDateRangeToUTC } from '@/utils/dateFormatter';
import { PaginationQuery } from '@/utils/pagination';

export interface ProductFilters {
  societyCode?: string;
  societyId?: string;
  categoryCode?: string;
  categoryId?: string;
  branchId?: string;
  search?: string;
  isActive?: boolean;
  priceFrom?: number;
  priceTo?: number;
  priceCostFrom?: number;
  priceCostTo?: number;
  lowStock?: boolean;
  stockStatus?: 'all' | 'available' | 'low' | 'out';
  stockFrom?: number;
  stockTo?: number;
  createdBy?: string;
  updatedBy?: string;
  createdAtFrom?: string;
  createdAtTo?: string;
  updatedAtFrom?: string;
  updatedAtTo?: string;
  color?: string;
  brand?: string;
}

export const PRODUCT_CACHE_PREFIX = 'products:';
export const PRODUCT_CACHE_TTL_LIST = 300;
export const PRODUCT_CACHE_TTL_SINGLE = 600;
export const PRODUCT_CACHE_TTL_SELECT = 900;
export const PRODUCT_DASHBOARD_CACHE_KEYS = [
  'stats',
  'stats-v2',
  'stats-v3',
] as const;

export const isUuid = (value: string) =>
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(value);

export const resolveSocietyId = async (societyRef?: string, branchId?: string): Promise<string | null> => {
  if (societyRef) {
    if (isUuid(societyRef)) {
      return societyRef;
    }

    const society = await prisma.society.findUnique({
      where: { code: societyRef },
      select: { id: true },
    });

    if (!society) {
      return null;
    }

    return society.id;
  }

  if (!branchId) {
    return null;
  }

  const branch = await prisma.branchOffice.findUnique({
    where: { id: branchId },
    select: { societyId: true },
  });

  return branch?.societyId ?? null;
};

export const resolveSocietyByCodeOrId = async (societyRef: string) => {
  if (isUuid(societyRef)) {
    return prisma.society.findUnique({
      where: { id: societyRef },
      select: { id: true, name: true, code: true, subscriptionId: true },
    });
  }

  return prisma.society.findUnique({
    where: { code: societyRef },
    select: { id: true, name: true, code: true, subscriptionId: true },
  });
};

export const resolveCategoryId = async (categoryRef: string | undefined, societyId: string) => {
  if (!categoryRef) {
    return undefined;
  }

  const category = await prisma.category.findFirst({
    where: {
      code: categoryRef,
      isDeleted: false,
      societyId,
    },
  });

  return category?.id ?? null;
};

export const buildProductListCacheKey = (
  resolvedSocietyId: string,
  page: number,
  limit: number,
  sortBy: string,
  sortOrder: string,
  filters?: ProductFilters
) =>
  `${PRODUCT_CACHE_PREFIX}${resolvedSocietyId}:${[
    'list',
    filters?.categoryCode || 'all',
    filters?.categoryId || 'all',
    filters?.branchId || 'all',
    filters?.search || 'all',
    filters?.isActive !== undefined ? filters.isActive : 'all',
    filters?.priceFrom || 'all',
    filters?.priceTo || 'all',
    filters?.priceCostFrom || 'all',
    filters?.priceCostTo || 'all',
    filters?.lowStock !== undefined ? filters.lowStock : 'all',
    filters?.stockFrom || 'all',
    filters?.stockTo || 'all',
    filters?.createdBy || 'all',
    filters?.updatedBy || 'all',
    filters?.createdAtFrom || 'all',
    filters?.createdAtTo || 'all',
    filters?.updatedAtFrom || 'all',
    filters?.updatedAtTo || 'all',
    filters?.color || 'all',
    filters?.brand || 'all',
    filters?.stockStatus || 'all',
    page,
    limit,
    sortBy,
    sortOrder,
  ].join(':')}`;

export const buildProductWhereClause = (
  resolvedSocietyId: string,
  filters?: ProductFilters,
  resolvedCategoryId?: string
) => {
  const whereClause: any = {
    isDeleted: false,
    societyId: resolvedSocietyId,
  };

  if (filters?.categoryId) {
    whereClause.categoryId = filters.categoryId;
  }

  if (resolvedCategoryId) {
    whereClause.categoryId = resolvedCategoryId;
  }

  const normalizedSearch = filters?.search?.trim();

  if (normalizedSearch) {
    const searchTerms = normalizedSearch.split(/\s+/).filter(Boolean);
    const searchableFields = ['name', 'code', 'barcode', 'brand', 'color'] as const;

    whereClause.AND = [
      ...(whereClause.AND ?? []),
      ...searchTerms.map((term) => ({
        OR: searchableFields.map((field) => ({
          [field]: { contains: term, mode: 'insensitive' },
        })),
      })),
    ];
  }

  if (filters?.isActive !== undefined) {
    whereClause.isActive = filters.isActive;
  }

  if (filters?.brand) {
    whereClause.brand = { contains: filters.brand, mode: 'insensitive' };
  }

  if (filters?.color) {
    whereClause.color = { contains: filters.color, mode: 'insensitive' };
  }

  if (filters?.priceFrom !== undefined || filters?.priceTo !== undefined) {
    whereClause.price = {};
    if (filters.priceFrom !== undefined) {
      whereClause.price.gte = filters.priceFrom;
    }
    if (filters.priceTo !== undefined) {
      whereClause.price.lte = filters.priceTo;
    }
  }

  if (filters?.priceCostFrom !== undefined || filters?.priceCostTo !== undefined) {
    whereClause.priceCost = {};
    if (filters.priceCostFrom !== undefined) {
      whereClause.priceCost.gte = filters.priceCostFrom;
    }
    if (filters.priceCostTo !== undefined) {
      whereClause.priceCost.lte = filters.priceCostTo;
    }
  }

  const stockConditions: any = {};
  const applyLowStockFilter = filters?.lowStock === true || filters?.stockStatus === 'low';

  if (applyLowStockFilter) {
    stockConditions.lte = (prisma.product as any).fields.minStock;
  }

  if (filters?.stockStatus === 'available') {
    stockConditions.gt = 0;
  } else if (filters?.stockStatus === 'out') {
    stockConditions.lte = 0;
  }

  if (filters?.stockFrom !== undefined || filters?.stockTo !== undefined) {
    if (filters.stockFrom !== undefined) {
      stockConditions.gte = filters.stockFrom;
    }
    if (filters.stockTo !== undefined) {
      stockConditions.lte = filters.stockTo;
    }
  }

  const hasStockFilters = Object.keys(stockConditions).length > 0;

  if (filters?.branchId) {
    whereClause.BranchOfficeProduct = {
      some: {
        branchOfficeId: filters.branchId,
        ...(hasStockFilters && { physicalStock: stockConditions }),
      },
    };
  } else if (hasStockFilters) {
    whereClause.stock = stockConditions;
  }

  if (filters?.createdBy) {
    whereClause.createdBy = filters.createdBy;
  }

  if (filters?.updatedBy) {
    whereClause.updatedBy = filters.updatedBy;
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

export const buildProductSelectCacheKey = (
  resolvedSocietyId: string,
  categoryCode?: string,
  branchId?: string,
  search?: string
) => `${PRODUCT_CACHE_PREFIX}${resolvedSocietyId}:select:${categoryCode || 'all'}:${branchId || 'all'}:${search || 'all'}`;

export const resolveDefaultProductBranchId = async (societyId: string, branchId?: string) => {
  if (branchId) {
    return branchId;
  }

  const mainBranch = await prisma.branchOffice.findFirst({
    where: { societyId, isMain: true },
    select: { id: true },
  });

  return mainBranch?.id;
};

export const getProductListParams = (paginationQuery?: PaginationQuery) => ({
  page: paginationQuery?.page ?? 1,
  limit: paginationQuery?.limit ?? 10,
  sortBy: paginationQuery?.sortBy ?? 'name',
  sortOrder: paginationQuery?.sortOrder ?? 'asc',
});
