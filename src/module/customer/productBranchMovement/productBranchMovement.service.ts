import { Prisma } from '@prisma/client';
import prisma from '@/config/prisma';

export class ProductBranchMovementService {
  static async getAll(filters: Partial<Prisma.ProductBranchMovementWhereInput> = {}) {
    return prisma.productBranchMovement.findMany({
      where: filters,
      include: {
        originBranch: true,
        destinationBranch: true,
        product: true,
      },
      orderBy: { movementDate: 'desc' },
    });
  }

  static async getById(id: string) {
    return prisma.productBranchMovement.findUnique({
      where: { id },
      include: {
        originBranch: true,
        destinationBranch: true,
        product: true,
      },
    });
  }

  static async create(data: {
    originBranchId: string;
    destinationBranchId: string;
    productId: string;
    quantityMoved: number;
    notes?: string;
    referenceCode?: string;
    status?: 'PENDING' | 'COMPLETED' | 'CANCELLED';
    createdBy?: string;
  }) {
    const { originBranchId, destinationBranchId, productId, ...rest } = data;
    return prisma.productBranchMovement.create({
      data: {
        ...rest,
        originBranch: { connect: { id: originBranchId } },
        destinationBranch: { connect: { id: destinationBranchId } },
        product: { connect: { id: productId } },
      },
    });
  }

  static async update(id: string, data: Prisma.ProductBranchMovementUpdateInput) {
    return prisma.productBranchMovement.update({
      where: { id },
      data,
    });
  }

  static async delete(id: string) {
    return prisma.productBranchMovement.delete({
      where: { id },
    });
  }
}
