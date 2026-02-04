import { z } from 'zod';

export const createExternalConsignmentSaleSchema = z.object({
  deliveredConsignmentId: z.string().uuid(),
  soldQuantity: z.number().int().min(1),
  reportedSaleDate: z.coerce.date(),

  // Financials - Coerce to number for Decimal compatibility
  reportedSalePrice: z.coerce.number().min(0),
  unitSalePrice: z.coerce.number().min(0),
  totalCommissionAmount: z.coerce.number().min(0).default(0),

  // Computed / Optional in input
  netTotal: z.coerce.number().optional(),

  remarks: z.string().optional(),
  documentReference: z.string().optional(),
});

export const updateExternalConsignmentSaleSchema = createExternalConsignmentSaleSchema.partial();

export const externalConsignmentSaleIdSchema = z.object({
  id: z.string().uuid(),
});

export const filterExternalConsignmentSaleSchema = z.object({
  query: z.object({
    deliveredConsignmentId: z.string().optional(),
    reportedSaleDateFrom: z.coerce.date().optional(),
    reportedSaleDateTo: z.coerce.date().optional(),
    minSalePrice: z.coerce.number().optional(),
    maxSalePrice: z.coerce.number().optional(),
  })
});
