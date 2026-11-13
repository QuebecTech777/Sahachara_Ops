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

// Global assertion tally
let totalAssertions = 0;
let passedAssertions = 0;
let failedAssertions = 0;

function assert(condition: boolean, description: string) {
  totalAssertions++;
  if (condition) {
    passedAssertions++;
    console.log(`  [PASS] #${totalAssertions} ${description}`);
  } else {
    failedAssertions++;
    console.error(`  [FAIL] #${totalAssertions} ${description}`);
  }
}

async function runStage4FrontendVerification() {
  console.log('\n================================================================================');
  console.log('SAHACHARA OPS — PHASE 6B, STAGE 4: FRONTEND INTEGRATION & E2E VERIFICATION');
  console.log('================================================================================');

  // Verify connection to test database
  const connected = await checkPrismaConnection();
  if (!connected) {
    console.error('ERROR: Could not connect to sahachara_ops_test_db');
    process.exit(1);
  }
  console.log('Connected to test database:', TEST_DB_URL);

  // Probe Production DB baseline
  const prodStatsBefore = await getProductionDbStats();
  console.log('\n[PROD ISOLATION BASELINE]');
  console.log('  Production DB state:', JSON.stringify(prodStatsBefore));

  await ensureDefaultDatabaseUsers();

  // Register fail-closed active-user checker
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
        if (u.staffMember.status === 'suspended' || u.staffMember.isSuspended) return { isActive: false, statusReason: 'suspended' };
        if (u.staffMember.status === 'archived' || u.staffMember.archivedAt) return { isActive: false, statusReason: 'archived' };
      }
      return { isActive: true, role: u.role };
    } catch {
      return { isActive: false, isUnavailable: true, statusReason: 'unavailable' };
    }
  });

  // Start test Express server
  const app = express();
  app.use(express.json());
  app.use('/api', apiRouter);

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as any).port;
  const baseUrl = `http://127.0.0.1:${port}/api`;
  console.log(`Test API Server running on ${baseUrl}\n`);

  // Setup test tokens for all 7 roles
  const ROLES = ['SUPER_ADMIN', 'ADMIN', 'DOCTOR', 'VAIDYA', 'RECEPTIONIST', 'PHARMACIST', 'ACCOUNTANT'] as const;
  const tokens: Record<string, string> = {};

  for (const role of ROLES) {
    const user = await prisma.user.findFirst({ where: { role, status: 'active' } });
    if (!user) {
      throw new Error(`Active test user for role ${role} not found`);
    }
    tokens[role] = generateSessionToken({
      userId: user.id,
      email: user.email,
      role: user.role as any,
      name: user.name
    });
  }

  // Helper fetch function
  async function apiFetch(path: string, options: { method?: string; body?: any; role?: typeof ROLES[number]; token?: string } = {}) {
    const method = options.method || 'GET';
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (options.token) {
      headers['Authorization'] = `Bearer ${options.token}`;
    } else if (options.role) {
      headers['Authorization'] = `Bearer ${tokens[options.role]}`;
    }
    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined
    });
    const status = res.status;
    let data = null;
    try {
      data = await res.json();
    } catch {}
    return { status, data };
  }

  // ============================================================================
  // SUITE 1: STAGE 4A — HOSPITAL INSTITUTIONAL PROFILE FRONTEND CONTRACTS
  // ============================================================================
  console.log('\n--- SUITE 1: STAGE 4A — Hospital Profile Frontend Contracts ---');

  // 1.1 Read profile (all 7 roles have read access)
  for (const role of ROLES) {
    const res = await apiFetch('/hospital/profile', { role });
    assert(res.status === 200, `Profile read succeeds for ${role} (HTTP 200)`);
    assert(res.data?.success === true && res.data?.data?.code === 'SAH', `Profile response has valid structure for ${role}`);
  }

  // 1.2 Fetch profile to inspect baseline version
  const initialProfileRes = await apiFetch('/hospital/profile', { role: 'SUPER_ADMIN' });
  const initialProfile = initialProfileRes.data.data;
  const initialVersion = initialProfile.version;
  assert(typeof initialVersion === 'number', 'Profile has numerical version for optimistic concurrency control');

  // 1.3 Update profile with matching version by SUPER_ADMIN succeeds
  const updateRes1 = await apiFetch('/hospital/profile', {
    method: 'PUT',
    role: 'SUPER_ADMIN',
    body: {
      displayName: 'Sahachara Ayurveda Yoga Ecoliving Updated',
      tagline: 'Holistic Traditional Healing & Wellness',
      version: initialVersion
    }
  });
  assert(updateRes1.status === 200, 'SUPER_ADMIN profile update with matching version returns HTTP 200');
  assert(updateRes1.data?.data?.version === initialVersion + 1, 'Profile version increments after successful update');
  assert(updateRes1.data?.data?.displayName === 'Sahachara Ayurveda Yoga Ecoliving Updated', 'Profile displayName successfully updated');

  // 1.4 Optimistic locking conflict (stale version submission) returns HTTP 409
  const conflictRes = await apiFetch('/hospital/profile', {
    method: 'PUT',
    role: 'SUPER_ADMIN',
    body: {
      displayName: 'Conflict Test Name',
      version: initialVersion // stale version
    }
  });
  assert(conflictRes.status === 409, 'Submitting stale version returns HTTP 409 Conflict');
  assert(conflictRes.data?.code === 'CONCURRENT_MODIFICATION' || conflictRes.data?.message?.includes('CONCURRENT_MODIFICATION'), 'Conflict response clearly conveys CONCURRENT_MODIFICATION condition');

  // 1.5 Genuine NULL preservation for optional fields
  const currentVersion = updateRes1.data.data.version;
  const nullPreserveRes = await apiFetch('/hospital/profile', {
    method: 'PUT',
    role: 'SUPER_ADMIN',
    body: {
      phone: null,
      emergencyPhone: null,
      email: null,
      website: null,
      address: null,
      city: null,
      state: null,
      postalCode: null,
      version: currentVersion
    }
  });
  assert(nullPreserveRes.status === 200, 'Profile update setting optional fields to null returns HTTP 200');
  assert(nullPreserveRes.data?.data?.phone === null, 'phone field is genuinely NULL in database');
  assert(nullPreserveRes.data?.data?.emergencyPhone === null, 'emergencyPhone field is genuinely NULL in database');
  assert(nullPreserveRes.data?.data?.email === null, 'email field is genuinely NULL in database');
  assert(nullPreserveRes.data?.data?.website === null, 'website field is genuinely NULL in database');
  assert(nullPreserveRes.data?.data?.address === null, 'address field is genuinely NULL in database');
  assert(nullPreserveRes.data?.data?.city === null, 'city field is genuinely NULL in database');
  assert(nullPreserveRes.data?.data?.country === 'India', 'country field is retained and untouched');
  assert(nullPreserveRes.data?.data?.currency === 'INR', 'currency field is retained and untouched');
  assert(nullPreserveRes.data?.data?.timezone === 'Asia/Kolkata', 'timezone field is retained and untouched');

  // 1.6 Invalid email format validation
  const v2 = nullPreserveRes.data.data.version;
  const invalidEmailRes = await apiFetch('/hospital/profile', {
    method: 'PUT',
    role: 'SUPER_ADMIN',
    body: {
      email: 'not-a-valid-email',
      version: v2
    }
  });
  assert(invalidEmailRes.status === 400, 'Invalid email format rejected with HTTP 400');

  // Restore authentic email and phone for operational baseline
  const restoreRes = await apiFetch('/hospital/profile', {
    method: 'PUT',
    role: 'SUPER_ADMIN',
    body: {
      displayName: 'Sahachara Ayurveda Yoga Ecoliving',
      phone: '+91 484 285 1234',
      email: 'info@sahachara.com',
      website: 'https://sahachara.com',
      tagline: 'Ayurvedic Excellence & Integrative Healthcare',
      version: v2
    }
  });
  assert(restoreRes.status === 200, 'Profile operational baseline restored successfully');

  // 1.7 RBAC: Non-SUPER_ADMIN roles cannot update profile (HTTP 403)
  const nonSuperAdminRoles: Array<typeof ROLES[number]> = ['ADMIN', 'DOCTOR', 'VAIDYA', 'RECEPTIONIST', 'PHARMACIST', 'ACCOUNTANT'];
  for (const role of nonSuperAdminRoles) {
    const forbiddenRes = await apiFetch('/hospital/profile', {
      method: 'PUT',
      role,
      body: {
        displayName: 'Unauthorized Update Attempt',
        version: restoreRes.data.data.version
      }
    });
    assert(forbiddenRes.status === 403, `Profile update by ${role} is rejected with HTTP 403 Forbidden`);
  }

  // ============================================================================
  // SUITE 2: STAGE 4B — DEPARTMENT MANAGEMENT FRONTEND CONTRACTS
  // ============================================================================
  console.log('\n--- SUITE 2: STAGE 4B — Department Management Frontend Contracts ---');

  // 2.1 Department listing across all 7 roles
  for (const role of ROLES) {
    const listRes = await apiFetch('/departments', { role });
    assert(listRes.status === 200, `Department list accessible to ${role} (HTTP 200)`);
    assert(Array.isArray(listRes.data?.data), `Department list returns array for ${role}`);
  }

  // 2.2 Filter by 4 disciplines strictly matching Prisma enum
  const disciplines: DepartmentDiscipline[] = ['AYURVEDA', 'MODERN_MEDICINE', 'OPERATIONAL', 'ALLIED'];
  for (const disc of disciplines) {
    const filterRes = await apiFetch(`/departments?discipline=${disc}`, { role: 'ADMIN' });
    assert(filterRes.status === 200, `Filtering departments by ${disc} returns HTTP 200`);
    const allMatch = filterRes.data.data.every((d: any) => d.discipline === disc);
    assert(allMatch, `All returned departments have discipline === ${disc}`);
  }

  // 2.3 Department creation with code validation ^[A-Z0-9]{2,10}$
  const invalidCodes = ['a', 'invalid_code!', 'toolongcode123', 'dept 1'];
  for (const invCode of invalidCodes) {
    const invRes = await apiFetch('/departments', {
      method: 'POST',
      role: 'ADMIN',
      body: { code: invCode, name: 'Invalid Code Dept', discipline: 'OPERATIONAL' }
    });
    assert(invRes.status === 400, `Invalid department code "${invCode}" rejected with HTTP 400`);
  }

  // Create valid test department
  const uniqueDeptCode = `DEPT${Math.floor(1000 + Math.random() * 9000)}`;
  const createDeptRes = await apiFetch('/departments', {
    method: 'POST',
    role: 'ADMIN',
    body: {
      code: uniqueDeptCode,
      name: `Integrative Wellness ${uniqueDeptCode}`,
      discipline: 'ALLIED',
      description: 'Therapeutic and rehabilitation services'
    }
  });
  assert(createDeptRes.status === 201, `Department creation with valid code ${uniqueDeptCode} returns HTTP 201`);
  const createdDept = createDeptRes.data.data;
  assert(createdDept.code === uniqueDeptCode, 'Created department has correct code');
  assert(createdDept.isActive === true, 'Created department is active by default');

  // Duplicate code rejected with HTTP 409
  const dupRes = await apiFetch('/departments', {
    method: 'POST',
    role: 'ADMIN',
    body: { code: uniqueDeptCode, name: `Duplicate Dept ${uniqueDeptCode}`, discipline: 'ALLIED' }
  });
  assert(dupRes.status === 409, 'Duplicate department code rejected with HTTP 409 Conflict');

  // 2.4 Department update (code immutability: attempting to change code returns HTTP 400)
  const immutCodeRes = await apiFetch(`/departments/${createdDept.id}`, {
    method: 'PATCH',
    role: 'ADMIN',
    body: { code: 'NEWCODE99' }
  });
  assert(immutCodeRes.status === 400, 'Attempting to change department code is rejected with HTTP 400');
  assert(immutCodeRes.data?.code === 'IMMUTABLE_DEPARTMENT_CODE', 'Error code is IMMUTABLE_DEPARTMENT_CODE');

  // Department update permitted fields (name, description, discipline) returns HTTP 200
  const updateDeptRes = await apiFetch(`/departments/${createdDept.id}`, {
    method: 'PATCH',
    role: 'ADMIN',
    body: {
      name: `Integrative Wellness ${uniqueDeptCode} (Updated)`,
      description: 'Updated rehabilitation description'
    }
  });
  assert(updateDeptRes.status === 200, 'Department update returns HTTP 200');
  assert(updateDeptRes.data.data.name.includes('(Updated)'), 'Department name updated successfully');

  // 2.5 Deactivate department with mandatory reason
  const noReasonDeact = await apiFetch(`/departments/${createdDept.id}/deactivate`, {
    method: 'POST',
    role: 'ADMIN',
    body: { reason: '   ' }
  });
  assert(noReasonDeact.status === 400, 'Deactivation without mandatory reason returns HTTP 400');

  const validDeact = await apiFetch(`/departments/${createdDept.id}/deactivate`, {
    method: 'POST',
    role: 'ADMIN',
    body: { reason: 'Operational restructuring of allied units' }
  });
  assert(validDeact.status === 200, 'Deactivation with valid reason returns HTTP 200');
  assert(validDeact.data.data.isActive === false, 'Department marked isActive === false');
  assert(validDeact.data.data.deactivationReason === 'Operational restructuring of allied units', 'Deactivation reason recorded');

  // Re-deactivation of inactive department returns HTTP 409 Conflict
  const reDeact = await apiFetch(`/departments/${createdDept.id}/deactivate`, {
    method: 'POST',
    role: 'ADMIN',
    body: { reason: 'Already inactive' }
  });
  assert(reDeact.status === 409, 'Deactivating already inactive department returns HTTP 409 Conflict');
  assert(reDeact.data?.code === 'DEPARTMENT_ALREADY_INACTIVE', 'Error code is DEPARTMENT_ALREADY_INACTIVE');

  // 2.6 Activate department
  const activateRes = await apiFetch(`/departments/${createdDept.id}/activate`, {
    method: 'POST',
    role: 'ADMIN'
  });
  assert(activateRes.status === 200, 'Department activation returns HTTP 200');
  assert(activateRes.data.data.isActive === true, 'Department marked isActive === true');
  assert(activateRes.data.data.deactivationReason === null, 'Deactivation reason cleared on reactivation');

  // 2.7 View department assigned staff
  const staffRes = await apiFetch(`/departments/${createdDept.id}/staff`, { role: 'ADMIN' });
  assert(staffRes.status === 200, 'GET /departments/:id/staff returns HTTP 200');
  assert(Array.isArray(staffRes.data.data), 'Department staff response data is an array');

  // 2.8 RBAC: Mutations restricted to SUPER_ADMIN and ADMIN
  const nonAdminRoles: Array<typeof ROLES[number]> = ['DOCTOR', 'VAIDYA', 'RECEPTIONIST', 'PHARMACIST', 'ACCOUNTANT'];
  for (const role of nonAdminRoles) {
    const postRes = await apiFetch('/departments', {
      method: 'POST',
      role,
      body: { code: 'FAIL01', name: 'Unauthorized Dept', discipline: 'OPERATIONAL' }
    });
    assert(postRes.status === 403, `Department creation by ${role} rejected with HTTP 403`);

    const patchRes = await apiFetch(`/departments/${createdDept.id}`, {
      method: 'PATCH',
      role,
      body: { name: 'Unauthorized Patch' }
    });
    assert(patchRes.status === 403, `Department update by ${role} rejected with HTTP 403`);

    const deactRes = await apiFetch(`/departments/${createdDept.id}/deactivate`, {
      method: 'POST',
      role,
      body: { reason: 'Unauthorized' }
    });
    assert(deactRes.status === 403, `Department deactivation by ${role} rejected with HTTP 403`);

    const actRes = await apiFetch(`/departments/${createdDept.id}/activate`, {
      method: 'POST',
      role
    });
    assert(actRes.status === 403, `Department activation by ${role} rejected with HTTP 403`);
  }

  // ============================================================================
  // SUITE 3: STAGE 4C — STAFF DEPARTMENT ASSIGNMENTS FRONTEND CONTRACTS
  // ============================================================================
  console.log('\n--- SUITE 3: STAGE 4C — Staff Department Assignments Frontend Contracts ---');

  // Create clean test staff member with legacy department field set
  const staffMember = await dbCreateStaffMember(
    {
      name: 'Dr. Arunima Varma (Frontend Verification)',
      role: 'VAIDYA',
      email: `arunima.${Date.now()}@sahachara.com`,
      phone: '+919446123456',
      designation: 'Senior Ayurvedic Physician',
      department: 'Kayachikitsa (Legacy String)' // legacy string!
    },
    { id: 'usr-admin', name: 'Admin Marcus', role: 'ADMIN' }
  );
  const testStaffId = staffMember.staff.id;
  assert(typeof testStaffId === 'string', 'Created test staff member for assignment tests');

  // CRUCIAL SECTION 6 INVARIANT:
  // When no relational active primary assignment exists, GET /api/staff/:id/departments/primary
  // MUST return data: null / primaryDepartment: null, NEVER falling back to legacy strings!
  const nullPrimaryRes = await apiFetch(`/staff/${testStaffId}/departments/primary`, { role: 'ADMIN' });
  assert(nullPrimaryRes.status === 200, 'GET /staff/:id/departments/primary returns HTTP 200');
  assert(nullPrimaryRes.data?.data === null || nullPrimaryRes.data?.primaryDepartment === null,
    'SECTION 6 INVARIANT: Relational primary is NULL despite legacy staff_members.department having value');

  // 3.1 Assign staff to active department as secondary
  const asg1Res = await apiFetch(`/staff/${testStaffId}/departments`, {
    method: 'POST',
    role: 'ADMIN',
    body: {
      departmentId: createdDept.id,
      isPrimary: false,
      roleTitle: 'Consulting Vaidya'
    }
  });
  assert(asg1Res.status === 201, 'Assigning staff to department as secondary returns HTTP 201');
  const asg1 = asg1Res.data.data;
  assert(asg1.isPrimary === false, 'Assignment has isPrimary === false');
  assert(asg1.status === 'active', 'Assignment has status === active');

  // Verify primary is STILL null
  const stillNullPrimary = await apiFetch(`/staff/${testStaffId}/departments/primary`, { role: 'ADMIN' });
  assert(stillNullPrimary.data?.data === null || stillNullPrimary.data?.primaryDepartment === null,
    'Primary remains NULL when only secondary assignments exist');

  // 3.2 Assignment to deactivated department is rejected with HTTP 400
  const deactDeptCode = `INAC${Math.floor(1000 + Math.random() * 9000)}`;
  const inactDeptRes = await apiFetch('/departments', {
    method: 'POST',
    role: 'ADMIN',
    body: { code: deactDeptCode, name: `Inactive Dept ${deactDeptCode}`, discipline: 'OPERATIONAL' }
  });
  await apiFetch(`/departments/${inactDeptRes.data.data.id}/deactivate`, {
    method: 'POST',
    role: 'ADMIN',
    body: { reason: 'Test inactivation for assignment rejection' }
  });
  const inactAsg = await apiFetch(`/staff/${testStaffId}/departments`, {
    method: 'POST',
    role: 'ADMIN',
    body: { departmentId: inactDeptRes.data.data.id, isPrimary: false }
  });
  assert(inactAsg.status === 400, 'Assigning staff to deactivated department rejected with HTTP 400');
  assert(inactAsg.data?.code === 'ASSIGNMENT_INELIGIBLE', 'Error code is ASSIGNMENT_INELIGIBLE on inactive department');

  // 3.3 Create a second department and assign as PRIMARY
  const dept2Code = `DPTB${Math.floor(1000 + Math.random() * 9000)}`;
  const dept2Res = await apiFetch('/departments', {
    method: 'POST',
    role: 'ADMIN',
    body: {
      code: dept2Code,
      name: `Kayachikitsa Directorate ${dept2Code}`,
      discipline: 'AYURVEDA'
    }
  });
  const dept2 = dept2Res.data.data;

  const asg2Res = await apiFetch(`/staff/${testStaffId}/departments`, {
    method: 'POST',
    role: 'ADMIN',
    body: {
      departmentId: dept2.id,
      isPrimary: true,
      roleTitle: 'Head of Clinical Directorate'
    }
  });
  assert(asg2Res.status === 201, 'Assigning staff to second department as primary returns HTTP 201');
  assert(asg2Res.data.data.isPrimary === true, 'Assignment marked isPrimary === true');

  // Verify primary is now dept2
  const primaryCheckRes = await apiFetch(`/staff/${testStaffId}/departments/primary`, { role: 'ADMIN' });
  assert(primaryCheckRes.status === 200, 'Primary query returns HTTP 200');
  const primaryDept = primaryCheckRes.data.primaryDepartment || primaryCheckRes.data.data;
  assert(primaryDept?.id === dept2.id, 'Primary department correctly points to relational primary assignment');

  // 3.4 Change primary department to createdDept
  const changePrimaryRes = await apiFetch(`/staff/${testStaffId}/departments/primary`, {
    method: 'POST',
    role: 'ADMIN',
    body: { departmentId: createdDept.id }
  });
  assert(changePrimaryRes.status === 200, 'Changing primary department returns HTTP 200');

  const verifyPrimaryChanged = await apiFetch(`/staff/${testStaffId}/departments/primary`, { role: 'ADMIN' });
  const changedPrimary = verifyPrimaryChanged.data.primaryDepartment || verifyPrimaryChanged.data.data;
  assert(changedPrimary?.id === createdDept.id, 'Primary department updated to createdDept');

  // 3.5 Complete assignment
  const deptCompleteCode = `CMPL${Math.floor(1000 + Math.random() * 9000)}`;
  const deptCompRes = await apiFetch('/departments', {
    method: 'POST',
    role: 'ADMIN',
    body: { code: deptCompleteCode, name: `Dept To Complete ${deptCompleteCode}`, discipline: 'OPERATIONAL' }
  });
  const asgToCompleteRes = await apiFetch(`/staff/${testStaffId}/departments`, {
    method: 'POST',
    role: 'ADMIN',
    body: { departmentId: deptCompRes.data.data.id, isPrimary: false }
  });
  const completeRes = await apiFetch(`/staff/${testStaffId}/departments/${asgToCompleteRes.data.data.id}/complete`, {
    method: 'POST',
    role: 'ADMIN'
  });
  assert(completeRes.status === 200, 'Completing staff assignment returns HTTP 200');
  assert(completeRes.data.data.status === 'completed', 'Assignment marked status === completed');

  // 3.6 Transfer assignment
  const dept3Code = `DPTC${Math.floor(1000 + Math.random() * 9000)}`;
  const dept3Res = await apiFetch('/departments', {
    method: 'POST',
    role: 'ADMIN',
    body: {
      code: dept3Code,
      name: `Panchakarma Care ${dept3Code}`,
      discipline: 'AYURVEDA'
    }
  });
  const dept3 = dept3Res.data.data;

  const transferRes = await apiFetch(`/staff/${testStaffId}/departments/${asg1.id}/transfer`, {
    method: 'POST',
    role: 'ADMIN',
    body: {
      newDepartmentId: dept3.id,
      reason: 'Administrative clinical redeployment'
    }
  });
  assert(transferRes.status === 200, 'Transferring assignment returns HTTP 200');
  assert(transferRes.data.data?.status === 'active', 'Target assignment marked active');
  assert(transferRes.data.data?.departmentId === dept3.id, 'Target assignment has new departmentId');

  const newAsgId = transferRes.data.data.id;

  // 3.7 Revoke assignment with mandatory reason
  const noReasonRevoke = await apiFetch(`/staff/${testStaffId}/departments/${newAsgId}/revoke`, {
    method: 'POST',
    role: 'ADMIN',
    body: { reason: '   ' }
  });
  assert(noReasonRevoke.status === 400, 'Revoking assignment without mandatory reason returns HTTP 400');

  const validRevoke = await apiFetch(`/staff/${testStaffId}/departments/${newAsgId}/revoke`, {
    method: 'POST',
    role: 'ADMIN',
    body: { reason: 'Concluding temporary rotation' }
  });
  assert(validRevoke.status === 200, 'Revoking assignment with valid reason returns HTTP 200');
  assert(validRevoke.data.data.status === 'revoked', 'Assignment marked status === revoked');
  assert(validRevoke.data.data.revocationReason === 'Concluding temporary rotation', 'Revocation reason permanently recorded');

  // 3.8 RBAC: Assignment mutations restricted to SUPER_ADMIN and ADMIN
  for (const role of nonAdminRoles) {
    const postAsg = await apiFetch(`/staff/${testStaffId}/departments`, {
      method: 'POST',
      role,
      body: { departmentId: createdDept.id }
    });
    assert(postAsg.status === 403, `Assignment creation by ${role} rejected with HTTP 403`);

    const changePri = await apiFetch(`/staff/${testStaffId}/departments/primary`, {
      method: 'POST',
      role,
      body: { departmentId: createdDept.id }
    });
    assert(changePri.status === 403, `Primary change by ${role} rejected with HTTP 403`);

    const compAsg = await apiFetch(`/staff/${testStaffId}/departments/${asg1.id}/complete`, {
      method: 'POST',
      role
    });
    assert(compAsg.status === 403, `Assignment completion by ${role} rejected with HTTP 403`);

    const transAsg = await apiFetch(`/staff/${testStaffId}/departments/${asg1.id}/transfer`, {
      method: 'POST',
      role,
      body: { newDepartmentId: dept2.id }
    });
    assert(transAsg.status === 403, `Assignment transfer by ${role} rejected with HTTP 403`);

    const revAsg = await apiFetch(`/staff/${testStaffId}/departments/${asg1.id}/revoke`, {
      method: 'POST',
      role,
      body: { reason: 'Unauthorized' }
    });
    assert(revAsg.status === 403, `Assignment revocation by ${role} rejected with HTTP 403`);

    // Non-admin roles CAN read staff departments and primary
    const readDepts = await apiFetch(`/staff/${testStaffId}/departments`, { role });
    assert(readDepts.status === 200, `Reading staff departments by ${role} succeeds (HTTP 200)`);

    const readPri = await apiFetch(`/staff/${testStaffId}/departments/primary`, { role });
    assert(readPri.status === 200, `Reading staff primary department by ${role} succeeds (HTTP 200)`);
  }

  // Close HTTP server
  server.close();

  // ============================================================================
  // PRODUCTION DATABASE ZERO-MUTATION VERIFICATION
  // ============================================================================
  console.log('\n--- VERIFYING PRODUCTION ZERO-MUTATION POST-TEST ---');
  const prodStatsAfter = await getProductionDbStats();
  console.log('  Production DB state after tests:', JSON.stringify(prodStatsAfter));

  let prodDiffFound = false;
  for (const [key, beforeVal] of Object.entries(prodStatsBefore)) {
    const afterVal = (prodStatsAfter as any)[key];
    if (beforeVal !== afterVal) {
      prodDiffFound = true;
      console.error(`  PROD MUTATION DETECTED: Table ${key} changed from ${beforeVal} to ${afterVal}`);
    }
  }
  assert(!prodDiffFound, 'Production database (sahachara_ops_db) suffered ZERO mutations across all tests');

  await prodProbePrisma.$disconnect();
  await prisma.$disconnect();

  console.log('\n================================================================================');
  console.log(`STAGE 4 VERIFICATION RESULTS: ${passedAssertions} PASSED, ${failedAssertions} FAILED, ${totalAssertions} TOTAL`);
  console.log('================================================================================\n');

  if (failedAssertions > 0) {
    process.exit(1);
  }
}

runStage4FrontendVerification().catch((err) => {
  console.error('Unhandled verification error:', err);
  process.exit(1);
});
