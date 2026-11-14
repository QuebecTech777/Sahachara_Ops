-- ====================================================================
-- Migration: 20261114050000_supabase_row_level_security
-- Project: Sahachara Ops (Ayurvedic Outpatient & Therapy Clinic)
-- Severity: P0 Database-Level Security
-- Architecture: Supabase PostgreSQL RLS, Grant Revocation & Data API Hardening
-- ====================================================================

-- 1. Ensure PostgREST / Supabase standard roles exist in isolated test environments
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN BYPASSRLS;
  END IF;
END $$;

-- 2. Revoke broad public permissions from PUBLIC, anon, and authenticated roles
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL ROUTINES IN SCHEMA public FROM PUBLIC, anon, authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON ROUTINES FROM PUBLIC, anon, authenticated;

-- Allow schema USAGE so PostgREST can resolve explicitly granted views
GRANT USAGE ON SCHEMA public TO anon, authenticated;

-- 3. Grant full operational schema privileges to service_role
GRANT USAGE ON SCHEMA public TO service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON ROUTINES TO service_role;

-- Strictly revoke UPDATE and DELETE on immutable audit and financial ledger tables
REVOKE UPDATE, DELETE ON public.audit_logs FROM service_role, anon, authenticated;
REVOKE UPDATE, DELETE ON public.refund_ledger_entries FROM service_role, anon, authenticated;
REVOKE UPDATE, DELETE ON public.rate_histories FROM service_role, anon, authenticated;
REVOKE UPDATE, DELETE ON public.dispensing_records FROM service_role, anon, authenticated;

-- Enforce application-level ledger immutability against ordinary UPDATE and DELETE operations
-- for all backend database connections (including Prisma connecting as postgres with BYPASSRLS).
-- Security boundary note: A database superuser or table owner may still alter protections via DDL;
-- this protection prevents ordinary application-level mutations through the backend connection.
CREATE OR REPLACE FUNCTION public.prevent_ledger_mutation()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'IMMUTABLE_RECORD: % records are strictly immutable and cannot be updated or deleted.', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.prevent_dispensing_record_mutation()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'IMMUTABLE_RECORD: dispensing_records are strictly immutable and cannot be deleted.';
    ELSIF TG_OP = 'UPDATE' THEN
        IF (NEW."id" IS DISTINCT FROM OLD."id" OR
            NEW."dispenseNumber" IS DISTINCT FROM OLD."dispenseNumber" OR
            NEW."prescriptionId" IS DISTINCT FROM OLD."prescriptionId" OR
            NEW."encounterId" IS DISTINCT FROM OLD."encounterId" OR
            NEW."patientId" IS DISTINCT FROM OLD."patientId" OR
            NEW."patientName" IS DISTINCT FROM OLD."patientName" OR
            NEW."mrn" IS DISTINCT FROM OLD."mrn" OR
            NEW."medicationStockId" IS DISTINCT FROM OLD."medicationStockId" OR
            NEW."drugName" IS DISTINCT FROM OLD."drugName" OR
            NEW."batchNumber" IS DISTINCT FROM OLD."batchNumber" OR
            NEW."expiryDate" IS DISTINCT FROM OLD."expiryDate" OR
            NEW."quantityDispensed" IS DISTINCT FROM OLD."quantityDispensed" OR
            NEW."dispensedAt" IS DISTINCT FROM OLD."dispensedAt" OR
            NEW."dispensedById" IS DISTINCT FROM OLD."dispensedById" OR
            NEW."dispensedByName" IS DISTINCT FROM OLD."dispensedByName" OR
            NEW."dispensedByRole" IS DISTINCT FROM OLD."dispensedByRole" OR
            NEW."createdAt" IS DISTINCT FROM OLD."createdAt") THEN
            RAISE EXCEPTION 'IMMUTABLE_RECORD: dispensing_records clinical dispensing data is strictly immutable and cannot be modified.';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Attach unconditional immutability triggers to audit_logs, rate_histories, and dispensing_records
-- (Note: refund_ledger_entries is already protected by trg_prevent_refund_ledger_mutation from migration 20261113060000)
DROP TRIGGER IF EXISTS trg_prevent_audit_log_mutation ON public.audit_logs;
CREATE TRIGGER trg_prevent_audit_log_mutation
BEFORE UPDATE OR DELETE ON public.audit_logs
FOR EACH ROW
EXECUTE FUNCTION public.prevent_ledger_mutation();

DROP TRIGGER IF EXISTS trg_prevent_rate_history_mutation ON public.rate_histories;
CREATE TRIGGER trg_prevent_rate_history_mutation
BEFORE UPDATE OR DELETE ON public.rate_histories
FOR EACH ROW
EXECUTE FUNCTION public.prevent_ledger_mutation();

DROP TRIGGER IF EXISTS trg_prevent_dispensing_record_mutation ON public.dispensing_records;
CREATE TRIGGER trg_prevent_dispensing_record_mutation
BEFORE UPDATE OR DELETE ON public.dispensing_records
FOR EACH ROW
EXECUTE FUNCTION public.prevent_dispensing_record_mutation();

