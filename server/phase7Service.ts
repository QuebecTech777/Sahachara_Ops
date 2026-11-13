import {
  PrismaClient,
  Prisma,
  TherapyRoomType,
  RoomOperationalStatus,
  SessionExecutionStatus,
  PanchakarmaPhase,
  SessionBillingMode,
  PanchakarmaBillingMode,
  TherapyRoom,
  TherapySession,
  PanchakarmaPhaseTransition,
  StaffTherapyAuthorization,
  DepartmentDiscipline
} from '@prisma/client';
import { prisma, isPrismaConnected, dbLogAudit } from './prismaService.ts';
import { hospitalStore } from './dataStore.ts';
import {
  PreProcedureAssessment,
  PostProcedureAssessment,
  TherapyRoom as DomainTherapyRoom,
  TherapySession as DomainTherapySession,
  PanchakarmaPhaseTransition as DomainPanchakarmaPhaseTransition,
  StaffTherapyAuthorization as DomainStaffTherapyAuthorization,
  TreatmentPlan,
  PanchakarmaCourse,
  PanchakarmaReferral,
  StaffMember
} from '../src/types/hospital.ts';

// Custom Error Classes for Deterministic API Responses
export class SchedulingConflictError extends Error {
  code = 'SCHEDULING_CONFLICT';
  status = 409;
  conflictType: 'ROOM_UNAVAILABLE' | 'STAFF_UNAVAILABLE' | 'VAIDYA_UNAVAILABLE' | 'PATIENT_DOUBLE_BOOKED';
  constructor(conflictType: 'ROOM_UNAVAILABLE' | 'STAFF_UNAVAILABLE' | 'VAIDYA_UNAVAILABLE' | 'PATIENT_DOUBLE_BOOKED', message: string) {
    super(message);
    this.name = 'SchedulingConflictError';
    this.conflictType = conflictType;
  }
}

export class ClinicalDisciplineMismatchError extends Error {
  code = 'CLINICAL_DISCIPLINE_MISMATCH';
  status = 403;
  constructor(message: string = 'Only a licensed Vaidya is authorized to perform clinical evaluations or clearance.') {
    super(message);
    this.name = 'ClinicalDisciplineMismatchError';
  }
}

export class InvalidSessionStateError extends Error {
  code = 'INVALID_SESSION_STATE';
  status = 400;
  constructor(message: string) {
    super(message);
    this.name = 'InvalidSessionStateError';
  }
}

export class UnconfiguredTurnaroundBufferError extends Error {
  code = 'TURNAROUND_BUFFER_UNCONFIGURED';
  status = 400;
  constructor(message: string) {
    super(message);
    this.name = 'UnconfiguredTurnaroundBufferError';
  }
}

// ==============================================================================
// 1. STAFF QUALIFICATION & ELIGIBILITY SERVICES (Workstream B)
// ==============================================================================

/**
 * Dynamic query returning active StaffMembers qualified to physically administer therapies.
 * Eligibility: active/on_duty, not suspended, not archived, and assigned to an active AYURVEDA department.
 */
export async function dbGetEligibleAdministeringStaff(): Promise<StaffMember[]> {
  if (!isPrismaConnected) {
    return hospitalStore.staff.filter(
      (s) => (s.status === 'active' || s.status === 'on_duty') && !s.isSuspended
    );
  }

  const staff = await prisma.staffMember.findMany({
    where: {
      status: { in: ['active', 'on_duty'] },
      isSuspended: false,
      archivedAt: null,
      OR: [
        {
          primaryDepartment: {
            isActive: true,
            discipline: DepartmentDiscipline.AYURVEDA
          }
        },
        {
          departmentAssignments: {
            some: {
              status: 'active',
              department: {
                isActive: true,
                discipline: DepartmentDiscipline.AYURVEDA
              }
            }
          }
        }
      ]
    },
    orderBy: { name: 'asc' }
  });

  return staff as any;
}

/**
 * Returns active StaffMembers holding the canonical role 'VAIDYA' who can act as responsible Vaidyas.
 */
export async function dbGetResponsibleVaidyas(): Promise<StaffMember[]> {
  if (!isPrismaConnected) {
    return hospitalStore.staff.filter((s) => s.role === 'VAIDYA' && !s.isSuspended);
  }

  const vaidyas = await prisma.staffMember.findMany({
    where: {
      role: 'VAIDYA',
      status: { in: ['active', 'on_duty'] },
      isSuspended: false,
      archivedAt: null
    },
    orderBy: { name: 'asc' }
  });

  return vaidyas as any;
}

export async function dbCreateStaffTherapyAuthorization(
  staffId: string,
  data: { approvedQualification?: string; therapyType?: string; authorizedTherapyTypes?: string[]; expiresAt?: string },
  actor: { id: string; name: string; role: string }
): Promise<DomainStaffTherapyAuthorization> {
  if (!isPrismaConnected) {
    throw new Error('DatabaseUnavailable: Active PostgreSQL connection is required.');
  }

  const staff = await prisma.staffMember.findUnique({ where: { id: staffId } });
  if (!staff) throw new Error(`StaffNotFound: Staff member ${staffId} does not exist.`);

  const qualification = data.approvedQualification || (data.therapyType ? `Certified in ${data.therapyType}` : 'Certified Ayurvedic Therapy Practitioner');
  const therapyTypes = data.authorizedTherapyTypes || (data.therapyType ? [data.therapyType] : null);

  const auth = await prisma.staffTherapyAuthorization.create({
    data: {
      staffId,
      approvedQualification: qualification,
      authorizedTherapyTypes: therapyTypes ? therapyTypes : Prisma.JsonNull,
      verifiedById: actor.id,
      verifiedByName: actor.name,
      verifiedAt: new Date(),
      expiresAt: data.expiresAt ? new Date(data.expiresAt) : null
    }
  });

  await dbLogAudit(
    actor.name,
    actor.role,
    'STAFF_THERAPY_AUTHORIZATION_GRANTED',
    'Administration',
    `Granted therapy authorization to ${staff.name} (${qualification})`
  );

  return {
    ...auth,
    authorizedTherapyTypes: auth.authorizedTherapyTypes as any,
    verifiedAt: auth.verifiedAt.toISOString(),
    revokedAt: auth.revokedAt ? auth.revokedAt.toISOString() : undefined,
    expiresAt: auth.expiresAt ? auth.expiresAt.toISOString() : undefined,
    createdAt: auth.createdAt.toISOString(),
    updatedAt: auth.updatedAt.toISOString()
  };
}

export async function dbRevokeStaffTherapyAuthorization(
  authId: string,
  reason: string,
  actor: { id: string; name: string; role: string }
): Promise<DomainStaffTherapyAuthorization> {
  if (!isPrismaConnected) {
    throw new Error('DatabaseUnavailable: Active PostgreSQL connection is required.');
  }

  const updated = await prisma.staffTherapyAuthorization.update({
    where: { id: authId },
    data: {
      isRevoked: true,
      revokedAt: new Date(),
      revokedById: actor.id,
      revokedByName: actor.name,
      revocationReason: reason
    }
  });

  await dbLogAudit(
    actor.name,
    actor.role,
    'STAFF_THERAPY_AUTHORIZATION_REVOKED',
    'Administration',
    `Revoked therapy authorization ${authId}. Reason: ${reason}`
  );

  return {
    ...updated,
    authorizedTherapyTypes: updated.authorizedTherapyTypes as any,
    verifiedAt: updated.verifiedAt.toISOString(),
    revokedAt: updated.revokedAt ? updated.revokedAt.toISOString() : undefined,
    expiresAt: updated.expiresAt ? updated.expiresAt.toISOString() : undefined,
    createdAt: updated.createdAt.toISOString(),
    updatedAt: updated.updatedAt.toISOString()
  };
}

