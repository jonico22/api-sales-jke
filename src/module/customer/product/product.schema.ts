import { z } from 'zod';
import { registry } from '@/config/swagger';

// Schema base del Producto para OpenAPI
export const ProductSchema = registry.register(
  'Product',
  z.object({
    id: z.string().uuid().openapi({ example: '550e8400-e29b-41d4-a716-446655440000' }),
    name: z.string().min(1).openapi({ example: 'Laptop HP Pavilion', description: 'Nombre del producto' }),
    description: z.string().optional().openapi({ example: 'Laptop con procesador Intel i5' }),
    price: z.number().openapi({ example: 1500.00, description: 'Precio de venta' }),
    priceCost: z.number().openapi({ example: 1200.00, description: 'Precio de costo' }),
    stock: z.number().int().openapi({ example: 50, description: 'Stock actual' }),
    minStock: z.number().int().openapi({ example: 10, description: 'Stock mínimo para alertas' }),
    societyId: z.string().openapi({ example: '550e8400-e29b-41d4-a716-446655440000' }),
    categoryId: z.string().openapi({ example: '550e8400-e29b-41d4-a716-446655440000' }),
    imageId: z.string().optional().openapi({ example: '550e8400-e29b-41d4-a716-446655440000' }),
    isActive: z.boolean().default(true).openapi({ example: true }),
    updatedBy: z.string().optional().openapi({ example: 'admin-uuid' }),
    code: z.string().openapi({ example: 'PROD-001' }),
    barcode: z.string().optional().openapi({ example: '775000000001', description: 'Código de barras (EAN/UPC)' }),
    brand: z.string().optional().openapi({ example: 'HP', description: 'Marca del producto' }),
    unitOfMeasure: z.string().default('NIU').openapi({ example: 'NIU', description: 'Unidad de medida (SUNAT)' }),
    color: z.string().optional().openapi({ example: 'Rojo', description: 'Color del producto' }),
    colorCode: z.string().optional().openapi({ example: '#FF0000', description: 'Código de color' }),
  })
);

// Schema para CREAR producto
export const createProductSchema = z.object({
  body: registry.register('CreateProduct', z.object({
    name: z.string().min(1).openapi({ example: 'Laptop HP', description: 'Nombre del producto' }),
    description: z.string().optional().openapi({ example: 'Descripción del producto' }),
    price: z.coerce.number().gt(0).openapi({ example: 1500.00, description: 'Precio de venta' }),
    priceCost: z.coerce.number().nonnegative().openapi({ example: 1200.00, description: 'Precio de costo' }),
    stock: z.coerce.number().int().nonnegative().default(0).openapi({ example: 50 }),
    minStock: z.coerce.number().int().nonnegative().default(0).openapi({ example: 10 }),
    societyId: z.string().min(1).openapi({ example: 'SOC-001', description: 'Código de la Sociedad' }),
    categoryId: z.string().min(1).openapi({ example: 'CAT-ELEC-01', description: 'Código de la Categoría' }),
    imageId: z.string().uuid().optional().openapi({ example: '550e8400-e29b-41d4-a716-446655440000' }),
    isActive: z.boolean().default(true).optional().openapi({ example: true, description: 'Indica si el producto está activo' }),
    createdBy: z.string().uuid().optional().openapi({ example: 'admin-uuid' }),
    code: z.string().openapi({ example: 'PROD-001' }),
    barcode: z.string().optional().openapi({ example: '775000000001', description: 'Código de barras (EAN/UPC)' }),
    brand: z.string().optional().openapi({ example: 'HP', description: 'Marca del producto' }),
    unitOfMeasure: z.string().default('NIU').optional().openapi({ example: 'NIU', description: 'Unidad de medida (SUNAT)' }),
    color: z.string().optional().openapi({ example: 'Rojo', description: 'Color del producto' }),
    colorCode: z.string().optional().openapi({ example: '#FF0000', description: 'Código de color' }),
  }))
});

// Schema para ACTUALIZAR producto (campos opcionales)
export const updateProductSchema = z.object({
  body: registry.register('UpdateProduct', z.object({
    name: z.string().min(1).optional().openapi({ example: 'Laptop HP' }),
    description: z.string().optional().openapi({ example: 'Descripción actualizada' }),
    price: z.coerce.number().gt(0).optional().openapi({ example: 1500.00 }),
    priceCost: z.coerce.number().nonnegative().optional().openapi({ example: 1200.00 }),
    stock: z.coerce.number().int().nonnegative().optional().openapi({ example: 50 }),
    minStock: z.coerce.number().int().nonnegative().optional().openapi({ example: 10 }),
    societyId: z.string().min(1).optional().openapi({ example: 'SOC-001', description: 'Código de la Sociedad' }),
    categoryId: z.string().min(1).optional().openapi({ example: 'CAT-ELEC-01', description: 'Código de la Categoría' }),
    isActive: z.boolean().optional().openapi({ example: true }),
    updatedBy: z.string().uuid().optional().openapi({ example: 'admin-uuid' }),
    code: z.string().optional().openapi({ example: 'PROD-001' }),
    barcode: z.string().optional().openapi({ example: '775000000001', description: 'Código de barras (EAN/UPC)' }),
    brand: z.string().optional().openapi({ example: 'HP', description: 'Marca del producto' }),
    unitOfMeasure: z.string().optional().openapi({ example: 'NIU', description: 'Unidad de medida (SUNAT)' }),
    color: z.string().optional().openapi({ example: 'Rojo', description: 'Color del producto' }),
    colorCode: z.string().optional().openapi({ example: '#FF0000', description: 'Código de color' }),
  }))
});

