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

export const updateOrganizationStatusSchema = z.object({
  isActive: z.boolean(),
});

export type UpdateOrganizationStatusInput = z.infer<typeof updateOrganizationStatusSchema>;