export async function dbGetStaffTherapyAuthorizations(staffId?: string): Promise<DomainStaffTherapyAuthorization[]> {
  if (!isPrismaConnected) return [];
  const list = await prisma.staffTherapyAuthorization.findMany({
    where: {
      ...(staffId && { staffId }),
      isRevoked: false
    },
    orderBy: { createdAt: 'desc' }
  });

  return list.map((a) => ({
    ...a,
    authorizedTherapyTypes: a.authorizedTherapyTypes as any,
    verifiedAt: a.verifiedAt.toISOString(),
    revokedAt: a.revokedAt ? a.revokedAt.toISOString() : undefined,
    expiresAt: a.expiresAt ? a.expiresAt.toISOString() : undefined,
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString()
  }));
}

// ==============================================================================
// 2. THERAPY ROOM OPERATIONS (Workstream C)
// ==============================================================================

export async function dbGetTherapyRooms(): Promise<DomainTherapyRoom[]> {
  if (!isPrismaConnected) {
    return hospitalStore.therapyRooms as any;
  }

  const rooms = await prisma.therapyRoom.findMany({
    where: { isActive: true },
    orderBy: { code: 'asc' }
  });

  return rooms.map((r) => ({
    ...r,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString()
  }));
}

export async function dbGetTherapyRoomById(id: string): Promise<DomainTherapyRoom | null> {
  if (!isPrismaConnected) {
    return (hospitalStore.therapyRooms.find((r) => r.id === id) as any) || null;
  }

  const room = await prisma.therapyRoom.findUnique({ where: { id } });
  if (!room) return null;
  return {
    ...room,
    createdAt: room.createdAt.toISOString(),
    updatedAt: room.updatedAt.toISOString()
  };
}

export const VALID_THERAPY_ROOM_TYPES: TherapyRoomType[] = [
  'MASSAGE_DRONI_ROOM',
  'SHIRODHARA_ROOM',
  'SWEDANA_STEAM_ROOM',
  'PANCHAKARMA_PROCEDURE_ROOM'
];

export async function dbCreateTherapyRoom(
  data: { code: string; name: string; roomType: TherapyRoomType; departmentId?: string; bufferMinutes?: number },
  actor: { id: string; name: string; role: string }
): Promise<DomainTherapyRoom> {
  if (!isPrismaConnected) {
    throw new Error('DatabaseUnavailable: Active PostgreSQL connection is required.');
  }

  if (!data.roomType || !VALID_THERAPY_ROOM_TYPES.includes(data.roomType)) {
    throw new Error(`InvalidRoomType: "${data.roomType}" is not an approved therapy room type. Approved types are: ${VALID_THERAPY_ROOM_TYPES.join(', ')}.`);
  }

  const existing = await prisma.therapyRoom.findUnique({ where: { code: data.code } });
  if (existing) {
    throw new Error(`RoomCodeExists: A therapy room with code "${data.code}" already exists.`);
  }

  const room = await prisma.therapyRoom.create({
    data: {
      code: data.code.trim().toUpperCase(),
      name: data.name.trim(),
      roomType: data.roomType,
      departmentId: data.departmentId || null,
      bufferMinutes: (data.bufferMinutes !== undefined && data.bufferMinutes !== null) ? Number(data.bufferMinutes) : null,
      status: RoomOperationalStatus.AVAILABLE,
      isActive: true
    }
  });

  await dbLogAudit(
    actor.name,
    actor.role,
    'THERAPY_ROOM_CREATED',
    'Operations',
    `Created therapy room ${room.code} (${room.name}) of type ${room.roomType}`
  );

  return {
    ...room,
    createdAt: room.createdAt.toISOString(),
    updatedAt: room.updatedAt.toISOString()
  };
}

export async function dbUpdateTherapyRoom(
  id: string,
  data: Partial<{ name: string; roomType: TherapyRoomType; bufferMinutes: number; isActive: boolean }>,
  actor: { id: string; name: string; role: string }
): Promise<DomainTherapyRoom> {
  if (!isPrismaConnected) {
    throw new Error('DatabaseUnavailable: Active PostgreSQL connection is required.');
  }

  if (data.roomType && !VALID_THERAPY_ROOM_TYPES.includes(data.roomType)) {
    throw new Error(`InvalidRoomType: "${data.roomType}" is not an approved therapy room type. Approved types are: ${VALID_THERAPY_ROOM_TYPES.join(', ')}.`);
  }

  const updated = await prisma.therapyRoom.update({
    where: { id },
    data: {
      ...(data.name && { name: data.name.trim() }),
      ...(data.roomType && { roomType: data.roomType }),
      ...(data.bufferMinutes !== undefined && { bufferMinutes: data.bufferMinutes === null ? null : Number(data.bufferMinutes) }),
      ...(data.isActive !== undefined && { isActive: Boolean(data.isActive) })
    }
  });

  await dbLogAudit(
    actor.name,
    actor.role,
    'THERAPY_ROOM_UPDATED',
    'Operations',
    `Updated configuration for therapy room ${updated.code}`
  );

  return {
    ...updated,
    createdAt: updated.createdAt.toISOString(),
    updatedAt: updated.updatedAt.toISOString()
  };
}

export async function dbEnterRoomMaintenance(
  id: string,
  reason: string,
  actor: { id: string; name: string; role: string }
): Promise<DomainTherapyRoom> {
  if (!isPrismaConnected) {
    throw new Error('DatabaseUnavailable: Active PostgreSQL connection is required.');
  }

  const room = await prisma.therapyRoom.findUnique({ where: { id } });
  if (!room) throw new Error('RoomNotFound');

  const updated = await prisma.therapyRoom.update({
    where: { id },
    data: { status: RoomOperationalStatus.MAINTENANCE }
  });

  await dbLogAudit(
    actor.name,
    actor.role,
    'THERAPY_ROOM_MAINTENANCE_ENTERED',
    'Operations',
    `Room ${room.code} entered maintenance. Reason: ${reason}`
  );

  return { ...updated, createdAt: updated.createdAt.toISOString(), updatedAt: updated.updatedAt.toISOString() };
}

export async function dbExitRoomMaintenance(
  id: string,
  actor: { id: string; name: string; role: string }
): Promise<DomainTherapyRoom> {
  if (!isPrismaConnected) {
    throw new Error('DatabaseUnavailable: Active PostgreSQL connection is required.');
  }

  const room = await prisma.therapyRoom.findUnique({ where: { id } });
  if (!room) throw new Error('RoomNotFound');

  // Rooms exiting maintenance transition to SANITIZING so they must be cleaned before reuse
  const updated = await prisma.therapyRoom.update({
    where: { id },
    data: { status: RoomOperationalStatus.SANITIZING }
  });

  await dbLogAudit(
    actor.name,
    actor.role,
    'THERAPY_ROOM_MAINTENANCE_EXITED',
    'Operations',
    `Room ${room.code} exited maintenance and transitioned to SANITIZING.`
  );

  return { ...updated, createdAt: updated.createdAt.toISOString(), updatedAt: updated.updatedAt.toISOString() };
}

export async function dbRecordRoomSanitization(
  id: string,
  actor: { id: string; name: string; role: string }
): Promise<DomainTherapyRoom> {
  if (!isPrismaConnected) {
    throw new Error('DatabaseUnavailable: Active PostgreSQL connection is required.');
  }

  const room = await prisma.therapyRoom.findUnique({ where: { id } });
  if (!room) throw new Error('RoomNotFound');

  const updated = await prisma.therapyRoom.update({
    where: { id },
    data: { status: RoomOperationalStatus.AVAILABLE }
  });

  await dbLogAudit(
    actor.name,
    actor.role,
    'THERAPY_ROOM_SANITIZATION_COMPLETED',
    'Operations',
    `Sanitization completed for ${room.code} by ${actor.name}. Room is now AVAILABLE.`
  );

  return { ...updated, createdAt: updated.createdAt.toISOString(), updatedAt: updated.updatedAt.toISOString() };
}

