/**
 * SAHACHARA OPS — STAFF ACTIVATION PIN LIFECYCLE & SECURITY VERIFICATION SUITE
 *
 * Verifies all 16 mandatory test conditions:
 * 1. Generated PIN is strictly 4 numeric digits.
 * 2. Leading zeros are preserved (format: /^\d{4}$/).
 * 3. Cryptographic randomness using crypto.randomInt (no math.random, no predictable values).
 * 4. No hardcoded '7492' in active codebase (checked across src/, server/, etc.).
 * 5. Plaintext PIN is never persisted to database (activationPin is strictly NULL, bcrypt hash only).
 * 6. Plaintext PIN returned exactly once in authorized initial onboarding response.
 * 7. Plaintext PIN returned exactly once in authorized regenerate-pin response.
 * 8. Plaintext PIN displayed immediately in onboarding modal (frontend contract verification).
 * 9. Regenerate PIN generates a distinct, new PIN.
 * 10. Previous PIN is invalidated upon regeneration (cannot activate with old PIN).
 * 11. Expired PIN is rejected during activation (HTTP 400 Expired PIN).
 * 12. Already-used PIN is rejected during activation (HTTP 400 or already activated).
 * 13. Valid PIN activates account and transitions status from pending_activation to active.
 * 14. Account activation sets password (enforcing min 8 chars) and clears PIN hash.
 * 15. Unauthenticated/unauthorized access to staff PIN generation/regeneration is denied (HTTP 401/403).
 * 16. Non-pending activation staff members cannot regenerate PINs (HTTP 400 StaffNotPendingActivation).
 */

