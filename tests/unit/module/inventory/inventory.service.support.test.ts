import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TransactionType } from '@prisma/client';

const { redisMock, helpersMock } = vi.hoisted(() => ({
  redisMock: {
    deleteKeysByPrefix: vi.fn(),
  },
  helpersMock: {
    getSaleExitQuantity: vi.fn(),
    invalidateInventoryDomainCaches: vi.fn(),
    invalidateInventoryListCache: vi.fn(),
  },
}));

vi.mock('@/config/redis', () => ({
  redis: redisMock,
}));

vi.mock('@/module/inventory/inventory.helpers', () => helpersMock);

import {
  applyCancelReservation,
  applyConfirmStockOutput,
  applyManualAdjustmentStock,
  applyReserveStock,
  buildSaleExitLogInput,
  createInventoryTransactionRecord,
  invalidateConfirmedStockCaches,
  resolveAdjustmentUnitCost,
  scheduleInventoryDomainInvalidation,
  scheduleInventoryListInvalidation,
} from '@/module/inventory/inventory.service.support';

const flushImmediate = () => new Promise(resolve => setImmediate(resolve));

describe('inventory.service.support', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    redisMock.deleteKeysByPrefix.mockResolvedValue(undefined);
    helpersMock.getSaleExitQuantity.mockImplementation((quantity: number) => -Math.abs(quantity));
    helpersMock.invalidateInventoryDomainCaches.mockResolvedValue(undefined);
    helpersMock.invalidateInventoryListCache.mockResolvedValue(undefined);
  });

  it('schedules inventory list invalidation', async () => {
    scheduleInventoryListInvalidation();

    await flushImmediate();
    expect(helpersMock.invalidateInventoryListCache).toHaveBeenCalled();
  });

  it('schedules inventory domain invalidation', async () => {
    scheduleInventoryDomainInvalidation('adjustment');

    await flushImmediate();
    expect(helpersMock.invalidateInventoryDomainCaches).toHaveBeenCalled();
  });

  it('creates an inventory transaction from the current stock snapshot', async () => {
    const db = {
      branchOfficeProduct: {
        findUnique: vi.fn().mockResolvedValue({ physicalStock: 10 }),
      },
      inventoryTransaction: {
        create: vi.fn().mockResolvedValue({ id: 'trx-1' }),
      },
    };

    const result = await createInventoryTransactionRecord(db, {
      productId: 'prod-1',
      branchOfficeId: 'branch-1',
      type: TransactionType.ADJUSTMENT_ADD,
      quantity: 4,
      unitCost: 5,
      totalCost: 20,
    });

    expect(db.inventoryTransaction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        previousStock: 6,
        newStock: 10,
        quantity: 4,
      }),
    });
    expect(result).toEqual({ id: 'trx-1' });
  });

  it('throws when no branch stock exists for transaction creation', async () => {
    const db = {
      branchOfficeProduct: {
        findUnique: vi.fn().mockResolvedValue(null),
      },
      inventoryTransaction: {
        create: vi.fn(),
      },
    };

    await expect(
      createInventoryTransactionRecord(db, {
        productId: 'prod-1',
        branchOfficeId: 'branch-1',
        type: TransactionType.ADJUSTMENT_ADD,
        quantity: 1,
        unitCost: 5,
        totalCost: 5,
      })
    ).rejects.toThrow('Product prod-1 not found in branch branch-1');
  });

  it('resolves unit cost directly when provided', async () => {
    const tx = { product: { findUnique: vi.fn() } };

    await expect(resolveAdjustmentUnitCost(tx, 'prod-1', 15)).resolves.toBe(15);
    expect(tx.product.findUnique).not.toHaveBeenCalled();
  });

  it('resolves unit cost from the product when omitted', async () => {
    const tx = {
      product: {
        findUnique: vi.fn().mockResolvedValue({ priceCost: 12.5 }),
      },
    };

    await expect(resolveAdjustmentUnitCost(tx, 'prod-1')).resolves.toBe(12.5);
    expect(tx.product.findUnique).toHaveBeenCalledWith({ where: { id: 'prod-1' } });
  });

  it('throws when product is missing while resolving unit cost', async () => {
    const tx = {
      product: {
        findUnique: vi.fn().mockResolvedValue(null),
      },
    };

    await expect(resolveAdjustmentUnitCost(tx, 'prod-1')).rejects.toThrow('Producto no encontrado');
  });

  it('applies a manual stock adjustment and syncs global stock', async () => {
    const tx = {
      branchOfficeProduct: {
        upsert: vi.fn().mockResolvedValue(undefined),
      },
      product: {
        update: vi.fn().mockResolvedValue(undefined),
      },
    };

    await applyManualAdjustmentStock(tx, {
      productId: 'prod-1',
      branchOfficeId: 'branch-1',
      signedQuantity: 3,
    });

    expect(tx.branchOfficeProduct.upsert).toHaveBeenCalled();
    expect(tx.product.update).toHaveBeenCalledWith({
      where: { id: 'prod-1' },
      data: { stock: { increment: 3 } },
    });
  });

  it('reserves stock and decrements the global stock counter', async () => {
    const tx = {
      branchOfficeProduct: {
        upsert: vi.fn().mockResolvedValue({ id: 'bop-1' }),
      },
      product: {
        update: vi.fn().mockResolvedValue(undefined),
      },
    };

    const result = await applyReserveStock(tx, {
      productId: 'prod-1',
      branchId: 'branch-1',
      quantity: 2,
    });

    expect(tx.branchOfficeProduct.upsert).toHaveBeenCalled();
    expect(tx.product.update).toHaveBeenCalledWith({
      where: { id: 'prod-1' },
      data: { stock: { decrement: 2 } },
    });
    expect(result).toEqual({ id: 'bop-1' });
  });

  it('confirms stock output on physical and reserved stock', async () => {
    const tx = {
      branchOfficeProduct: {
        update: vi.fn().mockResolvedValue(undefined),
      },
    };

    await applyConfirmStockOutput(tx, {
      productId: 'prod-1',
      branchOfficeId: 'branch-1',
      quantity: 2,
    });

    expect(tx.branchOfficeProduct.update).toHaveBeenCalledWith({
      where: {
        productId_branchOfficeId: {
          productId: 'prod-1',
          branchOfficeId: 'branch-1',
        },
      },
      data: {
        physicalStock: { decrement: 2 },
        reservedStock: { decrement: 2 },
      },
    });
  });

  it('cancels a reservation and restores global stock', async () => {
    const tx = {
      branchOfficeProduct: {
        update: vi.fn().mockResolvedValue(undefined),
      },
      product: {
        update: vi.fn().mockResolvedValue(undefined),
      },
    };

    await applyCancelReservation(tx, {
      productId: 'prod-1',
      branchId: 'branch-1',
      quantity: 2,
    });

    expect(tx.branchOfficeProduct.update).toHaveBeenCalled();
    expect(tx.product.update).toHaveBeenCalledWith({
      where: { id: 'prod-1' },
      data: { stock: { increment: 2 } },
    });
  });

  it('invalidates confirmed stock caches', async () => {
    await invalidateConfirmedStockCaches();

    expect(redisMock.deleteKeysByPrefix).toHaveBeenCalledWith('products:');
    expect(redisMock.deleteKeysByPrefix).toHaveBeenCalledWith('products:select:');
  });

  it('builds a sale exit log input with normalized negative quantity', () => {
    const result = buildSaleExitLogInput({
      productId: 'prod-1',
      branchOfficeId: 'branch-1',
      quantity: 5,
      unitCost: 10,
      totalCost: 50,
      referenceId: 'order-1',
      referenceType: 'ORDER',
      documentNumber: 'ORD-001',
    });

    expect(helpersMock.getSaleExitQuantity).toHaveBeenCalledWith(5);
    expect(result).toEqual(expect.objectContaining({
      quantity: -5,
      type: TransactionType.SALE_EXIT,
    }));
  });
});
