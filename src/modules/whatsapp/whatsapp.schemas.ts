import { z } from 'zod';

export const createWhatsAppAccountSchema = z.object({
  metaWabaId: z.string().min(1),
  name: z.string().min(1).max(200).optional(),
  accessToken: z.string().min(1),
  appSecret: z.string().min(1),
  webhookVerifyToken: z.string().min(1).optional(),
  syncPhones: z.boolean().default(true),
});

export type CreateWhatsAppAccountInput = z.infer<typeof createWhatsAppAccountSchema>;

export type WhatsAppAccountStatus = 'ACTIVE' | 'ERROR' | 'DISCONNECTED';

export type WhatsAppAccountDto = {
  id: string;
  organizationId: string;
  metaWabaId: string;
  name: string | null;
  status: WhatsAppAccountStatus;
  lastSyncedAt: string | null;
  lastError: string | null;
  phoneNumberCount: number;
  createdAt: string;
  updatedAt: string;
};

export type PhoneNumberStatus = 'ACTIVE' | 'PENDING' | 'RESTRICTED' | 'INACTIVE';
export type PhoneQualityRating = 'GREEN' | 'YELLOW' | 'RED' | 'UNKNOWN';

export type PhoneNumberDto = {
  id: string;
  whatsAppAccountId: string;
  metaPhoneNumberId: string;
  displayNumber: string;
  verifiedName: string | null;
  qualityRating: PhoneQualityRating;
  messagingTier: string | null;
  status: PhoneNumberStatus;
  isDefault: boolean;
  lastHealthCheckAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ConnectWhatsAppAccountResultDto = {
  account: WhatsAppAccountDto;
  phoneNumbers: PhoneNumberDto[];
};
