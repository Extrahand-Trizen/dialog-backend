import { getPrismaClient } from '../../infrastructure/prisma/client';
import { InternalServerError, NotFoundError } from '../../shared/errors/AppError';
import type { ApiKeySummaryDto } from './apiKeys.schemas';

type ApiKeyRow = {
  id: string;
  name: string;
  keyPrefix: string;
  keyHash: string;
  scopes: string[];
  organizationId: string;
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
};

function toSummaryDto(row: ApiKeyRow): ApiKeySummaryDto {
  return {
    id: row.id,
    name: row.name,
    keyPrefix: row.keyPrefix,
    scopes: row.scopes,
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    revokedAt: row.revokedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function insertApiKey(input: {
  organizationId: string;
  name: string;
  keyPrefix: string;
  keyHash: string;
  scopes: string[];
  createdById: string;
  expiresAt?: Date;
}): Promise<ApiKeySummaryDto> {
  const prisma = getPrismaClient();
  if (!prisma) {
    throw new InternalServerError('Database not configured', 'DATABASE_NOT_CONFIGURED');
  }

  const row = await prisma.apiKey.create({
    data: {
      organizationId: input.organizationId,
      name: input.name,
      keyPrefix: input.keyPrefix,
      keyHash: input.keyHash,
      scopes: input.scopes,
      createdById: input.createdById,
      expiresAt: input.expiresAt,
    },
    select: {
      id: true,
      name: true,
      keyPrefix: true,
      keyHash: true,
      scopes: true,
      organizationId: true,
      lastUsedAt: true,
      expiresAt: true,
      revokedAt: true,
      createdAt: true,
    },
  });

  return toSummaryDto(row);
}

export async function listApiKeysByOrganization(organizationId: string): Promise<ApiKeySummaryDto[]> {
  const prisma = getPrismaClient();
  if (!prisma) {
    throw new InternalServerError('Database not configured', 'DATABASE_NOT_CONFIGURED');
  }

  const rows = await prisma.apiKey.findMany({
    where: { organizationId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      name: true,
      keyPrefix: true,
      keyHash: true,
      scopes: true,
      organizationId: true,
      lastUsedAt: true,
      expiresAt: true,
      revokedAt: true,
      createdAt: true,
    },
  });

  return rows.map(toSummaryDto);
}

export async function findActiveApiKeysByPrefix(keyPrefix: string): Promise<ApiKeyRow[]> {
  const prisma = getPrismaClient();
  if (!prisma) {
    throw new InternalServerError('Database not configured', 'DATABASE_NOT_CONFIGURED');
  }

  const now = new Date();

  return prisma.apiKey.findMany({
    where: {
      keyPrefix,
      revokedAt: null,
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    select: {
      id: true,
      name: true,
      keyPrefix: true,
      keyHash: true,
      scopes: true,
      organizationId: true,
      lastUsedAt: true,
      expiresAt: true,
      revokedAt: true,
      createdAt: true,
    },
  });
}

export async function touchApiKeyLastUsed(apiKeyId: string): Promise<void> {
  const prisma = getPrismaClient();
  if (!prisma) {
    return;
  }

  await prisma.apiKey.update({
    where: { id: apiKeyId },
    data: { lastUsedAt: new Date() },
  });
}

export async function revokeApiKey(input: {
  apiKeyId: string;
  organizationId: string;
  revokedById: string;
}): Promise<ApiKeySummaryDto> {
  const prisma = getPrismaClient();
  if (!prisma) {
    throw new InternalServerError('Database not configured', 'DATABASE_NOT_CONFIGURED');
  }

  const existing = await prisma.apiKey.findFirst({
    where: {
      id: input.apiKeyId,
      organizationId: input.organizationId,
      revokedAt: null,
    },
    select: { id: true },
  });

  if (!existing) {
    throw new NotFoundError('API key not found', 'API_KEY_NOT_FOUND');
  }

  const row = await prisma.apiKey.update({
    where: { id: input.apiKeyId },
    data: {
      revokedAt: new Date(),
      revokedById: input.revokedById,
    },
    select: {
      id: true,
      name: true,
      keyPrefix: true,
      keyHash: true,
      scopes: true,
      organizationId: true,
      lastUsedAt: true,
      expiresAt: true,
      revokedAt: true,
      createdAt: true,
    },
  });

  return toSummaryDto(row);
}
