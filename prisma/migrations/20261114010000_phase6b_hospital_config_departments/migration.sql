-- ==============================================================================
-- SAHACHARA OPS — PHASE 6B: HOSPITAL CONFIGURATION & DEPARTMENT MANAGEMENT
-- Migration: 20261114010000_phase6b_hospital_config_departments
-- ==============================================================================

-- 1. Create Enums for Discipline and Assignment Status (Idempotent)
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'DepartmentDiscipline') THEN
        CREATE TYPE "DepartmentDiscipline" AS ENUM ('AYURVEDA', 'MODERN_MEDICINE', 'OPERATIONAL', 'ALLIED');
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AssignmentStatus') THEN
        CREATE TYPE "AssignmentStatus" AS ENUM ('active', 'completed', 'transferred', 'revoked');
    END IF;
END $$;

-- 2. Create Table: hospital_profiles (Singleton Master Record)
CREATE TABLE IF NOT EXISTS "hospital_profiles" (
    "id" TEXT NOT NULL,
    "singletonKey" TEXT NOT NULL DEFAULT 'PRIMARY_INSTITUTION',
    "code" TEXT NOT NULL DEFAULT 'SAH',
    "legalName" TEXT NOT NULL DEFAULT 'Sahachara Ayurveda Yoga Ecoliving',
    "displayName" TEXT NOT NULL DEFAULT 'Sahachara Ayurveda',
    "address" TEXT,
    "city" TEXT,
    "state" TEXT,
    "country" TEXT DEFAULT 'India',
    "postalCode" TEXT,
    "phone" TEXT,
    "emergencyPhone" TEXT,
    "email" TEXT,
    "website" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedById" TEXT,
    "updatedByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hospital_profiles_pkey" PRIMARY KEY ("id")
);

-- Unique index and CHECK constraint to enforce singleton invariant
CREATE UNIQUE INDEX IF NOT EXISTS "hospital_profiles_singletonKey_key" ON "hospital_profiles"("singletonKey");

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'hospital_profiles_singleton_check') THEN
        ALTER TABLE "hospital_profiles" ADD CONSTRAINT "hospital_profiles_singleton_check" CHECK ("singletonKey" = 'PRIMARY_INSTITUTION');
    END IF;
END $$;

-- Authoritative Initial Hospital Profile Seed (Idempotent, using verified CLINIC_METADATA only)
INSERT INTO "hospital_profiles" (
    "id",
    "singletonKey",
    "code",
    "legalName",
    "displayName",
    "address",
    "city",
    "state",
    "country",
    "postalCode",
    "phone",
    "emergencyPhone",
    "email",
    "website",
    "timezone",
    "currency",
    "version",
    "createdAt",
    "updatedAt"
) VALUES (
    'prf-sahachara-inst',
    'PRIMARY_INSTITUTION',
    'SAH',
    'Sahachara Ayurveda Yoga Ecoliving',
    'Sahachara Ayurveda',
    'Mannamkala Road, Munnar Hills',
    'Adimali',
    'Kerala',
    'India',
    '685561',
    '+91 486 422 3400',
    NULL,
    NULL,
    NULL,
    'Asia/Kolkata',
    'INR',
    1,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
) ON CONFLICT ("singletonKey") DO NOTHING;

-- 3. Create Table: departments
CREATE TABLE IF NOT EXISTS "departments" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "discipline" "DepartmentDiscipline" NOT NULL DEFAULT 'OPERATIONAL',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "deactivatedAt" TIMESTAMP(3),
    "deactivatedById" TEXT,
    "deactivatedByName" TEXT,
    "deactivationReason" TEXT,
    "createdById" TEXT,
    "createdByName" TEXT,
    "updatedById" TEXT,
    "updatedByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

-- Department unique indexes: code and exact name
CREATE UNIQUE INDEX IF NOT EXISTS "departments_code_key" ON "departments"("code");
CREATE UNIQUE INDEX IF NOT EXISTS "departments_name_key" ON "departments"("name");

-- Department case-insensitive normalized unique index: LOWER(TRIM(name))
CREATE UNIQUE INDEX IF NOT EXISTS "departments_name_lower_idx" ON "departments" (LOWER(TRIM("name")));

-- Operational query indexes on discipline and isActive
CREATE INDEX IF NOT EXISTS "departments_discipline_idx" ON "departments"("discipline");
CREATE INDEX IF NOT EXISTS "departments_isActive_idx" ON "departments"("isActive");

-- 4. Create Table: staff_department_assignments
CREATE TABLE IF NOT EXISTS "staff_department_assignments" (
    "id" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "roleTitle" TEXT,
    "status" "AssignmentStatus" NOT NULL DEFAULT 'active',
    "startDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endDate" TIMESTAMP(3),
    "assignedById" TEXT,
    "assignedByName" TEXT,
    "revokedById" TEXT,
    "revokedByName" TEXT,
    "revocationReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_department_assignments_pkey" PRIMARY KEY ("id")
);

-- Foreign keys with ON DELETE RESTRICT (Never cascade delete historical assignments)
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'staff_department_assignments_staffId_fkey') THEN
        ALTER TABLE "staff_department_assignments" ADD CONSTRAINT "staff_department_assignments_staffId_fkey"
            FOREIGN KEY ("staffId") REFERENCES "staff_members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'staff_department_assignments_departmentId_fkey') THEN
        ALTER TABLE "staff_department_assignments" ADD CONSTRAINT "staff_department_assignments_departmentId_fkey"
            FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;

-- Query indexes
CREATE INDEX IF NOT EXISTS "staff_department_assignments_staffId_idx" ON "staff_department_assignments"("staffId");
CREATE INDEX IF NOT EXISTS "staff_department_assignments_departmentId_idx" ON "staff_department_assignments"("departmentId");
CREATE INDEX IF NOT EXISTS "staff_department_assignments_status_idx" ON "staff_department_assignments"("status");
CREATE INDEX IF NOT EXISTS "staff_department_assignments_isPrimary_idx" ON "staff_department_assignments"("isPrimary");

-- PostgreSQL Partial Unique Index: Exactly one active primary assignment at most per staff member
CREATE UNIQUE INDEX IF NOT EXISTS "staff_dept_active_primary_idx" ON "staff_department_assignments" ("staffId")
    WHERE ("isPrimary" = true AND "status" = 'active');

-- 5. Extend staff_members with primaryDepartmentId foreign key
ALTER TABLE "staff_members" ADD COLUMN IF NOT EXISTS "primaryDepartmentId" TEXT;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'staff_members_primaryDepartmentId_fkey') THEN
        ALTER TABLE "staff_members" ADD CONSTRAINT "staff_members_primaryDepartmentId_fkey"
            FOREIGN KEY ("primaryDepartmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS "staff_members_primaryDepartmentId_idx" ON "staff_members"("primaryDepartmentId");

