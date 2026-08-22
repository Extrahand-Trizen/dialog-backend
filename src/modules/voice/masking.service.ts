import { getPrismaClient } from '../../infrastructure/prisma/client';
import { getTelephonyProvider } from '../../infrastructure/telephony';
import { InternalServerError, NotFoundError, ValidationError } from '../../shared/errors/AppError';
import { formatVirtualNumber } from './voice.catalog';
import type { MaskingSessionInput } from './voice.schemas';

function prisma() {
  const client = getPrismaClient();
  if (!client) {
    throw new InternalServerError('Database not configured', 'DATABASE_NOT_CONFIGURED');
  }
  return client;
}

function maskParty(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 4) return '••••';
  return `•••• ${digits.slice(-4)}`;
}

export async function createMaskingSession(organizationId: string, input: MaskingSessionInput) {
  const number = await prisma().virtualNumber.findFirst({
    where: {
      id: input.virtualNumberId,
      organizationId,
      status: 'ACTIVE',
      maskingEnabled: true,
    },
  });
  if (!number) {
    throw new NotFoundError('Virtual number not found or masking is disabled', 'VIRTUAL_NUMBER_NOT_FOUND');
  }
  if (input.partyA.replace(/\D/g, '') === input.partyB.replace(/\D/g, '')) {
    throw new ValidationError('partyA and partyB must be different numbers');
  }

  const placed = await getTelephonyProvider().createMaskingSession({
    virtualE164: number.e164,
    partyA: input.partyA,
    partyB: input.partyB,
  });

  const session = await prisma().maskedCallSession.create({
    data: {
      organizationId,
      virtualNumberId: number.id,
      partyA: input.partyA.replace(/\D/g, ''),
      partyB: input.partyB.replace(/\D/g, ''),
      providerSessionId: placed.providerSessionId,
      status: placed.status === 'ACTIVE' ? 'ACTIVE' : placed.status === 'RINGING' ? 'RINGING' : 'CREATED',
      expiresAt: placed.expiresAt,
    },
  });

  return {
    id: session.id,
    status: session.status.toLowerCase(),
    virtualNumber: formatVirtualNumber(number.e164),
    partyA: maskParty(session.partyA),
    partyB: maskParty(session.partyB),
    createdAt: session.createdAt.toISOString(),
    expiresAt: session.expiresAt?.toISOString() ?? null,
  };
}
