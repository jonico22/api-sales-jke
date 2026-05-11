import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { TransactionType } from '@prisma/client';

import prisma from '@/config/prisma';
import { InventoryService } from '@/module/inventory/inventory.service';
import {
  closeIntegrationDbConnection,
  createOrderInventoryFixture,
  ensureIntegrationDbConnection,
  integrationTestsEnabled,
  type OrderInventoryFixture,
} from '../../helpers/integration-db';

const describeIntegration = integrationTestsEnabled ? describe : describe.skip;

describeIntegration('InventoryService integration', () => {
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

  it('creates a manual adjustment and persists stock + kardex changes', async () => {
    fixture = await createOrderInventoryFixture();

    const transaction = await InventoryService.createAdjustment({
      productId: fixture.ids.productId,
      branchOfficeId: fixture.ids.branchId,
      type: TransactionType.ADJUSTMENT_ADD,
      quantity: 5,
      notes: 'integration adjustment',
    } as any, 'integration-user');

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

    const savedTransaction = await prisma.inventoryTransaction.findUniqueOrThrow({
      where: { id: transaction.id },
    });

    expect(branchStock.physicalStock).toBe(15);
    expect(branchStock.availableStock).toBe(15);
    expect(product.stock).toBe(15);
    expect(savedTransaction.type).toBe(TransactionType.ADJUSTMENT_ADD);
    expect(savedTransaction.quantity).toBe(5);
    expect(savedTransaction.previousStock).toBe(10);
    expect(savedTransaction.newStock).toBe(15);
  });

  it('returns kardex data filtered by society and product after an adjustment', async () => {
    fixture = await createOrderInventoryFixture();

    await InventoryService.createAdjustment({
      productId: fixture.ids.productId,
      branchOfficeId: fixture.ids.branchId,
      type: TransactionType.ADJUSTMENT_ADD,
      quantity: 2,
      notes: 'filter check',
    } as any, 'integration-user');

    const result = await InventoryService.getAll(
      { page: 1, limit: 10, sortBy: 'date', sortOrder: 'desc' },
      {
        societyCode: fixture.refs.societyCode,
        branchId: fixture.ids.branchId,
        productId: fixture.ids.productId,
      } as any
    );

    expect(result.pagination.total).toBe(1);
    expect(result.data[0].productId).toBe(fixture.ids.productId);
    expect(result.data[0].branchOfficeId).toBe(fixture.ids.branchId);
    expect(result.data[0].type).toBe(TransactionType.ADJUSTMENT_ADD);
  });
});
