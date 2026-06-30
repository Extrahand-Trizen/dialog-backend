import { Router } from 'express';
import { asyncHandler } from '../../middleware/errorHandler';
import { jwtAuth } from '../../middleware/jwtAuth';
import { validate } from '../../middleware/validate';
import { loginSchema } from './auth.schemas';
import { loginHandler, meHandler } from './auth.handlers';

export function createAuthRouter(): Router {
  const router = Router();

  router.post('/login', validate(loginSchema), asyncHandler(loginHandler));
  router.get('/me', jwtAuth, asyncHandler(meHandler));

  return router;
}