-- 4. Context helper functions for transaction-scoped application identity
CREATE OR REPLACE FUNCTION public.app_current_user_id() RETURNS TEXT AS $$
BEGIN
  RETURN NULLIF(current_setting('app.current_user_id', true), '');
END;
$$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE FUNCTION public.app_current_user_role() RETURNS TEXT AS $$
BEGIN
  RETURN NULLIF(current_setting('app.current_user_role', true), '');
END;
$$ LANGUAGE plpgsql STABLE;

REVOKE ALL ON FUNCTION public.app_current_user_id() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.app_current_user_role() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.app_current_user_id() TO service_role;
GRANT EXECUTE ON FUNCTION public.app_current_user_role() TO service_role;

-- 5. Enable RLS, FORCE RLS, and establish explicit per-table policies

-- Table: public._prisma_migrations
ALTER TABLE public._prisma_migrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public._prisma_migrations FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS _prisma_migrations_service_role_select ON public._prisma_migrations;
DROP POLICY IF EXISTS _prisma_migrations_service_role_insert ON public._prisma_migrations;
DROP POLICY IF EXISTS _prisma_migrations_service_role_update ON public._prisma_migrations;
DROP POLICY IF EXISTS _prisma_migrations_service_role_delete ON public._prisma_migrations;
CREATE POLICY _prisma_migrations_service_role_select ON public._prisma_migrations FOR SELECT TO service_role USING (true);
CREATE POLICY _prisma_migrations_service_role_insert ON public._prisma_migrations FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY _prisma_migrations_service_role_update ON public._prisma_migrations FOR UPDATE TO service_role USING (true) WITH CHECK (true);
CREATE POLICY _prisma_migrations_service_role_delete ON public._prisma_migrations FOR DELETE TO service_role USING (true);

-- Table: public.users
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS users_service_role_select ON public.users;
DROP POLICY IF EXISTS users_service_role_insert ON public.users;
DROP POLICY IF EXISTS users_service_role_update ON public.users;
DROP POLICY IF EXISTS users_service_role_delete ON public.users;
CREATE POLICY users_service_role_select ON public.users FOR SELECT TO service_role USING (true);
CREATE POLICY users_service_role_insert ON public.users FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY users_service_role_update ON public.users FOR UPDATE TO service_role USING (true) WITH CHECK (true);
CREATE POLICY users_service_role_delete ON public.users FOR DELETE TO service_role USING (true);

-- Table: public.patients
ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patients FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS patients_service_role_select ON public.patients;
DROP POLICY IF EXISTS patients_service_role_insert ON public.patients;
DROP POLICY IF EXISTS patients_service_role_update ON public.patients;
DROP POLICY IF EXISTS patients_service_role_delete ON public.patients;
CREATE POLICY patients_service_role_select ON public.patients FOR SELECT TO service_role USING (true);
CREATE POLICY patients_service_role_insert ON public.patients FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY patients_service_role_update ON public.patients FOR UPDATE TO service_role USING (true) WITH CHECK (true);
CREATE POLICY patients_service_role_delete ON public.patients FOR DELETE TO service_role USING (true);

-- Table: public.appointments
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointments FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS appointments_service_role_select ON public.appointments;
DROP POLICY IF EXISTS appointments_service_role_insert ON public.appointments;
DROP POLICY IF EXISTS appointments_service_role_update ON public.appointments;
DROP POLICY IF EXISTS appointments_service_role_delete ON public.appointments;
CREATE POLICY appointments_service_role_select ON public.appointments FOR SELECT TO service_role USING (true);
CREATE POLICY appointments_service_role_insert ON public.appointments FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY appointments_service_role_update ON public.appointments FOR UPDATE TO service_role USING (true) WITH CHECK (true);
CREATE POLICY appointments_service_role_delete ON public.appointments FOR DELETE TO service_role USING (true);

-- Table: public.consultations
ALTER TABLE public.consultations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consultations FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS consultations_service_role_select ON public.consultations;
DROP POLICY IF EXISTS consultations_service_role_insert ON public.consultations;
DROP POLICY IF EXISTS consultations_service_role_update ON public.consultations;
DROP POLICY IF EXISTS consultations_service_role_delete ON public.consultations;
CREATE POLICY consultations_service_role_select ON public.consultations FOR SELECT TO service_role USING (true);
CREATE POLICY consultations_service_role_insert ON public.consultations FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY consultations_service_role_update ON public.consultations FOR UPDATE TO service_role USING (true) WITH CHECK (true);
CREATE POLICY consultations_service_role_delete ON public.consultations FOR DELETE TO service_role USING (true);

-- Table: public.treatment_plans
ALTER TABLE public.treatment_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.treatment_plans FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS treatment_plans_service_role_select ON public.treatment_plans;
DROP POLICY IF EXISTS treatment_plans_service_role_insert ON public.treatment_plans;
DROP POLICY IF EXISTS treatment_plans_service_role_update ON public.treatment_plans;
DROP POLICY IF EXISTS treatment_plans_service_role_delete ON public.treatment_plans;
CREATE POLICY treatment_plans_service_role_select ON public.treatment_plans FOR SELECT TO service_role USING (true);
CREATE POLICY treatment_plans_service_role_insert ON public.treatment_plans FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY treatment_plans_service_role_update ON public.treatment_plans FOR UPDATE TO service_role USING (true) WITH CHECK (true);
CREATE POLICY treatment_plans_service_role_delete ON public.treatment_plans FOR DELETE TO service_role USING (true);

