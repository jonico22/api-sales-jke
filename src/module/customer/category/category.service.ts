import prisma from '@/config/prisma';
import { CategoryFilters, CreateCategoryInput, UpdateCategoryInput } from './category.schema';
import {
  PaginatedResult,
  getPrismaPaginationParams,
  buildPaginatedResult,
  PaginationQuery,
} from '@/utils/pagination';
import { Category } from '@prisma/client';
import { formatToLimaTime } from '@/utils/dateFormatter';
import { redis } from '@/config/redis';
import {
  buildCategoryListCacheKey,
  buildCategorySelectCacheKey,
  buildCategoryWhereClause,
  CATEGORY_CACHE_PREFIX,
  CATEGORY_CACHE_TTL_LIST,
  CATEGORY_CACHE_TTL_SELECT,
  CATEGORY_CACHE_TTL_SINGLE,
  getCategoryListParams,
  isUuid,
  resolveCategorySocietyId,
} from './category.helpers';
import {
  resolveCategorySocietyForMutation,
  scheduleCategoryCacheInvalidation,
} from './category.service.support';

export const CategoryService = {
  /**
   * Obtener todas las categorías con paginación y filtros
   * Con cache de Redis
   */
  getAll: async (
    paginationQuery?: PaginationQuery,
    filters?: CategoryFilters
  ): Promise<PaginatedResult<Category>> => {
    const { page, limit, sortBy, sortOrder } = getCategoryListParams(paginationQuery);

    let resolvedSocietyId = filters?.societyId;
    const societyCode = filters?.societyCode || filters?.societyId;
    if (!resolvedSocietyId && societyCode) {
      const societyId = await resolveCategorySocietyId(societyCode);
      if (!societyId) {
        return buildPaginatedResult([], page, limit, 0);
      }
      resolvedSocietyId = societyId;
    }

    const cacheKey = buildCategoryListCacheKey(resolvedSocietyId, page, limit, sortBy, sortOrder, filters);

    const cached = await redis.get<PaginatedResult<Category>>(cacheKey);
    if (cached) return cached;

    const prismaParams = getPrismaPaginationParams(page, limit, sortBy, sortOrder);
    const whereClause = buildCategoryWhereClause(resolvedSocietyId, filters);

    // 2. Buscar en DB
    const [data, total] = await prisma.$transaction([
      prisma.category.findMany({
        where: whereClause,
        skip: prismaParams.skip,
        take: prismaParams.take,
        orderBy: prismaParams.orderBy ?? { createdAt: sortOrder },
        select: {
          id: true,
          name: true,
          code: true,
          description: true,
          societyId: true,
          isActive: true,
          isDeleted: true,
          createdAt: true,
          createdBy: true,
          updatedAt: true,
          updatedBy: true,
        },
      }),
      prisma.category.count({ where: whereClause }),
    ]);

    // Formatear fechas
    const formattedData = data.map(item => ({
      ...item,
      createdAt: formatToLimaTime(item.createdAt) as any,
      updatedAt: item.updatedAt ? formatToLimaTime(item.updatedAt) as any : item.updatedAt,
    }));

    const result = buildPaginatedResult(formattedData, page, limit, total);

    // 3. Guardar en cache
    await redis.set(cacheKey, result, CATEGORY_CACHE_TTL_LIST);

    return result;
  },

  /**
   * Obtener categoría por ID con cache
   */
  getById: async (id: string) => {
    const cacheKey = `${CATEGORY_CACHE_PREFIX}:${id}`;

    const cached = await redis.get<Category>(cacheKey);
    if (cached) return cached;

    // 2. Buscar en DB
    const category = await prisma.category.findUnique({
      where: { id, isDeleted: false }
    });

    if (!category) return null;

    // 3. Guardar en cache
    await redis.set(cacheKey, category, CATEGORY_CACHE_TTL_SINGLE);

    return category;
  },

  /**
   * Obtener lista de usuarios únicos que han creado categorías
   * Filtrado opcionalmente por societyId
   */
  getCreatedByUsers: async (societyId?: string): Promise<string[]> => {
    const whereClause: any = { isDeleted: false, createdBy: { not: null } };

    if (societyId) {
      const resolvedSocietyId = await resolveCategorySocietyId(societyId);
      if (!resolvedSocietyId) {
        return [];
      }
      whereClause.societyId = resolvedSocietyId;
    }

    const result = await prisma.category.findMany({
      where: whereClause,
      distinct: ['createdBy'],
      select: {
        createdBy: true
      }
    });
    // Mapear a array de strings y filtrar nulos o vacíos
    return result
      .map(item => item.createdBy)
      .filter((id): id is string => typeof id === 'string' && id.length > 0);
  },

  /**
   * Obtener lista de usuarios únicos que han actualizado categorías
   * Filtrado opcionalmente por societyId
   */
  getUpdatedByUsers: async (societyId?: string): Promise<string[]> => {
    const whereClause: any = { isDeleted: false, updatedBy: { not: null } };
 
    if (societyId) {
      const resolvedSocietyId = await resolveCategorySocietyId(societyId);
      if (!resolvedSocietyId) {
        return [];
      }
      whereClause.societyId = resolvedSocietyId;
    }

    const result = await prisma.category.findMany({
      where: whereClause,
      distinct: ['updatedBy'],
      select: {
        updatedBy: true
      }
    });

    // Mapear a array de strings y filtrar nulos o vacíos
    return result
      .map(item => item.updatedBy)
      .filter((id): id is string => typeof id === 'string' && id.length > 0);
  },

  /**
   * Crear categoría e invalidar cache de listas
   */
  create: async (data: CreateCategoryInput) => {
    const isCategorySocietyUuid = isUuid(data.societyId);
    if (!isCategorySocietyUuid) {
      const societyId = await resolveCategorySocietyForMutation(data.societyId);
      if (!societyId) return null;
      data.societyId = societyId;
    }
    const created = await prisma.category.create({ data });

    scheduleCategoryCacheInvalidation('create');

    return created;
  },

  /**
   * Actualizar categoría e invalidar cache
   */
  update: async (id: string, data: UpdateCategoryInput) => {
    if (data.societyId) {
      const isCategorySocietyUuid = isUuid(data.societyId);
      if (!isCategorySocietyUuid) {
        const societyId = await resolveCategorySocietyForMutation(data.societyId);
        if (!societyId) return null;
        data.societyId = societyId;
      }
    }

    const updated = await prisma.category.update({
      where: { id },
      data,
    });

    scheduleCategoryCacheInvalidation('update');

    return updated;
  },

  /**
   * Eliminar categoría (soft delete) e invalidar cache
   */
  delete: async (id: string, updatedBy?: string) => {
    const deleted = await prisma.category.update({
      where: { id },
      data: {
        isDeleted: true,
        isActive: false,
        updatedBy,
      },
    });

    scheduleCategoryCacheInvalidation('delete');

    return deleted;
  },

  /**
   * Obtener categorías para select/dropdown con cache largo
   */
  getForSelect: async (societyCode?: string) => {
    const cacheKey = buildCategorySelectCacheKey(societyCode);

    const cached = await redis.get<{ id: string; name: string; code: string }[]>(cacheKey);
    if (cached) return cached;

    const whereClause: any = { isDeleted: false, isActive: true };

    if (societyCode) {
      const resolvedSocietyId = await resolveCategorySocietyId(societyCode);
      if (!resolvedSocietyId) {
        return [];
      }
      whereClause.societyId = resolvedSocietyId;
    }

    const categories = await prisma.category.findMany({
      where: whereClause,
      select: {
        id: true,
        name: true,
        code: true,
      },
      orderBy: { name: 'asc' },
    });

    // Guardar en cache con TTL largo
    await redis.set(cacheKey, categories, CATEGORY_CACHE_TTL_SELECT);

    return categories;
  },

  /**
   * Invalidar todo el cache de categorías (para uso manual si es necesario)
   */
  invalidateAllCache: async () => {
    await redis.deleteKeysByPrefix(`${CATEGORY_CACHE_PREFIX}:`);
    console.log('[Cache] Todo el cache de categorías ha sido invalidado');
  },
};
