/**
 * Sahachara Ops — Complete Backend API Security & 7-Role RBAC Verification Suite
 *
 * Verifies:
 * 1. Complete API endpoint inventory & security classification.
 * 2. Protected endpoints reject missing, malformed, expired, tampered, or inactive-user tokens (HTTP 401).
 * 3. Exact public endpoint whitelist is restricted strictly to unauthenticated utilities (/health, /api/clinic/info, /api/auth/login, /api/auth/activate).
 * 4. 7-Role RBAC Permission Matrix enforces allowed & forbidden operations (HTTP 403).
 * 5. SUPER_ADMIN-only tariff governance is strictly enforced.
 * 6. Record-level authorization rejects unauthorized resource access.
 */

const TEST_DB_URL = process.env.TEST_DATABASE_URL || 'postgresql://highflyer@localhost:5432/sahachara_ops_test_db';
process.env.DATABASE_URL = TEST_DB_URL;
process.env.ENABLE_TEST_ACCOUNTS = 'true';
process.env.NODE_ENV = 'test';

import http from 'http';
import express from 'express';
import crypto from 'crypto';
import { apiRouter } from '../server/routes.ts';
import { generateSessionToken, getSessionSecret, TokenPayload } from '../server/rbacMiddleware.ts';
import { checkPrismaConnection, ensureDefaultDatabaseUsers, prisma } from '../server/prismaService.ts';
import { UserRole } from '../src/types/hospital.ts';

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

function makeRequest(
  port: number,
  path: string,
  method: string = 'GET',
  token?: string | null,
  body?: any
): Promise<{ statusCode: number; body: any; headers: http.IncomingHttpHeaders }> {
  return new Promise((resolve, reject) => {
    const postData = body ? JSON.stringify(body) : '';
    const headers: Record<string, string> = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    if (body) {
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = String(Buffer.byteLength(postData));
    }

    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path,
        method,
        headers
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          let parsed: any = data;
          try {
            parsed = JSON.parse(data);
          } catch {}
          resolve({
            statusCode: res.statusCode || 0,
            body: parsed,
            headers: res.headers
          });
        });
      }
    );

    req.on('error', (err) => reject(err));
    if (postData) req.write(postData);
    req.end();
  });
}

