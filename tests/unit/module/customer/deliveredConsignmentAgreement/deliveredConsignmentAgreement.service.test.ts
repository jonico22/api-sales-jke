import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock, redisMock } = vi.hoisted(() => ({
  prismaMock: {
    society: {
      findUnique: vi.fn(),
    },
    deliveredConsignmentAgreement: {
      create: vi.fn(),
      count: vi.fn(),
      delete: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
    $transaction: vi.fn(),
  },
  redisMock: {
    del: vi.fn(),
    deleteKeysByPrefix: vi.fn(),
    get: vi.fn(),
    set: vi.fn(),
  },
}));

vi.mock('@/config/prisma', () => ({
  default: prismaMock,
}));

vi.mock('@/config/redis', () => ({
  redis: redisMock,
}));

import {
  create,
  getAll,
  remove,
  update,
} from '@/module/customer/deliveredConsignmentAgreement/deliveredConsignmentAgreement.service';
import { DomainRuleAppError } from '@/utils/domain-errors';

describe('deliveredConsignmentAgreement.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    redisMock.del.mockResolvedValue(undefined);
    redisMock.deleteKeysByPrefix.mockResolvedValue(undefined);
    redisMock.get.mockResolvedValue(null);
    redisMock.set.mockResolvedValue(undefined);
  });

  it('defaults remaining stock to delivered stock on create', async () => {
    prismaMock.deliveredConsignmentAgreement.create.mockResolvedValue({ id: 'delivery-1' });

    await create({
      consignmentAgreementId: 'agreement-1',
      productId: 'product-1',
      branchId: 'branch-1',
      deliveredStock: 8,
      costPrice: 10,
      suggestedSalePrice: 20,
      taxAmount: 0,
    } as any);

    expect(prismaMock.deliveredConsignmentAgreement.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        remainingStock: 8,
        totalCost: 80,
        totalValue: 160,
      }),
    });
    expect(redisMock.deleteKeysByPrefix).toHaveBeenCalledWith('deliveredConsignments:list:');
  });

  it('rejects updates that leave remaining stock above delivered stock', async () => {
    prismaMock.deliveredConsignmentAgreement.findUnique.mockResolvedValue({
      id: 'delivery-1',
      deliveredStock: 5,
      remainingStock: 4,
      costPrice: 10,
      suggestedSalePrice: 20,
    });

    await expect(
      update('delivery-1', {
        deliveredStock: 3,
      } as any)
    ).rejects.toBeInstanceOf(DomainRuleAppError);

    expect(prismaMock.deliveredConsignmentAgreement.update).not.toHaveBeenCalled();
  });

  it('stores list cache keys under the same delivered consignment prefix it invalidates', async () => {
    prismaMock.society.findUnique.mockResolvedValue({ id: 'soc-1' });
    prismaMock.deliveredConsignmentAgreement.findMany.mockReturnValue({ kind: 'findMany' });
    prismaMock.deliveredConsignmentAgreement.count.mockReturnValue({ kind: 'count' });
    prismaMock.$transaction.mockResolvedValue([[{ id: 'delivery-1' }], 1]);

    await getAll(
      { page: 1, limit: 10, sortBy: 'createdAt', sortOrder: 'desc' },
      { societyId: 'SOC-001' } as any
    );

    expect(redisMock.set).toHaveBeenCalledWith(
      'deliveredConsignments:list:soc-1:all:all:all:all:all:1:10:createdAt:desc',
      expect.any(Object),
      300
    );
  });

  it('invalidates the delivered consignment list cache after deleting', async () => {
    prismaMock.deliveredConsignmentAgreement.delete.mockResolvedValue({ id: 'delivery-1' });

    await remove('delivery-1');

    expect(redisMock.del).toHaveBeenCalledWith('deliveredConsignments:delivery-1');
    expect(redisMock.deleteKeysByPrefix).toHaveBeenCalledWith('deliveredConsignments:list:');
  });
});
