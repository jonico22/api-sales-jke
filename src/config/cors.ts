import { CorsOptions } from 'cors';
import { envs } from '@/config/envs';
import { AppError } from '@/utils/AppError';

// Lista de dominios permitidos (Whitelist)
const whiteList = envs.CORS_ORIGIN.split(',');

export const corsOptions: CorsOptions = {
  origin: (origin, callback) => {
    // 1. Si no hay origen (Postman, CURL, Apps Móviles, tareas programadas)
    // Lo permitimos siempre, o podrías limitarlo solo si quieres pruebas en prod
    if (!origin) {
      return callback(null, true);
    }

    // 2. Si el origen existe (petición desde un Navegador)
    // Verificamos si está en la lista blanca o si permitimos todo con '*'
    if (whiteList.includes(origin) || whiteList.includes('*')) {
      return callback(null, true);
    } 

    // 3. Si no coincide con nada
    callback(new AppError(`Dominio ${origin} no permitido por CORS`, 403));
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'], // Agregué 'Accept'
  credentials: true,
  optionsSuccessStatus: 200
};