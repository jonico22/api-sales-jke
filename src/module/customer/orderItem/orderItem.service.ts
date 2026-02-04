import prisma from '@/config/prisma';
import { createOrderItemSchema, updateOrderItemSchema } from './orderItem.validation'


export const orderItemService = {
  create: async (data: any) => {
    // 1. Obtener producto para snapshot
    const product = await prisma.product.findUnique({
      where: { id: data.productId }
    });

    if (!product) {
      throw new Error(`Producto no encontrado: ${data.productId}`);
    }

    // 2. Cálculos
    const costPrice = Number(product.priceCost);
    const quantity = data.quantity;
    const unitPrice = Number(data.unitPrice);
    const discount = Number(data.discount || 0);

    const total = (unitPrice * quantity) - discount;
    const subtotal = total / 1.18;
    const taxAmount = total - subtotal;

    // 3. Crear
    return prisma.orderItem.create({
      data: {
        orderId: data.orderId,
        productId: data.productId,
        quantity: quantity,
        unitPrice: unitPrice,
        costPrice: costPrice,
        subtotal: subtotal,
        discount: discount,
        taxAmount: taxAmount,
        total: total,
        comment: data.comment
      }
    })
  },

  findAll: async (filters: any = {}) => {
    return prisma.orderItem.findMany({
      where: filters,
      include: {
        order: true,
        product: true,
      }
    })
  },

  findById: async (id: string) => {
    return prisma.orderItem.findUnique({
      where: { id },
      include: {
        order: true,
        product: true,
      },
    })
  },

  update: async (id: string, data: any) => {
    return prisma.orderItem.update({ where: { id }, data: data })
  },

  delete: async (id: string) => {
    return prisma.orderItem.delete({ where: { id } })
  },
}
