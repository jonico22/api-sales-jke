import { Request } from 'express';
import { ZodType, ZodError } from 'zod';

type SafeParseResult =
  | { success: true }
  | { success: false; error: ZodError };

export const formatSafeParseErrors = (...results: SafeParseResult[]) => {
  return results.reduce<Record<string, unknown>>((acc, result) => {
    if (!result.success) {
      Object.assign(acc, result.error.format());
    }
    return acc;
  }, {});
};

export const getQueryString = (req: Request, ...keys: string[]) => {
  for (const key of keys) {
    const value = req.query[key];
    if (typeof value === 'string' && value.length > 0) {
      return value;
    }
  }

  return undefined;
};
