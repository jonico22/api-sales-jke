import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock, redisMock } = vi.hoisted(() => ({
  prismaMock: {
    externalConsignmentSale: {
      count: vi.fn(),
      findMany: vi.fn(),
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
  createExternalConsignmentSale,
  getAllExternalConsignmentSales,
  updateExternalConsignmentSale,
} from '@/module/customer/externalConsignmentSale/externalConsignmentSale.service';
import { DomainRuleAppError } from '@/utils/domain-errors';

describe('externalConsignmentSale.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    redisMock.del.mockResolvedValue(undefined);
    redisMock.deleteKeysByPrefix.mockResolvedValue(undefined);
    redisMock.get.mockResolvedValue(null);
    redisMock.set.mockResolvedValue(undefined);
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

  it('invalidates the external sales list cache after creating a sale', async () => {
    const tx = {
      deliveredConsignmentAgreement: {
        findUnique: vi.fn().mockResolvedValue({ id: 'delivery-1', deliveredStock: 10 }),
        update: vi.fn().mockResolvedValue(undefined),
      },
      externalConsignmentSale: {
        aggregate: vi.fn().mockResolvedValue({ _sum: { soldQuantity: 2 } }),
        create: vi.fn().mockResolvedValue({ id: 'sale-1' }),
      },
    };

    prismaMock.$transaction.mockImplementation(async (callback: (innerTx: typeof tx) => Promise<unknown>) => callback(tx));

    await createExternalConsignmentSale({
      deliveredConsignmentId: 'delivery-1',
      soldQuantity: 3,
      reportedSaleDate: new Date('2026-04-08T00:00:00.000Z'),
      reportedSalePrice: 300,
      unitSalePrice: 100,
      totalCommissionAmount: 45,
    });

    expect(redisMock.deleteKeysByPrefix).toHaveBeenCalledWith('externalSales:list:');
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

  it('stores list cache keys under the same external sales prefix it invalidates', async () => {
    prismaMock.externalConsignmentSale.findMany.mockReturnValue({ kind: 'findMany' });
    prismaMock.externalConsignmentSale.count.mockReturnValue({ kind: 'count' });
    prismaMock.$transaction.mockResolvedValue([[{ id: 'sale-1' }], 1]);

    await getAllExternalConsignmentSales(
      { page: 1, limit: 10, sortBy: 'createdAt', sortOrder: 'desc' },
      { deliveredConsignmentId: 'delivery-1' } as any
    );

    expect(redisMock.set).toHaveBeenCalledWith(
      'externalSales:list:delivery-1:all:all:1:10:createdAt:desc',
      expect.any(Object),
      300
    );
  });
});
