/**
 * SAHACHARA OPS — CODEQL PHASE 1 REGRESSION TEST SUITE
 *
 * Target Alert Remediations:
 * 1. Alert #29: User-controlled bypass of security check in server/rbacMiddleware.ts
 * 2. Alert #27: Remote property injection in dbSearchPatients() (server/prismaService.ts)
 * 3. Alert #28: Remote property injection in dbGetAppointments() (server/prismaService.ts)
 */

import express, { Request, Response } from 'express';
import http from 'http';
import crypto from 'crypto';

// Isolation Guard
const TEST_DB_URL = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL || 'postgresql://highflyer@localhost:5432/sahachara_ops_test_db';
process.env.DATABASE_URL = TEST_DB_URL;
process.env.NODE_ENV = 'test';
process.env.ENABLE_TEST_ACCOUNTS = 'true';

import { apiRouter } from '../server/routes.ts';
import {
  prisma,
  checkPrismaConnection,
  ensureDefaultDatabaseUsers,
  dbSearchPatients,
  dbGetAppointments,
  dbCreateInvoice,
  resolvePatientSortOrder,
  resolveAppointmentSortOrder,
  ALLOWED_PATIENT_SORT_KEYS,
  ALLOWED_APPOINTMENT_SORT_KEYS
} from '../server/prismaService.ts';
import {
  generateSessionToken,
  extractAndValidateAuthorization,
  TokenPayload
} from '../server/rbacMiddleware.ts';
import rateLimit from 'express-rate-limit';
import {
  spaFallbackLimiter,
  apiGlobalLimiter,
  authLoginLimiter,
  therapyAuthReadLimiter,
  therapyAuthMutateLimiter
} from '../server/rateLimiter.ts';

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const CYAN = '\x1b[36m';
const YELLOW = '\x1b[33m';
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
    console.error(`  ${RED}✗ FAIL${RESET} ${desc}`);
    if (details) console.error(`    ${RED}${details}${RESET}`);
  }
}

function makeHttpRequest(
  port: number,
  path: string,
  method: string = 'GET',
  headers: Record<string, string | string[]> = {},
  body?: any
): Promise<{ status: number; body: any; headers: http.IncomingHttpHeaders }> {
  return new Promise((resolve, reject) => {
    const postData = body ? JSON.stringify(body) : '';
    const reqHeaders: Record<string, string | string[]> = { ...headers };
    if (body) {
      reqHeaders['Content-Type'] = 'application/json';
      reqHeaders['Content-Length'] = String(Buffer.byteLength(postData));
    }

    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path,
        method,
        headers: reqHeaders
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
            status: res.statusCode || 0,
            body: parsed,
            headers: res.headers
          });
        });
      }
    );

    req.on('error', (err) => reject(err));
    if (body) req.write(postData);
    req.end();
  });
}

