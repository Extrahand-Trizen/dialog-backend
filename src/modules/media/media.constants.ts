export const MEDIA_IMAGE_MIME_TYPES = ['image/jpeg', 'image/jpg', 'image/png'] as const;
export const MEDIA_VIDEO_MIME_TYPES = ['video/mp4'] as const;
export const MEDIA_DOCUMENT_MIME_TYPES = ['application/pdf'] as const;

export const MEDIA_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const MEDIA_VIDEO_MAX_BYTES = 16 * 1024 * 1024;
export const MEDIA_DOCUMENT_MAX_BYTES = 100 * 1024 * 1024;

export const ALLOWED_MEDIA_MIME_TYPES = [
  ...MEDIA_IMAGE_MIME_TYPES,
  ...MEDIA_VIDEO_MIME_TYPES,
  ...MEDIA_DOCUMENT_MIME_TYPES,
] as const;

export type AllowedMediaMimeType = (typeof ALLOWED_MEDIA_MIME_TYPES)[number];
export type MediaHeaderFormat = 'IMAGE' | 'VIDEO' | 'DOCUMENT';

export function resolveMediaFormat(mimeType: string): MediaHeaderFormat {
  if ((MEDIA_IMAGE_MIME_TYPES as readonly string[]).includes(mimeType)) {
    return 'IMAGE';
  }
  if ((MEDIA_VIDEO_MIME_TYPES as readonly string[]).includes(mimeType)) {
    return 'VIDEO';
  }
  if ((MEDIA_DOCUMENT_MIME_TYPES as readonly string[]).includes(mimeType)) {
    return 'DOCUMENT';
  }
  throw new Error(`Unsupported mime type: ${mimeType}`);
}

export function normalizeMediaMimeType(mimeType: string): AllowedMediaMimeType {
  const normalized = mimeType.toLowerCase();
  if (normalized === 'image/jpg') {
    return 'image/jpeg';
  }
  if ((ALLOWED_MEDIA_MIME_TYPES as readonly string[]).includes(normalized)) {
    return normalized as AllowedMediaMimeType;
  }
  throw new Error(`Unsupported mime type: ${mimeType}`);
}

export function maxBytesForMimeType(mimeType: string): number {
  const format = resolveMediaFormat(mimeType);
  if (format === 'IMAGE') return MEDIA_IMAGE_MAX_BYTES;
  if (format === 'VIDEO') return MEDIA_VIDEO_MAX_BYTES;
  return MEDIA_DOCUMENT_MAX_BYTES;
}
