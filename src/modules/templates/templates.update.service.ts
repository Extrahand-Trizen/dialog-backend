import { decryptField } from '../../infrastructure/encryption/fieldCrypto';
import { getMetaWhatsAppClient } from '../../infrastructure/meta';
import { ValidationError } from '../../shared/errors/AppError';
import { MetaApiError } from '../../shared/errors/sendErrors';
import { findWhatsAppAccountSecrets } from '../whatsapp/whatsapp.repository';
import { getOrganizationWhatsAppAccount } from '../whatsapp/whatsapp.service';
import { buildMetaComponentsFromDraft, enrichStoredComponentsWithMediaUrls, mapMetaTemplateStatus } from './templates.meta';
import { requireTemplateById, upsertTemplateFromMeta } from './templates.repository';
import type { TemplateDetailDto, UpdateTemplateInput } from './templates.schemas';

function mapUpdateInputToDraft(input: UpdateTemplateInput) {
  return {
    templateFormat: input.templateFormat ?? 'standard',
    carouselCards: input.carouselCards?.map((card) => ({
      imageHandle: card.imageHandle,
      imageMediaUrl: card.imageMediaUrl,
      bodyText: card.bodyText,
      button: card.button,
    })),
    headerText: input.header && 'text' in input.header ? input.header.text : undefined,
    headerMedia:
      input.header && 'format' in input.header
        ? {
            format: input.header.format,
            handle: input.header.handle,
            mediaUrl: input.header.mediaUrl,
          }
        : undefined,
    bodyText: input.body.text,
    footerText: input.footer?.text,
    variableSamples: input.variableSamples,
    buttons: input.buttons,
    linkTrackingEnabled: input.linkTrackingEnabled,
  };
}

const NON_EDITABLE_STATUSES = new Set(['DELETED', 'DISABLED']);

export function assertTemplateEditable(metaStatus: string): void {
  if (NON_EDITABLE_STATUSES.has(metaStatus)) {
    throw new ValidationError('This template cannot be edited', { metaStatus });
  }
}

export async function updateOrganizationTemplate(
  organizationId: string,
  userId: string,
  templateId: string,
  input: UpdateTemplateInput,
): Promise<TemplateDetailDto> {
  const existing = await requireTemplateById(organizationId, templateId);

  assertTemplateEditable(existing.metaStatus);

  if (!existing.metaTemplateId) {
    throw new ValidationError('Template is missing a Meta template ID', { templateId });
  }

  await getOrganizationWhatsAppAccount(organizationId, input.whatsAppAccountId);

  const secrets = await findWhatsAppAccountSecrets(organizationId, input.whatsAppAccountId);
  if (!secrets) {
    throw new ValidationError('WhatsApp account not found', {
      whatsAppAccountId: input.whatsAppAccountId,
    });
  }

  const draft = mapUpdateInputToDraft(input);
  const { components, variableSchema } = buildMetaComponentsFromDraft(draft);
  const storedComponents = enrichStoredComponentsWithMediaUrls(components, draft);

  const accessToken = decryptField(secrets.accessTokenEnc);
  const metaClient = getMetaWhatsAppClient();

  try {
    const metaResponse = await metaClient.updateMessageTemplate(
      existing.metaTemplateId,
      accessToken,
      {
        components,
      },
    );

    await upsertTemplateFromMeta({
      organizationId,
      userId,
      metaTemplateId: metaResponse.id,
      metaTemplateName: existing.metaTemplateName,
      category: existing.category,
      language: existing.language,
      metaStatus: mapMetaTemplateStatus(metaResponse.status),
      components: storedComponents,
      variableSchema,
      rejectionReason: null,
    });
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }

    if (error instanceof MetaApiError) {
      throw new ValidationError(error.message, error.details);
    }

    const message = error instanceof Error ? error.message : 'Meta template update failed';
    throw new ValidationError(message, { templateId });
  }

  return requireTemplateById(organizationId, templateId);
}
