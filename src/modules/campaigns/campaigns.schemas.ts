import { z } from 'zod';

export const listCampaignsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  search: z.string().trim().max(80).optional(),
});

export const createCampaignSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  templateName: z.string().trim().min(1).max(512),
  language: z.string().trim().min(2).max(16),
  phoneNumberId: z.string().uuid().optional(),
  variables: z.record(z.string()).optional(),
  recipients: z.array(z.string().regex(/^\d{10,15}$/)).min(1).max(200),
});

export const updateCampaignRecipientSchema = z.object({
  phone: z.string().regex(/^\d{10,15}$/),
  status: z.enum([
    'pending',
    'sending',
    'queued',
    'sent',
    'delivered',
    'read',
    'failed',
    'duplicate',
  ]),
  messageId: z.string().trim().min(1).max(80).optional(),
  error: z.string().trim().max(500).optional(),
});

export type ListCampaignsQuery = z.infer<typeof listCampaignsQuerySchema>;
export type CreateCampaignInput = z.infer<typeof createCampaignSchema>;
export type UpdateCampaignRecipientInput = z.infer<typeof updateCampaignRecipientSchema>;

export type CampaignRecipientDto = {
  phone: string;
  status: UpdateCampaignRecipientInput['status'];
  messageId?: string;
  error?: string;
};

export type CampaignDto = {
  id: string;
  name: string;
  templateName: string;
  language: string;
  phoneNumberId: string | null;
  variables: Record<string, string> | null;
  status: 'sending' | 'completed';
  recipientCount: number;
  queuedCount: number;
  sentCount: number;
  failedCount: number;
  duplicateCount: number;
  createdAt: string;
  completedAt: string | null;
  recipients?: CampaignRecipientDto[];
};
