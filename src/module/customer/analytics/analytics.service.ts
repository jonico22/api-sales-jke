import { Prisma } from '@prisma/client';
import prisma from '@/config/prisma';
import { redis } from '@/config/redis';
import { convertLimaDateRangeToUTC } from '@/utils/dateFormatter';
import { NotFoundAppError, ValidationAppError } from '@/utils/domain-errors';
import {
  buildAlignedPreviousPeriod,
  AnalyticsFilters,
  ResolvedAnalyticsFilters,
  buildAnalyticsBranchFilterSql,
  buildAnalyticsCacheKey,
  calculatePercentageChange,
  enumeratePeriodLabels,
  getDateBucketSql,
  normalizeAnalyticsFilters,
} from './analytics.helpers';

const ANALYTICS_CACHE_TTL = 600;

const resolveSocietyId = async (societyId: string | undefined): Promise<string> => {
  if (!societyId) throw new ValidationAppError('Society ID is required');
  const isUuid = /^[0-9a-fA-F-]{36}$/.test(societyId);
  if (isUuid) return societyId;

  const society = await prisma.society.findUnique({ where: { code: societyId } });
  if (society) return society.id;
  throw new NotFoundAppError('Invalid Society Code', { societyCode: societyId });
};

const toNumber = (value: unknown) => Number(value || 0);
const buildSeriesMap = <T extends Record<string, unknown>>(rows: T[], key: keyof T) =>
  new Map(rows.map(row => [String(row[key]), row]));

const buildComparisonMetric = (current: number, previous: number | null) => ({
  current,
  previous,
  delta: previous === null ? null : Number((current - previous).toFixed(2)),
  deltaPct: previous === null ? null : calculatePercentageChange(current, previous),
});

const buildComparisonRange = (resolved: ResolvedAnalyticsFilters) => ({
  current: {
    dateFrom: resolved.dateFrom,
    dateTo: resolved.dateTo,
    granularity: resolved.granularity,
  },
  previous: resolved.previousDateFrom && resolved.previousDateTo
    ? {
        dateFrom: resolved.previousDateFrom,
        dateTo: resolved.previousDateTo,
        granularity: resolved.granularity,
      }
    : null,
});

const buildPreviousResolvedFilters = (resolved: ResolvedAnalyticsFilters): ResolvedAnalyticsFilters => ({
  ...resolved,
  dateFrom: resolved.previousDateFrom!,
  dateTo: resolved.previousDateTo!,
  start: resolved.previousStart!,
  end: resolved.previousEnd!,
  comparePrevious: false,
});

