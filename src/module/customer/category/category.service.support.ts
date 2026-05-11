import prisma from '@/config/prisma';
import { redis } from '@/config/redis';
import { CATEGORY_CACHE_PREFIX } from './category.helpers';

export const invalidateCategoryCaches = async () => {
  await redis.deleteKeysByPrefix(`${CATEGORY_CACHE_PREFIX}:`);
};

export const scheduleCategoryCacheInvalidation = (action: 'create' | 'update' | 'delete') => {
  setImmediate(async () => {
    try {
      await invalidateCategoryCaches();
    } catch (e) {
      console.error(`[CategoryService] Error background (${action}):`, e);
    }
  });
};

export const resolveCategorySocietyForMutation = async (societyId?: string) => {
  if (!societyId) {
    return undefined;
  }

  const isUuid =
    /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(societyId);

  if (isUuid) {
    return societyId;
  }

  const society = await prisma.society.findUnique({ where: { code: societyId }, select: { id: true } });
  return society?.id ?? null;
};
