import prisma from '@/config/prisma';
import { CreateProductInput, UpdateProductInput } from './product.schema';
import {
  PaginatedResult,
  getPrismaPaginationParams,
  buildPaginatedResult,
  PaginationQuery,
} from '@/utils/pagination';
import { Product } from '@prisma/client';
import { formatToLimaTime } from '@/utils/dateFormatter';
import { redis } from '@/config/redis';
import {
  buildProductListCacheKey,
  buildProductSelectCacheKey,
  buildProductWhereClause,
  getProductListParams,
  PRODUCT_CACHE_PREFIX,
  PRODUCT_CACHE_TTL_LIST,
  PRODUCT_CACHE_TTL_SELECT,
  PRODUCT_CACHE_TTL_SINGLE,
  ProductFilters,
  resolveCategoryId,
  resolveDefaultProductBranchId,
  resolveSocietyByCodeOrId,
  resolveSocietyId,
} from './product.helpers';
import {
  scheduleProductMutationSideEffects,
  syncProductStockWithMainBranch,
} from './product.service.support';

export const ProductService = {
  /**
   * Obtener todos los productos con paginación y filtros
   * Con cache de Redis
   */
  getAll: async (
    paginationQuery?: PaginationQuery,
    filters?: ProductFilters
  ): Promise<PaginatedResult<Product>> => {
    const { page, limit, sortBy, sortOrder } = getProductListParams(paginationQuery);
    const prismaParams = getPrismaPaginationParams(page, limit, sortBy, sortOrder);

    const resolvedSocietyId = await resolveSocietyId(filters?.societyCode || filters?.societyId, filters?.branchId);
    if (!resolvedSocietyId) {
      return buildPaginatedResult([], page, limit, 0);
    }

    const cacheKey = buildProductListCacheKey(resolvedSocietyId, page, limit, sortBy, sortOrder, filters);

    const cached = await redis.get<PaginatedResult<Product>>(cacheKey);
    if (cached) return cached;

    const resolvedCategoryId = filters?.categoryCode
      ? await resolveCategoryId(filters.categoryCode, resolvedSocietyId)
      : undefined;
    if (filters?.categoryCode && !resolvedCategoryId) {
      return buildPaginatedResult([], page, limit, 0);
    }

    const whereClause = buildProductWhereClause(resolvedSocietyId, filters, resolvedCategoryId ?? undefined);

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
          // Traer stock de sucursal si se filtra por una
          ...(filters?.branchId && {
            BranchOfficeProduct: {
               where: { branchOfficeId: filters.branchId },
               select: { availableStock: true }
            }
          })
        },
      }),
      prisma.product.count({ where: whereClause }),
    ]);

    // 3. Transformar resultados para mostrar stock de sucursal si aplica y formatear fechas
    const formattedData = data.map((p: any) => {
      let finalStock = p.stock;
      if (filters?.branchId && p.BranchOfficeProduct?.[0]) {
        finalStock = p.BranchOfficeProduct[0].availableStock;
      }

      const { BranchOfficeProduct, ...rest } = p;
      return {
        ...rest,
        stock: finalStock,
        createdAt: formatToLimaTime(p.createdAt) as any,
        updatedAt: p.updatedAt ? formatToLimaTime(p.updatedAt) as any : p.updatedAt,
      };
    });

    const result = buildPaginatedResult(formattedData, page, limit, total);

    await redis.set(cacheKey, result, PRODUCT_CACHE_TTL_LIST);

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
  getById: async (id: string, branchId?: string) => {
    const cacheKey = branchId ? `${PRODUCT_CACHE_PREFIX}${id}:${branchId}` : `${PRODUCT_CACHE_PREFIX}${id}`;

    const cached = await redis.get<any>(cacheKey);
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

    // Si se especifica sucursal, buscar el stock específico
    let finalProduct: any = { ...product };
    if (branchId) {
        const branchStock = await prisma.branchOfficeProduct.findUnique({
            where: { productId_branchOfficeId: { productId: id, branchOfficeId: branchId } },
            select: { availableStock: true }
        });
        if (branchStock) {
            finalProduct.stock = branchStock.availableStock;
        }
    }

    // 3. Guardar en cache
    await redis.set(cacheKey, finalProduct, PRODUCT_CACHE_TTL_SINGLE);

    return finalProduct;
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
    // Sin sociedad no retornamos nada (evitar filtrar todas las marcas de todas las sociedades)
    if (!societyId) return [];

    // Solo productos activos y no eliminados para que los dropdowns coincidan con el catálogo visible
    const whereClause: any = { isDeleted: false, isActive: true, brand: { not: null } };
    let resolvedSocietyId: string | undefined;

    const isUuid = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(societyId);
    if (isUuid) {
      resolvedSocietyId = societyId;
      whereClause.societyId = societyId;
    } else {
      const society = await prisma.society.findUnique({ where: { code: societyId } });
      if (society) {
        resolvedSocietyId = society.id;
        whereClause.societyId = society.id;
      } else {
        return [];
      }
    }

    // Usar el UUID resuelto en la clave de caché para evitar colisiones (Scope por sociedad)
    const cacheKey = `${PRODUCT_CACHE_PREFIX}${resolvedSocietyId}:brands:all`;
    const cached = await redis.get<{ id: string; brand: string }[]>(cacheKey);
    if (cached) return cached;

    const result = await prisma.product.findMany({
      where: whereClause,
      distinct: ['brand'],
      select: { brand: true },
      orderBy: { brand: 'asc' }
    });

    const brands = result
      .filter((item): item is { brand: string } => typeof item.brand === 'string' && item.brand.length > 0)
      .map(item => ({ id: item.brand, brand: item.brand }));

    await redis.set(cacheKey, brands, PRODUCT_CACHE_TTL_SELECT);
    return brands;
  },

  /**
   * Obtener lista única de colores (con cache)
   */
  getUniqueColors: async (societyId?: string): Promise<{ id: string; color: string; colorCode: string | null }[]> => {
    // Sin sociedad no retornamos nada (evitar filtrar todos los colores de todas las sociedades)
    if (!societyId) return [];

    // Solo productos activos y no eliminados para que los dropdowns coincidan con el catálogo visible
    const whereClause: any = { isDeleted: false, isActive: true, color: { not: null } };
    let resolvedSocietyId: string | undefined;

    const isUuid = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(societyId);
    if (isUuid) {
      resolvedSocietyId = societyId;
      whereClause.societyId = societyId;
    } else {
      const society = await prisma.society.findUnique({ where: { code: societyId } });
      if (society) {
        resolvedSocietyId = society.id;
        whereClause.societyId = society.id;
      } else {
        return [];
      }
    }

    // Usar el UUID resuelto en la clave de caché para evitar colisiones (Scope por sociedad)
    const cacheKey = `${PRODUCT_CACHE_PREFIX}${resolvedSocietyId}:colors:all`;
    const cached = await redis.get<{ id: string; color: string; colorCode: string | null }[]>(cacheKey);
    if (cached) return cached;

    const result = await prisma.product.findMany({
      where: whereClause,
      distinct: ['color'],
      select: { color: true, colorCode: true },
      orderBy: { color: 'asc' }
    });

    const colors = result
      .filter((item): item is { color: string; colorCode: string | null } => typeof item.color === 'string' && item.color.length > 0)
      .map(item => ({ id: item.color, color: item.color, colorCode: item.colorCode }));

    await redis.set(cacheKey, colors, PRODUCT_CACHE_TTL_SELECT);
    return colors;
  },

  /**
   * Crear un nuevo producto e invalidar cache de listas
   */
  create: async (data: CreateProductInput) => {
    const society = await resolveSocietyByCodeOrId(data.societyId);
    if (!society) return { error: 'Código de sociedad inválido' };

    const categoryId = await resolveCategoryId(data.categoryId, society.id);
    if (!categoryId) return { error: 'Código de categoría inválido' };

    const created = await prisma.product.create({
      data: {
        name: data.name,
        description: data.description,
        price: data.price,
        priceCost: data.priceCost,
        stock: data.stock ?? 0,
        minStock: data.minStock ?? 0,
        societyId: society.id,
        categoryId,
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

    const mainBranch = await prisma.branchOffice.findFirst({
      where: { societyId: society.id, code: 'ALM-PRINCIPAL' },
      select: { id: true },
    });

    await Promise.all([
      mainBranch
        ? prisma.branchOfficeProduct.create({
            data: {
              branchOfficeId: mainBranch.id,
              productId: created.id,
              physicalStock: data.stock ?? 0,
              availableStock: data.stock ?? 0,
              location: 'ALMACEN-GENERAL',
              isActive: true,
            },
          })
        : Promise.resolve(),
      prisma.society.update({
        where: { id: society.id },
        data: { totalProducts: { increment: 1 } },
      }),
    ]);

    scheduleProductMutationSideEffects({
      societyId: society.id,
      subscriptionId: society.subscriptionId,
      product: { id: created.id, name: created.name, code: created.code },
      action: 'CREATED',
    });

    return created;
  },

  /**
   * Actualizar un producto e invalidar cache
   */
  update: async (id: string, data: UpdateProductInput) => {
    const updateData: any = { ...data };
    const currentProduct = await prisma.product.findUnique({
      where: { id },
      select: { societyId: true }
    });

    if (!currentProduct) {
      return null;
    }

    const [societyResult] = await Promise.all([
      data.societyId ? resolveSocietyByCodeOrId(data.societyId) : Promise.resolve(null),
    ]);

    if (data.societyId) {
      if (!societyResult) return { error: 'Código de sociedad inválido' };
      updateData.societyId = societyResult.id;
    }

    const targetSocietyId = updateData.societyId || currentProduct.societyId;
    if (data.categoryId) {
      const categoryId = await resolveCategoryId(data.categoryId, targetSocietyId);
      if (!categoryId) return { error: 'Código de categoría inválido' };
      updateData.categoryId = categoryId;
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

    if (data.stock !== undefined) {
      await syncProductStockWithMainBranch(id, updated.societyId, data.stock);
    }

    scheduleProductMutationSideEffects({
      societyId: updated.societyId,
      subscriptionId: updated.society.subscriptionId,
      product: { id: updated.id, name: updated.name, code: updated.code },
      action: 'UPDATED',
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
      data: { totalProducts: { decrement: 1 } },
    });

    scheduleProductMutationSideEffects({
      societyId: deleted.societyId,
      subscriptionId: deleted.society.subscriptionId,
      product: { id: deleted.id, name: deleted.name, code: deleted.code },
      action: 'DELETED',
    });

    return deleted;
  },

  /**
   * Obtener productos para select/dropdown con cache largo
   */
  getForSelect: async (
    societyCode?: string,
    categoryCode?: string,
    branchId?: string,
    search?: string
  ) => {
    const resolvedSocietyId = await resolveSocietyId(societyCode, branchId);
    if (!resolvedSocietyId) return [];

    const normalizedSearch = search?.trim();
    const cacheKey = buildProductSelectCacheKey(resolvedSocietyId, categoryCode, branchId, normalizedSearch);
    const cached = await redis.get<any[]>(cacheKey);
    if (cached) return cached;

    const whereClause: any = {
      isDeleted: false,
      isActive: true,
      societyId: resolvedSocietyId,
    };

    if (categoryCode) {
      const categoryId = await resolveCategoryId(categoryCode, resolvedSocietyId);
      if (!categoryId) return [];
      whereClause.categoryId = categoryId;
    }

    const targetBranchId = await resolveDefaultProductBranchId(resolvedSocietyId, branchId);
    if (targetBranchId) {
      whereClause.BranchOfficeProduct = {
        some: {
          branchOfficeId: targetBranchId,
          availableStock: { gt: 0 },
        },
      };
    }

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

    const products = await prisma.product.findMany({
      where: whereClause,
      select: {
        id: true,
        name: true,
        price: true,
        code: true,
        category: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
        BranchOfficeProduct: targetBranchId
          ? {
              where: { branchOfficeId: targetBranchId },
              select: { availableStock: true },
            }
          : undefined,
      },
      orderBy: { name: 'asc' },
    });

    const formattedProducts = products.map((product) => {
      const stock = (product as any).BranchOfficeProduct?.[0]?.availableStock ?? 0;
      const { BranchOfficeProduct, ...rest } = product as any;
      return {
        ...rest,
        stock,
      };
    });

    await redis.set(cacheKey, formattedProducts, PRODUCT_CACHE_TTL_SELECT);

    return formattedProducts;
  },

  /**
   * Invalidar todo el cache de productos (para uso manual si es necesario)
   */
  invalidateAllCache: async () => {
    await redis.deleteKeysByPrefix(PRODUCT_CACHE_PREFIX);
    console.log('[Cache] Todo el cache de productos ha sido invalidado');
  },
};
