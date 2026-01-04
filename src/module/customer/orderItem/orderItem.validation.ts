import { z } from 'zod'

export const createOrderItemSchema = z.object({
  orderId: z.string(),
  productId: z.string(),
  quantity: z.number().positive(),
  unitPrice: z.number().nonnegative(),
  subtotal: z.number().nonnegative(),
  discount: z.number().nonnegative().optional(),
  total: z.number().nonnegative().optional(),
  createdBy: z.string().optional(),
})

export const updateOrderItemSchema = createOrderItemSchema.partial()
