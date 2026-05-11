import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

const { loggerMock, envsMock } = vi.hoisted(() => ({
  loggerMock: {
    error: vi.fn(),
  },
  envsMock: {
    isProd: false,
  },
}));

vi.mock('@/config/logger', () => ({
  default: loggerMock,
}));

vi.mock('@/config/envs', () => ({
  envs: envsMock,
}));

import { AppError } from '@/utils/AppError';
import { globalErrorHandler } from '@/utils/errorHandler';

const createResponse = () => {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
};

describe('globalErrorHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    envsMock.isProd = false;
  });

  it('returns structured output for AppError instances', () => {
    const err = new AppError('Not found', 404, 'NOT_FOUND', { id: '123' });
    const req: any = { originalUrl: '/api/orders/123', method: 'GET' };
    const res = createResponse();

    globalErrorHandler(err, req, res as any, vi.fn());

    expect(loggerMock.error).toHaveBeenCalledWith(expect.objectContaining({
      code: 'NOT_FOUND',
      msg: 'Not found',
      path: '/api/orders/123',
      method: 'GET',
      details: { id: '123' },
    }));
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      status: 'fail',
      code: 'NOT_FOUND',
      message: 'Not found',
      details: { id: '123' },
    }));
  });

  it('normalizes unknown errors as internal server errors', () => {
    const err = new Error('boom');
    const req: any = { originalUrl: '/api/test', method: 'POST' };
    const res = createResponse();

    globalErrorHandler(err, req, res as any, vi.fn());

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      status: 'error',
      code: undefined,
      message: 'boom',
    }));
  });

  it('returns validation payload for Zod errors', () => {
    const schema = z.object({ body: z.object({ name: z.string() }) });
    const parsed = schema.safeParse({ body: {} });
    if (parsed.success) throw new Error('Expected Zod parse to fail');

    const req: any = { originalUrl: '/api/test', method: 'POST' };
    const res = createResponse();

    globalErrorHandler(parsed.error, req, res as any, vi.fn());

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      status: 'fail',
      code: 'VALIDATION_ERROR',
      message: 'Validation Error',
      details: expect.any(Array),
    }));
  });

  it('hides stack traces in production', () => {
    envsMock.isProd = true;
    const err = new AppError('Forbidden', 403, 'FORBIDDEN');
    const req: any = { originalUrl: '/api/secure', method: 'GET' };
    const res = createResponse();

    globalErrorHandler(err, req, res as any, vi.fn());

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      stack: undefined,
    }));
  });
});
