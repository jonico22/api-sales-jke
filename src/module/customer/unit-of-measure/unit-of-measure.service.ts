import prisma from '@/config/prisma';
import { z } from 'zod';
import { createUnitOfMeasureSchema, updateUnitOfMeasureSchema } from './unit-of-measure.schema';
import {
    PaginatedResult,
    getPrismaPaginationParams,
    buildPaginatedResult,
    PaginationQuery,
} from '@/utils/pagination';
import { UnitOfMeasure } from '@prisma/client';
import { redis } from '@/config/redis';

type CreateUnitOfMeasureInput = z.infer<typeof createUnitOfMeasureSchema>['body'];
type UpdateUnitOfMeasureInput = z.infer<typeof updateUnitOfMeasureSchema>['body'];

const CACHE_PREFIX = 'uom:';
const CACHE_TTL_LIST = 300;
const CACHE_TTL_SINGLE = 600;

export interface UnitOfMeasureFilters {
    societyCode?: string;
    societyId?: string;
    search?: string;
    isActive?: boolean;
}

export const UnitOfMeasureService = {
    getAll: async (
        paginationQuery?: PaginationQuery,
        filters?: UnitOfMeasureFilters
    ): Promise<PaginatedResult<UnitOfMeasure>> => {
        const page = paginationQuery?.page ?? 1;
        const limit = paginationQuery?.limit ?? 10;
        const sortBy = paginationQuery?.sortBy ?? 'createdAt';
        const sortOrder = paginationQuery?.sortOrder ?? 'desc';

        const societyCode = filters?.societyCode || filters?.societyId;
        const cacheKeyParts = [
            CACHE_PREFIX,
            'list',
            societyCode || 'all',
            filters?.search || 'all',
            filters?.isActive !== undefined ? filters.isActive : 'all',
            page,
            limit,
            sortBy,
            sortOrder
        ];
        const cacheKey = cacheKeyParts.join(':');

        const cached = await redis.get<PaginatedResult<UnitOfMeasure>>(cacheKey);
        if (cached) {
            return cached;
        }

        const prismaParams = getPrismaPaginationParams(page, limit, sortBy, sortOrder);
        const whereClause: any = { isDeleted: false };

        if (societyCode) {
            const society = await prisma.society.findUnique({ where: { code: societyCode } });
            if (society) {
                whereClause.societyId = society.id;
            } else {
                // Fallback if passing ID directly
                const isUuid = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(societyCode);
                if (isUuid) {
                    whereClause.societyId = societyCode;
                } else {
                    return buildPaginatedResult([], page, limit, 0);
                }
            }
        }

        if (filters?.search) {
            whereClause.OR = [
                { name: { contains: filters.search, mode: 'insensitive' } },
                { abbreviation: { contains: filters.search, mode: 'insensitive' } },
                { code: { contains: filters.search, mode: 'insensitive' } },
                { sunatCode: { contains: filters.search, mode: 'insensitive' } },
            ];
        }

        if (filters?.isActive !== undefined) {
            whereClause.isActive = filters.isActive;
        }

        const [data, total] = await prisma.$transaction([
            prisma.unitOfMeasure.findMany({
                where: whereClause,
                skip: prismaParams.skip,
                take: prismaParams.take,
                orderBy: prismaParams.orderBy,
            }),
            prisma.unitOfMeasure.count({ where: whereClause }),
        ]);

        const result = buildPaginatedResult(data, page, limit, total);
        await redis.set(cacheKey, result, CACHE_TTL_LIST);

        return result;
    },

    getById: async (id: string) => {
        const cacheKey = `${CACHE_PREFIX}${id}`;
        const cached = await redis.get<UnitOfMeasure>(cacheKey);
        if (cached) return cached;

        const item = await prisma.unitOfMeasure.findUnique({
            where: { id, isDeleted: false },
        });

        if (item) {
            await redis.set(cacheKey, item, CACHE_TTL_SINGLE);
        }

        return item;
    },

    create: async (data: CreateUnitOfMeasureInput) => {
        let societyId = data.societyId;
        const society = await prisma.society.findUnique({ where: { code: data.societyId } });
        if (society) {
            societyId = society.id;
        }

        // Check strict uniqueness for code per society
        const existing = await prisma.unitOfMeasure.findFirst({
            where: {
                societyId,
                code: data.code,
                isDeleted: false
            }
        });

        if (existing) {
            throw new Error(`Ya existe una unidad de medida con el código '${data.code}'`);
        }

        const created = await prisma.unitOfMeasure.create({
            data: {
                ...data,
                societyId,
            },
        });

        await redis.deleteKeysByPrefix(`${CACHE_PREFIX}list:`);
        return created;
    },

    update: async (id: string, data: UpdateUnitOfMeasureInput) => {
        const updated = await prisma.unitOfMeasure.update({
            where: { id },
            data,
        });

        await redis.del(`${CACHE_PREFIX}${id}`);
        await redis.deleteKeysByPrefix(`${CACHE_PREFIX}list:`);
        return updated;
    },

    delete: async (id: string, updatedBy?: string) => {
        const deleted = await prisma.unitOfMeasure.update({
            where: { id },
            data: {
                isDeleted: true,
                isActive: false,
                updatedBy,
            },
        });

        await redis.del(`${CACHE_PREFIX}${id}`);
        await redis.deleteKeysByPrefix(`${CACHE_PREFIX}list:`);
        return deleted;
    },

    // For dropdowns/selects (lighter weight)
    getForSelect: async (societyCode?: string) => {
        const whereClause: any = { isDeleted: false, isActive: true };

        if (societyCode) {
            const society = await prisma.society.findUnique({ where: { code: societyCode } });
            if (society) {
                whereClause.societyId = society.id;
            } else {
                const isUuid = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(societyCode);
                if (isUuid) whereClause.societyId = societyCode;
            }
        }

        return prisma.unitOfMeasure.findMany({
            where: whereClause,
            select: {
                id: true,
                name: true,
                code: true,
                abbreviation: true
            },
            orderBy: { name: 'asc' }
        });
    }
};
