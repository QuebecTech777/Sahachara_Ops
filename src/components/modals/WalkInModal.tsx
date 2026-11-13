import React, { useState } from 'react';
import { CarbonModal } from '../carbon/CarbonModal';
import { Patient, Doctor, QueuePriority } from '../../types/hospital';

interface WalkInModalProps {
  isOpen: boolean;
  onClose: () => void;
  patients: Patient[];
  practitioners: Doctor[];
  selectedPatient?: Patient | null;
  onAdmitWalkIn: (data: {
    patientId: string;
    practitionerId: string;
    reasonForVisit: string;
    priority?: QueuePriority;
    priorityReason?: string;
    isEscalated?: boolean;
    escalationReason?: string;
    durationMinutes?: number;
  }) => Promise<void> | void;
}

export const WalkInModal: React.FC<WalkInModalProps> = ({
  isOpen,
  onClose,
  patients,
  practitioners,
  selectedPatient,
  onAdmitWalkIn
}) => {
  const [patientId, setPatientId] = useState(selectedPatient?.id || patients[0]?.id || '');
  const [practitionerId, setPractitionerId] = useState(practitioners[0]?.id || '');
  const [reasonForVisit, setReasonForVisit] = useState('');
  const [isEscalated, setIsEscalated] = useState(false);
  const [escalationReason, setEscalationReason] = useState('');
  const [durationMinutes, setDurationMinutes] = useState<number | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const currentPatient = patients.find((p) => p.id === patientId) || patients[0];
  const currentPractitioner = practitioners.find((d) => d.id === practitionerId) || practitioners[0];

  const handleSubmit = async () => {
    if (!currentPatient || !currentPractitioner) return;

    if (isEscalated && !escalationReason.trim()) {
      setError('An explicit escalation reason is mandatory when flagging immediate emergency clinician review.');
      return;
    }

    setError(null);
    setSubmitting(true);
    try {
      await onAdmitWalkIn({
        patientId: currentPatient.id,
        practitionerId: currentPractitioner.id,
        reasonForVisit: reasonForVisit.trim() || 'Walk-in outpatient consultation',
        priority: 'normal',
        isEscalated,
        escalationReason: isEscalated ? escalationReason.trim() : undefined,
        durationMinutes: durationMinutes !== undefined && durationMinutes > 0 ? durationMinutes : undefined
      });
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to admit walk-in patient');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <CarbonModal
      isOpen={isOpen}
      onClose={onClose}
      title="Admit Walk-In Patient to Queue"
      label="Reception Outpatient Intake"
      primaryButtonText={submitting ? 'Admitting...' : 'Admit to Waiting Queue'}
      secondaryButtonText="Cancel"
      onRequestSubmit={handleSubmit}
      size="md"
    >
      <div className="space-y-4">
        <div className="p-3 bg-[#edf5ff] border-l-4 border-l-[#0f62fe] border border-[#a6c8ff] text-xs text-[#0043ce]">
          <strong>Walk-In Patient Admission:</strong> The patient will be assigned an authoritative queue position and arrival timestamp, and immediately placed in the clinical waiting queue.
        </div>

        {error && (
          <div className="p-3 bg-[#fff1f1] border border-[#ffb3b8] text-xs text-[#a2191f]">
            <strong>Validation Error:</strong> {error}
          </div>
        )}

        {/* Patient Selection */}
        <div>
          <label className="block text-xs font-semibold text-[#161616] mb-1">
            Registered Patient (MRN / Name) *
          </label>
          <select
            value={patientId}
            onChange={(e) => setPatientId(e.target.value)}
            className="w-full carbon-input font-sans text-xs"
          >
            {patients.map((p) => (
              <option key={p.id} value={p.id}>
                {p.mrn} — {p.firstName} {p.lastName} ({p.phone})
              </option>
            ))}
          </select>
        </div>

        {/* Practitioner Selection */}
        <div>
          <label className="block text-xs font-semibold text-[#161616] mb-1">
            Attending Practitioner (Doctor / Vaidya) *
          </label>
          <select
            value={practitionerId}
            onChange={(e) => setPractitionerId(e.target.value)}
            className="w-full carbon-input font-sans text-xs"
          >
            {practitioners.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name} — {d.department || d.specialty}
              </option>
            ))}
          </select>
        </div>

        {/* Reason for Visit */}
        <div>
          <label className="block text-xs font-semibold text-[#161616] mb-1">
            Chief Complaint / Reason for Visit *
          </label>
          <input
            type="text"
            required
            value={reasonForVisit}
            onChange={(e) => setReasonForVisit(e.target.value)}
            placeholder="e.g. Acute joint pain, persistent headache, fever"
            className="w-full carbon-input text-xs"
          />
        </div>

        {/* Optional Duration Configuration */}
        <div>
          <label className="block text-xs font-semibold text-[#161616] mb-1">
            Expected Duration (Optional / Unconfigured by default)
          </label>
          <select
            value={durationMinutes !== undefined ? String(durationMinutes) : ''}
            onChange={(e) => setDurationMinutes(e.target.value ? Number(e.target.value) : undefined)}
            className="w-full carbon-input text-xs"
          >
            <option value="">Unconfigured (No hardcoded default)</option>
            <option value="15">15 Minutes (Brief Assessment)</option>
            <option value="30">30 Minutes (Standard Consultation)</option>
            <option value="45">45 Minutes (Extended Review)</option>
            <option value="60">60 Minutes (Comprehensive Intake)</option>
          </select>
        </div>

        {/* Administrative Emergency Escalation */}
        <div className="p-3 bg-[#fff1f1] border border-[#ffb3b8] space-y-2">
          <label className="flex items-center gap-2 cursor-pointer font-semibold text-xs text-[#a2191f]">
            <input
              type="checkbox"
              checked={isEscalated}
              onChange={(e) => setIsEscalated(e.target.checked)}
              className="w-4 h-4 text-[#da1e28] rounded border-gray-300 focus:ring-[#da1e28]"
            />
            <span>Flag for Immediate Clinician Review (Emergency Escalation)</span>
          </label>
          <div className="text-[11px] text-[#525252]">
            Note: Clinical triage priority (Urgent/Priority) is established by attending physicians. Front-desk staff may flag acute patient distress for immediate clinician assessment without forging clinical categories.
          </div>

          {isEscalated && (
            <div className="pt-2">
              <label className="block text-xs font-semibold text-[#a2191f] mb-1">
                Emergency Escalation Reason / Reported Acute Symptoms *
              </label>
              <input
                type="text"
                required
                value={escalationReason}
                onChange={(e) => setEscalationReason(e.target.value)}
                placeholder="e.g. Acute severe chest tightness, high fever with altered sensorium, severe breathing distress"
                className="w-full carbon-input text-xs border-[#da1e28]"
              />
            </div>
          )}
        </div>
      </div>
    </CarbonModal>
  );
};

