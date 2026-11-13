import React, { useState } from 'react';
import { CarbonModal } from '../carbon/CarbonModal';
import { Appointment } from '../../types/hospital';

interface RescheduleAppointmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  appointment: Appointment | null;
  onReschedule: (id: string, newDateTime: string, newTimeSlot: string, reason?: string) => Promise<void> | void;
}

export const RescheduleAppointmentModal: React.FC<RescheduleAppointmentModalProps> = ({
  isOpen,
  onClose,
  appointment,
  onReschedule
}) => {
  const todayStr = new Date().toISOString().split('T')[0];
  const [newDate, setNewDate] = useState(todayStr);
  const [newSlot, setNewSlot] = useState('11:00 AM');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!appointment) return null;

  const handleSubmit = async () => {
    setError(null);
    setSubmitting(true);
    try {
      await onReschedule(
        appointment.id,
        `${newDate}T${newSlot.replace(' ', '')}`,
        newSlot,
        reason.trim() || undefined
      );
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to reschedule appointment');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <CarbonModal
      isOpen={isOpen}
      onClose={onClose}
      title="Reschedule Appointment"
      label="Clinical Scheduling Adjustment"
      primaryButtonText="Confirm Reschedule"
      secondaryButtonText="Cancel"
      onRequestSubmit={handleSubmit}
      size="md"
    >
      <div className="space-y-4">
        <div className="p-3 bg-[#f4f4f4] border border-[#e0e0e0] text-xs space-y-1">
          <div>Patient: <strong className="text-[#161616]">{appointment.patientName}</strong> ({appointment.patientMrn})</div>
          <div>Physician: {appointment.doctorName}</div>
          <div>Current Schedule: <strong className="font-mono text-[#da1e28]">{appointment.dateTime.split('T')[0]} at {appointment.timeSlot}</strong></div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-[#161616] mb-1">
              New Appointment Date *
            </label>
            <input
              type="date"
              required
              value={newDate}
              onChange={(e) => setNewDate(e.target.value)}
              className="w-full carbon-input font-mono"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#161616] mb-1">
              New Time Slot *
            </label>
            <select
              value={newSlot}
              onChange={(e) => setNewSlot(e.target.value)}
              className="w-full carbon-input font-mono"
            >
              {[
                '09:00 AM',
                '09:30 AM',
                '10:00 AM',
                '10:30 AM',
                '11:00 AM',
                '11:30 AM',
                '02:00 PM',
                '02:30 PM',
                '03:00 PM',
                '03:30 PM'
              ].map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        </div>

        {error && (
          <div className="p-3 bg-[#fff1f1] border border-[#ffb3b8] text-xs text-[#a2191f]">
            <strong>Rescheduling Error:</strong> {error}
          </div>
        )}

        <div>
          <label className="block text-xs font-semibold text-[#161616] mb-1">
            Reason for Rescheduling (Audit record)
          </label>
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Patient requested alternative time slot, practitioner clinical delay"
            className="w-full carbon-input"
          />
        </div>

        <div className="p-3 bg-[#edf5ff] border border-[#a6c8ff] text-xs text-[#0043ce]">
          An automated rescheduling notification will be queued for transmission to {appointment.patientName}.
        </div>
      </div>
    </CarbonModal>
  );
};
