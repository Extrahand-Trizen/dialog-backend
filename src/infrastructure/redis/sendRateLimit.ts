import { validateEnv } from '../../config/env';
import { RateLimitError } from '../../shared/errors/AppError';
import { getRedisClient, isRedisConfigured } from './client';
import { canAttemptRedis, recordRedisFailure } from './redisCircuitBreaker';

const ACQUIRE_SLOT_SCRIPT = `
local current = redis.call('INCR', KEYS[1])
if current == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[2])
end
if current > tonumber(ARGV[1]) then
  local ttl = redis.call('PTTL', KEYS[1])
  return ttl
end
return -1
`;

function buildRateLimitKey(metaPhoneNumberId: string): string {
  const windowMs = validateEnv().WHATSAPP_SEND_RATE_LIMIT_WINDOW_MS;
  const bucket = Math.floor(Date.now() / windowMs);
  return `whatsapp:send-rate:${metaPhoneNumberId}:${bucket}`;
}

export async function acquireWhatsAppSendSlot(metaPhoneNumberId: string): Promise<void> {
  if (!isRedisConfigured() || !canAttemptRedis()) {
    return;
  }

  const redis = getRedisClient();
  if (!redis) {
    return;
  }

  const env = validateEnv();
  const key = buildRateLimitKey(metaPhoneNumberId);
  const windowMs = env.WHATSAPP_SEND_RATE_LIMIT_WINDOW_MS;
  const max = env.WHATSAPP_SEND_RATE_LIMIT_MAX;

  try {
    const result = await redis.eval(
      ACQUIRE_SLOT_SCRIPT,
      1,
      key,
      String(max),
      String(windowMs),
    );

    const ttlMs = Number(result);
    if (ttlMs >= 0) {
      throw new RateLimitError(
        'WhatsApp send rate limit exceeded for phone number',
        'WHATSAPP_SEND_RATE_LIMITED',
      );
    }
  } catch (error) {
    if (error instanceof RateLimitError) {
      throw error;
    }

    recordRedisFailure(
      error instanceof Error ? error : new Error('Redis rate limit script failed'),
    );
    // Fail open when Redis is unavailable — do not block message sends.
  }
}
