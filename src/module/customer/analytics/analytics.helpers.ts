import { Prisma } from '@prisma/client';
import { formatInTimeZone } from 'date-fns-tz';
import { convertLimaDateRangeToUTC, convertLimaTimeToUTC } from '@/utils/dateFormatter';
import { ValidationAppError } from '@/utils/domain-errors';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
export type AnalyticsGranularity = 'day' | 'week' | 'month';

export interface AnalyticsFilters {
  branchId?: string;
  dateFrom?: string;
  dateTo?: string;
  granularity?: AnalyticsGranularity;
  comparePrevious?: boolean;
  limit?: number;
}

export interface ResolvedAnalyticsFilters {
  branchId?: string;
  dateFrom: string;
  dateTo: string;
  granularity: AnalyticsGranularity;
  comparePrevious: boolean;
  limit: number;
  start: Date;
  end: Date;
  previousDateFrom?: string;
  previousDateTo?: string;
  previousStart?: Date;
  previousEnd?: Date;
}

const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const LIMA_TIMEZONE = 'America/Lima';

const parseDateOnlyAsLimaUtc = (date: string) => convertLimaTimeToUTC(`${date}T00:00:00`);
const formatLimaDateKey = (date: Date) => formatInTimeZone(date, LIMA_TIMEZONE, 'yyyy-MM-dd');
const addDays = (date: Date, days: number) => {
  const clone = new Date(date);
  clone.setUTCDate(clone.getUTCDate() + days);
  return clone;
};
const addMonths = (date: Date, months: number) => {
  const clone = new Date(date);
  clone.setUTCMonth(clone.getUTCMonth() + months, 1);
  return clone;
};
const startOfWeek = (date: Date) => {
  const clone = new Date(date);
  const day = clone.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  clone.setUTCDate(clone.getUTCDate() + diff);
  return clone;
};
const startOfMonth = (date: Date) => {
  const clone = new Date(date);
  clone.setUTCDate(1);
  return clone;
};

export const validateDateOnly = (value: string, fieldName: string) => {
  if (!DATE_ONLY_REGEX.test(value)) {
    throw new ValidationAppError(`${fieldName} must use YYYY-MM-DD format`, { [fieldName]: value });
  }
};

const normalizeDateRange = (dateFrom?: string, dateTo?: string) => {
  if (dateFrom) validateDateOnly(dateFrom, 'dateFrom');
  if (dateTo) validateDateOnly(dateTo, 'dateTo');

  if (!dateFrom && !dateTo) {
    const end = formatLimaDateKey(new Date());
    const start = formatLimaDateKey(addDays(parseDateOnlyAsLimaUtc(end), -29));
    return { dateFrom: start, dateTo: end };
  }

  if (dateFrom && !dateTo) return { dateFrom, dateTo: dateFrom };
  if (!dateFrom && dateTo) return { dateFrom: dateTo, dateTo };
  return { dateFrom: dateFrom!, dateTo: dateTo! };
};

export const getRangeLengthInDays = (dateFrom: string, dateTo: string) => {
  const start = parseDateOnlyAsLimaUtc(dateFrom);
  const end = parseDateOnlyAsLimaUtc(dateTo);
  return Math.floor((end.getTime() - start.getTime()) / MS_PER_DAY) + 1;
};

const resolveGranularity = (granularity: AnalyticsGranularity | undefined, rangeDays: number): AnalyticsGranularity => {
  if (granularity) return granularity;
  if (rangeDays <= 31) return 'day';
  if (rangeDays <= 180) return 'week';
  return 'month';
};

