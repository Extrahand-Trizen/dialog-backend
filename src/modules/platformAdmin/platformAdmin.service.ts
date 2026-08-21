import bcrypt from 'bcryptjs';
import { NotFoundError, UnauthorizedError } from '../../shared/errors/AppError';
import { signPlatformAccessToken } from '../../infrastructure/auth/jwt';
import {
  decryptField,
  isEncryptionConfigured,
} from '../../infrastructure/encryption/fieldCrypto';
import { getMetaWhatsAppClient } from '../../infrastructure/meta';
import { findWhatsAppAccountSecrets } from '../whatsapp/whatsapp.repository';
import { softDeleteTemplatesForWhatsAppAccount } from '../templates/templates.repository';
import {
  createOrganizationWithAdmin,
  findOrganizationDetailForPlatform,
  findPlatformAdminByEmail,
  findPlatformAdminById,
  findWhatsAppAccountDetailForPlatform,
  forceDeleteWhatsAppAccountForPlatform,
  generateUniqueOrganizationSlug,
  listOrganizationsForPlatform,
  listWhatsAppAccountsForPlatform,
  setOrganizationActiveStatus,
  touchPlatformAdminLastLogin,
  updateOrganizationForPlatform,
  updateWhatsAppAccountNameForPlatform,
} from './platformAdmin.repository';
import type {
  CreateOrganizationInput,
  CreateOrganizationResultDto,
  DeleteWhatsAppAccountResultDto,
  ListOrganizationsQuery,
  OrganizationDetailDto,
  OrganizationSummaryDto,
  PlatformAdminUserDto,
  PlatformLoginInput,
  PlatformLoginResultDto,
  PlatformWhatsAppAccountDetailDto,
  PlatformWhatsAppAccountDto,
  UpdateOrganizationInput,
  UpdateWhatsAppAccountNameInput,
} from './platformAdmin.schemas';

function toPlatformAdminUserDto(admin: {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
}): PlatformAdminUserDto {
  return {
    id: admin.id,
    email: admin.email,
    firstName: admin.firstName,
    lastName: admin.lastName,
  };
}

export async function platformLogin(input: PlatformLoginInput): Promise<PlatformLoginResultDto> {
  const admin = await findPlatformAdminByEmail(input.email.toLowerCase());

  if (!admin || !admin.isActive || !admin.passwordHash) {
    throw new UnauthorizedError('Invalid email or password', 'INVALID_CREDENTIALS');
  }

  const passwordMatches = await bcrypt.compare(input.password, admin.passwordHash);
  if (!passwordMatches) {
    throw new UnauthorizedError('Invalid email or password', 'INVALID_CREDENTIALS');
  }

  const token = signPlatformAccessToken({ sub: admin.id, email: admin.email });

  await touchPlatformAdminLastLogin(admin.id);

  return { token, admin: toPlatformAdminUserDto(admin) };
}

export async function getPlatformAdminProfile(userId: string): Promise<PlatformAdminUserDto> {
  const admin = await findPlatformAdminById(userId);
  if (!admin || !admin.isActive) {
    throw new UnauthorizedError('Platform admin not found or inactive', 'PLATFORM_ADMIN_INACTIVE');
  }
  return toPlatformAdminUserDto(admin);
}

export async function createOrganizationForPlatform(
  createdById: string,
  input: CreateOrganizationInput,
): Promise<CreateOrganizationResultDto> {
  const slug = await generateUniqueOrganizationSlug(input.name);
  const adminPasswordHash = await bcrypt.hash(input.adminPassword, 12);

  const result = await createOrganizationWithAdmin({
    name: input.name,
    slug,
    createdById,
    adminEmail: input.adminEmail,
    adminFirstName: input.adminFirstName,
    adminLastName: input.adminLastName,
    adminPasswordHash,
  });

  const organization = await findOrganizationDetailForPlatform(result.organizationId);
  if (!organization) {
    throw new NotFoundError('Organization not found after creation', 'ORGANIZATION_NOT_FOUND');
  }

  return {
    organization,
    adminUser: {
      id: result.adminUserId,
      email: input.adminEmail.toLowerCase(),
      firstName: input.adminFirstName,
      lastName: input.adminLastName,
    },
  };
}

