import { z } from 'zod'

import { PaymentMethodOrder, PaymentStatus } from '@prisma/client'

export const createOrderPaymentSchema = z.object({
  body: z.object({
    orderId: z.string().uuid().optional(),
    societyId: z.string().uuid(),

    // Financials
    amount: z.number().positive(),
    currencyId: z.string().uuid(),
    exchangeRate: z.number().positive().default(1.0),

    paymentDate: z.string().datetime().optional(),
    paymentMethod: z.nativeEnum(PaymentMethodOrder),

    // Status & Evidence
    status: z.nativeEnum(PaymentStatus).optional(),
    imageId: z.string().uuid().optional(), // Evidence
    referenceCode: z.string().optional(),
    notes: z.string().optional(),

    createdBy: z.string().optional(),
  })
})

export const updateOrderPaymentSchema = z.object({
  body: createOrderPaymentSchema.shape.body.partial()
})

export const paymentFiltersSchema = z.object({
  query: z.object({
    // Standard Pagination
    page: z.string().transform(val => parseInt(val)).optional(),
    limit: z.string().transform(val => parseInt(val)).optional(),
    sortBy: z.string().optional(),
    sortOrder: z.string().optional(),

    // Filters
    societyId: z.string().optional(),
    orderId: z.string().optional(),
    status: z.nativeEnum(PaymentStatus).optional(),
    paymentMethod: z.nativeEnum(PaymentMethodOrder).optional(),

    // Search
    search: z.string().optional(), // Reference code or notes

    // Date Range
    dateFrom: z.string().optional(),
    dateTo: z.string().optional(),
  })
});
