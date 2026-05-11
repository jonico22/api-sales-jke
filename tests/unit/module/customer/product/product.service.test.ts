import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock, redisMock, publisherMock, dateFormatterMock } = vi.hoisted(() => ({
  prismaMock: {
    $transaction: vi.fn(),
    society: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    category: {
      findFirst: vi.fn(),
    },
    branchOffice: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
    },
    product: {
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    branchOfficeProduct: {
      create: vi.fn(),
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
  },
  redisMock: {
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
    deleteKeysByPrefix: vi.fn(),
  },
  publisherMock: {
    publishRealtimeUpdate: vi.fn(),
  },
  dateFormatterMock: {
    formatToLimaTime: vi.fn((value: unknown) => value),
    convertLimaTimeToUTC: vi.fn(),
    convertLimaDateRangeToUTC: vi.fn(() => ({})),
  },
}));

vi.mock('@/config/prisma', () => ({
  default: prismaMock,
}));

vi.mock('@/config/redis', () => ({
  redis: redisMock,
}));

vi.mock('@/config/event-publisher', () => publisherMock);

vi.mock('@/utils/dateFormatter', () => dateFormatterMock);

import { ProductService } from '@/module/customer/product/product.service';

describe('product.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    redisMock.get.mockResolvedValue(null);
    redisMock.set.mockResolvedValue(undefined);
    redisMock.del.mockResolvedValue(undefined);
    redisMock.deleteKeysByPrefix.mockResolvedValue(undefined);
    publisherMock.publishRealtimeUpdate.mockResolvedValue(undefined);
  });

  it('resolves category within the same society when creating a product', async () => {
    prismaMock.society.findUnique.mockResolvedValueOnce({
      id: 'soc-1',
      subscriptionId: 'sub-1',
    });
    prismaMock.category.findFirst.mockResolvedValueOnce({ id: 'cat-1' });
    prismaMock.product.create.mockResolvedValueOnce({
      id: 'prod-1',
      name: 'Producto',
      code: 'PROD-1',
      societyId: 'soc-1',
    });
    prismaMock.branchOffice.findFirst.mockResolvedValueOnce(null);
    prismaMock.society.update.mockResolvedValueOnce(undefined);

    await ProductService.create({
      name: 'Producto',
      price: 10,
      priceCost: 5,
      stock: 1,
      minStock: 0,
      societyId: 'SOC-001',
      categoryId: 'CAT-001',
      code: 'PROD-1',
      isActive: true,
    } as any);

    expect(prismaMock.category.findFirst).toHaveBeenCalledWith({
      where: { code: 'CAT-001', isDeleted: false, societyId: 'soc-1' }
    });
  });

  it('resolves category within the target society when updating a product', async () => {
    prismaMock.product.findUnique.mockResolvedValueOnce({ societyId: 'soc-current' });
    prismaMock.society.findUnique.mockResolvedValueOnce({ id: 'soc-next' });
    prismaMock.category.findFirst.mockResolvedValueOnce({ id: 'cat-2' });
    prismaMock.product.update.mockResolvedValueOnce({
      id: 'prod-1',
      societyId: 'soc-next',
      society: { subscriptionId: 'sub-1' },
    });
    prismaMock.branchOffice.findFirst.mockResolvedValueOnce(null);

    await ProductService.update('prod-1', {
      societyId: 'SOC-002',
      categoryId: 'CAT-002',
    } as any);

    expect(prismaMock.category.findFirst).toHaveBeenCalledWith({
      where: { code: 'CAT-002', isDeleted: false, societyId: 'soc-next' }
    });
  });

  it('scopes select category lookups to the resolved society', async () => {
    prismaMock.society.findUnique.mockResolvedValueOnce({ id: 'soc-1' });
    prismaMock.category.findFirst.mockResolvedValueOnce({ id: 'cat-1' });
    prismaMock.product.findMany.mockResolvedValueOnce([]);

    await ProductService.getForSelect('SOC-001', 'CAT-001');

    expect(prismaMock.category.findFirst).toHaveBeenCalledWith({
      where: { code: 'CAT-001', isDeleted: false, societyId: 'soc-1' }
    });
  });

  it('applies partial search terms in product select queries', async () => {
    prismaMock.society.findUnique.mockResolvedValueOnce({ id: 'soc-1' });
    prismaMock.branchOffice.findFirst.mockResolvedValueOnce(null);
    prismaMock.product.findMany.mockResolvedValueOnce([]);

    await ProductService.getForSelect('SOC-001', undefined, undefined, 'coca cola');

    expect(prismaMock.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          isDeleted: false,
          isActive: true,
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
        }),
      })
    );
  });
});
