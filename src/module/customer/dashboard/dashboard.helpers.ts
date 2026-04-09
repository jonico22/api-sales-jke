import { Prisma } from '@prisma/client';
import { convertLimaDateRangeToUTC } from '@/utils/dateFormatter';
import { ValidationAppError } from '@/utils/domain-errors';

export interface DashboardFilters {
  month?: number;
  year?: number;
  branchId?: string;
}

export const normalizeDashboardFilters = (filters?: DashboardFilters): DashboardFilters => {
  if (!filters) {
    return {};
  }

  if (filters.month !== undefined && (!Number.isInteger(filters.month) || filters.month < 1 || filters.month > 12)) {
    throw new ValidationAppError('Month must be an integer between 1 and 12', { month: filters.month });
  }

  if (filters.year !== undefined && (!Number.isInteger(filters.year) || filters.year < 2000 || filters.year > 2100)) {
    throw new ValidationAppError('Year must be an integer between 2000 and 2100', { year: filters.year });
  }

  return filters;
};

export const buildDashboardCacheKey = (
  metric: string,
  societyId: string,
  filters?: DashboardFilters
) =>
  [
    'dashboard',
    metric,
    societyId,
    filters?.year || 'all',
    filters?.month || 'all',
    filters?.branchId || 'all',
  ].join(':');

export const getDashboardMonthRange = (filters?: DashboardFilters) => {
  const now = new Date();
  const year = filters?.year ?? now.getFullYear();
  const month = filters?.month ?? now.getMonth() + 1;
  const lastDay = new Date(year, month, 0).getDate();

  const { from, to } = convertLimaDateRangeToUTC(
    `${year}-${String(month).padStart(2, '0')}-01`,
    `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
  );

  return {
    year,
    month,
    start: from!,
    end: to!,
  };
};

export const getDashboardYearRange = (filters?: DashboardFilters) => {
  const year = filters?.year ?? new Date().getFullYear();
  const { from, to } = convertLimaDateRangeToUTC(`${year}-01-01`, `${year}-12-31`);

  return {
    year,
    start: from!,
    end: to!,
  };
};

export const buildBranchFilterSql = (columnName: string, branchId?: string) =>
  branchId ? Prisma.sql` AND ${Prisma.raw(columnName)} = ${branchId}` : Prisma.empty;
