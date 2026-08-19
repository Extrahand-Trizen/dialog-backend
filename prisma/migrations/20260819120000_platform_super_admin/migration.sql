-- Platform Super Admin foundation: a user can exist outside any single
-- organization's scope, and an organization can record which platform
-- admin provisioned it (client provisioning flow, Phase 1).

ALTER TABLE "User" ADD COLUMN "isPlatformAdmin" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX "User_isPlatformAdmin_idx" ON "User"("isPlatformAdmin");

ALTER TABLE "Organization" ADD COLUMN "createdById" TEXT;
CREATE INDEX "Organization_createdById_idx" ON "Organization"("createdById");

ALTER TABLE "Organization" ADD CONSTRAINT "Organization_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
