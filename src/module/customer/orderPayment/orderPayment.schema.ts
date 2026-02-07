
import { z } from 'zod';
import { registry } from '@/config/swagger';
import { PaymentMethodOrder, PaymentStatus } from '@prisma/client';

export const createOrderPaymentSchema = z.object({
    body: registry.register('CreateOrderPayment', z.object({
        orderId: z.string().uuid().optional().openapi({ example: '550e8400-e29b-41d4-a716-446655440000' }),
        societyId: z.string().uuid().openapi({ example: '550e8400-e29b-41d4-a716-446655440000' }),

        // Financials
        amount: z.number().positive().openapi({ example: 150.00 }),
        currencyId: z.string().uuid().openapi({ example: '550e8400-e29b-41d4-a716-446655440000' }),
        exchangeRate: z.number().positive().default(1.0).openapi({ example: 1.0 }),

        paymentDate: z.string().datetime().optional().openapi({ example: '2024-02-01T10:00:00Z' }),
        paymentMethod: z.nativeEnum(PaymentMethodOrder).openapi({ example: PaymentMethodOrder.CASH }),

        // Status & Evidence
        status: z.nativeEnum(PaymentStatus).optional().openapi({ example: PaymentStatus.PENDING }),
        imageId: z.string().uuid().optional().openapi({ example: '550e8400-e29b-41d4-a716-446655440000' }),
        referenceCode: z.string().optional().openapi({ example: 'REF-123' }),
        notes: z.string().optional().openapi({ example: 'Pago parcial efectivo' }),

        createdBy: z.string().optional().openapi({ example: 'user-id' }),
    }))
});

export const updateOrderPaymentSchema = z.object({
    body: registry.register('UpdateOrderPayment', createOrderPaymentSchema.shape.body.partial())
});

export const paymentIdSchema = z.object({
    params: z.object({
        id: z.string().uuid().openapi({ example: '550e8400-e29b-41d4-a716-446655440000' })
    })
});

export const paymentFiltersSchema = z.object({
    query: z.object({
        // Standard Pagination
        page: z.string().transform(val => parseInt(val)).optional().openapi({ example: '1' }),
        limit: z.string().transform(val => parseInt(val)).optional().openapi({ example: '10' }),
        sortBy: z.string().optional().openapi({ example: 'createdAt' }),
        sortOrder: z.string().optional().openapi({ example: 'desc' }),

        // Filters IDs
        societyId: z.string().optional().openapi({ example: 'uuid' }),
        orderId: z.string().optional().openapi({ example: 'uuid' }),

        // Enum Filters
        status: z.nativeEnum(PaymentStatus).optional().openapi({ example: PaymentStatus.CONFIRMED }),
        paymentMethod: z.nativeEnum(PaymentMethodOrder).optional().openapi({ example: PaymentMethodOrder.CASH }),

        // Search
        search: z.string().optional().openapi({ example: 'REF-123', description: 'Código de referencia o notas' }),

        // Date Range
        dateFrom: z.string().optional().openapi({ example: '2024-01-01' }),
        dateTo: z.string().optional().openapi({ example: '2024-12-31' }),

        // Amount Range
        amountFrom: z.string().transform(val => parseFloat(val)).optional(),
        amountTo: z.string().transform(val => parseFloat(val)).optional(),

        // User Tracking
        createdBy: z.string().optional()
    })
});

export type CreateOrderPaymentInput = z.infer<typeof createOrderPaymentSchema>['body'];
export type UpdateOrderPaymentInput = z.infer<typeof updateOrderPaymentSchema>['body'];
export type PaymentFilters = z.infer<typeof paymentFiltersSchema>['query'];
