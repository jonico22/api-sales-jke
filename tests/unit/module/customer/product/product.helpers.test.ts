import { describe, expect, it, vi } from 'vitest';

const { prismaMock, dateFormatterMock } = vi.hoisted(() => ({
  prismaMock: {
    product: {
      fields: {
        minStock: Symbol('minStock'),
      },
    },
  },
  dateFormatterMock: {
    convertLimaDateRangeToUTC: vi.fn(() => ({})),
  },
}));

vi.mock('@/config/prisma', () => ({
  default: prismaMock,
}));

vi.mock('@/utils/dateFormatter', () => ({
  convertLimaDateRangeToUTC: dateFormatterMock.convertLimaDateRangeToUTC,
}));

import { buildProductWhereClause } from '@/module/customer/product/product.helpers';

describe('product.helpers', () => {
  it('builds search filters by individual terms instead of requiring the full phrase', () => {
    const whereClause = buildProductWhereClause('soc-1', {
      search: 'coca cola',
    });

    expect(whereClause).toMatchObject({
      isDeleted: false,
      societyId: 'soc-1',
      AND: [
        {
          OR: [
            { name: { contains: 'coca', mode: 'insensitive' } },
            { code: { contains: 'coca', mode: 'insensitive' } },
            { barcode: { contains: 'coca', mode: 'insensitive' } },
            { brand: { contains: 'coca', mode: 'insensitive' } },
            { color: { contains: 'coca', mode: 'insensitive' } },
          ],
        },
        {
          OR: [
            { name: { contains: 'cola', mode: 'insensitive' } },
            { code: { contains: 'cola', mode: 'insensitive' } },
            { barcode: { contains: 'cola', mode: 'insensitive' } },
            { brand: { contains: 'cola', mode: 'insensitive' } },
            { color: { contains: 'cola', mode: 'insensitive' } },
          ],
        },
      ],
    });
  });

  it('ignores extra whitespace in search terms', () => {
    const whereClause = buildProductWhereClause('soc-1', {
      search: '  coca   ',
    });

    expect(whereClause.AND).toHaveLength(1);
    expect(whereClause.AND[0]).toMatchObject({
      OR: [
        { name: { contains: 'coca', mode: 'insensitive' } },
        { code: { contains: 'coca', mode: 'insensitive' } },
        { barcode: { contains: 'coca', mode: 'insensitive' } },
        { brand: { contains: 'coca', mode: 'insensitive' } },
        { color: { contains: 'coca', mode: 'insensitive' } },
      ],
    });
  });
});
