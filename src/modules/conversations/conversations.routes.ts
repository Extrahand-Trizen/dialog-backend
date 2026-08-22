import { Router } from 'express';

import { asyncHandler } from '../../middleware/errorHandler';
import { jwtAuth } from '../../middleware/jwtAuth';
import { requireMessagesWrite } from '../../middleware/requireMessagesWrite';
import { validate } from '../../middleware/validate';
import {
  listConversationsQuerySchema,
  listConversationThreadQuerySchema,
  sendConversationReplySchema,
} from './conversations.schemas';
import {
  getConversationThreadHandler,
  listConversationsHandler,
  markConversationReadHandler,
  sendConversationReplyHandler,
} from './conversations.handlers';

export function createConversationsRouter(): Router {
  const router = Router();

  router.use(jwtAuth);

  router.get('/', validate(listConversationsQuerySchema, 'query'), asyncHandler(listConversationsHandler));
  router.get(
    '/:id/messages',
    validate(listConversationThreadQuerySchema, 'query'),
    asyncHandler(getConversationThreadHandler),
  );
  router.post('/:id/read', asyncHandler(markConversationReadHandler));
  router.post(
    '/:id/messages',
    requireMessagesWrite,
    validate(sendConversationReplySchema),
    asyncHandler(sendConversationReplyHandler),
  );

  return router;
}
