-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'Doctor',
    "status" TEXT NOT NULL DEFAULT 'active',
    "activationPin" TEXT,
    "pinExpiresAt" TIMESTAMP(3),
    "department" TEXT NOT NULL DEFAULT 'Kayachikitsa (Internal Medicine)',
    "licenseNumber" TEXT,
    "mrn" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patients" (
    "id" TEXT NOT NULL,
    "mrn" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "dob" TEXT NOT NULL DEFAULT '1990-01-01',
    "age" INTEGER NOT NULL,
    "gender" TEXT NOT NULL,
    "bloodGroup" TEXT NOT NULL DEFAULT 'O+',
    "phone" TEXT NOT NULL DEFAULT '+91 98450 00000',
    "email" TEXT,
    "address" TEXT NOT NULL DEFAULT 'Mannamkala Road, Munnar Hills, Adimali, Kerala 685561',
    "emergencyContact" JSONB,
    "allergies" JSONB,
    "chronicConditions" JSONB,
    "currentMedications" JSONB,
    "pastDiagnoses" JSONB,
    "medicalHistoryNotes" TEXT DEFAULT '',
    "admissionStatus" TEXT NOT NULL DEFAULT 'outpatient',
    "currentWard" TEXT,
    "currentBed" TEXT,
    "assignedDoctorId" TEXT,
    "assignedDoctorName" TEXT,
    "admissionDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "insurance" JSONB,
    "doshaProfile" JSONB,
    "latestVitals" JSONB,
    "clinicalNotes" TEXT DEFAULT '',
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "patients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appointments" (
    "id" TEXT NOT NULL,
    "patientId" TEXT,
    "patientName" TEXT NOT NULL,
    "patientMrn" TEXT NOT NULL,
    "patientPhone" TEXT NOT NULL DEFAULT '+91 98450 00000',
    "patientEmail" TEXT NOT NULL DEFAULT '',
    "doctorId" TEXT,
    "doctorName" TEXT NOT NULL,
    "department" TEXT NOT NULL DEFAULT 'Kayachikitsa (Internal Medicine)',
    "dateTime" TIMESTAMP(3) NOT NULL,
    "timeSlot" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'Ayurvedic Initial Consultation',
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "notes" TEXT DEFAULT '',
    "reminderSent" BOOLEAN NOT NULL DEFAULT false,
    "reminderChannel" TEXT,
    "reminderSentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "appointments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consultations" (
    "id" TEXT NOT NULL,
    "consultationNumber" TEXT NOT NULL,
    "patientId" TEXT,
    "patientName" TEXT NOT NULL,
    "patientMrn" TEXT NOT NULL,
    "doctorId" TEXT,
    "doctorName" TEXT NOT NULL,
    "appointmentId" TEXT,
    "dateTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "chiefComplaint" TEXT NOT NULL,
    "duration" TEXT NOT NULL DEFAULT '40 minutes',
    "presentIllness" TEXT DEFAULT '',
    "vitals" JSONB,
    "ayurvedicAssessment" JSONB NOT NULL,
    "classicalDiagnosis" TEXT NOT NULL,
    "westernCorrelation" TEXT,
    "treatmentRecommendations" TEXT NOT NULL,
    "recommendedTherapies" JSONB,
    "prescriptions" JSONB,
    "status" TEXT NOT NULL DEFAULT 'completed',
    "clinicalNotes" TEXT,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "consultations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "treatment_plans" (
    "id" TEXT NOT NULL,
    "planNumber" TEXT NOT NULL,
    "patientId" TEXT,
    "patientName" TEXT NOT NULL,
    "patientMrn" TEXT NOT NULL,
    "doctorId" TEXT,
    "doctorName" TEXT NOT NULL,
    "assignedTherapist" TEXT NOT NULL,
    "therapyType" TEXT NOT NULL,
    "clinicalObjective" TEXT NOT NULL,
    "oilOrFormulation" TEXT NOT NULL,
    "totalSessions" INTEGER NOT NULL DEFAULT 7,
    "completedSessions" INTEGER NOT NULL DEFAULT 0,
    "frequency" TEXT NOT NULL DEFAULT 'Daily',
    "startDate" TEXT NOT NULL,
    "endDate" TEXT NOT NULL,
    "roomNumber" TEXT NOT NULL DEFAULT 'Therapy Suite 01',
    "status" TEXT NOT NULL DEFAULT 'active',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "treatment_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "panchakarma_courses" (
    "id" TEXT NOT NULL,
    "courseNumber" TEXT NOT NULL,
    "patientId" TEXT,
    "patientName" TEXT NOT NULL,
    "patientMrn" TEXT NOT NULL,
    "vaidyaName" TEXT NOT NULL,
    "protocol" TEXT NOT NULL,
    "currentPhase" TEXT NOT NULL,
    "startDate" TEXT NOT NULL,
    "expectedEndDate" TEXT NOT NULL,
    "totalDays" INTEGER NOT NULL DEFAULT 14,
    "completedDays" INTEGER NOT NULL DEFAULT 0,
    "dietaryPrescription" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Active',
    "dailySessions" JSONB,
    "dischargeNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "panchakarma_courses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prescriptions" (
    "id" TEXT NOT NULL,
    "rxNumber" TEXT NOT NULL,
    "patientId" TEXT,
    "patientName" TEXT NOT NULL,
    "mrn" TEXT NOT NULL,
    "doctorId" TEXT,
    "doctorName" TEXT NOT NULL,
    "datePrescribed" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "medicationName" TEXT NOT NULL,
    "dosage" TEXT NOT NULL,
    "frequency" TEXT NOT NULL,
    "route" TEXT NOT NULL DEFAULT 'Oral',
    "duration" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "pharmacyNotes" TEXT,
    "dispensedAt" TIMESTAMP(3),
    "dispensedBy" TEXT,
    "digitalSignature" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "prescriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "medication_stock" (
    "id" TEXT NOT NULL,
    "drugName" TEXT NOT NULL,
    "genericName" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "form" TEXT NOT NULL,
    "stockQuantity" INTEGER NOT NULL DEFAULT 0,
    "unit" TEXT NOT NULL DEFAULT 'bottles',
    "minThreshold" INTEGER NOT NULL DEFAULT 20,
    "batchNumber" TEXT NOT NULL,
    "expiryDate" TEXT NOT NULL,
    "unitPrice" DOUBLE PRECISION NOT NULL DEFAULT 250.0,
    "status" TEXT NOT NULL DEFAULT 'in_stock',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "medication_stock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_movements" (
    "id" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "medicineId" TEXT,
    "medicineName" TEXT NOT NULL,
    "batchNumber" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "quantityDelta" INTEGER NOT NULL,
    "remainingQuantity" INTEGER NOT NULL,
    "actor" TEXT NOT NULL,
    "referenceNumber" TEXT,
    "notes" TEXT,

    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lab_orders" (
    "id" TEXT NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "patientId" TEXT,
    "patientName" TEXT NOT NULL,
    "mrn" TEXT NOT NULL,
    "testType" TEXT NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'Routine',
    "orderingDoctor" TEXT NOT NULL,
    "orderedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'ordered',
    "resultValue" TEXT,
    "normalRange" TEXT,
    "isAbnormal" BOOLEAN NOT NULL DEFAULT false,
    "labNotes" TEXT,
    "digitalSignature" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lab_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "patientId" TEXT,
    "patientName" TEXT NOT NULL,
    "mrn" TEXT NOT NULL,
    "admissionDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dischargeDate" TIMESTAMP(3),
    "items" JSONB NOT NULL,
    "subtotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "insuranceCovered" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "copayPatient" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "paymentStatus" TEXT NOT NULL DEFAULT 'unpaid',
    "insuranceClaimStatus" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_members" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "designation" TEXT NOT NULL,
    "department" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "licenseNumber" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'on_duty',
    "shift" TEXT NOT NULL DEFAULT 'Morning (07:00-15:00)',
    "qualification" TEXT NOT NULL DEFAULT 'BAMS, MD',
    "joiningDate" TEXT NOT NULL,
    "digitalSigningAuthority" BOOLEAN NOT NULL DEFAULT false,
    "activationPin" TEXT,
    "pinExpiresAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staff_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actor" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "patientMrn" TEXT,
    "details" TEXT NOT NULL,
    "ipAddress" TEXT DEFAULT '192.168.1.42',

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "patients_mrn_key" ON "patients"("mrn");

-- CreateIndex
CREATE UNIQUE INDEX "consultations_consultationNumber_key" ON "consultations"("consultationNumber");

-- CreateIndex
CREATE UNIQUE INDEX "treatment_plans_planNumber_key" ON "treatment_plans"("planNumber");

-- CreateIndex
CREATE UNIQUE INDEX "panchakarma_courses_courseNumber_key" ON "panchakarma_courses"("courseNumber");

-- CreateIndex
CREATE UNIQUE INDEX "prescriptions_rxNumber_key" ON "prescriptions"("rxNumber");

-- CreateIndex
CREATE UNIQUE INDEX "lab_orders_orderNumber_key" ON "lab_orders"("orderNumber");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_invoiceNumber_key" ON "invoices"("invoiceNumber");

-- CreateIndex
CREATE UNIQUE INDEX "staff_members_employeeId_key" ON "staff_members"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "staff_members_email_key" ON "staff_members"("email");

