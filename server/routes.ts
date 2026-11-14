import { Router, Request, Response } from 'express';
import { Prisma, DepartmentDiscipline, AssignmentStatus } from '@prisma/client';
import { hospitalStore } from './dataStore.ts';
import {
  Patient,
  TriageRecord,
  Bed,
  Appointment,
  AppointmentReminder,
  Prescription,
  LabOrder,
  BillInvoice,
  Consultation,
  TreatmentPlan,
  PanchakarmaCourse,
  StockMovement,
  PharmacySupplier,
  StaffMember,
  MedicationStock,
  UserRole,
  VALID_USER_ROLES,
  HospitalTariff,
  AppUser
} from '../src/types/hospital.ts';
import {
  authenticateContext,
  requireRole,
  requirePermission,
  enforcePatientIsolation,
  CLINICAL_PERMISSIONS,
  AuthenticatedRequest
} from './rbacMiddleware.ts';
import {
  persistPatientToSupabase,
  persistConsultationToSupabase,
  persistAuditLogToSupabase
} from './supabaseServer.ts';
import {
  prisma,
  isPrismaConnected,
  dbGetHospitalProfile,
  dbUpdateHospitalProfile,
  dbGetDepartments,
  dbGetDepartmentById,
  dbCreateDepartment,
  dbUpdateDepartment,
  dbDeactivateDepartment,
  dbActivateDepartment,
  dbGetDepartmentStaff,
  dbAssignStaffDepartment,
  dbChangePrimaryDepartment,
  dbUpdateAssignmentStatus,
  dbGetStaffAssignments,
  dbGetPrimaryStaffAssignment,
  authenticateStaffUser,
  activateStaffAccount,
  CLINIC_METADATA,
  dbGetPatients,
  dbGetPatientByIdOrMrn,
  dbGetPatientDossier,
  dbSearchPatients,
  checkDuplicatePatients,
  generateUniquePatientNumber,
  dbCreatePatient,
  dbUpdatePatient,
  dbDeletePatient,
  dbGetAppointments,
  dbGetAppointmentById,
  dbCreateAppointment,
  dbCreateWalkInAppointment,
  dbCheckInAppointment,
  dbUpdateAppointmentStatus,
  dbRescheduleAppointment,
  dbUpdateAppointment,
  dbGetReceptionQueue,
  dbUpdateQueuePriority,
  dbEscalateQueuePatient,
  dbAcknowledgeEscalation,
  dbResolveEscalation,
  dbGetDoctorDashboard,
  dbGetVaidyaDashboard,
  dbGetDoctorQueue,
  dbGetVaidyaQueue,
  dbInitiateEncounter,
  dbGetEncounterById,
  dbCompleteEncounter,
  dbRecordVitals,
  dbSaveAssessment,
  dbAddDiagnosis,
  dbOrderInvestigation,
  dbGetInvestigationById,
  dbRecordInvestigationResult,
  dbReviewInvestigation,
  dbPrescribeEncounterMedication,
  dbRecordPrakriti,
  dbRecordVikriti,
  dbRecordDoshaEvaluation,
  dbCreateAyurvedicTreatmentPlan,
  dbCreatePanchakarmaReferral,
  dbGetPatientClinicalHistory,
  dbGetReceptionDashboard,
  dbGetPractitioners,
  dbGetConsultations,
  dbCreateConsultation,
  dbGetPrescriptions,
  dbCreatePrescription,
  dbDispensePrescription,
  dbGetInvoices,
  dbGetInvoiceById,
  dbCreateInvoice,
  dbIssueInvoice,
  dbGetPatientBillableItems,
  dbRecordPayment,
  dbAllocatePayment,
  dbGetPayments,
  dbGetPaymentById,
  dbRequestRefund,
  dbApproveRefund,
  dbExecuteRefund,
  dbRejectRefund,
  dbConfigureMedicationPrice,
  dbGetRefundRequests,
  dbGetPatientAccount,
  dbGetDailyCollectionReport,
  dbGetOutstandingReceivablesReport,
  dbGetPatientDemographicsReport,
  dbGetAppointmentOperationalReport,
  dbGetClinicalActivityReport,
  dbGetTreatmentOperationalReport,
  dbGetPharmacyInventoryReport,
  dbGetStaffWorkforceReport,
  dbGetLabOrders,
  dbCreateLabOrder,
  dbUpdateLabOrder,
  dbGetAuditLogs,
  dbLogAudit,
  validateAndNormalizeRole,
  dbGetUsers,
  dbUpdateUserRole,
  dbCreateStaff,
  dbUpdateStaff,
  dbGetOverviewMetrics,
  dbGetStaffList,
  dbGetStaffById,
  dbCreateStaffMember,
  dbUpdateStaffMember,
  dbChangeStaffRole,
  dbSuspendStaff,
  dbReactivateStaff,
  dbArchiveStaff,
  dbRegenerateActivationPin,
  dbGetStaffAuditHistory,
  dbGetTariffs,
  dbGetTariffById,
  dbCreateTariff,
  dbUpdateTariff,
  dbConfigureTariffRate,
  dbUpdateTariffRate,
  dbGetTreatmentPlans,
  dbCreateTreatmentPlan,
  dbUpdateTreatmentPlan,
  dbGetPanchakarmaCourses,
  dbCreatePanchakarmaCourse,
  dbUpdatePanchakarmaCourse,
  dbGetMedicationStock,
  dbCreateMedicationStock,
  dbGetStockMovements,
  dbCreateStockMovement,
  dbReceiveStock,
  dbAdjustStock,
  dbGetPrescriptionQueue,
  isAyurvedicMedication,
  isModernMedication,
  dbGetPrescriptionById,
  dbUpdatePrescription,
  dbGetEligibleAdministeringStaff,
  dbGetResponsibleVaidyas,
  dbCreateStaffTherapyAuthorization,
  dbRevokeStaffTherapyAuthorization,
  dbGetStaffTherapyAuthorizations,
  dbGetTherapyRooms,
  dbGetTherapyRoomById,
  dbCreateTherapyRoom,
  dbUpdateTherapyRoom,
  dbEnterRoomMaintenance,
  dbExitRoomMaintenance,
  dbRecordRoomSanitization,
  dbCheckStaleRooms,
  dbReconcileStaleRoom,
  dbScheduleTherapySession,
  dbRescheduleTherapySession,
  dbCancelTherapySession,
  dbNoShowTherapySession,
  dbStartTherapySession,
  dbCompleteTherapySession,
  dbAbortTherapySession,
  dbGetTherapySessions,
  dbGetTherapySessionById,
  dbGetPanchakarmaReferrals,
  dbGetPanchakarmaReferralById,
  dbConvertReferralToCourse,
  dbAdvancePanchakarmaPhase,
  dbPausePanchakarmaCourse,
  dbResumePanchakarmaCourse,
  dbTerminatePanchakarmaCourse,
  SchedulingConflictError,
  ClinicalDisciplineMismatchError,
  InvalidSessionStateError,
  UnconfiguredTurnaroundBufferError
} from './prismaService.ts';

export const apiRouter = Router();

// Mount universal authentication context on API routes
apiRouter.use(authenticateContext as any);

// ==========================================
// 0. AUTHENTICATION & CLINIC CONFIGURATION
// ==========================================

// Authenticate staff user (Strictly requires @sahachara.com email)
apiRouter.post('/auth/login', async (req: Request, res: Response) => {
  const { email, password } = req.body;
  const result = await authenticateStaffUser(email, password);
  if (!result.success) {
    return res.status(401).json(result);
  }
  res.json(result);
});

// Activate new staff member account via security PIN and set password
apiRouter.post('/auth/activate', async (req: Request, res: Response) => {
  const { email, pin, newPassword } = req.body;
  const result = await activateStaffAccount(email, pin, newPassword);
  if (!result.success) {
    return res.status(400).json(result);
  }
  res.json(result);
});

// Verify active session token and return authenticated user identity
apiRouter.get(['/auth/verify', '/auth/me'], requireRole(VALID_USER_ROLES as unknown as UserRole[]), async (req: AuthenticatedRequest, res: Response) => {
  try {
    let department = '';
    let email = '';
    let title = `${req.userRole}`;
    if (isPrismaConnected && req.userId) {
      try {
        const dbUser = await prisma.user.findUnique({
          where: { id: req.userId },
          select: { id: true, department: true, email: true, name: true, role: true }
        });
        if (dbUser) {
          department = dbUser.department;
          email = dbUser.email;
          title = `${dbUser.role} - ${dbUser.department}`;
        }
      } catch {
        // Fallback to token information if DB lookup fails
      }
    }
    const user: AppUser = {
      id: req.userId!,
      name: req.userName || 'Staff Member',
      role: req.userRole!,
      title,
      email: email || '',
      department: department || '',
      avatarInitials: (req.userName || 'SM').split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase(),
      status: 'active'
    };
    res.json({
      success: true,
      user
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Session verification failed' });
  }
});

// Official clinic metadata
apiRouter.get('/clinic/info', (_req: Request, res: Response) => {
  res.json({
    success: true,
    data: CLINIC_METADATA
  });
});

// ==========================================
// PHASE 6B: HOSPITAL INSTITUTIONAL PROFILE
// ==========================================

// 1. Read hospital institutional profile (All 7 roles)
apiRouter.get('/hospital/profile', requireRole(VALID_USER_ROLES as unknown as UserRole[]), async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const profile = await dbGetHospitalProfile();
    res.json({
      success: true,
      data: {
        id: profile.id,
        code: profile.code,
        legalName: profile.legalName,
        displayName: profile.displayName,
        address: profile.address,
        city: profile.city,
        state: profile.state,
        country: profile.country,
        postalCode: profile.postalCode,
        phone: profile.phone,
        emergencyPhone: profile.emergencyPhone,
        email: profile.email,
        website: profile.website,
        timezone: profile.timezone,
        currency: profile.currency,
        version: profile.version,
        updatedAt: profile.updatedAt
      }
    });
  } catch (err: any) {
    if (err.message.includes('INSTITUTIONAL_PROFILE_NOT_FOUND')) {
      return res.status(404).json({ success: false, code: 'INSTITUTIONAL_PROFILE_NOT_FOUND', message: 'Hospital institutional profile not found.' });
    }
    if (err.message.includes('DATABASE_UNAVAILABLE')) {
      return res.status(503).json({ success: false, code: 'DATABASE_UNAVAILABLE', message: 'Hospital profile service unavailable.' });
    }
    res.status(500).json({ success: false, code: 'HOSPITAL_PROFILE_ERROR', message: 'Failed to retrieve hospital institutional profile.' });
  }
});

// 2. Update hospital institutional profile (SUPER_ADMIN only)
apiRouter.put('/hospital/profile', requireRole(['SUPER_ADMIN']), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const body = req.body || {};
    if (body.version === undefined || typeof body.version !== 'number') {
      return res.status(400).json({
        success: false,
        code: 'VERSION_REQUIRED',
        message: 'Expected integer version is required for optimistic concurrency control.'
      });
    }

    // Strip protected fields from body
    delete body.singletonKey;
    delete body.id;

    const actor = {
      id: req.userId,
      name: req.userName || 'Super Administrator',
      role: req.userRole!
    };

    const updated = await dbUpdateHospitalProfile(body, actor);
    res.json({
      success: true,
      data: {
        id: updated.id,
        code: updated.code,
        legalName: updated.legalName,
        displayName: updated.displayName,
        address: updated.address,
        city: updated.city,
        state: updated.state,
        country: updated.country,
        postalCode: updated.postalCode,
        phone: updated.phone,
        emergencyPhone: updated.emergencyPhone,
        email: updated.email,
        website: updated.website,
        timezone: updated.timezone,
        currency: updated.currency,
        version: updated.version,
        updatedAt: updated.updatedAt
      }
    });
  } catch (err: any) {
    if (err.message.includes('CONCURRENT_MODIFICATION')) {
      return res.status(409).json({ success: false, code: 'CONCURRENT_MODIFICATION', message: err.message });
    }
    if (err.message.includes('INVALID_CURRENCY') || err.message.includes('InvalidHospitalCode') || err.message.includes('InvalidEmail')) {
      return res.status(400).json({ success: false, code: 'VALIDATION_ERROR', message: err.message });
    }
    if (err.message.includes('DATABASE_UNAVAILABLE')) {
      return res.status(503).json({ success: false, code: 'DATABASE_UNAVAILABLE', message: 'Database is currently offline.' });
    }
    res.status(500).json({ success: false, code: 'PROFILE_UPDATE_ERROR', message: 'Failed to update institutional profile.' });
  }
});

// ==========================================
// PHASE 6B: DEPARTMENT MASTER MANAGEMENT
// ==========================================

// 1. List departments (All 7 roles)
apiRouter.get('/departments', requireRole(VALID_USER_ROLES as unknown as UserRole[]), async (req: AuthenticatedRequest, res: Response) => {
  try {
    let isActive: boolean | undefined = undefined;
    if (req.query.isActive === 'true') isActive = true;
    if (req.query.isActive === 'false') isActive = false;

    let discipline: DepartmentDiscipline | undefined = undefined;
    if (req.query.discipline) {
      const validDisciplines = ['AYURVEDA', 'MODERN_MEDICINE', 'OPERATIONAL', 'ALLIED'];
      if (!validDisciplines.includes(req.query.discipline as string)) {
        return res.status(400).json({
          success: false,
          code: 'INVALID_DISCIPLINE',
          message: `Discipline must be one of: ${validDisciplines.join(', ')}`
        });
      }
      discipline = req.query.discipline as DepartmentDiscipline;
    }

    const search = req.query.search as string | undefined;

    const list = await dbGetDepartments({ isActive, discipline, search });
    res.json({
      success: true,
      data: list,
      total: list.length
    });
  } catch (err: any) {
    res.status(500).json({ success: false, code: 'DEPARTMENTS_QUERY_ERROR', message: 'Failed to query departments.' });
  }
});

// 2. Read single department by ID or code (All 7 roles)
apiRouter.get('/departments/:id', requireRole(VALID_USER_ROLES as unknown as UserRole[]), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const dept = await dbGetDepartmentById(req.params.id);
    if (!dept) {
      return res.status(404).json({
        success: false,
        code: 'DEPARTMENT_NOT_FOUND',
        message: `Department "${req.params.id}" not found.`
      });
    }
    res.json({ success: true, data: dept });
  } catch (err: any) {
    res.status(500).json({ success: false, code: 'DEPARTMENT_RETRIEVAL_ERROR', message: 'Failed to retrieve department.' });
  }
});

// 3. Create department (SUPER_ADMIN and ADMIN only)
apiRouter.post('/departments', requireRole(['SUPER_ADMIN', 'ADMIN']), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { code, name, description, discipline } = req.body || {};

    if (!code || typeof code !== 'string') {
      return res.status(400).json({ success: false, code: 'CODE_REQUIRED', message: 'Department code is mandatory.' });
    }
    const cleanCode = code.trim();
    if (!/^[A-Z0-9]{2,10}$/.test(cleanCode)) {
      return res.status(400).json({
        success: false,
        code: 'INVALID_DEPARTMENT_CODE',
        message: 'Department code must be 2 to 10 uppercase alphanumeric characters.'
      });
    }

    if (!name || typeof name !== 'string' || name.trim().length < 2) {
      return res.status(400).json({ success: false, code: 'NAME_REQUIRED', message: 'Department name must be at least 2 characters.' });
    }

    if (discipline) {
      const validDisciplines = ['AYURVEDA', 'MODERN_MEDICINE', 'OPERATIONAL', 'ALLIED'];
      if (!validDisciplines.includes(discipline)) {
        return res.status(400).json({
          success: false,
          code: 'INVALID_DISCIPLINE',
          message: `Discipline must be one of: ${validDisciplines.join(', ')}`
        });
      }
    }

    const actor = {
      id: req.userId,
      name: req.userName || 'Administrator',
      role: req.userRole!
    };

    const created = await dbCreateDepartment({ code: cleanCode, name: name.trim(), description, discipline }, actor);
    res.status(201).json({ success: true, data: created });
  } catch (err: any) {
    if (err.message.includes('DuplicateDepartmentCode')) {
      return res.status(409).json({ success: false, code: 'DUPLICATE_DEPARTMENT_CODE', message: err.message });
    }
    if (err.message.includes('DuplicateDepartmentName')) {
      return res.status(409).json({ success: false, code: 'DUPLICATE_DEPARTMENT_NAME', message: err.message });
    }
    if (err.message.includes('InvalidDepartmentCode') || err.message.includes('NameRequired') || err.message.includes('InvalidDiscipline')) {
      return res.status(400).json({ success: false, code: 'VALIDATION_ERROR', message: err.message });
    }
    res.status(500).json({ success: false, code: 'DEPARTMENT_CREATION_ERROR', message: 'Failed to create department.' });
  }
});

// 4. Update department details (SUPER_ADMIN and ADMIN only)
apiRouter.patch('/departments/:id', requireRole(['SUPER_ADMIN', 'ADMIN']), async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (req.body.code !== undefined) {
      return res.status(400).json({
        success: false,
        code: 'IMMUTABLE_DEPARTMENT_CODE',
        message: 'Department code cannot be modified once created.'
      });
    }

    if (req.body.discipline !== undefined) {
      const validDisciplines = ['AYURVEDA', 'MODERN_MEDICINE', 'OPERATIONAL', 'ALLIED'];
      if (!validDisciplines.includes(req.body.discipline)) {
        return res.status(400).json({
          success: false,
          code: 'INVALID_DISCIPLINE',
          message: `Discipline must be one of: ${validDisciplines.join(', ')}`
        });
      }
    }

    const actor = {
      id: req.userId,
      name: req.userName || 'Administrator',
      role: req.userRole!
    };

    const updated = await dbUpdateDepartment(req.params.id, req.body, actor);
    res.json({ success: true, data: updated });
  } catch (err: any) {
    if (err.message.includes('DEPARTMENT_NOT_FOUND')) {
      return res.status(404).json({ success: false, code: 'DEPARTMENT_NOT_FOUND', message: err.message });
    }
    if (err.message.includes('DuplicateDepartmentName')) {
      return res.status(409).json({ success: false, code: 'DUPLICATE_DEPARTMENT_NAME', message: err.message });
    }
    if (err.message.includes('IMMUTABLE_DEPARTMENT_CODE') || err.message.includes('NameRequired') || err.message.includes('InvalidDiscipline')) {
      return res.status(400).json({ success: false, code: 'VALIDATION_ERROR', message: err.message });
    }
    res.status(500).json({ success: false, code: 'DEPARTMENT_UPDATE_ERROR', message: 'Failed to update department.' });
  }
});

// 5. Deactivate department (SUPER_ADMIN and ADMIN only)
apiRouter.post('/departments/:id/deactivate', requireRole(['SUPER_ADMIN', 'ADMIN']), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const reason = req.body?.reason;
    if (!reason || typeof reason !== 'string' || !reason.trim()) {
      return res.status(400).json({
        success: false,
        code: 'REASON_REQUIRED',
        message: 'A non-empty deactivation reason is mandatory.'
      });
    }

    const actor = {
      id: req.userId,
      name: req.userName || 'Administrator',
      role: req.userRole!
    };

    const deactivated = await dbDeactivateDepartment(req.params.id, reason.trim(), actor);
    res.json({ success: true, data: deactivated });
  } catch (err: any) {
    if (err.message.includes('DEPARTMENT_NOT_FOUND')) {
      return res.status(404).json({ success: false, code: 'DEPARTMENT_NOT_FOUND', message: err.message });
    }
    if (err.message.includes('DEPARTMENT_ALREADY_INACTIVE')) {
      return res.status(409).json({ success: false, code: 'DEPARTMENT_ALREADY_INACTIVE', message: err.message });
    }
    res.status(500).json({ success: false, code: 'DEPARTMENT_DEACTIVATION_ERROR', message: 'Failed to deactivate department.' });
  }
});

// 6. Reactivate department (SUPER_ADMIN and ADMIN only)
apiRouter.post('/departments/:id/activate', requireRole(['SUPER_ADMIN', 'ADMIN']), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const actor = {
      id: req.userId,
      name: req.userName || 'Administrator',
      role: req.userRole!
    };

    const activated = await dbActivateDepartment(req.params.id, actor);
    res.json({ success: true, data: activated });
  } catch (err: any) {
    if (err.message.includes('DEPARTMENT_NOT_FOUND')) {
      return res.status(404).json({ success: false, code: 'DEPARTMENT_NOT_FOUND', message: err.message });
    }
    if (err.message.includes('DEPARTMENT_ALREADY_ACTIVE')) {
      return res.status(409).json({ success: false, code: 'DEPARTMENT_ALREADY_ACTIVE', message: err.message });
    }
    res.status(500).json({ success: false, code: 'DEPARTMENT_ACTIVATION_ERROR', message: 'Failed to reactivate department.' });
  }
});

// 7. Get department staff assignments (All 7 roles)
apiRouter.get('/departments/:id/staff', requireRole(VALID_USER_ROLES as unknown as UserRole[]), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const dept = await dbGetDepartmentById(req.params.id);
    if (!dept) {
      return res.status(404).json({
        success: false,
        code: 'DEPARTMENT_NOT_FOUND',
        message: `Department "${req.params.id}" not found.`
      });
    }

    const assignments = await dbGetDepartmentStaff(dept.id, {
      status: req.query.status as AssignmentStatus | undefined
    });

    // Sanitize staff records: omit credentials and PINs
    const sanitized = assignments.map((a) => {
      const { activationPin, activationPinHash, ...safeStaff } = a.staffMember as any;
      return {
        id: a.id,
        staffId: a.staffId,
        departmentId: a.departmentId,
        isPrimary: a.isPrimary,
        roleTitle: a.roleTitle,
        status: a.status,
        startDate: a.startDate,
        endDate: a.endDate,
        assignedByName: a.assignedByName,
        staffMember: safeStaff
      };
    });

    res.json({ success: true, data: sanitized });
  } catch (err: any) {
    res.status(500).json({ success: false, code: 'DEPARTMENT_STAFF_ERROR', message: 'Failed to retrieve department staff.' });
  }
});

// ==========================================
// 1. OVERVIEW & METRICS (OverviewController)
// ==========================================
apiRouter.get('/overview', requireRole(VALID_USER_ROLES as unknown as UserRole[]), async (_req: Request, res: Response) => {
  const metrics = await dbGetOverviewMetrics();
  res.json({ success: true, data: metrics });
});

// ==========================================
// 2. PATIENTS MODULE (PatientsController)
// ==========================================

// Search & list patients with pagination, filtering, and role-based access
apiRouter.get('/patients', requirePermission(CLINICAL_PERMISSIONS.PATIENT_READ), async (req: AuthenticatedRequest, res: Response) => {
  const userRole = req.userRole;
  const patientMrn = req.patientMrn;
  const { search, status, admissionStatus, page, limit, sortBy, sortOrder } = req.query;

  // If query parameters or pagination are requested
  if (
    search !== undefined ||
    status !== undefined ||
    admissionStatus !== undefined ||
    page !== undefined ||
    limit !== undefined ||
    sortBy !== undefined
  ) {
    const searchResults = await dbSearchPatients({
      search: search ? String(search) : undefined,
      status: status ? String(status) : undefined,
      admissionStatus: admissionStatus ? String(admissionStatus) : undefined,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 50,
      sortBy: sortBy ? String(sortBy) : 'createdAt',
      sortOrder: (sortOrder === 'asc' || sortOrder === 'desc') ? sortOrder : 'desc',
      userRole
    });
    return res.json({
      success: true,
      data: searchResults.patients,
      total: searchResults.total,
      page: searchResults.page,
      limit: searchResults.limit,
      totalPages: searchResults.totalPages
    });
  }

  // Base list
  const activePatients = await dbGetPatients(userRole, patientMrn);
  res.json({ success: true, data: activePatients, total: activePatients.length });
});

// Duplicate patient detection endpoint
apiRouter.post('/patients/check-duplicates', requirePermission(CLINICAL_PERMISSIONS.PATIENT_CREATE), async (req: AuthenticatedRequest, res: Response) => {
  const { phone, firstName, lastName, dob, email, mrn } = req.body;
  const matches = await checkDuplicatePatients({ phone, firstName, lastName, dob, email, mrn });
  res.json({
    success: true,
    hasDuplicates: matches.length > 0,
    matches
  });
});

// Single patient details lookup
apiRouter.get('/patients/:id', requirePermission(CLINICAL_PERMISSIONS.PATIENT_READ), async (req: AuthenticatedRequest, res: Response) => {
  const patient = await dbGetPatientByIdOrMrn(req.params.id);
  if (!patient || patient.deletedAt) {
    return res.status(404).json({ success: false, message: 'Patient record not found' });
  }
  res.json({ success: true, data: patient });
});

// Comprehensive patient dossier & encounter aggregation
apiRouter.get('/patients/:id/dossier', requirePermission(CLINICAL_PERMISSIONS.PATIENT_READ), async (req: AuthenticatedRequest, res: Response) => {
  const dossier = await dbGetPatientDossier(req.params.id, req.userRole);
  if (!dossier) {
    return res.status(404).json({ success: false, message: 'Patient dossier not found' });
  }
  res.json({ success: true, data: dossier });
});

