import { validateEnv } from '../../config/env';
import { decryptField } from '../../infrastructure/encryption/fieldCrypto';
import { getMetaWhatsAppClient } from '../../infrastructure/meta';
import {
  getTemplateMediaObject,
  isTemplateMediaStorageConfigured,
  uploadTemplateMediaObject,
} from '../../infrastructure/storage/templateMediaStorage';
import { MetaApiError } from '../../shared/errors/sendErrors';
import { NotFoundError, ValidationError } from '../../shared/errors/AppError';
import { getCachedTemplateMedia, type CachedTemplateMedia } from './media.cache';
import { findWhatsAppAccountSecrets } from '../whatsapp/whatsapp.repository';
import { getOrganizationWhatsAppAccount } from '../whatsapp/whatsapp.service';
import {
  maxBytesForMimeType,
  normalizeMediaMimeType,
  resolveMediaFormat,
} from './media.constants';
import type { UploadTemplateMediaResultDto } from './media.schemas';

export async function uploadTemplateHeaderMedia(input: {
  organizationId: string;
  whatsAppAccountId: string;
  fileName: string;
  mimeType: string;
  buffer: Buffer;
}): Promise<UploadTemplateMediaResultDto> {
  const metaAppId = validateEnv().META_APP_ID;
  if (!metaAppId) {
    throw new ValidationError(
      'META_APP_ID is not configured on the server — required for template media upload',
    );
  }

  if (!isTemplateMediaStorageConfigured()) {
    throw new ValidationError(
      'MinIO is not configured — set MINIO_ENDPOINT, MINIO_ACCESS_KEY, MINIO_SECRET_KEY, and MINIO_BUCKET',
    );
  }

  let mimeType: string;
  try {
    mimeType = normalizeMediaMimeType(input.mimeType);
  } catch {
    throw new ValidationError('Unsupported file type. Use JPEG, PNG, MP4, or PDF.', {
      mimeType: input.mimeType,
    });
  }

  const maxBytes = maxBytesForMimeType(mimeType);
  if (input.buffer.byteLength > maxBytes) {
    throw new ValidationError(`File exceeds maximum size of ${maxBytes} bytes`, {
      byteLength: input.buffer.byteLength,
      maxBytes,
    });
  }

  if (input.buffer.byteLength === 0) {
    throw new ValidationError('Uploaded file is empty');
  }

  await getOrganizationWhatsAppAccount(input.organizationId, input.whatsAppAccountId);

  const secrets = await findWhatsAppAccountSecrets(
    input.organizationId,
    input.whatsAppAccountId,
  );
  if (!secrets) {
    throw new ValidationError('WhatsApp account not found', {
      whatsAppAccountId: input.whatsAppAccountId,
    });
  }

  const accessToken = decryptField(secrets.accessTokenEnc);
  const metaClient = getMetaWhatsAppClient();

  try {
    const [{ handle }, stored] = await Promise.all([
      metaClient.uploadResumableMedia(metaAppId, accessToken, {
        fileName: input.fileName,
        fileBuffer: input.buffer,
        mimeType,
      }),
      uploadTemplateMediaObject({
        organizationId: input.organizationId,
        fileName: input.fileName,
        mimeType,
        buffer: input.buffer,
      }),
    ]);

    return {
      handle,
      mediaUrl: stored.mediaUrl,
      format: resolveMediaFormat(mimeType),
      mimeType,
      fileName: input.fileName,
      byteLength: input.buffer.byteLength,
    };
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }

    const message = error instanceof Error ? error.message : 'Media upload failed';
    const errorCode =
      error instanceof MetaApiError ? error.errorCode : 'META_MEDIA_UPLOAD_FAILED';
    throw new MetaApiError(
      message,
      errorCode,
      error instanceof MetaApiError ? error.httpStatus : 502,
    );
  }
}

export async function getTemplateMediaPreview(input: {
  organizationId: string;
  handle: string;
}): Promise<CachedTemplateMedia> {
  const handle = input.handle.trim();
  if (!handle) {
    throw new ValidationError('Media handle is required');
  }

  const media = await getCachedTemplateMedia(input.organizationId, handle);
  if (!media) {
    throw new NotFoundError('Template media preview not found', 'TEMPLATE_MEDIA_NOT_FOUND');
  }

  return media;
}

export async function getTemplateMediaAsset(input: {
  organizationId: string;
  objectKey: string;
}): Promise<{ body: Buffer; mimeType: string; fileName: string }> {
  if (!isTemplateMediaStorageConfigured()) {
    throw new ValidationError('MinIO template media storage is not configured');
  }

  return getTemplateMediaObject(input);
}
