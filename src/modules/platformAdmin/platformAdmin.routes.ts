import { Router } from 'express';
import { asyncHandler } from '../../middleware/errorHandler';
import { platformAdminAuth } from '../../middleware/platformAdminAuth';
import { requirePlatformAdmin } from '../../middleware/requireRole';
import { validate } from '../../middleware/validate';
import {
  createOrganizationSchema,
  listOrganizationsQuerySchema,
  platformLoginSchema,
  updateOrganizationSchema,
  updateWhatsAppAccountNameSchema,
} from './platformAdmin.schemas';
import {
  createOrganizationHandler,
  deleteOrganizationWhatsAppAccountHandler,
  getOrganizationHandler,
  getOrganizationWhatsAppAccountHandler,
  listOrganizationsHandler,
  listOrganizationWhatsAppAccountsHandler,
  platformLoginHandler,
  platformMeHandler,
  updateOrganizationHandler,
  updateOrganizationWhatsAppAccountNameHandler,
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
    validate(updateOrganizationSchema),
    asyncHandler(updateOrganizationHandler),
  );
  router.get(
    '/organizations/:id/whatsapp-accounts',
    asyncHandler(listOrganizationWhatsAppAccountsHandler),
  );
  router.get(
    '/organizations/:id/whatsapp-accounts/:accountId',
    asyncHandler(getOrganizationWhatsAppAccountHandler),
  );
  router.patch(
    '/organizations/:id/whatsapp-accounts/:accountId',
    validate(updateWhatsAppAccountNameSchema),
    asyncHandler(updateOrganizationWhatsAppAccountNameHandler),
  );
  router.delete(
    '/organizations/:id/whatsapp-accounts/:accountId',
    asyncHandler(deleteOrganizationWhatsAppAccountHandler),
  );

  return router;
}
