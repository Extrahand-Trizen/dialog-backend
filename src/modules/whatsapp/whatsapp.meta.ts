import type { MetaPhoneNumberNode } from '../../infrastructure/meta';
import type { PhoneNumberStatus, PhoneQualityRating } from './whatsapp.schemas';

export function normalizeDisplayNumber(raw: string | undefined): string {
  if (!raw) {
    return '';
  }
  return raw.replace(/\D/g, '');
}

export function mapMetaQualityRating(value: string | undefined): PhoneQualityRating {
  switch (value?.toUpperCase()) {
    case 'GREEN':
      return 'GREEN';
    case 'YELLOW':
      return 'YELLOW';
    case 'RED':
      return 'RED';
    default:
      return 'UNKNOWN';
  }
}

export function mapMetaPhoneStatus(value: string | undefined): PhoneNumberStatus {
  switch (value?.toUpperCase()) {
    case 'CONNECTED':
    case 'ACTIVE':
      return 'ACTIVE';
    case 'RESTRICTED':
      return 'RESTRICTED';
    case 'DISCONNECTED':
    case 'INACTIVE':
      return 'INACTIVE';
    default:
      return 'PENDING';
  }
}

export function mapMetaPhoneNode(node: MetaPhoneNumberNode): {
  metaPhoneNumberId: string;
  displayNumber: string;
  verifiedName: string | null;
  qualityRating: PhoneQualityRating;
  messagingTier: string | null;
  status: PhoneNumberStatus;
} {
  return {
    metaPhoneNumberId: node.id,
    displayNumber: normalizeDisplayNumber(node.display_phone_number),
    verifiedName: node.verified_name ?? null,
    qualityRating: mapMetaQualityRating(node.quality_rating),
    messagingTier: node.messaging_limit_tier ?? null,
    status: mapMetaPhoneStatus(node.status),
  };
}