// Register new patient with sequence-backed MRN & duplicate protection
apiRouter.post('/patients', requirePermission(CLINICAL_PERMISSIONS.PATIENT_CREATE), async (req: AuthenticatedRequest, res: Response) => {
  const body = req.body;
  const actor = req.userName || 'Clinical Registrar';
  const role = req.userRole!;

  // 1. Validate required fields
  const firstName = (body.firstName || '').trim();
  const lastName = (body.lastName || '').trim();
  const phone = (body.phone || '').trim();
  const gender = (body.gender || 'Undisclosed').trim();

  if (!firstName) {
    return res.status(400).json({ success: false, message: 'Patient first name is required' });
  }
  if (!lastName) {
    return res.status(400).json({ success: false, message: 'Patient last name is required' });
  }
  if (!phone || phone.length < 7) {
    return res.status(400).json({ success: false, message: 'A valid primary phone number is required' });
  }

  // 2. Duplicate Detection Check (unless staff explicitly chose to override)
  if (!body.overrideDuplicate && !body.allowDuplicate) {
    const duplicates = await checkDuplicatePatients({
      phone,
      firstName,
      lastName,
      dob: body.dob,
      email: body.email
    });
    if (duplicates.length > 0) {
      return res.status(409).json({
        success: false,
        code: 'DUPLICATE_PATIENT_DETECTED',
        message: 'Potential duplicate patient record detected with matching identifiers.',
        duplicates
      });
    }
  }

  // 3. Clinical field authorization: Non-clinicians cannot record clinical notes/diagnoses
  const isClinician = role === 'DOCTOR' || role === 'VAIDYA';
  const clinicalFields = [
    'allergies',
    'allergyStatus',
    'chronicConditions',
    'pastMedicalHistory',
    'pastSurgicalHistory',
    'familyHistory',
    'currentMedications',
    'pastDiagnoses',
    'medicalHistoryNotes',
    'clinicalNotes',
    'doshaProfile',
    'latestVitals'
  ];

  if (!isClinician) {
    const attempted = Object.keys(body).filter((k) => {
      if (!clinicalFields.includes(k)) return false;
      const val = body[k];
      if (val === undefined || val === null || val === '') return false;
      if (Array.isArray(val) && val.length === 0) return false;
      if (k === 'allergyStatus' && val === 'not_recorded') return false;
      if (k === 'medicalHistoryStatus' && val === 'not_recorded') return false;
      return true;
    });
    if (attempted.length > 0) {
      return res.status(403).json({
        success: false,
        code: 'CLINICAL_FIELD_RESTRICTED',
        message: `Clinical documentation fields (${attempted.join(', ')}) can only be recorded by authorized clinicians (DOCTOR, VAIDYA).`
      });
    }
  }

  // 4. Server-side sequence-backed MRN generation (fail-closed authoritative sequence)
  let newMrn: string;
  try {
    newMrn = (body.mrn && typeof body.mrn === 'string' && body.mrn.trim())
      ? body.mrn.trim()
      : await generateUniquePatientNumber();
  } catch (err: any) {
    return res.status(503).json({
      success: false,
      code: 'MRN_SEQUENCE_UNAVAILABLE',
      message: `Failed to allocate authoritative unique patient number: ${err?.message || 'PostgreSQL sequence unavailable'}. Registration aborted.`
    });
  }

  // 5. Calculate age if DOB is provided
  let calculatedAge = Number(body.age) || undefined;
  if (body.dob) {
    const birthDate = new Date(body.dob);
    if (!isNaN(birthDate.getTime())) {
      const today = new Date();
      let age = today.getFullYear() - birthDate.getFullYear();
      const m = today.getMonth() - birthDate.getMonth();
      if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
        age--;
      }
      calculatedAge = Math.max(0, age);
    }
  }

  const newPatient: Patient = {
    id: (body.id && typeof body.id === 'string' && body.id.trim())
      ? body.id.trim()
      : `pat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    mrn: newMrn,
    firstName,
    middleName: body.middleName?.trim() || undefined,
    lastName,
    dob: body.dob || undefined,
    age: calculatedAge,
    gender,
    bloodGroup: body.bloodGroup || undefined,
    preferredLanguage: body.preferredLanguage?.trim() || undefined,
    photoUrl: body.photoUrl || undefined,
    status: (body.status as any) || 'active',
    admissionStatus: body.admissionStatus?.trim() || undefined,
    phone,
    secondaryPhone: body.secondaryPhone?.trim() || undefined,
    email: body.email?.trim() || undefined,
    communicationPreference: body.communicationPreference?.trim() || undefined,
    contactLanguage: body.contactLanguage?.trim() || undefined,
    address: body.address || body.addressLine1 || undefined,
    addressLine1: body.addressLine1?.trim() || undefined,
    addressLine2: body.addressLine2?.trim() || undefined,
    locality: body.locality?.trim() || undefined,
    city: body.city?.trim() || undefined,
    district: body.district?.trim() || undefined,
    state: body.state?.trim() || undefined,
    postalCode: body.postalCode?.trim() || undefined,
    country: body.country?.trim() || undefined,
    emergencyContact: body.emergencyContact || (body.emergencyContactName ? {
      name: body.emergencyContactName,
      relationship: body.emergencyContactRelation || 'Family',
      phone: body.emergencyContactPhone || '',
      altPhone: body.emergencyContactAltPhone
    } : undefined),
    emergencyContactName: body.emergencyContactName || body.emergencyContact?.name || undefined,
    emergencyContactRelation: body.emergencyContactRelation || body.emergencyContact?.relationship || undefined,
    emergencyContactPhone: body.emergencyContactPhone || body.emergencyContact?.phone || undefined,
    emergencyContactAltPhone: body.emergencyContactAltPhone || body.emergencyContact?.altPhone || undefined,
    allergyStatus: isClinician ? (body.allergyStatus || (body.allergies?.length ? 'known_allergies' : 'not_recorded')) : 'not_recorded',
    allergies: isClinician ? (body.allergies || []) : [],
    medicalHistoryStatus: isClinician ? (body.medicalHistoryStatus || 'not_recorded') : 'not_recorded',
    chronicConditions: isClinician ? (body.chronicConditions || []) : [],
    pastMedicalHistory: isClinician ? body.pastMedicalHistory : undefined,
    pastSurgicalHistory: isClinician ? body.pastSurgicalHistory : undefined,
    familyHistory: isClinician ? body.familyHistory : undefined,
    currentMedications: isClinician ? (body.currentMedications || []) : [],
    pastDiagnoses: isClinician ? (body.pastDiagnoses || []) : [],
    medicalHistoryNotes: isClinician ? body.medicalHistoryNotes : undefined,
    clinicalNotes: isClinician ? body.clinicalNotes : undefined,
    doshaProfile: isClinician ? body.doshaProfile : undefined,
    currentWard: body.currentWard || undefined,
    currentBed: body.currentBed || undefined,
    assignedDoctorId: body.assignedDoctorId || undefined,
    assignedDoctorName: body.assignedDoctorName || undefined,
    admissionDate: new Date().toISOString(),
    insurance: body.insurance || undefined,
    latestVitals: isClinician && body.latestVitals ? body.latestVitals : undefined,
    isRegistered: true,
    registeredById: actor,
    registeredByName: actor
  };

  const createdPatient = await dbCreatePatient(newPatient);
  await dbLogAudit(
    actor,
    role,
    'Created Patient Record',
    'EMR Access',
    `Registered master patient record for ${createdPatient.firstName} ${createdPatient.lastName} (${createdPatient.mrn})`,
    createdPatient.mrn
  );

  // Background sync to Supabase PostgreSQL when active
  persistPatientToSupabase(createdPatient).catch(() => {});

  res.status(201).json({ success: true, data: createdPatient });
});

// Update patient details with role-based clinical field protection
apiRouter.patch('/patients/:id', requirePermission(CLINICAL_PERMISSIONS.PATIENT_UPDATE), async (req: AuthenticatedRequest, res: Response) => {
  const actor = req.userName || 'Authorized Staff';
  const role = req.userRole!;

  const isClinician = role === 'DOCTOR' || role === 'VAIDYA';
  const clinicalFields = [
    'allergies',
    'allergyStatus',
    'medicalHistoryStatus',
    'chronicConditions',
    'pastMedicalHistory',
    'pastSurgicalHistory',
    'familyHistory',
    'currentMedications',
    'pastDiagnoses',
    'medicalHistoryNotes',
    'clinicalNotes',
    'doshaProfile',
    'latestVitals'
  ];

  // If a non-clinician attempts to modify clinical fields, reject with 403 Forbidden
  if (!isClinician) {
    const attemptedClinicalKeys = Object.keys(req.body).filter((k) => clinicalFields.includes(k) && req.body[k] !== undefined);
    if (attemptedClinicalKeys.length > 0) {
      return res.status(403).json({
        success: false,
        code: 'CLINICAL_FIELD_RESTRICTED',
        message: `Clinical fields (${attemptedClinicalKeys.join(', ')}) can only be modified by authorized clinicians (DOCTOR, VAIDYA).`
      });
    }
  }

  const updated = await dbUpdatePatient(req.params.id, req.body, role);
  if (!updated) {
    return res.status(404).json({ success: false, message: 'Patient record not found' });
  }

  const updatedFields = Object.keys(req.body).filter(k => k !== 'id' && k !== 'mrn').join(', ');
  await dbLogAudit(
    actor,
    role,
    'Updated Patient Record',
    'EMR Access',
    `Updated fields (${updatedFields}) for patient ${updated.mrn}`,
    updated.mrn
  );

  // Background sync to Supabase PostgreSQL when active
  persistPatientToSupabase(updated).catch(() => {});

  res.json({ success: true, data: updated });
});

// Delete or safely archive patient (Super Administrator only)
apiRouter.delete('/patients/:id', requireRole(['SUPER_ADMIN']), async (req: AuthenticatedRequest, res: Response) => {
  const actor = req.userName || 'Super Administrator';
  const role = req.userRole!;

  const result = await dbDeletePatient(req.params.id, actor, req.body?.reason);
  if (!result.success) {
    return res.status(404).json({ success: false, message: result.message });
  }

  await dbLogAudit(
    actor,
    role,
    'Archived Patient Record',
    'Patient Deletion',
    result.message,
    req.params.id
  );

  res.json(result);
});

// ==========================================
// 3. APPOINTMENTS & RECEPTION MODULE (AppointmentsController)
// ==========================================

// Query Appointments Directory with multi-factor filters, pagination & Doctor/Vaidya isolation
apiRouter.get('/appointments', requirePermission(CLINICAL_PERMISSIONS.APPOINTMENT_READ), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await dbGetAppointments({
      date: req.query.date as string,
      status: req.query.status as string,
      practitionerRole: req.query.practitionerRole as string,
      practitionerId: req.query.practitionerId as string,
      search: req.query.search as string,
      patientId: req.query.patientId as string,
      userRole: req.userRole,
      userId: req.userId,
      page: Number(req.query.page) || 1,
      limit: Number(req.query.limit) || 50,
      sortBy: (req.query.sortBy as string) || 'dateTime',
      sortOrder: (req.query.sortOrder as 'asc' | 'desc') || 'desc'
    });

    res.json({
      success: true,
      data: result.appointments,
      total: result.total,
      page: result.page,
      limit: result.limit,
      totalPages: result.totalPages
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message || 'Failed to query appointments' });
  }
});

// Single appointment lookup
apiRouter.get('/appointments/:id', requirePermission(CLINICAL_PERMISSIONS.APPOINTMENT_READ), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const apt = await dbGetAppointmentById(req.params.id);
    if (!apt) {
      return res.status(404).json({ success: false, message: 'Appointment not found' });
    }

    // Role boundary: DOCTOR and VAIDYA can only inspect their own discipline's appointments
    if (req.userRole === 'DOCTOR' && apt.practitionerRole === 'VAIDYA' && apt.practitionerId !== req.userId) {
      return res.status(403).json({ success: false, message: 'Access Denied: Doctors cannot view Vaidya clinical encounters.' });
    }
    if (req.userRole === 'VAIDYA' && apt.practitionerRole === 'DOCTOR' && apt.practitionerId !== req.userId) {
      return res.status(403).json({ success: false, message: 'Access Denied: Vaidyas cannot view Doctor clinical encounters.' });
    }

    res.json({ success: true, data: apt });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message || 'Failed to retrieve appointment' });
  }
});

// Schedule new appointment with conflict detection & sequence-backed reference
apiRouter.post('/appointments', requirePermission(CLINICAL_PERMISSIONS.APPOINTMENT_SCHEDULE), async (req: AuthenticatedRequest, res: Response) => {
  const body = req.body;
  const actor = { id: req.userId, name: req.userName || 'Staff Scheduler', role: req.userRole };

  try {
    const createdApt = await dbCreateAppointment(body, actor);

    await dbLogAudit(
      actor.name,
      actor.role!,
      'Scheduled Clinical Appointment',
      'Appointment Scheduled',
      `Booked ${createdApt.type} with ${createdApt.practitionerName} for ${createdApt.patientName} (${createdApt.appointmentNumber}) on ${createdApt.timeSlot}`,
      createdApt.patientMrn
    );

    res.status(201).json({ success: true, data: createdApt });
  } catch (err: any) {
    const msg = err.message || '';
    if (msg.includes('AppointmentConflict')) {
      const match = msg.match(/\(([A-Za-z0-9-]+)\)/);
      return res.status(409).json({
        success: false,
        code: 'APPOINTMENT_CONFLICT',
        message: msg.replace('AppointmentConflict: ', ''),
        conflict: {
          existingAppointmentId: (err as any).conflictDetails?.id || (match ? match[1] : undefined),
          appointmentNumber: (err as any).conflictDetails?.appointmentNumber
        }
      });
    }
    if (msg.includes('ClinicalTriageRestricted')) {
      return res.status(403).json({
        success: false,
        code: 'CLINICAL_TRIAGE_RESTRICTED',
        message: msg.replace('ClinicalTriageRestricted: ', '')
      });
    }
    if (msg.includes('ClinicalDisciplineMismatch')) {
      return res.status(403).json({
        success: false,
        code: 'CLINICAL_DISCIPLINE_MISMATCH',
        message: msg.replace('ClinicalDisciplineMismatch: ', '')
      });
    }
    if (msg.includes('EscalationReasonRequired')) {
      return res.status(400).json({
        success: false,
        code: 'ESCALATION_REASON_REQUIRED',
        message: msg.replace('EscalationReasonRequired: ', '')
      });
    }
    if (msg.includes('PatientNotFound')) {
      return res.status(404).json({
        success: false,
        code: 'PATIENT_NOT_FOUND',
        message: msg.replace('PatientNotFound: ', '')
      });
    }
    if (msg.includes('InvalidPractitionerRole')) {
      return res.status(400).json({
        success: false,
        code: 'INVALID_PRACTITIONER_ROLE',
        message: msg
      });
    }
    if (msg.includes('PractitionerNotFound') || msg.includes('PractitionerInactive')) {
      return res.status(400).json({
        success: false,
        code: 'INVALID_PRACTITIONER',
        message: msg
      });
    }
    if (msg.includes('PatientRequired') || msg.includes('PractitionerRequired') || msg.includes('InvalidDateTime')) {
      return res.status(400).json({
        success: false,
        code: 'VALIDATION_ERROR',
        message: msg
      });
    }
    res.status(500).json({ success: false, message: msg || 'Failed to schedule appointment' });
  }
});

// Register Walk-in Patient directly to Waiting Queue
apiRouter.post('/appointments/walk-in', requirePermission(CLINICAL_PERMISSIONS.APPOINTMENT_SCHEDULE), async (req: AuthenticatedRequest, res: Response) => {
  const body = req.body;
  const actor = { id: req.userId, name: req.userName || 'Reception Intake', role: req.userRole };

  try {
    const walkInApt = await dbCreateWalkInAppointment(body, actor);

    await dbLogAudit(
      actor.name,
      actor.role!,
      'Registered Walk-in Patient',
      'Reception Operations',
      `Admitted walk-in ${walkInApt.patientName} (${walkInApt.patientMrn}) to ${walkInApt.practitionerName}'s queue at pos #${walkInApt.queuePosition}`,
      walkInApt.patientMrn
    );

    res.status(201).json({ success: true, data: walkInApt });
  } catch (err: any) {
    const msg = err.message || '';
    if (msg.includes('PriorityReasonRequired')) {
      return res.status(400).json({
        success: false,
        code: 'PRIORITY_REASON_REQUIRED',
        message: msg.replace('PriorityReasonRequired: ', '')
      });
    }
    if (msg.includes('ClinicalTriageRestricted')) {
      return res.status(403).json({
        success: false,
        code: 'CLINICAL_TRIAGE_RESTRICTED',
        message: msg.replace('ClinicalTriageRestricted: ', '')
      });
    }
    if (msg.includes('ClinicalDisciplineMismatch')) {
      return res.status(403).json({
        success: false,
        code: 'CLINICAL_DISCIPLINE_MISMATCH',
        message: msg.replace('ClinicalDisciplineMismatch: ', '')
      });
    }
    if (msg.includes('EscalationReasonRequired')) {
      return res.status(400).json({
        success: false,
        code: 'ESCALATION_REASON_REQUIRED',
        message: msg.replace('EscalationReasonRequired: ', '')
      });
    }
    if (msg.includes('PatientNotFound')) {
      return res.status(404).json({
        success: false,
        code: 'PATIENT_NOT_FOUND',
        message: msg.replace('PatientNotFound: ', '')
      });
    }
    if (msg.includes('InvalidPractitionerRole')) {
      return res.status(400).json({
        success: false,
        code: 'INVALID_PRACTITIONER_ROLE',
        message: msg
      });
    }
    if (msg.includes('PractitionerNotFound') || msg.includes('PractitionerInactive')) {
      return res.status(400).json({
        success: false,
        code: 'INVALID_PRACTITIONER',
        message: msg
      });
    }
    res.status(400).json({ success: false, message: msg || 'Failed to admit walk-in patient' });
  }
});

// Reception Patient Check-In & Queue Placement
apiRouter.post('/appointments/:id/check-in', requirePermission(CLINICAL_PERMISSIONS.APPOINTMENT_CHECK_IN), async (req: AuthenticatedRequest, res: Response) => {
  const actor = { id: req.userId, name: req.userName || 'Reception Desk', role: req.userRole };

  try {
    const checkedIn = await dbCheckInAppointment(req.params.id, req.body.receptionNotes, actor);

    await dbLogAudit(
      actor.name,
      actor.role!,
      'Patient Checked In',
      'Reception Operations',
      `Checked in ${checkedIn.patientName} (${checkedIn.appointmentNumber}) into queue position #${checkedIn.queuePosition}`,
      checkedIn.patientMrn
    );

    res.json({ success: true, data: checkedIn });
  } catch (err: any) {
    const msg = err.message || '';
    if (msg.includes('AlreadyCheckedIn')) {
      return res.status(400).json({
        success: false,
        code: 'ALREADY_CHECKED_IN',
        message: msg.replace('AlreadyCheckedIn: ', '')
      });
    }
    if (msg.includes('InvalidStatusTransition')) {
      return res.status(400).json({
        success: false,
        code: 'INVALID_STATUS_TRANSITION',
        message: msg.replace('InvalidStatusTransition: ', '')
      });
    }
    if (msg.includes('AppointmentNotFound')) {
      return res.status(404).json({ success: false, message: 'Appointment not found' });
    }
    res.status(500).json({ success: false, message: msg || 'Failed to check in patient' });
  }
});

// Reschedule Appointment
apiRouter.post('/appointments/:id/reschedule', requirePermission(CLINICAL_PERMISSIONS.APPOINTMENT_SCHEDULE), async (req: AuthenticatedRequest, res: Response) => {
  const actor = { id: req.userId, name: req.userName || 'Staff Scheduler', role: req.userRole };
  const { newDateTime, newTimeSlot, reason } = req.body;

  if (!newDateTime || !newTimeSlot) {
    return res.status(400).json({
      success: false,
      code: 'MISSING_RESCHEDULE_DETAILS',
      message: 'Both newDateTime and newTimeSlot are required to reschedule.'
    });
  }

  try {
    const rescheduled = await dbRescheduleAppointment(req.params.id, newDateTime, newTimeSlot, reason, actor);

    await dbLogAudit(
      actor.name,
      actor.role!,
      'Rescheduled Appointment',
      'Appointment Scheduled',
      `Rescheduled ${rescheduled.appointmentNumber} for ${rescheduled.patientName} to ${newDateTime} (${newTimeSlot}): ${reason || 'Reason unspecified'}`,
      rescheduled.patientMrn
    );

    res.json({ success: true, data: rescheduled });
  } catch (err: any) {
    const msg = err.message || '';
    if (msg.includes('AppointmentConflict')) {
      return res.status(409).json({
        success: false,
        code: 'APPOINTMENT_CONFLICT',
        message: msg.replace('AppointmentConflict: ', '')
      });
    }
    if (msg.includes('InvalidStatusTransition')) {
      return res.status(400).json({
        success: false,
        code: 'INVALID_STATUS_TRANSITION',
        message: msg.replace('InvalidStatusTransition: ', '')
      });
    }
    if (msg.includes('AppointmentNotFound')) {
      return res.status(404).json({ success: false, message: 'Appointment not found' });
    }
    res.status(500).json({ success: false, message: msg || 'Failed to reschedule appointment' });
  }
});

// Cancel Appointment
apiRouter.post('/appointments/:id/cancel', requirePermission(CLINICAL_PERMISSIONS.APPOINTMENT_CANCEL), async (req: AuthenticatedRequest, res: Response) => {
  const actor = { id: req.userId, name: req.userName || 'Authorized Staff', role: req.userRole };
  const cancelReason = (req.body.cancellationReason || req.body.reason || '').trim();

  if (!cancelReason) {
    return res.status(400).json({
      success: false,
      code: 'CANCELLATION_REASON_REQUIRED',
      message: 'A non-empty cancellation reason is strictly required to cancel an appointment.'
    });
  }

  try {
    const cancelled = await dbUpdateAppointmentStatus(req.params.id, 'cancelled', cancelReason, actor);

    await dbLogAudit(
      actor.name,
      actor.role!,
      'Cancelled Appointment',
      'Appointment Scheduled',
      `Cancelled ${cancelled.appointmentNumber} for ${cancelled.patientName}. Reason: ${cancelReason}`,
      cancelled.patientMrn
    );

    res.json({ success: true, data: cancelled });
  } catch (err: any) {
    const msg = err.message || '';
    if (msg.includes('AlreadyCheckedIn')) {
      return res.status(400).json({
        success: false,
        code: 'ALREADY_CHECKED_IN',
        message: msg.replace('AlreadyCheckedIn: ', '')
      });
    }
    if (msg.includes('InvalidStatusTransition')) {
      return res.status(400).json({
        success: false,
        code: 'INVALID_STATUS_TRANSITION',
        message: msg.replace('InvalidStatusTransition: ', '')
      });
    }
    if (msg.includes('AppointmentNotFound')) {
      return res.status(404).json({ success: false, message: 'Appointment not found' });
    }
    res.status(500).json({ success: false, message: msg || 'Failed to cancel appointment' });
  }
});

// General update / status transition
apiRouter.patch('/appointments/:id', requirePermission(CLINICAL_PERMISSIONS.APPOINTMENT_SCHEDULE), async (req: AuthenticatedRequest, res: Response) => {
  const actor = { id: req.userId, name: req.userName || 'Staff Scheduler', role: req.userRole };

  try {
    // If status transition is requested:
    if (req.body.status) {
      const targetStatus = req.body.status.toLowerCase();
      if (targetStatus === 'cancelled') {
        if (!req.body.cancellationReason || !req.body.cancellationReason.trim()) {
          return res.status(400).json({
            success: false,
            code: 'CANCELLATION_REASON_REQUIRED',
            message: 'Cancellation reason is strictly required.'
          });
        }
      }
      const updated = await dbUpdateAppointmentStatus(req.params.id, targetStatus, req.body.cancellationReason || req.body.reason, actor);

      await dbLogAudit(
        actor.name,
        actor.role!,
        'Updated Appointment Status',
        'Appointment Scheduled',
        `Updated status to ${targetStatus} for ${updated.appointmentNumber} (${updated.patientName})`,
        updated.patientMrn
      );
      return res.json({ success: true, data: updated });
    }

    // Practitioner reassignment tracking:
    if (req.body.practitionerId) {
      const existing = await dbGetAppointmentById(req.params.id);
      if (existing && existing.practitionerId !== req.body.practitionerId) {
        await dbLogAudit(
          actor.name,
          actor.role!,
          'Reassigned Practitioner',
          'Appointment Scheduled',
          `Reassigned ${existing.appointmentNumber} from ${existing.practitionerName} to ${req.body.practitionerName || req.body.practitionerId}. Reason: ${req.body.reason || 'Operational adjustment'}`,
          existing.patientMrn
        );
      }
    }

    const updated = await dbUpdateAppointment(req.params.id, req.body, actor);
    if (!updated) {
      return res.status(404).json({ success: false, message: 'Appointment not found' });
    }

    await dbLogAudit(
      actor.name,
      actor.role!,
      'Updated Appointment',
      'Appointment Scheduled',
      `Updated appointment details for ${updated.appointmentNumber} (${updated.patientName})`,
      updated.patientMrn
    );

    res.json({ success: true, data: updated });
  } catch (err: any) {
    const msg = err.message || '';
    if (msg.includes('AlreadyCheckedIn')) {
      return res.status(400).json({
        success: false,
        code: 'ALREADY_CHECKED_IN',
        message: msg.replace('AlreadyCheckedIn: ', '')
      });
    }
    if (msg.includes('InvalidStatusTransition')) {
      return res.status(400).json({
        success: false,
        code: 'INVALID_STATUS_TRANSITION',
        message: msg.replace('InvalidStatusTransition: ', '')
      });
    }
    if (msg.includes('CancellationReasonRequired')) {
      return res.status(400).json({
        success: false,
        code: 'CANCELLATION_REASON_REQUIRED',
        message: msg.replace('CancellationReasonRequired: ', '')
      });
    }
    res.status(500).json({ success: false, message: msg || 'Failed to update appointment' });
  }
});

// Consultation Handoff: waiting -> in_consultation
apiRouter.post('/appointments/:id/consultation-handoff', requirePermission(CLINICAL_PERMISSIONS.CONSULTATION_HANDOFF), async (req: AuthenticatedRequest, res: Response) => {
  const actor = { id: req.userId, name: req.userName || 'Clinician', role: req.userRole };

  try {
    const existing = await dbGetAppointmentById(req.params.id);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Appointment not found' });
    }

    // Role check: Doctor cannot hand off Vaidya appointment, Vaidya cannot hand off Doctor appointment
    if (req.userRole === 'DOCTOR' && existing.practitionerRole === 'VAIDYA' && existing.practitionerId !== req.userId) {
      return res.status(403).json({ success: false, code: 'CLINICAL_DISCIPLINE_MISMATCH', message: 'Forbidden: Doctors cannot conduct Ayurvedic consultations.' });
    }
    if (req.userRole === 'VAIDYA' && existing.practitionerRole === 'DOCTOR' && existing.practitionerId !== req.userId) {
      return res.status(403).json({ success: false, code: 'CLINICAL_DISCIPLINE_MISMATCH', message: 'Forbidden: Vaidyas cannot conduct Allopathic medical consultations.' });
    }

    const updated = await dbUpdateAppointmentStatus(req.params.id, 'in_consultation', undefined, actor);

    await dbLogAudit(
      actor.name,
      actor.role!,
      'Consultation Handoff',
      'Reception Operations',
      `${updated.patientName} (${updated.appointmentNumber}) called into consultation with ${updated.practitionerName}`,
      updated.patientMrn
    );

    res.json({ success: true, data: updated });
  } catch (err: any) {
    const msg = err.message || '';
    if (msg.includes('ClinicalAuthorityRequired')) {
      return res.status(403).json({
        success: false,
        code: 'CLINICAL_AUTHORITY_REQUIRED',
        message: msg.replace('ClinicalAuthorityRequired: ', '')
      });
    }
    if (msg.includes('ClinicalDisciplineMismatch')) {
      return res.status(403).json({
        success: false,
        code: 'CLINICAL_DISCIPLINE_MISMATCH',
        message: msg.replace('ClinicalDisciplineMismatch: ', '')
      });
    }
    if (msg.includes('AlreadyCheckedIn')) {
      return res.status(400).json({
        success: false,
        code: 'ALREADY_CHECKED_IN',
        message: msg.replace('AlreadyCheckedIn: ', '')
      });
    }
    if (msg.includes('InvalidStatusTransition')) {
      return res.status(400).json({
        success: false,
        code: 'INVALID_STATUS_TRANSITION',
        message: msg.replace('InvalidStatusTransition: ', '')
      });
    }
    res.status(500).json({ success: false, message: msg || 'Failed to initiate consultation handoff' });
  }
});

