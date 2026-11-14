/**
 * SAHACHARA OPS — AYUSH CLINICAL CREDENTIALS & LICENSING VERIFICATION SUITE
 *
 * Verifies all 12 core requirements:
 * 1. DOCTOR can view and edit their own credentials
 * 2. VAIDYA can view and edit their own credentials
 * 3. DOCTOR cannot edit another doctor's credentials (IDOR protection)
 * 4. VAIDYA cannot edit another practitioner's credentials (IDOR protection)
 * 5. ADMIN cannot access credentials (HTTP 403)
 * 6. SUPER_ADMIN cannot access credentials (HTTP 403)
 * 7. ACCOUNTANT cannot access credentials (HTTP 403)
 * 8. RECEPTIONIST cannot access credentials (HTTP 403)
 * 9. PHARMACIST cannot access credentials (HTTP 403)
 * 10. Missing credentials produce an empty state, not fabricated data
 * 11. Existing legitimate credentials remain intact across administrative staff mutations
 * 12. Organization boundaries and fail-closed session token authorization are enforced
 */

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgresql://highflyer@localhost:5432/sahachara_ops_test_db';
process.env.ENABLE_TEST_ACCOUNTS = 'true';
process.env.NODE_ENV = 'test';

import http from 'http';
import express from 'express';
import { apiRouter } from '../server/routes.ts';
import { generateSessionToken } from '../server/rbacMiddleware.ts';
import {
  prisma,
  checkPrismaConnection,
  isPrismaConnected,
  ensureDefaultDatabaseUsers,
  dbGetPractitionerCredentials,
  dbUpdatePractitionerCredentials,
  parsePractitionerCredentials,
  mapPrismaStaffToDomain
} from '../server/prismaService.ts';

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const CYAN = '\x1b[36m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

let passed = 0;
let failed = 0;

function assert(cond: boolean, name: string, detail?: string) {
  if (cond) {
    passed++;
    console.log(`  ${GREEN}✓ PASS${RESET} ${name}${detail ? ` (${detail})` : ''}`);
  } else {
    failed++;
    console.error(`  ${RED}✗ FAIL${RESET} ${name}: ${RED}${detail || 'Assertion failed'}${RESET}`);
  }
}

function makeRequest(
  port: number,
  method: string,
  path: string,
  token?: string,
  body?: any
): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const postData = body ? JSON.stringify(body) : undefined;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (postData) headers['Content-Length'] = Buffer.byteLength(postData).toString();

    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path,
        method,
        headers
      },
      (res) => {
        let raw = '';
        res.on('data', (c) => (raw += c));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode || 500, body: JSON.parse(raw) });
          } catch {
            resolve({ status: res.statusCode || 500, body: raw });
          }
        });
      }
    );
    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

