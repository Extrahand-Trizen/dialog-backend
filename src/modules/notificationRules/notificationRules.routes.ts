import { Router } from 'express';
import { asyncHandler } from '../../middleware/errorHandler';
import { jwtAuth } from '../../middleware/jwtAuth';
import { requireAdmin } from '../../middleware/requireRole';
import { validate } from '../../middleware/validate';
import {
  createNotificationRuleSchema,
  listNotificationRulesQuerySchema,
  updateNotificationRuleSchema,
} from './notificationRules.schemas';
import {
  createNotificationRuleHandler,
  deleteNotificationRuleHandler,
  getNotificationRuleHandler,
  listNotificationRulesHandler,
  updateNotificationRuleHandler,
} from './notificationRules.handlers';

export function createNotificationRulesRouter(): Router {
  const router = Router();

  router.use(jwtAuth);

  router.get(
    '/',
    validate(listNotificationRulesQuerySchema, 'query'),
    asyncHandler(listNotificationRulesHandler),
  );
  router.get('/:id', asyncHandler(getNotificationRuleHandler));
  router.post(
    '/',
    requireAdmin,
    validate(createNotificationRuleSchema),
    asyncHandler(createNotificationRuleHandler),
  );
  router.patch(
    '/:id',
    requireAdmin,
    validate(updateNotificationRuleSchema),
    asyncHandler(updateNotificationRuleHandler),
  );
  router.delete('/:id', requireAdmin, asyncHandler(deleteNotificationRuleHandler));

  return router;
}
