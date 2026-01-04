import prisma from '@/config/prisma';
import { DeliveredConsignmentAgreement } from '@prisma/client';

export class DeliveredConsignmentAgreementService {
  static async getAll() {
    return prisma.deliveredConsignmentAgreement.findMany({
      include: {
        consignmentAgreement: true,
        product: true,
        branch: true,
      },
    });
  }

  static async getById(id: string) {
    return prisma.deliveredConsignmentAgreement.findUnique({
      where: { id },
      include: {
        consignmentAgreement: true,
        product: true,
        branch: true,
      },
    });
  }

  static async create(data: DeliveredConsignmentAgreement) {
    return prisma.deliveredConsignmentAgreement.create({ data });
  }

  static async update(id: string, data: Partial<DeliveredConsignmentAgreement>) {
    return prisma.deliveredConsignmentAgreement.update({
      where: { id },
      data,
    });
  }

  static async delete(id: string) {
    return prisma.deliveredConsignmentAgreement.delete({
      where: { id },
    });
  }
}
