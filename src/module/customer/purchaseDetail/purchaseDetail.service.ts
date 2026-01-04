import prisma from '@/config/prisma';

export const getAllPurchaseDetails = async () => {
  return await prisma.purchaseDetail.findMany({
    include: {
      purchase: true,
      product: true,
    },
    orderBy: {
      createdAt: 'desc',
    },
  })
}

export const getPurchaseDetailById = async (id: string) => {
  return await prisma.purchaseDetail.findUnique({
    where: { id },
    include: {
      purchase: true,
      product: true,
    },
  })
}

export const createPurchaseDetail = async (data: any) => {
  return await prisma.purchaseDetail.create({
    data,
  })
}

export const updatePurchaseDetail = async (id: string, data: any) => {
  return await prisma.purchaseDetail.update({
    where: { id },
    data,
  })
}

export const deletePurchaseDetail = async (id: string) => {
  return await prisma.purchaseDetail.delete({
    where: { id },
  })
}
