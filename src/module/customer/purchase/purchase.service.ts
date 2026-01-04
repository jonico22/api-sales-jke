import prisma from '@/config/prisma';

export const getAllPurchases = async (filters: any = {}) => {
  return await prisma.purchase.findMany({
    where: {
      isDeleted: false,
      ...filters,
    },
    include: {
      society: true,
      provider: true,
      purchaseDetails: true,
    },
    orderBy: { createdAt: 'desc' },
  })
}

export const getPurchaseById = async (id: string) => {
  return await prisma.purchase.findUnique({
    where: { id },
    include: {
      society: true,
      provider: true,
      purchaseDetails: true,
    },
  })
}

export const createPurchase = async (data: any) => {
  return await prisma.purchase.create({
    data,
  })
}

export const updatePurchase = async (id: string, data: any) => {
  return await prisma.purchase.update({
    where: { id },
    data,
  })
}

export const deletePurchase = async (id: string, deletedBy?: string) => {
  return await prisma.purchase.update({
    where: { id },
    data: {
      updatedBy: deletedBy,
    },
  })
}
