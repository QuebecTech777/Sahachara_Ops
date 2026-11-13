-- Create Sequences for Phase 3 Clinical Operations
CREATE SEQUENCE IF NOT EXISTS clinical_encounter_seq START WITH 10001;
CREATE SEQUENCE IF NOT EXISTS panchakarma_referral_seq START WITH 10001;

-- AlterTable
ALTER TABLE "appointments" ADD COLUMN IF NOT EXISTS "escalationAcknowledgedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "escalationAcknowledgedById" TEXT,
ADD COLUMN IF NOT EXISTS "escalationAcknowledgedByName" TEXT,
ADD COLUMN IF NOT EXISTS "escalationResolutionNotes" TEXT,
ADD COLUMN IF NOT EXISTS "escalationResolvedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "escalationResolvedById" TEXT,
ADD COLUMN IF NOT EXISTS "escalationResolvedByName" TEXT,
ADD COLUMN IF NOT EXISTS "escalationStatus" TEXT;

-- AlterTable
ALTER TABLE "lab_orders" ADD COLUMN IF NOT EXISTS "clinicalIndication" TEXT,
ADD COLUMN IF NOT EXISTS "encounterId" TEXT,
ADD COLUMN IF NOT EXISTS "orderingPractitionerId" TEXT,
ADD COLUMN IF NOT EXISTS "orderingPractitionerRole" TEXT DEFAULT 'DOCTOR',
ADD COLUMN IF NOT EXISTS "resultAttribution" TEXT,
ADD COLUMN IF NOT EXISTS "resultAttributionId" TEXT,
ADD COLUMN IF NOT EXISTS "resultTimestamp" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "reviewNotes" TEXT,
ADD COLUMN IF NOT EXISTS "reviewedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "reviewedById" TEXT,
ADD COLUMN IF NOT EXISTS "reviewedByName" TEXT,
ADD COLUMN IF NOT EXISTS "sampleCollectedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "sampleCollectedBy" TEXT;

-- AlterTable
ALTER TABLE "prescriptions" ADD COLUMN IF NOT EXISTS "amendmentHistory" JSONB,
ADD COLUMN IF NOT EXISTS "encounterId" TEXT,
ADD COLUMN IF NOT EXISTS "instructions" TEXT,
ADD COLUMN IF NOT EXISTS "medicationId" TEXT,
ADD COLUMN IF NOT EXISTS "prescribingPractitionerRole" TEXT DEFAULT 'DOCTOR',
ADD COLUMN IF NOT EXISTS "quantity" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "treatment_plans" ADD COLUMN IF NOT EXISTS "encounterId" TEXT,
ADD COLUMN IF NOT EXISTS "instructions" TEXT,
ADD COLUMN IF NOT EXISTS "practitionerRole" TEXT DEFAULT 'VAIDYA';

