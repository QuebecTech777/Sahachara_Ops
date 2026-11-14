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
  AppUser,
  Consultation,
  TreatmentPlan,
  PanchakarmaCourse,
  StockMovement,
  PharmacySupplier,
  StaffMember,
  HospitalTariff
} from '../types/hospital';

/**
 * Sahachara Ops — Production Operating Model Baseline
 *
 * Sahachara is strictly an Ayurvedic outpatient, day-care, and ambulatory therapy clinic.
 * It operates with:
 * - NO inpatient beds or wards
 * - NO ICU or overnight accommodation
 * - NO inpatient admission/discharge workflows
 *
 * In accordance with P0 Production Security Hardening and Data Accuracy requirements,
 * all operational arrays are initialized to clean empty datasets ([]).
 * Operational records must be authentic, authorized, and sourced exclusively from PostgreSQL/Supabase.
 */

export const INITIAL_PATIENTS: Patient[] = [];

export const INITIAL_TRIAGE: TriageRecord[] = [];

export const INITIAL_DOCTORS: Doctor[] = [];

export const INITIAL_APPOINTMENTS: Appointment[] = [];

export const INITIAL_REMINDERS: AppointmentReminder[] = [];

export const INITIAL_PRESCRIPTIONS: Prescription[] = [];

export const INITIAL_MEDICATION_STOCK: MedicationStock[] = [];

export const INITIAL_LAB_ORDERS: LabOrder[] = [];

export const INITIAL_INVOICES: BillInvoice[] = [];

export const INITIAL_AUDIT_LOGS: ClinicalAuditLog[] = [];

export const INITIAL_USERS: AppUser[] = [];

export const INITIAL_METRICS: HospitalOverviewMetrics = {
  totalPatientsToday: 0,
  activeConsultationsToday: 0,
  scheduledAppointmentsToday: 0,
  activeTreatments: 0,
  activePanchakarmaCourses: 0,
  activeDoctorsOnDuty: 0,
  criticalLabAlerts: 0,
  pendingPrescriptions: 0,
  todayRevenueInr: 0,
  erWaitTimeMinutes: 0,
  occupiedBeds: 0,
  totalBeds: 0,
  occupancyRate: 0,
  admittedToday: 0,
  dischargedToday: 0
};

export const INITIAL_CONSULTATIONS: Consultation[] = [];

export const INITIAL_TREATMENT_PLANS: TreatmentPlan[] = [];

export const INITIAL_PANCHAKARMA_COURSES: PanchakarmaCourse[] = [];

export const INITIAL_STOCK_MOVEMENTS: StockMovement[] = [];

export const INITIAL_SUPPLIERS: PharmacySupplier[] = [];

export const INITIAL_STAFF: StaffMember[] = [];

export const INITIAL_TARIFFS: HospitalTariff[] = [];
