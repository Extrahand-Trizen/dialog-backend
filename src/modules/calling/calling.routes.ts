import { Router } from 'express';
import { asyncHandler } from '../../middleware/errorHandler';
import { jwtAuth } from '../../middleware/jwtAuth';
import { validate } from '../../middleware/validate';
import {
  endCallSchema,
  initiateCallSchema,
  listCallsQuerySchema,
  updateCallingSettingsSchema,
} from './calling.schemas';
import {
  endCallHandler,
  getCallHandler,
  getContactHandler,
  getConversationHandler,
  getSettingsHandler,
  initiateCallHandler,
  listCallsHandler,
  listContactsHandler,
  listNotificationsHandler,
  updateSettingsHandler,
} from './calling.handlers';

export function createCallsRouter(): Router {
  const router = Router();
  router.use(jwtAuth);

  router.get('/', validate(listCallsQuerySchema, 'query'), asyncHandler(listCallsHandler));
  router.post('/', validate(initiateCallSchema), asyncHandler(initiateCallHandler));
  router.get('/contacts', asyncHandler(listContactsHandler));
  router.get('/contacts/:contactId', asyncHandler(getContactHandler));
  router.get('/contacts/:contactId/conversation', asyncHandler(getConversationHandler));
  router.get('/notifications', asyncHandler(listNotificationsHandler));
  router.get('/settings', asyncHandler(getSettingsHandler));
  router.patch('/settings', validate(updateCallingSettingsSchema), asyncHandler(updateSettingsHandler));
  router.get('/:id', asyncHandler(getCallHandler));
  router.post('/:id/end', validate(endCallSchema), asyncHandler(endCallHandler));

  return router;
}
