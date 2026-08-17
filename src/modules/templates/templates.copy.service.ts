import { decryptField } from '../../infrastructure/encryption/fieldCrypto';
import { getMetaWhatsAppClient } from '../../infrastructure/meta';
import logger from '../../infrastructure/logging/logger';
import { ConflictError, ValidationError } from '../../shared/errors/AppError';
import { MetaApiError } from '../../shared/errors/sendErrors';
import { findWhatsAppAccountSecrets } from '../whatsapp/whatsapp.repository';
import { getOrganizationWhatsAppAccount } from '../whatsapp/whatsapp.service';
import { prepareComponentsForWabaCopy } from './templates.copy.media';
import { extractVariableSchema, mapMetaTemplateStatus } from './templates.meta';
import { coerceMetaTemplateId, normalizeStoredTemplateLanguage } from './templateLanguage';
import {
  findActiveTemplateForCreate,
  isTemplateReplaceableForCreate,
  listTemplatesForCopy,
  upsertTemplateFromMeta,
} from './templates.repository';
import type {
  CopyTemplateItemResultDto,
  CopyTemplatesInput,
  CopyTemplatesResultDto,
} from './templates.schemas';

async function copyOneTemplate(input: {
  organizationId: string;
  userId: string;
  source: Awaited<ReturnType<typeof listTemplatesForCopy>>[number];
  targetWhatsAppAccountId: string;
  metaWabaId: string;
  accessToken: string;
}): Promise<CopyTemplateItemResultDto> {
  const name = input.source.metaTemplateName;
  const language = normalizeStoredTemplateLanguage(input.source.language);

  const existing = await findActiveTemplateForCreate({
    organizationId: input.organizationId,
    whatsAppAccountId: input.targetWhatsAppAccountId,
    metaTemplateName: name,
    language,
  });
  if (existing) {
    const replaceable = await isTemplateReplaceableForCreate(input.organizationId, existing);
    if (!replaceable) {
      return {
        templateId: input.source.id,
        name,
        status: 'skipped',
        message: 'Already exists on the destination WABA',
      };
    }
  }

  const { metaComponents, storedComponents } = await prepareComponentsForWabaCopy({
    organizationId: input.organizationId,
    targetWhatsAppAccountId: input.targetWhatsAppAccountId,
    components: input.source.components,
    templateName: name,
  });

  const metaClient = getMetaWhatsAppClient();
  const metaResponse = await metaClient.createMessageTemplate(input.metaWabaId, input.accessToken, {
    name,
    language,
    category: input.source.category,
    components: metaComponents,
  });

  await upsertTemplateFromMeta({
    organizationId: input.organizationId,
    userId: input.userId,
    whatsAppAccountId: input.targetWhatsAppAccountId,
    metaTemplateId: coerceMetaTemplateId(metaResponse.id) ?? metaResponse.id,
    metaTemplateName: name,
    category: input.source.category,
    language,
    metaStatus: mapMetaTemplateStatus(metaResponse.status),
    components: storedComponents,
    variableSchema: input.source.variableSchema ?? extractVariableSchema(storedComponents),
    rejectionReason: null,
  });

  return {
    templateId: input.source.id,
    name,
    status: 'copied',
  };
}

export async function copyOrganizationTemplates(
  organizationId: string,
  userId: string,
  input: CopyTemplatesInput,
): Promise<CopyTemplatesResultDto> {
  await getOrganizationWhatsAppAccount(organizationId, input.sourceWhatsAppAccountId);
  await getOrganizationWhatsAppAccount(organizationId, input.targetWhatsAppAccountId);

  const secrets = await findWhatsAppAccountSecrets(organizationId, input.targetWhatsAppAccountId);
  if (!secrets) {
    throw new ValidationError('Destination WhatsApp account not found', {
      targetWhatsAppAccountId: input.targetWhatsAppAccountId,
    });
  }

  const sources = await listTemplatesForCopy({
    organizationId,
    whatsAppAccountId: input.sourceWhatsAppAccountId,
    templateIds: input.copyAll ? undefined : input.templateIds,
  });

  if (!input.copyAll && input.templateIds?.length) {
    const foundIds = new Set(sources.map((row) => row.id));
    const missing = input.templateIds.filter((id) => !foundIds.has(id));
    if (missing.length > 0) {
      throw new ValidationError('One or more templates were not found on the source WABA', {
        templateIds: missing,
      });
    }
  }

  const accessToken = decryptField(secrets.accessTokenEnc);
  const items: CopyTemplateItemResultDto[] = [];

  for (const source of sources) {
    try {
      items.push(
        await copyOneTemplate({
          organizationId,
          userId,
          source,
          targetWhatsAppAccountId: input.targetWhatsAppAccountId,
          metaWabaId: secrets.account.metaWabaId,
          accessToken,
        }),
      );
    } catch (error) {
      if (error instanceof ConflictError) {
        items.push({
          templateId: source.id,
          name: source.metaTemplateName,
          status: 'skipped',
          message: error.message,
        });
        continue;
      }

      const message =
        error instanceof MetaApiError || error instanceof ValidationError
          ? error.message
          : error instanceof Error
            ? error.message
            : 'Failed to copy template';

      logger.warn('Template copy to WABA failed', {
        organizationId,
        sourceTemplateId: source.id,
        name: source.metaTemplateName,
        targetWhatsAppAccountId: input.targetWhatsAppAccountId,
        message,
      });

      items.push({
        templateId: source.id,
        name: source.metaTemplateName,
        status: 'failed',
        message,
      });
    }
  }

  return {
    sourceWhatsAppAccountId: input.sourceWhatsAppAccountId,
    targetWhatsAppAccountId: input.targetWhatsAppAccountId,
    copiedCount: items.filter((item) => item.status === 'copied').length,
    skippedCount: items.filter((item) => item.status === 'skipped').length,
    failedCount: items.filter((item) => item.status === 'failed').length,
    items,
  };
}
