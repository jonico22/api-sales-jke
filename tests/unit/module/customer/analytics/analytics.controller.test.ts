import { beforeEach, describe, expect, it, vi } from 'vitest';

const { analyticsServiceMock } = vi.hoisted(() => ({
  analyticsServiceMock: {
    getSummary: vi.fn(),
    getSalesTrend: vi.fn(),
    getCashFlowTrend: vi.fn(),
    getSalesByCategory: vi.fn(),
    getSalesByBranch: vi.fn(),
    getPaymentsDistribution: vi.fn(),
    getProductsTop: vi.fn(),
    getInventoryLowStock: vi.fn(),
    getInventoryLowStockTrend: vi.fn(),
  },
}));

vi.mock('@/module/customer/analytics/analytics.service', () => ({
  AnalyticsService: analyticsServiceMock,
}));

import { AnalyticsController } from '@/module/customer/analytics/analytics.controller';

const flushAsyncHandler = async () => {
  await new Promise(resolve => setTimeout(resolve, 0));
};

const createResponse = () => {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
};

describe('AnalyticsController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 when society context is missing', async () => {
    const req: any = { query: {} };
    const res = createResponse();
    const next = vi.fn();

    await AnalyticsController.getSummary(req, res as any, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(analyticsServiceMock.getSummary).not.toHaveBeenCalled();
  });

  it('passes analytics filters to sales trend', async () => {
    analyticsServiceMock.getSalesTrend.mockResolvedValueOnce({ series: [] });
    const req: any = {
      query: {
        societyCode: 'SOC1',
        branchId: 'branch-1',
        dateFrom: '2026-04-01',
        dateTo: '2026-04-30',
        granularity: 'week',
        comparePrevious: 'true',
        limit: '10',
      },
    };
    const res = createResponse();
    const next = vi.fn();

    await AnalyticsController.getSalesTrend(req, res as any, next);
    await flushAsyncHandler();

    expect(analyticsServiceMock.getSalesTrend).toHaveBeenCalledWith('SOC1', {
      branchId: 'branch-1',
      dateFrom: '2026-04-01',
      dateTo: '2026-04-30',
      granularity: 'week',
      comparePrevious: true,
      limit: 10,
    });
    expect(res.json).toHaveBeenCalledWith({ series: [] });
  });

  it('returns products top successfully', async () => {
    analyticsServiceMock.getProductsTop.mockResolvedValueOnce({ items: [] });
    const req: any = { query: { societyId: '550e8400-e29b-41d4-a716-446655440000', limit: '3' } };
    const res = createResponse();
    const next = vi.fn();

    await AnalyticsController.getProductsTop(req, res as any, next);
    await flushAsyncHandler();

    expect(analyticsServiceMock.getProductsTop).toHaveBeenCalledWith(
      '550e8400-e29b-41d4-a716-446655440000',
      { limit: 3 }
    );
    expect(res.json).toHaveBeenCalledWith({ items: [] });
  });

  it('passes analytics filters to low stock trend', async () => {
    analyticsServiceMock.getInventoryLowStockTrend.mockResolvedValueOnce({ series: [] });
    const req: any = {
      query: {
        societyCode: 'SOC1',
        dateFrom: '2026-03-01',
        dateTo: '2026-04-30',
        granularity: 'month',
        comparePrevious: 'true',
      },
    };
    const res = createResponse();
    const next = vi.fn();

    await AnalyticsController.getInventoryLowStockTrend(req, res as any, next);
    await flushAsyncHandler();

    expect(analyticsServiceMock.getInventoryLowStockTrend).toHaveBeenCalledWith('SOC1', {
      dateFrom: '2026-03-01',
      dateTo: '2026-04-30',
      granularity: 'month',
      comparePrevious: true,
    });
    expect(res.json).toHaveBeenCalledWith({ series: [] });
  });
});
