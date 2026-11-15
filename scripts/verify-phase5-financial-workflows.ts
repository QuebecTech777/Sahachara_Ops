/**
 * SAHACHARA OPS — PHASE 5 FINANCIAL WORKFLOWS INDEPENDENT VERIFICATION
 * 
 * Verifies the three distinct financial operations:
 *   Workflow A: Invoice voiding and allocation reversal with therapy/package relationship restoration
 *   Workflow B: Refund request and dual-authorization approval (without premature disbursement)
 *   Workflow C: Actual refund execution and disbursement (with immutable ledger entry)
 * 
 * In addition:
 *   - Duplicate invoicing prevention while financial state is unresolved
 *   - Transactional rollback on invalid refund amounts
 *   - Preservation of clinical history and Panchakarma progression
 * 
 * Execution isolated to sahachara_ops_test_db.
 */

const TEST_DB_URL = process.env.TEST_DATABASE_URL || 'postgresql://highflyer@localhost:5432/sahachara_ops_test_db';
const PROD_DB_URL = process.env.PROD_DATABASE_URL;

process.env.DATABASE_URL = TEST_DB_URL;
process.env.ENABLE_TEST_ACCOUNTS = 'true';
process.env.NODE_ENV = 'test';

import http from 'http';
import express from 'express';
import { PrismaClient } from '@prisma/client';
import { generateSessionToken } from '../server/rbacMiddleware.ts';
import { apiRouter } from '../server/routes.ts';
import { UserRole } from '../src/types/hospital.ts';

const prisma = new PrismaClient({ datasources: { db: { url: TEST_DB_URL } } });
const isCI = process.env.CI === 'true';
const prodProbePrisma = !isCI && PROD_DB_URL && !PROD_DB_URL.includes('test_db')
  ? new PrismaClient({ datasources: { db: { url: PROD_DB_URL } } })
  : null;

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

let passed = 0;
let failed = 0;

function assert(condition: boolean, desc: string, details?: string) {
  if (condition) {
    passed++;
    console.log(`  ${GREEN}✓ PASS${RESET} ${desc}`);
  } else {
    failed++;
    console.error(`  ${RED}✗ FAIL${RESET} ${desc}${details ? ` (${details})` : ''}`);
  }
}

function createRequestSender(baseUrl: string) {
  return async function request(
    method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
    path: string,
    options?: {
      role?: UserRole;
      userId?: string;
      body?: any;
    }
  ): Promise<{ status: number; body: any }> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (options?.role) {
      const user = await prisma.user.findFirst({
        where: { role: options.role as any, status: 'active', isSuspended: false }
      });
      const userId = user?.id || options.userId || `user-${options.role.toLowerCase()}`;
      const email = user?.email || `test_${options.role.toLowerCase()}@sahachara.com`;
      const token = generateSessionToken({
        userId,
        email,
        role: options.role as any,
        name: user?.name || `Test ${options.role}`
      });
      headers['Authorization'] = `Bearer ${token}`;
    }

    return new Promise((resolve, reject) => {
      const url = new URL(path, baseUrl);
      const req = http.request(url, { method, headers }, (res) => {
        let rawData = '';
        res.on('data', (chunk) => { rawData += chunk; });
        res.on('end', () => {
          let body = null;
          try { body = rawData ? JSON.parse(rawData) : {}; } catch { body = { raw: rawData }; }
          resolve({ status: res.statusCode || 500, body });
        });
      });
      req.on('error', reject);
      if (options?.body) req.write(JSON.stringify(options.body));
      req.end();
    });
  };
}

