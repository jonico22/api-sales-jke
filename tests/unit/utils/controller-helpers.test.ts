import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { formatSafeParseErrors, getQueryString } from '@/utils/controller-helpers';

describe('controller-helpers', () => {
  it('merges formatted safeParse errors', () => {
    const pageSchema = z.object({ query: z.object({ page: z.coerce.number().min(1) }) });
    const filterSchema = z.object({ query: z.object({ search: z.string() }) });

    const pageParse = pageSchema.safeParse({ query: { page: 0 } });
    const filterParse = filterSchema.safeParse({ query: { search: 123 } });

    const result = formatSafeParseErrors(pageParse as any, filterParse as any);

    expect(result).toHaveProperty('query');
  });

  it('returns the first string query value present', () => {
    const req: any = {
      query: {
        societyId: 'soc-id',
        societyCode: 'SOC1',
      },
    };

    expect(getQueryString(req, 'societyCode', 'societyId')).toBe('SOC1');
    expect(getQueryString(req, 'missing', 'societyId')).toBe('soc-id');
    expect(getQueryString({ query: {} } as any, 'societyCode')).toBeUndefined();
  });
});
