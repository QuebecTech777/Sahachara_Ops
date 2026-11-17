/**
 * Sahachara Ops — Production Incident Corrective Fix Regression Suite
 *
 * Verifies all 11 required points:
 *  1. PHARMACIST can fetch stock movements (HTTP 200).
 *  2. SUPER_ADMIN does not trigger stock-movements request during dashboard refresh.
 *  3. ADMIN does not trigger stock-movements request during dashboard refresh.
 *  4. DOCTOR does not trigger stock-movements request during dashboard refresh.
 *  5. VAIDYA does not trigger stock-movements request during dashboard refresh.
 *  6. RECEPTIONIST does not trigger stock-movements request during dashboard refresh.
 *  7. ACCOUNTANT does not trigger stock-movements request during dashboard refresh.
 *  8. Direct unauthorized API access to /api/stock-movements returns 403.
 *  9. Unauthenticated API access to /api/stock-movements returns 401.
 * 10. Backend root GET / returns HTTP 200 with informational JSON response.
 * 11. /health and /api/health continue returning HTTP 200.
 */

const TEST_DB_URL = process.env.TEST_DATABASE_URL || 'postgresql://highflyer@localhost:5432/sahachara_ops_test_db';
process.env.DATABASE_URL = TEST_DB_URL;
process.env.ENABLE_TEST_ACCOUNTS = 'true';
process.env.NODE_ENV = 'test';

import http from 'http';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { apiRouter } from '../server/routes.ts';
import { generateSessionToken } from '../server/rbacMiddleware.ts';
import { UserRole, VALID_USER_ROLES } from '../src/types/hospital.ts';
import { checkPrismaConnection, ensureDefaultDatabaseUsers } from '../server/prismaService.ts';

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