-- Table: public.panchakarma_courses
ALTER TABLE public.panchakarma_courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.panchakarma_courses FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS panchakarma_courses_service_role_select ON public.panchakarma_courses;
DROP POLICY IF EXISTS panchakarma_courses_service_role_insert ON public.panchakarma_courses;
DROP POLICY IF EXISTS panchakarma_courses_service_role_update ON public.panchakarma_courses;
DROP POLICY IF EXISTS panchakarma_courses_service_role_delete ON public.panchakarma_courses;
CREATE POLICY panchakarma_courses_service_role_select ON public.panchakarma_courses FOR SELECT TO service_role USING (true);
CREATE POLICY panchakarma_courses_service_role_insert ON public.panchakarma_courses FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY panchakarma_courses_service_role_update ON public.panchakarma_courses FOR UPDATE TO service_role USING (true) WITH CHECK (true);
CREATE POLICY panchakarma_courses_service_role_delete ON public.panchakarma_courses FOR DELETE TO service_role USING (true);

-- Table: public.prescriptions
ALTER TABLE public.prescriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prescriptions FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS prescriptions_service_role_select ON public.prescriptions;
DROP POLICY IF EXISTS prescriptions_service_role_insert ON public.prescriptions;
DROP POLICY IF EXISTS prescriptions_service_role_update ON public.prescriptions;
DROP POLICY IF EXISTS prescriptions_service_role_delete ON public.prescriptions;
CREATE POLICY prescriptions_service_role_select ON public.prescriptions FOR SELECT TO service_role USING (true);
CREATE POLICY prescriptions_service_role_insert ON public.prescriptions FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY prescriptions_service_role_update ON public.prescriptions FOR UPDATE TO service_role USING (true) WITH CHECK (true);
CREATE POLICY prescriptions_service_role_delete ON public.prescriptions FOR DELETE TO service_role USING (true);

-- Table: public.medication_stock
ALTER TABLE public.medication_stock ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medication_stock FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS medication_stock_service_role_select ON public.medication_stock;
DROP POLICY IF EXISTS medication_stock_service_role_insert ON public.medication_stock;
DROP POLICY IF EXISTS medication_stock_service_role_update ON public.medication_stock;
DROP POLICY IF EXISTS medication_stock_service_role_delete ON public.medication_stock;
CREATE POLICY medication_stock_service_role_select ON public.medication_stock FOR SELECT TO service_role USING (true);
CREATE POLICY medication_stock_service_role_insert ON public.medication_stock FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY medication_stock_service_role_update ON public.medication_stock FOR UPDATE TO service_role USING (true) WITH CHECK (true);
CREATE POLICY medication_stock_service_role_delete ON public.medication_stock FOR DELETE TO service_role USING (true);

-- Table: public.stock_movements
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_movements FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS stock_movements_service_role_select ON public.stock_movements;
DROP POLICY IF EXISTS stock_movements_service_role_insert ON public.stock_movements;
DROP POLICY IF EXISTS stock_movements_service_role_update ON public.stock_movements;
DROP POLICY IF EXISTS stock_movements_service_role_delete ON public.stock_movements;
CREATE POLICY stock_movements_service_role_select ON public.stock_movements FOR SELECT TO service_role USING (true);
CREATE POLICY stock_movements_service_role_insert ON public.stock_movements FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY stock_movements_service_role_update ON public.stock_movements FOR UPDATE TO service_role USING (true) WITH CHECK (true);
CREATE POLICY stock_movements_service_role_delete ON public.stock_movements FOR DELETE TO service_role USING (true);

-- Table: public.dispensing_records
ALTER TABLE public.dispensing_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dispensing_records FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS dispensing_records_service_role_select ON public.dispensing_records;
DROP POLICY IF EXISTS dispensing_records_service_role_insert ON public.dispensing_records;
DROP POLICY IF EXISTS dispensing_records_service_role_update ON public.dispensing_records;
DROP POLICY IF EXISTS dispensing_records_service_role_delete ON public.dispensing_records;
CREATE POLICY dispensing_records_service_role_select ON public.dispensing_records FOR SELECT TO service_role USING (true);
CREATE POLICY dispensing_records_service_role_insert ON public.dispensing_records FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY dispensing_records_service_role_update ON public.dispensing_records FOR UPDATE TO service_role USING (false); -- Immutable
CREATE POLICY dispensing_records_service_role_delete ON public.dispensing_records FOR DELETE TO service_role USING (false); -- Immutable

