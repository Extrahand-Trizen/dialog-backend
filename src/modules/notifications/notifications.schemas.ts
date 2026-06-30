import { z } from 'zod';

export const EVENT_INGEST_STATUSES = [
  'RECEIVED',
  'PROCESSING',
  'PROCESSED',
  'FAILED',
  'SKIPPED',
] as const;

export const EXECUTION_STATUSES = ['QUEUED', 'PROCESSING', 'SENT', 'FAILED', 'SKIPPED'] as const;

export type EventIngestStatus = (typeof EVENT_INGEST_STATUSES)[number];
export type ExecutionStatus = (typeof EXECUTION_STATUSES)[number];

export const ingestEventSchema = z.object({
  eventKey: z
    .string()
    .min(1)
    .max(120)
    .regex(/^[a-zA-Z0-9._-]+$/),
  recipientPhone: z.string().min(8).max(20),
  payload: z.record(z.string(), z.unknown()).default({}),
  idempotencyKey: z.string().min(1).max(200),
});

export type IngestEventInput = z.infer<typeof ingestEventSchema>;

export type EventIngestDto = {
  id: string;
  organizationId: string;
  correlationId: string;
  eventKey: string;
  idempotencyKey: string;
  recipientPhone: string;
  status: EventIngestStatus;
  errorMessage: string | null;
  processedAt: string | null;
  createdAt: string;
};

export type IngestEventResultDto = {
  eventIngest: EventIngestDto;
  duplicate: boolean;
  executionId?: string;
  messageId?: string;
};

export type NotificationTriggerJobData = {
  eventIngestId: string;
  correlationId?: string;
  executionSource?: 'EVENT' | 'INTERNAL';
};
