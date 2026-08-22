import { getPrismaClient } from '../../infrastructure/prisma/client';
import { InternalServerError, NotFoundError, ValidationError } from '../../shared/errors/AppError';
import { formatVirtualNumber, monthlyPrice, VOICE_CATALOG } from './voice.catalog';
import { getTelephonyProvider } from '../../infrastructure/telephony';
import type {
  ActivateNumberInput,
  ListInventoryQuery,
  UpdateVirtualNumberInput,
} from './voice.schemas';

function prisma() {
  const client = getPrismaClient();
  if (!client) {
    throw new InternalServerError('Database not configured', 'DATABASE_NOT_CONFIGURED');
  }
  return client;
}

export type VirtualNumberDto = {
  id: string;
  e164: string;
  displayNumber: string;
  countryCode: string;
  countryName: string;
  locality: string;
  status: 'active' | 'inactive';
  incomingEnabled: boolean;
  outgoingEnabled: boolean;
  destinationE164: string | null;
  assignedApplication: string | null;
  webhookUrl: string | null;
  maskingEnabled: boolean;
  inboundCount: number;
  outboundCount: number;
  minutesUsed: number;
  createdAt: string;
};

export type InventoryNumberDto = {
  id: string;
  e164: string;
  displayNumber: string;
  countryCode: string;
  countryName: string;
  locality: string;
  monthlyFeeUsd: number;
  price: { currency: 'INR' | 'USD'; amount: number; display: string };
  capabilities: { voice: true; incoming: true; outgoing: true; masking: true };
};

