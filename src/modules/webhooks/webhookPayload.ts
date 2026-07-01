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
  metaTemplateId?: string;
  metaTemplateName?: string;
  language?: string;
  event: string;
  rejectionReason?: string;
  rawValue: JsonRecord;
};

export function extractTemplateStatusUpdates(payload: unknown): MetaTemplateStatusEvent[] {
  const updates: MetaTemplateStatusEvent[] = [];

  if (!isRecord(payload)) {
    return updates;
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

      const value = change.value;
      const metaTemplateId =
        typeof value.message_template_id === 'string' ? value.message_template_id : undefined;
      const metaTemplateName =
        typeof value.message_template_name === 'string' ? value.message_template_name : undefined;
      const language =
        typeof value.message_template_language === 'string'
          ? value.message_template_language
          : undefined;

      const event =
        typeof value.event === 'string' ? value.event.toUpperCase() : 'UNKNOWN';

      const rejectionReason =
        typeof value.reason === 'string'
          ? value.reason
          : typeof value.rejected_reason === 'string'
            ? value.rejected_reason
            : undefined;

      if (metaTemplateId || metaTemplateName) {
        updates.push({
          metaTemplateId,
          metaTemplateName,
          language,
          event,
          rejectionReason,
          rawValue: value,
        });
      }
    }
  }

  return updates;
}

/** @deprecated Use extractTemplateStatusUpdates */
export function extractTemplateStatusEvent(payload: unknown): MetaTemplateStatusEvent | null {
  const updates = extractTemplateStatusUpdates(payload);
  return updates[0] ?? null;
}

export type MetaInboundMessage = {
  metaMessageId: string;
  metaPhoneNumberId: string;
  customerPhone: string;
  messageType: string;
  bodyText?: string;
  timestamp?: string;
  rawPayload: JsonRecord;
};

function mapInboundMessageType(type: string): string {
  switch (type.toLowerCase()) {
    case 'text':
      return 'TEXT';
    case 'image':
      return 'IMAGE';
    case 'video':
      return 'VIDEO';
    case 'document':
      return 'DOCUMENT';
    case 'audio':
      return 'AUDIO';
    case 'interactive':
      return 'INTERACTIVE';
    default:
      return 'UNKNOWN';
  }
}

export function extractInboundMessages(payload: unknown): MetaInboundMessage[] {
  const messages: MetaInboundMessage[] = [];

  if (!isRecord(payload)) {
    return messages;
  }

  for (const entry of asArray(payload.entry)) {
    if (!isRecord(entry)) {
      continue;
    }

    for (const change of asArray(entry.changes)) {
      if (!isRecord(change) || change.field !== 'messages' || !isRecord(change.value)) {
        continue;
      }

      const value = change.value;
      const metadata = isRecord(value.metadata) ? value.metadata : undefined;
      const metaPhoneNumberId =
        metadata && typeof metadata.phone_number_id === 'string'
          ? metadata.phone_number_id
          : undefined;

      if (!metaPhoneNumberId) {
        continue;
      }

      for (const message of asArray(value.messages)) {
        if (!isRecord(message) || typeof message.id !== 'string' || typeof message.from !== 'string') {
          continue;
        }

        const messageType =
          typeof message.type === 'string' ? mapInboundMessageType(message.type) : 'UNKNOWN';

        let bodyText: string | undefined;
        if (messageType === 'TEXT' && isRecord(message.text) && typeof message.text.body === 'string') {
          bodyText = message.text.body;
        }

        messages.push({
          metaMessageId: message.id,
          metaPhoneNumberId,
          customerPhone: message.from,
          messageType,
          bodyText,
          timestamp: typeof message.timestamp === 'string' ? message.timestamp : undefined,
          rawPayload: message,
        });
      }
    }
  }

  return messages;
}

const SENSITIVE_KEY_RE = /token|secret|password|authorization/i;

export function sanitizeWebhookValueForLog(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sanitizeWebhookValueForLog);
  }

  if (!isRecord(value)) {
    return value;
  }

  const sanitized: JsonRecord = {};
  for (const [key, nested] of Object.entries(value)) {
    if (SENSITIVE_KEY_RE.test(key)) {
      sanitized[key] = '[REDACTED]';
      continue;
    }
    sanitized[key] = sanitizeWebhookValueForLog(nested);
  }
  return sanitized;
}

export function extractWebhookChangesForLog(payload: unknown): Array<{ field: string; value: unknown }> {
  const changes: Array<{ field: string; value: unknown }> = [];

  if (!isRecord(payload)) {
    return changes;
  }

  for (const entry of asArray(payload.entry)) {
    if (!isRecord(entry)) {
      continue;
    }

    for (const change of asArray(entry.changes)) {
      if (!isRecord(change) || typeof change.field !== 'string') {
        continue;
      }

      changes.push({
        field: change.field,
        value: sanitizeWebhookValueForLog(change.value),
      });
    }
  }

  return changes;
}
