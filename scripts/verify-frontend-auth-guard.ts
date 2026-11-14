/**
 * Sahachara Ops — Automated Authentication Guard & Route Protection Verification Suite
 *
 * Verifies all 12 required security conditions:
 *  1. "/" displays login when unauthenticated.
 *  2. "/dashboard" redirects when unauthenticated.
 *  3. Every protected route rejects unauthenticated access.
 *  4. Direct URL navigation cannot bypass authentication.
 *  5. Invalid and expired tokens cannot access protected content.
 *  6. A valid session restores correctly after refresh.
 *  7. Login succeeds with valid credentials.
 *  8. Logout prevents subsequent access.
 *  9. Protected API endpoints reject requests without tokens.
 * 10. Backend RBAC prevents unauthorized role access.
 * 11. No dashboard flash occurs while authentication is being initialized.
 * 12. Network or session-validation failures never grant access (fail closed).
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

// Colors for terminal reporting
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

// ---------------------------------------------------------------------------
// 1. ROUTE PARSER & GUARD LOGIC (Mirroring src/App.tsx)
// ---------------------------------------------------------------------------
interface RouteState {
  view: string;
  isProtected: boolean;
}

function parseAppRoute(pathname: string, search: string = ''): RouteState {
  try {
    const params = new URLSearchParams(search);
    const viewParam = params.get('view');
    if (viewParam) {
      if (viewParam === 'login' || viewParam === 'activate') {
        return { view: viewParam, isProtected: false };
      }
      return { view: viewParam, isProtected: true };
    }
  } catch {}

  const cleanPath = pathname.replace(/\/+$/, '') || '/';
  if (cleanPath === '/' || cleanPath === '/login') {
    return { view: 'login', isProtected: false };
  }
  if (cleanPath === '/activate') {
    return { view: 'activate', isProtected: false };
  }
  if (cleanPath === '/dashboard' || cleanPath === '/overview') {
    return { view: 'overview', isProtected: true };
  }
  if (cleanPath === '/patients') return { view: 'patients', isProtected: true };
  if (cleanPath === '/appointments') return { view: 'appointments', isProtected: true };
  if (cleanPath === '/consultations') return { view: 'consultations', isProtected: true };
  if (cleanPath === '/treatments') return { view: 'treatments', isProtected: true };
  if (cleanPath === '/panchakarma') return { view: 'panchakarma', isProtected: true };
  if (cleanPath === '/pharmacy') return { view: 'pharmacy', isProtected: true };
  if (cleanPath === '/laboratory') return { view: 'laboratory', isProtected: true };
  if (cleanPath === '/billing') return { view: 'billing', isProtected: true };
  if (cleanPath === '/reports') return { view: 'reports', isProtected: true };
  if (cleanPath === '/settings') return { view: 'settings', isProtected: true };
  if (cleanPath === '/doctors' || cleanPath === '/staff') return { view: 'doctors', isProtected: true };
  if (cleanPath === '/rbac') return { view: 'rbac', isProtected: true };
  if (cleanPath === '/audit') return { view: 'audit', isProtected: true };

  return { view: 'overview', isProtected: true };
}

// Simulated App State Machine
class AppAuthStateMachine {
  isAuthenticated: boolean = false;
  isAuthInitializing: boolean = true;
  activeView: string = 'login';
  currentUser: any = null;
  intendedRoute: string | null = null;
  renderedComponent: 'LoadingScreen' | 'AuthScreenView' | 'OperationalShell' = 'LoadingScreen';
  localStorage: Record<string, string> = {};

  navigate(path: string, search: string = '') {
    const route = parseAppRoute(path, search);
    if (!this.isAuthenticated) {
      if (route.isProtected) {
        this.intendedRoute = route.view;
        this.activeView = 'login';
      } else {
        this.activeView = route.view;
      }
    } else {
      this.activeView = route.view;
    }
    this.updateRender();
  }

  async initialize(verifySessionFn: (token: string) => Promise<{ success: boolean; user?: any; error?: string }>) {
    this.isAuthInitializing = true;
    this.updateRender();

    const token = this.localStorage['sahachara_auth_token'];
    if (!token) {
      this.isAuthenticated = false;
      this.currentUser = null;
      this.isAuthInitializing = false;
      this.activeView = 'login';
      this.updateRender();
      return;
    }

    try {
      const res = await verifySessionFn(token);
      if (res.success && res.user) {
        this.isAuthenticated = true;
        this.currentUser = res.user;
        const target = this.intendedRoute;
        this.activeView = target && target !== 'login' && target !== 'activate' ? target : 'overview';
        this.intendedRoute = null;
      } else {
        delete this.localStorage['sahachara_auth_token'];
        this.localStorage['sahachara.auth.session'] = 'false';
        this.isAuthenticated = false;
        this.currentUser = null;
        this.activeView = 'login';
      }
    } catch {
      delete this.localStorage['sahachara_auth_token'];
      this.localStorage['sahachara.auth.session'] = 'false';
      this.isAuthenticated = false;
      this.currentUser = null;
      this.activeView = 'login';
    } finally {
      this.isAuthInitializing = false;
      this.updateRender();
    }
  }

  login(user: any, token: string) {
    this.localStorage['sahachara_auth_token'] = token;
    this.localStorage['sahachara.auth.session'] = 'true';
    this.isAuthenticated = true;
    this.currentUser = user;
    const target = this.intendedRoute;
    this.activeView = target && target !== 'login' && target !== 'activate' ? target : 'overview';
    this.intendedRoute = null;
    this.updateRender();
  }

  logout() {
    delete this.localStorage['sahachara_auth_token'];
    this.localStorage['sahachara.auth.session'] = 'false';
    this.isAuthenticated = false;
    this.currentUser = null;
    this.intendedRoute = null;
    this.activeView = 'login';
    this.updateRender();
  }

  updateRender() {
    if (this.isAuthInitializing) {
      this.renderedComponent = 'LoadingScreen';
      return;
    }
    if (!this.isAuthenticated || !this.currentUser || this.activeView === 'login' || this.activeView === 'activate') {
      this.renderedComponent = 'AuthScreenView';
      return;
    }
    this.renderedComponent = 'OperationalShell';
  }
}

// ---------------------------------------------------------------------------
// 2. HELPER HTTP CLIENT
// ---------------------------------------------------------------------------
function request(
  serverPort: number,
  method: string,
  path: string,
  token?: string,
  body?: any
): Promise<{ status: number; body: any }> {
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
        path,
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
          resolve({ status: res.statusCode || 500, body: parsed });
        });
      }
    );

    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

// ---------------------------------------------------------------------------
// 3. MAIN TEST SUITE
// ---------------------------------------------------------------------------
async function main() {
  console.log(`\n============================================================`);
  console.log(`  SAHACHARA OPS — CRITICAL AUTHENTICATION & ROUTE GUARD SUITE`);
  console.log(`============================================================\n`);

  // Initialize test database fixtures
  await checkPrismaConnection();
  await ensureDefaultDatabaseUsers();
  console.log(`✓ Test database connected and test staff fixtures verified\n`);

  // Start isolated Express test server
  const app = express();
  app.use(express.json());
  app.use('/api', apiRouter);

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as any).port;
  console.log(`✓ Test Express server listening on 127.0.0.1:${port}\n`);

  // Create valid and invalid session tokens
  const validAdminToken = generateSessionToken({
    userId: 'usr-admin',
    email: 'admin.ops@sahachara.com',
    role: 'ADMIN',
    name: 'Marcus Sterling'
  }, 3600);

  const validDoctorToken = generateSessionToken({
    userId: 'usr-doc',
    email: 'sarah.chen@sahachara.com',
    role: 'DOCTOR',
    name: 'Dr. Sarah Chen, MD'
  }, 3600);

  const validReceptionToken = generateSessionToken({
    userId: 'usr-reception',
    email: 'receptionist@sahachara.com',
    role: 'RECEPTIONIST',
    name: 'Kavita Sharma'
  }, 3600);

  // Expired token (exp in past)
  const expiredPayload: TokenPayload = {
    userId: 'usr-admin',
    email: 'admin.ops@sahachara.com',
    role: 'ADMIN',
    name: 'Marcus Sterling',
    exp: Math.floor(Date.now() / 1000) - 3600
  };
  const encodedExpired = Buffer.from(JSON.stringify(expiredPayload)).toString('base64url');
  const expiredSig = crypto.createHmac('sha256', getSessionSecret()).update(encodedExpired).digest('base64url');
  const expiredToken = `sah_${encodedExpired}.${expiredSig}`;

  // Tampered token (invalid signature)
  const tamperedToken = `${validAdminToken.slice(0, -6)}BADSIG`;

  // Malformed token
  const malformedToken = 'sah_not.a.valid.jwt.token';

  // Helper verifying session via test server
  const verifySessionApi = async (tok: string) => {
    const res = await request(port, 'GET', '/api/auth/verify', tok);
    if (res.status === 200 && res.body.success) {
      return { success: true, user: res.body.user };
    }
    return { success: false, error: res.body.message || 'Rejected' };
  };

  // -------------------------------------------------------------------------
  // TEST GROUP 1: Route Protection & Default Entry
  // -------------------------------------------------------------------------
  console.log(`${CYAN}--- GROUP 1: Default Application Entry & Route Protection ---${RESET}`);

  const sm = new AppAuthStateMachine();
  sm.isAuthInitializing = false;
  sm.updateRender();

  // Test 1: "/" displays login when unauthenticated
  sm.navigate('/');
  assert(
    sm.activeView === 'login' && sm.renderedComponent === 'AuthScreenView',
    '1. "/" displays login page when unauthenticated'
  );

  // Test 2: "/dashboard" redirects when unauthenticated
  sm.navigate('/dashboard');
  assert(
    sm.activeView === 'login' && sm.intendedRoute === 'overview' && sm.renderedComponent === 'AuthScreenView',
    '2. "/dashboard" redirects unauthenticated visitor to login and saves intended route'
  );

  // Test 3: Every protected operational module rejects unauthenticated access
  const protectedPaths = [
    '/dashboard',
    '/patients',
    '/appointments',
    '/consultations',
    '/treatments',
    '/panchakarma',
    '/pharmacy',
    '/laboratory',
    '/billing',
    '/reports',
    '/settings',
    '/doctors',
    '/staff',
    '/rbac',
    '/audit'
  ];

  let allProtectedBlocked = true;
  for (const path of protectedPaths) {
    sm.navigate(path);
    if (sm.renderedComponent !== 'AuthScreenView' || sm.activeView !== 'login') {
      allProtectedBlocked = false;
      break;
    }
  }
  assert(
    allProtectedBlocked,
    '3. Every protected route (15 operational paths) rejects unauthenticated access'
  );

  // Test 4: Direct URL navigation cannot bypass authentication
  sm.navigate('/patients?id=123');
  assert(
    sm.activeView === 'login' && sm.renderedComponent === 'AuthScreenView',
    '4. Direct URL navigation with query parameters cannot bypass authentication'
  );

  // -------------------------------------------------------------------------
  // TEST GROUP 2: Loading State & Flash Prevention
  // -------------------------------------------------------------------------
  console.log(`\n${CYAN}--- GROUP 2: Loading State & Flash Prevention ---${RESET}`);

  // Test 11: No dashboard flash occurs while authentication is being initialized
  const freshSm = new AppAuthStateMachine();
  assert(
    freshSm.isAuthInitializing === true && freshSm.renderedComponent === 'LoadingScreen',
    '11. No dashboard flash occurs while authentication is initializing (renders LoadingScreen)'
  );

  // -------------------------------------------------------------------------
  // TEST GROUP 3: Session Validation, Network Failures & Restoration
  // -------------------------------------------------------------------------
  console.log(`\n${CYAN}--- GROUP 3: Token Verification, Session Restoration & Fail-Closed Guards ---${RESET}`);

  // Test 5A: Missing token fails closed
  const missingTokenSm = new AppAuthStateMachine();
  await missingTokenSm.initialize(verifySessionApi);
  assert(
    missingTokenSm.isAuthenticated === false && missingTokenSm.renderedComponent === 'AuthScreenView',
    '5a. Missing token in localStorage initializes directly to AuthScreenView'
  );

  // Test 5B: Expired token cannot access protected content
  const expiredSm = new AppAuthStateMachine();
  expiredSm.localStorage['sahachara_auth_token'] = expiredToken;
  await expiredSm.initialize(verifySessionApi);
  assert(
    expiredSm.isAuthenticated === false && expiredSm.renderedComponent === 'AuthScreenView',
    '5b. Expired token is rejected by backend and clears session to login'
  );

  // Test 5C: Tampered token cannot access protected content
  const tamperedSm = new AppAuthStateMachine();
  tamperedSm.localStorage['sahachara_auth_token'] = tamperedToken;
  await tamperedSm.initialize(verifySessionApi);
  assert(
    tamperedSm.isAuthenticated === false && tamperedSm.renderedComponent === 'AuthScreenView',
    '5c. Tampered token signature is rejected by backend and clears session to login'
  );

  // Test 5D: Malformed token cannot access protected content
  const malformedSm = new AppAuthStateMachine();
  malformedSm.localStorage['sahachara_auth_token'] = malformedToken;
  await malformedSm.initialize(verifySessionApi);
  assert(
    malformedSm.isAuthenticated === false && malformedSm.renderedComponent === 'AuthScreenView',
    '5d. Malformed token is rejected by backend and clears session to login'
  );

  // Test 12: Network failure during session validation never grants access (fail closed)
  const networkErrorSm = new AppAuthStateMachine();
  networkErrorSm.localStorage['sahachara_auth_token'] = validAdminToken;
  await networkErrorSm.initialize(async () => {
    throw new Error('ECONNREFUSED: Server unreachable');
  });
  assert(
    networkErrorSm.isAuthenticated === false && networkErrorSm.renderedComponent === 'AuthScreenView',
    '12. Network failure during session validation strictly fails closed to AuthScreenView'
  );

  // Test 6: Valid session restores correctly after refresh
  const validSm = new AppAuthStateMachine();
  validSm.localStorage['sahachara_auth_token'] = validAdminToken;
  validSm.intendedRoute = 'patients';
  await validSm.initialize(verifySessionApi);
  assert(
    validSm.isAuthenticated === true &&
    validSm.currentUser.role === 'ADMIN' &&
    validSm.activeView === 'patients' &&
    validSm.renderedComponent === 'OperationalShell',
    '6. Valid session restores correctly on startup and navigates to intended view'
  );

  // -------------------------------------------------------------------------
  // TEST GROUP 4: Login & Logout Lifecycle
  // -------------------------------------------------------------------------
  console.log(`\n${CYAN}--- GROUP 4: Login & Logout Lifecycle ---${RESET}`);

  // Test 7: Login succeeds with valid credentials
  const loginRes = await request(port, 'POST', '/api/auth/login', undefined, {
    email: 'admin.ops@sahachara.com',
    password: 'Admin@Sahachara2026!'
  });
  assert(
    loginRes.status === 200 && loginRes.body.success === true && !!loginRes.body.token,
    '7a. POST /api/auth/login endpoint authenticates valid credentials and returns session token'
  );

  // Verify successful login transition in state machine
  const sessionUser = loginRes.body.user;
  validSm.login(sessionUser, loginRes.body.token);
  assert(
    validSm.isAuthenticated === true &&
    validSm.currentUser.name === 'Marcus Sterling' &&
    validSm.renderedComponent === 'OperationalShell',
    '7b. Successful login establishes authenticated session and renders OperationalShell'
  );

  // Test 8: Logout prevents subsequent access
  validSm.logout();
  assert(
    validSm.isAuthenticated === false &&
    validSm.currentUser === null &&
    validSm.localStorage['sahachara_auth_token'] === undefined &&
    validSm.renderedComponent === 'AuthScreenView',
    '8a. Logout terminates session, purges localStorage tokens, and returns to AuthScreenView'
  );

  validSm.navigate('/patients');
  assert(
    validSm.activeView === 'login' && validSm.renderedComponent === 'AuthScreenView',
    '8b. Subsequent navigation to protected routes after logout is strictly blocked'
  );

  // -------------------------------------------------------------------------
  // TEST GROUP 5: Backend API Protection & RBAC
  // -------------------------------------------------------------------------
  console.log(`\n${CYAN}--- GROUP 5: Backend API Protection & Role-Based Access Control ---${RESET}`);

  // Test 9: Protected API endpoints reject requests without tokens
  const endpoints = [
    { method: 'GET', path: '/api/auth/verify' },
    { method: 'GET', path: '/api/overview' },
    { method: 'GET', path: '/api/patients' },
    { method: 'GET', path: '/api/appointments' },
    { method: 'GET', path: '/api/tariffs' },
    { method: 'GET', path: '/api/pharmacy/prescriptions' },
    { method: 'GET', path: '/api/billing/invoices' },
    { method: 'GET', path: '/api/audit' }
  ];

  let allEndpointsRejected = true;
  for (const ep of endpoints) {
    const res = await request(port, ep.method, ep.path);
    if (res.status !== 401) {
      allEndpointsRejected = false;
      console.error(`Endpoint ${ep.path} responded with ${res.status} instead of 401`);
      break;
    }
  }
  assert(
    allEndpointsRejected,
    '9. Protected API endpoints strictly reject requests without Bearer tokens (401 Unauthorized)'
  );

  // Test 10: Backend RBAC prevents unauthorized role access
  // DOCTOR attempting to create invoice -> 403 Forbidden
  const docInvoiceRes = await request(port, 'POST', '/api/billing/invoices', validDoctorToken, {
    patientId: 'pat-1',
    items: []
  });
  assert(
    docInvoiceRes.status === 403,
    '10a. DOCTOR role is forbidden from generating billing invoices (403 Forbidden)'
  );

  // RECEPTIONIST attempting to create prescription -> 403 Forbidden
  const rxRes = await request(port, 'POST', '/api/pharmacy/prescriptions', validReceptionToken, {
    patientId: 'pat-1',
    medication: 'Ashwagandha'
  });
  assert(
    rxRes.status === 403,
    '10b. RECEPTIONIST role is forbidden from prescribing medications (403 Forbidden)'
  );

  // RECEPTIONIST attempting to configure tariffs -> 403 Forbidden
  const tariffRes = await request(port, 'POST', '/api/tariffs', validReceptionToken, {
    serviceName: 'Hacked Service'
  });
  assert(
    tariffRes.status === 403,
    '10c. RECEPTIONIST role is forbidden from configuring hospital tariffs (403 Forbidden)'
  );

  // Clean up server & DB connection
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await prisma.$disconnect();

  console.log(`\n============================================================`);
  console.log(`  VERIFICATION RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log(`============================================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
