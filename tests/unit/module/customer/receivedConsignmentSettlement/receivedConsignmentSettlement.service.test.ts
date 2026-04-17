import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock, redisMock } = vi.hoisted(() => ({
  prismaMock: {
    society: {
      findUnique: vi.fn(),
    },
    receivedConsignmentSettlement: {
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
  createReceivedConsignmentSettlement,
  getAllReceivedConsignmentSettlements,
} from '@/module/customer/receivedConsignmentSettlement/receivedConsignmentSettlement.service';
import { DomainRuleAppError } from '@/utils/domain-errors';

describe('receivedConsignmentSettlement.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    redisMock.deleteKeysByPrefix.mockResolvedValue(undefined);
    redisMock.get.mockResolvedValue(null);
    redisMock.set.mockResolvedValue(undefined);
  });

  it('rejects settlements whose net amount does not match reported sales minus commission', async () => {
    await expect(
      createReceivedConsignmentSettlement({
        outgoingAgreementId: 'agreement-1',
        settlementDate: new Date('2026-04-08T00:00:00.000Z'),
        totalReportedSalesAmount: 100,
        consigneeCommissionAmount: 20,
        totalReceivedAmount: 70,
        currencyId: 'currency-1',
        status: 'PENDING',
      } as any)
    ).rejects.toBeInstanceOf(DomainRuleAppError);

    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('rejects settlements that exceed the accumulated sales of the agreement', async () => {
    const tx = {
      outgoingConsignmentAgreement: {
        findUnique: vi.fn().mockResolvedValue({ id: 'agreement-1' }),
      },
      deliveredConsignmentAgreement: {
        findMany: vi.fn().mockResolvedValue([{ id: 'delivery-1' }]),
      },
      externalConsignmentSale: {
        aggregate: vi.fn().mockResolvedValue({
          _sum: {
            reportedSalePrice: 100,
            totalCommissionAmount: 10,
            netTotal: 90,
          },
        }),
      },
      receivedConsignmentSettlement: {
        aggregate: vi.fn().mockResolvedValue({
          _sum: {
            totalReportedSalesAmount: 60,
            consigneeCommissionAmount: 6,
            totalReceivedAmount: 54,
          },
        }),
        create: vi.fn(),
      },
    };

    prismaMock.$transaction.mockImplementation(async (callback: (innerTx: typeof tx) => Promise<unknown>) => callback(tx));

    await expect(
      createReceivedConsignmentSettlement({
        outgoingAgreementId: 'agreement-1',
        settlementDate: new Date('2026-04-08T00:00:00.000Z'),
        totalReportedSalesAmount: 50,
        consigneeCommissionAmount: 5,
        totalReceivedAmount: 45,
        currencyId: 'currency-1',
        status: 'PENDING',
      } as any)
    ).rejects.toBeInstanceOf(DomainRuleAppError);

    expect(tx.receivedConsignmentSettlement.create).not.toHaveBeenCalled();
  });

  it('stores list cache keys under the same settlements prefix it invalidates', async () => {
    prismaMock.society.findUnique.mockResolvedValue({ id: 'soc-1' });
    prismaMock.receivedConsignmentSettlement.findMany.mockReturnValue({ kind: 'findMany' });
    prismaMock.receivedConsignmentSettlement.count.mockReturnValue({ kind: 'count' });
    prismaMock.$transaction.mockResolvedValue([[{ id: 'settlement-1' }], 1]);

    await getAllReceivedConsignmentSettlements(
      { page: 1, limit: 10, sortBy: 'createdAt', sortOrder: 'desc' },
      { societyId: 'SOC-001' } as any
    );

    expect(redisMock.set).toHaveBeenCalledWith(
      'settlements:list:soc-1:all:all:all:1:10:createdAt:desc',
      expect.any(Object),
      300
    );
  });
});
