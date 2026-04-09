import prisma from '@/config/prisma';
import {
  BranchOfficeProductFilters,
  createBranchOfficeProductSchema,
  CreateBranchOfficeProductInput,
  updateBranchOfficeProductSchema,
  UpdateBranchOfficeProductInput,
} from './branchofficeproduct.validation';
import {
  PaginatedResult,
  getPrismaPaginationParams,
  buildPaginatedResult,
  PaginationQuery,
} from '@/utils/pagination';
import { redis } from '@/config/redis';
import {
  BRANCH_OFFICE_PRODUCT_CACHE_PREFIX,
  BRANCH_OFFICE_PRODUCT_CACHE_TTL_LIST,
  BRANCH_OFFICE_PRODUCT_CACHE_TTL_SINGLE,
  buildBranchOfficeProductListCacheKey,
  buildBranchOfficeProductSelectWhereClause,
  buildBranchOfficeProductWhereClause,
  getBranchOfficeProductListParams,
  resolveBranchOfficeProductSocietyId,
} from './branchofficeproduct.helpers';
import { invalidateBranchOfficeProductCaches } from './branchofficeproduct.service.support';

export const BranchOfficeProductService = {
  getAll: async (
    paginationQuery?: PaginationQuery,
    filters?: BranchOfficeProductFilters
  ): Promise<PaginatedResult<any>> => {
    const { page, limit, sortBy, sortOrder } = getBranchOfficeProductListParams(paginationQuery);

    const resolvedSocietyId = await resolveBranchOfficeProductSocietyId(
      filters?.societyCode,
      filters?.societyId
    );
    if ((filters?.societyCode || filters?.societyId) && !resolvedSocietyId) {
      return buildPaginatedResult([], page, limit, 0);
    }

    const cacheKey = buildBranchOfficeProductListCacheKey(
      resolvedSocietyId ?? undefined,
      page,
      limit,
      sortBy,
      sortOrder,
      filters
    );

    const cached = await redis.get<PaginatedResult<any>>(cacheKey);
    if (cached) return cached;

    const prismaParams = getPrismaPaginationParams(page, limit, sortBy, sortOrder);
    const whereClause = buildBranchOfficeProductWhereClause(resolvedSocietyId ?? undefined, filters);

    const [data, total] = await prisma.$transaction([
      prisma.branchOfficeProduct.findMany({
        where: whereClause,
        skip: prismaParams.skip,
        take: prismaParams.take,
        orderBy: prismaParams.orderBy,
        include: {
          product: true,
          branchOffice: true,
        },
      }),
      prisma.branchOfficeProduct.count({ where: whereClause }),
    ]);

    const result = buildPaginatedResult(data, page, limit, total);
    await redis.set(cacheKey, result, BRANCH_OFFICE_PRODUCT_CACHE_TTL_LIST);
    return result;
  },

  getById: async (id: string) => {
    const cacheKey = `${BRANCH_OFFICE_PRODUCT_CACHE_PREFIX}:${id}`;
    const cached = await redis.get(cacheKey);
    if (cached) return cached;

    const result = await prisma.branchOfficeProduct.findFirst({
      where: { id, isDeleted: false },
      include: {
        product: true,
        branchOffice: true,
      },
    });

    if (result) {
      await redis.set(cacheKey, result, BRANCH_OFFICE_PRODUCT_CACHE_TTL_SINGLE);
    }
    return result;
  },

  create: async (data: unknown) => {
    const parsed: CreateBranchOfficeProductInput = createBranchOfficeProductSchema.parse(data);

    const existing = await prisma.branchOfficeProduct.findUnique({
      where: {
        productId_branchOfficeId: {
          productId: parsed.productId,
          branchOfficeId: parsed.branchOfficeId,
        },
      },
    });

    let result;
    if (existing) {
      result = await prisma.branchOfficeProduct.update({
        where: { id: existing.id },
        data: {
          ...parsed,
          isDeleted: false,
          isActive: true,
          updatedAt: new Date(),
        },
      });
    } else {
      result = await prisma.branchOfficeProduct.create({
        data: parsed,
      });
    }

    await invalidateBranchOfficeProductCaches();

    return result;
  },

  update: async (id: string, data: unknown) => {
    const parsed: UpdateBranchOfficeProductInput = updateBranchOfficeProductSchema.parse(data);
    const updated = await prisma.branchOfficeProduct.update({
      where: { id },
      data: {
        ...parsed,
        updatedAt: new Date(),
      },
    });

    await invalidateBranchOfficeProductCaches({ id });

    return updated;
  },

  delete: async (id: string) => {
    const deleted = await prisma.branchOfficeProduct.update({
      where: { id },
      data: {
        isDeleted: true,
        isActive: false,
        updatedAt: new Date(),
      },
    });

    await invalidateBranchOfficeProductCaches({ id, includeSelect: false });

    return deleted;
  },

  getProductsStockForBulk: async (branchOfficeId: string, productIds: string[]) => {
    return prisma.branchOfficeProduct.findMany({
      where: {
        branchOfficeId,
        productId: { in: productIds }
      },
      select: {
        productId: true,
        availableStock: true,
        isDeleted: true,
        product: {
          select: {
            id: true,
            name: true,
            priceCost: true
          }
        }
      }
    });
  },

  getForSelect: async (
    branchOfficeId: string,
    societyCode?: string,
    paginationQuery?: PaginationQuery,
    search?: string
  ): Promise<PaginatedResult<any>> => {
    const page = paginationQuery?.page ?? 1;
    const limit = paginationQuery?.limit ?? 100;
    const sortOrder = paginationQuery?.sortOrder ?? 'asc';

    const whereClause = await buildBranchOfficeProductSelectWhereClause(branchOfficeId, societyCode, search);

    const prismaParams = getPrismaPaginationParams(page, limit, 'product.name', sortOrder);

    const [data, total] = await prisma.$transaction([
      prisma.branchOfficeProduct.findMany({
        where: whereClause,
        skip: prismaParams.skip,
        take: prismaParams.take,
        orderBy: {
          product: {
            name: sortOrder
          }
        },
        select: {
          productId: true,
          availableStock: true,
          product: {
            select: {
              name: true,
              code: true,
              brand: true
            }
          }
        }
      }),
      prisma.branchOfficeProduct.count({ where: whereClause })
    ]);

    const formattedData = data.map(item => ({
      id: item.productId,
      name: item.product.name,
      code: item.product.code,
      brand: item.product.brand,
      stock: item.availableStock
    }));

    return buildPaginatedResult(formattedData, page, limit, total);
  },
};