-- Table: public.dispensing_idempotency
ALTER TABLE public.dispensing_idempotency ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dispensing_idempotency FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS dispensing_idempotency_service_role_select ON public.dispensing_idempotency;
DROP POLICY IF EXISTS dispensing_idempotency_service_role_insert ON public.dispensing_idempotency;
DROP POLICY IF EXISTS dispensing_idempotency_service_role_update ON public.dispensing_idempotency;
DROP POLICY IF EXISTS dispensing_idempotency_service_role_delete ON public.dispensing_idempotency;
CREATE POLICY dispensing_idempotency_service_role_select ON public.dispensing_idempotency FOR SELECT TO service_role USING (true);
CREATE POLICY dispensing_idempotency_service_role_insert ON public.dispensing_idempotency FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY dispensing_idempotency_service_role_update ON public.dispensing_idempotency FOR UPDATE TO service_role USING (true) WITH CHECK (true);
CREATE POLICY dispensing_idempotency_service_role_delete ON public.dispensing_idempotency FOR DELETE TO service_role USING (true);

-- Table: public.lab_orders
ALTER TABLE public.lab_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lab_orders FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lab_orders_service_role_select ON public.lab_orders;
DROP POLICY IF EXISTS lab_orders_service_role_insert ON public.lab_orders;
DROP POLICY IF EXISTS lab_orders_service_role_update ON public.lab_orders;
DROP POLICY IF EXISTS lab_orders_service_role_delete ON public.lab_orders;
CREATE POLICY lab_orders_service_role_select ON public.lab_orders FOR SELECT TO service_role USING (true);
CREATE POLICY lab_orders_service_role_insert ON public.lab_orders FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY lab_orders_service_role_update ON public.lab_orders FOR UPDATE TO service_role USING (true) WITH CHECK (true);
CREATE POLICY lab_orders_service_role_delete ON public.lab_orders FOR DELETE TO service_role USING (true);

-- Table: public.invoices
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS invoices_service_role_select ON public.invoices;
DROP POLICY IF EXISTS invoices_service_role_insert ON public.invoices;
DROP POLICY IF EXISTS invoices_service_role_update ON public.invoices;
DROP POLICY IF EXISTS invoices_service_role_delete ON public.invoices;
CREATE POLICY invoices_service_role_select ON public.invoices FOR SELECT TO service_role USING (true);
CREATE POLICY invoices_service_role_insert ON public.invoices FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY invoices_service_role_update ON public.invoices FOR UPDATE TO service_role USING (true) WITH CHECK (true);
CREATE POLICY invoices_service_role_delete ON public.invoices FOR DELETE TO service_role USING (true);

-- Table: public.payments
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS payments_service_role_select ON public.payments;
DROP POLICY IF EXISTS payments_service_role_insert ON public.payments;
DROP POLICY IF EXISTS payments_service_role_update ON public.payments;
DROP POLICY IF EXISTS payments_service_role_delete ON public.payments;
CREATE POLICY payments_service_role_select ON public.payments FOR SELECT TO service_role USING (true);
CREATE POLICY payments_service_role_insert ON public.payments FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY payments_service_role_update ON public.payments FOR UPDATE TO service_role USING (true) WITH CHECK (true);
CREATE POLICY payments_service_role_delete ON public.payments FOR DELETE TO service_role USING (true);

-- Table: public.payment_allocations
ALTER TABLE public.payment_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_allocations FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS payment_allocations_service_role_select ON public.payment_allocations;
DROP POLICY IF EXISTS payment_allocations_service_role_insert ON public.payment_allocations;
DROP POLICY IF EXISTS payment_allocations_service_role_update ON public.payment_allocations;
DROP POLICY IF EXISTS payment_allocations_service_role_delete ON public.payment_allocations;
CREATE POLICY payment_allocations_service_role_select ON public.payment_allocations FOR SELECT TO service_role USING (true);
CREATE POLICY payment_allocations_service_role_insert ON public.payment_allocations FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY payment_allocations_service_role_update ON public.payment_allocations FOR UPDATE TO service_role USING (true) WITH CHECK (true);
CREATE POLICY payment_allocations_service_role_delete ON public.payment_allocations FOR DELETE TO service_role USING (true);

-- Table: public.refund_requests
ALTER TABLE public.refund_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.refund_requests FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS refund_requests_service_role_select ON public.refund_requests;
DROP POLICY IF EXISTS refund_requests_service_role_insert ON public.refund_requests;
DROP POLICY IF EXISTS refund_requests_service_role_update ON public.refund_requests;
DROP POLICY IF EXISTS refund_requests_service_role_delete ON public.refund_requests;
CREATE POLICY refund_requests_service_role_select ON public.refund_requests FOR SELECT TO service_role USING (true);
CREATE POLICY refund_requests_service_role_insert ON public.refund_requests FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY refund_requests_service_role_update ON public.refund_requests FOR UPDATE TO service_role USING (true) WITH CHECK (true);
CREATE POLICY refund_requests_service_role_delete ON public.refund_requests FOR DELETE TO service_role USING (true);

