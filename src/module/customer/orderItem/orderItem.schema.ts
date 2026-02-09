
import { z } from 'zod';
import { registry } from '@/config/swagger';

// 1. OrderItem Base Schema
export const OrderItemSchema = registry.register(
    'OrderItem',
    z.object({
        id: z.string().uuid().openapi({ example: '550e8400-e29b-41d4-a716-446655440000' }),
        orderId: z.string().uuid().openapi({ example: '550e8400-e29b-41d4-a716-446655440000' }),
        productId: z.string().uuid().openapi({ example: '550e8400-e29b-41d4-a716-446655440000' }),
        quantity: z.number().int().positive().openapi({ example: 5 }),
        unitPrice: z.number().openapi({ example: 100.00 }),
        total: z.number().openapi({ example: 500.00 }),
        // ... add more fields as needed for documentation
    })
);

// 2. Create Schema
export const createOrderItemSchema = z.object({
    body: registry.register('CreateOrderItem', z.object({
        orderId: z.string().uuid().openapi({ example: '550e8400-e29b-41d4-a716-446655440000' }),
        productId: z.string().uuid().openapi({ example: '550e8400-e29b-41d4-a716-446655440000' }),
        quantity: z.number().int().positive().openapi({ example: 2 }),
        unitPrice: z.number().nonnegative().openapi({ example: 50.00, description: 'Precio unitario final' }),
        discount: z.number().min(0).default(0).optional().openapi({ example: 0 }),
        comment: z.string().optional().openapi({ example: 'Sin caja' }),
        createdBy: z.string().optional(),
    }))
});

// 3. Update Schema
export const updateOrderItemSchema = z.object({
    body: registry.register('UpdateOrderItem', createOrderItemSchema.shape.body.partial())
});

// 4. ID Param Schema
export const orderItemIdSchema = z.object({
    params: z.object({
        id: z.string().uuid().openapi({ example: '550e8400-e29b-41d4-a716-446655440000' })
    })
});

// 5. Filters Schema
export const orderItemFiltersSchema = z.object({
    query: z.object({
        // Standard Pagination
        page: z.string().transform(val => parseInt(val)).optional().openapi({ example: '1' }),
        limit: z.string().transform(val => parseInt(val)).optional().openapi({ example: '10' }),
        sortBy: z.string().optional().openapi({ example: 'createdAt' }),
        sortOrder: z.string().optional().openapi({ example: 'desc' }),

        // Filters
        orderId: z.string().uuid().optional().openapi({ example: 'uuid' }),
        productId: z.string().uuid().optional().openapi({ example: 'uuid' }),

        // Ranges
        minQuantity: z.string().transform(val => parseInt(val)).optional(),
        maxQuantity: z.string().transform(val => parseInt(val)).optional(),
        minTotal: z.string().transform(val => parseFloat(val)).optional(),
        maxTotal: z.string().transform(val => parseFloat(val)).optional(),

        // Search
        search: z.string().optional().openapi({ example: 'laptop', description: 'Search in product name or comments' }),

        // Dates (if OrderItem tracks createdAt directly or via Order) - assuming direct if schema has it, or via Order join
        dateFrom: z.string().optional(),
        dateTo: z.string().optional(),
    })
});

export type CreateOrderItemInput = z.infer<typeof createOrderItemSchema>['body'];
export type UpdateOrderItemInput = z.infer<typeof updateOrderItemSchema>['body'];
export type OrderItemFilters = z.infer<typeof orderItemFiltersSchema>['query'];
