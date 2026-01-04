import { Prisma } from '@prisma/client';
import prisma from '@/config/prisma';

export const createReceivedConsignmentSettlement = async (data: Prisma.ReceivedConsignmentSettlementCreateInput) => {
  return await prisma.receivedConsignmentSettlement.create({ data });
};

export const getAllReceivedConsignmentSettlements = async () => {
  return await prisma.receivedConsignmentSettlement.findMany({
    include: {
      outgoingAgreement: true,
      orderPayment: true,
    },
  });
};

export const getReceivedConsignmentSettlementById = async (id: string) => {
  return await prisma.receivedConsignmentSettlement.findUnique({
    where: { id },
    include: {
      outgoingAgreement: true,
      orderPayment: true,
    },
  });
};

export const updateReceivedConsignmentSettlement = async (id: string, data: Prisma.ReceivedConsignmentSettlementUpdateInput) => {
  return await prisma.receivedConsignmentSettlement.update({
    where: { id },
    data,
  });
};

export const deleteReceivedConsignmentSettlement = async (id: string) => {
  return await prisma.receivedConsignmentSettlement.delete({
    where: { id },
  });
};
