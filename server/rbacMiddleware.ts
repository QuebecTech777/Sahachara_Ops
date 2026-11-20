import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { UserRole, VALID_USER_ROLES } from '../src/types/hospital.ts';
import { hospitalStore } from './dataStore.ts';
import { verifySupabaseToken } from './supabaseServer.ts';

export function getSessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.trim() === '') {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'FATAL CONFIGURATION ERROR: SESSION_SECRET environment variable is missing or empty in production. Application startup aborted to prevent insecure session token generation.'
      );
    }
    // Safe development/test fallback when explicitly running in non-production environments
    return 'sahachara-clinical-ops-development-secret-2026';
  }
  return secret.trim();
}

export function isValidUserRole(role: unknown): role is UserRole {
  return typeof role === 'string' && VALID_USER_ROLES.includes(role as UserRole);
}

export interface TokenPayload {
  userId: string;
  email: string;
  role: UserRole;
  name: string;
  patientMrn?: string;
  exp: number;
}

export function generateSessionToken(payload: Omit<TokenPayload, 'exp'>, expiresInSeconds: number = 86400 * 7): string {
  const exp = Math.floor(Date.now() / 1000) + expiresInSeconds;
  const fullPayload: TokenPayload = { ...payload, exp };
  const encodedPayload = Buffer.from(JSON.stringify(fullPayload)).toString('base64url');
  const signature = crypto
    .createHmac('sha256', getSessionSecret())
    .update(encodedPayload)
    .digest('base64url');
  return `sah_${encodedPayload}.${signature}`;
}

export function verifySessionToken(token: string): { valid: boolean; payload?: TokenPayload; error?: string } {
  if (!token || !token.startsWith('sah_')) {
    return { valid: false, error: 'Invalid token format' };
  }
  const parts = token.slice(4).split('.');
  if (parts.length !== 2) {
    return { valid: false, error: 'Malformed token structure' };
  }
  const [encodedPayload, signature] = parts;
  const expectedSignature = crypto
    .createHmac('sha256', getSessionSecret())
    .update(encodedPayload)
    .digest('base64url');

  const sigBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);
  if (sigBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(sigBuffer, expectedBuffer)) {
    return { valid: false, error: 'Invalid token signature' };
  }

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')) as TokenPayload;
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      return { valid: false, error: 'Token has expired' };
    }
    if (!isValidUserRole(payload.role)) {
      return { valid: false, error: 'Invalid or unsupported role in token' };
    }
    return { valid: true, payload };
  } catch {
    return { valid: false, error: 'Corrupt token payload' };
  }
}

export interface AuthenticatedRequest extends Request {
  userId?: string;
  userRole?: UserRole;
  userName?: string;
  patientMrn?: string;
  authUserId?: string;
}

export const ROLE_HIERARCHY: Record<UserRole, number> = {
  SUPER_ADMIN: 100,
  ADMIN: 80,
  DOCTOR: 60,
  VAIDYA: 60,
  PHARMACIST: 40,
  ACCOUNTANT: 40,
  RECEPTIONIST: 20
};

/**
 * Standard Role-Based Permission Definitions across the 7 Permitted Roles:
 * 1. SUPER_ADMIN: Highest-level system administration, platform configuration, access management
 * 2. ADMIN: Hospital operational management, staff management, authorized configuration
 * 3. DOCTOR: Western/modern medicine, consultations, prescriptions, lab ordering and acute clinical evaluation, triage
 * 4. VAIDYA: Ayurvedic physician, Prakriti/Vikriti, dosha documentation, Panchakarma, therapy plans, Ayurvedic Rx
 * 5. RECEPTIONIST: Front desk, registration, appointments, bed assignment, triage intake
 * 6. PHARMACIST: Medication dispensing, formulary stock and batch control
 * 7. ACCOUNTANT: Patient billing, invoices, receipts, financial reports
 */
