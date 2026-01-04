import prisma from '@/config/prisma';
import { createBranchOfficeSchema, updateBranchOfficeSchema } from './branchoffice.validation';

export const BranchOfficeService = {
  getAll: async () => {
    return prisma.branchOffice.findMany({
      where: { isDeleted: false },
      include: { society: true },
    });
  },

  getById: async (id: string) => {
    return prisma.branchOffice.findUnique({
      where: { id },
      include: { society: true },
    });
  },

  create: async (data: unknown) => {
    const parsed = createBranchOfficeSchema.parse(data);
    return prisma.branchOffice.create({ data: parsed });
  },

  update: async (id: string, data: unknown) => {
    const parsed = updateBranchOfficeSchema.parse(data);
    return prisma.branchOffice.update({
      where: { id },
      data: {
        ...parsed,
        updatedAt: new Date(),
      },
    });
  },

  delete: async (id: string) => {
    return prisma.branchOffice.update({
      where: { id },
      data: {
        isDeleted: true,
        isActive: false,
        updatedAt: new Date(),
      },
    });
  },
};
