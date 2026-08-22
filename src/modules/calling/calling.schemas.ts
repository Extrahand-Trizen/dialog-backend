import { z } from 'zod';

export const CALL_HISTORY_FILTERS = ['all', 'incoming', 'outgoing', 'missed'] as const;

export const listCallsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  filter: z.enum(CALL_HISTORY_FILTERS).default('all'),
  search: z.string().trim().max(80).optional(),
  contactId: z.string().uuid().optional(),
});

export const initiateCallSchema = z
  .object({
    contactId: z.string().uuid().optional(),
    phone: z.string().trim().min(8).max(20).optional(),
    name: z.string().trim().min(1).max(120).optional(),
    virtualNumberId: z.string().uuid().optional(),
  })
  .refine((value) => Boolean(value.contactId || value.phone), {
    message: 'contactId or phone is required',
  });

export const endCallSchema = z.object({
  status: z.enum(['COMPLETED', 'MISSED', 'REJECTED', 'FAILED', 'CANCELLED', 'BUSY', 'NO_ANSWER']).optional(),
});

export const updateCallingSettingsSchema = z.object({
  virtualNumber: z.string().trim().max(32).optional(),
  callerIdDisplay: z.string().trim().max(80).optional(),
  recordCalls: z.boolean().optional(),
  announceMaskedCalling: z.boolean().optional(),
  businessHoursOnly: z.boolean().optional(),
});

export type ListCallsQuery = z.infer<typeof listCallsQuerySchema>;
export type InitiateCallInput = z.infer<typeof initiateCallSchema>;
export type EndCallInput = z.infer<typeof endCallSchema>;
export type UpdateCallingSettingsInput = z.infer<typeof updateCallingSettingsSchema>;

export type CallContactDto = {
  id: string;
  name: string;
  phoneE164: string;
  maskedPhone: string;
  avatarInitials: string;
  avatarColor: string;
  whatsappAvailable: boolean;
  company: string | null;
  email: string | null;
};

export type CallRecordDto = {
  id: string;
  contactId: string;
  direction: 'outgoing' | 'incoming';
  status:
    | 'queued'
    | 'ringing'
    | 'answered'
    | 'completed'
    | 'missed'
    | 'busy'
    | 'no_answer'
    | 'failed'
    | 'cancelled';
  durationSeconds: number | null;
  startedAt: string;
  endedAt: string | null;
  virtualNumber: string;
  maskingActive: boolean;
  contact: CallContactDto;
};

export type ConversationTimelineItemDto =
  | {
      id: string;
      kind: 'message';
      direction: 'inbound' | 'outbound';
      body: string;
      at: string;
    }
  | {
      id: string;
      kind: 'call';
      callId: string;
      direction: 'outgoing' | 'incoming';
      status: CallRecordDto['status'];
      durationSeconds: number | null;
      at: string;
    };

export type CallingNotificationDto = {
  id: string;
  type: 'missed_call' | 'completed_call' | 'whatsapp_message';
  contactId: string;
  title: string;
  body: string;
  at: string;
  read: boolean;
};

export type CallingSettingsDto = {
  providerName: string;
  providerStatus: 'connected' | 'disconnected' | 'degraded';
  virtualNumber: string;
  callerIdDisplay: string;
  recordCalls: boolean;
  announceMaskedCalling: boolean;
  businessHoursOnly: boolean;
  privacyNote: string;
};
