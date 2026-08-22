import { Request, Response } from 'express';
import { AppResponse } from '../../shared/responses/AppResponse';
import { getValidated } from '../../middleware/validate';
import { initiateCall } from '../calling/calling.service';
import { createMaskingSession } from './masking.service';
import type {
  ActivateNumberInput,
  ListInventoryQuery,
  MaskingSessionInput,
  UpdateVirtualNumberInput,
  VoiceCallInput,
} from './voice.schemas';
import {
  activateNumber,
  getOrgNumber,
  listInventory,
  listOrgNumbers,
  updateOrgNumber,
} from './voice.service';

function requireOrg(req: Request): { organizationId: string; userId?: string } {
  const auth = req.auth;
  if (!auth || auth.type === 'platformAdmin') {
    throw new Error('Organization auth context missing');
  }
  return {
    organizationId: auth.organizationId,
    userId: auth.type === 'jwt' ? auth.userId : undefined,
  };
}

export async function listInventoryHandler(req: Request, res: Response): Promise<void> {
  const query = getValidated<ListInventoryQuery>(req, 'query');
  const data = await listInventory(query);
  AppResponse.success(res, 'Available numbers retrieved', data);
}

export async function listNumbersHandler(req: Request, res: Response): Promise<void> {
  const { organizationId } = requireOrg(req);
  const items = await listOrgNumbers(organizationId);
  AppResponse.success(res, 'Virtual numbers retrieved', items);
}

export async function getNumberHandler(req: Request, res: Response): Promise<void> {
  const { organizationId } = requireOrg(req);
  const number = await getOrgNumber(organizationId, req.params.id);
  AppResponse.success(res, 'Virtual number retrieved', number);
}

export async function activateNumberHandler(req: Request, res: Response): Promise<void> {
  const { organizationId } = requireOrg(req);
  const body = getValidated<ActivateNumberInput>(req, 'body');
  const number = await activateNumber(organizationId, body);
  AppResponse.created(res, 'Virtual number activated', number);
}

export async function updateNumberHandler(req: Request, res: Response): Promise<void> {
  const { organizationId } = requireOrg(req);
  const body = getValidated<UpdateVirtualNumberInput>(req, 'body');
  const number = await updateOrgNumber(organizationId, req.params.id, body);
  AppResponse.updated(res, 'Virtual number updated', number);
}

export async function voiceCallHandler(req: Request, res: Response): Promise<void> {
  const { organizationId, userId } = requireOrg(req);
  const body = getValidated<VoiceCallInput>(req, 'body');
  const call = await initiateCall(organizationId, userId, {
    phone: body.to,
    name: body.name,
    virtualNumberId: body.virtualNumberId,
  });
  AppResponse.success(res, 'Call started', call, undefined, 202);
}

export async function maskingSessionHandler(req: Request, res: Response): Promise<void> {
  const { organizationId } = requireOrg(req);
  const body = getValidated<MaskingSessionInput>(req, 'body');
  const session = await createMaskingSession(organizationId, body);
  AppResponse.created(res, 'Masking session created', session);
}
