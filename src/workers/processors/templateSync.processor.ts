import type { Job } from 'bullmq';
import type { TemplateSyncJobData } from '../../modules/templates/templates.schemas';
import { syncTemplatesForAccount } from '../../modules/templates/template.orchestrator';

export async function processTemplateSyncJob(job: Job<TemplateSyncJobData>): Promise<void> {
  await syncTemplatesForAccount(job.data);
}
