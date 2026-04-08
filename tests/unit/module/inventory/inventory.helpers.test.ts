import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TransactionType } from '@prisma/client';

const { prismaMock, redisMock } = vi.hoisted(() => ({
  prismaMock: {
    society: {
      findUnique: vi.fn(),
    },
  },
  redisMock: {
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
  buildInventoryCacheKey,
  buildInventoryWhereClause,
  getSaleExitQuantity,
  getSignedAdjustmentQuantity,
  invalidateInventoryDomainCaches,
  invalidateInventoryListCache,
  resolveInventorySocietyId,
} from '@/module/inventory/inventory.helpers';

describe('inventory.helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('resolves society id directly when already present', async () => {
    await expect(resolveInventorySocietyId({ societyId: 'soc-1' })).resolves.toBe('soc-1');
    expect(prismaMock.society.findUnique).not.toHaveBeenCalled();
  });

  it('resolves society id by code', async () => {
    prismaMock.society.findUnique.mockResolvedValueOnce({ id: 'soc-2' });

    await expect(resolveInventorySocietyId({ societyCode: 'SOC-002' })).resolves.toBe('soc-2');
    expect(prismaMock.society.findUnique).toHaveBeenCalledWith({
      where: { code: 'SOC-002' },
    });
  });

  it('returns null when society code does not exist', async () => {
    prismaMock.society.findUnique.mockResolvedValueOnce(null);

    await expect(resolveInventorySocietyId({ societyCode: 'UNKNOWN' })).resolves.toBeNull();
  });

  it('builds a cache key with resolved filter values', () => {
    const cacheKey = buildInventoryCacheKey('soc-1', 2, 20, 'date', 'desc', {
      branchId: 'branch-1',
      productId: 'prod-1',
      type: TransactionType.SALE_EXIT,
      startDate: '2026-01-01',
      endDate: '2026-01-31',
    });

    expect(cacheKey).toBe('inventory:list:soc-1:branch-1:prod-1:SALE_EXIT:2026-01-01:2026-01-31:2:20:date:desc');
  });

  it('builds an inventory where clause with search and dates', () => {
    const whereClause = buildInventoryWhereClause('soc-1', {
      branchId: 'branch-1',
      productId: 'prod-1',
      type: TransactionType.ADJUSTMENT_ADD,
      startDate: '2026-01-01T00:00:00.000Z',
      endDate: '2026-01-31T23:59:59.999Z',
      search: 'DOC-001',
    });

    expect(whereClause.product).toEqual({ societyId: 'soc-1' });
    expect(whereClause.branchOfficeId).toBe('branch-1');
    expect(whereClause.productId).toBe('prod-1');
    expect(whereClause.type).toBe(TransactionType.ADJUSTMENT_ADD);
    expect(whereClause.date.gte).toBeInstanceOf(Date);
    expect(whereClause.date.lte).toBeInstanceOf(Date);
    expect(whereClause.OR).toBeDefined();
  });

  it('returns positive quantity for adjustment add and negative for adjustment sub', () => {
    expect(getSignedAdjustmentQuantity(TransactionType.ADJUSTMENT_ADD, 7)).toBe(7);
    expect(getSignedAdjustmentQuantity(TransactionType.ADJUSTMENT_SUB, 7)).toBe(-7);
  });

  it('always returns negative quantity for sale exit', () => {
    expect(getSaleExitQuantity(5)).toBe(-5);
    expect(getSaleExitQuantity(-5)).toBe(-5);
  });

  it('invalidates inventory list cache', async () => {
    redisMock.deleteKeysByPrefix.mockResolvedValue(undefined);

    await invalidateInventoryListCache();

    expect(redisMock.deleteKeysByPrefix).toHaveBeenCalledWith('inventory:list:');
  });

  it('invalidates inventory domain caches', async () => {
    redisMock.deleteKeysByPrefix.mockResolvedValue(undefined);

    await invalidateInventoryDomainCaches();

    expect(redisMock.deleteKeysByPrefix).toHaveBeenCalledWith('products:');
    expect(redisMock.deleteKeysByPrefix).toHaveBeenCalledWith('products:select:');
    expect(redisMock.deleteKeysByPrefix).toHaveBeenCalledWith('branch_office_products:');
    expect(redisMock.deleteKeysByPrefix).toHaveBeenCalledWith('inventory:list:');
  });
});
