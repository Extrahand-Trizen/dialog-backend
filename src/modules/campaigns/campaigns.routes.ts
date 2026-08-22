import { Router } from 'express';
import { asyncHandler } from '../../middleware/errorHandler';
import { jwtAuth } from '../../middleware/jwtAuth';
import { requireMessagesWrite } from '../../middleware/requireMessagesWrite';
import { validate } from '../../middleware/validate';
import {
  createCampaignSchema,
  listCampaignsQuerySchema,
  updateCampaignRecipientSchema,
} from './campaigns.schemas';
import {
  createCampaignHandler,
  getCampaignHandler,
  listCampaignsHandler,
  updateCampaignRecipientHandler,
} from './campaigns.handlers';

export function createCampaignsRouter(): Router {
  const router = Router();
  router.use(jwtAuth);

  router.get('/', validate(listCampaignsQuerySchema, 'query'), asyncHandler(listCampaignsHandler));
  router.post(
    '/',
    requireMessagesWrite,
    validate(createCampaignSchema),
    asyncHandler(createCampaignHandler),
  );
  router.get('/:id', asyncHandler(getCampaignHandler));
  router.patch(
    '/:id/recipients',
    requireMessagesWrite,
    validate(updateCampaignRecipientSchema),
    asyncHandler(updateCampaignRecipientHandler),
  );

  return router;
}
