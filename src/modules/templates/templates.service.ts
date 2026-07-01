import { enqueueTemplateSync } from '../../infrastructure/queues/queues';
import { getOrganizationWhatsAppAccount } from '../whatsapp/whatsapp.service';
import {
  listTemplatesByOrganization,
  requireTemplateById,
  resolveTemplateVersionForSend,
  updateTemplateVariableNames,
} from './templates.repository';
import type { TemplateVersionSendContext } from './templates.repository';
import type {
  EnqueueTemplateSyncResultDto,
  ListTemplatesQuery,
  TemplateDetailDto,
  TemplateSummaryDto,
  TemplateSyncResultDto,
  UpdateTemplateVariableNamesInput,
  UpdateTemplateInput,
} from './templates.schemas';
import { createOrganizationTemplate } from './templates.create.service';
import { syncTemplatesForAccount } from './template.orchestrator';
import type { CreateTemplateInput } from './templates.schemas';
import { updateOrganizationTemplate } from './templates.update.service';

export async function listOrganizationTemplates(
  organizationId: string,
  query: ListTemplatesQuery,
): Promise<{ items: TemplateSummaryDto[]; total: number; page: number; limit: number }> {
  const result = await listTemplatesByOrganization({
    organizationId,
    page: query.page,
    limit: query.limit,
    metaStatus: query.metaStatus,
    category: query.category,
    search: query.search,
  });

  return {
    ...result,
    page: query.page,
    limit: query.limit,
  };
}

export async function getOrganizationTemplate(
  organizationId: string,
  templateId: string,
): Promise<TemplateDetailDto> {
  return requireTemplateById(organizationId, templateId);
}

export async function resolveTemplateForSend(
  organizationId: string,
  templateId: string,
  templateVersionId?: string | null,
): Promise<TemplateVersionSendContext | null> {
  return resolveTemplateVersionForSend({
    organizationId,
    templateId,
    templateVersionId,
  });
}

export async function syncOrganizationTemplates(
  organizationId: string,
  userId: string,
  whatsAppAccountId: string,
  correlationId?: string,
): Promise<TemplateSyncResultDto> {
  await getOrganizationWhatsAppAccount(organizationId, whatsAppAccountId);
  return syncTemplatesForAccount({
    organizationId,
    whatsAppAccountId,
    userId,
    correlationId,
  });
}

export async function enqueueOrganizationTemplateSync(
  organizationId: string,
  userId: string,
  whatsAppAccountId: string,
  correlationId?: string,
): Promise<EnqueueTemplateSyncResultDto | TemplateSyncResultDto> {
  try {
    await getOrganizationWhatsAppAccount(organizationId, whatsAppAccountId);
    await enqueueTemplateSync({
      organizationId,
      whatsAppAccountId,
      userId,
      correlationId,
    });

    return {
      whatsAppAccountId,
      queued: true,
    };
  } catch {
    return syncOrganizationTemplates(organizationId, userId, whatsAppAccountId, correlationId);
  }
}

export async function createOrganizationTemplateForUser(
  organizationId: string,
  userId: string,
  input: CreateTemplateInput,
): Promise<TemplateDetailDto> {
  return createOrganizationTemplate(organizationId, userId, input);
}

export async function updateOrganizationTemplateForUser(
  organizationId: string,
  userId: string,
  templateId: string,
  input: UpdateTemplateInput,
): Promise<TemplateDetailDto> {
  return updateOrganizationTemplate(organizationId, userId, templateId, input);
}

export async function updateOrganizationTemplateVariableNames(
  organizationId: string,
  userId: string,
  templateId: string,
  input: UpdateTemplateVariableNamesInput,
): Promise<TemplateDetailDto> {
  return updateTemplateVariableNames({
    organizationId,
    templateId,
    userId,
    variableNames: input.variableNames,
  });
}
