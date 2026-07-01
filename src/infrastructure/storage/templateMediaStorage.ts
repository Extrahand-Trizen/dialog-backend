import { randomUUID } from 'node:crypto';
import {
  CreateBucketCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { validateEnv } from '../../config/env';
import logger from '../logging/logger';
import { verifyTemplateMediaAccessToken } from './templateMediaAccess';

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

function getPublicBaseUrl(): string | null {
  const customBase = validateEnv().MINIO_PUBLIC_BASE_URL?.replace(/\/+$/, '');
  return customBase || null;
}

function buildPublicUrl(objectKey: string): string {
  const encodedKey = objectKey.split('/').map(encodeURIComponent).join('/');
  const publicBase = getPublicBaseUrl();
  if (publicBase) {
    return `${publicBase}/${encodedKey}`;
  }
  return buildCanonicalPublicUrl(objectKey);
}

/** Path-style MinIO URL: `{endpoint}/{bucket}/{objectKey}`. */
export function buildCanonicalPublicUrl(objectKey: string): string {
  const env = validateEnv();
  const encodedKey = objectKey.split('/').map(encodeURIComponent).join('/');
  const bucket = env.MINIO_BUCKET!;
  const endpoint = env.MINIO_ENDPOINT!.replace(/\/+$/, '');
  return `${endpoint}/${bucket}/${encodedKey}`;
}

export function extractObjectKeyFromTemplateMediaUrl(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed || !isTemplateMediaStorageConfigured()) {
    return null;
  }

  try {
    const env = validateEnv();
    const bucket = env.MINIO_BUCKET!;
    const endpoint = env.MINIO_ENDPOINT!.replace(/\/+$/, '');
    const canonicalPrefix = `${endpoint}/${bucket}/`;
    const publicBase = getPublicBaseUrl();

    if (trimmed.startsWith(canonicalPrefix)) {
      return decodeURIComponent(trimmed.slice(canonicalPrefix.length));
    }

    const wrongBucketPrefix = `${endpoint}/template-media/`;
    if (trimmed.startsWith(wrongBucketPrefix)) {
      return decodeURIComponent(trimmed.slice(wrongBucketPrefix.length));
    }

    if (publicBase && trimmed.startsWith(`${publicBase}/`)) {
      return decodeURIComponent(trimmed.slice(publicBase.length + 1));
    }

    const escapedEndpoint = endpoint.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`^${escapedEndpoint}/[^/]+/(.+)$`);
    const match = trimmed.match(pattern);
    if (match?.[1]) {
      return decodeURIComponent(match[1]);
    }

    return null;
  } catch {
    return null;
  }
}

function minioPublicUrlFromAssetPath(assetPath: string): string | null {
  try {
    const token = new URL(assetPath, 'http://localhost').searchParams.get('token');
    if (!token) {
      return null;
    }
    const access = verifyTemplateMediaAccessToken(token);
    if (!access) {
      return null;
    }
    return normalizeTemplateMediaPublicUrl(buildCanonicalPublicUrl(access.objectKey));
  } catch {
    return null;
  }
}

/**
 * Returns a browser-loadable MinIO public URL for template preview images.
 */
export function resolveTemplateMediaUrlForClient(
  organizationId: string,
  url: string | undefined,
): string | undefined {
  const trimmed = url?.trim();
  if (!trimmed) {
    return undefined;
  }

  if (trimmed.startsWith('blob:') || trimmed.startsWith('data:')) {
    return trimmed;
  }

  if (trimmed.startsWith('/media/asset?')) {
    return minioPublicUrlFromAssetPath(trimmed) ?? trimmed;
  }

  const objectKey = extractObjectKeyFromTemplateMediaUrl(trimmed);
  if (objectKey && objectKey.startsWith(`${organizationId}/`)) {
    const canonical = trimmed.startsWith('http')
      ? trimmed
      : buildCanonicalPublicUrl(objectKey);
    return normalizeTemplateMediaPublicUrl(canonical);
  }

  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return normalizeTemplateMediaPublicUrl(trimmed);
  }

  return trimmed;
}

/**
 * Normalizes legacy stored URLs and maps API endpoint URLs to the public base when set.
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
    const publicBase = getPublicBaseUrl();

    if (publicBase) {
      if (trimmed.startsWith(`${publicBase}/`)) {
        return trimmed;
      }
      if (trimmed.startsWith(canonicalPrefix)) {
        const suffix = trimmed.slice(canonicalPrefix.length);
        return `${publicBase}/${suffix}`;
      }
      const wrongBucketPrefix = `${endpoint}/template-media/`;
      if (trimmed.startsWith(wrongBucketPrefix)) {
        const suffix = trimmed.slice(wrongBucketPrefix.length);
        return `${publicBase}/${suffix}`;
      }
      const escapedEndpoint = endpoint.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pattern = new RegExp(`^${escapedEndpoint}/[^/]+/(.+)$`);
      const match = trimmed.match(pattern);
      if (match?.[1]) {
        return `${publicBase}/${match[1]}`;
      }
    }

    if (trimmed.startsWith(canonicalPrefix)) {
      return trimmed;
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

export async function getTemplateMediaObject(input: {
  organizationId: string;
  objectKey: string;
}): Promise<{ body: Buffer; mimeType: string; fileName: string }> {
  if (!input.objectKey.startsWith(`${input.organizationId}/`)) {
    throw new Error('Template media object key does not belong to organization');
  }

  const bucket = validateEnv().MINIO_BUCKET!;
  const response = await getS3Client().send(
    new GetObjectCommand({
      Bucket: bucket,
      Key: input.objectKey,
    }),
  );

  if (!response.Body) {
    throw new Error('Template media object body is empty');
  }

  const bytes = await response.Body.transformToByteArray();
  const fileName = input.objectKey.split('/').pop() ?? 'media.bin';

  return {
    body: Buffer.from(bytes),
    mimeType: response.ContentType ?? 'application/octet-stream',
    fileName,
  };
}
