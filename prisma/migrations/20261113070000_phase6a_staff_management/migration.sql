-- Sequence for institutional concurrency-safe Staff ID generation: STF-YYYY-XXXXX
CREATE SEQUENCE IF NOT EXISTS staff_id_seq START WITH 10001 INCREMENT BY 1;

-- Update users table with suspension, archive, and activation security fields
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "activationPinHash" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "pinAttempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "isSuspended" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "suspendedAt" TIMESTAMP(3);
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMP(3);

-- Update staff_members table to remove fabricated defaults and support full employment dossier
ALTER TABLE "staff_members" ALTER COLUMN "licenseNumber" DROP NOT NULL;
ALTER TABLE "staff_members" ALTER COLUMN "shift" DROP NOT NULL;
ALTER TABLE "staff_members" ALTER COLUMN "shift" DROP DEFAULT;
ALTER TABLE "staff_members" ALTER COLUMN "qualification" DROP NOT NULL;
ALTER TABLE "staff_members" ALTER COLUMN "qualification" DROP DEFAULT;
ALTER TABLE "staff_members" ALTER COLUMN "joiningDate" DROP NOT NULL;
ALTER TABLE "staff_members" ALTER COLUMN "status" SET DEFAULT 'pending_activation';

-- Add new employment, contact, professional, and lifecycle columns
ALTER TABLE "staff_members" ADD COLUMN IF NOT EXISTS "dateOfJoining" TIMESTAMP(3);
ALTER TABLE "staff_members" ADD COLUMN IF NOT EXISTS "address" TEXT;
ALTER TABLE "staff_members" ADD COLUMN IF NOT EXISTS "emergencyContactName" TEXT;
ALTER TABLE "staff_members" ADD COLUMN IF NOT EXISTS "emergencyContactPhone" TEXT;
ALTER TABLE "staff_members" ADD COLUMN IF NOT EXISTS "employmentType" TEXT;
ALTER TABLE "staff_members" ADD COLUMN IF NOT EXISTS "reportingTo" TEXT;
ALTER TABLE "staff_members" ADD COLUMN IF NOT EXISTS "discipline" TEXT;
ALTER TABLE "staff_members" ADD COLUMN IF NOT EXISTS "specialty" TEXT;
ALTER TABLE "staff_members" ADD COLUMN IF NOT EXISTS "userId" TEXT;
ALTER TABLE "staff_members" ADD COLUMN IF NOT EXISTS "activationPinHash" TEXT;
ALTER TABLE "staff_members" ADD COLUMN IF NOT EXISTS "pinAttempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "staff_members" ADD COLUMN IF NOT EXISTS "isSuspended" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "staff_members" ADD COLUMN IF NOT EXISTS "suspendedAt" TIMESTAMP(3);
ALTER TABLE "staff_members" ADD COLUMN IF NOT EXISTS "suspendedById" TEXT;
ALTER TABLE "staff_members" ADD COLUMN IF NOT EXISTS "suspendedByName" TEXT;
ALTER TABLE "staff_members" ADD COLUMN IF NOT EXISTS "suspendedReason" TEXT;
ALTER TABLE "staff_members" ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMP(3);
ALTER TABLE "staff_members" ADD COLUMN IF NOT EXISTS "archivedById" TEXT;
ALTER TABLE "staff_members" ADD COLUMN IF NOT EXISTS "archivedByName" TEXT;
ALTER TABLE "staff_members" ADD COLUMN IF NOT EXISTS "archivedReason" TEXT;
ALTER TABLE "staff_members" ADD COLUMN IF NOT EXISTS "createdById" TEXT;
ALTER TABLE "staff_members" ADD COLUMN IF NOT EXISTS "createdByName" TEXT;

-- Unique index for linked user identity
CREATE UNIQUE INDEX IF NOT EXISTS "staff_members_userId_key" ON "staff_members"("userId");

-- Foreign key linking staff_members to users
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'staff_members_userId_fkey') THEN
        ALTER TABLE "staff_members" ADD CONSTRAINT "staff_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

-- Operational query indexes
CREATE INDEX IF NOT EXISTS "staff_members_role_idx" ON "staff_members"("role");
CREATE INDEX IF NOT EXISTS "staff_members_department_idx" ON "staff_members"("department");
CREATE INDEX IF NOT EXISTS "staff_members_status_idx" ON "staff_members"("status");
CREATE INDEX IF NOT EXISTS "staff_members_email_idx" ON "staff_members"("email");

