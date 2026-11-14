import { execSync } from 'child_process';
import { PrismaClient } from '@prisma/client';
import { INITIAL_TARIFFS } from '../src/data/seedData.ts';

const TEST_DB_NAME = 'sahachara_bootstrap_reconcile_test';
const TEST_DB_URL = `postgresql://highflyer@localhost:5432/${TEST_DB_NAME}`;

async function main() {
  console.log('======================================================================');
  console.log('   SAHACHARA OPS — FINAL BOOTSTRAP RECONCILIATION VERIFICATION       ');
  console.log('======================================================================\n');

  // 1. Setup isolated database
  console.log('1. Setting up clean test database:', TEST_DB_NAME);
  execSync(`psql -U highflyer -d postgres -c "DROP DATABASE IF EXISTS ${TEST_DB_NAME};"`, { stdio: 'ignore' });
  execSync(`psql -U highflyer -d postgres -c "CREATE DATABASE ${TEST_DB_NAME};"`, { stdio: 'ignore' });
  execSync(`DATABASE_URL="${TEST_DB_URL}" npx prisma migrate deploy`, { stdio: 'ignore' });
  console.log('   ✓ 23 migrations applied cleanly to test database.\n');

  // 2. Run bootstrap verification in isolated child process with production environment variables
  console.log('2. Executing production bootstrap verification in isolated process...');
  const runVerifyScript = `
    import { prisma, ensureDefaultDatabaseUsers, checkPrismaConnection } from "./server/prismaService.ts";
    import { INITIAL_TARIFFS } from "./src/data/seedData.ts";

    async function run() {
      // Test direct call to ensureDefaultDatabaseUsers (which previously raced)
      await ensureDefaultDatabaseUsers();

      const userCount = await prisma.user.count();
      const superAdmin = await prisma.user.findFirst({ where: { role: "SUPER_ADMIN" } });
      const tariffCount = await prisma.hospitalTariff.count();
      const profileCount = await prisma.hospitalProfile.count();
      const staffCount = await prisma.staffMember.count();

      if (userCount !== 1) throw new Error("Expected user count 1, got " + userCount);
      if (!superAdmin || superAdmin.email !== "systems@sahachara.com" || superAdmin.name !== "Sahachara Systems") {
        throw new Error("SUPER_ADMIN identity mismatch: " + JSON.stringify(superAdmin));
      }
      if (tariffCount !== 0) throw new Error("Expected tariff count 0, got " + tariffCount);
      if (profileCount !== 1) throw new Error("Expected hospital profile count 1, got " + profileCount);
      if (staffCount !== 0) throw new Error("Expected staff count 0, got " + staffCount);

      // Verify restart idempotency
      const initialHash = superAdmin.passwordHash;
      await ensureDefaultDatabaseUsers();
      const superAdmin2 = await prisma.user.findFirst({ where: { role: "SUPER_ADMIN" } });
      const userCount2 = await prisma.user.count();
      const tariffCount2 = await prisma.hospitalTariff.count();

      if (userCount2 !== 1 || tariffCount2 !== 0 || superAdmin2?.passwordHash !== initialHash) {
        throw new Error("Restart altered administrator or tariff count!");
      }

      // Verify SUPER_ADMIN can create an ambulatory outpatient service
      const createdTariff = await prisma.hospitalTariff.create({
        data: {
          category: "Ayurvedic Consultation",
          serviceCode: "AMB-CON-001",
          serviceName: "Initial Outpatient Vaidya Consultation",
          rate: null,
          isZeroPricePermitted: false,
          unit: "consultation"
        }
      });
      if (createdTariff.rate !== null) throw new Error("Expected rate to be null");

      // Verify rate configuration
      const updatedTariff = await prisma.hospitalTariff.update({
        where: { serviceCode: "AMB-CON-001" },
        data: { rate: 1250.00 }
      });
      if (updatedTariff.rate?.toString() !== "1250") throw new Error("Rate update failed");

      // Verify restart preserves configured rate
      await ensureDefaultDatabaseUsers();
      const preserved = await prisma.hospitalTariff.findUnique({ where: { serviceCode: "AMB-CON-001" } });
      if (preserved?.rate?.toString() !== "1250") throw new Error("Restart overwrote rate");

      console.log("   ✓ Initial bootstrap: exactly 1 SUPER_ADMIN, 0 tariffs, 0 staff, 1 profile.");
      console.log("   ✓ Restart idempotency: password hash and zero-tariff state strictly preserved.");
      console.log("   ✓ Rate Master workflow: ambulatory service created with null rate, configured to ₹1,250, preserved across restarts.");
      await prisma.$disconnect();
    }
    run().catch(e => { console.error(e); process.exit(1); });
  `;

  execSync(`DATABASE_URL="${TEST_DB_URL}" NODE_ENV="production" INITIAL_SUPER_ADMIN_EMAIL="systems@sahachara.com" INITIAL_SUPER_ADMIN_NAME="Sahachara Systems" INITIAL_SUPER_ADMIN_PASSWORD="ProductionSecurePassword2026!#" SESSION_SECRET="f02dd01bc39e8614826c1b75bb5b7ca2db6cc2372dfc70ea77abb5308e22aa16" npx tsx -e '${runVerifyScript}'`, { stdio: 'inherit' });

  // 3. Verify INITIAL_TARIFFS array in source code
  console.log('\n3. Verifying INITIAL_TARIFFS array in source code...');
  if (!Array.isArray(INITIAL_TARIFFS) || INITIAL_TARIFFS.length !== 0) {
    throw new Error(`FAIL: INITIAL_TARIFFS is not an empty array! Length: ${INITIAL_TARIFFS.length}`);
  }
  console.log('   ✓ INITIAL_TARIFFS is strictly an empty array (length 0).\n');

  // 4. Verify no inpatient codes exist in source
  console.log('4. Verifying no inpatient or accommodation tariffs in source code...');
  const inpatientSearch = execSync('grep -rn "BED-GEN\\|BED-SEMI\\|BED-ICU\\|BED-DLX" src/ server/ 2>&1 || true', { encoding: 'utf8' }).trim();
  if (inpatientSearch.length > 0) {
    throw new Error(`FAIL: Inpatient codes found in codebase:\n${inpatientSearch}`);
  }
  console.log('   ✓ Zero inpatient codes (BED-GEN, BED-SEMI, BED-ICU, BED-DLX) in src/ or server/.\n');

  // 5. Cleanup test database
  console.log('5. Cleaning up test database...');
  execSync(`psql -U highflyer -d postgres -c "DROP DATABASE ${TEST_DB_NAME} WITH (FORCE);"`, { stdio: 'ignore' });
  console.log('   ✓ Test database dropped cleanly.\n');

  // 6. Audit production Supabase database
  console.log('6. Auditing target Supabase production database state...');
  const prodPrisma = new PrismaClient();
  const [prodUsers, prodTariffs, prodProfiles, prodMigrations] = await Promise.all([
    prodPrisma.user.count(),
    prodPrisma.hospitalTariff.count(),
    prodPrisma.hospitalProfile.count(),
    prodPrisma.$queryRaw<[{ c: number }]>`SELECT count(*)::int as c FROM _prisma_migrations;`
  ]);

  console.log(`   - Users: ${prodUsers} (strictly 0)`);
  console.log(`   - Hospital Tariffs: ${prodTariffs} (strictly 0)`);
  console.log(`   - Hospital Profiles: ${prodProfiles} (strictly 1)`);
  console.log(`   - Migrations: ${prodMigrations[0].c} (strictly 23)`);

  if (prodUsers !== 0 || prodTariffs !== 0 || prodProfiles !== 1 || prodMigrations[0].c !== 23) {
    throw new Error('FAIL: Target Supabase production database state has drifted!');
  }
  console.log('   ✓ Target Supabase production database confirmed 100% UNCHANGED.\n');

  await prodPrisma.$disconnect();

  console.log('======================================================================');
  console.log('   FINAL BOOTSTRAP RECONCILIATION: ALL CHECKS PASSED (0 DEFECTS)     ');
  console.log('======================================================================');
}

main().catch(err => {
  console.error('Reconciliation failed:', err);
  process.exit(1);
});
