-- Create Sequences for Invoices, Payments, Refunds
CREATE SEQUENCE IF NOT EXISTS invoice_seq START WITH 10001;
CREATE SEQUENCE IF NOT EXISTS payment_seq START WITH 10001;
CREATE SEQUENCE IF NOT EXISTS refund_seq START WITH 10001;

-- AlterTable dispensing_records
ALTER TABLE "dispensing_records" ADD COLUMN IF NOT EXISTS "billedQuantity" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "isBilled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "billingInvoiceId" TEXT;

CREATE INDEX IF NOT EXISTS "dispensing_records_isBilled_idx" ON "dispensing_records"("isBilled");

-- AlterTable invoices
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'draft',
ADD COLUMN IF NOT EXISTS "issuedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "issuedById" TEXT,
ADD COLUMN IF NOT EXISTS "issuedByName" TEXT,
ADD COLUMN IF NOT EXISTS "createdById" TEXT,
ADD COLUMN IF NOT EXISTS "createdByName" TEXT,
ADD COLUMN IF NOT EXISTS "dueDate" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "currency" TEXT NOT NULL DEFAULT 'INR',
ADD COLUMN IF NOT EXISTS "notes" TEXT;

CREATE INDEX IF NOT EXISTS "invoices_patientId_idx" ON "invoices"("patientId");
CREATE INDEX IF NOT EXISTS "invoices_mrn_idx" ON "invoices"("mrn");
CREATE INDEX IF NOT EXISTS "invoices_status_idx" ON "invoices"("status");
CREATE INDEX IF NOT EXISTS "invoices_createdAt_idx" ON "invoices"("createdAt");

-- CreateTable payments
CREATE TABLE IF NOT EXISTS "payments" (
    "id" TEXT NOT NULL,
    "paymentNumber" TEXT NOT NULL,
    "patientId" TEXT,
    "patientName" TEXT NOT NULL,
    "mrn" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "unallocatedAmount" DECIMAL(12,2) NOT NULL,
    "paymentDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paymentMethod" TEXT NOT NULL,
    "referenceNumber" TEXT,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'unallocated',
    "recordedById" TEXT NOT NULL,
    "recordedByName" TEXT NOT NULL,
    "recordedByRole" TEXT NOT NULL DEFAULT 'ACCOUNTANT',
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "payments_paymentNumber_key" ON "payments"("paymentNumber");
CREATE UNIQUE INDEX IF NOT EXISTS "payments_idempotencyKey_key" ON "payments"("idempotencyKey");
CREATE INDEX IF NOT EXISTS "payments_patientId_idx" ON "payments"("patientId");
CREATE INDEX IF NOT EXISTS "payments_mrn_idx" ON "payments"("mrn");
CREATE INDEX IF NOT EXISTS "payments_paymentDate_idx" ON "payments"("paymentDate");
CREATE INDEX IF NOT EXISTS "payments_status_idx" ON "payments"("status");

-- CreateTable payment_allocations
CREATE TABLE IF NOT EXISTS "payment_allocations" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "allocatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "allocatedById" TEXT NOT NULL,
    "allocatedByName" TEXT NOT NULL,
    "allocatedByRole" TEXT NOT NULL DEFAULT 'ACCOUNTANT',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_allocations_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "payment_allocations_paymentId_idx" ON "payment_allocations"("paymentId");
CREATE INDEX IF NOT EXISTS "payment_allocations_invoiceId_idx" ON "payment_allocations"("invoiceId");
CREATE INDEX IF NOT EXISTS "payment_allocations_allocatedAt_idx" ON "payment_allocations"("allocatedAt");

-- CreateTable refund_requests
CREATE TABLE IF NOT EXISTS "refund_requests" (
    "id" TEXT NOT NULL,
    "requestNumber" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "paymentId" TEXT,
    "invoiceId" TEXT,
    "patientId" TEXT,
    "patientName" TEXT NOT NULL,
    "mrn" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "requestedById" TEXT NOT NULL,
    "requestedByName" TEXT NOT NULL,
    "requestedByRole" TEXT NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedById" TEXT,
    "approvedByName" TEXT,
    "approvedByRole" TEXT,
    "approvedAt" TIMESTAMP(3),
    "approvalNotes" TEXT,
    "rejectedById" TEXT,
    "rejectedByName" TEXT,
    "rejectedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "externalReference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refund_requests_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "refund_requests_requestNumber_key" ON "refund_requests"("requestNumber");
CREATE INDEX IF NOT EXISTS "refund_requests_patientId_idx" ON "refund_requests"("patientId");
CREATE INDEX IF NOT EXISTS "refund_requests_invoiceId_idx" ON "refund_requests"("invoiceId");
CREATE INDEX IF NOT EXISTS "refund_requests_paymentId_idx" ON "refund_requests"("paymentId");
CREATE INDEX IF NOT EXISTS "refund_requests_status_idx" ON "refund_requests"("status");
CREATE INDEX IF NOT EXISTS "refund_requests_requestedAt_idx" ON "refund_requests"("requestedAt");

-- CreateTable financial_idempotency
CREATE TABLE IF NOT EXISTS "financial_idempotency" (
    "id" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "responsePayload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "financial_idempotency_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "financial_idempotency_idempotencyKey_key" ON "financial_idempotency"("idempotencyKey");
CREATE INDEX IF NOT EXISTS "financial_idempotency_operation_idx" ON "financial_idempotency"("operation");
CREATE INDEX IF NOT EXISTS "financial_idempotency_actorId_idx" ON "financial_idempotency"("actorId");

-- AddForeignKey
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payments_patientId_fkey') THEN
        ALTER TABLE "payments" ADD CONSTRAINT "payments_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payment_allocations_paymentId_fkey') THEN
        ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payment_allocations_invoiceId_fkey') THEN
        ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'refund_requests_paymentId_fkey') THEN
        ALTER TABLE "refund_requests" ADD CONSTRAINT "refund_requests_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'refund_requests_invoiceId_fkey') THEN
        ALTER TABLE "refund_requests" ADD CONSTRAINT "refund_requests_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'refund_requests_patientId_fkey') THEN
        ALTER TABLE "refund_requests" ADD CONSTRAINT "refund_requests_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;