export async function listOrganizations(
  query: ListOrganizationsQuery,
): Promise<{ items: OrganizationSummaryDto[]; page: number; limit: number; total: number }> {
  const result = await listOrganizationsForPlatform(query);
  return { items: result.items, page: query.page, limit: query.limit, total: result.total };
}

export async function getOrganizationDetail(organizationId: string): Promise<OrganizationDetailDto> {
  const organization = await findOrganizationDetailForPlatform(organizationId);
  if (!organization) {
    throw new NotFoundError('Organization not found', 'ORGANIZATION_NOT_FOUND');
  }
  return organization;
}

export async function updateOrganizationStatus(
  organizationId: string,
  isActive: boolean,
): Promise<OrganizationSummaryDto> {
  const organization = await setOrganizationActiveStatus(organizationId, isActive);
  if (!organization) {
    throw new NotFoundError('Organization not found', 'ORGANIZATION_NOT_FOUND');
  }
  return organization;
}

export async function updateOrganizationDetails(
  organizationId: string,
  input: UpdateOrganizationInput,
): Promise<OrganizationSummaryDto> {
  const organization = await updateOrganizationForPlatform(organizationId, input);
  if (!organization) {
    throw new NotFoundError('Organization not found', 'ORGANIZATION_NOT_FOUND');
  }
  return organization;
}

export async function listOrganizationWhatsAppAccounts(
  organizationId: string,
): Promise<PlatformWhatsAppAccountDto[]> {
  const accounts = await listWhatsAppAccountsForPlatform(organizationId);
  if (!accounts) {
    throw new NotFoundError('Organization not found', 'ORGANIZATION_NOT_FOUND');
  }
  return accounts;
}

export async function getOrganizationWhatsAppAccountDetail(
  organizationId: string,
  accountId: string,
): Promise<PlatformWhatsAppAccountDetailDto> {
  const detail = await findWhatsAppAccountDetailForPlatform({ organizationId, accountId });
  if (!detail) {
    throw new NotFoundError('WhatsApp account not found', 'WHATSAPP_ACCOUNT_NOT_FOUND');
  }
  return detail;
}

export async function updateOrganizationWhatsAppAccountName(
  organizationId: string,
  accountId: string,
  updatedById: string,
  input: UpdateWhatsAppAccountNameInput,
): Promise<PlatformWhatsAppAccountDto> {
  const account = await updateWhatsAppAccountNameForPlatform({
    organizationId,
    accountId,
    name: input.name,
    updatedById,
  });
  if (!account) {
    throw new NotFoundError('WhatsApp account not found', 'WHATSAPP_ACCOUNT_NOT_FOUND');
  }
  return account;
}

/**
 * Permanently removes the WhatsApp account from a client.
 * Soft-deletes templates, best-effort Meta unsubscribe, then hard-deletes the account
 * (and any messages that blocked phone-number cascade).
 */
export async function deleteOrganizationWhatsAppAccount(
  organizationId: string,
  accountId: string,
  deletedById: string,
): Promise<DeleteWhatsAppAccountResultDto> {
  const detail = await findWhatsAppAccountDetailForPlatform({ organizationId, accountId });
  if (!detail) {
    throw new NotFoundError('WhatsApp account not found', 'WHATSAPP_ACCOUNT_NOT_FOUND');
  }

  if (detail.account.status === 'ACTIVE' || detail.account.status === 'ERROR') {
    const secrets = await findWhatsAppAccountSecrets(organizationId, accountId);
    if (secrets && isEncryptionConfigured()) {
      try {
        const accessToken = decryptField(secrets.accessTokenEnc);
        const metaClient = getMetaWhatsAppClient();
        await metaClient.unsubscribeFromWaba(secrets.account.metaWabaId, accessToken);
      } catch {
        // Best effort — local removal should continue if Meta unsubscribe fails.
      }
    }
  }

  await softDeleteTemplatesForWhatsAppAccount({
    organizationId,
    whatsAppAccountId: accountId,
    deletedById,
  });

  const removed = await forceDeleteWhatsAppAccountForPlatform({ organizationId, accountId });
  if (!removed) {
    throw new NotFoundError('WhatsApp account not found', 'WHATSAPP_ACCOUNT_NOT_FOUND');
  }

  return { outcome: 'deleted' };
}
