import { AppError, RateLimitError } from './AppError';

export class MetaApiError extends AppError {
  readonly httpStatus: number;

  constructor(
    message: string,
    errorCode: string,
    httpStatus: number,
    details?: Record<string, unknown>,
  ) {
    super(message, errorCode, httpStatus >= 500 ? 502 : httpStatus, details);
    this.httpStatus = httpStatus;
  }
}

export function isRetryableSendError(error: unknown): boolean {
  if (error instanceof RateLimitError) {
    return true;
  }

  if (error instanceof MetaApiError) {
    return error.httpStatus === 429 || error.httpStatus >= 500;
  }

  return false;
}
