import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { validateEnv } from '../../config/env';
import { InternalServerError } from '../../shared/errors/AppError';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

function getEncryptionKey(): Buffer {
  const hex = validateEnv().ENCRYPTION_KEY;
  if (!hex || hex.length < 64) {
    throw new InternalServerError(
      'ENCRYPTION_KEY is not configured',
      'ENCRYPTION_KEY_MISSING',
    );
  }
  return Buffer.from(hex.slice(0, 64), 'hex');
}

export function encryptField(plainText: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString('base64');
}

export function decryptField(cipherText: string): string {
  const key = getEncryptionKey();
  const data = Buffer.from(cipherText, 'base64');
  const iv = data.subarray(0, IV_LENGTH);
  const tag = data.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const encrypted = data.subarray(IV_LENGTH + TAG_LENGTH);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString('utf8');
}

export function isEncryptionConfigured(): boolean {
  const hex = validateEnv().ENCRYPTION_KEY;
  return Boolean(hex && hex.length >= 64);
}