async function runPhase1RegressionSuite() {
  console.log(`\n${BOLD}${CYAN}========================================================================${RESET}`);
  console.log(`${BOLD}   SAHACHARA OPS — CODEQL PHASE 1 REGRESSION TEST SUITE                 ${RESET}`);
  console.log(`${BOLD}   Authentication Boundaries (Alert #29) & Prisma Sorting (Alerts #27,#28)${RESET}`);
  console.log(`${BOLD}${CYAN}========================================================================${RESET}\n`);

  const isConnected = await checkPrismaConnection();
  if (!isConnected) {
    console.error('FATAL: Test database not connected.');
    process.exit(1);
  }
  await ensureDefaultDatabaseUsers();

  // Spin up isolated test server
  const app = express();
  app.use(express.json());
  app.get('/health', (_req: Request, res: Response) => res.json({ status: 'ok' }));
  app.use('/api', apiRouter);

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as any).port;

  try {
    // =========================================================================
    // SECTION 1: ALERT #29 — AUTHORIZATION BOUNDARY & CREDENTIAL VALIDATION
    // =========================================================================
    console.log(`${BOLD}${YELLOW}SECTION 1: Alert #29 — Authorization Header Validation & Fail-Closed Guard${RESET}`);

    // 1.1 Header Extraction Unit Tests
    const noneCreds1 = extractAndValidateAuthorization(undefined);
    assert(noneCreds1.type === 'none' && !noneCreds1.error, 'Omitted Authorization header yields type: "none"');

    const noneCreds2 = extractAndValidateAuthorization('');
    assert(noneCreds2.type === 'none' && !noneCreds2.error, 'Empty Authorization header yields type: "none"');

    const ambiguousCreds = extractAndValidateAuthorization(['Bearer token1', 'Bearer token2']);
    assert(
      ambiguousCreds.error?.code === 'AMBIGUOUS_CREDENTIALS',
      'Multiple Authorization headers fail closed with AMBIGUOUS_CREDENTIALS'
    );

    const nonStringCreds = extractAndValidateAuthorization(12345 as any);
    assert(
      nonStringCreds.error?.code === 'MALFORMED_AUTHORIZATION_HEADER',
      'Non-string Authorization header fails closed with MALFORMED_AUTHORIZATION_HEADER'
    );

    const basicCreds = extractAndValidateAuthorization('Basic dXNlcjpwYXNz');
    assert(
      basicCreds.error?.code === 'MALFORMED_AUTHORIZATION_HEADER',
      'Basic scheme Authorization header fails closed with MALFORMED_AUTHORIZATION_HEADER'
    );

    const emptyBearerCreds = extractAndValidateAuthorization('Bearer   ');
    assert(
      emptyBearerCreds.error?.code === 'MALFORMED_AUTHORIZATION_HEADER',
      'Empty Bearer token fails closed with MALFORMED_AUTHORIZATION_HEADER'
    );

    const malformedSahaCreds = extractAndValidateAuthorization('Bearer sah_not_valid_structure');
    assert(
      malformedSahaCreds.error?.code === 'MALFORMED_TOKEN',
      'Malformed native sah_ token fails closed with MALFORMED_TOKEN'
    );

    const malformedJwtCreds = extractAndValidateAuthorization('Bearer not.a.jwt');
    assert(
      malformedJwtCreds.error?.code === 'MALFORMED_TOKEN',
      'Malformed JWT token fails closed with MALFORMED_TOKEN'
    );

    // 1.2 HTTP Endpoint Integration Tests
    // Public routes without header succeed
    const healthRes = await makeHttpRequest(port, '/health');
    assert(healthRes.status === 200, 'Public /health succeeds without Authorization header (HTTP 200)');

    const clinicInfoRes = await makeHttpRequest(port, '/api/clinic/info');
    assert(clinicInfoRes.status === 200, 'Public /api/clinic/info succeeds without Authorization header (HTTP 200)');

    // Protected route without header fails with 401
    const protectedNoAuth = await makeHttpRequest(port, '/api/overview');
    assert(protectedNoAuth.status === 401, 'Protected /api/overview rejects missing token with HTTP 401');

    // Protected route with Basic auth header fails closed with 401
    const basicRes = await makeHttpRequest(port, '/api/overview', 'GET', {
      Authorization: 'Basic dXNlcjpwYXNz'
    });
    assert(basicRes.status === 401, 'Protected /api/overview rejects Basic scheme with HTTP 401');
    assert(basicRes.body.code === 'MALFORMED_AUTHORIZATION_HEADER', 'Error code is MALFORMED_AUTHORIZATION_HEADER');

    // Protected route with empty Bearer fails closed with 401
    const emptyBearerRes = await makeHttpRequest(port, '/api/overview', 'GET', {
      Authorization: 'Bearer   '
    });
    assert(emptyBearerRes.status === 401, 'Protected /api/overview rejects empty Bearer with HTTP 401');

    // Protected route with multiple Authorization headers fails closed with 401
    const multiAuthRes = await makeHttpRequest(port, '/api/overview', 'GET', {
      Authorization: ['Bearer token1', 'Bearer token2']
    });
    assert(multiAuthRes.status === 401, 'Protected /api/overview rejects multiple Authorization headers with HTTP 401');
    assert(multiAuthRes.body.code === 'AMBIGUOUS_CREDENTIALS', 'Error code is AMBIGUOUS_CREDENTIALS');

    // Protected route with malformed sah_ token fails closed with 401
    const malformedSahaRes = await makeHttpRequest(port, '/api/overview', 'GET', {
      Authorization: 'Bearer sah_corrupted_payload'
    });
    assert(malformedSahaRes.status === 401, 'Protected /api/overview rejects malformed sah_ token with HTTP 401');
    assert(malformedSahaRes.body.code === 'MALFORMED_TOKEN', 'Error code is MALFORMED_TOKEN');

    // Protected route with forged HMAC signature fails closed with 401
    const validAdminPayload: TokenPayload = {
      userId: 'usr-admin',
      role: 'ADMIN',
      email: 'admin.ops@sahachara.com',
      name: 'Operations Administrator',
      exp: Math.floor(Date.now() / 1000) + 3600
    };
    const b64Payload = Buffer.from(JSON.stringify(validAdminPayload)).toString('base64url');
    const forgedSig = crypto.createHmac('sha256', 'wrong-secret-key-attacker').update(b64Payload).digest('base64url');
    const forgedToken = `sah_${b64Payload}.${forgedSig}`;

    const forgedRes = await makeHttpRequest(port, '/api/overview', 'GET', {
      Authorization: `Bearer ${forgedToken}`
    });
    assert(forgedRes.status === 401, 'Protected /api/overview rejects forged HMAC signature with HTTP 401');
    assert(forgedRes.body.code === 'INVALID_TOKEN', 'Error code is INVALID_TOKEN');

    // Protected route with expired token fails closed with 401
    const expiredToken = generateSessionToken(validAdminPayload, -3600);
    const expiredRes = await makeHttpRequest(port, '/api/overview', 'GET', {
      Authorization: `Bearer ${expiredToken}`
    });
    assert(expiredRes.status === 401, 'Protected /api/overview rejects expired token with HTTP 401');

    // Protected route with invalid role in token fails closed with 401
    const invalidRolePayload = { ...validAdminPayload, role: 'SUPER_HACKER' as any };
    const invalidRoleToken = generateSessionToken(invalidRolePayload);
    const invalidRoleRes = await makeHttpRequest(port, '/api/overview', 'GET', {
      Authorization: `Bearer ${invalidRoleToken}`
    });
    assert(invalidRoleRes.status === 401, 'Protected /api/overview rejects invalid role with HTTP 401');

    // Legitimate valid native token succeeds with 200 OK
    const genuineAdminToken = generateSessionToken(validAdminPayload);
    const genuineRes = await makeHttpRequest(port, '/api/overview', 'GET', {
      Authorization: `Bearer ${genuineAdminToken}`
    });
    assert(genuineRes.status === 200, 'Protected /api/overview succeeds with valid legitimate Bearer token (HTTP 200)');
    assert(genuineRes.body.success === true, 'Response body has success: true');

    // Role-based authorization boundary remains strictly enforced (ADMIN cannot configure tariffs)
    const tariffMutationRes = await makeHttpRequest(port, '/api/tariffs', 'POST', {
      Authorization: `Bearer ${genuineAdminToken}`
    }, {
      serviceCode: 'TEST-SRV-999',
      serviceName: 'Unauthorized Tariff Test',
      category: 'Treatment',
      rate: 500
    });
    assert(tariffMutationRes.status === 403, 'ADMIN is forbidden from configuring tariffs (HTTP 403 Forbidden)');

    // =========================================================================
    // SECTION 2: ALERTS #27 & #28 — PRISMA SORTING ALLOWLISTS & PROPERTY INJECTION DEFENSE
    // =========================================================================
    console.log(`\n${BOLD}${YELLOW}SECTION 2: Alerts #27 & #28 — Prisma Sorting Allowlists & Type-Safe Resolvers${RESET}`);

    // 2.1 Patient Sort Order Resolver Unit Tests
    for (const key of ALLOWED_PATIENT_SORT_KEYS) {
      const ascOrder = resolvePatientSortOrder(key, 'asc');
      assert((ascOrder as any)[key] === 'asc', `resolvePatientSortOrder maps "${key}" with 'asc' correctly`);

      const descOrder = resolvePatientSortOrder(key, 'desc');
      assert((descOrder as any)[key] === 'desc', `resolvePatientSortOrder maps "${key}" with 'desc' correctly`);
    }

    // Disallowed / injected keys must default safely to createdAt
    const disallowedPatientKeys = ['__proto__', 'constructor', 'invoices', 'appointments', 'password', 'deletedAt', 'fooBar'];
    for (const badKey of disallowedPatientKeys) {
      const resolved = resolvePatientSortOrder(badKey, 'asc');
      const hasBadKey = Object.prototype.hasOwnProperty.call(resolved, badKey);
      assert(
        (resolved as any).createdAt === 'asc' && !hasBadKey,
        `Disallowed patient sort key "${badKey}" safely defaults to { createdAt: 'asc' } with zero injected property`
      );
    }

    // Direction validation independence
    const invalidDirs = ['DROP_TABLE', '123', 'SELECT', '', undefined, 'DESCENDING', null as any];
    for (const badDir of invalidDirs) {
      const resolved = resolvePatientSortOrder('firstName', badDir);
      assert((resolved as any).firstName === 'desc', `Invalid sort direction "${badDir}" safely defaults to 'desc'`);
    }

    // 2.2 Appointment Sort Order Resolver Unit Tests
    for (const key of ALLOWED_APPOINTMENT_SORT_KEYS) {
      const ascOrder = resolveAppointmentSortOrder(key, 'asc');
      assert((ascOrder as any)[key] === 'asc', `resolveAppointmentSortOrder maps "${key}" with 'asc' correctly`);
    }

    const disallowedApptKeys = ['__proto__', 'constructor', 'patient.phone', 'patient', 'billingInvoiceId', 'hack'];
    for (const badKey of disallowedApptKeys) {
      const resolved = resolveAppointmentSortOrder(badKey, 'asc');
      const hasBadKey = Object.prototype.hasOwnProperty.call(resolved, badKey);
      assert(
        (resolved as any).dateTime === 'asc' && !hasBadKey,
        `Disallowed appointment sort key "${badKey}" safely defaults to { dateTime: 'asc' } with zero injected property`
      );
    }

    // 2.3 Database Integration Tests: dbSearchPatients
    // Seed 2 deterministic test patients
    const patientA = await prisma.patient.upsert({
      where: { mrn: 'SAH-P1-0001' },
      update: { firstName: 'Aaron', lastName: 'Aaditya', status: 'ACTIVE', deletedAt: null },
      create: {
        mrn: 'SAH-P1-0001',
        firstName: 'Aaron',
        lastName: 'Aaditya',
        dob: '1990-01-01',
        gender: 'Male',
        phone: '+91 99999 00001',
        status: 'ACTIVE',
        admissionStatus: 'Outpatient'
      }
    });

    const patientZ = await prisma.patient.upsert({
      where: { mrn: 'SAH-P1-0002' },
      update: { firstName: 'Zoya', lastName: 'Zachariah', status: 'ACTIVE', deletedAt: null },
      create: {
        mrn: 'SAH-P1-0002',
        firstName: 'Zoya',
        lastName: 'Zachariah',
        dob: '1995-05-05',
        gender: 'Female',
        phone: '+91 99999 00002',
        status: 'ACTIVE',
        admissionStatus: 'Outpatient'
      }
    });

    // Valid sorting by firstName asc
    const patientsAsc = await dbSearchPatients({
      sortBy: 'firstName',
      sortOrder: 'asc',
      limit: 50
    });
    const aaronIdxAsc = patientsAsc.patients.findIndex(p => p.mrn === patientA.mrn);
    const zoyaIdxAsc = patientsAsc.patients.findIndex(p => p.mrn === patientZ.mrn);
    assert(aaronIdxAsc !== -1 && zoyaIdxAsc !== -1 && aaronIdxAsc < zoyaIdxAsc, 'dbSearchPatients: Valid sorting by firstName asc orders Aaron before Zoya');

    // Valid sorting by firstName desc
    const patientsDesc = await dbSearchPatients({
      sortBy: 'firstName',
      sortOrder: 'desc',
      limit: 50
    });
    const aaronIdxDesc = patientsDesc.patients.findIndex(p => p.mrn === patientA.mrn);
    const zoyaIdxDesc = patientsDesc.patients.findIndex(p => p.mrn === patientZ.mrn);
    assert(aaronIdxDesc !== -1 && zoyaIdxDesc !== -1 && zoyaIdxDesc < aaronIdxDesc, 'dbSearchPatients: Valid sorting by firstName desc orders Zoya before Aaron');

    // Attempted injection with disallowed key '__proto__' must run safely without throwing
    const injectionAttempt1 = await dbSearchPatients({
      sortBy: '__proto__',
      sortOrder: 'asc'
    });
    assert(Array.isArray(injectionAttempt1.patients), 'dbSearchPatients: Disallowed key "__proto__" runs safely and returns patient list');

    // Attempted relation traversal injection 'invoices' must run safely without throwing
    const injectionAttempt2 = await dbSearchPatients({
      sortBy: 'invoices',
      sortOrder: 'desc'
    });
    assert(Array.isArray(injectionAttempt2.patients), 'dbSearchPatients: Disallowed relation key "invoices" runs safely and returns patient list');

    // Pagination test: page and limit calculation
    const page1 = await dbSearchPatients({ page: 1, limit: 1 });
    const page2 = await dbSearchPatients({ page: 2, limit: 1 });
    assert(page1.patients.length === 1, 'dbSearchPatients: Page 1 with limit 1 returns exactly 1 record');
    assert(page2.patients.length === 1, 'dbSearchPatients: Page 2 with limit 1 returns exactly 1 record');
    assert(page1.patients[0].id !== page2.patients[0].id, 'dbSearchPatients: Page 1 and Page 2 records are distinct');

    // 2.4 Database Integration Tests: dbGetAppointments
    const apptResult = await dbGetAppointments({
      sortBy: 'appointmentNumber',
      sortOrder: 'asc',
      limit: 10
    });
    assert(Array.isArray(apptResult.appointments), 'dbGetAppointments: Valid sorting by appointmentNumber asc returns appointments array');

    // Disallowed key on appointments
    const badApptSort = await dbGetAppointments({
      sortBy: 'invoices.amount',
      sortOrder: 'desc',
      limit: 10
    });
    assert(Array.isArray(badApptSort.appointments), 'dbGetAppointments: Disallowed sort key "invoices.amount" runs safely without throwing');

    // =========================================================================
    // SECTION 3: RATE LIMITING & SECURITY HARDENING (ALERTS #21-#26, #1)
    // =========================================================================
    console.log(`\n${BOLD}${YELLOW}SECTION 3: Rate Limiting & High-Severity Remediations (Alerts #21-#26, #1)${RESET}`);

    // 3.1 Rate Limiters Configuration & Export Validation
    assert(typeof spaFallbackLimiter === 'function', 'spaFallbackLimiter is a valid Express middleware');
    assert(typeof apiGlobalLimiter === 'function', 'apiGlobalLimiter is a valid Express middleware');
    assert(typeof authLoginLimiter === 'function', 'authLoginLimiter is a valid Express middleware');
    assert(typeof therapyAuthReadLimiter === 'function', 'therapyAuthReadLimiter is a valid Express middleware');
    assert(typeof therapyAuthMutateLimiter === 'function', 'therapyAuthMutateLimiter is a valid Express middleware');

    // 3.2 Ephemeral Rate Limiting Enforcement Test
    const rateLimitApp = express();
    const testLimiter = rateLimit({
      windowMs: 60 * 1000,
      max: 3,
      standardHeaders: true,
      legacyHeaders: false,
      handler: (_req, res) => res.status(429).json({ success: false, code: 'RATE_LIMIT_EXCEEDED' })
    });
    rateLimitApp.post('/test-limit', testLimiter, (_req, res) => res.json({ ok: true }));
    const rateLimitServer = http.createServer(rateLimitApp);
    await new Promise<void>((resolve) => rateLimitServer.listen(0, resolve));
    const rateLimitPort = (rateLimitServer.address() as any).port;

    try {
      const r1 = await makeHttpRequest(rateLimitPort, '/test-limit', 'POST');
      const r2 = await makeHttpRequest(rateLimitPort, '/test-limit', 'POST');
      const r3 = await makeHttpRequest(rateLimitPort, '/test-limit', 'POST');
      const r4 = await makeHttpRequest(rateLimitPort, '/test-limit', 'POST');

      assert(r1.status === 200, 'Rate limit test: Request 1 allowed (HTTP 200)');
      assert(r2.status === 200, 'Rate limit test: Request 2 allowed (HTTP 200)');
      assert(r3.status === 200, 'Rate limit test: Request 3 allowed (HTTP 200)');
      assert(r4.status === 429, 'Rate limit test: Request 4 rejected with HTTP 429 Too Many Requests');
      assert(r4.body.code === 'RATE_LIMIT_EXCEEDED', 'Rate limit error code is RATE_LIMIT_EXCEEDED');
    } finally {
      await new Promise<void>((resolve) => rateLimitServer.close(() => resolve()));
    }

    // SECTION 4: Task 2 — Invoice Identifier 16-Byte Cryptographic Entropy (Alert #20)
    console.log(`\n${BOLD}SECTION 4: Invoice Identifier Entropy & Collision Resistance (Alert #20)${RESET}`);
    const testInv = await dbCreateInvoice({
      patientName: 'Regression Test Patient',
      mrn: 'SAH-P1-0001',
      items: [
        {
          id: 'item-1',
          name: 'General Consultation',
          description: 'Initial Clinical Examination',
          category: 'Consultation',
          type: 'service',
          quantity: 1,
          unitPrice: 500,
          total: 500,
          totalPrice: 500,
          status: 'pending'
        } as any
      ],
      totalAmount: 500
    }, { id: 'admin-1', name: 'Admin', role: 'ADMIN' });

    assert(Boolean(testInv && typeof testInv.id === 'string'), 'dbCreateInvoice returns created invoice with id');
    const idRegex = /^inv-\d+-[0-9a-f]{32}$/;
    assert(idRegex.test(testInv.id), `Generated invoice id contains 16 cryptographically random bytes (32 hex characters)`);
    assert(Boolean(testInv.invoiceNumber && /^INV-\d{4}-\d{5}$/.test(testInv.invoiceNumber)), `PostgreSQL sequence invoiceNumber is preserved`);
    assert(Number(testInv.totalAmount) === 500, 'Invoice monetary total is preserved (500)');

    // Clean up created invoice
    await prisma.invoice.delete({ where: { id: testInv.id } });

    // SECTION 5: Log Injection Sanitization & Terminal Safety (Alerts #175-#177)
    console.log(`\n${BOLD}SECTION 5: Log Injection Sanitization & Terminal Safety (Alerts #175-#177)${RESET}`);
    const crlfSample = 'Test error\r\nFORGED LOG ENTRY';
    const sanitizedCrlf = sanitizeTerminalError(crlfSample);
    assert(!sanitizedCrlf.includes('\r'), 'sanitizeTerminalError removes carriage return (\\r)');
    assert(!sanitizedCrlf.includes('\n'), 'sanitizeTerminalError removes newline (\\n)');
    assert(sanitizedCrlf === 'Test error  FORGED LOG ENTRY', 'sanitizeTerminalError replaces CRLF with space safely');

    const escapeSeqSample = 'Normal message\x1b[31;1mCRITICAL INJECTION\x1b[0m\x00\x08';
    const sanitizedEscape = sanitizeTerminalError(escapeSeqSample);
    assert(!sanitizedEscape.includes('\x1b'), 'sanitizeTerminalError strips ANSI escape control character (\\x1b)');
    assert(!sanitizedEscape.includes('\x00'), 'sanitizeTerminalError strips null byte (\\x00)');
    assert(!sanitizedEscape.includes('\x08'), 'sanitizeTerminalError strips backspace (\\x08)');
    assert(sanitizedEscape === 'Normal message[31;1mCRITICAL INJECTION[0m', 'sanitizeTerminalError neutralizes terminal escape sequences');

    const errorObjSample = new Error('Database connection failed\r\nFake status: 200');
    const sanitizedErrorObj = sanitizeTerminalError(errorObjSample);
    assert(!sanitizedErrorObj.includes('\r') && !sanitizedErrorObj.includes('\n'), 'Error object sanitization eliminates CRLF');
    assert(sanitizedErrorObj.startsWith('Error: Database connection failed'), 'Error object preserves diagnostic error name and message');

    // Cleanup seeded regression test patients
    await prisma.patient.deleteMany({
      where: { mrn: { in: ['SAH-P1-0001', 'SAH-P1-0002'] } }
    });

  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await prisma.$disconnect();
  }

  // Summary Report
  console.log(`\n${BOLD}${CYAN}========================================================================${RESET}`);
  console.log(`${BOLD}   PHASE 1 REGRESSION TEST SUMMARY                                      ${RESET}`);
  console.log(`${BOLD}${CYAN}========================================================================${RESET}`);
  console.log(`Total Assertions Evaluated : ${passed + failed}`);
  console.log(`Assertions Passed          : ${GREEN}${passed}${RESET}`);
  console.log(`Assertions Failed          : ${failed > 0 ? RED + failed : GREEN + '0'}${RESET}`);
  console.log(`${BOLD}${CYAN}========================================================================${RESET}\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

export function sanitizeTerminalError(err: unknown): string {
  const raw = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  return raw.replace(/\r|\n/g, ' ').replace(/[\x00-\x1f\x7f-\x9f]/g, '');
}

runPhase1RegressionSuite().catch((err) => {
  const safeMsg = sanitizeTerminalError(err);
  console.error('\nFatal error in Phase 1 regression suite:', safeMsg);
  process.exit(1);
});
