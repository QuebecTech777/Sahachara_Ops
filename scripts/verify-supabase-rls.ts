/**
 * Sahachara Ops — Supabase Row Level Security (RLS) Verification Suite
 *
 * Verifies:
 * 1. PostgREST role permission boundaries ('anon', 'authenticated', 'service_role')
 * 2. Complete RLS enforcement (relrowsecurity & relforcerowsecurity) across all 38 tables
 * 3. Default-deny behavior on operational tables for unauthenticated/untrusted roles
 * 4. Controlled public access to hospital profile institution info
 * 5. Immutable policy behavior on critical ledgers
 * 6. Transaction-scoped context isolation (zero pool leakage)
 * 7. Trusted backend Prisma operations compatibility
 */

import { Prisma, PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
dotenv.config();

const TEST_DB_URL = process.env.TEST_DATABASE_URL || 'postgresql://highflyer@localhost:5432/sahachara_ops_test_db';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: TEST_DB_URL
    }
  }
});

let passedCount = 0;
let failedCount = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`  ✓ PASS: ${message}`);
    passedCount++;
  } else {
    console.error(`  ✗ FAIL: ${message}`);
    failedCount++;
  }
}

type TestRole = 'anon' | 'authenticated' | 'service_role';

async function asRole<T>(role: TestRole, operation: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL ROLE ${role}`);
    return operation(tx);
  });
}

async function expectPermissionDenied(role: TestRole, sqlQuery: string, description: string) {
  try {
    await asRole(role, (tx) => tx.$executeRawUnsafe(sqlQuery));
    assert(false, `${description} should have thrown permission denied`);
  } catch (err: any) {
    const isDenied = err.message?.includes('permission denied') || 
                     err.message?.includes('violates row-level security policy') ||
                     err.code === '42501';
    assert(isDenied, `${description} properly denied (caught ${isDenied ? 'expected' : err.message} error)`);
  }
}

async function runVerification() {
  console.log('====================================================================');
  console.log('Sahachara Ops — PostgreSQL Row Level Security (RLS) Verification');
  console.log(`Target: ${TEST_DB_URL.replace(/:[^:@]+@/, ':****@')}`);
  console.log('====================================================================\n');

  try {
    // ------------------------------------------------------------------
    // TEST 1: Table-level RLS & FORCE RLS coverage
    // ------------------------------------------------------------------
    console.log('[TEST 1] Verifying RLS and FORCE RLS flags on all 38 tables...');
    const rlsAudit: any[] = await prisma.$queryRaw`
      SELECT 
        c.relname AS table_name,
        c.relrowsecurity AS rls_enabled,
        c.relforcerowsecurity AS force_rls
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r'
      ORDER BY c.relname;
    `;

    assert(rlsAudit.length === 38, `Exactly 38 public application tables found (found ${rlsAudit.length})`);
    const allRlsEnabled = rlsAudit.every((t) => t.rls_enabled === true);
    assert(allRlsEnabled, 'Row Level Security is ENABLED on 100% of tables (38/38)');
    const allForceRls = rlsAudit.every((t) => t.force_rls === true);
    assert(allForceRls, 'FORCE ROW LEVEL SECURITY is ENABLED on 100% of tables (38/38)');

    // ------------------------------------------------------------------
    // TEST 2: Anonymous ('anon') Role Perimeter Isolation
    // ------------------------------------------------------------------
    console.log('\n[TEST 2] Verifying PostgREST "anon" role perimeter isolation...');
    const expectAnonDenied = (sql: string, description: string) => expectPermissionDenied('anon', sql, description);

    // Operational tables must deny read to anon
    await expectAnonDenied('SELECT * FROM public.patients LIMIT 1;', 'anon SELECT on patients');
    await expectAnonDenied('SELECT * FROM public.users LIMIT 1;', 'anon SELECT on users');
    await expectAnonDenied('SELECT * FROM public.prescriptions LIMIT 1;', 'anon SELECT on prescriptions');
    await expectAnonDenied('SELECT * FROM public.invoices LIMIT 1;', 'anon SELECT on invoices');
    await expectAnonDenied('SELECT * FROM public.hospital_tariffs LIMIT 1;', 'anon SELECT on hospital_tariffs');
    await expectAnonDenied('SELECT * FROM public.therapy_sessions LIMIT 1;', 'anon SELECT on therapy_sessions');

    // Operational tables must deny write to anon
    await expectAnonDenied("INSERT INTO public.patients (\"id\", \"mrn\", \"firstName\", \"lastName\", \"gender\", \"phone\", \"status\") VALUES ('00000000-0000-0000-0000-000000000001', 'MRN-HACK', 'Hack', 'Er', 'MALE', '9999999999', 'active');", 'anon INSERT on patients');
    await expectAnonDenied("UPDATE public.patients SET \"firstName\" = 'Hacked';", 'anon UPDATE on patients');
    await expectAnonDenied("DELETE FROM public.patients WHERE true;", 'anon DELETE on patients');

    // Direct table access to hospital_profiles must be denied to anon
    await expectAnonDenied('SELECT * FROM public.hospital_profiles LIMIT 1;', 'anon SELECT on hospital_profiles table directly');
    await expectAnonDenied("UPDATE public.hospital_profiles SET \"displayName\" = 'Hacked';", 'anon UPDATE on hospital_profiles table');
    await expectAnonDenied("DELETE FROM public.hospital_profiles WHERE true;", 'anon DELETE on hospital_profiles table');

    // Restricted view exposes approved public metadata without internal fields
    try {
      const publicProfiles: any[] = await asRole('anon', (tx) => tx.$queryRawUnsafe('SELECT * FROM public.public_hospital_profile;'));
      assert(Array.isArray(publicProfiles), 'anon SELECT on public_hospital_profile view allowed for approved public metadata');
      if (publicProfiles.length > 0) {
        const row = publicProfiles[0];
        assert(row.updatedById === undefined, 'public_hospital_profile view excludes internal updatedById');
        assert(row.updatedByName === undefined, 'public_hospital_profile view excludes internal updatedByName');
        assert(row.version === undefined, 'public_hospital_profile view excludes internal version');
        assert(typeof row.displayName === 'string', `public_hospital_profile view includes approved displayName (${row.displayName})`);
      }
    } catch (err: any) {
      assert(false, `anon SELECT on public_hospital_profile view should be allowed: ${err.message}`);
    }

    // View mutations must be denied to anon
    await expectAnonDenied("UPDATE public.public_hospital_profile SET \"displayName\" = 'Hacked';", 'anon UPDATE on public_hospital_profile view');
    await expectAnonDenied("DELETE FROM public.public_hospital_profile WHERE true;", 'anon DELETE on public_hospital_profile view');

    // ------------------------------------------------------------------
    // TEST 3: Supabase Authenticated ('authenticated') Role Perimeter Isolation
    // ------------------------------------------------------------------
    console.log('\n[TEST 3] Verifying PostgREST "authenticated" role perimeter isolation...');
    const expectAuthenticatedDenied = (sql: string, description: string) => expectPermissionDenied('authenticated', sql, description);

    await expectAuthenticatedDenied('SELECT * FROM public.patients LIMIT 1;', 'authenticated SELECT on patients');
    await expectAuthenticatedDenied('SELECT * FROM public.users LIMIT 1;', 'authenticated SELECT on users');
    await expectAuthenticatedDenied('SELECT * FROM public.invoices LIMIT 1;', 'authenticated SELECT on invoices');
    await expectAuthenticatedDenied('SELECT * FROM public.prescriptions LIMIT 1;', 'authenticated SELECT on prescriptions');
    await expectAuthenticatedDenied('SELECT * FROM public.refund_ledger_entries LIMIT 1;', 'authenticated SELECT on refund_ledger_entries');
    await expectAuthenticatedDenied('SELECT * FROM public.audit_logs LIMIT 1;', 'authenticated SELECT on audit_logs');

    await expectAuthenticatedDenied("INSERT INTO public.appointments (\"id\", \"patientName\", \"patientMrn\", \"doctorName\", \"dateTime\", \"timeSlot\", \"updatedAt\") VALUES ('00000000-0000-0000-0000-000000000001', 'Test', 'MRN-001', 'Doc', CURRENT_TIMESTAMP, '10:00', CURRENT_TIMESTAMP);", 'authenticated INSERT on appointments');

    // ------------------------------------------------------------------
    // TEST 4: Service Role ('service_role') Operational Access & Immutability
    // ------------------------------------------------------------------
    console.log('\n[TEST 4] Verifying "service_role" operational policies & immutability...');
    const expectServiceDenied = (sql: string, description: string) => expectPermissionDenied('service_role', sql, description);

    try {
      await asRole('service_role', (tx) => tx.$queryRawUnsafe('SELECT count(*) FROM public.patients;'));
      assert(true, 'service_role SELECT on patients permitted by policy');
    } catch (err: any) {
      assert(false, `service_role SELECT on patients failed: ${err.message}`);
    }

    // Verify immutability policy: audit_logs & refund_ledger_entries cannot be updated/deleted
    await expectServiceDenied("UPDATE public.refund_ledger_entries SET \"amount\" = 0;", 'service_role UPDATE on refund_ledger_entries blocked by immutability policy');
    await expectServiceDenied("DELETE FROM public.refund_ledger_entries WHERE true;", 'service_role DELETE on refund_ledger_entries blocked by immutability policy');
    await expectServiceDenied("UPDATE public.audit_logs SET \"action\" = 'MUTATED';", 'service_role UPDATE on audit_logs blocked by immutability policy');
    await expectServiceDenied("DELETE FROM public.audit_logs WHERE true;", 'service_role DELETE on audit_logs blocked by immutability policy');

    // ------------------------------------------------------------------
    // TEST 5: Transaction-Scoped Identity Context Isolation (No Pool Leakage)
    // ------------------------------------------------------------------
    console.log('\n[TEST 5] Verifying transaction-scoped identity context isolation...');

    const roles: TestRole[] = ['anon', 'authenticated', 'service_role'];
    const scopedRoles = await Promise.all(roles.map((role) => asRole(role, async (tx) => {
      const result: { role: string }[] = await tx.$queryRaw`SELECT current_user AS role`;
      return result[0].role;
    })));
    assert(scopedRoles.every((role, i) => role === roles[i]), 'Concurrent pooled transactions use their requested roles');
    const connectionRole: { current: string; session: string }[] = await prisma.$queryRaw`SELECT current_user AS current, session_user AS session`;
    assert(connectionRole[0].current === connectionRole[0].session, 'Transaction roles do not leak into the connection pool');

    // Context outside transaction should be null
    const initialContext: any[] = await prisma.$queryRaw`
      SELECT public.app_current_user_id() AS uid, public.app_current_user_role() AS role;
    `;
    assert(initialContext[0].uid === null, 'Initial app_current_user_id() is NULL');
    assert(initialContext[0].role === null, 'Initial app_current_user_role() is NULL');

    // Set inside a transaction
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe("SET LOCAL app.current_user_id = 'test-staff-001';");
      await tx.$executeRawUnsafe("SET LOCAL app.current_user_role = 'SUPER_ADMIN';");

      const inTxContext: any[] = await tx.$queryRaw`
        SELECT public.app_current_user_id() AS uid, public.app_current_user_role() AS role;
      `;
      assert(inTxContext[0].uid === 'test-staff-001', 'Inside transaction: app_current_user_id() matches set value');
      assert(inTxContext[0].role === 'SUPER_ADMIN', 'Inside transaction: app_current_user_role() matches set value');
    });

    // Post-transaction verification on the pool connection: context MUST reset to NULL
    const postTxContext: any[] = await prisma.$queryRaw`
      SELECT public.app_current_user_id() AS uid, public.app_current_user_role() AS role;
    `;
    assert(postTxContext[0].uid === null, 'Post-transaction connection pool context: app_current_user_id() reset to NULL (no leak)');
    assert(postTxContext[0].role === null, 'Post-transaction connection pool context: app_current_user_role() reset to NULL (no leak)');

    // ------------------------------------------------------------------
    // TEST 6: Trusted Backend Prisma Client Seamless Operations
    // ------------------------------------------------------------------
    console.log('\n[TEST 6] Verifying trusted backend Prisma operations continue seamlessly...');
    const userCount = await prisma.user.count();
    assert(typeof userCount === 'number', `Prisma user.count() succeeded (${userCount} users)`);

    const patientCount = await prisma.patient.count();
    assert(typeof patientCount === 'number', `Prisma patient.count() succeeded (${patientCount} patients)`);

    const tariffCount = await prisma.hospitalTariff.count();
    assert(typeof tariffCount === 'number', `Prisma hospitalTariff.count() succeeded (${tariffCount} tariffs)`);

    const profile = await prisma.hospitalProfile.findFirst();
    assert(profile !== null, `Prisma hospitalProfile.findFirst() succeeded (institution: ${profile?.displayName})`);

    // ------------------------------------------------------------------
    // TEST 7: Actual Prisma Backend Ledger Immutability Enforcement
    // ------------------------------------------------------------------
    console.log('\n[TEST 7] Verifying backend Prisma connection (postgres role with BYPASSRLS) ledger immutability...');
    
    // Create an audit log record through ordinary Prisma connection
    const testLog = await prisma.auditLog.create({
      data: {
        action: 'RLS_IMMUTABILITY_PROBE',
        actor: 'Security Audit',
        role: 'SUPER_ADMIN',
        category: 'Security',
        details: 'Initial immutable entry'
      }
    });
    assert(Boolean(testLog.id), 'Prisma permitted to append audit_logs entry');

    // Attempt UPDATE on audit_logs through Prisma connection
    let auditLogUpdateBlocked = false;
    try {
      await prisma.$executeRawUnsafe(`UPDATE public.audit_logs SET details = 'tampered' WHERE id = '${testLog.id}';`);
    } catch (err: any) {
      auditLogUpdateBlocked = err.message.includes('IMMUTABLE_RECORD') || err.message.includes('strictly immutable');
    }
    assert(auditLogUpdateBlocked, 'Prisma connection (postgres with BYPASSRLS) UPDATE on audit_logs blocked by trigger');

    // Attempt DELETE on audit_logs through Prisma connection
    let auditLogDeleteBlocked = false;
    try {
      await prisma.$executeRawUnsafe(`DELETE FROM public.audit_logs WHERE id = '${testLog.id}';`);
    } catch (err: any) {
      auditLogDeleteBlocked = err.message.includes('IMMUTABLE_RECORD') || err.message.includes('strictly immutable');
    }
    assert(auditLogDeleteBlocked, 'Prisma connection (postgres with BYPASSRLS) DELETE on audit_logs blocked by trigger');

    // ------------------------------------------------------------------
    // SUMMARY
    // ------------------------------------------------------------------
    console.log('\n====================================================================');
    console.log(`RLS Verification Complete: ${passedCount} passed, ${failedCount} failed`);
    console.log('====================================================================');

    if (failedCount > 0) {
      process.exit(1);
    }
  } catch (error) {
    console.error('Fatal error during RLS verification:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

runVerification();
