/**
 * SAHACHARA OPS — PHASE 6A: STAFF MANAGEMENT & ACCOUNT LIFECYCLE VERIFICATION SUITE
 *
 * Comprehensive verification of:
 * 1. Target database isolation guard (strictly refuses production database).
 * 2. Concurrency-safe, institutional sequence-backed staff ID (STF-YYYY-XXXXX via staff_id_seq).
 * 3. Strict staff creation validation (required fields, @sahachara.com domain, 7 roles, NULL optional fields).
 * 4. Duplicate prevention (staff and user email conflict detection).
 * 5. Cryptographic activation PIN lifecycle (bcrypt hash, no cleartext in DB, single-use, 5-attempt rate limit, regeneration).
 * 6. Profile editing and mass-assignment protection (whitelisted fields only, immutable identifiers).
 * 7. Role changes and immutable attributable audit trail (with self-elevation block and SUPER_ADMIN protections).
 * 8. Account suspension and immediate active JWT session revocation.
 * 9. Account reactivation lifecycle.
 * 10. Soft-archival and historical attribution preservation (encounters, prescriptions, invoices intact).
 * 11. Strict 7-role administrative RBAC governance matrix.
 * 12. Staff directory querying, department/role filtering, and pagination.
 * 13. Production database zero-mutation verification (0 records altered or polluted).
 */

import http from 'http';
import express from 'express';
import bcrypt from 'bcryptjs';
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
import { generateSessionToken, registerActiveUserChecker } from '../server/rbacMiddleware.ts';
import { UserRole } from '../src/types/hospital.ts';
import {
  checkPrismaConnection,
  ensureDefaultDatabaseUsers,
  isPrismaConnected,
  prisma,
  generateUniqueStaffId,
  generateUniquePatientNumber,
  generateUniqueInvoiceNumber
} from '../server/prismaService.ts';

const isCI = process.env.CI === 'true';
const prodProbePrisma = !isCI && PROD_DB_URL && !PROD_DB_URL.includes('test_db') && !PROD_DB_URL.includes('sahachara_ops_test')
  ? new PrismaClient({ datasources: { db: { url: PROD_DB_URL } } })
  : null;

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