async function main() {
  console.log(`\n${BOLD}========================================================================${RESET}`);
  console.log(`${BOLD}   SAHACHARA OPS — PHASE 5 FINANCIAL WORKFLOWS VERIFICATION SUITE   ${RESET}`);
  console.log(`${BOLD}   Workflows A (Void), B (Approval), C (Disbursement) & Isolation   ${RESET}`);
  console.log(`${BOLD}========================================================================${RESET}\n`);

  // Start Express Test Server
  const app = express();
  app.use(express.json());
  app.use('/api', apiRouter);

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const port = (server.address() as any).port;
  const baseUrl = `http://127.0.0.1:${port}`;
  const request = createRequestSender(baseUrl);

  try {
    // -------------------------------------------------------------------------
    // SECTION 1: PRODUCTION DB FREEZE CHECK
    // -------------------------------------------------------------------------
    console.log(`${BOLD}SECTION 1: Production Database Isolation Verification${RESET}`);
    if (prodProbePrisma) {
      const prodMigrations = await prodProbePrisma.$queryRaw<any[]>`
        SELECT migration_name FROM _prisma_migrations WHERE rolled_back_at IS NULL;
      `;
      assert(prodMigrations.length === 19, `Production db frozen strictly at 19 migrations (Found: ${prodMigrations.length})`);
    } else {
      console.log('  ℹ [SKIPPED] Production database freeze probe skipped: isolated CI/test environment (zero production database access).');
    }

    // Setup Test Patient & Staff in Test DB
    const patientRes = await request('POST', '/api/patients', {
      role: 'RECEPTIONIST',
      body: {
        firstName: 'Nandini',
        lastName: `Varier_${Date.now()}`,
        phone: `+91 98470 ${Date.now().toString().slice(-5)}`,
        dateOfBirth: '1985-04-12',
        gender: 'female'
      }
    });
    assert(patientRes.status === 201, 'Patient created in test database');
    const patient = patientRes.body.data;

    const vaidyaUser = await prisma.user.findFirst({ where: { role: 'VAIDYA', status: 'active' } });

    // Ensure staff member for Vaidya exists
    let vaidyaStaff = await prisma.staffMember.findFirst({ where: { role: 'VAIDYA', isSuspended: false } });
    if (!vaidyaStaff) {
      vaidyaStaff = await prisma.staffMember.create({
        data: {
          employeeId: `EMP-V-${Date.now().toString().slice(-4)}`,
          name: vaidyaUser?.name || 'Dr. Sarah Chen, BAMS',
          designation: 'Chief Ayurvedic Physician',
          department: 'Ayurveda & Panchakarma',
          role: 'VAIDYA',
          email: vaidyaUser?.email || 'sarah.chen@sahachara.com',
          phone: '+91 98470 12345',
          status: 'active'
        }
      });
    }

    // Create an approved therapy room with configured turnaround buffer
    const room = await prisma.therapyRoom.create({
      data: {
        code: `FIN-ROOM-${Date.now().toString().slice(-4)}`,
        name: 'Financial Therapy Suite',
        roomType: 'MASSAGE_DRONI_ROOM',
        bufferMinutes: 15,
        status: 'AVAILABLE',
        isActive: true
      }
    });

    // Grant staff therapy authorization
    await prisma.staffTherapyAuthorization.create({
      data: {
        staffId: vaidyaStaff.id,
        isRevoked: false,
        verifiedById: 'admin-sys',
        verifiedByName: 'Administrator',
        approvedQualification: 'BAMS Classical Panchakarma',
        authorizedTherapyTypes: ['ABHYANGA', 'SWEDANA']
      }
    });

    // Create a Panchakarma Course and Therapy Session
    const course = await prisma.panchakarmaCourse.create({
      data: {
        courseNumber: `PK-FIN-${Date.now().toString().slice(-4)}`,
        patientId: patient.id,
        patientName: `${patient.firstName} ${patient.lastName}`,
        patientMrn: patient.mrn,
        vaidyaName: vaidyaStaff.name,
        responsibleVaidyaId: vaidyaStaff.id,
        protocol: 'Classical Virechana Protocol',
        currentPhase: 'PURVAKARMA',
        startDate: '2026-11-25',
        expectedEndDate: '2026-12-02',
        dietaryPrescription: 'Laghu Ahara, Ushnodaka',
        status: 'Active',
        billingMode: 'PACKAGE_BILLED',
        isPackageBilled: false
      }
    });

    const session = await prisma.therapySession.create({
      data: {
        sessionNumber: 1,
        sessionRef: `SES-FIN-${Date.now().toString().slice(-4)}`,
        patientId: patient.id,
        roomId: room.id,
        roomCodeSnapshot: room.code,
        roomNameSnapshot: room.name,
        administeringStaffId: vaidyaStaff.id,
        responsibleVaidyaId: vaidyaStaff.id,
        scheduledStartAt: new Date('2026-11-25T10:00:00Z'),
        scheduledEndAt: new Date('2026-11-25T11:00:00Z'),
        status: 'COMPLETED',
        billingMode: 'UNBILLED',
        isBilled: false,
        panchakarmaCourseId: course.id
      }
    });

    // -------------------------------------------------------------------------
    // SECTION 2: WORKFLOW A — INVOICE VOIDING & ALLOCATION REVERSAL
    // -------------------------------------------------------------------------
    console.log(`\n${BOLD}SECTION 2: Workflow A — Invoice Voiding, Allocation Reversal & Billing Restoration${RESET}`);

    // Create an approved package tariff
    const packageTariff = await prisma.hospitalTariff.create({
      data: {
        serviceCode: `PK-TRF-${Date.now().toString().slice(-4)}`,
        serviceName: 'Comprehensive Virechana Panchakarma Course (14 Days)',
        category: 'Panchakarma',
        department: 'Ayurveda',
        rate: 15000.00,
        isActive: true
      }
    });

    // Create invoice billing the Panchakarma package
    const pkgInvRes = await request('POST', '/api/billing/invoices', {
      role: 'ACCOUNTANT',
      body: {
        patientId: patient.id,
        items: [
          {
            tariffId: packageTariff.id,
            description: packageTariff.serviceName,
            category: 'Panchakarma',
            quantity: 1,
            unitPrice: 15000.00,
            panchakarmaCourseId: course.id
          }
        ]
      }
    });
    assert(pkgInvRes.status === 201, 'Accountant creates package invoice (HTTP 201)');
    const pkgInvoice = pkgInvRes.body.data;
    assert(Number(pkgInvoice.totalAmount) === 15000.00, 'Invoice total is ₹15,000.00');

    // Verify course atomically linked and marked isPackageBilled = true
    const linkedCourse = await prisma.panchakarmaCourse.findUnique({ where: { id: course.id } });
    assert(linkedCourse?.isPackageBilled === true, 'Panchakarma course atomically marked isPackageBilled = true');
    assert(linkedCourse?.packageInvoiceId === pkgInvoice.id, 'Panchakarma course linked to package invoice ID');

    // Duplicate billing prevention: Attempting to bill the same package course again must be rejected
    const dupBillRes = await request('POST', '/api/billing/invoices', {
      role: 'ACCOUNTANT',
      body: {
        patientId: patient.id,
        items: [
          {
            description: 'Duplicate Attempt',
            category: 'Panchakarma',
            quantity: 1,
            unitPrice: 15000.00,
            panchakarmaCourseId: course.id
          }
        ]
      }
    });
    assert(dupBillRes.status === 400, 'Duplicate billing of active package course strictly rejected (HTTP 400)');

    // Record Cashier Payment for ₹15,000.00
    const payRes = await request('POST', '/api/billing/payments', {
      role: 'ACCOUNTANT',
      body: {
        patientId: patient.id,
        amount: 15000.00,
        paymentMethod: 'UPI',
        referenceNumber: `UPI-FIN-${Date.now()}`
      }
    });
    assert(payRes.status === 201, 'Cashier records payment of ₹15,000.00 (HTTP 201)');
    const payment = payRes.body.data;

    // Allocate payment to invoice
    const allocRes = await request('POST', `/api/billing/payments/${payment.id}/allocate`, {
      role: 'ACCOUNTANT',
      body: {
        allocations: [{ invoiceId: pkgInvoice.id, amount: 15000.00 }]
      }
    });
    assert(allocRes.status === 200, 'Payment allocated to settle invoice (HTTP 200)');

    // Verify invoice marked paid and payment unallocated credit is 0
    const settledInv = await prisma.invoice.findUnique({ where: { id: pkgInvoice.id } });
    assert(settledInv?.status === 'paid' && Number(settledInv.balance) === 0, 'Invoice settled to paid (balance ₹0)');
    const settledPay = await prisma.payment.findUnique({ where: { id: payment.id } });
    assert(Number(settledPay?.unallocatedAmount) === 0, 'Payment unallocated credit fully exhausted (₹0.00)');

    // Accountant requests invoice void
    const voidReqRes = await request('POST', '/api/billing/refunds/request', {
      role: 'ACCOUNTANT',
      body: {
        type: 'invoice_void',
        invoiceId: pkgInvoice.id,
        patientId: patient.id,
        amount: 15000.00,
        reason: 'Incorrect package selection by attendant'
      }
    });
    assert(voidReqRes.status === 201, 'Accountant initiates invoice void request (HTTP 201)');
    const voidReq = voidReqRes.body.data;
    assert(voidReq.status === 'pending', 'Void request created in pending status');

    // While void is pending, duplicate billing remains strictly blocked
    const pendDupRes = await request('POST', '/api/billing/invoices', {
      role: 'ACCOUNTANT',
      body: {
        patientId: patient.id,
        items: [{ description: 'Pending Dup', category: 'Panchakarma', quantity: 1, unitPrice: 15000, panchakarmaCourseId: course.id }]
      }
    });
    assert(pendDupRes.status === 400, 'Billing blocked while original invoice is pending void resolution');

    // Super Admin approves invoice void
    const approveVoidRes = await request('POST', `/api/billing/refunds/${voidReq.id}/approve`, {
      role: 'SUPER_ADMIN',
      body: { approvalNotes: 'Verified clerical error in package tariff selection' }
    });
    assert(approveVoidRes.status === 200, 'SUPER_ADMIN approves invoice void (HTTP 200)');

    // Verify post-void state:
    // 1. Invoice status is voided
    const voidedInv = await prisma.invoice.findUnique({ where: { id: pkgInvoice.id } });
    assert(voidedInv?.status === 'voided', 'Invoice transitioned to voided status in ledger');

    // 2. Payment allocation reversed -> unallocatedAmount restored to full 15,000.00
    const restoredPay = await prisma.payment.findUnique({ where: { id: payment.id } });
    assert(Number(restoredPay?.unallocatedAmount) === 15000.00, 'Payment unallocated credit atomically restored to ₹15,000.00');

    // 3. Panchakarma course isPackageBilled restored to false and packageInvoiceId unlinked
    const restoredCourse = await prisma.panchakarmaCourse.findUnique({ where: { id: course.id } });
    assert(restoredCourse?.isPackageBilled === false, 'Panchakarma course isPackageBilled atomically restored to false');
    assert(restoredCourse?.packageInvoiceId === null, 'Panchakarma course packageInvoiceId atomically unlinked');
    assert(restoredCourse?.currentPhase === 'PURVAKARMA', 'Clinical phase progression strictly preserved after void');

    // -------------------------------------------------------------------------
    // SECTION 3: WORKFLOW B — REFUND REQUEST & DUAL-AUTHORIZATION APPROVAL
    // -------------------------------------------------------------------------
    console.log(`\n${BOLD}SECTION 3: Workflow B — Refund Request & Dual-Authorization Approval${RESET}`);

    // Accountant requests refund of ₹5,000 from the restored unallocated credit (₹15,000)
    const refReqRes = await request('POST', '/api/billing/refunds/request', {
      role: 'ACCOUNTANT',
      body: {
        type: 'refund',
        paymentId: payment.id,
        patientId: patient.id,
        amount: 5000.00,
        reason: 'Patient requested partial deposit return'
      }
    });
    assert(refReqRes.status === 201, 'Accountant initiates ₹5,000 refund request (HTTP 201)');
    const refundReq = refReqRes.body.data;
    assert(refundReq.status === 'pending', 'Refund request starts in pending status');

    // Self-approval anti-pattern: Super Admin creates request and attempts self-approval
    const saReqRes = await request('POST', '/api/billing/refunds/request', {
      role: 'SUPER_ADMIN',
      body: {
        type: 'refund',
        paymentId: payment.id,
        patientId: patient.id,
        amount: 1000.00,
        reason: 'Admin self test'
      }
    });
    const saReq = saReqRes.body.data;
    const selfApproveRes = await request('POST', `/api/billing/refunds/${saReq.id}/approve`, {
      role: 'SUPER_ADMIN',
      body: { approvalNotes: 'Self approval attempt' }
    });
    assert(selfApproveRes.status === 403, 'Super Admin self-approval strictly rejected (HTTP 403 DUAL_AUTHORIZATION_REQUIRED)');

    // Super Admin approves Accountant's request
    const legitimateApproveRes = await request('POST', `/api/billing/refunds/${refundReq.id}/approve`, {
      role: 'SUPER_ADMIN',
      body: { approvalNotes: 'Approved after verification of cashier deposit balance' }
    });
    assert(legitimateApproveRes.status === 200, 'Super Admin approves refund request (HTTP 200)');
    assert(legitimateApproveRes.body.data.status === 'approved', 'Refund request status transitioned to "approved"');

    // STRICT GOVERNANCE VERIFICATION: Approval does NOT disburse money!
    // Payment unallocated amount must REMAIN ₹15,000.00 until execution!
    const payCheckBeforeDisburse = await prisma.payment.findUnique({ where: { id: payment.id } });
    assert(Number(payCheckBeforeDisburse?.unallocatedAmount) === 15000.00, 'Payment unallocated credit strictly unchanged upon approval (still ₹15,000.00)');

    // Verify zero RefundLedgerEntry exists before disbursement
    const ledgerCountBefore = await prisma.refundLedgerEntry.count({ where: { refundRequestId: refundReq.id } });
    assert(ledgerCountBefore === 0, 'Zero RefundLedgerEntry records exist prior to disbursement execution');

    // -------------------------------------------------------------------------
    // SECTION 4: WORKFLOW C — ACTUAL REFUND EXECUTION & DISBURSEMENT
    // -------------------------------------------------------------------------
    console.log(`\n${BOLD}SECTION 4: Workflow C — Actual Refund Execution, Ledger Immutability & Double-Disbursement Prevention${RESET}`);

    // Financial Operator (Accountant) executes the approved refund
    const execRes = await request('POST', `/api/billing/refunds/${refundReq.id}/execute`, {
      role: 'ACCOUNTANT',
      body: {
        refundMethod: 'Bank Transfer',
        externalReference: 'NEFT-RB-8891024',
        notes: 'Transferred to patient savings account via RTGS/NEFT'
      }
    });
    assert(execRes.status === 200, 'Accountant executes approved refund disbursement (HTTP 200)');
    assert(execRes.body.data.status === 'completed', 'Refund request status updated to "completed" upon execution');
    assert(execRes.body.ledgerEntry !== undefined, 'Execution generated immutable linked RefundLedgerEntry');
    assert(/^RLE-\d{4}-\d{5}$/.test(execRes.body.ledgerEntry.entryNumber), 'Ledger entry has authoritative RLE-YYYY-XXXXX sequence');
    assert(Number(execRes.body.ledgerEntry.amount) === 5000.00, 'Ledger entry records exact monetary disbursement ₹5,000.00');
    assert(execRes.body.ledgerEntry.refundMethod === 'Bank Transfer', 'Ledger entry records refundMethod "Bank Transfer"');

    // Verify payment credit is decremented only AFTER execution (15,000 - 5,000 = 10,000)
    const payCheckAfterDisburse = await prisma.payment.findUnique({ where: { id: payment.id } });
    assert(Number(payCheckAfterDisburse?.unallocatedAmount) === 10000.00, 'Payment unallocated credit decremented only AFTER execution (15,000 -> 10,000)');

    // Duplicate execution prevention
    const dupExecRes = await request('POST', `/api/billing/refunds/${refundReq.id}/execute`, {
      role: 'ACCOUNTANT',
      body: { refundMethod: 'Cash' }
    });
    assert(dupExecRes.status === 400, 'Duplicate execution of completed refund strictly rejected with HTTP 400');

    // -------------------------------------------------------------------------
    // SECTION 5: TRANSACTIONAL ROLLBACK & NEGATIVE CREDIT PREVENTION
    // -------------------------------------------------------------------------
    console.log(`\n${BOLD}SECTION 5: Transactional Rollback & Insufficient Balance Rejection${RESET}`);

    // Attempt to request refund of ₹25,000 when only ₹10,000 is available
    const overRefundReq = await request('POST', '/api/billing/refunds/request', {
      role: 'ACCOUNTANT',
      body: {
        type: 'refund',
        paymentId: payment.id,
        patientId: patient.id,
        amount: 25000.00,
        reason: 'Excessive refund attempt'
      }
    });
    assert(overRefundReq.status === 400, 'Refund request exceeding available credit rejected with HTTP 400 (InsufficientRefundableBalance)');

    // Verify payment balance untouched at ₹10,000
    const payCheckFinal = await prisma.payment.findUnique({ where: { id: payment.id } });
    assert(Number(payCheckFinal?.unallocatedAmount) === 10000.00, 'Payment unallocated credit preserved at ₹10,000 after rejected attempt');

    // -------------------------------------------------------------------------
    // SECTION 6: FINAL PRODUCTION DB ZERO-MUTATION VERIFICATION
    // -------------------------------------------------------------------------
    console.log(`\n${BOLD}SECTION 6: Final Production DB Zero-Mutation Verification${RESET}`);
    if (prodProbePrisma) {
      const finalProdMigrations = await prodProbePrisma.$queryRaw<any[]>`
        SELECT migration_name FROM _prisma_migrations WHERE rolled_back_at IS NULL;
      `;
      assert(finalProdMigrations.length === 19, 'Final check: Production migrations strictly preserved at 19');
      const finalProdUsers = await prodProbePrisma.user.count();
      const finalProdInvoices = await prodProbePrisma.invoice.count();
      assert(finalProdUsers === 1, 'Final check: Production users count strictly 1');
      assert(finalProdInvoices === 0, 'Final check: Production invoices count strictly 0');
    } else {
      console.log('  ℹ [SKIPPED] Final production database zero-mutation probe skipped: isolated CI/test environment (zero production database access).');
    }

  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    if (prodProbePrisma) await prodProbePrisma.$disconnect().catch(() => { });
    await prisma.$disconnect();
  }

  console.log(`\n${BOLD}========================================================================${RESET}`);
  console.log(`${BOLD}   PHASE 5 FINANCIAL WORKFLOWS VERIFICATION SUMMARY   ${RESET}`);
  console.log(`${BOLD}========================================================================${RESET}`);
  console.log(`Total Assertions Evaluated : ${passed + failed}`);
  console.log(`Assertions Passed          : ${GREEN}${passed}${RESET}`);
  console.log(`Assertions Failed          : ${failed > 0 ? RED : GREEN}${failed}${RESET}`);
  console.log(`${BOLD}========================================================================${RESET}\n`);

  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error('\nFatal error during financial verification:', err);
  process.exit(1);
});