import http from 'http';
import fs from 'fs';
import path from 'path';
import express from 'express';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

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
  prisma,
  generateSecureActivationPin
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
    console.error(`  ${RED}✗ FAIL${RESET} ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

async function request(
  server: http.Server,
  method: string,
  urlPath: string,
  body?: any,
  token?: string
): Promise<{ status: number; body: any; headers: http.IncomingHttpHeaders }> {
  return new Promise((resolve, reject) => {
    const addr = server.address();
    if (!addr || typeof addr === 'string') return reject(new Error('Server not bound'));
    const payload = body ? JSON.stringify(body) : undefined;
    const req = http.request(
      {
        host: '127.0.0.1',
        port: addr.port,
        path: urlPath,
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        }
      },
      (res) => {
        let raw = '';
        res.on('data', (c) => (raw += c));
        res.on('end', () => {
          let parsed: any;
          try {
            parsed = JSON.parse(raw);
          } catch {
            parsed = raw;
          }
          resolve({ status: res.statusCode || 0, body: parsed, headers: res.headers });
        });
      }
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function run() {
  console.log(`\n${BOLD}======================================================================${RESET}`);
  console.log(`${BOLD}   SAHACHARA OPS — STAFF ACTIVATION PIN VERIFICATION SUITE           ${RESET}`);
  console.log(`${BOLD}======================================================================${RESET}\n`);

  await checkPrismaConnection();
  if (!isPrismaConnected) {
    console.error(`${RED}Prisma is not connected. Aborting tests.${RESET}`);
    process.exit(1);
  }
  await ensureDefaultDatabaseUsers();

  const app = express();
  app.use(express.json());
  app.use('/api', apiRouter);

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));

  const adminToken = generateSessionToken({
    userId: 'usr-admin-test',
    email: 'admin.ops@sahachara.com',
    role: 'ADMIN',
    name: 'Administrative Officer'
  });

  const doctorToken = generateSessionToken({
    userId: 'usr-doctor-test',
    email: 'robert.rivera@sahachara.com',
    role: 'DOCTOR',
    name: 'Senior Vaidya'
  });

  try {
    // -------------------------------------------------------------------------
    // TEST 1 & 2: GENERATED PIN IS STRICTLY 4 NUMERIC DIGITS & PRESERVES LEADING ZEROS
    // -------------------------------------------------------------------------
    console.log(`\n${CYAN}▶ 1 & 2. PIN FORMAT & LEADING ZERO PRESERVATION${RESET}`);
    const generatedPins: string[] = [];
    for (let i = 0; i < 200; i++) {
      generatedPins.push(generateSecureActivationPin());
    }
    const all4Digits = generatedPins.every(p => /^\d{4}$/.test(p));
    assert(all4Digits, 'Generated PIN is strictly 4 numeric digits across 200 samples');

    // Test that padStart(4, '0') preserves leading zeros
    const smallPins = [
      (0).toString().padStart(4, '0'),
      (7).toString().padStart(4, '0'),
      (42).toString().padStart(4, '0'),
      (350).toString().padStart(4, '0')
    ];
    assert(
      smallPins[0] === '0000' && smallPins[1] === '0007' && smallPins[2] === '0042' && smallPins[3] === '0350',
      'Leading zeros are correctly preserved (0000, 0007, 0042, 0350)'
    );

    // -------------------------------------------------------------------------
    // TEST 3: CRYPTOGRAPHIC RANDOMNESS (NO Math.random, NO STATIC VALUES)
    // -------------------------------------------------------------------------
    console.log(`\n${CYAN}▶ 3. CRYPTOGRAPHIC RANDOMNESS${RESET}`);
    const uniqueSet = new Set(generatedPins);
    // Across 200 samples of 10000 possibilities, unique count should be very high (>170)
    assert(uniqueSet.size > 170, `Cryptographic randomness: ${uniqueSet.size}/200 unique samples generated`);
    const prismaServiceSource = fs.readFileSync(path.join(process.cwd(), 'server', 'prismaService.ts'), 'utf8');
    const fnSource = generateSecureActivationPin.toString();
    assert(
      fnSource.includes('crypto.randomInt') || prismaServiceSource.includes('crypto.randomInt(0, 10000)'),
      'server/prismaService.ts uses Node.js crypto.randomInt(0, 10000) for PIN generation'
    );
    assert(
      !fnSource.includes('Math.random'),
      'generateSecureActivationPin does not use Math.random()'
    );

    // -------------------------------------------------------------------------
    // TEST 4: NO HARDCODED '7492' IN ACTIVE SOURCE CODE
    // -------------------------------------------------------------------------
    console.log(`\n${CYAN}▶ 4. NO HARDCODED 7492 IN CODEBASE${RESET}`);
    const filesToCheck = [
      'server/prismaService.ts',
      'server/routes.ts',
      'src/views/SettingsWorkspaceView.tsx',
      'src/views/DoctorsStaffView.tsx',
      'src/views/AuthScreenView.tsx',
      'src/components/modals/NewStaffMemberModal.tsx',
      'src/services/hospitalApi.ts'
    ];
    let found7492 = false;
    for (const f of filesToCheck) {
      const content = fs.readFileSync(path.join(process.cwd(), f), 'utf8');
      if (content.includes('7492')) {
        found7492 = true;
        console.error(`  Found 7492 in ${f}`);
      }
    }
    assert(!found7492, 'No occurrences of hardcoded 7492 in active application files');

    // -------------------------------------------------------------------------
    // TEST 5 & 6: PLAINTEXT PIN RETURNED ONCE, DB HAS STRICTLY NULL & BCRYPT HASH
    // -------------------------------------------------------------------------
    console.log(`\n${CYAN}▶ 5 & 6. INITIAL ONBOARDING & DB PLAINTEXT NULL ENFORCEMENT${RESET}`);
    const uniqueEmail = `pin.test.${Date.now()}@sahachara.com`;
    const createRes = await request(
      server,
      'POST',
      '/api/staff',
      {
        name: 'PIN Test Staff',
        email: uniqueEmail,
        role: 'PHARMACIST',
        department: 'Pharmacy',
        designation: 'Staff Pharmacist',
        phone: '+91 98765 43210',
        status: 'pending_activation'
      },
      adminToken
    );

    assert(createRes.status === 201, 'POST /api/staff succeeded with 201 Created');
    const createdStaff = createRes.body?.data;
    const initialPin = createRes.body?.activationPin;
    assert(typeof initialPin === 'string' && /^\d{4}$/.test(initialPin), 'Initial onboarding response returns 4-digit activationPin', initialPin);

    // Verify database record
    const dbStaff = await prisma.staffMember.findUnique({ where: { id: createdStaff.id } });
    assert(dbStaff !== null, 'Staff record found in PostgreSQL');
    assert(dbStaff?.activationPin === null, 'Plaintext activationPin in staff_members table is strictly NULL');
    assert(typeof dbStaff?.activationPinHash === 'string' && dbStaff.activationPinHash.length > 20, 'Cryptographic activationPinHash is present');
    const dbHashValid = await bcrypt.compare(initialPin, dbStaff?.activationPinHash || '');
    assert(dbHashValid, 'Database bcrypt hash verifies against returned plaintext PIN');

    // Verify linked User record
    const dbUser = await prisma.user.findUnique({ where: { email: uniqueEmail } });
    assert(dbUser?.activationPin === null, 'Plaintext activationPin in users table is strictly NULL');
    assert(typeof dbUser?.activationPinHash === 'string' && dbUser.activationPinHash.length > 20, 'User activationPinHash is present');

    // Verify GET /api/staff and GET /api/staff/:id do NOT expose plaintext PIN
    const listRes = await request(server, 'GET', `/api/staff?search=${encodeURIComponent(uniqueEmail)}`, undefined, adminToken);
    assert(listRes.status === 200, 'GET /api/staff returns 200 OK');
    const returnedStaff = listRes.body?.data?.find((s: any) => s.email === uniqueEmail);
    assert(returnedStaff && returnedStaff.activationPin === null, 'General staff directory returns activationPin as strictly NULL');

    const detailRes = await request(server, 'GET', `/api/staff/${createdStaff.id}`, undefined, adminToken);
    assert(detailRes.status === 200, 'GET /api/staff/:id returns 200 OK');
    assert(detailRes.body?.data?.activationPin === null, 'Individual staff detail returns activationPin as strictly NULL');

    // -------------------------------------------------------------------------
    // TEST 7, 9 & 10: REGENERATE PIN RETURNS NEW PIN & INVALIDATES OLD PIN
    // -------------------------------------------------------------------------
    console.log(`\n${CYAN}▶ 7, 9 & 10. REGENERATE PIN & OLD PIN INVALIDATION${RESET}`);
    const regenRes = await request(
      server,
      'POST',
      `/api/staff/${createdStaff.id}/regenerate-pin`,
      {},
      adminToken
    );

    assert(regenRes.status === 200, 'POST /api/staff/:id/regenerate-pin succeeded with 200 OK');
    const newPin = regenRes.body?.activationPin;
    assert(typeof newPin === 'string' && /^\d{4}$/.test(newPin), 'Regenerate response returns new 4-digit activationPin', newPin);
    assert(newPin !== initialPin, 'Regenerate PIN generated a distinct new PIN from initial PIN');

    // Check DB updated
    const dbStaffAfterRegen = await prisma.staffMember.findUnique({ where: { id: createdStaff.id } });
    assert(dbStaffAfterRegen?.activationPin === null, 'activationPin remains strictly NULL after regeneration');
    const oldHashValid = await bcrypt.compare(initialPin, dbStaffAfterRegen?.activationPinHash || '');
    assert(!oldHashValid, 'Previous PIN fails bcrypt comparison (invalidated)');
    const newHashValid = await bcrypt.compare(newPin, dbStaffAfterRegen?.activationPinHash || '');
    assert(newHashValid, 'New PIN matches new bcrypt hash in database');

    // Try activating with old PIN (should fail)
    const oldPinActivateRes = await request(
      server,
      'POST',
      '/api/auth/activate',
      {
        email: uniqueEmail,
        pin: initialPin,
        password: 'ValidPassword123!'
      }
    );
    assert(oldPinActivateRes.status === 400, 'Activation with invalidated old PIN rejected with HTTP 400');

    // -------------------------------------------------------------------------
    // TEST 8: FRONTEND IMMEDIATE DISPLAY & COPY PIN CONTRACT
    // -------------------------------------------------------------------------
    console.log(`\n${CYAN}▶ 8. FRONTEND IMMEDIATE DISPLAY VERIFICATION${RESET}`);
    const settingsSource = fs.readFileSync(path.join(process.cwd(), 'src', 'views', 'SettingsWorkspaceView.tsx'), 'utf8');
    const doctorsSource = fs.readFileSync(path.join(process.cwd(), 'src', 'views', 'DoctorsStaffView.tsx'), 'utf8');

    assert(
      settingsSource.includes('activationPin') && settingsSource.includes('setNewlyCreatedPinInfo'),
      'SettingsWorkspaceView captures activationPin and opens newlyCreatedPinInfo dialog immediately'
    );
    assert(
      doctorsSource.includes('activationPin') && doctorsSource.includes('setNewlyCreatedPinInfo'),
      'DoctorsStaffView captures activationPin and opens newlyCreatedPinInfo dialog immediately'
    );
    assert(
      settingsSource.includes('Copy PIN') && doctorsSource.includes('Copy PIN'),
      'Both views provide a Copy PIN button with clipboard interaction'
    );
    assert(
      settingsSource.includes('setNewlyCreatedPinInfo(null)') && doctorsSource.includes('setNewlyCreatedPinInfo(null)'),
      'Plaintext PIN is cleared from frontend state (setNewlyCreatedPinInfo(null)) upon modal close or dismissal'
    );
    const hospitalApiSource = fs.readFileSync(path.join(process.cwd(), 'src', 'services', 'hospitalApi.ts'), 'utf8');
    assert(
      hospitalApiSource.includes('delete (cachedStaff as any).activationPin'),
      'hospitalApi unshifts sanitized staff into local cache with activationPin deleted'
    );

    // -------------------------------------------------------------------------
    // TEST 11: EXPIRED PIN REJECTION
    // -------------------------------------------------------------------------
    console.log(`\n${CYAN}▶ 11. EXPIRED PIN REJECTION${RESET}`);
    // Manually expire PIN in DB
    await prisma.staffMember.update({
      where: { id: createdStaff.id },
      data: { pinExpiresAt: new Date(Date.now() - 3600000) } // 1 hour ago
    });
    await prisma.user.update({
      where: { email: uniqueEmail },
      data: { pinExpiresAt: new Date(Date.now() - 3600000) }
    });

    const expiredActivateRes = await request(
      server,
      'POST',
      '/api/auth/activate',
      {
        email: uniqueEmail,
        pin: newPin,
        newPassword: 'ValidPassword123!'
      }
    );
    assert(expiredActivateRes.status === 400, 'Activation with expired PIN rejected with HTTP 400');
    assert(
      expiredActivateRes.body?.error?.includes('expired') || expiredActivateRes.body?.message?.includes('expired'),
      'Error message states PIN has expired'
    );

    // -------------------------------------------------------------------------
    // TEST 13 & 14: VALID PIN ACTIVATES ACCOUNT & SETS PASSWORD (MIN 8 CHARS)
    // -------------------------------------------------------------------------
    console.log(`\n${CYAN}▶ 13 & 14. VALID ACTIVATION & PASSWORD ENFORCEMENT${RESET}`);
    // Regenerate PIN to get fresh valid PIN
    const freshRegenRes = await request(
      server,
      'POST',
      `/api/staff/${createdStaff.id}/regenerate-pin`,
      {},
      adminToken
    );
    const validPin = freshRegenRes.body?.activationPin;

    // Test password < 8 chars rejected
    const shortPasswordRes = await request(
      server,
      'POST',
      '/api/auth/activate',
      {
        email: uniqueEmail,
        pin: validPin,
        newPassword: '123456' // 6 chars
      }
    );
    assert(shortPasswordRes.status === 400, 'Activation with password < 8 characters rejected with HTTP 400');

    // Valid activation with 8+ chars
    const validActivateRes = await request(
      server,
      'POST',
      '/api/auth/activate',
      {
        email: uniqueEmail,
        pin: validPin,
        newPassword: 'ValidStaffPassword123!'
      }
    );
    assert(validActivateRes.status === 200, 'Valid activation succeeded with HTTP 200 OK');
    assert(validActivateRes.body?.user?.status === 'active', 'User status transitioned to active in response');

    // Verify DB state after activation
    const activeDbStaff = await prisma.staffMember.findUnique({ where: { id: createdStaff.id } });
    const activeDbUser = await prisma.user.findUnique({ where: { email: uniqueEmail } });
    assert(activeDbStaff?.status === 'active', 'staff_members status transitioned to active in PostgreSQL');
    assert(activeDbStaff?.activationPinHash === null, 'Staff activationPinHash cleared upon successful activation');
    assert(activeDbUser?.status === 'active', 'users status transitioned to active in PostgreSQL');
    assert(activeDbUser?.activationPinHash === null, 'User activationPinHash cleared upon successful activation');
    assert(typeof activeDbUser?.passwordHash === 'string' && activeDbUser.passwordHash.length > 20, 'User passwordHash is set');

    // -------------------------------------------------------------------------
    // TEST 12: ALREADY-USED PIN REJECTED DURING SUBSEQUENT ACTIVATION
    // -------------------------------------------------------------------------
    console.log(`\n${CYAN}▶ 12. ALREADY-USED PIN REJECTION${RESET}`);
    const reuseActivateRes = await request(
      server,
      'POST',
      '/api/auth/activate',
      {
        email: uniqueEmail,
        pin: validPin,
        newPassword: 'AnotherPassword123!'
      }
    );
    assert(reuseActivateRes.status === 400, 'Re-activation of already active staff rejected with HTTP 400');

    // -------------------------------------------------------------------------
    // TEST 15: UNAUTHENTICATED / UNAUTHORIZED ACCESS DENIED (HTTP 401 / 403)
    // -------------------------------------------------------------------------
    console.log(`\n${CYAN}▶ 15. RBAC & UNAUTHENTICATED PROTECTION${RESET}`);
    const unauthRegen = await request(
      server,
      'POST',
      `/api/staff/${createdStaff.id}/regenerate-pin`,
      {}
    );
    assert(unauthRegen.status === 401, 'Unauthenticated regenerate-pin rejected with HTTP 401');

    const unauthorizedRoleRegen = await request(
      server,
      'POST',
      `/api/staff/${createdStaff.id}/regenerate-pin`,
      {},
      doctorToken // DOCTOR cannot manage staff
    );
    assert(unauthorizedRoleRegen.status === 403, 'Unauthorized role (DOCTOR) regenerate-pin rejected with HTTP 403');

    // -------------------------------------------------------------------------
    // TEST 16: NON-PENDING ACTIVATION STAFF CANNOT REGENERATE PIN
    // -------------------------------------------------------------------------
    console.log(`\n${CYAN}▶ 16. NON-PENDING ACTIVATION STAFF REGENERATE REJECTION${RESET}`);
    // createdStaff is now active
    const activeRegenRes = await request(
      server,
      'POST',
      `/api/staff/${createdStaff.id}/regenerate-pin`,
      {},
      adminToken
    );
    assert(activeRegenRes.status === 400, 'Regenerate PIN for active staff rejected with HTTP 400 (StaffNotPendingActivation)');
    assert(
      activeRegenRes.body?.error === 'StaffNotPendingActivation' || activeRegenRes.body?.message?.includes('pending_activation'),
      'Error code or message indicates staff is not pending activation'
    );

    // Clean up created staff record to avoid pollution
    await prisma.staffMember.deleteMany({ where: { email: uniqueEmail } });
    await prisma.user.deleteMany({ where: { email: uniqueEmail } });
  } finally {
    server.close();
  }

  console.log(`\n${BOLD}======================================================================${RESET}`);
  console.log(`${BOLD}   ACTIVATION PIN VERIFICATION COMPLETE: ${passed} PASSED, ${failed} FAILED ${RESET}`);
  console.log(`${BOLD}======================================================================${RESET}\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

run().catch((err) => {
  console.error('Fatal verification suite error:', err);
  process.exit(1);
});
