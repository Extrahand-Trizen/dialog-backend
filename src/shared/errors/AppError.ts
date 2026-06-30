export class AppError extends Error {
  public readonly statusCode: number;
  public readonly errorCode: string;
  public readonly details?: Record<string, unknown>;
  public readonly isOperational: boolean;

  constructor(
    message: string,
    errorCode: string,
    statusCode = 500,
    details?: Record<string, unknown>,
    isOperational = true,
  ) {
    super(message);
    this.name = new.target.name;
    this.errorCode = errorCode;
    this.statusCode = statusCode;
    this.details = details;
    this.isOperational = isOperational;
    Error.captureStackTrace(this, new.target);
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Validation failed', details?: Record<string, unknown>) {
    super(message, 'VALIDATION_ERROR', 400, details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized', errorCode = 'UNAUTHORIZED') {
    super(message, errorCode, 401);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden', errorCode = 'FORBIDDEN') {
    super(message, errorCode, 403);
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Not found', errorCode = 'NOT_FOUND') {
    super(message, errorCode, 404);
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Conflict', errorCode = 'CONFLICT') {
    super(message, errorCode, 409);
  }
}

export class RateLimitError extends AppError {
  constructor(message = 'Too many requests', errorCode = 'RATE_LIMITED') {
    super(message, errorCode, 429);
  }
}

export class ExternalServiceError extends AppError {
  constructor(message = 'External service error', errorCode = 'EXTERNAL_SERVICE_ERROR') {
    super(message, errorCode, 502);
  }
}

export class InternalServerError extends AppError {
  constructor(message = 'Internal server error', errorCode = 'INTERNAL_SERVER_ERROR') {
    super(message, errorCode, 500);
  }
}
