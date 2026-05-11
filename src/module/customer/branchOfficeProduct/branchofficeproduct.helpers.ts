import prisma from '@/config/prisma';
import { PaginationQuery } from '@/utils/pagination';
import { BranchOfficeProductFilters } from './branchofficeproduct.validation';

export const BRANCH_OFFICE_PRODUCT_CACHE_PREFIX = 'branch_office_products';
export const BRANCH_OFFICE_PRODUCT_CACHE_TTL_LIST = 300;
export const BRANCH_OFFICE_PRODUCT_CACHE_TTL_SINGLE = 600;

export const buildBranchOfficeProductListCacheKey = (
  resolvedSocietyId: string | undefined,
  page: number,
  limit: number,
  sortBy: string,
  sortOrder: string,
  filters?: BranchOfficeProductFilters
) =>
  [
    BRANCH_OFFICE_PRODUCT_CACHE_PREFIX,
    'list',
    resolvedSocietyId || 'all',
    filters?.branchOfficeId || 'all',
    filters?.productId || 'all',
    filters?.productName || 'all',
    filters?.location || 'all',
    filters?.lowStock !== undefined ? filters.lowStock : 'all',
    filters?.isActive !== undefined ? filters.isActive : 'all',
    filters?.stockFrom || 'all',
    filters?.stockTo || 'all',
    page,
    limit,
    sortBy,
    sortOrder,
  ].join(':');

export const resolveBranchOfficeProductSocietyId = async (
  societyCode?: string,
  societyId?: string
) => {
  const societyValue = societyCode || societyId;
  if (!societyValue) {
    return undefined;
  }

  const society = await prisma.society.findUnique({
    where: societyCode ? { code: societyValue } : { id: societyValue },
    select: { id: true },
  });

  return society?.id ?? null;
};

export const buildBranchOfficeProductWhereClause = (
  resolvedSocietyId?: string,
  filters?: BranchOfficeProductFilters
) => {
  const whereClause: any = { isDeleted: false };

  if (resolvedSocietyId) {
    whereClause.branchOffice = {
      societyId: resolvedSocietyId,
    };
  }

  if (filters?.branchOfficeId) whereClause.branchOfficeId = filters.branchOfficeId;
  if (filters?.productId) whereClause.productId = filters.productId;
  if (filters?.location) whereClause.location = { contains: filters.location, mode: 'insensitive' };
  if (filters?.isActive !== undefined) whereClause.isActive = filters.isActive;

  if (filters?.productName) {
    whereClause.product = {
      ...(whereClause.product || {}),
      name: { contains: filters.productName, mode: 'insensitive' },
    };
  }

  if (filters?.stockFrom !== undefined || filters?.stockTo !== undefined) {
    whereClause.physicalStock = {};
    if (filters.stockFrom !== undefined) whereClause.physicalStock.gte = filters.stockFrom;
    if (filters.stockTo !== undefined) whereClause.physicalStock.lte = filters.stockTo;
  }

  if (filters?.lowStock) {
    whereClause.availableStock = {
      lte: (prisma.branchOfficeProduct as any).fields.minStock,
    };
  }

  return whereClause;
};

export const buildBranchOfficeProductSelectWhereClause = async (
  branchOfficeId: string,
  societyCode?: string,
  search?: string
) => {
  const whereClause: any = { branchOfficeId, isDeleted: false };

  if (societyCode) {
    const resolvedSocietyId = await resolveBranchOfficeProductSocietyId(societyCode);
    if (resolvedSocietyId) {
      whereClause.branchOffice = { societyId: resolvedSocietyId };
    }
  }

  if (search) {
    whereClause.product = {
      OR: [
        { name: { contains: search, mode: 'insensitive' } },
        { code: { contains: search, mode: 'insensitive' } },
        { brand: { contains: search, mode: 'insensitive' } },
        { barcode: { contains: search, mode: 'insensitive' } },
      ],
    };
  }

  return whereClause;
};

export const getBranchOfficeProductListParams = (paginationQuery?: PaginationQuery) => ({
  page: paginationQuery?.page ?? 1,
  limit: paginationQuery?.limit ?? 10,
  sortBy: paginationQuery?.sortBy ?? 'createdAt',
  sortOrder: paginationQuery?.sortOrder ?? 'desc',
});