function toNumberDto(row: {
  id: string;
  e164: string;
  countryCode: string;
  countryName: string;
  locality: string;
  status: 'ACTIVE' | 'INACTIVE';
  incomingEnabled: boolean;
  outgoingEnabled: boolean;
  destinationE164: string | null;
  assignedApplication: string | null;
  webhookUrl: string | null;
  maskingEnabled: boolean;
  inboundCount: number;
  outboundCount: number;
  minutesUsed: number;
  createdAt: Date;
}): VirtualNumberDto {
  return {
    id: row.id,
    e164: row.e164,
    displayNumber: formatVirtualNumber(row.e164),
    countryCode: row.countryCode,
    countryName: row.countryName,
    locality: row.locality,
    status: row.status === 'ACTIVE' ? 'active' : 'inactive',
    incomingEnabled: row.incomingEnabled,
    outgoingEnabled: row.outgoingEnabled,
    destinationE164: row.destinationE164,
    assignedApplication: row.assignedApplication,
    webhookUrl: row.webhookUrl,
    maskingEnabled: row.maskingEnabled,
    inboundCount: row.inboundCount,
    outboundCount: row.outboundCount,
    minutesUsed: row.minutesUsed,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function ensureVoiceInventory(): Promise<void> {
  const db = prisma();
  for (const item of VOICE_CATALOG) {
    await db.virtualNumberInventory.upsert({
      where: { e164: item.e164 },
      create: {
        countryCode: item.countryCode,
        countryName: item.countryName,
        e164: item.e164,
        locality: item.locality,
        monthlyFeeUsd: item.monthlyFeeUsd,
      },
      update: {
        countryName: item.countryName,
        locality: item.locality,
        monthlyFeeUsd: item.monthlyFeeUsd,
      },
    });
  }
}

export async function listInventory(query: ListInventoryQuery): Promise<{
  countries: { code: string; name: string }[];
  numbers: InventoryNumberDto[];
}> {
  await ensureVoiceInventory();
  const adapterNumbers = await getTelephonyProvider().getAvailableNumbers({ country: query.country });
  const db = prisma();
  const allocated = await db.virtualNumberInventory.findMany({
    where: { allocated: true },
    select: { e164: true },
  });
  const taken = new Set(allocated.map((row) => row.e164));
  const search = query.search?.replace(/\D/g, '');

  const numbers: InventoryNumberDto[] = [];
  for (const item of adapterNumbers) {
    if (taken.has(item.e164)) continue;
    if (search && !item.e164.includes(search)) continue;
    const inventory = await db.virtualNumberInventory.upsert({
      where: { e164: item.e164 },
      create: {
        countryCode: item.countryCode,
        countryName: item.countryName,
        e164: item.e164,
        locality: item.locality,
        monthlyFeeUsd: item.monthlyFeeUsd,
      },
      update: {
        countryName: item.countryName,
        locality: item.locality,
        monthlyFeeUsd: item.monthlyFeeUsd,
      },
    });
    numbers.push({
      id: inventory.id,
      e164: item.e164,
      displayNumber: formatVirtualNumber(item.e164),
      countryCode: item.countryCode,
      countryName: item.countryName,
      locality: item.locality,
      monthlyFeeUsd: item.monthlyFeeUsd,
      price: monthlyPrice(item.countryCode, item.monthlyFeeUsd),
      capabilities: { voice: true, incoming: true, outgoing: true, masking: true },
    });
  }

  const countriesMap = new Map<string, string>();
  for (const item of VOICE_CATALOG) {
    countriesMap.set(item.countryCode, item.countryName);
  }
  return {
    countries: [...countriesMap.entries()].map(([code, name]) => ({ code, name })),
    numbers,
  };
}

export async function listOrgNumbers(organizationId: string): Promise<VirtualNumberDto[]> {
  const rows = await prisma().virtualNumber.findMany({
    where: { organizationId },
    orderBy: { createdAt: 'desc' },
  });
  return rows.map(toNumberDto);
}

export async function getOrgNumber(
  organizationId: string,
  numberId: string,
): Promise<VirtualNumberDto> {
  const row = await prisma().virtualNumber.findFirst({
    where: { id: numberId, organizationId },
  });
  if (!row) {
    throw new NotFoundError('Virtual number not found', 'VIRTUAL_NUMBER_NOT_FOUND');
  }
  return toNumberDto(row);
}

export async function getActiveOutgoingNumber(organizationId: string, numberId?: string) {
  const db = prisma();
  const row = numberId
    ? await db.virtualNumber.findFirst({
        where: {
          id: numberId,
          organizationId,
          status: 'ACTIVE',
          outgoingEnabled: true,
        },
      })
    : await db.virtualNumber.findFirst({
        where: { organizationId, status: 'ACTIVE', outgoingEnabled: true },
        orderBy: { createdAt: 'asc' },
      });
  if (!row) {
    throw new ValidationError('Get a Trizen virtual number before placing calls');
  }
  return row;
}

export async function activateNumber(
  organizationId: string,
  input: ActivateNumberInput,
): Promise<VirtualNumberDto> {
  await ensureVoiceInventory();
  const db = prisma();
  const inventory = await db.virtualNumberInventory.findUnique({
    where: { id: input.inventoryId },
  });
  if (!inventory || inventory.allocated) {
    throw new ValidationError('That number is no longer available');
  }

  const provisioned = await getTelephonyProvider().provisionNumber(`mock:${inventory.e164}`);

  const created = await db.$transaction(async (tx) => {
    await tx.virtualNumberInventory.update({
      where: { id: inventory.id },
      data: { allocated: true },
    });
    return tx.virtualNumber.create({
      data: {
        organizationId,
        inventoryId: inventory.id,
        e164: provisioned.e164,
        countryCode: inventory.countryCode,
        countryName: inventory.countryName,
        locality: inventory.locality,
        assignedApplication: input.assignedApplication?.trim() || 'Website',
        providerNumberId: provisioned.providerNumberId,
        maskingEnabled: true,
      },
    });
  });

  return toNumberDto(created);
}

export async function updateOrgNumber(
  organizationId: string,
  numberId: string,
  input: UpdateVirtualNumberInput,
): Promise<VirtualNumberDto> {
  await getOrgNumber(organizationId, numberId);
  const updated = await prisma().virtualNumber.update({
    where: { id: numberId },
    data: {
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.incomingEnabled !== undefined ? { incomingEnabled: input.incomingEnabled } : {}),
      ...(input.outgoingEnabled !== undefined ? { outgoingEnabled: input.outgoingEnabled } : {}),
      ...(input.destinationE164 !== undefined ? { destinationE164: input.destinationE164 } : {}),
      ...(input.assignedApplication !== undefined
        ? { assignedApplication: input.assignedApplication }
        : {}),
      ...(input.webhookUrl !== undefined ? { webhookUrl: input.webhookUrl } : {}),
      ...(input.maskingEnabled !== undefined ? { maskingEnabled: input.maskingEnabled } : {}),
    },
  });
  if (updated.providerNumberId) {
    await getTelephonyProvider().configureNumber(updated.providerNumberId, {
      incomingEnabled: updated.incomingEnabled,
      outgoingEnabled: updated.outgoingEnabled,
      destinationE164: updated.destinationE164,
      webhookUrl: updated.webhookUrl,
      maskingEnabled: updated.maskingEnabled,
    });
  }
  return toNumberDto(updated);
}


export async function incrementNumberUsage(input: {
  virtualNumberId: string;
  direction: 'INCOMING' | 'OUTGOING';
  minutes?: number;
  count?: boolean;
}): Promise<void> {
  const count = input.count !== false;
  await prisma().virtualNumber.update({
    where: { id: input.virtualNumberId },
    data: {
      ...(count && input.direction === 'OUTGOING' ? { outboundCount: { increment: 1 } } : {}),
      ...(count && input.direction === 'INCOMING' ? { inboundCount: { increment: 1 } } : {}),
      ...(input.minutes ? { minutesUsed: { increment: input.minutes } } : {}),
    },
  });
}