// Consultation Completion: in_consultation -> completed
apiRouter.post('/appointments/:id/complete', requirePermission(CLINICAL_PERMISSIONS.APPOINTMENT_COMPLETE), async (req: AuthenticatedRequest, res: Response) => {
  const actor = { id: req.userId, name: req.userName || 'Attending Physician', role: req.userRole };

  try {
    const existing = await dbGetAppointmentById(req.params.id);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Appointment not found' });
    }

    if (req.userRole === 'DOCTOR' && existing.practitionerRole === 'VAIDYA' && existing.practitionerId !== req.userId) {
      return res.status(403).json({ success: false, code: 'CLINICAL_DISCIPLINE_MISMATCH', message: 'Forbidden: Doctors cannot complete Ayurvedic consultations.' });
    }
    if (req.userRole === 'VAIDYA' && existing.practitionerRole === 'DOCTOR' && existing.practitionerId !== req.userId) {
      return res.status(403).json({ success: false, code: 'CLINICAL_DISCIPLINE_MISMATCH', message: 'Forbidden: Vaidyas cannot complete Allopathic medical consultations.' });
    }

    const updated = await dbUpdateAppointmentStatus(req.params.id, 'completed', undefined, actor);

    await dbLogAudit(
      actor.name,
      actor.role!,
      'Appointment Completed',
      'Appointment Scheduled',
      `Completed consultation for ${updated.patientName} (${updated.appointmentNumber}) with ${updated.practitionerName}`,
      updated.patientMrn
    );

    res.json({
      success: true,
      data: updated,
      clinicalDocumentationCompleted: false,
      clinicalRecordStatus: 'pending_clinical_module'
    });
  } catch (err: any) {
    const msg = err.message || '';
    if (msg.includes('ClinicalAuthorityRequired')) {
      return res.status(403).json({
        success: false,
        code: 'CLINICAL_AUTHORITY_REQUIRED',
        message: msg.replace('ClinicalAuthorityRequired: ', '')
      });
    }
    if (msg.includes('ClinicalDisciplineMismatch')) {
      return res.status(403).json({
        success: false,
        code: 'CLINICAL_DISCIPLINE_MISMATCH',
        message: msg.replace('ClinicalDisciplineMismatch: ', '')
      });
    }
    if (msg.includes('AlreadyCheckedIn')) {
      return res.status(400).json({
        success: false,
        code: 'ALREADY_CHECKED_IN',
        message: msg.replace('AlreadyCheckedIn: ', '')
      });
    }
    if (msg.includes('InvalidStatusTransition')) {
      return res.status(400).json({
        success: false,
        code: 'INVALID_STATUS_TRANSITION',
        message: msg.replace('InvalidStatusTransition: ', '')
      });
    }
    res.status(500).json({ success: false, message: msg || 'Failed to complete appointment' });
  }
});

// Real-time Patient Waiting Queue backed by PostgreSQL
apiRouter.get('/reception/queue', requirePermission(CLINICAL_PERMISSIONS.QUEUE_READ), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const queue = await dbGetReceptionQueue({
      practitionerRole: req.query.practitionerRole as string,
      practitionerId: req.query.practitionerId as string,
      status: req.query.status as string,
      date: req.query.date as string,
      userRole: req.userRole,
      userId: req.userId
    });

    res.json({ success: true, data: queue });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message || 'Failed to retrieve reception queue' });
  }
});

// Queue Priority Adjustment with mandatory justification reason
apiRouter.patch('/reception/queue/:id/priority', requirePermission(CLINICAL_PERMISSIONS.CLINICAL_TRIAGE), async (req: AuthenticatedRequest, res: Response) => {
  const actor = { id: req.userId, name: req.userName || 'Queue Coordinator', role: req.userRole };
  const { priority, priorityReason } = req.body;

  if (!priorityReason || !priorityReason.trim()) {
    return res.status(400).json({
      success: false,
      code: 'PRIORITY_REASON_REQUIRED',
      message: 'Explicit clinical justification reason is strictly required to adjust queue priority.'
    });
  }

  if (!['normal', 'priority', 'urgent'].includes(priority)) {
    return res.status(400).json({
      success: false,
      code: 'INVALID_PRIORITY_LEVEL',
      message: 'Priority must be one of: normal, priority, urgent.'
    });
  }

  try {
    const updated = await dbUpdateQueuePriority(req.params.id, priority, priorityReason, actor);

    await dbLogAudit(
      actor.name,
      actor.role!,
      'Updated Queue Priority',
      'Reception Operations',
      `Adjusted queue priority to ${priority.toUpperCase()} for ${updated.appointmentNumber} (${updated.patientName}). Reason: ${priorityReason}`,
      updated.patientMrn
    );

    res.json({ success: true, data: updated });
  } catch (err: any) {
    const msg = err.message || '';
    if (msg.includes('ClinicalTriageRestricted')) {
      return res.status(403).json({
        success: false,
        code: 'CLINICAL_TRIAGE_RESTRICTED',
        message: msg.replace('ClinicalTriageRestricted: ', '')
      });
    }
    if (msg.includes('ClinicalDisciplineMismatch')) {
      return res.status(403).json({
        success: false,
        code: 'CLINICAL_DISCIPLINE_MISMATCH',
        message: msg.replace('ClinicalDisciplineMismatch: ', '')
      });
    }
    if (msg.includes('PriorityReasonRequired')) {
      return res.status(400).json({
        success: false,
        code: 'PRIORITY_REASON_REQUIRED',
        message: msg.replace('PriorityReasonRequired: ', '')
      });
    }
    if (msg.includes('AppointmentNotFound')) {
      return res.status(404).json({ success: false, message: 'Appointment not found' });
    }
    res.status(500).json({ success: false, message: msg || 'Failed to adjust queue priority' });
  }
});

// Emergency Escalation for Patients in Reception Queue
apiRouter.post('/reception/queue/:id/escalate', requirePermission(CLINICAL_PERMISSIONS.QUEUE_EMERGENCY_ESCALATE), async (req: AuthenticatedRequest, res: Response) => {
  const actor = { id: req.userId, name: req.userName || 'Front Desk Staff', role: req.userRole };
  const { escalationReason } = req.body;

  if (!escalationReason || !escalationReason.trim()) {
    return res.status(400).json({
      success: false,
      code: 'ESCALATION_REASON_REQUIRED',
      message: 'Explicit escalation reason is mandatory to flag emergency escalation.'
    });
  }

  try {
    const updated = await dbEscalateQueuePatient(req.params.id, escalationReason.trim(), actor);

    await dbLogAudit(
      actor.name,
      actor.role!,
      'Emergency Escalation Flagged',
      'Reception Operations',
      `Emergency escalation flagged for ${updated.appointmentNumber} (${updated.patientName}). Reason: ${escalationReason.trim()}`,
      updated.patientMrn
    );

    res.json({ success: true, data: updated });
  } catch (err: any) {
    const msg = err.message || '';
    if (msg.includes('AppointmentNotFound')) {
      return res.status(404).json({ success: false, message: 'Appointment not found' });
    }
    if (msg.includes('EscalationReasonRequired')) {
      return res.status(400).json({
        success: false,
        code: 'ESCALATION_REASON_REQUIRED',
        message: msg.replace('EscalationReasonRequired: ', '')
      });
    }
    res.status(500).json({ success: false, message: msg || 'Failed to flag emergency escalation' });
  }
});

// Emergency Escalation Acknowledge (Clinicians only: DOCTOR or VAIDYA)
apiRouter.post('/reception/queue/:id/escalate/acknowledge', requirePermission(CLINICAL_PERMISSIONS.ESCALATION_ACKNOWLEDGE), async (req: AuthenticatedRequest, res: Response) => {
  const actor = { id: req.userId || 'clinician', name: req.userName || 'Clinician', role: req.userRole! };
  try {
    const updated = await dbAcknowledgeEscalation(req.params.id, actor);
    res.json({ success: true, data: updated });
  } catch (err: any) {
    const msg = err.message || '';
    if (msg.includes('AppointmentNotFound')) {
      return res.status(404).json({ success: false, message: 'Appointment not found' });
    }
    if (msg.includes('InvalidEscalationState')) {
      return res.status(400).json({ success: false, code: 'INVALID_ESCALATION_STATE', message: msg });
    }
    res.status(500).json({ success: false, message: msg || 'Failed to acknowledge emergency escalation' });
  }
});

// Emergency Escalation Resolve (Clinicians only: DOCTOR or VAIDYA)
apiRouter.post('/reception/queue/:id/escalate/resolve', requirePermission(CLINICAL_PERMISSIONS.ESCALATION_RESOLVE), async (req: AuthenticatedRequest, res: Response) => {
  const actor = { id: req.userId || 'clinician', name: req.userName || 'Clinician', role: req.userRole! };
  const { resolutionNotes } = req.body;

  if (!resolutionNotes || !resolutionNotes.trim()) {
    return res.status(400).json({
      success: false,
      code: 'RESOLUTION_NOTES_REQUIRED',
      message: 'Resolution notes authored by clinician are mandatory to resolve emergency escalation.'
    });
  }

  try {
    const updated = await dbResolveEscalation(req.params.id, resolutionNotes.trim(), actor);
    res.json({ success: true, data: updated });
  } catch (err: any) {
    const msg = err.message || '';
    if (msg.includes('AppointmentNotFound')) {
      return res.status(404).json({ success: false, message: 'Appointment not found' });
    }
    if (msg.includes('ResolutionNotesRequired')) {
      return res.status(400).json({ success: false, code: 'RESOLUTION_NOTES_REQUIRED', message: msg });
    }
    res.status(500).json({ success: false, message: msg || 'Failed to resolve emergency escalation' });
  }
});

// Real-time PostgreSQL-backed Reception Dashboard Metrics
apiRouter.get('/reception/dashboard', requirePermission(CLINICAL_PERMISSIONS.APPOINTMENT_READ), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const metrics = await dbGetReceptionDashboard(req.query.date as string);
    res.json({ success: true, data: metrics });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message || 'Failed to retrieve reception dashboard metrics' });
  }
});

// Automated reminder dispatcher endpoint
apiRouter.post('/appointments/:id/remind', requirePermission(CLINICAL_PERMISSIONS.APPOINTMENT_SCHEDULE), (req: AuthenticatedRequest, res: Response) => {
  const index = hospitalStore.appointments.findIndex((a) => a.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ success: false, message: 'Appointment not found' });
  }

  const apt = hospitalStore.appointments[index];
  const channel = (req.body.channel as 'SMS' | 'Email') || 'SMS';

  const newReminder: AppointmentReminder = {
    id: `rem-${Date.now()}`,
    appointmentId: apt.id,
    patientId: apt.patientId,
    patientName: apt.patientName,
    recipientPhone: apt.patientPhone,
    recipientEmail: apt.patientEmail || 'patient@sahachara.com',
    doctorName: apt.doctorName || 'Attending Physician',
    dateTime: `${apt.dateTime.split('T')[0]} at ${apt.timeSlot}`,
    channel,
    status: 'Delivered',
    sentAt: new Date().toISOString(),
    messageContent:
      channel === 'SMS'
        ? `SahacharaOS Alert: Hello ${apt.patientName}, your ${apt.type} with ${apt.doctorName} is confirmed for ${apt.timeSlot} on ${apt.dateTime.split('T')[0]}. Reply C to confirm or call hospital reception.`
        : `Subject: Appointment Reminder - SahacharaOS Health System. Dear ${apt.patientName}, your ${apt.type} with ${apt.doctorName} (${apt.department}) is scheduled for ${apt.timeSlot} on ${apt.dateTime.split('T')[0]}.`
  };

  apt.reminderSent = true;
  apt.reminderChannel = channel.toLowerCase() as any;
  apt.reminderSentAt = new Date().toISOString();

  hospitalStore.reminders.unshift(newReminder);
  hospitalStore.logAudit(
    req.userName || 'Automated Notification Service',
    req.userRole!,
    `Dispatched Automated ${channel} Reminder`,
    'Appointment Scheduled',
    `Sent automated appointment reminder to ${apt.patientName} via ${channel}`,
    apt.patientMrn
  );

  res.json({ success: true, data: newReminder });
});

apiRouter.get('/reminders', requirePermission(CLINICAL_PERMISSIONS.APPOINTMENT_READ), (_req: Request, res: Response) => {
  res.json({ success: true, data: hospitalStore.reminders });
});

// ==========================================
// 4. TRIAGE & EMERGENCY (TriageController)
// ==========================================
apiRouter.get('/triage', requirePermission(CLINICAL_PERMISSIONS.TRIAGE_MANAGE), (_req: Request, res: Response) => {
  res.json({ success: true, data: hospitalStore.triageRecords });
});

apiRouter.post('/triage', requirePermission(CLINICAL_PERMISSIONS.TRIAGE_MANAGE), (req: AuthenticatedRequest, res: Response) => {
  const body = req.body;
  const newTriage: TriageRecord = {
    id: `trg-${Date.now()}`,
    patientId: body.patientId || `pat-${Date.now()}`,
    patientName: body.patientName || 'Emergency Patient',
    mrn: body.mrn || `MRN-${Math.floor(10000 + Math.random() * 90000)}`,
    age: Number(body.age) || 45,
    gender: body.gender || 'Other',
    esiLevel: Number(body.esiLevel || 3) as any,
    chiefComplaint: body.chiefComplaint || 'Acute presentation',
    vitals: body.vitals || {
      bpSystolic: 120,
      bpDiastolic: 80,
      heartRate: 75,
      spo2: 98,
      temperature: 37.0,
      respRate: 16,
      recordedAt: new Date().toISOString()
    },
    triageNurse: body.triageNurse || req.userName || 'Triage Officer',
    arrivalTime: new Date().toISOString(),
    triageStatus: 'waiting',
    assignedRoom: body.assignedRoom || 'Triage Intake',
    notes: body.notes || ''
  };

  hospitalStore.triageRecords.unshift(newTriage);
  hospitalStore.logAudit(newTriage.triageNurse, req.userRole!, 'Scored Emergency Intake', 'Triage Admission', `Triaged ${newTriage.patientName} at ESI Level ${newTriage.esiLevel}`, newTriage.mrn);
  res.status(201).json({ success: true, data: newTriage });
});

apiRouter.patch('/triage/:id', requirePermission(CLINICAL_PERMISSIONS.TRIAGE_MANAGE), (req: AuthenticatedRequest, res: Response) => {
  const index = hospitalStore.triageRecords.findIndex((t) => t.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ success: false, message: 'Triage entry not found' });
  }
  const updated = { ...hospitalStore.triageRecords[index], ...req.body };
  hospitalStore.triageRecords[index] = updated;
  res.json({ success: true, data: updated });
});

// ==========================================
// 5. CLINICAL WORKFORCE & APPOINTMENT TRIAGE
// ==========================================

// ==========================================
// 6. DOCTORS & CLINICAL WORKFORCE STAFF (StaffController)
// ==========================================
apiRouter.get('/doctors', requireRole(VALID_USER_ROLES as unknown as UserRole[]), async (_req: Request, res: Response) => {
  try {
    const list = await dbGetPractitioners();
    if (list && list.length > 0) {
      return res.json({ success: true, data: list });
    }
  } catch {}
  res.json({ success: true, data: hospitalStore.doctors });
});

apiRouter.get('/practitioners', requireRole(VALID_USER_ROLES as unknown as UserRole[]), async (_req: Request, res: Response) => {
  try {
    const list = await dbGetPractitioners();
    return res.json({ success: true, data: list });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// 6. STAFF MANAGEMENT & ACCOUNT LIFECYCLE (Phase 6A)
// ==========================================

// 1. Staff directory listing with search, filtering, and pagination
apiRouter.get('/staff', requireRole(['SUPER_ADMIN', 'ADMIN']), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 25;
    const search = req.query.search as string;
    const role = req.query.role as string;
    const department = req.query.department as string;
    const status = req.query.status as string;
    const includeArchived = req.query.includeArchived === 'true';

    const result = await dbGetStaffList({
      page,
      limit,
      search,
      role,
      department,
      status,
      includeArchived
    });

    res.json({
      success: true,
      data: result.data,
      staff: result.data,
      pagination: result.pagination,
      total: result.pagination.total
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'StaffQueryError', message: err.message });
  }
});

// 2. Staff profile retrieval
apiRouter.get('/staff/:id', requireRole(VALID_USER_ROLES as unknown as UserRole[]), async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.userRole) {
      return res.status(401).json({ success: false, error: 'Unauthorized', message: 'Authentication required.' });
    }

    const staff = await dbGetStaffById(req.params.id);
    if (!staff) {
      return res.status(404).json({ success: false, error: 'StaffNotFound', message: `Staff member ${req.params.id} not found.` });
    }

    // Role check: Admin or self
    const isAdmin = req.userRole === 'SUPER_ADMIN' || req.userRole === 'ADMIN';
    const isSelf = staff.userId === req.userId || staff.email.toLowerCase() === req.userName?.toLowerCase();
    if (!isAdmin && !isSelf) {
      return res.status(403).json({ success: false, error: 'Forbidden', message: 'Access denied: Only administrators or the staff member themselves can view this profile.' });
    }

    res.json({ success: true, data: staff });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'StaffRetrievalError', message: err.message });
  }
});

// 3. Create new staff member
apiRouter.post('/staff', requireRole(['SUPER_ADMIN', 'ADMIN']), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const actor = {
      id: req.userId || 'sys-admin',
      name: req.userName || 'Administrator',
      role: req.userRole!
    };

    const { staff, activationPin } = await dbCreateStaffMember(req.body, actor);
    res.status(201).json({ success: true, data: staff, staff, activationPin });
  } catch (err: any) {
    if (err.message.includes('SUPER_ADMIN_CREATION_FORBIDDEN')) {
      return res.status(403).json({ success: false, error: 'SUPER_ADMIN_CREATION_FORBIDDEN', message: err.message });
    }
    if (err.message.includes('DuplicateEmail')) {
      return res.status(409).json({ success: false, error: 'DuplicateEmail', message: err.message });
    }
    if (
      err.message.includes('InvalidRole') ||
      err.message.includes('EmailRequired') ||
      err.message.includes('InvalidDomain') ||
      err.message.includes('NameRequired') ||
      err.message.includes('PhoneRequired') ||
      err.message.includes('DepartmentRequired') ||
      err.message.includes('DesignationRequired')
    ) {
      return res.status(400).json({ success: false, error: 'ValidationError', message: err.message });
    }
    res.status(500).json({ success: false, error: 'StaffCreationError', message: err.message });
  }
});

// 4. Update staff member permitted profile details
apiRouter.patch('/staff/:id', requireRole(['SUPER_ADMIN', 'ADMIN']), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const actor = {
      id: req.userId || 'sys-admin',
      name: req.userName || 'Administrator',
      role: req.userRole!
    };

    const updated = await dbUpdateStaffMember(req.params.id, req.body, actor);
    res.json({ success: true, data: updated, staff: updated });
  } catch (err: any) {
    if (err.message.includes('SUPER_ADMIN_MUTATION_FORBIDDEN')) {
      return res.status(403).json({ success: false, error: 'SUPER_ADMIN_MUTATION_FORBIDDEN', message: err.message });
    }
    if (err.message.includes('StaffNotFound')) {
      return res.status(404).json({ success: false, error: 'StaffNotFound', message: err.message });
    }
    res.status(500).json({ success: false, error: 'StaffUpdateError', message: err.message });
  }
});

// 5. Change authorized system role
apiRouter.patch('/staff/:id/role', requireRole(['SUPER_ADMIN', 'ADMIN']), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { newRole, reason } = req.body;
    if (!newRole) {
      return res.status(400).json({ success: false, error: 'MissingRole', message: 'Target newRole is mandatory.' });
    }

    const actor = {
      id: req.userId || 'sys-admin',
      name: req.userName || 'Administrator',
      role: req.userRole!
    };

    const updated = await dbChangeStaffRole(req.params.id, newRole, actor, reason);
    res.json({ success: true, data: updated, staff: updated });
  } catch (err: any) {
    if (
      err.message.includes('SELF_ROLE_ELEVATION_FORBIDDEN') ||
      err.message.includes('SUPER_ADMIN_PROMOTION_FORBIDDEN') ||
      err.message.includes('SUPER_ADMIN_MUTATION_FORBIDDEN')
    ) {
      return res.status(403).json({ success: false, error: 'RoleAuthorizationError', message: err.message });
    }
    if (err.message.includes('LAST_SUPER_ADMIN_PROTECTED') || err.message.includes('InvalidRole')) {
      return res.status(400).json({ success: false, error: 'RoleValidationError', message: err.message });
    }
    if (err.message.includes('StaffNotFound')) {
      return res.status(404).json({ success: false, error: 'StaffNotFound', message: err.message });
    }
    res.status(500).json({ success: false, error: 'RoleChangeError', message: err.message });
  }
});

// 6. Suspend staff member account (revokes active session)
apiRouter.post('/staff/:id/suspend', requireRole(['SUPER_ADMIN', 'ADMIN']), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { reason } = req.body;
    if (!reason || reason.trim() === '') {
      return res.status(400).json({ success: false, error: 'ReasonRequired', message: 'Suspension reason is mandatory.' });
    }

    const actor = {
      id: req.userId || 'sys-admin',
      name: req.userName || 'Administrator',
      role: req.userRole!
    };

    const updated = await dbSuspendStaff(req.params.id, actor, reason);
    res.json({ success: true, data: updated, staff: updated, message: `Staff member ${updated.name} has been suspended. Active sessions revoked.` });
  } catch (err: any) {
    if (err.message.includes('SUPER_ADMIN_MUTATION_FORBIDDEN')) {
      return res.status(403).json({ success: false, error: 'SUPER_ADMIN_MUTATION_FORBIDDEN', message: err.message });
    }
    if (err.message.includes('LAST_SUPER_ADMIN_PROTECTED')) {
      return res.status(400).json({ success: false, error: 'LAST_SUPER_ADMIN_PROTECTED', message: err.message });
    }
    if (err.message.includes('StaffNotFound')) {
      return res.status(404).json({ success: false, error: 'StaffNotFound', message: err.message });
    }
    res.status(500).json({ success: false, error: 'StaffSuspensionError', message: err.message });
  }
});

// 7. Reactivate suspended staff member
apiRouter.post('/staff/:id/reactivate', requireRole(['SUPER_ADMIN', 'ADMIN']), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const actor = {
      id: req.userId || 'sys-admin',
      name: req.userName || 'Administrator',
      role: req.userRole!
    };

    const updated = await dbReactivateStaff(req.params.id, actor, req.body.reason);
    res.json({ success: true, data: updated, staff: updated, message: `Staff member ${updated.name} has been reactivated.` });
  } catch (err: any) {
    if (err.message.includes('SUPER_ADMIN_MUTATION_FORBIDDEN')) {
      return res.status(403).json({ success: false, error: 'SUPER_ADMIN_MUTATION_FORBIDDEN', message: err.message });
    }
    if (err.message.includes('StaffNotFound')) {
      return res.status(404).json({ success: false, error: 'StaffNotFound', message: err.message });
    }
    res.status(500).json({ success: false, error: 'StaffReactivationError', message: err.message });
  }
});

// 8. Soft-archive staff member record
apiRouter.post('/staff/:id/archive', requireRole(['SUPER_ADMIN', 'ADMIN']), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { reason } = req.body;
    if (!reason || reason.trim() === '') {
      return res.status(400).json({ success: false, error: 'ReasonRequired', message: 'Archival reason is mandatory.' });
    }

    const actor = {
      id: req.userId || 'sys-admin',
      name: req.userName || 'Administrator',
      role: req.userRole!
    };

    const updated = await dbArchiveStaff(req.params.id, actor, reason);
    res.json({ success: true, data: updated, staff: updated, message: `Staff member ${updated.name} has been archived. Operational access revoked.` });
  } catch (err: any) {
    if (err.message.includes('SUPER_ADMIN_MUTATION_FORBIDDEN')) {
      return res.status(403).json({ success: false, error: 'SUPER_ADMIN_MUTATION_FORBIDDEN', message: err.message });
    }
    if (err.message.includes('LAST_SUPER_ADMIN_PROTECTED')) {
      return res.status(400).json({ success: false, error: 'LAST_SUPER_ADMIN_PROTECTED', message: err.message });
    }
    if (err.message.includes('StaffNotFound')) {
      return res.status(404).json({ success: false, error: 'StaffNotFound', message: err.message });
    }
    res.status(500).json({ success: false, error: 'StaffArchivalError', message: err.message });
  }
});

// 9. Regenerate activation security PIN
apiRouter.post('/staff/:id/regenerate-pin', requireRole(['SUPER_ADMIN', 'ADMIN']), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const actor = {
      id: req.userId || 'sys-admin',
      name: req.userName || 'Administrator',
      role: req.userRole!
    };

    const result = await dbRegenerateActivationPin(req.params.id, actor);
    res.json(result);
  } catch (err: any) {
    if (err.message.includes('SUPER_ADMIN_MUTATION_FORBIDDEN')) {
      return res.status(403).json({ success: false, error: 'SUPER_ADMIN_MUTATION_FORBIDDEN', message: err.message });
    }
    if (err.message.includes('StaffNotPendingActivation')) {
      return res.status(400).json({ success: false, error: 'StaffNotPendingActivation', message: err.message });
    }
    if (err.message.includes('StaffNotFound')) {
      return res.status(404).json({ success: false, error: 'StaffNotFound', message: err.message });
    }
    res.status(500).json({ success: false, error: 'PinRegenerationError', message: err.message });
  }
});

// 10. View staff audit history
apiRouter.get('/staff/:id/history', requireRole(['SUPER_ADMIN', 'ADMIN']), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const history = await dbGetStaffAuditHistory(req.params.id);
    res.json({ success: true, data: history });
  } catch (err: any) {
    if (err.message.includes('StaffNotFound')) {
      return res.status(404).json({ success: false, error: 'StaffNotFound', message: err.message });
    }
    res.status(500).json({ success: false, error: 'StaffHistoryError', message: err.message });
  }
});

// ==========================================
// PHASE 6B: STAFF DEPARTMENT ASSIGNMENTS
// ==========================================

// 1. Get staff assignments (All 7 roles)
apiRouter.get('/staff/:staffId/departments', requireRole(VALID_USER_ROLES as unknown as UserRole[]), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const staff = await dbGetStaffById(req.params.staffId);
    if (!staff) {
      return res.status(404).json({ success: false, code: 'STAFF_NOT_FOUND', message: `Staff member "${req.params.staffId}" not found.` });
    }

    const assignments = await dbGetStaffAssignments(staff.id, {
      status: req.query.status as AssignmentStatus | undefined
    });

    res.json({ success: true, data: assignments });
  } catch (err: any) {
    res.status(500).json({ success: false, code: 'STAFF_ASSIGNMENTS_ERROR', message: 'Failed to retrieve staff assignments.' });
  }
});

