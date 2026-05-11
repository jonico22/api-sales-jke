import { z } from 'zod';
import { ConsignmentStatus } from '@prisma/client';

export const createOutgoingConsignmentAgreementSchema = z.object({
  societyId: z.string().min(1),
  branchId: z.string().uuid(),
  partnerId: z.string().uuid(),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  commissionRate: z.coerce.number().min(0),

  // Financials
  currencyId: z.string(),
  totalValue: z.coerce.number().default(0),
  creditLimit: z.coerce.number().optional(),

  agreementCode: z.string().optional(),
  status: z.nativeEnum(ConsignmentStatus).optional(),
  notes: z.string().optional(),
  createdBy: z.string().optional(),
});

export const updateOutgoingConsignmentAgreementSchema = createOutgoingConsignmentAgreementSchema.partial().extend({
  updatedBy: z.string().optional(),
});

export const outgoingConsignmentAgreementIdSchema = z.object({
  id: z.string().uuid(),
});

export const filterOutgoingConsignmentAgreementSchema = z.object({
  query: z.object({
    societyId: z.string().optional(),
    societyCode: z.string().optional(),
    branchId: z.string().optional(),
    partnerId: z.string().optional(),
    status: z.nativeEnum(ConsignmentStatus).optional(),
    search: z.string().optional(),
    // Pagination defaults handled in controller/service logic via pagination schema, 
    // but useful to allow pass-through here or rely on specific pagination schema
  })
});
