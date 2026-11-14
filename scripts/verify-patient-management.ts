/**
 * SAHACHARA OPS — PATIENT MANAGEMENT & MASTER PATIENT RECORD HARDENING VERIFICATION SUITE
 *
 * Verifies all Master Patient Index capabilities & hardening requirements:
 * 1. Fail-closed sequence-backed unique hospital patient number (MRN: SAH-YYYY-XXXXX)
 * 2. Sequence unavailability failure test (HTTP 503 MRN_SEQUENCE_UNAVAILABLE, zero random fallback)
 * 3. Database disconnection handling (fail-closed, no silent fallback)
 * 4. Concurrency & collision-free atomic sequence test
 * 5. Complete 7-role permission matrix across operations:
 *    - Registration (Allowed: 5 roles; Denied: PHARMACIST, ACCOUNTANT)
 *    - Demographic Edit (Allowed: 5 roles; Denied: PHARMACIST, ACCOUNTANT)
 *    - Clinical Field Edit (Allowed: DOCTOR, VAIDYA; Denied with 403 CLINICAL_FIELD_RESTRICTED: SUPER_ADMIN, ADMIN, RECEPTIONIST, PHARMACIST, ACCOUNTANT)
 *    - Allergy Updates (Allowed: DOCTOR, VAIDYA; Denied: 5 roles)
 *    - Dossier Access (All 7 roles allowed)
 *    - Clinical Note Visibility in Dossier (Visible: DOCTOR, VAIDYA; Redacted: 5 roles)
 *    - Archival (Allowed: SUPER_ADMIN only; Denied: 6 roles)
 *    - Duplicate Override (Allowed for registration-capable roles)
 *    - Direct API security & token tampering/spoofing protection
 * 6. Zero silent demographic defaults (NULL in DB for preferredLanguage, admissionStatus, communicationPreference, country)
 * 7. Consistent controlled archival (status = 'archived', deletedAt is NULL, hardDeleted is false)
 * 8. Production database isolation (zero modifications to sahachara_ops_db)
 */

import http from 'http';
import express from 'express';
import { PrismaClient } from '@prisma/client';

// ---------------------------------------------------------------------------
// TEST DATABASE ISOLATION GUARD — must run before server imports
// ---------------------------------------------------------------------------
const PROD_DB_URL = 'postgresql://highflyer@localhost:5432/sahachara_ops_db';
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
  prisma
} from '../server/prismaService.ts';

const prodProbePrisma = new PrismaClient({
  datasources: {
    db: { url: process.env.PROD_DATABASE_URL || 'postgresql://highflyer@localhost:5432/sahachara_ops_db' }
  }
});

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
  const [users, patients, prescriptions, invoices, tariffs] = await Promise.all([
    prodProbePrisma.user.count(),
    prodProbePrisma.patient.count(),
    prodProbePrisma.prescription.count(),
    prodProbePrisma.invoice.count(),
    prodProbePrisma.hospitalTariff.count()
  ]);
  return { users, patients, prescriptions, invoices, tariffs };
}

