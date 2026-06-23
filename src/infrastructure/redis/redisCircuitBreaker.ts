import logger from '../logging/logger';

export type RedisCircuitState = 'closed' | 'open' | 'half_open';

const FAILURE_THRESHOLD = 3;
const OPEN_DURATION_MS = 30_000;
const ERROR_LOG_COOLDOWN_MS = 60_000;

let state: RedisCircuitState = 'closed';
let consecutiveFailures = 0;
let openedAt = 0;
let lastErrorLogAt = 0;
let lastErrorMessage = '';

function shouldLogError(now: number, message: string): boolean {
  if (state === 'open') {
    return now - lastErrorLogAt >= ERROR_LOG_COOLDOWN_MS;
  }

  return now - lastErrorLogAt >= 5_000 || message !== lastErrorMessage;
}

export function getRedisCircuitState(): RedisCircuitState {
  if (state === 'open' && Date.now() - openedAt >= OPEN_DURATION_MS) {
    state = 'half_open';
  }
  return state;
}

/** When false, callers should skip Redis I/O and fail open. */
export function canAttemptRedis(): boolean {
  const current = getRedisCircuitState();
  return current === 'closed' || current === 'half_open';
}

export function isRedisCircuitOpen(): boolean {
  return getRedisCircuitState() === 'open';
}

export function recordRedisSuccess(): void {
  consecutiveFailures = 0;

  if (state !== 'closed') {
    logger.info('Redis circuit closed — connection restored');
  }

  state = 'closed';
  openedAt = 0;
}

export function recordRedisFailure(error: Error): void {
  const now = Date.now();
  const message = error.message;

  if (shouldLogError(now, message)) {
    logger.error('Redis client error', {
      message,
      circuitState: state,
      consecutiveFailures: consecutiveFailures + 1,
    });
    lastErrorLogAt = now;
    lastErrorMessage = message;
  }

  consecutiveFailures += 1;

  if (state === 'half_open') {
    state = 'open';
    openedAt = now;
    logger.warn('Redis circuit reopened after failed probe', { message });
    return;
  }

  if (state === 'closed' && consecutiveFailures >= FAILURE_THRESHOLD) {
    state = 'open';
    openedAt = now;
    logger.warn('Redis circuit opened — pausing Redis client reconnects', {
      failures: consecutiveFailures,
      retryAfterMs: OPEN_DURATION_MS,
    });
  }
}

export function resetRedisCircuitForTests(): void {
  state = 'closed';
  consecutiveFailures = 0;
  openedAt = 0;
  lastErrorLogAt = 0;
  lastErrorMessage = '';
}
