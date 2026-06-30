import { z } from 'zod';

const eventKeySchema = z
  .string()
  .min(1)
  .max(120)
  .regex(/^[a-zA-Z0-9._-]+$/, 'eventKey must use letters, numbers, dots, underscores, or hyphens');

export const variableMappingSchema = z.record(z.string(), z.string());

export const createNotificationRuleSchema = z.object({
  eventKey: eventKeySchema,
  name: z.string().min(1).max(200),
  templateId: z.string().uuid(),
  templateVersionId: z.string().uuid().optional(),
  phoneNumberId: z.string().uuid().optional(),
  variableMapping: variableMappingSchema.default({}),
  enabled: z.boolean().default(true),
  priority: z.number().int().min(0).max(100).default(0),
});

export type CreateNotificationRuleInput = z.infer<typeof createNotificationRuleSchema>;

export const updateNotificationRuleSchema = z
  .object({
    eventKey: eventKeySchema.optional(),
    name: z.string().min(1).max(200).optional(),
    templateId: z.string().uuid().optional(),
    templateVersionId: z.string().uuid().nullable().optional(),
    phoneNumberId: z.string().uuid().nullable().optional(),
    variableMapping: variableMappingSchema.optional(),
    enabled: z.boolean().optional(),
    priority: z.number().int().min(0).max(100).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field is required',
  });

export type UpdateNotificationRuleInput = z.infer<typeof updateNotificationRuleSchema>;

export const listNotificationRulesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  enabled: z.enum(['true', 'false']).optional(),
  eventKey: z.string().trim().min(1).max(120).optional(),
  templateId: z.string().uuid().optional(),
});

export type ListNotificationRulesQuery = z.infer<typeof listNotificationRulesQuerySchema>;

export type NotificationRuleTemplateRefDto = {
  id: string;
  metaTemplateName: string;
  metaStatus: string;
  language: string;
};

export type NotificationRulePhoneRefDto = {
  id: string;
  displayNumber: string;
  isDefault: boolean;
};

export type NotificationRuleDto = {
  id: string;
  organizationId: string;
  eventKey: string;
  name: string;
  version: number;
  templateId: string;
  templateVersionId: string | null;
  phoneNumberId: string | null;
  variableMapping: Record<string, string>;
  enabled: boolean;
  priority: number;
  template: NotificationRuleTemplateRefDto;
  phoneNumber: NotificationRulePhoneRefDto | null;
  createdAt: string;
  updatedAt: string;
};
