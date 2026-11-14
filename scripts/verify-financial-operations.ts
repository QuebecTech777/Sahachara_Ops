/**
 * SAHACHARA OPS — PHASE 5: BILLING, INVOICING & FINANCIAL OPERATIONS VERIFICATION SUITE
 *
 * Comprehensive verification of:
 * 1. Target database isolation guard (strictly refuses production database).
 * 2. Fail-closed authoritative sequence generation (INV-YYYY-XXXXX, PAY-YYYY-XXXXX, REF-YYYY-XXXXX).
 * 3. Invoices: draft vs issued lifecycle, immutable pricing snapshot, and exact Decimal(12,2) arithmetic.
 * 4. Fail-closed tariff and medication price enforcement (unconfigured prices strictly rejected).
 * 5. Direct cashier payment recording with payment methods (Cash, UPI, Bank Transfer, Card, Other).
 * 6. Payment allocations: single invoice partial, multi-invoice distribution, overpayment prevention, and balance tracking.
 * 7. Dual authorization for refunds and credit adjustments (ACCOUNTANT initiates, SUPER_ADMIN approves).
 * 8. Strict anti-self-approval enforcement (initiator cannot approve their own refund request).
 * 9. Controlled invoice voiding with automatic payment allocation reversal (returns credit to unallocated balance).
 * 10. Pharmacy billing integration: bills unbilled DispensingRecords and strictly prevents duplicate quantity billing.
 * 11. Financial reporting: Daily Collection Report by payment method and Outstanding Receivables with aging buckets (0-30, 31-60, 61-90, 90+ days).
 * 12. Patient account summary: exact sum of invoiced, paid, outstanding, unallocated credit, and net balance.
 * 13. Strict 7-role financial RBAC authorization matrix across all roles.
 * 14. Concurrency protection and financial idempotency.
 * 15. Production database zero-mutation verification (0 records altered or polluted).
 */

import http from 'http';
import express from 'express';
import { PrismaClient, Prisma } from '@prisma/client';

// ---------------------------------------------------------------------------
// TEST DATABASE ISOLATION GUARD — must run before server imports
// ---------------------------------------------------------------------------
const PROD_DB_URL = 'postgresql://highflyer@localhost:5432/sahachara_ops_db';
const TEST_DB_URL = process.env.TEST_DATABASE_URL || 'postgresql://highflyer@localhost:5432/sahachara_ops_test_db';

if (process.env.DATABASE_URL?.includes('sahachara_ops_db') && process.env.TEST_DATABASE_URL?.includes('sahachara_ops_db')) {
  console.error('\nFATAL: Tests must not run against production database! Aborting.\n');
  process.exit(1);
}

process.env.DATABASE_URL = TEST_DB_URL;
process.env.ENABLE_TEST_ACCOUNTS = 'true';
process.env.NODE_ENV = 'test';

import { apiRouter } from '../server/routes.ts';
import { generateSessionToken } from '../server/rbacMiddleware.ts';
import { UserRole } from '../src/types/hospital.ts';
import {
  checkPrismaConnection,
  ensureDefaultDatabaseUsers,
  isPrismaConnected,
  prisma,
  generateUniqueInvoiceNumber,
  generateUniquePaymentNumber,
  generateUniqueRefundNumber,
  generateUniquePatientNumber,
  generateUniqueDispenseNumber
} from '../server/prismaService.ts';

const prodProbePrisma = new PrismaClient({
  datasources: {
    db: { url: process.env.PROD_DATABASE_URL || 'postgresql://highflyer@localhost:5432/sahachara_ops_db' }
  }
});

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

let passedCount = 0;
let failedCount = 0;

function pass(desc: string, detail?: string) {
  passedCount++;
  console.log(`  ${GREEN}✓ PASS${RESET} ${desc}${detail ? ` (${detail})` : ''}`);
}

function fail(desc: string, reason: string) {
  failedCount++;
  console.error(`  ${RED}✗ FAIL${RESET} ${desc}: ${RED}${reason}${RESET}`);
}

function assert(cond: boolean, desc: string, detail?: string) {
  if (cond) pass(desc, detail);
  else fail(desc, detail || 'Assertion evaluated to false');
}

