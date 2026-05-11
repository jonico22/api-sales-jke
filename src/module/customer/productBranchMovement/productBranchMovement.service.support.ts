import { redis } from '@/config/redis';
import { PRODUCT_BRANCH_MOVEMENT_CACHE_PREFIX } from './productBranchMovement.helpers';

export const invalidateProductBranchMovementCaches = async (input?: {
  id?: string;
  includeProducts?: boolean;
}) => {
  const operations: Promise<unknown>[] = [];

  if (input?.id) {
    operations.push(redis.del(`${PRODUCT_BRANCH_MOVEMENT_CACHE_PREFIX}:${input.id}`));
  }

  operations.push(redis.deleteKeysByPrefix(`${PRODUCT_BRANCH_MOVEMENT_CACHE_PREFIX}:list:`));

  if (input?.includeProducts !== false) {
    operations.push(
      redis.deleteKeysByPrefix('products:'),
      redis.deleteKeysByPrefix('branch_office_products:')
    );
  }

  await Promise.all(operations);
};

export const scheduleProductBranchMovementCacheInvalidation = (input?: {
  id?: string;
  includeProducts?: boolean;
  logLabel?: string;
}) => {
  setImmediate(async () => {
    try {
      await invalidateProductBranchMovementCaches(input);
    } catch (e) {
      console.error(`[MovementService] ${input?.logLabel || 'Cache'} error:`, e);
    }
  });
};
