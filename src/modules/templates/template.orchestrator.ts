import { decryptField } from '../../infrastructure/encryption/fieldCrypto';
import { getMetaWhatsAppClient } from '../../infrastructure/meta';
import logger from '../../infrastructure/logging/logger';
import { NotFoundError } from '../../shared/errors/AppError';
import { findWhatsAppAccountSecrets } from '../whatsapp/whatsapp.repository';
import { mapMetaTemplateNode, mapMetaTemplateStatus } from './templates.meta';
import {
  updateTemplateStatusFromWebhook,
  upsertTemplateFromMeta,
} from './templates.repository';
import type { MetaTemplateStatus, TemplateSyncResultDto } from './templates.schemas';

export async function syncTemplatesForAccount(input: {
  organizationId: string;
  whatsAppAccountId: string;
  userId: string;
  correlationId?: string;
}): Promise<TemplateSyncResultDto> {
  const secrets = await findWhatsAppAccountSecrets(input.organizationId, input.whatsAppAccountId);
  if (!secrets) {
    throw new NotFoundError('WhatsApp account not found', 'WHATSAPP_ACCOUNT_NOT_FOUND');
  }

  const accessToken = decryptField(secrets.accessTokenEnc);
  const metaClient = getMetaWhatsAppClient();
  const metaWabaId = secrets.account.metaWabaId;

  let after: string | undefined;
  let syncedCount = 0;
  let createdCount = 0;
  let updatedCount = 0;
  let versionedCount = 0;

  do {
    const response = await metaClient.listMessageTemplates(metaWabaId, accessToken, after);

    for (const node of response.data) {
      const mapped = mapMetaTemplateNode(node);
      const result = await upsertTemplateFromMeta({
        organizationId: input.organizationId,
        userId: input.userId,
        whatsAppAccountId: input.whatsAppAccountId,
        preserveExistingStatus: true,
        ...mapped,
      });

      syncedCount += 1;
      if (result.action === 'created') {
        createdCount += 1;
      } else if (result.action === 'versioned') {
        versionedCount += 1;
      } else {
        updatedCount += 1;
      }
    }

    after = response.paging?.cursors?.after;
  } while (after);

  logger.info('Template sync completed (content import only — status from webhooks)', {
    correlationId: input.correlationId,
    organizationId: input.organizationId,
    whatsAppAccountId: input.whatsAppAccountId,
    syncedCount,
    createdCount,
    updatedCount,
    versionedCount,
  });

  return {
    whatsAppAccountId: input.whatsAppAccountId,
    syncedCount,
    createdCount,
    updatedCount,
    versionedCount,
  };
}

export async function applyTemplateWebhookStatus(input: {
  organizationId: string;
  metaWabaId: string;
  metaTemplateId?: string;
  metaTemplateName?: string;
  language?: string;
  metaStatus: MetaTemplateStatus;
  rejectionReason?: string | null;
  rawWebhookPayload?: object;
  correlationId?: string;
}): Promise<void> {
  const updated = await updateTemplateStatusFromWebhook({
    organizationId: input.organizationId,
    metaTemplateId: input.metaTemplateId,
    metaTemplateName: input.metaTemplateName,
    language: input.language,
    metaStatus: input.metaStatus,
    rejectionReason: input.rejectionReason,
    rawWebhookPayload: input.rawWebhookPayload,
  });

  if (!updated) {
    logger.warn('Template webhook status update skipped — template not found locally', {
      correlationId: input.correlationId,
      organizationId: input.organizationId,
      metaWabaId: input.metaWabaId,
      metaTemplateId: input.metaTemplateId,
      metaTemplateName: input.metaTemplateName,
      language: input.language,
      metaStatus: input.metaStatus,
    });
  }
}

export function mapTemplateWebhookEvent(event: string): MetaTemplateStatus {
  return mapMetaTemplateStatus(event);
}