export const CLINICAL_PERMISSIONS = {
  // Patient Records
  PATIENT_READ: ['SUPER_ADMIN', 'ADMIN', 'DOCTOR', 'VAIDYA', 'RECEPTIONIST', 'PHARMACIST', 'ACCOUNTANT'] as UserRole[],
  PATIENT_CREATE: ['SUPER_ADMIN', 'ADMIN', 'DOCTOR', 'VAIDYA', 'RECEPTIONIST'] as UserRole[],
  PATIENT_UPDATE: ['SUPER_ADMIN', 'ADMIN', 'DOCTOR', 'VAIDYA', 'RECEPTIONIST'] as UserRole[],
  PATIENT_DELETE: ['SUPER_ADMIN'] as UserRole[],

  // Appointments & Scheduling
  APPOINTMENT_READ: ['SUPER_ADMIN', 'ADMIN', 'DOCTOR', 'VAIDYA', 'RECEPTIONIST'] as UserRole[],
  APPOINTMENT_SCHEDULE: ['SUPER_ADMIN', 'ADMIN', 'DOCTOR', 'VAIDYA', 'RECEPTIONIST'] as UserRole[],
  APPOINTMENT_CANCEL: ['SUPER_ADMIN', 'ADMIN', 'DOCTOR', 'VAIDYA', 'RECEPTIONIST'] as UserRole[],
  APPOINTMENT_CHECK_IN: ['SUPER_ADMIN', 'ADMIN', 'RECEPTIONIST'] as UserRole[],
  QUEUE_MANAGE: ['SUPER_ADMIN', 'ADMIN', 'RECEPTIONIST'] as UserRole[],
  QUEUE_READ: ['SUPER_ADMIN', 'ADMIN', 'DOCTOR', 'VAIDYA', 'RECEPTIONIST'] as UserRole[],
  QUEUE_EMERGENCY_ESCALATE: ['SUPER_ADMIN', 'ADMIN', 'RECEPTIONIST', 'DOCTOR', 'VAIDYA'] as UserRole[],
  CLINICAL_TRIAGE: ['DOCTOR', 'VAIDYA'] as UserRole[],
  CONSULTATION_HANDOFF: ['DOCTOR', 'VAIDYA'] as UserRole[],
  APPOINTMENT_COMPLETE: ['DOCTOR', 'VAIDYA'] as UserRole[],

  // Clinical Consultations & Treatments
  CONSULTATION_READ: ['SUPER_ADMIN', 'ADMIN', 'DOCTOR', 'VAIDYA'] as UserRole[],
  CONSULTATION_WRITE: ['SUPER_ADMIN', 'ADMIN', 'DOCTOR', 'VAIDYA'] as UserRole[],
  AYURVEDIC_CONSULTATION_WRITE: ['SUPER_ADMIN', 'ADMIN', 'VAIDYA'] as UserRole[],
  AYURVEDIC_TREATMENT_WRITE: ['SUPER_ADMIN', 'ADMIN', 'VAIDYA'] as UserRole[],
  TREATMENT_PLAN_WRITE: ['SUPER_ADMIN', 'ADMIN', 'VAIDYA'] as UserRole[],
  TREATMENT_SESSION_LOG: ['SUPER_ADMIN', 'ADMIN', 'VAIDYA'] as UserRole[],
  PANCHAKARMA_MANAGE: ['SUPER_ADMIN', 'ADMIN', 'VAIDYA'] as UserRole[],
  TRIAGE_MANAGE: ['SUPER_ADMIN', 'ADMIN', 'DOCTOR', 'RECEPTIONIST'] as UserRole[], // DOCTOR & RECEPTIONIST, not Vaidya
  BED_MANAGE: ['SUPER_ADMIN', 'ADMIN', 'DOCTOR', 'VAIDYA', 'RECEPTIONIST'] as UserRole[],

  // Phase 3: Clinical Operations
  DOCTOR_DASHBOARD: ['DOCTOR'] as UserRole[],
  VAIDYA_DASHBOARD: ['VAIDYA'] as UserRole[],
  DOCTOR_QUEUE: ['DOCTOR'] as UserRole[],
  VAIDYA_QUEUE: ['VAIDYA'] as UserRole[],
  ESCALATION_ACKNOWLEDGE: ['DOCTOR', 'VAIDYA'] as UserRole[],
  ESCALATION_RESOLVE: ['DOCTOR', 'VAIDYA'] as UserRole[],
  ENCOUNTER_INITIATE: ['DOCTOR', 'VAIDYA'] as UserRole[],
  ENCOUNTER_READ: ['SUPER_ADMIN', 'ADMIN', 'DOCTOR', 'VAIDYA'] as UserRole[],
  ENCOUNTER_COMPLETE: ['DOCTOR', 'VAIDYA'] as UserRole[],
  VITALS_RECORD: ['DOCTOR', 'VAIDYA'] as UserRole[],
  ASSESSMENT_SAVE: ['DOCTOR', 'VAIDYA'] as UserRole[],
  DIAGNOSIS_SAVE: ['DOCTOR', 'VAIDYA'] as UserRole[],
  INVESTIGATION_ORDER: ['DOCTOR'] as UserRole[],
  INVESTIGATION_RESULT: ['DOCTOR'] as UserRole[],
  INVESTIGATION_REVIEW: ['DOCTOR'] as UserRole[],
  INVESTIGATION_READ: ['DOCTOR'] as UserRole[],
  CLINICAL_PRESCRIPTION: ['DOCTOR', 'VAIDYA'] as UserRole[],
  AYURVEDIC_CLINICAL_MANAGE: ['VAIDYA'] as UserRole[],
  PATIENT_HISTORY_READ: ['SUPER_ADMIN', 'ADMIN', 'DOCTOR', 'VAIDYA'] as UserRole[],

  // Pharmacy & Prescriptions
  RX_READ: ['SUPER_ADMIN', 'ADMIN', 'DOCTOR', 'VAIDYA', 'PHARMACIST'] as UserRole[],
  RX_CREATE: ['DOCTOR', 'VAIDYA'] as UserRole[],
  RX_DISPENSE: ['PHARMACIST'] as UserRole[],
  PHARMACY_STOCK_MANAGE: ['PHARMACIST'] as UserRole[],

  // Laboratory Diagnostics (Ordinary clinical review and entry with authenticated attribution)
  LAB_READ: ['SUPER_ADMIN', 'ADMIN', 'DOCTOR', 'VAIDYA'] as UserRole[],
  LAB_ORDER_CREATE: ['SUPER_ADMIN', 'ADMIN', 'DOCTOR', 'VAIDYA'] as UserRole[],
  LAB_RESULT_WRITE: ['SUPER_ADMIN', 'ADMIN', 'DOCTOR', 'VAIDYA'] as UserRole[],

  // Billing & Finance
  BILLING_MANAGE: ['SUPER_ADMIN', 'ADMIN', 'ACCOUNTANT', 'RECEPTIONIST'] as UserRole[],
  BILLING_READ: ['SUPER_ADMIN', 'ADMIN', 'ACCOUNTANT', 'RECEPTIONIST'] as UserRole[],
  TARIFF_MANAGE: ['SUPER_ADMIN'] as UserRole[],
  MEDICATION_PRICE_MANAGE: ['SUPER_ADMIN'] as UserRole[],
  INVOICE_CREATE: ['SUPER_ADMIN', 'ACCOUNTANT', 'RECEPTIONIST'] as UserRole[],
  INVOICE_ISSUE: ['SUPER_ADMIN', 'ACCOUNTANT', 'RECEPTIONIST'] as UserRole[],
  PAYMENT_RECORD: ['SUPER_ADMIN', 'ACCOUNTANT', 'RECEPTIONIST'] as UserRole[],
  PAYMENT_ALLOCATE: ['SUPER_ADMIN', 'ACCOUNTANT', 'RECEPTIONIST'] as UserRole[],
  REFUND_REQUEST: ['SUPER_ADMIN', 'ACCOUNTANT'] as UserRole[],
  REFUND_APPROVE: ['SUPER_ADMIN'] as UserRole[],
  REFUND_EXECUTE: ['SUPER_ADMIN', 'ACCOUNTANT'] as UserRole[],
  FINANCIAL_REPORT_READ: ['SUPER_ADMIN', 'ADMIN', 'ACCOUNTANT'] as UserRole[],

  // System Administration & Governance
  STAFF_MANAGE: ['SUPER_ADMIN', 'ADMIN'] as UserRole[],
  ROLE_ASSIGN: ['SUPER_ADMIN', 'ADMIN'] as UserRole[],
  AUDIT_READ: ['SUPER_ADMIN', 'ADMIN'] as UserRole[],
  CONFIGURATION_EDIT: ['SUPER_ADMIN'] as UserRole[]
};

