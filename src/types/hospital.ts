export type AdmissionStatus = 'outpatient' | 'inpatient' | 'er' | 'consultation' | 'active_treatment' | 'discharged';

export type DoctorStatus = 'on_duty' | 'in_consultation' | 'in_surgery' | 'on_call' | 'off_duty';

export type DoctorSpecialty =
  | 'Kayachikitsa (Internal Medicine)'
  | 'Panchakarma (Detoxification & Purification)'
  | 'Shalya Tantra (Surgical & Marma Therapy)'
  | 'Shalakya Tantra (ENT & Ophthalmology)'
  | 'Prasuti & Stri Roga (Obstetrics & Gynecology)'
  | 'Kaumarbhritya (Pediatrics & Child Health)'
  | 'Agada Tantra (Toxicology & Vishachikitsa)'
  | 'Rasayana & Vajikarana (Rejuvenation & Reproductive Health)'
  | 'Swasthavritta & Yoga (Preventive Medicine & Wellness)'
  | 'Dravyaguna & Rasashala (Ayurvedic Pharmacology & Formulations)'
  | 'Cardiology'
  | 'Emergency Medicine'
  | 'Orthopedics'
  | 'Pulmonology'
  | 'Pediatrics'
  | 'Neurology'
  | (string & {});

export const VALID_USER_ROLES = [
  'SUPER_ADMIN',
  'ADMIN',
  'DOCTOR',
  'VAIDYA',
  'RECEPTIONIST',
  'PHARMACIST',
  'ACCOUNTANT'
] as const;

export type UserRole = (typeof VALID_USER_ROLES)[number];

export interface Vitals {
  bpSystolic: number;
  bpDiastolic: number;
  heartRate: number;
  spo2: number;
  temperature: number;
  respRate: number;
  gcs?: number;
  recordedAt: string;
}

export interface PatientInsurance {
  provider: string;
  policyNumber: string;
  groupNumber?: string;
  coveragePercentage: number;
  verified: boolean;
}

export type PatientStatus = 'active' | 'inactive' | 'archived';
export type AllergyStatus = 'not_recorded' | 'none_confirmed' | 'known_allergies';
export type MedicalHistoryStatus = 'not_recorded' | 'reviewed' | 'documented';
export type CommunicationPreference = 'sms' | 'whatsapp' | 'email' | 'phone' | 'none';

export interface EmergencyContactInfo {
  name: string;
  relationship: string;
  phone: string;
  altPhone?: string;
}

export interface DuplicatePatientMatch {
  id: string;
  mrn: string;
  name: string;
  phone?: string;
  dob?: string;
  matchReasons: string[];
}

export interface Patient {
  id: string;
  mrn: string; // Medical Record Number (e.g. SAH-2026-10001)
  firstName: string;
  middleName?: string | null;
  lastName: string;
  dob?: string | null;
  age?: number | null;
  gender: 'Male' | 'Female' | 'Other' | 'Undisclosed';
  bloodGroup?: string | null;
  preferredLanguage?: string | null;
  photoUrl?: string | null;
  status?: PatientStatus;
  phone: string;
  secondaryPhone?: string | null;
  email?: string | null;
  communicationPreference?: CommunicationPreference | null;
  contactLanguage?: string | null;

  // Address
  address?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  locality?: string | null;
  city?: string | null;
  district?: string | null;
  state?: string | null;
  postalCode?: string | null;
  country?: string | null;

  // Emergency Contact
  emergencyContact?: EmergencyContactInfo | null;
  emergencyContactName?: string | null;
  emergencyContactRelation?: string | null;
  emergencyContactPhone?: string | null;
  emergencyContactAltPhone?: string | null;

  // Clinical & Allergies
  allergyStatus?: AllergyStatus;
  allergies: string[];
  medicalHistoryStatus?: MedicalHistoryStatus;
  chronicConditions: string[];
  pastMedicalHistory?: string | null;
  pastSurgicalHistory?: string | null;
  familyHistory?: string | null;
  currentMedications: string[]; // e.g. ["Dhanwantharam Kwatham 15ml BID", "Sahacharadi Thailam"]
  pastDiagnoses: string[]; // e.g. ["Sandhigata Vata", "Amavata", "Kaphaja Prameha"]
  medicalHistoryNotes?: string | null;
  clinicalNotes?: string | null;

  // Administrative & Inpatient Allocation
  admissionStatus: AdmissionStatus;
  currentWard?: string;
  currentBed?: string;
  assignedDoctorId?: string;
  assignedDoctorName?: string;
  admissionDate?: string;
  dischargeDate?: string;
  isRegistered?: boolean; // True if registered patient in master directory
  registeredById?: string | null;
  registeredByName?: string | null;
  archivedAt?: string | null;
  archivedById?: string | null;
  archivedByName?: string | null;
  archivedReason?: string | null;
  insurance?: PatientInsurance;
  latestVitals?: Vitals;
  vitalsHistory?: Vitals[];
  doshaProfile?: DoshaProfile;
  deletedAt?: string | null; // Soft delete timestamp
  createdAt?: string;
  updatedAt?: string;
}

export interface PatientDossier {
  patient: Patient;
  appointments: Appointment[];
  consultations: Consultation[];
  treatmentPlans: TreatmentPlan[];
  panchakarmaCourses: PanchakarmaCourse[];
  prescriptions: Prescription[];
  therapyRooms?: TherapyRoom[];
  therapySessions?: TherapySession[];
  labOrders: LabOrder[];
  invoices: BillInvoice[];
  stockMovements: StockMovement[];
  auditLogs: ClinicalAuditLog[];
}

export interface TriageRecord {
  id: string;
  patientId: string;
  patientName: string;
  mrn: string;
  age: number;
  gender: 'Male' | 'Female' | 'Other';
  esiLevel: 1 | 2 | 3 | 4 | 5;
  chiefComplaint: string;
  vitals: Vitals;
  triageNurse: string;
  arrivalTime: string;
  triageStatus: 'waiting' | 'in_treatment' | 'admitted' | 'discharged';
  assignedRoom?: string;
  notes?: string;
}

export interface Bed {
  id: string;
  bedNumber: string;
  ward: string;
  floor: number;
  status: 'available' | 'occupied' | 'cleaning' | 'maintenance';
  oxygenConnected: boolean;
  telemetryEquipped: boolean;
  patientId?: string;
  patientName?: string;
  patientMrn?: string;
  admittedAt?: string;
  attendingDoctor?: string;
  notes?: string;
}

export interface DoctorAvailabilitySlot {
  time: string; // e.g. "09:00", "09:30", "10:00"
  available: boolean;
  appointmentId?: string;
}

