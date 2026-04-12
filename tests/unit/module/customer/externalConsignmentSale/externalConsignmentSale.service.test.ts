import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock, redisMock } = vi.hoisted(() => ({
  prismaMock: {
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
  createExternalConsignmentSale,
  updateExternalConsignmentSale,
} from '@/module/customer/externalConsignmentSale/externalConsignmentSale.service';
import { DomainRuleAppError } from '@/utils/domain-errors';

describe('externalConsignmentSale.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    redisMock.del.mockResolvedValue(undefined);
    redisMock.deleteKeysByPrefix.mockResolvedValue(undefined);
  });

  it('rejects a sale that exceeds the available consignment stock', async () => {
    const tx = {
      deliveredConsignmentAgreement: {
        findUnique: vi.fn().mockResolvedValue({ id: 'delivery-1', deliveredStock: 10 }),
        update: vi.fn(),
      },
      externalConsignmentSale: {
        aggregate: vi.fn().mockResolvedValue({ _sum: { soldQuantity: 8 } }),
        create: vi.fn(),
      },
    };

    prismaMock.$transaction.mockImplementation(async (callback: (innerTx: typeof tx) => Promise<unknown>) => callback(tx));

    await expect(
      createExternalConsignmentSale({
        deliveredConsignmentId: 'delivery-1',
        soldQuantity: 3,
        reportedSaleDate: new Date('2026-04-08T00:00:00.000Z'),
        reportedSalePrice: 300,
        unitSalePrice: 100,
        totalCommissionAmount: 45,
      })
    ).rejects.toBeInstanceOf(DomainRuleAppError);

    expect(tx.externalConsignmentSale.create).not.toHaveBeenCalled();
    expect(tx.deliveredConsignmentAgreement.update).not.toHaveBeenCalled();
  });

  it('updates remaining stock and recalculates net total when editing a sale', async () => {
    const tx = {
      externalConsignmentSale: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'sale-1',
          deliveredConsignmentId: 'delivery-1',
          soldQuantity: 2,
          reportedSalePrice: 200,
          totalCommissionAmount: 20,
          unitSalePrice: 100,
          reportedSaleDate: new Date('2026-04-08T00:00:00.000Z'),
          remarks: null,
          documentReference: null,
          netTotal: 180,
        }),
        aggregate: vi.fn().mockResolvedValue({ _sum: { soldQuantity: 5 } }),
        update: vi.fn().mockResolvedValue({ id: 'sale-1', netTotal: 225 }),
      },
      deliveredConsignmentAgreement: {
        findUnique: vi.fn().mockResolvedValue({ id: 'delivery-1', deliveredStock: 10 }),
        update: vi.fn().mockResolvedValue(undefined),
      },
    };

    prismaMock.$transaction.mockImplementation(async (callback: (innerTx: typeof tx) => Promise<unknown>) => callback(tx));

    const result = await updateExternalConsignmentSale('sale-1', {
      soldQuantity: 4,
      reportedSalePrice: 250,
      totalCommissionAmount: 25,
    });

    expect(tx.externalConsignmentSale.update).toHaveBeenCalledWith({
      where: { id: 'sale-1' },
      data: expect.objectContaining({
        soldQuantity: 4,
        reportedSalePrice: 250,
        totalCommissionAmount: 25,
        netTotal: 225,
      }),
    });
    expect(tx.deliveredConsignmentAgreement.update).toHaveBeenCalledWith({
      where: { id: 'delivery-1' },
      data: {
        remainingStock: 3,
        status: 'active',
      },
    });
    expect(result).toEqual({ id: 'sale-1', netTotal: 225 });
  });
});
