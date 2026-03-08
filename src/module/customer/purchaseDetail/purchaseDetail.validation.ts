import { z } from 'zod'

export const createPurchaseDetailSchema = z.object({
  purchaseId: z.string().uuid(),
  productId: z.string().uuid(),
  quantity: z.number().int().positive(),
  unitPrice: z.coerce.number().nonnegative(),
  subtotal: z.coerce.number().nonnegative(),

  // New Fields
  taxAmount: z.coerce.number().nonnegative().default(0),
  total: z.coerce.number().nonnegative(),
  receivedQuantity: z.number().int().nonnegative().default(0),
  expirationDate: z.coerce.date().optional(),
})

export const updatePurchaseDetailSchema = createPurchaseDetailSchema.partial()

export const purchaseDetailIdSchema = z.object({
  id: z.string().uuid(),
})

export const purchaseDetailFiltersSchema = z.object({
  query: z.object({
    purchaseId: z.string().uuid().optional(),
    productId: z.string().uuid().optional(),
    expirationDateFrom: z.coerce.date().optional(),
    expirationDateTo: z.coerce.date().optional(),
  })
})
