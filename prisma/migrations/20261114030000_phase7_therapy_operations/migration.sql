-- ==============================================================================
-- SAHACHARA OPS — PHASE 7: AYURVEDIC THERAPY, PANCHAKARMA & ROOM OPERATIONS
-- Migration: 20261114030000_phase7_therapy_operations
-- ==============================================================================

-- 1. Create Enums idempotently
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'TherapyRoomType') THEN
        CREATE TYPE "TherapyRoomType" AS ENUM ('MASSAGE_DRONI_ROOM', 'SHIRODHARA_ROOM', 'SWEDANA_STEAM_ROOM', 'PANCHAKARMA_PROCEDURE_ROOM');
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'RoomOperationalStatus') THEN
        CREATE TYPE "RoomOperationalStatus" AS ENUM ('AVAILABLE', 'OCCUPIED', 'SANITIZING', 'MAINTENANCE');
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SessionExecutionStatus') THEN
        CREATE TYPE "SessionExecutionStatus" AS ENUM ('SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW', 'ABORTED');
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PanchakarmaPhase') THEN
        CREATE TYPE "PanchakarmaPhase" AS ENUM ('PURVAKARMA', 'PRADHANAKARMA', 'PASCHATKARMA', 'COMPLETED');
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SessionBillingMode') THEN
        CREATE TYPE "SessionBillingMode" AS ENUM ('PER_SESSION', 'PACKAGE_COVERED', 'UNBILLED');
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PanchakarmaBillingMode') THEN
        CREATE TYPE "PanchakarmaBillingMode" AS ENUM ('PER_SESSION', 'PACKAGE_BILLED');
    END IF;
END $$;

-- 2. Alter PanchakarmaCourse with Phase 7 Extensions
ALTER TABLE "panchakarma_courses" 
ADD COLUMN IF NOT EXISTS "referralId" TEXT,
ADD COLUMN IF NOT EXISTS "responsibleVaidyaId" TEXT,
ADD COLUMN IF NOT EXISTS "startDateActual" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "completedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "pausedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "pauseReason" TEXT,
ADD COLUMN IF NOT EXISTS "terminatedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "terminationReason" TEXT,
ADD COLUMN IF NOT EXISTS "billingMode" "PanchakarmaBillingMode" NOT NULL DEFAULT 'PER_SESSION',
ADD COLUMN IF NOT EXISTS "packageTariffId" TEXT,
ADD COLUMN IF NOT EXISTS "packageInvoiceId" TEXT,
ADD COLUMN IF NOT EXISTS "isPackageBilled" BOOLEAN NOT NULL DEFAULT false;

-- 3. Create Table: therapy_rooms
CREATE TABLE IF NOT EXISTS "therapy_rooms" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "roomType" "TherapyRoomType" NOT NULL,
    "status" "RoomOperationalStatus" NOT NULL DEFAULT 'AVAILABLE',
    "departmentId" TEXT,
    "bufferMinutes" INTEGER NOT NULL DEFAULT 15,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "therapy_rooms_pkey" PRIMARY KEY ("id")
);

-- 4. Create Table: therapy_sessions
CREATE TABLE IF NOT EXISTS "therapy_sessions" (
    "id" TEXT NOT NULL,
    "sessionNumber" INTEGER NOT NULL,
    "sessionRef" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "treatmentPlanId" TEXT,
    "panchakarmaCourseId" TEXT,
    "roomId" TEXT,
    "roomCodeSnapshot" TEXT NOT NULL,
    "roomNameSnapshot" TEXT NOT NULL,
    "administeringStaffId" TEXT NOT NULL,
    "responsibleVaidyaId" TEXT NOT NULL,
    "scheduledStartAt" TIMESTAMP(3) NOT NULL,
    "scheduledEndAt" TIMESTAMP(3) NOT NULL,
    "actualStartAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "status" "SessionExecutionStatus" NOT NULL DEFAULT 'SCHEDULED',
    "preProcedureAssessment" JSONB,
    "postProcedureAssessment" JSONB,
    "clinicalNotes" TEXT,
    "cancellationReason" TEXT,
    "tariffId" TEXT,
    "billableAmount" DECIMAL(12,2),
    "billingMode" "SessionBillingMode" NOT NULL DEFAULT 'UNBILLED',
    "isBilled" BOOLEAN NOT NULL DEFAULT false,
    "invoiceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "therapy_sessions_pkey" PRIMARY KEY ("id")
);

