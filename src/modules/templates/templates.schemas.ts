import { z } from 'zod';

export const META_TEMPLATE_STATUSES = [
  'APPROVED',
  'PENDING',
  'REJECTED',
  'PAUSED',
  'DISABLED',
  'DELETED',
  'UNKNOWN',
] as const;

export const TEMPLATE_CATEGORIES = ['MARKETING', 'UTILITY', 'AUTHENTICATION'] as const;

export type MetaTemplateStatus = (typeof META_TEMPLATE_STATUSES)[number];
export type TemplateCategory = (typeof TEMPLATE_CATEGORIES)[number];

export const listTemplatesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  metaStatus: z.enum(META_TEMPLATE_STATUSES).optional(),
  category: z.enum(TEMPLATE_CATEGORIES).optional(),
  search: z.string().trim().min(1).max(200).optional(),
});

export type ListTemplatesQuery = z.infer<typeof listTemplatesQuerySchema>;

export const syncTemplatesSchema = z.object({
  whatsAppAccountId: z.string().uuid(),
});

export type SyncTemplatesInput = z.infer<typeof syncTemplatesSchema>;

export type TemplateVersionSummaryDto = {
  id: string;
  version: number;
  rejectionReason: string | null;
  submittedAt: string | null;
  approvedAt: string | null;
  createdAt: string;
};

export type TemplateButtonPreviewDto =
  | { type: 'QUICK_REPLY'; text: string }
  | { type: 'URL'; text: string; url: string }
  | { type: 'PHONE_NUMBER'; text: string; phoneNumber: string }
  | { type: 'COPY_CODE'; text: string; example: string };

export type TemplateSummaryPreviewDto = {
  templateKind: 'standard' | 'carousel';
  headerType: 'none' | 'text' | 'image' | 'video' | 'document';
  headerText?: string;
  bodyText: string;
  footerText?: string;
  buttons: TemplateButtonPreviewDto[];
  carouselCards?: Array<{
    headerType: 'image';
    bodyText: string;
    buttonText?: string;
  }>;
};

export type TemplateSummaryDto = {
  id: string;
  organizationId: string;
  metaTemplateName: string;
  metaTemplateId: string | null;
  category: TemplateCategory;
  language: string;
  metaStatus: MetaTemplateStatus;
  currentVersion: number | null;
  updatedAt: string;
  createdAt: string;
  preview?: TemplateSummaryPreviewDto;
  createdByName?: string | null;
};

export type TemplateDetailDto = TemplateSummaryDto & {
  currentVersionDetail: {
    id: string;
    version: number;
    components: unknown;
    variableSchema: unknown;
    rejectionReason: string | null;
    submittedAt: string | null;
    approvedAt: string | null;
    createdAt: string;
  } | null;
};

export type TemplateSyncJobData = {
  organizationId: string;
  whatsAppAccountId: string;
  userId: string;
  correlationId?: string;
};

export type TemplateSyncResultDto = {
  whatsAppAccountId: string;
  syncedCount: number;
  createdCount: number;
  updatedCount: number;
  versionedCount: number;
};

export type EnqueueTemplateSyncResultDto = {
  whatsAppAccountId: string;
  queued: true;
};

const templateNameSchema = z
  .string()
  .min(1)
  .max(512)
  .regex(/^[a-z][a-z0-9_]*$/, 'Use lowercase letters, numbers, and underscores');

const templateUrlButtonSchema = z.object({
  type: z.literal('URL'),
  text: z.string().min(1).max(25),
  url: z.string().min(1).max(2000),
  urlType: z.enum(['static', 'dynamic']).optional(),
});

const templateQuickReplyButtonSchema = z.object({
  type: z.literal('QUICK_REPLY'),
  text: z.string().min(1).max(25),
});

const templatePhoneButtonSchema = z.object({
  type: z.literal('PHONE_NUMBER'),
  text: z.string().min(1).max(25),
  phoneNumber: z.string().min(10).max(20),
});

const templateCopyCodeButtonSchema = z.object({
  type: z.literal('COPY_CODE'),
  text: z.string().min(1).max(25),
  example: z.string().min(1).max(15),
});

const templateButtonSchema = z.discriminatedUnion('type', [
  templateQuickReplyButtonSchema,
  templateUrlButtonSchema,
  templatePhoneButtonSchema,
  templateCopyCodeButtonSchema,
]);

const carouselCardSchema = z.object({
  imageHandle: z.string().min(1).max(2048),
  bodyText: z.string().min(1).max(160),
  button: z
    .object({
      type: z.literal('URL'),
      text: z.string().min(1).max(25),
      url: z.string().min(1).max(2000),
    })
    .optional(),
});

