-- ==============================================================================
-- SAHACHARA AYURVEDA HIS - SUPABASE POSTGRESQL DATABASE SCHEMA
-- Center for Advanced Integrative Medicine & Panchakarma
-- Ready for Execution in Supabase SQL Editor
-- ==============================================================================

-- Enable UUID extension and Cryptographic helpers
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ------------------------------------------------------------------------------
-- 1. CUSTOM TYPES & ENUMS
-- ------------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE user_clinical_role AS ENUM (
    'Admin',
    'Doctor',
    'Nurse',
    'Pharmacist',
    'Billing',
    'Patient'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE admission_state AS ENUM (
    'outpatient',
    'inpatient',
    'er',
    'discharged'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- ------------------------------------------------------------------------------
-- 2. USER PROFILES TABLE (Linked with Supabase auth.users)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  role user_clinical_role NOT NULL DEFAULT 'Doctor',
  department TEXT DEFAULT 'Kayachikitsa (Internal Medicine)',
  phone TEXT DEFAULT '+91 98450 00000',
  license_number TEXT,
  digital_signing_authority BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ------------------------------------------------------------------------------
-- 3. PATIENTS EMR DOSSIERS
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.patients (
  id TEXT PRIMARY KEY DEFAULT ('pat-' || floor(extract(epoch from now()) * 1000)::text),
  mrn TEXT UNIQUE NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  dob DATE DEFAULT '1990-01-01',
  age INTEGER NOT NULL,
  gender TEXT NOT NULL,
  blood_group TEXT DEFAULT 'O+',
  phone TEXT NOT NULL DEFAULT '+91 98450 00000',
  email TEXT DEFAULT '',
  address TEXT DEFAULT 'Admissions Complex, Kochi, Kerala',
  emergency_contact JSONB DEFAULT '{"name":"Family Contact","relationship":"Kin","phone":"+91 98470 00001"}'::jsonb,
  allergies JSONB DEFAULT '[]'::jsonb,
  chronic_conditions JSONB DEFAULT '[]'::jsonb,
  current_medications JSONB DEFAULT '[]'::jsonb,
  past_diagnoses JSONB DEFAULT '[]'::jsonb,
  medical_history_notes TEXT DEFAULT '',
  admission_status admission_state DEFAULT 'outpatient',
  current_ward TEXT,
  current_bed TEXT,
  assigned_doctor_id TEXT,
  assigned_doctor_name TEXT,
  admission_date TIMESTAMPTZ DEFAULT NOW(),
  insurance JSONB DEFAULT '{"provider":"Star Health Ayush Cover","policyNumber":"SH-AY-8821","coveragePercentage":80,"verified":true}'::jsonb,
  dosha_profile JSONB DEFAULT '{"vata":40,"pitta":35,"kapha":25,"prakriti":"Vata-Pitta","vikriti":"Vata-Pitta Imbalance","agni":"Vishama (Irregular)","ama":"Madhyama (Moderate)","koshtha":"Madhyama","nadi":"Sarpa gati","jihva":"Mild coating"}'::jsonb,
  latest_vitals JSONB DEFAULT '{"bpSystolic":120,"bpDiastolic":80,"heartRate":72,"spo2":99,"temperature":36.8,"respRate":16}'::jsonb,
  clinical_notes TEXT DEFAULT '',
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_patients_mrn ON public.patients(mrn);
CREATE INDEX IF NOT EXISTS idx_patients_deleted_at ON public.patients(deleted_at);

-- ------------------------------------------------------------------------------
-- 4. APPOINTMENTS
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.appointments (
  id TEXT PRIMARY KEY DEFAULT ('apt-' || floor(extract(epoch from now()) * 1000)::text),
  patient_id TEXT REFERENCES public.patients(id) ON DELETE CASCADE,
  patient_name TEXT NOT NULL,
  patient_mrn TEXT NOT NULL,
  patient_phone TEXT NOT NULL,
  patient_email TEXT DEFAULT '',
  doctor_id TEXT,
  doctor_name TEXT NOT NULL,
  department TEXT DEFAULT 'Kayachikitsa (Internal Medicine)',
  date_time TIMESTAMPTZ NOT NULL,
  time_slot TEXT NOT NULL,
  type TEXT DEFAULT 'Ayurvedic Initial Consultation',
  status TEXT DEFAULT 'scheduled',
  notes TEXT DEFAULT '',
  reminder_sent BOOLEAN DEFAULT false,
  reminder_channel TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_appointments_patient_mrn ON public.appointments(patient_mrn);
CREATE INDEX IF NOT EXISTS idx_appointments_date_time ON public.appointments(date_time);

-- ------------------------------------------------------------------------------
-- 5. AYURVEDIC CLINICAL CONSULTATIONS
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.consultations (
  id TEXT PRIMARY KEY DEFAULT ('con-' || floor(extract(epoch from now()) * 1000)::text),
  consultation_number TEXT UNIQUE NOT NULL,
  patient_id TEXT,
  patient_name TEXT NOT NULL,
  patient_mrn TEXT NOT NULL,
  doctor_id TEXT,
  doctor_name TEXT NOT NULL,
  appointment_id TEXT,
  date_time TIMESTAMPTZ DEFAULT NOW(),
  chief_complaint TEXT NOT NULL,
  duration TEXT DEFAULT '40 minutes',
  present_illness TEXT DEFAULT '',
  vitals JSONB,
  ayurvedic_assessment JSONB NOT NULL,
  classical_diagnosis TEXT NOT NULL,
  western_correlation TEXT,
  treatment_recommendations TEXT NOT NULL,
  recommended_therapies JSONB DEFAULT '[]'::jsonb,
  prescriptions JSONB DEFAULT '[]'::jsonb,
  status TEXT DEFAULT 'completed',
  clinical_notes TEXT,
  completed_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_consultations_patient_mrn ON public.consultations(patient_mrn);

-- ------------------------------------------------------------------------------
-- 6. AYURVEDIC TREATMENT PLANS
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.treatment_plans (
  id TEXT PRIMARY KEY DEFAULT ('tp-' || floor(extract(epoch from now()) * 1000)::text),
  plan_number TEXT UNIQUE NOT NULL,
  patient_id TEXT,
  patient_name TEXT NOT NULL,
  patient_mrn TEXT NOT NULL,
  doctor_id TEXT,
  doctor_name TEXT NOT NULL,
  assigned_therapist TEXT NOT NULL,
  therapy_type TEXT NOT NULL,
  clinical_objective TEXT NOT NULL,
  oil_or_formulation TEXT NOT NULL,
  total_sessions INTEGER NOT NULL DEFAULT 7,
  completed_sessions INTEGER NOT NULL DEFAULT 0,
  frequency TEXT DEFAULT 'Daily',
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  end_date DATE NOT NULL,
  room_number TEXT DEFAULT 'Therapy Suite 01',
  status TEXT DEFAULT 'active',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_treatment_plans_mrn ON public.treatment_plans(patient_mrn);

-- ------------------------------------------------------------------------------
-- 7. PANCHAKARMA CLINICAL COURSES
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.panchakarma_courses (
  id TEXT PRIMARY KEY DEFAULT ('pk-' || floor(extract(epoch from now()) * 1000)::text),
  course_number TEXT UNIQUE NOT NULL,
  patient_id TEXT,
  patient_name TEXT NOT NULL,
  patient_mrn TEXT NOT NULL,
  vaidya_name TEXT NOT NULL,
  protocol TEXT NOT NULL,
  current_phase TEXT NOT NULL,
  start_date DATE NOT NULL,
  expected_end_date DATE NOT NULL,
  total_days INTEGER NOT NULL DEFAULT 14,
  completed_days INTEGER NOT NULL DEFAULT 0,
  dietary_prescription TEXT NOT NULL,
  status TEXT DEFAULT 'Active',
  daily_sessions JSONB DEFAULT '[]'::jsonb,
  discharge_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_panchakarma_mrn ON public.panchakarma_courses(patient_mrn);

-- ------------------------------------------------------------------------------
-- 8. PHARMACY PRESCRIPTIONS & DIGITAL SIGNATURES
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.prescriptions (
  id TEXT PRIMARY KEY DEFAULT ('rx-' || floor(extract(epoch from now()) * 1000)::text),
  rx_number TEXT UNIQUE NOT NULL,
  patient_id TEXT,
  patient_name TEXT NOT NULL,
  mrn TEXT NOT NULL,
  doctor_id TEXT,
  doctor_name TEXT NOT NULL,
  date_prescribed TIMESTAMPTZ DEFAULT NOW(),
  medication_name TEXT NOT NULL,
  dosage TEXT NOT NULL,
  frequency TEXT NOT NULL,
  route TEXT DEFAULT 'Oral',
  duration TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  pharmacy_notes TEXT,
  dispensed_at TIMESTAMPTZ,
  dispensed_by TEXT,
  digital_signature JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_prescriptions_mrn ON public.prescriptions(mrn);

-- ------------------------------------------------------------------------------
-- 9. PHARMACY MEDICATION STOCK & FORMULARY
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.medication_stock (
  id TEXT PRIMARY KEY DEFAULT ('med-' || floor(extract(epoch from now()) * 1000)::text),
  drug_name TEXT NOT NULL,
  generic_name TEXT NOT NULL,
  category TEXT NOT NULL,
  form TEXT NOT NULL,
  stock_quantity INTEGER NOT NULL DEFAULT 0,
  unit TEXT NOT NULL DEFAULT 'bottles',
  min_threshold INTEGER NOT NULL DEFAULT 20,
  batch_number TEXT NOT NULL,
  expiry_date DATE NOT NULL,
  unit_price NUMERIC(10, 2) NOT NULL DEFAULT 250.00,
  status TEXT DEFAULT 'in_stock',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ------------------------------------------------------------------------------
-- 10. DIAGNOSTIC LABORATORY ORDERS
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.lab_orders (
  id TEXT PRIMARY KEY DEFAULT ('lab-' || floor(extract(epoch from now()) * 1000)::text),
  order_number TEXT UNIQUE NOT NULL,
  patient_id TEXT,
  patient_name TEXT NOT NULL,
  mrn TEXT NOT NULL,
  test_type TEXT NOT NULL,
  priority TEXT DEFAULT 'Routine',
  ordering_doctor TEXT NOT NULL,
  ordered_at TIMESTAMPTZ DEFAULT NOW(),
  status TEXT DEFAULT 'ordered',
  result_value TEXT,
  normal_range TEXT,
  is_abnormal BOOLEAN DEFAULT false,
  lab_notes TEXT,
  digital_signature JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lab_orders_mrn ON public.lab_orders(mrn);

-- ------------------------------------------------------------------------------
-- 11. INPATIENT & OUTPATIENT INVOICES
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.invoices (
  id TEXT PRIMARY KEY DEFAULT ('inv-' || floor(extract(epoch from now()) * 1000)::text),
  invoice_number TEXT UNIQUE NOT NULL,
  patient_id TEXT,
  patient_name TEXT NOT NULL,
  mrn TEXT NOT NULL,
  admission_date TIMESTAMPTZ DEFAULT NOW(),
  discharge_date TIMESTAMPTZ,
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  subtotal NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  insurance_covered NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  copay_patient NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  total_amount NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  payment_status TEXT DEFAULT 'unpaid',
  insurance_claim_status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invoices_mrn ON public.invoices(mrn);

-- ------------------------------------------------------------------------------
-- 12. CLINICAL STAFF MEMBERS DIRECTORY
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.staff_members (
  id TEXT PRIMARY KEY DEFAULT ('stf-' || floor(extract(epoch from now()) * 1000)::text),
  employee_id TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  designation TEXT NOT NULL,
  department TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  phone TEXT NOT NULL,
  license_number TEXT NOT NULL,
  status TEXT DEFAULT 'on_duty',
  shift TEXT DEFAULT 'Morning (07:00-15:00)',
  qualification TEXT DEFAULT 'BAMS, MD',
  joining_date DATE DEFAULT CURRENT_DATE,
  digital_signing_authority BOOLEAN DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ------------------------------------------------------------------------------
-- 13. IMMUTABLE HIPAA AUDIT LOGS
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id TEXT PRIMARY KEY DEFAULT ('log-' || floor(extract(epoch from now()) * 1000)::text),
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  actor TEXT NOT NULL,
  role TEXT NOT NULL,
  category TEXT NOT NULL,
  action TEXT NOT NULL,
  patient_mrn TEXT,
  details TEXT NOT NULL,
  ip_address TEXT DEFAULT '192.168.1.42'
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON public.audit_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_patient_mrn ON public.audit_logs(patient_mrn);

-- ------------------------------------------------------------------------------
-- 14. ROW LEVEL SECURITY (RLS) POLICIES
-- ------------------------------------------------------------------------------
ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consultations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.treatment_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.panchakarma_courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prescriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medication_stock ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lab_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_members ENABLE ROW LEVEL SECURITY;

-- Allow authenticated clinical staff full read access to clinical records
CREATE POLICY "Clinical staff can view patient dossiers"
  ON public.patients FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Clinical staff can create and update patients"
  ON public.patients FOR ALL
  TO authenticated
  USING (true);

-- Allow authenticated staff access to consultations, treatments, prescriptions
CREATE POLICY "Staff clinical access on consultations"
  ON public.consultations FOR ALL
  TO authenticated
  USING (true);

CREATE POLICY "Staff clinical access on treatment plans"
  ON public.treatment_plans FOR ALL
  TO authenticated
  USING (true);

CREATE POLICY "Staff clinical access on panchakarma"
  ON public.panchakarma_courses FOR ALL
  TO authenticated
  USING (true);

CREATE POLICY "Staff clinical access on prescriptions"
  ON public.prescriptions FOR ALL
  TO authenticated
  USING (true);

CREATE POLICY "Staff clinical access on medication stock"
  ON public.medication_stock FOR ALL
  TO authenticated
  USING (true);

CREATE POLICY "Staff clinical access on lab orders"
  ON public.lab_orders FOR ALL
  TO authenticated
  USING (true);

CREATE POLICY "Staff clinical access on invoices"
  ON public.invoices FOR ALL
  TO authenticated
  USING (true);

CREATE POLICY "Staff clinical access on staff members"
  ON public.staff_members FOR ALL
  TO authenticated
  USING (true);

CREATE POLICY "Audit logs insert by authenticated users"
  ON public.audit_logs FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Audit logs select by authenticated users"
  ON public.audit_logs FOR SELECT
  TO authenticated
  USING (true);
