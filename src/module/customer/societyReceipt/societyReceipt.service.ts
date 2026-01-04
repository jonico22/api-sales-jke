import prisma from '@/config/prisma';
import { societyReceiptSchema, updateSocietyReceiptSchema } from './societyReceipt.validation'

export const createSocietyReceipt = async (data: any) => {
  const validated = societyReceiptSchema.parse(data)
  return await prisma.societyReceipt.create({ data: validated })
}

export const getAllSocietyReceipts = async () => {
  return await prisma.societyReceipt.findMany({
    include: {
      currency: true,
      tax: true,
      receiptType: true,
      orderPayment: true,
      file: true,
    },
    orderBy: { createdAt: 'desc' },
  })
}

export const getSocietyReceiptById = async (id: string) => {
  return await prisma.societyReceipt.findUnique({
    where: { id },
    include: {
      currency: true,
      tax: true,
      receiptType: true,
      orderPayment: true,
      file: true,
    },
  })
}

export const updateSocietyReceipt = async (id: string, data: any) => {
  const validated = updateSocietyReceiptSchema.parse(data)
  return await prisma.societyReceipt.update({
    where: { id },
    data: validated,
  })
}

export const deleteSocietyReceipt = async (id: string) => {
  return await prisma.societyReceipt.delete({ where: { id } })
}
