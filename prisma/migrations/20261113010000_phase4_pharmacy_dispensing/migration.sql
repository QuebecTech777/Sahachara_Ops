-- Create Sequence for Dispensing Records
CREATE SEQUENCE IF NOT EXISTS dispensing_seq START WITH 10001;

-- AlterTable prescriptions
ALTER TABLE "prescriptions" ADD COLUMN IF NOT EXISTS "dispensingStatus" TEXT NOT NULL DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS "dispensedQuantity" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "remainingQuantity" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN IF NOT EXISTS "dispensedById" TEXT,
ADD COLUMN IF NOT EXISTS "dispenseHistory" JSONB;

-- AlterTable medication_stock
ALTER TABLE "medication_stock" ADD COLUMN IF NOT EXISTS "strength" TEXT,
ADD COLUMN IF NOT EXISTS "reorderThreshold" INTEGER,
ADD COLUMN IF NOT EXISTS "manufacturer" TEXT,
ADD COLUMN IF NOT EXISTS "storageInfo" TEXT,
ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS "medication_stock_drugName_idx" ON "medication_stock"("drugName");
CREATE INDEX IF NOT EXISTS "medication_stock_batchNumber_idx" ON "medication_stock"("batchNumber");
CREATE INDEX IF NOT EXISTS "medication_stock_expiryDate_idx" ON "medication_stock"("expiryDate");

-- AlterTable stock_movements
ALTER TABLE "stock_movements" ADD COLUMN IF NOT EXISTS "actorId" TEXT,
ADD COLUMN IF NOT EXISTS "actorRole" TEXT,
ADD COLUMN IF NOT EXISTS "reason" TEXT,
ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX IF NOT EXISTS "stock_movements_medicineId_idx" ON "stock_movements"("medicineId");
CREATE INDEX IF NOT EXISTS "stock_movements_batchNumber_idx" ON "stock_movements"("batchNumber");
CREATE INDEX IF NOT EXISTS "stock_movements_timestamp_idx" ON "stock_movements"("timestamp");

-- CreateTable dispensing_records
CREATE TABLE IF NOT EXISTS "dispensing_records" (
    "id" TEXT NOT NULL,
    "dispenseNumber" TEXT NOT NULL,
    "prescriptionId" TEXT NOT NULL,
    "encounterId" TEXT,
    "patientId" TEXT,
    "patientName" TEXT NOT NULL,
    "mrn" TEXT NOT NULL,
    "medicationStockId" TEXT,
    "drugName" TEXT NOT NULL,
    "batchNumber" TEXT NOT NULL,
    "expiryDate" TEXT,
    "quantityDispensed" INTEGER NOT NULL,
    "dispensedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dispensedById" TEXT NOT NULL,
    "dispensedByName" TEXT NOT NULL,
    "dispensedByRole" TEXT NOT NULL DEFAULT 'PHARMACIST',
    "pharmacyNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dispensing_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "dispensing_records_dispenseNumber_key" ON "dispensing_records"("dispenseNumber");
CREATE INDEX IF NOT EXISTS "dispensing_records_prescriptionId_idx" ON "dispensing_records"("prescriptionId");
CREATE INDEX IF NOT EXISTS "dispensing_records_batchNumber_idx" ON "dispensing_records"("batchNumber");
CREATE INDEX IF NOT EXISTS "dispensing_records_dispensedAt_idx" ON "dispensing_records"("dispensedAt");

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'dispensing_records_prescriptionId_fkey'
    ) THEN
        ALTER TABLE "dispensing_records" ADD CONSTRAINT "dispensing_records_prescriptionId_fkey" FOREIGN KEY ("prescriptionId") REFERENCES "prescriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