// 2. Get active primary department assignment (All 7 roles)
// Section 6 Rule: Returns primaryDepartment: null if no active primary assignment exists. Never assumes legacy department string is a primary assignment.
apiRouter.get('/staff/:staffId/departments/primary', requireRole(VALID_USER_ROLES as unknown as UserRole[]), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const staff = await dbGetStaffById(req.params.staffId);
    if (!staff) {
      return res.status(404).json({ success: false, code: 'STAFF_NOT_FOUND', message: `Staff member "${req.params.staffId}" not found.` });
    }

    const primaryAsg = await dbGetPrimaryStaffAssignment(staff.id);
    res.json({
      success: true,
      data: primaryAsg ? {
        assignmentId: primaryAsg.id,
        departmentId: primaryAsg.departmentId,
        departmentName: primaryAsg.department.name,
        departmentCode: primaryAsg.department.code,
        discipline: primaryAsg.department.discipline,
        roleTitle: primaryAsg.roleTitle,
        startDate: primaryAsg.startDate,
        status: primaryAsg.status
      } : null,
      primaryDepartment: primaryAsg ? primaryAsg.department : null
    });
  } catch (err: any) {
    res.status(500).json({ success: false, code: 'PRIMARY_ASSIGNMENT_ERROR', message: 'Failed to retrieve primary assignment.' });
  }
});

// 3. Create staff department assignment (SUPER_ADMIN and ADMIN only)
apiRouter.post('/staff/:staffId/departments', requireRole(['SUPER_ADMIN', 'ADMIN']), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { departmentId, isPrimary, roleTitle, startDate } = req.body || {};
    if (!departmentId || typeof departmentId !== 'string') {
      return res.status(400).json({ success: false, code: 'DEPARTMENT_ID_REQUIRED', message: 'Target department ID is required.' });
    }

    const actor = {
      id: req.userId,
      name: req.userName || 'Administrator',
      role: req.userRole!
    };

    const asg = await dbAssignStaffDepartment({
      staffId: req.params.staffId,
      departmentId,
      isPrimary: Boolean(isPrimary),
      roleTitle,
      startDate: startDate ? new Date(startDate) : undefined
    }, actor);

    res.status(201).json({ success: true, data: asg });
  } catch (err: any) {
    if (err.message.includes('STAFF_NOT_FOUND')) {
      return res.status(404).json({ success: false, code: 'STAFF_NOT_FOUND', message: err.message });
    }
    if (err.message.includes('DEPARTMENT_NOT_FOUND')) {
      return res.status(404).json({ success: false, code: 'DEPARTMENT_NOT_FOUND', message: err.message });
    }
    if (err.message.includes('STAFF_INELIGIBLE_FOR_ASSIGNMENT') || err.message.includes('DEPARTMENT_INACTIVE')) {
      return res.status(400).json({ success: false, code: 'ASSIGNMENT_INELIGIBLE', message: err.message });
    }
    res.status(500).json({ success: false, code: 'ASSIGNMENT_CREATION_ERROR', message: 'Failed to create staff department assignment.' });
  }
});

// 4. Change primary department (SUPER_ADMIN and ADMIN only)
apiRouter.post('/staff/:staffId/departments/primary', requireRole(['SUPER_ADMIN', 'ADMIN']), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { departmentId, reason } = req.body || {};
    if (!departmentId || typeof departmentId !== 'string') {
      return res.status(400).json({ success: false, code: 'DEPARTMENT_ID_REQUIRED', message: 'Target department ID is required.' });
    }

    const actor = {
      id: req.userId,
      name: req.userName || 'Administrator',
      role: req.userRole!
    };

    const asg = await dbChangePrimaryDepartment(req.params.staffId, departmentId, actor, reason);
    res.json({ success: true, data: asg });
  } catch (err: any) {
    if (err.message.includes('STAFF_NOT_FOUND')) {
      return res.status(404).json({ success: false, code: 'STAFF_NOT_FOUND', message: err.message });
    }
    if (err.message.includes('DEPARTMENT_NOT_FOUND')) {
      return res.status(404).json({ success: false, code: 'DEPARTMENT_NOT_FOUND', message: err.message });
    }
    if (err.message.includes('STAFF_INELIGIBLE_FOR_ASSIGNMENT') || err.message.includes('DEPARTMENT_INACTIVE')) {
      return res.status(400).json({ success: false, code: 'ASSIGNMENT_INELIGIBLE', message: err.message });
    }
    res.status(500).json({ success: false, code: 'PRIMARY_TRANSFER_ERROR', message: 'Failed to change primary department.' });
  }
});

// 5. Complete staff department assignment (SUPER_ADMIN and ADMIN only)
apiRouter.post('/staff/:staffId/departments/:assignmentId/complete', requireRole(['SUPER_ADMIN', 'ADMIN']), async (req: AuthenticatedRequest, res: Response) => {
  try {
    // Cross-staff assignment ID verification
    const existing = await prisma.staffDepartmentAssignment.findUnique({
      where: { id: req.params.assignmentId }
    });
    if (!existing || existing.staffId !== req.params.staffId) {
      return res.status(400).json({
        success: false,
        code: 'ASSIGNMENT_STAFF_MISMATCH',
        message: 'Assignment does not belong to the specified staff member.'
      });
    }

    const actor = {
      id: req.userId,
      name: req.userName || 'Administrator',
      role: req.userRole!
    };

    const updated = await dbUpdateAssignmentStatus(req.params.assignmentId, 'completed', actor, req.body?.reason);
    res.json({ success: true, data: updated });
  } catch (err: any) {
    if (err.message.includes('ASSIGNMENT_NOT_FOUND')) {
      return res.status(404).json({ success: false, code: 'ASSIGNMENT_NOT_FOUND', message: err.message });
    }
    if (err.message.includes('ASSIGNMENT_NOT_ACTIVE')) {
      return res.status(409).json({ success: false, code: 'ASSIGNMENT_NOT_ACTIVE', message: err.message });
    }
    res.status(500).json({ success: false, code: 'ASSIGNMENT_STATUS_ERROR', message: 'Failed to complete assignment.' });
  }
});

// 6. Transfer staff department assignment (SUPER_ADMIN and ADMIN only)
apiRouter.post('/staff/:staffId/departments/:assignmentId/transfer', requireRole(['SUPER_ADMIN', 'ADMIN']), async (req: AuthenticatedRequest, res: Response) => {
  try {
    // Cross-staff assignment ID verification
    const existing = await prisma.staffDepartmentAssignment.findUnique({
      where: { id: req.params.assignmentId }
    });
    if (!existing || existing.staffId !== req.params.staffId) {
      return res.status(400).json({
        success: false,
        code: 'ASSIGNMENT_STAFF_MISMATCH',
        message: 'Assignment does not belong to the specified staff member.'
      });
    }

    const { newDepartmentId, reason } = req.body || {};
    if (!newDepartmentId || typeof newDepartmentId !== 'string') {
      return res.status(400).json({
        success: false,
        code: 'DEPARTMENT_ID_REQUIRED',
        message: 'New department ID is required for transfer.'
      });
    }

    const actor = {
      id: req.userId,
      name: req.userName || 'Administrator',
      role: req.userRole!
    };

    if (existing.isPrimary) {
      const newAsg = await dbChangePrimaryDepartment(req.params.staffId, newDepartmentId, actor, reason);
      return res.json({ success: true, data: newAsg });
    } else {
      await dbUpdateAssignmentStatus(req.params.assignmentId, 'transferred', actor, reason);
      const newAsg = await dbAssignStaffDepartment({
        staffId: req.params.staffId,
        departmentId: newDepartmentId,
        isPrimary: false,
        roleTitle: reason
      }, actor);
      return res.json({ success: true, data: newAsg });
    }
  } catch (err: any) {
    if (err.message.includes('ASSIGNMENT_NOT_FOUND') || err.message.includes('DEPARTMENT_NOT_FOUND')) {
      return res.status(404).json({ success: false, code: 'RESOURCE_NOT_FOUND', message: err.message });
    }
    if (err.message.includes('ASSIGNMENT_NOT_ACTIVE')) {
      return res.status(409).json({ success: false, code: 'ASSIGNMENT_NOT_ACTIVE', message: err.message });
    }
    if (err.message.includes('STAFF_INELIGIBLE_FOR_ASSIGNMENT') || err.message.includes('DEPARTMENT_INACTIVE')) {
      return res.status(400).json({ success: false, code: 'ASSIGNMENT_INELIGIBLE', message: err.message });
    }
    res.status(500).json({ success: false, code: 'ASSIGNMENT_TRANSFER_ERROR', message: 'Failed to transfer assignment.' });
  }
});

// 7. Revoke staff department assignment (SUPER_ADMIN and ADMIN only)
apiRouter.post('/staff/:staffId/departments/:assignmentId/revoke', requireRole(['SUPER_ADMIN', 'ADMIN']), async (req: AuthenticatedRequest, res: Response) => {
  try {
    // Cross-staff assignment ID verification
    const existing = await prisma.staffDepartmentAssignment.findUnique({
      where: { id: req.params.assignmentId }
    });
    if (!existing || existing.staffId !== req.params.staffId) {
      return res.status(400).json({
        success: false,
        code: 'ASSIGNMENT_STAFF_MISMATCH',
        message: 'Assignment does not belong to the specified staff member.'
      });
    }

    const reason = req.body?.reason;
    if (!reason || typeof reason !== 'string' || !reason.trim()) {
      return res.status(400).json({
        success: false,
        code: 'REASON_REQUIRED',
        message: 'A non-empty revocation reason is mandatory.'
      });
    }

    const actor = {
      id: req.userId,
      name: req.userName || 'Administrator',
      role: req.userRole!
    };

    const updated = await dbUpdateAssignmentStatus(req.params.assignmentId, 'revoked', actor, reason.trim());
    res.json({ success: true, data: updated });
  } catch (err: any) {
    if (err.message.includes('ASSIGNMENT_NOT_FOUND')) {
      return res.status(404).json({ success: false, code: 'ASSIGNMENT_NOT_FOUND', message: err.message });
    }
    if (err.message.includes('ASSIGNMENT_NOT_ACTIVE')) {
      return res.status(409).json({ success: false, code: 'ASSIGNMENT_NOT_ACTIVE', message: err.message });
    }
    res.status(500).json({ success: false, code: 'ASSIGNMENT_REVOCATION_ERROR', message: 'Failed to revoke assignment.' });
  }
});

// ==========================================
// 7. PHARMACY & PRESCRIPTIONS (PharmacyController)
// ==========================================
apiRouter.get('/pharmacy/prescriptions', requirePermission(CLINICAL_PERMISSIONS.RX_READ), async (_req: AuthenticatedRequest, res: Response) => {
  const list = await dbGetPrescriptions();
  res.json({ success: true, data: list });
});

apiRouter.get('/pharmacy/prescriptions/queue', requirePermission(CLINICAL_PERMISSIONS.RX_READ), async (req: AuthenticatedRequest, res: Response) => {
  const patientId = req.query.patientId as string | undefined;
  const status = req.query.status as string | undefined;
  const queue = await dbGetPrescriptionQueue({ patientId, status });
  res.json({ success: true, data: queue });
});

apiRouter.post('/pharmacy/prescriptions', requirePermission(CLINICAL_PERMISSIONS.RX_CREATE), async (req: AuthenticatedRequest, res: Response) => {
  const role = req.userRole;
  if (role !== 'DOCTOR' && role !== 'VAIDYA') {
    return res.status(403).json({
      success: false,
      code: 'CLINICAL_AUTHORITY_REQUIRED',
      message: 'Prescriptions can only be authored by DOCTOR or VAIDYA within their respective clinical discipline.'
    });
  }

  const body = req.body;
  const medName = body.medicationName;
  if (!medName || !medName.trim()) {
    return res.status(400).json({ success: false, code: 'MEDICATION_NAME_REQUIRED', message: 'Medication name is required.' });
  }

  // Cross-discipline restriction
  if (role === 'DOCTOR' && isAyurvedicMedication(medName, body.category)) {
    return res.status(403).json({
      success: false,
      code: 'CLINICAL_DISCIPLINE_MISMATCH',
      message: 'Clinical Discipline Mismatch: Modern medicine DOCTOR cannot prescribe Ayurvedic medications.'
    });
  }
  if (role === 'VAIDYA' && isModernMedication(medName, body.category)) {
    return res.status(403).json({
      success: false,
      code: 'CLINICAL_DISCIPLINE_MISMATCH',
      message: 'Clinical Discipline Mismatch: Ayurvedic VAIDYA cannot prescribe Modern Medicine.'
    });
  }

  if (body.encounterId) {
    const enc = await dbGetEncounterById(body.encounterId);
    if (!enc) {
      return res.status(404).json({ success: false, message: 'Encounter not found' });
    }
    if (role === 'DOCTOR' && enc.discipline !== 'DOCTOR') {
      return res.status(403).json({
        success: false,
        code: 'CLINICAL_DISCIPLINE_MISMATCH',
        message: 'Clinical Discipline Mismatch: DOCTOR cannot author prescriptions for an Ayurvedic encounter.'
      });
    }
    if (role === 'VAIDYA' && enc.discipline !== 'VAIDYA') {
      return res.status(403).json({
        success: false,
        code: 'CLINICAL_DISCIPLINE_MISMATCH',
        message: 'Clinical Discipline Mismatch: VAIDYA cannot author prescriptions for a Modern Medicine encounter.'
      });
    }
  }

  const actor = req.userName || (role === 'VAIDYA' ? 'Vaidya Practitioner' : 'Dr. Attending Physician');
  const qty = Number(body.quantity) || 1;

  const newRx: Prescription = {
    id: `rx-${Date.now()}`,
    rxNumber: `RX-2026-${Math.floor(1000 + Math.random() * 9000)}`,
    encounterId: body.encounterId,
    patientId: body.patientId,
    patientName: body.patientName || 'Walk-in Patient',
    mrn: body.mrn || '',
    doctorId: body.doctorId || req.userId || '',
    doctorName: body.doctorName || actor,
    prescribingPractitionerRole: role,
    datePrescribed: new Date().toISOString(),
    medicationId: body.medicationId,
    medicationName: body.medicationName,
    dosage: body.dosage,
    frequency: body.frequency || 'Once Daily (OD)',
    route: body.route || 'Oral',
    duration: body.duration || '7 days',
    quantity: qty,
    instructions: body.instructions,
    status: 'pending',
    dispensingStatus: 'pending',
    dispensedQuantity: 0,
    remainingQuantity: qty,
    pharmacyNotes: body.pharmacyNotes
  };

  const createdRx = await dbCreatePrescription(newRx);
  await dbLogAudit(
    createdRx.doctorName,
    req.userRole!,
    'Ordered E-Prescription',
    'Medication Dispense',
    `Prescribed ${createdRx.medicationName} ${createdRx.dosage} (Qty: ${createdRx.quantity}) for ${createdRx.patientName}`,
    createdRx.mrn
  );
  res.status(201).json({ success: true, data: createdRx });
});

apiRouter.post('/pharmacy/prescriptions/:id/dispense', requirePermission(CLINICAL_PERMISSIONS.RX_DISPENSE), async (req: AuthenticatedRequest, res: Response) => {
  if (req.userRole !== 'PHARMACIST') {
    return res.status(403).json({
      success: false,
      code: 'PHARMACY_AUTHORITY_REQUIRED',
      message: 'Medication dispensing is strictly restricted to licensed PHARMACIST staff.'
    });
  }

  const actor = {
    id: req.userId || 'pharm-actor-sys',
    name: req.userName || 'Pharm. Katherine Brooks, RPh',
    role: req.userRole || 'PHARMACIST'
  };

  const idempotencyKey =
    (req.headers['idempotency-key'] as string) ||
    (req.headers['x-idempotency-key'] as string) ||
    req.body?.idempotencyKey;

  const dispensePayload = {
    ...req.body,
    idempotencyKey: idempotencyKey || undefined
  };

  const result = await dbDispensePrescription(req.params.id, actor, req.body.pharmacyNotes, dispensePayload);
  if (!result.success) {
    const errorMsg = result.error || 'Dispensing failed.';
    if (errorMsg.includes('IDEMPOTENCY_CONFLICT')) {
      return res.status(409).json({ success: false, error: 'IDEMPOTENCY_CONFLICT', message: errorMsg });
    }
    let errorCode = 'DISPENSING_FAILED';
    if (errorMsg.includes('EXPIRED_STOCK_CANNOT_BE_DISPENSED')) {
      errorCode = 'EXPIRED_STOCK_CANNOT_BE_DISPENSED';
    } else if (errorMsg.includes('EXCEEDS_PRESCRIBED_QUANTITY')) {
      errorCode = 'EXCEEDS_PRESCRIBED_QUANTITY';
    } else if (errorMsg.includes('INSUFFICIENT_STOCK')) {
      errorCode = 'INSUFFICIENT_STOCK';
    } else if (errorMsg.includes('already dispensed')) {
      errorCode = 'PRESCRIPTION_ALREADY_DISPENSED';
    }
    return res.status(400).json({ success: false, error: errorCode, message: errorMsg });
  }

  await dbLogAudit(
    actor.name,
    actor.role,
    'Dispensed Medication',
    'Medication Dispense',
    `Dispensed ${result.prescription?.medicationName} (${result.prescription?.rxNumber}) to ${result.prescription?.patientName}`,
    result.prescription?.mrn
  );

  return res.json({
    success: true,
    data: result.prescription,
    dispensingRecords: result.dispensingRecords
  });
});

apiRouter.patch('/pharmacy/prescriptions/:id', requireRole(['DOCTOR', 'VAIDYA', 'PHARMACIST']), async (req: AuthenticatedRequest, res: Response) => {
  if (req.body.status === 'dispensed') {
    if (req.userRole !== 'PHARMACIST') {
      return res.status(403).json({
        success: false,
        code: 'PHARMACY_AUTHORITY_REQUIRED',
        message: 'Medication dispensing is strictly restricted to licensed PHARMACIST staff.'
      });
    }

    const actor = {
      id: req.userId || 'pharm-actor-sys',
      name: req.body.dispensedBy || req.userName || 'Pharm. Katherine Brooks, RPh',
      role: req.userRole || 'PHARMACIST'
    };
    const idempotencyKey =
      (req.headers['idempotency-key'] as string) ||
      (req.headers['x-idempotency-key'] as string) ||
      req.body?.idempotencyKey;

    const quantityToDeduct = Number(req.body.quantity) || 1;
    const dispensePayload = {
      quantity: quantityToDeduct,
      idempotencyKey: idempotencyKey || undefined
    };

    const result = await dbDispensePrescription(req.params.id, actor, req.body.pharmacyNotes, dispensePayload);
    if (!result.success) {
      if (result.error?.includes('IDEMPOTENCY_CONFLICT')) {
        return res.status(409).json({ success: false, error: 'IDEMPOTENCY_CONFLICT', message: result.error });
      }
      return res.status(400).json(result);
    }
    await dbLogAudit(
      actor.name,
      req.userRole!,
      'Dispensed Medication',
      'Medication Dispense',
      `Dispensed ${result.prescription?.medicationName} (${result.prescription?.rxNumber}) with atomic stock deduction`,
      result.prescription?.mrn
    );
    return res.json({ success: true, data: result.prescription });
  }

  // Non-dispense modifications: Clinical modification requires DOCTOR or VAIDYA
  if (req.userRole !== 'DOCTOR' && req.userRole !== 'VAIDYA') {
    return res.status(403).json({
      success: false,
      code: 'CLINICAL_AUTHORITY_REQUIRED',
      message: 'Prescriptions can only be modified by authorized clinicians (DOCTOR, VAIDYA). Administrative and pharmacy roles cannot modify prescriptions.'
    });
  }

  const existingRx = await dbGetPrescriptionById(req.params.id);
  if (!existingRx) {
    return res.status(404).json({ success: false, message: 'Prescription not found' });
  }

  // Discipline isolation on modification
  const isExistingAyurvedic = existingRx.prescribingPractitionerRole === 'VAIDYA' || isAyurvedicMedication(existingRx.medicationName);
  const isExistingModern = existingRx.prescribingPractitionerRole === 'DOCTOR' || isModernMedication(existingRx.medicationName);

  if (req.userRole === 'DOCTOR' && isExistingAyurvedic && !isExistingModern) {
    return res.status(403).json({
      success: false,
      code: 'CLINICAL_DISCIPLINE_MISMATCH',
      message: 'Clinical Discipline Mismatch: DOCTOR cannot modify Ayurvedic prescriptions.'
    });
  }
  if (req.userRole === 'VAIDYA' && isExistingModern && !isExistingAyurvedic) {
    return res.status(403).json({
      success: false,
      code: 'CLINICAL_DISCIPLINE_MISMATCH',
      message: 'Clinical Discipline Mismatch: VAIDYA cannot modify Modern Medicine prescriptions.'
    });
  }

  if (req.body.medicationName) {
    if (req.userRole === 'DOCTOR' && isAyurvedicMedication(req.body.medicationName)) {
      return res.status(403).json({
        success: false,
        code: 'CLINICAL_DISCIPLINE_MISMATCH',
        message: 'Clinical Discipline Mismatch: DOCTOR cannot change prescription to Ayurvedic medication.'
      });
    }
    if (req.userRole === 'VAIDYA' && isModernMedication(req.body.medicationName)) {
      return res.status(403).json({
        success: false,
        code: 'CLINICAL_DISCIPLINE_MISMATCH',
        message: 'Clinical Discipline Mismatch: VAIDYA cannot change prescription to Modern Medicine.'
      });
    }
  }

  const updated = await dbUpdatePrescription(req.params.id, req.body);
  if (!updated) {
    return res.status(404).json({ success: false, message: 'Prescription not found' });
  }

  await dbLogAudit(
    req.userName || 'Clinician',
    req.userRole,
    'Updated Prescription',
    'Medication Dispense',
    `Updated prescription ${updated.rxNumber} (${updated.medicationName})`,
    updated.mrn
  );

  res.json({ success: true, data: updated });
});

// Pharmacy Inventory Catalogue with Batch Details & FEFO Support
apiRouter.get('/pharmacy/inventory', requirePermission(CLINICAL_PERMISSIONS.RX_READ), async (req: AuthenticatedRequest, res: Response) => {
  const { search, category, status, activeOnly } = req.query;
  const stock = await dbGetMedicationStock({
    search: search as string,
    category: category as string,
    status: status as string,
    activeOnly: activeOnly === 'false' ? false : true
  });
  res.json({ success: true, data: stock });
});

// Legacy alias for stock
apiRouter.get('/pharmacy/stock', requirePermission(CLINICAL_PERMISSIONS.RX_READ), async (req: AuthenticatedRequest, res: Response) => {
  const { search, category, status } = req.query;
  const stock = await dbGetMedicationStock({
    search: search as string,
    category: category as string,
    status: status as string
  });
  res.json({ success: true, data: stock });
});

// Controlled Stock Receiving Workflow
apiRouter.post('/pharmacy/inventory/receive', requirePermission(CLINICAL_PERMISSIONS.PHARMACY_STOCK_MANAGE), async (req: AuthenticatedRequest, res: Response) => {
  if (req.userRole !== 'PHARMACIST') {
    return res.status(403).json({
      success: false,
      code: 'PHARMACY_AUTHORITY_REQUIRED',
      message: 'Stock receiving is strictly restricted to licensed PHARMACIST staff.'
    });
  }

  try {
    const actor = {
      id: req.userId || 'pharm-actor-sys',
      name: req.userName || 'Lead Pharmacist',
      role: req.userRole || 'PHARMACIST'
    };

    const stock = await dbReceiveStock(req.body, actor);
    await dbLogAudit(
      actor.name,
      actor.role,
      'Received Medication Stock',
      'Medication Dispense',
      `Received batch ${stock.batchNumber} of ${stock.drugName} (Quantity: ${stock.stockQuantity} ${stock.unit})`
    );
    res.status(201).json({ success: true, data: stock });
  } catch (err: any) {
    if (err.message && err.message.includes('BatchMetadataConflict')) {
      return res.status(409).json({
        success: false,
        code: 'BATCH_METADATA_CONFLICT',
        error: 'BATCH_METADATA_CONFLICT',
        message: err.message.replace('BatchMetadataConflict: ', '')
      });
    }
    res.status(400).json({ success: false, error: err.message || 'Stock receipt failed' });
  }
});

// Controlled Stock Adjustment with Mandatory Reason
apiRouter.post('/pharmacy/inventory/adjust', requirePermission(CLINICAL_PERMISSIONS.PHARMACY_STOCK_MANAGE), async (req: AuthenticatedRequest, res: Response) => {
  if (req.userRole !== 'PHARMACIST') {
    return res.status(403).json({
      success: false,
      code: 'PHARMACY_AUTHORITY_REQUIRED',
      message: 'Stock adjustments are strictly restricted to licensed PHARMACIST staff.'
    });
  }

  try {
    const { stockId, adjustmentType, quantityDelta, reason, notes } = req.body;

    if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'REASON_REQUIRED',
        message: 'A non-empty reason is mandatory for stock adjustment.'
      });
    }

    const actor = {
      id: req.userId || 'pharm-actor-sys',
      name: req.userName || 'Lead Pharmacist',
      role: req.userRole || 'PHARMACIST'
    };

    const updated = await dbAdjustStock({ stockId, adjustmentType, quantityDelta, reason, notes }, actor);
    await dbLogAudit(
      actor.name,
      actor.role,
      'Adjusted Medication Stock',
      'Medication Dispense',
      `Adjusted stock for ${updated.drugName} (Batch: ${updated.batchNumber}, Delta: ${quantityDelta > 0 ? '+' : ''}${quantityDelta}). Reason: ${reason}`
    );
    res.json({ success: true, data: updated });
  } catch (err: any) {
    const isNegative = err.message?.includes('NEGATIVE_STOCK_PREVENTED');
    const isReasonMissing = err.message?.includes('REASON_REQUIRED');
    res.status(400).json({
      success: false,
      error: isNegative ? 'NEGATIVE_STOCK_PREVENTED' : isReasonMissing ? 'REASON_REQUIRED' : 'STOCK_ADJUSTMENT_FAILED',
      message: err.message || 'Stock adjustment failed'
    });
  }
});

// Immutable Stock Movement History
apiRouter.get('/pharmacy/inventory/movements', requirePermission(CLINICAL_PERMISSIONS.RX_READ), async (req: AuthenticatedRequest, res: Response) => {
  const { medicineId, batchNumber, type, limit } = req.query;
  const movements = await dbGetStockMovements({
    medicineId: medicineId as string,
    batchNumber: batchNumber as string,
    type: type as string,
    limit: limit ? Number(limit) : undefined
  });
  res.json({ success: true, data: movements });
});

