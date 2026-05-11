import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OrderStatus, TransactionType } from '@prisma/client';

const { prismaMock, publisherMock, inventoryServiceMock, orderHelpersMock } = vi.hoisted(() => ({
  prismaMock: {
    order: {
      findUnique: vi.fn(),
    },
  },
  publisherMock: {
    publishNotification: vi.fn(),
    publishRealtimeUpdate: vi.fn(),
    NotificationPriority: {
      HIGH: 'HIGH',
    },
    NotificationType: {
      SALES: 'SALES',
    },
  },
  inventoryServiceMock: {
    reserveStock: vi.fn(),
    confirmStockOutput: vi.fn(),
    cancelReservation: vi.fn(),
  },
  orderHelpersMock: {
    invalidateOrderCaches: vi.fn(),
    ORDER_CACHE_PREFIX: 'orders:',
  },
}));

vi.mock('@/config/prisma', () => ({
  default: prismaMock,
}));

vi.mock('@/config/event-publisher', () => publisherMock);

vi.mock('@/module/inventory/inventory.service', () => ({
  InventoryService: inventoryServiceMock,
}));

vi.mock('@/module/customer/order/order.helpers', () => orderHelpersMock);

import {
  applyOrderCreateInventoryEffects,
  applyOrderUpdateStatusEffects,
  buildOrderDetailCacheKey,
  buildOrderListCacheKey,
  buildOrderReportRows,
  publishCompletedOrderNotifications,
  scheduleOrderCreateSideEffects,
  scheduleOrderDeleteSideEffects,
  scheduleOrderUpdateSideEffects,
} from '@/module/customer/order/order.service.support';

const flushImmediate = () => new Promise(resolve => setImmediate(resolve));

