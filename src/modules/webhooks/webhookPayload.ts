import { createHash } from 'crypto';
import type { WebhookEventType } from './webhooks.schemas';

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function parseWebhookPayload(rawBody: string): unknown {
  return JSON.parse(rawBody) as unknown;
}

export function extractMetaWabaId(payload: unknown): string | null {
  if (!isRecord(payload)) {
    return null;
  }

  const entry = asArray(payload.entry)[0];
  if (!isRecord(entry) || typeof entry.id !== 'string') {
    return null;
  }

  return entry.id;
}

export function detectWebhookEventType(payload: unknown): WebhookEventType {
  if (!isRecord(payload)) {
    return 'UNKNOWN';
  }

  for (const entry of asArray(payload.entry)) {
    if (!isRecord(entry)) {
      continue;
    }

    for (const change of asArray(entry.changes)) {
      if (!isRecord(change) || typeof change.field !== 'string') {
        continue;
      }

      if (change.field === 'messages') {
        return 'MESSAGES';
      }
      if (change.field === 'message_template_status_update') {
        return 'MESSAGE_TEMPLATE_STATUS_UPDATE';
      }
      if (
        change.field === 'phone_number_quality_update' ||
        change.field === 'account_update'
      ) {
        return 'PHONE_NUMBER_QUALITY_UPDATE';
      }
    }
  }

  return 'UNKNOWN';
}

export function extractMetaEventId(payload: unknown, rawBody: string): string {
  if (!isRecord(payload)) {
    return createHash('sha256').update(rawBody, 'utf8').digest('hex');
  }

  for (const entry of asArray(payload.entry)) {
    if (!isRecord(entry)) {
      continue;
    }

    for (const change of asArray(entry.changes)) {
      if (!isRecord(change) || !isRecord(change.value)) {
        continue;
      }

      const statuses = asArray(change.value.statuses);
      for (const status of statuses) {
        if (isRecord(status) && typeof status.id === 'string') {
          return status.id;
        }
      }

      const messages = asArray(change.value.messages);
      for (const message of messages) {
        if (isRecord(message) && typeof message.id === 'string') {
          return message.id;
        }
      }

      if (typeof change.value.message_template_id === 'string') {
        const event = typeof change.value.event === 'string' ? change.value.event : 'update';
        return `${change.value.message_template_id}:${event}`;
      }
    }
  }

  return createHash('sha256').update(rawBody, 'utf8').digest('hex');
}

export type MetaMessageStatusUpdate = {
  id: string;
  status: string;
  timestamp?: string;
  recipientId?: string;
  errorCode?: string;
  errorMessage?: string;
  pricingCategory?: string;
  pricingModel?: string;
  billable?: boolean;
  metaConversationId?: string;
};

export function extractMessageStatusUpdates(payload: unknown): MetaMessageStatusUpdate[] {
  const updates: MetaMessageStatusUpdate[] = [];

  if (!isRecord(payload)) {
    return updates;
  }

  for (const entry of asArray(payload.entry)) {
    if (!isRecord(entry)) {
      continue;
    }

    for (const change of asArray(entry.changes)) {
      if (!isRecord(change) || change.field !== 'messages' || !isRecord(change.value)) {
        continue;
      }

      for (const status of asArray(change.value.statuses)) {
        if (!isRecord(status) || typeof status.id !== 'string' || typeof status.status !== 'string') {
          continue;
        }

        const errors = asArray(status.errors);
        const firstError = errors.find(isRecord);
        const pricing = isRecord(status.pricing) ? status.pricing : undefined;
        const conversation = isRecord(status.conversation) ? status.conversation : undefined;

        updates.push({
          id: status.id,
          status: status.status,
          timestamp: typeof status.timestamp === 'string' ? status.timestamp : undefined,
          recipientId: typeof status.recipient_id === 'string' ? status.recipient_id : undefined,
          errorCode:
            firstError && typeof firstError.code === 'string' ? firstError.code : undefined,
          errorMessage:
            firstError && typeof firstError.title === 'string'
              ? firstError.title
              : firstError && typeof firstError.message === 'string'
                ? firstError.message
                : undefined,
          pricingCategory:
            pricing && typeof pricing.category === 'string' ? pricing.category : undefined,
          pricingModel:
            pricing && typeof pricing.pricing_model === 'string'
              ? pricing.pricing_model
              : undefined,
          billable: pricing && typeof pricing.billable === 'boolean' ? pricing.billable : undefined,
          metaConversationId:
            conversation && typeof conversation.id === 'string' ? conversation.id : undefined,
        });
      }
    }
  }

  return updates;
}

export type MetaPhoneQualityUpdate = {
  metaPhoneNumberId: string;
  qualityRating?: string;
  messagingTier?: string;
};

export function extractPhoneQualityUpdates(payload: unknown): MetaPhoneQualityUpdate[] {
  const updates: MetaPhoneQualityUpdate[] = [];

  if (!isRecord(payload)) {
    return updates;
  }

  for (const entry of asArray(payload.entry)) {
    if (!isRecord(entry)) {
      continue;
    }

    for (const change of asArray(entry.changes)) {
      if (!isRecord(change) || !isRecord(change.value)) {
        continue;
      }

      if (change.field === 'phone_number_quality_update' || change.field === 'account_update') {
        const value = change.value;
        const metadata = isRecord(value.metadata) ? value.metadata : undefined;
        const phoneNumberId =
          typeof value.phone_number_id === 'string'
            ? value.phone_number_id
            : metadata && typeof metadata.phone_number_id === 'string'
              ? metadata.phone_number_id
              : null;

        if (phoneNumberId) {
          updates.push({
            metaPhoneNumberId: phoneNumberId,
            qualityRating:
              typeof value.quality_rating === 'string' ? value.quality_rating : undefined,
            messagingTier:
              typeof value.current_limit === 'string'
                ? value.current_limit
                : typeof value.messaging_limit_tier === 'string'
                  ? value.messaging_limit_tier
                  : undefined,
          });
        }
      }
    }
  }

  return updates;
}

export type MetaTemplateStatusEvent = {
  templateId: string;
  event: string;
  rejectionReason?: string;
};

export function extractTemplateStatusEvent(payload: unknown): MetaTemplateStatusEvent | null {
  if (!isRecord(payload)) {
    return null;
  }

  for (const entry of asArray(payload.entry)) {
    if (!isRecord(entry)) {
      continue;
    }

    for (const change of asArray(entry.changes)) {
      if (
        !isRecord(change) ||
        change.field !== 'message_template_status_update' ||
        !isRecord(change.value)
      ) {
        continue;
      }

      const templateId =
        typeof change.value.message_template_id === 'string'
          ? change.value.message_template_id
          : typeof change.value.message_template_name === 'string'
            ? change.value.message_template_name
            : null;

      const event =
        typeof change.value.event === 'string' ? change.value.event.toUpperCase() : 'UNKNOWN';

      const rejectionReason =
        typeof change.value.reason === 'string'
          ? change.value.reason
          : typeof change.value.rejected_reason === 'string'
            ? change.value.rejected_reason
            : undefined;

      if (templateId) {
        return { templateId, event, rejectionReason };
      }
    }
  }

  return null;
}
