-- Sequence for unique appointment reference (APT-YYYY-XXXXX)
CREATE SEQUENCE IF NOT EXISTS appointment_ref_seq START WITH 10001;

-- AlterTable
ALTER TABLE "appointments"
  ADD COLUMN IF NOT EXISTS "appointmentNumber" TEXT,
  ADD COLUMN IF NOT EXISTS "practitionerId" TEXT,
  ADD COLUMN IF NOT EXISTS "practitionerName" TEXT,
  ADD COLUMN IF NOT EXISTS "practitionerRole" TEXT,
  ADD COLUMN IF NOT EXISTS "appointmentDate" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "durationMinutes" INTEGER NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS "scheduledStartTime" TEXT,
  ADD COLUMN IF NOT EXISTS "scheduledEndTime" TEXT,
  ADD COLUMN IF NOT EXISTS "bookingSource" TEXT NOT NULL DEFAULT 'reception_scheduled',
  ADD COLUMN IF NOT EXISTS "reasonForVisit" TEXT,
  ADD COLUMN IF NOT EXISTS "receptionNotes" TEXT,
  ADD COLUMN IF NOT EXISTS "cancellationReason" TEXT,
  ADD COLUMN IF NOT EXISTS "checkInTime" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "queuePosition" INTEGER,
  ADD COLUMN IF NOT EXISTS "priority" TEXT NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS "priorityReason" TEXT,
  ADD COLUMN IF NOT EXISTS "consultationStartTime" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "completedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "rescheduledFromId" TEXT,
  ADD COLUMN IF NOT EXISTS "reschedulingHistory" JSONB,
  ADD COLUMN IF NOT EXISTS "createdById" TEXT,
  ADD COLUMN IF NOT EXISTS "createdByName" TEXT,
  ADD COLUMN IF NOT EXISTS "updatedById" TEXT,
  ADD COLUMN IF NOT EXISTS "updatedByName" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "appointments_appointmentNumber_key" ON "appointments"("appointmentNumber");
CREATE INDEX IF NOT EXISTS "appointments_patientId_idx" ON "appointments"("patientId");
CREATE INDEX IF NOT EXISTS "appointments_practitionerId_idx" ON "appointments"("practitionerId");
CREATE INDEX IF NOT EXISTS "appointments_appointmentNumber_idx" ON "appointments"("appointmentNumber");
CREATE INDEX IF NOT EXISTS "appointments_status_idx" ON "appointments"("status");
CREATE INDEX IF NOT EXISTS "appointments_appointmentDate_idx" ON "appointments"("appointmentDate");
CREATE INDEX IF NOT EXISTS "appointments_dateTime_idx" ON "appointments"("dateTime");
CREATE INDEX IF NOT EXISTS "appointments_practitionerRole_idx" ON "appointments"("practitionerRole");
CREATE INDEX IF NOT EXISTS "appointments_queuePosition_idx" ON "appointments"("queuePosition");

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'appointments_practitionerId_fkey'
  ) THEN
    ALTER TABLE "appointments"
      ADD CONSTRAINT "appointments_practitionerId_fkey"
      FOREIGN KEY ("practitionerId") REFERENCES "users"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

