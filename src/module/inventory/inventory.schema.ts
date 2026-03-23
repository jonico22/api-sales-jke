
import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { registry } from '@/config/swagger';
import { TransactionType } from '@prisma/client';

extendZodWithOpenApi(z);

// ---------------------------------------------------------
// Schemas
// ---------------------------------------------------------

export const inventoryTransactionSchema = z.object({
    id: z.string().uuid(),
    date: z.date(),
    productId: z.string().uuid(),
    branchOfficeId: z.string().uuid(),
    type: z.nativeEnum(TransactionType),
    quantity: z.number().int(),
    previousStock: z.number().int(),
    newStock: z.number().int(),
    unitCost: z.number(),
    totalCost: z.number(),
    referenceId: z.string().optional().nullable(),
    referenceType: z.string().optional().nullable(),
    documentNumber: z.string().optional().nullable(),
    createdAt: z.date(),
    updatedAt: z.date(),
}).openapi('InventoryTransaction');

// Filter Schema for Query Params
export const inventoryFilterSchema = z.object({
    query: z.object({
        page: z.string().optional(),
        limit: z.string().optional(),
        search: z.string().optional(),
        branchId: z.string().optional().openapi({ example: 'uuid', description: 'ID de la sucursal' }),
        productId: z.string().optional().openapi({ example: 'uuid', description: 'ID del producto' }),
        societyId: z.string().optional().openapi({ example: 'uuid', description: 'ID de la sociedad' }),
        societyCode: z.string().optional().openapi({ example: 'SOC01', description: 'Código de la sociedad' }),
        startDate: z.string().datetime().optional(), // ISO String
        endDate: z.string().datetime().optional(),   // ISO String
        type: z.nativeEnum(TransactionType).optional(),
    })
});

// Schema for Manual Adjustment (Create)
export const createAdjustmentSchema = z.object({
    body: z.object({
        productId: z.string().uuid({ message: "Producto ID requerido" }),
        branchOfficeId: z.string().uuid({ message: "Sucursal ID requerida" }),
        type: z.enum([TransactionType.ADJUSTMENT_ADD, TransactionType.ADJUSTMENT_SUB]),
        quantity: z.number().int().positive({ message: "La cantidad debe ser positiva" }),
        unitCost: z.number().nonnegative().optional(), // Opcional, si no se envía se usa el del producto
        notes: z.string().optional(), // Se guardará en referenceType o documentNumber
    })
}).openapi('CreateInventoryAdjustment');

// ---------------------------------------------------------
// Swagger Registration
// ---------------------------------------------------------

registry.registerPath({
    method: 'get',
    path: '/api/inventory/kardex',
    tags: ['Inventory'],
    summary: 'Listar movimientos de Kardex',
    description: 'Obtiene el historial de movimientos de inventario con filtros y paginación.',
    request: {
        query: inventoryFilterSchema.shape.query
    },
    responses: {
        200: {
            description: 'Lista de movimientos',
            content: {
                'application/json': {
                    schema: z.object({
                        total: z.number(),
                        page: z.number(),
                        limit: z.number(),
                        data: z.array(inventoryTransactionSchema)
                    })
                }
            }
        }
    }
});

registry.registerPath({
    method: 'post',
    path: '/api/inventory/adjustment',
    tags: ['Inventory'],
    summary: 'Registrar Ajuste Manual de Inventario',
    description: 'Permite registrar manualmente una entrada o salida por ajuste (merma, inventario físico, etc).',
    request: {
        body: {
            content: {
                'application/json': {
                    schema: createAdjustmentSchema.shape.body
                }
            }
        }
    },
    responses: {
        201: {
            description: 'Ajuste registrado exitosamente',
            content: {
                'application/json': {
                    schema: inventoryTransactionSchema
                }
            }
        }
    }
});
