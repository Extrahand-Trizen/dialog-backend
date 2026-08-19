import { Router } from 'express';
import { asyncHandler } from '../../middleware/errorHandler';
import { jwtAuth } from '../../middleware/jwtAuth';
import { requireManagerOrAdmin } from '../../middleware/requireRole';
import { validate } from '../../middleware/validate';
import { listTemplatesQuerySchema, syncTemplatesSchema, copyTemplatesSchema, deleteTemplatesSchema, createTemplateSchema, updateTemplateSchema, updateTemplateVariableNamesSchema } from './templates.schemas';
import {
  copyTemplatesHandler,
  createTemplateHandler,
  deleteTemplatesHandler,
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
    requireManagerOrAdmin,
    validate(createTemplateSchema),
    asyncHandler(createTemplateHandler),
  );
  router.post(
    '/sync',
    requireManagerOrAdmin,
    validate(syncTemplatesSchema),
    asyncHandler(syncTemplatesHandler),
  );
  router.post(
    '/copy',
    requireManagerOrAdmin,
    validate(copyTemplatesSchema),
    asyncHandler(copyTemplatesHandler),
  );
  router.post(
    '/delete',
    requireManagerOrAdmin,
    validate(deleteTemplatesSchema),
    asyncHandler(deleteTemplatesHandler),
  );
  router.patch(
    '/:id',
    requireManagerOrAdmin,
    validate(updateTemplateSchema),
    asyncHandler(updateTemplateHandler),
  );
  router.patch(
    '/:id/variable-names',
    requireManagerOrAdmin,
    validate(updateTemplateVariableNamesSchema),
    asyncHandler(updateTemplateVariableNamesHandler),
  );
  router.get('/:id', asyncHandler(getTemplateHandler));

  return router;
}
