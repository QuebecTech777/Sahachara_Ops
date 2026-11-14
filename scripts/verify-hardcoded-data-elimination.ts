/**
 * Sahachara Ops — Hardcoded Operational Data Elimination & Truthful Telemetry Regression Suite
 *
 * Verifies:
 * 1. Zero forbidden demo identities (Eleanor Vance, Dr. Sarah Chen, Marcus Sterling, etc.) in src/ or production paths.
 * 2. All seed arrays in src/data/seedData.ts and server/dataStore.ts are strictly empty ([]).
 * 3. INITIAL_METRICS contains authentic zero values.
 * 4. Inpatient bed concepts (INITIAL_BEDS, localBeds, /api/beds) are completely eliminated.
 * 5. Frontend components (Settings, PDF Generator, Modals) contain no hardcoded fallback numbers or demo doctors.
 * 6. Database-backed overview metrics return authentic counts (0 on empty clinic).
 */

const TEST_DB_URL = process.env.TEST_DATABASE_URL || 'postgresql://highflyer@localhost:5432/sahachara_ops_test_db';
process.env.DATABASE_URL = TEST_DB_URL;
process.env.ENABLE_TEST_ACCOUNTS = 'true';
process.env.NODE_ENV = 'test';

import fs from 'fs';
import path from 'path';
import {
  INITIAL_PATIENTS,
  INITIAL_TRIAGE,
  INITIAL_DOCTORS,
  INITIAL_APPOINTMENTS,
  INITIAL_REMINDERS,
  INITIAL_PRESCRIPTIONS,
  INITIAL_MEDICATION_STOCK,
  INITIAL_LAB_ORDERS,
  INITIAL_INVOICES,
  INITIAL_AUDIT_LOGS,
  INITIAL_USERS,
  INITIAL_METRICS,
  INITIAL_CONSULTATIONS,
  INITIAL_TREATMENT_PLANS,
  INITIAL_PANCHAKARMA_COURSES,
  INITIAL_STOCK_MOVEMENTS,
  INITIAL_SUPPLIERS,
  INITIAL_STAFF,
  INITIAL_TARIFFS
} from '../src/data/seedData.ts';
import { hospitalStore } from '../server/dataStore.ts';
import { dbGetOverviewMetrics, checkPrismaConnection } from '../server/prismaService.ts';

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const CYAN = '\x1b[36m';
const RESET = '\x1b[0m';

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`  ${GREEN}✓ PASS${RESET} ${testName}`);
    passed++;
  } else {
    console.error(`  ${RED}✗ FAIL${RESET} ${testName}${detail ? ` (${detail})` : ''}`);
    failed++;
  }
}

function scanDirectory(dir: string, fileList: string[] = []): string[] {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      if (file !== 'node_modules' && file !== '.git' && file !== 'dist') {
        scanDirectory(fullPath, fileList);
      }
    } else if (file.endsWith('.ts') || file.endsWith('.tsx')) {
      fileList.push(fullPath);
    }
  }
  return fileList;
}

