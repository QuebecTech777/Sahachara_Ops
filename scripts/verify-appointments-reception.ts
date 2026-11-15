/**
 * SAHACHARA OPS — PHASE 2: APPOINTMENTS & RECEPTION MANAGEMENT VERIFICATION SUITE
 *
 * Verifies all appointments, reception operations, patient check-in, deterministic queue
 * management, Doctor/Vaidya discipline isolation, 7-role RBAC, and production database isolation.
 */

import http from 'http';
import express from 'express';
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
import {
  checkPrismaConnection,
  ensureDefaultDatabaseUsers,
  isPrismaConnected,
  prisma,
  generateUniqueAppointmentNumber
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
    const [users, patients, appointments, prescriptions, invoices, tariffs] = await Promise.all([
      prodProbePrisma.user.count(),
      prodProbePrisma.patient.count(),
      prodProbePrisma.appointment.count(),
      prodProbePrisma.prescription.count(),
      prodProbePrisma.invoice.count(),
      prodProbePrisma.hospitalTariff.count()
    ]);
    return { users, patients, appointments, prescriptions, invoices, tariffs };
  } catch {
    return null;
  }
}

async function runVerification() {
  console.log(`\n${CYAN}═══════════════════════════════════════════════════════════════════════════════${RESET}`);
  console.log(`${CYAN}   SAHACHARA OPS — PHASE 2: APPOINTMENTS & RECEPTION MANAGEMENT VERIFICATION   ${RESET}`);
  console.log(`${CYAN}═══════════════════════════════════════════════════════════════════════════════${RESET}\n`);

  await checkPrismaConnection();
  const dbInfo = await prisma.$queryRaw<[{ current_database: string }]>`SELECT current_database()`;
  const connectedTestDb = dbInfo[0]?.current_database;
  if (connectedTestDb !== 'sahachara_ops_test_db') {
    console.error(`${RED}FATAL: Integration test connected to "${connectedTestDb}". Expected "sahachara_ops_test_db". Aborting.${RESET}`);
    process.exit(1);
  }
  console.log(`${GREEN}✓ Isolated Test Database Connected:${RESET} ${connectedTestDb}`);

  const prodBefore = await getProductionSnapshot();
  if (prodBefore) {
    console.log(`${CYAN}✓ Production Database Pre-Test State Snapshot:${RESET}`, prodBefore);
    assert(prodBefore.appointments === 0, 'Production database starts with exactly 0 appointments');
  } else {
    console.log(`${CYAN}ℹ [SKIPPED] Production database pre-test probe skipped: isolated CI/test environment (zero production database access).${RESET}`);
  }

  await ensureDefaultDatabaseUsers();

  // Retrieve actual database user IDs for test staff accounts
  const dbUsers = await prisma.user.findMany();
  const userMap: Record<string, any> = {};
  for (const u of dbUsers) {
    if (!userMap[u.role] || (userMap[u.role].status !== 'active' && u.status === 'active')) {
      userMap[u.role] = u;
    }
  }

  const doctorUser = userMap['DOCTOR'];
  const vaidyaUser = userMap['VAIDYA'];
  const receptionUser = userMap['RECEPTIONIST'];
  const adminUser = userMap['ADMIN'];
  const superAdminUser = userMap['SUPER_ADMIN'];
  const pharmaUser = userMap['PHARMACIST'];
  const accountantUser = userMap['ACCOUNTANT'];

  assert(Boolean(doctorUser && vaidyaUser && receptionUser), 'Found active staff records for DOCTOR, VAIDYA, RECEPTIONIST');

  const app = express();
  app.use(express.json());
  app.use('/api', apiRouter);

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as any).port;
  const baseUrl = `http://127.0.0.1:${port}/api`;

  const tokens = {
    SUPER_ADMIN: generateSessionToken({ userId: superAdminUser.id, email: superAdminUser.email, name: superAdminUser.name, role: 'SUPER_ADMIN' }),
    ADMIN: generateSessionToken({ userId: adminUser.id, email: adminUser.email, name: adminUser.name, role: 'ADMIN' }),
    DOCTOR: generateSessionToken({ userId: doctorUser.id, email: doctorUser.email, name: doctorUser.name, role: 'DOCTOR' }),
    VAIDYA: generateSessionToken({ userId: vaidyaUser.id, email: vaidyaUser.email, name: vaidyaUser.name, role: 'VAIDYA' }),
    RECEPTIONIST: generateSessionToken({ userId: receptionUser.id, email: receptionUser.email, name: receptionUser.name, role: 'RECEPTIONIST' }),
    PHARMACIST: generateSessionToken({ userId: pharmaUser.id, email: pharmaUser.email, name: pharmaUser.name, role: 'PHARMACIST' }),
    ACCOUNTANT: generateSessionToken({ userId: accountantUser.id, email: accountantUser.email, name: accountantUser.name, role: 'ACCOUNTANT' })
  };

  async function apiCall(method: string, path: string, token?: string, body?: any) {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined
    });
    const json = await res.json().catch(() => ({}));
    return { status: res.status, ok: res.ok, body: json };
  }

  try {
    // Clean test DB appointments, test patients and audit logs for reception
    await prisma.appointment.deleteMany({});
    await prisma.patient.deleteMany({
      where: {
        mrn: { in: ['SAH-2026-90001', 'SAH-2026-90002', 'SAH-2026-90003'] }
      }
    });
    await prisma.auditLog.deleteMany({
      where: {
        category: { in: ['Reception Operations', 'Appointments & Scheduling'] }
      }
    }).catch(() => {});

    // Create 3 registered test patients in test DB
    const patientA = await prisma.patient.create({
      data: {
        mrn: 'SAH-2026-90001',
        firstName: 'Ananya',
        lastName: 'Rao',
        phone: '+91 98471 11111',
        gender: 'female',
        dob: '1992-05-14',
        bloodGroup: 'B+',
        status: 'active'
      }
    });

    const patientB = await prisma.patient.create({
      data: {
        mrn: 'SAH-2026-90002',
        firstName: 'Devan',
        lastName: 'Nambiar',
        phone: '+91 98472 22222',
        gender: 'male',
        dob: '1985-11-20',
        bloodGroup: 'O+',
        status: 'active'
      }
    });

    const patientC = await prisma.patient.create({
      data: {
        mrn: 'SAH-2026-90003',
        firstName: 'Meenakshi',
        lastName: 'Menon',
        phone: '+91 98473 33333',
        gender: 'female',
        dob: '1978-03-08',
        bloodGroup: 'A+',
        status: 'active'
      }
    });

    const todayStr = new Date().toISOString().split('T')[0];
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];

    // ─────────────────────────────────────────────────────────────
    // TEST 1: FAIL-CLOSED APPOINTMENT REFERENCE SEQUENCE
    // ─────────────────────────────────────────────────────────────
    console.log(`\n${YELLOW}1. Fail-Closed Appointment Reference Sequence${RESET}`);

    const ref1 = await generateUniqueAppointmentNumber();
    const ref2 = await generateUniqueAppointmentNumber();
    assert(/^APT-\d{4}-\d{5}$/.test(ref1), `Generated appointment reference matches APT-YYYY-XXXXX format: ${ref1}`);
    assert(/^APT-\d{4}-\d{5}$/.test(ref2), `Subsequent appointment reference matches format: ${ref2}`);
    assert(ref1 !== ref2, `Consecutive sequence numbers are strictly unique: ${ref1} !== ${ref2}`);

    const num1 = parseInt(ref1.split('-')[2], 10);
    const num2 = parseInt(ref2.split('-')[2], 10);
    assert(num2 === num1 + 1, `Authoritative PostgreSQL sequence increments sequentially: ${num1} -> ${num2}`);

    // Test sequence failure fail-closed behavior (no random fallback)
    try {
      await prisma.$executeRawUnsafe(`DROP SEQUENCE appointment_ref_seq`);
      let errorThrown = false;
      try {
        await generateUniqueAppointmentNumber();
      } catch (err: any) {
        errorThrown = true;
        assert(err.message.includes('APPOINTMENT_SEQUENCE_UNAVAILABLE'), 'Sequence failure throws controlled APPOINTMENT_SEQUENCE_UNAVAILABLE without silent random fallback');
      }
      assert(errorThrown, 'generateUniqueAppointmentNumber strictly fails-closed when sequence is missing');
    } finally {
      // Recreate sequence
      await prisma.$executeRawUnsafe(`CREATE SEQUENCE IF NOT EXISTS appointment_ref_seq START WITH ${num2 + 1}`);
    }

    // ─────────────────────────────────────────────────────────────
    // TEST 2: APPOINTMENT CREATION & PRACTITIONER VALIDATION
    // ─────────────────────────────────────────────────────────────
    console.log(`\n${YELLOW}2. Appointment Creation & Practitioner Validation${RESET}`);

    // Valid booking with Doctor
    const createRes1 = await apiCall('POST', '/appointments', tokens.RECEPTIONIST, {
      patientId: patientA.id,
      practitionerId: doctorUser.id,
      appointmentDate: tomorrowStr,
      timeSlot: '10:00 AM',
      type: 'General Consultation',
      notes: 'Initial clinical assessment'
    });
    assert(createRes1.status === 201, 'Receptionist successfully schedules appointment (HTTP 201)');
    assert(createRes1.body.success === true, 'Response reports success: true');
    assert(createRes1.body.data.appointmentNumber.startsWith('APT-'), `Appointment assigned authoritative sequence reference: ${createRes1.body.data.appointmentNumber}`);
    assert(createRes1.body.data.status === 'scheduled', 'Appointment status initialized to scheduled');
    assert(createRes1.body.data.practitionerRole === 'DOCTOR', 'Practitioner role assigned as DOCTOR');
    const aptA = createRes1.body.data;

    // Reject unknown patient
    const unknownPatientRes = await apiCall('POST', '/appointments', tokens.RECEPTIONIST, {
      patientId: 'non-existent-patient-uuid',
      practitionerId: doctorUser.id,
      appointmentDate: tomorrowStr,
      timeSlot: '11:00 AM'
    });
    assert(unknownPatientRes.status === 404, 'Booking with non-existent patient returns HTTP 404');
    assert(unknownPatientRes.body.code === 'PATIENT_NOT_FOUND', 'Returns error code PATIENT_NOT_FOUND');

    // Reject unknown practitioner
    const unknownPractitionerRes = await apiCall('POST', '/appointments', tokens.RECEPTIONIST, {
      patientId: patientA.id,
      practitionerId: 'non-existent-practitioner-uuid',
      appointmentDate: tomorrowStr,
      timeSlot: '11:00 AM'
    });
    assert(unknownPractitionerRes.status === 400, 'Booking with non-existent practitioner returns HTTP 400');
    assert(unknownPractitionerRes.body.code === 'INVALID_PRACTITIONER', 'Returns error code INVALID_PRACTITIONER');

    // Reject practitioner who is NOT a DOCTOR or VAIDYA (e.g. PHARMACIST)
    const invalidRoleRes = await apiCall('POST', '/appointments', tokens.RECEPTIONIST, {
      patientId: patientA.id,
      practitionerId: pharmaUser.id,
      appointmentDate: tomorrowStr,
      timeSlot: '11:00 AM'
    });
    assert(invalidRoleRes.status === 400, 'Booking with non-clinical staff (PHARMACIST) rejected with HTTP 400');
    assert(invalidRoleRes.body.code === 'INVALID_PRACTITIONER_ROLE', 'Returns error code INVALID_PRACTITIONER_ROLE');

    // ─────────────────────────────────────────────────────────────
    // TEST 3: PRACTITIONER CONFLICT DETECTION ENGINE
    // ─────────────────────────────────────────────────────────────
    console.log(`\n${YELLOW}3. Practitioner Conflict Detection Engine${RESET}`);

    // Attempt overlapping booking for same doctor, same date, same timeSlot
    const conflictRes = await apiCall('POST', '/appointments', tokens.RECEPTIONIST, {
      patientId: patientB.id,
      practitionerId: doctorUser.id,
      appointmentDate: tomorrowStr,
      timeSlot: '10:00 AM',
      type: 'Follow-up'
    });
    assert(conflictRes.status === 409, 'Overlapping booking for same practitioner & slot returns HTTP 409 Conflict');
    assert(conflictRes.body.code === 'APPOINTMENT_CONFLICT', 'Returns error code APPOINTMENT_CONFLICT');
    assert(conflictRes.body.conflict?.existingAppointmentId === aptA.id, 'Conflict response identifies conflicting appointment ID');

    // Allow booking different practitioner (Vaidya) at same date and slot
    const diffPractitionerRes = await apiCall('POST', '/appointments', tokens.RECEPTIONIST, {
      patientId: patientB.id,
      practitionerId: vaidyaUser.id,
      appointmentDate: tomorrowStr,
      timeSlot: '10:00 AM',
      type: 'Ayurvedic Initial Consultation'
    });
    assert(diffPractitionerRes.status === 201, 'Booking different practitioner (Vaidya) on same slot succeeds (HTTP 201)');
    assert(diffPractitionerRes.body.data.practitionerRole === 'VAIDYA', 'Vaidya appointment role registered correctly');

    // Allow booking same practitioner on different time slot
    const diffSlotRes = await apiCall('POST', '/appointments', tokens.RECEPTIONIST, {
      patientId: patientB.id,
      practitionerId: doctorUser.id,
      appointmentDate: tomorrowStr,
      timeSlot: '11:00 AM',
      type: 'Follow-up'
    });
    assert(diffSlotRes.status === 201, 'Booking same practitioner on different slot succeeds (HTTP 201)');

    // Allow booking same practitioner on different date
    const diffDateRes = await apiCall('POST', '/appointments', tokens.RECEPTIONIST, {
      patientId: patientB.id,
      practitionerId: doctorUser.id,
      appointmentDate: todayStr,
      timeSlot: '10:00 AM',
      type: 'Routine Review'
    });
    assert(diffDateRes.status === 201, 'Booking same practitioner on different date succeeds (HTTP 201)');
    const todayDoctorApt = diffDateRes.body.data;

    // Concurrent booking collision test (5 simultaneous requests for same slot)
    console.log('  Testing concurrent booking safety (5 simultaneous requests)...');
    const concurrentPromises = [1, 2, 3, 4, 5].map((i) =>
      apiCall('POST', '/appointments', tokens.RECEPTIONIST, {
        patientId: patientC.id,
        practitionerId: doctorUser.id,
        appointmentDate: tomorrowStr,
        timeSlot: '02:00 PM',
        notes: `Concurrent test attempt ${i}`
      })
    );
    const concurrentResults = await Promise.all(concurrentPromises);
    const successCount = concurrentResults.filter((r) => r.status === 201).length;
    const conflictCount = concurrentResults.filter((r) => r.status === 409).length;
    assert(successCount === 1, `Exactly 1 concurrent request succeeded (actual: ${successCount})`);
    assert(conflictCount === 4, `Remaining 4 concurrent requests failed with HTTP 409 APPOINTMENT_CONFLICT (actual: ${conflictCount})`);

    // ─────────────────────────────────────────────────────────────
    // TEST 4: WALK-IN ADMISSION WORKFLOW & CLINICAL GOVERNANCE
    // ─────────────────────────────────────────────────────────────
    console.log(`\n${YELLOW}4. Walk-In Admission Workflow & Clinical Governance${RESET}`);

    // Walk-in with normal priority by Receptionist
    const walkInRes1 = await apiCall('POST', '/appointments/walk-in', tokens.RECEPTIONIST, {
      patientId: patientA.id,
      practitionerId: doctorUser.id,
      reasonForVisit: 'Acute knee pain after morning walk',
      priority: 'normal'
    });
    assert(walkInRes1.status === 201, 'Admit walk-in patient succeeds (HTTP 201)');
    assert(walkInRes1.body.data.status === 'waiting', 'Walk-in status immediately initialized to "waiting"');
    assert(walkInRes1.body.data.bookingSource === 'walk_in', 'Walk-in bookingSource set to "walk_in"');
    assert(Boolean(walkInRes1.body.data.checkInTime), 'Walk-in checkInTime automatically stamped with arrival time');
    assert(typeof walkInRes1.body.data.queuePosition === 'number' && walkInRes1.body.data.queuePosition > 0, `Walk-in assigned valid queue position: #${walkInRes1.body.data.queuePosition}`);
    assert(walkInRes1.body.data.priority === 'normal', 'Walk-in default priority initialized to "normal"');
    const walkInApt1 = walkInRes1.body.data;

    // Walk-in with clinical triage priority attempted by Receptionist -> must be blocked (HTTP 403)
    const receptionUrgentRes = await apiCall('POST', '/appointments/walk-in', tokens.RECEPTIONIST, {
      patientId: patientB.id,
      practitionerId: doctorUser.id,
      reasonForVisit: 'Chest discomfort',
      priority: 'urgent',
      priorityReason: 'Front desk triage attempt'
    });
    assert(receptionUrgentRes.status === 403, 'RECEPTIONIST attempting clinical triage priority returns HTTP 403');
    assert(receptionUrgentRes.body.code === 'CLINICAL_TRIAGE_RESTRICTED', 'Returns error code CLINICAL_TRIAGE_RESTRICTED');

    const receptionPriorityRes = await apiCall('POST', '/appointments/walk-in', tokens.RECEPTIONIST, {
      patientId: patientB.id,
      practitionerId: doctorUser.id,
      reasonForVisit: 'Fever and chills',
      priority: 'priority',
      priorityReason: 'Front desk priority attempt'
    });
    assert(receptionPriorityRes.status === 403, 'RECEPTIONIST attempting priority triage returns HTTP 403');
    assert(receptionPriorityRes.body.code === 'CLINICAL_TRIAGE_RESTRICTED', 'Returns error code CLINICAL_TRIAGE_RESTRICTED');

    // Administrative emergency escalation by Receptionist without reason -> HTTP 400
    const escNoReasonRes = await apiCall('POST', '/appointments/walk-in', tokens.RECEPTIONIST, {
      patientId: patientB.id,
      practitionerId: doctorUser.id,
      reasonForVisit: 'Severe chest tightness',
      isEscalated: true
    });
    assert(escNoReasonRes.status === 400, 'Emergency escalation without escalationReason returns HTTP 400');
    assert(escNoReasonRes.body.code === 'ESCALATION_REASON_REQUIRED', 'Returns error code ESCALATION_REASON_REQUIRED');

    // Administrative emergency escalation by Receptionist with reason -> HTTP 201
    const receptionEscRes = await apiCall('POST', '/appointments/walk-in', tokens.RECEPTIONIST, {
      patientId: patientB.id,
      practitionerId: doctorUser.id,
      reasonForVisit: 'Acute diaphoresis and breathing difficulty reported at reception',
      isEscalated: true,
      escalationReason: 'Patient arrived in acute respiratory distress; flagged for immediate clinician assessment'
    });
    assert(receptionEscRes.status === 201, 'Receptionist emergency escalation succeeds (HTTP 201)');
    assert(receptionEscRes.body.data.isEscalated === true, 'isEscalated saved as true');
    assert(Boolean(receptionEscRes.body.data.escalatedAt), 'escalatedAt timestamp stamped');
    assert(receptionEscRes.body.data.escalationReason === 'Patient arrived in acute respiratory distress; flagged for immediate clinician assessment', 'escalationReason saved');
    assert(receptionEscRes.body.data.priority === 'normal', 'Priority remains administrative normal without fabricated clinical triage');
    const escalatedWalkInApt = receptionEscRes.body.data;

    // Doctor establishing clinical triage for Doctor walk-in without reason -> HTTP 400
    const docNoReasonRes = await apiCall('POST', '/appointments/walk-in', tokens.DOCTOR, {
      patientId: patientB.id,
      practitionerId: doctorUser.id,
      reasonForVisit: 'Chest discomfort',
      priority: 'urgent'
    });
    assert(docNoReasonRes.status === 400, 'Clinician urgent triage without priorityReason returns HTTP 400');
    assert(docNoReasonRes.body.code === 'PRIORITY_REASON_REQUIRED', 'Returns error code PRIORITY_REASON_REQUIRED');

    // Doctor cross-discipline triage attempt on Vaidya appointment -> HTTP 403
    const docVaidyaTriageRes = await apiCall('POST', '/appointments/walk-in', tokens.DOCTOR, {
      patientId: patientB.id,
      practitionerId: vaidyaUser.id,
      reasonForVisit: 'Ayurvedic intake',
      priority: 'urgent',
      priorityReason: 'Doctor attempting to triage Vaidya patient'
    });
    assert(docVaidyaTriageRes.status === 403, 'Doctor cross-discipline triage on Vaidya returns HTTP 403');
    assert(docVaidyaTriageRes.body.code === 'CLINICAL_DISCIPLINE_MISMATCH', 'Returns error code CLINICAL_DISCIPLINE_MISMATCH');

    // Doctor establishing clinical triage for Doctor walk-in with reason -> HTTP 201
    const urgentWalkInRes = await apiCall('POST', '/appointments/walk-in', tokens.DOCTOR, {
      patientId: patientB.id,
      practitionerId: doctorUser.id,
      reasonForVisit: 'Severe chest tightness & diaphoresis',
      priority: 'urgent',
      priorityReason: 'Acute clinical distress requiring immediate triage'
    });
    assert(urgentWalkInRes.status === 201, 'Doctor clinical triage walk-in succeeds (HTTP 201)');
    assert(urgentWalkInRes.body.data.priority === 'urgent', 'Priority recorded as urgent');
    assert(urgentWalkInRes.body.data.priorityReason === 'Acute clinical distress requiring immediate triage', 'Priority reason recorded');
    assert(urgentWalkInRes.body.data.clinicalTriageRole === 'DOCTOR', 'clinicalTriageRole recorded as DOCTOR');
    assert(Boolean(urgentWalkInRes.body.data.clinicalTriageAt), 'clinicalTriageAt timestamp recorded');
    const urgentWalkInApt = urgentWalkInRes.body.data;

    // Walk-in for Vaidya
    const vaidyaWalkInRes = await apiCall('POST', '/appointments/walk-in', tokens.RECEPTIONIST, {
      patientId: patientC.id,
      practitionerId: vaidyaUser.id,
      reasonForVisit: 'Severe Vata aggravation with cervical spasm',
      priority: 'normal'
    });
    assert(vaidyaWalkInRes.status === 201, 'Walk-in for Vaidya succeeds (HTTP 201)');
    assert(vaidyaWalkInRes.body.data.practitionerRole === 'VAIDYA', 'Vaidya walk-in assigned role VAIDYA');
    const vaidyaWalkInApt = vaidyaWalkInRes.body.data;

    // ─────────────────────────────────────────────────────────────
    // TEST 5: RECEPTION CHECK-IN WORKFLOW
    // ─────────────────────────────────────────────────────────────
    console.log(`\n${YELLOW}5. Reception Check-In Workflow${RESET}`);

    // Check-in for today's scheduled appointment
    const checkInRes = await apiCall('POST', `/appointments/${todayDoctorApt.id}/check-in`, tokens.RECEPTIONIST, {
      receptionNotes: 'Patient arrived on time, wheelchair requested at reception'
    });
    assert(checkInRes.status === 200, 'Check-in today appointment returns HTTP 200');
    assert(checkInRes.body.data.status === 'waiting', 'Status transitioned to "waiting"');
    assert(Boolean(checkInRes.body.data.checkInTime), 'checkInTime recorded on arrival');
    assert(typeof checkInRes.body.data.queuePosition === 'number', `Assigned deterministic queuePosition: #${checkInRes.body.data.queuePosition}`);
    assert(checkInRes.body.data.receptionNotes === 'Patient arrived on time, wheelchair requested at reception', 'Reception notes persisted');

    // Duplicate check-in prevention
    const duplicateCheckInRes = await apiCall('POST', `/appointments/${todayDoctorApt.id}/check-in`, tokens.RECEPTIONIST);
    assert(duplicateCheckInRes.status === 400, 'Duplicate check-in rejected with HTTP 400');
    assert(duplicateCheckInRes.body.code === 'ALREADY_CHECKED_IN', 'Returns error code ALREADY_CHECKED_IN');

    // Check-in on cancelled appointment rejected
    // First create and cancel an appointment
    const toCancelRes = await apiCall('POST', '/appointments', tokens.RECEPTIONIST, {
      patientId: patientA.id,
      practitionerId: doctorUser.id,
      appointmentDate: todayStr,
      timeSlot: '04:00 PM',
      type: 'General Consultation'
    });
    const toCancelId = toCancelRes.body.data.id;
    await apiCall('POST', `/appointments/${toCancelId}/cancel`, tokens.RECEPTIONIST, {
      cancellationReason: 'Patient called to cancel due to fever'
    });
    const checkInCancelledRes = await apiCall('POST', `/appointments/${toCancelId}/check-in`, tokens.RECEPTIONIST);
    assert(checkInCancelledRes.status === 400, 'Check-in on cancelled appointment rejected with HTTP 400');
    assert(checkInCancelledRes.body.code === 'INVALID_STATUS_TRANSITION', 'Returns error code INVALID_STATUS_TRANSITION');

    // ─────────────────────────────────────────────────────────────
    // TEST 6: REAL-TIME QUEUE ORDERING & PRIORITY TRIAGE
    // ─────────────────────────────────────────────────────────────
    console.log(`\n${YELLOW}6. Real-Time Queue Ordering & Priority Triage${RESET}`);

    // Fetch queue as Receptionist (all disciplines)
    const queueRes = await apiCall('GET', '/reception/queue', tokens.RECEPTIONIST);
    assert(queueRes.status === 200, 'Query /api/reception/queue returns HTTP 200');
    assert(Array.isArray(queueRes.body.data), 'Queue response contains array of items');
    assert(queueRes.body.data.length >= 3, `Queue contains active waiting patients (count: ${queueRes.body.data.length})`);

    const qItems = queueRes.body.data;
    // Verify waiting duration is calculated
    assert(typeof qItems[0].waitingDurationMinutes === 'number', 'waitingDurationMinutes is computed in minutes');

    // Verify priority hierarchy ordering:
    // isEscalated items MUST appear first (rank 0), followed by urgent (rank 1), priority (rank 2), normal (rank 3)
    let nonEscalatedSeen = false;
    let urgentSeen = false;
    let prioritySeen = false;
    let normalSeen = false;
    let hierarchyValid = true;

    for (const item of qItems) {
      if (item.isEscalated) {
        if (nonEscalatedSeen) hierarchyValid = false;
      } else {
        nonEscalatedSeen = true;
        if (item.priority === 'urgent') {
          if (prioritySeen || normalSeen) hierarchyValid = false;
          urgentSeen = true;
        } else if (item.priority === 'priority') {
          if (normalSeen) hierarchyValid = false;
          prioritySeen = true;
        } else if (item.priority === 'normal') {
          normalSeen = true;
        }
      }
    }
    assert(hierarchyValid, 'Queue deterministic ordering strictly enforces isEscalated > urgent > priority > normal hierarchy');

    // Non-clinician (Receptionist) attempting PATCH /reception/queue/:id/priority -> HTTP 403 CLINICAL_AUTHORITY_REQUIRED / CLINICAL_TRIAGE_RESTRICTED
    const normalItem = qItems.find((i: any) => i.priority === 'normal' && !i.isEscalated && i.practitionerRole === 'DOCTOR');
    assert(Boolean(normalItem), 'Found normal priority Doctor item in queue');

    const receptPatchPriorityRes = await apiCall('PATCH', `/reception/queue/${normalItem.id}/priority`, tokens.RECEPTIONIST, {
      priority: 'priority',
      priorityReason: 'Receptionist attempting clinical priority'
    });
    assert(receptPatchPriorityRes.status === 403, 'RECEPTIONIST attempting queue priority mutation returns HTTP 403');
    assert(
      receptPatchPriorityRes.body.code === 'CLINICAL_AUTHORITY_REQUIRED' || receptPatchPriorityRes.body.code === 'CLINICAL_TRIAGE_RESTRICTED',
      'Returns clinical restriction code (CLINICAL_AUTHORITY_REQUIRED / CLINICAL_TRIAGE_RESTRICTED)'
    );

    // Non-clinician flagging emergency escalation via POST /reception/queue/:id/escalate
    const receptEscalateNoReason = await apiCall('POST', `/reception/queue/${normalItem.id}/escalate`, tokens.RECEPTIONIST, {});
    assert(receptEscalateNoReason.status === 400, 'Queue escalation without reason returns HTTP 400');
    assert(receptEscalateNoReason.body.code === 'ESCALATION_REASON_REQUIRED', 'Returns error code ESCALATION_REASON_REQUIRED');

    const receptEscalateSuccess = await apiCall('POST', `/reception/queue/${normalItem.id}/escalate`, tokens.RECEPTIONIST, {
      escalationReason: 'Patient collapsed in waiting area, immediate clinician assistance requested'
    });
    assert(receptEscalateSuccess.status === 200, 'Queue emergency escalation succeeds (HTTP 200)');
    assert(receptEscalateSuccess.body.data.isEscalated === true, 'isEscalated set to true');
    assert(receptEscalateSuccess.body.data.escalationReason === 'Patient collapsed in waiting area, immediate clinician assistance requested', 'escalationReason saved');

    // Doctor cross-discipline triage on Vaidya queue item -> HTTP 403 CLINICAL_DISCIPLINE_MISMATCH
    const vaidyaQueueItem = qItems.find((i: any) => i.practitionerRole === 'VAIDYA');
    if (vaidyaQueueItem) {
      const docCrossTriageRes = await apiCall('PATCH', `/reception/queue/${vaidyaQueueItem.id}/priority`, tokens.DOCTOR, {
        priority: 'urgent',
        priorityReason: 'Cross discipline attempt'
      });
      assert(docCrossTriageRes.status === 403, 'Doctor cross-discipline triage on Vaidya queue item returns HTTP 403');
      assert(docCrossTriageRes.body.code === 'CLINICAL_DISCIPLINE_MISMATCH', 'Returns error code CLINICAL_DISCIPLINE_MISMATCH');
    }

    // Doctor adjusting Doctor queue item without reason -> HTTP 400
    const docNoReasonPatchRes = await apiCall('PATCH', `/reception/queue/${normalItem.id}/priority`, tokens.DOCTOR, {
      priority: 'priority'
    });
    assert(docNoReasonPatchRes.status === 400, 'Clinician priority adjustment without reason returns HTTP 400');
    assert(docNoReasonPatchRes.body.code === 'PRIORITY_REASON_REQUIRED', 'Returns error code PRIORITY_REASON_REQUIRED');

    // Doctor adjusting Doctor queue item with reason -> HTTP 200
    const docPatchSuccessRes = await apiCall('PATCH', `/reception/queue/${normalItem.id}/priority`, tokens.DOCTOR, {
      priority: 'priority',
      priorityReason: 'Clinical review of initial vitals indicates worsening hypertension'
    });
    assert(docPatchSuccessRes.status === 200, 'Clinician priority adjustment with reason returns HTTP 200');
    assert(docPatchSuccessRes.body.data.priority === 'priority', 'Priority updated to priority');
    assert(docPatchSuccessRes.body.data.clinicalTriageRole === 'DOCTOR', 'clinicalTriageRole recorded as DOCTOR');

    // ─────────────────────────────────────────────────────────────
    // TEST 7: DOCTOR AND VAIDYA CLINICAL DISCIPLINE SEPARATION
    // ─────────────────────────────────────────────────────────────
    console.log(`\n${YELLOW}7. Doctor and Vaidya Clinical Discipline Separation${RESET}`);

    // Doctor queries queue -> should ONLY see DOCTOR appointments
    const doctorQueueRes = await apiCall('GET', '/reception/queue', tokens.DOCTOR);
    assert(doctorQueueRes.status === 200, 'Doctor queries queue returns HTTP 200');
    const doctorItems = doctorQueueRes.body.data;
    const hasVaidyaInDocQueue = doctorItems.some((i: any) => i.practitionerRole === 'VAIDYA');
    assert(!hasVaidyaInDocQueue, 'Doctor queue strictly excludes Vaidya consultations');
    assert(doctorItems.every((i: any) => i.practitionerRole === 'DOCTOR'), 'All items in Doctor queue belong to DOCTOR discipline');

    // Vaidya queries queue -> should ONLY see VAIDYA appointments
    const vaidyaQueueRes = await apiCall('GET', '/reception/queue', tokens.VAIDYA);
    assert(vaidyaQueueRes.status === 200, 'Vaidya queries queue returns HTTP 200');
    const vaidyaItems = vaidyaQueueRes.body.data;
    const hasDoctorInVaidyaQueue = vaidyaItems.some((i: any) => i.practitionerRole === 'DOCTOR');
    assert(!hasDoctorInVaidyaQueue, 'Vaidya queue strictly excludes Doctor consultations');
    assert(vaidyaItems.every((i: any) => i.practitionerRole === 'VAIDYA'), 'All items in Vaidya queue belong to VAIDYA discipline');

    // Administrative roles (ADMIN, SUPER_ADMIN) attempting consultation handoff -> HTTP 403 CLINICAL_AUTHORITY_REQUIRED
    const adminHandoffRes = await apiCall('POST', `/appointments/${urgentWalkInApt.id}/consultation-handoff`, tokens.ADMIN);
    assert(adminHandoffRes.status === 403, 'ADMIN attempting consultation handoff rejected with HTTP 403');
    assert(adminHandoffRes.body.code === 'CLINICAL_AUTHORITY_REQUIRED', 'Returns error code CLINICAL_AUTHORITY_REQUIRED');

    const superAdminHandoffRes = await apiCall('POST', `/appointments/${urgentWalkInApt.id}/consultation-handoff`, tokens.SUPER_ADMIN);
    assert(superAdminHandoffRes.status === 403, 'SUPER_ADMIN attempting consultation handoff rejected with HTTP 403');
    assert(superAdminHandoffRes.body.code === 'CLINICAL_AUTHORITY_REQUIRED', 'Returns error code CLINICAL_AUTHORITY_REQUIRED');

    // Cross-discipline consultation handoff blocked:
    // Doctor attempts to call Vaidya patient into consultation
    const doctorCallVaidyaRes = await apiCall('POST', `/appointments/${vaidyaWalkInApt.id}/consultation-handoff`, tokens.DOCTOR);
    assert(doctorCallVaidyaRes.status === 403, 'Doctor attempting handoff on Vaidya appointment returns HTTP 403');
    assert(doctorCallVaidyaRes.body.code === 'CLINICAL_DISCIPLINE_MISMATCH', 'Returns error code CLINICAL_DISCIPLINE_MISMATCH');

    // Vaidya attempts to call Doctor patient into consultation
    const vaidyaCallDoctorRes = await apiCall('POST', `/appointments/${urgentWalkInApt.id}/consultation-handoff`, tokens.VAIDYA);
    assert(vaidyaCallDoctorRes.status === 403, 'Vaidya attempting handoff on Doctor appointment returns HTTP 403');
    assert(vaidyaCallDoctorRes.body.code === 'CLINICAL_DISCIPLINE_MISMATCH', 'Returns error code CLINICAL_DISCIPLINE_MISMATCH');

    // Authorized handoff within discipline:
    // Doctor calls Doctor patient
    const doctorHandoffRes = await apiCall('POST', `/appointments/${urgentWalkInApt.id}/consultation-handoff`, tokens.DOCTOR);
    assert(doctorHandoffRes.status === 200, 'Doctor handoff on Doctor appointment succeeds (HTTP 200)');
    assert(doctorHandoffRes.body.data.status === 'in_consultation', 'Status transitioned to in_consultation');
    assert(Boolean(doctorHandoffRes.body.data.consultationStartTime), 'consultationStartTime recorded');

    // Vaidya calls Vaidya patient
    const vaidyaHandoffRes = await apiCall('POST', `/appointments/${vaidyaWalkInApt.id}/consultation-handoff`, tokens.VAIDYA);
    assert(vaidyaHandoffRes.status === 200, 'Vaidya handoff on Vaidya appointment succeeds (HTTP 200)');
    assert(vaidyaHandoffRes.body.data.status === 'in_consultation', 'Status transitioned to in_consultation');
    assert(Boolean(vaidyaHandoffRes.body.data.consultationStartTime), 'consultationStartTime recorded for Vaidya');

    // Administrative roles (ADMIN, SUPER_ADMIN) attempting consultation completion -> HTTP 403 CLINICAL_AUTHORITY_REQUIRED
    const adminCompleteRes = await apiCall('POST', `/appointments/${urgentWalkInApt.id}/complete`, tokens.ADMIN);
    assert(adminCompleteRes.status === 403, 'ADMIN attempting consultation completion rejected with HTTP 403');
    assert(adminCompleteRes.body.code === 'CLINICAL_AUTHORITY_REQUIRED', 'Returns error code CLINICAL_AUTHORITY_REQUIRED');

    const superAdminCompleteRes = await apiCall('POST', `/appointments/${urgentWalkInApt.id}/complete`, tokens.SUPER_ADMIN);
    assert(superAdminCompleteRes.status === 403, 'SUPER_ADMIN attempting consultation completion rejected with HTTP 403');
    assert(superAdminCompleteRes.body.code === 'CLINICAL_AUTHORITY_REQUIRED', 'Returns error code CLINICAL_AUTHORITY_REQUIRED');

    // Cross-discipline completion blocked:
    // Vaidya attempts to complete Doctor consultation
    const vaidyaCompleteDoctorRes = await apiCall('POST', `/appointments/${urgentWalkInApt.id}/complete`, tokens.VAIDYA);
    assert(vaidyaCompleteDoctorRes.status === 403, 'Vaidya attempting completion of Doctor consultation returns HTTP 403');
    assert(vaidyaCompleteDoctorRes.body.code === 'CLINICAL_DISCIPLINE_MISMATCH', 'Returns CLINICAL_DISCIPLINE_MISMATCH');

    // Authorized completion within discipline:
    const doctorCompleteRes = await apiCall('POST', `/appointments/${urgentWalkInApt.id}/complete`, tokens.DOCTOR);
    assert(doctorCompleteRes.status === 200, 'Doctor completes Doctor consultation (HTTP 200)');
    assert(doctorCompleteRes.body.data.status === 'completed', 'Status transitioned to completed');
    assert(Boolean(doctorCompleteRes.body.data.completedAt), 'completedAt timestamp recorded');
    assert(doctorCompleteRes.body.data.clinicalDocumentationCompleted === false, 'clinicalDocumentationCompleted is strictly false (no synthetic clinical record)');
    assert(doctorCompleteRes.body.clinicalDocumentationCompleted === false, 'clinicalDocumentationCompleted in response is false');
    assert(doctorCompleteRes.body.clinicalRecordStatus === 'pending_clinical_module', 'clinicalRecordStatus indicates pending clinical module');

    const vaidyaCompleteRes = await apiCall('POST', `/appointments/${vaidyaWalkInApt.id}/complete`, tokens.VAIDYA);
    assert(vaidyaCompleteRes.status === 200, 'Vaidya completes Vaidya consultation (HTTP 200)');
    assert(vaidyaCompleteRes.body.data.status === 'completed', 'Status transitioned to completed');
    assert(vaidyaCompleteRes.body.data.clinicalDocumentationCompleted === false, 'Vaidya appointment clinicalDocumentationCompleted is false');

    // ─────────────────────────────────────────────────────────────
    // TEST 8: STATUS LIFECYCLE STATE MACHINE & TRANSITION INTEGRITY
    // ─────────────────────────────────────────────────────────────
    console.log(`\n${YELLOW}8. Status Lifecycle State Machine & Transition Integrity${RESET}`);

    // Create fresh appointment to test invalid jumps
    const stateTestRes = await apiCall('POST', '/appointments', tokens.RECEPTIONIST, {
      patientId: patientA.id,
      practitionerId: doctorUser.id,
      appointmentDate: tomorrowStr,
      timeSlot: '03:00 PM',
      type: 'General Consultation'
    });
    const stateAptId = stateTestRes.body.data.id;

    // Direct jump scheduled -> completed is illegal
    const illegalCompleteRes = await apiCall('POST', `/appointments/${stateAptId}/complete`, tokens.DOCTOR);
    assert(illegalCompleteRes.status === 400, 'Illegal transition scheduled -> completed returns HTTP 400');
    assert(illegalCompleteRes.body.code === 'INVALID_STATUS_TRANSITION', 'Returns error code INVALID_STATUS_TRANSITION');

    // Direct jump scheduled -> in_consultation is illegal (must check in first)
    const illegalHandoffRes = await apiCall('POST', `/appointments/${stateAptId}/consultation-handoff`, tokens.DOCTOR);
    assert(illegalHandoffRes.status === 400, 'Illegal transition scheduled -> in_consultation returns HTTP 400');
    assert(illegalHandoffRes.body.code === 'INVALID_STATUS_TRANSITION', 'Returns error code INVALID_STATUS_TRANSITION');

    // Cancellation requires reason
    const cancelNoReasonRes = await apiCall('POST', `/appointments/${stateAptId}/cancel`, tokens.RECEPTIONIST, {});
    assert(cancelNoReasonRes.status === 400, 'Cancellation without reason returns HTTP 400');
    assert(cancelNoReasonRes.body.code === 'CANCELLATION_REASON_REQUIRED', 'Returns error code CANCELLATION_REASON_REQUIRED');

    // Cancellation with reason succeeds
    const cancelRes = await apiCall('POST', `/appointments/${stateAptId}/cancel`, tokens.RECEPTIONIST, {
      cancellationReason: 'Patient admitted to inpatient ward'
    });
    assert(cancelRes.status === 200, 'Cancellation with explicit reason returns HTTP 200');
    assert(cancelRes.body.data.status === 'cancelled', 'Status transitioned to cancelled');
    assert(cancelRes.body.data.cancellationReason === 'Patient admitted to inpatient ward', 'Cancellation reason saved');

    // Rescheduling with history tracking
    const toRescheduleRes = await apiCall('POST', '/appointments', tokens.RECEPTIONIST, {
      patientId: patientB.id,
      practitionerId: doctorUser.id,
      appointmentDate: tomorrowStr,
      timeSlot: '03:30 PM',
      type: 'General Consultation'
    });
    const rescheduleId = toRescheduleRes.body.data.id;

    const afterReschedule = await apiCall('POST', `/appointments/${rescheduleId}/reschedule`, tokens.RECEPTIONIST, {
      newDateTime: `${tomorrowStr}T16:00:00.000Z`,
      newTimeSlot: '04:00 PM',
      reason: 'Physician attending clinical review panel'
    });
    assert(afterReschedule.status === 200, 'Reschedule returns HTTP 200');
    assert(afterReschedule.body.data.status === 'rescheduled', 'Status set to rescheduled');
    assert(afterReschedule.body.data.timeSlot === '04:00 PM', 'Time slot updated to 04:00 PM');
    assert(Array.isArray(afterReschedule.body.data.reschedulingHistory), 'reschedulingHistory array recorded');
    assert(afterReschedule.body.data.reschedulingHistory.length === 1, 'reschedulingHistory has 1 entry');
    assert(afterReschedule.body.data.reschedulingHistory[0].reason === 'Physician attending clinical review panel', 'Rescheduling reason recorded in history');

    // ─────────────────────────────────────────────────────────────
    // TEST 9: SEVEN-ROLE RBAC PERMISSION MATRIX
    // ─────────────────────────────────────────────────────────────
    console.log(`\n${YELLOW}9. Seven-Role RBAC Permission Matrix${RESET}`);

    // PHARMACIST must be barred from scheduling appointments (403)
    const pharmaScheduleRes = await apiCall('POST', '/appointments', tokens.PHARMACIST, {
      patientId: patientA.id,
      practitionerId: doctorUser.id,
      appointmentDate: tomorrowStr,
      timeSlot: '05:00 PM'
    });
    assert(pharmaScheduleRes.status === 403, 'PHARMACIST forbidden from scheduling appointment (HTTP 403)');

    // PHARMACIST must be barred from walk-in admission (403)
    const pharmaWalkInRes = await apiCall('POST', '/appointments/walk-in', tokens.PHARMACIST, {
      patientId: patientA.id,
      practitionerId: doctorUser.id,
      reasonForVisit: 'Pharma test'
    });
    assert(pharmaWalkInRes.status === 403, 'PHARMACIST forbidden from walk-in admission (HTTP 403)');

    // ACCOUNTANT must be barred from check-in (403)
    const acctCheckInRes = await apiCall('POST', `/appointments/${rescheduleId}/check-in`, tokens.ACCOUNTANT);
    assert(acctCheckInRes.status === 403, 'ACCOUNTANT forbidden from reception check-in (HTTP 403)');

    // ACCOUNTANT must be barred from queue priority adjustment (403)
    const acctPriorityRes = await apiCall('PATCH', `/reception/queue/${rescheduleId}/priority`, tokens.ACCOUNTANT, {
      priority: 'urgent',
      priorityReason: 'Accountant attempt'
    });
    assert(acctPriorityRes.status === 403, 'ACCOUNTANT forbidden from queue priority adjustment (HTTP 403)');

    // RECEPTIONIST must be barred from consultation handoff (403)
    const receptionHandoffRes = await apiCall('POST', `/appointments/${rescheduleId}/consultation-handoff`, tokens.RECEPTIONIST);
    assert(receptionHandoffRes.status === 403, 'RECEPTIONIST forbidden from clinical consultation handoff (HTTP 403)');

    // RECEPTIONIST must be barred from completing consultation (403)
    const receptionCompleteRes = await apiCall('POST', `/appointments/${rescheduleId}/complete`, tokens.RECEPTIONIST);
    assert(receptionCompleteRes.status === 403, 'RECEPTIONIST forbidden from completing clinical appointment (HTTP 403)');

    // SUPER_ADMIN and ADMIN have full scheduling and queue management rights
    const adminScheduleRes = await apiCall('POST', '/appointments', tokens.ADMIN, {
      patientId: patientC.id,
      practitionerId: doctorUser.id,
      appointmentDate: tomorrowStr,
      timeSlot: '05:00 PM',
      type: 'Executive Health Check'
    });
    assert(adminScheduleRes.status === 201, 'ADMIN permitted to schedule appointment (HTTP 201)');

    const superAdminScheduleRes = await apiCall('POST', '/appointments', tokens.SUPER_ADMIN, {
      patientId: patientC.id,
      practitionerId: vaidyaUser.id,
      appointmentDate: tomorrowStr,
      timeSlot: '05:00 PM',
      type: 'Ayurvedic Wellness'
    });
    assert(superAdminScheduleRes.status === 201, 'SUPER_ADMIN permitted to schedule appointment (HTTP 201)');

    // ─────────────────────────────────────────────────────────────
    // TEST 10: AUDIT LOG ATTRIBUTION & DASHBOARD METRICS
    // ─────────────────────────────────────────────────────────────
    console.log(`\n${YELLOW}10. Audit Log Attribution & Dashboard Metrics${RESET}`);

    // Verify audit logs persisted
    const auditLogs = await prisma.auditLog.findMany({
      where: {
        category: { in: ['Reception Operations', 'Appointment Scheduled'] }
      }
    });
    assert(auditLogs.length > 0, `Audit logs created for appointment operations (count: ${auditLogs.length})`);

    const hasCheckInAudit = auditLogs.some((l) => l.action.toLowerCase().includes('check') || l.action === 'PATIENT_CHECKED_IN');
    const hasWalkInAudit = auditLogs.some((l) => l.action.toLowerCase().includes('walk') || l.action === 'WALK_IN_REGISTERED');
    const hasRescheduleAudit = auditLogs.some((l) => l.action.toLowerCase().includes('reschedule') || l.action === 'APPOINTMENT_RESCHEDULED');
    const hasCancelAudit = auditLogs.some((l) => l.action.toLowerCase().includes('cancel') || l.action === 'APPOINTMENT_CANCELLED');

    assert(hasCheckInAudit, 'Audit log records check-in event');
    assert(hasWalkInAudit, 'Audit log records walk-in registration event');
    assert(hasRescheduleAudit, 'Audit log records appointment reschedule event');
    assert(hasCancelAudit, 'Audit log records appointment cancellation event');

    // Reception Dashboard Metrics verification
    const dashboardRes = await apiCall('GET', `/reception/dashboard?date=${todayStr}`, tokens.RECEPTIONIST);
    assert(dashboardRes.status === 200, 'Query /api/reception/dashboard returns HTTP 200');
    const metrics = dashboardRes.body.data;
    assert(typeof metrics.totalScheduled === 'number', 'totalScheduled metric is a number');
    assert(typeof metrics.checkedIn === 'number', 'checkedIn metric is a number');
    assert(typeof metrics.waiting === 'number', 'waiting metric is a number');
    assert(typeof metrics.inConsultation === 'number', 'inConsultation metric is a number');
    assert(typeof metrics.completed === 'number', 'completed metric is a number');
    assert(typeof metrics.walkIns === 'number', 'walkIns metric is a number');
    assert(typeof metrics.doctorQueueCount === 'number', 'doctorQueueCount metric is a number');
    assert(typeof metrics.vaidyaQueueCount === 'number', 'vaidyaQueueCount metric is a number');

    // ─────────────────────────────────────────────────────────────
    // TEST 11: UNAPPROVED DURATION REMOVAL & INTERVAL COLLISION DETECTION
    // ─────────────────────────────────────────────────────────────
    console.log(`\n${YELLOW}11. Unapproved Duration Removal & Interval Collision Detection${RESET}`);

    // Booking appointment without duration parameter
    const noDurationRes = await apiCall('POST', '/appointments', tokens.RECEPTIONIST, {
      patientId: patientA.id,
      practitionerId: doctorUser.id,
      appointmentDate: tomorrowStr,
      timeSlot: '07:00 AM',
      type: 'Routine Review'
    });
    assert(noDurationRes.status === 201, 'Booking appointment without duration succeeds (HTTP 201)');
    assert(noDurationRes.body.data.durationMinutes === null || noDurationRes.body.data.durationMinutes === undefined, 'durationMinutes is null/undefined in response (no hardcoded 30-min substitution)');

    // Direct database check to verify Prisma column value
    const dbNoDurationApt = await prisma.appointment.findUnique({ where: { id: noDurationRes.body.data.id } });
    assert(dbNoDurationApt?.durationMinutes === null, `Database persisted durationMinutes is strictly NULL: ${dbNoDurationApt?.durationMinutes} === null`);

    // Booking appointment with explicit duration (45 mins)
    const configuredDurationRes = await apiCall('POST', '/appointments', tokens.RECEPTIONIST, {
      patientId: patientB.id,
      practitionerId: doctorUser.id,
      appointmentDate: tomorrowStr,
      timeSlot: '08:00 AM',
      durationMinutes: 45,
      type: 'Specialist Intake'
    });
    assert(configuredDurationRes.status === 201, 'Booking appointment with explicit 45-min duration succeeds (HTTP 201)');
    assert(configuredDurationRes.body.data.durationMinutes === 45, 'durationMinutes persisted as 45');
    assert(configuredDurationRes.body.data.scheduledStartTime === '08:00 AM', 'scheduledStartTime persisted as 08:00 AM');
    assert(configuredDurationRes.body.data.scheduledEndTime === '08:45 AM', 'scheduledEndTime computed as 08:45 AM');

    // Interval collision detection: Attempt to book overlapping interval [08:15 AM, 08:45 AM)
    const overlapRes = await apiCall('POST', '/appointments', tokens.RECEPTIONIST, {
      patientId: patientC.id,
      practitionerId: doctorUser.id,
      appointmentDate: tomorrowStr,
      timeSlot: '08:15 AM',
      durationMinutes: 30,
      type: 'Follow-up'
    });
    assert(overlapRes.status === 409, 'Overlapping interval [08:15 AM, 08:45 AM) rejected with HTTP 409 Conflict');
    assert(overlapRes.body.code === 'APPOINTMENT_CONFLICT', 'Returns error code APPOINTMENT_CONFLICT');

    // Non-overlapping interval: Book [08:45 AM, 09:15 AM)
    const nonOverlapRes = await apiCall('POST', '/appointments', tokens.RECEPTIONIST, {
      patientId: patientC.id,
      practitionerId: doctorUser.id,
      appointmentDate: tomorrowStr,
      timeSlot: '08:45 AM',
      durationMinutes: 30,
      type: 'Follow-up'
    });
    assert(nonOverlapRes.status === 201, 'Contiguous non-overlapping interval [08:45 AM, 09:15 AM) succeeds (HTTP 201)');
    assert(nonOverlapRes.body.data.durationMinutes === 30, 'durationMinutes persisted as 30');

    // ─────────────────────────────────────────────────────────────
    // TEST 12: PRODUCTION DATABASE ZERO-MODIFICATION VERIFICATION
    // ─────────────────────────────────────────────────────────────
    console.log(`\n${YELLOW}12. Production Database Zero-Modification Verification${RESET}`);

    const prodAfter = await getProductionSnapshot();
    if (prodProbePrisma) {
      await prodProbePrisma.$disconnect().catch(() => {});
    }

    if (prodBefore && prodAfter) {
      console.log(`${CYAN}✓ Production Database Post-Test State Snapshot:${RESET}`, prodAfter);
      assert(prodAfter.users === prodBefore.users, `Production users unchanged: ${prodAfter.users} === ${prodBefore.users}`);
      assert(prodAfter.patients === prodBefore.patients, `Production patients unchanged: ${prodAfter.patients} === ${prodBefore.patients}`);
      assert(prodAfter.appointments === 0, `Production appointments strictly 0: ${prodAfter.appointments} === 0`);
      assert(prodAfter.prescriptions === prodBefore.prescriptions, `Production prescriptions unchanged: ${prodAfter.prescriptions} === ${prodBefore.prescriptions}`);
      assert(prodAfter.invoices === prodBefore.invoices, `Production invoices unchanged: ${prodAfter.invoices} === ${prodBefore.invoices}`);
      assert(prodAfter.tariffs === prodBefore.tariffs, `Production tariffs unchanged: ${prodAfter.tariffs} === ${prodBefore.tariffs}`);
    } else {
      console.log('  ℹ [SKIPPED] Production database zero-mutation audit skipped: isolated CI/test environment (zero production database access).');
    }

  } catch (err: any) {
    console.error(`\n${RED}FATAL ERROR IN VERIFICATION SUITE:${RESET}`, err);
    failed++;
  } finally {
    server.close();
    if (prodProbePrisma) {
      await prodProbePrisma.$disconnect().catch(() => {});
    }
  }

  console.log(`\n${CYAN}═══════════════════════════════════════════════════════════════════════════════${RESET}`);
  console.log(`TOTAL PASS: ${GREEN}${passed}${RESET} | TOTAL FAIL: ${failed > 0 ? RED : GREEN}${failed}${RESET}`);
  console.log(`${CYAN}═══════════════════════════════════════════════════════════════════════════════${RESET}\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runVerification();