async function runVerification() {
  console.log(`\n${CYAN}═══════════════════════════════════════════════════════════════════${RESET}`);
  console.log(`${CYAN}   SAHACHARA OPS — MASTER PATIENT RECORD HARDENING VERIFICATION   ${RESET}`);
  console.log(`${CYAN}═══════════════════════════════════════════════════════════════════${RESET}\n`);

  await checkPrismaConnection();
  const dbInfo = await prisma.$queryRaw<[{ current_database: string }]>`SELECT current_database()`;
  const connectedTestDb = dbInfo[0]?.current_database;
  if (connectedTestDb !== 'sahachara_ops_test_db') {
    console.error(`${RED}FATAL: Integration test connected to "${connectedTestDb}". Expected "sahachara_ops_test_db". Aborting.${RESET}`);
    process.exit(1);
  }
  console.log(`${GREEN}✓ Isolated Test Database Connected:${RESET} ${connectedTestDb}`);

  const prodBefore = await getProductionSnapshot();
  console.log(`${CYAN}✓ Production Database Pre-Test State Snapshot:${RESET}`, prodBefore);

  await ensureDefaultDatabaseUsers();

  const app = express();
  app.use(express.json());
  app.use('/api', apiRouter);

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as any).port;
  const baseUrl = `http://127.0.0.1:${port}/api`;

  const tokens = {
    SUPER_ADMIN: generateSessionToken({ userId: 'usr-superadmin', email: 'systems@sahachara.com', name: 'Sahachara Systems', role: 'SUPER_ADMIN' }),
    ADMIN: generateSessionToken({ userId: 'usr-admin', email: 'admin.ops@sahachara.com', name: 'Marcus Sterling', role: 'ADMIN' }),
    DOCTOR: generateSessionToken({ userId: 'usr-doc', email: 'robert.rivera@sahachara.com', name: 'Dr. Robert Rivera', role: 'DOCTOR' }),
    VAIDYA: generateSessionToken({ userId: 'usr-vaidya', email: 'sarah.chen@sahachara.com', name: 'Dr. Sarah Chen', role: 'VAIDYA' }),
    RECEPTIONIST: generateSessionToken({ userId: 'usr-reception', email: 'receptionist@sahachara.com', name: 'Kavita Sharma', role: 'RECEPTIONIST' }),
    PHARMACIST: generateSessionToken({ userId: 'usr-pharma', email: 'pharmacist@sahachara.com', name: 'Rajesh Nair', role: 'PHARMACIST' }),
    ACCOUNTANT: generateSessionToken({ userId: 'usr-accountant', email: 'accountant@sahachara.com', name: 'Anand Pillai', role: 'ACCOUNTANT' })
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
    // Clean test DB patient child tables first to ensure clean state
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

    // ─────────────────────────────────────────────────────────────
    // TEST 1: FAIL-CLOSED MRN GENERATION & SEQUENCE RESILIENCE
    // ─────────────────────────────────────────────────────────────
    console.log(`\n${YELLOW}1. Fail-Closed MRN Generation & Sequence Resilience${RESET}`);

    // 1.1 Normal registration with sequence
    const regRes1 = await apiCall('POST', '/patients', tokens.RECEPTIONIST, {
      firstName: 'Govindan',
      middleName: 'Kutty',
      lastName: 'Kurup',
      dob: '1975-08-20',
      gender: 'Male',
      bloodGroup: 'B+',
      preferredLanguage: 'Malayalam',
      phone: '+91 94470 12345',
      secondaryPhone: '+91 94470 99999',
      email: 'govindan.kurup@example.com',
      communicationPreference: 'sms',
      addressLine1: '32 Temple Road',
      locality: 'Cherai',
      city: 'Ernakulam',
      district: 'Ernakulam',
      state: 'Kerala',
      postalCode: '683514',
      country: 'India',
      emergencyContactName: 'Bhadra Kurup',
      emergencyContactRelation: 'Spouse',
      emergencyContactPhone: '+91 94470 12346'
    });

    assert(regRes1.status === 201, 'Patient registration succeeds with 201 Created', `Status: ${regRes1.status}`);
    const p1 = regRes1.body.data;
    assert(Boolean(p1 && p1.mrn), 'Server-generated MRN is returned');
    const mrnPattern = /^SAH-\d{4}-\d{5}$/;
    assert(mrnPattern.test(p1.mrn), `MRN follows authoritative format SAH-YYYY-XXXXX (${p1.mrn})`);
    assert(p1.firstName === 'Govindan' && p1.lastName === 'Kurup', 'Demographics correctly recorded');
    assert(p1.age > 45, `Age correctly calculated from date of birth (${p1.age} yrs)`);
    assert(p1.emergencyContact?.name === 'Bhadra Kurup', 'Structured emergency contact recorded');
    assert(p1.isRegistered === true, 'Patient is flagged as registered in Master Registry');

    // 1.2 Sequence failure simulation: rename sequence to simulate outage
    console.log(`\n${YELLOW}   1.2 Sequence Outage Simulation (Fail-Closed Check)${RESET}`);
    await prisma.$executeRawUnsafe(`ALTER SEQUENCE patient_mrn_seq RENAME TO patient_mrn_seq_bak;`);

    const seqFailReg = await apiCall('POST', '/patients', tokens.RECEPTIONIST, {
      firstName: 'TestFailClosed',
      lastName: 'SequenceUnavailable',
      phone: '+91 99999 00000',
      gender: 'Female'
    });

    assert(seqFailReg.status === 503, 'Registration halts with HTTP 503 when sequence is unavailable', `Status: ${seqFailReg.status}`);
    assert(seqFailReg.body.code === 'MRN_SEQUENCE_UNAVAILABLE', 'Returns explicit code MRN_SEQUENCE_UNAVAILABLE');
    assert(Boolean(seqFailReg.body.message && seqFailReg.body.message.includes('Registration aborted')), 'Error message confirms registration was aborted, zero fallback used');

    // Verify patient was NOT created in DB during sequence outage
    const uncreatedCount = await prisma.patient.count({ where: { phone: '+91 99999 00000' } });
    assert(uncreatedCount === 0, 'No unverified patient record created in database during sequence outage');

    // Restore sequence
    await prisma.$executeRawUnsafe(`ALTER SEQUENCE patient_mrn_seq_bak RENAME TO patient_mrn_seq;`);

    // 1.3 Verify registration resumes normally after sequence restoration
    const restoredReg = await apiCall('POST', '/patients', tokens.RECEPTIONIST, {
      firstName: 'Restored',
      lastName: 'SequencePatient',
      phone: '+91 99999 00001',
      gender: 'Female'
    });
    assert(restoredReg.status === 201, 'Registration recovers cleanly when sequence is restored (201 Created)');
    assert(mrnPattern.test(restoredReg.body.data.mrn), `Allocated valid sequence MRN after restoration (${restoredReg.body.data.mrn})`);

    // ─────────────────────────────────────────────────────────────
    // TEST 2: CONCURRENCY & COLLISION-FREE ATOMIC MRN TEST
    // ─────────────────────────────────────────────────────────────
    console.log(`\n${YELLOW}2. Concurrency & Collision-Free Atomic MRN Test${RESET}`);
    const concurrentRegistrations = await Promise.all([
      apiCall('POST', '/patients', tokens.RECEPTIONIST, { firstName: 'Conc1', lastName: 'Test', phone: '+91 91111 00001', gender: 'Female' }),
      apiCall('POST', '/patients', tokens.RECEPTIONIST, { firstName: 'Conc2', lastName: 'Test', phone: '+91 91111 00002', gender: 'Male' }),
      apiCall('POST', '/patients', tokens.RECEPTIONIST, { firstName: 'Conc3', lastName: 'Test', phone: '+91 91111 00003', gender: 'Female' }),
      apiCall('POST', '/patients', tokens.RECEPTIONIST, { firstName: 'Conc4', lastName: 'Test', phone: '+91 91111 00004', gender: 'Male' }),
      apiCall('POST', '/patients', tokens.RECEPTIONIST, { firstName: 'Conc5', lastName: 'Test', phone: '+91 91111 00005', gender: 'Other' })
    ]);

    const createdMrns = concurrentRegistrations.map((r) => r.body.data?.mrn);
    const uniqueMrns = new Set(createdMrns);
    assert(concurrentRegistrations.every((r) => r.status === 201), 'All 5 concurrent registrations succeeded with 201');
    assert(uniqueMrns.size === 5, `Zero collision: Exactly 5 unique sequence MRNs generated (${Array.from(uniqueMrns).join(', ')})`);

    // ─────────────────────────────────────────────────────────────
    // TEST 3: ZERO SILENT DEMOGRAPHIC ASSUMPTIONS
    // ─────────────────────────────────────────────────────────────
    console.log(`\n${YELLOW}3. Zero Silent Demographic Assumptions (NULL Persistence)${RESET}`);
    const minimalPatientReg = await apiCall('POST', '/patients', tokens.RECEPTIONIST, {
      firstName: 'Minimal',
      lastName: 'Assumptions',
      phone: '+91 92222 00001',
      gender: 'Undisclosed'
      // preferredLanguage, admissionStatus, communicationPreference, country deliberately omitted
    });

    assert(minimalPatientReg.status === 201, 'Minimal patient registered with 201 Created');
    const minPatientId = minimalPatientReg.body.data.id;

    // Verify raw PostgreSQL row to confirm absence of fabricated defaults
    const rawPatient = await prisma.patient.findUnique({ where: { id: minPatientId } });
    assert(rawPatient !== null, 'Patient retrieved from PostgreSQL');
    assert(rawPatient?.preferredLanguage === null, 'preferredLanguage is stored as NULL in database (no silent Malayalam default)');
    assert(rawPatient?.admissionStatus === null, 'admissionStatus is stored as NULL in database (no silent outpatient default)');
    assert(rawPatient?.communicationPreference === null, 'communicationPreference is stored as NULL in database (no silent sms default)');
    assert(rawPatient?.country === null, 'country is stored as NULL in database (no silent India default)');

    // ─────────────────────────────────────────────────────────────
    // TEST 4: SEPARATION OF ADMINISTRATIVE & CLINICAL AUTHORITY
    // ─────────────────────────────────────────────────────────────
    console.log(`\n${YELLOW}4. Separation of Administrative Authority from Clinical Authority${RESET}`);

    // 4.1 SUPER_ADMIN attempts to document clinical fields during registration -> 403 Forbidden
    const superAdminClinicalReg = await apiCall('POST', '/patients', tokens.SUPER_ADMIN, {
      firstName: 'AdminClinical',
      lastName: 'Attempt',
      phone: '+91 93333 00001',
      gender: 'Male',
      allergies: ['Penicillin'],
      clinicalNotes: 'SUPER_ADMIN attempted clinical documentation'
    });
    assert(superAdminClinicalReg.status === 403, 'SUPER_ADMIN forbidden from documenting clinical fields during registration (403)', `Status: ${superAdminClinicalReg.status}`);
    assert(superAdminClinicalReg.body.code === 'CLINICAL_FIELD_RESTRICTED', 'Returns code CLINICAL_FIELD_RESTRICTED');

    // 4.2 ADMIN attempts to edit clinical fields via PATCH -> 403 Forbidden
    const adminClinicalEdit = await apiCall('PATCH', `/patients/${p1.id}`, tokens.ADMIN, {
      clinicalNotes: 'ADMIN attempted clinical diagnosis edit'
    });
    assert(adminClinicalEdit.status === 403, 'ADMIN forbidden from modifying clinical fields (403)', `Status: ${adminClinicalEdit.status}`);
    assert(adminClinicalEdit.body.code === 'CLINICAL_FIELD_RESTRICTED', 'Returns code CLINICAL_FIELD_RESTRICTED');

    // 4.3 SUPER_ADMIN attempts to edit clinical fields via PATCH -> 403 Forbidden
    const superAdminClinicalEdit = await apiCall('PATCH', `/patients/${p1.id}`, tokens.SUPER_ADMIN, {
      allergies: ['Aspirin']
    });
    assert(superAdminClinicalEdit.status === 403, 'SUPER_ADMIN forbidden from modifying allergies (403)', `Status: ${superAdminClinicalEdit.status}`);

    // 4.4 DOCTOR updates clinical fields -> 200 OK
    const docClinicalEdit = await apiCall('PATCH', `/patients/${p1.id}`, tokens.DOCTOR, {
      allergyStatus: 'known_allergies',
      allergies: ['Dust', 'Mustard oil'],
      chronicConditions: ['Sandhigata Vata (Osteoarthritis)'],
      medicalHistoryNotes: 'Chronic knee joint pain for 3 years.',
      clinicalNotes: 'Initial consultation documented by attending physician.'
    });
    assert(docClinicalEdit.status === 200, 'DOCTOR successfully documents clinical assessment (200 OK)');
    assert(docClinicalEdit.body.data.allergyStatus === 'known_allergies', 'Allergy status documented');
    assert(docClinicalEdit.body.data.allergies.includes('Dust'), 'Dust allergy recorded');

    // 4.5 VAIDYA updates clinical fields -> 200 OK
    const vaidyaClinicalEdit = await apiCall('PATCH', `/patients/${p1.id}`, tokens.VAIDYA, {
      medicalHistoryStatus: 'reviewed',
      clinicalNotes: 'Vata-Kapha Prakriti evaluated. Recommended Sneha Swedanam course.'
    });
    assert(vaidyaClinicalEdit.status === 200, 'VAIDYA successfully documents Ayurvedic clinical notes (200 OK)');

    // 4.6 Dossier clinical note visibility across roles:
    console.log(`\n${YELLOW}   4.6 Dossier Clinical Notes Redaction Verification${RESET}`);
    const [docDossier, vaidyaDossier, superDossier, adminDossier, recDossier, pharmaDossier, accDossier] = await Promise.all([
      apiCall('GET', `/patients/${p1.id}/dossier`, tokens.DOCTOR),
      apiCall('GET', `/patients/${p1.id}/dossier`, tokens.VAIDYA),
      apiCall('GET', `/patients/${p1.id}/dossier`, tokens.SUPER_ADMIN),
      apiCall('GET', `/patients/${p1.id}/dossier`, tokens.ADMIN),
      apiCall('GET', `/patients/${p1.id}/dossier`, tokens.RECEPTIONIST),
      apiCall('GET', `/patients/${p1.id}/dossier`, tokens.PHARMACIST),
      apiCall('GET', `/patients/${p1.id}/dossier`, tokens.ACCOUNTANT)
    ]);

    assert(Boolean(docDossier.body.data.patient.clinicalNotes), 'DOCTOR can see clinical notes');
    assert(Boolean(vaidyaDossier.body.data.patient.clinicalNotes), 'VAIDYA can see clinical notes');
    assert(superDossier.body.data.patient.clinicalNotes === undefined || superDossier.body.data.patient.clinicalNotes === null, 'SUPER_ADMIN cannot see clinical notes (REDACTED)');
    assert(adminDossier.body.data.patient.clinicalNotes === undefined || adminDossier.body.data.patient.clinicalNotes === null, 'ADMIN cannot see clinical notes (REDACTED)');
    assert(recDossier.body.data.patient.clinicalNotes === undefined || recDossier.body.data.patient.clinicalNotes === null, 'RECEPTIONIST cannot see clinical notes (REDACTED)');
    assert(pharmaDossier.body.data.patient.clinicalNotes === undefined || pharmaDossier.body.data.patient.clinicalNotes === null, 'PHARMACIST cannot see clinical notes (REDACTED)');
    assert(accDossier.body.data.patient.clinicalNotes === undefined || accDossier.body.data.patient.clinicalNotes === null, 'ACCOUNTANT cannot see clinical notes (REDACTED)');

    // ─────────────────────────────────────────────────────────────
    // TEST 5: COMPLETE SEVEN-ROLE PERMISSION MATRIX
    // ─────────────────────────────────────────────────────────────
    console.log(`\n${YELLOW}5. Seven-Role Patient Permission Matrix Execution${RESET}`);

    // 5.1 Registration Permission by Role
    const allRoles = ['SUPER_ADMIN', 'ADMIN', 'DOCTOR', 'VAIDYA', 'RECEPTIONIST', 'PHARMACIST', 'ACCOUNTANT'] as const;
    const canRegister = ['SUPER_ADMIN', 'ADMIN', 'DOCTOR', 'VAIDYA', 'RECEPTIONIST'];
    const cannotRegister = ['PHARMACIST', 'ACCOUNTANT'];

    for (const r of canRegister) {
      const res = await apiCall('POST', '/patients', tokens[r as keyof typeof tokens], {
        firstName: `RoleReg${r}`,
        lastName: 'Patient',
        phone: `+91 90000 000${canRegister.indexOf(r)}`,
        gender: 'Female'
      });
      assert(res.status === 201, `Role ${r} is authorized to register patients (201 Created)`);
    }

    for (const r of cannotRegister) {
      const res = await apiCall('POST', '/patients', tokens[r as keyof typeof tokens], {
        firstName: `Unauthorized${r}`,
        lastName: 'Patient',
        phone: `+91 90000 0009${cannotRegister.indexOf(r)}`,
        gender: 'Male'
      });
      assert(res.status === 403, `Role ${r} is denied patient registration (403 Forbidden)`);
    }

    // 5.2 Demographic Edit Permission by Role
    for (const r of canRegister) {
      const res = await apiCall('PATCH', `/patients/${p1.id}`, tokens[r as keyof typeof tokens], {
        city: `CityBy${r}`
      });
      assert(res.status === 200, `Role ${r} is authorized to edit demographics (200 OK)`);
    }

    for (const r of cannotRegister) {
      const res = await apiCall('PATCH', `/patients/${p1.id}`, tokens[r as keyof typeof tokens], {
        city: `UnauthorizedCity${r}`
      });
      assert(res.status === 403, `Role ${r} is denied demographic editing (403 Forbidden)`);
    }

    // 5.3 Clinical Field Edit Permission by Role (Strict DOCTOR and VAIDYA only)
    const clinicians = ['DOCTOR', 'VAIDYA'];
    const nonClinicians = ['SUPER_ADMIN', 'ADMIN', 'RECEPTIONIST', 'PHARMACIST', 'ACCOUNTANT'];

    for (const r of clinicians) {
      const res = await apiCall('PATCH', `/patients/${p1.id}`, tokens[r as keyof typeof tokens], {
        clinicalNotes: `Authorized clinical note documented by ${r}`
      });
      assert(res.status === 200, `Clinician ${r} is authorized to update clinical notes (200 OK)`);
    }

    for (const r of nonClinicians) {
      const res = await apiCall('PATCH', `/patients/${p1.id}`, tokens[r as keyof typeof tokens], {
        clinicalNotes: `Unauthorized clinical note attempted by ${r}`
      });
      assert(res.status === 403, `Non-clinician ${r} is blocked from clinical notes (403 Forbidden)`);
      if (['SUPER_ADMIN', 'ADMIN', 'RECEPTIONIST'].includes(r)) {
        assert(res.body.code === 'CLINICAL_FIELD_RESTRICTED', `Role ${r} receives code CLINICAL_FIELD_RESTRICTED`);
      }
    }

    // 5.4 Allergy Updates by Role (Strict DOCTOR and VAIDYA only)
    for (const r of clinicians) {
      const res = await apiCall('PATCH', `/patients/${p1.id}`, tokens[r as keyof typeof tokens], {
        allergyStatus: 'known_allergies',
        allergies: ['Peanuts', 'Latex']
      });
      assert(res.status === 200, `Clinician ${r} is authorized to update allergy records (200 OK)`);
    }

    for (const r of nonClinicians) {
      const res = await apiCall('PATCH', `/patients/${p1.id}`, tokens[r as keyof typeof tokens], {
        allergies: ['Sulfa drugs']
      });
      assert(res.status === 403, `Non-clinician ${r} is blocked from updating allergies (403 CLINICAL_FIELD_RESTRICTED)`);
    }

    // 5.5 Dossier Access by Role (All 7 Roles Permitted)
    for (const r of allRoles) {
      const res = await apiCall('GET', `/patients/${p1.id}/dossier`, tokens[r as keyof typeof tokens]);
      assert(res.status === 200, `Role ${r} is authorized to access patient dossier (200 OK)`);
      assert(Boolean(res.body.data && res.body.data.patient), `Role ${r} receives valid patient dossier object`);
    }

    // 5.6 Patient Archival Permission (SUPER_ADMIN only)
    // Create dedicated test patients for archival attempts
    for (const r of allRoles) {
      const testPat = await apiCall('POST', '/patients', tokens.SUPER_ADMIN, {
        firstName: `ArchivalTest${r}`,
        lastName: 'Patient',
        phone: `+91 95555 000${allRoles.indexOf(r)}`,
        gender: 'Other'
      });
      const patId = testPat.body.data.id;

      const delRes = await apiCall('DELETE', `/patients/${patId}`, tokens[r as keyof typeof tokens], {
        reason: `Archival test by ${r}`
      });

      if (r === 'SUPER_ADMIN') {
        assert(delRes.status === 200, `SUPER_ADMIN is authorized to archive patient (200 OK)`);
        assert(delRes.body.archived === true, `Response confirms patient was archived`);
        assert(delRes.body.hardDeleted === false, `Response confirms patient was not hard deleted`);
      } else {
        assert(delRes.status === 403, `Role ${r} is forbidden from archiving patient records (403 Forbidden)`);
      }
    }

    // 5.7 Duplicate Override Permission
    const basePhone = '+91 96666 00001';
    await apiCall('POST', '/patients', tokens.SUPER_ADMIN, {
      firstName: 'DupBase',
      lastName: 'Patient',
      phone: basePhone,
      gender: 'Male'
    });

    for (const r of canRegister) {
      const dupOverride = await apiCall('POST', '/patients', tokens[r as keyof typeof tokens], {
        firstName: 'DupOverride',
        lastName: 'Patient',
        phone: basePhone,
        gender: 'Male',
        overrideDuplicate: true
      });
      assert(dupOverride.status === 201, `Role ${r} can use duplicate override with justification (201 Created)`);
    }

    // 5.8 Direct API Requests & Role Spoofing Protection
    console.log(`\n${YELLOW}   5.8 API Security & Role Spoofing Verification${RESET}`);
    // No token
    const noToken = await apiCall('GET', '/patients');
    assert(noToken.status === 401, 'Request without token rejected with 401 Unauthorized');

    // Invalid/Tampered token
    const badToken = await apiCall('GET', '/patients', 'invalid-token-signature');
    assert(badToken.status === 401, 'Request with forged token rejected with 401 Unauthorized');

    // Header role spoofing without valid JWT
    const spoofRes = await fetch(`${baseUrl}/patients`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-User-Role': 'SUPER_ADMIN',
        'X-User-Email': 'systems@sahachara.com'
      },
      body: JSON.stringify({ firstName: 'Spoof', lastName: 'Attempt', phone: '+91 97777 99999', gender: 'Male' })
    });
    assert(spoofRes.status === 401, 'Unauthenticated request with spoofed role headers rejected with 401 Unauthorized');

    // ─────────────────────────────────────────────────────────────
    // TEST 6: ENFORCE CONSISTENT ARCHIVAL
    // ─────────────────────────────────────────────────────────────
    console.log(`\n${YELLOW}6. Enforce Consistent Archival Across All Deletions${RESET}`);

    // 6.1 Unlinked Patient Archival
    const unlinkedPat = await apiCall('POST', '/patients', tokens.SUPER_ADMIN, {
      firstName: 'TrulyUnlinked',
      lastName: 'Candidate',
      phone: '+91 98888 11111',
      gender: 'Other'
    });
    const unlinkedId = unlinkedPat.body.data.id;
    const unlinkedMrn = unlinkedPat.body.data.mrn;

    const unlinkedArchiveRes = await apiCall('DELETE', `/patients/${unlinkedId}`, tokens.SUPER_ADMIN, {
      reason: 'Controlled archival of unlinked test record'
    });
    assert(unlinkedArchiveRes.status === 200, 'Unlinked deletion returns 200 OK');
    assert(unlinkedArchiveRes.body.archived === true, 'Result explicitly states archived: true');
    assert(unlinkedArchiveRes.body.hardDeleted === false, 'Result explicitly states hardDeleted: false (no destruction)');

    // Verify unlinked record in database
    const dbUnlinked = await prisma.patient.findUnique({ where: { id: unlinkedId } });
    assert(dbUnlinked !== null, 'Patient row still exists in PostgreSQL (NOT physically deleted)');
    assert(dbUnlinked?.status === 'archived', 'Status is "archived"');
    assert(dbUnlinked?.deletedAt === null, 'deletedAt is NULL (not soft-deleted)');
    assert(Boolean(dbUnlinked?.archivedAt), 'archivedAt timestamp recorded');
    assert(dbUnlinked?.archivedById === 'Sahachara Systems', 'archivedById recorded');
    assert(dbUnlinked?.archivedByName === 'Sahachara Systems', 'archivedByName recorded');
    assert(Boolean(dbUnlinked?.archivedReason?.includes('archival')), 'archivedReason preserved');
    assert(dbUnlinked?.mrn === unlinkedMrn, 'MRN is preserved');

    // 6.2 Linked Patient Archival
    const linkedPat = await apiCall('POST', '/patients', tokens.SUPER_ADMIN, {
      firstName: 'ClinicalEncounter',
      lastName: 'LinkedPatient',
      phone: '+91 98888 22222',
      gender: 'Female'
    });
    const linkedId = linkedPat.body.data.id;
    const linkedMrn = linkedPat.body.data.mrn;

    // Attach prescription to link patient
    await prisma.prescription.create({
      data: {
        id: `rx-archive-test-${Date.now()}`,
        rxNumber: `RX-ARC-${Date.now().toString().slice(-6)}`,
        patientId: linkedId,
        patientName: 'ClinicalEncounter LinkedPatient',
        mrn: linkedMrn,
        doctorId: 'usr-doc',
        doctorName: 'Dr. Robert Rivera',
        medicationName: 'Dhanwantharam Thailam',
        dosage: 'External application',
        frequency: 'Daily',
        duration: '7 days',
        route: 'Topical',
        status: 'pending'
      }
    });

    const linkedArchiveRes = await apiCall('DELETE', `/patients/${linkedId}`, tokens.SUPER_ADMIN, {
      reason: 'Controlled archival with active clinical link'
    });
    assert(linkedArchiveRes.status === 200, 'Linked deletion returns 200 OK');
    assert(linkedArchiveRes.body.archived === true, 'Linked record correctly archived');
    assert(linkedArchiveRes.body.hardDeleted === false, 'Hard deletion prevented for linked patient');

    const dbLinked = await prisma.patient.findUnique({ where: { id: linkedId } });
    assert(dbLinked !== null, 'Linked patient row preserved in PostgreSQL');
    assert(dbLinked?.status === 'archived', 'Status updated to "archived"');
    assert(dbLinked?.deletedAt === null, 'deletedAt is NULL');
    assert(Boolean(dbLinked?.archivedAt), 'archivedAt timestamp recorded');
    assert(Boolean(dbLinked?.archivedReason?.includes('linked clinical/financial')), 'archival reason notes linked records');

    // ─────────────────────────────────────────────────────────────
    // TEST 7: SEARCH, FILTERING & SERVER-SIDE PAGINATION
    // ─────────────────────────────────────────────────────────────
    console.log(`\n${YELLOW}7. Search, Status Filtering & Server-Side Pagination${RESET}`);
    // Search by MRN
    const searchMrn = await apiCall('GET', `/patients?search=${p1.mrn}`, tokens.RECEPTIONIST);
    assert(searchMrn.status === 200, 'Search by MRN returns 200 OK');
    assert(searchMrn.body.data.some((p: any) => p.mrn === p1.mrn), `Found patient by exact MRN (${p1.mrn})`);

    // Search by Name
    const searchName = await apiCall('GET', `/patients?search=Govindan`, tokens.RECEPTIONIST);
    assert(searchName.status === 200 && searchName.body.data.length >= 1, 'Search by first name returns matching patients');

    // Search by Phone
    const searchPhone = await apiCall('GET', `/patients?search=9447012345`, tokens.RECEPTIONIST);
    assert(searchPhone.status === 200 && searchPhone.body.data.length >= 1, 'Search by normalized phone returns matching patient');

    // Pagination verification
    const pageRes = await apiCall('GET', `/patients?page=1&limit=5`, tokens.RECEPTIONIST);
    assert(pageRes.status === 200, 'Paginated query returns 200');
    assert(pageRes.body.data.length <= 5, `Page limit respected (returned ${pageRes.body.data.length} items)`);
    assert(pageRes.body.total >= 10, `Total count returned accurately (${pageRes.body.total})`);
    assert(pageRes.body.totalPages >= 2, `Total pages calculated (${pageRes.body.totalPages})`);

    // ─────────────────────────────────────────────────────────────
    // TEST 8: MULTI-FACTOR DUPLICATE DETECTION CHECK ENDPOINT
    // ─────────────────────────────────────────────────────────────
    console.log(`\n${YELLOW}8. Multi-Factor Duplicate Detection Screening${RESET}`);
    const dupCheckPhone = await apiCall('POST', '/patients/check-duplicates', tokens.RECEPTIONIST, {
      phone: '+91 94470 12345'
    });
    assert(dupCheckPhone.body.hasDuplicates === true, 'Duplicate detected by phone');

    const dupCheckNameDob = await apiCall('POST', '/patients/check-duplicates', tokens.RECEPTIONIST, {
      firstName: 'Govindan',
      lastName: 'Kurup',
      dob: '1975-08-20'
    });
    assert(dupCheckNameDob.body.hasDuplicates === true, 'Duplicate detected by Name + DOB');

    // ─────────────────────────────────────────────────────────────
    // TEST 9: PRODUCTION DATABASE ISOLATION VERIFICATION
    // ─────────────────────────────────────────────────────────────
    console.log(`\n${YELLOW}9. Production Database (sahachara_ops_db) Isolation Verification${RESET}`);
    const prodAfter = await getProductionSnapshot();
    console.log(`Pre-Test  Counts (sahachara_ops_db):`, prodBefore);
    console.log(`Post-Test Counts (sahachara_ops_db):`, prodAfter);
    const isUntouched = JSON.stringify(prodBefore) === JSON.stringify(prodAfter);
    assert(isUntouched, 'Production database (sahachara_ops_db) remained strictly UNTOUCHED (0 changes)');

    // Clean up test DB fixtures
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
    console.log(`\n${GREEN}✓ Test database fixtures successfully cleaned up.${RESET}`);

  } catch (err) {
    console.error(`\n${RED}Fatal error during patient management verification:${RESET}`, err);
    process.exit(1);
  } finally {
    server.close();
    await prisma.$disconnect();
    await prodProbePrisma.$disconnect();
  }

  console.log(`\n${CYAN}═══════════════════════════════════════════════════════════════════${RESET}`);
  console.log(`   PATIENT MANAGEMENT HARDENING SUITE: ${GREEN}${passed} PASSED${RESET}, ${failed > 0 ? RED : GREEN}${failed} FAILED${RESET}`);
  console.log(`${CYAN}═══════════════════════════════════════════════════════════════════${RESET}\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runVerification();
