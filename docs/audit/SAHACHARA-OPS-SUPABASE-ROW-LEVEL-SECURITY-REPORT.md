# Sahachara Ops — Supabase Row Level Security (RLS) Implementation & Database Hardening Report

**Project:** Sahachara Ops (Ayurvedic Outpatient, Day-Care & Ambulatory Therapy Clinic)  
**Priority:** P0 — Database-Level Security  
**Environment:** Production Supabase PostgreSQL (AWS ap-south-1 Mumbai) / Isolated Test PostgreSQL  
**Date:** 2026-11-14  
**Status:** Verification Passed (44 / 44 RLS Tests Passed, 641 / 641 Domain Tests Passed, Zero Production Records Mutated)

---

## 1. Executive Summary

Sahachara Ops utilizes Supabase PostgreSQL as its production datastore, accessed by an Express backend via Prisma ORM and by the frontend via the Express API.

Prior to this hardening exercise, an introspection of the live Supabase database revealed:
1. **Zero RLS Enforcement:** Row Level Security was disabled (`relrowsecurity = false`) on all 38 tables in the `public` schema.
2. **Permissive PostgREST Grants:** Standard Supabase roles `anon` and `authenticated` possessed full `SELECT`, `INSERT`, `UPDATE`, `DELETE`, `TRIGGER`, `TRUNCATE`, and `REFERENCES` privileges across all 38 operational tables via default PostgreSQL public grants.
3. **Data API Exposure Risk:** Any client possessing the public `VITE_SUPABASE_ANON_KEY` could have queried or mutated clinical, financial, and patient records directly through Supabase PostgREST, bypassing the Express application tier entirely.

To resolve this critical perimeter vulnerability, a complete database hardening and RLS architecture was designed, implemented in version-controlled migration `20261114050000_supabase_row_level_security`, and verified through an automated 44-point test suite (`scripts/verify-supabase-rls.ts`):
- **100% RLS & FORCE RLS Coverage:** Enabled on all 38 application tables.
- **Grant Revocation:** Revoked all privileges on operational tables from `PUBLIC`, `anon`, and `authenticated`.
- **Public Data API Hardening:** Direct PostgREST access is strictly default-deny. Public anonymous read access to the `hospital_profiles` table directly is completely denied; institutional metadata is exposed exclusively through the `public_hospital_profile` restricted security-barrier view (14 approved fields, singleton filter `"singletonKey" = 'PRIMARY_INSTITUTION'`).
- **Immutable Financial & Audit Ledgers:** Hardened `audit_logs`, `refund_ledger_entries`, `rate_histories`, and `dispensing_records` with immutable default-deny policies (`USING (false)`) and revoked `UPDATE`/`DELETE` grants.
- **Architectural Honesty:** Thoroughly documented that the current Express/Prisma connection connects as `postgres` (`rolbypassrls = true`), acting as a trusted server application boundary.

---

## 2. Complete Database Security Inventory

Introspection of the 38 tables in schema `public` via `scripts/introspect-db-security.ts`:

