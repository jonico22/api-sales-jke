import { describe, expect, it } from 'vitest';
import {
  buildAlignedPreviousPeriod,
  buildAnalyticsCacheKey,
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

  it('calculates previous full months when comparePrevious is enabled for monthly granularity', () => {
    const result = normalizeAnalyticsFilters({
      dateFrom: '2026-03-01',
      dateTo: '2026-04-30',
      granularity: 'month',
      comparePrevious: true,
    });

    expect(result.previousDateFrom).toBe('2026-01-01');
    expect(result.previousDateTo).toBe('2026-02-28');
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

  it('builds analytics cache keys with the current cache version', () => {
    const filters = normalizeAnalyticsFilters({
      dateFrom: '2026-03-01',
      dateTo: '2026-04-30',
      granularity: 'month',
      comparePrevious: true,
      limit: 5,
    });

    expect(buildAnalyticsCacheKey('sales-trend', 'soc-1', filters)).toBe(
      'analytics:sales-trend:v2:soc-1:all:2026-03-01:2026-04-30:month:compare:5'
    );
  });

  it('aligns previous period values to the visible labels for chart rendering', () => {
    expect(
      buildAlignedPreviousPeriod(
        [
          { label: '2026-03', sales: 25349 },
          { label: '2026-04', sales: 2035 },
        ],
        [
          { label: '2026-01', sales: 0 },
          { label: '2026-02', sales: 1200 },
        ]
      )
    ).toEqual([
      { label: '2026-03', sourceLabel: '2026-02', sales: 1200 },
      { label: '2026-04', sourceLabel: '2026-03', sales: 25349 },
    ]);
  });

  it('computes percentage change safely', () => {
    expect(calculatePercentageChange(100, 0)).toBe(100);
    expect(calculatePercentageChange(0, 0)).toBe(0);
    expect(calculatePercentageChange(120, 100)).toBe(20);
  });
});
