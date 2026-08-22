ALTER TABLE "Campaign" ADD COLUMN IF NOT EXISTS "name" TEXT;
UPDATE "Campaign" SET "name" = COALESCE(NULLIF("name", ''), "templateName", 'Campaign') WHERE "name" IS NULL OR "name" = '';
ALTER TABLE "Campaign" ALTER COLUMN "name" SET DEFAULT '';
ALTER TABLE "Campaign" ALTER COLUMN "name" SET NOT NULL;

UPDATE "Campaign"
SET "createdById" = "createdByUserId"
WHERE "createdById" IS NULL AND "createdByUserId" IS NOT NULL;
