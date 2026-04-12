import { describe, expect, it } from 'vitest';
import {
  calculatePercentageChange,
  enumeratePeriodLabels,
  normalizeAnalyticsFilters,
} from '@/module/customer/analytics/analytics.helpers';

describe('analytics.helpers', () => {
  it('defaults to last 30 days and day granularity', () => {
    const result = normalizeAnalyticsFilters();

    expect(result.limit).toBe(5);
    expect(result.comparePrevious).toBe(false);
    expect(result.granularity).toBe('day');
  });

  it('calculates previous period when comparePrevious is enabled', () => {
    const result = normalizeAnalyticsFilters({
      dateFrom: '2026-04-10',
      dateTo: '2026-04-16',
      comparePrevious: true,
    });

    expect(result.previousDateFrom).toBe('2026-04-03');
    expect(result.previousDateTo).toBe('2026-04-09');
  });

  it('enumerates period labels for weeks', () => {
    expect(enumeratePeriodLabels('2026-04-01', '2026-04-30', 'week')).toEqual([
      '2026-03-30',
      '2026-04-06',
      '2026-04-13',
      '2026-04-20',
      '2026-04-27',
    ]);
  });

  it('computes percentage change safely', () => {
    expect(calculatePercentageChange(100, 0)).toBe(100);
    expect(calculatePercentageChange(0, 0)).toBe(0);
    expect(calculatePercentageChange(120, 100)).toBe(20);
  });
});
