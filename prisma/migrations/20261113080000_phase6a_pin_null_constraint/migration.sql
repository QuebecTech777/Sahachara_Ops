-- Phase 6A Hardening: Plaintext Activation PIN Database-Level Null Constraint
-- Ensures plaintext activation PIN can NEVER be persisted in PostgreSQL

-- 1. Clear any legacy activation PINs in test or transitional data
UPDATE "staff_members" SET "activationPin" = NULL WHERE "activationPin" IS NOT NULL;
UPDATE "users" SET "activationPin" = NULL WHERE "activationPin" IS NOT NULL;

-- 2. Add database-level CHECK constraints
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'staff_members_activationPin_null_check') THEN
        ALTER TABLE "staff_members" ADD CONSTRAINT "staff_members_activationPin_null_check" CHECK ("activationPin" IS NULL);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_activationPin_null_check') THEN
        ALTER TABLE "users" ADD CONSTRAINT "users_activationPin_null_check" CHECK ("activationPin" IS NULL);
    END IF;
END $$;

