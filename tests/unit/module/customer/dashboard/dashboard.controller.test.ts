import { beforeEach, describe, expect, it, vi } from 'vitest';

const { dashboardServiceMock } = vi.hoisted(() => ({
  dashboardServiceMock: {
    getStats: vi.fn(),
    getOverview: vi.fn(),
    getAlertsLowStock: vi.fn(),
    getCatalogSummary: vi.fn(),
  },
}));

vi.mock('@/module/customer/dashboard/dashboard.service', () => ({
  DashboardService: dashboardServiceMock,
}));

import { DashboardController } from '@/module/customer/dashboard/dashboard.controller';

const flushAsyncHandler = async () => {
  await new Promise(resolve => setTimeout(resolve, 0));
};

const createResponse = () => {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
};

describe('DashboardController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 when society context is missing', async () => {
    const req: any = { query: {} };
    const res = createResponse();
    const next = vi.fn();

    await DashboardController.getStats(req, res as any, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(dashboardServiceMock.getStats).not.toHaveBeenCalled();
  });

  it('returns stats successfully', async () => {
    dashboardServiceMock.getStats.mockResolvedValueOnce({ salesToday: 10 });
    const req: any = { query: { societyCode: 'SOC1' } };
    const res = createResponse();
    const next = vi.fn();

    await DashboardController.getStats(req, res as any, next);
    await flushAsyncHandler();

    expect(dashboardServiceMock.getStats).toHaveBeenCalledWith('SOC1', {});
    expect(res.json).toHaveBeenCalledWith({ salesToday: 10 });
  });

  it('passes explicit stats date range filters', async () => {
    dashboardServiceMock.getStats.mockResolvedValueOnce({ salesThisMonth: 100 });
    const req: any = {
      query: {
        societyCode: 'SOC1',
        dateFrom: '2026-03-01',
        dateTo: '2026-03-31',
        branchId: 'branch-1',
      },
    };
    const res = createResponse();
    const next = vi.fn();

    await DashboardController.getStats(req, res as any, next);
    await flushAsyncHandler();

    expect(dashboardServiceMock.getStats).toHaveBeenCalledWith('SOC1', {
      branchId: 'branch-1',
      dateFrom: '2026-03-01',
      dateTo: '2026-03-31',
    });
    expect(res.json).toHaveBeenCalledWith({ salesThisMonth: 100 });
  });

  it('returns overview successfully', async () => {
    dashboardServiceMock.getOverview.mockResolvedValueOnce({ salesTrend: [] });
    const req: any = {
      query: {
        societyCode: 'SOC1',
        branchId: 'branch-1',
        dateFrom: '2026-04-01',
        dateTo: '2026-04-15',
        granularity: 'day',
        limit: '6',
      },
    };
    const res = createResponse();
    const next = vi.fn();

    await DashboardController.getOverview(req, res as any, next);
    await flushAsyncHandler();

    expect(dashboardServiceMock.getOverview).toHaveBeenCalledWith('SOC1', {
      branchId: 'branch-1',
      dateFrom: '2026-04-01',
      dateTo: '2026-04-15',
      granularity: 'day',
      limit: 6,
    });
    expect(res.json).toHaveBeenCalledWith({ salesTrend: [] });
  });

  it('returns low stock alerts successfully', async () => {
    dashboardServiceMock.getAlertsLowStock.mockResolvedValueOnce({ count: 1, items: [] });
    const req: any = { query: { societyId: '550e8400-e29b-41d4-a716-446655440000', branchId: 'branch-1' } };
    const res = createResponse();
    const next = vi.fn();

    await DashboardController.getAlertsLowStock(req, res as any, next);
    await flushAsyncHandler();

    expect(dashboardServiceMock.getAlertsLowStock).toHaveBeenCalledWith(
      '550e8400-e29b-41d4-a716-446655440000',
      { branchId: 'branch-1' }
    );
    expect(res.json).toHaveBeenCalledWith({ count: 1, items: [] });
  });

  it('returns catalog summary successfully', async () => {
    dashboardServiceMock.getCatalogSummary.mockResolvedValueOnce({ totalStockValue: 10 });
    const req: any = { query: { societyCode: 'SOC1' } };
    const res = createResponse();
    const next = vi.fn();

    await DashboardController.getCatalogSummary(req, res as any, next);
    await flushAsyncHandler();

    expect(dashboardServiceMock.getCatalogSummary).toHaveBeenCalledWith('SOC1', {});
    expect(res.json).toHaveBeenCalledWith({ totalStockValue: 10 });
  });
});
