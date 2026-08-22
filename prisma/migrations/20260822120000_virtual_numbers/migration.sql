-- CreateEnum
CREATE TYPE "VirtualNumberStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateTable
CREATE TABLE "VirtualNumberInventory" (
    "id" TEXT NOT NULL,
    "countryCode" TEXT NOT NULL,
    "countryName" TEXT NOT NULL,
    "e164" TEXT NOT NULL,
    "locality" TEXT NOT NULL,
    "monthlyFeeUsd" INTEGER NOT NULL DEFAULT 8,
    "allocated" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VirtualNumberInventory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VirtualNumber" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "inventoryId" TEXT,
    "e164" TEXT NOT NULL,
    "countryCode" TEXT NOT NULL,
    "countryName" TEXT NOT NULL,
    "locality" TEXT NOT NULL,
    "status" "VirtualNumberStatus" NOT NULL DEFAULT 'ACTIVE',
    "incomingEnabled" BOOLEAN NOT NULL DEFAULT true,
    "outgoingEnabled" BOOLEAN NOT NULL DEFAULT true,
    "destinationE164" TEXT,
    "assignedApplication" TEXT,
    "webhookUrl" TEXT,
    "inboundCount" INTEGER NOT NULL DEFAULT 0,
    "outboundCount" INTEGER NOT NULL DEFAULT 0,
    "minutesUsed" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "VirtualNumber_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "CallRecord" ADD COLUMN IF NOT EXISTS "virtualNumberId" TEXT;
ALTER TABLE "CallRecord" ALTER COLUMN "provider" SET DEFAULT 'TRIZEN';

-- CreateIndex
CREATE UNIQUE INDEX "VirtualNumberInventory_e164_key" ON "VirtualNumberInventory"("e164");
CREATE INDEX "VirtualNumberInventory_countryCode_allocated_idx" ON "VirtualNumberInventory"("countryCode", "allocated");
CREATE UNIQUE INDEX "VirtualNumber_inventoryId_key" ON "VirtualNumber"("inventoryId");
CREATE UNIQUE INDEX "VirtualNumber_organizationId_e164_key" ON "VirtualNumber"("organizationId", "e164");
CREATE INDEX "VirtualNumber_organizationId_status_idx" ON "VirtualNumber"("organizationId", "status");

-- AddForeignKey
ALTER TABLE "VirtualNumber" ADD CONSTRAINT "VirtualNumber_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CallRecord" ADD CONSTRAINT "CallRecord_virtualNumberId_fkey" FOREIGN KEY ("virtualNumberId") REFERENCES "VirtualNumber"("id") ON DELETE SET NULL ON UPDATE CASCADE;
