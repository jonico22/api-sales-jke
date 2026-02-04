import { z } from 'zod'
import { PurchaseStatus } from '@prisma/client'

export const createPurchaseSchema = z.object({
  societyId: z.string().uuid(),
  providerId: z.string().uuid(),
  purchaseDate: z.coerce.date().optional(),
  status: z.nativeEnum(PurchaseStatus).optional(),

  // Financials
  currencyId: z.string().uuid(),
  exchangeRate: z.coerce.number().positive().default(1.0),
  subTotal: z.coerce.number().nonnegative().default(0),
  taxAmount: z.coerce.number().nonnegative().default(0),
  totalAmount: z.coerce.number().nonnegative(),
  taxId: z.string().uuid().optional(),

  // Logistics
  branchOfficeId: z.string().uuid(),

  // Documentation
  documentTypeId: z.string().uuid().optional(),
  documentNumber: z.string().optional(),

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

export const purchaseFiltersSchema = z.object({
  query: z.object({
    societyId: z.string().uuid().optional(),
    providerId: z.string().uuid().optional(),
    status: z.nativeEnum(PurchaseStatus).optional(),
    purchaseDateFrom: z.coerce.date().optional(),
    purchaseDateTo: z.coerce.date().optional(),
    minAmount: z.coerce.number().optional(),
    maxAmount: z.coerce.number().optional(),
    documentNumber: z.string().optional(),
    // Pagination defaults are handled by global schema but helpful to validate if passed explicitly here or use intersection
  })
})
