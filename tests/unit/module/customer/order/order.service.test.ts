import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OrderStatus, TransactionType } from '@prisma/client';

const { prismaMock, redisMock, publisherMock, orderHelpersMock, inventoryServiceMock, dateFormatterMock } = vi.hoisted(() => ({
  prismaMock: {
    $transaction: vi.fn(),
    product: {
      findMany: vi.fn(),
    },
    order: {
      findMany: vi.fn(),
      count: vi.fn(),
      findUnique: vi.fn(),
    },
  },
  redisMock: {
    get: vi.fn(),
    set: vi.fn(),
  },
  publisherMock: {
    publishRealtimeUpdate: vi.fn(),
    publishNotification: vi.fn(),
    NotificationType: {
      SALES: 'SALES',
    },
    NotificationPriority: {
      HIGH: 'HIGH',
    },
  },
  orderHelpersMock: {
    buildOrderWhereClause: vi.fn(),
    resolveSociety: vi.fn(),
    resolveBranch: vi.fn(),
    resolvePartner: vi.fn(),
    resolveCurrency: vi.fn(),
    buildProductMap: vi.fn(),
    calculateOrderItems: vi.fn(),
    calculateOrderTotals: vi.fn(),
    validateBranchStockAvailability: vi.fn(),
    invalidateOrderCaches: vi.fn(),
    ORDER_CACHE_PREFIX: 'orders:',
    ORDER_CACHE_TTL_LIST: 300,
    ORDER_CACHE_TTL_SINGLE: 600,
  },
  inventoryServiceMock: {
    reserveStock: vi.fn(),
    confirmStockOutput: vi.fn(),
    cancelReservation: vi.fn(),
  },
  dateFormatterMock: {
    toLimaTimezone: vi.fn(),
    formatToLimaTime: vi.fn(),
  },
}));

vi.mock('@/config/prisma', () => ({
  default: prismaMock,
}));

vi.mock('@/config/redis', () => ({
  redis: redisMock,
}));

vi.mock('@/config/event-publisher', () => publisherMock);

vi.mock('@/module/customer/order/order.helpers', () => orderHelpersMock);

vi.mock('@/module/inventory/inventory.service', () => ({
  InventoryService: inventoryServiceMock,
}));

vi.mock('@/utils/dateFormatter', () => dateFormatterMock);
vi.mock('@/services/excel.service', () => ({
  ExcelService: {
    generateExcelBuffer: vi.fn().mockResolvedValue(Buffer.from('excel')),
    generateExcelBufferFromBatches: vi.fn().mockResolvedValue(Buffer.from('excel')),
  },
}));

import { OrderService } from '@/module/customer/order/order.service';
import { ExcelService } from '@/services/excel.service';

const flushImmediate = () => new Promise(resolve => setImmediate(resolve));

