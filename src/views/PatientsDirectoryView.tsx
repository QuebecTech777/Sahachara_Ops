import React, { useState } from 'react';
import {
  Users,
  Plus,
  FileText,
  Heart,
  Pill,
  TestTube,
  CreditCard,
  Activity,
  AlertTriangle,
  ShieldCheck,
  Edit,
  Trash2,
  Calendar,
  Clock,
  History,
  Download,
  FileDown,
  PenTool,
  UserPlus,
  Flame
} from 'lucide-react';
import { generatePatientSummaryPDF } from '../services/clinicalPdfGenerator';
import { CarbonDataTable, Column } from '../components/carbon/CarbonDataTable';
import { CarbonTag, CarbonTagType } from '../components/carbon/CarbonTag';
import { CarbonButton } from '../components/carbon/CarbonButton';
import { CarbonTabs } from '../components/carbon/CarbonTabs';
import {
  Patient,
  AdmissionStatus,
  UserRole,
  ROLE_PERMISSIONS,
  TreatmentPlan,
  PanchakarmaCourse,
  Prescription,
  LabOrder,
  Consultation,
  DoshaProfile as DoshaProfileType
} from '../types/hospital';
import { DownloadSummaryModal } from '../components/modals/DownloadSummaryModal';
import { PatientDossierModal } from '../components/modals/PatientDossierModal';
import { DoshaProfile } from '../components/ayurveda/DoshaProfile';

interface PatientsDirectoryViewProps {
  patients: Patient[];
  currentUserRole: UserRole;
  currentUserName?: string;
  onOpenNewPatientModal: () => void;
  onOpenEditPatientModal: (patient: Patient) => void;
  onOpenDeletePatientModal: (patient: Patient) => void;
  onOpenPrescriptionModal: (patient: Patient) => void;
  onOpenLabModal: (patient: Patient) => void;
  onOpenBillingModal: (patient: Patient) => void;
  onOpenScheduleModal: (patient: Patient) => void;
  onOpenAdmitPatient?: (patient: Patient) => void;
  treatmentPlans?: TreatmentPlan[];
  panchakarmaCourses?: PanchakarmaCourse[];
  prescriptions?: Prescription[];
  labOrders?: LabOrder[];
  consultations?: Consultation[];
  onUpdateDoshaProfile?: (patientId: string, profile: DoshaProfileType) => void;
  onNotify?: (title: string, subtitle?: string, kind?: 'info' | 'success' | 'warning' | 'error') => void;
}

