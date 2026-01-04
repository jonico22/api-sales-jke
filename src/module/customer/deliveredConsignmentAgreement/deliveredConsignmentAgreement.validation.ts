import { z } from 'zod';

export const DeliveredConsignmentAgreementSchema = z.object({
  consignmentAgreementId: z.string().uuid(),
  productId: z.string().uuid(),
  branchId: z.string().uuid(),

  deliveredStock: z.number().int().min(0),
  remainingStock: z.number().int().min(0).optional(),
  costPrice: z.number().min(0),
  suggestedSalePrice: z.number().min(0),
  deliveryDate: z.coerce.date().optional(),
  status: z.string().default("active"),
  notes: z.string().optional(),
});

export const DeliveredConsignmentAgreementUpdateSchema = DeliveredConsignmentAgreementSchema.partial();
