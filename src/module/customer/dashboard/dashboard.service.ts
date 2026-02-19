
import prisma from '@/config/prisma';
import { redis } from '@/config/redis';
import { getFirstDayOfCurrentMonthLima, getLastDayOfCurrentMonthLima } from '@/utils/dateFormatter';
import { OrderStatus } from '@prisma/client';

export const DashboardService = {
    /**
     * Get dashboard statistics for a specific society
     */
    getStats: async (societyId: string | undefined) => {
        // 1. Resolve ID if it's a code (although usually passed as ID from auth middleware if strictly enforced, 
        // but our pattern allows code/uuid in some places. Controller should ensure we have a valid ID ideally, 
        // but here we double check or finding by unique if needed. 
        // Assuming societyId is passed correctly or we need to look it up if it looks like a code.

        let targetSocietyId = societyId;

        const isUuid = /^[0-9a-fA-F-]{36}$/.test(societyId || '');
        if (societyId && !isUuid) {
            const society = await prisma.society.findUnique({ where: { code: societyId } });
            if (society) targetSocietyId = society.id;
            else throw new Error('Invalid Society Code');
        }

        if (!targetSocietyId) throw new Error('Society ID is required');

        const cacheKey = `dashboard:stats:${targetSocietyId}`;
        const cachedStats = await redis.get(cacheKey);
        if (cachedStats) {
            return cachedStats;
        }

        // Dates for "Current Month"
        const startOfMonth = getFirstDayOfCurrentMonthLima();
        const endOfMonth = getLastDayOfCurrentMonthLima();

        // 1. Total Stock Value (Global) -> SUM(price * stock) for active products
        // Using queryRaw for field multiplication
        const stockValueResult: any[] = await prisma.$queryRaw`
      SELECT SUM(price * stock) as total 
      FROM "Product" 
      WHERE "societyId" = ${targetSocietyId} 
      AND "isActive" = true 
      AND "isDeleted" = false
    `;
        const totalStockValue = Number(stockValueResult[0]?.total || 0);

        // 2. Low Stock Items (Alert) -> Count where stock <= minStock
        const lowStockResult: any[] = await prisma.$queryRaw`
      SELECT COUNT(*) as count
      FROM "Product"
      WHERE "societyId" = ${targetSocietyId}
      AND "isActive" = true
      AND "isDeleted" = false
      AND stock <= "minStock"
    `;
        const lowStockItems = Number(lowStockResult[0]?.count || 0);

        // 3. Net Sales (Current Month) -> Sum totalAmount of COMPLETED orders
        const salesResult = await prisma.order.aggregate({
            _sum: {
                totalAmount: true
            },
            where: {
                societyId: targetSocietyId,
                status: OrderStatus.COMPLETED,
                orderDate: {
                    gte: startOfMonth,
                    lte: endOfMonth
                }
            }
        });
        const netSales = Number(salesResult._sum.totalAmount || 0);

        // 4. New Products (Current Month) -> Count products created this month
        const newProducts = await prisma.product.count({
            where: {
                societyId: targetSocietyId,
                isActive: true, // Only count active? Ui says "NUEVOS", presumably valid ones.
                isDeleted: false,
                createdAt: {
                    gte: startOfMonth,
                    lte: endOfMonth
                }
            }
        });

        const stats = {
            totalStockValue,
            lowStockItems,
            netSales,
            newProducts
        };

        // Cache for 5 minutes (dashboard doesn't need real-time usually, but short enough)
        await redis.set(cacheKey, stats, 300);

        return stats;
    }
};
