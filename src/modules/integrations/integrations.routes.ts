import { Router } from 'express';
import { asyncHandler } from '../../middleware/errorHandler';
import { serviceAuth } from '../../middleware/serviceAuth';
import { requireServiceOrganization } from '../../middleware/requireServiceOrganization';
import { validate } from '../../middleware/validate';
import { internalNotificationTriggerSchema } from './integrations.schemas';
import { internalNotificationTriggerHandler } from './integrations.handlers';

export function createIntegrationsRouter(): Router {
  const router = Router();

  router.use(serviceAuth);

  router.post(
    '/notifications/trigger',
    requireServiceOrganization,
    validate(internalNotificationTriggerSchema),
    asyncHandler(internalNotificationTriggerHandler),
  );

  return router;
}
