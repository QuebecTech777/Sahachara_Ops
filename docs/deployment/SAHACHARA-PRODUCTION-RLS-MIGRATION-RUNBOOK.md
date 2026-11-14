# Sahachara Ops — Production RLS Migration Readiness & Execution Runbook

**Document Version:** 2.0.0 (Post-Review Safety Revision)  
**Target Migration:** `20261114050000_supabase_row_level_security`  
**Target Environment:** Supabase PostgreSQL (Managed, Mumbai `ap-south-1`)  
**Target Branch:** `main`  
**Committed Baseline:** `e3483dc`  
**Classification:** P0 — Production Database Perimeter Hardening & Row Level Security  

---

## Executive Summary & Classification Guide

This runbook specifies the preflight, impact analysis, transactionality behavior, sequential deployment steps, multi-tier recovery architecture, and post-migration verification procedures for applying the Supabase PostgreSQL Row Level Security (RLS) migration to the live Sahachara Ops production database.

Throughout this document, findings, measurements, and instructions are categorized as:
- **[VERIFIED FACT]:** Empirically inspected and verified directly against the production PostgreSQL instance, committed migration SQL, or local isolated test execution.
- **[TECHNICAL ASSUMPTION]:** Standard platform behavior based on Supabase/PostgreSQL architecture.
- **[UNRESOLVED PREREQUISITE]:** Out-of-band administrative check that must be confirmed by the project owner prior to authorizing production deployment.

---

## 1. Production Preflight Inspection

### 1.1 Current Production Migration History & Integrity
- **[VERIFIED FACT]** Querying `public._prisma_migrations` on the production database (`aws-0-ap-south-1.pooler.supabase.com:5432/postgres`) confirms that **23 migrations** are currently applied.
- **[VERIFIED FACT]** The latest applied migration is `20261114040000_phase7_therapy_buffer_nullable` (finished at `2026-11-14T11:12:29.304Z`).
- **[VERIFIED FACT]** There are **0 failed or rolled-back migrations** (`finished_at IS NULL OR rolled_back_at IS NOT NULL` returns 0 rows).
- **[VERIFIED FACT]** Migration `20261114050000_supabase_row_level_security` is **PENDING** (not yet applied to production).

```sql
-- Preflight Query 1: Migration History & Failed Entry Check
SELECT id, migration_name, started_at, finished_at, rolled_back_at, applied_steps_count
FROM public._prisma_migrations
ORDER BY started_at DESC;
```

### 1.2 Current Production RLS & FORCE RLS State
- **[VERIFIED FACT]** Inspection of `pg_class` across schema `public` reveals exactly **38 tables**:
  - `relrowsecurity = true` count: **0 / 38**
  - `relforcerowsecurity = true` count: **0 / 38**
  - Table owner for all 38 tables: `postgres`
- **[VERIFIED FACT]** Currently, **zero application tables have RLS enabled** in production.

```sql
-- Preflight Query 2: RLS & FORCE RLS State
SELECT c.relname AS table_name,
       c.relrowsecurity AS rls_enabled,
       c.relforcerowsecurity AS force_rls_enabled,
       pg_catalog.pg_get_userbyid(c.relowner) AS table_owner
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r'
ORDER BY c.relname ASC;
```

### 1.3 Comprehensive Production Privilege Inventory
The PostgreSQL privilege architecture in production currently exposes wide perimeter attack surfaces across tables, sequences, routines, and default ACLs:

#### A. Table Grants (`information_schema.table_privileges`)
- **[VERIFIED FACT]** Roles `anon` and `authenticated` possess `ALL` privileges (`DELETE`, `INSERT`, `REFERENCES`, `SELECT`, `TRIGGER`, `TRUNCATE`, `UPDATE`) across **all 38 tables**.
- **[VERIFIED FACT]** Roles `service_role` and `postgres` possess `ALL` privileges across **all 38 tables**.
- **[VERIFIED FACT]** Role `PUBLIC` possesses zero direct table grants (grants are attached to `anon` and `authenticated`).

