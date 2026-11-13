-- Drop default duration of 30 minutes from appointments and make nullable
ALTER TABLE "appointments" ALTER COLUMN "durationMinutes" DROP DEFAULT;
ALTER TABLE "appointments" ALTER COLUMN "durationMinutes" DROP NOT NULL;

-- Add Emergency Escalation & Clinical Triage Governance fields
ALTER TABLE "appointments"
  ADD COLUMN IF NOT EXISTS "isEscalated" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "escalatedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "escalatedById" TEXT,
  ADD COLUMN IF NOT EXISTS "escalatedByName" TEXT,
  ADD COLUMN IF NOT EXISTS "escalationReason" TEXT,
  ADD COLUMN IF NOT EXISTS "clinicalTriageAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "clinicalTriageById" TEXT,
  ADD COLUMN IF NOT EXISTS "clinicalTriageRole" TEXT,
  ADD COLUMN IF NOT EXISTS "clinicalDocumentationCompleted" BOOLEAN NOT NULL DEFAULT false;

