import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  isNonRetryableMetaDeliveryErrorCode,
  isRetryableSendError,
  MetaApiError,
} from './sendErrors';

describe('isRetryableSendError', () => {
  it('retries Meta 429 / 5xx only', () => {
    assert.equal(isRetryableSendError(new MetaApiError('rate', 'META_RATE_LIMITED', 429)), true);
    assert.equal(isRetryableSendError(new MetaApiError('down', 'META_GRAPH_API_ERROR', 503)), true);
    assert.equal(isRetryableSendError(new MetaApiError('bad', 'META_GRAPH_API_ERROR', 400)), false);
  });
});

describe('isNonRetryableMetaDeliveryErrorCode', () => {
  it('marks 131049 marketing ecosystem failures as non-retryable', () => {
    assert.equal(isNonRetryableMetaDeliveryErrorCode('131049'), true);
    assert.equal(isNonRetryableMetaDeliveryErrorCode('132012'), true);
    assert.equal(isNonRetryableMetaDeliveryErrorCode('999999'), false);
    assert.equal(isNonRetryableMetaDeliveryErrorCode(null), false);
  });
});