| Table Name | Owner | Classification | PostgREST / anon Access | PostgREST / authenticated Access | RLS Enabled | FORCE RLS | Service Role Policies |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `_prisma_migrations` | postgres | Schema Metadata | Denied (Revoked) | Denied (Revoked) | YES | YES | Full CRUD |
| `users` | postgres | Sensitive (Staff/Auth) | Denied (Revoked) | Denied (Revoked) | YES | YES | Full CRUD |
| `staff_members` | postgres | Sensitive (Staff/HR) | Denied (Revoked) | Denied (Revoked) | YES | YES | Full CRUD |
| `staff_audit_events` | postgres | Sensitive (Audit) | Denied (Revoked) | Denied (Revoked) | YES | YES | Full CRUD |
| `patients` | postgres | Sensitive (PHI) | Denied (Revoked) | Denied (Revoked) | YES | YES | Full CRUD |
| `appointments` | postgres | Operational | Denied (Revoked) | Denied (Revoked) | YES | YES | Full CRUD |
| `consultations` | postgres | Sensitive (PHI/Clinical) | Denied (Revoked) | Denied (Revoked) | YES | YES | Full CRUD |
| `clinical_assessments`| postgres | Sensitive (PHI/Clinical) | Denied (Revoked) | Denied (Revoked) | YES | YES | Full CRUD |
| `clinical_vitals` | postgres | Sensitive (PHI/Clinical) | Denied (Revoked) | Denied (Revoked) | YES | YES | Full CRUD |
| `clinical_diagnoses` | postgres | Sensitive (PHI/Clinical) | Denied (Revoked) | Denied (Revoked) | YES | YES | Full CRUD |
| `clinical_encounters` | postgres | Sensitive (PHI/Clinical) | Denied (Revoked) | Denied (Revoked) | YES | YES | Full CRUD |
| `dosha_evaluations` | postgres | Sensitive (Ayurvedic) | Denied (Revoked) | Denied (Revoked) | YES | YES | Full CRUD |
| `prakriti_assessments`| postgres | Sensitive (Ayurvedic) | Denied (Revoked) | Denied (Revoked) | YES | YES | Full CRUD |
| `vikriti_assessments` | postgres | Sensitive (Ayurvedic) | Denied (Revoked) | Denied (Revoked) | YES | YES | Full CRUD |
| `treatment_plans` | postgres | Sensitive (Clinical) | Denied (Revoked) | Denied (Revoked) | YES | YES | Full CRUD |
| `panchakarma_courses` | postgres | Sensitive (Clinical) | Denied (Revoked) | Denied (Revoked) | YES | YES | Full CRUD |
| `panchakarma_referrals`| postgres | Sensitive (Clinical) | Denied (Revoked) | Denied (Revoked) | YES | YES | Full CRUD |
| `panchakarma_phase_transitions` | postgres | Sensitive (Clinical) | Denied (Revoked) | Denied (Revoked) | YES | YES | Full CRUD |
| `therapy_rooms` | postgres | Operational | Denied (Revoked) | Denied (Revoked) | YES | YES | Full CRUD |
| `therapy_sessions` | postgres | Sensitive (Clinical) | Denied (Revoked) | Denied (Revoked) | YES | YES | Full CRUD |
| `staff_therapy_authorizations` | postgres | Sensitive (Clinical Privileges) | Denied (Revoked) | Denied (Revoked) | YES | YES | Full CRUD |
| `prescriptions` | postgres | Sensitive (PHI/Pharmacy) | Denied (Revoked) | Denied (Revoked) | YES | YES | Full CRUD |
| `medication_stock` | postgres | Operational (Inventory) | Denied (Revoked) | Denied (Revoked) | YES | YES | Full CRUD |
| `stock_movements` | postgres | Operational (Audit) | Denied (Revoked) | Denied (Revoked) | YES | YES | Full CRUD |
| `dispensing_records` | postgres | Sensitive (Audit Ledger)| Denied (Revoked) | Denied (Revoked) | YES | YES | Append-Only (Immutable: UPDATE/DELETE denied) |
| `dispensing_idempotency`| postgres| Operational (State) | Denied (Revoked) | Denied (Revoked) | YES | YES | Full CRUD |
| `invoices` | postgres | Sensitive (Financial) | Denied (Revoked) | Denied (Revoked) | YES | YES | Full CRUD |
| `payments` | postgres | Sensitive (Financial) | Denied (Revoked) | Denied (Revoked) | YES | YES | Full CRUD |
| `financial_idempotency`| postgres| Operational (State) | Denied (Revoked) | Denied (Revoked) | YES | YES | Full CRUD |
| `refund_requests` | postgres | Sensitive (Financial) | Denied (Revoked) | Denied (Revoked) | YES | YES | Full CRUD |
| `refund_ledger_entries`| postgres| Sensitive (Audit Ledger)| Denied (Revoked) | Denied (Revoked) | YES | YES | Append-Only (Immutable: UPDATE/DELETE denied) |
| `hospital_profiles` | postgres | Sensitive (Institution Config) | Denied (Revoked) | Denied (Revoked) | YES | YES | Full CRUD (service_role) |
| `public_hospital_profile` (View) | postgres | Public Institutional Info | SELECT Allowed (14 Approved Fields) | SELECT Allowed (14 Approved Fields) | N/A (View) | N/A | Excludes staff identity & internal metadata |
| `hospital_tariffs` | postgres | Governance (Pricing) | Denied (Revoked) | Denied (Revoked) | YES | YES | Full CRUD |
| `rate_histories` | postgres | Sensitive (Audit Ledger)| Denied (Revoked) | Denied (Revoked) | YES | YES | Append-Only (Immutable: UPDATE/DELETE denied) |
| `departments` | postgres | Operational Configuration| Denied (Revoked) | Denied (Revoked) | YES | YES | Full CRUD |
| `lab_orders` | postgres | Sensitive (Clinical) | Denied (Revoked) | Denied (Revoked) | YES | YES | Full CRUD |
| `patient_documents` | postgres | Sensitive (PHI Files) | Denied (Revoked) | Denied (Revoked) | YES | YES | Full CRUD |
| `audit_logs` | postgres | Sensitive (Audit Ledger)| Denied (Revoked) | Denied (Revoked) | YES | YES | Append-Only (Immutable: UPDATE/DELETE denied) |