-- Table: public.refund_ledger_entries
ALTER TABLE public.refund_ledger_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.refund_ledger_entries FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS refund_ledger_entries_service_role_select ON public.refund_ledger_entries;
DROP POLICY IF EXISTS refund_ledger_entries_service_role_insert ON public.refund_ledger_entries;
DROP POLICY IF EXISTS refund_ledger_entries_service_role_update ON public.refund_ledger_entries;
DROP POLICY IF EXISTS refund_ledger_entries_service_role_delete ON public.refund_ledger_entries;
CREATE POLICY refund_ledger_entries_service_role_select ON public.refund_ledger_entries FOR SELECT TO service_role USING (true);
CREATE POLICY refund_ledger_entries_service_role_insert ON public.refund_ledger_entries FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY refund_ledger_entries_service_role_update ON public.refund_ledger_entries FOR UPDATE TO service_role USING (false); -- Immutable
CREATE POLICY refund_ledger_entries_service_role_delete ON public.refund_ledger_entries FOR DELETE TO service_role USING (false); -- Immutable

-- Table: public.financial_idempotency
ALTER TABLE public.financial_idempotency ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_idempotency FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS financial_idempotency_service_role_select ON public.financial_idempotency;
DROP POLICY IF EXISTS financial_idempotency_service_role_insert ON public.financial_idempotency;
DROP POLICY IF EXISTS financial_idempotency_service_role_update ON public.financial_idempotency;
DROP POLICY IF EXISTS financial_idempotency_service_role_delete ON public.financial_idempotency;
CREATE POLICY financial_idempotency_service_role_select ON public.financial_idempotency FOR SELECT TO service_role USING (true);
CREATE POLICY financial_idempotency_service_role_insert ON public.financial_idempotency FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY financial_idempotency_service_role_update ON public.financial_idempotency FOR UPDATE TO service_role USING (true) WITH CHECK (true);
CREATE POLICY financial_idempotency_service_role_delete ON public.financial_idempotency FOR DELETE TO service_role USING (true);

-- Table: public.staff_members
ALTER TABLE public.staff_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_members FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS staff_members_service_role_select ON public.staff_members;
DROP POLICY IF EXISTS staff_members_service_role_insert ON public.staff_members;
DROP POLICY IF EXISTS staff_members_service_role_update ON public.staff_members;
DROP POLICY IF EXISTS staff_members_service_role_delete ON public.staff_members;
CREATE POLICY staff_members_service_role_select ON public.staff_members FOR SELECT TO service_role USING (true);
CREATE POLICY staff_members_service_role_insert ON public.staff_members FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY staff_members_service_role_update ON public.staff_members FOR UPDATE TO service_role USING (true) WITH CHECK (true);
CREATE POLICY staff_members_service_role_delete ON public.staff_members FOR DELETE TO service_role USING (true);

-- Table: public.hospital_profiles
ALTER TABLE public.hospital_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hospital_profiles FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hospital_profiles_service_role_select ON public.hospital_profiles;
DROP POLICY IF EXISTS hospital_profiles_service_role_insert ON public.hospital_profiles;
DROP POLICY IF EXISTS hospital_profiles_service_role_update ON public.hospital_profiles;
DROP POLICY IF EXISTS hospital_profiles_service_role_delete ON public.hospital_profiles;
DROP POLICY IF EXISTS hospital_profiles_public_select ON public.hospital_profiles;

-- Deny direct table access to anon and authenticated
REVOKE ALL ON public.hospital_profiles FROM anon, authenticated;

CREATE POLICY hospital_profiles_service_role_select ON public.hospital_profiles FOR SELECT TO service_role USING (true);
CREATE POLICY hospital_profiles_service_role_insert ON public.hospital_profiles FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY hospital_profiles_service_role_update ON public.hospital_profiles FOR UPDATE TO service_role USING (true) WITH CHECK (true);
CREATE POLICY hospital_profiles_service_role_delete ON public.hospital_profiles FOR DELETE TO service_role USING (false);

-- Restricted view exposing only approved institutional information (zero staff or internal metadata)
DROP VIEW IF EXISTS public.public_hospital_profile;
CREATE VIEW public.public_hospital_profile WITH (security_barrier = true) AS
SELECT
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
  "currency"
FROM public.hospital_profiles
WHERE "singletonKey" = 'PRIMARY_INSTITUTION';

REVOKE ALL ON public.public_hospital_profile FROM anon, authenticated;
GRANT SELECT ON public.public_hospital_profile TO anon, authenticated;

-- Table: public.departments
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.departments FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS departments_service_role_select ON public.departments;
DROP POLICY IF EXISTS departments_service_role_insert ON public.departments;
DROP POLICY IF EXISTS departments_service_role_update ON public.departments;
DROP POLICY IF EXISTS departments_service_role_delete ON public.departments;
CREATE POLICY departments_service_role_select ON public.departments FOR SELECT TO service_role USING (true);
CREATE POLICY departments_service_role_insert ON public.departments FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY departments_service_role_update ON public.departments FOR UPDATE TO service_role USING (true) WITH CHECK (true);
CREATE POLICY departments_service_role_delete ON public.departments FOR DELETE TO service_role USING (true);

