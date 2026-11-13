import React, { useState } from 'react';
import { CarbonModal } from '../carbon/CarbonModal';
import { Patient, Doctor, Appointment } from '../../types/hospital';

interface NewAppointmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  patients: Patient[];
  doctors: Doctor[];
  selectedPatient?: Patient | null;
  onSchedule: (data: Partial<Appointment>, sendReminder: boolean, reminderChannel: 'SMS' | 'Email') => Promise<void> | void;
}

export const NewAppointmentModal: React.FC<NewAppointmentModalProps> = ({
  isOpen,
  onClose,
  patients,
  doctors,
  selectedPatient,
  onSchedule
}) => {
  const todayStr = new Date().toISOString().split('T')[0];
  const [patientId, setPatientId] = useState(selectedPatient?.id || patients[0]?.id || '');
  const [doctorId, setDoctorId] = useState(doctors[0]?.id || '');
  const [date, setDate] = useState(todayStr);
  const [timeSlot, setTimeSlot] = useState('10:00 AM');
  const [durationMinutes, setDurationMinutes] = useState<number | undefined>(undefined);
  const [type, setType] = useState<Appointment['type']>('General Consultation');
  const [notes, setNotes] = useState('');
  const [sendReminder, setSendReminder] = useState(true);
  const [reminderChannel, setReminderChannel] = useState<'SMS' | 'Email'>('SMS');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const currentPatient = patients.find((p) => p.id === patientId) || patients[0];
  const currentDoctor = doctors.find((d) => d.id === doctorId) || doctors[0];

  const handleSubmit = async () => {
    if (!currentPatient || !currentDoctor) return;
    setError(null);
    setSubmitting(true);

    try {
      const newApt: Partial<Appointment> = {
        patientId: currentPatient.id,
        patientName: `${currentPatient.firstName} ${currentPatient.lastName}`,
        patientMrn: currentPatient.mrn,
        patientPhone: currentPatient.phone,
        patientEmail: currentPatient.email || '',
        doctorId: currentDoctor.id,
        practitionerId: currentDoctor.id,
        doctorName: currentDoctor.name,
        practitionerName: currentDoctor.name,
        practitionerRole: (currentDoctor.department?.toLowerCase().includes('ayurved') || (currentDoctor.specialty as string)?.toLowerCase().includes('ayurved')) ? 'VAIDYA' : 'DOCTOR',
        department: currentDoctor.department,
        dateTime: `${date}T${timeSlot.replace(' ', '')}`,
        appointmentDate: date,
        timeSlot,
        durationMinutes: durationMinutes !== undefined && durationMinutes > 0 ? durationMinutes : undefined,
        type,
        notes: notes.trim() || 'Clinical consultation requested.'
      };

      await onSchedule(newApt, sendReminder, reminderChannel);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to schedule appointment');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <CarbonModal
      isOpen={isOpen}
      onClose={onClose}
      title="Book Appointment (Registered Patients)"
      label="Outpatient & Inpatient Consultations"
      primaryButtonText="Confirm & Book Appointment"
      secondaryButtonText="Cancel"
      onRequestSubmit={handleSubmit}
      size="lg"
    >
      <div className="space-y-4">
        {/* Registered Patient Banner */}
        <div className="p-3 bg-[#f4f4f4] border-l-4 border-l-[#0f62fe] border border-[#e0e0e0] text-xs text-[#161616] flex items-center justify-between">
          <div>
            <strong>Registered Patient Consultation:</strong> Select an existing registered patient from the EMR master directory to book an outpatient appointment or specialist consultation.
          </div>
          <span className="font-mono text-[10px] text-[#0f62fe] font-semibold uppercase px-2 py-0.5 bg-white border border-[#0f62fe]/30 shrink-0 ml-2">
            Registered
          </span>
        </div>

        {error && (
          <div className="p-3 bg-[#fff1f1] border border-[#ffb3b8] text-xs text-[#a2191f]">
            <strong>Scheduling Conflict or Validation Error:</strong> {error}
          </div>
        )}

        {/* Patient Selection */}
        <div>
          <label className="block text-xs font-semibold text-[#161616] mb-1">
            Select Registered Patient (MRN / Name) *
          </label>
          <select
            value={patientId}
            onChange={(e) => setPatientId(e.target.value)}
            className="w-full carbon-input"
          >
            {patients.map((p) => (
              <option key={p.id} value={p.id}>
                {p.mrn} — {p.firstName} {p.lastName} ({p.phone})
              </option>
            ))}
          </select>
        </div>

        {/* Doctor Selection */}
        <div>
          <label className="block text-xs font-semibold text-[#161616] mb-1">
            Attending Physician / Specialist *
          </label>
          <select
            value={doctorId}
            onChange={(e) => {
              setDoctorId(e.target.value);
              const doc = doctors.find((d) => d.id === e.target.value);
              if (doc?.timeSlots?.length) {
                setTimeSlot(doc.timeSlots[0]);
              }
            }}
            className="w-full carbon-input"
          >
            {doctors.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name} — {d.specialty} ({d.department})
              </option>
            ))}
          </select>
        </div>

        {/* Doctor Available Days & Slots Guide */}
        {currentDoctor && (
          <div className="p-3 bg-[#f4f4f4] border border-[#e0e0e0] text-xs space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-[#161616]">{currentDoctor.name} Availability:</span>
              <span className="text-[11px] text-[#0f62fe] font-mono">{currentDoctor.room}</span>
            </div>
            <div className="text-[#525252]">
              Clinical Days: <strong className="text-[#161616]">{currentDoctor.availableDays?.join(', ')}</strong>
            </div>
          </div>
        )}

        {/* Date and Time Slot */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-[#161616] mb-1">
              Appointment Date *
            </label>
            <input
              type="date"
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full carbon-input font-mono"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#161616] mb-1">
              Available Time Slot *
            </label>
            <select
              value={timeSlot}
              onChange={(e) => setTimeSlot(e.target.value)}
              className="w-full carbon-input font-mono"
            >
              {(currentDoctor?.timeSlots || [
                '09:00 AM',
                '09:30 AM',
                '10:00 AM',
                '10:30 AM',
                '11:00 AM',
                '02:00 PM',
                '02:30 PM',
                '03:00 PM'
              ]).map((slot) => (
                <option key={slot} value={slot}>
                  {slot}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Duration Configuration */}
        <div>
          <label className="block text-xs font-semibold text-[#161616] mb-1">
            Appointment Duration (Optional / Service Configured)
          </label>
          <select
            value={durationMinutes !== undefined ? String(durationMinutes) : ''}
            onChange={(e) => setDurationMinutes(e.target.value ? Number(e.target.value) : undefined)}
            className="w-full carbon-input text-xs"
          >
            <option value="">Standard / Unconfigured (No hardcoded default)</option>
            <option value="15">15 Minutes (Brief Follow-up)</option>
            <option value="30">30 Minutes (Standard Consultation)</option>
            <option value="45">45 Minutes (Comprehensive Clinical Intake)</option>
            <option value="60">60 Minutes (Specialist / Therapy Session)</option>
            <option value="90">90 Minutes (Complex Multi-therapy Session)</option>
            <option value="120">120 Minutes (Full Panchakarma Course Session)</option>
          </select>
        </div>

        {/* Type */}
        <div>
          <label className="block text-xs font-semibold text-[#161616] mb-1">
            Appointment Classification
          </label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as any)}
            className="w-full carbon-input"
          >
            <option value="General Consultation">General Consultation</option>
            <option value="Follow-up">Follow-up Assessment</option>
            <option value="Pre-op Assessment">Pre-op Surgical Clearance</option>
            <option value="Diagnostic Review">Diagnostic Imaging / Lab Review</option>
            <option value="Urgent Review">Urgent Clinical Review</option>
          </select>
        </div>

        {/* Automated Reminder Options */}
        <div className="p-3 bg-[#edf5ff] border border-[#a6c8ff] space-y-2 text-xs">
          <label className="flex items-center gap-2 cursor-pointer font-semibold text-[#0043ce]">
            <input
              type="checkbox"
              checked={sendReminder}
              onChange={(e) => setSendReminder(e.target.checked)}
              className="w-4 h-4 rounded-none text-[#0f62fe]"
            />
            <span>Send Automated Reminder Notification to Patient</span>
          </label>
          {sendReminder && (
            <div className="flex items-center gap-4 pl-6 text-[#161616]">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="radio"
                  name="reminderChannel"
                  checked={reminderChannel === 'SMS'}
                  onChange={() => setReminderChannel('SMS')}
                />
                <span>SMS Text Message ({currentPatient?.phone || 'On file'})</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="radio"
                  name="reminderChannel"
                  checked={reminderChannel === 'Email'}
                  onChange={() => setReminderChannel('Email')}
                />
                <span>Email Message ({currentPatient?.email || 'On file'})</span>
              </label>
            </div>
          )}
        </div>

        {/* Notes */}
        <div>
          <label className="block text-xs font-semibold text-[#161616] mb-1">
            Clinical Reason / Patient Notes
          </label>
          <textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Reason for visit, symptoms, or special instructions..."
            className="w-full carbon-input resize-none"
          />
        </div>
      </div>
    </CarbonModal>
  );
};
