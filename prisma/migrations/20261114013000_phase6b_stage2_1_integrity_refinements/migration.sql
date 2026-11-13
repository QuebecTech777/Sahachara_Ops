-- ==============================================================================
-- SAHACHARA OPS — PHASE 6B STAGE 2.1: DATABASE INTEGRITY REFINEMENTS
-- Migration: 20261114013000_phase6b_stage2_1_integrity_refinements
-- ==============================================================================

-- 1. Department code format validation constraint:
-- Enforces: uppercase characters and numbers only, length between 2 and 10 characters.
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'departments_code_format_check') THEN
        ALTER TABLE "departments" ADD CONSTRAINT "departments_code_format_check"
            CHECK ("code" ~ '^[A-Z0-9]{2,10}$');
    END IF;
END $$;

-- 2. HospitalProfile singleton protection trigger:
-- Protects against:
-- a) Deletion of the singleton institutional profile.
-- b) Modification of the "singletonKey" column.
CREATE OR REPLACE FUNCTION protect_hospital_profile_singleton()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'INSTITUTIONAL_PROFILE_CANNOT_BE_DELETED: The singleton hospital institutional profile is an immutable structural record and cannot be deleted.'
            USING ERRCODE = '55000';
    ELSIF TG_OP = 'UPDATE' THEN
        IF NEW."singletonKey" <> OLD."singletonKey" THEN
            RAISE EXCEPTION 'INSTITUTIONAL_SINGLETON_KEY_IMMUTABLE: The singletonKey column cannot be modified.'
                USING ERRCODE = '55000';
        END IF;
        RETURN NEW;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_protect_hospital_profile_singleton ON "hospital_profiles";
CREATE TRIGGER trg_protect_hospital_profile_singleton
    BEFORE UPDATE OR DELETE ON "hospital_profiles"
    FOR EACH ROW
    EXECUTE FUNCTION protect_hospital_profile_singleton();