const addDaysToDateKey = (dateKey: string, days: number) => {
  const date = new Date(`${dateKey}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

const getMonthEndDateKey = (monthLabel: string) => {
  const [year, month] = monthLabel.split('-').map(Number);
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
};

const getBucketEndDateKey = (
  label: string,
  granularity: ResolvedAnalyticsFilters['granularity'],
  overallDateTo: string
) => {
  if (granularity === 'day') return label;
  if (granularity === 'week') {
    const weekEnd = addDaysToDateKey(label, 6);
    return weekEnd > overallDateTo ? overallDateTo : weekEnd;
  }

  const monthEnd = getMonthEndDateKey(label);
  return monthEnd > overallDateTo ? overallDateTo : monthEnd;
};

const getBucketEndUtc = (
  label: string,
  granularity: ResolvedAnalyticsFilters['granularity'],
  overallDateTo: string
) => convertLimaDateRangeToUTC(getBucketEndDateKey(label, granularity, overallDateTo), getBucketEndDateKey(label, granularity, overallDateTo)).to!;

const buildAlignedMetricPeriod = <T extends Record<string, number>>(
  series: Array<{ label: string } & T>,
  previousPeriod: Array<{ label: string } & T>,
  zeroValues: T
): Array<{ label: string; sourceLabel: string | null } & T> =>
  series.map((point, index) => {
    const source = index === 0 ? previousPeriod[previousPeriod.length - 1] : series[index - 1];

    return {
      label: point.label,
      sourceLabel: source?.label ?? null,
      ...Object.fromEntries(
        Object.keys(zeroValues).map(metricKey => [metricKey, Number(source?.[metricKey as keyof T] ?? zeroValues[metricKey as keyof T])])
      ) as T,
    };
  });

const getSummaryTotals = async (societyId: string, filters: ResolvedAnalyticsFilters) => {
  const salesBranchSql = buildAnalyticsBranchFilterSql('o."branchId"', filters.branchId);
  const purchaseBranchSql = buildAnalyticsBranchFilterSql('p."branchOfficeId"', filters.branchId);

  const [salesResult, expensesResult, unitsResult, profitResult] = await Promise.all([
    prisma.$queryRaw<any[]>`
      SELECT
        COALESCE(SUM(o."totalAmount"), 0) as sales,
        COUNT(*)::int as orders,
        COALESCE(AVG(o."totalAmount"), 0) as "averageTicket"
      FROM "Order" o
      WHERE o."societyId" = ${societyId}
      AND o.status = 'COMPLETED'
      AND o."orderDate" >= ${filters.start}
      AND o."orderDate" <= ${filters.end}
      ${salesBranchSql}
    `,
    prisma.$queryRaw<any[]>`
      SELECT COALESCE(SUM(p."totalAmount"), 0) as expenses
      FROM "Purchase" p
      WHERE p."societyId" = ${societyId}
      AND p.status = 'COMPLETED'
      AND p."purchaseDate" >= ${filters.start}
      AND p."purchaseDate" <= ${filters.end}
      ${purchaseBranchSql}
    `,
    prisma.$queryRaw<any[]>`
      SELECT COALESCE(SUM(oi.quantity), 0)::int as "unitsSold"
      FROM "OrderItem" oi
      JOIN "Order" o ON oi."orderId" = o.id
      WHERE o."societyId" = ${societyId}
      AND o.status = 'COMPLETED'
      AND o."orderDate" >= ${filters.start}
      AND o."orderDate" <= ${filters.end}
      ${salesBranchSql}
    `,
    prisma.$queryRaw<any[]>`
      SELECT COALESCE(SUM((oi."unitPrice" - oi."costPrice") * oi.quantity), 0) as "grossProfitEstimate"
      FROM "OrderItem" oi
      JOIN "Order" o ON oi."orderId" = o.id
      WHERE o."societyId" = ${societyId}
      AND o.status = 'COMPLETED'
      AND o."orderDate" >= ${filters.start}
      AND o."orderDate" <= ${filters.end}
      ${salesBranchSql}
    `,
  ]);

  return {
    sales: toNumber(salesResult[0]?.sales),
    expenses: toNumber(expensesResult[0]?.expenses),
    grossProfitEstimate: toNumber(profitResult[0]?.grossProfitEstimate),
    orders: toNumber(salesResult[0]?.orders),
    averageTicket: toNumber(salesResult[0]?.averageTicket),
    unitsSold: toNumber(unitsResult[0]?.unitsSold),
  };
};

export const AnalyticsService = {
  normalizeFilters: (filters?: AnalyticsFilters) => normalizeAnalyticsFilters(filters),

  getSummary: async (societyRef: string | undefined, filters?: AnalyticsFilters) => {
    const targetSocietyId = await resolveSocietyId(societyRef);
    const resolved = normalizeAnalyticsFilters(filters);
    const cacheKey = buildAnalyticsCacheKey('summary', targetSocietyId, resolved);
    const cached = await redis.get(cacheKey);
    if (cached) return cached;

    const totals = await getSummaryTotals(targetSocietyId, resolved);
    const previousTotals = resolved.comparePrevious && resolved.previousStart && resolved.previousEnd
      ? await getSummaryTotals(targetSocietyId, {
          ...resolved,
          dateFrom: resolved.previousDateFrom!,
          dateTo: resolved.previousDateTo!,
          start: resolved.previousStart,
          end: resolved.previousEnd,
          comparePrevious: false,
        })
      : null;

    const result = {
      range: buildComparisonRange(resolved),
      totals,
      previousTotals,
      comparison: {
        salesPct: previousTotals ? calculatePercentageChange(totals.sales, previousTotals.sales) : null,
        ordersPct: previousTotals ? calculatePercentageChange(totals.orders, previousTotals.orders) : null,
        averageTicketPct: previousTotals
          ? calculatePercentageChange(totals.averageTicket, previousTotals.averageTicket)
          : null,
      },
      comparisonByMetric: {
        sales: buildComparisonMetric(totals.sales, previousTotals?.sales ?? null),
        expenses: buildComparisonMetric(totals.expenses, previousTotals?.expenses ?? null),
        grossProfitEstimate: buildComparisonMetric(
          totals.grossProfitEstimate,
          previousTotals?.grossProfitEstimate ?? null
        ),
        orders: buildComparisonMetric(totals.orders, previousTotals?.orders ?? null),
        averageTicket: buildComparisonMetric(totals.averageTicket, previousTotals?.averageTicket ?? null),
        unitsSold: buildComparisonMetric(totals.unitsSold, previousTotals?.unitsSold ?? null),
      },
    };

    await redis.set(cacheKey, result, ANALYTICS_CACHE_TTL);
    return result;
  },

  getSalesTrend: async (societyRef: string | undefined, filters?: AnalyticsFilters) => {
    const targetSocietyId = await resolveSocietyId(societyRef);
    const resolved = normalizeAnalyticsFilters(filters);
    const cacheKey = buildAnalyticsCacheKey('sales-trend', targetSocietyId, resolved);
    const cached = await redis.get(cacheKey);
    if (cached) return cached;

    const bucketSql = getDateBucketSql('o."orderDate"', resolved.granularity);
    const branchSql = buildAnalyticsBranchFilterSql('o."branchId"', resolved.branchId);

    const rows = await prisma.$queryRaw<any[]>`
      SELECT
        ${bucketSql} as label,
        COALESCE(SUM(o."totalAmount"), 0) as sales,
        COUNT(*)::int as orders,
        COALESCE(AVG(o."totalAmount"), 0) as "averageTicket"
      FROM "Order" o
      WHERE o."societyId" = ${targetSocietyId}
      AND o.status = 'COMPLETED'
      AND o."orderDate" >= ${resolved.start}
      AND o."orderDate" <= ${resolved.end}
      ${branchSql}
      GROUP BY label
      ORDER BY label
    `;

    const labels = enumeratePeriodLabels(resolved.dateFrom, resolved.dateTo, resolved.granularity);
    const rowMap = buildSeriesMap(rows, 'label');
    const series = labels.map(label => {
      const row = rowMap.get(label) as any;
      return {
        label,
        sales: toNumber(row?.sales),
        orders: toNumber(row?.orders),
        averageTicket: toNumber(row?.averageTicket),
      };
    });

    let previousPeriod: Array<{ label: string; sales: number }> = [];
    let previousPeriodAligned: Array<{ label: string; sourceLabel: string | null; sales: number }> = [];
    if (resolved.comparePrevious && resolved.previousStart && resolved.previousEnd) {
      const previousRows = await prisma.$queryRaw<any[]>`
        SELECT
          ${bucketSql} as label,
          COALESCE(SUM(o."totalAmount"), 0) as sales
        FROM "Order" o
        WHERE o."societyId" = ${targetSocietyId}
        AND o.status = 'COMPLETED'
        AND o."orderDate" >= ${resolved.previousStart}
        AND o."orderDate" <= ${resolved.previousEnd}
        ${branchSql}
        GROUP BY label
        ORDER BY label
      `;
      const previousLabels = enumeratePeriodLabels(resolved.previousDateFrom!, resolved.previousDateTo!, resolved.granularity);
      const previousMap = buildSeriesMap(previousRows, 'label');
      previousPeriod = previousLabels.map(label => ({
        label,
        sales: toNumber((previousMap.get(label) as any)?.sales),
      }));
      previousPeriodAligned = buildAlignedPreviousPeriod(series, previousPeriod);
    }

    const result = {
      range: buildComparisonRange(resolved),
      series,
      previousPeriod,
      previousPeriodAligned,
    };

    await redis.set(cacheKey, result, ANALYTICS_CACHE_TTL);
    return result;
  },

  getCashFlowTrend: async (societyRef: string | undefined, filters?: AnalyticsFilters) => {
    const targetSocietyId = await resolveSocietyId(societyRef);
    const resolved = normalizeAnalyticsFilters(filters);
    const cacheKey = buildAnalyticsCacheKey('cash-flow-trend', targetSocietyId, resolved);
    const cached = await redis.get(cacheKey);
    if (cached) return cached;

    const salesBucketSql = getDateBucketSql('o."orderDate"', resolved.granularity);
    const purchaseBucketSql = getDateBucketSql('p."purchaseDate"', resolved.granularity);
    const salesBranchSql = buildAnalyticsBranchFilterSql('o."branchId"', resolved.branchId);
    const purchaseBranchSql = buildAnalyticsBranchFilterSql('p."branchOfficeId"', resolved.branchId);

    const [salesRows, purchaseRows] = await Promise.all([
      prisma.$queryRaw<any[]>`
        SELECT ${salesBucketSql} as label, COALESCE(SUM(o."totalAmount"), 0) as income
        FROM "Order" o
        WHERE o."societyId" = ${targetSocietyId}
        AND o.status = 'COMPLETED'
        AND o."orderDate" >= ${resolved.start}
        AND o."orderDate" <= ${resolved.end}
        ${salesBranchSql}
        GROUP BY label
        ORDER BY label
      `,
      prisma.$queryRaw<any[]>`
        SELECT ${purchaseBucketSql} as label, COALESCE(SUM(p."totalAmount"), 0) as expense
        FROM "Purchase" p
        WHERE p."societyId" = ${targetSocietyId}
        AND p.status = 'COMPLETED'
        AND p."purchaseDate" >= ${resolved.start}
        AND p."purchaseDate" <= ${resolved.end}
        ${purchaseBranchSql}
        GROUP BY label
        ORDER BY label
      `,
    ]);

    const labels = enumeratePeriodLabels(resolved.dateFrom, resolved.dateTo, resolved.granularity);
    const salesMap = buildSeriesMap(salesRows, 'label');
    const purchaseMap = buildSeriesMap(purchaseRows, 'label');
    const series = labels.map(label => {
      const income = toNumber((salesMap.get(label) as any)?.income);
      const expense = toNumber((purchaseMap.get(label) as any)?.expense);
      return { label, income, expense, net: income - expense };
    });

    let previousPeriod: Array<{ label: string; income: number; expense: number; net: number }> = [];
    let previousPeriodAligned: Array<{
      label: string;
      sourceLabel: string | null;
      income: number;
      expense: number;
      net: number;
    }> = [];
    if (resolved.comparePrevious && resolved.previousStart && resolved.previousEnd) {
      const [previousSalesRows, previousPurchaseRows] = await Promise.all([
        prisma.$queryRaw<any[]>`
          SELECT ${salesBucketSql} as label, COALESCE(SUM(o."totalAmount"), 0) as income
          FROM "Order" o
          WHERE o."societyId" = ${targetSocietyId}
          AND o.status = 'COMPLETED'
          AND o."orderDate" >= ${resolved.previousStart}
          AND o."orderDate" <= ${resolved.previousEnd}
          ${salesBranchSql}
          GROUP BY label
          ORDER BY label
        `,
        prisma.$queryRaw<any[]>`
          SELECT ${purchaseBucketSql} as label, COALESCE(SUM(p."totalAmount"), 0) as expense
          FROM "Purchase" p
          WHERE p."societyId" = ${targetSocietyId}
          AND p.status = 'COMPLETED'
          AND p."purchaseDate" >= ${resolved.previousStart}
          AND p."purchaseDate" <= ${resolved.previousEnd}
          ${purchaseBranchSql}
          GROUP BY label
          ORDER BY label
        `,
      ]);
      const previousLabels = enumeratePeriodLabels(resolved.previousDateFrom!, resolved.previousDateTo!, resolved.granularity);
      const previousSalesMap = buildSeriesMap(previousSalesRows, 'label');
      const previousPurchaseMap = buildSeriesMap(previousPurchaseRows, 'label');
      previousPeriod = previousLabels.map(label => {
        const income = toNumber((previousSalesMap.get(label) as any)?.income);
        const expense = toNumber((previousPurchaseMap.get(label) as any)?.expense);
        return { label, income, expense, net: income - expense };
      });
      previousPeriodAligned = buildAlignedMetricPeriod(series, previousPeriod, { income: 0, expense: 0, net: 0 });
    }

    const result = {
      range: buildComparisonRange(resolved),
      series,
      previousPeriod,
      previousPeriodAligned,
    };

    await redis.set(cacheKey, result, ANALYTICS_CACHE_TTL);
    return result;
  },

  getSalesByCategory: async (societyRef: string | undefined, filters?: AnalyticsFilters) => {
    const targetSocietyId = await resolveSocietyId(societyRef);
    const resolved = normalizeAnalyticsFilters(filters);
    const cacheKey = buildAnalyticsCacheKey('sales-by-category', targetSocietyId, resolved);
    const cached = await redis.get(cacheKey);
    if (cached) return cached;

    const branchSql = buildAnalyticsBranchFilterSql('o."branchId"', resolved.branchId);
    const rows = await prisma.$queryRaw<any[]>`
      SELECT
        c.id as "categoryId",
        c.name as category,
        COALESCE(SUM(oi.total), 0) as revenue,
        COALESCE(SUM(oi.quantity), 0)::int as "unitsSold"
      FROM "OrderItem" oi
      JOIN "Order" o ON oi."orderId" = o.id
      JOIN "Product" p ON oi."productId" = p.id
      JOIN "Category" c ON p."categoryId" = c.id
      WHERE o."societyId" = ${targetSocietyId}
      AND o.status = 'COMPLETED'
      AND o."orderDate" >= ${resolved.start}
      AND o."orderDate" <= ${resolved.end}
      ${branchSql}
      GROUP BY c.id, c.name
      ORDER BY revenue DESC
    `;

    const previousRows =
      resolved.comparePrevious && resolved.previousStart && resolved.previousEnd
        ? await prisma.$queryRaw<any[]>`
            SELECT
              c.id as "categoryId",
              c.name as category,
              COALESCE(SUM(oi.total), 0) as revenue,
              COALESCE(SUM(oi.quantity), 0)::int as "unitsSold"
            FROM "OrderItem" oi
            JOIN "Order" o ON oi."orderId" = o.id
            JOIN "Product" p ON oi."productId" = p.id
            JOIN "Category" c ON p."categoryId" = c.id
            WHERE o."societyId" = ${targetSocietyId}
            AND o.status = 'COMPLETED'
            AND o."orderDate" >= ${resolved.previousStart}
            AND o."orderDate" <= ${resolved.previousEnd}
            ${branchSql}
            GROUP BY c.id, c.name
            ORDER BY revenue DESC
          `
        : [];

    const totalRevenue = rows.reduce((sum, row) => sum + toNumber(row.revenue), 0);
    const previousTotalRevenue = previousRows.reduce((sum, row) => sum + toNumber(row.revenue), 0);
    const previousMap = buildSeriesMap(previousRows, 'categoryId');
    const result = {
      range: buildComparisonRange(resolved),
      items: rows.map(row => ({
        categoryId: row.categoryId,
        category: row.category,
        revenue: toNumber(row.revenue),
        unitsSold: toNumber(row.unitsSold),
        percentage: totalRevenue === 0 ? 0 : Number(((toNumber(row.revenue) / totalRevenue) * 100).toFixed(2)),
        previous: previousMap.has(String(row.categoryId))
          ? {
              revenue: toNumber((previousMap.get(String(row.categoryId)) as any)?.revenue),
              unitsSold: toNumber((previousMap.get(String(row.categoryId)) as any)?.unitsSold),
              percentage: previousTotalRevenue === 0
                ? 0
                : Number(
                    ((
                      toNumber((previousMap.get(String(row.categoryId)) as any)?.revenue) / previousTotalRevenue
                    ) * 100).toFixed(2)
                  ),
            }
          : null,
        comparison: {
          revenue: buildComparisonMetric(
            toNumber(row.revenue),
            previousMap.has(String(row.categoryId))
              ? toNumber((previousMap.get(String(row.categoryId)) as any)?.revenue)
              : null
          ),
          unitsSold: buildComparisonMetric(
            toNumber(row.unitsSold),
            previousMap.has(String(row.categoryId))
              ? toNumber((previousMap.get(String(row.categoryId)) as any)?.unitsSold)
              : null
          ),
        },
      })),
    };

    await redis.set(cacheKey, result, ANALYTICS_CACHE_TTL);
    return result;
  },

  getSalesByBranch: async (societyRef: string | undefined, filters?: AnalyticsFilters) => {
    const targetSocietyId = await resolveSocietyId(societyRef);
    const resolved = normalizeAnalyticsFilters(filters);
    const cacheKey = buildAnalyticsCacheKey('sales-by-branch', targetSocietyId, resolved);
    const cached = await redis.get(cacheKey);
    if (cached) return cached;

    const branchSql = buildAnalyticsBranchFilterSql('o."branchId"', resolved.branchId);
    const rows = await prisma.$queryRaw<any[]>`
      SELECT
        b.id as "branchId",
        b.name as branch,
        COALESCE(SUM(o."totalAmount"), 0) as revenue,
        COUNT(*)::int as orders,
        COALESCE(AVG(o."totalAmount"), 0) as "averageTicket"
      FROM "Order" o
      JOIN "BranchOffice" b ON o."branchId" = b.id
      WHERE o."societyId" = ${targetSocietyId}
      AND o.status = 'COMPLETED'
      AND o."orderDate" >= ${resolved.start}
      AND o."orderDate" <= ${resolved.end}
      ${branchSql}
      GROUP BY b.id, b.name
      ORDER BY revenue DESC
    `;

    const previousRows =
      resolved.comparePrevious && resolved.previousStart && resolved.previousEnd
        ? await prisma.$queryRaw<any[]>`
            SELECT
              b.id as "branchId",
              b.name as branch,
              COALESCE(SUM(o."totalAmount"), 0) as revenue,
              COUNT(*)::int as orders,
              COALESCE(AVG(o."totalAmount"), 0) as "averageTicket"
            FROM "Order" o
            JOIN "BranchOffice" b ON o."branchId" = b.id
            WHERE o."societyId" = ${targetSocietyId}
            AND o.status = 'COMPLETED'
            AND o."orderDate" >= ${resolved.previousStart}
            AND o."orderDate" <= ${resolved.previousEnd}
            ${branchSql}
            GROUP BY b.id, b.name
            ORDER BY revenue DESC
          `
        : [];

    const previousMap = buildSeriesMap(previousRows, 'branchId');
    const result = {
      range: buildComparisonRange(resolved),
      items: rows.map(row => ({
        branchId: row.branchId,
        branch: row.branch,
        revenue: toNumber(row.revenue),
        orders: toNumber(row.orders),
        averageTicket: toNumber(row.averageTicket),
        previous: previousMap.has(String(row.branchId))
          ? {
              revenue: toNumber((previousMap.get(String(row.branchId)) as any)?.revenue),
              orders: toNumber((previousMap.get(String(row.branchId)) as any)?.orders),
              averageTicket: toNumber((previousMap.get(String(row.branchId)) as any)?.averageTicket),
            }
          : null,
        comparison: {
          revenue: buildComparisonMetric(
            toNumber(row.revenue),
            previousMap.has(String(row.branchId))
              ? toNumber((previousMap.get(String(row.branchId)) as any)?.revenue)
              : null
          ),
          orders: buildComparisonMetric(
            toNumber(row.orders),
            previousMap.has(String(row.branchId))
              ? toNumber((previousMap.get(String(row.branchId)) as any)?.orders)
              : null
          ),
          averageTicket: buildComparisonMetric(
            toNumber(row.averageTicket),
            previousMap.has(String(row.branchId))
              ? toNumber((previousMap.get(String(row.branchId)) as any)?.averageTicket)
              : null
          ),
        },
      })),
    };

    await redis.set(cacheKey, result, ANALYTICS_CACHE_TTL);
    return result;
  },

  getPaymentsDistribution: async (societyRef: string | undefined, filters?: AnalyticsFilters) => {
    const targetSocietyId = await resolveSocietyId(societyRef);
    const resolved = normalizeAnalyticsFilters(filters);
    const cacheKey = buildAnalyticsCacheKey('payments-distribution', targetSocietyId, resolved);
    const cached = await redis.get(cacheKey);
    if (cached) return cached;

    const branchSql = buildAnalyticsBranchFilterSql('o."branchId"', resolved.branchId);
    const rows = await prisma.$queryRaw<any[]>`
      SELECT
        op."paymentMethod" as method,
        COALESCE(SUM(op.amount), 0) as amount,
        COUNT(*)::int as transactions
      FROM "OrderPayment" op
      LEFT JOIN "Order" o ON op."orderId" = o.id
      WHERE op."societyId" = ${targetSocietyId}
      AND op.status = 'CONFIRMED'
      AND op."paymentDate" >= ${resolved.start}
      AND op."paymentDate" <= ${resolved.end}
      ${resolved.branchId ? Prisma.sql`AND o.id IS NOT NULL ${branchSql}` : Prisma.empty}
      GROUP BY op."paymentMethod"
      ORDER BY amount DESC
    `;

    const previousRows =
      resolved.comparePrevious && resolved.previousStart && resolved.previousEnd
        ? await prisma.$queryRaw<any[]>`
            SELECT
              op."paymentMethod" as method,
              COALESCE(SUM(op.amount), 0) as amount,
              COUNT(*)::int as transactions
            FROM "OrderPayment" op
            LEFT JOIN "Order" o ON op."orderId" = o.id
            WHERE op."societyId" = ${targetSocietyId}
            AND op.status = 'CONFIRMED'
            AND op."paymentDate" >= ${resolved.previousStart}
            AND op."paymentDate" <= ${resolved.previousEnd}
            ${resolved.branchId ? Prisma.sql`AND o.id IS NOT NULL ${branchSql}` : Prisma.empty}
            GROUP BY op."paymentMethod"
            ORDER BY amount DESC
          `
        : [];

    const total = rows.reduce((sum, row) => sum + toNumber(row.amount), 0);
    const previousTotal = previousRows.reduce((sum, row) => sum + toNumber(row.amount), 0);
    const previousMap = buildSeriesMap(previousRows, 'method');
    const result = {
      range: buildComparisonRange(resolved),
      items: rows.map(row => ({
        method: row.method,
        amount: toNumber(row.amount),
        percentage: total === 0 ? 0 : Number(((toNumber(row.amount) / total) * 100).toFixed(2)),
        transactions: toNumber(row.transactions),
        previous: previousMap.has(String(row.method))
          ? {
              amount: toNumber((previousMap.get(String(row.method)) as any)?.amount),
              percentage: previousTotal === 0
                ? 0
                : Number(
                    (((toNumber((previousMap.get(String(row.method)) as any)?.amount) / previousTotal) * 100)).toFixed(2)
                  ),
              transactions: toNumber((previousMap.get(String(row.method)) as any)?.transactions),
            }
          : null,
        comparison: {
          amount: buildComparisonMetric(
            toNumber(row.amount),
            previousMap.has(String(row.method))
              ? toNumber((previousMap.get(String(row.method)) as any)?.amount)
              : null
          ),
          transactions: buildComparisonMetric(
            toNumber(row.transactions),
            previousMap.has(String(row.method))
              ? toNumber((previousMap.get(String(row.method)) as any)?.transactions)
              : null
          ),
        },
      })),
    };

    await redis.set(cacheKey, result, ANALYTICS_CACHE_TTL);
    return result;
  },

  getProductsTop: async (societyRef: string | undefined, filters?: AnalyticsFilters) => {
    const targetSocietyId = await resolveSocietyId(societyRef);
    const resolved = normalizeAnalyticsFilters(filters);
    const cacheKey = buildAnalyticsCacheKey('products-top', targetSocietyId, resolved);
    const cached = await redis.get(cacheKey);
    if (cached) return cached;

    const branchSql = buildAnalyticsBranchFilterSql('o."branchId"', resolved.branchId);
    const rows = await prisma.$queryRaw<any[]>`
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
      AND o.status = 'COMPLETED'
      AND o."orderDate" >= ${resolved.start}
      AND o."orderDate" <= ${resolved.end}
      ${branchSql}
      GROUP BY p.id, p.name, c.name, p.stock
      ORDER BY "soldUnits" DESC, revenue DESC
      LIMIT ${resolved.limit}
    `;

    const previousRows =
      resolved.comparePrevious && resolved.previousStart && resolved.previousEnd
        ? await prisma.$queryRaw<any[]>`
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
            AND o.status = 'COMPLETED'
            AND o."orderDate" >= ${resolved.previousStart}
            AND o."orderDate" <= ${resolved.previousEnd}
            ${branchSql}
            GROUP BY p.id, p.name, c.name, p.stock
            ORDER BY "soldUnits" DESC, revenue DESC
            LIMIT ${resolved.limit}
          `
        : [];

    const previousMap = buildSeriesMap(previousRows, 'productId');
    const result = {
      range: buildComparisonRange(resolved),
      items: rows.map(row => ({
        productId: row.productId,
        productName: row.productName,
        category: row.category,
        soldUnits: toNumber(row.soldUnits),
        revenue: toNumber(row.revenue),
        stockRemaining: toNumber(row.stockRemaining),
        previous: previousMap.has(String(row.productId))
          ? {
              soldUnits: toNumber((previousMap.get(String(row.productId)) as any)?.soldUnits),
              revenue: toNumber((previousMap.get(String(row.productId)) as any)?.revenue),
            }
          : null,
        comparison: {
          soldUnits: buildComparisonMetric(
            toNumber(row.soldUnits),
            previousMap.has(String(row.productId))
              ? toNumber((previousMap.get(String(row.productId)) as any)?.soldUnits)
              : null
          ),
          revenue: buildComparisonMetric(
            toNumber(row.revenue),
            previousMap.has(String(row.productId))
              ? toNumber((previousMap.get(String(row.productId)) as any)?.revenue)
              : null
          ),
        },
      })),
    };

    await redis.set(cacheKey, result, ANALYTICS_CACHE_TTL);
    return result;
  },

  getInventoryLowStock: async (societyRef: string | undefined, filters?: AnalyticsFilters) => {
    const targetSocietyId = await resolveSocietyId(societyRef);
    const resolved = normalizeAnalyticsFilters(filters);
    const cacheKey = buildAnalyticsCacheKey('inventory-low-stock', targetSocietyId, resolved);
    const cached = await redis.get(cacheKey);
    if (cached) return cached;

    const rows = await prisma.$queryRaw<any[]>`
      SELECT
        p.id as "productId",
        p.name as "productName",
        c.name as category,
        b.id as "branchId",
        b.name as "branchName",
        bop."availableStock",
        bop."physicalStock",
        COALESCE(bop."minStock", p."minStock") as "minStock",
        (COALESCE(bop."minStock", p."minStock") - bop."availableStock") as gap
      FROM "BranchOfficeProduct" bop
      JOIN "Product" p ON p.id = bop."productId"
      JOIN "Category" c ON c.id = p."categoryId"
      JOIN "BranchOffice" b ON b.id = bop."branchOfficeId"
      WHERE p."societyId" = ${targetSocietyId}
      AND bop."isDeleted" = false
      AND p."isDeleted" = false
      AND p."isActive" = true
      ${resolved.branchId ? Prisma.sql`AND bop."branchOfficeId" = ${resolved.branchId}` : Prisma.empty}
      AND bop."availableStock" <= COALESCE(bop."minStock", p."minStock")
      ORDER BY gap DESC, bop."availableStock" ASC
      LIMIT ${resolved.limit}
    `;

    const result = {
      items: rows.map(row => ({
        productId: row.productId,
        productName: row.productName,
        category: row.category,
        branchId: row.branchId,
        branchName: row.branchName,
        availableStock: toNumber(row.availableStock),
        physicalStock: toNumber(row.physicalStock),
        minStock: toNumber(row.minStock),
        gap: toNumber(row.gap),
      })),
    };

    await redis.set(cacheKey, result, ANALYTICS_CACHE_TTL);
    return result;
  },

  getInventoryLowStockTrend: async (societyRef: string | undefined, filters?: AnalyticsFilters) => {
    const targetSocietyId = await resolveSocietyId(societyRef);
    const resolved = normalizeAnalyticsFilters(filters);
    const cacheKey = buildAnalyticsCacheKey('inventory-low-stock-trend', targetSocietyId, resolved);
    const cached = await redis.get(cacheKey);
    if (cached) return cached;

    const branchFilterSql = resolved.branchId
      ? Prisma.sql`AND bop."branchOfficeId" = ${resolved.branchId}`
      : Prisma.empty;

    const stockRows = await prisma.$queryRaw<any[]>`
      SELECT
        bop."productId",
        bop."branchOfficeId" as "branchId",
        bop."physicalStock",
        COALESCE(bop."minStock", p."minStock") as "minStock",
        bop."createdAt"
      FROM "BranchOfficeProduct" bop
      JOIN "Product" p ON p.id = bop."productId"
      WHERE p."societyId" = ${targetSocietyId}
      AND bop."isDeleted" = false
      AND p."isDeleted" = false
      AND p."isActive" = true
      ${branchFilterSql}
    `;

    const maxDateTo = resolved.comparePrevious && resolved.previousDateTo && resolved.previousDateTo > resolved.dateTo
      ? resolved.previousDateTo
      : resolved.dateTo;
    const maxEndUtc = convertLimaDateRangeToUTC(maxDateTo, maxDateTo).to!;

    const transactionRows = await prisma.$queryRaw<any[]>`
      SELECT
        it."productId",
        it."branchOfficeId" as "branchId",
        it.date,
        it."newStock"
      FROM "InventoryTransaction" it
      JOIN "Product" p ON p.id = it."productId"
      WHERE p."societyId" = ${targetSocietyId}
      AND it.date <= ${maxEndUtc}
      ${resolved.branchId ? Prisma.sql`AND it."branchOfficeId" = ${resolved.branchId}` : Prisma.empty}
      ORDER BY it."productId", it."branchOfficeId", it.date
    `;

    const transactionMap = new Map<string, Array<{ date: number; newStock: number }>>();
    for (const row of transactionRows) {
      const key = `${row.productId}:${row.branchId}`;
      const entries = transactionMap.get(key) ?? [];
      entries.push({
        date: new Date(row.date).getTime(),
        newStock: toNumber(row.newStock),
      });
      transactionMap.set(key, entries);
    }

    const countLowStockAt = (bucketEnd: Date) => {
      const bucketEndTime = bucketEnd.getTime();
      let lowStockCount = 0;
      let criticalCount = 0;

      for (const row of stockRows) {
        const key = `${row.productId}:${row.branchId}`;
        const transactions = transactionMap.get(key) ?? [];
        let stockAtBucket: number | null = null;

        for (let index = transactions.length - 1; index >= 0; index -= 1) {
          if (transactions[index].date <= bucketEndTime) {
            stockAtBucket = transactions[index].newStock;
            break;
          }
        }

        if (stockAtBucket === null) {
          const createdAtTime = new Date(row.createdAt).getTime();
          if (createdAtTime <= bucketEndTime) {
            stockAtBucket = toNumber(row.physicalStock);
          }
        }

        if (stockAtBucket === null) continue;

        const minStock = toNumber(row.minStock);
        if (stockAtBucket <= minStock) {
          lowStockCount += 1;
        }
        if (stockAtBucket <= 0) {
          criticalCount += 1;
        }
      }

      return { lowStockCount, criticalCount };
    };

    const labels = enumeratePeriodLabels(resolved.dateFrom, resolved.dateTo, resolved.granularity);
    const series = labels.map(label => ({
      label,
      ...countLowStockAt(getBucketEndUtc(label, resolved.granularity, resolved.dateTo)),
    }));

    let previousPeriod: Array<{ label: string; lowStockCount: number; criticalCount: number }> = [];
    let previousPeriodAligned: Array<{
      label: string;
      sourceLabel: string | null;
      lowStockCount: number;
      criticalCount: number;
    }> = [];
    if (resolved.comparePrevious && resolved.previousDateFrom && resolved.previousDateTo) {
      const previousLabels = enumeratePeriodLabels(
        resolved.previousDateFrom,
        resolved.previousDateTo,
        resolved.granularity
      );
      previousPeriod = previousLabels.map(label => ({
        label,
        ...countLowStockAt(getBucketEndUtc(label, resolved.granularity, resolved.previousDateTo!)),
      }));
      previousPeriodAligned = buildAlignedMetricPeriod(series, previousPeriod, {
        lowStockCount: 0,
        criticalCount: 0,
      });
    }

    const result = {
      range: buildComparisonRange(resolved),
      series,
      previousPeriod,
      previousPeriodAligned,
    };

    await redis.set(cacheKey, result, ANALYTICS_CACHE_TTL);
    return result;
  },
};
