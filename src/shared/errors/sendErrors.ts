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
    // Business / Graph client errors (incl. marketing 131049 delivered via send failures) are not retryable.
    // Only transport/rate-limit failures should retry.
    if (error.httpStatus === 429 || error.httpStatus >= 500) {
      return true;
    }
    return false;
  }

  return false;
}

/** Meta delivery/webhook codes that must never be retried by the send queue. */
export const NON_RETRYABLE_META_DELIVERY_ERROR_CODES = new Set([
  '131049', // healthy ecosystem engagement (marketing)
  '131047', // outside customer service window (session text — we don't send text, but record for completeness)
  '132001',
  '132012',
  '132015',
  '132018',
  '131008',
  '133010',
]);

export function isNonRetryableMetaDeliveryErrorCode(code: string | null | undefined): boolean {
  if (!code) return false;
  return NON_RETRYABLE_META_DELIVERY_ERROR_CODES.has(String(code).trim());
}