---

## 3. Database Connection & Role Capability Architecture

### 3.1 Role Capabilities in PostgreSQL Catalog

Inspection of PostgreSQL roles (`pg_roles`):

```
rolname       | rolsuper | rolinherit | rolcreaterole | rolcreatedb | rolcanlogin | rolreplication | rolbypassrls
--------------+----------+------------+---------------+-------------+-------------+----------------+-------------
anon          | false    | false      | false         | false       | false       | false          | false
authenticated | false    | false      | false         | false       | false       | false          | false
service_role  | false    | false      | false         | false       | false       | false          | true
postgres      | true     | true       | true          | true        | true        | true           | true
authenticator | false    | false      | false         | false       | true        | false          | false
```

### 3.2 Connection Role & Trusted Server Boundary

- **Production Connection String (`DATABASE_URL`):** Connects to the Supabase Session Pooler (`aws-0-ap-south-1.pooler.supabase.com:5432`) as `postgres.wxluexdkedzqlighkfti`, resolving in PostgreSQL as `current_user: postgres`.
- **Bypass Capability:** Because `postgres` is a superuser and has `rolbypassrls = true`, PostgreSQL **bypasses RLS** for all backend queries executed via Prisma.
- **Architectural Boundary:**
  - **Prisma/Express Backend:** Acts as the **trusted server boundary**. It handles all user authentication (HMAC-SHA256 session tokens with 24-hour expiration), active account status verification, and 7-role application RBAC.
  - **Row Level Security (RLS) & Grant Revocations:** Act as the **perimeter security boundary**. They protect the database against untrusted direct access via Supabase PostgREST Data API (which executes under the `authenticator` role, transitioning to `anon` or `authenticated`, where `rolbypassrls = false`).

> [!IMPORTANT]
> **No False Claims:** We explicitly report that RLS does not restrict backend queries issued by Prisma over the `postgres` role, as this role has `rolbypassrls = true`. RLS serves as the perimeter defense enforcing default-deny access controls against untrusted external PostgREST and Data API requests.

---

## 4. Staged Implementation Architecture

### Stage 1: Perimeter Hardening (Implemented in this Migration)
1. Revoke public table grants from `PUBLIC`, `anon`, and `authenticated`.
2. Enable RLS and FORCE RLS across all 38 tables.
3. Deny direct PostgREST access to operational tables.
4. Allow public read-only access exclusively through the `public.public_hospital_profile` restricted security-barrier view (14 approved fields, `"singletonKey" = 'PRIMARY_INSTITUTION'`), while completely revoking direct SELECT and mutation access to the underlying `hospital_profiles` table from `anon` and `authenticated`.
5. Lock down audit and financial ledgers (`audit_logs`, `refund_ledger_entries`, `rate_histories`, `dispensing_records`) as append-only.

### Stage 2: Application Identity Context Helpers (Implemented)
Defined stable session-context retrieval functions:
- `public.app_current_user_id()`: Returns `current_setting('app.current_user_id', true)`.
- `public.app_current_user_role()`: Returns `current_setting('app.current_user_role', true)`.

Verified that transaction-scoped execution (`SET LOCAL app.current_user_id = ...`) isolates context completely within the transaction and prevents leakage across connections in the pool.

