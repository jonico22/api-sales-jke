import prisma from '@/config/prisma';
import { createCurrencySchema } from './currency.validation';
import { z } from 'zod';

import { Currency } from '@prisma/client';
import {
    PaginatedResult,
    getPrismaPaginationParams,
    buildPaginatedResult,
    PaginationQuery,
} from '@/utils/pagination';
import { redis } from '@/config/redis';

// Types inferred
export type CurrencyFilters = {
    societyCode?: string;
    societyId?: string;
    search?: string;
    isActive?: boolean;
};

type CreateCurrencyInput = z.infer<typeof createCurrencySchema>['body'];

const CACHE_PREFIX = 'currencies:';
const CACHE_TTL_LIST = 300; // 5 min
const CACHE_TTL_SINGLE = 600; // 10 min
const CACHE_TTL_SELECT = 900; // 15 min

export const CurrencyService = {
    getAll: async (
        paginationQuery?: PaginationQuery,
        filters?: CurrencyFilters
    ): Promise<PaginatedResult<Currency>> => {
        const page = paginationQuery?.page ?? 1;
        const limit = paginationQuery?.limit ?? 10;
        const sortBy = paginationQuery?.sortBy ?? 'code';
        const sortOrder = paginationQuery?.sortOrder ?? 'asc';

        // Resolve societyCode
        const societyCode = filters?.societyCode || filters?.societyId;

        // Cache Key
        const cacheKeyParts = [
            CACHE_PREFIX,
            'list',
            societyCode || 'all',
            filters?.search || 'all',
            filters?.isActive !== undefined ? filters.isActive : 'all',
            page, limit, sortBy, sortOrder
        ];
        const cacheKey = cacheKeyParts.join(':');

        // 1. Cache Check
        const cached = await redis.get<PaginatedResult<Currency>>(cacheKey);
        if (cached) {
            console.log(`[Cache HIT] ${cacheKey}`);
            return cached;
        }
        console.log(`[Cache MISS] ${cacheKey}`);

        // 2. Resolve Society ID if Code provided
        let resolvedSocietyId = filters?.societyId;
        if (!resolvedSocietyId && societyCode && societyCode !== 'all') {
            const society = await prisma.society.findUnique({ where: { code: societyCode } });
            if (society) {
                resolvedSocietyId = society.id;
            } else if (filters?.societyCode) {
                // Creating empty result if specific code was requested but not found
                return buildPaginatedResult([], page, limit, 0);
            }
        }

        const prismaParams = getPrismaPaginationParams(page, limit, sortBy, sortOrder);
        const whereClause: any = {
            // Default to Active if not specified? Or allow all? 
            // Matching existing logic: isActive: true was default in findAll
            // But usually admin lists want to see all. Let's stick to true for now unless filter overrides
            isActive: true
        };

        if (filters?.isActive !== undefined) whereClause.isActive = filters.isActive;

        // Society Logic: Global OR Specific Society
        // If societyId is provided, show Global + Society Specific
        if (resolvedSocietyId) {
            whereClause.OR = [
                { societyId: null },
                { societyId: resolvedSocietyId }
            ];
        } else {
            // If no society context, usually show only Global? Or All?
            // Existing logic showed Global if no societyId
            whereClause.societyId = null;
        }

        if (filters?.search) {
            const searchCondition = {
                OR: [
                    { name: { contains: filters.search, mode: 'insensitive' } },
                    { code: { contains: filters.search, mode: 'insensitive' } }
                ]
            };
            if (whereClause.OR) {
                // Combine with existing OR
                whereClause.AND = [searchCondition];
            } else {
                whereClause.OR = searchCondition.OR;
            }
        }

        const [data, total] = await prisma.$transaction([
            prisma.currency.findMany({
                where: whereClause,
                skip: prismaParams.skip,
                take: prismaParams.take,
                orderBy: prismaParams.orderBy
            }),
            prisma.currency.count({ where: whereClause })
        ]);

        const result = buildPaginatedResult(data, page, limit, total);
        await redis.set(cacheKey, result, CACHE_TTL_LIST);

        return result;
    },

    getForSelect: async () => {
        const cacheKey = `${CACHE_PREFIX}select`;
        const cached = await redis.get<any[]>(cacheKey);
        if (cached) return cached;

        const data = await prisma.currency.findMany({
            where: { isActive: true },
            select: {
                id: true,
                name: true,
                code: true,
                symbol: true
            },
            orderBy: { code: 'asc' }
        });

        await redis.set(cacheKey, data, CACHE_TTL_SELECT);
        return data;
    },

    create: async (data: CreateCurrencyInput) => {
        const created = await prisma.currency.create({ data });
        await redis.deleteKeysByPrefix(`${CACHE_PREFIX}`);
        return created;
    },

    findById: async (id: string) => {
        const cacheKey = `${CACHE_PREFIX}${id}`;
        const cached = await redis.get<Currency>(cacheKey);
        if (cached) return cached;

        const result = await prisma.currency.findUnique({ where: { id } });
        if (result) await redis.set(cacheKey, result, CACHE_TTL_SINGLE);
        return result;
    },

    update: async (id: string, data: any) => {
        const updated = await prisma.currency.update({ where: { id }, data });
        await redis.del(`${CACHE_PREFIX}${id}`);
        await redis.deleteKeysByPrefix(`${CACHE_PREFIX}list:`);
        await redis.deleteKeysByPrefix(`${CACHE_PREFIX}select`);
        return updated;
    }
};
