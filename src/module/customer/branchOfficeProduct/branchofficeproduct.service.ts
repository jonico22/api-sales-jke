import prisma from '@/config/prisma';
import {
  createBranchOfficeProductSchema,
  updateBranchOfficeProductSchema,
  branchOfficeProductFiltersSchema,
} from './branchofficeproduct.validation';
import { z } from 'zod';
import {
  PaginatedResult,
  getPrismaPaginationParams,
  buildPaginatedResult,
  PaginationQuery,
} from '@/utils/pagination';
import { redis } from '@/config/redis';

export type BranchOfficeProductFilters = z.infer<typeof branchOfficeProductFiltersSchema>['query'];

const CACHE_PREFIX = 'branch_office_products';
const CACHE_TTL_LIST = 300;
const CACHE_TTL_SINGLE = 600;

export const BranchOfficeProductService = {
  getAll: async (
    paginationQuery?: PaginationQuery,
    filters?: BranchOfficeProductFilters
  ): Promise<PaginatedResult<any>> => {
    const page = paginationQuery?.page ?? 1;
    const limit = paginationQuery?.limit ?? 10;
    const sortBy = paginationQuery?.sortBy ?? 'createdAt';
    const sortOrder = paginationQuery?.sortOrder ?? 'desc';

    let resolvedSocietyId: string | undefined;
    const societyValue = filters?.societyCode || filters?.societyId;

    if (societyValue) {
      const society = await prisma.society.findUnique({
        where: filters?.societyCode ? { code: societyValue } : { id: societyValue },
      });
      if (society) {
        resolvedSocietyId = society.id;
      } else {
        return buildPaginatedResult([], page, limit, 0);
      }
    }

    const cacheKey = [
      CACHE_PREFIX,
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
      sortOrder
    ].join(':');

    const cached = await redis.get<PaginatedResult<any>>(cacheKey);
    if (cached) return cached;

    const prismaParams = getPrismaPaginationParams(page, limit, sortBy, sortOrder);
    const whereClause: any = { isDeleted: false };

    if (resolvedSocietyId) {
      whereClause.branchOffice = {
        societyId: resolvedSocietyId
      };
    }

    if (filters?.branchOfficeId) whereClause.branchOfficeId = filters.branchOfficeId;
    if (filters?.productId) whereClause.productId = filters.productId;
    if (filters?.location) whereClause.location = { contains: filters.location, mode: 'insensitive' };
    if (filters?.isActive !== undefined) whereClause.isActive = filters.isActive;

    if (filters?.productName) {
      whereClause.product = {
        name: { contains: filters.productName, mode: 'insensitive' }
      };
    }

    if (filters?.stockFrom !== undefined || filters?.stockTo !== undefined) {
      whereClause.physicalStock = {};
      if (filters.stockFrom !== undefined) whereClause.physicalStock.gte = filters.stockFrom;
      if (filters.stockTo !== undefined) whereClause.physicalStock.lte = filters.stockTo;
    }

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
    await redis.set(cacheKey, result, CACHE_TTL_LIST);
    return result;
  },

  getById: async (id: string) => {
    const cacheKey = `${CACHE_PREFIX}:${id}`;
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
      await redis.set(cacheKey, result, CACHE_TTL_SINGLE);
    }
    return result;
  },

  create: async (data: unknown) => {
    const parsed = createBranchOfficeProductSchema.parse(data);

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

    await redis.deleteKeysByPrefix(`${CACHE_PREFIX}:list:`);
    await redis.deleteKeysByPrefix(`${CACHE_PREFIX}:select:`);
    await redis.deleteKeysByPrefix('products:');
    await redis.deleteKeysByPrefix('products:select:');

    return result;
  },

  update: async (id: string, data: unknown) => {
    const parsed = updateBranchOfficeProductSchema.parse(data);
    const updated = await prisma.branchOfficeProduct.update({
      where: { id },
      data: {
        ...parsed,
        updatedAt: new Date(),
      },
    });

    await redis.del(`${CACHE_PREFIX}:${id}`);
    await redis.deleteKeysByPrefix(`${CACHE_PREFIX}:list:`);
    await redis.deleteKeysByPrefix(`${CACHE_PREFIX}:select:`);
    await redis.deleteKeysByPrefix('products:');
    await redis.deleteKeysByPrefix('products:select:');

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

    await redis.del(`${CACHE_PREFIX}:${id}`);
    await redis.deleteKeysByPrefix(`${CACHE_PREFIX}:list:`);
    await redis.deleteKeysByPrefix('products:');
    await redis.deleteKeysByPrefix('products:select:');

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

    const whereClause: any = { branchOfficeId, isDeleted: false };

    if (societyCode) {
      const society = await prisma.society.findUnique({ where: { code: societyCode } });
      if (society) {
        whereClause.branchOffice = { societyId: society.id };
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
