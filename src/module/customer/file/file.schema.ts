import { z } from 'zod';
import { registry } from '@/config/swagger';

const StorageTypeEnum = z.enum(['LOCAL', 'S3', 'EXTERNAL']);

// Schema base del File para OpenAPI
export const FileSchema = registry.register(
    'File',
    z.object({
        id: z.string().uuid().openapi({ example: '550e8400-e29b-41d4-a716-446655440000' }),
        name: z.string().min(1).openapi({ example: 'invoice.pdf' }),
        path: z.string().min(1).openapi({ example: '/uploads/invoice.pdf' }),
        mimeType: z.string().optional().openapi({ example: 'application/pdf' }),
        size: z.number().int().optional().openapi({ example: 1024 }),
        key: z.string().optional().openapi({ example: 'files/invoice.pdf' }),
        storageType: StorageTypeEnum.default('LOCAL').openapi({ example: 'LOCAL' }),
        uploadedAt: z.string().datetime().openapi({ example: '2024-01-01T12:00:00Z' }),
        societyId: z.string().uuid().openapi({ example: '550e8400-e29b-41d4-a716-446655440000' }),
        uploadedBy: z.string().optional().openapi({ example: 'Admin User' }),
        uploadedById: z.string().uuid().optional().openapi({ example: '550e8400-e29b-41d4-a716-446655440000' }),
    })
);

// Schema para CREAR archivo
export const createFileSchema = z.object({
    body: registry.register('CreateFile', z.object({
        name: z.string().min(1).openapi({ example: 'invoice.pdf' }),
        path: z.string().min(1).openapi({ example: '/uploads/invoice.pdf' }),
        mimeType: z.string().optional().openapi({ example: 'application/pdf' }),
        size: z.number().int().optional().openapi({ example: 1024 }),
        key: z.string().optional().openapi({ example: 'files/invoice.pdf' }),
        storageType: StorageTypeEnum.default('LOCAL').optional(),
        societyId: z.string().uuid().openapi({ example: '550e8400-e29b-41d4-a716-446655440000' }),
        uploadedBy: z.string().optional(),
        uploadedById: z.string().uuid().optional(),
    }))
});

// Schema para ACTUALIZAR archivo
export const updateFileSchema = z.object({
    body: registry.register('UpdateFile', z.object({
        name: z.string().min(1).optional(),
        path: z.string().min(1).optional(),
        mimeType: z.string().optional(),
        size: z.number().int().optional(),
        key: z.string().optional(),
        storageType: StorageTypeEnum.optional(),
    }).partial())
});

// Schema para validar ID param
export const fileIdSchema = z.object({
    params: z.object({
        id: z.string().uuid().openapi({ example: '550e8400-e29b-41d4-a716-446655440000' })
    })
});

// Tipos inferidos
export type CreateFileInput = z.infer<typeof createFileSchema>['body'];
export type UpdateFileInput = z.infer<typeof updateFileSchema>['body'];

// Schema para FILTROS
export const fileFiltersSchema = z.object({
    query: z.object({
        societyId: z.string().uuid().optional().openapi({ example: '550e8400-e29b-41d4-a716-446655440000' }),
        search: z.string().optional().openapi({ example: 'invoice', description: 'Buscar por nombre' }),
        folder: z.string().optional().openapi({ example: 'ventas-2024', description: 'Filtrar por carpeta (prefijo de key)' }),
        mimeType: z.string().optional().openapi({ example: 'application/pdf' }),
        storageType: StorageTypeEnum.optional().openapi({ example: 'LOCAL' }),
        uploadedAtFrom: z.string().optional().openapi({ example: '2024-01-01' }),
        uploadedAtTo: z.string().optional().openapi({ example: '2024-12-31' }),
    })
});
