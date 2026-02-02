import prisma from '@/config/prisma';
import { z } from 'zod';
import { createProductSchema, updateProductSchema } from './product.schema';
import {
  PaginatedResult,
  getPrismaPaginationParams,
  buildPaginatedResult,
  PaginationQuery,
} from '@/utils/pagination';
import { Product } from '@prisma/client';
import { formatToLimaTime } from '@/utils/dateFormatter';
import { redis } from '@/config/redis';

// Tipos inferidos de los schemas
type CreateProductInput = z.infer<typeof createProductSchema>['body'];
type UpdateProductInput = z.infer<typeof updateProductSchema>['body'];

// Constantes de cache
const CACHE_PREFIX = 'products:';
const CACHE_TTL_LIST = 300; // 5 minutos para listas
const CACHE_TTL_SINGLE = 600; // 10 minutos para registro individual
const CACHE_TTL_SELECT = 900; // 15 minutos para select (datos que cambian poco)

export const ProductService = {
  /**
   * Obtener todos los productos con paginación y filtros
   * Con cache de Redis
   */
  getAll: async (
    paginationQuery?: PaginationQuery,
    societyCode?: string,
    categoryCode?: string
  ): Promise<PaginatedResult<Product>> => {
    const page = paginationQuery?.page ?? 1;
    const limit = paginationQuery?.limit ?? 10;
    const sortBy = paginationQuery?.sortBy ?? 'createdAt';
    const sortOrder = paginationQuery?.sortOrder ?? 'desc';

    // Construir clave de cache única para esta combinación de filtros
    const cacheKey = `${CACHE_PREFIX}list:${societyCode || 'all'}:${categoryCode || 'all'}:${page}:${limit}:${sortBy}:${sortOrder}`;

    // 1. Intentar obtener del cache
    const cached = await redis.get<PaginatedResult<Product>>(cacheKey);
    if (cached) {
      console.log(`[Cache HIT] ${cacheKey}`);
      return cached;
    }

    console.log(`[Cache MISS] ${cacheKey}`);

    const prismaParams = getPrismaPaginationParams(page, limit, sortBy, sortOrder);
    const whereClause: any = { isDeleted: false };

    // Resolver código de sociedad a UUID
    if (societyCode) {
      const society = await prisma.society.findUnique({ where: { code: societyCode } });
      if (society) {
        whereClause.societyId = society.id;
      } else {
        return buildPaginatedResult([], page, limit, 0);
      }
    }

    // Resolver código de categoría a UUID
    if (categoryCode) {
      const category = await prisma.category.findFirst({
        where: { code: categoryCode, isDeleted: false }
      });
      if (category) {
        whereClause.categoryId = category.id;
      } else {
        return buildPaginatedResult([], page, limit, 0);
      }
    }

    // 2. Buscar en DB
    const [data, total] = await prisma.$transaction([
      prisma.product.findMany({
        where: whereClause,
        skip: prismaParams.skip,
        take: prismaParams.take,
        orderBy: prismaParams.orderBy ?? { createdAt: sortOrder },
        select: {
          id: true,
          name: true,
          code: true,
          description: true,
          price: true,
          priceCost: true,
          stock: true,
          minStock: true,
          societyId: true,
          categoryId: true,
          imageId: true,
          isActive: true,
          isDeleted: true,
          createdAt: true,
          createdBy: true,
          updatedAt: true,
          updatedBy: true,
          category: { select: { name: true } },
          image: true,
        },
      }),
      prisma.product.count({ where: whereClause }),
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
   * Obtener producto por ID con cache
   */
  getById: async (id: string) => {
    const cacheKey = `${CACHE_PREFIX}${id}`;

    // 1. Intentar obtener del cache
    const cached = await redis.get<Product>(cacheKey);
    if (cached) {
      console.log(`[Cache HIT] ${cacheKey}`);
      return cached;
    }

    console.log(`[Cache MISS] ${cacheKey}`);

    // 2. Buscar en DB
    const product = await prisma.product.findFirst({
      where: { id, isDeleted: false },
      include: {
        society: { select: { id: true, name: true, code: true } },
        category: { select: { id: true, name: true, code: true } },
        image: true,
      },
    });

    // 3. Guardar en cache
    if (product) {
      await redis.set(cacheKey, product, CACHE_TTL_SINGLE);
    }

    return product;
  },

  /**
   * Crear un nuevo producto e invalidar cache de listas
   */
  create: async (data: CreateProductInput) => {
    // Resolver código de sociedad
    const society = await prisma.society.findUnique({ where: { code: data.societyId } });
    if (!society) return { error: 'Código de sociedad inválido' };

    // Resolver código de categoría
    const category = await prisma.category.findFirst({
      where: { code: data.categoryId, isDeleted: false }
    });
    if (!category) return { error: 'Código de categoría inválido' };

    // Crear producto con UUIDs resueltos
    const created = await prisma.product.create({
      data: {
        name: data.name,
        description: data.description,
        price: data.price,
        priceCost: data.priceCost,
        stock: data.stock ?? 0,
        minStock: data.minStock ?? 0,
        societyId: society.id,
        categoryId: category.id,
        imageId: data.imageId,
        createdBy: data.createdBy,
        code: data.code,
      },
      include: {
        society: { select: { id: true, name: true, code: true } },
        category: { select: { id: true, name: true, code: true } },
        image: true,
      },
    });

    // Invalidar cache de listas
    await redis.deleteKeysByPrefix(`${CACHE_PREFIX}list:`);
    await redis.deleteKeysByPrefix(`${CACHE_PREFIX}select:`);

    return created;
  },

  /**
   * Actualizar un producto e invalidar cache
   */
  update: async (id: string, data: UpdateProductInput) => {
    const updateData: any = { ...data };

    // Si se envía código de sociedad, resolver a UUID
    if (data.societyId) {
      const society = await prisma.society.findUnique({ where: { code: data.societyId } });
      if (!society) return { error: 'Código de sociedad inválido' };
      updateData.societyId = society.id;
    }

    // Si se envía código de categoría, resolver a UUID
    if (data.categoryId) {
      const category = await prisma.category.findFirst({
        where: { code: data.categoryId, isDeleted: false }
      });
      if (!category) return { error: 'Código de categoría inválido' };
      updateData.categoryId = category.id;
    }

    const updated = await prisma.product.update({
      where: { id },
      data: updateData,
      include: {
        society: { select: { id: true, name: true, code: true } },
        category: { select: { id: true, name: true, code: true } },
        image: true,
      },
    });

    // Invalidar cache del registro individual y listas
    await redis.del(`${CACHE_PREFIX}${id}`);
    await redis.deleteKeysByPrefix(`${CACHE_PREFIX}list:`);
    await redis.deleteKeysByPrefix(`${CACHE_PREFIX}select:`);

    return updated;
  },

  /**
   * Eliminar producto (soft delete) e invalidar cache
   */
  delete: async (id: string, updatedBy?: string) => {
    const deleted = await prisma.product.update({
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
   * Obtener productos para select/dropdown con cache largo
   */
  getForSelect: async (societyCode?: string, categoryCode?: string) => {
    const cacheKey = `${CACHE_PREFIX}select:${societyCode || 'all'}:${categoryCode || 'all'}`;

    // 1. Intentar obtener del cache
    const cached = await redis.get<any[]>(cacheKey);
    if (cached) {
      console.log(`[Cache HIT] ${cacheKey}`);
      return cached;
    }

    console.log(`[Cache MISS] ${cacheKey}`);

    const whereClause: any = { isDeleted: false, isActive: true };

    // Si se envía código de sociedad, buscar su ID
    if (societyCode) {
      const society = await prisma.society.findUnique({ where: { code: societyCode } });
      if (society) {
        whereClause.societyId = society.id;
      } else {
        return [];
      }
    }

    // Si se envía código de categoría, buscar su ID
    if (categoryCode) {
      const category = await prisma.category.findFirst({
        where: { code: categoryCode, isDeleted: false }
      });
      if (category) {
        whereClause.categoryId = category.id;
      } else {
        return [];
      }
    }

    const products = await prisma.product.findMany({
      where: whereClause,
      select: {
        id: true,
        name: true,
        price: true,
        stock: true,
        category: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
      },
      orderBy: { name: 'asc' },
    });

    // Guardar en cache con TTL largo
    await redis.set(cacheKey, products, CACHE_TTL_SELECT);

    return products;
  },

  /**
   * Invalidar todo el cache de productos (para uso manual si es necesario)
   */
  invalidateAllCache: async () => {
    await redis.deleteKeysByPrefix(CACHE_PREFIX);
    console.log('[Cache] Todo el cache de productos ha sido invalidado');
  },
};
