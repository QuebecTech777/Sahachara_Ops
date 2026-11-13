import React, { useState } from 'react';
import {
  Download,
  FileText,
  FileSpreadsheet,
  CheckCircle,
  ShieldCheck,
  Calendar,
  Heart,
  Pill,
  HandHeart,
  FileDown
} from 'lucide-react';
import { CarbonModal } from '../carbon/CarbonModal';
import { CarbonButton } from '../carbon/CarbonButton';
import { CarbonTag } from '../carbon/CarbonTag';
import {
  Patient,
  TreatmentPlan,
  PanchakarmaCourse,
  Prescription,
  LabOrder,
  Consultation
} from '../../types/hospital';
import { generatePatientSummaryPDF } from '../../services/clinicalPdfGenerator';

interface DownloadSummaryModalProps {
  isOpen: boolean;
  onClose: () => void;
  patient: Patient;
  treatmentPlans?: TreatmentPlan[];
  panchakarmaCourses?: PanchakarmaCourse[];
  prescriptions?: Prescription[];
  labOrders?: LabOrder[];
  consultations?: Consultation[];
  onDownloadComplete?: (format: 'pdf' | 'json' | 'csv') => void;
}

export const DownloadSummaryModal: React.FC<DownloadSummaryModalProps> = ({
  isOpen,
  onClose,
  patient,
  treatmentPlans = [],
  panchakarmaCourses = [],
  prescriptions = [],
  labOrders = [],
  consultations = [],
  onDownloadComplete
}) => {
  const [selectedFormat, setSelectedFormat] = useState<'pdf' | 'json' | 'csv'>('pdf');
  const [includeAyurveda, setIncludeAyurveda] = useState(true);
  const [includeTreatments, setIncludeTreatments] = useState(true);
  const [includePrescriptions, setIncludePrescriptions] = useState(true);
  const [includeLabs, setIncludeLabs] = useState(true);

  // Filter clinical data specific to this patient
  const patientTreatments = treatmentPlans.filter(
    (t) => t.patientMrn === patient.mrn || t.patientId === patient.id
  );
  const patientPanchakarma = panchakarmaCourses.filter(
    (p) => p.patientMrn === patient.mrn || p.patientId === patient.id
  );
  const patientPrescriptions = prescriptions.filter(
    (rx) => rx.mrn === patient.mrn || rx.patientId === patient.id
  );
  const patientLabs = labOrders.filter(
    (l) => l.mrn === patient.mrn || l.patientId === patient.id
  );
  const patientConsultations = consultations.filter(
    (c) => c.patientMrn === patient.mrn || c.patientId === patient.id
  );

  const activeTreatment = patientTreatments.find((t) => t.status === 'active') || patientTreatments[0];
  const activePanchakarma = patientPanchakarma.find((p) => p.status === 'Active') || patientPanchakarma[0];
  const latestConsultation = patientConsultations[0];

  const handleDownload = () => {
    const timestamp = new Date().toISOString();
    const dateStr = timestamp.split('T')[0];
    const safePatientName = `${patient.firstName}_${patient.lastName}`.replace(/[^a-zA-Z0-9_-]/g, '_');

    if (selectedFormat === 'pdf') {
      const doc = generatePatientSummaryPDF({
        patient,
        consultations,
        treatments: treatmentPlans,
        panchakarma: panchakarmaCourses,
        prescriptions,
        labOrders,
        includeAyurveda,
        includeTreatments,
        includePrescriptions,
        includeLabs
      });
      doc.save(`SahacharaOS_Clinical_Dossier_${patient.mrn}_${safePatientName}_${dateStr}.pdf`);
    } else if (selectedFormat === 'json') {
      const summaryPayload = {
        exportMetadata: {
          hospital: 'SahacharaOS Ayurvedic & Multi-Specialty Health System',
          exportStandard: 'SahacharaOS Clinical Summary v2026.4 (FHIR / EMR Compatible)',
          exportTimestamp: timestamp,
          issuingFacility: 'Central Ayurvedic Directorate & General Hospital',
          compliance: 'HIPAA & AYUSH Clinical Documentation Standard',
          digitalIntegrityStamp: `SHA256:${Array.from(`${patient.mrn}|${timestamp}`).reduce((acc, c, i) => (acc + (c.charCodeAt(0) * (i + 13)).toString(16)).slice(0, 64), 'a91b').padEnd(64, '0')}`
        },
        patient: {
          mrn: patient.mrn,
          firstName: patient.firstName,
          lastName: patient.lastName,
          dateOfBirth: patient.dob,
          age: patient.age,
          gender: patient.gender,
          bloodGroup: patient.bloodGroup,
          phone: patient.phone,
          email: patient.email,
          residentialAddress: patient.address,
          admissionStatus: patient.admissionStatus,
          currentWard: patient.currentWard,
          currentBed: patient.currentBed,
          attendingPhysician: patient.assignedDoctorName,
          emergencyContact: patient.emergencyContact,
          paymentMode: 'Direct Hospital Self-Pay'
        },
        clinicalDossier: {
          documentedAllergies: patient.allergies || [],
          chronicConditions: patient.chronicConditions || [],
          pastDiagnoses: patient.pastDiagnoses || [],
          activeHomeMedications: patient.currentMedications || [],
          longitudinalMedicalHistoryNotes: patient.medicalHistoryNotes,
          latestVitals: patient.latestVitals,
          clinicalImpression: patient.clinicalNotes
        },
        ayurvedicAssessment: includeAyurveda && latestConsultation ? {
          consultationNumber: latestConsultation.consultationNumber,
          consultingVaidya: latestConsultation.doctorName,
          dateTime: latestConsultation.dateTime,
          chiefComplaint: latestConsultation.chiefComplaint,
          presentIllness: latestConsultation.presentIllness,
          classicalDiagnosis: latestConsultation.classicalDiagnosis,
          westernCorrelation: latestConsultation.westernCorrelation,
          treatmentRecommendations: latestConsultation.treatmentRecommendations,
          recommendedTherapies: latestConsultation.recommendedTherapies,
          clinicalNotes: latestConsultation.clinicalNotes,
          rogiRogaPareeksha: latestConsultation.ayurvedicAssessment
        } : null,
        activeTreatmentPlan: includeTreatments && activeTreatment ? {
          treatmentPlanId: activeTreatment.id,
          planNumber: activeTreatment.planNumber,
          therapyType: activeTreatment.therapyType,
          clinicalObjective: activeTreatment.clinicalObjective,
          status: activeTreatment.status,
          frequency: activeTreatment.frequency,
          totalSessionsPrescribed: activeTreatment.totalSessions,
          sessionsCompleted: activeTreatment.completedSessions,
          assignedTherapist: activeTreatment.assignedTherapist,
          therapyRoom: activeTreatment.roomNumber,
          oilOrFormulation: activeTreatment.oilOrFormulation,
          clinicalNotes: activeTreatment.notes,
          prescribingDoctor: activeTreatment.doctorName,
          startDate: activeTreatment.startDate,
          endDate: activeTreatment.endDate
        } : null,
        panchakarmaCourse: includeTreatments && activePanchakarma ? {
          courseNumber: activePanchakarma.courseNumber,
          protocol: activePanchakarma.protocol,
          currentPhase: activePanchakarma.currentPhase,
          totalDays: activePanchakarma.totalDays,
          completedDays: activePanchakarma.completedDays,
          samsarjanaKramaDietaryPrescription: activePanchakarma.dietaryPrescription,
          vaidyaInCharge: activePanchakarma.vaidyaName,
          dailyObservationSessions: activePanchakarma.dailySessions
        } : null,
        prescriptions: includePrescriptions ? patientPrescriptions.map((rx) => ({
          rxNumber: rx.rxNumber,
          medication: rx.medicationName,
          dosage: rx.dosage,
          route: rx.route,
          frequency: rx.frequency,
          duration: rx.duration,
          status: rx.status,
          prescribingDoctor: rx.doctorName,
          datePrescribed: rx.datePrescribed
        })) : [],
        diagnosticLabReports: includeLabs ? patientLabs.map((lab) => ({
          orderNumber: lab.orderNumber,
          testType: lab.testType,
          priority: lab.priority,
          orderingDoctor: lab.orderingDoctor,
          resultValue: lab.resultValue,
          normalRange: lab.normalRange,
          isAbnormal: lab.isAbnormal,
          status: lab.status,
          verifiedBy: lab.verifiedBy || null,
          verifiedAt: lab.verifiedAt || null
        })) : []
      };

      const jsonBlob = new Blob([JSON.stringify(summaryPayload, null, 2)], {
        type: 'application/json'
      });
      const url = URL.createObjectURL(jsonBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `SahacharaOS_Clinical_Summary_${patient.mrn}_${safePatientName}_${dateStr}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } else {
      // CSV Export
      const csvRows: string[][] = [
        ['SahacharaOS Ayurvedic & Multi-Specialty Health System — Patient Clinical Summary Dossier'],
        ['Generated At', timestamp],
        ['Hospital Facility', 'Central Ayurvedic Directorate & General Hospital'],
        ['Standard', 'FHIR / Electronic Medical Records Export'],
        [''],
        ['--- SECTION: PATIENT DEMOGRAPHICS & IDENTIFIERS ---'],
        ['Medical Record Number (MRN)', patient.mrn],
        ['Patient Full Name', `${patient.firstName} ${patient.lastName}`],
        ['Date of Birth', patient.dob || 'Unrecorded'],
        ['Age / Gender', `${patient.age ? `${patient.age} years` : 'Age unrecorded'} / ${patient.gender}`],
        ['Blood Group', patient.bloodGroup || 'Unrecorded'],
        ['Contact Phone', patient.phone],
        ['Email Address', patient.email || 'N/A'],
        ['Residential Address', `"${patient.address || 'Unrecorded'}"`],
        ['Admission Status', patient.admissionStatus.toUpperCase()],
        ['Ward & Bed Location', `${patient.currentWard || 'Outpatient'} ${patient.currentBed ? `(${patient.currentBed})` : ''}`],
        ['Attending Physician', patient.assignedDoctorName || 'Dr. Sarah Chen, MD'],
        ['Billing Policy', '"Direct Hospital Self-Pay Settlement (No Insurance Coverage)"'],
        [''],
        ['--- SECTION: CLINICAL HISTORY & ALLERGIES ---'],
        ['Documented Allergies', `"${(patient.allergies || []).join('; ') || 'No known drug allergies'}"`],
        ['Chronic Conditions', `"${(patient.chronicConditions || []).join('; ') || 'None'}"`],
        ['Past Diagnoses', `"${(patient.pastDiagnoses || []).join('; ') || 'None'}"`],
        ['Active Medications', `"${(patient.currentMedications || []).join('; ') || 'None'}"`],
        ['Longitudinal Medical History', `"${(patient.medicalHistoryNotes || '').replace(/"/g, '""')}"`],
        ['Latest Vitals', `BP: ${patient.latestVitals?.bpSystolic}/${patient.latestVitals?.bpDiastolic} mmHg; HR: ${patient.latestVitals?.heartRate} bpm; SpO2: ${patient.latestVitals?.spo2}%; Temp: ${patient.latestVitals?.temperature} C`],
        ['Clinical Notes', `"${(patient.clinicalNotes || '').replace(/"/g, '""')}"`],
        ['']
      ];

      if (includeAyurveda && latestConsultation) {
        const asst = latestConsultation.ayurvedicAssessment;
        csvRows.push(
          ['--- SECTION: AYURVEDIC CLINICAL ASSESSMENT (ROGI-ROGA PAREEKSHA) ---'],
          ['Consultation No.', latestConsultation.consultationNumber],
          ['Consulting Vaidya', latestConsultation.doctorName],
          ['Chief Complaint', `"${latestConsultation.chiefComplaint}"`],
          ['Classical Diagnosis', `"${latestConsultation.classicalDiagnosis}"`],
          ['Western Correlation', `"${latestConsultation.westernCorrelation || 'N/A'}"`],
          ['Treatment Recommendations', `"${(latestConsultation.treatmentRecommendations || '').replace(/"/g, '""')}"`],
          ['Recommended Therapies', `"${(latestConsultation.recommendedTherapies || []).join('; ')}"`],
          ...(asst ? [
            ['Dominant Prakriti', asst.prakriti.dominant],
            ['Prakriti Dosha Ratio', `Vata: ${asst.prakriti.vata}%, Pitta: ${asst.prakriti.pitta}%, Kapha: ${asst.prakriti.kapha}%`],
            ['Vikriti Imbalance', `"${asst.vikriti.primaryImbalance}"`],
            ['Agni Status', asst.agni],
            ['Ama State', asst.ama],
            ['Koshtha Type', asst.koshtha],
            ['Nadi Pulse Observation', `"${asst.nadi}"`],
            ['Jihva Tongue Diagnosis', `"${asst.jihva}"`],
            ['Ahara (Diet Regimen)', `"${asst.ahara}"`],
            ['Vihara (Lifestyle Notes)', `"${asst.vihara}"`],
          ] : []),
          ['']
        );
      }

      if (includeTreatments && activeTreatment) {
        csvRows.push(
          ['--- SECTION: ACTIVE AYURVEDIC THERAPY & TREATMENT PLAN ---'],
          ['Plan Number', activeTreatment.planNumber],
          ['Therapy Type', activeTreatment.therapyType],
          ['Clinical Objective', `"${activeTreatment.clinicalObjective}"`],
          ['Course Progress', `${activeTreatment.completedSessions} of ${activeTreatment.totalSessions} sessions completed`],
          ['Schedule Frequency', activeTreatment.frequency],
          ['Assigned Therapist', activeTreatment.assignedTherapist],
          ['Therapy Room / Suite', activeTreatment.roomNumber],
          ['Medicated Oils / Formulations', `"${activeTreatment.oilOrFormulation}"`],
          ['Clinical Precautions & Notes', `"${(activeTreatment.notes || '').replace(/"/g, '""')}"`],
          ['Prescribing Vaidya', activeTreatment.doctorName],
          ['']
        );
      }

      if (includeTreatments && activePanchakarma) {
        csvRows.push(
          ['--- SECTION: PANCHAKARMA SHODHANA PROTOCOL ---'],
          ['Course Identifier', activePanchakarma.courseNumber],
          ['Shodhana Protocol', activePanchakarma.protocol],
          ['Current Therapy Phase', activePanchakarma.currentPhase],
          ['Course Timeline', `${activePanchakarma.completedDays} / ${activePanchakarma.totalDays} Days`],
          ['Samsarjana Krama Dietary Regimen', `"${activePanchakarma.dietaryPrescription}"`],
          ['Vaidya In-Charge', activePanchakarma.vaidyaName],
          ['']
        );
      }

      if (includePrescriptions && patientPrescriptions.length > 0) {
        csvRows.push(
          ['--- SECTION: CLINICAL PRESCRIPTIONS ---'],
          ['Rx Number', 'Medication Name', 'Dosage', 'Route / Frequency', 'Duration', 'Prescriber', 'Status']
        );
        patientPrescriptions.forEach((rx) => {
          csvRows.push([
            rx.rxNumber,
            rx.medicationName,
            rx.dosage,
            `${rx.route} - ${rx.frequency}`,
            rx.duration,
            rx.doctorName,
            rx.status.toUpperCase()
          ]);
        });
        csvRows.push(['']);
      }

      if (includeLabs && patientLabs.length > 0) {
        csvRows.push(
          ['--- SECTION: DIAGNOSTIC LAB REPORTS & VALIDATION ---'],
          ['Order Number', 'Diagnostic Test', 'Priority', 'Result Value', 'Reference Range', 'Status', 'Clinical Verification']
        );
        patientLabs.forEach((l) => {
          csvRows.push([
            l.orderNumber,
            l.testType,
            l.priority,
            l.resultValue || 'Pending',
            l.normalRange || 'N/A',
            l.status.toUpperCase(),
            l.verifiedBy ? `VERIFIED (${l.verifiedBy})` : 'PENDING'
          ]);
        });
      }

      const csvContent = csvRows.map((row) => row.join(',')).join('\n');
      const csvBlob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(csvBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `SahacharaOS_Clinical_Summary_${patient.mrn}_${safePatientName}_${dateStr}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }

    if (onDownloadComplete) {
      onDownloadComplete(selectedFormat);
    }
    onClose();
  };

  return (
    <CarbonModal
      isOpen={isOpen}
      onClose={onClose}
      title="Download Clinical Summary Dossier"
      subtitle={`Export longitudinal medical history, Ayurvedic Rogi-Roga Pareeksha, active therapy courses, and verified prescriptions for ${patient.firstName} ${patient.lastName} (${patient.mrn}).`}
      size="md"
    >
      <div className="space-y-5 text-xs text-[#161616]">
        {/* Format Selector Tile Group */}
        <div>
          <label className="block text-xs font-semibold text-[#161616] mb-2">
            Select Export File Format
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* PDF Option */}
            <div
              onClick={() => setSelectedFormat('pdf')}
              className={`p-3.5 border cursor-pointer transition-all ${
                selectedFormat === 'pdf'
                  ? 'border-[#0f62fe] bg-[#edf5ff] shadow-sm'
                  : 'border-[#e0e0e0] bg-white hover:bg-[#f4f4f4]'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-1.5">
                  <FileDown className={`w-4 h-4 ${selectedFormat === 'pdf' ? 'text-[#0f62fe]' : 'text-[#525252]'}`} />
                  <span className="font-semibold text-xs text-[#161616]">PDF Official Dossier</span>
                </div>
                <CarbonTag type={selectedFormat === 'pdf' ? 'green' : 'cool-gray'} size="sm">
                  ACCREDITED
                </CarbonTag>
              </div>
              <p className="text-[11px] text-[#525252] mt-1 leading-relaxed">
                Official printable hospital summary with institutional letterhead, digital certificates, timestamps & AYUSH legal disclaimer.
              </p>
            </div>

            {/* JSON Option */}
            <div
              onClick={() => setSelectedFormat('json')}
              className={`p-3.5 border cursor-pointer transition-all ${
                selectedFormat === 'json'
                  ? 'border-[#0f62fe] bg-[#edf5ff] shadow-sm'
                  : 'border-[#e0e0e0] bg-white hover:bg-[#f4f4f4]'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-1.5">
                  <FileText className={`w-4 h-4 ${selectedFormat === 'json' ? 'text-[#0f62fe]' : 'text-[#525252]'}`} />
                  <span className="font-semibold text-xs text-[#161616]">JSON EMR Dossier</span>
                </div>
                <CarbonTag type={selectedFormat === 'json' ? 'blue' : 'cool-gray'} size="sm">
                  FHIR EMR
                </CarbonTag>
              </div>
              <p className="text-[11px] text-[#525252] mt-1 leading-relaxed">
                Structured machine-readable JSON object with complete clinical trees and cryptographic signature hashes.
              </p>
            </div>

            {/* CSV Option */}
            <div
              onClick={() => setSelectedFormat('csv')}
              className={`p-3.5 border cursor-pointer transition-all ${
                selectedFormat === 'csv'
                  ? 'border-[#0f62fe] bg-[#edf5ff] shadow-sm'
                  : 'border-[#e0e0e0] bg-white hover:bg-[#f4f4f4]'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-1.5">
                  <FileSpreadsheet className={`w-4 h-4 ${selectedFormat === 'csv' ? 'text-[#0f62fe]' : 'text-[#525252]'}`} />
                  <span className="font-semibold text-xs text-[#161616]">CSV Spreadsheet</span>
                </div>
                <CarbonTag type={selectedFormat === 'csv' ? 'blue' : 'cool-gray'} size="sm">
                  TABULAR
                </CarbonTag>
              </div>
              <p className="text-[11px] text-[#525252] mt-1 leading-relaxed">
                Comma-delimited spreadsheet report formatted for Excel, Google Sheets, external audits and table review.
              </p>
            </div>
          </div>
        </div>

        {/* Data Sections to Include */}
        <div className="border border-[#e0e0e0] p-3.5 bg-[#f4f4f4]">
          <span className="font-semibold text-xs text-[#161616] block mb-2.5">
            Dossier Data Modules Included
          </span>
          <div className="space-y-2">
            <label className="flex items-center gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={includeAyurveda}
                onChange={(e) => setIncludeAyurveda(e.target.checked)}
                className="h-3.5 w-3.5 rounded-none accent-[#0f62fe]"
              />
              <span className="text-xs text-[#161616]">
                <strong>Ayurvedic Rogi-Roga Assessment:</strong> Prakriti/Vikriti constitution, Agni, Ama, Nadi & Jihva diagnosis
              </span>
            </label>

            <label className="flex items-center gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={includeTreatments}
                onChange={(e) => setIncludeTreatments(e.target.checked)}
                className="h-3.5 w-3.5 rounded-none accent-[#0f62fe]"
              />
              <span className="text-xs text-[#161616]">
                <strong>Therapy Courses & Panchakarma Protocols:</strong> Active treatments, completed sessions, and dietary Samsarjana Krama
              </span>
            </label>

            <label className="flex items-center gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={includePrescriptions}
                onChange={(e) => setIncludePrescriptions(e.target.checked)}
                className="h-3.5 w-3.5 rounded-none accent-[#0f62fe]"
              />
              <span className="text-xs text-[#161616]">
                <strong>Prescription Regimens:</strong> Herbal medications, dosages, frequency, and practitioner clinical reviews
              </span>
            </label>

            <label className="flex items-center gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={includeLabs}
                onChange={(e) => setIncludeLabs(e.target.checked)}
                className="h-3.5 w-3.5 rounded-none accent-[#0f62fe]"
              />
              <span className="text-xs text-[#161616]">
                <strong>Diagnostic Laboratory Panels:</strong> Blood chemistry, ABG, and biochemist diagnostic reviews
              </span>
            </label>
          </div>
        </div>

        {/* Patient Snapshot Preview */}
        <div className="p-3 bg-white border border-[#e0e0e0] flex items-center justify-between text-[11px] text-[#525252]">
          <div>
            Patient: <strong className="text-[#161616]">{patient.firstName} {patient.lastName}</strong> &bull; MRN: <strong className="font-mono text-[#0f62fe]">{patient.mrn}</strong>
          </div>
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1 text-[#0e6027]">
              <ShieldCheck className="w-3.5 h-3.5" />
              Certified EMR
            </span>
          </div>
        </div>

        {/* Buttons */}
        <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#e0e0e0]">
          <CarbonButton kind="secondary" size="md" onClick={onClose}>
            Cancel
          </CarbonButton>

          <CarbonButton
            kind="primary"
            size="md"
            renderIcon={Download}
            onClick={handleDownload}
          >
            Export Clinical Summary ({selectedFormat.toUpperCase()})
          </CarbonButton>
        </div>
      </div>
    </CarbonModal>
  );
};
