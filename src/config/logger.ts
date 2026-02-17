import * as newrelic from 'newrelic';
import pino from 'pino';
import { envs } from '@/config/envs';

const isDev = process.env.NODE_ENV === 'development';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: isDev
    ? {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:standard',
        ignore: 'pid,hostname',
      },
    }
    : undefined,
  mixin() {
    if (typeof (newrelic as any).getLogMetadata === 'function') {
      return (newrelic as any).getLogMetadata();
    }
    // Intentar con el método de versiones intermedias
    if (typeof (newrelic as any).getLinkingMetadata === 'function') {
      return (newrelic as any).getLinkingMetadata();
    }
    return { nr_status: 'metadata_api_not_found' };
  },
});


export default logger;