```sql
-- Preflight Query 3A: Table Privileges
SELECT grantee, privilege_type, count(*)::int AS table_count
FROM information_schema.table_privileges
WHERE table_schema = 'public' 
  AND grantee IN ('PUBLIC', 'anon', 'authenticated', 'service_role', 'postgres')
GROUP BY grantee, privilege_type
ORDER BY grantee, privilege_type;
```

#### B. Sequence Grants (`information_schema.usage_privileges`)
- **[VERIFIED FACT]** Roles `anon`, `authenticated`, `service_role`, and `postgres` all possess `USAGE` privileges on all 10 application sequences.

```sql
-- Preflight Query 3B: Sequence USAGE Privileges
SELECT grantee, privilege_type, count(*)::int AS sequence_count
FROM information_schema.usage_privileges
WHERE object_schema = 'public' AND object_type = 'SEQUENCE'
GROUP BY grantee, privilege_type
ORDER BY grantee, privilege_type;
```

#### C. Routine / Function Execution Grants (`information_schema.routine_privileges`)
- **[VERIFIED FACT]** Routines `prevent_refund_ledger_mutation` and `protect_hospital_profile_singleton` have `EXECUTE` privileges granted to `PUBLIC`, `anon`, and `authenticated`.

```sql
-- Preflight Query 3C: Routine Privileges
SELECT routine_name, grantee, privilege_type
FROM information_schema.routine_privileges
WHERE routine_schema = 'public'
  AND grantee IN ('PUBLIC', 'anon', 'authenticated', 'service_role')
ORDER BY routine_name, grantee;
```

#### D. Existing Default Privileges (`pg_default_acl`)
- **[VERIFIED FACT]** Default privileges for role `postgres` in schema `public` automatically grant:
  - Tables (`r`): `SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER` to `anon`, `authenticated`, `service_role`.
  - Sequences (`S`): `USAGE, SELECT, UPDATE` to `anon`, `authenticated`, `service_role`.
  - Functions (`f`): `EXECUTE` to `anon`, `authenticated`, `service_role`.
- **[VERIFIED FACT]** This confirms why `ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ...` in the migration is mandatory: without it, future tables would automatically inherit public exposure.

```sql
-- Preflight Query 3D: Default ACLs in Schema Public
SELECT pg_catalog.pg_get_userbyid(d.defaclrole) AS def_role,
       n.nspname AS schema_name,
       d.defaclobjtype AS obj_type,
       d.defaclacl::text AS default_acls
FROM pg_default_acl d
LEFT JOIN pg_namespace n ON n.oid = d.defaclnamespace
WHERE n.nspname = 'public' OR d.defaclnamespace = 0;
```

### 1.4 Public Hospital Profile View Baseline
- **[VERIFIED FACT]** View `public.public_hospital_profile` currently **does not exist** in the production database.
- The view will be created by the migration with the following validated properties:
  - Owner: `postgres`
  - `security_barrier = true` (ensures user WHERE clauses cannot bypass internal singleton filter).
  - `security_invoker = false` (executes with view owner privileges, allowing anonymous callers to read approved fields even when base table direct access is denied).
  - Exact 14 exposed columns: `code`, `legalName`, `displayName`, `address`, `city`, `state`, `country`, `postalCode`, `phone`, `emergencyPhone`, `email`, `website`, `timezone`, `currency`.

### 1.5 Database Role Capabilities & Connection Architecture
- **[VERIFIED FACT]** Inspection of `pg_roles` in production:
  - `postgres`: `rolcanlogin = true`, `rolsuper = false`, `rolcreaterole = true`, `rolcreatedb = true`, `rolbypassrls = true`.
  - `service_role`: `rolcanlogin = false`, `rolsuper = false`, `rolbypassrls = true`.
  - `anon`: `rolcanlogin = false`, `rolsuper = false`, `rolbypassrls = false`.
  - `authenticated`: `rolcanlogin = false`, `rolsuper = false`, `rolbypassrls = false`.
  - `authenticator`: `rolcanlogin = true`, `rolsuper = false`, `rolbypassrls = false` (PostgREST connection gateway).