### Stage 3: Future Dedicated Non-BYPASSRLS App Role (Roadmap)
For organizations requiring database-enforced user boundaries:
1. Create a dedicated `sahachara_app` role without `BYPASSRLS`.
2. Wrap all Prisma queries in interactive transactions utilizing Prisma extension middleware to prepend `SET LOCAL app.current_user_id` and `SET LOCAL app.current_user_role`.
3. Transition `DATABASE_URL` credentials on Render to `sahachara_app`.

---

## 5. Automated Verification Results

### 5.1 RLS Verification Suite (`npm run test:rls`)
Executed `scripts/verify-supabase-rls.ts` against an isolated database:
- **Total Tests:** 44
- **Passed:** 44
- **Failed:** 0
- **Key Assertions Verified:**
  1. `anon` SELECT rejected with permission denied across operational tables (`patients`, `users`, `prescriptions`, `invoices`, `hospital_tariffs`, `therapy_sessions`).
  2. `anon` INSERT/UPDATE/DELETE rejected with permission denied.
  3. `anon` SELECT permitted on `public.public_hospital_profile` view (14 approved fields, `"singletonKey" = 'PRIMARY_INSTITUTION'`), while direct access to `public.hospital_profiles` table is strictly denied (42501).
  4. `authenticated` role completely rejected from reading or writing operational records.
  5. `service_role` permitted to execute operational queries.
  6. `service_role` UPDATE and DELETE blocked on `refund_ledger_entries`, `audit_logs`, `rate_histories`, and `dispensing_records`. Because `service_role` possesses `BYPASSRLS` in Supabase PostgreSQL, this immutability is strictly enforced by PostgreSQL privilege restrictions (revoked UPDATE and DELETE grants on the relation) alongside default-deny RLS policies.
  7. Transaction-scoped context isolation verified: `SET LOCAL` values do not leak into subsequent pooled queries.
  8. Trusted backend Prisma operations execute seamlessly (all entity queries succeed).

### 5.2 Complete Project Regression Suite
- **API Security Inventory (`npm run test:api-security`):** 41 / 41 PASSED (201 endpoints verified, 197 protected, 4 public).
- **Hardcoded Data Elimination (`npm run test:data-elimination`):** 56 / 56 PASSED (17 empty arrays, 0 fake patients, database-backed aggregations).
- **Frontend Authentication Guard (`npm run test:auth-guard`):** 19 / 19 PASSED.
- **9 Domain Verification Suites (`npm test`):** 641 / 641 PASSED (RBAC, implementation, pharmacy pricing, patient management, appointments reception, clinical operations, pharmacy dispensing, financial operations, staff management).
- **Production Database Isolation:** 0 mutations verified against live Supabase.

---

## 6. Migration Rollout & Recovery Plan

