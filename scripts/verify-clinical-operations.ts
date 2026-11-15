/**
 * SAHACHARA OPS — PHASE 3: DOCTOR & VAIDYA CLINICAL OPERATIONS VERIFICATION SUITE
 *
 * Verifies:
 * 1. Target database isolation guard (must refuse production).
 * 2. Authoritative fail-closed sequence generation (ENC-YYYY-XXXXX, PKR-YYYY-XXXXX).
 * 3. 7-role RBAC authorization and discipline boundary isolation.
 * 4. Emergency escalation lifecycle (escalated -> acknowledged -> resolved).
 * 5. Clinical encounter initiation, duplicate prevention, and appointment linkage.
 * 6. Clinical vitals with server-side BMI calculation and NULL preservation.
 * 7. Practitioner-authored diagnoses and clinical assessments (no AI diagnoses).
 * 8. Investigation lifecycle (ordered -> result_available -> reviewed).
 * 9. Prescription authoring with catalogue validation and inventory stock protection.
 * 10. Ayurvedic clinical operations (Prakriti, Vikriti, Dosha evaluation, Treatment plans, Panchakarma referrals).
 * 11. Encounter completion with appointment sync and clinicalDocumentationCompleted flag.
 * 12. Patient clinical history aggregation.
 * 13. Production database zero-mutation verification.
 */

import http from 'http';
import express from 'express';
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';

// ---------------------------------------------------------------------------
// TEST DATABASE ISOLATION GUARD — must run before server imports
// ---------------------------------------------------------------------------
const PROD_DB_URL = process.env.PROD_DATABASE_URL;
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
  generateUniqueEncounterNumber,
  generateUniquePanchakarmaReferralNumber
} from '../server/prismaService.ts';

const isCI = process.env.CI === 'true';
const prodProbePrisma = !isCI && PROD_DB_URL && !PROD_DB_URL.includes('test_db') && !PROD_DB_URL.includes('sahachara_ops_test')
  ? new PrismaClient({ datasources: { db: { url: PROD_DB_URL } } })
  : null;

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
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

async function getProductionSnapshot() {
  if (!prodProbePrisma) {
    return null;
  }
  try {
    const [users, patients, appointments, prescriptions, invoices, tariffs, encounters] = await Promise.all([
      prodProbePrisma.user.count(),
      prodProbePrisma.patient.count(),
      prodProbePrisma.appointment.count(),
      prodProbePrisma.prescription.count(),
      prodProbePrisma.invoice.count(),
      prodProbePrisma.hospitalTariff.count(),
      prodProbePrisma.clinicalEncounter.count()
    ]);
    return { users, patients, appointments, prescriptions, invoices, tariffs, encounters };
  } catch {
    return null;
  }
}

