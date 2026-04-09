
import { Prisma, OrderStatus } from '@prisma/client';
import prisma from '@/config/prisma';
import { redis } from '@/config/redis';
import { NotFoundAppError, ValidationAppError } from '@/utils/domain-errors';
import {
    buildBranchFilterSql,
    buildDashboardCacheKey,
    DashboardFilters,
    getDashboardMonthRange,
    getDashboardYearRange,
    normalizeDashboardFilters,
} from './dashboard.helpers';

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
    getStats: async (societyId: string | undefined, filters?: DashboardFilters) => {
        const targetSocietyId = await resolveSocietyId(societyId);
        const normalizedFilters = normalizeDashboardFilters(filters);

        const cacheKey = buildDashboardCacheKey('stats', targetSocietyId, normalizedFilters);
        const cachedStats = await redis.get(cacheKey);
        if (cachedStats) return cachedStats;

        const { start: startOfMonth, end: endOfMonth } = getDashboardMonthRange(normalizedFilters);
        const branchOrderFilter = normalizedFilters.branchId ? { branchId: normalizedFilters.branchId } : {};

        const [stockValueResult, lowStockResult, salesResult, newProducts] = await Promise.all([
            normalizedFilters.branchId
                ? prisma.$queryRaw<any[]>`
                    SELECT COALESCE(SUM(p.price * bop."physicalStock"), 0) as total
                    FROM "BranchOfficeProduct" bop
                    JOIN "Product" p ON p.id = bop."productId"
                    WHERE p."societyId" = ${targetSocietyId}
                    AND bop."branchOfficeId" = ${normalizedFilters.branchId}
                    AND bop."isDeleted" = false
                    AND p."isActive" = true
                    AND p."isDeleted" = false
                `
                : prisma.$queryRaw<any[]>`
                    SELECT COALESCE(SUM(price * stock), 0) as total
                    FROM "Product"
                    WHERE "societyId" = ${targetSocietyId}
                    AND "isActive" = true
                    AND "isDeleted" = false
                `,
            normalizedFilters.branchId
                ? prisma.$queryRaw<any[]>`
                    SELECT COUNT(*)::int as count
                    FROM "BranchOfficeProduct" bop
                    JOIN "Product" p ON p.id = bop."productId"
                    WHERE p."societyId" = ${targetSocietyId}
                    AND bop."branchOfficeId" = ${normalizedFilters.branchId}
                    AND bop."isDeleted" = false
                    AND p."isActive" = true
                    AND p."isDeleted" = false
                    AND bop."availableStock" <= COALESCE(bop."minStock", p."minStock")
                `
                : prisma.$queryRaw<any[]>`
                    SELECT COUNT(*)::int as count
                    FROM "Product"
                    WHERE "societyId" = ${targetSocietyId}
                    AND "isActive" = true
                    AND "isDeleted" = false
                    AND stock <= "minStock"
                `,
            prisma.order.aggregate({
                _sum: { totalAmount: true },
                where: {
                    societyId: targetSocietyId,
                    ...branchOrderFilter,
                    status: OrderStatus.COMPLETED,
                    orderDate: { gte: startOfMonth, lte: endOfMonth }
                }
            }),
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
    getSalesPerformance: async (societyId: string | undefined, filters?: DashboardFilters) => {
        const targetSocietyId = await resolveSocietyId(societyId);
        const normalizedFilters = normalizeDashboardFilters(filters);

        const cacheKey = buildDashboardCacheKey('sales-performance', targetSocietyId, normalizedFilters);
        const cachedChart = await redis.get(cacheKey);
        if (cachedChart) return cachedChart;

        const { year, start: startOfYear, end: endOfYear } = getDashboardYearRange(normalizedFilters);
        const monthSql =
            normalizedFilters.month !== undefined
                ? Prisma.sql` AND EXTRACT(MONTH FROM "orderDate") = ${normalizedFilters.month}`
                : Prisma.empty;
        const branchSql = buildBranchFilterSql('"branchId"', normalizedFilters.branchId);

        const results: any[] = await prisma.$queryRaw`
            SELECT EXTRACT(MONTH FROM "orderDate")::int as month,
                   COALESCE(SUM("totalAmount"), 0) as total
            FROM "Order"
            WHERE "societyId" = ${targetSocietyId}
            AND status = 'COMPLETED'
            AND "orderDate" >= ${startOfYear} AND "orderDate" <= ${endOfYear}
            ${branchSql}
            ${monthSql}
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
    getRevenueByCategory: async (societyId: string | undefined, filters?: DashboardFilters) => {
        const targetSocietyId = await resolveSocietyId(societyId);
        const normalizedFilters = normalizeDashboardFilters(filters);

        const cacheKey = buildDashboardCacheKey('revenue-category', targetSocietyId, normalizedFilters);
        const cachedChart = await redis.get(cacheKey);
        if (cachedChart) return cachedChart;

        const { start: startOfMonth, end: endOfMonth } = getDashboardMonthRange(normalizedFilters);
        const branchSql = buildBranchFilterSql('o."branchId"', normalizedFilters.branchId);

        const results: any[] = await prisma.$queryRaw`
            SELECT c.name as category, COALESCE(SUM(oi.total), 0) as revenue 
            FROM "OrderItem" oi
            JOIN "Order" o ON oi."orderId" = o.id
            JOIN "Product" p ON oi."productId" = p.id
            JOIN "Category" c ON p."categoryId" = c.id
            WHERE o."societyId" = ${targetSocietyId} 
            AND o.status = 'COMPLETED'
            AND o."orderDate" >= ${startOfMonth} AND o."orderDate" <= ${endOfMonth}
            ${branchSql}
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
    getTopProducts: async (societyId: string | undefined, filters?: DashboardFilters) => {
        const targetSocietyId = await resolveSocietyId(societyId);
        const normalizedFilters = normalizeDashboardFilters(filters);

        const cacheKey = buildDashboardCacheKey('top-products', targetSocietyId, normalizedFilters);
        const cachedChart = await redis.get(cacheKey);
        if (cachedChart) return cachedChart;

        const { start: startOfMonth, end: endOfMonth } = getDashboardMonthRange(normalizedFilters);
        const branchSql = buildBranchFilterSql('o."branchId"', normalizedFilters.branchId);

        const products: any[] = await prisma.$queryRaw`
            SELECT p.id,
                   p.name,
                   p.stock,
                   COALESCE(SUM(oi.quantity), 0)::int as "soldUnits"
            FROM "OrderItem" oi
            JOIN "Order" o ON oi."orderId" = o.id
            JOIN "Product" p ON oi."productId" = p.id
            WHERE o."societyId" = ${targetSocietyId}
            AND o.status = 'COMPLETED'
            AND o."orderDate" >= ${startOfMonth} AND o."orderDate" <= ${endOfMonth}
            ${branchSql}
            GROUP BY p.id, p.name, p.stock
            ORDER BY "soldUnits" DESC
            LIMIT 5
        `;

        const formattedData = products.map(p => ({
            id: p.id,
            name: p.name,
            soldUnits: Number(p.soldUnits || 0),
            stockRemaining: Number(p.stock || 0)
        }));

        await redis.set(cacheKey, formattedData, 300);
        return formattedData;
    },

    /**
     * Get payment methods for the current month
     */
    getPaymentMethods: async (societyId: string | undefined, filters?: DashboardFilters) => {
        const targetSocietyId = await resolveSocietyId(societyId);
        const normalizedFilters = normalizeDashboardFilters(filters);

        const cacheKey = buildDashboardCacheKey('payment-methods', targetSocietyId, normalizedFilters);
        const cachedChart = await redis.get(cacheKey);
        if (cachedChart) return cachedChart;

        const { start: startOfMonth, end: endOfMonth } = getDashboardMonthRange(normalizedFilters);

        const results = await prisma.orderPayment.groupBy({
            by: ['paymentMethod'],
            _sum: { amount: true },
            where: {
                societyId: targetSocietyId,
                ...(normalizedFilters.branchId ? { branchId: normalizedFilters.branchId } : {}),
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
    getCashFlow: async (societyId: string | undefined, filters?: DashboardFilters) => {
        const targetSocietyId = await resolveSocietyId(societyId);
        const normalizedFilters = normalizeDashboardFilters(filters);

        const cacheKey = buildDashboardCacheKey('cash-flow', targetSocietyId, normalizedFilters);
        const cachedChart = await redis.get(cacheKey);
        if (cachedChart) return cachedChart;

        const { start: startOfYear, end: endOfYear } = getDashboardYearRange(normalizedFilters);
        const monthFilterSales =
            normalizedFilters.month !== undefined
                ? Prisma.sql` AND EXTRACT(MONTH FROM "orderDate") = ${normalizedFilters.month}`
                : Prisma.empty;
        const monthFilterPurchases =
            normalizedFilters.month !== undefined
                ? Prisma.sql` AND EXTRACT(MONTH FROM "purchaseDate") = ${normalizedFilters.month}`
                : Prisma.empty;
        const salesBranchSql = buildBranchFilterSql('"branchId"', normalizedFilters.branchId);
        const purchaseBranchSql = buildBranchFilterSql('"branchOfficeId"', normalizedFilters.branchId);

        const [salesByMonth, purchasesByMonth] = await Promise.all([
            prisma.$queryRaw<any[]>`
                SELECT EXTRACT(MONTH FROM "orderDate")::int as month,
                       COALESCE(SUM("totalAmount"), 0) as total
                FROM "Order"
                WHERE "societyId" = ${targetSocietyId}
                AND status = 'COMPLETED'
                AND "orderDate" >= ${startOfYear} AND "orderDate" <= ${endOfYear}
                ${salesBranchSql}
                ${monthFilterSales}
                GROUP BY EXTRACT(MONTH FROM "orderDate")
            `,
            prisma.$queryRaw<any[]>`
                SELECT EXTRACT(MONTH FROM "purchaseDate")::int as month,
                       COALESCE(SUM("totalAmount"), 0) as total
                FROM "Purchase"
                WHERE "societyId" = ${targetSocietyId}
                AND status = 'COMPLETED'
                AND "purchaseDate" >= ${startOfYear} AND "purchaseDate" <= ${endOfYear}
                ${purchaseBranchSql}
                ${monthFilterPurchases}
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
    getBranchPerformance: async (societyId: string | undefined, filters?: DashboardFilters) => {
        const targetSocietyId = await resolveSocietyId(societyId);
        const normalizedFilters = normalizeDashboardFilters(filters);

        const cacheKey = buildDashboardCacheKey('branch-performance', targetSocietyId, normalizedFilters);
        const cachedChart = await redis.get(cacheKey);
        if (cachedChart) return cachedChart;

        const { start: startOfMonth, end: endOfMonth } = getDashboardMonthRange(normalizedFilters);
        const branchSql = buildBranchFilterSql('o."branchId"', normalizedFilters.branchId);

        const results: any[] = await prisma.$queryRaw`
            SELECT b.name as branch, COALESCE(SUM(o."totalAmount"), 0) as revenue
            FROM "Order" o
            JOIN "BranchOffice" b ON o."branchId" = b.id
            WHERE o."societyId" = ${targetSocietyId}
            AND o.status = 'COMPLETED'
            AND o."orderDate" >= ${startOfMonth} AND o."orderDate" <= ${endOfMonth}
            ${branchSql}
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
