import { Prisma } from '@prisma/client';
import { getPrismaClient } from '../../infrastructure/prisma/client';
import {
  ConflictError,
  InternalServerError,
  NotFoundError,
} from '../../shared/errors/AppError';
import type { NotificationRuleDto } from './notificationRules.schemas';

type NotificationRuleRow = {
  id: string;
  organizationId: string;
  eventKey: string;
  name: string;
  version: number;
  templateId: string;
  templateVersionId: string | null;
  phoneNumberId: string | null;
  variableMapping: Prisma.JsonValue;
  enabled: boolean;
  priority: number;
  createdAt: Date;
  updatedAt: Date;
  template: {
    id: string;
    metaTemplateName: string;
    metaStatus: string;
    language: string;
  };
  phoneNumber: {
    id: string;
    displayNumber: string;
    isDefault: boolean;
  } | null;
};

const ruleSelect = {
  id: true,
  organizationId: true,
  eventKey: true,
  name: true,
  version: true,
  templateId: true,
  templateVersionId: true,
  phoneNumberId: true,
  variableMapping: true,
  enabled: true,
  priority: true,
  createdAt: true,
  updatedAt: true,
  template: {
    select: {
      id: true,
      metaTemplateName: true,
      metaStatus: true,
      language: true,
    },
  },
  phoneNumber: {
    select: {
      id: true,
      displayNumber: true,
      isDefault: true,
    },
  },
} as const;

function toVariableMapping(value: Prisma.JsonValue): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  const mapping: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === 'string') {
      mapping[key] = entry;
    }
  }
  return mapping;
}

function toDto(row: NotificationRuleRow): NotificationRuleDto {
  return {
    id: row.id,
    organizationId: row.organizationId,
    eventKey: row.eventKey,
    name: row.name,
    version: row.version,
    templateId: row.templateId,
    templateVersionId: row.templateVersionId,
    phoneNumberId: row.phoneNumberId,
    variableMapping: toVariableMapping(row.variableMapping),
    enabled: row.enabled,
    priority: row.priority,
    template: row.template,
    phoneNumber: row.phoneNumber,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'
  );
}

export async function listNotificationRulesByOrganization(input: {
  organizationId: string;
  page: number;
  limit: number;
  enabled?: boolean;
  eventKey?: string;
  templateId?: string;
}): Promise<{ items: NotificationRuleDto[]; total: number }> {
  const prisma = getPrismaClient();
  if (!prisma) {
    throw new InternalServerError('Database not configured', 'DATABASE_NOT_CONFIGURED');
  }

  const where: Prisma.NotificationRuleWhereInput = {
    organizationId: input.organizationId,
    deletedAt: null,
    ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
    ...(input.templateId ? { templateId: input.templateId } : {}),
    ...(input.eventKey
      ? { eventKey: { contains: input.eventKey, mode: 'insensitive' } }
      : {}),
  };

  const skip = (input.page - 1) * input.limit;

  const [rows, total] = await Promise.all([
    prisma.notificationRule.findMany({
      where,
      orderBy: [{ priority: 'desc' }, { updatedAt: 'desc' }],
      skip,
      take: input.limit,
      select: ruleSelect,
    }),
    prisma.notificationRule.count({ where }),
  ]);

  return {
    items: rows.map((row) => toDto(row as NotificationRuleRow)),
    total,
  };
}

export async function findNotificationRuleById(
  organizationId: string,
  ruleId: string,
): Promise<NotificationRuleDto | null> {
  const prisma = getPrismaClient();
  if (!prisma) {
    throw new InternalServerError('Database not configured', 'DATABASE_NOT_CONFIGURED');
  }

  const row = await prisma.notificationRule.findFirst({
    where: {
      id: ruleId,
      organizationId,
      deletedAt: null,
    },
    select: ruleSelect,
  });

  return row ? toDto(row as NotificationRuleRow) : null;
}

export async function requireNotificationRuleById(
  organizationId: string,
  ruleId: string,
): Promise<NotificationRuleDto> {
  const rule = await findNotificationRuleById(organizationId, ruleId);
  if (!rule) {
    throw new NotFoundError('Notification rule not found', 'NOTIFICATION_RULE_NOT_FOUND');
  }
  return rule;
}

