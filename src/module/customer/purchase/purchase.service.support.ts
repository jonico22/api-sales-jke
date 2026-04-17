import { InventoryService } from '@/module/inventory/inventory.service';
import { TransactionType } from '@prisma/client';
import { redis } from '@/config/redis';
import { PURCHASE_CACHE_PREFIX } from './purchase.helpers';

export const invalidatePurchaseCaches = async (societyId?: string, purchaseId?: string) => {
  const cacheOperations = [
    redis.deleteKeysByPrefix(`${PURCHASE_CACHE_PREFIX}list:`),
    redis.deleteKeysByPrefix('products:'),
    redis.deleteKeysByPrefix('products:select:'),
    redis.deleteKeysByPrefix('branch_office_products:'),
  ];

  if (purchaseId) {
    cacheOperations.unshift(redis.del(`${PURCHASE_CACHE_PREFIX}${purchaseId}`));
  }

  if (societyId) {
    cacheOperations.push(
      redis.deleteKeysByPrefix(`dashboard:overview:${societyId}`),
      redis.deleteKeysByPrefix(`dashboard:overview:v2:${societyId}`),
      redis.deleteKeysByPrefix(`dashboard:overview:v3:${societyId}`),
      redis.deleteKeysByPrefix(`dashboard:overview:v4:${societyId}`),
      redis.deleteKeysByPrefix(`analytics:summary:${societyId}`),
      redis.deleteKeysByPrefix(`analytics:cash-flow-trend:${societyId}`),
    );
  }

  await Promise.all(cacheOperations);
};

export const applyPurchaseCompletionEffects = async (
  tx: any,
  purchase: {
    id: string;
    branchOfficeId: string;
    documentNumber?: string | null;
    purchaseDetails: Array<{
      productId: string;
      quantity: number;
      unitPrice: unknown;
      total: unknown;
    }>;
  }
) => {
  const processedAt = new Date();

  await Promise.all(
    purchase.purchaseDetails.map(async (detail) => {
      await tx.branchOfficeProduct.upsert({
        where: {
          productId_branchOfficeId: {
            productId: detail.productId,
            branchOfficeId: purchase.branchOfficeId,
          },
        },
        update: {
          physicalStock: { increment: detail.quantity },
          availableStock: { increment: detail.quantity },
          lastRestockedAt: processedAt,
        },
        create: {
          productId: detail.productId,
          branchOfficeId: purchase.branchOfficeId,
          physicalStock: detail.quantity,
          availableStock: detail.quantity,
          lastRestockedAt: processedAt,
        },
      });

      await tx.product.update({
        where: { id: detail.productId },
        data: {
          stock: { increment: detail.quantity },
          priceCost: detail.unitPrice,
        },
      });

      await InventoryService.logTransaction(
        {
          date: processedAt,
          productId: detail.productId,
          branchOfficeId: purchase.branchOfficeId,
          type: TransactionType.PURCHASE_ENTRY,
          quantity: detail.quantity,
          unitCost: Number(detail.unitPrice),
          totalCost: Number(detail.total),
          referenceId: purchase.id,
          referenceType: 'PURCHASE',
          documentNumber: purchase.documentNumber || undefined,
        },
        tx
      );
    })
  );
};