export const normalizeAnalyticsFilters = (filters?: AnalyticsFilters): ResolvedAnalyticsFilters => {
  const normalized = normalizeDateRange(filters?.dateFrom, filters?.dateTo);
  const rangeDays = getRangeLengthInDays(normalized.dateFrom, normalized.dateTo);

  if (rangeDays <= 0) {
    throw new ValidationAppError('dateFrom must be before or equal to dateTo', normalized);
  }
  if (rangeDays > 366) {
    throw new ValidationAppError('Date range cannot exceed 366 days', normalized);
  }
  if (
    filters?.granularity !== undefined &&
    filters.granularity !== 'day' &&
    filters.granularity !== 'week' &&
    filters.granularity !== 'month'
  ) {
    throw new ValidationAppError('granularity must be day, week or month', { granularity: filters.granularity });
  }

  const granularity = resolveGranularity(filters?.granularity, rangeDays);
  const limit = filters?.limit ?? 5;
  if (!Number.isInteger(limit) || limit < 1 || limit > 20) {
    throw new ValidationAppError('limit must be an integer between 1 and 20', { limit });
  }

  const { from, to } = convertLimaDateRangeToUTC(normalized.dateFrom, normalized.dateTo);
  const resolved: ResolvedAnalyticsFilters = {
    branchId: filters?.branchId,
    dateFrom: normalized.dateFrom,
    dateTo: normalized.dateTo,
    granularity,
    comparePrevious: filters?.comparePrevious ?? false,
    limit,
    start: from!,
    end: to!,
  };

  if (resolved.comparePrevious) {
    const previousEndDate = addDays(parseDateOnlyAsLimaUtc(resolved.dateFrom), -1);
    const previousStartDate = addDays(previousEndDate, -(rangeDays - 1));
    resolved.previousDateFrom = formatLimaDateKey(previousStartDate);
    resolved.previousDateTo = formatLimaDateKey(previousEndDate);
    const previousRange = convertLimaDateRangeToUTC(resolved.previousDateFrom, resolved.previousDateTo);
    resolved.previousStart = previousRange.from!;
    resolved.previousEnd = previousRange.to!;
  }

  return resolved;
};

export const buildAnalyticsCacheKey = (metric: string, societyId: string, filters: ResolvedAnalyticsFilters) =>
  [
    'analytics',
    metric,
    societyId,
    filters.branchId || 'all',
    filters.dateFrom,
    filters.dateTo,
    filters.granularity,
    filters.comparePrevious ? 'compare' : 'current',
    filters.limit,
  ].join(':');

export const buildAnalyticsBranchFilterSql = (columnName: string, branchId?: string) =>
  branchId ? Prisma.sql` AND ${Prisma.raw(columnName)} = ${branchId}` : Prisma.empty;

export const getDateBucketSql = (columnName: string, granularity: AnalyticsGranularity) => {
  const limaColumn = `timezone('America/Lima', timezone('UTC', ${columnName}))`;
  if (granularity === 'day') {
    return Prisma.sql`to_char(date_trunc('day', ${Prisma.raw(limaColumn)}), 'YYYY-MM-DD')`;
  }
  if (granularity === 'week') {
    return Prisma.sql`to_char(date_trunc('week', ${Prisma.raw(limaColumn)}), 'YYYY-MM-DD')`;
  }
  return Prisma.sql`to_char(date_trunc('month', ${Prisma.raw(limaColumn)}), 'YYYY-MM')`;
};

export const enumeratePeriodLabels = (dateFrom: string, dateTo: string, granularity: AnalyticsGranularity) => {
  const start = parseDateOnlyAsLimaUtc(dateFrom);
  const end = parseDateOnlyAsLimaUtc(dateTo);

  if (granularity === 'day') {
    const labels: string[] = [];
    for (let current = new Date(start); current <= end; current = addDays(current, 1)) {
      labels.push(formatLimaDateKey(current));
    }
    return labels;
  }

  if (granularity === 'week') {
    const labels: string[] = [];
    for (let current = startOfWeek(start); current <= end; current = addDays(current, 7)) {
      labels.push(formatLimaDateKey(current));
    }
    return labels;
  }

  const labels: string[] = [];
  for (let current = startOfMonth(start); current <= end; current = addMonths(current, 1)) {
    labels.push(current.toISOString().slice(0, 7));
  }
  return labels;
};

export const calculatePercentageChange = (current: number, previous: number) => {
  if (previous === 0) return current === 0 ? 0 : 100;
  return Number((((current - previous) / previous) * 100).toFixed(2));
};