-- Table: public.staff_department_assignments
ALTER TABLE public.staff_department_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_department_assignments FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS staff_department_assignments_service_role_select ON public.staff_department_assignments;
DROP POLICY IF EXISTS staff_department_assignments_service_role_insert ON public.staff_department_assignments;
DROP POLICY IF EXISTS staff_department_assignments_service_role_update ON public.staff_department_assignments;
DROP POLICY IF EXISTS staff_department_assignments_service_role_delete ON public.staff_department_assignments;
CREATE POLICY staff_department_assignments_service_role_select ON public.staff_department_assignments FOR SELECT TO service_role USING (true);
CREATE POLICY staff_department_assignments_service_role_insert ON public.staff_department_assignments FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY staff_department_assignments_service_role_update ON public.staff_department_assignments FOR UPDATE TO service_role USING (true) WITH CHECK (true);
CREATE POLICY staff_department_assignments_service_role_delete ON public.staff_department_assignments FOR DELETE TO service_role USING (true);

-- Table: public.audit_logs
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS audit_logs_service_role_select ON public.audit_logs;
DROP POLICY IF EXISTS audit_logs_service_role_insert ON public.audit_logs;
DROP POLICY IF EXISTS audit_logs_service_role_update ON public.audit_logs;
DROP POLICY IF EXISTS audit_logs_service_role_delete ON public.audit_logs;
CREATE POLICY audit_logs_service_role_select ON public.audit_logs FOR SELECT TO service_role USING (true);
CREATE POLICY audit_logs_service_role_insert ON public.audit_logs FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY audit_logs_service_role_update ON public.audit_logs FOR UPDATE TO service_role USING (false); -- Immutable
CREATE POLICY audit_logs_service_role_delete ON public.audit_logs FOR DELETE TO service_role USING (false); -- Immutable

-- Table: public.rate_histories
ALTER TABLE public.rate_histories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rate_histories FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rate_histories_service_role_select ON public.rate_histories;
DROP POLICY IF EXISTS rate_histories_service_role_insert ON public.rate_histories;
DROP POLICY IF EXISTS rate_histories_service_role_update ON public.rate_histories;
DROP POLICY IF EXISTS rate_histories_service_role_delete ON public.rate_histories;
CREATE POLICY rate_histories_service_role_select ON public.rate_histories FOR SELECT TO service_role USING (true);
CREATE POLICY rate_histories_service_role_insert ON public.rate_histories FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY rate_histories_service_role_update ON public.rate_histories FOR UPDATE TO service_role USING (false); -- Immutable
CREATE POLICY rate_histories_service_role_delete ON public.rate_histories FOR DELETE TO service_role USING (false); -- Immutable

-- Table: public.hospital_tariffs
ALTER TABLE public.hospital_tariffs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hospital_tariffs FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hospital_tariffs_service_role_select ON public.hospital_tariffs;
DROP POLICY IF EXISTS hospital_tariffs_service_role_insert ON public.hospital_tariffs;
DROP POLICY IF EXISTS hospital_tariffs_service_role_update ON public.hospital_tariffs;
DROP POLICY IF EXISTS hospital_tariffs_service_role_delete ON public.hospital_tariffs;
CREATE POLICY hospital_tariffs_service_role_select ON public.hospital_tariffs FOR SELECT TO service_role USING (true);
CREATE POLICY hospital_tariffs_service_role_insert ON public.hospital_tariffs FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY hospital_tariffs_service_role_update ON public.hospital_tariffs FOR UPDATE TO service_role USING (true) WITH CHECK (true);
CREATE POLICY hospital_tariffs_service_role_delete ON public.hospital_tariffs FOR DELETE TO service_role USING (true);

-- Table: public.clinical_encounters
ALTER TABLE public.clinical_encounters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clinical_encounters FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS clinical_encounters_service_role_select ON public.clinical_encounters;
DROP POLICY IF EXISTS clinical_encounters_service_role_insert ON public.clinical_encounters;
DROP POLICY IF EXISTS clinical_encounters_service_role_update ON public.clinical_encounters;
DROP POLICY IF EXISTS clinical_encounters_service_role_delete ON public.clinical_encounters;
CREATE POLICY clinical_encounters_service_role_select ON public.clinical_encounters FOR SELECT TO service_role USING (true);
CREATE POLICY clinical_encounters_service_role_insert ON public.clinical_encounters FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY clinical_encounters_service_role_update ON public.clinical_encounters FOR UPDATE TO service_role USING (true) WITH CHECK (true);
CREATE POLICY clinical_encounters_service_role_delete ON public.clinical_encounters FOR DELETE TO service_role USING (true);

-- Table: public.clinical_vitals
ALTER TABLE public.clinical_vitals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clinical_vitals FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS clinical_vitals_service_role_select ON public.clinical_vitals;
DROP POLICY IF EXISTS clinical_vitals_service_role_insert ON public.clinical_vitals;
DROP POLICY IF EXISTS clinical_vitals_service_role_update ON public.clinical_vitals;
DROP POLICY IF EXISTS clinical_vitals_service_role_delete ON public.clinical_vitals;
CREATE POLICY clinical_vitals_service_role_select ON public.clinical_vitals FOR SELECT TO service_role USING (true);
CREATE POLICY clinical_vitals_service_role_insert ON public.clinical_vitals FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY clinical_vitals_service_role_update ON public.clinical_vitals FOR UPDATE TO service_role USING (true) WITH CHECK (true);
CREATE POLICY clinical_vitals_service_role_delete ON public.clinical_vitals FOR DELETE TO service_role USING (true);

