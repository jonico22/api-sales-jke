import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TransactionType } from '@prisma/client';

const { prismaMock, redisMock, helpersMock, supportMock } = vi.hoisted(() => ({
  prismaMock: {
    $transaction: vi.fn(),
    inventoryTransaction: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
  },
  redisMock: {
    get: vi.fn(),
    set: vi.fn(),
    deleteKeysByPrefix: vi.fn(),
  },
  helpersMock: {
    buildInventoryCacheKey: vi.fn(),
    buildInventoryWhereClause: vi.fn(),
    getSaleExitQuantity: vi.fn(),
    getSignedAdjustmentQuantity: vi.fn(),
    invalidateInventoryDomainCaches: vi.fn(),
    invalidateInventoryListCache: vi.fn(),
    resolveInventorySocietyId: vi.fn(),
    INVENTORY_CACHE_TTL_LIST: 60,
  },
  supportMock: {
    scheduleInventoryListInvalidation: vi.fn(),
    scheduleInventoryDomainInvalidation: vi.fn(),
    createInventoryTransactionRecord: vi.fn(),
    resolveAdjustmentUnitCost: vi.fn(),
    applyManualAdjustmentStock: vi.fn(),
    applyReserveStock: vi.fn(),
    applyConfirmStockOutput: vi.fn(),
    applyCancelReservation: vi.fn(),
    invalidateConfirmedStockCaches: vi.fn(),
    buildSaleExitLogInput: vi.fn(),
  },
}));

vi.mock('@/config/prisma', () => ({
  prisma: prismaMock,
}));

vi.mock('@/config/redis', () => ({
  redis: redisMock,
}));

vi.mock('@/module/inventory/inventory.helpers', () => helpersMock);
vi.mock('@/module/inventory/inventory.service.support', () => supportMock);

import { InventoryService } from '@/module/inventory/inventory.service';

const flushImmediate = () => new Promise(resolve => setImmediate(resolve));

