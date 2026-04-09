import { redis } from '@/config/redis';
import { BRANCH_OFFICE_PRODUCT_CACHE_PREFIX } from './branchofficeproduct.helpers';

export const invalidateBranchOfficeProductCaches = async (input?: { id?: string; includeSelect?: boolean }) => {
  const operations: Promise<unknown>[] = [];

  if (input?.id) {
    operations.push(redis.del(`${BRANCH_OFFICE_PRODUCT_CACHE_PREFIX}:${input.id}`));
  }

  operations.push(redis.deleteKeysByPrefix(`${BRANCH_OFFICE_PRODUCT_CACHE_PREFIX}:list:`));

  if (input?.includeSelect !== false) {
    operations.push(redis.deleteKeysByPrefix(`${BRANCH_OFFICE_PRODUCT_CACHE_PREFIX}:select:`));
  }

  operations.push(
    redis.deleteKeysByPrefix('products:'),
    redis.deleteKeysByPrefix('products:select:')
  );

  await Promise.all(operations);
};