async function run() {
  console.log(`\n============================================================`);
  console.log(`  SAHACHARA OPS — COMPLETE API SECURITY & RBAC INVENTORY`);
  console.log(`============================================================\n`);

  // 1. Initialize Prisma & verify isolated test database
  const connected = await checkPrismaConnection();
  if (!connected) {
    console.error('FATAL: Could not connect to isolated test database.');
    process.exit(1);
  }
  await ensureDefaultDatabaseUsers();
  console.log(`${CYAN}✓ Connected to test database & verified test users${RESET}\n`);

  // Ensure test patient exists for foreign key references
  let testPatient = await prisma.patient.findFirst({ where: { deletedAt: null } });
  if (!testPatient) {
    testPatient = await prisma.patient.create({
      data: {
        mrn: 'MRN-TEST-001',
        firstName: 'Ananya',
        lastName: 'Devi',
        dob: '1990-01-01',
        age: 36,
        gender: 'Female',
        phone: '+91 98450 12345',
        email: 'ananya.devi.test@sahachara.com'
      }
    });
  }

  // Ensure test tariff exists
  let testTariff = await prisma.hospitalTariff.findFirst({ where: { isActive: true, rate: { not: null } } });
  if (!testTariff) {
    testTariff = await prisma.hospitalTariff.create({
      data: {
        serviceCode: 'SRV-TEST-BILL',
        serviceName: 'Kayachikitsa OPD Consultation',
        category: 'Consultation',
        department: 'Kayachikitsa',
        rate: 350,
        isActive: true
      }
    });
  }

  // 2. Start Test Express server
  const app = express();
  app.use(express.json());
  app.get('/health', (_req, res) => res.json({ status: 'ok' }));
  app.use('/api', apiRouter);

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const address = server.address() as any;
  const port = address.port;
  console.log(`${CYAN}✓ Test Express server listening on port ${port}${RESET}\n`);

  try {
    // -------------------------------------------------------------
    // PART 1: COMPLETE API ROUTE DISCOVERY & CLASSIFICATION
    // -------------------------------------------------------------
    console.log(`--- PART 1: API Endpoint Inventory & Security Classification ---`);

    const routes: Array<{ method: string; path: string }> = [];
    routes.push({ method: 'GET', path: '/health' });

    apiRouter.stack.forEach((layer: any) => {
      if (layer.route && layer.route.path) {
        const rawPaths = Array.isArray(layer.route.path) ? layer.route.path : [layer.route.path];
        const methods = Object.keys(layer.route.methods).filter((m) => m !== '_all').map((m) => m.toUpperCase());
        for (const p of rawPaths) {
          for (const m of methods) {
            routes.push({ method: m, path: `/api${p}` });
          }
        }
      }
    });

    console.log(`  Discovered ${routes.length} total HTTP endpoints registered on server.`);
    assert(routes.length >= 180, `Total registered endpoints count (${routes.length}) meets comprehensive coverage`);

    // Whitelist of legitimate public endpoints
    const publicWhitelist = [
      'GET /health',
      'GET /api/clinic/info',
      'POST /api/auth/login',
      'POST /api/auth/activate'
    ];

    // Verify each registered route against missing authentication
    let unauthenticatedRejections = 0;
    const unexpectedPublicEndpoints: string[] = [];

    for (const r of routes) {
      const routeKey = `${r.method} ${r.path}`;
      if (publicWhitelist.includes(routeKey)) {
        continue;
      }

      const testPath = r.path
        .replace(/:[a-zA-Z0-9_]+/g, 'test-id')
        .replace(/\*/g, '');

      const res = await makeRequest(port, testPath, r.method, null);
      if (res.statusCode === 401) {
        unauthenticatedRejections++;
      } else {
        unexpectedPublicEndpoints.push(`${routeKey} (Status: ${res.statusCode})`);
      }
    }

    assert(
      unexpectedPublicEndpoints.length === 0,
      `All ${unauthenticatedRejections} protected endpoints strictly enforce authentication (HTTP 401 when token missing)`,
      unexpectedPublicEndpoints.join(', ')
    );

    // Verify that the 4 public endpoints respond appropriately without token
    const resHealth = await makeRequest(port, '/health', 'GET');
    assert(resHealth.statusCode === 200, `GET /health is public and returns HTTP 200`);

    const resClinicInfo = await makeRequest(port, '/api/clinic/info', 'GET');
    assert(resClinicInfo.statusCode === 200, `GET /api/clinic/info is public and returns HTTP 200`);

    const resActivate = await makeRequest(port, '/api/auth/activate', 'POST', null, { email: 'test@sahachara.com' });
    assert(resActivate.statusCode === 400, `POST /api/auth/activate is public (returns HTTP 400 for missing PIN, not 401)`);

    const resLogin = await makeRequest(port, '/api/auth/login', 'POST', null, { email: 'admin.ops@sahachara.com', password: 'Admin@Sahachara2026!' });
    assert(resLogin.statusCode === 200, `POST /api/auth/login is public and authenticates valid credentials (HTTP 200)`);

    // Confirm unapproved beds endpoint does not exist
    const bedsRes = await makeRequest(port, '/api/beds', 'GET', null);
    assert(bedsRes.statusCode === 404, `Unapproved inpatient /api/beds endpoint returns 404 Not Found (Eliminated)`);

    // -------------------------------------------------------------
    // PART 2: AUTHENTICATION ENFORCEMENT & TOKEN VALIDATION
    // -------------------------------------------------------------
    console.log(`\n--- PART 2: Authentication Fail-Closed Token Validation ---`);

    const testProtectedPath = '/api/overview';

    // 1. Missing token
    const resMissing = await makeRequest(port, testProtectedPath, 'GET', null);
    assert(resMissing.statusCode === 401, `Protected endpoint rejects missing token with HTTP 401`);

    // 2. Malformed token
    const resMalformed = await makeRequest(port, testProtectedPath, 'GET', 'this_is_not_a_valid_jwt_or_signature');
    assert(resMalformed.statusCode === 401, `Protected endpoint rejects malformed token with HTTP 401`);

    // 3. Invalid HMAC signature
    const validPayload: TokenPayload = {
      userId: 'usr-admin',
      role: 'ADMIN',
      email: 'admin.ops@sahachara.com',
      name: 'Operations Administrator',
      exp: Math.floor(Date.now() / 1000) + 3600
    };
    const b64Payload = Buffer.from(JSON.stringify(validPayload)).toString('base64url');
    const fakeSig = crypto.createHmac('sha256', 'completely-wrong-secret-key-12345').update(b64Payload).digest('base64url');
    const forgedToken = `sah_${b64Payload}.${fakeSig}`;
    const resForged = await makeRequest(port, testProtectedPath, 'GET', forgedToken);
    assert(resForged.statusCode === 401, `Protected endpoint rejects forged HMAC signature with HTTP 401`);

    // 4. Expired token (generate with negative expiration offset)
    const expiredToken = generateSessionToken(validPayload, -3600);
    const resExpired = await makeRequest(port, testProtectedPath, 'GET', expiredToken);
    assert(resExpired.statusCode === 401, `Protected endpoint rejects expired token with HTTP 401`);

    // 5. Tampered token payload
    const genuineToken = generateSessionToken(validPayload);
    const rawToken = genuineToken.slice(4); // strip sah_
    const [payloadPart, sigPart] = rawToken.split('.');
    const tamperedPayload = Buffer.from(
      JSON.stringify({ ...validPayload, role: 'SUPER_ADMIN' })
    ).toString('base64url');
    const tamperedToken = `sah_${tamperedPayload}.${sigPart}`;
    const resTampered = await makeRequest(port, testProtectedPath, 'GET', tamperedToken);
    assert(resTampered.statusCode === 401, `Protected endpoint rejects tampered payload with HTTP 401`);

    // 6. Inactive / Suspended user token
    const inactiveUser = await prisma.user.upsert({
      where: { email: 'inactive.test@sahachara.com' },
      update: { status: 'suspended', isSuspended: true },
      create: {
        id: 'usr-inactive-test',
        email: 'inactive.test@sahachara.com',
        name: 'Inactive Staff',
        role: 'DOCTOR',
        passwordHash: 'dummy',
        status: 'suspended',
        isSuspended: true
      }
    });
    const inactiveToken = generateSessionToken({
      userId: inactiveUser.id,
      role: 'DOCTOR',
      name: inactiveUser.name,
      email: inactiveUser.email
    });
    const resInactive = await makeRequest(port, testProtectedPath, 'GET', inactiveToken);
    assert(resInactive.statusCode === 401, `Protected endpoint rejects token belonging to suspended user with HTTP 401`);

    // -------------------------------------------------------------
    // PART 3: SEVEN-ROLE RBAC PERMISSION MATRIX VERIFICATION
    // -------------------------------------------------------------
    console.log(`\n--- PART 3: Seven-Role RBAC Authorization Matrix ---`);

    const roles: UserRole[] = [
      'SUPER_ADMIN',
      'ADMIN',
      'DOCTOR',
      'VAIDYA',
      'RECEPTIONIST',
      'PHARMACIST',
      'ACCOUNTANT'
    ];

    const tokens: Record<UserRole, string> = {} as any;
    for (const r of roles) {
      const u = await prisma.user.findFirst({ where: { role: r, status: 'active' } });
      if (!u) {
        throw new Error(`Test fixture user for role ${r} not found in database!`);
      }
      tokens[r] = generateSessionToken({
        userId: u.id,
        role: r,
        name: u.name,
        email: u.email
      });
    }

    // 1. Tariff Configuration: ONLY SUPER_ADMIN permitted
    console.log(`  Testing Tariff Governance (POST /api/tariffs):`);
    const tariffPayload = {
      serviceCode: `SRV-TEST-${Date.now()}`,
      serviceName: 'Ksheera Dhooma',
      category: 'Panchakarma',
      department: 'Panchakarma',
      standardRate: null
    };

    const resTariffSuper = await makeRequest(port, '/api/tariffs', 'POST', tokens['SUPER_ADMIN'], tariffPayload);
    assert(resTariffSuper.statusCode === 201, `SUPER_ADMIN is allowed to configure tariffs (HTTP 201)`);

    const nonSuperRoles: UserRole[] = ['ADMIN', 'DOCTOR', 'VAIDYA', 'RECEPTIONIST', 'PHARMACIST', 'ACCOUNTANT'];
    for (const r of nonSuperRoles) {
      const resTariffOther = await makeRequest(port, '/api/tariffs', 'POST', tokens[r], tariffPayload);
      assert(
        resTariffOther.statusCode === 403,
        `Role ${r} is strictly forbidden from configuring tariffs (HTTP 403 Forbidden)`
      );
    }

    // 2. Clinical Prescription Authority: Only clinical roles (DOCTOR, VAIDYA) and SUPER_ADMIN
    console.log(`\n  Testing Clinical Prescribing Authority (POST /api/pharmacy/prescriptions):`);
    const docRxPayload = {
      patientId: testPatient.id,
      patientName: `${testPatient.firstName} ${testPatient.lastName}`,
      mrn: testPatient.mrn,
      medicationName: 'Paracetamol 500mg',
      dosage: '500mg',
      quantity: 1
    };

    const resRxDoctor = await makeRequest(port, '/api/pharmacy/prescriptions', 'POST', tokens['DOCTOR'], docRxPayload);
    assert(resRxDoctor.statusCode === 201, `DOCTOR is permitted to issue modern prescriptions (HTTP 201)`);

    // Verify DOCTOR cannot cross-prescribe classical Ayurvedic formulations (Discipline Enforcement)
    const ayurRxForDoc = {
      patientId: testPatient.id,
      patientName: `${testPatient.firstName} ${testPatient.lastName}`,
      mrn: testPatient.mrn,
      medicationName: 'Sahacharadi Thailam',
      dosage: '10ml',
      quantity: 1
    };
    const resDocAyur = await makeRequest(port, '/api/pharmacy/prescriptions', 'POST', tokens['DOCTOR'], ayurRxForDoc);
    assert(resDocAyur.statusCode === 403, `DOCTOR is strictly forbidden from cross-prescribing Ayurvedic medicines (CLINICAL_DISCIPLINE_MISMATCH 403)`);

    const vaidyaRxPayload = {
      patientId: testPatient.id,
      patientName: `${testPatient.firstName} ${testPatient.lastName}`,
      mrn: testPatient.mrn,
      medicationName: 'Sahacharadi Thailam',
      dosage: '10ml',
      quantity: 1
    };

    const resRxVaidya = await makeRequest(port, '/api/pharmacy/prescriptions', 'POST', tokens['VAIDYA'], vaidyaRxPayload);
    assert(resRxVaidya.statusCode === 201, `VAIDYA is permitted to issue Ayurvedic prescriptions (HTTP 201)`);

    const resRxReception = await makeRequest(port, '/api/pharmacy/prescriptions', 'POST', tokens['RECEPTIONIST'], docRxPayload);
    assert(resRxReception.statusCode === 403, `RECEPTIONIST is forbidden from issuing prescriptions (HTTP 403)`);

    const resRxAccountant = await makeRequest(port, '/api/pharmacy/prescriptions', 'POST', tokens['ACCOUNTANT'], docRxPayload);
    assert(resRxAccountant.statusCode === 403, `ACCOUNTANT is forbidden from issuing prescriptions (HTTP 403)`);

    // 3. Financial Billing & Payments Authority: ACCOUNTANT, ADMIN, SUPER_ADMIN
    console.log(`\n  Testing Financial Billing Authority (POST /api/billing):`);
    const billPayload = {
      patientId: testPatient.id,
      patientName: `${testPatient.firstName} ${testPatient.lastName}`,
      items: [{ tariffId: testTariff.id, description: testTariff.serviceName, quantity: 1, unitPrice: 350 }]
    };

    const resBillAccountant = await makeRequest(port, '/api/billing', 'POST', tokens['ACCOUNTANT'], billPayload);
    assert(resBillAccountant.statusCode === 201, `ACCOUNTANT is permitted to create bills (HTTP 201)`);

    const resBillDoctor = await makeRequest(port, '/api/billing', 'POST', tokens['DOCTOR'], billPayload);
    assert(resBillDoctor.statusCode === 403, `DOCTOR is forbidden from creating billing invoices (HTTP 403)`);

    // 4. Pharmacy Dispensing Authority: PHARMACIST, ADMIN, SUPER_ADMIN
    console.log(`\n  Testing Pharmacy Dispensing Authority (POST /api/pharmacy/prescriptions/:id/dispense):`);
    const dispensePayload = {
      items: [{ medicationId: 'med-1', quantity: 1 }]
    };

    const resDispenseDoctor = await makeRequest(port, '/api/pharmacy/prescriptions/rx-test/dispense', 'POST', tokens['DOCTOR'], dispensePayload);
    assert(resDispenseDoctor.statusCode === 403, `DOCTOR is forbidden from dispensing medications (HTTP 403)`);

    const resDispenseReception = await makeRequest(port, '/api/pharmacy/prescriptions/rx-test/dispense', 'POST', tokens['RECEPTIONIST'], dispensePayload);
    assert(resDispenseReception.statusCode === 403, `RECEPTIONIST is forbidden from dispensing medications (HTTP 403)`);

    // 5. Staff Administration Authority: SUPER_ADMIN, ADMIN
    console.log(`\n  Testing Staff Management Authority (POST /api/staff):`);
    const staffPayload = {
      name: 'Dr. Test Clinician',
      role: 'DOCTOR',
      designation: 'Ayurvedic Medical Officer',
      department: 'Kayachikitsa',
      email: `test.clinician.${Date.now()}@sahachara.com`,
      phone: '+91 98450 99999'
    };

    const resStaffAdmin = await makeRequest(port, '/api/staff', 'POST', tokens['ADMIN'], staffPayload);
    assert(resStaffAdmin.statusCode === 201, `ADMIN is permitted to create staff accounts (HTTP 201)`);

    const resStaffDoctor = await makeRequest(port, '/api/staff', 'POST', tokens['DOCTOR'], staffPayload);
    assert(resStaffDoctor.statusCode === 403, `DOCTOR is forbidden from creating staff accounts (HTTP 403)`);

    // -------------------------------------------------------------
    // PART 4: RECORD-LEVEL AUTHORIZATION & SENSITIVE OPERATIONS
    // -------------------------------------------------------------
    console.log(`\n--- PART 4: Record-Level Authorization & Resource Isolation ---`);

    const doctorStaff = await prisma.staffMember.findFirst({ where: { role: 'DOCTOR', status: 'active', userId: { not: null } } });
    const vaidyaStaff = await prisma.staffMember.findFirst({ where: { role: 'VAIDYA', status: 'active', userId: { not: null } } });

    if (doctorStaff && vaidyaStaff && doctorStaff.userId) {
      const docToken = generateSessionToken({
        userId: doctorStaff.userId,
        role: 'DOCTOR',
        name: doctorStaff.name,
        email: doctorStaff.email
      });

      const resOwnStaff = await makeRequest(port, `/api/staff/${doctorStaff.id}`, 'GET', docToken);
      assert(resOwnStaff.statusCode === 200, `Doctor can view their own staff record (HTTP 200)`);

      const resOtherStaff = await makeRequest(port, `/api/staff/${vaidyaStaff.id}`, 'GET', docToken);
      assert(resOtherStaff.statusCode === 403, `Doctor cannot view another staff member's profile (HTTP 403)`);

      const resAdminStaff = await makeRequest(port, `/api/staff/${doctorStaff.id}`, 'GET', tokens['ADMIN']);
      assert(resAdminStaff.statusCode === 200, `ADMIN can view any staff member's record (HTTP 200)`);
    }

    // Database-backed overview metrics
    console.log(`\n  Testing Database-Backed Overview Metrics (GET /api/overview):`);
    const resOverview = await makeRequest(port, '/api/overview', 'GET', tokens['DOCTOR']);
    assert(resOverview.statusCode === 200, `GET /api/overview succeeds with valid token (HTTP 200)`);
    assert(resOverview.body.success === true, `GET /api/overview returns success: true`);
    assert(typeof resOverview.body.data.totalPatientsToday === 'number', `totalPatientsToday is numeric`);
    assert(resOverview.body.data.erWaitTimeMinutes === 0, `erWaitTimeMinutes is 0 (Outpatient model)`);
    assert(resOverview.body.data.occupiedBeds === 0, `occupiedBeds is 0 (No inpatient beds)`);
    assert(resOverview.body.data.totalBeds === 0, `totalBeds is 0 (No inpatient beds)`);
    assert(resOverview.body.data.occupancyRate === 0, `occupancyRate is 0`);

  } finally {
    server.close();
  }

  console.log(`\n============================================================`);
  console.log(`  VERIFICATION RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log(`============================================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

run().catch((err) => {
  const safeMsg = encodeURIComponent(err instanceof Error ? err.message : String(err));
  console.error('Fatal error executing security verification suite:', safeMsg);
  process.exit(1);
});
