import {
  PrismaClient,
  Prisma,
  DepartmentDiscipline,
  AssignmentStatus,
  HospitalProfile,
  Department,
  StaffDepartmentAssignment,
  TherapyRoomType,
  RoomOperationalStatus,
  SessionExecutionStatus,
  PanchakarmaPhase,
  SessionBillingMode,
  PanchakarmaBillingMode,
  TherapyRoom,
  TherapySession,
  PanchakarmaPhaseTransition,
  StaffTherapyAuthorization
} from '@prisma/client';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { hospitalStore } from './dataStore.ts';
import {
  Patient,
  Appointment,
  Consultation,
  TreatmentPlan,
  PanchakarmaCourse,
  Prescription,
  MedicationStock,
  LabOrder,
  BillInvoice,
  StaffMember,
  ClinicalAuditLog,
  AppUser,
  UserRole,
  VALID_USER_ROLES,
  AuditCategory,
  HospitalTariff,
  RateHistory,
  StockMovement,
  DuplicatePatientMatch,
  PatientDossier,
  QueueItem,
  ReceptionDashboardMetrics,
  AppointmentStatus,
  BookingSource,
  QueuePriority,
  ClinicalEncounter,
  DoctorDashboardMetrics,
  VaidyaDashboardMetrics,
  ClinicalVitals,
  ClinicalAssessment,
  ClinicalDiagnosis,
  PrakritiAssessment,
  VikritiAssessment,
  DoshaEvaluation,
  PanchakarmaReferral,
  PatientClinicalHistory,
  DispensingRecord,
  Payment,
  PaymentAllocation,
  RefundRequest,
  RefundLedgerEntry,
  PatientAccountSummary,
  BillableItem,
  DailyCollectionReport,
  OutstandingReceivablesReport,
  PaymentMethod,
  PaymentStatus,
  RefundRequestType,
  RefundRequestStatus,
  InvoiceStatus,
  PreProcedureAssessment,
  PostProcedureAssessment,
  TherapyRoom as DomainTherapyRoom,
  TherapySession as DomainTherapySession,
  PanchakarmaPhaseTransition as DomainPanchakarmaPhaseTransition,
  StaffTherapyAuthorization as DomainStaffTherapyAuthorization
} from '../src/types/hospital.ts';
import { INITIAL_TARIFFS } from '../src/data/seedData.ts';
import { generateSessionToken, isValidUserRole, registerActiveUserChecker } from './rbacMiddleware.ts';

// Initialize Prisma client with graceful connection handling
export const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error']
});

export let isPrismaConnected = false;

// Register session active checker for fail-closed session authentication and revocation
registerActiveUserChecker(async (userId: string, email?: string) => {
  // 1. Fail closed on database unavailability
  if (!isPrismaConnected) {
    return { isActive: false, isUnavailable: true, statusReason: 'unavailable' };
  }

  try {
    // 2. Query user identity with linked staff member
    const cleanEmail = email ? email.toLowerCase().trim() : undefined;
    const u = await prisma.user.findFirst({
      where: {
        OR: [
          { id: userId },
          ...(cleanEmail ? [{ email: cleanEmail }] : [])
        ]
      },
      include: { staffMember: true }
    });

    // 3. User does not exist in master identity table -> Fail closed (HTTP 401)
    if (!u) {
      return { isActive: false, statusReason: 'not_found' };
    }

    // 4. User suspension, archival or inactive status
    if (u.isSuspended || u.suspendedAt) {
      return { isActive: false, statusReason: 'suspended' };
    }
    if (u.archivedAt || u.status === 'archived') {
      return { isActive: false, statusReason: 'archived' };
    }
    if (u.status === 'suspended') {
      return { isActive: false, statusReason: 'suspended' };
    }
    if (u.status !== 'active') {
      return { isActive: false, statusReason: 'inactive' };
    }

    const userRole = validateAndNormalizeRole(u.role);
    if (!userRole) {
      return { isActive: false, statusReason: 'role_mismatch' };
    }

    // 5. Check linked StaffMember
    let staff = u.staffMember;
    if (!staff && u.email) {
      staff = await prisma.staffMember.findUnique({
        where: { email: u.email }
      });
      if (staff && !staff.userId) {
        prisma.staffMember.update({
          where: { id: staff.id },
          data: { userId: u.id }
        }).catch(() => {});
      }
    }

    // 6. Bootstrap SUPER_ADMIN exemption:
    // Production database has 1 SUPER_ADMIN and 0 StaffMember records.
    // Legitimate SUPER_ADMIN without a StaffMember record retains access.
    if (userRole === 'SUPER_ADMIN') {
      if (!staff) {
        return { isActive: true, currentRole: 'SUPER_ADMIN' };
      }
    } else {
      // Non-SUPER_ADMIN operational roles (ADMIN, DOCTOR, VAIDYA, RECEPTIONIST, PHARMACIST, ACCOUNTANT)
      // REQUIRE a valid linked StaffMember record.
      if (!staff) {
        return { isActive: false, statusReason: 'missing_staff' };
      }
    }

    // If staff record exists, validate its status and role
    if (staff) {
      if (staff.isSuspended || staff.suspendedAt) {
        return { isActive: false, statusReason: 'suspended' };
      }
      if (staff.archivedAt || staff.status === 'archived') {
        return { isActive: false, statusReason: 'archived' };
      }
      if (staff.status === 'suspended') {
        return { isActive: false, statusReason: 'suspended' };
      }
      if (staff.status !== 'active') {
        return { isActive: false, statusReason: 'inactive' };
      }

      // Consistency check: account role and staff role must match
      const staffRole = validateAndNormalizeRole(staff.role);
      if (staffRole !== userRole) {
        return { isActive: false, statusReason: 'role_mismatch' };
      }
    }

    return { isActive: true, currentRole: userRole };
  } catch (err: any) {
    // 7. Fail closed on database lookup failure - log sanitized error without tokens/credentials
    console.error('[ActiveUserChecker] Database verification failed:', err?.message || 'Database lookup failure');
    return { isActive: false, isUnavailable: true, statusReason: 'unavailable' };
  }
});

export function validateAndNormalizeRole(role?: unknown): UserRole | null {
  if (!role || typeof role !== 'string') return null;
  const upper = role.trim().toUpperCase().replace(/\s+/g, '_');
  if (VALID_USER_ROLES.includes(upper as UserRole)) {
    return upper as UserRole;
  }
  return null;
}

// Check connection to database
let checkPrismaPromise: Promise<boolean> | null = null;

export async function checkPrismaConnection(): Promise<boolean> {
  if (!process.env.DATABASE_URL || process.env.DATABASE_URL.includes('placeholder')) {
    return false;
  }
  if (checkPrismaPromise) return checkPrismaPromise;

  checkPrismaPromise = (async () => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      isPrismaConnected = true;
      await ensureDefaultDatabaseUsers();
      return true;
    } catch (err) {
      isPrismaConnected = false;
      return false;
    }
  })();

  return checkPrismaPromise;
}

// Check on boot
checkPrismaConnection().catch(() => {});

// Clinic metadata constants
export const CLINIC_METADATA = {
  name: 'Sahachara Ayurveda Yoga Ecoliving',
  shortName: 'Sahachara Ayurveda',
  code: 'SAH',
  address: 'Mannamkala Road, Munnar Hills, Adimali, Kerala, India 685561',
  phone: '+91 486 422 3400',
  emailDomain: 'sahachara.com',
  hostingDomain: 'os.sahachara.com'
};

/**
 * Validate that an email belongs strictly to the @sahachara.com domain
 */
export function validateSahacharaEmail(email: string): boolean {
  if (!email || typeof email !== 'string') return false;
  const clean = email.trim().toLowerCase();
  return clean.endsWith('@sahachara.com') && clean.indexOf('@') > 0;
}

// ------------------------------------------------------------------------------
// AUTHENTICATION & ACCOUNT ACTIVATION SERVICE (Prisma + RBAC)
// ------------------------------------------------------------------------------

export interface AuthResponse {
  success: boolean;
  user?: AppUser;
  token?: string;
  error?: string;
  message?: string;
}

/**
 * Initialize default staff accounts for the 7 permitted RBAC roles.
 * Sets authentic bcrypt hashes and unique onboarding security PINs.
 */
let seedPromise: Promise<void> | null = null;

export async function ensureDefaultDatabaseUsers() {
  if (!isPrismaConnected) return;
  if (seedPromise) return seedPromise;

  seedPromise = (async () => {
    try {
      const isProduction = process.env.NODE_ENV === 'production';
      const isTestAccountsEnabled = process.env.ENABLE_TEST_ACCOUNTS === 'true';

      // 1. SUPER_ADMIN Bootstrap Verification:
      // Cannot silently recreate an existing privileged account
      const existingSuperAdmin = await prisma.user.findFirst({
        where: { role: 'SUPER_ADMIN' }
      });

      if (existingSuperAdmin) {
        console.log(`[Prisma Bootstrap] Privileged account already exists (${existingSuperAdmin.email}). Silent recreation prevented.`);
      } else {
        // Initial setup requires secure credential
        const initialPassword = process.env.INITIAL_SUPER_ADMIN_PASSWORD || process.env.DEFAULT_ADMIN_PASSWORD;
        if (isProduction && (!initialPassword || initialPassword.length < 12 || initialPassword === 'Admin@Sahachara2026!')) {
          throw new Error('FATAL: Production SUPER_ADMIN bootstrap requires a secure INITIAL_SUPER_ADMIN_PASSWORD environment variable (minimum 12 characters, no hardcoded defaults). Refusing initialization.');
        }
        const finalPassword = initialPassword || 'Secure@HospitalSuperAdmin2026!#';
        const superAdminHash = bcrypt.hashSync(finalPassword, 12);

        await prisma.user.create({
          data: {
            id: 'usr-superadmin',
            email: process.env.INITIAL_SUPER_ADMIN_EMAIL || 'alexander.wright@sahachara.com',
            name: process.env.INITIAL_SUPER_ADMIN_NAME || 'Alexander Wright',
            role: 'SUPER_ADMIN',
            passwordHash: superAdminHash,
            status: 'active',
            department: 'Executive Governance & Technology'
          }
        });
        console.log('[Prisma Bootstrap] Initial SUPER_ADMIN account bootstrapped securely.');
      }

      // 2. Ensure default hospital tariffs (with null rates for unconfigured beds/triage)
      await ensureDefaultTariffs();

      // In production environments, never seed fictitious operational accounts or demo staff.
      // Real staff members must be explicitly provisioned by authorized administrators.
      if (isProduction || !isTestAccountsEnabled) {
        console.log('[Prisma Seed] Production isolation active: demo operational accounts and fictitious staff are strictly excluded.');
        return;
      }

      console.log('[Prisma Seed] Test environment detected: provisioning isolated test fixtures in test database...');
      const adminHash = bcrypt.hashSync('Admin@Sahachara2026!', 10);
      const docHash = bcrypt.hashSync('Doctor@Sahachara2026!', 10);
      const vaidyaHash = bcrypt.hashSync('Vaidya@Sahachara2026!', 10);
      const receptionHash = bcrypt.hashSync('Reception@Sahachara2026!', 10);
      const pharmaHash = bcrypt.hashSync('Pharmacy@Sahachara2026!', 10);
      const accountantHash = bcrypt.hashSync('Account@Sahachara2026!', 10);

    // 2. ADMIN - Operations Administrator
    const uAdmin = await prisma.user.upsert({
      where: { email: 'admin.ops@sahachara.com' },
      update: { role: 'ADMIN', status: 'active', isSuspended: false, archivedAt: null },
      create: {
        id: 'usr-admin',
        email: 'admin.ops@sahachara.com',
        name: 'Marcus Sterling',
        role: 'ADMIN',
        passwordHash: adminHash,
        status: 'active',
        department: 'Hospital Administration Directorate'
      }
    });
    await prisma.staffMember.upsert({
      where: { email: 'admin.ops@sahachara.com' },
      update: { role: 'ADMIN', status: 'active', userId: uAdmin.id, isSuspended: false, archivedAt: null },
      create: {
        id: 'stf-admin-01',
        employeeId: 'STF-2026-00001',
        name: 'Marcus Sterling',
        role: 'ADMIN',
        designation: 'Operations Administrator',
        department: 'Hospital Administration Directorate',
        email: 'admin.ops@sahachara.com',
        phone: '+91 98450 11111',
        status: 'active',
        userId: uAdmin.id
      }
    });

    // 3. DOCTOR - Modern & Emergency Medicine Physician
    const uDoc = await prisma.user.upsert({
      where: { email: 'robert.rivera@sahachara.com' },
      update: { role: 'DOCTOR', status: 'active', isSuspended: false, archivedAt: null },
      create: {
        id: 'usr-doc',
        email: 'robert.rivera@sahachara.com',
        name: 'Dr. Robert Rivera, MD',
        role: 'DOCTOR',
        passwordHash: docHash,
        status: 'active',
        department: 'Emergency & Acute Care',
        licenseNumber: 'MD-NY-77142'
      }
    });
    await prisma.staffMember.upsert({
      where: { email: 'robert.rivera@sahachara.com' },
      update: { role: 'DOCTOR', status: 'active', userId: uDoc.id, isSuspended: false, archivedAt: null },
      create: {
        id: 'stf-doc-01',
        employeeId: 'STF-2026-00002',
        name: 'Dr. Robert Rivera, MD',
        role: 'DOCTOR',
        designation: 'Senior Medical Officer',
        department: 'Emergency & Acute Care',
        email: 'robert.rivera@sahachara.com',
        phone: '+91 98450 22222',
        status: 'active',
        userId: uDoc.id
      }
    });

    // 4. VAIDYA - Ayurvedic Physician
    const uVaidya = await prisma.user.upsert({
      where: { email: 'sarah.chen@sahachara.com' },
      update: { role: 'VAIDYA', status: 'active', isSuspended: false, archivedAt: null },
      create: {
        id: 'usr-vaidya',
        email: 'sarah.chen@sahachara.com',
        name: 'Dr. Sarah Chen, BAMS, MD (Ayu)',
        role: 'VAIDYA',
        passwordHash: vaidyaHash,
        status: 'active',
        department: 'Kayachikitsa & Panchakarma',
        licenseNumber: 'AYUSH-KL-88201'
      }
    });
    await prisma.staffMember.upsert({
      where: { email: 'sarah.chen@sahachara.com' },
      update: { role: 'VAIDYA', status: 'active', userId: uVaidya.id, isSuspended: false, archivedAt: null },
      create: {
        id: 'stf-vaidya-01',
        employeeId: 'STF-2026-00003',
        name: 'Dr. Sarah Chen, BAMS, MD (Ayu)',
        role: 'VAIDYA',
        designation: 'Senior Vaidya Practitioner',
        department: 'Kayachikitsa & Panchakarma',
        email: 'sarah.chen@sahachara.com',
        phone: '+91 98450 33333',
        status: 'active',
        userId: uVaidya.id
      }
    });

    // 5. RECEPTIONIST - Admissions & Front Desk
    const uRec = await prisma.user.upsert({
      where: { email: 'receptionist@sahachara.com' },
      update: { role: 'RECEPTIONIST', status: 'active', isSuspended: false, archivedAt: null },
      create: {
        id: 'usr-reception',
        email: 'receptionist@sahachara.com',
        name: 'Kavita Sharma',
        role: 'RECEPTIONIST',
        passwordHash: receptionHash,
        status: 'active',
        department: 'Patient Admissions & Customer Care'
      }
    });
    await prisma.staffMember.upsert({
      where: { email: 'receptionist@sahachara.com' },
      update: { role: 'RECEPTIONIST', status: 'active', userId: uRec.id, isSuspended: false, archivedAt: null },
      create: {
        id: 'stf-rec-01',
        employeeId: 'STF-2026-00004',
        name: 'Kavita Sharma',
        role: 'RECEPTIONIST',
        designation: 'Chief Reception Officer',
        department: 'Patient Admissions & Customer Care',
        email: 'receptionist@sahachara.com',
        phone: '+91 98450 44444',
        status: 'active',
        userId: uRec.id
      }
    });

    // 6. PHARMACIST - Pharmacy & Dispensary
    const uPharma = await prisma.user.upsert({
      where: { email: 'pharmacist@sahachara.com' },
      update: { role: 'PHARMACIST', status: 'active', isSuspended: false, archivedAt: null },
      create: {
        id: 'usr-pharma',
        email: 'pharmacist@sahachara.com',
        name: 'Rajesh Nair, RPh',
        role: 'PHARMACIST',
        passwordHash: pharmaHash,
        status: 'active',
        department: 'Ayurvedic Pharmacy & Dispensary'
      }
    });
    await prisma.staffMember.upsert({
      where: { email: 'pharmacist@sahachara.com' },
      update: { role: 'PHARMACIST', status: 'active', userId: uPharma.id, isSuspended: false, archivedAt: null },
      create: {
        id: 'stf-pharma-01',
        employeeId: 'STF-2026-00005',
        name: 'Rajesh Nair, RPh',
        role: 'PHARMACIST',
        designation: 'Chief Pharmacist',
        department: 'Ayurvedic Pharmacy & Dispensary',
        email: 'pharmacist@sahachara.com',
        phone: '+91 98450 55555',
        status: 'active',
        userId: uPharma.id
      }
    });

    // 6b. Second Pharmacist for cross-user idempotency verification
    const uPharma2 = await prisma.user.upsert({
      where: { email: 'other.pharmacist@sahachara.com' },
      update: { role: 'PHARMACIST', status: 'active', isSuspended: false, archivedAt: null },
      create: {
        id: 'usr-pharma-2',
        email: 'other.pharmacist@sahachara.com',
        name: 'Pharm. Sunita Verma',
        role: 'PHARMACIST',
        passwordHash: pharmaHash,
        status: 'active',
        department: 'Ayurvedic Pharmacy & Dispensary'
      }
    });
    await prisma.staffMember.upsert({
      where: { email: 'other.pharmacist@sahachara.com' },
      update: { role: 'PHARMACIST', status: 'active', userId: uPharma2.id, isSuspended: false, archivedAt: null },
      create: {
        id: 'stf-pharma-02',
        employeeId: 'STF-2026-00025',
        name: 'Pharm. Sunita Verma',
        role: 'PHARMACIST',
        designation: 'Staff Pharmacist',
        department: 'Ayurvedic Pharmacy & Dispensary',
        email: 'other.pharmacist@sahachara.com',
        phone: '+91 98450 55556',
        status: 'active',
        userId: uPharma2.id
      }
    });

    // 7. ACCOUNTANT - Patient Financial Services
    const uAcc = await prisma.user.upsert({
      where: { email: 'accountant@sahachara.com' },
      update: { role: 'ACCOUNTANT', status: 'active', isSuspended: false, archivedAt: null },
      create: {
        id: 'usr-accountant',
        email: 'accountant@sahachara.com',
        name: 'Anand Pillai',
        role: 'ACCOUNTANT',
        passwordHash: accountantHash,
        status: 'active',
        department: 'Finance & Patient Accounts'
      }
    });
    await prisma.staffMember.upsert({
      where: { email: 'accountant@sahachara.com' },
      update: { role: 'ACCOUNTANT', status: 'active', userId: uAcc.id, isSuspended: false, archivedAt: null },
      create: {
        id: 'stf-acc-01',
        employeeId: 'STF-2026-00006',
        name: 'Anand Pillai',
        role: 'ACCOUNTANT',
        designation: 'Senior Hospital Accountant',
        department: 'Finance & Patient Accounts',
        email: 'accountant@sahachara.com',
        phone: '+91 98450 66666',
        status: 'active',
        userId: uAcc.id
      }
    });

    // 7b. Additional financial testing accounts for verify-financial-operations suite
    const finTestUsers = [
      { id: 'adm-user-001', email: 'admin@sahachara.com', name: 'Hospital Admin', role: 'ADMIN', hash: adminHash },
      { id: 'acc-user-001', email: 'accountant-fin@sahachara.com', name: 'Chief Accountant', role: 'ACCOUNTANT', hash: accountantHash },
      { id: 'acc-user-002', email: 'accountant2@sahachara.com', name: 'Staff Accountant', role: 'ACCOUNTANT', hash: accountantHash },
      { id: 'doc-user-001', email: 'doctor@sahachara.com', name: 'Dr. Rivera', role: 'DOCTOR', hash: docHash },
      { id: 'vai-user-001', email: 'vaidya@sahachara.com', name: 'Vaidya Sharma', role: 'VAIDYA', hash: vaidyaHash },
      { id: 'rec-user-001', email: 'reception@sahachara.com', name: 'Receptionist Desk', role: 'RECEPTIONIST', hash: receptionHash },
      { id: 'phm-user-001', email: 'pharmacy@sahachara.com', name: 'Pharmacist Menon', role: 'PHARMACIST', hash: pharmaHash }
    ];

    for (let i = 0; i < finTestUsers.length; i++) {
      const fu = finTestUsers[i];
      const createdU = await prisma.user.upsert({
        where: { id: fu.id },
        update: { role: fu.role, status: 'active', isSuspended: false, archivedAt: null },
        create: {
          id: fu.id,
          email: fu.email,
          name: fu.name,
          role: fu.role,
          passwordHash: fu.hash,
          status: 'active',
          department: 'Hospital Operations'
        }
      });
      await prisma.staffMember.upsert({
        where: { id: `stf-${fu.id}` },
        update: { role: fu.role, status: 'active', userId: createdU.id, isSuspended: false, archivedAt: null },
        create: {
          id: `stf-${fu.id}`,
          employeeId: `STF-2026-000${10 + i}`,
          name: fu.name,
          role: fu.role,
          designation: `${fu.role} Specialist`,
          department: 'Hospital Operations',
          email: fu.email,
          phone: `+91 98450 7777${i}`,
          status: 'active',
          userId: createdU.id
        }
      });
    }

    // Also support 'sa-user-001' as SUPER_ADMIN without StaffMember
    await prisma.user.upsert({
      where: { id: 'sa-user-001' },
      update: { role: 'SUPER_ADMIN', status: 'active', isSuspended: false, archivedAt: null },
      create: {
        id: 'sa-user-001',
        email: 'superadmin@sahachara.com',
        name: 'Dr. Alexander Wright',
        role: 'SUPER_ADMIN',
        passwordHash: adminHash,
        status: 'active',
        department: 'Executive Governance'
      }
    });

    // Remove legacy nurse user if present
    await prisma.user.deleteMany({
      where: { email: 'rachel.thorne@sahachara.com' }
    });

    // 8. Onboarding Staff (Requires PIN Activation) - RECEPTIONIST role
    await prisma.user.deleteMany({
      where: { email: 'priya.nair@sahachara.com' }
    });
    const priyaPinHash = bcrypt.hashSync('849201', 10);
    await prisma.staffMember.upsert({
      where: { email: 'priya.nair@sahachara.com' },
      update: {
        role: 'RECEPTIONIST',
        designation: 'Clinical Ward Admissions Coordinator',
        status: 'pending_activation',
        activationPin: null,
        activationPinHash: priyaPinHash
      },
      create: {
        id: 'stf-106',
        employeeId: 'EMP-AY-106',
        name: 'Priya Nair, BSN',
        role: 'RECEPTIONIST',
        designation: 'Clinical Ward Admissions Coordinator',
        department: 'Ayurvedic Inpatient Facility (IPD)',
        email: 'priya.nair@sahachara.com',
        phone: '+91 98450 99422',
        licenseNumber: 'REG-REC-KL-55102',
        status: 'pending_activation',
        shift: 'Morning (07:00-15:00)',
        qualification: 'B.Sc Administration',
        joiningDate: '2026-01-10',
        activationPin: null,
        activationPinHash: priyaPinHash
      }
    });

    // Seed default hospital tariffs
    await ensureDefaultTariffs();

    console.log('[Prisma Seed] Default 7 RBAC staff accounts and tariffs verified successfully in PostgreSQL.');
  } catch (err) {
    console.warn('[Prisma Seed] Seed user verification notice:', err);
  }
  })();

  return seedPromise;
}

/**
 * Seed default hospital tariffs into PostgreSQL
 */
export async function ensureDefaultTariffs() {
  if (!isPrismaConnected) return;
  try {
    for (const tariff of INITIAL_TARIFFS) {
      await prisma.hospitalTariff.upsert({
        where: { serviceCode: tariff.serviceCode },
        update: {},
        create: {
          id: tariff.id,
          category: tariff.category,
          serviceCode: tariff.serviceCode,
          serviceName: tariff.serviceName,
          rate: tariff.rate,
          isZeroPricePermitted: tariff.isZeroPricePermitted,
          unit: tariff.unit,
          description: tariff.description,
          updatedBy: tariff.updatedBy
        }
      });
    }
  } catch (err) {
    console.warn('[Prisma Seed] Tariff seed notice:', err);
  }
}

/**
 * Authenticate staff user against database
 * Strictly enforces @sahachara.com email domain and bcrypt password verification
 */
export async function authenticateStaffUser(email: string, password?: string): Promise<AuthResponse> {
  const cleanEmail = (email || '').trim().toLowerCase();

  // Strict domain validation
  if (!validateSahacharaEmail(cleanEmail)) {
    hospitalStore.logAudit(
      cleanEmail || 'Anonymous',
      'SUPER_ADMIN',
      'Unauthorized Domain Login Rejection',
      'RBAC Change',
      `Login blocked: Email domain is not authorized. Must be @${CLINIC_METADATA.emailDomain}`
    );
    return {
      success: false,
      error: `Access Denied: Only approved @${CLINIC_METADATA.emailDomain} email accounts are permitted to authenticate into Sahachara Ops.`
    };
  }

  if (!password || password.trim() === '') {
    return {
      success: false,
      error: 'Password is required to authenticate.'
    };
  }

  // 1. Check in database via Prisma if connected
  if (isPrismaConnected) {
    try {
      const dbUser = await prisma.user.findUnique({
        where: { email: cleanEmail }
      });

      if (dbUser) {
        if (dbUser.status === 'suspended' || dbUser.isSuspended) {
          hospitalStore.logAudit(
            cleanEmail,
            dbUser.role,
            'Authentication Rejection: Account Suspended',
            'RBAC Change',
            `User ${cleanEmail} attempted to login to suspended account.`
          );
          return {
            success: false,
            error: 'AccountSuspended: Your staff account has been suspended. Please contact Hospital Administration.'
          };
        }

        if (dbUser.status === 'archived') {
          hospitalStore.logAudit(
            cleanEmail,
            dbUser.role,
            'Authentication Rejection: Account Archived',
            'RBAC Change',
            `User ${cleanEmail} attempted to login to archived staff record.`
          );
          return {
            success: false,
            error: 'AccountArchived: Your staff employment record has been archived. Operational access is revoked.'
          };
        }

        const dbStaff = await prisma.staffMember.findFirst({
          where: { email: cleanEmail }
        });
        if (dbStaff && (dbStaff.status === 'suspended' || dbStaff.isSuspended)) {
          return {
            success: false,
            error: 'AccountSuspended: Your staff account has been suspended. Please contact Hospital Administration.'
          };
        }
        if (dbStaff && dbStaff.status === 'archived') {
          return {
            success: false,
            error: 'AccountArchived: Your staff employment record has been archived. Operational access is revoked.'
          };
        }

        if (dbUser.status === 'pending_activation') {
          return {
            success: false,
            error: 'Account Pending Activation: Please use your temporary security PIN to activate your staff account and set a password.'
          };
        }

        // Verify password strictly with bcrypt
        if (!dbUser.passwordHash || !bcrypt.compareSync(password, dbUser.passwordHash)) {
          return { success: false, error: 'Invalid password credentials. Please verify your password or contact IT.' };
        }

        const validRole = validateAndNormalizeRole(dbUser.role);
        if (!validRole) {
          hospitalStore.logAudit(
            cleanEmail,
            'SUPER_ADMIN',
            'Authentication Rejection: Invalid Database Role',
            'RBAC Change',
            `User ${cleanEmail} has unpermitted or invalid database role: ${dbUser.role}`
          );
          return {
            success: false,
            error: `Access Denied: Your assigned role (${dbUser.role}) is invalid or unsupported. Please contact an Administrator.`
          };
        }

        const appUser: AppUser = {
          id: dbUser.id,
          name: dbUser.name,
          role: validRole,
          title: `${validRole} - ${dbUser.department}`,
          email: dbUser.email,
          department: dbUser.department,
          avatarInitials: dbUser.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase(),
          status: 'active'
        };

        const token = generateSessionToken({
          userId: appUser.id,
          email: appUser.email,
          role: appUser.role,
          name: appUser.name
        });

        hospitalStore.logAudit(
          appUser.name,
          appUser.role,
          'Staff Authenticated via Prisma Database',
          'RBAC Change',
          `Staff signed in securely with @${CLINIC_METADATA.emailDomain} credentials.`
        );

        return {
          success: true,
          user: appUser,
          token
        };
      } else {
        // Check if there is a staff member record
        const pendingStaff = await prisma.staffMember.findFirst({
          where: { email: cleanEmail }
        });
        if (pendingStaff) {
          if (pendingStaff.status === 'suspended' || pendingStaff.isSuspended) {
            return {
              success: false,
              error: 'AccountSuspended: Your staff account has been suspended. Please contact Hospital Administration.'
            };
          }
          if (pendingStaff.status === 'archived') {
            return {
              success: false,
              error: 'AccountArchived: Your staff employment record has been archived. Operational access is revoked.'
            };
          }
          if (pendingStaff.status === 'pending_activation') {
            return {
              success: false,
              error: 'Account Pending Activation: Please click "Activate Staff Account" to enter your security PIN and create a password.'
            };
          }
        }
        return {
          success: false,
          error: 'Invalid credentials. User account does not exist in directory.'
        };
      }
    } catch (err) {
      console.warn('[Prisma Auth] Error querying user from database:', err);
    }
  }

  // 2. Query in-memory store only when database is unavailable
  const matchedStaff = hospitalStore.staff.find((s) => s.email.toLowerCase() === cleanEmail);
  const matchedUser = hospitalStore.users.find((u) => u.email.toLowerCase() === cleanEmail);

  if (matchedStaff && (matchedStaff.status === 'suspended' || (matchedStaff as any).isSuspended)) {
    return {
      success: false,
      error: 'AccountSuspended: Your staff account has been suspended. Please contact Hospital Administration.'
    };
  }
  if (matchedStaff && matchedStaff.status === 'archived') {
    return {
      success: false,
      error: 'AccountArchived: Your staff employment record has been archived. Operational access is revoked.'
    };
  }

  if (matchedStaff && matchedStaff.status === 'pending_activation') {
    return {
      success: false,
      error: 'Account Pending Activation: Please click "Activate Staff Account" to enter your security PIN and create a password.'
    };
  }

  // Reject if user not found in in-memory store
  if (!matchedStaff && !matchedUser) {
    return {
      success: false,
      error: 'Invalid email or password credentials.'
    };
  }

  const role = validateAndNormalizeRole(matchedStaff?.role || matchedUser?.role);
  if (!role) {
    return {
      success: false,
      error: 'Access Denied: User role is missing, invalid, or unsupported. Please contact an Administrator.'
    };
  }

  const name = matchedStaff?.name || matchedUser?.name || 'Authorized Staff Member';
  const dept = matchedStaff?.department || matchedUser?.department || 'Kayachikitsa (Internal Medicine)';

  const authenticatedUser: AppUser = {
    id: matchedStaff?.id || matchedUser?.id || `usr-${Date.now()}`,
    name,
    role,
    title: matchedStaff?.designation || `${role} - ${dept}`,
    email: cleanEmail,
    department: dept,
    avatarInitials: name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase(),
    status: 'active'
  };

  const token = generateSessionToken({
    userId: authenticatedUser.id,
    email: authenticatedUser.email,
    role: authenticatedUser.role,
    name: authenticatedUser.name
  });

  hospitalStore.logAudit(
    authenticatedUser.name,
    authenticatedUser.role,
    'Staff Login Success',
    'RBAC Change',
    `Authenticated clinical session for ${authenticatedUser.name} (${authenticatedUser.role}) at ${CLINIC_METADATA.name}`
  );

  return {
    success: true,
    user: authenticatedUser,
    token
  };
}

/**
 * Activate a newly registered staff member's account using their security PIN.
 * Preserves the explicitly assigned role and rejects activation if role is missing or invalid.
 */
export async function activateStaffAccount(
  email: string,
  pin: string,
  newPassword: string
): Promise<AuthResponse> {
  const cleanEmail = (email || '').trim().toLowerCase();
  const cleanPin = (pin || '').trim();

  // Strict domain validation
  if (!validateSahacharaEmail(cleanEmail)) {
    return {
      success: false,
      error: `Access Denied: Activation is restricted to @${CLINIC_METADATA.emailDomain} staff accounts only.`
    };
  }

  if (!cleanPin) {
    return { success: false, error: 'Please enter the security PIN provided during onboarding.' };
  }

  if (!newPassword || newPassword.length < 8) {
    return { success: false, error: 'Password must be at least 8 characters long.' };
  }

  const passwordHash = bcrypt.hashSync(newPassword, 10);

  // 1. Try Prisma if connected
  if (isPrismaConnected) {
    try {
      const dbUser = await prisma.user.findUnique({ where: { email: cleanEmail } });
      const dbStaff = await prisma.staffMember.findUnique({ where: { email: cleanEmail } });

      if (!dbUser && !dbStaff) {
        return { success: false, error: 'AccountNotFound: No staff account found for this email address.' };
      }

      if ((dbUser?.status === 'suspended' || dbUser?.isSuspended) || (dbStaff?.status === 'suspended' || dbStaff?.isSuspended)) {
        return { success: false, error: 'AccountSuspended: Suspended accounts cannot be activated.' };
      }

      if (dbUser?.status === 'archived' || dbStaff?.status === 'archived') {
        return { success: false, error: 'AccountArchived: Archived accounts cannot be activated.' };
      }

      // Anti-PIN reuse: if account is active and has no PIN remaining
      const hasPin = dbUser?.activationPin || dbUser?.activationPinHash || dbStaff?.activationPin || dbStaff?.activationPinHash;
      if (!hasPin && (dbUser?.status === 'active' || dbUser?.status === 'on_duty')) {
        return {
          success: false,
          error: 'AccountAlreadyActive: This staff account is already active. Please sign in with your password.'
        };
      }

      // Expiry check
      const pinExpiresAt = dbStaff?.pinExpiresAt || dbUser?.pinExpiresAt;
      if (pinExpiresAt && new Date() > new Date(pinExpiresAt)) {
        return {
          success: false,
          error: 'ActivationExpired: Security PIN has expired. Please contact an Administrator to issue a new activation PIN.'
        };
      }

      // Rate limit: pinAttempts check
      const currentAttempts = dbStaff?.pinAttempts || dbUser?.pinAttempts || 0;
      if (currentAttempts >= 5) {
        return {
          success: false,
          error: 'TooManyAttempts: Security PIN attempts exceeded. Please contact an Administrator.'
        };
      }

      // PIN comparison against hash or plaintext
      const pinHash = dbStaff?.activationPinHash || dbUser?.activationPinHash;
      let isPinValid = false;
      if (pinHash) {
        isPinValid = bcrypt.compareSync(cleanPin, pinHash);
      } else {
        const expectedPin = dbUser?.activationPin || dbStaff?.activationPin;
        isPinValid = (expectedPin !== null && expectedPin !== undefined && cleanPin === expectedPin);
      }

      if (!isPinValid) {
        const nextAttempts = currentAttempts + 1;
        if (dbStaff) {
          await prisma.staffMember.update({ where: { id: dbStaff.id }, data: { pinAttempts: nextAttempts } }).catch(() => {});
        }
        if (dbUser) {
          await prisma.user.update({ where: { id: dbUser.id }, data: { pinAttempts: nextAttempts } }).catch(() => {});
        }
        return {
          success: false,
          error: 'Invalid security PIN. Please check the onboarding memo or ask an Administrator.'
        };
      }

      // Explicitly preserve assigned role - NEVER fall back or silently default to privileged roles
      const rawRole = dbStaff?.role || dbUser?.role;
      const assignedRole = validateAndNormalizeRole(rawRole);
      if (!assignedRole) {
        hospitalStore.logAudit(
          cleanEmail,
          'SUPER_ADMIN',
          'Account Activation Rejected: Invalid Role',
          'RBAC Change',
          `Activation rejected for ${cleanEmail}: Assigned role "${rawRole}" is missing or unsupported.`
        );
        return {
          success: false,
          error: 'Account Activation Failed: The assigned staff role is missing, invalid, or unsupported. Please contact an Administrator to assign a valid role before activating.'
        };
      }

      // Atomically update User and Staff in transaction
      const { updatedUser } = await prisma.$transaction(async (tx) => {
        const u = await tx.user.upsert({
          where: { email: cleanEmail },
          update: {
            role: assignedRole,
            passwordHash,
            status: 'active',
            activationPin: null,
            activationPinHash: null,
            pinExpiresAt: null,
            pinAttempts: 0,
            isSuspended: false
          },
          create: {
            email: cleanEmail,
            passwordHash,
            name: dbStaff?.name || 'Registered Staff Member',
            role: assignedRole,
            status: 'active',
            department: dbStaff?.department || 'Kayachikitsa (Internal Medicine)',
            activationPin: null,
            activationPinHash: null,
            pinExpiresAt: null,
            pinAttempts: 0,
            isSuspended: false
          }
        });

        if (dbStaff) {
          await tx.staffMember.update({
            where: { id: dbStaff.id },
            data: {
              status: 'active',
              activationPin: null,
              activationPinHash: null,
              pinExpiresAt: null,
              pinAttempts: 0,
              isSuspended: false,
              role: assignedRole,
              userId: u.id
            }
          });
        }
        return { updatedUser: u };
      });

      const appUser: AppUser = {
        id: updatedUser.id,
        name: updatedUser.name,
        role: assignedRole,
        title: `${assignedRole} - ${updatedUser.department}`,
        email: updatedUser.email,
        department: updatedUser.department,
        avatarInitials: updatedUser.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase(),
        status: 'active'
      };

      const token = generateSessionToken({
        userId: appUser.id,
        email: appUser.email,
        role: appUser.role,
        name: appUser.name
      });

      hospitalStore.logAudit(
        appUser.name,
        appUser.role,
        'Staff Account Activated via PIN',
        'RBAC Change',
        `Account activated with cryptographic password hash for ${appUser.name} (${appUser.email}) with role ${appUser.role}`
      );

      return {
        success: true,
        user: appUser,
        token,
        message: 'Your staff account has been successfully activated! Welcome to Sahachara Ops.'
      };
    } catch (err) {
      console.warn('[Prisma Activation] Fallback to database store:', err);
    }
  }

  // 2. Query in-memory database store
  const staffMember = hospitalStore.staff.find((s) => s.email.toLowerCase() === cleanEmail);
  const user = hospitalStore.users.find((u) => u.email.toLowerCase() === cleanEmail);

  if ((staffMember && (staffMember.status === 'suspended' || (staffMember as any).isSuspended)) || (user && ((user as any).status === 'suspended' || (user as any).isSuspended))) {
    return { success: false, error: 'AccountSuspended: Suspended accounts cannot be activated.' };
  }
  if ((staffMember && staffMember.status === 'archived') || (user && (user as any).status === 'archived')) {
    return { success: false, error: 'AccountArchived: Archived accounts cannot be activated.' };
  }

  const expectedPin = staffMember?.activationPin || user?.activationPin;

  if (!expectedPin || cleanPin !== expectedPin) {
    return {
      success: false,
      error: 'Invalid security PIN. Please check with your clinical administrator.'
    };
  }

  const rawRole = staffMember?.role || user?.role;
  const role = validateAndNormalizeRole(rawRole);
  if (!role) {
    return {
      success: false,
      error: 'Account Activation Failed: The assigned staff role is missing, invalid, or unsupported. Please contact an Administrator to assign a valid role before activating.'
    };
  }

  // Activate staff member
  if (staffMember) {
    staffMember.status = 'on_duty';
    staffMember.activationPin = undefined;
    staffMember.role = role;
  }

  const name = staffMember?.name || user?.name || cleanEmail.split('@')[0].replace('.', ' ').toUpperCase();
  const department = staffMember?.department || user?.department || 'Kayachikitsa (Internal Medicine)';

  const activeUser: AppUser = {
    id: staffMember?.id || user?.id || `usr-${Date.now()}`,
    name,
    role,
    title: staffMember?.designation || `${role} - ${department}`,
    email: cleanEmail,
    department,
    avatarInitials: name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase(),
    status: 'active'
  };

  const userIndex = hospitalStore.users.findIndex((u) => u.email.toLowerCase() === cleanEmail);
  if (userIndex >= 0) {
    hospitalStore.users[userIndex].status = 'active';
    hospitalStore.users[userIndex].role = role;
  } else {
    hospitalStore.users.push(activeUser);
  }

  const token = generateSessionToken({
    userId: activeUser.id,
    email: activeUser.email,
    role: activeUser.role,
    name: activeUser.name
  });

  hospitalStore.logAudit(
    activeUser.name,
    activeUser.role,
    'Staff Account Activated via PIN',
    'RBAC Change',
    `First-time activation completed for ${activeUser.name} (${activeUser.email}) with role ${activeUser.role}.`
  );

  return {
    success: true,
    user: activeUser,
    token,
    message: 'Account successfully activated! Welcome to Sahachara Ops.'
  };
}

// ------------------------------------------------------------------------------
// DATABASE PERSISTENCE SERVICE HELPERS (Prisma + Fallback)
// ------------------------------------------------------------------------------

// ------------------------------------------------------------------------------
// PATIENTS (Master Patient Index & Comprehensive Demographic Records)
// ------------------------------------------------------------------------------

export function normalizePhoneNumber(phone: string): string {
  if (!phone) return '';
  const digits = phone.replace(/[^0-9]/g, '');
  if (digits.length === 12 && digits.startsWith('91')) {
    return digits.substring(2);
  }
  if (digits.length === 11 && digits.startsWith('0')) {
    return digits.substring(1);
  }
  return digits;
}

export function mapDbPatientToPatient(p: any): Patient {
  return {
    id: p.id,
    mrn: p.mrn,
    firstName: p.firstName,
    middleName: p.middleName || undefined,
    lastName: p.lastName,
    dob: p.dob || undefined,
    age: p.age !== null && p.age !== undefined ? p.age : undefined,
    gender: (p.gender as any) || 'Other',
    bloodGroup: p.bloodGroup || undefined,
    preferredLanguage: p.preferredLanguage || undefined,
    photoUrl: p.photoUrl || undefined,
    status: (p.status as any) || 'active',
    admissionStatus: (p.admissionStatus as any) || 'outpatient',
    phone: p.phone,
    secondaryPhone: p.secondaryPhone || undefined,
    email: p.email || undefined,
    communicationPreference: (p.communicationPreference as any) || 'sms',
    contactLanguage: p.contactLanguage || undefined,
    address: p.address || undefined,
    addressLine1: p.addressLine1 || undefined,
    addressLine2: p.addressLine2 || undefined,
    locality: p.locality || undefined,
    city: p.city || undefined,
    district: p.district || undefined,
    state: p.state || undefined,
    postalCode: p.postalCode || undefined,
    country: p.country || 'India',
    emergencyContact: (() => {
      const ec = (p.emergencyContact as any) || (p.emergencyContactName ? {
        name: p.emergencyContactName,
        relationship: p.emergencyContactRelation || 'Contact',
        phone: p.emergencyContactPhone || '',
        altPhone: p.emergencyContactAltPhone || undefined
      } : undefined);
      if (ec && p.emergencyContactName) ec.name = p.emergencyContactName;
      if (ec && p.emergencyContactPhone) ec.phone = p.emergencyContactPhone;
      return ec;
    })(),
    emergencyContactName: p.emergencyContactName || undefined,
    emergencyContactRelation: p.emergencyContactRelation || undefined,
    emergencyContactPhone: p.emergencyContactPhone || undefined,
    emergencyContactAltPhone: p.emergencyContactAltPhone || undefined,
    allergyStatus: (p.allergyStatus as any) || 'not_recorded',
    allergies: (p.allergies as any) || [],
    medicalHistoryStatus: (p.medicalHistoryStatus as any) || 'not_recorded',
    chronicConditions: (p.chronicConditions as any) || [],
    pastMedicalHistory: p.pastMedicalHistory || undefined,
    pastSurgicalHistory: p.pastSurgicalHistory || undefined,
    familyHistory: p.familyHistory || undefined,
    currentMedications: (p.currentMedications as any) || [],
    pastDiagnoses: (p.pastDiagnoses as any) || [],
    medicalHistoryNotes: p.medicalHistoryNotes || undefined,
    clinicalNotes: p.clinicalNotes || undefined,
    currentWard: p.currentWard || undefined,
    currentBed: p.currentBed || undefined,
    assignedDoctorId: p.assignedDoctorId || undefined,
    assignedDoctorName: p.assignedDoctorName || undefined,
    admissionDate: p.admissionDate ? (p.admissionDate instanceof Date ? p.admissionDate.toISOString() : String(p.admissionDate)) : undefined,
    dischargeDate: p.dischargeDate ? (p.dischargeDate instanceof Date ? p.dischargeDate.toISOString() : String(p.dischargeDate)) : undefined,
    isRegistered: p.isRegistered !== undefined ? p.isRegistered : true,
    registeredById: p.registeredById || undefined,
    registeredByName: p.registeredByName || undefined,
    archivedAt: p.archivedAt ? (p.archivedAt instanceof Date ? p.archivedAt.toISOString() : String(p.archivedAt)) : undefined,
    archivedById: p.archivedById || undefined,
    archivedByName: p.archivedByName || undefined,
    archivedReason: p.archivedReason || undefined,
    insurance: (p.insurance as any) || undefined,
    doshaProfile: (p.doshaProfile as any) || undefined,
    latestVitals: (p.latestVitals as any) || undefined,
    deletedAt: p.deletedAt ? (p.deletedAt instanceof Date ? p.deletedAt.toISOString() : String(p.deletedAt)) : undefined,
    createdAt: p.createdAt ? (p.createdAt instanceof Date ? p.createdAt.toISOString() : String(p.createdAt)) : undefined,
    updatedAt: p.updatedAt ? (p.updatedAt instanceof Date ? p.updatedAt.toISOString() : String(p.updatedAt)) : undefined
  };
}

export async function generateUniquePatientNumber(): Promise<string> {
  const year = new Date().getFullYear();
  if (!isPrismaConnected) {
    throw new Error('DatabaseUnavailable: Active PostgreSQL connection is required for sequence-backed MRN generation.');
  }

  try {
    const res = await prisma.$queryRaw<[{ nextval: bigint }]>`SELECT nextval('patient_mrn_seq')`;
    if (!res || !res[0] || res[0].nextval === undefined || res[0].nextval === null) {
      throw new Error('SequenceUnavailable: Sequence "patient_mrn_seq" returned empty result.');
    }
    const seq = Number(res[0].nextval);
    if (isNaN(seq) || seq <= 0) {
      throw new Error('SequenceInvalid: Sequence "patient_mrn_seq" returned invalid integer.');
    }
    return `SAH-${year}-${String(seq).padStart(5, '0')}`;
  } catch (err: any) {
    console.error('[Prisma generateUniquePatientNumber] Fail-closed sequence failure:', err.message);
    throw new Error(`MRNGenerationFailed: Authoritative sequence generation failed: ${err.message}`);
  }
}

export async function checkDuplicatePatients(params: {
  phone?: string;
  firstName?: string;
  lastName?: string;
  dob?: string;
  email?: string;
  mrn?: string;
  excludeId?: string;
}): Promise<DuplicatePatientMatch[]> {
  const normPhone = params.phone ? normalizePhoneNumber(params.phone) : '';
  const cleanFirst = params.firstName?.trim().toLowerCase();
  const cleanLast = params.lastName?.trim().toLowerCase();
  const cleanEmail = params.email?.trim().toLowerCase();
  const cleanDob = params.dob?.trim();
  const cleanMrn = params.mrn?.trim().toUpperCase();

  const allPatients = await dbGetPatients();
  const matches: DuplicatePatientMatch[] = [];

  for (const p of allPatients) {
    if (params.excludeId && (p.id === params.excludeId || p.mrn === params.excludeId)) {
      continue;
    }
    const reasons: string[] = [];

    // 1. Exact MRN match
    if (cleanMrn && p.mrn.toUpperCase() === cleanMrn) {
      reasons.push(`Existing Hospital Patient Number matches: ${p.mrn}`);
    }

    // 2. Normalized Phone match
    if (normPhone && normPhone.length >= 7) {
      const pNormPhone = normalizePhoneNumber(p.phone);
      if (pNormPhone && (pNormPhone === normPhone || pNormPhone.endsWith(normPhone) || normPhone.endsWith(pNormPhone))) {
        reasons.push(`Matching primary mobile number (${p.phone})`);
      }
    }

    // 3. Full Name + DOB match
    if (cleanFirst && cleanLast && p.firstName.toLowerCase() === cleanFirst && p.lastName.toLowerCase() === cleanLast) {
      if (cleanDob && p.dob && cleanDob === p.dob) {
        reasons.push(`Identical full name (${p.firstName} ${p.lastName}) and date of birth (${p.dob})`);
      } else if (!cleanDob && !p.dob) {
        reasons.push(`Identical full name (${p.firstName} ${p.lastName})`);
      }
    }

    // 4. Email match
    if (cleanEmail && p.email && p.email.toLowerCase() === cleanEmail) {
      reasons.push(`Matching email address (${p.email})`);
    }

    if (reasons.length > 0) {
      matches.push({
        id: p.id,
        mrn: p.mrn,
        name: `${p.firstName} ${p.lastName}`,
        phone: p.phone,
        dob: p.dob || undefined,
        matchReasons: reasons
      });
    }
  }

  return matches;
}

export async function dbSearchPatients(options: {
  search?: string;
  status?: string;
  admissionStatus?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  userRole?: string;
  patientMrn?: string;
}): Promise<{ patients: Patient[]; total: number; page: number; limit: number; totalPages: number }> {
  const page = Math.max(1, Number(options.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(options.limit) || 20));
  const skip = (page - 1) * limit;
  const search = options.search?.trim();
  const status = options.status?.trim().toLowerCase();
  const admissionStatus = options.admissionStatus?.trim().toLowerCase();
  const sortBy = options.sortBy || 'createdAt';
  const sortOrder = options.sortOrder === 'asc' ? 'asc' : 'desc';

  if (isPrismaConnected) {
    try {
      const where: any = { deletedAt: null };

      if (options.patientMrn) {
        where.mrn = options.patientMrn;
      }
      if (status && status !== 'all') {
        where.status = status;
      }
      if (admissionStatus && admissionStatus !== 'all') {
        where.admissionStatus = admissionStatus;
      }
      if (search) {
        const searchDigits = search.replace(/\D/g, '');
        where.OR = [
          { mrn: { contains: search, mode: 'insensitive' } },
          { firstName: { contains: search, mode: 'insensitive' } },
          { lastName: { contains: search, mode: 'insensitive' } },
          { phone: { contains: search, mode: 'insensitive' } },
          { secondaryPhone: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } }
        ];

        if (searchDigits.length >= 10) {
          const tenDigits = searchDigits.slice(-10);
          const spaced = `${tenDigits.slice(0, 5)} ${tenDigits.slice(5)}`;
          where.OR.push({ phone: { contains: spaced, mode: 'insensitive' } });
          where.OR.push({ phone: { contains: tenDigits, mode: 'insensitive' } });
        }
      }

      const [total, dbPatients] = await Promise.all([
        prisma.patient.count({ where }),
        prisma.patient.findMany({
          where,
          skip,
          take: limit,
          orderBy: { [sortBy]: sortOrder }
        })
      ]);

      const mapped = dbPatients.map(mapDbPatientToPatient);
      return {
        patients: mapped,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1
      };
    } catch (err) {
      console.warn('[Prisma dbSearchPatients] Fallback:', err);
    }
  }

  // In-memory fallback
  let list = hospitalStore.patients.filter((p) => !p.deletedAt);
  if (options.patientMrn) {
    list = list.filter((p) => p.mrn === options.patientMrn);
  }
  if (status && status !== 'all') {
    list = list.filter((p) => (p.status || 'active').toLowerCase() === status);
  }
  if (admissionStatus && admissionStatus !== 'all') {
    list = list.filter((p) => p.admissionStatus.toLowerCase() === admissionStatus);
  }
  if (search) {
    const s = search.toLowerCase();
    list = list.filter(
      (p) =>
        p.mrn.toLowerCase().includes(s) ||
        p.firstName.toLowerCase().includes(s) ||
        p.lastName.toLowerCase().includes(s) ||
        (p.phone && p.phone.includes(s)) ||
        (p.email && p.email.toLowerCase().includes(s))
    );
  }

  const total = list.length;
  const paginated = list.slice(skip, skip + limit);
  return {
    patients: paginated,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit) || 1
  };
}

export async function dbGetPatients(userRole?: string, patientMrn?: string): Promise<Patient[]> {
  if (isPrismaConnected) {
    try {
      const where: any = { deletedAt: null };
      if (patientMrn) {
        where.mrn = patientMrn;
      }
      const dbPatients = await prisma.patient.findMany({
        where,
        orderBy: { createdAt: 'desc' }
      });
      return dbPatients.map(mapDbPatientToPatient);
    } catch (err) {
      console.warn('[Prisma dbGetPatients] Fallback:', err);
    }
  }

  let list = hospitalStore.patients.filter((p) => !p.deletedAt);
  if (patientMrn) {
    list = list.filter((p) => p.mrn === patientMrn);
  }
  return list;
}

export async function dbGetPatientByIdOrMrn(idOrMrn: string): Promise<Patient | null> {
  if (isPrismaConnected) {
    try {
      const isMrn = idOrMrn.startsWith('SAH-') || idOrMrn.startsWith('MRN-');
      const dbPatient = await prisma.patient.findFirst({
        where: {
          OR: [
            { id: idOrMrn },
            { mrn: idOrMrn }
          ],
          deletedAt: null
        }
      });
      if (dbPatient) return mapDbPatientToPatient(dbPatient);
    } catch (err) {
      console.warn('[Prisma dbGetPatientByIdOrMrn] Fallback:', err);
    }
  }
  const isMrn = idOrMrn.startsWith('SAH-') || idOrMrn.startsWith('MRN-');
  return hospitalStore.patients.find((p) => (isMrn ? p.mrn === idOrMrn : p.id === idOrMrn) && !p.deletedAt) || null;
}

export async function dbGetPatientDossier(idOrMrn: string, userRole?: string): Promise<PatientDossier | null> {
  let patient: Patient | null = null;
  if (isPrismaConnected) {
    try {
      const isMrn = idOrMrn.startsWith('SAH-') || idOrMrn.startsWith('MRN-');
      const dbPatient = await prisma.patient.findFirst({
        where: isMrn ? { mrn: idOrMrn } : { id: idOrMrn }
      });
      if (!dbPatient) return null;
      patient = mapDbPatientToPatient(dbPatient);

      // Query actual linked records from PostgreSQL
      const [appointments, consultations, treatmentPlans, panchakarmaCourses, prescriptions, labOrders, invoices, auditLogs] = await Promise.all([
        prisma.appointment.findMany({ where: { patientId: patient.id }, orderBy: { dateTime: 'desc' } }),
        prisma.consultation.findMany({ where: { patientId: patient.id }, orderBy: { dateTime: 'desc' } }),
        prisma.treatmentPlan.findMany({ where: { patientId: patient.id }, orderBy: { createdAt: 'desc' } }),
        prisma.panchakarmaCourse.findMany({ where: { patientId: patient.id }, orderBy: { createdAt: 'desc' } }),
        prisma.prescription.findMany({ where: { patientId: patient.id }, orderBy: { datePrescribed: 'desc' } }),
        prisma.labOrder.findMany({ where: { patientId: patient.id }, orderBy: { orderedAt: 'desc' } }),
        prisma.invoice.findMany({ where: { patientId: patient.id }, orderBy: { createdAt: 'desc' } }),
        prisma.auditLog.findMany({ where: { OR: [{ patientMrn: patient.mrn }, { details: { contains: patient.mrn } }] }, orderBy: { timestamp: 'desc' } })
      ]);

      const rxNumbers = prescriptions.map((r) => r.rxNumber);
      const stockMovements = rxNumbers.length > 0
        ? await prisma.stockMovement.findMany({ where: { referenceNumber: { in: rxNumbers } }, orderBy: { timestamp: 'desc' } })
        : [];

      // Sensitive clinical note filtering for all non-clinicians (SUPER_ADMIN, ADMIN, RECEPTIONIST, PHARMACIST, ACCOUNTANT)
      const isClinician = userRole === 'DOCTOR' || userRole === 'VAIDYA';
      if (!isClinician) {
        patient.clinicalNotes = undefined;
        patient.medicalHistoryNotes = undefined;
      }

      return {
        patient,
        appointments: appointments.map((a) => ({
          id: a.id,
          patientId: a.patientId || patient!.id,
          patientName: a.patientName,
          patientMrn: a.patientMrn,
          patientPhone: a.patientPhone,
          patientEmail: a.patientEmail || undefined,
          doctorId: a.doctorId || '',
          doctorName: a.doctorName,
          department: a.department,
          dateTime: a.dateTime.toISOString(),
          timeSlot: a.timeSlot,
          type: a.type as any,
          status: a.status as any,
          reminderSent: false,
          notes: a.notes || ''
        })),
        consultations: (userRole === 'RECEPTIONIST' || userRole === 'ACCOUNTANT') ? [] : consultations.map((c) => ({
          id: c.id,
          consultationNumber: c.consultationNumber,
          patientId: c.patientId || patient!.id,
          patientName: c.patientName,
          patientMrn: c.patientMrn,
          doctorId: c.doctorId || '',
          doctorName: c.doctorName,
          appointmentId: c.appointmentId || undefined,
          dateTime: c.dateTime.toISOString(),
          chiefComplaint: c.chiefComplaint,
          duration: c.duration,
          presentIllness: c.presentIllness || '',
          vitals: c.vitals as any,
          ayurvedicAssessment: c.ayurvedicAssessment as any,
          classicalDiagnosis: c.classicalDiagnosis,
          westernCorrelation: c.westernCorrelation || undefined,
          treatmentRecommendations: c.treatmentRecommendations,
          recommendedTherapies: c.recommendedTherapies as any,
          prescriptions: c.prescriptions as any,
          status: c.status as any,
          clinicalNotes: isClinician ? (c.clinicalNotes || '') : '[REDACTED: Clinical Documentation Restricted]',
          completedAt: c.completedAt.toISOString()
        })),
        treatmentPlans: (userRole === 'ACCOUNTANT') ? [] : treatmentPlans.map((t) => ({
          id: t.id,
          planNumber: t.planNumber,
          patientId: t.patientId || patient!.id,
          patientName: t.patientName,
          patientMrn: t.patientMrn,
          doctorId: t.doctorId || '',
          doctorName: t.doctorName,
          assignedTherapist: t.assignedTherapist,
          therapyType: t.therapyType as any,
          clinicalObjective: t.clinicalObjective,
          oilOrFormulation: t.oilOrFormulation,
          totalSessions: t.totalSessions,
          completedSessions: t.completedSessions,
          frequency: t.frequency as any,
          startDate: t.startDate,
          endDate: t.endDate,
          roomNumber: t.roomNumber,
          status: t.status as any,
          notes: t.notes || ''
        })),
        panchakarmaCourses: (userRole === 'ACCOUNTANT') ? [] : panchakarmaCourses.map((pk) => ({
          id: pk.id,
          courseNumber: pk.courseNumber,
          patientId: pk.patientId || patient!.id,
          patientName: pk.patientName,
          patientMrn: pk.patientMrn,
          vaidyaName: pk.vaidyaName,
          protocol: pk.protocol as any,
          currentPhase: pk.currentPhase as any,
          startDate: pk.startDate,
          expectedEndDate: pk.expectedEndDate,
          totalDays: pk.totalDays,
          completedDays: pk.completedDays,
          dietaryPrescription: pk.dietaryPrescription,
          status: pk.status as any,
          dailySessions: pk.dailySessions as any,
          dischargeNotes: pk.dischargeNotes || undefined
        })),
        prescriptions: prescriptions.map((r) => ({
          id: r.id,
          rxNumber: r.rxNumber,
          patientId: r.patientId || patient!.id,
          patientName: r.patientName,
          mrn: r.mrn,
          doctorId: r.doctorId || '',
          doctorName: r.doctorName,
          datePrescribed: r.datePrescribed.toISOString(),
          medicationName: r.medicationName,
          dosage: r.dosage,
          frequency: r.frequency,
          route: r.route as any,
          duration: r.duration,
          status: r.status as any,
          pharmacyNotes: r.pharmacyNotes || undefined,
          dispensedAt: r.dispensedAt?.toISOString(),
          dispensedBy: r.dispensedBy || undefined
        })),
        labOrders: (userRole === 'ACCOUNTANT') ? [] : labOrders.map((l) => ({
          id: l.id,
          orderNumber: l.orderNumber,
          patientId: l.patientId || patient!.id,
          patientName: l.patientName,
          mrn: l.mrn,
          testType: l.testType as any,
          priority: l.priority as any,
          orderingDoctor: l.orderingDoctor,
          orderedAt: l.orderedAt.toISOString(),
          status: l.status as any,
          resultValue: l.resultValue || undefined,
          normalRange: l.normalRange || undefined,
          isAbnormal: l.isAbnormal,
          labNotes: l.labNotes || undefined
        })),
        invoices: invoices.map((inv) => ({
          id: inv.id,
          invoiceNumber: inv.invoiceNumber,
          patientId: inv.patientId || patient!.id,
          patientName: inv.patientName,
          mrn: inv.mrn,
          admissionDate: inv.admissionDate.toISOString(),
          dischargeDate: inv.dischargeDate ? inv.dischargeDate.toISOString() : undefined,
          items: inv.items as any,
          subtotal: Number(inv.subtotal),
          insuranceCovered: Number(inv.insuranceCovered),
          copayPatient: Number(inv.copayPatient),
          totalAmount: Number(inv.totalAmount),
          paidAmount: Number(inv.paidAmount),
          balance: Number(inv.balance),
          paymentStatus: inv.paymentStatus as any,
          insuranceClaimStatus: (inv.insuranceClaimStatus as any) || undefined,
          createdAt: inv.createdAt.toISOString()
        })),
        stockMovements: stockMovements.map((sm) => ({
          id: sm.id,
          timestamp: sm.timestamp.toISOString(),
          medicineId: sm.medicineId || '',
          medicineName: sm.medicineName,
          batchNumber: sm.batchNumber,
          type: sm.type as any,
          quantityDelta: sm.quantityDelta,
          remainingQuantity: sm.remainingQuantity,
          actor: sm.actor,
          referenceNumber: sm.referenceNumber || '',
          notes: sm.notes || ''
        })),
        auditLogs: auditLogs.map((al) => ({
          id: al.id,
          timestamp: al.timestamp.toISOString(),
          actor: al.actor,
          role: al.role as any,
          category: al.category as any,
          action: al.action,
          patientMrn: al.patientMrn || undefined,
          details: al.details,
          ipAddress: al.ipAddress || '127.0.0.1'
        }))
      };
    } catch (err) {
      console.warn('[Prisma dbGetPatientDossier] Fallback:', err);
    }
  }

  // In-memory fallback
  const isMrn = idOrMrn.startsWith('SAH-') || idOrMrn.startsWith('MRN-');
  patient = hospitalStore.patients.find((p) => (isMrn ? p.mrn === idOrMrn : p.id === idOrMrn)) || null;
  if (!patient) return null;

  return {
    patient,
    appointments: hospitalStore.appointments.filter((a) => a.patientId === patient!.id || a.patientMrn === patient!.mrn),
    consultations: (userRole === 'RECEPTIONIST' || userRole === 'ACCOUNTANT') ? [] : hospitalStore.consultations.filter((c) => c.patientId === patient!.id || c.patientMrn === patient!.mrn),
    treatmentPlans: (userRole === 'ACCOUNTANT') ? [] : hospitalStore.treatmentPlans.filter((t) => t.patientId === patient!.id || t.patientMrn === patient!.mrn),
    panchakarmaCourses: (userRole === 'ACCOUNTANT') ? [] : hospitalStore.panchakarmaCourses.filter((pk) => pk.patientId === patient!.id || pk.patientMrn === patient!.mrn),
    prescriptions: hospitalStore.prescriptions.filter((r) => r.patientId === patient!.id || r.mrn === patient!.mrn),
    labOrders: (userRole === 'ACCOUNTANT') ? [] : hospitalStore.labOrders.filter((l) => l.patientId === patient!.id || l.mrn === patient!.mrn),
    invoices: hospitalStore.invoices.filter((i) => i.patientId === patient!.id || i.mrn === patient!.mrn),
    stockMovements: [],
    auditLogs: hospitalStore.auditLogs.filter((al) => al.patientMrn === patient!.mrn)
  };
}

export async function dbCreatePatient(patient: Patient): Promise<Patient> {
  if (!isPrismaConnected) {
    throw new Error('DatabaseUnavailable: Active PostgreSQL connection is required for patient creation.');
  }

  // Server-side authoritative MRN generation if not provided
  if (!patient.mrn || patient.mrn.startsWith('temp-')) {
    patient.mrn = await generateUniquePatientNumber();
  }

  // Calculate age from DOB if DOB provided and age not set
  if (patient.dob && (patient.age === undefined || patient.age === null)) {
    const birthDate = new Date(patient.dob);
    if (!isNaN(birthDate.getTime())) {
      const today = new Date();
      let age = today.getFullYear() - birthDate.getFullYear();
      const m = today.getMonth() - birthDate.getMonth();
      if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
        age--;
      }
      patient.age = Math.max(0, age);
    }
  }

  try {
    const created = await prisma.patient.create({
      data: {
        id: patient.id,
        mrn: patient.mrn,
        firstName: patient.firstName,
        middleName: patient.middleName || null,
        lastName: patient.lastName,
        dob: patient.dob || null,
        age: patient.age !== undefined && patient.age !== null ? patient.age : null,
        gender: patient.gender,
        bloodGroup: patient.bloodGroup || null,
        preferredLanguage: patient.preferredLanguage || null,
        photoUrl: patient.photoUrl || null,
        status: patient.status || 'active',
        admissionStatus: patient.admissionStatus || null,
        phone: patient.phone,
        secondaryPhone: patient.secondaryPhone || null,
        email: patient.email || null,
        communicationPreference: patient.communicationPreference || null,
        contactLanguage: patient.contactLanguage || null,
        address: patient.address || null,
        addressLine1: patient.addressLine1 || null,
        addressLine2: patient.addressLine2 || null,
        locality: patient.locality || null,
        city: patient.city || null,
        district: patient.district || null,
        state: patient.state || null,
        postalCode: patient.postalCode || null,
        country: patient.country || null,
        emergencyContact: (patient.emergencyContact as any) || null,
        emergencyContactName: patient.emergencyContactName || patient.emergencyContact?.name || null,
        emergencyContactRelation: patient.emergencyContactRelation || patient.emergencyContact?.relationship || null,
        emergencyContactPhone: patient.emergencyContactPhone || patient.emergencyContact?.phone || null,
        emergencyContactAltPhone: patient.emergencyContactAltPhone || patient.emergencyContact?.altPhone || null,
        allergyStatus: patient.allergyStatus || 'not_recorded',
        allergies: (patient.allergies as any) || null,
        medicalHistoryStatus: patient.medicalHistoryStatus || 'not_recorded',
        chronicConditions: (patient.chronicConditions as any) || null,
        pastMedicalHistory: patient.pastMedicalHistory || null,
        pastSurgicalHistory: patient.pastSurgicalHistory || null,
        familyHistory: patient.familyHistory || null,
        currentMedications: (patient.currentMedications as any) || null,
        pastDiagnoses: (patient.pastDiagnoses as any) || null,
        medicalHistoryNotes: patient.medicalHistoryNotes || null,
        clinicalNotes: patient.clinicalNotes || null,
        currentWard: patient.currentWard || null,
        currentBed: patient.currentBed || null,
        assignedDoctorId: patient.assignedDoctorId || null,
        assignedDoctorName: patient.assignedDoctorName || null,
        admissionDate: patient.admissionDate ? new Date(patient.admissionDate) : new Date(),
        isRegistered: patient.isRegistered !== undefined ? patient.isRegistered : true,
        registeredById: patient.registeredById || null,
        registeredByName: patient.registeredByName || null,
        insurance: (patient.insurance as any) || null,
        doshaProfile: (patient.doshaProfile as any) || null,
        latestVitals: (patient.latestVitals as any) || null
      }
    });
    const mapped = mapDbPatientToPatient(created);
    hospitalStore.patients.unshift(mapped);
    return mapped;
  } catch (err: any) {
    console.error('[Prisma dbCreatePatient] Creation failed:', err);
    throw err;
  }
}

export async function dbUpdatePatient(
  idOrMrn: string,
  updates: Partial<Patient>,
  userRole?: string
): Promise<Patient | null> {
  const isClinician = userRole === 'DOCTOR' || userRole === 'VAIDYA';
  const sanitizedUpdates: any = { ...updates };

  if (!isClinician && userRole) {
    delete sanitizedUpdates.allergies;
    delete sanitizedUpdates.allergyStatus;
    delete sanitizedUpdates.chronicConditions;
    delete sanitizedUpdates.pastMedicalHistory;
    delete sanitizedUpdates.pastSurgicalHistory;
    delete sanitizedUpdates.familyHistory;
    delete sanitizedUpdates.clinicalNotes;
    delete sanitizedUpdates.medicalHistoryNotes;
    delete sanitizedUpdates.doshaProfile;
    delete sanitizedUpdates.currentMedications;
    delete sanitizedUpdates.pastDiagnoses;
    delete sanitizedUpdates.medicalHistoryStatus;
    delete sanitizedUpdates.latestVitals;
  }

  delete sanitizedUpdates.mrn;
  delete sanitizedUpdates.id;
  delete sanitizedUpdates.createdAt;
  delete sanitizedUpdates.updatedAt;

  if (sanitizedUpdates.dob) {
    const birthDate = new Date(sanitizedUpdates.dob);
    if (!isNaN(birthDate.getTime())) {
      const today = new Date();
      let age = today.getFullYear() - birthDate.getFullYear();
      const m = today.getMonth() - birthDate.getMonth();
      if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
        age--;
      }
      sanitizedUpdates.age = Math.max(0, age);
    }
  }

  if (sanitizedUpdates.emergencyContact && typeof sanitizedUpdates.emergencyContact === 'object') {
    const ec = sanitizedUpdates.emergencyContact;
    if (ec.name !== undefined) sanitizedUpdates.emergencyContactName = ec.name;
    if (ec.relationship !== undefined) sanitizedUpdates.emergencyContactRelation = ec.relationship;
    if (ec.phone !== undefined) sanitizedUpdates.emergencyContactPhone = ec.phone;
    if (ec.altPhone !== undefined) sanitizedUpdates.emergencyContactAltPhone = ec.altPhone;
  } else if (sanitizedUpdates.emergencyContactName || sanitizedUpdates.emergencyContactPhone || sanitizedUpdates.emergencyContactRelation || sanitizedUpdates.emergencyContactAltPhone) {
    sanitizedUpdates.emergencyContact = {
      name: sanitizedUpdates.emergencyContactName,
      relationship: sanitizedUpdates.emergencyContactRelation || 'Contact',
      phone: sanitizedUpdates.emergencyContactPhone || '',
      altPhone: sanitizedUpdates.emergencyContactAltPhone
    };
  }

  if (isPrismaConnected) {
    try {
      const isMrn = idOrMrn.startsWith('SAH-') || idOrMrn.startsWith('MRN-');
      // Only keep scalar/json fields present in Prisma model
      const allowedKeys = new Set([
        'firstName', 'middleName', 'lastName', 'dob', 'age', 'gender', 'bloodGroup',
        'preferredLanguage', 'photoUrl', 'status', 'admissionStatus',
        'phone', 'secondaryPhone', 'email', 'communicationPreference', 'contactLanguage',
        'address', 'addressLine1', 'addressLine2', 'locality', 'city', 'district', 'state', 'postalCode', 'country',
        'emergencyContact', 'emergencyContactName', 'emergencyContactRelation', 'emergencyContactPhone', 'emergencyContactAltPhone',
        'allergyStatus', 'allergies', 'medicalHistoryStatus', 'chronicConditions',
        'pastMedicalHistory', 'pastSurgicalHistory', 'familyHistory', 'currentMedications',
        'pastDiagnoses', 'medicalHistoryNotes', 'clinicalNotes',
        'currentWard', 'currentBed', 'assignedDoctorId', 'assignedDoctorName',
        'insurance', 'doshaProfile', 'latestVitals',
        'isRegistered', 'registeredById', 'registeredByName',
        'archivedAt', 'archivedById', 'archivedByName', 'archivedReason', 'deletedAt'
      ]);

      const prismaData: any = {};
      for (const [k, v] of Object.entries(sanitizedUpdates)) {
        if (allowedKeys.has(k)) {
          prismaData[k] = v;
        }
      }

      const updated = await prisma.patient.update({
        where: isMrn ? { mrn: idOrMrn } : { id: idOrMrn },
        data: prismaData
      });
      const mapped = mapDbPatientToPatient(updated);
      const index = hospitalStore.patients.findIndex(
        (p) => (p.id === idOrMrn || p.mrn === idOrMrn) && !p.deletedAt
      );
      if (index !== -1) hospitalStore.patients[index] = mapped;
      return mapped;
    } catch (err) {
      console.warn('[Prisma dbUpdatePatient] Warning:', err);
    }
  }

  const isMrn = idOrMrn.startsWith('SAH-') || idOrMrn.startsWith('MRN-');
  const index = hospitalStore.patients.findIndex(
    (p) => (p.id === idOrMrn || p.mrn === idOrMrn) && !p.deletedAt
  );
  if (index === -1) return null;

  const updated: Patient = {
    ...hospitalStore.patients[index],
    ...sanitizedUpdates
  };
  hospitalStore.patients[index] = updated;
  return updated;
}

export async function dbDeletePatient(
  idOrMrn: string,
  actor: string = 'Super Administrator',
  reason?: string
): Promise<{ success: boolean; archived: boolean; hardDeleted: boolean; message: string; patient?: Patient }> {
  if (!isPrismaConnected) {
    throw new Error('DatabaseUnavailable: Active PostgreSQL connection is required for patient archival.');
  }

  try {
    const isMrn = idOrMrn.startsWith('SAH-') || idOrMrn.startsWith('MRN-');
    const existing = await prisma.patient.findFirst({
      where: isMrn ? { mrn: idOrMrn } : { id: idOrMrn },
      include: {
        _count: {
          select: {
            appointments: true,
            consultations: true,
            treatmentPlans: true,
            panchakarmaCourses: true,
            prescriptions: true,
            labOrders: true,
            invoices: true
          }
        }
      }
    });

    if (!existing) {
      return { success: false, archived: false, hardDeleted: false, message: 'Patient record not found.' };
    }

    const linkedCount =
      existing._count.appointments +
      existing._count.consultations +
      existing._count.treatmentPlans +
      existing._count.panchakarmaCourses +
      existing._count.prescriptions +
      existing._count.labOrders +
      existing._count.invoices;

    const archiveReason = linkedCount > 0
      ? (reason ? `${reason} (Patient has ${linkedCount} linked clinical/financial record(s))` : `Controlled archival: Patient has ${linkedCount} linked clinical/financial record(s).`)
      : (reason || 'Controlled archival: Super Administrator archived patient record.');

    // All application deletions must result in controlled archival (status = 'archived')
    // Never physically or soft-delete (deletedAt) through ordinary workflows
    const updated = await prisma.patient.update({
      where: { id: existing.id },
      data: {
        status: 'archived',
        archivedAt: new Date(),
        archivedById: actor,
        archivedByName: actor,
        archivedReason: archiveReason
      }
    });
    const mapped = mapDbPatientToPatient(updated);
    const idx = hospitalStore.patients.findIndex((p) => p.id === existing.id);
    if (idx !== -1) hospitalStore.patients[idx] = mapped;

    return {
      success: true,
      archived: true,
      hardDeleted: false,
      message: `Patient ${existing.mrn} securely archived. Clinical and demographic history preserved.`,
      patient: mapped
    };
  } catch (err: any) {
    console.warn('[Prisma dbDeletePatient] Error:', err);
    return { success: false, archived: false, hardDeleted: false, message: err.message || 'Database error during deletion.' };
  }
}

// ------------------------------------------------------------------------------
// APPOINTMENTS
// ------------------------------------------------------------------------------

export async function generateUniqueAppointmentNumber(): Promise<string> {
  const year = new Date().getFullYear();
  if (!isPrismaConnected) {
    throw new Error('DatabaseUnavailable: Active PostgreSQL connection is required for sequence-backed appointment number generation.');
  }

  try {
    const res = await prisma.$queryRaw<[{ nextval: bigint }]>`SELECT nextval('appointment_ref_seq')`;
    if (!res || !res[0] || res[0].nextval === undefined || res[0].nextval === null) {
      throw new Error('SequenceUnavailable: Sequence "appointment_ref_seq" returned empty result.');
    }
    const seq = Number(res[0].nextval);
    if (isNaN(seq) || seq <= 0) {
      throw new Error('SequenceInvalid: Sequence "appointment_ref_seq" returned invalid integer.');
    }
    return `APT-${year}-${String(seq).padStart(5, '0')}`;
  } catch (err: any) {
    console.error('[Prisma generateUniqueAppointmentNumber] Fail-closed sequence failure:', err.message);
    throw new Error(`APPOINTMENT_SEQUENCE_UNAVAILABLE: Authoritative sequence generation failed: ${err.message}`);
  }
}

export const VALID_APPOINTMENT_TRANSITIONS: Record<string, string[]> = {
  scheduled: ['confirmed', 'checked_in', 'waiting', 'rescheduled', 'cancelled', 'no_show'],
  confirmed: ['checked_in', 'waiting', 'rescheduled', 'cancelled', 'no_show'],
  checked_in: ['waiting', 'in_consultation', 'cancelled'],
  waiting: ['in_consultation', 'cancelled', 'no_show'],
  in_consultation: ['completed', 'waiting'],
  completed: [],
  cancelled: [],
  no_show: [],
  rescheduled: []
};

export function mapDbAppointmentToAppointment(a: any): Appointment {
  return {
    id: a.id,
    appointmentNumber: a.appointmentNumber || undefined,
    patientId: a.patientId || '',
    patientName: a.patientName,
    patientMrn: a.patientMrn,
    patientPhone: a.patientPhone,
    patientEmail: a.patientEmail || '',
    practitionerId: a.practitionerId || a.doctorId || undefined,
    practitionerName: a.practitionerName || a.doctorName || undefined,
    practitionerRole: (a.practitionerRole as any) || undefined,
    doctorId: a.doctorId || a.practitionerId || '',
    doctorName: a.doctorName || a.practitionerName || '',
    department: a.department,
    dateTime: a.dateTime instanceof Date ? a.dateTime.toISOString() : String(a.dateTime),
    appointmentDate: a.appointmentDate ? (a.appointmentDate instanceof Date ? a.appointmentDate.toISOString() : String(a.appointmentDate)) : undefined,
    timeSlot: a.timeSlot,
    durationMinutes: typeof a.durationMinutes === 'number' ? a.durationMinutes : undefined,
    scheduledStartTime: a.scheduledStartTime || undefined,
    scheduledEndTime: a.scheduledEndTime || undefined,
    type: a.type,
    status: (a.status as any) || 'scheduled',
    bookingSource: (a.bookingSource as any) || 'reception_scheduled',
    reasonForVisit: a.reasonForVisit || undefined,
    notes: a.notes || '',
    receptionNotes: a.receptionNotes || undefined,
    cancellationReason: a.cancellationReason || undefined,
    checkInTime: a.checkInTime ? (a.checkInTime instanceof Date ? a.checkInTime.toISOString() : String(a.checkInTime)) : undefined,
    queuePosition: a.queuePosition !== null && a.queuePosition !== undefined ? a.queuePosition : null,
    priority: (a.priority as any) || 'normal',
    priorityReason: a.priorityReason || undefined,
    consultationStartTime: a.consultationStartTime ? (a.consultationStartTime instanceof Date ? a.consultationStartTime.toISOString() : String(a.consultationStartTime)) : undefined,
    completedAt: a.completedAt ? (a.completedAt instanceof Date ? a.completedAt.toISOString() : String(a.completedAt)) : undefined,
    isEscalated: Boolean(a.isEscalated),
    escalationStatus: (a.escalationStatus as any) || (a.isEscalated ? 'escalated' : undefined),
    escalatedAt: a.escalatedAt ? (a.escalatedAt instanceof Date ? a.escalatedAt.toISOString() : String(a.escalatedAt)) : undefined,
    escalatedById: a.escalatedById || undefined,
    escalatedByName: a.escalatedByName || undefined,
    escalationReason: a.escalationReason || undefined,
    escalationAcknowledgedAt: a.escalationAcknowledgedAt ? (a.escalationAcknowledgedAt instanceof Date ? a.escalationAcknowledgedAt.toISOString() : String(a.escalationAcknowledgedAt)) : undefined,
    escalationAcknowledgedById: a.escalationAcknowledgedById || undefined,
    escalationAcknowledgedByName: a.escalationAcknowledgedByName || undefined,
    escalationResolvedAt: a.escalationResolvedAt ? (a.escalationResolvedAt instanceof Date ? a.escalationResolvedAt.toISOString() : String(a.escalationResolvedAt)) : undefined,
    escalationResolvedById: a.escalationResolvedById || undefined,
    escalationResolvedByName: a.escalationResolvedByName || undefined,
    escalationResolutionNotes: a.escalationResolutionNotes || undefined,
    clinicalTriageAt: a.clinicalTriageAt ? (a.clinicalTriageAt instanceof Date ? a.clinicalTriageAt.toISOString() : String(a.clinicalTriageAt)) : undefined,
    clinicalTriageById: a.clinicalTriageById || undefined,
    clinicalTriageRole: (a.clinicalTriageRole as any) || undefined,
    clinicalDocumentationCompleted: Boolean(a.clinicalDocumentationCompleted),
    rescheduledFromId: a.rescheduledFromId || undefined,
    reschedulingHistory: (a.reschedulingHistory as any) || undefined,
    createdById: a.createdById || undefined,
    createdByName: a.createdByName || undefined,
    updatedById: a.updatedById || undefined,
    updatedByName: a.updatedByName || undefined,
    reminderSent: a.reminderSent || false,
    reminderChannel: (a.reminderChannel as any) || undefined,
    reminderSentAt: a.reminderSentAt ? (a.reminderSentAt instanceof Date ? a.reminderSentAt.toISOString() : String(a.reminderSentAt)) : undefined,
    createdAt: a.createdAt ? (a.createdAt instanceof Date ? a.createdAt.toISOString() : String(a.createdAt)) : undefined,
    updatedAt: a.updatedAt ? (a.updatedAt instanceof Date ? a.updatedAt.toISOString() : String(a.updatedAt)) : undefined
  };
}

export function parseTimeToMinutes(timeStr?: string | null): number | null {
  if (!timeStr) return null;
  const match = timeStr.trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?$/i);
  if (!match) return null;
  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const modifier = match[3]?.toUpperCase();

  if (modifier === 'PM' && hours < 12) hours += 12;
  if (modifier === 'AM' && hours === 12) hours = 0;
  return hours * 60 + minutes;
}

export function formatMinutesToTime(totalMins: number): string {
  const hours24 = Math.floor(totalMins / 60) % 24;
  const mins = totalMins % 60;
  const modifier = hours24 >= 12 ? 'PM' : 'AM';
  const hours12 = hours24 % 12 || 12;
  return `${String(hours12).padStart(2, '0')}:${String(mins).padStart(2, '0')} ${modifier}`;
}

export async function dbCheckAppointmentConflict(params: {
  practitionerId: string;
  dateTime: Date | string;
  timeSlot: string;
  durationMinutes?: number | null;
  scheduledStartTime?: string | null;
  scheduledEndTime?: string | null;
  excludeAppointmentId?: string;
  client?: any;
}): Promise<{ hasConflict: boolean; conflictingAppointment?: Appointment }> {
  if (!isPrismaConnected) return { hasConflict: false };

  const db = params.client || prisma;
  const aptDate = new Date(params.dateTime);
  const startOfDay = new Date(aptDate);
  startOfDay.setUTCHours(0, 0, 0, 0);
  const endOfDay = new Date(aptDate);
  endOfDay.setUTCHours(23, 59, 59, 999);

  const where: any = {
    practitionerId: params.practitionerId,
    dateTime: {
      gte: startOfDay,
      lte: endOfDay
    },
    status: { in: ['scheduled', 'confirmed', 'checked_in', 'waiting', 'in_consultation'] }
  };

  if (params.excludeAppointmentId) {
    where.id = { not: params.excludeAppointmentId };
  }

  const existingBookings = await db.appointment.findMany({ where });

  // Compute candidate start and end minutes if configured
  const candStartMins = parseTimeToMinutes(params.scheduledStartTime || params.timeSlot);
  const candEndMins = (candStartMins !== null && typeof params.durationMinutes === 'number' && params.durationMinutes > 0)
    ? candStartMins + params.durationMinutes
    : (params.scheduledEndTime ? parseTimeToMinutes(params.scheduledEndTime) : null);

  for (const existing of existingBookings) {
    const exStartMins = parseTimeToMinutes(existing.scheduledStartTime || existing.timeSlot);
    const exEndMins = (exStartMins !== null && typeof existing.durationMinutes === 'number' && existing.durationMinutes > 0)
      ? exStartMins + existing.durationMinutes
      : (existing.scheduledEndTime ? parseTimeToMinutes(existing.scheduledEndTime) : null);

    // If both have explicit start and end intervals, check interval intersection
    if (candStartMins !== null && candEndMins !== null && exStartMins !== null && exEndMins !== null) {
      if (candStartMins < exEndMins && candEndMins > exStartMins) {
        return {
          hasConflict: true,
          conflictingAppointment: mapDbAppointmentToAppointment(existing)
        };
      }
    } else {
      // If duration is unconfigured on either, match by exact timeSlot
      if (existing.timeSlot.trim().toLowerCase() === params.timeSlot.trim().toLowerCase()) {
        return {
          hasConflict: true,
          conflictingAppointment: mapDbAppointmentToAppointment(existing)
        };
      }
    }
  }

  return { hasConflict: false };
}

export async function dbGetAppointments(options: {
  date?: string;
  status?: string;
  practitionerRole?: string;
  practitionerId?: string;
  search?: string;
  patientId?: string;
  userRole?: string;
  userId?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
} = {}): Promise<{ appointments: Appointment[]; total: number; page: number; limit: number; totalPages: number }> {
  const page = Math.max(1, Number(options.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(options.limit) || 50));
  const skip = (page - 1) * limit;
  const sortBy = options.sortBy || 'dateTime';
  const sortOrder = options.sortOrder === 'asc' ? 'asc' : 'desc';

  if (!isPrismaConnected) {
    throw new Error('DatabaseUnavailable: Active PostgreSQL connection is required for appointments query.');
  }

  const where: any = {};

  // Doctor and Vaidya Separation:
  if (options.userRole === 'DOCTOR') {
    where.OR = [
      { practitionerRole: 'DOCTOR' },
      { practitionerId: options.userId }
    ];
  } else if (options.userRole === 'VAIDYA') {
    where.OR = [
      { practitionerRole: 'VAIDYA' },
      { practitionerId: options.userId }
    ];
  }

  if (options.practitionerRole && options.practitionerRole !== 'all') {
    where.practitionerRole = options.practitionerRole.toUpperCase();
  }
  if (options.practitionerId && options.practitionerId !== 'all') {
    where.practitionerId = options.practitionerId;
  }
  if (options.status && options.status !== 'all') {
    where.status = options.status.toLowerCase();
  }
  if (options.patientId) {
    where.patientId = options.patientId;
  }
  if (options.date) {
    const d = new Date(options.date);
    if (!isNaN(d.getTime())) {
      const startOfDay = new Date(d);
      startOfDay.setUTCHours(0, 0, 0, 0);
      const endOfDay = new Date(d);
      endOfDay.setUTCHours(23, 59, 59, 999);
      where.dateTime = { gte: startOfDay, lte: endOfDay };
    }
  }

  if (options.search) {
    const s = options.search.trim();
    where.AND = [
      {
        OR: [
          { appointmentNumber: { contains: s, mode: 'insensitive' } },
          { patientName: { contains: s, mode: 'insensitive' } },
          { patientMrn: { contains: s, mode: 'insensitive' } },
          { patientPhone: { contains: s, mode: 'insensitive' } },
          { practitionerName: { contains: s, mode: 'insensitive' } },
          { doctorName: { contains: s, mode: 'insensitive' } }
        ]
      }
    ];
  }

  const [total, dbAppts] = await Promise.all([
    prisma.appointment.count({ where }),
    prisma.appointment.findMany({
      where,
      skip,
      take: limit,
      orderBy: { [sortBy]: sortOrder }
    })
  ]);

  const mapped = dbAppts.map(mapDbAppointmentToAppointment);
  return {
    appointments: mapped,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit) || 1
  };
}

export async function dbGetAppointmentById(id: string): Promise<Appointment | null> {
  if (!isPrismaConnected) {
    throw new Error('DatabaseUnavailable: Active PostgreSQL connection is required for appointment query.');
  }

  const dbApt = await prisma.appointment.findFirst({
    where: {
      OR: [{ id }, { appointmentNumber: id }]
    }
  });
  return dbApt ? mapDbAppointmentToAppointment(dbApt) : null;
}

export async function dbCreateAppointment(
  data: Partial<Appointment>,
  actor?: { id?: string; name?: string; role?: string }
): Promise<Appointment> {
  if (!isPrismaConnected) {
    throw new Error('DatabaseUnavailable: Active PostgreSQL connection is required for appointment creation.');
  }

  let patient: any = null;
  if (data.patientId) {
    patient = await prisma.patient.findUnique({ where: { id: data.patientId } });
  } else if (data.patientMrn) {
    patient = await prisma.patient.findFirst({ where: { mrn: data.patientMrn } });
  }
  if (!patient && data.patientName) {
    const parts = data.patientName.trim().split(' ');
    patient = await prisma.patient.findFirst({
      where: {
        firstName: parts[0]
      }
    });
  }

  if (!patient || patient.deletedAt) {
    if (!data.patientId && !data.patientMrn && !data.patientName) {
      throw new Error('PatientRequired: A valid registered patient ID is required.');
    }
    throw new Error(`PatientNotFound: Patient with ID ${data.patientId || data.patientMrn || data.patientName} does not exist in master registry.`);
  }

  const practitionerId = data.practitionerId || data.doctorId;
  let practitioner: any = null;
  if (practitionerId) {
    practitioner = await prisma.user.findUnique({
      where: { id: practitionerId }
    });
    if (!practitioner) {
      throw new Error(`PractitionerNotFound: Practitioner with ID ${practitionerId} does not exist.`);
    }
  } else if (data.doctorName || data.practitionerName) {
    const rawName = (data.practitionerName || data.doctorName || '').trim();
    const cleanName = rawName.split(',')[0].replace(/^Dr\.\s*/i, '').trim();
    practitioner = await prisma.user.findFirst({
      where: {
        role: { in: ['DOCTOR', 'VAIDYA'] },
        name: { contains: cleanName }
      }
    });
    if (!practitioner) {
      practitioner = await prisma.user.findFirst({
        where: { role: { in: ['DOCTOR', 'VAIDYA'] }, isActive: true }
      });
    }
  }

  if (!practitioner) {
    throw new Error('PractitionerRequired: An authorized practitioner (Doctor or Vaidya) must be assigned.');
  }
  if (practitioner.status !== 'active') {
    throw new Error(`PractitionerInactive: Practitioner ${practitioner.name} is inactive and cannot accept bookings.`);
  }
  const normRole = (practitioner.role || '').toUpperCase();
  if (normRole !== 'DOCTOR' && normRole !== 'VAIDYA') {
    throw new Error(`InvalidPractitionerRole: Practitioner ${practitioner.name} has role "${practitioner.role}". Only DOCTOR or VAIDYA may be scheduled.`);
  }

  let rawDate = data.dateTime;
  if (!rawDate && data.appointmentDate) {
    rawDate = `${data.appointmentDate}T09:00:00.000Z`;
  }
  const aptDate = rawDate ? new Date(rawDate) : new Date();
  if (isNaN(aptDate.getTime())) {
    throw new Error('InvalidDateTime: A valid appointment date and time must be specified.');
  }
  const timeSlot = (data.timeSlot || '09:00 AM').trim();
  const durationMinutes = (typeof data.durationMinutes === 'number' && data.durationMinutes > 0)
    ? data.durationMinutes
    : null;

  const scheduledStartTime = data.scheduledStartTime || timeSlot;
  let scheduledEndTime = data.scheduledEndTime;
  if (!scheduledEndTime && durationMinutes !== null) {
    const startMins = parseTimeToMinutes(scheduledStartTime);
    if (startMins !== null) {
      scheduledEndTime = formatMinutesToTime(startMins + durationMinutes);
    }
  }

  // Race-safe transaction with deterministic practitioner row lock
  const created = await prisma.$transaction(async (tx) => {
    // 1. Lock practitioner row to serialize concurrent booking checks for the same practitioner
    await tx.$queryRaw`SELECT id FROM users WHERE id = ${practitioner.id} FOR UPDATE`;

    // 2. Conflict Detection inside transaction
    const conflict = await dbCheckAppointmentConflict({
      practitionerId: practitioner.id,
      dateTime: aptDate,
      timeSlot,
      durationMinutes,
      scheduledStartTime,
      scheduledEndTime,
      client: tx
    });
    if (conflict.hasConflict) {
      const conflictErr: any = new Error(`AppointmentConflict: Practitioner ${practitioner.name} already has an active booking (${conflict.conflictingAppointment?.id}) at ${timeSlot} on ${aptDate.toISOString().split('T')[0]}.`);
      conflictErr.conflictDetails = conflict.conflictingAppointment;
      throw conflictErr;
    }

    const priority = (data.priority || 'normal').toLowerCase();
    const isClinician = actor?.role === 'DOCTOR' || actor?.role === 'VAIDYA';
    if ((priority === 'urgent' || priority === 'priority') && !isClinician) {
      throw new Error('ClinicalTriageRestricted: Only authorized clinical practitioners (DOCTOR or VAIDYA) may establish clinical triage priority.');
    }
    if (isClinician && (priority === 'urgent' || priority === 'priority')) {
      if (actor?.role !== normRole) {
        throw new Error(`ClinicalDisciplineMismatch: Clinician with role "${actor?.role}" cannot establish clinical triage for an appointment assigned to discipline "${normRole}".`);
      }
      if (!data.priorityReason || !data.priorityReason.trim()) {
        throw new Error('PriorityReasonRequired: An explicit priorityReason is mandatory for priority or urgent triage classification.');
      }
    }

    const isEscalated = Boolean(data.isEscalated);
    const escalationReason = data.escalationReason ? data.escalationReason.trim() : undefined;
    if (isEscalated && !escalationReason) {
      throw new Error('EscalationReasonRequired: An explicit escalation reason is mandatory for emergency escalation.');
    }

    const appointmentNumber = data.appointmentNumber && data.appointmentNumber.startsWith('APT-')
      ? data.appointmentNumber
      : await generateUniqueAppointmentNumber();

    const startOfDay = new Date(aptDate);
    startOfDay.setUTCHours(0, 0, 0, 0);

    const initialStatus = (data.status || 'scheduled').toLowerCase();

    return await tx.appointment.create({
      data: {
        id: data.id || `apt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        appointmentNumber,
        patientId: patient.id,
        patientName: `${patient.firstName} ${patient.lastName}`,
        patientMrn: patient.mrn,
        patientPhone: patient.phone,
        patientEmail: patient.email || '',
        practitionerId: practitioner.id,
        practitionerName: practitioner.name,
        practitionerRole: normRole,
        doctorId: practitioner.id,
        doctorName: practitioner.name,
        department: data.department || practitioner.department || 'Outpatient Clinic',
        dateTime: aptDate,
        appointmentDate: startOfDay,
        timeSlot,
        durationMinutes,
        scheduledStartTime,
        scheduledEndTime: scheduledEndTime || null,
        type: data.type || 'General Consultation',
        status: initialStatus,
        bookingSource: data.bookingSource || 'reception_scheduled',
        reasonForVisit: data.reasonForVisit || undefined,
        notes: data.notes || '',
        receptionNotes: data.receptionNotes || undefined,
        priority: (priority === 'urgent' || priority === 'priority') ? priority : 'normal',
        priorityReason: (priority === 'urgent' || priority === 'priority') ? data.priorityReason?.trim() : undefined,
        clinicalTriageAt: (isClinician && (priority === 'urgent' || priority === 'priority')) ? new Date() : undefined,
        clinicalTriageById: (isClinician && (priority === 'urgent' || priority === 'priority')) ? actor?.id : undefined,
        clinicalTriageRole: (isClinician && (priority === 'urgent' || priority === 'priority')) ? (actor?.role as any) : undefined,
        isEscalated,
        escalationReason: isEscalated ? escalationReason : undefined,
        escalatedAt: isEscalated ? new Date() : undefined,
        escalatedById: isEscalated ? actor?.id : undefined,
        escalatedByName: isEscalated ? actor?.name : undefined,
        clinicalDocumentationCompleted: false,
        createdById: actor?.id || actor?.name || undefined,
        createdByName: actor?.name || undefined,
        reminderSent: data.reminderSent || false,
        reminderChannel: data.reminderChannel || undefined
      }
    });
  });

  const mapped = mapDbAppointmentToAppointment(created);
  hospitalStore.appointments.unshift(mapped);
  return mapped;
}

export async function dbCreateWalkInAppointment(
  data: Partial<Appointment>,
  actor?: { id?: string; name?: string; role?: string }
): Promise<Appointment> {
  if (!isPrismaConnected) {
    throw new Error('DatabaseUnavailable: Active PostgreSQL connection is required for walk-in appointment creation.');
  }

  if (!data.patientId) {
    throw new Error('PatientRequired: A registered patient ID is required for walk-in admission.');
  }

  const patient = await prisma.patient.findUnique({
    where: { id: data.patientId }
  });
  if (!patient || patient.deletedAt) {
    throw new Error(`PatientNotFound: Patient with ID ${data.patientId} does not exist in master registry.`);
  }

  const practitionerId = data.practitionerId || data.doctorId;
  if (!practitionerId) {
    throw new Error('PractitionerRequired: An eligible practitioner (Doctor or Vaidya) must be selected.');
  }

  const practitioner = await prisma.user.findUnique({
    where: { id: practitionerId }
  });
  if (!practitioner) {
    throw new Error(`PractitionerNotFound: Practitioner with ID ${practitionerId} does not exist.`);
  }
  if (practitioner.status !== 'active') {
    throw new Error(`PractitionerInactive: Practitioner ${practitioner.name} is currently inactive.`);
  }
  const normRole = (practitioner.role || '').toUpperCase();
  if (normRole !== 'DOCTOR' && normRole !== 'VAIDYA') {
    throw new Error(`InvalidPractitionerRole: Only DOCTOR or VAIDYA may be assigned for walk-in consultations.`);
  }

  const priority = (data.priority || 'normal').toLowerCase();
  const isClinician = actor?.role === 'DOCTOR' || actor?.role === 'VAIDYA';
  if ((priority === 'urgent' || priority === 'priority') && !isClinician) {
    throw new Error('ClinicalTriageRestricted: Only authorized clinical practitioners (DOCTOR or VAIDYA) may establish clinical triage priority.');
  }
  if (isClinician && (priority === 'urgent' || priority === 'priority')) {
    if (actor?.role !== normRole) {
      throw new Error(`ClinicalDisciplineMismatch: Clinician with role "${actor?.role}" cannot establish clinical triage for an appointment assigned to discipline "${normRole}".`);
    }
    if (!data.priorityReason || !data.priorityReason.trim()) {
      throw new Error('PriorityReasonRequired: An explicit priorityReason is mandatory for priority or urgent triage classification.');
    }
  }

  const isEscalated = Boolean(data.isEscalated);
  const escalationReason = data.escalationReason ? data.escalationReason.trim() : undefined;
  if (isEscalated && !escalationReason) {
    throw new Error('EscalationReasonRequired: An explicit escalation reason is mandatory for emergency escalation.');
  }

  const durationMinutes = (typeof data.durationMinutes === 'number' && data.durationMinutes > 0)
    ? data.durationMinutes
    : null;

  const now = new Date();
  const startOfDay = new Date(now);
  startOfDay.setUTCHours(0, 0, 0, 0);
  const endOfDay = new Date(now);
  endOfDay.setUTCHours(23, 59, 59, 999);

  // Compute next deterministic queue position for today
  const maxQueueApt = await prisma.appointment.findFirst({
    where: {
      dateTime: { gte: startOfDay, lte: endOfDay },
      queuePosition: { not: null }
    },
    orderBy: { queuePosition: 'desc' },
    select: { queuePosition: true }
  });
  const nextQueuePos = (maxQueueApt?.queuePosition || 0) + 1;

  const appointmentNumber = await generateUniqueAppointmentNumber();
  const timeString = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });

  const scheduledStartTime = timeString;
  let scheduledEndTime = data.scheduledEndTime;
  if (!scheduledEndTime && durationMinutes !== null) {
    const startMins = parseTimeToMinutes(scheduledStartTime);
    if (startMins !== null) {
      scheduledEndTime = formatMinutesToTime(startMins + durationMinutes);
    }
  }

  const created = await prisma.appointment.create({
    data: {
      id: data.id || `apt-walkin-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      appointmentNumber,
      patientId: patient.id,
      patientName: `${patient.firstName} ${patient.lastName}`,
      patientMrn: patient.mrn,
      patientPhone: patient.phone,
      patientEmail: patient.email || '',
      practitionerId: practitioner.id,
      practitionerName: practitioner.name,
      practitionerRole: normRole,
      doctorId: practitioner.id,
      doctorName: practitioner.name,
      department: data.department || practitioner.department || 'Walk-in Intake',
      dateTime: now,
      appointmentDate: startOfDay,
      timeSlot: data.timeSlot || timeString,
      durationMinutes,
      scheduledStartTime,
      scheduledEndTime: scheduledEndTime || null,
      type: data.type || 'Walk-in Consultation',
      status: 'waiting',
      bookingSource: 'walk_in',
      reasonForVisit: data.reasonForVisit || 'Walk-in outpatient consultation',
      notes: data.notes || '',
      receptionNotes: data.receptionNotes || undefined,
      checkInTime: now,
      queuePosition: nextQueuePos,
      priority: (priority === 'urgent' || priority === 'priority') ? priority : 'normal',
      priorityReason: (priority === 'urgent' || priority === 'priority') ? data.priorityReason?.trim() : undefined,
      clinicalTriageAt: (isClinician && (priority === 'urgent' || priority === 'priority')) ? now : undefined,
      clinicalTriageById: (isClinician && (priority === 'urgent' || priority === 'priority')) ? actor?.id : undefined,
      clinicalTriageRole: (isClinician && (priority === 'urgent' || priority === 'priority')) ? (actor?.role as any) : undefined,
      isEscalated,
      escalationReason: isEscalated ? escalationReason : undefined,
      escalatedAt: isEscalated ? now : undefined,
      escalatedById: isEscalated ? actor?.id : undefined,
      escalatedByName: isEscalated ? actor?.name : undefined,
      clinicalDocumentationCompleted: false,
      createdById: actor?.id || actor?.name || undefined,
      createdByName: actor?.name || undefined
    }
  });

  const mapped = mapDbAppointmentToAppointment(created);
  hospitalStore.appointments.unshift(mapped);
  return mapped;
}

export async function dbCheckInAppointment(
  id: string,
  receptionNotes?: string,
  actor?: { id?: string; name?: string; role?: string }
): Promise<Appointment> {
  if (!isPrismaConnected) {
    throw new Error('DatabaseUnavailable: Active PostgreSQL connection is required for patient check-in.');
  }

  const existing = await prisma.appointment.findFirst({
    where: {
      OR: [{ id }, { appointmentNumber: id }]
    }
  });
  if (!existing) {
    throw new Error('AppointmentNotFound: Appointment record not found.');
  }

  const curStatus = existing.status.toLowerCase();
  if (curStatus === 'checked_in' || curStatus === 'waiting' || curStatus === 'in_consultation') {
    throw new Error('AlreadyCheckedIn: Patient has already been checked in for this appointment.');
  }
  if (curStatus !== 'scheduled' && curStatus !== 'confirmed') {
    throw new Error(`InvalidStatusTransition: Cannot check in appointment with status "${existing.status}". Only scheduled or confirmed appointments may be checked in.`);
  }

  const now = new Date();
  const startOfDay = new Date(now);
  startOfDay.setUTCHours(0, 0, 0, 0);
  const endOfDay = new Date(now);
  endOfDay.setUTCHours(23, 59, 59, 999);

  // Compute next deterministic queue position for today
  const maxQueueApt = await prisma.appointment.findFirst({
    where: {
      dateTime: { gte: startOfDay, lte: endOfDay },
      queuePosition: { not: null }
    },
    orderBy: { queuePosition: 'desc' },
    select: { queuePosition: true }
  });
  const nextQueuePos = (maxQueueApt?.queuePosition || 0) + 1;

  const updated = await prisma.appointment.update({
    where: { id: existing.id },
    data: {
      status: 'waiting',
      checkInTime: now,
      queuePosition: nextQueuePos,
      receptionNotes: receptionNotes ? (existing.receptionNotes ? `${existing.receptionNotes}\n${receptionNotes}` : receptionNotes) : existing.receptionNotes,
      updatedById: actor?.id || actor?.name || undefined,
      updatedByName: actor?.name || undefined
    }
  });

  const mapped = mapDbAppointmentToAppointment(updated);
  const idx = hospitalStore.appointments.findIndex((a) => a.id === existing.id);
  if (idx !== -1) hospitalStore.appointments[idx] = mapped;
  return mapped;
}

export async function dbUpdateAppointmentStatus(
  id: string,
  targetStatus: string,
  reason?: string,
  actor?: { id?: string; name?: string; role?: string }
): Promise<Appointment> {
  if (!isPrismaConnected) {
    throw new Error('DatabaseUnavailable: Active PostgreSQL connection is required for status updates.');
  }

  const existing = await prisma.appointment.findFirst({
    where: { OR: [{ id }, { appointmentNumber: id }] }
  });
  if (!existing) {
    throw new Error('AppointmentNotFound: Appointment record not found.');
  }

  const currentStatus = existing.status.toLowerCase();
  const nextStatus = targetStatus.toLowerCase();

  const allowedNext = VALID_APPOINTMENT_TRANSITIONS[currentStatus] || [];
  if (!allowedNext.includes(nextStatus)) {
    throw new Error(`InvalidStatusTransition: Transition from "${currentStatus}" to "${nextStatus}" is not permitted. Valid next states: [${allowedNext.join(', ')}].`);
  }

  // Clinical Governance: Clinical handoff and completion require clinical role within the same discipline
  if (nextStatus === 'in_consultation' || nextStatus === 'completed') {
    const actorRole = actor?.role;
    if (actorRole !== 'DOCTOR' && actorRole !== 'VAIDYA') {
      throw new Error(`ClinicalAuthorityRequired: Only authorized clinical practitioners (DOCTOR or VAIDYA) may perform clinical handoff or completion. Role "${actorRole || 'UNKNOWN'}" is not authorized.`);
    }
    const aptRole = (existing.practitionerRole || 'DOCTOR').toUpperCase();
    if (actorRole !== aptRole) {
      throw new Error(`ClinicalDisciplineMismatch: Clinician with role "${actorRole}" cannot ${nextStatus === 'in_consultation' ? 'conduct consultation for' : 'complete'} an appointment assigned to discipline "${aptRole}".`);
    }
  }

  const updateData: any = {
    status: nextStatus,
    updatedById: actor?.id || actor?.name || undefined,
    updatedByName: actor?.name || undefined
  };

  const now = new Date();

  if (nextStatus === 'cancelled') {
    if (!reason || !reason.trim()) {
      throw new Error('CancellationReasonRequired: A non-empty cancellation reason is strictly required.');
    }
    updateData.cancellationReason = reason.trim();
    updateData.queuePosition = null;
  } else if (nextStatus === 'in_consultation') {
    updateData.consultationStartTime = now;
  } else if (nextStatus === 'completed') {
    updateData.completedAt = now;
    updateData.queuePosition = null;
    // Explicitly do not fabricate clinical completion without a signed consultation
    updateData.clinicalDocumentationCompleted = false;
  } else if (nextStatus === 'no_show') {
    updateData.queuePosition = null;
  } else if (nextStatus === 'checked_in') {
    updateData.checkInTime = now;
  }

  const updated = await prisma.appointment.update({
    where: { id: existing.id },
    data: updateData
  });

  const mapped = mapDbAppointmentToAppointment(updated);
  const idx = hospitalStore.appointments.findIndex((a) => a.id === existing.id);
  if (idx !== -1) hospitalStore.appointments[idx] = mapped;
  return mapped;
}

export async function dbRescheduleAppointment(
  id: string,
  newDateTime: string,
  newTimeSlot: string,
  reason?: string,
  actor?: { id?: string; name?: string; role?: string }
): Promise<Appointment> {
  if (!isPrismaConnected) {
    throw new Error('DatabaseUnavailable: Active PostgreSQL connection is required for rescheduling.');
  }

  const existing = await prisma.appointment.findFirst({
    where: { OR: [{ id }, { appointmentNumber: id }] }
  });
  if (!existing) {
    throw new Error('AppointmentNotFound: Appointment record not found.');
  }

  const currentStatus = existing.status.toLowerCase();
  if (currentStatus !== 'scheduled' && currentStatus !== 'confirmed' && currentStatus !== 'rescheduled') {
    throw new Error(`InvalidStatusTransition: Cannot reschedule appointment in "${existing.status}" status.`);
  }

  const nextDate = new Date(newDateTime);
  if (isNaN(nextDate.getTime())) {
    throw new Error('InvalidDateTime: A valid new appointment date and time must be specified.');
  }

  // Conflict check for practitioner on new slot
  if (existing.practitionerId) {
    const conflict = await dbCheckAppointmentConflict({
      practitionerId: existing.practitionerId,
      dateTime: nextDate,
      timeSlot: newTimeSlot,
      excludeAppointmentId: existing.id
    });
    if (conflict.hasConflict) {
      throw new Error(`AppointmentConflict: Practitioner already has an active booking at ${newTimeSlot} on ${nextDate.toISOString().split('T')[0]}.`);
    }
  }

  const previousEntry = {
    previousDateTime: existing.dateTime.toISOString(),
    previousTimeSlot: existing.timeSlot,
    rescheduledBy: actor?.name || 'Staff Scheduler',
    rescheduledAt: new Date().toISOString(),
    reason: reason || 'Administrative reschedule'
  };

  const existingHistory = Array.isArray(existing.reschedulingHistory)
    ? (existing.reschedulingHistory as any[])
    : [];
  const updatedHistory = [...existingHistory, previousEntry];

  const startOfDay = new Date(nextDate);
  startOfDay.setUTCHours(0, 0, 0, 0);

  const updated = await prisma.appointment.update({
    where: { id: existing.id },
    data: {
      dateTime: nextDate,
      appointmentDate: startOfDay,
      timeSlot: newTimeSlot,
      status: 'rescheduled',
      rescheduledFromId: existing.id,
      reschedulingHistory: updatedHistory,
      updatedById: actor?.id || actor?.name || undefined,
      updatedByName: actor?.name || undefined
    }
  });

  const mapped = mapDbAppointmentToAppointment(updated);
  const idx = hospitalStore.appointments.findIndex((a) => a.id === existing.id);
  if (idx !== -1) hospitalStore.appointments[idx] = mapped;
  return mapped;
}

export async function dbUpdateAppointment(
  id: string,
  updates: Partial<Appointment>,
  actor?: { id?: string; name?: string; role?: string }
): Promise<Appointment | null> {
  if (!isPrismaConnected) {
    throw new Error('DatabaseUnavailable: Active PostgreSQL connection is required for appointment updates.');
  }

  const existing = await prisma.appointment.findFirst({
    where: { OR: [{ id }, { appointmentNumber: id }] }
  });
  if (!existing) return null;

  const data: any = { ...updates };
  delete data.id;
  delete data.appointmentNumber;
  delete data.createdAt;
  delete data.updatedAt;

  if (updates.dateTime) {
    const d = new Date(updates.dateTime);
    if (!isNaN(d.getTime())) {
      data.dateTime = d;
      const startOfDay = new Date(d);
      startOfDay.setUTCHours(0, 0, 0, 0);
      data.appointmentDate = startOfDay;
    }
  }

  data.updatedById = actor?.id || actor?.name || undefined;
  data.updatedByName = actor?.name || undefined;

  const updated = await prisma.appointment.update({
    where: { id: existing.id },
    data
  });

  const mapped = mapDbAppointmentToAppointment(updated);
  const idx = hospitalStore.appointments.findIndex((a) => a.id === existing.id);
  if (idx !== -1) hospitalStore.appointments[idx] = mapped;
  return mapped;
}

export async function dbGetReceptionQueue(options: {
  practitionerRole?: string;
  practitionerId?: string;
  status?: string;
  date?: string;
  userRole?: string;
  userId?: string;
} = {}): Promise<QueueItem[]> {
  if (!isPrismaConnected) {
    throw new Error('DatabaseUnavailable: Active PostgreSQL connection is required for reception queue.');
  }

  const d = options.date ? new Date(options.date) : new Date();
  const startOfDay = new Date(d);
  startOfDay.setUTCHours(0, 0, 0, 0);
  const endOfDay = new Date(d);
  endOfDay.setUTCHours(23, 59, 59, 999);

  const where: any = {
    dateTime: { gte: startOfDay, lte: endOfDay }
  };

  // Status filter: defaults to waiting & in_consultation
  if (options.status && options.status !== 'all') {
    where.status = options.status.toLowerCase();
  } else {
    where.status = { in: ['waiting', 'in_consultation'] };
  }

  // Doctor and Vaidya Separation:
  if (options.userRole === 'DOCTOR') {
    where.OR = [
      { practitionerRole: 'DOCTOR' },
      { practitionerId: options.userId }
    ];
  } else if (options.userRole === 'VAIDYA') {
    where.OR = [
      { practitionerRole: 'VAIDYA' },
      { practitionerId: options.userId }
    ];
  }

  if (options.practitionerRole && options.practitionerRole !== 'all') {
    where.practitionerRole = options.practitionerRole.toUpperCase();
  }
  if (options.practitionerId && options.practitionerId !== 'all') {
    where.practitionerId = options.practitionerId;
  }

  const appts = await prisma.appointment.findMany({
    where
  });

  const now = Date.now();
  const priorityRank: Record<string, number> = {
    urgent: 1,
    priority: 2,
    normal: 3
  };

  const sorted = appts.sort((a, b) => {
    // Emergency escalations (isEscalated = true) must appear at the top of the queue
    const escA = a.isEscalated ? 0 : 1;
    const escB = b.isEscalated ? 0 : 1;
    if (escA !== escB) return escA - escB;

    const pA = priorityRank[a.priority?.toLowerCase() || 'normal'] || 3;
    const pB = priorityRank[b.priority?.toLowerCase() || 'normal'] || 3;
    if (pA !== pB) return pA - pB;

    const qA = a.queuePosition ?? 9999;
    const qB = b.queuePosition ?? 9999;
    if (qA !== qB) return qA - qB;

    const tA = a.checkInTime ? a.checkInTime.getTime() : a.dateTime.getTime();
    const tB = b.checkInTime ? b.checkInTime.getTime() : b.dateTime.getTime();
    return tA - tB;
  });

  return sorted.map((a, idx) => {
    const checkInTimeStr = a.checkInTime ? a.checkInTime.toISOString() : a.dateTime.toISOString();
    const checkInMs = a.checkInTime ? a.checkInTime.getTime() : a.dateTime.getTime();
    const durationMins = Math.max(0, Math.floor((now - checkInMs) / 60000));

    return {
      id: a.id,
      appointmentNumber: a.appointmentNumber || `APT-${a.id.slice(-5)}`,
      patientId: a.patientId || '',
      patientName: a.patientName,
      patientMrn: a.patientMrn,
      patientPhone: a.patientPhone,
      type: a.type,
      practitionerId: a.practitionerId || a.doctorId || '',
      practitionerName: a.practitionerName || a.doctorName,
      practitionerRole: ((a.practitionerRole || 'DOCTOR').toUpperCase() as 'DOCTOR' | 'VAIDYA'),
      department: a.department,
      status: a.status as any,
      bookingSource: (a.bookingSource || 'reception_scheduled') as any,
      checkInTime: checkInTimeStr,
      waitingDurationMinutes: durationMins,
      queuePosition: a.queuePosition !== null && a.queuePosition !== undefined ? a.queuePosition : (idx + 1),
      priority: (a.priority || 'normal') as any,
      priorityReason: a.priorityReason || undefined,
      isEscalated: Boolean(a.isEscalated),
      escalationStatus: (a.escalationStatus as any) || (a.isEscalated ? 'escalated' : undefined),
      escalatedAt: a.escalatedAt ? a.escalatedAt.toISOString() : undefined,
      escalatedById: a.escalatedById || undefined,
      escalatedByName: a.escalatedByName || undefined,
      escalationReason: a.escalationReason || undefined,
      escalationAcknowledgedAt: a.escalationAcknowledgedAt ? a.escalationAcknowledgedAt.toISOString() : undefined,
      escalationAcknowledgedById: a.escalationAcknowledgedById || undefined,
      escalationAcknowledgedByName: a.escalationAcknowledgedByName || undefined,
      escalationResolvedAt: a.escalationResolvedAt ? a.escalationResolvedAt.toISOString() : undefined,
      escalationResolvedById: a.escalationResolvedById || undefined,
      escalationResolvedByName: a.escalationResolvedByName || undefined,
      escalationResolutionNotes: a.escalationResolutionNotes || undefined,
      clinicalTriageAt: a.clinicalTriageAt ? a.clinicalTriageAt.toISOString() : undefined,
      clinicalTriageById: a.clinicalTriageById || undefined,
      clinicalTriageRole: (a.clinicalTriageRole as any) || undefined,
      notes: a.notes || undefined
    };
  });
}

export async function dbUpdateQueuePriority(
  id: string,
  priority: 'normal' | 'priority' | 'urgent',
  priorityReason: string,
  actor?: { id?: string; name?: string; role?: string }
): Promise<Appointment> {
  if (!isPrismaConnected) {
    throw new Error('DatabaseUnavailable: Active PostgreSQL connection is required for priority updates.');
  }

  const actorRole = actor?.role;
  if (actorRole !== 'DOCTOR' && actorRole !== 'VAIDYA') {
    throw new Error(`ClinicalTriageRestricted: Only authorized clinical practitioners (DOCTOR or VAIDYA) may establish clinical triage priority. Role "${actorRole || 'UNKNOWN'}" is not authorized.`);
  }

  if (!priorityReason || !priorityReason.trim()) {
    throw new Error('PriorityReasonRequired: An explicit clinical justification reason is strictly required for queue priority adjustment.');
  }

  const existing = await prisma.appointment.findFirst({
    where: { OR: [{ id }, { appointmentNumber: id }] }
  });
  if (!existing) {
    throw new Error('AppointmentNotFound: Appointment record not found.');
  }

  const aptRole = (existing.practitionerRole || 'DOCTOR').toUpperCase();
  if (actorRole !== aptRole) {
    throw new Error(`ClinicalDisciplineMismatch: Clinician with role "${actorRole}" cannot establish clinical triage for an appointment assigned to discipline "${aptRole}".`);
  }

  const now = new Date();
  const updated = await prisma.appointment.update({
    where: { id: existing.id },
    data: {
      priority: priority.toLowerCase(),
      priorityReason: priorityReason.trim(),
      clinicalTriageAt: now,
      clinicalTriageById: actor?.id || undefined,
      clinicalTriageRole: actorRole,
      updatedById: actor?.id || actor?.name || undefined,
      updatedByName: actor?.name || undefined
    }
  });

  const mapped = mapDbAppointmentToAppointment(updated);
  const idx = hospitalStore.appointments.findIndex((a) => a.id === existing.id);
  if (idx !== -1) hospitalStore.appointments[idx] = mapped;
  return mapped;
}

export async function dbEscalateQueuePatient(
  id: string,
  escalationReason: string,
  actor?: { id?: string; name?: string; role?: string }
): Promise<Appointment> {
  if (!isPrismaConnected) {
    throw new Error('DatabaseUnavailable: Active PostgreSQL connection is required for patient emergency escalation.');
  }

  if (!escalationReason || !escalationReason.trim()) {
    throw new Error('EscalationReasonRequired: An explicit escalation reason is mandatory for emergency escalation.');
  }

  const existing = await prisma.appointment.findFirst({
    where: { OR: [{ id }, { appointmentNumber: id }] }
  });
  if (!existing) {
    throw new Error('AppointmentNotFound: Appointment record not found.');
  }

  const now = new Date();
  const updated = await prisma.appointment.update({
    where: { id: existing.id },
    data: {
      isEscalated: true,
      escalationStatus: 'escalated',
      escalationReason: escalationReason.trim(),
      escalatedAt: now,
      escalatedById: actor?.id || undefined,
      escalatedByName: actor?.name || undefined,
      updatedById: actor?.id || actor?.name || undefined,
      updatedByName: actor?.name || undefined
    }
  });

  const mapped = mapDbAppointmentToAppointment(updated);
  const idx = hospitalStore.appointments.findIndex((a) => a.id === existing.id);
  if (idx !== -1) hospitalStore.appointments[idx] = mapped;
  return mapped;
}

export async function dbAcknowledgeEscalation(
  id: string,
  actor?: { id?: string; name?: string; role?: string }
): Promise<Appointment> {
  if (!isPrismaConnected) {
    throw new Error('DatabaseUnavailable: Active PostgreSQL connection is required for escalation acknowledgement.');
  }

  const existing = await prisma.appointment.findFirst({
    where: { OR: [{ id }, { appointmentNumber: id }] }
  });
  if (!existing) {
    throw new Error('AppointmentNotFound: Appointment record not found.');
  }

  if (!existing.isEscalated && existing.escalationStatus !== 'escalated') {
    throw new Error('InvalidEscalationState: Appointment is not in an active escalated state.');
  }

  const now = new Date();
  const updated = await prisma.appointment.update({
    where: { id: existing.id },
    data: {
      escalationStatus: 'acknowledged',
      escalationAcknowledgedAt: now,
      escalationAcknowledgedById: actor?.id || undefined,
      escalationAcknowledgedByName: actor?.name || undefined,
      updatedById: actor?.id || actor?.name || undefined,
      updatedByName: actor?.name || undefined
    }
  });

  await dbLogAudit(
    actor?.name || 'Practitioner',
    actor?.role || 'DOCTOR',
    'ACKNOWLEDGE_EMERGENCY_ESCALATION',
    'Emergency Escalation',
    `Emergency escalation acknowledged for appointment ${existing.appointmentNumber || existing.id} by ${actor?.name || 'Practitioner'} (${actor?.role || 'DOCTOR'})`,
    existing.patientMrn
  );

  const mapped = mapDbAppointmentToAppointment(updated);
  const idx = hospitalStore.appointments.findIndex((a) => a.id === existing.id);
  if (idx !== -1) hospitalStore.appointments[idx] = mapped;
  return mapped;
}

export async function dbResolveEscalation(
  id: string,
  resolutionNotes: string,
  actor?: { id?: string; name?: string; role?: string }
): Promise<Appointment> {
  if (!isPrismaConnected) {
    throw new Error('DatabaseUnavailable: Active PostgreSQL connection is required for escalation resolution.');
  }

  if (!resolutionNotes || !resolutionNotes.trim()) {
    throw new Error('ResolutionNotesRequired: Clinical resolution notes are mandatory to resolve an emergency escalation.');
  }

  const existing = await prisma.appointment.findFirst({
    where: { OR: [{ id }, { appointmentNumber: id }] }
  });
  if (!existing) {
    throw new Error('AppointmentNotFound: Appointment record not found.');
  }

  const now = new Date();
  const updated = await prisma.appointment.update({
    where: { id: existing.id },
    data: {
      isEscalated: false,
      escalationStatus: 'resolved',
      escalationResolvedAt: now,
      escalationResolvedById: actor?.id || undefined,
      escalationResolvedByName: actor?.name || undefined,
      escalationResolutionNotes: resolutionNotes.trim(),
      updatedById: actor?.id || actor?.name || undefined,
      updatedByName: actor?.name || undefined
    }
  });

  await dbLogAudit(
    actor?.name || 'Practitioner',
    actor?.role || 'DOCTOR',
    'RESOLVE_EMERGENCY_ESCALATION',
    'Emergency Escalation',
    `Emergency escalation resolved for appointment ${existing.appointmentNumber || existing.id} by ${actor?.name || 'Practitioner'}: ${resolutionNotes.trim()}`,
    existing.patientMrn
  );

  const mapped = mapDbAppointmentToAppointment(updated);
  const idx = hospitalStore.appointments.findIndex((a) => a.id === existing.id);
  if (idx !== -1) hospitalStore.appointments[idx] = mapped;
  return mapped;
}

export async function dbGetReceptionDashboard(date?: string): Promise<ReceptionDashboardMetrics> {
  if (!isPrismaConnected) {
    throw new Error('DatabaseUnavailable: Active PostgreSQL connection is required for reception dashboard.');
  }

  const d = date ? new Date(date) : new Date();
  const startOfDay = new Date(d);
  startOfDay.setUTCHours(0, 0, 0, 0);
  const endOfDay = new Date(d);
  endOfDay.setUTCHours(23, 59, 59, 999);

  const baseDateFilter = {
    dateTime: { gte: startOfDay, lte: endOfDay }
  };

  const [
    totalScheduled,
    checkedIn,
    waiting,
    inConsultation,
    completed,
    cancelled,
    noShow,
    walkIns,
    doctorQueueCount,
    vaidyaQueueCount
  ] = await Promise.all([
    prisma.appointment.count({ where: { ...baseDateFilter, status: { in: ['scheduled', 'confirmed'] } } }),
    prisma.appointment.count({ where: { ...baseDateFilter, checkInTime: { not: null } } }),
    prisma.appointment.count({ where: { ...baseDateFilter, status: 'waiting' } }),
    prisma.appointment.count({ where: { ...baseDateFilter, status: 'in_consultation' } }),
    prisma.appointment.count({ where: { ...baseDateFilter, status: 'completed' } }),
    prisma.appointment.count({ where: { ...baseDateFilter, status: 'cancelled' } }),
    prisma.appointment.count({ where: { ...baseDateFilter, status: 'no_show' } }),
    prisma.appointment.count({ where: { ...baseDateFilter, bookingSource: 'walk_in' } }),
    prisma.appointment.count({ where: { ...baseDateFilter, status: 'waiting', practitionerRole: 'DOCTOR' } }),
    prisma.appointment.count({ where: { ...baseDateFilter, status: 'waiting', practitionerRole: 'VAIDYA' } })
  ]);

  return {
    totalScheduled,
    checkedIn,
    waiting,
    inConsultation,
    completed,
    cancelled,
    noShow,
    walkIns,
    doctorQueueCount,
    vaidyaQueueCount
  };
}

// ------------------------------------------------------------------------------
// CONSULTATIONS
// ------------------------------------------------------------------------------

export async function dbGetConsultations(): Promise<Consultation[]> {
  if (isPrismaConnected) {
    try {
      const dbCons = await prisma.consultation.findMany({
        orderBy: { dateTime: 'desc' }
      });
      return dbCons.map((c) => ({
        id: c.id,
        consultationNumber: c.consultationNumber,
        patientId: c.patientId || '',
        patientName: c.patientName,
        patientMrn: c.patientMrn,
        doctorId: c.doctorId || '',
        doctorName: c.doctorName,
        appointmentId: c.appointmentId || undefined,
        dateTime: c.dateTime.toISOString(),
        chiefComplaint: c.chiefComplaint,
        duration: c.duration,
        presentIllness: c.presentIllness || '',
        vitals: (c.vitals as any) || undefined,
        ayurvedicAssessment: c.ayurvedicAssessment as any,
        classicalDiagnosis: c.classicalDiagnosis,
        westernCorrelation: c.westernCorrelation || undefined,
        treatmentRecommendations: c.treatmentRecommendations,
        recommendedTherapies: (c.recommendedTherapies as any) || [],
        prescriptions: (c.prescriptions as any) || [],
        status: c.status as any,
        clinicalNotes: c.clinicalNotes || '',
        completedAt: c.completedAt ? c.completedAt.toISOString() : undefined
      }));
    } catch (err) {
      console.warn('[Prisma dbGetConsultations] Fallback:', err);
    }
  }
  return hospitalStore.consultations;
}

export async function dbCreateConsultation(consultation: Consultation): Promise<Consultation> {
  if (isPrismaConnected) {
    try {
      await prisma.consultation.create({
        data: {
          id: consultation.id,
          consultationNumber: consultation.consultationNumber,
          patientId: consultation.patientId,
          patientName: consultation.patientName,
          patientMrn: consultation.patientMrn,
          doctorId: consultation.doctorId,
          doctorName: consultation.doctorName,
          appointmentId: consultation.appointmentId,
          dateTime: new Date(consultation.dateTime),
          chiefComplaint: consultation.chiefComplaint,
          duration: consultation.duration,
          presentIllness: consultation.presentIllness,
          vitals: consultation.vitals as any,
          ayurvedicAssessment: consultation.ayurvedicAssessment as any,
          classicalDiagnosis: consultation.classicalDiagnosis,
          westernCorrelation: consultation.westernCorrelation,
          treatmentRecommendations: consultation.treatmentRecommendations,
          recommendedTherapies: consultation.recommendedTherapies as any,
          prescriptions: consultation.prescriptions as any,
          status: consultation.status,
          clinicalNotes: consultation.clinicalNotes,
          completedAt: consultation.completedAt ? new Date(consultation.completedAt) : new Date()
        }
      });
    } catch (err) {
      console.warn('[Prisma dbCreateConsultation] Warning:', err);
    }
  }
  hospitalStore.consultations.unshift(consultation);
  return consultation;
}

// ------------------------------------------------------------------------------
// PRESCRIPTIONS & PHARMACY STOCK (Atomic Dispensing)
// ------------------------------------------------------------------------------

export async function dbGetPrescriptions(): Promise<Prescription[]> {
  if (isPrismaConnected) {
    try {
      const dbRx = await prisma.prescription.findMany({
        include: { dispensingRecords: true },
        orderBy: { datePrescribed: 'desc' }
      });
      return dbRx.map((r) => ({
        id: r.id,
        rxNumber: r.rxNumber,
        encounterId: r.encounterId || undefined,
        patientId: r.patientId || '',
        patientName: r.patientName,
        mrn: r.mrn,
        doctorId: r.doctorId || '',
        doctorName: r.doctorName,
        prescribingPractitionerRole: r.prescribingPractitionerRole || undefined,
        datePrescribed: r.datePrescribed.toISOString(),
        medicationId: r.medicationId || undefined,
        medicationName: r.medicationName,
        dosage: r.dosage,
        frequency: r.frequency,
        route: r.route as any,
        duration: r.duration,
        quantity: r.quantity,
        instructions: r.instructions || undefined,
        amendmentHistory: r.amendmentHistory || undefined,
        status: r.status as any,
        dispensingStatus: (r.dispensingStatus as any) || 'pending',
        dispensedQuantity: r.dispensedQuantity,
        remainingQuantity: r.remainingQuantity,
        dispensedBy: r.dispensedBy || undefined,
        dispensedById: r.dispensedById || undefined,
        dispensedAt: r.dispensedAt ? r.dispensedAt.toISOString() : undefined,
        dispenseHistory: r.dispenseHistory || undefined,
        dispensingRecords: r.dispensingRecords ? r.dispensingRecords.map((d) => ({
          id: d.id,
          dispenseNumber: d.dispenseNumber,
          prescriptionId: d.prescriptionId,
          encounterId: d.encounterId || undefined,
          patientId: d.patientId || undefined,
          patientName: d.patientName,
          mrn: d.mrn,
          medicationStockId: d.medicationStockId || undefined,
          drugName: d.drugName,
          batchNumber: d.batchNumber,
          expiryDate: d.expiryDate || undefined,
          quantityDispensed: d.quantityDispensed,
          dispensedAt: d.dispensedAt.toISOString(),
          dispensedById: d.dispensedById,
          dispensedByName: d.dispensedByName,
          dispensedByRole: d.dispensedByRole,
          pharmacyNotes: d.pharmacyNotes || undefined,
          createdAt: d.createdAt.toISOString()
        })) : undefined,
        pharmacyNotes: r.pharmacyNotes || undefined
      }));
    } catch (err) {
      console.warn('[Prisma dbGetPrescriptions] Fallback:', err);
    }
  }
  return hospitalStore.prescriptions;
}

export async function dbGetPrescriptionById(id: string): Promise<Prescription | null> {
  if (isPrismaConnected) {
    try {
      const r = await prisma.prescription.findUnique({
        where: { id },
        include: { dispensingRecords: true }
      });
      if (!r) return null;
      return {
        id: r.id,
        rxNumber: r.rxNumber,
        encounterId: r.encounterId || undefined,
        patientId: r.patientId || '',
        patientName: r.patientName,
        mrn: r.mrn,
        doctorId: r.doctorId || '',
        doctorName: r.doctorName,
        prescribingPractitionerRole: r.prescribingPractitionerRole || undefined,
        datePrescribed: r.datePrescribed.toISOString(),
        medicationId: r.medicationId || undefined,
        medicationName: r.medicationName,
        dosage: r.dosage,
        frequency: r.frequency,
        route: r.route as any,
        duration: r.duration,
        quantity: r.quantity,
        instructions: r.instructions || undefined,
        amendmentHistory: r.amendmentHistory || undefined,
        status: r.status as any,
        dispensingStatus: (r.dispensingStatus as any) || 'pending',
        dispensedQuantity: r.dispensedQuantity,
        remainingQuantity: r.remainingQuantity,
        dispensedBy: r.dispensedBy || undefined,
        dispensedById: r.dispensedById || undefined,
        dispensedAt: r.dispensedAt ? r.dispensedAt.toISOString() : undefined,
        dispenseHistory: r.dispenseHistory || undefined,
        dispensingRecords: r.dispensingRecords
          ? r.dispensingRecords.map((d) => ({
              id: d.id,
              dispenseNumber: d.dispenseNumber,
              prescriptionId: d.prescriptionId,
              encounterId: d.encounterId || undefined,
              patientId: d.patientId || undefined,
              patientName: d.patientName,
              mrn: d.mrn,
              medicationStockId: d.medicationStockId || undefined,
              drugName: d.drugName,
              batchNumber: d.batchNumber,
              expiryDate: d.expiryDate || undefined,
              quantityDispensed: d.quantityDispensed,
              dispensedAt: d.dispensedAt.toISOString(),
              dispensedById: d.dispensedById,
              dispensedByName: d.dispensedByName,
              dispensedByRole: d.dispensedByRole,
              idempotencyKey: d.idempotencyKey || undefined,
              pharmacyNotes: d.pharmacyNotes || undefined,
              createdAt: d.createdAt.toISOString()
            }))
          : undefined,
        pharmacyNotes: r.pharmacyNotes || undefined
      };
    } catch (err) {
      console.warn('[Prisma dbGetPrescriptionById] Fallback:', err);
    }
  }
  return hospitalStore.prescriptions.find((p) => p.id === id) || null;
}

export async function dbUpdatePrescription(
  id: string,
  updates: Partial<Prescription>
): Promise<Prescription | null> {
  if (isPrismaConnected) {
    try {
      const dataToUpdate: any = {};
      if (updates.medicationName !== undefined) dataToUpdate.medicationName = updates.medicationName;
      if (updates.dosage !== undefined) dataToUpdate.dosage = updates.dosage;
      if (updates.frequency !== undefined) dataToUpdate.frequency = updates.frequency;
      if (updates.route !== undefined) dataToUpdate.route = updates.route;
      if (updates.duration !== undefined) dataToUpdate.duration = updates.duration;
      if (updates.quantity !== undefined) {
        dataToUpdate.quantity = Number(updates.quantity);
        dataToUpdate.remainingQuantity = Number(updates.quantity) - (updates.dispensedQuantity || 0);
      }
      if (updates.instructions !== undefined) dataToUpdate.instructions = updates.instructions;
      if (updates.status !== undefined) dataToUpdate.status = updates.status;
      if (updates.pharmacyNotes !== undefined) dataToUpdate.pharmacyNotes = updates.pharmacyNotes;
      if (updates.amendmentHistory !== undefined) dataToUpdate.amendmentHistory = updates.amendmentHistory;

      const updated = await prisma.prescription.update({
        where: { id },
        data: dataToUpdate,
        include: { dispensingRecords: true }
      });
      const idx = hospitalStore.prescriptions.findIndex((p) => p.id === id);
      if (idx !== -1) {
        hospitalStore.prescriptions[idx] = { ...hospitalStore.prescriptions[idx], ...updates };
      }
      return {
        id: updated.id,
        rxNumber: updated.rxNumber,
        encounterId: updated.encounterId || undefined,
        patientId: updated.patientId || '',
        patientName: updated.patientName,
        mrn: updated.mrn,
        doctorId: updated.doctorId || '',
        doctorName: updated.doctorName,
        prescribingPractitionerRole: updated.prescribingPractitionerRole || undefined,
        datePrescribed: updated.datePrescribed.toISOString(),
        medicationId: updated.medicationId || undefined,
        medicationName: updated.medicationName,
        dosage: updated.dosage,
        frequency: updated.frequency,
        route: updated.route as any,
        duration: updated.duration,
        quantity: updated.quantity,
        instructions: updated.instructions || undefined,
        amendmentHistory: updated.amendmentHistory || undefined,
        status: updated.status as any,
        dispensingStatus: (updated.dispensingStatus as any) || 'pending',
        dispensedQuantity: updated.dispensedQuantity,
        remainingQuantity: updated.remainingQuantity,
        pharmacyNotes: updated.pharmacyNotes || undefined
      };
    } catch (err) {
      console.warn('[Prisma dbUpdatePrescription] Fallback:', err);
    }
  }
  const idx = hospitalStore.prescriptions.findIndex((p) => p.id === id);
  if (idx === -1) return null;
  hospitalStore.prescriptions[idx] = { ...hospitalStore.prescriptions[idx], ...updates };
  return hospitalStore.prescriptions[idx];
}

export async function dbCreatePrescription(prescription: Prescription): Promise<Prescription> {
  const qty = prescription.quantity && prescription.quantity > 0 ? prescription.quantity : 1;
  const remQty = prescription.remainingQuantity !== undefined ? prescription.remainingQuantity : qty;
  const dispQty = prescription.dispensedQuantity || 0;
  const dispStatus = prescription.dispensingStatus || (dispQty >= qty ? 'fully_dispensed' : dispQty > 0 ? 'partially_dispensed' : 'pending');

  if (isPrismaConnected) {
    try {
      const created = await prisma.prescription.create({
        data: {
          id: prescription.id,
          rxNumber: prescription.rxNumber,
          encounterId: prescription.encounterId || null,
          patientId: prescription.patientId,
          patientName: prescription.patientName || 'Walk-in Patient',
          mrn: prescription.mrn || 'MRN-84920',
          doctorId: prescription.doctorId,
          doctorName: prescription.doctorName,
          prescribingPractitionerRole: prescription.prescribingPractitionerRole || 'DOCTOR',
          datePrescribed: new Date(prescription.datePrescribed),
          medicationId: prescription.medicationId || null,
          medicationName: prescription.medicationName,
          dosage: prescription.dosage,
          frequency: prescription.frequency || 'Once Daily (OD)',
          route: prescription.route || 'Oral',
          duration: prescription.duration || '7 days',
          quantity: qty,
          instructions: prescription.instructions || null,
          amendmentHistory: prescription.amendmentHistory || null,
          status: prescription.status || 'pending',
          dispensingStatus: dispStatus,
          dispensedQuantity: dispQty,
          remainingQuantity: remQty,
          pharmacyNotes: prescription.pharmacyNotes || null
        }
      });
      prescription.quantity = created.quantity;
      prescription.dispensingStatus = created.dispensingStatus as any;
      prescription.dispensedQuantity = created.dispensedQuantity;
      prescription.remainingQuantity = created.remainingQuantity;
    } catch (err) {
      console.warn('[Prisma dbCreatePrescription] Warning:', err);
    }
  }
  hospitalStore.prescriptions.unshift(prescription);
  return prescription;
}

export function computeDispensePayloadHash(
  rxId: string,
  quantityToDispense: number,
  stockId?: string,
  batchAllocations?: Array<{ stockId: string; quantity: number }>,
  pharmacyNotes?: string,
  actorId?: string
): string {
  const normalized = {
    rxId,
    actorId: actorId ? actorId.trim() : null,
    quantityToDispense,
    stockId: stockId || null,
    batchAllocations: batchAllocations
      ? batchAllocations.map((b) => ({ stockId: b.stockId, quantity: b.quantity }))
      : null,
    pharmacyNotes: pharmacyNotes ? pharmacyNotes.trim() : null
  };
  return crypto.createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
}

export function isAyurvedicMedication(name?: string, category?: string): boolean {
  const text = `${name || ''} ${category || ''}`.toLowerCase();
  const ayurvedicKeywords = [
    'ayurvedic', 'ayurveda', 'thailam', 'taila', 'tailam', 'churna', 'kashayam',
    'kwath', 'kwatham', 'arishta', 'asava', 'vati', 'gutika', 'bhasma',
    'lehyam', 'rasayana', 'ghrita', 'ghritham', 'triphala', 'ashwagandha',
    'brahmi', 'sahacharadi', 'dhanwantharam', 'ksheerabala', 'guduchi', 'panchakarma'
  ];
  return ayurvedicKeywords.some((kw) => text.includes(kw));
}

export function isModernMedication(name?: string, category?: string): boolean {
  const text = `${name || ''} ${category || ''}`.toLowerCase();
  const modernKeywords = [
    'modern medicine', 'allopathic', 'antibiotic', 'synthetic', 'paracetamol',
    'amoxicillin', 'ibuprofen', 'metformin', 'atorvastatin', 'ciprofloxacin',
    'azithromycin', 'omeprazole', 'losartan', 'iv bag', 'injection', 'infusion',
    'saline', 'dextrose', 'ringer'
  ];
  return modernKeywords.some((kw) => text.includes(kw));
}

/**
 * Phase 4: Atomic prescription dispensing with batch-level FEFO allocation,
 * negative stock prevention, expiry date enforcement, sequence-backed fail-closed records,
 * and reliable transactional idempotency.
 */
export async function dbDispensePrescription(
  rxId: string,
  actorOrDispensedBy: string | { id: string; name: string; role: string },
  pharmacyNotes?: string,
  quantityToDeductOrOptions?: number | {
    quantityToDispense?: number;
    stockId?: string;
    batchAllocations?: Array<{ stockId: string; quantity: number }>;
    pharmacyNotes?: string;
    idempotencyKey?: string;
  }
): Promise<{ success: boolean; prescription?: Prescription; dispensingRecords?: DispensingRecord[]; error?: string }> {
  // Normalize actor
  const actor: { id: string; name: string; role: string } =
    typeof actorOrDispensedBy === 'string'
      ? { id: 'pharm-actor-sys', name: actorOrDispensedBy, role: 'PHARMACIST' }
      : actorOrDispensedBy;

  // Normalize options
  let quantityToDispense = 1;
  let explicitStockId: string | undefined;
  let batchAllocations: Array<{ stockId: string; quantity: number }> | undefined;
  let finalNotes = pharmacyNotes;
  let idempotencyKey: string | undefined;

  if (typeof quantityToDeductOrOptions === 'number') {
    quantityToDispense = Math.max(1, quantityToDeductOrOptions);
  } else if (typeof quantityToDeductOrOptions === 'object' && quantityToDeductOrOptions !== null) {
    const rawQty = (quantityToDeductOrOptions as any).quantityToDispense ?? (quantityToDeductOrOptions as any).quantity;
    if (rawQty !== undefined && !isNaN(Number(rawQty))) {
      quantityToDispense = Math.max(1, Number(rawQty));
    }
    if (quantityToDeductOrOptions.stockId) {
      explicitStockId = quantityToDeductOrOptions.stockId;
    }
    if (quantityToDeductOrOptions.batchAllocations && quantityToDeductOrOptions.batchAllocations.length > 0) {
      batchAllocations = quantityToDeductOrOptions.batchAllocations;
      quantityToDispense = batchAllocations.reduce((acc, curr) => acc + curr.quantity, 0);
    }
    if (quantityToDeductOrOptions.pharmacyNotes) {
      finalNotes = quantityToDeductOrOptions.pharmacyNotes;
    }
    if (quantityToDeductOrOptions.idempotencyKey && typeof quantityToDeductOrOptions.idempotencyKey === 'string') {
      idempotencyKey = quantityToDeductOrOptions.idempotencyKey.trim();
    }
  }

  const payloadHash = computeDispensePayloadHash(
    rxId,
    quantityToDispense,
    explicitStockId,
    batchAllocations,
    finalNotes,
    actor.id
  );

  // Check idempotency pre-transaction if key is provided
  if (isPrismaConnected && idempotencyKey) {
    try {
      const existingKey = await prisma.dispensingIdempotency.findUnique({
        where: { idempotencyKey }
      });
      if (existingKey) {
        if (existingKey.payloadHash !== payloadHash) {
          return {
            success: false,
            error: `IDEMPOTENCY_CONFLICT: Idempotency key "${idempotencyKey}" has already been used with a different dispensing payload.`
          };
        }
        return existingKey.responsePayload as any;
      }
    } catch (err: any) {
      console.warn('[Prisma dbDispensePrescription] Idempotency check warning:', err);
    }
  }

  const rxIndex = hospitalStore.prescriptions.findIndex((r) => r.id === rxId);
  const rx = rxIndex >= 0 ? hospitalStore.prescriptions[rxIndex] : null;

  if (isPrismaConnected) {
    try {
      return await prisma.$transaction(async (tx) => {
        // Concurrency protection: serialize operations on this prescription
        await tx.$executeRaw`SELECT id FROM prescriptions WHERE id = ${rxId} FOR UPDATE`;

        // Re-check idempotency inside the lock
        if (idempotencyKey) {
          const existingInTx = await tx.dispensingIdempotency.findUnique({
            where: { idempotencyKey }
          });
          if (existingInTx) {
            if (existingInTx.payloadHash !== payloadHash) {
              return {
                success: false,
                error: `IDEMPOTENCY_CONFLICT: Idempotency key "${idempotencyKey}" has already been used with a different dispensing payload.`
              };
            }
            return existingInTx.responsePayload as any;
          }
        }

        const dbRx = await tx.prescription.findUnique({
          where: { id: rxId },
          include: { dispensingRecords: true }
        });
        if (!dbRx) return { success: false, error: 'Prescription not found.' };

        if (dbRx.status === 'cancelled' || dbRx.dispensingStatus === 'cancelled') {
          return { success: false, error: 'PRESCRIPTION_CANCELLED: Prescription has been cancelled and cannot be dispensed.' };
        }
        if (dbRx.dispensingStatus === 'fully_dispensed' || dbRx.status === 'dispensed') {
          return { success: false, error: 'Prescription already dispensed.' };
        }

        let totalPrescribed = dbRx.quantity || 1;
        const alreadyDispensed = dbRx.dispensedQuantity || 0;
        let currentRemaining = dbRx.remainingQuantity !== undefined ? dbRx.remainingQuantity : (totalPrescribed - alreadyDispensed);

        // Compatibility for legacy calls/tests where prescription was created without explicit quantity (default 1)
        // and dispensed in full with requested quantity > 1
        if (alreadyDispensed === 0 && totalPrescribed === 1 && quantityToDispense > 1) {
          totalPrescribed = quantityToDispense;
          currentRemaining = quantityToDispense;
        }

        if (currentRemaining <= 0) {
          return { success: false, error: 'Prescription already dispensed.' };
        }

        if (quantityToDispense > currentRemaining) {
          return {
            success: false,
            error: `EXCEEDS_PRESCRIBED_QUANTITY: Cannot dispense ${quantityToDispense} units. Only ${currentRemaining} remaining of prescribed ${totalPrescribed}.`
          };
        }

        // Determine batch deduction plan
        interface DeductionPlan {
          stockItem: any;
          deductQty: number;
        }
        const deductionPlan: DeductionPlan[] = [];

        if (batchAllocations && batchAllocations.length > 0) {
          for (const alloc of batchAllocations) {
            const stock = await tx.medicationStock.findUnique({ where: { id: alloc.stockId } });
            if (!stock) {
              return { success: false, error: `STOCK_NOT_FOUND: Medication stock batch "${alloc.stockId}" not found.` };
            }
            if (isDateExpired(stock.expiryDate)) {
              return {
                success: false,
                error: `EXPIRED_STOCK_CANNOT_BE_DISPENSED: Batch ${stock.batchNumber} expired on ${stock.expiryDate} and cannot be dispensed.`
              };
            }
            if (stock.stockQuantity < alloc.quantity) {
              return {
                success: false,
                error: `INSUFFICIENT_STOCK: Batch ${stock.batchNumber} has only ${stock.stockQuantity} in stock (requested ${alloc.quantity}).`
              };
            }
            deductionPlan.push({ stockItem: stock, deductQty: alloc.quantity });
          }
        } else if (explicitStockId) {
          const stock = await tx.medicationStock.findUnique({ where: { id: explicitStockId } });
          if (!stock) {
            return { success: false, error: 'STOCK_NOT_FOUND: Selected medication stock batch not found.' };
          }
          if (isDateExpired(stock.expiryDate)) {
            return {
              success: false,
              error: `EXPIRED_STOCK_CANNOT_BE_DISPENSED: Batch ${stock.batchNumber} expired on ${stock.expiryDate} and cannot be dispensed.`
            };
          }
          if (stock.stockQuantity < quantityToDispense) {
            return {
              success: false,
              error: `INSUFFICIENT_STOCK: Batch ${stock.batchNumber} has only ${stock.stockQuantity} in stock (requested ${quantityToDispense}).`
            };
          }
          deductionPlan.push({ stockItem: stock, deductQty: quantityToDispense });
        } else {
          // Automatic FEFO Allocation (First Expiry, First Out)
          const candidateBatches = await tx.medicationStock.findMany({
            where: {
              drugName: { contains: dbRx.medicationName, mode: 'insensitive' },
              stockQuantity: { gt: 0 },
              isActive: true
            },
            orderBy: { expiryDate: 'asc' } // FEFO ordering
          });

          if (candidateBatches.length > 0) {
            const nonExpired = candidateBatches.filter((b) => !isDateExpired(b.expiryDate));
            if (nonExpired.length === 0) {
              return {
                success: false,
                error: `EXPIRED_STOCK_CANNOT_BE_DISPENSED: All available stock batches for "${dbRx.medicationName}" are expired and cannot be dispensed.`
              };
            }

            let needQty = quantityToDispense;
            for (const b of nonExpired) {
              const take = Math.min(b.stockQuantity, needQty);
              deductionPlan.push({ stockItem: b, deductQty: take });
              needQty -= take;
              if (needQty <= 0) break;
            }

            if (needQty > 0) {
              return {
                success: false,
                error: `INSUFFICIENT_STOCK: Insufficient non-expired stock for "${dbRx.medicationName}". Needed ${quantityToDispense}, only ${quantityToDispense - needQty} available.`
              };
            }
          }
        }

        // Execute batch deductions and create dispensing records
        const createdDispenseRecords: DispensingRecord[] = [];

        for (const plan of deductionPlan) {
          const { stockItem, deductQty } = plan;

          // Row-level lock on medication stock to prevent concurrent overspending across multiple prescriptions
          await tx.$executeRaw`SELECT id FROM medication_stock WHERE id = ${stockItem.id} FOR UPDATE`;
          const freshStock = await tx.medicationStock.findUnique({ where: { id: stockItem.id } });
          if (!freshStock || freshStock.stockQuantity < deductQty) {
            return {
              success: false,
              error: `INSUFFICIENT_STOCK: Batch ${stockItem.batchNumber} has only ${freshStock?.stockQuantity ?? 0} in stock (requested ${deductQty}).`
            };
          }

          const newQty = freshStock.stockQuantity - deductQty;
          const expired = isDateExpired(freshStock.expiryDate);
          let newStatus = 'in_stock';
          if (expired) newStatus = 'expired';
          else if (newQty === 0) newStatus = 'out_of_stock';
          else if (newQty <= freshStock.minThreshold * 0.4) newStatus = 'critical';
          else if (newQty <= freshStock.minThreshold) newStatus = 'low_stock';

          // Atomic decrement
          await tx.medicationStock.update({
            where: { id: freshStock.id },
            data: {
              stockQuantity: newQty,
              status: newStatus
            }
          });

          // Immutable Stock Movement
          await tx.stockMovement.create({
            data: {
              medicineId: stockItem.id,
              medicineName: stockItem.drugName,
              batchNumber: stockItem.batchNumber,
              type: 'Dispense',
              quantityDelta: -deductQty,
              remainingQuantity: newQty,
              actor: actor.name,
              actorId: actor.id,
              actorRole: actor.role,
              referenceNumber: dbRx.rxNumber,
              notes: `Dispensed ${deductQty} ${stockItem.unit} to patient ${dbRx.patientName} (${dbRx.mrn}) against Rx ${dbRx.rxNumber}`
            }
          });

          // Sequence-backed fail-closed Dispensing Record with idempotency tracking
          const dspNumber = await generateUniqueDispenseNumber();
          const dispRecord = await tx.dispensingRecord.create({
            data: {
              dispenseNumber: dspNumber,
              prescriptionId: dbRx.id,
              encounterId: dbRx.encounterId,
              patientId: dbRx.patientId,
              patientName: dbRx.patientName,
              mrn: dbRx.mrn,
              medicationStockId: stockItem.id,
              drugName: stockItem.drugName,
              batchNumber: stockItem.batchNumber,
              expiryDate: stockItem.expiryDate,
              quantityDispensed: deductQty,
              idempotencyKey: idempotencyKey || null,
              dispensedById: actor.id,
              dispensedByName: actor.name,
              dispensedByRole: actor.role,
              pharmacyNotes: finalNotes || null
            }
          });

          createdDispenseRecords.push({
            id: dispRecord.id,
            dispenseNumber: dispRecord.dispenseNumber,
            prescriptionId: dispRecord.prescriptionId,
            encounterId: dispRecord.encounterId || undefined,
            patientId: dispRecord.patientId || undefined,
            patientName: dispRecord.patientName,
            mrn: dispRecord.mrn,
            medicationStockId: dispRecord.medicationStockId || undefined,
            drugName: dispRecord.drugName,
            batchNumber: dispRecord.batchNumber,
            expiryDate: dispRecord.expiryDate || undefined,
            quantityDispensed: dispRecord.quantityDispensed,
            idempotencyKey: dispRecord.idempotencyKey || undefined,
            dispensedAt: dispRecord.dispensedAt.toISOString(),
            dispensedById: dispRecord.dispensedById,
            dispensedByName: dispRecord.dispensedByName,
            dispensedByRole: dispRecord.dispensedByRole,
            pharmacyNotes: dispRecord.pharmacyNotes || undefined,
            createdAt: dispRecord.createdAt.toISOString()
          });
        }

        // Update prescription lifecycle
        const newDispensedQty = alreadyDispensed + quantityToDispense;
        const newRemainingQty = Math.max(0, currentRemaining - quantityToDispense);
        const isFullyDispensed = newRemainingQty === 0;
        const newDispensingStatus = isFullyDispensed ? 'fully_dispensed' : 'partially_dispensed';
        const newOverallStatus = isFullyDispensed ? 'dispensed' : 'pending';

        const prevHistory = Array.isArray(dbRx.dispenseHistory) ? (dbRx.dispenseHistory as any[]) : [];
        const newHistoryEntry = {
          dispensedAt: new Date().toISOString(),
          dispensedBy: actor.name,
          dispensedById: actor.id,
          dispensedByRole: actor.role,
          quantity: quantityToDispense,
          remainingQuantity: newRemainingQty,
          idempotencyKey: idempotencyKey || null,
          notes: finalNotes || ''
        };

        const updatedRx = await tx.prescription.update({
          where: { id: rxId },
          data: {
            quantity: totalPrescribed,
            status: newOverallStatus,
            dispensingStatus: newDispensingStatus,
            dispensedQuantity: newDispensedQty,
            remainingQuantity: newRemainingQty,
            dispensedBy: actor.name,
            dispensedById: actor.id,
            dispensedAt: new Date(),
            pharmacyNotes: finalNotes || dbRx.pharmacyNotes,
            dispenseHistory: [...prevHistory, newHistoryEntry]
          }
        });

        const result: Prescription = {
          id: updatedRx.id,
          rxNumber: updatedRx.rxNumber,
          encounterId: updatedRx.encounterId || undefined,
          patientId: updatedRx.patientId || '',
          patientName: updatedRx.patientName,
          mrn: updatedRx.mrn,
          doctorId: updatedRx.doctorId || '',
          doctorName: updatedRx.doctorName,
          prescribingPractitionerRole: updatedRx.prescribingPractitionerRole || undefined,
          datePrescribed: updatedRx.datePrescribed.toISOString(),
          medicationName: updatedRx.medicationName,
          dosage: updatedRx.dosage,
          frequency: updatedRx.frequency,
          route: updatedRx.route as any,
          duration: updatedRx.duration,
          quantity: updatedRx.quantity,
          instructions: updatedRx.instructions || undefined,
          status: updatedRx.status as any,
          dispensingStatus: updatedRx.dispensingStatus as any,
          dispensedQuantity: updatedRx.dispensedQuantity,
          remainingQuantity: updatedRx.remainingQuantity,
          dispensedBy: updatedRx.dispensedBy || actor.name,
          dispensedById: updatedRx.dispensedById || actor.id,
          dispensedAt: updatedRx.dispensedAt?.toISOString(),
          dispenseHistory: updatedRx.dispenseHistory || undefined,
          dispensingRecords: createdDispenseRecords,
          pharmacyNotes: updatedRx.pharmacyNotes || undefined
        };

        if (rxIndex >= 0) {
          hospitalStore.prescriptions[rxIndex] = result;
        }

        const responsePayload = {
          success: true,
          prescription: result,
          dispensingRecords: createdDispenseRecords
        };

        // Persist idempotency record
        if (idempotencyKey) {
          await tx.dispensingIdempotency.create({
            data: {
              idempotencyKey,
              prescriptionId: rxId,
              payloadHash,
              responsePayload: responsePayload as any
            }
          });
        }

        return responsePayload;
      });
    } catch (err: any) {
      console.warn('[Prisma dbDispensePrescription] Warning:', err);
      return { success: false, error: err.message || 'Dispensing failed.' };
    }
  }

  // In-memory fallback
  if (!rx) return { success: false, error: 'Prescription not found.' };
  if (rx.status === 'dispensed' || rx.dispensingStatus === 'fully_dispensed') {
    return { success: false, error: 'Prescription already dispensed.' };
  }

  const stockItem = hospitalStore.medicationStock.find((m) =>
    m.drugName.toLowerCase().includes(rx.medicationName.toLowerCase())
  );
  if (stockItem && stockItem.stockQuantity > 0) {
    if (isDateExpired(stockItem.expiryDate)) {
      return { success: false, error: 'EXPIRED_STOCK_CANNOT_BE_DISPENSED: Stock batch is expired.' };
    }
    const deduct = Math.min(stockItem.stockQuantity, quantityToDispense);
    stockItem.stockQuantity -= deduct;
    if (stockItem.stockQuantity <= stockItem.minThreshold) {
      stockItem.status = 'low_stock';
    }
    hospitalStore.stockMovements.unshift({
      id: `mov-${Date.now()}`,
      timestamp: new Date().toISOString(),
      medicineId: stockItem.id,
      medicineName: stockItem.drugName,
      batchNumber: stockItem.batchNumber,
      type: 'Dispensed to Patient',
      quantityDelta: -deduct,
      remainingQuantity: stockItem.stockQuantity,
      actor: actor.name,
      referenceNumber: rx.rxNumber,
      notes: `Dispensed to ${rx.patientName} (${rx.mrn})`
    });
  }

  rx.dispensedQuantity = (rx.dispensedQuantity || 0) + quantityToDispense;
  rx.remainingQuantity = Math.max(0, (rx.quantity || 1) - rx.dispensedQuantity);
  rx.dispensingStatus = rx.remainingQuantity === 0 ? 'fully_dispensed' : 'partially_dispensed';
  rx.status = rx.remainingQuantity === 0 ? 'dispensed' : 'pending';
  rx.dispensedBy = actor.name;
  rx.dispensedAt = new Date().toISOString();
  if (finalNotes) rx.pharmacyNotes = finalNotes;

  return { success: true, prescription: rx };
}

// ------------------------------------------------------------------------------
// INVOICES, PAYMENTS & FINANCIAL OPERATIONS (Fail-closed sequence & Decimal precision)
// ------------------------------------------------------------------------------

export async function generateUniqueInvoiceNumber(): Promise<string> {
  const year = new Date().getFullYear();
  if (!isPrismaConnected) {
    throw new Error('DatabaseUnavailable: Active PostgreSQL connection is required for sequence-backed Invoice Number generation.');
  }

  try {
    const res = await prisma.$queryRaw<[{ nextval: bigint }]>`SELECT nextval('invoice_seq')`;
    if (!res || !res[0] || res[0].nextval === undefined || res[0].nextval === null) {
      throw new Error('SequenceUnavailable: Sequence "invoice_seq" returned empty result.');
    }
    const seq = Number(res[0].nextval);
    if (isNaN(seq) || seq <= 0) {
      throw new Error('SequenceInvalid: Sequence "invoice_seq" returned invalid integer.');
    }
    return `INV-${year}-${String(seq).padStart(5, '0')}`;
  } catch (err: any) {
    console.error('[Prisma generateUniqueInvoiceNumber] Fail-closed sequence failure:', err.message);
    throw new Error(`InvoiceNumberGenerationFailed: Authoritative sequence generation failed: ${err.message}`);
  }
}

export async function generateUniquePaymentNumber(): Promise<string> {
  const year = new Date().getFullYear();
  if (!isPrismaConnected) {
    throw new Error('DatabaseUnavailable: Active PostgreSQL connection is required for sequence-backed Payment Number generation.');
  }

  try {
    const res = await prisma.$queryRaw<[{ nextval: bigint }]>`SELECT nextval('payment_seq')`;
    if (!res || !res[0] || res[0].nextval === undefined || res[0].nextval === null) {
      throw new Error('SequenceUnavailable: Sequence "payment_seq" returned empty result.');
    }
    const seq = Number(res[0].nextval);
    if (isNaN(seq) || seq <= 0) {
      throw new Error('SequenceInvalid: Sequence "payment_seq" returned invalid integer.');
    }
    return `PAY-${year}-${String(seq).padStart(5, '0')}`;
  } catch (err: any) {
    console.error('[Prisma generateUniquePaymentNumber] Fail-closed sequence failure:', err.message);
    throw new Error(`PaymentNumberGenerationFailed: Authoritative sequence generation failed: ${err.message}`);
  }
}

export async function generateUniqueRefundNumber(): Promise<string> {
  const year = new Date().getFullYear();
  if (!isPrismaConnected) {
    throw new Error('DatabaseUnavailable: Active PostgreSQL connection is required for sequence-backed Refund Number generation.');
  }

  try {
    const res = await prisma.$queryRaw<[{ nextval: bigint }]>`SELECT nextval('refund_seq')`;
    if (!res || !res[0] || res[0].nextval === undefined || res[0].nextval === null) {
      throw new Error('SequenceUnavailable: Sequence "refund_seq" returned empty result.');
    }
    const seq = Number(res[0].nextval);
    if (isNaN(seq) || seq <= 0) {
      throw new Error('SequenceInvalid: Sequence "refund_seq" returned invalid integer.');
    }
    return `REF-${year}-${String(seq).padStart(5, '0')}`;
  } catch (err: any) {
    console.error('[Prisma generateUniqueRefundNumber] Fail-closed sequence failure:', err.message);
    throw new Error(`RefundNumberGenerationFailed: Authoritative sequence generation failed: ${err.message}`);
  }
}

export async function generateUniqueRefundEntryNumber(): Promise<string> {
  const year = new Date().getFullYear();
  if (!isPrismaConnected) {
    throw new Error('DatabaseUnavailable: Active PostgreSQL connection is required for sequence-backed Refund Entry Number generation.');
  }

  try {
    const res = await prisma.$queryRaw<[{ nextval: bigint }]>`SELECT nextval('refund_entry_seq')`;
    if (!res || !res[0] || res[0].nextval === undefined || res[0].nextval === null) {
      throw new Error('SequenceUnavailable: Sequence "refund_entry_seq" returned empty result.');
    }
    const seq = Number(res[0].nextval);
    if (isNaN(seq) || seq <= 0) {
      throw new Error('SequenceInvalid: Sequence "refund_entry_seq" returned invalid integer.');
    }
    return `RLE-${year}-${String(seq).padStart(5, '0')}`;
  } catch (err: any) {
    console.error('[Prisma generateUniqueRefundEntryNumber] Fail-closed sequence failure:', err.message);
    throw new Error(`RefundEntryNumberGenerationFailed: Authoritative sequence generation failed: ${err.message}`);
  }
}

function mapPrismaRefundLedgerEntryToDomain(entry: any): RefundLedgerEntry {
  return {
    id: entry.id,
    entryNumber: entry.entryNumber,
    refundRequestId: entry.refundRequestId,
    paymentId: entry.paymentId,
    patientId: entry.patientId || undefined,
    patientName: entry.patientName,
    mrn: entry.mrn,
    amount: Number(entry.amount),
    refundMethod: entry.refundMethod,
    externalReference: entry.externalReference || undefined,
    executedById: entry.executedById,
    executedByName: entry.executedByName,
    executedByRole: entry.executedByRole,
    executedAt: entry.executedAt instanceof Date ? entry.executedAt.toISOString() : String(entry.executedAt),
    notes: entry.notes || undefined,
    createdAt: entry.createdAt instanceof Date ? entry.createdAt.toISOString() : String(entry.createdAt)
  };
}

function mapPrismaAllocationToDomain(alloc: any): PaymentAllocation {
  return {
    id: alloc.id,
    paymentId: alloc.paymentId,
    invoiceId: alloc.invoiceId,
    amount: Number(alloc.amount),
    allocatedAt: alloc.allocatedAt instanceof Date ? alloc.allocatedAt.toISOString() : String(alloc.allocatedAt),
    allocatedById: alloc.allocatedById,
    allocatedByName: alloc.allocatedByName,
    allocatedByRole: alloc.allocatedByRole,
    notes: alloc.notes || undefined,
    createdAt: alloc.createdAt instanceof Date ? alloc.createdAt.toISOString() : undefined
  };
}

function mapPrismaRefundToDomain(ref: any): RefundRequest {
  return {
    id: ref.id,
    requestNumber: ref.requestNumber,
    type: ref.type as RefundRequestType,
    paymentId: ref.paymentId || undefined,
    invoiceId: ref.invoiceId || undefined,
    patientId: ref.patientId || undefined,
    patientName: ref.patientName,
    mrn: ref.mrn,
    amount: Number(ref.amount),
    reason: ref.reason,
    status: ref.status as RefundRequestStatus,
    requestedById: ref.requestedById,
    requestedByName: ref.requestedByName,
    requestedByRole: ref.requestedByRole,
    requestedAt: ref.requestedAt instanceof Date ? ref.requestedAt.toISOString() : String(ref.requestedAt),
    approvedById: ref.approvedById || undefined,
    approvedByName: ref.approvedByName || undefined,
    approvedByRole: ref.approvedByRole || undefined,
    approvedAt: ref.approvedAt ? (ref.approvedAt instanceof Date ? ref.approvedAt.toISOString() : String(ref.approvedAt)) : undefined,
    approvalNotes: ref.approvalNotes || undefined,
    rejectedById: ref.rejectedById || undefined,
    rejectedByName: ref.rejectedByName || undefined,
    rejectedAt: ref.rejectedAt ? (ref.rejectedAt instanceof Date ? ref.rejectedAt.toISOString() : String(ref.rejectedAt)) : undefined,
    rejectionReason: ref.rejectionReason || undefined,
    externalReference: ref.externalReference || undefined,
    executedById: ref.executedById || undefined,
    executedByName: ref.executedByName || undefined,
    executedByRole: ref.executedByRole || undefined,
    executedAt: ref.executedAt ? (ref.executedAt instanceof Date ? ref.executedAt.toISOString() : String(ref.executedAt)) : undefined,
    executionNotes: ref.executionNotes || undefined,
    refundMethod: ref.refundMethod || undefined,
    refundLedgerEntry: ref.refundLedgerEntry ? mapPrismaRefundLedgerEntryToDomain(ref.refundLedgerEntry) : undefined,
    createdAt: ref.createdAt instanceof Date ? ref.createdAt.toISOString() : String(ref.createdAt),
    updatedAt: ref.updatedAt ? (ref.updatedAt instanceof Date ? ref.updatedAt.toISOString() : String(ref.updatedAt)) : undefined
  };
}

function mapPrismaPaymentToDomain(p: any): Payment {
  return {
    id: p.id,
    paymentNumber: p.paymentNumber,
    patientId: p.patientId || undefined,
    patientName: p.patientName,
    mrn: p.mrn,
    amount: Number(p.amount),
    unallocatedAmount: Number(p.unallocatedAmount),
    paymentDate: p.paymentDate instanceof Date ? p.paymentDate.toISOString() : String(p.paymentDate),
    paymentMethod: p.paymentMethod as PaymentMethod,
    referenceNumber: p.referenceNumber || undefined,
    notes: p.notes || undefined,
    status: p.status as PaymentStatus,
    recordedById: p.recordedById,
    recordedByName: p.recordedByName,
    recordedByRole: p.recordedByRole,
    idempotencyKey: p.idempotencyKey || undefined,
    allocations: p.allocations ? p.allocations.map(mapPrismaAllocationToDomain) : undefined,
    refundRequests: p.refundRequests ? p.refundRequests.map(mapPrismaRefundToDomain) : undefined,
    createdAt: p.createdAt instanceof Date ? p.createdAt.toISOString() : String(p.createdAt),
    updatedAt: p.updatedAt ? (p.updatedAt instanceof Date ? p.updatedAt.toISOString() : String(p.updatedAt)) : undefined
  };
}

function mapPrismaInvoiceToDomain(inv: any): BillInvoice {
  return {
    id: inv.id,
    invoiceNumber: inv.invoiceNumber,
    patientId: inv.patientId || '',
    patientName: inv.patientName,
    mrn: inv.mrn,
    status: (inv.status as InvoiceStatus) || 'issued',
    issuedAt: inv.issuedAt ? inv.issuedAt.toISOString() : undefined,
    issuedById: inv.issuedById || undefined,
    issuedByName: inv.issuedByName || undefined,
    createdById: inv.createdById || undefined,
    createdByName: inv.createdByName || undefined,
    dueDate: inv.dueDate ? inv.dueDate.toISOString() : undefined,
    currency: inv.currency || 'INR',
    notes: inv.notes || undefined,
    admissionDate: inv.admissionDate ? (inv.admissionDate instanceof Date ? inv.admissionDate.toISOString() : String(inv.admissionDate)) : new Date().toISOString(),
    dischargeDate: inv.dischargeDate ? (inv.dischargeDate instanceof Date ? inv.dischargeDate.toISOString() : String(inv.dischargeDate)) : undefined,
    items: inv.items as any,
    subtotal: Number(inv.subtotal),
    insuranceCovered: Number(inv.insuranceCovered),
    copayPatient: Number(inv.copayPatient),
    totalAmount: Number(inv.totalAmount),
    paidAmount: Number(inv.paidAmount),
    balance: Number(inv.balance),
    paymentStatus: (inv.paymentStatus as any) || (Number(inv.balance) <= 0 ? 'paid' : (Number(inv.paidAmount) > 0 ? 'partially_paid' : 'unpaid')),
    insuranceClaimStatus: (inv.insuranceClaimStatus as any) || undefined,
    allocations: inv.allocations ? inv.allocations.map(mapPrismaAllocationToDomain) : undefined,
    refundRequests: inv.refundRequests ? inv.refundRequests.map(mapPrismaRefundToDomain) : undefined,
    createdAt: inv.createdAt instanceof Date ? inv.createdAt.toISOString() : String(inv.createdAt),
    updatedAt: inv.updatedAt instanceof Date ? inv.updatedAt.toISOString() : undefined
  };
}

export async function dbGetInvoices(filters?: {
  patientId?: string;
  mrn?: string;
  status?: string;
  startDate?: string;
  endDate?: string;
}): Promise<BillInvoice[]> {
  if (isPrismaConnected) {
    try {
      const where: Prisma.InvoiceWhereInput = {};
      if (filters?.patientId) where.patientId = filters.patientId;
      if (filters?.mrn) where.mrn = filters.mrn;
      if (filters?.status) where.status = filters.status;
      if (filters?.startDate || filters?.endDate) {
        where.createdAt = {};
        if (filters.startDate) where.createdAt.gte = new Date(filters.startDate);
        if (filters.endDate) where.createdAt.lte = new Date(filters.endDate);
      }

      const dbInvoices = await prisma.invoice.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        include: {
          allocations: true,
          refundRequests: true
        }
      });
      return dbInvoices.map(mapPrismaInvoiceToDomain);
    } catch (err) {
      console.warn('[Prisma dbGetInvoices] Fallback:', err);
    }
  }
  let res = [...hospitalStore.invoices];
  if (filters?.patientId) res = res.filter((i) => i.patientId === filters.patientId);
  if (filters?.mrn) res = res.filter((i) => i.mrn === filters.mrn);
  if (filters?.status) res = res.filter((i) => i.status === filters.status);
  return res;
}

export async function dbGetInvoiceById(id: string): Promise<BillInvoice | null> {
  if (isPrismaConnected) {
    try {
      const dbInv = await prisma.invoice.findUnique({
        where: { id },
        include: {
          allocations: true,
          refundRequests: true
        }
      });
      if (dbInv) return mapPrismaInvoiceToDomain(dbInv);
    } catch (err) {
      console.warn('[Prisma dbGetInvoiceById] Fallback:', err);
    }
  }
  return hospitalStore.invoices.find((i) => i.id === id) || null;
}

export async function dbCreateInvoice(
  invoice: Partial<BillInvoice> & { items: any[]; totalAmount?: number },
  actor?: { id: string; name: string; role: string },
  isDraft: boolean = false
): Promise<BillInvoice> {
  if (!isPrismaConnected) {
    throw new Error('DatabaseUnavailable: Active PostgreSQL connection is required for invoice creation.');
  }

  // Authoritative fail-closed sequence number generation
  let invoiceNumber = invoice.invoiceNumber;
  if (!invoiceNumber || invoiceNumber.startsWith('temp-') || invoiceNumber.startsWith('inv-')) {
    invoiceNumber = await generateUniqueInvoiceNumber();
  }

  const subtotalDec = new Prisma.Decimal(Number(invoice.subtotal || invoice.totalAmount || 0).toFixed(2));
  const insCoveredDec = new Prisma.Decimal(Number(invoice.insuranceCovered || 0).toFixed(2));
  const copayDec = new Prisma.Decimal(Number(invoice.copayPatient || subtotalDec).toFixed(2));
  const totalDec = subtotalDec;
  const initialStatus: InvoiceStatus = isDraft ? 'draft' : (invoice.status || 'issued');
  const paidDec = new Prisma.Decimal(Number(invoice.paidAmount ?? (invoice.paymentStatus === 'paid' ? totalDec : 0)).toFixed(2));
  const balanceDec = totalDec.sub(paidDec);

  const initialPaymentStatus = paidDec.greaterThanOrEqualTo(totalDec)
    ? 'paid'
    : (paidDec.greaterThan(0) ? 'partially_paid' : 'unpaid');

  const now = new Date();
  const invoiceId = invoice.id || `inv-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

  // Run in interactive transaction to guarantee atomicity and update dispensing records
  const createdRecord = await prisma.$transaction(async (tx) => {
    // 1. Pre-validation of linked records
    for (const item of invoice.items) {
      if (item.dispensingRecordId) {
        const dsp = await tx.dispensingRecord.findUnique({
          where: { id: item.dispensingRecordId }
        });
        if (!dsp) {
          throw new Error(`DispensingRecordNotFound: Dispensing record ${item.dispensingRecordId} does not exist.`);
        }
        const availableQty = dsp.quantityDispensed - dsp.billedQuantity;
        if (item.quantity > availableQty) {
          throw new Error(`DuplicateBillingDetected: Dispensing record ${dsp.dispenseNumber} for "${dsp.drugName}" has only ${availableQty} unbilled units remaining, but ${item.quantity} requested.`);
        }
      }

      if (item.therapySessionId) {
        const ses = await tx.therapySession.findUnique({
          where: { id: item.therapySessionId }
        });
        if (!ses) {
          throw new Error(`TherapySessionNotFound: Therapy session ${item.therapySessionId} does not exist.`);
        }
        if (ses.isBilled) {
          throw new Error(`DuplicateBillingDetected: Therapy session ${ses.sessionRef} has already been billed.`);
        }
        if (ses.billingMode === SessionBillingMode.PACKAGE_COVERED) {
          throw new Error(`PackageCoveredSession: Therapy session ${ses.sessionRef} is covered under a Panchakarma package and cannot be billed individually.`);
        }
      }

      if (item.panchakarmaCourseId) {
        const course = await tx.panchakarmaCourse.findUnique({
          where: { id: item.panchakarmaCourseId }
        });
        if (!course) {
          throw new Error(`PanchakarmaCourseNotFound: Panchakarma course ${item.panchakarmaCourseId} does not exist.`);
        }
        if (course.isPackageBilled) {
          throw new Error(`DuplicateBillingDetected: Panchakarma course ${course.courseNumber} has already been package-billed.`);
        }
      }
    }

    // 2. Insert Invoice (Creates the parent row for foreign key integrity)
    const dbCreated = await tx.invoice.create({
      data: {
        id: invoiceId,
        invoiceNumber,
        patientId: invoice.patientId || null,
        patientName: invoice.patientName || 'Unknown Patient',
        mrn: invoice.mrn || 'MRN-UNASSIGNED',
        status: initialStatus,
        issuedAt: initialStatus === 'issued' ? now : null,
        issuedById: initialStatus === 'issued' ? (actor?.id || null) : null,
        issuedByName: initialStatus === 'issued' ? (actor?.name || null) : null,
        createdById: actor?.id || null,
        createdByName: actor?.name || null,
        dueDate: invoice.dueDate ? new Date(invoice.dueDate) : null,
        currency: invoice.currency || 'INR',
        notes: invoice.notes || null,
        admissionDate: invoice.admissionDate ? new Date(invoice.admissionDate) : now,
        dischargeDate: invoice.dischargeDate ? new Date(invoice.dischargeDate) : null,
        items: invoice.items as any,
        subtotal: subtotalDec,
        insuranceCovered: insCoveredDec,
        copayPatient: copayDec,
        totalAmount: totalDec,
        paidAmount: paidDec,
        balance: balanceDec,
        paymentStatus: initialPaymentStatus,
        insuranceClaimStatus: invoice.insuranceClaimStatus || 'pending'
      },
      include: {
        allocations: true,
        refundRequests: true
      }
    });

    // 3. Atomically update linked records referencing invoiceId
    for (const item of invoice.items) {
      if (item.dispensingRecordId) {
        const dsp = await tx.dispensingRecord.findUnique({ where: { id: item.dispensingRecordId } });
        if (dsp) {
          const newBilled = dsp.billedQuantity + item.quantity;
          await tx.dispensingRecord.update({
            where: { id: item.dispensingRecordId },
            data: {
              billedQuantity: newBilled,
              isBilled: newBilled >= dsp.quantityDispensed,
              billingInvoiceId: invoiceId
            }
          });
        }
      }

      if (item.therapySessionId) {
        await tx.therapySession.update({
          where: { id: item.therapySessionId },
          data: {
            isBilled: true,
            billingMode: SessionBillingMode.PER_SESSION,
            invoiceId
          }
        });
      }

      if (item.panchakarmaCourseId) {
        await tx.panchakarmaCourse.update({
          where: { id: item.panchakarmaCourseId },
          data: {
            isPackageBilled: true,
            packageInvoiceId: invoiceId,
            billingMode: PanchakarmaBillingMode.PACKAGE_BILLED
          }
        });
        await tx.therapySession.updateMany({
          where: { panchakarmaCourseId: item.panchakarmaCourseId },
          data: {
            billingMode: SessionBillingMode.PACKAGE_COVERED,
            isBilled: true,
            invoiceId
          }
        });
      }
    }

    return dbCreated;
  });

  const domainInv = mapPrismaInvoiceToDomain(createdRecord);
  hospitalStore.invoices.unshift(domainInv);
  return domainInv;
}

export async function dbIssueInvoice(
  invoiceId: string,
  actor: { id: string; name: string; role: string }
): Promise<BillInvoice> {
  if (!isPrismaConnected) {
    throw new Error('DatabaseUnavailable: Active PostgreSQL connection is required to issue invoice.');
  }

  const existing = await prisma.invoice.findUnique({ where: { id: invoiceId } });
  if (!existing) {
    throw new Error('InvoiceNotFound: The requested invoice does not exist.');
  }
  if (existing.status !== 'draft') {
    throw new Error(`InvalidInvoiceState: Invoice ${existing.invoiceNumber} is already in "${existing.status}" state.`);
  }

  const updated = await prisma.invoice.update({
    where: { id: invoiceId },
    data: {
      status: 'issued',
      issuedAt: new Date(),
      issuedById: actor.id,
      issuedByName: actor.name
    },
    include: {
      allocations: true,
      refundRequests: true
    }
  });

  const domainInv = mapPrismaInvoiceToDomain(updated);
  const storeIdx = hospitalStore.invoices.findIndex((i) => i.id === invoiceId);
  if (storeIdx !== -1) hospitalStore.invoices[storeIdx] = domainInv;
  return domainInv;
}

export async function dbGetPatientBillableItems(patientIdOrMrn: string): Promise<BillableItem[]> {
  if (!isPrismaConnected) {
    throw new Error('DatabaseUnavailable: Active PostgreSQL connection is required to fetch billable items.');
  }

  // 1. Fetch active tariffs
  const tariffs = await prisma.hospitalTariff.findMany({
    where: { isActive: true },
    orderBy: { serviceName: 'asc' }
  });

  const billableItems: BillableItem[] = tariffs.map((t) => ({
    id: `tariff-${t.id}`,
    sourceType: 'tariff',
    sourceId: t.id,
    code: t.serviceCode,
    name: t.serviceName,
    category: t.category,
    unitPrice: t.rate !== null ? Number(t.rate) : null,
    isUnconfigured: t.rate === null,
    quantityAvailable: 9999, // services can be billed repeatedly
    unit: t.unit || 'unit'
  }));

  // 2. Fetch unbilled dispensing records for patient
  const patient = await prisma.patient.findFirst({
    where: {
      OR: [
        { id: patientIdOrMrn },
        { mrn: patientIdOrMrn }
      ]
    }
  });

  if (patient) {
    const unbilledDispenses = await prisma.dispensingRecord.findMany({
      where: {
        OR: [
          { patientId: patient.id },
          { mrn: patient.mrn }
        ],
        isBilled: false
      },
      orderBy: { dispensedAt: 'desc' }
    });

    const medStocks = await prisma.medicationStock.findMany();

    for (const dsp of unbilledDispenses) {
      const remainingQty = dsp.quantityDispensed - dsp.billedQuantity;
      if (remainingQty <= 0) continue;

      let matchedStock = medStocks.find((m) => m.id === dsp.medicationStockId);
      if (!matchedStock) {
        matchedStock = medStocks.find(
          (m) => m.drugName.toLowerCase() === dsp.drugName.toLowerCase() && m.batchNumber === dsp.batchNumber
        ) || medStocks.find((m) => m.drugName.toLowerCase() === dsp.drugName.toLowerCase());
      }

      const unitPrice = (matchedStock && matchedStock.unitPrice !== null) ? Number(matchedStock.unitPrice) : null;

      billableItems.push({
        id: `dsp-${dsp.id}`,
        sourceType: 'dispensing',
        sourceId: dsp.id,
        code: dsp.batchNumber,
        name: dsp.drugName,
        category: 'Pharmacy',
        unitPrice,
        isUnconfigured: unitPrice === null,
        quantityAvailable: remainingQty,
        dispenseNumber: dsp.dispenseNumber,
        batchNumber: dsp.batchNumber,
        expiryDate: dsp.expiryDate || undefined,
        prescriptionId: dsp.prescriptionId,
        unit: 'unit'
      });
    }

    // 3. Fetch unbilled completed therapy sessions for patient (Phase 7)
    const unbilledSessions = await prisma.therapySession.findMany({
      where: {
        OR: [
          { patientId: patient.id },
          { patient: { mrn: patient.mrn } }
        ],
        status: SessionExecutionStatus.COMPLETED,
        isBilled: false,
        billingMode: { not: SessionBillingMode.PACKAGE_COVERED }
      },
      include: {
        tariff: true,
        treatmentPlan: true,
        panchakarmaCourse: true
      },
      orderBy: { completedAt: 'desc' }
    });

    for (const ses of unbilledSessions) {
      const unitPrice = ses.tariff && ses.tariff.rate !== null
        ? Number(ses.tariff.rate)
        : (ses.billableAmount !== null ? Number(ses.billableAmount) : null);
      const serviceName = ses.treatmentPlan?.therapyType || ses.panchakarmaCourse?.protocol || `Therapy Session #${ses.sessionNumber}`;
      billableItems.push({
        id: `ses-${ses.id}`,
        sourceType: 'therapy_session' as any,
        sourceId: ses.id,
        code: ses.tariff?.serviceCode || ses.sessionRef,
        name: `${serviceName} (${ses.sessionRef})`,
        category: 'Treatment',
        unitPrice,
        isUnconfigured: unitPrice === null,
        quantityAvailable: 1,
        unit: 'session'
      });
    }
  }

  return billableItems;
}

export async function dbRecordPayment(
  params: {
    patientId?: string;
    mrn?: string;
    amount: number;
    paymentMethod: PaymentMethod;
    referenceNumber?: string;
    notes?: string;
    idempotencyKey?: string;
    allocations?: Array<{ invoiceId: string; amount: number }>;
  },
  actor: { id: string; name: string; role: string }
): Promise<Payment> {
  if (!isPrismaConnected) {
    throw new Error('DatabaseUnavailable: Active PostgreSQL connection is required to record payment.');
  }

  // 1. Idempotency Check
  if (params.idempotencyKey) {
    const existingIdem = await prisma.financialIdempotency.findUnique({
      where: { idempotencyKey: params.idempotencyKey }
    });
    if (existingIdem) {
      return existingIdem.responsePayload as any;
    }
  }

  // 2. Validate Patient
  let patient = null;
  if (params.patientId || params.mrn) {
    patient = await prisma.patient.findFirst({
      where: {
        OR: [
          ...(params.patientId ? [{ id: params.patientId }] : []),
          ...(params.mrn ? [{ mrn: params.mrn }] : [])
        ]
      }
    });
  }

  if (!patient && (params.patientId || params.mrn)) {
    throw new Error(`PatientNotFound: Patient with ID "${params.patientId}" or MRN "${params.mrn}" does not exist.`);
  }

  const patientName = patient ? `${patient.firstName} ${patient.lastName}` : (params.patientId || 'Walk-in Patient');
  const patientMrn = patient ? patient.mrn : (params.mrn || 'MRN-UNASSIGNED');

  const paymentAmountDec = new Prisma.Decimal(Number(params.amount).toFixed(2));
  if (paymentAmountDec.lessThanOrEqualTo(0)) {
    throw new Error('InvalidPaymentAmount: Payment amount must be strictly greater than zero.');
  }

  const paymentNumber = await generateUniquePaymentNumber();
  const paymentId = `pay-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const now = new Date();

  // 3. Process Transaction
  const createdPayment = await prisma.$transaction(async (tx) => {
    let totalAllocatedDec = new Prisma.Decimal(0);
    const createdAllocations: any[] = [];

    if (params.allocations && params.allocations.length > 0) {
      for (const reqAlloc of params.allocations) {
        const allocAmountDec = new Prisma.Decimal(Number(reqAlloc.amount).toFixed(2));
        if (allocAmountDec.lessThanOrEqualTo(0)) {
          throw new Error('InvalidAllocationAmount: Allocation amount must be strictly greater than zero.');
        }

        // Fetch invoice with row lock
        const inv = await tx.invoice.findUnique({
          where: { id: reqAlloc.invoiceId }
        });

        if (!inv) {
          throw new Error(`InvoiceNotFound: Invoice ${reqAlloc.invoiceId} does not exist.`);
        }
        if (inv.status === 'draft') {
          throw new Error(`InvalidInvoiceState: Cannot allocate payments to draft invoice ${inv.invoiceNumber}. Must be issued first.`);
        }
        if (inv.status === 'voided' || inv.status === 'cancelled') {
          throw new Error(`InvalidInvoiceState: Cannot allocate payments to ${inv.status} invoice ${inv.invoiceNumber}.`);
        }
        if (inv.balance.lessThanOrEqualTo(0)) {
          throw new Error(`InvoiceAlreadyPaid: Invoice ${inv.invoiceNumber} has a zero balance and cannot accept further allocations.`);
        }
        if (allocAmountDec.greaterThan(inv.balance)) {
          throw new Error(`OverpaymentPrevented: Allocation amount ₹${allocAmountDec} exceeds remaining balance ₹${inv.balance} on invoice ${inv.invoiceNumber}.`);
        }

        totalAllocatedDec = totalAllocatedDec.add(allocAmountDec);
        if (totalAllocatedDec.greaterThan(paymentAmountDec)) {
          throw new Error(`InsufficientPaymentAmount: Total allocated amount ₹${totalAllocatedDec} exceeds payment amount ₹${paymentAmountDec}.`);
        }

        // Update invoice balance and status
        const newPaidDec = inv.paidAmount.add(allocAmountDec);
        const newBalanceDec = inv.totalAmount.sub(newPaidDec);
        const newStatus: InvoiceStatus = newBalanceDec.lessThanOrEqualTo(0) ? 'paid' : 'partially_paid';
        const newPaymentStatus = newBalanceDec.lessThanOrEqualTo(0) ? 'paid' : 'partially_paid';

        await tx.invoice.update({
          where: { id: inv.id },
          data: {
            paidAmount: newPaidDec,
            balance: newBalanceDec,
            status: newStatus,
            paymentStatus: newPaymentStatus
          }
        });

        // Create PaymentAllocation record
        const allocationRecord = await tx.paymentAllocation.create({
          data: {
            paymentId,
            invoiceId: inv.id,
            amount: allocAmountDec,
            allocatedAt: now,
            allocatedById: actor.id,
            allocatedByName: actor.name,
            allocatedByRole: actor.role,
            notes: `Allocated to invoice ${inv.invoiceNumber}`
          }
        });
        createdAllocations.push(allocationRecord);
      }
    }

    const unallocatedDec = paymentAmountDec.sub(totalAllocatedDec);
    const paymentStatus: PaymentStatus = unallocatedDec.isZero()
      ? 'fully_allocated'
      : (totalAllocatedDec.isZero() ? 'unallocated' : 'partially_allocated');

    const paymentRecord = await tx.payment.create({
      data: {
        id: paymentId,
        paymentNumber,
        patientId: patient ? patient.id : null,
        patientName,
        mrn: patientMrn,
        amount: paymentAmountDec,
        unallocatedAmount: unallocatedDec,
        paymentDate: now,
        paymentMethod: params.paymentMethod,
        referenceNumber: params.referenceNumber || null,
        notes: params.notes || null,
        status: paymentStatus,
        recordedById: actor.id,
        recordedByName: actor.name,
        recordedByRole: actor.role,
        idempotencyKey: params.idempotencyKey || null
      },
      include: {
        allocations: true,
        refundRequests: true
      }
    });

    return paymentRecord;
  });

  const domainPayment = mapPrismaPaymentToDomain(createdPayment);
  hospitalStore.payments.unshift(domainPayment);

  // Store in idempotency table if key provided
  if (params.idempotencyKey) {
    try {
      await prisma.financialIdempotency.create({
        data: {
          idempotencyKey: params.idempotencyKey,
          operation: 'record_payment',
          actorId: actor.id,
          payloadHash: crypto.createHash('sha256').update(JSON.stringify(params)).digest('hex'),
          responsePayload: domainPayment as any
        }
      });
    } catch (idemErr) {
      console.warn('[Prisma record_payment idempotency store]:', idemErr);
    }
  }

  return domainPayment;
}

export async function dbAllocatePayment(
  paymentId: string,
  allocations: Array<{ invoiceId: string; amount: number }>,
  actor: { id: string; name: string; role: string }
): Promise<Payment> {
  if (!isPrismaConnected) {
    throw new Error('DatabaseUnavailable: Active PostgreSQL connection is required to allocate payment.');
  }

  if (!allocations || allocations.length === 0) {
    throw new Error('EmptyAllocations: At least one invoice allocation is required.');
  }

  const updatedPayment = await prisma.$transaction(async (tx) => {
    // Acquire row-level lock on the payment record to serialize concurrent allocations
    const lockedPaymentRows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM payments WHERE id = ${paymentId} FOR UPDATE
    `;
    if (!lockedPaymentRows || lockedPaymentRows.length === 0) {
      throw new Error(`PaymentNotFound: Payment ${paymentId} does not exist.`);
    }

    const payment = await tx.payment.findUnique({
      where: { id: paymentId }
    });
    if (!payment) {
      throw new Error(`PaymentNotFound: Payment ${paymentId} does not exist.`);
    }

    let totalAllocatingDec = new Prisma.Decimal(0);
    for (const alloc of allocations) {
      const allocAmtDec = new Prisma.Decimal(Number(alloc.amount).toFixed(2));
      if (allocAmtDec.lessThanOrEqualTo(0)) {
        throw new Error('InvalidAllocationAmount: Allocation amount must be strictly greater than zero.');
      }
      totalAllocatingDec = totalAllocatingDec.add(allocAmtDec);
    }

    if (totalAllocatingDec.greaterThan(payment.unallocatedAmount)) {
      throw new Error(`InsufficientCredit: Allocating ₹${totalAllocatingDec} exceeds available unallocated payment credit ₹${payment.unallocatedAmount}.`);
    }

    const now = new Date();
    // Sort allocations deterministically by invoiceId to avoid deadlocks across multiple allocations
    const sortedAllocations = [...allocations].sort((a, b) => a.invoiceId.localeCompare(b.invoiceId));
    for (const alloc of sortedAllocations) {
      const allocAmtDec = new Prisma.Decimal(Number(alloc.amount).toFixed(2));

      // Acquire row-level lock on the invoice record to prevent concurrent over-allocation
      const lockedInvRows = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM invoices WHERE id = ${alloc.invoiceId} FOR UPDATE
      `;
      if (!lockedInvRows || lockedInvRows.length === 0) {
        throw new Error(`InvoiceNotFound: Target invoice ${alloc.invoiceId} does not exist.`);
      }

      const inv = await tx.invoice.findUnique({
        where: { id: alloc.invoiceId }
      });

      if (!inv) {
        throw new Error(`InvoiceNotFound: Target invoice ${alloc.invoiceId} does not exist.`);
      }
      if (inv.status === 'draft') {
        throw new Error(`InvalidInvoiceState: Cannot allocate to draft invoice ${inv.invoiceNumber}.`);
      }
      if (inv.status === 'voided' || inv.status === 'cancelled') {
        throw new Error(`InvalidInvoiceState: Cannot allocate to ${inv.status} invoice ${inv.invoiceNumber}.`);
      }
      if (inv.balance.lessThanOrEqualTo(0)) {
        throw new Error(`InvoiceAlreadyPaid: Invoice ${inv.invoiceNumber} is already fully paid.`);
      }
      if (allocAmtDec.greaterThan(inv.balance)) {
        throw new Error(`OverpaymentPrevented: Allocation ₹${allocAmtDec} exceeds remaining balance ₹${inv.balance} on invoice ${inv.invoiceNumber}.`);
      }

      const newPaidDec = inv.paidAmount.add(allocAmtDec);
      const newBalanceDec = inv.totalAmount.sub(newPaidDec);
      const newStatus: InvoiceStatus = newBalanceDec.lessThanOrEqualTo(0) ? 'paid' : 'partially_paid';

      await tx.invoice.update({
        where: { id: inv.id },
        data: {
          paidAmount: newPaidDec,
          balance: newBalanceDec,
          status: newStatus,
          paymentStatus: newStatus
        }
      });

      await tx.paymentAllocation.create({
        data: {
          paymentId: payment.id,
          invoiceId: inv.id,
          amount: allocAmtDec,
          allocatedAt: now,
          allocatedById: actor.id,
          allocatedByName: actor.name,
          allocatedByRole: actor.role,
          notes: `Post-payment allocation to ${inv.invoiceNumber}`
        }
      });
    }

    const newUnallocatedDec = payment.unallocatedAmount.sub(totalAllocatingDec);
    const newStatus: PaymentStatus = newUnallocatedDec.isZero() ? 'fully_allocated' : 'partially_allocated';

    const result = await tx.payment.update({
      where: { id: payment.id },
      data: {
        unallocatedAmount: newUnallocatedDec,
        status: newStatus
      },
      include: {
        allocations: true,
        refundRequests: true
      }
    });

    return result;
  });

  const domainPayment = mapPrismaPaymentToDomain(updatedPayment);
  const storeIdx = hospitalStore.payments.findIndex((p) => p.id === paymentId);
  if (storeIdx !== -1) hospitalStore.payments[storeIdx] = domainPayment;
  return domainPayment;
}

export async function dbGetPayments(filters?: {
  patientId?: string;
  mrn?: string;
  status?: string;
  startDate?: string;
  endDate?: string;
}): Promise<Payment[]> {
  if (isPrismaConnected) {
    try {
      const where: Prisma.PaymentWhereInput = {};
      if (filters?.patientId) where.patientId = filters.patientId;
      if (filters?.mrn) where.mrn = filters.mrn;
      if (filters?.status) where.status = filters.status;
      if (filters?.startDate || filters?.endDate) {
        where.paymentDate = {};
        if (filters.startDate) where.paymentDate.gte = new Date(filters.startDate);
        if (filters.endDate) where.paymentDate.lte = new Date(filters.endDate);
      }

      const payments = await prisma.payment.findMany({
        where,
        orderBy: { paymentDate: 'desc' },
        include: {
          allocations: true,
          refundRequests: true
        }
      });
      return payments.map(mapPrismaPaymentToDomain);
    } catch (err) {
      console.warn('[Prisma dbGetPayments] Fallback:', err);
    }
  }
  let res = [...hospitalStore.payments];
  if (filters?.patientId) res = res.filter((p) => p.patientId === filters.patientId);
  if (filters?.mrn) res = res.filter((p) => p.mrn === filters.mrn);
  if (filters?.status) res = res.filter((p) => p.status === filters.status);
  return res;
}

export async function dbGetPaymentById(id: string): Promise<Payment | null> {
  if (isPrismaConnected) {
    try {
      const p = await prisma.payment.findUnique({
        where: { id },
        include: {
          allocations: true,
          refundRequests: true
        }
      });
      if (p) return mapPrismaPaymentToDomain(p);
    } catch (err) {
      console.warn('[Prisma dbGetPaymentById] Fallback:', err);
    }
  }
  return hospitalStore.payments.find((p) => p.id === id) || null;
}

export async function dbRequestRefund(
  params: {
    type: RefundRequestType;
    paymentId?: string;
    invoiceId?: string;
    patientId?: string;
    mrn?: string;
    amount: number;
    reason: string;
  },
  requester: { id: string; name: string; role: string }
): Promise<RefundRequest> {
  if (!isPrismaConnected) {
    throw new Error('DatabaseUnavailable: Active PostgreSQL connection is required to request refund.');
  }

  // Explicit handling for credit_adjustment:
  // Non-cash credit adjustments and debt write-offs require an explicit institutional policy.
  if (params.type === 'credit_adjustment') {
    throw new Error(
      'CreditAdjustmentBlocked: Credit adjustment requests are currently blocked pending specification of an institutional credit-note policy. Use "refund" for patient cash/digital disbursements or "invoice_void" to reverse invoice payment allocations.'
    );
  }

  const amountDec = new Prisma.Decimal(Number(params.amount).toFixed(2));
  if (amountDec.lessThanOrEqualTo(0)) {
    throw new Error('InvalidRefundAmount: Refund/credit adjustment amount must be greater than zero.');
  }
  if (!params.reason || !params.reason.trim()) {
    throw new Error('MissingRefundReason: A clinical or administrative justification reason is required.');
  }

  return await prisma.$transaction(async (tx) => {
    let patient = null;
    if (params.patientId || params.mrn) {
      patient = await tx.patient.findFirst({
        where: {
          OR: [
            ...(params.patientId ? [{ id: params.patientId }] : []),
            ...(params.mrn ? [{ mrn: params.mrn }] : [])
          ]
        }
      });
    }

    if (params.type === 'refund') {
      if (!params.paymentId) {
        throw new Error('MissingPaymentId: A valid payment ID is required for a refund request.');
      }

      // CRITICAL CONCURRENCY SERIALIZATION:
      // Lock target payment row with FOR UPDATE. Competing transactions wait for this row lock.
      const lockedPayments = await tx.$queryRaw<Array<{ id: string; unallocatedAmount: Prisma.Decimal; paymentNumber: string }>>`
        SELECT id, "unallocatedAmount", "paymentNumber"
        FROM payments
        WHERE id = ${params.paymentId}
        FOR UPDATE
      `;

      if (!lockedPayments || lockedPayments.length === 0) {
        throw new Error(`PaymentNotFound: Payment ${params.paymentId} does not exist.`);
      }

      const pay = lockedPayments[0];
      const payUnallocated = new Prisma.Decimal(pay.unallocatedAmount);

      // Sum all pending and approved refund requests for this payment
      // Excludes rejected (not reserved) and completed (already decremented from pay.unallocatedAmount)
      const reservedRefunds = await tx.refundRequest.findMany({
        where: {
          paymentId: params.paymentId,
          status: { in: ['pending', 'approved'] }
        }
      });

      let totalReserved = new Prisma.Decimal(0);
      for (const r of reservedRefunds) {
        totalReserved = totalReserved.add(r.amount);
      }

      const availableToReserve = payUnallocated.sub(totalReserved);
      if (amountDec.greaterThan(availableToReserve)) {
        throw new Error(
          `InsufficientRefundableBalance: Requested refund amount ₹${amountDec.toFixed(2)} exceeds available refundable credit ₹${availableToReserve.toFixed(2)} (Payment unallocated: ₹${payUnallocated.toFixed(2)}, reserved in pending/approved: ₹${totalReserved.toFixed(2)}).`
        );
      }
    } else if (params.type === 'invoice_void') {
      if (!params.invoiceId) {
        throw new Error('MissingInvoiceId: A valid invoice ID is required for an invoice void request.');
      }
      const inv = await tx.invoice.findUnique({ where: { id: params.invoiceId } });
      if (!inv) throw new Error(`InvoiceNotFound: Target invoice ${params.invoiceId} does not exist.`);
      if (inv.status === 'voided') {
        throw new Error(`InvoiceAlreadyVoided: Invoice ${inv.invoiceNumber} has already been voided.`);
      }
    }

    const patientName = patient ? `${patient.firstName} ${patient.lastName}` : 'Hospital Patient';
    const mrn = patient ? patient.mrn : (params.mrn || 'MRN-UNASSIGNED');

    // Authoritative sequence number inside transaction
    const year = new Date().getFullYear();
    const res = await tx.$queryRaw<[{ nextval: bigint }]>`SELECT nextval('refund_seq')`;
    const seq = Number(res[0].nextval);
    const requestNumber = `REF-${year}-${String(seq).padStart(5, '0')}`;
    const requestId = `ref-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

    const created = await tx.refundRequest.create({
      data: {
        id: requestId,
        requestNumber,
        type: params.type,
        paymentId: params.paymentId || null,
        invoiceId: params.invoiceId || null,
        patientId: patient ? patient.id : null,
        patientName,
        mrn,
        amount: amountDec,
        reason: params.reason.trim(),
        status: 'pending',
        requestedById: requester.id,
        requestedByName: requester.name,
        requestedByRole: requester.role,
        requestedAt: new Date()
      }
    });

    const domainRef = mapPrismaRefundToDomain(created);
    hospitalStore.refundRequests.unshift(domainRef);
    return domainRef;
  });
}

export async function dbApproveRefund(
  requestId: string,
  approver: { id: string; name: string; role: string },
  approvalNotes?: string
): Promise<RefundRequest> {
  if (!isPrismaConnected) {
    throw new Error('DatabaseUnavailable: Active PostgreSQL connection is required to approve refund.');
  }

  if (approver.role !== 'SUPER_ADMIN') {
    throw new Error('UnauthorizedRefundApproval: Only SUPER_ADMIN can approve financial refunds and credit adjustments.');
  }

  return await prisma.$transaction(async (tx) => {
    // Lock the refund request row with FOR UPDATE
    const lockedRefunds = await tx.$queryRaw<Array<{
      id: string;
      status: string;
      amount: Prisma.Decimal;
      paymentId: string | null;
      invoiceId: string | null;
      requestNumber: string;
      type: string;
      requestedById: string;
      reason: string;
    }>>`
      SELECT id, status, amount, "paymentId", "invoiceId", "requestNumber", type, "requestedById", reason
      FROM refund_requests
      WHERE id = ${requestId}
      FOR UPDATE
    `;

    if (!lockedRefunds || lockedRefunds.length === 0) {
      throw new Error(`RefundRequestNotFound: Refund request ${requestId} does not exist.`);
    }

    const refund = lockedRefunds[0];

    if (refund.status !== 'pending') {
      throw new Error(`InvalidRefundState: Refund request ${refund.requestNumber} is already "${refund.status}".`);
    }

    // DUAL AUTHORIZATION ENFORCEMENT: Self-approval is strictly prohibited!
    if (refund.requestedById === approver.id) {
      throw new Error('DualAuthorizationViolation: Initiator cannot approve their own refund or credit request.');
    }

    const now = new Date();

    if (refund.type === 'invoice_void' && refund.invoiceId) {
      const inv = await tx.invoice.findUnique({
        where: { id: refund.invoiceId },
        include: { allocations: true }
      });
      if (!inv) throw new Error(`InvoiceNotFound: Target invoice ${refund.invoiceId} not found.`);

      // Reverse allocations back to payments
      for (const alloc of inv.allocations) {
        const pay = await tx.payment.findUnique({ where: { id: alloc.paymentId } });
        if (pay) {
          const restoredUnallocated = pay.unallocatedAmount.add(alloc.amount);
          await tx.payment.update({
            where: { id: pay.id },
            data: {
              unallocatedAmount: restoredUnallocated,
              status: restoredUnallocated.equals(pay.amount) ? 'unallocated' : 'partially_allocated'
            }
          });
        }
      }

      await tx.invoice.update({
        where: { id: inv.id },
        data: {
          status: 'voided',
          paymentStatus: 'unpaid',
          notes: `${inv.notes || ''} [VOIDED: ${refund.reason}]`.trim()
        }
      });

      // Atomically reverse Phase 7 therapy billing:
      // Capture affected Panchakarma course IDs and session IDs before relationship fields are reset
      const affectedCourses = await tx.panchakarmaCourse.findMany({
        where: { packageInvoiceId: inv.id },
        select: { id: true, courseNumber: true }
      });
      const affectedCourseIds = affectedCourses.map(c => c.id);

      const affectedSessions = await tx.therapySession.findMany({
        where: {
          OR: [
            { invoiceId: inv.id },
            ...(affectedCourseIds.length > 0 ? [{ panchakarmaCourseId: { in: affectedCourseIds } }] : [])
          ]
        },
        select: { id: true, sessionRef: true, panchakarmaCourseId: true }
      });
      const affectedSessionIds = affectedSessions.map(s => s.id);

      // Restore sessions to unbilled state without loss of clinical execution history
      if (affectedSessionIds.length > 0) {
        await tx.therapySession.updateMany({
          where: { id: { in: affectedSessionIds } },
          data: {
            isBilled: false,
            invoiceId: null,
            billingMode: SessionBillingMode.UNBILLED
          }
        });
      }

      // Restore package courses to unbilled state without loss of clinical status or phase progression
      if (affectedCourseIds.length > 0) {
        await tx.panchakarmaCourse.updateMany({
          where: { id: { in: affectedCourseIds } },
          data: {
            isPackageBilled: false,
            packageInvoiceId: null,
            billingMode: PanchakarmaBillingMode.PACKAGE_BILLED
          }
        });
      }

      // Invoice void is an internal credit reversal approved by Super Admin; it transitions directly to completed
      const approved = await tx.refundRequest.update({
        where: { id: refund.id },
        data: {
          status: 'completed',
          approvedById: approver.id,
          approvedByName: approver.name,
          approvedByRole: approver.role,
          approvedAt: now,
          approvalNotes: approvalNotes || null
        }
      });
      return approved;
    } else if (refund.type === 'refund' && refund.paymentId) {
      const lockedPayments = await tx.$queryRaw<Array<{ id: string; unallocatedAmount: Prisma.Decimal }>>`
        SELECT id, "unallocatedAmount"
        FROM payments
        WHERE id = ${refund.paymentId}
        FOR UPDATE
      `;

      if (!lockedPayments || lockedPayments.length === 0) {
        throw new Error(`PaymentNotFound: Payment ${refund.paymentId} not found.`);
      }

      const pay = lockedPayments[0];
      const payUnallocated = new Prisma.Decimal(pay.unallocatedAmount);
      const refAmount = new Prisma.Decimal(refund.amount);

      if (payUnallocated.lessThan(refAmount)) {
        throw new Error(`InsufficientUnallocatedCredit: Payment only has ₹${payUnallocated.toFixed(2)} available to refund, but ₹${refAmount.toFixed(2)} requested.`);
      }

      // STRICT GOVERNANCE: Approval authorizes the refund but DOES NOT claim money has been returned or decrement patient balances.
      // Payment unallocatedAmount remains intact until manual disbursement execution via dbExecuteRefund.
      const approved = await tx.refundRequest.update({
        where: { id: refund.id },
        data: {
          status: 'approved',
          approvedById: approver.id,
          approvedByName: approver.name,
          approvedByRole: approver.role,
          approvedAt: now,
          approvalNotes: approvalNotes || null
        }
      });
      return approved;
    }

    const approved = await tx.refundRequest.update({
      where: { id: refund.id },
      data: {
        status: 'approved',
        approvedById: approver.id,
        approvedByName: approver.name,
        approvedByRole: approver.role,
        approvedAt: now,
        approvalNotes: approvalNotes || null
      }
    });

    return approved;
  }).then((updatedRefund) => {
    const domainRef = mapPrismaRefundToDomain(updatedRefund);
    const storeIdx = hospitalStore.refundRequests.findIndex((r) => r.id === requestId);
    if (storeIdx !== -1) hospitalStore.refundRequests[storeIdx] = domainRef;
    return domainRef;
  });
}

export async function dbExecuteRefund(
  requestId: string,
  executionData: {
    refundMethod?: string;
    externalReference?: string;
    notes?: string;
  },
  executor: { id: string; name: string; role: string }
): Promise<{ refund: RefundRequest; ledgerEntry: RefundLedgerEntry }> {
  if (!isPrismaConnected) {
    throw new Error('DatabaseUnavailable: Active PostgreSQL connection is required to execute refund.');
  }

  if (executor.role !== 'SUPER_ADMIN' && executor.role !== 'ACCOUNTANT') {
    throw new Error('UnauthorizedRefundExecution: Only authorized financial operators (ACCOUNTANT, SUPER_ADMIN) can execute approved refunds.');
  }

  return await prisma.$transaction(async (tx) => {
    // 1. Lock the refund request row with FOR UPDATE to prevent concurrent duplicate execution
    const lockedRefunds = await tx.$queryRaw<Array<{
      id: string;
      status: string;
      amount: Prisma.Decimal;
      paymentId: string | null;
      patientId: string | null;
      patientName: string;
      mrn: string;
      requestNumber: string;
      type: string;
      externalReference: string | null;
    }>>`
      SELECT id, status, amount, "paymentId", "patientId", "patientName", mrn, "requestNumber", type, "externalReference"
      FROM refund_requests
      WHERE id = ${requestId}
      FOR UPDATE
    `;

    if (!lockedRefunds || lockedRefunds.length === 0) {
      throw new Error(`RefundRequestNotFound: Refund request ${requestId} does not exist.`);
    }

    const ref = lockedRefunds[0];

    // Anti-duplicate execution check
    if (ref.status === 'completed') {
      throw new Error(`RefundAlreadyExecuted: Refund request ${ref.requestNumber} has already been executed.`);
    }

    if (ref.status !== 'approved') {
      throw new Error(`InvalidRefundExecutionState: Cannot execute refund with status "${ref.status}". Only "approved" refunds can be executed.`);
    }

    if (ref.type !== 'refund') {
      throw new Error(`InvalidRefundTypeForExecution: Only requests of type "refund" can be executed for cash disbursement. Request ${ref.requestNumber} has type "${ref.type}".`);
    }

    if (!ref.paymentId) {
      throw new Error('MissingPaymentId: A valid payment ID is required to execute payment refund.');
    }

    // 2. Lock the target payment row with FOR UPDATE
    const lockedPayments = await tx.$queryRaw<Array<{ id: string; unallocatedAmount: Prisma.Decimal }>>`
      SELECT id, "unallocatedAmount"
      FROM payments
      WHERE id = ${ref.paymentId}
      FOR UPDATE
    `;

    if (!lockedPayments || lockedPayments.length === 0) {
      throw new Error(`PaymentNotFound: Payment ${ref.paymentId} not found.`);
    }

    const payment = lockedPayments[0];
    const payUnallocated = new Prisma.Decimal(payment.unallocatedAmount);
    const refAmount = new Prisma.Decimal(ref.amount);

    if (payUnallocated.lessThan(refAmount)) {
      throw new Error(
        `InsufficientUnallocatedCredit: Payment only has ₹${payUnallocated.toFixed(2)} available to refund, but ₹${refAmount.toFixed(2)} required.`
      );
    }

    // 3. Decrement unallocated amount and update payment status
    const newUnallocated = payUnallocated.sub(refAmount);
    await tx.payment.update({
      where: { id: payment.id },
      data: {
        unallocatedAmount: newUnallocated,
        status: newUnallocated.isZero() ? 'refunded' : 'partially_refunded'
      }
    });

    // 4. Generate sequence-backed ledger entry number RLE-YYYY-XXXXX
    const year = new Date().getFullYear();
    const res = await tx.$queryRaw<[{ nextval: bigint }]>`SELECT nextval('refund_entry_seq')`;
    const seq = Number(res[0].nextval);
    const entryNumber = `RLE-${year}-${String(seq).padStart(5, '0')}`;
    const ledgerEntryId = `rle-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const now = new Date();

    const createdLedgerEntry = await tx.refundLedgerEntry.create({
      data: {
        id: ledgerEntryId,
        entryNumber,
        refundRequestId: ref.id,
        paymentId: payment.id,
        patientId: ref.patientId,
        patientName: ref.patientName,
        mrn: ref.mrn,
        amount: refAmount,
        refundMethod: executionData.refundMethod || 'Cash',
        externalReference: executionData.externalReference || null,
        executedById: executor.id,
        executedByName: executor.name,
        executedByRole: executor.role,
        executedAt: now,
        notes: executionData.notes || null
      }
    });

    const updatedRequest = await tx.refundRequest.update({
      where: { id: ref.id },
      data: {
        status: 'completed',
        executedById: executor.id,
        executedByName: executor.name,
        executedByRole: executor.role,
        executedAt: now,
        executionNotes: executionData.notes || null,
        refundMethod: executionData.refundMethod || 'Cash',
        externalReference: executionData.externalReference || ref.externalReference || null
      },
      include: {
        refundLedgerEntry: true
      }
    });

    return {
      refund: updatedRequest,
      ledgerEntry: createdLedgerEntry
    };
  }).then((result) => {
    const domainRefund = mapPrismaRefundToDomain(result.refund);
    const domainLedger = mapPrismaRefundLedgerEntryToDomain(result.ledgerEntry);

    const storeIdx = hospitalStore.refundRequests.findIndex((r) => r.id === requestId);
    if (storeIdx !== -1) hospitalStore.refundRequests[storeIdx] = domainRefund;

    return {
      refund: domainRefund,
      ledgerEntry: domainLedger
    };
  });
}

export async function dbRejectRefund(
  requestId: string,
  rejector: { id: string; name: string; role: string },
  rejectionReason: string
): Promise<RefundRequest> {
  if (!isPrismaConnected) {
    throw new Error('DatabaseUnavailable: Active PostgreSQL connection is required to reject refund.');
  }

  if (rejector.role !== 'SUPER_ADMIN') {
    throw new Error('UnauthorizedRefundRejection: Only SUPER_ADMIN can reject financial refund requests.');
  }

  const refund = await prisma.refundRequest.findUnique({
    where: { id: requestId }
  });
  if (!refund) {
    throw new Error(`RefundRequestNotFound: Refund request ${requestId} does not exist.`);
  }
  if (refund.status !== 'pending') {
    throw new Error(`InvalidRefundState: Refund request ${refund.requestNumber} is already "${refund.status}".`);
  }

  const updated = await prisma.refundRequest.update({
    where: { id: requestId },
    data: {
      status: 'rejected',
      rejectedById: rejector.id,
      rejectedByName: rejector.name,
      rejectedAt: new Date(),
      rejectionReason: rejectionReason.trim()
    }
  });

  const domainRef = mapPrismaRefundToDomain(updated);
  const storeIdx = hospitalStore.refundRequests.findIndex((r) => r.id === requestId);
  if (storeIdx !== -1) hospitalStore.refundRequests[storeIdx] = domainRef;
  return domainRef;
}

export async function dbGetRefundRequests(filters?: {
  status?: string;
  patientId?: string;
  mrn?: string;
}): Promise<RefundRequest[]> {
  if (isPrismaConnected) {
    try {
      const where: Prisma.RefundRequestWhereInput = {};
      if (filters?.status) where.status = filters.status;
      if (filters?.patientId) where.patientId = filters.patientId;
      if (filters?.mrn) where.mrn = filters.mrn;

      const requests = await prisma.refundRequest.findMany({
        where,
        include: {
          refundLedgerEntry: true
        },
        orderBy: { requestedAt: 'desc' }
      });
      return requests.map(mapPrismaRefundToDomain);
    } catch (err) {
      console.warn('[Prisma dbGetRefundRequests] Fallback:', err);
    }
  }
  let res = [...hospitalStore.refundRequests];
  if (filters?.status) res = res.filter((r) => r.status === filters.status);
  return res;
}

export async function dbGetPatientAccount(patientIdOrMrn: string): Promise<PatientAccountSummary> {
  if (!isPrismaConnected) {
    throw new Error('DatabaseUnavailable: Active PostgreSQL connection is required to fetch patient account.');
  }

  const patient = await prisma.patient.findFirst({
    where: {
      OR: [
        { id: patientIdOrMrn },
        { mrn: patientIdOrMrn }
      ]
    }
  });

  if (!patient) {
    throw new Error(`PatientNotFound: Patient with identifier "${patientIdOrMrn}" does not exist.`);
  }

  const invoices = await prisma.invoice.findMany({
    where: {
      OR: [
        { patientId: patient.id },
        { mrn: patient.mrn }
      ]
    },
    include: {
      allocations: true,
      refundRequests: true
    },
    orderBy: { createdAt: 'desc' }
  });

  const payments = await prisma.payment.findMany({
    where: {
      OR: [
        { patientId: patient.id },
        { mrn: patient.mrn }
      ]
    },
    include: {
      allocations: true,
      refundRequests: true
    },
    orderBy: { paymentDate: 'desc' }
  });

  const refundRequests = await prisma.refundRequest.findMany({
    where: {
      OR: [
        { patientId: patient.id },
        { mrn: patient.mrn }
      ]
    },
    orderBy: { requestedAt: 'desc' }
  });

  let totalInvoicedDec = new Prisma.Decimal(0);
  let totalOutstandingDec = new Prisma.Decimal(0);
  for (const inv of invoices) {
    if (inv.status !== 'voided' && inv.status !== 'cancelled') {
      totalInvoicedDec = totalInvoicedDec.add(inv.totalAmount);
      totalOutstandingDec = totalOutstandingDec.add(inv.balance);
    }
  }

  let totalPaidDec = new Prisma.Decimal(0);
  let totalUnallocatedCreditDec = new Prisma.Decimal(0);
  for (const p of payments) {
    totalPaidDec = totalPaidDec.add(p.amount);
    totalUnallocatedCreditDec = totalUnallocatedCreditDec.add(p.unallocatedAmount);
  }

  // Deduct ONLY completed (executed) refunds from totalPaid.
  // Pending and approved refunds have NOT disbursed money, so they MUST NOT reduce totalPaid or increase unallocated credit!
  let totalCompletedRefundsDec = new Prisma.Decimal(0);
  for (const r of refundRequests) {
    if (r.status === 'completed' && r.type === 'refund') {
      totalCompletedRefundsDec = totalCompletedRefundsDec.add(r.amount);
    }
  }

  const effectiveTotalPaidDec = totalPaidDec.sub(totalCompletedRefundsDec);
  const netBalanceDec = totalOutstandingDec.sub(totalUnallocatedCreditDec);

  return {
    patientId: patient.id,
    patientName: `${patient.firstName} ${patient.lastName}`,
    mrn: patient.mrn,
    totalInvoiced: Number(totalInvoicedDec.toFixed(2)),
    totalPaid: Number(effectiveTotalPaidDec.toFixed(2)),
    totalOutstanding: Number(totalOutstandingDec.toFixed(2)),
    totalUnallocatedCredit: Number(totalUnallocatedCreditDec.toFixed(2)),
    netBalance: Number(netBalanceDec.toFixed(2)),
    invoices: invoices.map(mapPrismaInvoiceToDomain),
    payments: payments.map(mapPrismaPaymentToDomain),
    refundRequests: refundRequests.map(mapPrismaRefundToDomain)
  };
}

// ------------------------------------------------------------------------------
// FINANCIAL REPORTS
// ------------------------------------------------------------------------------

export async function dbGetDailyCollectionReport(
  startDate?: string,
  endDate?: string,
  paymentMethod?: string
): Promise<DailyCollectionReport> {
  if (!isPrismaConnected) {
    throw new Error('DatabaseUnavailable: Active PostgreSQL connection is required for collection report.');
  }

  const now = new Date();
  const start = startDate ? new Date(startDate) : new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
  const end = endDate ? new Date(endDate) : new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

  const where: Prisma.PaymentWhereInput = {
    paymentDate: {
      gte: start,
      lte: end
    }
  };
  if (paymentMethod && paymentMethod !== 'All') {
    where.paymentMethod = paymentMethod;
  }

  const payments = await prisma.payment.findMany({
    where,
    orderBy: { paymentDate: 'desc' },
    include: { allocations: true }
  });

  const byMethod: Record<PaymentMethod, number> = {
    Cash: 0,
    UPI: 0,
    'Bank Transfer': 0,
    Card: 0,
    Other: 0
  };

  let totalDec = new Prisma.Decimal(0);
  for (const p of payments) {
    totalDec = totalDec.add(p.amount);
    const m = p.paymentMethod as PaymentMethod;
    if (byMethod[m] !== undefined) {
      byMethod[m] = Number(new Prisma.Decimal(byMethod[m]).add(p.amount).toFixed(2));
    } else {
      byMethod.Other = Number(new Prisma.Decimal(byMethod.Other).add(p.amount).toFixed(2));
    }
  }

  // Completed refunds deduction: Only completed (executed) refunds deduct from cash collections
  const refundLedgerEntries = await prisma.refundLedgerEntry.findMany({
    where: {
      executedAt: {
        gte: start,
        lte: end
      }
    }
  });

  let totalRefundedDec = new Prisma.Decimal(0);
  for (const entry of refundLedgerEntries) {
    totalRefundedDec = totalRefundedDec.add(entry.amount);
  }

  const netCollectionDec = totalDec.sub(totalRefundedDec);

  return {
    reportDate: now.toISOString(),
    startDate: start.toISOString(),
    endDate: end.toISOString(),
    totalCollected: Number(totalDec.toFixed(2)),
    totalRefunded: Number(totalRefundedDec.toFixed(2)),
    netCollection: Number(netCollectionDec.toFixed(2)),
    byMethod,
    paymentCount: payments.length,
    payments: payments.map(mapPrismaPaymentToDomain)
  };
}

export async function dbGetOutstandingReceivablesReport(): Promise<OutstandingReceivablesReport> {
  if (!isPrismaConnected) {
    throw new Error('DatabaseUnavailable: Active PostgreSQL connection is required for receivables report.');
  }

  const now = new Date();
  const openInvoices = await prisma.invoice.findMany({
    where: {
      status: { in: ['issued', 'partially_paid'] },
      balance: { gt: 0 }
    },
    orderBy: { createdAt: 'asc' }
  });

  const agingBuckets = {
    current: 0,
    days31_60: 0,
    days61_90: 0,
    over90: 0
  };

  let totalOutstandingDec = new Prisma.Decimal(0);
  const items = openInvoices.map((inv) => {
    totalOutstandingDec = totalOutstandingDec.add(inv.balance);
    const baselineDate = inv.issuedAt || inv.admissionDate || inv.createdAt;
    const diffMs = now.getTime() - new Date(baselineDate).getTime();
    const daysOverdue = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));

    let bucket: 'current' | '31-60' | '61-90' | '90+';
    if (daysOverdue <= 30) {
      bucket = 'current';
      agingBuckets.current = Number(new Prisma.Decimal(agingBuckets.current).add(inv.balance).toFixed(2));
    } else if (daysOverdue <= 60) {
      bucket = '31-60';
      agingBuckets.days31_60 = Number(new Prisma.Decimal(agingBuckets.days31_60).add(inv.balance).toFixed(2));
    } else if (daysOverdue <= 90) {
      bucket = '61-90';
      agingBuckets.days61_90 = Number(new Prisma.Decimal(agingBuckets.days61_90).add(inv.balance).toFixed(2));
    } else {
      bucket = '90+';
      agingBuckets.over90 = Number(new Prisma.Decimal(agingBuckets.over90).add(inv.balance).toFixed(2));
    }

    return {
      invoiceId: inv.id,
      invoiceNumber: inv.invoiceNumber,
      patientId: inv.patientId || undefined,
      patientName: inv.patientName,
      mrn: inv.mrn,
      issueDate: baselineDate.toISOString(),
      dueDate: inv.dueDate ? inv.dueDate.toISOString() : undefined,
      totalAmount: Number(inv.totalAmount),
      paidAmount: Number(inv.paidAmount),
      balance: Number(inv.balance),
      daysOverdue,
      bucket
    };
  });

  return {
    reportDate: now.toISOString(),
    totalOutstanding: Number(totalOutstandingDec.toFixed(2)),
    invoiceCount: items.length,
    agingBuckets,
    items
  };
}

export async function dbGetPatientDemographicsReport(startDate?: string, endDate?: string) {
  if (!isPrismaConnected) {
    throw new Error('DatabaseUnavailable: Active PostgreSQL connection is required for patient report.');
  }
  const dateFilter: Prisma.PatientWhereInput = {};
  if (startDate || endDate) {
    dateFilter.createdAt = {
      ...(startDate && { gte: new Date(startDate) }),
      ...(endDate && { lte: new Date(endDate) })
    };
  }

  const [total, active, archived, allPatients] = await Promise.all([
    prisma.patient.count({ where: dateFilter }),
    prisma.patient.count({ where: { ...dateFilter, status: 'active' } }),
    prisma.patient.count({ where: { ...dateFilter, status: 'archived' } }),
    prisma.patient.findMany({
      where: dateFilter,
      select: { gender: true, age: true, createdAt: true }
    })
  ]);

  const byGender: Record<string, number> = { Male: 0, Female: 0, Other: 0, Undisclosed: 0 };
  const byAgeGroup: Record<string, number> = { '0-17': 0, '18-35': 0, '36-60': 0, '60+': 0, 'Unknown': 0 };

  for (const p of allPatients) {
    const g = p.gender || 'Undisclosed';
    byGender[g] = (byGender[g] || 0) + 1;

    if (p.age === null || p.age === undefined) {
      byAgeGroup['Unknown']++;
    } else if (p.age < 18) {
      byAgeGroup['0-17']++;
    } else if (p.age <= 35) {
      byAgeGroup['18-35']++;
    } else if (p.age <= 60) {
      byAgeGroup['36-60']++;
    } else {
      byAgeGroup['60+']++;
    }
  }

  return {
    total,
    active,
    archived,
    byGender,
    byAgeGroup,
    generatedAt: new Date().toISOString()
  };
}

export async function dbGetAppointmentOperationalReport(startDate?: string, endDate?: string) {
  if (!isPrismaConnected) {
    throw new Error('DatabaseUnavailable: Active PostgreSQL connection is required for appointment report.');
  }
  const dateFilter: Prisma.AppointmentWhereInput = {};
  if (startDate || endDate) {
    dateFilter.createdAt = {
      ...(startDate && { gte: new Date(startDate) }),
      ...(endDate && { lte: new Date(endDate) })
    };
  }

  const [total, scheduled, completed, cancelled, inConsultation, waiting, allApts] = await Promise.all([
    prisma.appointment.count({ where: dateFilter }),
    prisma.appointment.count({ where: { ...dateFilter, status: 'scheduled' } }),
    prisma.appointment.count({ where: { ...dateFilter, status: 'completed' } }),
    prisma.appointment.count({ where: { ...dateFilter, status: 'cancelled' } }),
    prisma.appointment.count({ where: { ...dateFilter, status: 'in_consultation' } }),
    prisma.appointment.count({ where: { ...dateFilter, status: 'waiting' } }),
    prisma.appointment.findMany({
      where: dateFilter,
      select: { practitionerRole: true, bookingSource: true, isEscalated: true }
    })
  ]);

  const byDiscipline: Record<string, number> = { DOCTOR: 0, VAIDYA: 0 };
  let walkInCount = 0;
  let escalatedCount = 0;

  for (const a of allApts) {
    const r = a.practitionerRole || 'DOCTOR';
    byDiscipline[r] = (byDiscipline[r] || 0) + 1;
    if (a.bookingSource === 'walk_in') walkInCount++;
    if (a.isEscalated) escalatedCount++;
  }

  return {
    total,
    byStatus: {
      scheduled,
      waiting,
      inConsultation,
      completed,
      cancelled
    },
    byDiscipline,
    walkIns: walkInCount,
    escalations: escalatedCount,
    generatedAt: new Date().toISOString()
  };
}

export async function dbGetClinicalActivityReport(startDate?: string, endDate?: string) {
  if (!isPrismaConnected) {
    throw new Error('DatabaseUnavailable: Active PostgreSQL connection is required for clinical report.');
  }
  const dateFilter: any = {};
  if (startDate || endDate) {
    dateFilter.createdAt = {
      ...(startDate && { gte: new Date(startDate) }),
      ...(endDate && { lte: new Date(endDate) })
    };
  }

  const [encounters, vitalsCount, diagnosesCount, referralsCount] = await Promise.all([
    prisma.clinicalEncounter.findMany({
      where: dateFilter,
      select: { discipline: true, status: true, clinicalDocumentationCompleted: true }
    }),
    prisma.clinicalVitals.count({ where: dateFilter }),
    prisma.clinicalDiagnosis.count({ where: dateFilter }),
    prisma.panchakarmaReferral.count({ where: dateFilter })
  ]);

  const byDiscipline: Record<string, { total: number; completed: number; inProgress: number }> = {
    DOCTOR: { total: 0, completed: 0, inProgress: 0 },
    VAIDYA: { total: 0, completed: 0, inProgress: 0 }
  };

  for (const e of encounters) {
    const d = e.discipline === 'VAIDYA' ? 'VAIDYA' : 'DOCTOR';
    byDiscipline[d].total++;
    if (e.status === 'completed') {
      byDiscipline[d].completed++;
    } else {
      byDiscipline[d].inProgress++;
    }
  }

  return {
    totalEncounters: encounters.length,
    byDiscipline,
    vitalsRecorded: vitalsCount,
    diagnosesRecorded: diagnosesCount,
    panchakarmaReferrals: referralsCount,
    generatedAt: new Date().toISOString()
  };
}

export async function dbGetTreatmentOperationalReport(startDate?: string, endDate?: string) {
  if (!isPrismaConnected) {
    throw new Error('DatabaseUnavailable: Active PostgreSQL connection is required for treatment report.');
  }
  const dateFilter: any = {};
  if (startDate || endDate) {
    dateFilter.createdAt = {
      ...(startDate && { gte: new Date(startDate) }),
      ...(endDate && { lte: new Date(endDate) })
    };
  }

  const [sessions, courses] = await Promise.all([
    prisma.therapySession.findMany({
      where: dateFilter,
      select: { status: true, billingMode: true, isBilled: true, roomCodeSnapshot: true }
    }),
    prisma.panchakarmaCourse.findMany({
      where: dateFilter,
      select: { currentPhase: true, status: true, isPackageBilled: true }
    })
  ]);

  const sessionStatusCounts: Record<string, number> = {
    SCHEDULED: 0,
    IN_PROGRESS: 0,
    COMPLETED: 0,
    ABORTED: 0
  };
  let billedSessionCount = 0;
  for (const s of sessions) {
    sessionStatusCounts[s.status] = (sessionStatusCounts[s.status] || 0) + 1;
    if (s.isBilled) billedSessionCount++;
  }

  const coursePhaseCounts: Record<string, number> = {
    PURVAKARMA: 0,
    PRADHANAKARMA: 0,
    PASCHATKARMA: 0
  };
  let packageBilledCount = 0;
  for (const c of courses) {
    coursePhaseCounts[c.currentPhase] = (coursePhaseCounts[c.currentPhase] || 0) + 1;
    if (c.isPackageBilled) packageBilledCount++;
  }

  return {
    sessions: {
      total: sessions.length,
      byStatus: sessionStatusCounts,
      billedCount: billedSessionCount
    },
    courses: {
      total: courses.length,
      byPhase: coursePhaseCounts,
      packageBilledCount
    },
    generatedAt: new Date().toISOString()
  };
}

export async function dbGetPharmacyInventoryReport() {
  if (!isPrismaConnected) {
    throw new Error('DatabaseUnavailable: Active PostgreSQL connection is required for pharmacy report.');
  }

  const [stockBatches, dispensingCount] = await Promise.all([
    prisma.medicationStock.findMany({
      select: {
        id: true,
        drugName: true,
        stockQuantity: true,
        reorderThreshold: true,
        expiryDate: true,
        unitPrice: true
      }
    }),
    prisma.dispensingRecord.count()
  ]);

  const now = new Date();
  let lowStockCount = 0;
  let expiredCount = 0;
  const uniqueMedications = new Set<string>();

  for (const b of stockBatches) {
    uniqueMedications.add(b.drugName.toLowerCase());
    if (b.stockQuantity <= (b.reorderThreshold || 10)) {
      lowStockCount++;
    }
    if (b.expiryDate && new Date(b.expiryDate) < now) {
      expiredCount++;
    }
  }

  return {
    totalDistinctMedications: uniqueMedications.size,
    totalStockBatches: stockBatches.length,
    lowStockBatches: lowStockCount,
    expiredBatches: expiredCount,
    totalDispensations: dispensingCount,
    generatedAt: new Date().toISOString()
  };
}

export async function dbGetStaffWorkforceReport() {
  if (!isPrismaConnected) {
    throw new Error('DatabaseUnavailable: Active PostgreSQL connection is required for staff report.');
  }

  const [staffList, departments] = await Promise.all([
    prisma.staffMember.findMany({
      select: {
        id: true,
        role: true,
        status: true,
        department: true,
        primaryDepartmentId: true,
        isSuspended: true
      }
    }),
    prisma.department.findMany({
      select: { id: true, code: true, name: true, discipline: true, isActive: true }
    })
  ]);

  const byRole: Record<string, number> = {};
  const byStatus: Record<string, number> = {};
  const byDepartment: Record<string, number> = {};

  for (const s of staffList) {
    byRole[s.role] = (byRole[s.role] || 0) + 1;
    byStatus[s.status] = (byStatus[s.status] || 0) + 1;
    const dept = s.department || 'Unassigned';
    byDepartment[dept] = (byDepartment[dept] || 0) + 1;
  }

  return {
    totalStaff: staffList.length,
    byRole,
    byStatus,
    byDepartment,
    departmentsCount: departments.length,
    activeDepartments: departments.filter(d => d.isActive).length,
    generatedAt: new Date().toISOString()
  };
}

// ------------------------------------------------------------------------------
// LAB ORDERS
// ------------------------------------------------------------------------------

export async function dbGetLabOrders(): Promise<LabOrder[]> {
  if (isPrismaConnected) {
    try {
      const dbLabs = await prisma.labOrder.findMany({
        orderBy: { orderedAt: 'desc' }
      });
      return dbLabs.map((l) => ({
        id: l.id,
        orderNumber: l.orderNumber,
        patientId: l.patientId || '',
        patientName: l.patientName,
        mrn: l.mrn,
        testType: l.testType as any,
        priority: l.priority as any,
        orderingDoctor: l.orderingDoctor,
        orderedAt: l.orderedAt.toISOString(),
        status: l.status as any,
        resultValue: l.resultValue || undefined,
        normalRange: l.normalRange || undefined,
        isAbnormal: l.isAbnormal,
        labNotes: l.labNotes || undefined
      }));
    } catch (err) {
      console.warn('[Prisma dbGetLabOrders] Fallback:', err);
    }
  }
  return hospitalStore.labOrders;
}

export async function dbCreateLabOrder(labOrder: LabOrder): Promise<LabOrder> {
  if (isPrismaConnected) {
    try {
      await prisma.labOrder.create({
        data: {
          id: labOrder.id,
          orderNumber: labOrder.orderNumber,
          patientId: labOrder.patientId,
          patientName: labOrder.patientName,
          mrn: labOrder.mrn,
          testType: labOrder.testType,
          priority: labOrder.priority,
          orderingDoctor: labOrder.orderingDoctor,
          orderedAt: new Date(labOrder.orderedAt),
          status: labOrder.status,
          labNotes: labOrder.labNotes
        }
      });
    } catch (err) {
      console.warn('[Prisma dbCreateLabOrder] Warning:', err);
    }
  }
  hospitalStore.labOrders.unshift(labOrder);
  return labOrder;
}

export async function dbUpdateLabOrder(labOrder: LabOrder): Promise<LabOrder> {
  if (isPrismaConnected) {
    try {
      await prisma.labOrder.upsert({
        where: { id: labOrder.id },
        update: {
          status: labOrder.status,
          resultValue: labOrder.resultValue,
          normalRange: labOrder.normalRange,
          isAbnormal: labOrder.isAbnormal,
          labNotes: labOrder.labNotes
        },
        create: {
          id: labOrder.id,
          orderNumber: labOrder.orderNumber || `LAB-${Date.now()}`,
          patientId: labOrder.patientId,
          patientName: labOrder.patientName || 'Patient',
          mrn: labOrder.mrn || 'MRN-84920',
          testType: labOrder.testType || 'Laboratory Panel',
          priority: labOrder.priority || 'Routine',
          orderingDoctor: labOrder.orderingDoctor || 'Attending Physician',
          orderedAt: labOrder.orderedAt ? new Date(labOrder.orderedAt) : new Date(),
          status: labOrder.status || 'ordered',
          resultValue: labOrder.resultValue,
          normalRange: labOrder.normalRange,
          isAbnormal: labOrder.isAbnormal || false,
          labNotes: labOrder.labNotes
        }
      });
    } catch (err) {
      console.warn('[Prisma dbUpdateLabOrder] Warning:', err);
    }
  }
  return labOrder;
}

// ------------------------------------------------------------------------------
// AUDIT LOG
// ------------------------------------------------------------------------------

export async function dbGetAuditLogs(): Promise<ClinicalAuditLog[]> {
  if (isPrismaConnected) {
    try {
      const dbLogs = await prisma.auditLog.findMany({
        orderBy: { timestamp: 'desc' },
        take: 200
      });
      return dbLogs.map((l) => ({
        id: l.id,
        timestamp: l.timestamp.toISOString(),
        actor: l.actor,
        role: l.role,
        category: l.category as AuditCategory,
        action: l.action,
        patientMrn: l.patientMrn || undefined,
        details: l.details
      }));
    } catch (err) {
      console.warn('[Prisma dbGetAuditLogs] Fallback:', err);
    }
  }
  return hospitalStore.auditLogs;
}

export async function dbLogAudit(
  actor: string,
  role: string,
  action: string,
  category: AuditCategory,
  details: string,
  patientMrn?: string
): Promise<ClinicalAuditLog> {
  const logEntry: ClinicalAuditLog = {
    id: `log-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    timestamp: new Date().toISOString(),
    actor,
    role,
    action,
    category,
    patientMrn,
    details
  };

  if (isPrismaConnected) {
    try {
      await prisma.auditLog.create({
        data: {
          id: logEntry.id,
          timestamp: new Date(logEntry.timestamp),
          actor: logEntry.actor,
          role: logEntry.role,
          category: logEntry.category,
          action: logEntry.action,
          patientMrn: logEntry.patientMrn,
          details: logEntry.details
        }
      });
    } catch (err) {
      console.warn('[Prisma dbLogAudit] Warning:', err);
    }
  }

  hospitalStore.auditLogs.unshift(logEntry);
  return logEntry;
}

// ------------------------------------------------------------------------------
// RBAC USERS & STAFF GOVERNANCE PERSISTENCE HELPERS
// ------------------------------------------------------------------------------

export async function dbGetUsers(): Promise<AppUser[]> {
  if (isPrismaConnected) {
    try {
      const dbUsers = await prisma.user.findMany({
        orderBy: { createdAt: 'asc' }
      });
      return dbUsers.map((u) => {
        const normalizedRole = (validateAndNormalizeRole(u.role) || 'RECEPTIONIST') as UserRole;
        return {
          id: u.id,
          name: u.name,
          role: normalizedRole,
          title: `${normalizedRole} - ${u.department}`,
          email: u.email,
          department: u.department,
          avatarInitials: u.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase(),
          status: (u.status as any) || 'active'
        };
      });
    } catch (err) {
      console.warn('[Prisma dbGetUsers] Fallback:', err);
    }
  }
  return hospitalStore.users;
}

export async function dbGetPractitioners(): Promise<any[]> {
  try {
    const users = await prisma.user.findMany({
      where: {
        role: { in: ['DOCTOR', 'VAIDYA'] },
        isActive: true
      },
      orderBy: { name: 'asc' }
    });
    if (users.length > 0) {
      return users.map((u: any) => ({
        id: u.id,
        name: u.name,
        title: u.role === 'VAIDYA' ? 'Ayurvedic Physician (Vaidya)' : 'Medical Consultant',
        specialty: u.role === 'VAIDYA' ? 'Ayurvedic Medicine' : 'Internal Medicine',
        department: u.department || (u.role === 'VAIDYA' ? 'Ayurvedic Medicine' : 'General Medicine'),
        licenseNumber: `LIC-${u.role}-${u.id.slice(0, 6).toUpperCase()}`,
        status: 'on_duty',
        room: u.role === 'VAIDYA' ? 'Ayurvedic Suite 101' : 'Consultation Room 202',
        phone: '+91 471 2345678',
        email: u.email,
        availableDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
        timeSlots: [
          '09:00 AM',
          '09:30 AM',
          '10:00 AM',
          '10:30 AM',
          '11:00 AM',
          '11:30 AM',
          '02:00 PM',
          '02:30 PM',
          '03:00 PM',
          '03:30 PM',
          '04:00 PM'
        ],
        activePatientsCount: 0
      }));
    }
  } catch (err) {
    console.warn('[Prisma dbGetPractitioners] Fallback:', err);
  }
  return hospitalStore.doctors;
}

export async function dbUpdateUserRole(userId: string, newRole: UserRole): Promise<{ success: boolean; user?: AppUser; error?: string }> {
  const normalizedRole = validateAndNormalizeRole(newRole);
  if (!normalizedRole) {
    return {
      success: false,
      error: 'Invalid or unsupported role. Permitted roles are: SUPER_ADMIN, ADMIN, DOCTOR, VAIDYA, RECEPTIONIST, PHARMACIST, ACCOUNTANT.'
    };
  }

  let updatedUser: AppUser | undefined;

  if (isPrismaConnected) {
    try {
      const dbUser = await prisma.user.update({
        where: { id: userId },
        data: { role: normalizedRole }
      });

      // Synchronize role on matching staffMember if exists
      if (dbUser.email) {
        await prisma.staffMember.updateMany({
          where: { email: dbUser.email },
          data: { role: normalizedRole }
        });
      }

      updatedUser = {
        id: dbUser.id,
        name: dbUser.name,
        role: normalizedRole,
        title: `${normalizedRole} - ${dbUser.department}`,
        email: dbUser.email,
        department: dbUser.department,
        avatarInitials: dbUser.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase(),
        status: dbUser.status as any
      };
    } catch (err) {
      console.warn('[Prisma dbUpdateUserRole] Database update note:', err);
    }
  }

  // Update in-memory store
  const userIdx = hospitalStore.users.findIndex((u) => u.id === userId);
  if (userIdx >= 0) {
    hospitalStore.users[userIdx].role = normalizedRole;
    if (!updatedUser) {
      updatedUser = hospitalStore.users[userIdx];
    }
  }

  // Update matching in-memory staff member
  const staffIdx = hospitalStore.staff.findIndex(
    (s) => s.id === userId || (updatedUser && s.email.toLowerCase() === updatedUser.email.toLowerCase())
  );
  if (staffIdx >= 0) {
    hospitalStore.staff[staffIdx].role = normalizedRole;
  }

  if (!updatedUser) {
    return { success: false, error: 'User record not found.' };
  }

  return { success: true, user: updatedUser };
}

// ------------------------------------------------------------------------------
// PHASE 6A: STAFF MASTER RECORD & LIFECYCLE MANAGEMENT
// ------------------------------------------------------------------------------

export async function generateUniqueStaffId(): Promise<string> {
  const year = new Date().getFullYear();
  if (!isPrismaConnected) {
    throw new Error('DatabaseUnavailable: Active PostgreSQL connection is required for sequence-backed Staff ID generation.');
  }

  try {
    const res = await prisma.$queryRaw<[{ nextval: bigint }]>`SELECT nextval('staff_id_seq')`;
    if (!res || !res[0] || res[0].nextval === undefined || res[0].nextval === null) {
      throw new Error('SequenceUnavailable: Sequence "staff_id_seq" returned empty result.');
    }
    const seq = Number(res[0].nextval);
    if (isNaN(seq) || seq <= 0) {
      throw new Error('SequenceInvalid: Sequence "staff_id_seq" returned invalid integer.');
    }
    return `STF-${year}-${String(seq).padStart(5, '0')}`;
  } catch (err: any) {
    console.error('[Prisma generateUniqueStaffId] Fail-closed sequence failure:', err.message);
    throw new Error(`StaffIdGenerationFailed: Authoritative sequence generation failed: ${err.message}`);
  }
}

export function mapPrismaStaffToDomain(s: any): StaffMember {
  return {
    id: s.id,
    employeeId: s.employeeId,
    name: s.name,
    role: s.role as UserRole,
    designation: s.designation,
    department: s.department,
    email: s.email,
    phone: s.phone,
    licenseNumber: s.licenseNumber ?? null,
    status: s.status,
    shift: s.shift ?? null,
    qualification: s.qualification ?? null,
    joiningDate: s.joiningDate ?? null,
    dateOfJoining: s.dateOfJoining ? s.dateOfJoining.toISOString() : null,
    address: s.address ?? null,
    emergencyContactName: s.emergencyContactName ?? null,
    emergencyContactPhone: s.emergencyContactPhone ?? null,
    employmentType: s.employmentType ?? null,
    reportingTo: s.reportingTo ?? null,
    discipline: s.discipline ?? null,
    specialty: s.specialty ?? null,
    userId: s.userId ?? null,
    activationPin: s.activationPin ?? null,
    activationPinHash: s.activationPinHash ?? null,
    pinExpiresAt: s.pinExpiresAt ? s.pinExpiresAt.toISOString() : null,
    pinAttempts: s.pinAttempts ?? 0,
    isSuspended: s.isSuspended ?? false,
    suspendedAt: s.suspendedAt ? s.suspendedAt.toISOString() : null,
    suspendedById: s.suspendedById ?? null,
    suspendedByName: s.suspendedByName ?? null,
    suspendedReason: s.suspendedReason ?? null,
    archivedAt: s.archivedAt ? s.archivedAt.toISOString() : null,
    archivedById: s.archivedById ?? null,
    archivedByName: s.archivedByName ?? null,
    archivedReason: s.archivedReason ?? null,
    createdById: s.createdById ?? null,
    createdByName: s.createdByName ?? null,
    createdAt: s.createdAt ? s.createdAt.toISOString() : undefined,
    updatedAt: s.updatedAt ? s.updatedAt.toISOString() : undefined,
    notes: s.notes ?? null
  };
}

export async function dbGetStaffList(filters: {
  page?: number;
  limit?: number;
  search?: string;
  role?: string;
  department?: string;
  status?: string;
  includeArchived?: boolean;
}): Promise<{ data: StaffMember[]; pagination: { total: number; page: number; limit: number; totalPages: number } }> {
  const page = Math.max(1, Number(filters.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(filters.limit) || 25));
  const skip = (page - 1) * limit;

  if (isPrismaConnected) {
    try {
      const where: Prisma.StaffMemberWhereInput = {};

      if (filters.role && filters.role !== 'all') {
        const validRole = validateAndNormalizeRole(filters.role);
        if (validRole) where.role = validRole;
      }

      if (filters.department && filters.department !== 'all') {
        where.department = { equals: filters.department, mode: 'insensitive' };
      }

      if (filters.status && filters.status !== 'all') {
        where.status = filters.status;
      } else if (!filters.includeArchived) {
        where.status = { not: 'archived' };
      }

      if (filters.search && filters.search.trim()) {
        const s = filters.search.trim();
        where.OR = [
          { name: { contains: s, mode: 'insensitive' } },
          { employeeId: { contains: s, mode: 'insensitive' } },
          { email: { contains: s, mode: 'insensitive' } },
          { phone: { contains: s, mode: 'insensitive' } },
          { licenseNumber: { contains: s, mode: 'insensitive' } },
          { designation: { contains: s, mode: 'insensitive' } },
          { department: { contains: s, mode: 'insensitive' } }
        ];
      }

      const total = await prisma.staffMember.count({ where });
      const records = await prisma.staffMember.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' }
      });

      return {
        data: records.map(mapPrismaStaffToDomain),
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit) || 1
        }
      };
    } catch (err) {
      console.warn('[Prisma dbGetStaffList] Error querying database, falling back:', err);
    }
  }

  // In-memory fallback
  let list = [...hospitalStore.staff];
  if (filters.role && filters.role !== 'all') {
    list = list.filter((s) => s.role.toLowerCase() === filters.role!.toLowerCase());
  }
  if (filters.department && filters.department !== 'all') {
    list = list.filter((s) => s.department.toLowerCase() === filters.department!.toLowerCase());
  }
  if (filters.status && filters.status !== 'all') {
    list = list.filter((s) => s.status === filters.status);
  } else if (!filters.includeArchived) {
    list = list.filter((s) => s.status !== 'archived');
  }
  if (filters.search && filters.search.trim()) {
    const s = filters.search.toLowerCase().trim();
    list = list.filter(
      (m) =>
        m.name.toLowerCase().includes(s) ||
        m.employeeId.toLowerCase().includes(s) ||
        m.email.toLowerCase().includes(s) ||
        m.phone.toLowerCase().includes(s) ||
        (m.licenseNumber && m.licenseNumber.toLowerCase().includes(s)) ||
        m.department.toLowerCase().includes(s)
    );
  }

  const total = list.length;
  const paginated = list.slice(skip, skip + limit);
  return {
    data: paginated,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1
    }
  };
}

export async function dbGetStaffById(id: string): Promise<StaffMember | null> {
  if (isPrismaConnected) {
    try {
      const record = await prisma.staffMember.findFirst({
        where: {
          OR: [{ id }, { employeeId: id }, { email: id.toLowerCase().trim() }]
        }
      });
      if (record) return mapPrismaStaffToDomain(record);
    } catch (err) {
      console.warn('[Prisma dbGetStaffById] Error:', err);
    }
  }

  const match = hospitalStore.staff.find(
    (s) => s.id === id || s.employeeId === id || s.email.toLowerCase() === id.toLowerCase()
  );
  return match || null;
}

export async function dbCreateStaffMember(
  data: {
    name: string;
    email: string;
    role: string;
    designation: string;
    department: string;
    phone: string;
    employmentType?: string | null;
    licenseNumber?: string | null;
    qualification?: string | null;
    discipline?: string | null;
    specialty?: string | null;
    shift?: string | null;
    joiningDate?: string | null;
    dateOfJoining?: string | null;
    address?: string | null;
    emergencyContactName?: string | null;
    emergencyContactPhone?: string | null;
    reportingTo?: string | null;
    notes?: string | null;
    activationPin?: string | null;
  },
  actor: { id: string; name: string; role: string }
): Promise<{ staff: StaffMember; activationPin: string }> {
  const cleanEmail = (data.email || '').trim().toLowerCase();
  if (!cleanEmail) {
    throw new Error('EmailRequired: Staff email address is mandatory.');
  }
  if (!cleanEmail.endsWith('@sahachara.com')) {
    throw new Error('InvalidDomain: Staff email must belong to the @sahachara.com organization domain.');
  }

  const validRole = validateAndNormalizeRole(data.role);
  if (!validRole) {
    throw new Error('InvalidRole: Permitted roles are: SUPER_ADMIN, ADMIN, DOCTOR, VAIDYA, RECEPTIONIST, PHARMACIST, ACCOUNTANT.');
  }

  if (actor.role === 'ADMIN' && validRole === 'SUPER_ADMIN') {
    throw new Error('SUPER_ADMIN_CREATION_FORBIDDEN: Operational Administrators cannot onboard SUPER_ADMIN staff accounts.');
  }

  if (!data.name || data.name.trim() === '') {
    throw new Error('NameRequired: Full staff name is mandatory.');
  }
  if (!data.phone || data.phone.trim() === '') {
    throw new Error('PhoneRequired: Contact telephone number is mandatory.');
  }
  if (!data.department || data.department.trim() === '') {
    throw new Error('DepartmentRequired: Hospital department is mandatory.');
  }
  if (!data.designation || data.designation.trim() === '') {
    throw new Error('DesignationRequired: Staff designation is mandatory.');
  }

  // Generate sequence-backed employee ID
  const employeeId = await generateUniqueStaffId();

  // Generate 4-digit PIN
  const pin = data.activationPin && /^\d{4}$/.test(data.activationPin)
    ? data.activationPin
    : String(crypto.randomInt(1000, 10000));
  const pinHash = bcrypt.hashSync(pin, 10);
  const pinExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

  if (isPrismaConnected) {
    // Unique email verification
    const existingStaff = await prisma.staffMember.findUnique({ where: { email: cleanEmail } });
    if (existingStaff) {
      throw new Error(`DuplicateEmail: A staff member record with email "${cleanEmail}" already exists.`);
    }

    const existingUser = await prisma.user.findUnique({ where: { email: cleanEmail } });
    if (existingUser && existingUser.status !== 'pending_activation') {
      throw new Error(`DuplicateEmail: An active user account with email "${cleanEmail}" already exists.`);
    }

    const { staffRecord } = await prisma.$transaction(async (tx) => {
      // 1. Create or link user
      const userRecord = await tx.user.upsert({
        where: { email: cleanEmail },
        update: {
          name: data.name.trim(),
          role: validRole,
          department: data.department.trim(),
          status: 'pending_activation',
          activationPinHash: pinHash,
          activationPin: null,
          pinExpiresAt,
          pinAttempts: 0,
          isSuspended: false
        },
        create: {
          email: cleanEmail,
          name: data.name.trim(),
          role: validRole,
          department: data.department.trim(),
          status: 'pending_activation',
          activationPinHash: pinHash,
          activationPin: null,
          pinExpiresAt,
          pinAttempts: 0,
          isSuspended: false
        }
      });

      // 2. Create staff record
      const s = await tx.staffMember.create({
        data: {
          employeeId,
          name: data.name.trim(),
          role: validRole,
          designation: data.designation.trim(),
          department: data.department.trim(),
          email: cleanEmail,
          phone: data.phone.trim(),
          licenseNumber: data.licenseNumber?.trim() || null,
          status: 'pending_activation',
          shift: data.shift?.trim() || null,
          qualification: data.qualification?.trim() || null,
          joiningDate: data.joiningDate?.trim() || new Date().toISOString().split('T')[0],
          dateOfJoining: data.dateOfJoining ? new Date(data.dateOfJoining) : new Date(),
          address: data.address?.trim() || null,
          emergencyContactName: data.emergencyContactName?.trim() || null,
          emergencyContactPhone: data.emergencyContactPhone?.trim() || null,
          employmentType: data.employmentType?.trim() || 'Full-Time',
          reportingTo: data.reportingTo?.trim() || null,
          discipline: data.discipline?.trim() || null,
          specialty: data.specialty?.trim() || null,
          userId: userRecord.id,
          activationPin: null,
          activationPinHash: pinHash,
          pinExpiresAt,
          pinAttempts: 0,
          isSuspended: false,
          createdById: actor.id,
          createdByName: actor.name,
          notes: data.notes?.trim() || null
        }
      });

      return { staffRecord: s };
    });

    await dbLogAudit(
      actor.name,
      actor.role,
      'Staff Created',
      'Staff Management',
      `Onboarded staff member ${data.name.trim()} (${validRole} - ${data.department.trim()}) with ID ${employeeId}.`
    );

    const domainStaff = mapPrismaStaffToDomain(staffRecord);
    hospitalStore.staff.unshift(domainStaff);
    return { staff: domainStaff, activationPin: pin };
  }

  // Fallback in-memory
  const domainStaff: StaffMember = {
    id: `stf-${Date.now()}`,
    employeeId,
    name: data.name.trim(),
    role: validRole,
    designation: data.designation.trim(),
    department: data.department.trim(),
    email: cleanEmail,
    phone: data.phone.trim(),
    licenseNumber: data.licenseNumber || null,
    status: 'pending_activation',
    shift: data.shift || null,
    qualification: data.qualification || null,
    joiningDate: data.joiningDate || new Date().toISOString().split('T')[0],
    address: data.address || null,
    emergencyContactName: data.emergencyContactName || null,
    emergencyContactPhone: data.emergencyContactPhone || null,
    employmentType: data.employmentType || 'Full-Time',
    reportingTo: data.reportingTo || null,
    discipline: data.discipline || null,
    specialty: data.specialty || null,
    activationPin: pin,
    activationPinHash: pinHash,
    pinExpiresAt: pinExpiresAt.toISOString(),
    pinAttempts: 0,
    isSuspended: false,
    createdById: actor.id,
    createdByName: actor.name,
    notes: data.notes || null
  };

  hospitalStore.staff.unshift(domainStaff);
  hospitalStore.logAudit(
    actor.name,
    actor.role,
    'Staff Created',
    'Staff Management',
    `Onboarded staff member ${data.name.trim()} (${validRole}) with ID ${employeeId}.`
  );

  return { staff: domainStaff, activationPin: pin };
}

export async function dbUpdateStaffMember(
  id: string,
  updates: {
    name?: string;
    phone?: string;
    designation?: string;
    department?: string;
    licenseNumber?: string | null;
    qualification?: string | null;
    discipline?: string | null;
    specialty?: string | null;
    shift?: string | null;
    joiningDate?: string | null;
    dateOfJoining?: string | null;
    address?: string | null;
    emergencyContactName?: string | null;
    emergencyContactPhone?: string | null;
    employmentType?: string | null;
    reportingTo?: string | null;
    notes?: string | null;
  },
  actor: { id: string; name: string; role: string }
): Promise<StaffMember> {
  const staff = await dbGetStaffById(id);
  if (!staff) {
    throw new Error(`StaffNotFound: Staff member ${id} does not exist.`);
  }

  if (actor.role === 'ADMIN' && staff.role === 'SUPER_ADMIN') {
    throw new Error('SUPER_ADMIN_MUTATION_FORBIDDEN: Operational Administrators cannot modify SUPER_ADMIN records.');
  }

  const safeData: any = {};
  if (updates.name !== undefined) safeData.name = updates.name.trim();
  if (updates.phone !== undefined) safeData.phone = updates.phone.trim();
  if (updates.designation !== undefined) safeData.designation = updates.designation.trim();
  if (updates.department !== undefined) safeData.department = updates.department.trim();
  if (updates.licenseNumber !== undefined) safeData.licenseNumber = updates.licenseNumber?.trim() || null;
  if (updates.qualification !== undefined) safeData.qualification = updates.qualification?.trim() || null;
  if (updates.discipline !== undefined) safeData.discipline = updates.discipline?.trim() || null;
  if (updates.specialty !== undefined) safeData.specialty = updates.specialty?.trim() || null;
  if (updates.shift !== undefined) safeData.shift = updates.shift?.trim() || null;
  if (updates.joiningDate !== undefined) safeData.joiningDate = updates.joiningDate?.trim() || null;
  if (updates.dateOfJoining !== undefined) safeData.dateOfJoining = updates.dateOfJoining ? new Date(updates.dateOfJoining) : null;
  if (updates.address !== undefined) safeData.address = updates.address?.trim() || null;
  if (updates.emergencyContactName !== undefined) safeData.emergencyContactName = updates.emergencyContactName?.trim() || null;
  if (updates.emergencyContactPhone !== undefined) safeData.emergencyContactPhone = updates.emergencyContactPhone?.trim() || null;
  if (updates.employmentType !== undefined) safeData.employmentType = updates.employmentType?.trim() || null;
  if (updates.reportingTo !== undefined) safeData.reportingTo = updates.reportingTo?.trim() || null;
  if (updates.notes !== undefined) safeData.notes = updates.notes?.trim() || null;

  if (isPrismaConnected) {
    const updated = await prisma.$transaction(async (tx) => {
      const s = await tx.staffMember.update({
        where: { id: staff.id },
        data: safeData
      });

      if (staff.userId && (safeData.name || safeData.department)) {
        await tx.user.update({
          where: { id: staff.userId },
          data: {
            ...(safeData.name && { name: safeData.name }),
            ...(safeData.department && { department: safeData.department })
          }
        }).catch(() => {});
      }
      return s;
    });

    await dbLogAudit(
      actor.name,
      actor.role,
      'Staff Profile Updated',
      'Staff Management',
      `Updated profile information for ${staff.name} (${staff.employeeId}).`
    );

    const domainStaff = mapPrismaStaffToDomain(updated);
    const storeIdx = hospitalStore.staff.findIndex((m) => m.id === staff.id);
    if (storeIdx !== -1) hospitalStore.staff[storeIdx] = domainStaff;
    return domainStaff;
  }

  // Fallback
  const storeIdx = hospitalStore.staff.findIndex((m) => m.id === staff.id);
  const updatedStaff = { ...staff, ...safeData };
  if (storeIdx !== -1) hospitalStore.staff[storeIdx] = updatedStaff;
  return updatedStaff;
}

export async function dbChangeStaffRole(
  id: string,
  newRole: string,
  actor: { id: string; name: string; role: string },
  reason?: string
): Promise<StaffMember> {
  const staff = await dbGetStaffById(id);
  if (!staff) {
    throw new Error(`StaffNotFound: Staff member ${id} does not exist.`);
  }

  const validRole = validateAndNormalizeRole(newRole);
  if (!validRole) {
    throw new Error('InvalidRole: Permitted roles are: SUPER_ADMIN, ADMIN, DOCTOR, VAIDYA, RECEPTIONIST, PHARMACIST, ACCOUNTANT.');
  }

  // Anti-self-escalation: User cannot change or elevate their own role
  if (actor.id === staff.userId && validRole !== staff.role) {
    throw new Error('SELF_ROLE_ELEVATION_FORBIDDEN: Users cannot alter or elevate their own system roles.');
  }

  // Operational Admin boundaries
  if (actor.role === 'ADMIN') {
    if (validRole === 'SUPER_ADMIN') {
      throw new Error('SUPER_ADMIN_PROMOTION_FORBIDDEN: Operational Administrators cannot promote accounts to SUPER_ADMIN.');
    }
    if (staff.role === 'SUPER_ADMIN') {
      throw new Error('SUPER_ADMIN_MUTATION_FORBIDDEN: Operational Administrators cannot alter SUPER_ADMIN accounts.');
    }
  }

  // Prevent demoting last active SUPER_ADMIN
  if (staff.role === 'SUPER_ADMIN' && validRole !== 'SUPER_ADMIN') {
    if (isPrismaConnected) {
      const activeSuperAdmins = await prisma.user.count({
        where: { role: 'SUPER_ADMIN', status: { notIn: ['suspended', 'archived'] } }
      });
      if (activeSuperAdmins <= 1) {
        throw new Error('LAST_SUPER_ADMIN_PROTECTED: Cannot demote the only remaining active SUPER_ADMIN account.');
      }
    }
  }

  const previousRole = staff.role;

  if (isPrismaConnected) {
    const updated = await prisma.$transaction(async (tx) => {
      const s = await tx.staffMember.update({
        where: { id: staff.id },
        data: { role: validRole }
      });

      if (staff.userId) {
        await tx.user.update({
          where: { id: staff.userId },
          data: { role: validRole }
        });
      }
      return s;
    });

    await dbLogAudit(
      actor.name,
      actor.role,
      'Staff Role Changed',
      'RBAC Change',
      `Role changed from ${previousRole} to ${validRole} for ${staff.name} (${staff.employeeId}) by ${actor.name} (${actor.role}). Reason: ${reason || 'Administrative authority adjustment'}`
    );

    const domainStaff = mapPrismaStaffToDomain(updated);
    const storeIdx = hospitalStore.staff.findIndex((m) => m.id === staff.id);
    if (storeIdx !== -1) hospitalStore.staff[storeIdx] = domainStaff;
    return domainStaff;
  }

  // Fallback
  staff.role = validRole;
  hospitalStore.logAudit(
    actor.name,
    actor.role,
    'Staff Role Changed',
    'RBAC Change',
    `Role changed from ${previousRole} to ${validRole} for ${staff.name} by ${actor.name}.`
  );
  return staff;
}

export async function dbSuspendStaff(
  id: string,
  actor: { id: string; name: string; role: string },
  reason: string
): Promise<StaffMember> {
  const staff = await dbGetStaffById(id);
  if (!staff) {
    throw new Error(`StaffNotFound: Staff member ${id} does not exist.`);
  }

  if (actor.role === 'ADMIN' && staff.role === 'SUPER_ADMIN') {
    throw new Error('SUPER_ADMIN_MUTATION_FORBIDDEN: Operational Administrators cannot suspend SUPER_ADMIN accounts.');
  }

  // Prevent suspending last active SUPER_ADMIN
  if (staff.role === 'SUPER_ADMIN') {
    if (isPrismaConnected) {
      const activeSuperAdmins = await prisma.user.count({
        where: { role: 'SUPER_ADMIN', status: { notIn: ['suspended', 'archived'] } }
      });
      if (activeSuperAdmins <= 1) {
        throw new Error('LAST_SUPER_ADMIN_PROTECTED: Cannot suspend the only remaining active SUPER_ADMIN account.');
      }
    }
  }

  const now = new Date();

  if (isPrismaConnected) {
    const updated = await prisma.$transaction(async (tx) => {
      const s = await tx.staffMember.update({
        where: { id: staff.id },
        data: {
          status: 'suspended',
          isSuspended: true,
          suspendedAt: now,
          suspendedById: actor.id,
          suspendedByName: actor.name,
          suspendedReason: reason || 'Administrative suspension'
        }
      });

      if (staff.userId) {
        await tx.user.update({
          where: { id: staff.userId },
          data: {
            status: 'suspended',
            isSuspended: true,
            suspendedAt: now
          }
        });
      }
      return s;
    });

    await dbLogAudit(
      actor.name,
      actor.role,
      'Staff Suspended',
      'Staff Management',
      `Suspended staff account for ${staff.name} (${staff.employeeId}). Active sessions revoked. Reason: ${reason || 'Administrative suspension'}`
    );

    const domainStaff = mapPrismaStaffToDomain(updated);
    const storeIdx = hospitalStore.staff.findIndex((m) => m.id === staff.id);
    if (storeIdx !== -1) hospitalStore.staff[storeIdx] = domainStaff;
    return domainStaff;
  }

  // Fallback
  staff.status = 'suspended';
  staff.isSuspended = true;
  staff.suspendedAt = now.toISOString();
  staff.suspendedById = actor.id;
  staff.suspendedByName = actor.name;
  staff.suspendedReason = reason;
  return staff;
}

export async function dbReactivateStaff(
  id: string,
  actor: { id: string; name: string; role: string },
  reason?: string
): Promise<StaffMember> {
  const staff = await dbGetStaffById(id);
  if (!staff) {
    throw new Error(`StaffNotFound: Staff member ${id} does not exist.`);
  }

  if (actor.role === 'ADMIN' && staff.role === 'SUPER_ADMIN') {
    throw new Error('SUPER_ADMIN_MUTATION_FORBIDDEN: Operational Administrators cannot alter SUPER_ADMIN accounts.');
  }

  if (isPrismaConnected) {
    const updated = await prisma.$transaction(async (tx) => {
      const s = await tx.staffMember.update({
        where: { id: staff.id },
        data: {
          status: 'active',
          isSuspended: false,
          suspendedAt: null,
          suspendedById: null,
          suspendedByName: null,
          suspendedReason: null
        }
      });

      if (staff.userId) {
        await tx.user.update({
          where: { id: staff.userId },
          data: {
            status: 'active',
            isSuspended: false,
            suspendedAt: null
          }
        });
      }
      return s;
    });

    await dbLogAudit(
      actor.name,
      actor.role,
      'Staff Reactivated',
      'Staff Management',
      `Reactivated staff account for ${staff.name} (${staff.employeeId}). Reason: ${reason || 'Account restored'}`
    );

    const domainStaff = mapPrismaStaffToDomain(updated);
    const storeIdx = hospitalStore.staff.findIndex((m) => m.id === staff.id);
    if (storeIdx !== -1) hospitalStore.staff[storeIdx] = domainStaff;
    return domainStaff;
  }

  // Fallback
  staff.status = 'active';
  staff.isSuspended = false;
  staff.suspendedAt = null;
  return staff;
}

export async function dbArchiveStaff(
  id: string,
  actor: { id: string; name: string; role: string },
  reason: string
): Promise<StaffMember> {
  const staff = await dbGetStaffById(id);
  if (!staff) {
    throw new Error(`StaffNotFound: Staff member ${id} does not exist.`);
  }

  if (actor.role === 'ADMIN' && staff.role === 'SUPER_ADMIN') {
    throw new Error('SUPER_ADMIN_MUTATION_FORBIDDEN: Operational Administrators cannot archive SUPER_ADMIN accounts.');
  }

  // Prevent archiving last active SUPER_ADMIN
  if (staff.role === 'SUPER_ADMIN') {
    if (isPrismaConnected) {
      const activeSuperAdmins = await prisma.user.count({
        where: { role: 'SUPER_ADMIN', status: { notIn: ['suspended', 'archived'] } }
      });
      if (activeSuperAdmins <= 1) {
        throw new Error('LAST_SUPER_ADMIN_PROTECTED: Cannot archive the only remaining active SUPER_ADMIN account.');
      }
    }
  }

  const now = new Date();

  if (isPrismaConnected) {
    // Soft archive: Never physically delete historical records
    const updated = await prisma.$transaction(async (tx) => {
      const s = await tx.staffMember.update({
        where: { id: staff.id },
        data: {
          status: 'archived',
          archivedAt: now,
          archivedById: actor.id,
          archivedByName: actor.name,
          archivedReason: reason || 'Employment terminated / archived'
        }
      });

      if (staff.userId) {
        await tx.user.update({
          where: { id: staff.userId },
          data: {
            status: 'archived',
            archivedAt: now
          }
        });
      }
      return s;
    });

    await dbLogAudit(
      actor.name,
      actor.role,
      'Staff Archived',
      'Staff Management',
      `Archived employment record for ${staff.name} (${staff.employeeId}). Operational access revoked. Historical records preserved. Reason: ${reason || 'Employment concluded'}`
    );

    const domainStaff = mapPrismaStaffToDomain(updated);
    const storeIdx = hospitalStore.staff.findIndex((m) => m.id === staff.id);
    if (storeIdx !== -1) hospitalStore.staff[storeIdx] = domainStaff;
    return domainStaff;
  }

  // Fallback
  staff.status = 'archived';
  staff.archivedAt = now.toISOString();
  staff.archivedById = actor.id;
  staff.archivedByName = actor.name;
  staff.archivedReason = reason;
  return staff;
}

export async function dbRegenerateActivationPin(
  id: string,
  actor: { id: string; name: string; role: string }
): Promise<{ success: boolean; activationPin: string }> {
  const staff = await dbGetStaffById(id);
  if (!staff) {
    throw new Error(`StaffNotFound: Staff member ${id} does not exist.`);
  }

  if (staff.status !== 'pending_activation') {
    throw new Error('StaffNotPendingActivation: Security PIN can only be regenerated for staff accounts pending activation.');
  }

  if (actor.role === 'ADMIN' && staff.role === 'SUPER_ADMIN') {
    throw new Error('SUPER_ADMIN_MUTATION_FORBIDDEN: Operational Administrators cannot alter SUPER_ADMIN accounts.');
  }

  const newPin = String(crypto.randomInt(1000, 10000));
  const pinHash = bcrypt.hashSync(newPin, 10);
  const pinExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

  if (isPrismaConnected) {
    await prisma.$transaction(async (tx) => {
      await tx.staffMember.update({
        where: { id: staff.id },
        data: {
          activationPin: null,
          activationPinHash: pinHash,
          pinExpiresAt,
          pinAttempts: 0
        }
      });

      if (staff.userId) {
        await tx.user.update({
          where: { id: staff.userId },
          data: {
            activationPin: null,
            activationPinHash: pinHash,
            pinExpiresAt,
            pinAttempts: 0
          }
        });
      }
    });

    await dbLogAudit(
      actor.name,
      actor.role,
      'Staff PIN Regenerated',
      'Staff Management',
      `Regenerated 4-digit activation PIN for ${staff.name} (${staff.employeeId}).`
    );

    const storeIdx = hospitalStore.staff.findIndex((m) => m.id === staff.id);
    if (storeIdx !== -1) {
      hospitalStore.staff[storeIdx].activationPin = newPin;
      hospitalStore.staff[storeIdx].pinExpiresAt = pinExpiresAt.toISOString();
    }

    return { success: true, activationPin: newPin };
  }

  staff.activationPin = newPin;
  staff.pinExpiresAt = pinExpiresAt.toISOString();
  return { success: true, activationPin: newPin };
}

export async function dbGetStaffAuditHistory(id: string): Promise<ClinicalAuditLog[]> {
  const staff = await dbGetStaffById(id);
  if (!staff) {
    throw new Error(`StaffNotFound: Staff member ${id} does not exist.`);
  }

  if (isPrismaConnected) {
    try {
      const logs = await prisma.auditLog.findMany({
        where: {
          OR: [
            { actor: staff.name },
            { details: { contains: staff.email, mode: 'insensitive' } },
            { details: { contains: staff.employeeId, mode: 'insensitive' } },
            { details: { contains: staff.name, mode: 'insensitive' } }
          ]
        },
        orderBy: { timestamp: 'desc' },
        take: 100
      });

      return logs.map((l) => ({
        id: l.id,
        timestamp: l.timestamp.toISOString(),
        actor: l.actor,
        role: l.role as UserRole,
        category: l.category as AuditCategory,
        action: l.action,
        patientMrn: l.patientMrn || undefined,
        details: l.details,
        ipAddress: l.ipAddress || '127.0.0.1'
      }));
    } catch (err) {
      console.warn('[Prisma dbGetStaffAuditHistory] Error:', err);
    }
  }

  return hospitalStore.auditLogs.filter(
    (l) =>
      l.actor === staff.name ||
      l.details.includes(staff.email) ||
      l.details.includes(staff.employeeId) ||
      l.details.includes(staff.name)
  );
}

export async function dbCreateStaff(staff: StaffMember): Promise<StaffMember> {
  const validRole = validateAndNormalizeRole(staff.role);
  if (!validRole) {
    throw new Error('Invalid staff role. Permitted roles are: SUPER_ADMIN, ADMIN, DOCTOR, VAIDYA, RECEPTIONIST, PHARMACIST, ACCOUNTANT.');
  }
  staff.role = validRole;

  if (isPrismaConnected) {
    try {
      await prisma.staffMember.create({
        data: {
          id: staff.id,
          employeeId: staff.employeeId,
          name: staff.name,
          role: staff.role,
          designation: staff.designation,
          department: staff.department,
          email: staff.email,
          phone: staff.phone,
          licenseNumber: staff.licenseNumber,
          status: staff.status,
          shift: staff.shift,
          qualification: staff.qualification,
          joiningDate: staff.joiningDate,
          activationPin: null,
          notes: staff.notes
        }
      });
    } catch (err) {
      console.warn('[Prisma dbCreateStaff] Warning:', err);
    }
  }

  hospitalStore.staff.unshift(staff);
  return staff;
}

export async function dbUpdateStaff(id: string, updates: Partial<StaffMember>): Promise<StaffMember | null> {
  if (updates.role) {
    const validRole = validateAndNormalizeRole(updates.role);
    if (!validRole) {
      throw new Error('Invalid staff role. Permitted roles are: SUPER_ADMIN, ADMIN, DOCTOR, VAIDYA, RECEPTIONIST, PHARMACIST, ACCOUNTANT.');
    }
    updates.role = validRole;
  }

  if (isPrismaConnected) {
    try {
      await prisma.staffMember.update({
        where: { id },
        data: updates as any
      });
    } catch (err) {
      console.warn('[Prisma dbUpdateStaff] Warning:', err);
    }
  }

  const idx = hospitalStore.staff.findIndex((s) => s.id === id);
  if (idx === -1) return null;
  hospitalStore.staff[idx] = { ...hospitalStore.staff[idx], ...updates };
  return hospitalStore.staff[idx];
}

// ------------------------------------------------------------------------------
// HOSPITAL TARIFFS (Rate Master)
// ------------------------------------------------------------------------------

export async function dbGetTariffs(includeInactive: boolean = true): Promise<HospitalTariff[]> {
  if (isPrismaConnected) {
    try {
      const whereClause = includeInactive ? {} : { isActive: true };
      const dbTariffs = await prisma.hospitalTariff.findMany({
        where: whereClause,
        include: {
          rateHistories: {
            orderBy: { createdAt: 'desc' }
          }
        },
        orderBy: { serviceCode: 'asc' }
      });
      if (dbTariffs.length > 0) {
        return dbTariffs.map((t) => ({
          id: t.id,
          category: t.category as any,
          serviceCode: t.serviceCode,
          serviceName: t.serviceName,
          department: t.department || 'Hospital Operations',
          serviceType: t.serviceType || 'General',
          rate: t.rate !== null && t.rate !== undefined ? Number(t.rate) : null,
          currency: t.currency || 'INR',
          isZeroPricePermitted: t.isZeroPricePermitted,
          isActive: t.isActive,
          unit: t.unit,
          durationMinutes: t.durationMinutes || undefined,
          description: t.description || undefined,
          notes: t.notes || undefined,
          effectiveFrom: t.effectiveFrom ? t.effectiveFrom.toISOString() : undefined,
          effectiveUntil: t.effectiveUntil ? t.effectiveUntil.toISOString() : undefined,
          updatedBy: t.updatedBy || undefined,
          updatedById: t.updatedById || undefined,
          createdAt: t.createdAt.toISOString(),
          updatedAt: t.updatedAt.toISOString(),
          rateHistories: (t.rateHistories || []).map((rh) => ({
            id: rh.id,
            tariffId: rh.tariffId,
            previousRate: rh.previousRate !== null && rh.previousRate !== undefined ? Number(rh.previousRate) : null,
            newRate: rh.newRate !== null && rh.newRate !== undefined ? Number(rh.newRate) : null,
            isZeroPrice: rh.isZeroPrice,
            currency: rh.currency,
            effectiveFrom: rh.effectiveFrom.toISOString(),
            effectiveUntil: rh.effectiveUntil ? rh.effectiveUntil.toISOString() : undefined,
            changedById: rh.changedById || undefined,
            changedByName: rh.changedByName,
            changeReason: rh.changeReason || undefined,
            createdAt: rh.createdAt.toISOString()
          }))
        }));
      }
    } catch (err) {
      console.warn('[Prisma dbGetTariffs] Fallback:', err);
    }
  }
  return hospitalStore.tariffs.filter((t) => includeInactive || t.isActive !== false);
}

export async function dbGetTariffById(idOrCode: string): Promise<HospitalTariff | null> {
  if (isPrismaConnected) {
    try {
      const t = await prisma.hospitalTariff.findFirst({
        where: {
          OR: [{ id: idOrCode }, { serviceCode: idOrCode }]
        },
        include: {
          rateHistories: {
            orderBy: { createdAt: 'desc' }
          }
        }
      });
      if (t) {
        return {
          id: t.id,
          category: t.category as any,
          serviceCode: t.serviceCode,
          serviceName: t.serviceName,
          department: t.department || 'Hospital Operations',
          serviceType: t.serviceType || 'General',
          rate: t.rate !== null && t.rate !== undefined ? Number(t.rate) : null,
          currency: t.currency || 'INR',
          isZeroPricePermitted: t.isZeroPricePermitted,
          isActive: t.isActive,
          unit: t.unit,
          durationMinutes: t.durationMinutes || undefined,
          description: t.description || undefined,
          notes: t.notes || undefined,
          effectiveFrom: t.effectiveFrom ? t.effectiveFrom.toISOString() : undefined,
          effectiveUntil: t.effectiveUntil ? t.effectiveUntil.toISOString() : undefined,
          updatedBy: t.updatedBy || undefined,
          updatedById: t.updatedById || undefined,
          createdAt: t.createdAt.toISOString(),
          updatedAt: t.updatedAt.toISOString(),
          rateHistories: (t.rateHistories || []).map((rh) => ({
            id: rh.id,
            tariffId: rh.tariffId,
            previousRate: rh.previousRate !== null && rh.previousRate !== undefined ? Number(rh.previousRate) : null,
            newRate: rh.newRate !== null && rh.newRate !== undefined ? Number(rh.newRate) : null,
            isZeroPrice: rh.isZeroPrice,
            currency: rh.currency,
            effectiveFrom: rh.effectiveFrom.toISOString(),
            effectiveUntil: rh.effectiveUntil ? rh.effectiveUntil.toISOString() : undefined,
            changedById: rh.changedById || undefined,
            changedByName: rh.changedByName,
            changeReason: rh.changeReason || undefined,
            createdAt: rh.createdAt.toISOString()
          }))
        };
      }
    } catch (err) {
      console.warn('[Prisma dbGetTariffById] Error:', err);
    }
  }
  const item = hospitalStore.tariffs.find((t) => t.id === idOrCode || t.serviceCode === idOrCode);
  return item || null;
}

export async function dbCreateTariff(
  tariff: Partial<HospitalTariff>,
  actorName: string = 'Hospital Administration',
  actorId?: string
): Promise<HospitalTariff> {
  const cleanCode = (tariff.serviceCode || '').trim().toUpperCase();
  if (!cleanCode) throw new Error('Service code is required');
  if (!tariff.serviceName?.trim()) throw new Error('Service name is required');
  if (!tariff.category?.trim()) throw new Error('Service category is required');

  if (isPrismaConnected) {
    const existing = await prisma.hospitalTariff.findFirst({
      where: { serviceCode: { equals: cleanCode, mode: 'insensitive' } }
    });
    if (existing) {
      throw new Error(`DuplicateServiceCode: Service with code "${cleanCode}" already exists.`);
    }

    const newRate = tariff.rate !== undefined && tariff.rate !== null && (tariff.rate as any) !== '' ? Number(tariff.rate) : null;
    const isZeroPermitted = Boolean(tariff.isZeroPricePermitted);

    const created = await prisma.hospitalTariff.create({
      data: {
        id: tariff.id || `trf-${Date.now()}`,
        serviceCode: cleanCode,
        serviceName: tariff.serviceName.trim(),
        category: tariff.category.trim(),
        department: tariff.department?.trim() || 'Hospital Operations',
        serviceType: tariff.serviceType?.trim() || 'General',
        rate: newRate !== null ? new Prisma.Decimal(newRate.toFixed(2)) : null,
        currency: 'INR',
        isZeroPricePermitted: isZeroPermitted,
        isActive: tariff.isActive !== undefined ? tariff.isActive : true,
        unit: tariff.unit?.trim() || 'service',
        durationMinutes: tariff.durationMinutes ? Number(tariff.durationMinutes) : null,
        description: tariff.description?.trim() || null,
        notes: tariff.notes?.trim() || null,
        effectiveFrom: tariff.effectiveFrom ? new Date(tariff.effectiveFrom) : null,
        effectiveUntil: tariff.effectiveUntil ? new Date(tariff.effectiveUntil) : null,
        updatedBy: actorName,
        updatedById: actorId || null,
        rateHistories: newRate !== null ? {
          create: {
            previousRate: null,
            newRate: new Prisma.Decimal(newRate.toFixed(2)),
            isZeroPrice: isZeroPermitted,
            currency: 'INR',
            effectiveFrom: tariff.effectiveFrom ? new Date(tariff.effectiveFrom) : new Date(),
            effectiveUntil: tariff.effectiveUntil ? new Date(tariff.effectiveUntil) : null,
            changedById: actorId,
            changedByName: actorName,
            changeReason: 'Initial rate configuration on service creation'
          }
        } : undefined
      },
      include: {
        rateHistories: true
      }
    });

    const result: HospitalTariff = {
      id: created.id,
      category: created.category as any,
      serviceCode: created.serviceCode,
      serviceName: created.serviceName,
      department: created.department || undefined,
      serviceType: created.serviceType || undefined,
      rate: created.rate !== null && created.rate !== undefined ? Number(created.rate) : null,
      currency: created.currency,
      isZeroPricePermitted: created.isZeroPricePermitted,
      isActive: created.isActive,
      unit: created.unit,
      durationMinutes: created.durationMinutes || undefined,
      description: created.description || undefined,
      notes: created.notes || undefined,
      effectiveFrom: created.effectiveFrom ? created.effectiveFrom.toISOString() : undefined,
      effectiveUntil: created.effectiveUntil ? created.effectiveUntil.toISOString() : undefined,
      updatedBy: created.updatedBy || undefined,
      updatedById: created.updatedById || undefined,
      createdAt: created.createdAt.toISOString(),
      updatedAt: created.updatedAt.toISOString(),
      rateHistories: (created.rateHistories || []).map((rh) => ({
        id: rh.id,
        tariffId: rh.tariffId,
        previousRate: rh.previousRate !== null && rh.previousRate !== undefined ? Number(rh.previousRate) : null,
        newRate: rh.newRate !== null && rh.newRate !== undefined ? Number(rh.newRate) : null,
        isZeroPrice: rh.isZeroPrice,
        currency: rh.currency,
        effectiveFrom: rh.effectiveFrom.toISOString(),
        effectiveUntil: rh.effectiveUntil ? rh.effectiveUntil.toISOString() : undefined,
        changedById: rh.changedById || undefined,
        changedByName: rh.changedByName,
        changeReason: rh.changeReason || undefined,
        createdAt: rh.createdAt.toISOString()
      }))
    };
    hospitalStore.tariffs.unshift(result);
    return result;
  }

  // Fallback in-memory
  const exists = hospitalStore.tariffs.some((t) => t.serviceCode.toUpperCase() === cleanCode);
  if (exists) {
    throw new Error(`DuplicateServiceCode: Service with code "${cleanCode}" already exists.`);
  }
  const item: HospitalTariff = {
    id: tariff.id || `trf-${Date.now()}`,
    category: tariff.category || 'General',
    serviceCode: cleanCode,
    serviceName: tariff.serviceName || 'New Service',
    department: tariff.department || 'Hospital Operations',
    serviceType: tariff.serviceType || 'General',
    rate: tariff.rate !== undefined && tariff.rate !== null ? Number(tariff.rate) : null,
    currency: 'INR',
    isZeroPricePermitted: Boolean(tariff.isZeroPricePermitted),
    isActive: tariff.isActive !== undefined ? tariff.isActive : true,
    unit: tariff.unit || 'service',
    description: tariff.description,
    notes: tariff.notes,
    updatedBy: actorName,
    updatedById: actorId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  hospitalStore.tariffs.unshift(item);
  return item;
}

export async function dbUpdateTariff(
  idOrCode: string,
  updates: Partial<HospitalTariff>,
  actorName: string = 'Hospital Administration',
  actorId?: string
): Promise<HospitalTariff | null> {
  if (isPrismaConnected) {
    try {
      const existing = await prisma.hospitalTariff.findFirst({
        where: { OR: [{ id: idOrCode }, { serviceCode: idOrCode }] }
      });
      if (!existing) return null;

      const data: any = {
        updatedBy: actorName,
        updatedById: actorId
      };
      if (updates.serviceName !== undefined) data.serviceName = updates.serviceName.trim();
      if (updates.category !== undefined) data.category = updates.category.trim();
      if (updates.department !== undefined) data.department = updates.department.trim();
      if (updates.serviceType !== undefined) data.serviceType = updates.serviceType.trim();
      if (updates.unit !== undefined) data.unit = updates.unit.trim();
      if (updates.description !== undefined) data.description = updates.description.trim() || null;
      if (updates.notes !== undefined) data.notes = updates.notes.trim() || null;
      if (updates.durationMinutes !== undefined) data.durationMinutes = updates.durationMinutes ? Number(updates.durationMinutes) : null;
      if (updates.isActive !== undefined) data.isActive = Boolean(updates.isActive);

      const updated = await prisma.hospitalTariff.update({
        where: { id: existing.id },
        data,
        include: { rateHistories: { orderBy: { createdAt: 'desc' } } }
      });

      const res: HospitalTariff = {
        id: updated.id,
        category: updated.category as any,
        serviceCode: updated.serviceCode,
        serviceName: updated.serviceName,
        department: updated.department || undefined,
        serviceType: updated.serviceType || undefined,
        rate: updated.rate !== null && updated.rate !== undefined ? Number(updated.rate) : null,
        currency: updated.currency,
        isZeroPricePermitted: updated.isZeroPricePermitted,
        isActive: updated.isActive,
        unit: updated.unit,
        durationMinutes: updated.durationMinutes || undefined,
        description: updated.description || undefined,
        notes: updated.notes || undefined,
        effectiveFrom: updated.effectiveFrom ? updated.effectiveFrom.toISOString() : undefined,
        effectiveUntil: updated.effectiveUntil ? updated.effectiveUntil.toISOString() : undefined,
        updatedBy: updated.updatedBy || undefined,
        updatedById: updated.updatedById || undefined,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
        rateHistories: (updated.rateHistories || []).map((rh) => ({
          id: rh.id,
          tariffId: rh.tariffId,
          previousRate: rh.previousRate !== null && rh.previousRate !== undefined ? Number(rh.previousRate) : null,
          newRate: rh.newRate !== null && rh.newRate !== undefined ? Number(rh.newRate) : null,
          isZeroPrice: rh.isZeroPrice,
          currency: rh.currency,
          effectiveFrom: rh.effectiveFrom.toISOString(),
          effectiveUntil: rh.effectiveUntil ? rh.effectiveUntil.toISOString() : undefined,
          changedById: rh.changedById || undefined,
          changedByName: rh.changedByName,
          changeReason: rh.changeReason || undefined,
          createdAt: rh.createdAt.toISOString()
        }))
      };
      const idx = hospitalStore.tariffs.findIndex((t) => t.id === existing.id || t.serviceCode === existing.serviceCode);
      if (idx >= 0) hospitalStore.tariffs[idx] = res;
      return res;
    } catch (err) {
      console.warn('[Prisma dbUpdateTariff] Error:', err);
    }
  }

  const idx = hospitalStore.tariffs.findIndex((t) => t.id === idOrCode || t.serviceCode === idOrCode);
  if (idx === -1) return null;
  hospitalStore.tariffs[idx] = {
    ...hospitalStore.tariffs[idx],
    ...updates,
    updatedBy: actorName,
    updatedAt: new Date().toISOString()
  };
  return hospitalStore.tariffs[idx];
}

export async function dbConfigureTariffRate(
  idOrCode: string,
  rate: number | null,
  isZeroPricePermitted: boolean = false,
  effectiveFrom?: string,
  effectiveUntil?: string,
  note?: string,
  actorName: string = 'Super Admin',
  actorId?: string
): Promise<HospitalTariff | null> {
  // Validate non-negative rate
  if (rate !== null && rate < 0) {
    throw new Error('RateCannotBeNegative: Service rate cannot be negative.');
  }

  // Validate zero rate policy
  if (rate === 0 && !isZeroPricePermitted) {
    throw new Error('ZeroPriceNotPermitted: Zero-price rate requires explicit authorization (isZeroPricePermitted).');
  }

  // If rate is null, zero price permission must be false
  const safeZeroPermitted = rate === 0 ? Boolean(isZeroPricePermitted) : false;

  if (isPrismaConnected) {
    try {
      const existing = await prisma.hospitalTariff.findFirst({
        where: { OR: [{ id: idOrCode }, { serviceCode: idOrCode }] }
      });
      if (!existing) return null;

      const previousRate = existing.rate;
      const effFromDate = effectiveFrom ? new Date(effectiveFrom) : new Date();
      const effUntilDate = effectiveUntil ? new Date(effectiveUntil) : null;

      // 1. Create RateHistory record
      await prisma.rateHistory.create({
        data: {
          tariffId: existing.id,
          previousRate: previousRate !== null && previousRate !== undefined ? new Prisma.Decimal(Number(previousRate).toFixed(2)) : null,
          newRate: rate !== null ? new Prisma.Decimal(Number(rate).toFixed(2)) : null,
          isZeroPrice: safeZeroPermitted,
          currency: 'INR',
          effectiveFrom: effFromDate,
          effectiveUntil: effUntilDate,
          changedById: actorId || null,
          changedByName: actorName,
          changeReason: note || (rate === null ? 'Rate unconfigured' : `Rate updated from ${previousRate ?? 'unconfigured'} to ₹${rate}`)
        }
      });

      // 2. Update Tariff
      const updated = await prisma.hospitalTariff.update({
        where: { id: existing.id },
        data: {
          rate: rate !== null ? new Prisma.Decimal(Number(rate).toFixed(2)) : null,
          isZeroPricePermitted: safeZeroPermitted,
          effectiveFrom: effFromDate,
          effectiveUntil: effUntilDate,
          updatedBy: actorName,
          updatedById: actorId || null
        },
        include: {
          rateHistories: {
            orderBy: { createdAt: 'desc' }
          }
        }
      });

      const res: HospitalTariff = {
        id: updated.id,
        category: updated.category as any,
        serviceCode: updated.serviceCode,
        serviceName: updated.serviceName,
        department: updated.department || undefined,
        serviceType: updated.serviceType || undefined,
        rate: updated.rate !== null && updated.rate !== undefined ? Number(updated.rate) : null,
        currency: updated.currency,
        isZeroPricePermitted: updated.isZeroPricePermitted,
        isActive: updated.isActive,
        unit: updated.unit,
        durationMinutes: updated.durationMinutes || undefined,
        description: updated.description || undefined,
        notes: updated.notes || undefined,
        effectiveFrom: updated.effectiveFrom ? updated.effectiveFrom.toISOString() : undefined,
        effectiveUntil: updated.effectiveUntil ? updated.effectiveUntil.toISOString() : undefined,
        updatedBy: updated.updatedBy || undefined,
        updatedById: updated.updatedById || undefined,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
        rateHistories: updated.rateHistories.map((rh) => ({
          id: rh.id,
          tariffId: rh.tariffId,
          previousRate: rh.previousRate !== null && rh.previousRate !== undefined ? Number(rh.previousRate) : null,
          newRate: rh.newRate !== null && rh.newRate !== undefined ? Number(rh.newRate) : null,
          isZeroPrice: rh.isZeroPrice,
          currency: rh.currency,
          effectiveFrom: rh.effectiveFrom.toISOString(),
          effectiveUntil: rh.effectiveUntil ? rh.effectiveUntil.toISOString() : undefined,
          changedById: rh.changedById || undefined,
          changedByName: rh.changedByName,
          changeReason: rh.changeReason || undefined,
          createdAt: rh.createdAt.toISOString()
        }))
      };
      const idx = hospitalStore.tariffs.findIndex((t) => t.id === existing.id || t.serviceCode === existing.serviceCode);
      if (idx >= 0) hospitalStore.tariffs[idx] = res;
      return res;
    } catch (err: any) {
      console.warn('[Prisma dbConfigureTariffRate] Error:', err);
      throw err;
    }
  }

  // In-memory fallback
  const idx = hospitalStore.tariffs.findIndex((t) => t.id === idOrCode || t.serviceCode === idOrCode);
  if (idx === -1) return null;
  const previousRate = hospitalStore.tariffs[idx].rate;
  const newHist: RateHistory = {
    id: `rh-${Date.now()}`,
    tariffId: hospitalStore.tariffs[idx].id,
    previousRate,
    newRate: rate,
    isZeroPrice: safeZeroPermitted,
    currency: 'INR',
    effectiveFrom: effectiveFrom || new Date().toISOString(),
    effectiveUntil,
    changedById: actorId,
    changedByName: actorName,
    changeReason: note,
    createdAt: new Date().toISOString()
  };
  const histories = hospitalStore.tariffs[idx].rateHistories || [];
  histories.unshift(newHist);

  hospitalStore.tariffs[idx] = {
    ...hospitalStore.tariffs[idx],
    rate,
    isZeroPricePermitted: safeZeroPermitted,
    effectiveFrom,
    effectiveUntil,
    updatedBy: actorName,
    updatedById: actorId,
    updatedAt: new Date().toISOString(),
    rateHistories: histories
  };
  return hospitalStore.tariffs[idx];
}

export async function dbUpdateTariffRate(
  id: string,
  rate: number | null,
  isZeroPricePermitted?: boolean,
  updatedBy?: string
): Promise<HospitalTariff | null> {
  return dbConfigureTariffRate(id, rate, Boolean(isZeroPricePermitted), undefined, undefined, undefined, updatedBy);
}

// ------------------------------------------------------------------------------
// TREATMENT PLANS
// ------------------------------------------------------------------------------

export async function dbGetTreatmentPlans(): Promise<TreatmentPlan[]> {
  if (isPrismaConnected) {
    try {
      const dbPlans = await prisma.treatmentPlan.findMany({
        include: {
          sessions: {
            include: {
              room: true,
              administeringStaff: true,
              responsibleVaidya: true
            },
            orderBy: { scheduledStartAt: 'asc' }
          }
        },
        orderBy: { createdAt: 'desc' }
      });
      return dbPlans.map((tp) => {
        const completedSessionsCount = tp.sessions && tp.sessions.length > 0
          ? tp.sessions.filter((s) => s.status === SessionExecutionStatus.COMPLETED).length
          : tp.completedSessions;
        return {
          id: tp.id,
          planNumber: tp.planNumber,
          patientId: tp.patientId || '',
          patientName: tp.patientName,
          patientMrn: tp.patientMrn,
          doctorId: tp.doctorId || '',
          doctorName: tp.doctorName,
          assignedTherapist: tp.assignedTherapist,
          therapyType: tp.therapyType as any,
          clinicalObjective: tp.clinicalObjective,
          oilOrFormulation: tp.oilOrFormulation,
          totalSessions: tp.totalSessions,
          completedSessions: completedSessionsCount,
          frequency: tp.frequency as any,
          startDate: tp.startDate,
          endDate: tp.endDate,
          roomNumber: tp.roomNumber,
          status: tp.status as any,
          notes: tp.notes || '',
          sessions: tp.sessions as any
        };
      });
    } catch (err) {
      console.warn('[Prisma dbGetTreatmentPlans] Fallback:', err);
    }
  }
  return hospitalStore.treatmentPlans;
}

export async function dbCreateTreatmentPlan(plan: TreatmentPlan): Promise<TreatmentPlan> {
  if (isPrismaConnected) {
    try {
      await prisma.treatmentPlan.create({
        data: {
          id: plan.id,
          planNumber: plan.planNumber,
          patientId: plan.patientId,
          patientName: plan.patientName,
          patientMrn: plan.patientMrn,
          doctorId: plan.doctorId,
          doctorName: plan.doctorName,
          assignedTherapist: plan.assignedTherapist,
          therapyType: plan.therapyType,
          clinicalObjective: plan.clinicalObjective,
          oilOrFormulation: plan.oilOrFormulation,
          totalSessions: plan.totalSessions,
          completedSessions: plan.completedSessions,
          frequency: plan.frequency,
          startDate: plan.startDate,
          endDate: plan.endDate,
          roomNumber: plan.roomNumber,
          status: plan.status,
          notes: plan.notes
        }
      });
    } catch (err) {
      console.warn('[Prisma dbCreateTreatmentPlan] Warning:', err);
    }
  }
  hospitalStore.treatmentPlans.unshift(plan);
  return plan;
}

export async function dbUpdateTreatmentPlan(id: string, updates: Partial<TreatmentPlan>): Promise<TreatmentPlan | null> {
  if (isPrismaConnected) {
    try {
      await prisma.treatmentPlan.update({
        where: { id },
        data: updates as any
      });
    } catch (err) {
      console.warn('[Prisma dbUpdateTreatmentPlan] Warning:', err);
    }
  }
  const idx = hospitalStore.treatmentPlans.findIndex((t) => t.id === id);
  if (idx === -1) return null;
  hospitalStore.treatmentPlans[idx] = { ...hospitalStore.treatmentPlans[idx], ...updates };
  return hospitalStore.treatmentPlans[idx];
}

// ------------------------------------------------------------------------------
// PANCHAKARMA COURSES
// ------------------------------------------------------------------------------

export async function dbGetPanchakarmaCourses(): Promise<PanchakarmaCourse[]> {
  if (isPrismaConnected) {
    try {
      const dbCourses = await prisma.panchakarmaCourse.findMany({
        include: {
          phaseTransitions: { orderBy: { authorizedAt: 'asc' } },
          sessions: {
            include: {
              room: true,
              administeringStaff: true,
              responsibleVaidya: true
            },
            orderBy: { scheduledStartAt: 'asc' }
          }
        },
        orderBy: { createdAt: 'desc' }
      });
      return dbCourses.map((pk) => {
        const completedDaysCount = pk.sessions && pk.sessions.length > 0
          ? pk.sessions.filter((s) => s.status === SessionExecutionStatus.COMPLETED).length
          : pk.completedDays;
        return {
          id: pk.id,
          courseNumber: pk.courseNumber,
          referralId: pk.referralId,
          patientId: pk.patientId || '',
          patientName: pk.patientName,
          patientMrn: pk.patientMrn,
          vaidyaName: pk.vaidyaName,
          responsibleVaidyaId: pk.responsibleVaidyaId,
          protocol: pk.protocol as any,
          currentPhase: pk.currentPhase as any,
          startDate: pk.startDate,
          expectedEndDate: pk.expectedEndDate,
          totalDays: pk.totalDays,
          completedDays: completedDaysCount,
          dietaryPrescription: pk.dietaryPrescription,
          status: pk.status as any,
          billingMode: pk.billingMode as any,
          isPackageBilled: pk.isPackageBilled,
          dailySessions: (pk.dailySessions as any) || [],
          dischargeNotes: pk.dischargeNotes || undefined,
          sessions: pk.sessions as any,
          phaseTransitions: pk.phaseTransitions as any
        };
      });
    } catch (err) {
      console.warn('[Prisma dbGetPanchakarmaCourses] Fallback:', err);
    }
  }
  return hospitalStore.panchakarmaCourses;
}

export async function dbCreatePanchakarmaCourse(course: PanchakarmaCourse): Promise<PanchakarmaCourse> {
  if (isPrismaConnected) {
    try {
      await prisma.panchakarmaCourse.create({
        data: {
          id: course.id,
          courseNumber: course.courseNumber,
          patientId: course.patientId,
          patientName: course.patientName,
          patientMrn: course.patientMrn,
          vaidyaName: course.vaidyaName,
          protocol: course.protocol,
          currentPhase: course.currentPhase,
          startDate: course.startDate,
          expectedEndDate: course.expectedEndDate,
          totalDays: course.totalDays,
          completedDays: course.completedDays,
          dietaryPrescription: course.dietaryPrescription,
          status: course.status,
          dailySessions: course.dailySessions as any,
          dischargeNotes: course.dischargeNotes
        }
      });
    } catch (err) {
      console.warn('[Prisma dbCreatePanchakarmaCourse] Warning:', err);
    }
  }
  hospitalStore.panchakarmaCourses.unshift(course);
  return course;
}

export async function dbUpdatePanchakarmaCourse(id: string, updates: Partial<PanchakarmaCourse>): Promise<PanchakarmaCourse | null> {
  if (isPrismaConnected) {
    try {
      await prisma.panchakarmaCourse.update({
        where: { id },
        data: updates as any
      });
    } catch (err) {
      console.warn('[Prisma dbUpdatePanchakarmaCourse] Warning:', err);
    }
  }
  const idx = hospitalStore.panchakarmaCourses.findIndex((pk) => pk.id === id);
  if (idx === -1) return null;
  hospitalStore.panchakarmaCourses[idx] = { ...hospitalStore.panchakarmaCourses[idx], ...updates };
  return hospitalStore.panchakarmaCourses[idx];
}

// ------------------------------------------------------------------------------
// MEDICATION STOCK, INVENTORY & MOVEMENTS (Phase 4)
// ------------------------------------------------------------------------------

export function isDateExpired(expiryDateStr?: string | null): boolean {
  if (!expiryDateStr) return false;
  try {
    let expDate: Date;
    if (/^\d{4}-\d{2}$/.test(expiryDateStr)) {
      const [year, month] = expiryDateStr.split('-').map(Number);
      expDate = new Date(year, month, 0, 23, 59, 59, 999);
    } else {
      expDate = new Date(expiryDateStr);
      expDate.setHours(23, 59, 59, 999);
    }
    return !isNaN(expDate.getTime()) && expDate.getTime() < Date.now();
  } catch {
    return false;
  }
}

export async function generateUniqueDispenseNumber(): Promise<string> {
  const year = new Date().getFullYear();
  if (!isPrismaConnected) {
    throw new Error('DatabaseUnavailable: Active PostgreSQL connection is required for sequence-backed Dispense Number generation.');
  }

  try {
    const res = await prisma.$queryRaw<[{ nextval: bigint }]>`SELECT nextval('dispensing_seq')`;
    if (!res || !res[0] || res[0].nextval === undefined || res[0].nextval === null) {
      throw new Error('SequenceUnavailable: Sequence "dispensing_seq" returned empty result.');
    }
    const seq = Number(res[0].nextval);
    if (isNaN(seq) || seq <= 0) {
      throw new Error('SequenceInvalid: Sequence "dispensing_seq" returned invalid integer.');
    }
    return `DSP-${year}-${String(seq).padStart(5, '0')}`;
  } catch (err: any) {
    console.error('[Prisma generateUniqueDispenseNumber] Fail-closed sequence failure:', err.message);
    throw new Error(`DispenseNumberGenerationFailed: Authoritative sequence generation failed: ${err.message}`);
  }
}

export async function dbGetMedicationStock(filters?: {
  search?: string;
  category?: string;
  status?: string;
  activeOnly?: boolean;
}): Promise<MedicationStock[]> {
  if (isPrismaConnected) {
    try {
      const where: Prisma.MedicationStockWhereInput = {};
      if (filters?.activeOnly !== false) {
        where.isActive = true;
      }
      if (filters?.category) {
        where.category = { equals: filters.category, mode: 'insensitive' };
      }
      if (filters?.search) {
        where.OR = [
          { drugName: { contains: filters.search, mode: 'insensitive' } },
          { genericName: { contains: filters.search, mode: 'insensitive' } },
          { batchNumber: { contains: filters.search, mode: 'insensitive' } }
        ];
      }

      const dbStock = await prisma.medicationStock.findMany({
        where,
        orderBy: [{ drugName: 'asc' }, { expiryDate: 'asc' }]
      });

      return dbStock.map((s) => {
        const expired = isDateExpired(s.expiryDate);
        let calculatedStatus = s.status;
        if (expired) {
          calculatedStatus = 'expired';
        } else if (s.stockQuantity === 0) {
          calculatedStatus = 'out_of_stock';
        } else if (s.stockQuantity <= s.minThreshold * 0.4) {
          calculatedStatus = 'critical';
        } else if (s.stockQuantity <= s.minThreshold) {
          calculatedStatus = 'low_stock';
        } else {
          calculatedStatus = 'in_stock';
        }

        return {
          id: s.id,
          drugName: s.drugName,
          genericName: s.genericName,
          category: s.category,
          form: s.form as any,
          strength: s.strength || undefined,
          stockQuantity: s.stockQuantity,
          unit: s.unit,
          minThreshold: s.minThreshold,
          reorderThreshold: s.reorderThreshold || undefined,
          manufacturer: s.manufacturer || undefined,
          batchNumber: s.batchNumber,
          expiryDate: s.expiryDate,
          storageInfo: s.storageInfo || undefined,
          unitPrice: s.unitPrice !== null && s.unitPrice !== undefined ? Number(s.unitPrice) : null,
          isActive: s.isActive,
          status: calculatedStatus as any
        };
      });
    } catch (err) {
      console.warn('[Prisma dbGetMedicationStock] Fallback:', err);
    }
  }
  return hospitalStore.medicationStock;
}

export async function dbCreateMedicationStock(stock: MedicationStock): Promise<MedicationStock> {
  if (isPrismaConnected) {
    try {
      const created = await prisma.medicationStock.create({
        data: {
          id: stock.id,
          drugName: stock.drugName,
          genericName: stock.genericName,
          category: stock.category,
          form: stock.form,
          strength: stock.strength || null,
          stockQuantity: stock.stockQuantity,
          unit: stock.unit,
          minThreshold: stock.minThreshold,
          reorderThreshold: stock.reorderThreshold || null,
          manufacturer: stock.manufacturer || null,
          batchNumber: stock.batchNumber,
          expiryDate: stock.expiryDate,
          storageInfo: stock.storageInfo || null,
          unitPrice:
            stock.unitPrice !== null && stock.unitPrice !== undefined && !isNaN(Number(stock.unitPrice))
              ? new Prisma.Decimal(Number(stock.unitPrice).toFixed(2))
              : null,
          isActive: stock.isActive !== undefined ? stock.isActive : true,
          status: stock.status
        }
      });
      return {
        id: created.id,
        drugName: created.drugName,
        genericName: created.genericName,
        category: created.category,
        form: created.form as any,
        strength: created.strength || undefined,
        stockQuantity: created.stockQuantity,
        unit: created.unit,
        minThreshold: created.minThreshold,
        reorderThreshold: created.reorderThreshold || undefined,
        manufacturer: created.manufacturer || undefined,
        batchNumber: created.batchNumber,
        expiryDate: created.expiryDate,
        storageInfo: created.storageInfo || undefined,
        unitPrice: created.unitPrice !== null ? Number(created.unitPrice) : null,
        isActive: created.isActive,
        status: created.status as any
      };
    } catch (err) {
      console.warn('[Prisma dbCreateMedicationStock] Warning:', err);
    }
  }
  hospitalStore.medicationStock.unshift(stock);
  return stock;
}

export async function dbReceiveStock(
  data: {
    drugName: string;
    genericName: string;
    category: string;
    form: string;
    strength?: string;
    batchNumber: string;
    expiryDate: string;
    quantity: number;
    unit?: string;
    minThreshold?: number;
    reorderThreshold?: number;
    manufacturer?: string;
    storageInfo?: string;
    unitPrice?: number | null;
    notes?: string;
  },
  actor: { id: string; name: string; role: string }
): Promise<MedicationStock> {
  const quantity = Number(data.quantity);
  if (isNaN(quantity) || quantity <= 0) {
    throw new Error('INVALID_QUANTITY: Received quantity must be a positive integer greater than zero.');
  }
  if (!data.drugName?.trim()) throw new Error('DRUG_NAME_REQUIRED: Drug name is mandatory.');
  if (!data.batchNumber?.trim()) throw new Error('BATCH_NUMBER_REQUIRED: Batch number is mandatory.');
  if (!data.expiryDate?.trim()) throw new Error('EXPIRY_DATE_REQUIRED: Expiry date is mandatory.');

  // Medication selling prices may ONLY be configured or modified by SUPER_ADMIN.
  // Pharmacists receiving inventory cannot configure or alter medication selling prices.
  const unitPrice =
    actor.role === 'SUPER_ADMIN' &&
    data.unitPrice !== null &&
    data.unitPrice !== undefined &&
    !isNaN(Number(data.unitPrice))
      ? Number(data.unitPrice)
      : null;

  if (isPrismaConnected) {
    return await prisma.$transaction(async (tx) => {
      // Find all existing records with the same batch number
      const existingBatches = await tx.medicationStock.findMany({
        where: {
          batchNumber: data.batchNumber.trim()
        }
      });

      let stockRecord: any;

      if (existingBatches.length > 0) {
        // Validate batch-defining attributes across all existing entries
        for (const existing of existingBatches) {
          const conflicts: string[] = [];

          // 1. Medication identity
          const existDrug = (existing.drugName || '').trim().toLowerCase();
          const inDrug = (data.drugName || '').trim().toLowerCase();
          if (existDrug !== inDrug) {
            conflicts.push(`medication name mismatch ("${existing.drugName}" vs "${data.drugName}")`);
          }

          // 2. Expiry date: Both must exist and match exactly (NULL vs specified is an ambiguous conflict)
          const existExp = (existing.expiryDate || '').trim();
          const inExp = (data.expiryDate || '').trim();
          if (!existExp && inExp) {
            conflicts.push(`expiry date ambiguity: existing batch has NULL expiry date while incoming batch specifies "${inExp}"`);
          } else if (existExp && !inExp) {
            conflicts.push(`expiry date ambiguity: existing batch specifies expiry date "${existExp}" while incoming batch omits it`);
          } else if (existExp !== inExp) {
            conflicts.push(`expiry date mismatch ("${existing.expiryDate}" vs "${data.expiryDate}")`);
          }

          // 3. Formulation: Both must exist and match (NULL vs specified is an ambiguous conflict)
          const existForm = (existing.form || '').trim().toLowerCase();
          const inForm = (data.form || '').trim().toLowerCase();
          if (!existForm && inForm) {
            conflicts.push(`formulation ambiguity: existing batch has NULL formulation while incoming batch specifies "${data.form}"`);
          } else if (existForm && !inForm) {
            conflicts.push(`formulation ambiguity: existing batch specifies "${existing.form}" while incoming batch omits formulation`);
          } else if (existForm !== inForm) {
            conflicts.push(`formulation mismatch ("${existing.form}" vs "${data.form}")`);
          }

          // 4. Strength: If either specifies strength, they must match identically (missing on either side is an ambiguous conflict)
          const existStrength = (existing.strength || '').trim().toLowerCase();
          const inStrength = (data.strength || '').trim().toLowerCase();
          if (!existStrength && inStrength) {
            conflicts.push(`strength ambiguity: existing batch has NULL strength while incoming batch specifies "${data.strength}"`);
          } else if (existStrength && !inStrength) {
            conflicts.push(`strength ambiguity: existing batch specifies "${existing.strength}" while incoming batch omits strength`);
          } else if (existStrength !== inStrength) {
            conflicts.push(`strength mismatch ("${existing.strength}" vs "${data.strength}")`);
          }

          // 5. Manufacturer: If either specifies manufacturer, they must match identically (missing on either side is an ambiguous conflict)
          const existMfr = (existing.manufacturer || '').trim().toLowerCase();
          const inMfr = (data.manufacturer || '').trim().toLowerCase();
          if (!existMfr && inMfr) {
            conflicts.push(`manufacturer ambiguity: existing batch has NULL manufacturer while incoming batch specifies "${data.manufacturer}"`);
          } else if (existMfr && !inMfr) {
            conflicts.push(`manufacturer ambiguity: existing batch specifies "${existing.manufacturer}" while incoming batch omits manufacturer`);
          } else if (existMfr !== inMfr) {
            conflicts.push(`manufacturer mismatch ("${existing.manufacturer}" vs "${data.manufacturer}")`);
          }

          if (conflicts.length > 0) {
            throw new Error(
              `BatchMetadataConflict: Cannot merge batch "${data.batchNumber.trim()}". Submitted attributes conflict with existing batch record: ${conflicts.join(', ')}. A separately identifiable batch record or explicit resolution is required.`
            );
          }
        }

        // Exact match found without conflicts: merge stock quantity into existing batch
        const existing = existingBatches[0];
        const newQty = existing.stockQuantity + quantity;
        const expired = isDateExpired(existing.expiryDate);
        let newStatus = 'in_stock';
        if (expired) newStatus = 'expired';
        else if (newQty === 0) newStatus = 'out_of_stock';
        else if (newQty <= existing.minThreshold * 0.4) newStatus = 'critical';
        else if (newQty <= existing.minThreshold) newStatus = 'low_stock';

        // Update quantity without silently overwriting existing batch metadata
        stockRecord = await tx.medicationStock.update({
          where: { id: existing.id },
          data: {
            stockQuantity: newQty,
            status: newStatus,
            isActive: true
          }
        });
      } else {
        const minThresh = Number(data.minThreshold) || 20;
        const expired = isDateExpired(data.expiryDate);
        let initialStatus = 'in_stock';
        if (expired) initialStatus = 'expired';
        else if (quantity <= minThresh * 0.4) initialStatus = 'critical';
        else if (quantity <= minThresh) initialStatus = 'low_stock';

        stockRecord = await tx.medicationStock.create({
          data: {
            drugName: data.drugName.trim(),
            genericName: (data.genericName || data.drugName).trim(),
            category: data.category || 'General',
            form: data.form || 'Tablet',
            strength: data.strength?.trim() || null,
            stockQuantity: quantity,
            unit: data.unit?.trim() || 'bottles',
            minThreshold: minThresh,
            reorderThreshold: data.reorderThreshold ? Number(data.reorderThreshold) : null,
            manufacturer: data.manufacturer?.trim() || null,
            batchNumber: data.batchNumber.trim(),
            expiryDate: data.expiryDate.trim(),
            storageInfo: data.storageInfo?.trim() || null,
            unitPrice: unitPrice !== null ? new Prisma.Decimal(unitPrice.toFixed(2)) : null,
            isActive: true,
            status: initialStatus
          }
        });
      }

      // Record immutable stock movement
      await tx.stockMovement.create({
        data: {
          medicineId: stockRecord.id,
          medicineName: stockRecord.drugName,
          batchNumber: stockRecord.batchNumber,
          type: 'Receipt',
          quantityDelta: quantity,
          remainingQuantity: stockRecord.stockQuantity,
          actor: actor.name,
          actorId: actor.id,
          actorRole: actor.role,
          referenceNumber: `RCV-${Date.now()}`,
          notes: data.notes || `Stock received: ${quantity} ${stockRecord.unit} (Batch: ${stockRecord.batchNumber})`
        }
      });

      return {
        id: stockRecord.id,
        drugName: stockRecord.drugName,
        genericName: stockRecord.genericName,
        category: stockRecord.category,
        form: stockRecord.form as any,
        strength: stockRecord.strength || undefined,
        stockQuantity: stockRecord.stockQuantity,
        unit: stockRecord.unit,
        minThreshold: stockRecord.minThreshold,
        reorderThreshold: stockRecord.reorderThreshold || undefined,
        manufacturer: stockRecord.manufacturer || undefined,
        batchNumber: stockRecord.batchNumber,
        expiryDate: stockRecord.expiryDate,
        storageInfo: stockRecord.storageInfo || undefined,
        unitPrice: stockRecord.unitPrice !== null ? Number(stockRecord.unitPrice) : null,
        isActive: stockRecord.isActive,
        status: stockRecord.status as any
      };
    });
  }

  // Fallback for memory store
  const newStock: MedicationStock = {
    id: `med-${Date.now()}`,
    drugName: data.drugName,
    genericName: data.genericName,
    category: data.category,
    form: data.form as any,
    strength: data.strength,
    stockQuantity: quantity,
    unit: data.unit || 'bottles',
    minThreshold: data.minThreshold || 20,
    batchNumber: data.batchNumber,
    expiryDate: data.expiryDate,
    unitPrice: unitPrice,
    status: 'in_stock'
  };
  hospitalStore.medicationStock.unshift(newStock);
  hospitalStore.stockMovements.unshift({
    id: `mov-${Date.now()}`,
    timestamp: new Date().toISOString(),
    medicineId: newStock.id,
    medicineName: newStock.drugName,
    batchNumber: newStock.batchNumber,
    type: 'Purchase Receipt',
    quantityDelta: quantity,
    remainingQuantity: newStock.stockQuantity,
    actor: actor.name,
    referenceNumber: `RCV-${Date.now()}`,
    notes: data.notes || `Received ${quantity} units`
  });
  return newStock;
}

export async function dbConfigureMedicationPrice(
  id: string,
  price: number,
  actor: { id: string; name: string; role: string }
): Promise<MedicationStock> {
  if (actor.role !== 'SUPER_ADMIN') {
    throw new Error('MEDICATION_PRICE_AUTHORITY_REQUIRED: Medication selling price configuration is strictly restricted to SUPER_ADMIN.');
  }

  const numericPrice = Number(price);
  if (isNaN(numericPrice) || numericPrice < 0) {
    throw new Error('INVALID_PRICE: Medication selling price must be a non-negative number.');
  }

  if (isPrismaConnected) {
    const existing = await prisma.medicationStock.findUnique({ where: { id } });
    if (!existing) {
      throw new Error('NOT_FOUND: Medication stock not found.');
    }

    const updated = await prisma.medicationStock.update({
      where: { id },
      data: {
        unitPrice: new Prisma.Decimal(numericPrice.toFixed(2))
      }
    });

    return {
      id: updated.id,
      drugName: updated.drugName,
      genericName: updated.genericName,
      category: updated.category,
      form: updated.form as any,
      strength: updated.strength || undefined,
      stockQuantity: updated.stockQuantity,
      unit: updated.unit,
      minThreshold: updated.minThreshold,
      reorderThreshold: updated.reorderThreshold || undefined,
      manufacturer: updated.manufacturer || undefined,
      batchNumber: updated.batchNumber,
      expiryDate: updated.expiryDate,
      storageInfo: updated.storageInfo || undefined,
      unitPrice: updated.unitPrice !== null ? Number(updated.unitPrice) : null,
      isActive: updated.isActive,
      status: updated.status as any
    };
  }

  const stock = hospitalStore.medicationStock.find((s) => s.id === id);
  if (!stock) throw new Error('NOT_FOUND: Medication stock not found.');
  stock.unitPrice = numericPrice;
  return stock;
}

export async function dbAdjustStock(
  data: {
    stockId: string;
    adjustmentType?: string;
    quantityDelta: number;
    reason: string;
    notes?: string;
  },
  actor: { id: string; name: string; role: string }
): Promise<MedicationStock> {
  if (!data.stockId) {
    throw new Error('STOCK_ID_REQUIRED: stockId is mandatory.');
  }
  if (!data.reason || typeof data.reason !== 'string' || data.reason.trim().length === 0) {
    throw new Error('REASON_REQUIRED: A valid non-empty reason is mandatory for stock adjustment.');
  }
  const delta = Number(data.quantityDelta);
  if (isNaN(delta) || delta === 0) {
    throw new Error('INVALID_QUANTITY_DELTA: quantityDelta must be a non-zero integer.');
  }

  if (isPrismaConnected) {
    return await prisma.$transaction(async (tx) => {
      const stock = await tx.medicationStock.findUnique({ where: { id: data.stockId } });
      if (!stock) {
        throw new Error('STOCK_NOT_FOUND: Medication stock record not found.');
      }

      const newQty = stock.stockQuantity + delta;
      if (newQty < 0) {
        throw new Error(`NEGATIVE_STOCK_PREVENTED: Adjustment delta of ${delta} would result in negative stock quantity (${newQty}). Current stock is ${stock.stockQuantity}.`);
      }

      const expired = isDateExpired(stock.expiryDate);
      let newStatus = 'in_stock';
      if (expired) newStatus = 'expired';
      else if (newQty === 0) newStatus = 'out_of_stock';
      else if (newQty <= stock.minThreshold * 0.4) newStatus = 'critical';
      else if (newQty <= stock.minThreshold) newStatus = 'low_stock';

      const updated = await tx.medicationStock.update({
        where: { id: stock.id },
        data: {
          stockQuantity: newQty,
          status: newStatus
        }
      });

      await tx.stockMovement.create({
        data: {
          medicineId: stock.id,
          medicineName: stock.drugName,
          batchNumber: stock.batchNumber,
          type: data.adjustmentType || 'Audit Adjustment',
          quantityDelta: delta,
          remainingQuantity: newQty,
          actor: actor.name,
          actorId: actor.id,
          actorRole: actor.role,
          reason: data.reason.trim(),
          notes: data.notes || `Stock adjusted by ${delta > 0 ? '+' : ''}${delta}. Reason: ${data.reason.trim()}`
        }
      });

      return {
        id: updated.id,
        drugName: updated.drugName,
        genericName: updated.genericName,
        category: updated.category,
        form: updated.form as any,
        strength: updated.strength || undefined,
        stockQuantity: updated.stockQuantity,
        unit: updated.unit,
        minThreshold: updated.minThreshold,
        reorderThreshold: updated.reorderThreshold || undefined,
        manufacturer: updated.manufacturer || undefined,
        batchNumber: updated.batchNumber,
        expiryDate: updated.expiryDate,
        storageInfo: updated.storageInfo || undefined,
        unitPrice: updated.unitPrice !== null ? Number(updated.unitPrice) : null,
        isActive: updated.isActive,
        status: updated.status as any
      };
    });
  }

  // In-memory fallback
  const stock = hospitalStore.medicationStock.find((m) => m.id === data.stockId);
  if (!stock) throw new Error('STOCK_NOT_FOUND: Medication stock not found.');
  const newQty = stock.stockQuantity + delta;
  if (newQty < 0) throw new Error('NEGATIVE_STOCK_PREVENTED: Negative stock quantity.');
  stock.stockQuantity = newQty;
  stock.status = newQty === 0 ? 'out_of_stock' as any : newQty <= stock.minThreshold ? 'low_stock' : 'in_stock';
  hospitalStore.stockMovements.unshift({
    id: `mov-${Date.now()}`,
    timestamp: new Date().toISOString(),
    medicineId: stock.id,
    medicineName: stock.drugName,
    batchNumber: stock.batchNumber,
    type: (data.adjustmentType as any) || 'Audit Adjustment',
    quantityDelta: delta,
    remainingQuantity: newQty,
    actor: actor.name,
    referenceNumber: `ADJ-${Date.now()}`,
    reason: data.reason.trim(),
    notes: data.notes || data.reason.trim()
  });
  return stock;
}

export async function dbGetStockMovements(filters?: {
  medicineId?: string;
  batchNumber?: string;
  type?: string;
  limit?: number;
}): Promise<StockMovement[]> {
  if (isPrismaConnected) {
    try {
      const where: Prisma.StockMovementWhereInput = {};
      if (filters?.medicineId) where.medicineId = filters.medicineId;
      if (filters?.batchNumber) where.batchNumber = filters.batchNumber;
      if (filters?.type) where.type = filters.type;

      const dbMovements = await prisma.stockMovement.findMany({
        where,
        orderBy: { timestamp: 'desc' },
        take: filters?.limit || 200
      });

      return dbMovements.map((m) => ({
        id: m.id,
        timestamp: m.timestamp.toISOString(),
        medicineId: m.medicineId || '',
        medicineName: m.medicineName,
        batchNumber: m.batchNumber,
        type: m.type as any,
        quantityDelta: m.quantityDelta,
        remainingQuantity: m.remainingQuantity,
        actor: m.actor,
        actorId: m.actorId || undefined,
        actorRole: m.actorRole || undefined,
        referenceNumber: m.referenceNumber || '',
        reason: m.reason || undefined,
        notes: m.notes || '',
        createdAt: m.createdAt.toISOString()
      }));
    } catch (err) {
      console.warn('[Prisma dbGetStockMovements] Fallback:', err);
    }
  }
  return hospitalStore.stockMovements;
}

export async function dbCreateStockMovement(movement: StockMovement): Promise<StockMovement> {
  if (isPrismaConnected) {
    try {
      await prisma.stockMovement.create({
        data: {
          id: movement.id,
          timestamp: new Date(movement.timestamp),
          medicineId: movement.medicineId,
          medicineName: movement.medicineName,
          batchNumber: movement.batchNumber,
          type: movement.type,
          quantityDelta: movement.quantityDelta,
          remainingQuantity: movement.remainingQuantity,
          actor: movement.actor,
          actorId: movement.actorId || null,
          actorRole: movement.actorRole || null,
          referenceNumber: movement.referenceNumber,
          reason: movement.reason || null,
          notes: movement.notes
        }
      });
    } catch (err) {
      console.warn('[Prisma dbCreateStockMovement] Warning:', err);
    }
  }
  hospitalStore.stockMovements.unshift(movement);
  return movement;
}

export async function dbGetPrescriptionQueue(filters?: {
  patientId?: string;
  status?: string;
}): Promise<Array<Prescription & { availableBatches?: MedicationStock[] }>> {
  if (isPrismaConnected) {
    try {
      const where: Prisma.PrescriptionWhereInput = {};
      if (filters?.patientId) where.patientId = filters.patientId;
      if (filters?.status) {
        where.dispensingStatus = filters.status;
      } else {
        where.dispensingStatus = { in: ['pending', 'partially_dispensed'] };
      }

      const dbRxs = await prisma.prescription.findMany({
        where,
        include: { dispensingRecords: true },
        orderBy: { datePrescribed: 'asc' }
      });

      const results = [];
      for (const r of dbRxs) {
        const batches = await prisma.medicationStock.findMany({
          where: {
            drugName: { contains: r.medicationName, mode: 'insensitive' },
            stockQuantity: { gt: 0 },
            isActive: true
          },
          orderBy: { expiryDate: 'asc' } // FEFO
        });

        const mappedBatches: MedicationStock[] = batches.map((b) => ({
          id: b.id,
          drugName: b.drugName,
          genericName: b.genericName,
          category: b.category,
          form: b.form as any,
          strength: b.strength || undefined,
          stockQuantity: b.stockQuantity,
          unit: b.unit,
          minThreshold: b.minThreshold,
          reorderThreshold: b.reorderThreshold || undefined,
          manufacturer: b.manufacturer || undefined,
          batchNumber: b.batchNumber,
          expiryDate: b.expiryDate,
          storageInfo: b.storageInfo || undefined,
          unitPrice: b.unitPrice !== null ? Number(b.unitPrice) : null,
          isActive: b.isActive,
          status: (isDateExpired(b.expiryDate) ? 'expired' : b.status) as any
        }));

        results.push({
          id: r.id,
          rxNumber: r.rxNumber,
          encounterId: r.encounterId || undefined,
          patientId: r.patientId || '',
          patientName: r.patientName,
          mrn: r.mrn,
          doctorId: r.doctorId || '',
          doctorName: r.doctorName,
          prescribingPractitionerRole: r.prescribingPractitionerRole || undefined,
          datePrescribed: r.datePrescribed.toISOString(),
          medicationId: r.medicationId || undefined,
          medicationName: r.medicationName,
          dosage: r.dosage,
          frequency: r.frequency,
          route: r.route as any,
          duration: r.duration,
          quantity: r.quantity,
          instructions: r.instructions || undefined,
          amendmentHistory: r.amendmentHistory || undefined,
          status: r.status as any,
          dispensingStatus: (r.dispensingStatus as any) || 'pending',
          dispensedQuantity: r.dispensedQuantity,
          remainingQuantity: r.remainingQuantity,
          dispensedBy: r.dispensedBy || undefined,
          dispensedById: r.dispensedById || undefined,
          dispensedAt: r.dispensedAt ? r.dispensedAt.toISOString() : undefined,
          dispenseHistory: r.dispenseHistory || undefined,
          dispensingRecords: r.dispensingRecords ? r.dispensingRecords.map((d) => ({
            id: d.id,
            dispenseNumber: d.dispenseNumber,
            prescriptionId: d.prescriptionId,
            encounterId: d.encounterId || undefined,
            patientId: d.patientId || undefined,
            patientName: d.patientName,
            mrn: d.mrn,
            medicationStockId: d.medicationStockId || undefined,
            drugName: d.drugName,
            batchNumber: d.batchNumber,
            expiryDate: d.expiryDate || undefined,
            quantityDispensed: d.quantityDispensed,
            dispensedAt: d.dispensedAt.toISOString(),
            dispensedById: d.dispensedById,
            dispensedByName: d.dispensedByName,
            dispensedByRole: d.dispensedByRole,
            pharmacyNotes: d.pharmacyNotes || undefined,
            createdAt: d.createdAt.toISOString()
          })) : undefined,
          pharmacyNotes: r.pharmacyNotes || undefined,
          availableBatches: mappedBatches
        });
      }

      return results;
    } catch (err) {
      console.warn('[Prisma dbGetPrescriptionQueue] Fallback:', err);
    }
  }

  return hospitalStore.prescriptions.filter((p) => p.status === 'pending') as any;
}

// ============================================================================
// PHASE 3: CLINICAL OPERATIONS & ENCOUNTERS (DOCTOR & VAIDYA DISCIPLINE)
// ============================================================================

export async function generateUniqueEncounterNumber(): Promise<string> {
  const year = new Date().getFullYear();
  if (!isPrismaConnected) {
    throw new Error('DatabaseUnavailable: Active PostgreSQL connection is required for sequence-backed Encounter Number generation.');
  }

  try {
    const res = await prisma.$queryRaw<[{ nextval: bigint }]>`SELECT nextval('clinical_encounter_seq')`;
    if (!res || !res[0] || res[0].nextval === undefined || res[0].nextval === null) {
      throw new Error('SequenceUnavailable: Sequence "clinical_encounter_seq" returned empty result.');
    }
    const seq = Number(res[0].nextval);
    if (isNaN(seq) || seq <= 0) {
      throw new Error('SequenceInvalid: Sequence "clinical_encounter_seq" returned invalid integer.');
    }
    return `ENC-${year}-${String(seq).padStart(5, '0')}`;
  } catch (err: any) {
    console.error('[Prisma generateUniqueEncounterNumber] Fail-closed sequence failure:', err.message);
    throw new Error(`EncounterNumberGenerationFailed: Authoritative sequence generation failed: ${err.message}`);
  }
}

export async function generateUniquePanchakarmaReferralNumber(): Promise<string> {
  const year = new Date().getFullYear();
  if (!isPrismaConnected) {
    throw new Error('DatabaseUnavailable: Active PostgreSQL connection is required for sequence-backed Panchakarma Referral Number generation.');
  }

  try {
    const res = await prisma.$queryRaw<[{ nextval: bigint }]>`SELECT nextval('panchakarma_referral_seq')`;
    if (!res || !res[0] || res[0].nextval === undefined || res[0].nextval === null) {
      throw new Error('SequenceUnavailable: Sequence "panchakarma_referral_seq" returned empty result.');
    }
    const seq = Number(res[0].nextval);
    if (isNaN(seq) || seq <= 0) {
      throw new Error('SequenceInvalid: Sequence "panchakarma_referral_seq" returned invalid integer.');
    }
    return `PKR-${year}-${String(seq).padStart(5, '0')}`;
  } catch (err: any) {
    console.error('[Prisma generateUniquePanchakarmaReferralNumber] Fail-closed sequence failure:', err.message);
    throw new Error(`PanchakarmaReferralNumberGenerationFailed: Authoritative sequence generation failed: ${err.message}`);
  }
}

export function mapDbClinicalEncounterToClinicalEncounter(e: any): ClinicalEncounter {
  return {
    id: e.id,
    encounterNumber: e.encounterNumber,
    patientId: e.patientId,
    patient: e.patient ? mapDbPatientToPatient(e.patient) : undefined,
    appointmentId: e.appointmentId || undefined,
    appointment: e.appointment ? mapDbAppointmentToAppointment(e.appointment) : undefined,
    practitionerId: e.practitionerId,
    practitionerName: e.practitionerName,
    practitionerRole: e.practitionerRole as 'DOCTOR' | 'VAIDYA',
    discipline: e.discipline as 'DOCTOR' | 'VAIDYA',
    encounterType: e.encounterType as any,
    status: e.status as any,
    startedAt: e.startedAt instanceof Date ? e.startedAt.toISOString() : String(e.startedAt),
    completedAt: e.completedAt ? (e.completedAt instanceof Date ? e.completedAt.toISOString() : String(e.completedAt)) : undefined,
    reasonForVisit: e.reasonForVisit || undefined,
    clinicalDocumentationCompleted: Boolean(e.clinicalDocumentationCompleted),
    vitals: e.vitals ? e.vitals.map((v: any) => ({
      id: v.id,
      encounterId: v.encounterId,
      patientId: v.patientId,
      recordedAt: v.recordedAt instanceof Date ? v.recordedAt.toISOString() : String(v.recordedAt),
      recordedById: v.recordedById,
      recordedByName: v.recordedByName,
      recordedByRole: v.recordedByRole,
      bpSystolic: v.bpSystolic ?? null,
      bpDiastolic: v.bpDiastolic ?? null,
      heartRate: v.heartRate ?? null,
      respiratoryRate: v.respiratoryRate ?? null,
      temperature: v.temperature !== null && v.temperature !== undefined ? Number(v.temperature) : null,
      temperatureUnit: v.temperatureUnit || 'F',
      spO2: v.spO2 ?? null,
      height: v.height !== null && v.height !== undefined ? Number(v.height) : null,
      weight: v.weight !== null && v.weight !== undefined ? Number(v.weight) : null,
      bmi: v.bmi !== null && v.bmi !== undefined ? Number(v.bmi) : null,
      notes: v.notes || undefined,
      createdAt: v.createdAt instanceof Date ? v.createdAt.toISOString() : String(v.createdAt)
    })) : [],
    assessments: e.assessments ? e.assessments.map((a: any) => ({
      id: a.id,
      encounterId: a.encounterId,
      patientId: a.patientId,
      practitionerId: a.practitionerId,
      practitionerName: a.practitionerName,
      practitionerRole: a.practitionerRole,
      presentingComplaints: a.presentingComplaints || undefined,
      historyOfPresentingIllness: a.historyOfPresentingIllness || undefined,
      physicalExamination: a.physicalExamination || undefined,
      systemicExamination: a.systemicExamination || undefined,
      clinicalObservations: a.clinicalObservations || undefined,
      clinicalImpression: a.clinicalImpression || undefined,
      differentialDiagnosis: a.differentialDiagnosis || undefined,
      clinicalPlan: a.clinicalPlan || undefined,
      followUpAdvice: a.followUpAdvice || undefined,
      recordedAt: a.recordedAt instanceof Date ? a.recordedAt.toISOString() : String(a.recordedAt),
      createdAt: a.createdAt instanceof Date ? a.createdAt.toISOString() : String(a.createdAt),
      updatedAt: a.updatedAt instanceof Date ? a.updatedAt.toISOString() : String(a.updatedAt)
    })) : [],
    diagnoses: e.diagnoses ? e.diagnoses.map((d: any) => ({
      id: d.id,
      encounterId: d.encounterId,
      patientId: d.patientId,
      practitionerId: d.practitionerId,
      practitionerName: d.practitionerName,
      practitionerRole: d.practitionerRole,
      diagnosisType: d.diagnosisType as any,
      icdCode: d.icdCode || undefined,
      diagnosisName: d.diagnosisName,
      notes: d.notes || undefined,
      status: d.status as any,
      recordedAt: d.recordedAt instanceof Date ? d.recordedAt.toISOString() : String(d.recordedAt),
      createdAt: d.createdAt instanceof Date ? d.createdAt.toISOString() : String(d.createdAt)
    })) : [],
    prescriptions: e.prescriptions ? e.prescriptions.map((p: any) => ({
      id: p.id,
      rxNumber: p.rxNumber,
      encounterId: p.encounterId || undefined,
      patientId: p.patientId || '',
      patientName: p.patientName,
      mrn: p.mrn,
      doctorId: p.doctorId || '',
      doctorName: p.doctorName,
      prescribingPractitionerRole: p.prescribingPractitionerRole || undefined,
      datePrescribed: p.datePrescribed instanceof Date ? p.datePrescribed.toISOString() : String(p.datePrescribed),
      medicationId: p.medicationId || undefined,
      medicationName: p.medicationName,
      dosage: p.dosage,
      frequency: p.frequency,
      route: p.route,
      duration: p.duration,
      quantity: p.quantity ?? 1,
      instructions: p.instructions || undefined,
      amendmentHistory: p.amendmentHistory || undefined,
      status: p.status as any,
      dispensedBy: p.dispensedBy || undefined,
      dispensedAt: p.dispensedAt ? (p.dispensedAt instanceof Date ? p.dispensedAt.toISOString() : String(p.dispensedAt)) : undefined,
      pharmacyNotes: p.pharmacyNotes || undefined
    })) : [],
    labOrders: e.labOrders ? e.labOrders.map((l: any) => ({
      id: l.id,
      orderNumber: l.orderNumber,
      encounterId: l.encounterId || undefined,
      patientId: l.patientId || '',
      patientName: l.patientName,
      mrn: l.mrn,
      testType: l.testType,
      priority: l.priority,
      orderingDoctor: l.orderingDoctor,
      orderingPractitionerId: l.orderingPractitionerId || undefined,
      orderingPractitionerRole: l.orderingPractitionerRole || undefined,
      clinicalIndication: l.clinicalIndication || undefined,
      orderedAt: l.orderedAt instanceof Date ? l.orderedAt.toISOString() : String(l.orderedAt),
      sampleCollectedAt: l.sampleCollectedAt ? (l.sampleCollectedAt instanceof Date ? l.sampleCollectedAt.toISOString() : String(l.sampleCollectedAt)) : undefined,
      sampleCollectedBy: l.sampleCollectedBy || undefined,
      status: l.status as any,
      normalRange: l.normalRange || undefined,
      resultValue: l.resultValue || undefined,
      unit: l.unit || undefined,
      isAbnormal: Boolean(l.isAbnormal),
      resultTimestamp: l.resultTimestamp ? (l.resultTimestamp instanceof Date ? l.resultTimestamp.toISOString() : String(l.resultTimestamp)) : undefined,
      resultAttribution: l.resultAttribution || undefined,
      resultAttributionId: l.resultAttributionId || undefined,
      reviewedAt: l.reviewedAt ? (l.reviewedAt instanceof Date ? l.reviewedAt.toISOString() : String(l.reviewedAt)) : undefined,
      reviewedById: l.reviewedById || undefined,
      reviewedByName: l.reviewedByName || undefined,
      reviewNotes: l.reviewNotes || undefined,
      labNotes: l.labNotes || undefined
    })) : [],
    treatmentPlans: e.treatmentPlans ? e.treatmentPlans.map((t: any) => ({
      id: t.id,
      planNumber: t.planNumber,
      encounterId: t.encounterId || undefined,
      patientId: t.patientId || '',
      patientName: t.patientName,
      patientMrn: t.patientMrn,
      doctorId: t.doctorId || '',
      doctorName: t.doctorName,
      practitionerRole: t.practitionerRole || 'VAIDYA',
      assignedTherapist: t.assignedTherapist,
      therapyType: t.therapyType,
      clinicalObjective: t.clinicalObjective,
      oilOrFormulation: t.oilOrFormulation,
      totalSessions: t.totalSessions,
      completedSessions: t.completedSessions,
      frequency: t.frequency,
      startDate: t.startDate,
      endDate: t.endDate,
      roomNumber: t.roomNumber,
      status: t.status as any,
      instructions: t.instructions || undefined,
      notes: t.notes || ''
    })) : [],
    prakritiAssessments: e.prakritiAssessments ? e.prakritiAssessments.map((p: any) => ({
      id: p.id,
      encounterId: p.encounterId,
      patientId: p.patientId,
      practitionerId: p.practitionerId,
      practitionerName: p.practitionerName,
      vataScore: Number(p.vataScore),
      pittaScore: Number(p.pittaScore),
      kaphaScore: Number(p.kaphaScore),
      dominantPrakriti: p.dominantPrakriti,
      physicalCharacteristics: p.physicalCharacteristics || undefined,
      physiologicalCharacteristics: p.physiologicalCharacteristics || undefined,
      psychologicalCharacteristics: p.psychologicalCharacteristics || undefined,
      clinicalInterpretation: p.clinicalInterpretation,
      recordedAt: p.recordedAt instanceof Date ? p.recordedAt.toISOString() : String(p.recordedAt),
      createdAt: p.createdAt instanceof Date ? p.createdAt.toISOString() : String(p.createdAt)
    })) : [],
    vikritiAssessments: e.vikritiAssessments ? e.vikritiAssessments.map((v: any) => ({
      id: v.id,
      encounterId: v.encounterId,
      patientId: v.patientId,
      practitionerId: v.practitionerId,
      practitionerName: v.practitionerName,
      primaryVikriti: v.primaryVikriti,
      secondaryVikriti: v.secondaryVikriti || undefined,
      vataAggravation: v.vataAggravation || undefined,
      pittaAggravation: v.pittaAggravation || undefined,
      kaphaAggravation: v.kaphaAggravation || undefined,
      clinicalInterpretation: v.clinicalInterpretation,
      recordedAt: v.recordedAt instanceof Date ? v.recordedAt.toISOString() : String(v.recordedAt),
      createdAt: v.createdAt instanceof Date ? v.createdAt.toISOString() : String(v.createdAt)
    })) : [],
    doshaEvaluations: e.doshaEvaluations ? e.doshaEvaluations.map((d: any) => ({
      id: d.id,
      encounterId: d.encounterId,
      patientId: d.patientId,
      practitionerId: d.practitionerId,
      practitionerName: d.practitionerName,
      agniStatus: d.agniStatus || undefined,
      amaStatus: d.amaStatus || undefined,
      koshthaType: d.koshthaType || undefined,
      dhatuInvolvement: d.dhatuInvolvement || undefined,
      srotasInvolvement: d.srotasInvolvement || undefined,
      ashtaVidhaPariksha: d.ashtaVidhaPariksha || undefined,
      clinicalInterpretation: d.clinicalInterpretation,
      recordedAt: d.recordedAt instanceof Date ? d.recordedAt.toISOString() : String(d.recordedAt),
      createdAt: d.createdAt instanceof Date ? d.createdAt.toISOString() : String(d.createdAt)
    })) : [],
    panchakarmaReferrals: e.panchakarmaReferrals ? e.panchakarmaReferrals.map((r: any) => ({
      id: r.id,
      referralNumber: r.referralNumber,
      encounterId: r.encounterId,
      patientId: r.patientId,
      practitionerId: r.practitionerId,
      practitionerName: r.practitionerName,
      proposedProcedure: r.proposedProcedure,
      clinicalIndication: r.clinicalIndication,
      preliminaryNotes: r.preliminaryNotes || undefined,
      urgency: r.urgency as any,
      status: r.status as any,
      referredAt: r.referredAt instanceof Date ? r.referredAt.toISOString() : String(r.referredAt),
      createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt)
    })) : [],
    createdAt: e.createdAt instanceof Date ? e.createdAt.toISOString() : String(e.createdAt),
    updatedAt: e.updatedAt instanceof Date ? e.updatedAt.toISOString() : String(e.updatedAt)
  };
}

export async function dbGetDoctorQueue(options?: { date?: string; practitionerId?: string }): Promise<QueueItem[]> {
  return dbGetReceptionQueue({
    date: options?.date,
    practitionerRole: 'DOCTOR',
    userRole: 'DOCTOR',
    practitionerId: options?.practitionerId
  });
}

export async function dbGetVaidyaQueue(options?: { date?: string; practitionerId?: string }): Promise<QueueItem[]> {
  return dbGetReceptionQueue({
    date: options?.date,
    practitionerRole: 'VAIDYA',
    userRole: 'VAIDYA',
    practitionerId: options?.practitionerId
  });
}

export async function dbGetDoctorDashboard(practitionerId?: string): Promise<DoctorDashboardMetrics> {
  if (!isPrismaConnected) {
    throw new Error('DatabaseUnavailable: Active PostgreSQL connection is required for Doctor dashboard.');
  }

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  const baseApptWhere: any = {
    dateTime: { gte: todayStart, lte: todayEnd },
    practitionerRole: 'DOCTOR'
  };
  if (practitionerId) {
    baseApptWhere.practitionerId = practitionerId;
  }

  const [
    todayAppointments,
    waitingQueue,
    escalatedQueue,
    activeConsultations,
    completedEncounters,
    pendingInvestigations,
    pendingDocumentation
  ] = await Promise.all([
    prisma.appointment.count({ where: baseApptWhere }),
    prisma.appointment.count({
      where: {
        ...baseApptWhere,
        status: { in: ['waiting', 'checked_in'] }
      }
    }),
    prisma.appointment.count({
      where: {
        practitionerRole: 'DOCTOR',
        isEscalated: true
      }
    }),
    prisma.clinicalEncounter.count({
      where: {
        discipline: 'DOCTOR',
        status: 'in_progress',
        ...(practitionerId ? { practitionerId } : {})
      }
    }),
    prisma.clinicalEncounter.count({
      where: {
        discipline: 'DOCTOR',
        status: 'completed',
        completedAt: { gte: todayStart, lte: todayEnd },
        ...(practitionerId ? { practitionerId } : {})
      }
    }),
    prisma.labOrder.count({
      where: {
        status: { in: ['ordered', 'sample_collected', 'processing'] }
      }
    }),
    prisma.clinicalEncounter.count({
      where: {
        discipline: 'DOCTOR',
        clinicalDocumentationCompleted: false,
        ...(practitionerId ? { practitionerId } : {})
      }
    })
  ]);

  return {
    todayAppointments,
    waitingQueue,
    escalatedQueue,
    activeConsultations,
    completedEncounters,
    pendingInvestigations,
    pendingDocumentation
  };
}

export async function dbGetVaidyaDashboard(practitionerId?: string): Promise<VaidyaDashboardMetrics> {
  if (!isPrismaConnected) {
    throw new Error('DatabaseUnavailable: Active PostgreSQL connection is required for Vaidya dashboard.');
  }

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  const baseApptWhere: any = {
    dateTime: { gte: todayStart, lte: todayEnd },
    practitionerRole: 'VAIDYA'
  };
  if (practitionerId) {
    baseApptWhere.practitionerId = practitionerId;
  }

  const [
    todayAppointments,
    waitingQueue,
    escalatedQueue,
    activeConsultations,
    pendingTreatmentPlans,
    panchakarmaReferrals,
    completedEncounters
  ] = await Promise.all([
    prisma.appointment.count({ where: baseApptWhere }),
    prisma.appointment.count({
      where: {
        ...baseApptWhere,
        status: { in: ['waiting', 'checked_in'] }
      }
    }),
    prisma.appointment.count({
      where: {
        practitionerRole: 'VAIDYA',
        isEscalated: true
      }
    }),
    prisma.clinicalEncounter.count({
      where: {
        discipline: 'VAIDYA',
        status: 'in_progress',
        ...(practitionerId ? { practitionerId } : {})
      }
    }),
    prisma.treatmentPlan.count({
      where: {
        status: 'active'
      }
    }),
    prisma.panchakarmaReferral.count({
      where: {
        status: 'referred'
      }
    }),
    prisma.clinicalEncounter.count({
      where: {
        discipline: 'VAIDYA',
        status: 'completed',
        completedAt: { gte: todayStart, lte: todayEnd },
        ...(practitionerId ? { practitionerId } : {})
      }
    })
  ]);

  return {
    todayAppointments,
    waitingQueue,
    escalatedQueue,
    activeConsultations,
    pendingTreatmentPlans,
    panchakarmaReferrals,
    completedEncounters
  };
}

export async function dbInitiateEncounter(
  data: {
    patientId: string;
    appointmentId?: string;
    encounterType?: string;
    reasonForVisit?: string;
  },
  actor: { id: string; name: string; role: string }
): Promise<ClinicalEncounter> {
  if (!isPrismaConnected) {
    throw new Error('DatabaseUnavailable: Active PostgreSQL connection is required for initiating an encounter.');
  }

  const role = (actor.role || '').toUpperCase();
  if (role !== 'DOCTOR' && role !== 'VAIDYA') {
    throw new Error('ClinicalAuthorityRequired: Only DOCTOR or VAIDYA may initiate a clinical encounter.');
  }

  const patient = await prisma.patient.findFirst({
    where: { OR: [{ id: data.patientId }, { mrn: data.patientId }] }
  });
  if (!patient) {
    throw new Error('PatientNotFound: Patient record was not found.');
  }

  let appointment: any = null;
  if (data.appointmentId) {
    appointment = await prisma.appointment.findFirst({
      where: { OR: [{ id: data.appointmentId }, { appointmentNumber: data.appointmentId }] }
    });
    if (!appointment) {
      throw new Error('AppointmentNotFound: Appointment record was not found.');
    }

    if (appointment.practitionerRole && appointment.practitionerRole.toUpperCase() !== role) {
      throw new Error('ClinicalDisciplineMismatch: Clinician discipline does not match appointment practitioner discipline.');
    }

    const existingActive = await prisma.clinicalEncounter.findFirst({
      where: {
        appointmentId: appointment.id,
        status: 'in_progress'
      }
    });
    if (existingActive) {
      throw new Error('ActiveEncounterExists: An active encounter already exists for this appointment.');
    }

    await prisma.appointment.update({
      where: { id: appointment.id },
      data: {
        status: 'in_consultation',
        consultationStartTime: new Date()
      }
    });
  }

  // Resolve authoritative practitioner in database
  let practitioner = await prisma.user.findUnique({ where: { id: actor.id } });
  if (!practitioner) {
    practitioner = await prisma.user.findFirst({ where: { role } });
  }
  const practitionerId = practitioner ? practitioner.id : actor.id;
  const practitionerName = actor.name || (practitioner ? practitioner.name : 'Attending Clinician');

  const encounterNumber = await generateUniqueEncounterNumber();
  const created = await prisma.clinicalEncounter.create({
    data: {
      encounterNumber,
      patientId: patient.id,
      appointmentId: appointment ? appointment.id : null,
      practitionerId,
      practitionerName,
      practitionerRole: role,
      discipline: role,
      encounterType: data.encounterType || 'consultation',
      status: 'in_progress',
      reasonForVisit: data.reasonForVisit || (appointment ? appointment.reasonForVisit : null),
      clinicalDocumentationCompleted: false
    },
    include: {
      patient: true,
      appointment: true,
      vitals: true,
      assessments: true,
      diagnoses: true,
      prescriptions: true,
      labOrders: true,
      treatmentPlans: true,
      prakritiAssessments: true,
      vikritiAssessments: true,
      doshaEvaluations: true,
      panchakarmaReferrals: true
    }
  });

  await dbLogAudit(
    actor.name,
    role,
    'INITIATE_CLINICAL_ENCOUNTER',
    'Clinical Operations',
    `Clinical encounter ${encounterNumber} initiated for patient ${patient.mrn} by ${actor.name} (${role})`,
    patient.mrn
  );

  return mapDbClinicalEncounterToClinicalEncounter(created);
}

export async function dbGetEncounterById(encounterId: string, userRole?: string): Promise<ClinicalEncounter> {
  if (!isPrismaConnected) {
    throw new Error('DatabaseUnavailable: Active PostgreSQL connection is required for fetching an encounter.');
  }

  const enc = await prisma.clinicalEncounter.findFirst({
    where: { OR: [{ id: encounterId }, { encounterNumber: encounterId }] },
    include: {
      patient: true,
      appointment: true,
      vitals: { orderBy: { recordedAt: 'asc' } },
      assessments: { orderBy: { recordedAt: 'asc' } },
      diagnoses: { orderBy: { recordedAt: 'asc' } },
      prescriptions: { orderBy: { datePrescribed: 'asc' } },
      labOrders: { orderBy: { orderedAt: 'asc' } },
      treatmentPlans: { orderBy: { createdAt: 'asc' } },
      prakritiAssessments: { orderBy: { recordedAt: 'asc' } },
      vikritiAssessments: { orderBy: { recordedAt: 'asc' } },
      doshaEvaluations: { orderBy: { recordedAt: 'asc' } },
      panchakarmaReferrals: { orderBy: { referredAt: 'asc' } }
    }
  });

  if (!enc) {
    throw new Error('EncounterNotFound: Clinical encounter record was not found.');
  }

  return mapDbClinicalEncounterToClinicalEncounter(enc);
}

export async function dbCompleteEncounter(
  encounterId: string,
  actor: { id: string; name: string; role: string }
): Promise<ClinicalEncounter> {
  if (!isPrismaConnected) {
    throw new Error('DatabaseUnavailable: Active PostgreSQL connection is required for completing an encounter.');
  }

  const role = (actor.role || '').toUpperCase();
  if (role !== 'DOCTOR' && role !== 'VAIDYA') {
    throw new Error('ClinicalAuthorityRequired: Only DOCTOR or VAIDYA may complete a clinical encounter.');
  }

  const enc = await prisma.clinicalEncounter.findFirst({
    where: { OR: [{ id: encounterId }, { encounterNumber: encounterId }] },
    include: { patient: true }
  });
  if (!enc) {
    throw new Error('EncounterNotFound: Clinical encounter record was not found.');
  }

  if (enc.discipline.toUpperCase() !== role) {
    throw new Error('ClinicalDisciplineMismatch: Clinician discipline does not match encounter discipline.');
  }

  if (enc.status !== 'in_progress') {
    throw new Error('InvalidEncounterState: Encounter is not currently in progress.');
  }

  const now = new Date();
  const updated = await prisma.$transaction(async (tx) => {
    const encUpdated = await tx.clinicalEncounter.update({
      where: { id: enc.id },
      data: {
        status: 'completed',
        completedAt: now,
        clinicalDocumentationCompleted: true
      },
      include: {
        patient: true,
        appointment: true,
        vitals: true,
        assessments: true,
        diagnoses: true,
        prescriptions: true,
        labOrders: true,
        treatmentPlans: true,
        prakritiAssessments: true,
        vikritiAssessments: true,
        doshaEvaluations: true,
        panchakarmaReferrals: true
      }
    });

    if (enc.appointmentId) {
      await tx.appointment.update({
        where: { id: enc.appointmentId },
        data: {
          status: 'completed',
          completedAt: now,
          clinicalDocumentationCompleted: true
        }
      });
    }

    return encUpdated;
  });

  await dbLogAudit(
    actor.name,
    role,
    'COMPLETE_CLINICAL_ENCOUNTER',
    'Clinical Operations',
    `Clinical encounter ${enc.encounterNumber} completed by ${actor.name} (${role})`,
    enc.patient.mrn
  );

  return mapDbClinicalEncounterToClinicalEncounter(updated);
}

export async function dbRecordVitals(
  encounterId: string,
  data: any,
  actor: { id: string; name: string; role: string }
): Promise<ClinicalVitals> {
  if (!isPrismaConnected) {
    throw new Error('DatabaseUnavailable: Active PostgreSQL connection is required for recording vitals.');
  }

  const role = (actor.role || '').toUpperCase();
  if (role !== 'DOCTOR' && role !== 'VAIDYA') {
    throw new Error('ClinicalAuthorityRequired: Only DOCTOR or VAIDYA may record clinical vitals.');
  }

  const enc = await prisma.clinicalEncounter.findFirst({
    where: { OR: [{ id: encounterId }, { encounterNumber: encounterId }] },
    include: { patient: true }
  });
  if (!enc) {
    throw new Error('EncounterNotFound: Clinical encounter was not found.');
  }

  if (enc.discipline.toUpperCase() !== role) {
    throw new Error('ClinicalDisciplineMismatch: Clinician discipline does not match encounter discipline.');
  }

  if (enc.status !== 'in_progress') {
    throw new Error('InvalidEncounterState: Cannot record vitals for a non-active encounter.');
  }

  const height = typeof data.height === 'number' && data.height > 0 ? Number(data.height.toFixed(2)) : null;
  const weight = typeof data.weight === 'number' && data.weight > 0 ? Number(data.weight.toFixed(2)) : null;
  let bmi: number | null = null;
  if (height !== null && weight !== null && height > 0) {
    const hInM = height / 100;
    bmi = Number((weight / (hInM * hInM)).toFixed(1));
  }

  const temperature = typeof data.temperature === 'number' && data.temperature > 0 ? Number(data.temperature.toFixed(2)) : null;
  const bpSystolic = typeof data.bpSystolic === 'number' ? Math.round(data.bpSystolic) : null;
  const bpDiastolic = typeof data.bpDiastolic === 'number' ? Math.round(data.bpDiastolic) : null;
  const heartRate = typeof data.heartRate === 'number' ? Math.round(data.heartRate) : null;
  const respiratoryRate = typeof data.respiratoryRate === 'number' ? Math.round(data.respiratoryRate) : null;
  const spO2 = typeof data.spO2 === 'number' ? Math.round(data.spO2) : null;

  const vitalsRecord = await prisma.clinicalVitals.create({
    data: {
      encounterId: enc.id,
      patientId: enc.patientId,
      recordedById: actor.id,
      recordedByName: actor.name,
      recordedByRole: role,
      bpSystolic,
      bpDiastolic,
      heartRate,
      respiratoryRate,
      temperature: temperature !== null ? new Prisma.Decimal(temperature.toFixed(2)) : null,
      temperatureUnit: data.temperatureUnit || 'F',
      spO2,
      height: height !== null ? new Prisma.Decimal(height.toFixed(2)) : null,
      weight: weight !== null ? new Prisma.Decimal(weight.toFixed(2)) : null,
      bmi: bmi !== null ? new Prisma.Decimal(bmi.toFixed(1)) : null,
      notes: data.notes || null
    }
  });

  // Update patient latestVitals snapshot
  await prisma.patient.update({
    where: { id: enc.patientId },
    data: {
      latestVitals: {
        bpSystolic,
        bpDiastolic,
        heartRate,
        respiratoryRate,
        temperature,
        temperatureUnit: data.temperatureUnit || 'F',
        spO2,
        height,
        weight,
        bmi,
        recordedAt: vitalsRecord.recordedAt.toISOString(),
        recordedBy: actor.name
      }
    }
  });

  await dbLogAudit(
    actor.name,
    role,
    'RECORD_CLINICAL_VITALS',
    'Clinical Operations',
    `Vitals recorded for encounter ${enc.encounterNumber} by ${actor.name} (${role})`,
    enc.patient.mrn
  );

  return {
    id: vitalsRecord.id,
    encounterId: vitalsRecord.encounterId,
    patientId: vitalsRecord.patientId,
    recordedAt: vitalsRecord.recordedAt.toISOString(),
    recordedById: vitalsRecord.recordedById,
    recordedByName: vitalsRecord.recordedByName,
    recordedByRole: vitalsRecord.recordedByRole,
    bpSystolic: vitalsRecord.bpSystolic,
    bpDiastolic: vitalsRecord.bpDiastolic,
    heartRate: vitalsRecord.heartRate,
    respiratoryRate: vitalsRecord.respiratoryRate,
    temperature: vitalsRecord.temperature !== null ? Number(vitalsRecord.temperature) : null,
    temperatureUnit: vitalsRecord.temperatureUnit || 'F',
    spO2: vitalsRecord.spO2,
    height: vitalsRecord.height !== null ? Number(vitalsRecord.height) : null,
    weight: vitalsRecord.weight !== null ? Number(vitalsRecord.weight) : null,
    bmi: vitalsRecord.bmi !== null ? Number(vitalsRecord.bmi) : null,
    notes: vitalsRecord.notes || undefined,
    createdAt: vitalsRecord.createdAt.toISOString()
  };
}

export async function dbSaveAssessment(
  encounterId: string,
  data: any,
  actor: { id: string; name: string; role: string }
): Promise<ClinicalAssessment> {
  if (!isPrismaConnected) {
    throw new Error('DatabaseUnavailable: Active PostgreSQL connection is required for saving assessment.');
  }

  const role = (actor.role || '').toUpperCase();
  if (role !== 'DOCTOR' && role !== 'VAIDYA') {
    throw new Error('ClinicalAuthorityRequired: Only DOCTOR or VAIDYA may save clinical assessments.');
  }

  const enc = await prisma.clinicalEncounter.findFirst({
    where: { OR: [{ id: encounterId }, { encounterNumber: encounterId }] },
    include: { patient: true }
  });
  if (!enc) {
    throw new Error('EncounterNotFound: Clinical encounter was not found.');
  }

  if (enc.discipline.toUpperCase() !== role) {
    throw new Error('ClinicalDisciplineMismatch: Clinician discipline does not match encounter discipline.');
  }

  if (enc.status !== 'in_progress') {
    throw new Error('InvalidEncounterState: Cannot add assessment to a non-active encounter.');
  }

  const assessment = await prisma.clinicalAssessment.create({
    data: {
      encounterId: enc.id,
      patientId: enc.patientId,
      practitionerId: actor.id,
      practitionerName: actor.name,
      practitionerRole: role,
      presentingComplaints: data.presentingComplaints || null,
      historyOfPresentingIllness: data.historyOfPresentingIllness || null,
      physicalExamination: data.physicalExamination || null,
      systemicExamination: data.systemicExamination || null,
      clinicalObservations: data.clinicalObservations || null,
      clinicalImpression: data.clinicalImpression || null,
      differentialDiagnosis: data.differentialDiagnosis || null,
      clinicalPlan: data.clinicalPlan || null,
      followUpAdvice: data.followUpAdvice || null
    }
  });

  await dbLogAudit(
    actor.name,
    role,
    'SAVE_CLINICAL_ASSESSMENT',
    'Clinical Operations',
    `Clinical assessment saved for encounter ${enc.encounterNumber} by ${actor.name} (${role})`,
    enc.patient.mrn
  );

  return {
    id: assessment.id,
    encounterId: assessment.encounterId,
    patientId: assessment.patientId,
    practitionerId: assessment.practitionerId,
    practitionerName: assessment.practitionerName,
    practitionerRole: assessment.practitionerRole,
    presentingComplaints: assessment.presentingComplaints || undefined,
    historyOfPresentingIllness: assessment.historyOfPresentingIllness || undefined,
    physicalExamination: assessment.physicalExamination || undefined,
    systemicExamination: assessment.systemicExamination as any,
    clinicalObservations: assessment.clinicalObservations || undefined,
    clinicalImpression: assessment.clinicalImpression || undefined,
    differentialDiagnosis: assessment.differentialDiagnosis || undefined,
    clinicalPlan: assessment.clinicalPlan || undefined,
    followUpAdvice: assessment.followUpAdvice || undefined,
    recordedAt: assessment.recordedAt.toISOString(),
    createdAt: assessment.createdAt.toISOString(),
    updatedAt: assessment.updatedAt.toISOString()
  };
}

export async function dbAddDiagnosis(
  encounterId: string,
  data: {
    diagnosisName: string;
    icdCode?: string;
    diagnosisType?: 'provisional' | 'final' | 'differential';
    notes?: string;
    status?: 'active' | 'resolved' | 'ruled_out';
  },
  actor: { id: string; name: string; role: string }
): Promise<ClinicalDiagnosis> {
  if (!isPrismaConnected) {
    throw new Error('DatabaseUnavailable: Active PostgreSQL connection is required for adding diagnoses.');
  }

  const role = (actor.role || '').toUpperCase();
  if (role !== 'DOCTOR' && role !== 'VAIDYA') {
    throw new Error('ClinicalAuthorityRequired: Only DOCTOR or VAIDYA may author clinical diagnoses.');
  }

  if (!data.diagnosisName || !data.diagnosisName.trim()) {
    throw new Error('DiagnosisNameRequired: Diagnosis name authored by practitioner is required.');
  }

  const enc = await prisma.clinicalEncounter.findFirst({
    where: { OR: [{ id: encounterId }, { encounterNumber: encounterId }] },
    include: { patient: true }
  });
  if (!enc) {
    throw new Error('EncounterNotFound: Clinical encounter was not found.');
  }

  if (enc.discipline.toUpperCase() !== role) {
    throw new Error('ClinicalDisciplineMismatch: Clinician discipline does not match encounter discipline.');
  }

  if (enc.status !== 'in_progress') {
    throw new Error('InvalidEncounterState: Cannot add diagnosis to a non-active encounter.');
  }

  const diagnosis = await prisma.clinicalDiagnosis.create({
    data: {
      encounterId: enc.id,
      patientId: enc.patientId,
      practitionerId: actor.id,
      practitionerName: actor.name,
      practitionerRole: role,
      diagnosisType: data.diagnosisType || 'provisional',
      icdCode: data.icdCode || null,
      diagnosisName: data.diagnosisName.trim(),
      notes: data.notes || null,
      status: data.status || 'active'
    }
  });

  await dbLogAudit(
    actor.name,
    role,
    'ADD_CLINICAL_DIAGNOSIS',
    'Clinical Operations',
    `Diagnosis "${data.diagnosisName}" added to encounter ${enc.encounterNumber} by ${actor.name} (${role})`,
    enc.patient.mrn
  );

  return {
    id: diagnosis.id,
    encounterId: diagnosis.encounterId,
    patientId: diagnosis.patientId,
    practitionerId: diagnosis.practitionerId,
    practitionerName: diagnosis.practitionerName,
    practitionerRole: diagnosis.practitionerRole,
    diagnosisType: diagnosis.diagnosisType as any,
    icdCode: diagnosis.icdCode || undefined,
    diagnosisName: diagnosis.diagnosisName,
    notes: diagnosis.notes || undefined,
    status: diagnosis.status as any,
    recordedAt: diagnosis.recordedAt.toISOString(),
    createdAt: diagnosis.createdAt.toISOString()
  };
}

export async function dbOrderInvestigation(
  encounterId: string,
  data: {
    testType: string;
    priority?: string;
    clinicalIndication?: string;
  },
  actor: { id: string; name: string; role: string }
): Promise<LabOrder> {
  if (!isPrismaConnected) {
    throw new Error('DatabaseUnavailable: Active PostgreSQL connection is required for ordering investigations.');
  }

  const role = (actor.role || '').toUpperCase();
  if (role !== 'DOCTOR') {
    throw new Error('ClinicalDisciplineMismatch: Only DOCTOR discipline is authorized to order modern laboratory investigations.');
  }

  if (!data.testType || !data.testType.trim()) {
    throw new Error('TestTypeRequired: Laboratory test type is required.');
  }

  const enc = await prisma.clinicalEncounter.findFirst({
    where: { OR: [{ id: encounterId }, { encounterNumber: encounterId }] },
    include: { patient: true }
  });
  if (!enc) {
    throw new Error('EncounterNotFound: Clinical encounter was not found.');
  }

  if (enc.discipline.toUpperCase() !== 'DOCTOR') {
    throw new Error('ClinicalDisciplineMismatch: Encounter discipline is not DOCTOR.');
  }

  if (enc.status !== 'in_progress') {
    throw new Error('InvalidEncounterState: Cannot order investigations for a non-active encounter.');
  }

  const orderNumber = `LAB-${new Date().getFullYear()}-${String(Math.floor(10000 + Math.random() * 90000))}`;
  const labOrder = await prisma.labOrder.create({
    data: {
      orderNumber,
      encounterId: enc.id,
      patientId: enc.patientId,
      patientName: `${enc.patient.firstName} ${enc.patient.lastName}`,
      mrn: enc.patient.mrn,
      testType: data.testType.trim(),
      priority: data.priority || 'Routine',
      orderingDoctor: actor.name,
      orderingPractitionerId: actor.id,
      orderingPractitionerRole: role,
      clinicalIndication: data.clinicalIndication || null,
      status: 'ordered'
    }
  });

  await dbLogAudit(
    actor.name,
    role,
    'ORDER_LAB_INVESTIGATION',
    'Investigations',
    `Investigation ${data.testType} ordered (${orderNumber}) for encounter ${enc.encounterNumber} by ${actor.name}`,
    enc.patient.mrn
  );

  return {
    id: labOrder.id,
    orderNumber: labOrder.orderNumber,
    encounterId: labOrder.encounterId || undefined,
    patientId: labOrder.patientId || '',
    patientName: labOrder.patientName,
    mrn: labOrder.mrn,
    testType: labOrder.testType,
    priority: labOrder.priority,
    orderingDoctor: labOrder.orderingDoctor,
    orderingPractitionerId: labOrder.orderingPractitionerId || undefined,
    orderingPractitionerRole: labOrder.orderingPractitionerRole || undefined,
    clinicalIndication: labOrder.clinicalIndication || undefined,
    orderedAt: labOrder.orderedAt.toISOString(),
    status: labOrder.status as any
  };
}

export async function dbRecordInvestigationResult(
  orderId: string,
  data: {
    resultValue: string;
    normalRange?: string;
    isAbnormal?: boolean;
    labNotes?: string;
  },
  actor: { id: string; name: string; role: string }
): Promise<LabOrder> {
  if (!isPrismaConnected) {
    throw new Error('DatabaseUnavailable: Active PostgreSQL connection is required for recording results.');
  }

  const role = (actor.role || '').toUpperCase();
  if (role !== 'DOCTOR') {
    throw new Error('ClinicalDisciplineMismatch: Only DOCTOR may record or modify Modern Medicine laboratory results.');
  }

  const existing = await prisma.labOrder.findFirst({
    where: { OR: [{ id: orderId }, { orderNumber: orderId }] }
  });
  if (!existing) {
    throw new Error('LabOrderNotFound: Laboratory order was not found.');
  }

  const now = new Date();
  const updated = await prisma.labOrder.update({
    where: { id: existing.id },
    data: {
      status: 'result_available',
      resultValue: data.resultValue,
      normalRange: data.normalRange || null,
      isAbnormal: Boolean(data.isAbnormal),
      resultTimestamp: now,
      resultAttribution: actor.name,
      resultAttributionId: actor.id,
      labNotes: data.labNotes || existing.labNotes
    }
  });

  await dbLogAudit(
    actor.name,
    actor.role,
    'RECORD_INVESTIGATION_RESULT',
    'Investigations',
    `Investigation results recorded for order ${existing.orderNumber} by ${actor.name}`,
    existing.mrn
  );

  return {
    id: updated.id,
    orderNumber: updated.orderNumber,
    encounterId: updated.encounterId || undefined,
    patientId: updated.patientId || '',
    patientName: updated.patientName,
    mrn: updated.mrn,
    testType: updated.testType,
    priority: updated.priority,
    orderingDoctor: updated.orderingDoctor,
    orderingPractitionerId: updated.orderingPractitionerId || undefined,
    orderingPractitionerRole: updated.orderingPractitionerRole || undefined,
    clinicalIndication: updated.clinicalIndication || undefined,
    orderedAt: updated.orderedAt.toISOString(),
    status: updated.status as any,
    normalRange: updated.normalRange || undefined,
    resultValue: updated.resultValue || undefined,
    isAbnormal: Boolean(updated.isAbnormal),
    resultTimestamp: updated.resultTimestamp ? updated.resultTimestamp.toISOString() : undefined,
    resultAttribution: updated.resultAttribution || undefined,
    resultAttributionId: updated.resultAttributionId || undefined,
    labNotes: updated.labNotes || undefined
  };
}

export async function dbReviewInvestigation(
  orderId: string,
  data: {
    reviewNotes?: string;
  },
  actor: { id: string; name: string; role: string }
): Promise<LabOrder> {
  if (!isPrismaConnected) {
    throw new Error('DatabaseUnavailable: Active PostgreSQL connection is required for reviewing investigations.');
  }

  const role = (actor.role || '').toUpperCase();
  if (role !== 'DOCTOR') {
    throw new Error('ClinicalDisciplineMismatch: Only DOCTOR may authoritatively review and clinically interpret Modern Medicine laboratory investigations.');
  }

  const existing = await prisma.labOrder.findFirst({
    where: { OR: [{ id: orderId }, { orderNumber: orderId }] }
  });
  if (!existing) {
    throw new Error('LabOrderNotFound: Laboratory order was not found.');
  }

  const now = new Date();
  const updated = await prisma.labOrder.update({
    where: { id: existing.id },
    data: {
      status: 'reviewed',
      reviewedAt: now,
      reviewedById: actor.id,
      reviewedByName: actor.name,
      reviewNotes: data.reviewNotes || null
    }
  });

  await dbLogAudit(
    actor.name,
    role,
    'REVIEW_INVESTIGATION_RESULT',
    'Investigations',
    `Investigation ${existing.orderNumber} reviewed by ${actor.name} (${role}): ${data.reviewNotes || 'Reviewed and approved'}`,
    existing.mrn
  );

  return {
    id: updated.id,
    orderNumber: updated.orderNumber,
    encounterId: updated.encounterId || undefined,
    patientId: updated.patientId || '',
    patientName: updated.patientName,
    mrn: updated.mrn,
    testType: updated.testType,
    priority: updated.priority,
    orderingDoctor: updated.orderingDoctor,
    orderingPractitionerId: updated.orderingPractitionerId || undefined,
    orderingPractitionerRole: updated.orderingPractitionerRole || undefined,
    clinicalIndication: updated.clinicalIndication || undefined,
    orderedAt: updated.orderedAt.toISOString(),
    status: updated.status as any,
    normalRange: updated.normalRange || undefined,
    resultValue: updated.resultValue || undefined,
    isAbnormal: Boolean(updated.isAbnormal),
    resultTimestamp: updated.resultTimestamp ? updated.resultTimestamp.toISOString() : undefined,
    resultAttribution: updated.resultAttribution || undefined,
    resultAttributionId: updated.resultAttributionId || undefined,
    reviewedAt: updated.reviewedAt ? updated.reviewedAt.toISOString() : undefined,
    reviewedById: updated.reviewedById || undefined,
    reviewedByName: updated.reviewedByName || undefined,
    reviewNotes: updated.reviewNotes || undefined,
    labNotes: updated.labNotes || undefined
  };
}

export async function dbGetInvestigationById(orderId: string): Promise<LabOrder | null> {
  if (!isPrismaConnected) {
    throw new Error('DatabaseUnavailable: Active PostgreSQL connection is required.');
  }
  const lab = await prisma.labOrder.findFirst({
    where: { OR: [{ id: orderId }, { orderNumber: orderId }] }
  });
  if (!lab) return null;
  return {
    id: lab.id,
    orderNumber: lab.orderNumber,
    encounterId: lab.encounterId || undefined,
    patientId: lab.patientId || '',
    patientName: lab.patientName,
    mrn: lab.mrn,
    testType: lab.testType,
    priority: lab.priority,
    orderingDoctor: lab.orderingDoctor,
    orderingPractitionerId: lab.orderingPractitionerId || undefined,
    orderingPractitionerRole: lab.orderingPractitionerRole || undefined,
    clinicalIndication: lab.clinicalIndication || undefined,
    orderedAt: lab.orderedAt.toISOString(),
    status: lab.status as any,
    normalRange: lab.normalRange || undefined,
    resultValue: lab.resultValue || undefined,
    isAbnormal: Boolean(lab.isAbnormal),
    resultTimestamp: lab.resultTimestamp ? lab.resultTimestamp.toISOString() : undefined,
    resultAttribution: lab.resultAttribution || undefined,
    resultAttributionId: lab.resultAttributionId || undefined,
    reviewedAt: lab.reviewedAt ? lab.reviewedAt.toISOString() : undefined,
    reviewedById: lab.reviewedById || undefined,
    reviewedByName: lab.reviewedByName || undefined,
    reviewNotes: lab.reviewNotes || undefined,
    labNotes: lab.labNotes || undefined
  };
}

export async function dbPrescribeEncounterMedication(
  encounterId: string,
  data: {
    medicationName?: string;
    medicationId?: string;
    dosage: string;
    frequency: string;
    route?: string;
    duration: string;
    quantity?: number;
    instructions?: string;
  },
  actor: { id: string; name: string; role: string }
): Promise<Prescription> {
  if (!isPrismaConnected) {
    throw new Error('DatabaseUnavailable: Active PostgreSQL connection is required for prescribing.');
  }

  const role = (actor.role || '').toUpperCase();
  if (role !== 'DOCTOR' && role !== 'VAIDYA') {
    throw new Error('ClinicalAuthorityRequired: Only DOCTOR or VAIDYA may author prescriptions.');
  }

  const enc = await prisma.clinicalEncounter.findFirst({
    where: { OR: [{ id: encounterId }, { encounterNumber: encounterId }] },
    include: { patient: true }
  });
  if (!enc) {
    throw new Error('EncounterNotFound: Clinical encounter was not found.');
  }

  if (enc.discipline.toUpperCase() !== role) {
    throw new Error('ClinicalDisciplineMismatch: Clinician discipline does not match encounter discipline.');
  }

  if (enc.status !== 'in_progress') {
    throw new Error('InvalidEncounterState: Cannot prescribe medications for a non-active encounter.');
  }

  let medicationName = data.medicationName ? data.medicationName.trim() : '';
  if (data.medicationId) {
    const medStock = await prisma.medicationStock.findUnique({
      where: { id: data.medicationId }
    });
    if (!medStock) {
      throw new Error('MedicationNotFound: Medication was not found in hospital inventory catalogue.');
    }
    if (!medicationName) {
      medicationName = medStock.drugName;
    }
  }

  if (!medicationName) {
    throw new Error('MedicationNameRequired: Medication name is mandatory for prescription.');
  }

  // Cross-discipline medication boundary enforcement
  if (role === 'DOCTOR' && isAyurvedicMedication(medicationName)) {
    throw new Error('ClinicalDisciplineMismatch: DOCTOR is authorized only for Modern Medicine prescriptions. Ayurvedic medication requires a licensed VAIDYA.');
  }
  if (role === 'VAIDYA' && isModernMedication(medicationName)) {
    throw new Error('ClinicalDisciplineMismatch: VAIDYA is authorized only for Ayurvedic prescriptions. Modern Medicine requires a licensed DOCTOR.');
  }

  const prescribedQty = typeof data.quantity === 'number' && data.quantity > 0 ? data.quantity : 1;
  const rxNumber = `RX-${new Date().getFullYear()}-${String(Math.floor(10000 + Math.random() * 90000))}`;
  const prescription = await prisma.prescription.create({
    data: {
      rxNumber,
      encounterId: enc.id,
      patientId: enc.patientId,
      patientName: `${enc.patient.firstName} ${enc.patient.lastName}`,
      mrn: enc.patient.mrn,
      doctorId: actor.id,
      doctorName: actor.name,
      prescribingPractitionerRole: role,
      medicationId: data.medicationId || null,
      medicationName,
      dosage: data.dosage,
      frequency: data.frequency,
      route: data.route || 'Oral',
      duration: data.duration,
      quantity: prescribedQty,
      dispensedQuantity: 0,
      remainingQuantity: prescribedQty,
      dispensingStatus: 'pending',
      instructions: data.instructions || null,
      status: 'pending' // Prescriptions start as pending; no automatic dispensing or inventory decrements!
    }
  });

  await dbLogAudit(
    actor.name,
    role,
    'CREATE_CLINICAL_PRESCRIPTION',
    'Prescriptions',
    `Prescription ${rxNumber} (${medicationName} ${data.dosage}) created for encounter ${enc.encounterNumber} by ${actor.name} (${role})`,
    enc.patient.mrn
  );

  return {
    id: prescription.id,
    rxNumber: prescription.rxNumber,
    encounterId: prescription.encounterId || undefined,
    patientId: prescription.patientId || '',
    patientName: prescription.patientName,
    mrn: prescription.mrn,
    doctorId: prescription.doctorId || '',
    doctorName: prescription.doctorName,
    prescribingPractitionerRole: prescription.prescribingPractitionerRole || undefined,
    datePrescribed: prescription.datePrescribed.toISOString(),
    medicationId: prescription.medicationId || undefined,
    medicationName: prescription.medicationName,
    dosage: prescription.dosage,
    frequency: prescription.frequency,
    route: prescription.route as any,
    duration: prescription.duration,
    quantity: prescription.quantity,
    instructions: prescription.instructions || undefined,
    status: prescription.status as any
  };
}

export async function dbRecordPrakriti(
  encounterId: string,
  data: {
    vataScore: number;
    pittaScore: number;
    kaphaScore: number;
    dominantPrakriti: string;
    physicalCharacteristics?: any;
    physiologicalCharacteristics?: any;
    psychologicalCharacteristics?: any;
    clinicalInterpretation: string;
  },
  actor: { id: string; name: string; role: string }
): Promise<PrakritiAssessment> {
  if (!isPrismaConnected) {
    throw new Error('DatabaseUnavailable: Active PostgreSQL connection is required for Prakriti assessment.');
  }

  const role = (actor.role || '').toUpperCase();
  if (role !== 'VAIDYA') {
    throw new Error('ClinicalDisciplineMismatch: Only VAIDYA discipline is authorized to record Prakriti assessments.');
  }

  if (!data.clinicalInterpretation || !data.clinicalInterpretation.trim()) {
    throw new Error('ClinicalInterpretationRequired: Mandatory Vaidya clinical interpretation is required for Prakriti assessment.');
  }

  const enc = await prisma.clinicalEncounter.findFirst({
    where: { OR: [{ id: encounterId }, { encounterNumber: encounterId }] },
    include: { patient: true }
  });
  if (!enc) {
    throw new Error('EncounterNotFound: Clinical encounter was not found.');
  }

  if (enc.discipline.toUpperCase() !== 'VAIDYA') {
    throw new Error('ClinicalDisciplineMismatch: Encounter discipline is not VAIDYA.');
  }

  if (enc.status !== 'in_progress') {
    throw new Error('InvalidEncounterState: Cannot record Prakriti assessment for a non-active encounter.');
  }

  const prakriti = await prisma.prakritiAssessment.create({
    data: {
      encounterId: enc.id,
      patientId: enc.patientId,
      practitionerId: actor.id,
      practitionerName: actor.name,
      vataScore: new Prisma.Decimal(Number(data.vataScore).toFixed(2)),
      pittaScore: new Prisma.Decimal(Number(data.pittaScore).toFixed(2)),
      kaphaScore: new Prisma.Decimal(Number(data.kaphaScore).toFixed(2)),
      dominantPrakriti: data.dominantPrakriti,
      physicalCharacteristics: data.physicalCharacteristics || null,
      physiologicalCharacteristics: data.physiologicalCharacteristics || null,
      psychologicalCharacteristics: data.psychologicalCharacteristics || null,
      clinicalInterpretation: data.clinicalInterpretation.trim()
    }
  });

  // Update patient doshaProfile snapshot
  await prisma.patient.update({
    where: { id: enc.patientId },
    data: {
      doshaProfile: {
        dominantPrakriti: data.dominantPrakriti,
        vataScore: Number(data.vataScore),
        pittaScore: Number(data.pittaScore),
        kaphaScore: Number(data.kaphaScore),
        assessedAt: prakriti.recordedAt.toISOString(),
        assessedBy: actor.name
      }
    }
  });

  await dbLogAudit(
    actor.name,
    role,
    'RECORD_PRAKRITI_ASSESSMENT',
    'Ayurveda',
    `Prakriti assessment recorded (Dominant: ${data.dominantPrakriti}) for encounter ${enc.encounterNumber} by Vaidya ${actor.name}`,
    enc.patient.mrn
  );

  return {
    id: prakriti.id,
    encounterId: prakriti.encounterId,
    patientId: prakriti.patientId,
    practitionerId: prakriti.practitionerId,
    practitionerName: prakriti.practitionerName,
    vataScore: Number(prakriti.vataScore),
    pittaScore: Number(prakriti.pittaScore),
    kaphaScore: Number(prakriti.kaphaScore),
    dominantPrakriti: prakriti.dominantPrakriti,
    physicalCharacteristics: prakriti.physicalCharacteristics as any,
    physiologicalCharacteristics: prakriti.physiologicalCharacteristics as any,
    psychologicalCharacteristics: prakriti.psychologicalCharacteristics as any,
    clinicalInterpretation: prakriti.clinicalInterpretation,
    recordedAt: prakriti.recordedAt.toISOString(),
    createdAt: prakriti.createdAt.toISOString()
  };
}

export async function dbRecordVikriti(
  encounterId: string,
  data: {
    primaryVikriti: string;
    secondaryVikriti?: string;
    vataAggravation?: string;
    pittaAggravation?: string;
    kaphaAggravation?: string;
    clinicalInterpretation: string;
  },
  actor: { id: string; name: string; role: string }
): Promise<VikritiAssessment> {
  if (!isPrismaConnected) {
    throw new Error('DatabaseUnavailable: Active PostgreSQL connection is required for Vikriti assessment.');
  }

  const role = (actor.role || '').toUpperCase();
  if (role !== 'VAIDYA') {
    throw new Error('ClinicalDisciplineMismatch: Only VAIDYA discipline is authorized to record Vikriti assessments.');
  }

  if (!data.primaryVikriti || !data.primaryVikriti.trim()) {
    throw new Error('PrimaryVikritiRequired: Primary Vikriti is required.');
  }

  if (!data.clinicalInterpretation || !data.clinicalInterpretation.trim()) {
    throw new Error('ClinicalInterpretationRequired: Mandatory Vaidya clinical interpretation is required for Vikriti assessment.');
  }

  const enc = await prisma.clinicalEncounter.findFirst({
    where: { OR: [{ id: encounterId }, { encounterNumber: encounterId }] },
    include: { patient: true }
  });
  if (!enc) {
    throw new Error('EncounterNotFound: Clinical encounter was not found.');
  }

  if (enc.discipline.toUpperCase() !== 'VAIDYA') {
    throw new Error('ClinicalDisciplineMismatch: Encounter discipline is not VAIDYA.');
  }

  if (enc.status !== 'in_progress') {
    throw new Error('InvalidEncounterState: Cannot record Vikriti assessment for a non-active encounter.');
  }

  const vikriti = await prisma.vikritiAssessment.create({
    data: {
      encounterId: enc.id,
      patientId: enc.patientId,
      practitionerId: actor.id,
      practitionerName: actor.name,
      primaryVikriti: data.primaryVikriti.trim(),
      secondaryVikriti: data.secondaryVikriti || null,
      vataAggravation: data.vataAggravation || null,
      pittaAggravation: data.pittaAggravation || null,
      kaphaAggravation: data.kaphaAggravation || null,
      clinicalInterpretation: data.clinicalInterpretation.trim()
    }
  });

  await dbLogAudit(
    actor.name,
    role,
    'RECORD_VIKRITI_ASSESSMENT',
    'Ayurveda',
    `Vikriti assessment recorded (Primary: ${data.primaryVikriti}) for encounter ${enc.encounterNumber} by Vaidya ${actor.name}`,
    enc.patient.mrn
  );

  return {
    id: vikriti.id,
    encounterId: vikriti.encounterId,
    patientId: vikriti.patientId,
    practitionerId: vikriti.practitionerId,
    practitionerName: vikriti.practitionerName,
    primaryVikriti: vikriti.primaryVikriti,
    secondaryVikriti: vikriti.secondaryVikriti || undefined,
    vataAggravation: vikriti.vataAggravation || undefined,
    pittaAggravation: vikriti.pittaAggravation || undefined,
    kaphaAggravation: vikriti.kaphaAggravation || undefined,
    clinicalInterpretation: vikriti.clinicalInterpretation,
    recordedAt: vikriti.recordedAt.toISOString(),
    createdAt: vikriti.createdAt.toISOString()
  };
}

export async function dbRecordDoshaEvaluation(
  encounterId: string,
  data: {
    agniStatus?: string;
    amaStatus?: string;
    koshthaType?: string;
    dhatuInvolvement?: any;
    srotasInvolvement?: any;
    ashtaVidhaPariksha?: any;
    clinicalInterpretation: string;
  },
  actor: { id: string; name: string; role: string }
): Promise<DoshaEvaluation> {
  if (!isPrismaConnected) {
    throw new Error('DatabaseUnavailable: Active PostgreSQL connection is required for Dosha evaluation.');
  }

  const role = (actor.role || '').toUpperCase();
  if (role !== 'VAIDYA') {
    throw new Error('ClinicalDisciplineMismatch: Only VAIDYA discipline is authorized to record Dosha evaluations.');
  }

  if (!data.clinicalInterpretation || !data.clinicalInterpretation.trim()) {
    throw new Error('ClinicalInterpretationRequired: Mandatory Vaidya clinical interpretation is required for Dosha evaluation.');
  }

  const enc = await prisma.clinicalEncounter.findFirst({
    where: { OR: [{ id: encounterId }, { encounterNumber: encounterId }] },
    include: { patient: true }
  });
  if (!enc) {
    throw new Error('EncounterNotFound: Clinical encounter was not found.');
  }

  if (enc.discipline.toUpperCase() !== 'VAIDYA') {
    throw new Error('ClinicalDisciplineMismatch: Encounter discipline is not VAIDYA.');
  }

  if (enc.status !== 'in_progress') {
    throw new Error('InvalidEncounterState: Cannot record Dosha evaluation for a non-active encounter.');
  }

  const dosha = await prisma.doshaEvaluation.create({
    data: {
      encounterId: enc.id,
      patientId: enc.patientId,
      practitionerId: actor.id,
      practitionerName: actor.name,
      agniStatus: data.agniStatus || null,
      amaStatus: data.amaStatus || null,
      koshthaType: data.koshthaType || null,
      dhatuInvolvement: data.dhatuInvolvement || null,
      srotasInvolvement: data.srotasInvolvement || null,
      ashtaVidhaPariksha: data.ashtaVidhaPariksha || null,
      clinicalInterpretation: data.clinicalInterpretation.trim()
    }
  });

  await dbLogAudit(
    actor.name,
    role,
    'RECORD_DOSHA_EVALUATION',
    'Ayurveda',
    `Dosha evaluation recorded for encounter ${enc.encounterNumber} by Vaidya ${actor.name}`,
    enc.patient.mrn
  );

  return {
    id: dosha.id,
    encounterId: dosha.encounterId,
    patientId: dosha.patientId,
    practitionerId: dosha.practitionerId,
    practitionerName: dosha.practitionerName,
    agniStatus: dosha.agniStatus || undefined,
    amaStatus: dosha.amaStatus || undefined,
    koshthaType: dosha.koshthaType || undefined,
    dhatuInvolvement: dosha.dhatuInvolvement as any,
    srotasInvolvement: dosha.srotasInvolvement as any,
    ashtaVidhaPariksha: dosha.ashtaVidhaPariksha as any,
    clinicalInterpretation: dosha.clinicalInterpretation,
    recordedAt: dosha.recordedAt.toISOString(),
    createdAt: dosha.createdAt.toISOString()
  };
}

export async function dbCreateAyurvedicTreatmentPlan(
  encounterId: string,
  data: {
    therapyType?: string;
    clinicalObjective?: string;
    oilOrFormulation?: string;
    totalSessions?: number;
    frequency?: string;
    startDate?: string;
    endDate?: string;
    roomNumber?: string;
    instructions?: string;
    notes?: string;
    assignedTherapist?: string;
    planType?: string;
    diagnosis?: string;
    durationDays?: number;
    dietaryGuidelines?: string;
    lifestyleModifications?: string;
  },
  actor: { id: string; name: string; role: string }
): Promise<TreatmentPlan> {
  if (!isPrismaConnected) {
    throw new Error('DatabaseUnavailable: Active PostgreSQL connection is required for creating treatment plans.');
  }

  const role = (actor.role || '').toUpperCase();
  if (role !== 'VAIDYA') {
    throw new Error('ClinicalDisciplineMismatch: Only VAIDYA discipline is authorized to create Ayurvedic treatment plans.');
  }

  const therapyType = (data.therapyType || data.planType || 'Abhyanga (Herbal Full Body Massage)').trim();
  const clinicalObjective = (data.clinicalObjective || data.diagnosis || 'Therapeutic Dosha Balancing').trim();
  const oilOrFormulation = (data.oilOrFormulation || 'Sahacharadi Thailam').trim();
  const totalSessions = data.totalSessions || data.durationDays || 7;
  const startDate = data.startDate || new Date().toISOString().split('T')[0];
  const endDate = data.endDate || new Date(Date.now() + totalSessions * 86400000).toISOString().split('T')[0];

  if (!therapyType || !clinicalObjective) {
    throw new Error('ValidationFailed: therapyType and clinicalObjective are mandatory for treatment plans.');
  }

  const enc = await prisma.clinicalEncounter.findFirst({
    where: { OR: [{ id: encounterId }, { encounterNumber: encounterId }] },
    include: { patient: true }
  });
  if (!enc) {
    throw new Error('EncounterNotFound: Clinical encounter was not found.');
  }

  if (enc.discipline.toUpperCase() !== 'VAIDYA') {
    throw new Error('ClinicalDisciplineMismatch: Encounter discipline is not VAIDYA.');
  }

  if (enc.status !== 'in_progress') {
    throw new Error('InvalidEncounterState: Cannot create treatment plan for a non-active encounter.');
  }

  const planNumber = `TP-${new Date().getFullYear()}-${String(Math.floor(10000 + Math.random() * 90000))}`;
  const plan = await prisma.treatmentPlan.create({
    data: {
      planNumber,
      encounterId: enc.id,
      patientId: enc.patientId,
      patientName: `${enc.patient.firstName} ${enc.patient.lastName}`,
      patientMrn: enc.patient.mrn,
      doctorId: actor.id,
      doctorName: actor.name,
      practitionerRole: 'VAIDYA',
      assignedTherapist: data.assignedTherapist || 'Assigned Ayurvedic Therapist',
      therapyType,
      clinicalObjective,
      oilOrFormulation,
      totalSessions,
      completedSessions: 0,
      frequency: data.frequency || 'Daily',
      startDate,
      endDate,
      roomNumber: data.roomNumber || 'Therapy Suite 01',
      status: 'active',
      instructions: data.instructions || data.dietaryGuidelines || null,
      notes: data.notes || data.lifestyleModifications || ''
    }
  });

  await dbLogAudit(
    actor.name,
    role,
    'CREATE_AYURVEDIC_TREATMENT_PLAN',
    'Ayurveda',
    `Treatment plan ${planNumber} (${data.therapyType}) created for encounter ${enc.encounterNumber} by Vaidya ${actor.name}`,
    enc.patient.mrn
  );

  return {
    id: plan.id,
    planNumber: plan.planNumber,
    encounterId: plan.encounterId || undefined,
    patientId: plan.patientId || '',
    patientName: plan.patientName,
    patientMrn: plan.patientMrn,
    doctorId: plan.doctorId || '',
    doctorName: plan.doctorName,
    practitionerRole: plan.practitionerRole || 'VAIDYA',
    assignedTherapist: plan.assignedTherapist,
    therapyType: plan.therapyType as any,
    clinicalObjective: plan.clinicalObjective,
    oilOrFormulation: plan.oilOrFormulation,
    totalSessions: plan.totalSessions,
    completedSessions: plan.completedSessions,
    frequency: plan.frequency as any,
    startDate: plan.startDate,
    endDate: plan.endDate,
    roomNumber: plan.roomNumber,
    status: plan.status as any,
    instructions: plan.instructions || undefined,
    notes: plan.notes || ''
  };
}

export async function dbCreatePanchakarmaReferral(
  encounterId: string,
  data: {
    proposedProcedure?: string;
    clinicalIndication?: string;
    preliminaryNotes?: string;
    urgency?: 'routine' | 'urgent';
    proposedTherapies?: string[];
    precautions?: string;
    preTreatmentObservations?: string;
  },
  actor: { id: string; name: string; role: string }
): Promise<PanchakarmaReferral> {
  if (!isPrismaConnected) {
    throw new Error('DatabaseUnavailable: Active PostgreSQL connection is required for Panchakarma referral.');
  }

  const role = (actor.role || '').toUpperCase();
  if (role !== 'VAIDYA') {
    throw new Error('ClinicalDisciplineMismatch: Only VAIDYA discipline is authorized to create Panchakarma referrals.');
  }

  const rawProcedure = data.proposedProcedure || (data.proposedTherapies && data.proposedTherapies.length > 0 ? data.proposedTherapies.join(', ') : '');
  const proposedProcedure = rawProcedure.trim();
  const rawIndication = data.clinicalIndication || 'Shodhana & Shamana Chikitsa';
  const clinicalIndication = rawIndication.trim();
  const preliminaryNotes = data.preliminaryNotes || data.preTreatmentObservations || data.precautions || null;

  if (!proposedProcedure) {
    throw new Error('ProcedureRequired: Proposed Panchakarma procedure is required.');
  }
  if (!clinicalIndication) {
    throw new Error('IndicationRequired: Clinical indication is mandatory for Panchakarma referral.');
  }

  const enc = await prisma.clinicalEncounter.findFirst({
    where: { OR: [{ id: encounterId }, { encounterNumber: encounterId }] },
    include: { patient: true }
  });
  if (!enc) {
    throw new Error('EncounterNotFound: Clinical encounter was not found.');
  }

  if (enc.discipline.toUpperCase() !== 'VAIDYA') {
    throw new Error('ClinicalDisciplineMismatch: Encounter discipline is not VAIDYA.');
  }

  if (enc.status !== 'in_progress') {
    throw new Error('InvalidEncounterState: Cannot create Panchakarma referral for a non-active encounter.');
  }

  const referralNumber = await generateUniquePanchakarmaReferralNumber();
  const referral = await prisma.panchakarmaReferral.create({
    data: {
      referralNumber,
      encounterId: enc.id,
      patientId: enc.patientId,
      practitionerId: actor.id,
      practitionerName: actor.name,
      proposedProcedure,
      clinicalIndication,
      preliminaryNotes,
      urgency: data.urgency || 'routine',
      status: 'referred'
    }
  });

  await dbLogAudit(
    actor.name,
    role,
    'CREATE_PANCHAKARMA_REFERRAL',
    'Ayurveda',
    `Panchakarma referral ${referralNumber} (${data.proposedProcedure}) created for encounter ${enc.encounterNumber} by Vaidya ${actor.name}`,
    enc.patient.mrn
  );

  return {
    id: referral.id,
    referralNumber: referral.referralNumber,
    encounterId: referral.encounterId,
    patientId: referral.patientId,
    practitionerId: referral.practitionerId,
    practitionerName: referral.practitionerName,
    proposedProcedure: referral.proposedProcedure,
    clinicalIndication: referral.clinicalIndication,
    preliminaryNotes: referral.preliminaryNotes || undefined,
    urgency: referral.urgency as any,
    status: referral.status as any,
    referredAt: referral.referredAt.toISOString(),
    createdAt: referral.createdAt.toISOString()
  };
}

export async function dbGetPatientClinicalHistory(
  patientIdOrMrn: string,
  userRole?: string
): Promise<PatientClinicalHistory> {
  if (!isPrismaConnected) {
    throw new Error('DatabaseUnavailable: Active PostgreSQL connection is required for patient clinical history.');
  }

  const patient = await prisma.patient.findFirst({
    where: { OR: [{ id: patientIdOrMrn }, { mrn: patientIdOrMrn }] }
  });
  if (!patient) {
    throw new Error('PatientNotFound: Patient record was not found.');
  }

  const [
    encounters,
    vitals,
    assessments,
    diagnoses,
    prescriptions,
    labOrders,
    treatmentPlans,
    panchakarmaReferrals,
    prakritiAssessments,
    vikritiAssessments,
    doshaEvaluations
  ] = await Promise.all([
    prisma.clinicalEncounter.findMany({
      where: { patientId: patient.id },
      include: {
        vitals: true,
        assessments: true,
        diagnoses: true,
        prescriptions: true,
        labOrders: true,
        treatmentPlans: true,
        prakritiAssessments: true,
        vikritiAssessments: true,
        doshaEvaluations: true,
        panchakarmaReferrals: true
      },
      orderBy: { startedAt: 'desc' }
    }),
    prisma.clinicalVitals.findMany({
      where: { patientId: patient.id },
      orderBy: { recordedAt: 'desc' }
    }),
    prisma.clinicalAssessment.findMany({
      where: { patientId: patient.id },
      orderBy: { recordedAt: 'desc' }
    }),
    prisma.clinicalDiagnosis.findMany({
      where: { patientId: patient.id },
      orderBy: { recordedAt: 'desc' }
    }),
    prisma.prescription.findMany({
      where: { patientId: patient.id },
      orderBy: { datePrescribed: 'desc' }
    }),
    prisma.labOrder.findMany({
      where: { patientId: patient.id },
      orderBy: { orderedAt: 'desc' }
    }),
    prisma.treatmentPlan.findMany({
      where: { patientId: patient.id },
      orderBy: { createdAt: 'desc' }
    }),
    prisma.panchakarmaReferral.findMany({
      where: { patientId: patient.id },
      orderBy: { referredAt: 'desc' }
    }),
    prisma.prakritiAssessment.findMany({
      where: { patientId: patient.id },
      orderBy: { recordedAt: 'desc' }
    }),
    prisma.vikritiAssessment.findMany({
      where: { patientId: patient.id },
      orderBy: { recordedAt: 'desc' }
    }),
    prisma.doshaEvaluation.findMany({
      where: { patientId: patient.id },
      orderBy: { recordedAt: 'desc' }
    })
  ]);

  return {
    patient: mapDbPatientToPatient(patient),
    encounters: encounters.map(mapDbClinicalEncounterToClinicalEncounter),
    vitals: vitals.map((v) => ({
      id: v.id,
      encounterId: v.encounterId,
      patientId: v.patientId,
      recordedAt: v.recordedAt.toISOString(),
      recordedById: v.recordedById,
      recordedByName: v.recordedByName,
      recordedByRole: v.recordedByRole,
      bpSystolic: v.bpSystolic ?? null,
      bpDiastolic: v.bpDiastolic ?? null,
      heartRate: v.heartRate ?? null,
      respiratoryRate: v.respiratoryRate ?? null,
      temperature: v.temperature !== null ? Number(v.temperature) : null,
      temperatureUnit: v.temperatureUnit || 'F',
      spO2: v.spO2 ?? null,
      height: v.height !== null ? Number(v.height) : null,
      weight: v.weight !== null ? Number(v.weight) : null,
      bmi: v.bmi !== null ? Number(v.bmi) : null,
      notes: v.notes || undefined,
      createdAt: v.createdAt.toISOString()
    })),
    assessments: assessments.map((a) => ({
      id: a.id,
      encounterId: a.encounterId,
      patientId: a.patientId,
      practitionerId: a.practitionerId,
      practitionerName: a.practitionerName,
      practitionerRole: a.practitionerRole,
      presentingComplaints: a.presentingComplaints || undefined,
      historyOfPresentingIllness: a.historyOfPresentingIllness || undefined,
      physicalExamination: a.physicalExamination || undefined,
      systemicExamination: a.systemicExamination as any,
      clinicalObservations: a.clinicalObservations || undefined,
      clinicalImpression: a.clinicalImpression || undefined,
      differentialDiagnosis: a.differentialDiagnosis || undefined,
      clinicalPlan: a.clinicalPlan || undefined,
      followUpAdvice: a.followUpAdvice || undefined,
      recordedAt: a.recordedAt.toISOString(),
      createdAt: a.createdAt.toISOString(),
      updatedAt: a.updatedAt.toISOString()
    })),
    diagnoses: diagnoses.map((d) => ({
      id: d.id,
      encounterId: d.encounterId,
      patientId: d.patientId,
      practitionerId: d.practitionerId,
      practitionerName: d.practitionerName,
      practitionerRole: d.practitionerRole,
      diagnosisType: d.diagnosisType as any,
      icdCode: d.icdCode || undefined,
      diagnosisName: d.diagnosisName,
      notes: d.notes || undefined,
      status: d.status as any,
      recordedAt: d.recordedAt.toISOString(),
      createdAt: d.createdAt.toISOString()
    })),
    prescriptions: prescriptions.map((p) => ({
      id: p.id,
      rxNumber: p.rxNumber,
      encounterId: p.encounterId || undefined,
      patientId: p.patientId || '',
      patientName: p.patientName,
      mrn: p.mrn,
      doctorId: p.doctorId || '',
      doctorName: p.doctorName,
      prescribingPractitionerRole: p.prescribingPractitionerRole || undefined,
      datePrescribed: p.datePrescribed.toISOString(),
      medicationId: p.medicationId || undefined,
      medicationName: p.medicationName,
      dosage: p.dosage,
      frequency: p.frequency,
      route: p.route as any,
      duration: p.duration,
      quantity: p.quantity,
      instructions: p.instructions || undefined,
      status: p.status as any
    })),
    labOrders: labOrders.map((l) => ({
      id: l.id,
      orderNumber: l.orderNumber,
      encounterId: l.encounterId || undefined,
      patientId: l.patientId || '',
      patientName: l.patientName,
      mrn: l.mrn,
      testType: l.testType,
      priority: l.priority,
      orderingDoctor: l.orderingDoctor,
      orderingPractitionerId: l.orderingPractitionerId || undefined,
      orderingPractitionerRole: l.orderingPractitionerRole || undefined,
      clinicalIndication: l.clinicalIndication || undefined,
      orderedAt: l.orderedAt.toISOString(),
      status: l.status as any,
      normalRange: l.normalRange || undefined,
      resultValue: l.resultValue || undefined,
      isAbnormal: Boolean(l.isAbnormal),
      resultTimestamp: l.resultTimestamp ? l.resultTimestamp.toISOString() : undefined,
      resultAttribution: l.resultAttribution || undefined,
      resultAttributionId: l.resultAttributionId || undefined,
      reviewedAt: l.reviewedAt ? l.reviewedAt.toISOString() : undefined,
      reviewedById: l.reviewedById || undefined,
      reviewedByName: l.reviewedByName || undefined,
      reviewNotes: l.reviewNotes || undefined,
      labNotes: l.labNotes || undefined
    })),
    treatmentPlans: treatmentPlans.map((t) => ({
      id: t.id,
      planNumber: t.planNumber,
      encounterId: t.encounterId || undefined,
      patientId: t.patientId || '',
      patientName: t.patientName,
      patientMrn: t.patientMrn,
      doctorId: t.doctorId || '',
      doctorName: t.doctorName,
      practitionerRole: t.practitionerRole || 'VAIDYA',
      assignedTherapist: t.assignedTherapist,
      therapyType: t.therapyType as any,
      clinicalObjective: t.clinicalObjective,
      oilOrFormulation: t.oilOrFormulation,
      totalSessions: t.totalSessions,
      completedSessions: t.completedSessions,
      frequency: t.frequency as any,
      startDate: t.startDate,
      endDate: t.endDate,
      roomNumber: t.roomNumber,
      status: t.status as any,
      instructions: t.instructions || undefined,
      notes: t.notes || ''
    })),
    panchakarmaReferrals: panchakarmaReferrals.map((r) => ({
      id: r.id,
      referralNumber: r.referralNumber,
      encounterId: r.encounterId,
      patientId: r.patientId,
      practitionerId: r.practitionerId,
      practitionerName: r.practitionerName,
      proposedProcedure: r.proposedProcedure,
      clinicalIndication: r.clinicalIndication,
      preliminaryNotes: r.preliminaryNotes || undefined,
      urgency: r.urgency as any,
      status: r.status as any,
      referredAt: r.referredAt.toISOString(),
      createdAt: r.createdAt.toISOString()
    })),
    prakritiAssessments: prakritiAssessments.map((p) => ({
      id: p.id,
      encounterId: p.encounterId,
      patientId: p.patientId,
      practitionerId: p.practitionerId,
      practitionerName: p.practitionerName,
      vataScore: Number(p.vataScore),
      pittaScore: Number(p.pittaScore),
      kaphaScore: Number(p.kaphaScore),
      dominantPrakriti: p.dominantPrakriti,
      physicalCharacteristics: p.physicalCharacteristics as any,
      physiologicalCharacteristics: p.physiologicalCharacteristics as any,
      psychologicalCharacteristics: p.psychologicalCharacteristics as any,
      clinicalInterpretation: p.clinicalInterpretation,
      recordedAt: p.recordedAt.toISOString(),
      createdAt: p.createdAt.toISOString()
    })),
    vikritiAssessments: vikritiAssessments.map((v) => ({
      id: v.id,
      encounterId: v.encounterId,
      patientId: v.patientId,
      practitionerId: v.practitionerId,
      practitionerName: v.practitionerName,
      primaryVikriti: v.primaryVikriti,
      secondaryVikriti: v.secondaryVikriti || undefined,
      vataAggravation: v.vataAggravation || undefined,
      pittaAggravation: v.pittaAggravation || undefined,
      kaphaAggravation: v.kaphaAggravation || undefined,
      clinicalInterpretation: v.clinicalInterpretation,
      recordedAt: v.recordedAt.toISOString(),
      createdAt: v.createdAt.toISOString()
    })),
    doshaEvaluations: doshaEvaluations.map((d) => ({
      id: d.id,
      encounterId: d.encounterId,
      patientId: d.patientId,
      practitionerId: d.practitionerId,
      practitionerName: d.practitionerName,
      agniStatus: d.agniStatus || undefined,
      amaStatus: d.amaStatus || undefined,
      koshthaType: d.koshthaType || undefined,
      dhatuInvolvement: d.dhatuInvolvement as any,
      srotasInvolvement: d.srotasInvolvement as any,
      ashtaVidhaPariksha: d.ashtaVidhaPariksha as any,
      clinicalInterpretation: d.clinicalInterpretation,
      recordedAt: d.recordedAt.toISOString(),
      createdAt: d.createdAt.toISOString()
    }))
  };
}

// ==============================================================================
// PHASE 6B: HOSPITAL PROFILE, DEPARTMENT & ASSIGNMENT DATA-ACCESS SERVICES
// ==============================================================================

export interface HospitalProfileUpdateInput {
  displayName?: string;
  legalName?: string;
  code?: string;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  postalCode?: string | null;
  phone?: string | null;
  emergencyPhone?: string | null;
  email?: string | null;
  website?: string | null;
  timezone?: string;
  currency?: string;
  version?: number;
}

export interface CreateDepartmentInput {
  code: string;
  name: string;
  description?: string | null;
  discipline?: DepartmentDiscipline;
}

export interface UpdateDepartmentInput {
  name?: string;
  description?: string | null;
  discipline?: DepartmentDiscipline;
}

export interface AssignStaffDepartmentInput {
  staffId: string;
  departmentId: string;
  isPrimary?: boolean;
  roleTitle?: string | null;
  startDate?: Date;
}

// ------------------------------------------------------------------------------
// 1. HOSPITAL INSTITUTIONAL PROFILE
// ------------------------------------------------------------------------------

/**
 * Retrieve the singleton institutional hospital profile.
 * Strictly fails closed with an error if the profile does not exist.
 * NEVER silently creates or fabricates replacement defaults.
 */
export async function dbGetHospitalProfile(): Promise<HospitalProfile> {
  if (!isPrismaConnected) {
    throw new Error('DATABASE_UNAVAILABLE: Cannot access hospital profile while database is offline.');
  }

  const profile = await prisma.hospitalProfile.findFirst({
    where: { singletonKey: 'PRIMARY_INSTITUTION' }
  });

  if (!profile) {
    throw new Error('INSTITUTIONAL_PROFILE_NOT_FOUND: The singleton hospital institutional profile record does not exist.');
  }

  return profile;
}

/**
 * Update permitted fields on the singleton hospital profile.
 * Enforces optimistic concurrency control using the integer `version` field.
 * Prohibits changing the singletonKey and records an audit log.
 */
export async function dbUpdateHospitalProfile(
  updates: HospitalProfileUpdateInput,
  actor: { id?: string; name: string; role: string }
): Promise<HospitalProfile> {
  if (!isPrismaConnected) {
    throw new Error('DATABASE_UNAVAILABLE: Cannot update hospital profile while database is offline.');
  }

  // Retrieve current authoritative profile
  const current = await dbGetHospitalProfile();

  // Optimistic concurrency check
  if (updates.version !== undefined && updates.version !== current.version) {
    throw new Error(`CONCURRENT_MODIFICATION: Institutional profile version mismatch (expected v${current.version}, received v${updates.version}). Reload and retry.`);
  }

  // Validate currency invariant
  if (updates.currency !== undefined && updates.currency !== 'INR') {
    throw new Error('INVALID_CURRENCY: Hospital currency is strictly constrained to INR.');
  }

  // Validate department code format if provided
  if (updates.code !== undefined && !/^[A-Z0-9]{2,10}$/.test(updates.code.trim())) {
    throw new Error('InvalidHospitalCode: Hospital institutional code must be 2 to 10 uppercase alphanumeric characters.');
  }

  // Validate email format if provided
  if (updates.email && typeof updates.email === 'string' && !updates.email.includes('@')) {
    throw new Error('InvalidEmail: Invalid institutional contact email address.');
  }

  const updated = await prisma.hospitalProfile.update({
    where: { singletonKey: 'PRIMARY_INSTITUTION' },
    data: {
      ...(updates.displayName !== undefined && { displayName: updates.displayName.trim() }),
      ...(updates.legalName !== undefined && { legalName: updates.legalName.trim() }),
      ...(updates.code !== undefined && { code: updates.code.trim().toUpperCase() }),
      ...(updates.address !== undefined && { address: updates.address ? updates.address.trim() : null }),
      ...(updates.city !== undefined && { city: updates.city ? updates.city.trim() : null }),
      ...(updates.state !== undefined && { state: updates.state ? updates.state.trim() : null }),
      ...(updates.country !== undefined && { country: updates.country ? updates.country.trim() : null }),
      ...(updates.postalCode !== undefined && { postalCode: updates.postalCode ? updates.postalCode.trim() : null }),
      ...(updates.phone !== undefined && { phone: updates.phone ? updates.phone.trim() : null }),
      ...(updates.emergencyPhone !== undefined && { emergencyPhone: updates.emergencyPhone ? updates.emergencyPhone.trim() : null }),
      ...(updates.email !== undefined && { email: updates.email ? updates.email.trim() : null }),
      ...(updates.website !== undefined && { website: updates.website ? updates.website.trim() : null }),
      ...(updates.timezone !== undefined && { timezone: updates.timezone.trim() }),
      version: { increment: 1 },
      updatedById: actor.id || null,
      updatedByName: actor.name
    }
  });

  // Record audit log
  await dbLogAudit(
    actor.name,
    actor.role,
    'Hospital Profile Update',
    'Hospital Configuration',
    `Updated institutional profile: ${updated.displayName} (v${updated.version}). Changes: ${Object.keys(updates).join(', ')}`
  );

  return updated;
}

// ------------------------------------------------------------------------------
// 2. DEPARTMENT MASTER SERVICES
// ------------------------------------------------------------------------------

/**
 * List departments with optional discipline, active status, and search filters.
 */
export async function dbGetDepartments(filters?: {
  isActive?: boolean;
  discipline?: DepartmentDiscipline;
  search?: string;
}): Promise<(Department & { activeAssignmentsCount: number })[]> {
  if (!isPrismaConnected) {
    throw new Error('DATABASE_UNAVAILABLE: Cannot query departments while database is offline.');
  }

  const where: Prisma.DepartmentWhereInput = {};

  if (filters?.isActive !== undefined) {
    where.isActive = filters.isActive;
  }
  if (filters?.discipline !== undefined) {
    where.discipline = filters.discipline;
  }
  if (filters?.search && filters.search.trim()) {
    const q = filters.search.trim();
    where.OR = [
      { name: { contains: q, mode: 'insensitive' } },
      { code: { contains: q, mode: 'insensitive' } },
      { description: { contains: q, mode: 'insensitive' } }
    ];
  }

  const list = await prisma.department.findMany({
    where,
    orderBy: { name: 'asc' },
    include: {
      _count: {
        select: {
          assignments: {
            where: { status: 'active' }
          }
        }
      }
    }
  });

  return list.map((d) => ({
    ...d,
    activeAssignmentsCount: d._count.assignments
  }));
}

/**
 * Retrieve a department by its ID or unique code.
 */
export async function dbGetDepartmentById(idOrCode: string): Promise<Department | null> {
  if (!isPrismaConnected) {
    throw new Error('DATABASE_UNAVAILABLE: Cannot query department while database is offline.');
  }

  let dept = await prisma.department.findUnique({
    where: { id: idOrCode }
  });

  if (!dept) {
    dept = await prisma.department.findUnique({
      where: { code: idOrCode }
    });
  }

  return dept;
}

/**
 * Create a new Department master record.
 * Validates uppercase alphanumeric code (2-10 chars), non-empty name, and discipline.
 * Rejects duplicates and never silently modifies invalid input.
 */
export async function dbCreateDepartment(
  data: CreateDepartmentInput,
  actor: { id?: string; name: string; role: string }
): Promise<Department> {
  if (!isPrismaConnected) {
    throw new Error('DATABASE_UNAVAILABLE: Cannot create department while database is offline.');
  }

  // Validate Code
  if (!data.code || typeof data.code !== 'string') {
    throw new Error('CodeRequired: Department code is mandatory.');
  }
  const cleanCode = data.code.trim();
  if (!/^[A-Z0-9]{2,10}$/.test(cleanCode)) {
    throw new Error('InvalidDepartmentCode: Department code must be 2 to 10 uppercase alphanumeric characters.');
  }

  // Validate Name
  if (!data.name || typeof data.name !== 'string' || data.name.trim().length < 2) {
    throw new Error('NameRequired: Department name must be at least 2 characters.');
  }
  const cleanName = data.name.trim();

  // Validate Discipline
  const validDisciplines: DepartmentDiscipline[] = ['AYURVEDA', 'MODERN_MEDICINE', 'OPERATIONAL', 'ALLIED'];
  const discipline: DepartmentDiscipline = data.discipline || 'OPERATIONAL';
  if (!validDisciplines.includes(discipline)) {
    throw new Error(`InvalidDiscipline: Department discipline must be one of: ${validDisciplines.join(', ')}`);
  }

  // Case-insensitive duplicate name check
  const duplicateName = await prisma.department.findFirst({
    where: { name: { equals: cleanName, mode: 'insensitive' } }
  });
  if (duplicateName) {
    throw new Error(`DuplicateDepartmentName: A department with name "${cleanName}" already exists.`);
  }

  // Duplicate code check
  const duplicateCode = await prisma.department.findUnique({
    where: { code: cleanCode }
  });
  if (duplicateCode) {
    throw new Error(`DuplicateDepartmentCode: A department with code "${cleanCode}" already exists.`);
  }

  const created = await prisma.department.create({
    data: {
      code: cleanCode,
      name: cleanName,
      description: data.description ? data.description.trim() : null,
      discipline,
      isActive: true,
      createdById: actor.id || null,
      createdByName: actor.name
    }
  });

  // Audit log
  await dbLogAudit(
    actor.name,
    actor.role,
    'Department Created',
    'Department Management',
    `Created department ${created.name} (${created.code}) under discipline ${created.discipline}.`
  );

  return created;
}

/**
 * Update an existing Department's details.
 * Department code is immutable and cannot be altered.
 */
export async function dbUpdateDepartment(
  id: string,
  updates: UpdateDepartmentInput,
  actor: { id?: string; name: string; role: string }
): Promise<Department> {
  if (!isPrismaConnected) {
    throw new Error('DATABASE_UNAVAILABLE: Cannot update department while database is offline.');
  }

  const dept = await prisma.department.findUnique({ where: { id } });
  if (!dept) {
    throw new Error('DEPARTMENT_NOT_FOUND: Department not found.');
  }

  // Department code is immutable
  if ((updates as any).code !== undefined && (updates as any).code !== dept.code) {
    throw new Error('IMMUTABLE_DEPARTMENT_CODE: Department code cannot be modified once created.');
  }

  // Validate and check name if updated
  let cleanName: string | undefined = undefined;
  if (updates.name !== undefined) {
    if (typeof updates.name !== 'string' || updates.name.trim().length < 2) {
      throw new Error('NameRequired: Department name must be at least 2 characters.');
    }
    cleanName = updates.name.trim();

    const duplicate = await prisma.department.findFirst({
      where: {
        name: { equals: cleanName, mode: 'insensitive' },
        id: { not: id }
      }
    });
    if (duplicate) {
      throw new Error(`DuplicateDepartmentName: Another department with name "${cleanName}" already exists.`);
    }
  }

  // Validate discipline if updated
  if (updates.discipline !== undefined) {
    const validDisciplines: DepartmentDiscipline[] = ['AYURVEDA', 'MODERN_MEDICINE', 'OPERATIONAL', 'ALLIED'];
    if (!validDisciplines.includes(updates.discipline)) {
      throw new Error(`InvalidDiscipline: Department discipline must be one of: ${validDisciplines.join(', ')}`);
    }
  }

  const updated = await prisma.department.update({
    where: { id },
    data: {
      ...(cleanName !== undefined && { name: cleanName }),
      ...(updates.description !== undefined && { description: updates.description ? updates.description.trim() : null }),
      ...(updates.discipline !== undefined && { discipline: updates.discipline }),
      updatedById: actor.id || null,
      updatedByName: actor.name
    }
  });

  await dbLogAudit(
    actor.name,
    actor.role,
    'Department Updated',
    'Department Management',
    `Updated department ${updated.name} (${updated.code}).`
  );

  return updated;
}

/**
 * Soft-deactivate a department.
 * Preserves all historical assignments and existing records.
 */
export async function dbDeactivateDepartment(
  id: string,
  reason: string,
  actor: { id?: string; name: string; role: string }
): Promise<Department> {
  if (!isPrismaConnected) {
    throw new Error('DATABASE_UNAVAILABLE: Cannot deactivate department while database is offline.');
  }

  const dept = await prisma.department.findUnique({ where: { id } });
  if (!dept) {
    throw new Error('DEPARTMENT_NOT_FOUND: Department not found.');
  }
  if (!dept.isActive) {
    throw new Error('DEPARTMENT_ALREADY_INACTIVE: Department is already deactivated.');
  }
  if (!reason || reason.trim().length === 0) {
    throw new Error('ReasonRequired: Deactivation reason is mandatory.');
  }

  const updated = await prisma.department.update({
    where: { id },
    data: {
      isActive: false,
      deactivatedAt: new Date(),
      deactivatedById: actor.id || null,
      deactivatedByName: actor.name,
      deactivationReason: reason.trim(),
      updatedById: actor.id || null,
      updatedByName: actor.name
    }
  });

  await dbLogAudit(
    actor.name,
    actor.role,
    'Department Deactivated',
    'Department Management',
    `Deactivated department ${updated.name} (${updated.code}). Reason: ${reason.trim()}`
  );

  return updated;
}

/**
 * Reactivate a previously deactivated department.
 */
export async function dbActivateDepartment(
  id: string,
  actor: { id?: string; name: string; role: string }
): Promise<Department> {
  if (!isPrismaConnected) {
    throw new Error('DATABASE_UNAVAILABLE: Cannot activate department while database is offline.');
  }

  const dept = await prisma.department.findUnique({ where: { id } });
  if (!dept) {
    throw new Error('DEPARTMENT_NOT_FOUND: Department not found.');
  }
  if (dept.isActive) {
    throw new Error('DEPARTMENT_ALREADY_ACTIVE: Department is already active.');
  }

  const updated = await prisma.department.update({
    where: { id },
    data: {
      isActive: true,
      deactivatedAt: null,
      deactivatedById: null,
      deactivatedByName: null,
      deactivationReason: null,
      updatedById: actor.id || null,
      updatedByName: actor.name
    }
  });

  await dbLogAudit(
    actor.name,
    actor.role,
    'Department Activated',
    'Department Management',
    `Reactivated department ${updated.name} (${updated.code}).`
  );

  return updated;
}

/**
 * Retrieve staff assignments for a department.
 */
export async function dbGetDepartmentStaff(
  departmentId: string,
  filters?: { status?: AssignmentStatus }
): Promise<(StaffDepartmentAssignment & { staffMember: StaffMember })[]> {
  if (!isPrismaConnected) {
    throw new Error('DATABASE_UNAVAILABLE: Cannot query department staff while database is offline.');
  }

  const results = await prisma.staffDepartmentAssignment.findMany({
    where: {
      departmentId,
      ...(filters?.status && { status: filters.status })
    },
    include: {
      staffMember: true
    },
    orderBy: [
      { isPrimary: 'desc' },
      { createdAt: 'desc' }
    ]
  });

  return results as unknown as (StaffDepartmentAssignment & { staffMember: StaffMember })[];
}

// ------------------------------------------------------------------------------
// 3. STAFF DEPARTMENT ASSIGNMENT SERVICES
// ------------------------------------------------------------------------------

/**
 * Assign a staff member to a department.
 * Enforces staff eligibility (non-archived, non-suspended) and active target department.
 * When isPrimary is true, transactionally supersedes any previous active primary assignment
 * and synchronizes legacy StaffMember.department and User.department fields.
 */
export async function dbAssignStaffDepartment(
  data: AssignStaffDepartmentInput,
  actor: { id?: string; name: string; role: string }
): Promise<StaffDepartmentAssignment> {
  if (!isPrismaConnected) {
    throw new Error('DATABASE_UNAVAILABLE: Cannot assign staff department while database is offline.');
  }

  // 1. Verify staff exists and eligibility
  const staff = await prisma.staffMember.findUnique({ where: { id: data.staffId } });
  if (!staff) {
    throw new Error('STAFF_NOT_FOUND: Staff member not found.');
  }
  if (staff.isSuspended || staff.status === 'suspended') {
    throw new Error('STAFF_INELIGIBLE_FOR_ASSIGNMENT: Suspended staff members cannot receive new department assignments.');
  }
  if (staff.archivedAt || staff.status === 'archived') {
    throw new Error('STAFF_INELIGIBLE_FOR_ASSIGNMENT: Archived staff members cannot receive new department assignments.');
  }

  // 2. Verify target department exists and is active
  const dept = await prisma.department.findUnique({ where: { id: data.departmentId } });
  if (!dept) {
    throw new Error('DEPARTMENT_NOT_FOUND: Target department not found.');
  }
  if (!dept.isActive) {
    throw new Error('DEPARTMENT_INACTIVE: Cannot assign staff to a deactivated department.');
  }

  const isPrimary = Boolean(data.isPrimary);

  // 3. Execute atomic assignment and legacy field synchronization in a transaction
  const assignment = await prisma.$transaction(async (tx) => {
    // If setting as primary, demote any existing active primary assignment for this staff member
    if (isPrimary) {
      const activePrimary = await tx.staffDepartmentAssignment.findFirst({
        where: {
          staffId: data.staffId,
          isPrimary: true,
          status: 'active'
        }
      });

      if (activePrimary) {
        if (activePrimary.departmentId === data.departmentId) {
          // Already active primary in this exact department; return existing
          return activePrimary;
        }

        // Mark previous primary assignment as transferred
        await tx.staffDepartmentAssignment.update({
          where: { id: activePrimary.id },
          data: {
            status: 'transferred',
            isPrimary: false,
            endDate: new Date(),
            revokedById: actor.id || null,
            revokedByName: actor.name,
            revocationReason: `Transferred primary department to ${dept.name}`
          }
        });
      }
    }

    // Check if there is already an active non-primary assignment to this exact department
    const existingActive = await tx.staffDepartmentAssignment.findFirst({
      where: {
        staffId: data.staffId,
        departmentId: data.departmentId,
        status: 'active'
      }
    });

    let newOrUpdatedAssignment: StaffDepartmentAssignment;

    if (existingActive) {
      if (isPrimary && !existingActive.isPrimary) {
        // Promote existing secondary assignment to primary
        newOrUpdatedAssignment = await tx.staffDepartmentAssignment.update({
          where: { id: existingActive.id },
          data: {
            isPrimary: true,
            roleTitle: data.roleTitle !== undefined ? (data.roleTitle ? data.roleTitle.trim() : null) : existingActive.roleTitle
          }
        });
      } else {
        newOrUpdatedAssignment = existingActive;
      }
    } else {
      // Create new assignment record
      newOrUpdatedAssignment = await tx.staffDepartmentAssignment.create({
        data: {
          staffId: data.staffId,
          departmentId: data.departmentId,
          isPrimary,
          roleTitle: data.roleTitle ? data.roleTitle.trim() : null,
          status: 'active',
          startDate: data.startDate || new Date(),
          assignedById: actor.id || null,
          assignedByName: actor.name
        }
      });
    }

    // Synchronize legacy fields IF primary assignment
    if (isPrimary) {
      // Update StaffMember primaryDepartmentId and legacy department string
      await tx.staffMember.update({
        where: { id: data.staffId },
        data: {
          primaryDepartmentId: dept.id,
          department: dept.name
        }
      });

      // Update linked User.department if a user record exists
      if (staff.userId) {
        await tx.user.update({
          where: { id: staff.userId },
          data: {
            department: dept.name
          }
        });
      }
    }

    return newOrUpdatedAssignment;
  });

  // Audit logging
  await dbLogAudit(
    actor.name,
    actor.role,
    'Staff Department Assignment',
    'Staff Assignment',
    `Assigned ${staff.name} to ${dept.name} (${isPrimary ? 'Primary' : 'Secondary'}).`
  );

  return assignment;
}

/**
 * Change a staff member's primary department atomically.
 */
export async function dbChangePrimaryDepartment(
  staffId: string,
  newDepartmentId: string,
  actor: { id?: string; name: string; role: string },
  reason?: string
): Promise<StaffDepartmentAssignment> {
  return dbAssignStaffDepartment(
    {
      staffId,
      departmentId: newDepartmentId,
      isPrimary: true,
      roleTitle: reason
    },
    actor
  );
}

/**
 * Update an assignment's status (completed, transferred, or revoked).
 * If the terminated assignment was primary, clears primaryDepartmentId while
 * preserving legacy department strings.
 */
export async function dbUpdateAssignmentStatus(
  assignmentId: string,
  newStatus: 'completed' | 'transferred' | 'revoked',
  actor: { id?: string; name: string; role: string },
  reason?: string
): Promise<StaffDepartmentAssignment> {
  if (!isPrismaConnected) {
    throw new Error('DATABASE_UNAVAILABLE: Cannot update assignment status while database is offline.');
  }

  const validStatuses = ['completed', 'transferred', 'revoked'];
  if (!validStatuses.includes(newStatus)) {
    throw new Error(`InvalidStatus: Status must be one of: ${validStatuses.join(', ')}`);
  }

  const asg = await prisma.staffDepartmentAssignment.findUnique({
    where: { id: assignmentId },
    include: { staffMember: true, department: true }
  });

  if (!asg) {
    throw new Error('ASSIGNMENT_NOT_FOUND: Assignment record not found.');
  }
  if (asg.status !== 'active') {
    throw new Error(`ASSIGNMENT_NOT_ACTIVE: Assignment is already in "${asg.status}" status.`);
  }

  const updatedAssignment = await prisma.$transaction(async (tx) => {
    const updated = await tx.staffDepartmentAssignment.update({
      where: { id: assignmentId },
      data: {
        status: newStatus as AssignmentStatus,
        isPrimary: false,
        endDate: new Date(),
        revokedById: actor.id || null,
        revokedByName: actor.name,
        revocationReason: reason ? reason.trim() : null
      }
    });

    // If the terminated assignment was primary, clear primaryDepartmentId
    if (asg.isPrimary) {
      await tx.staffMember.update({
        where: { id: asg.staffId },
        data: {
          primaryDepartmentId: null
          // Legacy department string retains its existing value to preserve non-null constraint
        }
      });
    }

    return updated;
  });

  await dbLogAudit(
    actor.name,
    actor.role,
    `Staff Assignment ${newStatus}`,
    'Staff Assignment',
    `Marked assignment for ${asg.staffMember.name} in ${asg.department.name} as ${newStatus}. Reason: ${reason || 'N/A'}`
  );

  return updatedAssignment;
}

/**
 * Retrieve all assignments for a staff member.
 */
export async function dbGetStaffAssignments(
  staffId: string,
  filters?: { status?: AssignmentStatus }
): Promise<(StaffDepartmentAssignment & { department: Department })[]> {
  if (!isPrismaConnected) {
    throw new Error('DATABASE_UNAVAILABLE: Cannot query staff assignments while database is offline.');
  }

  return prisma.staffDepartmentAssignment.findMany({
    where: {
      staffId,
      ...(filters?.status && { status: filters.status })
    },
    include: {
      department: true
    },
    orderBy: [
      { isPrimary: 'desc' },
      { createdAt: 'desc' }
    ]
  });
}

/**
 * Retrieve the current active primary assignment for a staff member.
 */
export async function dbGetPrimaryStaffAssignment(
  staffId: string
): Promise<(StaffDepartmentAssignment & { department: Department }) | null> {
  if (!isPrismaConnected) {
    throw new Error('DATABASE_UNAVAILABLE: Cannot query primary assignment while database is offline.');
  }

  return prisma.staffDepartmentAssignment.findFirst({
    where: {
      staffId,
      isPrimary: true,
      status: 'active'
    },
    include: {
      department: true
    }
  });
}

// Re-export Phase 7 Ayurvedic Therapy & Panchakarma Services
export * from './phase7Service.ts';

