import prisma from '@/config/prisma';
import { createBranchOfficeSchema, updateBranchOfficeSchema, branchOfficeFiltersSchema } from './branchoffice.validation';
import { z } from 'zod';
import {
  PaginatedResult,
  getPrismaPaginationParams,
  buildPaginatedResult,
  PaginationQuery,
} from '@/utils/pagination';
import { redis } from '@/config/redis';
import { formatToLimaTime, convertLimaDateRangeToUTC } from '@/utils/dateFormatter';

// Tipos inferidos
export type BranchOfficeFilters = z.infer<typeof branchOfficeFiltersSchema>['query'];

const CACHE_PREFIX = 'branch_offices:';
const CACHE_TTL_LIST = 300; // 5 minutos
const CACHE_TTL_SINGLE = 600; // 10 minutos
const CACHE_TTL_SELECT = 900; // 15 minutos

export const BranchOfficeService = {
  /**
   * Obtener todas las sucursales con paginación y filtros + Cache
   */
  getAll: async (
    paginationQuery?: PaginationQuery,
    filters?: BranchOfficeFilters
  ): Promise<PaginatedResult<any>> => {
    const page = paginationQuery?.page ?? 1;
    const limit = paginationQuery?.limit ?? 10;
    const sortBy = paginationQuery?.sortBy ?? 'createdAt';
    const sortOrder = paginationQuery?.sortOrder ?? 'desc';

    // Resolve societyId
    let resolvedSocietyId = filters?.societyId;
    const societyCode = filters?.societyCode || filters?.societyId;

    if (!resolvedSocietyId && societyCode) {
      const society = await prisma.society.findUnique({ where: { code: societyCode } });
      if (society) {
        resolvedSocietyId = society.id;
      } else {
        return buildPaginatedResult([], page, limit, 0);
      }
    }

    // Construir clave de cache
    const cacheKeyParts = [
      CACHE_PREFIX,
      'list',
      resolvedSocietyId || 'all',
      filters?.search || 'all',
      filters?.isMain !== undefined ? filters.isMain : 'all',
      filters?.isActive !== undefined ? filters.isActive : 'all',
      filters?.code || 'all',
      filters?.createdBy || 'all',
      filters?.createdAtFrom || 'all',
      filters?.createdAtTo || 'all',
      filters?.updatedAtFrom || 'all',
      filters?.updatedAtTo || 'all',
      page,
      limit,
      sortBy,
      sortOrder
    ];
    const cacheKey = cacheKeyParts.join(':');

    // 1. Intentar obtener del cache
    const cached = await redis.get<PaginatedResult<any>>(cacheKey);
    if (cached) {
      console.log(`[Cache HIT] ${cacheKey}`);
      return cached;
    }

    console.log(`[Cache MISS] ${cacheKey}`);

    const prismaParams = getPrismaPaginationParams(page, limit, sortBy, sortOrder);
    const whereClause: any = { isDeleted: false };

    // Filtros
    if (resolvedSocietyId) whereClause.societyId = resolvedSocietyId;
    if (filters?.isActive !== undefined) whereClause.isActive = filters.isActive;
    if (filters?.isMain !== undefined) whereClause.isMain = filters.isMain;
    if (filters?.code) whereClause.code = { contains: filters.code, mode: 'insensitive' };
    if (filters?.createdBy) whereClause.createdBy = filters.createdBy;

    if (filters?.createdAtFrom || filters?.createdAtTo) {
      whereClause.createdAt = {};
      const dateRange = convertLimaDateRangeToUTC(filters.createdAtFrom, filters.createdAtTo);
      if (dateRange.from) whereClause.createdAt.gte = dateRange.from;
      if (dateRange.to) whereClause.createdAt.lte = dateRange.to;
    }

    if (filters?.updatedAtFrom || filters?.updatedAtTo) {
      whereClause.updatedAt = {};
      const dateRange = convertLimaDateRangeToUTC(filters.updatedAtFrom, filters.updatedAtTo);
      if (dateRange.from) whereClause.updatedAt.gte = dateRange.from;
      if (dateRange.to) whereClause.updatedAt.lte = dateRange.to;
    }

    // Búsqueda general
    if (filters?.search) {
      whereClause.OR = [
        { name: { contains: filters.search, mode: 'insensitive' } },
        { code: { contains: filters.search, mode: 'insensitive' } },
        { address: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    // 2. Buscar en DB
    const [data, total] = await prisma.$transaction([
      prisma.branchOffice.findMany({
        where: whereClause,
        skip: prismaParams.skip,
        take: prismaParams.take,
        orderBy: prismaParams.orderBy,
        include: { society: true },
      }),
      prisma.branchOffice.count({ where: whereClause }),
    ]);

    const formattedData = data.map((item: any) => ({
      ...item,
      createdAt: formatToLimaTime(item.createdAt),
      updatedAt: item.updatedAt ? formatToLimaTime(item.updatedAt) : null,
    }));

    const result = buildPaginatedResult(formattedData, page, limit, total);

    // 3. Guardar en cache
    await redis.set(cacheKey, result, CACHE_TTL_LIST);

    return result;
  },

  getById: async (id: string) => {
    const cacheKey = `${CACHE_PREFIX}${id}`;

    // 1. Cache
    const cached = await redis.get(cacheKey);
    if (cached) return cached;

    // 2. DB
    const result = await prisma.branchOffice.findUnique({
      where: { id },
      include: { society: true },
    });

    if (result) {
      const formatted = {
        ...result,
        createdAt: formatToLimaTime(result.createdAt),
        updatedAt: result.updatedAt ? formatToLimaTime(result.updatedAt) : null,
      };
      await redis.set(cacheKey, formatted, CACHE_TTL_SINGLE);
      return formatted;
    }

    return result;
  },

  async getForSelect(societyCode?: string) {
    const cacheKey = `${CACHE_PREFIX}select:${societyCode || 'all'}`;
    const cached = await redis.get<any[]>(cacheKey);
    if (cached) return cached;

    const whereClause: any = {
      isDeleted: false,
      isActive: true,
    };

    if (societyCode) {
      const society = await prisma.society.findUnique({ where: { code: societyCode } });
      if (society) {
        whereClause.societyId = society.id;
      } else {
        // If societyCode provided but not found, return empty or handle as per logic (Category returns empty)
        return [];
      }
    }

    const data = await prisma.branchOffice.findMany({
      where: whereClause,
      select: {
        id: true,
        name: true,
        code: true,
      },
      orderBy: { name: 'asc' },
    });

    await redis.set(cacheKey, data, CACHE_TTL_SELECT);
    return data;
  },

  create: async (data: any) => {
    const parsed = createBranchOfficeSchema.parse(data);

    // Resolve societyId if it's a code
    const isUuid = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(parsed.societyId);
    if (!isUuid) {
      const society = await prisma.society.findUnique({ where: { code: parsed.societyId } });
      if (!society) return null;
      parsed.societyId = society.id;
    }

    const created = await prisma.branchOffice.create({ data: parsed });

    // Invalidar cache
    await redis.deleteKeysByPrefix(`${CACHE_PREFIX}list:`);
    await redis.deleteKeysByPrefix(`${CACHE_PREFIX}select:`);

    return created;
  },

  update: async (id: string, data: any) => {
    const parsed = updateBranchOfficeSchema.parse(data);

    if (parsed.societyId) {
      const isUuid = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(parsed.societyId);
      if (!isUuid) {
        const society = await prisma.society.findUnique({ where: { code: parsed.societyId } });
        if (!society) return null;
        parsed.societyId = society.id;
      }
    }

    const updated = await prisma.branchOffice.update({
      where: { id },
      data: {
        ...parsed,
        updatedAt: new Date(),
      },
    });

    // Invalidar cache
    await redis.del(`${CACHE_PREFIX}${id}`);
    await redis.deleteKeysByPrefix(`${CACHE_PREFIX}list:`);
    await redis.deleteKeysByPrefix(`${CACHE_PREFIX}select:`);

    return updated;
  },

  delete: async (id: string) => {
    const deleted = await prisma.branchOffice.update({
      where: { id },
      data: {
        isDeleted: true,
        isActive: false,
        updatedAt: new Date(),
      },
    });

    // Invalidar cache
    await redis.del(`${CACHE_PREFIX}${id}`);
    await redis.deleteKeysByPrefix(`${CACHE_PREFIX}list:`);
    await redis.deleteKeysByPrefix(`${CACHE_PREFIX}select:`);

    return deleted;
  },
};
