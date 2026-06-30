import { Prisma } from '@prisma/client';
import { getPrismaClient } from '../../infrastructure/prisma/client';
import { InternalServerError, NotFoundError } from '../../shared/errors/AppError';
import { extractVariableSchema, parseTemplateComponents } from './templates.meta';
import type {
  MetaTemplateStatus,
  TemplateCategory,
  TemplateDetailDto,
  TemplateSummaryDto,
} from './templates.schemas';

type TemplateRow = {
  id: string;
  organizationId: string;
  metaTemplateName: string;
  metaTemplateId: string | null;
  category: TemplateCategory;
  language: string;
  metaStatus: MetaTemplateStatus;
  currentVersionId: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: {
    firstName: string;
    lastName: string;
  } | null;
  currentVersion: {
    id: string;
    version: number;
    components: Prisma.JsonValue;
    variableSchema: Prisma.JsonValue;
    rejectionReason: string | null;
    submittedAt: Date | null;
    approvedAt: Date | null;
    createdAt: Date;
  } | null;
};

const templateSummarySelect = {
  id: true,
  organizationId: true,
  metaTemplateName: true,
  metaTemplateId: true,
  category: true,
  language: true,
  metaStatus: true,
  currentVersionId: true,
  createdAt: true,
  updatedAt: true,
  createdBy: {
    select: {
      firstName: true,
      lastName: true,
    },
  },
  currentVersion: {
    select: {
      id: true,
      version: true,
      components: true,
      variableSchema: true,
      rejectionReason: true,
      submittedAt: true,
      approvedAt: true,
      createdAt: true,
    },
  },
} as const;

function formatCreatedByName(
  user: { firstName: string; lastName: string } | null | undefined,
): string | null {
  if (!user) {
    return null;
  }
  const name = `${user.firstName} ${user.lastName}`.trim();
  return name || null;
}

function toSummaryDto(row: TemplateRow): TemplateSummaryDto {
  const preview = row.currentVersion?.components
    ? parseTemplateComponents(row.currentVersion.components)
    : undefined;

  return {
    id: row.id,
    organizationId: row.organizationId,
    metaTemplateName: row.metaTemplateName,
    metaTemplateId: row.metaTemplateId,
    category: row.category,
    language: row.language,
    metaStatus: row.metaStatus,
    currentVersion: row.currentVersion?.version ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    ...(preview ? { preview } : {}),
    createdByName: formatCreatedByName(row.createdBy),
  };
}

function toDetailDto(row: TemplateRow): TemplateDetailDto {
  const summary = toSummaryDto(row);

  return {
    ...summary,
    currentVersionDetail: row.currentVersion
      ? {
          id: row.currentVersion.id,
          version: row.currentVersion.version,
          components: row.currentVersion.components,
          variableSchema: row.currentVersion.variableSchema,
          rejectionReason: row.currentVersion.rejectionReason,
          submittedAt: row.currentVersion.submittedAt?.toISOString() ?? null,
          approvedAt: row.currentVersion.approvedAt?.toISOString() ?? null,
          createdAt: row.currentVersion.createdAt.toISOString(),
        }
      : null,
  };
}

export async function listTemplatesByOrganization(input: {
  organizationId: string;
  page: number;
  limit: number;
  metaStatus?: MetaTemplateStatus;
  category?: TemplateCategory;
  search?: string;
}): Promise<{ items: TemplateSummaryDto[]; total: number }> {
  const prisma = getPrismaClient();
  if (!prisma) {
    throw new InternalServerError('Database not configured', 'DATABASE_NOT_CONFIGURED');
  }

  const where: Prisma.TemplateWhereInput = {
    organizationId: input.organizationId,
    deletedAt: null,
    ...(input.metaStatus ? { metaStatus: input.metaStatus } : {}),
    ...(input.category ? { category: input.category } : {}),
    ...(input.search
      ? { metaTemplateName: { contains: input.search, mode: 'insensitive' } }
      : {}),
  };

  const skip = (input.page - 1) * input.limit;

  const [rows, total] = await Promise.all([
    prisma.template.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      skip,
      take: input.limit,
      select: templateSummarySelect,
    }),
    prisma.template.count({ where }),
  ]);

  return {
    items: rows.map((row) => toSummaryDto(row as TemplateRow)),
    total,
  };
}

