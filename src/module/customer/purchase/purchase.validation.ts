import { z } from 'zod'
import { PurchaseStatus } from '@prisma/client'

export const createPurchaseSchema = z.object({
  societyId: z.string().uuid(),
  providerId: z.string().uuid(),
  purchaseDate: z.coerce.date().optional(),
  status: z.nativeEnum(PurchaseStatus).optional(),
  totalAmount: z.coerce.number().nonnegative(),
  notes: z.string().optional(),
  purchaseCode: z.string().optional(),
  paymentMethod: z.string().optional(),
  dueDate: z.coerce.date().optional(),
  createdBy: z.string().optional(),
})

export const updatePurchaseSchema = createPurchaseSchema.extend({
  status: z.nativeEnum(PurchaseStatus).optional(),
  updatedBy: z.string().optional(),
})

export const purchaseIdSchema = z.object({
  id: z.string().uuid(),
})