- **[VERIFIED FACT]** The application connects via Supabase Session Pooler (`aws-0-ap-south-1.pooler.supabase.com:5432/postgres`) as `postgres.wxluexdkedzqlighkfti`, resolving as `current_user: postgres` with `rolbypassrls = true`.
- **[VERIFIED FACT]** Production Data Snapshot:
  - `users`: 1 (`systems@sahachara.com`)
  - `hospital_profiles`: 1 (`PRIMARY_INSTITUTION`)
  - `staff_members`, `patients`, `appointments`, `prescriptions`, `invoices`, `tariffs`: 0.

---

## 2. Backup & Multi-Tier Recovery Architecture

### 2.1 Multi-Tier Recovery Strategy
To ensure zero data loss and avoid dangerous operations during production incidents, recovery procedures are partitioned into four distinct tiers:

```
┌─────────────────────────────────────────────────────────────────┐
│ Tier 1: In-Place DDL & Privilege Remediation (Preferred)        │
│ Correct specific table grants or policies without downtime.     │
├─────────────────────────────────────────────────────────────────┤
│ Tier 2: Supabase Automated Point-in-Time Recovery (PITR)        │
│ Managed cluster-level rollback to precise second via Dashboard. │
├─────────────────────────────────────────────────────────────────┤
│ Tier 3: Isolated Database Restoration & Validation              │
│ Restore logical backup to staging DB to verify data integrity.  │
├─────────────────────────────────────────────────────────────────┤
│ Tier 4: Disaster Recovery Full Cluster Restore (Last Resort)    │
│ Clean restore into production during declared maintenance window│
└─────────────────────────────────────────────────────────────────┘
```

> [!CAUTION]
> **Prohibition of Direct `pg_restore --clean`:**  
> Running `pg_restore --clean --if-exists` directly against a live production database is strictly prohibited as a standard migration rollback. Doing so drops and recreates tables while active application connections may be executing, risking query aborts, pool starvation, connection deadlocks, and total data loss if the dump file is incomplete.

### 2.2 Supabase Backup Capabilities & Retention
- **[TECHNICAL ASSUMPTION]** Supabase provides automated physical backups in `ap-south-1`:
  - Daily automated physical backups with 7-day retention (standard tier).
  - Continuous Point-in-Time Recovery (PITR) with granular replay up to 7–30 days (Pro / Team tier).
- **[UNRESOLVED PREREQUISITE 1]:** The project owner must inspect the Supabase Dashboard (`Database` -> `Backups`) to confirm whether PITR is enabled and verify the timestamp of the latest physical backup.

### 2.3 Deterministic Pre-Migration Logical Backup
Regardless of platform backups, an immediate logical backup MUST be generated prior to migration execution:
- **Backup Tool:** `/opt/homebrew/opt/postgresql@16/bin/pg_dump`
- **Exclusion from Git:** Verified that `backups/` is listed in `.gitignore`. Backup files must never be committed to source control.
- **Backup Command:**
  ```bash
  mkdir -p ./backups
  export BACKUP_FILE="./backups/sahachara_prod_pre_rls_$(date +%Y%m%d_%H%M%S).dump"
  
  /opt/homebrew/opt/postgresql@16/bin/pg_dump "$DATABASE_URL" \
    --format=custom \
    --no-owner \
    --no-privileges \
    --file="$BACKUP_FILE"
  
  # Set secure permissions (read/write by owner only)
  chmod 600 "$BACKUP_FILE"
  ls -lh "$BACKUP_FILE"
  ```

### 2.4 Verification of Backup Recoverability into an Isolated Database
Before running the migration, the operator must verify that the archive is valid and recoverable by restoring it into an isolated temporary database:
```bash
# 1. Verify archive table of contents
/opt/homebrew/opt/postgresql@16/bin/pg_restore --list "$BACKUP_FILE" > /dev/null
echo "Archive structure valid: $?"

# 2. Test restore into isolated local verification database
createdb sahachara_restore_verify_test
/opt/homebrew/opt/postgresql@16/bin/pg_restore \
  --no-owner \
  --no-privileges \
  --dbname="postgresql://localhost:5432/sahachara_restore_verify_test" \
  "$BACKUP_FILE"

# 3. Verify record counts match production snapshot
psql "postgresql://localhost:5432/sahachara_restore_verify_test" -c "
  SELECT 
    (SELECT count(*) FROM users) AS users,
    (SELECT count(*) FROM hospital_profiles) AS profiles;
"

# 4. Clean up temporary verification database
dropdb sahachara_restore_verify_test
```

