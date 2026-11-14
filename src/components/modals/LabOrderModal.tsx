import React, { useState, useEffect } from 'react';
import { CarbonModal } from '../carbon/CarbonModal';
import { Patient, LabOrder } from '../../types/hospital';
import { hospitalApiClient } from '../../services/hospitalApi';

interface LabOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  patients: Patient[];
  onSubmit: (order: Partial<LabOrder>) => void;
}

export const LabOrderModal: React.FC<LabOrderModalProps> = ({
  isOpen,
  onClose,
  patients,
  onSubmit
}) => {
  const [selectedPatientId, setSelectedPatientId] = useState(patients[0]?.id || '');
  const [testType, setTestType] = useState<LabOrder['testType']>('Complete Blood Count (CBC)');
  const [priority, setPriority] = useState<LabOrder['priority']>('Routine');
  const [orderingDoctor, setOrderingDoctor] = useState('');
  const [labNotes, setLabNotes] = useState('');
  const [availablePractitioners, setAvailablePractitioners] = useState<Array<{ id: string; name: string; designation?: string }>>([]);

  useEffect(() => {
    let mounted = true;
    hospitalApiClient.getStaff().then((staffMembers) => {
      if (mounted && Array.isArray(staffMembers)) {
        const docs = staffMembers
          .filter((s) => s.role === 'DOCTOR' || s.role === 'VAIDYA')
          .map((s) => ({ id: s.id, name: s.name, designation: s.designation }));
        setAvailablePractitioners(docs);
        if (docs.length > 0 && !orderingDoctor) {
          setOrderingDoctor(docs[0].name);
        }
      }
    }).catch(() => {});
    return () => { mounted = false; };
  }, []);

  const patient = patients.find((p) => p.id === selectedPatientId) || patients[0];

  const handleSubmit = () => {
    if (!patient) return;

    const newOrder: Partial<LabOrder> = {
      patientId: patient.id,
      patientName: `${patient.firstName} ${patient.lastName}`,
      mrn: patient.mrn,
      testType,
      priority,
      orderingDoctor,
      labNotes
    };

    onSubmit(newOrder);
    onClose();
  };

  return (
    <CarbonModal
      isOpen={isOpen}
      onClose={onClose}
      title="Order Diagnostic & Pathology Lab"
      label="Clinical Laboratory Order"
      primaryButtonText="Submit Diagnostic Order"
      secondaryButtonText="Cancel"
      onRequestSubmit={handleSubmit}
      danger={priority.includes('STAT')}
      size="md"
    >
      <div className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-[#161616] mb-1">
            Patient
          </label>
          <select
            value={selectedPatientId}
            onChange={(e) => setSelectedPatientId(e.target.value)}
            className="w-full carbon-input"
          >
            {patients.map((p) => (
              <option key={p.id} value={p.id}>
                {p.mrn} — {p.firstName} {p.lastName} ({p.admissionStatus.toUpperCase()})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold text-[#161616] mb-1">
            Diagnostic Test / Panel *
          </label>
          <select
            value={testType}
            onChange={(e) => setTestType(e.target.value as any)}
            className="w-full carbon-input"
          >
            <option value="Cardiac Troponin I (High-Sensitivity)">Cardiac Troponin I (High-Sensitivity)</option>
            <option value="Complete Blood Count (CBC)">Complete Blood Count (CBC)</option>
            <option value="Comprehensive Metabolic Panel (CMP)">Comprehensive Metabolic Panel (CMP)</option>
            <option value="Arterial Blood Gas (ABG)">Arterial Blood Gas (ABG)</option>
            <option value="Coagulation Panel (PT/INR)">Coagulation Panel (PT/INR)</option>
            <option value="CT Chest & Angiography">CT Chest & Angiography</option>
            <option value="Brain MRI with Contrast">Brain MRI with Contrast</option>
            <option value="Urinalysis & Culture">Urinalysis & Culture</option>
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold text-[#161616] mb-1">
            Order Clinical Priority *
          </label>
          <div className="grid grid-cols-3 gap-2">
            {(['STAT (Immediate)', 'Urgent (<2 hrs)', 'Routine'] as LabOrder['priority'][]).map((p) => (
              <button
                type="button"
                key={p}
                onClick={() => setPriority(p)}
                className={`p-2.5 text-xs text-center border cursor-pointer font-medium transition-colors ${
                  priority === p
                    ? p.includes('STAT')
                      ? 'bg-[#da1e28] text-white border-[#da1e28]'
                      : 'bg-[#0f62fe] text-white border-[#0f62fe]'
                    : 'bg-[#f4f4f4] text-[#161616] border-[#c6c6c6] hover:bg-[#e0e0e0]'
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-[#161616] mb-1">
            Ordering Physician
          </label>
          <select
            value={orderingDoctor}
            onChange={(e) => setOrderingDoctor(e.target.value)}
            className="w-full carbon-input"
          >
            {availablePractitioners.length === 0 ? (
              <option value="">No registered ordering physicians</option>
            ) : (
              availablePractitioners.map((doc) => (
                <option key={doc.id} value={doc.name}>
                  {doc.name} {doc.designation ? `(${doc.designation})` : ''}
                </option>
              ))
            )}
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold text-[#161616] mb-1">
            Clinical Indication & Specimen Directives
          </label>
          <textarea
            rows={2}
            value={labNotes}
            onChange={(e) => setLabNotes(e.target.value)}
            className="w-full carbon-input resize-none"
          />
        </div>
      </div>
    </CarbonModal>
  );
};