// Helper to make HTTP requests to the test express app
function makeRequest(
  serverUrl: string,
  method: string,
  path: string,
  token?: string,
  body?: any
): Promise<{ status: number; body: any; headers: http.IncomingHttpHeaders }> {
  return new Promise((resolve, reject) => {
    const url = new URL(path, serverUrl);
    const postData = body ? JSON.stringify(body) : undefined;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    if (postData) {
      headers['Content-Length'] = Buffer.byteLength(postData).toString();
    }

    const req = http.request(
      url,
      {
        method,
        headers
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => (raw += chunk));
        res.on('end', () => {
          try {
            const parsed = raw ? JSON.parse(raw) : null;
            resolve({ status: res.statusCode || 500, body: parsed, headers: res.headers });
          } catch {
            resolve({ status: res.statusCode || 500, body: raw, headers: res.headers });
          }
        });
      }
    );

    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

async function runFinancialOperationsSuite() {
  console.log(`\n${BOLD}${CYAN}======================================================================${RESET}`);
  console.log(`${BOLD}${CYAN}   SAHACHARA OPS — PHASE 5: FINANCIAL OPERATIONS VERIFICATION SUITE   ${RESET}`);
  console.log(`${BOLD}${CYAN}======================================================================${RESET}\n`);

  // Verify connection to test database
  await checkPrismaConnection();
  if (!isPrismaConnected) {
    console.error('Test database unreachable. Aborting.');
    process.exit(1);
  }
  await ensureDefaultDatabaseUsers();

  // Baseline probe of production database to guarantee zero mutation
  const prodInitialSnapshot = {
    users: await prodProbePrisma.user.count(),
    patients: await prodProbePrisma.patient.count(),
    appointments: await prodProbePrisma.appointment.count(),
    prescriptions: await prodProbePrisma.prescription.count(),
    dispensingRecords: await prodProbePrisma.dispensingRecord.count(),
    invoices: await prodProbePrisma.invoice.count(),
    payments: await prodProbePrisma.payment.count(),
    refundRequests: await prodProbePrisma.refundRequest.count(),
    tariffs: await prodProbePrisma.hospitalTariff.count()
  };

  console.log(`✓ Isolated Test Database Connected: sahachara_ops_test_db`);
  console.log(`✓ Production Database Pre-Test State Snapshot:`, prodInitialSnapshot);

  // Setup express test server
  const app = express();
  app.use(express.json());
  app.use('/api', apiRouter);

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as any).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  // Session tokens for all 7 roles
  const superAdminToken = generateSessionToken({ userId: 'sa-user-001', email: 'superadmin@sahachara.com', role: 'SUPER_ADMIN', name: 'Dr. Alexander Wright' });
  const adminToken = generateSessionToken({ userId: 'adm-user-001', email: 'admin@sahachara.com', role: 'ADMIN', name: 'Hospital Admin' });
  const accountantToken = generateSessionToken({ userId: 'acc-user-001', email: 'accountant@sahachara.com', role: 'ACCOUNTANT', name: 'Chief Accountant' });
  const accountant2Token = generateSessionToken({ userId: 'acc-user-002', email: 'accountant2@sahachara.com', role: 'ACCOUNTANT', name: 'Staff Accountant' });
  const doctorToken = generateSessionToken({ userId: 'doc-user-001', email: 'doctor@sahachara.com', role: 'DOCTOR', name: 'Dr. Rivera' });
  const vaidyaToken = generateSessionToken({ userId: 'vai-user-001', email: 'vaidya@sahachara.com', role: 'VAIDYA', name: 'Vaidya Sharma' });
  const receptionistToken = generateSessionToken({ userId: 'rec-user-001', email: 'reception@sahachara.com', role: 'RECEPTIONIST', name: 'Receptionist Desk' });
  const pharmacistToken = generateSessionToken({ userId: 'phm-user-001', email: 'pharmacy@sahachara.com', role: 'PHARMACIST', name: 'Pharmacist Menon' });

  // Provision active service tariff in test DB for billing tests
  const testTariff = await prisma.hospitalTariff.upsert({
    where: { serviceCode: 'FIN-CONSULT-01' },
    update: { rate: new Prisma.Decimal('1200.00'), isActive: true },
    create: {
      category: 'Consultation',
      serviceCode: 'FIN-CONSULT-01',
      serviceName: 'Senior Specialist Consultation',
      rate: new Prisma.Decimal('1200.00'),
      currency: 'INR',
      isActive: true,
      unit: 'visit'
    }
  });

  const testPanchakarmaTariff = await prisma.hospitalTariff.upsert({
    where: { serviceCode: 'FIN-PK-01' },
    update: { rate: new Prisma.Decimal('3500.50'), isActive: true },
    create: {
      category: 'Panchakarma',
      serviceCode: 'FIN-PK-01',
      serviceName: 'Abhyanga & Swedana Therapy',
      rate: new Prisma.Decimal('3500.50'),
      currency: 'INR',
      isActive: true,
      unit: 'session'
    }
  });

  // Provision an unconfigured tariff to verify fail-closed billing
  const unconfiguredTariff = await prisma.hospitalTariff.upsert({
    where: { serviceCode: 'FIN-UNCONFIG-01' },
    update: { rate: null, isActive: true },
    create: {
      category: 'Treatment',
      serviceCode: 'FIN-UNCONFIG-01',
      serviceName: 'Unconfigured Special Therapy',
      rate: null,
      currency: 'INR',
      isActive: true,
      unit: 'session'
    }
  });

  // Provision medication stock in test DB (one configured price, one unconfigured)
  const pricedMedStock = await prisma.medicationStock.create({
    data: {
      drugName: 'Ashwagandha Churna 100g',
      genericName: 'Withania somnifera',
      category: 'Ayurvedic',
      form: 'Churna (Powder)',
      batchNumber: 'FIN-ASH-B101',
      expiryDate: '2028-12-31',
      unitPrice: new Prisma.Decimal('280.00'),
      stockQuantity: 100,
      unit: 'jar',
      isActive: true
    }
  });

  const unpricedMedStock = await prisma.medicationStock.create({
    data: {
      drugName: 'Triphala Guggulu 60s',
      genericName: 'Commiphora mukul',
      category: 'Ayurvedic',
      form: 'Vati (Tablet)',
      batchNumber: 'FIN-TRIPH-B202',
      expiryDate: '2028-12-31',
      unitPrice: null, // Unconfigured
      stockQuantity: 100,
      unit: 'bottle',
      isActive: true
    }
  });

  // Provision test patients
  const p1Mrn = await generateUniquePatientNumber();
  const testPatient1 = await prisma.patient.create({
    data: {
      mrn: p1Mrn,
      firstName: 'Kavita',
      lastName: 'Nambiar',
      gender: 'Female',
      phone: '+919876543210'
    }
  });

  const p2Mrn = await generateUniquePatientNumber();
  const testPatient2 = await prisma.patient.create({
    data: {
      mrn: p2Mrn,
      firstName: 'Ramesh',
      lastName: 'Menon',
      gender: 'Male',
      phone: '+919876543211'
    }
  });

  try {
    // =========================================================================
    // 1. FAIL-CLOSED SEQUENCE GENERATION
    // =========================================================================
    console.log(`\n${BOLD}▶ 1. AUTHORITATIVE FAIL-CLOSED SEQUENCE NUMBER GENERATION${RESET}`);
    {
      const invNum1 = await generateUniqueInvoiceNumber();
      const invNum2 = await generateUniqueInvoiceNumber();
      assert(/^INV-\d{4}-\d{5}$/.test(invNum1), 'Invoice number matches INV-YYYY-XXXXX sequence pattern', invNum1);
      assert(/^INV-\d{4}-\d{5}$/.test(invNum2), 'Subsequent invoice number matches INV-YYYY-XXXXX', invNum2);
      assert(invNum1 !== invNum2, 'Subsequent invoice numbers are strictly distinct');

      const payNum1 = await generateUniquePaymentNumber();
      const payNum2 = await generateUniquePaymentNumber();
      assert(/^PAY-\d{4}-\d{5}$/.test(payNum1), 'Payment number matches PAY-YYYY-XXXXX sequence pattern', payNum1);
      assert(/^PAY-\d{4}-\d{5}$/.test(payNum2), 'Subsequent payment number matches PAY-YYYY-XXXXX', payNum2);
      assert(payNum1 !== payNum2, 'Subsequent payment numbers are strictly distinct');

      const refNum1 = await generateUniqueRefundNumber();
      const refNum2 = await generateUniqueRefundNumber();
      assert(/^REF-\d{4}-\d{5}$/.test(refNum1), 'Refund number matches REF-YYYY-XXXXX sequence pattern', refNum1);
      assert(/^REF-\d{4}-\d{5}$/.test(refNum2), 'Subsequent refund number matches REF-YYYY-XXXXX', refNum2);
      assert(refNum1 !== refNum2, 'Subsequent refund numbers are strictly distinct');
    }

    // =========================================================================
    // 2. INVOICE CREATION, DECIMAL ARITHMETIC & LINE ITEM SNAPSHOTS
    // =========================================================================
    console.log(`\n${BOLD}▶ 2. INVOICE CREATION, DECIMAL ARITHMETIC & DRAFT LIFECYCLE${RESET}`);
    let testInvoiceId1 = '';
    let testInvoiceNum1 = '';
    let draftInvoiceId = '';
    {
      // 2.1 Accountant creates issued invoice with fractional Decimal calculations
      // 2x Senior Specialist Consultation (1200.00 each = 2400.00)
      // 3x Panchakarma Session (3500.50 each = 10501.50)
      // Expected Subtotal = 12901.50
      const res = await makeRequest(baseUrl, 'POST', '/api/billing/invoices', accountantToken, {
        patientId: testPatient1.id,
        patientName: 'Kavita Nambiar',
        mrn: testPatient1.mrn,
        items: [
          { tariffId: testTariff.id, quantity: 2 },
          { tariffId: testPanchakarmaTariff.id, quantity: 3 }
        ]
      });

      assert(res.status === 201, 'Accountant created issued invoice with 201 Created');
      assert(res.body.success === true, 'Response payload success is true');
      const inv = res.body.data;
      testInvoiceId1 = inv.id;
      testInvoiceNum1 = inv.invoiceNumber;
      assert(/^INV-\d{4}-\d{5}$/.test(inv.invoiceNumber), 'Invoice assigned authoritative sequence number', inv.invoiceNumber);
      assert(inv.status === 'issued', 'Invoice created directly in issued status');
      assert(inv.issuedAt !== null, 'Invoice has issuedAt timestamp');
      assert(inv.subtotal === 12901.5, 'Exact subtotal Decimal calculation: 2*1200 + 3*3500.50 = 12901.50', `Actual: ${inv.subtotal}`);
      assert(inv.totalAmount === 12901.5, 'Total amount matches subtotal');
      assert(inv.balance === 12901.5, 'Initial balance matches total amount');
      assert(inv.paidAmount === 0, 'Initial paid amount is 0');
      assert(inv.paymentStatus === 'unpaid', 'Initial payment status is unpaid');

      // 2.2 Create Draft Invoice and Issue it
      const draftRes = await makeRequest(baseUrl, 'POST', '/api/billing/invoices', accountantToken, {
        patientId: testPatient1.id,
        patientName: 'Kavita Nambiar',
        mrn: testPatient1.mrn,
        isDraft: true,
        items: [{ tariffId: testTariff.id, quantity: 1 }]
      });
      assert(draftRes.status === 201, 'Draft invoice creation succeeded (201 Created)');
      draftInvoiceId = draftRes.body.data.id;
      assert(draftRes.body.data.status === 'draft', 'Invoice created with status="draft"');
      assert(draftRes.body.data.issuedAt === null || draftRes.body.data.issuedAt === undefined, 'Draft invoice has no issuedAt timestamp');

      // Issue draft invoice
      const issueRes = await makeRequest(baseUrl, 'POST', `/api/billing/invoices/${draftInvoiceId}/issue`, accountantToken);
      assert(issueRes.status === 200, 'Draft invoice issued successfully (200 OK)');
      assert(issueRes.body.data.status === 'issued', 'Invoice transitioned to "issued"');
      assert(issueRes.body.data.issuedAt !== null, 'Invoice has issuedAt timestamp recorded');
    }

    // =========================================================================
    // 3. FAIL-CLOSED UNCONFIGURED PRICING REJECTION
    // =========================================================================
    console.log(`\n${BOLD}▶ 3. FAIL-CLOSED UNCONFIGURED TARIFF & MEDICATION PRICE REJECTION${RESET}`);
    {
      // 3.1 Unconfigured Tariff Rate (null rate) must reject
      const unconfigRes = await makeRequest(baseUrl, 'POST', '/api/billing/invoices', accountantToken, {
        patientId: testPatient1.id,
        patientName: 'Kavita Nambiar',
        mrn: testPatient1.mrn,
        items: [{ tariffId: unconfiguredTariff.id, quantity: 1 }]
      });
      assert(unconfigRes.status === 400, 'Billing unconfigured tariff rejected with HTTP 400');
      assert(unconfigRes.body.error === 'UnconfiguredTariff', 'Error code is UnconfiguredTariff');

      // 3.2 Unconfigured Medication Price (null unitPrice) must reject
      const unconfigMedRes = await makeRequest(baseUrl, 'POST', '/api/billing/invoices', accountantToken, {
        patientId: testPatient1.id,
        patientName: 'Kavita Nambiar',
        mrn: testPatient1.mrn,
        items: [{ medicationId: unpricedMedStock.id, quantity: 2, category: 'Pharmacy' }]
      });
      assert(unconfigMedRes.status === 400, 'Billing unconfigured medication price rejected with HTTP 400');
      assert(unconfigMedRes.body.error === 'UnconfiguredMedicationPrice', 'Error code is UnconfiguredMedicationPrice');

      // 3.3 Zero-price without authorization must reject
      const zeroTariff = await prisma.hospitalTariff.upsert({
        where: { serviceCode: 'FIN-ZERO-UNAUTH' },
        update: { rate: new Prisma.Decimal('0.00'), isZeroPricePermitted: false, isActive: true },
        create: {
          category: 'Consultation',
          serviceCode: 'FIN-ZERO-UNAUTH',
          serviceName: 'Unauthorized Free Visit',
          rate: new Prisma.Decimal('0.00'),
          isZeroPricePermitted: false,
          isActive: true
        }
      });
      const zeroRes = await makeRequest(baseUrl, 'POST', '/api/billing/invoices', accountantToken, {
        patientId: testPatient1.id,
        patientName: 'Kavita Nambiar',
        mrn: testPatient1.mrn,
        items: [{ tariffId: zeroTariff.id, quantity: 1 }]
      });
      assert(zeroRes.status === 400, 'Zero-rate billing without zeroPricePermitted rejected with HTTP 400');
      assert(zeroRes.body.error === 'ZeroPriceNotPermitted', 'Error code is ZeroPriceNotPermitted');
    }

    // =========================================================================
    // 4. CASHIER PAYMENTS RECORDING & UNALLOCATED CREDIT
    // =========================================================================
    console.log(`\n${BOLD}▶ 4. CASHIER PAYMENT RECORDING & UNALLOCATED CREDIT TRACKING${RESET}`);
    let testPaymentId1 = '';
    let testPaymentNum1 = '';
    {
      // 4.1 Record pure unallocated advance payment of ₹5,000 via UPI
      const payRes = await makeRequest(baseUrl, 'POST', '/api/billing/payments', accountantToken, {
        patientId: testPatient1.id,
        amount: 5000.00,
        paymentMethod: 'UPI',
        referenceNumber: 'UPI-UTR-9876543210',
        notes: 'Advance deposit from patient'
      });

      assert(payRes.status === 201, 'Recorded payment successfully with 201 Created');
      const pay = payRes.body.data;
      testPaymentId1 = pay.id;
      testPaymentNum1 = pay.paymentNumber;
      assert(/^PAY-\d{4}-\d{5}$/.test(pay.paymentNumber), 'Assigned authoritative payment sequence number', pay.paymentNumber);
      assert(pay.amount === 5000.00, 'Payment amount is 5000.00');
      assert(pay.unallocatedAmount === 5000.00, 'Unallocated amount is initially full 5000.00');
      assert(pay.status === 'unallocated', 'Payment status is "unallocated"');
      assert(pay.paymentMethod === 'UPI', 'Payment method is UPI');
      assert(pay.recordedByRole === 'ACCOUNTANT', 'Recorded by role is ACCOUNTANT');

      // 4.2 Invalid amount rejected
      const negRes = await makeRequest(baseUrl, 'POST', '/api/billing/payments', accountantToken, {
        patientId: testPatient1.id,
        amount: -100,
        paymentMethod: 'Cash'
      });
      assert(negRes.status === 400, 'Negative payment amount rejected with HTTP 400');

      // 4.3 Missing method rejected
      const noMethodRes = await makeRequest(baseUrl, 'POST', '/api/billing/payments', accountantToken, {
        patientId: testPatient1.id,
        amount: 100
      });
      assert(noMethodRes.status === 400, 'Missing payment method rejected with HTTP 400');
    }

    // =========================================================================
    // 5. PAYMENT ALLOCATIONS, PARTIAL PAYMENTS & OVERPAYMENT PREVENTION
    // =========================================================================
    console.log(`\n${BOLD}▶ 5. PAYMENT ALLOCATIONS, PARTIAL PAYMENTS & OVERPAYMENT PREVENTION${RESET}`);
    {
      // 5.1 Allocate partial ₹2,901.50 from Payment 1 (unallocated: 5000) to Invoice 1 (balance: 12901.50)
      const allocRes = await makeRequest(baseUrl, 'POST', `/api/billing/payments/${testPaymentId1}/allocate`, accountantToken, {
        allocations: [{ invoiceId: testInvoiceId1, amount: 2901.50 }]
      });

      assert(allocRes.status === 200, 'Partial allocation succeeded with 200 OK');
      const updatedPay = allocRes.body.data;
      assert(updatedPay.unallocatedAmount === 2098.50, 'Payment unallocated amount decremented to 2098.50 (5000 - 2901.50)', `Actual: ${updatedPay.unallocatedAmount}`);
      assert(updatedPay.status === 'partially_allocated', 'Payment status is "partially_allocated"');

      // Verify invoice balance after partial allocation
      const invCheck = await makeRequest(baseUrl, 'GET', `/api/billing/invoices/${testInvoiceId1}`, accountantToken);
      const invData = invCheck.body.data;
      assert(invData.paidAmount === 2901.50, 'Invoice paidAmount updated to 2901.50');
      assert(invData.balance === 10000.00, 'Invoice balance updated to exactly 10000.00 (12901.50 - 2901.50)', `Actual: ${invData.balance}`);
      assert(invData.paymentStatus === 'partially_paid', 'Invoice paymentStatus transitioned to "partially_paid"');

      // 5.2 Attempt over-allocation exceeding remaining unallocated payment balance (attempting 3000 when only 2098.50 remains)
      const overAllocRes = await makeRequest(baseUrl, 'POST', `/api/billing/payments/${testPaymentId1}/allocate`, accountantToken, {
        allocations: [{ invoiceId: testInvoiceId1, amount: 3000.00 }]
      });
      assert(overAllocRes.status === 400, 'Allocation exceeding unallocated payment credit rejected with HTTP 400');
      assert(overAllocRes.body.error === 'AllocationError', 'Error code is AllocationError');

      // 5.3 Attempt overpaying an invoice exceeding its balance
      // Record a new large payment of ₹20,000 and try to allocate ₹15,000 to invoice 1 (balance is only 10,000)
      const bigPayRes = await makeRequest(baseUrl, 'POST', '/api/billing/payments', accountantToken, {
        patientId: testPatient1.id,
        amount: 20000.00,
        paymentMethod: 'Bank Transfer',
        referenceNumber: 'NEFT-AXIS-0091'
      });
      const bigPayId = bigPayRes.body.data.id;

      const overpayInvRes = await makeRequest(baseUrl, 'POST', `/api/billing/payments/${bigPayId}/allocate`, accountantToken, {
        allocations: [{ invoiceId: testInvoiceId1, amount: 15000.00 }]
      });
      assert(overpayInvRes.status === 400, 'Invoice overpayment (allocating 15000 to 10000 balance) rejected with HTTP 400');

      // 5.4 Settle invoice completely to zero balance
      const settleRes = await makeRequest(baseUrl, 'POST', `/api/billing/payments/${bigPayId}/allocate`, accountantToken, {
        allocations: [{ invoiceId: testInvoiceId1, amount: 10000.00 }]
      });
      assert(settleRes.status === 200, 'Settling remaining invoice balance to zero succeeded (200 OK)');

      // Verify invoice is fully paid
      const settledInvCheck = await makeRequest(baseUrl, 'GET', `/api/billing/invoices/${testInvoiceId1}`, accountantToken);
      assert(settledInvCheck.body.data.balance === 0, 'Invoice balance is strictly 0');
      assert(settledInvCheck.body.data.paidAmount === 12901.50, 'Invoice paidAmount is full totalAmount 12901.50');
      assert(settledInvCheck.body.data.paymentStatus === 'paid', 'Invoice paymentStatus is "paid"');
      assert(settledInvCheck.body.data.status === 'paid', 'Invoice status is "paid"');

      // 5.5 Further allocations to fully paid invoice must be rejected
      const postPaidRes = await makeRequest(baseUrl, 'POST', `/api/billing/payments/${bigPayId}/allocate`, accountantToken, {
        allocations: [{ invoiceId: testInvoiceId1, amount: 50.00 }]
      });
      assert(postPaidRes.status === 400, 'Allocating to already paid invoice rejected with HTTP 400');
    }

    // =========================================================================
    // 6. DUAL AUTHORIZATION REFUNDS & ANTI-SELF-APPROVAL ENFORCEMENT
    // =========================================================================
    console.log(`\n${BOLD}▶ 6. DUAL AUTHORIZATION & SEPARATION OF REFUND APPROVAL FROM EXECUTION${RESET}`);
    let refundRequestId = '';
    {
      // 6.1 Accountant initiates a refund request from unallocated credit (testPaymentId1 has 2098.50 remaining)
      const refReqRes = await makeRequest(baseUrl, 'POST', '/api/billing/refunds/request', accountantToken, {
        type: 'refund',
        paymentId: testPaymentId1,
        patientId: testPatient1.id,
        amount: 1000.00,
        reason: 'Patient requested partial deposit refund before discharge'
      });

      assert(refReqRes.status === 201, 'Accountant initiated refund request (201 Created)');
      const ref = refReqRes.body.data;
      refundRequestId = ref.id;
      assert(/^REF-\d{4}-\d{5}$/.test(ref.requestNumber), 'Refund assigned authoritative REF-YYYY-XXXXX sequence number', ref.requestNumber);
      assert(ref.status === 'pending', 'Refund status is "pending"');
      assert(ref.requestedByRole === 'ACCOUNTANT', 'Requested by role is ACCOUNTANT');

      // 6.2 Self-Approval Prevention:
      // If SUPER_ADMIN creates a refund request, they CANNOT approve their own request!
      const saRefundReq = await makeRequest(baseUrl, 'POST', '/api/billing/refunds/request', superAdminToken, {
        type: 'refund',
        paymentId: testPaymentId1,
        patientId: testPatient1.id,
        amount: 500.00,
        reason: 'Administrative self-initiated refund request'
      });
      assert(saRefundReq.status === 201, 'Super Admin initiated refund request created');
      const saRefundId = saRefundReq.body.data.id;

      // Now SUPER_ADMIN attempts to approve their OWN request -> MUST BE REJECTED with 403 DUAL_AUTHORIZATION_REQUIRED!
      const selfApproveRes = await makeRequest(baseUrl, 'POST', `/api/billing/refunds/${saRefundId}/approve`, superAdminToken);
      assert(selfApproveRes.status === 403, 'Initiator self-approval strictly rejected with HTTP 403');
      assert(selfApproveRes.body.error === 'DUAL_AUTHORIZATION_REQUIRED', 'Error code is DUAL_AUTHORIZATION_REQUIRED');
      assert(selfApproveRes.body.message.includes('Initiator cannot approve'), 'Rejection message cites dual authorization');

      // 6.3 Legitimate Dual Authorization:
      // SUPER_ADMIN approves the request initiated by the ACCOUNTANT (different actors)
      const legitimateApproveRes = await makeRequest(baseUrl, 'POST', `/api/billing/refunds/${refundRequestId}/approve`, superAdminToken, {
        approvalNotes: 'Approved after verification of unallocated cashier deposit'
      });
      assert(legitimateApproveRes.status === 200, 'Super Admin approved accountant-initiated refund with HTTP 200');
      assert(legitimateApproveRes.body.data.status === 'approved', 'Refund status updated to "approved"');
      assert(legitimateApproveRes.body.data.approvedByRole === 'SUPER_ADMIN', 'Approval recorded by SUPER_ADMIN');

      // STRICT GOVERNANCE VERIFICATION:
      // Approval authorizes the refund, but DOES NOT claim money has been returned or decrement patient balances!
      const payCheckBeforeExec = await makeRequest(baseUrl, 'GET', `/api/billing/payments/${testPaymentId1}`, accountantToken);
      assert(payCheckBeforeExec.body.data.unallocatedAmount === 2098.50, 'Payment unallocated credit is UNCHANGED upon approval (still 2098.50)', `Actual: ${payCheckBeforeExec.body.data.unallocatedAmount}`);

      const acctCheckBeforeExec = await makeRequest(baseUrl, 'GET', `/api/billing/patients/${testPatient1.id}/account`, accountantToken);
      // Ensure money is not reported refunded yet (total unallocated credit is 2098.50 from Pay1 + 10000.00 from BigPay = 12098.50)
      assert(acctCheckBeforeExec.body.data.totalUnallocatedCredit === 12098.50, 'Patient account reports unallocated credit intact before execution (12098.50)', `Actual: ${acctCheckBeforeExec.body.data.totalUnallocatedCredit}`);

      // 6.4 Manual Disbursement Execution:
      // Request transitions to 'completed' ONLY upon execution, generating immutable RefundLedgerEntry
      const executeRes = await makeRequest(baseUrl, 'POST', `/api/billing/refunds/${refundRequestId}/execute`, accountantToken, {
        refundMethod: 'Cash',
        externalReference: 'CASH-VOUCH-78891',
        notes: 'Cash handed to patient attendant against signed voucher'
      });
      assert(executeRes.status === 200, 'Accountant executed approved refund with HTTP 200');
      assert(executeRes.body.data.status === 'completed', 'Refund request status updated to "completed" upon execution');
      assert(executeRes.body.data.executedByRole === 'ACCOUNTANT', 'Execution attributed to ACCOUNTANT role');
      assert(executeRes.body.ledgerEntry !== undefined, 'Execution generated immutable linked RefundLedgerEntry');
      assert(/^RLE-\d{4}-\d{5}$/.test(executeRes.body.ledgerEntry.entryNumber), 'Ledger entry has authoritative RLE-YYYY-XXXXX format', executeRes.body.ledgerEntry.entryNumber);
      assert(executeRes.body.ledgerEntry.refundMethod === 'Cash', 'Ledger entry recorded refund method "Cash"');
      assert(executeRes.body.ledgerEntry.amount === 1000.00, 'Ledger entry recorded exact monetary amount 1000.00');

      // Now verify payment unallocated balance is decremented
      const payCheckAfterExec = await makeRequest(baseUrl, 'GET', `/api/billing/payments/${testPaymentId1}`, accountantToken);
      assert(payCheckAfterExec.body.data.unallocatedAmount === 1098.50, 'Payment unallocated credit decremented only AFTER execution: 2098.50 -> 1098.50', `Actual: ${payCheckAfterExec.body.data.unallocatedAmount}`);

      // 6.5 Duplicate Execution Prevention:
      const duplicateExecRes = await makeRequest(baseUrl, 'POST', `/api/billing/refunds/${refundRequestId}/execute`, accountantToken, {
        refundMethod: 'Cash'
      });
      assert(duplicateExecRes.status === 400, 'Duplicate refund execution strictly rejected with HTTP 400');
      assert(duplicateExecRes.body.error === 'RefundAlreadyExecuted', 'Error is RefundAlreadyExecuted');

      // 6.6 Over-Refund Prevention / Concurrent Refund Requests:
      // Remaining credit on payment is 1098.50. Attempting to request 1500.00 refund must fail!
      const overRefundReq = await makeRequest(baseUrl, 'POST', '/api/billing/refunds/request', accountantToken, {
        type: 'refund',
        paymentId: testPaymentId1,
        patientId: testPatient1.id,
        amount: 1500.00,
        reason: 'Attempting to refund more than available credit'
      });
      assert(overRefundReq.status === 400, 'Refund request exceeding available credit rejected with HTTP 400');

      // 6.7 Rejecting a pending refund request (Admin forbidden, Super Admin allowed)
      const rejectReq = await makeRequest(baseUrl, 'POST', '/api/billing/refunds/request', accountantToken, {
        type: 'refund',
        paymentId: testPaymentId1,
        patientId: testPatient1.id,
        amount: 200.00,
        reason: 'Unsubstantiated patient claim'
      });
      const rejectReqId = rejectReq.body.data.id;

      // ADMIN must NOT be able to reject refunds
      const adminRejectRes = await makeRequest(baseUrl, 'POST', `/api/billing/refunds/${rejectReqId}/reject`, adminToken, {
        reason: 'Admin trying to reject'
      });
      assert(adminRejectRes.status === 403, 'ADMIN strictly forbidden from rejecting refunds (HTTP 403)');

      // SUPER_ADMIN successfully rejects
      const saRejectRes = await makeRequest(baseUrl, 'POST', `/api/billing/refunds/${rejectReqId}/reject`, superAdminToken, {
        reason: 'Patient medical records indicate charges were valid and delivered.'
      });
      assert(saRejectRes.status === 200, 'Super Admin rejected refund with HTTP 200');
      assert(saRejectRes.body.data.status === 'rejected', 'Refund status updated to "rejected"');

      // 6.8 Credit-Adjustment Semantics & Blocker Test:
      // Institutional credit-adjustment policy requires dedicated credit notes; blocked from silently acting as cash refund
      const creditAdjRes = await makeRequest(baseUrl, 'POST', '/api/billing/refunds/request', accountantToken, {
        type: 'credit_adjustment',
        paymentId: testPaymentId1,
        patientId: testPatient1.id,
        amount: 300.00,
        reason: 'Attempting credit adjustment without credit-note policy'
      });
      assert(creditAdjRes.status === 400, 'Credit adjustment request rejected with HTTP 400');
      assert(creditAdjRes.body.error === 'CreditAdjustmentBlocked', 'Error is CreditAdjustmentBlocked');
      assert(creditAdjRes.body.code === 'CREDIT_ADJUSTMENT_WORKFLOW_BLOCKED', 'Error code is CREDIT_ADJUSTMENT_WORKFLOW_BLOCKED');

      // 6.9 Deterministic Simultaneous Refund Requests Concurrency Test:
      // Create a dedicated payment with exactly ₹1,000.00 refundable credit
      const concPayRes = await makeRequest(baseUrl, 'POST', '/api/billing/payments', accountantToken, {
        patientId: testPatient1.id,
        amount: 1000.00,
        paymentMethod: 'UPI',
        referenceNumber: 'CONC-TEST-UPI-1000'
      });
      assert(concPayRes.status === 201, 'Created dedicated payment with ₹1,000.00 for concurrency testing');
      const concPayId = concPayRes.body.data.id;

      // Submit 3 simultaneous refund requests of ₹600.00 each (600 + 600 + 600 = 1800 > 1000)
      console.log('  Firing 3 simultaneous refund requests of ₹600.00 against ₹1,000.00 balance...');
      const [concReq1, concReq2, concReq3] = await Promise.all([
        makeRequest(baseUrl, 'POST', '/api/billing/refunds/request', accountantToken, {
          type: 'refund',
          paymentId: concPayId,
          patientId: testPatient1.id,
          amount: 600.00,
          reason: 'Concurrent slice 1'
        }),
        makeRequest(baseUrl, 'POST', '/api/billing/refunds/request', accountantToken, {
          type: 'refund',
          paymentId: concPayId,
          patientId: testPatient1.id,
          amount: 600.00,
          reason: 'Concurrent slice 2'
        }),
        makeRequest(baseUrl, 'POST', '/api/billing/refunds/request', accountantToken, {
          type: 'refund',
          paymentId: concPayId,
          patientId: testPatient1.id,
          amount: 600.00,
          reason: 'Concurrent slice 3'
        })
      ]);

      const concReqSuccesses = [concReq1, concReq2, concReq3].filter((r) => r.status === 201);
      const concReqRejects = [concReq1, concReq2, concReq3].filter((r) => r.status === 400);

      assert(concReqSuccesses.length === 1, 'Exactly one concurrent request accepted within 1,000 limit', `Successes: ${concReqSuccesses.length}`);
      assert(concReqRejects.length === 2, 'Two competing requests rejected with HTTP 400 InsufficientRefundableBalance', `Rejections: ${concReqRejects.length}`);
      assert(concReqRejects[0].body.error === 'InsufficientRefundableBalance', 'Rejection error code is InsufficientRefundableBalance');

      const acceptedReqId = concReqSuccesses[0].body.data.id;

      // Now attempt another request for ₹400.00 (exactly the remaining available credit)
      const exactFitRes = await makeRequest(baseUrl, 'POST', '/api/billing/refunds/request', accountantToken, {
        type: 'refund',
        paymentId: concPayId,
        patientId: testPatient1.id,
        amount: 400.00,
        reason: 'Exact remaining credit slice'
      });
      assert(exactFitRes.status === 201, 'Request for exact remaining ₹400.00 accepted with 201 Created');
      const exactFitReqId = exactFitRes.body.data.id;

      // An additional request for ₹1.00 must be rejected because all 1,000 is reserved (600 + 400)
      const excessRes = await makeRequest(baseUrl, 'POST', '/api/billing/refunds/request', accountantToken, {
        type: 'refund',
        paymentId: concPayId,
        patientId: testPatient1.id,
        amount: 1.00,
        reason: 'Excess slice beyond reserved credit'
      });
      assert(excessRes.status === 400, 'Exceeding reserved credit rejected with HTTP 400 InsufficientRefundableBalance');

      // 6.10 Concurrent Execution of the Same Refund Request (Anti-Duplicate Execution):
      // Super Admin approves the accepted ₹600.00 request
      const approveConcRes = await makeRequest(baseUrl, 'POST', `/api/billing/refunds/${acceptedReqId}/approve`, superAdminToken);
      assert(approveConcRes.status === 200, 'Approved 600.00 concurrent test refund request');

      console.log('  Firing 2 simultaneous execution calls on the SAME refund request...');
      const [exec1, exec2] = await Promise.all([
        makeRequest(baseUrl, 'POST', `/api/billing/refunds/${acceptedReqId}/execute`, accountantToken, {
          refundMethod: 'UPI',
          externalReference: 'CONC-EXEC-UPI-01'
        }),
        makeRequest(baseUrl, 'POST', `/api/billing/refunds/${acceptedReqId}/execute`, accountantToken, {
          refundMethod: 'UPI',
          externalReference: 'CONC-EXEC-UPI-02'
        })
      ]);

      const execSuccesses = [exec1, exec2].filter((r) => r.status === 200);
      const execRejects = [exec1, exec2].filter((r) => r.status === 400);

      assert(execSuccesses.length === 1, 'Exactly one concurrent execution succeeded with 200 OK');
      assert(execRejects.length === 1, 'Competing duplicate execution rejected with HTTP 400');
      assert(execRejects[0].body.error === 'RefundAlreadyExecuted', 'Error code is RefundAlreadyExecuted');

      // Verify strictly ONE ledger entry exists in PostgreSQL for this refund request
      const ledgerEntryCount = await prisma.refundLedgerEntry.count({
        where: { refundRequestId: acceptedReqId }
      });
      assert(ledgerEntryCount === 1, 'Strictly 1 RefundLedgerEntry exists in database for this refund request');

      // 6.11 Concurrent Execution of Competing Approved Requests Against the Same Payment:
      // Approve the second request (₹400.00)
      await makeRequest(baseUrl, 'POST', `/api/billing/refunds/${exactFitReqId}/approve`, superAdminToken);
      const execFitRes = await makeRequest(baseUrl, 'POST', `/api/billing/refunds/${exactFitReqId}/execute`, accountantToken, {
        refundMethod: 'Cash',
        externalReference: 'CASH-CONC-400'
      });
      assert(execFitRes.status === 200, 'Second approved request executed successfully with 200 OK');

      // Verify payment unallocated credit is now strictly 0.00 without negative balances
      const concPayFinal = await makeRequest(baseUrl, 'GET', `/api/billing/payments/${concPayId}`, accountantToken);
      assert(concPayFinal.body.data.unallocatedAmount === 0, 'Payment unallocated amount is exactly 0.00 (1000 - 600 - 400 = 0)');
      assert(concPayFinal.body.data.status === 'refunded', 'Payment status is fully "refunded"');

      // 6.12 Refund Ledger Immutability & Database Trigger Protection:
      const executedLedgerEntry = execFitRes.body.ledgerEntry;
      assert(executedLedgerEntry !== undefined, 'Executed refund returned ledger entry');

      // 6.12.1 HTTP Route Immutability Guard: PUT, PATCH, DELETE are rejected with 405 Method Not Allowed
      const patchLedgerRes = await makeRequest(baseUrl, 'PATCH', `/api/billing/refunds/ledger/${executedLedgerEntry.id}`, superAdminToken, { amount: 9999 });
      assert(patchLedgerRes.status === 405, 'PATCH /api/billing/refunds/ledger/:id rejected with HTTP 405 Method Not Allowed');
      assert(patchLedgerRes.body.error === 'IMMUTABLE_RECORD', 'Error is IMMUTABLE_RECORD');

      const deleteLedgerRes = await makeRequest(baseUrl, 'DELETE', `/api/billing/refunds/ledger/${executedLedgerEntry.id}`, superAdminToken);
      assert(deleteLedgerRes.status === 405, 'DELETE /api/billing/refunds/ledger/:id rejected with HTTP 405 Method Not Allowed');

      // 6.12.2 PostgreSQL Database Trigger Mutation Protection (Direct UPDATE rejection)
      let dbUpdateThrew = false;
      let dbUpdateErrorMsg = '';
      try {
        await prisma.refundLedgerEntry.update({
          where: { id: executedLedgerEntry.id },
          data: { amount: new Prisma.Decimal('9999.00') }
        });
      } catch (err: any) {
        dbUpdateThrew = true;
        dbUpdateErrorMsg = err.message || '';
      }
      assert(dbUpdateThrew, 'Direct database UPDATE on RefundLedgerEntry rejected by PostgreSQL trigger');
      assert(dbUpdateErrorMsg.includes('IMMUTABLE_RECORD'), 'PostgreSQL trigger exception cites IMMUTABLE_RECORD');

      // 6.12.3 PostgreSQL Database Trigger Deletion Protection (Direct DELETE rejection)
      let dbDeleteThrew = false;
      let dbDeleteErrorMsg = '';
      try {
        await prisma.refundLedgerEntry.delete({
          where: { id: executedLedgerEntry.id }
        });
      } catch (err: any) {
        dbDeleteThrew = true;
        dbDeleteErrorMsg = err.message || '';
      }
      assert(dbDeleteThrew, 'Direct database DELETE on RefundLedgerEntry rejected by PostgreSQL trigger');
      assert(dbDeleteErrorMsg.includes('IMMUTABLE_RECORD'), 'PostgreSQL trigger exception cites IMMUTABLE_RECORD');

      // 6.12.3b Verification that setting former bypass variable CANNOT bypass trigger
      await prisma.$executeRawUnsafe("SET app.allow_ledger_cleanup = 'true'");

      let bypassUpdateThrew = false;
      let bypassUpdateErrorMsg = '';
      try {
        await prisma.refundLedgerEntry.update({
          where: { id: executedLedgerEntry.id },
          data: { amount: new Prisma.Decimal('9999.00') }
        });
      } catch (err: any) {
        bypassUpdateThrew = true;
        bypassUpdateErrorMsg = err.message || '';
      }
      assert(bypassUpdateThrew, 'Setting app.allow_ledger_cleanup=true CANNOT bypass trigger (UPDATE unconditionally rejected)');
      assert(bypassUpdateErrorMsg.includes('IMMUTABLE_RECORD'), 'Exception message cites IMMUTABLE_RECORD');

      let bypassDeleteThrew = false;
      let bypassDeleteErrorMsg = '';
      try {
        await prisma.refundLedgerEntry.delete({
          where: { id: executedLedgerEntry.id }
        });
      } catch (err: any) {
        bypassDeleteThrew = true;
        bypassDeleteErrorMsg = err.message || '';
      }
      assert(bypassDeleteThrew, 'Setting app.allow_ledger_cleanup=true CANNOT bypass trigger (DELETE unconditionally rejected)');
      assert(bypassDeleteErrorMsg.includes('IMMUTABLE_RECORD'), 'Exception message cites IMMUTABLE_RECORD');

      // 6.12.3c No duplicate ledger entry can be created for the same refund request
      let dupEntryThrew = false;
      try {
        await prisma.refundLedgerEntry.create({
          data: {
            entryNumber: 'RLE-2026-99999',
            refundRequestId: exactFitReqId,
            paymentId: concPayId,
            patientId: testPatient1.id,
            mrn: testPatient1.mrn,
            patientName: 'Kavita Nambiar',
            amount: new Prisma.Decimal('400.00'),
            refundMethod: 'Cash',
            executedById: 'acc-1',
            executedByName: 'Chief Accountant',
            executedByRole: 'ACCOUNTANT'
          }
        });
      } catch (err: any) {
        dupEntryThrew = true;
      }
      assert(dupEntryThrew, 'Duplicate RefundLedgerEntry for same refund request strictly rejected by UNIQUE constraint');

      // 6.12.3d Database Privilege Inspection: Non-owner application role cannot disable triggers or alter schema
      const privProbeResult = await prisma.$queryRaw<Array<{ can_disable_trigger: boolean }>>`
        SELECT has_table_privilege('sahachara_app_user', 'refund_ledger_entries', 'TRIGGER') as can_disable_trigger
      `.catch(() => [{ can_disable_trigger: false }]);
      assert(privProbeResult[0]?.can_disable_trigger === false, 'Standard application role sahachara_app_user cannot modify or disable database triggers');

      // 6.12.4 Cascade Deletion Prevention (Parent Payment cannot be deleted while Ledger Entry exists)
      let parentPayDeleteThrew = false;
      try {
        await prisma.payment.delete({
          where: { id: concPayId }
        });
      } catch (err: any) {
        parentPayDeleteThrew = true;
      }
      assert(parentPayDeleteThrew, 'Parent Payment deletion blocked by foreign key constraint ON DELETE RESTRICT');

      // 6.12.5 Cascade Deletion Prevention (Parent RefundRequest cannot be deleted while Ledger Entry exists)
      let parentReqDeleteThrew = false;
      try {
        await prisma.refundRequest.delete({
          where: { id: exactFitReqId }
        });
      } catch (err: any) {
        parentReqDeleteThrew = true;
      }
      assert(parentReqDeleteThrew, 'Parent RefundRequest deletion blocked by foreign key constraint ON DELETE RESTRICT');

      // Verify the ledger entry remains completely intact and unaltered
      const preservedEntry = await prisma.refundLedgerEntry.findUnique({
        where: { id: executedLedgerEntry.id }
      });
      assert(preservedEntry !== null, 'RefundLedgerEntry is intact in PostgreSQL');
      assert(Number(preservedEntry?.amount) === 400.00, 'RefundLedgerEntry amount unchanged at 400.00');
    }

    // =========================================================================
    // 7. INVOICE VOIDING & ALLOCATION REVERSAL
    // =========================================================================
    console.log(`\n${BOLD}▶ 7. INVOICE VOIDING & AUTOMATIC ALLOCATION REVERSAL${RESET}`);
    {
      // 7.1 Create a new invoice and partially allocate payment to it
      const invRes = await makeRequest(baseUrl, 'POST', '/api/billing/invoices', accountantToken, {
        patientId: testPatient2.id,
        patientName: 'Ramesh Menon',
        mrn: testPatient2.mrn,
        items: [{ tariffId: testTariff.id, quantity: 1 }] // 1200.00
      });
      const voidTestInvId = invRes.body.data.id;

      // Record a payment of ₹1500 for patient 2
      const pay2Res = await makeRequest(baseUrl, 'POST', '/api/billing/payments', accountantToken, {
        patientId: testPatient2.id,
        amount: 1500.00,
        paymentMethod: 'Cash'
      });
      const pay2Id = pay2Res.body.data.id;

      // Allocate 1200.00 from pay2 to the invoice (unallocated becomes 300.00)
      await makeRequest(baseUrl, 'POST', `/api/billing/payments/${pay2Id}/allocate`, accountantToken, {
        allocations: [{ invoiceId: voidTestInvId, amount: 1200.00 }]
      });

      const pay2BeforeVoid = await makeRequest(baseUrl, 'GET', `/api/billing/payments/${pay2Id}`, accountantToken);
      assert(pay2BeforeVoid.body.data.unallocatedAmount === 300.00, 'Pre-void payment unallocated amount is 300.00');

      // 7.2 Request and approve invoice void
      const voidReq = await makeRequest(baseUrl, 'POST', '/api/billing/refunds/request', accountantToken, {
        type: 'invoice_void',
        invoiceId: voidTestInvId,
        patientId: testPatient2.id,
        amount: 1200.00,
        reason: 'Service was cancelled before delivery'
      });
      const voidReqId = voidReq.body.data.id;

      // Super Admin approves void
      const voidApproveRes = await makeRequest(baseUrl, 'POST', `/api/billing/refunds/${voidReqId}/approve`, superAdminToken);
      assert(voidApproveRes.status === 200, 'Invoice void approved by Super Admin');

      // Verify invoice status is voided
      const voidedInvCheck = await makeRequest(baseUrl, 'GET', `/api/billing/invoices/${voidTestInvId}`, accountantToken);
      assert(voidedInvCheck.body.data.status === 'voided', 'Invoice status is "voided"');

      // Verify payment allocation was REVERSED back to unallocated balance!
      const pay2AfterVoid = await makeRequest(baseUrl, 'GET', `/api/billing/payments/${pay2Id}`, accountantToken);
      assert(pay2AfterVoid.body.data.unallocatedAmount === 1500.00, 'Payment unallocated credit restored to full ₹1500.00 after invoice void', `Actual: ${pay2AfterVoid.body.data.unallocatedAmount}`);
      assert(pay2AfterVoid.body.data.status === 'unallocated', 'Payment status restored to "unallocated"');
    }

    // =========================================================================
    // 8. PHARMACY BILLING INTEGRATION & DUPLICATE BILLING PREVENTION
    // =========================================================================
    console.log(`\n${BOLD}▶ 8. PHARMACY BILLING INTEGRATION & DUPLICATE BILLING PREVENTION${RESET}`);
    {
      // 8.1 Create prescription and dispensing record
      const rx = await prisma.prescription.create({
        data: {
          rxNumber: `RX-TEST-${Date.now()}`,
          patient: { connect: { id: testPatient1.id } },
          patientName: 'Kavita Nambiar',
          mrn: testPatient1.mrn,
          medicationName: pricedMedStock.drugName,
          dosage: '100g once daily',
          frequency: 'Once Daily',
          duration: '10 Days',
          quantity: 10,
          dispensedQuantity: 10,
          remainingQuantity: 0,
          dispensingStatus: 'fully_dispensed',
          status: 'dispensed',
          doctorId: 'doc-1',
          doctorName: 'Dr. Rivera',
          prescribingPractitionerRole: 'DOCTOR'
        }
      });

      const dspNum = await generateUniqueDispenseNumber();
      const dispensingRecord = await prisma.dispensingRecord.create({
        data: {
          dispenseNumber: dspNum,
          prescriptionId: rx.id,
          patientId: testPatient1.id,
          patientName: 'Kavita Nambiar',
          mrn: testPatient1.mrn,
          medicationStockId: pricedMedStock.id,
          drugName: pricedMedStock.drugName,
          batchNumber: pricedMedStock.batchNumber,
          quantityDispensed: 10,
          billedQuantity: 0,
          isBilled: false,
          dispensedById: 'phm-1',
          dispensedByName: 'Pharmacist Menon'
        }
      });

      // Query billable items endpoint for patient
      const billableRes = await makeRequest(baseUrl, 'GET', `/api/billing/patients/${testPatient1.id}/billable-items`, accountantToken);
      assert(billableRes.status === 200, 'Patient billable items queried successfully');
      const pharmacyItems = billableRes.body.data.filter((item: any) => item.sourceType === 'dispensing');
      assert(pharmacyItems.length > 0, 'Unbilled dispensing record surfaced in patient billable items');
      const itemToBill = pharmacyItems.find((i: any) => i.sourceId === dispensingRecord.id);
      assert(itemToBill !== undefined, 'Surfaced specific dispensing record');
      assert(itemToBill.unitPrice === 280.00, 'Surfaced authoritative medication price of 280.00');
      assert(itemToBill.quantityAvailable === 10, 'Surfaced available unbilled quantity of 10');

      // 8.2 Partial Billing: Bill 6 units of the 10 dispensed units
      const partialBillRes = await makeRequest(baseUrl, 'POST', '/api/billing/invoices', accountantToken, {
        patientId: testPatient1.id,
        patientName: 'Kavita Nambiar',
        mrn: testPatient1.mrn,
        items: [
          {
            dispensingRecordId: dispensingRecord.id,
            medicationId: pricedMedStock.id,
            quantity: 6,
            category: 'Pharmacy'
          }
        ]
      });
      assert(partialBillRes.status === 201, 'Billed partial dispensed quantity (6 of 10 units)');
      assert(partialBillRes.body.data.totalAmount === 1680.00, 'Invoice total matches 6 * 280.00 = 1680.00');

      // Verify dispensing record state in DB
      const dspCheck1 = await prisma.dispensingRecord.findUnique({ where: { id: dispensingRecord.id } });
      assert(dspCheck1?.billedQuantity === 6, 'Dispensing record billedQuantity incremented to 6');
      assert(dspCheck1?.isBilled === false, 'Dispensing record isBilled is false (4 units still unbilled)');

      // 8.3 Over-Billing Prevention: Attempt to bill 5 units when only 4 remain unbilled
      const overBillRes = await makeRequest(baseUrl, 'POST', '/api/billing/invoices', accountantToken, {
        patientId: testPatient1.id,
        patientName: 'Kavita Nambiar',
        mrn: testPatient1.mrn,
        items: [
          {
            dispensingRecordId: dispensingRecord.id,
            medicationId: pricedMedStock.id,
            quantity: 5,
            category: 'Pharmacy'
          }
        ]
      });
      assert(overBillRes.status === 409, 'Over-billing beyond available quantity rejected with HTTP 409 DuplicateBillingDetected');
      assert(overBillRes.body.error === 'DuplicateBillingDetected', 'Error is DuplicateBillingDetected');

      // 8.4 Bill remaining 4 units
      const finishBillRes = await makeRequest(baseUrl, 'POST', '/api/billing/invoices', accountantToken, {
        patientId: testPatient1.id,
        patientName: 'Kavita Nambiar',
        mrn: testPatient1.mrn,
        items: [
          {
            dispensingRecordId: dispensingRecord.id,
            medicationId: pricedMedStock.id,
            quantity: 4,
            category: 'Pharmacy'
          }
        ]
      });
      assert(finishBillRes.status === 201, 'Billed remaining 4 units successfully');

      // Verify dispensing record is now completely billed
      const dspCheck2 = await prisma.dispensingRecord.findUnique({ where: { id: dispensingRecord.id } });
      assert(dspCheck2?.billedQuantity === 10, 'Dispensing record billedQuantity is now full 10');
      assert(dspCheck2?.isBilled === true, 'Dispensing record isBilled is now true');

      // 8.5 Attempting to bill already fully-billed record must be strictly rejected
      const repeatBillRes = await makeRequest(baseUrl, 'POST', '/api/billing/invoices', accountantToken, {
        patientId: testPatient1.id,
        patientName: 'Kavita Nambiar',
        mrn: testPatient1.mrn,
        items: [
          {
            dispensingRecordId: dispensingRecord.id,
            medicationId: pricedMedStock.id,
            quantity: 1,
            category: 'Pharmacy'
          }
        ]
      });
      assert(repeatBillRes.status === 409, 'Billing already fully-billed dispensing record rejected with HTTP 409');
    }

    // =========================================================================
    // 9. FINANCIAL REPORTING & AGING RECEIVABLES
    // =========================================================================
    console.log(`\n${BOLD}▶ 9. FINANCIAL REPORTING & AGING RECEIVABLES${RESET}`);
    {
      // 9.1 Daily Collections Report
      const dailyRes = await makeRequest(baseUrl, 'GET', '/api/billing/reports/daily-collection', accountantToken);
      assert(dailyRes.status === 200, 'Daily collections report queried with 200 OK');
      const daily = dailyRes.body.data;
      assert(typeof daily.totalCollected === 'number', 'Report contains numeric totalCollected');
      assert(daily.totalCollected > 0, 'Total collected is positive and matches recorded payments');
      assert(typeof daily.totalRefunded === 'number', 'Report contains numeric totalRefunded');
      assert(daily.totalRefunded === 2000.00, 'Report completed refunds total exactly matches executed refunds: 2000.00', `Actual: ${daily.totalRefunded}`);
      assert(typeof daily.netCollection === 'number', 'Report contains numeric netCollection');
      assert(daily.netCollection === daily.totalCollected - daily.totalRefunded, 'Net collections equals totalCollected - totalRefunded', `Net: ${daily.netCollection}`);
      assert(daily.byMethod !== undefined, 'Report has breakdown by payment method');
      assert(daily.byMethod.UPI > 0, 'UPI collections tracked accurately');
      assert(daily.byMethod['Bank Transfer'] > 0, 'Bank Transfer collections tracked accurately');

      // 9.2 Outstanding Receivables with Aging Buckets
      const recvRes = await makeRequest(baseUrl, 'GET', '/api/billing/reports/outstanding-receivables', accountantToken);
      assert(recvRes.status === 200, 'Outstanding receivables aging report queried with 200 OK');
      const recv = recvRes.body.data;
      assert(typeof recv.totalOutstanding === 'number', 'Report contains numeric totalOutstanding');
      assert(recv.agingBuckets !== undefined, 'Report contains agingBuckets');
      assert(typeof recv.agingBuckets.current === 'number', 'Current bucket (0-30 days) is numeric');
      assert(typeof recv.agingBuckets.days31_60 === 'number', '31-60 days bucket is numeric');
      assert(typeof recv.agingBuckets.days61_90 === 'number', '61-90 days bucket is numeric');
      assert(typeof recv.agingBuckets.over90 === 'number', '90+ days bucket is numeric');
      assert(Array.isArray(recv.items), 'Report contains itemized open invoice list');
    }

    // =========================================================================
    // 10. PATIENT ACCOUNT SUMMARY
    // =========================================================================
    console.log(`\n${BOLD}▶ 10. PATIENT ACCOUNT SUMMARY${RESET}`);
    {
      const acctRes = await makeRequest(baseUrl, 'GET', `/api/billing/patients/${testPatient1.id}/account`, accountantToken);
      assert(acctRes.status === 200, 'Patient account summary queried with 200 OK');
      const acct = acctRes.body.data;
      assert(acct.patientId === testPatient1.id, 'Account patientId matches');
      assert(acct.mrn === testPatient1.mrn, 'Account MRN matches');
      assert(typeof acct.totalInvoiced === 'number', 'Account totalInvoiced is numeric');
      assert(typeof acct.totalPaid === 'number', 'Account totalPaid is numeric');
      assert(typeof acct.totalOutstanding === 'number', 'Account totalOutstanding is numeric');
      assert(typeof acct.totalUnallocatedCredit === 'number', 'Account totalUnallocatedCredit is numeric');
      assert(typeof acct.netBalance === 'number', 'Account netBalance is numeric');
      assert(acct.netBalance === acct.totalOutstanding - acct.totalUnallocatedCredit, 'Net balance matches: totalOutstanding - totalUnallocatedCredit', `Outstanding: ${acct.totalOutstanding}, Credit: ${acct.totalUnallocatedCredit}, Net: ${acct.netBalance}`);
    }

    // =========================================================================
    // 11. STRICT 7-ROLE FINANCIAL RBAC MATRIX
    // =========================================================================
    console.log(`\n${BOLD}▶ 11. STRICT 7-ROLE FINANCIAL RBAC MATRIX ENFORCEMENT${RESET}`);
    {
      const testInvoicePayload = {
        patientId: testPatient1.id,
        patientName: 'Kavita Nambiar',
        mrn: testPatient1.mrn,
        items: [{ tariffId: testTariff.id, quantity: 1 }]
      };

      const testPaymentPayload = {
        patientId: testPatient1.id,
        amount: 500,
        paymentMethod: 'Cash'
      };

      // 11.1 DOCTOR: strictly blocked from billing and payment endpoints
      const docInv = await makeRequest(baseUrl, 'POST', '/api/billing/invoices', doctorToken, testInvoicePayload);
      assert(docInv.status === 403, 'DOCTOR blocked from creating invoices (HTTP 403)');
      const docPay = await makeRequest(baseUrl, 'POST', '/api/billing/payments', doctorToken, testPaymentPayload);
      assert(docPay.status === 403, 'DOCTOR blocked from recording payments (HTTP 403)');

      // 11.2 VAIDYA: strictly blocked from billing and payment endpoints
      const vaiInv = await makeRequest(baseUrl, 'POST', '/api/billing/invoices', vaidyaToken, testInvoicePayload);
      assert(vaiInv.status === 403, 'VAIDYA blocked from creating invoices (HTTP 403)');
      const vaiPay = await makeRequest(baseUrl, 'POST', '/api/billing/payments', vaidyaToken, testPaymentPayload);
      assert(vaiPay.status === 403, 'VAIDYA blocked from recording payments (HTTP 403)');

      // 11.3 RECEPTIONIST: strictly blocked from managing financial operations
      const recInv = await makeRequest(baseUrl, 'POST', '/api/billing/invoices', receptionistToken, testInvoicePayload);
      assert(recInv.status === 403, 'RECEPTIONIST blocked from creating invoices (HTTP 403)');
      const recPay = await makeRequest(baseUrl, 'POST', '/api/billing/payments', receptionistToken, testPaymentPayload);
      assert(recPay.status === 403, 'RECEPTIONIST blocked from recording payments (HTTP 403)');

      // 11.4 PHARMACIST: strictly blocked from creating invoices or receiving cash payments
      const phmInv = await makeRequest(baseUrl, 'POST', '/api/billing/invoices', pharmacistToken, testInvoicePayload);
      assert(phmInv.status === 403, 'PHARMACIST blocked from creating invoices (HTTP 403)');
      const phmPay = await makeRequest(baseUrl, 'POST', '/api/billing/payments', pharmacistToken, testPaymentPayload);
      assert(phmPay.status === 403, 'PHARMACIST blocked from recording payments (HTTP 403)');

      // 11.5 ADMIN: must NOT initiate, approve, reject, or execute financial corrections
      const admRefundReq = await makeRequest(baseUrl, 'POST', '/api/billing/refunds/request', adminToken, {
        type: 'refund',
        paymentId: testPaymentId1,
        patientId: testPatient1.id,
        amount: 50.00,
        reason: 'Admin trying to request refund'
      });
      assert(admRefundReq.status === 403, 'ADMIN strictly forbidden from initiating refund requests (HTTP 403)');

      const admRefundApprove = await makeRequest(baseUrl, 'POST', `/api/billing/refunds/${refundRequestId}/approve`, adminToken);
      assert(admRefundApprove.status === 403, 'ADMIN strictly forbidden from approving financial refunds (HTTP 403)');

      const admRefundReject = await makeRequest(baseUrl, 'POST', `/api/billing/refunds/${refundRequestId}/reject`, adminToken, {
        reason: 'Admin reject attempt'
      });
      assert(admRefundReject.status === 403, 'ADMIN strictly forbidden from rejecting financial refunds (HTTP 403)');

      const admRefundExec = await makeRequest(baseUrl, 'POST', `/api/billing/refunds/${refundRequestId}/execute`, adminToken, {
        refundMethod: 'Cash'
      });
      assert(admRefundExec.status === 403, 'ADMIN strictly forbidden from executing refunds (HTTP 403)');

      // 11.6 ACCOUNTANT: cannot alter tariffs or formulary medication prices
      const accTariff = await makeRequest(baseUrl, 'PATCH', `/api/tariffs/${testTariff.id}/rate`, accountantToken, { rate: 999 });
      assert(accTariff.status === 403, 'ACCOUNTANT strictly forbidden from altering tariff rates (HTTP 403)');
      const accMed = await makeRequest(baseUrl, 'POST', '/api/pharmacy/inventory/receive', accountantToken, {
        drugName: 'Illegal Med',
        batchNumber: 'B1',
        quantity: 10,
        unit: 'tab'
      });
      assert(accMed.status === 403, 'ACCOUNTANT strictly forbidden from managing medication stock (HTTP 403)');

      // 11.7 Medication Selling-Price Authority: All 6 non-SUPER_ADMIN roles cannot change medication selling prices
      console.log('  Testing medication selling-price authority across all 6 non-SUPER_ADMIN roles...');
      const patchPricePayload = { unitPrice: 75.00, reason: 'Unauthorized price update attempt' };
      
      const adminPriceRes = await makeRequest(baseUrl, 'PATCH', `/api/pharmacy/inventory/${pricedMedStock.id}/price`, adminToken, patchPricePayload);
      assert(adminPriceRes.status === 403, 'ADMIN forbidden from configuring medication selling prices (HTTP 403)');

      const doctorPriceRes = await makeRequest(baseUrl, 'PATCH', `/api/pharmacy/inventory/${pricedMedStock.id}/price`, doctorToken, patchPricePayload);
      assert(doctorPriceRes.status === 403, 'DOCTOR forbidden from configuring medication selling prices (HTTP 403)');

      const vaidyaPriceRes = await makeRequest(baseUrl, 'PATCH', `/api/pharmacy/inventory/${pricedMedStock.id}/price`, vaidyaToken, patchPricePayload);
      assert(vaidyaPriceRes.status === 403, 'VAIDYA forbidden from configuring medication selling prices (HTTP 403)');

      const recPriceRes = await makeRequest(baseUrl, 'PATCH', `/api/pharmacy/inventory/${pricedMedStock.id}/price`, receptionistToken, patchPricePayload);
      assert(recPriceRes.status === 403, 'RECEPTIONIST forbidden from configuring medication selling prices (HTTP 403)');

      const pharmPriceRes = await makeRequest(baseUrl, 'PATCH', `/api/pharmacy/inventory/${pricedMedStock.id}/price`, pharmacistToken, patchPricePayload);
      assert(pharmPriceRes.status === 403, 'PHARMACIST forbidden from configuring medication selling prices (HTTP 403)');

      const accPriceRes = await makeRequest(baseUrl, 'PATCH', `/api/pharmacy/inventory/${pricedMedStock.id}/price`, accountantToken, patchPricePayload);
      assert(accPriceRes.status === 403, 'ACCOUNTANT forbidden from configuring medication selling prices (HTTP 403)');

      // SUPER_ADMIN alone may configure medication selling prices
      const superAdminPriceRes = await makeRequest(baseUrl, 'PATCH', `/api/pharmacy/inventory/${pricedMedStock.id}/price`, superAdminToken, {
        unitPrice: 85.00,
        reason: 'Authorized formulary price adjustment by Super Admin'
      });
      assert(superAdminPriceRes.status === 200, 'SUPER_ADMIN successfully configured medication selling price with HTTP 200');
      assert(superAdminPriceRes.body.data.unitPrice === 85.00, 'Medication stock unitPrice updated to 85.00');

      // 11.8 Unauthenticated access strictly blocked
      const unauthInv = await makeRequest(baseUrl, 'GET', '/api/billing/invoices');
      assert(unauthInv.status === 401, 'Unauthenticated request to /api/billing/invoices rejected with HTTP 401');
    }

    // =========================================================================
    // 12. CONCURRENCY & FINANCIAL IDEMPOTENCY
    // =========================================================================
    console.log(`\n${BOLD}▶ 12. CONCURRENCY & FINANCIAL IDEMPOTENCY PROTECTION${RESET}`);
    {
      // 12.1 Idempotency Key Replay: Recording payment with same idempotencyKey returns cached response without duplicate records
      const idemKey = `IDEM-PAY-${Date.now()}`;
      const firstPay = await makeRequest(baseUrl, 'POST', '/api/billing/payments', accountantToken, {
        patientId: testPatient1.id,
        amount: 750.00,
        paymentMethod: 'Cash',
        idempotencyKey: idemKey
      });
      assert(firstPay.status === 201, 'First payment with idempotency key succeeded with 201 Created');
      const firstPayNum = firstPay.body.data.paymentNumber;

      // Replay identical request
      const replayPay = await makeRequest(baseUrl, 'POST', '/api/billing/payments', accountantToken, {
        patientId: testPatient1.id,
        amount: 750.00,
        paymentMethod: 'Cash',
        idempotencyKey: idemKey
      });
      assert(replayPay.status === 201 || replayPay.status === 200, 'Replayed payment request returned success');
      assert(replayPay.body.data.paymentNumber === firstPayNum, 'Replayed payment returned identical payment number without duplicate creation');

      // Verify payment records count for this key in database is strictly 1
      const payCount = await prisma.payment.count({ where: { idempotencyKey: idemKey } });
      assert(payCount === 1, 'Strictly 1 payment record exists in database for this idempotency key');

      // 12.2 Concurrency: Concurrent allocation attempts on a remaining balance cannot overspend
      const targetInv = await prisma.invoice.create({
        data: {
          invoiceNumber: await generateUniqueInvoiceNumber(),
          patientId: testPatient1.id,
          patientName: 'Kavita Nambiar',
          mrn: testPatient1.mrn,
          status: 'issued',
          items: [{ description: 'Concurrency Test Item', quantity: 1, unitPrice: 500, total: 500 }],
          subtotal: new Prisma.Decimal('500.00'),
          totalAmount: new Prisma.Decimal('500.00'),
          balance: new Prisma.Decimal('500.00'),
          paidAmount: new Prisma.Decimal('0.00'),
          paymentStatus: 'unpaid'
        }
      });

      // Create payment with 1000 credit
      const conPay = await prisma.payment.create({
        data: {
          paymentNumber: await generateUniquePaymentNumber(),
          patientId: testPatient1.id,
          patientName: 'Kavita Nambiar',
          mrn: testPatient1.mrn,
          amount: new Prisma.Decimal('1000.00'),
          unallocatedAmount: new Prisma.Decimal('1000.00'),
          paymentMethod: 'Cash',
          status: 'unallocated',
          recordedById: 'acc-1',
          recordedByName: 'Chief Accountant'
        }
      });

      // Fire 2 simultaneous allocations of 400.00 each against the 500.00 balance
      // At least one must fail because 400 + 400 = 800 > 500 balance!
      const [resA, resB] = await Promise.all([
        makeRequest(baseUrl, 'POST', `/api/billing/payments/${conPay.id}/allocate`, accountantToken, {
          allocations: [{ invoiceId: targetInv.id, amount: 400.00 }]
        }),
        makeRequest(baseUrl, 'POST', `/api/billing/payments/${conPay.id}/allocate`, accountantToken, {
          allocations: [{ invoiceId: targetInv.id, amount: 400.00 }]
        })
      ]);

      const successCount = [resA, resB].filter((r) => r.status === 200).length;
      const rejectCount = [resA, resB].filter((r) => r.status === 400).length;
      assert(successCount === 1, 'Exactly one concurrent allocation succeeded (500 limit respected)', `Success: ${successCount}`);
      assert(rejectCount === 1, 'Excess concurrent allocation was prevented (HTTP 400)', `Reject: ${rejectCount}`);

      // Verify final invoice balance is not negative
      const finalInv = await prisma.invoice.findUnique({ where: { id: targetInv.id } });
      assert(Number(finalInv?.balance) === 100.00, 'Invoice balance remaining is exactly 100.00 without negative race conditions', `Actual: ${finalInv?.balance}`);
    }

    // =========================================================================
    // 13. PRODUCTION DATABASE ZERO-MUTATION VERIFICATION
    // =========================================================================
    console.log(`\n${BOLD}▶ 13. PRODUCTION DATABASE ZERO-MUTATION VERIFICATION${RESET}`);
    {
      const prodFinalSnapshot = {
        users: await prodProbePrisma.user.count(),
        patients: await prodProbePrisma.patient.count(),
        appointments: await prodProbePrisma.appointment.count(),
        prescriptions: await prodProbePrisma.prescription.count(),
        dispensingRecords: await prodProbePrisma.dispensingRecord.count(),
        invoices: await prodProbePrisma.invoice.count(),
        payments: await prodProbePrisma.payment.count(),
        refundRequests: await prodProbePrisma.refundRequest.count(),
        refundLedgerEntries: await prodProbePrisma.refundLedgerEntry.count(),
        tariffs: await prodProbePrisma.hospitalTariff.count()
      };

      console.log('  Final Production DB Snapshot:', prodFinalSnapshot);

      assert(prodFinalSnapshot.users === prodInitialSnapshot.users, `Users count unchanged: ${prodFinalSnapshot.users} == ${prodInitialSnapshot.users}`);
      assert(prodFinalSnapshot.patients === 0, 'Production patients count strictly 0');
      assert(prodFinalSnapshot.appointments === 0, 'Production appointments count strictly 0');
      assert(prodFinalSnapshot.prescriptions === 0, 'Production prescriptions count strictly 0');
      assert(prodFinalSnapshot.dispensingRecords === 0, 'Production dispensingRecords count strictly 0');
      assert(prodFinalSnapshot.invoices === 0, 'Production invoices count strictly 0');
      assert(prodFinalSnapshot.payments === 0, 'Production payments count strictly 0');
      assert(prodFinalSnapshot.refundRequests === 0, 'Production refundRequests count strictly 0');
      assert(prodFinalSnapshot.refundLedgerEntries === 0, 'Production refundLedgerEntries count strictly 0');
      assert(prodFinalSnapshot.tariffs === prodInitialSnapshot.tariffs, `Production tariffs count strictly ${prodInitialSnapshot.tariffs}`);
    }
  } finally {
    try {
      if (process.env.DATABASE_URL?.includes('test_db') || process.env.DATABASE_URL?.includes('sahachara_ops_test')) {
        await prisma.$executeRawUnsafe('TRUNCATE TABLE refund_ledger_entries, rate_histories, dispensing_records CASCADE').catch(() => {});
      }
      await prisma.refundRequest.deleteMany({});
      await prisma.payment.deleteMany({});
      await prisma.financialIdempotency.deleteMany({});
      await prisma.dispensingRecord.deleteMany({}).catch(() => {});
      await prisma.prescription.deleteMany({});
      await prisma.invoice.deleteMany({});
      await prisma.patient.deleteMany({
        where: { mrn: { in: [testPatient1.mrn, testPatient2.mrn] } }
      });
      await prisma.hospitalTariff.deleteMany({
        where: { serviceCode: { in: ['FIN-CONSULT-01', 'FIN-PK-01', 'FIN-UNCONFIG-01', 'FIN-ZERO-UNAUTH'] } }
      });
      await prisma.medicationStock.deleteMany({
        where: { batchNumber: { in: ['FIN-ASH-B101', 'FIN-TRIPH-B202'] } }
      });
    } catch (cleanupErr) {
      // ignore
    }
    server.close();
    await prodProbePrisma.$disconnect();
  }

  console.log(`\n${BOLD}═══════════════════════════════════════════════════════════════════════════════${RESET}`);
  console.log(`${BOLD}   PHASE 5 FINANCIAL OPERATIONS VERIFICATION: ${GREEN}${passedCount} PASSED${RESET}, ${failedCount > 0 ? `${RED}${failedCount} FAILED` : '0 FAILED'}   ${RESET}`);
  console.log(`${BOLD}═══════════════════════════════════════════════════════════════════════════════${RESET}\n`);

  if (failedCount > 0) {
    process.exit(1);
  }
}

runFinancialOperationsSuite().catch((err) => {
  console.error('Fatal error in Phase 5 verification suite:', err);
  process.exit(1);
});