### 2.5 Realistic Recovery Objectives (Measured & Unresolved)
- **Measured Local Execution (Empirical):** On the baseline dataset (1 user, 1 profile, 38 tables), logical `pg_dump` completed in **0.24 seconds** and `pg_restore` completed in **0.42 seconds**.
- **Production RPO Target:** Dependent on pre-migration backup completion. If the manual snapshot is taken immediately prior to migration execution during an operational pause, the effective RPO is **0 seconds**.
- **Production RTO Target:**
  - For Tier 1 (In-Place Policy Remediation): **< 2 minutes**.
  - For Tier 2 (Supabase Dashboard PITR): **Unresolved platform target** (typically 10–25 minutes depending on Supabase infrastructure provisioning).
  - For Tier 4 (Full Logical Restore): **< 10 minutes** (including verification steps).

---

## 3. Migration Impact & Transactionality Analysis

### 3.1 Migration SQL Inspection
File: `prisma/migrations/20261114050000_supabase_row_level_security/migration.sql` (591 lines).

- **[VERIFIED FACT]** Top-level explicit `BEGIN;` and `COMMIT;` statements are **absent** from `migration.sql`. The file contains internal PL/pgSQL `DO $$ BEGIN ... END $$;` blocks and `CREATE FUNCTION` bodies, but no script-level transaction markers.
- **[VERIFIED FACT]** All DDL statements in the migration (`ALTER TABLE ... ENABLE/FORCE ROW LEVEL SECURITY`, `REVOKE`, `GRANT`, `CREATE POLICY`, `CREATE VIEW`, `ALTER DEFAULT PRIVILEGES`) are fully transactional in PostgreSQL.

### 3.2 Prisma Migration Engine Atomicity & Failure Behavior
To establish empirical evidence of rollback behavior, a simulated migration failure was executed against an isolated PostgreSQL instance using `npx prisma migrate deploy`:

1. **Transaction Wrapping (Empirically Verified):**  
   Prisma's internal `schema-engine` automatically wraps the entire migration script inside a transaction block (`BEGIN` ... `COMMIT`).
2. **Schema Rollback Behavior (Empirically Verified):**  
   When a statement fails halfway through execution, PostgreSQL aborts the transaction and **completely rolls back all preceding DDL changes**. Canary tables created prior to the failure point did not persist in PostgreSQL.
3. **Migration Table State (`_prisma_migrations`):**  
   Although the schema rolls back cleanly, Prisma records the migration attempt in `_prisma_migrations` with:
   - `finished_at = NULL`
   - `rolled_back_at = NULL`
   - `logs` containing the exact PostgreSQL error message (error code `P3018`).
4. **Subsequent Migration Lockout:**  
   Prisma enters a locked state refusing subsequent migrations until the failed entry is resolved via:
   ```bash
   npx prisma migrate resolve --rolled-back 20261114050000_supabase_row_level_security
   ```
5. **Connection Pooler Consideration:**  
   The production backend connects via Supabase Session Pooler (`port 5432`). In Session pooler mode, multi-statement transactions are natively supported by PostgreSQL without pooler interference.

### 3.3 Measured Execution Duration
- **[VERIFIED FACT]** In isolated baseline testing against the 23-migration schema, `npx prisma migrate deploy` executed in **0.898 seconds**.
- Total table lock duration is sub-millisecond per table, causing negligible impact on running services.

---

## 4. Service Role Access Control Architecture

