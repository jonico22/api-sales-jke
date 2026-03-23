import prisma from '@/config/prisma';
import { redis } from '@/config/redis';
import { CreateBussinessPartnerInput, UpdateBussinessPartnerInput } from './bussinesspartner.schema';
import {
    PaginatedResult,
    getPrismaPaginationParams,
    buildPaginatedResult,
    PaginationQuery,
} from '@/utils/pagination';
import { BussinessPartner, PartnerType } from '@prisma/client';
import { convertLimaDateRangeToUTC } from '@/utils/dateFormatter';

const CACHE_PREFIX = 'bps:';
const CACHE_TTL_LIST = 300; // 5 minutos
const CACHE_TTL_SINGLE = 600; // 10 minutos

export interface BusinessPartnerFilters {
    search?: string;
    isActive?: boolean | string; // query params come as string often
    typeBP?: string;
    type?: PartnerType; // New Filter
    createdAtFrom?: string;
    createdAtTo?: string;
    societyCode?: string;
    societyId?: string;
}

export const BussinessPartnerService = {
    /**
     * Obtener todos los socios de negocio con paginación y filtros
     */
    async getAll(
        paginationQuery?: PaginationQuery,
        societyId?: string,
        filters?: BusinessPartnerFilters
    ): Promise<PaginatedResult<BussinessPartner>> {
        const page = paginationQuery?.page ?? 1;
        const limit = paginationQuery?.limit ?? 10;
        const sortBy = paginationQuery?.sortBy || 'createdAt';
        const sortOrder = paginationQuery?.sortOrder || 'desc';

        // Resolve societyId from args or filters
        let resolvedSocietyId = societyId;
        const societyCodeOrId = filters?.societyCode || filters?.societyId;

        if (!resolvedSocietyId && societyCodeOrId) {
            const isUuid = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(societyCodeOrId);
            if (isUuid) {
                resolvedSocietyId = societyCodeOrId;
            } else {
                const society = await prisma.society.findUnique({ where: { code: societyCodeOrId } });
                if (society) {
                    resolvedSocietyId = society.id;
                } else {
                    return buildPaginatedResult([], page, limit, 0);
                }
            }
        }

        // Cache Key Construction
        const cacheKeyParts = [
            CACHE_PREFIX,
            'list',
            resolvedSocietyId || 'all',
            filters?.search || 'all',
            filters?.isActive !== undefined ? String(filters.isActive) : 'all',
            filters?.typeBP || 'all',
            filters?.type || 'all',
            filters?.createdAtFrom || 'all',
            filters?.createdAtTo || 'all',
            filters?.createdAtTo || 'all',
            page,
            limit,
            sortBy,
            sortOrder
        ];
        const cacheKey = cacheKeyParts.join(':');

        // 1. Try Cache
        const cached = await redis.get<PaginatedResult<BussinessPartner>>(cacheKey);
        if (cached) return cached;

        // 2. Database Query
        const prismaParams = getPrismaPaginationParams(page, limit, sortBy, sortOrder);

        const whereClause: any = {
            isDeleted: false,
            ...(resolvedSocietyId && { societyId: resolvedSocietyId }),
        };

        // Apply Filters
        if (filters?.search) {
            whereClause.OR = [
                { companyName: { contains: filters.search, mode: 'insensitive' } },
                { firstName: { contains: filters.search, mode: 'insensitive' } },
                { lastName: { contains: filters.search, mode: 'insensitive' } },
                { documentNumber: { contains: filters.search, mode: 'insensitive' } },
                { email: { contains: filters.search, mode: 'insensitive' } }
            ];
        }

        if (filters?.isActive !== undefined) {
            // Handle "true"/"false" strings if coming from query
            const isActiveBool = String(filters.isActive) === 'true';
            whereClause.isActive = isActiveBool;
        }

        if (filters?.typeBP) {
            whereClause.typeBP = filters.typeBP;
        }

        if (filters?.type) {
            whereClause.type = filters.type;
        }

        if (filters?.createdAtFrom || filters?.createdAtTo) {
            whereClause.createdAt = {};
            const dateRange = convertLimaDateRangeToUTC(filters.createdAtFrom, filters.createdAtTo);
            if (dateRange.from) whereClause.createdAt.gte = dateRange.from;
            if (dateRange.to) whereClause.createdAt.lte = dateRange.to;
        }

        const [data, total] = await prisma.$transaction([
            prisma.bussinessPartner.findMany({
                where: whereClause,
                skip: prismaParams.skip,
                take: prismaParams.take,
                orderBy: sortBy === 'name'
                  ? [{ companyName: sortOrder }, { firstName: sortOrder }]
                  : (sortBy ? { [sortBy || 'createdAt']: sortOrder } : { createdAt: sortOrder }),
                include: {
                    documentType: true,
                    ubigeo: true, // Include Ubigeo details
                    society: {
                        select: {
                            id: true,
                            name: true,
                            code: true,
                        },
                    },
                },
            }),
            prisma.bussinessPartner.count({ where: whereClause }),
        ]);

        const result = buildPaginatedResult(data, page, limit, total);

        // 3. Set Cache
        await redis.set(cacheKey, result, CACHE_TTL_LIST);

        return result;
    },

    /**
     * Obtener un socio de negocio por ID
     */
    async getById(id: string) {
        const cacheKey = `${CACHE_PREFIX}${id}`;

        // Try Cache
        const cached = await redis.get<BussinessPartner>(cacheKey);
        if (cached) return cached;

        const bp = await prisma.bussinessPartner.findFirst({
            where: { id, isDeleted: false },
            include: {
                documentType: true,
                ubigeo: true,
                society: {
                    select: {
                        id: true,
                        name: true,
                        code: true,
                    },
                },
            },
        });

        if (bp) await redis.set(cacheKey, bp, CACHE_TTL_SINGLE);

        return bp;
    },

    /**
     * Crear un nuevo socio de negocio
     */
    async create(data: CreateBussinessPartnerInput) {
        // Resolve societyId if it's a code
        const isUuid = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(data.societyId);
        if (!isUuid) {
            const society = await prisma.society.findUnique({ where: { code: data.societyId } });
            if (!society) throw new Error(`Sociedad con código ${data.societyId} no encontrada`);
            data.societyId = society.id;
        }

        const created = await prisma.bussinessPartner.create({
            data,
            include: {
                documentType: true,
                ubigeo: true,
                society: {
                    select: {
                        id: true,
                        name: true,
                        code: true,
                    },
                },
            },
        });

        // Invalidate Cache
        await redis.deleteKeysByPrefix(`${CACHE_PREFIX}list:`);
        await redis.deleteKeysByPrefix(`${CACHE_PREFIX}select:`);

        return created;
    },

    /**
     * Actualizar un socio de negocio
     */
    async update(id: string, data: UpdateBussinessPartnerInput) {
        const updated = await prisma.bussinessPartner.update({
            where: { id },
            data,
            include: {
                documentType: true,
                ubigeo: true,
                society: {
                    select: {
                        id: true,
                        name: true,
                        code: true,
                    },
                },
            },
        });

        // Invalidate Cache
        await redis.del(`${CACHE_PREFIX}${id}`);
        await redis.deleteKeysByPrefix(`${CACHE_PREFIX}list:`);
        await redis.deleteKeysByPrefix(`${CACHE_PREFIX}select:`);

        return updated;
    },

    /**
     * Soft delete de un socio de negocio
     */
    async softDelete(id: string, updatedBy?: string) {
        const deleted = await prisma.bussinessPartner.update({
            where: { id },
            data: {
                isDeleted: true,
                isActive: false,
                updatedBy,
            },
        });

        // Invalidate Cache
        await redis.del(`${CACHE_PREFIX}${id}`);
        await redis.deleteKeysByPrefix(`${CACHE_PREFIX}list:`);
        await redis.deleteKeysByPrefix(`${CACHE_PREFIX}select:`);

        return deleted;
    },

    /**
     * Hard delete de un socio de negocio (usar con precaución)
     */
    async hardDelete(id: string) {
        const deleted = await prisma.bussinessPartner.delete({
            where: { id },
        });

        // Invalidate Cache
        await redis.del(`${CACHE_PREFIX}${id}`);
        await redis.deleteKeysByPrefix(`${CACHE_PREFIX}list:`);
        await redis.deleteKeysByPrefix(`${CACHE_PREFIX}select:`);

        return deleted;
    },

    /**
     * Buscar socios de negocio por email
     */
    async findByEmail(email: string) {
        return prisma.bussinessPartner.findUnique({
            where: { email },
            include: {
                documentType: true,
            },
        });
    },

    /**
     * Buscar socios de negocio por número de documento
     */
    async findByDocumentNumber(documentNumber: string) {
        return prisma.bussinessPartner.findFirst({
            where: { documentNumber },
            include: {
                documentType: true,
            },
        });
    },

    async getForSelect(societyCodeOrId?: string, type?: PartnerType) {
        // Cache Key including society identifier and Type
        const cacheKey = `${CACHE_PREFIX}select:${societyCodeOrId || 'all'}:${type || 'all'}`;
        const cached = await redis.get<any[]>(cacheKey);
        if (cached) return cached;

        const whereClause: any = {
            isDeleted: false,
            isActive: true,
        };

        // Resolve Society Code or ID
        let resolvedSocietyId: string | undefined;
        if (societyCodeOrId) {
            const isUuid = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(societyCodeOrId);
            if (isUuid) {
                resolvedSocietyId = societyCodeOrId;
            } else {
                const society = await prisma.society.findUnique({ where: { code: societyCodeOrId } });
                if (society) {
                    resolvedSocietyId = society.id;
                } else {
                    return [];
                }
            }
        }

        if (resolvedSocietyId) {
            whereClause.societyId = resolvedSocietyId;
        }

        if (type) {
            // If requesting CUSTOMER, allow CUSTOMER and BOTH
            if (type === 'CUSTOMER') {
                whereClause.type = { in: ['CUSTOMER'] };
            } else if (type === 'SUPPLIER') {
                whereClause.type = { in: ['SUPPLIER', 'BOTH'] };
            } else {
                whereClause.type = type;
            }
        }

        const partners = await prisma.bussinessPartner.findMany({
            where: whereClause,
            select: {
                id: true,
                firstName: true,
                lastName: true,
                companyName: true,
                documentNumber: true,
                type: true,
            },
            orderBy: { createdAt: 'desc' }
        });

        const result = partners.map(p => ({
            id: p.id,
            name: p.companyName || `${p.firstName} ${p.lastName}`.trim(),
            documentNumber: p.documentNumber,
            type: p.type
        }));

        await redis.set(cacheKey, result, 300); // 5 min cache for select
        return result;
    }
};