describe('InventoryService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    redisMock.get.mockResolvedValue(null);
    redisMock.set.mockResolvedValue(undefined);
    redisMock.deleteKeysByPrefix.mockResolvedValue(undefined);
    helpersMock.buildInventoryCacheKey.mockReturnValue('inventory:list:test');
    helpersMock.buildInventoryWhereClause.mockReturnValue({ product: { societyId: 'soc-1' } });
    helpersMock.getSaleExitQuantity.mockImplementation((quantity: number) => -Math.abs(quantity));
    helpersMock.getSignedAdjustmentQuantity.mockImplementation((type: TransactionType, quantity: number) => (
      type === TransactionType.ADJUSTMENT_SUB ? -Math.abs(quantity) : Math.abs(quantity)
    ));
    helpersMock.invalidateInventoryDomainCaches.mockResolvedValue(undefined);
    helpersMock.invalidateInventoryListCache.mockResolvedValue(undefined);
    helpersMock.resolveInventorySocietyId.mockResolvedValue('soc-1');
    supportMock.scheduleInventoryListInvalidation.mockImplementation(() => undefined);
    supportMock.scheduleInventoryDomainInvalidation.mockImplementation(() => undefined);
    supportMock.createInventoryTransactionRecord.mockResolvedValue({ id: 'trx-1' });
    supportMock.resolveAdjustmentUnitCost.mockResolvedValue(12.5);
    supportMock.applyManualAdjustmentStock.mockResolvedValue(undefined);
    supportMock.applyReserveStock.mockResolvedValue({ id: 'bop-1' });
    supportMock.applyConfirmStockOutput.mockResolvedValue(undefined);
    supportMock.applyCancelReservation.mockResolvedValue(undefined);
    supportMock.invalidateConfirmedStockCaches.mockResolvedValue(undefined);
    supportMock.buildSaleExitLogInput.mockImplementation((input: any) => ({
      ...input,
      quantity: -Math.abs(input.quantity),
      type: TransactionType.SALE_EXIT,
    }));
  });

  it('logs a transaction using the current physical stock snapshot', async () => {
    const tx = {};

    const result = await InventoryService.logTransaction({
      productId: 'prod-1',
      branchOfficeId: 'branch-1',
      type: TransactionType.ADJUSTMENT_ADD,
      quantity: 3,
      unitCost: 10,
      totalCost: 30,
    }, tx);

    expect(supportMock.createInventoryTransactionRecord).toHaveBeenCalledWith(tx, expect.objectContaining({
      productId: 'prod-1',
      branchOfficeId: 'branch-1',
      type: TransactionType.ADJUSTMENT_ADD,
      quantity: 3,
      unitCost: 10,
      totalCost: 30,
    }));
    expect(result).toEqual({ id: 'trx-1' });
    expect(supportMock.scheduleInventoryListInvalidation).toHaveBeenCalled();
  });

  it('throws when logTransaction cannot find the branch product', async () => {
    supportMock.createInventoryTransactionRecord.mockRejectedValueOnce(
      new Error('Product prod-1 not found in branch branch-1 during Kardex Log')
    );

    await expect(
      InventoryService.logTransaction({
        productId: 'prod-1',
        branchOfficeId: 'branch-1',
        type: TransactionType.ADJUSTMENT_ADD,
        quantity: 1,
        unitCost: 5,
        totalCost: 5,
      }, {})
    ).rejects.toThrow('Product prod-1 not found in branch branch-1');
  });

  it('returns cached kardex data when available', async () => {
    const cachedResult = { data: [{ id: 'trx-1' }], pagination: { total: 1 } };
    redisMock.get.mockResolvedValueOnce(cachedResult);

    const result = await InventoryService.getAll({ page: 1, limit: 20, sortBy: 'date', sortOrder: 'desc' }, {
      societyCode: 'SOC-1',
    } as any);

    expect(result).toBe(cachedResult);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('queries and caches kardex data on cache miss', async () => {
    const findManyQuery = { kind: 'findMany' };
    const countQuery = { kind: 'count' };
    prismaMock.inventoryTransaction.findMany.mockReturnValue(findManyQuery);
    prismaMock.inventoryTransaction.count.mockReturnValue(countQuery);
    prismaMock.$transaction.mockResolvedValueOnce([
      [{ id: 'trx-1' }],
      1,
    ]);

    const result = await InventoryService.getAll({ page: 1, limit: 20, sortBy: 'date', sortOrder: 'desc' }, {
      societyId: 'soc-1',
      branchId: 'branch-1',
    } as any);

    expect(helpersMock.buildInventoryCacheKey).toHaveBeenCalled();
    expect(helpersMock.buildInventoryWhereClause).toHaveBeenCalledWith('soc-1', expect.objectContaining({
      societyId: 'soc-1',
      branchId: 'branch-1',
    }));
    expect(prismaMock.$transaction).toHaveBeenCalledWith([findManyQuery, countQuery]);
    expect(redisMock.set).toHaveBeenCalledWith(
      'inventory:list:test',
      expect.objectContaining({
        data: [{ id: 'trx-1' }],
      }),
      60
    );
    expect(result.pagination.total).toBe(1);
  });

  it('returns an empty paginated result when society code is invalid', async () => {
    helpersMock.resolveInventorySocietyId.mockResolvedValueOnce(null);

    const result = await InventoryService.getAll({ page: 1, limit: 20 }, {
      societyCode: 'UNKNOWN',
    } as any);

    expect(result.data).toEqual([]);
    expect(result.pagination.total).toBe(0);
  });

  it('creates a manual adjustment using product cost when unitCost is omitted', async () => {
    const tx = {};

    prismaMock.$transaction.mockImplementation(async (callback: (innerTx: typeof tx) => Promise<unknown>) => callback(tx));
    const logSpy = vi.spyOn(InventoryService, 'logTransaction').mockResolvedValue({ id: 'trx-1' } as any);

    const result = await InventoryService.createAdjustment({
      productId: 'prod-1',
      branchOfficeId: 'branch-1',
      type: TransactionType.ADJUSTMENT_ADD,
      quantity: 4,
      notes: 'conteo inicial',
    }, 'user-1');

    expect(supportMock.resolveAdjustmentUnitCost).toHaveBeenCalledWith(tx, 'prod-1', undefined);
    expect(helpersMock.getSignedAdjustmentQuantity).toHaveBeenCalledWith(TransactionType.ADJUSTMENT_ADD, 4);
    expect(supportMock.applyManualAdjustmentStock).toHaveBeenCalledWith(tx, {
      productId: 'prod-1',
      branchOfficeId: 'branch-1',
      signedQuantity: 4,
    });
    expect(logSpy).toHaveBeenCalledWith(expect.objectContaining({
      productId: 'prod-1',
      branchOfficeId: 'branch-1',
      type: TransactionType.ADJUSTMENT_ADD,
      quantity: 4,
      unitCost: 12.5,
      totalCost: 50,
      referenceType: 'MANUAL_ADJUSTMENT',
      documentNumber: 'conteo inicial',
    }), tx);
    expect(result).toEqual({ id: 'trx-1' });
    expect(supportMock.scheduleInventoryDomainInvalidation).toHaveBeenCalledWith('adjustment');
  });

  it('throws when createAdjustment cannot resolve the product cost', async () => {
    const tx = {};
    supportMock.resolveAdjustmentUnitCost.mockRejectedValueOnce(new Error('Producto no encontrado'));
    prismaMock.$transaction.mockImplementation(async (callback: (innerTx: typeof tx) => Promise<unknown>) => callback(tx));

    await expect(
      InventoryService.createAdjustment({
        productId: 'prod-1',
        branchOfficeId: 'branch-1',
        type: TransactionType.ADJUSTMENT_ADD,
        quantity: 4,
      }, 'user-1')
    ).rejects.toThrow('Producto no encontrado');
  });

  it('reserves stock by moving it from available to reserved and decrementing global stock', async () => {
    const tx = {};

    const result = await InventoryService.reserveStock('prod-1', 'branch-1', 3, tx);

    expect(supportMock.applyReserveStock).toHaveBeenCalledWith(tx, {
      productId: 'prod-1',
      branchId: 'branch-1',
      quantity: 3,
    });
    expect(result).toEqual({ id: 'bop-1' });
  });

  it('confirms stock output and records a sale exit transaction', async () => {
    const tx = {};
    const logSpy = vi.spyOn(InventoryService, 'logTransaction').mockResolvedValue({ id: 'trx-1' } as any);

    const result = await InventoryService.confirmStockOutput({
      productId: 'prod-1',
      branchOfficeId: 'branch-1',
      type: TransactionType.SALE_EXIT,
      quantity: 5,
      unitCost: 11,
      totalCost: 55,
      referenceId: 'order-1',
      referenceType: 'ORDER',
      documentNumber: 'ORD-001',
    }, tx);

    expect(supportMock.applyConfirmStockOutput).toHaveBeenCalledWith(tx, {
      productId: 'prod-1',
      branchOfficeId: 'branch-1',
      quantity: 5,
    });
    expect(supportMock.buildSaleExitLogInput).toHaveBeenCalledWith(expect.objectContaining({
      productId: 'prod-1',
      branchOfficeId: 'branch-1',
      quantity: 5,
    }));
    expect(logSpy).toHaveBeenCalledWith(expect.objectContaining({
      quantity: -5,
      type: TransactionType.SALE_EXIT,
    }), tx);
    expect(supportMock.invalidateConfirmedStockCaches).toHaveBeenCalled();
    expect(result).toEqual({ id: 'trx-1' });
  });

  it('cancels a reservation and restores available stock', async () => {
    const tx = {};

    await InventoryService.cancelReservation('prod-1', 'branch-1', 2, tx);

    expect(supportMock.applyCancelReservation).toHaveBeenCalledWith(tx, {
      productId: 'prod-1',
      branchId: 'branch-1',
      quantity: 2,
    });
    expect(supportMock.scheduleInventoryDomainInvalidation).toHaveBeenCalledWith('cancelReservation');
  });
});