export async function insertNotificationRule(input: {
  organizationId: string;
  eventKey: string;
  name: string;
  templateId: string;
  templateVersionId?: string | null;
  phoneNumberId?: string | null;
  variableMapping: Record<string, string>;
  enabled: boolean;
  priority: number;
  createdById: string;
}): Promise<NotificationRuleDto> {
  const prisma = getPrismaClient();
  if (!prisma) {
    throw new InternalServerError('Database not configured', 'DATABASE_NOT_CONFIGURED');
  }

  try {
    const row = await prisma.notificationRule.create({
      data: {
        organizationId: input.organizationId,
        eventKey: input.eventKey,
        name: input.name,
        templateId: input.templateId,
        templateVersionId: input.templateVersionId ?? null,
        phoneNumberId: input.phoneNumberId ?? null,
        variableMapping: input.variableMapping,
        enabled: input.enabled,
        priority: input.priority,
        createdById: input.createdById,
        updatedById: input.createdById,
      },
      select: ruleSelect,
    });

    return toDto(row as NotificationRuleRow);
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ConflictError(
        'A notification rule already exists for this event key',
        'NOTIFICATION_RULE_EVENT_KEY_EXISTS',
      );
    }
    throw error;
  }
}

export async function updateNotificationRule(input: {
  organizationId: string;
  ruleId: string;
  eventKey?: string;
  name?: string;
  templateId?: string;
  templateVersionId?: string | null;
  phoneNumberId?: string | null;
  variableMapping?: Record<string, string>;
  enabled?: boolean;
  priority?: number;
  updatedById: string;
}): Promise<NotificationRuleDto> {
  const prisma = getPrismaClient();
  if (!prisma) {
    throw new InternalServerError('Database not configured', 'DATABASE_NOT_CONFIGURED');
  }

  const existing = await prisma.notificationRule.findFirst({
    where: {
      id: input.ruleId,
      organizationId: input.organizationId,
      deletedAt: null,
    },
    select: { id: true, version: true },
  });

  if (!existing) {
    throw new NotFoundError('Notification rule not found', 'NOTIFICATION_RULE_NOT_FOUND');
  }

  try {
    const row = await prisma.notificationRule.update({
      where: { id: existing.id },
      data: {
        ...(input.eventKey !== undefined ? { eventKey: input.eventKey } : {}),
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.templateId !== undefined ? { templateId: input.templateId } : {}),
        ...(input.templateVersionId !== undefined
          ? { templateVersionId: input.templateVersionId }
          : {}),
        ...(input.phoneNumberId !== undefined ? { phoneNumberId: input.phoneNumberId } : {}),
        ...(input.variableMapping !== undefined
          ? { variableMapping: input.variableMapping }
          : {}),
        ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
        ...(input.priority !== undefined ? { priority: input.priority } : {}),
        version: existing.version + 1,
        updatedById: input.updatedById,
      },
      select: ruleSelect,
    });

    return toDto(row as NotificationRuleRow);
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ConflictError(
        'A notification rule already exists for this event key',
        'NOTIFICATION_RULE_EVENT_KEY_EXISTS',
      );
    }
    throw error;
  }
}

export async function softDeleteNotificationRule(input: {
  organizationId: string;
  ruleId: string;
  deletedById: string;
}): Promise<void> {
  const prisma = getPrismaClient();
  if (!prisma) {
    throw new InternalServerError('Database not configured', 'DATABASE_NOT_CONFIGURED');
  }

  const existing = await prisma.notificationRule.findFirst({
    where: {
      id: input.ruleId,
      organizationId: input.organizationId,
      deletedAt: null,
    },
    select: { id: true },
  });

  if (!existing) {
    throw new NotFoundError('Notification rule not found', 'NOTIFICATION_RULE_NOT_FOUND');
  }

  await prisma.notificationRule.update({
    where: { id: existing.id },
    data: {
      deletedAt: new Date(),
      deletedById: input.deletedById,
      enabled: false,
      updatedById: input.deletedById,
    },
  });
}

export async function findEnabledNotificationRuleByEventKey(input: {
  organizationId: string;
  eventKey: string;
}): Promise<NotificationRuleDto | null> {
  const prisma = getPrismaClient();
  if (!prisma) {
    throw new InternalServerError('Database not configured', 'DATABASE_NOT_CONFIGURED');
  }

  const row = await prisma.notificationRule.findFirst({
    where: {
      organizationId: input.organizationId,
      eventKey: input.eventKey,
      enabled: true,
      deletedAt: null,
    },
    orderBy: [{ priority: 'desc' }, { version: 'desc' }],
    select: ruleSelect,
  });

  return row ? toDto(row as NotificationRuleRow) : null;
}
