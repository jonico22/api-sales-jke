import { describe, expect, it, vi } from 'vitest';

import { asyncHandler } from '@/utils/asyncHandler';

const flushAsyncHandler = async () => {
  await new Promise(resolve => setTimeout(resolve, 0));
};

describe('asyncHandler', () => {
  it('delegates async errors to next', async () => {
    const error = new Error('async boom');
    const next = vi.fn();
    const handler = asyncHandler(async () => {
      throw error;
    });

    handler({} as any, {} as any, next);
    await flushAsyncHandler();

    expect(next).toHaveBeenCalledWith(error);
  });

  it('delegates sync errors to next', async () => {
    const error = new Error('sync boom');
    const next = vi.fn();
    const handler = asyncHandler(() => {
      throw error;
    });

    handler({} as any, {} as any, next);
    await flushAsyncHandler();

    expect(next).toHaveBeenCalledWith(error);
  });
});
