import { Request, Response } from 'express';
import { AppResponse } from '../../shared/responses/AppResponse';
import { getValidated } from '../../middleware/validate';
import type {
  EndCallInput,
  InitiateCallInput,
  ListCallsQuery,
  UpdateCallingSettingsInput,
} from './calling.schemas';
import {
  endCall,
  getCall,
  getCallingContact,
  getCallingSettings,
  getConversation,
  initiateCall,
  listCallingContacts,
  listCallingNotifications,
  listCalls,
  updateCallingSettings,
} from './calling.service';

function requireJwt(req: Request): { organizationId: string; userId: string } {
  const auth = req.auth;
  if (!auth || auth.type !== 'jwt') {
    throw new Error('JWT context missing after auth middleware');
  }
  return { organizationId: auth.organizationId, userId: auth.userId };
}

export async function listCallsHandler(req: Request, res: Response): Promise<void> {
  const { organizationId } = requireJwt(req);
  const query = getValidated<ListCallsQuery>(req, 'query');
  const result = await listCalls(organizationId, query);
  AppResponse.paginated(res, 'Calls retrieved', result.items, {
    page: result.page,
    limit: result.limit,
    total: result.total,
    totalPages: Math.max(1, Math.ceil(result.total / result.limit)),
  });
}

export async function getCallHandler(req: Request, res: Response): Promise<void> {
  const { organizationId } = requireJwt(req);
  const call = await getCall(organizationId, req.params.id);
  AppResponse.success(res, 'Call retrieved', call);
}

export async function initiateCallHandler(req: Request, res: Response): Promise<void> {
  const { organizationId, userId } = requireJwt(req);
  const body = getValidated<InitiateCallInput>(req, 'body');
  const call = await initiateCall(organizationId, userId, body);
  AppResponse.success(res, 'Call started', call, undefined, 202);
}

export async function endCallHandler(req: Request, res: Response): Promise<void> {
  const { organizationId } = requireJwt(req);
  const body = getValidated<EndCallInput>(req, 'body');
  const call = await endCall(organizationId, req.params.id, body.status ?? 'CANCELLED');
  AppResponse.success(res, 'Call ended', call);
}

export async function listContactsHandler(req: Request, res: Response): Promise<void> {
  const { organizationId } = requireJwt(req);
  const items = await listCallingContacts(organizationId);
  AppResponse.success(res, 'Contacts retrieved', items);
}

export async function getContactHandler(req: Request, res: Response): Promise<void> {
  const { organizationId } = requireJwt(req);
  const contact = await getCallingContact(organizationId, req.params.contactId);
  AppResponse.success(res, 'Contact retrieved', contact);
}

export async function getConversationHandler(req: Request, res: Response): Promise<void> {
  const { organizationId } = requireJwt(req);
  const data = await getConversation(organizationId, req.params.contactId);
  AppResponse.success(res, 'Conversation retrieved', data);
}

export async function listNotificationsHandler(req: Request, res: Response): Promise<void> {
  const { organizationId } = requireJwt(req);
  const items = await listCallingNotifications(organizationId);
  AppResponse.success(res, 'Notifications retrieved', items);
}

export async function getSettingsHandler(req: Request, res: Response): Promise<void> {
  const { organizationId } = requireJwt(req);
  const settings = await getCallingSettings(organizationId);
  AppResponse.success(res, 'Calling settings retrieved', settings);
}

export async function updateSettingsHandler(req: Request, res: Response): Promise<void> {
  const { organizationId } = requireJwt(req);
  const body = getValidated<UpdateCallingSettingsInput>(req, 'body');
  const settings = await updateCallingSettings(organizationId, body);
  AppResponse.updated(res, 'Calling settings updated', settings);
}

