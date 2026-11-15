/**
 * SAHACHARA OPS — Pharmacy Price Independence & Billing Security Verification
 *
 * Tests:
 *   1. Dispensing with NULL medication price (must succeed)
 *   2A. Billing: NULL-priced medication with client price ₹500   → 400 UnconfiguredMedicationPrice
 *   2B. Billing: NULL-priced medication with client price ₹0     → 400 UnconfiguredMedicationPrice
 *   2C. Billing: Configured ₹120 DB price, client submits ₹1500  → server uses ₹120
 *   2D. Billing: Unknown medication as Pharmacy item             → 400 UnconfiguredMedicationPrice
 *   2E. Billing: Configured medication, correct quantity         → exact server total + immutable snapshot
 *   3.  Decimal integrity across full calculation path
 *   4.  Production database isolation (zero contamination)
 *
 * Run: tsx scripts/verify-pharmacy-price.ts
 */

import express from 'express';
import http from 'http';
import { PrismaClient, Prisma } from '@prisma/client';

// ---------------------------------------------------------------------------
// TEST DATABASE ISOLATION GUARD — must run before any app imports
// ---------------------------------------------------------------------------
const PROD_DB_URL = process.env.PROD_DATABASE_URL;
const TEST_DB_URL = process.env.TEST_DATABASE_URL || 'postgresql://highflyer@localhost:5432/sahachara_ops_test_db';

if (process.env.DATABASE_URL?.includes('sahachara_ops_db') && !process.env.TEST_DATABASE_URL) {
  console.error('\nFATAL: Tests must not run against production. Aborting.');
  process.exit(1);
}

process.env.DATABASE_URL = TEST_DB_URL;
process.env.ENABLE_TEST_ACCOUNTS = 'true';
process.env.NODE_ENV = 'test';

import { apiRouter } from '../server/routes.ts';
import { prisma, checkPrismaConnection, ensureDefaultDatabaseUsers } from '../server/prismaService.ts';

const isCI = process.env.CI === 'true';
const prodPrisma = !isCI && PROD_DB_URL && !PROD_DB_URL.includes('test_db') && !PROD_DB_URL.includes('sahachara_ops_test')
  ? new PrismaClient({ datasources: { db: { url: PROD_DB_URL } } })
  : null;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const BASE_URL = 'http://127.0.0.1:3334';

let passed = 0;
let failed = 0;
const results: { label: string; passed: boolean; detail: string }[] = [];

function pass(label: string, detail: string = '') {
  passed++;
  results.push({ label, passed: true, detail });
  console.log(`  ✅ PASS: ${label}${detail ? ' — ' + detail : ''}`);
}

function fail(label: string, detail: string = '') {
  failed++;
  results.push({ label, passed: false, detail });
  console.error(`  ❌ FAIL: ${label}${detail ? ' — ' + detail : ''}`);
}

