import { Router } from 'express';
import { asyncHandler } from '../../middleware/errorHandler';
import { livenessHandler, readinessHandler } from './health.handlers';

export function createHealthRouter(): Router {
  const router = Router();

  router.get('/', livenessHandler);
  router.get('/ready', asyncHandler(readinessHandler));

  return router;
}
