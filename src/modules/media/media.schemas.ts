import { z } from 'zod';

export type UploadTemplateMediaResultDto = {
  handle: string;
  format: 'IMAGE' | 'VIDEO' | 'DOCUMENT';
  mimeType: string;
  fileName: string;
  byteLength: number;
};

export const uploadTemplateMediaFieldsSchema = z.object({
  whatsAppAccountId: z.string().uuid(),
});

export type UploadTemplateMediaFields = z.infer<typeof uploadTemplateMediaFieldsSchema>;
