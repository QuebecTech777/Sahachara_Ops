import express from 'express';
import http from 'http';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

// Colors for clean console reporting
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const RESET = '\x1b[0m';

// ---------------------------------------------------------------------------
// TEST DATABASE ISOLATION GUARD
// ---------------------------------------------------------------------------
const PROD_DB_URL = 'postgresql://highflyer@localhost:5432/sahachara_ops_db';
const TEST_DB_URL = process.env.TEST_DATABASE_URL || 'postgresql://highflyer@localhost:5432/sahachara_ops_test_db';

// Hard refusal: If DATABASE_URL points to production and TEST_DATABASE_URL is not set or matches prod
if (process.env.DATABASE_URL?.includes('sahachara_ops_db') && process.env.TEST_DATABASE_URL?.includes('sahachara_ops_db')) {
  console.error(`\n${RED}FATAL SECURITY VIOLATION: Automated tests must NOT run against the production database (sahachara_ops_db)!${RESET}`);
  console.error(`${RED}Configure a dedicated TEST_DATABASE_URL. Aborting.${RESET}\n`);
  process.exit(1);
}

// Redirect execution to dedicated test database
process.env.DATABASE_URL = TEST_DB_URL;
process.env.ENABLE_TEST_ACCOUNTS = 'true';
process.env.NODE_ENV = 'test';

import { apiRouter } from '../server/routes.ts';
import { generateSessionToken } from '../server/rbacMiddleware.ts';
import { checkPrismaConnection, ensureDefaultDatabaseUsers, prisma, isPrismaConnected, dbUpdateTariffRate } from '../server/prismaService.ts';
import { hospitalStore } from '../server/dataStore.ts';

const prodProbePrisma = new PrismaClient({
  datasources: { db: { url: PROD_DB_URL } }
});

async function getProductionDatabaseSnapshot() {
  const [users, patients, prescriptions, invoices, tariffs, staff] = await Promise.all([
    prodProbePrisma.user.count(),
    prodProbePrisma.patient.count(),
    prodProbePrisma.prescription.count(),
    prodProbePrisma.invoice.count(),
    prodProbePrisma.hospitalTariff.count(),
    prodProbePrisma.staffMember.count()
  ]);
  return { users, patients, prescriptions, invoices, tariffs, staff };
}

interface TestCase {
  name: string;
  method: string;
  path: string;
  role?: string;
  token?: string;
  headers?: Record<string, string>;
  body?: any;
  expectedStatus: number;
}

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    passed++;
    console.log(`  ${GREEN}✓ PASS${RESET} ${testName}`);
  } else {
    failed++;
    console.log(`  ${RED}✗ FAIL${RESET} ${testName}${detail ? ` (${detail})` : ''}`);
  }
}

