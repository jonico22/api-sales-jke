import { z } from 'zod';

export const createDeliveredConsignmentAgreementSchema = z.object({
  consignmentAgreementId: z.string().uuid(),
  productId: z.string().uuid(),
  branchId: z.string().uuid(),

  deliveredStock: z.number().int().min(0),
  remainingStock: z.number().int().min(0).optional(),

  // Financials - Coerce to number for Decimal compatibility
  costPrice: z.coerce.number().min(0),
  suggestedSalePrice: z.coerce.number().min(0),

  // Computed / Optional
  totalCost: z.coerce.number().optional(), // Will be computed if not provided
  totalValue: z.coerce.number().optional(), // Will be computed if not provided

  // Tax
  taxAmount: z.coerce.number().default(0),

  deliveryDate: z.coerce.date().optional(),
  status: z.string().default("active"),
  notes: z.string().optional(),
});

export const updateDeliveredConsignmentAgreementSchema = createDeliveredConsignmentAgreementSchema.partial().extend({
  // Add any specific update fields if needed
});

export const deliveredConsignmentAgreementIdSchema = z.object({
  id: z.string().uuid(),
});

export const filterDeliveredConsignmentAgreementSchema = z.object({
  query: z.object({
    consignmentAgreementId: z.string().optional(),
    productId: z.string().optional(),
    branchId: z.string().optional(),
    status: z.string().optional(),
    deliveryDateFrom: z.coerce.date().optional(),
    deliveryDateTo: z.coerce.date().optional(),
  })
});
