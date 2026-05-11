import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { OrderStatus, TransactionType } from '@prisma/client';

import prisma from '@/config/prisma';
import { OrderService } from '@/module/customer/order/order.service';
import {
  closeIntegrationDbConnection,
  createOrderInventoryFixture,
  ensureIntegrationDbConnection,
  integrationTestsEnabled,
  type OrderInventoryFixture,
} from '../../../helpers/integration-db';

const describeIntegration = integrationTestsEnabled ? describe : describe.skip;

describeIntegration('OrderService integration', () => {
  let fixture: OrderInventoryFixture | null = null;

  beforeAll(async () => {
    await ensureIntegrationDbConnection();
  });

  afterEach(async () => {
    if (fixture) {
      await fixture.cleanup();
      fixture = null;
    }
  });

  afterAll(async () => {
    await closeIntegrationDbConnection();
  });

  it('creates a pending-payment order and reserves stock in the branch product', async () => {
    fixture = await createOrderInventoryFixture();

    const order = await OrderService.create({
      societyId: fixture.refs.societyCode,
      branchId: fixture.refs.branchCode,
      partnerId: fixture.ids.partnerId,
      currencyId: fixture.refs.currencyCode,
      exchangeRate: 1,
      discount: 0,
      status: OrderStatus.PENDING_PAYMENT,
      orderItems: [
        {
          productId: fixture.ids.productId,
          quantity: 3,
          unitPrice: 100,
        },
      ],
    } as any);

    const branchStock = await prisma.branchOfficeProduct.findUniqueOrThrow({
      where: {
        productId_branchOfficeId: {
          productId: fixture.ids.productId,
          branchOfficeId: fixture.ids.branchId,
        },
      },
    });

    const product = await prisma.product.findUniqueOrThrow({
      where: { id: fixture.ids.productId },
    });

    expect(order.status).toBe(OrderStatus.PENDING_PAYMENT);
    expect(branchStock.availableStock).toBe(7);
    expect(branchStock.reservedStock).toBe(3);
    expect(branchStock.physicalStock).toBe(10);
    expect(product.stock).toBe(7);
  });

  it('completes a reserved order and records the kardex خروج', async () => {
    fixture = await createOrderInventoryFixture();

    const createdOrder = await OrderService.create({
      societyId: fixture.refs.societyCode,
      branchId: fixture.refs.branchCode,
      partnerId: fixture.ids.partnerId,
      currencyId: fixture.refs.currencyCode,
      exchangeRate: 1,
      discount: 0,
      status: OrderStatus.PENDING_PAYMENT,
      orderItems: [
        {
          productId: fixture.ids.productId,
          quantity: 2,
          unitPrice: 100,
        },
      ],
    } as any);

    const updatedOrder = await OrderService.update(createdOrder.id, {
      status: OrderStatus.COMPLETED,
    } as any);

    const branchStock = await prisma.branchOfficeProduct.findUniqueOrThrow({
      where: {
        productId_branchOfficeId: {
          productId: fixture.ids.productId,
          branchOfficeId: fixture.ids.branchId,
        },
      },
    });

    const inventoryLogs = await prisma.inventoryTransaction.findMany({
      where: {
        referenceId: createdOrder.id,
        productId: fixture.ids.productId,
      },
      orderBy: { createdAt: 'asc' },
    });

    expect(updatedOrder.status).toBe(OrderStatus.COMPLETED);
    expect(branchStock.availableStock).toBe(8);
    expect(branchStock.reservedStock).toBe(0);
    expect(branchStock.physicalStock).toBe(8);
    expect(inventoryLogs).toHaveLength(1);
    expect(inventoryLogs[0].type).toBe(TransactionType.SALE_EXIT);
    expect(inventoryLogs[0].quantity).toBe(-2);
  });

  it('rejects order creation when branch stock is insufficient', async () => {
    fixture = await createOrderInventoryFixture();

    await expect(
      OrderService.create({
        societyId: fixture.refs.societyCode,
        branchId: fixture.refs.branchCode,
        partnerId: fixture.ids.partnerId,
        currencyId: fixture.refs.currencyCode,
        exchangeRate: 1,
        discount: 0,
        status: OrderStatus.PENDING_PAYMENT,
        orderItems: [
          {
            productId: fixture.ids.productId,
            quantity: 99,
            unitPrice: 100,
          },
        ],
      } as any)
    ).rejects.toThrow('Stock insuficiente');
  });

  it('rejects completing a pending order when stock is no longer available', async () => {
    fixture = await createOrderInventoryFixture();

    const createdOrder = await OrderService.create({
      societyId: fixture.refs.societyCode,
      branchId: fixture.refs.branchCode,
      partnerId: fixture.ids.partnerId,
      currencyId: fixture.refs.currencyCode,
      exchangeRate: 1,
      discount: 0,
      status: OrderStatus.PENDING,
      orderItems: [
        {
          productId: fixture.ids.productId,
          quantity: 4,
          unitPrice: 100,
        },
      ],
    } as any);

    await prisma.branchOfficeProduct.update({
      where: {
        productId_branchOfficeId: {
          productId: fixture.ids.productId,
          branchOfficeId: fixture.ids.branchId,
        },
      },
      data: {
        availableStock: 0,
        physicalStock: 0,
      },
    });

    await prisma.product.update({
      where: { id: fixture.ids.productId },
      data: { stock: 0 },
    });

    await expect(
      OrderService.update(createdOrder.id, {
        status: OrderStatus.COMPLETED,
      } as any)
    ).rejects.toThrow('Stock insuficiente');
  });

  it('cancels a pending-payment order and restores reserved stock', async () => {
    fixture = await createOrderInventoryFixture();

    const createdOrder = await OrderService.create({
      societyId: fixture.refs.societyCode,
      branchId: fixture.refs.branchCode,
      partnerId: fixture.ids.partnerId,
      currencyId: fixture.refs.currencyCode,
      exchangeRate: 1,
      discount: 0,
      status: OrderStatus.PENDING_PAYMENT,
      orderItems: [
        {
          productId: fixture.ids.productId,
          quantity: 4,
          unitPrice: 100,
        },
      ],
    } as any);

    const deletedOrder = await OrderService.delete(createdOrder.id);

    const branchStock = await prisma.branchOfficeProduct.findUniqueOrThrow({
      where: {
        productId_branchOfficeId: {
          productId: fixture.ids.productId,
          branchOfficeId: fixture.ids.branchId,
        },
      },
    });

    const product = await prisma.product.findUniqueOrThrow({
      where: { id: fixture.ids.productId },
    });

    expect(deletedOrder.status).toBe(OrderStatus.CANCELLED);
    expect(branchStock.availableStock).toBe(10);
    expect(branchStock.reservedStock).toBe(0);
    expect(branchStock.physicalStock).toBe(10);
    expect(product.stock).toBe(10);
  });
});
