import 'newrelic';
import express from 'express';
import helmet from 'helmet';
import hpp from 'hpp';
import cors from 'cors';

import { apiReference } from '@scalar/express-api-reference';
import { getSafeSwaggerDoc } from '@/config/swagger';

import { envs } from '@/config/envs';
import { connectRedis } from '@/config/redis';
import { globalErrorHandler } from '@/utils/errorHandler';
import { AppError } from '@/utils/AppError';
import logger from '@/config/logger';
import { corsOptions } from '@/config/cors';
import { limiter } from '@/config/rateLimit';
import routes from './routes';

import prisma from './config/prisma';

const app = express();

// 1. SEGURIDAD INICIAL: Helmet y CORS primero
app.use(helmet());
app.use(cors(corsOptions));

// 2. RATE LIMITER: Protege la API antes de gastar recursos procesando el JSON
if (envs.isProd) {
  app.use('/api', limiter); 
}

// 3. PARSERS: Ahora que sabemos que la petición es segura, leemos el cuerpo
app.use(express.json({ limit: '10kb' }));

// 4. PARAMETER POLLUTION: Limpiamos los query strings
app.use(hpp({
  whitelist: ['category']
}));

app.use(
  '/docs',
 apiReference({
    spec: {
      content: getSafeSwaggerDoc(),
    },
  })
);

// 5. RUTAS: Una sola vez y después de los filtros de seguridad
app.use('/api', routes);

// Ruta de salud (usa nuestra utilidad envs para consistencia)
app.get('/health', (req, res) => {
  res.json({ 
    status: 'up', 
    environment: envs.NODE_ENV 
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
    app.listen(envs.PORT, () => {
      logger.info(`🚀 Servidor iniciado en puerto ${envs.PORT}`);
      logger.info(`🌍 Entorno actual: ${envs.NODE_ENV}`);
    });
  } catch (error) {
    logger.fatal(error, '❌ Error crítico al iniciar la aplicación');
    process.exit(1);
  }
};

startServer();