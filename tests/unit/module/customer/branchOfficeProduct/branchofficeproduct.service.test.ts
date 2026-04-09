import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock, redisMock, branchOfficeProductFields } = vi.hoisted(() => {
  const fields = { minStock: Symbol('minStock') };

  return {
  branchOfficeProductFields: fields,
  prismaMock: {
    branchOfficeProduct: {
      fields,
      findMany: vi.fn(),
      count: vi.fn(),
    },
    society: {
      findUnique: vi.fn(),
    },
    $transaction: vi.fn(),
  },
  redisMock: {
    get: vi.fn(),
    set: vi.fn(),
  },
}});

vi.mock('@/config/prisma', () => ({
  default: prismaMock,
}));

vi.mock('@/config/redis', () => ({
  redis: redisMock,
}));

import { BranchOfficeProductService } from '@/module/customer/branchOfficeProduct/branchofficeproduct.service';

describe('branchofficeproduct.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    redisMock.get.mockResolvedValue(null);
    redisMock.set.mockResolvedValue(undefined);
  });

  it('keeps productName and lowStock filters together in getAll', async () => {
    const findManyQuery = { kind: 'findMany' };
    const countQuery = { kind: 'count' };
    prismaMock.branchOfficeProduct.findMany.mockReturnValue(findManyQuery);
    prismaMock.branchOfficeProduct.count.mockReturnValue(countQuery);
    prismaMock.$transaction.mockResolvedValueOnce([[], 0]);

    await BranchOfficeProductService.getAll(
      { page: 1, limit: 10, sortBy: 'createdAt', sortOrder: 'desc' },
      {
        branchOfficeId: 'branch-1',
        productName: 'lap',
        lowStock: true,
      } as any
    );

    expect(prismaMock.branchOfficeProduct.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        isDeleted: false,
        branchOfficeId: 'branch-1',
        product: {
          name: { contains: 'lap', mode: 'insensitive' }
        },
        availableStock: {
          lte: branchOfficeProductFields.minStock
        }
      }
    }));
  });

  it('returns empty when society code cannot be resolved', async () => {
    prismaMock.society.findUnique.mockResolvedValueOnce(null);

    const result = await BranchOfficeProductService.getAll(
      { page: 1, limit: 10 },
      { societyCode: 'UNKNOWN' } as any
    );

    expect(result.data).toEqual([]);
    expect(result.pagination.total).toBe(0);
  });
});
