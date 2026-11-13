/**
 * SAHACHARA OPS — PHASE 7 THERAPY SCHEDULING CONCURRENCY & RACE-SAFETY DEEP SUITE
 * 
 * Verifies all 7 simultaneous PostgreSQL integration tests:
 *   1. Same patient competing across different rooms
 *   2. Same administering staff member competing across different rooms
 *   3. Same responsible Vaidya competing across different rooms
 *   4. Same therapy room competing for overlapping intervals
 *   5. Concurrent rescheduling against a new booking
 *   6. Two concurrent rescheduling operations competing for the same resource
 *   7. Consistent deterministic lock ordering preventing deadlocks under high concurrency
 * 
 * Execution strictly isolated to sahachara_ops_test_db.
 */

const TEST_DB_URL = process.env.TEST_DATABASE_URL || 'postgresql://highflyer@localhost:5432/sahachara_ops_test_db';
const PROD_DB_URL = process.env.DATABASE_URL || 'postgresql://highflyer@localhost:5432/sahachara_ops_db';

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
const prodProbePrisma = new PrismaClient({ datasources: { db: { url: PROD_DB_URL } } });

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
  console.log(`${BOLD}   SAHACHARA OPS — THERAPY SCHEDULING CONCURRENCY & RACE-SAFETY DEEP SUITE   ${RESET}`);
  console.log(`${BOLD}   All 7 Simultaneous Integration Scenarios Verified (Promise.all)   ${RESET}`);
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
    // SECTION 1: PRODUCTION DB FREEZE VERIFICATION
    // -------------------------------------------------------------------------
    console.log(`${BOLD}SECTION 1: Production Database Isolation Verification${RESET}`);
    const prodMigrations = await prodProbePrisma.$queryRaw<any[]>`
      SELECT migration_name FROM _prisma_migrations WHERE rolled_back_at IS NULL;
    `;
    assert(prodMigrations.length === 19, `Production db strictly frozen at 19 migrations (Found: ${prodMigrations.length})`);

    // Clean up test sessions in test database
    await prisma.therapySession.deleteMany({});
    await prisma.panchakarmaPhaseTransition.deleteMany({});
    await prisma.panchakarmaCourse.deleteMany({});

    // -------------------------------------------------------------------------
    // SETUP TEST FIXTURES IN ISOLATED TEST DB
    // -------------------------------------------------------------------------
    // 2 Patients
    const pat1Res = await request('POST', '/api/patients', {
      role: 'RECEPTIONIST',
      body: { firstName: 'Arya', lastName: `Devan_${Date.now()}`, phone: `+91 98471 ${Date.now().toString().slice(-5)}`, dateOfBirth: '1992-06-15', gender: 'female' }
    });
    const patient1 = pat1Res.body.data;

    const pat2Res = await request('POST', '/api/patients', {
      role: 'RECEPTIONIST',
      body: { firstName: 'Madhavan', lastName: `Nair_${Date.now()}`, phone: `+91 98472 ${Date.now().toString().slice(-5)}`, dateOfBirth: '1988-11-20', gender: 'male' }
    });
    const patient2 = pat2Res.body.data;

    // 3 Approved Therapy Rooms with Configured Turnaround Buffer (15 min)
    const room1Res = await request('POST', '/api/therapy-rooms', {
      role: 'SUPER_ADMIN',
      body: { code: `CNC-RM1-${Date.now().toString().slice(-4)}`, name: 'Concurrency Suite 1', roomType: 'MASSAGE_DRONI_ROOM', bufferMinutes: 15 }
    });
    const room1 = room1Res.body.data;

    const room2Res = await request('POST', '/api/therapy-rooms', {
      role: 'SUPER_ADMIN',
      body: { code: `CNC-RM2-${Date.now().toString().slice(-4)}`, name: 'Concurrency Suite 2', roomType: 'SHIRODHARA_ROOM', bufferMinutes: 15 }
    });
    const room2 = room2Res.body.data;

    const room3Res = await request('POST', '/api/therapy-rooms', {
      role: 'SUPER_ADMIN',
      body: { code: `CNC-RM3-${Date.now().toString().slice(-4)}`, name: 'Concurrency Suite 3', roomType: 'SWEDANA_STEAM_ROOM', bufferMinutes: 15 }
    });
    const room3 = room3Res.body.data;

    // 2 Qualified Administering Staff
    const staff1 = await prisma.staffMember.create({
      data: {
        employeeId: `STF-CNC1-${Date.now().toString().slice(-4)}`,
        name: 'Therapist Anand Kumar',
        designation: 'Senior Panchakarma Therapist',
        department: 'Ayurveda & Panchakarma',
        role: 'ADMIN', // Admin staff acting as therapist
        email: `anand.kumar.${Date.now()}@sahachara.com`,
        phone: '+91 98470 55111',
        status: 'active'
      }
    });
    await prisma.staffTherapyAuthorization.create({
      data: {
        staffId: staff1.id,
        isRevoked: false,
        verifiedById: 'admin-sys',
        verifiedByName: 'Administrator',
        approvedQualification: 'Certified Panchakarma Technician',
        authorizedTherapyTypes: ['ABHYANGA', 'SWEDANA', 'SHIRODHARA']
      }
    });

    const staff2 = await prisma.staffMember.create({
      data: {
        employeeId: `STF-CNC2-${Date.now().toString().slice(-4)}`,
        name: 'Therapist Bindu Suresh',
        designation: 'Senior Panchakarma Therapist',
        department: 'Ayurveda & Panchakarma',
        role: 'ADMIN',
        email: `bindu.suresh.${Date.now()}@sahachara.com`,
        phone: '+91 98470 55222',
        status: 'active'
      }
    });
    await prisma.staffTherapyAuthorization.create({
      data: {
        staffId: staff2.id,
        isRevoked: false,
        verifiedById: 'admin-sys',
        verifiedByName: 'Administrator',
        approvedQualification: 'Certified Panchakarma Technician',
        authorizedTherapyTypes: ['ABHYANGA', 'SWEDANA', 'SHIRODHARA']
      }
    });

    // 2 Responsible Vaidyas
    let vaidya1 = await prisma.staffMember.findFirst({ where: { role: 'VAIDYA', isSuspended: false, status: 'active' } });
    if (!vaidya1) {
      vaidya1 = await prisma.staffMember.create({
        data: {
          employeeId: `V-CNC1-${Date.now().toString().slice(-4)}`,
          name: 'Dr. Sarah Chen, BAMS',
          designation: 'Chief Ayurvedic Physician',
          department: 'Ayurveda & Panchakarma',
          role: 'VAIDYA',
          email: `sarah.chen.${Date.now()}@sahachara.com`,
          phone: '+91 98470 33111',
          status: 'active'
        }
      });
    }

    const vaidya2 = await prisma.staffMember.create({
      data: {
        employeeId: `V-CNC2-${Date.now().toString().slice(-4)}`,
        name: 'Dr. Rajesh Pillai, BAMS, MD',
        designation: 'Consultant Vaidya',
        department: 'Ayurveda & Panchakarma',
        role: 'VAIDYA',
        email: `rajesh.pillai.${Date.now()}@sahachara.com`,
        phone: '+91 98470 33222',
        status: 'active'
      }
    });

    // -------------------------------------------------------------------------
    // TEST 1: SAME PATIENT COMPETING FOR DIFFERENT ROOMS
    // -------------------------------------------------------------------------
    console.log(`\n${BOLD}TEST 1: Same Patient Competing Across Different Rooms (Promise.all)${RESET}`);
    const timeSlot1Start = '2026-11-26T14:00:00Z';
    const timeSlot1End = '2026-11-26T15:00:00Z';

    const test1Results = await Promise.all([
      request('POST', '/api/therapy-sessions', {
        role: 'RECEPTIONIST',
        body: {
          patientId: patient1.id,
          roomId: room1.id,
          administeringStaffId: staff1.id,
          responsibleVaidyaId: vaidya1.id,
          therapyType: 'ABHYANGA',
          scheduledStartAt: timeSlot1Start,
          scheduledEndAt: timeSlot1End
        }
      }),
      request('POST', '/api/therapy-sessions', {
        role: 'RECEPTIONIST',
        body: {
          patientId: patient1.id,
          roomId: room2.id,
          administeringStaffId: staff2.id,
          responsibleVaidyaId: vaidya2.id,
          therapyType: 'SHIRODHARA',
          scheduledStartAt: timeSlot1Start,
          scheduledEndAt: timeSlot1End
        }
      })
    ]);

    const t1Success = test1Results.filter((r) => r.status === 201).length;
    const t1Conflict = test1Results.filter((r) => r.status === 409 && (r.body.conflictType === 'PATIENT_DOUBLE_BOOKED' || r.body.message.includes('Patient'))).length;
    assert(t1Success === 1 && t1Conflict === 1, 'Simultaneous same-patient cross-room booking: Exactly one 201 and one 409 PATIENT_DOUBLE_BOOKED');

    // -------------------------------------------------------------------------
    // TEST 2: SAME ADMINISTERING STAFF COMPETING ACROSS DIFFERENT ROOMS
    // -------------------------------------------------------------------------
    console.log(`\n${BOLD}TEST 2: Same Administering Staff Competing Across Different Rooms (Promise.all)${RESET}`);
    const timeSlot2Start = '2026-11-26T15:30:00Z';
    const timeSlot2End = '2026-11-26T16:30:00Z';

    const test2Results = await Promise.all([
      request('POST', '/api/therapy-sessions', {
        role: 'RECEPTIONIST',
        body: {
          patientId: patient1.id,
          roomId: room1.id,
          administeringStaffId: staff1.id, // SAME STAFF
          responsibleVaidyaId: vaidya1.id,
          therapyType: 'ABHYANGA',
          scheduledStartAt: timeSlot2Start,
          scheduledEndAt: timeSlot2End
        }
      }),
      request('POST', '/api/therapy-sessions', {
        role: 'RECEPTIONIST',
        body: {
          patientId: patient2.id,
          roomId: room2.id,
          administeringStaffId: staff1.id, // SAME STAFF
          responsibleVaidyaId: vaidya2.id,
          therapyType: 'SHIRODHARA',
          scheduledStartAt: timeSlot2Start,
          scheduledEndAt: timeSlot2End
        }
      })
    ]);

    const t2Success = test2Results.filter((r) => r.status === 201).length;
    const t2Conflict = test2Results.filter((r) => r.status === 409 && (r.body.conflictType === 'STAFF_UNAVAILABLE' || r.body.message.includes('staff'))).length;
    assert(t2Success === 1 && t2Conflict === 1, 'Simultaneous same-staff cross-room booking: Exactly one 201 and one 409 STAFF_UNAVAILABLE');

    // -------------------------------------------------------------------------
    // TEST 3: SAME RESPONSIBLE VAIDYA COMPETING ACROSS DIFFERENT ROOMS
    // -------------------------------------------------------------------------
    console.log(`\n${BOLD}TEST 3: Same Responsible Vaidya Competing Across Different Rooms (Promise.all)${RESET}`);
    const timeSlot3Start = '2026-11-26T17:00:00Z';
    const timeSlot3End = '2026-11-26T18:00:00Z';

    const test3Results = await Promise.all([
      request('POST', '/api/therapy-sessions', {
        role: 'RECEPTIONIST',
        body: {
          patientId: patient1.id,
          roomId: room1.id,
          administeringStaffId: staff1.id,
          responsibleVaidyaId: vaidya1.id, // SAME VAIDYA
          therapyType: 'ABHYANGA',
          scheduledStartAt: timeSlot3Start,
          scheduledEndAt: timeSlot3End
        }
      }),
      request('POST', '/api/therapy-sessions', {
        role: 'RECEPTIONIST',
        body: {
          patientId: patient2.id,
          roomId: room2.id,
          administeringStaffId: staff2.id,
          responsibleVaidyaId: vaidya1.id, // SAME VAIDYA
          therapyType: 'SHIRODHARA',
          scheduledStartAt: timeSlot3Start,
          scheduledEndAt: timeSlot3End
        }
      })
    ]);

    const t3Success = test3Results.filter((r) => r.status === 201).length;
    const t3Conflict = test3Results.filter((r) => r.status === 409 && (r.body.conflictType === 'VAIDYA_UNAVAILABLE' || r.body.message.includes('Vaidya'))).length;
    assert(t3Success === 1 && t3Conflict === 1, 'Simultaneous same-vaidya cross-room booking: Exactly one 201 and one 409 VAIDYA_UNAVAILABLE');

    // -------------------------------------------------------------------------
    // TEST 4: SAME THERAPY ROOM COMPETING FOR OVERLAPPING TIME SLOTS
    // -------------------------------------------------------------------------
    console.log(`\n${BOLD}TEST 4: Same Therapy Room Competing for Overlapping Intervals (Promise.all)${RESET}`);
    const test4Results = await Promise.all([
      request('POST', '/api/therapy-sessions', {
        role: 'RECEPTIONIST',
        body: {
          patientId: patient1.id,
          roomId: room3.id, // SAME ROOM
          administeringStaffId: staff1.id,
          responsibleVaidyaId: vaidya1.id,
          therapyType: 'SWEDANA',
          scheduledStartAt: '2026-11-27T09:00:00Z',
          scheduledEndAt: '2026-11-27T10:00:00Z'
        }
      }),
      request('POST', '/api/therapy-sessions', {
        role: 'RECEPTIONIST',
        body: {
          patientId: patient2.id,
          roomId: room3.id, // SAME ROOM (Overlapping interval)
          administeringStaffId: staff2.id,
          responsibleVaidyaId: vaidya2.id,
          therapyType: 'SWEDANA',
          scheduledStartAt: '2026-11-27T09:30:00Z',
          scheduledEndAt: '2026-11-27T10:30:00Z'
        }
      })
    ]);

    const t4Success = test4Results.filter((r) => r.status === 201).length;
    const t4Conflict = test4Results.filter((r) => r.status === 409 && (r.body.conflictType === 'ROOM_UNAVAILABLE' || r.body.message.includes('Room'))).length;
    assert(t4Success === 1 && t4Conflict === 1, 'Simultaneous same-room overlapping booking: Exactly one 201 and one 409 ROOM_UNAVAILABLE');

    // -------------------------------------------------------------------------
    // TEST 5: CONCURRENT RESCHEDULING AGAINST A NEW BOOKING
    // -------------------------------------------------------------------------
    console.log(`\n${BOLD}TEST 5: Concurrent Rescheduling Competing Against a New Booking (Promise.all)${RESET}`);
    // Pre-create Session Alpha in Room 2
    const preSessionRes = await request('POST', '/api/therapy-sessions', {
      role: 'RECEPTIONIST',
      body: {
        patientId: patient1.id,
        roomId: room2.id,
        administeringStaffId: staff1.id,
        responsibleVaidyaId: vaidya1.id,
        therapyType: 'SHIRODHARA',
        scheduledStartAt: '2026-11-27T12:00:00Z',
        scheduledEndAt: '2026-11-27T13:00:00Z'
      }
    });
    assert(preSessionRes.status === 201, 'Pre-created session scheduled in Room 2');
    const sessionToReschedule = preSessionRes.body.data;

    // Both attempt to claim Room 1 at 14:00-15:00 on Nov 27
    const targetStart = '2026-11-27T14:00:00Z';
    const targetEnd = '2026-11-27T15:00:00Z';

    const test5Results = await Promise.all([
      // Request A: Reschedule sessionToReschedule into Room 1
      request('POST', `/api/therapy-sessions/${sessionToReschedule.id}/reschedule`, {
        role: 'RECEPTIONIST',
        body: {
          roomId: room1.id,
          scheduledStartAt: targetStart,
          scheduledEndAt: targetEnd
        }
      }),
      // Request B: New booking in Room 1
      request('POST', '/api/therapy-sessions', {
        role: 'RECEPTIONIST',
        body: {
          patientId: patient2.id,
          roomId: room1.id,
          administeringStaffId: staff2.id,
          responsibleVaidyaId: vaidya2.id,
          therapyType: 'ABHYANGA',
          scheduledStartAt: targetStart,
          scheduledEndAt: targetEnd
        }
      })
    ]);

    const t5Success = test5Results.filter((r) => r.status === 200 || r.status === 201).length;
    const t5Conflict = test5Results.filter((r) => r.status === 409).length;
    assert(t5Success === 1 && t5Conflict === 1, 'Concurrent reschedule vs new booking: Exactly one succeeded and one 409 conflict');

    // -------------------------------------------------------------------------
    // TEST 6: TWO CONCURRENT RESCHEDULING OPERATIONS COMPETING FOR SAME RESOURCE
    // -------------------------------------------------------------------------
    console.log(`\n${BOLD}TEST 6: Two Concurrent Reschedulings Competing for Same Target Room (Promise.all)${RESET}`);
    // Pre-create Session Beta in Room 2 (at a different time)
    const sessBetaRes = await request('POST', '/api/therapy-sessions', {
      role: 'RECEPTIONIST',
      body: {
        patientId: patient1.id,
        roomId: room2.id,
        administeringStaffId: staff1.id,
        responsibleVaidyaId: vaidya1.id,
        therapyType: 'SHIRODHARA',
        scheduledStartAt: '2026-11-28T09:00:00Z',
        scheduledEndAt: '2026-11-28T10:00:00Z'
      }
    });
    const sessionBeta = sessBetaRes.body.data;

    // Pre-create Session Gamma in Room 3
    const sessGammaRes = await request('POST', '/api/therapy-sessions', {
      role: 'RECEPTIONIST',
      body: {
        patientId: patient2.id,
        roomId: room3.id,
        administeringStaffId: staff2.id,
        responsibleVaidyaId: vaidya2.id,
        therapyType: 'SWEDANA',
        scheduledStartAt: '2026-11-28T09:00:00Z',
        scheduledEndAt: '2026-11-28T10:00:00Z'
      }
    });
    const sessionGamma = sessGammaRes.body.data;

    // Both attempt to reschedule into Room 1 at 11:00-12:00 on Nov 28
    const compSlotStart = '2026-11-28T11:00:00Z';
    const compSlotEnd = '2026-11-28T12:00:00Z';

    const test6Results = await Promise.all([
      request('POST', `/api/therapy-sessions/${sessionBeta.id}/reschedule`, {
        role: 'RECEPTIONIST',
        body: { roomId: room1.id, scheduledStartAt: compSlotStart, scheduledEndAt: compSlotEnd }
      }),
      request('POST', `/api/therapy-sessions/${sessionGamma.id}/reschedule`, {
        role: 'RECEPTIONIST',
        body: { roomId: room1.id, scheduledStartAt: compSlotStart, scheduledEndAt: compSlotEnd }
      })
    ]);

    const t6Success = test6Results.filter((r) => r.status === 200).length;
    const t6Conflict = test6Results.filter((r) => r.status === 409).length;
    assert(t6Success === 1 && t6Conflict === 1, 'Two simultaneous reschedulings for same room: Exactly one 200 and one 409 conflict');

    // -------------------------------------------------------------------------
    // TEST 7: DETERMINISTIC LOCK ORDERING & HIGH CONCURRENCY DEADLOCK FREEDOM
    // -------------------------------------------------------------------------
    console.log(`\n${BOLD}TEST 7: Deterministic Lock Ordering & Deadlock Freedom Stress Test (Promise.all)${RESET}`);

    // Create 4 concurrent requests with inverted resource pairs to provoke deadlocks if unordered
    const stressStart = '2026-11-29T10:00:00Z';
    const stressEnd = '2026-11-29T11:00:00Z';

    const stressPromises = [
      // Request A: Patient 1, Staff 1, Vaidya 1, Room 1
      request('POST', '/api/therapy-sessions', {
        role: 'RECEPTIONIST',
        body: { patientId: patient1.id, roomId: room1.id, administeringStaffId: staff1.id, responsibleVaidyaId: vaidya1.id, therapyType: 'ABHYANGA', scheduledStartAt: stressStart, scheduledEndAt: stressEnd }
      }),
      // Request B: Patient 2, Staff 2, Vaidya 2, Room 2
      request('POST', '/api/therapy-sessions', {
        role: 'RECEPTIONIST',
        body: { patientId: patient2.id, roomId: room2.id, administeringStaffId: staff2.id, responsibleVaidyaId: vaidya2.id, therapyType: 'SHIRODHARA', scheduledStartAt: stressStart, scheduledEndAt: stressEnd }
      }),
      // Request C: Patient 1, Staff 2, Vaidya 2, Room 1 (Conflicts with A on Patient & Room; with B on Staff & Vaidya)
      request('POST', '/api/therapy-sessions', {
        role: 'RECEPTIONIST',
        body: { patientId: patient1.id, roomId: room1.id, administeringStaffId: staff2.id, responsibleVaidyaId: vaidya2.id, therapyType: 'ABHYANGA', scheduledStartAt: stressStart, scheduledEndAt: stressEnd }
      }),
      // Request D: Patient 2, Staff 1, Vaidya 1, Room 2 (Inverted lock order test)
      request('POST', '/api/therapy-sessions', {
        role: 'RECEPTIONIST',
        body: { patientId: patient2.id, roomId: room2.id, administeringStaffId: staff1.id, responsibleVaidyaId: vaidya1.id, therapyType: 'SHIRODHARA', scheduledStartAt: stressStart, scheduledEndAt: stressEnd }
      })
    ];

    const stressResults = await Promise.all(stressPromises);
    const deadlockCount = stressResults.filter((r) => r.status === 500 && (r.body.message?.includes('deadlock') || r.body.message?.includes('40P01'))).length;
    assert(deadlockCount === 0, 'Zero PostgreSQL transaction deadlocks (40P01) occurred under cross-resource stress');

    const stressSuccessCount = stressResults.filter((r) => r.status === 201).length;
    const stressConflictCount = stressResults.filter((r) => r.status === 409).length;
    assert(stressSuccessCount === 2 && stressConflictCount === 2, `Deterministic locks resolved cleanly: Exactly 2 succeeded (got ${stressSuccessCount}) and 2 conflicted (got ${stressConflictCount})`);

    // Verify zero orphaned or corrupted records
    const scheduledCount = await prisma.therapySession.count({
      where: {
        scheduledStartAt: new Date(stressStart),
        scheduledEndAt: new Date(stressEnd),
        status: 'SCHEDULED'
      }
    });
    assert(scheduledCount === 2, 'Exactly 2 sessions persisted in database with zero partial or orphaned records');

    // -------------------------------------------------------------------------
    // SECTION 8: FINAL PRODUCTION DB ZERO-MUTATION VERIFICATION
    // -------------------------------------------------------------------------
    console.log(`\n${BOLD}SECTION 8: Final Production DB Zero-Mutation Verification${RESET}`);
    const finalProdMigrations = await prodProbePrisma.$queryRaw<any[]>`
      SELECT migration_name FROM _prisma_migrations WHERE rolled_back_at IS NULL;
    `;
    assert(finalProdMigrations.length === 19, 'Final check: Production migrations strictly preserved at 19');
    const finalProdUsers = await prodProbePrisma.user.count();
    const finalProdInvoices = await prodProbePrisma.invoice.count();
    assert(finalProdUsers === 1, 'Final check: Production users count strictly 1');
    assert(finalProdInvoices === 0, 'Final check: Production invoices count strictly 0');

  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await prodProbePrisma.$disconnect();
    await prisma.$disconnect();
  }

  console.log(`\n${BOLD}========================================================================${RESET}`);
  console.log(`${BOLD}   THERAPY SCHEDULING CONCURRENCY & RACE-SAFETY SUMMARY   ${RESET}`);
  console.log(`${BOLD}========================================================================${RESET}`);
  console.log(`Total Assertions Evaluated : ${passed + failed}`);
  console.log(`Assertions Passed          : ${GREEN}${passed}${RESET}`);
  console.log(`Assertions Failed          : ${failed > 0 ? RED : GREEN}${failed}${RESET}`);
  console.log(`${BOLD}========================================================================${RESET}\n`);

  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error('\nFatal error during therapy concurrency verification:', err);
  process.exit(1);
});
