import {
  Patient,
  TriageRecord,
  Doctor,
  Appointment,
  AppointmentReminder,
  Prescription,
  MedicationStock,
  LabOrder,
  BillInvoice,
  ClinicalAuditLog,
  HospitalOverviewMetrics,
  Consultation,
  TreatmentPlan,
  PanchakarmaCourse,
  StockMovement,
  PharmacySupplier,
  AppUser,
  StaffMember,
  HospitalTariff,
  Payment,
  PaymentAllocation,
  RefundRequest,
  TherapyRoom,
  TherapySession,
  PanchakarmaPhaseTransition,
  StaffTherapyAuthorization
} from '../src/types/hospital.ts';
import {
  INITIAL_PATIENTS,
  INITIAL_TRIAGE,
  INITIAL_DOCTORS,
  INITIAL_APPOINTMENTS,
  INITIAL_REMINDERS,
  INITIAL_PRESCRIPTIONS,
  INITIAL_MEDICATION_STOCK,
  INITIAL_LAB_ORDERS,
  INITIAL_INVOICES,
  INITIAL_AUDIT_LOGS,
  INITIAL_USERS,
  INITIAL_METRICS,
  INITIAL_CONSULTATIONS,
  INITIAL_TREATMENT_PLANS,
  INITIAL_PANCHAKARMA_COURSES,
  INITIAL_STOCK_MOVEMENTS,
  INITIAL_SUPPLIERS,
  INITIAL_STAFF,
  INITIAL_TARIFFS
} from '../src/data/seedData.ts';

/**
 * SahacharaOS In-Memory Database store with Nest.js modular service layer
 */
class HospitalDataStore {
  patients: Patient[] = [...INITIAL_PATIENTS];
  triageRecords: TriageRecord[] = [...INITIAL_TRIAGE];
  doctors: Doctor[] = [...INITIAL_DOCTORS];
  appointments: Appointment[] = [...INITIAL_APPOINTMENTS];
  reminders: AppointmentReminder[] = [...INITIAL_REMINDERS];
  prescriptions: Prescription[] = [...INITIAL_PRESCRIPTIONS];
  medicationStock: MedicationStock[] = [...INITIAL_MEDICATION_STOCK];
  labOrders: LabOrder[] = [...INITIAL_LAB_ORDERS];
  invoices: BillInvoice[] = [...INITIAL_INVOICES];
  payments: Payment[] = [];
  paymentAllocations: PaymentAllocation[] = [];
  refundRequests: RefundRequest[] = [];
  tariffs: HospitalTariff[] = [...INITIAL_TARIFFS];
  auditLogs: ClinicalAuditLog[] = [...INITIAL_AUDIT_LOGS];
  users: AppUser[] = [...INITIAL_USERS];
  consultations: Consultation[] = [...INITIAL_CONSULTATIONS];
  treatmentPlans: TreatmentPlan[] = [...INITIAL_TREATMENT_PLANS];
  panchakarmaCourses: PanchakarmaCourse[] = [...INITIAL_PANCHAKARMA_COURSES];
  stockMovements: StockMovement[] = [...INITIAL_STOCK_MOVEMENTS];
  suppliers: PharmacySupplier[] = [...INITIAL_SUPPLIERS];
  staff: StaffMember[] = [...INITIAL_STAFF];
  therapyRooms: TherapyRoom[] = [];
  therapySessions: TherapySession[] = [];
  panchakarmaPhaseTransitions: PanchakarmaPhaseTransition[] = [];
  staffTherapyAuthorizations: StaffTherapyAuthorization[] = [];

  getMetrics(): HospitalOverviewMetrics {
    const activePatients = this.patients.filter((p) => !p.deletedAt);
    const criticalLabs = this.labOrders.filter((l) => l.isAbnormal).length;
    const pendingRx = this.prescriptions.filter((p) => p.status === 'pending').length;
    const doctorsOnDuty = this.doctors.filter((d) => d.status === 'on_duty').length;
    const todayApts = this.appointments.filter((a) => a.status === 'scheduled').length;
    const activeTreatmentsCount = this.treatmentPlans.filter((t) => t.status === 'active').length;
    const activePkCount = this.panchakarmaCourses.filter((pk) => pk.status === 'Active').length;
    const revenueInr = this.invoices.reduce((acc, inv) => acc + (inv.paymentStatus === 'paid' ? inv.totalAmount : inv.copayPatient), 0);

    return {
      totalPatientsToday: activePatients.length,
      erWaitTimeMinutes: 0,
      occupiedBeds: 0,
      totalBeds: 0,
      occupancyRate: 0,
      activeDoctorsOnDuty: doctorsOnDuty,
      criticalLabAlerts: criticalLabs,
      pendingPrescriptions: pendingRx,
      admittedToday: 0,
      dischargedToday: 0,
      scheduledAppointmentsToday: todayApts,
      activeTreatments: activeTreatmentsCount,
      activePanchakarmaCourses: activePkCount,
      todayRevenueInr: Math.round(revenueInr)
    };
  }

  logAudit(actor: string, role: string, action: string, category: ClinicalAuditLog['category'], details: string, patientMrn?: string) {
    const newLog: ClinicalAuditLog = {
      id: `log-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      timestamp: new Date().toISOString(),
      actor,
      role,
      action,
      category,
      details,
      patientMrn
    };
    this.auditLogs.unshift(newLog);

    // Sync to Supabase PostgreSQL
    try {
      import('./supabaseServer.ts').then((mod) => {
        mod.persistAuditLogToSupabase(newLog).catch(() => {});
      }).catch(() => {});
    } catch {}
  }
}

export const hospitalStore = new HospitalDataStore();
