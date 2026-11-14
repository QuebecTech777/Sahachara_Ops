/**
 * SAHACHARA OPS — PHASE 4: PHARMACY, MEDICATION INVENTORY & DISPENSING VERIFICATION SUITE
 *
 * Verifies:
 * 1. Target database isolation guard (strictly refuses production database).
 * 2. Fail-closed authoritative sequence generation (DSP-YYYY-XXXXX).
 * 3. Centralized medication inventory catalogue & batch-level granularity.
 * 4. Controlled stock receiving workflow with immutable movement creation.
 * 5. Controlled stock adjustment requiring mandatory non-empty reason.
 * 6. Negative stock prevention on stock adjustments.
 * 7. Immutable stock movement history ledger.
 * 8. Prescription-to-dispensing transactional workflow with DispensingRecord creation.
 * 9. Partial dispensing with remaining quantity tracking.
 * 10. Prescribed quantity ceiling enforcement (EXCEEDS_PRESCRIBED_QUANTITY).
 * 11. Fully dispensed repeat protection (PRESCRIPTION_ALREADY_DISPENSED).
 * 12. FEFO (First Expiry, First Out) automatic batch allocation.
 * 13. Strict rejection of expired medication batches (EXPIRED_STOCK_CANNOT_BE_DISPENSED).
 * 14. 7-Role RBAC dispensary authority and boundaries (Pharmacist vs Clinicians vs Administrative).
 * 15. Price independence (dispensing works with NULL unitPrice, no automatic invoicing).
 * 16. Production database zero-mutation verification (0 records altered or polluted).
 */

import http from 'http';
import express from 'express';
import { PrismaClient } from '@prisma/client';

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
  generateUniqueDispenseNumber,
  isDateExpired
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
  else fail(desc, detail || 'Assertion failed');
}