describe('OrderService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    redisMock.get.mockResolvedValue(null);
    redisMock.set.mockResolvedValue(undefined);
    publisherMock.publishRealtimeUpdate.mockResolvedValue(undefined);
    publisherMock.publishNotification.mockResolvedValue(undefined);
    orderHelpersMock.buildOrderWhereClause.mockResolvedValue({ whereClause: { societyId: 'soc-1' } });
    orderHelpersMock.resolveSociety.mockResolvedValue({ id: 'soc-1', subscriptionId: 'sub-1' });
    orderHelpersMock.resolveBranch.mockResolvedValue({ id: 'branch-1' });
    orderHelpersMock.resolvePartner.mockResolvedValue({ id: 'partner-1', companyName: 'Cliente SAC', firstName: 'Juan', lastName: 'Perez' });
    orderHelpersMock.resolveCurrency.mockResolvedValue({ id: 'currency-1' });
    orderHelpersMock.buildProductMap.mockReturnValue(new Map());
    orderHelpersMock.calculateOrderItems.mockReturnValue([
      {
        productId: 'prod-1',
        quantity: 2,
        unitPrice: 100,
        discount: 0,
        subtotal: 169.49,
        taxAmount: 30.51,
        total: 200,
        costPrice: 50,
      },
    ]);
    orderHelpersMock.calculateOrderTotals.mockReturnValue({
      orderSubtotal: 169.49,
      totalTax: 30.51,
      totalAmount: 200,
    });
    orderHelpersMock.validateBranchStockAvailability.mockResolvedValue(undefined);
    orderHelpersMock.invalidateOrderCaches.mockResolvedValue(undefined);
    inventoryServiceMock.reserveStock.mockResolvedValue(undefined);
    inventoryServiceMock.confirmStockOutput.mockResolvedValue(undefined);
    inventoryServiceMock.cancelReservation.mockResolvedValue(undefined);
    dateFormatterMock.toLimaTimezone.mockImplementation((value: unknown) => value);
    dateFormatterMock.formatToLimaTime.mockImplementation(() => 'formatted');
  });

  it('creates a pending order without triggering stock reservation', async () => {
    prismaMock.product.findMany.mockResolvedValue([{ id: 'prod-1' }]);
    const tx = {
      order: {
        create: vi.fn().mockResolvedValue({
          id: 'order-1',
          orderCode: 'ORD-1',
          status: OrderStatus.PENDING,
          totalAmount: 200,
          orderItems: [{ productId: 'prod-1', quantity: 2 }],
        }),
      },
      product: {
        update: vi.fn(),
      },
    };
    prismaMock.$transaction.mockImplementation(async (callback: (innerTx: typeof tx) => Promise<unknown>) => callback(tx));

    const result = await OrderService.create({
      societyId: 'SOC-001',
      branchId: 'BR-001',
      partnerId: 'PART-001',
      currencyId: 'PEN',
      exchangeRate: 1,
      discount: 0,
      status: OrderStatus.PENDING,
      orderItems: [{ productId: 'prod-1', quantity: 2, unitPrice: 100 }],
    } as any);

    expect(orderHelpersMock.resolveSociety).toHaveBeenCalledWith('SOC-001');
    expect(orderHelpersMock.resolveBranch).toHaveBeenCalledWith('BR-001', 'soc-1');
    expect(orderHelpersMock.resolvePartner).toHaveBeenCalledWith('PART-001');
    expect(orderHelpersMock.resolveCurrency).toHaveBeenCalledWith('PEN');
    expect(prismaMock.product.findMany).toHaveBeenCalledWith({ where: { id: { in: ['prod-1'] } } });
    expect(orderHelpersMock.buildProductMap).toHaveBeenCalled();
    expect(orderHelpersMock.calculateOrderItems).toHaveBeenCalled();
    expect(orderHelpersMock.calculateOrderTotals).toHaveBeenCalledWith(expect.any(Array), 0);
    expect(orderHelpersMock.validateBranchStockAvailability).not.toHaveBeenCalled();
    expect(tx.order.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        societyId: 'soc-1',
        branchId: 'branch-1',
        partnerId: 'partner-1',
        currencyId: 'currency-1',
        subtotal: 169.49,
        taxAmount: 30.51,
        totalAmount: 200,
        status: OrderStatus.PENDING,
      }),
    }));
    expect(inventoryServiceMock.reserveStock).not.toHaveBeenCalled();
    expect(result.id).toBe('order-1');

    await flushImmediate();
    expect(orderHelpersMock.invalidateOrderCaches).toHaveBeenCalledWith('soc-1');
  });

  it('creates a completed order and triggers reservation, stock output and notifications', async () => {
    prismaMock.product.findMany.mockResolvedValue([{ id: 'prod-1' }]);
    const tx = {
      order: {
        create: vi.fn().mockResolvedValue({
          id: 'order-1',
          orderCode: 'ORD-1',
          status: OrderStatus.COMPLETED,
          totalAmount: 200,
          orderItems: [{ productId: 'prod-1', quantity: 2 }],
        }),
      },
      product: {
        update: vi.fn().mockResolvedValue(undefined),
      },
    };
    prismaMock.$transaction.mockImplementation(async (callback: (innerTx: typeof tx) => Promise<unknown>) => callback(tx));

    await OrderService.create({
      societyId: 'SOC-001',
      branchId: 'BR-001',
      partnerId: 'PART-001',
      currencyId: 'PEN',
      exchangeRate: 1,
      discount: 0,
      status: OrderStatus.COMPLETED,
      orderItems: [{ productId: 'prod-1', quantity: 2, unitPrice: 100 }],
    } as any);

    expect(orderHelpersMock.validateBranchStockAvailability).toHaveBeenCalledWith(
      'branch-1',
      ['prod-1'],
      expect.any(Array),
      expect.any(Map)
    );
    expect(inventoryServiceMock.reserveStock).toHaveBeenCalledWith('prod-1', 'branch-1', 2, tx);
    expect(inventoryServiceMock.confirmStockOutput).toHaveBeenCalledWith(expect.objectContaining({
      productId: 'prod-1',
      branchOfficeId: 'branch-1',
      quantity: 2,
      type: TransactionType.SALE_EXIT,
      referenceType: 'ORDER',
      documentNumber: 'ORD-1',
    }), tx);
    expect(tx.product.update).toHaveBeenCalledWith({
      where: { id: 'prod-1' },
      data: { salesCount: { increment: 2 } }
    });

    await flushImmediate();
    expect(publisherMock.publishRealtimeUpdate).toHaveBeenCalledTimes(2);
    expect(publisherMock.publishNotification).toHaveBeenCalledTimes(1);
    expect(orderHelpersMock.invalidateOrderCaches).toHaveBeenCalledWith('soc-1');
  });

  it('returns cached order list when available', async () => {
    const cached = { data: [{ id: 'order-1' }], pagination: { total: 1 } };
    redisMock.get.mockResolvedValueOnce(cached);

    const result = await OrderService.getAll({ page: 1, limit: 10, sortBy: 'createdAt', sortOrder: 'desc' }, {
      societyId: 'soc-1',
    } as any);

    expect(result).toBe(cached);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('queries and caches order list on cache miss', async () => {
    const findManyQuery = { kind: 'findMany' };
    const countQuery = { kind: 'count' };
    prismaMock.order.findMany.mockReturnValue(findManyQuery);
    prismaMock.order.count.mockReturnValue(countQuery);
    prismaMock.$transaction.mockResolvedValueOnce([
      [{
        id: 'order-1',
        _count: { orderItems: 3 },
      }],
      1,
    ]);

    const result = await OrderService.getAll({ page: 1, limit: 10, sortBy: 'createdAt', sortOrder: 'desc' }, {
      societyId: 'soc-1',
      status: OrderStatus.COMPLETED,
    } as any);

    expect(orderHelpersMock.buildOrderWhereClause).toHaveBeenCalled();
    expect(prismaMock.$transaction).toHaveBeenCalledWith([findManyQuery, countQuery]);
    expect(result.data[0].totalProducts).toBe(3);

    await flushImmediate();
    expect(redisMock.set).toHaveBeenCalledWith(
      expect.stringContaining('orders:list:'),
      expect.objectContaining({ data: expect.any(Array) }),
      300
    );
  });

  it('returns cached order detail when available', async () => {
    const cached = { id: 'order-1' };
    redisMock.get.mockResolvedValueOnce(cached);

    const result = await OrderService.getById('order-1');

    expect(result).toBe(cached);
    expect(prismaMock.order.findUnique).not.toHaveBeenCalled();
  });

  it('loads and caches order detail on cache miss', async () => {
    prismaMock.order.findUnique.mockResolvedValueOnce({ id: 'order-1' });

    const result = await OrderService.getById('order-1');

    expect(prismaMock.order.findUnique).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'order-1' },
    }));
    expect(result).toEqual({ id: 'order-1' });

    await flushImmediate();
    expect(redisMock.set).toHaveBeenCalledWith('orders:order-1', { id: 'order-1' }, 600);
  });

  it('updates an order from pending to pending payment and reserves stock', async () => {
    prismaMock.order.findUnique.mockResolvedValueOnce({
      id: 'order-1',
      status: OrderStatus.PENDING,
      orderItems: [{ productId: 'prod-1', quantity: 2, costPrice: 50, unitPrice: 100 }],
    });
    const tx = {
      order: {
        update: vi.fn().mockResolvedValue({
          id: 'order-1',
          societyId: 'soc-1',
          branchId: 'branch-1',
          orderCode: 'ORD-1',
          status: OrderStatus.PENDING_PAYMENT,
          orderItems: [{ productId: 'prod-1', quantity: 2, costPrice: 50, unitPrice: 100 }],
        }),
      },
      product: {
        update: vi.fn(),
      },
    };
    prismaMock.$transaction.mockImplementation(async (callback: (innerTx: typeof tx) => Promise<unknown>) => callback(tx));

    const result = await OrderService.update('order-1', { status: OrderStatus.PENDING_PAYMENT } as any);

    expect(inventoryServiceMock.reserveStock).toHaveBeenCalledWith('prod-1', 'branch-1', 2, tx);
    expect(inventoryServiceMock.confirmStockOutput).not.toHaveBeenCalled();
    expect(result.status).toBe(OrderStatus.PENDING_PAYMENT);

    await flushImmediate();
    expect(orderHelpersMock.invalidateOrderCaches).toHaveBeenCalledWith('soc-1', 'order-1');
  });

  it('updates an order to completed and confirms stock output', async () => {
    prismaMock.product.findMany.mockResolvedValueOnce([{ id: 'prod-1' }]);
    prismaMock.order.findUnique
      .mockResolvedValueOnce({
        id: 'order-1',
        status: OrderStatus.PENDING,
        branchId: 'branch-1',
        orderItems: [{ productId: 'prod-1', quantity: 2, costPrice: 50, unitPrice: 100 }],
      })
      .mockResolvedValueOnce({
        id: 'order-1',
        orderCode: 'ORD-1',
        totalAmount: 200,
        partner: { companyName: 'Cliente SAC', firstName: 'Juan', lastName: 'Perez' },
        society: { subscriptionId: 'sub-1' },
      });

    const tx = {
      order: {
        update: vi.fn().mockResolvedValue({
          id: 'order-1',
          societyId: 'soc-1',
          branchId: 'branch-1',
          orderCode: 'ORD-1',
          totalAmount: 200,
          status: OrderStatus.COMPLETED,
          orderItems: [{ productId: 'prod-1', quantity: 2, costPrice: 50, unitPrice: 100 }],
        }),
      },
      product: {
        update: vi.fn().mockResolvedValue(undefined),
      },
    };
    prismaMock.$transaction.mockImplementation(async (callback: (innerTx: typeof tx) => Promise<unknown>) => callback(tx));

    await OrderService.update('order-1', { status: OrderStatus.COMPLETED } as any);

    expect(orderHelpersMock.validateBranchStockAvailability).toHaveBeenCalledWith(
      'branch-1',
      ['prod-1'],
      expect.any(Array),
      expect.any(Map)
    );
    expect(inventoryServiceMock.reserveStock).toHaveBeenCalledWith('prod-1', 'branch-1', 2, tx);
    expect(inventoryServiceMock.confirmStockOutput).toHaveBeenCalledWith(expect.objectContaining({
      productId: 'prod-1',
      branchOfficeId: 'branch-1',
      quantity: 2,
      type: TransactionType.SALE_EXIT,
    }), tx);
    expect(tx.product.update).toHaveBeenCalledWith({
      where: { id: 'prod-1' },
      data: { salesCount: { increment: 2 } }
    });

    await flushImmediate();
    expect(publisherMock.publishRealtimeUpdate).toHaveBeenCalledTimes(2);
    expect(publisherMock.publishNotification).toHaveBeenCalledTimes(1);
    expect(orderHelpersMock.invalidateOrderCaches).toHaveBeenCalledWith('soc-1', 'order-1');
  });

  it('revalidates stock before completing a pending order', async () => {
    prismaMock.product.findMany.mockResolvedValueOnce([{ id: 'prod-1' }]);
    prismaMock.order.findUnique.mockResolvedValueOnce({
      id: 'order-1',
      status: OrderStatus.PENDING,
      branchId: 'branch-1',
      orderItems: [{
        productId: 'prod-1',
        quantity: 2,
        costPrice: 50,
        unitPrice: 100,
        discount: 0,
        subtotal: 169.49,
        taxAmount: 30.51,
        total: 200,
      }],
    });
    orderHelpersMock.validateBranchStockAvailability.mockRejectedValueOnce(new Error('Stock insuficiente'));

    await expect(
      OrderService.update('order-1', { status: OrderStatus.COMPLETED } as any)
    ).rejects.toThrow('Stock insuficiente');

    expect(orderHelpersMock.validateBranchStockAvailability).toHaveBeenCalledWith(
      'branch-1',
      ['prod-1'],
      expect.any(Array),
      expect.any(Map)
    );
  });

  it('cancels a pending-payment order and releases reservation', async () => {
    prismaMock.order.findUnique.mockResolvedValueOnce({
      id: 'order-1',
      status: OrderStatus.PENDING_PAYMENT,
      branchId: 'branch-1',
      orderItems: [{ productId: 'prod-1', quantity: 2 }],
    });
    const tx = {
      order: {
        update: vi.fn().mockResolvedValue({
          id: 'order-1',
          societyId: 'soc-1',
          status: OrderStatus.CANCELLED,
        }),
      },
    };
    prismaMock.$transaction.mockImplementation(async (callback: (innerTx: typeof tx) => Promise<unknown>) => callback(tx));

    const result = await OrderService.delete('order-1');

    expect(inventoryServiceMock.cancelReservation).toHaveBeenCalledWith('prod-1', 'branch-1', 2, tx);
    expect(tx.order.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'order-1' },
      data: expect.objectContaining({
        status: OrderStatus.CANCELLED,
        cancellationReason: 'Deleted/Cancelled via API',
      }),
    }));
    expect(result.status).toBe(OrderStatus.CANCELLED);

    await flushImmediate();
    expect(orderHelpersMock.invalidateOrderCaches).toHaveBeenCalledWith('soc-1', 'order-1');
  });

  it('throws when trying to delete a completed order', async () => {
    prismaMock.order.findUnique.mockResolvedValueOnce({
      id: 'order-1',
      status: OrderStatus.COMPLETED,
      orderItems: [],
    });

    await expect(OrderService.delete('order-1')).rejects.toThrow('No se puede cancelar una orden completada');
  });

  it('builds the order report in batches with a minimal query shape', async () => {
    vi.mocked(ExcelService.generateExcelBufferFromBatches).mockImplementationOnce(async (batches) => {
      for await (const _batch of batches as AsyncIterable<any[]>) {
        break;
      }
      return Buffer.from('excel');
    });

    prismaMock.order.findMany
      .mockResolvedValueOnce([{
        orderCode: 'ORD-1',
        orderDate: new Date('2026-01-01T10:00:00.000Z'),
        paymentDate: null,
        status: OrderStatus.COMPLETED,
        subtotal: 100,
        taxAmount: 18,
        discount: 0,
        totalAmount: 118,
        partner: { companyName: 'Cliente SAC', firstName: null, lastName: null, documentNumber: '123' },
        currency: { code: 'PEN' },
        branch: { name: 'Principal' },
        OrderPayment: [{ paymentMethod: 'CASH', paymentDate: new Date('2026-01-01T10:05:00.000Z') }],
        orderItems: [{
          quantity: 1,
          unitPrice: 118,
          discount: 0,
          subtotal: 100,
          total: 118,
          product: {
            name: 'Producto',
            code: 'PROD-1',
            category: { name: 'General' },
          },
        }],
      }]);

    const result = await OrderService.getReport({ societyId: 'soc-1' } as any);

    expect(prismaMock.order.findMany).toHaveBeenNthCalledWith(1, expect.objectContaining({
      take: 500,
      skip: 0,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: expect.objectContaining({
        orderCode: true,
        orderDate: true,
        OrderPayment: { select: { paymentMethod: true, paymentDate: true } },
      }),
    }));
    expect(prismaMock.order.findMany).toHaveBeenCalledTimes(1);
    expect(result.buffer).toEqual(Buffer.from('excel'));
    expect(result.subscriptionId).toBeUndefined();
  });
});