export async function findTemplateById(
  organizationId: string,
  templateId: string,
): Promise<TemplateDetailDto | null> {
  const prisma = getPrismaClient();
  if (!prisma) {
    throw new InternalServerError('Database not configured', 'DATABASE_NOT_CONFIGURED');
  }

  const row = await prisma.template.findFirst({
    where: {
      id: templateId,
      organizationId,
      deletedAt: null,
    },
    select: templateSummarySelect,
  });

  return row ? toDetailDto(row as TemplateRow) : null;
}

export async function requireTemplateById(
  organizationId: string,
  templateId: string,
): Promise<TemplateDetailDto> {
  const template = await findTemplateById(organizationId, templateId);
  if (!template) {
    throw new NotFoundError('Template not found', 'TEMPLATE_NOT_FOUND');
  }
  return template;
}

export async function templateVersionBelongsToTemplate(input: {
  organizationId: string;
  templateId: string;
  templateVersionId: string;
}): Promise<boolean> {
  const prisma = getPrismaClient();
  if (!prisma) {
    throw new InternalServerError('Database not configured', 'DATABASE_NOT_CONFIGURED');
  }

  const row = await prisma.templateVersion.findFirst({
    where: {
      id: input.templateVersionId,
      templateId: input.templateId,
      template: {
        organizationId: input.organizationId,
        deletedAt: null,
      },
    },
    select: { id: true },
  });

  return Boolean(row);
}

export type TemplateVersionSendContext = {
  templateVersionId: string;
  metaTemplateName: string;
  language: string;
  components: unknown;
};

export async function resolveTemplateVersionForSend(input: {
  organizationId: string;
  templateId: string;
  templateVersionId?: string | null;
}): Promise<TemplateVersionSendContext | null> {
  const prisma = getPrismaClient();
  if (!prisma) {
    throw new InternalServerError('Database not configured', 'DATABASE_NOT_CONFIGURED');
  }

  const template = await prisma.template.findFirst({
    where: {
      id: input.templateId,
      organizationId: input.organizationId,
      deletedAt: null,
      metaStatus: 'APPROVED',
    },
    select: {
      metaTemplateName: true,
      language: true,
      currentVersionId: true,
    },
  });

  if (!template) {
    return null;
  }

  const versionId = input.templateVersionId ?? template.currentVersionId;
  if (!versionId) {
    return null;
  }

  const version = await prisma.templateVersion.findFirst({
    where: {
      id: versionId,
      templateId: input.templateId,
    },
    select: {
      id: true,
      components: true,
    },
  });

  if (!version) {
    return null;
  }

  return {
    templateVersionId: version.id,
    metaTemplateName: template.metaTemplateName,
    language: template.language,
    components: version.components,
  };
}

export type UpsertTemplateFromMetaInput = {
  organizationId: string;
  userId: string;
  metaTemplateId: string;
  metaTemplateName: string;
  category: TemplateCategory;
  language: string;
  metaStatus: MetaTemplateStatus;
  components: unknown;
  variableSchema: unknown;
  rejectionReason: string | null;
};

export type UpsertTemplateFromMetaResult = {
  action: 'created' | 'updated' | 'versioned';
};