// Explicit Authorized Workflow: Configure Medication Selling Price (EXCLUSIVELY SUPER_ADMIN)
const handleMedicationPriceUpdate = async (req: AuthenticatedRequest, res: Response) => {
  if (req.userRole !== 'SUPER_ADMIN') {
    return res.status(403).json({
      success: false,
      code: 'MEDICATION_PRICE_AUTHORITY_REQUIRED',
      error: 'Forbidden',
      message: 'Medication price configuration is strictly restricted to SUPER_ADMIN.'
    });
  }

  try {
    const { unitPrice, reason } = req.body;
    if (unitPrice === undefined || unitPrice === null || isNaN(Number(unitPrice)) || Number(unitPrice) < 0) {
      return res.status(400).json({
        success: false,
        error: 'InvalidPrice',
        message: 'A valid non-negative selling price (unitPrice) is required.'
      });
    }

    const actor = {
      id: req.userId || 'sys-super-admin',
      name: req.userName || 'Super Administrator',
      role: req.userRole || 'SUPER_ADMIN'
    };

    const updated = await dbConfigureMedicationPrice(req.params.id, Number(unitPrice), actor);

    await dbLogAudit(
      actor.name,
      actor.role,
      'Configured Medication Price',
      'Medication Price Governance',
      `Configured authoritative selling price for ${updated.drugName} (Batch: ${updated.batchNumber}) to ₹${Number(unitPrice).toFixed(2)}${reason ? ` - Reason: ${reason}` : ''}`
    );

    res.json({ success: true, data: updated });
  } catch (err: any) {
    if (err.message && err.message.includes('NOT_FOUND')) {
      return res.status(404).json({ success: false, error: 'MedicationNotFound', message: err.message });
    }
    if (err.message && err.message.includes('MEDICATION_PRICE_AUTHORITY_REQUIRED')) {
      return res.status(403).json({ success: false, code: 'MEDICATION_PRICE_AUTHORITY_REQUIRED', error: 'Forbidden', message: err.message });
    }
    res.status(400).json({ success: false, error: err.message || 'Price configuration failed' });
  }
};

apiRouter.patch('/pharmacy/inventory/:id/price', requirePermission(CLINICAL_PERMISSIONS.MEDICATION_PRICE_MANAGE), handleMedicationPriceUpdate);
apiRouter.put('/pharmacy/inventory/:id/price', requirePermission(CLINICAL_PERMISSIONS.MEDICATION_PRICE_MANAGE), handleMedicationPriceUpdate);
apiRouter.patch('/pharmacy/stock/:id/price', requirePermission(CLINICAL_PERMISSIONS.MEDICATION_PRICE_MANAGE), handleMedicationPriceUpdate);
apiRouter.put('/pharmacy/stock/:id/price', requirePermission(CLINICAL_PERMISSIONS.MEDICATION_PRICE_MANAGE), handleMedicationPriceUpdate);

// Legacy stock creation endpoint for backwards compatibility
apiRouter.post('/pharmacy/stock', requirePermission(CLINICAL_PERMISSIONS.PHARMACY_STOCK_MANAGE), async (req: AuthenticatedRequest, res: Response) => {
  if (req.userRole !== 'PHARMACIST') {
    return res.status(403).json({
      success: false,
      code: 'PHARMACY_AUTHORITY_REQUIRED',
      message: 'Stock management is strictly restricted to licensed PHARMACIST staff.'
    });
  }

  const body = req.body;
  const qty = Number(body.stockQuantity) || 0;
  const min = Number(body.minThreshold) || 20;
  let status: MedicationStock['status'] = 'in_stock';
  if (qty <= min * 0.4) {
    status = 'critical';
  } else if (qty <= min) {
    status = 'low_stock';
  }

  // Pharmacists receiving inventory cannot configure or alter medication selling prices
  const parsedUnitPrice = null;

  const newStock: MedicationStock = {
    id: body.id || `med-${Date.now()}`,
    drugName: body.drugName || 'Ayurvedic Formulation',
    genericName: body.genericName || 'Classical Herb Formulation',
    category: body.category || 'Ayurvedic Oil / Thailam',
    form: body.form || 'Oil / Liquid',
    strength: body.strength,
    stockQuantity: qty,
    unit: body.unit || 'bottles',
    minThreshold: min,
    reorderThreshold: body.reorderThreshold,
    manufacturer: body.manufacturer,
    batchNumber: body.batchNumber || `AY-${new Date().getFullYear()}-B${Math.floor(100 + Math.random() * 900)}`,
    expiryDate: body.expiryDate || '2028-12-31',
    storageInfo: body.storageInfo,
    unitPrice: parsedUnitPrice,
    isActive: body.isActive !== undefined ? body.isActive : true,
    status
  };

  const actor = {
    id: req.userId || 'pharm-actor-sys',
    name: req.userName || 'Lead Pharmacist',
    role: req.userRole || 'PHARMACIST'
  };

  await dbCreateMedicationStock(newStock);
  await dbLogAudit(
    actor.name,
    req.userRole!,
    'Added Pharmacy Stock',
    'Medication Dispense',
    `Added new formulary line ${newStock.drugName} (Qty: ${newStock.stockQuantity} ${newStock.unit}) to pharmacy inventory`
  );
  res.status(201).json({ success: true, data: newStock });
});

// ==========================================
// 8. LABORATORY (LabController)
// ==========================================
apiRouter.get('/laboratory', requirePermission(CLINICAL_PERMISSIONS.LAB_READ), async (_req: AuthenticatedRequest, res: Response) => {
  const list = await dbGetLabOrders();
  res.json({ success: true, data: list });
});

apiRouter.post('/laboratory', requirePermission(CLINICAL_PERMISSIONS.LAB_ORDER_CREATE), async (req: AuthenticatedRequest, res: Response) => {
  const body = req.body;
  const newOrder: LabOrder = {
    id: `lab-${Date.now()}`,
    orderNumber: `LAB-2026-${Math.floor(1000 + Math.random() * 9000)}`,
    patientId: body.patientId,
    patientName: body.patientName || 'Walk-in Patient',
    mrn: body.mrn || '',
    testType: body.testType,
    priority: body.priority || 'Routine',
    orderingDoctor: body.orderingDoctor || req.userName || 'Dr. Attending Physician',
    orderedAt: new Date().toISOString(),
    status: 'ordered',
    labNotes: body.labNotes
  };

  const createdOrder = await dbCreateLabOrder(newOrder);
  await dbLogAudit(createdOrder.orderingDoctor, req.userRole!, 'Ordered Diagnostic Panel', 'Lab Release', `Ordered ${createdOrder.testType} (${createdOrder.priority})`, createdOrder.mrn);
  res.status(201).json({ success: true, data: createdOrder });
});

// Ordinary laboratory result entry and verification endpoint (Doctors, Vaidyas, Administrators)
apiRouter.patch('/laboratory/:id', requirePermission(CLINICAL_PERMISSIONS.LAB_RESULT_WRITE), async (req: AuthenticatedRequest, res: Response) => {
  const index = hospitalStore.labOrders.findIndex((l) => l.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ success: false, message: 'Lab order not found' });
  }

  const reviewerName = req.userName || 'Authorized Clinical Reviewer';
  const updatedData: Partial<LabOrder> = {
    ...req.body,
    ...(req.body.status === 'completed' || req.body.status === 'verified'
      ? {
          verifiedBy: req.body.verifiedBy || reviewerName,
          verifiedAt: req.body.verifiedAt || new Date().toISOString()
        }
      : {})
  };

  const updated: LabOrder = { ...hospitalStore.labOrders[index], ...updatedData };
  hospitalStore.labOrders[index] = updated;

  await dbUpdateLabOrder(updated);

  if (req.body.status === 'completed' || req.body.status === 'verified') {
    hospitalStore.logAudit(
      reviewerName,
      req.userRole!,
      'Verified Lab Result',
      'Lab Release',
      `Reviewed and released laboratory finding for ${updated.testType} (${updated.resultValue || 'QC Verified'})`,
      updated.mrn
    );
  }

  res.json({ success: true, data: updated });
});

// ==========================================
// 9. BILLING (BillingController)
// ==========================================
apiRouter.get('/billing', requirePermission(CLINICAL_PERMISSIONS.BILLING_READ), async (_req: AuthenticatedRequest, res: Response) => {
  const list = await dbGetInvoices();
  res.json({ success: true, data: list });
});

apiRouter.post('/billing', requirePermission(CLINICAL_PERMISSIONS.BILLING_MANAGE), async (req: AuthenticatedRequest, res: Response) => {
  const body = req.body;

  if (!body.items || !Array.isArray(body.items) || body.items.length === 0) {
    return res.status(400).json({
      success: false,
      error: 'EmptyInvoice',
      message: 'At least one service line item with an authorized tariff is required to issue an invoice.'
    });
  }

  const allTariffs = await dbGetTariffs(true);
  const allMedications = await dbGetMedicationStock();
  const validatedItems: any[] = [];

  // Authoritative server-side tariff and formulary verification and immutable pricing snapshot
  for (const item of body.items) {
    const quantity = Number(item.quantity);
    if (isNaN(quantity) || quantity <= 0) {
      return res.status(400).json({
        success: false,
        error: 'InvalidQuantity',
        message: `Quantity for "${item.description || 'item'}" must be greater than zero.`
      });
    }

    // Match service from authoritative catalogue by ID, serviceCode, or serviceName
    let tariff: HospitalTariff | null = null;
    if (item.tariffId) {
      tariff = allTariffs.find((t) => t.id === item.tariffId) || null;
    }
    if (!tariff && item.serviceCode) {
      tariff = allTariffs.find((t) => t.serviceCode.toUpperCase() === item.serviceCode.toUpperCase()) || null;
    }
    if (!tariff && item.description) {
      tariff = allTariffs.find((t) =>
        t.serviceName.toLowerCase() === item.description.toLowerCase() ||
        t.serviceCode.toLowerCase() === item.description.toLowerCase()
      ) || null;
    }

    // Match medication from pharmacy inventory
    let matchedMed: MedicationStock | null = null;
    if (item.medicationId) {
      matchedMed = allMedications.find((m) => m.id === item.medicationId) || null;
    }
    if (!matchedMed && (item.category?.toLowerCase() === 'pharmacy' || item.category?.toLowerCase() === 'medication')) {
      matchedMed = allMedications.find((m) =>
        m.id === item.tariffId ||
        m.drugName.toLowerCase() === item.description?.toLowerCase() ||
        m.genericName.toLowerCase() === item.description?.toLowerCase() ||
        m.batchNumber.toLowerCase() === item.serviceCode?.toLowerCase()
      ) || null;
    }
    if (!matchedMed && !tariff && item.description) {
      matchedMed = allMedications.find((m) =>
        m.drugName.toLowerCase() === item.description.toLowerCase() ||
        m.genericName.toLowerCase() === item.description.toLowerCase()
      ) || null;
    }

    let unitPriceDec: Prisma.Decimal;
    let isZeroPermitted: boolean = false;
    let finalDesc = item.description;
    let finalCode = item.serviceCode;
    let finalCategory = item.category || 'General';

    if (matchedMed) {
      finalDesc = matchedMed.drugName;
      finalCode = matchedMed.batchNumber || matchedMed.id;
      finalCategory = 'Pharmacy';

      // 1. Verify medication price is configured (cannot be null, undefined, or NaN)
      if (matchedMed.unitPrice === null || matchedMed.unitPrice === undefined || isNaN(Number(matchedMed.unitPrice))) {
        return res.status(400).json({
          success: false,
          error: 'UnconfiguredMedicationPrice',
          message: `Medication price for "${matchedMed.drugName}" is unconfigured. Billing against unconfigured medication prices is strictly prevented.`
        });
      }

      // Server-side authoritative medication rate from DB — stay in Decimal domain
      unitPriceDec = new Prisma.Decimal(matchedMed.unitPrice.toFixed(2));
      isZeroPermitted = false;
    } else if (item.category?.toLowerCase() === 'pharmacy' || item.category?.toLowerCase() === 'medication') {
      // Line item designated as pharmacy/medication but has no authorized medication stock price
      return res.status(400).json({
        success: false,
        error: 'UnconfiguredMedicationPrice',
        message: `Medication price for "${item.description || 'medication'}" is unconfigured. Billing against unconfigured medication prices is strictly prevented.`
      });
    } else if (tariff) {
      finalDesc = tariff.serviceName;
      finalCode = tariff.serviceCode;
      finalCategory = tariff.category;

      // 1. Verify service is active
      if (tariff.isActive === false) {
        return res.status(400).json({
          success: false,
          error: 'InactiveService',
          message: `Service "${tariff.serviceName}" (${tariff.serviceCode}) is inactive and cannot be billed.`
        });
      }

      // 2. Verify tariff rate is configured (cannot be null)
      if (tariff.rate === null || tariff.rate === undefined) {
        return res.status(400).json({
          success: false,
          error: 'UnconfiguredTariff',
          message: `Tariff for "${tariff.serviceName}" (${tariff.serviceCode}) is unconfigured. Billing against unconfigured tariffs is strictly prevented.`
        });
      }

      // 3. Verify effective dates
      const now = new Date();
      if (tariff.effectiveFrom && new Date(tariff.effectiveFrom) > now) {
        return res.status(400).json({
          success: false,
          error: 'RateNotYetEffective',
          message: `Tariff rate for "${tariff.serviceName}" is not effective until ${tariff.effectiveFrom}.`
        });
      }
      if (tariff.effectiveUntil && new Date(tariff.effectiveUntil) < now) {
        return res.status(400).json({
          success: false,
          error: 'RateExpired',
          message: `Tariff rate for "${tariff.serviceName}" expired on ${tariff.effectiveUntil}.`
        });
      }

      // Server-side authoritative rate from DB — stay in Decimal domain
      unitPriceDec = new Prisma.Decimal(Number(tariff.rate).toFixed(2));
      isZeroPermitted = Boolean(tariff.isZeroPricePermitted);
    } else {
      // Line item without matched catalog tariff
      if (item.unitPrice === null || item.unitPrice === undefined || isNaN(Number(item.unitPrice))) {
        return res.status(400).json({
          success: false,
          error: 'UnconfiguredTariff',
          message: `Tariff for "${item.description}" is unconfigured. Billing against unconfigured tariffs is strictly prevented.`
        });
      }
      unitPriceDec = new Prisma.Decimal(Number(item.unitPrice).toFixed(2));
      isZeroPermitted = Boolean(item.isZeroPricePermitted);
    }

    // Prohibit negative prices
    if (unitPriceDec.isNegative()) {
      return res.status(400).json({
        success: false,
        error: 'InvalidItemData',
        message: `Item price cannot be negative for "${finalDesc}".`
      });
    }

    // Zero-price permission check
    if (unitPriceDec.isZero() && !isZeroPermitted) {
      return res.status(400).json({
        success: false,
        error: 'ZeroPriceNotPermitted',
        message: `Zero-price billing is not permitted for "${finalDesc}". An established tariff rate is required.`
      });
    }

    const qtyDec = new Prisma.Decimal(quantity);
    const itemTotalDec = unitPriceDec.mul(qtyDec);

    validatedItems.push({
      id: item.id || `item-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      tariffId: tariff?.id || item.tariffId,
      medicationId: matchedMed?.id || item.medicationId,
      serviceCode: finalCode,
      description: finalDesc,
      category: finalCategory,
      quantity,
      unitPrice: Number(unitPriceDec.toFixed(2)),
      total: Number(itemTotalDec.toFixed(2)),
      isZeroPricePermitted: isZeroPermitted,
      _unitPriceDec: unitPriceDec.toFixed(2),
      _itemTotalDec: itemTotalDec.toFixed(2)
    });
  }

  const subtotalDec = validatedItems.reduce(
    (acc: Prisma.Decimal, it: any) => acc.add(new Prisma.Decimal(it._itemTotalDec)),
    new Prisma.Decimal(0)
  );

  // Strip internal Decimal staging fields before persisting line items
  validatedItems.forEach((it: any) => {
    delete it._unitPriceDec;
    delete it._itemTotalDec;
  });

  const subtotal = Number(subtotalDec.toFixed(2));

  const coveragePercentDec = new Prisma.Decimal(body.coveragePercentage || 0);
  const insuranceCoveredDec = subtotalDec.mul(coveragePercentDec).div(100).toDecimalPlaces(2);
  const insuranceCovered = Number(insuranceCoveredDec.toFixed(2));

  const copayDec = subtotalDec.sub(insuranceCoveredDec);
  const copay = Number(copayDec.toFixed(2));

  const paidAmountDec = body.paymentStatus === 'paid'
    ? subtotalDec
    : (body.paidAmount !== undefined ? new Prisma.Decimal(Number(body.paidAmount).toFixed(2)) : new Prisma.Decimal(0));
  const paidAmount = Number(paidAmountDec.toFixed(2));

  const balanceDec = subtotalDec.sub(paidAmountDec);
  const balance = Number(balanceDec.toFixed(2));

  const newInvoice: any = {
    id: `inv-${Date.now()}`,
    invoiceNumber: body.invoiceNumber || undefined,
    patientId: body.patientId,
    patientName: body.patientName || 'Walk-in Patient',
    mrn: body.mrn || '',
    admissionDate: body.admissionDate || new Date().toISOString(),
    dischargeDate: body.dischargeDate,
    items: validatedItems,
    subtotal,
    insuranceCovered,
    copayPatient: copay,
    totalAmount: subtotal,
    paidAmount,
    balance,
    paymentStatus: body.paymentStatus || 'unpaid',
    insuranceClaimStatus: body.insuranceClaimStatus || 'pending',
    createdAt: new Date().toISOString()
  };

  const createdInvoice = await dbCreateInvoice(
    newInvoice,
    { id: req.userId || 'system', name: req.userName || 'Accountant', role: req.userRole || 'ACCOUNTANT' }
  );
  await dbLogAudit(
    req.userName || 'Patient Financial Services',
    req.userRole!,
    'Generated Inpatient Invoice',
    'Billing Clearance',
    `Generated invoice ${createdInvoice.invoiceNumber} for ₹${subtotal.toLocaleString()}`,
    createdInvoice.mrn
  );
  res.status(201).json({ success: true, data: createdInvoice });
});

apiRouter.patch('/billing/:id', requirePermission(CLINICAL_PERMISSIONS.BILLING_MANAGE), (req: AuthenticatedRequest, res: Response) => {
  const index = hospitalStore.invoices.findIndex((i) => i.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ success: false, message: 'Invoice not found' });
  }
  const updated = { ...hospitalStore.invoices[index], ...req.body };
  hospitalStore.invoices[index] = updated;
  res.json({ success: true, data: updated });
});

// --------------------------------------------------
// PHASE 5: EXPANDED FINANCIAL OPERATIONS & BILLING
// --------------------------------------------------

// 9.1 Invoices List & Details
apiRouter.get('/billing/invoices', requirePermission(CLINICAL_PERMISSIONS.BILLING_READ), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const filters = {
      patientId: req.query.patientId as string,
      mrn: req.query.mrn as string,
      status: req.query.status as string,
      startDate: req.query.startDate as string,
      endDate: req.query.endDate as string
    };
    const invoices = await dbGetInvoices(filters);
    res.json({ success: true, data: invoices });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

apiRouter.get('/billing/invoices/:id', requirePermission(CLINICAL_PERMISSIONS.BILLING_READ), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const invoice = await dbGetInvoiceById(req.params.id);
    if (!invoice) {
      return res.status(404).json({ success: false, error: 'InvoiceNotFound', message: 'Invoice not found' });
    }
    res.json({ success: true, data: invoice });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 9.2 Create Invoice (Draft or Issued)
apiRouter.post(['/billing/invoices', '/invoices'], requirePermission(CLINICAL_PERMISSIONS.INVOICE_CREATE), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const body = req.body;
    if (!body.items || !Array.isArray(body.items) || body.items.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'EmptyInvoice',
        message: 'At least one service or pharmacy line item with an authorized tariff is required.'
      });
    }

    const allTariffs = await dbGetTariffs(true);
    const allMedications = await dbGetMedicationStock();
    const validatedItems: any[] = [];

    for (const item of body.items) {
      const quantity = Number(item.quantity);
      if (isNaN(quantity) || quantity <= 0) {
        return res.status(400).json({
          success: false,
          error: 'InvalidQuantity',
          message: `Quantity for "${item.description || 'item'}" must be greater than zero.`
        });
      }

      let tariff: HospitalTariff | null = null;
      if (item.tariffId) {
        tariff = allTariffs.find((t) => t.id === item.tariffId) || null;
      }
      if (!tariff && item.serviceCode) {
        tariff = allTariffs.find((t) => t.serviceCode.toUpperCase() === item.serviceCode.toUpperCase()) || null;
      }
      if (!tariff && item.description) {
        tariff = allTariffs.find((t) =>
          t.serviceName.toLowerCase() === item.description.toLowerCase() ||
          t.serviceCode.toLowerCase() === item.description.toLowerCase()
        ) || null;
      }

      let matchedMed: MedicationStock | null = null;
      if (item.medicationId) {
        matchedMed = allMedications.find((m) => m.id === item.medicationId) || null;
      }
      if (!matchedMed && (item.category?.toLowerCase() === 'pharmacy' || item.category?.toLowerCase() === 'medication')) {
        matchedMed = allMedications.find((m) =>
          m.id === item.tariffId ||
          m.drugName.toLowerCase() === item.description?.toLowerCase() ||
          m.genericName.toLowerCase() === item.description?.toLowerCase() ||
          m.batchNumber.toLowerCase() === item.serviceCode?.toLowerCase()
        ) || null;
      }
      if (!matchedMed && !tariff && item.description) {
        matchedMed = allMedications.find((m) =>
          m.drugName.toLowerCase() === item.description.toLowerCase() ||
          m.genericName.toLowerCase() === item.description.toLowerCase()
        ) || null;
      }

      let unitPriceDec: Prisma.Decimal;
      let isZeroPermitted: boolean = false;
      let finalDesc = item.description;
      let finalCode = item.serviceCode;
      let finalCategory = item.category || 'General';

      if (matchedMed) {
        finalDesc = matchedMed.drugName;
        finalCode = matchedMed.batchNumber || matchedMed.id;
        finalCategory = 'Pharmacy';

        if (matchedMed.unitPrice === null || matchedMed.unitPrice === undefined || isNaN(Number(matchedMed.unitPrice))) {
          return res.status(400).json({
            success: false,
            error: 'UnconfiguredMedicationPrice',
            message: `Medication price for "${matchedMed.drugName}" is unconfigured. Billing against unconfigured medication prices is strictly prevented.`
          });
        }
        unitPriceDec = new Prisma.Decimal(matchedMed.unitPrice.toFixed(2));
        isZeroPermitted = false;
      } else if (item.category?.toLowerCase() === 'pharmacy' || item.category?.toLowerCase() === 'medication') {
        return res.status(400).json({
          success: false,
          error: 'UnconfiguredMedicationPrice',
          message: `Medication price for "${item.description || 'medication'}" is unconfigured. Billing against unconfigured medication prices is strictly prevented.`
        });
      } else if (tariff) {
        finalDesc = tariff.serviceName;
        finalCode = tariff.serviceCode;
        finalCategory = tariff.category;

        if (tariff.isActive === false) {
          return res.status(400).json({
            success: false,
            error: 'InactiveService',
            message: `Service "${tariff.serviceName}" (${tariff.serviceCode}) is inactive and cannot be billed.`
          });
        }

        if (tariff.rate === null || tariff.rate === undefined) {
          return res.status(400).json({
            success: false,
            error: 'UnconfiguredTariff',
            message: `Tariff for "${tariff.serviceName}" (${tariff.serviceCode}) is unconfigured. Billing against unconfigured tariffs is strictly prevented.`
          });
        }

        unitPriceDec = new Prisma.Decimal(tariff.rate.toFixed(2));
        isZeroPermitted = tariff.isZeroPricePermitted || false;
      } else {
        return res.status(400).json({
          success: false,
          error: 'UnrecognizedTariff',
          message: `Line item "${item.description || 'unspecified'}" could not be reconciled against active hospital tariffs or formulary inventory.`
        });
      }

      if (unitPriceDec.isNegative()) {
        return res.status(400).json({
          success: false,
          error: 'InvalidItemData',
          message: `Item price cannot be negative for "${finalDesc}".`
        });
      }

      if (unitPriceDec.isZero() && !isZeroPermitted) {
        return res.status(400).json({
          success: false,
          error: 'ZeroPriceNotPermitted',
          message: `Zero-price billing is not permitted for "${finalDesc}". An established tariff rate is required.`
        });
      }

      const qtyDec = new Prisma.Decimal(quantity);
      const itemTotalDec = unitPriceDec.mul(qtyDec);

      validatedItems.push({
        id: item.id || `item-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        tariffId: tariff?.id || item.tariffId,
        medicationId: matchedMed?.id || item.medicationId,
        dispensingRecordId: item.dispensingRecordId,
        therapySessionId: item.therapySessionId,
        panchakarmaCourseId: item.panchakarmaCourseId,
        serviceCode: finalCode,
        description: finalDesc,
        category: finalCategory,
        quantity,
        unitPrice: Number(unitPriceDec.toFixed(2)),
        total: Number(itemTotalDec.toFixed(2)),
        isZeroPricePermitted: isZeroPermitted,
        _unitPriceDec: unitPriceDec.toFixed(2),
        _itemTotalDec: itemTotalDec.toFixed(2)
      });
    }

    const subtotalDec = validatedItems.reduce(
      (acc: Prisma.Decimal, it: any) => acc.add(new Prisma.Decimal(it._itemTotalDec)),
      new Prisma.Decimal(0)
    );

    validatedItems.forEach((it: any) => {
      delete it._unitPriceDec;
      delete it._itemTotalDec;
    });

    const subtotal = Number(subtotalDec.toFixed(2));
    const coveragePercentDec = new Prisma.Decimal(body.coveragePercentage || 0);
    const insuranceCoveredDec = subtotalDec.mul(coveragePercentDec).div(100).toDecimalPlaces(2);
    const insuranceCovered = Number(insuranceCoveredDec.toFixed(2));
    const copayDec = subtotalDec.sub(insuranceCoveredDec);
    const copay = Number(copayDec.toFixed(2));

    const isDraft = body.isDraft === true || body.status === 'draft';

    const newInvoice: any = {
      patientId: body.patientId,
      patientName: body.patientName || 'Unknown Patient',
      mrn: body.mrn || 'MRN-UNASSIGNED',
      status: isDraft ? 'draft' : 'issued',
      admissionDate: body.admissionDate || new Date().toISOString(),
      dischargeDate: body.dischargeDate,
      dueDate: body.dueDate,
      items: validatedItems,
      subtotal,
      insuranceCovered,
      copayPatient: copay,
      totalAmount: subtotal,
      paidAmount: 0,
      balance: subtotal,
      paymentStatus: 'unpaid',
      insuranceClaimStatus: body.insuranceClaimStatus || 'pending',
      notes: body.notes
    };

    const created = await dbCreateInvoice(
      newInvoice,
      { id: req.userId || 'system', name: req.userName || 'Accountant', role: req.userRole || 'ACCOUNTANT' },
      isDraft
    );

    await dbLogAudit(
      req.userName || 'Patient Financial Services',
      req.userRole!,
      'Invoice Issued',
      'Billing Clearance',
      `${isDraft ? 'Created draft' : 'Issued'} invoice ${created.invoiceNumber} for ₹${subtotal.toLocaleString()}`,
      created.mrn
    );

    res.status(201).json({ success: true, data: created });
  } catch (err: any) {
    if (err.message.includes('DuplicateBillingDetected')) {
      return res.status(409).json({ success: false, error: 'DuplicateBillingDetected', message: err.message });
    }
    res.status(500).json({ success: false, error: err.message });
  }
});

