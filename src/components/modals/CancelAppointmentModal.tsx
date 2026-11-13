import React, { useState } from 'react';
import { CarbonModal } from '../carbon/CarbonModal';
import { Appointment } from '../../types/hospital';

interface CancelAppointmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  appointment: Appointment | null;
  onCancelAppointment: (id: string, reason: string) => void;
}

export const CancelAppointmentModal: React.FC<CancelAppointmentModalProps> = ({
  isOpen,
  onClose,
  appointment,
  onCancelAppointment
}) => {
  const [reason, setReason] = useState('Patient requested cancellation due to scheduling conflict.');

  if (!appointment) return null;

  const handleSubmit = () => {
    onCancelAppointment(appointment.id, reason.trim() || 'Cancelled by staff');
    onClose();
  };

  return (
    <CarbonModal
      isOpen={isOpen}
      onClose={onClose}
      title="Cancel Clinical Appointment"
      label="Appointment Cancellation"
      primaryButtonText="Confirm Cancellation"
      secondaryButtonText="Keep Appointment"
      danger={true}
      onRequestSubmit={handleSubmit}
      size="md"
    >
      <div className="space-y-4 text-xs">
        <div className="p-3 bg-[#fff1f1] border border-[#ffb3b8] text-[#a2191f]">
          <div>You are about to cancel this scheduled consultation:</div>
          <div className="mt-1 font-semibold text-sm text-[#161616]">
            {appointment.patientName} with {appointment.doctorName}
          </div>
          <div className="font-mono text-[#525252] mt-0.5">
            {appointment.dateTime.split('T')[0]} at {appointment.timeSlot} ({appointment.type})
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-[#161616] mb-1">
            Cancellation Reason (Required for EMR audit log) *
          </label>
          <textarea
            rows={3}
            required
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Specify reason (e.g. Patient emergency, physician emergency surgery, resolved condition)..."
            className="w-full carbon-input resize-none"
          />
        </div>
      </div>
    </CarbonModal>
  );
};
