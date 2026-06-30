import { Prisma } from '@prisma/client';
import { getPrismaClient } from '../../infrastructure/prisma/client';
import {
  ConflictError,
  InternalServerError,
  NotFoundError,
} from '../../shared/errors/AppError';
import type {
  PhoneNumberDto,
  PhoneNumberStatus,
  PhoneQualityRating,
  WhatsAppAccountDto,
  WhatsAppAccountStatus,
} from './whatsapp.schemas';

type AccountRow = {
  id: string;
  organizationId: string;
  metaWabaId: string;
  name: string | null;
  accessTokenEnc: string;
  appSecretEnc: string;
  webhookVerifyToken: string | null;
  status: WhatsAppAccountStatus;
  lastSyncedAt: Date | null;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
  _count?: { phoneNumbers: number };
};

type PhoneRow = {
  id: string;
  whatsAppAccountId: string;
  metaPhoneNumberId: string;
  displayNumber: string;
  verifiedName: string | null;
  qualityRating: PhoneQualityRating;
  messagingTier: string | null;
  status: PhoneNumberStatus;
  isDefault: boolean;
  lastHealthCheckAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

const accountSelect = {
  id: true,
  organizationId: true,
  metaWabaId: true,
  name: true,
  accessTokenEnc: true,
  appSecretEnc: true,
  webhookVerifyToken: true,
  status: true,
  lastSyncedAt: true,
  lastError: true,
  createdAt: true,
  updatedAt: true,
} as const;

const phoneSelect = {
  id: true,
  whatsAppAccountId: true,
  metaPhoneNumberId: true,
  displayNumber: true,
  verifiedName: true,
  qualityRating: true,
  messagingTier: true,
  status: true,
  isDefault: true,
  lastHealthCheckAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

function toAccountDto(row: AccountRow): WhatsAppAccountDto {
  return {
    id: row.id,
    organizationId: row.organizationId,
    metaWabaId: row.metaWabaId,
    name: row.name,
    status: row.status,
    lastSyncedAt: row.lastSyncedAt?.toISOString() ?? null,
    lastError: row.lastError,
    phoneNumberCount: row._count?.phoneNumbers ?? 0,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toPhoneDto(row: PhoneRow): PhoneNumberDto {
  return {
    id: row.id,
    whatsAppAccountId: row.whatsAppAccountId,
    metaPhoneNumberId: row.metaPhoneNumberId,
    displayNumber: row.displayNumber,
    verifiedName: row.verifiedName,
    qualityRating: row.qualityRating,
    messagingTier: row.messagingTier,
    status: row.status,
    isDefault: row.isDefault,
    lastHealthCheckAt: row.lastHealthCheckAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export type WhatsAppAccountSecretsDto = {
  account: WhatsAppAccountDto;
  accessTokenEnc: string;
  appSecretEnc: string;
};

export async function insertWhatsAppAccount(input: {
  organizationId: string;
  metaWabaId: string;
  name?: string;
  accessTokenEnc: string;
  appSecretEnc: string;
  webhookVerifyToken?: string;
  createdById: string;
}): Promise<WhatsAppAccountDto> {
  const prisma = getPrismaClient();
  if (!prisma) {
    throw new InternalServerError('Database not configured', 'DATABASE_NOT_CONFIGURED');
  }

  try {
    const row = await prisma.whatsAppAccount.create({
      data: {
        organizationId: input.organizationId,
        metaWabaId: input.metaWabaId,
        name: input.name,
        accessTokenEnc: input.accessTokenEnc,
        appSecretEnc: input.appSecretEnc,
        webhookVerifyToken: input.webhookVerifyToken,
        createdById: input.createdById,
        updatedById: input.createdById,
        status: 'ACTIVE',
      },
      select: {
        ...accountSelect,
        _count: { select: { phoneNumbers: true } },
      },
    });

    return toAccountDto(row);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ConflictError(
        'WhatsApp account already connected for this organization',
        'WHATSAPP_ACCOUNT_EXISTS',
      );
    }
    throw error;
  }
}

export async function listWhatsAppAccountsByOrganization(
  organizationId: string,
): Promise<WhatsAppAccountDto[]> {
  const prisma = getPrismaClient();
  if (!prisma) {
    throw new InternalServerError('Database not configured', 'DATABASE_NOT_CONFIGURED');
  }

  const rows = await prisma.whatsAppAccount.findMany({
    where: { organizationId },
    orderBy: { createdAt: 'desc' },
    select: {
      ...accountSelect,
      _count: { select: { phoneNumbers: true } },
    },
  });

  return rows.map(toAccountDto);
}

export async function findWhatsAppAccountById(
  organizationId: string,
  accountId: string,
): Promise<WhatsAppAccountDto | null> {
  const prisma = getPrismaClient();
  if (!prisma) {
    throw new InternalServerError('Database not configured', 'DATABASE_NOT_CONFIGURED');
  }

  const row = await prisma.whatsAppAccount.findFirst({
    where: { id: accountId, organizationId },
    select: {
      ...accountSelect,
      _count: { select: { phoneNumbers: true } },
    },
  });

  return row ? toAccountDto(row) : null;
}

export async function findWhatsAppAccountSecrets(
  organizationId: string,
  accountId: string,
): Promise<WhatsAppAccountSecretsDto | null> {
  const prisma = getPrismaClient();
  if (!prisma) {
    throw new InternalServerError('Database not configured', 'DATABASE_NOT_CONFIGURED');
  }

  const row = await prisma.whatsAppAccount.findFirst({
    where: { id: accountId, organizationId },
    select: {
      ...accountSelect,
      _count: { select: { phoneNumbers: true } },
    },
  });

  if (!row) {
    return null;
  }

  return {
    account: toAccountDto(row),
    accessTokenEnc: row.accessTokenEnc,
    appSecretEnc: row.appSecretEnc,
  };
}

export async function updateWhatsAppAccountAfterSync(input: {
  accountId: string;
  status: WhatsAppAccountStatus;
  lastError: string | null;
  updatedById: string;
}): Promise<WhatsAppAccountDto> {
  const prisma = getPrismaClient();
  if (!prisma) {
    throw new InternalServerError('Database not configured', 'DATABASE_NOT_CONFIGURED');
  }

  const row = await prisma.whatsAppAccount.update({
    where: { id: input.accountId },
    data: {
      status: input.status,
      lastSyncedAt: new Date(),
      lastError: input.lastError,
      updatedById: input.updatedById,
    },
    select: {
      ...accountSelect,
      _count: { select: { phoneNumbers: true } },
    },
  });

  return toAccountDto(row);
}

export async function upsertPhoneNumberFromMeta(input: {
  whatsAppAccountId: string;
  metaPhoneNumberId: string;
  displayNumber: string;
  verifiedName?: string | null;
  qualityRating: PhoneQualityRating;
  messagingTier?: string | null;
  status: PhoneNumberStatus;
  updatedById: string;
}): Promise<PhoneNumberDto> {
  const prisma = getPrismaClient();
  if (!prisma) {
    throw new InternalServerError('Database not configured', 'DATABASE_NOT_CONFIGURED');
  }

  const row = await prisma.phoneNumber.upsert({
    where: { metaPhoneNumberId: input.metaPhoneNumberId },
    create: {
      whatsAppAccountId: input.whatsAppAccountId,
      metaPhoneNumberId: input.metaPhoneNumberId,
      displayNumber: input.displayNumber,
      verifiedName: input.verifiedName ?? null,
      qualityRating: input.qualityRating,
      messagingTier: input.messagingTier ?? null,
      status: input.status,
      createdById: input.updatedById,
      updatedById: input.updatedById,
      lastHealthCheckAt: new Date(),
    },
    update: {
      displayNumber: input.displayNumber,
      verifiedName: input.verifiedName ?? null,
      qualityRating: input.qualityRating,
      messagingTier: input.messagingTier ?? null,
      status: input.status,
      updatedById: input.updatedById,
      lastHealthCheckAt: new Date(),
    },
    select: phoneSelect,
  });

  return toPhoneDto(row);
}

export async function listPhoneNumbersByAccount(
  organizationId: string,
  accountId: string,
): Promise<PhoneNumberDto[]> {
  const prisma = getPrismaClient();
  if (!prisma) {
    throw new InternalServerError('Database not configured', 'DATABASE_NOT_CONFIGURED');
  }

  const account = await prisma.whatsAppAccount.findFirst({
    where: { id: accountId, organizationId },
    select: { id: true },
  });

  if (!account) {
    throw new NotFoundError('WhatsApp account not found', 'WHATSAPP_ACCOUNT_NOT_FOUND');
  }

  const rows = await prisma.phoneNumber.findMany({
    where: { whatsAppAccountId: accountId },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    select: phoneSelect,
  });

  return rows.map(toPhoneDto);
}

export async function setDefaultPhoneNumber(input: {
  organizationId: string;
  accountId: string;
  phoneNumberId: string;
  updatedById: string;
}): Promise<PhoneNumberDto> {
  const prisma = getPrismaClient();
  if (!prisma) {
    throw new InternalServerError('Database not configured', 'DATABASE_NOT_CONFIGURED');
  }

  const phone = await prisma.phoneNumber.findFirst({
    where: {
      id: input.phoneNumberId,
      whatsAppAccountId: input.accountId,
      whatsAppAccount: { organizationId: input.organizationId },
    },
    select: { id: true },
  });

  if (!phone) {
    throw new NotFoundError('Phone number not found', 'PHONE_NUMBER_NOT_FOUND');
  }

  const updated = await prisma.$transaction(async (tx) => {
    await tx.phoneNumber.updateMany({
      where: { whatsAppAccountId: input.accountId },
      data: { isDefault: false, updatedById: input.updatedById },
    });

    return tx.phoneNumber.update({
      where: { id: input.phoneNumberId },
      data: { isDefault: true, updatedById: input.updatedById },
      select: phoneSelect,
    });
  });

  return toPhoneDto(updated);
}

export async function findPhoneNumberInOrganization(
  organizationId: string,
  phoneNumberId: string,
): Promise<PhoneNumberDto | null> {
  const prisma = getPrismaClient();
  if (!prisma) {
    throw new InternalServerError('Database not configured', 'DATABASE_NOT_CONFIGURED');
  }

  const row = await prisma.phoneNumber.findFirst({
    where: {
      id: phoneNumberId,
      whatsAppAccount: { organizationId },
    },
    select: phoneSelect,
  });

  return row ? toPhoneDto(row) : null;
}

export async function findDefaultPhoneForOrganization(
  organizationId: string,
): Promise<PhoneNumberDto | null> {
  const prisma = getPrismaClient();
  if (!prisma) {
    throw new InternalServerError('Database not configured', 'DATABASE_NOT_CONFIGURED');
  }

  const defaultPhone = await prisma.phoneNumber.findFirst({
    where: {
      isDefault: true,
      whatsAppAccount: { organizationId },
    },
    select: phoneSelect,
  });

  if (defaultPhone) {
    return toPhoneDto(defaultPhone);
  }

  const fallback = await prisma.phoneNumber.findFirst({
    where: { whatsAppAccount: { organizationId } },
    orderBy: { createdAt: 'asc' },
    select: phoneSelect,
  });

  return fallback ? toPhoneDto(fallback) : null;
}

export async function countPhoneNumbersForAccount(accountId: string): Promise<number> {
  const prisma = getPrismaClient();
  if (!prisma) {
    return 0;
  }

  return prisma.phoneNumber.count({ where: { whatsAppAccountId: accountId } });
}

export async function ensureDefaultPhoneNumber(
  accountId: string,
  updatedById: string,
): Promise<void> {
  const prisma = getPrismaClient();
  if (!prisma) {
    return;
  }

  const defaultPhone = await prisma.phoneNumber.findFirst({
    where: { whatsAppAccountId: accountId, isDefault: true },
    select: { id: true },
  });

  if (defaultPhone) {
    return;
  }

  const firstPhone = await prisma.phoneNumber.findFirst({
    where: { whatsAppAccountId: accountId },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });

  if (!firstPhone) {
    return;
  }

  await prisma.phoneNumber.update({
    where: { id: firstPhone.id },
    data: { isDefault: true, updatedById },
  });
}

export type WhatsAppWebhookAccountDto = {
  id: string;
  organizationId: string;
  metaWabaId: string;
  appSecretEnc: string;
  webhookVerifyToken: string | null;
};

export async function findWhatsAppAccountByMetaWabaId(
  metaWabaId: string,
): Promise<WhatsAppWebhookAccountDto | null> {
  const prisma = getPrismaClient();
  if (!prisma) {
    throw new InternalServerError('Database not configured', 'DATABASE_NOT_CONFIGURED');
  }

  const row = await prisma.whatsAppAccount.findFirst({
    where: { metaWabaId },
    select: {
      id: true,
      organizationId: true,
      metaWabaId: true,
      appSecretEnc: true,
      webhookVerifyToken: true,
    },
  });

  return row;
}

export async function findWhatsAppAccountByWebhookVerifyToken(
  token: string,
): Promise<boolean> {
  const prisma = getPrismaClient();
  if (!prisma) {
    return false;
  }

  const row = await prisma.whatsAppAccount.findFirst({
    where: { webhookVerifyToken: token },
    select: { id: true },
  });

  return Boolean(row);
}

export async function updatePhoneNumberFromQualityWebhook(input: {
  metaPhoneNumberId: string;
  qualityRating?: PhoneQualityRating;
  messagingTier?: string | null;
}): Promise<void> {
  const prisma = getPrismaClient();
  if (!prisma) {
    throw new InternalServerError('Database not configured', 'DATABASE_NOT_CONFIGURED');
  }

  const existing = await prisma.phoneNumber.findUnique({
    where: { metaPhoneNumberId: input.metaPhoneNumberId },
    select: { id: true },
  });

  if (!existing) {
    return;
  }

  await prisma.phoneNumber.update({
    where: { id: existing.id },
    data: {
      ...(input.qualityRating ? { qualityRating: input.qualityRating } : {}),
      ...(input.messagingTier !== undefined ? { messagingTier: input.messagingTier } : {}),
      lastHealthCheckAt: new Date(),
    },
  });
}
