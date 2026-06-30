import { Request, Response } from 'express';
import { AppResponse } from '../../shared/responses/AppResponse';
import { getValidated } from '../../middleware/validate';
import type {
  DashboardEventsQuery,
  DashboardOverviewQuery,
  DashboardRecentActivityQuery,
} from './dashboard.schemas';
import {
  getOrganizationDashboardOverview,
  getOrganizationRecentActivity,
  listOrganizationDashboardEvents,
} from './dashboard.service';

function requireJwtContext(req: Request): { organizationId: string } {
  const auth = req.auth;
  if (!auth || auth.type !== 'jwt') {
    throw new Error('JWT context missing after auth middleware');
  }
  return { organizationId: auth.organizationId };
}

export async function dashboardOverviewHandler(req: Request, res: Response): Promise<void> {
  const { organizationId } = requireJwtContext(req);
  const query = getValidated<DashboardOverviewQuery>(req, 'query');
  const overview = await getOrganizationDashboardOverview(organizationId, query);
  AppResponse.success(res, 'Dashboard overview retrieved', overview);
}

export async function dashboardEventsHandler(req: Request, res: Response): Promise<void> {
  const { organizationId } = requireJwtContext(req);
  const query = getValidated<DashboardEventsQuery>(req, 'query');
  const result = await listOrganizationDashboardEvents(organizationId, query);

  AppResponse.paginated(res, 'Event history retrieved', result.items, {
    page: result.page,
    limit: result.limit,
    total: result.total,
    totalPages: Math.max(1, Math.ceil(result.total / result.limit)),
  });
}

export async function dashboardRecentActivityHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const { organizationId } = requireJwtContext(req);
  const query = getValidated<DashboardRecentActivityQuery>(req, 'query');
  const items = await getOrganizationRecentActivity(organizationId, query);
  AppResponse.success(res, 'Recent activity retrieved', items);
}
