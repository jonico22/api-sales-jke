import { Request, Response, NextFunction } from 'express';
import { envs } from '@/config/envs';
import logger from '@/config/logger'; 

export const globalErrorHandler = (
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const statusCode = err.statusCode || 500;
  
  // Log estructurado
  logger.error({
    msg: err.message,
    stack: err.stack,
    path: req.originalUrl,
    method: req.method,
  });

  res.status(statusCode).json({
    status: `${statusCode}`.startsWith('4') ? 'fail' : 'error',
    message: err.message,
    stack: envs.isProd ? undefined : err.stack,
  });
};