function refineTemplateButtons(
  buttons: z.infer<typeof templateButtonSchema>[] | undefined,
  ctx: z.RefinementCtx,
  pathPrefix: (string | number)[] = ['buttons'],
): void {
  if (!buttons || buttons.length === 0) {
    return;
  }

  const quickReplies = buttons.filter((button) => button.type === 'QUICK_REPLY');
  const ctaButtons = buttons.filter((button) => button.type !== 'QUICK_REPLY');

  if (quickReplies.length > 0 && ctaButtons.length > 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Quick reply buttons cannot be combined with call-to-action buttons',
      path: pathPrefix,
    });
  }

  if (quickReplies.length > 3) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'At most 3 quick reply buttons are allowed',
      path: pathPrefix,
    });
  }

  const urlCount = buttons.filter((button) => button.type === 'URL').length;
  const phoneCount = buttons.filter((button) => button.type === 'PHONE_NUMBER').length;
  const copyCodeCount = buttons.filter((button) => button.type === 'COPY_CODE').length;

  if (urlCount > 2) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'At most 2 URL buttons are allowed',
      path: pathPrefix,
    });
  }
  if (phoneCount > 1) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'At most 1 phone button is allowed',
      path: pathPrefix,
    });
  }
  if (copyCodeCount > 1) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'At most 1 copy code button is allowed',
      path: pathPrefix,
    });
  }
}

export const createTemplateSchema = z
  .object({
    whatsAppAccountId: z.string().uuid(),
    name: templateNameSchema,
    language: z.string().min(2).max(10).default('en'),
    category: z.enum(TEMPLATE_CATEGORIES).default('UTILITY'),
    templateFormat: z.enum(['standard', 'carousel']).default('standard'),
    carouselCards: z.array(carouselCardSchema).min(2).max(10).optional(),
    header: z
      .union([
        z.object({ text: z.string().min(1).max(60) }),
        z.object({
          format: z.enum(['IMAGE', 'VIDEO', 'DOCUMENT']),
          handle: z.string().min(1).max(2048),
        }),
      ])
      .optional(),
    body: z.object({ text: z.string().min(1).max(1024) }),
    footer: z.object({ text: z.string().min(1).max(60) }).optional(),
    variableSamples: z.record(z.string(), z.string().max(200)).optional(),
    buttons: z.array(templateButtonSchema).max(6).optional(),
    linkTrackingEnabled: z.boolean().optional(),
  })
  .superRefine((values, ctx) => {
    if (values.templateFormat === 'carousel') {
      if (!values.carouselCards || values.carouselCards.length < 2) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Carousel templates require at least 2 cards',
          path: ['carouselCards'],
        });
      }
      return;
    }

    refineTemplateButtons(values.buttons, ctx);
  });

export type CreateTemplateInput = z.infer<typeof createTemplateSchema>;

const updateTemplateBodySchema = z
  .object({
    whatsAppAccountId: z.string().uuid(),
    templateFormat: z.enum(['standard', 'carousel']).default('standard'),
    carouselCards: z.array(carouselCardSchema).min(2).max(10).optional(),
    header: z
      .union([
        z.object({ text: z.string().min(1).max(60) }),
        z.object({
          format: z.enum(['IMAGE', 'VIDEO', 'DOCUMENT']),
          handle: z.string().min(1).max(2048),
        }),
      ])
      .optional(),
    body: z.object({ text: z.string().min(1).max(1024) }),
    footer: z.object({ text: z.string().min(1).max(60) }).optional(),
    variableSamples: z.record(z.string(), z.string().max(200)).optional(),
    buttons: z.array(templateButtonSchema).max(6).optional(),
    linkTrackingEnabled: z.boolean().optional(),
  })
  .superRefine((values, ctx) => {
    if (values.templateFormat === 'carousel') {
      if (!values.carouselCards || values.carouselCards.length < 2) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Carousel templates require at least 2 cards',
          path: ['carouselCards'],
        });
      }
      return;
    }

    refineTemplateButtons(values.buttons, ctx);
  });

export const updateTemplateSchema = updateTemplateBodySchema;

export type UpdateTemplateInput = z.infer<typeof updateTemplateSchema>;

export const updateTemplateVariableNamesSchema = z.object({
  variableNames: z.array(z.string().min(1).max(64)),
});

export type UpdateTemplateVariableNamesInput = z.infer<typeof updateTemplateVariableNamesSchema>;
