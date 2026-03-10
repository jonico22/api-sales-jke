
import prisma from '@/config/prisma';
import { redis } from '@/config/redis';
import { formatToLimaTime } from '@/utils/dateFormatter';

const CACHE_PREFIX = 'favorites:';
const CACHE_TTL = 300; // 5 min

export const FavoriteService = {
    /**
     * Toggle favorite (Add if not exists, Remove if exists)
     */
    toggle: async (userId: string, productId: string, societyId?: string) => {
        // 1. Resolve Society
        let targetSocietyId = societyId;
        if (societyId && !/^[0-9a-fA-F-]{36}$/.test(societyId)) {
            const society = await prisma.society.findUnique({ where: { code: societyId } });
            if (society) targetSocietyId = society.id;
        }

        if (!targetSocietyId) throw new Error('Society ID or Code is required');

        // 2. Check existence
        const existing = await prisma.favorite.findUnique({
            where: {
                productId_userId_societyId: {
                    productId,
                    userId,
                    societyId: targetSocietyId,
                },
            },
        });

        if (existing) {
            await prisma.favorite.delete({ where: { id: existing.id } });

            // Background: invalidate cache
            setImmediate(async () => {
                try { await redis.del(`${CACHE_PREFIX}${userId}:${targetSocietyId}`); } catch (_) { }
            });

            return { isFavorite: false };
        } else {
            await prisma.favorite.create({
                data: { productId, userId, societyId: targetSocietyId },
            });

            // Background: invalidate cache
            setImmediate(async () => {
                try { await redis.del(`${CACHE_PREFIX}${userId}:${targetSocietyId}`); } catch (_) { }
            });

            return { isFavorite: true };
        }
    },

    getByUser: async (userId: string, societyId?: string) => {
        // Resolve society
        let targetSocietyId = societyId;
        if (societyId && !/^[0-9a-fA-F-]{36}$/.test(societyId)) {
            const society = await prisma.society.findUnique({ where: { code: societyId } });
            if (society) targetSocietyId = society.id;
        }

        // Cache check
        const cacheKey = `${CACHE_PREFIX}${userId}:${targetSocietyId || 'all'}`;
        const cached = await redis.get<any[]>(cacheKey);
        if (cached) return cached;

        const whereClause: any = { userId };
        if (targetSocietyId) whereClause.societyId = targetSocietyId;

        const favorites = await prisma.favorite.findMany({
            where: whereClause,
            select: {
                createdAt: true,
                product: {
                    select: {
                        id: true,
                        name: true,
                        code: true,
                        price: true,
                        priceCost: true,
                        stock: true,
                        imageId: true,
                        isActive: true,
                        brand: true,
                        color: true,
                        colorCode: true,
                        category: { select: { name: true } },
                    }
                }
            },
            orderBy: { createdAt: 'desc' }
        });

        const result = favorites.map(f => ({
            ...f.product,
            favoriteAt: formatToLimaTime(f.createdAt) as any
        }));

        await redis.set(cacheKey, result, CACHE_TTL);
        return result;
    }
};
