import prisma from '@/config/prisma';
import { z } from 'zod';
import { createCategorySchema, updateCategorySchema } from './category.schema';

// Tipos inferidos de los schemas
type CreateCategoryInput = z.infer<typeof createCategorySchema>['body'];
type UpdateCategoryInput = z.infer<typeof updateCategorySchema>['body'];

export const CategoryService = {
  getAll: async () => {
    return prisma.category.findMany({ where: { isDeleted: false } });
  },

  getById: async (id: string) => {
    return prisma.category.findFirst({
      where: { id, isDeleted: false }
    });
  },

  create: async (data: CreateCategoryInput) => {
    return prisma.category.create({ data });
  },

  update: async (id: string, data: UpdateCategoryInput) => {
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
};
