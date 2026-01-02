import express from 'express';
import helmet from 'helmet';
import hpp from 'hpp';
import { envs } from '@/config/envs'; // Usamos nuestra utilidad
import { connectRedis } from '@/config/redis';
import { globalErrorHandler } from '@/utils/errorHandler';
import { AppError } from '@/utils/AppError';
import logger from '@/config/logger';
import cors from 'cors'; // 👈
import { corsOptions } from '@/config/cors';
import { limiter } from '@/config/rateLimit';

const app = express();
app.use(cors(corsOptions));
app.use(express.json());


// 1. Seguridad de Headers (DEBE IR AL PRINCIPIO)
app.use(helmet());

// 2. Límite de peticiones (Solo en producción o si quieres probarlo en dev)
if (envs.isProd) {
  app.use('/api', limiter); 
}

// 3. Lectura de Body con límite de tamaño (Evita ataques de payloads gigantes)
app.use(express.json({ limit: '10kb' }));

// 4. Prevenir contaminación de parámetros (e.g., ?sort=abc&sort=def)
app.use(hpp({
  whitelist: [
    'category',
    'tags',
    'brand',
    'status',
    'color'
  ]
}));

// Ruta de salud
app.get('/health', (req, res) => {
  res.json({ status: 'up', environment: process.env.NODE_ENV });
});

// Manejo de rutas no encontradas (404)
app.use((req, res, next) => {
  next(new AppError(`No se pudo encontrar ${req.originalUrl} en este servidor`, 404));
});

// --- Middleware de Error Global (Debe ser el último) ---
app.use(globalErrorHandler);

const startServer = async () => {
  try {
    await connectRedis();
    
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