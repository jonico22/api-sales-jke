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

import { createReceivedConsignmentSettlement } from '@/module/customer/receivedConsignmentSettlement/receivedConsignmentSettlement.service';
import { DomainRuleAppError } from '@/utils/domain-errors';

describe('receivedConsignmentSettlement.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    redisMock.deleteKeysByPrefix.mockResolvedValue(undefined);
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
});
