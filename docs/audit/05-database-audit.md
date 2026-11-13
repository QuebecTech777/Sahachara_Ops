# Sahachara OS 2.0 — Comprehensive Engineering Audit & Discovery Report
## Document 05: Database Architecture, Schema Divergence & Data Integrity Audit

---

### 1. Database Technologies & Storage Overview

The repository contains two separate and conflicting database schema specifications:
1. `prisma/schema.prisma`: A 304-line Prisma ORM schema specifying 13 models targeting a generic PostgreSQL provider via `DATABASE_URL`.
2. `supabase/schema.sql`: A 410-line raw PostgreSQL DDL script designed to be pasted into the Supabase SQL Editor, declaring 13 tables, custom ENUMs, triggers, indexes, and Row Level Security (RLS) policies.

> [!WARNING]
> **No Database Migrations Exist**: The repository has no `prisma/migrations/` directory. No schema migration history exists. The Prisma client has never generated a versioned migration. If `npx prisma migrate dev` were executed, Prisma would attempt to drop or alter existing Supabase tables due to naming collisions and structural divergences.

---

### 2. Model-by-Model Schema Comparison & Divergence Analysis

| Model / Table | Prisma Schema (`prisma/schema.prisma`) | Supabase SQL Schema (`supabase/schema.sql`) | Structural Divergence & Breaking Incompatibility |
| :--- | :--- | :--- | :--- |
| **Users / Profiles** | Model `User`, mapped to `@@map("users")`. Primary key UUID. Fields: `passwordHash`, `activationPin`, `pinExpiresAt`, `status`. | Table `public.profiles`. Primary key references `auth.users(id)`. Fields: `digital_signing_authority`, `phone`. | **CRITICAL BREAKING MISMATCH**: Table names differ (`users` vs `profiles`). Prisma cannot query `profiles`. Supabase lacks `activation_pin` and `password_hash`. |
| **Patients** | Model `Patient`, mapped to `patients`. `dob: String`. `admissionStatus: String`. `doshaProfile: Json?`. | Table `public.patients`. `dob: DATE`. `admission_status: admission_state (ENUM)`. `dosha_profile: JSONB`. | **CRITICAL RUNTIME ERROR**: In `server/supabaseServer.ts` (L76–83), code attempts to insert `dosha_vata`, `dosha_pitta`, `dosha_kapha`, `prakriti`, `vikriti`, `agni_status`, `ama_status`. None of these columns exist in Supabase! Postgres rejects write. |
| **Appointments** | Model `Appointment`, mapped to `appointments`. `patientId: String?`. | Table `public.appointments`. `patient_id REFERENCES patients(id) ON DELETE CASCADE`. | **RLS DEFICIT**: Supabase `schema.sql` (L339–348) enables RLS on 10 tables, but **omits `appointments`**. Appointments table has zero RLS protection. |
| **Consultations** | Model `Consultation`, mapped to `consultations`. `vitals: Json?`. | Table `public.consultations`. `vitals: JSONB`. `date_time: TIMESTAMPTZ`. | **PERSISTENCE DEFICIT**: Code in `prismaService.ts` does not implement Prisma writes for consultations; lives purely in Node.js memory. |
| **Treatment Plans** | Model `TreatmentPlan`, mapped to `treatment_plans`. Total sessions `Int @default(7)`. | Table `public.treatment_plans`. `start_date: DATE`. `total_sessions: INTEGER`. | **PERSISTENCE DEFICIT**: No Prisma persistence service implemented. |
| **Panchakarma** | Model `PanchakarmaCourse`, mapped to `panchakarma_courses`. `dailySessions: Json?`. | Table `public.panchakarma_courses`. `daily_sessions: JSONB`. | **PERSISTENCE DEFICIT**: No Prisma persistence service implemented. |
| **Prescriptions** | Model `Prescription`, mapped to `prescriptions`. `digitalSignature: Json?`. | Table `public.prescriptions`. `digital_signature: JSONB`. | **PERSISTENCE DEFICIT**: No Prisma persistence service implemented. |
| **Pharmacy Stock** | Model `MedicationStock`, mapped to `medication_stock`. `unitPrice: Float`. | Table `public.medication_stock`. `unit_price: NUMERIC(10, 2)`. | **PERSISTENCE DEFICIT**: In-memory only. Stock updates do not touch Postgres. |
| **Stock Movements** | Model `StockMovement`, mapped to `stock_movements`. `quantityDelta: Int`. | **MISSING FROM SUPABASE SCHEMA**: `supabase/schema.sql` does not define `stock_movements`. | **SCHEMA DEFICIT**: Table exists in Prisma, missing in Supabase. RLS not enabled. |
| **Lab Orders** | Model `LabOrder`, mapped to `lab_orders`. `digitalSignature: Json?`. | Table `public.lab_orders`. `digital_signature: JSONB`. | **PERSISTENCE DEFICIT**: In-memory only. |
| **Invoices** | Model `Invoice`, mapped to `invoices`. `items: Json`. | Table `public.invoices`. `items: JSONB DEFAULT '[]'::jsonb`. | **PERSISTENCE DEFICIT**: In-memory only. |
| **Staff Members** | Model `StaffMember`, mapped to `staff_members`. Contains `activationPin`, `pinExpiresAt`. | Table `public.staff_members`. Lacks `activation_pin`, `pin_expires_at`, `updated_at`. | **CRITICAL BREAKING MISMATCH**: Backend PIN activation queries fail if targeted at Supabase `staff_members`. |
| **Audit Logs** | Model `AuditLog`, mapped to `audit_logs`. `ipAddress: String? @default("192.168.1.42")`. | Table `public.audit_logs`. `ip_address: TEXT DEFAULT '192.168.1.42'`. | **SYNCHRONIZED**: Supabase insert implemented in `supabaseServer.ts` (L142–166). |