// 9.3 Issue Draft Invoice
apiRouter.post('/billing/invoices/:id/issue', requirePermission(CLINICAL_PERMISSIONS.INVOICE_ISSUE), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const updated = await dbIssueInvoice(
      req.params.id,
      { id: req.userId || 'system', name: req.userName || 'Accountant', role: req.userRole || 'ACCOUNTANT' }
    );
    await dbLogAudit(
      req.userName || 'Patient Financial Services',
      req.userRole!,
      'Invoice Issued',
      'Billing Clearance',
      `Issued draft invoice ${updated.invoiceNumber}`,
      updated.mrn
    );
    res.json({ success: true, data: updated });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// 9.4 Patient Account Summary & Billable Items
apiRouter.get('/billing/patients/:id/account', requirePermission(CLINICAL_PERMISSIONS.BILLING_READ), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const account = await dbGetPatientAccount(req.params.id);
    res.json({ success: true, data: account });
  } catch (err: any) {
    if (err.message.includes('PatientNotFound')) {
      return res.status(404).json({ success: false, error: 'PatientNotFound', message: err.message });
    }
    res.status(500).json({ success: false, error: err.message });
  }
});

apiRouter.get('/billing/patients/:id/billable-items', requirePermission(CLINICAL_PERMISSIONS.BILLING_READ), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const items = await dbGetPatientBillableItems(req.params.id);
    res.json({ success: true, data: items });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 9.5 Record Payment & Allocate Payment
apiRouter.post('/billing/payments', requirePermission(CLINICAL_PERMISSIONS.PAYMENT_RECORD), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { patientId, mrn, amount, paymentMethod, referenceNumber, notes, idempotencyKey, allocations } = req.body;
    if (!amount || Number(amount) <= 0) {
      return res.status(400).json({
        success: false,
        error: 'InvalidPaymentAmount',
        message: 'Payment amount must be strictly greater than zero.'
      });
    }
    if (!paymentMethod) {
      return res.status(400).json({
        success: false,
        error: 'MissingPaymentMethod',
        message: 'Payment method (Cash, UPI, Bank Transfer, Card, Other) is required.'
      });
    }

    const payment = await dbRecordPayment(
      {
        patientId,
        mrn,
        amount: Number(amount),
        paymentMethod,
        referenceNumber,
        notes,
        idempotencyKey,
        allocations
      },
      { id: req.userId || 'system', name: req.userName || 'Accountant', role: req.userRole || 'ACCOUNTANT' }
    );

    await dbLogAudit(
      req.userName || 'Hospital Cashier',
      req.userRole!,
      'Payment Recorded',
      'Billing Clearance',
      `Recorded payment ${payment.paymentNumber} of ₹${payment.amount} via ${payment.paymentMethod}`,
      payment.mrn
    );

    res.status(201).json({ success: true, data: payment });
  } catch (err: any) {
    if (err.message.includes('PatientNotFound')) {
      return res.status(404).json({ success: false, error: 'PatientNotFound', message: err.message });
    }
    if (err.message.includes('OverpaymentPrevented') || err.message.includes('InsufficientPaymentAmount') || err.message.includes('InvalidInvoiceState') || err.message.includes('InvoiceAlreadyPaid')) {
      return res.status(400).json({ success: false, error: 'PaymentAllocationError', message: err.message });
    }
    res.status(500).json({ success: false, error: err.message });
  }
});

apiRouter.post('/billing/payments/:id/allocate', requirePermission(CLINICAL_PERMISSIONS.PAYMENT_ALLOCATE), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { allocations } = req.body;
    if (!allocations || !Array.isArray(allocations) || allocations.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'EmptyAllocations',
        message: 'At least one invoice allocation is required.'
      });
    }

    const updatedPayment = await dbAllocatePayment(
      req.params.id,
      allocations,
      { id: req.userId || 'system', name: req.userName || 'Accountant', role: req.userRole || 'ACCOUNTANT' }
    );

    await dbLogAudit(
      req.userName || 'Hospital Cashier',
      req.userRole!,
      'Payment Allocated',
      'Billing Clearance',
      `Allocated payment ${updatedPayment.paymentNumber} to invoices`,
      updatedPayment.mrn
    );

    res.json({ success: true, data: updatedPayment });
  } catch (err: any) {
    if (err.message.includes('InsufficientCredit') || err.message.includes('OverpaymentPrevented') || err.message.includes('InvalidInvoiceState') || err.message.includes('InvoiceAlreadyPaid')) {
      return res.status(400).json({ success: false, error: 'AllocationError', message: err.message });
    }
    if (err.message.includes('PaymentNotFound') || err.message.includes('InvoiceNotFound')) {
      return res.status(404).json({ success: false, error: 'NotFoundError', message: err.message });
    }
    res.status(500).json({ success: false, error: err.message });
  }
});

apiRouter.get('/billing/payments', requirePermission(CLINICAL_PERMISSIONS.BILLING_READ), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const filters = {
      patientId: req.query.patientId as string,
      mrn: req.query.mrn as string,
      status: req.query.status as string,
      startDate: req.query.startDate as string,
      endDate: req.query.endDate as string
    };
    const payments = await dbGetPayments(filters);
    res.json({ success: true, data: payments });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

apiRouter.get('/billing/payments/:id', requirePermission(CLINICAL_PERMISSIONS.BILLING_READ), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const payment = await dbGetPaymentById(req.params.id);
    if (!payment) {
      return res.status(404).json({ success: false, error: 'PaymentNotFound', message: 'Payment not found' });
    }
    res.json({ success: true, data: payment });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 9.6 Refunds & Credit Adjustments (Dual Authorization)
apiRouter.post('/billing/refunds/request', requirePermission(CLINICAL_PERMISSIONS.REFUND_REQUEST), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { type, paymentId, invoiceId, patientId, mrn, amount, reason } = req.body;
    if (!type || !['refund', 'credit_adjustment', 'invoice_void'].includes(type)) {
      return res.status(400).json({
        success: false,
        error: 'InvalidRefundType',
        message: 'Valid refund type (refund, credit_adjustment, invoice_void) is required.'
      });
    }
    if (!amount || Number(amount) <= 0) {
      return res.status(400).json({
        success: false,
        error: 'InvalidRefundAmount',
        message: 'Refund amount must be strictly greater than zero.'
      });
    }
    if (!reason || !reason.trim()) {
      return res.status(400).json({
        success: false,
        error: 'MissingRefundReason',
        message: 'Reason for refund or credit adjustment is required.'
      });
    }

    const refund = await dbRequestRefund(
      {
        type,
        paymentId,
        invoiceId,
        patientId,
        mrn,
        amount: Number(amount),
        reason
      },
      { id: req.userId || 'system', name: req.userName || 'Accountant', role: req.userRole || 'ACCOUNTANT' }
    );

    await dbLogAudit(
      req.userName || 'Accountant',
      req.userRole!,
      'Refund Requested',
      'Billing Clearance',
      `Requested ${type} ${refund.requestNumber} for ₹${refund.amount}. Reason: ${refund.reason}`,
      refund.mrn
    );

    res.status(201).json({ success: true, data: refund });
  } catch (err: any) {
    if (err.message && err.message.includes('CreditAdjustmentBlocked')) {
      return res.status(400).json({
        success: false,
        error: 'CreditAdjustmentBlocked',
        code: 'CREDIT_ADJUSTMENT_WORKFLOW_BLOCKED',
        message: err.message
      });
    }
    if (err.message && err.message.includes('InsufficientRefundableBalance')) {
      return res.status(400).json({
        success: false,
        error: 'InsufficientRefundableBalance',
        code: 'INSUFFICIENT_REFUNDABLE_BALANCE',
        message: err.message
      });
    }
    res.status(400).json({ success: false, error: err.message });
  }
});

apiRouter.post('/billing/refunds/:id/approve', requirePermission(CLINICAL_PERMISSIONS.REFUND_APPROVE), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { approvalNotes } = req.body;
    const approved = await dbApproveRefund(
      req.params.id,
      { id: req.userId || 'system', name: req.userName || 'Super Admin', role: req.userRole || 'SUPER_ADMIN' },
      approvalNotes
    );

    await dbLogAudit(
      req.userName || 'Super Admin',
      req.userRole!,
      'Refund Approved',
      'Billing Clearance',
      `Approved refund ${approved.requestNumber} for ₹${approved.amount}`,
      approved.mrn
    );

    res.json({ success: true, data: approved });
  } catch (err: any) {
    if (err.message.includes('DualAuthorizationViolation')) {
      return res.status(403).json({
        success: false,
        error: 'DUAL_AUTHORIZATION_REQUIRED',
        message: 'Initiator cannot approve their own refund or credit request.'
      });
    }
    if (err.message.includes('RefundRequestNotFound')) {
      return res.status(404).json({ success: false, error: 'RefundNotFound', message: err.message });
    }
    res.status(400).json({ success: false, error: err.message });
  }
});

// Execute Approved Refund (ACCOUNTANT, SUPER_ADMIN)
apiRouter.post('/billing/refunds/:id/execute', requirePermission(CLINICAL_PERMISSIONS.REFUND_EXECUTE), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { refundMethod, externalReference, notes } = req.body;

    const actor = {
      id: req.userId || 'sys-actor',
      name: req.userName || 'Financial Operator',
      role: req.userRole || 'ACCOUNTANT'
    };

    const result = await dbExecuteRefund(
      req.params.id,
      { refundMethod, externalReference, notes },
      actor
    );

    await dbLogAudit(
      actor.name,
      actor.role,
      'Refund Executed',
      'Billing Clearance',
      `Executed refund ${result.refund.requestNumber} for ₹${result.refund.amount} via ${result.ledgerEntry.refundMethod} (Ledger Entry: ${result.ledgerEntry.entryNumber})`,
      result.refund.mrn
    );

    res.json({ success: true, data: result.refund, ledgerEntry: result.ledgerEntry });
  } catch (err: any) {
    if (err.message.includes('RefundRequestNotFound')) {
      return res.status(404).json({ success: false, error: 'RefundNotFound', message: err.message });
    }
    if (err.message.includes('RefundAlreadyExecuted')) {
      return res.status(400).json({ success: false, error: 'RefundAlreadyExecuted', message: err.message });
    }
    if (err.message.includes('InvalidRefundExecutionState')) {
      return res.status(400).json({ success: false, error: 'InvalidRefundExecutionState', message: err.message });
    }
    if (err.message.includes('UnauthorizedRefundExecution')) {
      return res.status(403).json({ success: false, error: 'UnauthorizedRefundExecution', message: err.message });
    }
    res.status(400).json({ success: false, error: err.message });
  }
});

// Reject Refund Request (Strictly SUPER_ADMIN)
apiRouter.post('/billing/refunds/:id/reject', requireRole(['SUPER_ADMIN']), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { reason } = req.body;
    if (!reason || !reason.trim()) {
      return res.status(400).json({ success: false, error: 'MissingRejectionReason', message: 'Rejection reason is required.' });
    }

    const rejected = await dbRejectRefund(
      req.params.id,
      { id: req.userId || 'system', name: req.userName || 'Super Administrator', role: req.userRole || 'SUPER_ADMIN' },
      reason
    );

    await dbLogAudit(
      req.userName || 'Super Administrator',
      req.userRole!,
      'Refund Rejected',
      'Billing Clearance',
      `Rejected refund ${rejected.requestNumber}. Reason: ${reason}`,
      rejected.mrn
    );

    res.json({ success: true, data: rejected });
  } catch (err: any) {
    if (err.message.includes('RefundRequestNotFound')) {
      return res.status(404).json({ success: false, error: 'RefundNotFound', message: err.message });
    }
    if (err.message.includes('UnauthorizedRefundRejection')) {
      return res.status(403).json({ success: false, error: 'UnauthorizedRefundRejection', message: err.message });
    }
    res.status(400).json({ success: false, error: err.message });
  }
});

apiRouter.get('/billing/refunds', requirePermission(CLINICAL_PERMISSIONS.BILLING_READ), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const filters = {
      status: req.query.status as string,
      patientId: req.query.patientId as string,
      mrn: req.query.mrn as string
    };
    const refunds = await dbGetRefundRequests(filters);
    res.json({ success: true, data: refunds });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Explicit Immutability Guards for Refund Ledger Entries
apiRouter.all('/billing/refunds/ledger*', requirePermission(CLINICAL_PERMISSIONS.REFUND_EXECUTE), (req: AuthenticatedRequest, res: Response) => {
  if (['PUT', 'PATCH', 'DELETE', 'POST'].includes(req.method)) {
    return res.status(405).json({
      success: false,
      error: 'IMMUTABLE_RECORD',
      message: 'Method Not Allowed: RefundLedgerEntry records are strictly immutable and cannot be updated, deleted, or manually inserted outside authorized execution.'
    });
  }
  return res.status(404).json({ success: false, error: 'NotFound' });
});

// 9.7 Financial Reports
apiRouter.get('/billing/reports/daily-collection', requirePermission(CLINICAL_PERMISSIONS.FINANCIAL_REPORT_READ), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const startDate = req.query.startDate as string;
    const endDate = req.query.endDate as string;
    const paymentMethod = req.query.paymentMethod as string;
    const report = await dbGetDailyCollectionReport(startDate, endDate, paymentMethod);
    res.json({ success: true, data: report });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

apiRouter.get('/billing/reports/outstanding-receivables', requirePermission(CLINICAL_PERMISSIONS.FINANCIAL_REPORT_READ), async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const report = await dbGetOutstandingReceivablesReport();
    res.json({ success: true, data: report });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

apiRouter.get('/billing/reports/invoice-register', requirePermission(CLINICAL_PERMISSIONS.FINANCIAL_REPORT_READ), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const filters = {
      startDate: req.query.startDate as string,
      endDate: req.query.endDate as string,
      status: req.query.status as string
    };
    const invoices = await dbGetInvoices(filters);
    res.json({ success: true, data: invoices });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

apiRouter.get('/billing/reports/payment-register', requirePermission(CLINICAL_PERMISSIONS.FINANCIAL_REPORT_READ), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const filters = {
      startDate: req.query.startDate as string,
      endDate: req.query.endDate as string,
      status: req.query.status as string
    };
    const payments = await dbGetPayments(filters);
    res.json({ success: true, data: payments });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

apiRouter.get('/billing/reports/refund-register', requirePermission(CLINICAL_PERMISSIONS.FINANCIAL_REPORT_READ), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const filters = {
      status: req.query.status as string
    };
    const refunds = await dbGetRefundRequests(filters);
    res.json({ success: true, data: refunds });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// 9.8 OPERATIONAL & CLINICAL REPORTS
// ==========================================
apiRouter.get('/reports/patients', requireRole(['SUPER_ADMIN', 'ADMIN', 'DOCTOR', 'VAIDYA', 'RECEPTIONIST']), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const startDate = req.query.startDate as string;
    const endDate = req.query.endDate as string;
    const report = await dbGetPatientDemographicsReport(startDate, endDate);
    res.json({ success: true, data: report });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

apiRouter.get('/reports/appointments', requireRole(['SUPER_ADMIN', 'ADMIN', 'DOCTOR', 'VAIDYA', 'RECEPTIONIST']), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const startDate = req.query.startDate as string;
    const endDate = req.query.endDate as string;
    const report = await dbGetAppointmentOperationalReport(startDate, endDate);
    res.json({ success: true, data: report });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

apiRouter.get('/reports/clinical-activity', requireRole(['SUPER_ADMIN', 'ADMIN', 'DOCTOR', 'VAIDYA']), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const startDate = req.query.startDate as string;
    const endDate = req.query.endDate as string;
    const report = await dbGetClinicalActivityReport(startDate, endDate);
    res.json({ success: true, data: report });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

apiRouter.get('/reports/treatments', requireRole(['SUPER_ADMIN', 'ADMIN', 'DOCTOR', 'VAIDYA']), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const startDate = req.query.startDate as string;
    const endDate = req.query.endDate as string;
    const report = await dbGetTreatmentOperationalReport(startDate, endDate);
    res.json({ success: true, data: report });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

apiRouter.get('/reports/pharmacy', requireRole(['SUPER_ADMIN', 'ADMIN', 'PHARMACIST']), async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const report = await dbGetPharmacyInventoryReport();
    res.json({ success: true, data: report });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

apiRouter.get('/reports/staff-departments', requireRole(['SUPER_ADMIN', 'ADMIN']), async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const report = await dbGetStaffWorkforceReport();
    res.json({ success: true, data: report });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// 9B. SERVICE & RATE MANAGEMENT (Super Admin Only)
// ==========================================
apiRouter.get('/tariffs', requireRole(VALID_USER_ROLES as unknown as UserRole[]), async (req: AuthenticatedRequest, res: Response) => {
  // Only SUPER_ADMIN can request inactive services; all other roles receive strictly active catalogue items
  const isSuperAdmin = req.userRole === 'SUPER_ADMIN';
  const includeInactive = isSuperAdmin && req.query.includeInactive === 'true';
  const tariffs = await dbGetTariffs(includeInactive);
  res.json({ success: true, data: tariffs });
});

apiRouter.get('/tariffs/:id', requireRole(VALID_USER_ROLES as unknown as UserRole[]), async (req: AuthenticatedRequest, res: Response) => {
  const tariff = await dbGetTariffById(req.params.id);
  if (!tariff) {
    return res.status(404).json({ success: false, message: 'Service tariff not found' });
  }
  res.json({ success: true, data: tariff });
});

// Create hospital service (EXCLUSIVELY SUPER_ADMIN)
apiRouter.post('/tariffs', requirePermission(CLINICAL_PERMISSIONS.TARIFF_MANAGE), async (req: AuthenticatedRequest, res: Response) => {
  const body = req.body;
  if (!body.serviceCode?.trim()) {
    return res.status(400).json({ success: false, error: 'MissingServiceCode', message: 'Service code is required.' });
  }
  if (!body.serviceName?.trim()) {
    return res.status(400).json({ success: false, error: 'MissingServiceName', message: 'Service name is required.' });
  }
  if (!body.category?.trim()) {
    return res.status(400).json({ success: false, error: 'MissingCategory', message: 'Service category is required.' });
  }

  try {
    const created = await dbCreateTariff(body, req.userName || 'Super Admin', req.authUserId);
    await dbLogAudit(
      req.userName || 'Super Admin',
      req.userRole!,
      'Service Management',
      'Service Configuration',
      `Action: Service Created | Code: ${created.serviceCode} | Name: ${created.serviceName} | Category: ${created.category}`,
      created.serviceCode
    );
    res.status(201).json({ success: true, data: created });
  } catch (err: any) {
    if (err.message?.includes('DuplicateServiceCode')) {
      return res.status(400).json({ success: false, error: 'DuplicateServiceCode', message: err.message });
    }
    res.status(500).json({ success: false, error: 'ServerError', message: err.message });
  }
});

// Update hospital service metadata (EXCLUSIVELY SUPER_ADMIN)
apiRouter.put('/tariffs/:id', requirePermission(CLINICAL_PERMISSIONS.TARIFF_MANAGE), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const updated = await dbUpdateTariff(req.params.id, req.body, req.userName || 'Super Admin', req.authUserId);
    if (!updated) {
      return res.status(404).json({ success: false, message: 'Service not found' });
    }
    await dbLogAudit(
      req.userName || 'Super Admin',
      req.userRole!,
      'Service Management',
      'Service Configuration',
      `Action: Service Updated | Code: ${updated.serviceCode} | Name: ${updated.serviceName}`,
      updated.serviceCode
    );
    res.json({ success: true, data: updated });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'ServerError', message: err.message });
  }
});

// Configure service rate with history and zero-price enforcement (EXCLUSIVELY SUPER_ADMIN)
apiRouter.patch('/tariffs/:id/rate', requirePermission(CLINICAL_PERMISSIONS.TARIFF_MANAGE), async (req: AuthenticatedRequest, res: Response) => {
  const { rate, isZeroPricePermitted, effectiveFrom, effectiveUntil, note } = req.body;
  const newRate = rate !== undefined && rate !== null && rate !== '' ? Number(rate) : null;

  if (newRate !== null && newRate < 0) {
    return res.status(400).json({ success: false, error: 'NegativeRate', message: 'Service rate cannot be negative.' });
  }

  if (newRate === 0 && !isZeroPricePermitted) {
    return res.status(400).json({
      success: false,
      error: 'ZeroPriceNotPermitted',
      message: 'Zero-price rate requires explicit authorization and confirmation (isZeroPricePermitted).'
    });
  }

  try {
    const updated = await dbConfigureTariffRate(
      req.params.id,
      newRate,
      Boolean(isZeroPricePermitted),
      effectiveFrom,
      effectiveUntil,
      note,
      req.userName || 'Super Admin',
      req.authUserId
    );
    if (!updated) {
      return res.status(404).json({ success: false, message: 'Service not found' });
    }

    const rateDesc = newRate === null ? 'UNCONFIGURED (NULL)' : `₹${newRate}`;
    await dbLogAudit(
      req.userName || 'Super Admin',
      req.userRole!,
      'Service Management',
      'Rate Configuration',
      `Action: Rate Configured | Service: ${updated.serviceCode} (${updated.serviceName}) | Rate: ${rateDesc} | ZeroPermitted: ${isZeroPricePermitted} | Note: ${note || 'None'}`,
      updated.serviceCode
    );
    res.json({ success: true, data: updated });
  } catch (err: any) {
    res.status(400).json({ success: false, error: 'RateConfigurationError', message: err.message });
  }
});

// Soft Activate / Deactivate service (EXCLUSIVELY SUPER_ADMIN)
apiRouter.patch('/tariffs/:id/status', requirePermission(CLINICAL_PERMISSIONS.TARIFF_MANAGE), async (req: AuthenticatedRequest, res: Response) => {
  const { isActive } = req.body;
  if (isActive === undefined) {
    return res.status(400).json({ success: false, error: 'MissingStatus', message: 'isActive boolean flag is required.' });
  }

  try {
    const updated = await dbUpdateTariff(req.params.id, { isActive: Boolean(isActive) }, req.userName || 'Super Admin', req.authUserId);
    if (!updated) {
      return res.status(404).json({ success: false, message: 'Service not found' });
    }

    const action = isActive ? 'Service Activated' : 'Service Deactivated';
    await dbLogAudit(
      req.userName || 'Super Admin',
      req.userRole!,
      'Service Management',
      'Service Configuration',
      `Action: ${action} | Service: ${updated.serviceCode} (${updated.serviceName})`,
      updated.serviceCode
    );
    res.json({ success: true, data: updated });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'ServerError', message: err.message });
  }
});

// Backward-compatible patch endpoint for existing callers (EXCLUSIVELY SUPER_ADMIN)
apiRouter.patch('/tariffs/:id', requirePermission(CLINICAL_PERMISSIONS.TARIFF_MANAGE), async (req: AuthenticatedRequest, res: Response) => {
  const { rate, isZeroPricePermitted, ...otherUpdates } = req.body;
  try {
    let updated: HospitalTariff | null = null;
    if (rate !== undefined) {
      const newRate = rate !== null && rate !== '' ? Number(rate) : null;
      if (newRate !== null && newRate < 0) {
        return res.status(400).json({ success: false, error: 'NegativeRate', message: 'Service rate cannot be negative.' });
      }
      if (newRate === 0 && !isZeroPricePermitted) {
        return res.status(400).json({
          success: false,
          error: 'ZeroPriceNotPermitted',
          message: 'Zero-price billing is not permitted without explicit authorization.'
        });
      }
      updated = await dbConfigureTariffRate(
        req.params.id,
        newRate,
        Boolean(isZeroPricePermitted),
        req.body.effectiveFrom,
        req.body.effectiveUntil,
        req.body.note,
        req.userName || 'Super Admin',
        req.authUserId
      );
    }
    if (Object.keys(otherUpdates).length > 0) {
      updated = await dbUpdateTariff(req.params.id, otherUpdates, req.userName || 'Super Admin', req.authUserId);
    }
    if (!updated) {
      return res.status(404).json({ success: false, message: 'Tariff not found' });
    }
    res.json({ success: true, data: updated });
  } catch (err: any) {
    res.status(400).json({ success: false, error: 'TariffUpdateError', message: err.message });
  }
});

// ==========================================
// 10. RBAC USERS (RbacController)
// ==========================================
apiRouter.get('/rbac/users', requireRole(['SUPER_ADMIN', 'ADMIN']), async (_req: AuthenticatedRequest, res: Response) => {
  const users = await dbGetUsers();
  res.json({ success: true, data: users });
});

apiRouter.patch('/rbac/users/:id/role', requireRole(['SUPER_ADMIN', 'ADMIN']), async (req: AuthenticatedRequest, res: Response) => {
  const targetRole = validateAndNormalizeRole(req.body.role);
  if (!targetRole) {
    return res.status(400).json({
      success: false,
      message: 'Invalid or unsupported role. Permitted roles are: SUPER_ADMIN, ADMIN, DOCTOR, RECEPTIONIST, PHARMACIST, ACCOUNTANT.'
    });
  }

  const allUsers = await dbGetUsers();
  const targetUser = allUsers.find((u) => u.id === req.params.id);
  if (!targetUser) {
    return res.status(404).json({ success: false, message: 'User not found' });
  }

  // Privilege escalation guards
  if (req.userRole === 'ADMIN') {
    if (targetRole === 'SUPER_ADMIN') {
      return res.status(403).json({
        success: false,
        message: 'Forbidden: Administrators cannot promote users to SUPER_ADMIN.'
      });
    }
    if (targetUser.role === 'SUPER_ADMIN') {
      return res.status(403).json({
        success: false,
        message: 'Forbidden: Administrators cannot modify the role of a SUPER_ADMIN user.'
      });
    }
  }

  const result = await dbUpdateUserRole(req.params.id, targetRole);
  if (!result.success) {
    return res.status(400).json({ success: false, message: result.error });
  }

  await dbLogAudit(
    req.userName || 'Administrator',
    req.userRole!,
    'Modified RBAC User Role',
    'RBAC Change',
    `Changed role of ${targetUser.name} (${targetUser.email}) from ${targetUser.role} to ${targetRole}`
  );

  res.json({ success: true, data: result.user });
});

// ==========================================
// 11. AUDIT LOGS (AuditController)
// ==========================================
apiRouter.get('/audit', requireRole(['SUPER_ADMIN', 'ADMIN']), async (_req: Request, res: Response) => {
  const logs = await dbGetAuditLogs();
  res.json({ success: true, data: logs });
});

// ==========================================
// 12. AYURVEDIC CONSULTATIONS (ConsultationsController)
// ==========================================
apiRouter.get('/consultations', requirePermission(CLINICAL_PERMISSIONS.CONSULTATION_READ), async (_req: AuthenticatedRequest, res: Response) => {
  const consultations = await dbGetConsultations();
  res.json({ success: true, data: consultations });
});

apiRouter.post('/consultations', requirePermission(CLINICAL_PERMISSIONS.CONSULTATION_WRITE), async (req: AuthenticatedRequest, res: Response) => {
  const body = req.body;
  const actor = req.userName || 'Clinical Vaidya';
  const role = req.userRole!;

  const newConsultation: Consultation = {
    id: `con-${Date.now()}`,
    consultationNumber: `CON-2026-00${Math.floor(50 + Math.random() * 50)}`,
    patientId: body.patientId,
    patientName: body.patientName || 'Registered Patient',
    patientMrn: body.patientMrn || '',
    doctorId: body.doctorId || req.userId || '',
    doctorName: body.doctorName || actor,
    appointmentId: body.appointmentId,
    dateTime: new Date().toISOString(),
    chiefComplaint: body.chiefComplaint || 'Ayurvedic Clinical Intake',
    duration: body.duration || '40 minutes',
    presentIllness: body.presentIllness || 'Chronic symptom assessment',
    vitals: body.vitals,
    ayurvedicAssessment: body.ayurvedicAssessment || {
      prakriti: { vata: 40, pitta: 40, kapha: 20, dominant: 'Vata-Pitta' },
      vikriti: { vata: 50, pitta: 30, kapha: 20, primaryImbalance: 'Doshic variance' },
      agni: 'Vishama (Irregular)',
      ama: 'Madhyama (Moderate)',
      koshtha: 'Madhyama (Moderate / Regular)',
      nadi: 'Sarpa gati regular',
      jihva: 'Mild Ama coating',
      nidra: 'Samyak (Sound/Restful)',
      ahara: 'Regular diet',
      vihara: 'Moderate activity',
      recordedAt: new Date().toISOString()
    },
    classicalDiagnosis: body.classicalDiagnosis || 'Vata-Pitta Imbalance with Ama',
    westernCorrelation: body.westernCorrelation,
    treatmentRecommendations: body.treatmentRecommendations || 'Deepana Pachana and Abhyanga regimen',
    recommendedTherapies: body.recommendedTherapies || ['Abhyanga (Herbal Full Body Massage)'],
    prescriptions: body.prescriptions || ['Triphala Churna 5g at bedtime with warm water'],
    status: body.status || 'completed',
    clinicalNotes: body.clinicalNotes || 'Initial Ayurvedic consultation complete.',
    completedAt: new Date().toISOString()
  };

  const createdConsultation = await dbCreateConsultation(newConsultation);
  await dbLogAudit(actor, role, 'Completed Ayurvedic Consultation', 'EMR Access', `Completed consultation ${createdConsultation.consultationNumber} for ${createdConsultation.patientName} (${createdConsultation.patientMrn})`, createdConsultation.patientMrn);

  // Sync to Supabase PostgreSQL when configured
  persistConsultationToSupabase(createdConsultation).catch(() => {});

  res.status(201).json({ success: true, data: createdConsultation });
});

apiRouter.patch('/consultations/:id', requirePermission(CLINICAL_PERMISSIONS.CONSULTATION_WRITE), (req: AuthenticatedRequest, res: Response) => {
  const index = hospitalStore.consultations.findIndex((c) => c.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ success: false, message: 'Consultation record not found' });
  }
  const updated = { ...hospitalStore.consultations[index], ...req.body };
  hospitalStore.consultations[index] = updated;
  res.json({ success: true, data: updated });
});

// ==========================================
// 13. AYURVEDIC TREATMENTS (TreatmentsController)
// ==========================================
apiRouter.get('/treatments', requireRole(['SUPER_ADMIN', 'ADMIN', 'DOCTOR', 'VAIDYA']), async (_req: AuthenticatedRequest, res: Response) => {
  const data = await dbGetTreatmentPlans();
  res.json({ success: true, data });
});

apiRouter.post('/treatments', requirePermission(CLINICAL_PERMISSIONS.AYURVEDIC_TREATMENT_WRITE), async (req: AuthenticatedRequest, res: Response) => {
  const body = req.body;
  const actor = req.userName || 'Senior Vaidya';
  const role = req.userRole!;

  const newPlan: TreatmentPlan = {
    id: `tp-${Date.now()}`,
    planNumber: `TP-2026-00${Math.floor(40 + Math.random() * 50)}`,
    patientId: body.patientId,
    patientName: body.patientName || 'Patient',
    patientMrn: body.patientMrn || '',
    doctorId: body.doctorId || req.userId || '',
    doctorName: body.doctorName || actor,
    assignedTherapist: body.assignedTherapist || 'Assigned Clinical Therapist',
    therapyType: body.therapyType || 'Abhyanga (Herbal Full Body Massage)',
    clinicalObjective: body.clinicalObjective || 'Snehana and Vata Shamana',
    oilOrFormulation: body.oilOrFormulation || 'Sahacharadi Thailam',
    totalSessions: Number(body.totalSessions) || 7,
    completedSessions: 0,
    frequency: body.frequency || 'Daily',
    startDate: body.startDate || new Date().toISOString().split('T')[0],
    endDate: body.endDate || new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0],
    roomNumber: body.roomNumber || 'Therapy Suite 01',
    status: 'active',
    notes: body.notes || 'Initiated personalized therapy plan.'
  };

  const created = await dbCreateTreatmentPlan(newPlan);
  hospitalStore.logAudit(actor, role, 'Created Ayurvedic Treatment Plan', 'EMR Access', `Created treatment plan ${created.planNumber} (${created.therapyType}) for ${created.patientName}`, created.patientMrn);
  res.status(201).json({ success: true, data: created });
});

apiRouter.patch('/treatments/:id', requirePermission(CLINICAL_PERMISSIONS.TREATMENT_SESSION_LOG), async (req: AuthenticatedRequest, res: Response) => {
  const updated = await dbUpdateTreatmentPlan(req.params.id, req.body);
  if (!updated) {
    return res.status(404).json({ success: false, message: 'Treatment plan not found' });
  }
  res.json({ success: true, data: updated });
});

// ==========================================
// 14. PANCHAKARMA MANAGEMENT (PanchakarmaController)
// ==========================================
apiRouter.get('/panchakarma', requireRole(['SUPER_ADMIN', 'ADMIN', 'DOCTOR', 'VAIDYA']), async (_req: AuthenticatedRequest, res: Response) => {
  const data = await dbGetPanchakarmaCourses();
  res.json({ success: true, data });
});

apiRouter.post('/panchakarma', requirePermission(CLINICAL_PERMISSIONS.PANCHAKARMA_MANAGE), async (req: AuthenticatedRequest, res: Response) => {
  const body = req.body;
  const actor = req.userName || 'Lead Panchakarma Vaidya';
  const role = req.userRole!;

  const newCourse: PanchakarmaCourse = {
    id: `pk-${Date.now()}`,
    courseNumber: `PK-2026-00${Math.floor(20 + Math.random() * 50)}`,
    patientId: body.patientId,
    patientName: body.patientName || 'Patient',
    patientMrn: body.patientMrn || '',
    vaidyaName: body.vaidyaName || actor,
    protocol: body.protocol || 'Virechana (Therapeutic Purgation - Pitta Cleansing)',
    currentPhase: 'Purvakarma (Prep/Snehana-Swedana)',
    startDate: body.startDate || new Date().toISOString().split('T')[0],
    expectedEndDate: body.expectedEndDate || new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0],
    totalDays: Number(body.totalDays) || 14,
    completedDays: 1,
    dietaryPrescription: body.dietaryPrescription || 'Samsarjana Krama: Manda -> Peya -> Vilepi -> Yusha',
    status: 'Active',
    dailySessions: [
      {
        day: 1,
        date: new Date().toISOString().split('T')[0],
        phase: 'Purvakarma (Prep/Snehana-Swedana)',
        procedureName: 'Deepana-Pachana with Trikatu & Snehana preparation',
        therapist: body.therapist || 'Assigned Therapist',
        bloodPressure: '124/80',
        pulseRate: '72 bpm',
        appetiteAssessment: 'Mild hunger',
        bowelStatus: 'Normal formed',
        observations: 'Initial preparatory therapy commenced.',
        status: 'completed'
      }
    ],
    dischargeNotes: body.dischargeNotes
  };

  const created = await dbCreatePanchakarmaCourse(newCourse);
  hospitalStore.logAudit(actor, role, 'Created Classical Panchakarma Course', 'EMR Access', `Initiated Panchakarma ${created.protocol} (${created.courseNumber}) for ${created.patientName}`, created.patientMrn);
  res.status(201).json({ success: true, data: created });
});

apiRouter.patch('/panchakarma/:id', requirePermission(CLINICAL_PERMISSIONS.PANCHAKARMA_MANAGE), async (req: AuthenticatedRequest, res: Response) => {
  const updated = await dbUpdatePanchakarmaCourse(req.params.id, req.body);
  if (!updated) {
    return res.status(404).json({ success: false, message: 'Panchakarma course not found' });
  }
  res.json({ success: true, data: updated });
});

apiRouter.post('/panchakarma/:id/session', requirePermission(CLINICAL_PERMISSIONS.TREATMENT_SESSION_LOG), async (req: AuthenticatedRequest, res: Response) => {
  const courses = await dbGetPanchakarmaCourses();
  const course = courses.find((pk) => pk.id === req.params.id);
  if (!course) {
    return res.status(404).json({ success: false, message: 'Panchakarma course not found' });
  }
  const session = req.body;
  const sessions = [...(course.dailySessions || []), session];
  const completedDays = sessions.filter((s: any) => s.status === 'completed').length;
  const status = completedDays >= course.totalDays ? 'Completed' : course.status;

  const updated = await dbUpdatePanchakarmaCourse(course.id, {
    dailySessions: sessions,
    completedDays,
    status
  });

  res.status(201).json({ success: true, data: updated });
});

// ==========================================
// 14A. THERAPY ROOMS MANAGEMENT (Phase 7)
// ==========================================
apiRouter.get('/therapy-rooms', requireRole(['SUPER_ADMIN', 'ADMIN', 'DOCTOR', 'VAIDYA', 'RECEPTIONIST']), async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const rooms = await dbGetTherapyRooms();
    res.json({ success: true, data: rooms });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message || 'Failed to fetch therapy rooms' });
  }
});