-- Table: public.clinical_assessments
ALTER TABLE public.clinical_assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clinical_assessments FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS clinical_assessments_service_role_select ON public.clinical_assessments;
DROP POLICY IF EXISTS clinical_assessments_service_role_insert ON public.clinical_assessments;
DROP POLICY IF EXISTS clinical_assessments_service_role_update ON public.clinical_assessments;
DROP POLICY IF EXISTS clinical_assessments_service_role_delete ON public.clinical_assessments;
CREATE POLICY clinical_assessments_service_role_select ON public.clinical_assessments FOR SELECT TO service_role USING (true);
CREATE POLICY clinical_assessments_service_role_insert ON public.clinical_assessments FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY clinical_assessments_service_role_update ON public.clinical_assessments FOR UPDATE TO service_role USING (true) WITH CHECK (true);
CREATE POLICY clinical_assessments_service_role_delete ON public.clinical_assessments FOR DELETE TO service_role USING (true);

-- Table: public.clinical_diagnoses
ALTER TABLE public.clinical_diagnoses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clinical_diagnoses FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS clinical_diagnoses_service_role_select ON public.clinical_diagnoses;
DROP POLICY IF EXISTS clinical_diagnoses_service_role_insert ON public.clinical_diagnoses;
DROP POLICY IF EXISTS clinical_diagnoses_service_role_update ON public.clinical_diagnoses;
DROP POLICY IF EXISTS clinical_diagnoses_service_role_delete ON public.clinical_diagnoses;
CREATE POLICY clinical_diagnoses_service_role_select ON public.clinical_diagnoses FOR SELECT TO service_role USING (true);
CREATE POLICY clinical_diagnoses_service_role_insert ON public.clinical_diagnoses FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY clinical_diagnoses_service_role_update ON public.clinical_diagnoses FOR UPDATE TO service_role USING (true) WITH CHECK (true);
CREATE POLICY clinical_diagnoses_service_role_delete ON public.clinical_diagnoses FOR DELETE TO service_role USING (true);

-- Table: public.prakriti_assessments
ALTER TABLE public.prakriti_assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prakriti_assessments FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS prakriti_assessments_service_role_select ON public.prakriti_assessments;
DROP POLICY IF EXISTS prakriti_assessments_service_role_insert ON public.prakriti_assessments;
DROP POLICY IF EXISTS prakriti_assessments_service_role_update ON public.prakriti_assessments;
DROP POLICY IF EXISTS prakriti_assessments_service_role_delete ON public.prakriti_assessments;
CREATE POLICY prakriti_assessments_service_role_select ON public.prakriti_assessments FOR SELECT TO service_role USING (true);
CREATE POLICY prakriti_assessments_service_role_insert ON public.prakriti_assessments FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY prakriti_assessments_service_role_update ON public.prakriti_assessments FOR UPDATE TO service_role USING (true) WITH CHECK (true);
CREATE POLICY prakriti_assessments_service_role_delete ON public.prakriti_assessments FOR DELETE TO service_role USING (true);

-- Table: public.vikriti_assessments
ALTER TABLE public.vikriti_assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vikriti_assessments FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS vikriti_assessments_service_role_select ON public.vikriti_assessments;
DROP POLICY IF EXISTS vikriti_assessments_service_role_insert ON public.vikriti_assessments;
DROP POLICY IF EXISTS vikriti_assessments_service_role_update ON public.vikriti_assessments;
DROP POLICY IF EXISTS vikriti_assessments_service_role_delete ON public.vikriti_assessments;
CREATE POLICY vikriti_assessments_service_role_select ON public.vikriti_assessments FOR SELECT TO service_role USING (true);
CREATE POLICY vikriti_assessments_service_role_insert ON public.vikriti_assessments FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY vikriti_assessments_service_role_update ON public.vikriti_assessments FOR UPDATE TO service_role USING (true) WITH CHECK (true);
CREATE POLICY vikriti_assessments_service_role_delete ON public.vikriti_assessments FOR DELETE TO service_role USING (true);

-- Table: public.dosha_evaluations
ALTER TABLE public.dosha_evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dosha_evaluations FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS dosha_evaluations_service_role_select ON public.dosha_evaluations;
DROP POLICY IF EXISTS dosha_evaluations_service_role_insert ON public.dosha_evaluations;
DROP POLICY IF EXISTS dosha_evaluations_service_role_update ON public.dosha_evaluations;
DROP POLICY IF EXISTS dosha_evaluations_service_role_delete ON public.dosha_evaluations;
CREATE POLICY dosha_evaluations_service_role_select ON public.dosha_evaluations FOR SELECT TO service_role USING (true);
CREATE POLICY dosha_evaluations_service_role_insert ON public.dosha_evaluations FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY dosha_evaluations_service_role_update ON public.dosha_evaluations FOR UPDATE TO service_role USING (true) WITH CHECK (true);
CREATE POLICY dosha_evaluations_service_role_delete ON public.dosha_evaluations FOR DELETE TO service_role USING (true);

