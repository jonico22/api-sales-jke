import { CorsOptions } from 'cors';
import { envs } from '@/config/envs';
import { AppError } from '@/utils/AppError';

// Lista de dominios permitidos (Whitelist)
const whiteList = envs.CORS_ORIGIN.split(',');

export const corsOptions: CorsOptions = {
  origin: (origin, callback) => {
    // Si estamos en desarrollo y no hay origen (como Postman o curl), permitir
    if (!envs.isProd && !origin) {
      return callback(null, true);
    }

    // Si el origen está en la lista blanca
    if (origin && (whiteList.includes(origin) || whiteList.includes('*'))) {
      callback(null, true);
    } else {
      callback(new AppError('No permitido por CORS', 403));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  credentials: true, // Permitir envío de cookies/tokens
  optionsSuccessStatus: 200 // Para navegadores viejos o smartTVs
};