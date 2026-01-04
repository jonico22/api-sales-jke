import { z } from 'zod'

export const createExternalConsignmentSaleSchema = z.object({
  deliveredConsignmentId: z.string(),
  soldQuantity: z.number().int().min(1),
  reportedSalePrice: z.number().nonnegative(),
  reportedSaleDate: z.coerce.date(),
  unitSalePrice: z.number().nonnegative(),
  totalCommissionAmount: z.number().nonnegative().optional(),
  remarks: z.string().optional(),
  documentReference: z.string().optional(),
})

export const updateExternalConsignmentSaleSchema = createExternalConsignmentSaleSchema.partial()
