import React, { useState } from 'react';
import {
  X,
  User,
  Heart,
  Activity,
  AlertTriangle,
  Pill,
  TestTube,
  CreditCard,
  FileDown,
  ShieldCheck,
  Calendar,
  UserPlus,
  History,
  Phone,
  Mail,
  MapPin,
  Clock,
  Sparkles,
  PenTool,
  Edit,
  Download,
  Flame
} from 'lucide-react';
import { CarbonButton } from '../carbon/CarbonButton';
import { CarbonTag, CarbonTagType } from '../carbon/CarbonTag';
import { CarbonTabs } from '../carbon/CarbonTabs';
import {
  Patient,
  AdmissionStatus,
  UserRole,
  ROLE_PERMISSIONS,
  Prescription,
  LabOrder,
  TreatmentPlan,
  PanchakarmaCourse,
  Consultation,
  DoshaProfile as DoshaProfileType,
  PatientDossier
} from '../../types/hospital';
import { hospitalApiClient } from '../../services/hospitalApi';
import { VitalTrendChart } from '../charts/VitalTrendChart';
import { VitalHistorySummary } from '../VitalHistorySummary';
import { generatePatientSummaryPDF } from '../../services/clinicalPdfGenerator';
import { DoshaProfile } from '../ayurveda/DoshaProfile';

interface PatientDossierModalProps {
  isOpen: boolean;
  onClose: () => void;
  patient: Patient | null;
  currentUserRole: UserRole;
  currentUserName?: string;
  prescriptions?: Prescription[];
  labOrders?: LabOrder[];
  treatmentPlans?: TreatmentPlan[];
  panchakarmaCourses?: PanchakarmaCourse[];
  consultations?: Consultation[];
  onOpenEditPatientModal?: (patient: Patient) => void;
  onOpenScheduleModal?: (patient: Patient) => void;
  onOpenAdmitPatient?: (patient: Patient) => void;
  onOpenPrescriptionModal?: (patient: Patient) => void;
  onOpenLabModal?: (patient: Patient) => void;
  onOpenBillingModal?: (patient: Patient) => void;
  onUpdateDoshaProfile?: (patientId: string, updatedProfile: DoshaProfileType) => void;
  onNotify?: (title: string, subtitle?: string, kind?: 'info' | 'success' | 'warning' | 'error') => void;
}

