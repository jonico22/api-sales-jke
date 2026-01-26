//import 'newrelic';
import express from 'express';
import cors from 'cors';

//import { getSafeSwaggerDoc } from '@/config/swagger';
import { envs } from '@/config/envs';
import { connectRedis } from '@/config/redis';
import { globalErrorHandler } from '@/utils/errorHandler';
import { AppError } from '@/utils/AppError';
import logger from '@/config/logger';
import { corsOptions } from '@/config/cors';
import routes from './routes';

import prisma from './config/prisma';

const app = express();

app.use(cors(corsOptions));
app.use(express.json());

/*app.use(
  '/docs',
 apiReference({
    spec: {
      content: getSafeSwaggerDoc(),
    },
  })
);*/

//app.use('/api', routes);
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