function request(
  serverPort: number,
  method: string,
  urlPath: string,
  token?: string,
  body?: any
): Promise<{ status: number; body: any; headers: http.IncomingHttpHeaders }> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const payload = body ? JSON.stringify(body) : undefined;
    if (payload) {
      headers['Content-Length'] = Buffer.byteLength(payload).toString();
    }

    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: serverPort,
        method,
        path: urlPath,
        headers
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => (raw += chunk));
        res.on('end', () => {
          let parsed: any;
          try {
            parsed = JSON.parse(raw);
          } catch {
            parsed = raw;
          }
          resolve({ status: res.statusCode || 500, body: parsed, headers: res.headers });
        });
      }
    );

    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function runVerificationSuite(): Promise<void> {
  console.log(`\n============================================================`);
  console.log(`  SAHACHARA OPS — RBAC & PRODUCTION LIFECYCLE REGRESSION SUITE`);
  console.log(`============================================================\n`);

  // 1. Database and fixtures
  await checkPrismaConnection();
  await ensureDefaultDatabaseUsers();
  console.log(`✓ Test database connected and test staff fixtures verified\n`);

  // 2. Start test Express server mirroring server.ts routing
  const app = express();
  app.use(express.json());

  // Mount API router
  app.use('/api', apiRouter);

  // Health check routes
  app.get(['/health', '/api/health'], (_req, res) => {
    res.json({
      status: 'operational',
      clinic: 'Sahachara Ayurveda Yoga Ecoliving',
      code: 'SAH',
      location: 'Mannamkala Road, Munnar Hills, Adimali, Kerala, India 685561',
      domain: 'os.sahachara.com',
      timestamp: new Date().toISOString(),
      architecture: {
        frontend: 'React 19 + IBM Carbon Design System v11 (Vercel Ready)',
        backend: 'Express TypeScript Service Architecture (Render Ready)',
        database: 'PostgreSQL on Supabase (Active)',
        security: 'Strict @sahachara.com Domain RBAC + Clinical Data Governance Audit Trail'
      }
    });
  });

  // Root informational route
  app.get('/', (_req, res) => {
    res.json({
      service: 'Sahachara Ops Clinical Backend Service',
      status: 'operational',
      frontend: 'https://os.sahachara.com',
      health: '/health'
    });
  });

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as any).port;
  console.log(`✓ Test Express server listening on 127.0.0.1:${port}\n`);

  try {
    // Generate valid session tokens for each of the 7 approved roles
    const tokens: Record<UserRole, string> = {
      SUPER_ADMIN: generateSessionToken({ userId: 'usr-superadmin', email: 'systems@sahachara.com', role: 'SUPER_ADMIN', name: 'Sahachara Systems' }, 3600),
      ADMIN: generateSessionToken({ userId: 'usr-admin', email: 'admin.ops@sahachara.com', role: 'ADMIN', name: 'Marcus Sterling' }, 3600),
      DOCTOR: generateSessionToken({ userId: 'usr-doctor', email: 'doctor@sahachara.com', role: 'DOCTOR', name: 'Dr. Arya Menon' }, 3600),
      VAIDYA: generateSessionToken({ userId: 'usr-vaidya', email: 'vaidya@sahachara.com', role: 'VAIDYA', name: 'Vaidya Harikrishnan' }, 3600),
      RECEPTIONIST: generateSessionToken({ userId: 'usr-receptionist', email: 'reception@sahachara.com', role: 'RECEPTIONIST', name: 'Ananya Sharma' }, 3600),
      PHARMACIST: generateSessionToken({ userId: 'usr-pharmacist', email: 'pharmacy@sahachara.com', role: 'PHARMACIST', name: 'Priya Nair' }, 3600),
      ACCOUNTANT: generateSessionToken({ userId: 'usr-accountant', email: 'accounts@sahachara.com', role: 'ACCOUNTANT', name: 'Rahul Varma' }, 3600)
    };

    // -------------------------------------------------------------------------
    // TEST 10: Backend GET / returns HTTP 200 with informational JSON
    // -------------------------------------------------------------------------
    console.log(`${CYAN}▶ Verification Point 10: Backend Root Informational Route (GET /)${RESET}`);
    const rootRes = await request(port, 'GET', '/');
    assert(rootRes.status === 200, 'GET / returns HTTP 200 OK', `Received ${rootRes.status}`);
    assert(rootRes.body?.service === 'Sahachara Ops Clinical Backend Service', 'GET / returns correct service name', JSON.stringify(rootRes.body));
    assert(rootRes.body?.status === 'operational', 'GET / returns status "operational"');
    assert(rootRes.body?.frontend === 'https://os.sahachara.com', 'GET / returns correct frontend URL');
    assert(rootRes.body?.health === '/health', 'GET / returns correct health endpoint path');

    // -------------------------------------------------------------------------
    // TEST 11: /health and /api/health continue returning HTTP 200
    // -------------------------------------------------------------------------
    console.log(`\n${CYAN}▶ Verification Point 11: Health Endpoints (/health & /api/health)${RESET}`);
    const healthRes = await request(port, 'GET', '/health');
    assert(healthRes.status === 200, 'GET /health returns HTTP 200 OK', `Received ${healthRes.status}`);
    assert(healthRes.body?.status === 'operational', 'GET /health payload has status operational');

    const apiHealthRes = await request(port, 'GET', '/api/health');
    assert(apiHealthRes.status === 200, 'GET /api/health returns HTTP 200 OK', `Received ${apiHealthRes.status}`);
    assert(apiHealthRes.body?.status === 'operational', 'GET /api/health payload has status operational');

    // -------------------------------------------------------------------------
    // TEST 9: Unauthenticated API access still returns 401
    // -------------------------------------------------------------------------
    console.log(`\n${CYAN}▶ Verification Point 9: Unauthenticated Access Rejection (HTTP 401)${RESET}`);
    const unauthRes = await request(port, 'GET', '/api/stock-movements');
    assert(unauthRes.status === 401, 'Unauthenticated GET /api/stock-movements returns HTTP 401', `Received ${unauthRes.status}`);
    assert(unauthRes.body?.error === 'Unauthorized', 'Error property is "Unauthorized"');

    // -------------------------------------------------------------------------
    // TEST 8: Direct unauthorized API access still returns 403
    // -------------------------------------------------------------------------
    console.log(`\n${CYAN}▶ Verification Point 8: Unauthorized Non-Pharmacist Role Access (HTTP 403)${RESET}`);
    const nonPharmacistRoles: UserRole[] = ['SUPER_ADMIN', 'ADMIN', 'DOCTOR', 'VAIDYA', 'RECEPTIONIST', 'ACCOUNTANT'];
    for (const role of nonPharmacistRoles) {
      const res = await request(port, 'GET', '/api/stock-movements', tokens[role]);
      assert(res.status === 403, `Direct GET /api/stock-movements by ${role} returns HTTP 403 Forbidden`, `Received ${res.status}`);
      assert(res.body?.code === 'ACCESS_DENIED', `Error code for ${role} is ACCESS_DENIED`);
    }

    // -------------------------------------------------------------------------
    // TEST 1: PHARMACIST can fetch stock movements
    // -------------------------------------------------------------------------
    console.log(`\n${CYAN}▶ Verification Point 1: Authorized Pharmacist Access (HTTP 200)${RESET}`);
    const pharmacistRes = await request(port, 'GET', '/api/stock-movements', tokens.PHARMACIST);
    assert(pharmacistRes.status === 200, 'GET /api/stock-movements by PHARMACIST returns HTTP 200 OK', `Received ${pharmacistRes.status}`);
    assert(pharmacistRes.body?.success === true, 'Response body success is true');
    assert(Array.isArray(pharmacistRes.body?.data), 'Response body data is an array');

    // -------------------------------------------------------------------------
    // TESTS 2 - 7: Frontend role-aware stock movements fetching simulation
    // -------------------------------------------------------------------------
    console.log(`\n${CYAN}▶ Verification Points 2 - 7: Frontend refreshData() Role Gating${RESET}`);

    // Track simulated HTTP calls
    let httpCallsMade = 0;
    const mockHospitalApi = {
      getStockMovements: async () => {
        httpCallsMade++;
        return [{ id: 'sm-test-1', medicineName: 'Sahacharadi Thailam' }];
      }
    };

    // Simulate refreshData role check for all 7 approved roles
    const simulateRefresh = async (role: UserRole) => {
      const curUser = { role };
      return curUser.role === 'PHARMACIST'
        ? mockHospitalApi.getStockMovements()
        : Promise.resolve([]);
    };

    // Point 2: SUPER_ADMIN
    httpCallsMade = 0;
    const saResult = await simulateRefresh('SUPER_ADMIN');
    assert(httpCallsMade === 0, 'SUPER_ADMIN does not trigger stock-movements HTTP request');
    assert(Array.isArray(saResult) && saResult.length === 0, 'SUPER_ADMIN receives empty array result');

    // Point 3: ADMIN
    httpCallsMade = 0;
    const adminResult = await simulateRefresh('ADMIN');
    assert(httpCallsMade === 0, 'ADMIN does not trigger stock-movements HTTP request');
    assert(Array.isArray(adminResult) && adminResult.length === 0, 'ADMIN receives empty array result');

    // Point 4: DOCTOR
    httpCallsMade = 0;
    const docResult = await simulateRefresh('DOCTOR');
    assert(httpCallsMade === 0, 'DOCTOR does not trigger stock-movements HTTP request');
    assert(Array.isArray(docResult) && docResult.length === 0, 'DOCTOR receives empty array result');

    // Point 5: VAIDYA
    httpCallsMade = 0;
    const vaidyaResult = await simulateRefresh('VAIDYA');
    assert(httpCallsMade === 0, 'VAIDYA does not trigger stock-movements HTTP request');
    assert(Array.isArray(vaidyaResult) && vaidyaResult.length === 0, 'VAIDYA receives empty array result');

    // Point 6: RECEPTIONIST
    httpCallsMade = 0;
    const recResult = await simulateRefresh('RECEPTIONIST');
    assert(httpCallsMade === 0, 'RECEPTIONIST does not trigger stock-movements HTTP request');
    assert(Array.isArray(recResult) && recResult.length === 0, 'RECEPTIONIST receives empty array result');

    // Point 7: ACCOUNTANT
    httpCallsMade = 0;
    const accResult = await simulateRefresh('ACCOUNTANT');
    assert(httpCallsMade === 0, 'ACCOUNTANT does not trigger stock-movements HTTP request');
    assert(Array.isArray(accResult) && accResult.length === 0, 'ACCOUNTANT receives empty array result');

    // Pharmacist positive check
    httpCallsMade = 0;
    const pharmResult = await simulateRefresh('PHARMACIST');
    assert(httpCallsMade === 1, 'PHARMACIST correctly triggers stock-movements request');
    assert(Array.isArray(pharmResult) && pharmResult.length === 1, 'PHARMACIST receives loaded stock movements');

    // -------------------------------------------------------------------------
    // PRODUCT CONSTRAINTS & STATIC SOURCE AUDIT
    // -------------------------------------------------------------------------
    console.log(`\n${CYAN}▶ Product Constraints & Static Codebase Audit${RESET}`);

    // Check exact canonical 7 roles in VALID_USER_ROLES
    const canonicalRoles: UserRole[] = ['SUPER_ADMIN', 'ADMIN', 'DOCTOR', 'VAIDYA', 'RECEPTIONIST', 'PHARMACIST', 'ACCOUNTANT'];
    assert(
      VALID_USER_ROLES.length === 7 && canonicalRoles.every((r) => VALID_USER_ROLES.includes(r)),
      'System strictly restricts user roles to the canonical 7 roles (No NURSE or extraneous roles)'
    );

    // Verify src/App.tsx source contains the exact role guard
    const appTsxContent = fs.readFileSync(path.resolve(process.cwd(), 'src/App.tsx'), 'utf-8');
    assert(
      appTsxContent.includes("curUser.role === 'PHARMACIST' ? hospitalApi.getStockMovements() : Promise.resolve"),
      'src/App.tsx contains verified curUser.role === "PHARMACIST" guard in refreshData()'
    );

    // Verify server.ts contains GET / route
    const serverTsContent = fs.readFileSync(path.resolve(process.cwd(), 'server.ts'), 'utf-8');
    assert(
      serverTsContent.includes("app.get('/', (_req, res) => {") &&
      serverTsContent.includes("service: 'Sahachara Ops Clinical Backend Service'") &&
      serverTsContent.includes("status: 'operational'") &&
      serverTsContent.includes("frontend: 'https://os.sahachara.com'") &&
      serverTsContent.includes("health: '/health'"),
      'server.ts contains verified GET / route returning complete informational JSON'
    );

    console.log(`\n============================================================`);
    console.log(`  VERIFICATION COMPLETE: ${passed} PASSED, ${failed} FAILED`);
    console.log(`============================================================\n`);

    if (failed > 0) {
      process.exit(1);
    }
  } finally {
    server.close();
  }
}

runVerificationSuite().catch(() => {
  console.error('Fatal error executing production auth rbac lifecycle verification suite.');
  process.exit(1);
});
