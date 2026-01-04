import { z } from 'zod'

export const createOrderPaymentSchema = z.object({
  orderId: z.string().nullable().optional(),
  amount: z.number().positive(),
  paymentDate: z.string().datetime().optional(),
  paymentMethod: z.string(),
  referenceCode: z.string().optional(),
  notes: z.string().optional(),
  isConfirmed: z.boolean().optional(),
  confirmedAt: z.string().datetime().nullable().optional(),
  createdBy: z.string().optional(),
})

export const updateOrderPaymentSchema = createOrderPaymentSchema.partial()