// Schema para validar ID en params
export const productIdSchema = z.object({
  params: z.object({
    id: z.string().uuid().openapi({ example: '550e8400-e29b-41d4-a716-446655440000' })
  })
});

// Tipos inferidos
export type CreateProductInput = z.infer<typeof createProductSchema>['body'];
export type UpdateProductInput = z.infer<typeof updateProductSchema>['body'];

// Schema para FILTROS de consulta de productos
export const productFiltersSchema = z.object({
  query: z.object({
    // Filtros de relación
    societyCode: z.string().optional().openapi({
      example: 'SOC-001',
      description: 'Código de sociedad'
    }),
    societyId: z.string().optional().openapi({
      example: 'SOC-001',
      description: 'Código de sociedad (legacy)'
    }),
    categoryCode: z.string().optional().openapi({
      example: 'CAT-001',
      description: 'Código de categoría'
    }),
    categoryId: z.string().optional().openapi({
      example: 'CAT-001',
      description: 'Código de categoría (legacy)'
    }),
    branchId: z.string().uuid().optional().openapi({
      example: '550e8400-e29b-41d4-a716-446655440000',
      description: 'ID de la sucursal para filtrar productos con stock en esa sucursal'
    }),

    // Búsqueda por nombre o código
    search: z.string().trim().optional().openapi({
      example: 'laptop',
      description: 'Búsqueda por nombre o código del producto (case-insensitive)'
    }),
    color: z.string().optional().openapi({
      example: 'Rojo',
      description: 'Filtrar por color'
    }),
    brand: z.string().optional().openapi({
      example: 'Samsung',
      description: 'Filtrar por marca'
    }),

    // Filtros de estado
    isActive: z.string().transform(val => val === 'true').optional().openapi({
      example: 'true',
      description: 'Filtrar por estado activo/inactivo'
    }),

    // Filtros de precio
    priceFrom: z.string().transform(val => parseFloat(val)).optional().openapi({
      example: '100',
      description: 'Precio mínimo de venta'
    }),
    priceTo: z.string().transform(val => parseFloat(val)).optional().openapi({
      example: '1000',
      description: 'Precio máximo de venta'
    }),

    // Filtros de precio de costo
    priceCostFrom: z.string().transform(val => parseFloat(val)).optional().openapi({
      example: '50',
      description: 'Precio de costo mínimo'
    }),
    priceCostTo: z.string().transform(val => parseFloat(val)).optional().openapi({
      example: '800',
      description: 'Precio de costo máximo'
    }),

    // Filtros de stock
    lowStock: z.string().transform(val => val === 'true').optional().openapi({
      example: 'true',
      description: 'Productos con stock bajo (stock <= minStock)'
    }),
    stockStatus: z.enum(['all', 'available', 'low', 'out']).optional().openapi({
      example: 'available',
      description: 'Estado de stock: all (todos) | available (disponible, stock > 0) | low (bajo stock) | out (agotado, stock = 0)'
    }),
    stockFrom: z.string().transform(val => parseInt(val)).optional().openapi({
      example: '10',
      description: 'Stock mínimo'
    }),
    stockTo: z.string().transform(val => parseInt(val)).optional().openapi({
      example: '100',
      description: 'Stock máximo'
    }),

    // Filtros de usuario
    createdBy: z.string().uuid().optional().openapi({
      example: '550e8400-e29b-41d4-a716-446655440000',
      description: 'UUID del usuario que creó el producto'
    }),
    updatedBy: z.string().uuid().optional().openapi({
      example: '550e8400-e29b-41d4-a716-446655440000',
      description: 'UUID del usuario que actualizó el producto'
    }),

    // Filtros de rango de fechas para createdAt
    createdAtFrom: z.string().optional().openapi({
      example: '2024-01-01',
      description: 'Fecha inicial de creación. Formato: YYYY-MM-DD o ISO 8601'
    }),
    createdAtTo: z.string().optional().openapi({
      example: '2024-12-31',
      description: 'Fecha final de creación. Formato: YYYY-MM-DD o ISO 8601'
    }),

    // Filtros de rango de fechas para updatedAt
    updatedAtFrom: z.string().optional().openapi({
      example: '2024-01-01',
      description: 'Fecha inicial de actualización. Formato: YYYY-MM-DD o ISO 8601'
    }),
    updatedAtTo: z.string().optional().openapi({
      example: '2024-12-31',
      description: 'Fecha final de actualización. Formato: YYYY-MM-DD o ISO 8601'
    }),
  })
});

// Schema para FILTROS de select (sin paginación)
export const productSelectFiltersSchema = z.object({
  query: z.object({
    societyCode: z.string().optional().openapi({ example: 'SOC-001' }),
    societyId: z.string().optional().openapi({ example: 'SOC-001' }),
    categoryCode: z.string().optional().openapi({ example: 'CAT-001' }),
    categoryId: z.string().optional().openapi({ example: 'CAT-001' }),
    branchId: z.string().uuid().optional().openapi({ example: '550e8400-e29b-41d4-a716-446655440000', description: 'ID de la sucursal (opcional, por defecto ALM-PRINCIPAL)' }),
    search: z.string().trim().optional().openapi({
      example: 'coca',
      description: 'Búsqueda parcial por nombre, código, marca o código de barras'
    }),
  })
});

export type ProductSelectFilters = z.infer<typeof productSelectFiltersSchema>['query'];
