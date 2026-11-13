import React, { useState } from 'react';
import { CarbonModal } from '../carbon/CarbonModal';
import { Patient, UserRole } from '../../types/hospital';
import { AlertTriangle, ShieldAlert } from 'lucide-react';

interface DeletePatientModalProps {
  isOpen: boolean;
  onClose: () => void;
  patient: Patient | null;
  currentUserRole: UserRole;
  onConfirmDelete: (patientId: string) => void;
}

export const DeletePatientModal: React.FC<DeletePatientModalProps> = ({
  isOpen,
  onClose,
  patient,
  currentUserRole,
  onConfirmDelete
}) => {
  const [confirmInput, setConfirmInput] = useState('');

  if (!patient) return null;

  const isAuthorized = currentUserRole === 'SUPER_ADMIN';
  const isConfirmed = confirmInput.trim() === patient.mrn;

  const handleDelete = () => {
    if (!isAuthorized || !isConfirmed) return;
    onConfirmDelete(patient.id);
    onClose();
  };

  return (
    <CarbonModal
      isOpen={isOpen}
      onClose={onClose}
      title="Securely Purge Patient Medical Record"
      label="HIPAA Compliance & Data Governance"
      primaryButtonText="Permanently Delete Record"
      secondaryButtonText="Cancel"
      danger={true}
      primaryButtonDisabled={!isAuthorized || !isConfirmed}
      onRequestSubmit={handleDelete}
      size="md"
    >
      <div className="space-y-4">
        {!isAuthorized ? (
          <div className="p-3 bg-[#fff1f1] border border-[#ffb3b8] text-xs text-[#a2191f] space-y-1">
            <div className="flex items-center gap-2 font-bold">
              <ShieldAlert className="w-4 h-4" />
              <span>RBAC Access Control Violation</span>
            </div>
            <p>
              Your active role is <strong>{currentUserRole}</strong>. Patient profile deletion is restricted exclusively to <strong>Admin</strong> privileges to prevent unauthorized clinical record destruction.
            </p>
          </div>
        ) : (
          <div className="p-3 bg-[#fff1f1] border border-[#ffb3b8] text-xs text-[#a2191f] flex items-start gap-2.5">
            <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <span className="font-semibold block">
                Warning: Irreversible Patient Profile Deletion
              </span>
              <p>
                Deleting this record will immediately revoke electronic health records (EMR), active ward allocations, and outpatient clinical access for this individual. An immutable entry will be recorded in the HIPAA Audit Trail.
              </p>
            </div>
          </div>
        )}

        <div className="p-3 bg-[#f4f4f4] border border-[#e0e0e0] text-xs space-y-1">
          <div>Patient Name: <strong className="text-[#161616]">{patient.firstName} {patient.lastName}</strong></div>
          <div>Medical Record Number: <strong className="font-mono text-[#0f62fe]">{patient.mrn}</strong></div>
          <div>Current Ward / Status: {patient.currentWard || 'None'} ({patient.admissionStatus})</div>
        </div>

        {isAuthorized && (
          <div>
            <label className="block text-xs font-semibold text-[#161616] mb-1">
              To confirm deletion, type the patient's MRN (<span className="font-mono text-[#0f62fe]">{patient.mrn}</span>) below:
            </label>
            <input
              type="text"
              value={confirmInput}
              onChange={(e) => setConfirmInput(e.target.value)}
              placeholder={`Type ${patient.mrn} to verify`}
              className="w-full carbon-input font-mono"
            />
          </div>
        )}
      </div>
    </CarbonModal>
  );
};
