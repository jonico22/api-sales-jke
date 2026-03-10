// Configurar timezone de Lima, Perú antes de cualquier import
process.env.TZ = 'America/Lima';

import 'newrelic';
import express from 'express';
import cors from 'cors';

// SOLUCIÓN AL ERROR: TypeError: Do not know how to serialize a BigInt
// @ts-ignore
BigInt.prototype.toJSON = function () {
  return this.toString();
};

//import { getSafeSwaggerDoc } from '@/config/swagger';
import { envs } from '@/config/envs';
import { connectRedis } from '@/config/redis';
import '@/worker/report.worker'; // Importar para iniciar el worker
import { globalErrorHandler } from '@/utils/errorHandler';
import { AppError } from '@/utils/AppError';
import logger from '@/config/logger';
import { corsOptions } from '@/config/cors';
import { timezoneInfo } from '@/config/timezone';
import routes from './routes';

import prisma from './config/prisma';

const app = express();

app.use(cors(corsOptions));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

/*app.use(
  '/docs',
 apiReference({
    spec: {
      content: getSafeSwaggerDoc(),
    },
  })
);*/

app.use('/api', routes);
app.get('/health', (req, res) => {
  res.json({
    status: 'up',
    environment: envs.NODE_ENV,
    timezone: {
      name: timezoneInfo.name,
      current: timezoneInfo.current,
      offset: timezoneInfo.offset,
    }
  });
});

// 6. MANEJO DE 404: Si ninguna ruta coincidió
app.use((req, res, next) => {
  next(new AppError(`No se pudo encontrar ${req.originalUrl} en este servidor`, 404));
});

// 7. MANEJO DE ERRORES GLOBAL: Siempre al final
app.use(globalErrorHandler);

const startServer = async () => {
  try {
    await connectRedis();
    await prisma.$connect();
    console.log('✅ Conectado a PostgreSQL con Prisma');

    app.listen(envs.PORT, '0.0.0.0', () => {
      logger.info(`🚀 Servidor iniciado en puerto ${envs.PORT}`);
      logger.info(`🌍 Entorno actual: ${envs.NODE_ENV}`);

      // Keep-alive: Ping a Neon DB cada 4 min para evitar cold start (auto-suspend a los 5 min)
      setInterval(async () => {
        try { await prisma.$queryRaw`SELECT 1`; } catch (_) { }
      }, 4 * 60 * 1000);
    });
  } catch (error) {
    logger.fatal(error, '❌ Error crítico al iniciar la aplicación');
    process.exit(1);
  }
};

startServer();