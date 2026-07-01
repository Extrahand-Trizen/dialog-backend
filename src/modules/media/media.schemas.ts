import { z } from 'zod';

export type UploadTemplateMediaResultDto = {
  handle: string;
  mediaUrl: string;
  format: 'IMAGE' | 'VIDEO' | 'DOCUMENT';
  mimeType: string;
  fileName: string;
  byteLength: number;
};

export const uploadTemplateMediaFieldsSchema = z.object({
  whatsAppAccountId: z.string().uuid(),
});

export type UploadTemplateMediaFields = z.infer<typeof uploadTemplateMediaFieldsSchema>;

export const templateMediaPreviewQuerySchema = z.object({
  handle: z.string().trim().min(1).max(4096),
});

export type TemplateMediaPreviewQuery = z.infer<typeof templateMediaPreviewQuerySchema>;

export const templateMediaAssetQuerySchema = z.object({
  token: z.string().trim().min(1).max(8192),
});

export type TemplateMediaAssetQuery = z.infer<typeof templateMediaAssetQuerySchema>;
