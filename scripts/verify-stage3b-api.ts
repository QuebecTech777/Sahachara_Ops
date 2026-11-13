import express from 'express';
import http from 'http';
import { PrismaClient } from '@prisma/client';

// ---------------------------------------------------------------------------
// TEST DATABASE ISOLATION GUARD
// ---------------------------------------------------------------------------
const PROD_DB_URL = 'postgresql://highflyer@localhost:5432/sahachara_ops_db';
const TEST_DB_URL = process.env.TEST_DATABASE_URL || 'postgresql://highflyer@localhost:5432/sahachara_ops_test_db';

if (process.env.DATABASE_URL?.includes('sahachara_ops_db') && process.env.TEST_DATABASE_URL?.includes('sahachara_ops_db')) {
  console.error('\nFATAL SECURITY VIOLATION: Automated tests must NOT run against the production database (sahachara_ops_db)!');
  process.exit(1);
}

process.env.DATABASE_URL = TEST_DB_URL;
process.env.ENABLE_TEST_ACCOUNTS = 'true';
process.env.NODE_ENV = 'test';

import { apiRouter } from '../server/routes.ts';
import {
  prisma,
  checkPrismaConnection,
  ensureDefaultDatabaseUsers,
  dbCreateStaffMember,
  dbGetAuditLogs,
  isPrismaConnected
} from '../server/prismaService.ts';
import { generateSessionToken, registerActiveUserChecker } from '../server/rbacMiddleware.ts';
import { DepartmentDiscipline } from '@prisma/client';

const prodProbePrisma = new PrismaClient({
  datasources: { db: { url: PROD_DB_URL } }
});

async function getProductionDbStats() {
  const [users, patients, appointments, prescriptions, dispensingRecords, invoices, payments, refundRequests, staffMembers, tariffs] = await Promise.all([
    prodProbePrisma.user.count(),
    prodProbePrisma.patient.count(),
    prodProbePrisma.appointment.count(),
    prodProbePrisma.prescription.count(),
    prodProbePrisma.dispensingRecord.count(),
    prodProbePrisma.invoice.count(),
    prodProbePrisma.payment.count(),
    prodProbePrisma.refundRequest.count(),
    prodProbePrisma.staffMember.count(),
    prodProbePrisma.hospitalTariff.count()
  ]);
  return { users, patients, appointments, prescriptions, dispensingRecords, invoices, payments, refundRequests, staffMembers, tariffs };
}

let passCount = 0;
let failCount = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`  ✓ PASS ${testName}`);
    passCount++;
  } else {
    console.error(`  ✗ FAIL ${testName} - ${detail || 'Assertion failed'}`);
    failCount++;
  }
}

