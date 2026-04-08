import { redis } from '@/config/redis';
import { getSaleExitQuantity, invalidateInventoryDomainCaches, invalidateInventoryListCache } from './inventory.helpers';
import { NotFoundAppError } from '@/utils/domain-errors';
import { runInBackground } from '@/utils/background-task';
import {
  getCancellationStockDelta,
  getConfirmationStockDelta,
  getManualAdjustmentStockDelta,
  getReservationStockDelta,
} from './inventory.stock-rules';
import { TransactionType } from '@prisma/client';

export const scheduleInventoryListInvalidation = () => {
  runInBackground(
    {
      taskName: 'inventory.list-invalidation',
    },
    async () => {
      await invalidateInventoryListCache();
    }
  );
};

export const scheduleInventoryDomainInvalidation = (context: 'adjustment' | 'cancelReservation') => {
  runInBackground(
    {
      taskName: 'inventory.domain-invalidation',
      context: { reason: context },
    },
    async () => {
      await invalidateInventoryDomainCaches();
    }
  );
};

export const createInventoryTransactionRecord = async (
  db: any,
  input: {
    date?: Date;
    productId: string;
    branchOfficeId: string;
    type: TransactionType;
    quantity: number;
    unitCost: number;
    totalCost: number;
    referenceId?: string;
    referenceType?: string;
    documentNumber?: string;
  }
) => {
  const branchProduct = await db.branchOfficeProduct.findUnique({
    where: {
      productId_branchOfficeId: {
        productId: input.productId,
        branchOfficeId: input.branchOfficeId,
      },
    },
  });

  if (!branchProduct) {
    throw new NotFoundAppError(`Product ${input.productId} not found in branch ${input.branchOfficeId} during Kardex Log`, {
      productId: input.productId,
      branchOfficeId: input.branchOfficeId,
    });
  }

  const currentStock = branchProduct.physicalStock;
  const previousStock = currentStock - input.quantity;

  return db.inventoryTransaction.create({
    data: {
      date: input.date || new Date(),
      productId: input.productId,
      branchOfficeId: input.branchOfficeId,
      type: input.type,
      quantity: input.quantity,
      previousStock,
      newStock: currentStock,
      unitCost: input.unitCost,
      totalCost: input.totalCost,
      referenceId: input.referenceId,
      referenceType: input.referenceType,
      documentNumber: input.documentNumber,
    },
  });
};

export const resolveAdjustmentUnitCost = async (
  tx: any,
  productId: string,
  unitCost?: number
) => {
  if (unitCost !== undefined) return unitCost;

  const product = await tx.product.findUnique({ where: { id: productId } });
  if (!product) throw new NotFoundAppError('Producto no encontrado', { productId });
  return Number(product.priceCost);
};

export const applyManualAdjustmentStock = async (
  tx: any,
  input: {
    productId: string;
    branchOfficeId: string;
    signedQuantity: number;
  }
) => {
  const stockDelta = getManualAdjustmentStockDelta(input.signedQuantity);

  await tx.branchOfficeProduct.upsert({
    where: {
      productId_branchOfficeId: {
        productId: input.productId,
        branchOfficeId: input.branchOfficeId,
      },
    },
    update: {
      physicalStock: { increment: stockDelta.branchPhysicalStock },
      availableStock: { increment: stockDelta.branchAvailableStock },
      ...(stockDelta.updatesLastRestockedAt ? { lastRestockedAt: new Date() } : {}),
    },
    create: {
      productId: input.productId,
      branchOfficeId: input.branchOfficeId,
      physicalStock: stockDelta.branchPhysicalStock,
      availableStock: stockDelta.branchAvailableStock,
      lastRestockedAt: new Date(),
    },
  });

  await tx.product.update({
    where: { id: input.productId },
    data: { stock: { increment: stockDelta.productStock } },
  });
};

export const applyReserveStock = async (
  tx: any,
  input: { productId: string; branchId: string; quantity: number }
) => {
  const stockDelta = getReservationStockDelta(input.quantity);

  const result = await tx.branchOfficeProduct.upsert({
    where: {
      productId_branchOfficeId: { productId: input.productId, branchOfficeId: input.branchId },
    },
    update: {
      availableStock: { decrement: stockDelta.quantity },
      reservedStock: { increment: stockDelta.branchReservedStock },
    },
    create: {
      productId: input.productId,
      branchOfficeId: input.branchId,
      physicalStock: 0,
      availableStock: -stockDelta.quantity,
      reservedStock: stockDelta.branchReservedStock,
    },
  });

  await tx.product.update({
    where: { id: input.productId },
    data: { stock: { decrement: stockDelta.quantity } },
  });

  return result;
};

export const applyConfirmStockOutput = async (
  tx: any,
  input: { productId: string; branchOfficeId: string; quantity: number }
) => {
  const stockDelta = getConfirmationStockDelta(input.quantity);

  await tx.branchOfficeProduct.update({
    where: {
      productId_branchOfficeId: {
        productId: input.productId,
        branchOfficeId: input.branchOfficeId,
      },
    },
    data: {
      physicalStock: { decrement: stockDelta.quantity },
      reservedStock: { decrement: stockDelta.quantity },
    },
  });
};

export const applyCancelReservation = async (
  tx: any,
  input: { productId: string; branchId: string; quantity: number }
) => {
  const stockDelta = getCancellationStockDelta(input.quantity);

  await tx.branchOfficeProduct.update({
    where: {
      productId_branchOfficeId: { productId: input.productId, branchOfficeId: input.branchId },
    },
    data: {
      availableStock: { increment: stockDelta.quantity },
      reservedStock: { decrement: stockDelta.quantity },
    },
  });

  await tx.product.update({
    where: { id: input.productId },
    data: { stock: { increment: stockDelta.quantity } },
  });
};

export const invalidateConfirmedStockCaches = async () => {
  await Promise.all([
    redis.deleteKeysByPrefix('products:'),
    redis.deleteKeysByPrefix('products:select:'),
  ]);
};

export const buildSaleExitLogInput = (input: {
  productId: string;
  branchOfficeId: string;
  quantity: number;
  unitCost: number;
  totalCost: number;
  referenceId?: string;
  referenceType?: string;
  documentNumber?: string;
}) => ({
  ...input,
  quantity: getSaleExitQuantity(input.quantity),
  type: TransactionType.SALE_EXIT,
});
