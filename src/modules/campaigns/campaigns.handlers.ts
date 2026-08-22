import { Request, Response } from 'express';
import { AppResponse } from '../../shared/responses/AppResponse';
import { getValidated } from '../../middleware/validate';
import type {
  CreateCampaignInput,
  ListCampaignsQuery,
  UpdateCampaignRecipientInput,
} from './campaigns.schemas';
import {
  createCampaign,
  getCampaign,
  listCampaigns,
  updateCampaignRecipient,
} from './campaigns.service';

function requireJwt(req: Request): { organizationId: string; userId: string } {
  const auth = req.auth;
  if (!auth || auth.type !== 'jwt') {
    throw new Error('JWT context missing after auth middleware');
  }
  return { organizationId: auth.organizationId, userId: auth.userId };
}

export async function listCampaignsHandler(req: Request, res: Response): Promise<void> {
  const { organizationId } = requireJwt(req);
  const query = getValidated<ListCampaignsQuery>(req, 'query');
  const result = await listCampaigns(organizationId, query);
  AppResponse.paginated(res, 'Campaigns retrieved', result.items, {
    page: result.page,
    limit: result.limit,
    total: result.total,
    totalPages: Math.max(1, Math.ceil(result.total / result.limit)),
  });
}

export async function getCampaignHandler(req: Request, res: Response): Promise<void> {
  const { organizationId } = requireJwt(req);
  const campaign = await getCampaign(organizationId, req.params.id);
  AppResponse.success(res, 'Campaign retrieved', campaign);
}

export async function createCampaignHandler(req: Request, res: Response): Promise<void> {
  const { organizationId, userId } = requireJwt(req);
  const body = getValidated<CreateCampaignInput>(req, 'body');
  const campaign = await createCampaign(organizationId, userId, body);
  AppResponse.created(res, 'Campaign created', campaign);
}

export async function updateCampaignRecipientHandler(req: Request, res: Response): Promise<void> {
  const { organizationId } = requireJwt(req);
  const body = getValidated<UpdateCampaignRecipientInput>(req, 'body');
  const campaign = await updateCampaignRecipient(organizationId, req.params.id, body);
  AppResponse.updated(res, 'Campaign recipient updated', campaign);
}