async function runStage3bVerification() {
  console.log('\n======================================================================');
  console.log('   SAHACHARA OPS — PHASE 6B STAGE 3B: REST API & RBAC TEST SUITE      ');
  console.log('======================================================================\n');

  const isConnected = await checkPrismaConnection();
  if (!isConnected) {
    console.error('FATAL: Database connection failed.');
    process.exit(1);
  }

  await ensureDefaultDatabaseUsers();

  const prodPre = await getProductionDbStats();
  console.log('✓ Isolated Test Database Connected:', TEST_DB_URL.split('/').pop());
  console.log('✓ Production Database Pre-Test State Snapshot:', prodPre);

  // Spin up test server
  const app = express();
  app.use(express.json());
  app.use('/api', apiRouter);

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as any).port;
  const baseUrl = `http://127.0.0.1:${port}/api`;

  // Tokens for 7 standard test users
  const tokens = {
    SUPER_ADMIN: generateSessionToken({ userId: 'usr-superadmin', email: 'alexander.wright@sahachara.com', role: 'SUPER_ADMIN', name: 'Dr. Alexander Wright' }),
    ADMIN: generateSessionToken({ userId: 'usr-admin', email: 'admin.ops@sahachara.com', role: 'ADMIN', name: 'Marcus Sterling' }),
    DOCTOR: generateSessionToken({ userId: 'usr-doc', email: 'robert.rivera@sahachara.com', role: 'DOCTOR', name: 'Dr. Robert Rivera' }),
    VAIDYA: generateSessionToken({ userId: 'usr-vaidya', email: 'sarah.chen@sahachara.com', role: 'VAIDYA', name: 'Dr. Sarah Chen' }),
    RECEPTIONIST: generateSessionToken({ userId: 'usr-reception', email: 'receptionist@sahachara.com', role: 'RECEPTIONIST', name: 'Kavita Sharma' }),
    PHARMACIST: generateSessionToken({ userId: 'usr-pharma', email: 'pharmacist@sahachara.com', role: 'PHARMACIST', name: 'Rajesh Nair' }),
    ACCOUNTANT: generateSessionToken({ userId: 'usr-accountant', email: 'accountant@sahachara.com', role: 'ACCOUNTANT', name: 'Anand Pillai' })
  };

  const allRoles = ['SUPER_ADMIN', 'ADMIN', 'DOCTOR', 'VAIDYA', 'RECEPTIONIST', 'PHARMACIST', 'ACCOUNTANT'] as const;

  // Helper fetcher
  async function api(method: string, path: string, role?: keyof typeof tokens, body?: any, extraHeaders?: Record<string, string>) {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...extraHeaders
    };
    if (role && tokens[role]) {
      headers['Authorization'] = `Bearer ${tokens[role]}`;
    }
    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined
    });
    const json = await res.json().catch(() => ({}));
    return { status: res.status, ok: res.ok, body: json };
  }

  const timestamp = Date.now();

  // ============================================================================
  // 1. AUTHENTICATION & SPOOFING REJECTION
  // ============================================================================
  console.log('\n▶ 1. AUTHENTICATION & ANTI-SPOOFING VERIFICATION');

  const unauthProfile = await api('GET', '/hospital/profile');
  assert(unauthProfile.status === 401, 'Unauthenticated GET /api/hospital/profile rejected with HTTP 401');

  const unauthDepts = await api('GET', '/departments');
  assert(unauthDepts.status === 401, 'Unauthenticated GET /api/departments rejected with HTTP 401');

  const unauthStaffAsg = await api('GET', '/staff/stf-placeholder/departments');
  assert(unauthStaffAsg.status === 401, 'Unauthenticated GET /api/staff/:id/departments rejected with HTTP 401');

  // Client-supplied role header cannot spoof SUPER_ADMIN
  const spoofHeader = await api('PUT', '/hospital/profile', 'DOCTOR', { version: 1, displayName: 'Spoofed' }, { 'x-user-role': 'SUPER_ADMIN' });
  assert(spoofHeader.status === 403, 'Client-supplied x-user-role header CANNOT override database token role (HTTP 403)');

  // Tampered token rejected
  const tamperedRes = await fetch(`${baseUrl}/hospital/profile`, {
    headers: { 'Authorization': 'Bearer sah_tampered.jwt.payload' }
  });
  assert(tamperedRes.status === 401, 'Tampered Bearer token rejected with HTTP 401');

  // Helper to restore authoritative active-user checker
  const restoreAuthoritativeChecker = () => {
    registerActiveUserChecker(async (userId: string, email?: string) => {
      if (!isPrismaConnected) {
        return { isActive: false, isUnavailable: true, statusReason: 'unavailable' };
      }
      try {
        const cleanEmail = email ? email.toLowerCase().trim() : undefined;
        const u = await prisma.user.findFirst({
          where: {
            OR: [
              { id: userId },
              ...(cleanEmail ? [{ email: cleanEmail }] : [])
            ]
          },
          include: { staffMember: true }
        });
        if (!u) return { isActive: false, statusReason: 'not_found' };
        if (u.isSuspended || u.suspendedAt || u.status === 'suspended') return { isActive: false, statusReason: 'suspended' };
        if (u.archivedAt || u.status === 'archived') return { isActive: false, statusReason: 'archived' };
        if (u.status !== 'active') return { isActive: false, statusReason: 'inactive' };
        if (u.role !== 'SUPER_ADMIN') {
          if (!u.staffMember) return { isActive: false, statusReason: 'missing_staff' };
          if (u.staffMember.isSuspended || u.staffMember.status === 'suspended') return { isActive: false, statusReason: 'suspended' };
          if (u.staffMember.archivedAt || u.staffMember.status === 'archived') return { isActive: false, statusReason: 'archived' };
          if (u.staffMember.role !== u.role) return { isActive: false, statusReason: 'role_mismatch' };
        }
        return { isActive: true, currentRole: u.role as any };
      } catch {
        return { isActive: false, isUnavailable: true, statusReason: 'unavailable' };
      }
    });
  };

  // 1.2 Authentication & Role Lookup Dependency Failure (Fail-Closed Enforcement)
  console.log('\n▶ 1.2 AUTHENTICATION DEPENDENCY FAILURE (FAIL-CLOSED VERIFICATION)');

  // Simulate active-user/role lookup database exception (e.g. pool exhaustion, timeout)
  registerActiveUserChecker(async () => {
    throw new Error('PostgreSQL connection timeout: connection pool exhausted during authentication lookup');
  });

  // Verify all 10 protected Stage 3B mutation endpoints fail closed with HTTP 503 on database exception
  const failDbDeptCreate = await api('POST', '/departments', 'ADMIN', { code: 'FAILDEP', name: 'Fail Dept' });
  assert(failDbDeptCreate.status === 503, 'Database lookup exception: POST /departments fails closed with HTTP 503');
  assert(failDbDeptCreate.body.code === 'SERVICE_UNAVAILABLE', 'Error code is SERVICE_UNAVAILABLE on database exception');
  assert(!failDbDeptCreate.body.stack && !failDbDeptCreate.body.message?.includes('PostgreSQL'), 'No raw DB error or stack trace exposed');

  const failDbProfileUpdate = await api('PUT', '/hospital/profile', 'SUPER_ADMIN', { displayName: 'Hacked', version: 1 });
  assert(failDbProfileUpdate.status === 503, 'Database lookup exception: PUT /hospital/profile fails closed with HTTP 503');
  assert(failDbProfileUpdate.body.code === 'SERVICE_UNAVAILABLE', 'Error code is SERVICE_UNAVAILABLE on profile update');
  assert(!failDbProfileUpdate.body.stack && !failDbProfileUpdate.body.message?.includes('PostgreSQL'), 'No raw DB error or stack trace exposed');

  const failDbStaffAssign = await api('POST', '/staff/stf-placeholder/departments', 'ADMIN', { departmentId: 'dept-fake' });
  assert(failDbStaffAssign.status === 503, 'Database lookup exception: POST /staff/:id/departments fails closed with HTTP 503');
  assert(failDbStaffAssign.body.code === 'SERVICE_UNAVAILABLE', 'Error code is SERVICE_UNAVAILABLE on staff assign');

  const failDbPrimaryAssign = await api('POST', '/staff/stf-placeholder/departments/primary', 'ADMIN', { departmentId: 'dept-fake' });
  assert(failDbPrimaryAssign.status === 503, 'Database lookup exception: POST /staff/:id/departments/primary fails closed with HTTP 503');
  assert(failDbPrimaryAssign.body.code === 'SERVICE_UNAVAILABLE', 'Error code is SERVICE_UNAVAILABLE on primary assign');

  const failDbDeactivate = await api('POST', '/departments/dept-fake/deactivate', 'ADMIN', { reason: 'Deactivate test' });
  assert(failDbDeactivate.status === 503, 'Database lookup exception: POST /departments/:id/deactivate fails closed with HTTP 503');
  assert(failDbDeactivate.body.code === 'SERVICE_UNAVAILABLE', 'Error code is SERVICE_UNAVAILABLE on department deactivate');

  const failDbRevoke = await api('POST', '/staff/stf-placeholder/departments/asg-fake/revoke', 'ADMIN', { reason: 'Revoke test' });
  assert(failDbRevoke.status === 503, 'Database lookup exception: POST /staff/:id/departments/:aid/revoke fails closed with HTTP 503');
  assert(failDbRevoke.body.code === 'SERVICE_UNAVAILABLE', 'Error code is SERVICE_UNAVAILABLE on assignment revoke');

  // Four additional mutation routes verified under database exception
  const failDbDeptPatch = await api('PATCH', '/departments/dept-fake', 'ADMIN', { description: 'Hacked Patch' });
  assert(failDbDeptPatch.status === 503, 'Database lookup exception: PATCH /departments/:id fails closed with HTTP 503');
  assert(failDbDeptPatch.body.code === 'SERVICE_UNAVAILABLE', 'Error code is SERVICE_UNAVAILABLE on PATCH department');
  assert(!failDbDeptPatch.body.stack && !failDbDeptPatch.body.message?.includes('PostgreSQL'), 'No raw DB error or stack trace exposed');

  const failDbDeptActivate = await api('POST', '/departments/dept-fake/activate', 'ADMIN');
  assert(failDbDeptActivate.status === 503, 'Database lookup exception: POST /departments/:id/activate fails closed with HTTP 503');
  assert(failDbDeptActivate.body.code === 'SERVICE_UNAVAILABLE', 'Error code is SERVICE_UNAVAILABLE on POST department activate');
  assert(!failDbDeptActivate.body.stack && !failDbDeptActivate.body.message?.includes('PostgreSQL'), 'No raw DB error or stack trace exposed');

  const failDbStaffComplete = await api('POST', '/staff/stf-placeholder/departments/asg-fake/complete', 'ADMIN', { reason: 'Completion test' });
  assert(failDbStaffComplete.status === 503, 'Database lookup exception: POST /staff/:staffId/departments/:assignmentId/complete fails closed with HTTP 503');
  assert(failDbStaffComplete.body.code === 'SERVICE_UNAVAILABLE', 'Error code is SERVICE_UNAVAILABLE on POST assignment complete');
  assert(!failDbStaffComplete.body.stack && !failDbStaffComplete.body.message?.includes('PostgreSQL'), 'No raw DB error or stack trace exposed');

  const failDbStaffTransfer = await api('POST', '/staff/stf-placeholder/departments/asg-fake/transfer', 'ADMIN', { newDepartmentId: 'dept-target', reason: 'Transfer test' });
  assert(failDbStaffTransfer.status === 503, 'Database lookup exception: POST /staff/:staffId/departments/:assignmentId/transfer fails closed with HTTP 503');
  assert(failDbStaffTransfer.body.code === 'SERVICE_UNAVAILABLE', 'Error code is SERVICE_UNAVAILABLE on POST assignment transfer');
  assert(!failDbStaffTransfer.body.stack && !failDbStaffTransfer.body.message?.includes('PostgreSQL'), 'No raw DB error or stack trace exposed');

  // Simulate database unavailable status return
  registerActiveUserChecker(async () => {
    return { isActive: false, isUnavailable: true, statusReason: 'unavailable' };
  });

  const failUnavailDeptCreate = await api('POST', '/departments', 'ADMIN', { code: 'FAILDEP2', name: 'Fail Dept 2' });
  assert(failUnavailDeptCreate.status === 503, 'Database unavailable: POST /departments fails closed with HTTP 503');
  assert(failUnavailDeptCreate.body.code === 'SERVICE_UNAVAILABLE', 'Error code is SERVICE_UNAVAILABLE on database unavailable');

  const failUnavailProfileUpdate = await api('PUT', '/hospital/profile', 'SUPER_ADMIN', { displayName: 'Hacked 2', version: 1 });
  assert(failUnavailProfileUpdate.status === 503, 'Database unavailable: PUT /hospital/profile fails closed with HTTP 503');

  const failUnavailDeptPatch = await api('PATCH', '/departments/dept-fake', 'ADMIN', { description: 'Hacked Patch 2' });
  assert(failUnavailDeptPatch.status === 503, 'Database unavailable: PATCH /departments/:id fails closed with HTTP 503');

  const failUnavailDeptActivate = await api('POST', '/departments/dept-fake/activate', 'ADMIN');
  assert(failUnavailDeptActivate.status === 503, 'Database unavailable: POST /departments/:id/activate fails closed with HTTP 503');

  const failUnavailStaffComplete = await api('POST', '/staff/stf-placeholder/departments/asg-fake/complete', 'ADMIN', { reason: 'Completion test 2' });
  assert(failUnavailStaffComplete.status === 503, 'Database unavailable: POST /staff/:staffId/departments/:assignmentId/complete fails closed with HTTP 503');

  const failUnavailStaffTransfer = await api('POST', '/staff/stf-placeholder/departments/asg-fake/transfer', 'ADMIN', { newDepartmentId: 'dept-target', reason: 'Transfer test 2' });
  assert(failUnavailStaffTransfer.status === 503, 'Database unavailable: POST /staff/:staffId/departments/:assignmentId/transfer fails closed with HTTP 503');

  // Restore authoritative active-user checker
  restoreAuthoritativeChecker();

  // ============================================================================
  // 2. HOSPITAL PROFILE RBAC & CONCURRENCY
  // ============================================================================
  console.log('\n▶ 2. HOSPITAL PROFILE ENDPOINTS & SEVEN-ROLE RBAC');

  // 2.1 Read permissions across all 7 roles
  for (const role of allRoles) {
    const res = await api('GET', '/hospital/profile', role);
    assert(res.status === 200, `Role ${role} authorized to read hospital profile (HTTP 200)`);
    assert(res.body.data.code === 'SAH', `Role ${role} receives correct hospital code`);
  }

  // 2.2 Update permissions: ONLY SUPER_ADMIN
  const readCurrent = await api('GET', '/hospital/profile', 'SUPER_ADMIN');
  const currentVersion = readCurrent.body.data.version;

  // Non-SUPER_ADMIN roles MUST receive 403
  for (const role of allRoles) {
    if (role === 'SUPER_ADMIN') continue;
    const res = await api('PUT', '/hospital/profile', role, {
      displayName: 'Unauthorized Name',
      version: currentVersion
    });
    assert(res.status === 403, `Role ${role} forbidden from updating hospital profile (HTTP 403)`);
  }

  // Missing version rejected with 400
  const noVersion = await api('PUT', '/hospital/profile', 'SUPER_ADMIN', { displayName: 'No Version' });
  assert(noVersion.status === 400 && noVersion.body.code === 'VERSION_REQUIRED', 'Missing version rejected with HTTP 400 VERSION_REQUIRED');

  // Stale version rejected with 409 CONCURRENT_MODIFICATION
  const staleUpdate = await api('PUT', '/hospital/profile', 'SUPER_ADMIN', {
    displayName: 'Stale Name',
    version: currentVersion - 1
  });
  assert(staleUpdate.status === 409 && staleUpdate.body.code === 'CONCURRENT_MODIFICATION', 'Stale version rejected with HTTP 409 CONCURRENT_MODIFICATION');

  // Valid SUPER_ADMIN update
  const validProfileUpdate = await api('PUT', '/hospital/profile', 'SUPER_ADMIN', {
    displayName: 'Sahachara Ayurveda Yoga Sanctuary',
    phone: '+91 486 422 3490',
    version: currentVersion
  });
  assert(validProfileUpdate.status === 200, 'SUPER_ADMIN successfully updated hospital profile (HTTP 200)');
  assert(validProfileUpdate.body.data.displayName === 'Sahachara Ayurveda Yoga Sanctuary', 'Updated display name reflected in response');
  assert(validProfileUpdate.body.data.version === currentVersion + 1, 'Version incremented in response');

  // Restore profile display name
  await api('PUT', '/hospital/profile', 'SUPER_ADMIN', {
    displayName: 'Sahachara Ayurveda',
    phone: '+91 486 422 3400',
    version: validProfileUpdate.body.data.version
  });

  // ============================================================================
  // 3. DEPARTMENT MASTER ENDPOINTS & SEVEN-ROLE RBAC
  // ============================================================================
  console.log('\n▶ 3. DEPARTMENT MASTER ENDPOINTS & SEVEN-ROLE RBAC');

  const deptCode = `DEP${String(timestamp).slice(-4)}`;
  const deptName = `API Test Dept ${timestamp}`;

  // 3.1 Department creation RBAC: SUPER_ADMIN and ADMIN only
  for (const role of ['DOCTOR', 'VAIDYA', 'RECEPTIONIST', 'PHARMACIST', 'ACCOUNTANT'] as const) {
    const res = await api('POST', '/departments', role, { code: 'FAIL', name: 'Fail' });
    assert(res.status === 403, `Role ${role} strictly forbidden from creating departments (HTTP 403)`);
  }

  // 3.2 Validation on creation
  const badCode = await api('POST', '/departments', 'ADMIN', { code: 'bad_code', name: deptName });
  assert(badCode.status === 400 && badCode.body.code === 'INVALID_DEPARTMENT_CODE', 'Invalid department code rejected with HTTP 400 INVALID_DEPARTMENT_CODE');

  const badDiscipline = await api('POST', '/departments', 'ADMIN', { code: deptCode, name: deptName, discipline: 'NON_EXISTENT' });
  assert(badDiscipline.status === 400 && badDiscipline.body.code === 'INVALID_DISCIPLINE', 'Invalid discipline rejected with HTTP 400 INVALID_DISCIPLINE');

  // 3.2.1 Deterministic validation of all 4 permitted disciplines
  const permittedDisciplines: DepartmentDiscipline[] = ['AYURVEDA', 'MODERN_MEDICINE', 'OPERATIONAL', 'ALLIED'];
  const permittedDeptIds: string[] = [];

  for (const disc of permittedDisciplines) {
    const pCode = `D${disc.slice(0, 2)}${String(timestamp).slice(-3)}`;
    const pName = `Dept Discipline ${disc} ${timestamp}`;
    const pRes = await api('POST', '/departments', 'ADMIN', {
      code: pCode,
      name: pName,
      discipline: disc
    });
    assert(pRes.status === 201, `Permitted discipline ${disc} accepted by API validation (HTTP 201)`);
    assert(pRes.body.data.discipline === disc, `Permitted discipline ${disc} returned in API response`);
    const persisted = await prisma.department.findUnique({ where: { id: pRes.body.data.id } });
    assert(persisted?.discipline === disc, `Permitted discipline ${disc} successfully persisted in PostgreSQL`);
    permittedDeptIds.push(pRes.body.data.id);
  }

  // 3.2.2 Rejection of unsupported discipline values (prevent invalid enum values reaching Prisma)
  const unsupportedDisciplines = [
    'ALLOPATHY',
    'INTEGRATIVE',
    'THERAPY_WELLNESS',
    'DIAGNOSTIC_SUPPORT',
    'ADMINISTRATIVE',
    'NURSING',
    'SURGERY'
  ];

  for (const unsupp of unsupportedDisciplines) {
    const badRes = await api('POST', '/departments', 'ADMIN', {
      code: `UNS${String(timestamp).slice(-3)}`,
      name: `Unsupported ${unsupp} ${timestamp}`,
      discipline: unsupp
    });
    assert(badRes.status === 400 && badRes.body.code === 'INVALID_DISCIPLINE', `Unsupported discipline "${unsupp}" rejected with HTTP 400 INVALID_DISCIPLINE`);
    assert(badRes.body.message.includes('AYURVEDA, MODERN_MEDICINE, OPERATIONAL, ALLIED'), `Error message strictly cites the 4 permitted disciplines for "${unsupp}"`);
  }

  // 3.3 Valid creation by ADMIN
  const createRes = await api('POST', '/departments', 'ADMIN', {
    code: deptCode,
    name: deptName,
    discipline: 'MODERN_MEDICINE',
    description: 'Department for API Testing'
  });
  assert(createRes.status === 201, 'ADMIN successfully created department (HTTP 201)');
  const createdDeptId = createRes.body.data.id;
  assert(createRes.body.data.code === deptCode, 'Returned created department code');

  // Duplicate code conflict
  const dupCode = await api('POST', '/departments', 'SUPER_ADMIN', { code: deptCode, name: `Other ${timestamp}` });
  assert(dupCode.status === 409 && dupCode.body.code === 'DUPLICATE_DEPARTMENT_CODE', 'Duplicate department code rejected with HTTP 409');

  // Case-insensitive duplicate name conflict
  const dupName = await api('POST', '/departments', 'SUPER_ADMIN', {
    code: `ALT${String(timestamp).slice(-4)}`,
    name: deptName.toLowerCase()
  });
  assert(dupName.status === 409 && dupName.body.code === 'DUPLICATE_DEPARTMENT_NAME', 'Case-insensitive duplicate department name rejected with HTTP 409');

  // 3.4 Read departments across all 7 roles
  for (const role of allRoles) {
    const listRes = await api('GET', '/departments', role);
    assert(listRes.status === 200, `Role ${role} authorized to list departments (HTTP 200)`);
    assert(Array.isArray(listRes.body.data), `Role ${role} receives departments array`);

    const singleRes = await api('GET', `/departments/${createdDeptId}`, role);
    assert(singleRes.status === 200, `Role ${role} authorized to read department details (HTTP 200)`);
    assert(singleRes.body.data.id === createdDeptId, 'Returned department matches ID');
  }

  // 3.4.1 Department Discipline Filter Validation (GET /api/departments?discipline=...)
  console.log('\n▶ 3.4.1 DEPARTMENT DISCIPLINE FILTER VALIDATION (GET /api/departments?discipline=...)');
  
  // Verify all 4 permitted values are accepted
  for (const disc of permittedDisciplines) {
    const filterRes = await api('GET', `/departments?discipline=${disc}`, 'DOCTOR');
    assert(filterRes.status === 200, `Permitted discipline filter "${disc}" accepted with HTTP 200`);
    assert(Array.isArray(filterRes.body.data), `Permitted discipline filter "${disc}" returns data array`);
    assert(filterRes.body.data.length > 0, `Permitted discipline filter "${disc}" returned at least one matching department`);
    assert(filterRes.body.data.every((d: any) => d.discipline === disc), `All returned departments strictly match discipline "${disc}"`);
  }

  // Verify unsupported discipline query filters are rejected with HTTP 400 INVALID_DISCIPLINE
  const preFilterDeptCount = await prisma.department.count();

  for (const unsupp of unsupportedDisciplines) {
    const badFilterRes = await api('GET', `/departments?discipline=${unsupp}`, 'DOCTOR');
    assert(badFilterRes.status === 400, `Unsupported discipline filter "${unsupp}" rejected with HTTP 400`);
    assert(badFilterRes.body.code === 'INVALID_DISCIPLINE', `Unsupported discipline filter "${unsupp}" returns code INVALID_DISCIPLINE`);
    assert(badFilterRes.body.message.includes('AYURVEDA, MODERN_MEDICINE, OPERATIONAL, ALLIED'), `Error message strictly cites the 4 permitted disciplines for filter "${unsupp}"`);
  }

  const postFilterDeptCount = await prisma.department.count();
  assert(preFilterDeptCount === postFilterDeptCount, 'Invalid discipline filters do NOT modify database records (department count unchanged)');

  // 3.5 Department update RBAC
  for (const role of ['DOCTOR', 'VAIDYA', 'RECEPTIONIST', 'PHARMACIST', 'ACCOUNTANT'] as const) {
    const res = await api('PATCH', `/departments/${createdDeptId}`, role, { description: 'Hacked' });
    assert(res.status === 403, `Role ${role} forbidden from updating departments (HTTP 403)`);
  }

  // Attempting to modify code rejected with HTTP 400
  const modifyCode = await api('PATCH', `/departments/${createdDeptId}`, 'ADMIN', { code: 'NEWCODE' });
  assert(modifyCode.status === 400 && modifyCode.body.code === 'IMMUTABLE_DEPARTMENT_CODE', 'Modifying code rejected with HTTP 400 IMMUTABLE_DEPARTMENT_CODE');

  // Valid update by ADMIN
  const updateRes = await api('PATCH', `/departments/${createdDeptId}`, 'ADMIN', { description: 'Updated via API' });
  assert(updateRes.status === 200, 'ADMIN successfully updated department details (HTTP 200)');
  assert(updateRes.body.data.description === 'Updated via API', 'Updated description returned');

  // 3.5.1 PATCH discipline validation: reject unsupported disciplines and prove record unmodified
  const prePatchDept = await prisma.department.findUnique({ where: { id: createdDeptId } });
  for (const unsupp of unsupportedDisciplines) {
    const patchBad = await api('PATCH', `/departments/${createdDeptId}`, 'ADMIN', { discipline: unsupp });
    assert(patchBad.status === 400 && patchBad.body.code === 'INVALID_DISCIPLINE', `PATCH with unsupported discipline "${unsupp}" rejected with HTTP 400 INVALID_DISCIPLINE`);
  }
  const postBadPatchDept = await prisma.department.findUnique({ where: { id: createdDeptId } });
  assert(postBadPatchDept?.discipline === prePatchDept?.discipline, 'Existing department discipline is strictly unchanged after rejected PATCH attempts');

  // 3.5.2 PATCH discipline validation: accept permitted discipline
  const patchValid = await api('PATCH', `/departments/${createdDeptId}`, 'ADMIN', { discipline: 'ALLIED' });
  assert(patchValid.status === 200, 'PATCH with permitted discipline ALLIED accepted (HTTP 200)');
  assert(patchValid.body.data.discipline === 'ALLIED', 'Discipline updated to ALLIED in response');
  const postValidPatchDept = await prisma.department.findUnique({ where: { id: createdDeptId } });
  assert(postValidPatchDept?.discipline === 'ALLIED', 'Discipline updated to ALLIED in PostgreSQL database');

  // 3.6 Soft deactivation & reactivation RBAC
  const missingReason = await api('POST', `/departments/${createdDeptId}/deactivate`, 'ADMIN', {});
  assert(missingReason.status === 400 && missingReason.body.code === 'REASON_REQUIRED', 'Deactivation without reason rejected with HTTP 400 REASON_REQUIRED');

  for (const role of ['DOCTOR', 'VAIDYA', 'RECEPTIONIST', 'PHARMACIST', 'ACCOUNTANT'] as const) {
    const res = await api('POST', `/departments/${createdDeptId}/deactivate`, role, { reason: 'Test' });
    assert(res.status === 403, `Role ${role} forbidden from deactivating departments (HTTP 403)`);
  }

  const deactRes = await api('POST', `/departments/${createdDeptId}/deactivate`, 'ADMIN', { reason: 'Testing workflow' });
  assert(deactRes.status === 200 && deactRes.body.data.isActive === false, 'ADMIN successfully deactivated department (HTTP 200)');

  const reactRes = await api('POST', `/departments/${createdDeptId}/activate`, 'SUPER_ADMIN');
  assert(reactRes.status === 200 && reactRes.body.data.isActive === true, 'SUPER_ADMIN successfully reactivated department (HTTP 200)');

  // ============================================================================
  // 4. STAFF DEPARTMENT ASSIGNMENT ENDPOINTS & CRITICAL RULES
  // ============================================================================
  console.log('\n▶ 4. STAFF DEPARTMENT ASSIGNMENTS & CRITICAL PRIMARY RULES');

  // Create clean staff fixtures
  const { staff: testDoctor } = await dbCreateStaffMember({
    name: 'Dr. API Verification Doctor',
    role: 'DOCTOR',
    designation: 'Staff Physician',
    department: 'Legacy Medical Ward',
    email: `api.test.doctor.${timestamp}@sahachara.com`,
    phone: '+91 98450 66112'
  }, { id: 'usr-admin', name: 'Elena Rostova', role: 'ADMIN' });

  const { staff: otherDoctor } = await dbCreateStaffMember({
    name: 'Dr. Second API Doctor',
    role: 'DOCTOR',
    designation: 'Junior Resident',
    department: 'Legacy OPD',
    email: `api.other.doctor.${timestamp}@sahachara.com`,
    phone: '+91 98450 66113'
  }, { id: 'usr-admin', name: 'Elena Rostova', role: 'ADMIN' });

  // 4.1 Initial Primary State: Must be null (Section 6 Rule: legacy department is NOT treated as primary assignment)
  const initialPrimary = await api('GET', `/staff/${testDoctor.id}/departments/primary`, 'DOCTOR');
  assert(initialPrimary.status === 200, 'GET /staff/:id/departments/primary returns HTTP 200');
  assert(initialPrimary.body.data === null, 'CRITICAL: data is strictly null when no active primary assignment exists');
  assert(initialPrimary.body.primaryDepartment === null, 'CRITICAL: primaryDepartment is strictly null despite legacy department string');

  // 4.2 Assignment creation RBAC: SUPER_ADMIN and ADMIN only
  for (const role of ['DOCTOR', 'VAIDYA', 'RECEPTIONIST', 'PHARMACIST', 'ACCOUNTANT'] as const) {
    const res = await api('POST', `/staff/${testDoctor.id}/departments`, role, { departmentId: createdDeptId });
    assert(res.status === 403, `Role ${role} forbidden from assigning staff to departments (HTTP 403)`);
  }

  // Missing departmentId rejected with 400
  const noDeptId = await api('POST', `/staff/${testDoctor.id}/departments`, 'ADMIN', {});
  assert(noDeptId.status === 400 && noDeptId.body.code === 'DEPARTMENT_ID_REQUIRED', 'Missing departmentId rejected with HTTP 400');

  // Valid Primary Assignment by ADMIN
  const assignPrimary = await api('POST', `/staff/${testDoctor.id}/departments`, 'ADMIN', {
    departmentId: createdDeptId,
    isPrimary: true,
    roleTitle: 'Lead Clinical Consultant'
  });
  assert(assignPrimary.status === 201, 'ADMIN created primary department assignment (HTTP 201)');
  const primaryAsgId = assignPrimary.body.data.id;
  assert(assignPrimary.body.data.isPrimary === true, 'Assignment isPrimary is true');

  // Verify primary endpoint now returns the active primary assignment
  const readPrimaryAfter = await api('GET', `/staff/${testDoctor.id}/departments/primary`, 'ACCOUNTANT');
  assert(readPrimaryAfter.status === 200, 'All roles can read primary assignment (HTTP 200)');
  assert(readPrimaryAfter.body.data.assignmentId === primaryAsgId, 'Returns active primary assignment ID');
  assert(readPrimaryAfter.body.data.departmentId === createdDeptId, 'Returns active primary department ID');

  // 4.3 Create secondary and tertiary departments and assign
  const secondDeptRes = await api('POST', '/departments', 'ADMIN', {
    code: `SEC${String(timestamp).slice(-4)}`,
    name: `Secondary Dept ${timestamp}`,
    discipline: 'OPERATIONAL'
  });
  const secondDeptId = secondDeptRes.body.data.id;

  const thirdDeptRes = await api('POST', '/departments', 'ADMIN', {
    code: `TER${String(timestamp).slice(-4)}`,
    name: `Tertiary Dept ${timestamp}`,
    discipline: 'OPERATIONAL'
  });
  const thirdDeptId = thirdDeptRes.body.data.id;

  const assignSecondary = await api('POST', `/staff/${testDoctor.id}/departments`, 'ADMIN', {
    departmentId: thirdDeptId,
    isPrimary: false,
    roleTitle: 'Committee Member'
  });
  assert(assignSecondary.status === 201, 'ADMIN created secondary department assignment (HTTP 201)');
  const secondaryAsgId = assignSecondary.body.data.id;
  assert(assignSecondary.body.data.isPrimary === false, 'Secondary assignment isPrimary is false');

  // Verify list staff assignments across all roles
  for (const role of allRoles) {
    const asgList = await api('GET', `/staff/${testDoctor.id}/departments`, role);
    assert(asgList.status === 200, `Role ${role} authorized to list staff assignments (HTTP 200)`);
    assert(asgList.body.data.length === 2, 'Returns both primary and secondary assignments');
  }

  // 4.4 Cross-staff assignment ID manipulation prevention
  // Attempting to complete testDoctor's assignment via otherDoctor's URL MUST be rejected
  const crossStaffComplete = await api('POST', `/staff/${otherDoctor.id}/departments/${primaryAsgId}/complete`, 'ADMIN', { reason: 'Malicious attempt' });
  assert(crossStaffComplete.status === 400 && crossStaffComplete.body.code === 'ASSIGNMENT_STAFF_MISMATCH', 'Cross-staff assignment ID manipulation rejected with HTTP 400 ASSIGNMENT_STAFF_MISMATCH');

  const crossStaffRevoke = await api('POST', `/staff/${otherDoctor.id}/departments/${primaryAsgId}/revoke`, 'ADMIN', { reason: 'Malicious attempt' });
  assert(crossStaffRevoke.status === 400 && crossStaffRevoke.body.code === 'ASSIGNMENT_STAFF_MISMATCH', 'Cross-staff revocation manipulation rejected with HTTP 400 ASSIGNMENT_STAFF_MISMATCH');

  // 4.5 Primary department transfer via API
  const transferPrimary = await api('POST', `/staff/${testDoctor.id}/departments/primary`, 'ADMIN', {
    departmentId: secondDeptId,
    reason: 'Promoted to Secondary Dept Head'
  });
  assert(transferPrimary.status === 200, 'ADMIN transferred primary department (HTTP 200)');
  assert(transferPrimary.body.data.departmentId === secondDeptId, 'New primary assignment points to secondDeptId');

  // Check that old primary assignment transitioned to transferred
  const asgsAfterTransfer = await api('GET', `/staff/${testDoctor.id}/departments`, 'ADMIN');
  const oldAsg = asgsAfterTransfer.body.data.find((a: any) => a.id === primaryAsgId);
  assert(oldAsg?.status === 'transferred', 'Previous primary assignment transitioned to transferred');

  // 4.6 Complete and Revoke endpoints
  const completeRes = await api('POST', `/staff/${testDoctor.id}/departments/${secondaryAsgId}/complete`, 'ADMIN');
  assert(completeRes.status === 200 && completeRes.body.data.status === 'completed', 'Completed secondary assignment (HTTP 200)');

  // Revoking the new primary assignment
  const newPrimaryAsgId = transferPrimary.body.data.id;
  const revokeWithoutReason = await api('POST', `/staff/${testDoctor.id}/departments/${newPrimaryAsgId}/revoke`, 'ADMIN', {});
  assert(revokeWithoutReason.status === 400 && revokeWithoutReason.body.code === 'REASON_REQUIRED', 'Revocation without reason rejected with HTTP 400');

  const revokeRes = await api('POST', `/staff/${testDoctor.id}/departments/${newPrimaryAsgId}/revoke`, 'ADMIN', { reason: 'Assignment concluded' });
  assert(revokeRes.status === 200 && revokeRes.body.data.status === 'revoked', 'Revoked primary assignment (HTTP 200)');

  // Once primary is revoked, verify primary endpoint returns null again (Section 6 rule)
  const primaryAfterRevoke = await api('GET', `/staff/${testDoctor.id}/departments/primary`, 'SUPER_ADMIN');
  assert(primaryAfterRevoke.body.data === null, 'Primary endpoint returns null after revocation');
  assert(primaryAfterRevoke.body.primaryDepartment === null, 'primaryDepartment returns null after revocation');

  // 4.7 Read department staff: verifies no sensitive fields leaked
  const deptStaff = await api('GET', `/departments/${createdDeptId}/staff`, 'RECEPTIONIST');
  assert(deptStaff.status === 200, 'RECEPTIONIST can read department staff (HTTP 200)');
  assert(Array.isArray(deptStaff.body.data), 'Returns department staff array');
  if (deptStaff.body.data.length > 0) {
    const first = deptStaff.body.data[0];
    assert(first.staffMember.activationPin === undefined, 'Activation PIN strictly omitted from department staff response');
    assert(first.staffMember.activationPinHash === undefined, 'Activation PIN Hash strictly omitted from response');
  }

  // ============================================================================
  // 5. AUDIT ATTRIBUTION & CREDENTIAL PRIVACY
  // ============================================================================
  console.log('\n▶ 5. AUDIT ATTRIBUTION & CREDENTIAL PRIVACY');
  const auditLogs = await dbGetAuditLogs();
  const recentDeptAudit = auditLogs.find((l) => l.action === 'Department Created' && l.details.includes(deptCode));
  assert(recentDeptAudit !== undefined, 'Department creation audit entry recorded in database');
  assert(recentDeptAudit?.actor === 'Marcus Sterling', 'Audit actor attribution comes strictly from authenticated identity (Marcus Sterling)');
  assert(recentDeptAudit?.role === 'ADMIN', 'Audit role attribution matches authenticated database role (ADMIN)');
  assert(!recentDeptAudit?.details.includes('password') && !recentDeptAudit?.details.includes('pin'), 'Audit log contains no credentials');

  // ============================================================================
  // 6. PRODUCTION ZERO-MUTATION VERIFICATION
  // ============================================================================
  console.log('\n▶ 6. PRODUCTION DATABASE ZERO-MUTATION VERIFICATION');
  const prodPost = await getProductionDbStats();
  console.log('  Final Production DB Snapshot:', prodPost);

  assert(prodPre.users === prodPost.users && prodPost.users === 1, 'Production users strictly 1');
  assert(prodPost.patients === 0, 'Production patients count strictly 0');
  assert(prodPost.appointments === 0, 'Production appointments count strictly 0');
  assert(prodPost.prescriptions === 0, 'Production prescriptions count strictly 0');
  assert(prodPost.dispensingRecords === 0, 'Production dispensingRecords count strictly 0');
  assert(prodPost.invoices === 0, 'Production invoices count strictly 0');
  assert(prodPost.payments === 0, 'Production payments count strictly 0');
  assert(prodPost.refundRequests === 0, 'Production refundRequests count strictly 0');
  assert(prodPost.staffMembers === 0, 'Production staffMembers count strictly 0');
  assert(prodPost.tariffs === 10, 'Production tariffs count strictly 10');

  // Cleanup test data
  await prisma.staffDepartmentAssignment.deleteMany({
    where: { staffId: { in: [testDoctor.id, otherDoctor.id] } }
  });
  await prisma.staffMember.deleteMany({
    where: { id: { in: [testDoctor.id, otherDoctor.id] } }
  });
  if (testDoctor.userId) await prisma.user.delete({ where: { id: testDoctor.userId } }).catch(() => {});
  if (otherDoctor.userId) await prisma.user.delete({ where: { id: otherDoctor.userId } }).catch(() => {});
  await prisma.department.deleteMany({
    where: { id: { in: [createdDeptId, secondDeptId, thirdDeptId, ...permittedDeptIds] } }
  });

  server.close();
  await prodProbePrisma.$disconnect();
  await prisma.$disconnect();

  console.log('\n======================================================================');
  console.log(`   PHASE 6B STAGE 3B API VERIFICATION: ${passCount} PASSED, ${failCount} FAILED   `);
  console.log('======================================================================\n');

  if (failCount > 0) {
    process.exit(1);
  }
}

runStage3bVerification().catch((err) => {
  console.error('Unhandled verification failure:', err);
  process.exit(1);
});
