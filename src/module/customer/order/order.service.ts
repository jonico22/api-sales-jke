import prisma from '@/config/prisma';
import { createOrderSchema, updateOrderSchema } from './order.validation'

export const orderService = {
  create: async (data: any) => {
    const validated = createOrderSchema.parse(data)
    return prisma.order.create({ data: validated })
  },

  findAll: async (filters: any = {}) => {
    return prisma.order.findMany({
      where: filters,
      include: {
        society: true,
        partner: true,
        branch: true,
        orderItems: true,
        OrderPayment: true,
      },
      orderBy: { createdAt: 'desc' },
    })
  },

  findById: async (id: string) => {
    return prisma.order.findUnique({
      where: { id },
      include: {
        society: true,
        partner: true,
        branch: true,
        orderItems: true,
        OrderPayment: true,
      },
    })
  },

  update: async (id: string, data: any) => {
    const validated = updateOrderSchema.parse(data)
    return prisma.order.update({ where: { id }, data: validated })
  },

  delete: async (id: string) => {
    return prisma.order.delete({ where: { id } })
  },
}
