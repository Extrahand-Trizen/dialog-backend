import { ConflictError, ExternalServiceError } from '../../shared/errors/AppError';

/**
 * Ensures a Message.organizationId matches the PhoneNumber's owning organization
 * (via WhatsAppAccount). Used before Meta send to block cross-tenant FK drift.
 */
export function assertMessagePhoneSameOrganization(input: {
  messageId: string;
  messageOrganizationId: string;
  phoneNumberId: string;
  phoneOrganizationId: string | null | undefined;
}): void {
  if (
    !input.phoneOrganizationId ||
    input.phoneOrganizationId !== input.messageOrganizationId
  ) {
    throw new ExternalServiceError(
      'CROSS_ORGANIZATION_PHONE_NUMBER_REFERENCE',
      'CROSS_ORGANIZATION_PHONE_NUMBER_REFERENCE',
      {
        messageId: input.messageId,
        messageOrganizationId: input.messageOrganizationId,
        phoneNumberId: input.phoneNumberId,
        phoneOrganizationId: input.phoneOrganizationId ?? null,
      },
    );
  }
}

/**
 * Blocks reassignment of a globally-unique Meta phone number to another org's WABA.
 * Same-org account moves (reconnect) remain allowed.
 */
export function assertPhoneUpsertSameOrganization(input: {
  metaPhoneNumberId: string;
  targetOrganizationId: string;
  existingOrganizationId: string | null | undefined;
}): void {
  if (
    input.existingOrganizationId &&
    input.existingOrganizationId !== input.targetOrganizationId
  ) {
    throw new ConflictError(
      'WhatsApp phone number is already linked to another organization',
      'PHONE_NUMBER_OWNED_BY_OTHER_ORGANIZATION',
      {
        metaPhoneNumberId: input.metaPhoneNumberId,
        targetOrganizationId: input.targetOrganizationId,
        existingOrganizationId: input.existingOrganizationId,
      },
    );
  }
}