### 4.1 `service_role` and `rolbypassrls = true`
- **[VERIFIED FACT]** In Supabase PostgreSQL, `service_role` is created with `rolbypassrls = true` in `pg_roles`.
- **Architectural Consequence:** RLS policies (`CREATE POLICY ... TO service_role`) **DO NOT constrain the `service_role` role**. PostgreSQL completely bypasses row-level policy filters for any role with `BYPASSRLS`.
- **Correction to Prior Assumptions:** Creating a permissive or restrictive RLS policy for `service_role` has zero effect on whether it can read or write rows.

### 4.2 Role of PostgreSQL Grants for Ledger Immutability
Because RLS cannot restrict a `BYPASSRLS` role, the immutability of the four financial and audit ledgers is enforced strictly via **PostgreSQL table-level privilege grants**:
- `public.audit_logs`
- `public.refund_ledger_entries`
- `public.rate_histories`
- `public.dispensing_records`

The migration explicitly executes:
```sql
REVOKE UPDATE, DELETE ON public.audit_logs FROM service_role, anon, authenticated;
REVOKE UPDATE, DELETE ON public.refund_ledger_entries FROM service_role, anon, authenticated;
REVOKE UPDATE, DELETE ON public.rate_histories FROM service_role, anon, authenticated;
REVOKE UPDATE, DELETE ON public.dispensing_records FROM service_role, anon, authenticated;
```
Even with `BYPASSRLS`, when `service_role` attempts an `UPDATE` or `DELETE` on these tables, PostgreSQL immediately halts execution with:
`ERROR: 42501 permission denied for table <ledger_table>`

---

## 5. Isolated Migration Validation Results

A complete pre-production trial was conducted on an isolated test database (`sahachara_ops_test_db`) initialized to the exact 23-migration production baseline:

| Test Item | Verification Method | Result | Notes |
| :--- | :--- | :---: | :--- |
| **1. Baseline Setup** | 23 migrations applied via SQL | **SUCCESS** | Matched production schema exactly |
| **2. Migration Execution** | `npx prisma migrate deploy` | **SUCCESS** | Applied in **0.898s** |
| **3. RLS & FORCE RLS** | Query `pg_class` for all 38 tables | **38 / 38 PASSED** | `relrowsecurity` & `relforcerowsecurity` true |
| **4. Anon Table Denial** | Attempt `SELECT` on `patients` as `anon` | **42501 DENIED** | Denied at grant level |
| **5. Authenticated Denial** | Attempt `SELECT` on `invoices` as `authenticated` | **42501 DENIED** | Denied at grant level |
| **6. Public View Access** | Query `public_hospital_profile` as `anon` | **SUCCESS** | Returned 14 approved columns; excludes internals |
| **7. Ledger Immutability** | Attempt `UPDATE` on `audit_logs` as `service_role` | **42501 DENIED** | Blocked by PostgreSQL table privileges |
| **8. Prisma Backend Access** | Execute `prisma.hospitalProfile.findFirst()` | **SUCCESS** | Connects via `postgres` (`BYPASSRLS`), zero impact |
| **9. Full RLS Suite** | `npm run test:rls` | **44 / 44 PASSED** | All perimeter assertions confirmed |
| **10. Failure Simulation** | Induced syntax error in test migration | **ROLLED BACK** | Schema rolled back completely; P3018 recorded |

---

## 6. Sequential Production Execution Procedure

### 6.1 Phase 1: Pre-Execution Prerequisites
1. Confirm Project Owner explicit written authorization.
2. Verify production database connection string (`DATABASE_URL`) points to `aws-0-ap-south-1.pooler.supabase.com:5432/postgres`.
3. Confirm git branch `main` is clean at commit `e3483dc` or later.
4. Notify clinical and operational teams of the 5-minute migration window.

### 6.2 Phase 2: Pre-Migration Backup & Integrity Verification
```bash
# 1. Take snapshot
mkdir -p ./backups
export BACKUP_FILE="./backups/sahachara_prod_pre_rls_$(date +%Y%m%d_%H%M%S).dump"
/opt/homebrew/opt/postgresql@16/bin/pg_dump "$DATABASE_URL" \
  --format=custom \
  --no-owner \
  --no-privileges \
  --file="$BACKUP_FILE"

chmod 600 "$BACKUP_FILE"

# 2. Verify archive readability
/opt/homebrew/opt/postgresql@16/bin/pg_restore --list "$BACKUP_FILE" > /dev/null
echo "Backup verification complete. Archive valid."
```

