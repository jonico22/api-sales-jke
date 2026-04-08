import prisma from '@/config/prisma';
import { redis } from '@/config/redis';
import { CreateBusinessPartnerInput, UpdateBusinessPartnerInput } from './businessPartner.schema';
import {
    PaginatedResult,
    getPrismaPaginationParams,
    buildPaginatedResult,
    PaginationQuery,
} from '@/utils/pagination';
import { BussinessPartner, PartnerType } from '@prisma/client';
import { convertLimaDateRangeToUTC } from '@/utils/dateFormatter';

const CACHE_PREFIX = 'bps:';
const CACHE_TTL_LIST = 300;
const CACHE_TTL_SINGLE = 600;

export interface BusinessPartnerFilters {
    search?: string;
    isActive?: boolean | string;
    typeBP?: string;
    type?: PartnerType;
    createdAtFrom?: string;
    createdAtTo?: string;
    societyCode?: string;
    societyId?: string;
}

export const BusinessPartnerService = {
    async getAll(
        paginationQuery?: PaginationQuery,
        societyId?: string,
        filters?: BusinessPartnerFilters
    ): Promise<PaginatedResult<BussinessPartner>> {
        const page = paginationQuery?.page ?? 1;
        const limit = paginationQuery?.limit ?? 10;
        const sortBy = paginationQuery?.sortBy || 'createdAt';
        const sortOrder = paginationQuery?.sortOrder || 'desc';

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

        if (!resolvedSocietyId) {
            return buildPaginatedResult([], page, limit, 0);
        }

        const cacheKeyParts = [
            'list',
            filters?.search || 'all',
            filters?.isActive !== undefined ? String(filters.isActive) : 'all',
            filters?.typeBP || 'all',
            filters?.type || 'all',
            filters?.createdAtFrom || 'all',
            filters?.createdAtTo || 'all',
            page,
            limit,
            sortBy,
            sortOrder
        ];
        const cacheKey = `${CACHE_PREFIX}${resolvedSocietyId}:${cacheKeyParts.join(':')}`;

        const cached = await redis.get<PaginatedResult<BussinessPartner>>(cacheKey);
        if (cached) return cached;

        const prismaParams = getPrismaPaginationParams(page, limit, sortBy, sortOrder);

        const whereClause: any = {
            isDeleted: false,
            societyId: resolvedSocietyId
        };

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
            whereClause.isActive = String(filters.isActive) === 'true';
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
                    ubigeo: true,
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
        await redis.set(cacheKey, result, CACHE_TTL_LIST);

        return result;
    },

    async getById(id: string) {
        const cacheKey = `${CACHE_PREFIX}${id}`;
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

    async create(data: CreateBusinessPartnerInput) {
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

        await redis.deleteKeysByPrefix(`${CACHE_PREFIX}${created.societyId}:`);
        return created;
    },

    async update(id: string, data: UpdateBusinessPartnerInput) {
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

        await Promise.all([
            redis.del(`${CACHE_PREFIX}${id}`),
            redis.deleteKeysByPrefix(`${CACHE_PREFIX}${updated.societyId}:`)
        ]);

        return updated;
    },

    async softDelete(id: string, updatedBy?: string) {
        const deleted = await prisma.bussinessPartner.update({
            where: { id },
            data: {
                isDeleted: true,
                isActive: false,
                updatedBy,
            },
            select: { societyId: true }
        });

        await Promise.all([
            redis.del(`${CACHE_PREFIX}${id}`),
            redis.deleteKeysByPrefix(`${CACHE_PREFIX}${deleted.societyId}:`)
        ]);

        return deleted;
    },

    async hardDelete(id: string) {
        const deleted = await prisma.bussinessPartner.delete({
            where: { id },
            select: { societyId: true }
        });

        await Promise.all([
            redis.del(`${CACHE_PREFIX}${id}`),
            redis.deleteKeysByPrefix(`${CACHE_PREFIX}${deleted.societyId}:`)
        ]);

        return deleted;
    },

    async findByEmail(email: string) {
        return prisma.bussinessPartner.findUnique({
            where: { email },
            include: {
                documentType: true,
            },
        });
    },

    async findByDocumentNumber(documentNumber: string) {
        return prisma.bussinessPartner.findFirst({
            where: { documentNumber },
            include: {
                documentType: true,
            },
        });
    },

    async getForSelect(societyCodeOrId?: string, type?: PartnerType) {
        let resolvedSocietyId: string | undefined;
        if (societyCodeOrId) {
            const isUuid = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(societyCodeOrId);
            if (isUuid) {
                resolvedSocietyId = societyCodeOrId;
            } else {
                const society = await prisma.society.findUnique({ where: { code: societyCodeOrId }, select: { id: true } });
                if (society) resolvedSocietyId = society.id;
            }
        }

        if (!resolvedSocietyId) return [];

        const cacheKey = `${CACHE_PREFIX}${resolvedSocietyId}:select:${type || 'all'}`;
        const cached = await redis.get<any[]>(cacheKey);
        if (cached) return cached;

        const whereClause: any = {
            isDeleted: false,
            isActive: true,
            societyId: resolvedSocietyId
        };

        if (type) {
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

        const result = partners.map((p) => ({
            id: p.id,
            name: p.companyName || `${p.firstName} ${p.lastName}`.trim(),
            documentNumber: p.documentNumber,
            type: p.type
        }));

        await redis.set(cacheKey, result, 300);
        return result;
    }
};

export const BussinessPartnerService = BusinessPartnerService;
