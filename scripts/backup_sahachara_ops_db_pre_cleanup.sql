--
-- PostgreSQL database dump
--

\restrict c2UQzUE3ymQGOiXcwISLfPEwNkvMl62Y8hFlZa2Pe0sdBP2gEvkBs55zRTIx8J4

-- Dumped from database version 16.13 (Homebrew)
-- Dumped by pg_dump version 16.13 (Homebrew)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: _prisma_migrations; Type: TABLE; Schema: public; Owner: highflyer
--

CREATE TABLE public._prisma_migrations (
    id character varying(36) NOT NULL,
    checksum character varying(64) NOT NULL,
    finished_at timestamp with time zone,
    migration_name character varying(255) NOT NULL,
    logs text,
    rolled_back_at timestamp with time zone,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    applied_steps_count integer DEFAULT 0 NOT NULL
);


ALTER TABLE public._prisma_migrations OWNER TO highflyer;

--
-- Name: appointments; Type: TABLE; Schema: public; Owner: highflyer
--

CREATE TABLE public.appointments (
    id text NOT NULL,
    "patientId" text,
    "patientName" text NOT NULL,
    "patientMrn" text NOT NULL,
    "patientPhone" text DEFAULT '+91 98450 00000'::text NOT NULL,
    "patientEmail" text DEFAULT ''::text NOT NULL,
    "doctorId" text,
    "doctorName" text NOT NULL,
    department text DEFAULT 'Kayachikitsa (Internal Medicine)'::text NOT NULL,
    "dateTime" timestamp(3) without time zone NOT NULL,
    "timeSlot" text NOT NULL,
    type text DEFAULT 'Ayurvedic Initial Consultation'::text NOT NULL,
    status text DEFAULT 'scheduled'::text NOT NULL,
    notes text DEFAULT ''::text,
    "reminderSent" boolean DEFAULT false NOT NULL,
    "reminderChannel" text,
    "reminderSentAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public.appointments OWNER TO highflyer;

--
-- Name: audit_logs; Type: TABLE; Schema: public; Owner: highflyer
--

CREATE TABLE public.audit_logs (
    id text NOT NULL,
    "timestamp" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    actor text NOT NULL,
    role text NOT NULL,
    category text NOT NULL,
    action text NOT NULL,
    "patientMrn" text,
    details text NOT NULL,
    "ipAddress" text DEFAULT '192.168.1.42'::text
);


ALTER TABLE public.audit_logs OWNER TO highflyer;

--
-- Name: consultations; Type: TABLE; Schema: public; Owner: highflyer
--

CREATE TABLE public.consultations (
    id text NOT NULL,
    "consultationNumber" text NOT NULL,
    "patientId" text,
    "patientName" text NOT NULL,
    "patientMrn" text NOT NULL,
    "doctorId" text,
    "doctorName" text NOT NULL,
    "appointmentId" text,
    "dateTime" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "chiefComplaint" text NOT NULL,
    duration text DEFAULT '40 minutes'::text NOT NULL,
    "presentIllness" text DEFAULT ''::text,
    vitals jsonb,
    "ayurvedicAssessment" jsonb NOT NULL,
    "classicalDiagnosis" text NOT NULL,
    "westernCorrelation" text,
    "treatmentRecommendations" text NOT NULL,
    "recommendedTherapies" jsonb,
    prescriptions jsonb,
    status text DEFAULT 'completed'::text NOT NULL,
    "clinicalNotes" text,
    "completedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public.consultations OWNER TO highflyer;

--
-- Name: hospital_tariffs; Type: TABLE; Schema: public; Owner: highflyer
--

CREATE TABLE public.hospital_tariffs (
    id text NOT NULL,
    category text NOT NULL,
    "serviceCode" text NOT NULL,
    "serviceName" text NOT NULL,
    rate double precision,
    "isZeroPricePermitted" boolean DEFAULT false NOT NULL,
    unit text DEFAULT 'day'::text NOT NULL,
    description text,
    "updatedBy" text DEFAULT 'Hospital Administration'::text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public.hospital_tariffs OWNER TO highflyer;

--
-- Name: invoices; Type: TABLE; Schema: public; Owner: highflyer
--

CREATE TABLE public.invoices (
    id text NOT NULL,
    "invoiceNumber" text NOT NULL,
    "patientId" text,
    "patientName" text NOT NULL,
    mrn text NOT NULL,
    "admissionDate" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "dischargeDate" timestamp(3) without time zone,
    items jsonb NOT NULL,
    subtotal double precision DEFAULT 0 NOT NULL,
    "insuranceCovered" double precision DEFAULT 0 NOT NULL,
    "copayPatient" double precision DEFAULT 0 NOT NULL,
    "totalAmount" double precision DEFAULT 0 NOT NULL,
    "paymentStatus" text DEFAULT 'unpaid'::text NOT NULL,
    "insuranceClaimStatus" text DEFAULT 'pending'::text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public.invoices OWNER TO highflyer;

--
-- Name: lab_orders; Type: TABLE; Schema: public; Owner: highflyer
--

CREATE TABLE public.lab_orders (
    id text NOT NULL,
    "orderNumber" text NOT NULL,
    "patientId" text,
    "patientName" text NOT NULL,
    mrn text NOT NULL,
    "testType" text NOT NULL,
    priority text DEFAULT 'Routine'::text NOT NULL,
    "orderingDoctor" text NOT NULL,
    "orderedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    status text DEFAULT 'ordered'::text NOT NULL,
    "resultValue" text,
    "normalRange" text,
    "isAbnormal" boolean DEFAULT false NOT NULL,
    "labNotes" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public.lab_orders OWNER TO highflyer;

--
-- Name: medication_stock; Type: TABLE; Schema: public; Owner: highflyer
--

CREATE TABLE public.medication_stock (
    id text NOT NULL,
    "drugName" text NOT NULL,
    "genericName" text NOT NULL,
    category text NOT NULL,
    form text NOT NULL,
    "stockQuantity" integer DEFAULT 0 NOT NULL,
    unit text DEFAULT 'bottles'::text NOT NULL,
    "minThreshold" integer DEFAULT 20 NOT NULL,
    "batchNumber" text NOT NULL,
    "expiryDate" text NOT NULL,
    "unitPrice" double precision DEFAULT 250.0 NOT NULL,
    status text DEFAULT 'in_stock'::text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public.medication_stock OWNER TO highflyer;

--
-- Name: panchakarma_courses; Type: TABLE; Schema: public; Owner: highflyer
--

CREATE TABLE public.panchakarma_courses (
    id text NOT NULL,
    "courseNumber" text NOT NULL,
    "patientId" text,
    "patientName" text NOT NULL,
    "patientMrn" text NOT NULL,
    "vaidyaName" text NOT NULL,
    protocol text NOT NULL,
    "currentPhase" text NOT NULL,
    "startDate" text NOT NULL,
    "expectedEndDate" text NOT NULL,
    "totalDays" integer DEFAULT 14 NOT NULL,
    "completedDays" integer DEFAULT 0 NOT NULL,
    "dietaryPrescription" text NOT NULL,
    status text DEFAULT 'Active'::text NOT NULL,
    "dailySessions" jsonb,
    "dischargeNotes" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public.panchakarma_courses OWNER TO highflyer;

--
-- Name: patients; Type: TABLE; Schema: public; Owner: highflyer
--

CREATE TABLE public.patients (
    id text NOT NULL,
    mrn text NOT NULL,
    "firstName" text NOT NULL,
    "lastName" text NOT NULL,
    dob text DEFAULT '1990-01-01'::text NOT NULL,
    age integer NOT NULL,
    gender text NOT NULL,
    "bloodGroup" text DEFAULT 'O+'::text NOT NULL,
    phone text DEFAULT '+91 98450 00000'::text NOT NULL,
    email text,
    address text DEFAULT 'Mannamkala Road, Munnar Hills, Adimali, Kerala 685561'::text NOT NULL,
    "emergencyContact" jsonb,
    allergies jsonb,
    "chronicConditions" jsonb,
    "currentMedications" jsonb,
    "pastDiagnoses" jsonb,
    "medicalHistoryNotes" text DEFAULT ''::text,
    "admissionStatus" text DEFAULT 'outpatient'::text NOT NULL,
    "currentWard" text,
    "currentBed" text,
    "assignedDoctorId" text,
    "assignedDoctorName" text,
    "admissionDate" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    insurance jsonb,
    "doshaProfile" jsonb,
    "latestVitals" jsonb,
    "clinicalNotes" text DEFAULT ''::text,
    "deletedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public.patients OWNER TO highflyer;

--
-- Name: prescriptions; Type: TABLE; Schema: public; Owner: highflyer
--

CREATE TABLE public.prescriptions (
    id text NOT NULL,
    "rxNumber" text NOT NULL,
    "patientId" text,
    "patientName" text NOT NULL,
    mrn text NOT NULL,
    "doctorId" text,
    "doctorName" text NOT NULL,
    "datePrescribed" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "medicationName" text NOT NULL,
    dosage text NOT NULL,
    frequency text NOT NULL,
    route text DEFAULT 'Oral'::text NOT NULL,
    duration text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    "pharmacyNotes" text,
    "dispensedAt" timestamp(3) without time zone,
    "dispensedBy" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public.prescriptions OWNER TO highflyer;

--
-- Name: staff_members; Type: TABLE; Schema: public; Owner: highflyer
--

CREATE TABLE public.staff_members (
    id text NOT NULL,
    "employeeId" text NOT NULL,
    name text NOT NULL,
    role text NOT NULL,
    designation text NOT NULL,
    department text NOT NULL,
    email text NOT NULL,
    phone text NOT NULL,
    "licenseNumber" text NOT NULL,
    status text DEFAULT 'on_duty'::text NOT NULL,
    shift text DEFAULT 'Morning (07:00-15:00)'::text NOT NULL,
    qualification text DEFAULT 'BAMS, MD'::text NOT NULL,
    "joiningDate" text NOT NULL,
    "activationPin" text,
    "pinExpiresAt" timestamp(3) without time zone,
    notes text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public.staff_members OWNER TO highflyer;

--
-- Name: stock_movements; Type: TABLE; Schema: public; Owner: highflyer
--

CREATE TABLE public.stock_movements (
    id text NOT NULL,
    "timestamp" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "medicineId" text,
    "medicineName" text NOT NULL,
    "batchNumber" text NOT NULL,
    type text NOT NULL,
    "quantityDelta" integer NOT NULL,
    "remainingQuantity" integer NOT NULL,
    actor text NOT NULL,
    "referenceNumber" text,
    notes text
);


ALTER TABLE public.stock_movements OWNER TO highflyer;

--
-- Name: treatment_plans; Type: TABLE; Schema: public; Owner: highflyer
--

CREATE TABLE public.treatment_plans (
    id text NOT NULL,
    "planNumber" text NOT NULL,
    "patientId" text,
    "patientName" text NOT NULL,
    "patientMrn" text NOT NULL,
    "doctorId" text,
    "doctorName" text NOT NULL,
    "assignedTherapist" text NOT NULL,
    "therapyType" text NOT NULL,
    "clinicalObjective" text NOT NULL,
    "oilOrFormulation" text NOT NULL,
    "totalSessions" integer DEFAULT 7 NOT NULL,
    "completedSessions" integer DEFAULT 0 NOT NULL,
    frequency text DEFAULT 'Daily'::text NOT NULL,
    "startDate" text NOT NULL,
    "endDate" text NOT NULL,
    "roomNumber" text DEFAULT 'Therapy Suite 01'::text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    notes text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public.treatment_plans OWNER TO highflyer;

--
-- Name: users; Type: TABLE; Schema: public; Owner: highflyer
--

CREATE TABLE public.users (
    id text NOT NULL,
    email text NOT NULL,
    "passwordHash" text,
    name text NOT NULL,
    role text DEFAULT 'Doctor'::text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    "activationPin" text,
    "pinExpiresAt" timestamp(3) without time zone,
    department text DEFAULT 'Kayachikitsa (Internal Medicine)'::text NOT NULL,
    "licenseNumber" text,
    mrn text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public.users OWNER TO highflyer;

--
-- Data for Name: _prisma_migrations; Type: TABLE DATA; Schema: public; Owner: highflyer
--

COPY public._prisma_migrations (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count) FROM stdin;
5a661c8e-ce15-49b0-a1eb-f7869ff2c8b9	b7e47f017e698489cb6041ab87515a78c70479e995cb9bc8563a60daa2505183	2026-11-12 18:02:34.180869+05:30	0_init		\N	2026-11-12 18:02:34.180869+05:30	0
251cccc8-ec0d-4c58-aa02-710d109d3b45	c1116a2eb3daf4189c0324a3997fb51e3a9c266408cdb3778e7cb3d0ca93abb9	2026-11-12 18:02:51.337824+05:30	20261112123251_add_hospital_tariffs	\N	\N	2026-11-12 18:02:51.335555+05:30	1
111bf24f-a827-4e5f-897b-4d99b817d69b	aa1b682afb61bd968404cf19cfbf6da3ece1c33d17dc6e2e1679a9047c73ffa3	2026-11-12 18:26:19.560923+05:30	20261112133000_remove_digital_signatures	\N	\N	2026-11-12 18:26:19.55676+05:30	1
\.


--
-- Data for Name: appointments; Type: TABLE DATA; Schema: public; Owner: highflyer
--

COPY public.appointments (id, "patientId", "patientName", "patientMrn", "patientPhone", "patientEmail", "doctorId", "doctorName", department, "dateTime", "timeSlot", type, status, notes, "reminderSent", "reminderChannel", "reminderSentAt", "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: audit_logs; Type: TABLE DATA; Schema: public; Owner: highflyer
--

COPY public.audit_logs (id, "timestamp", actor, role, category, action, "patientMrn", details, "ipAddress") FROM stdin;
\.


--
-- Data for Name: consultations; Type: TABLE DATA; Schema: public; Owner: highflyer
--

COPY public.consultations (id, "consultationNumber", "patientId", "patientName", "patientMrn", "doctorId", "doctorName", "appointmentId", "dateTime", "chiefComplaint", duration, "presentIllness", vitals, "ayurvedicAssessment", "classicalDiagnosis", "westernCorrelation", "treatmentRecommendations", "recommendedTherapies", prescriptions, status, "clinicalNotes", "completedAt", "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: hospital_tariffs; Type: TABLE DATA; Schema: public; Owner: highflyer
--

COPY public.hospital_tariffs (id, category, "serviceCode", "serviceName", rate, "isZeroPricePermitted", unit, description, "updatedBy", "createdAt", "updatedAt") FROM stdin;
trf-bed-semi	Bed/Room	BED-SEMI	Semi-Private Room	\N	f	day	Twin-sharing room with attached bath. Rate unconfigured.	System Initializer	2026-11-12 12:48:10.292	2026-11-12 12:48:10.292
trf-bed-icu	Bed/Room	BED-ICU	Intensive Care Unit (ICU)	\N	f	day	ICU Critical Care Bed with telemetry. Rate unconfigured.	System Initializer	2026-11-12 12:48:10.293	2026-11-12 12:48:10.293
trf-bed-dlx	Bed/Room	BED-DLX	Deluxe Ayurvedic Cottage Suite	\N	f	day	Private cottage suite for inpatient Panchakarma patients. Rate unconfigured.	System Initializer	2026-11-12 12:48:10.294	2026-11-12 12:48:10.294
trf-con-ayu-init	Consultation	CON-AYU-INIT	Ayurvedic Initial Consultation (Prakriti / Agni / Nadi)	500	f	consultation	Comprehensive clinical assessment by licensed Vaidya.	Hospital Administration	2026-11-12 12:48:10.295	2026-11-12 12:48:10.295
trf-con-doc-gen	Consultation	CON-DOC-GEN	General Physician / Emergency Specialist Consultation	600	f	consultation	Attending physician evaluation and clinical triage.	Hospital Administration	2026-11-12 12:48:10.295	2026-11-12 12:48:10.295
trf-trt-abh	Treatment	TRT-ABH-60	Abhyanga Herbal Body Massage (60 mins)	1500	f	session	Full-body classical synchronized Abhyanga with medicated herbal oils.	Hospital Administration	2026-11-12 12:48:10.297	2026-11-12 12:48:10.297
trf-trt-shiro	Treatment	TRT-SHIRO-45	Shirodhara Medicated Oil Therapy (45 mins)	2200	f	session	Continuous medicated herbal oil pouring over forehead.	Hospital Administration	2026-11-12 12:48:10.297	2026-11-12 12:48:10.297
trf-lab-cbc	Laboratory	LAB-CBC	Complete Blood Count (CBC)	350	f	test	Automated 5-part hematology analyzer panel.	Hospital Administration	2026-11-12 12:48:10.298	2026-11-12 12:48:10.298
trf-triage-eval	Procedure	PROC-TRIAGE	Emergency Triage & Vital Signs Evaluation	\N	f	evaluation	Initial intake and triage assessment. Tariff unconfigured by Hospital Administration.	Pre-Test Sanitizer	2026-11-12 12:48:10.299	2026-11-12 13:17:54.403
trf-bed-gen	Bed/Room	BED-GEN	General Ward Accommodation	\N	f	day	General Inpatient Ward Bed. Tariff to be configured by Hospital Administration.	Marcus Sterling	2026-11-12 12:48:10.289	2026-11-12 13:17:54.426
\.


--
-- Data for Name: invoices; Type: TABLE DATA; Schema: public; Owner: highflyer
--

COPY public.invoices (id, "invoiceNumber", "patientId", "patientName", mrn, "admissionDate", "dischargeDate", items, subtotal, "insuranceCovered", "copayPatient", "totalAmount", "paymentStatus", "insuranceClaimStatus", "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: lab_orders; Type: TABLE DATA; Schema: public; Owner: highflyer
--

COPY public.lab_orders (id, "orderNumber", "patientId", "patientName", mrn, "testType", priority, "orderingDoctor", "orderedAt", status, "resultValue", "normalRange", "isAbnormal", "labNotes", "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: medication_stock; Type: TABLE DATA; Schema: public; Owner: highflyer
--

COPY public.medication_stock (id, "drugName", "genericName", category, form, "stockQuantity", unit, "minThreshold", "batchNumber", "expiryDate", "unitPrice", status, "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: panchakarma_courses; Type: TABLE DATA; Schema: public; Owner: highflyer
--

COPY public.panchakarma_courses (id, "courseNumber", "patientId", "patientName", "patientMrn", "vaidyaName", protocol, "currentPhase", "startDate", "expectedEndDate", "totalDays", "completedDays", "dietaryPrescription", status, "dailySessions", "dischargeNotes", "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: patients; Type: TABLE DATA; Schema: public; Owner: highflyer
--

COPY public.patients (id, mrn, "firstName", "lastName", dob, age, gender, "bloodGroup", phone, email, address, "emergencyContact", allergies, "chronicConditions", "currentMedications", "pastDiagnoses", "medicalHistoryNotes", "admissionStatus", "currentWard", "currentBed", "assignedDoctorId", "assignedDoctorName", "admissionDate", insurance, "doshaProfile", "latestVitals", "clinicalNotes", "deletedAt", "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: prescriptions; Type: TABLE DATA; Schema: public; Owner: highflyer
--

COPY public.prescriptions (id, "rxNumber", "patientId", "patientName", mrn, "doctorId", "doctorName", "datePrescribed", "medicationName", dosage, frequency, route, duration, status, "pharmacyNotes", "dispensedAt", "dispensedBy", "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: staff_members; Type: TABLE DATA; Schema: public; Owner: highflyer
--

COPY public.staff_members (id, "employeeId", name, role, designation, department, email, phone, "licenseNumber", status, shift, qualification, "joiningDate", "activationPin", "pinExpiresAt", notes, "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: stock_movements; Type: TABLE DATA; Schema: public; Owner: highflyer
--

COPY public.stock_movements (id, "timestamp", "medicineId", "medicineName", "batchNumber", type, "quantityDelta", "remainingQuantity", actor, "referenceNumber", notes) FROM stdin;
\.


--
-- Data for Name: treatment_plans; Type: TABLE DATA; Schema: public; Owner: highflyer
--

COPY public.treatment_plans (id, "planNumber", "patientId", "patientName", "patientMrn", "doctorId", "doctorName", "assignedTherapist", "therapyType", "clinicalObjective", "oilOrFormulation", "totalSessions", "completedSessions", frequency, "startDate", "endDate", "roomNumber", status, notes, "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: highflyer
--

COPY public.users (id, email, "passwordHash", name, role, status, "activationPin", "pinExpiresAt", department, "licenseNumber", mrn, "createdAt", "updatedAt") FROM stdin;
usr-superadmin	alexander.wright@sahachara.com	$2b$12$OZcT12cGl5d6fdVUBv4BUO4zcrfHGCH1xzVZ.5rSVKbdyjxgDqfVC	Alexander Wright	SUPER_ADMIN	active	\N	\N	Executive Governance & Technology	\N	\N	2026-11-12 11:58:46.672	2026-11-12 13:22:52.972
\.


--
-- Name: _prisma_migrations _prisma_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: highflyer
--

ALTER TABLE ONLY public._prisma_migrations
    ADD CONSTRAINT _prisma_migrations_pkey PRIMARY KEY (id);


--
-- Name: appointments appointments_pkey; Type: CONSTRAINT; Schema: public; Owner: highflyer
--

ALTER TABLE ONLY public.appointments
    ADD CONSTRAINT appointments_pkey PRIMARY KEY (id);


--
-- Name: audit_logs audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: highflyer
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);


--
-- Name: consultations consultations_pkey; Type: CONSTRAINT; Schema: public; Owner: highflyer
--

ALTER TABLE ONLY public.consultations
    ADD CONSTRAINT consultations_pkey PRIMARY KEY (id);


--
-- Name: hospital_tariffs hospital_tariffs_pkey; Type: CONSTRAINT; Schema: public; Owner: highflyer
--

ALTER TABLE ONLY public.hospital_tariffs
    ADD CONSTRAINT hospital_tariffs_pkey PRIMARY KEY (id);


--
-- Name: invoices invoices_pkey; Type: CONSTRAINT; Schema: public; Owner: highflyer
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_pkey PRIMARY KEY (id);


--
-- Name: lab_orders lab_orders_pkey; Type: CONSTRAINT; Schema: public; Owner: highflyer
--

ALTER TABLE ONLY public.lab_orders
    ADD CONSTRAINT lab_orders_pkey PRIMARY KEY (id);


--
-- Name: medication_stock medication_stock_pkey; Type: CONSTRAINT; Schema: public; Owner: highflyer
--

ALTER TABLE ONLY public.medication_stock
    ADD CONSTRAINT medication_stock_pkey PRIMARY KEY (id);


--
-- Name: panchakarma_courses panchakarma_courses_pkey; Type: CONSTRAINT; Schema: public; Owner: highflyer
--

ALTER TABLE ONLY public.panchakarma_courses
    ADD CONSTRAINT panchakarma_courses_pkey PRIMARY KEY (id);


--
-- Name: patients patients_pkey; Type: CONSTRAINT; Schema: public; Owner: highflyer
--

ALTER TABLE ONLY public.patients
    ADD CONSTRAINT patients_pkey PRIMARY KEY (id);


--
-- Name: prescriptions prescriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: highflyer
--

ALTER TABLE ONLY public.prescriptions
    ADD CONSTRAINT prescriptions_pkey PRIMARY KEY (id);


--
-- Name: staff_members staff_members_pkey; Type: CONSTRAINT; Schema: public; Owner: highflyer
--

ALTER TABLE ONLY public.staff_members
    ADD CONSTRAINT staff_members_pkey PRIMARY KEY (id);


--
-- Name: stock_movements stock_movements_pkey; Type: CONSTRAINT; Schema: public; Owner: highflyer
--

ALTER TABLE ONLY public.stock_movements
    ADD CONSTRAINT stock_movements_pkey PRIMARY KEY (id);


--
-- Name: treatment_plans treatment_plans_pkey; Type: CONSTRAINT; Schema: public; Owner: highflyer
--

ALTER TABLE ONLY public.treatment_plans
    ADD CONSTRAINT treatment_plans_pkey PRIMARY KEY (id);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: highflyer
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: consultations_consultationNumber_key; Type: INDEX; Schema: public; Owner: highflyer
--

CREATE UNIQUE INDEX "consultations_consultationNumber_key" ON public.consultations USING btree ("consultationNumber");


--
-- Name: hospital_tariffs_serviceCode_key; Type: INDEX; Schema: public; Owner: highflyer
--

CREATE UNIQUE INDEX "hospital_tariffs_serviceCode_key" ON public.hospital_tariffs USING btree ("serviceCode");


--
-- Name: invoices_invoiceNumber_key; Type: INDEX; Schema: public; Owner: highflyer
--

CREATE UNIQUE INDEX "invoices_invoiceNumber_key" ON public.invoices USING btree ("invoiceNumber");


--
-- Name: lab_orders_orderNumber_key; Type: INDEX; Schema: public; Owner: highflyer
--

CREATE UNIQUE INDEX "lab_orders_orderNumber_key" ON public.lab_orders USING btree ("orderNumber");


--
-- Name: panchakarma_courses_courseNumber_key; Type: INDEX; Schema: public; Owner: highflyer
--

CREATE UNIQUE INDEX "panchakarma_courses_courseNumber_key" ON public.panchakarma_courses USING btree ("courseNumber");


--
-- Name: patients_mrn_key; Type: INDEX; Schema: public; Owner: highflyer
--

CREATE UNIQUE INDEX patients_mrn_key ON public.patients USING btree (mrn);


--
-- Name: prescriptions_rxNumber_key; Type: INDEX; Schema: public; Owner: highflyer
--

CREATE UNIQUE INDEX "prescriptions_rxNumber_key" ON public.prescriptions USING btree ("rxNumber");


--
-- Name: staff_members_email_key; Type: INDEX; Schema: public; Owner: highflyer
--

CREATE UNIQUE INDEX staff_members_email_key ON public.staff_members USING btree (email);


--
-- Name: staff_members_employeeId_key; Type: INDEX; Schema: public; Owner: highflyer
--

CREATE UNIQUE INDEX "staff_members_employeeId_key" ON public.staff_members USING btree ("employeeId");


--
-- Name: treatment_plans_planNumber_key; Type: INDEX; Schema: public; Owner: highflyer
--

CREATE UNIQUE INDEX "treatment_plans_planNumber_key" ON public.treatment_plans USING btree ("planNumber");


--
-- Name: users_email_key; Type: INDEX; Schema: public; Owner: highflyer
--

CREATE UNIQUE INDEX users_email_key ON public.users USING btree (email);


--
-- PostgreSQL database dump complete
--

\unrestrict c2UQzUE3ymQGOiXcwISLfPEwNkvMl62Y8hFlZa2Pe0sdBP2gEvkBs55zRTIx8J4

