import { z } from 'zod';
import { registry } from '@/config/swagger';


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

export const updateCategorySchema = z.object({
  body: registry.register('UpdateCategory', CategorySchema.omit({
    id: true,
    createdAt: true,
    createdBy: true
  }).partial())
});

export const categoryIdSchema = z.object({
  params: z.object({
    id: z.string().uuid().openapi({ example: '550e8400-e29b-41d4-a716-446655440000' })
  })
});

export const categoryFiltersSchema = z.object({
  query: z.object({
    societyCode: z.string().optional().openapi({ example: 'SOC-001', description: 'Código de sociedad' }),
    societyId: z.string().optional().openapi({ example: 'SOC-001', description: 'Código de sociedad (legacy)' }),

    // Búsqueda por nombre o código
    search: z.string().optional().openapi({
      example: 'elect',
      description: 'Búsqueda por nombre o código (case-insensitive)'
    }),

    isActive: z.string().transform(val => val === 'true').optional().openapi({
      example: 'true',
      description: 'Filtrar por estado activo/inactivo'
    }),
    createdBy: z.string().uuid().optional().openapi({
      example: '550e8400-e29b-41d4-a716-446655440000',
      description: 'UUID del usuario que creó la categoría'
    }),

    createdAtFrom: z.string().optional().openapi({
      example: '2024-01-01',
      description: 'Fecha inicial de creación. Formato: YYYY-MM-DD o ISO 8601'
    }),
    createdAtTo: z.string().optional().openapi({
      example: '2024-12-31',
      description: 'Fecha final de creación. Formato: YYYY-MM-DD o ISO 8601'
    }),

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
