import { ValidationError } from '../../shared/errors/AppError';
import { findPhoneNumberInOrganization } from '../whatsapp/whatsapp.repository';
import {
  findTemplateById,
  templateVersionBelongsToTemplate,
} from '../templates/templates.repository';
import {
  findEnabledNotificationRuleByEventKey,
  insertNotificationRule,
  listNotificationRulesByOrganization,
  requireNotificationRuleById,
  softDeleteNotificationRule,
  updateNotificationRule,
} from './notificationRules.repository';
import type {
  CreateNotificationRuleInput,
  ListNotificationRulesQuery,
  NotificationRuleDto,
  UpdateNotificationRuleInput,
} from './notificationRules.schemas';

async function validateRuleReferences(input: {
  organizationId: string;
  templateId: string;
  templateVersionId?: string | null;
  phoneNumberId?: string | null;
}): Promise<void> {
  const template = await findTemplateById(input.organizationId, input.templateId);
  if (!template) {
    throw new ValidationError('Template not found for this organization', {
      templateId: input.templateId,
    });
  }

  if (template.metaStatus !== 'APPROVED') {
    throw new ValidationError('Template must be APPROVED before it can be used in a rule', {
      templateId: input.templateId,
      metaStatus: template.metaStatus,
    });
  }

  if (input.templateVersionId) {
    const belongs = await templateVersionBelongsToTemplate({
      organizationId: input.organizationId,
      templateId: input.templateId,
      templateVersionId: input.templateVersionId,
    });

    if (!belongs) {
      throw new ValidationError('templateVersionId does not belong to the selected template', {
        templateId: input.templateId,
        templateVersionId: input.templateVersionId,
      });
    }
  }

  if (input.phoneNumberId) {
    const phone = await findPhoneNumberInOrganization(input.organizationId, input.phoneNumberId);
    if (!phone) {
      throw new ValidationError('Phone number not found for this organization', {
        phoneNumberId: input.phoneNumberId,
      });
    }
  }
}

export async function listOrganizationNotificationRules(
  organizationId: string,
  query: ListNotificationRulesQuery,
): Promise<{ items: NotificationRuleDto[]; total: number; page: number; limit: number }> {
  const enabled =
    query.enabled === 'true' ? true : query.enabled === 'false' ? false : undefined;

  const result = await listNotificationRulesByOrganization({
    organizationId,
    page: query.page,
    limit: query.limit,
    enabled,
    eventKey: query.eventKey,
    templateId: query.templateId,
  });

  return {
    ...result,
    page: query.page,
    limit: query.limit,
  };
}

export async function getOrganizationNotificationRule(
  organizationId: string,
  ruleId: string,
): Promise<NotificationRuleDto> {
  return requireNotificationRuleById(organizationId, ruleId);
}

export async function createOrganizationNotificationRule(
  organizationId: string,
  userId: string,
  input: CreateNotificationRuleInput,
): Promise<NotificationRuleDto> {
  await validateRuleReferences({
    organizationId,
    templateId: input.templateId,
    templateVersionId: input.templateVersionId,
    phoneNumberId: input.phoneNumberId,
  });

  return insertNotificationRule({
    organizationId,
    eventKey: input.eventKey,
    name: input.name,
    templateId: input.templateId,
    templateVersionId: input.templateVersionId ?? null,
    phoneNumberId: input.phoneNumberId ?? null,
    variableMapping: input.variableMapping,
    enabled: input.enabled,
    priority: input.priority,
    createdById: userId,
  });
}

export async function updateOrganizationNotificationRule(
  organizationId: string,
  ruleId: string,
  userId: string,
  input: UpdateNotificationRuleInput,
): Promise<NotificationRuleDto> {
  const existing = await requireNotificationRuleById(organizationId, ruleId);

  const nextTemplateId = input.templateId ?? existing.templateId;
  const nextTemplateVersionId =
    input.templateVersionId !== undefined
      ? input.templateVersionId
      : existing.templateVersionId;
  const nextPhoneNumberId =
    input.phoneNumberId !== undefined ? input.phoneNumberId : existing.phoneNumberId;

  if (
    input.templateId !== undefined ||
    input.templateVersionId !== undefined ||
    input.phoneNumberId !== undefined
  ) {
    await validateRuleReferences({
      organizationId,
      templateId: nextTemplateId,
      templateVersionId: nextTemplateVersionId,
      phoneNumberId: nextPhoneNumberId,
    });
  }

  return updateNotificationRule({
    organizationId,
    ruleId,
    eventKey: input.eventKey,
    name: input.name,
    templateId: input.templateId,
    templateVersionId: input.templateVersionId,
    phoneNumberId: input.phoneNumberId,
    variableMapping: input.variableMapping,
    enabled: input.enabled,
    priority: input.priority,
    updatedById: userId,
  });
}

export async function deleteOrganizationNotificationRule(
  organizationId: string,
  ruleId: string,
  userId: string,
): Promise<void> {
  await softDeleteNotificationRule({
    organizationId,
    ruleId,
    deletedById: userId,
  });
}

export async function getEnabledRuleForEvent(
  organizationId: string,
  eventKey: string,
): Promise<NotificationRuleDto | null> {
  return findEnabledNotificationRuleByEventKey({ organizationId, eventKey });
}
