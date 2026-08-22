import { z } from 'zod';

export const listInventoryQuerySchema = z.object({
  country: z.string().trim().min(2).max(4).optional(),
  search: z.string().trim().max(40).optional(),
});

export const activateNumberSchema = z.object({
  inventoryId: z.string().uuid(),
  assignedApplication: z.string().trim().max(80).optional(),
});

export const updateVirtualNumberSchema = z.object({
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
  incomingEnabled: z.boolean().optional(),
  outgoingEnabled: z.boolean().optional(),
  destinationE164: z.string().trim().max(20).nullable().optional(),
  assignedApplication: z.string().trim().max(80).nullable().optional(),
  maskingEnabled: z.boolean().optional(),
  webhookUrl: z
    .union([z.string().url().max(500), z.literal(''), z.null()])
    .optional()
    .transform((value) => (value === '' ? null : value)),
});

export const voiceCallSchema = z.object({
  virtualNumberId: z.string().uuid().optional(),
  to: z.string().trim().min(8).max(20),
  name: z.string().trim().min(1).max(120).optional(),
});

export const maskingSessionSchema = z.object({
  virtualNumberId: z.string().uuid(),
  partyA: z.string().trim().min(8).max(20),
  partyB: z.string().trim().min(8).max(20),
});

export type ListInventoryQuery = z.infer<typeof listInventoryQuerySchema>;
export type ActivateNumberInput = z.infer<typeof activateNumberSchema>;
export type UpdateVirtualNumberInput = z.infer<typeof updateVirtualNumberSchema>;
export type VoiceCallInput = z.infer<typeof voiceCallSchema>;
export type MaskingSessionInput = z.infer<typeof maskingSessionSchema>;