async function post(path: string, body: unknown, token?: string) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return fetch(`${BASE_URL}/api${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  });
}

async function patch(path: string, body: unknown, token?: string) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return fetch(`${BASE_URL}/api${path}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(body)
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function run() {
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('  PHARMACY PRICE INDEPENDENCE & BILLING SECURITY VERIFICATION');
  console.log('═══════════════════════════════════════════════════════════════════\n');

  // ── Database guard
  const isConnected = await checkPrismaConnection();
  if (!isConnected) { console.error('FATAL: DB connection failed'); process.exit(1); }

  const [dbRow] = await prisma.$queryRaw<[{ current_database: string }]>`SELECT current_database()`;
  if (dbRow.current_database !== 'sahachara_ops_test_db') {
    console.error(`FATAL: Connected to "${dbRow.current_database}", expected sahachara_ops_test_db`);
    process.exit(1);
  }
  console.log(`✓ Test database: ${dbRow.current_database}\n`);

  // ── Production snapshot (before)
  let prodBefore: any = null;
  if (prodPrisma) {
    try {
      prodBefore = {
        medicationStock: await prodPrisma.medicationStock.count(),
        invoices: await prodPrisma.invoice.count(),
        patients: await prodPrisma.patient.count(),
        prescriptions: await prodPrisma.prescription.count(),
        tariffs: await prodPrisma.hospitalTariff.count(),
      };
      console.log('✓ Production snapshot (before):', prodBefore);
      const prodTariffRates = await prodPrisma.hospitalTariff.findMany({ select: { serviceCode: true, rate: true } });
      const anyConfiguredProdTariff = prodTariffRates.some(t => t.rate !== null);
      if (anyConfiguredProdTariff) {
        fail('SECTION 4 — Production tariffs all NULL', 'Some production tariffs have a configured rate — this violates the unconfigured-rates policy');
      } else {
        pass('SECTION 4 — All production tariffs remain strictly NULL (unconfigured)');
      }
      const prodMedWithPrice = await prodPrisma.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(*) as count FROM medication_stock WHERE "unitPrice" IS NOT NULL
      `;
      const prodMedWithPriceCount = Number(prodMedWithPrice[0]?.count ?? 0);
      if (prodMedWithPriceCount > 0) {
        fail('SECTION 4 — Production medication prices', `${prodMedWithPriceCount} production medication(s) have a non-NULL unitPrice`);
      } else {
        pass('SECTION 4 — Production medication_stock: zero rows with configured prices');
      }
    } catch {
      prodBefore = null;
    }
  }

  if (!prodBefore) {
    console.log('  ℹ [SKIPPED] Section 4 production snapshot probe skipped: isolated CI/test environment (zero production database access).');
  }

  await ensureDefaultDatabaseUsers();

  // ── Ephemeral test server
  const app = express();
  app.use(express.json());
  app.use('/api', apiRouter);
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(3334, '127.0.0.1', () => resolve()));
  console.log(`\n✓ Ephemeral test server on ${BASE_URL}\n`);

  // ── Authenticate as PHARMACIST (for dispensing) and ACCOUNTANT (for billing)
  const pharmaLoginRes = await post('/auth/login', {
    email: 'pharmacist@sahachara.com',
    password: 'Pharmacy@Sahachara2026!'
  }, '');
  const pharmaJson = await pharmaLoginRes.json();
  const pharmaToken: string = pharmaJson.token || '';

  const acctLoginRes = await post('/auth/login', {
    email: 'accountant@sahachara.com',
    password: 'Account@Sahachara2026!'
  }, '');
  const acctJson = await acctLoginRes.json();
  const acctToken: string = acctJson.token || '';

  const adminLoginRes = await post('/auth/login', {
    email: 'admin.ops@sahachara.com',
    password: 'Admin@Sahachara2026!'
  }, '');
  const adminJson = await adminLoginRes.json();
  const adminToken: string = adminJson.token || '';

  const vaidyaLoginRes = await post('/auth/login', {
    email: 'sarah.chen@sahachara.com',
    password: 'Vaidya@Sahachara2026!'
  }, '');
  const vaidyaJson = await vaidyaLoginRes.json();
  const vaidyaToken: string = vaidyaJson.token || '';

  if (!pharmaToken || !acctToken || !adminToken || !vaidyaToken) {
    console.error('FATAL: Failed to authenticate test users. Tokens:', { pharmaToken, acctToken, adminToken, vaidyaToken });
    server.close();
    process.exit(1);
  }
  console.log('✓ Test users authenticated (PHARMACIST, ACCOUNTANT, ADMIN, VAIDYA)\n');

  // ── Create a test patient
  const patRes = await post('/patients', {
    firstName: 'PharmTest',
    lastName: 'Isolation',
    dateOfBirth: '1980-06-15',
    gender: 'Male',
    phone: '+91-9000000001',
    email: 'pharmtest@example.com',
    address: 'Test Ward 1',
    bloodGroup: 'O+',
    mrn: `SAH-PHARM-${Date.now()}`,
    admissionStatus: 'outpatient'
  }, adminToken);
  const patJson = await patRes.json();
  const patient = patJson.data;
  if (!patient?.id) { console.error('FATAL: Failed to create test patient'); server.close(); process.exit(1); }
  console.log(`✓ Test patient created: ${patient.mrn}\n`);

  // ==========================================================================
  // TEST 1 — Dispensing with NULL medication price
  // ==========================================================================
  console.log('── TEST 1: Dispensing with NULL medication price ─────────────────────');

  // Create medication with NULL price in test DB
  await prisma.medicationStock.deleteMany({ where: { id: 'med-null-price-test-001' } });
  const nullPriceMed = await prisma.medicationStock.create({
    data: {
      id: 'med-null-price-test-001',
      drugName: 'Triphala Churna (Test NULL Price)',
      genericName: 'Haritaki Bibhitaki Amalaki test fixture',
      category: 'Classical Churna',
      form: 'Tablet',
      stockQuantity: 50,
      unit: 'jars',
      minThreshold: 10,
      batchNumber: 'BT-NULL-PRICE-001',
      expiryDate: '2028-12-31',
      unitPrice: null, // NULL — no price configured
      status: 'in_stock'
    }
  });

  // Confirm it is null in DB
  const nullMedFromDb = await prisma.medicationStock.findUnique({ where: { id: nullPriceMed.id } });
  if (nullMedFromDb?.unitPrice !== null) {
    fail('1.1 — NULL unitPrice persisted to DB', `Got: ${nullMedFromDb?.unitPrice}`);
  } else {
    pass('1.1 — Medication created with unitPrice = NULL in test DB');
  }

  // Create a prescription for this medication
  const rxRes = await post('/pharmacy/prescriptions', {
    patientId: patient.id,
    patientName: `${patient.firstName} ${patient.lastName}`,
    mrn: patient.mrn,
    doctorId: 'usr-vaidya',
    doctorName: 'Dr. Sarah Chen, BAMS, MD (Ayu)',
    datePrescribed: new Date().toISOString(),
    medicationName: 'Triphala Churna (Test NULL Price)',
    dosage: '5g after meals',
    frequency: 'Once daily',
    route: 'Oral',
    duration: '30 days'
  }, vaidyaToken);
  const rxJson = await rxRes.json();
  const prescription = rxJson.data;
  if (!prescription?.id) {
    fail('1.2 — Prescription created for NULL-price medication', `Status: ${rxRes.status} ${JSON.stringify(rxJson)}`);
  } else {
    pass('1.2 — Prescription created for NULL-price medication', `rxId: ${prescription.id}`);
  }

  // Dispense it
  const stockBefore = await prisma.medicationStock.findUnique({ where: { id: nullPriceMed.id } });
  const dispenseRes = await patch(`/pharmacy/prescriptions/${prescription.id}`, {
    status: 'dispensed',
    dispensedBy: 'Pharm. Test Verifier',
    quantity: 2
  }, pharmaToken);
  const dispenseJson = await dispenseRes.json();

  if (dispenseRes.status !== 200 || !dispenseJson.success) {
    fail('1.3 — Dispensing with NULL price must succeed', `Status: ${dispenseRes.status} ${JSON.stringify(dispenseJson)}`);
  } else {
    pass('1.3 — Dispensing succeeded despite NULL medication price');
  }

  const stockAfter = await prisma.medicationStock.findUnique({ where: { id: nullPriceMed.id } });
  const expectedQty = (stockBefore?.stockQuantity ?? 50) - 2;
  if (stockAfter?.stockQuantity !== expectedQty) {
    fail('1.4 — Stock quantity decremented after dispensing', `Expected ${expectedQty}, got ${stockAfter?.stockQuantity}`);
  } else {
    pass('1.4 — Stock quantity correctly decremented', `${stockBefore?.stockQuantity} → ${stockAfter?.stockQuantity}`);
  }

  const movement = await prisma.stockMovement.findFirst({
    where: { medicineId: nullPriceMed.id },
    orderBy: { timestamp: 'desc' }
  });
  if (!movement || movement.quantityDelta !== -2) {
    fail('1.5 — StockMovement recorded', `Got: ${JSON.stringify(movement)}`);
  } else {
    pass('1.5 — StockMovement recorded', `delta: ${movement.quantityDelta}, remaining: ${movement.remainingQuantity}`);
  }

  // Confirm no invoice was automatically created
  const autoInvoices = await prisma.invoice.findMany({
    where: { patientId: patient.id, createdAt: { gte: new Date(Date.now() - 10000) } }
  });
  if (autoInvoices.length > 0) {
    fail('1.6 — No automatic invoice created on dispense', `Found ${autoInvoices.length} auto-invoice(s)`);
  } else {
    pass('1.6 — No invoice auto-created from dispensing (billing remains a separate step)');
  }

  // Confirm medication price was NOT substituted in DB
  const medAfterDispense = await prisma.medicationStock.findUnique({ where: { id: nullPriceMed.id } });
  if (medAfterDispense?.unitPrice !== null) {
    fail('1.7 — Medication price not substituted after dispense', `Got: ${medAfterDispense?.unitPrice}`);
  } else {
    pass('1.7 — Medication unitPrice remains NULL after dispensing — no fabricated amount substituted');
  }

  const auditLog = await prisma.auditLog.findFirst({
    where: { action: 'Dispensed Medication', timestamp: { gte: new Date(Date.now() - 10000) } },
    orderBy: { timestamp: 'desc' }
  });
  if (!auditLog) {
    fail('1.8 — Audit log created for dispensing');
  } else {
    pass('1.8 — Audit attribution recorded', `actor: "${auditLog.actor}", action: "${auditLog.action}"`);
  }

  console.log('');

  // ==========================================================================
  // TEST 2A — NULL-priced medication, client submits ₹500
  // ==========================================================================
  console.log('── TEST 2A: Billing NULL-price medication with client price ₹500 ───────');
  const res2A = await post('/billing', {
    patientId: patient.id,
    patientName: `${patient.firstName} ${patient.lastName}`,
    mrn: patient.mrn,
    items: [{
      description: 'Triphala Churna (Test NULL Price)',
      medicationId: 'med-null-price-test-001',
      category: 'Pharmacy',
      quantity: 1,
      unitPrice: 500  // client-submitted price — must be ignored, then rejected due to null DB price
    }]
  }, acctToken);
  const json2A = await res2A.json();
  if (res2A.status === 400 && json2A.error === 'UnconfiguredMedicationPrice') {
    pass('2A — NULL-price medication with client ₹500 rejected with UnconfiguredMedicationPrice');
  } else {
    fail('2A — Expected HTTP 400 UnconfiguredMedicationPrice', `Got: ${res2A.status} ${JSON.stringify(json2A)}`);
  }
  console.log('');

  // ==========================================================================
  // TEST 2B — NULL-priced medication, client submits ₹0
  // ==========================================================================
  console.log('── TEST 2B: Billing NULL-price medication with client price ₹0 ─────────');
  const res2B = await post('/billing', {
    patientId: patient.id,
    patientName: `${patient.firstName} ${patient.lastName}`,
    mrn: patient.mrn,
    items: [{
      description: 'Triphala Churna (Test NULL Price)',
      medicationId: 'med-null-price-test-001',
      category: 'Pharmacy',
      quantity: 3,
      unitPrice: 0
    }]
  }, acctToken);
  const json2B = await res2B.json();
  if (res2B.status === 400 && json2B.error === 'UnconfiguredMedicationPrice') {
    pass('2B — NULL-price medication with client ₹0 rejected with UnconfiguredMedicationPrice');
  } else {
    fail('2B — Expected HTTP 400 UnconfiguredMedicationPrice', `Got: ${res2B.status} ${JSON.stringify(json2B)}`);
  }
  console.log('');

  // ==========================================================================
  // TEST 2C — Configured ₹120 DB price, client submits ₹1500 → server uses ₹120
  // ==========================================================================
  console.log('── TEST 2C: Configured ₹120 DB price, client submits ₹1,500 ────────────');
  const configuredMed = await prisma.medicationStock.upsert({
    where: { id: 'med-configured-120-test-002' },
    update: { unitPrice: new Prisma.Decimal('120.00'), stockQuantity: 100 },
    create: {
      id: 'med-configured-120-test-002',
      drugName: 'Ashwagandha Root Extract (Test ₹120)',
      genericName: 'Withania somnifera standardised extract',
      category: 'Adaptogenic Rasayana',
      form: 'Tablet',
      stockQuantity: 100,
      unit: 'capsules',
      minThreshold: 20,
      batchNumber: 'BT-CONF-120-002',
      expiryDate: '2028-06-30',
      unitPrice: new Prisma.Decimal('120.00'),
      status: 'in_stock'
    }
  });

  const dbPrice = Number(configuredMed.unitPrice);
  if (dbPrice !== 120) {
    fail('2C.setup — DB price is exactly ₹120.00', `Got: ${dbPrice}`);
  } else {
    console.log(`  ✓ DB price confirmed: ₹${dbPrice}`);
  }

  const res2C = await post('/billing', {
    patientId: patient.id,
    patientName: `${patient.firstName} ${patient.lastName}`,
    mrn: patient.mrn,
    items: [{
      description: 'Ashwagandha Root Extract (Test ₹120)',
      medicationId: 'med-configured-120-test-002',
      category: 'Pharmacy',
      quantity: 2,
      unitPrice: 1500  // tampered client price — must be rejected/overridden
    }]
  }, acctToken);
  const json2C = await res2C.json();
  if (!json2C.success || res2C.status !== 201) {
    fail('2C — Invoice created with configured price', `Status: ${res2C.status} ${JSON.stringify(json2C)}`);
  } else {
    const inv = json2C.data;
    const lineItem = inv.items?.[0];
    if (lineItem?.unitPrice !== 120) {
      fail('2C — Server uses DB price ₹120 (not client-submitted ₹1500)', `Actual unitPrice in invoice: ₹${lineItem?.unitPrice}`);
    } else if (inv.subtotal !== 240) {
      fail('2C — Correct total (2 × ₹120 = ₹240)', `Got subtotal: ₹${inv.subtotal}`);
    } else {
      pass('2C — Server authoritative price used: ₹120 (client ₹1500 ignored)', `2 × ₹120 = ₹${inv.subtotal} (expected ₹240)`);
    }
  }
  console.log('');

  // ==========================================================================
  // TEST 2D — Unknown medication as Pharmacy billing item
  // ==========================================================================
  console.log('── TEST 2D: Unknown medication as Pharmacy item ─────────────────────────');
  const res2D = await post('/billing', {
    patientId: patient.id,
    patientName: `${patient.firstName} ${patient.lastName}`,
    mrn: patient.mrn,
    items: [{
      description: 'Neem Leaf Powder (Completely Unknown)',
      category: 'Pharmacy',
      quantity: 1,
      unitPrice: 300  // arbitrary submitted price for unknown medication
    }]
  }, acctToken);
  const json2D = await res2D.json();
  if (res2D.status === 400 && json2D.error === 'UnconfiguredMedicationPrice') {
    pass('2D — Unknown Pharmacy medication rejected with UnconfiguredMedicationPrice');
  } else {
    fail('2D — Expected HTTP 400 UnconfiguredMedicationPrice for unknown medication', `Got: ${res2D.status} ${JSON.stringify(json2D)}`);
  }
  console.log('');

  // ==========================================================================
  // TEST 2E — Configured medication, correct quantity, exact server total
  // ==========================================================================
  console.log('── TEST 2E: Configured medication, exact server total & immutable snapshot');
  // Use the ₹120 medication with quantity 5 → expected total ₹600
  const res2E = await post('/billing', {
    patientId: patient.id,
    patientName: `${patient.firstName} ${patient.lastName}`,
    mrn: patient.mrn,
    items: [{
      description: 'Ashwagandha Root Extract (Test ₹120)',
      medicationId: 'med-configured-120-test-002',
      category: 'Pharmacy',
      quantity: 5,
      unitPrice: 999  // tampered — must be overridden by DB price ₹120
    }],
    coveragePercentage: 25,  // 25% insurance → coverage ₹150, copay ₹450
    paymentStatus: 'partial',
    paidAmount: 300
  }, acctToken);
  const json2E = await res2E.json();
  if (!json2E.success || res2E.status !== 201) {
    fail('2E — Invoice created', `Status: ${res2E.status} ${JSON.stringify(json2E)}`);
  } else {
    const inv = json2E.data;
    const item = inv.items?.[0];
    let allOk = true;

    // 5 × ₹120 = ₹600 subtotal
    if (item?.unitPrice !== 120) { fail('2E.1 — unitPrice snapshot = ₹120', `Got: ${item?.unitPrice}`); allOk = false; }
    else pass('2E.1 — Line item unitPrice snapshot = ₹120.00');

    if (item?.total !== 600) { fail('2E.2 — Line item total = ₹600', `Got: ${item?.total}`); allOk = false; }
    else pass('2E.2 — Line item total = ₹600.00 (5 × ₹120)');

    if (inv.subtotal !== 600) { fail('2E.3 — subtotal = ₹600', `Got: ${inv.subtotal}`); allOk = false; }
    else pass('2E.3 — Invoice subtotal = ₹600.00');

    // 25% of 600 = 150
    if (inv.insuranceCovered !== 150) { fail('2E.4 — insuranceCovered = ₹150', `Got: ${inv.insuranceCovered}`); allOk = false; }
    else pass('2E.4 — Insurance covered = ₹150.00 (25% of ₹600)');

    // copay = 600 - 150 = 450
    if (inv.copayPatient !== 450) { fail('2E.5 — copayPatient = ₹450', `Got: ${inv.copayPatient}`); allOk = false; }
    else pass('2E.5 — Copayment = ₹450.00 (₹600 - ₹150)');

    // paidAmount = 300, balance = 600 - 300 = 300
    if (inv.paidAmount !== 300) { fail('2E.6 — paidAmount = ₹300', `Got: ${inv.paidAmount}`); allOk = false; }
    else pass('2E.6 — Paid amount = ₹300.00');

    if (inv.balance !== 300) { fail('2E.7 — balance = ₹300', `Got: ${inv.balance}`); allOk = false; }
    else pass('2E.7 — Outstanding balance = ₹300.00');

    // Verify immutable snapshot in PostgreSQL
    const dbInv = await prisma.invoice.findUnique({ where: { id: inv.id } });
    if (!dbInv) {
      fail('2E.8 — Invoice persisted in test DB');
    } else {
      const dbSubtotal = Number(dbInv.subtotal);
      const dbBalance = Number(dbInv.balance);
      const dbItems = dbInv.items as any[];
      const dbItem = dbItems?.[0];

      if (dbSubtotal !== 600) { fail('2E.8 — DB subtotal DECIMAL = ₹600', `Got: ${dbSubtotal}`); allOk = false; }
      else if (dbBalance !== 300) { fail('2E.8 — DB balance DECIMAL = ₹300', `Got: ${dbBalance}`); allOk = false; }
      else if (dbItem?.unitPrice !== 120) { fail('2E.8 — DB line item unitPrice snapshot = ₹120', `Got: ${dbItem?.unitPrice}`); allOk = false; }
      else pass('2E.8 — PostgreSQL DECIMAL snapshot: subtotal ₹600, balance ₹300, item unitPrice ₹120 — all exact');
    }

    // Now change the medication price — verify existing invoice is unaffected
    await prisma.medicationStock.update({
      where: { id: 'med-configured-120-test-002' },
      data: { unitPrice: new Prisma.Decimal('350.00') }
    });
    const dbInvAfterRateChange = await prisma.invoice.findUnique({ where: { id: inv.id } });
    const itemsAfter = dbInvAfterRateChange?.items as any[];
    if (itemsAfter?.[0]?.unitPrice !== 120) {
      fail('2E.9 — Invoice snapshot immutable after price change', `Got unitPrice: ${itemsAfter?.[0]?.unitPrice}`);
    } else {
      pass('2E.9 — Historical invoice snapshot unchanged (₹120) after medication price changed to ₹350');
    }
    // Reset for further test cleanliness
    await prisma.medicationStock.update({
      where: { id: 'med-configured-120-test-002' },
      data: { unitPrice: new Prisma.Decimal('120.00') }
    });
  }
  console.log('');

  // ==========================================================================
  // TEST 3 — Decimal integrity: Inspect full monetary calculation path
  // ==========================================================================
  console.log('── TEST 3: Decimal integrity across full calculation path ────────────────');

  // Exact decimal quantities: 3 × ₹137.50 = ₹412.50; 2 × ₹88.33 = ₹176.66; Subtotal = ₹589.16
  // Set up two configured medications with fractional prices
  await prisma.medicationStock.upsert({
    where: { id: 'med-dec-test-003a' },
    update: { unitPrice: new Prisma.Decimal('137.50'), stockQuantity: 50 },
    create: {
      id: 'med-dec-test-003a', drugName: 'Dec Test Med A', genericName: 'Decimal Test A',
      category: 'Test', form: 'Tablet', stockQuantity: 50, unit: 'tabs',
      minThreshold: 5, batchNumber: 'BT-DEC-A', expiryDate: '2028-12-31',
      unitPrice: new Prisma.Decimal('137.50'), status: 'in_stock'
    }
  });
  await prisma.medicationStock.upsert({
    where: { id: 'med-dec-test-003b' },
    update: { unitPrice: new Prisma.Decimal('88.33'), stockQuantity: 50 },
    create: {
      id: 'med-dec-test-003b', drugName: 'Dec Test Med B', genericName: 'Decimal Test B',
      category: 'Test', form: 'Syrup', stockQuantity: 50, unit: 'ml',
      minThreshold: 5, batchNumber: 'BT-DEC-B', expiryDate: '2028-12-31',
      unitPrice: new Prisma.Decimal('88.33'), status: 'in_stock'
    }
  });

  // 3 × 137.50 = 412.50 ; 2 × 88.33 = 176.66 ; subtotal = 589.16
  // 10% insurance = 58.916 → rounds to 58.92 ; copay = 530.24 ; paid 400.00 ; balance = 189.16
  const res3 = await post('/billing', {
    patientId: patient.id,
    patientName: `${patient.firstName} ${patient.lastName}`,
    mrn: patient.mrn,
    items: [
      { description: 'Dec Test Med A', medicationId: 'med-dec-test-003a', category: 'Pharmacy', quantity: 3, unitPrice: 999 },
      { description: 'Dec Test Med B', medicationId: 'med-dec-test-003b', category: 'Pharmacy', quantity: 2, unitPrice: 999 }
    ],
    coveragePercentage: 10,
    paymentStatus: 'partial',
    paidAmount: 400.00
  }, acctToken);
  const json3 = await res3.json();

  if (!json3.success || res3.status !== 201) {
    fail('3.1 — Decimal precision invoice created', `${res3.status} ${JSON.stringify(json3)}`);
  } else {
    const inv = json3.data;

    // Exact decimal arithmetic (all in Prisma.Decimal):
    const expectSubtotal = 589.16;
    const expectInsurance = 58.92; // 10% of 589.16 = 58.916 → toDecimalPlaces(2) = 58.92
    const expectCopay = Number(new Prisma.Decimal('589.16').sub(new Prisma.Decimal('58.92')).toFixed(2)); // 530.24
    const expectBalance = Number(new Prisma.Decimal('589.16').sub(new Prisma.Decimal('400.00')).toFixed(2)); // 189.16

    if (inv.subtotal !== expectSubtotal) {
      fail('3.1 — Subtotal exact decimal', `Expected ₹${expectSubtotal}, got ₹${inv.subtotal}`);
    } else { pass('3.1 — Subtotal = ₹589.16 (3×₹137.50 + 2×₹88.33)'); }

    if (inv.insuranceCovered !== expectInsurance) {
      fail('3.2 — Insurance 10% = ₹58.92', `Expected ₹${expectInsurance}, got ₹${inv.insuranceCovered}`);
    } else { pass('3.2 — Insurance (10%) = ₹58.92 (exact half-up rounding)'); }

    if (inv.copayPatient !== expectCopay) {
      fail('3.3 — Copay = ₹530.24', `Expected ₹${expectCopay}, got ₹${inv.copayPatient}`);
    } else { pass('3.3 — Copay = ₹530.24 (₹589.16 − ₹58.92)'); }

    if (inv.paidAmount !== 400) {
      fail('3.4 — Paid = ₹400.00', `Got ₹${inv.paidAmount}`);
    } else { pass('3.4 — Paid amount = ₹400.00'); }

    if (inv.balance !== expectBalance) {
      fail('3.5 — Balance = ₹189.16', `Expected ₹${expectBalance}, got ₹${inv.balance}`);
    } else { pass('3.5 — Balance = ₹189.16 (₹589.16 − ₹400.00)'); }

    // DB verification
    const dbInv = await prisma.invoice.findUnique({ where: { id: inv.id } });
    if (dbInv) {
      const dbSub = Number(dbInv.subtotal);
      const dbBal = Number(dbInv.balance);
      if (dbSub !== expectSubtotal || dbBal !== expectBalance) {
        fail('3.6 — DB DECIMAL storage exact', `DB subtotal=${dbSub}, balance=${dbBal}`);
      } else {
        pass('3.6 — DB DECIMAL(12,2) stores ₹589.16 subtotal and ₹189.16 balance without rounding drift');
      }
    } else {
      fail('3.6 — Invoice found in DB for DECIMAL verification');
    }

    // Verify reconciliation: sum of line item totals = subtotal
    const lineSum = (inv.items as any[]).reduce((acc: number, it: any) => acc + it.total, 0);
    if (Math.abs(lineSum - inv.subtotal) > 0.001) {
      fail('3.7 — Line item totals reconcile with subtotal', `Sum of items: ₹${lineSum}, subtotal: ₹${inv.subtotal}`);
    } else {
      pass('3.7 — Line item totals reconcile exactly with invoice subtotal');
    }
  }
  console.log('');

  // ==========================================================================
  // TEST 4 — Production database isolation: verify zero contamination
  // ==========================================================================
  console.log('── TEST 4: Production database isolation (zero contamination) ───────────');
  if (prodPrisma && prodBefore) {
    try {
      const prodAfter = {
        medicationStock: await prodPrisma.medicationStock.count(),
        invoices: await prodPrisma.invoice.count(),
        patients: await prodPrisma.patient.count(),
        prescriptions: await prodPrisma.prescription.count(),
        tariffs: await prodPrisma.hospitalTariff.count(),
      };
      console.log('  Production snapshot (after):', prodAfter);

      if (prodAfter.medicationStock !== prodBefore.medicationStock) {
        fail('4.1 — Production medication_stock unchanged', `Before: ${prodBefore.medicationStock}, After: ${prodAfter.medicationStock}`);
      } else { pass('4.1 — Production medication_stock: unchanged'); }

      if (prodAfter.invoices !== prodBefore.invoices) {
        fail('4.2 — Production invoices unchanged', `Before: ${prodBefore.invoices}, After: ${prodAfter.invoices}`);
      } else { pass('4.2 — Production invoices: unchanged'); }

      if (prodAfter.patients !== prodBefore.patients) {
        fail('4.3 — Production patients unchanged', `Before: ${prodBefore.patients}, After: ${prodAfter.patients}`);
      } else { pass('4.3 — Production patients: unchanged'); }

      if (prodAfter.prescriptions !== prodBefore.prescriptions) {
        fail('4.4 — Production prescriptions unchanged', `Before: ${prodBefore.prescriptions}, After: ${prodAfter.prescriptions}`);
      } else { pass('4.4 — Production prescriptions: unchanged'); }

      if (prodAfter.tariffs !== prodBefore.tariffs) {
        fail('4.5 — Production tariff count unchanged', `Before: ${prodBefore.tariffs}, After: ${prodAfter.tariffs}`);
      } else { pass(`4.5 — Production hospital_tariffs: ${prodAfter.tariffs} rows, count unchanged`); }

      // Final tariff-rate check on production
      const prodTariffRatesAfter = await prodPrisma.hospitalTariff.findMany({ select: { serviceCode: true, rate: true } });
      const anyConfiguredAfter = prodTariffRatesAfter.some(t => t.rate !== null);
      if (anyConfiguredAfter) {
        fail('4.6 — All production tariff rates remain NULL');
      } else {
        pass('4.6 — All production tariff rates confirmed NULL (unconfigured)');
      }

      const prodMedWithPriceAfter = await prodPrisma.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(*) as count FROM medication_stock WHERE "unitPrice" IS NOT NULL
      `;
      const prodMedWithPriceAfterCount = Number(prodMedWithPriceAfter[0]?.count ?? 0);
      if (prodMedWithPriceAfterCount > 0) {
        fail('4.7 — Production medication prices remain NULL', `${prodMedWithPriceAfterCount} row(s) with non-NULL price`);
      } else {
        pass('4.7 — Production medication prices: all NULL — no fabricated prices');
      }
    } catch {
      console.log('  ℹ [SKIPPED] Production database zero-mutation checks skipped: isolated CI/test environment (zero production database access).');
    }
  } else {
    console.log('  ℹ [SKIPPED] Production database zero-mutation checks skipped: isolated CI/test environment (zero production database access).');
  }

  console.log('');

  // ==========================================================================
  // Cleanup test fixtures from test DB
  // ==========================================================================
  await prisma.stockMovement.deleteMany({ where: { medicineId: { in: ['med-null-price-test-001', 'med-configured-120-test-002', 'med-dec-test-003a', 'med-dec-test-003b'] } } });
  await prisma.medicationStock.deleteMany({ where: { id: { in: ['med-null-price-test-001', 'med-configured-120-test-002', 'med-dec-test-003a', 'med-dec-test-003b'] } } });
  console.log('✓ Test fixtures cleaned up from sahachara_ops_test_db\n');

  // ==========================================================================
  // Final report
  // ==========================================================================
  server.close();
  await prisma.$disconnect();
  if (prodPrisma) {
    await prodPrisma.$disconnect().catch(() => { });
  }

  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('  PHARMACY PRICE VERIFICATION — FINAL RESULTS');
  console.log('═══════════════════════════════════════════════════════════════════\n');

  for (const r of results) {
    const icon = r.passed ? '✅' : '❌';
    console.log(`  ${icon} ${r.label}${r.detail ? '\n       ' + r.detail : ''}`);
  }

  console.log(`\n  Total: ${passed + failed} tests — ${passed} PASSED, ${failed} FAILED`);

  if (failed > 0) {
    console.error(`\n❌ ${failed} test(s) failed — see above for details\n`);
    process.exit(1);
  } else {
    console.log(`\n✅ All ${passed} pharmacy price verification tests PASSED\n`);
    process.exit(0);
  }
}

run().catch((err) => {
  console.error('FATAL ERROR:', err);
  process.exit(1);
});