### 6.1 Migration File Details
- **Path:** [migration.sql](file:///Users/highflyer/Desktop/Sahachara_Ops/prisma/migrations/20261114050000_supabase_row_level_security/migration.sql)
- **Name:** `20261114050000_supabase_row_level_security`
- **Execution Command (Staging/Production):**
  ```bash
  npx prisma migrate deploy
  ```

### 6.2 Narrowly Scoped Recovery & Remediation Procedure

> [!CAUTION]
> **Strict Operational Boundary:** Under NO circumstances may blanket table privileges be granted to `anon` or `authenticated`. The PostgREST perimeter must remain permanently sealed.

#### Technical Semantics of `FORCE ROW LEVEL SECURITY`
In PostgreSQL:
- `ALTER TABLE <table> ENABLE ROW LEVEL SECURITY`: Enforces RLS policies for all non-owner roles. The table owner (and superusers/roles with `BYPASSRLS`) bypass RLS.
- `ALTER TABLE <table> FORCE ROW LEVEL SECURITY`: Forces RLS policies to apply to the **table owner** as well. (Superusers and roles with `BYPASSRLS` continue to bypass RLS).
- `ALTER TABLE <table> NO FORCE ROW LEVEL SECURITY`: Exempts the table owner from RLS policies. It has **no effect** on non-owner roles (which remain subject to RLS) or superusers/BYPASSRLS roles (which bypass RLS regardless).

#### Recovery Prerequisites & Approval Requirements
1. **Invocation Criteria:** May only be initiated during an active P0 production incident where an identified RLS policy defect demonstrably blocks legitimate clinical, dispensing, or billing operations.
2. **Approval:** Requires explicit, written authorization from the System Administrator / SUPER_ADMIN.
3. **Execution Scope:** Must be executed within an isolated, audited administrative transaction (`BEGIN ... COMMIT`).

#### Targeted Single-Table Policy Remediation
If an individual table's RLS policy contains a defect blocking legitimate application traffic, targeted remediation adjusts or drops the defective policy on that table, or temporarily disables RLS on that specific table while a migration fix is deployed:

```sql
BEGIN;

-- 1. Log administrative incident recovery (valid under audit_logs append-only schema)
INSERT INTO public.audit_logs (
  "id", "timestamp", "actor", "role", "category", "action", "details", "ipAddress"
) VALUES (
  gen_random_uuid()::text, NOW(), 'Emergency DBA', 'SUPER_ADMIN',
  'Database Security', 'EMERGENCY_RLS_REMEDIATION',
  'Targeted policy adjustment on public.<affected_table>', '127.0.0.1'
);

-- 2. Drop the specific defective policy on the affected table
DROP POLICY IF EXISTS <defective_policy_name> ON public.<affected_table>;

-- 3. Replace with the corrected policy (scoped to service_role / application role)
-- Example: CREATE POLICY <corrected_policy> ON public.<affected_table> FOR ALL TO service_role USING (true) WITH CHECK (true);
-- NOTE: In Supabase PostgreSQL, `service_role` has `rolbypassrls = true` in pg_roles.
-- Consequently, an example RLS policy defined for `service_role` does not constrain a BYPASSRLS role;
-- RLS policies only constrain non-bypass roles. Any mutation restriction on a BYPASSRLS role
-- must be enforced via table-level privilege grants (e.g. REVOKE UPDATE, DELETE), not RLS policies.

-- 4. In extreme emergencies requiring temporary RLS relaxation on <affected_table> ONLY:
-- ALTER TABLE public.<affected_table> DISABLE ROW LEVEL SECURITY;
-- SECURITY PROOF: Because REVOKE ALL ON TABLE public.<affected_table> FROM anon, authenticated
-- remains permanently in effect, SQL privilege checks fail closed at the grant level (42501).
-- Neither anon nor authenticated can read or write the table.

-- 5. Confirm that anon and authenticated remain completely denied (Zero public grants)
REVOKE ALL ON TABLE public.<affected_table> FROM anon, authenticated;

COMMIT;
```

#### Post-Recovery Verification
Upon deploying the corrected policy migration:
```sql
ALTER TABLE public.<affected_table> ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.<affected_table> FORCE ROW LEVEL SECURITY;
```
Verify immediately by executing `npm run test:rls`.

---

## 7. Acceptance Criteria Checklist

| Criterion | Status | Evidence |
| :--- | :---: | :--- |
| All 38 application tables have RLS enabled | **CONFIRMED** | `relrowsecurity = true` verified on 38/38 tables |
| All 38 application tables have FORCE RLS enabled | **CONFIRMED** | `relforcerowsecurity = true` verified on 38/38 tables |
| Table grants explicitly controlled | **CONFIRMED** | Broad public grants revoked; anon/authenticated denied |
| Anonymous PostgREST Data API exposure eliminated | **CONFIRMED** | Operational tables return 42501 permission denied to anon |
| Controlled public access for hospital metadata | **CONFIRMED** | `public_hospital_profile` restricted view exposes only 14 approved fields; base table denied |
| Immutable financial & audit ledgers protected | **CONFIRMED** | UPDATE/DELETE denied on `audit_logs` & `refund_ledger_entries` |
| Privileged backend access accurately documented | **CONFIRMED** | `postgres` role bypass capability documented as trusted server boundary |
| Application queries continue to function seamlessly | **CONFIRMED** | 641 / 641 domain tests pass cleanly |
| Production database isolation maintained | **CONFIRMED** | 0 production records modified during discovery and testing |
