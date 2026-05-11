import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OrderStatus } from '@prisma/client';

const { prismaMock, redisMock } = vi.hoisted(() => ({
  prismaMock: {
    society: {
      findUnique: vi.fn(),
    },
    branchOfficeProduct: {
      findMany: vi.fn(),
    },
  },
  redisMock: {
    deleteKeysByPrefix: vi.fn(),
    del: vi.fn(),
  },
}));

vi.mock('@/config/prisma', () => ({
  default: prismaMock,
}));

vi.mock('@/config/redis', () => ({
  redis: redisMock,
}));

import {
  buildOrderWhereClause,
  buildProductMap,
  calculateOrderItems,
  calculateOrderTotals,
  invalidateOrderCaches,
  isUuid,
  validateBranchStockAvailability,
} from '@/module/customer/order/order.helpers';

describe('order.helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('detects valid UUID values', () => {
    expect(isUuid('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
    expect(isUuid('SOC-001')).toBe(false);
  });

  it('builds a product map keyed by product id', () => {
    const productMap = buildProductMap([
      {
        id: 'prod-1',
        name: 'Producto 1',
        price: 100,
        priceCost: 60,
        code: 'P001',
      } as any,
      {
        id: 'prod-2',
        name: 'Producto 2',
        price: 50,
        priceCost: 30,
        code: 'P002',
      } as any,
    ]);

    expect(productMap.get('prod-1')?.name).toBe('Producto 1');
    expect(productMap.get('prod-2')?.code).toBe('P002');
  });

  it('calculates order items preserving gross total and discount delta', () => {
    const productMap = buildProductMap([
      {
        id: 'prod-1',
        name: 'Producto 1',
        price: 100,
        priceCost: 40,
        code: 'P001',
      } as any,
    ]);

    const items = calculateOrderItems(
      [
        {
          productId: 'prod-1',
          quantity: 2,
          unitPrice: 80,
          comment: 'precio promocional',
        },
      ],
      productMap
    );

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      productId: 'prod-1',
      quantity: 2,
      unitPrice: 100,
      discount: 40,
      total: 160,
      costPrice: 40,
      comment: 'precio promocional',
    });
    expect(items[0].subtotal).toBeCloseTo(135.59, 2);
    expect(items[0].taxAmount).toBeCloseTo(24.41, 2);
  });

  it('calculates aggregated order totals with a floor at zero', () => {
    const totals = calculateOrderTotals(
      [
        {
          productId: 'prod-1',
          quantity: 1,
          unitPrice: 100,
          discount: 0,
          subtotal: 84.75,
          taxAmount: 15.25,
          total: 100,
          costPrice: 50,
        },
        {
          productId: 'prod-2',
          quantity: 1,
          unitPrice: 50,
          discount: 0,
          subtotal: 42.37,
          taxAmount: 7.63,
          total: 50,
          costPrice: 20,
        },
      ],
      500
    );

    expect(totals.orderTotalGross).toBe(150);
    expect(totals.orderSubtotal).toBeCloseTo(127.12, 2);
    expect(totals.totalTax).toBeCloseTo(22.88, 2);
    expect(totals.totalAmount).toBe(0);
  });

  it('builds order filters using society code and returns subscription id', async () => {
    prismaMock.society.findUnique.mockResolvedValueOnce({
      id: 'soc-1',
      subscriptionId: 'sub-1',
    });

    const result = await buildOrderWhereClause({
      societyCode: 'SOC-001',
      status: OrderStatus.COMPLETED,
      branchId: 'branch-1',
      search: 'cliente',
      totalAmountFrom: 10,
      totalAmountTo: 100,
      createdBy: 'user-1',
    });

    expect(prismaMock.society.findUnique).toHaveBeenCalledWith({
      where: { code: 'SOC-001' },
    });
    expect(result.subscriptionId).toBe('sub-1');
    expect(result.whereClause.societyId).toBe('soc-1');
    expect(result.whereClause.status).toBe(OrderStatus.COMPLETED);
    expect(result.whereClause.branchId).toBe('branch-1');
    expect(result.whereClause.createdBy).toBe('user-1');
    expect(result.whereClause.totalAmount).toEqual({ gte: 10, lte: 100 });
    expect(result.whereClause.OR).toBeDefined();
  });

  it('returns an empty-result filter when society code is invalid', async () => {
    prismaMock.society.findUnique.mockResolvedValueOnce(null);

    const result = await buildOrderWhereClause({ societyCode: 'UNKNOWN' });

    expect(result.whereClause).toEqual({
      id: '00000000-0000-0000-0000-000000000000',
    });
    expect(result.subscriptionId).toBeUndefined();
  });

  it('validates branch stock availability successfully', async () => {
    prismaMock.branchOfficeProduct.findMany.mockResolvedValueOnce([
      { productId: 'prod-1', availableStock: 5 },
    ]);

    const productMap = buildProductMap([
      {
        id: 'prod-1',
        name: 'Producto 1',
        code: 'P001',
        price: 100,
        priceCost: 50,
      } as any,
    ]);

    await expect(
      validateBranchStockAvailability(
        'branch-1',
        ['prod-1'],
        [
          {
            productId: 'prod-1',
            quantity: 3,
            unitPrice: 100,
            discount: 0,
            subtotal: 84.75,
            taxAmount: 15.25,
            total: 100,
            costPrice: 50,
          },
        ],
        productMap
      )
    ).resolves.toBeUndefined();
  });

  it('throws when branch stock is insufficient', async () => {
    prismaMock.branchOfficeProduct.findMany.mockResolvedValueOnce([
      { productId: 'prod-1', availableStock: 1 },
    ]);

    const productMap = buildProductMap([
      {
        id: 'prod-1',
        name: 'Producto 1',
        code: 'P001',
        price: 100,
        priceCost: 50,
      } as any,
    ]);

    await expect(
      validateBranchStockAvailability(
        'branch-1',
        ['prod-1'],
        [
          {
            productId: 'prod-1',
            quantity: 3,
            unitPrice: 100,
            discount: 0,
            subtotal: 84.75,
            taxAmount: 15.25,
            total: 100,
            costPrice: 50,
          },
        ],
        productMap
      )
    ).rejects.toThrow('Stock insuficiente');
  });

  it('invalidates order-related caches', async () => {
    redisMock.deleteKeysByPrefix.mockResolvedValue(undefined);
    redisMock.del.mockResolvedValue(undefined);

    await invalidateOrderCaches('soc-1', 'order-1');

    expect(redisMock.del).toHaveBeenCalledWith('orders:order-1');
    expect(redisMock.deleteKeysByPrefix).toHaveBeenCalledWith('orders:list:');
    expect(redisMock.deleteKeysByPrefix).toHaveBeenCalledWith('products:');
    expect(redisMock.deleteKeysByPrefix).toHaveBeenCalledWith('products:select:');
    expect(redisMock.deleteKeysByPrefix).toHaveBeenCalledWith('branch_office_products:');
  });
});
