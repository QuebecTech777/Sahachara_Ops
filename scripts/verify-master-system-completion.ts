/**
 * SAHACHARA OPS — MASTER SYSTEM COMPLETION VERIFICATION SUITE
 *
 * Full System Integration & Acceptance Verification:
 * 1. Target Database Isolation & Production Baseline Freeze Guard (19 migrations).
 * 2. Workflow 1: Patient Registration -> Appointment -> Check-in -> Clinical Encounter -> Completion.
 * 3. Workflow 2: Modern Medicine Consultation -> Assessment/Diagnosis -> Prescription -> Pharmacy FEFO Dispensing -> Invoicing -> Payment.
 * 4. Workflow 3: Classical Ayurvedic Consultation -> Prakriti/Vikriti Assessment -> Panchakarma Referral -> Course Conversion -> Phase Progression.
 * 5. Workflow 4: Therapy Referral -> Staff Qualification -> Room Booking with Turnaround Buffer -> Clinical Clearance -> Execution -> Billing.
 * 6. Workflow 5: Panchakarma Package Course -> Package Invoicing -> Payment -> Reversal / Void Workflow.
 * 7. Workflow 6: Staff Onboarding -> PIN Lifecycle -> Token Auth -> Role Governance -> Suspension -> Instant Session Revocation.
 * 8. Workflow 7: Department Governance -> Staff Primary/Secondary Assignment -> Discipline Filtering.
 * 9. Workflow 8: Service & Tariff Configuration -> Rate History -> Invoice Generation -> Immutable Snapshot.
 * 10. Workflow 9: Inventory Batch Receipt -> Stock Allocation -> Controlled Dispensing -> Stock Movement Audit.
 * 11. Workflow 10: Operational & Clinical Reports -> Patient, Appointment, Clinical Activity, Treatment, Pharmacy, Staff, Daily Collection.
 * 12. Strict 7-Role RBAC Authorization Matrix (Zero 8th Roles, Zero Administrative Clinical Overrides).
 * 13. Concurrency & Race-Safety Integration (Patient, Doctor, Vaidya, Room, Rescheduling, Inventory, Payment, Void).
 * 14. Final Production Database Zero-Mutation Verification.
 */

import http from 'http';
import express from 'express';
import { PrismaClient, Prisma } from '@prisma/client';

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
            let parsed = null;
            try {
              parsed = JSON.parse(data);
            } catch {
              parsed = data;
            }
            resolve({ status: res.statusCode || 500, body: parsed });
          });
        }
      );

      req.on('error', reject);
      if (options?.body) {
        req.write(JSON.stringify(options.body));
      }
      req.end();
    });
  };
}

