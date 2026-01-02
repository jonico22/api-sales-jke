import pino from 'pino';
import { envs } from '@/config/envs';

const logger = pino({
  level: envs.isProd ? 'info' : 'debug',
  transport: !envs.isProd
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:yyyy-mm-dd HH:MM:ss',
          ignore: 'pid,hostname',
        },
      }
    : undefined,
});

export default logger;