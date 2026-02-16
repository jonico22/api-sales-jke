import prisma from '@/config/prisma';
import { redis } from '@/config/redis';
import { z } from 'zod';
import { createFileSchema, updateFileSchema, fileFiltersSchema } from './file.schema';
import {
    PaginatedResult,
    getPrismaPaginationParams,
    buildPaginatedResult,
    PaginationQuery,
} from '@/utils/pagination';
import { File } from '@prisma/client';
import { convertLimaDateRangeToUTC } from '@/utils/dateFormatter';

type CreateFileInput = z.infer<typeof createFileSchema>['body'];
type UpdateFileInput = z.infer<typeof updateFileSchema>['body'];
type FileFilters = z.infer<typeof fileFiltersSchema>['query'];

const CACHE_PREFIX = 'files:';
const CACHE_TTL_LIST = 300; // 5 minutos
const CACHE_TTL_SINGLE = 600; // 10 minutos

export const FileService = {
    /**
     * Obtener todos los archivos con paginación y filtros
     */
    async getAll(
        paginationQuery?: PaginationQuery,
        filters?: FileFilters
    ): Promise<PaginatedResult<File>> {
        const page = paginationQuery?.page ?? 1;
        const limit = paginationQuery?.limit ?? 10;
        const sortBy = paginationQuery?.sortBy ?? 'uploadedAt';
        const sortOrder = paginationQuery?.sortOrder ?? 'desc';

        // Cache Key
        const cacheKeyParts = [
            CACHE_PREFIX,
            'list',
            filters?.societyId || 'all',
            filters?.search || 'all',
            filters?.folder || 'all',
            filters?.mimeType || 'all',
            filters?.storageType || 'all',
            filters?.uploadedAtFrom || 'all',
            filters?.uploadedAtTo || 'all',
            page,
            limit,
            sortBy,
            sortOrder
        ];
        const cacheKey = cacheKeyParts.join(':');

        // 1. Try Cache
        const cached = await redis.get<PaginatedResult<File>>(cacheKey);
        if (cached) return cached;

        // 2. Database Query
        const prismaParams = getPrismaPaginationParams(page, limit, sortBy, sortOrder);

        const whereClause: any = {};

        // Resolve Society Code/ID (Pattern from CategoryService/OrderService)
        const societyCode = filters?.societyId; // En FileFilters solo tenemos societyId, que puede ser code o UUID

        if (societyCode) {
            const society = await prisma.society.findUnique({ where: { code: societyCode } });
            if (society) {
                whereClause.societyId = society.id;
            } else {
                // If code looks like UUID, try as ID as fallback
                const isUuid = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(societyCode);
                if (isUuid) {
                    whereClause.societyId = societyCode;
                } else {
                    // Return guaranteed empty result if code invalid
                    return buildPaginatedResult([], page, limit, 0);
                }
            }
        }

        if (filters?.search) {
            whereClause.name = { contains: filters.search, mode: 'insensitive' };
        }

        if (filters?.folder) {
            whereClause.key = { startsWith: filters.folder };
        }

        if (filters?.mimeType) {
            whereClause.mimeType = { contains: filters.mimeType, mode: 'insensitive' };
        }

        if (filters?.storageType) {
            whereClause.storageType = filters.storageType;
        }

        if (filters?.uploadedAtFrom || filters?.uploadedAtTo) {
            whereClause.uploadedAt = {};
            const dateRange = convertLimaDateRangeToUTC(filters.uploadedAtFrom, filters.uploadedAtTo);
            if (dateRange.from) whereClause.uploadedAt.gte = dateRange.from;
            if (dateRange.to) whereClause.uploadedAt.lte = dateRange.to;
        }

        const [data, total] = await prisma.$transaction([
            prisma.file.findMany({
                where: whereClause,
                skip: prismaParams.skip,
                take: prismaParams.take,
                orderBy: prismaParams.orderBy ?? { uploadedAt: sortOrder },
            }),
            prisma.file.count({ where: whereClause }),
        ]);

        const result = buildPaginatedResult(data, page, limit, total);

        // 3. Set Cache
        await redis.set(cacheKey, result, CACHE_TTL_LIST);

        return result;
    },

    /**
     * Obtener archivo por ID
     */
    async getById(id: string) {
        const cacheKey = `${CACHE_PREFIX}${id}`;

        // 1. Try Cache
        const cached = await redis.get<File>(cacheKey);
        if (cached) return cached;

        // 2. DB Query
        const file = await prisma.file.findUnique({
            where: { id },
        });

        if (file) await redis.set(cacheKey, file, CACHE_TTL_SINGLE);

        return file;
    },

    /**
     * Crear archivo
     */
    async create(data: CreateFileInput) {
        const created = await prisma.file.create({
            data: {
                ...data,
                storageType: data.storageType || 'LOCAL'
            },
        });

        // Invalidate List Cache
        await redis.deleteKeysByPrefix(`${CACHE_PREFIX}list:`);
        // Invalidate Category Cache (as per requirement)
        await redis.deleteKeysByPrefix('categories:');

        return created;
    },

    /**
     * Actualizar archivo (metadatos)
     */
    async update(id: string, data: UpdateFileInput) {
        const updated = await prisma.file.update({
            where: { id },
            data,
        });

        // Invalidate Cache
        await redis.del(`${CACHE_PREFIX}${id}`);
        await redis.deleteKeysByPrefix(`${CACHE_PREFIX}list:`);
        // Invalidate Category Cache
        await redis.deleteKeysByPrefix('categories:');

        return updated;
    },

    /**
     * Eliminar archivo (Hard Delete, NO soporta Soft Delete por schema)
     */
    async delete(id: string) {
        const deleted = await prisma.file.delete({
            where: { id },
        });

        // Invalidate Cache
        await redis.del(`${CACHE_PREFIX}${id}`);
        await redis.deleteKeysByPrefix(`${CACHE_PREFIX}list:`);
        // Invalidate Category Cache
        await redis.deleteKeysByPrefix('categories:');

        return deleted;
    }
};
