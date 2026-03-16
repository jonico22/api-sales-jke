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
import { formatToLimaTime, convertLimaTimeToUTC, convertLimaDateRangeToUTC } from '@/utils/dateFormatter';
import { redis } from '@/config/redis';

// Tipos inferidos de los schemas
type CreateCategoryInput = z.infer<typeof createCategorySchema>['body'];
type UpdateCategoryInput = z.infer<typeof updateCategorySchema>['body'];

// Constantes de cache
const CACHE_PREFIX = 'categories';
const CACHE_TTL_LIST = 300; // 5 minutos para listas
const CACHE_TTL_SINGLE = 600; // 10 minutos para registro individual
const CACHE_TTL_SELECT = 900; // 15 minutos para select (datos que cambian poco)

// Tipo para los filtros de categoría
export interface CategoryFilters {
  societyCode?: string;
  societyId?: string;
  isActive?: boolean;
  createdBy?: string;
  createdAtFrom?: string;
  createdAtTo?: string;
  updatedAtFrom?: string;
  updatedAtTo?: string;
  search?: string;
}

export const CategoryService = {
  /**
   * Obtener todas las categorías con paginación y filtros
   * Con cache de Redis
   */
  getAll: async (
    paginationQuery?: PaginationQuery,
    filters?: CategoryFilters
  ): Promise<PaginatedResult<Category>> => {
    const page = paginationQuery?.page ?? 1;
    const limit = paginationQuery?.limit ?? 10;
    const sortBy = paginationQuery?.sortBy ?? 'createdAt';
    const sortOrder = paginationQuery?.sortOrder ?? 'desc';

    // Construir clave de cache única para esta combinación de filtros
    const societyCode = filters?.societyCode || filters?.societyId;
    const cacheKeyParts = [
      CACHE_PREFIX,
      'list',
      societyCode || 'all',
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
      sortOrder
    ];
    const cacheKey = cacheKeyParts.join(':');

    const cached = await redis.get<PaginatedResult<Category>>(cacheKey);
    if (cached) return cached;

    const prismaParams = getPrismaPaginationParams(page, limit, sortBy, sortOrder);
    const whereClause: any = { isDeleted: false };

    // Filtro por sociedad (prioridad a societyCode si existe)
    if (filters?.societyCode) {
      const society = await prisma.society.findUnique({ where: { code: filters.societyCode } });
      if (society) {
        whereClause.societyId = society.id;
      } else {
        // Si el código no existe, retornar lista vacía (como en OrderService)
        return buildPaginatedResult([], page, limit, 0);
      }
    } else if (filters?.societyId) {
      whereClause.societyId = filters.societyId;
    }

    // Búsqueda por nombre o código (case-insensitive)
    if (filters?.search) {
      whereClause.OR = [
        { name: { contains: filters.search, mode: 'insensitive' } },
        { code: { contains: filters.search, mode: 'insensitive' } }
      ];
    }


    // Filtro por isActive
    if (filters?.isActive !== undefined) {
      whereClause.isActive = filters.isActive;
    }

    // Filtro por createdBy
    if (filters?.createdBy) {
      whereClause.createdBy = filters.createdBy;
    }

    // Filtro de rango de fechas para createdAt (convierte de Lima a UTC con soporte de rango completo)
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

    // Filtro de rango de fechas para updatedAt (convierte de Lima a UTC con soporte de rango completo)
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
  /**
   * Obtener categoría por ID con cache
   */
  getById: async (id: string) => {
    const cacheKey = `${CACHE_PREFIX}:${id}`;

    const cached = await redis.get<Category>(cacheKey);
    if (cached) return cached;

    // 2. Buscar en DB
    const category = await prisma.category.findUnique({
      where: { id, isDeleted: false }
    });

    if (!category) return null;

    // 3. Guardar en cache
    await redis.set(cacheKey, category, CACHE_TTL_SINGLE);

    return category;
  },

  /**
   * Obtener lista de usuarios únicos que han creado categorías
   * Filtrado opcionalmente por societyId
   */
  getCreatedByUsers: async (societyId?: string): Promise<string[]> => {
    const whereClause: any = { isDeleted: false, createdBy: { not: null } };

    if (societyId) {
      // Intentar buscar sociedad por código primero
      const society = await prisma.society.findUnique({ where: { code: societyId } });

      if (society) {
        whereClause.societyId = society.id;
      } else {
        return [];
      }
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
      // Intentar buscar sociedad por código primero
      const society = await prisma.society.findUnique({ where: { code: societyId } });

      if (society) {
        whereClause.societyId = society.id;
      } else {
        const isUuid = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(societyId);

        if (isUuid) {
          whereClause.societyId = societyId;
        } else {
          return [];
        }
      }
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
    const society = await prisma.society.findUnique({ where: { code: data.societyId } });
    if (!society) return null;

    data.societyId = society.id;
    const created = await prisma.category.create({ data });

    // BACKGROUND: Invalidar cache
    setImmediate(async () => {
      try {
        await redis.deleteKeysByPrefix(`${CACHE_PREFIX}:`);
      } catch (e) {
        console.error('[CategoryService] Error background (create):', e);
      }
    });

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

    // BACKGROUND: Invalidar cache
    setImmediate(async () => {
      try {
        await redis.deleteKeysByPrefix(`${CACHE_PREFIX}:`);
      } catch (e) {
        console.error('[CategoryService] Error background (update):', e);
      }
    });

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

    // BACKGROUND: Invalidar cache
    setImmediate(async () => {
      try {
        await redis.deleteKeysByPrefix(`${CACHE_PREFIX}:`);
      } catch (e) {
        console.error('[CategoryService] Error background (delete):', e);
      }
    });

    return deleted;
  },

  /**
   * Obtener categorías para select/dropdown con cache largo
   */
  getForSelect: async (societyCode?: string) => {
    const cacheKey = `${CACHE_PREFIX}:select:${societyCode || 'all'}`;

    const cached = await redis.get<{ id: string; name: string; code: string }[]>(cacheKey);
    if (cached) return cached;

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
    await redis.deleteKeysByPrefix(`${CACHE_PREFIX}:`);
    console.log('[Cache] Todo el cache de categorías ha sido invalidado');
  },
};
