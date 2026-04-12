import { Prisma } from '@prisma/client';
import prisma from '@/config/prisma';
import { redis } from '@/config/redis';
import { NotFoundAppError, ValidationAppError } from '@/utils/domain-errors';
import {
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
      range: {
        dateFrom: resolved.dateFrom,
        dateTo: resolved.dateTo,
        granularity: resolved.granularity,
      },
      totals,
      comparison: previousTotals
        ? {
            salesPct: calculatePercentageChange(totals.sales, previousTotals.sales),
            ordersPct: calculatePercentageChange(totals.orders, previousTotals.orders),
            averageTicketPct: calculatePercentageChange(totals.averageTicket, previousTotals.averageTicket),
          }
        : { salesPct: null, ordersPct: null, averageTicketPct: null },
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
    }

    const result = {
      range: {
        dateFrom: resolved.dateFrom,
        dateTo: resolved.dateTo,
        granularity: resolved.granularity,
      },
      series,
      previousPeriod,
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

    const result = {
      range: {
        dateFrom: resolved.dateFrom,
        dateTo: resolved.dateTo,
        granularity: resolved.granularity,
      },
      series,
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

    const totalRevenue = rows.reduce((sum, row) => sum + toNumber(row.revenue), 0);
    const result = {
      range: { dateFrom: resolved.dateFrom, dateTo: resolved.dateTo },
      items: rows.map(row => ({
        categoryId: row.categoryId,
        category: row.category,
        revenue: toNumber(row.revenue),
        unitsSold: toNumber(row.unitsSold),
        percentage: totalRevenue === 0 ? 0 : Number(((toNumber(row.revenue) / totalRevenue) * 100).toFixed(2)),
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

    const result = {
      range: { dateFrom: resolved.dateFrom, dateTo: resolved.dateTo },
      items: rows.map(row => ({
        branchId: row.branchId,
        branch: row.branch,
        revenue: toNumber(row.revenue),
        orders: toNumber(row.orders),
        averageTicket: toNumber(row.averageTicket),
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

    const total = rows.reduce((sum, row) => sum + toNumber(row.amount), 0);
    const result = {
      range: { dateFrom: resolved.dateFrom, dateTo: resolved.dateTo },
      items: rows.map(row => ({
        method: row.method,
        amount: toNumber(row.amount),
        percentage: total === 0 ? 0 : Number(((toNumber(row.amount) / total) * 100).toFixed(2)),
        transactions: toNumber(row.transactions),
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

    const result = {
      range: { dateFrom: resolved.dateFrom, dateTo: resolved.dateTo },
      items: rows.map(row => ({
        productId: row.productId,
        productName: row.productName,
        category: row.category,
        soldUnits: toNumber(row.soldUnits),
        revenue: toNumber(row.revenue),
        stockRemaining: toNumber(row.stockRemaining),
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
};
