import { Prisma, OrderStatus } from '@prisma/client';
import prisma from '@/config/prisma';
import { redis } from '@/config/redis';
import { convertLimaDateRangeToUTC } from '@/utils/dateFormatter';
import { NotFoundAppError, ValidationAppError } from '@/utils/domain-errors';
import {
  AnalyticsFilters,
  enumeratePeriodLabels,
  getDateBucketSql,
  normalizeAnalyticsFilters,
} from '../analytics/analytics.helpers';
import { AnalyticsService } from '../analytics/analytics.service';
import {
  buildBranchFilterSql,
  buildDashboardCacheKey,
  DashboardFilters,
  getCurrentDashboardDateContexts,
  getDashboardMonthRange,
  normalizeDashboardFilters,
} from './dashboard.helpers';

const DASHBOARD_CACHE_TTL = 300;

const shiftLimaDateKey = (dateKey: string, days: number) => {
  const date = new Date(`${dateKey}T00:00:00-05:00`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

const resolveStatsDateContexts = (filters: DashboardFilters) => {
  const { today, weekStart, month, year } = getCurrentDashboardDateContexts();

  if (filters.dateFrom || filters.dateTo) {
    const rangeStart = filters.dateFrom ?? filters.dateTo ?? today;
    const rangeEnd = filters.dateTo ?? filters.dateFrom ?? today;
    const explicitRange = convertLimaDateRangeToUTC(rangeStart, rangeEnd);

    return {
      today: rangeEnd,
      weekStart: shiftLimaDateKey(rangeEnd, -6),
      monthRange: { start: explicitRange.from!, end: explicitRange.to! },
    };
  }

  return {
    today,
    weekStart,
    monthRange: getDashboardMonthRange({ month, year, branchId: filters.branchId }),
  };
};

const resolveOverviewTrendFilters = (filters?: AnalyticsFilters): AnalyticsFilters => {
  const resolved = normalizeAnalyticsFilters(filters);
  const granularity = filters?.granularity ?? resolved.granularity;
  const { today } = getCurrentDashboardDateContexts();
  const hasExplicitRange =
    Boolean(filters?.dateFrom) &&
    Boolean(filters?.dateTo) &&
    filters?.dateFrom !== filters?.dateTo;

  if (granularity === 'day') {
    const targetDate = filters?.dateTo ?? filters?.dateFrom ?? today;
    return {
      ...filters,
      dateFrom: targetDate,
      dateTo: targetDate,
      granularity,
      limit: filters?.limit ?? resolved.limit,
    };
  }

  // In the compact dashboard, week/month toggles are expected to show the current period
  // unless the client sends a full custom range.
  if (!hasExplicitRange && (granularity === 'week' || granularity === 'month')) {
    return {
      ...filters,
      dateFrom: granularity === 'week' ? shiftLimaDateKey(today, -6) : `${today.slice(0, 7)}-01`,
      dateTo: today,
      granularity,
      limit: filters?.limit ?? resolved.limit,
    };
  }

  return {
    ...filters,
    dateFrom: filters?.dateFrom ?? resolved.dateFrom,
    dateTo: filters?.dateTo ?? resolved.dateTo,
    granularity,
    limit: filters?.limit ?? resolved.limit,
  };
};

const hasExplicitOverviewRange = (filters?: AnalyticsFilters) =>
  Boolean(filters?.dateFrom) &&
  Boolean(filters?.dateTo) &&
  filters?.dateFrom !== filters?.dateTo;

const buildHourlyLabels = () =>
  Array.from({ length: 24 }, (_, hour) => `${String(hour).padStart(2, '0')}:00`);

const buildSeriesMap = <T extends Record<string, unknown>>(rows: T[], key: keyof T) =>
  new Map(rows.map(row => [String(row[key]), row]));

const toSqlTimestamp = (value: Date) => Prisma.sql`${value.toISOString()}::timestamp`;

const resolveSocietyId = async (societyRef: string | undefined): Promise<string> => {
  if (!societyRef) throw new ValidationAppError('Society ID is required');
  const isUuid = /^[0-9a-fA-F-]{36}$/.test(societyRef);
  if (isUuid) return societyRef;

  const society = await prisma.society.findUnique({ where: { code: societyRef } });
  if (society) return society.id;
  throw new NotFoundAppError('Invalid Society Code', { societyCode: societyRef });
};

const resolveBranchId = async (societyId: string, branchRef?: string) => {
  if (!branchRef) return undefined;

  const isUuid = /^[0-9a-fA-F-]{36}$/.test(branchRef);
  if (isUuid) return branchRef;

  const branch = await prisma.branchOffice.findUnique({
    where: { societyId_code: { societyId, code: branchRef } },
    select: { id: true },
  });

  if (branch) return branch.id;
  throw new NotFoundAppError('Invalid Branch Code', { societyId, branchCode: branchRef });
};

export const DashboardService = {
  getStats: async (societyRef: string | undefined, filters?: DashboardFilters) => {
    const targetSocietyId = await resolveSocietyId(societyRef);
    const normalizedFilters = normalizeDashboardFilters(filters);
    const resolvedBranchId = await resolveBranchId(targetSocietyId, normalizedFilters.branchId);
    const resolvedFilters = {
      ...normalizedFilters,
      branchId: resolvedBranchId,
    };
    const cacheKey = buildDashboardCacheKey('stats-v3', targetSocietyId, resolvedFilters);
    const cachedStats = await redis.get(cacheKey);
    if (cachedStats) return cachedStats;

    const { today, weekStart, monthRange } = resolveStatsDateContexts(resolvedFilters);
    const branchFilter = resolvedFilters.branchId ? { branchId: resolvedFilters.branchId } : {};
    const todayRange = convertLimaDateRangeToUTC(today, today);
    const weekRange = convertLimaDateRangeToUTC(weekStart, today);

    const [todayAgg, weekAgg, monthAgg] = await Promise.all([
      prisma.order.aggregate({
        _sum: { totalAmount: true },
        _avg: { totalAmount: true },
        _count: { id: true },
        where: {
          societyId: targetSocietyId,
          ...branchFilter,
          status: OrderStatus.COMPLETED,
          orderDate: { gte: todayRange.from!, lte: todayRange.to! },
        },
      }),
      prisma.order.aggregate({
        _sum: { totalAmount: true },
        _avg: { totalAmount: true },
        _count: { id: true },
        where: {
          societyId: targetSocietyId,
          ...branchFilter,
          status: OrderStatus.COMPLETED,
          orderDate: { gte: weekRange.from!, lte: weekRange.to! },
        },
      }),
      prisma.order.aggregate({
        _sum: { totalAmount: true },
        _avg: { totalAmount: true },
        _count: { id: true },
        where: {
          societyId: targetSocietyId,
          ...branchFilter,
          status: OrderStatus.COMPLETED,
          orderDate: { gte: monthRange.start, lte: monthRange.end },
        },
      }),
    ]);

    const stats = {
      salesToday: Number(todayAgg._sum.totalAmount || 0),
      salesThisWeek: Number(weekAgg._sum.totalAmount || 0),
      salesThisMonth: Number(monthAgg._sum.totalAmount || 0),
      completedOrdersToday: Number(todayAgg._count.id || 0),
      completedOrdersThisWeek: Number(weekAgg._count.id || 0),
      completedOrdersThisMonth: Number(monthAgg._count.id || 0),
      averageTicketToday: Number(todayAgg._avg.totalAmount || 0),
      averageTicketThisWeek: Number(weekAgg._avg.totalAmount || 0),
      averageTicketThisMonth: Number(monthAgg._avg.totalAmount || 0),
    };

    await redis.set(cacheKey, stats, 120);
    return stats;
  },

  getOverview: async (societyRef: string | undefined, filters?: AnalyticsFilters) => {
    const targetSocietyId = await resolveSocietyId(societyRef);
    const resolvedBranchId = await resolveBranchId(targetSocietyId, filters?.branchId);
    const resolvedInputFilters = {
      ...filters,
      branchId: resolvedBranchId,
    };
    const explicitRange = hasExplicitOverviewRange(resolvedInputFilters);
    const compactFilters = resolveOverviewTrendFilters(resolvedInputFilters);
    const resolved = normalizeAnalyticsFilters(compactFilters);
    const trendGranularity = explicitRange && compactFilters.granularity === 'week' ? 'week' : 'day';
    const targetOverviewDate = compactFilters.granularity === 'day' ? compactFilters.dateTo || compactFilters.dateFrom : undefined;
    const overviewCacheKey = [
      'dashboard',
      'overview',
      'v4',
      targetSocietyId,
      compactFilters.branchId || 'all',
      compactFilters.dateFrom || 'auto-from',
      compactFilters.dateTo || 'auto-to',
      compactFilters.granularity || 'auto',
      targetOverviewDate || 'range',
      compactFilters.limit || 5,
    ].join(':');
    const cached = await redis.get(overviewCacheKey);
    if (cached) return cached;

    const salesBranchSql = buildBranchFilterSql('o."branchId"', compactFilters.branchId);
    const paymentsBranchSql = buildBranchFilterSql('o."branchId"', resolved.branchId);
    const purchasesBranchSql = buildBranchFilterSql('p."branchOfficeId"', compactFilters.branchId);
    const overviewSalesBranchSql = buildBranchFilterSql('o."branchId"', resolved.branchId);

    let salesTrend: Array<{ label: string; value: number }> = [];
    let cashFlowMini: Array<{ label: string; income: number; expense: number; net: number }> = [];

    if (compactFilters.granularity === 'day') {
      const { from, to } = convertLimaDateRangeToUTC(targetOverviewDate!, targetOverviewDate!);
      const [salesRows, purchaseRows] = await Promise.all([
        prisma.$queryRaw<any[]>`
          SELECT
            to_char(date_trunc('hour', timezone('America/Lima', timezone('UTC', o."orderDate"))), 'HH24:00') as label,
            COALESCE(SUM(o."totalAmount"), 0) as sales
          FROM "Order" o
          WHERE o."societyId" = ${targetSocietyId}
          AND o.status IN ('PENDING_PAYMENT'::"OrderStatus", 'COMPLETED'::"OrderStatus")
          AND o."orderDate" >= ${toSqlTimestamp(from!)}
          AND o."orderDate" <= ${toSqlTimestamp(to!)}
          ${salesBranchSql}
          GROUP BY label
          ORDER BY label
        `,
        prisma.$queryRaw<any[]>`
          SELECT
            to_char(date_trunc('hour', timezone('America/Lima', timezone('UTC', p."purchaseDate"))), 'HH24:00') as label,
            COALESCE(SUM(p."totalAmount"), 0) as expense
          FROM "Purchase" p
          WHERE p."societyId" = ${targetSocietyId}
          AND p.status = 'COMPLETED'
          AND p."purchaseDate" >= ${toSqlTimestamp(from!)}
          AND p."purchaseDate" <= ${toSqlTimestamp(to!)}
          ${purchasesBranchSql}
          GROUP BY label
          ORDER BY label
        `,
      ]);

      const labels = buildHourlyLabels();
      const salesMap = new Map(salesRows.map(row => [String(row.label), Number(row.sales || 0)]));
      const purchaseMap = new Map(purchaseRows.map(row => [String(row.label), Number(row.expense || 0)]));
      salesTrend = labels.map(label => ({ label, value: salesMap.get(label) || 0 }));
      cashFlowMini = labels.map(label => {
        const income = salesMap.get(label) || 0;
        const expense = purchaseMap.get(label) || 0;
        return { label, income, expense, net: income - expense };
      });
    } else {
      const salesBucketSql = getDateBucketSql('o."orderDate"', trendGranularity);
      const purchaseBucketSql = getDateBucketSql('p."purchaseDate"', trendGranularity);
      const [salesRows, purchaseRows] = await Promise.all([
        prisma.$queryRaw<any[]>`
          SELECT
            ${salesBucketSql} as label,
            COALESCE(SUM(o."totalAmount"), 0) as sales
          FROM "Order" o
          WHERE o."societyId" = ${targetSocietyId}
          AND o.status IN ('PENDING_PAYMENT'::"OrderStatus", 'COMPLETED'::"OrderStatus")
          AND o."orderDate" >= ${toSqlTimestamp(resolved.start)}
          AND o."orderDate" <= ${toSqlTimestamp(resolved.end)}
          ${salesBranchSql}
          GROUP BY label
          ORDER BY label
        `,
        prisma.$queryRaw<any[]>`
          SELECT
            ${purchaseBucketSql} as label,
            COALESCE(SUM(p."totalAmount"), 0) as expense
          FROM "Purchase" p
          WHERE p."societyId" = ${targetSocietyId}
          AND p.status = 'COMPLETED'
          AND p."purchaseDate" >= ${toSqlTimestamp(resolved.start)}
          AND p."purchaseDate" <= ${toSqlTimestamp(resolved.end)}
          ${purchasesBranchSql}
          GROUP BY label
          ORDER BY label
        `,
      ]);

      const labels = enumeratePeriodLabels(resolved.dateFrom, resolved.dateTo, trendGranularity);
      const salesMap = buildSeriesMap(salesRows, 'label');
      const purchaseMap = buildSeriesMap(purchaseRows, 'label');
      salesTrend = labels.map(label => ({
        label,
        value: Number((salesMap.get(label) as any)?.sales || 0),
      }));
      cashFlowMini = labels.map(label => {
        const income = Number((salesMap.get(label) as any)?.sales || 0);
        const expense = Number((purchaseMap.get(label) as any)?.expense || 0);
        return { label, income, expense, net: income - expense };
      });
    }

    const [paymentRows, topProductsRows, topBranchesRows] = await Promise.all([
      prisma.$queryRaw<any[]>`
        SELECT
          op."paymentMethod" as method,
          COALESCE(SUM(op.amount), 0) as amount,
          COUNT(*)::int as transactions
        FROM "OrderPayment" op
        LEFT JOIN "Order" o ON op."orderId" = o.id
        WHERE op."societyId" = ${targetSocietyId}
        AND op.status IN ('PENDING'::"PaymentStatus", 'CONFIRMED'::"PaymentStatus")
        AND op."paymentDate" >= ${toSqlTimestamp(resolved.start)}
        AND op."paymentDate" <= ${toSqlTimestamp(resolved.end)}
        ${resolved.branchId ? Prisma.sql`AND o.id IS NOT NULL ${paymentsBranchSql}` : Prisma.empty}
        GROUP BY op."paymentMethod"
        ORDER BY amount DESC
      `,
      prisma.$queryRaw<any[]>`
        SELECT
          p.id as "productId",
          p.name as "productName",
          c.name as category,
          COALESCE(SUM(oi.quantity), 0)::int as "soldUnits",
          COALESCE(SUM(oi.total), 0) as revenue,
          p.stock as "stockRemaining"
        FROM "OrderItem" oi
        JOIN "Order" o ON oi."orderId" = o.id
        JOIN "Product" p ON oi."productId" = p.id
        JOIN "Category" c ON p."categoryId" = c.id
        WHERE o."societyId" = ${targetSocietyId}
        AND o.status IN ('PENDING_PAYMENT'::"OrderStatus", 'COMPLETED'::"OrderStatus")
        AND o."orderDate" >= ${toSqlTimestamp(resolved.start)}
        AND o."orderDate" <= ${toSqlTimestamp(resolved.end)}
        ${overviewSalesBranchSql}
        GROUP BY p.id, p.name, c.name, p.stock
        ORDER BY "soldUnits" DESC, revenue DESC
        LIMIT ${resolved.limit}
      `,
      prisma.$queryRaw<any[]>`
        SELECT
          b.id as "branchId",
          b.name as branch,
          COALESCE(SUM(o."totalAmount"), 0) as revenue,
          COUNT(*)::int as orders,
          COALESCE(AVG(o."totalAmount"), 0) as "averageTicket"
        FROM "Order" o
        JOIN "BranchOffice" b ON o."branchId" = b.id
        WHERE o."societyId" = ${targetSocietyId}
        AND o.status IN ('PENDING_PAYMENT'::"OrderStatus", 'COMPLETED'::"OrderStatus")
        AND o."orderDate" >= ${toSqlTimestamp(resolved.start)}
        AND o."orderDate" <= ${toSqlTimestamp(resolved.end)}
        ${overviewSalesBranchSql}
        GROUP BY b.id, b.name
        ORDER BY revenue DESC
      `,
    ]);

    const paymentsTotal = paymentRows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
    const paymentMethods = paymentRows.map(row => ({
      method: row.method,
      amount: Number(row.amount || 0),
      percentage: paymentsTotal === 0 ? 0 : Number(((Number(row.amount || 0) / paymentsTotal) * 100).toFixed(2)),
      transactions: Number(row.transactions || 0),
    }));
    const topProducts = topProductsRows.map(row => ({
      productId: row.productId,
      productName: row.productName,
      category: row.category,
      soldUnits: Number(row.soldUnits || 0),
      revenue: Number(row.revenue || 0),
      stockRemaining: Number(row.stockRemaining || 0),
    }));
    const topBranches = topBranchesRows.map(row => ({
      branchId: row.branchId,
      branch: row.branch,
      revenue: Number(row.revenue || 0),
      orders: Number(row.orders || 0),
      averageTicket: Number(row.averageTicket || 0),
    }));

    const overview = {
      salesTrend,
      paymentMethods,
      cashFlowMini,
      topProducts,
      topBranches,
    };

    await redis.set(overviewCacheKey, overview, DASHBOARD_CACHE_TTL);
    return overview;
  },

  getAlertsLowStock: async (societyRef: string | undefined, filters?: AnalyticsFilters) => {
    const targetSocietyId = await resolveSocietyId(societyRef);
    const resolvedBranchId = await resolveBranchId(targetSocietyId, filters?.branchId);
    const result: any = await AnalyticsService.getInventoryLowStock(targetSocietyId, {
      branchId: resolvedBranchId,
      limit: filters?.limit ?? 10,
    });

    return {
      count: result.items.length,
      items: result.items.map((item: any) => ({
        productId: item.productId,
        productName: item.productName,
        branchId: item.branchId,
        branchName: item.branchName,
        availableStock: item.availableStock,
        minStock: item.minStock,
        status: item.availableStock <= 0 ? 'critical' : 'warning',
      })),
    };
  },

  getCatalogSummary: async (societyRef: string | undefined, filters?: AnalyticsFilters) => {
    const targetSocietyId = await resolveSocietyId(societyRef);
    const resolvedBranchId = await resolveBranchId(targetSocietyId, filters?.branchId);
    const cacheKey = buildDashboardCacheKey('catalog-summary', targetSocietyId, {
      branchId: resolvedBranchId,
      month: undefined,
      year: undefined,
    });
    const cached = await redis.get(cacheKey);
    if (cached) return cached;

    const [stockValueResult, lowStockCountResult, newProductsThisMonth, activeProducts] = await Promise.all([
      resolvedBranchId
        ? prisma.$queryRaw<any[]>`
            SELECT COALESCE(SUM(p.price * bop."physicalStock"), 0) as total
            FROM "BranchOfficeProduct" bop
            JOIN "Product" p ON p.id = bop."productId"
            WHERE p."societyId" = ${targetSocietyId}
            AND bop."branchOfficeId" = ${resolvedBranchId}
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
      prisma.$queryRaw<any[]>`
        SELECT COUNT(*)::int as total
        FROM "BranchOfficeProduct" bop
        JOIN "Product" p ON p.id = bop."productId"
        WHERE p."societyId" = ${targetSocietyId}
        AND bop."isDeleted" = false
        AND p."isDeleted" = false
        AND p."isActive" = true
        ${resolvedBranchId ? Prisma.sql`AND bop."branchOfficeId" = ${resolvedBranchId}` : Prisma.empty}
        AND bop."availableStock" <= COALESCE(bop."minStock", p."minStock")
      `,
      prisma.product.count({
        where: {
          societyId: targetSocietyId,
          isActive: true,
          isDeleted: false,
          createdAt: { gte: getDashboardMonthRange().start, lte: getDashboardMonthRange().end },
        },
      }),
      prisma.product.count({
        where: {
          societyId: targetSocietyId,
          isActive: true,
          isDeleted: false,
        },
      }),
    ]);

    const summary = {
      totalStockValue: Number(stockValueResult[0]?.total || 0),
      lowStockItems: Number(lowStockCountResult[0]?.total || 0),
      newProductsThisMonth,
      activeProducts,
    };

    await redis.set(cacheKey, summary, 1800);
    return summary;
  },
};
