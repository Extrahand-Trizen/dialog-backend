-- Webhook audit fields for templates and messages
ALTER TABLE "Template" ADD COLUMN IF NOT EXISTS "lastWebhookAt" TIMESTAMPTZ(3);
ALTER TABLE "Template" ADD COLUMN IF NOT EXISTS "rawWebhookPayload" JSONB;

ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "statusUpdatedAt" TIMESTAMPTZ(3);
ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "rawStatusPayload" JSONB;
ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "rawPayload" JSONB;
