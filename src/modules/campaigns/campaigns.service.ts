import { CampaignRecipientStatus, CampaignStatus, MessageStatus, Prisma } from '@prisma/client';
import { getPrismaClient } from '../../infrastructure/prisma/client';
import { InternalServerError, NotFoundError } from '../../shared/errors/AppError';
import type {
  CampaignDto,
  CampaignRecipientDto,
  CreateCampaignInput,
  ListCampaignsQuery,
  UpdateCampaignRecipientInput,
} from './campaigns.schemas';

function prisma() {
  const client = getPrismaClient();
  if (!client) {
    throw new InternalServerError('Database not configured', 'DATABASE_NOT_CONFIGURED');
  }
  return client;
}

function fromMessageStatus(status: MessageStatus): CampaignRecipientStatus {
  if (status === 'SENT') return 'SENT';
  if (status === 'DELIVERED') return 'DELIVERED';
  if (status === 'READ') return 'READ';
  if (status === 'FAILED') return 'FAILED';
  return 'QUEUED';
}

function toRecipientUi(status: CampaignRecipientStatus): CampaignRecipientDto['status'] {
  return status.toLowerCase() as CampaignRecipientDto['status'];
}

function toRecipientDb(status: CampaignRecipientDto['status']): CampaignRecipientStatus {
  return status.toUpperCase() as CampaignRecipientStatus;
}

function variablesFromJson(value: Prisma.JsonValue | null): Record<string, string> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const out: Record<string, string> = {};
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === 'string') out[key] = item;
  }
  return out;
}

function toDto(
  row: {
    id: string;
    name: string;
    templateName: string;
    language: string;
    phoneNumberId: string | null;
    variables: Prisma.JsonValue | null;
    status: CampaignStatus;
    recipientCount: number;
    queuedCount: number;
    sentCount: number;
    failedCount: number;
    duplicateCount: number;
    createdAt: Date;
    completedAt: Date | null;
    recipients?: { phone: string; status: CampaignRecipientStatus; messageId: string | null; error: string | null }[];
  },
  includeRecipients: boolean,
): CampaignDto {
  return {
    id: row.id,
    name: row.name,
    templateName: row.templateName,
    language: row.language,
    phoneNumberId: row.phoneNumberId,
    variables: variablesFromJson(row.variables),
    status: row.status === 'COMPLETED' ? 'completed' : 'sending',
    recipientCount: row.recipientCount,
    queuedCount: row.queuedCount,
    sentCount: row.sentCount ?? 0,
    failedCount: row.failedCount,
    duplicateCount: row.duplicateCount,
    createdAt: row.createdAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
    ...(includeRecipients && row.recipients
      ? {
          recipients: row.recipients.map((item) => ({
            phone: item.phone,
            status: toRecipientUi(item.status),
            messageId: item.messageId ?? undefined,
            error: item.error ?? undefined,
          })),
        }
      : {}),
  };
}

async function refreshCounts(campaignId: string) {
  const db = prisma();
  const recipients = await db.campaignRecipient.findMany({
    where: { campaignId },
    select: { status: true },
  });
  const counts = {
    recipientCount: recipients.length,
    queuedCount: 0,
    sentCount: 0,
    failedCount: 0,
    duplicateCount: 0,
    pending: 0,
  };
  for (const row of recipients) {
    if (row.status === 'QUEUED') counts.queuedCount += 1;
    if (row.status === 'SENT' || row.status === 'DELIVERED' || row.status === 'READ') {
      counts.sentCount += 1;
    }
    if (row.status === 'FAILED') counts.failedCount += 1;
    if (row.status === 'DUPLICATE') counts.duplicateCount += 1;
    if (row.status === 'PENDING' || row.status === 'SENDING') counts.pending += 1;
  }
  const completed = counts.pending === 0 && counts.recipientCount > 0;
  return db.campaign.update({
    where: { id: campaignId },
    data: {
      recipientCount: counts.recipientCount,
      queuedCount: counts.queuedCount,
      sentCount: counts.sentCount,
      failedCount: counts.failedCount,
      duplicateCount: counts.duplicateCount,
      status: completed ? 'COMPLETED' : 'SENDING',
      completedAt: completed ? new Date() : null,
    },
    include: { recipients: { orderBy: { phone: 'asc' } } },
  });
}