export interface Doctor {
  id: string;
  name: string;
  title: string;
  specialty: DoctorSpecialty;
  department: string;
  licenseNumber: string;
  status: DoctorStatus;
  room: string;
  phone: string;
  email: string;
  activePatientsCount: number;
  shift: 'Morning (07:00-15:00)' | 'Evening (15:00-23:00)' | 'Night (23:00-07:00)';
  availableDays: string[]; // ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]
  timeSlots: string[]; // ["09:00", "09:30", "10:00", "10:30", "11:00", "14:00", "14:30", "15:00"]
}

export type AppointmentStatus =
  | 'scheduled'
  | 'confirmed'
  | 'checked_in'
  | 'waiting'
  | 'in_consultation'
  | 'completed'
  | 'cancelled'
  | 'no_show'
  | 'rescheduled';

export type BookingSource =
  | 'reception_scheduled'
  | 'walk_in'
  | 'phone'
  | 'online';

export type QueuePriority = 'normal' | 'priority' | 'urgent';

export interface ReschedulingHistoryEntry {
  previousDateTime: string;
  previousTimeSlot: string;
  rescheduledBy: string;
  rescheduledAt: string;
  reason?: string;
}

export interface Appointment {
  id: string;
  appointmentNumber?: string;
  patientId: string;
  patientName: string;
  patientMrn: string;
  patientPhone: string;
  patientEmail?: string;

  // Practitioner Assignment
  practitionerId?: string;
  practitionerName?: string;
  practitionerRole?: 'DOCTOR' | 'VAIDYA';
  doctorId?: string;
  doctorName?: string;
  department: string;

  // Scheduling details
  dateTime: string;
  appointmentDate?: string;
  timeSlot: string;
  durationMinutes?: number;
  scheduledStartTime?: string;
  scheduledEndTime?: string;

  // Type & Status
  type: string;
  status: AppointmentStatus;
  bookingSource?: BookingSource;

  // Context & Notes
  reasonForVisit?: string;
  notes: string;
  receptionNotes?: string;
  cancellationReason?: string;

  // Queue & Check-in
  checkInTime?: string;
  queuePosition?: number | null;
  priority?: QueuePriority;
  priorityReason?: string;
  consultationStartTime?: string;
  completedAt?: string;

  // Emergency Escalation & Clinical Triage Governance
  isEscalated?: boolean;
  escalationStatus?: 'escalated' | 'acknowledged' | 'resolved';
  escalatedAt?: string;
  escalatedById?: string;
  escalatedByName?: string;
  escalationReason?: string;
  escalationAcknowledgedAt?: string;
  escalationAcknowledgedById?: string;
  escalationAcknowledgedByName?: string;
  escalationResolvedAt?: string;
  escalationResolvedById?: string;
  escalationResolvedByName?: string;
  escalationResolutionNotes?: string;
  clinicalTriageAt?: string;
  clinicalTriageById?: string;
  clinicalTriageRole?: 'DOCTOR' | 'VAIDYA';
  clinicalDocumentationCompleted?: boolean;

  // Rescheduling Traceability
  rescheduledFromId?: string;
  reschedulingHistory?: ReschedulingHistoryEntry[];

  // Attribution
  createdById?: string;
  createdByName?: string;
  updatedById?: string;
  updatedByName?: string;

