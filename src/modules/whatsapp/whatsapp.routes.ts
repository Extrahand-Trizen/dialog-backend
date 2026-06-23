import { Router } from 'express';
import { asyncHandler } from '../../middleware/errorHandler';
import { jwtAuth } from '../../middleware/jwtAuth';
import { requireAdmin } from '../../middleware/requireRole';
import { validate } from '../../middleware/validate';
import { createWhatsAppAccountSchema } from './whatsapp.schemas';
import {
  connectAccountHandler,
  getAccountHandler,
  listAccountsHandler,
  listPhoneNumbersHandler,
  setDefaultPhoneHandler,
  syncAccountHandler,
} from './whatsapp.handlers';

export function createWhatsAppRouter(): Router {
  const router = Router();

  router.use(jwtAuth);

  router.get('/accounts', asyncHandler(listAccountsHandler));
  router.post(
    '/accounts',
    requireAdmin,
    validate(createWhatsAppAccountSchema),
    asyncHandler(connectAccountHandler),
  );
  router.get('/accounts/:id', asyncHandler(getAccountHandler));
  router.post('/accounts/:id/sync', requireAdmin, asyncHandler(syncAccountHandler));
  router.get('/accounts/:accountId/phone-numbers', asyncHandler(listPhoneNumbersHandler));
  router.post(
    '/accounts/:accountId/phone-numbers/:phoneId/default',
    requireAdmin,
    asyncHandler(setDefaultPhoneHandler),
  );

  return router;
}
