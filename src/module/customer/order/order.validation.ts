import { z } from 'zod'
import { OrderStatus } from '@prisma/client'

export const createOrderSchema = z.object({
  orderCode: z.string(),
  orderDate: z.string().datetime().optional(),
  totalAmount: z.number().nonnegative().default(0),
  status: z.nativeEnum(OrderStatus).optional(),
  notes: z.string().optional(),
  paymentDate: z.string().datetime().optional(),
  cancellationReason: z.string().optional(),
  societyId: z.string(),
  partnerId: z.string(),
  branchId: z.string(),
  createdBy: z.string().optional(),
})

export const updateOrderSchema = createOrderSchema.partial()
