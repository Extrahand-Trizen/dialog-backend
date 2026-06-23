import { Request, Response } from 'express';
import { AppResponse } from '../../shared/responses/AppResponse';
import { ValidationError } from '../../shared/errors/AppError';
import { uploadTemplateMediaFieldsSchema } from './media.schemas';
import { uploadTemplateHeaderMedia } from './media.service';
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