async function syncDeliveryFromMessages(organizationId: string, campaignIds: string[]): Promise<void> {
  if (campaignIds.length === 0) return;
  const db = prisma();
  const campaigns = await db.campaign.findMany({
    where: { id: { in: campaignIds }, organizationId },
    select: { id: true, templateName: true, createdAt: true },
  });
  const campaignById = new Map(campaigns.map((item) => [item.id, item]));

  const recipients = await db.campaignRecipient.findMany({
    where: { campaignId: { in: campaignIds } },
    select: { id: true, campaignId: true, messageId: true, status: true, phone: true },
  });
  const messageIds = recipients
    .map((row) => row.messageId)
    .filter((id): id is string => Boolean(id));

  const messages = messageIds.length
    ? await db.message.findMany({
        where: { organizationId, id: { in: messageIds } },
        select: { id: true, status: true, errorMessage: true, recipientPhone: true, metaTemplateName: true },
      })
    : [];
  const byId = new Map(messages.map((message) => [message.id, message]));
  const touched = new Set<string>();

  for (const recipient of recipients) {
    let message = recipient.messageId ? byId.get(recipient.messageId) : undefined;
    if (!message) {
      const campaign = campaignById.get(recipient.campaignId);
      const last10 = recipient.phone.slice(-10);
      if (campaign && last10.length === 10) {
        message = (await db.message.findFirst({
          where: {
            organizationId,
            direction: 'OUTBOUND',
            metaTemplateName: campaign.templateName,
            recipientPhone: { contains: last10 },
            createdAt: { gte: new Date(campaign.createdAt.getTime() - 120_000) },
          },
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            status: true,
            errorMessage: true,
            recipientPhone: true,
            metaTemplateName: true,
          },
        })) ?? undefined;
      }
    }
    if (!message) continue;
    const next = fromMessageStatus(message.status);
    if (next === recipient.status && recipient.messageId === message.id) continue;
    await db.campaignRecipient.update({
      where: { id: recipient.id },
      data: {
        status: next,
        messageId: message.id,
        error: message.status === 'FAILED' ? message.errorMessage : null,
      },
    });
    touched.add(recipient.campaignId);
  }

  for (const campaignId of touched) {
    await refreshCounts(campaignId);
  }
}

export async function listCampaigns(
  organizationId: string,
  query: ListCampaignsQuery,
): Promise<{ items: CampaignDto[]; total: number; page: number; limit: number }> {
  const db = prisma();
  if (typeof db.campaign?.findMany !== 'function') {
    throw new InternalServerError(
      'Campaign history is not available. Restart the backend after applying migrations.',
      'CAMPAIGN_MODEL_UNAVAILABLE',
    );
  }
  const where: Prisma.CampaignWhereInput = { organizationId };
  if (query.search) {
    where.OR = [
      { name: { contains: query.search, mode: 'insensitive' } },
      { templateName: { contains: query.search, mode: 'insensitive' } },
    ];
  }
  const [rows, idRows] = await Promise.all([
    db.campaign.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
    db.campaign.findMany({
      where,
      select: { id: true },
    }),
  ]);
  await syncDeliveryFromMessages(
    organizationId,
    rows.map((row) => row.id),
  );
  const hydrated = await db.campaign.findMany({
    where: { id: { in: rows.map((row) => row.id) } },
    orderBy: { createdAt: 'desc' },
  });
  const order = new Map(rows.map((row, index) => [row.id, index]));
  hydrated.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  return {
    items: hydrated.map((row) => toDto(row, false)),
    total: idRows.length,
    page: query.page,
    limit: query.limit,
  };
}

export async function getCampaign(organizationId: string, campaignId: string): Promise<CampaignDto> {
  const row = await prisma().campaign.findFirst({
    where: { id: campaignId, organizationId },
    include: { recipients: { orderBy: { phone: 'asc' } } },
  });
  if (!row) {
    throw new NotFoundError('Campaign not found', 'CAMPAIGN_NOT_FOUND');
  }
  await syncDeliveryFromMessages(organizationId, [campaignId]);
  const hydrated = await prisma().campaign.findFirst({
    where: { id: campaignId, organizationId },
    include: { recipients: { orderBy: { phone: 'asc' } } },
  });
  if (!hydrated) {
    throw new NotFoundError('Campaign not found', 'CAMPAIGN_NOT_FOUND');
  }
  return toDto(hydrated, true);
}

export async function createCampaign(
  organizationId: string,
  createdById: string | undefined,
  input: CreateCampaignInput,
): Promise<CampaignDto> {
  const uniquePhones = [...new Set(input.recipients)];
  const row = await prisma().campaign.create({
    data: {
      organizationId,
      createdById,
      name: input.name?.trim() || input.templateName,
      templateName: input.templateName,
      language: input.language,
      phoneNumberId: input.phoneNumberId,
      variables: (input.variables ?? undefined) as Prisma.InputJsonValue | undefined,
      recipientCount: uniquePhones.length,
      recipients: {
        create: uniquePhones.map((phone) => ({ phone })),
      },
    },
    include: { recipients: { orderBy: { phone: 'asc' } } },
  });
  return toDto(row, true);
}

export async function updateCampaignRecipient(
  organizationId: string,
  campaignId: string,
  input: UpdateCampaignRecipientInput,
): Promise<CampaignDto> {
  const existing = await prisma().campaign.findFirst({
    where: { id: campaignId, organizationId },
    select: { id: true },
  });
  if (!existing) {
    throw new NotFoundError('Campaign not found', 'CAMPAIGN_NOT_FOUND');
  }

  await prisma().campaignRecipient.update({
    where: { campaignId_phone: { campaignId, phone: input.phone } },
    data: {
      status: toRecipientDb(input.status),
      messageId: input.messageId,
      error: input.error,
    },
  });

  const row = await refreshCounts(campaignId);
  return toDto(row, true);
}
