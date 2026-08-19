import { Router } from 'express';
import { asyncHandler } from '../../middleware/errorHandler';
import { platformAdminAuth } from '../../middleware/platformAdminAuth';
import { requirePlatformAdmin } from '../../middleware/requireRole';
import { validate } from '../../middleware/validate';
import {
  createOrganizationSchema,
  listOrganizationsQuerySchema,
  platformLoginSchema,
  updateOrganizationStatusSchema,
} from './platformAdmin.schemas';
import {
  createOrganizationHandler,
  getOrganizationHandler,
  listOrganizationsHandler,
  platformLoginHandler,
  platformMeHandler,
  updateOrganizationStatusHandler,
} from './platformAdmin.handlers';

export function createPlatformAdminRouter(): Router {
  const router = Router();

  router.post('/auth/login', validate(platformLoginSchema), asyncHandler(platformLoginHandler));

  router.use(platformAdminAuth, requirePlatformAdmin);

  router.get('/auth/me', asyncHandler(platformMeHandler));

  router.get(
    '/organizations',
    validate(listOrganizationsQuerySchema, 'query'),
    asyncHandler(listOrganizationsHandler),
  );
  router.post(
    '/organizations',
    validate(createOrganizationSchema),
    asyncHandler(createOrganizationHandler),
  );
  router.get('/organizations/:id', asyncHandler(getOrganizationHandler));
  router.patch(
    '/organizations/:id',
    validate(updateOrganizationStatusSchema),
    asyncHandler(updateOrganizationStatusHandler),
  );

  return router;
}
