import { z } from 'zod'
import { OrderStatus } from '@prisma/client'

export const createOrderSchema = z.object({
  body: z.object({
    orderCode: z.string().optional(), // Puede ser autogenerado
    orderDate: z.string().datetime().optional(),

    // Header Financials
    currencyId: z.string().uuid(),
    exchangeRate: z.number().positive().default(1.0),
    discount: z.number().min(0).default(0),

    // Header Logistics
    deliveryDate: z.string().datetime().optional(),
    shippingAddress: z.string().optional(),

    // Metadata
    notes: z.string().optional(),
    paymentDate: z.string().datetime().optional(),
    cancellationReason: z.string().optional(),
    comment: z.string().optional(),

    // Relations
    societyId: z.string().uuid(),
    partnerId: z.string().uuid(),
    branchId: z.string().uuid(),
    createdBy: z.string().optional(),

    // Items
    orderItems: z.array(z.object({
      productId: z.string().uuid(),
      quantity: z.number().int().positive(),
      unitPrice: z.number().positive(), // Precio unitario (Incl. Impuestos según política)
      discount: z.number().min(0).default(0),
      comment: z.string().optional()
    })).min(1, "Debe agregar al menos un producto")
  })
})
// Schema para ACTUALIZAR orden
export const updateOrderSchema = z.object({
  body: createOrderSchema.shape.body.partial()
})

// Schema para FILTROS de consulta de ordenes
export const orderFiltersSchema = z.object({
  query: z.object({
    // Paginación
    page: z.string().transform(val => parseInt(val)).optional(),
    limit: z.string().transform(val => parseInt(val)).optional(),
    sortBy: z.string().optional(),
    sortOrder: z.string().optional(),

    // Filtros de relación (con soporte legacy y nuevo)
    societyCode: z.string().optional(),
    societyId: z.string().optional(),
    partnerId: z.string().optional(),
    branchId: z.string().optional(),

    // Búsqueda inteligente
    search: z.string().optional(), // Busca por código, notas o nombre del socio

    // Filtros de estado
    status: z.nativeEnum(OrderStatus).optional(),

    // Filtros de fechas (Order Date)
    dateFrom: z.string().optional(), // YYYY-MM-DD
    dateTo: z.string().optional(),   // YYYY-MM-DD

    // Filtros de usuario
    createdBy: z.string().uuid().optional(),
  })
});
