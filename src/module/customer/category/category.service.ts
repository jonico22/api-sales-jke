import prisma from '@/config/prisma';
import { createCategorySchema, updateCategorySchema } from './category.schema';

export const CategoryService = {
  getAll: async () => {
    return prisma.category.findMany({ where: { isDeleted: false } });
  },

  getById: async (id: string) => {
    return prisma.category.findUnique({ where: { id } });
  },

  create: async (data: unknown) => {
    const parsed = createCategorySchema.parse({ body: data });
    return prisma.category.create({ data: parsed.body });
  },

  update: async (id: string, data: unknown) => {
    const parsed = updateCategorySchema.parse({ body: data });
    return prisma.category.update({
      where: { id },
      data: {
        ...parsed.body,
        updatedAt: new Date(),
      },
    });
  },

  delete: async (id: string) => {
    return prisma.category.update({
      where: { id },
      data: {
        isDeleted: true,
        isActive: false,
        updatedAt: new Date(),
      },
    });
  },
};
