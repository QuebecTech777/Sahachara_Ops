-- SAHACHARA OPS: Patient Management & Master Patient Record Foundation
-- Migration: 20261112220000_patient_management_master_record

-- 1. Create hospital patient MRN sequence for atomic collision-free numbering
CREATE SEQUENCE IF NOT EXISTS patient_mrn_seq START WITH 10001;

-- 2. Modify patients table: drop fabricated defaults and add master record columns
ALTER TABLE "patients"
  ALTER COLUMN "dob" DROP DEFAULT,
  ALTER COLUMN "dob" DROP NOT NULL,
  ALTER COLUMN "age" DROP NOT NULL,
  ALTER COLUMN "bloodGroup" DROP DEFAULT,
  ALTER COLUMN "bloodGroup" DROP NOT NULL,
  ALTER COLUMN "phone" DROP DEFAULT,
  ALTER COLUMN "address" DROP DEFAULT,
  ALTER COLUMN "address" DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS "middleName" TEXT,
  ADD COLUMN IF NOT EXISTS "preferredLanguage" TEXT DEFAULT 'Malayalam',
  ADD COLUMN IF NOT EXISTS "photoUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS "secondaryPhone" TEXT,
  ADD COLUMN IF NOT EXISTS "communicationPreference" TEXT DEFAULT 'sms',
  ADD COLUMN IF NOT EXISTS "contactLanguage" TEXT,
  ADD COLUMN IF NOT EXISTS "addressLine1" TEXT,
  ADD COLUMN IF NOT EXISTS "addressLine2" TEXT,
  ADD COLUMN IF NOT EXISTS "locality" TEXT,
  ADD COLUMN IF NOT EXISTS "city" TEXT,
  ADD COLUMN IF NOT EXISTS "district" TEXT,
  ADD COLUMN IF NOT EXISTS "state" TEXT,
  ADD COLUMN IF NOT EXISTS "postalCode" TEXT,
  ADD COLUMN IF NOT EXISTS "country" TEXT DEFAULT 'India',
  ADD COLUMN IF NOT EXISTS "emergencyContactName" TEXT,
  ADD COLUMN IF NOT EXISTS "emergencyContactRelation" TEXT,
  ADD COLUMN IF NOT EXISTS "emergencyContactPhone" TEXT,
  ADD COLUMN IF NOT EXISTS "emergencyContactAltPhone" TEXT,
  ADD COLUMN IF NOT EXISTS "allergyStatus" TEXT NOT NULL DEFAULT 'not_recorded',
  ADD COLUMN IF NOT EXISTS "medicalHistoryStatus" TEXT NOT NULL DEFAULT 'not_recorded',
  ADD COLUMN IF NOT EXISTS "pastMedicalHistory" TEXT,
  ADD COLUMN IF NOT EXISTS "pastSurgicalHistory" TEXT,
  ADD COLUMN IF NOT EXISTS "familyHistory" TEXT,
  ADD COLUMN IF NOT EXISTS "dischargeDate" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "isRegistered" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "registeredById" TEXT,
  ADD COLUMN IF NOT EXISTS "registeredByName" TEXT,
  ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "archivedById" TEXT,
  ADD COLUMN IF NOT EXISTS "archivedByName" TEXT,
  ADD COLUMN IF NOT EXISTS "archivedReason" TEXT;

-- 3. Indexes for fast demographic, identity and status searches
CREATE INDEX IF NOT EXISTS "patients_mrn_idx" ON "patients"("mrn");
CREATE INDEX IF NOT EXISTS "patients_phone_idx" ON "patients"("phone");
CREATE INDEX IF NOT EXISTS "patients_name_idx" ON "patients"("lastName", "firstName");
CREATE INDEX IF NOT EXISTS "patients_status_idx" ON "patients"("status");
CREATE INDEX IF NOT EXISTS "patients_createdAt_idx" ON "patients"("createdAt");

-- 4. Foreign key referential integrity constraints (onDelete: Restrict to prevent orphaned or deleted patient records)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'appointments_patientId_fkey') THEN
    ALTER TABLE "appointments" ADD CONSTRAINT "appointments_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'consultations_patientId_fkey') THEN
    ALTER TABLE "consultations" ADD CONSTRAINT "consultations_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'treatment_plans_patientId_fkey') THEN
    ALTER TABLE "treatment_plans" ADD CONSTRAINT "treatment_plans_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'panchakarma_courses_patientId_fkey') THEN
    ALTER TABLE "panchakarma_courses" ADD CONSTRAINT "panchakarma_courses_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'prescriptions_patientId_fkey') THEN
    ALTER TABLE "prescriptions" ADD CONSTRAINT "prescriptions_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lab_orders_patientId_fkey') THEN
    ALTER TABLE "lab_orders" ADD CONSTRAINT "lab_orders_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invoices_patientId_fkey') THEN
    ALTER TABLE "invoices" ADD CONSTRAINT "invoices_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

