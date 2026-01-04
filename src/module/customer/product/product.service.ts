import prisma from '@/config/prisma';
import { Prisma } from '@prisma/client';

export const createProduct = async (data: Prisma.ProductCreateInput) => {
  return prisma.product.create({ data });
};

export const getProducts = async (params: {
  page?: number;
  limit?: number;
  isActive?: boolean;
  societyId?: string;
  categoryId?: string;
}) => {
  const { page = 1, limit = 10, isActive, societyId, categoryId } = params;
  const where: Prisma.ProductWhereInput = {
    ...(typeof isActive === 'boolean' && { isActive }),
    ...(societyId && { societyId }),
    ...(categoryId && { categoryId }),
  };

  const [total, data] = await Promise.all([
    prisma.product.count({ where }),
    prisma.product.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        society: true,
        category: true,
        image: true,
      }
    }),
  ]);

  return {
    total,
    page,
    limit,
    data
  };
};

export const getProductById = async (id: string) => {
  return prisma.product.findUnique({
    where: { id },
    include: {
      society: true,
      category: true,
      image: true,
    }
  });
};

export const updateProduct = async (id: string, data: Prisma.ProductUpdateInput) => {
  return prisma.product.update({
    where: { id },
    data
  });
};

export const deleteProduct = async (id: string) => {
  return prisma.product.update({
    where: { id },
    data: { isDeleted: true, isActive: false }
  });
};
