import { z } from 'zod';
import { registry } from '@/config/swagger'; // Importamos el registro que configuramos


// 1. Definimos el objeto base que representa a una Categoría en la BD
export const CategorySchema = registry.register(
  'Category',
  z.object({
    id: z.string().uuid().openapi({ example: '550e8400-e29b-41d4-a716-446655440000' }),
    name: z.string().min(1).openapi({ example: 'Electrónicos', description: 'Nombre de la categoría' }),
    code: z.string().min(1).openapi({ example: 'CAT-001', description: 'Código único interno' }),
    societyId: z.string().openapi({ example: '550e8400-e29b-41d4-a716-446655440000' }),
    description: z.string().optional().openapi({ example: 'Categoría para productos electrónicos' }),
    isActive: z.boolean().default(true).openapi({ example: true }),
    isDeleted: z.boolean().default(false).openapi({ example: false }),
    createdAt: z.string().datetime().openapi({ example: '2024-01-01T12:00:00Z' }),
    createdBy: z.string().optional().openapi({ example: 'admin-uuid' }),
    updatedBy: z.string().optional().openapi({ example: 'admin-uuid' }),
  })
);

// 2. Esquema para CREAR - solo campos requeridos
export const createCategorySchema = z.object({
  body: registry.register('CreateCategory', z.object({
    name: z.string().min(1).openapi({ example: 'Electrónicos', description: 'Nombre de la categoría' }),
    code: z.string().min(1).openapi({ example: 'CAT-001', description: 'Código único interno' }),
    societyId: z.string().min(1).openapi({ example: 'EMP-001', description: 'Código de la Sociedad (Code)' }),
    description: z.string().optional().openapi({ example: 'Categoría para productos electrónicos' }),
    isActive: z.boolean().optional().default(true).openapi({ example: true }),
    createdBy: z.string().uuid().optional().openapi({ example: 'admin-uuid' }),
  }))
});

// 3. Esquema para ACTUALIZAR (hacemos los campos opcionales)
export const updateCategorySchema = z.object({
  body: registry.register('UpdateCategory', CategorySchema.omit({
    id: true,
    createdAt: true,
    createdBy: true
  }).partial())
});

// 4. Esquema para VALIDAR ID en la URL
export const categoryIdSchema = z.object({
  params: z.object({
    id: z.string().uuid().openapi({ example: '550e8400-e29b-41d4-a716-446655440000' })
  })
});