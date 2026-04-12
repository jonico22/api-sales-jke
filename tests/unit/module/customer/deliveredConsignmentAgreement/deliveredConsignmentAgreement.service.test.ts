import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock, redisMock } = vi.hoisted(() => ({
  prismaMock: {
    deliveredConsignmentAgreement: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
  redisMock: {
    del: vi.fn(),
    deleteKeysByPrefix: vi.fn(),
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
  update,
} from '@/module/customer/deliveredConsignmentAgreement/deliveredConsignmentAgreement.service';
import { DomainRuleAppError } from '@/utils/domain-errors';

describe('deliveredConsignmentAgreement.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    redisMock.del.mockResolvedValue(undefined);
    redisMock.deleteKeysByPrefix.mockResolvedValue(undefined);
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
});
