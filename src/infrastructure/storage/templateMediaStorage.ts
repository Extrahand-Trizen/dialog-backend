import { randomUUID } from 'node:crypto';
import { CreateBucketCommand, HeadBucketCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { validateEnv } from '../../config/env';
import logger from '../logging/logger';

let s3Client: S3Client | null = null;
let bucketEnsured = false;

export function isTemplateMediaStorageConfigured(): boolean {
  const env = validateEnv();
  return Boolean(
    env.MINIO_ENDPOINT &&
      env.MINIO_ACCESS_KEY &&
      env.MINIO_SECRET_KEY &&
      env.MINIO_BUCKET,
  );
}

function getS3Client(): S3Client {
  if (!isTemplateMediaStorageConfigured()) {
    throw new Error('MinIO template media storage is not configured');
  }

  if (!s3Client) {
    const env = validateEnv();
    s3Client = new S3Client({
      endpoint: env.MINIO_ENDPOINT,
      region: env.MINIO_REGION ?? 'us-east-1',
      credentials: {
        accessKeyId: env.MINIO_ACCESS_KEY!,
        secretAccessKey: env.MINIO_SECRET_KEY!,
      },
      forcePathStyle: true,
    });
  }

  return s3Client;
}

async function ensureBucketExists(): Promise<void> {
  if (bucketEnsured) {
    return;
  }

  const bucket = validateEnv().MINIO_BUCKET!;
  const client = getS3Client();

  try {
    await client.send(new HeadBucketCommand({ Bucket: bucket }));
    bucketEnsured = true;
    return;
  } catch {
    // bucket missing — create below
  }

  try {
    await client.send(new CreateBucketCommand({ Bucket: bucket }));
    bucketEnsured = true;
    logger.info('MinIO template media bucket created', { bucket });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.warn('MinIO bucket ensure failed', { bucket, message });
    throw error;
  }
}

function sanitizeFileName(fileName: string): string {
  const base = fileName.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  return base.slice(0, 120) || 'upload.bin';
}

function buildPublicUrl(objectKey: string): string {
  return normalizeTemplateMediaPublicUrl(buildCanonicalPublicUrl(objectKey));
}

/** Path-style MinIO URL: `{endpoint}/{bucket}/{objectKey}`. */
export function buildCanonicalPublicUrl(objectKey: string): string {
  const env = validateEnv();
  const encodedKey = objectKey.split('/').map(encodeURIComponent).join('/');
  const bucket = env.MINIO_BUCKET!;
  const endpoint = env.MINIO_ENDPOINT!.replace(/\/+$/, '');
  return `${endpoint}/${bucket}/${encodedKey}`;
}

/**
 * Fixes stored URLs when MINIO_PUBLIC_BASE_URL pointed at the wrong bucket path
 * (e.g. `/template-media/...` while files live in `whatsapp-template-media`).
 */
export function normalizeTemplateMediaPublicUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed || !isTemplateMediaStorageConfigured()) {
    return trimmed;
  }

  try {
    const env = validateEnv();
    const bucket = env.MINIO_BUCKET!;
    const endpoint = env.MINIO_ENDPOINT!.replace(/\/+$/, '');
    const canonicalPrefix = `${endpoint}/${bucket}/`;

    if (trimmed.startsWith(canonicalPrefix)) {
      return trimmed;
    }

    const customBase = env.MINIO_PUBLIC_BASE_URL?.replace(/\/+$/, '');
    if (customBase && trimmed.startsWith(`${customBase}/`)) {
      const suffix = trimmed.slice(customBase.length + 1);
      return `${canonicalPrefix}${suffix}`;
    }

    const escapedEndpoint = endpoint.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`^${escapedEndpoint}/[^/]+/(.+)$`);
    const match = trimmed.match(pattern);
    if (match) {
      return `${canonicalPrefix}${match[1]}`;
    }

    return trimmed;
  } catch {
    return trimmed;
  }
}

export async function uploadTemplateMediaObject(input: {
  organizationId: string;
  fileName: string;
  mimeType: string;
  buffer: Buffer;
}): Promise<{ objectKey: string; mediaUrl: string }> {
  await ensureBucketExists();

  const bucket = validateEnv().MINIO_BUCKET!;
  const objectKey = `${input.organizationId}/${randomUUID()}-${sanitizeFileName(input.fileName)}`;

  await getS3Client().send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: objectKey,
      Body: input.buffer,
      ContentType: input.mimeType,
      ContentLength: input.buffer.byteLength,
    }),
  );

  return {
    objectKey,
    mediaUrl: buildPublicUrl(objectKey),
  };
}
