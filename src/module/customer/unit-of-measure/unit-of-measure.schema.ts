import { z } from 'zod';
import { registry } from '@/config/swagger';

export const UnitOfMeasureSchema = registry.register(
    'UnitOfMeasure',
    z.object({
        id: z.string().uuid().openapi({ example: '550e8400-e29b-41d4-a716-446655440000' }),
        name: z.string().min(1).openapi({ example: 'Kilogramos', description: 'Nombre de la unidad' }),
        abbreviation: z.string().min(1).openapi({ example: 'kg', description: 'Abreviatura' }),
        sunatCode: z.string().min(1).openapi({ example: 'KGM', description: 'Código SUNAT' }),
        code: z.string().min(1).openapi({ example: 'KGM', description: 'Código interno único' }),
        isActive: z.boolean().default(true).openapi({ example: true }),
        societyId: z.string().openapi({ example: '550e8400-e29b-41d4-a716-446655440000' }),
    })
);

export const createUnitOfMeasureSchema = z.object({
    body: registry.register('CreateUnitOfMeasure', z.object({
        name: z.string().min(1).openapi({ example: 'Kilogramos' }),
        abbreviation: z.string().min(1).openapi({ example: 'kg' }),
        sunatCode: z.string().min(1).openapi({ example: 'KGM' }),
        code: z.string().min(1).openapi({ example: 'KGM' }),
        societyId: z.string().min(1).openapi({ example: 'SOC-001' }),
        isActive: z.boolean().default(true).optional().openapi({ example: true }),
        createdBy: z.string().uuid().optional().openapi({ example: 'admin-uuid' }),
    }))
});

export const updateUnitOfMeasureSchema = z.object({
    body: registry.register('UpdateUnitOfMeasure', z.object({
        name: z.string().min(1).optional().openapi({ example: 'Kilogramos' }),
        abbreviation: z.string().min(1).optional().openapi({ example: 'kg' }),
        sunatCode: z.string().min(1).optional().openapi({ example: 'KGM' }),
        code: z.string().min(1).optional().openapi({ example: 'KGM' }),
        isActive: z.boolean().optional().openapi({ example: true }),
        updatedBy: z.string().uuid().optional().openapi({ example: 'admin-uuid' }),
    }))
});

export const unitOfMeasureIdSchema = z.object({
    params: z.object({
        id: z.string().uuid().openapi({ example: '550e8400-e29b-41d4-a716-446655440000' })
    })
});

export const unitOfMeasureFiltersSchema = z.object({
    query: z.object({
        societyCode: z.string().optional().openapi({ example: 'SOC-001' }),
        societyId: z.string().optional().openapi({ example: 'SOC-001' }),
        search: z.string().optional().openapi({ example: 'kilo' }),
        isActive: z.string().transform(val => val === 'true').optional().openapi({ example: 'true' }),
    })
});

export type CreateUnitOfMeasureInput = z.infer<typeof createUnitOfMeasureSchema>['body'];
export type UpdateUnitOfMeasureInput = z.infer<typeof updateUnitOfMeasureSchema>['body'];
