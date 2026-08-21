import { z } from 'zod';

export const platformLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

export type PlatformLoginInput = z.infer<typeof platformLoginSchema>;

export type PlatformAdminUserDto = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
};

export type PlatformLoginResultDto = {
  token: string;
  admin: PlatformAdminUserDto;
};

const slugSourceNameSchema = z.string().trim().min(2).max(120);

export const createOrganizationSchema = z.object({
  name: slugSourceNameSchema,
  adminEmail: z.string().email(),
  adminFirstName: z.string().trim().min(1).max(100),
  adminLastName: z.string().trim().min(1).max(100),
  adminPassword: z.string().min(8).max(200),
});

export type CreateOrganizationInput = z.infer<typeof createOrganizationSchema>;

export type CreateOrganizationResultDto = {
  organization: OrganizationSummaryDto;
  adminUser: PlatformAdminUserDto;
};

export const listOrganizationsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().min(1).max(200).optional(),
});

export type ListOrganizationsQuery = z.infer<typeof listOrganizationsQuerySchema>;

export type OrganizationSummaryDto = {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  createdAt: string;
  counts: {
    members: number;
    whatsAppAccounts: number;
    templates: number;
  };
};

export type OrganizationDetailDto = OrganizationSummaryDto & {
  hasActiveWhatsAppAccount: boolean;
  createdByName: string | null;
};

export const updateOrganizationSchema = z
  .object({
    name: slugSourceNameSchema.optional(),
    isActive: z.boolean().optional(),
  })
  .refine((data) => data.name !== undefined || data.isActive !== undefined, {
    message: 'At least one field is required',
  });

export type UpdateOrganizationInput = z.infer<typeof updateOrganizationSchema>;

/** @deprecated Prefer UpdateOrganizationInput — kept for clarity at call sites that only toggle status. */
export type UpdateOrganizationStatusInput = UpdateOrganizationInput;

export type PlatformWhatsAppAccountStatus = 'ACTIVE' | 'ERROR' | 'DISCONNECTED';

export type PlatformWhatsAppAccountDto = {
  id: string;
  organizationId: string;
  metaWabaId: string;
  name: string | null;
  status: PlatformWhatsAppAccountStatus;
  lastSyncedAt: string | null;
  lastError: string | null;
  phoneNumberCount: number;
  createdAt: string;
  updatedAt: string;
};

export type PlatformPhoneNumberStatus = 'ACTIVE' | 'PENDING' | 'RESTRICTED' | 'INACTIVE';
export type PlatformPhoneQualityRating = 'GREEN' | 'YELLOW' | 'RED' | 'UNKNOWN';

export type PlatformPhoneNumberDto = {
  id: string;
  whatsAppAccountId: string;
  metaPhoneNumberId: string;
  displayNumber: string;
  verifiedName: string | null;
  qualityRating: PlatformPhoneQualityRating;
  messagingTier: string | null;
  status: PlatformPhoneNumberStatus;
  isDefault: boolean;
  lastHealthCheckAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PlatformWhatsAppAccountDetailDto = {
  account: PlatformWhatsAppAccountDto;
  phoneNumbers: PlatformPhoneNumberDto[];
};

export type DeleteWhatsAppAccountResultDto = {
  outcome: 'deleted';
};

export const updateWhatsAppAccountNameSchema = z.object({
  name: z.string().trim().min(1).max(200),
});

export type UpdateWhatsAppAccountNameInput = z.infer<typeof updateWhatsAppAccountNameSchema>;
