import { Router } from 'express';
import { asyncHandler } from '../../middleware/errorHandler';
import { jwtAuth } from '../../middleware/jwtAuth';
import { requireAdmin } from '../../middleware/requireRole';
import { validate } from '../../middleware/validate';
import { createApiKeySchema } from './apiKeys.schemas';
import {
  createApiKeyHandler,
  listApiKeysHandler,
  revokeApiKeyHandler,
} from './apiKeys.handlers';

export function createApiKeysRouter(): Router {
  const router = Router();

  router.use(jwtAuth);

  router.get('/', asyncHandler(listApiKeysHandler));
  router.post('/', requireAdmin, validate(createApiKeySchema), asyncHandler(createApiKeyHandler));
  router.post('/:id/revoke', requireAdmin, asyncHandler(revokeApiKeyHandler));

  return router;
}
