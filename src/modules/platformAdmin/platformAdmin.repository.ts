import { getPrismaClient } from '../../infrastructure/prisma/client';
import { ConflictError, InternalServerError } from '../../shared/errors/AppError';
import type { OrganizationDetailDto, OrganizationSummaryDto } from './platformAdmin.schemas';

export type PlatformAdminRow = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  passwordHash: string | null;
  isActive: boolean;
};

export async function findPlatformAdminByEmail(email: string): Promise<PlatformAdminRow | null> {
  const prisma = getPrismaClient();
  if (!prisma) {
    throw new InternalServerError('Database not configured', 'DATABASE_NOT_CONFIGURED');
  }

  return prisma.user.findFirst({
    where: { email: email.toLowerCase(), isPlatformAdmin: true },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      passwordHash: true,
      isActive: true,
    },
  });
}

export async function findPlatformAdminById(userId: string): Promise<PlatformAdminRow | null> {
  const prisma = getPrismaClient();
  if (!prisma) {
    throw new InternalServerError('Database not configured', 'DATABASE_NOT_CONFIGURED');
  }

  return prisma.user.findFirst({
    where: { id: userId, isPlatformAdmin: true },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      passwordHash: true,
      isActive: true,
    },
  });
}

export async function touchPlatformAdminLastLogin(userId: string): Promise<void> {
  const prisma = getPrismaClient();
  if (!prisma) {
    return;
  }
  await prisma.user.update({
    where: { id: userId },
    data: { lastLoginAt: new Date() },
  });
}

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return base || 'org';
}

/** Appends -2, -3, ... to the base slug until a free one is found. */
export async function generateUniqueOrganizationSlug(name: string): Promise<string> {
  const prisma = getPrismaClient();
  if (!prisma) {
    throw new InternalServerError('Database not configured', 'DATABASE_NOT_CONFIGURED');
  }

  const base = slugify(name);
  const existing = await prisma.organization.findMany({
    where: { slug: { startsWith: base } },
    select: { slug: true },
  });
  const taken = new Set(existing.map((row) => row.slug));

  if (!taken.has(base)) {
    return base;
  }

  let suffix = 2;
  while (taken.has(`${base}-${suffix}`)) {
    suffix += 1;
  }
  return `${base}-${suffix}`;
}

export type CreateOrganizationWithAdminInput = {
  name: string;
  slug: string;
  createdById: string;
  adminEmail: string;
  adminFirstName: string;
  adminLastName: string;
  adminPasswordHash: string;
};

export type CreateOrganizationWithAdminResult = {
  organizationId: string;
  adminUserId: string;
};

export async function createOrganizationWithAdmin(
  input: CreateOrganizationWithAdminInput,
): Promise<CreateOrganizationWithAdminResult> {
  const prisma = getPrismaClient();
  if (!prisma) {
    throw new InternalServerError('Database not configured', 'DATABASE_NOT_CONFIGURED');
  }

  return prisma.$transaction(async (tx) => {
    // Enforce one user -> one org: reusing an existing email (including an
    // existing Platform Super Admin's) as a new client's admin would silently
    // attach that identity to a second organization.
    const existingUser = await tx.user.findUnique({
      where: { email: input.adminEmail.toLowerCase() },
      select: { id: true },
    });
    if (existingUser) {
      throw new ConflictError(
        'A user with this email already exists',
        'ADMIN_EMAIL_ALREADY_EXISTS',
      );
    }

    const organization = await tx.organization.create({
      data: {
        name: input.name,
        slug: input.slug,
        isActive: true,
        createdById: input.createdById,
      },
    });

    const adminUser = await tx.user.create({
      data: {
        email: input.adminEmail.toLowerCase(),
        passwordHash: input.adminPasswordHash,
        firstName: input.adminFirstName,
        lastName: input.adminLastName,
        isActive: true,
      },
    });

    await tx.organizationMember.create({
      data: {
        organizationId: organization.id,
        userId: adminUser.id,
        role: 'ADMIN',
      },
    });

    return { organizationId: organization.id, adminUserId: adminUser.id };
  });
}

const organizationSummarySelect = {
  id: true,
  name: true,
  slug: true,
  isActive: true,
  createdAt: true,
  _count: {
    select: {
      members: true,
      whatsAppAccounts: true,
      templates: true,
    },
  },
} as const;

type OrganizationSummaryRow = {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  createdAt: Date;
  _count: { members: number; whatsAppAccounts: number; templates: number };
};

function toSummaryDto(row: OrganizationSummaryRow): OrganizationSummaryDto {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    counts: {
      members: row._count.members,
      whatsAppAccounts: row._count.whatsAppAccounts,
      templates: row._count.templates,
    },
  };
}

export async function listOrganizationsForPlatform(input: {
  page: number;
  limit: number;
  search?: string;
}): Promise<{ items: OrganizationSummaryDto[]; total: number }> {
  const prisma = getPrismaClient();
  if (!prisma) {
    throw new InternalServerError('Database not configured', 'DATABASE_NOT_CONFIGURED');
  }

  const where = input.search
    ? {
        OR: [
          { name: { contains: input.search, mode: 'insensitive' as const } },
          { slug: { contains: input.search, mode: 'insensitive' as const } },
        ],
      }
    : {};

  const skip = (input.page - 1) * input.limit;

  const [rows, total] = await Promise.all([
    prisma.organization.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: input.limit,
      select: organizationSummarySelect,
    }),
    prisma.organization.count({ where }),
  ]);

  return { items: rows.map(toSummaryDto), total };
}

export async function findOrganizationDetailForPlatform(
  organizationId: string,
): Promise<OrganizationDetailDto | null> {
  const prisma = getPrismaClient();
  if (!prisma) {
    throw new InternalServerError('Database not configured', 'DATABASE_NOT_CONFIGURED');
  }

  const row = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: {
      ...organizationSummarySelect,
      whatsAppAccounts: { select: { status: true }, take: 20 },
      createdBy: { select: { firstName: true, lastName: true } },
    },
  });

  if (!row) {
    return null;
  }

  const summary = toSummaryDto(row);
  const createdByName = row.createdBy
    ? `${row.createdBy.firstName} ${row.createdBy.lastName}`.trim()
    : null;

  return {
    ...summary,
    hasActiveWhatsAppAccount: row.whatsAppAccounts.some((account) => account.status === 'ACTIVE'),
    createdByName: createdByName || null,
  };
}

export async function setOrganizationActiveStatus(
  organizationId: string,
  isActive: boolean,
): Promise<OrganizationSummaryDto | null> {
  const prisma = getPrismaClient();
  if (!prisma) {
    throw new InternalServerError('Database not configured', 'DATABASE_NOT_CONFIGURED');
  }

  const exists = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { id: true },
  });
  if (!exists) {
    return null;
  }

  const row = await prisma.organization.update({
    where: { id: organizationId },
    data: { isActive },
    select: organizationSummarySelect,
  });

  return toSummaryDto(row);
}