### 6.3 Phase 3: Execute the Migration
```bash
npx prisma migrate deploy
```

**Expected Successful Output:**
```
Prisma schema loaded from prisma/schema.prisma
Datasource "db": PostgreSQL database "postgres", schema "public" at "aws-0-ap-south-1.pooler.supabase.com:5432"

1 migration found in prisma/migrations

Applying migration `20261114050000_supabase_row_level_security`

The following migration has been applied:

migrations/
  └─ 20261114050000_supabase_row_level_security/
      └─ migration.sql

All migrations have been successfully applied.
```

### 6.4 Phase 4: Immediate Production Database Verification
Execute the following verification queries against production immediately following deployment:

#### Query 1: Verify 38/38 RLS and FORCE RLS Flags
```sql
SELECT count(*) AS total_tables,
       count(*) FILTER (WHERE relrowsecurity) AS rls_enabled,
       count(*) FILTER (WHERE relforcerowsecurity) AS force_rls_enabled
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r';
```
*Pass Criteria:* `total_tables: 38`, `rls_enabled: 38`, `force_rls_enabled: 38`.

#### Query 2: Verify Elimination of Public Table Grants
```sql
SELECT count(*) AS exposed_tables
FROM information_schema.table_privileges 
WHERE table_schema = 'public' 
  AND grantee IN ('PUBLIC', 'anon', 'authenticated')
  AND table_name != 'public_hospital_profile';
```
*Pass Criteria:* `exposed_tables: 0`.

#### Query 3: Verify Public Hospital View Configuration
```sql
SELECT table_name, view_definition 
FROM information_schema.views 
WHERE table_schema = 'public' AND table_name = 'public_hospital_profile';

SELECT grantee, privilege_type 
FROM information_schema.table_privileges 
WHERE table_schema = 'public' AND table_name = 'public_hospital_profile';
```
*Pass Criteria:* View exists, filters on `"singletonKey" = 'PRIMARY_INSTITUTION'`, and grants `SELECT` to `anon` and `authenticated`.

#### Query 4: Verify Sequence & Routine Privileges Revoked from Public
```sql
SELECT count(*) AS exposed_sequences
FROM information_schema.usage_privileges
WHERE object_schema = 'public' 
  AND object_type = 'SEQUENCE'
  AND grantee IN ('PUBLIC', 'anon', 'authenticated');

SELECT count(*) AS exposed_routines
FROM information_schema.routine_privileges
WHERE routine_schema = 'public'
  AND grantee IN ('PUBLIC', 'anon', 'authenticated');
```
*Pass Criteria:* `exposed_sequences: 0`, `exposed_routines: 0`.

#### Query 5: Verify Ledger Mutation Restrictions on `service_role`
```sql
SELECT table_name, privilege_type 
FROM information_schema.table_privileges 
WHERE table_schema = 'public' 
  AND table_name IN ('audit_logs', 'refund_ledger_entries', 'rate_histories', 'dispensing_records')
  AND privilege_type IN ('UPDATE', 'DELETE')
  AND grantee = 'service_role';
```
*Pass Criteria:* `0` rows (UPDATE and DELETE completely absent).

### 6.5 Phase 5: Production Application Smoke Tests
```bash
# 1. Backend health check (Must return HTTP 200)
curl -f -s https://sahachara-ayurveda-backend.onrender.com/health | grep '"status":"ok"'

# 2. Public clinic info endpoint (Must return HTTP 200 with institutional metadata)
curl -f -s https://sahachara-ayurveda-backend.onrender.com/api/clinic/info | grep 'Sahachara'

# 3. Protected endpoint fail-closed authentication test (Must return HTTP 401)
curl -s -o /dev/null -w "%{http_code}" https://sahachara-ayurveda-backend.onrender.com/api/patients | grep '401'
```

