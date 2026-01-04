import prisma from '@/config/prisma';
import {
  createOutgoingConsignmentAgreementSchema,
  updateOutgoingConsignmentAgreementSchema,
  filterOutgoingConsignmentAgreementSchema,
} from './outgoingConsignmentAgreement.validation';

export const createAgreement = async (input: any) => {
  const data = createOutgoingConsignmentAgreementSchema.parse(input);
  return prisma.outgoingConsignmentAgreement.create({ data });
};

export const updateAgreement = async (id: string, input: any) => {
  const data = updateOutgoingConsignmentAgreementSchema.parse(input);
  return prisma.outgoingConsignmentAgreement.update({ where: { id }, data });
};

export const deleteAgreement = async (id: string) => {
  return prisma.outgoingConsignmentAgreement.delete({ where: { id } });
};

export const getAgreementById = async (id: string) => {
  return prisma.outgoingConsignmentAgreement.findUnique({
    where: { id },
    include: {
      society: true,
      branch: true,
      partner: true,
    },
  });
};

export const getAllAgreements = async (query: any) => {
  const {
    societyId,
    branchId,
    partnerId,
    status,
    search,
    page = 1,
    limit = 10,
  } = filterOutgoingConsignmentAgreementSchema.parse(query);

  const where: any = {};
  if (societyId) where.societyId = societyId;
  if (branchId) where.branchId = branchId;
  if (partnerId) where.partnerId = partnerId;
  if (status) where.status = status;
  if (search) {
    where.OR = [
      { agreementCode: { contains: search, mode: 'insensitive' } },
      { notes: { contains: search, mode: 'insensitive' } },
    ];
  }

  const [total, data] = await prisma.$transaction([
    prisma.outgoingConsignmentAgreement.count({ where }),
    prisma.outgoingConsignmentAgreement.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        society: true,
        branch: true,
        partner: true,
      },
    }),
  ]);

  return { total, data, page, limit };
};
