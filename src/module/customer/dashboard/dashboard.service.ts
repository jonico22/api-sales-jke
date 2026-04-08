
import prisma from '@/config/prisma';
import { redis } from '@/config/redis';
import { getFirstDayOfCurrentMonthLima, getLastDayOfCurrentMonthLima } from '@/utils/dateFormatter';
import { OrderStatus } from '@prisma/client';
import { NotFoundAppError, ValidationAppError } from '@/utils/domain-errors';

// ─── Helper: Resolve Society ID from Code or UUID ─────────────────────
const resolveSocietyId = async (societyId: string | undefined): Promise<string> => {
    if (!societyId) throw new ValidationAppError('Society ID is required');

    const isUuid = /^[0-9a-fA-F-]{36}$/.test(societyId);
    if (isUuid) return societyId;

    const society = await prisma.society.findUnique({ where: { code: societyId } });
    if (society) return society.id;
    throw new NotFoundAppError('Invalid Society Code', { societyCode: societyId });
};

export const DashboardService = {
    /**
     * Get dashboard statistics for a specific society
     * OPTIMIZADO: 4 queries en paralelo con Promise.all
     */
    getStats: async (societyId: string | undefined) => {
        const targetSocietyId = await resolveSocietyId(societyId);

        const cacheKey = `dashboard:stats:${targetSocietyId}`;
        const cachedStats = await redis.get(cacheKey);
        if (cachedStats) return cachedStats;

        // Dates for "Current Month"
        const startOfMonth = getFirstDayOfCurrentMonthLima();
        const endOfMonth = getLastDayOfCurrentMonthLima();

        // ─── PARALLEL: All 4 stats queries at once ────────────────────
        const [stockValueResult, lowStockResult, salesResult, newProducts] = await Promise.all([
            // 1. Total Stock Value
            prisma.$queryRaw<any[]>`
                SELECT COALESCE(SUM(price * stock), 0) as total 
                FROM "Product" 
                WHERE "societyId" = ${targetSocietyId} 
                AND "isActive" = true 
                AND "isDeleted" = false
            `,
            // 2. Low Stock Items
            prisma.$queryRaw<any[]>`
                SELECT COUNT(*)::int as count
                FROM "Product"
                WHERE "societyId" = ${targetSocietyId}
                AND "isActive" = true
                AND "isDeleted" = false
                AND stock <= "minStock"
            `,
            // 3. Net Sales (Current Month)
            prisma.order.aggregate({
                _sum: { totalAmount: true },
                where: {
                    societyId: targetSocietyId,
                    status: OrderStatus.COMPLETED,
                    orderDate: { gte: startOfMonth, lte: endOfMonth }
                }
            }),
            // 4. New Products (Current Month)
            prisma.product.count({
                where: {
                    societyId: targetSocietyId,
                    isActive: true,
                    isDeleted: false,
                    createdAt: { gte: startOfMonth, lte: endOfMonth }
                }
            })
        ]);

        const stats = {
            totalStockValue: Number(stockValueResult[0]?.total || 0),
            lowStockItems: Number(lowStockResult[0]?.count || 0),
            netSales: Number(salesResult._sum.totalAmount || 0),
            newProducts
        };

        await redis.set(cacheKey, stats, 300);
        return stats;
    },

    /**
     * Get sales performance (monthly revenue) for the current year
     * OPTIMIZADO: Usa SQL GROUP BY en vez de cargar todas las órdenes en memoria
     */
    getSalesPerformance: async (societyId: string | undefined) => {
        const targetSocietyId = await resolveSocietyId(societyId);

        const cacheKey = `dashboard:sales-performance:${targetSocietyId}`;
        const cachedChart = await redis.get(cacheKey);
        if (cachedChart) return cachedChart;

        const currentYear = new Date().getFullYear();
        const startOfYear = new Date(currentYear, 0, 1);
        const endOfYear = new Date(currentYear, 11, 31, 23, 59, 59, 999);

        // SQL GROUP BY instead of loading all orders into JS memory
        const results: any[] = await prisma.$queryRaw`
            SELECT EXTRACT(MONTH FROM "orderDate")::int as month,
                   COALESCE(SUM("totalAmount"), 0) as total
            FROM "Order"
            WHERE "societyId" = ${targetSocietyId}
            AND status = 'COMPLETED'
            AND "orderDate" >= ${startOfYear} AND "orderDate" <= ${endOfYear}
            GROUP BY EXTRACT(MONTH FROM "orderDate")
            ORDER BY month
        `;

        const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
        const monthlySales = months.map((name, i) => ({ name, total: 0 }));

        results.forEach(row => {
            monthlySales[row.month - 1].total = Number(row.total);
        });

        await redis.set(cacheKey, monthlySales, 300);
        return monthlySales;
    },

    /**
     * Get revenue by category for the current month
     */
    getRevenueByCategory: async (societyId: string | undefined) => {
        const targetSocietyId = await resolveSocietyId(societyId);

        const cacheKey = `dashboard:revenue-category:${targetSocietyId}`;
        const cachedChart = await redis.get(cacheKey);
        if (cachedChart) return cachedChart;

        const startOfMonth = getFirstDayOfCurrentMonthLima();
        const endOfMonth = getLastDayOfCurrentMonthLima();

        const results: any[] = await prisma.$queryRaw`
            SELECT c.name as category, COALESCE(SUM(oi.total), 0) as revenue 
            FROM "OrderItem" oi
            JOIN "Order" o ON oi."orderId" = o.id
            JOIN "Product" p ON oi."productId" = p.id
            JOIN "Category" c ON p."categoryId" = c.id
            WHERE o."societyId" = ${targetSocietyId} 
            AND o.status = 'COMPLETED'
            AND o."orderDate" >= ${startOfMonth} AND o."orderDate" <= ${endOfMonth}
            GROUP BY c.name
            ORDER BY revenue DESC
        `;

        const totalRevenue = results.reduce((acc, curr) => acc + Number(curr.revenue), 0);

        const formattedData = results.map(row => {
            const revenue = Number(row.revenue);
            const percentage = totalRevenue > 0 ? ((revenue / totalRevenue) * 100).toFixed(2) : 0;
            return {
                category: row.category,
                revenue,
                percentage: Number(percentage)
            };
        });

        await redis.set(cacheKey, formattedData, 300);
        return formattedData;
    },

    /**
     * Get top selling products (Best Sellers)
     */
    getTopProducts: async (societyId: string | undefined) => {
        const targetSocietyId = await resolveSocietyId(societyId);

        const cacheKey = `dashboard:top-products:${targetSocietyId}`;
        const cachedChart = await redis.get(cacheKey);
        if (cachedChart) return cachedChart;

        const products = await prisma.product.findMany({
            where: { societyId: targetSocietyId, isDeleted: false, salesCount: { gt: 0 } },
            orderBy: { salesCount: 'desc' },
            take: 5,
            select: { id: true, name: true, salesCount: true, stock: true }
        });

        const formattedData = products.map(p => ({
            id: p.id,
            name: p.name,
            soldUnits: p.salesCount,
            stockRemaining: p.stock
        }));

        await redis.set(cacheKey, formattedData, 300);
        return formattedData;
    },

    /**
     * Get payment methods for the current month
     */
    getPaymentMethods: async (societyId: string | undefined) => {
        const targetSocietyId = await resolveSocietyId(societyId);

        const cacheKey = `dashboard:payment-methods:${targetSocietyId}`;
        const cachedChart = await redis.get(cacheKey);
        if (cachedChart) return cachedChart;

        const startOfMonth = getFirstDayOfCurrentMonthLima();
        const endOfMonth = getLastDayOfCurrentMonthLima();

        const results = await prisma.orderPayment.groupBy({
            by: ['paymentMethod'],
            _sum: { amount: true },
            where: {
                societyId: targetSocietyId,
                status: 'CONFIRMED',
                paymentDate: { gte: startOfMonth, lte: endOfMonth }
            }
        });

        const formattedData = results.map(row => ({
            method: row.paymentMethod,
            value: Number(row._sum.amount || 0)
        })).sort((a, b) => b.value - a.value);

        await redis.set(cacheKey, formattedData, 300);
        return formattedData;
    },

    /**
     * Get cash flow (income vs expenses) for the current year
     * OPTIMIZADO: 2 queries SQL GROUP BY en paralelo
     */
    getCashFlow: async (societyId: string | undefined) => {
        const targetSocietyId = await resolveSocietyId(societyId);

        const cacheKey = `dashboard:cash-flow:${targetSocietyId}`;
        const cachedChart = await redis.get(cacheKey);
        if (cachedChart) return cachedChart;

        const currentYear = new Date().getFullYear();
        const startOfYear = new Date(currentYear, 0, 1);
        const endOfYear = new Date(currentYear, 11, 31, 23, 59, 59, 999);

        // ─── PARALLEL: Sales + Purchases grouped by month in SQL ──────
        const [salesByMonth, purchasesByMonth] = await Promise.all([
            prisma.$queryRaw<any[]>`
                SELECT EXTRACT(MONTH FROM "orderDate")::int as month,
                       COALESCE(SUM("totalAmount"), 0) as total
                FROM "Order"
                WHERE "societyId" = ${targetSocietyId}
                AND status = 'COMPLETED'
                AND "orderDate" >= ${startOfYear} AND "orderDate" <= ${endOfYear}
                GROUP BY EXTRACT(MONTH FROM "orderDate")
            `,
            prisma.$queryRaw<any[]>`
                SELECT EXTRACT(MONTH FROM "purchaseDate")::int as month,
                       COALESCE(SUM("totalAmount"), 0) as total
                FROM "Purchase"
                WHERE "societyId" = ${targetSocietyId}
                AND status = 'COMPLETED'
                AND "purchaseDate" >= ${startOfYear} AND "purchaseDate" <= ${endOfYear}
                GROUP BY EXTRACT(MONTH FROM "purchaseDate")
            `
        ]);

        const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
        const flow = months.map(period => ({ period, income: 0, expense: 0 }));

        salesByMonth.forEach(row => { flow[row.month - 1].income = Number(row.total); });
        purchasesByMonth.forEach(row => { flow[row.month - 1].expense = Number(row.total); });

        await redis.set(cacheKey, flow, 300);
        return flow;
    },

    /**
     * Get branch performance for the current month
     * OPTIMIZADO: 1 sola query SQL con JOIN en vez de 2 queries separadas
     */
    getBranchPerformance: async (societyId: string | undefined) => {
        const targetSocietyId = await resolveSocietyId(societyId);

        const cacheKey = `dashboard:branch-performance:${targetSocietyId}`;
        const cachedChart = await redis.get(cacheKey);
        if (cachedChart) return cachedChart;

        const startOfMonth = getFirstDayOfCurrentMonthLima();
        const endOfMonth = getLastDayOfCurrentMonthLima();

        // 1 query con JOIN en vez de groupBy + findMany separados
        const results: any[] = await prisma.$queryRaw`
            SELECT b.name as branch, COALESCE(SUM(o."totalAmount"), 0) as revenue
            FROM "Order" o
            JOIN "BranchOffice" b ON o."branchId" = b.id
            WHERE o."societyId" = ${targetSocietyId}
            AND o.status = 'COMPLETED'
            AND o."orderDate" >= ${startOfMonth} AND o."orderDate" <= ${endOfMonth}
            GROUP BY b.name
            ORDER BY revenue DESC
        `;

        const formattedData = results.map(row => ({
            branch: row.branch,
            revenue: Number(row.revenue)
        }));

        await redis.set(cacheKey, formattedData, 300);
        return formattedData;
    }
};
