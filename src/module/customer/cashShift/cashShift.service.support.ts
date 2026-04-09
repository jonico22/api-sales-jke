import { redis } from '@/config/redis';
import { runInBackground } from '@/utils/background-task';
import { CASH_SHIFT_CACHE_PREFIX } from './cashShift.helpers';

export const invalidateCashShiftCaches = async (input?: { shiftId?: string }) => {
  const operations = [redis.deleteKeysByPrefix(`${CASH_SHIFT_CACHE_PREFIX}list:`)];

  if (input?.shiftId) {
    operations.push(redis.del(`${CASH_SHIFT_CACHE_PREFIX}${input.shiftId}`));
  } else {
    operations.push(redis.deleteKeysByPrefix(`${CASH_SHIFT_CACHE_PREFIX}`));
  }

  await Promise.all(operations);
};

export const scheduleCashShiftCacheInvalidation = (
  taskName: string,
  context: Record<string, unknown>,
  input?: { shiftId?: string }
) => {
  runInBackground(
    {
      taskName,
      context,
    },
    async () => {
      await invalidateCashShiftCaches(input);
    }
  );
};