async function runVerification() {
  console.log(`\n${CYAN}═══════════════════════════════════════════════════════════════════════════════${RESET}`);
  console.log(`${CYAN}   SAHACHARA OPS — PHASE 3: DOCTOR & VAIDYA CLINICAL OPERATIONS VERIFICATION   ${RESET}`);
  console.log(`${CYAN}═══════════════════════════════════════════════════════════════════════════════${RESET}\n`);

  await checkPrismaConnection();
  const dbInfo = await prisma.$queryRaw<[{ current_database: string }]>`SELECT current_database()`;
  const currentDb = dbInfo[0]?.current_database;

  console.log(`${YELLOW}▶ 1. DATABASE TARGET & ZERO-MUTATION INITIAL VERIFICATION${RESET}`);
  assert(currentDb === 'sahachara_ops_test_db', `Connected strictly to test database: ${currentDb}`);

  const initialProd = await getProductionSnapshot();
  if (initialProd) {
    console.log(`  Production DB Snapshot: users=${initialProd.users}, patients=${initialProd.patients}, appointments=${initialProd.appointments}, tariffs=${initialProd.tariffs}, encounters=${initialProd.encounters}`);
    assert(initialProd.appointments === 0, 'Production appointments count is 0');
    assert(initialProd.patients === 0, 'Production patients count is 0');
    assert(initialProd.encounters === 0, 'Production encounters count is 0');
  } else {
    console.log('  ℹ [SKIPPED] Production database pre-test probe skipped: isolated CI/test environment (zero production database access).');
  }

  // Setup test HTTP server
  const app = express();
  app.use(express.json());
  app.use('/api', apiRouter);

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as any).port;
  const baseUrl = `http://127.0.0.1:${port}/api`;

  const roles = [
    'SUPER_ADMIN',
    'ADMIN',
    'DOCTOR',
    'VAIDYA',
    'RECEPTIONIST',
    'PHARMACIST',
    'ACCOUNTANT'
  ] as const;

  const userIds: Record<string, string> = {
    SUPER_ADMIN: 'usr-superadmin',
    ADMIN: 'usr-admin',
    DOCTOR: 'usr-doc',
    VAIDYA: 'usr-vaidya',
    RECEPTIONIST: 'usr-reception',
    PHARMACIST: 'usr-pharma',
    ACCOUNTANT: 'usr-accountant'
  };

  const tokens: Record<string, string> = {};
  for (const r of roles) {
    tokens[r] = generateSessionToken({
      userId: userIds[r] || `usr-${r.toLowerCase()}`,
      name: `Test ${r}`,
      role: r as UserRole,
      email: `${r.toLowerCase()}@sahachara.test`
    });
  }

  async function apiCall(
    method: string,
    endpoint: string,
    role?: string,
    body?: any
  ): Promise<{ status: number; body: any }> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (role && tokens[role]) {
      headers['Authorization'] = `Bearer ${tokens[role]}`;
    }
    const res = await fetch(`${baseUrl}${endpoint}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined
    });
    const resBody = await res.json().catch(() => ({}));
    return { status: res.status, body: resBody };
  }

  // -------------------------------------------------------------------------
  // 2. AUTHORITATIVE FAIL-CLOSED SEQUENCES
  // -------------------------------------------------------------------------
  console.log(`\n${YELLOW}▶ 2. AUTHORITATIVE FAIL-CLOSED SEQUENCE GENERATION${RESET}`);
  const encNum1 = await generateUniqueEncounterNumber();
  const encNum2 = await generateUniqueEncounterNumber();
  assert(encNum1.startsWith('ENC-') && encNum1.length === 14, `Valid Encounter format: ${encNum1}`);
  assert(encNum2.startsWith('ENC-') && encNum2.length === 14, `Valid Encounter format: ${encNum2}`);
  assert(encNum1 !== encNum2, `Encounter sequence monotonicity: ${encNum1} != ${encNum2}`);

  const pkrNum1 = await generateUniquePanchakarmaReferralNumber();
  const pkrNum2 = await generateUniquePanchakarmaReferralNumber();
  assert(pkrNum1.startsWith('PKR-') && pkrNum1.length === 14, `Valid Panchakarma Referral format: ${pkrNum1}`);
  assert(pkrNum2.startsWith('PKR-') && pkrNum2.length === 14, `Valid Panchakarma Referral format: ${pkrNum2}`);
  assert(pkrNum1 !== pkrNum2, `Panchakarma Referral sequence monotonicity: ${pkrNum1} != ${pkrNum2}`);

  // -------------------------------------------------------------------------
  // 3. SEED TEST PATIENTS, APPOINTMENTS & PRACTITIONERS
  // -------------------------------------------------------------------------
  console.log(`\n${YELLOW}▶ 3. SEEDING TEST FIXTURES IN sahachara_ops_test_db${RESET}`);
  const testPatient = await prisma.patient.create({
    data: {
      mrn: `SAH-2026-${crypto.randomInt(10000, 100000)}`,
      firstName: 'Ramesh',
      lastName: 'Nambiar',
      phone: '+91 98450 11223',
      gender: 'Male',
      age: 48,
      dob: '1978-05-14',
      status: 'active',
      allergyStatus: 'known_allergies',
      allergies: ['Penicillin', 'Sulfa drugs']
    }
  });
  assert(Boolean(testPatient.id), `Created test patient: ${testPatient.firstName} ${testPatient.lastName} (${testPatient.mrn})`);

  // Ensure Doctor user and Vaidya user in User table
  let doctorUser = await prisma.user.findFirst({ where: { role: 'DOCTOR' } });
  if (!doctorUser) {
    doctorUser = await prisma.user.create({
      data: {
        id: 'usr-doctor',
        email: 'doctor@sahachara.test',
        name: 'Dr. Anand Sharma',
        role: 'DOCTOR',
        department: 'Modern Medicine (General Medicine)'
      }
    });
  }

  let vaidyaUser = await prisma.user.findFirst({ where: { role: 'VAIDYA' } });
  if (!vaidyaUser) {
    vaidyaUser = await prisma.user.create({
      data: {
        id: 'usr-vaidya',
        email: 'vaidya@sahachara.test',
        name: 'Vaidya Madhavan Kartha',
        role: 'VAIDYA',
        department: 'Kayachikitsa (Internal Medicine)'
      }
    });
  }

  // Doctor Appointment
  const doctorAppt = await prisma.appointment.create({
    data: {
      appointmentNumber: `APT-2026-${crypto.randomInt(10000, 100000)}`,
      patientId: testPatient.id,
      patientName: `${testPatient.firstName} ${testPatient.lastName}`,
      patientMrn: testPatient.mrn,
      patientPhone: testPatient.phone,
      practitionerId: doctorUser.id,
      practitionerName: doctorUser.name,
      practitionerRole: 'DOCTOR',
      doctorId: doctorUser.id,
      doctorName: doctorUser.name,
      department: 'General Medicine',
      dateTime: new Date(),
      timeSlot: '10:00',
      durationMinutes: 30,
      type: 'General Medical Consultation',
      status: 'checked_in',
      isEscalated: true,
      escalationStatus: 'escalated',
      escalationReason: 'Severe chest tightness and acute diaphoresis'
    }
  });

  // Vaidya Appointment
  const vaidyaAppt = await prisma.appointment.create({
    data: {
      appointmentNumber: `APT-2026-${crypto.randomInt(10000, 100000)}`,
      patientId: testPatient.id,
      patientName: `${testPatient.firstName} ${testPatient.lastName}`,
      patientMrn: testPatient.mrn,
      patientPhone: testPatient.phone,
      practitionerId: vaidyaUser.id,
      practitionerName: vaidyaUser.name,
      practitionerRole: 'VAIDYA',
      doctorId: vaidyaUser.id,
      doctorName: vaidyaUser.name,
      department: 'Kayachikitsa',
      dateTime: new Date(),
      timeSlot: '11:00',
      durationMinutes: 45,
      type: 'Ayurvedic Initial Consultation',
      status: 'checked_in',
      isEscalated: false
    }
  });

  // Medication Stock in Inventory (Modern Medicine for Doctor Encounter)
  const medStock = await prisma.medicationStock.create({
    data: {
      drugName: 'Paracetamol 500mg Tablets',
      genericName: 'Paracetamol',
      category: 'Analgesics',
      form: 'Tablet',
      stockQuantity: 45,
      unit: 'strips',
      batchNumber: 'ST-2026-B1',
      expiryDate: '2028-12-31',
      unitPrice: 180.00,
      status: 'in_stock'
    }
  });
  assert(Boolean(medStock.id), `Created test medication stock: ${medStock.drugName} (Qty: ${medStock.stockQuantity})`);

  // -------------------------------------------------------------------------
  // 4. EMERGENCY ESCALATION LIFECYCLE
  // -------------------------------------------------------------------------
  console.log(`\n${YELLOW}▶ 4. EMERGENCY ESCALATION LIFECYCLE (ESCALATED -> ACKNOWLEDGED -> RESOLVED)${RESET}`);
  // Unauthorized non-clinician attempt to acknowledge
  const ackNonClinician = await apiCall('POST', `/reception/queue/${doctorAppt.id}/escalate/acknowledge`, 'RECEPTIONIST');
  assert(ackNonClinician.status === 403, 'RECEPTIONIST cannot acknowledge escalation (HTTP 403)');
  assert(ackNonClinician.body.code === 'CLINICAL_AUTHORITY_REQUIRED', 'Returns CLINICAL_AUTHORITY_REQUIRED');

  const ackAdmin = await apiCall('POST', `/reception/queue/${doctorAppt.id}/escalate/acknowledge`, 'ADMIN');
  assert(ackAdmin.status === 403, 'ADMIN cannot acknowledge escalation (HTTP 403)');

  // Clinician DOCTOR acknowledges
  const ackDoctor = await apiCall('POST', `/reception/queue/${doctorAppt.id}/escalate/acknowledge`, 'DOCTOR');
  assert(ackDoctor.status === 200, 'DOCTOR acknowledges escalation (HTTP 200)');
  assert(ackDoctor.body.data.escalationStatus === 'acknowledged', 'Escalation status set to "acknowledged"');
  assert(Boolean(ackDoctor.body.data.escalationAcknowledgedAt), 'escalationAcknowledgedAt timestamp recorded');

  // Attempt to resolve without resolution notes
  const resNoNotes = await apiCall('POST', `/reception/queue/${doctorAppt.id}/escalate/resolve`, 'DOCTOR', {});
  assert(resNoNotes.status === 400, 'Resolve fails without resolution notes (HTTP 400)');
  assert(resNoNotes.body.code === 'RESOLUTION_NOTES_REQUIRED', 'Returns RESOLUTION_NOTES_REQUIRED');

  // DOCTOR resolves with clinical notes
  const resDoctor = await apiCall('POST', `/reception/queue/${doctorAppt.id}/escalate/resolve`, 'DOCTOR', {
    resolutionNotes: 'ECG normal, sublingual nitrate administered, patient hemodynamically stable'
  });
  assert(resDoctor.status === 200, 'DOCTOR resolves escalation with clinical notes (HTTP 200)');
  assert(resDoctor.body.data.isEscalated === false, 'isEscalated set to false');
  assert(resDoctor.body.data.escalationStatus === 'resolved', 'escalationStatus set to "resolved"');
  assert(resDoctor.body.data.escalationResolutionNotes.includes('ECG normal'), 'Resolution notes persisted');

  // -------------------------------------------------------------------------
  // 5. 7-ROLE RBAC AUTHORIZATION MATRIX & DISCIPLINE BOUNDARIES
  // -------------------------------------------------------------------------
  console.log(`\n${YELLOW}▶ 5. 7-ROLE RBAC AUTHORIZATION MATRIX & DISCIPLINE BOUNDARIES${RESET}`);
  // Doctor Dashboard
  const docDashDoc = await apiCall('GET', '/clinical/doctor/dashboard', 'DOCTOR');
  assert(docDashDoc.status === 200, 'DOCTOR accesses Doctor Dashboard (HTTP 200)');

  const docDashVaidya = await apiCall('GET', '/clinical/doctor/dashboard', 'VAIDYA');
  assert(docDashVaidya.status === 403, 'VAIDYA blocked from Doctor Dashboard (HTTP 403)');
  assert(docDashVaidya.body.code === 'CLINICAL_DISCIPLINE_MISMATCH', 'Returns CLINICAL_DISCIPLINE_MISMATCH');

  const docDashRecept = await apiCall('GET', '/clinical/doctor/dashboard', 'RECEPTIONIST');
  assert(docDashRecept.status === 403, 'RECEPTIONIST blocked from Doctor Dashboard (HTTP 403)');
  assert(docDashRecept.body.code === 'CLINICAL_AUTHORITY_REQUIRED', 'Returns CLINICAL_AUTHORITY_REQUIRED');

  // Vaidya Dashboard
  const vaidyaDashVaidya = await apiCall('GET', '/clinical/vaidya/dashboard', 'VAIDYA');
  assert(vaidyaDashVaidya.status === 200, 'VAIDYA accesses Vaidya Dashboard (HTTP 200)');

  const vaidyaDashDoc = await apiCall('GET', '/clinical/vaidya/dashboard', 'DOCTOR');
  assert(vaidyaDashDoc.status === 403, 'DOCTOR blocked from Vaidya Dashboard (HTTP 403)');
  assert(vaidyaDashDoc.body.code === 'CLINICAL_DISCIPLINE_MISMATCH', 'Returns CLINICAL_DISCIPLINE_MISMATCH');

  // Queues Discipline Isolation
  const docQueueDoc = await apiCall('GET', '/clinical/doctor/queue', 'DOCTOR');
  assert(docQueueDoc.status === 200, 'DOCTOR accesses Doctor Queue (HTTP 200)');

  const docQueueVaidya = await apiCall('GET', '/clinical/doctor/queue', 'VAIDYA');
  assert(docQueueVaidya.status === 403, 'VAIDYA blocked from Doctor Queue (HTTP 403)');

  const vaidyaQueueVaidya = await apiCall('GET', '/clinical/vaidya/queue', 'VAIDYA');
  assert(vaidyaQueueVaidya.status === 200, 'VAIDYA accesses Vaidya Queue (HTTP 200)');

  const vaidyaQueueDoc = await apiCall('GET', '/clinical/vaidya/queue', 'DOCTOR');
  assert(vaidyaQueueDoc.status === 403, 'DOCTOR blocked from Vaidya Queue (HTTP 403)');

  // -------------------------------------------------------------------------
  // 6. CLINICAL ENCOUNTER INITIATION & DUPLICATE PREVENT
  // -------------------------------------------------------------------------
  console.log(`\n${YELLOW}▶ 6. CLINICAL ENCOUNTER INITIATION & DUPLICATE PREVENTION${RESET}`);
  // Non-clinician initiation attempt
  const encNonClinician = await apiCall('POST', '/clinical/encounters/initiate', 'RECEPTIONIST', {
    patientId: testPatient.id,
    appointmentId: doctorAppt.id
  });
  assert(encNonClinician.status === 403, 'RECEPTIONIST cannot initiate encounter (HTTP 403)');
  assert(encNonClinician.body.code === 'CLINICAL_AUTHORITY_REQUIRED', 'Returns CLINICAL_AUTHORITY_REQUIRED');

  // Cross-discipline initiation attempt (VAIDYA on DOCTOR appointment)
  const encCrossDiscipline = await apiCall('POST', '/clinical/encounters/initiate', 'VAIDYA', {
    patientId: testPatient.id,
    appointmentId: doctorAppt.id
  });
  assert(encCrossDiscipline.status === 403, 'VAIDYA cannot initiate encounter for DOCTOR appointment (HTTP 403)');
  assert(encCrossDiscipline.body.code === 'CLINICAL_DISCIPLINE_MISMATCH', 'Returns CLINICAL_DISCIPLINE_MISMATCH');

  // Authorized DOCTOR initiates encounter
  const encDoctor = await apiCall('POST', '/clinical/encounters/initiate', 'DOCTOR', {
    patientId: testPatient.id,
    appointmentId: doctorAppt.id,
    reasonForVisit: 'Acute chest tightness'
  });
  assert(encDoctor.status === 201, 'DOCTOR initiates clinical encounter (HTTP 201)');
  const doctorEncounter = encDoctor.body.data;
  assert(doctorEncounter.discipline === 'DOCTOR', 'Encounter discipline is DOCTOR');
  assert(doctorEncounter.status === 'in_progress', 'Encounter status is in_progress');
  assert(doctorEncounter.encounterNumber.startsWith('ENC-'), `Encounter Number assigned: ${doctorEncounter.encounterNumber}`);

  // Prevent duplicate active encounter for the same appointment
  const encDuplicate = await apiCall('POST', '/clinical/encounters/initiate', 'DOCTOR', {
    patientId: testPatient.id,
    appointmentId: doctorAppt.id
  });
  assert(encDuplicate.status === 409, 'Duplicate encounter on active appointment blocked (HTTP 409)');
  assert(encDuplicate.body.code === 'ACTIVE_ENCOUNTER_EXISTS', 'Returns ACTIVE_ENCOUNTER_EXISTS');

  // Authorized VAIDYA initiates Ayurvedic encounter
  const encVaidya = await apiCall('POST', '/clinical/encounters/initiate', 'VAIDYA', {
    patientId: testPatient.id,
    appointmentId: vaidyaAppt.id,
    reasonForVisit: 'Janu Sandhigata Vata evaluation'
  });
  assert(encVaidya.status === 201, 'VAIDYA initiates Ayurvedic encounter (HTTP 201)');
  const vaidyaEncounter = encVaidya.body.data;
  assert(vaidyaEncounter.discipline === 'VAIDYA', 'Ayurvedic encounter discipline is VAIDYA');

  // -------------------------------------------------------------------------
  // 7. CLINICAL VITALS & EXACT SERVER-SIDE BMI CALCULATION
  // -------------------------------------------------------------------------
  console.log(`\n${YELLOW}▶ 7. CLINICAL VITALS & SERVER-SIDE BMI CALCULATION${RESET}`);
  // Valid Height & Weight: height = 175 cm, weight = 70 kg -> BMI = 70 / (1.75^2) = 22.857 -> 22.9
  const vitalsRes1 = await apiCall('POST', `/clinical/encounters/${doctorEncounter.id}/vitals`, 'DOCTOR', {
    bpSystolic: 120,
    bpDiastolic: 80,
    heartRate: 72,
    respiratoryRate: 16,
    temperature: 98.6,
    temperatureUnit: 'F',
    spO2: 99,
    height: 175,
    weight: 70
  });
  assert(vitalsRes1.status === 201, 'Recorded complete vitals (HTTP 201)');
  assert(vitalsRes1.body.data.bmi === 22.9, `Calculated BMI exactly 22.9 (Received: ${vitalsRes1.body.data.bmi})`);

  // Height = 160 cm, Weight = 64 kg -> BMI = 64 / (1.60^2) = 25.0
  const vitalsRes2 = await apiCall('POST', `/clinical/encounters/${doctorEncounter.id}/vitals`, 'DOCTOR', {
    height: 160,
    weight: 64
  });
  assert(vitalsRes2.status === 201, 'Recorded second vitals (HTTP 201)');
  assert(vitalsRes2.body.data.bmi === 25.0, `Calculated BMI exactly 25.0 (Received: ${vitalsRes2.body.data.bmi})`);

  // Missing weight -> BMI MUST BE NULL (no synthetic fallback!)
  const vitalsRes3 = await apiCall('POST', `/clinical/encounters/${doctorEncounter.id}/vitals`, 'DOCTOR', {
    bpSystolic: 118,
    bpDiastolic: 78,
    height: 170
  });
  assert(vitalsRes3.status === 201, 'Recorded vitals without weight (HTTP 201)');
  assert(vitalsRes3.body.data.bmi === null, 'BMI is null when weight is missing');
  assert(vitalsRes3.body.data.weight === null, 'Weight is null when omitted');

  // Cross-discipline vitals blocked
  const vitalsCross = await apiCall('POST', `/clinical/encounters/${doctorEncounter.id}/vitals`, 'VAIDYA', {
    height: 170,
    weight: 65
  });
  assert(vitalsCross.status === 403, 'VAIDYA cannot record vitals on DOCTOR encounter (HTTP 403)');

  // -------------------------------------------------------------------------
  // 8. ASSESSMENT & DIAGNOSES (PRACTITIONER-AUTHORED ONLY)
  // -------------------------------------------------------------------------
  console.log(`\n${YELLOW}▶ 8. PRACTITIONER-AUTHORED ASSESSMENT & DIAGNOSES${RESET}`);
  // Clinical Assessment
  const assessRes = await apiCall('POST', `/clinical/encounters/${doctorEncounter.id}/assessment`, 'DOCTOR', {
    presentingComplaints: 'Substernal chest pressure relieved with rest',
    historyOfPresentingIllness: 'Episodes started 3 days ago after exertion',
    physicalExamination: 'S1 S2 heard normally, no murmurs, chest clear to auscultation',
    clinicalObservations: 'Patient anxious, well-oriented',
    clinicalPlan: 'Rest, sublingual nitrates PRN, routine cardiac markers'
  });
  assert(assessRes.status === 201, 'Doctor assessment recorded (HTTP 201)');
  assert(assessRes.body.data.clinicalPlan.includes('sublingual nitrates'), 'Plan saved correctly');

  // Diagnosis authored by practitioner
  const diagFail = await apiCall('POST', `/clinical/encounters/${doctorEncounter.id}/diagnoses`, 'DOCTOR', {
    diagnosisName: ''
  });
  assert(diagFail.status === 400, 'Blank diagnosis name rejected (HTTP 400)');

  const diagSuccess = await apiCall('POST', `/clinical/encounters/${doctorEncounter.id}/diagnoses`, 'DOCTOR', {
    diagnosisName: 'Stable Angina Pectoris',
    icdCode: 'I20.9',
    diagnosisType: 'provisional',
    notes: 'Exertional angina, ruled out acute coronary syndrome'
  });
  assert(diagSuccess.status === 201, 'Practitioner diagnosis recorded (HTTP 201)');
  assert(diagSuccess.body.data.diagnosisName === 'Stable Angina Pectoris', 'Diagnosis name preserved');

  // -------------------------------------------------------------------------
  // 9. INVESTIGATIONS LIFECYCLE (ORDERED -> RESULTS -> REVIEWED)
  // -------------------------------------------------------------------------
  console.log(`\n${YELLOW}▶ 9. INVESTIGATIONS LIFECYCLE (ORDERED -> RESULTS -> REVIEWED)${RESET}`);
  // Vaidya ordering lab test fails with CLINICAL_DISCIPLINE_MISMATCH
  const labVaidyaFail = await apiCall('POST', `/clinical/encounters/${doctorEncounter.id}/investigations`, 'VAIDYA', {
    testType: 'Cardiac Troponin I (High-Sensitivity)'
  });
  assert(labVaidyaFail.status === 403, 'VAIDYA cannot order Modern Medicine lab tests (HTTP 403)');
  assert(labVaidyaFail.body.code === 'CLINICAL_DISCIPLINE_MISMATCH', 'VAIDYA ordering receives CLINICAL_DISCIPLINE_MISMATCH');

  // Receptionist ordering fails with CLINICAL_AUTHORITY_REQUIRED
  const labRecepFail = await apiCall('POST', `/clinical/encounters/${doctorEncounter.id}/investigations`, 'RECEPTIONIST', {
    testType: 'Cardiac Troponin I (High-Sensitivity)'
  });
  assert(labRecepFail.status === 403, 'RECEPTIONIST cannot order lab tests (HTTP 403)');
  assert(labRecepFail.body.code === 'CLINICAL_AUTHORITY_REQUIRED', 'RECEPTIONIST ordering receives CLINICAL_AUTHORITY_REQUIRED');

  // Doctor orders lab test
  const labOrderRes = await apiCall('POST', `/clinical/encounters/${doctorEncounter.id}/investigations`, 'DOCTOR', {
    testType: 'Cardiac Troponin I (High-Sensitivity)',
    priority: 'Urgent (<2 hrs)',
    clinicalIndication: 'Chest discomfort'
  });
  assert(labOrderRes.status === 201, 'DOCTOR orders lab investigation (HTTP 201)');
  const labOrder = labOrderRes.body.data;
  assert(labOrder.status === 'ordered', 'Initial lab status is "ordered"');
  assert(labOrder.orderNumber.startsWith('LAB-'), `Assigned order number: ${labOrder.orderNumber}`);

  // VAIDYA attempting to record results receives CLINICAL_DISCIPLINE_MISMATCH
  const labResultVaidya = await apiCall('POST', `/clinical/investigations/${labOrder.id}/results`, 'VAIDYA', {
    resultValue: '<0.01 ng/mL'
  });
  assert(labResultVaidya.status === 403, 'VAIDYA cannot record Modern Medicine lab results (HTTP 403)');
  assert(labResultVaidya.body.code === 'CLINICAL_DISCIPLINE_MISMATCH', 'VAIDYA result entry receives CLINICAL_DISCIPLINE_MISMATCH');

  // Non-clinician attempting to record results receives CLINICAL_AUTHORITY_REQUIRED
  const labResultRecep = await apiCall('POST', `/clinical/investigations/${labOrder.id}/results`, 'RECEPTIONIST', {
    resultValue: '<0.01 ng/mL'
  });
  assert(labResultRecep.status === 403, 'RECEPTIONIST cannot record lab results (HTTP 403)');
  assert(labResultRecep.body.code === 'CLINICAL_AUTHORITY_REQUIRED', 'RECEPTIONIST result entry receives CLINICAL_AUTHORITY_REQUIRED');

  // Doctor enters result
  const labResultRes = await apiCall('POST', `/clinical/investigations/${labOrder.id}/results`, 'DOCTOR', {
    resultValue: '<0.01 ng/mL',
    normalRange: '0.00 - 0.04 ng/mL',
    isAbnormal: false
  });
  assert(labResultRes.status === 200, 'DOCTOR records lab results (HTTP 200)');
  assert(labResultRes.body.data.status === 'result_available', 'Lab status is "result_available"');
  assert(Boolean(labResultRes.body.data.resultTimestamp), 'Result timestamp recorded');

  // VAIDYA attempting to review result receives CLINICAL_DISCIPLINE_MISMATCH
  const labReviewVaidya = await apiCall('POST', `/clinical/investigations/${labOrder.id}/review`, 'VAIDYA', {
    reviewNotes: 'Ayurvedic correlation attempt'
  });
  assert(labReviewVaidya.status === 403, 'VAIDYA cannot review Modern Medicine investigations (HTTP 403)');
  assert(labReviewVaidya.body.code === 'CLINICAL_DISCIPLINE_MISMATCH', 'VAIDYA review receives CLINICAL_DISCIPLINE_MISMATCH');

  // Non-clinician reviews result (fails with CLINICAL_AUTHORITY_REQUIRED)
  const labReviewNonClinician = await apiCall('POST', `/clinical/investigations/${labOrder.id}/review`, 'RECEPTIONIST', {
    reviewNotes: 'Normal'
  });
  assert(labReviewNonClinician.status === 403, 'RECEPTIONIST cannot review lab investigations (HTTP 403)');
  assert(labReviewNonClinician.body.code === 'CLINICAL_AUTHORITY_REQUIRED', 'RECEPTIONIST review receives CLINICAL_AUTHORITY_REQUIRED');

  // DOCTOR authoritatively reviews result
  const labReviewDoc = await apiCall('POST', `/clinical/investigations/${labOrder.id}/review`, 'DOCTOR', {
    reviewNotes: 'Troponin within normal reference range. Acute myocardial infarction ruled out.'
  });
  assert(labReviewDoc.status === 200, 'DOCTOR authoritatively reviews lab investigation (HTTP 200)');
  assert(labReviewDoc.body.data.status === 'reviewed', 'Lab status updated to "reviewed"');
  assert(Boolean(labReviewDoc.body.data.reviewedAt), 'reviewedAt timestamp recorded');
  assert(Boolean(labReviewDoc.body.data.reviewedByName), 'Attribution recorded');

  // Cross-discipline investigation read
  const labReadVaidya = await apiCall('GET', `/clinical/investigations/${labOrder.id}`, 'VAIDYA');
  assert(labReadVaidya.status === 403, 'VAIDYA cannot read Modern Medicine investigation (HTTP 403)');
  assert(labReadVaidya.body.code === 'CLINICAL_DISCIPLINE_MISMATCH', 'VAIDYA read receives CLINICAL_DISCIPLINE_MISMATCH');

  const labReadDoc = await apiCall('GET', `/clinical/investigations/${labOrder.id}`, 'DOCTOR');
  assert(labReadDoc.status === 200, 'DOCTOR reads Modern Medicine investigation (HTTP 200)');
  assert(labReadDoc.body.data.id === labOrder.id, 'Investigation record retrieved correctly');

  // -------------------------------------------------------------------------
  // 10. PRESCRIPTIONS & INVENTORY STOCK PROTECTION
  // -------------------------------------------------------------------------
  console.log(`\n${YELLOW}▶ 10. PRESCRIPTION INTEGRITY & INVENTORY PRESERVATION${RESET}`);
  const initialStockQty = medStock.stockQuantity;

  // Unknown medication ID fails
  const rxUnknownMed = await apiCall('POST', `/clinical/encounters/${doctorEncounter.id}/prescriptions`, 'DOCTOR', {
    medicationId: 'non-existent-med',
    dosage: '10ml',
    frequency: 'BD',
    duration: '14 days'
  });
  assert(rxUnknownMed.status === 404, 'Prescription with invalid catalogue ID fails (HTTP 404)');

  // Prescribing valid medication from inventory
  const rxSuccess = await apiCall('POST', `/clinical/encounters/${doctorEncounter.id}/prescriptions`, 'DOCTOR', {
    medicationId: medStock.id,
    dosage: '500mg TDS',
    frequency: 'Three Times Daily (TDS)',
    route: 'Oral',
    duration: '5 days',
    quantity: 2,
    instructions: 'Take after meals'
  });
  assert(rxSuccess.status === 201, 'Prescription created successfully (HTTP 201)');
  const prescription = rxSuccess.body.data;
  assert(prescription.status === 'pending', 'Prescription starts in "pending" status');
  assert(prescription.rxNumber.startsWith('RX-'), `Rx Number: ${prescription.rxNumber}`);

  // CRITICAL: Stock quantity MUST NOT DECREMENT on prescription creation!
  const stockCheck = await prisma.medicationStock.findUnique({ where: { id: medStock.id } });
  assert(stockCheck?.stockQuantity === initialStockQty, `Inventory stock preserved: remaining = ${stockCheck?.stockQuantity} (expected ${initialStockQty})`);

  // -------------------------------------------------------------------------
  // 11. AYURVEDIC CLINICAL OPERATIONS (VAIDYA DISCIPLINE)
  // -------------------------------------------------------------------------
  console.log(`\n${YELLOW}▶ 11. AYURVEDIC CLINICAL OPERATIONS (PRAKRITI, VIKRITI, DOSHA, PANCHAKARMA)${RESET}`);
  // DOCTOR attempting Vaidya Prakriti fails
  const prakritiDocFail = await apiCall('POST', `/clinical/encounters/${vaidyaEncounter.id}/prakriti`, 'DOCTOR', {
    vataScore: 40,
    pittaScore: 35,
    kaphaScore: 25,
    dominantPrakriti: 'Vata-Pitta',
    clinicalInterpretation: 'Interpretation by doctor'
  });
  assert(prakritiDocFail.status === 403, 'DOCTOR blocked from Prakriti assessment (HTTP 403)');

  // Prakriti without interpretation fails
  const prakritiNoInterp = await apiCall('POST', `/clinical/encounters/${vaidyaEncounter.id}/prakriti`, 'VAIDYA', {
    vataScore: 40,
    pittaScore: 35,
    kaphaScore: 25,
    dominantPrakriti: 'Vata-Pitta'
  });
  assert(prakritiNoInterp.status === 400, 'Prakriti assessment requires mandatory clinical interpretation (HTTP 400)');

  // Authorized VAIDYA Prakriti
  const prakritiSuccess = await apiCall('POST', `/clinical/encounters/${vaidyaEncounter.id}/prakriti`, 'VAIDYA', {
    vataScore: 45,
    pittaScore: 35,
    kaphaScore: 20,
    dominantPrakriti: 'Vata-Pitta',
    clinicalInterpretation: 'Dvandvaja Prakriti with Vata predominance, prone to degenerative articular disorders.'
  });
  assert(prakritiSuccess.status === 201, 'VAIDYA records Prakriti assessment (HTTP 201)');
  assert(prakritiSuccess.body.data.dominantPrakriti === 'Vata-Pitta', 'Prakriti dominant type recorded');

  // Vikriti Assessment
  const vikritiSuccess = await apiCall('POST', `/clinical/encounters/${vaidyaEncounter.id}/vikriti`, 'VAIDYA', {
    primaryVikriti: 'Vata Aggravation',
    secondaryVikriti: 'Kapha Avarana',
    vataAggravation: 'severe',
    pittaAggravation: 'normal',
    kaphaAggravation: 'mild',
    clinicalInterpretation: 'Vata localized in Asthi and Majja Dhatu with mild Kapha margavarana.'
  });
  assert(vikritiSuccess.status === 201, 'VAIDYA records Vikriti assessment (HTTP 201)');
  assert(vikritiSuccess.body.data.primaryVikriti === 'Vata Aggravation', 'Vikriti primary imbalance recorded');

  // Dosha Evaluation & Ashta Vidha Pariksha
  const doshaSuccess = await apiCall('POST', `/clinical/encounters/${vaidyaEncounter.id}/dosha-evaluation`, 'VAIDYA', {
    agniStatus: 'Vishama (Irregular)',
    amaStatus: 'Sama',
    koshthaType: 'Krura',
    ashtaVidhaPariksha: {
      nadi: 'Sarpa gati (Vata snake-like wave)',
      jihva: 'Moderate white Sama coating on posterior tongue',
      mutra: 'Normal, pale yellow',
      mala: 'Constipated, dry, pebbly stools'
    },
    clinicalInterpretation: 'Vishama Agni manifesting as Sama state with delayed intestinal transit.'
  });
  assert(doshaSuccess.status === 201, 'VAIDYA records Dosha Evaluation & Ashta Vidha Pariksha (HTTP 201)');
  assert(doshaSuccess.body.data.agniStatus.includes('Vishama'), 'Agni status preserved');

  // Ayurvedic Treatment Plan
  const planSuccess = await apiCall('POST', `/clinical/encounters/${vaidyaEncounter.id}/treatment-plans`, 'VAIDYA', {
    therapyType: 'Janu Basti (Medicated Oil Retention - Knees)',
    clinicalObjective: 'Vata Shamana and Asthi Dhatu Poshana',
    oilOrFormulation: 'Sahacharadi Thailam + Ksheerabala 101',
    totalSessions: 7,
    frequency: 'Daily',
    startDate: '2026-11-15',
    endDate: '2026-11-21',
    instructions: 'Follow warm water bath 30 mins after therapy, avoid cold draft.'
  });
  assert(planSuccess.status === 201, 'VAIDYA creates Ayurvedic Treatment Plan (HTTP 201)');
  assert(planSuccess.body.data.planNumber.startsWith('TP-'), `Assigned Treatment Plan Number: ${planSuccess.body.data.planNumber}`);

  // Panchakarma Referral
  const referralSuccess = await apiCall('POST', `/clinical/encounters/${vaidyaEncounter.id}/panchakarma-referrals`, 'VAIDYA', {
    proposedProcedure: 'Virechana & Matra Basti',
    clinicalIndication: 'Chronic Asthigata Vata with gut dysbiosis',
    preliminaryNotes: 'Complete Purvakarma (Snehana-Swedana) for 5 days prior to Sodhana',
    urgency: 'routine'
  });
  assert(referralSuccess.status === 201, 'VAIDYA creates Panchakarma Referral (HTTP 201)');
  const referral = referralSuccess.body.data;
  assert(referral.referralNumber.startsWith('PKR-'), `Assigned Referral Number: ${referral.referralNumber}`);
  assert(referral.status === 'referred', 'Referral status starts as "referred"');

  // -------------------------------------------------------------------------
  // 12. ENCOUNTER COMPLETION & CLINICAL DOCUMENTATION FLAG
  // -------------------------------------------------------------------------
  console.log(`\n${YELLOW}▶ 12. ENCOUNTER COMPLETION & CLINICAL DOCUMENTATION FLAG${RESET}`);
  // Non-clinician completion attempt
  const compNonClinician = await apiCall('POST', `/clinical/encounters/${doctorEncounter.id}/complete`, 'RECEPTIONIST');
  assert(compNonClinician.status === 403, 'RECEPTIONIST cannot complete encounter (HTTP 403)');

  // Cross-discipline completion attempt (VAIDYA completing DOCTOR encounter)
  const compCrossDiscipline = await apiCall('POST', `/clinical/encounters/${doctorEncounter.id}/complete`, 'VAIDYA');
  assert(compCrossDiscipline.status === 403, 'VAIDYA cannot complete DOCTOR encounter (HTTP 403)');

  // DOCTOR completes DOCTOR encounter
  const compDoctor = await apiCall('POST', `/clinical/encounters/${doctorEncounter.id}/complete`, 'DOCTOR');
  assert(compDoctor.status === 200, 'DOCTOR completes clinical encounter (HTTP 200)');
  assert(compDoctor.body.data.status === 'completed', 'Encounter status is "completed"');
  assert(compDoctor.body.data.clinicalDocumentationCompleted === true, 'clinicalDocumentationCompleted is true');

  // Linked appointment is also completed
  const linkedAppt = await prisma.appointment.findUnique({ where: { id: doctorAppt.id } });
  assert(linkedAppt?.status === 'completed', 'Linked appointment status synchronized to "completed"');
  assert(linkedAppt?.clinicalDocumentationCompleted === true, 'Linked appointment clinicalDocumentationCompleted is true');

  // VAIDYA completes VAIDYA encounter
  const compVaidya = await apiCall('POST', `/clinical/encounters/${vaidyaEncounter.id}/complete`, 'VAIDYA');
  assert(compVaidya.status === 200, 'VAIDYA completes Ayurvedic encounter (HTTP 200)');
  assert(compVaidya.body.data.status === 'completed', 'Ayurvedic encounter status is "completed"');

  // -------------------------------------------------------------------------
  // 13. PATIENT CLINICAL HISTORY VIEW
  // -------------------------------------------------------------------------
  console.log(`\n${YELLOW}▶ 13. PATIENT CLINICAL HISTORY DOSSIER AGGREGATION${RESET}`);
  const histRes = await apiCall('GET', `/clinical/patients/${testPatient.id}/history`, 'DOCTOR');
  assert(histRes.status === 200, 'Fetched patient clinical history (HTTP 200)');
  const hist = histRes.body.data;
  assert(Array.isArray(hist.encounters) && hist.encounters.length >= 2, `Aggregated encounters: count=${hist.encounters.length}`);
  assert(Array.isArray(hist.vitals) && hist.vitals.length >= 3, `Aggregated vitals: count=${hist.vitals.length}`);
  assert(Array.isArray(hist.diagnoses) && hist.diagnoses.length >= 1, `Aggregated diagnoses: count=${hist.diagnoses.length}`);
  assert(Array.isArray(hist.labOrders) && hist.labOrders.length >= 1, `Aggregated lab orders: count=${hist.labOrders.length}`);
  assert(Array.isArray(hist.prescriptions) && hist.prescriptions.length >= 1, `Aggregated prescriptions: count=${hist.prescriptions.length}`);
  assert(Array.isArray(hist.treatmentPlans) && hist.treatmentPlans.length >= 1, `Aggregated treatment plans: count=${hist.treatmentPlans.length}`);
  assert(Array.isArray(hist.panchakarmaReferrals) && hist.panchakarmaReferrals.length >= 1, `Aggregated Panchakarma referrals: count=${hist.panchakarmaReferrals.length}`);

  // -------------------------------------------------------------------------
  // 14. PRODUCTION DATABASE ZERO-MUTATION VERIFICATION
  // -------------------------------------------------------------------------
  console.log(`\n${YELLOW}▶ 14. FINAL PRODUCTION DATABASE ZERO-MUTATION VERIFICATION${RESET}`);
  const finalProd = await getProductionSnapshot();
  if (prodProbePrisma) {
    await prodProbePrisma.$disconnect().catch(() => {});
  }

  if (initialProd && finalProd) {
    console.log(`  Final Production DB Snapshot: users=${finalProd.users}, patients=${finalProd.patients}, appointments=${finalProd.appointments}, tariffs=${finalProd.tariffs}, encounters=${finalProd.encounters}`);
    assert(finalProd.users === initialProd.users, `Users count unchanged: ${finalProd.users} == ${initialProd.users}`);
    assert(finalProd.patients === initialProd.patients, `Patients count unchanged: ${finalProd.patients} == ${initialProd.patients} (0)`);
    assert(finalProd.appointments === initialProd.appointments, `Appointments count unchanged: ${finalProd.appointments} == ${initialProd.appointments} (0)`);
    assert(finalProd.prescriptions === initialProd.prescriptions, `Prescriptions count unchanged: ${finalProd.prescriptions} == ${initialProd.prescriptions} (0)`);
    assert(finalProd.invoices === initialProd.invoices, `Invoices count unchanged: ${finalProd.invoices} == ${initialProd.invoices} (0)`);
    assert(finalProd.tariffs === initialProd.tariffs, `Tariffs count unchanged: ${finalProd.tariffs} == ${initialProd.tariffs} (10)`);
    assert(finalProd.encounters === initialProd.encounters, `Encounters count unchanged: ${finalProd.encounters} == ${initialProd.encounters} (0)`);
  } else {
    console.log('  ℹ [SKIPPED] Production database zero-mutation audit skipped: isolated CI/test environment (zero production database access).');
  }

  // Cleanup test fixtures
  await prisma.clinicalVitals.deleteMany({});
  await prisma.clinicalAssessment.deleteMany({});
  await prisma.clinicalDiagnosis.deleteMany({});
  await prisma.prakritiAssessment.deleteMany({});
  await prisma.vikritiAssessment.deleteMany({});
  await prisma.doshaEvaluation.deleteMany({});
  await prisma.panchakarmaReferral.deleteMany({});
  await prisma.prescription.deleteMany({ where: { patientId: testPatient.id } });
  await prisma.labOrder.deleteMany({ where: { patientId: testPatient.id } });
  await prisma.treatmentPlan.deleteMany({ where: { patientId: testPatient.id } });
  await prisma.clinicalEncounter.deleteMany({});
  await prisma.appointment.deleteMany({ where: { patientId: testPatient.id } });
  await prisma.patient.deleteMany({ where: { id: testPatient.id } });
  await prisma.medicationStock.deleteMany({ where: { id: medStock.id } });

  server.close();
  await prisma.$disconnect();

  console.log(`\n${CYAN}═══════════════════════════════════════════════════════════════════════════════${RESET}`);
  console.log(`${CYAN}   PHASE 3 CLINICAL OPERATIONS VERIFICATION RESULTS: ${passed} PASSED, ${failed} FAILED   ${RESET}`);
  console.log(`${CYAN}═══════════════════════════════════════════════════════════════════════════════${RESET}\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runVerification().catch((err) => {
  console.error('\nUnhandled Verification Failure:', err);
  process.exit(1);
});