-- CreateTable
CREATE TABLE IF NOT EXISTS "clinical_encounters" (
    "id" TEXT NOT NULL,
    "encounterNumber" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "appointmentId" TEXT,
    "practitionerId" TEXT NOT NULL,
    "practitionerName" TEXT NOT NULL,
    "practitionerRole" TEXT NOT NULL,
    "discipline" TEXT NOT NULL,
    "encounterType" TEXT NOT NULL DEFAULT 'consultation',
    "status" TEXT NOT NULL DEFAULT 'in_progress',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "reasonForVisit" TEXT,
    "clinicalDocumentationCompleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clinical_encounters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "clinical_vitals" (
    "id" TEXT NOT NULL,
    "encounterId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recordedById" TEXT NOT NULL,
    "recordedByName" TEXT NOT NULL,
    "recordedByRole" TEXT NOT NULL,
    "bpSystolic" INTEGER,
    "bpDiastolic" INTEGER,
    "heartRate" INTEGER,
    "respiratoryRate" INTEGER,
    "temperature" DECIMAL(5,2),
    "temperatureUnit" TEXT DEFAULT 'F',
    "spO2" INTEGER,
    "height" DECIMAL(5,2),
    "weight" DECIMAL(5,2),
    "bmi" DECIMAL(5,2),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clinical_vitals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "clinical_assessments" (
    "id" TEXT NOT NULL,
    "encounterId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "practitionerId" TEXT NOT NULL,
    "practitionerName" TEXT NOT NULL,
    "practitionerRole" TEXT NOT NULL,
    "presentingComplaints" TEXT,
    "historyOfPresentingIllness" TEXT,
    "physicalExamination" TEXT,
    "systemicExamination" JSONB,
    "clinicalObservations" TEXT,
    "clinicalImpression" TEXT,
    "differentialDiagnosis" TEXT,
    "clinicalPlan" TEXT,
    "followUpAdvice" TEXT,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clinical_assessments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "clinical_diagnoses" (
    "id" TEXT NOT NULL,
    "encounterId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "practitionerId" TEXT NOT NULL,
    "practitionerName" TEXT NOT NULL,
    "practitionerRole" TEXT NOT NULL,
    "diagnosisType" TEXT NOT NULL DEFAULT 'provisional',
    "icdCode" TEXT,
    "diagnosisName" TEXT NOT NULL,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clinical_diagnoses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "prakriti_assessments" (
    "id" TEXT NOT NULL,
    "encounterId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "practitionerId" TEXT NOT NULL,
    "practitionerName" TEXT NOT NULL,
    "vataScore" DECIMAL(5,2) NOT NULL,
    "pittaScore" DECIMAL(5,2) NOT NULL,
    "kaphaScore" DECIMAL(5,2) NOT NULL,
    "dominantPrakriti" TEXT NOT NULL,
    "physicalCharacteristics" JSONB,
    "physiologicalCharacteristics" JSONB,
    "psychologicalCharacteristics" JSONB,
    "clinicalInterpretation" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "prakriti_assessments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "vikriti_assessments" (
    "id" TEXT NOT NULL,
    "encounterId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "practitionerId" TEXT NOT NULL,
    "practitionerName" TEXT NOT NULL,
    "primaryVikriti" TEXT NOT NULL,
    "secondaryVikriti" TEXT,
    "vataAggravation" TEXT,
    "pittaAggravation" TEXT,
    "kaphaAggravation" TEXT,
    "clinicalInterpretation" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vikriti_assessments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "dosha_evaluations" (
    "id" TEXT NOT NULL,
    "encounterId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "practitionerId" TEXT NOT NULL,
    "practitionerName" TEXT NOT NULL,
    "agniStatus" TEXT,
    "amaStatus" TEXT,
    "koshthaType" TEXT,
    "dhatuInvolvement" JSONB,
    "srotasInvolvement" JSONB,
    "ashtaVidhaPariksha" JSONB,
    "clinicalInterpretation" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dosha_evaluations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "panchakarma_referrals" (
    "id" TEXT NOT NULL,
    "referralNumber" TEXT NOT NULL,
    "encounterId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "practitionerId" TEXT NOT NULL,
    "practitionerName" TEXT NOT NULL,
    "proposedProcedure" TEXT NOT NULL,
    "clinicalIndication" TEXT NOT NULL,
    "preliminaryNotes" TEXT,
    "urgency" TEXT NOT NULL DEFAULT 'routine',
    "status" TEXT NOT NULL DEFAULT 'referred',
    "referredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "panchakarma_referrals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "clinical_encounters_encounterNumber_key" ON "clinical_encounters"("encounterNumber");
CREATE INDEX IF NOT EXISTS "clinical_encounters_patientId_idx" ON "clinical_encounters"("patientId");
CREATE INDEX IF NOT EXISTS "clinical_encounters_appointmentId_idx" ON "clinical_encounters"("appointmentId");
CREATE INDEX IF NOT EXISTS "clinical_encounters_practitionerId_idx" ON "clinical_encounters"("practitionerId");
CREATE INDEX IF NOT EXISTS "clinical_encounters_discipline_idx" ON "clinical_encounters"("discipline");
CREATE INDEX IF NOT EXISTS "clinical_encounters_status_idx" ON "clinical_encounters"("status");

CREATE INDEX IF NOT EXISTS "clinical_vitals_encounterId_idx" ON "clinical_vitals"("encounterId");
CREATE INDEX IF NOT EXISTS "clinical_vitals_patientId_idx" ON "clinical_vitals"("patientId");

CREATE INDEX IF NOT EXISTS "clinical_assessments_encounterId_idx" ON "clinical_assessments"("encounterId");
CREATE INDEX IF NOT EXISTS "clinical_assessments_patientId_idx" ON "clinical_assessments"("patientId");

CREATE INDEX IF NOT EXISTS "clinical_diagnoses_encounterId_idx" ON "clinical_diagnoses"("encounterId");
CREATE INDEX IF NOT EXISTS "clinical_diagnoses_patientId_idx" ON "clinical_diagnoses"("patientId");

CREATE INDEX IF NOT EXISTS "prakriti_assessments_encounterId_idx" ON "prakriti_assessments"("encounterId");
CREATE INDEX IF NOT EXISTS "prakriti_assessments_patientId_idx" ON "prakriti_assessments"("patientId");

CREATE INDEX IF NOT EXISTS "vikriti_assessments_encounterId_idx" ON "vikriti_assessments"("encounterId");
CREATE INDEX IF NOT EXISTS "vikriti_assessments_patientId_idx" ON "vikriti_assessments"("patientId");

CREATE INDEX IF NOT EXISTS "dosha_evaluations_encounterId_idx" ON "dosha_evaluations"("encounterId");
CREATE INDEX IF NOT EXISTS "dosha_evaluations_patientId_idx" ON "dosha_evaluations"("patientId");

CREATE UNIQUE INDEX IF NOT EXISTS "panchakarma_referrals_referralNumber_key" ON "panchakarma_referrals"("referralNumber");
CREATE INDEX IF NOT EXISTS "panchakarma_referrals_encounterId_idx" ON "panchakarma_referrals"("encounterId");
CREATE INDEX IF NOT EXISTS "panchakarma_referrals_patientId_idx" ON "panchakarma_referrals"("patientId");

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'treatment_plans_encounterId_fkey') THEN
    ALTER TABLE "treatment_plans" ADD CONSTRAINT "treatment_plans_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "clinical_encounters"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'prescriptions_encounterId_fkey') THEN
    ALTER TABLE "prescriptions" ADD CONSTRAINT "prescriptions_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "clinical_encounters"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lab_orders_encounterId_fkey') THEN
    ALTER TABLE "lab_orders" ADD CONSTRAINT "lab_orders_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "clinical_encounters"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'clinical_encounters_patientId_fkey') THEN
    ALTER TABLE "clinical_encounters" ADD CONSTRAINT "clinical_encounters_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'clinical_encounters_appointmentId_fkey') THEN
    ALTER TABLE "clinical_encounters" ADD CONSTRAINT "clinical_encounters_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "appointments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'clinical_encounters_practitionerId_fkey') THEN
    ALTER TABLE "clinical_encounters" ADD CONSTRAINT "clinical_encounters_practitionerId_fkey" FOREIGN KEY ("practitionerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'clinical_vitals_encounterId_fkey') THEN
    ALTER TABLE "clinical_vitals" ADD CONSTRAINT "clinical_vitals_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "clinical_encounters"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'clinical_vitals_patientId_fkey') THEN
    ALTER TABLE "clinical_vitals" ADD CONSTRAINT "clinical_vitals_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'clinical_assessments_encounterId_fkey') THEN
    ALTER TABLE "clinical_assessments" ADD CONSTRAINT "clinical_assessments_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "clinical_encounters"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'clinical_assessments_patientId_fkey') THEN
    ALTER TABLE "clinical_assessments" ADD CONSTRAINT "clinical_assessments_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'clinical_diagnoses_encounterId_fkey') THEN
    ALTER TABLE "clinical_diagnoses" ADD CONSTRAINT "clinical_diagnoses_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "clinical_encounters"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'clinical_diagnoses_patientId_fkey') THEN
    ALTER TABLE "clinical_diagnoses" ADD CONSTRAINT "clinical_diagnoses_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'prakriti_assessments_encounterId_fkey') THEN
    ALTER TABLE "prakriti_assessments" ADD CONSTRAINT "prakriti_assessments_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "clinical_encounters"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'prakriti_assessments_patientId_fkey') THEN
    ALTER TABLE "prakriti_assessments" ADD CONSTRAINT "prakriti_assessments_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vikriti_assessments_encounterId_fkey') THEN
    ALTER TABLE "vikriti_assessments" ADD CONSTRAINT "vikriti_assessments_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "clinical_encounters"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vikriti_assessments_patientId_fkey') THEN
    ALTER TABLE "vikriti_assessments" ADD CONSTRAINT "vikriti_assessments_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'dosha_evaluations_encounterId_fkey') THEN
    ALTER TABLE "dosha_evaluations" ADD CONSTRAINT "dosha_evaluations_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "clinical_encounters"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'dosha_evaluations_patientId_fkey') THEN
    ALTER TABLE "dosha_evaluations" ADD CONSTRAINT "dosha_evaluations_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'panchakarma_referrals_encounterId_fkey') THEN
    ALTER TABLE "panchakarma_referrals" ADD CONSTRAINT "panchakarma_referrals_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "clinical_encounters"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'panchakarma_referrals_patientId_fkey') THEN
    ALTER TABLE "panchakarma_referrals" ADD CONSTRAINT "panchakarma_referrals_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

