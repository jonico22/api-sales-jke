import prisma from '@/config/prisma';
import { createOrderPaymentSchema, updateOrderPaymentSchema } from './orderPayment.validation'
import { PaymentMethodOrder } from '@prisma/client';

export const orderPaymentService = {
  create: async (data: any) => {
    const { orderId, societyId, paymentMethod, ...rest } = createOrderPaymentSchema.parse(data);

    return prisma.orderPayment.create({
      data: {
        ...rest,
        paymentMethod: paymentMethod as PaymentMethodOrder,
        society: { connect: { id: societyId } },
        ...(orderId && { order: { connect: { id: orderId } } }),
      },
    });
  },

  findAll: async (filters: any = {}) => {
    return prisma.orderPayment.findMany({
      where: filters,
      include: {
        order: true,
        SocietyReceipt: true,
        ReceivedConsignmentSettlement: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  },

  findById: async (id: string) => {
    return prisma.orderPayment.findUnique({
      where: { id },
      include: {
        order: true,
        SocietyReceipt: true,
        ReceivedConsignmentSettlement: true,
      },
    });
  },

  update: async (id: string, data: any) => {
    const { orderId, societyId, paymentMethod, ...rest } = updateOrderPaymentSchema.parse(data);

    return prisma.orderPayment.update({
      where: { id },
      data: {
        ...rest,
        ...(paymentMethod && { paymentMethod: paymentMethod as PaymentMethodOrder }),
        ...(societyId && { society: { connect: { id: societyId } } }),
        ...(orderId && { order: { connect: { id: orderId } } }),
      },
    });
  },

  delete: async (id: string) => {
    return prisma.orderPayment.delete({ where: { id } });
  },
};
