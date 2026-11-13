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

import {
  prisma,
  checkPrismaConnection,
  ensureDefaultDatabaseUsers,
  dbGetHospitalProfile,
  dbUpdateHospitalProfile,
  dbGetDepartments,
  dbGetDepartmentById,
  dbCreateDepartment,
  dbUpdateDepartment,
  dbDeactivateDepartment,
  dbActivateDepartment,
  dbGetDepartmentStaff,
  dbAssignStaffDepartment,
  dbChangePrimaryDepartment,
  dbUpdateAssignmentStatus,
  dbGetStaffAssignments,
  dbGetPrimaryStaffAssignment,
  dbCreateStaffMember
} from '../server/prismaService.ts';

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

async function runStage3aVerification() {
  console.log('\n======================================================================');
  console.log('   SAHACHARA OPS — PHASE 6B STAGE 3A: BACKEND DATA SERVICES TEST      ');
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

  const testActor = { id: 'usr-admin', name: 'Operational Administrator', role: 'ADMIN' };
  const superActor = { id: 'usr-superadmin', name: 'Dr. Alexander Wright', role: 'SUPER_ADMIN' };

  // ============================================================================
  // 1. HOSPITAL INSTITUTIONAL PROFILE SERVICES
  // ============================================================================
  console.log('\n▶ 1. HOSPITAL INSTITUTIONAL PROFILE RETRIEVAL & UPDATE');
  
  // 1.1 Retrieval
  const profile = await dbGetHospitalProfile();
  assert(profile !== null, 'Hospital profile retrieved successfully');
  assert(profile.singletonKey === 'PRIMARY_INSTITUTION', 'Singleton key is PRIMARY_INSTITUTION');
  assert(profile.code === 'SAH', 'Profile code is SAH');
  assert(profile.currency === 'INR', 'Currency is INR');
  assert(profile.timezone === 'Asia/Kolkata', 'Timezone is Asia/Kolkata');

  // 1.2 Update permitted fields
  const updatedProfile = await dbUpdateHospitalProfile({
    displayName: 'Sahachara Ayurveda Wellness Campus',
    phone: '+91 486 422 3450',
    version: profile.version
  }, superActor);
  assert(updatedProfile.displayName === 'Sahachara Ayurveda Wellness Campus', 'Profile display name updated');
  assert(updatedProfile.phone === '+91 486 422 3450', 'Profile phone updated');
  assert(updatedProfile.version === profile.version + 1, 'Profile version incremented for optimistic locking');

  // 1.3 Concurrency Conflict (Stale version)
  try {
    await dbUpdateHospitalProfile({
      displayName: 'Stale Attempt',
      version: profile.version // Stale version
    }, superActor);
    assert(false, 'Stale version update should throw CONCURRENT_MODIFICATION');
  } catch (err: any) {
    assert(err.message.includes('CONCURRENT_MODIFICATION'), 'Stale version rejected with CONCURRENT_MODIFICATION');
  }

  // 1.4 Currency constraint rejection
  try {
    await dbUpdateHospitalProfile({
      currency: 'USD',
      version: updatedProfile.version
    }, superActor);
    assert(false, 'Non-INR currency should throw INVALID_CURRENCY');
  } catch (err: any) {
    assert(err.message.includes('INVALID_CURRENCY'), 'Non-INR currency rejected with INVALID_CURRENCY');
  }

  // Restore profile
  await dbUpdateHospitalProfile({
    displayName: 'Sahachara Ayurveda',
    phone: '+91 486 422 3400',
    version: updatedProfile.version
  }, superActor);

  // ============================================================================
  // 2. DEPARTMENT MASTER SERVICES
  // ============================================================================
  console.log('\n▶ 2. DEPARTMENT MASTER CRUD & VALIDATIONS');

  const timestamp = Date.now();
  const testDeptCode = `KAY${String(timestamp).slice(-4)}`;
  const testDeptName = `Kayachikitsa Clinical ${timestamp}`;

  // 2.1 Department creation
  const createdDept = await dbCreateDepartment({
    code: testDeptCode,
    name: testDeptName,
    discipline: 'AYURVEDA',
    description: 'Internal Ayurvedic Medicine Department'
  }, testActor);

  assert(createdDept.code === testDeptCode, 'Department created with uppercase alphanumeric code');
  assert(createdDept.name === testDeptName, 'Department created with expected name');
  assert(createdDept.discipline === 'AYURVEDA', 'Department discipline is AYURVEDA');
  assert(createdDept.isActive === true, 'Department initial status is active');

  // 2.2 Rejection of invalid codes (lowercase, space, special char, length)
  try {
    await dbCreateDepartment({ code: 'kaya', name: `Dept Lower ${timestamp}` }, testActor);
    assert(false, 'Lowercase code should throw InvalidDepartmentCode');
  } catch (err: any) {
    assert(err.message.includes('InvalidDepartmentCode'), 'Lowercase code rejected without silent normalization');
  }

  try {
    await dbCreateDepartment({ code: 'KA YA', name: `Dept Space ${timestamp}` }, testActor);
    assert(false, 'Code with space should throw InvalidDepartmentCode');
  } catch (err: any) {
    assert(err.message.includes('InvalidDepartmentCode'), 'Code with spaces rejected');
  }

  try {
    await dbCreateDepartment({ code: 'K', name: `Dept Short ${timestamp}` }, testActor);
    assert(false, 'Code shorter than 2 chars should throw InvalidDepartmentCode');
  } catch (err: any) {
    assert(err.message.includes('InvalidDepartmentCode'), 'Code shorter than 2 characters rejected');
  }

  try {
    await dbCreateDepartment({ code: 'KAYACHIKITSA_EXTRA', name: `Dept Long ${timestamp}` }, testActor);
    assert(false, 'Code longer than 10 chars should throw InvalidDepartmentCode');
  } catch (err: any) {
    assert(err.message.includes('InvalidDepartmentCode'), 'Code longer than 10 characters rejected');
  }

  // 2.3 Duplicate code rejection
  try {
    await dbCreateDepartment({ code: testDeptCode, name: `Different Name ${timestamp}` }, testActor);
    assert(false, 'Duplicate code should throw DuplicateDepartmentCode');
  } catch (err: any) {
    assert(err.message.includes('DuplicateDepartmentCode'), 'Duplicate department code rejected');
  }

  // 2.4 Case-insensitive duplicate name rejection
  try {
    await dbCreateDepartment({
      code: `DPT${String(timestamp + 1).slice(-4)}`,
      name: testDeptName.toLowerCase() // Exact match in lowercase
    }, testActor);
    assert(false, 'Duplicate case-insensitive name should throw DuplicateDepartmentName');
  } catch (err: any) {
    assert(err.message.includes('DuplicateDepartmentName'), 'Case-insensitive duplicate department name rejected');
  }

  // 2.5 Department update
  const updatedDept = await dbUpdateDepartment(createdDept.id, {
    description: 'Updated Internal Medicine Description'
  }, testActor);
  assert(updatedDept.description === 'Updated Internal Medicine Description', 'Department description updated');

  // 2.6 Department code immutability
  try {
    await dbUpdateDepartment(createdDept.id, { code: 'NEWCODE' } as any, testActor);
    assert(false, 'Updating code should throw IMMUTABLE_DEPARTMENT_CODE');
  } catch (err: any) {
    assert(err.message.includes('IMMUTABLE_DEPARTMENT_CODE'), 'Department code is strictly immutable');
  }

  // 2.7 Soft deactivation and reactivation
  const deactivatedDept = await dbDeactivateDepartment(createdDept.id, 'Temporary seasonal hiatus', testActor);
  assert(deactivatedDept.isActive === false, 'Department soft-deactivated (isActive = false)');
  assert(deactivatedDept.deactivationReason === 'Temporary seasonal hiatus', 'Deactivation reason recorded');
  assert(deactivatedDept.deactivatedAt !== null, 'Deactivation timestamp recorded');

  const reactivatedDept = await dbActivateDepartment(createdDept.id, testActor);
  assert(reactivatedDept.isActive === true, 'Department reactivated (isActive = true)');
  assert(reactivatedDept.deactivatedAt === null, 'Deactivation timestamp cleared');

  // ============================================================================
  // 3. STAFF DEPARTMENT ASSIGNMENT SERVICES
  // ============================================================================
  console.log('\n▶ 3. STAFF DEPARTMENT ASSIGNMENTS & LEGACY SYNCHRONIZATION');

  // Create a clean test staff member
  const staffEmail = `stage3a.staff.${timestamp}@sahachara.com`;
  const { staff: createdStaff } = await dbCreateStaffMember({
    name: 'Dr. Stage 3A Physician',
    role: 'DOCTOR',
    designation: 'Senior Medical Officer',
    department: 'Initial Legacy Ward',
    email: staffEmail,
    phone: '+91 98450 77112'
  }, testActor);

  assert(createdStaff.department === 'Initial Legacy Ward', 'Initial staff created with legacy department');

  // Create two distinct active departments
  const deptA = await dbCreateDepartment({
    code: `DEP${String(timestamp).slice(-3)}A`,
    name: `Clinical Service A ${timestamp}`,
    discipline: 'MODERN_MEDICINE'
  }, testActor);

  const deptB = await dbCreateDepartment({
    code: `DEP${String(timestamp).slice(-3)}B`,
    name: `Clinical Service B ${timestamp}`,
    discipline: 'AYURVEDA'
  }, testActor);

  const deptC = await dbCreateDepartment({
    code: `DEP${String(timestamp).slice(-3)}C`,
    name: `Clinical Service C ${timestamp}`,
    discipline: 'ALLIED'
  }, testActor);

  // 3.1 Primary assignment creation & atomic legacy synchronization
  const asgPrimaryA = await dbAssignStaffDepartment({
    staffId: createdStaff.id,
    departmentId: deptA.id,
    isPrimary: true,
    roleTitle: 'Primary Attending Physician'
  }, testActor);

  assert(asgPrimaryA.isPrimary === true, 'Assignment marked as primary');
  assert(asgPrimaryA.status === 'active', 'Assignment status is active');

  // Verify StaffMember and User synchronization
  const refreshedStaffA = await prisma.staffMember.findUnique({ where: { id: createdStaff.id } });
  assert(refreshedStaffA?.primaryDepartmentId === deptA.id, 'StaffMember.primaryDepartmentId synchronized with deptA.id');
  assert(refreshedStaffA?.department === deptA.name, 'StaffMember.department synchronized with deptA.name');

  if (refreshedStaffA?.userId) {
    const linkedUserA = await prisma.user.findUnique({ where: { id: refreshedStaffA.userId } });
    assert(linkedUserA?.department === deptA.name, 'User.department synchronized with deptA.name');
  }

  // 3.2 Secondary non-primary assignment
  const asgSecondary = await dbAssignStaffDepartment({
    staffId: createdStaff.id,
    departmentId: deptC.id,
    isPrimary: false,
    roleTitle: 'Visiting Consultant'
  }, testActor);

  assert(asgSecondary.isPrimary === false, 'Secondary assignment isPrimary is false');
  assert(asgSecondary.status === 'active', 'Secondary assignment status is active');

  // Verify that secondary assignment DID NOT overwrite legacy primary department
  const refreshedStaffAfterSec = await prisma.staffMember.findUnique({ where: { id: createdStaff.id } });
  assert(refreshedStaffAfterSec?.primaryDepartmentId === deptA.id, 'Secondary assignment preserved primaryDepartmentId');
  assert(refreshedStaffAfterSec?.department === deptA.name, 'Secondary assignment did NOT overwrite StaffMember.department');

  // 3.3 Multiple assignments query
  const allStaffAssignments = await dbGetStaffAssignments(createdStaff.id);
  assert(allStaffAssignments.length === 2, 'Staff member has exactly 2 assignments');
  const currentPrimary = await dbGetPrimaryStaffAssignment(createdStaff.id);
  assert(currentPrimary?.departmentId === deptA.id, 'Current primary assignment is deptA');

  // 3.4 Change primary department atomically (deptA -> deptB)
  const asgPrimaryB = await dbChangePrimaryDepartment(createdStaff.id, deptB.id, testActor, 'Departmental transfer');
  assert(asgPrimaryB.isPrimary === true, 'New assignment in deptB is primary');
  assert(asgPrimaryB.departmentId === deptB.id, 'New primary assignment points to deptB');

  // Check previous primary assignment was marked transferred
  const oldPrimary = await prisma.staffDepartmentAssignment.findUnique({ where: { id: asgPrimaryA.id } });
  assert(oldPrimary?.status === 'transferred', 'Old primary assignment status transitioned to "transferred"');
  assert(oldPrimary?.isPrimary === false, 'Old primary assignment isPrimary is false');
  assert(oldPrimary?.endDate !== null, 'Old primary assignment has recorded endDate');

  // Verify legacy fields updated to deptB
  const refreshedStaffB = await prisma.staffMember.findUnique({ where: { id: createdStaff.id } });
  assert(refreshedStaffB?.primaryDepartmentId === deptB.id, 'StaffMember.primaryDepartmentId updated to deptB.id');
  assert(refreshedStaffB?.department === deptB.name, 'StaffMember.department updated to deptB.name');

  if (refreshedStaffB?.userId) {
    const linkedUserB = await prisma.user.findUnique({ where: { id: refreshedStaffB.userId } });
    assert(linkedUserB?.department === deptB.name, 'User.department updated to deptB.name');
  }

  // 3.5 Assignment status updates (completion and revocation)
  const completedSec = await dbUpdateAssignmentStatus(asgSecondary.id, 'completed', testActor, 'Consultation term expired');
  assert(completedSec.status === 'completed', 'Secondary assignment status is completed');
  assert(completedSec.endDate !== null, 'Completed assignment has endDate');

  // Terminate primary assignment
  const revokedPrimary = await dbUpdateAssignmentStatus(asgPrimaryB.id, 'revoked', testActor, 'Administrative reassignment');
  assert(revokedPrimary.status === 'revoked', 'Primary assignment status is revoked');
  assert(revokedPrimary.isPrimary === false, 'Revoked primary isPrimary is false');

  // When no active primary remains, primaryDepartmentId is NULL, while department string preserves value
  const staffNoPrimary = await prisma.staffMember.findUnique({ where: { id: createdStaff.id } });
  assert(staffNoPrimary?.primaryDepartmentId === null, 'StaffMember.primaryDepartmentId cleared to NULL when primary revoked');
  assert(staffNoPrimary?.department === deptB.name, 'Legacy StaffMember.department preserves previous non-null value');

  // ============================================================================
  // 4. BUSINESS RULE ENFORCEMENT & CONCURRENCY
  // ============================================================================
  console.log('\n▶ 4. BUSINESS RULES & CONCURRENCY SAFEGUARDS');

  // 4.1 Inactive department rejects assignments
  const inactiveDept = await dbCreateDepartment({
    code: `INACT${String(timestamp).slice(-3)}`,
    name: `Deactivated Dept ${timestamp}`,
    discipline: 'OPERATIONAL'
  }, testActor);
  await dbDeactivateDepartment(inactiveDept.id, 'Operational closure', testActor);

  try {
    await dbAssignStaffDepartment({
      staffId: createdStaff.id,
      departmentId: inactiveDept.id,
      isPrimary: false
    }, testActor);
    assert(false, 'Assignment to inactive department should throw DEPARTMENT_INACTIVE');
  } catch (err: any) {
    assert(err.message.includes('DEPARTMENT_INACTIVE'), 'Assignment to inactive department rejected');
  }

  // 4.2 Suspended staff rejects new assignments
  await prisma.staffMember.update({
    where: { id: createdStaff.id },
    data: { isSuspended: true, status: 'suspended' }
  });

  try {
    await dbAssignStaffDepartment({
      staffId: createdStaff.id,
      departmentId: deptA.id,
      isPrimary: false
    }, testActor);
    assert(false, 'Assignment to suspended staff should throw STAFF_INELIGIBLE_FOR_ASSIGNMENT');
  } catch (err: any) {
    assert(err.message.includes('STAFF_INELIGIBLE_FOR_ASSIGNMENT'), 'Assignment to suspended staff member rejected');
  }

  // 4.3 Archived staff rejects new assignments
  await prisma.staffMember.update({
    where: { id: createdStaff.id },
    data: { isSuspended: false, archivedAt: new Date(), status: 'archived' }
  });

  try {
    await dbAssignStaffDepartment({
      staffId: createdStaff.id,
      departmentId: deptA.id,
      isPrimary: false
    }, testActor);
    assert(false, 'Assignment to archived staff should throw STAFF_INELIGIBLE_FOR_ASSIGNMENT');
  } catch (err: any) {
    assert(err.message.includes('STAFF_INELIGIBLE_FOR_ASSIGNMENT'), 'Assignment to archived staff member rejected');
  }

  // 4.4 Concurrency protection: Serializing competing primary assignment requests
  const { staff: activeStaff } = await dbCreateStaffMember({
    name: 'Dr. Concurrency Physician',
    role: 'DOCTOR',
    designation: 'Specialist',
    department: 'Cardiology',
    email: `concurrency.${timestamp}@sahachara.com`,
    phone: '+91 98450 88221'
  }, testActor);

  // Firing 5 concurrent primary assignment requests
  const concurrentResults = await Promise.allSettled([
    dbAssignStaffDepartment({ staffId: activeStaff.id, departmentId: deptA.id, isPrimary: true }, testActor),
    dbAssignStaffDepartment({ staffId: activeStaff.id, departmentId: deptB.id, isPrimary: true }, testActor),
    dbAssignStaffDepartment({ staffId: activeStaff.id, departmentId: deptA.id, isPrimary: true }, testActor),
    dbAssignStaffDepartment({ staffId: activeStaff.id, departmentId: deptB.id, isPrimary: true }, testActor),
    dbAssignStaffDepartment({ staffId: activeStaff.id, departmentId: deptA.id, isPrimary: true }, testActor)
  ]);

  const fulfilledCount = concurrentResults.filter(r => r.status === 'fulfilled').length;
  assert(fulfilledCount >= 1, `Concurrent primary requests handled safely (${fulfilledCount} succeeded)`);

  // Strictly at most ONE active primary assignment exists in PostgreSQL
  const activePrimaryCount = await prisma.staffDepartmentAssignment.count({
    where: {
      staffId: activeStaff.id,
      isPrimary: true,
      status: 'active'
    }
  });
  assert(activePrimaryCount === 1, 'PostgreSQL partial unique index guarantees strictly 1 active primary assignment');

  // ============================================================================
  // 5. PRODUCTION ZERO-MUTATION VERIFICATION
  // ============================================================================
  console.log('\n▶ 5. PRODUCTION DATABASE ZERO-MUTATION VERIFICATION');
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

  // Cleanup test departments & staff
  await prisma.staffDepartmentAssignment.deleteMany({
    where: { staffId: { in: [createdStaff.id, activeStaff.id] } }
  });
  await prisma.staffMember.deleteMany({
    where: { id: { in: [createdStaff.id, activeStaff.id] } }
  });
  if (createdStaff.userId) await prisma.user.delete({ where: { id: createdStaff.userId } }).catch(() => {});
  if (activeStaff.userId) await prisma.user.delete({ where: { id: activeStaff.userId } }).catch(() => {});
  await prisma.department.deleteMany({
    where: { id: { in: [createdDept.id, deptA.id, deptB.id, deptC.id, inactiveDept.id] } }
  });

  console.log('\n======================================================================');
  console.log(`   PHASE 6B STAGE 3A SERVICES VERIFICATION: ${passCount} PASSED, ${failCount} FAILED   `);
  console.log('======================================================================\n');

  await prodProbePrisma.$disconnect();
  await prisma.$disconnect();

  if (failCount > 0) {
    process.exit(1);
  }
}

runStage3aVerification().catch((err) => {
  console.error('Unhandled verification failure:', err);
  process.exit(1);
});
