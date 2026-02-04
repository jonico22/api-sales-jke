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
  societyId: z.string(),
  subTotal: z.coerce.number().nonnegative(),
  taxAmount: z.coerce.number().nonnegative(),
})

export const updateSocietyReceiptSchema = societyReceiptSchema.partial()

export const societyReceiptFiltersSchema = z.object({
  search: z.string().optional(),
  societyId: z.string().optional(),
  receiptTypeId: z.string().optional(),
  status: z.enum(['issued', 'canceled', 'pending_send']).optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
})