async function run() {
  console.log(`\n${BOLD}${CYAN}═══════════════════════════════════════════════════════════════════════════════${RESET}`);
  console.log(`${BOLD}${CYAN}   SAHACHARA OPS — PHASE 4: PHARMACY, INVENTORY & DISPENSING VERIFICATION   ${RESET}`);
  console.log(`${BOLD}${CYAN}═══════════════════════════════════════════════════════════════════════════════${RESET}\n`);

  // ── Database Verification Guard
  const isConnected = await checkPrismaConnection();
  if (!isConnected) {
    console.error('FATAL: Test database connection failed. Aborting.');
    process.exit(1);
  }

  const [dbRow] = await prisma.$queryRaw<[{ current_database: string }]>`SELECT current_database()`;
  if (dbRow.current_database !== 'sahachara_ops_test_db') {
    console.error(`FATAL: Connected to "${dbRow.current_database}", expected "sahachara_ops_test_db"`);
    process.exit(1);
  }
  console.log(`${GREEN}✓ Isolated Test Database Connected: ${dbRow.current_database}${RESET}`);

  // Pre-test clean up test database fixtures
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE dispensing_idempotency, dispensing_records, stock_movements, prescriptions, 
                   medication_stock, clinical_vitals, clinical_assessments, clinical_diagnoses, 
                   lab_orders, treatment_plans, panchakarma_courses, clinical_encounters, 
                   appointments, invoices, patients CASCADE;
  `);

  await ensureDefaultDatabaseUsers();

  // Snapshot production database state BEFORE tests run
  const prodInitialState = {
    users: await prodProbePrisma.user.count(),
    patients: await prodProbePrisma.patient.count(),
    appointments: await prodProbePrisma.appointment.count(),
    prescriptions: await prodProbePrisma.prescription.count(),
    dispensingRecords: await prodProbePrisma.dispensingRecord.count(),
    stockMovements: await prodProbePrisma.stockMovement.count(),
    invoices: await prodProbePrisma.invoice.count(),
    tariffs: await prodProbePrisma.hospitalTariff.count()
  };
  console.log(`${CYAN}✓ Production Database Pre-Test State Snapshot:${RESET}`, prodInitialState);

  // Set up ephemeral express app
  const app = express();
  app.use(express.json());
  app.use('/api', apiRouter);

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as any).port;
  const baseUrl = `http://127.0.0.1:${port}/api`;

  // Tokens for all 7 RBAC roles
  const tokens: Record<UserRole, string> = {
    SUPER_ADMIN: generateSessionToken({ userId: 'usr-superadmin', email: 'alexander.wright@sahachara.com', name: 'Alexander Wright', role: 'SUPER_ADMIN' }),
    ADMIN: generateSessionToken({ userId: 'usr-admin', email: 'admin.ops@sahachara.com', name: 'Marcus Sterling', role: 'ADMIN' }),
    DOCTOR: generateSessionToken({ userId: 'usr-doc', email: 'robert.rivera@sahachara.com', name: 'Dr. Robert Rivera', role: 'DOCTOR' }),
    VAIDYA: generateSessionToken({ userId: 'usr-vaidya', email: 'sarah.chen@sahachara.com', name: 'Dr. Sarah Chen', role: 'VAIDYA' }),
    RECEPTIONIST: generateSessionToken({ userId: 'usr-reception', email: 'receptionist@sahachara.com', name: 'Kavita Sharma', role: 'RECEPTIONIST' }),
    PHARMACIST: generateSessionToken({ userId: 'usr-pharma', email: 'pharmacist@sahachara.com', name: 'Pharm. Rajesh Nair', role: 'PHARMACIST' }),
    ACCOUNTANT: generateSessionToken({ userId: 'usr-accountant', email: 'accountant@sahachara.com', name: 'Anand Pillai', role: 'ACCOUNTANT' })
  };

  async function apiCall(method: string, path: string, token: string, body?: any) {
    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: body ? JSON.stringify(body) : undefined
    });
    const json = await res.json().catch(() => null);
    return { status: res.status, json };
  }

  try {
    // =========================================================================
    // SECTION 1: FAIL-CLOSED DISPENSE NUMBER GENERATION
    // =========================================================================
    console.log(`\n${YELLOW}▶ 1. FAIL-CLOSED DISPENSE NUMBER GENERATION (DSP-YYYY-XXXXX)${RESET}`);
    {
      const dsp1 = await generateUniqueDispenseNumber();
      const currentYear = new Date().getFullYear();
      assert(dsp1.startsWith(`DSP-${currentYear}-`), 'Dispense number follows authoritative prefix DSP-YYYY-', dsp1);
      assert(/^DSP-\d{4}-\d{5}$/.test(dsp1), 'Dispense number matches exact regex DSP-YYYY-XXXXX', dsp1);

      const dsp2 = await generateUniqueDispenseNumber();
      assert(dsp1 !== dsp2, 'Successive calls yield strictly incrementing unique numbers', `${dsp1} -> ${dsp2}`);

      // Sequence outage simulation
      await prisma.$executeRawUnsafe(`ALTER SEQUENCE dispensing_seq RENAME TO dispensing_seq_simulated_outage;`);
      let failClosedCaught = false;
      try {
        await generateUniqueDispenseNumber();
      } catch (err: any) {
        failClosedCaught = true;
        assert(err.message.includes('Authoritative sequence generation failed'), 'Sequence failure throws controlled server error, zero random fallback', err.message);
      }
      assert(failClosedCaught, 'Sequence failure immediately halts fail-closed without silent fallback');

      // Restore sequence
      await prisma.$executeRawUnsafe(`ALTER SEQUENCE dispensing_seq_simulated_outage RENAME TO dispensing_seq;`);
      const restoredDsp = await generateUniqueDispenseNumber();
      assert(/^DSP-\d{4}-\d{5}$/.test(restoredDsp), 'Clean recovery after restoring PostgreSQL sequence', restoredDsp);
    }

    // =========================================================================
    // SECTION 2: MEDICATION CATALOGUE & BATCH-LEVEL INVENTORY
    // =========================================================================
    console.log(`\n${YELLOW}▶ 2. MEDICATION CATALOGUE & BATCH-LEVEL INVENTORY${RESET}`);
    {
      // Create test patient
      const patRes = await apiCall('POST', '/patients', tokens.RECEPTIONIST, {
        firstName: 'PharmaTest',
        lastName: 'PatientOne',
        dob: '1975-04-10',
        gender: 'Male',
        phone: '+91-9123456789'
      });
      assert(patRes.status === 201, 'Test patient created successfully', patRes.json?.data?.mrn);
      const testPatient = patRes.json.data;

      // Create two distinct batches for the same drug
      await prisma.medicationStock.deleteMany({ where: { drugName: 'Sahacharadi Kwatham' } });

      // Batch 1: Expiring in 2027 (Earlier)
      const stock1 = await prisma.medicationStock.create({
        data: {
          drugName: 'Sahacharadi Kwatham',
          genericName: 'Strobilanthes Ciliatus Decoction',
          category: 'Kashayam & Kwatha (Decoctions)',
          form: 'Syrup',
          strength: '200ml',
          stockQuantity: 30,
          unit: 'bottles',
          minThreshold: 10,
          reorderThreshold: 15,
          manufacturer: 'Kerala Ayurveda Ltd',
          batchNumber: 'SK-2027-B01',
          expiryDate: '2027-06-30',
          storageInfo: 'Store in cool dry place',
          unitPrice: null, // Nullable per hospital policy
          isActive: true,
          status: 'in_stock'
        }
      });

      // Batch 2: Expiring in 2029 (Later)
      const stock2 = await prisma.medicationStock.create({
        data: {
          drugName: 'Sahacharadi Kwatham',
          genericName: 'Strobilanthes Ciliatus Decoction',
          category: 'Kashayam & Kwatha (Decoctions)',
          form: 'Syrup',
          strength: '200ml',
          stockQuantity: 50,
          unit: 'bottles',
          minThreshold: 10,
          reorderThreshold: 15,
          manufacturer: 'Kerala Ayurveda Ltd',
          batchNumber: 'SK-2029-B02',
          expiryDate: '2029-12-31',
          storageInfo: 'Store in cool dry place',
          unitPrice: null,
          isActive: true,
          status: 'in_stock'
        }
      });

      assert(Boolean(stock1.id && stock2.id), 'Two distinct batches created for Sahacharadi Kwatham');
      assert(stock1.batchNumber !== stock2.batchNumber, 'Batches have distinct lot numbers');
      assert(stock1.expiryDate !== stock2.expiryDate, 'Batches have distinct expiration dates');

      // Query inventory
      const invRes = await apiCall('GET', '/pharmacy/inventory?search=Sahacharadi', tokens.PHARMACIST);
      assert(invRes.status === 200, 'Pharmacist retrieves inventory directory', `Count: ${invRes.json?.data?.length}`);
      const foundBatches = invRes.json.data.filter((b: any) => b.drugName === 'Sahacharadi Kwatham');
      assert(foundBatches.length === 2, 'Inventory returns both distinct batches for the medication');
    }

    // =========================================================================
    // SECTION 3: CONTROLLED STOCK RECEIVING WORKFLOW
    // =========================================================================
    console.log(`\n${YELLOW}▶ 3. CONTROLLED STOCK RECEIVING WORKFLOW${RESET}`);
    {
      const receiveRes = await apiCall('POST', '/pharmacy/inventory/receive', tokens.PHARMACIST, {
        drugName: 'Ksheerabala Thailam',
        genericName: 'Sida Cordifolia high-potency oil',
        category: 'Ayurvedic Oil / Thailam',
        form: 'Oil / Liquid',
        strength: '100ml',
        batchNumber: 'KB-2028-B05',
        expiryDate: '2028-10-31',
        quantity: 40,
        unit: 'bottles',
        minThreshold: 15,
        reorderThreshold: 20,
        manufacturer: 'Vaidyaratnam Oushadhasala',
        storageInfo: 'Store below 25°C',
        notes: 'Initial consignment receipt under PO-88412'
      });

      assert(receiveRes.status === 201, 'Stock receiving succeeded with HTTP 201', `Batch: ${receiveRes.json?.data?.batchNumber}`);
      assert(receiveRes.json?.data?.stockQuantity === 40, 'Stock quantity correctly initialized to 40');

      // Verify immutable stock movement
      const moveRes = await apiCall('GET', '/pharmacy/inventory/movements?batchNumber=KB-2028-B05', tokens.PHARMACIST);
      assert(moveRes.status === 200, 'Retrieved stock movements for received batch');
      const receiptMove = moveRes.json.data.find((m: any) => m.type === 'Receipt');
      assert(Boolean(receiptMove), 'Immutable StockMovement of type "Receipt" recorded in database');
      assert(receiptMove?.quantityDelta === 40, 'Movement recorded positive quantity delta +40');
      assert(receiptMove?.actor === 'Pharm. Rajesh Nair', 'Movement authenticated to receiving Pharmacist');
    }

    // =========================================================================
    // SECTION 4: CONTROLLED STOCK ADJUSTMENT & MANDATORY REASON
    // =========================================================================
    console.log(`\n${YELLOW}▶ 4. CONTROLLED STOCK ADJUSTMENT & REASON ENFORCEMENT${RESET}`);
    {
      const stockItem = await prisma.medicationStock.findFirst({
        where: { batchNumber: 'KB-2028-B05' }
      });
      assert(Boolean(stockItem), 'Found test stock item for adjustment');

      // 4.1 Missing reason must fail
      const noReasonRes = await apiCall('POST', '/pharmacy/inventory/adjust', tokens.PHARMACIST, {
        stockId: stockItem!.id,
        adjustmentType: 'Audit Adjustment',
        quantityDelta: -5
      });
      assert(noReasonRes.status === 400, 'Adjustment without reason is rejected with HTTP 400');
      assert(noReasonRes.json?.error === 'REASON_REQUIRED', 'Error code is explicitly REASON_REQUIRED');

      // 4.2 Empty whitespace reason must fail
      const emptyReasonRes = await apiCall('POST', '/pharmacy/inventory/adjust', tokens.PHARMACIST, {
        stockId: stockItem!.id,
        adjustmentType: 'Audit Adjustment',
        quantityDelta: -5,
        reason: '     '
      });
      assert(emptyReasonRes.status === 400, 'Adjustment with whitespace reason is rejected with HTTP 400');
      assert(emptyReasonRes.json?.error === 'REASON_REQUIRED', 'Error code is explicitly REASON_REQUIRED');

      // 4.3 Valid adjustment with reason
      const validAdjRes = await apiCall('POST', '/pharmacy/inventory/adjust', tokens.PHARMACIST, {
        stockId: stockItem!.id,
        adjustmentType: 'Audit Adjustment',
        quantityDelta: -5,
        reason: 'Physical cycle count discrepancy adjustment verified by Chief Pharmacist',
        notes: 'Shelf inventory verified: 35 counted vs 40 logged'
      });
      assert(validAdjRes.status === 200, 'Valid stock adjustment accepted with HTTP 200');
      assert(validAdjRes.json?.data?.stockQuantity === 35, 'Stock quantity updated: 40 -> 35');

      // Verify movement recorded
      const movements = await apiCall('GET', '/pharmacy/inventory/movements?batchNumber=KB-2028-B05', tokens.PHARMACIST);
      const adjMovement = movements.json.data.find((m: any) => m.type === 'Audit Adjustment');
      assert(Boolean(adjMovement), 'StockMovement recorded for Audit Adjustment');
      assert(adjMovement?.quantityDelta === -5, 'Movement records delta -5');
      assert(adjMovement?.reason?.includes('Physical cycle count discrepancy'), 'Immutable movement persists mandatory reason text');
    }

    // =========================================================================
    // SECTION 5: NEGATIVE STOCK PREVENTION
    // =========================================================================
    console.log(`\n${YELLOW}▶ 5. NEGATIVE STOCK PREVENTION${RESET}`);
    {
      const stockItem = await prisma.medicationStock.findFirst({
        where: { batchNumber: 'KB-2028-B05' }
      });
      const currentQty = stockItem!.stockQuantity; // 35

      // Attempt to decrement 50 when only 35 in stock
      const negRes = await apiCall('POST', '/pharmacy/inventory/adjust', tokens.PHARMACIST, {
        stockId: stockItem!.id,
        adjustmentType: 'Audit Adjustment',
        quantityDelta: -50,
        reason: 'Attempted oversized deduction to test boundary guard'
      });

      assert(negRes.status === 400, 'Oversized deduction rejected with HTTP 400');
      assert(negRes.json?.error === 'NEGATIVE_STOCK_PREVENTED', 'Error code is explicitly NEGATIVE_STOCK_PREVENTED');

      // Confirm stock was not modified
      const stockAfter = await prisma.medicationStock.findUnique({ where: { id: stockItem!.id } });
      assert(stockAfter?.stockQuantity === currentQty, 'Stock quantity remained untouched at 35 units');
    }

    // =========================================================================
    // SECTION 6: PRESCRIPTION DISPENSING, SEQUENTIAL AUDIT & STOCK DECREMENT
    // =========================================================================
    console.log(`\n${YELLOW}▶ 6. PRESCRIPTION DISPENSING WORKFLOW & ATOMIC AUDIT${RESET}`);
    {
      const patient = await prisma.patient.findFirst({ orderBy: { createdAt: 'desc' } });

      // VAIDYA prescribes 10 bottles of Ksheerabala Thailam
      const rxRes = await apiCall('POST', '/pharmacy/prescriptions', tokens.VAIDYA, {
        patientId: patient!.id,
        patientName: `${patient!.firstName} ${patient!.lastName}`,
        mrn: patient!.mrn,
        medicationName: 'Ksheerabala Thailam',
        dosage: '10ml daily for external abhyanga',
        frequency: 'Once Daily (OD)',
        route: 'Topical',
        duration: '10 days',
        quantity: 10,
        instructions: 'Warm gently before application'
      });

      assert(rxRes.status === 201, 'Prescription created successfully by VAIDYA', rxRes.json?.data?.rxNumber);
      const rx = rxRes.json.data;
      assert(rx.quantity === 10, 'Prescription records prescribed quantity = 10');
      assert(rx.remainingQuantity === 10, 'Prescription starts with remainingQuantity = 10');
      assert(rx.dispensedQuantity === 0, 'Prescription starts with dispensedQuantity = 0');
      assert(rx.dispensingStatus === 'pending', 'Prescription starts with dispensingStatus = "pending"');

      // Check prescription queue
      const queueRes = await apiCall('GET', '/pharmacy/prescriptions/queue', tokens.PHARMACIST);
      assert(queueRes.status === 200, 'Pharmacist retrieves prescription queue');
      const inQueue = queueRes.json.data.find((p: any) => p.id === rx.id);
      assert(Boolean(inQueue), 'Created prescription appears in pharmacy queue');
      assert(Boolean(inQueue?.availableBatches?.length > 0), 'Queue enriches prescription with available non-expired stock batches');

      // Dispense 10 units
      const stockBefore = await prisma.medicationStock.findFirst({ where: { batchNumber: 'KB-2028-B05' } });
      const qtyBefore = stockBefore!.stockQuantity; // 35

      const dispenseRes = await apiCall('POST', `/pharmacy/prescriptions/${rx.id}/dispense`, tokens.PHARMACIST, {
        quantityToDispense: 10,
        stockId: stockBefore!.id,
        pharmacyNotes: 'Dispensed full 10-day course with warm oil instruction card'
      });

      assert(dispenseRes.status === 200, 'Dispensing succeeded with HTTP 200');
      const updatedRx = dispenseRes.json.data;
      assert(updatedRx.dispensingStatus === 'fully_dispensed', 'Prescription status updated to "fully_dispensed"');
      assert(updatedRx.dispensedQuantity === 10, 'Prescription dispensedQuantity updated to 10');
      assert(updatedRx.remainingQuantity === 0, 'Prescription remainingQuantity updated to 0');
      assert(updatedRx.status === 'dispensed', 'Overall status updated to "dispensed"');

      // Verify stock decremented
      const stockAfter = await prisma.medicationStock.findUnique({ where: { id: stockBefore!.id } });
      assert(stockAfter?.stockQuantity === qtyBefore - 10, `Stock decremented: ${qtyBefore} -> ${stockAfter?.stockQuantity}`);

      // Verify sequence-backed DispensingRecord created
      const dispRecord = await prisma.dispensingRecord.findFirst({
        where: { prescriptionId: rx.id }
      });
      assert(Boolean(dispRecord), 'Immutable DispensingRecord persisted in database');
      assert(/^DSP-\d{4}-\d{5}$/.test(dispRecord!.dispenseNumber), 'DispensingRecord assigned sequence DSP-YYYY-XXXXX', dispRecord?.dispenseNumber);
      assert(dispRecord?.patientName === rx.patientName, 'DispensingRecord links patient name');
      assert(dispRecord?.mrn === rx.mrn, 'DispensingRecord links MRN');
      assert(dispRecord?.quantityDispensed === 10, 'DispensingRecord records quantityDispensed = 10');
      assert(dispRecord?.batchNumber === 'KB-2028-B05', 'DispensingRecord links batch number');
      assert(dispRecord?.dispensedByName === 'Pharm. Rajesh Nair', 'DispensingRecord records dispensing pharmacist identity');
    }

    // =========================================================================
    // SECTION 7: PARTIAL DISPENSING & REMAINING QUANTITY CEILING
    // =========================================================================
    console.log(`\n${YELLOW}▶ 7. PARTIAL DISPENSING & PRESCRIBED CEILING ENFORCEMENT${RESET}`);
    {
      const patient = await prisma.patient.findFirst();

      // Create prescription for 15 bottles
      const rxRes = await apiCall('POST', '/pharmacy/prescriptions', tokens.VAIDYA, {
        patientId: patient!.id,
        patientName: `${patient!.firstName} ${patient!.lastName}`,
        mrn: patient!.mrn,
        medicationName: 'Sahacharadi Kwatham',
        dosage: '15ml twice daily',
        frequency: 'Twice Daily (BD)',
        route: 'Oral',
        duration: '15 days',
        quantity: 15
      });
      const rx = rxRes.json.data;
      assert(rx.quantity === 15, 'Created prescription for 15 units');

      // 7.1 First partial dispense: 5 units
      const part1Res = await apiCall('POST', `/pharmacy/prescriptions/${rx.id}/dispense`, tokens.PHARMACIST, {
        quantityToDispense: 5,
        pharmacyNotes: 'First partial installment: 5 bottles provided'
      });
      assert(part1Res.status === 200, 'Partial dispense of 5 units accepted');
      assert(part1Res.json.data.dispensingStatus === 'partially_dispensed', 'Status is "partially_dispensed"');
      assert(part1Res.json.data.dispensedQuantity === 5, 'dispensedQuantity = 5');
      assert(part1Res.json.data.remainingQuantity === 10, 'remainingQuantity = 10');

      // 7.2 Attempt to over-dispense: try to dispense 12 units when only 10 remain
      const overRes = await apiCall('POST', `/pharmacy/prescriptions/${rx.id}/dispense`, tokens.PHARMACIST, {
        quantityToDispense: 12
      });
      assert(overRes.status === 400, 'Over-dispensing (12 > 10 remaining) rejected with HTTP 400');
      assert(overRes.json?.error === 'EXCEEDS_PRESCRIBED_QUANTITY', 'Error is explicitly EXCEEDS_PRESCRIBED_QUANTITY');

      // 7.3 Second partial dispense: 6 units
      const part2Res = await apiCall('POST', `/pharmacy/prescriptions/${rx.id}/dispense`, tokens.PHARMACIST, {
        quantityToDispense: 6,
        pharmacyNotes: 'Second installment: 6 bottles provided'
      });
      assert(part2Res.status === 200, 'Second partial dispense of 6 units accepted');
      assert(part2Res.json.data.dispensedQuantity === 11, 'Cumulative dispensedQuantity = 11');
      assert(part2Res.json.data.remainingQuantity === 4, 'remainingQuantity = 4');

      // 7.4 Final dispense: remaining 4 units
      const part3Res = await apiCall('POST', `/pharmacy/prescriptions/${rx.id}/dispense`, tokens.PHARMACIST, {
        quantityToDispense: 4,
        pharmacyNotes: 'Final installment: 4 bottles provided'
      });
      assert(part3Res.status === 200, 'Final partial dispense of 4 units accepted');
      assert(part3Res.json.data.dispensingStatus === 'fully_dispensed', 'Prescription transitions to "fully_dispensed"');
      assert(part3Res.json.data.dispensedQuantity === 15, 'Cumulative dispensedQuantity = 15');
      assert(part3Res.json.data.remainingQuantity === 0, 'remainingQuantity = 0');

      // 7.5 Attempt to dispense again on fully dispensed prescription
      const repeatRes = await apiCall('POST', `/pharmacy/prescriptions/${rx.id}/dispense`, tokens.PHARMACIST, {
        quantityToDispense: 1
      });
      assert(repeatRes.status === 400, 'Repeat dispense on fully dispensed prescription rejected with HTTP 400');
      assert(repeatRes.json?.error === 'PRESCRIPTION_ALREADY_DISPENSED', 'Error is explicitly PRESCRIPTION_ALREADY_DISPENSED');

      // Verify dispensing records count
      const records = await prisma.dispensingRecord.findMany({ where: { prescriptionId: rx.id } });
      assert(records.length === 3, 'Exactly 3 sequential DispensingRecords created for 3 partial dispenses', `Count: ${records.length}`);
    }

    // =========================================================================
    // SECTION 8: FEFO (FIRST EXPIRY, FIRST OUT) BATCH ALLOCATION
    // =========================================================================
    console.log(`\n${YELLOW}▶ 8. FEFO (FIRST EXPIRY, FIRST OUT) BATCH ALLOCATION${RESET}`);
    {
      const patient = await prisma.patient.findFirst();

      // We have Sahacharadi Kwatham:
      // Batch 1 (SK-2027-B01): exp 2027-06-30 (earlier)
      // Batch 2 (SK-2029-B02): exp 2029-12-31 (later)
      const b1Before = await prisma.medicationStock.findFirst({ where: { batchNumber: 'SK-2027-B01' } });
      const b2Before = await prisma.medicationStock.findFirst({ where: { batchNumber: 'SK-2029-B02' } });

      const rxRes = await apiCall('POST', '/pharmacy/prescriptions', tokens.VAIDYA, {
        patientId: patient!.id,
        patientName: `${patient!.firstName} ${patient!.lastName}`,
        mrn: patient!.mrn,
        medicationName: 'Sahacharadi Kwatham',
        dosage: '10ml',
        frequency: 'OD',
        route: 'Oral',
        duration: '5 days',
        quantity: 5
      });
      const rx = rxRes.json.data;

      // Auto-FEFO dispense (no stockId specified)
      const fefoRes = await apiCall('POST', `/pharmacy/prescriptions/${rx.id}/dispense`, tokens.PHARMACIST, {
        quantityToDispense: 5
      });
      assert(fefoRes.status === 200, 'Auto-FEFO dispense succeeded');

      const b1After = await prisma.medicationStock.findFirst({ where: { batchNumber: 'SK-2027-B01' } });
      const b2After = await prisma.medicationStock.findFirst({ where: { batchNumber: 'SK-2029-B02' } });

      assert(b1After!.stockQuantity === b1Before!.stockQuantity - 5, 'Earliest expiring batch (2027) decremented first under FEFO', `${b1Before?.stockQuantity} -> ${b1After?.stockQuantity}`);
      assert(b2After!.stockQuantity === b2Before!.stockQuantity, 'Later expiring batch (2029) remained untouched', `${b2Before?.stockQuantity} == ${b2After?.stockQuantity}`);
    }

    // =========================================================================
    // SECTION 9: EXPIRED MEDICATION BATCH REJECTION
    // =========================================================================
    console.log(`\n${YELLOW}▶ 9. STRICT PROHIBITION ON EXPIRED STOCK DISPENSING${RESET}`);
    {
      const patient = await prisma.patient.findFirst();

      // Create an expired stock batch
      const expiredStock = await prisma.medicationStock.create({
        data: {
          drugName: 'Expired Herb Decoction Test',
          genericName: 'Expired Herbal Formula',
          category: 'Kashayam',
          form: 'Syrup',
          stockQuantity: 20,
          unit: 'bottles',
          minThreshold: 5,
          batchNumber: 'EXP-2024-B99',
          expiryDate: '2024-01-01', // Expired
          unitPrice: null,
          isActive: true,
          status: 'expired'
        }
      });
      assert(isDateExpired(expiredStock.expiryDate), 'Helper verifies batch is past expiration date');

      // Create prescription for this medication
      const rxRes = await apiCall('POST', '/pharmacy/prescriptions', tokens.VAIDYA, {
        patientId: patient!.id,
        patientName: `${patient!.firstName} ${patient!.lastName}`,
        mrn: patient!.mrn,
        medicationName: 'Expired Herb Decoction Test',
        dosage: '10ml',
        frequency: 'OD',
        route: 'Oral',
        duration: '3 days',
        quantity: 3
      });
      const rx = rxRes.json.data;

      // 9.1 Explicit selection of expired batch must fail
      const explicitExpRes = await apiCall('POST', `/pharmacy/prescriptions/${rx.id}/dispense`, tokens.PHARMACIST, {
        quantityToDispense: 3,
        stockId: expiredStock.id
      });
      assert(explicitExpRes.status === 400, 'Explicit dispensing of expired batch strictly rejected with HTTP 400');
      assert(explicitExpRes.json?.error === 'EXPIRED_STOCK_CANNOT_BE_DISPENSED', 'Error is explicitly EXPIRED_STOCK_CANNOT_BE_DISPENSED');

      // 9.2 Auto-FEFO on expired stock must fail if no non-expired stock exists
      const autoExpRes = await apiCall('POST', `/pharmacy/prescriptions/${rx.id}/dispense`, tokens.PHARMACIST, {
        quantityToDispense: 3
      });
      assert(autoExpRes.status === 400, 'Auto-FEFO dispensing strictly rejects when only expired stock exists');
      assert(autoExpRes.json?.error === 'EXPIRED_STOCK_CANNOT_BE_DISPENSED', 'Error is explicitly EXPIRED_STOCK_CANNOT_BE_DISPENSED');

      // Verify stock was not decremented
      const checkStock = await prisma.medicationStock.findUnique({ where: { id: expiredStock.id } });
      assert(checkStock?.stockQuantity === 20, 'Expired batch quantity remained untouched at 20');
    }

    // =========================================================================
    // SECTION 10: 7-ROLE RBAC DISPENSARY BOUNDARIES
    // =========================================================================
    console.log(`\n${YELLOW}▶ 10. 7-ROLE RBAC DISPENSARY AUTHORITY & BOUNDARIES${RESET}`);
    {
      const patient = await prisma.patient.findFirst();

      // Setup a valid prescription to test dispensing authority (authored by VAIDYA)
      const rxRes = await apiCall('POST', '/pharmacy/prescriptions', tokens.VAIDYA, {
        patientId: patient!.id,
        patientName: `${patient!.firstName} ${patient!.lastName}`,
        mrn: patient!.mrn,
        medicationName: 'Sahacharadi Kwatham',
        dosage: '10ml',
        frequency: 'OD',
        route: 'Oral',
        duration: '2 days',
        quantity: 2
      });
      const rx = rxRes.json.data;

      // 10.1 PHARMACIST CANNOT create clinical prescriptions
      const pharmaPrescribeRes = await apiCall('POST', '/pharmacy/prescriptions', tokens.PHARMACIST, {
        patientId: patient!.id,
        patientName: `${patient!.firstName} ${patient!.lastName}`,
        mrn: patient!.mrn,
        medicationName: 'Sahacharadi Kwatham',
        dosage: '10ml',
        frequency: 'OD',
        route: 'Oral',
        duration: '5 days',
        quantity: 5
      });
      assert(pharmaPrescribeRes.status === 403, 'PHARMACIST is forbidden from creating clinical prescriptions (HTTP 403)');

      // 10.2 SUPER_ADMIN and ADMIN CANNOT dispense medications
      const superAdminDispenseRes = await apiCall('POST', `/pharmacy/prescriptions/${rx.id}/dispense`, tokens.SUPER_ADMIN, {
        quantityToDispense: 1
      });
      assert(superAdminDispenseRes.status === 403, 'SUPER_ADMIN is forbidden from dispensing medication (HTTP 403)');

      const adminDispenseRes = await apiCall('POST', `/pharmacy/prescriptions/${rx.id}/dispense`, tokens.ADMIN, {
        quantityToDispense: 1
      });
      assert(adminDispenseRes.status === 403, 'ADMIN is forbidden from dispensing medication (HTTP 403)');

      // 10.3 DOCTOR CANNOT dispense medications
      const docDispenseRes = await apiCall('POST', `/pharmacy/prescriptions/${rx.id}/dispense`, tokens.DOCTOR, {
        quantityToDispense: 1
      });
      assert(docDispenseRes.status === 403, 'DOCTOR is forbidden from dispensing medication (HTTP 403)');

      // 10.4 VAIDYA CANNOT dispense medications
      const vaidyaDispenseRes = await apiCall('POST', `/pharmacy/prescriptions/${rx.id}/dispense`, tokens.VAIDYA, {
        quantityToDispense: 1
      });
      assert(vaidyaDispenseRes.status === 403, 'VAIDYA is forbidden from dispensing medication (HTTP 403)');

      // 10.5 RECEPTIONIST CANNOT dispense medications
      const recepDispenseRes = await apiCall('POST', `/pharmacy/prescriptions/${rx.id}/dispense`, tokens.RECEPTIONIST, {
        quantityToDispense: 1
      });
      assert(recepDispenseRes.status === 403, 'RECEPTIONIST is forbidden from dispensing medication (HTTP 403)');

      // 10.6 ACCOUNTANT CANNOT dispense medications
      const acctDispenseRes = await apiCall('POST', `/pharmacy/prescriptions/${rx.id}/dispense`, tokens.ACCOUNTANT, {
        quantityToDispense: 1
      });
      assert(acctDispenseRes.status === 403, 'ACCOUNTANT is forbidden from dispensing medication (HTTP 403)');

      // 10.7 Stock adjustments restricted: SUPER_ADMIN, ADMIN, DOCTOR, VAIDYA, RECEPTIONIST, ACCOUNTANT blocked
      const targetStock = await prisma.medicationStock.findFirst({ where: { batchNumber: 'SK-2027-B01' } });
      const rolesToBlock: UserRole[] = ['SUPER_ADMIN', 'ADMIN', 'DOCTOR', 'VAIDYA', 'RECEPTIONIST', 'ACCOUNTANT'];
      for (const role of rolesToBlock) {
        const res = await apiCall('POST', '/pharmacy/inventory/adjust', tokens[role], {
          stockId: targetStock!.id,
          quantityDelta: 5,
          reason: 'Unauthorized stock attempt'
        });
        assert(res.status === 403, `${role} is forbidden from adjusting medication stock (HTTP 403)`);
      }

      // 10.8 Stock receiving restricted: Non-pharmacists blocked
      for (const role of rolesToBlock) {
        const res = await apiCall('POST', '/pharmacy/inventory/receive', tokens[role], {
          drugName: 'Paracetamol 500mg',
          genericName: 'Paracetamol',
          category: 'Analgesic',
          form: 'Tablet',
          batchNumber: `UNAUTH-${role}-001`,
          expiryDate: '2028-12-31',
          quantity: 10
        });
        assert(res.status === 403, `${role} is forbidden from receiving medication stock (HTTP 403)`);
      }

      // 10.9 PHARMACIST is authorized to dispense
      const pharmaDispenseRes = await apiCall('POST', `/pharmacy/prescriptions/${rx.id}/dispense`, tokens.PHARMACIST, {
        quantityToDispense: 2
      });
      assert(pharmaDispenseRes.status === 200, 'PHARMACIST successfully authorized to dispense (HTTP 200)');
    }

    // =========================================================================
    // SECTION 11: CLINICAL PRESCRIBING AUTHORITY & DISCIPLINE ISOLATION
    // =========================================================================
    console.log(`\n${YELLOW}▶ 11. CLINICAL PRESCRIBING AUTHORITY & DISCIPLINE ISOLATION${RESET}`);
    {
      const patient = await prisma.patient.findFirst();

      // 11.1 SUPER_ADMIN and ADMIN cannot create prescriptions
      const adminPrescribeRes = await apiCall('POST', '/pharmacy/prescriptions', tokens.ADMIN, {
        patientId: patient!.id,
        patientName: `${patient!.firstName} ${patient!.lastName}`,
        mrn: patient!.mrn,
        medicationName: 'Amoxicillin 500mg',
        dosage: '500mg TDS',
        quantity: 10
      });
      assert(adminPrescribeRes.status === 403, 'ADMIN cannot author prescriptions (HTTP 403 CLINICAL_AUTHORITY_REQUIRED)');

      const superAdminPrescribeRes = await apiCall('POST', '/pharmacy/prescriptions', tokens.SUPER_ADMIN, {
        patientId: patient!.id,
        patientName: `${patient!.firstName} ${patient!.lastName}`,
        mrn: patient!.mrn,
        medicationName: 'Amoxicillin 500mg',
        dosage: '500mg TDS',
        quantity: 10
      });
      assert(superAdminPrescribeRes.status === 403, 'SUPER_ADMIN cannot author prescriptions (HTTP 403 CLINICAL_AUTHORITY_REQUIRED)');

      // 11.2 Cross-discipline prescription rejected: DOCTOR prescribing Ayurvedic medication
      const docAyurRes = await apiCall('POST', '/pharmacy/prescriptions', tokens.DOCTOR, {
        patientId: patient!.id,
        patientName: `${patient!.firstName} ${patient!.lastName}`,
        mrn: patient!.mrn,
        medicationName: 'Triphala Churna 5g',
        dosage: '5g at bedtime',
        quantity: 5
      });
      assert(docAyurRes.status === 403, 'DOCTOR prescribing Ayurvedic medication rejected with HTTP 403');
      assert(docAyurRes.json?.code === 'CLINICAL_DISCIPLINE_MISMATCH', 'Error code is CLINICAL_DISCIPLINE_MISMATCH');

      // 11.3 Cross-discipline prescription rejected: VAIDYA prescribing Modern Medicine
      const vaidyaModernRes = await apiCall('POST', '/pharmacy/prescriptions', tokens.VAIDYA, {
        patientId: patient!.id,
        patientName: `${patient!.firstName} ${patient!.lastName}`,
        mrn: patient!.mrn,
        medicationName: 'Amoxicillin 500mg Capsules',
        dosage: '500mg TDS',
        quantity: 15
      });
      assert(vaidyaModernRes.status === 403, 'VAIDYA prescribing Modern Medicine rejected with HTTP 403');
      assert(vaidyaModernRes.json?.code === 'CLINICAL_DISCIPLINE_MISMATCH', 'Error code is CLINICAL_DISCIPLINE_MISMATCH');

      // 11.4 Authorized DOCTOR prescribing Modern Medicine succeeds
      const docValidRes = await apiCall('POST', '/pharmacy/prescriptions', tokens.DOCTOR, {
        patientId: patient!.id,
        patientName: `${patient!.firstName} ${patient!.lastName}`,
        mrn: patient!.mrn,
        medicationName: 'Amoxicillin 500mg',
        dosage: '500mg TDS',
        frequency: 'Three Times Daily (TDS)',
        route: 'Oral',
        duration: '5 days',
        quantity: 15
      });
      assert(docValidRes.status === 201, 'DOCTOR successfully authored Modern Medicine prescription (HTTP 201)');
      const docRx = docValidRes.json.data;

      // 11.5 Authorized VAIDYA prescribing Ayurvedic medication succeeds
      const vaidyaValidRes = await apiCall('POST', '/pharmacy/prescriptions', tokens.VAIDYA, {
        patientId: patient!.id,
        patientName: `${patient!.firstName} ${patient!.lastName}`,
        mrn: patient!.mrn,
        medicationName: 'Dhanwantharam Thailam',
        dosage: '15ml external',
        frequency: 'Once Daily (OD)',
        route: 'Topical',
        duration: '7 days',
        quantity: 7
      });
      assert(vaidyaValidRes.status === 201, 'VAIDYA successfully authored Ayurvedic prescription (HTTP 201)');
      const vaidyaRx = vaidyaValidRes.json.data;

      // 11.6 Modification authorization on PATCH /api/pharmacy/prescriptions/:id
      // Non-clinicians rejected from modifying prescription
      const adminPatchRes = await apiCall('PATCH', `/pharmacy/prescriptions/${docRx.id}`, tokens.ADMIN, {
        instructions: 'Take after meals'
      });
      assert(adminPatchRes.status === 403, 'ADMIN cannot modify prescription (HTTP 403 CLINICAL_AUTHORITY_REQUIRED)');

      const pharmaPatchRes = await apiCall('PATCH', `/pharmacy/prescriptions/${docRx.id}`, tokens.PHARMACIST, {
        instructions: 'Take after meals'
      });
      assert(pharmaPatchRes.status === 403, 'PHARMACIST cannot modify clinical prescription (HTTP 403 CLINICAL_AUTHORITY_REQUIRED)');

      // VAIDYA attempting to modify DOCTOR prescription rejected
      const vaidyaCrossPatchRes = await apiCall('PATCH', `/pharmacy/prescriptions/${docRx.id}`, tokens.VAIDYA, {
        dosage: '250mg TDS'
      });
      assert(vaidyaCrossPatchRes.status === 403, 'VAIDYA cannot modify Modern Medicine prescription (HTTP 403 CLINICAL_DISCIPLINE_MISMATCH)');

      // DOCTOR attempting to modify VAIDYA prescription rejected
      const docCrossPatchRes = await apiCall('PATCH', `/pharmacy/prescriptions/${vaidyaRx.id}`, tokens.DOCTOR, {
        dosage: '20ml'
      });
      assert(docCrossPatchRes.status === 403, 'DOCTOR cannot modify Ayurvedic prescription (HTTP 403 CLINICAL_DISCIPLINE_MISMATCH)');

      // DOCTOR authorized to update DOCTOR prescription
      const docSelfPatchRes = await apiCall('PATCH', `/pharmacy/prescriptions/${docRx.id}`, tokens.DOCTOR, {
        instructions: 'Take strictly after meals with warm water'
      });
      assert(docSelfPatchRes.status === 200, 'DOCTOR successfully updated Modern Medicine prescription (HTTP 200)');
      assert(docSelfPatchRes.json.data.instructions === 'Take strictly after meals with warm water', 'Prescription instructions updated');

      // VAIDYA authorized to update VAIDYA prescription
      const vaidyaSelfPatchRes = await apiCall('PATCH', `/pharmacy/prescriptions/${vaidyaRx.id}`, tokens.VAIDYA, {
        instructions: 'Warm oil before gentle abhyanga'
      });
      assert(vaidyaSelfPatchRes.status === 200, 'VAIDYA successfully updated Ayurvedic prescription (HTTP 200)');
      assert(vaidyaSelfPatchRes.json.data.instructions === 'Warm oil before gentle abhyanga', 'Ayurvedic prescription instructions updated');
    }

    // =========================================================================
    // SECTION 12: BATCH IDENTITY & RECEIVING INTEGRITY (BATCH_METADATA_CONFLICT)
    // =========================================================================
    console.log(`\n${YELLOW}▶ 12. BATCH IDENTITY & RECEIVING INTEGRITY${RESET}`);
    {
      const batchNum = 'INTEG-2028-B99';

      // 12.1 Receive initial baseline batch
      const initRes = await apiCall('POST', '/pharmacy/inventory/receive', tokens.PHARMACIST, {
        drugName: 'Paracetamol 500mg',
        genericName: 'Paracetamol',
        category: 'Analgesics',
        form: 'Tablet',
        strength: '500mg',
        batchNumber: batchNum,
        expiryDate: '2028-12-31',
        manufacturer: 'Sahachara Pharmaceuticals',
        quantity: 50,
        unit: 'tablets'
      });
      assert(initRes.status === 201, 'Initial batch receipt accepted (HTTP 201)');
      const initialStock = initRes.json.data;
      assert(initialStock.stockQuantity === 50, 'Baseline stock quantity = 50');

      // 12.2 Identical batch receiving merges correctly
      const mergeRes = await apiCall('POST', '/pharmacy/inventory/receive', tokens.PHARMACIST, {
        drugName: 'Paracetamol 500mg',
        genericName: 'Paracetamol',
        category: 'Analgesics',
        form: 'Tablet',
        strength: '500mg',
        batchNumber: batchNum,
        expiryDate: '2028-12-31',
        manufacturer: 'Sahachara Pharmaceuticals',
        quantity: 30,
        unit: 'tablets'
      });
      assert(mergeRes.status === 201, 'Matching batch merge accepted (HTTP 201)');
      assert(mergeRes.json.data.stockQuantity === 80, 'Batch quantity merged: 50 + 30 = 80');

      // 12.3 Conflicting Expiry Date rejected with HTTP 409
      const expConflictRes = await apiCall('POST', '/pharmacy/inventory/receive', tokens.PHARMACIST, {
        drugName: 'Paracetamol 500mg',
        genericName: 'Paracetamol',
        category: 'Analgesics',
        form: 'Tablet',
        strength: '500mg',
        batchNumber: batchNum,
        expiryDate: '2029-06-30', // Conflicts with 2028-12-31
        manufacturer: 'Sahachara Pharmaceuticals',
        quantity: 20,
        unit: 'tablets'
      });
      assert(expConflictRes.status === 409, 'Batch receiving with conflicting expiry date rejected with HTTP 409');
      assert(expConflictRes.json?.error === 'BATCH_METADATA_CONFLICT', 'Error is BATCH_METADATA_CONFLICT');

      // 12.4 Conflicting Medication Name rejected with HTTP 409
      const medConflictRes = await apiCall('POST', '/pharmacy/inventory/receive', tokens.PHARMACIST, {
        drugName: 'Ibuprofen 400mg', // Conflicts with Paracetamol 500mg
        genericName: 'Ibuprofen',
        category: 'Analgesics',
        form: 'Tablet',
        strength: '400mg',
        batchNumber: batchNum,
        expiryDate: '2028-12-31',
        manufacturer: 'Sahachara Pharmaceuticals',
        quantity: 20,
        unit: 'tablets'
      });
      assert(medConflictRes.status === 409, 'Batch receiving with conflicting drug name rejected with HTTP 409');
      assert(medConflictRes.json?.error === 'BATCH_METADATA_CONFLICT', 'Error is BATCH_METADATA_CONFLICT');

      // 12.5 Conflicting Formulation rejected with HTTP 409
      const formConflictRes = await apiCall('POST', '/pharmacy/inventory/receive', tokens.PHARMACIST, {
        drugName: 'Paracetamol 500mg',
        genericName: 'Paracetamol',
        category: 'Analgesics',
        form: 'Syrup', // Conflicts with Tablet
        strength: '500mg',
        batchNumber: batchNum,
        expiryDate: '2028-12-31',
        manufacturer: 'Sahachara Pharmaceuticals',
        quantity: 20,
        unit: 'tablets'
      });
      assert(formConflictRes.status === 409, 'Batch receiving with conflicting formulation rejected with HTTP 409');
      assert(formConflictRes.json?.error === 'BATCH_METADATA_CONFLICT', 'Error is BATCH_METADATA_CONFLICT');

      // 12.6 Conflicting Manufacturer rejected with HTTP 409
      const mfrConflictRes = await apiCall('POST', '/pharmacy/inventory/receive', tokens.PHARMACIST, {
        drugName: 'Paracetamol 500mg',
        genericName: 'Paracetamol',
        category: 'Analgesics',
        form: 'Tablet',
        strength: '500mg',
        batchNumber: batchNum,
        expiryDate: '2028-12-31',
        manufacturer: 'Different Pharma Ltd', // Conflicts with Sahachara Pharmaceuticals
        quantity: 20,
        unit: 'tablets'
      });
      assert(mfrConflictRes.status === 409, 'Batch receiving with conflicting manufacturer rejected with HTTP 409');
      assert(mfrConflictRes.json?.error === 'BATCH_METADATA_CONFLICT', 'Error is BATCH_METADATA_CONFLICT');

      // 12.7 Strength Ambiguity: Incoming batch omits strength when existing batch specifies strength
      const omitStrengthRes = await apiCall('POST', '/pharmacy/inventory/receive', tokens.PHARMACIST, {
        drugName: 'Paracetamol 500mg',
        genericName: 'Paracetamol',
        category: 'Analgesics',
        form: 'Tablet',
        // strength omitted!
        batchNumber: batchNum,
        expiryDate: '2028-12-31',
        manufacturer: 'Sahachara Pharmaceuticals',
        quantity: 15,
        unit: 'tablets'
      });
      assert(omitStrengthRes.status === 409, 'Ambiguous merge with omitted strength rejected with HTTP 409');
      assert(omitStrengthRes.json?.message?.includes('strength ambiguity'), 'Rejection explicitly cites strength ambiguity');

      // 12.8 Manufacturer Ambiguity: Incoming batch specifies manufacturer when existing batch has NULL manufacturer
      const nullMfrBatch = 'NULL-MFR-2028-B1';
      await apiCall('POST', '/pharmacy/inventory/receive', tokens.PHARMACIST, {
        drugName: 'Zincovit Drops',
        genericName: 'Multivitamin',
        category: 'Vitamins',
        form: 'Drops',
        strength: '15ml',
        batchNumber: nullMfrBatch,
        expiryDate: '2028-12-31',
        // manufacturer omitted (persists as null)
        quantity: 20
      });

      const incomingMfrRes = await apiCall('POST', '/pharmacy/inventory/receive', tokens.PHARMACIST, {
        drugName: 'Zincovit Drops',
        genericName: 'Multivitamin',
        category: 'Vitamins',
        form: 'Drops',
        strength: '15ml',
        batchNumber: nullMfrBatch,
        expiryDate: '2028-12-31',
        manufacturer: 'Apex Laboratories', // Conflicts with NULL manufacturer on existing batch
        quantity: 10
      });
      assert(incomingMfrRes.status === 409, 'Ambiguous merge with incoming manufacturer against NULL existing batch rejected with HTTP 409');
      assert(incomingMfrRes.json?.message?.includes('manufacturer ambiguity'), 'Rejection explicitly cites manufacturer ambiguity');

      // 12.9 Manufacturer Ambiguity: Incoming batch omits manufacturer when existing batch specifies manufacturer
      const omitMfrRes = await apiCall('POST', '/pharmacy/inventory/receive', tokens.PHARMACIST, {
        drugName: 'Paracetamol 500mg',
        genericName: 'Paracetamol',
        category: 'Analgesics',
        form: 'Tablet',
        strength: '500mg',
        batchNumber: batchNum,
        expiryDate: '2028-12-31',
        // manufacturer omitted!
        quantity: 10,
        unit: 'tablets'
      });
      assert(omitMfrRes.status === 409, 'Ambiguous merge with omitted manufacturer against specified existing batch rejected with HTTP 409');
      assert(omitMfrRes.json?.message?.includes('manufacturer ambiguity'), 'Rejection explicitly cites manufacturer ambiguity');

      // Verify original batch metadata was preserved without silent overwrite
      const preservedStock = await prisma.medicationStock.findFirst({ where: { batchNumber: batchNum } });
      assert(preservedStock?.stockQuantity === 80, 'Stock quantity preserved at 80');
      assert(preservedStock?.expiryDate === '2028-12-31', 'Original expiry date preserved (no silent overwrite)');
      assert(preservedStock?.manufacturer === 'Sahachara Pharmaceuticals', 'Original manufacturer preserved');
    }

    // =========================================================================
    // SECTION 13: DISPENSING IDEMPOTENCY & CONCURRENCY PROTECTION
    // =========================================================================
    console.log(`\n${YELLOW}▶ 13. DISPENSING IDEMPOTENCY & CONCURRENCY PROTECTION${RESET}`);
    {
      const patient = await prisma.patient.findFirst();

      // Create a Modern Medicine prescription for testing idempotency
      const rxRes = await apiCall('POST', '/pharmacy/prescriptions', tokens.DOCTOR, {
        patientId: patient!.id,
        patientName: `${patient!.firstName} ${patient!.lastName}`,
        mrn: patient!.mrn,
        medicationName: 'Paracetamol 500mg',
        dosage: '500mg BD',
        frequency: 'Twice Daily (BD)',
        route: 'Oral',
        duration: '5 days',
        quantity: 10
      });
      const rx = rxRes.json.data;

      const stockBefore = await prisma.medicationStock.findFirst({ where: { batchNumber: 'INTEG-2028-B99' } });
      const qtyBefore = stockBefore!.stockQuantity; // 80

      const idemKey = `idem-rx-dispense-${Date.now()}`;

      // 13.1 First partial dispense with idempotency key
      const firstDispenseRes = await apiCall('POST', `/pharmacy/prescriptions/${rx.id}/dispense`, tokens.PHARMACIST, {
        quantityToDispense: 3,
        stockId: stockBefore!.id,
        idempotencyKey: idemKey,
        pharmacyNotes: 'First dispense with unique idempotency key'
      });
      assert(firstDispenseRes.status === 200, 'First dispense with idempotency key succeeded (HTTP 200)');
      assert(firstDispenseRes.json.data.dispensedQuantity === 3, 'Prescription dispensedQuantity = 3');
      assert(firstDispenseRes.json.data.remainingQuantity === 7, 'Prescription remainingQuantity = 7');

      const stockAfterFirst = await prisma.medicationStock.findUnique({ where: { id: stockBefore!.id } });
      assert(stockAfterFirst?.stockQuantity === qtyBefore - 3, `Stock decremented by 3: ${qtyBefore} -> ${stockAfterFirst?.stockQuantity}`);

      const dispRecordsCount1 = await prisma.dispensingRecord.count({ where: { prescriptionId: rx.id } });
      assert(dispRecordsCount1 === 1, 'Exactly 1 dispensing record created');

      // 13.2 Repeat identical request with same idempotency key returns original cached response
      const repeatedRes = await apiCall('POST', `/pharmacy/prescriptions/${rx.id}/dispense`, tokens.PHARMACIST, {
        quantityToDispense: 3,
        stockId: stockBefore!.id,
        idempotencyKey: idemKey,
        pharmacyNotes: 'First dispense with unique idempotency key'
      });
      assert(repeatedRes.status === 200, 'Repeated request with same idempotency key succeeded with HTTP 200');
      assert(repeatedRes.json.data.dispensedQuantity === 3, 'Response returns original dispensedQuantity = 3');

      // Verify stock was NOT decremented again!
      const stockAfterRepeat = await prisma.medicationStock.findUnique({ where: { id: stockBefore!.id } });
      assert(stockAfterRepeat?.stockQuantity === stockAfterFirst?.stockQuantity, 'Stock was NOT decremented again on idempotent retry');

      // Verify no duplicate dispensing record was created
      const dispRecordsCount2 = await prisma.dispensingRecord.count({ where: { prescriptionId: rx.id } });
      assert(dispRecordsCount2 === 1, 'Dispensing records count strictly unchanged (zero duplicate records)');

      // 13.3 Reused idempotency key with conflicting payload rejected with HTTP 409
      const conflictRes = await apiCall('POST', `/pharmacy/prescriptions/${rx.id}/dispense`, tokens.PHARMACIST, {
        quantityToDispense: 5, // Conflicting quantity: 5 instead of 3
        stockId: stockBefore!.id,
        idempotencyKey: idemKey
      });
      assert(conflictRes.status === 409, 'Reused idempotency key with altered payload rejected with HTTP 409');
      assert(conflictRes.json?.error === 'IDEMPOTENCY_CONFLICT', 'Error is explicitly IDEMPOTENCY_CONFLICT');

      // 13.4 Concurrent dispensing with same idempotency key (network retry / race condition simulation)
      const concurrentIdemKey = `idem-concurrent-${Date.now()}`;
      const [resA, resB] = await Promise.all([
        apiCall('POST', `/pharmacy/prescriptions/${rx.id}/dispense`, tokens.PHARMACIST, {
          quantityToDispense: 2,
          stockId: stockBefore!.id,
          idempotencyKey: concurrentIdemKey,
          pharmacyNotes: 'Concurrent retry test'
        }),
        apiCall('POST', `/pharmacy/prescriptions/${rx.id}/dispense`, tokens.PHARMACIST, {
          quantityToDispense: 2,
          stockId: stockBefore!.id,
          idempotencyKey: concurrentIdemKey,
          pharmacyNotes: 'Concurrent retry test'
        })
      ]);

      assert(resA.status === 200 && resB.status === 200, 'Both concurrent calls completed safely (HTTP 200)');
      assert(resA.json.data.dispensedQuantity === resB.json.data.dispensedQuantity, 'Both concurrent calls return identical state');

      // Stock was decremented exactly once by 2 (3 + 2 = 5 total dispensed)
      const stockAfterConcurrent = await prisma.medicationStock.findUnique({ where: { id: stockBefore!.id } });
      assert(stockAfterConcurrent?.stockQuantity === qtyBefore - 5, `Stock decremented exactly once for concurrent requests: ${stockAfterConcurrent?.stockQuantity}`);

      const dispRecordsCount3 = await prisma.dispensingRecord.count({ where: { prescriptionId: rx.id } });
      assert(dispRecordsCount3 === 2, 'Exactly 2 dispensing records exist (initial + concurrent key single record)');

      // 13.5 Failed dispensing transaction does NOT leave a permanently successful cached response
      const failedIdemKey = `idem-fail-test-${Date.now()}`;
      const failedRes = await apiCall('POST', `/pharmacy/prescriptions/${rx.id}/dispense`, tokens.PHARMACIST, {
        quantityToDispense: 999, // Exceeds remaining 5
        stockId: stockBefore!.id,
        idempotencyKey: failedIdemKey
      });
      assert(failedRes.status === 400, 'Over-quantity dispensing failed as expected with HTTP 400');
      const cachedFailed = await prisma.dispensingIdempotency.findUnique({ where: { idempotencyKey: failedIdemKey } });
      assert(!cachedFailed, 'Failed transaction did NOT persist any entry in dispensing_idempotency table');

      // 13.6 Reused key cannot expose another user's cached response (rejected with 409 IDEMPOTENCY_CONFLICT)
      const otherPharmaToken = generateSessionToken({
        userId: 'usr-pharma-2',
        email: 'other.pharmacist@sahachara.com',
        name: 'Pharm. Sunita Verma',
        role: 'PHARMACIST'
      });
      const crossUserRes = await apiCall('POST', `/pharmacy/prescriptions/${rx.id}/dispense`, otherPharmaToken, {
        quantityToDispense: 3,
        stockId: stockBefore!.id,
        idempotencyKey: idemKey // Key owned by Rajesh Nair
      });
      assert(crossUserRes.status === 409, 'Reused key with different actor rejected with HTTP 409');
      assert(crossUserRes.json?.error === 'IDEMPOTENCY_CONFLICT', 'Error is IDEMPOTENCY_CONFLICT');

      // 13.7 Concurrent requests with same key but DIFFERENT payloads cannot both succeed
      const diffPayloadKey = `idem-diff-payload-${Date.now()}`;
      const [diffResA, diffResB] = await Promise.all([
        apiCall('POST', `/pharmacy/prescriptions/${rx.id}/dispense`, tokens.PHARMACIST, {
          quantityToDispense: 1,
          stockId: stockBefore!.id,
          idempotencyKey: diffPayloadKey
        }),
        apiCall('POST', `/pharmacy/prescriptions/${rx.id}/dispense`, tokens.PHARMACIST, {
          quantityToDispense: 2,
          stockId: stockBefore!.id,
          idempotencyKey: diffPayloadKey
        })
      ]);
      const oneSucceeded = (diffResA.status === 200 && diffResB.status === 409) || (diffResA.status === 409 && diffResB.status === 200);
      assert(oneSucceeded, 'Concurrent requests with same key but different payloads cannot both succeed (one 200, one 409)');

      // 13.8 Multi-prescription concurrent stock depletion test (Stock row locking)
      // Create a small batch with only 10 units
      const limitedStock = await prisma.medicationStock.create({
        data: {
          drugName: 'Ciprofloxacin 500mg',
          genericName: 'Ciprofloxacin',
          category: 'Antibiotics',
          form: 'Tablet',
          strength: '500mg',
          batchNumber: `CIPRO-LOCK-${Date.now()}`,
          expiryDate: '2028-12-31',
          stockQuantity: 10,
          unit: 'tablets',
          minThreshold: 5,
          unitPrice: null,
          isActive: true,
          status: 'in_stock'
        }
      });

      // Create two independent prescriptions for 6 units each (total 12 requested > 10 in stock)
      const rxA_Res = await apiCall('POST', '/pharmacy/prescriptions', tokens.DOCTOR, {
        patientId: patient!.id,
        patientName: `${patient!.firstName} ${patient!.lastName}`,
        mrn: patient!.mrn,
        medicationName: 'Ciprofloxacin 500mg',
        dosage: '500mg BD',
        quantity: 6
      });
      const rxB_Res = await apiCall('POST', '/pharmacy/prescriptions', tokens.DOCTOR, {
        patientId: patient!.id,
        patientName: `${patient!.firstName} ${patient!.lastName}`,
        mrn: patient!.mrn,
        medicationName: 'Ciprofloxacin 500mg',
        dosage: '500mg BD',
        quantity: 6
      });
      const rxA = rxA_Res.json.data;
      const rxB = rxB_Res.json.data;

      // Concurrently attempt to dispense 6 from rxA and 6 from rxB against the same 10-unit batch
      const [concA, concB] = await Promise.all([
        apiCall('POST', `/pharmacy/prescriptions/${rxA.id}/dispense`, tokens.PHARMACIST, {
          quantityToDispense: 6,
          stockId: limitedStock.id
        }),
        apiCall('POST', `/pharmacy/prescriptions/${rxB.id}/dispense`, tokens.PHARMACIST, {
          quantityToDispense: 6,
          stockId: limitedStock.id
        })
      ]);

      const concSuccessCount = (concA.status === 200 ? 1 : 0) + (concB.status === 200 ? 1 : 0);
      const concFailureCount = (concA.status === 400 ? 1 : 0) + (concB.status === 400 ? 1 : 0);
      assert(concSuccessCount === 1, 'Exactly one concurrent prescription dispense succeeded from limited batch');
      assert(concFailureCount === 1, 'Second concurrent prescription dispense failed due to stock exhaustion (HTTP 400)');

      // Verify stock in database is exactly 4 (10 - 6 = 4) and never negative
      const refreshedLimitedStock = await prisma.medicationStock.findUnique({ where: { id: limitedStock.id } });
      assert(refreshedLimitedStock?.stockQuantity === 4, 'Stock quantity decremented accurately to 4 without race condition or overspending', `Actual: ${refreshedLimitedStock?.stockQuantity}`);
    }

    // =========================================================================
    // SECTION 14: PRICING INDEPENDENCE & ZERO AUTO-INVOICING
    // =========================================================================
    console.log(`\n${YELLOW}▶ 14. PRICING INDEPENDENCE & BILLING INTEGRITY${RESET}`);
    {
      const invoiceCountBefore = await prisma.invoice.count();

      // Verify that dispensing does not automatically generate invoices
      const patient = await prisma.patient.findFirst();
      const rxRes = await apiCall('POST', '/pharmacy/prescriptions', tokens.VAIDYA, {
        patientId: patient!.id,
        patientName: `${patient!.firstName} ${patient!.lastName}`,
        mrn: patient!.mrn,
        medicationName: 'Sahacharadi Kwatham',
        dosage: '10ml',
        frequency: 'OD',
        route: 'Oral',
        duration: '1 day',
        quantity: 1
      });

      const dispRes = await apiCall('POST', `/pharmacy/prescriptions/${rxRes.json.data.id}/dispense`, tokens.PHARMACIST, {
        quantityToDispense: 1
      });
      assert(dispRes.status === 200, 'Dispensed medication with NULL price');

      const invoiceCountAfter = await prisma.invoice.count();
      assert(invoiceCountAfter === invoiceCountBefore, 'Dispensing did NOT auto-create any billing invoice (count unchanged)');

      // Verify unitPrice on medication stock was not mutated or fabricated
      const stock = await prisma.medicationStock.findFirst({ where: { batchNumber: 'SK-2027-B01' } });
      assert(stock?.unitPrice === null, 'Medication stock unitPrice remains strictly NULL (no fabricated price)');
    }

    // =========================================================================
    // SECTION 15: PRODUCTION DATABASE ISOLATION AUDIT
    // =========================================================================
    console.log(`\n${YELLOW}▶ 15. PRODUCTION DATABASE ZERO-MUTATION VERIFICATION${RESET}`);
    {
      const prodFinalState = {
        users: await prodProbePrisma.user.count(),
        patients: await prodProbePrisma.patient.count(),
        appointments: await prodProbePrisma.appointment.count(),
        prescriptions: await prodProbePrisma.prescription.count(),
        dispensingRecords: await prodProbePrisma.dispensingRecord.count(),
        stockMovements: await prodProbePrisma.stockMovement.count(),
        invoices: await prodProbePrisma.invoice.count(),
        tariffs: await prodProbePrisma.hospitalTariff.count()
      };

      console.log(`  Final Production DB Snapshot:`, prodFinalState);

      assert(prodFinalState.users === prodInitialState.users, `Users count unchanged: ${prodFinalState.users} == ${prodInitialState.users}`);
      assert(prodFinalState.patients === 0, 'Production patients count strictly 0');
      assert(prodFinalState.appointments === 0, 'Production appointments count strictly 0');
      assert(prodFinalState.prescriptions === 0, 'Production prescriptions count strictly 0');
      assert(prodFinalState.dispensingRecords === 0, 'Production dispensingRecords count strictly 0');
      assert(prodFinalState.stockMovements === 0, 'Production stockMovements count strictly 0');
      assert(prodFinalState.invoices === 0, 'Production invoices count strictly 0');
      assert(prodFinalState.tariffs === prodInitialState.tariffs, `Production tariffs count strictly unchanged (${prodFinalState.tariffs} === ${prodInitialState.tariffs})`);

      // Verify all production tariffs remain null
      const prodTariffs = await prodProbePrisma.hospitalTariff.findMany();
      const nonNullTariffs = prodTariffs.filter((t) => t.rate !== null);
      assert(nonNullTariffs.length === 0, 'All production tariff rates remain unconfigured (rate: null)');
    }

  } finally {
    server.close();
    // Clean up test database fixtures
    await prisma.$executeRawUnsafe(`
      TRUNCATE TABLE dispensing_idempotency, dispensing_records, stock_movements, prescriptions, 
                     medication_stock, clinical_vitals, clinical_assessments, clinical_diagnoses, 
                     lab_orders, treatment_plans, panchakarma_courses, clinical_encounters, 
                     appointments, invoices, patients CASCADE;
    `);
    await prodProbePrisma.$disconnect();
    await prisma.$disconnect();
  }

  console.log(`\n${BOLD}${CYAN}═══════════════════════════════════════════════════════════════════════════════${RESET}`);
  console.log(`${BOLD}${passedCount > 0 && failedCount === 0 ? GREEN : RED}   PHASE 4 PHARMACY VERIFICATION RESULTS: ${passedCount} PASSED, ${failedCount} FAILED   ${RESET}`);
  console.log(`${BOLD}${CYAN}═══════════════════════════════════════════════════════════════════════════════${RESET}\n`);

  if (failedCount > 0) {
    process.exit(1);
  }
}

run().catch((err) => {
  console.error('\nUnhandled Exception during verification:', err);
  process.exit(1);
});