async function runTests() {
  console.log(`\n${BOLD}${CYAN}======================================================================${RESET}`);
  console.log(`${BOLD}${CYAN}   SAHACHARA OPS — AYUSH CLINICAL CREDENTIALS VERIFICATION SUITE      ${RESET}`);
  console.log(`${BOLD}${CYAN}======================================================================${RESET}\n`);

  await checkPrismaConnection();
  assert(isPrismaConnected, 'PostgreSQL test database connected');
  await ensureDefaultDatabaseUsers();

  const app = express();
  app.use(express.json());
  app.use('/api', apiRouter);

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as any).port;

  // Session Tokens for all 7 roles
  const docToken = generateSessionToken({
    userId: 'usr-doc',
    email: 'robert.rivera@sahachara.com',
    name: 'Dr. Robert Rivera, MD',
    role: 'DOCTOR'
  });

  const vaidyaToken = generateSessionToken({
    userId: 'usr-vaidya',
    email: 'sarah.chen@sahachara.com',
    name: 'Dr. Sarah Chen, BAMS, MD (Ayu)',
    role: 'VAIDYA'
  });

  const adminToken = generateSessionToken({
    userId: 'usr-admin',
    email: 'admin.ops@sahachara.com',
    name: 'Marcus Sterling',
    role: 'ADMIN'
  });

  const superAdminToken = generateSessionToken({
    userId: 'usr-superadmin',
    email: 'systems@sahachara.com',
    name: 'Sahachara Systems',
    role: 'SUPER_ADMIN'
  });

  const accountantToken = generateSessionToken({
    userId: 'usr-accountant',
    email: 'accountant@sahachara.com',
    name: 'Anand Pillai',
    role: 'ACCOUNTANT'
  });

  const receptionistToken = generateSessionToken({
    userId: 'usr-reception',
    email: 'receptionist@sahachara.com',
    name: 'Kavita Sharma',
    role: 'RECEPTIONIST'
  });

  const pharmacistToken = generateSessionToken({
    userId: 'usr-pharma',
    email: 'pharmacist@sahachara.com',
    name: 'Rajesh Nair, RPh',
    role: 'PHARMACIST'
  });

  // -------------------------------------------------------------------------
  // 1. DOCTOR CAN VIEW AND EDIT THEIR OWN CREDENTIALS
  // -------------------------------------------------------------------------
  console.log(`\n${BOLD}▶ 1. DOCTOR SELF-SERVICE (VIEW & UPDATE CREDENTIALS)${RESET}`);
  {
    const getRes = await makeRequest(port, 'GET', '/api/practitioner/credentials', docToken);
    assert(getRes.status === 200, 'DOCTOR can retrieve own credentials (HTTP 200)');
    assert(getRes.body.success === true, 'Response reports success: true');

    const updatePayload = {
      qualification: 'MBBS, MD (Emergency Medicine)',
      discipline: 'Modern & Emergency Medicine',
      university: 'All India Institute of Medical Sciences (AIIMS)',
      registrationCouncil: 'Travancore-Cochin Medical Council',
      registrationNumber: 'MD-KL-99214',
      registrationDate: '2016-04-12',
      registrationExpiryDate: '2031-04-11',
      supportingCertificate: 'tcmc_reg_99214.pdf'
    };

    const putRes = await makeRequest(port, 'PUT', '/api/practitioner/credentials', docToken, updatePayload);
    assert(putRes.status === 200, 'DOCTOR can update own credentials (HTTP 200)');
    assert(putRes.body.data.qualification === updatePayload.qualification, 'Updated qualification matches');
    assert(putRes.body.data.discipline === updatePayload.discipline, 'Updated discipline matches');
    assert(putRes.body.data.university === updatePayload.university, 'Updated university matches');
    assert(putRes.body.data.registrationCouncil === updatePayload.registrationCouncil, 'Updated council matches');
    assert(putRes.body.data.registrationNumber === updatePayload.registrationNumber, 'Updated registrationNumber matches');
    assert(putRes.body.data.registrationDate === updatePayload.registrationDate, 'Updated registrationDate matches');
    assert(putRes.body.data.registrationExpiryDate === updatePayload.registrationExpiryDate, 'Updated registrationExpiryDate matches');
    assert(putRes.body.data.supportingCertificate === updatePayload.supportingCertificate, 'Updated certificate reference matches');

    // Confirm PostgreSQL persistence
    const dbDocStaff = await prisma.staffMember.findFirst({ where: { userId: 'usr-doc' } });
    assert(dbDocStaff?.licenseNumber === 'MD-KL-99214', 'PostgreSQL staff_members licenseNumber synced');
    assert(dbDocStaff?.qualification === updatePayload.qualification, 'PostgreSQL staff_members qualification persisted');

    const dbDocUser = await prisma.user.findUnique({ where: { id: 'usr-doc' } });
    assert(dbDocUser?.licenseNumber === 'MD-KL-99214', 'PostgreSQL users licenseNumber synced');

    // Re-verify GET endpoint returns the persisted dossier
    const getAgain = await makeRequest(port, 'GET', '/api/practitioner/credentials', docToken);
    assert(getAgain.body.data.registrationNumber === 'MD-KL-99214', 'GET reflects persisted registration number');
    assert(getAgain.body.data.university === 'All India Institute of Medical Sciences (AIIMS)', 'GET reflects persisted university');
  }

  // -------------------------------------------------------------------------
  // 2. VAIDYA CAN VIEW AND EDIT THEIR OWN CREDENTIALS
  // -------------------------------------------------------------------------
  console.log(`\n${BOLD}▶ 2. VAIDYA SELF-SERVICE (VIEW & UPDATE CREDENTIALS)${RESET}`);
  {
    const getRes = await makeRequest(port, 'GET', '/api/practitioner/credentials', vaidyaToken);
    assert(getRes.status === 200, 'VAIDYA can retrieve own credentials (HTTP 200)');

    const updatePayload = {
      qualification: 'BAMS, MD (Ayurveda - Kayachikitsa)',
      discipline: 'Ayurveda & Panchakarma',
      university: 'Government Ayurveda College, Thiruvananthapuram',
      registrationCouncil: 'Travancore-Cochin Medical Council (ISM)',
      registrationNumber: 'AYUSH-KL-88201',
      registrationDate: '2014-07-22',
      registrationExpiryDate: '2029-07-21',
      supportingCertificate: 'ayush_kl_88201_certificate.pdf'
    };

    const putRes = await makeRequest(port, 'PUT', '/api/practitioner/credentials', vaidyaToken, updatePayload);
    assert(putRes.status === 200, 'VAIDYA can update own credentials (HTTP 200)');
    assert(putRes.body.data.qualification === updatePayload.qualification, 'VAIDYA qualification matches');
    assert(putRes.body.data.discipline === updatePayload.discipline, 'VAIDYA discipline matches');
    assert(putRes.body.data.university === updatePayload.university, 'VAIDYA university matches');
    assert(putRes.body.data.registrationCouncil === updatePayload.registrationCouncil, 'VAIDYA council matches');
    assert(putRes.body.data.registrationNumber === 'AYUSH-KL-88201', 'VAIDYA registrationNumber matches');

    // Confirm PostgreSQL persistence
    const dbVaidyaStaff = await prisma.staffMember.findFirst({ where: { userId: 'usr-vaidya' } });
    assert(dbVaidyaStaff?.licenseNumber === 'AYUSH-KL-88201', 'PostgreSQL staff_members licenseNumber synced');
    assert(dbVaidyaStaff?.qualification === updatePayload.qualification, 'PostgreSQL staff_members qualification persisted');

    const dbVaidyaUser = await prisma.user.findUnique({ where: { id: 'usr-vaidya' } });
    assert(dbVaidyaUser?.licenseNumber === 'AYUSH-KL-88201', 'PostgreSQL users licenseNumber synced');
  }

  // -------------------------------------------------------------------------
  // 3. DOCTOR CANNOT EDIT ANOTHER DOCTOR'S CREDENTIALS (IDOR)
  // -------------------------------------------------------------------------
  console.log(`\n${BOLD}▶ 3. DOCTOR IDOR PROTECTION (CANNOT EDIT ANOTHER DOCTOR)${RESET}`);
  {
    // Create second doctor account
    const doc2Email = `dr.secondary.${Date.now()}@sahachara.com`;
    const doc2User = await prisma.user.create({
      data: {
        id: `usr-doc2-${Date.now()}`,
        email: doc2Email,
        name: 'Dr. Secondary Physician',
        role: 'DOCTOR',
        status: 'active',
        licenseNumber: 'MD-SEC-11002'
      }
    });
    const doc2Staff = await prisma.staffMember.create({
      data: {
        id: `stf-doc2-${Date.now()}`,
        employeeId: `STF-2026-91002`,
        name: 'Dr. Secondary Physician',
        role: 'DOCTOR',
        designation: 'Staff Physician',
        department: 'General Medicine',
        email: doc2Email,
        phone: '+91 98450 44444',
        status: 'active',
        userId: doc2User.id,
        licenseNumber: 'MD-SEC-11002'
      }
    });

    // Doctor 1 attempts to update Doctor 2 via /api/practitioner/credentials/:id
    const idorRes = await makeRequest(port, 'PUT', `/api/practitioner/credentials/${doc2Staff.id}`, docToken, {
      registrationNumber: 'HACKED-REG-NO'
    });
    assert(idorRes.status === 403, 'DOCTOR editing another doctor by ID rejected with HTTP 403 Forbidden', `Status: ${idorRes.status}`);
    assert(idorRes.body.error === 'Forbidden', 'Error reports Forbidden');

    // Doctor 1 attempts to view Doctor 2 credentials
    const idorGet = await makeRequest(port, 'GET', `/api/practitioner/credentials/${doc2Staff.id}`, docToken);
    assert(idorGet.status === 403, 'DOCTOR viewing another doctor by ID rejected with HTTP 403 Forbidden', `Status: ${idorGet.status}`);

    // Verify Doctor 2 was NOT mutated
    const checkDoc2 = await prisma.staffMember.findUnique({ where: { id: doc2Staff.id } });
    assert(checkDoc2?.licenseNumber === 'MD-SEC-11002', 'Target doctor licenseNumber intact (IDOR prevented)');

    // Cleanup doctor 2
    await prisma.staffMember.delete({ where: { id: doc2Staff.id } });
    await prisma.user.delete({ where: { id: doc2User.id } });
  }

  // -------------------------------------------------------------------------
  // 4. VAIDYA CANNOT EDIT ANOTHER PRACTITIONER'S CREDENTIALS (IDOR)
  // -------------------------------------------------------------------------
  console.log(`\n${BOLD}▶ 4. VAIDYA IDOR PROTECTION (CANNOT EDIT ANOTHER PRACTITIONER)${RESET}`);
  {
    // Vaidya attempts to update Doctor 1 credentials
    const vaidyaIdor = await makeRequest(port, 'PUT', '/api/practitioner/credentials/stf-doc-01', vaidyaToken, {
      registrationNumber: 'VAIDYA-OVERWRITE'
    });
    assert(vaidyaIdor.status === 403, 'VAIDYA editing DOCTOR rejected with HTTP 403 Forbidden', `Status: ${vaidyaIdor.status}`);

    // Vaidya attempts to view Doctor 1 credentials by ID
    const vaidyaGetIdor = await makeRequest(port, 'GET', '/api/practitioner/credentials/stf-doc-01', vaidyaToken);
    assert(vaidyaGetIdor.status === 403, 'VAIDYA viewing DOCTOR by ID rejected with HTTP 403 Forbidden', `Status: ${vaidyaGetIdor.status}`);
  }

  // -------------------------------------------------------------------------
  // 5-9. NON-CLINICAL & ADMINISTRATIVE ROLES CANNOT ACCESS CREDENTIALS
  // -------------------------------------------------------------------------
  console.log(`\n${BOLD}▶ 5-9. ROLE EXCLUSION ENFORCEMENT (ADMIN, SUPER_ADMIN, ACCOUNTANT, RECEPTIONIST, PHARMACIST)${RESET}`);
  {
    // 5. ADMIN
    const adminGet = await makeRequest(port, 'GET', '/api/practitioner/credentials', adminToken);
    assert(adminGet.status === 403, 'ADMIN GET credentials strictly rejected with HTTP 403', `Status: ${adminGet.status}`);
    const adminPut = await makeRequest(port, 'PUT', '/api/practitioner/credentials', adminToken, { registrationNumber: 'ADMIN-MUT' });
    assert(adminPut.status === 403, 'ADMIN PUT credentials strictly rejected with HTTP 403', `Status: ${adminPut.status}`);

    // 6. SUPER_ADMIN
    const superAdminGet = await makeRequest(port, 'GET', '/api/practitioner/credentials', superAdminToken);
    assert(superAdminGet.status === 403, 'SUPER_ADMIN GET credentials strictly rejected with HTTP 403', `Status: ${superAdminGet.status}`);
    const superAdminPut = await makeRequest(port, 'PUT', '/api/practitioner/credentials', superAdminToken, { registrationNumber: 'SUPER-MUT' });
    assert(superAdminPut.status === 403, 'SUPER_ADMIN PUT credentials strictly rejected with HTTP 403', `Status: ${superAdminPut.status}`);

    // 7. ACCOUNTANT
    const accGet = await makeRequest(port, 'GET', '/api/practitioner/credentials', accountantToken);
    assert(accGet.status === 403, 'ACCOUNTANT GET credentials strictly rejected with HTTP 403', `Status: ${accGet.status}`);
    const accPut = await makeRequest(port, 'PUT', '/api/practitioner/credentials', accountantToken, { registrationNumber: 'ACC-MUT' });
    assert(accPut.status === 403, 'ACCOUNTANT PUT credentials strictly rejected with HTTP 403', `Status: ${accPut.status}`);

    // 8. RECEPTIONIST
    const recGet = await makeRequest(port, 'GET', '/api/practitioner/credentials', receptionistToken);
    assert(recGet.status === 403, 'RECEPTIONIST GET credentials strictly rejected with HTTP 403', `Status: ${recGet.status}`);
    const recPut = await makeRequest(port, 'PUT', '/api/practitioner/credentials', receptionistToken, { registrationNumber: 'REC-MUT' });
    assert(recPut.status === 403, 'RECEPTIONIST PUT credentials strictly rejected with HTTP 403', `Status: ${recPut.status}`);

    // 9. PHARMACIST
    const pharmaGet = await makeRequest(port, 'GET', '/api/practitioner/credentials', pharmacistToken);
    assert(pharmaGet.status === 403, 'PHARMACIST GET credentials strictly rejected with HTTP 403', `Status: ${pharmaGet.status}`);
    const pharmaPut = await makeRequest(port, 'PUT', '/api/practitioner/credentials', pharmacistToken, { registrationNumber: 'PHARMA-MUT' });
    assert(pharmaPut.status === 403, 'PHARMACIST PUT credentials strictly rejected with HTTP 403', `Status: ${pharmaPut.status}`);
  }

  // -------------------------------------------------------------------------
  // 10. MISSING CREDENTIALS PRODUCE AN EMPTY STATE, NOT FABRICATED DATA
  // -------------------------------------------------------------------------
  console.log(`\n${BOLD}▶ 10. EMPTY STATE ENFORCEMENT (NO FABRICATED DATA)${RESET}`);
  {
    const emptyEmail = `dr.newbie.${Date.now()}@sahachara.com`;
    const newDocUser = await prisma.user.create({
      data: {
        id: `usr-newbie-${Date.now()}`,
        email: emptyEmail,
        name: 'Dr. Newbie Practitioner',
        role: 'DOCTOR',
        status: 'active',
        licenseNumber: null
      }
    });
    const newDocStaff = await prisma.staffMember.create({
      data: {
        id: `stf-newbie-${Date.now()}`,
        employeeId: `STF-2026-91999`,
        name: 'Dr. Newbie Practitioner',
        role: 'DOCTOR',
        designation: 'Junior Resident',
        department: 'General Medicine',
        email: emptyEmail,
        phone: '+91 98450 55555',
        status: 'active',
        userId: newDocUser.id,
        licenseNumber: null,
        qualification: null,
        discipline: null,
        notes: null
      }
    });

    const newbieToken = generateSessionToken({
      userId: newDocUser.id,
      email: emptyEmail,
      name: 'Dr. Newbie Practitioner',
      role: 'DOCTOR'
    });

    const emptyRes = await makeRequest(port, 'GET', '/api/practitioner/credentials', newbieToken);
    assert(emptyRes.status === 200, 'New practitioner credentials query returns HTTP 200');
    assert(emptyRes.body.data === null, 'Missing credentials strictly return null (no fabricated degrees or dates)');

    // Direct unit evaluation of parsePractitionerCredentials
    const parsedEmpty = parsePractitionerCredentials(newDocStaff, newDocUser);
    assert(parsedEmpty === null, 'parsePractitionerCredentials returns null for record with zero credentials');

    // Clean up
    await prisma.staffMember.delete({ where: { id: newDocStaff.id } });
    await prisma.user.delete({ where: { id: newDocUser.id } });
  }

  // -------------------------------------------------------------------------
  // 11. EXISTING LEGITIMATE CREDENTIALS REMAIN INTACT & STAFF MIGRATION SAFETY
  // -------------------------------------------------------------------------
  console.log(`\n${BOLD}▶ 11. PRESERVATION OF EXISTING CREDENTIALS & ISOLATION FROM ADMIN MUTATIONS${RESET}`);
  {
    // Retrieve Vaidya credentials before admin staff update
    const vaidyaStaffBefore = await prisma.staffMember.findFirst({ where: { userId: 'usr-vaidya' } });
    assert(Boolean(vaidyaStaffBefore?.notes?.includes('ayush_kl_88201_certificate.pdf')), 'Vaidya credentials stored in envelope');

    // Admin updates Vaidya phone and shift via /api/staff/:id
    const adminUpdate = await makeRequest(port, 'PATCH', `/api/staff/${vaidyaStaffBefore!.id}`, adminToken, {
      phone: '+91 98450 33333',
      shift: 'Morning (07:00-15:00)',
      notes: 'Updated general notes from hospital administration'
    });
    assert(adminUpdate.status === 200, 'ADMIN updates general staff profile (HTTP 200)');

    // Ensure Admin's staff query does NOT return the credentials payload in general notes
    assert(adminUpdate.body.data.notes === 'Updated general notes from hospital administration', 'ADMIN staff view receives only clean human notes, not credentials envelope');

    // Verify Vaidya's credentials remained 100% intact
    const vaidyaGetAfter = await makeRequest(port, 'GET', '/api/practitioner/credentials', vaidyaToken);
    assert(vaidyaGetAfter.status === 200, 'VAIDYA can still view credentials after admin staff update');
    assert(vaidyaGetAfter.body.data.registrationNumber === 'AYUSH-KL-88201', 'VAIDYA registrationNumber preserved');
    assert(vaidyaGetAfter.body.data.university === 'Government Ayurveda College, Thiruvananthapuram', 'VAIDYA university preserved');
    assert(vaidyaGetAfter.body.data.supportingCertificate === 'ayush_kl_88201_certificate.pdf', 'VAIDYA supportingCertificate preserved');
  }

  // -------------------------------------------------------------------------
  // 12. ORGANIZATION BOUNDARIES & AUTHENTICATION ENFORCEMENT
  // -------------------------------------------------------------------------
  console.log(`\n${BOLD}▶ 12. ORGANIZATION BOUNDARIES & FAIL-CLOSED AUTHENTICATION${RESET}`);
  {
    // Unauthenticated request
    const noAuth = await makeRequest(port, 'GET', '/api/practitioner/credentials');
    assert(noAuth.status === 401, 'Unauthenticated request rejected with HTTP 401 Unauthorized', `Status: ${noAuth.status}`);

    // Tampered token
    const badAuth = await makeRequest(port, 'GET', '/api/practitioner/credentials', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.badtoken');
    assert(badAuth.status === 401, 'Tampered token rejected with HTTP 401 Unauthorized', `Status: ${badAuth.status}`);

    // External domain token
    const externalToken = generateSessionToken({
      userId: 'usr-ext-doc',
      email: 'intruder@external-hospital.org',
      name: 'Intruder MD',
      role: 'DOCTOR'
    });
    const extRes = await makeRequest(port, 'GET', '/api/practitioner/credentials', externalToken);
    assert(extRes.status === 401, 'External domain identity rejected by fail-closed active-user check (HTTP 401)', `Status: ${extRes.status}`);
  }

  server.close();

  console.log(`\n${BOLD}${CYAN}======================================================================${RESET}`);
  console.log(`${BOLD}${CYAN}   VERIFICATION COMPLETE: ${passed} PASSED, ${failed} FAILED         ${RESET}`);
  console.log(`${BOLD}${CYAN}======================================================================${RESET}\n`);

  if (failed > 0) process.exit(1);
}

runTests().catch((err) => {
  console.error('Verification script encountered unexpected error:', err);
  process.exit(1);
});
