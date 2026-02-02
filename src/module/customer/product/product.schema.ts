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
    isDeleted: z.boolean().default(false).openapi({ example: false }),
    createdAt: z.string().datetime().openapi({ example: '2024-01-01T12:00:00Z' }),
    createdBy: z.string().optional().openapi({ example: 'admin-uuid' }),
    updatedBy: z.string().optional().openapi({ example: 'admin-uuid' }),
    code: z.string().openapi({ example: 'PROD-001' }),
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
    createdBy: z.string().uuid().optional().openapi({ example: 'admin-uuid' }),
    code: z.string().openapi({ example: 'PROD-001' }),
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
    imageId: z.string().uuid().optional().openapi({ example: '550e8400-e29b-41d4-a716-446655440000' }),
    isActive: z.boolean().optional().openapi({ example: true }),
    updatedBy: z.string().uuid().optional().openapi({ example: 'admin-uuid' }),
    code: z.string().optional().openapi({ example: 'PROD-001' }),
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
