
import { z } from 'zod';
import { registry } from '@/config/swagger';
import { OrderStatus } from '@prisma/client';

export const OrderStatusEnum = z.nativeEnum(OrderStatus);

// 1. Order Item Schema
const createOrderItemSchema = z.object({
    productId: z.string().uuid().openapi({ example: '550e8400-e29b-41d4-a716-446655440000' }),
    quantity: z.number().int().positive().openapi({ example: 10 }),
    unitPrice: z.number().positive().openapi({ example: 100.50, description: 'Precio unitario final' }),
    discount: z.number().min(0).default(0).openapi({ example: 0, description: 'Descuento aplicado al ítem' }),
    comment: z.string().optional().openapi({ example: 'Sin caja' })
});

const baseOrderFields = {
    orderCode: z.string().optional().openapi({ example: 'ORD-2024-001', description: 'Opcional, autogenerado si no se envía' }),
    orderDate: z.string().datetime().optional().openapi({ example: '2024-01-01T10:00:00Z' }),

    // Header Financials
    currencyId: z.string(),
    exchangeRate: z.number().positive().openapi({ example: 3.75 }),
    discount: z.number().min(0).openapi({ example: 0.0, description: 'Descuento global a la orden' }),

    // Header Logistics
    deliveryDate: z.string().datetime().optional().openapi({ example: '2024-01-05T10:00:00Z' }),
    shippingAddress: z.string().optional().openapi({ example: 'Av. Las Flores 123' }),

    // Metadata
    notes: z.string().optional().openapi({ example: 'Entregar en portería' }),
    paymentDate: z.string().datetime().optional(),
    cancellationReason: z.string().optional(),
    comment: z.string().optional(),
    status: OrderStatusEnum.openapi({ example: OrderStatus.PENDING }),

    // Relations
    societyId: z.string().openapi({ example: '550e8400-e29b-41d4-a716-446655440000' }),
    partnerId: z.string().openapi({ example: '550e8400-e29b-41d4-a716-446655440000' }),
    branchId: z.string().openapi({ example: '550e8400-e29b-41d4-a716-446655440000' }),
    createdBy: z.string().optional().openapi({ example: 'userId' }),

    // Items
    orderItems: z.array(createOrderItemSchema).min(1, 'Debe agregar al menos un producto')
};

// 2. Create Order Schema
export const createOrderSchema = z.object({
    body: registry.register('CreateOrder', z.object({
        ...baseOrderFields,
        exchangeRate: baseOrderFields.exchangeRate.default(1.0),
        discount: baseOrderFields.discount.default(0.0),
        status: baseOrderFields.status.default(OrderStatus.PENDING)
    }))
});

// 3. Update Order Schema
export const updateOrderSchema = z.object({
    body: registry.register('UpdateOrder', z.object(baseOrderFields).partial())
});

// 4. Order ID Param Schema
export const orderIdSchema = z.object({
    params: z.object({
        id: z.string().uuid().openapi({ example: '550e8400-e29b-41d4-a716-446655440000' })
    })
});

// 5. Order Filters Schema (Standardized)
export const orderFiltersSchema = z.object({
    query: z.object({
        // Standard Pagination
        page: z.string().transform(val => parseInt(val)).optional().openapi({ example: '1' }),
        limit: z.string().transform(val => parseInt(val)).optional().openapi({ example: '10' }),
        sortBy: z.string().optional().openapi({ example: 'createdAt' }),
        sortOrder: z.string().optional().openapi({ example: 'desc' }),

        // Filters IDs
        societyId: z.string().optional().openapi({ example: 'uuid' }),
        societyCode: z.string().optional().openapi({ example: 'SOCIETY_001' }),
        partnerId: z.string().optional().openapi({ example: 'uuid' }),
        branchId: z.string().optional().openapi({ example: 'uuid' }),

        // Status (Single or Comma Separated support logic to be handled)
        status: OrderStatusEnum.optional().openapi({ example: OrderStatus.PENDING }),

        // Search
        search: z.string().optional().openapi({ example: 'ORD-001', description: 'Código o nombre de socio' }),

        // Date Range (Creation / Order Date)
        dateFrom: z.string().optional().openapi({ example: '2024-01-01' }),
        dateTo: z.string().optional().openapi({ example: '2024-12-31' }),
        reportMode: z.enum(['summary', 'detailed']).optional().openapi({
            example: 'detailed',
            description: 'Modo de reporte. detailed aplica filtros mas estrictos para evitar archivos demasiado grandes'
        }),

        // Amount Range
        totalAmountFrom: z.string().transform(val => parseFloat(val)).optional(),
        totalAmountTo: z.string().transform(val => parseFloat(val)).optional(),

        // User Tracking
        createdBy: z.string().optional()
    })
});

export type CreateOrderInput = z.infer<typeof createOrderSchema>['body'];
export type UpdateOrderInput = z.infer<typeof updateOrderSchema>['body'];
export type OrderFilters = z.infer<typeof orderFiltersSchema>['query'];