export async function dbCheckStaleRooms(): Promise<Array<{ room: DomainTherapyRoom; reason: string }>> {
  if (!isPrismaConnected) return [];
  const rooms = await prisma.therapyRoom.findMany({
    where: {
      status: { in: [RoomOperationalStatus.OCCUPIED, RoomOperationalStatus.SANITIZING] },
      isActive: true
    }
  });

  const staleRooms: Array<{ room: DomainTherapyRoom; reason: string }> = [];
  const now = new Date();

  for (const r of rooms) {
    if (r.status === RoomOperationalStatus.OCCUPIED) {
      const activeSession = await prisma.therapySession.findFirst({
        where: { roomId: r.id, status: SessionExecutionStatus.IN_PROGRESS }
      });
      if (!activeSession) {
        staleRooms.push({
          room: { ...r, createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString() },
          reason: 'Room is flagged OCCUPIED but has no active session IN_PROGRESS.'
        });
      }
    } else if (r.status === RoomOperationalStatus.SANITIZING) {
      const lastSession = await prisma.therapySession.findFirst({
        where: { roomId: r.id },
        orderBy: { updatedAt: 'desc' }
      });
      if (lastSession && (now.getTime() - lastSession.updatedAt.getTime()) > 3600000) {
        staleRooms.push({
          room: { ...r, createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString() },
          reason: 'Room has been in SANITIZING state for over 60 minutes without sanitization completion.'
        });
      }
    }
  }

  return staleRooms;
}

export async function dbReconcileStaleRoom(
  id: string,
  reason: string,
  actor: { id: string; name: string; role: string }
): Promise<DomainTherapyRoom> {
  if (!isPrismaConnected) {
    throw new Error('DatabaseUnavailable: Active PostgreSQL connection is required.');
  }

  const room = await prisma.therapyRoom.findUnique({ where: { id } });
  if (!room) throw new Error('RoomNotFound');

  const updated = await prisma.therapyRoom.update({
    where: { id },
    data: { status: RoomOperationalStatus.AVAILABLE }
  });

  await dbLogAudit(
    actor.name,
    actor.role,
    'THERAPY_ROOM_STALE_RECONCILED',
    'Administration',
    `Administratively reconciled room ${room.code} from ${room.status} to AVAILABLE. Audit Reason: ${reason}`
  );

  return { ...updated, createdAt: updated.createdAt.toISOString(), updatedAt: updated.updatedAt.toISOString() };
}

// ==============================================================================
// 3. RACE-SAFE SCHEDULING ENGINE (Workstream D)
// ==============================================================================

/**
 * Books a therapy session with deterministic resource locking and symmetric turnaround buffers.
 * Lock Order: Patient ID -> Administering Staff ID -> Responsible Vaidya ID -> Therapy Room ID
 */
export async function dbScheduleTherapySession(
  data: {
    patientId: string;
    treatmentPlanId?: string;
    panchakarmaCourseId?: string;
    roomId: string;
    administeringStaffId: string;
    responsibleVaidyaId: string;
    scheduledStartAt: string;
    scheduledEndAt: string;
    tariffId?: string;
    clinicalNotes?: string;
  },
  actor: { id: string; name: string; role: string }
): Promise<DomainTherapySession> {
  if (!isPrismaConnected) {
    throw new Error('DatabaseUnavailable: Active PostgreSQL connection is required for scheduling.');
  }

  const rawStart = (data as any).scheduledStartAt || (data as any).scheduledStartTime;
  const rawEnd = (data as any).scheduledEndAt || (data as any).scheduledEndTime;

  const startUtc = new Date(rawStart);
  const endUtc = new Date(rawEnd);

  if (isNaN(startUtc.getTime()) || isNaN(endUtc.getTime()) || startUtc >= endUtc) {
    throw new Error('InvalidScheduleInterval: scheduledStartAt must be earlier than scheduledEndAt.');
  }

  // Execute inside an isolated transaction
  const session = await prisma.$transaction(async (tx) => {
    // 1. Lock Patient Row
    const patientRow = await tx.$queryRaw<Array<{ id: string; mrn: string; firstName: string; lastName: string }>>`
      SELECT id, mrn, "firstName", "lastName" FROM patients WHERE id = ${data.patientId} FOR UPDATE
    `;
    if (!patientRow || patientRow.length === 0) throw new Error('PatientNotFound: Patient record does not exist.');

    // 2. Deterministically Lock Staff Rows in Ascending ID Order
    const staffIdsToLock = [data.administeringStaffId, data.responsibleVaidyaId]
      .filter((v, i, a) => a.indexOf(v) === i)
      .sort();
    
    for (const sid of staffIdsToLock) {
      await tx.$queryRaw`SELECT id FROM staff_members WHERE id = ${sid} FOR UPDATE`;
    }

    const adminStaff = await tx.staffMember.findUnique({ where: { id: data.administeringStaffId } });
    if (!adminStaff) throw new Error('AdministeringStaffNotFound');
    if (adminStaff.isSuspended || !['active', 'on_duty'].includes(adminStaff.status?.toLowerCase())) {
      throw new Error('AdministeringStaffIneligible: Staff member is inactive or suspended.');
    }

    // 2b. Verify Staff Therapy Qualification Authorization
    const activeAuth = await tx.staffTherapyAuthorization.findFirst({
      where: {
        staffId: data.administeringStaffId,
        isRevoked: false,
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: new Date() } }
        ]
      }
    });
    if (!activeAuth) {
      throw new Error(`AdministeringStaffUnqualified: Staff member ${adminStaff.name} lacks an active verified StaffTherapyAuthorization for therapy administration.`);
    }

    const vaidyaStaff = await tx.staffMember.findUnique({ where: { id: data.responsibleVaidyaId } });
    if (!vaidyaStaff) throw new Error('ResponsibleVaidyaNotFound');
    if (vaidyaStaff.role !== 'VAIDYA') {
      throw new ClinicalDisciplineMismatchError('Responsible practitioner must hold the canonical role VAIDYA.');
    }
    if (vaidyaStaff.isSuspended || !['active', 'on_duty'].includes(vaidyaStaff.status?.toLowerCase())) {
      throw new Error('ResponsibleVaidyaIneligible: Vaidya is inactive or suspended.');
    }

    // 4. Lock Therapy Room Row
    const roomRow = await tx.$queryRaw<Array<{ id: string; code: string; name: string; status: string; bufferMinutes: number | null }>>`
      SELECT id, code, name, status, "bufferMinutes" FROM therapy_rooms WHERE id = ${data.roomId} FOR UPDATE
    `;
    if (!roomRow || roomRow.length === 0) throw new Error('RoomNotFound: Therapy room does not exist.');
    if (roomRow[0].status === RoomOperationalStatus.MAINTENANCE) {
      throw new SchedulingConflictError('ROOM_UNAVAILABLE', `Room ${roomRow[0].code} is currently under maintenance.`);
    }

    // Fail-Closed Turnaround Buffer Enforcement:
    // If room turnaround buffer is unconfigured (null, undefined, or <= 0), scheduling is strictly prevented.
    if (roomRow[0].bufferMinutes === null || roomRow[0].bufferMinutes === undefined || Number(roomRow[0].bufferMinutes) <= 0) {
      throw new UnconfiguredTurnaroundBufferError(
        `UnconfiguredTurnaroundBuffer: Therapy room ${roomRow[0].code} does not have an authorized turnaround buffer configured. Booking is strictly prevented until clinic administration configures an authorized turnaround buffer duration.`
      );
    }

    const roomBuffer = Number(roomRow[0].bufferMinutes);

    // 5. Symmetric Room Collision Validation
    // Collision condition: S_new < (E_ext + B_ext) AND (E_new + B_new) > S_ext
    const roomConflict = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT ts.id 
      FROM therapy_sessions ts
      LEFT JOIN therapy_rooms tr ON ts."roomId" = tr.id
      WHERE ts."roomId" = ${data.roomId}
        AND ts.status IN ('SCHEDULED', 'IN_PROGRESS')
        AND (${startUtc}::timestamptz AT TIME ZONE 'UTC') < (ts."scheduledEndAt" + (COALESCE(tr."bufferMinutes", ${roomBuffer}) || ' minutes')::interval)
        AND (${endUtc}::timestamptz AT TIME ZONE 'UTC' + (${roomBuffer} || ' minutes')::interval) > ts."scheduledStartAt"
      LIMIT 1
    `;
    if (roomConflict.length > 0) {
      throw new SchedulingConflictError('ROOM_UNAVAILABLE', `Room ${roomRow[0].code} is occupied or within turnaround sanitization.`);
    }

    // 6. Administering Staff Collision Check (Interval overlap)
    const staffConflict = await tx.therapySession.findFirst({
      where: {
        administeringStaffId: data.administeringStaffId,
        status: { in: [SessionExecutionStatus.SCHEDULED, SessionExecutionStatus.IN_PROGRESS] },
        scheduledStartAt: { lt: endUtc },
        scheduledEndAt: { gt: startUtc }
      }
    });
    if (staffConflict) {
      throw new SchedulingConflictError('STAFF_UNAVAILABLE', `Administering staff ${adminStaff.name} has an overlapping session.`);
    }

    // 7. Responsible Vaidya Collision Check
    const vaidyaConflict = await tx.therapySession.findFirst({
      where: {
        responsibleVaidyaId: data.responsibleVaidyaId,
        status: { in: [SessionExecutionStatus.SCHEDULED, SessionExecutionStatus.IN_PROGRESS] },
        scheduledStartAt: { lt: endUtc },
        scheduledEndAt: { gt: startUtc }
      }
    });
    if (vaidyaConflict) {
      throw new SchedulingConflictError('VAIDYA_UNAVAILABLE', `Responsible Vaidya ${vaidyaStaff.name} has an overlapping clinical session.`);
    }

    // 8. Patient Collision Check
    const patientConflict = await tx.therapySession.findFirst({
      where: {
        patientId: data.patientId,
        status: { in: [SessionExecutionStatus.SCHEDULED, SessionExecutionStatus.IN_PROGRESS] },
        scheduledStartAt: { lt: endUtc },
        scheduledEndAt: { gt: startUtc }
      }
    });
    if (patientConflict) {
      throw new SchedulingConflictError('PATIENT_DOUBLE_BOOKED', 'Patient already has a therapy session scheduled in this time interval.');
    }

    // 9. Derive Session Number
    let sessionNumber = 1;
    if (data.treatmentPlanId) {
      const count = await tx.therapySession.count({ where: { treatmentPlanId: data.treatmentPlanId } });
      sessionNumber = count + 1;
    } else if (data.panchakarmaCourseId) {
      const count = await tx.therapySession.count({ where: { panchakarmaCourseId: data.panchakarmaCourseId } });
      sessionNumber = count + 1;
    }

    const sessionRef = `SES-${new Date().getFullYear()}-${String(Math.floor(10000 + Math.random() * 90000))}`;

    // 10. Check if course is package-billed
    let billingMode: SessionBillingMode = SessionBillingMode.UNBILLED;
    if ((data as any).billingMode === 'PACKAGE_COVERED' || (data as any).billingMode === SessionBillingMode.PACKAGE_COVERED) {
      billingMode = SessionBillingMode.PACKAGE_COVERED;
    } else if (data.panchakarmaCourseId) {
      const course = await tx.panchakarmaCourse.findUnique({ where: { id: data.panchakarmaCourseId } });
      if (course && (course.isPackageBilled || course.billingMode === 'PACKAGE_BILLED' || (course.billingMode as any) === 'PACKAGE')) {
        billingMode = SessionBillingMode.PACKAGE_COVERED;
      }
    }

    // 11. Create Session Record
    const created = await tx.therapySession.create({
      data: {
        sessionNumber,
        sessionRef,
        patientId: data.patientId,
        treatmentPlanId: data.treatmentPlanId || null,
        panchakarmaCourseId: data.panchakarmaCourseId || null,
        roomId: data.roomId,
        roomCodeSnapshot: roomRow[0].code,
        roomNameSnapshot: roomRow[0].name,
        administeringStaffId: data.administeringStaffId,
        responsibleVaidyaId: data.responsibleVaidyaId,
        scheduledStartAt: startUtc,
        scheduledEndAt: endUtc,
        status: SessionExecutionStatus.SCHEDULED,
        tariffId: data.tariffId || null,
        billingMode,
        isBilled: false,
        clinicalNotes: data.clinicalNotes || null
      },
      include: {
        patient: true,
        room: true,
        administeringStaff: true,
        responsibleVaidya: true
      }
    });

    return created;
  }, {
    isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
    timeout: 10000
  });

  await dbLogAudit(
    actor.name,
    actor.role,
    'THERAPY_SESSION_SCHEDULED',
    'Ayurveda',
    `Scheduled therapy session ${session.sessionRef} (#${session.sessionNumber}) for patient ${session.patient.mrn} in room ${session.roomCodeSnapshot}`,
    session.patient.mrn
  );

  return serializeTherapySession(session);
}

