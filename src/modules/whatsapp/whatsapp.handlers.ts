import { Request, Response } from 'express';
import { AppResponse } from '../../shared/responses/AppResponse';
import { getValidated } from '../../middleware/validate';
import type { CreateWhatsAppAccountInput } from './whatsapp.schemas';
import {
  connectWhatsAppAccount,
  getOrganizationWhatsAppAccount,
  listAccountPhoneNumbers,
  listOrganizationWhatsAppAccounts,
  setAccountDefaultPhoneNumber,
  syncWhatsAppAccountPhones,
} from './whatsapp.service';

function requireJwtContext(req: Request): {
  userId: string;
  organizationId: string;
} {
  const auth = req.auth;
  if (!auth || auth.type !== 'jwt') {
    throw new Error('JWT context missing after auth middleware');
  }
  return { userId: auth.userId, organizationId: auth.organizationId };
}

export async function connectAccountHandler(req: Request, res: Response): Promise<void> {
  const { userId, organizationId } = requireJwtContext(req);
  const body = getValidated<CreateWhatsAppAccountInput>(req, 'body');
  const result = await connectWhatsAppAccount(organizationId, userId, body);
  AppResponse.created(res, 'WhatsApp account connected', result);
}

export async function listAccountsHandler(req: Request, res: Response): Promise<void> {
  const { organizationId } = requireJwtContext(req);
  const accounts = await listOrganizationWhatsAppAccounts(organizationId);
  AppResponse.success(res, 'WhatsApp accounts retrieved', accounts);
}

export async function getAccountHandler(req: Request, res: Response): Promise<void> {
  const { organizationId } = requireJwtContext(req);
  const account = await getOrganizationWhatsAppAccount(organizationId, req.params.id);
  AppResponse.success(res, 'WhatsApp account retrieved', account);
}

export async function syncAccountHandler(req: Request, res: Response): Promise<void> {
  const { userId, organizationId } = requireJwtContext(req);
  const result = await syncWhatsAppAccountPhones(organizationId, req.params.id, userId);
  AppResponse.success(res, 'Phone numbers synced from Meta', result);
}

export async function listPhoneNumbersHandler(req: Request, res: Response): Promise<void> {
  const { organizationId } = requireJwtContext(req);
  const phones = await listAccountPhoneNumbers(organizationId, req.params.accountId);
  AppResponse.success(res, 'Phone numbers retrieved', phones);
}

export async function setDefaultPhoneHandler(req: Request, res: Response): Promise<void> {
  const { userId, organizationId } = requireJwtContext(req);
  const phone = await setAccountDefaultPhoneNumber(
    organizationId,
    req.params.accountId,
    req.params.phoneId,
    userId,
  );
  AppResponse.updated(res, 'Default phone number updated', phone);
}
