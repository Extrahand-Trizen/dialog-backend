import { CallRecordStatus, Prisma } from '@prisma/client';
import { getPrismaClient } from '../../infrastructure/prisma/client';
import { InternalServerError, NotFoundError, ValidationError } from '../../shared/errors/AppError';
import {
  avatarColorFromId,
  initialsFromName,
  maskPhone,
  normalizePhoneE164,
} from './calling.phone';
import {
  getActiveOutgoingNumber,
  incrementNumberUsage,
} from '../voice/voice.service';
import { dispatchCustomerCallWebhook } from '../voice/customerWebhook';
import { getTelephonyProvider } from '../../infrastructure/telephony';
import { formatVirtualNumber } from '../voice/voice.catalog';
import type {
  CallContactDto,
  CallRecordDto,
  CallingNotificationDto,
  CallingSettingsDto,
  ConversationTimelineItemDto,
  InitiateCallInput,
  ListCallsQuery,
  UpdateCallingSettingsInput,
} from './calling.schemas';

const PRIVACY_NOTE =
  'Your personal phone number stays private. Calls use a Trizen virtual number so both sides stay masked.';

function prisma() {
  const client = getPrismaClient();
  if (!client) {
    throw new InternalServerError('Database not configured', 'DATABASE_NOT_CONFIGURED');
  }
  return client;
}

function toUiStatus(status: CallRecordStatus): CallRecordDto['status'] {
  if (status === 'ACTIVE') return 'answered';
  if (status === 'REJECTED') return 'cancelled';
  if (status === 'NO_ANSWER') return 'no_answer';
  return status.toLowerCase() as CallRecordDto['status'];
}

function toContactDto(row: {
  id: string;
  name: string;
  phoneE164: string;
  company: string | null;
  email: string | null;
  avatarInitials: string;
  avatarColor: string;
  whatsappAvailable: boolean;
}): CallContactDto {
  return {
    id: row.id,
    name: row.name,
    phoneE164: row.phoneE164,
    maskedPhone: maskPhone(row.phoneE164),
    avatarInitials: row.avatarInitials,
    avatarColor: row.avatarColor,
    whatsappAvailable: row.whatsappAvailable,
    company: row.company,
    email: row.email,
  };
}

function toCallDto(row: {
  id: string;
  contactId: string;
  direction: 'OUTGOING' | 'INCOMING';
  status: CallRecordStatus;
  durationSeconds: number | null;
  startedAt: Date;
  endedAt: Date | null;
  virtualNumber: string;
  contact: Parameters<typeof toContactDto>[0];
}): CallRecordDto {
  return {
    id: row.id,
    contactId: row.contactId,
    direction: row.direction === 'INCOMING' ? 'incoming' : 'outgoing',
    status: toUiStatus(row.status),
    durationSeconds: row.durationSeconds,
    startedAt: row.startedAt.toISOString(),
    endedAt: row.endedAt?.toISOString() ?? null,
    virtualNumber: row.virtualNumber,
    maskingActive: true,
    contact: toContactDto(row.contact),
  };
}

async function ensureSettings(organizationId: string) {
  const db = prisma();
  return db.organizationCallingSettings.upsert({
    where: { organizationId },
    create: {
      organizationId,
      virtualNumber: '',
    },
    update: {},
  });
}

async function upsertContactFromPhone(input: {
  organizationId: string;
  phoneE164: string;
  name?: string;
}): Promise<CallContactDto> {
  const db = prisma();
  const existing = await db.callContact.findUnique({
    where: {
      organizationId_phoneE164: {
        organizationId: input.organizationId,
        phoneE164: input.phoneE164,
      },
    },
  });
  if (existing) {
    if (input.name && input.name !== existing.name) {
      const updated = await db.callContact.update({
        where: { id: existing.id },
        data: { name: input.name, avatarInitials: initialsFromName(input.name) },
      });
      return toContactDto(updated);
    }
    return toContactDto(existing);
  }

  const name = input.name?.trim() || `+${input.phoneE164}`;
  const created = await db.callContact.create({
    data: {
      organizationId: input.organizationId,
      name,
      phoneE164: input.phoneE164,
      avatarInitials: initialsFromName(name),
      avatarColor: avatarColorFromId(input.phoneE164),
      whatsappAvailable: true,
    },
  });
  return toContactDto(created);
}

