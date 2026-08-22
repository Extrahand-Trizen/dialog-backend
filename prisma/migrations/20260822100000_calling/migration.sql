-- CreateEnum
CREATE TYPE "CallDirection" AS ENUM ('OUTGOING', 'INCOMING');

-- CreateEnum
CREATE TYPE "CallRecordStatus" AS ENUM ('QUEUED', 'RINGING', 'ACTIVE', 'COMPLETED', 'MISSED', 'REJECTED', 'FAILED');

-- CreateTable
CREATE TABLE "CallContact" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phoneE164" TEXT NOT NULL,
    "company" TEXT,
    "email" TEXT,
    "avatarInitials" TEXT NOT NULL,
    "avatarColor" TEXT NOT NULL DEFAULT 'bg-emerald-600',
    "whatsappAvailable" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CallContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CallRecord" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "createdByUserId" TEXT,
    "direction" "CallDirection" NOT NULL DEFAULT 'OUTGOING',
    "status" "CallRecordStatus" NOT NULL DEFAULT 'QUEUED',
    "durationSeconds" INTEGER,
    "virtualNumber" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'MYOPERATOR',
    "providerCallId" TEXT,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "answeredAt" TIMESTAMPTZ(3),
    "endedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CallRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CallNotification" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "callId" TEXT,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CallNotification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrganizationCallingSettings" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "virtualNumber" TEXT NOT NULL DEFAULT '',
    "callerIdDisplay" TEXT NOT NULL DEFAULT 'Organization virtual number',
    "recordCalls" BOOLEAN NOT NULL DEFAULT false,
    "announceMaskedCalling" BOOLEAN NOT NULL DEFAULT true,
    "businessHoursOnly" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "OrganizationCallingSettings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CallContact_organizationId_phoneE164_key" ON "CallContact"("organizationId", "phoneE164");
CREATE INDEX "CallContact_organizationId_name_idx" ON "CallContact"("organizationId", "name");
CREATE INDEX "CallRecord_organizationId_startedAt_idx" ON "CallRecord"("organizationId", "startedAt" DESC);
CREATE INDEX "CallRecord_organizationId_status_startedAt_idx" ON "CallRecord"("organizationId", "status", "startedAt" DESC);
CREATE INDEX "CallRecord_contactId_startedAt_idx" ON "CallRecord"("contactId", "startedAt" DESC);
CREATE INDEX "CallRecord_providerCallId_idx" ON "CallRecord"("providerCallId");
CREATE INDEX "CallNotification_organizationId_createdAt_idx" ON "CallNotification"("organizationId", "createdAt" DESC);
CREATE UNIQUE INDEX "OrganizationCallingSettings_organizationId_key" ON "OrganizationCallingSettings"("organizationId");

ALTER TABLE "CallContact" ADD CONSTRAINT "CallContact_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CallRecord" ADD CONSTRAINT "CallRecord_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CallRecord" ADD CONSTRAINT "CallRecord_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "CallContact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CallNotification" ADD CONSTRAINT "CallNotification_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CallNotification" ADD CONSTRAINT "CallNotification_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "CallContact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrganizationCallingSettings" ADD CONSTRAINT "OrganizationCallingSettings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
