import { Request, Response } from 'express';
import { AppResponse } from '../../shared/responses/AppResponse';
import { getValidated } from '../../middleware/validate';
import type { IngestEventInput } from './notifications.schemas';
import { ingestOrganizationEvent } from './notifications.service';

function requireApiKeyContext(req: Request): {
  apiKeyId: string;
  organizationId: string;
  correlationId: string;
} {
  const auth = req.auth;
  if (!auth || auth.type !== 'apiKey') {
    throw new Error('API key context missing after auth middleware');
  }

  return {
    apiKeyId: auth.apiKeyId,
    organizationId: auth.organizationId,
    correlationId: req.correlationId ?? auth.apiKeyId,
  };
}

export async function ingestEventHandler(req: Request, res: Response): Promise<void> {
  const { apiKeyId, organizationId, correlationId } = requireApiKeyContext(req);
  const body = getValidated<IngestEventInput>(req, 'body');

  const result = await ingestOrganizationEvent({
    organizationId,
    apiKeyId,
    correlationId,
    body,
  });

  const statusCode = result.duplicate ? 200 : 202;
  const message = result.duplicate ? 'Event already ingested' : 'Event accepted for processing';

  AppResponse.success(res, message, result, undefined, statusCode);
}
