-- Link templates to connected WABAs and allow re-create after soft delete.
ALTER TABLE "Template" ADD COLUMN "whatsAppAccountId" TEXT;

ALTER TABLE "Template"
ADD CONSTRAINT "Template_whatsAppAccountId_fkey"
FOREIGN KEY ("whatsAppAccountId") REFERENCES "WhatsAppAccount"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Template_whatsAppAccountId_idx" ON "Template"("whatsAppAccountId");

DROP INDEX IF EXISTS "Template_organizationId_metaTemplateName_language_key";

CREATE UNIQUE INDEX "Template_organizationId_metaTemplateName_language_key"
ON "Template"("organizationId", "metaTemplateName", "language")
WHERE "deletedAt" IS NULL;
