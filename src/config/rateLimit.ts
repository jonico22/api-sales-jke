import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import redisClient from '@/config/redis';
import { AppError } from '@/utils/AppError';

export const limiter = rateLimit({
  // Usamos el cliente de Redis que ya configuramos
  store: new RedisStore({
    sendCommand: (...args: string[]) => redisClient.sendCommand(args),
  }),
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100, // Límite de 100 peticiones por IP por cada 15 min
  standardHeaders: true, // Retorna info del límite en los headers `RateLimit-*`
  legacyHeaders: false,
  handler: (req, res, next) => {
    next(new AppError('Demasiadas peticiones desde esta IP, por favor intente en 15 minutos', 429));
  },
});