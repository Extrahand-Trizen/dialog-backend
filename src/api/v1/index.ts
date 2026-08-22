import { Router } from 'express';
import { createHealthRouter } from '../../modules/health';
import { createAuthRouter } from '../../modules/auth';
import { createApiKeysRouter } from '../../modules/apiKeys';
import { createWhatsAppRouter } from '../../modules/whatsapp';
import { createTemplatesRouter } from '../../modules/templates';
import { createNotificationRulesRouter } from '../../modules/notificationRules';
import { createNotificationsRouter } from '../../modules/notifications';
import { createDashboardRouter } from '../../modules/dashboard';
import { createMessagesRouter } from '../../modules/messages';
import { createIntegrationsRouter } from '../../modules/integrations';
import { createOutboundWebhooksRouter } from '../../modules/outboundWebhooks';
import { createMediaRouter } from '../../modules/media';
import { createPlatformAdminRouter } from '../../modules/platformAdmin';
import { createConversationsRouter } from '../../modules/conversations';
import { createCampaignsRouter } from '../../modules/campaigns';
import { createCallsRouter } from '../../modules/calling';
import { createVirtualNumbersRouter, createVoiceApiRouter } from '../../modules/voice';
import { createTelephonyWebhookRouter } from '../../modules/voice/telephony.webhook';

export function createV1Router(): Router {
  const router = Router();

  router.use('/health', createHealthRouter());
  router.use('/auth', createAuthRouter());
  router.use('/api-keys', createApiKeysRouter());
  router.use('/whatsapp', createWhatsAppRouter());
  router.use('/templates', createTemplatesRouter());
  router.use('/notification-rules', createNotificationRulesRouter());
  router.use('/events', createNotificationsRouter());
  router.use('/dashboard', createDashboardRouter());
  router.use('/messages', createMessagesRouter());
  router.use('/conversations', createConversationsRouter());
  router.use('/campaigns', createCampaignsRouter());
  router.use('/calls', createCallsRouter());
  router.use('/virtual-numbers', createVirtualNumbersRouter());
  router.use('/voice', createVoiceApiRouter());
  router.use('/webhooks/telephony', createTelephonyWebhookRouter());
  router.use('/webhook-subscriptions', createOutboundWebhooksRouter());
  router.use('/media', createMediaRouter());
  router.use('/internal', createIntegrationsRouter());
  router.use('/platform', createPlatformAdminRouter());

  return router;
}