async function run() {
  console.log(`\n============================================================`);
  console.log(`  SAHACHARA OPS — HARDCODED DATA ELIMINATION SUITE`);
  console.log(`============================================================\n`);

  // -------------------------------------------------------------
  // TEST GROUP 1: SYSTEM-WIDE SCAN FOR FORBIDDEN DEMO IDENTITIES
  // -------------------------------------------------------------
  console.log(`--- GROUP 1: Forbidden Demo Identities Scan in src/ ---`);

  const forbiddenNames = [
    'Eleanor Vance',
    'Sarah Chen',
    'Marcus Sterling',
    'Arthur Pendelton',
    'Elena Rostova',
    'Maya Lin',
    'Robert Rivera',
    'Kavita Sharma',
    'Rajesh Nair',
    'Anand Pillai',
    'Lakshmi Menon',
    'Priya Nambiar',
    'MRN-84920'
  ];

  const srcFiles = scanDirectory(path.resolve(process.cwd(), 'src'));
  console.log(`  Scanning ${srcFiles.length} TypeScript / TSX files in src/...`);

  const violations: Array<{ file: string; line: number; text: string }> = [];

  for (const f of srcFiles) {
    const content = fs.readFileSync(f, 'utf8');
    const lines = content.split('\n');
    lines.forEach((line, idx) => {
      for (const name of forbiddenNames) {
        if (line.includes(name)) {
          violations.push({ file: path.relative(process.cwd(), f), line: idx + 1, text: line.trim() });
        }
      }
    });
  }

  assert(
    violations.length === 0,
    `Zero forbidden demo staff or patient identities found in src/`,
    violations.map((v) => `${v.file}:${v.line} (${v.text})`).join('; ')
  );

  // -------------------------------------------------------------
  // TEST GROUP 2: SEED DATASETS AND TARIFF BASELINE INTEGRITY
  // -------------------------------------------------------------
  console.log(`\n--- GROUP 2: Seed Datasets & Tariff Baseline Integrity ---`);

  assert(INITIAL_PATIENTS.length === 0, `INITIAL_PATIENTS is strictly empty ([]): length ${INITIAL_PATIENTS.length}`);
  assert(INITIAL_TRIAGE.length === 0, `INITIAL_TRIAGE is strictly empty ([]): length ${INITIAL_TRIAGE.length}`);
  assert(INITIAL_DOCTORS.length === 0, `INITIAL_DOCTORS is strictly empty ([]): length ${INITIAL_DOCTORS.length}`);
  assert(INITIAL_APPOINTMENTS.length === 0, `INITIAL_APPOINTMENTS is strictly empty ([]): length ${INITIAL_APPOINTMENTS.length}`);
  assert(INITIAL_REMINDERS.length === 0, `INITIAL_REMINDERS is strictly empty ([]): length ${INITIAL_REMINDERS.length}`);
  assert(INITIAL_PRESCRIPTIONS.length === 0, `INITIAL_PRESCRIPTIONS is strictly empty ([]): length ${INITIAL_PRESCRIPTIONS.length}`);
  assert(INITIAL_MEDICATION_STOCK.length === 0, `INITIAL_MEDICATION_STOCK is strictly empty ([]): length ${INITIAL_MEDICATION_STOCK.length}`);
  assert(INITIAL_LAB_ORDERS.length === 0, `INITIAL_LAB_ORDERS is strictly empty ([]): length ${INITIAL_LAB_ORDERS.length}`);
  assert(INITIAL_INVOICES.length === 0, `INITIAL_INVOICES is strictly empty ([]): length ${INITIAL_INVOICES.length}`);
  assert(INITIAL_AUDIT_LOGS.length === 0, `INITIAL_AUDIT_LOGS is strictly empty ([]): length ${INITIAL_AUDIT_LOGS.length}`);
  assert(INITIAL_USERS.length === 0, `INITIAL_USERS is strictly empty ([]): length ${INITIAL_USERS.length}`);
  assert(INITIAL_CONSULTATIONS.length === 0, `INITIAL_CONSULTATIONS is strictly empty ([]): length ${INITIAL_CONSULTATIONS.length}`);
  assert(INITIAL_TREATMENT_PLANS.length === 0, `INITIAL_TREATMENT_PLANS is strictly empty ([]): length ${INITIAL_TREATMENT_PLANS.length}`);
  assert(INITIAL_PANCHAKARMA_COURSES.length === 0, `INITIAL_PANCHAKARMA_COURSES is strictly empty ([]): length ${INITIAL_PANCHAKARMA_COURSES.length}`);
  assert(INITIAL_STOCK_MOVEMENTS.length === 0, `INITIAL_STOCK_MOVEMENTS is strictly empty ([]): length ${INITIAL_STOCK_MOVEMENTS.length}`);
  assert(INITIAL_SUPPLIERS.length === 0, `INITIAL_SUPPLIERS is strictly empty ([]): length ${INITIAL_SUPPLIERS.length}`);
  assert(INITIAL_STAFF.length === 0, `INITIAL_STAFF is strictly empty ([]): length ${INITIAL_STAFF.length}`);
  assert(INITIAL_TARIFFS.length === 0, `INITIAL_TARIFFS is strictly empty ([]): length ${INITIAL_TARIFFS.length}`);

  // -------------------------------------------------------------
  // TEST GROUP 3: INITIAL METRICS ZERO BASELINE
  // -------------------------------------------------------------
  console.log(`\n--- GROUP 3: Baseline Metrics Authenticity ---`);

  assert(INITIAL_METRICS.totalPatientsToday === 0, `INITIAL_METRICS.totalPatientsToday === 0 (was 148)`);
  assert(INITIAL_METRICS.todayRevenueInr === 0, `INITIAL_METRICS.todayRevenueInr === 0 (was 142500)`);
  assert(INITIAL_METRICS.activeDoctorsOnDuty === 0, `INITIAL_METRICS.activeDoctorsOnDuty === 0 (was 4)`);
  assert(INITIAL_METRICS.criticalLabAlerts === 0, `INITIAL_METRICS.criticalLabAlerts === 0 (was 3)`);
  assert(INITIAL_METRICS.pendingPrescriptions === 0, `INITIAL_METRICS.pendingPrescriptions === 0 (was 1)`);
  assert(INITIAL_METRICS.scheduledAppointmentsToday === 0, `INITIAL_METRICS.scheduledAppointmentsToday === 0 (was 5)`);
  assert(INITIAL_METRICS.activeTreatments === 0, `INITIAL_METRICS.activeTreatments === 0 (was 8)`);
  assert(INITIAL_METRICS.activePanchakarmaCourses === 0, `INITIAL_METRICS.activePanchakarmaCourses === 0 (was 5)`);
  assert(INITIAL_METRICS.erWaitTimeMinutes === 0, `INITIAL_METRICS.erWaitTimeMinutes === 0 (was 18)`);
  assert(INITIAL_METRICS.occupiedBeds === 0, `INITIAL_METRICS.occupiedBeds === 0 (was 5)`);
  assert(INITIAL_METRICS.totalBeds === 0, `INITIAL_METRICS.totalBeds === 0 (was 12)`);
  assert(INITIAL_METRICS.occupancyRate === 0, `INITIAL_METRICS.occupancyRate === 0 (was 41.7)`);

  // -------------------------------------------------------------
  // TEST GROUP 4: INPATIENT BEDS & WARDS COMPLETE ELIMINATION
  // -------------------------------------------------------------
  console.log(`\n--- GROUP 4: Inpatient Beds Elimination ---`);

  const seedContent = fs.readFileSync(path.resolve(process.cwd(), 'src/data/seedData.ts'), 'utf8');
  assert(!seedContent.includes('INITIAL_BEDS'), `src/data/seedData.ts contains no INITIAL_BEDS definition`);

  const storeContent = fs.readFileSync(path.resolve(process.cwd(), 'server/dataStore.ts'), 'utf8');
  assert(!storeContent.includes('beds: Bed[]'), `server/dataStore.ts contains no beds: Bed[] field`);

  const routesContent = fs.readFileSync(path.resolve(process.cwd(), 'server/routes.ts'), 'utf8');
  assert(!routesContent.includes("apiRouter.get('/beds'"), `server/routes.ts does not register GET /beds`);
  assert(!routesContent.includes("apiRouter.patch('/beds/"), `server/routes.ts does not register PATCH /beds/:id`);

  const hospitalApiContent = fs.readFileSync(path.resolve(process.cwd(), 'src/services/hospitalApi.ts'), 'utf8');
  assert(!hospitalApiContent.includes('getBeds():'), `src/services/hospitalApi.ts contains no getBeds()`);
  assert(!hospitalApiContent.includes('updateBed('), `src/services/hospitalApi.ts contains no updateBed()`);
  assert(!hospitalApiContent.includes('localBeds'), `src/services/hospitalApi.ts contains no localBeds`);

  // -------------------------------------------------------------
  // TEST GROUP 5: FRONTEND FALLBACK & FABRICATED CONSTANT AUDIT
  // -------------------------------------------------------------
  console.log(`\n--- GROUP 5: Frontend Fallback & Fabricated Constant Audit ---`);

  const settingsContent = fs.readFileSync(path.resolve(process.cwd(), 'src/views/SettingsWorkspaceView.tsx'), 'utf8');
  assert(!settingsContent.includes('staff.length || 18'), `SettingsWorkspaceView has no fabricated 'staff.length || 18'`);
  assert(!settingsContent.includes("filter((s) => s.status === 'on_duty').length || 6"), `SettingsWorkspaceView has no fabricated 'on_duty || 6'`);

  const pdfGenContent = fs.readFileSync(path.resolve(process.cwd(), 'src/services/clinicalPdfGenerator.ts'), 'utf8');
  assert(!pdfGenContent.includes('142500'), `clinicalPdfGenerator has no hardcoded 142500 revenue`);
  assert(!pdfGenContent.includes('consultations.length || 3'), `clinicalPdfGenerator has no 'consultations.length || 3'`);
  assert(!pdfGenContent.includes('prescriptions.length || 6'), `clinicalPdfGenerator has no 'prescriptions.length || 6'`);
  assert(!pdfGenContent.includes('appointments.length || 5'), `clinicalPdfGenerator has no 'appointments.length || 5'`);

  const labModalContent = fs.readFileSync(path.resolve(process.cwd(), 'src/components/modals/LabOrderModal.tsx'), 'utf8');
  assert(!labModalContent.includes('Dr. Robert Rivera, MD (Emergency)'), `LabOrderModal has no hardcoded Western ER doctor options`);

  const rxModalContent = fs.readFileSync(path.resolve(process.cwd(), 'src/components/modals/PrescriptionModal.tsx'), 'utf8');
  assert(!rxModalContent.includes('Dr. Arthur Pendelton, MD (Orthopedics)'), `PrescriptionModal has no hardcoded Western orthopedic doctor options`);

  const newPatientModalContent = fs.readFileSync(path.resolve(process.cwd(), 'src/components/modals/NewPatientModal.tsx'), 'utf8');
  assert(!newPatientModalContent.includes("useState('1985-05-15')"), `NewPatientModal does not prefill fake DOB 1985-05-15`);
  assert(!newPatientModalContent.includes('useState<number | \'\'>(41)'), `NewPatientModal does not prefill fake age 41`);

  // -------------------------------------------------------------
  // TEST GROUP 6: DATABASE-BACKED METRICS ENGINE VERIFICATION
  // -------------------------------------------------------------
  console.log(`\n--- GROUP 6: Database-Backed Metrics Engine Verification ---`);

  await checkPrismaConnection();
  const dbMetrics = await dbGetOverviewMetrics();

  assert(typeof dbMetrics.totalPatientsToday === 'number', `dbGetOverviewMetrics().totalPatientsToday is numeric (${dbMetrics.totalPatientsToday})`);
  assert(typeof dbMetrics.todayRevenueInr === 'number', `dbGetOverviewMetrics().todayRevenueInr is numeric (${dbMetrics.todayRevenueInr})`);
  assert(dbMetrics.erWaitTimeMinutes === 0, `dbGetOverviewMetrics().erWaitTimeMinutes is 0 (No ER)`);
  assert(dbMetrics.occupiedBeds === 0, `dbGetOverviewMetrics().occupiedBeds is 0 (No inpatient beds)`);
  assert(dbMetrics.totalBeds === 0, `dbGetOverviewMetrics().totalBeds is 0 (No inpatient beds)`);
  assert(dbMetrics.occupancyRate === 0, `dbGetOverviewMetrics().occupancyRate is 0`);
  assert(dbMetrics.admittedToday === 0, `dbGetOverviewMetrics().admittedToday is 0 (No inpatient admissions)`);
  assert(dbMetrics.dischargedToday === 0, `dbGetOverviewMetrics().dischargedToday is 0 (No inpatient discharges)`);

  console.log(`\n============================================================`);
  console.log(`  VERIFICATION RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log(`============================================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

run().catch((err) => {
  console.error('Fatal error executing hardcoded data elimination suite:', err);
  process.exit(1);
});
