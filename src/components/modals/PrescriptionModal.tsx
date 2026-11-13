import React, { useState } from 'react';
import { CarbonModal } from '../carbon/CarbonModal';
import { Patient, Prescription } from '../../types/hospital';

interface PrescriptionModalProps {
  isOpen: boolean;
  onClose: () => void;
  patients: Patient[];
  onSubmit: (prescription: Partial<Prescription>) => void;
}

export const PrescriptionModal: React.FC<PrescriptionModalProps> = ({
  isOpen,
  onClose,
  patients,
  onSubmit
}) => {
  const [selectedPatientId, setSelectedPatientId] = useState(patients[0]?.id || '');
  const [medicationName, setMedicationName] = useState('Metoprolol Succinate');
  const [dosage, setDosage] = useState('25 mg');
  const [frequency, setFrequency] = useState('Once daily in the morning');
  const [route, setRoute] = useState<Prescription['route']>('Oral');
  const [duration, setDuration] = useState('14 days');
  const [doctorName, setDoctorName] = useState('Dr. Sarah Chen, MD');
  const [pharmacyNotes, setPharmacyNotes] = useState('Take with food. Monitor morning heart rate.');

  const patient = patients.find((p) => p.id === selectedPatientId) || patients[0];

  const handleSubmit = () => {
    if (!medicationName.trim() || !patient) return;

    const newRx: Partial<Prescription> = {
      patientId: patient.id,
      patientName: `${patient.firstName} ${patient.lastName}`,
      mrn: patient.mrn,
      medicationName: medicationName.trim(),
      dosage,
      frequency,
      route,
      duration,
      doctorName,
      pharmacyNotes
    };

    onSubmit(newRx);
    onClose();
  };

  return (
    <CarbonModal
      isOpen={isOpen}
      onClose={onClose}
      title="Create Physician E-Prescription"
      label="Clinical Pharmacy Order"
      primaryButtonText="Authorize & Transmit to Pharmacy"
      secondaryButtonText="Cancel"
      onRequestSubmit={handleSubmit}
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
                {p.mrn} — {p.firstName} {p.lastName} (Allergies: {p.allergies.join(', ') || 'None'})
              </option>
            ))}
          </select>
        </div>

        {patient?.allergies?.length > 0 && (
          <div className="p-2.5 bg-[#fff1f1] border-l-2 border-[#da1e28] text-xs text-[#a2191f]">
            <strong>Clinical Safety Alert:</strong> Patient documented allergies: {patient.allergies.join(', ')}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-[#161616] mb-1">
              Medication Name *
            </label>
            <input
              type="text"
              required
              value={medicationName}
              onChange={(e) => setMedicationName(e.target.value)}
              placeholder="e.g. Piperacillin-Tazobactam"
              className="w-full carbon-input"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#161616] mb-1">
              Dosage & Strength *
            </label>
            <input
              type="text"
              required
              value={dosage}
              onChange={(e) => setDosage(e.target.value)}
              placeholder="e.g. 500 mg, 4.5 g"
              className="w-full carbon-input font-mono"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-semibold text-[#161616] mb-1">
              Route
            </label>
            <select
              value={route}
              onChange={(e) => setRoute(e.target.value as any)}
              className="w-full carbon-input"
            >
              <option value="Oral">Oral (PO)</option>
              <option value="IV">Intravenous (IV)</option>
              <option value="IM">Intramuscular (IM)</option>
              <option value="Inhalation">Inhalation</option>
              <option value="Sublingual">Sublingual</option>
              <option value="Topical">Topical</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#161616] mb-1">
              Frequency
            </label>
            <input
              type="text"
              value={frequency}
              onChange={(e) => setFrequency(e.target.value)}
              placeholder="e.g. Q8H, BID, PRN"
              className="w-full carbon-input"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#161616] mb-1">
              Duration
            </label>
            <input
              type="text"
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              placeholder="e.g. 7 days"
              className="w-full carbon-input"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-[#161616] mb-1">
            Authorizing Physician
          </label>
          <select
            value={doctorName}
            onChange={(e) => setDoctorName(e.target.value)}
            className="w-full carbon-input"
          >
            <option value="Dr. Sarah Chen, MD (Cardiology)">Dr. Sarah Chen, MD (Cardiology)</option>
            <option value="Dr. Robert Rivera, MD (Emergency)">Dr. Robert Rivera, MD (Emergency)</option>
            <option value="Dr. Arthur Pendelton, MD (Orthopedics)">Dr. Arthur Pendelton, MD (Orthopedics)</option>
            <option value="Dr. Elena Rostova, MD (Critical Care)">Dr. Elena Rostova, MD (Critical Care)</option>
            <option value="Dr. Maya Lin, MD (Pediatrics)">Dr. Maya Lin, MD (Pediatrics)</option>
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold text-[#161616] mb-1">
            Pharmacist Instructions / Clinical Indication
          </label>
          <textarea
            rows={2}
            value={pharmacyNotes}
            onChange={(e) => setPharmacyNotes(e.target.value)}
            className="w-full carbon-input resize-none"
          />
        </div>
      </div>
    </CarbonModal>
  );
};
