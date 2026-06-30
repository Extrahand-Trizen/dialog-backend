import { decryptField } from '../../infrastructure/encryption/fieldCrypto';
import { getMetaWhatsAppClient } from '../../infrastructure/meta';
import { ConflictError, ValidationError } from '../../shared/errors/AppError';
import { findWhatsAppAccountSecrets } from '../whatsapp/whatsapp.repository';
import { getOrganizationWhatsAppAccount } from '../whatsapp/whatsapp.service';
import { buildMetaComponentsFromDraft } from './templates.meta';
import {
  requireTemplateByName,
  findTemplateByName,
  upsertTemplateFromMeta,
} from './templates.repository';
import type { CreateTemplateInput, TemplateDetailDto } from './templates.schemas';

function mapCreateInputToDraft(input: CreateTemplateInput) {
  return {
    templateFormat: input.templateFormat ?? 'standard',
    carouselCards: input.carouselCards,
    headerText: input.header && 'text' in input.header ? input.header.text : undefined,
    headerMedia:
      input.header && 'format' in input.header
        ? { format: input.header.format, handle: input.header.handle }
        : undefined,
    bodyText: input.body.text,
    footerText: input.footer?.text,
    variableSamples: input.variableSamples,
    buttons: input.buttons,
    linkTrackingEnabled: input.linkTrackingEnabled,
  };
}

export async function createOrganizationTemplate(
  organizationId: string,
  userId: string,
  input: CreateTemplateInput,
): Promise<TemplateDetailDto> {
  const existing = await findTemplateByName(organizationId, input.name, input.language);
  if (existing) {
    throw new ConflictError(
      'Template already exists for this name and language',
      'TEMPLATE_ALREADY_EXISTS',
    );
  }

  await getOrganizationWhatsAppAccount(organizationId, input.whatsAppAccountId);

  const secrets = await findWhatsAppAccountSecrets(organizationId, input.whatsAppAccountId);
  if (!secrets) {
    throw new ValidationError('WhatsApp account not found', {
      whatsAppAccountId: input.whatsAppAccountId,
    });
  }

  const { components, variableSchema } = buildMetaComponentsFromDraft(mapCreateInputToDraft(input));

  const accessToken = decryptField(secrets.accessTokenEnc);
  const metaClient = getMetaWhatsAppClient();

  try {
    const metaResponse = await metaClient.createMessageTemplate(
      secrets.account.metaWabaId,
      accessToken,
      {
        name: input.name,
        language: input.language,
        category: input.category,
        components,
      },
    );

    const result = await upsertTemplateFromMeta({
      organizationId,
      userId,
      metaTemplateId: metaResponse.id,
      metaTemplateName: input.name,
      category: input.category,
      language: input.language,
      metaStatus: 'PENDING',
      components,
      variableSchema,
      rejectionReason: null,
    });

    if (result.action !== 'created') {
      throw new ConflictError(
        'Template already exists for this name and language',
        'TEMPLATE_ALREADY_EXISTS',
      );
    }
  } catch (error) {
    if (error instanceof ConflictError || error instanceof ValidationError) {
      throw error;
    }

    const message = error instanceof Error ? error.message : 'Meta template create failed';
    throw new ValidationError(message, { name: input.name });
  }

  return requireTemplateByName(organizationId, input.name, input.language);
}
