import bcrypt from 'bcryptjs';
import { NotFoundError, UnauthorizedError } from '../../shared/errors/AppError';
import { signPlatformAccessToken } from '../../infrastructure/auth/jwt';
import {
  createOrganizationWithAdmin,
  findOrganizationDetailForPlatform,
  findPlatformAdminByEmail,
  findPlatformAdminById,
  generateUniqueOrganizationSlug,
  listOrganizationsForPlatform,
  setOrganizationActiveStatus,
  touchPlatformAdminLastLogin,
} from './platformAdmin.repository';
import type {
  CreateOrganizationInput,
  CreateOrganizationResultDto,
  ListOrganizationsQuery,
  OrganizationDetailDto,
  OrganizationSummaryDto,
  PlatformAdminUserDto,
  PlatformLoginInput,
  PlatformLoginResultDto,
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
