import { z } from 'zod';

export const API_KEY_SCOPES = ['events:write', 'messages:write', 'templates:read'] as const;

export const createApiKeySchema = z.object({
  name: z.string().min(1).max(100),
  scopes: z.array(z.enum(API_KEY_SCOPES)).min(1).default(['messages:write']),
  expiresAt: z.string().datetime().optional(),
});

export type CreateApiKeyInput = z.infer<typeof createApiKeySchema>;

export type ApiKeySummaryDto = {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
};

export type CreateApiKeyResultDto = {
  apiKey: ApiKeySummaryDto;
  secret: string;
};
