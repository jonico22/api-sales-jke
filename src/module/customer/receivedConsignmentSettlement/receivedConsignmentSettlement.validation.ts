import { z } from 'zod';
import { SettlementStatus } from '@prisma/client';

export const createReceivedConsignmentSettlementSchema = z.object({
  outgoingAgreementId: z.string().uuid(),
  orderPaymentId: z.string().uuid().optional(),
  settlementDate: z.coerce.date(),

  // Financials - Coerce to number for Decimal compatibility
  totalReportedSalesAmount: z.coerce.number().min(0),
  consigneeCommissionAmount: z.coerce.number().min(0),
  totalReceivedAmount: z.coerce.number().min(0),

  status: z.nativeEnum(SettlementStatus).default(SettlementStatus.PENDING),
  receiptReference: z.string().optional(),
  settlementNotes: z.string().optional(),

  // Currency relation
  currencyId: z.string().uuid(),

  createdBy: z.string().optional(),
});

export const updateReceivedConsignmentSettlementSchema = createReceivedConsignmentSettlementSchema.partial();

export const receivedConsignmentSettlementIdSchema = z.object({
  id: z.string().uuid(),
});

export const filterReceivedConsignmentSettlementSchema = z.object({
  query: z.object({
    outgoingAgreementId: z.string().optional(),
    status: z.nativeEnum(SettlementStatus).optional(),
    settlementDateFrom: z.coerce.date().optional(),
    settlementDateTo: z.coerce.date().optional(),
  })
});
