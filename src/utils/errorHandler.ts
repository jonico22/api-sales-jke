import { Request, Response, NextFunction } from 'express';
import { envs } from '@/config/envs';
import logger from '@/config/logger'; 
import { ZodError } from 'zod';
import { AppError } from '@/utils/AppError';

export const globalErrorHandler = (
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  let normalizedError = err instanceof AppError
    ? err
    : new AppError(err?.message || 'Internal Server Error', err?.statusCode || 500);

  let statusCode = normalizedError.statusCode || 500;
  let message = normalizedError.message;
  let details = normalizedError.details;

  // Handle Zod Validation Errors
  if (err instanceof ZodError) {
    statusCode = 400;
    message = 'Validation Error';
    details = err.issues;
  }
  
  // Log estructurado
  logger.error({
    code: normalizedError.code,
    msg: message,
    stack: err.stack,
    path: req.originalUrl,
    method: req.method,
    details
  });

  res.status(statusCode).json({
    status: `${statusCode}`.startsWith('4') ? 'fail' : 'error',
    code: err instanceof ZodError ? 'VALIDATION_ERROR' : normalizedError.code,
    message,
    details,
    stack: envs.isProd ? undefined : err.stack,
  });
};
