import { describe, expect, it } from 'vitest';

import { AppError } from '@/utils/AppError';

describe('AppError', () => {
  it('creates an operational error with status code', () => {
    const error = new AppError('Not found', 404);

    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe('Not found');
    expect(error.statusCode).toBe(404);
    expect(error.isOperational).toBe(true);
  });
});