apiRouter.get('/therapy-rooms/stale-check', requireRole(['SUPER_ADMIN', 'ADMIN']), async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const stale = await dbCheckStaleRooms();
    res.json({ success: true, data: stale });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message || 'Failed to check stale rooms' });
  }
});

apiRouter.get('/therapy-rooms/:id', requireRole(['SUPER_ADMIN', 'ADMIN', 'DOCTOR', 'VAIDYA', 'RECEPTIONIST']), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const room = await dbGetTherapyRoomById(req.params.id);
    if (!room) return res.status(404).json({ success: false, message: 'Therapy room not found' });
    res.json({ success: true, data: room });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message || 'Failed to fetch therapy room' });
  }
});

apiRouter.post('/therapy-rooms', requireRole(['SUPER_ADMIN', 'ADMIN']), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const actor = { id: req.userId || 'admin', name: req.userName || 'Administrator', role: req.userRole! };
    const room = await dbCreateTherapyRoom(req.body, actor);
    res.status(201).json({ success: true, data: room });
  } catch (err: any) {
    if (err.message && err.message.includes('RoomCodeExists')) {
      return res.status(409).json({ success: false, code: 'ROOM_CODE_EXISTS', message: err.message });
    }
    res.status(500).json({ success: false, message: err.message || 'Failed to create therapy room' });
  }
});

apiRouter.patch('/therapy-rooms/:id', requireRole(['SUPER_ADMIN', 'ADMIN']), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const actor = { id: req.userId || 'admin', name: req.userName || 'Administrator', role: req.userRole! };
    const room = await dbUpdateTherapyRoom(req.params.id, req.body, actor);
    res.json({ success: true, data: room });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message || 'Failed to update therapy room' });
  }
});

apiRouter.post(['/therapy-rooms/:id/enter-maintenance', '/therapy-rooms/:id/maintenance/enter'], requireRole(['SUPER_ADMIN', 'ADMIN']), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const actor = { id: req.userId || 'admin', name: req.userName || 'Administrator', role: req.userRole! };
    const reason = req.body.reason || 'Scheduled equipment servicing';
    const room = await dbEnterRoomMaintenance(req.params.id, reason, actor);
    res.json({ success: true, data: room });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message || 'Failed to enter room maintenance' });
  }
});

apiRouter.post(['/therapy-rooms/:id/exit-maintenance', '/therapy-rooms/:id/maintenance/exit'], requireRole(['SUPER_ADMIN', 'ADMIN']), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const actor = { id: req.userId || 'admin', name: req.userName || 'Administrator', role: req.userRole! };
    const room = await dbExitRoomMaintenance(req.params.id, actor);
    res.json({ success: true, data: room });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message || 'Failed to exit room maintenance' });
  }
});

apiRouter.post(['/therapy-rooms/:id/sanitization-complete', '/therapy-rooms/:id/sanitize'], requireRole(['SUPER_ADMIN', 'ADMIN', 'VAIDYA', 'RECEPTIONIST']), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const actor = { id: req.userId || 'staff', name: req.userName || 'Clinical Staff', role: req.userRole! };
    const room = await dbRecordRoomSanitization(req.params.id, actor);
    res.json({ success: true, data: room });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message || 'Failed to record sanitization' });
  }
});

apiRouter.post('/therapy-rooms/:id/reconcile-stale', requireRole(['SUPER_ADMIN', 'ADMIN']), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const actor = { id: req.userId || 'admin', name: req.userName || 'Administrator', role: req.userRole! };
    const reason = req.body.reason || 'Administrative stale state recovery';
    const room = await dbReconcileStaleRoom(req.params.id, reason, actor);
    res.json({ success: true, data: room });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message || 'Failed to reconcile room status' });
  }
});

// ==========================================
// 14B. STAFF THERAPY QUALIFICATIONS & ELIGIBILITY (Phase 7)
// ==========================================
apiRouter.get(['/staff-therapy/eligible', '/therapy-staff/eligible'], requireRole(['SUPER_ADMIN', 'ADMIN', 'DOCTOR', 'VAIDYA', 'RECEPTIONIST']), async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const staff = await dbGetEligibleAdministeringStaff();
    res.json({ success: true, data: staff });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message || 'Failed to query eligible staff' });
  }
});

apiRouter.get(['/staff-therapy/vaidyas', '/therapy-staff/vaidyas'], requireRole(['SUPER_ADMIN', 'ADMIN', 'DOCTOR', 'VAIDYA', 'RECEPTIONIST']), async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const vaidyas = await dbGetResponsibleVaidyas();
    res.json({ success: true, data: vaidyas });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message || 'Failed to query responsible Vaidyas' });
  }
});

apiRouter.get(['/staff-therapy/authorizations', '/staff-therapy-authorizations'], requireRole(['SUPER_ADMIN', 'ADMIN', 'DOCTOR', 'VAIDYA', 'RECEPTIONIST']), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const list = await dbGetStaffTherapyAuthorizations(req.query.staffId as string);
    res.json({ success: true, data: list });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message || 'Failed to query staff authorizations' });
  }
});

apiRouter.post(['/staff-therapy/authorizations', '/staff-therapy-authorizations'], requireRole(['SUPER_ADMIN', 'ADMIN']), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const actor = { id: req.userId || 'admin', name: req.userName || 'Administrator', role: req.userRole! };
    const auth = await dbCreateStaffTherapyAuthorization(req.body.staffId, req.body, actor);
    res.status(201).json({ success: true, data: auth });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message || 'Failed to create staff therapy authorization' });
  }
});

apiRouter.post(['/staff-therapy/authorizations/:id/revoke', '/staff-therapy-authorizations/:id/revoke'], requireRole(['SUPER_ADMIN', 'ADMIN']), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const actor = { id: req.userId || 'admin', name: req.userName || 'Administrator', role: req.userRole! };
    const reason = req.body.reason || 'Credential expired or revoked';
    const auth = await dbRevokeStaffTherapyAuthorization(req.params.id, reason, actor);
    res.json({ success: true, data: auth });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message || 'Failed to revoke staff therapy authorization' });
  }
});

// ==========================================
// 14C. THERAPY SESSIONS SCHEDULING & CONCURRENCY (Phase 7)
// ==========================================
apiRouter.get('/therapy-sessions', requireRole(['SUPER_ADMIN', 'ADMIN', 'DOCTOR', 'VAIDYA', 'RECEPTIONIST', 'ACCOUNTANT']), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const sessions = await dbGetTherapySessions(req.query as any);
    res.json({ success: true, data: sessions });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message || 'Failed to fetch therapy sessions' });
  }
});

apiRouter.get(['/billing/unbilled-sessions', '/therapy-sessions/unbilled'], requirePermission(CLINICAL_PERMISSIONS.BILLING_READ), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const sessions = await dbGetTherapySessions({
      patientId: req.query.patientId as string,
      status: 'COMPLETED' as any,
      isBilled: false
    });
    // Filter out sessions that are covered by a course package
    const billable = sessions.filter((s) => s.billingMode !== 'PACKAGE_COVERED');
    res.json({ success: true, data: billable });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message || 'Failed to query unbilled therapy sessions' });
  }
});

apiRouter.get('/therapy-sessions/:id', requireRole(['SUPER_ADMIN', 'ADMIN', 'DOCTOR', 'VAIDYA', 'RECEPTIONIST', 'ACCOUNTANT']), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const session = await dbGetTherapySessionById(req.params.id);
    if (!session) return res.status(404).json({ success: false, message: 'Therapy session not found' });
    res.json({ success: true, data: session });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message || 'Failed to fetch therapy session' });
  }
});

apiRouter.post('/therapy-sessions', requirePermission(CLINICAL_PERMISSIONS.APPOINTMENT_SCHEDULE), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const actor = { id: req.userId || 'receptionist', name: req.userName || 'Receptionist', role: req.userRole! };
    const session = await dbScheduleTherapySession(req.body, actor);
    res.status(201).json({ success: true, data: session });
  } catch (err: any) {
    if (err instanceof SchedulingConflictError || err.code === 'SCHEDULING_CONFLICT') {
      return res.status(409).json({ success: false, code: 'SCHEDULING_CONFLICT', conflictType: err.conflictType, message: err.message });
    }
    if (err instanceof UnconfiguredTurnaroundBufferError || err.code === 'TURNAROUND_BUFFER_UNCONFIGURED' || err.message?.includes('UnconfiguredTurnaroundBuffer')) {
      return res.status(400).json({ success: false, code: 'TURNAROUND_BUFFER_UNCONFIGURED', error: 'UnconfiguredTurnaroundBuffer', message: err.message });
    }
    if (err instanceof ClinicalDisciplineMismatchError || err.code === 'CLINICAL_DISCIPLINE_MISMATCH') {
      return res.status(403).json({ success: false, code: 'CLINICAL_DISCIPLINE_MISMATCH', message: err.message });
    }
    res.status(400).json({ success: false, message: err.message || 'Failed to schedule therapy session' });
  }
});

apiRouter.post('/therapy-sessions/:id/reschedule', requirePermission(CLINICAL_PERMISSIONS.APPOINTMENT_SCHEDULE), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const actor = { id: req.userId || 'receptionist', name: req.userName || 'Receptionist', role: req.userRole! };
    const session = await dbRescheduleTherapySession(req.params.id, req.body, actor);
    res.json({ success: true, data: session });
  } catch (err: any) {
    if (err instanceof SchedulingConflictError || err.code === 'SCHEDULING_CONFLICT') {
      return res.status(409).json({ success: false, code: 'SCHEDULING_CONFLICT', conflictType: err.conflictType, message: err.message });
    }
    if (err instanceof UnconfiguredTurnaroundBufferError || err.code === 'TURNAROUND_BUFFER_UNCONFIGURED' || err.message?.includes('UnconfiguredTurnaroundBuffer')) {
      return res.status(400).json({ success: false, code: 'TURNAROUND_BUFFER_UNCONFIGURED', error: 'UnconfiguredTurnaroundBuffer', message: err.message });
    }
    if (err instanceof InvalidSessionStateError || err.code === 'INVALID_SESSION_STATE') {
      return res.status(400).json({ success: false, code: 'INVALID_SESSION_STATE', message: err.message });
    }
    res.status(400).json({ success: false, message: err.message || 'Failed to reschedule therapy session' });
  }
});

apiRouter.post('/therapy-sessions/:id/cancel', requirePermission(CLINICAL_PERMISSIONS.APPOINTMENT_SCHEDULE), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const actor = { id: req.userId || 'receptionist', name: req.userName || 'Receptionist', role: req.userRole! };
    const reason = req.body.reason || 'Cancelled by patient or clinic';
    const session = await dbCancelTherapySession(req.params.id, reason, actor);
    res.json({ success: true, data: session });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message || 'Failed to cancel therapy session' });
  }
});

apiRouter.post('/therapy-sessions/:id/no-show', requirePermission(CLINICAL_PERMISSIONS.APPOINTMENT_SCHEDULE), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const actor = { id: req.userId || 'receptionist', name: req.userName || 'Receptionist', role: req.userRole! };
    const reason = req.body.reason || 'Patient did not arrive for scheduled slot';
    const session = await dbNoShowTherapySession(req.params.id, reason, actor);
    res.json({ success: true, data: session });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message || 'Failed to record no-show' });
  }
});

// ==========================================
// 14D. THERAPY SESSIONS CLINICAL EXECUTION (Phase 7 - VAIDYA Authority)
// ==========================================
apiRouter.post('/therapy-sessions/:id/start', requirePermission(CLINICAL_PERMISSIONS.TREATMENT_SESSION_LOG), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const role = (req.userRole || '').toUpperCase();
    if (role !== 'VAIDYA') {
      return res.status(403).json({
        success: false,
        code: 'CLINICAL_DISCIPLINE_MISMATCH',
        message: 'Only a licensed Vaidya can authorize clinical clearance and commence therapy session execution.'
      });
    }

    const actor = { id: req.userId || 'vaidya', name: req.userName || 'Attending Vaidya', role };
    const session = await dbStartTherapySession(req.params.id, req.body, actor);
    res.json({ success: true, data: session });
  } catch (err: any) {
    if (err.message && err.message.includes('ClinicalClearanceRequired')) {
      return res.status(400).json({ success: false, code: 'CLINICAL_CLEARANCE_REQUIRED', message: err.message });
    }
    if (err instanceof InvalidSessionStateError || err.code === 'INVALID_SESSION_STATE') {
      return res.status(400).json({ success: false, code: 'INVALID_SESSION_STATE', message: err.message });
    }
    res.status(400).json({ success: false, message: err.message || 'Failed to start therapy session' });
  }
});

apiRouter.post('/therapy-sessions/:id/complete', requirePermission(CLINICAL_PERMISSIONS.TREATMENT_SESSION_LOG), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const role = (req.userRole || '').toUpperCase();
    if (role !== 'VAIDYA') {
      return res.status(403).json({
        success: false,
        code: 'CLINICAL_DISCIPLINE_MISMATCH',
        message: 'Only a licensed Vaidya can record post-procedure clinical assessments and complete therapy sessions.'
      });
    }

    const actor = { id: req.userId || 'vaidya', name: req.userName || 'Attending Vaidya', role };
    const session = await dbCompleteTherapySession(req.params.id, req.body, actor);
    res.json({ success: true, data: session });
  } catch (err: any) {
    if (err instanceof InvalidSessionStateError || err.code === 'INVALID_SESSION_STATE') {
      return res.status(400).json({ success: false, code: 'INVALID_SESSION_STATE', message: err.message });
    }
    res.status(400).json({ success: false, message: err.message || 'Failed to complete therapy session' });
  }
});

apiRouter.post('/therapy-sessions/:id/abort', requirePermission(CLINICAL_PERMISSIONS.TREATMENT_SESSION_LOG), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const role = (req.userRole || '').toUpperCase();
    if (role !== 'VAIDYA') {
      return res.status(403).json({
        success: false,
        code: 'CLINICAL_DISCIPLINE_MISMATCH',
        message: 'Only a licensed Vaidya can authorize clinical abortion of a therapy session.'
      });
    }

    const actor = { id: req.userId || 'vaidya', name: req.userName || 'Attending Vaidya', role };
    const session = await dbAbortTherapySession(req.params.id, req.body, actor);
    res.json({ success: true, data: session });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message || 'Failed to abort therapy session' });
  }
});

// ==========================================
// 14E. PANCHAKARMA REFERRALS & PHASE ADVANCEMENT (Phase 7 - VAIDYA Authority)
// ==========================================
apiRouter.get(['/panchakarma/referrals', '/panchakarma-referrals'], requireRole(['SUPER_ADMIN', 'ADMIN', 'DOCTOR', 'VAIDYA', 'RECEPTIONIST']), async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const referrals = await dbGetPanchakarmaReferrals();
    res.json({ success: true, data: referrals });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message || 'Failed to fetch Panchakarma referrals' });
  }
});

apiRouter.post(['/panchakarma/referrals/:id/convert', '/panchakarma-referrals/:id/convert'], requirePermission(CLINICAL_PERMISSIONS.PANCHAKARMA_MANAGE), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const role = (req.userRole || '').toUpperCase();
    if (role !== 'VAIDYA') {
      return res.status(403).json({
        success: false,
        code: 'CLINICAL_DISCIPLINE_MISMATCH',
        message: 'Only a licensed Vaidya can initiate a Panchakarma course from a referral.'
      });
    }

    const actor = { id: req.userId || 'vaidya', name: req.userName || 'Attending Vaidya', role };
    const course = await dbConvertReferralToCourse(req.params.id, req.body, actor);
    res.status(201).json({ success: true, data: course });
  } catch (err: any) {
    if (err.message && err.message.includes('ReferralAlreadyConverted')) {
      return res.status(409).json({ success: false, code: 'REFERRAL_ALREADY_CONVERTED', message: err.message });
    }
    res.status(400).json({ success: false, message: err.message || 'Failed to convert referral to course' });
  }
});

apiRouter.post(['/panchakarma/:id/phase-advance', '/panchakarma-courses/:id/advance-phase', '/panchakarma/:id/advance-phase'], requirePermission(CLINICAL_PERMISSIONS.PANCHAKARMA_MANAGE), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const role = (req.userRole || '').toUpperCase();
    if (role !== 'VAIDYA') {
      return res.status(403).json({
        success: false,
        code: 'CLINICAL_DISCIPLINE_MISMATCH',
        message: 'Only a licensed Vaidya can advance Panchakarma protocol phases.'
      });
    }

    const actor = { id: req.userId || 'vaidya', name: req.userName || 'Attending Vaidya', role };
    const course = await dbAdvancePanchakarmaPhase(req.params.id, req.body, actor);
    res.json({ success: true, data: course });
  } catch (err: any) {
    if (err.message && err.message.includes('ClinicalRationaleRequired')) {
      return res.status(400).json({ success: false, code: 'CLINICAL_RATIONALE_REQUIRED', message: err.message });
    }
    res.status(400).json({ success: false, message: err.message || 'Failed to advance Panchakarma phase' });
  }
});

