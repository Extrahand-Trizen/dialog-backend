import { Router } from 'express';
import { asyncHandler } from '../../middleware/errorHandler';
import { jwtAuth } from '../../middleware/jwtAuth';
import { apiKeyAuth } from '../../middleware/apiKeyAuth';
import { validate } from '../../middleware/validate';
import {
  activateNumberSchema,
  listInventoryQuerySchema,
  maskingSessionSchema,
  updateVirtualNumberSchema,
  voiceCallSchema,
} from './voice.schemas';
import {
  activateNumberHandler,
  getNumberHandler,
  listInventoryHandler,
  listNumbersHandler,
  maskingSessionHandler,
  updateNumberHandler,
  voiceCallHandler,
} from './voice.handlers';

export function createVirtualNumbersRouter(): Router {
  const router = Router();
  router.use(jwtAuth);
  router.get(
    '/available',
    validate(listInventoryQuerySchema, 'query'),
    asyncHandler(listInventoryHandler),
  );
  router.post('/', validate(activateNumberSchema), asyncHandler(activateNumberHandler));
  router.get('/', asyncHandler(listNumbersHandler));
  router.get('/:id', asyncHandler(getNumberHandler));
  router.patch('/:id', validate(updateVirtualNumberSchema), asyncHandler(updateNumberHandler));
  return router;
}

export function createVoiceApiRouter(): Router {
  const router = Router();
  router.post('/calls', apiKeyAuth, validate(voiceCallSchema), asyncHandler(voiceCallHandler));
  router.post(
    '/masking/sessions',
    apiKeyAuth,
    validate(maskingSessionSchema),
    asyncHandler(maskingSessionHandler),
  );
  return router;
}
