import { decryptField, encryptField, isEncryptionConfigured } from '../../infrastructure/encryption/fieldCrypto';
import { getMetaWhatsAppClient, getMetaWebhookSubscribeOptions } from '../../infrastructure/meta';
import logger from '../../infrastructure/logging/logger';
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
  countMessagesForAccount,
  deleteWhatsAppAccount,
  ensureDefaultPhoneNumber,
  findDisconnectedWhatsAppAccountByMetaWabaId,
  findWhatsAppAccountById,
  findWhatsAppAccountSecrets,
  insertWhatsAppAccount,
  listPhoneNumbersByAccount,
  listWhatsAppAccountsByOrganization,
  markWhatsAppAccountDisconnected,
  reactivateWhatsAppAccount,
  setDefaultPhoneNumber,
  findPhoneNumberInOrganization,
  findDefaultPhoneForOrganization,
  updateWhatsAppAccountAfterSync,
  upsertPhoneNumberFromMeta,
} from './whatsapp.repository';
import { softDeleteTemplatesForWhatsAppAccount } from '../templates/templates.repository';

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
        organizationId,
        whatsAppAccountId: accountId,
        ...mapped,
        updatedById: userId,
      });
      synced.push(phone);
    }

    await ensureDefaultPhoneNumber(organizationId, accountId, userId);
    await updateWhatsAppAccountAfterSync({
      organizationId,
      accountId,
      status: 'ACTIVE',
      lastError: null,
      updatedById: userId,
    });

    return synced;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Meta sync failed';
    await updateWhatsAppAccountAfterSync({
      organizationId,
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

  const disconnected = await findDisconnectedWhatsAppAccountByMetaWabaId(
    organizationId,
    input.metaWabaId,
  );

  const account = disconnected
    ? await reactivateWhatsAppAccount({
        organizationId,
        accountId: disconnected.id,
        name: input.name ?? waba.name,
        accessTokenEnc: encryptField(input.accessToken),
        appSecretEnc: encryptField(input.appSecret),
        webhookVerifyToken: input.webhookVerifyToken,
        updatedById: userId,
      })
    : await insertWhatsAppAccount({
        organizationId,
        metaWabaId: input.metaWabaId,
        name: input.name ?? waba.name,
        accessTokenEnc: encryptField(input.accessToken),
        appSecretEnc: encryptField(input.appSecret),
        webhookVerifyToken: input.webhookVerifyToken,
        createdById: userId,
      });

  try {
    await metaClient.subscribeToWaba(
      input.metaWabaId,
      input.accessToken,
      getMetaWebhookSubscribeOptions(),
    );
  } catch (error) {
    // Best effort: the account is still fully usable without this — Meta just
    // won't deliver webhook events (status updates, template approvals) until
    // it succeeds. Don't fail the whole connect over it.
    logger.warn('Failed to subscribe app to WABA webhooks', {
      metaWabaId: input.metaWabaId,
      message: error instanceof Error ? error.message : String(error),
    });
  }

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
  const secrets = await findWhatsAppAccountSecrets(organizationId, accountId);
  if (secrets && isEncryptionConfigured()) {
    try {
      const accessToken = decryptField(secrets.accessTokenEnc);
      await getMetaWhatsAppClient().subscribeToWaba(
        secrets.account.metaWabaId,
        accessToken,
        getMetaWebhookSubscribeOptions(),
      );
    } catch (error) {
      logger.warn('Failed to re-subscribe app to WABA webhooks during phone sync', {
        accountId,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

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

export async function disconnectWhatsAppAccount(
  organizationId: string,
  accountId: string,
  userId: string,
): Promise<void> {
  const secrets = await findWhatsAppAccountSecrets(organizationId, accountId);
  if (!secrets) {
    throw new NotFoundError('WhatsApp account not found', 'WHATSAPP_ACCOUNT_NOT_FOUND');
  }

  if (isEncryptionConfigured()) {
    try {
      const accessToken = decryptField(secrets.accessTokenEnc);
      const metaClient = getMetaWhatsAppClient();
      await metaClient.unsubscribeFromWaba(secrets.account.metaWabaId, accessToken);
    } catch {
      // Best effort: local disconnect should still proceed if Meta unsubscribe fails
      // (e.g. token already revoked or app was never subscribed).
    }
  }

  await softDeleteTemplatesForWhatsAppAccount({
    organizationId,
    whatsAppAccountId: accountId,
    deletedById: userId,
  });

  const messageCount = await countMessagesForAccount(organizationId, accountId);
  if (messageCount > 0) {
    await markWhatsAppAccountDisconnected({
      organizationId,
      accountId,
      accessTokenEnc: encryptField(''),
      appSecretEnc: encryptField(''),
      updatedById: userId,
    });
    return;
  }

  await deleteWhatsAppAccount(organizationId, accountId);
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