export async function dbRescheduleTherapySession(
  sessionId: string,
  data: {
    scheduledStartAt: string;
    scheduledEndAt: string;
    roomId?: string;
    administeringStaffId?: string;
    responsibleVaidyaId?: string;
    rescheduleReason: string;
  },
  actor: { id: string; name: string; role: string }
): Promise<DomainTherapySession> {
  if (!isPrismaConnected) {
    throw new Error('DatabaseUnavailable: Active PostgreSQL connection is required.');
  }

  const rawStart = (data as any).scheduledStartAt || (data as any).scheduledStartTime;
  const rawEnd = (data as any).scheduledEndAt || (data as any).scheduledEndTime;

  const startUtc = new Date(rawStart);
  const endUtc = new Date(rawEnd);
  if (isNaN(startUtc.getTime()) || isNaN(endUtc.getTime()) || startUtc >= endUtc) {
    throw new Error('InvalidScheduleInterval: scheduledStartAt must be earlier than scheduledEndAt.');
  }

  const updatedSession = await prisma.$transaction(async (tx) => {
    // 1. Fetch current session
    const current = await tx.therapySession.findUnique({
      where: { id: sessionId },
      include: { room: true }
    });
    if (!current) throw new Error('SessionNotFound');
    if (current.status !== SessionExecutionStatus.SCHEDULED) {
      throw new InvalidSessionStateError(`Cannot reschedule a session in state "${current.status}". Only SCHEDULED sessions can be rescheduled.`);
    }

    const patientId = current.patientId;
    const roomId = data.roomId || current.roomId!;
    const staffId = data.administeringStaffId || current.administeringStaffId;
    const vaidyaId = data.responsibleVaidyaId || current.responsibleVaidyaId;

    // 2. Deterministic Row Locks (Patient -> Sorted Staff -> Room)
    await tx.$queryRaw`SELECT id FROM patients WHERE id = ${patientId} FOR UPDATE`;
    const sortedStaffIds = [staffId, vaidyaId].filter((v, i, a) => a.indexOf(v) === i).sort();
    for (const sid of sortedStaffIds) {
      await tx.$queryRaw`SELECT id FROM staff_members WHERE id = ${sid} FOR UPDATE`;
    }

    const activeAuth = await tx.staffTherapyAuthorization.findFirst({
      where: {
        staffId,
        isRevoked: false,
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: new Date() } }
        ]
      }
    });
    if (!activeAuth) {
      throw new Error(`AdministeringStaffUnqualified: Staff member ${staffId} lacks an active verified StaffTherapyAuthorization.`);
    }

    const roomRow = await tx.$queryRaw<Array<{ id: string; code: string; name: string; bufferMinutes: number | null }>>`
      SELECT id, code, name, "bufferMinutes" FROM therapy_rooms WHERE id = ${roomId} FOR UPDATE
    `;
    if (!roomRow || roomRow.length === 0) throw new Error('RoomNotFound');

    // Fail-Closed Turnaround Buffer Enforcement:
    if (roomRow[0].bufferMinutes === null || roomRow[0].bufferMinutes === undefined || Number(roomRow[0].bufferMinutes) <= 0) {
      throw new UnconfiguredTurnaroundBufferError(
        `UnconfiguredTurnaroundBuffer: Therapy room ${roomRow[0].code} does not have an authorized turnaround buffer configured. Rescheduling is strictly prevented until clinic administration configures an authorized turnaround buffer duration.`
      );
    }

    const roomBuffer = Number(roomRow[0].bufferMinutes);

    // 3. Collision Checks (Excluding the current session being rescheduled)
    const roomConflict = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT ts.id 
      FROM therapy_sessions ts
      LEFT JOIN therapy_rooms tr ON ts."roomId" = tr.id
      WHERE ts."roomId" = ${roomId}
        AND ts.id != ${sessionId}
        AND ts.status IN ('SCHEDULED', 'IN_PROGRESS')
        AND (${startUtc}::timestamptz AT TIME ZONE 'UTC') < (ts."scheduledEndAt" + (COALESCE(tr."bufferMinutes", ${roomBuffer}) || ' minutes')::interval)
        AND (${endUtc}::timestamptz AT TIME ZONE 'UTC' + (${roomBuffer} || ' minutes')::interval) > ts."scheduledStartAt"
      LIMIT 1
    `;
    if (roomConflict.length > 0) {
      throw new SchedulingConflictError('ROOM_UNAVAILABLE', `Room ${roomRow[0].code} is occupied during the rescheduled time window.`);
    }

    const staffConflict = await tx.therapySession.findFirst({
      where: {
        id: { not: sessionId },
        administeringStaffId: staffId,
        status: { in: [SessionExecutionStatus.SCHEDULED, SessionExecutionStatus.IN_PROGRESS] },
        scheduledStartAt: { lt: endUtc },
        scheduledEndAt: { gt: startUtc }
      }
    });
    if (staffConflict) {
      throw new SchedulingConflictError('STAFF_UNAVAILABLE', 'Administering staff has an overlapping session.');
    }

    const vaidyaConflict = await tx.therapySession.findFirst({
      where: {
        id: { not: sessionId },
        responsibleVaidyaId: vaidyaId,
        status: { in: [SessionExecutionStatus.SCHEDULED, SessionExecutionStatus.IN_PROGRESS] },
        scheduledStartAt: { lt: endUtc },
        scheduledEndAt: { gt: startUtc }
      }
    });
    if (vaidyaConflict) {
      throw new SchedulingConflictError('VAIDYA_UNAVAILABLE', 'Responsible Vaidya has an overlapping session.');
    }

    const patientConflict = await tx.therapySession.findFirst({
      where: {
        id: { not: sessionId },
        patientId,
        status: { in: [SessionExecutionStatus.SCHEDULED, SessionExecutionStatus.IN_PROGRESS] },
        scheduledStartAt: { lt: endUtc },
        scheduledEndAt: { gt: startUtc }
      }
    });
    if (patientConflict) {
      throw new SchedulingConflictError('PATIENT_DOUBLE_BOOKED', 'Patient has an overlapping session during rescheduled time.');
    }

    // 4. Update Session Record
    return await tx.therapySession.update({
      where: { id: sessionId },
      data: {
        scheduledStartAt: startUtc,
        scheduledEndAt: endUtc,
        roomId,
        roomCodeSnapshot: roomRow[0].code,
        roomNameSnapshot: roomRow[0].name,
        administeringStaffId: staffId,
        responsibleVaidyaId: vaidyaId,
        clinicalNotes: current.clinicalNotes
          ? `${current.clinicalNotes} | Rescheduled: ${data.rescheduleReason}`
          : `Rescheduled: ${data.rescheduleReason}`
      },
      include: {
        patient: true,
        room: true,
        administeringStaff: true,
        responsibleVaidya: true
      }
    });
  });

  await dbLogAudit(
    actor.name,
    actor.role,
    'THERAPY_SESSION_RESCHEDULED',
    'Ayurveda',
    `Rescheduled session ${updatedSession.sessionRef} to ${data.scheduledStartAt}. Reason: ${data.rescheduleReason}`,
    updatedSession.patient.mrn
  );

  return serializeTherapySession(updatedSession);
}

export async function dbCancelTherapySession(
  sessionId: string,
  reason: string,
  actor: { id: string; name: string; role: string }
): Promise<DomainTherapySession> {
  if (!isPrismaConnected) {
    throw new Error('DatabaseUnavailable: Active PostgreSQL connection is required.');
  }

  const session = await prisma.therapySession.findUnique({ where: { id: sessionId }, include: { patient: true } });
  if (!session) throw new Error('SessionNotFound');
  if (session.status !== SessionExecutionStatus.SCHEDULED) {
    throw new InvalidSessionStateError(`Cannot cancel a session in state "${session.status}".`);
  }

  const updated = await prisma.therapySession.update({
    where: { id: sessionId },
    data: {
      status: SessionExecutionStatus.CANCELLED,
      cancellationReason: reason
    },
    include: { patient: true, room: true, administeringStaff: true, responsibleVaidya: true }
  });

  await dbLogAudit(
    actor.name,
    actor.role,
    'THERAPY_SESSION_CANCELLED',
    'Ayurveda',
    `Cancelled therapy session ${session.sessionRef}. Reason: ${reason}`,
    session.patient.mrn
  );

  return serializeTherapySession(updated);
}

export async function dbNoShowTherapySession(
  sessionId: string,
  reason: string,
  actor: { id: string; name: string; role: string }
): Promise<DomainTherapySession> {
  if (!isPrismaConnected) {
    throw new Error('DatabaseUnavailable: Active PostgreSQL connection is required.');
  }

  const session = await prisma.therapySession.findUnique({ where: { id: sessionId }, include: { patient: true } });
  if (!session) throw new Error('SessionNotFound');
  if (session.status !== SessionExecutionStatus.SCHEDULED) {
    throw new InvalidSessionStateError(`Cannot record no-show for a session in state "${session.status}".`);
  }

  const updated = await prisma.therapySession.update({
    where: { id: sessionId },
    data: {
      status: SessionExecutionStatus.NO_SHOW,
      cancellationReason: reason || 'Patient failed to appear for scheduled slot.'
    },
    include: { patient: true, room: true, administeringStaff: true, responsibleVaidya: true }
  });

  await dbLogAudit(
    actor.name,
    actor.role,
    'THERAPY_SESSION_NO_SHOW',
    'Ayurveda',
    `Marked therapy session ${session.sessionRef} as NO_SHOW.`,
    session.patient.mrn
  );

  return serializeTherapySession(updated);
}

// ==============================================================================
// 4. THERAPY SESSION EXECUTION LIFECYCLE (Workstream G)
// ==============================================================================

/**
 * Commences session execution. Authorized strictly by licensed VAIDYA.
 * Validates pre-procedure assessment with server-authoritative attribution.
 */
export async function dbStartTherapySession(
  sessionId: string,
  data: {
    actualStartAt?: string;
    preProcedureAssessment: {
      pulseRate?: string;
      bloodPressure?: string;
      temperature?: string;
      agniStatus?: string;
      koshthaStatus?: string;
      generalObservations?: string;
      clinicalClearance: boolean;
      clearanceNotes?: string;
    };
  },
  actor: { id: string; name: string; role: string }
): Promise<DomainTherapySession> {
  if (!isPrismaConnected) {
    throw new Error('DatabaseUnavailable: Active PostgreSQL connection is required.');
  }

  if (actor.role !== 'VAIDYA') {
    throw new ClinicalDisciplineMismatchError('Only a licensed Vaidya can authorize clinical clearance and commence therapy execution.');
  }

  const rawPre = (data as any).preProcedureAssessment || (data as any).preAssessment || {};
  const clearanceConfirmed = rawPre.clinicalClearance === true || rawPre.vaidyaClearanceConfirmed === true;

  if (!clearanceConfirmed) {
    throw new Error('ClinicalClearanceRequired: Attending Vaidya must explicitly grant clinicalClearance to begin treatment.');
  }

  const now = new Date();
  const startAt = data.actualStartAt ? new Date(data.actualStartAt) : now;

  const bp = rawPre.bloodPressure || (rawPre.bpSystolic ? `${rawPre.bpSystolic}/${rawPre.bpDiastolic}` : undefined);
  const pulse = rawPre.pulseRate || (rawPre.heartRate ? String(rawPre.heartRate) : undefined);

  const preAssessment: PreProcedureAssessment = {
    recordedById: actor.id,
    recordedByName: actor.name,
    recordedAt: now.toISOString(),
    pulseRate: pulse,
    bloodPressure: bp,
    temperature: rawPre.temperature,
    agniStatus: rawPre.agniStatus,
    koshthaStatus: rawPre.koshthaStatus,
    generalObservations: rawPre.generalObservations || rawPre.clinicalNotes,
    clinicalClearance: true,
    clearanceNotes: rawPre.clearanceNotes || rawPre.clinicalNotes
  };

  const updated = await prisma.$transaction(async (tx) => {
    const session = await tx.therapySession.findUnique({
      where: { id: sessionId },
      include: { room: true }
    });
    if (!session) throw new Error('SessionNotFound');
    if (session.status !== SessionExecutionStatus.SCHEDULED) {
      throw new InvalidSessionStateError(`Cannot start session in state "${session.status}".`);
    }

    // Transition session to IN_PROGRESS
    const s = await tx.therapySession.update({
      where: { id: sessionId },
      data: {
        status: SessionExecutionStatus.IN_PROGRESS,
        actualStartAt: startAt,
        preProcedureAssessment: preAssessment as any
      },
      include: { patient: true, room: true, administeringStaff: true, responsibleVaidya: true }
    });

    // Transition room to OCCUPIED
    if (session.roomId) {
      await tx.therapyRoom.update({
        where: { id: session.roomId },
        data: { status: RoomOperationalStatus.OCCUPIED }
      });
    }

    return s;
  });

  await dbLogAudit(
    actor.name,
    actor.role,
    'THERAPY_SESSION_STARTED',
    'Ayurveda',
    `Commenced therapy session ${updated.sessionRef} for patient ${updated.patient.mrn}. Clinical clearance granted by Vaidya ${actor.name}.`,
    updated.patient.mrn
  );

  return serializeTherapySession(updated);
}

/**
 * Concludes session execution. Authorized strictly by licensed VAIDYA.
 * Records post-procedure observations and transitions room to SANITIZING.
 */
export async function dbCompleteTherapySession(
  sessionId: string,
  data: {
    completedAt?: string;
    postProcedureAssessment: {
      pulseRate?: string;
      bloodPressure?: string;
      patientTolerance: string;
      sweatingResponse?: string;
      procedureNotes: string;
      clinicalObservations?: string;
      adverseSymptomsReported?: boolean;
      adverseEventDetails?: string;
    };
  },
  actor: { id: string; name: string; role: string }
): Promise<DomainTherapySession> {
  if (!isPrismaConnected) {
    throw new Error('DatabaseUnavailable: Active PostgreSQL connection is required.');
  }

  if (actor.role !== 'VAIDYA') {
    throw new ClinicalDisciplineMismatchError('Only a licensed Vaidya can record post-procedure clinical assessments.');
  }

  const now = new Date();
  const completeAt = data.completedAt ? new Date(data.completedAt) : now;

  const rawPost = (data as any).postProcedureAssessment || (data as any).postAssessment || {};
  const bp = rawPost.bloodPressure || (rawPost.bpSystolic ? `${rawPost.bpSystolic}/${rawPost.bpDiastolic}` : undefined);
  const pulse = rawPost.pulseRate || (rawPost.heartRate ? String(rawPost.heartRate) : undefined);

  const postAssessment: PostProcedureAssessment = {
    recordedById: actor.id,
    recordedByName: actor.name,
    recordedAt: now.toISOString(),
    pulseRate: pulse,
    bloodPressure: bp,
    patientTolerance: rawPost.patientTolerance || 'WELL_TOLERATED',
    sweatingResponse: rawPost.sweatingResponse,
    procedureNotes: rawPost.procedureNotes || rawPost.clinicalObservations || 'Procedure concluded.',
    clinicalObservations: rawPost.clinicalObservations,
    adverseSymptomsReported: Boolean(rawPost.adverseSymptomsReported),
    adverseEventDetails: rawPost.adverseEventDetails
  };

  const updated = await prisma.$transaction(async (tx) => {
    const session = await tx.therapySession.findUnique({
      where: { id: sessionId },
      include: { tariff: true, treatmentPlan: true, panchakarmaCourse: true }
    });
    if (!session) throw new Error('SessionNotFound');
    if (session.status !== SessionExecutionStatus.IN_PROGRESS) {
      throw new InvalidSessionStateError(`Cannot complete session in state "${session.status}". Must be IN_PROGRESS.`);
    }

    // Snapshot tariff amount if configured
    let billableAmount: Prisma.Decimal | null = null;
    if (session.tariff && session.tariff.rate !== null && session.billingMode !== SessionBillingMode.PACKAGE_COVERED) {
      billableAmount = session.tariff.rate;
    }

    // 1. Update Session to COMPLETED
    const s = await tx.therapySession.update({
      where: { id: sessionId },
      data: {
        status: SessionExecutionStatus.COMPLETED,
        completedAt: completeAt,
        postProcedureAssessment: postAssessment as any,
        clinicalNotes: data.postProcedureAssessment?.procedureNotes || session.clinicalNotes,
        ...(billableAmount && { billableAmount })
      },
      include: { patient: true, room: true, administeringStaff: true, responsibleVaidya: true }
    });

    // 2. Transition Room to SANITIZING
    if (session.roomId) {
      await tx.therapyRoom.update({
        where: { id: session.roomId },
        data: { status: RoomOperationalStatus.SANITIZING }
      });
    }

    // 3. Increment TreatmentPlan Completed Sessions if linked
    if (session.treatmentPlanId) {
      const plan = await tx.treatmentPlan.findUnique({ where: { id: session.treatmentPlanId } });
      if (plan) {
        const nextCompleted = plan.completedSessions + 1;
        const isPlanComplete = nextCompleted >= plan.totalSessions;
        await tx.treatmentPlan.update({
          where: { id: plan.id },
          data: {
            completedSessions: nextCompleted,
            ...(isPlanComplete && { status: 'completed' })
          }
        });
      }
    }

    // 4. Increment PanchakarmaCourse Completed Days if linked
    if (session.panchakarmaCourseId) {
      const course = await tx.panchakarmaCourse.findUnique({ where: { id: session.panchakarmaCourseId } });
      if (course) {
        const nextDays = course.completedDays + 1;
        await tx.panchakarmaCourse.update({
          where: { id: course.id },
          data: {
            completedDays: nextDays,
            ...(nextDays >= course.totalDays && { status: 'Completed', completedAt: now })
          }
        });
      }
    }

    return s;
  });

  await dbLogAudit(
    actor.name,
    actor.role,
    'THERAPY_SESSION_COMPLETED',
    'Ayurveda',
    `Completed therapy session ${updated.sessionRef} for patient ${updated.patient.mrn}. Clinical assessment signed by Vaidya ${actor.name}.`,
    updated.patient.mrn
  );

  return serializeTherapySession(updated);
}

/**
 * Aborts a session in progress due to adverse reaction or intolerance.
 */
export async function dbAbortTherapySession(
  sessionId: string,
  data: {
    abortReason: string;
    adverseEventDetails?: string;
  },
  actor: { id: string; name: string; role: string }
): Promise<DomainTherapySession> {
  if (!isPrismaConnected) {
    throw new Error('DatabaseUnavailable: Active PostgreSQL connection is required.');
  }

  if (actor.role !== 'VAIDYA') {
    throw new ClinicalDisciplineMismatchError('Only a licensed Vaidya can authorize procedure abortion.');
  }

  const now = new Date();
  const updated = await prisma.$transaction(async (tx) => {
    const session = await tx.therapySession.findUnique({ where: { id: sessionId } });
    if (!session) throw new Error('SessionNotFound');
    if (session.status !== SessionExecutionStatus.IN_PROGRESS) {
      throw new InvalidSessionStateError(`Cannot abort session in state "${session.status}". Must be IN_PROGRESS.`);
    }

    const s = await tx.therapySession.update({
      where: { id: sessionId },
      data: {
        status: SessionExecutionStatus.ABORTED,
        completedAt: now,
        cancellationReason: data.abortReason,
        clinicalNotes: `ABORTED MID-PROCEDURE: ${data.abortReason} | Details: ${data.adverseEventDetails || 'None'}`
      },
      include: { patient: true, room: true, administeringStaff: true, responsibleVaidya: true }
    });

    if (session.roomId) {
      await tx.therapyRoom.update({
        where: { id: session.roomId },
        data: { status: RoomOperationalStatus.SANITIZING }
      });
    }

    return s;
  });

  await dbLogAudit(
    actor.name,
    actor.role,
    'THERAPY_SESSION_ABORTED',
    'Ayurveda',
    `ABORTED therapy session ${updated.sessionRef} for patient ${updated.patient.mrn}. Reason: ${data.abortReason}`,
    updated.patient.mrn
  );

  return serializeTherapySession(updated);
}

// ==============================================================================
// 5. PANCHAKARMA COURSE & PHASE PROGRESSION (Workstream F)
// ==============================================================================

export async function dbGetPanchakarmaReferrals(): Promise<PanchakarmaReferral[]> {
  if (!isPrismaConnected) return [];
  const referrals = await prisma.panchakarmaReferral.findMany({
    orderBy: { referredAt: 'desc' },
    include: { patient: true }
  });
  return referrals as any;
}

export async function dbGetPanchakarmaReferralById(id: string): Promise<PanchakarmaReferral | null> {
  if (!isPrismaConnected) return null;
  const ref = await prisma.panchakarmaReferral.findUnique({
    where: { id },
    include: { patient: true, course: true }
  });
  return (ref as any) || null;
}

export async function dbConvertReferralToCourse(
  referralId: string,
  data: {
    protocol?: string;
    totalDays?: number;
    dietaryPrescription?: string;
    clinicalNotes?: string;
    startDate?: string;
    expectedEndDate?: string;
  },
  actor: { id: string; name: string; role: string }
): Promise<PanchakarmaCourse> {
  if (!isPrismaConnected) {
    throw new Error('DatabaseUnavailable: Active PostgreSQL connection is required.');
  }

  if (actor.role !== 'VAIDYA') {
    throw new ClinicalDisciplineMismatchError('Only a licensed Vaidya can initiate a Panchakarma course.');
  }

  const referral = await prisma.panchakarmaReferral.findUnique({
    where: { id: referralId },
    include: { patient: true }
  });
  if (!referral) throw new Error('ReferralNotFound: Panchakarma referral does not exist.');
  if (referral.status === 'scheduled' || referral.status === 'in_treatment') {
    throw new Error('ReferralAlreadyConverted: This referral has already been converted into an active Panchakarma course.');
  }

  const courseNumber = `PK-${new Date().getFullYear()}-${String(Math.floor(10000 + Math.random() * 90000))}`;
  const now = new Date();
  const totalDays = (data as any).totalDays || (data as any).totalPlannedDays || 14;
  const startDateStr = data.startDate || now.toISOString().split('T')[0];
  const endDateStr = (data as any).expectedEndDate || new Date(now.getTime() + totalDays * 86400000).toISOString().split('T')[0];

  // Resolve responsible StaffMember ID for FK
  let responsibleStaffId = (data as any).attendingVaidyaId;
  if (!responsibleStaffId) {
    const staffRec = await prisma.staffMember.findFirst({
      where: { OR: [{ id: actor.id }, { userId: actor.id }, { role: 'VAIDYA' }] }
    });
    responsibleStaffId = staffRec?.id;
  }

  const course = await prisma.$transaction(async (tx) => {
    // 1. Create Course linked to Referral
    const c = await tx.panchakarmaCourse.create({
      data: {
        courseNumber,
        referralId: referral.id,
        patientId: referral.patientId,
        patientName: `${referral.patient.firstName} ${referral.patient.lastName}`,
        patientMrn: referral.patient.mrn,
        vaidyaName: actor.name,
        responsibleVaidyaId: responsibleStaffId || actor.id,
        protocol: (data as any).protocol || (data as any).primaryProcedure || referral.proposedProcedure,
        currentPhase: 'PURVAKARMA',
        startDate: startDateStr,
        expectedEndDate: endDateStr,
        startDateActual: now,
        totalDays,
        completedDays: 0,
        dietaryPrescription: (data as any).dietaryPrescription || (data as any).dietaryInstructions || 'Samsarjana Krama protocol',
        status: 'Active',
        billingMode: (data as any).billingMode === 'PACKAGE' || (data as any).billingMode === 'PACKAGE_BILLED' ? 'PACKAGE_BILLED' : 'PER_SESSION',
        packageTariffId: (data as any).packageTariffId || null,
        dischargeNotes: data.clinicalNotes || null
      }
    });

    // 2. Update Referral Status
    await tx.panchakarmaReferral.update({
      where: { id: referral.id },
      data: { status: 'scheduled' }
    });

    // 3. Create Initial Phase Transition (Purvakarma)
    await tx.panchakarmaPhaseTransition.create({
      data: {
        courseId: c.id,
        previousPhase: PanchakarmaPhase.PURVAKARMA,
        newPhase: PanchakarmaPhase.PURVAKARMA,
        authorizedById: actor.id,
        authorizedByName: actor.name,
        authorizedAt: now,
        clinicalRationale: `Course initiated from referral ${referral.referralNumber}. Preparatory Deepana-Pachana regimen prescribed.`
      }
    });

    return c;
  });

  await dbLogAudit(
    actor.name,
    actor.role,
    'PANCHAKARMA_COURSE_INITIATED',
    'Ayurveda',
    `Initiated Panchakarma course ${course.courseNumber} (${course.protocol}) from referral ${referral.referralNumber}`,
    referral.patient.mrn
  );

  return course as any;
}

export async function dbAdvancePanchakarmaPhase(
  courseId: string,
  data: {
    toPhase?: string;
    newPhase?: PanchakarmaPhase;
    clinicalRationaleNotes?: string;
    clinicalRationale?: string;
    dietaryTransitionNotes?: string;
    nextProcedureInstructions?: string;
    vitalsAtTransition?: any;
    samayakLakshanasObserved?: string[];
  },
  actor: { id: string; name: string; role: string }
): Promise<any> {
  if (!isPrismaConnected) {
    throw new Error('DatabaseUnavailable: Active PostgreSQL connection is required.');
  }

  if (actor.role !== 'VAIDYA') {
    throw new ClinicalDisciplineMismatchError('Only a licensed Vaidya can advance Panchakarma protocol phases.');
  }

  const rationale = (data.clinicalRationaleNotes || data.clinicalRationale || '').trim();
  if (!rationale) {
    throw new Error('ClinicalRationaleRequired: Attending Vaidya must document clinical findings justifying phase advancement.');
  }

  const course = await prisma.panchakarmaCourse.findUnique({ where: { id: courseId } });
  if (!course) throw new Error('CourseNotFound');
  if (course.status !== 'Active') {
    throw new Error(`Cannot advance phase for a course in "${course.status}" state.`);
  }

  const prevPhaseStr = course.currentPhase || 'PURVAKARMA';
  let prevEnum: PanchakarmaPhase = PanchakarmaPhase.PURVAKARMA;
  if (prevPhaseStr.toUpperCase().includes('PRADHANAKARMA')) prevEnum = PanchakarmaPhase.PRADHANAKARMA;
  else if (prevPhaseStr.toUpperCase().includes('PASCHATKARMA')) prevEnum = PanchakarmaPhase.PASCHATKARMA;
  else if (prevPhaseStr.toUpperCase().includes('COMPLETED')) prevEnum = PanchakarmaPhase.COMPLETED;

  const targetStr = (data.toPhase || data.newPhase || '').toUpperCase();
  let nextEnum: PanchakarmaPhase = PanchakarmaPhase.PRADHANAKARMA;
  let phaseDisplayName = 'Pradhanakarma (Main Procedure)';

  if (targetStr.includes('PASCHATKARMA')) {
    nextEnum = PanchakarmaPhase.PASCHATKARMA;
    phaseDisplayName = 'Paschatkarma (Dietary Samsarjana)';
  } else if (targetStr.includes('PURVAKARMA')) {
    nextEnum = PanchakarmaPhase.PURVAKARMA;
    phaseDisplayName = 'Purvakarma (Prep/Snehana-Swedana)';
  } else if (targetStr.includes('COMPLETED')) {
    nextEnum = PanchakarmaPhase.COMPLETED;
    phaseDisplayName = 'Completed';
  } else {
    nextEnum = PanchakarmaPhase.PRADHANAKARMA;
    phaseDisplayName = 'Pradhanakarma (Main Procedure)';
  }

  const now = new Date();

  const { updated, transition } = await prisma.$transaction(async (tx) => {
    // 1. Record auditable transition
    const trans = await tx.panchakarmaPhaseTransition.create({
      data: {
        courseId,
        previousPhase: prevEnum,
        newPhase: nextEnum,
        authorizedById: actor.id,
        authorizedByName: actor.name,
        authorizedAt: now,
        clinicalRationale: rationale,
        dietaryTransitionNotes: data.dietaryTransitionNotes || null,
        nextProcedureInstructions: data.nextProcedureInstructions || null
      }
    });

    // 2. Update Course current phase
    const isCompleted = nextEnum === PanchakarmaPhase.COMPLETED;
    const upd = await tx.panchakarmaCourse.update({
      where: { id: courseId },
      data: {
        currentPhase: phaseDisplayName,
        ...(isCompleted && { status: 'Completed', completedAt: now }),
        ...(data.dietaryTransitionNotes && { dietaryPrescription: data.dietaryTransitionNotes })
      },
      include: { phaseTransitions: true, sessions: true }
    });

    return { updated: upd, transition: trans };
  });

  await dbLogAudit(
    actor.name,
    actor.role,
    'PANCHAKARMA_PHASE_ADVANCED',
    'Ayurveda',
    `Advanced course ${course.courseNumber} from ${prevEnum} to ${nextEnum}. Rationale: ${rationale}`,
    course.patientMrn
  );

  const transitionPayload = {
    ...transition,
    fromPhase: transition.previousPhase,
    toPhase: transition.newPhase
  };

  return {
    ...updated,
    course: updated,
    transition: transitionPayload
  };
}

export async function dbPausePanchakarmaCourse(
  courseId: string,
  reason: string,
  actor: { id: string; name: string; role: string }
): Promise<PanchakarmaCourse> {
  if (!isPrismaConnected) {
    throw new Error('DatabaseUnavailable: Active PostgreSQL connection is required.');
  }
  if (actor.role !== 'VAIDYA') {
    throw new ClinicalDisciplineMismatchError('Only a licensed Vaidya can pause a Panchakarma course.');
  }

  const updated = await prisma.panchakarmaCourse.update({
    where: { id: courseId },
    data: {
      status: 'Paused',
      pausedAt: new Date(),
      pauseReason: reason
    }
  });

  await dbLogAudit(actor.name, actor.role, 'PANCHAKARMA_COURSE_PAUSED', 'Ayurveda', `Paused course ${updated.courseNumber}. Reason: ${reason}`);
  return updated as any;
}

export async function dbResumePanchakarmaCourse(
  courseId: string,
  actor: { id: string; name: string; role: string }
): Promise<PanchakarmaCourse> {
  if (!isPrismaConnected) {
    throw new Error('DatabaseUnavailable: Active PostgreSQL connection is required.');
  }
  if (actor.role !== 'VAIDYA') {
    throw new ClinicalDisciplineMismatchError('Only a licensed Vaidya can resume a Panchakarma course.');
  }

  const updated = await prisma.panchakarmaCourse.update({
    where: { id: courseId },
    data: {
      status: 'Active',
      pausedAt: null,
      pauseReason: null
    }
  });

  await dbLogAudit(actor.name, actor.role, 'PANCHAKARMA_COURSE_RESUMED', 'Ayurveda', `Resumed course ${updated.courseNumber}`);
  return updated as any;
}

export async function dbTerminatePanchakarmaCourse(
  courseId: string,
  reason: string,
  actor: { id: string; name: string; role: string }
): Promise<PanchakarmaCourse> {
  if (!isPrismaConnected) {
    throw new Error('DatabaseUnavailable: Active PostgreSQL connection is required.');
  }
  if (actor.role !== 'VAIDYA') {
    throw new ClinicalDisciplineMismatchError('Only a licensed Vaidya can terminate a Panchakarma course.');
  }

  const updated = await prisma.panchakarmaCourse.update({
    where: { id: courseId },
    data: {
      status: 'Terminated',
      terminatedAt: new Date(),
      terminationReason: reason
    }
  });

  await dbLogAudit(actor.name, actor.role, 'PANCHAKARMA_COURSE_TERMINATED', 'Ayurveda', `Terminated course ${updated.courseNumber}. Reason: ${reason}`);
  return updated as any;
}

// ==============================================================================
// 6. QUERY SESSIONS & HELPER SERIALIZERS
// ==============================================================================

export async function dbGetTherapySessions(filters?: {
  patientId?: string;
  treatmentPlanId?: string;
  panchakarmaCourseId?: string;
  roomId?: string;
  status?: SessionExecutionStatus;
  isBilled?: boolean;
}): Promise<DomainTherapySession[]> {
  if (!isPrismaConnected) {
    return hospitalStore.therapySessions as any;
  }

  const sessions = await prisma.therapySession.findMany({
    where: {
      ...(filters?.patientId && { patientId: filters.patientId }),
      ...(filters?.treatmentPlanId && { treatmentPlanId: filters.treatmentPlanId }),
      ...(filters?.panchakarmaCourseId && { panchakarmaCourseId: filters.panchakarmaCourseId }),
      ...(filters?.roomId && { roomId: filters.roomId }),
      ...(filters?.status && { status: filters.status }),
      ...(filters?.isBilled !== undefined && { isBilled: filters.isBilled })
    },
    include: {
      patient: true,
      room: true,
      administeringStaff: true,
      responsibleVaidya: true
    },
    orderBy: { scheduledStartAt: 'asc' }
  });

  return sessions.map(serializeTherapySession);
}

export async function dbGetTherapySessionById(id: string): Promise<DomainTherapySession | null> {
  if (!isPrismaConnected) {
    return (hospitalStore.therapySessions.find((s) => s.id === id) as any) || null;
  }

  const session = await prisma.therapySession.findUnique({
    where: { id },
    include: {
      patient: true,
      room: true,
      administeringStaff: true,
      responsibleVaidya: true
    }
  });
  if (!session) return null;
  return serializeTherapySession(session);
}

function serializeTherapySession(s: any): DomainTherapySession {
  return {
    id: s.id,
    sessionNumber: s.sessionNumber,
    sessionRef: s.sessionRef,
    patientId: s.patientId,
    patientName: s.patient ? `${s.patient.firstName} ${s.patient.lastName}` : undefined,
    patientMrn: s.patient ? s.patient.mrn : undefined,
    treatmentPlanId: s.treatmentPlanId,
    panchakarmaCourseId: s.panchakarmaCourseId,
    roomId: s.roomId,
    roomCodeSnapshot: s.roomCodeSnapshot,
    roomNameSnapshot: s.roomNameSnapshot,
    administeringStaffId: s.administeringStaffId,
    administeringStaffName: s.administeringStaff ? s.administeringStaff.name : undefined,
    responsibleVaidyaId: s.responsibleVaidyaId,
    responsibleVaidyaName: s.responsibleVaidya ? s.responsibleVaidya.name : undefined,
    scheduledStartAt: s.scheduledStartAt.toISOString(),
    scheduledEndAt: s.scheduledEndAt.toISOString(),
    actualStartAt: s.actualStartAt ? s.actualStartAt.toISOString() : null,
    completedAt: s.completedAt ? s.completedAt.toISOString() : null,
    status: s.status,
    preProcedureAssessment: s.preProcedureAssessment as any,
    postProcedureAssessment: s.postProcedureAssessment as any,
    clinicalNotes: s.clinicalNotes,
    cancellationReason: s.cancellationReason,
    tariffId: s.tariffId,
    billableAmount: s.billableAmount !== null && s.billableAmount !== undefined ? Number(s.billableAmount) : null,
    billingMode: s.billingMode,
    isBilled: s.isBilled,
    invoiceId: s.invoiceId,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString()
  };
}