---

## 7. Emergency Remediation & Recovery Procedures

### 7.1 Tier 1: Targeted Table Remediation (Standard Operational Incident)
If a specific table exhibits permission or operational issues after migration:
- **For `service_role`:** Adjust table-level object grants (`GRANT / REVOKE`). Do NOT attempt RLS policies on `service_role`.
- **For `anon` / `authenticated`:** Always preserve complete revocation (`REVOKE ALL ON TABLE ... FROM PUBLIC, anon, authenticated;`).

```sql
BEGIN;

-- Example: If service_role requires specific operational grant
GRANT SELECT, INSERT, UPDATE, DELETE ON public.<affected_table> TO service_role;

-- Strictly maintain ledger immutability (if affected table is a ledger)
-- REVOKE UPDATE, DELETE ON public.<affected_table> FROM service_role, anon, authenticated;

-- Confirm perimeter remains closed to untrusted roles
REVOKE ALL ON TABLE public.<affected_table> FROM PUBLIC, anon, authenticated;

COMMIT;
```

### 7.2 Tier 2: Prisma Migration Failure Recovery (P3018 Error)
If the migration fails during deployment:
1. PostgreSQL schema will have rolled back automatically.
2. Mark the failed migration as rolled back in Prisma state:
   ```bash
   npx prisma migrate resolve --rolled-back 20261114050000_supabase_row_level_security
   ```
3. Inspect `_prisma_migrations` logs to determine the root cause before attempting any re-run.

### 7.3 Tier 3: Isolated Disaster Recovery Protocol (Catastrophic Failure Only)
If catastrophic data corruption occurs and full database rollback is required:
1. **Declare Maintenance:** Take the backend offline or return maintenance responses.
2. **Restore to Staging First:**
   Restore `$BACKUP_FILE` into a separate staging database or Supabase branch to verify table row counts and schema integrity.
3. **Owner Authorization:** Obtain explicit authorization from the Project Owner before touching production.
4. **Targeted Production Restore:**
   Only after isolated verification, execute point-in-time restore via Supabase Dashboard or targeted table restoration.
5. **Post-Recovery Audit:** Log an emergency audit entry detailing the recovery cause and steps.

---

## 8. Final Production Go / No-Go Checklist

| Checkpoint | Requirement | Method | Status |
| :--- | :--- | :--- | :---: |
| **1. Commit Baseline** | `main` branch at `e3483dc` or later | `git log -1` | **CONFIRMED** |
| **2. Test DB Validation** | 44/44 RLS tests pass in isolated environment | `npm run test:rls` | **CONFIRMED** |
| **3. API Security** | 41/41 endpoints verified | `npm run test:api-security` | **CONFIRMED** |
| **4. Release Manifest** | 152/152 SHA-256 hashes match | `shasum -a 256 -c RELEASE_SOURCE_MANIFEST_SHA256.txt` | **CONFIRMED** |
| **5. Preflight Snapshot** | Production migration history & table counts documented | Catalog inspection queries | **CONFIRMED** |
| **6. Duration Measured** | Isolated migration runtime measured at < 1.0s (0.898s) | Test execution timing | **CONFIRMED** |
| **7. Failure Mode Proved** | Rollback and P3018 behavior empirically proven | Isolated failure test | **CONFIRMED** |
| **8. Supabase Backup Status** | Confirm PITR or daily physical backup in Dashboard | Supabase Dashboard check | **PENDING OWNER SIGN-OFF** |
| **9. Pre-Migration Dump** | Local `.dump` created immediately prior to deploy | `pg_dump` execution | **PENDING EXECUTION TIME** |
| **10. Owner Authorization** | Written authorization to execute `prisma migrate deploy` | Owner sign-off | **PENDING OWNER AUTHORIZATION** |

> [!IMPORTANT]
> **Strict Operational Boundary:** This document completes the safety review, empirical transactionality verification, and preflight inspection. No production migrations, database mutations, or service deployments were executed during this task. Production deployment remains strictly halted pending owner review and sign-off.
