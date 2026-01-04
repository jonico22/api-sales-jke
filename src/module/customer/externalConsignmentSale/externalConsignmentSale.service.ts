import prisma from '@/config/prisma';
import { Prisma } from '@prisma/client'

export const createExternalConsignmentSale = (data: Prisma.ExternalConsignmentSaleCreateInput) => {
  return prisma.externalConsignmentSale.create({ data })
}

export const getAllExternalConsignmentSales = () => {
  return prisma.externalConsignmentSale.findMany({
    include: {
      deliveredConsignment: true,
    },
  })
}

export const getExternalConsignmentSaleById = (id: string) => {
  return prisma.externalConsignmentSale.findUnique({
    where: { id },
    include: {
      deliveredConsignment: true,
    },
  })
}

export const updateExternalConsignmentSale = (id: string, data: Prisma.ExternalConsignmentSaleUpdateInput) => {
  return prisma.externalConsignmentSale.update({
    where: { id },
    data,
  })
}

export const deleteExternalConsignmentSale = (id: string) => {
  return prisma.externalConsignmentSale.delete({
    where: { id },
  })
}
