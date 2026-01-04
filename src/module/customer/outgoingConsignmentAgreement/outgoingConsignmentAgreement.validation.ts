import { z } from 'zod';
import { ConsignmentStatus } from '@prisma/client';

export const createOutgoingConsignmentAgreementSchema = z.object({
  societyId: z.string().uuid(),
  branchId: z.string().uuid(),
  partnerId: z.string().uuid(),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  commissionRate: z.coerce.number().min(0),
  agreementCode: z.string().optional(),
  status: z.nativeEnum(ConsignmentStatus).optional(),
  notes: z.string().optional(),
  createdBy: z.string().optional(),
});

export const updateOutgoingConsignmentAgreementSchema = createOutgoingConsignmentAgreementSchema.partial().extend({
  updatedBy: z.string().optional(),
});

export const filterOutgoingConsignmentAgreementSchema = z.object({
  societyId: z.string().optional(),
  branchId: z.string().optional(),
  partnerId: z.string().optional(),
  status: z.nativeEnum(ConsignmentStatus).optional(),
  search: z.string().optional(),
  page: z.coerce.number().min(1).optional(),
  limit: z.coerce.number().min(1).max(100).optional(),
});
