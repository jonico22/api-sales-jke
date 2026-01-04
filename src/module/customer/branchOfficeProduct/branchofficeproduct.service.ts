import prisma from '@/config/prisma';
import {
  createBranchOfficeProductSchema,
  updateBranchOfficeProductSchema,
} from './branchofficeproduct.validation';

export const BranchOfficeProductService = {
  getAll: async () => {
    return prisma.branchOfficeProduct.findMany({
      include: {
        product: true,
        branchOffice: true,
      },
    });
  },

  getById: async (id: string) => {
    return prisma.branchOfficeProduct.findUnique({
      where: { id },
      include: {
        product: true,
        branchOffice: true,
      },
    });
  },

  create: async (data: unknown) => {
    const parsed = createBranchOfficeProductSchema.parse(data);
    return prisma.branchOfficeProduct.create({
      data: parsed,
    });
  },

  update: async (id: string, data: unknown) => {
    const parsed = updateBranchOfficeProductSchema.parse(data);
    return prisma.branchOfficeProduct.update({
      where: { id },
      data: {
        ...parsed,
        updatedAt: new Date(),
      },
    });
  },

  delete: async (id: string) => {
    return prisma.branchOfficeProduct.delete({
      where: { id },
    });
  },
};
