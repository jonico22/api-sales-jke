import prisma from '@/config/prisma';
import { createOrderItemSchema, updateOrderItemSchema } from './orderItem.validation'


export const orderItemService = {
  create: async (data: any) => {
    const validated = createOrderItemSchema.parse(data)
    return prisma.orderItem.create({ data: validated })
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
    const validated = updateOrderItemSchema.parse(data)
    return prisma.orderItem.update({ where: { id }, data: validated })
  },

  delete: async (id: string) => {
    return prisma.orderItem.delete({ where: { id } })
  },
}
