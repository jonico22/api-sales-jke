import { beforeEach, describe, expect, it, vi } from 'vitest';

const { currencyServiceMock } = vi.hoisted(() => ({
  currencyServiceMock: {
    getAll: vi.fn(),
    getForSelect: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock('@/module/customer/currency/currency.service', () => ({
  CurrencyService: currencyServiceMock,
}));

import { CurrencyController } from '@/module/customer/currency/currency.controller';

const flushAsyncHandler = async () => {
  await new Promise(resolve => setTimeout(resolve, 0));
};

const createResponse = () => {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
};

describe('CurrencyController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 when getAll receives invalid query params', async () => {
    const req: any = { query: { search: 123 } };
    const res = createResponse();
    const next = vi.fn();

    await CurrencyController.getAll(req, res as any, next);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns currencies for select', async () => {
    currencyServiceMock.getForSelect.mockResolvedValueOnce([{ id: 'PEN' }]);
    const req: any = { query: { societyCode: 'SOC1' } };
    const res = createResponse();
    const next = vi.fn();

    await CurrencyController.getForSelect(req, res as any, next);
    await flushAsyncHandler();

    expect(currencyServiceMock.getForSelect).toHaveBeenCalledWith('SOC1');
    expect(res.json).toHaveBeenCalledWith([{ id: 'PEN' }]);
  });

  it('creates a currency successfully', async () => {
    currencyServiceMock.create.mockResolvedValueOnce({ id: 'currency-1' });
    const req: any = { body: { name: 'Sol', code: 'PEN', symbol: 'S/' } };
    const res = createResponse();
    const next = vi.fn();

    await CurrencyController.create(req, res as any, next);
    await flushAsyncHandler();

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({ id: 'currency-1' });
  });
});
