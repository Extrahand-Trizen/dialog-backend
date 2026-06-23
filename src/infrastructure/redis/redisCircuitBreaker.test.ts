import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';
import {
  canAttemptRedis,
  getRedisCircuitState,
  isRedisCircuitOpen,
  recordRedisFailure,
  recordRedisSuccess,
  resetRedisCircuitForTests,
} from './redisCircuitBreaker';

describe('redisCircuitBreaker', () => {
  beforeEach(() => {
    resetRedisCircuitForTests();
  });

  it('opens after consecutive failures', () => {
    const error = new Error('ECONNREFUSED');

    recordRedisFailure(error);
    recordRedisFailure(error);
    assert.equal(getRedisCircuitState(), 'closed');

    recordRedisFailure(error);
    assert.equal(getRedisCircuitState(), 'open');
    assert.equal(canAttemptRedis(), false);
    assert.equal(isRedisCircuitOpen(), true);
  });

  it('closes after success', () => {
    const error = new Error('ECONNREFUSED');
    recordRedisFailure(error);
    recordRedisFailure(error);
    recordRedisFailure(error);

    recordRedisSuccess();
    assert.equal(getRedisCircuitState(), 'closed');
    assert.equal(canAttemptRedis(), true);
  });
});