export async function upsertTemplateFromMeta(
  input: UpsertTemplateFromMetaInput,
): Promise<UpsertTemplateFromMetaResult> {
  const prisma = getPrismaClient();
  if (!prisma) {
    throw new InternalServerError('Database not configured', 'DATABASE_NOT_CONFIGURED');
  }

  const componentsJson = input.components as Prisma.InputJsonValue;
  const variableSchemaJson = input.variableSchema as Prisma.InputJsonValue;
  const now = new Date();

  const existing = await prisma.template.findFirst({
    where: {
      organizationId: input.organizationId,
      metaTemplateName: input.metaTemplateName,
      language: input.language,
      deletedAt: null,
    },
    select: {
      id: true,
      currentVersion: {
        select: {
          id: true,
          version: true,
          components: true,
        },
      },
    },
  });

  if (!existing) {
    await prisma.$transaction(async (tx) => {
      const template = await tx.template.create({
        data: {
          organizationId: input.organizationId,
          metaTemplateName: input.metaTemplateName,
          metaTemplateId: input.metaTemplateId,
          category: input.category,
          language: input.language,
          metaStatus: input.metaStatus,
          createdById: input.userId,
          updatedById: input.userId,
        },
      });

      const version = await tx.templateVersion.create({
        data: {
          templateId: template.id,
          version: 1,
          components: componentsJson,
          variableSchema: variableSchemaJson,
          rejectionReason: input.rejectionReason,
          submittedAt: input.metaStatus === 'PENDING' ? now : null,
          approvedAt: input.metaStatus === 'APPROVED' ? now : null,
          createdById: input.userId,
        },
      });

      await tx.template.update({
        where: { id: template.id },
        data: { currentVersionId: version.id },
      });
    });

    return { action: 'created' };
  }

  const currentComponents = existing.currentVersion?.components;
  const componentsChanged =
    JSON.stringify(currentComponents) !== JSON.stringify(input.components);

  if (!componentsChanged) {
    await prisma.template.update({
      where: { id: existing.id },
      data: {
        metaTemplateId: input.metaTemplateId,
        category: input.category,
        metaStatus: input.metaStatus,
        updatedById: input.userId,
      },
    });

    if (existing.currentVersion) {
      await prisma.templateVersion.update({
        where: { id: existing.currentVersion.id },
        data: {
          ...(input.rejectionReason ? { rejectionReason: input.rejectionReason } : {}),
          ...(input.metaStatus === 'APPROVED' ? { approvedAt: now, rejectionReason: null } : {}),
        },
      });
    }

    return { action: 'updated' };
  }

  const nextVersion = (existing.currentVersion?.version ?? 0) + 1;

  await prisma.$transaction(async (tx) => {
    const version = await tx.templateVersion.create({
      data: {
        templateId: existing.id,
        version: nextVersion,
        components: componentsJson,
        variableSchema: variableSchemaJson,
        rejectionReason: input.rejectionReason,
        submittedAt: input.metaStatus === 'PENDING' ? now : null,
        approvedAt: input.metaStatus === 'APPROVED' ? now : null,
        createdById: input.userId,
      },
    });

    await tx.template.update({
      where: { id: existing.id },
      data: {
        metaTemplateId: input.metaTemplateId,
        category: input.category,
        metaStatus: input.metaStatus,
        currentVersionId: version.id,
        updatedById: input.userId,
      },
    });
  });

  return { action: 'versioned' };
}

export async function updateTemplateStatusFromWebhook(input: {
  organizationId: string;
  metaTemplateId?: string;
  metaTemplateName?: string;
  metaStatus: MetaTemplateStatus;
  rejectionReason?: string | null;
}): Promise<boolean> {
  const prisma = getPrismaClient();
  if (!prisma) {
    throw new InternalServerError('Database not configured', 'DATABASE_NOT_CONFIGURED');
  }

  const template = await prisma.template.findFirst({
    where: {
      organizationId: input.organizationId,
      deletedAt: null,
      OR: [
        ...(input.metaTemplateId ? [{ metaTemplateId: input.metaTemplateId }] : []),
        ...(input.metaTemplateName ? [{ metaTemplateName: input.metaTemplateName }] : []),
      ],
    },
    select: {
      id: true,
      currentVersionId: true,
    },
  });

  if (!template) {
    return false;
  }

  const now = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.template.update({
      where: { id: template.id },
      data: { metaStatus: input.metaStatus },
    });

    if (!template.currentVersionId) {
      return;
    }

    await tx.templateVersion.update({
      where: { id: template.currentVersionId },
      data: {
        ...(input.rejectionReason !== undefined
          ? { rejectionReason: input.rejectionReason }
          : {}),
        ...(input.metaStatus === 'APPROVED' ? { approvedAt: now, rejectionReason: null } : {}),
        ...(input.metaStatus === 'REJECTED' && input.rejectionReason
          ? { rejectionReason: input.rejectionReason }
          : {}),
      },
    });
  });

  return true;
}

