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
import { formatToLimaTime, convertLimaTimeToUTC, convertLimaDateRangeToUTC } from '@/utils/dateFormatter';
import { redis } from '@/config/redis';
import { publishRealtimeUpdate } from '@/config/event-publisher';

// Tipos inferidos de los schemas
type CreateProductInput = z.infer<typeof createProductSchema>['body'];
type UpdateProductInput = z.infer<typeof updateProductSchema>['body'];

// Constantes de cache
const CACHE_PREFIX = 'products:';
const CACHE_TTL_LIST = 300; // 5 minutos para listas
const CACHE_TTL_SINGLE = 600; // 10 minutos para registro individual
const CACHE_TTL_SELECT = 900; // 15 minutos para select (datos que cambian poco)

// Tipo para los filtros de producto
export interface ProductFilters {
  societyCode?: string;
  societyId?: string;
  categoryCode?: string;
  categoryId?: string;
  search?: string;
  isActive?: boolean;
  priceFrom?: number;
  priceTo?: number;
  priceCostFrom?: number;
  priceCostTo?: number;
  lowStock?: boolean;
  stockStatus?: 'all' | 'available' | 'low' | 'out'; // Todos | Disponible | Bajo Stock | Agotado
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

export const ProductService = {
  /**
   * Obtener todos los productos con paginación y filtros
   * Con cache de Redis
   */
  getAll: async (
    paginationQuery?: PaginationQuery,
    filters?: ProductFilters
  ): Promise<PaginatedResult<Product>> => {
    const page = paginationQuery?.page ?? 1;
    const limit = paginationQuery?.limit ?? 10;
    const sortBy = paginationQuery?.sortBy ?? 'createdAt';
    const sortOrder = paginationQuery?.sortOrder ?? 'desc';

    // Construir clave de cache única para esta combinación de filtros
    const societyCode = filters?.societyCode || filters?.societyId;
    const categoryCode = filters?.categoryCode; // keep code only
    const categoryId = filters?.categoryId;
    const cacheKeyParts = [
      'list',
      societyCode || 'all',
      categoryCode || 'all',
      categoryId || 'all',
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
      sortOrder
    ];
    const cacheKey = `${CACHE_PREFIX}${cacheKeyParts.join(':')}`;

    // 1. Intentar obtener del cache
    const cached = await redis.get<PaginatedResult<Product>>(cacheKey);
    if (cached) return cached;

    const prismaParams = getPrismaPaginationParams(page, limit, sortBy, sortOrder);
    const whereClause: any = { isDeleted: false };

    // Filtro por sociedad
    if (societyCode) {
      const society = await prisma.society.findUnique({ where: { code: societyCode } });
      if (society) {
        whereClause.societyId = society.id;
      } else {
        return buildPaginatedResult([], page, limit, 0);
      }
    }

    // Filtro por categoría ID directa
    if (filters?.categoryId) {
      whereClause.categoryId = filters.categoryId;
    }
    // Filtro por categoría código (mantener compatibilidad)
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

    // Búsqueda por nombre o código (case-insensitive)
    if (filters?.search) {
      whereClause.OR = [
        { name: { contains: filters.search, mode: 'insensitive' } },
        { code: { contains: filters.search, mode: 'insensitive' } },
        { barcode: { contains: filters.search, mode: 'insensitive' } },
        { brand: { contains: filters.search, mode: 'insensitive' } },
        { color: { contains: filters.search, mode: 'insensitive' } }
      ];
    }

    // Filtro por isActive
    if (filters?.isActive !== undefined) {
      whereClause.isActive = filters.isActive;
    }

    // Filtro por brand
    if (filters?.brand) {
      whereClause.brand = { contains: filters.brand, mode: 'insensitive' };
    }

    // Filtro por color
    if (filters?.color) {
      whereClause.color = { contains: filters.color, mode: 'insensitive' };
    }

    // Filtro de rango de precio
    if (filters?.priceFrom !== undefined || filters?.priceTo !== undefined) {
      whereClause.price = {};
      if (filters.priceFrom !== undefined) {
        whereClause.price.gte = filters.priceFrom;
      }
      if (filters.priceTo !== undefined) {
        whereClause.price.lte = filters.priceTo;
      }
    }

    // Filtro de rango de precio de costo
    if (filters?.priceCostFrom !== undefined || filters?.priceCostTo !== undefined) {
      whereClause.priceCost = {};
      if (filters.priceCostFrom !== undefined) {
        whereClause.priceCost.gte = filters.priceCostFrom;
      }
      if (filters.priceCostTo !== undefined) {
        whereClause.priceCost.lte = filters.priceCostTo;
      }
    }

    // Filtro de stock bajo (stock <= minStock)
    // Nota: Prisma no permite comparar campos directamente, así que lo haremos manualmente después
    const applyLowStockFilter = filters?.lowStock === true || filters?.stockStatus === 'low';

    // Filtro stockStatus: Disponible (stock > 0) | Agotado (stock <= 0) | Bajo Stock (post-process)
    if (filters?.stockStatus === 'available') {
      whereClause.stock = { gt: 0 };
    } else if (filters?.stockStatus === 'out') {
      whereClause.stock = { lte: 0 }; // lte:0 es más compatible con Prisma que equals:0
    }

    // Filtro de rango de stock
    if (filters?.stockFrom !== undefined || filters?.stockTo !== undefined) {
      // No aplicar si ya hay filtro de stockStatus o lowStock
      if (!applyLowStockFilter && !filters?.stockStatus) {
        whereClause.stock = {};
        if (filters.stockFrom !== undefined) {
          whereClause.stock.gte = filters.stockFrom;
        }
        if (filters.stockTo !== undefined) {
          whereClause.stock.lte = filters.stockTo;
        }
      }
    }

    // Filtro por createdBy
    if (filters?.createdBy) {
      whereClause.createdBy = filters.createdBy;
    }

    // Filtro por updatedBy
    if (filters?.updatedBy) {
      whereClause.updatedBy = filters.updatedBy;
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
          barcode: true,
          brand: true,
          unitOfMeasureId: true,
          unitOfMeasure: true,
          category: { select: { name: true } },
          image: true,
          color: true,
          colorCode: true,
          salesCount: true,
        },
      }),
      prisma.product.count({ where: whereClause }),
    ]);

    // Aplicar filtro de stock bajo si es necesario (post-procesamiento)
    let filteredData = data;
    let filteredTotal = total;
    if (applyLowStockFilter) {
      filteredData = data.filter(item => item.stock <= item.minStock);
      filteredTotal = filteredData.length;
    }

    // Formatear fechas
    const formattedData = filteredData.map(item => ({
      ...item,
      createdAt: formatToLimaTime(item.createdAt) as any,
      updatedAt: item.updatedAt ? formatToLimaTime(item.updatedAt) as any : item.updatedAt,
    }));

    const result = buildPaginatedResult(formattedData, page, limit, filteredTotal);

    // 3. Guardar en cache
    await redis.set(cacheKey, result, CACHE_TTL_LIST);

    return result;
  },

  getBestSellers: async (limit: number = 10, societyId?: string) => {
    const whereClause: any = { isDeleted: false, isActive: true, salesCount: { gte: 1 } };

    if (societyId) {
      // Check if it's a code or ID
      const isUuid = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(societyId);
      if (!isUuid) {
        const society = await prisma.society.findUnique({ where: { code: societyId } });
        if (society) whereClause.societyId = society.id;
        else return []; // Early return if society code invalid
      } else {
        whereClause.societyId = societyId;
      }
    }

    // Cache key
    const cacheKey = `products:best_sellers:${limit}:${societyId || 'all'}`;
    const cached = await redis.get<Product[]>(cacheKey);
    if (cached) return cached;

    const products = await prisma.product.findMany({
      where: whereClause,
      orderBy: { salesCount: 'desc' },
      take: limit,
      include: {
        category: { select: { id: true, name: true } },
        image: { select: { path: true } } // Assuming structure or just path
      }
    });

    await redis.set(cacheKey, products, 300); // 5 min cache
    return products;
  },

  /**
   * Obtener producto por ID con cache
   */
  getById: async (id: string) => {
    const cacheKey = `${CACHE_PREFIX}${id}`;

    const cached = await redis.get<Product>(cacheKey);
    if (cached) return cached;

    // 2. Buscar en DB
    const product = await prisma.product.findUnique({
      where: { id, isDeleted: false },
      include: {
        society: { select: { id: true, name: true, code: true } },
        category: { select: { id: true, name: true, code: true } },
        image: true,
      },
    });

    if (!product) return null;

    // 3. Guardar en cache
    await redis.set(cacheKey, product, CACHE_TTL_SINGLE);

    return product;
  },

  /**
   * Obtener lista de usuarios únicos que han creado productos
   * Filtrado opcionalmente por societyId
   */
  getCreatedByUsers: async (societyId?: string): Promise<string[]> => {
    const whereClause: any = { isDeleted: false, createdBy: { not: null } };

    if (societyId) {
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

    const result = await prisma.product.findMany({
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
   * Obtener lista de usuarios únicos que han actualizado productos
   * Filtrado opcionalmente por societyId
   */
  getUpdatedByUsers: async (societyId?: string): Promise<string[]> => {
    const whereClause: any = { isDeleted: false, updatedBy: { not: null } };

    if (societyId) {
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

    const result = await prisma.product.findMany({
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
   * Obtener lista única de marcas (con cache)
   */
  getUniqueBrands: async (societyId?: string): Promise<{ id: string; brand: string }[]> => {
    const cacheKey = `${CACHE_PREFIX}brands:${societyId || 'all'}`;
    const cached = await redis.get<{ id: string; brand: string }[]>(cacheKey);
    if (cached) return cached;

    const whereClause: any = { isDeleted: false, brand: { not: null } };

    if (societyId) {
      const society = await prisma.society.findUnique({ where: { code: societyId } });
      if (society) {
        whereClause.societyId = society.id;
      } else {
        const isUuid = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(societyId);
        if (isUuid) whereClause.societyId = societyId;
        else return [];
      }
    }

    const result = await prisma.product.findMany({
      where: whereClause,
      distinct: ['brand'],
      select: { brand: true },
      orderBy: { brand: 'asc' }
    });

    const brands = result
      .filter((item): item is { brand: string } => typeof item.brand === 'string' && item.brand.length > 0)
      .map(item => ({ id: item.brand, brand: item.brand }));

    await redis.set(cacheKey, brands, CACHE_TTL_SELECT);
    return brands;
  },

  /**
   * Obtener lista única de colores (con cache)
   */
  getUniqueColors: async (societyId?: string): Promise<{ id: string; color: string; colorCode: string | null }[]> => {
    const cacheKey = `${CACHE_PREFIX}colors:${societyId || 'all'}`;
    const cached = await redis.get<{ id: string; color: string; colorCode: string | null }[]>(cacheKey);
    if (cached) return cached;

    const whereClause: any = { isDeleted: false, color: { not: null } };

    if (societyId) {
      const society = await prisma.society.findUnique({ where: { code: societyId } });
      if (society) {
        whereClause.societyId = society.id;
      } else {
        const isUuid = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(societyId);
        if (isUuid) whereClause.societyId = societyId;
        else return [];
      }
    }

    const result = await prisma.product.findMany({
      where: whereClause,
      distinct: ['color'],
      select: { color: true, colorCode: true },
      orderBy: { color: 'asc' }
    });

    const colors = result
      .filter((item): item is { color: string; colorCode: string | null } => typeof item.color === 'string' && item.color.length > 0)
      .map(item => ({ id: item.color, color: item.color, colorCode: item.colorCode }));

    await redis.set(cacheKey, colors, CACHE_TTL_SELECT);
    return colors;
  },

  /**
   * Crear un nuevo producto e invalidar cache de listas
   */
  create: async (data: CreateProductInput) => {
    // ─── 1. PARALLEL: Resolver Society + Category ────────────────────
    const [society, category] = await Promise.all([
      prisma.society.findUnique({ where: { code: data.societyId } }),
      prisma.category.findFirst({ where: { code: data.categoryId, isDeleted: false } })
    ]);

    if (!society) return { error: 'Código de sociedad inválido' };
    if (!category) return { error: 'Código de categoría inválido' };

    // ─── 2. Crear producto ────────────────────────────────────────────
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
        isActive: data.isActive,
        createdBy: data.createdBy,
        code: data.code,
        barcode: data.barcode,
        brand: data.brand,
        unitOfMeasure: data.unitOfMeasure || 'NIU',
        color: data.color,
        colorCode: data.colorCode,
      },
      include: {
        society: { select: { id: true, name: true, code: true } },
        category: { select: { id: true, name: true, code: true } },
        image: true,
      },
    });

    // ─── 3. Auto-assign to Main Branch + Update Counter ──────────────
    const mainBranch = await prisma.branchOffice.findFirst({
      where: { societyId: society.id, code: 'ALM-PRINCIPAL' }
    });

    await Promise.all([
      mainBranch ? prisma.branchOfficeProduct.create({
        data: {
          branchOfficeId: mainBranch.id,
          productId: created.id,
          physicalStock: data.stock ?? 0,
          availableStock: data.stock ?? 0,
          location: 'ALMACEN-GENERAL',
          isActive: true
        }
      }) : Promise.resolve(),
      prisma.society.update({
        where: { id: society.id },
        data: { totalProducts: { increment: 1 } }
      })
    ]);

    // ─── 4. BACKGROUND: Cache + Notifications ────────────────────────
    const societyId = society.id;
    const subscriptionId = society.subscriptionId;

    setImmediate(async () => {
      try {
        await redis.deleteKeysByPrefix('products:');
        await Promise.all(
          ['stats', 'sales-performance', 'revenue-category', 'top-products', 'payment-methods', 'branch-performance', 'cash-flow']
            .map(k => redis.del(`dashboard:${k}:${societyId}`))
        );

        if (subscriptionId) {
          await Promise.all([
            publishRealtimeUpdate(subscriptionId, 'PRODUCTO', {
              id: created.id, action: 'CREATED', name: created.name, code: created.code
            }),
            publishRealtimeUpdate(subscriptionId, 'DASHBOARD', { action: 'REFRESH_STATS' })
          ]);
        }
      } catch (error) {
        console.error('[ProductService] ❌ Error background (create):', error);
      }
    });

    return created;
  },

  /**
   * Actualizar un producto e invalidar cache
   */
  update: async (id: string, data: UpdateProductInput) => {
    const updateData: any = { ...data };

    // ─── PARALLEL: Resolver Society + Category si se envían ──────────
    const [societyResult, categoryResult] = await Promise.all([
      data.societyId
        ? prisma.society.findUnique({ where: { code: data.societyId } })
        : Promise.resolve(null),
      data.categoryId
        ? prisma.category.findFirst({ where: { code: data.categoryId, isDeleted: false } })
        : Promise.resolve(null)
    ]);

    if (data.societyId) {
      if (!societyResult) return { error: 'Código de sociedad inválido' };
      updateData.societyId = societyResult.id;
    }
    if (data.categoryId) {
      if (!categoryResult) return { error: 'Código de categoría inválido' };
      updateData.categoryId = categoryResult.id;
    }

    const updated = await prisma.product.update({
      where: { id },
      data: updateData,
      include: {
        society: { select: { id: true, name: true, code: true, subscriptionId: true } },
        category: { select: { id: true, name: true, code: true } },
        image: true,
      },
    });

    // SYNC STOCK WITH MAIN BRANCH (critical, must stay synchronous)
    if (data.stock !== undefined) {
      const mainBranch = await prisma.branchOffice.findFirst({
        where: { societyId: updated.societyId, code: 'ALM-PRINCIPAL' }
      });

      if (mainBranch) {
        const existingBOP = await prisma.branchOfficeProduct.findUnique({
          where: {
            productId_branchOfficeId: { productId: id, branchOfficeId: mainBranch.id }
          }
        });

        const currentReserved = existingBOP?.reservedStock ?? 0;
        const newPhysical = data.stock;
        const newAvailable = newPhysical - currentReserved;

        await prisma.branchOfficeProduct.upsert({
          where: {
            productId_branchOfficeId: { productId: id, branchOfficeId: mainBranch.id }
          },
          update: { physicalStock: newPhysical, availableStock: newAvailable },
          create: {
            productId: id,
            branchOfficeId: mainBranch.id,
            physicalStock: newPhysical,
            availableStock: newPhysical,
            reservedStock: 0,
            location: 'ALMACEN-GENERAL',
            isActive: true
          }
        });
      }
    }

    // ─── BACKGROUND: Cache + Notifications ────────────────────────────
    const updatedSocietyId = updated.societyId;
    const subscriptionId = updated.society.subscriptionId;

    setImmediate(async () => {
      try {
        await Promise.all([
          redis.deleteKeysByPrefix('products:'),
          redis.deleteKeysByPrefix('branch_office_products:'),
          ...['stats', 'sales-performance', 'revenue-category', 'top-products', 'payment-methods', 'branch-performance', 'cash-flow']
            .map(k => redis.del(`dashboard:${k}:${updatedSocietyId}`))
        ]);

        if (subscriptionId) {
          await Promise.all([
            publishRealtimeUpdate(subscriptionId, 'PRODUCTO', {
              id: updated.id, action: 'UPDATED', name: updated.name, code: updated.code
            }),
            publishRealtimeUpdate(subscriptionId, 'DASHBOARD', { action: 'REFRESH_STATS' })
          ]);
        }
      } catch (error) {
        console.error('[ProductService] ❌ Error background (update):', error);
      }
    });

    return updated;
  },

  /**
   * Eliminar producto (soft delete) e invalidar cache
   */
  delete: async (id: string, updatedBy?: string) => {
    const deleted = await prisma.product.update({
      where: { id },
      data: { isDeleted: true, isActive: false, updatedBy },
      include: { society: { select: { subscriptionId: true } } }
    });

    // Decrement counter (synchronous, important for consistency)
    await prisma.society.update({
      where: { id: deleted.societyId },
      data: { totalProducts: { decrement: 1 } }
    });

    // ─── BACKGROUND: Cache + Notifications ────────────────────────────
    const deletedSocietyId = deleted.societyId;
    const subscriptionId = deleted.society.subscriptionId;

    setImmediate(async () => {
      try {
        await Promise.all([
          redis.deleteKeysByPrefix('products:'),
          redis.deleteKeysByPrefix('branch_office_products:'),
          ...['stats', 'sales-performance', 'revenue-category', 'top-products', 'payment-methods', 'branch-performance', 'cash-flow']
            .map(k => redis.del(`dashboard:${k}:${deletedSocietyId}`))
        ]);

        if (subscriptionId) {
          await Promise.all([
            publishRealtimeUpdate(subscriptionId, 'PRODUCTO', {
              id: deleted.id, action: 'DELETED', name: deleted.name, code: deleted.code
            }),
            publishRealtimeUpdate(subscriptionId, 'DASHBOARD', { action: 'REFRESH_STATS' })
          ]);
        }
      } catch (error) {
        console.error('[ProductService] ❌ Error background (delete):', error);
      }
    });

    return deleted;
  },

  /**
   * Obtener productos para select/dropdown con cache largo
   */
  getForSelect: async (societyCode?: string, categoryCode?: string) => {
    const cacheKey = `${CACHE_PREFIX}select:${societyCode || 'all'}:${categoryCode || 'all'}`;

    const cached = await redis.get<any[]>(cacheKey);
    if (cached) return cached;

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
        code: true,
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
