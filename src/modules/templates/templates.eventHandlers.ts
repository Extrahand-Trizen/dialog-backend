import { EventBus } from '../../infrastructure/eventBus/EventBus';
import type { DomainEventPayload } from '../../infrastructure/eventBus/EventBus';
import { applyTemplateWebhookStatus } from './template.orchestrator';

function readString(payload: DomainEventPayload, key: string): string | undefined {
  const value = payload[key];
  return typeof value === 'string' ? value : undefined;
}

export function registerTemplateEventHandlers(): void {
  EventBus.on('TEMPLATE_APPROVED', async (payload) => {
    const organizationId = readString(payload, 'organizationId');
    const metaWabaId = readString(payload, 'metaWabaId');
    const templateId = readString(payload, 'templateId');
    const correlationId = readString(payload, 'correlationId');

    if (!organizationId || !metaWabaId || !templateId) {
      return;
    }

    await applyTemplateWebhookStatus({
      organizationId,
      metaWabaId,
      templateId,
      metaStatus: 'APPROVED',
      correlationId,
    });
  });

  EventBus.on('TEMPLATE_REJECTED', async (payload) => {
    const organizationId = readString(payload, 'organizationId');
    const metaWabaId = readString(payload, 'metaWabaId');
    const templateId = readString(payload, 'templateId');
    const correlationId = readString(payload, 'correlationId');
    const rejectionReason = readString(payload, 'rejectionReason');

    if (!organizationId || !metaWabaId || !templateId) {
      return;
    }

    await applyTemplateWebhookStatus({
      organizationId,
      metaWabaId,
      templateId,
      metaStatus: 'REJECTED',
      rejectionReason,
      correlationId,
    });
  });
}