describe('order.service.support', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    publisherMock.publishNotification.mockResolvedValue(undefined);
    publisherMock.publishRealtimeUpdate.mockResolvedValue(undefined);
    inventoryServiceMock.reserveStock.mockResolvedValue(undefined);
    inventoryServiceMock.confirmStockOutput.mockResolvedValue(undefined);
    inventoryServiceMock.cancelReservation.mockResolvedValue(undefined);
    orderHelpersMock.invalidateOrderCaches.mockResolvedValue(undefined);
  });

  it('builds order list cache keys with all filter segments', () => {
    const key = buildOrderListCacheKey(1, 10, 'createdAt', 'desc', {
      societyCode: 'SOC-001',
      branchId: 'branch-1',
      partnerId: 'partner-1',
      status: 'COMPLETED',
      search: 'cliente',
      dateFrom: '2026-01-01',
      dateTo: '2026-01-31',
      totalAmountFrom: 10,
      totalAmountTo: 100,
      createdBy: 'user-1',
    });

    expect(key).toBe('orders:list:SOC-001:branch-1:partner-1:COMPLETED:cliente:2026-01-01:2026-01-31:10:100:user-1:1:10:createdAt:desc');
  });

  it('builds order detail cache key', () => {
    expect(buildOrderDetailCacheKey('order-1')).toBe('orders:order-1');
  });

  it('applies create inventory effects for completed orders', async () => {
    const tx = {
      product: {
        update: vi.fn().mockResolvedValue(undefined),
      },
    };

    await applyOrderCreateInventoryEffects(
      { id: 'order-1', orderCode: 'ORD-1', status: OrderStatus.COMPLETED },
      [{ productId: 'prod-1', quantity: 2 }],
      'branch-1',
      tx
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
      data: { salesCount: { increment: 2 } },
    });
  });

  it('applies update status effects from pending to completed', async () => {
    const tx = {
      product: {
        update: vi.fn().mockResolvedValue(undefined),
      },
    };

    const result = await applyOrderUpdateStatusEffects(
      OrderStatus.PENDING,
      {
        id: 'order-1',
        orderCode: 'ORD-1',
        branchId: 'branch-1',
        orderItems: [{ productId: 'prod-1', quantity: 2, costPrice: 50, unitPrice: 100 }],
      },
      OrderStatus.COMPLETED,
      tx
    );

    expect(inventoryServiceMock.reserveStock).toHaveBeenCalledWith('prod-1', 'branch-1', 2, tx);
    expect(inventoryServiceMock.confirmStockOutput).toHaveBeenCalledWith(expect.objectContaining({
      unitCost: 50,
      totalCost: 200,
      referenceId: 'order-1',
    }), tx);
    expect(tx.product.update).toHaveBeenCalledWith({
      where: { id: 'prod-1' },
      data: { salesCount: { increment: 2 } },
    });
    expect(result).toEqual({
      isCompleting: true,
      isConfirmingPayment: false,
      isCancelling: false,
    });
  });

  it('applies update status effects for cancellation of reserved orders', async () => {
    const result = await applyOrderUpdateStatusEffects(
      OrderStatus.PENDING_PAYMENT,
      {
        id: 'order-1',
        orderCode: 'ORD-1',
        branchId: 'branch-1',
        orderItems: [{ productId: 'prod-1', quantity: 2, costPrice: 50, unitPrice: 100 }],
      },
      OrderStatus.CANCELLED,
      {}
    );

    expect(inventoryServiceMock.cancelReservation).toHaveBeenCalledWith('prod-1', 'branch-1', 2, {});
    expect(result).toEqual({
      isCompleting: false,
      isConfirmingPayment: false,
      isCancelling: true,
    });
  });

  it('publishes completed order notifications', async () => {
    await publishCompletedOrderNotifications({
      subscriptionId: 'sub-1',
      order: { id: 'order-1', orderCode: 'ORD-1', totalAmount: 200 },
      partnerName: 'Cliente SAC',
    });

    expect(publisherMock.publishRealtimeUpdate).toHaveBeenCalledTimes(2);
    expect(publisherMock.publishNotification).toHaveBeenCalledTimes(1);
  });

  it('schedules create side effects and invalidates caches', async () => {
    scheduleOrderCreateSideEffects(
      { id: 'order-1', orderCode: 'ORD-1', totalAmount: 200, status: OrderStatus.COMPLETED },
      { id: 'soc-1', subscriptionId: 'sub-1' },
      { companyName: 'Cliente SAC' }
    );

    await flushImmediate();
    expect(publisherMock.publishRealtimeUpdate).toHaveBeenCalledTimes(2);
    expect(publisherMock.publishNotification).toHaveBeenCalledTimes(1);
    expect(orderHelpersMock.invalidateOrderCaches).toHaveBeenCalledWith('soc-1');
  });

  it('schedules update side effects and loads the full order when completing', async () => {
    prismaMock.order.findUnique.mockResolvedValueOnce({
      id: 'order-1',
      orderCode: 'ORD-1',
      totalAmount: 200,
      partner: { companyName: 'Cliente SAC', firstName: 'Juan', lastName: 'Perez' },
      society: { subscriptionId: 'sub-1' },
    });

    scheduleOrderUpdateSideEffects({ id: 'order-1', societyId: 'soc-1' }, 'order-1', true);

    await flushImmediate();
    expect(prismaMock.order.findUnique).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'order-1' },
    }));
    expect(orderHelpersMock.invalidateOrderCaches).toHaveBeenCalledWith('soc-1', 'order-1');
  });

  it('schedules delete side effects and invalidates caches', async () => {
    scheduleOrderDeleteSideEffects('soc-1', 'order-1');

    await flushImmediate();
    expect(orderHelpersMock.invalidateOrderCaches).toHaveBeenCalledWith('soc-1', 'order-1');
  });

  it('builds report rows for orders with and without items', () => {
    const rows = buildOrderReportRows([
      {
        orderCode: 'ORD-1',
        orderDate: new Date('2026-01-01T10:00:00Z'),
        paymentDate: null,
        status: 'COMPLETED',
        subtotal: 100,
        taxAmount: 18,
        discount: 0,
        totalAmount: 118,
        partner: { companyName: 'Cliente SAC', firstName: '', lastName: '', documentNumber: '12345678' },
        branch: { name: 'Sucursal 1' },
        currency: { code: 'PEN' },
        OrderPayment: [{ paymentMethod: 'YAPE', paymentDate: new Date('2026-01-01T11:00:00Z') }],
        orderItems: [{
          quantity: 2,
          unitPrice: 59,
          discount: 0,
          subtotal: 100,
          total: 118,
          product: { name: 'Producto 1', code: 'P001', category: { name: 'Cat 1' } },
        }],
      },
      {
        orderCode: 'ORD-2',
        orderDate: new Date('2026-01-02T10:00:00Z'),
        paymentDate: null,
        status: 'PENDING',
        subtotal: 0,
        taxAmount: 0,
        discount: 0,
        totalAmount: 0,
        partner: { companyName: null, firstName: 'Juan', lastName: 'Perez', documentNumber: '87654321' },
        branch: { name: 'Sucursal 2' },
        currency: { code: 'USD' },
        OrderPayment: [],
        orderItems: [],
      },
    ], () => 'formatted');

    expect(rows).toHaveLength(2);
    expect(rows[0]['Método Pago']).toBe('Yape');
    expect(rows[0]['Categoría']).toBe('Cat 1');
    expect(rows[1]['Producto']).toBe('N/A');
    expect(rows[1]['Estado']).toBe('Pendiente');
  });
});
