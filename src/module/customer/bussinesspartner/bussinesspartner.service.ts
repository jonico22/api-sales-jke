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
        const sortBy = paginationQuery?.sortBy ?? 'createdAt';
        const sortOrder = paginationQuery?.sortOrder ?? 'desc';

        // Cache Key Construction
        const cacheKeyParts = [
            CACHE_PREFIX,
            'list',
            societyId || 'all',
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
            ...(societyId && { societyId }),
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
                orderBy: prismaParams.orderBy ?? { createdAt: sortOrder },
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

        // Invalidate List Cache
        await redis.deleteKeysByPrefix(`${CACHE_PREFIX}list:`);

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
};