export const PatientDossierModal: React.FC<PatientDossierModalProps> = ({
  isOpen,
  onClose,
  patient,
  currentUserRole,
  currentUserName,
  prescriptions = [],
  labOrders = [],
  treatmentPlans = [],
  panchakarmaCourses = [],
  consultations = [],
  onOpenEditPatientModal,
  onOpenScheduleModal,
  onOpenAdmitPatient,
  onOpenPrescriptionModal,
  onOpenLabModal,
  onOpenBillingModal,
  onUpdateDoshaProfile,
  onNotify
}) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'appointments' | 'prescriptions' | 'labs' | 'panchakarma' | 'billing' | 'activity' | 'vitals' | 'dosha'>('overview');
  const [vitalsMode, setVitalsMode] = useState<'chart' | 'table'>('chart');
  const [internalPatient, setInternalPatient] = useState<Patient | null>(patient);
  const [dossier, setDossier] = useState<PatientDossier | null>(null);

  React.useEffect(() => {
    setInternalPatient(patient);
    if (patient && isOpen) {
      hospitalApiClient.getPatientDossier(patient.id || patient.mrn)
        .then((res: PatientDossier | null) => {
          if (res) {
            setDossier(res);
            if (res.patient) setInternalPatient(res.patient);
          }
        })
        .catch(() => {});
    }
  }, [patient, isOpen]);

  if (!isOpen || !patient) return null;

  const currentPatient = internalPatient || patient;

  const permissions = ROLE_PERMISSIONS[currentUserRole];

  const patientAppointments = dossier?.appointments ?? [];
  const patientConsultations = dossier?.consultations ?? consultations.filter(
    (c) => c.patientId === patient.id || c.patientMrn === patient.mrn
  );
  const patientPrescriptions = dossier?.prescriptions ?? prescriptions.filter(
    (p) => p.patientId === patient.id || p.mrn === patient.mrn
  );
  const patientLabs = dossier?.labOrders ?? labOrders.filter(
    (l) => l.patientId === patient.id || l.mrn === patient.mrn
  );
  const patientTreatments = dossier?.treatmentPlans ?? treatmentPlans.filter(
    (t) => t.patientId === patient.id || t.patientMrn === patient.mrn
  );
  const patientCourses = dossier?.panchakarmaCourses ?? panchakarmaCourses.filter(
    (pk) => pk.patientId === patient.id || pk.patientMrn === patient.mrn
  );
  const patientInvoices = dossier?.invoices ?? [];
  const patientStockMovements = dossier?.stockMovements ?? [];
  const patientAuditLogs = dossier?.auditLogs ?? [];

  const getStatusTag = (status: AdmissionStatus): { type: CarbonTagType; label: string } => {
    switch (status) {
      case 'inpatient':
        return { type: 'blue', label: 'INPATIENT' };
      case 'er':
        return { type: 'red', label: 'EMERGENCY' };
      case 'outpatient':
        return { type: 'teal', label: 'OUTPATIENT' };
      case 'consultation':
        return { type: 'purple', label: 'CONSULTATION' };
      case 'active_treatment':
        return { type: 'green', label: 'ACTIVE TREATMENT' };
      case 'discharged':
      default:
        return { type: 'cool-gray', label: 'DISCHARGED' };
    }
  };

  const handleSaveDosha = (updatedProfile: DoshaProfileType) => {
    const updatedPatient: Patient = {
      ...currentPatient,
      doshaProfile: updatedProfile
    };
    setInternalPatient(updatedPatient);
    if (onUpdateDoshaProfile) {
      onUpdateDoshaProfile(currentPatient.id, updatedProfile);
    }
    if (onNotify) {
      onNotify(
        'Dosha Assessment Documented',
        `Prakriti: ${updatedProfile.prakriti.dominant} &bull; Vikriti: ${updatedProfile.vikriti.primaryImbalance}`,
        'success'
      );
    }
  };

  const handleQuickExportPdf = () => {
    const doc = generatePatientSummaryPDF({
      patient: currentPatient,
      consultations,
      treatments: treatmentPlans,
      panchakarma: panchakarmaCourses,
      prescriptions,
      labOrders
    });
    const safeName = `${currentPatient.firstName}_${currentPatient.lastName}`.replace(/[^a-zA-Z0-9_-]/g, '_');
    const dateStr = new Date().toISOString().split('T')[0];
    doc.save(`SahacharaOS_Clinical_Dossier_${currentPatient.mrn}_${safeName}_${dateStr}.pdf`);
    if (onNotify) {
      onNotify(
        'Official Clinical PDF Exported',
        `Generated accredited medical dossier for ${currentPatient.firstName} ${currentPatient.lastName} (${currentPatient.mrn}).`,
        'success'
      );
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-2xs p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-150">
      <div className="bg-white border border-[#393939] shadow-2xl w-full max-w-5xl my-auto font-sans flex flex-col max-h-[92vh] overflow-hidden">
        {/* Header Bar */}
        <div className="p-4 sm:p-5 bg-[#161616] text-white flex items-start justify-between border-b border-[#393939]">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 bg-[#0f62fe] text-white font-mono font-bold flex items-center justify-center text-sm shrink-0">
              {currentPatient.firstName.charAt(0)}{currentPatient.lastName.charAt(0)}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono text-xs px-2 py-0.5 bg-[#262626] text-[#a6c8ff] border border-[#393939] font-semibold">
                  {currentPatient.mrn}
                </span>
                <CarbonTag type={currentPatient.isRegistered ? 'teal' : 'warm-gray'} size="sm">
                  {currentPatient.isRegistered ? 'REGISTERED PATIENT' : 'UNREGISTERED INTAKE'}
                </CarbonTag>
                <CarbonTag type={getStatusTag(currentPatient.admissionStatus).type} size="sm">
                  {getStatusTag(currentPatient.admissionStatus).label}
                </CarbonTag>
              </div>

              <h2 className="text-xl sm:text-2xl font-semibold text-white tracking-tight mt-1">
                {currentPatient.firstName} {currentPatient.lastName}
              </h2>

              <div className="text-xs text-[#c6c6c6] mt-0.5 flex items-center gap-2 flex-wrap">
                <span>{currentPatient.age} yrs</span> &bull;
                <span>{currentPatient.gender}</span> &bull;
                <span>Blood Group: <strong className="font-mono text-white">{currentPatient.bloodGroup}</strong></span> &bull;
                <span>Attending: <strong className="text-white">{currentPatient.assignedDoctorName || 'Unassigned'}</strong></span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {onOpenEditPatientModal && permissions.canEditPatient && (
              <button
                onClick={() => onOpenEditPatientModal(currentPatient)}
                className="p-2 text-[#c6c6c6] hover:text-white hover:bg-[#262626] transition-colors cursor-pointer"
                title="Edit Patient Details"
              >
                <Edit className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={onClose}
              className="p-2 text-[#c6c6c6] hover:text-white hover:bg-[#262626] transition-colors cursor-pointer"
              title="Close Dossier"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="bg-[#f4f4f4] border-b border-[#e0e0e0] px-4 pt-1">
          <CarbonTabs
            selectedId={activeTab}
            onSelect={(id) => setActiveTab(id as any)}
            tabs={[
              { id: 'overview', label: 'Demographics & Medical Record' },
              { id: 'appointments', label: 'Appointments & Consultations', count: patientAppointments.length + patientConsultations.length },
              { id: 'prescriptions', label: 'Prescriptions & Dispensing', count: patientPrescriptions.length },
              { id: 'labs', label: 'Diagnostic Lab Orders', count: patientLabs.length },
              { id: 'panchakarma', label: 'Ayurveda & Panchakarma', count: patientCourses.length + patientTreatments.length },
              { id: 'billing', label: 'Invoices & Billing', count: patientInvoices.length },
              { id: 'activity', label: 'Audit Timeline', count: patientAuditLogs.length },
              { id: 'dosha', label: 'Dosha Assessment' },
              { id: 'vitals', label: 'Vitals & Trend Analysis' }
            ]}
          />
        </div>

        {/* Tab Content Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-4 text-xs flex-1">
          {/* TAB 1: OVERVIEW & DEMOGRAPHICS */}
          {activeTab === 'overview' && (
            <div className="space-y-4">
              {/* Top Demographic Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3 bg-[#f4f4f4] border border-[#e0e0e0] space-y-1">
                  <div className="text-[10px] uppercase font-mono text-[#525252]">Contact Phone & Email</div>
                  <div className="font-mono text-xs font-semibold text-[#161616]">{patient.phone}</div>
                  <div className="text-[11px] text-[#525252] truncate">{patient.email || 'N/A'}</div>
                </div>

                <div className="p-3 bg-[#f4f4f4] border border-[#e0e0e0] space-y-1">
                  <div className="text-[10px] uppercase font-mono text-[#525252]">Primary Contact</div>
                  <div className="font-semibold text-xs text-[#161616]">{patient.emergencyContact?.name}</div>
                  <div className="text-[11px] text-[#525252]">{patient.emergencyContact?.relationship} &bull; {patient.emergencyContact?.phone}</div>
                </div>

                <div className="p-3 bg-[#f4f4f4] border border-[#e0e0e0] space-y-1">
                  <div className="text-[10px] uppercase font-mono text-[#525252]">Residential Address</div>
                  <div className="text-xs text-[#161616] leading-relaxed line-clamp-2">{patient.address || 'Address on file'}</div>
                </div>
              </div>

              {/* Documented Allergies Alert */}
              <div className="p-3.5 bg-[#fff1f1] border border-[#ffb3b8]">
                <div className="flex items-center gap-1.5 text-[#a2191f] font-semibold text-xs mb-1.5">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>Documented Drug & Environmental Allergies (Safety Alert)</span>
                </div>
                {patient.allergies?.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {patient.allergies.map((allergy) => (
                      <span
                        key={allergy}
                        className="px-2.5 py-1 bg-white border border-[#ffb3b8] text-[#a2191f] font-medium text-xs font-mono"
                      >
                        {allergy}
                      </span>
                    ))}
                  </div>
                ) : (
                  <span className="text-[#525252] text-xs">No known drug allergies reported (NKDA).</span>
                )}
              </div>

              {/* Chronic Conditions & Past Diagnoses */}
              <div className="p-4 bg-white border border-[#e0e0e0] space-y-2">
                <span className="font-semibold text-xs text-[#161616] block">
                  Documented Chronic Conditions & Clinical Diagnoses
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {[...(patient.chronicConditions || []), ...(patient.pastDiagnoses || [])].map((item, i) => (
                    <span
                      key={i}
                      className="px-2.5 py-1 bg-[#f4f4f4] border border-[#e0e0e0] text-[#161616] text-xs font-medium"
                    >
                      {item}
                    </span>
                  ))}
                  {(!patient.chronicConditions?.length && !patient.pastDiagnoses?.length) && (
                    <span className="text-[#8d8d8d]">No past chronic conditions recorded.</span>
                  )}
                </div>
              </div>

              {/* Current Active Medications */}
              <div className="p-4 bg-[#edf5ff] border border-[#a6c8ff] space-y-2">
                <div className="flex items-center gap-1.5 text-[#0043ce] font-semibold text-xs">
                  <Pill className="w-4 h-4" />
                  <span>Current Home & Inpatient Medications</span>
                </div>
                {patient.currentMedications?.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-1">
                    {patient.currentMedications.map((med, idx) => (
                      <div
                        key={idx}
                        className="p-2 bg-white border border-[#a6c8ff] font-mono text-xs text-[#161616]"
                      >
                        {med}
                      </div>
                    ))}
                  </div>
                ) : (
                  <span className="text-[#525252] text-xs">No current home medications recorded.</span>
                )}
              </div>

              {/* Longitudinal Medical History Notes */}
              {patient.medicalHistoryNotes && (
                <div className="p-4 bg-[#f4f4f4] border border-[#e0e0e0] space-y-1.5">
                  <span className="font-semibold text-xs text-[#161616] flex items-center gap-1.5">
                    <History className="w-4 h-4 text-[#525252]" />
                    <span>Longitudinal Clinical Narrative & History</span>
                  </span>
                  <p className="text-xs text-[#525252] leading-relaxed whitespace-pre-line">
                    {patient.medicalHistoryNotes}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: VITALS & TREND ANALYSIS */}
          {activeTab === 'vitals' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between bg-[#f4f4f4] p-3 border border-[#e0e0e0]">
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-[#0f62fe]" />
                  <span className="font-semibold text-xs text-[#161616]">
                    Longitudinal Vitals Surveillance & Historical Readings
                  </span>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setVitalsMode('chart')}
                    className={`px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer rounded-none ${
                      vitalsMode === 'chart'
                        ? 'bg-[#0f62fe] text-white font-semibold'
                        : 'bg-white text-[#525252] border border-[#e0e0e0] hover:bg-[#e0e0e0]'
                    }`}
                  >
                    Vital Trend Chart
                  </button>
                  <button
                    type="button"
                    onClick={() => setVitalsMode('table')}
                    className={`px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer rounded-none ${
                      vitalsMode === 'table'
                        ? 'bg-[#0f62fe] text-white font-semibold'
                        : 'bg-white text-[#525252] border border-[#e0e0e0] hover:bg-[#e0e0e0]'
                    }`}
                  >
                    Time-Series Table
                  </button>
                </div>
              </div>

              {vitalsMode === 'chart' ? (
                <div className="p-4 bg-white border border-[#e0e0e0]">
                  <VitalTrendChart patient={patient} />
                </div>
              ) : (
                <div className="p-4 bg-white border border-[#e0e0e0]">
                  <VitalHistorySummary
                    patient={patient}
                    onExportCsv={() => {
                      if (onNotify) {
                        onNotify(
                          'Vitals Exported',
                          `Chronological vitals exported for ${patient.firstName} ${patient.lastName}`,
                          'success'
                        );
                      }
                    }}
                  />
                </div>
              )}
            </div>
          )}

          {/* TAB 3: ACTIVE PRESCRIPTIONS */}
          {activeTab === 'prescriptions' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-[#e0e0e0]">
                <h3 className="font-semibold text-xs text-[#161616] flex items-center gap-2">
                  <Pill className="w-4 h-4 text-[#0f62fe]" />
                  <span>Verified E-Prescriptions & Pharmacotherapy</span>
                </h3>

                {onOpenPrescriptionModal && permissions.canWritePrescription && (
                  <CarbonButton
                    kind="primary"
                    size="sm"
                    renderIcon={Pill}
                    onClick={() => onOpenPrescriptionModal(patient)}
                  >
                    New Prescription
                  </CarbonButton>
                )}
              </div>

              {patientPrescriptions.length === 0 ? (
                <div className="py-12 text-center text-[#525252] bg-[#f4f4f4] border border-[#e0e0e0]">
                  No active or historical electronic prescriptions found for this patient.
                </div>
              ) : (
                <div className="space-y-2">
                  {patientPrescriptions.map((rx) => (
                    <div
                      key={rx.id}
                      className="p-3 bg-[#fbfbfb] border border-[#e0e0e0] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-semibold text-[#0f62fe]">{rx.rxNumber}</span>
                          <span className="font-semibold text-sm text-[#161616]">{rx.medicationName}</span>
                          <span className="font-mono text-xs px-1.5 py-0.5 bg-[#edf5ff] text-[#0043ce]">{rx.dosage}</span>
                          <CarbonTag type={rx.status === 'dispensed' ? 'green' : 'warm-gray'} size="sm">
                            {rx.status.toUpperCase()}
                          </CarbonTag>
                        </div>
                        <div className="text-[11px] text-[#525252]">
                          {rx.route} &bull; {rx.frequency} &bull; {rx.duration} &bull; Prescribed by: <strong className="text-[#161616]">{rx.doctorName}</strong>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 4: DIAGNOSTIC LAB ORDERS */}
          {activeTab === 'labs' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-[#e0e0e0]">
                <h3 className="font-semibold text-xs text-[#161616] flex items-center gap-2">
                  <TestTube className="w-4 h-4 text-[#0f62fe]" />
                  <span>Clinical Laboratory & Diagnostic Reports</span>
                </h3>

                {onOpenLabModal && permissions.canOrderLabs && (
                  <CarbonButton
                    kind="primary"
                    size="sm"
                    renderIcon={TestTube}
                    onClick={() => onOpenLabModal(patient)}
                  >
                    Order Diagnostic Lab
                  </CarbonButton>
                )}
              </div>

              {patientLabs.length === 0 ? (
                <div className="py-12 text-center text-[#525252] bg-[#f4f4f4] border border-[#e0e0e0]">
                  No diagnostic lab orders recorded for this patient.
                </div>
              ) : (
                <div className="space-y-2">
                  {patientLabs.map((lab) => (
                    <div
                      key={lab.id}
                      className="p-3 bg-[#fbfbfb] border border-[#e0e0e0] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-semibold text-[#0f62fe]">{lab.orderNumber}</span>
                          <span className="font-semibold text-sm text-[#161616]">{lab.testType}</span>
                          <CarbonTag type={lab.priority.startsWith('STAT') ? 'red' : 'blue'} size="sm">
                            {lab.priority}
                          </CarbonTag>
                          <CarbonTag type={lab.status === 'completed' || lab.status === 'verified' ? 'green' : 'warm-gray'} size="sm">
                            {lab.status.toUpperCase()}
                          </CarbonTag>
                        </div>
                        <div className="text-[11px] text-[#525252]">
                          Ordered by: <strong className="text-[#161616]">{lab.orderingDoctor}</strong> &bull; Result: <strong className="font-mono text-[#0043ce]">{lab.resultValue || 'Pending Analysis'}</strong> (Ref: {lab.normalRange || 'Standard'})
                        </div>
                        <div className="text-[10px] text-[#525252]">
                          {lab.status === 'verified' ? (
                            <span className="text-[#198038] font-medium flex items-center gap-1 font-mono">
                              <ShieldCheck className="w-3.5 h-3.5 text-[#198038]" /> Diagnostic Verification: {lab.verifiedBy || 'Attending Clinical Staff'}
                            </span>
                          ) : (
                            <span className="text-[#ba1b23] font-medium">Pending Clinical Review</span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 5: AYURVEDA & PANCHAKARMA */}
          {activeTab === 'panchakarma' && (
            <div className="space-y-3">
              <h3 className="font-semibold text-xs text-[#161616] flex items-center gap-2 pb-2 border-b border-[#e0e0e0]">
                <Sparkles className="w-4 h-4 text-[#0f62fe]" />
                <span>Classical Panchakarma & Treatment Protocols</span>
              </h3>

              {patientCourses.length === 0 && patientTreatments.length === 0 ? (
                <div className="py-12 text-center text-[#525252] bg-[#f4f4f4] border border-[#e0e0e0]">
                  No active Panchakarma courses or treatment plans enrolled for this patient.
                </div>
              ) : (
                <div className="space-y-3">
                  {patientCourses.map((course) => (
                    <div key={course.id} className="p-3 bg-[#fbfbfb] border border-[#e0e0e0] space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-semibold text-[#0f62fe]">{course.courseNumber}</span>
                          <span className="font-semibold text-sm text-[#161616]">{course.protocol}</span>
                          <CarbonTag type={course.status === 'Active' ? 'green' : 'blue'} size="sm">
                            {course.status.toUpperCase()}
                          </CarbonTag>
                        </div>
                        <span className="font-mono text-xs text-[#525252]">
                          Progress: <strong className="text-[#161616]">{course.completedDays} / {course.totalDays} Days</strong>
                        </span>
                      </div>

                      <div className="text-[11px] text-[#525252]">
                        Lead Vaidya: <strong className="text-[#161616]">{course.vaidyaName}</strong> &bull; Phase: <span className="text-[#0f62fe] font-medium">{course.currentPhase}</span>
                      </div>

                      <div className="p-2 bg-[#f4f4f4] border border-[#e0e0e0] text-[11px] font-sans">
                        <span className="text-[#525252] font-semibold">Dietary Prescription:</span> {course.dietaryPrescription}
                      </div>
                    </div>
                  ))}

                  {patientTreatments.map((tr) => (
                    <div key={tr.id} className="p-3 bg-[#fbfbfb] border border-[#e0e0e0] flex items-center justify-between text-xs">
                      <div>
                        <div className="font-semibold text-sm text-[#161616]">{tr.therapyType}</div>
                        <div className="text-[11px] text-[#525252]">{tr.oilOrFormulation} &bull; Vaidya: {tr.doctorName}</div>
                      </div>
                      <CarbonTag type={tr.status === 'active' ? 'green' : 'cool-gray'} size="sm">
                        {tr.status.toUpperCase()}
                      </CarbonTag>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 6: APPOINTMENTS & CLINICAL ENCOUNTERS */}
          {activeTab === 'appointments' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-[#e0e0e0]">
                <h3 className="font-semibold text-xs text-[#161616] flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-[#0f62fe]" />
                  <span>Scheduled Consultations & Encounter History</span>
                </h3>
                {onOpenScheduleModal && (
                  <CarbonButton
                    kind="primary"
                    size="sm"
                    renderIcon={Calendar}
                    onClick={() => onOpenScheduleModal(patient)}
                  >
                    Schedule Appointment
                  </CarbonButton>
                )}
              </div>

              {patientAppointments.length === 0 && patientConsultations.length === 0 ? (
                <div className="py-12 text-center text-[#525252] bg-[#f4f4f4] border border-[#e0e0e0]">
                  No appointments or clinical consultations recorded for this patient.
                </div>
              ) : (
                <div className="space-y-3">
                  {patientAppointments.map((apt) => (
                    <div key={apt.id} className="p-3 bg-[#fbfbfb] border border-[#e0e0e0] flex items-center justify-between text-xs">
                      <div>
                        <div className="font-semibold text-[#161616] flex items-center gap-2">
                          <span>{apt.department} &bull; {apt.doctorName}</span>
                          <CarbonTag type={apt.status === 'completed' ? 'green' : apt.status === 'cancelled' ? 'red' : 'blue'} size="sm">
                            {apt.status.toUpperCase()}
                          </CarbonTag>
                        </div>
                        <div className="text-[11px] text-[#525252] mt-0.5">
                          {new Date(apt.dateTime).toLocaleDateString()} at {apt.timeSlot} &bull; Type: {apt.type}
                        </div>
                      </div>
                    </div>
                  ))}

                  {patientConsultations.map((c) => (
                    <div key={c.id} className="p-3 bg-white border border-[#0f62fe]/30 space-y-1 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-mono font-semibold text-[#0f62fe]">{c.consultationNumber}</span>
                        <CarbonTag type="teal" size="sm">{c.status.toUpperCase()}</CarbonTag>
                      </div>
                      <div className="font-semibold text-[#161616]">
                        Diagnosis: {c.classicalDiagnosis}
                      </div>
                      <div className="text-[11px] text-[#525252]">
                        Vaidya: {c.doctorName} &bull; Date: {new Date(c.dateTime).toLocaleDateString()}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 7: BILLING & FINANCIAL ACCOUNT */}
          {activeTab === 'billing' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-[#e0e0e0]">
                <h3 className="font-semibold text-xs text-[#161616] flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-[#0f62fe]" />
                  <span>Hospital Invoices & Ledger</span>
                </h3>
                {onOpenBillingModal && permissions.canViewBilling && (
                  <CarbonButton
                    kind="primary"
                    size="sm"
                    renderIcon={CreditCard}
                    onClick={() => onOpenBillingModal(patient)}
                  >
                    Open Billing Module
                  </CarbonButton>
                )}
              </div>

              {patientInvoices.length === 0 ? (
                <div className="py-12 text-center text-[#525252] bg-[#f4f4f4] border border-[#e0e0e0]">
                  No financial invoices or billing records issued for this patient.
                </div>
              ) : (
                <div className="space-y-2">
                  {patientInvoices.map((inv) => (
                    <div key={inv.id} className="p-3 bg-[#fbfbfb] border border-[#e0e0e0] flex items-center justify-between text-xs">
                      <div>
                        <div className="font-mono font-semibold text-[#0f62fe] flex items-center gap-2">
                          <span>{inv.invoiceNumber}</span>
                          <CarbonTag type={inv.paymentStatus === 'paid' ? 'green' : inv.paymentStatus === 'partial' ? 'blue' : 'warm-gray'} size="sm">
                            {inv.paymentStatus.toUpperCase()}
                          </CarbonTag>
                        </div>
                        <div className="text-[11px] text-[#525252] mt-0.5">
                          Date: {new Date(inv.createdAt).toLocaleDateString()} &bull; Items: {inv.items?.length || 0}
                        </div>
                      </div>
                      <div className="text-right font-mono">
                        <div className="font-bold text-sm text-[#161616]">₹{Number(inv.totalAmount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
                        <div className="text-[10px] text-[#525252]">Balance: ₹{(inv.balance !== undefined ? Number(inv.balance) : 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 8: AUDIT TIMELINE & LIFECYCLE */}
          {activeTab === 'activity' && (
            <div className="space-y-3">
              <h3 className="font-semibold text-xs text-[#161616] flex items-center gap-2 pb-2 border-b border-[#e0e0e0]">
                <History className="w-4 h-4 text-[#0f62fe]" />
                <span>Patient Record Access & Modification Audit History</span>
              </h3>

              {patientAuditLogs.length === 0 ? (
                <div className="py-12 text-center text-[#525252] bg-[#f4f4f4] border border-[#e0e0e0]">
                  No access audit entries recorded.
                </div>
              ) : (
                <div className="space-y-1.5 max-h-96 overflow-y-auto">
                  {patientAuditLogs.map((log) => (
                    <div key={log.id} className="p-2.5 bg-white border border-[#e0e0e0] text-xs flex items-start justify-between gap-3">
                      <div>
                        <div className="font-semibold text-[#161616] flex items-center gap-2">
                          <span>{log.action}</span>
                          <span className="font-mono text-[10px] text-[#525252] px-1 bg-[#f4f4f4] border">{log.category}</span>
                        </div>
                        <div className="text-[11px] text-[#525252] mt-0.5">{log.details}</div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="font-medium text-[#161616]">{log.actor}</div>
                        <div className="font-mono text-[10px] text-[#525252]">{new Date(log.timestamp).toLocaleString()}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Action Footer */}
        <div className="p-4 bg-[#f4f4f4] border-t border-[#e0e0e0] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <CarbonButton
              kind="primary"
              size="md"
              renderIcon={FileDown}
              onClick={handleQuickExportPdf}
            >
              Export Clinical PDF Dossier
            </CarbonButton>

            {onOpenBillingModal && permissions.canViewBilling && (
              <CarbonButton
                kind="tertiary"
                size="md"
                renderIcon={CreditCard}
                onClick={() => onOpenBillingModal(patient)}
              >
                Statement
              </CarbonButton>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap justify-end">
            {patient.isRegistered ? (
              onOpenScheduleModal && (
                <CarbonButton
                  kind="secondary"
                  size="md"
                  renderIcon={Calendar}
                  onClick={() => onOpenScheduleModal(patient)}
                  className="bg-[#0f62fe] text-white hover:bg-[#0353e9]"
                >
                  Book Appointment
                </CarbonButton>
              )
            ) : (
              onOpenAdmitPatient && (
                <CarbonButton
                  kind="secondary"
                  size="md"
                  renderIcon={UserPlus}
                  className="bg-[#24a148] text-white hover:bg-[#198038]"
                  onClick={() => onOpenAdmitPatient(patient)}
                >
                  Register Patient
                </CarbonButton>
              )
            )}

            <CarbonButton
              kind="ghost"
              size="md"
              onClick={onClose}
            >
              Close
            </CarbonButton>
          </div>
        </div>
      </div>
    </div>
  );
};