-- 5. Create Table: panchakarma_phase_transitions
CREATE TABLE IF NOT EXISTS "panchakarma_phase_transitions" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "previousPhase" "PanchakarmaPhase" NOT NULL,
    "newPhase" "PanchakarmaPhase" NOT NULL,
    "authorizedById" TEXT NOT NULL,
    "authorizedByName" TEXT NOT NULL,
    "authorizedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clinicalRationale" TEXT NOT NULL,
    "dietaryTransitionNotes" TEXT,
    "nextProcedureInstructions" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "panchakarma_phase_transitions_pkey" PRIMARY KEY ("id")
);

-- 6. Create Table: staff_therapy_authorizations
CREATE TABLE IF NOT EXISTS "staff_therapy_authorizations" (
    "id" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "approvedQualification" TEXT NOT NULL,
    "authorizedTherapyTypes" JSONB,
    "verifiedById" TEXT NOT NULL,
    "verifiedByName" TEXT NOT NULL,
    "verifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isRevoked" BOOLEAN NOT NULL DEFAULT false,
    "revokedAt" TIMESTAMP(3),
    "revokedById" TEXT,
    "revokedByName" TEXT,
    "revocationReason" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_therapy_authorizations_pkey" PRIMARY KEY ("id")
);

-- 7. Unique Constraints and Indexes
CREATE UNIQUE INDEX IF NOT EXISTS "therapy_rooms_code_key" ON "therapy_rooms"("code");
CREATE INDEX IF NOT EXISTS "therapy_rooms_status_idx" ON "therapy_rooms"("status");
CREATE INDEX IF NOT EXISTS "therapy_rooms_roomType_idx" ON "therapy_rooms"("roomType");

CREATE UNIQUE INDEX IF NOT EXISTS "therapy_sessions_sessionRef_key" ON "therapy_sessions"("sessionRef");
CREATE INDEX IF NOT EXISTS "therapy_sessions_patientId_idx" ON "therapy_sessions"("patientId");
CREATE INDEX IF NOT EXISTS "therapy_sessions_treatmentPlanId_idx" ON "therapy_sessions"("treatmentPlanId");
CREATE INDEX IF NOT EXISTS "therapy_sessions_panchakarmaCourseId_idx" ON "therapy_sessions"("panchakarmaCourseId");
CREATE INDEX IF NOT EXISTS "therapy_sessions_roomId_scheduledStartAt_scheduledEndAt_idx" ON "therapy_sessions"("roomId", "scheduledStartAt", "scheduledEndAt");
CREATE INDEX IF NOT EXISTS "therapy_sessions_administeringStaffId_scheduledStartAt_sche_idx" ON "therapy_sessions"("administeringStaffId", "scheduledStartAt", "scheduledEndAt");
CREATE INDEX IF NOT EXISTS "therapy_sessions_responsibleVaidyaId_scheduledStartAt_sched_idx" ON "therapy_sessions"("responsibleVaidyaId", "scheduledStartAt", "scheduledEndAt");
CREATE INDEX IF NOT EXISTS "therapy_sessions_status_idx" ON "therapy_sessions"("status");
CREATE INDEX IF NOT EXISTS "therapy_sessions_isBilled_idx" ON "therapy_sessions"("isBilled");

CREATE UNIQUE INDEX IF NOT EXISTS "panchakarma_courses_referralId_key" ON "panchakarma_courses"("referralId");
CREATE INDEX IF NOT EXISTS "panchakarma_phase_transitions_courseId_idx" ON "panchakarma_phase_transitions"("courseId");

