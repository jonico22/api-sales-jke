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

// Tipos inferidos de los schemas
type CreateProductInput = z.infer<typeof createProductSchema>['body'];
type UpdateProductInput = z.infer<typeof updateProductSchema>['body'];

export const ProductService = {
  /**
   * Obtener todos los productos con paginación y filtros
   */
  getAll: async (
    paginationQuery?: PaginationQuery,
    societyCode?: string,
    categoryCode?: string
  ): Promise<PaginatedResult<Product>> => {
    const page = paginationQuery?.page ?? 1;
    const limit = paginationQuery?.limit ?? 10;
    const sortBy = paginationQuery?.sortBy;
    const sortOrder = paginationQuery?.sortOrder ?? 'desc';

    const prismaParams = getPrismaPaginationParams(page, limit, sortBy, sortOrder);

    // Construir filtro base
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

    // Ejecutar en transacción
    const [data, total] = await prisma.$transaction([
      prisma.product.findMany({
        where: whereClause,
        skip: prismaParams.skip,
        take: prismaParams.take,
        orderBy: prismaParams.orderBy ?? { createdAt: sortOrder },
        include: {
          category: { select: { name: true } },
          image: true,
        },
      }),
      prisma.product.count({ where: whereClause }),
    ]);

    return buildPaginatedResult(data, page, limit, total);
  },

  /**
   * Obtener producto por ID
   */
  getById: async (id: string) => {
    return prisma.product.findFirst({
      where: { id, isDeleted: false },
      include: {
        society: { select: { id: true, name: true, code: true } },
        category: { select: { id: true, name: true, code: true } },
        image: true,
      },
    });
  },

  /**
   * Crear un nuevo producto
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
    return prisma.product.create({
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
  },

  /**
   * Actualizar un producto
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

    return prisma.product.update({
      where: { id },
      data: updateData,
      include: {
        society: { select: { id: true, name: true, code: true } },
        category: { select: { id: true, name: true, code: true } },
        image: true,
      },
    });
  },

  /**
   * Eliminar producto (soft delete)
   */
  delete: async (id: string, updatedBy?: string) => {
    return prisma.product.update({
      where: { id },
      data: {
        isDeleted: true,
        isActive: false,
        updatedBy,
      },
    });
  },

  /**
   * Obtener productos para select/dropdown (sin paginación)
   * Retorna solo campos necesarios: id, name, code (si existe), price
   */
  getForSelect: async (societyCode?: string, categoryCode?: string) => {
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

    return prisma.product.findMany({
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
  },
};
