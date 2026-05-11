import logger from '@/config/logger';

type BackgroundTaskOptions = {
  taskName: string;
  context?: Record<string, unknown>;
};

export const runInBackground = (
  options: BackgroundTaskOptions,
  task: () => Promise<void>
) => {
  setImmediate(async () => {
    try {
      await task();
    } catch (error) {
      logger.error({
        msg: 'Background task failed',
        taskName: options.taskName,
        context: options.context,
        err: error,
      });
    }
  });
};
