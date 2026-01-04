import prisma from '@/config/prisma';
import { createOrderPaymentSchema, updateOrderPaymentSchema } from './orderPayment.validation'
import { PaymentMethodOrder } from '@prisma/client';

export const orderPaymentService = {
  create: async (data: any) => {
    const { orderId, paymentMethod, ...rest } = createOrderPaymentSchema.parse(data);
    const orderData = orderId ? { order: { connect: { id: orderId } } } : {};

    // Ensure paymentMethod is of enum type
    const parsedPaymentMethod: PaymentMethodOrder = paymentMethod as PaymentMethodOrder;

    return prisma.orderPayment.create({
      data: {
        ...rest,
        ...orderData,
        paymentMethod: parsedPaymentMethod,
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
    const { orderId, paymentMethod, ...rest } = updateOrderPaymentSchema.parse(data);
    const orderData = orderId ? { order: { connect: { id: orderId } } } : {};

    // Ensure paymentMethod is of enum type
    const parsedPaymentMethod: PaymentMethodOrder | undefined = paymentMethod ? (paymentMethod as PaymentMethodOrder) : undefined;


    return prisma.orderPayment.update({
      where: { id },
      data: {
        ...rest,
        ...orderData,
        ...(parsedPaymentMethod && { paymentMethod: parsedPaymentMethod }), // Only update if provided
      },
    });
  },

  delete: async (id: string) => {
    return prisma.orderPayment.delete({ where: { id } });
  },
};
