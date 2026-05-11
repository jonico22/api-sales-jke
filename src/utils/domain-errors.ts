import { AppError } from '@/utils/AppError';

export class ValidationAppError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 400, 'VALIDATION_ERROR', details);
  }
}

export class NotFoundAppError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 404, 'NOT_FOUND', details);
  }
}

export class ConflictAppError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 409, 'CONFLICT', details);
  }
}

export class DomainRuleAppError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 422, 'DOMAIN_RULE_ERROR', details);
  }
}
