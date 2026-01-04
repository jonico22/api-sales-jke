import { z } from 'zod'

export const createPurchaseDetailSchema = z.object({
  purchaseId: z.string().uuid(),
  productId: z.string().uuid(),
  quantity: z.number().int().positive(),
  unitPrice: z.coerce.number().nonnegative(),
  subtotal: z.coerce.number().nonnegative(),
})

export const updatePurchaseDetailSchema = createPurchaseDetailSchema.partial()

export const purchaseDetailIdSchema = z.object({
  id: z.string().uuid(),
})
