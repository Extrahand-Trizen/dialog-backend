import multer from 'multer';
import {
  ALLOWED_MEDIA_MIME_TYPES,
  MEDIA_IMAGE_MAX_BYTES,
  MEDIA_VIDEO_MAX_BYTES,
} from './media.constants';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MEDIA_VIDEO_MAX_BYTES,
    files: 1,
  },
  fileFilter: (_req, file, callback) => {
    const mime = file.mimetype.toLowerCase();
    if ((ALLOWED_MEDIA_MIME_TYPES as readonly string[]).includes(mime)) {
      callback(null, true);
      return;
    }
    callback(new Error('Unsupported file type. Use JPEG, PNG, or MP4.'));
  },
});

export const templateMediaUploadMiddleware = upload.single('file');

export function assertUploadedFileSize(mimeType: string, byteLength: number): void {
  const isImage = mimeType.startsWith('image/');
  const max = isImage ? MEDIA_IMAGE_MAX_BYTES : MEDIA_VIDEO_MAX_BYTES;
  if (byteLength > max) {
    throw new Error(`File exceeds maximum size of ${max} bytes`);
  }
}
