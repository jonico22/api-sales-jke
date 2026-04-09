import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock, redisMock } = vi.hoisted(() => ({
  prismaMock: {
    $transaction: vi.fn(),
    purchaseDetail: {
      findMany: vi.fn(),
      count: vi.fn(),
      findUnique: vi.fn(),
    },
  },
  redisMock: {
    get: vi.fn(),
    set: vi.fn(),
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
  createPurchaseDetail,
  deletePurchaseDetail,
  updatePurchaseDetail,
} from '@/module/customer/purchaseDetail/purchaseDetail.service';

describe('purchaseDetail.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    redisMock.get.mockResolvedValue(null);
    redisMock.set.mockResolvedValue(undefined);
    redisMock.del.mockResolvedValue(undefined);
    redisMock.deleteKeysByPrefix.mockResolvedValue(undefined);
  });

  it('recalculates purchase totals and invalidates related caches when creating a detail', async () => {
    const tx = {
      purchase: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'purchase-1',
          societyId: 'soc-1',
          status: 'PENDING',
        }),
        update: vi.fn().mockResolvedValue(undefined),
      },
      purchaseDetail: {
        create: vi.fn().mockResolvedValue({ id: 'detail-1' }),
        aggregate: vi.fn().mockResolvedValue({
          _sum: { subtotal: 100, taxAmount: 18, total: 118 },
        }),
      },
    };
    prismaMock.$transaction.mockImplementation(async (callback: (innerTx: typeof tx) => Promise<unknown>) => callback(tx));

    const result = await createPurchaseDetail({
      purchaseId: 'purchase-1',
      productId: 'prod-1',
      quantity: 2,
      unitPrice: 50,
      subtotal: 100,
      taxAmount: 18,
      total: 118,
    } as any);

    expect(tx.purchaseDetail.aggregate).toHaveBeenCalledWith({
      where: { purchaseId: 'purchase-1' },
      _sum: { subtotal: true, taxAmount: true, total: true },
    });
    expect(tx.purchase.update).toHaveBeenCalledWith({
      where: { id: 'purchase-1' },
      data: {
        subTotal: 100,
        taxAmount: 18,
        totalAmount: 118,
        updatedAt: expect.any(Date),
      },
    });
    expect(redisMock.deleteKeysByPrefix).toHaveBeenCalledWith('purchaseDetails:list:');
    expect(redisMock.deleteKeysByPrefix).toHaveBeenCalledWith('purchases:list:');
    expect(redisMock.del).toHaveBeenCalledWith('purchases:purchase-1');
    expect(redisMock.deleteKeysByPrefix).toHaveBeenCalledWith('dashboard:cash-flow:soc-1');
    expect(result).toEqual({ id: 'detail-1' });
  });

  it('blocks updates when the target purchase is completed', async () => {
    const tx = {
      purchaseDetail: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'detail-1',
          purchaseId: 'purchase-1',
        }),
      },
      purchase: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'purchase-1',
          societyId: 'soc-1',
          status: 'COMPLETED',
        }),
      },
    };
    prismaMock.$transaction.mockImplementation(async (callback: (innerTx: typeof tx) => Promise<unknown>) => callback(tx));

    await expect(
      updatePurchaseDetail('detail-1', { quantity: 3 } as any)
    ).rejects.toThrow('No se puede modificar el detalle de una compra completada');
  });

  it('recalculates totals after deleting a detail', async () => {
    const tx = {
      purchaseDetail: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'detail-1',
          purchaseId: 'purchase-1',
        }),
        delete: vi.fn().mockResolvedValue({ id: 'detail-1' }),
        aggregate: vi.fn().mockResolvedValue({
          _sum: { subtotal: null, taxAmount: null, total: null },
        }),
      },
      purchase: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'purchase-1',
          societyId: 'soc-1',
          status: 'PENDING',
        }),
        update: vi.fn().mockResolvedValue(undefined),
      },
    };
    prismaMock.$transaction.mockImplementation(async (callback: (innerTx: typeof tx) => Promise<unknown>) => callback(tx));

    await deletePurchaseDetail('detail-1');

    expect(tx.purchase.update).toHaveBeenCalledWith({
      where: { id: 'purchase-1' },
      data: {
        subTotal: 0,
        taxAmount: 0,
        totalAmount: 0,
        updatedAt: expect.any(Date),
      },
    });
    expect(redisMock.del).toHaveBeenCalledWith('purchaseDetails:detail-1');
    expect(redisMock.del).toHaveBeenCalledWith('purchases:purchase-1');
  });
});
