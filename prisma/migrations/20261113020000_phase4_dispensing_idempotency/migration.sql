-- AlterTable dispensing_records
ALTER TABLE "dispensing_records" ADD COLUMN IF NOT EXISTS "idempotencyKey" TEXT;

CREATE INDEX IF NOT EXISTS "dispensing_records_idempotencyKey_idx" ON "dispensing_records"("idempotencyKey");

-- CreateTable dispensing_idempotency
CREATE TABLE IF NOT EXISTS "dispensing_idempotency" (
    "id" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "prescriptionId" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "responsePayload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dispensing_idempotency_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "dispensing_idempotency_idempotencyKey_key" ON "dispensing_idempotency"("idempotencyKey");
CREATE INDEX IF NOT EXISTS "dispensing_idempotency_prescriptionId_idx" ON "dispensing_idempotency"("prescriptionId");