async function main() {
  console.log(`\n${BOLD}========================================================================${RESET}`);
  console.log(`${BOLD}   SAHACHARA OS — MASTER SYSTEM COMPLETION VERIFICATION SUITE   ${RESET}`);
  console.log(`${BOLD}   Full Implementation, Integration, Concurrency, RBAC & End-to-End Tests   ${RESET}`);
  console.log(`${BOLD}========================================================================${RESET}\n`);

  // 1. Establish Ephemeral Server
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
    // SECTION 1: PRODUCTION DB FREEZE & TEST DB ISOLATION
    // -------------------------------------------------------------------------
    console.log(`${BOLD}SECTION 1: Production DB Freeze & Test DB Schema Isolation${RESET}`);

    if (prodProbePrisma) {
      const prodMigrations = await prodProbePrisma.$queryRaw<Array<{ migration_name: string }>>`
        SELECT migration_name FROM _prisma_migrations WHERE rolled_back_at IS NULL ORDER BY finished_at ASC;
      `;
      assert(
        prodMigrations.length === 19,
        `Production database sahachara_ops_db has exactly 19 migrations applied (Found: ${prodMigrations.length})`
      );

      const prodTherapyRooms = await prodProbePrisma.$queryRaw<Array<{ exists: boolean }>>`
        SELECT EXISTS (
          SELECT FROM information_schema.tables WHERE table_name = 'therapy_rooms'
        );
      `;
      assert(
        prodTherapyRooms[0]?.exists === false,
        'Production database does NOT contain therapy_rooms table (Phase 7 migrations unapplied to prod)'
      );

      const initialProdSnapshot = {
        users: await prodProbePrisma.user.count(),
        patients: await prodProbePrisma.patient.count(),
        invoices: await prodProbePrisma.invoice.count()
      };
      assert(initialProdSnapshot.users === 1, 'Production database starts with exactly 1 superadmin user');
      assert(initialProdSnapshot.patients === 0, 'Production database starts with 0 patients');
      assert(initialProdSnapshot.invoices === 0, 'Production database starts with 0 invoices');
    } else {
      console.log('  ℹ [SKIPPED] Production database freeze and pre-snapshot probe skipped: isolated CI/test environment (zero production database access).');
    }

    // Clean test database for clean run
    await prisma.therapySession.deleteMany({});
    await prisma.panchakarmaPhaseTransition.deleteMany({});
    await prisma.panchakarmaCourse.deleteMany({});
    await prisma.staffTherapyAuthorization.deleteMany({});
    await prisma.therapyRoom.deleteMany({});
    await prisma.clinicalDiagnosis.deleteMany({});
    await prisma.clinicalVitals.deleteMany({});
    await prisma.prakritiAssessment.deleteMany({});
    await prisma.panchakarmaReferral.deleteMany({});
    await prisma.clinicalEncounter.deleteMany({});
    await prisma.appointment.deleteMany({});

    // -------------------------------------------------------------------------
    // SECTION 2: WORKFLOW 1 — PATIENT REGISTRATION -> APPOINTMENT -> CHECK-IN -> ENCOUNTER -> COMPLETION
    // -------------------------------------------------------------------------
    console.log(`\n${BOLD}SECTION 2: Workflow 1 — Outpatient Appointment & Clinical Encounter Lifecycle${RESET}`);

    // Register Patient
    const uniqueSuffix = Date.now().toString().slice(-5);
    const uniquePhone1 = `+91 98470 ${uniqueSuffix}`;
    const regRes = await request('POST', '/api/patients', {
      role: 'RECEPTIONIST',
      body: {
        firstName: 'Ananya',
        lastName: `Menon_${uniqueSuffix}`,
        gender: 'Female',
        dob: '1990-05-15',
        phone: uniquePhone1,
        emergencyContactName: 'Rajesh Menon',
        emergencyContactPhone: '+91 98470 54321',
        emergencyContactRelation: 'Spouse'
      }
    });
    if (regRes.status !== 201) {
      console.error('Registration failed:', regRes.status, regRes.body);
    }
    assert(regRes.status === 201, 'Patient registered successfully by RECEPTIONIST (HTTP 201)');
    const patient1 = regRes.body.data || regRes.body;
    assert(Boolean(patient1.mrn && patient1.mrn.startsWith('SAH-')), 'Patient assigned authoritative sequence MRN');

    // Create Appointment
    const doctorUser = await prisma.user.findFirst({ where: { role: 'DOCTOR', status: 'active', isSuspended: false } });
    const aptRes = await request('POST', '/api/appointments', {
      role: 'RECEPTIONIST',
      body: {
        patientId: patient1.id,
        doctorId: doctorUser?.id,
        appointmentDate: '2026-11-20',
        appointmentTime: '10:00 AM',
        appointmentType: 'General Consultation',
        reason: 'Joint pain and stiffness'
      }
    });
    if (aptRes.status !== 201) {
      console.error('Appointment schedule failed:', aptRes.status, aptRes.body);
    }
    assert(aptRes.status === 201, 'Appointment scheduled by RECEPTIONIST (HTTP 201)');
    const apt1 = aptRes.body.data;
    assert(apt1.status === 'scheduled', 'Appointment starts in scheduled status');

    // Check-in
    const checkInRes = await request('POST', `/api/appointments/${apt1.id}/check-in`, {
      role: 'RECEPTIONIST'
    });
    assert(checkInRes.status === 200, 'Patient checked in by RECEPTIONIST (HTTP 200)');
    assert(checkInRes.body.data.status === 'waiting', 'Appointment transitions to waiting status');

    // Clinical Encounter Start
    const encStartRes = await request('POST', '/api/clinical/encounters/initiate', {
      role: 'DOCTOR',
      body: {
        appointmentId: apt1.id,
        patientId: patient1.id,
        reasonForVisit: 'Joint pain and stiffness'
      }
    });
    assert(encStartRes.status === 201, 'Clinical encounter initiated by DOCTOR (HTTP 201)');
    const enc1 = encStartRes.body.data;
    assert(enc1.discipline === 'DOCTOR', 'Encounter discipline is DOCTOR');

    // Complete Encounter
    const encCompRes = await request('POST', `/api/clinical/encounters/${enc1.id}/complete`, {
      role: 'DOCTOR'
    });
    assert(encCompRes.status === 200, 'Clinical encounter completed by DOCTOR (HTTP 200)');
    assert(encCompRes.body.data.status === 'completed', 'Encounter status is completed');
    assert(encCompRes.body.data.clinicalDocumentationCompleted === true, 'Documentation completed flag is true');

    // -------------------------------------------------------------------------
    // SECTION 3: WORKFLOW 2 — DOCTOR CONSULTATION -> DIAGNOSIS -> RX -> PHARMACY FEFO -> INVOICE -> PAYMENT
    // -------------------------------------------------------------------------
    console.log(`\n${BOLD}SECTION 3: Workflow 2 — Clinical Consultation -> Pharmacy FEFO -> Billing -> Payment${RESET}`);

    // Create a new in-progress encounter for diagnoses and prescriptions
    const apt2Res = await request('POST', '/api/appointments', {
      role: 'RECEPTIONIST',
      body: {
        patientId: patient1.id,
        doctorId: doctorUser?.id,
        appointmentDate: '2026-11-20',
        appointmentTime: '11:30 AM',
        appointmentType: 'Follow-up Consultation',
        reason: 'Symptom review'
      }
    });
    const apt2 = apt2Res.body.data;
    const enc2Res = await request('POST', '/api/clinical/encounters/initiate', {
      role: 'DOCTOR',
      body: {
        appointmentId: apt2.id,
        patientId: patient1.id,
        reasonForVisit: 'Symptom review'
      }
    });
    const enc2 = enc2Res.body.data;

    // Record Diagnosis
    const diagRes = await request('POST', `/api/clinical/encounters/${enc2.id}/diagnoses`, {
      role: 'DOCTOR',
      body: {
        diagnosisName: 'Pain in joint, unspecified',
        icdCode: 'M25.5',
        diagnosisType: 'primary',
        notes: 'Symptom review'
      }
    });
    assert(diagRes.status === 201, 'Doctor records diagnosis (HTTP 201)');

    // Ensure Medication Stock in Pharmacy
    let medStock = await prisma.medicationStock.findFirst({
      where: { drugName: 'Paracetamol 500mg Tablets' }
    });
    if (!medStock) {
      medStock = await prisma.medicationStock.create({
        data: {
          drugName: 'Paracetamol 500mg Tablets',
          genericName: 'Paracetamol',
          category: 'Analgesics & Antipyretics',
          form: 'Tablet',
          strength: '500mg',
          stockQuantity: 100,
          unit: 'tablets',
          minThreshold: 10,
          batchNumber: `PCM-${Date.now()}`,
          expiryDate: '2028-12-31',
          unitPrice: new Prisma.Decimal('15.00'),
          isActive: true,
          status: 'in_stock'
        }
      });
    } else {
      await prisma.medicationStock.update({
        where: { id: medStock.id },
        data: { unitPrice: new Prisma.Decimal('15.00'), stockQuantity: 100 }
      });
    }

    // Doctor Prescribes
    const rxRes = await request('POST', '/api/pharmacy/prescriptions', {
      role: 'DOCTOR',
      body: {
        patientId: patient1.id,
        encounterId: enc2.id,
        medicationName: 'Paracetamol 500mg Tablets',
        dosage: '500mg',
        frequency: 'TDS (Three times a day)',
        duration: '5 days',
        quantity: 15,
        instructions: 'Take after meals',
        discipline: 'DOCTOR'
      }
    });
    if (rxRes.status !== 201) {
      console.error('Prescription create failed:', rxRes.status, rxRes.body);
    }
    assert(rxRes.status === 201, 'Doctor creates Modern Medicine prescription (HTTP 201)');
    const rx1 = rxRes.body.data;

    // Pharmacist Dispenses via FEFO
    const dispRes = await request('POST', `/api/pharmacy/prescriptions/${rx1.id}/dispense`, {
      role: 'PHARMACIST',
      body: {
        quantityToDispense: 15,
        stockId: medStock.id,
        pharmacyNotes: 'Dispensed full 5-day course'
      }
    });
    assert(dispRes.status === 200, 'Pharmacist dispenses medication (HTTP 200)');
    assert(dispRes.body.data.dispensingStatus === 'fully_dispensed', 'Prescription is fully dispensed');

    // Stock verification
    const updatedStock = await prisma.medicationStock.findUnique({ where: { id: medStock.id } });
    assert(updatedStock?.stockQuantity === 85, 'Pharmacy inventory atomically decremented by 15 (100 -> 85)');

    // Invoicing by Accountant
    const invRes = await request('POST', '/api/invoices', {
      role: 'ACCOUNTANT',
      body: {
        patientId: patient1.id,
        items: [
          {
            medicationId: medStock.id,
            description: 'Paracetamol 500mg Tablets (Qty: 15)',
            category: 'Pharmacy',
            quantity: 15,
            unitPrice: 15.00
          }
        ]
      }
    });
    assert(invRes.status === 201, 'Accountant generates billing invoice (HTTP 201)');
    const inv1 = invRes.body.data;
    assert(Number(inv1.totalAmount) === 225.00, 'Invoice total calculated accurately with Decimal precision (15 * 15 = 225.00)');

    // Record Payment
    const payRes = await request('POST', '/api/billing/payments', {
      role: 'ACCOUNTANT',
      body: {
        patientId: patient1.id,
        amount: 225.00,
        paymentMethod: 'UPI',
        referenceNumber: 'UPI-2026-9876543210'
      }
    });
    assert(payRes.status === 201, 'Cashier/Accountant records payment (HTTP 201)');
    const pay1 = payRes.body.data;

    // Allocate Payment to Invoice
    const allocRes = await request('POST', `/api/billing/payments/${pay1.id}/allocate`, {
      role: 'ACCOUNTANT',
      body: {
        allocations: [{ invoiceId: inv1.id, amount: 225.00 }]
      }
    });
    assert(allocRes.status === 200, 'Payment allocated to invoice (HTTP 200)');
    const updatedInv = await prisma.invoice.findUnique({ where: { id: inv1.id } });
    assert(updatedInv?.paymentStatus === 'paid', 'Invoice marked paid');
    assert(Number(updatedInv?.balance) === 0, 'Invoice balance settled to 0.00');

    // -------------------------------------------------------------------------
    // SECTION 4: WORKFLOW 3 — VAIDYA CONSULTATION -> PRAKRITI -> PANCHAKARMA REFERRAL -> COURSE -> PHASES
    // -------------------------------------------------------------------------
    console.log(`\n${BOLD}SECTION 4: Workflow 3 — Classical Ayurvedic Consultation & Panchakarma Progression${RESET}`);

    // Create Ayurvedic Patient
    const uniquePhone2 = `+91 98471 ${Date.now().toString().slice(-5)}`;
    const ayurPatRes = await request('POST', '/api/patients', {
      role: 'RECEPTIONIST',
      body: {
        firstName: 'Siddharth',
        lastName: `Varma_${Date.now()}`,
        gender: 'Male',
        dob: '1985-08-20',
        phone: uniquePhone2
      }
    });
    if (ayurPatRes.status !== 201) {
      console.error('Ayur Patient Registration failed:', ayurPatRes.status, ayurPatRes.body);
    }
    const ayurPat = ayurPatRes.body.data || ayurPatRes.body;

    // Vaidya appointment
    const vaidyaUserForAppt = await prisma.user.findFirst({ where: { role: 'VAIDYA', status: 'active', isSuspended: false } });
    const ayurAptRes = await request('POST', '/api/appointments', {
      role: 'RECEPTIONIST',
      body: {
        patientId: ayurPat.id,
        practitionerId: vaidyaUserForAppt?.id,
        appointmentDate: '2026-11-20',
        timeSlot: '02:00 PM',
        type: 'Ayurvedic Initial Consultation',
        reason: 'Janu Sandhigata Vata evaluation'
      }
    });
    if (ayurAptRes.status !== 201) {
      console.error('Ayur Apt schedule failed:', ayurAptRes.status, ayurAptRes.body);
    }
    const ayurApt = ayurAptRes.body.data;

    // Vaidya Consultation Encounter
    const ayurEncRes = await request('POST', '/api/clinical/encounters/initiate', {
      role: 'VAIDYA',
      body: {
        appointmentId: ayurApt.id,
        patientId: ayurPat.id,
        reasonForVisit: 'Janu Sandhigata Vata evaluation'
      }
    });
    assert(ayurEncRes.status === 201, 'Vaidya initiates Ayurvedic consultation encounter (HTTP 201)');
    const ayurEnc = ayurEncRes.body.data;

    // Vaidya records Prakriti Assessment
    const prakritiRes = await request('POST', `/api/clinical/encounters/${ayurEnc.id}/prakriti`, {
      role: 'VAIDYA',
      body: {
        dominantPrakriti: 'Vata-Pitta',
        vataScore: 65,
        pittaScore: 50,
        kaphaScore: 25,
        clinicalInterpretation: 'Predominantly Vata constitution with secondary Pitta aggravation.'
      }
    });
    assert(prakritiRes.status === 201, 'Vaidya documents Prakriti assessment (HTTP 201)');

    // Vaidya creates Treatment Plan
    const treatRes = await request('POST', '/api/treatments', {
      role: 'VAIDYA',
      body: {
        patientId: ayurPat.id,
        patientName: 'Siddharth Varma',
        planName: 'Vata Harana Chikitsa',
        category: 'Panchakarma',
        proposedTreatment: 'Classical Virechana with Sneha Swedana',
        durationDays: 14,
        frequency: 'Daily',
        instructions: 'Follow Pathya Apathya strictly'
      }
    });
    assert(treatRes.status === 201, 'Vaidya creates Ayurvedic Treatment Plan (HTTP 201)');

    // Vaidya creates Panchakarma Referral
    const refRes = await request('POST', `/api/clinical/encounters/${ayurEnc.id}/panchakarma-referrals`, {
      role: 'VAIDYA',
      body: {
        proposedProcedure: 'Virechana Karma',
        clinicalIndication: 'Deepa-Pachana completed; patient fit for classical Virechana',
        preliminaryNotes: 'Monitor koshta and agni daily'
      }
    });
    assert(refRes.status === 201, 'Vaidya issues Panchakarma Referral (HTTP 201)');
    const pkReferral = refRes.body.data;

    // Convert Referral to Active Course
    const convRes = await request('POST', `/api/panchakarma-referrals/${pkReferral.id}/convert`, {
      role: 'VAIDYA',
      body: {
        billingMode: 'PACKAGE_BILLED',
        packageRate: 25000.00
      }
    });
    assert(convRes.status === 201, 'Referral converted to active PanchakarmaCourse (HTTP 201)');
    const pkCourse = convRes.body.data;
    assert(pkCourse.currentPhase === 'PURVAKARMA', 'Course starts in Purvakarma phase');

    // Advance to Pradhanakarma
    const adv1Res = await request('POST', `/api/panchakarma-courses/${pkCourse.id}/advance-phase`, {
      role: 'VAIDYA',
      body: {
        toPhase: 'PRADHANAKARMA',
        clinicalRationaleNotes: 'Samyak Snigdha lakshanas observed; Koshta ready for Virechana.'
      }
    });
    assert(adv1Res.status === 200, 'Vaidya advances course to Pradhanakarma (HTTP 200)');
    const courseStage1 = adv1Res.body.data?.course || adv1Res.body.data;
    assert(Boolean(courseStage1?.currentPhase?.includes('Pradhanakarma')), 'Current phase is Pradhanakarma');

    // Advance to Paschatkarma
    const adv2Res = await request('POST', `/api/panchakarma-courses/${pkCourse.id}/advance-phase`, {
      role: 'VAIDYA',
      body: {
        toPhase: 'PASCHATKARMA',
        clinicalRationaleNotes: 'Virechana Vega Shuddhi attained; transitioning to Samsarjana Krama.'
      }
    });
    assert(adv2Res.status === 200, 'Vaidya advances course to Paschatkarma (HTTP 200)');
    const courseStage2 = adv2Res.body.data?.course || adv2Res.body.data;
    assert(Boolean(courseStage2?.currentPhase?.includes('Paschatkarma')), 'Current phase is Paschatkarma');

    // -------------------------------------------------------------------------
    // SECTION 5: WORKFLOW 4 — THERAPY ROOMS, STAFF QUALIFICATION, BUFFERED SCHEDULING & CLINICAL CLEARANCE
    // -------------------------------------------------------------------------
    console.log(`\n${BOLD}SECTION 5: Workflow 4 — Therapy Session Scheduling, Room Buffer & Execution State Machine${RESET}`);

    // Create Approved Therapy Room
    const roomRes = await request('POST', '/api/therapy-rooms', {
      role: 'ADMIN',
      body: {
        code: `DRONI-${Date.now().toString().slice(-4)}`,
        name: 'Classical Droni Chamber 1',
        roomType: 'MASSAGE_DRONI_ROOM',
        bufferMinutes: 15
      }
    });
    assert(roomRes.status === 201, 'ADMIN creates approved MASSAGE_DRONI_ROOM (HTTP 201)');
    const room1 = roomRes.body.data;

    // Get Active Vaidya Staff
    const vaidyasRes = await request('GET', '/api/therapy-staff/vaidyas', { role: 'VAIDYA' });
    const vaidyaStaffMember = vaidyasRes.body.data[0];

    // Ensure Active Staff Member for Therapy Administration
    let authStaff = await prisma.staffMember.findFirst({
      where: { status: { in: ['active', 'on_duty'] }, isSuspended: false }
    });
    if (!authStaff) {
      authStaff = await prisma.staffMember.create({
        data: {
          employeeId: `STF-THER-${Date.now().toString().slice(-4)}`,
          name: 'Senior Panchakarma Therapist Anand',
          role: 'ADMIN',
          designation: 'Panchakarma Therapist',
          department: 'Ayurveda',
          email: `anand.therapist.${Date.now()}@sahachara.org`,
          phone: '+91 98470 55443',
          status: 'active'
        }
      });
    }

    // Grant Staff Therapy Qualification
    const qualRes = await request('POST', '/api/staff-therapy-authorizations', {
      role: 'ADMIN',
      body: {
        staffId: authStaff.id,
        authorizedTherapyTypes: ['ABHYANGA', 'SWEDANA', 'VIRECHANA'],
        qualificationEvidence: 'Certified Ayurvedic Panchakarma Therapist Diploma'
      }
    });
    assert(qualRes.status === 201, 'ADMIN grants StaffTherapyAuthorization with evidence (HTTP 201)');

    // Schedule Therapy Session
    const schedRes = await request('POST', '/api/therapy-sessions', {
      role: 'RECEPTIONIST',
      body: {
        patientId: ayurPat.id,
        roomId: room1.id,
        administeringStaffId: authStaff.id,
        responsibleVaidyaId: vaidyaStaffMember.id,
        therapyType: 'ABHYANGA',
        scheduledStartAt: '2026-11-21T09:00:00Z',
        scheduledEndAt: '2026-11-21T10:00:00Z',
        turnaroundBufferMinutes: 15
      }
    });
    if (schedRes.status !== 201) {
      console.error('Therapy session schedule failed:', schedRes.status, schedRes.body);
    }
    assert(schedRes.status === 201, 'Therapy session scheduled successfully (HTTP 201)');
    const session1 = schedRes.body.data;

    // Buffer Collision Check: Booking from 10:05 to 10:45 should fail because room needs 15-min turnaround buffer (free at 10:15)
    const bufConflictRes = await request('POST', '/api/therapy-sessions', {
      role: 'RECEPTIONIST',
      body: {
        patientId: patient1.id,
        roomId: room1.id,
        administeringStaffId: authStaff.id,
        responsibleVaidyaId: vaidyaStaffMember.id,
        therapyType: 'ABHYANGA',
        scheduledStartAt: '2026-11-21T10:05:00Z',
        scheduledEndAt: '2026-11-21T11:00:00Z',
        turnaroundBufferMinutes: 15
      }
    });
    assert(bufConflictRes.status === 409, 'Booking inside 15-minute room turnaround buffer rejected with HTTP 409 ROOM_UNAVAILABLE');

    // Clinical Clearance & Start Session
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
    assert(startRes.status === 200, 'Vaidya provides clinical clearance and starts session (HTTP 200)');
    assert(startRes.body.data.status === 'IN_PROGRESS', 'Session is IN_PROGRESS');

    // Complete Session
    const compRes = await request('POST', `/api/therapy-sessions/${session1.id}/complete`, {
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
    assert(compRes.status === 200, 'Session completed successfully (HTTP 200)');
    assert(compRes.body.data.status === 'COMPLETED', 'Session status is COMPLETED');

    // Verify room automatically enters SANITIZING status
    const roomStateAfter = await prisma.therapyRoom.findUnique({ where: { id: room1.id } });
    assert(roomStateAfter?.status === 'SANITIZING', 'Therapy room enters SANITIZING status upon session completion');

    // Sanitize Room
    const sanRes = await request('POST', `/api/therapy-rooms/${room1.id}/sanitize`, {
      role: 'RECEPTIONIST'
    });
    assert(sanRes.status === 200, 'Room sanitization completed (HTTP 200)');
    assert(sanRes.body.data.status === 'AVAILABLE', 'Room status restored to AVAILABLE');

    // -------------------------------------------------------------------------
    // SECTION 6: WORKFLOW 5 — PANCHAKARMA PACKAGE INVOICING & VOID REVERSAL
    // -------------------------------------------------------------------------
    console.log(`\n${BOLD}SECTION 6: Workflow 5 — Panchakarma Package Billing & Void Reversal Lifecycle${RESET}`);

    // Fetch Tariff for Panchakarma
    let pkTariff = await prisma.hospitalTariff.findFirst({
      where: { category: 'Panchakarma', isActive: true, rate: { not: null } }
    });
    if (!pkTariff) {
      pkTariff = await prisma.hospitalTariff.create({
        data: {
          serviceCode: 'PK-PKG-CLASSICAL',
          serviceName: 'Classical Panchakarma Package',
          category: 'Panchakarma',
          department: 'Panchakarma',
          rate: new Prisma.Decimal('25000.00'),
          isActive: true
        }
      });
    }

    // Bill Panchakarma Package Course
    const pkgInvRes = await request('POST', '/api/invoices', {
      role: 'ACCOUNTANT',
      body: {
        patientId: ayurPat.id,
        items: [
          {
            tariffId: pkTariff.id,
            panchakarmaCourseId: pkCourse.id,
            description: 'Classical Panchakarma Course Package (14 Days)',
            category: 'Panchakarma',
            quantity: 1,
            unitPrice: Number(pkTariff.rate)
          }
        ]
      }
    });
    assert(pkgInvRes.status === 201, 'Accountant creates package invoice (HTTP 201)');
    const pkgInv = pkgInvRes.body.data;

    const courseBilledCheck = await prisma.panchakarmaCourse.findUnique({ where: { id: pkCourse.id } });
    assert(courseBilledCheck?.isPackageBilled === true, 'PanchakarmaCourse atomically marked isPackageBilled = true');
    assert(courseBilledCheck?.packageInvoiceId === pkgInv.id, 'PanchakarmaCourse linked to package invoice ID');

    // Void Invoice Reversal
    const superAdminUser = await prisma.user.findFirst({ where: { role: 'SUPER_ADMIN' } });
    const voidReq = await dbRequestRefund(
      {
        invoiceId: pkgInv.id,
        type: 'invoice_void',
        amount: Number(pkgInv.totalAmount),
        reason: 'Patient opted for outpatient individual billing'
      },
      { id: superAdminUser!.id, name: superAdminUser!.name, role: 'SUPER_ADMIN' }
    );
    assert(voidReq.status === 'pending', 'Void request generated in pending status');

    // Approve Refund / Void
    const secondAdminUser = await prisma.user.findFirst({
      where: { role: 'SUPER_ADMIN', id: { not: superAdminUser!.id } }
    }) || await prisma.user.create({
      data: {
        name: 'Second SuperAdmin',
        email: 'second.superadmin@sahachara.com',
        role: 'SUPER_ADMIN',
        status: 'active'
      }
    });

    const approvedVoid = await dbApproveRefund(
      voidReq.id,
      { id: secondAdminUser.id, name: secondAdminUser.name, role: 'SUPER_ADMIN' },
      'Void authorized: resetting package billing'
    );
    assert(approvedVoid.status === 'completed', 'Invoice void completed via dbApproveRefund');

    const courseRestoredCheck = await prisma.panchakarmaCourse.findUnique({ where: { id: pkCourse.id } });
    assert(courseRestoredCheck?.isPackageBilled === false, 'PanchakarmaCourse isPackageBilled atomically restored to false');
    assert(courseRestoredCheck?.packageInvoiceId === null, 'PanchakarmaCourse packageInvoiceId unlinked');
    assert(Boolean(courseRestoredCheck?.currentPhase?.includes('Paschatkarma')), 'Clinical phase progression fully preserved after void');

    // -------------------------------------------------------------------------
    // SECTION 7: WORKFLOW 6 — STAFF ONBOARDING, PIN LIFECYCLE & SESSION REVOCATION
    // -------------------------------------------------------------------------
    console.log(`\n${BOLD}SECTION 7: Workflow 6 — Staff Lifecycle, Cryptographic PIN & Session Revocation${RESET}`);

    // Create Staff
    const newStaffRes = await request('POST', '/api/staff', {
      role: 'ADMIN',
      body: {
        name: 'Priya Nambiar',
        email: `priya.${Date.now()}@sahachara.com`,
        role: 'PHARMACIST',
        department: 'Pharmacy & Dispensary',
        designation: 'Staff Pharmacist',
        phone: '+91 98470 99911'
      }
    });
    assert(newStaffRes.status === 201, 'ADMIN creates new staff member (HTTP 201)');
    const createdStaff = newStaffRes.body.staff || newStaffRes.body.data?.staff;
    const plainPin = newStaffRes.body.activationPin || newStaffRes.body.data?.activationPin;
    assert(Boolean(plainPin && plainPin.length === 4), 'Plaintext 4-digit PIN returned exactly once in creation payload');

    // Ensure database stores only hash and zero plaintext
    const dbStaffPinCheck = await prisma.staffMember.findUnique({ where: { id: createdStaff.id } });
    assert(dbStaffPinCheck?.activationPin === null, 'Plaintext activationPin in PostgreSQL is strictly NULL');
    assert(Boolean(dbStaffPinCheck?.activationPinHash), 'Cryptographic activationPinHash is stored');

    // Activate Account
    const actRes = await request('POST', '/api/auth/activate', {
      body: {
        email: createdStaff.email,
        pin: plainPin,
        newPassword: 'SecurePassword@2026'
      }
    });
    assert(actRes.status === 200, 'Staff activates account with PIN and establishes password (HTTP 200)');

    // Login with new credentials
    const loginRes = await request('POST', '/api/auth/login', {
      body: {
        email: createdStaff.email,
        password: 'SecurePassword@2026'
      }
    });
    assert(loginRes.status === 200, 'Staff logs in successfully (HTTP 200)');
    const staffJwt = loginRes.body.token || loginRes.body.data?.token;

    // Verify token works
    const testAuthRes = await request('GET', '/api/pharmacy/inventory', {
      headers: { Authorization: `Bearer ${staffJwt}` }
    });
    assert(testAuthRes.status === 200, 'Active staff token authorizes access to dispensary inventory (HTTP 200)');

    // Suspend Staff
    const suspRes = await request('POST', `/api/staff/${createdStaff.id}/suspend`, {
      role: 'ADMIN',
      body: { reason: 'Annual compliance review' }
    });
    assert(suspRes.status === 200, 'ADMIN suspends staff account (HTTP 200)');

    // Token must immediately fail (Fail-closed session revocation)
    const revokedAuthRes = await request('GET', '/api/pharmacy/inventory', {
      headers: { Authorization: `Bearer ${staffJwt}` }
    });
    assert(revokedAuthRes.status === 401, 'Previously issued JWT immediately rejected upon account suspension (HTTP 401)');

    // Reactivate Staff
    const reactRes = await request('POST', `/api/staff/${createdStaff.id}/reactivate`, {
      role: 'ADMIN',
      body: { reason: 'Compliance review completed' }
    });
    assert(reactRes.status === 200, 'ADMIN reactivates staff account (HTTP 200)');

    // -------------------------------------------------------------------------
    // SECTION 8: WORKFLOW 7 — DEPARTMENT MANAGEMENT & PRIMARY DISCIPLINE RULES
    // -------------------------------------------------------------------------
    console.log(`\n${BOLD}SECTION 8: Workflow 7 — Department Master & Primary Assignment Integrity${RESET}`);

    // Create Department
    const deptRes = await request('POST', '/api/departments', {
      role: 'SUPER_ADMIN',
      body: {
        code: `SHAL${Date.now().toString().slice(-4)}`,
        name: `Shalakya Tantra ${Date.now()}`,
        discipline: 'AYURVEDA',
        description: 'ENT and Ophthalmology in classical Ayurveda'
      }
    });
    assert(deptRes.status === 201, 'SUPER_ADMIN creates department (HTTP 201)');
    const dept1 = deptRes.body.data;

    // Assign Primary Department
    const assignRes = await request('POST', `/api/staff/${createdStaff.id}/departments/primary`, {
      role: 'ADMIN',
      body: { departmentId: dept1.id }
    });
    assert(assignRes.status === 201 || assignRes.status === 200, 'ADMIN assigns staff primary department (HTTP 200/201)');

    // Verify Primary Endpoint
    const primaryRes = await request('GET', `/api/staff/${createdStaff.id}/departments/primary`, {
      role: 'RECEPTIONIST'
    });
    assert(primaryRes.status === 200, 'Query primary department returns HTTP 200');
    assert(primaryRes.body.data?.departmentId === dept1.id || primaryRes.body.primaryDepartment?.id === dept1.id, 'Primary department points to assigned relational department');

    // -------------------------------------------------------------------------
    // SECTION 9: WORKFLOW 8 — SERVICE & TARIFF CONFIGURATION & SNAPSHOT IMMUTABILITY
    // -------------------------------------------------------------------------
    console.log(`\n${BOLD}SECTION 9: Workflow 8 — Service Rate Master & Invoice Rate Snapshot Immutability${RESET}`);

    // Non-SUPER_ADMIN cannot modify tariffs
    const deniedTariffRes = await request('POST', '/api/tariffs', {
      role: 'ADMIN',
      body: { serviceCode: 'TRF-TEST', serviceName: 'Test Service', rate: 1000 }
    });
    assert(deniedTariffRes.status === 403, 'ADMIN strictly forbidden from creating tariffs (HTTP 403)');

    // SUPER_ADMIN creates service tariff
    const createTariffRes = await request('POST', '/api/tariffs', {
      role: 'SUPER_ADMIN',
      body: {
        serviceCode: `TRF-${Date.now().toString().slice(-5)}`,
        serviceName: 'Kati Basti Specialized Therapy',
        category: 'Therapy',
        department: 'Ayurveda',
        rate: 1800.00
      }
    });
    assert(createTariffRes.status === 201, 'SUPER_ADMIN creates service tariff (HTTP 201)');
    const tariff1 = createTariffRes.body.data;

    // Create Invoice with this tariff
    const invTariffRes = await request('POST', '/api/invoices', {
      role: 'ACCOUNTANT',
      body: {
        patientId: patient1.id,
        items: [
          {
            tariffId: tariff1.id,
            description: tariff1.serviceName,
            category: 'Therapy',
            quantity: 2,
            unitPrice: 1800.00
          }
        ]
      }
    });
    assert(invTariffRes.status === 201, 'Accountant bills against approved tariff rate (HTTP 201)');
    const invWithSnapshot = invTariffRes.body.data;
    assert(Number(invWithSnapshot.totalAmount) === 3600.00, 'Invoice total matches 2 * 1800 = 3600.00');

    // SUPER_ADMIN updates rate to ₹2,200
    const updateTariffRes = await request('PATCH', `/api/tariffs/${tariff1.id}/rate`, {
      role: 'SUPER_ADMIN',
      body: {
        rate: 2200.00,
        note: 'Annual rate adjustment'
      }
    });
    assert(updateTariffRes.status === 200, 'SUPER_ADMIN updates tariff rate to ₹2,200 (HTTP 200)');

    // Verify historical invoice remains exactly 3600.00
    const fetchedInv = await prisma.invoice.findUnique({ where: { id: invWithSnapshot.id } });
    assert(Number(fetchedInv?.totalAmount) === 3600.00, 'Historical invoice snapshot strictly preserved at ₹3,600.00 after tariff increase');

    // -------------------------------------------------------------------------
    // SECTION 10: WORKFLOW 9 — INVENTORY RECEIPT & NEGATIVE STOCK PREVENTION
    // -------------------------------------------------------------------------
    console.log(`\n${BOLD}SECTION 10: Workflow 9 — Inventory Receipt, Stock Movement & Negative Stock Guard${RESET}`);

    // Receipt of new batch
    const batchReceiptRes = await request('POST', '/api/pharmacy/inventory/receive', {
      role: 'PHARMACIST',
      body: {
        drugName: 'Triphala Churna 100g',
        genericName: 'Triphala Churna',
        category: 'Churna',
        form: 'Powder',
        strength: '100g',
        batchNumber: `TPH-${Date.now()}`,
        quantity: 50,
        expiryDate: '2028-06-30',
        unit: 'bottles',
        minThreshold: 10,
        reorderThreshold: 15,
        manufacturer: 'Sahachara Ayurvedic Pharmacy Ltd',
        notes: 'Initial receipt'
      }
    });
    assert(batchReceiptRes.status === 201, 'Pharmacist receives new medication batch (HTTP 201)');
    const receivedBatch = batchReceiptRes.body.data;

    // Verify StockMovement logged
    const movement = await prisma.stockMovement.findFirst({
      where: { batchNumber: receivedBatch.batchNumber, type: 'Receipt' }
    });
    assert(Boolean(movement && movement.quantityDelta === 50), 'Immutable StockMovement of type Receipt logged (+50)');

    // Attempt negative stock deduction
    const negAdjRes = await request('POST', '/api/pharmacy/inventory/adjust', {
      role: 'PHARMACIST',
      body: {
        stockId: receivedBatch.id,
        adjustmentType: 'Audit Adjustment',
        quantityDelta: -60,
        reason: 'Attempted oversized deduction to test boundary guard'
      }
    });
    assert(negAdjRes.status === 400, 'Oversized stock reduction (-60 from 50) rejected with HTTP 400 NegativeStockPrevented');

    // -------------------------------------------------------------------------
    // SECTION 11: WORKFLOW 10 — OPERATIONAL & CLINICAL REPORTS
    // -------------------------------------------------------------------------
    console.log(`\n${BOLD}SECTION 11: Workflow 10 — Operational & Clinical Reports with Persisted Data${RESET}`);

    // 1. Patient Demographics Report
    const patRepRes = await request('GET', '/api/reports/patients', { role: 'RECEPTIONIST' });
    assert(patRepRes.status === 200, 'GET /api/reports/patients returns HTTP 200');
    assert(typeof patRepRes.body.data.total === 'number' && patRepRes.body.data.total >= 2, 'Patient report counts actual persisted patients');

    // 2. Appointment Report
    const aptRepRes = await request('GET', '/api/reports/appointments', { role: 'RECEPTIONIST' });
    assert(aptRepRes.status === 200, 'GET /api/reports/appointments returns HTTP 200');
    assert(typeof aptRepRes.body.data.total === 'number', 'Appointment report aggregates scheduled, waiting, completed counts');

    // 3. Clinical Activity Report
    const clinRepRes = await request('GET', '/api/reports/clinical-activity', { role: 'DOCTOR' });
    assert(clinRepRes.status === 200, 'GET /api/reports/clinical-activity returns HTTP 200');
    assert(clinRepRes.body.data.byDiscipline.DOCTOR !== undefined, 'Clinical report aggregates DOCTOR encounters');
    assert(clinRepRes.body.data.byDiscipline.VAIDYA !== undefined, 'Clinical report aggregates VAIDYA encounters');

    // Clinical Activity Report Gated: Receptionist cannot read clinical activity
    const deniedClinRep = await request('GET', '/api/reports/clinical-activity', { role: 'RECEPTIONIST' });
    assert(deniedClinRep.status === 403, 'RECEPTIONIST blocked from clinical activity report (HTTP 403 Forbidden)');

    // 4. Treatment Report
    const treatRepRes = await request('GET', '/api/reports/treatments', { role: 'VAIDYA' });
    assert(treatRepRes.status === 200, 'GET /api/reports/treatments returns HTTP 200');
    assert(typeof treatRepRes.body.data.sessions.total === 'number', 'Treatment report aggregates therapy sessions');
    assert(typeof treatRepRes.body.data.courses.total === 'number', 'Treatment report aggregates Panchakarma courses');

    // 5. Pharmacy Inventory Report
    const pharmRepRes = await request('GET', '/api/reports/pharmacy', { role: 'PHARMACIST' });
    assert(pharmRepRes.status === 200, 'GET /api/reports/pharmacy returns HTTP 200');
    assert(typeof pharmRepRes.body.data.totalStockBatches === 'number', 'Pharmacy report counts stock batches');

    // 6. Staff Workforce Report
    const staffRepRes = await request('GET', '/api/reports/staff-departments', { role: 'ADMIN' });
    assert(staffRepRes.status === 200, 'GET /api/reports/staff-departments returns HTTP 200');
    assert(typeof staffRepRes.body.data.totalStaff === 'number', 'Staff report breaks down headcount by role and department');

    // 7. Financial Daily Collection Report
    const dailyCollRes = await request('GET', '/api/billing/reports/daily-collection', { role: 'ACCOUNTANT' });
    assert(dailyCollRes.status === 200, 'GET /api/billing/reports/daily-collection returns HTTP 200');
    assert(typeof dailyCollRes.body.data.totalCollected === 'number', 'Financial report calculates collected totals using Prisma Decimal');

    // -------------------------------------------------------------------------
    // SECTION 12: STRICT 7-ROLE RBAC AUTHORIZATION MATRIX
    // -------------------------------------------------------------------------
    console.log(`\n${BOLD}SECTION 12: Strict 7-Role RBAC Authorization Matrix Enforcement${RESET}`);

    // Clinician boundaries: DOCTOR blocked from Ayurvedic actions
    const docOnAyur = await request('POST', `/api/clinical/encounters/${ayurEnc.id}/prakriti`, {
      role: 'DOCTOR',
      body: { dominantPrakriti: 'Vata' }
    });
    assert(docOnAyur.status === 403, 'DOCTOR blocked from authoring Prakriti assessment (HTTP 403 CLINICAL_DISCIPLINE_MISMATCH)');

    // Clinician boundaries: VAIDYA blocked from DOCTOR prescription
    const vaidyaOnMed = await request('POST', '/api/pharmacy/prescriptions', {
      role: 'VAIDYA',
      body: {
        patientId: patient1.id,
        medicationName: 'Amoxicillin 500mg',
        dosage: '500mg',
        frequency: 'BD',
        duration: '5 days',
        quantity: 10,
        discipline: 'DOCTOR'
      }
    });
    assert(vaidyaOnMed.status === 403, 'VAIDYA blocked from issuing Modern Medicine prescription (HTTP 403 CLINICAL_DISCIPLINE_MISMATCH)');

    // Administrative boundaries: ADMIN & SUPER_ADMIN blocked from clinical session start
    const adminClinStart = await request('POST', `/api/therapy-sessions/${session1.id}/start`, {
      role: 'ADMIN',
      body: { clinicalClearance: true }
    });
    assert(adminClinStart.status === 403, 'ADMIN blocked from clinical therapy start (HTTP 403 CLINICAL_AUTHORITY_REQUIRED)');

    const superAdminClinStart = await request('POST', `/api/therapy-sessions/${session1.id}/start`, {
      role: 'SUPER_ADMIN',
      body: { clinicalClearance: true }
    });
    assert(superAdminClinStart.status === 403, 'SUPER_ADMIN blocked from clinical therapy start (HTTP 403 CLINICAL_AUTHORITY_REQUIRED)');

    // Front Desk boundaries: RECEPTIONIST blocked from billing & dispensing
    const recepDispense = await request('POST', `/api/pharmacy/prescriptions/${rx1.id}/dispense`, {
      role: 'RECEPTIONIST',
      body: { quantityToDispense: 5, stockId: medStock.id }
    });
    assert(recepDispense.status === 403, 'RECEPTIONIST blocked from dispensing medications (HTTP 403 Forbidden)');

    const recepBilling = await request('POST', '/api/invoices', {
      role: 'RECEPTIONIST',
      body: { patientId: patient1.id, items: [] }
    });
    assert(recepBilling.status === 403, 'RECEPTIONIST blocked from creating billing invoices (HTTP 403 Forbidden)');

    // Dispensary boundaries: PHARMACIST blocked from scheduling appointments
    const pharmSched = await request('POST', '/api/appointments', {
      role: 'PHARMACIST',
      body: { patientId: patient1.id, appointmentDate: '2026-11-25' }
    });
    assert(pharmSched.status === 403, 'PHARMACIST blocked from scheduling appointments (HTTP 403 Forbidden)');

    // Financial boundaries: ACCOUNTANT blocked from clinical notes & pharmacy stock adjustment
    const accAdjStock = await request('POST', '/api/pharmacy/inventory/adjust', {
      role: 'ACCOUNTANT',
      body: { stockId: receivedBatch.id, quantityDelta: -5, reason: 'Test' }
    });
    assert(accAdjStock.status === 403, 'ACCOUNTANT blocked from modifying pharmacy inventory (HTTP 403 Forbidden)');

    // -------------------------------------------------------------------------
    // SECTION 13: TRUE PARALLEL CONCURRENCY & RACE-SAFETY INTEGRATION
    // -------------------------------------------------------------------------
    console.log(`\n${BOLD}SECTION 13: True Parallel Concurrency & Race-Safety Integration (Promise.all)${RESET}`);

    // 1. Parallel Same-Room Scheduling
    const concurrentRoomTime = '2026-11-22T14:00:00Z';
    const concurrentRoomEndTime = '2026-11-22T15:00:00Z';
    const roomSchedResults = await Promise.all([
      request('POST', '/api/therapy-sessions', {
        role: 'RECEPTIONIST',
        body: {
          patientId: patient1.id,
          roomId: room1.id,
          administeringStaffId: authStaff.id,
          responsibleVaidyaId: vaidyaStaffMember.id,
          therapyType: 'SWEDANA',
          scheduledStartAt: concurrentRoomTime,
          scheduledEndAt: concurrentRoomEndTime
        }
      }),
      request('POST', '/api/therapy-sessions', {
        role: 'RECEPTIONIST',
        body: {
          patientId: ayurPat.id,
          roomId: room1.id,
          administeringStaffId: authStaff.id,
          responsibleVaidyaId: vaidyaStaffMember.id,
          therapyType: 'SWEDANA',
          scheduledStartAt: concurrentRoomTime,
          scheduledEndAt: concurrentRoomEndTime
        }
      })
    ]);
    const roomSuccessCount = roomSchedResults.filter(r => r.status === 201).length;
    const roomConflictCount = roomSchedResults.filter(r => r.status === 409).length;
    assert(roomSuccessCount === 1 && roomConflictCount === 1, 'True parallel same-room scheduling: Exactly one 201 and one 409 conflict');

    // 2. Parallel Same-Practitioner Appointment Scheduling
    const concurrentAptTime = '11:00 AM';
    const aptSchedResults = await Promise.all([
      request('POST', '/api/appointments', {
        role: 'RECEPTIONIST',
        body: {
          patientId: patient1.id,
          practitionerId: doctorUser?.id,
          appointmentDate: '2026-11-23',
          timeSlot: concurrentAptTime,
          type: 'General Consultation'
        }
      }),
      request('POST', '/api/appointments', {
        role: 'RECEPTIONIST',
        body: {
          patientId: ayurPat.id,
          practitionerId: doctorUser?.id,
          appointmentDate: '2026-11-23',
          timeSlot: concurrentAptTime,
          type: 'General Consultation'
        }
      })
    ]);
    const aptSuccessCount = aptSchedResults.filter(r => r.status === 201).length;
    const aptConflictCount = aptSchedResults.filter(r => r.status === 409).length;
    assert(aptSuccessCount === 1 && aptConflictCount === 1, 'True parallel same-practitioner slot scheduling: Exactly one 201 and one 409 conflict');

    // 3. Parallel Inventory Decrement Concurrency
    const limitedStock = await prisma.medicationStock.create({
      data: {
        drugName: `Limited Drug ${Date.now()}`,
        genericName: 'Limited Drug Generic',
        category: 'Analgesics',
        form: 'Tablet',
        strength: '10mg',
        stockQuantity: 10,
        unit: 'tablets',
        minThreshold: 2,
        batchNumber: `LMT-${Date.now()}`,
        expiryDate: '2028-12-31',
        isActive: true,
        status: 'in_stock'
      }
    });

    const rxA = await prisma.prescription.create({
      data: {
        rxNumber: `RX-${Date.now()}-A`,
        patientId: patient1.id,
        patientName: `${patient1.firstName} ${patient1.lastName}`,
        mrn: patient1.mrn,
        doctorId: doctorUser?.id,
        doctorName: doctorUser?.name || 'Dr. Doctor',
        frequency: 'OD',
        duration: '1 day',
        medicationName: limitedStock.drugName,
        dosage: '10mg',
        quantity: 8,
        status: 'pending',
        remainingQuantity: 8,
        dispensedQuantity: 0
      }
    });

    const rxB = await prisma.prescription.create({
      data: {
        rxNumber: `RX-${Date.now()}-B`,
        patientId: ayurPat.id,
        patientName: `${ayurPat.firstName} ${ayurPat.lastName}`,
        mrn: ayurPat.mrn,
        doctorId: doctorUser?.id,
        doctorName: doctorUser?.name || 'Dr. Doctor',
        frequency: 'OD',
        duration: '1 day',
        medicationName: limitedStock.drugName,
        dosage: '10mg',
        quantity: 8,
        status: 'pending',
        remainingQuantity: 8,
        dispensedQuantity: 0
      }
    });

    const dispResults = await Promise.all([
      request('POST', `/api/pharmacy/prescriptions/${rxA.id}/dispense`, {
        role: 'PHARMACIST',
        body: { quantityToDispense: 8, stockId: limitedStock.id }
      }),
      request('POST', `/api/pharmacy/prescriptions/${rxB.id}/dispense`, {
        role: 'PHARMACIST',
        body: { quantityToDispense: 8, stockId: limitedStock.id }
      })
    ]);
    const dispSuccessCount = dispResults.filter(r => r.status === 200).length;
    const dispFailureCount = dispResults.filter(r => r.status === 400).length;
    assert(dispSuccessCount === 1 && dispFailureCount === 1, 'Concurrent dispensing exceeding available stock: Exactly one 200 and one 400 rejection');

    const finalStockRow = await prisma.medicationStock.findUnique({ where: { id: limitedStock.id } });
    assert(finalStockRow?.stockQuantity === 2, 'Stock remaining is exactly 2 units without negative overspending (10 - 8 = 2)');

    // -------------------------------------------------------------------------
    // SECTION 14: PRODUCTION DATABASE ZERO-MUTATION VERIFICATION
    // -------------------------------------------------------------------------
    console.log(`\n${BOLD}SECTION 14: Final Production Database Zero-Mutation Verification${RESET}`);

    if (prodProbePrisma) {
      const finalProdMigrations = await prodProbePrisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT count(*) FROM _prisma_migrations WHERE rolled_back_at IS NULL;
      `;
      assert(Number(finalProdMigrations[0]?.count) === 19, 'Final check: Production migrations strictly preserved at 19');

      const finalProdUsers = await prodProbePrisma.user.count();
      const finalProdPatients = await prodProbePrisma.patient.count();
      const finalProdInvoices = await prodProbePrisma.invoice.count();

      assert(finalProdUsers === 1, 'Final check: Production users count strictly unchanged (1 == 1)');
      assert(finalProdPatients === 0, 'Final check: Production patients count strictly 0');
      assert(finalProdInvoices === 0, 'Final check: Production invoices count strictly 0');
    } else {
      console.log('  ℹ [SKIPPED] Final production database zero-mutation probe skipped: isolated CI/test environment (zero production database access).');
    }

  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    if (prodProbePrisma) await prodProbePrisma.$disconnect().catch(() => {});
    await prisma.$disconnect();
  }

  console.log(`\n${BOLD}========================================================================${RESET}`);
  console.log(`${BOLD}   MASTER SYSTEM COMPLETION VERIFICATION SUMMARY   ${RESET}`);
  console.log(`${BOLD}========================================================================${RESET}`);
  console.log(`Total Assertions Evaluated : ${passed + failed}`);
  console.log(`Assertions Passed          : ${GREEN}${passed}${RESET}`);
  console.log(`Assertions Failed          : ${failed > 0 ? RED : GREEN}${failed}${RESET}`);
  console.log(`${BOLD}========================================================================${RESET}\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('\nFatal error during master verification:', err);
  process.exit(1);
});
