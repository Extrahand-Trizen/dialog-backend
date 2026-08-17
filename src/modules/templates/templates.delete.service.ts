import { decryptField } from '../../infrastructure/encryption/fieldCrypto';
import { getMetaWhatsAppClient } from '../../infrastructure/meta';
import logger from '../../infrastructure/logging/logger';
import { ValidationError } from '../../shared/errors/AppError';
import { MetaApiError } from '../../shared/errors/sendErrors';
import { findWhatsAppAccountSecrets } from '../whatsapp/whatsapp.repository';
import { getOrganizationWhatsAppAccount } from '../whatsapp/whatsapp.service';
import {
  findActiveNotificationRuleNamesByTemplateIds,
  listTemplatesForCopy,
  softDeleteTemplate,
} from './templates.repository';
import type {
  DeleteTemplateItemResultDto,
  DeleteTemplatesInput,
  DeleteTemplatesResultDto,
} from './templates.schemas';

function isBenignMetaDeleteError(error: MetaApiError): boolean {
  const message = error.message.toLowerCase();
  return (
    error.httpStatus === 404 ||
    message.includes('does not exist') ||
    message.includes('not found')
  );
}

async function deleteOneTemplate(input: {
  organizationId: string;
  userId: string;
  source: Awaited<ReturnType<typeof listTemplatesForCopy>>[number];
  metaWabaId: string;
  accessToken: string;
  ruleNames: string[];
}): Promise<DeleteTemplateItemResultDto> {
  const name = input.source.metaTemplateName;

  if (input.ruleNames.length > 0) {
    return {
      templateId: input.source.id,
      name,
      status: 'skipped',
      message: `Used by notification rule${input.ruleNames.length === 1 ? '' : 's'}: ${input.ruleNames.join(', ')}`,
    };
  }

  if (input.source.metaTemplateId || name) {
    const metaClient = getMetaWhatsAppClient();
    try {
      await metaClient.deleteMessageTemplate(input.metaWabaId, input.accessToken, {
        name,
        hsmId: input.source.metaTemplateId,
      });
    } catch (error) {
      if (!(error instanceof MetaApiError) || !isBenignMetaDeleteError(error)) {
        throw error;
      }

      logger.info('Meta template already absent during delete — continuing with local delete', {
        organizationId: input.organizationId,
        templateId: input.source.id,
        name,
      });
    }
  }

  await softDeleteTemplate({
    organizationId: input.organizationId,
    templateId: input.source.id,
    deletedById: input.userId,
  });

  return {
    templateId: input.source.id,
    name,
    status: 'deleted',
  };
}

export async function deleteOrganizationTemplates(
  organizationId: string,
  userId: string,
  input: DeleteTemplatesInput,
): Promise<DeleteTemplatesResultDto> {
  await getOrganizationWhatsAppAccount(organizationId, input.whatsAppAccountId);

  const secrets = await findWhatsAppAccountSecrets(organizationId, input.whatsAppAccountId);
  if (!secrets) {
    throw new ValidationError('WhatsApp account not found', {
      whatsAppAccountId: input.whatsAppAccountId,
    });
  }

  const sources = await listTemplatesForCopy({
    organizationId,
    whatsAppAccountId: input.whatsAppAccountId,
    templateIds: input.templateIds,
  });

  const foundIds = new Set(sources.map((row) => row.id));
  const missing = input.templateIds.filter((id) => !foundIds.has(id));
  if (missing.length > 0) {
    throw new ValidationError('One or more templates were not found on this WABA', {
      templateIds: missing,
    });
  }

  const ruleNamesByTemplateId = await findActiveNotificationRuleNamesByTemplateIds(
    organizationId,
    input.templateIds,
  );

  const accessToken = decryptField(secrets.accessTokenEnc);
  const items: DeleteTemplateItemResultDto[] = [];

  for (const source of sources) {
    try {
      items.push(
        await deleteOneTemplate({
          organizationId,
          userId,
          source,
          metaWabaId: secrets.account.metaWabaId,
          accessToken,
          ruleNames: ruleNamesByTemplateId.get(source.id) ?? [],
        }),
      );
    } catch (error) {
      const message =
        error instanceof MetaApiError || error instanceof ValidationError
          ? error.message
          : error instanceof Error
            ? error.message
            : 'Failed to delete template';

      logger.warn('Template delete failed', {
        organizationId,
        templateId: source.id,
        name: source.metaTemplateName,
        whatsAppAccountId: input.whatsAppAccountId,
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
    whatsAppAccountId: input.whatsAppAccountId,
    deletedCount: items.filter((item) => item.status === 'deleted').length,
    skippedCount: items.filter((item) => item.status === 'skipped').length,
    failedCount: items.filter((item) => item.status === 'failed').length,
    items,
  };
}