  // Reminders
  reminderSent: boolean;
  reminderChannel?: 'email' | 'sms' | 'both';
  reminderSentAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface QueueItem {
  id: string;
  appointmentNumber: string;
  patientId: string;
  patientName: string;
  patientMrn: string;
  patientPhone: string;
  type: string;
  practitionerId: string;
  practitionerName: string;
  practitionerRole: 'DOCTOR' | 'VAIDYA';
  department: string;
  status: AppointmentStatus;
  bookingSource: BookingSource;
  checkInTime: string;
  waitingDurationMinutes: number;
  queuePosition: number;
  priority: QueuePriority;
  priorityReason?: string;
  isEscalated?: boolean;
  escalationStatus?: 'escalated' | 'acknowledged' | 'resolved';
  escalatedAt?: string;
  escalatedById?: string;
  escalatedByName?: string;
  escalationReason?: string;
  escalationAcknowledgedAt?: string;
  escalationAcknowledgedById?: string;
  escalationAcknowledgedByName?: string;
  escalationResolvedAt?: string;
  escalationResolvedById?: string;
  escalationResolvedByName?: string;
  escalationResolutionNotes?: string;
  clinicalTriageAt?: string;
  clinicalTriageById?: string;
  clinicalTriageRole?: 'DOCTOR' | 'VAIDYA';
  notes?: string;
}

export interface ReceptionDashboardMetrics {
  totalScheduled: number;
  checkedIn: number;
  waiting: number;
  inConsultation: number;
  completed: number;
  cancelled: number;
  noShow: number;
  walkIns: number;
  doctorQueueCount: number;
  vaidyaQueueCount: number;
}

export interface AppointmentReminder {
  id: string;
  appointmentId: string;
  patientId: string;
  patientName: string;
  recipientPhone: string;
  recipientEmail: string;
  doctorName: string;
  dateTime: string;
  channel: 'SMS' | 'Email';
  status: 'Delivered' | 'Sent' | 'Queued';
  sentAt: string;
  messageContent: string;
}

export interface Prescription {
  id: string;
  rxNumber: string;
  encounterId?: string;
  patientId: string;
  patientName: string;
  mrn: string;
  doctorId: string;
  doctorName: string;
  prescribingPractitionerRole?: string;
  datePrescribed: string;
  medicationId?: string;
  medicationName: string;
  dosage: string;
  frequency: string;
  route: 'Oral' | 'IV' | 'IM' | 'Inhalation' | 'Sublingual' | 'Topical' | string;
  duration: string;
  quantity?: number;
  instructions?: string;
  amendmentHistory?: any;
  status: 'pending' | 'dispensed' | 'cancelled';
  dispensingStatus?: 'pending' | 'partially_dispensed' | 'fully_dispensed' | 'cancelled';
  dispensedQuantity?: number;
  remainingQuantity?: number;
  dispensedBy?: string;
  dispensedById?: string;
  dispensedAt?: string;
  dispenseHistory?: any;
  dispensingRecords?: DispensingRecord[];
  pharmacyNotes?: string;
}

export interface MedicationStock {
  id: string;
  drugName: string;
  genericName: string;
  category: string;
  form: 'Tablet' | 'Injection' | 'Syrup' | 'IV Bag' | 'Inhaler' | string;
  strength?: string;
  stockQuantity: number;
  unit: string;
  minThreshold: number;
  reorderThreshold?: number;
  manufacturer?: string;
  batchNumber: string;
  expiryDate: string;
  storageInfo?: string;
  unitPrice: number | null;
  isActive?: boolean;
  status: 'in_stock' | 'low_stock' | 'critical' | 'out_of_stock' | 'expired';
}

export interface DispensingRecord {
  id: string;
  dispenseNumber: string;
  prescriptionId: string;
  encounterId?: string;
  patientId?: string;
  patientName: string;
  mrn: string;
  medicationStockId?: string;
  drugName: string;
  batchNumber: string;
  expiryDate?: string;
  quantityDispensed: number;
  idempotencyKey?: string;
  dispensedAt: string;
  dispensedById: string;
  dispensedByName: string;
  dispensedByRole: string;
  pharmacyNotes?: string;
  createdAt: string;
}

export interface LabOrder {
  id: string;
  orderNumber: string;
  encounterId?: string;
  patientId: string;
  patientName: string;
  mrn: string;
  testType: string;
  priority: 'STAT (Immediate)' | 'Urgent (<2 hrs)' | 'Routine' | string;
  orderingDoctor: string;
  orderingPractitionerId?: string;
  orderingPractitionerRole?: string;
  clinicalIndication?: string;
  orderedAt: string;
  sampleCollectedAt?: string;
  sampleCollectedBy?: string;
  status:
    | 'ordered'
    | 'sample_collected'
    | 'processing'
    | 'result_available'
    | 'reviewed'
    | 'cancelled'
    | 'analyzing'
    | 'completed'
    | 'verified';
  normalRange?: string;
  resultValue?: string;
  unit?: string;
  isAbnormal?: boolean;
  resultTimestamp?: string;
  resultAttribution?: string;
  resultAttributionId?: string;
  reviewedAt?: string;
  reviewedById?: string;
  reviewedByName?: string;
  reviewNotes?: string;
  labNotes?: string;
  verifiedBy?: string;
  verifiedAt?: string;
}

export interface DoctorDashboardMetrics {
  todayAppointments: number;
  waitingQueue: number;
  escalatedQueue: number;
  activeConsultations: number;
  completedEncounters: number;
  pendingInvestigations: number;
  pendingDocumentation: number;
}

export interface VaidyaDashboardMetrics {
  todayAppointments: number;
  waitingQueue: number;
  escalatedQueue: number;
  activeConsultations: number;
  pendingTreatmentPlans: number;
  panchakarmaReferrals: number;
  completedEncounters: number;
}

export interface ClinicalVitals {
  id: string;
  encounterId: string;
  patientId: string;
  recordedAt: string;
  recordedById: string;
  recordedByName: string;
  recordedByRole: string;
  bpSystolic?: number | null;
  bpDiastolic?: number | null;
  heartRate?: number | null;
  respiratoryRate?: number | null;
  temperature?: number | null;
  temperatureUnit?: string;
  spO2?: number | null;
  height?: number | null;
  weight?: number | null;
  bmi?: number | null;
  notes?: string;
  createdAt?: string;
}

export interface ClinicalAssessment {
  id: string;
  encounterId: string;
  patientId: string;
  practitionerId: string;
  practitionerName: string;
  practitionerRole: string;
  presentingComplaints?: string;
  historyOfPresentingIllness?: string;
  physicalExamination?: string;
  systemicExamination?: Record<string, any>;
  clinicalObservations?: string;
  clinicalImpression?: string;
  differentialDiagnosis?: string;
  clinicalPlan?: string;
  followUpAdvice?: string;
  recordedAt: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface ClinicalDiagnosis {
  id: string;
  encounterId: string;
  patientId: string;
  practitionerId: string;
  practitionerName: string;
  practitionerRole: string;
  diagnosisType: 'provisional' | 'final' | 'differential';
  icdCode?: string;
  diagnosisName: string;
  notes?: string;
  status: 'active' | 'resolved' | 'ruled_out';
  recordedAt: string;
  createdAt?: string;
}

export interface PrakritiAssessment {
  id: string;
  encounterId: string;
  patientId: string;
  practitionerId: string;
  practitionerName: string;
  vataScore: number;
  pittaScore: number;
  kaphaScore: number;
  dominantPrakriti: string;
  physicalCharacteristics?: Record<string, any>;
  physiologicalCharacteristics?: Record<string, any>;
  psychologicalCharacteristics?: Record<string, any>;
  clinicalInterpretation: string;
  recordedAt: string;
  createdAt?: string;
}

export interface VikritiAssessment {
  id: string;
  encounterId: string;
  patientId: string;
  practitionerId: string;
  practitionerName: string;
  primaryVikriti: string;
  secondaryVikriti?: string;
  vataAggravation?: string;
  pittaAggravation?: string;
  kaphaAggravation?: string;
  clinicalInterpretation: string;
  recordedAt: string;
  createdAt?: string;
}

export interface DoshaEvaluation {
  id: string;
  encounterId: string;
  patientId: string;
  practitionerId: string;
  practitionerName: string;
  agniStatus?: string;
  amaStatus?: string;
  koshthaType?: string;
  dhatuInvolvement?: Record<string, any>;
  srotasInvolvement?: Record<string, any>;
  ashtaVidhaPariksha?: Record<string, any>;
  clinicalInterpretation: string;
  recordedAt: string;
  createdAt?: string;
}

export interface PanchakarmaReferral {
  id: string;
  referralNumber: string;
  encounterId: string;
  patientId: string;
  patient?: Patient;
  practitionerId: string;
  practitionerName: string;
  proposedProcedure: string;
  clinicalIndication: string;
  preliminaryNotes?: string;
  precautions?: string;
  urgency: 'routine' | 'urgent';
  status: 'referred' | 'scheduled' | 'in_treatment' | 'completed' | 'cancelled';
  referredAt: string;
  createdAt?: string;
}

export interface ClinicalEncounter {
  id: string;
  encounterNumber: string;
  patientId: string;
  patient?: Patient;
  appointmentId?: string;
  appointment?: Appointment;
  practitionerId: string;
  practitionerName: string;
  practitionerRole: 'DOCTOR' | 'VAIDYA';
  discipline: 'DOCTOR' | 'VAIDYA';
  encounterType: 'consultation' | 'initial' | 'follow_up' | 'emergency' | 'walk_in';
  status: 'in_progress' | 'completed' | 'cancelled';
  startedAt: string;
  completedAt?: string;
  reasonForVisit?: string;
  clinicalDocumentationCompleted: boolean;
  vitals?: ClinicalVitals[];
  assessments?: ClinicalAssessment[];
  diagnoses?: ClinicalDiagnosis[];
  prescriptions?: Prescription[];
  labOrders?: LabOrder[];
  treatmentPlans?: TreatmentPlan[];
  prakritiAssessments?: PrakritiAssessment[];
  vikritiAssessments?: VikritiAssessment[];
  doshaEvaluations?: DoshaEvaluation[];
  panchakarmaReferrals?: PanchakarmaReferral[];
  createdAt?: string;
  updatedAt?: string;
}

export interface PatientClinicalHistory {
  patient: Patient;
  encounters: ClinicalEncounter[];
  vitals: ClinicalVitals[];
  assessments: ClinicalAssessment[];
  diagnoses: ClinicalDiagnosis[];
  prescriptions: Prescription[];
  labOrders: LabOrder[];
  treatmentPlans: TreatmentPlan[];
  panchakarmaReferrals: PanchakarmaReferral[];
  prakritiAssessments: PrakritiAssessment[];
  vikritiAssessments: VikritiAssessment[];
  doshaEvaluations: DoshaEvaluation[];
}

export interface RateHistory {
  id: string;
  tariffId: string;
  previousRate: number | null;
  newRate: number | null;
  isZeroPrice: boolean;
  currency: string;
  effectiveFrom: string;
  effectiveUntil?: string;
  changedById?: string;
  changedByName: string;
  changeReason?: string;
  createdAt: string;
}

export interface HospitalTariff {
  id: string;
  category:
    | 'Consultation'
    | 'Ayurvedic Consultation'
    | 'General Medical Consultation'
    | 'Treatment'
    | 'Panchakarma'
    | 'Laboratory Investigation'
    | 'Procedure'
    | 'Accommodation'
    | 'Bed Charges'
    | 'Bed/Room'
    | 'Laboratory'
    | 'Other Hospital Services'
    | string;
  serviceCode: string;
  serviceName: string;
  department?: string;
  serviceType?: string;
  rate: number | null; // null explicitly represents UNCONFIGURED tariff
  currency?: string;
  isZeroPricePermitted: boolean;
  isActive?: boolean;
  unit: string;
  durationMinutes?: number;
  description?: string;
  notes?: string;
  effectiveFrom?: string;
  effectiveUntil?: string;
  updatedBy?: string;
  updatedById?: string;
  createdAt?: string;
  updatedAt?: string;
  rateHistories?: RateHistory[];
}

export interface BillItem {
  id: string;
  tariffId?: string;
  medicationId?: string;
  dispensingRecordId?: string;
  therapySessionId?: string;
  panchakarmaCourseId?: string;
  serviceCode?: string;
  description: string;
  category: 'Bed/Room' | 'Physician Fee' | 'Pharmacy' | 'Laboratory' | 'Nursing/Supplies' | 'Surgery' | 'Treatment' | string;
  quantity: number;
  unitPrice: number | null; // Snapshot of rate at invoice creation
  total: number;
  isZeroPricePermitted?: boolean;
}

export type InvoiceStatus = 'draft' | 'issued' | 'partially_paid' | 'paid' | 'voided' | 'cancelled';

export interface BillInvoice {
  id: string;
  invoiceNumber: string;
  patientId: string;
  patientName: string;
  mrn: string;
  status?: InvoiceStatus;
  issuedAt?: string;
  issuedById?: string;
  issuedByName?: string;
  createdById?: string;
  createdByName?: string;
  dueDate?: string;
  currency?: string;
  notes?: string;
  admissionDate: string;
  dischargeDate?: string;
  items: BillItem[];
  subtotal: number;
  insuranceCovered?: number;
  copayPatient: number;
  totalAmount: number;
  paidAmount?: number;
  balance?: number;
  paymentStatus: 'unpaid' | 'partial' | 'partially_paid' | 'paid';
  insuranceClaimStatus?: 'pending' | 'approved' | 'settled' | 'rejected';
  allocations?: PaymentAllocation[];
  refundRequests?: RefundRequest[];
  createdAt: string;
  updatedAt?: string;
}

export type PaymentMethod = 'Cash' | 'UPI' | 'Bank Transfer' | 'Card' | 'Other';
export type PaymentStatus = 'unallocated' | 'partially_allocated' | 'fully_allocated' | 'refunded' | 'partially_refunded';

export interface Payment {
  id: string;
  paymentNumber: string;
  patientId?: string;
  patientName: string;
  mrn: string;
  amount: number;
  unallocatedAmount: number;
  paymentDate: string;
  paymentMethod: PaymentMethod;
  referenceNumber?: string;
  notes?: string;
  status: PaymentStatus;
  recordedById: string;
  recordedByName: string;
  recordedByRole: string;
  idempotencyKey?: string;
  allocations?: PaymentAllocation[];
  refundRequests?: RefundRequest[];
  createdAt: string;
  updatedAt?: string;
}

export interface PaymentAllocation {
  id: string;
  paymentId: string;
  invoiceId: string;
  amount: number;
  allocatedAt: string;
  allocatedById: string;
  allocatedByName: string;
  allocatedByRole: string;
  notes?: string;
  invoice?: BillInvoice;
  payment?: Payment;
  createdAt?: string;
}

export type RefundRequestType = 'refund' | 'credit_adjustment' | 'invoice_void';
export type RefundRequestStatus = 'pending' | 'approved' | 'rejected' | 'completed';

export interface RefundRequest {
  id: string;
  requestNumber: string;
  type: RefundRequestType;
  paymentId?: string;
  invoiceId?: string;
  patientId?: string;
  patientName: string;
  mrn: string;
  amount: number;
  reason: string;
  status: RefundRequestStatus;
  requestedById: string;
  requestedByName: string;
  requestedByRole: string;
  requestedAt: string;
  approvedById?: string;
  approvedByName?: string;
  approvedByRole?: string;
  approvedAt?: string;
  approvalNotes?: string;
  rejectedById?: string;
  rejectedByName?: string;
  rejectedAt?: string;
  rejectionReason?: string;
  externalReference?: string;
  executedById?: string;
  executedByName?: string;
  executedByRole?: string;
  executedAt?: string;
  executionNotes?: string;
  refundMethod?: string;
  refundLedgerEntry?: RefundLedgerEntry;
  createdAt: string;
  updatedAt?: string;
}

export interface RefundLedgerEntry {
  id: string;
  entryNumber: string; // RLE-YYYY-XXXXX
  refundRequestId: string;
  paymentId: string;
  patientId?: string;
  patientName: string;
  mrn: string;
  amount: number;
  refundMethod: string;
  externalReference?: string;
  executedById: string;
  executedByName: string;
  executedByRole: string;
  executedAt: string;
  notes?: string;
  createdAt: string;
}

export interface PatientAccountSummary {
  patientId: string;
  patientName: string;
  mrn: string;
  totalInvoiced: number;
  totalPaid: number;
  totalOutstanding: number;
  totalUnallocatedCredit: number;
  netBalance: number;
  invoices: BillInvoice[];
  payments: Payment[];
  refundRequests: RefundRequest[];
}

export interface BillableItem {
  id: string;
  sourceType: 'tariff' | 'dispensing';
  sourceId: string;
  code?: string;
  name: string;
  category: string;
  unitPrice: number | null;
  isUnconfigured: boolean;
  quantityAvailable: number;
  dispenseNumber?: string;
  batchNumber?: string;
  expiryDate?: string;
  prescriptionId?: string;
  unit?: string;
}

export interface DailyCollectionReport {
  reportDate: string;
  startDate: string;
  endDate: string;
  totalCollected: number;
  totalRefunded?: number;
  netCollection?: number;
  byMethod: Record<PaymentMethod, number>;
  paymentCount: number;
  payments: Payment[];
}

export interface OutstandingReceivablesReport {
  reportDate: string;
  totalOutstanding: number;
  invoiceCount: number;
  agingBuckets: {
    current: number;
    days31_60: number;
    days61_90: number;
    over90: number;
  };
  items: Array<{
    invoiceId: string;
    invoiceNumber: string;
    patientId?: string;
    patientName: string;
    mrn: string;
    issueDate: string;
    dueDate?: string;
    totalAmount: number;
    paidAmount: number;
    balance: number;
    daysOverdue: number;
    bucket: 'current' | '31-60' | '61-90' | '90+';
  }>;
}

export type AuditCategory =
  | 'EMR Access'
  | 'Medication Dispense'
  | 'Lab Release'
  | 'Billing Clearance'
  | 'Payment Recorded'
  | 'Payment Allocated'
  | 'Refund Requested'
  | 'Refund Approved'
  | 'Refund Rejected'
  | 'Invoice Issued'
  | 'Invoice Voided'
  | 'Patient Deletion'
  | 'Appointment Scheduled'
  | 'Reception Operations'
  | 'RBAC Change'
  | 'Triage Admission'
  | 'Bed Transfer'
  | 'Tariff Configuration'
  | 'Service Configuration'
  | 'Rate Configuration'
  | 'Service Catalogue'
  | 'Clinical Operations'
  | 'Emergency Escalation'
  | 'Investigations'
  | 'Prescriptions'
  | 'Ayurveda'
  | string;

export interface ClinicalAuditLog {
  id: string;
  timestamp: string;
  actor: string;
  role: string;
  action: string;
  category: AuditCategory;
  patientMrn?: string;
  details: string;
}

// ==========================================
// AYURVEDIC CLINICAL & OPERATIONS DOMAIN
// ==========================================

export type PrakritiType = 'Vata' | 'Pitta' | 'Kapha' | 'Vata-Pitta' | 'Pitta-Kapha' | 'Vata-Kapha' | 'Tridoshic (Sama)';
export type AgniType = 'Sama (Balanced)' | 'Tikshna (Intense/Sharp)' | 'Manda (Sluggish)' | 'Vishama (Irregular)';
export type AmaLevel = 'Nirama (No toxins)' | 'Alpa (Mild)' | 'Madhyama (Moderate)' | 'Teevra (Severe)';
export type KoshthaType = 'Krura (Hard / Constipated)' | 'Madhyama (Moderate / Regular)' | 'Mridu (Soft / Sensitive)';
export type NidraQuality = 'Samyak (Sound/Restful)' | 'Alpanidra (Insomnia / Fragmented)' | 'Atinidra (Excessive Somnolence)';

export interface AyurvedicAssessment {
  prakriti: {
    vata: number; // percentage 0-100
    pitta: number;
    kapha: number;
    dominant: PrakritiType;
  };
  vikriti: {
    vata: number;
    pitta: number;
    kapha: number;
    primaryImbalance: string; // e.g. "Pitta-Vata aggravation in Asthi & Majja dhatus"
  };
  agni: AgniType;
  ama: AmaLevel;
  koshtha: KoshthaType;
  nadi: string; // Pulse diagnosis e.g. "Vata-Pitta pulsatile, Sarpa gati with occasional Hamsa gati"
  jihva: string; // Tongue observation e.g. "Pale pink with thick white Ama coating on posterior third"
  nidra: NidraQuality;
  ahara: string; // Diet habits e.g. "Irregular meal timings, spicy/fried food excess, low hydration"
  vihara: string; // Lifestyle e.g. "Sedentary software desk job, nocturnal sleep deprivation"
  recordedAt: string;
}

export interface DoshaProfile {
  prakriti: {
    vata: number; // percentage 0-100
    pitta: number;
    kapha: number;
    dominant: PrakritiType;
  };
  vikriti: {
    vata: number; // active aggravation level 0-100
    pitta: number;
    kapha: number;
    primaryImbalance: string;
    severity?: 'Mild' | 'Moderate' | 'Severe';
  };
  subdoshas?: {
    vata?: string[];
    pitta?: string[];
    kapha?: string[];
  };
  assessmentDate: string;
  assessedByVaidya: string;
  clinicalObservations?: string;
  recommendedHerbs?: string[];
  dietaryGuidance?: string;
}

export interface Consultation {
  id: string;
  consultationNumber: string; // e.g. "CON-2026-042"
  patientId: string;
  patientName: string;
  patientMrn: string;
  doctorId: string;
  doctorName: string;
  appointmentId?: string;
  dateTime: string;
  chiefComplaint: string;
  duration: string;
  presentIllness: string;
  vitals?: Vitals;
  ayurvedicAssessment: AyurvedicAssessment;
  classicalDiagnosis: string; // e.g. "Sandhigata Vata (Osteoarthritis) with Sama Agni"
  westernCorrelation?: string;
  treatmentRecommendations: string;
  recommendedTherapies: string[]; // e.g. ["Abhyanga with Sahacharadi", "Janu Basti"]
  prescriptions: string[];
  status: 'pending' | 'in_progress' | 'completed';
  clinicalNotes: string;
  completedAt?: string;
}

export type TherapyType =
  | 'Abhyanga (Herbal Full Body Massage)'
  | 'Shirodhara (Continuous Medicated Oil Pouring)'
  | 'Pizhichil (Royal Medicated Oil Bath)'
  | 'Kizhi / Patra Pinda Sweda (Herbal Bolus)'
  | 'Kati Basti (Medicated Oil Retention - Spine)'
  | 'Janu Basti (Medicated Oil Retention - Knees)'
  | 'Greeva Basti (Medicated Oil Retention - Cervical)'
  | 'Udvartana (Herbal Powder Exfoliation)'
  | 'Takradhara (Medicated Buttermilk Pouring)'
  | 'Karna Poorana (Ear Cleansing & Oil Filling)';

export interface TreatmentPlan {
  id: string;
  planNumber: string; // e.g. "TP-2026-031"
  encounterId?: string;
  patientId: string;
  patientName: string;
  patientMrn: string;
  doctorId: string;
  doctorName: string;
  practitionerRole?: string;
  assignedTherapist: string;
  therapyType: TherapyType;
  clinicalObjective: string;
  oilOrFormulation: string; // e.g. "Sahacharadi Thailam + Ksheerabala 101"
  totalSessions: number;
  completedSessions: number;
  frequency: 'Daily' | 'Alternate Days' | 'Twice Weekly' | 'Weekly' | string;
  startDate: string;
  endDate: string;
  roomNumber: string; // e.g. "Therapy Room 02"
  status: 'planned' | 'active' | 'completed' | 'paused' | 'cancelled';
  instructions?: string;
  notes: string;
  lastSessionDate?: string;
  sessions?: TherapySession[];
}

export type PanchakarmaProtocol =
  | 'Vamana (Therapeutic Emesis - Kapha Elimination)'
  | 'Virechana (Therapeutic Purgation - Pitta Cleansing)'
  | 'Basti (Medicated Decoction/Oil Enema - Vata Balance)'
  | 'Nasya (Nasal Medication - Urdhvajatru Disorders)'
  | 'Raktamokshana (Leech / Bloodletting Purification)';

export interface PanchakarmaDailySession {
  day: number;
  date: string;
  phase: 'Purvakarma (Prep/Snehana-Swedana)' | 'Pradhanakarma (Main Procedure)' | 'Paschatkarma (Dietary Samsarjana)';
  procedureName: string;
  therapist: string;
  bloodPressure: string;
  pulseRate: string;
  appetiteAssessment: string;
  bowelStatus: string;
  observations: string;
  status: 'completed' | 'in_progress' | 'scheduled';
}

export type TherapyRoomType =
  | 'MASSAGE_DRONI_ROOM'
  | 'SHIRODHARA_ROOM'
  | 'SWEDANA_STEAM_ROOM'
  | 'PANCHAKARMA_PROCEDURE_ROOM';

export type RoomOperationalStatus =
  | 'AVAILABLE'
  | 'OCCUPIED'
  | 'SANITIZING'
  | 'MAINTENANCE';

export type SessionExecutionStatus =
  | 'SCHEDULED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'NO_SHOW'
  | 'ABORTED';

export type PanchakarmaPhase =
  | 'PURVAKARMA'
  | 'PRADHANAKARMA'
  | 'PASCHATKARMA'
  | 'COMPLETED';

export type SessionBillingMode =
  | 'PER_SESSION'
  | 'PACKAGE_COVERED'
  | 'UNBILLED';

export type PanchakarmaBillingMode =
  | 'PER_SESSION'
  | 'PACKAGE_BILLED';

export interface TherapyRoom {
  id: string;
  code: string;
  roomCode?: string;
  name: string;
  roomType: TherapyRoomType;
  status: RoomOperationalStatus;
  operationalStatus?: RoomOperationalStatus;
  departmentId?: string | null;
  bufferMinutes?: number | null;
  turnaroundBufferMinutes?: number | null;
  description?: string | null;
  lastSanitizedAt?: string | null;
  currentSessionId?: string | null;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface PreProcedureAssessment {
  recordedById?: string;
  recordedByName?: string;
  recordedAt?: string;
  pulseRate?: string;
  bloodPressure?: string;
  temperature?: string;
  agniStatus?: string;
  koshthaStatus?: string;
  generalObservations?: string;
  clinicalClearance?: boolean;
  clearanceNotes?: string;
  bpSystolic?: number;
  bpDiastolic?: number;
  heartRate?: number;
  vaidyaClearanceConfirmed?: boolean;
  clinicalNotes?: string;
}

export interface PostProcedureAssessment {
  recordedById?: string;
  recordedByName?: string;
  recordedAt?: string;
  pulseRate?: string;
  bloodPressure?: string;
  patientTolerance: string;
  sweatingResponse?: string;
  procedureNotes: string;
  clinicalObservations?: string;
  adverseSymptomsReported?: boolean;
  adverseEventDetails?: string;
  bpSystolic?: number;
  bpDiastolic?: number;
  heartRate?: number;
  complications?: string;
}

export interface TherapySession {
  id: string;
  sessionNumber: number;
  sessionRef: string;
  patientId: string;
  patientName?: string;
  patientMrn?: string;
  patient?: any;
  treatmentPlanId?: string | null;
  panchakarmaCourseId?: string | null;
  therapyType?: string;
  roomId?: string | null;
  room?: any;
  roomCodeSnapshot: string;
  roomNameSnapshot: string;
  administeringStaffId: string;
  administeringStaffName?: string;
  administeringStaff?: any;
  responsibleVaidyaId: string;
  responsibleVaidyaName?: string;
  responsibleVaidya?: any;
  scheduledStartAt: string;
  scheduledEndAt: string;
  scheduledStartTime?: string;
  scheduledEndTime?: string;
  actualStartAt?: string | null;
  completedAt?: string | null;
  status: SessionExecutionStatus;
  executionStatus?: SessionExecutionStatus;
  preProcedureAssessment?: PreProcedureAssessment | null;
  postProcedureAssessment?: PostProcedureAssessment | null;
  clinicalNotes?: string | null;
  cancellationReason?: string | null;
  tariffId?: string | null;
  billableAmount?: number | null;
  billingMode: SessionBillingMode;
  isBilled: boolean;
  invoiceId?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface PanchakarmaPhaseTransition {
  id: string;
  courseId: string;
  previousPhase: PanchakarmaPhase;
  newPhase: PanchakarmaPhase;
  authorizedById: string;
  authorizedByName: string;
  authorizedAt: string;
  clinicalRationale: string;
  dietaryTransitionNotes?: string | null;
  nextProcedureInstructions?: string | null;
  createdAt?: string;
}

export interface StaffTherapyAuthorization {
  id: string;
  staffId: string;
  approvedQualification: string;
  authorizedTherapyTypes?: string[] | null;
  verifiedById: string;
  verifiedByName: string;
  verifiedAt: string;
  isRevoked: boolean;
  revokedAt?: string | null;
  revokedById?: string | null;
  revokedByName?: string | null;
  revocationReason?: string | null;
  expiresAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface PanchakarmaCourse {
  id: string;
  courseNumber: string; // e.g. "PK-2026-014"
  referralId?: string | null;
  patientId: string;
  patientName: string;
  patientMrn: string;
  vaidyaName: string;
  responsibleVaidyaId?: string | null;
  protocol: PanchakarmaProtocol;
  currentPhase: 'Purvakarma (Prep/Snehana-Swedana)' | 'Pradhanakarma (Main Procedure)' | 'Paschatkarma (Dietary Samsarjana)';
  startDate: string;
  expectedEndDate: string;
  startDateActual?: string | null;
  completedAt?: string | null;
  pausedAt?: string | null;
  pauseReason?: string | null;
  terminatedAt?: string | null;
  terminationReason?: string | null;
  totalDays: number;
  completedDays: number;
  dietaryPrescription: string; // e.g. "Peya (Thin rice gruel) -> Vilepi (Thick gruel) -> Yusha (Lentil soup) Samsarjana Krama"
  status: 'Planned' | 'Active' | 'Completed' | 'Cancelled' | 'Paused' | 'Terminated';
  billingMode?: PanchakarmaBillingMode;
  packageTariffId?: string | null;
  packageInvoiceId?: string | null;
  isPackageBilled?: boolean;
  dailySessions: PanchakarmaDailySession[];
  dischargeNotes?: string;
  sessions?: TherapySession[];
  phaseTransitions?: PanchakarmaPhaseTransition[];
}

export interface StockMovement {
  id: string;
  timestamp: string;
  medicineId: string;
  medicineName: string;
  batchNumber: string;
  type: 'Purchase Receipt' | 'Dispensed to Patient' | 'Dispense' | 'Receipt' | 'Audit Adjustment' | 'Correction' | 'Damaged / Expired Removal' | 'Returned to Supplier' | 'Expiry Discard' | 'Internal Transfer' | string;
  quantityDelta: number; // positive or negative
  remainingQuantity: number;
  actor: string;
  actorId?: string;
  actorRole?: string;
  referenceNumber: string;
  reason?: string;
  notes: string;
  createdAt?: string;
}

export interface PharmacySupplier {
  id: string;
  name: string;
  contactPerson: string;
  phone: string;
  email: string;
  gmpCertified: boolean;
  categoriesSupplied: string[];
  leadTimeDays: number;
  paymentTerms: string;
}

export interface HospitalOverviewMetrics {
  totalPatientsToday: number;
  activeConsultationsToday?: number;
  scheduledAppointmentsToday: number;
  activeTreatments: number;
  activePanchakarmaCourses: number;
  activeDoctorsOnDuty: number;
  criticalLabAlerts: number;
  pendingPrescriptions: number;
  todayRevenueInr: number;
  erWaitTimeMinutes?: number;
  occupiedBeds?: number;
  totalBeds?: number;
  occupancyRate?: number;
  admittedToday?: number;
  dischargedToday?: number;
}

// ==========================================
// RBAC DEFINITIONS
// ==========================================

export interface AppUser {
  id: string;
  name: string;
  role: UserRole;
  title: string;
  email: string;
  department: string;
  patientMrn?: string;
  avatarInitials: string;
  status?: 'active' | 'pending_activation' | 'inactive';
  activationPin?: string;
}

export interface RolePermissions {
  // Patient Records
  canViewAllPatients: boolean;
  canViewOwnPatientRecordOnly: boolean;
  canCreatePatient: boolean;
  canEditPatient: boolean;
  canDeletePatient: boolean;

