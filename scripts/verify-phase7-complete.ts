/**
 * SAHACHARA OPS — PHASE 7: COMPLETE AUTOMATED VERIFICATION SUITE
 *
 * Exhaustive Post-Implementation Remediation & Acceptance Verification:
 * 1. Target Database Isolation & Production Baseline Freeze Guard (19 migrations).
 * 2. Approved Therapy Room Classifications & Sanitization State Machine.
 * 3. Staff Therapy Authorizations, Competency Verification & Discipline Boundaries.
 * 4. Panchakarma Clinical Referral Conversion to Active Courses.
 * 5. Deterministic Race-Safe Scheduling Concurrency with True Parallel (Promise.all) Conflict Testing.
 * 6. Therapy Session Execution State Machine & Vaidya Clinical Authority.
 * 7. Panchakarma 3-Stage Progression & Transition Audit Ledger.
 * 8. Phase 5 Billing Integration & Reversal Workflows (PER_SESSION and PACKAGE_BILLED).
 * 9. RBAC Matrix Across All 7 Canonical Roles (Administrative Overrides Strictly Blocked).
 * 10. Production Database Zero-Mutation Verification.
 */

import http from 'http';
import express from 'express';
import { PrismaClient } from '@prisma/client';

// ---------------------------------------------------------------------------
// 1. DATABASE ISOLATION GUARD
// ---------------------------------------------------------------------------
const PROD_DB_URL = process.env.PROD_DATABASE_URL;
const TEST_DB_URL = process.env.TEST_DATABASE_URL || 'postgresql://highflyer@localhost:5432/sahachara_ops_test_db';

if (process.env.DATABASE_URL?.includes('sahachara_ops_db') && !process.env.TEST_DATABASE_URL) {
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
  prisma,
  dbRequestRefund,
  dbApproveRefund
} from '../server/prismaService.ts';

const isCI = process.env.CI === 'true';
const prodProbePrisma = !isCI && PROD_DB_URL && !PROD_DB_URL.includes('test_db')
  ? new PrismaClient({
    datasources: {
      db: { url: PROD_DB_URL }
    }
  })
  : null;

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
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

// Helper to make authenticated HTTP requests to the test Express server
function createRequestSender(baseUrl: string) {
  return async function request(
    method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
    path: string,
    options?: {
      role?: UserRole;
      userId?: string;
      body?: any;
      headers?: Record<string, string>;
    }
  ): Promise<{ status: number; body: any }> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options?.headers || {})
    };

    if (options?.role) {
      const user = await prisma.user.findFirst({
        where: { role: options.role, status: 'active', isSuspended: false }
      });
      const userId = user?.id || options.userId || `user-${options.role.toLowerCase()}`;
      const email = user?.email || `test_${options.role.toLowerCase()}@sahachara.com`;
      const token = generateSessionToken({
        userId,
        email,
        role: options.role,
        name: user?.name || `Test ${options.role}`
      });
      headers['Authorization'] = `Bearer ${token}`;
    }

    return new Promise((resolve, reject) => {
      const url = new URL(path, baseUrl);
      const req = http.request(
        url,
        {
          method,
          headers
        },
        (res) => {
          let data = '';
          res.on('data', (chunk) => (data += chunk));
          res.on('end', () => {
            let parsed: any;
            try {
              parsed = JSON.parse(data);
            } catch {
              parsed = data;
            }
            resolve({ status: res.statusCode || 500, body: parsed });
          });
        }
      );

      req.on('error', (err) => reject(err));
      if (options?.body) {
        req.write(JSON.stringify(options.body));
      }
      req.end();
    });
  };
}