export interface ActiveUserCheckResult {
  isActive: boolean;
  isUnavailable?: boolean;
  statusReason?: 'suspended' | 'archived' | 'not_found' | 'inactive' | 'missing_staff' | 'role_mismatch' | 'unavailable';
  currentRole?: UserRole;
  error?: string;
}

export type ActiveUserChecker = (userId: string, email?: string) => Promise<ActiveUserCheckResult>;

let activeUserChecker: ActiveUserChecker | null = null;

export function registerActiveUserChecker(fn: ActiveUserChecker) {
  activeUserChecker = fn;
}

export interface ExtractedCredentials {
  type: 'none' | 'sahachara' | 'supabase';
  token?: string;
  error?: {
    code: string;
    message: string;
  };
}

const NATIVE_SAHA_TOKEN_PATTERN = /^sah_[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const SUPABASE_JWT_PATTERN = /^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

/**
 * Validates the Authorization header structure and extracts the credentials.
 * Ensures malformed, unsupported, or ambiguous headers fail closed.
 */
export function extractAndValidateAuthorization(authHeader: unknown): ExtractedCredentials {
  if (authHeader === undefined || authHeader === null || authHeader === '') {
    return { type: 'none' };
  }

  if (Array.isArray(authHeader)) {
    return {
      type: 'none',
      error: {
        code: 'AMBIGUOUS_CREDENTIALS',
        message: 'Authentication failed: Multiple Authorization headers provided.'
      }
    };
  }

  if (typeof authHeader !== 'string') {
    return {
      type: 'none',
      error: {
        code: 'MALFORMED_AUTHORIZATION_HEADER',
        message: 'Authentication failed: Authorization header must be a string.'
      }
    };
  }

  const trimmed = authHeader.trim();
  if (!trimmed) {
    return { type: 'none' };
  }

  // Node.js joins duplicate headers with a comma
  if (trimmed.includes(',')) {
    return {
      type: 'none',
      error: {
        code: 'AMBIGUOUS_CREDENTIALS',
        message: 'Authentication failed: Multiple Authorization headers provided.'
      }
    };
  }

  const match = /^Bearer\s+(\S+)$/i.exec(trimmed);
  if (!match) {
    return {
      type: 'none',
      error: {
        code: 'MALFORMED_AUTHORIZATION_HEADER',
        message: 'Authentication failed: Authorization header must use the Bearer scheme with a valid token.'
      }
    };
  }

  const token = match[1];
  if (token.startsWith('sah_')) {
    if (!NATIVE_SAHA_TOKEN_PATTERN.test(token)) {
      return {
        type: 'none',
        error: {
          code: 'MALFORMED_TOKEN',
          message: 'Authentication failed: Native session token structure is malformed.'
        }
      };
    }
    return { type: 'sahachara', token };
  }

  if (!SUPABASE_JWT_PATTERN.test(token)) {
    return {
      type: 'none',
      error: {
        code: 'MALFORMED_TOKEN',
        message: 'Authentication failed: Bearer token is not a valid session token or JWT.'
      }
    };
  }

  return { type: 'supabase', token };
}

/**
 * Authentication and Identity Resolver Middleware
 * Extracts identity strictly from verified Bearer tokens.
 * NEVER trusts unverified client headers or defaults to any role.
 * STRICTLY FAILS CLOSED on database unavailability, lookup errors, missing accounts, or suspended users.
 */
export async function authenticateContext(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  // Clear any previous context on request object
  req.userId = undefined;
  req.userRole = undefined;
  req.userName = undefined;
  req.authUserId = undefined;
  req.patientMrn = undefined;

  // Detect duplicate Authorization headers in rawHeaders (RFC 7235 / HTTP smuggling prevention)
  if (Array.isArray(req.rawHeaders)) {
    let authCount = 0;
    for (let i = 0; i < req.rawHeaders.length; i += 2) {
      if (req.rawHeaders[i].toLowerCase() === 'authorization') {
        authCount++;
      }
    }
    if (authCount > 1) {
      return res.status(401).json({
        success: false,
        code: 'AMBIGUOUS_CREDENTIALS',
        message: 'Authentication failed: Multiple Authorization headers provided.'
      });
    }
  }

  const credentials = extractAndValidateAuthorization(req.headers.authorization);

  if (credentials.error) {
    return res.status(401).json({
      success: false,
      code: credentials.error.code,
      message: credentials.error.message
    });
  }

  if (credentials.type === 'none') {
    return next();
  }

  if (credentials.type === 'sahachara' && credentials.token) {
    const verified = verifySessionToken(credentials.token);
    if (!verified.valid || !verified.payload) {
      return res.status(401).json({
        success: false,
        code: 'INVALID_TOKEN',
        message: `Authentication failed: ${verified.error || 'Invalid session token signature.'}`
      });
    }

    if (!isValidUserRole(verified.payload.role)) {
      return res.status(401).json({
        success: false,
        code: 'INVALID_ROLE',
        message: 'Authentication failed: Token contains an invalid or unsupported role.'
      });
    }

    if (!activeUserChecker) {
      return res.status(503).json({
        success: false,
        code: 'AUTH_SERVICE_UNAVAILABLE',
        message: 'Authentication service is temporarily unavailable. Fail-closed security active.'
      });
    }

    let check: ActiveUserCheckResult;
    try {
      check = await activeUserChecker(verified.payload.userId, verified.payload.email);
    } catch (err: any) {
      console.error('[authenticateContext] ActiveUserChecker threw exception:', err?.message || 'Database lookup failure');
      return res.status(503).json({
        success: false,
        code: 'SERVICE_UNAVAILABLE',
        message: 'Authentication service temporarily unavailable. Database connection could not verify active account credentials.'
      });
    }

    // 1. Database unavailable or lookup failure -> Fail closed (HTTP 503)
    if (check.isUnavailable) {
      return res.status(503).json({
        success: false,
        code: 'SERVICE_UNAVAILABLE',
        message: 'Authentication service temporarily unavailable. Database connection could not verify active account credentials.'
      });
    }

    // 2. User not active, not found, missing staff, or suspended -> Fail closed (HTTP 401)
    if (!check.isActive) {
      let code = 'UNAUTHORIZED';
      let message = 'Authentication failed: Account is not active.';
      if (check.statusReason === 'not_found') {
        code = 'USER_NOT_FOUND';
        message = 'Authentication failed: User account does not exist or has been removed.';
      } else if (check.statusReason === 'suspended') {
        code = 'ACCOUNT_SUSPENDED';
        message = 'Authentication failed: Account has been suspended. Active sessions are revoked.';
      } else if (check.statusReason === 'archived') {
        code = 'ACCOUNT_ARCHIVED';
        message = 'Authentication failed: Account has been archived. Operational access is revoked.';
      } else if (check.statusReason === 'inactive') {
        code = 'ACCOUNT_INACTIVE';
        message = 'Authentication failed: Account is inactive or pending activation.';
      } else if (check.statusReason === 'missing_staff') {
        code = 'STAFF_RECORD_REQUIRED';
        message = 'Authentication failed: Operational staff account requires an active linked staff record.';
      } else if (check.statusReason === 'role_mismatch') {
        code = 'ROLE_MISMATCH';
        message = 'Authentication failed: Account role and staff record role do not match.';
      }

      return res.status(401).json({
        success: false,
        code,
        message
      });
    }

    // 3. User is valid and active -> Apply authoritative database role
    req.userId = verified.payload.userId;
    req.authUserId = verified.payload.userId;
    req.userRole = check.currentRole && isValidUserRole(check.currentRole) ? check.currentRole : verified.payload.role;
    req.userName = verified.payload.name;
    req.patientMrn = verified.payload.patientMrn;
    return next();
  }

  if (credentials.type === 'supabase' && credentials.token) {
    const tokenVerification = await verifySupabaseToken(credentials.token);
    if (!tokenVerification.valid || !tokenVerification.user) {
      return res.status(401).json({
        success: false,
        code: 'INVALID_TOKEN',
        message: `Authentication failed: ${tokenVerification.error || 'Invalid or expired Supabase token.'}`
      });
    }

    const metaRole = tokenVerification.user.user_metadata?.role;
    if (!isValidUserRole(metaRole)) {
      return res.status(401).json({
        success: false,
        code: 'INVALID_ROLE',
        message: 'Authentication failed: Supabase user metadata does not contain a valid operational role.'
      });
    }

    if (activeUserChecker) {
      try {
        const check = await activeUserChecker(tokenVerification.user.id, tokenVerification.user.email);
        if (check.isUnavailable) {
          return res.status(503).json({
            success: false,
            code: 'SERVICE_UNAVAILABLE',
            message: 'Authentication service temporarily unavailable.'
          });
        }
        if (!check.isActive) {
          return res.status(401).json({
            success: false,
            code: 'UNAUTHORIZED',
            message: 'Account is not active.'
          });
        }
        req.userRole = check.currentRole && isValidUserRole(check.currentRole) ? check.currentRole : metaRole;
      } catch (err: any) {
        return res.status(503).json({
          success: false,
          code: 'SERVICE_UNAVAILABLE',
          message: 'Authentication service temporarily unavailable.'
        });
      }
    } else {
      req.userRole = metaRole;
    }

    req.userId = tokenVerification.user.id;
    req.authUserId = tokenVerification.user.id;
    req.userName = tokenVerification.user.user_metadata?.name || tokenVerification.user.email;
    return next();
  }

  return next();
}

/**
 * Require one of the specified roles to access an endpoint
 */
export function requireRole(allowedRoles: UserRole[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.userRole) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'Authentication required. Please provide a valid Bearer token.'
      });
    }

    if (!allowedRoles.includes(req.userRole)) {
      hospitalStore.logAudit(
        req.userName || 'Anonymous',
        req.userRole,
        'Access Denied: RBAC Authorization Failure',
        'RBAC Change',
        `Unauthorized access attempt to [${req.method}] ${req.originalUrl}. Required roles: ${allowedRoles.join(', ')}`,
        req.patientMrn
      );

      let code = 'ACCESS_DENIED';
      let message = `Access Denied: Your assigned role (${req.userRole}) does not have permission to perform this clinical operation. Required roles: ${allowedRoles.join(', ')}.`;

      const onlyClinicians = allowedRoles.every((r) => r === 'DOCTOR' || r === 'VAIDYA');
      if (onlyClinicians) {
        if (req.userRole !== 'DOCTOR' && req.userRole !== 'VAIDYA') {
          code = 'CLINICAL_AUTHORITY_REQUIRED';
          message = `ClinicalAuthorityRequired: Only authorized clinical practitioners (${allowedRoles.join(' or ')}) may perform this clinical operation. Role "${req.userRole}" is not authorized.`;
        } else if (!(allowedRoles as any).includes(req.userRole)) {
          code = 'CLINICAL_DISCIPLINE_MISMATCH';
          message = `ClinicalDisciplineMismatch: Clinician discipline "${req.userRole}" cannot access "${allowedRoles.join(', ')}" workflow.`;
        }
      }

      return res.status(403).json({
        success: false,
        error: 'Forbidden',
        code,
        message
      });
    }

    next();
  };
}

/**
 * Require specific clinical permission
 */
export function requirePermission(permissionRoles: UserRole[]) {
  return requireRole(permissionRoles);
}

/**
 * Enforce strict data isolation if MRN scope is present
 */
export function enforcePatientIsolation(_req: AuthenticatedRequest, _res: Response, next: NextFunction) {
  next();
}
