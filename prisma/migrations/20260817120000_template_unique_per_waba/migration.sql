-- Allow the same template name + language on different connected WABAs.
-- Active uniqueness is per WhatsApp account, not org-wide.
DROP INDEX IF EXISTS "Template_organizationId_metaTemplateName_language_key";

CREATE INDEX IF NOT EXISTS "Template_organizationId_metaTemplateName_language_idx"
ON "Template"("organizationId", "metaTemplateName", "language");

CREATE UNIQUE INDEX "Template_org_waba_name_language_active_key"
ON "Template"("organizationId", "whatsAppAccountId", "metaTemplateName", "language")
WHERE "deletedAt" IS NULL AND "whatsAppAccountId" IS NOT NULL;
