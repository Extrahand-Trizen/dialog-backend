import { Router } from 'express';
import { asyncHandler } from '../../middleware/errorHandler';
import { jwtAuth } from '../../middleware/jwtAuth';
import { validate } from '../../middleware/validate';
import {
  dashboardEventsQuerySchema,
  dashboardOverviewQuerySchema,
  dashboardRecentActivityQuerySchema,
} from './dashboard.schemas';
import {
  dashboardEventsHandler,
  dashboardOverviewHandler,
  dashboardRecentActivityHandler,
} from './dashboard.handlers';

export function createDashboardRouter(): Router {
  const router = Router();

  router.use(jwtAuth);

  router.get(
    '/overview',
    validate(dashboardOverviewQuerySchema, 'query'),
    asyncHandler(dashboardOverviewHandler),
  );
  router.get(
    '/events',
    validate(dashboardEventsQuerySchema, 'query'),
    asyncHandler(dashboardEventsHandler),
  );
  router.get(
    '/recent-activity',
    validate(dashboardRecentActivityQuerySchema, 'query'),
    asyncHandler(dashboardRecentActivityHandler),
  );

  return router;
}
