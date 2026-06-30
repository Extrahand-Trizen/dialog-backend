import { Request, Response } from 'express';
import { AppResponse } from '../../shared/responses/AppResponse';
import { getValidated } from '../../middleware/validate';
import type { CreateApiKeyInput } from './apiKeys.schemas';
import { createApiKey, listApiKeys, revokeOrganizationApiKey } from './apiKeys.service';

export async function createApiKeyHandler(req: Request, res: Response): Promise<void> {
  const auth = req.auth;
  if (!auth || auth.type !== 'jwt') {
    throw new Error('JWT context missing after auth middleware');
  }

  const body = getValidated<CreateApiKeyInput>(req, 'body');
  const result = await createApiKey(auth.organizationId, auth.userId, body);
  AppResponse.created(res, 'API key created', result);
}

export async function listApiKeysHandler(req: Request, res: Response): Promise<void> {
  const auth = req.auth;
  if (!auth || auth.type !== 'jwt') {
    throw new Error('JWT context missing after auth middleware');
  }

  const keys = await listApiKeys(auth.organizationId);
  AppResponse.success(res, 'API keys retrieved', keys);
}

export async function revokeApiKeyHandler(req: Request, res: Response): Promise<void> {
  const auth = req.auth;
  if (!auth || auth.type !== 'jwt') {
    throw new Error('JWT context missing after auth middleware');
  }

  const apiKeyId = req.params.id;
  const revoked = await revokeOrganizationApiKey(auth.organizationId, apiKeyId, auth.userId);
  AppResponse.success(res, 'API key revoked', revoked);
}