async function runPhase7VerificationSuite() {
  console.log(`\n${BOLD}${CYAN}========================================================================${RESET}`);
  console.log(`${BOLD}   SAHACHARA OPS — PHASE 7 COMPLETE IMPLEMENTATION VERIFICATION SUITE   ${RESET}`);
  console.log(`${BOLD}   Ayurvedic Treatment, Panchakarma, Therapy Sessions & Room Operations ${RESET}`);
  console.log(`${BOLD}${CYAN}========================================================================${RESET}\n`);

  const app = express();
  app.use(express.json());
  app.use('/api', apiRouter);

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address() as any;
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const request = createRequestSender(baseUrl);

  try {
    // -------------------------------------------------------------------------
    // SECTION 1: PRODUCTION DB FREEZE & TEST DB SCHEMA ISOLATION
    // -------------------------------------------------------------------------
    console.log(`${BOLD}SECTION 1: Production DB Freeze & Test DB Schema Isolation${RESET}`);

    let prodUsersCount = 0;
    let prodPatientsCount = 0;
    let prodInvoicesCount = 0;

    if (prodProbePrisma) {
      // Snapshot production database
      const prodMigrations = await prodProbePrisma.$queryRaw<any[]>`
        SELECT migration_name, finished_at FROM _prisma_migrations ORDER BY finished_at ASC;
      `;
      const prodTherapyRoomsCount = await prodProbePrisma.$queryRaw<any[]>`
        SELECT count(*) as count FROM information_schema.tables WHERE table_name = 'therapy_rooms';
      `;
      prodUsersCount = await prodProbePrisma.user.count();
      prodPatientsCount = await prodProbePrisma.patient.count();
      prodInvoicesCount = await prodProbePrisma.invoice.count();

      assert(
        prodMigrations.length === 19,
        `Production database sahachara_ops_db has exactly 19 migrations applied (Found: ${prodMigrations.length})`
      );
      assert(
        Number(prodTherapyRoomsCount[0]?.count || 0) === 0,
        'Production database does NOT contain therapy_rooms table (Phase 7 migrations unapplied to prod)'
      );
    } else {
      console.log('  ℹ [SKIPPED] Production database freeze probe skipped: isolated CI/test environment (zero production database access).');
    }

    // Verify test database contains Phase 7 migration
    const testMigrations = await prisma.$queryRaw<any[]>`
      SELECT migration_name FROM _prisma_migrations ORDER BY finished_at ASC;
    `;
    const hasPhase7Migration = testMigrations.some((m) =>
      m.migration_name.includes('phase7_therapy_operations')
    );
    assert(
      hasPhase7Migration,
      'Test database sahachara_ops_test_db has 20261114030000_phase7_therapy_operations migration applied'
    );

    // Clean up prior test runs in isolated test database
    await prisma.therapySession.deleteMany({});
    await prisma.panchakarmaPhaseTransition.deleteMany({});
    await prisma.panchakarmaCourse.deleteMany({});
    await prisma.staffTherapyAuthorization.deleteMany({});

    // -------------------------------------------------------------------------
    // SECTION 2: APPROVED THERAPY ROOM CLASSIFICATIONS & SANITIZATION STATE MACHINE
    // -------------------------------------------------------------------------
    console.log(`\n${BOLD}SECTION 2: Approved Therapy Room Classifications & Sanitization State Machine${RESET}`);

    // Fetch Ayurveda department in test DB
    let ayurDept = await prisma.department.findFirst({
      where: { code: 'AYUR' }
    });
    if (!ayurDept) {
      ayurDept = await prisma.department.create({
        data: {
          code: 'AYUR',
          name: 'Department of Ayurveda & Chikitsa',
          discipline: 'AYURVEDA',
          description: 'Block A, Ground Floor',
          isActive: true
        }
      });
    }

    // Unapproved Room Type (CONSULTATION_CHAMBER) must be rejected
    const unapprovedRoomRes = await request('POST', '/api/therapy-rooms', {
      role: 'SUPER_ADMIN',
      body: {
        code: `CONS-${Date.now().toString().slice(-4)}`,
        name: 'General Consultation Room',
        roomType: 'CONSULTATION_CHAMBER',
        departmentId: ayurDept.id
      }
    });
    assert(
      unapprovedRoomRes.status >= 400,
      'Ordinary CONSULTATION_CHAMBER rejected as therapy room (Approved types strictly enforced)'
    );

    // Create a new approved Therapy Room via REST API (SUPER_ADMIN)
    const roomCode = `DRONI-TEST-${Date.now().toString().slice(-4)}`;
    const createRoomRes = await request('POST', '/api/therapy-rooms', {
      role: 'SUPER_ADMIN',
      body: {
        code: roomCode,
        name: 'Classical Droni Swedana Suite Beta',
        roomType: 'MASSAGE_DRONI_ROOM',
        departmentId: ayurDept.id,
        bufferMinutes: 15,
        isActive: true
      }
    });

    assert(createRoomRes.status === 201, `POST /api/therapy-rooms returns HTTP 201 Created (Got: ${createRoomRes.status})`);
    const createdRoom = createRoomRes.body.data;
    assert(createdRoom && createdRoom.status === 'AVAILABLE', 'Created room starts in AVAILABLE operational status');
    assert(createdRoom.roomType === 'MASSAGE_DRONI_ROOM', 'Room type is approved MASSAGE_DRONI_ROOM');
    assert(createdRoom.bufferMinutes === 15, 'Room stores configured 15 minute turnaround buffer');

    // Create second approved room (SHIRODHARA_ROOM) for multi-room concurrency testing
    const secondRoomCode = `SHIRO-TEST-${Date.now().toString().slice(-4)}`;
    const secondRoomRes = await request('POST', '/api/therapy-rooms', {
      role: 'SUPER_ADMIN',
      body: {
        code: secondRoomCode,
        name: 'Shirodhara Flow Chamber',
        roomType: 'SHIRODHARA_ROOM',
        departmentId: ayurDept.id,
        bufferMinutes: 15,
        isActive: true
      }
    });
    assert(secondRoomRes.status === 201, 'POST /api/therapy-rooms creates second approved room (SHIRODHARA_ROOM)');
    const secondRoom = secondRoomRes.body.data;

    // Enter Maintenance
    const enterMaintRes = await request('POST', `/api/therapy-rooms/${createdRoom.id}/maintenance/enter`, {
      role: 'ADMIN',
      body: { reason: 'Periodic calibration of Nadi Swedana steam generator' }
    });
    assert(enterMaintRes.status === 200, 'POST /api/therapy-rooms/:id/maintenance/enter returns HTTP 200');
    assert(enterMaintRes.body.data.status === 'MAINTENANCE', 'Room status transitions to MAINTENANCE');

    // Exit Maintenance
    const exitMaintRes = await request('POST', `/api/therapy-rooms/${createdRoom.id}/maintenance/exit`, {
      role: 'ADMIN',
      body: {}
    });
    assert(exitMaintRes.status === 200, 'POST /api/therapy-rooms/:id/maintenance/exit returns HTTP 200');
    assert(exitMaintRes.body.data.status === 'SANITIZING', 'Room status transitions to SANITIZING for aseptic prep upon maintenance exit');

    // Record Sanitization
    const sanitizeRes = await request('POST', `/api/therapy-rooms/${createdRoom.id}/sanitize`, {
      role: 'ADMIN',
      body: { notes: 'Aseptic cleansing and camphor herbal fumigation completed' }
    });
    assert(sanitizeRes.status === 200, 'POST /api/therapy-rooms/:id/sanitize returns HTTP 200');
    assert(sanitizeRes.body.data.status === 'AVAILABLE', 'Sanitized room is AVAILABLE for booking');
    assert(sanitizeRes.body.data.lastSanitizedAt !== null, 'Room lastSanitizedAt timestamp is stamped');

    // Reconcile Stale Room
    const reconcileRes = await request('POST', `/api/therapy-rooms/${createdRoom.id}/reconcile-stale`, {
      role: 'ADMIN',
      body: {}
    });
    assert(reconcileRes.status === 200, 'POST /api/therapy-rooms/:id/reconcile-stale returns HTTP 200');

    // -------------------------------------------------------------------------
    // SECTION 3: STAFF THERAPY AUTHORIZATIONS & DISCIPLINE BOUNDARIES
    // -------------------------------------------------------------------------
    console.log(`\n${BOLD}SECTION 3: Staff Therapy Authorizations & Discipline Boundaries${RESET}`);

    // Get eligible administering staff
    const eligibleStaffRes = await request('GET', '/api/therapy-staff/eligible', {
      role: 'VAIDYA'
    });
    assert(eligibleStaffRes.status === 200, 'GET /api/therapy-staff/eligible returns HTTP 200');
    assert(Array.isArray(eligibleStaffRes.body.data), 'Eligible therapy staff is an array');

    // Get responsible Vaidyas
    const vaidyasRes = await request('GET', '/api/therapy-staff/vaidyas', {
      role: 'VAIDYA'
    });
    assert(vaidyasRes.status === 200, 'GET /api/therapy-staff/vaidyas returns HTTP 200');
    assert(Array.isArray(vaidyasRes.body.data) && vaidyasRes.body.data.length > 0, 'Returns active responsible Vaidyas');

    const testVaidya = vaidyasRes.body.data[0];
    assert(testVaidya.role === 'VAIDYA', `Responsible Vaidya has canonical role VAIDYA (${testVaidya.name})`);

    // Ensure we have two distinct staff members in Ayurveda department
    let ayurStaff = eligibleStaffRes.body.data[0];
    if (!ayurStaff) {
      ayurStaff = await prisma.staffMember.create({
        data: {
          employeeId: `STF-TEST-${Date.now().toString().slice(-4)}`,
          name: 'Senior Therapist Anand Kumar',
          role: 'ADMIN',
          designation: 'Panchakarma Senior Therapist',
          department: 'Ayurveda',
          email: `anand.therapist.${Date.now()}@sahachara.org`,
          phone: '+91 98470 12345',
          status: 'active',
          discipline: 'AYURVEDA'
        }
      });
      await prisma.staffDepartmentAssignment.create({
        data: {
          staffId: ayurStaff.id,
          departmentId: ayurDept.id,
          status: 'active',
          isPrimary: true
        }
      });
    }

    const unverifiedStaff = await prisma.staffMember.create({
      data: {
        employeeId: `STF-UNV-${Date.now().toString().slice(-4)}`,
        name: 'Junior Trainee Vijay Nair',
        role: 'ADMIN',
        designation: 'Therapy Assistant',
        department: 'Ayurveda',
        email: `vijay.trainee.${Date.now()}@sahachara.org`,
        phone: '+91 98470 54321',
        status: 'active',
        discipline: 'AYURVEDA'
      }
    });
    await prisma.staffDepartmentAssignment.create({
      data: {
        staffId: unverifiedStaff.id,
        departmentId: ayurDept.id,
        status: 'active',
        isPrimary: true
      }
    });

    // Non-admin (DOCTOR or VAIDYA or RECEPTIONIST) attempting to grant therapy authorization must be rejected (HTTP 403)
    const unauthorizedGrantRes = await request('POST', '/api/staff-therapy-authorizations', {
      role: 'DOCTOR',
      body: {
        staffId: unverifiedStaff.id,
        therapyType: 'Abhyanga'
      }
    });
    assert(
      unauthorizedGrantRes.status === 403,
      'DOCTOR role blocked from managing staff therapy authorizations (HTTP 403 Forbidden)'
    );

    // ADMIN grants therapy authorization for ayurStaff
    const authRes = await request('POST', '/api/staff-therapy-authorizations', {
      role: 'ADMIN',
      body: {
        staffId: ayurStaff.id,
        approvedQualification: 'Certified Ayurvedic Therapy Practitioner (Panchakarma Board)',
        authorizedTherapyTypes: ['Abhyanga', 'Swedana', 'Shirodhara', 'Kizhi'],
        notes: 'Certified in classical Kerala Abhyanga & Marma protocol'
      }
    });
    assert(authRes.status === 201, 'ADMIN successfully grants staff therapy authorization (HTTP 201 Created)');
    const authRecord = authRes.body.data;
    assert(authRecord && !authRecord.isRevoked, 'Authorization record is active (isRevoked is false)');
    assert(authRecord.verifiedById !== null, 'Verification actor ID captured');
    assert(authRecord.approvedQualification.includes('Panchakarma Board'), 'Qualification evidence explicitly recorded');

    // Revoke authorization test
    const tempAuth = await prisma.staffTherapyAuthorization.create({
      data: {
        staffId: unverifiedStaff.id,
        approvedQualification: 'Probationary Certification',
        verifiedById: 'usr-admin',
        verifiedByName: 'Admin',
        isRevoked: false
      }
    });
    const revokeRes = await request('POST', `/api/staff-therapy-authorizations/${tempAuth.id}/revoke`, {
      role: 'ADMIN',
      body: { reason: 'Probation expired' }
    });
    assert(revokeRes.status === 200, 'ADMIN successfully revokes therapy authorization (HTTP 200)');
    assert(revokeRes.body.data.revokedAt !== null, 'Authorization successfully stamped with revocation timestamp');

    // -------------------------------------------------------------------------
    // SECTION 4: PANCHAKARMA CLINICAL REFERRALS & COURSE CONVERSION
    // -------------------------------------------------------------------------
    console.log(`\n${BOLD}SECTION 4: Panchakarma Clinical Referrals & Course Conversion${RESET}`);

    // Ensure test patient exists
    let testPatient = await prisma.patient.findFirst({
      where: { admissionStatus: { in: ['outpatient', 'active_treatment', 'consultation'] } }
    });
    if (!testPatient) {
      testPatient = await prisma.patient.create({
        data: {
          mrn: `MRN-PKR-${Date.now().toString().slice(-5)}`,
          firstName: 'Ananya',
          lastName: 'Varma',
          dob: '1988-06-14',
          gender: 'female',
          phone: '+91 98471 99887',
          admissionStatus: 'outpatient'
        }
      });
    }

    // Second test patient for concurrent scheduling tests
    let secondPatient = await prisma.patient.findFirst({
      where: { mrn: { not: testPatient.mrn } }
    });
    if (!secondPatient) {
      secondPatient = await prisma.patient.create({
        data: {
          mrn: `MRN-CONC-${Date.now().toString().slice(-5)}`,
          firstName: 'Karthik',
          lastName: 'Menon',
          dob: '1982-11-20',
          gender: 'male',
          phone: '+91 98471 11223',
          admissionStatus: 'outpatient'
        }
      });
    }

    // Ensure tariffs exist
    let testTariff = await prisma.hospitalTariff.findFirst({
      where: { category: { contains: 'Panchakarma' }, rate: { not: null }, isActive: true }
    });
    if (!testTariff) {
      testTariff = await prisma.hospitalTariff.create({
        data: {
          serviceCode: `PKR-PKG-${Date.now().toString().slice(-4)}`,
          serviceName: 'Comprehensive Virechana Panchakarma Course (14 Days)',
          category: 'Panchakarma',
          rate: 25000.0,
          isActive: true
        }
      });
    }

    let sessionTariff = await prisma.hospitalTariff.findFirst({
      where: { serviceName: { contains: 'Abhyanga' }, rate: { not: null }, isActive: true }
    });
    if (!sessionTariff) {
      sessionTariff = await prisma.hospitalTariff.create({
        data: {
          serviceCode: `ABH-SES-${Date.now().toString().slice(-4)}`,
          serviceName: 'Classical Abhyanga Full Body Massage',
          category: 'Treatment',
          rate: 1800.0,
          isActive: true
        }
      });
    }

    const testVaidyaUser = await prisma.user.findFirst({
      where: { role: 'VAIDYA', status: 'active', isSuspended: false }
    });

    const testEncounter = await prisma.clinicalEncounter.create({
      data: {
        encounterNumber: `ENC-TEST-${Date.now().toString().slice(-4)}`,
        patientId: testPatient.id,
        practitionerId: testVaidyaUser?.id || 'usr-vaidya',
        practitionerName: testVaidya.name,
        discipline: 'AYURVEDA',
        practitionerRole: 'VAIDYA',
        encounterType: 'outpatient',
        status: 'in_progress'
      }
    });

    const testReferral = await prisma.panchakarmaReferral.create({
      data: {
        referralNumber: `PKR-TEST-${Date.now().toString().slice(-4)}`,
        patientId: testPatient.id,
        encounterId: testEncounter.id,
        practitionerId: testVaidyaUser?.id || 'usr-vaidya',
        practitionerName: testVaidya.name,
        proposedProcedure: 'Virechana Karma 14-Day Protocol',
        clinicalIndication: 'Chronic amlapitta and skin inflammation (Pitta-Kapha Samana)',
        preliminaryNotes: 'Recommended for seasonal Panchakarma detoxification',
        urgency: 'routine',
        status: 'referred'
      }
    });

    // Convert referral to active course via REST API
    const convertRes = await request('POST', `/api/panchakarma-referrals/${testReferral.id}/convert`, {
      role: 'VAIDYA',
      body: {
        attendingVaidyaId: testVaidya.id,
        startDate: new Date().toISOString().split('T')[0],
        primaryProcedure: 'Virechana (Therapeutic Purgation - Pitta Cleansing)',
        totalPlannedDays: 14,
        billingMode: 'PACKAGE',
        packageTariffId: testTariff.id,
        dietaryInstructions: 'Classical Samsarjana Krama: Manda -> Peya -> Vilepi -> Yusha'
      }
    });

    assert(convertRes.status === 201, `POST /api/panchakarma-referrals/:id/convert returns HTTP 201 Created`);
    const createdCourse = convertRes.body.data;
    assert(createdCourse && createdCourse.status === 'Active', 'Converted course status is Active');
    assert(createdCourse.currentPhase === 'PURVAKARMA' || createdCourse.currentPhase.includes('Purvakarma'), 'Course starts in Purvakarma phase');
    assert(createdCourse.billingMode === 'PACKAGE_BILLED' || createdCourse.billingMode === 'PACKAGE', 'Course billing mode is PACKAGE_BILLED');

    // -------------------------------------------------------------------------
    // SECTION 5: RACE-SAFE THERAPY SESSION SCHEDULING CONCURRENCY
    // -------------------------------------------------------------------------
    console.log(`\n${BOLD}SECTION 5: Race-Safe Therapy Session Scheduling Concurrency${RESET}`);

    // Verify unverified staff scheduling is rejected (Department alone does not grant qualification)
    const unverifiedSchedRes = await request('POST', '/api/therapy-sessions', {
      role: 'VAIDYA',
      body: {
        patientId: testPatient.id,
        roomId: createdRoom.id,
        administeringStaffId: unverifiedStaff.id, // Lacks StaffTherapyAuthorization
        responsibleVaidyaId: testVaidya.id,
        therapyType: 'Abhyanga',
        scheduledStartTime: new Date(Date.now() + 86400000).toISOString(),
        scheduledEndTime: new Date(Date.now() + 90000000).toISOString()
      }
    });
    assert(
      unverifiedSchedRes.status >= 400,
      'Unverified staff scheduling rejected (AdministeringStaffUnqualified: Department assignment alone does not qualify)'
    );

    // Schedule base session: Tomorrow 10:00 - 11:00 (Buffer = 15 mins, Total Block = 10:00 - 11:15)
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(10, 0, 0, 0);
    const start1 = tomorrow.toISOString();

    const end1Date = new Date(tomorrow);
    end1Date.setHours(11, 0, 0, 0);
    const end1 = end1Date.toISOString();

    const sched1Res = await request('POST', '/api/therapy-sessions', {
      role: 'VAIDYA',
      body: {
        patientId: testPatient.id,
        roomId: createdRoom.id,
        administeringStaffId: ayurStaff.id,
        responsibleVaidyaId: testVaidya.id,
        panchakarmaCourseId: createdCourse.id,
        sessionNumber: 1,
        therapyType: 'Abhyanga & Swedana (Day 1 Purvakarma)',
        scheduledStartTime: start1,
        scheduledEndTime: end1,
        turnaroundBufferMinutes: 15,
        billingMode: 'PACKAGE_COVERED'
      }
    });

    assert(sched1Res.status === 201, `POST /api/therapy-sessions schedules initial session successfully (HTTP 201)`);
    const session1 = sched1Res.body.data;
    assert(session1 && session1.status === 'SCHEDULED', 'Scheduled session has status SCHEDULED');
    assert(session1.roomCodeSnapshot === createdRoom.code, 'Historical roomCodeSnapshot correctly stamped');
    assert(session1.billingMode === 'PACKAGE_COVERED', 'Package session has billingMode PACKAGE_COVERED');
    assert(session1.billableAmount === null, 'Package covered session billableAmount is strictly NULL (never 0.00)');

    // TRUE CONCURRENT INTEGRATION TEST 1: Simultaneous Promise.all() on Same Room
    const slotSameRoomStart = new Date(tomorrow);
    slotSameRoomStart.setHours(14, 0, 0, 0);
    const slotSameRoomEnd = new Date(tomorrow);
    slotSameRoomEnd.setHours(15, 0, 0, 0);

    const [parallelRes1, parallelRes2] = await Promise.all([
      request('POST', '/api/therapy-sessions', {
        role: 'VAIDYA',
        body: {
          patientId: testPatient.id,
          roomId: createdRoom.id, // SAME ROOM
          administeringStaffId: ayurStaff.id,
          responsibleVaidyaId: testVaidya.id,
          therapyType: 'Abhyanga',
          scheduledStartTime: slotSameRoomStart.toISOString(),
          scheduledEndTime: slotSameRoomEnd.toISOString(),
          turnaroundBufferMinutes: 15
        }
      }),
      request('POST', '/api/therapy-sessions', {
        role: 'VAIDYA',
        body: {
          patientId: secondPatient.id,
          roomId: createdRoom.id, // SAME ROOM
          administeringStaffId: ayurStaff.id,
          responsibleVaidyaId: testVaidya.id,
          therapyType: 'Shirodhara',
          scheduledStartTime: slotSameRoomStart.toISOString(),
          scheduledEndTime: slotSameRoomEnd.toISOString(),
          turnaroundBufferMinutes: 15
        }
      })
    ]);

    const statuses1 = [parallelRes1.status, parallelRes2.status];
    assert(
      statuses1.includes(201) && statuses1.includes(409),
      'True parallel same-room scheduling: Exactly one succeeds (201) and one conflicts (409 ROOM_UNAVAILABLE)'
    );

    // TRUE CONCURRENT INTEGRATION TEST 2: Simultaneous Promise.all() on Same Patient in Different Rooms
    const slotSamePatientStart = new Date(tomorrow);
    slotSamePatientStart.setHours(16, 0, 0, 0);
    const slotSamePatientEnd = new Date(tomorrow);
    slotSamePatientEnd.setHours(17, 0, 0, 0);

    const [parallelPat1, parallelPat2] = await Promise.all([
      request('POST', '/api/therapy-sessions', {
        role: 'VAIDYA',
        body: {
          patientId: testPatient.id, // SAME PATIENT
          roomId: createdRoom.id,
          administeringStaffId: ayurStaff.id,
          responsibleVaidyaId: testVaidya.id,
          therapyType: 'Abhyanga',
          scheduledStartTime: slotSamePatientStart.toISOString(),
          scheduledEndTime: slotSamePatientEnd.toISOString(),
          turnaroundBufferMinutes: 15
        }
      }),
      request('POST', '/api/therapy-sessions', {
        role: 'VAIDYA',
        body: {
          patientId: testPatient.id, // SAME PATIENT
          roomId: secondRoom.id,     // DIFFERENT ROOM
          administeringStaffId: ayurStaff.id,
          responsibleVaidyaId: testVaidya.id,
          therapyType: 'Kizhi',
          scheduledStartTime: slotSamePatientStart.toISOString(),
          scheduledEndTime: slotSamePatientEnd.toISOString(),
          turnaroundBufferMinutes: 15
        }
      })
    ]);

    const statuses2 = [parallelPat1.status, parallelPat2.status];
    assert(
      statuses2.includes(201) && statuses2.includes(409),
      'True parallel same-patient scheduling: Exactly one succeeds (201) and one conflicts (409 PATIENT_DOUBLE_BOOKED)'
    );

    // TURNAROUND BUFFER CONFLICT: Inside 11:00-11:15 buffer (11:05 - 12:00 in same room)
    const startBuffer = new Date(tomorrow);
    startBuffer.setHours(11, 5, 0, 0);
    const endBuffer = new Date(tomorrow);
    endBuffer.setHours(12, 0, 0, 0);

    const conflictBufferRes = await request('POST', '/api/therapy-sessions', {
      role: 'VAIDYA',
      body: {
        patientId: testPatient.id,
        roomId: createdRoom.id, // SAME ROOM
        administeringStaffId: ayurStaff.id,
        responsibleVaidyaId: testVaidya.id,
        therapyType: 'Kizhi',
        scheduledStartTime: startBuffer.toISOString(),
        scheduledEndTime: endBuffer.toISOString(),
        turnaroundBufferMinutes: 15
      }
    });
    assert(
      conflictBufferRes.status === 409,
      'Booking inside 15-minute turnaround buffer rejected with HTTP 409'
    );

    // NON-CONFLICTING: Booking exactly at buffer boundary (11:15 - 12:15) succeeds
    const startValid = new Date(tomorrow);
    startValid.setHours(11, 15, 0, 0);
    const endValid = new Date(tomorrow);
    endValid.setHours(12, 15, 0, 0);

    const validSchedRes = await request('POST', '/api/therapy-sessions', {
      role: 'VAIDYA',
      body: {
        patientId: testPatient.id,
        roomId: createdRoom.id,
        administeringStaffId: ayurStaff.id,
        responsibleVaidyaId: testVaidya.id,
        therapyType: 'Abhyanga Post-Turnaround',
        scheduledStartTime: startValid.toISOString(),
        scheduledEndTime: endValid.toISOString(),
        turnaroundBufferMinutes: 15,
        billingMode: 'PER_SESSION',
        tariffId: sessionTariff.id
      }
    });
    assert(
      validSchedRes.status === 201,
      'Booking at exact turnaround boundary (11:15) succeeds with HTTP 201'
    );

    // -------------------------------------------------------------------------
    // SECTION 6: SESSION EXECUTION STATE MACHINE & VAIDYA CLINICAL CLEARANCE
    // -------------------------------------------------------------------------
    console.log(`\n${BOLD}SECTION 6: Session Execution State Machine & Vaidya Clinical Clearance${RESET}`);

    // Attempt start without Vaidya clearance -> Rejected (HTTP 400)
    const startNoClearanceRes = await request('POST', `/api/therapy-sessions/${session1.id}/start`, {
      role: 'VAIDYA',
      body: {
        preAssessment: {
          bpSystolic: 120,
          bpDiastolic: 80,
          heartRate: 72,
          vaidyaClearanceConfirmed: false // UNCONFIRMED
        }
      }
    });
    assert(
      startNoClearanceRes.status === 400,
      'Start session without explicit Vaidya clinical clearance fails closed (HTTP 400)'
    );

    // DOCTOR role attempting to start Ayurvedic therapy session -> Blocked (HTTP 403)
    const docStartAttempt = await request('POST', `/api/therapy-sessions/${session1.id}/start`, {
      role: 'DOCTOR',
      body: { preAssessment: { vaidyaClearanceConfirmed: true } }
    });
    assert(
      docStartAttempt.status === 403,
      'Modern medicine DOCTOR blocked from starting Ayurvedic therapy session (HTTP 403 CLINICAL_DISCIPLINE_MISMATCH)'
    );

    // Valid start with Vaidya clinical clearance
    const startRes = await request('POST', `/api/therapy-sessions/${session1.id}/start`, {
      role: 'VAIDYA',
      body: {
        preAssessment: {
          bpSystolic: 120,
          bpDiastolic: 80,
          heartRate: 72,
          temperature: '98.4 F',
          agniStatus: 'SAMA',
          koshthaStatus: 'MADHYAMA',
          vaidyaClearanceConfirmed: true,
          clinicalNotes: 'Patient rested; pulse and Agni balanced for Abhyanga.'
        }
      }
    });
    assert(startRes.status === 200, 'POST /api/therapy-sessions/:id/start succeeds with HTTP 200');
    assert(startRes.body.data.status === 'IN_PROGRESS', 'Session transitions to IN_PROGRESS');

    // Verify room operational status transitioned to OCCUPIED
    const roomOccupied = await prisma.therapyRoom.findUnique({ where: { id: createdRoom.id } });
    assert(roomOccupied?.status === 'OCCUPIED', 'Therapy room atomically transitions to OCCUPIED');

    // Complete session with post-procedure vitals
    const completeRes = await request('POST', `/api/therapy-sessions/${session1.id}/complete`, {
      role: 'VAIDYA',
      body: {
        postAssessment: {
          bpSystolic: 118,
          bpDiastolic: 76,
          heartRate: 70,
          patientTolerance: 'GOOD',
          sweatingResponse: 'MODERATE_SWEDA',
          procedureNotes: 'Synchronized four-hand Abhyanga executed with Sahacharadi Thailam; gentle steam applied.'
        }
      }
    });
    assert(completeRes.status === 200, 'POST /api/therapy-sessions/:id/complete succeeds with HTTP 200');
    assert(completeRes.body.data.status === 'COMPLETED', 'Session status transitions to COMPLETED');
    assert(completeRes.body.data.completedAt !== null, 'Session completedAt timestamp is recorded');

    // Verify room operational status atomically transitioned to SANITIZING
    const roomSanitizing = await prisma.therapyRoom.findUnique({ where: { id: createdRoom.id } });
    assert(roomSanitizing?.status === 'SANITIZING', 'Therapy room atomically transitions to SANITIZING upon session completion');

    // Abort session in progress workflow
    const abortSession = await prisma.therapySession.create({
      data: {
        sessionNumber: 2,
        sessionRef: `SES-ABORT-${Date.now().toString().slice(-4)}`,
        patientId: testPatient.id,
        roomId: secondRoom.id,
        roomCodeSnapshot: secondRoom.code,
        roomNameSnapshot: secondRoom.name,
        administeringStaffId: ayurStaff.id,
        responsibleVaidyaId: testVaidya.id,
        scheduledStartAt: new Date().toISOString(),
        scheduledEndAt: new Date(Date.now() + 3600000).toISOString(),
        status: 'IN_PROGRESS'
      }
    });
    const abortRes = await request('POST', `/api/therapy-sessions/${abortSession.id}/abort`, {
      role: 'VAIDYA',
      body: {
        abortReason: 'Sudden dizziness and mild hypotension during steam fomentation',
        adverseEventDetails: 'BP dropped to 90/60 mmHg; session discontinued, rested in recumbent position.'
      }
    });
    assert(abortRes.status === 200, 'POST /api/therapy-sessions/:id/abort succeeds with HTTP 200');
    assert(abortRes.body.data.status === 'ABORTED', 'Session status transitions to ABORTED');

    // -------------------------------------------------------------------------
    // SECTION 7: PANCHAKARMA THREE-STAGE PROGRESSION & AUDIT LOGS
    // -------------------------------------------------------------------------
    console.log(`\n${BOLD}SECTION 7: Panchakarma Three-Stage Progression & Audit Logs${RESET}`);

    // Advance Phase 1: Purvakarma -> Pradhanakarma
    const advanceRes = await request('POST', `/api/panchakarma-courses/${createdCourse.id}/advance-phase`, {
      role: 'VAIDYA',
      body: {
        toPhase: 'PRADHANAKARMA',
        clinicalRationaleNotes: 'Samyak Snigdha lakshanas observed: unctuous stools, soft skin. Ready for Virechana purgation.',
        vitalsAtTransition: {
          bpSystolic: 120,
          bpDiastolic: 78,
          pulseRate: 72
        },
        samayakLakshanasObserved: ['Vatanulomana', 'Dehalaghava']
      }
    });

    assert(advanceRes.status === 200, 'POST /api/panchakarma-courses/:id/advance-phase succeeds (HTTP 200)');
    const courseStage2 = advanceRes.body.data.course;
    assert(
      courseStage2.currentPhase === 'Pradhanakarma (Main Procedure)',
      'Course currentPhase is updated to Pradhanakarma'
    );

    const transitionRecord = advanceRes.body.data.transition;
    assert(
      transitionRecord && transitionRecord.fromPhase === 'PURVAKARMA' && transitionRecord.toPhase === 'PRADHANAKARMA',
      'Immutable PanchakarmaPhaseTransition record logged with fromPhase PURVAKARMA -> toPhase PRADHANAKARMA'
    );

    // Empty clinical rationale rejection (genuine data integrity enforcement)
    const emptyRationaleRes = await request('POST', `/api/panchakarma-courses/${createdCourse.id}/advance-phase`, {
      role: 'VAIDYA',
      body: {
        toPhase: 'PASCHATKARMA',
        clinicalRationaleNotes: '   ' // empty
      }
    });
    assert(
      emptyRationaleRes.status === 400,
      'Phase progression with missing clinical rationale rejected with HTTP 400 (Data integrity enforced)'
    );

    // Pause and Resume course
    const pauseRes = await request('POST', `/api/panchakarma-courses/${createdCourse.id}/pause`, {
      role: 'VAIDYA',
      body: { reason: 'Patient scheduled for interstate travel; brief clinical pause' }
    });
    assert(pauseRes.status === 200 && pauseRes.body.data.status === 'Paused', 'Course status paused successfully');

    const resumeRes = await request('POST', `/api/panchakarma-courses/${createdCourse.id}/resume`, {
      role: 'VAIDYA',
      body: { reason: 'Patient returned; clinical equilibrium re-verified' }
    });
    assert(resumeRes.status === 200 && resumeRes.body.data.status === 'Active', 'Course status resumed to Active');

    // Advance Phase 2: Pradhanakarma -> Paschatkarma (Dietary Samsarjana)
    const advance2Res = await request('POST', `/api/panchakarma-courses/${createdCourse.id}/advance-phase`, {
      role: 'VAIDYA',
      body: {
        toPhase: 'PASCHATKARMA',
        clinicalRationaleNotes: 'Samyak Virechana attained: 18 vegas observed; initiating Samsarjana Krama dietary recovery.'
      }
    });
    assert(advance2Res.status === 200, 'Course advanced to Paschatkarma (HTTP 200)');
    assert(
      advance2Res.body.data.course.currentPhase === 'Paschatkarma (Dietary Samsarjana)',
      'Current phase updated to Paschatkarma'
    );

    // -------------------------------------------------------------------------
    // SECTION 8: BILLING INTEGRATION & REVERSAL WORKFLOWS (PER_SESSION & PACKAGE_BILLED)
    // -------------------------------------------------------------------------
    console.log(`\n${BOLD}SECTION 8: Billing Integration & Reversal Workflows (PER_SESSION & PACKAGE_BILLED)${RESET}`);

    // --- SUBSECTION 8A: PER_SESSION BILLING & VOID REVERSAL ---
    const billableSession = await prisma.therapySession.create({
      data: {
        sessionNumber: 99,
        sessionRef: `SES-BIL-${Date.now().toString().slice(-4)}`,
        patientId: testPatient.id,
        roomCodeSnapshot: createdRoom.code,
        roomNameSnapshot: createdRoom.name,
        administeringStaffId: ayurStaff.id,
        responsibleVaidyaId: testVaidya.id,
        scheduledStartAt: new Date().toISOString(),
        scheduledEndAt: new Date(Date.now() + 3600000).toISOString(),
        completedAt: new Date().toISOString(),
        status: 'COMPLETED',
        billingMode: 'PER_SESSION',
        tariffId: sessionTariff.id,
        billableAmount: 1800.0,
        isBilled: false
      }
    });

    const unbilledRes = await request('GET', `/api/therapy-sessions/unbilled?patientId=${testPatient.id}`, {
      role: 'ACCOUNTANT'
    });
    assert(unbilledRes.status === 200, 'GET /api/therapy-sessions/unbilled returns HTTP 200');
    assert(
      unbilledRes.body.data.some((s: any) => s.id === billableSession.id),
      'Unbilled sessions list contains the completed unbilled therapy session'
    );

    // Bill the session via Invoice Generation
    const invoiceRes = await request('POST', '/api/invoices', {
      role: 'ACCOUNTANT',
      body: {
        patientId: testPatient.id,
        subtotal: 1800.0,
        totalAmount: 1800.0,
        paymentStatus: 'unpaid',
        items: [
          {
            therapySessionId: billableSession.id,
            tariffId: sessionTariff.id,
            description: 'Classical Abhyanga Therapy Procedure',
            category: 'Treatment',
            quantity: 1,
            unitPrice: 1800.0,
            total: 1800.0
          }
        ]
      }
    });
    assert(invoiceRes.status === 201, 'POST /api/invoices successfully creates invoice with therapy session item (HTTP 201)');
    const createdInvoice = invoiceRes.body.data;

    const billedSessionCheck = await prisma.therapySession.findUnique({
      where: { id: billableSession.id }
    });
    assert(billedSessionCheck?.isBilled === true, 'Therapy session atomically marked isBilled = true');
    assert(billedSessionCheck?.invoiceId === createdInvoice.id, 'Therapy session linked to invoice ID');

    // Attempting duplicate billing on already-billed session must be rejected
    const dupBillingRes = await request('POST', '/api/invoices', {
      role: 'ACCOUNTANT',
      body: {
        patientId: testPatient.id,
        items: [
          {
            therapySessionId: billableSession.id,
            tariffId: sessionTariff.id,
            description: 'Classical Abhyanga Therapy Procedure',
            quantity: 1,
            unitPrice: 1800.0
          }
        ]
      }
    });
    assert(dupBillingRes.status >= 400, 'Duplicate billing of already-billed therapy session strictly rejected');

    // Void Invoice through approved Phase 5 RefundRequest workflow
    const accountantUser = await prisma.user.findFirst({ where: { role: 'ACCOUNTANT', status: 'active' } });
    const superAdminUser = await prisma.user.findFirst({ where: { role: 'SUPER_ADMIN', status: 'active' } });

    const voidReq = await dbRequestRefund(
      {
        type: 'invoice_void',
        invoiceId: createdInvoice.id,
        patientId: testPatient.id,
        amount: 1800.0,
        reason: 'Service cancelled by patient; reversing charge per policy'
      },
      { id: accountantUser?.id || 'usr-acct', name: 'Accountant', role: 'ACCOUNTANT' }
    );
    assert(voidReq.status === 'pending', 'Phase 5 invoice_void RefundRequest created in pending status');

    await dbApproveRefund(
      voidReq.id,
      { id: superAdminUser?.id || 'usr-superadmin', name: 'Alexander Wright', role: 'SUPER_ADMIN' },
      'Approved void reversal of per-session charge'
    );

    const voidedInvoice = await prisma.invoice.findUnique({ where: { id: createdInvoice.id } });
    assert(voidedInvoice?.status === 'voided', 'Invoice transitioned to voided status in ledger');

    const restoredSession = await prisma.therapySession.findUnique({ where: { id: billableSession.id } });
    assert(restoredSession?.isBilled === false, 'Session isBilled atomically reverted to false');
    assert(restoredSession?.invoiceId === null, 'Session invoiceId atomically unlinked');

    // --- SUBSECTION 8B: PACKAGE_BILLED PANCHAKARMA COURSE & VOID REVERSAL ---
    // Bill the package course
    const pkgInvoiceRes = await request('POST', '/api/invoices', {
      role: 'ACCOUNTANT',
      body: {
        patientId: testPatient.id,
        subtotal: 25000.0,
        totalAmount: 25000.0,
        paymentStatus: 'unpaid',
        items: [
          {
            panchakarmaCourseId: createdCourse.id,
            tariffId: testTariff.id,
            description: 'Comprehensive Virechana Panchakarma Course (14 Days)',
            category: 'Panchakarma',
            quantity: 1,
            unitPrice: 25000.0,
            total: 25000.0
          }
        ]
      }
    });
    assert(pkgInvoiceRes.status === 201, 'POST /api/invoices creates invoice for Panchakarma package course (HTTP 201)');
    const createdPkgInvoice = pkgInvoiceRes.body.data;

    const courseBilledCheck = await prisma.panchakarmaCourse.findUnique({
      where: { id: createdCourse.id }
    });
    assert(courseBilledCheck?.isPackageBilled === true, 'Panchakarma course atomically marked isPackageBilled = true');
    assert(courseBilledCheck?.packageInvoiceId === createdPkgInvoice.id, 'Panchakarma course linked to packageInvoiceId');

    // Individual session under package course cannot be billed separately
    const individualPkgSessionRes = await request('POST', '/api/invoices', {
      role: 'ACCOUNTANT',
      body: {
        patientId: testPatient.id,
        items: [
          {
            therapySessionId: session1.id, // PACKAGE_COVERED session
            tariffId: sessionTariff.id,
            description: 'Abhyanga Procedure',
            quantity: 1,
            unitPrice: 1800.0
          }
        ]
      }
    });
    assert(
      individualPkgSessionRes.status >= 400,
      'Individual billing of package-covered therapy session strictly blocked (PackageCoveredSession)'
    );

    // Void Package Invoice through approved Phase 5 RefundRequest workflow
    const pkgVoidReq = await dbRequestRefund(
      {
        type: 'invoice_void',
        invoiceId: createdPkgInvoice.id,
        patientId: testPatient.id,
        amount: 25000.0,
        reason: 'Patient relocated; cancelling course package before completion'
      },
      { id: accountantUser?.id || 'usr-acct', name: 'Accountant', role: 'ACCOUNTANT' }
    );

    await dbApproveRefund(
      pkgVoidReq.id,
      { id: superAdminUser?.id || 'usr-superadmin', name: 'Alexander Wright', role: 'SUPER_ADMIN' },
      'Approved package invoice void reversal'
    );

    const voidedPkgInvoice = await prisma.invoice.findUnique({ where: { id: createdPkgInvoice.id } });
    assert(voidedPkgInvoice?.status === 'voided', 'Package invoice transitioned to voided status');

    const restoredCourse = await prisma.panchakarmaCourse.findUnique({ where: { id: createdCourse.id } });
    assert(restoredCourse?.isPackageBilled === false, 'Course isPackageBilled atomically restored to false');
    assert(restoredCourse?.packageInvoiceId === null, 'Course packageInvoiceId atomically unlinked');
    assert(restoredCourse?.status === 'Active', 'Course clinical status and phase progression fully preserved');

    // -------------------------------------------------------------------------
    // SECTION 9: RBAC MATRIX ACROSS ALL 7 CANONICAL ROLES
    // -------------------------------------------------------------------------
    console.log(`\n${BOLD}SECTION 9: RBAC Matrix Across All 7 Canonical Roles${RESET}`);

    const rbacSession = await prisma.therapySession.create({
      data: {
        sessionNumber: 101,
        sessionRef: `SES-RBAC-${Date.now().toString().slice(-4)}`,
        patientId: testPatient.id,
        roomCodeSnapshot: createdRoom.code,
        roomNameSnapshot: createdRoom.name,
        administeringStaffId: ayurStaff.id,
        responsibleVaidyaId: testVaidya.id,
        scheduledStartAt: new Date(Date.now() + 86400000).toISOString(),
        scheduledEndAt: new Date(Date.now() + 90000000).toISOString(),
        status: 'SCHEDULED',
        billingMode: 'PACKAGE_COVERED'
      }
    });

    // 1. DOCTOR role blocked from initiating Ayurvedic therapy session (HTTP 403)
    const docStartRes = await request('POST', `/api/therapy-sessions/${rbacSession.id}/start`, {
      role: 'DOCTOR',
      body: { preAssessment: { vaidyaClearanceConfirmed: true } }
    });
    assert(docStartRes.status === 403, 'DOCTOR blocked from Ayurvedic therapy session execution (HTTP 403 Forbidden)');

    // 2. ADMIN role blocked from clinical actions (No administrative clinical override)
    const adminStartRes = await request('POST', `/api/therapy-sessions/${rbacSession.id}/start`, {
      role: 'ADMIN',
      body: { preAssessment: { vaidyaClearanceConfirmed: true } }
    });
    assert(adminStartRes.status === 403, 'ADMIN blocked from clinical session start (No administrative clinical override)');

    const adminAdvanceRes = await request('POST', `/api/panchakarma-courses/${createdCourse.id}/advance-phase`, {
      role: 'ADMIN',
      body: { toPhase: 'PASCHATKARMA', clinicalRationaleNotes: 'Admin override' }
    });
    assert(adminAdvanceRes.status === 403, 'ADMIN blocked from clinical phase progression (HTTP 403 Forbidden)');

    // 3. SUPER_ADMIN blocked from clinical actions
    const superAdminStartRes = await request('POST', `/api/therapy-sessions/${rbacSession.id}/start`, {
      role: 'SUPER_ADMIN',
      body: { preAssessment: { vaidyaClearanceConfirmed: true } }
    });
    assert(superAdminStartRes.status === 403, 'SUPER_ADMIN blocked from clinical session start (HTTP 403 Forbidden)');

    // 4. RECEPTIONIST blocked from clinical phase advancement
    const recepAdvanceRes = await request('POST', `/api/panchakarma-courses/${createdCourse.id}/advance-phase`, {
      role: 'RECEPTIONIST',
      body: { toPhase: 'PASCHATKARMA', clinicalRationaleNotes: 'Scheduling stage' }
    });
    assert(recepAdvanceRes.status === 403, 'RECEPTIONIST blocked from Panchakarma phase progression (HTTP 403 Forbidden)');

    // 5. PHARMACIST blocked from therapy room maintenance & scheduling
    const pharmMaintRes = await request('POST', `/api/therapy-rooms/${createdRoom.id}/maintenance/enter`, {
      role: 'PHARMACIST',
      body: { reason: 'Cleaning' }
    });
    assert(pharmMaintRes.status === 403, 'PHARMACIST blocked from room maintenance operations (HTTP 403 Forbidden)');

    const pharmSchedRes = await request('POST', '/api/therapy-sessions', {
      role: 'PHARMACIST',
      body: {
        patientId: testPatient.id,
        roomId: createdRoom.id,
        administeringStaffId: ayurStaff.id,
        responsibleVaidyaId: testVaidya.id,
        therapyType: 'Abhyanga',
        scheduledStartTime: new Date().toISOString(),
        scheduledEndTime: new Date(Date.now() + 3600000).toISOString()
      }
    });
    assert(pharmSchedRes.status === 403, 'PHARMACIST blocked from therapy scheduling (HTTP 403 Forbidden)');

    // 6. ACCOUNTANT blocked from therapy scheduling
    const acctSchedRes = await request('POST', '/api/therapy-sessions', {
      role: 'ACCOUNTANT',
      body: {
        patientId: testPatient.id,
        roomId: createdRoom.id,
        administeringStaffId: ayurStaff.id,
        responsibleVaidyaId: testVaidya.id,
        therapyType: 'Abhyanga',
        scheduledStartTime: new Date().toISOString(),
        scheduledEndTime: new Date(Date.now() + 3600000).toISOString()
      }
    });
    assert(acctSchedRes.status === 403, 'ACCOUNTANT blocked from therapy scheduling (HTTP 403 Forbidden)');

    // 7. Operational roles permissions: RECEPTIONIST read access & room sanitization
    const recepRoomsRes = await request('GET', '/api/therapy-rooms', { role: 'RECEPTIONIST' });
    assert(recepRoomsRes.status === 200, 'RECEPTIONIST has read-only access to therapy room availability (HTTP 200)');

    const recepSanitizeRes = await request('POST', `/api/therapy-rooms/${createdRoom.id}/sanitize`, {
      role: 'RECEPTIONIST',
      body: { notes: 'Room aired and prepared for next patient' }
    });
    assert(recepSanitizeRes.status === 200, 'RECEPTIONIST authorized for operational room sanitization (HTTP 200)');

    // -------------------------------------------------------------------------
    // SECTION 10: PRODUCTION IMMUTABILITY FINAL VERIFICATION
    // -------------------------------------------------------------------------
    console.log(`\n${BOLD}SECTION 10: Production Immutability Final Verification${RESET}`);

    if (prodProbePrisma) {
      const finalProdMigrations = await prodProbePrisma.$queryRaw<any[]>`
        SELECT migration_name, finished_at FROM _prisma_migrations ORDER BY finished_at ASC;
      `;
      const finalProdUsers = await prodProbePrisma.user.count();
      const finalProdPatients = await prodProbePrisma.patient.count();
      const finalProdInvoices = await prodProbePrisma.invoice.count();

      assert(
        finalProdMigrations.length === 19,
        `Final check: Production migrations strictly preserved at 19 (Found: ${finalProdMigrations.length})`
      );
      assert(
        finalProdUsers === prodUsersCount,
        `Final check: Production users count unchanged (${finalProdUsers} == ${prodUsersCount})`
      );
      assert(
        finalProdPatients === prodPatientsCount,
        `Final check: Production patients count unchanged (${finalProdPatients} == ${prodPatientsCount})`
      );
      assert(
        finalProdInvoices === prodInvoicesCount,
        `Final check: Production invoices count unchanged (${finalProdInvoices} == ${prodInvoicesCount})`
      );
    } else {
      console.log('  ℹ [SKIPPED] Final production database zero-mutation probe skipped: isolated CI/test environment (zero production database access).');
    }

  } finally {
    server.close();
    if (prodProbePrisma) await prodProbePrisma.$disconnect().catch(() => { });
    await prisma.$disconnect();
  }

  // ---------------------------------------------------------------------------
  // SUMMARY REPORT
  // ---------------------------------------------------------------------------
  console.log(`\n${BOLD}${CYAN}========================================================================${RESET}`);
  console.log(`${BOLD}   PHASE 7 VERIFICATION SUMMARY   ${RESET}`);
  console.log(`${BOLD}${CYAN}========================================================================${RESET}`);
  console.log(`Total Assertions Evaluated : ${passed + failed}`);
  console.log(`Assertions Passed          : ${GREEN}${passed}${RESET}`);
  console.log(`Assertions Failed          : ${failed > 0 ? RED + failed : GREEN + '0'}${RESET}`);
  console.log(`${BOLD}${CYAN}========================================================================${RESET}\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runPhase7VerificationSuite().catch((err) => {
  console.error('\nFatal suite execution error:', err);
  process.exit(1);
});
