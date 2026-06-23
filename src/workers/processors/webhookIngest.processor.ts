import type { Job } from 'bullmq';
import type { WebhookIngestJobData } from '../../modules/webhooks/webhooks.schemas';
import { processWebhookEvent } from '../../modules/webhooks/webhook.orchestrator';

export async function processWebhookIngestJob(job: Job<WebhookIngestJobData>): Promise<void> {
  await processWebhookEvent(job.data.webhookEventId);
}
