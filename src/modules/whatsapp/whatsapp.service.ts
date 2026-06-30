import { decryptField, encryptField, isEncryptionConfigured } from '../../infrastructure/encryption/fieldCrypto';
import { getMetaWhatsAppClient } from '../../infrastructure/meta';
import {
  InternalServerError,
  NotFoundError,
} from '../../shared/errors/AppError';
import type {
  ConnectWhatsAppAccountResultDto,
  CreateWhatsAppAccountInput,
  PhoneNumberDto,
  WhatsAppAccountDto,
} from './whatsapp.schemas';
import { mapMetaPhoneNode } from './whatsapp.meta';
import {
  ensureDefaultPhoneNumber,
  findWhatsAppAccountById,
  findWhatsAppAccountSecrets,
  insertWhatsAppAccount,
  listPhoneNumbersByAccount,
  listWhatsAppAccountsByOrganization,
  setDefaultPhoneNumber,
  findPhoneNumberInOrganization,
  findDefaultPhoneForOrganization,
  updateWhatsAppAccountAfterSync,
  upsertPhoneNumberFromMeta,
} from './whatsapp.repository';

async function syncPhoneNumbersForAccount(
  organizationId: string,
  accountId: string,
  userId: string,
): Promise<PhoneNumberDto[]> {
  const secrets = await findWhatsAppAccountSecrets(organizationId, accountId);
  if (!secrets) {
    throw new NotFoundError('WhatsApp account not found', 'WHATSAPP_ACCOUNT_NOT_FOUND');
  }

  const accessToken = decryptField(secrets.accessTokenEnc);
  const metaClient = getMetaWhatsAppClient();

  try {
    const response = await metaClient.listPhoneNumbers(secrets.account.metaWabaId, accessToken);
    const synced: PhoneNumberDto[] = [];

    for (const node of response.data) {
      const mapped = mapMetaPhoneNode(node);
      if (!mapped.displayNumber) {
        continue;
      }

      const phone = await upsertPhoneNumberFromMeta({
        whatsAppAccountId: accountId,
        ...mapped,
        updatedById: userId,
      });
      synced.push(phone);
    }

    await ensureDefaultPhoneNumber(accountId, userId);
    await updateWhatsAppAccountAfterSync({
      accountId,
      status: 'ACTIVE',
      lastError: null,
      updatedById: userId,
    });

    return synced;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Meta sync failed';
    await updateWhatsAppAccountAfterSync({
      accountId,
      status: 'ERROR',
      lastError: message,
      updatedById: userId,
    });
    throw error;
  }
}

export async function connectWhatsAppAccount(
  organizationId: string,
  userId: string,
  input: CreateWhatsAppAccountInput,
): Promise<ConnectWhatsAppAccountResultDto> {
  if (!isEncryptionConfigured()) {
    throw new InternalServerError('Encryption not configured', 'ENCRYPTION_KEY_MISSING');
  }

  const metaClient = getMetaWhatsAppClient();
  const waba = await metaClient.getWaba(input.metaWabaId, input.accessToken);

  const account = await insertWhatsAppAccount({
    organizationId,
    metaWabaId: input.metaWabaId,
    name: input.name ?? waba.name,
    accessTokenEnc: encryptField(input.accessToken),
    appSecretEnc: encryptField(input.appSecret),
    webhookVerifyToken: input.webhookVerifyToken,
    createdById: userId,
  });

  let phoneNumbers: PhoneNumberDto[] = [];
  if (input.syncPhones) {
    phoneNumbers = await syncPhoneNumbersForAccount(organizationId, account.id, userId);
    const refreshed = await findWhatsAppAccountById(organizationId, account.id);
    return {
      account: refreshed ?? account,
      phoneNumbers,
    };
  }

  return { account, phoneNumbers };
}

export async function listOrganizationWhatsAppAccounts(
  organizationId: string,
): Promise<WhatsAppAccountDto[]> {
  return listWhatsAppAccountsByOrganization(organizationId);
}

export async function getOrganizationWhatsAppAccount(
  organizationId: string,
  accountId: string,
): Promise<WhatsAppAccountDto> {
  const account = await findWhatsAppAccountById(organizationId, accountId);
  if (!account) {
    throw new NotFoundError('WhatsApp account not found', 'WHATSAPP_ACCOUNT_NOT_FOUND');
  }
  return account;
}

export async function syncWhatsAppAccountPhones(
  organizationId: string,
  accountId: string,
  userId: string,
): Promise<{ account: WhatsAppAccountDto; phoneNumbers: PhoneNumberDto[] }> {
  const phoneNumbers = await syncPhoneNumbersForAccount(organizationId, accountId, userId);
  const account = await getOrganizationWhatsAppAccount(organizationId, accountId);
  return { account, phoneNumbers };
}

export async function listAccountPhoneNumbers(
  organizationId: string,
  accountId: string,
): Promise<PhoneNumberDto[]> {
  return listPhoneNumbersByAccount(organizationId, accountId);
}

export async function setAccountDefaultPhoneNumber(
  organizationId: string,
  accountId: string,
  phoneNumberId: string,
  userId: string,
): Promise<PhoneNumberDto> {
  return setDefaultPhoneNumber({
    organizationId,
    accountId,
    phoneNumberId,
    updatedById: userId,
  });
}

export async function resolvePhoneForNotification(
  organizationId: string,
  phoneNumberId?: string | null,
): Promise<PhoneNumberDto | null> {
  if (phoneNumberId) {
    return findPhoneNumberInOrganization(organizationId, phoneNumberId);
  }
  return findDefaultPhoneForOrganization(organizationId);
}
