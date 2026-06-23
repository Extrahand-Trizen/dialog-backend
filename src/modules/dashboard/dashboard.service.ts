import { listOrganizationEventIngests } from '../notifications/notifications.service';
import type {
  DashboardEventsQuery,
  DashboardOverviewDto,
  DashboardOverviewQuery,
  DashboardRecentActivityQuery,
  RecentActivityItemDto,
} from './dashboard.schemas';
import { fetchDashboardOverview } from './queries/overview.query';
import { fetchRecentActivity } from './queries/recentActivity.query';
import type { EventIngestDto } from '../notifications/notifications.schemas';

export async function getOrganizationDashboardOverview(
  organizationId: string,
  query: DashboardOverviewQuery,
): Promise<DashboardOverviewDto> {
  return fetchDashboardOverview({
    organizationId,
    period: query.period,
  });
}

export async function listOrganizationDashboardEvents(
  organizationId: string,
  query: DashboardEventsQuery,
): Promise<{ items: EventIngestDto[]; total: number; page: number; limit: number }> {
  const result = await listOrganizationEventIngests(organizationId, query);
  return {
    ...result,
    page: query.page,
    limit: query.limit,
  };
}

export async function getOrganizationRecentActivity(
  organizationId: string,
  query: DashboardRecentActivityQuery,
): Promise<RecentActivityItemDto[]> {
  return fetchRecentActivity({
    organizationId,
    limit: query.limit,
  });
}