async function runTests() {
  console.log(`\n${CYAN}============================================================${RESET}`);
  console.log(`${CYAN}   SAHACHARA OPS — 7-ROLE RBAC & TARIFF VERIFICATION SUITE   ${RESET}`);
  console.log(`${CYAN}============================================================${RESET}\n`);

  // 1. Verify that the test connection is strictly isolated
  await checkPrismaConnection();
  const dbInfo = await prisma.$queryRaw<[{ current_database: string }]>`SELECT current_database()`;
  const connectedTestDb = dbInfo[0]?.current_database;
  if (connectedTestDb !== 'sahachara_ops_test_db') {
    console.error(`\n${RED}FATAL: Integration test connected to "${connectedTestDb}". Expected "sahachara_ops_test_db". ABORTING.${RESET}`);
    process.exit(1);
  }
  console.log(`${GREEN}✓ Isolated Test Database Connected:${RESET} ${connectedTestDb}`);

  // 2. Snapshot production hospital database state before tests
  const prodBeforeSnapshot = await getProductionDatabaseSnapshot();
  console.log(`${CYAN}✓ Production Database Pre-Test State Snapshot:${RESET}`, prodBeforeSnapshot);

  // 3. Ensure test DB users and tariffs are provisioned
  await ensureDefaultDatabaseUsers();

  // Clean test DB fixtures before start to ensure fresh isolated run
  if (isPrismaConnected) {
    try {
      if (process.env.DATABASE_URL?.includes('test_db') || process.env.DATABASE_URL?.includes('sahachara_ops_test')) {
        await prisma.$executeRawUnsafe('TRUNCATE TABLE refund_ledger_entries, rate_histories, dispensing_records CASCADE').catch(() => {});
      }
      await (prisma as any).paymentAllocation?.deleteMany({});
      await (prisma as any).refundRequest?.deleteMany({});
      await (prisma as any).payment?.deleteMany({});
      await (prisma as any).dispensingRecord?.deleteMany({}).catch(() => {});
      await prisma.rateHistory.deleteMany({}).catch(() => {});
      await prisma.stockMovement.deleteMany({});
      await prisma.medicationStock.deleteMany({});
      await prisma.invoice.deleteMany({});
      await prisma.prescription.deleteMany({});
      await prisma.labOrder.deleteMany({});
      await prisma.appointment.deleteMany({});
      await prisma.consultation.deleteMany({});
      await (prisma as any).therapySession?.deleteMany({});
      await (prisma as any).panchakarmaPhaseTransition?.deleteMany({});
      await prisma.panchakarmaCourse.deleteMany({});
      await prisma.treatmentPlan.deleteMany({});
      await (prisma as any).clinicalVitals?.deleteMany({});
      await (prisma as any).clinicalAssessment?.deleteMany({});
      await (prisma as any).clinicalDiagnosis?.deleteMany({});
      await (prisma as any).prakritiAssessment?.deleteMany({});
      await (prisma as any).vikritiAssessment?.deleteMany({});
      await (prisma as any).doshaEvaluation?.deleteMany({});
      await (prisma as any).panchakarmaReferral?.deleteMany({});
      await (prisma as any).clinicalEncounter?.deleteMany({});
      await prisma.patient.deleteMany({});
    } catch {
      // ignore
    }

    await prisma.patient.upsert({
      where: { id: 'pat-101' },
      update: {},
      create: {
        id: 'pat-101',
        mrn: 'SAH-2026-00101',
        firstName: 'Elena',
        lastName: 'Rostova',
        phone: '+91 98470 10101',
        gender: 'Female',
        status: 'active',
        admissionStatus: 'outpatient'
      }
    });

    await prisma.patient.upsert({
      where: { id: 'pat-102' },
      update: {},
      create: {
        id: 'pat-102',
        mrn: 'SAH-2026-00102',
        firstName: 'Beatriz',
        lastName: 'Alvarez',
        phone: '+91 98470 10102',
        gender: 'Female',
        status: 'active',
        admissionStatus: 'inpatient'
      }
    });
  }

  const app = express();
  app.use(express.json());
  app.use('/api', apiRouter);

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as any).port;
  const baseUrl = `http://127.0.0.1:${port}/api`;

  // Generate valid session tokens for each of the 7 permitted roles
  const tokens = {
    SUPER_ADMIN: generateSessionToken({ userId: 'usr-superadmin', email: 'systems@sahachara.com', name: 'Sahachara Systems', role: 'SUPER_ADMIN' }),
    ADMIN: generateSessionToken({ userId: 'usr-admin', email: 'admin.ops@sahachara.com', name: 'Marcus Sterling', role: 'ADMIN' }),
    DOCTOR: generateSessionToken({ userId: 'usr-doc', email: 'robert.rivera@sahachara.com', name: 'Dr. Robert Rivera', role: 'DOCTOR' }),
    VAIDYA: generateSessionToken({ userId: 'usr-vaidya', email: 'sarah.chen@sahachara.com', name: 'Dr. Sarah Chen', role: 'VAIDYA' }),
    RECEPTIONIST: generateSessionToken({ userId: 'usr-reception', email: 'receptionist@sahachara.com', name: 'Kavita Sharma', role: 'RECEPTIONIST' }),
    PHARMACIST: generateSessionToken({ userId: 'usr-pharma', email: 'pharmacist@sahachara.com', name: 'Rajesh Nair', role: 'PHARMACIST' }),
    ACCOUNTANT: generateSessionToken({ userId: 'usr-accountant', email: 'accountant@sahachara.com', name: 'Anand Pillai', role: 'ACCOUNTANT' })
  };

  async function call(tc: TestCase): Promise<Response> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(tc.headers || {})
    };
    if (tc.token) {
      headers['Authorization'] = `Bearer ${tc.token}`;
    }

    return fetch(`${baseUrl}${tc.path}`, {
      method: tc.method,
      headers,
      body: tc.body ? JSON.stringify(tc.body) : undefined
    });
  }

  try {
  // -------------------------------------------------------------
  // TEST SECTION 1: AUTHENTICATION REQUIREMENT & ANTI-SPOOFING
  // -------------------------------------------------------------
  console.log(`${YELLOW}1. Authentication Requirement & Anti-Spoofing Verification${RESET}`);
  {
    // 1.1 Unauthenticated mutation rejected with 401
    const res1 = await call({
      name: 'Unauthenticated DELETE patient fails with 401',
      method: 'DELETE',
      path: '/patients/pat-101',
      expectedStatus: 401
    });
    assert(res1.status === 401, 'Unauthenticated request to DELETE /api/patients/:id is rejected with 401', `Status: ${res1.status}`);

    // 1.2 Invalid token rejected with 401
    const res2 = await call({
      name: 'Tampered/Malformed Bearer token rejected with 401',
      method: 'DELETE',
      path: '/patients/pat-101',
      token: 'sah_invalidpayload.invalidsignature',
      expectedStatus: 401
    });
    assert(res2.status === 401, 'Tampered Bearer token rejected with 401', `Status: ${res2.status}`);

    // 1.3 Client-supplied header spoofing attempt
    const res3 = await call({
      name: 'Client header spoofing (x-user-role: SUPER_ADMIN with RECEPTIONIST token) fails with 403',
      method: 'DELETE',
      path: '/patients/pat-101',
      token: tokens.RECEPTIONIST,
      headers: { 'x-user-role': 'SUPER_ADMIN' },
      expectedStatus: 403
    });
    assert(res3.status === 403, 'Client-supplied x-user-role header CANNOT override database token role', `Status: ${res3.status}`);
  }

  // -------------------------------------------------------------
  // TEST SECTION 2: SUPER_ADMIN PRIVILEGES & PROTECTED ACTIONS
  // -------------------------------------------------------------
  console.log(`\n${YELLOW}2. SUPER_ADMIN Privileges & Protected Deletions${RESET}`);
  {
    // 2.1 SUPER_ADMIN can read all patients
    const res1 = await call({
      name: 'SUPER_ADMIN can read patient directory',
      method: 'GET',
      path: '/patients',
      token: tokens.SUPER_ADMIN,
      expectedStatus: 200
    });
    assert(res1.status === 200, 'SUPER_ADMIN can query patient directory (200 OK)', `Status: ${res1.status}`);

    // 2.2 SUPER_ADMIN can delete patient
    const res2 = await call({
      name: 'SUPER_ADMIN can perform protected patient deletion',
      method: 'DELETE',
      path: '/patients/pat-101',
      token: tokens.SUPER_ADMIN,
      expectedStatus: 200
    });
    assert(res2.status === 200, 'SUPER_ADMIN is authorized to delete patient record (200 OK)', `Status: ${res2.status}`);

    // 2.3 SUPER_ADMIN can manage user roles
    const res3 = await call({
      name: 'SUPER_ADMIN can update user roles',
      method: 'PATCH',
      path: '/rbac/users/usr-reception/role',
      token: tokens.SUPER_ADMIN,
      body: { role: 'RECEPTIONIST' },
      expectedStatus: 200
    });
    assert(res3.status === 200, 'SUPER_ADMIN can assign/update user roles (200 OK)', `Status: ${res3.status}`);
  }

  // -------------------------------------------------------------
  // TEST SECTION 3: ADMIN BOUNDARIES & ESCALATION GUARDS
  // -------------------------------------------------------------
  console.log(`\n${YELLOW}3. ADMIN Operational Authority & Escalation Prevention${RESET}`);
  {
    // 3.1 ADMIN CANNOT delete patient records
    const res1 = await call({
      name: 'ADMIN cannot delete patient records',
      method: 'DELETE',
      path: '/patients/pat-102',
      token: tokens.ADMIN,
      expectedStatus: 403
    });
    assert(res1.status === 403, 'ADMIN is forbidden from deleting patient records (403 Forbidden)', `Status: ${res1.status}`);

    // 3.2 ADMIN cannot promote users to SUPER_ADMIN
    const res2 = await call({
      name: 'ADMIN privilege escalation attempt to SUPER_ADMIN blocked',
      method: 'PATCH',
      path: '/rbac/users/usr-reception/role',
      token: tokens.ADMIN,
      body: { role: 'SUPER_ADMIN' },
      expectedStatus: 403
    });
    assert(res2.status === 403, 'ADMIN cannot promote users to SUPER_ADMIN (403 Forbidden)', `Status: ${res2.status}`);

    // 3.3 ADMIN cannot modify role of existing SUPER_ADMIN
    const modSuperRes = await call({
      name: 'ADMIN cannot modify existing SUPER_ADMIN role',
      method: 'PATCH',
      path: '/rbac/users/usr-superadmin/role',
      token: tokens.ADMIN,
      body: { role: 'ADMIN' },
      expectedStatus: 403
    });
    assert(modSuperRes.status === 403, 'ADMIN cannot demote or alter SUPER_ADMIN account (403 Forbidden)', `Status: ${modSuperRes.status}`);

    // 3.4 ADMIN can onboard regular staff (DOCTOR)
    const validStaffRes = await call({
      name: 'ADMIN can onboard operational staff (DOCTOR)',
      method: 'POST',
      path: '/staff',
      token: tokens.ADMIN,
      body: { 
        name: 'Dr. Test Physician', 
        role: 'DOCTOR', 
        email: `test.doc.${Date.now()}@sahachara.com`, 
        department: 'Emergency Medicine',
        designation: 'Senior Medical Officer',
        phone: '+91 98765 43210'
      },
      expectedStatus: 201
    });
    assert(validStaffRes.status === 201, 'ADMIN can onboard legitimate operational staff (201 Created)', `Status: ${validStaffRes.status}`);

    // 3.5 ADMIN CANNOT configure tariffs (SUPER_ADMIN exclusive)
    const adminTariffRes = await call({
      name: 'ADMIN cannot configure hospital tariffs (SUPER_ADMIN exclusive)',
      method: 'PATCH',
      path: '/tariffs/TEST-UNAUTH-TARIFF/rate',
      token: tokens.ADMIN,
      body: { rate: 1250 },
      expectedStatus: 403
    });
    assert(adminTariffRes.status === 403, 'ADMIN is forbidden from configuring hospital tariffs (403 Forbidden)', `Status: ${adminTariffRes.status}`);

    // 3.6 ADMIN CANNOT create new hospital services
    const adminCreateTariffRes = await call({
      name: 'ADMIN cannot create hospital services (SUPER_ADMIN exclusive)',
      method: 'POST',
      path: '/tariffs',
      token: tokens.ADMIN,
      body: { serviceCode: 'TEST-ADM', serviceName: 'Admin Created Service', category: 'Procedure', unit: 'session' },
      expectedStatus: 403
    });
    assert(adminCreateTariffRes.status === 403, 'ADMIN is forbidden from creating hospital services (403 Forbidden)', `Status: ${adminCreateTariffRes.status}`);
  }

  // -------------------------------------------------------------
  // TEST SECTION 4: DOCTOR VS VAIDYA CLINICAL BOUNDARIES
  // -------------------------------------------------------------
  console.log(`\n${YELLOW}4. DOCTOR vs VAIDYA Separation & Clinical Boundaries${RESET}`);
  {
    // 4.1 DOCTOR can write modern prescription
    const docRxRes = await call({
      name: 'DOCTOR can write prescription',
      method: 'POST',
      path: '/pharmacy/prescriptions',
      token: tokens.DOCTOR,
      body: { patientId: 'pat-102', patientName: 'Beatriz Alvarez', medicationName: 'Amoxicillin 500mg', dosage: '500 mg' },
      expectedStatus: 201
    });
    assert(docRxRes.status === 201, 'DOCTOR can order medication prescription (201 Created)', `Status: ${docRxRes.status}`);

    // 4.2 DOCTOR can order lab panel
    const docLabRes = await call({
      name: 'DOCTOR can order lab panel',
      method: 'POST',
      path: '/laboratory',
      token: tokens.DOCTOR,
      body: { patientId: 'pat-102', patientName: 'Beatriz Alvarez', testType: 'Complete Blood Count (CBC)' },
      expectedStatus: 201
    });
    assert(docLabRes.status === 201, 'DOCTOR can order diagnostic laboratory tests (201 Created)', `Status: ${docLabRes.status}`);

    // 4.3 DOCTOR can score emergency triage
    const docTriageRes = await call({
      name: 'DOCTOR can perform emergency triage intake',
      method: 'POST',
      path: '/triage',
      token: tokens.DOCTOR,
      body: { patientId: 'pat-102', patientName: 'Beatriz Alvarez', esiLevel: 2, chiefComplaint: 'Acute Chest Pain' },
      expectedStatus: 201
    });
    assert(docTriageRes.status === 201, 'DOCTOR can score and manage emergency triage (201 Created)', `Status: ${docTriageRes.status}`);

    // 4.4 DOCTOR CANNOT create Ayurvedic treatment plan (Vaidya exclusive)
    const docTreatRes = await call({
      name: 'DOCTOR cannot create Ayurvedic treatment plan',
      method: 'POST',
      path: '/treatments',
      token: tokens.DOCTOR,
      body: { patientId: 'pat-102', therapyType: 'Abhyanga (Herbal Full Body Massage)' },
      expectedStatus: 403
    });
    assert(docTreatRes.status === 403, 'DOCTOR is strictly forbidden from creating Ayurvedic treatment plan (403 Forbidden)', `Status: ${docTreatRes.status}`);

    // 4.5 DOCTOR CANNOT create Panchakarma course (Vaidya exclusive)
    const docPkRes = await call({
      name: 'DOCTOR cannot create Panchakarma course',
      method: 'POST',
      path: '/panchakarma',
      token: tokens.DOCTOR,
      body: { patientId: 'pat-102', protocol: 'Virechana' },
      expectedStatus: 403
    });
    assert(docPkRes.status === 403, 'DOCTOR is strictly forbidden from creating Panchakarma course (403 Forbidden)', `Status: ${docPkRes.status}`);

    // 4.6 VAIDYA can conduct Ayurvedic consultation with Prakriti/Vikriti
    const vaidyaConRes = await call({
      name: 'VAIDYA can document Ayurvedic consultation',
      method: 'POST',
      path: '/consultations',
      token: tokens.VAIDYA,
      body: {
        patientId: 'pat-102',
        patientName: 'Beatriz Alvarez',
        chiefComplaint: 'Sandhigata Vata & Amavata joint stiffness',
        classicalDiagnosis: 'Sandhigata Vata with Sama Agni'
      },
      expectedStatus: 201
    });
    assert(vaidyaConRes.status === 201, 'VAIDYA can document Ayurvedic clinical consultation (201 Created)', `Status: ${vaidyaConRes.status}`);

    // 4.7 VAIDYA can create Ayurvedic therapy treatment plan
    const vaidyaTreatRes = await call({
      name: 'VAIDYA can create Ayurvedic treatment plan',
      method: 'POST',
      path: '/treatments',
      token: tokens.VAIDYA,
      body: {
        patientId: 'pat-102',
        patientName: 'Beatriz Alvarez',
        therapyType: 'Abhyanga (Herbal Full Body Massage)',
        oilOrFormulation: 'Sahacharadi Thailam',
        totalSessions: 7
      },
      expectedStatus: 201
    });
    assert(vaidyaTreatRes.status === 201, 'VAIDYA can prescribe Ayurvedic therapy treatment plan (201 Created)', `Status: ${vaidyaTreatRes.status}`);

    // 4.8 VAIDYA can create Panchakarma course
    const vaidyaPkRes = await call({
      name: 'VAIDYA can create Panchakarma course',
      method: 'POST',
      path: '/panchakarma',
      token: tokens.VAIDYA,
      body: {
        patientId: 'pat-102',
        patientName: 'Beatriz Alvarez',
        protocol: 'Virechana (Therapeutic Purgation - Pitta Cleansing)',
        totalDays: 14,
        dietaryPrescription: 'Samsarjana Krama'
      },
      expectedStatus: 201
    });
    assert(vaidyaPkRes.status === 201, 'VAIDYA can initiate classical Panchakarma course (201 Created)', `Status: ${vaidyaPkRes.status}`);

    // 4.9 VAIDYA CANNOT score emergency triage (Doctor / Receptionist role)
    const vaidyaTriageRes = await call({
      name: 'VAIDYA cannot score emergency triage intake',
      method: 'POST',
      path: '/triage',
      token: tokens.VAIDYA,
      body: { patientId: 'pat-102', esiLevel: 1, chiefComplaint: 'Cardiac Arrest' },
      expectedStatus: 403
    });
    assert(vaidyaTriageRes.status === 403, 'VAIDYA is forbidden from managing acute emergency triage (403 Forbidden)', `Status: ${vaidyaTriageRes.status}`);

    // 4.10 Neither DOCTOR nor VAIDYA can access billing mutation
    const docBillRes = await call({
      name: 'DOCTOR cannot bill patients',
      method: 'POST',
      path: '/billing',
      token: tokens.DOCTOR,
      body: { patientId: 'pat-102', items: [{ description: 'Care', category: 'Physician Fee', quantity: 1, unitPrice: 500, total: 500 }] },
      expectedStatus: 403
    });
    assert(docBillRes.status === 403, 'DOCTOR cannot generate billing invoice (403 Forbidden)', `Status: ${docBillRes.status}`);

    const vaidyaBillRes = await call({
      name: 'VAIDYA cannot bill patients',
      method: 'POST',
      path: '/billing',
      token: tokens.VAIDYA,
      body: { patientId: 'pat-102', items: [{ description: 'Care', category: 'Physician Fee', quantity: 1, unitPrice: 500, total: 500 }] },
      expectedStatus: 403
    });
    assert(vaidyaBillRes.status === 403, 'VAIDYA cannot generate billing invoice (403 Forbidden)', `Status: ${vaidyaBillRes.status}`);

    // Provision isolated test lab order fixtures for verification testing
    hospitalStore.labOrders.push(
      {
        id: 'lab-301',
        orderNumber: 'LAB-2026-TEST01',
        patientId: 'pat-test',
        patientName: 'Test Patient',
        mrn: 'MRN-TEST-001',
        testType: 'Cardiac Troponin I',
        priority: 'STAT (Immediate)',
        orderingDoctor: 'Dr. Test Physician',
        orderedAt: new Date().toISOString(),
        status: 'ordered'
      },
      {
        id: 'lab-302',
        orderNumber: 'LAB-2026-TEST02',
        patientId: 'pat-test',
        patientName: 'Test Patient',
        mrn: 'MRN-TEST-001',
        testType: 'Comprehensive Metabolic Panel',
        priority: 'Routine',
        orderingDoctor: 'Vaidya Test Practitioner',
        orderedAt: new Date().toISOString(),
        status: 'ordered'
      }
    );

    // 4.11 DOCTOR can review and verify laboratory results with standard clinical attribution
    const docLabReviewRes = await call({
      name: 'DOCTOR can review and verify diagnostic lab results',
      method: 'PATCH',
      path: '/laboratory/lab-301',
      token: tokens.DOCTOR,
      body: { status: 'verified', resultValue: '0.18 ng/mL', labNotes: 'Clinical correlation confirmed by attending physician.' },
      expectedStatus: 200
    });
    const docLabData = await docLabReviewRes.json();
    assert(
      docLabReviewRes.status === 200 && docLabData.data?.verifiedBy === 'Dr. Robert Rivera',
      `DOCTOR reviews/verifies lab result with clinical attribution (verifiedBy: ${docLabData.data?.verifiedBy})`,
      `Status: ${docLabReviewRes.status}`
    );

    // 4.12 VAIDYA can review and verify laboratory results with standard clinical attribution
    const vaidyaLabReviewRes = await call({
      name: 'VAIDYA can review and verify diagnostic lab results',
      method: 'PATCH',
      path: '/laboratory/lab-302',
      token: tokens.VAIDYA,
      body: { status: 'verified', labNotes: 'Holistic clinical evaluation completed by Vaidya.' },
      expectedStatus: 200
    });
    const vaidyaLabData = await vaidyaLabReviewRes.json();
    assert(
      vaidyaLabReviewRes.status === 200 && vaidyaLabData.data?.verifiedBy === 'Dr. Sarah Chen',
      `VAIDYA reviews/verifies lab result with clinical attribution (verifiedBy: ${vaidyaLabData.data?.verifiedBy})`,
      `Status: ${vaidyaLabReviewRes.status}`
    );

    // 4.13 Non-clinical staff (RECEPTIONIST) CANNOT review or verify laboratory results
    const recLabReviewRes = await call({
      name: 'RECEPTIONIST cannot review or verify lab results',
      method: 'PATCH',
      path: '/laboratory/lab-301',
      token: tokens.RECEPTIONIST,
      body: { status: 'verified' },
      expectedStatus: 403
    });
    assert(recLabReviewRes.status === 403, 'RECEPTIONIST is strictly forbidden from reviewing/verifying lab results (403 Forbidden)', `Status: ${recLabReviewRes.status}`);
  }

  // -------------------------------------------------------------
  // TEST SECTION 5: RECEPTIONIST AUTHORITY & BOUNDARIES
  // -------------------------------------------------------------
  console.log(`\n${YELLOW}5. RECEPTIONIST Front Desk Authority & Boundaries${RESET}`);
  {
    // 5.1 RECEPTIONIST can register new patient
    const regRes = await call({
      name: 'RECEPTIONIST can register new patient',
      method: 'POST',
      path: '/patients',
      token: tokens.RECEPTIONIST,
      body: { firstName: 'Kiran', lastName: 'Menon', dob: '1985-06-12', age: 41, phone: '+91 98471 23456' },
      expectedStatus: 201
    });
    assert(regRes.status === 201, 'RECEPTIONIST can register new patient dossier (201 Created)', `Status: ${regRes.status}`);

    // 5.2 RECEPTIONIST can schedule appointment
    const aptRes = await call({
      name: 'RECEPTIONIST can schedule appointment',
      method: 'POST',
      path: '/appointments',
      token: tokens.RECEPTIONIST,
      body: { patientName: 'Kiran Menon', patientMrn: 'MRN-84920', doctorName: 'Dr. Sarah Chen, BAMS, MD (Ayu)', timeSlot: '10:00 AM' },
      expectedStatus: 201
    });
    assert(aptRes.status === 201, 'RECEPTIONIST can schedule appointment (201 Created)', `Status: ${aptRes.status}`);

    // 5.3 RECEPTIONIST cannot write prescription
    const rxRes = await call({
      name: 'RECEPTIONIST cannot write prescription',
      method: 'POST',
      path: '/pharmacy/prescriptions',
      token: tokens.RECEPTIONIST,
      body: { medicationName: 'Dhanwantharam Thailam' },
      expectedStatus: 403
    });
    assert(rxRes.status === 403, 'RECEPTIONIST is strictly forbidden from prescribing drugs (403 Forbidden)', `Status: ${rxRes.status}`);

    // 5.4 RECEPTIONIST cannot conduct clinical consultation
    const conRes = await call({
      name: 'RECEPTIONIST cannot conduct clinical consultation',
      method: 'POST',
      path: '/consultations',
      token: tokens.RECEPTIONIST,
      body: { chiefComplaint: 'Unauthorized intake' },
      expectedStatus: 403
    });
    assert(conRes.status === 403, 'RECEPTIONIST cannot document clinical consultations (403 Forbidden)', `Status: ${conRes.status}`);
  }

  // -------------------------------------------------------------
  // TEST SECTION 6: PHARMACIST AUTHORITY & BOUNDARIES
  // -------------------------------------------------------------
  console.log(`\n${YELLOW}6. PHARMACIST Dispensary Authority & Boundaries${RESET}`);
  {
    // 6.1 PHARMACIST can read prescriptions
    const rxListRes = await call({
      name: 'PHARMACIST can read prescription list',
      method: 'GET',
      path: '/pharmacy/prescriptions',
      token: tokens.PHARMACIST,
      expectedStatus: 200
    });
    assert(rxListRes.status === 200, 'PHARMACIST can query prescription list (200 OK)', `Status: ${rxListRes.status}`);

    // 6.2 PHARMACIST can manage stock
    const stockRes = await call({
      name: 'PHARMACIST can add pharmacy stock',
      method: 'POST',
      path: '/pharmacy/stock',
      token: tokens.PHARMACIST,
      body: { drugName: 'Ksheerabala 101 Avarthanam', stockQuantity: 50, minThreshold: 10, unitPrice: 380 },
      expectedStatus: 201
    });
    assert(stockRes.status === 201, 'PHARMACIST can add formulary inventory stock (201 Created)', `Status: ${stockRes.status}`);

    // 6.3 PHARMACIST cannot schedule appointments
    const aptRes = await call({
      name: 'PHARMACIST cannot schedule appointments',
      method: 'POST',
      path: '/appointments',
      token: tokens.PHARMACIST,
      body: { patientName: 'Test' },
      expectedStatus: 403
    });
    assert(aptRes.status === 403, 'PHARMACIST cannot schedule patient appointments (403 Forbidden)', `Status: ${aptRes.status}`);
  }

  // -------------------------------------------------------------
  // TEST SECTION 7: ACCOUNTANT AUTHORITY & BOUNDARIES
  // -------------------------------------------------------------
  console.log(`\n${YELLOW}7. ACCOUNTANT Financial Services Authority & Boundaries${RESET}`);
  {
    // 7.1 ACCOUNTANT can read billing ledger
    const billGetRes = await call({
      name: 'ACCOUNTANT can read billing invoices',
      method: 'GET',
      path: '/billing',
      token: tokens.ACCOUNTANT,
      expectedStatus: 200
    });
    assert(billGetRes.status === 200, 'ACCOUNTANT can read billing ledger (200 OK)', `Status: ${billGetRes.status}`);

    // 7.2 ACCOUNTANT cannot write prescription
    const rxRes = await call({
      name: 'ACCOUNTANT cannot write prescription',
      method: 'POST',
      path: '/pharmacy/prescriptions',
      token: tokens.ACCOUNTANT,
      body: { medicationName: 'Disallowed Med' },
      expectedStatus: 403
    });
    assert(rxRes.status === 403, 'ACCOUNTANT cannot prescribe medication (403 Forbidden)', `Status: ${rxRes.status}`);

    // 7.3 ACCOUNTANT cannot configure tariffs (Admin only)
    const tariffEditRes = await call({
      name: 'ACCOUNTANT cannot configure tariffs',
      method: 'PATCH',
      path: '/tariffs/TEST-UNAUTH-TARIFF',
      token: tokens.ACCOUNTANT,
      body: { rate: 500 },
      expectedStatus: 403
    });
    assert(tariffEditRes.status === 403, 'ACCOUNTANT cannot alter Rate Master tariffs (403 Forbidden)', `Status: ${tariffEditRes.status}`);
  }

  // -------------------------------------------------------------
  // TEST SECTION 8: STRICT REJECTION OF LEGACY & UNSUPPORTED ROLES
  // -------------------------------------------------------------
  console.log(`\n${YELLOW}8. Strict Rejection of Legacy & Unsupported Roles${RESET}`);
  {
    // 8.1 Attempt to assign legacy role "Nurse"
    const legacyNurseRes = await call({
      name: 'Rejection of legacy role "Nurse"',
      method: 'PATCH',
      path: '/rbac/users/usr-reception/role',
      token: tokens.SUPER_ADMIN,
      body: { role: 'Nurse' },
      expectedStatus: 400
    });
    assert(legacyNurseRes.status === 400, 'Legacy role "Nurse" is rejected with 400 Bad Request', `Status: ${legacyNurseRes.status}`);

    // 8.2 Attempt to assign legacy role "Therapist"
    const legacyTherapistRes = await call({
      name: 'Rejection of legacy role "Therapist"',
      method: 'PATCH',
      path: '/rbac/users/usr-reception/role',
      token: tokens.SUPER_ADMIN,
      body: { role: 'Therapist' },
      expectedStatus: 400
    });
    assert(legacyTherapistRes.status === 400, 'Legacy role "Therapist" is rejected with 400 Bad Request', `Status: ${legacyTherapistRes.status}`);

    // 8.3 Attempt to assign unknown role "SuperDoctor"
    const invalidRoleRes = await call({
      name: 'Rejection of invented role "SuperDoctor"',
      method: 'PATCH',
      path: '/rbac/users/usr-reception/role',
      token: tokens.SUPER_ADMIN,
      body: { role: 'SuperDoctor' },
      expectedStatus: 400
    });
    assert(invalidRoleRes.status === 400, 'Unknown role "SuperDoctor" is rejected with 400 Bad Request', `Status: ${invalidRoleRes.status}`);
  }

  // -------------------------------------------------------------
  // TEST SECTION 9: ACCOUNT ACTIVATION & ROLE PRESERVATION
  // -------------------------------------------------------------
  console.log(`\n${YELLOW}9. Account Activation Role Preservation${RESET}`);
  {
    // Reset test staff member to pending_activation with known PIN for idempotent execution
    const priya = hospitalStore.staff.find((s) => s.email === 'priya.nair@sahachara.com');
    if (priya) {
      priya.status = 'pending_activation';
      priya.activationPin = '849201';
      priya.role = 'RECEPTIONIST';
    }
    if (isPrismaConnected) {
      await prisma.staffMember.updateMany({
        where: { email: 'priya.nair@sahachara.com' },
        data: { status: 'pending_activation', activationPin: null, activationPinHash: bcrypt.hashSync('849201', 10), role: 'RECEPTIONIST' }
      });
      await prisma.user.deleteMany({
        where: { email: 'priya.nair@sahachara.com' }
      });
    }

    // 9.1 Activation with incorrect PIN fails
    const badPinRes = await call({
      name: 'Activation with invalid PIN fails with 400',
      method: 'POST',
      path: '/auth/activate',
      body: { email: 'priya.nair@sahachara.com', pin: '000000', newPassword: 'AnyPassword123!' },
      expectedStatus: 400
    });
    assert(badPinRes.status === 400, 'Activation with bad PIN is rejected with 400', `Status: ${badPinRes.status}`);

    // 9.2 Activate staff member with PIN (priya.nair@sahachara.com pre-assigned RECEPTIONIST)
    const actRes = await call({
      name: 'Activate pre-created account via PIN preserves assigned role',
      method: 'POST',
      path: '/auth/activate',
      body: { email: 'priya.nair@sahachara.com', pin: '849201', newPassword: 'Priya@Sahachara2026!' },
      expectedStatus: 200
    });
    const actData = await actRes.json();
    assert(
      actRes.status === 200 && actData.user?.role === 'RECEPTIONIST',
      `Account activation preserves pre-assigned role without fallback (Role: ${actData.user?.role})`,
      `Status: ${actRes.status}`
    );

    // 9.3 Subsequent activation attempt of already activated account is rejected
    const repeatActRes = await call({
      name: 'Repeat activation of already active account is rejected',
      method: 'POST',
      path: '/auth/activate',
      body: { email: 'priya.nair@sahachara.com', pin: '849201', newPassword: 'Priya@Sahachara2026!' },
      expectedStatus: 400
    });
    assert(repeatActRes.status === 400, 'Repeat activation of active account is rejected with 400', `Status: ${repeatActRes.status}`);
  }

  // -------------------------------------------------------------
  // TEST SECTION 10: TARIFF CONFIGURATION & BILLING ENFORCEMENT
  // -------------------------------------------------------------
  console.log(`\n${YELLOW}10. Tariff Configuration & Billing Enforcement Verification${RESET}`);
  {
    // 10.1 Billing attempt with an unconfigured rate (null) is rejected with 400
    const unconfigRes = await call({
      name: 'Billing with unconfigured tariff rate is rejected with 400 Bad Request',
      method: 'POST',
      path: '/billing',
      token: tokens.ACCOUNTANT,
      body: {
        patientId: 'pat-102',
        patientName: 'Beatriz Alvarez',
        mrn: 'MRN-84920',
        items: [
          {
            description: 'Unconfigured Ambulatory Therapy',
            category: 'Treatment',
            quantity: 3,
            unitPrice: null, // Explicitly UNCONFIGURED
            total: 0
          }
        ]
      },
      expectedStatus: 400
    });
    assert(unconfigRes.status === 400, 'Billing against unconfigured tariff is strictly prevented with 400', `Status: ${unconfigRes.status}`);

    // 10.2 Billing attempt with unconfigured triage (null) is rejected with 400
    const unconfigTriageRes = await call({
      name: 'Billing with unconfigured triage procedure is rejected with 400 Bad Request',
      method: 'POST',
      path: '/billing',
      token: tokens.ACCOUNTANT,
      body: {
        patientId: 'pat-102',
        patientName: 'Beatriz Alvarez',
        mrn: 'MRN-84920',
        items: [
          {
            description: 'Unconfigured Clinical Consultation',
            category: 'Consultation',
            quantity: 1,
            unitPrice: null, // UNCONFIGURED - not assumed free
            total: 0
          }
        ]
      },
      expectedStatus: 400
    });
    assert(unconfigTriageRes.status === 400, 'Billing against unconfigured triage (null) is strictly prevented with 400', `Status: ${unconfigTriageRes.status}`);

    // 10.3 Billing with ₹0 when zero price is not permitted is rejected with 400
    const zeroNotPermittedRes = await call({
      name: 'Billing with ₹0 on non-zero-permitted tariff is rejected with 400 Bad Request',
      method: 'POST',
      path: '/billing',
      token: tokens.ACCOUNTANT,
      body: {
        patientId: 'pat-102',
        patientName: 'Beatriz Alvarez',
        mrn: 'MRN-84920',
        items: [
          {
            description: 'Emergency Triage & Vital Signs Evaluation',
            category: 'Procedure',
            quantity: 1,
            unitPrice: 0,
            isZeroPricePermitted: false,
            total: 0
          }
        ]
      },
      expectedStatus: 400
    });
    assert(zeroNotPermittedRes.status === 400, 'Zero-price billing without permission on triage is rejected with 400', `Status: ${zeroNotPermittedRes.status}`);

    // 10.4 Billing with legitimate zero-price permitted procedure succeeds with 201
    const legitZeroRes = await call({
      name: 'Billing legitimate ₹0 procedure (isZeroPricePermitted: true) succeeds with 201',
      method: 'POST',
      path: '/billing',
      token: tokens.ACCOUNTANT,
      body: {
        patientId: 'pat-102',
        patientName: 'Beatriz Alvarez',
        mrn: 'MRN-84920',
        items: [
          {
            description: 'Hospital Community Charity Care Waiver',
            category: 'Procedure',
            quantity: 1,
            unitPrice: 0,
            isZeroPricePermitted: true,
            total: 0
          }
        ]
      },
      expectedStatus: 201
    });
    assert(legitZeroRes.status === 201, 'Legitimate ₹0 permitted procedure generates invoice (201 Created)', `Status: ${legitZeroRes.status}`);

    // 10.5 Strict RBAC: All non-SUPER_ADMIN roles are rejected when attempting tariff mutations
    const nonSuperRoles = ['ADMIN', 'DOCTOR', 'VAIDYA', 'RECEPTIONIST', 'PHARMACIST', 'ACCOUNTANT'] as const;
    for (const role of nonSuperRoles) {
      const forbiddenRes = await call({
        name: `${role} is forbidden from configuring tariff rates (SUPER_ADMIN exclusive)`,
        method: 'PATCH',
        path: '/tariffs/TEST-UNAUTH-TARIFF/rate',
        token: tokens[role],
        body: { rate: 1000 },
        expectedStatus: 403
      });
      assert(forbiddenRes.status === 403, `${role} cannot configure tariff rates (403 Forbidden)`, `Status: ${forbiddenRes.status}`);
    }

    let createdServiceId: string | null = null;
    try {
      // 10.6 SUPER_ADMIN creates a new hospital service in the catalogue
      const createServiceRes = await call({
        name: 'SUPER_ADMIN creates new hospital service catalogue item',
        method: 'POST',
        path: '/tariffs',
        token: tokens.SUPER_ADMIN,
        body: {
          serviceCode: 'TEST-SV-01',
          serviceName: 'Nasya Intensive Therapy',
          category: 'Panchakarma',
          department: 'Panchakarma Therapy',
          serviceType: 'Therapeutic Procedure',
          unit: 'per session',
          durationMinutes: 45,
          description: 'Purificatory nasal therapy with herbal extracts'
        },
        expectedStatus: 201
      });
      const createdServiceData = await createServiceRes.json();
      assert(
        createServiceRes.status === 201 && createdServiceData.data?.serviceCode === 'TEST-SV-01',
        'SUPER_ADMIN successfully creates hospital service (201 Created, rate: null)',
        `Status: ${createServiceRes.status}`
      );
      createdServiceId = createdServiceData.data?.id;

      // 10.7 Duplicate serviceCode is rejected with 400
      const dupServiceRes = await call({
        name: 'Duplicate service code is rejected with 400 Bad Request',
        method: 'POST',
        path: '/tariffs',
        token: tokens.SUPER_ADMIN,
        body: {
          serviceCode: 'TEST-SV-01',
          serviceName: 'Duplicate Nasya',
          category: 'Panchakarma',
          unit: 'session'
        },
        expectedStatus: 400
      });
      assert(dupServiceRes.status === 400, 'Duplicate service code is strictly rejected with 400', `Status: ${dupServiceRes.status}`);

      // 10.8 Negative rate is rejected with 400
      const negRateRes = await call({
        name: 'Negative tariff rate is rejected with 400 Bad Request',
        method: 'PATCH',
        path: '/tariffs/TEST-SV-01/rate',
        token: tokens.SUPER_ADMIN,
        body: { rate: -250 },
        expectedStatus: 400
      });
      assert(negRateRes.status === 400, 'Negative rate is strictly rejected with 400', `Status: ${negRateRes.status}`);

      // 10.9 Zero-price rate without explicit authorization is rejected with 400
      const zeroWithoutPermRes = await call({
        name: 'Zero-price rate without explicit isZeroPricePermitted is rejected with 400',
        method: 'PATCH',
        path: '/tariffs/TEST-SV-01/rate',
        token: tokens.SUPER_ADMIN,
        body: { rate: 0, isZeroPricePermitted: false },
        expectedStatus: 400
      });
      assert(zeroWithoutPermRes.status === 400, 'Deliberate ₹0 rate requires explicit authorization (400)', `Status: ${zeroWithoutPermRes.status}`);

      // 10.10 SUPER_ADMIN configures authorized rate with RateHistory tracking
      const configureRateRes = await call({
        name: 'SUPER_ADMIN configures authorized rate for new service',
        method: 'PATCH',
        path: '/tariffs/TEST-SV-01/rate',
        token: tokens.SUPER_ADMIN,
        body: {
          rate: 1400,
          isZeroPricePermitted: false,
          effectiveFrom: new Date().toISOString(),
          note: 'Approved initial tariff by Clinical Governance Committee'
        },
        expectedStatus: 200
      });
      const confRateData = await configureRateRes.json();
      assert(
        configureRateRes.status === 200 && confRateData.data?.rate === 1400,
        'SUPER_ADMIN authorizes rate of ₹1,400 with RateHistory creation',
        `Status: ${configureRateRes.status}`
      );

      // 10.11 Verify RateHistory timeline via GET /tariffs/:id
      const getDetailsRes = await call({
        name: 'Retrieve service details with RateHistory audit timeline',
        method: 'GET',
        path: '/tariffs/TEST-SV-01',
        token: tokens.SUPER_ADMIN,
        expectedStatus: 200
      });
      const detailsData = await getDetailsRes.json();
      const histories = detailsData.data?.rateHistories;
      assert(
        Array.isArray(histories) && histories.length > 0 && histories[histories.length - 1]?.newRate === 1400,
        `RateHistory audit trail records rate adjustment (Entries: ${histories?.length}, New Rate: ₹${histories?.[histories.length - 1]?.newRate})`,
        `Count: ${histories?.length}`
      );

      // 10.12 Soft Deactivation: Inactive services cannot be billed
      const deactRes = await call({
        name: 'SUPER_ADMIN soft-deactivates hospital service',
        method: 'PATCH',
        path: '/tariffs/TEST-SV-01/status',
        token: tokens.SUPER_ADMIN,
        body: { isActive: false },
        expectedStatus: 200
      });
      assert(deactRes.status === 200, 'SUPER_ADMIN deactivates service (isActive: false)', `Status: ${deactRes.status}`);

      const billInactiveRes = await call({
        name: 'Billing against inactive service is strictly rejected with 400',
        method: 'POST',
        path: '/billing',
        token: tokens.ACCOUNTANT,
        body: {
          patientId: 'pat-102',
          patientName: 'Beatriz Alvarez',
          mrn: 'MRN-84920',
          items: [
            {
              serviceCode: 'TEST-SV-01',
              description: 'Nasya Intensive Therapy',
              quantity: 1
            }
          ]
        },
        expectedStatus: 400
      });
      assert(billInactiveRes.status === 400, 'Billing against inactive service rejected with 400 InactiveService', `Status: ${billInactiveRes.status}`);

      // 10.13 Reactivate service
      await call({
        name: 'SUPER_ADMIN reactivates service',
        method: 'PATCH',
        path: '/tariffs/TEST-SV-01/status',
        token: tokens.SUPER_ADMIN,
        body: { isActive: true },
        expectedStatus: 200
      });

      // 10.14 SUPER_ADMIN establishes therapy tariff rate via Rate Master API
      const configTariffRes = await call({
        name: 'SUPER_ADMIN configures therapy tariff rate (Rate Master)',
        method: 'PATCH',
        path: '/tariffs/TEST-SV-01/rate',
        token: tokens.SUPER_ADMIN,
        body: { rate: 1250, isZeroPricePermitted: false, note: 'Executive Committee approved standard therapy tariff' },
        expectedStatus: 200
      });
      const configData = await configTariffRes.json();
      assert(
        configTariffRes.status === 200 && configData.data?.rate === 1250,
        `SUPER_ADMIN successfully establishes approved rate for TEST-SV-01 (Rate: ₹${configData.data?.rate})`,
        `Status: ${configTariffRes.status}`
      );

      // 10.15 ACCOUNTANT generates invoice with newly configured therapy rate
      const billConfiguredRes = await call({
        name: 'ACCOUNTANT generates invoice with established therapy tariff rate',
        method: 'POST',
        path: '/billing',
        token: tokens.ACCOUNTANT,
        body: {
          patientId: 'pat-102',
          patientName: 'Beatriz Alvarez',
          mrn: 'MRN-84920',
          items: [
            {
              serviceCode: 'TEST-SV-01',
              description: 'Nasya Intensive Therapy',
              category: 'Panchakarma Procedure',
              quantity: 3,
              unitPrice: 1250,
              total: 3750
            }
          ]
        },
        expectedStatus: 201
      });
      const invData = await billConfiguredRes.json();
      assert(
        billConfiguredRes.status === 201 && invData.data?.totalAmount === 3750,
        `ACCOUNTANT bills against configured rate (Total: ₹${invData.data?.totalAmount})`,
        `Status: ${billConfiguredRes.status}`
      );

      // 10.16 Currency multiplier verification: no 82x bug
      assert(
        invData.data?.totalAmount === 3750 && invData.data?.items[0]?.unitPrice === 1250,
        'Invoice preserves snapshot of unitPrice (₹1,250) and subtotal (₹3,750) without 82x multiplier bug',
        `Calculated: ${invData.data?.totalAmount}`
      );
    } finally {
      // 10.17 Revert TEST-SV-01 back to unconfigured state (rate: null) so database is NOT contaminated
      const revertTariffRes = await call({
        name: 'SUPER_ADMIN cleans up and reverts therapy tariff rate back to unconfigured (null)',
        method: 'PATCH',
        path: '/tariffs/TEST-SV-01/rate',
        token: tokens.SUPER_ADMIN,
        body: { rate: null, isZeroPricePermitted: false },
        expectedStatus: 200
      });
      const revertData = await revertTariffRes.json();
      assert(
        revertTariffRes.status === 200 && revertData.data?.rate === null,
        'SUPER_ADMIN reverts TEST-SV-01 tariff back to unconfigured state (rate: null)',
        `Status: ${revertTariffRes.status}`
      );

      // Clean up test service if created
      if (createdServiceId && isPrismaConnected) {
        if (process.env.DATABASE_URL?.includes('test_db') || process.env.DATABASE_URL?.includes('sahachara_ops_test')) {
          await prisma.$executeRawUnsafe('TRUNCATE TABLE rate_histories CASCADE').catch(() => {});
        }
        await prisma.hospitalTariff.deleteMany({ where: { id: createdServiceId } }).catch(() => {});
      }

      // Verify in DB directly that clean state is preserved
      if (isPrismaConnected) {
        const testInDb = await prisma.hospitalTariff.findUnique({ where: { serviceCode: 'TEST-SV-01' } });
        assert(
          testInDb === null,
          'Database verification: TEST-SV-01 cleanly removed after verification',
          `DB: ${testInDb}`
        );
      }
    }
  }
  } finally {
    server.close();

    // Snapshot production database state after tests
    const prodAfterSnapshot = await getProductionDatabaseSnapshot();
    await prodProbePrisma.$disconnect();

    const isProdUntouched = JSON.stringify(prodBeforeSnapshot) === JSON.stringify(prodAfterSnapshot);
    console.log(`\n${YELLOW}=== PRODUCTION DATABASE INTEGRITY AUDIT ===${RESET}`);
    console.log(`Pre-Test  Counts (sahachara_ops_db):`, prodBeforeSnapshot);
    console.log(`Post-Test Counts (sahachara_ops_db):`, prodAfterSnapshot);
    assert(
      isProdUntouched,
      'Production database (sahachara_ops_db) remained strictly UNTOUCHED by test execution (0 modifications)'
    );

    // Clean up test data from sahachara_ops_test_db
    if (isPrismaConnected) {
      if (process.env.DATABASE_URL?.includes('test_db') || process.env.DATABASE_URL?.includes('sahachara_ops_test')) {
        await prisma.$executeRawUnsafe('TRUNCATE TABLE refund_ledger_entries, rate_histories, dispensing_records CASCADE').catch(() => {});
      }
      await (prisma as any).paymentAllocation?.deleteMany({});
      await (prisma as any).refundRequest?.deleteMany({});
      await (prisma as any).payment?.deleteMany({});
      await (prisma as any).dispensingRecord?.deleteMany({}).catch(() => {});
      await prisma.rateHistory.deleteMany({}).catch(() => {});
      await prisma.stockMovement.deleteMany({});
      await prisma.medicationStock.deleteMany({});
      await prisma.invoice.deleteMany({});
      await prisma.prescription.deleteMany({});
      await prisma.labOrder.deleteMany({});
      await prisma.appointment.deleteMany({});
      await prisma.consultation.deleteMany({});
      await (prisma as any).therapySession?.deleteMany({});
      await (prisma as any).panchakarmaPhaseTransition?.deleteMany({});
      await prisma.panchakarmaCourse.deleteMany({});
      await prisma.treatmentPlan.deleteMany({});
      await (prisma as any).clinicalVitals?.deleteMany({});
      await (prisma as any).clinicalAssessment?.deleteMany({});
      await (prisma as any).clinicalDiagnosis?.deleteMany({});
      await (prisma as any).prakritiAssessment?.deleteMany({});
      await (prisma as any).vikritiAssessment?.deleteMany({});
      await (prisma as any).doshaEvaluation?.deleteMany({});
      await (prisma as any).panchakarmaReferral?.deleteMany({});
      await (prisma as any).clinicalEncounter?.deleteMany({});
      await prisma.patient.deleteMany({});
      await prisma.staffMember.deleteMany({
        where: { email: { contains: 'test.doc' } }
      });
      await prisma.hospitalTariff.deleteMany({
        where: { serviceCode: { startsWith: 'TEST-' } }
      });
      console.log(`${GREEN}✓ Test database (sahachara_ops_test_db) cleaned up successfully.${RESET}`);
      await prisma.$disconnect();
    }
  }

  console.log(`\n${CYAN}============================================================${RESET}`);
  console.log(`${CYAN}   RBAC SUITE SUMMARY: ${passed} PASSED, ${failed} FAILED   ${RESET}`);
  console.log(`${CYAN}============================================================${RESET}\n`);

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests().catch((err) => {
  console.error('Fatal error during test suite:', err);
  process.exit(1);
});
