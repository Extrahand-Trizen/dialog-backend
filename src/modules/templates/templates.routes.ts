import { Router } from 'express';
import { asyncHandler } from '../../middleware/errorHandler';
import { jwtAuth } from '../../middleware/jwtAuth';
import { requireAdmin } from '../../middleware/requireRole';
import { validate } from '../../middleware/validate';
import { listTemplatesQuerySchema, syncTemplatesSchema, createTemplateSchema, updateTemplateSchema, updateTemplateVariableNamesSchema } from './templates.schemas';
import {
  createTemplateHandler,
  getTemplateHandler,
  listTemplatesHandler,
  syncTemplatesHandler,
  updateTemplateHandler,
  updateTemplateVariableNamesHandler,
} from './templates.handlers';

export function createTemplatesRouter(): Router {
  const router = Router();

  router.use(jwtAuth);

  router.get('/', validate(listTemplatesQuerySchema, 'query'), asyncHandler(listTemplatesHandler));
  router.post(
    '/',
    requireAdmin,
    validate(createTemplateSchema),
    asyncHandler(createTemplateHandler),
  );
  router.post(
    '/sync',
    requireAdmin,
    validate(syncTemplatesSchema),
    asyncHandler(syncTemplatesHandler),
  );
  router.patch(
    '/:id',
    requireAdmin,
    validate(updateTemplateSchema),
    asyncHandler(updateTemplateHandler),
  );
  router.patch(
    '/:id/variable-names',
    requireAdmin,
    validate(updateTemplateVariableNamesSchema),
    asyncHandler(updateTemplateVariableNamesHandler),
  );
  router.get('/:id', asyncHandler(getTemplateHandler));

  return router;
}
