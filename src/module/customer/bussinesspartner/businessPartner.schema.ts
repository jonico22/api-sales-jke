import { z } from 'zod';
import { registry } from '@/config/swagger';

const businessPartnerPersonTypeEnum = z.enum(['PERSON', 'LEGAL_ENTITY']);

enum PartnerType {
    CUSTOMER = 'CUSTOMER',
    SUPPLIER = 'SUPPLIER',
    BOTH = 'BOTH',
}

const partnerTypeEnum = z.nativeEnum(PartnerType);

export const BusinessPartnerSchema = registry.register(
    'BusinessPartner',
    z.object({
        id: z.string().uuid().openapi({ example: '550e8400-e29b-41d4-a716-446655440000' }),
        type: partnerTypeEnum.optional().default(PartnerType.CUSTOMER).openapi({ example: 'CUSTOMER', description: 'CUSTOMER, SUPPLIER, BOTH' }),
        typeBP: businessPartnerPersonTypeEnum.openapi({ example: 'PERSON', description: 'Tipo: PERSON o LEGAL_ENTITY' }),
        typeDocId: z.string().uuid().optional().openapi({ example: '550e8400-e29b-41d4-a716-446655440000' }),
        documentNumber: z.string().optional().openapi({ example: '12345678', description: 'DNI, RUC, etc.' }),
        firstName: z.string().min(1, 'Nombre es requerido').openapi({ example: 'Juan', description: 'Primer nombre' }),
        middleName: z.string().optional().openapi({ example: 'Carlos' }),
        lastName: z.string().min(1, 'Apellido es requerido').openapi({ example: 'Pérez', description: 'Apellido paterno' }),
        surname: z.string().optional().openapi({ example: 'García', description: 'Apellido materno' }),
        sex: z.string().optional().openapi({ example: 'M', description: 'Género' }),
        companyName: z.string().optional().openapi({ example: 'Empresa SAC' }),
        tradeName: z.string().optional().openapi({ example: 'Comercial Name' }),
        website: z.string().optional().openapi({ example: 'https://site.com' }),
        contactEmail: z.string().email().optional().openapi({ example: 'contacto@empresa.com' }),
        email: z.string().email('Email inválido').optional().openapi({ example: 'juan.perez@email.com', description: 'Email principal (único)' }),
        phone: z.string().optional().openapi({ example: '987654321', description: 'Teléfono móvil' }),
        telephone: z.string().optional().openapi({ example: '014567890', description: 'Teléfono fijo' }),
        address: z.string().optional().openapi({ example: 'Av. Principal 123, Lima' }),
        ubigeoId: z.string().length(6).optional().openapi({ example: '150101' }),
        taxCondition: z.string().optional().openapi({ example: 'HABIDO' }),
        taxStatus: z.string().optional().openapi({ example: 'ACTIVO' }),
        societyId: z.string().min(1, 'Society ID/Code es requerido').openapi({ example: 'SOC-001', description: 'ID o Código de la Sociedad' }),
        isActive: z.boolean().default(true).openapi({ example: true }),
        isDeleted: z.boolean().default(false).openapi({ example: false }),
        createdAt: z.string().datetime().openapi({ example: '2024-01-01T12:00:00Z' }),
        updatedAt: z.string().datetime().openapi({ example: '2024-01-01T12:00:00Z' }),
        createdBy: z.string().uuid().optional().openapi({ example: 'user-uuid' }),
        updatedBy: z.string().uuid().optional().openapi({ example: 'user-uuid' }),
    })
);

export const createBusinessPartnerSchema = z.object({
    body: registry.register('CreateBusinessPartner', z.object({
        type: partnerTypeEnum.optional().default(PartnerType.CUSTOMER),
        typeBP: businessPartnerPersonTypeEnum,
        typeDocId: z.string().uuid().optional(),
        documentNumber: z.string().optional(),
        firstName: z.string().optional(),
        middleName: z.string().optional(),
        lastName: z.string().optional(),
        surname: z.string().optional(),
        sex: z.string().optional(),
        companyName: z.string().optional(),
        tradeName: z.string().optional(),
        website: z.string().optional(),
        ubigeoId: z.string().length(6).optional(),
        taxCondition: z.string().optional(),
        taxStatus: z.string().optional(),
        contactEmail: z.string().email().optional(),
        email: z.string().email('Email inválido').optional(),
        phone: z.string().optional(),
        telephone: z.string().optional(),
        address: z.string().optional(),
        societyId: z.string().min(1, 'Society ID/Code es requerido'),
        createdBy: z.string().uuid().optional(),
    }))
});

export const updateBusinessPartnerSchema = z.object({
    body: registry.register('UpdateBusinessPartner', z.object({
        type: partnerTypeEnum.optional(),
        typeBP: businessPartnerPersonTypeEnum.optional(),
        typeDocId: z.string().uuid().optional(),
        documentNumber: z.string().optional(),
        firstName: z.string().min(1).optional(),
        middleName: z.string().optional(),
        lastName: z.string().min(1).optional(),
        surname: z.string().optional(),
        sex: z.string().optional(),
        companyName: z.string().optional(),
        tradeName: z.string().optional(),
        website: z.string().optional(),
        ubigeoId: z.string().length(6).optional(),
        taxCondition: z.string().optional(),
        taxStatus: z.string().optional(),
        contactEmail: z.string().email().optional(),
        email: z.string().email().optional(),
        phone: z.string().min(1).optional(),
        telephone: z.string().optional(),
        address: z.string().optional(),
        updatedBy: z.string().uuid().optional(),
        isActive: z.boolean().optional(),
    }).partial())
});

export const businessPartnerIdSchema = z.object({
    params: z.object({
        id: z.string().uuid().openapi({ example: '550e8400-e29b-41d4-a716-446655440000' })
    })
});

export const businessPartnerFiltersSchema = z.object({
    query: z.object({
        societyCode: z.string().optional().openapi({ example: 'SOC-001', description: 'Código de sociedad' }),
        societyId: z.string().optional().openapi({ example: 'UUID', description: 'ID de la sociedad' }),
        search: z.string().optional().openapi({ example: 'Juan', description: 'Búsqueda por nombre o documento' }),
        isActive: z.string().transform((val) => val === 'true').optional().openapi({ example: 'true' }),
        typeBP: businessPartnerPersonTypeEnum.optional().openapi({ example: 'PERSON' }),
        type: partnerTypeEnum.optional().openapi({ example: 'CUSTOMER' }),
        createdAtFrom: z.string().optional().openapi({ example: '2024-01-01' }),
        createdAtTo: z.string().optional().openapi({ example: '2024-12-31' }),
    })
});

export type CreateBusinessPartnerInput = z.infer<typeof createBusinessPartnerSchema>['body'];
export type UpdateBusinessPartnerInput = z.infer<typeof updateBusinessPartnerSchema>['body'];
export type BusinessPartnerQueryFilters = z.infer<typeof businessPartnerFiltersSchema>['query'];

export const BussinessPartnerSchema = BusinessPartnerSchema;
export const createBussinessPartnerSchema = createBusinessPartnerSchema;
export const updateBussinessPartnerSchema = updateBusinessPartnerSchema;
export const bussinessPartnerIdSchema = businessPartnerIdSchema;
export const bussinessPartnerFiltersSchema = businessPartnerFiltersSchema;
export type CreateBussinessPartnerInput = CreateBusinessPartnerInput;
export type UpdateBussinessPartnerInput = UpdateBusinessPartnerInput;
