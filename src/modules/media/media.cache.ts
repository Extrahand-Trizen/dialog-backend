import { createHash } from 'node:crypto';
import { getRedisClient } from '../../infrastructure/redis/client';

const TTL_SECONDS = 60 * 60 * 24 * 30;

export type CachedTemplateMedia = {
  mimeType: string;
  fileName: string;
  data: Buffer;
};

function cacheKey(organizationId: string, handle: string): string {
  const handleHash = createHash('sha256').update(handle).digest('hex');
  return `template-media:${organizationId}:${handleHash}`;
}

export async function cacheTemplateMedia(
  organizationId: string,
  handle: string,
  input: { mimeType: string; fileName: string; buffer: Buffer },
): Promise<void> {
  const client = getRedisClient();
  if (!client) {
    return;
  }

  const payload = JSON.stringify({
    mimeType: input.mimeType,
    fileName: input.fileName,
    data: input.buffer.toString('base64'),
  });

  await client.setex(cacheKey(organizationId, handle), TTL_SECONDS, payload);
}

export async function getCachedTemplateMedia(
  organizationId: string,
  handle: string,
): Promise<CachedTemplateMedia | null> {
  const client = getRedisClient();
  if (!client) {
    return null;
  }

  const raw = await client.get(cacheKey(organizationId, handle));
  if (!raw) {
    return null;
  }

  const parsed = JSON.parse(raw) as { mimeType: string; fileName: string; data: string };
  return {
    mimeType: parsed.mimeType,
    fileName: parsed.fileName,
    data: Buffer.from(parsed.data, 'base64'),
  };
}
