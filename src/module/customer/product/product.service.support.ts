import { publishRealtimeUpdate } from '@/config/event-publisher';
import prisma from '@/config/prisma';
import { redis } from '@/config/redis';
import {
  PRODUCT_CACHE_PREFIX,
  PRODUCT_DASHBOARD_CACHE_KEYS,
} from './product.helpers';

export const invalidateProductCaches = async (societyId: string, productId?: string) => {
  const operations = [
    redis.deleteKeysByPrefix(`${PRODUCT_CACHE_PREFIX}${societyId}:`),
    redis.deleteKeysByPrefix('branch_office_products:'),
  ];

  if (productId) {
    operations.unshift(redis.del(`${PRODUCT_CACHE_PREFIX}${productId}`));
  }

  operations.push(
    ...PRODUCT_DASHBOARD_CACHE_KEYS.map((key) => redis.deleteKeysByPrefix(`dashboard:${key}:${societyId}`))
  );

  await Promise.all(operations);
};

export const scheduleProductMutationSideEffects = (input: {
  societyId: string;
  subscriptionId?: string | null;
  product: { id: string; name: string; code: string | null };
  action: 'CREATED' | 'UPDATED' | 'DELETED';
}) => {
  setImmediate(async () => {
    try {
      await invalidateProductCaches(input.societyId, input.action === 'CREATED' ? undefined : input.product.id);

      if (input.subscriptionId) {
        await Promise.all([
          publishRealtimeUpdate(input.subscriptionId, 'PRODUCTO', {
            id: input.product.id,
            action: input.action,
            name: input.product.name,
            code: input.product.code,
          }),
          publishRealtimeUpdate(input.subscriptionId, 'DASHBOARD', { action: 'REFRESH_STATS' }),
        ]);
      }
    } catch (error) {
      console.error(`[ProductService] Error background (${input.action.toLowerCase()}):`, error);
    }
  });
};

export const syncProductStockWithMainBranch = async (
  productId: string,
  societyId: string,
  stock: number
) => {
  const mainBranch = await prisma.branchOffice.findFirst({
    where: { societyId, code: 'ALM-PRINCIPAL' },
    select: { id: true },
  });

  if (!mainBranch) {
    return;
  }

  const existingBop = await prisma.branchOfficeProduct.findUnique({
    where: {
      productId_branchOfficeId: { productId, branchOfficeId: mainBranch.id },
    },
    select: { reservedStock: true },
  });

  const currentReserved = existingBop?.reservedStock ?? 0;
  const newAvailable = stock - currentReserved;

  await prisma.branchOfficeProduct.upsert({
    where: {
      productId_branchOfficeId: { productId, branchOfficeId: mainBranch.id },
    },
    update: { physicalStock: stock, availableStock: newAvailable },
    create: {
      productId,
      branchOfficeId: mainBranch.id,
      physicalStock: stock,
      availableStock: stock,
      reservedStock: 0,
      location: 'ALMACEN-GENERAL',
      isActive: true,
    },
  });
};
