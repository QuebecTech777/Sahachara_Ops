import React, { useState } from 'react';
import {
  ShieldCheck,
  User,
  Check,
  X,
  Lock,
  Key,
  Users,
  ShieldAlert,
  ArrowRight
} from 'lucide-react';
import { CarbonDataTable, Column } from '../components/carbon/CarbonDataTable';
import { CarbonTag, CarbonTagType } from '../components/carbon/CarbonTag';
import { CarbonButton } from '../components/carbon/CarbonButton';
import { CarbonTabs } from '../components/carbon/CarbonTabs';
import { AppUser, UserRole, ROLE_PERMISSIONS } from '../types/hospital';

interface RbacManagementViewProps {
  users: AppUser[];
  currentActiveUser: AppUser;
  onSwitchUser?: (userId: string) => void;
  onUpdateUserRole: (userId: string, newRole: UserRole) => void;
}

export const RbacManagementView: React.FC<RbacManagementViewProps> = ({
  users,
  currentActiveUser,
  onUpdateUserRole
}) => {
  const [activeTab, setActiveTab] = useState<'matrix' | 'users'>('matrix');

  const roles: UserRole[] = ['SUPER_ADMIN', 'ADMIN', 'DOCTOR', 'VAIDYA', 'RECEPTIONIST', 'PHARMACIST', 'ACCOUNTANT'];

  const getRoleTag = (role: UserRole): { type: CarbonTagType; label: string } => {
    switch (role) {
      case 'SUPER_ADMIN':
        return { type: 'red', label: 'SUPER ADMIN' };
      case 'ADMIN':
        return { type: 'purple', label: 'ADMIN' };
      case 'DOCTOR':
        return { type: 'blue', label: 'DOCTOR' };
      case 'VAIDYA':
        return { type: 'magenta', label: 'VAIDYA' };
      case 'RECEPTIONIST':
        return { type: 'teal', label: 'RECEPTIONIST' };
      case 'PHARMACIST':
        return { type: 'green', label: 'PHARMACIST' };
      case 'ACCOUNTANT':
        return { type: 'warm-gray', label: 'ACCOUNTANT' };
    }
  };

  const permissionRows = [
    { module: 'Patient Records', perm: 'View All Patient Profiles', key: 'canViewAllPatients' },
    { module: 'Patient Records', perm: 'View Own Record Only (Privacy Boundary)', key: 'canViewOwnPatientRecordOnly' },
    { module: 'Patient Records', perm: 'Create / Register Patient Profile', key: 'canCreatePatient' },
    { module: 'Patient Records', perm: 'Edit Clinical Details, Meds & Diagnoses', key: 'canEditPatient' },
    { module: 'Patient Records', perm: 'Securely Delete / Purge Patient EMR', key: 'canDeletePatient', highlight: true },

    { module: 'Appointments', perm: 'View All Hospital Appointments', key: 'canViewAllAppointments' },
    { module: 'Appointments', perm: 'Schedule Consultations', key: 'canScheduleAppointment' },
    { module: 'Appointments', perm: 'Reschedule Existing Appointments', key: 'canRescheduleAppointment' },
    { module: 'Appointments', perm: 'Cancel Appointments', key: 'canCancelAppointment' },
    { module: 'Appointments', perm: 'Dispatch Automated SMS/Email Reminders', key: 'canSendReminders' },

    { module: 'Clinical & Inpatient', perm: 'Perform Emergency Triage (ESI 1-5)', key: 'canManageTriage' },
    { module: 'Clinical & Inpatient', perm: 'Allocate & Transfer Inpatient Beds', key: 'canManageBeds' },
    { module: 'Clinical & Inpatient', perm: 'Order Diagnostic Pathology & STAT Labs', key: 'canOrderLabs' },
    { module: 'Clinical & Inpatient', perm: 'Verify & Release Lab Results', key: 'canEnterLabResults' },
    { module: 'Pharmacy', perm: 'Write Electronic Prescriptions', key: 'canWritePrescription' },
    { module: 'Pharmacy', perm: 'Dispense Hospital Medications', key: 'canDispenseMedication' },
    { module: 'Pharmacy', perm: 'Reorder Pharmaceutical Drug Stock', key: 'canReorderStock' },

    { module: 'Ayurvedic Clinical Care', perm: 'Ayurvedic Intake (Prakriti, Vikriti, Nadi)', key: 'canConductConsultation' },
    { module: 'Ayurvedic Clinical Care', perm: 'Prescribe Ayurvedic Therapies (Abhyanga, Kizhi)', key: 'canManageTreatments' },
    { module: 'Ayurvedic Clinical Care', perm: 'Manage Classical Panchakarma Protocols', key: 'canManagePanchakarma' },

    { module: 'Billing & Claims', perm: 'Review Patient Invoices & Claims', key: 'canViewBilling' },
    { module: 'Billing & Claims', perm: 'Generate Inpatient Invoices', key: 'canGenerateInvoice' },
    { module: 'Billing & Claims', perm: 'Collect Payment & Discharge Clearance', key: 'canCollectPayment' },
    { module: 'Tariff Administration', perm: 'Configure Rate Master & Hospital Tariffs', key: 'canManageTariffs', highlight: true },

    { module: 'Governance & Security', perm: 'Inspect HIPAA Audit Log Trails', key: 'canViewAuditTrail' },
    { module: 'Governance & Security', perm: 'Manage RBAC Roles & System Users', key: 'canManageRBAC', highlight: true }
  ];

  const userColumns: Column<AppUser>[] = [
    {
      key: 'name',
      header: 'User Name & Profile',
      sortable: true,
      render: (u) => (
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 bg-[#0f62fe] text-white flex items-center justify-center text-xs font-semibold">
            {u.avatarInitials}
          </div>
          <div>
            <div className="font-semibold text-sm text-[#161616]">
              {u.name}
            </div>
            <div className="text-[11px] text-[#525252]">
              {u.title} &bull; {u.department}
            </div>
          </div>
        </div>
      )
    },
    {
      key: 'email',
      header: 'System Email',
      render: (u) => <span className="font-mono text-xs text-[#525252]">{u.email}</span>
    },
    {
      key: 'role',
      header: 'Assigned Role',
      render: (u) => {
        const tag = getRoleTag(u.role);
        return <CarbonTag type={tag.type}>{tag.label}</CarbonTag>;
      }
    },
    {
      key: 'changeRole',
      header: 'Change Role',
      render: (u) => (
        <select
          value={u.role}
          onChange={(e) => onUpdateUserRole(u.id, e.target.value as UserRole)}
          className="bg-[#f4f4f4] border border-[#c6c6c6] h-8 px-2 text-xs font-medium text-[#161616] rounded-none outline-none focus:border-[#0f62fe]"
        >
          <option value="SUPER_ADMIN">SUPER_ADMIN</option>
          <option value="ADMIN">ADMIN</option>
          <option value="DOCTOR">DOCTOR</option>
          <option value="VAIDYA">VAIDYA</option>
          <option value="RECEPTIONIST">RECEPTIONIST</option>
          <option value="PHARMACIST">PHARMACIST</option>
          <option value="ACCOUNTANT">ACCOUNTANT</option>
        </select>
      )
    },
    {
      key: 'session',
      header: 'Session Status',
      render: (u) => {
        const isCurrent = u.id === currentActiveUser.id;
        if (isCurrent) {
          return (
            <span className="px-2 py-1 bg-[#defbe6] text-[#0e6027] font-semibold text-xs border border-[#6fdc8c]">
              Active Session
            </span>
          );
        }
        return (
          <span className="text-xs text-[#8d8d8d] font-mono">
            Direct Login Required
          </span>
        );
      }
    }
  ];

  return (
    <div className="space-y-6">
      {/* Title */}
      <div className="bg-white border border-[#e0e0e0] p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="text-[12px] font-mono uppercase tracking-[0.32px] text-[#525252] mb-1">
            Access Control & Information Governance
          </div>
          <h1 className="text-[28px] font-semibold text-[#161616] tracking-tight leading-none">
            Role-Based Access Control (RBAC) System
          </h1>
          <p className="text-[13px] text-[#525252] mt-2">
            Granular least-privilege permission matrix across SUPER_ADMIN, ADMIN, DOCTOR, VAIDYA, RECEPTIONIST, PHARMACIST, and ACCOUNTANT roles.
          </p>
        </div>

        {/* Current Active User Banner */}
        <div className="p-3 bg-[#edf5ff] border border-[#a6c8ff] text-xs space-y-1">
          <div className="text-[#525252]">Current Simulation Session:</div>
          <div className="flex items-center gap-2">
            <strong className="text-sm text-[#0043ce]">{currentActiveUser.name}</strong>
            <CarbonTag type={getRoleTag(currentActiveUser.role).type} size="sm">
              {currentActiveUser.role.toUpperCase()}
            </CarbonTag>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <CarbonTabs
        selectedId={activeTab}
        onSelect={(id) => setActiveTab(id as any)}
        tabs={[
          { id: 'matrix', label: 'Granular Permissions Matrix' },
          { id: 'users', label: 'Hospital User Accounts & Role Assignment', count: users.length }
        ]}
      />

      {activeTab === 'matrix' ? (
        <div className="bg-white border border-[#e0e0e0] shadow-2xs overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-[#f4f4f4] border-b border-[#e0e0e0] text-[#161616]">
                <th className="py-3 px-4 font-semibold w-48">System Module</th>
                <th className="py-3 px-4 font-semibold">Granular Permission</th>
                {roles.map((r) => (
                  <th key={r} className="py-3 px-4 font-semibold text-center w-28">
                    <CarbonTag type={getRoleTag(r).type} size="sm">
                      {r.toUpperCase()}
                    </CarbonTag>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#e0e0e0]">
              {permissionRows.map((row, idx) => (
                <tr
                  key={idx}
                  className={`hover:bg-[#f4f4f4] transition-colors ${
                    row.highlight ? 'bg-[#fff1f1]/40' : ''
                  }`}
                >
                  <td className="py-2.5 px-4 font-semibold text-[#525252]">
                    {row.module}
                  </td>
                  <td className="py-2.5 px-4 text-[#161616]">
                    <span className={row.highlight ? 'font-semibold text-[#da1e28]' : ''}>
                      {row.perm}
                    </span>
                  </td>
                  {roles.map((r) => {
                    const isAllowed = (ROLE_PERMISSIONS[r] as any)[row.key];
                    return (
                      <td key={r} className="py-2.5 px-4 text-center">
                        {isAllowed ? (
                          <span className="inline-flex items-center justify-center w-5 h-5 bg-[#defbe6] text-[#0e6027] font-bold">
                            <Check className="w-3.5 h-3.5" />
                          </span>
                        ) : (
                          <span className="inline-flex items-center justify-center w-5 h-5 bg-[#f4f4f4] text-[#8d8d8d]">
                            <X className="w-3.5 h-3.5" />
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <CarbonDataTable<AppUser>
          title="Hospital System Users"
          description="Assign clinical staff and registered patients to RBAC authorization groups."
          columns={userColumns}
          data={users}
          searchPlaceholder="Search user name, email, or role..."
        />
      )}
    </div>
  );
};