export type ApprovedTemplateSendContext = {
  templateVersionId: string;
  metaTemplateName: string;
  language: string;
  variableSchema: unknown;
};

export async function findApprovedTemplateForSend(input: {
  organizationId: string;
  metaTemplateName: string;
  language: string;
}): Promise<ApprovedTemplateSendContext | null> {
  const prisma = getPrismaClient();
  if (!prisma) {
    throw new InternalServerError('Database not configured', 'DATABASE_NOT_CONFIGURED');
  }

  const template = await prisma.template.findFirst({
    where: {
      organizationId: input.organizationId,
      metaTemplateName: input.metaTemplateName,
      language: input.language,
      deletedAt: null,
      metaStatus: 'APPROVED',
    },
    select: {
      metaTemplateName: true,
      language: true,
      currentVersionId: true,
      currentVersion: {
        select: {
          id: true,
          variableSchema: true,
        },
      },
    },
  });

  if (!template?.currentVersion) {
    return null;
  }

  return {
    templateVersionId: template.currentVersion.id,
    metaTemplateName: template.metaTemplateName,
    language: template.language,
    variableSchema: template.currentVersion.variableSchema,
  };
}

export async function findTemplateByName(
  organizationId: string,
  metaTemplateName: string,
  language: string,
): Promise<TemplateDetailDto | null> {
  const prisma = getPrismaClient();
  if (!prisma) {
    throw new InternalServerError('Database not configured', 'DATABASE_NOT_CONFIGURED');
  }

  const row = await prisma.template.findFirst({
    where: {
      organizationId,
      metaTemplateName,
      language,
      deletedAt: null,
    },
    select: templateSummarySelect,
  });

  return row ? toDetailDto(row as TemplateRow) : null;
}

export async function requireTemplateByName(
  organizationId: string,
  metaTemplateName: string,
  language: string,
): Promise<TemplateDetailDto> {
  const prisma = getPrismaClient();
  if (!prisma) {
    throw new InternalServerError('Database not configured', 'DATABASE_NOT_CONFIGURED');
  }

  const row = await prisma.template.findFirst({
    where: {
      organizationId,
      metaTemplateName,
      language,
      deletedAt: null,
    },
    select: templateSummarySelect,
  });

  if (!row) {
    throw new NotFoundError('Template not found', 'TEMPLATE_NOT_FOUND');
  }

  return toDetailDto(row as TemplateRow);
}

export async function updateTemplateVariableNames(input: {
  organizationId: string;
  templateId: string;
  userId: string;
  variableNames: string[];
}): Promise<TemplateDetailDto> {
  const prisma = getPrismaClient();
  if (!prisma) {
    throw new InternalServerError('Database not configured', 'DATABASE_NOT_CONFIGURED');
  }

  const template = await prisma.template.findFirst({
    where: {
      id: input.templateId,
      organizationId: input.organizationId,
      deletedAt: null,
    },
    select: {
      id: true,
      currentVersion: {
        select: {
          id: true,
          components: true,
          variableSchema: true,
        },
      },
    },
  });

  if (!template?.currentVersion) {
    throw new NotFoundError('Template not found', 'TEMPLATE_NOT_FOUND');
  }

  const variableSchema = extractVariableSchema(
    template.currentVersion.components,
    input.variableNames,
  );

  await prisma.$transaction([
    prisma.templateVersion.update({
      where: { id: template.currentVersion.id },
      data: { variableSchema: variableSchema as Prisma.InputJsonValue },
    }),
    prisma.template.update({
      where: { id: template.id },
      data: { updatedById: input.userId },
    }),
  ]);

  return requireTemplateById(input.organizationId, input.templateId);
}
