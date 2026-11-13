-- Create Sequence for Refund Ledger Entries
CREATE SEQUENCE IF NOT EXISTS refund_entry_seq START WITH 10001;

-- AlterTable refund_requests
ALTER TABLE "refund_requests" ADD COLUMN IF NOT EXISTS "executedById" TEXT,
ADD COLUMN IF NOT EXISTS "executedByName" TEXT,
ADD COLUMN IF NOT EXISTS "executedByRole" TEXT,
ADD COLUMN IF NOT EXISTS "executedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "executionNotes" TEXT,
ADD COLUMN IF NOT EXISTS "refundMethod" TEXT;

-- CreateTable refund_ledger_entries
CREATE TABLE IF NOT EXISTS "refund_ledger_entries" (
    "id" TEXT NOT NULL,
    "entryNumber" TEXT NOT NULL,
    "refundRequestId" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "patientId" TEXT,
    "patientName" TEXT NOT NULL,
    "mrn" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "refundMethod" TEXT NOT NULL,
    "externalReference" TEXT,
    "executedById" TEXT NOT NULL,
    "executedByName" TEXT NOT NULL,
    "executedByRole" TEXT NOT NULL,
    "executedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refund_ledger_entries_pkey" PRIMARY KEY ("id")
);

-- Indexes for refund_ledger_entries
CREATE UNIQUE INDEX IF NOT EXISTS "refund_ledger_entries_entryNumber_key" ON "refund_ledger_entries"("entryNumber");
CREATE UNIQUE INDEX IF NOT EXISTS "refund_ledger_entries_refundRequestId_key" ON "refund_ledger_entries"("refundRequestId");
CREATE INDEX IF NOT EXISTS "refund_ledger_entries_paymentId_idx" ON "refund_ledger_entries"("paymentId");
CREATE INDEX IF NOT EXISTS "refund_ledger_entries_patientId_idx" ON "refund_ledger_entries"("patientId");
CREATE INDEX IF NOT EXISTS "refund_ledger_entries_executedAt_idx" ON "refund_ledger_entries"("executedAt");

-- AddForeignKey
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'refund_ledger_entries_refundRequestId_fkey') THEN
        ALTER TABLE "refund_ledger_entries" ADD CONSTRAINT "refund_ledger_entries_refundRequestId_fkey" FOREIGN KEY ("refundRequestId") REFERENCES "refund_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;

