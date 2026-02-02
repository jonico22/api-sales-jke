import prisma from '@/config/prisma';
import { z } from 'zod';
import { createCategorySchema, updateCategorySchema } from './category.schema';
import {
  PaginatedResult,
  getPrismaPaginationParams,
  buildPaginatedResult,
  PaginationQuery,
} from '@/utils/pagination';
import { Category } from '@prisma/client';
import { formatToLimaTime } from '@/utils/dateFormatter';
import { redis } from '@/config/redis';

// Tipos inferidos de los schemas
type CreateCategoryInput = z.infer<typeof createCategorySchema>['body'];
type UpdateCategoryInput = z.infer<typeof updateCategorySchema>['body'];

// Constantes de cache
const CACHE_PREFIX = 'categories:';
const CACHE_TTL_LIST = 300; // 5 minutos para listas
const CACHE_TTL_SINGLE = 600; // 10 minutos para registro individual
const CACHE_TTL_SELECT = 900; // 15 minutos para select (datos que cambian poco)

export const CategoryService = {
  /**
   * Obtener todas las categorías con paginación y filtro por sociedad
   * Con cache de Redis
   */
  getAll: async (paginationQuery?: PaginationQuery, societyCode?: string): Promise<PaginatedResult<Category>> => {
    const page = paginationQuery?.page ?? 1;
    const limit = paginationQuery?.limit ?? 10;
    const sortBy = paginationQuery?.sortBy ?? 'createdAt';
    const sortOrder = paginationQuery?.sortOrder ?? 'desc';

    // Construir clave de cache única para esta combinación de filtros
    const cacheKey = `${CACHE_PREFIX}list:${societyCode || 'all'}:${page}:${limit}:${sortBy}:${sortOrder}`;

    // 1. Intentar obtener del cache
    const cached = await redis.get<PaginatedResult<Category>>(cacheKey);
    if (cached) {
      console.log(`[Cache HIT] ${cacheKey}`);
      return cached;
    }

    console.log(`[Cache MISS] ${cacheKey}`);

    const prismaParams = getPrismaPaginationParams(page, limit, sortBy, sortOrder);
    const whereClause: any = { isDeleted: false };

    // Resolver código de sociedad
    if (societyCode) {
      const society = await prisma.society.findUnique({ where: { code: societyCode } });
      if (society) {
        whereClause.societyId = society.id;
      } else {
        return buildPaginatedResult([], page, limit, 0);
      }
    }

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
    await redis.set(cacheKey, result, CACHE_TTL_LIST);

    return result;
  },

  /**
   * Obtener categoría por ID con cache
   */
  getById: async (id: string) => {
    const cacheKey = `${CACHE_PREFIX}${id}`;

    // 1. Intentar obtener del cache
    const cached = await redis.get<Category>(cacheKey);
    if (cached) {
      console.log(`[Cache HIT] ${cacheKey}`);
      return cached;
    }

    console.log(`[Cache MISS] ${cacheKey}`);

    // 2. Buscar en DB
    const category = await prisma.category.findFirst({
      where: { id, isDeleted: false }
    });

    // 3. Guardar en cache
    if (category) {
      await redis.set(cacheKey, category, CACHE_TTL_SINGLE);
    }

    return category;
  },

  /**
   * Crear categoría e invalidar cache de listas
   */
  create: async (data: CreateCategoryInput) => {
    const society = await prisma.society.findUnique({ where: { code: data.societyId } });
    if (!society) return null;

    data.societyId = society.id;
    const created = await prisma.category.create({ data });

    // Invalidar cache de listas
    await redis.deleteKeysByPrefix(`${CACHE_PREFIX}list:`);
    await redis.deleteKeysByPrefix(`${CACHE_PREFIX}select:`);

    return created;
  },

  /**
   * Actualizar categoría e invalidar cache
   */
  update: async (id: string, data: UpdateCategoryInput) => {
    if (data.societyId) {
      const society = await prisma.society.findUnique({ where: { code: data.societyId } });
      if (!society) return null;
      data.societyId = society.id;
    }

    const updated = await prisma.category.update({
      where: { id },
      data,
    });

    // Invalidar cache del registro individual y listas
    await redis.del(`${CACHE_PREFIX}${id}`);
    await redis.deleteKeysByPrefix(`${CACHE_PREFIX}list:`);
    await redis.deleteKeysByPrefix(`${CACHE_PREFIX}select:`);

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

    // Invalidar cache
    await redis.del(`${CACHE_PREFIX}${id}`);
    await redis.deleteKeysByPrefix(`${CACHE_PREFIX}list:`);
    await redis.deleteKeysByPrefix(`${CACHE_PREFIX}select:`);

    return deleted;
  },

  /**
   * Obtener categorías para select/dropdown con cache largo
   */
  getForSelect: async (societyCode?: string) => {
    const cacheKey = `${CACHE_PREFIX}select:${societyCode || 'all'}`;

    // 1. Intentar obtener del cache
    const cached = await redis.get<{ id: string; name: string; code: string }[]>(cacheKey);
    if (cached) {
      console.log(`[Cache HIT] ${cacheKey}`);
      return cached;
    }

    console.log(`[Cache MISS] ${cacheKey}`);

    const whereClause: any = { isDeleted: false, isActive: true };

    if (societyCode) {
      const society = await prisma.society.findUnique({ where: { code: societyCode } });
      if (society) {
        whereClause.societyId = society.id;
      } else {
        return [];
      }
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
    await redis.set(cacheKey, categories, CACHE_TTL_SELECT);

    return categories;
  },

  /**
   * Invalidar todo el cache de categorías (para uso manual si es necesario)
   */
  invalidateAllCache: async () => {
    await redis.deleteKeysByPrefix(CACHE_PREFIX);
    console.log('[Cache] Todo el cache de categorías ha sido invalidado');
  },
};
