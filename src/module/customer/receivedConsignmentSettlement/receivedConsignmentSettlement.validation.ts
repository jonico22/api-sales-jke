import { z } from 'zod';

export const createReceivedConsignmentSettlementSchema = z.object({
  outgoingAgreementId: z.string().uuid(),
  orderPaymentId: z.string().uuid().optional(),
  settlementDate: z.coerce.date(),
  totalReportedSalesAmount: z.number(),
  consigneeCommissionAmount: z.number(),
  totalReceivedAmount: z.number(),
  status: z.enum(['PENDING', 'PAID']),
  receiptReference: z.string().optional(),
  settlementNotes: z.string().optional(),
  currency: z.string().default('PEN'),
  createdBy: z.string().optional(),
});

export const updateReceivedConsignmentSettlementSchema = createReceivedConsignmentSettlementSchema.partial();
