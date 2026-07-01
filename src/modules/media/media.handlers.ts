import { Request, Response } from 'express';
import { AppResponse } from '../../shared/responses/AppResponse';
import { ValidationError, NotFoundError } from '../../shared/errors/AppError';
import { verifyTemplateMediaAccessToken } from '../../infrastructure/storage/templateMediaAccess';
import {
  templateMediaAssetQuerySchema,
  templateMediaPreviewQuerySchema,
  uploadTemplateMediaFieldsSchema,
} from './media.schemas';
import {
  getTemplateMediaAsset,
  getTemplateMediaPreview,
  uploadTemplateHeaderMedia,
} from './media.service';
import { assertUploadedFileSize } from './media.middleware';

function requireJwtContext(req: Request): { organizationId: string } {
  const auth = req.auth;
  if (!auth || auth.type !== 'jwt') {
    throw new Error('JWT context missing after auth middleware');
  }
  return { organizationId: auth.organizationId };
}

export async function uploadTemplateMediaHandler(req: Request, res: Response): Promise<void> {
  const { organizationId } = requireJwtContext(req);

  const file = req.file;
  if (!file) {
    throw new ValidationError('File is required (multipart field name: file)');
  }

  const fields = uploadTemplateMediaFieldsSchema.safeParse(req.body);
  if (!fields.success) {
    throw new ValidationError('Invalid upload fields', fields.error.flatten());
  }

  assertUploadedFileSize(file.mimetype, file.size);

  const result = await uploadTemplateHeaderMedia({
    organizationId,
    whatsAppAccountId: fields.data.whatsAppAccountId,
    fileName: file.originalname || 'upload.bin',
    mimeType: file.mimetype,
    buffer: file.buffer,
  });

  AppResponse.success(res, 'Media uploaded to Meta', result, undefined, 201);
}

export async function templateMediaAssetHandler(req: Request, res: Response): Promise<void> {
  const parsed = templateMediaAssetQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    throw new ValidationError('Invalid media asset query', parsed.error.flatten());
  }

  const access = verifyTemplateMediaAccessToken(parsed.data.token);
  if (!access) {
    throw new NotFoundError('Template media not found', 'TEMPLATE_MEDIA_NOT_FOUND');
  }

  let media: Awaited<ReturnType<typeof getTemplateMediaAsset>>;
  try {
    media = await getTemplateMediaAsset({
      organizationId: access.organizationId,
      objectKey: access.objectKey,
    });
  } catch {
    throw new NotFoundError('Template media not found', 'TEMPLATE_MEDIA_NOT_FOUND');
  }

  res.setHeader('Content-Type', media.mimeType);
  res.setHeader('Content-Disposition', `inline; filename="${media.fileName.replace(/"/g, '')}"`);
  res.setHeader('Cache-Control', 'private, max-age=3600');
  res.send(media.body);
}

export async function previewTemplateMediaHandler(req: Request, res: Response): Promise<void> {
  const { organizationId } = requireJwtContext(req);

  const parsed = templateMediaPreviewQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    throw new ValidationError('Invalid preview query', parsed.error.flatten());
  }

  const media = await getTemplateMediaPreview({
    organizationId,
    handle: parsed.data.handle,
  });

  res.setHeader('Content-Type', media.mimeType);
  res.setHeader('Content-Disposition', `inline; filename="${media.fileName.replace(/"/g, '')}"`);
  res.setHeader('Cache-Control', 'private, max-age=3600');
  res.send(media.data);
}
