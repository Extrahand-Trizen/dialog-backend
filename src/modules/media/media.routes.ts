import { Router } from 'express';
import { asyncHandler } from '../../middleware/errorHandler';
import { jwtAuth } from '../../middleware/jwtAuth';
import { requireAdmin } from '../../middleware/requireRole';
import { uploadTemplateMediaHandler, previewTemplateMediaHandler } from './media.handlers';
import { templateMediaUploadMiddleware } from './media.middleware';

export function createMediaRouter(): Router {
  const router = Router();

  router.use(jwtAuth);

  router.get('/preview', asyncHandler(previewTemplateMediaHandler));

  router.post(
    '/upload',
    requireAdmin,
    templateMediaUploadMiddleware,
    asyncHandler(uploadTemplateMediaHandler),
  );

  return router;
}
