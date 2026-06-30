import { createHash, randomBytes } from 'crypto';

const API_KEY_PREFIX = 'tdk_live_';
const KEY_PREFIX_LENGTH = 12;

export type GeneratedApiKey = {
  fullKey: string;
  keyPrefix: string;
  keyHash: string;
};

export function generateApiKey(): GeneratedApiKey {
  const fullKey = `${API_KEY_PREFIX}${randomBytes(24).toString('base64url')}`;
  return {
    fullKey,
    keyPrefix: fullKey.slice(0, KEY_PREFIX_LENGTH),
    keyHash: hashApiKey(fullKey),
  };
}

export function hashApiKey(fullKey: string): string {
  return createHash('sha256').update(fullKey).digest('hex');
}

export function verifyApiKey(fullKey: string, keyHash: string): boolean {
  const candidate = hashApiKey(fullKey);
  return candidate.length === keyHash.length && candidate === keyHash;
}

export function extractApiKeyPrefix(fullKey: string): string {
  return fullKey.slice(0, KEY_PREFIX_LENGTH);
}
