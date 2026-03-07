
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
    },

    /**
     * Get sales performance (monthly revenue) for the current year
     */
    getSalesPerformance: async (societyId: string | undefined) => {
        let targetSocietyId = societyId;

        const isUuid = /^[0-9a-fA-F-]{36}$/.test(societyId || '');
        if (societyId && !isUuid) {
            const society = await prisma.society.findUnique({ where: { code: societyId } });
            if (society) targetSocietyId = society.id;
            else throw new Error('Invalid Society Code');
        }

        if (!targetSocietyId) throw new Error('Society ID is required');

        const cacheKey = `dashboard:sales-performance:${targetSocietyId}`;
        const cachedChart = await redis.get(cacheKey);
        if (cachedChart) return cachedChart;

        const currentYear = new Date().getFullYear();
        const startOfYear = new Date(currentYear, 0, 1);
        const endOfYear = new Date(currentYear, 11, 31, 23, 59, 59, 999);

        // Fetch completed orders for the year
        const orders = await prisma.order.findMany({
            where: {
                societyId: targetSocietyId,
                status: OrderStatus.COMPLETED,
                orderDate: { gte: startOfYear, lte: endOfYear }
            },
            select: { totalAmount: true, orderDate: true }
        });

        // Initialize monthly data array
        const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
        const monthlySales = months.map(month => ({ name: month, total: 0 }));

        // Aggregate sales by month
        orders.forEach(order => {
            const monthIndex = order.orderDate.getMonth();
            monthlySales[monthIndex].total += Number(order.totalAmount || 0);
        });

        await redis.set(cacheKey, monthlySales, 300); // 5 minutes cache
        return monthlySales;
    },

    /**
     * Get revenue by category for the current month
     */
    getRevenueByCategory: async (societyId: string | undefined) => {
        let targetSocietyId = societyId;
        const isUuid = /^[0-9a-fA-F-]{36}$/.test(societyId || '');
        if (societyId && !isUuid) {
            const society = await prisma.society.findUnique({ where: { code: societyId } });
            if (society) targetSocietyId = society.id;
            else throw new Error('Invalid Society Code');
        }
        if (!targetSocietyId) throw new Error('Society ID is required');

        const cacheKey = `dashboard:revenue-category:${targetSocietyId}`;
        const cachedChart = await redis.get(cacheKey);
        if (cachedChart) return cachedChart;

        const startOfMonth = getFirstDayOfCurrentMonthLima();
        const endOfMonth = getLastDayOfCurrentMonthLima();

        // Raw query for complex grouping
        const results: any[] = await prisma.$queryRaw`
            SELECT c.name as category, SUM(oi.total) as revenue 
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
        let targetSocietyId = societyId;
        const isUuid = /^[0-9a-fA-F-]{36}$/.test(societyId || '');
        if (societyId && !isUuid) {
            const society = await prisma.society.findUnique({ where: { code: societyId } });
            if (society) targetSocietyId = society.id;
            else throw new Error('Invalid Society Code');
        }
        if (!targetSocietyId) throw new Error('Society ID is required');

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
        let targetSocietyId = societyId;
        const isUuid = /^[0-9a-fA-F-]{36}$/.test(societyId || '');
        if (societyId && !isUuid) {
            const society = await prisma.society.findUnique({ where: { code: societyId } });
            if (society) targetSocietyId = society.id;
            else throw new Error('Invalid Society Code');
        }
        if (!targetSocietyId) throw new Error('Society ID is required');

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
     * Get cash flow (income from sales vs expenses from purchases) for the current year
     */
    getCashFlow: async (societyId: string | undefined) => {
        let targetSocietyId = societyId;
        const isUuid = /^[0-9a-fA-F-]{36}$/.test(societyId || '');
        if (societyId && !isUuid) {
            const society = await prisma.society.findUnique({ where: { code: societyId } });
            if (society) targetSocietyId = society.id;
            else throw new Error('Invalid Society Code');
        }
        if (!targetSocietyId) throw new Error('Society ID is required');

        const cacheKey = `dashboard:cash-flow:${targetSocietyId}`;
        const cachedChart = await redis.get(cacheKey);
        if (cachedChart) return cachedChart;

        const currentYear = new Date().getFullYear();
        const startOfYear = new Date(currentYear, 0, 1);
        const endOfYear = new Date(currentYear, 11, 31, 23, 59, 59, 999);

        // Fetch Sales (Income)
        const sales = await prisma.order.findMany({
            where: {
                societyId: targetSocietyId,
                status: 'COMPLETED',
                orderDate: { gte: startOfYear, lte: endOfYear }
            },
            select: { totalAmount: true, orderDate: true }
        });

        // Fetch Purchases (Expenses)
        const purchases = await prisma.purchase.findMany({
            where: {
                societyId: targetSocietyId,
                status: 'COMPLETED',
                purchaseDate: { gte: startOfYear, lte: endOfYear }
            },
            select: { totalAmount: true, purchaseDate: true }
        });

        const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
        const flow = months.map(month => ({ period: month, income: 0, expense: 0 }));

        sales.forEach(order => {
            const monthIndex = order.orderDate.getMonth();
            flow[monthIndex].income += Number(order.totalAmount || 0);
        });

        purchases.forEach(purchase => {
            const monthIndex = purchase.purchaseDate.getMonth();
            flow[monthIndex].expense += Number(purchase.totalAmount || 0);
        });

        await redis.set(cacheKey, flow, 300);
        return flow;
    },

    /**
     * Get branch performance (Sales by branch) for the current month
     */
    getBranchPerformance: async (societyId: string | undefined) => {
        let targetSocietyId = societyId;
        const isUuid = /^[0-9a-fA-F-]{36}$/.test(societyId || '');
        if (societyId && !isUuid) {
            const society = await prisma.society.findUnique({ where: { code: societyId } });
            if (society) targetSocietyId = society.id;
            else throw new Error('Invalid Society Code');
        }
        if (!targetSocietyId) throw new Error('Society ID is required');

        const cacheKey = `dashboard:branch-performance:${targetSocietyId}`;
        const cachedChart = await redis.get(cacheKey);
        if (cachedChart) return cachedChart;

        const startOfMonth = getFirstDayOfCurrentMonthLima();
        const endOfMonth = getLastDayOfCurrentMonthLima();

        const results = await prisma.order.groupBy({
            by: ['branchId'],
            _sum: { totalAmount: true },
            where: {
                societyId: targetSocietyId,
                status: 'COMPLETED',
                orderDate: { gte: startOfMonth, lte: endOfMonth }
            }
        });

        // Fetch branch names
        const branches = await prisma.branchOffice.findMany({
            where: { id: { in: results.map(r => r.branchId) } },
            select: { id: true, name: true }
        });

        const formattedData = results.map(row => {
            const branch = branches.find(b => b.id === row.branchId);
            return {
                branch: branch ? branch.name : 'Desconocida',
                revenue: Number(row._sum.totalAmount || 0)
            };
        }).sort((a, b) => b.revenue - a.revenue);

        await redis.set(cacheKey, formattedData, 300);
        return formattedData;
    }
};
