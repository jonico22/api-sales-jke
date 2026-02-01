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

// Tipos inferidos de los schemas
type CreateCategoryInput = z.infer<typeof createCategorySchema>['body'];
type UpdateCategoryInput = z.infer<typeof updateCategorySchema>['body'];

export const CategoryService = {
  /**
   * Obtener todas las categorías con paginación y filtro por sociedad
   */
  getAll: async (paginationQuery?: PaginationQuery, societyCode?: string): Promise<PaginatedResult<Category>> => {
    // Si no hay parámetros de paginación, usar valores por defecto
    const page = paginationQuery?.page ?? 1;
    const limit = paginationQuery?.limit ?? 10;
    const sortBy = paginationQuery?.sortBy;
    const sortOrder = paginationQuery?.sortOrder ?? 'desc';

    const prismaParams = getPrismaPaginationParams(page, limit, sortBy, sortOrder);

    // Construir filtro
    const whereClause: any = { isDeleted: false };

    // Si se envía código de sociedad, buscar su ID
    if (societyCode) {
      const society = await prisma.society.findUnique({ where: { code: societyCode } });
      if (society) {
        whereClause.societyId = society.id;
      } else {
        // Si no existe la sociedad, retornar lista vacía
        return buildPaginatedResult([], page, limit, 0);
      }
    }

    // Ejecutar en transacción para obtener datos y total
    const [data, total] = await prisma.$transaction([
      prisma.category.findMany({
        where: whereClause,
        skip: prismaParams.skip,
        take: prismaParams.take,
        orderBy: prismaParams.orderBy ?? { createdAt: sortOrder },
      }),
      prisma.category.count({ where: whereClause }),
    ]);

    return buildPaginatedResult(data, page, limit, total);
  },

  getById: async (id: string) => {
    return prisma.category.findFirst({
      where: { id, isDeleted: false }
    });
  },

  create: async (data: CreateCategoryInput) => {
    const society = await prisma.society.findUnique({ where: { code: data.societyId } });
    data.societyId = society?.id ?? '';
    if (!society) return null;
    return prisma.category.create({ data });
  },

  update: async (id: string, data: UpdateCategoryInput) => {
    if (data.societyId) {
      const society = await prisma.society.findUnique({ where: { code: data.societyId } });
      if (!society) return null;
      data.societyId = society.id;
    }

    return prisma.category.update({
      where: { id },
      data,
    });
  },

  delete: async (id: string, updatedBy?: string) => {
    return prisma.category.update({
      where: { id },
      data: {
        isDeleted: true,
        isActive: false,
        updatedBy,
      },
    });
  },

  /**
   * Obtener categorías para select/dropdown (sin paginación)
   * Retorna solo campos necesarios: id, name, code
   */
  getForSelect: async (societyCode?: string) => {
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

    return prisma.category.findMany({
      where: whereClause,
      select: {
        id: true,
        name: true,
        code: true,
      },
      orderBy: { name: 'asc' },
    });
  },
};
