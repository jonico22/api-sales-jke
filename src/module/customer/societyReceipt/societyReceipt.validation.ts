import { z } from 'zod'

export const societyReceiptSchema = z.object({
  orderPaymentId: z.string(),
  fileId: z.string().optional(),
  series: z.string().min(1),
  receiptNumber: z.string().min(1),
  issueDate: z.coerce.date(),
  totalAmount: z.coerce.number().nonnegative(),
  currencyId: z.string(),
  taxId: z.string(),
  receiptTypeId: z.string(),
})

export const updateSocietyReceiptSchema = societyReceiptSchema.partial()