-- Table: public.panchakarma_referrals
ALTER TABLE public.panchakarma_referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.panchakarma_referrals FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS panchakarma_referrals_service_role_select ON public.panchakarma_referrals;
DROP POLICY IF EXISTS panchakarma_referrals_service_role_insert ON public.panchakarma_referrals;
DROP POLICY IF EXISTS panchakarma_referrals_service_role_update ON public.panchakarma_referrals;
DROP POLICY IF EXISTS panchakarma_referrals_service_role_delete ON public.panchakarma_referrals;
CREATE POLICY panchakarma_referrals_service_role_select ON public.panchakarma_referrals FOR SELECT TO service_role USING (true);
CREATE POLICY panchakarma_referrals_service_role_insert ON public.panchakarma_referrals FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY panchakarma_referrals_service_role_update ON public.panchakarma_referrals FOR UPDATE TO service_role USING (true) WITH CHECK (true);
CREATE POLICY panchakarma_referrals_service_role_delete ON public.panchakarma_referrals FOR DELETE TO service_role USING (true);

-- Table: public.therapy_rooms
ALTER TABLE public.therapy_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.therapy_rooms FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS therapy_rooms_service_role_select ON public.therapy_rooms;
DROP POLICY IF EXISTS therapy_rooms_service_role_insert ON public.therapy_rooms;
DROP POLICY IF EXISTS therapy_rooms_service_role_update ON public.therapy_rooms;
DROP POLICY IF EXISTS therapy_rooms_service_role_delete ON public.therapy_rooms;
CREATE POLICY therapy_rooms_service_role_select ON public.therapy_rooms FOR SELECT TO service_role USING (true);
CREATE POLICY therapy_rooms_service_role_insert ON public.therapy_rooms FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY therapy_rooms_service_role_update ON public.therapy_rooms FOR UPDATE TO service_role USING (true) WITH CHECK (true);
CREATE POLICY therapy_rooms_service_role_delete ON public.therapy_rooms FOR DELETE TO service_role USING (true);

-- Table: public.therapy_sessions
ALTER TABLE public.therapy_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.therapy_sessions FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS therapy_sessions_service_role_select ON public.therapy_sessions;
DROP POLICY IF EXISTS therapy_sessions_service_role_insert ON public.therapy_sessions;
DROP POLICY IF EXISTS therapy_sessions_service_role_update ON public.therapy_sessions;
DROP POLICY IF EXISTS therapy_sessions_service_role_delete ON public.therapy_sessions;
CREATE POLICY therapy_sessions_service_role_select ON public.therapy_sessions FOR SELECT TO service_role USING (true);
CREATE POLICY therapy_sessions_service_role_insert ON public.therapy_sessions FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY therapy_sessions_service_role_update ON public.therapy_sessions FOR UPDATE TO service_role USING (true) WITH CHECK (true);
CREATE POLICY therapy_sessions_service_role_delete ON public.therapy_sessions FOR DELETE TO service_role USING (true);

-- Table: public.panchakarma_phase_transitions
ALTER TABLE public.panchakarma_phase_transitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.panchakarma_phase_transitions FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS panchakarma_phase_transitions_service_role_select ON public.panchakarma_phase_transitions;
DROP POLICY IF EXISTS panchakarma_phase_transitions_service_role_insert ON public.panchakarma_phase_transitions;
DROP POLICY IF EXISTS panchakarma_phase_transitions_service_role_update ON public.panchakarma_phase_transitions;
DROP POLICY IF EXISTS panchakarma_phase_transitions_service_role_delete ON public.panchakarma_phase_transitions;
CREATE POLICY panchakarma_phase_transitions_service_role_select ON public.panchakarma_phase_transitions FOR SELECT TO service_role USING (true);
CREATE POLICY panchakarma_phase_transitions_service_role_insert ON public.panchakarma_phase_transitions FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY panchakarma_phase_transitions_service_role_update ON public.panchakarma_phase_transitions FOR UPDATE TO service_role USING (true) WITH CHECK (true);
CREATE POLICY panchakarma_phase_transitions_service_role_delete ON public.panchakarma_phase_transitions FOR DELETE TO service_role USING (true);

-- Table: public.staff_therapy_authorizations
ALTER TABLE public.staff_therapy_authorizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_therapy_authorizations FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS staff_therapy_authorizations_service_role_select ON public.staff_therapy_authorizations;
DROP POLICY IF EXISTS staff_therapy_authorizations_service_role_insert ON public.staff_therapy_authorizations;
DROP POLICY IF EXISTS staff_therapy_authorizations_service_role_update ON public.staff_therapy_authorizations;
DROP POLICY IF EXISTS staff_therapy_authorizations_service_role_delete ON public.staff_therapy_authorizations;
CREATE POLICY staff_therapy_authorizations_service_role_select ON public.staff_therapy_authorizations FOR SELECT TO service_role USING (true);
CREATE POLICY staff_therapy_authorizations_service_role_insert ON public.staff_therapy_authorizations FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY staff_therapy_authorizations_service_role_update ON public.staff_therapy_authorizations FOR UPDATE TO service_role USING (true) WITH CHECK (true);
CREATE POLICY staff_therapy_authorizations_service_role_delete ON public.staff_therapy_authorizations FOR DELETE TO service_role USING (true);
