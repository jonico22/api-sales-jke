import { Request, Response, NextFunction } from 'express';
import { envs } from '@/config/envs';
import logger from '@/config/logger'; 
import { ZodError } from 'zod';

export const globalErrorHandler = (
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  let statusCode = err.statusCode || 500;
  let message = err.message;
  let details = undefined;

  // Handle Zod Validation Errors
  if (err instanceof ZodError) {
    statusCode = 400;
    message = 'Validation Error';
    details = err.issues;
  }
  
  // Log estructurado
  logger.error({
    msg: message,
    stack: err.stack,
    path: req.originalUrl,
    method: req.method,
    details
  });

  res.status(statusCode).json({
    status: `${statusCode}`.startsWith('4') ? 'fail' : 'error',
    message,
    details,
    stack: envs.isProd ? undefined : err.stack,
  });
};