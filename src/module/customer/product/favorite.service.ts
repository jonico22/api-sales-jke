
import prisma from '@/config/prisma';
import { redis } from '@/config/redis';

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
            // Remove
            await prisma.favorite.delete({
                where: { id: existing.id },
            });
            return { isFavorite: false };
        } else {
            // Add
            await prisma.favorite.create({
                data: {
                    productId,
                    userId,
                    societyId: targetSocietyId,
                },
            });
            return { isFavorite: true };
        }
    },

    getByUser: async (userId: string, societyId?: string) => {
        let whereClause: any = { userId };

        if (societyId) {
            let targetSocietyId = societyId;
            if (!/^[0-9a-fA-F-]{36}$/.test(societyId)) {
                const society = await prisma.society.findUnique({ where: { code: societyId } });
                if (society) targetSocietyId = society.id;
            }
            whereClause.societyId = targetSocietyId;
        }

        const favorites = await prisma.favorite.findMany({
            where: whereClause,
            select: {
                createdAt: true,
                product: {
                    select: {
                        id: true,
                        name: true,
                        code: true,
                        description: true,
                        price: true,
                        priceCost: true,
                        stock: true,
                        minStock: true,
                        societyId: true,
                        categoryId: true,
                        imageId: true,
                        isActive: true,
                        isDeleted: true,
                        createdAt: true,
                        createdBy: true,
                        updatedAt: true,
                        updatedBy: true,
                        barcode: true,
                        brand: true,
                        unitOfMeasureId: true,
                        unitOfMeasure: true,
                        category: { select: { name: true } },
                        image: true,
                        color: true,
                        colorCode: true,
                        salesCount: true,
                    }
                }
            },
            orderBy: { createdAt: 'desc' }
        });

        const { formatToLimaTime } = await import('@/utils/dateFormatter');

        return favorites.map(f => ({
            ...f.product,
            createdAt: formatToLimaTime(f.product.createdAt) as any,
            updatedAt: f.product.updatedAt ? formatToLimaTime(f.product.updatedAt) as any : f.product.updatedAt,
            favoriteAt: formatToLimaTime(f.createdAt) as any
        }));
    }
};
