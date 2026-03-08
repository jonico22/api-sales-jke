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
import { formatToLimaTime, convertLimaDateRangeToUTC } from '@/utils/dateFormatter';
import { StorageService } from './storage.service';

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
    ): Promise<PaginatedResult<any> & { storageInfo?: { limitBytes: number; usedBytes: number } | null }> {
        const page = paginationQuery?.page ?? 1;
        const limit = paginationQuery?.limit ?? 10;
        const sortBy = paginationQuery?.sortBy ?? 'uploadedAt';
        const sortOrder = paginationQuery?.sortOrder ?? 'desc';

        // Cache Key
        const cacheKeyParts = [
            'list',
            filters?.societyId || 'all',
            filters?.search || 'all',
            filters?.folder || 'all',
            filters?.mimeType || 'all',
            filters?.storageType || 'all',
            filters?.category || 'all',
            filters?.excludeCategory || 'all',
            filters?.uploadedAtFrom || 'all',
            filters?.uploadedAtTo || 'all',
            page,
            limit,
            sortBy,
            sortOrder
        ];
        const cacheKey = `${CACHE_PREFIX}${cacheKeyParts.join(':')}`;

        // 1. Try Cache
        const cached = await redis.get<PaginatedResult<any> & { storageInfo?: any }>(cacheKey);
        if (cached) return cached;

        // 2. Database Query
        const prismaParams = getPrismaPaginationParams(page, limit, sortBy, sortOrder);

        const whereClause: any = {};
        let targetSocietyId: string | null = null;

        // Resolve Society Code/ID (Pattern from CategoryService/OrderService)
        const societyCode = filters?.societyId; // En FileFilters solo tenemos societyId, que puede ser code o UUID

        if (societyCode) {
            const society = await prisma.society.findUnique({ where: { code: societyCode } });
            if (society) {
                targetSocietyId = society.id;
            } else {
                // If code looks like UUID, try as ID as fallback
                const isUuid = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(societyCode);
                if (isUuid) {
                    targetSocietyId = societyCode;
                } else {
                    // Return guaranteed empty result if code invalid
                    return Object.assign(buildPaginatedResult([], page, limit, 0), { storageInfo: null });
                }
            }
            whereClause.societyId = targetSocietyId;
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

        if (filters?.category) {
            whereClause.category = filters.category;
        }

        if (filters?.excludeCategory) {
            whereClause.category = { not: filters.excludeCategory };
        }

        if (filters?.uploadedAtFrom || filters?.uploadedAtTo) {
            whereClause.uploadedAt = {};
            const dateRange = convertLimaDateRangeToUTC(filters.uploadedAtFrom, filters.uploadedAtTo);
            if (dateRange.from) whereClause.uploadedAt.gte = dateRange.from;
            if (dateRange.to) whereClause.uploadedAt.lte = dateRange.to;
        }

        // Fetch paginated data AND storage info in parallel
        const storageInfoPromise = targetSocietyId
            ? Promise.all([
                prisma.society.findUnique({
                    where: { id: targetSocietyId },
                    select: { storageLimit: true }
                }),
                prisma.file.aggregate({
                    where: { societyId: targetSocietyId, category: 'GENERAL' },
                    _sum: { size: true }
                })
            ])
            : Promise.resolve(null);

        const [[data, total], storageResult] = await Promise.all([
            prisma.$transaction([
                prisma.file.findMany({
                    where: whereClause,
                    skip: prismaParams.skip,
                    take: prismaParams.take,
                    orderBy: prismaParams.orderBy ?? { uploadedAt: sortOrder },
                }),
                prisma.file.count({ where: whereClause }),
            ]),
            storageInfoPromise
        ]);

        const formattedData = data.map(item => ({
            ...item,
            uploadedAt: formatToLimaTime(item.uploadedAt),
            expiresAt: item.expiresAt ? formatToLimaTime(item.expiresAt) : null,
        }));

        const result = buildPaginatedResult(formattedData, page, limit, total);

        // Build storage info from parallel result
        let storageInfo = null;
        if (storageResult) {
            const [society, currentUsage] = storageResult;
            if (society) {
                let limitVal = Number(society.storageLimit);
                if (!limitVal || limitVal === 0) limitVal = 157286400; // 150MB fallback
                storageInfo = {
                    limitBytes: limitVal,
                    usedBytes: currentUsage._sum.size || 0
                };
            }
        }

        const finalResult = { ...result, storageInfo };

        // Set Cache (background)
        setImmediate(async () => {
            try { await redis.set(cacheKey, finalResult, CACHE_TTL_LIST); } catch (_) { }
        });

        return finalResult;
    },

    /**
     * Obtener archivo por ID
     */
    async getById(id: string): Promise<any> {
        const cacheKey = `${CACHE_PREFIX}${id}`;

        // 1. Try Cache
        const cached = await redis.get<File>(cacheKey);
        if (cached) return cached;

        // 2. DB Query
        const file = await prisma.file.findUnique({
            where: { id },
        });

        if (file) {
            const formatted = {
                ...file,
                uploadedAt: formatToLimaTime(file.uploadedAt),
                expiresAt: file.expiresAt ? formatToLimaTime(file.expiresAt) : null,
            };
            await redis.set(cacheKey, formatted, CACHE_TTL_SINGLE);
            return formatted;
        }

        return null;
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

        // Storage update (synchronous, important for consistency)
        if (created.size) {
            await prisma.society.update({
                where: { id: created.societyId },
                data: { usedStorage: { increment: created.size } }
            });
        }

        // ─── BACKGROUND: Cache Invalidation ────────────────────────────
        const societyId = created.societyId;
        setImmediate(async () => {
            try {
                await Promise.all([
                    redis.deleteKeysByPrefix(`${CACHE_PREFIX}list:`),
                    redis.deleteKeysByPrefix('categories:'),
                    redis.del(`societies:${societyId}`),
                    redis.deleteKeysByPrefix('societies:list:'),
                    redis.deleteKeysByPrefix('societies:select:')
                ]);
            } catch (e) {
                console.error('[FileService] Error background (create):', e);
            }
        });

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

        // ─── BACKGROUND: Cache Invalidation ────────────────────────────
        setImmediate(async () => {
            try {
                await Promise.all([
                    redis.del(`${CACHE_PREFIX}${id}`),
                    redis.deleteKeysByPrefix(`${CACHE_PREFIX}list:`),
                    redis.deleteKeysByPrefix('categories:')
                ]);
            } catch (e) {
                console.error('[FileService] Error background (update):', e);
            }
        });

        return updated;
    },

    /**
     * Eliminar archivo (Hard Delete, NO soporta Soft Delete por schema)
     */
    async delete(id: string) {
        // 0. Validar relaciones antes de eliminar
        const fileWithRelations = await prisma.file.findUnique({
            where: { id },
            include: {
                societyLogo: { select: { id: true } },
                _count: {
                    select: {
                        Product: true,
                        orderPayments: true,
                        receiptPdf: true,
                        receiptXml: true
                    }
                }
            }
        });

        if (!fileWithRelations) {
            throw new Error('Archivo no encontrado');
        }

        const counts = fileWithRelations._count;
        const relations = [];
        if (counts.Product > 0) relations.push('Productos');
        if (counts.orderPayments > 0) relations.push('Pagos de Órdenes');
        if (fileWithRelations.societyLogo) relations.push('Logo de Sociedad');
        if (counts.receiptPdf > 0 || counts.receiptXml > 0) relations.push('Recibos Electrónicos');

        if (relations.length > 0) {
            throw new Error(`No se puede eliminar el archivo porque está vinculado a: ${relations.join(', ')}. Por favor, remueva las relaciones antes de eliminar.`);
        }

        const deleted = await prisma.file.delete({
            where: { id },
        });

        // Storage decrement (synchronous, important for consistency)
        if (deleted.size) {
            await prisma.society.update({
                where: { id: deleted.societyId },
                data: { usedStorage: { decrement: deleted.size } }
            });
        }

        // ─── BACKGROUND: R2 Delete + Cache Invalidation ───────────────
        const deletedKey = deleted.key;
        const deletedSocietyId = deleted.societyId;

        setImmediate(async () => {
            try {
                // Physical delete from R2 (non-blocking)
                if (deletedKey) {
                    try {
                        await StorageService.deleteFile(deletedKey);
                    } catch (e) {
                        console.error(`[FileService] Error deleting from R2 (${deletedKey}):`, e);
                    }
                }

                // Cache invalidation
                await Promise.all([
                    redis.del(`${CACHE_PREFIX}${id}`),
                    redis.deleteKeysByPrefix(`${CACHE_PREFIX}list:`),
                    redis.deleteKeysByPrefix('categories:'),
                    redis.del(`societies:${deletedSocietyId}`),
                    redis.deleteKeysByPrefix('societies:list:'),
                    redis.deleteKeysByPrefix('societies:select:')
                ]);
            } catch (e) {
                console.error('[FileService] Error background (delete):', e);
            }
        });

        return deleted;
    }
};
