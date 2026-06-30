import { randomUUID } from 'crypto';
import { Request, Response } from 'express';
import { AppResponse } from '../../shared/responses/AppResponse';
import { getValidated } from '../../middleware/validate';
import type { InternalNotificationTriggerInput } from './integrations.schemas';
import { triggerInternalNotification } from './integrations.service';

const CORRELATION_HEADER = 'x-correlation-id';
const SERVICE_NAME_HEADER = 'x-service-name';

function requireServiceOrganizationId(req: Request): string {
  const organizationId = req.serviceOrganizationId;
  if (!organizationId) {
    throw new Error('Service organization context missing after middleware');
  }
  return organizationId;
}

export async function internalNotificationTriggerHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const organizationId = requireServiceOrganizationId(req);
  const body = getValidated<InternalNotificationTriggerInput>(req, 'body');
  const correlationId =
    (typeof req.headers[CORRELATION_HEADER] === 'string' &&
    req.headers[CORRELATION_HEADER].trim().length > 0
      ? req.headers[CORRELATION_HEADER].trim()
      : undefined) ?? req.correlationId ?? randomUUID();

  const result = await triggerInternalNotification({
    organizationId,
    correlationId,
    body,
  });

  const statusCode = result.duplicate ? 200 : 202;
  const message = result.duplicate
    ? 'Notification already triggered'
    : 'Notification accepted for processing';

  AppResponse.success(
    res,
    message,
    {
      ...result,
      serviceName:
        typeof req.headers[SERVICE_NAME_HEADER] === 'string'
          ? req.headers[SERVICE_NAME_HEADER]
          : undefined,
    },
    undefined,
    statusCode,
  );
}