async function syncContactsFromMessages(organizationId: string): Promise<void> {
  const db = prisma();
  const messages = await db.message.findMany({
    where: { organizationId, recipientPhone: { not: '' } },
    orderBy: { createdAt: 'desc' },
    take: 80,
    select: { recipientPhone: true },
  });
  const seen = new Set<string>();
  for (const message of messages) {
    const phone = normalizePhoneE164(message.recipientPhone);
    if (phone.length < 10 || seen.has(phone)) continue;
    seen.add(phone);
    await upsertContactFromPhone({ organizationId, phoneE164: phone });
  }
}

export async function listCallingContacts(organizationId: string): Promise<CallContactDto[]> {
  await syncContactsFromMessages(organizationId);
  const rows = await prisma().callContact.findMany({
    where: { organizationId },
    orderBy: { name: 'asc' },
    take: 200,
  });
  return rows.map(toContactDto);
}

export async function getCallingContact(
  organizationId: string,
  contactId: string,
): Promise<CallContactDto> {
  const row = await prisma().callContact.findFirst({
    where: { id: contactId, organizationId },
  });
  if (!row) {
    throw new NotFoundError('Contact not found', 'CALL_CONTACT_NOT_FOUND');
  }
  return toContactDto(row);
}

export async function listCalls(
  organizationId: string,
  query: ListCallsQuery,
): Promise<{ items: CallRecordDto[]; total: number; page: number; limit: number }> {
  const db = prisma();
  const where: Prisma.CallRecordWhereInput = { organizationId };
  if (query.contactId) where.contactId = query.contactId;
  if (query.filter === 'incoming') where.direction = 'INCOMING';
  if (query.filter === 'outgoing') where.direction = 'OUTGOING';
  if (query.filter === 'missed') where.status = 'MISSED';
  if (query.search) {
    where.contact = {
      OR: [
        { name: { contains: query.search, mode: 'insensitive' } },
        { phoneE164: { contains: query.search.replace(/\D/g, '') } },
      ],
    };
  }

  const [total, rows] = await Promise.all([
    db.callRecord.count({ where }),
    db.callRecord.findMany({
      where,
      include: { contact: true },
      orderBy: { startedAt: 'desc' },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
  ]);

  return {
    items: rows.map(toCallDto),
    total,
    page: query.page,
    limit: query.limit,
  };
}

export async function getCall(organizationId: string, callId: string): Promise<CallRecordDto> {
  const row = await prisma().callRecord.findFirst({
    where: { id: callId, organizationId },
    include: { contact: true },
  });
  if (!row) {
    throw new NotFoundError('Call not found', 'CALL_NOT_FOUND');
  }
  return toCallDto(row);
}

export async function getConversation(
  organizationId: string,
  contactId: string,
): Promise<{ contact: CallContactDto; items: ConversationTimelineItemDto[] }> {
  const contact = await getCallingContact(organizationId, contactId);
  const db = prisma();
  const [calls, messages] = await Promise.all([
    db.callRecord.findMany({
      where: { organizationId, contactId },
      orderBy: { startedAt: 'asc' },
    }),
    db.message.findMany({
      where: { organizationId, recipientPhone: { contains: contact.phoneE164.slice(-10) } },
      orderBy: { createdAt: 'asc' },
      take: 50,
    }),
  ]);

  const items: ConversationTimelineItemDto[] = [
    ...calls.map((call) => ({
      id: `call:${call.id}`,
      kind: 'call' as const,
      callId: call.id,
      direction: call.direction === 'INCOMING' ? ('incoming' as const) : ('outgoing' as const),
      status: toUiStatus(call.status),
      durationSeconds: call.durationSeconds,
      at: call.startedAt.toISOString(),
    })),
    ...messages.map((message) => ({
      id: `msg:${message.id}`,
      kind: 'message' as const,
      direction: message.direction === 'INBOUND' ? ('inbound' as const) : ('outbound' as const),
      body: message.bodyText || message.metaTemplateName || 'WhatsApp message',
      at: message.createdAt.toISOString(),
    })),
  ].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());

  return { contact, items };
}

export async function listCallingNotifications(
  organizationId: string,
): Promise<CallingNotificationDto[]> {
  const rows = await prisma().callNotification.findMany({
    where: { organizationId },
    orderBy: { createdAt: 'desc' },
    take: 40,
  });
  return rows.map((row) => ({
    id: row.id,
    type: row.type as CallingNotificationDto['type'],
    contactId: row.contactId,
    title: row.title,
    body: row.body,
    at: row.createdAt.toISOString(),
    read: row.read,
  }));
}

export async function getCallingSettings(organizationId: string): Promise<CallingSettingsDto> {
  const settings = await ensureSettings(organizationId);
  const number = await prisma().virtualNumber.findFirst({
    where: { organizationId, status: 'ACTIVE' },
    orderBy: { createdAt: 'asc' },
  });
  return {
    providerName: 'Trizen Voice',
    providerStatus: number ? 'connected' : 'disconnected',
    virtualNumber: number ? formatVirtualNumber(number.e164) : 'No number activated',
    callerIdDisplay: settings.callerIdDisplay,
    recordCalls: settings.recordCalls,
    announceMaskedCalling: settings.announceMaskedCalling,
    businessHoursOnly: settings.businessHoursOnly,
    privacyNote: PRIVACY_NOTE,
  };
}

export async function updateCallingSettings(
  organizationId: string,
  input: UpdateCallingSettingsInput,
): Promise<CallingSettingsDto> {
  await ensureSettings(organizationId);
  await prisma().organizationCallingSettings.update({
    where: { organizationId },
    data: {
      ...(input.virtualNumber !== undefined ? { virtualNumber: input.virtualNumber } : {}),
      ...(input.callerIdDisplay !== undefined ? { callerIdDisplay: input.callerIdDisplay } : {}),
      ...(input.recordCalls !== undefined ? { recordCalls: input.recordCalls } : {}),
      ...(input.announceMaskedCalling !== undefined
        ? { announceMaskedCalling: input.announceMaskedCalling }
        : {}),
      ...(input.businessHoursOnly !== undefined
        ? { businessHoursOnly: input.businessHoursOnly }
        : {}),
    },
  });
  return getCallingSettings(organizationId);
}

async function createNotification(input: {
  organizationId: string;
  contactId: string;
  callId?: string;
  type: CallingNotificationDto['type'];
  title: string;
  body: string;
}): Promise<void> {
  await prisma().callNotification.create({
    data: {
      organizationId: input.organizationId,
      contactId: input.contactId,
      callId: input.callId,
      type: input.type,
      title: input.title,
      body: input.body,
    },
  });
}

export async function initiateCall(
  organizationId: string,
  userId: string | undefined,
  input: InitiateCallInput,
): Promise<CallRecordDto> {
  const settings = await ensureSettings(organizationId);
  const voiceNumber = await getActiveOutgoingNumber(organizationId, input.virtualNumberId);
  let contact: CallContactDto;
  if (input.contactId) {
    contact = await getCallingContact(organizationId, input.contactId);
  } else {
    contact = await upsertContactFromPhone({
      organizationId,
      phoneE164: normalizePhoneE164(input.phone!),
      name: input.name,
    });
  }

  const created = await prisma().callRecord.create({
    data: {
      organizationId,
      contactId: contact.id,
      createdByUserId: userId,
      direction: 'OUTGOING',
      status: 'QUEUED',
      virtualNumber: formatVirtualNumber(voiceNumber.e164),
      virtualNumberId: voiceNumber.id,
      provider: 'TRIZEN',
      callerE164: voiceNumber.e164,
      receiverE164: contact.phoneE164,
    },
    include: { contact: true },
  });

  const placed = await getTelephonyProvider().initiateCall({
    fromE164: voiceNumber.e164,
    toE164: contact.phoneE164,
    virtualNumberId: voiceNumber.id,
    record: settings.recordCalls,
  });

  const ringing = await prisma().callRecord.update({
    where: { id: created.id },
    data: {
      status: placed.status === 'QUEUED' ? 'QUEUED' : 'RINGING',
      providerCallId: placed.providerCallId,
      providerReference: placed.providerReference,
    },
    include: { contact: true },
  });

  await incrementNumberUsage({ virtualNumberId: voiceNumber.id, direction: 'OUTGOING' });
  void dispatchCustomerCallWebhook(voiceNumber.id, {
    event: 'call.initiated',
    callId: created.id,
    virtualNumber: formatVirtualNumber(voiceNumber.e164),
    direction: 'outgoing',
    status: toUiStatus(ringing.status),
  });
  void dispatchCustomerCallWebhook(voiceNumber.id, {
    event: 'call.ringing',
    callId: created.id,
    virtualNumber: formatVirtualNumber(voiceNumber.e164),
    direction: 'outgoing',
    status: 'ringing',
  });

  return toCallDto(ringing);
}

export async function endCall(
  organizationId: string,
  callId: string,
  status: 'COMPLETED' | 'MISSED' | 'REJECTED' | 'FAILED' | 'CANCELLED' | 'BUSY' | 'NO_ANSWER' = 'COMPLETED',
): Promise<CallRecordDto> {
  const existing = await prisma().callRecord.findFirst({
    where: { id: callId, organizationId },
    include: { contact: true },
  });
  if (!existing) {
    throw new NotFoundError('Call not found', 'CALL_NOT_FOUND');
  }
  if (
    ['COMPLETED', 'MISSED', 'REJECTED', 'FAILED', 'BUSY', 'NO_ANSWER', 'CANCELLED'].includes(
      existing.status,
    )
  ) {
    return toCallDto(existing);
  }

  if (existing.providerCallId) {
    await getTelephonyProvider().endCall(existing.providerCallId);
  }

  const now = new Date();
  const wasAnswered = existing.status === 'ACTIVE' && Boolean(existing.answeredAt);
  const durationSeconds =
    wasAnswered && status === 'COMPLETED'
      ? Math.max(1, Math.round((now.getTime() - (existing.answeredAt ?? existing.startedAt).getTime()) / 1000))
      : null;

  const resolvedStatus: CallRecordStatus =
    !wasAnswered && (status === 'COMPLETED' || status === 'REJECTED')
      ? 'CANCELLED'
      : status === 'REJECTED'
        ? 'CANCELLED'
        : status;

  const updated = await prisma().callRecord.update({
    where: { id: callId },
    data: {
      status: resolvedStatus,
      durationSeconds,
      endedAt: now,
    },
    include: { contact: true },
  });

  await createNotification({
    organizationId,
    contactId: updated.contactId,
    callId: updated.id,
    type: resolvedStatus === 'COMPLETED' ? 'completed_call' : 'missed_call',
    title: resolvedStatus === 'COMPLETED' ? 'Call completed' : 'Call ended',
    body: `${updated.contact.name} · ${toUiStatus(resolvedStatus)}`,
  });

  if (updated.virtualNumberId && durationSeconds) {
    await incrementNumberUsage({
      virtualNumberId: updated.virtualNumberId,
      direction: updated.direction,
      minutes: Math.max(1, Math.round(durationSeconds / 60)),
      count: false,
    });
  }

  const event =
    resolvedStatus === 'COMPLETED'
      ? 'call.completed'
      : resolvedStatus === 'BUSY'
        ? 'call.busy'
        : resolvedStatus === 'NO_ANSWER'
          ? 'call.no_answer'
          : resolvedStatus === 'FAILED'
            ? 'call.failed'
            : 'call.ended';

  void dispatchCustomerCallWebhook(updated.virtualNumberId, {
    event,
    callId: updated.id,
    virtualNumber: updated.virtualNumber,
    direction: updated.direction === 'INCOMING' ? 'incoming' : 'outgoing',
    status: toUiStatus(resolvedStatus),
    durationSeconds,
  });

  return toCallDto(updated);
}

export async function applyProviderCallEvent(input: {
  providerCallId: string;
  status?: CallRecordStatus;
  durationSeconds?: number | null;
  recordingReference?: string | null;
  event: string;
}): Promise<void> {
  const existing = await prisma().callRecord.findFirst({
    where: { providerCallId: input.providerCallId },
  });
  if (!existing) return;

  const statusMap: Record<string, CallRecordStatus> = {
    'call.ringing': 'RINGING',
    'call.answered': 'ACTIVE',
    'call.completed': 'COMPLETED',
    'call.failed': 'FAILED',
    'call.busy': 'BUSY',
    'call.no_answer': 'NO_ANSWER',
    'call.ended': 'CANCELLED',
  };
  const status = input.status ?? statusMap[input.event];
  if (!status) return;

  const answeredAt = status === 'ACTIVE' ? existing.answeredAt ?? new Date() : existing.answeredAt;
  const ended =
    ['COMPLETED', 'FAILED', 'BUSY', 'NO_ANSWER', 'CANCELLED', 'MISSED'].includes(status);
  const durationSeconds =
    status === 'COMPLETED' && input.durationSeconds != null ? input.durationSeconds : existing.durationSeconds;

  await prisma().callRecord.update({
    where: { id: existing.id },
    data: {
      status,
      answeredAt,
      endedAt: ended ? new Date() : existing.endedAt,
      durationSeconds,
      recordingReference: input.recordingReference ?? existing.recordingReference,
    },
  });

  if (existing.virtualNumberId && durationSeconds && status === 'COMPLETED' && !existing.durationSeconds) {
    await incrementNumberUsage({
      virtualNumberId: existing.virtualNumberId,
      direction: existing.direction,
      minutes: Math.max(1, Math.round(durationSeconds / 60)),
      count: false,
    });
  }

  void dispatchCustomerCallWebhook(existing.virtualNumberId, {
    event: input.event,
    callId: existing.id,
    virtualNumber: existing.virtualNumber,
    direction: existing.direction === 'INCOMING' ? 'incoming' : 'outgoing',
    status: toUiStatus(status),
    durationSeconds,
  });
}


