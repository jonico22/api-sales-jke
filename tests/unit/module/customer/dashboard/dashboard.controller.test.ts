import { beforeEach, describe, expect, it, vi } from 'vitest';

const { dashboardServiceMock } = vi.hoisted(() => ({
  dashboardServiceMock: {
    getStats: vi.fn(),
    getSalesPerformance: vi.fn(),
    getRevenueByCategory: vi.fn(),
    getTopProducts: vi.fn(),
    getPaymentMethods: vi.fn(),
    getCashFlow: vi.fn(),
    getBranchPerformance: vi.fn(),
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
    dashboardServiceMock.getStats.mockResolvedValueOnce({ totalStockValue: 10 });
    const req: any = { query: { societyCode: 'SOC1' } };
    const res = createResponse();
    const next = vi.fn();

    await DashboardController.getStats(req, res as any, next);
    await flushAsyncHandler();

    expect(dashboardServiceMock.getStats).toHaveBeenCalledWith('SOC1');
    expect(res.json).toHaveBeenCalledWith({ totalStockValue: 10 });
  });

  it('returns payment methods successfully', async () => {
    dashboardServiceMock.getPaymentMethods.mockResolvedValueOnce([{ method: 'CASH', value: 10 }]);
    const req: any = { query: { societyId: '550e8400-e29b-41d4-a716-446655440000' } };
    const res = createResponse();
    const next = vi.fn();

    await DashboardController.getPaymentMethods(req, res as any, next);
    await flushAsyncHandler();

    expect(dashboardServiceMock.getPaymentMethods).toHaveBeenCalledWith(
      '550e8400-e29b-41d4-a716-446655440000'
    );
    expect(res.json).toHaveBeenCalledWith([{ method: 'CASH', value: 10 }]);
  });
});