apiRouter.post(['/panchakarma/:id/pause', '/panchakarma-courses/:id/pause'], requirePermission(CLINICAL_PERMISSIONS.PANCHAKARMA_MANAGE), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const role = (req.userRole || '').toUpperCase();
    if (role !== 'VAIDYA') {
      return res.status(403).json({
        success: false,
        code: 'CLINICAL_DISCIPLINE_MISMATCH',
        message: 'Only a licensed Vaidya can pause a Panchakarma course.'
      });
    }

    const actor = { id: req.userId || 'vaidya', name: req.userName || 'Attending Vaidya', role };
    const reason = req.body.reason || 'Clinical pause ordered by Vaidya';
    const course = await dbPausePanchakarmaCourse(req.params.id, reason, actor);
    res.json({ success: true, data: course });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message || 'Failed to pause course' });
  }
});

apiRouter.post(['/panchakarma/:id/resume', '/panchakarma-courses/:id/resume'], requirePermission(CLINICAL_PERMISSIONS.PANCHAKARMA_MANAGE), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const role = (req.userRole || '').toUpperCase();
    if (role !== 'VAIDYA') {
      return res.status(403).json({
        success: false,
        code: 'CLINICAL_DISCIPLINE_MISMATCH',
        message: 'Only a licensed Vaidya can resume a Panchakarma course.'
      });
    }

    const actor = { id: req.userId || 'vaidya', name: req.userName || 'Attending Vaidya', role };
    const course = await dbResumePanchakarmaCourse(req.params.id, actor);
    res.json({ success: true, data: course });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message || 'Failed to resume course' });
  }
});

apiRouter.post(['/panchakarma/:id/terminate', '/panchakarma-courses/:id/terminate'], requirePermission(CLINICAL_PERMISSIONS.PANCHAKARMA_MANAGE), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const role = (req.userRole || '').toUpperCase();
    if (role !== 'VAIDYA') {
      return res.status(403).json({
        success: false,
        code: 'CLINICAL_DISCIPLINE_MISMATCH',
        message: 'Only a licensed Vaidya can terminate a Panchakarma course.'
      });
    }

    const actor = { id: req.userId || 'vaidya', name: req.userName || 'Attending Vaidya', role };
    const reason = req.body.reason || 'Clinical termination ordered by Vaidya';
    const course = await dbTerminatePanchakarmaCourse(req.params.id, reason, actor);
    res.json({ success: true, data: course });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message || 'Failed to terminate course' });
  }
});



// ==========================================
// 15. STOCK MOVEMENTS & SUPPLIERS (PharmacyInventoryController)
// ==========================================
apiRouter.get('/stock-movements', requirePermission(CLINICAL_PERMISSIONS.PHARMACY_STOCK_MANAGE), async (_req: Request, res: Response) => {
  const list = await dbGetStockMovements();
  res.json({ success: true, data: list });
});

apiRouter.post('/stock-movements', requirePermission(CLINICAL_PERMISSIONS.PHARMACY_STOCK_MANAGE), async (req: AuthenticatedRequest, res: Response) => {
  const body = req.body;
  const newMovement: StockMovement = {
    id: `sm-${Date.now()}`,
    timestamp: new Date().toISOString(),
    medicineId: body.medicineId,
    medicineName: body.medicineName,
    batchNumber: body.batchNumber || 'AY-BATCH',
    type: body.type || 'Audit Adjustment',
    quantityDelta: Number(body.quantityDelta) || 0,
    remainingQuantity: Number(body.remainingQuantity) || 10,
    actor: req.userName || 'Lead Pharmacist',
    referenceNumber: body.referenceNumber || `REF-${Date.now()}`,
    notes: body.notes || 'Inventory movement recorded.'
  };

  const created = await dbCreateStockMovement(newMovement);
  res.status(201).json({ success: true, data: created });
});

apiRouter.get('/suppliers', requirePermission(CLINICAL_PERMISSIONS.PHARMACY_STOCK_MANAGE), (_req: Request, res: Response) => {
  res.json({ success: true, data: hospitalStore.suppliers });
});

// ==========================================
// 16. PHASE 3: CLINICAL OPERATIONS (DOCTOR & VAIDYA DISCIPLINE)
// ==========================================

// Doctor Dashboard
apiRouter.get('/clinical/doctor/dashboard', requirePermission(CLINICAL_PERMISSIONS.DOCTOR_DASHBOARD), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const practitionerId = (req.query.practitionerId as string) || (req.userRole === 'DOCTOR' ? req.userId : undefined);
    const metrics = await dbGetDoctorDashboard(practitionerId);
    res.json({ success: true, data: metrics });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message || 'Failed to fetch doctor dashboard' });
  }
});

// Vaidya Dashboard
apiRouter.get('/clinical/vaidya/dashboard', requirePermission(CLINICAL_PERMISSIONS.VAIDYA_DASHBOARD), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const practitionerId = (req.query.practitionerId as string) || (req.userRole === 'VAIDYA' ? req.userId : undefined);
    const metrics = await dbGetVaidyaDashboard(practitionerId);
    res.json({ success: true, data: metrics });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message || 'Failed to fetch vaidya dashboard' });
  }
});

// Doctor Queue (Modern Medicine discipline isolation)
apiRouter.get('/clinical/doctor/queue', requirePermission(CLINICAL_PERMISSIONS.DOCTOR_QUEUE), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const queue = await dbGetDoctorQueue({
      date: req.query.date as string,
      practitionerId: req.query.practitionerId as string
    });
    res.json({ success: true, data: queue });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message || 'Failed to fetch doctor queue' });
  }
});

// Vaidya Queue (Ayurvedic discipline isolation)
apiRouter.get('/clinical/vaidya/queue', requirePermission(CLINICAL_PERMISSIONS.VAIDYA_QUEUE), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const queue = await dbGetVaidyaQueue({
      date: req.query.date as string,
      practitionerId: req.query.practitionerId as string
    });
    res.json({ success: true, data: queue });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message || 'Failed to fetch vaidya queue' });
  }
});

// Clinical Encounter Initiation
apiRouter.post('/clinical/encounters/initiate', requirePermission(CLINICAL_PERMISSIONS.ENCOUNTER_INITIATE), async (req: AuthenticatedRequest, res: Response) => {
  const actor = {
    id: req.userId || 'clinician',
    name: req.userName || 'Attending Clinician',
    role: req.userRole!
  };

  const { patientId, appointmentId, encounterType, reasonForVisit } = req.body;
  if (!patientId) {
    return res.status(400).json({
      success: false,
      code: 'PATIENT_ID_REQUIRED',
      message: 'Patient ID or MRN is mandatory to initiate a clinical encounter.'
    });
  }

  try {
    const encounter = await dbInitiateEncounter(
      { patientId, appointmentId, encounterType, reasonForVisit },
      actor
    );
    res.status(201).json({ success: true, data: encounter });
  } catch (err: any) {
    const msg = err.message || '';
    if (msg.includes('ClinicalAuthorityRequired')) {
      return res.status(403).json({ success: false, code: 'CLINICAL_AUTHORITY_REQUIRED', message: msg });
    }
    if (msg.includes('ClinicalDisciplineMismatch')) {
      return res.status(403).json({ success: false, code: 'CLINICAL_DISCIPLINE_MISMATCH', message: msg });
    }
    if (msg.includes('ActiveEncounterExists')) {
      return res.status(409).json({ success: false, code: 'ACTIVE_ENCOUNTER_EXISTS', message: msg });
    }
    if (msg.includes('PatientNotFound')) {
      return res.status(404).json({ success: false, code: 'PATIENT_NOT_FOUND', message: msg });
    }
    if (msg.includes('AppointmentNotFound')) {
      return res.status(404).json({ success: false, code: 'APPOINTMENT_NOT_FOUND', message: msg });
    }
    res.status(500).json({ success: false, message: msg || 'Failed to initiate encounter' });
  }
});

// Get Clinical Encounter by ID
apiRouter.get('/clinical/encounters/:id', requirePermission(CLINICAL_PERMISSIONS.ENCOUNTER_READ), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const encounter = await dbGetEncounterById(req.params.id, req.userRole);
    res.json({ success: true, data: encounter });
  } catch (err: any) {
    const msg = err.message || '';
    if (msg.includes('EncounterNotFound')) {
      return res.status(404).json({ success: false, message: 'Encounter not found' });
    }
    res.status(500).json({ success: false, message: msg || 'Failed to fetch encounter' });
  }
});

// Complete Clinical Encounter
apiRouter.post('/clinical/encounters/:id/complete', requirePermission(CLINICAL_PERMISSIONS.ENCOUNTER_COMPLETE), async (req: AuthenticatedRequest, res: Response) => {
  const actor = {
    id: req.userId || 'clinician',
    name: req.userName || 'Attending Clinician',
    role: req.userRole!
  };

  try {
    const encounter = await dbCompleteEncounter(req.params.id, actor);
    res.json({ success: true, data: encounter });
  } catch (err: any) {
    const msg = err.message || '';
    if (msg.includes('ClinicalAuthorityRequired')) {
      return res.status(403).json({ success: false, code: 'CLINICAL_AUTHORITY_REQUIRED', message: msg });
    }
    if (msg.includes('ClinicalDisciplineMismatch')) {
      return res.status(403).json({ success: false, code: 'CLINICAL_DISCIPLINE_MISMATCH', message: msg });
    }
    if (msg.includes('InvalidEncounterState')) {
      return res.status(400).json({ success: false, code: 'INVALID_ENCOUNTER_STATE', message: msg });
    }
    if (msg.includes('EncounterNotFound')) {
      return res.status(404).json({ success: false, message: 'Encounter not found' });
    }
    res.status(500).json({ success: false, message: msg || 'Failed to complete encounter' });
  }
});

// Record Vitals
apiRouter.post('/clinical/encounters/:id/vitals', requirePermission(CLINICAL_PERMISSIONS.VITALS_RECORD), async (req: AuthenticatedRequest, res: Response) => {
  const actor = {
    id: req.userId || 'clinician',
    name: req.userName || 'Attending Clinician',
    role: req.userRole!
  };

  try {
    const vitals = await dbRecordVitals(req.params.id, req.body, actor);
    res.status(201).json({ success: true, data: vitals });
  } catch (err: any) {
    const msg = err.message || '';
    if (msg.includes('ClinicalAuthorityRequired')) {
      return res.status(403).json({ success: false, code: 'CLINICAL_AUTHORITY_REQUIRED', message: msg });
    }
    if (msg.includes('ClinicalDisciplineMismatch')) {
      return res.status(403).json({ success: false, code: 'CLINICAL_DISCIPLINE_MISMATCH', message: msg });
    }
    if (msg.includes('InvalidEncounterState')) {
      return res.status(400).json({ success: false, code: 'INVALID_ENCOUNTER_STATE', message: msg });
    }
    if (msg.includes('EncounterNotFound')) {
      return res.status(404).json({ success: false, message: 'Encounter not found' });
    }
    res.status(500).json({ success: false, message: msg || 'Failed to record vitals' });
  }
});

// Save Clinical Assessment
apiRouter.post('/clinical/encounters/:id/assessment', requirePermission(CLINICAL_PERMISSIONS.ASSESSMENT_SAVE), async (req: AuthenticatedRequest, res: Response) => {
  const actor = {
    id: req.userId || 'clinician',
    name: req.userName || 'Attending Clinician',
    role: req.userRole!
  };

  try {
    const assessment = await dbSaveAssessment(req.params.id, req.body, actor);
    res.status(201).json({ success: true, data: assessment });
  } catch (err: any) {
    const msg = err.message || '';
    if (msg.includes('ClinicalAuthorityRequired')) {
      return res.status(403).json({ success: false, code: 'CLINICAL_AUTHORITY_REQUIRED', message: msg });
    }
    if (msg.includes('ClinicalDisciplineMismatch')) {
      return res.status(403).json({ success: false, code: 'CLINICAL_DISCIPLINE_MISMATCH', message: msg });
    }
    if (msg.includes('InvalidEncounterState')) {
      return res.status(400).json({ success: false, code: 'INVALID_ENCOUNTER_STATE', message: msg });
    }
    if (msg.includes('EncounterNotFound')) {
      return res.status(404).json({ success: false, message: 'Encounter not found' });
    }
    res.status(500).json({ success: false, message: msg || 'Failed to save assessment' });
  }
});

// Add Clinical Diagnosis
apiRouter.post('/clinical/encounters/:id/diagnoses', requirePermission(CLINICAL_PERMISSIONS.DIAGNOSIS_SAVE), async (req: AuthenticatedRequest, res: Response) => {
  const actor = {
    id: req.userId || 'clinician',
    name: req.userName || 'Attending Clinician',
    role: req.userRole!
  };

  try {
    const diagnosis = await dbAddDiagnosis(req.params.id, req.body, actor);
    res.status(201).json({ success: true, data: diagnosis });
  } catch (err: any) {
    const msg = err.message || '';
    if (msg.includes('ClinicalAuthorityRequired')) {
      return res.status(403).json({ success: false, code: 'CLINICAL_AUTHORITY_REQUIRED', message: msg });
    }
    if (msg.includes('ClinicalDisciplineMismatch')) {
      return res.status(403).json({ success: false, code: 'CLINICAL_DISCIPLINE_MISMATCH', message: msg });
    }
    if (msg.includes('DiagnosisNameRequired')) {
      return res.status(400).json({ success: false, code: 'DIAGNOSIS_NAME_REQUIRED', message: msg });
    }
    if (msg.includes('InvalidEncounterState')) {
      return res.status(400).json({ success: false, code: 'INVALID_ENCOUNTER_STATE', message: msg });
    }
    if (msg.includes('EncounterNotFound')) {
      return res.status(404).json({ success: false, message: 'Encounter not found' });
    }
    res.status(500).json({ success: false, message: msg || 'Failed to add diagnosis' });
  }
});

// Order Lab Investigation (Doctor discipline only)
apiRouter.post('/clinical/encounters/:id/investigations', requirePermission(CLINICAL_PERMISSIONS.INVESTIGATION_ORDER), async (req: AuthenticatedRequest, res: Response) => {
  const actor = {
    id: req.userId || 'doctor',
    name: req.userName || 'Attending Physician',
    role: req.userRole!
  };

  try {
    const labOrder = await dbOrderInvestigation(req.params.id, req.body, actor);
    res.status(201).json({ success: true, data: labOrder });
  } catch (err: any) {
    const msg = err.message || '';
    if (msg.includes('ClinicalDisciplineMismatch')) {
      return res.status(403).json({ success: false, code: 'CLINICAL_DISCIPLINE_MISMATCH', message: msg });
    }
    if (msg.includes('TestTypeRequired')) {
      return res.status(400).json({ success: false, code: 'TEST_TYPE_REQUIRED', message: msg });
    }
    if (msg.includes('InvalidEncounterState')) {
      return res.status(400).json({ success: false, code: 'INVALID_ENCOUNTER_STATE', message: msg });
    }
    if (msg.includes('EncounterNotFound')) {
      return res.status(404).json({ success: false, message: 'Encounter not found' });
    }
    res.status(500).json({ success: false, message: msg || 'Failed to order investigation' });
  }
});

// Fetch Lab Investigation (Only authorized Modern Medicine DOCTOR)
apiRouter.get('/clinical/investigations/:id', requirePermission(CLINICAL_PERMISSIONS.INVESTIGATION_READ), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const lab = await dbGetInvestigationById(req.params.id);
    if (!lab) {
      return res.status(404).json({ success: false, message: 'Lab order not found' });
    }
    res.json({ success: true, data: lab });
  } catch (err: any) {
    const msg = err.message || '';
    if (msg.includes('ClinicalDisciplineMismatch')) {
      return res.status(403).json({ success: false, code: 'CLINICAL_DISCIPLINE_MISMATCH', message: msg });
    }
    res.status(500).json({ success: false, message: msg || 'Failed to fetch investigation' });
  }
});

// Record Lab Investigation Results
apiRouter.post('/clinical/investigations/:id/results', requirePermission(CLINICAL_PERMISSIONS.INVESTIGATION_RESULT), async (req: AuthenticatedRequest, res: Response) => {
  const actor = {
    id: req.userId || 'doctor',
    name: req.userName || 'Attending Physician',
    role: req.userRole!
  };

  try {
    const updated = await dbRecordInvestigationResult(req.params.id, req.body, actor);
    res.json({ success: true, data: updated });
  } catch (err: any) {
    const msg = err.message || '';
    if (msg.includes('ClinicalDisciplineMismatch')) {
      return res.status(403).json({ success: false, code: 'CLINICAL_DISCIPLINE_MISMATCH', message: msg });
    }
    if (msg.includes('LabOrderNotFound')) {
      return res.status(404).json({ success: false, message: 'Lab order not found' });
    }
    res.status(500).json({ success: false, message: msg || 'Failed to record results' });
  }
});

// Review Lab Investigation (Explicit DOCTOR clinical action)
apiRouter.post('/clinical/investigations/:id/review', requirePermission(CLINICAL_PERMISSIONS.INVESTIGATION_REVIEW), async (req: AuthenticatedRequest, res: Response) => {
  const actor = {
    id: req.userId || 'clinician',
    name: req.userName || 'Attending Clinician',
    role: req.userRole!
  };

  try {
    const updated = await dbReviewInvestigation(req.params.id, req.body, actor);
    res.json({ success: true, data: updated });
  } catch (err: any) {
    const msg = err.message || '';
    if (msg.includes('ClinicalDisciplineMismatch')) {
      return res.status(403).json({ success: false, code: 'CLINICAL_DISCIPLINE_MISMATCH', message: msg });
    }
    if (msg.includes('ClinicalAuthorityRequired')) {
      return res.status(403).json({ success: false, code: 'CLINICAL_AUTHORITY_REQUIRED', message: msg });
    }
    if (msg.includes('LabOrderNotFound')) {
      return res.status(404).json({ success: false, message: 'Lab order not found' });
    }
    res.status(500).json({ success: false, message: msg || 'Failed to review investigation' });
  }
});

// Author Prescription
apiRouter.post('/clinical/encounters/:id/prescriptions', requirePermission(CLINICAL_PERMISSIONS.CLINICAL_PRESCRIPTION), async (req: AuthenticatedRequest, res: Response) => {
  const actor = {
    id: req.userId || 'clinician',
    name: req.userName || 'Attending Clinician',
    role: req.userRole!
  };

  try {
    const prescription = await dbPrescribeEncounterMedication(req.params.id, req.body, actor);
    res.status(201).json({ success: true, data: prescription });
  } catch (err: any) {
    const msg = err.message || '';
    if (msg.includes('ClinicalAuthorityRequired')) {
      return res.status(403).json({ success: false, code: 'CLINICAL_AUTHORITY_REQUIRED', message: msg });
    }
    if (msg.includes('ClinicalDisciplineMismatch')) {
      return res.status(403).json({ success: false, code: 'CLINICAL_DISCIPLINE_MISMATCH', message: msg });
    }
    if (msg.includes('MedicationNotFound')) {
      return res.status(404).json({ success: false, code: 'MEDICATION_NOT_FOUND', message: msg });
    }
    if (msg.includes('MedicationNameRequired')) {
      return res.status(400).json({ success: false, code: 'MEDICATION_NAME_REQUIRED', message: msg });
    }
    if (msg.includes('InvalidEncounterState')) {
      return res.status(400).json({ success: false, code: 'INVALID_ENCOUNTER_STATE', message: msg });
    }
    if (msg.includes('EncounterNotFound')) {
      return res.status(404).json({ success: false, message: 'Encounter not found' });
    }
    res.status(500).json({ success: false, message: msg || 'Failed to author prescription' });
  }
});

// Prakriti Assessment (Vaidya discipline only)
apiRouter.post('/clinical/encounters/:id/prakriti', requirePermission(CLINICAL_PERMISSIONS.AYURVEDIC_CLINICAL_MANAGE), async (req: AuthenticatedRequest, res: Response) => {
  const actor = {
    id: req.userId || 'vaidya',
    name: req.userName || 'Attending Vaidya',
    role: req.userRole!
  };

  try {
    const prakriti = await dbRecordPrakriti(req.params.id, req.body, actor);
    res.status(201).json({ success: true, data: prakriti });
  } catch (err: any) {
    const msg = err.message || '';
    if (msg.includes('ClinicalDisciplineMismatch')) {
      return res.status(403).json({ success: false, code: 'CLINICAL_DISCIPLINE_MISMATCH', message: msg });
    }
    if (msg.includes('ClinicalInterpretationRequired')) {
      return res.status(400).json({ success: false, code: 'CLINICAL_INTERPRETATION_REQUIRED', message: msg });
    }
    if (msg.includes('InvalidEncounterState')) {
      return res.status(400).json({ success: false, code: 'INVALID_ENCOUNTER_STATE', message: msg });
    }
    if (msg.includes('EncounterNotFound')) {
      return res.status(404).json({ success: false, message: 'Encounter not found' });
    }
    res.status(500).json({ success: false, message: msg || 'Failed to record Prakriti' });
  }
});

// Vikriti Assessment (Vaidya discipline only)
apiRouter.post('/clinical/encounters/:id/vikriti', requirePermission(CLINICAL_PERMISSIONS.AYURVEDIC_CLINICAL_MANAGE), async (req: AuthenticatedRequest, res: Response) => {
  const actor = {
    id: req.userId || 'vaidya',
    name: req.userName || 'Attending Vaidya',
    role: req.userRole!
  };

  try {
    const vikriti = await dbRecordVikriti(req.params.id, req.body, actor);
    res.status(201).json({ success: true, data: vikriti });
  } catch (err: any) {
    const msg = err.message || '';
    if (msg.includes('ClinicalDisciplineMismatch')) {
      return res.status(403).json({ success: false, code: 'CLINICAL_DISCIPLINE_MISMATCH', message: msg });
    }
    if (msg.includes('PrimaryVikritiRequired') || msg.includes('ClinicalInterpretationRequired')) {
      return res.status(400).json({ success: false, code: 'VALIDATION_FAILED', message: msg });
    }
    if (msg.includes('InvalidEncounterState')) {
      return res.status(400).json({ success: false, code: 'INVALID_ENCOUNTER_STATE', message: msg });
    }
    if (msg.includes('EncounterNotFound')) {
      return res.status(404).json({ success: false, message: 'Encounter not found' });
    }
    res.status(500).json({ success: false, message: msg || 'Failed to record Vikriti' });
  }
});

// Dosha Evaluation (Vaidya discipline only)
apiRouter.post('/clinical/encounters/:id/dosha-evaluation', requirePermission(CLINICAL_PERMISSIONS.AYURVEDIC_CLINICAL_MANAGE), async (req: AuthenticatedRequest, res: Response) => {
  const actor = {
    id: req.userId || 'vaidya',
    name: req.userName || 'Attending Vaidya',
    role: req.userRole!
  };

  try {
    const dosha = await dbRecordDoshaEvaluation(req.params.id, req.body, actor);
    res.status(201).json({ success: true, data: dosha });
  } catch (err: any) {
    const msg = err.message || '';
    if (msg.includes('ClinicalDisciplineMismatch')) {
      return res.status(403).json({ success: false, code: 'CLINICAL_DISCIPLINE_MISMATCH', message: msg });
    }
    if (msg.includes('ClinicalInterpretationRequired')) {
      return res.status(400).json({ success: false, code: 'CLINICAL_INTERPRETATION_REQUIRED', message: msg });
    }
    if (msg.includes('InvalidEncounterState')) {
      return res.status(400).json({ success: false, code: 'INVALID_ENCOUNTER_STATE', message: msg });
    }
    if (msg.includes('EncounterNotFound')) {
      return res.status(404).json({ success: false, message: 'Encounter not found' });
    }
    res.status(500).json({ success: false, message: msg || 'Failed to record Dosha evaluation' });
  }
});

// Ayurvedic Treatment Plan (Vaidya discipline only)
apiRouter.post('/clinical/encounters/:id/treatment-plans', requirePermission(CLINICAL_PERMISSIONS.AYURVEDIC_CLINICAL_MANAGE), async (req: AuthenticatedRequest, res: Response) => {
  const actor = {
    id: req.userId || 'vaidya',
    name: req.userName || 'Attending Vaidya',
    role: req.userRole!
  };

  try {
    const plan = await dbCreateAyurvedicTreatmentPlan(req.params.id, req.body, actor);
    res.status(201).json({ success: true, data: plan });
  } catch (err: any) {
    const msg = err.message || '';
    if (msg.includes('ClinicalDisciplineMismatch')) {
      return res.status(403).json({ success: false, code: 'CLINICAL_DISCIPLINE_MISMATCH', message: msg });
    }
    if (msg.includes('ValidationFailed')) {
      return res.status(400).json({ success: false, code: 'VALIDATION_FAILED', message: msg });
    }
    if (msg.includes('InvalidEncounterState')) {
      return res.status(400).json({ success: false, code: 'INVALID_ENCOUNTER_STATE', message: msg });
    }
    if (msg.includes('EncounterNotFound')) {
      return res.status(404).json({ success: false, message: 'Encounter not found' });
    }
    res.status(500).json({ success: false, message: msg || 'Failed to create treatment plan' });
  }
});

// Panchakarma Referral (Vaidya discipline only)
apiRouter.post('/clinical/encounters/:id/panchakarma-referrals', requirePermission(CLINICAL_PERMISSIONS.AYURVEDIC_CLINICAL_MANAGE), async (req: AuthenticatedRequest, res: Response) => {
  const actor = {
    id: req.userId || 'vaidya',
    name: req.userName || 'Attending Vaidya',
    role: req.userRole!
  };

  try {
    const referral = await dbCreatePanchakarmaReferral(req.params.id, req.body, actor);
    res.status(201).json({ success: true, data: referral });
  } catch (err: any) {
    const msg = err.message || '';
    if (msg.includes('ClinicalDisciplineMismatch')) {
      return res.status(403).json({ success: false, code: 'CLINICAL_DISCIPLINE_MISMATCH', message: msg });
    }
    if (msg.includes('ProcedureRequired') || msg.includes('IndicationRequired')) {
      return res.status(400).json({ success: false, code: 'VALIDATION_FAILED', message: msg });
    }
    if (msg.includes('InvalidEncounterState')) {
      return res.status(400).json({ success: false, code: 'INVALID_ENCOUNTER_STATE', message: msg });
    }
    if (msg.includes('EncounterNotFound')) {
      return res.status(404).json({ success: false, message: 'Encounter not found' });
    }
    res.status(500).json({ success: false, message: msg || 'Failed to create Panchakarma referral' });
  }
});

// Patient Clinical History View
apiRouter.get('/clinical/patients/:id/history', requirePermission(CLINICAL_PERMISSIONS.PATIENT_HISTORY_READ), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const history = await dbGetPatientClinicalHistory(req.params.id, req.userRole);
    res.json({ success: true, data: history });
  } catch (err: any) {
    const msg = err.message || '';
    if (msg.includes('PatientNotFound')) {
      return res.status(404).json({ success: false, message: 'Patient not found' });
    }
    res.status(500).json({ success: false, message: msg || 'Failed to fetch patient clinical history' });
  }
});