CREATE INDEX IF NOT EXISTS "staff_therapy_authorizations_staffId_idx" ON "staff_therapy_authorizations"("staffId");
CREATE INDEX IF NOT EXISTS "staff_therapy_authorizations_isRevoked_idx" ON "staff_therapy_authorizations"("isRevoked");

-- 8. Foreign Key Constraints (Strict Historical Record Protection)
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'panchakarma_courses_referralId_fkey') THEN
        ALTER TABLE "panchakarma_courses" ADD CONSTRAINT "panchakarma_courses_referralId_fkey" FOREIGN KEY ("referralId") REFERENCES "panchakarma_referrals"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'panchakarma_courses_responsibleVaidyaId_fkey') THEN
        ALTER TABLE "panchakarma_courses" ADD CONSTRAINT "panchakarma_courses_responsibleVaidyaId_fkey" FOREIGN KEY ("responsibleVaidyaId") REFERENCES "staff_members"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'panchakarma_courses_packageTariffId_fkey') THEN
        ALTER TABLE "panchakarma_courses" ADD CONSTRAINT "panchakarma_courses_packageTariffId_fkey" FOREIGN KEY ("packageTariffId") REFERENCES "hospital_tariffs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'panchakarma_courses_packageInvoiceId_fkey') THEN
        ALTER TABLE "panchakarma_courses" ADD CONSTRAINT "panchakarma_courses_packageInvoiceId_fkey" FOREIGN KEY ("packageInvoiceId") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'therapy_rooms_departmentId_fkey') THEN
        ALTER TABLE "therapy_rooms" ADD CONSTRAINT "therapy_rooms_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'therapy_sessions_patientId_fkey') THEN
        ALTER TABLE "therapy_sessions" ADD CONSTRAINT "therapy_sessions_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'therapy_sessions_treatmentPlanId_fkey') THEN
        ALTER TABLE "therapy_sessions" ADD CONSTRAINT "therapy_sessions_treatmentPlanId_fkey" FOREIGN KEY ("treatmentPlanId") REFERENCES "treatment_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'therapy_sessions_panchakarmaCourseId_fkey') THEN
        ALTER TABLE "therapy_sessions" ADD CONSTRAINT "therapy_sessions_panchakarmaCourseId_fkey" FOREIGN KEY ("panchakarmaCourseId") REFERENCES "panchakarma_courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'therapy_sessions_roomId_fkey') THEN
        ALTER TABLE "therapy_sessions" ADD CONSTRAINT "therapy_sessions_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "therapy_rooms"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'therapy_sessions_administeringStaffId_fkey') THEN
        ALTER TABLE "therapy_sessions" ADD CONSTRAINT "therapy_sessions_administeringStaffId_fkey" FOREIGN KEY ("administeringStaffId") REFERENCES "staff_members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'therapy_sessions_responsibleVaidyaId_fkey') THEN
        ALTER TABLE "therapy_sessions" ADD CONSTRAINT "therapy_sessions_responsibleVaidyaId_fkey" FOREIGN KEY ("responsibleVaidyaId") REFERENCES "staff_members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'therapy_sessions_tariffId_fkey') THEN
        ALTER TABLE "therapy_sessions" ADD CONSTRAINT "therapy_sessions_tariffId_fkey" FOREIGN KEY ("tariffId") REFERENCES "hospital_tariffs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'therapy_sessions_invoiceId_fkey') THEN
        ALTER TABLE "therapy_sessions" ADD CONSTRAINT "therapy_sessions_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'panchakarma_phase_transitions_courseId_fkey') THEN
        ALTER TABLE "panchakarma_phase_transitions" ADD CONSTRAINT "panchakarma_phase_transitions_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "panchakarma_courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'staff_therapy_authorizations_staffId_fkey') THEN
        ALTER TABLE "staff_therapy_authorizations" ADD CONSTRAINT "staff_therapy_authorizations_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "staff_members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;