  // Appointments
  canViewAllAppointments: boolean;
  canViewOwnAppointmentsOnly: boolean;
  canScheduleAppointment: boolean;
  canRescheduleAppointment: boolean;
  canCancelAppointment: boolean;
  canSendReminders: boolean;

  // Clinical / Triage / Beds
  canManageTriage: boolean;
  canManageBeds: boolean;
  canOrderLabs: boolean;
  canEnterLabResults: boolean;
  canWritePrescription: boolean;
  canDispenseMedication: boolean;

  // Financial / Billing
  canViewBilling: boolean;
  canGenerateInvoice: boolean;
  canCollectPayment: boolean;

  // Administration & Governance
  canViewAuditTrail: boolean;
  canManageRBAC: boolean;
  canReorderStock: boolean;
  canManageStaff?: boolean;
  canManageTariffs?: boolean;
  canReviewLabReports?: boolean;

  // Ayurvedic Care & Insights
  canConductConsultation?: boolean;
  canManageTreatments?: boolean;
  canManagePanchakarma?: boolean;
  canViewReports?: boolean;
}

export type StaffRole = UserRole;

export type StaffStatus = 'on_duty' | 'active' | 'on_leave' | 'inactive' | 'pending_activation' | 'suspended' | 'archived';

export interface StaffMember {
  id: string;
  employeeId: string; // e.g. "STF-2026-10001"
  name: string;
  role: UserRole;
  designation: string;
  department: string;
  email: string;
  phone: string;
  licenseNumber?: string | null;
  status: StaffStatus;
  shift?: string | null;
  qualification?: string | null;
  joiningDate?: string | null;
  dateOfJoining?: string | null;
  address?: string | null;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
  employmentType?: string | null; // Full-Time, Part-Time, Consultant, Visiting, Contract
  reportingTo?: string | null;
  discipline?: string | null; // Ayurveda, Modern Medicine, Pharmacy, Administration, Finance, Front Desk
  specialty?: string | null;
  userId?: string | null;
  activationPin?: string | null;
  activationPinHash?: string | null;
  pinExpiresAt?: string | null;
  pinAttempts?: number;
  isSuspended?: boolean;
  suspendedAt?: string | null;
  suspendedById?: string | null;
  suspendedByName?: string | null;
  suspendedReason?: string | null;
  archivedAt?: string | null;
  archivedById?: string | null;
  archivedByName?: string | null;
  archivedReason?: string | null;
  createdById?: string | null;
  createdByName?: string | null;
  createdAt?: string;
  updatedAt?: string;
  notes?: string | null;
  primaryDepartmentId?: string | null;
  primaryDepartment?: Department | null;
}

export interface PractitionerCredentials {
  qualification: string | null;
  discipline: string | null;
  university: string | null;
  registrationCouncil: string | null;
  registrationNumber: string | null;
  registrationDate: string | null;
  registrationExpiryDate: string | null;
  supportingCertificate: string | null;
  updatedAt?: string | null;
}

// ============================================================================
// PHASE 6B: HOSPITAL CONFIGURATION & DEPARTMENT MANAGEMENT DOMAIN MODELS
// ============================================================================

export type DepartmentDiscipline = 'AYURVEDA' | 'MODERN_MEDICINE' | 'OPERATIONAL' | 'ALLIED';

export type AssignmentStatus = 'active' | 'completed' | 'transferred' | 'revoked';

export interface HospitalProfile {
  id: string;
  singletonKey: string;
  code: string;
  legalName: string;
  displayName: string;
  tagline?: string | null;
  registrationNumber?: string | null;
  taxIdentificationNumber?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  country: string;
  timezone: string;
  currency: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface Department {
  id: string;
  code: string;
  name: string;
  discipline: DepartmentDiscipline;
  description?: string | null;
  isActive: boolean;
  deactivatedAt?: string | null;
  deactivationReason?: string | null;
  createdAt: string;
  updatedAt: string;
  activeAssignmentsCount?: number;
}

export interface StaffDepartmentAssignment {
  id: string;
  staffId: string;
  departmentId: string;
  isPrimary: boolean;
  roleTitle?: string | null;
  status: AssignmentStatus;
  startDate: string;
  endDate?: string | null;
  revocationReason?: string | null;
  assignedById?: string | null;
  assignedByName?: string | null;
  revokedById?: string | null;
  revokedByName?: string | null;
  createdAt: string;
  updatedAt: string;
  department?: Department;
  staffMember?: StaffMember;
}

export const ROLE_PERMISSIONS: Record<UserRole, RolePermissions> = {
  SUPER_ADMIN: {
    canViewAllPatients: true,
    canViewOwnPatientRecordOnly: false,
    canCreatePatient: true,
    canEditPatient: true,
    canDeletePatient: true,
    canViewAllAppointments: true,
    canViewOwnAppointmentsOnly: false,
    canScheduleAppointment: true,
    canRescheduleAppointment: true,
    canCancelAppointment: true,
    canSendReminders: true,
    canManageTriage: true,
    canManageBeds: true,
    canOrderLabs: true,
    canEnterLabResults: true,
    canReviewLabReports: true,
    canWritePrescription: true,
    canDispenseMedication: true,
    canViewBilling: true,
    canGenerateInvoice: true,
    canCollectPayment: true,
    canViewAuditTrail: true,
    canManageRBAC: true,
    canReorderStock: true,
    canManageStaff: true,
    canManageTariffs: true, // EXCLUSIVE TO SUPER_ADMIN
    canConductConsultation: true,
    canManageTreatments: true,
    canManagePanchakarma: true,
    canViewReports: true
  },
  ADMIN: {
    canViewAllPatients: true,
    canViewOwnPatientRecordOnly: false,
    canCreatePatient: true,
    canEditPatient: true,
    canDeletePatient: false, // Protected: Only SUPER_ADMIN can delete patient records
    canViewAllAppointments: true,
    canViewOwnAppointmentsOnly: false,
    canScheduleAppointment: true,
    canRescheduleAppointment: true,
    canCancelAppointment: true,
    canSendReminders: true,
    canManageTriage: true,
    canManageBeds: true,
    canOrderLabs: true,
    canEnterLabResults: true,
    canReviewLabReports: true,
    canWritePrescription: true,
    canDispenseMedication: true,
    canViewBilling: true,
    canGenerateInvoice: true,
    canCollectPayment: true,
    canViewAuditTrail: true,
    canManageRBAC: true,
    canReorderStock: true,
    canManageStaff: true,
    canManageTariffs: false, // Exclusively restricted to SUPER_ADMIN
    canConductConsultation: true,
    canManageTreatments: true,
    canManagePanchakarma: true,
    canViewReports: true
  },
  DOCTOR: {
    canViewAllPatients: true,
    canViewOwnPatientRecordOnly: false,
    canCreatePatient: true,
    canEditPatient: true,
    canDeletePatient: false,
    canViewAllAppointments: true,
    canViewOwnAppointmentsOnly: false,
    canScheduleAppointment: true,
    canRescheduleAppointment: true,
    canCancelAppointment: true,
    canSendReminders: true,
    canManageTriage: true,
    canManageBeds: true,
    canOrderLabs: true,
    canEnterLabResults: true,
    canReviewLabReports: true,
    canWritePrescription: true,
    canDispenseMedication: false, // Pharmacist handles dispensing
    canViewBilling: false,
    canGenerateInvoice: false,
    canCollectPayment: false,
    canViewAuditTrail: false,
    canManageRBAC: false,
    canReorderStock: false,
    canManageStaff: false,
    canManageTariffs: false,
    canConductConsultation: true,
    canManageTreatments: false, // Vaidya handles Ayurvedic therapies
    canManagePanchakarma: false, // Vaidya handles Panchakarma
    canViewReports: true
  },
  VAIDYA: {
    canViewAllPatients: true,
    canViewOwnPatientRecordOnly: false,
    canCreatePatient: true,
    canEditPatient: true,
    canDeletePatient: false,
    canViewAllAppointments: true,
    canViewOwnAppointmentsOnly: false,
    canScheduleAppointment: true,
    canRescheduleAppointment: true,
    canCancelAppointment: true,
    canSendReminders: true,
    canManageTriage: false, // Doctor / Emergency staff handles triage
    canManageBeds: true,
    canOrderLabs: true,
    canEnterLabResults: false,
    canReviewLabReports: true,
    canWritePrescription: true, // Ayurvedic formulations & herbal medications
    canDispenseMedication: false,
    canViewBilling: false,
    canGenerateInvoice: false,
    canCollectPayment: false,
    canViewAuditTrail: false,
    canManageRBAC: false,
    canReorderStock: false,
    canManageStaff: false,
    canManageTariffs: false,
    canConductConsultation: true, // Ayurvedic clinical assessment, Prakriti/Vikriti, Nadi
    canManageTreatments: true, // Ayurvedic treatment plans (Abhyanga, Kizhi, etc.)
    canManagePanchakarma: true, // Classical Panchakarma protocols & daily sessions
    canViewReports: true
  },
  RECEPTIONIST: {
    canViewAllPatients: true,
    canViewOwnPatientRecordOnly: false,
    canCreatePatient: true,
    canEditPatient: true,
    canDeletePatient: false,
    canViewAllAppointments: true,
    canViewOwnAppointmentsOnly: false,
    canScheduleAppointment: true,
    canRescheduleAppointment: true,
    canCancelAppointment: true,
    canSendReminders: true,
    canManageTriage: true,
    canManageBeds: true,
    canOrderLabs: false,
    canEnterLabResults: false,
    canReviewLabReports: false,
    canWritePrescription: false,
    canDispenseMedication: false,
    canViewBilling: false,
    canGenerateInvoice: false,
    canCollectPayment: false,
    canViewAuditTrail: false,
    canManageRBAC: false,
    canReorderStock: false,
    canManageStaff: false,
    canManageTariffs: false,
    canConductConsultation: false,
    canManageTreatments: false,
    canManagePanchakarma: false,
    canViewReports: false
  },
  PHARMACIST: {
    canViewAllPatients: true,
    canViewOwnPatientRecordOnly: false,
    canCreatePatient: false,
    canEditPatient: false,
    canDeletePatient: false,
    canViewAllAppointments: false,
    canViewOwnAppointmentsOnly: false,
    canScheduleAppointment: false,
    canRescheduleAppointment: false,
    canCancelAppointment: false,
    canSendReminders: false,
    canManageTriage: false,
    canManageBeds: false,
    canOrderLabs: false,
    canEnterLabResults: false,
    canReviewLabReports: false,
    canWritePrescription: false,
    canDispenseMedication: true, // Core role capability
    canViewBilling: false,
    canGenerateInvoice: false,
    canCollectPayment: false,
    canViewAuditTrail: false,
    canManageRBAC: false,
    canReorderStock: true, // Pharmacy stock management
    canManageStaff: false,
    canManageTariffs: false,
    canConductConsultation: false,
    canManageTreatments: false,
    canManagePanchakarma: false,
    canViewReports: false
  },
  ACCOUNTANT: {
    canViewAllPatients: true,
    canViewOwnPatientRecordOnly: false,
    canCreatePatient: false,
    canEditPatient: false,
    canDeletePatient: false,
    canViewAllAppointments: false,
    canViewOwnAppointmentsOnly: false,
    canScheduleAppointment: false,
    canRescheduleAppointment: false,
    canCancelAppointment: false,
    canSendReminders: false,
    canManageTriage: false,
    canManageBeds: false,
    canOrderLabs: false,
    canEnterLabResults: false,
    canReviewLabReports: false,
    canWritePrescription: false,
    canDispenseMedication: false,
    canViewBilling: true, // Core role capability
    canGenerateInvoice: true, // Core role capability
    canCollectPayment: true, // Core role capability
    canViewAuditTrail: false,
    canManageRBAC: false,
    canReorderStock: false,
    canManageStaff: false,
    canManageTariffs: false,
    canConductConsultation: false,
    canManageTreatments: false,
    canManagePanchakarma: false,
    canViewReports: true // Financial reports
  }
};
