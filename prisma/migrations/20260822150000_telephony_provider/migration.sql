-- AlterEnum
ALTER TYPE "CallRecordStatus" ADD VALUE IF NOT EXISTS 'BUSY';
ALTER TYPE "CallRecordStatus" ADD VALUE IF NOT EXISTS 'NO_ANSWER';
ALTER TYPE "CallRecordStatus" ADD VALUE IF NOT EXISTS 'CANCELLED';

-- AlterTable VirtualNumber
ALTER TABLE "VirtualNumber" ADD COLUMN IF NOT EXISTS "maskingEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "VirtualNumber" ADD COLUMN IF NOT EXISTS "providerNumberId" TEXT;

-- AlterTable CallRecord
ALTER TABLE "CallRecord" ADD COLUMN IF NOT EXISTS "providerReference" TEXT;
ALTER TABLE "CallRecord" ADD COLUMN IF NOT EXISTS "callerE164" TEXT;
ALTER TABLE "CallRecord" ADD COLUMN IF NOT EXISTS "receiverE164" TEXT;
ALTER TABLE "CallRecord" ADD COLUMN IF NOT EXISTS "recordingReference" TEXT;
ALTER TABLE "CallRecord" ADD COLUMN IF NOT EXISTS "metadata" JSONB;

-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "MaskedCallSessionStatus" AS ENUM ('CREATED', 'RINGING', 'ACTIVE', 'COMPLETED', 'FAILED', 'EXPIRED', 'CANCELLED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "MaskedCallSession" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "virtualNumberId" TEXT NOT NULL,
    "partyA" TEXT NOT NULL,
    "partyB" TEXT NOT NULL,
    "providerSessionId" TEXT,
    "status" "MaskedCallSessionStatus" NOT NULL DEFAULT 'CREATED',
    "metadata" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMPTZ(3),
    "expiresAt" TIMESTAMPTZ(3),
    "endedAt" TIMESTAMPTZ(3),
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "MaskedCallSession_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "MaskedCallSession_organizationId_createdAt_idx" ON "MaskedCallSession"("organizationId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "MaskedCallSession_providerSessionId_idx" ON "MaskedCallSession"("providerSessionId");

DO $$ BEGIN
    ALTER TABLE "MaskedCallSession" ADD CONSTRAINT "MaskedCallSession_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "MaskedCallSession" ADD CONSTRAINT "MaskedCallSession_virtualNumberId_fkey" FOREIGN KEY ("virtualNumberId") REFERENCES "VirtualNumber"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
