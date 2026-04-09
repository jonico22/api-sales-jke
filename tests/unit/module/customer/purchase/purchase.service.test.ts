import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PartnerType, PurchaseStatus, TransactionType } from '@prisma/client';

const { prismaMock, redisMock, inventoryServiceMock } = vi.hoisted(() => ({
  prismaMock: {
    $transaction: vi.fn(),
    society: {
      findUnique: vi.fn(),
    },
    bussinessPartner: {
      findUnique: vi.fn(),
    },
    purchase: {
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
  redisMock: {
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
    deleteKeysByPrefix: vi.fn(),
  },
  inventoryServiceMock: {
    logTransaction: vi.fn(),
  },
}));

vi.mock('@/config/prisma', () => ({
  default: prismaMock,
}));

vi.mock('@/config/redis', () => ({
  redis: redisMock,
}));

vi.mock('@/module/inventory/inventory.service', () => ({
  InventoryService: inventoryServiceMock,
}));

import { createPurchase, getAllPurchases, updatePurchase } from '@/module/customer/purchase/purchase.service';

describe('purchase.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    redisMock.get.mockResolvedValue(null);
    redisMock.set.mockResolvedValue(undefined);
    redisMock.del.mockResolvedValue(undefined);
    redisMock.deleteKeysByPrefix.mockResolvedValue(undefined);
    inventoryServiceMock.logTransaction.mockResolvedValue(undefined);
  });

  it('does not include isDeleted in purchase listing filters', async () => {
    const findManyQuery = { kind: 'findMany' };
    const countQuery = { kind: 'count' };
    prismaMock.purchase.findMany.mockReturnValue(findManyQuery);
    prismaMock.purchase.count.mockReturnValue(countQuery);
    prismaMock.$transaction.mockResolvedValueOnce([[], 0]);

    await getAllPurchases(
      { page: 1, limit: 10, sortBy: 'createdAt', sortOrder: 'desc' },
      { societyId: 'soc-1', status: PurchaseStatus.PENDING } as any
    );

    expect(prismaMock.purchase.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        societyId: 'soc-1',
        status: PurchaseStatus.PENDING,
      },
    }));
  });

  it('increments global stock and invalidates related caches when completing a purchase', async () => {
    prismaMock.purchase.findUnique.mockResolvedValueOnce({
      id: 'purchase-1',
      status: PurchaseStatus.PENDING,
      subTotal: 254.24,
      taxAmount: 45.76,
      totalAmount: 300,
      purchaseDetails: [{
        productId: 'prod-1',
        quantity: 6,
        unitPrice: 50,
        subtotal: 254.24,
        taxAmount: 45.76,
        total: 300,
      }],
    });

    const tx = {
      purchase: {
        update: vi.fn().mockResolvedValue({
          id: 'purchase-1',
          societyId: 'soc-1',
          branchOfficeId: 'branch-1',
          documentNumber: 'PUR-001',
          status: PurchaseStatus.COMPLETED,
          purchaseDetails: [{
            productId: 'prod-1',
            quantity: 6,
            unitPrice: 50,
            total: 300,
          }],
        }),
      },
      branchOfficeProduct: {
        upsert: vi.fn().mockResolvedValue(undefined),
      },
      product: {
        update: vi.fn().mockResolvedValue(undefined),
      },
    };

    prismaMock.$transaction.mockImplementation(async (callback: (innerTx: typeof tx) => Promise<unknown>) => callback(tx));

    const result = await updatePurchase('purchase-1', {
      status: PurchaseStatus.COMPLETED,
    } as any);

    expect(tx.product.update).toHaveBeenCalledWith({
      where: { id: 'prod-1' },
      data: {
        stock: { increment: 6 },
        priceCost: 50,
      },
    });
    expect(inventoryServiceMock.logTransaction).toHaveBeenCalledWith(expect.objectContaining({
      productId: 'prod-1',
      branchOfficeId: 'branch-1',
      type: TransactionType.PURCHASE_ENTRY,
      quantity: 6,
    }), tx);
    expect(redisMock.del).toHaveBeenCalledWith('purchases:purchase-1');
    expect(redisMock.deleteKeysByPrefix).toHaveBeenCalledWith('dashboard:cash-flow:soc-1');
    expect(redisMock.deleteKeysByPrefix).toHaveBeenCalledWith('purchases:list:');
    expect(redisMock.deleteKeysByPrefix).toHaveBeenCalledWith('products:');
    expect(redisMock.deleteKeysByPrefix).toHaveBeenCalledWith('products:select:');
    expect(redisMock.deleteKeysByPrefix).toHaveBeenCalledWith('branch_office_products:');
    expect(result.status).toBe(PurchaseStatus.COMPLETED);
  });

  it('invalidates dashboard cash-flow cache when creating a purchase', async () => {
    prismaMock.bussinessPartner.findUnique.mockResolvedValueOnce({
      id: 'partner-1',
      type: PartnerType.SUPPLIER,
      companyName: 'Proveedor SAC',
    });
    prismaMock.purchase.create.mockResolvedValueOnce({
      id: 'purchase-1',
      societyId: 'soc-1',
      purchaseDetails: [],
    });

    await createPurchase({
      societyId: '550e8400-e29b-41d4-a716-446655440000',
      providerId: 'partner-1',
      currencyId: 'currency-1',
      branchOfficeId: 'branch-1',
      totalAmount: 100,
    } as any);

    expect(redisMock.deleteKeysByPrefix).toHaveBeenCalledWith('dashboard:cash-flow:550e8400-e29b-41d4-a716-446655440000');
    expect(redisMock.deleteKeysByPrefix).toHaveBeenCalledWith('purchases:list:');
  });

  it('rejects completing a purchase without details', async () => {
    prismaMock.purchase.findUnique.mockResolvedValueOnce({
      id: 'purchase-1',
      status: PurchaseStatus.PENDING,
      subTotal: 0,
      taxAmount: 0,
      totalAmount: 0,
      purchaseDetails: [],
    });

    await expect(
      updatePurchase('purchase-1', { status: PurchaseStatus.COMPLETED } as any)
    ).rejects.toThrow('No se puede completar una compra sin detalles');
  });

  it('rejects completing a purchase when header totals do not match details', async () => {
    prismaMock.purchase.findUnique.mockResolvedValueOnce({
      id: 'purchase-1',
      status: PurchaseStatus.PENDING,
      subTotal: 200,
      taxAmount: 36,
      totalAmount: 236,
      purchaseDetails: [{
        productId: 'prod-1',
        quantity: 2,
        unitPrice: 50,
        subtotal: 100,
        taxAmount: 18,
        total: 118,
      }],
    });

    await expect(
      updatePurchase('purchase-1', { status: PurchaseStatus.COMPLETED } as any)
    ).rejects.toThrow('No se puede completar la compra porque los totales no coinciden con sus detalles');
  });
});
