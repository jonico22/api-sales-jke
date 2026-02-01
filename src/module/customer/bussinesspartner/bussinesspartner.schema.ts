import { z } from 'zod';
import { registry } from '@/config/swagger';

// Enum para tipo de socio de negocio
const BussinessPartnerTypeEnum = z.enum(['PERSONA', 'EMPRESA']);

// 1. Schema base del modelo BussinessPartner
export const BussinessPartnerSchema = registry.register(
    'BussinessPartner',
    z.object({
        id: z.string().uuid().openapi({ example: '550e8400-e29b-41d4-a716-446655440000' }),
        typeBP: BussinessPartnerTypeEnum.openapi({ example: 'PERSONA', description: 'Tipo: PERSONA o EMPRESA' }),
        typeDocId: z.string().uuid().optional().openapi({ example: '550e8400-e29b-41d4-a716-446655440000' }),
        documentNumber: z.string().optional().openapi({ example: '12345678', description: 'DNI, RUC, etc.' }),
        firstName: z.string().min(1).openapi({ example: 'Juan', description: 'Primer nombre' }),
        middleName: z.string().optional().openapi({ example: 'Carlos' }),
        lastName: z.string().min(1).openapi({ example: 'Pérez', description: 'Apellido paterno' }),
        surname: z.string().optional().openapi({ example: 'García', description: 'Apellido materno' }),
        companyName: z.string().optional().openapi({ example: 'Empresa SAC' }),
        contactEmail: z.string().email().optional().openapi({ example: 'contacto@empresa.com' }),
        email: z.string().email().openapi({ example: 'juan.perez@email.com', description: 'Email principal (único)' }),
        phone: z.string().min(1).openapi({ example: '987654321', description: 'Teléfono móvil' }),
        telephone: z.string().optional().openapi({ example: '014567890', description: 'Teléfono fijo' }),
        address: z.string().optional().openapi({ example: 'Av. Principal 123, Lima' }),
        societyId: z.string().uuid().openapi({ example: '550e8400-e29b-41d4-a716-446655440000' }),
        isActive: z.boolean().default(true).openapi({ example: true }),
        isDeleted: z.boolean().default(false).openapi({ example: false }),
        createdAt: z.string().datetime().openapi({ example: '2024-01-01T12:00:00Z' }),
        updatedAt: z.string().datetime().openapi({ example: '2024-01-01T12:00:00Z' }),
        createdBy: z.string().uuid().optional().openapi({ example: 'user-uuid' }),
        updatedBy: z.string().uuid().optional().openapi({ example: 'user-uuid' }),
    })
);

// 2. Schema para CREAR
export const createBussinessPartnerSchema = z.object({
    body: registry.register('CreateBussinessPartner', z.object({
        typeBP: BussinessPartnerTypeEnum,
        typeDocId: z.string().uuid().optional(),
        documentNumber: z.string().optional(),
        firstName: z.string().min(1, 'Nombre es requerido'),
        middleName: z.string().optional(),
        lastName: z.string().min(1, 'Apellido es requerido'),
        surname: z.string().optional(),
        companyName: z.string().optional(),
        contactEmail: z.string().email().optional(),
        email: z.string().email('Email inválido'),
        phone: z.string().optional(),
        telephone: z.string().optional(),
        address: z.string().optional(),
        societyId: z.string().uuid('Society ID inválido'),
        createdBy: z.string().uuid().optional(),
    }))
});

// 3. Schema para ACTUALIZAR
export const updateBussinessPartnerSchema = z.object({
    body: registry.register('UpdateBussinessPartner', z.object({
        typeBP: BussinessPartnerTypeEnum.optional(),
        typeDocId: z.string().uuid().optional(),
        documentNumber: z.string().optional(),
        firstName: z.string().min(1).optional(),
        middleName: z.string().optional(),
        lastName: z.string().min(1).optional(),
        surname: z.string().optional(),
        companyName: z.string().optional(),
        contactEmail: z.string().email().optional(),
        email: z.string().email().optional(),
        phone: z.string().min(1).optional(),
        telephone: z.string().optional(),
        address: z.string().optional(),
        updatedBy: z.string().uuid().optional(),
    }).partial())
});

// 4. Schema para validar ID en params
export const bussinessPartnerIdSchema = z.object({
    params: z.object({
        id: z.string().uuid().openapi({ example: '550e8400-e29b-41d4-a716-446655440000' })
    })
});

// Tipos inferidos para TypeScript
export type CreateBussinessPartnerInput = z.infer<typeof createBussinessPartnerSchema>['body'];
export type UpdateBussinessPartnerInput = z.infer<typeof updateBussinessPartnerSchema>['body'];
