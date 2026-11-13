import React, { useState } from 'react';
import { CarbonModal } from '../carbon/CarbonModal';
import { QueuePriority, QueueItem } from '../../types/hospital';

interface ChangePriorityModalProps {
  isOpen: boolean;
  onClose: () => void;
  queueItem: QueueItem | null;
  currentUserRole?: string;
  onUpdatePriority: (id: string, priority: QueuePriority, priorityReason: string) => Promise<void> | void;
  onEscalate?: (id: string, escalationReason: string) => Promise<void> | void;
}

export const ChangePriorityModal: React.FC<ChangePriorityModalProps> = ({
  isOpen,
  onClose,
  queueItem,
  currentUserRole,
  onUpdatePriority,
  onEscalate
}) => {
  const isClinician = currentUserRole === 'DOCTOR' || currentUserRole === 'VAIDYA';
  const [priority, setPriority] = useState<QueuePriority>(queueItem?.priority || 'normal');
  const [priorityReason, setPriorityReason] = useState('');
  const [escalationReason, setEscalationReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!queueItem) return null;

  const handleSubmit = async () => {
    if (isClinician) {
      if (!priorityReason.trim()) {
        setError('An explicit clinical justification reason is strictly required for clinical priority triage.');
        return;
      }

      setError(null);
      setSubmitting(true);
      try {
        await onUpdatePriority(queueItem.id, priority, priorityReason.trim());
        onClose();
      } catch (err: any) {
        setError(err.message || 'Failed to update clinical triage priority');
      } finally {
        setSubmitting(false);
      }
    } else {
      // Non-clinician administrative emergency escalation
      if (!escalationReason.trim()) {
        setError('An explicit escalation reason is mandatory for emergency escalation.');
        return;
      }

      if (!onEscalate) {
        setError('Escalation handler is not available.');
        return;
      }

      setError(null);
      setSubmitting(true);
      try {
        await onEscalate(queueItem.id, escalationReason.trim());
        onClose();
      } catch (err: any) {
        setError(err.message || 'Failed to flag emergency escalation');
      } finally {
        setSubmitting(false);
      }
    }
  };

  return (
    <CarbonModal
      isOpen={isOpen}
      onClose={onClose}
      title={isClinician ? 'Clinical Triage Urgency Adjustment' : 'Flag Emergency Escalation'}
      label={isClinician ? 'Clinician Triage Governance' : 'Reception Emergency Triage'}
      primaryButtonText={submitting ? 'Saving...' : (isClinician ? 'Update Clinical Priority' : 'Flag Emergency Escalation')}
      secondaryButtonText="Cancel"
      onRequestSubmit={handleSubmit}
      size="md"
    >
      <div className="space-y-4 text-xs">
        <div className="p-3 bg-[#f4f4f4] border border-[#e0e0e0] space-y-1">
          <div>Patient: <strong className="text-[#161616]">{queueItem.patientName}</strong> ({queueItem.patientMrn})</div>
          <div>Attending: {queueItem.practitionerName} ({queueItem.department})</div>
          <div>Current Priority: <strong className="font-mono uppercase text-[#0f62fe]">{queueItem.priority}</strong> {queueItem.isEscalated ? '(EMERGENCY ESCALATED)' : ''}</div>
        </div>

        {error && (
          <div className="p-3 bg-[#fff1f1] border border-[#ffb3b8] text-[#a2191f]">
            <strong>Validation Error:</strong> {error}
          </div>
        )}

        {isClinician ? (
          <>
            <div>
              <label className="block text-xs font-semibold text-[#161616] mb-1">
                Clinical Triage Urgency *
              </label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as QueuePriority)}
                className="w-full carbon-input text-xs"
              >
                <option value="normal">Normal (Standard Queue)</option>
                <option value="priority">Priority (High Priority Queue)</option>
                <option value="urgent">Urgent (Immediate Clinical Attention)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#161616] mb-1">
                Clinical Justification Reason *
              </label>
              <textarea
                rows={3}
                required
                value={priorityReason}
                onChange={(e) => setPriorityReason(e.target.value)}
                placeholder="Specify clinical justification for triage classification..."
                className="w-full carbon-input resize-none text-xs"
              />
            </div>
          </>
        ) : (
          <div className="p-3 bg-[#fff1f1] border border-[#ffb3b8] space-y-2">
            <div className="font-semibold text-xs text-[#a2191f]">
              Administrative Emergency Escalation
            </div>
            <div className="text-[11px] text-[#525252]">
              Clinical triage urgency (Urgent / Priority) requires clinical authority (Doctor or Vaidya). As reception staff, you can flag this patient for immediate emergency assessment without forging clinical categories.
            </div>

            <div className="pt-2">
              <label className="block text-xs font-semibold text-[#a2191f] mb-1">
                Emergency Escalation Reason / Reported Acute Distress *
              </label>
              <textarea
                rows={3}
                required
                value={escalationReason}
                onChange={(e) => setEscalationReason(e.target.value)}
                placeholder="Specify why this patient requires immediate clinician attention..."
                className="w-full carbon-input resize-none text-xs border-[#da1e28]"
              />
            </div>
          </div>
        )}
      </div>
    </CarbonModal>
  );
};

