import { z } from 'zod'

export const createOrderItemSchema = z.object({
  body: z.object({
    orderId: z.string().uuid(),
    productId: z.string().uuid(),
    quantity: z.number().int().positive(),
    unitPrice: z.number().nonnegative(), // Precio CON IGV
    discount: z.number().min(0).optional(),
    comment: z.string().optional(),
    createdBy: z.string().optional(),
  })
})

export const updateOrderItemSchema = z.object({
  body: createOrderItemSchema.shape.body.partial()
})