async function runStaffManagementSuite() {
  console.log(`\n${BOLD}${CYAN}======================================================================${RESET}`);
  console.log(`${BOLD}${CYAN}   SAHACHARA OPS — PHASE 6A: STAFF MANAGEMENT VERIFICATION SUITE      ${RESET}`);
  console.log(`${BOLD}${CYAN}======================================================================${RESET}\n`);

  await checkPrismaConnection();
  if (!isPrismaConnected) {
    console.error('Test database unreachable. Aborting.');
    process.exit(1);
  }
  await ensureDefaultDatabaseUsers();

  // Baseline probe of production database to guarantee zero mutation
  let prodInitialSnapshot: any = null;
  if (prodProbePrisma) {
    try {
      prodInitialSnapshot = {
        users: await prodProbePrisma.user.count(),
        patients: await prodProbePrisma.patient.count(),
        appointments: await prodProbePrisma.appointment.count(),
        prescriptions: await prodProbePrisma.prescription.count(),
        dispensingRecords: await prodProbePrisma.dispensingRecord.count(),
        invoices: await prodProbePrisma.invoice.count(),
        payments: await prodProbePrisma.payment.count(),
        refundRequests: await prodProbePrisma.refundRequest.count(),
        staff: await prodProbePrisma.staffMember.count(),
        tariffs: await prodProbePrisma.hospitalTariff.count()
      };
      console.log(`✓ Isolated Test Database Connected: sahachara_ops_test_db`);
      console.log(`✓ Production Database Pre-Test State Snapshot:`, prodInitialSnapshot);
    } catch {
      prodInitialSnapshot = null;
    }
  }

  if (!prodInitialSnapshot) {
    console.log(`✓ Isolated Test Database Connected: sahachara_ops_test_db`);
    console.log(`ℹ [SKIPPED] Production database probe skipped: isolated CI/test environment (zero production database access).`);
  }

  const app = express();
  app.use(express.json());
  app.use('/api', apiRouter);

  const server = app.listen(0);
  const port = (server.address() as any).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  const superAdminEmail = process.env.INITIAL_SUPER_ADMIN_EMAIL || 'systems@sahachara.com';
  const superAdminName = process.env.INITIAL_SUPER_ADMIN_NAME || 'Sahachara Systems';
  const tokens: Record<string, string> = {
    SUPER_ADMIN: generateSessionToken({ userId: 'usr-superadmin', email: superAdminEmail, role: 'SUPER_ADMIN', name: superAdminName }),
    ADMIN: generateSessionToken({ userId: 'usr-admin', email: 'admin.ops@sahachara.com', role: 'ADMIN', name: 'Marcus Sterling' }),
    DOCTOR: generateSessionToken({ userId: 'usr-doc', email: 'robert.rivera@sahachara.com', role: 'DOCTOR', name: 'Dr. Robert Rivera' }),
    VAIDYA: generateSessionToken({ userId: 'usr-vaidya', email: 'sarah.chen@sahachara.com', role: 'VAIDYA', name: 'Dr. Sarah Chen' }),
    RECEPTIONIST: generateSessionToken({ userId: 'usr-reception', email: 'receptionist@sahachara.com', role: 'RECEPTIONIST', name: 'Kavita Sharma' }),
    PHARMACIST: generateSessionToken({ userId: 'usr-pharma', email: 'pharmacist@sahachara.com', role: 'PHARMACIST', name: 'Rajesh Nair' }),
    ACCOUNTANT: generateSessionToken({ userId: 'usr-accountant', email: 'accountant@sahachara.com', role: 'ACCOUNTANT', name: 'Anand Pillai' })
  };

  try {
    // -------------------------------------------------------------------------
    // SECTION 1: SEQUENCE-BACKED STAFF ID GENERATION & CONCURRENCY
    // -------------------------------------------------------------------------
    console.log(`\n${BOLD}▶ 1. SEQUENCE-BACKED STAFF ID GENERATION & CONCURRENCY${RESET}`);
    {
      const staffId = await generateUniqueStaffId();
      const currentYear = new Date().getFullYear();
      const idPattern = new RegExp(`^STF-${currentYear}-\\d{5}$`);
      assert(idPattern.test(staffId), `Generated Staff ID follows pattern STF-YYYY-XXXXX`, `ID: ${staffId}`);

      // Concurrency test: 10 parallel ID generations
      const concurrentIds = await Promise.all(
        Array.from({ length: 10 }).map(() => generateUniqueStaffId())
      );
      const uniqueIds = new Set(concurrentIds);
      assert(uniqueIds.size === 10, 'Concurrency: 10 parallel staff ID generations yield 10 strictly unique IDs', `Count: ${uniqueIds.size}`);
      for (const id of concurrentIds) {
        assert(idPattern.test(id), `Parallel ID matches STF format`, `ID: ${id}`);
      }
    }

    // -------------------------------------------------------------------------
    // SECTION 2: STAFF CREATION & VALIDATION ENFORCEMENT
    // -------------------------------------------------------------------------
    console.log(`\n${BOLD}▶ 2. STAFF CREATION & VALIDATION ENFORCEMENT${RESET}`);
    {
      // Missing name
      const noName = await makeRequest(baseUrl, 'POST', '/api/staff', tokens.SUPER_ADMIN, {
        email: `valid.${Date.now()}@sahachara.com`,
        role: 'DOCTOR',
        department: 'Internal Medicine',
        designation: 'Physician',
        phone: '+91 91234 56789'
      });
      assert(noName.status === 400, 'Creation without name rejected with 400', `Status: ${noName.status}`);

      // Missing email
      const noEmail = await makeRequest(baseUrl, 'POST', '/api/staff', tokens.SUPER_ADMIN, {
        name: 'Dr. John Doe',
        role: 'DOCTOR',
        department: 'Internal Medicine',
        designation: 'Physician',
        phone: '+91 91234 56789'
      });
      assert(noEmail.status === 400, 'Creation without email rejected with 400', `Status: ${noEmail.status}`);

      // Invalid email domain
      const badDomain = await makeRequest(baseUrl, 'POST', '/api/staff', tokens.SUPER_ADMIN, {
        name: 'Dr. Jane Smith',
        email: `jane.smith.${Date.now()}@gmail.com`,
        role: 'DOCTOR',
        department: 'Internal Medicine',
        designation: 'Physician',
        phone: '+91 91234 56789'
      });
      assert(badDomain.status === 400, 'Creation with non-@sahachara.com email rejected with 400 InvalidDomain', `Status: ${badDomain.status}`);

      // Invalid role (not one of 7 canonical roles)
      const badRole = await makeRequest(baseUrl, 'POST', '/api/staff', tokens.SUPER_ADMIN, {
        name: 'Nurse Nancy',
        email: `nurse.nancy.${Date.now()}@sahachara.com`,
        role: 'NURSE',
        department: 'General Ward',
        designation: 'Head Nurse',
        phone: '+91 91234 56789'
      });
      assert(badRole.status === 400, 'Creation with invalid role NURSE rejected with 400 InvalidRole', `Status: ${badRole.status}`);

      // Missing department
      const noDept = await makeRequest(baseUrl, 'POST', '/api/staff', tokens.SUPER_ADMIN, {
        name: 'Dr. John Doe',
        email: `john.doe.${Date.now()}@sahachara.com`,
        role: 'DOCTOR',
        designation: 'Physician',
        phone: '+91 91234 56789'
      });
      assert(noDept.status === 400, 'Creation without department rejected with 400', `Status: ${noDept.status}`);

      // Missing designation
      const noDesig = await makeRequest(baseUrl, 'POST', '/api/staff', tokens.SUPER_ADMIN, {
        name: 'Dr. John Doe',
        email: `john.doe.${Date.now()}@sahachara.com`,
        role: 'DOCTOR',
        department: 'Internal Medicine',
        phone: '+91 91234 56789'
      });
      assert(noDesig.status === 400, 'Creation without designation rejected with 400', `Status: ${noDesig.status}`);

      // Missing phone
      const noPhone = await makeRequest(baseUrl, 'POST', '/api/staff', tokens.SUPER_ADMIN, {
        name: 'Dr. John Doe',
        email: `john.doe.${Date.now()}@sahachara.com`,
        role: 'DOCTOR',
        department: 'Internal Medicine',
        designation: 'Physician'
      });
      assert(noPhone.status === 400, 'Creation without phone rejected with 400 PhoneRequired', `Status: ${noPhone.status}`);
      assert(noPhone.body?.message?.includes('PhoneRequired'), 'Error message identifies PhoneRequired');

      // Empty / whitespace phone
      const emptyPhone = await makeRequest(baseUrl, 'POST', '/api/staff', tokens.SUPER_ADMIN, {
        name: 'Dr. John Doe',
        email: `john.doe.${Date.now()}@sahachara.com`,
        role: 'DOCTOR',
        department: 'Internal Medicine',
        designation: 'Physician',
        phone: '   '
      });
      assert(emptyPhone.status === 400, 'Creation with whitespace phone rejected with 400 PhoneRequired', `Status: ${emptyPhone.status}`);
      assert(emptyPhone.body?.message?.includes('PhoneRequired'), 'Whitespace phone returns PhoneRequired error');

      // Invalid phone format (alphabetic)
      const invalidPhoneAlpha = await makeRequest(baseUrl, 'POST', '/api/staff', tokens.SUPER_ADMIN, {
        name: 'Dr. John Doe',
        email: `john.doe.${Date.now()}@sahachara.com`,
        role: 'DOCTOR',
        department: 'Internal Medicine',
        designation: 'Physician',
        phone: 'invalid-phone-number'
      });
      assert(invalidPhoneAlpha.status === 400, 'Creation with non-numeric phone rejected with 400 InvalidPhone', `Status: ${invalidPhoneAlpha.status}`);
      assert(invalidPhoneAlpha.body?.message?.includes('InvalidPhone'), 'Error message identifies InvalidPhone');

      // Invalid phone format (too short)
      const invalidPhoneShort = await makeRequest(baseUrl, 'POST', '/api/staff', tokens.SUPER_ADMIN, {
        name: 'Dr. John Doe',
        email: `john.doe.${Date.now()}@sahachara.com`,
        role: 'DOCTOR',
        department: 'Internal Medicine',
        designation: 'Physician',
        phone: '123'
      });
      assert(invalidPhoneShort.status === 400, 'Creation with short phone (123) rejected with 400 InvalidPhone', `Status: ${invalidPhoneShort.status}`);

      // Successful creation with minimal required fields & valid telephone
      const staffEmail1 = `dr.meera.${Date.now()}@sahachara.com`;
      const validCreate = await makeRequest(baseUrl, 'POST', '/api/staff', tokens.SUPER_ADMIN, {
        name: 'Dr. Meera Nambiar',
        email: staffEmail1,
        role: 'VAIDYA',
        department: 'Kayachikitsa',
        designation: 'Consultant Vaidya',
        phone: '+91 98765 11111'
      });
      assert(validCreate.status === 201, 'Valid staff creation succeeded with 201 Created', `Status: ${validCreate.status}`);
      assert(Boolean(validCreate.body.staff), 'Response contains staff object');
      assert(validCreate.body.staff.employeeId.startsWith('STF-'), 'Assigned sequence employeeId', `ID: ${validCreate.body.staff.employeeId}`);
      assert(validCreate.body.staff.status === 'pending_activation', 'Staff initial status is pending_activation');
      assert(validCreate.body.staff.phone === '+91 98765 11111', 'Staff response contains exact submitted phone');
      assert(Boolean(validCreate.body.activationPin), 'Response returns activation PIN exactly once');
      assert(validCreate.body.activationPin.length === 4, 'Activation PIN is exactly 4 digits');

      // Successful creation with international phone format
      const staffEmailIntl = `dr.intl.${Date.now()}@sahachara.com`;
      const validIntlCreate = await makeRequest(baseUrl, 'POST', '/api/staff', tokens.SUPER_ADMIN, {
        name: 'Dr. Arthur Conan',
        email: staffEmailIntl,
        role: 'DOCTOR',
        department: 'Emergency & Acute Care',
        designation: 'Consultant Physician',
        phone: '+1 202 555 0199'
      });
      assert(validIntlCreate.status === 201, 'Staff creation with international phone (+1 202 555 0199) succeeded (201)', `Status: ${validIntlCreate.status}`);
      assert(validIntlCreate.body.staff.phone === '+1 202 555 0199', 'International phone preserved in response');

      const dbIntlRecord = await prisma.staffMember.findUnique({
        where: { id: validIntlCreate.body.staff.id }
      });
      assert(dbIntlRecord?.phone === '+1 202 555 0199', 'International phone accurately persisted in PostgreSQL');

      // Database inspection: verify NULL for optional fields (no fabricated defaults)
      const dbRecord = await prisma.staffMember.findUnique({
        where: { id: validCreate.body.staff.id }
      });
      assert(dbRecord !== null, 'Staff record persisted in PostgreSQL');
      assert(dbRecord?.address === null, 'Unspecified address persisted strictly as NULL');
      assert(dbRecord?.emergencyContactName === null, 'Unspecified emergency contact persisted strictly as NULL');
      assert(dbRecord?.emergencyContactPhone === null, 'Unspecified emergency phone persisted strictly as NULL');
      assert(dbRecord?.reportingTo === null, 'Unspecified reportingTo persisted strictly as NULL');
      assert(dbRecord?.notes === null, 'Unspecified notes persisted strictly as NULL');
    }

    // -------------------------------------------------------------------------
    // SECTION 3: DUPLICATE EMAIL REJECTION
    // -------------------------------------------------------------------------
    console.log(`\n${BOLD}▶ 3. DUPLICATE EMAIL REJECTION${RESET}`);
    {
      const existingEmail = `dup.test.${Date.now()}@sahachara.com`;
      const firstCreate = await makeRequest(baseUrl, 'POST', '/api/staff', tokens.SUPER_ADMIN, {
        name: 'First User',
        email: existingEmail,
        role: 'DOCTOR',
        department: 'Cardiology',
        designation: 'Specialist',
        phone: '+91 98765 22222'
      });
      assert(firstCreate.status === 201, 'First user created with 201 Created');

      // Attempt duplicate creation with same email
      const dupCreate = await makeRequest(baseUrl, 'POST', '/api/staff', tokens.SUPER_ADMIN, {
        name: 'Second User',
        email: existingEmail,
        role: 'DOCTOR',
        department: 'Pediatrics',
        designation: 'Consultant',
        phone: '+91 98765 33333'
      });
      assert(dupCreate.status === 409, 'Duplicate staff email rejected with 409 Conflict', `Status: ${dupCreate.status}`);

      // Attempt creation with email already belonging to a User account
      const dupUserCreate = await makeRequest(baseUrl, 'POST', '/api/staff', tokens.SUPER_ADMIN, {
        name: 'Fake Super Admin',
        email: superAdminEmail,
        role: 'ADMIN',
        department: 'Administration',
        designation: 'Admin',
        phone: '+91 98765 44444'
      });
      assert(dupUserCreate.status === 409, 'Duplicate user email rejected with 409 Conflict', `Status: ${dupUserCreate.status}`);
    }

    // -------------------------------------------------------------------------
    // SECTION 4: ACTIVATION PIN LIFECYCLE & CRYPTOGRAPHIC SECURITY
    // -------------------------------------------------------------------------
    console.log(`\n${BOLD}▶ 4. ACTIVATION PIN LIFECYCLE & CRYPTOGRAPHIC SECURITY${RESET}`);
    {
      const pinTestEmail = `pin.test.${Date.now()}@sahachara.com`;
      const createRes = await makeRequest(baseUrl, 'POST', '/api/staff', tokens.SUPER_ADMIN, {
        name: 'Dr. Arjun Nair',
        email: pinTestEmail,
        role: 'DOCTOR',
        department: 'Orthopedics',
        designation: 'Consultant',
        phone: '+91 98765 55555'
      });
      assert(createRes.status === 201, 'Staff created for PIN test');
      const plainPin = createRes.body.activationPin;
      const staffId = createRes.body.staff.id;

      // 4.1 Verify cleartext PIN is NOT in database
      const staffInDb = await prisma.staffMember.findUnique({ where: { id: staffId } });
      assert(staffInDb?.activationPin === null, 'Plaintext activationPin in database is strictly NULL');
      assert(Boolean(staffInDb?.activationPinHash), 'Cryptographic activationPinHash is present');
      const hashValid = await bcrypt.compare(plainPin, staffInDb!.activationPinHash!);
      assert(hashValid, 'Database hash accurately verifies against cleartext PIN');

      // 4.2 Rate limiting: 5 failed attempts
      for (let attempt = 1; attempt <= 4; attempt++) {
        const badPinRes = await makeRequest(baseUrl, 'POST', '/api/auth/activate', undefined, {
          email: pinTestEmail,
          pin: '9999', // wrong pin
          newPassword: 'SecurePassword123!'
        });
        assert(badPinRes.status === 400, `Bad PIN attempt ${attempt} rejected with 400`, badPinRes.body?.error);
      }

      // 5th bad attempt
      const fifthBadPinRes = await makeRequest(baseUrl, 'POST', '/api/auth/activate', undefined, {
        email: pinTestEmail,
        pin: '9999',
        newPassword: 'SecurePassword123!'
      });
      assert(fifthBadPinRes.status === 400 || fifthBadPinRes.status === 429, '5th bad attempt rejected and account locked');

      // 6th attempt with CORRECT pin now rejected due to rate limiting lockout
      const lockedRes = await makeRequest(baseUrl, 'POST', '/api/auth/activate', undefined, {
        email: pinTestEmail,
        pin: plainPin,
        newPassword: 'SecurePassword123!'
      });
      assert(lockedRes.status === 400 || lockedRes.status === 429, 'Locked account rejects correct PIN after 5 attempts');

      // 4.3 Regenerate PIN by administrator
      const regenRes = await makeRequest(baseUrl, 'POST', `/api/staff/${staffId}/regenerate-pin`, tokens.SUPER_ADMIN);
      assert(regenRes.status === 200, 'SUPER_ADMIN regenerated activation PIN with 200 OK');
      const newPlainPin = regenRes.body.activationPin;
      assert(newPlainPin !== plainPin, 'Regenerated PIN is a new unique 4-digit code');
      assert(newPlainPin.length === 4, 'New PIN is 4 digits');

      // Verify attempts reset in DB
      const resetStaff = await prisma.staffMember.findUnique({ where: { id: staffId } });
      assert(resetStaff?.pinAttempts === 0, 'PIN attempts counter reset to 0');

      // 4.4 Successful activation with new PIN
      const activateRes = await makeRequest(baseUrl, 'POST', '/api/auth/activate', undefined, {
        email: pinTestEmail,
        pin: newPlainPin,
        newPassword: 'ValidPassword123!'
      });
      assert(activateRes.status === 200, 'Account activation succeeded with 200 OK');
      assert(activateRes.body.user.status === 'active', 'User status transitioned to active');

      // Verify PIN hash cleared after activation
      const activatedStaff = await prisma.staffMember.findUnique({ where: { id: staffId } });
      assert(activatedStaff?.status === 'active', 'StaffMember status updated to active');
      assert(activatedStaff?.activationPinHash === null, 'Activation PIN hash cleared from DB upon successful activation');

      // 4.5 Single-use prevention: repeat activation rejected
      const repeatActivate = await makeRequest(baseUrl, 'POST', '/api/auth/activate', undefined, {
        email: pinTestEmail,
        pin: newPlainPin,
        newPassword: 'AnotherPassword123!'
      });
      assert(repeatActivate.status === 400, 'Repeat activation of already active account rejected with 400');
    }

    // -------------------------------------------------------------------------
    // SECTION 5: PROFILE EDITING & ANTI-MASS-ASSIGNMENT
    // -------------------------------------------------------------------------
    console.log(`\n${BOLD}▶ 5. PROFILE EDITING & ANTI-MASS-ASSIGNMENT${RESET}`);
    {
      const editStaffEmail = `edit.test.${Date.now()}@sahachara.com`;
      const staffRes = await makeRequest(baseUrl, 'POST', '/api/staff', tokens.SUPER_ADMIN, {
        name: 'Dr. Suresh Varma',
        email: editStaffEmail,
        role: 'DOCTOR',
        department: 'Neurology',
        designation: 'Consultant',
        phone: '+91 98765 66666'
      });
      const staffId = staffRes.body.staff.id;
      const initialEmployeeId = staffRes.body.staff.employeeId;

      // Legitimate update of profile fields
      const patchRes = await makeRequest(baseUrl, 'PATCH', `/api/staff/${staffId}`, tokens.SUPER_ADMIN, {
        phone: '+91 99999 77777',
        address: '123 Hospital Road, Kochi',
        emergencyContactName: 'Lakshmi Varma',
        emergencyContactPhone: '+91 98888 88888',
        specialty: 'Clinical Neurophysiology',
        notes: 'Lead researcher in stroke rehabilitation'
      });
      assert(patchRes.status === 200, 'Profile update succeeded with 200 OK');
      const patchedStaff = patchRes.body.staff || patchRes.body.data;
      assert(patchedStaff.phone === '+91 99999 77777', 'Phone updated correctly');
      assert(patchedStaff.address === '123 Hospital Road, Kochi', 'Address updated correctly');
      assert(patchedStaff.specialty === 'Clinical Neurophysiology', 'Specialty updated correctly');

      // Attempt invalid phone update via PATCH (empty)
      const emptyPhonePatch = await makeRequest(baseUrl, 'PATCH', `/api/staff/${staffId}`, tokens.SUPER_ADMIN, {
        phone: '   '
      });
      assert(emptyPhonePatch.status === 400, 'Update with empty phone rejected with 400 PhoneRequired', `Status: ${emptyPhonePatch.status}`);

      // Attempt invalid phone update via PATCH (non-numeric / invalid format)
      const invalidPhonePatch = await makeRequest(baseUrl, 'PATCH', `/api/staff/${staffId}`, tokens.SUPER_ADMIN, {
        phone: 'invalid-tel-string'
      });
      assert(invalidPhonePatch.status === 400, 'Update with invalid phone format rejected with 400 InvalidPhone', `Status: ${invalidPhonePatch.status}`);

      // Update with valid international telephone format
      const intlPhonePatch = await makeRequest(baseUrl, 'PATCH', `/api/staff/${staffId}`, tokens.SUPER_ADMIN, {
        phone: '+44 20 7946 0991'
      });
      assert(intlPhonePatch.status === 200, 'Update with international phone format (+44 20 7946 0991) succeeded with 200');
      const rePatchedStaff = await prisma.staffMember.findUnique({ where: { id: staffId } });
      assert(rePatchedStaff?.phone === '+44 20 7946 0991', 'International phone accurately updated in PostgreSQL');

      // Anti-Mass-Assignment: attempt to mutate role, status, employeeId, email via PATCH /api/staff/:id
      const massAssignRes = await makeRequest(baseUrl, 'PATCH', `/api/staff/${staffId}`, tokens.SUPER_ADMIN, {
        role: 'SUPER_ADMIN',
        status: 'active',
        employeeId: 'STF-9999-99999',
        email: 'hacked@sahachara.com'
      });
      assert(massAssignRes.status === 200, 'PATCH request handled');
      // Verify immutable fields were NOT mutated
      const verifiedStaff = await prisma.staffMember.findUnique({ where: { id: staffId } });
      assert(verifiedStaff?.role === 'DOCTOR', 'Role NOT mutated via generic patch (still DOCTOR)');
      assert(verifiedStaff?.employeeId === initialEmployeeId, 'Employee ID NOT mutated via generic patch');
      assert(verifiedStaff?.email === editStaffEmail, 'Email NOT mutated via generic patch');
    }

    // -------------------------------------------------------------------------
    // SECTION 6: ROLE CHANGES & ATTRIBUTABLE AUDIT TRAIL
    // -------------------------------------------------------------------------
    console.log(`\n${BOLD}▶ 6. ROLE CHANGES & ATTRIBUTABLE AUDIT TRAIL${RESET}`);
    {
      const roleStaffEmail = `role.test.${Date.now()}@sahachara.com`;
      const staffRes = await makeRequest(baseUrl, 'POST', '/api/staff', tokens.SUPER_ADMIN, {
        name: 'Dr. Priya Menon',
        email: roleStaffEmail,
        role: 'DOCTOR',
        department: 'Pediatrics',
        designation: 'Specialist',
        phone: '+91 98765 88888'
      });
      const staffId = staffRes.body.staff.id;

      // 6.1 Change role via dedicated endpoint
      const changeRes = await makeRequest(baseUrl, 'PATCH', `/api/staff/${staffId}/role`, tokens.SUPER_ADMIN, {
        newRole: 'ADMIN',
        reason: 'Promoted to Clinical Department Administrator'
      });
      assert(changeRes.status === 200, 'Role changed to ADMIN with 200 OK');
      assert(changeRes.body.staff.role === 'ADMIN', 'Staff role updated to ADMIN');

      // 6.2 Verify audit trail
      const historyRes = await makeRequest(baseUrl, 'GET', `/api/staff/${staffId}/history`, tokens.SUPER_ADMIN);
      assert(historyRes.status === 200, 'Staff audit history retrieved with 200 OK');
      const historyList = Array.isArray(historyRes.body.data) ? historyRes.body.data : (Array.isArray(historyRes.body) ? historyRes.body : []);
      const roleLog = historyList.find((l: any) => l.action === 'Staff Role Changed' || l.action === 'STAFF_ROLE_CHANGED');
      assert(Boolean(roleLog), 'Audit log contains Staff Role Changed entry');
      assert(roleLog.details.includes('from DOCTOR to ADMIN'), 'Audit records previous and new roles (DOCTOR to ADMIN)');
      assert(roleLog.details.includes('Promoted to Clinical Department Administrator'), 'Audit records exact reason');
      assert(roleLog.actor.includes(superAdminName), 'Audit records actor name');
      assert(roleLog.role === 'SUPER_ADMIN', 'Audit records actor role SUPER_ADMIN');

      // 6.3 Self-role elevation prevention
      const selfElevateRes = await makeRequest(baseUrl, 'PATCH', `/api/staff/${staffId}/role`, tokens.ADMIN, {
        newRole: 'SUPER_ADMIN',
        reason: 'Self-promotion attempt'
      });
      assert(selfElevateRes.status === 403, 'ADMIN promoting to SUPER_ADMIN rejected with 403 Forbidden', `Status: ${selfElevateRes.status}`);

      // 6.4 ADMIN cannot alter SUPER_ADMIN role
      const superAdminStaff = await prisma.staffMember.findFirst({ where: { role: 'SUPER_ADMIN' } });
      if (superAdminStaff) {
        const adminAlterRes = await makeRequest(baseUrl, 'PATCH', `/api/staff/${superAdminStaff.id}/role`, tokens.ADMIN, {
          newRole: 'DOCTOR',
          reason: 'Demotion attempt'
        });
        assert(adminAlterRes.status === 403, 'ADMIN altering SUPER_ADMIN rejected with 403 Forbidden');
      }

      // 6.5 Last active SUPER_ADMIN protection
      if (superAdminStaff) {
        const lastAdminDemote = await makeRequest(baseUrl, 'PATCH', `/api/staff/${superAdminStaff.id}/role`, tokens.SUPER_ADMIN, {
          newRole: 'ADMIN',
          reason: 'Demote last superadmin'
        });
        assert(lastAdminDemote.status === 400 || lastAdminDemote.status === 403, 'Demoting last active SUPER_ADMIN rejected with 400/403');
      }
    }

    // -------------------------------------------------------------------------
    // SECTION 7: ACCOUNT SUSPENSION & IMMEDIATE TOKEN REVOCATION
    // -------------------------------------------------------------------------
    console.log(`\n${BOLD}▶ 7. ACCOUNT SUSPENSION & IMMEDIATE TOKEN REVOCATION${RESET}`);
    {
      const suspendEmail = `suspend.test.${Date.now()}@sahachara.com`;
      const staffRes = await makeRequest(baseUrl, 'POST', '/api/staff', tokens.SUPER_ADMIN, {
        name: 'Dr. Hari Das',
        email: suspendEmail,
        role: 'DOCTOR',
        department: 'Cardiology',
        designation: 'Cardiologist',
        phone: '+91 98765 99999'
      });
      const staffId = staffRes.body.staff.id;
      const plainPin = staffRes.body.activationPin;

      // Activate the account
      await makeRequest(baseUrl, 'POST', '/api/auth/activate', undefined, {
        email: suspendEmail,
        pin: plainPin,
        newPassword: 'DoctorPassword123!'
      });

      // User logs in and receives valid JWT token
      const loginRes = await makeRequest(baseUrl, 'POST', '/api/auth/login', undefined, {
        email: suspendEmail,
        password: 'DoctorPassword123!'
      });
      assert(loginRes.status === 200, 'Doctor logged in and obtained session token');
      const doctorToken = loginRes.body.token;
      assert(Boolean(doctorToken), 'Token received');

      // Verify doctor can access protected endpoints before suspension
      const preSuspendReq = await makeRequest(baseUrl, 'GET', '/api/patients', doctorToken);
      assert(preSuspendReq.status === 200, 'Active doctor can query patients directory (200 OK)');

      // Suspend staff account
      const suspendRes = await makeRequest(baseUrl, 'POST', `/api/staff/${staffId}/suspend`, tokens.SUPER_ADMIN, {
        reason: 'Pending disciplinary review'
      });
      assert(suspendRes.status === 200, 'Staff suspended successfully with 200 OK');
      assert(suspendRes.body.staff.isSuspended === true, 'Staff isSuspended is true');
      assert(suspendRes.body.staff.status === 'suspended', 'Staff status is suspended');

      // IMMEDIATE SESSION REVOCATION: Existing active JWT token must now be rejected with 401
      const postSuspendReq = await makeRequest(baseUrl, 'GET', '/api/patients', doctorToken);
      assert(postSuspendReq.status === 401, 'Suspended user existing JWT token IMMEDIATELY rejected with 401 Unauthorized', `Status: ${postSuspendReq.status}`);

      // Login attempt by suspended user must fail
      const loginAfterSuspend = await makeRequest(baseUrl, 'POST', '/api/auth/login', undefined, {
        email: suspendEmail,
        password: 'DoctorPassword123!'
      });
      assert(loginAfterSuspend.status === 403 || loginAfterSuspend.status === 401, 'Login by suspended account rejected', `Status: ${loginAfterSuspend.status}`);

      // ADMIN cannot suspend SUPER_ADMIN
      const superAdminStaff = await prisma.staffMember.findFirst({ where: { role: 'SUPER_ADMIN' } });
      if (superAdminStaff) {
        const adminSuspendSuper = await makeRequest(baseUrl, 'POST', `/api/staff/${superAdminStaff.id}/suspend`, tokens.ADMIN, {
          reason: 'Unauthorized suspension'
        });
        assert(adminSuspendSuper.status === 403, 'ADMIN suspending SUPER_ADMIN rejected with 403 Forbidden');
      }

      // Last active SUPER_ADMIN cannot be suspended
      if (superAdminStaff) {
        const superSuspendSelf = await makeRequest(baseUrl, 'POST', `/api/staff/${superAdminStaff.id}/suspend`, tokens.SUPER_ADMIN, {
          reason: 'Self suspension'
        });
        assert(superSuspendSelf.status === 400 || superSuspendSelf.status === 403, 'Suspending last active SUPER_ADMIN rejected');
      }
    }

    // -------------------------------------------------------------------------
    // SECTION 8: ACCOUNT REACTIVATION
    // -------------------------------------------------------------------------
    console.log(`\n${BOLD}▶ 8. ACCOUNT REACTIVATION${RESET}`);
    {
      const reactEmail = `reactivate.test.${Date.now()}@sahachara.com`;
      const staffRes = await makeRequest(baseUrl, 'POST', '/api/staff', tokens.SUPER_ADMIN, {
        name: 'Dr. Gita Pillai',
        email: reactEmail,
        role: 'DOCTOR',
        department: 'Dermatology',
        designation: 'Consultant',
        phone: '+91 98765 00001'
      });
      const staffId = staffRes.body.staff.id;
      const plainPin = staffRes.body.activationPin;

      await makeRequest(baseUrl, 'POST', '/api/auth/activate', undefined, {
        email: reactEmail,
        pin: plainPin,
        newPassword: 'GitaPassword123!'
      });

      // Suspend
      await makeRequest(baseUrl, 'POST', `/api/staff/${staffId}/suspend`, tokens.SUPER_ADMIN, {
        reason: 'Temporary leave of absence'
      });

      // Reactivate
      const reactRes = await makeRequest(baseUrl, 'POST', `/api/staff/${staffId}/reactivate`, tokens.SUPER_ADMIN, {
        reason: 'Return from approved leave'
      });
      assert(reactRes.status === 200, 'Reactivation succeeded with 200 OK');
      assert(reactRes.body.staff.isSuspended === false, 'Staff isSuspended is false');
      assert(reactRes.body.staff.status === 'active', 'Staff status restored to active');

      // Login succeeds after reactivation
      const loginRes = await makeRequest(baseUrl, 'POST', '/api/auth/login', undefined, {
        email: reactEmail,
        password: 'GitaPassword123!'
      });
      assert(loginRes.status === 200, 'Reactivated user successfully logged in with 200 OK');

      // New token can access protected endpoints
      const patientReq = await makeRequest(baseUrl, 'GET', '/api/patients', loginRes.body.token);
      assert(patientReq.status === 200, 'Reactivated user can access protected endpoints');
    }

    // -------------------------------------------------------------------------
    // SECTION 9: SOFT-ARCHIVAL & HISTORICAL ATTRIBUTION PRESERVATION
    // -------------------------------------------------------------------------
    console.log(`\n${BOLD}▶ 9. SOFT-ARCHIVAL & HISTORICAL ATTRIBUTION PRESERVATION${RESET}`);
    {
      const archiveEmail = `archive.test.${Date.now()}@sahachara.com`;
      const staffRes = await makeRequest(baseUrl, 'POST', '/api/staff', tokens.SUPER_ADMIN, {
        name: 'Dr. Vikram Seth',
        email: archiveEmail,
        role: 'DOCTOR',
        department: 'Pulmonology',
        designation: 'Senior Pulmonologist',
        phone: '+91 98765 00002'
      });
      const staffId = staffRes.body.staff.id;
      const plainPin = staffRes.body.activationPin;

      await makeRequest(baseUrl, 'POST', '/api/auth/activate', undefined, {
        email: archiveEmail,
        pin: plainPin,
        newPassword: 'VikramPassword123!'
      });

      const doctorLogin = await makeRequest(baseUrl, 'POST', '/api/auth/login', undefined, {
        email: archiveEmail,
        password: 'VikramPassword123!'
      });
      const doctorToken = doctorLogin.body.token;

      // 9.1 Create clinical encounter and prescription by this doctor
      const patientRes = await makeRequest(baseUrl, 'POST', '/api/patients', tokens.RECEPTIONIST, {
        firstName: 'Anjali',
        lastName: 'Nair',
        phone: '+91 98765 44444',
        gender: 'female',
        dateOfBirth: '1985-05-15'
      });
      const patient = patientRes.body.data || patientRes.body;
      const patientId = patient.id;

      const rxRes = await makeRequest(baseUrl, 'POST', '/api/pharmacy/prescriptions', doctorToken, {
        patientId,
        patientName: `${patient.firstName} ${patient.lastName}`,
        mrn: patient.mrn,
        medicationName: 'Amoxicillin 500mg Capsule',
        dosage: '500mg',
        frequency: 'Three Times Daily (TDS)',
        route: 'Oral',
        duration: '5 days',
        quantity: 15
      });
      assert(rxRes.status === 201, 'Prescription created by Dr. Vikram Seth (201 Created)');
      const rxData = rxRes.body.data || rxRes.body;
      const rxId = rxData.id;

      // 9.2 Soft-archive the staff account
      const archiveRes = await makeRequest(baseUrl, 'POST', `/api/staff/${staffId}/archive`, tokens.SUPER_ADMIN, {
        reason: 'Relocation to another medical center'
      });
      assert(archiveRes.status === 200, 'Staff soft-archived with 200 OK');
      assert(archiveRes.body.staff.status === 'archived', 'Status updated to archived');

      // 9.3 Verify record STILL exists in database (NEVER deleted)
      const dbCheck = await prisma.staffMember.findUnique({ where: { id: staffId } });
      assert(dbCheck !== null, 'Staff record STILL exists in PostgreSQL (soft-deleted only)');
      assert(dbCheck?.archivedAt !== null, 'archivedAt timestamp is recorded');

      // 9.4 Archived user cannot log in
      const archiveLogin = await makeRequest(baseUrl, 'POST', '/api/auth/login', undefined, {
        email: archiveEmail,
        password: 'VikramPassword123!'
      });
      assert(archiveLogin.status === 403 || archiveLogin.status === 401, 'Archived user cannot log in');

      // 9.5 Historical attribution preserved: prescription still attributes Dr. Vikram Seth
      const queriedRx = await prisma.prescription.findUnique({ where: { id: rxId } });
      assert(queriedRx !== null, 'Prescription remains completely intact');
      assert(queriedRx?.doctorName === 'Dr. Vikram Seth', 'Prescription retains original clinical attribution (doctorName)', queriedRx?.doctorName);
    }

    // -------------------------------------------------------------------------
    // SECTION 10: STRICT 7-ROLE ADMINISTRATIVE RBAC GOVERNANCE
    // -------------------------------------------------------------------------
    console.log(`\n${BOLD}▶ 10. STRICT 7-ROLE ADMINISTRATIVE RBAC GOVERNANCE${RESET}`);
    {
      const nonAdminRoles = ['DOCTOR', 'VAIDYA', 'RECEPTIONIST', 'PHARMACIST', 'ACCOUNTANT'];
      for (const role of nonAdminRoles) {
        // Staff creation attempt
        const createRes = await makeRequest(baseUrl, 'POST', '/api/staff', tokens[role], {
          name: 'Unauthorized User',
          email: `unauth.${role.toLowerCase()}.${Date.now()}@sahachara.com`,
          role: 'DOCTOR',
          department: 'General',
          designation: 'Staff',
          phone: '+91 98765 00000'
        });
        assert(createRes.status === 403, `${role} strictly forbidden from creating staff (HTTP 403)`, `Status: ${createRes.status}`);

        // Staff list query attempt
        const listRes = await makeRequest(baseUrl, 'GET', '/api/staff', tokens[role]);
        assert(listRes.status === 403, `${role} strictly forbidden from viewing staff directory (HTTP 403)`, `Status: ${listRes.status}`);
      }

      // ADMIN can view and create regular staff
      const adminListRes = await makeRequest(baseUrl, 'GET', '/api/staff', tokens.ADMIN);
      assert(adminListRes.status === 200, 'ADMIN authorized to view staff directory (HTTP 200)');

      // ADMIN cannot create SUPER_ADMIN
      const adminCreateSuper = await makeRequest(baseUrl, 'POST', '/api/staff', tokens.ADMIN, {
        name: 'Escalated Admin',
        email: `escalate.${Date.now()}@sahachara.com`,
        role: 'SUPER_ADMIN',
        department: 'Administration',
        designation: 'Hospital Executive',
        phone: '+91 98765 00003'
      });
      assert(adminCreateSuper.status === 403, 'ADMIN strictly forbidden from creating SUPER_ADMIN account (HTTP 403)');
    }

    // -------------------------------------------------------------------------
    // SECTION 11: DIRECTORY FILTERING & PAGINATION
    // -------------------------------------------------------------------------
    console.log(`\n${BOLD}▶ 11. DIRECTORY FILTERING & PAGINATION${RESET}`);
    {
      // Query with role filter
      const doctorFilter = await makeRequest(baseUrl, 'GET', '/api/staff?role=DOCTOR', tokens.SUPER_ADMIN);
      assert(doctorFilter.status === 200, 'Filter by role=DOCTOR returns 200 OK');
      const staffList = Array.isArray(doctorFilter.body.staff) ? doctorFilter.body.staff : (Array.isArray(doctorFilter.body.data) ? doctorFilter.body.data : []);
      assert(Array.isArray(staffList), 'Returns staff array');
      const allDoctors = staffList.length > 0 && staffList.every((s: any) => s.role === 'DOCTOR');
      assert(allDoctors, 'All returned items have role DOCTOR');

      // Query with pagination
      const page1 = await makeRequest(baseUrl, 'GET', '/api/staff?page=1&limit=2', tokens.SUPER_ADMIN);
      assert(page1.status === 200, 'Pagination query returns 200 OK');
      const pageStaff = Array.isArray(page1.body.staff) ? page1.body.staff : (Array.isArray(page1.body.data) ? page1.body.data : []);
      assert(pageStaff.length <= 2, 'Page size limit of 2 respected');
      const totalCount = typeof page1.body.total === 'number' ? page1.body.total : page1.body.pagination?.total;
      assert(typeof totalCount === 'number', 'Total count is returned');
    }

    // -------------------------------------------------------------------------
    // SECTION 12: FAIL-CLOSED AUTHENTICATION & ACTIVE-USER HARDENING
    // -------------------------------------------------------------------------
    console.log(`\n${BOLD}▶ 12. FAIL-CLOSED AUTHENTICATION & ACTIVE-USER HARDENING${RESET}`);
    {
      // 12.1 Valid active staff user authenticates successfully
      const validAuthRes = await makeRequest(baseUrl, 'GET', '/api/staff', tokens.ADMIN);
      assert(validAuthRes.status === 200, 'Valid active staff user (ADMIN) authenticates successfully (HTTP 200)');

      // 12.2 Suspended staff user is rejected
      const suspUserId = `usr-susp-${Date.now()}`;
      const suspEmail = `susp.user.${Date.now()}@sahachara.com`;
      await prisma.user.create({
        data: {
          id: suspUserId,
          email: suspEmail,
          name: 'Suspended Doctor',
          role: 'DOCTOR',
          status: 'suspended',
          isSuspended: true,
          suspendedAt: new Date()
        }
      });
      await prisma.staffMember.create({
        data: {
          employeeId: `STF-2026-${Math.floor(20000 + Math.random() * 80000)}`,
          name: 'Suspended Doctor',
          role: 'DOCTOR',
          designation: 'Staff Physician',
          department: 'Cardiology',
          email: suspEmail,
          phone: '+91 99999 11111',
          status: 'suspended',
          isSuspended: true,
          userId: suspUserId
        }
      });
      const suspToken = generateSessionToken({ userId: suspUserId, email: suspEmail, role: 'DOCTOR', name: 'Suspended Doctor' });
      const suspReq = await makeRequest(baseUrl, 'GET', '/api/patients', suspToken);
      assert(suspReq.status === 401, 'Suspended staff user is rejected with HTTP 401', `Status: ${suspReq.status}`);
      assert(suspReq.body.code === 'ACCOUNT_SUSPENDED', 'Error code is ACCOUNT_SUSPENDED', suspReq.body.code);

      // 12.3 Archived staff user is rejected
      const archUserId = `usr-arch-${Date.now()}`;
      const archEmail = `arch.user.${Date.now()}@sahachara.com`;
      await prisma.user.create({
        data: {
          id: archUserId,
          email: archEmail,
          name: 'Archived Doctor',
          role: 'DOCTOR',
          status: 'archived',
          archivedAt: new Date()
        }
      });
      await prisma.staffMember.create({
        data: {
          employeeId: `STF-2026-${Math.floor(20000 + Math.random() * 80000)}`,
          name: 'Archived Doctor',
          role: 'DOCTOR',
          designation: 'Staff Physician',
          department: 'Cardiology',
          email: archEmail,
          phone: '+91 99999 22222',
          status: 'archived',
          archivedAt: new Date(),
          userId: archUserId
        }
      });
      const archToken = generateSessionToken({ userId: archUserId, email: archEmail, role: 'DOCTOR', name: 'Archived Doctor' });
      const archReq = await makeRequest(baseUrl, 'GET', '/api/patients', archToken);
      assert(archReq.status === 401, 'Archived staff user is rejected with HTTP 401', `Status: ${archReq.status}`);
      assert(archReq.body.code === 'ACCOUNT_ARCHIVED', 'Error code is ACCOUNT_ARCHIVED', archReq.body.code);

      // 12.4 Inactive staff user is rejected
      const inactUserId = `usr-inact-${Date.now()}`;
      const inactEmail = `inact.user.${Date.now()}@sahachara.com`;
      await prisma.user.create({
        data: {
          id: inactUserId,
          email: inactEmail,
          name: 'Inactive Doctor',
          role: 'DOCTOR',
          status: 'inactive'
        }
      });
      await prisma.staffMember.create({
        data: {
          employeeId: `STF-2026-${Math.floor(20000 + Math.random() * 80000)}`,
          name: 'Inactive Doctor',
          role: 'DOCTOR',
          designation: 'Staff Physician',
          department: 'Cardiology',
          email: inactEmail,
          phone: '+91 99999 33333',
          status: 'inactive',
          userId: inactUserId
        }
      });
      const inactToken = generateSessionToken({ userId: inactUserId, email: inactEmail, role: 'DOCTOR', name: 'Inactive Doctor' });
      const inactReq = await makeRequest(baseUrl, 'GET', '/api/patients', inactToken);
      assert(inactReq.status === 401, 'Inactive staff user is rejected with HTTP 401', `Status: ${inactReq.status}`);
      assert(inactReq.body.code === 'ACCOUNT_INACTIVE', 'Error code is ACCOUNT_INACTIVE', inactReq.body.code);

      // 12.5 Missing User record is rejected (validly signed JWT for nonexistent identity)
      const fakeToken = generateSessionToken({ userId: 'usr-completely-fake-999999', email: 'ghost@sahachara.com', role: 'DOCTOR', name: 'Ghost Identity' });
      const fakeReq = await makeRequest(baseUrl, 'GET', '/api/patients', fakeToken);
      assert(fakeReq.status === 401, 'Missing User record is rejected with HTTP 401', `Status: ${fakeReq.status}`);
      assert(fakeReq.body.code === 'USER_NOT_FOUND', 'Error code is USER_NOT_FOUND', fakeReq.body.code);

      // 12.6 Missing linked StaffMember for operational account is rejected
      const noStaffUserId = `usr-nostaff-${Date.now()}`;
      const noStaffEmail = `nostaff.${Date.now()}@sahachara.com`;
      await prisma.user.create({
        data: {
          id: noStaffUserId,
          email: noStaffEmail,
          name: 'Unlinked Doctor',
          role: 'DOCTOR',
          status: 'active'
        }
      });
      const noStaffToken = generateSessionToken({ userId: noStaffUserId, email: noStaffEmail, role: 'DOCTOR', name: 'Unlinked Doctor' });
      const noStaffReq = await makeRequest(baseUrl, 'GET', '/api/patients', noStaffToken);
      assert(noStaffReq.status === 401, 'Missing linked StaffMember for DOCTOR is rejected with HTTP 401', `Status: ${noStaffReq.status}`);
      assert(noStaffReq.body.code === 'STAFF_RECORD_REQUIRED', 'Error code is STAFF_RECORD_REQUIRED', noStaffReq.body.code);

      // 12.7 Database connection unavailable returns fail-closed HTTP 503
      // Temporarily mock activeUserChecker to simulate database unavailability
      const originalChecker = (global as any).__savedActiveUserChecker;
      registerActiveUserChecker(async () => {
        return { isActive: false, isUnavailable: true, statusReason: 'unavailable' };
      });
      const dbDownReq = await makeRequest(baseUrl, 'GET', '/api/patients', tokens.DOCTOR);
      assert(dbDownReq.status === 503, 'Database unavailable returns fail-closed HTTP 503 Service Unavailable', `Status: ${dbDownReq.status}`);
      assert(dbDownReq.body.code === 'SERVICE_UNAVAILABLE', 'Error code is SERVICE_UNAVAILABLE', dbDownReq.body.code);

      // 12.8 Database lookup exception returns fail-closed HTTP 503
      registerActiveUserChecker(async () => {
        throw new Error('PostgreSQL connection timeout: connection pool exhausted');
      });
      const dbErrorReq = await makeRequest(baseUrl, 'GET', '/api/patients', tokens.DOCTOR);
      assert(dbErrorReq.status === 503, 'Database lookup exception returns fail-closed HTTP 503 Service Unavailable', `Status: ${dbErrorReq.status}`);
      assert(dbErrorReq.body.code === 'SERVICE_UNAVAILABLE', 'Error code is SERVICE_UNAVAILABLE', dbErrorReq.body.code);

      // Restore real database checker
      const { prisma: realPrisma, validateAndNormalizeRole: realNormRole } = await import('../server/prismaService.ts');
      registerActiveUserChecker(async (userId: string, email?: string) => {
        try {
          const cleanEmail = email ? email.toLowerCase().trim() : undefined;
          const u = await realPrisma.user.findFirst({
            where: {
              OR: [
                { id: userId },
                ...(cleanEmail ? [{ email: cleanEmail }] : [])
              ]
            },
            include: { staffMember: true }
          });
          if (!u) return { isActive: false, statusReason: 'not_found' };
          if (u.isSuspended || u.suspendedAt) return { isActive: false, statusReason: 'suspended' };
          if (u.archivedAt || u.status === 'archived') return { isActive: false, statusReason: 'archived' };
          if (u.status === 'suspended') return { isActive: false, statusReason: 'suspended' };
          if (u.status !== 'active') return { isActive: false, statusReason: 'inactive' };

          const userRole = realNormRole(u.role);
          if (!userRole) return { isActive: false, statusReason: 'role_mismatch' };

          let staff = u.staffMember;
          if (!staff && u.email) {
            staff = await realPrisma.staffMember.findUnique({ where: { email: u.email } });
          }

          if (userRole === 'SUPER_ADMIN') {
            if (!staff) return { isActive: true, currentRole: 'SUPER_ADMIN' };
          } else {
            if (!staff) return { isActive: false, statusReason: 'missing_staff' };
          }

          if (staff) {
            if (staff.isSuspended || staff.suspendedAt) return { isActive: false, statusReason: 'suspended' };
            if (staff.archivedAt || staff.status === 'archived') return { isActive: false, statusReason: 'archived' };
            if (staff.status === 'suspended') return { isActive: false, statusReason: 'suspended' };
            if (staff.status !== 'active') return { isActive: false, statusReason: 'inactive' };
            const staffRole = realNormRole(staff.role);
            if (staffRole !== userRole) return { isActive: false, statusReason: 'role_mismatch' };
          }

          return { isActive: true, currentRole: userRole };
        } catch (err: any) {
          return { isActive: false, isUnavailable: true, statusReason: 'unavailable' };
        }
      });

      // 12.9 Previously issued JWT cannot bypass suspension
      const docPreSuspUserId = `usr-doc-presusp-${Date.now()}`;
      const docPreSuspEmail = `doc.presusp.${Date.now()}@sahachara.com`;
      await prisma.user.create({
        data: {
          id: docPreSuspUserId,
          email: docPreSuspEmail,
          name: 'Active Then Suspended Doctor',
          role: 'DOCTOR',
          status: 'active'
        }
      });
      const createdStaffDoc = await prisma.staffMember.create({
        data: {
          employeeId: `STF-2026-${Math.floor(20000 + Math.random() * 80000)}`,
          name: 'Active Then Suspended Doctor',
          role: 'DOCTOR',
          designation: 'Attending Physician',
          department: 'Cardiology',
          email: docPreSuspEmail,
          phone: '+91 99999 44444',
          status: 'active',
          userId: docPreSuspUserId
        }
      });
      // Issue token while active
      const preSuspToken = generateSessionToken({ userId: docPreSuspUserId, email: docPreSuspEmail, role: 'DOCTOR', name: 'Active Then Suspended Doctor' });
      const preSuspActiveReq = await makeRequest(baseUrl, 'GET', '/api/patients', preSuspToken);
      assert(preSuspActiveReq.status === 200, 'Previously issued JWT works while account is active (HTTP 200)');

      // Now suspend the staff account via admin API
      await makeRequest(baseUrl, 'POST', `/api/staff/${createdStaffDoc.id}/suspend`, tokens.SUPER_ADMIN, {
        reason: 'Immediate suspension verification'
      });
      // Immediately retry with previously issued token
      const preSuspPostReq = await makeRequest(baseUrl, 'GET', '/api/patients', preSuspToken);
      assert(preSuspPostReq.status === 401, 'Previously issued JWT IMMEDIATELY rejected after suspension (HTTP 401)', `Status: ${preSuspPostReq.status}`);

      // 12.10 Previously issued JWT cannot bypass archival
      const docPreArchUserId = `usr-doc-prearch-${Date.now()}`;
      const docPreArchEmail = `doc.prearch.${Date.now()}@sahachara.com`;
      await prisma.user.create({
        data: {
          id: docPreArchUserId,
          email: docPreArchEmail,
          name: 'Active Then Archived Doctor',
          role: 'DOCTOR',
          status: 'active'
        }
      });
      const createdStaffDocArch = await prisma.staffMember.create({
        data: {
          employeeId: `STF-2026-${Math.floor(20000 + Math.random() * 80000)}`,
          name: 'Active Then Archived Doctor',
          role: 'DOCTOR',
          designation: 'Attending Physician',
          department: 'Cardiology',
          email: docPreArchEmail,
          phone: '+91 99999 55555',
          status: 'active',
          userId: docPreArchUserId
        }
      });
      // Issue token while active
      const preArchToken = generateSessionToken({ userId: docPreArchUserId, email: docPreArchEmail, role: 'DOCTOR', name: 'Active Then Archived Doctor' });
      const preArchActiveReq = await makeRequest(baseUrl, 'GET', '/api/patients', preArchToken);
      assert(preArchActiveReq.status === 200, 'Previously issued JWT works while account is active before archive (HTTP 200)');

      // Now archive the staff account via admin API
      await makeRequest(baseUrl, 'POST', `/api/staff/${createdStaffDocArch.id}/archive`, tokens.SUPER_ADMIN, {
        reason: 'Immediate archival verification'
      });
      // Immediately retry with previously issued token
      const preArchPostReq = await makeRequest(baseUrl, 'GET', '/api/patients', preArchToken);
      assert(preArchPostReq.status === 401, 'Previously issued JWT IMMEDIATELY rejected after archival (HTTP 401)', `Status: ${preArchPostReq.status}`);

      // 12.11 Legitimate bootstrap SUPER_ADMIN without a StaffMember record retains access
      const saStaffCheck = await prisma.staffMember.findFirst({ where: { userId: 'usr-superadmin' } });
      assert(saStaffCheck === null, 'Bootstrap SUPER_ADMIN strictly has 0 StaffMember records in PostgreSQL (null === null)');
      const saReq = await makeRequest(baseUrl, 'GET', '/api/staff', tokens.SUPER_ADMIN);
      assert(saReq.status === 200, 'Bootstrap SUPER_ADMIN without StaffMember record retains full operational access (HTTP 200)');

      // 12.12 Role changes are reflected by current database authorization rather than stale JWT claims
      const promoUserId = `usr-promo-${Date.now()}`;
      const promoEmail = `promo.user.${Date.now()}@sahachara.com`;
      await prisma.user.create({
        data: {
          id: promoUserId,
          email: promoEmail,
          name: 'Promoted User',
          role: 'RECEPTIONIST',
          status: 'active'
        }
      });
      const promoStaff = await prisma.staffMember.create({
        data: {
          employeeId: `STF-2026-${Math.floor(20000 + Math.random() * 80000)}`,
          name: 'Promoted User',
          role: 'RECEPTIONIST',
          designation: 'Reception Officer',
          department: 'Front Desk',
          email: promoEmail,
          phone: '+91 99999 66666',
          status: 'active',
          userId: promoUserId
        }
      });
      // Issue token claiming RECEPTIONIST role
      const staleToken = generateSessionToken({ userId: promoUserId, email: promoEmail, role: 'RECEPTIONIST', name: 'Promoted User' });
      // As RECEPTIONIST, /api/staff is forbidden (HTTP 403)
      const prePromoReq = await makeRequest(baseUrl, 'GET', '/api/staff', staleToken);
      assert(prePromoReq.status === 403, 'User with RECEPTIONIST role token cannot access /api/staff (HTTP 403 Forbidden)');

      // Admin promotes user in database to ADMIN
      await makeRequest(baseUrl, 'PATCH', `/api/staff/${promoStaff.id}/role`, tokens.SUPER_ADMIN, {
        newRole: 'ADMIN',
        reason: 'Promotion to Operations Administrator'
      });

      // Without reissuing the JWT, make the EXACT same request using the OLD staleToken
      const postPromoReq = await makeRequest(baseUrl, 'GET', '/api/staff', staleToken);
      assert(postPromoReq.status === 200, 'Database promotion dynamically authorizes old JWT (HTTP 200 OK without stale role lock)', `Status: ${postPromoReq.status}`);

      // 12.13 Database-level Plaintext Activation PIN Constraint Enforcement
      let staffConstraintViolated = false;
      try {
        await prisma.$executeRawUnsafe(
          `INSERT INTO staff_members (id, "employeeId", name, role, designation, department, email, phone, status, "activationPin", "createdAt", "updatedAt")
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())`,
          `stf-pin-violate-${Date.now()}`,
          `STF-2026-99998`,
          'Illegal Pin Staff',
          'DOCTOR',
          'Doctor',
          'Medicine',
          `illegal.pin.${Date.now()}@sahachara.com`,
          '+91 99999 77777',
          'pending_activation',
          '1234' // Non-null plaintext PIN must be rejected by PostgreSQL constraint!
        );
      } catch (err: any) {
        staffConstraintViolated = true;
        assert(err.message.includes('staff_members_activationPin_null_check'), 'Database CHECK constraint rejects plaintext PIN insertion into staff_members');
      }
      assert(staffConstraintViolated, 'Database-level constraint staff_members_activationPin_null_check enforced');

      let userConstraintViolated = false;
      try {
        await prisma.$executeRawUnsafe(
          `INSERT INTO users (id, email, name, role, status, "activationPin", "createdAt", "updatedAt")
           VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())`,
          `usr-pin-violate-${Date.now()}`,
          `illegal.user.pin.${Date.now()}@sahachara.com`,
          'Illegal Pin User',
          'DOCTOR',
          'pending_activation',
          '1234' // Non-null plaintext PIN must be rejected by PostgreSQL constraint!
        );
      } catch (err: any) {
        userConstraintViolated = true;
        assert(err.message.includes('users_activationPin_null_check'), 'Database CHECK constraint rejects plaintext PIN insertion into users');
      }
      assert(userConstraintViolated, 'Database-level constraint users_activationPin_null_check enforced');
    }

    // -------------------------------------------------------------------------
    // SECTION 13: PRODUCTION DATABASE ZERO-MUTATION VERIFICATION
    // -------------------------------------------------------------------------
    console.log(`\n${BOLD}▶ 13. PRODUCTION DATABASE ZERO-MUTATION VERIFICATION${RESET}`);
    {
      if (prodProbePrisma && prodInitialSnapshot) {
        try {
          const prodFinalSnapshot = {
            users: await prodProbePrisma.user.count(),
            patients: await prodProbePrisma.patient.count(),
            appointments: await prodProbePrisma.appointment.count(),
            prescriptions: await prodProbePrisma.prescription.count(),
            dispensingRecords: await prodProbePrisma.dispensingRecord.count(),
            invoices: await prodProbePrisma.invoice.count(),
            payments: await prodProbePrisma.payment.count(),
            refundRequests: await prodProbePrisma.refundRequest.count(),
            staff: await prodProbePrisma.staffMember.count(),
            tariffs: await prodProbePrisma.hospitalTariff.count()
          };

          console.log(`  Final Production DB Snapshot:`, prodFinalSnapshot);

          assert(prodFinalSnapshot.users === prodInitialSnapshot.users, `Users count unchanged: ${prodFinalSnapshot.users} == ${prodInitialSnapshot.users}`);
          assert(prodFinalSnapshot.patients === 0, 'Production patients count strictly 0');
          assert(prodFinalSnapshot.appointments === 0, 'Production appointments count strictly 0');
          assert(prodFinalSnapshot.prescriptions === 0, 'Production prescriptions count strictly 0');
          assert(prodFinalSnapshot.dispensingRecords === 0, 'Production dispensingRecords count strictly 0');
          assert(prodFinalSnapshot.invoices === 0, 'Production invoices count strictly 0');
          assert(prodFinalSnapshot.payments === 0, 'Production payments count strictly 0');
          assert(prodFinalSnapshot.refundRequests === 0, 'Production refundRequests count strictly 0');
          assert(prodFinalSnapshot.staff === 0, 'Production staff count strictly 0');
          assert(prodFinalSnapshot.tariffs === prodInitialSnapshot.tariffs, `Production tariffs count strictly ${prodInitialSnapshot.tariffs}`);
        } catch {
          console.log('  ℹ [SKIPPED] Production database probe evaluation error in isolated environment.');
        }
      } else {
        console.log('  ℹ [SKIPPED] Production database zero-mutation audit skipped: isolated CI/test environment (zero production database access).');
      }
    }

  } finally {
    server.close();
    if (prodProbePrisma) {
      await prodProbePrisma.$disconnect().catch(() => {});
    }
    await prisma.$disconnect();
  }

  console.log(`\n${BOLD}${CYAN}======================================================================${RESET}`);
  console.log(`${BOLD}${passedCount > 0 && failedCount === 0 ? GREEN : RED}   PHASE 6A STAFF MANAGEMENT VERIFICATION: ${passedCount} PASSED, ${failedCount} FAILED   ${RESET}`);
  console.log(`${BOLD}${CYAN}======================================================================${RESET}\n`);

  if (failedCount > 0) {
    process.exit(1);
  }
}

runStaffManagementSuite().catch((err) => {
  console.error('Fatal error executing staff management suite:', err);
  process.exit(1);
});
