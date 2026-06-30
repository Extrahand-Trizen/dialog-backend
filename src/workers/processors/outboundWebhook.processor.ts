import type { Job } from 'bullmq';
import type { OutboundWebhookJobData } from '../../modules/outboundWebhooks/outboundWebhooks.schemas';
import { deliverOutboundWebhook } from '../../modules/outboundWebhooks/outboundWebhooks.dispatch.service';

export async function processOutboundWebhookJob(job: Job<OutboundWebhookJobData>): Promise<void> {
  await deliverOutboundWebhook(job.data);
}