---

### 3. Referential Integrity & Foreign Key Analysis

#### 3.1 Zero Prisma Relations (`@relation`)
In `prisma/schema.prisma`, **not a single model contains a Prisma `@relation` attribute**:
- `Appointment.patientId` is an unindexed `String?`.
- `Consultation.patientId` is an unindexed `String?`.
- `Prescription.patientId` is an unindexed `String?`.
- `Invoice.patientId` is an unindexed `String?`.

Because no foreign key constraints are declared, the Prisma client generates no relation joins (`include: { patient: true }` cannot be used), and database-level referential integrity is completely absent. A patient can be deleted while leaving orphaned appointments, prescriptions, and unpaid invoices with dangling IDs.

#### 3.2 Supabase Foreign Key Gaps
In `supabase/schema.sql`, foreign key constraints are partially applied:
- `public.profiles.id REFERENCES auth.users(id) ON DELETE CASCADE` (Enforced).
- `public.appointments.patient_id REFERENCES public.patients(id) ON DELETE CASCADE` (Enforced).
- However, `consultations.patient_id`, `treatment_plans.patient_id`, `panchakarma_courses.patient_id`, `prescriptions.patient_id`, `lab_orders.patient_id`, and `invoices.patient_id` have **NO FOREIGN KEY CONSTRAINTS**. They are declared as raw `TEXT` fields without references.

---

### 4. Row Level Security (RLS) Policy Audit

The Supabase schema declares Row Level Security across lines 339–410. An audit of these policies reveals severe security loopholes:

1. **Universal Permissiveness (`USING (true)`)**:
   ```sql
   CREATE POLICY "Clinical staff can view patient dossiers"
     ON public.patients FOR SELECT TO authenticated USING (true);

   CREATE POLICY "Clinical staff can create and update patients"
     ON public.patients FOR ALL TO authenticated USING (true);
   ```
   Every policy for patients, consultations, treatments, prescriptions, stock, labs, and invoices checks only that the client has an authenticated role (`TO authenticated`). **There are zero role checks in the RLS policies**. A logged-in Patient has the same Postgres-level query rights as a Hospital Administrator.
2. **Unprotected Tables**:
   The following tables have **RLS completely omitted**:
   - `public.appointments` (Any anon or authenticated client can read/write directly via PostgREST).
   - `public.stock_movements` (Not created in Supabase schema).
   - `public.profiles` (RLS not enabled in `schema.sql`; sensitive staff licensing and roles exposed).

---

### 5. Indexing & Query Performance Analysis

#### 5.1 Existing Indexes in Supabase
- `idx_patients_mrn` on `patients(mrn)`
- `idx_patients_deleted_at` on `patients(deleted_at)`
- `idx_appointments_patient_mrn` on `appointments(patient_mrn)`
- `idx_appointments_date_time` on `appointments(date_time)`
- `idx_consultations_patient_mrn` on `consultations(patient_mrn)`
- `idx_treatment_plans_mrn` on `treatment_plans(patient_mrn)`
- `idx_panchakarma_mrn` on `panchakarma_courses(patient_mrn)`
- `idx_prescriptions_mrn` on `prescriptions(mrn)`
- `idx_lab_orders_mrn` on `lab_orders(mrn)`
- `idx_invoices_mrn` on `invoices(mrn)`
- `idx_audit_logs_timestamp` on `audit_logs(timestamp DESC)`
- `idx_audit_logs_patient_mrn` on `audit_logs(patient_mrn)`

#### 5.2 Missing Indexes
- **Foreign Keys**: `patient_id` and `doctor_id` are unindexed across all clinical child tables. Joins on UUID/text identifiers will trigger sequential table scans.
- **Status Fields**: Unindexed `status` on `appointments`, `prescriptions`, `treatment_plans`, `panchakarma_courses`, and `payment_status` on `invoices`. Queries filtering for "pending prescriptions" or "unpaid invoices" must scan entire tables.
- **Search Columns**: Full-text or B-tree trigram indexes (`pg_trgm`) are missing on patient names (`first_name`, `last_name`), phone numbers, and drug names.