export const PatientsDirectoryView: React.FC<PatientsDirectoryViewProps> = ({
  patients,
  currentUserRole,
  currentUserName = 'Dr. Sarah Chen, MD',
  onOpenNewPatientModal,
  onOpenEditPatientModal,
  onOpenDeletePatientModal,
  onOpenPrescriptionModal,
  onOpenLabModal,
  onOpenBillingModal,
  onOpenScheduleModal,
  onOpenAdmitPatient,
  treatmentPlans = [],
  panchakarmaCourses = [],
  prescriptions = [],
  labOrders = [],
  consultations = [],
  onUpdateDoshaProfile,
  onNotify
}) => {
  const [selectedFilter, setSelectedFilter] = useState<'all' | 'inpatient' | 'outpatient' | 'discharged' | 'archived'>('all');
  const [dossierPatient, setDossierPatient] = useState<Patient | null>(null);
  const [downloadPatient, setDownloadPatient] = useState<Patient | null>(null);

  const permissions = ROLE_PERMISSIONS[currentUserRole];

  const handleQuickExportPdf = (patientToExport: Patient) => {
    const doc = generatePatientSummaryPDF({
      patient: patientToExport,
      consultations,
      treatments: treatmentPlans,
      panchakarma: panchakarmaCourses,
      prescriptions,
      labOrders
    });
    const safeName = `${patientToExport.firstName}_${patientToExport.lastName}`.replace(/[^a-zA-Z0-9_-]/g, '_');
    const dateStr = new Date().toISOString().split('T')[0];
    doc.save(`SahacharaOS_Clinical_Dossier_${patientToExport.mrn}_${safeName}_${dateStr}.pdf`);
    if (onNotify) {
      onNotify(
        'Official Clinical PDF Exported',
        `Generated accredited medical dossier for ${patientToExport.firstName} ${patientToExport.lastName} (${patientToExport.mrn}).`,
        'success'
      );
    }
  };

  const filteredPatients = patients.filter((p) => {
    if (selectedFilter === 'all') return true;
    if (selectedFilter === 'archived') return p.status === 'archived';
    return p.admissionStatus === selectedFilter && p.status !== 'archived';
  });

  const getStatusTag = (status: AdmissionStatus): { type: CarbonTagType; label: string } => {
    switch (status) {
      case 'inpatient':
        return { type: 'blue', label: 'INPATIENT' };
      case 'outpatient':
        return { type: 'teal', label: 'OUTPATIENT' };
      case 'discharged':
        return { type: 'cool-gray', label: 'DISCHARGED' };
      default:
        return { type: 'warm-gray', label: String(status).toUpperCase() };
    }
  };

  const columns: Column<Patient>[] = [
    {
      key: 'mrn',
      header: 'MRN',
      width: '110px',
      sortable: true,
      render: (p) => (
        <span className="font-mono text-xs font-semibold text-[#0f62fe]">
          {p.mrn}
        </span>
      )
    },
    {
      key: 'name',
      header: 'Patient Name & Contact',
      sortable: true,
      render: (p) => (
        <div>
          <div className="font-semibold text-sm text-[#161616] hover:text-[#0f62fe] transition-colors">
            {p.firstName} {p.lastName}
          </div>
          <div className="text-[11px] font-mono text-[#525252]">
            {p.phone}
          </div>
        </div>
      )
    },
    {
      key: 'age',
      header: 'Demographics',
      sortable: true,
      render: (p) => (
        <div className="text-xs text-[#161616]">
          <span>{p.age} yrs</span> &bull; <span>{p.gender}</span> &bull; <strong className="font-mono">{p.bloodGroup}</strong>
        </div>
      )
    },
    {
      key: 'registration',
      header: 'EMR Status',
      sortable: true,
      render: (p) => (
        <CarbonTag type={p.isRegistered ? 'teal' : 'warm-gray'} size="sm">
          {p.isRegistered ? 'REGISTERED' : 'UNREGISTERED'}
        </CarbonTag>
      )
    },
    {
      key: 'admissionStatus',
      header: 'Admission State',
      sortable: true,
      render: (p) => {
        const tag = getStatusTag(p.admissionStatus);
        return <CarbonTag type={tag.type}>{tag.label}</CarbonTag>;
      }
    },
    {
      key: 'assignedDoctorName',
      header: 'Attending Physician',
      render: (p) => (
        <span className="text-xs text-[#161616] font-medium">
          {p.assignedDoctorName || 'Dr. Sarah Chen, MD'}
        </span>
      )
    },
    {
      key: 'actions',
      header: 'Actions & Clinical Workflows',
      render: (p) => (
        <div className="flex items-center gap-1.5 flex-wrap" onClick={(e) => e.stopPropagation()}>
          {/* Primary View Dossier Button */}
          <CarbonButton
            kind="tertiary"
            size="sm"
            renderIcon={FileText}
            onClick={() => setDossierPatient(p)}
            title="Open comprehensive electronic medical record module"
          >
            View Dossier
          </CarbonButton>

          {/* Dynamically toggle between Book Appointment and Admit Patient based on isRegistered flag */}
          {p.isRegistered ? (
            <CarbonButton
              kind="primary"
              size="sm"
              renderIcon={Calendar}
              onClick={() => onOpenScheduleModal(p)}
              title={`Book Consultation for registered patient ${p.firstName} ${p.lastName}`}
              className="bg-[#0f62fe] hover:bg-[#0353e9] text-white"
            >
              Book Appt
            </CarbonButton>
          ) : (
            <CarbonButton
              kind="primary"
              size="sm"
              renderIcon={UserPlus}
              onClick={() => {
                if (onOpenAdmitPatient) {
                  onOpenAdmitPatient(p);
                } else {
                  onOpenNewPatientModal();
                }
              }}
              title={`Register patient ${p.firstName} ${p.lastName} into Sahachara Ayurveda`}
              className="bg-[#24a148] hover:bg-[#198038] text-white"
            >
              Register Patient
            </CarbonButton>
          )}

          <CarbonButton
            kind="ghost"
            size="sm"
            renderIcon={FileDown}
            onClick={() => handleQuickExportPdf(p)}
            title="Download Official Clinical PDF Summary"
          >
            PDF
          </CarbonButton>

          {permissions.canEditPatient && (
            <CarbonButton
              kind="ghost"
              size="sm"
              renderIcon={Edit}
              onClick={() => onOpenEditPatientModal(p)}
              title="Edit Patient Details"
            >
              Edit
            </CarbonButton>
          )}

          {permissions.canDeletePatient && (
            <CarbonButton
              kind="ghost"
              size="sm"
              renderIcon={Trash2}
              className="text-[#da1e28] hover:bg-[#fff1f1]"
              onClick={() => onOpenDeletePatientModal(p)}
              title="Securely Delete Patient Record (Admin only)"
            >
              Delete
            </CarbonButton>
          )}
        </div>
      )
    }
  ];

  return (
    <div className="space-y-6">
      {/* Title Bar */}
      <div className="bg-white border border-[#e0e0e0] p-5 sm:p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="text-[12px] font-mono uppercase tracking-[0.32px] text-[#525252] mb-1">
            SahacharaOS Electronic Medical Records (EMR)
          </div>
          <h1 className="text-[28px] font-semibold text-[#161616] tracking-tight leading-none">
            Patient Master Registry
          </h1>
          <p className="text-[13px] text-[#525252] mt-2">
            Longitudinal electronic medical records with comprehensive medical histories, allergies, current pharmacotherapy, and clinical dossiers.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {permissions.canCreatePatient && (
            <CarbonButton
              kind="primary"
              renderIcon={Plus}
              onClick={onOpenNewPatientModal}
              title="Register New Patient in Clinical Registry"
            >
              Register Patient
            </CarbonButton>
          )}
        </div>
      </div>

      {/* Filter Tabs */}
      <CarbonTabs
        selectedId={selectedFilter}
        onSelect={(id) => setSelectedFilter(id as any)}
        tabs={[
          { id: 'all', label: 'All Patients', count: patients.length },
          { id: 'outpatient', label: 'Outpatients', count: patients.filter((p) => p.admissionStatus === 'outpatient' && p.status !== 'archived').length },
          { id: 'inpatient', label: 'Inpatients', count: patients.filter((p) => p.admissionStatus === 'inpatient' && p.status !== 'archived').length },
          { id: 'discharged', label: 'Discharged', count: patients.filter((p) => p.admissionStatus === 'discharged' && p.status !== 'archived').length },
          { id: 'archived', label: 'Archived Dossiers', count: patients.filter((p) => p.status === 'archived').length }
        ]}
      />

      {/* Full-Width Intact Table (No Side-Drawer Squeezing the Layout) */}
      <div className="w-full">
        <CarbonDataTable<Patient>
          title="Patient Master Registry"
          description="Click any row or 'View Dossier' to open the complete longitudinal clinical dossier module."
          columns={columns}
          data={filteredPatients}
          searchPlaceholder="Search by MRN, name, phone, city, or condition..."
          searchFilter={(p, q) => {
            const query = q.toLowerCase().trim();
            const fullName = `${p.firstName} ${p.middleName || ''} ${p.lastName}`.toLowerCase();
            return (
              p.mrn.toLowerCase().includes(query) ||
              fullName.includes(query) ||
              p.phone.includes(query) ||
              (p.email ? p.email.toLowerCase().includes(query) : false) ||
              (p.city ? p.city.toLowerCase().includes(query) : false) ||
              (p.district ? p.district.toLowerCase().includes(query) : false) ||
              (p.allergies ? p.allergies.some((a) => a.toLowerCase().includes(query)) : false) ||
              (p.chronicConditions ? p.chronicConditions.some((c) => c.toLowerCase().includes(query)) : false)
            );
          }}
          onRowClick={(p) => setDossierPatient(p)}
          initialSortKey="mrn"
          expandableRowRender={(patient) => {
            const patientRx = prescriptions.filter(
              (rx) => rx.patientId === patient.id || rx.mrn === patient.mrn
            );
            const vitals = patient.latestVitals;
            return (
              <div className="space-y-4 text-xs font-sans">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-2 border-b border-[#e0e0e0] gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm text-[#161616]">
                      {patient.firstName} {patient.lastName}
                    </span>
                    <span className="font-mono text-xs px-1.5 py-0.5 bg-[#edf5ff] text-[#0043ce] border border-[#a6c8ff]">
                      {patient.mrn}
                    </span>
                    <CarbonTag type={patient.isRegistered ? 'teal' : 'warm-gray'} size="sm">
                      {patient.isRegistered ? 'REGISTERED' : 'UNREGISTERED'}
                    </CarbonTag>
                  </div>
                  <div className="text-[11px] text-[#525252]">
                    DOB: {patient.dob} &bull; Attending: <span className="text-[#161616] font-medium">{patient.assignedDoctorName || 'Dr. Sarah Chen, MD'}</span>
                  </div>
                </div>

                {/* 3-Column Summary: Recent Vitals, Medical History & Diagnoses, Active Prescriptions */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* 1. Recent Vitals */}
                  <div className="p-3 bg-white border border-[#e0e0e0] space-y-2">
                    <div className="flex items-center justify-between border-b border-[#e0e0e0] pb-1.5">
                      <span className="font-semibold text-xs text-[#161616] flex items-center gap-1.5">
                        <Activity className="w-3.5 h-3.5 text-[#0f62fe]" />
                        <span>Recent Physiological Vitals</span>
                      </span>
                      <span className="text-[10px] text-[#525252] font-mono">
                        {vitals?.recordedAt ? new Date(vitals.recordedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Logged'}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-[11px]">
                      <div className="p-2 bg-[#f4f4f4] border border-[#e0e0e0]">
                        <div className="text-[#525252] text-[10px] uppercase font-mono">Blood Pressure</div>
                        <div className="font-mono font-semibold text-[#161616] text-xs mt-0.5">
                          {vitals?.bpSystolic ?? 120}/{vitals?.bpDiastolic ?? 80} <span className="text-[10px] font-normal text-[#525252]">mmHg</span>
                        </div>
                      </div>
                      <div className="p-2 bg-[#f4f4f4] border border-[#e0e0e0]">
                        <div className="text-[#525252] text-[10px] uppercase font-mono">Heart Rate</div>
                        <div className="font-mono font-semibold text-[#161616] text-xs mt-0.5">
                          {vitals?.heartRate ?? 72} <span className="text-[10px] font-normal text-[#525252]">bpm</span>
                        </div>
                      </div>
                      <div className="p-2 bg-[#f4f4f4] border border-[#e0e0e0]">
                        <div className="text-[#525252] text-[10px] uppercase font-mono">SpO2 Oxygen</div>
                        <div className="font-mono font-semibold text-[#24a148] text-xs mt-0.5">
                          {vitals?.spo2 ?? 98}% <span className="text-[10px] font-normal text-[#525252]">Room air</span>
                        </div>
                      </div>
                      <div className="p-2 bg-[#f4f4f4] border border-[#e0e0e0]">
                        <div className="text-[#525252] text-[10px] uppercase font-mono">Temperature</div>
                        <div className="font-mono font-semibold text-[#161616] text-xs mt-0.5">
                          {vitals?.temperature ?? 37.0}°C
                        </div>
                      </div>
                    </div>
                    <div className="text-[10px] text-[#525252] flex items-center justify-between pt-1">
                      <span>Resp Rate: <strong className="font-mono text-[#161616]">{vitals?.respRate ?? 16} /min</strong></span>
                      <span className="text-[#0f62fe] font-medium">Physiological Status: Stable</span>
                    </div>
                  </div>

                  {/* 2. Medical History & Past Diagnoses */}
                  <div className="p-3 bg-white border border-[#e0e0e0] space-y-2">
                    <div className="flex items-center justify-between border-b border-[#e0e0e0] pb-1.5">
                      <span className="font-semibold text-xs text-[#161616] flex items-center gap-1.5">
                        <History className="w-3.5 h-3.5 text-[#525252]" />
                        <span>Detailed History & Diagnoses</span>
                      </span>
                    </div>

                    {/* Allergies Alert */}
                    <div>
                      <div className="text-[10px] uppercase font-mono text-[#a2191f] font-semibold mb-1 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" /> Allergies
                      </div>
                      {patient.allergies?.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {patient.allergies.map((all, i) => (
                            <span key={i} className="px-1.5 py-0.5 bg-[#fff1f1] border border-[#ffb3b8] text-[#a2191f] text-[10px] font-medium">
                              {all}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-[11px] text-[#525252]">No known allergies recorded</span>
                      )}
                    </div>

                    {/* Chronic conditions & Diagnoses */}
                    <div>
                      <div className="text-[10px] uppercase font-mono text-[#525252] mb-1">
                        Diagnoses & Conditions
                      </div>
                      <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto">
                        {[...(patient.chronicConditions || []), ...(patient.pastDiagnoses || [])].map((item, idx) => (
                          <span key={idx} className="px-1.5 py-0.5 bg-[#f4f4f4] border border-[#e0e0e0] text-[#161616] text-[10px]">
                            {item}
                          </span>
                        ))}
                      </div>
                    </div>

                    {patient.medicalHistoryNotes && (
                      <p className="text-[11px] text-[#525252] line-clamp-2 italic pt-1 border-t border-[#e0e0e0]">
                        "{patient.medicalHistoryNotes}"
                      </p>
                    )}
                  </div>

                  {/* 3. Active Prescriptions */}
                  <div className="p-3 bg-white border border-[#e0e0e0] space-y-2">
                    <div className="flex items-center justify-between border-b border-[#e0e0e0] pb-1.5">
                      <span className="font-semibold text-xs text-[#161616] flex items-center gap-1.5">
                        <Pill className="w-3.5 h-3.5 text-[#0043ce]" />
                        <span>Active Prescriptions ({patientRx.length})</span>
                      </span>
                      <span className="text-[10px] text-[#525252] font-mono">Formulary</span>
                    </div>

                    {patientRx.length > 0 ? (
                      <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                        {patientRx.map((rx) => (
                          <div key={rx.id} className="p-1.5 bg-[#f4f4f4] border border-[#e0e0e0] flex items-center justify-between text-[11px]">
                            <div className="min-w-0 pr-2">
                              <div className="font-semibold text-[#161616] truncate">
                                {rx.medicationName} <span className="font-mono text-[#0043ce]">{rx.dosage}</span>
                              </div>
                              <div className="text-[10px] text-[#525252]">
                                {rx.frequency} &bull; {rx.route} &bull; {rx.status.toUpperCase()}
                              </div>
                            </div>
                            <CarbonTag type={rx.status === 'dispensed' ? 'green' : rx.status === 'pending' ? 'blue' : 'warm-gray'} size="sm">
                              {rx.status.toUpperCase()}
                            </CarbonTag>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="py-4 text-center text-[#525252] text-[11px]">
                        No active prescriptions recorded in patient chart.
                      </div>
                    )}
                  </div>
                </div>

                {/* 4. Ayurvedic Dosha Profile & Imbalance Assessment */}
                <div className="p-3 bg-white border border-[#e0e0e0] space-y-2">
                  <div className="flex items-center justify-between border-b border-[#e0e0e0] pb-1.5">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-[#161616]">
                      <Flame className="w-3.5 h-3.5 text-[#da1e28]" />
                      <span>Ayurvedic Dosha Imbalance Assessment (Prakriti vs. Active Vikriti)</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setDossierPatient(patient)}
                      className="text-[11px] font-semibold text-[#0f62fe] hover:underline cursor-pointer bg-transparent border-none p-0"
                    >
                      Open Full Dossier Analysis &rarr;
                    </button>
                  </div>
                  <DoshaProfile patient={patient} variant="compact" canEdit={false} />
                </div>

                {/* Quick Action Footer */}
                <div className="flex flex-wrap items-center justify-between pt-2 border-t border-[#e0e0e0] gap-2">
                  <div className="text-[11px] text-[#525252]">
                    Primary Contact: <strong className="text-[#161616]">{patient.emergencyContact?.name}</strong> ({patient.emergencyContact?.phone})
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <CarbonButton
                      kind="primary"
                      size="sm"
                      renderIcon={FileText}
                      onClick={() => setDossierPatient(patient)}
                    >
                      Open Full Dossier Module
                    </CarbonButton>

                    {patient.isRegistered ? (
                      <CarbonButton
                        kind="secondary"
                        size="sm"
                        renderIcon={Calendar}
                        onClick={() => onOpenScheduleModal(patient)}
                      >
                        Book Appointment
                      </CarbonButton>
                    ) : (
                      <CarbonButton
                        kind="secondary"
                        size="sm"
                        renderIcon={UserPlus}
                        className="bg-[#24a148] hover:bg-[#198038] text-white"
                        onClick={() => {
                          if (onOpenAdmitPatient) {
                            onOpenAdmitPatient(patient);
                          } else {
                            onOpenNewPatientModal();
                          }
                        }}
                      >
                        Register Patient
                      </CarbonButton>
                    )}
                    {permissions.canWritePrescription && (
                      <CarbonButton
                        kind="tertiary"
                        size="sm"
                        renderIcon={Pill}
                        onClick={() => onOpenPrescriptionModal(patient)}
                      >
                        Write Rx
                      </CarbonButton>
                    )}
                    {permissions.canOrderLabs && (
                      <CarbonButton
                        kind="tertiary"
                        size="sm"
                        renderIcon={TestTube}
                        onClick={() => onOpenLabModal(patient)}
                      >
                        Order Lab
                      </CarbonButton>
                    )}
                    <CarbonButton
                      kind="ghost"
                      size="sm"
                      renderIcon={FileDown}
                      onClick={() => handleQuickExportPdf(patient)}
                    >
                      Export PDF
                    </CarbonButton>
                  </div>
                </div>
              </div>
            );
          }}
        />
      </div>

      {/* Dedicated Patient Clinical Dossier Module / Modal */}
      {dossierPatient && (
        <PatientDossierModal
          isOpen={Boolean(dossierPatient)}
          onClose={() => setDossierPatient(null)}
          patient={dossierPatient}
          currentUserRole={currentUserRole}
          currentUserName={currentUserName}
          prescriptions={prescriptions}
          labOrders={labOrders}
          treatmentPlans={treatmentPlans}
          panchakarmaCourses={panchakarmaCourses}
          consultations={consultations}
          onOpenEditPatientModal={onOpenEditPatientModal}
          onOpenScheduleModal={onOpenScheduleModal}
          onOpenAdmitPatient={onOpenAdmitPatient}
          onOpenPrescriptionModal={onOpenPrescriptionModal}
          onOpenLabModal={onOpenLabModal}
          onOpenBillingModal={onOpenBillingModal}
          onUpdateDoshaProfile={(pid, prof) => {
            if (onUpdateDoshaProfile) {
              onUpdateDoshaProfile(pid, prof);
            }
            if (dossierPatient && (dossierPatient.id === pid || dossierPatient.mrn === pid)) {
              setDossierPatient({ ...dossierPatient, doshaProfile: prof });
            }
          }}
          onNotify={onNotify}
        />
      )}

      {/* Download Clinical Summary Modal */}
      {downloadPatient && (
        <DownloadSummaryModal
          isOpen={true}
          onClose={() => setDownloadPatient(null)}
          patient={downloadPatient}
          treatmentPlans={treatmentPlans}
          panchakarmaCourses={panchakarmaCourses}
          prescriptions={prescriptions}
          labOrders={labOrders}
          consultations={consultations}
          onDownloadComplete={(fmt) => {
            if (onNotify) {
              onNotify(
                'Clinical Summary Exported',
                `Successfully downloaded formatted ${fmt.toUpperCase()} dossier for ${downloadPatient.firstName} ${downloadPatient.lastName} (${downloadPatient.mrn}).`,
                'success'
              );
            }
          }}
        />
      )}
    </div>
  );
};
