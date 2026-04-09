import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { PartnerType, PurchaseStatus, TransactionType } from '@prisma/client';

import prisma from '@/config/prisma';
import { createPurchase, updatePurchase } from '@/module/customer/purchase/purchase.service';
import {
  closeIntegrationDbConnection,
  createOrderInventoryFixture,
  ensureIntegrationDbConnection,
  integrationTestsEnabled,
  type OrderInventoryFixture,
} from '../../../helpers/integration-db';

const describeIntegration = integrationTestsEnabled ? describe : describe.skip;

describeIntegration('PurchaseService integration', () => {
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

  it('creates a pending purchase for a supplier', async () => {
    fixture = await createOrderInventoryFixture({
      partnerType: PartnerType.SUPPLIER,
      initialStock: 0,
    });

    const purchase = await createPurchase({
      societyId: fixture.refs.societyCode,
      providerId: fixture.ids.partnerId,
      currencyId: fixture.ids.currencyId,
      branchOfficeId: fixture.ids.branchId,
      totalAmount: 300,
      subTotal: 254.24,
      taxAmount: 45.76,
      exchangeRate: 1,
      status: PurchaseStatus.PENDING,
      documentNumber: `PUR-${fixture.refs.societyCode}`,
    } as any);

    expect(purchase.status).toBe(PurchaseStatus.PENDING);
    expect(purchase.providerId).toBe(fixture.ids.partnerId);
    expect(purchase.societyId).toBe(fixture.ids.societyId);
  });

  it('completes a purchase and updates stock, cost and kardex', async () => {
    fixture = await createOrderInventoryFixture({
      partnerType: PartnerType.SUPPLIER,
      initialStock: 0,
    });

    const purchase = await createPurchase({
      societyId: fixture.refs.societyCode,
      providerId: fixture.ids.partnerId,
      currencyId: fixture.ids.currencyId,
      branchOfficeId: fixture.ids.branchId,
      totalAmount: 300,
      subTotal: 254.24,
      taxAmount: 45.76,
      exchangeRate: 1,
      status: PurchaseStatus.PENDING,
      documentNumber: `PUR-${fixture.refs.societyCode}`,
    } as any);

    await prisma.purchaseDetail.create({
      data: {
        purchaseId: purchase.id,
        productId: fixture.ids.productId,
        quantity: 6,
        unitPrice: 50,
        subtotal: 254.24,
        taxAmount: 45.76,
        total: 300,
      },
    });

    const updatedPurchase = await updatePurchase(purchase.id, {
      status: PurchaseStatus.COMPLETED,
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

    const inventoryLogs = await prisma.inventoryTransaction.findMany({
      where: {
        referenceId: purchase.id,
        productId: fixture.ids.productId,
      },
    });

    expect(updatedPurchase.status).toBe(PurchaseStatus.COMPLETED);
    expect(branchStock.physicalStock).toBe(6);
    expect(branchStock.availableStock).toBe(6);
    expect(product.stock).toBe(6);
    expect(product.priceCost.toString()).toBe('50');
    expect(inventoryLogs).toHaveLength(1);
    expect(inventoryLogs[0].type).toBe(TransactionType.PURCHASE_ENTRY);
    expect(inventoryLogs[0].quantity).toBe(6);
  });

  it('rejects completing a purchase without details', async () => {
    fixture = await createOrderInventoryFixture({
      partnerType: PartnerType.SUPPLIER,
      initialStock: 0,
    });

    const purchase = await createPurchase({
      societyId: fixture.refs.societyCode,
      providerId: fixture.ids.partnerId,
      currencyId: fixture.ids.currencyId,
      branchOfficeId: fixture.ids.branchId,
      totalAmount: 0,
      subTotal: 0,
      taxAmount: 0,
      exchangeRate: 1,
      status: PurchaseStatus.PENDING,
      documentNumber: `PUR-EMPTY-${fixture.refs.societyCode}`,
    } as any);

    await expect(
      updatePurchase(purchase.id, {
        status: PurchaseStatus.COMPLETED,
      } as any)
    ).rejects.toThrow('No se puede completar una compra sin detalles');
  });

  it('rejects completing a purchase when totals do not match purchase details', async () => {
    fixture = await createOrderInventoryFixture({
      partnerType: PartnerType.SUPPLIER,
      initialStock: 0,
    });

    const purchase = await createPurchase({
      societyId: fixture.refs.societyCode,
      providerId: fixture.ids.partnerId,
      currencyId: fixture.ids.currencyId,
      branchOfficeId: fixture.ids.branchId,
      totalAmount: 999,
      subTotal: 900,
      taxAmount: 99,
      exchangeRate: 1,
      status: PurchaseStatus.PENDING,
      documentNumber: `PUR-MISMATCH-${fixture.refs.societyCode}`,
    } as any);

    await prisma.purchaseDetail.create({
      data: {
        purchaseId: purchase.id,
        productId: fixture.ids.productId,
        quantity: 2,
        unitPrice: 50,
        subtotal: 100,
        taxAmount: 18,
        total: 118,
      },
    });

    await expect(
      updatePurchase(purchase.id, {
        status: PurchaseStatus.COMPLETED,
      } as any)
    ).rejects.toThrow('No se puede completar la compra porque los totales no coinciden con sus detalles');
  });
});
