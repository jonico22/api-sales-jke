import { z } from 'zod';
import { registry } from '@/config/swagger';
import { PurchaseStatus } from '@prisma/client';

export const PurchaseSchema = registry.register(
    'Purchase',
    z.object({
        id: z.string().uuid().openapi({ example: '550e8400-e29b-41d4-a716-446655440000' }),
        purchaseCode: z.string().openapi({ example: 'PUR-001' }),
        societyId: z.string().uuid().openapi({ example: '550e8400-e29b-41d4-a716-446655440000' }),
        providerId: z.string().uuid().openapi({ example: '550e8400-e29b-41d4-a716-446655440000' }),
        purchaseDate: z.date().openapi({ example: '2024-02-01T00:00:00Z' }),
        status: z.nativeEnum(PurchaseStatus).openapi({ example: 'COMPLETED' }),
        totalAmount: z.number().openapi({ example: 1200.00 }),
        currencyId: z.string().uuid().openapi({ example: '550e8400-e29b-41d4-a716-446655440000' }),
    })
);

export const createPurchaseSchema = z.object({
    body: registry.register('CreatePurchase', z.object({
        societyId: z.string().uuid().openapi({ example: '550e8400-e29b-41d4-a716-446655440000' }),
        providerId: z.string().uuid().openapi({ example: '550e8400-e29b-41d4-a716-446655440000' }),
        purchaseDate: z.coerce.date().optional().openapi({ example: '2024-02-01T00:00:00Z' }),
        status: z.nativeEnum(PurchaseStatus).optional().openapi({ example: 'PENDING' }), // Default PENDING

        // Financials
        currencyId: z.string().uuid().openapi({ example: '550e8400-e29b-41d4-a716-446655440000' }),
        exchangeRate: z.coerce.number().positive().default(1.0).openapi({ example: 1.0 }),
        subTotal: z.coerce.number().nonnegative().default(0).openapi({ example: 1000.00 }),
        taxAmount: z.coerce.number().nonnegative().default(0).openapi({ example: 180.00 }),
        totalAmount: z.coerce.number().nonnegative().openapi({ example: 1180.00 }),
        taxId: z.string().uuid().optional().openapi({ example: '550e8400-e29b-41d4-a716-446655440000' }),

        // Logistics
        branchOfficeId: z.string().uuid().openapi({ example: '550e8400-e29b-41d4-a716-446655440000' }),

        // Documentation
        documentTypeId: z.string().uuid().optional().openapi({ example: '550e8400-e29b-41d4-a716-446655440000' }),
        documentNumber: z.string().optional().openapi({ example: 'F001-12345678' }),

        notes: z.string().optional().openapi({ example: 'Compra de laptops' }),
        purchaseCode: z.string().optional().openapi({ example: 'PUR-001' }),
        paymentMethod: z.string().optional().openapi({ example: 'CREDIT_CARD' }),
        dueDate: z.coerce.date().optional().openapi({ example: '2024-02-15T00:00:00Z' }),
        createdBy: z.string().optional().openapi({ example: 'user-id' }),
    }))
});

export const updatePurchaseSchema = z.object({
    body: registry.register('UpdatePurchase', createPurchaseSchema.shape.body.extend({
        status: z.nativeEnum(PurchaseStatus).optional().openapi({ example: 'COMPLETED' }),
        updatedBy: z.string().optional().openapi({ example: 'user-id' }),
    }).partial())
});

export const purchaseIdSchema = z.object({
    params: z.object({
        id: z.string().uuid().openapi({ example: '550e8400-e29b-41d4-a716-446655440000' }),
    })
});

export const purchaseFiltersSchema = z.object({
    query: z.object({
        societyId: z.string().uuid().optional().openapi({ example: 'uuid' }),
        providerId: z.string().uuid().optional().openapi({ example: 'uuid' }),
        status: z.nativeEnum(PurchaseStatus).optional().openapi({ example: 'COMPLETED' }),
        purchaseDateFrom: z.coerce.date().optional().openapi({ example: '2024-01-01' }),
        purchaseDateTo: z.coerce.date().optional().openapi({ example: '2024-12-31' }),
        minAmount: z.coerce.number().optional().openapi({ example: 100 }),
        maxAmount: z.coerce.number().optional().openapi({ example: 5000 }),
        documentNumber: z.string().optional().openapi({ example: '123' }),

        // Pagination defaults
        page: z.string().transform(val => parseInt(val)).optional().openapi({ example: '1' }),
        limit: z.string().transform(val => parseInt(val)).optional().openapi({ example: '10' }),
        sortBy: z.string().optional().openapi({ example: 'createdAt' }),
        sortOrder: z.string().optional().openapi({ example: 'desc' }),
    })
});
