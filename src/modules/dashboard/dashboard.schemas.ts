import { z } from 'zod';

export const DASHBOARD_PERIODS = ['7d', '30d', '90d'] as const;
export type DashboardPeriod = (typeof DASHBOARD_PERIODS)[number];

export const dashboardOverviewQuerySchema = z.object({
  period: z.enum(DASHBOARD_PERIODS).default('30d'),
});

export type DashboardOverviewQuery = z.infer<typeof dashboardOverviewQuerySchema>;

export const dashboardEventsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['RECEIVED', 'PROCESSING', 'PROCESSED', 'FAILED', 'SKIPPED']).optional(),
  eventKey: z.string().trim().min(1).max(120).optional(),
});

export type DashboardEventsQuery = z.infer<typeof dashboardEventsQuerySchema>;

export const dashboardRecentActivityQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export type DashboardRecentActivityQuery = z.infer<typeof dashboardRecentActivityQuerySchema>;

export type StatusCountMap = Record<string, number>;

export type DashboardOverviewDto = {
  period: DashboardPeriod;
  periodStart: string;
  messages: {
    total: number;
    byStatus: StatusCountMap;
    deliveryRate: number | null;
    readRate: number | null;
  };
  events: {
    total: number;
    byStatus: StatusCountMap;
  };
  executions: {
    total: number;
    byStatus: StatusCountMap;
  };
};

export type RecentActivityItemDto =
  | {
      type: 'message';
      id: string;
      occurredAt: string;
      status: string;
      recipientPhone: string;
      metaTemplateName: string | null;
      correlationId: string | null;
    }
  | {
      type: 'event';
      id: string;
      occurredAt: string;
      status: string;
      eventKey: string;
      recipientPhone: string;
      correlationId: string;
    };
