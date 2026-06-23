import { Router } from 'express';

import { asyncHandler } from '../../middleware/errorHandler';

import { apiKeyAuth } from '../../middleware/apiKeyAuth';

import { jwtAuth } from '../../middleware/jwtAuth';

import { requireApiKeyScope } from '../../middleware/requireApiKeyScope';

import { validate } from '../../middleware/validate';

import { listMessagesQuerySchema, sendTemplateMessageSchema } from './messages.schemas';

import {

  getMessageHandler,

  listMessagesHandler,

  sendTemplateMessageHandler,

} from './messages.handlers';



export function createMessagesRouter(): Router {

  const router = Router();



  router.post(

    '/',

    apiKeyAuth,

    requireApiKeyScope('messages:write'),

    validate(sendTemplateMessageSchema),

    asyncHandler(sendTemplateMessageHandler),

  );



  router.use(jwtAuth);



  router.get('/', validate(listMessagesQuerySchema, 'query'), asyncHandler(listMessagesHandler));

  router.get('/:id', asyncHandler(getMessageHandler));



  return router;

}

