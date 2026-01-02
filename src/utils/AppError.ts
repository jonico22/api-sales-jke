export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;

  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true; // Indica que es un error controlado por nosotros

    Error.captureStackTrace(this, this.constructor);
  }
}