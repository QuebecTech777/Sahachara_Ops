import React, { useState } from 'react';
import {
  Users,
  UserPlus,
  Stethoscope,
  Phone,
  Mail,
  Clock,
  ShieldCheck,
  CheckCircle,
  Building,
  Award,
  HandHeart,
  ToggleLeft,
  ToggleRight,
  Eye,
  Edit,
  ShieldAlert,
  Archive,
  RefreshCw,
  History,
  Lock,
  UserCheck,
  AlertTriangle,
  Building2
} from 'lucide-react';
import { CarbonDataTable, Column } from '../components/carbon/CarbonDataTable';
import { CarbonTag, CarbonTagType } from '../components/carbon/CarbonTag';
import { CarbonButton } from '../components/carbon/CarbonButton';
import { CarbonTabs } from '../components/carbon/CarbonTabs';
import { CarbonTile } from '../components/carbon/CarbonTile';
import { CarbonModal } from '../components/carbon/CarbonModal';
import { Doctor, StaffMember, StaffRole, UserRole, ROLE_PERMISSIONS, ClinicalAuditLog, Department, StaffDepartmentAssignment, DepartmentDiscipline } from '../types/hospital';
import { NewStaffMemberModal } from '../components/modals/NewStaffMemberModal';
import { hospitalApi } from '../services/hospitalApi';

interface DoctorsStaffViewProps {
  doctors: Doctor[];
  staff: StaffMember[];
  currentUserRole?: UserRole;
  onAddStaff: (data: Partial<StaffMember>) => Promise<StaffMember | void> | void;
  onUpdateStaffStatus?: (id: string, status: StaffMember['status']) => void;
  onNotify?: (title: string, subtitle?: string, kind?: 'info' | 'success' | 'warning' | 'error') => void;
}

export const DoctorsStaffView: React.FC<DoctorsStaffViewProps> = ({
  doctors,
  staff,
  currentUserRole = 'ADMIN',
  onAddStaff,
  onUpdateStaffStatus,
  onNotify
}) => {
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [isNewStaffModalOpen, setIsNewStaffModalOpen] = useState(false);

  // Phase 6A Modals State
  const [viewingStaff, setViewingStaff] = useState<StaffMember | null>(null);
  const [editingStaff, setEditingStaff] = useState<StaffMember | null>(null);
  const [editFormData, setEditFormData] = useState<Partial<StaffMember>>({});
  const [roleChangeStaff, setRoleChangeStaff] = useState<StaffMember | null>(null);
  const [targetRole, setTargetRole] = useState<UserRole>('DOCTOR');
  const [roleChangeReason, setRoleChangeReason] = useState('');
  const [suspendStaffTarget, setSuspendStaffTarget] = useState<StaffMember | null>(null);
  const [suspendReason, setSuspendReason] = useState('');
  const [archiveStaffTarget, setArchiveStaffTarget] = useState<StaffMember | null>(null);
  const [archiveReason, setArchiveReason] = useState('');
  const [historyStaff, setHistoryStaff] = useState<StaffMember | null>(null);
  const [staffAuditLogs, setStaffAuditLogs] = useState<ClinicalAuditLog[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [newlyCreatedPinInfo, setNewlyCreatedPinInfo] = useState<{ name: string; email: string; pin: string; employeeId: string } | null>(null);

  // Phase 6B: Department Assignments State
  const [managingDeptStaff, setManagingDeptStaff] = useState<StaffMember | null>(null);
  const [staffAssignments, setStaffAssignments] = useState<StaffDepartmentAssignment[]>([]);
  const [staffPrimaryDept, setStaffPrimaryDept] = useState<Department | null>(null);
  const [loadingAssignments, setLoadingAssignments] = useState(false);
  const [activeDepartmentsList, setActiveDepartmentsList] = useState<Department[]>([]);

  // Assign form
  const [assignDeptId, setAssignDeptId] = useState('');
  const [assignIsPrimary, setAssignIsPrimary] = useState(false);
  const [assignRoleTitle, setAssignRoleTitle] = useState('');
  const [submittingAssign, setSubmittingAssign] = useState(false);

  // Transfer modal
  const [transferTargetAsg, setTransferTargetAsg] = useState<StaffDepartmentAssignment | null>(null);
  const [transferTargetDeptId, setTransferTargetDeptId] = useState('');
  const [transferReason, setTransferReason] = useState('');
  const [submittingTransfer, setSubmittingTransfer] = useState(false);

  // Revoke modal
  const [revokeTargetAsg, setRevokeTargetAsg] = useState<StaffDepartmentAssignment | null>(null);
  const [revokeReason, setRevokeReason] = useState('');
  const [submittingRevoke, setSubmittingRevoke] = useState(false);

  const permissions = ROLE_PERMISSIONS[currentUserRole];
  const canManageStaff = permissions?.canManageStaff ?? (currentUserRole === 'SUPER_ADMIN' || currentUserRole === 'ADMIN');
  const isSuperAdmin = currentUserRole === 'SUPER_ADMIN';

  // Filter staff by category
  const filteredStaff = staff.filter((s) => {
    if (selectedCategory === 'all') return true;
    if (selectedCategory === 'VAIDYA') return s.role === 'VAIDYA';
    if (selectedCategory === 'DOCTOR') return s.role === 'DOCTOR';
    if (selectedCategory === 'RECEPTIONIST') return s.role === 'RECEPTIONIST';
    if (selectedCategory === 'PHARMACIST') return s.role === 'PHARMACIST';
    if (selectedCategory === 'ACCOUNTANT') return s.role === 'ACCOUNTANT';
    if (selectedCategory === 'ADMIN') return s.role === 'ADMIN' || s.role === 'SUPER_ADMIN';
    if (selectedCategory === 'SUSPENDED') return s.status === 'suspended' || s.isSuspended;
    if (selectedCategory === 'ARCHIVED') return s.status === 'archived';
    return true;
  });

  const getStatusTag = (status: StaffMember['status'], isSuspended?: boolean): { type: CarbonTagType; label: string } => {
    if (isSuspended || status === 'suspended') {
      return { type: 'red', label: 'SUSPENDED' };
    }
    switch (status) {
      case 'on_duty':
        return { type: 'green', label: 'ON DUTY' };
      case 'active':
        return { type: 'blue', label: 'ACTIVE' };
      case 'pending_activation':
        return { type: 'purple', label: 'PENDING ACTIVATION' };
      case 'on_leave':
        return { type: 'warm-gray', label: 'ON LEAVE' };
      case 'archived':
        return { type: 'cool-gray', label: 'ARCHIVED' };
      case 'inactive':
      default:
        return { type: 'warm-gray', label: 'INACTIVE' };
    }
  };

  const getRoleTag = (role: StaffRole): { type: CarbonTagType; label: string } => {
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
      default:
        return { type: 'cool-gray', label: 'STAFF' };
    }
  };

  const handleOpenEdit = (s: StaffMember) => {
    setEditingStaff(s);
    setEditFormData({
      name: s.name,
      phone: s.phone,
      designation: s.designation,
      department: s.department,
      licenseNumber: s.licenseNumber || '',
      qualification: s.qualification || '',
      discipline: s.discipline || '',
      specialty: s.specialty || '',
      shift: s.shift || '',
      employmentType: s.employmentType || 'Full-Time',
      address: s.address || '',
      emergencyContactName: s.emergencyContactName || '',
      emergencyContactPhone: s.emergencyContactPhone || '',
      notes: s.notes || ''
    });
  };

  const handleSaveEdit = async () => {
    if (!editingStaff) return;
    try {
      await hospitalApi.updateStaff(editingStaff.id, editFormData);
      if (onNotify) {
        onNotify('Staff Profile Updated', `Updated profile of ${editingStaff.name} successfully.`, 'success');
      }
      setEditingStaff(null);
    } catch (err: any) {
      if (onNotify) {
        onNotify('Update Failed', err.message || 'Could not update staff member profile.', 'error');
      }
    }
  };

  const handleExecuteRoleChange = async () => {
    if (!roleChangeStaff) return;
    try {
      await hospitalApi.changeStaffRole(roleChangeStaff.id, targetRole, roleChangeReason);
      if (onNotify) {
        onNotify('Role Changed', `Role for ${roleChangeStaff.name} updated to ${targetRole}.`, 'success');
      }
      setRoleChangeStaff(null);
      setRoleChangeReason('');
    } catch (err: any) {
      if (onNotify) {
        onNotify('Role Change Failed', err.message || 'Could not change staff role.', 'error');
      }
    }
  };

  const handleExecuteSuspend = async () => {
    if (!suspendStaffTarget) return;
    if (!suspendReason.trim()) {
      if (onNotify) onNotify('Reason Required', 'Please specify a reason for suspension.', 'error');
      return;
    }
    try {
      await hospitalApi.suspendStaff(suspendStaffTarget.id, suspendReason);
      if (onNotify) {
        onNotify('Staff Suspended', `Staff member ${suspendStaffTarget.name} has been suspended.`, 'warning');
      }
      setSuspendStaffTarget(null);
      setSuspendReason('');
    } catch (err: any) {
      if (onNotify) {
        onNotify('Suspension Failed', err.message || 'Could not suspend staff member.', 'error');
      }
    }
  };

  const handleExecuteReactivate = async (s: StaffMember) => {
    try {
      await hospitalApi.reactivateStaff(s.id, 'Administrative reinstatement');
      if (onNotify) {
        onNotify('Staff Reactivated', `Account for ${s.name} has been restored to active status.`, 'success');
      }
    } catch (err: any) {
      if (onNotify) {
        onNotify('Reactivation Failed', err.message || 'Could not reactivate staff member.', 'error');
      }
    }
  };

  const handleExecuteArchive = async () => {
    if (!archiveStaffTarget) return;
    if (!archiveReason.trim()) {
      if (onNotify) onNotify('Reason Required', 'Please specify an archival reason.', 'error');
      return;
    }
    try {
      await hospitalApi.archiveStaff(archiveStaffTarget.id, archiveReason);
      if (onNotify) {
        onNotify('Staff Record Archived', `Employment record for ${archiveStaffTarget.name} has been archived.`, 'info');
      }
      setArchiveStaffTarget(null);
      setArchiveReason('');
    } catch (err: any) {
      if (onNotify) {
        onNotify('Archival Failed', err.message || 'Could not archive staff record.', 'error');
      }
    }
  };

  const handleRegeneratePin = async (s: StaffMember) => {
    try {
      const res = await hospitalApi.regenerateStaffPin(s.id);
      setNewlyCreatedPinInfo({
        name: s.name,
        email: s.email,
        employeeId: s.employeeId,
        pin: res.activationPin
      });
      if (onNotify) {
        onNotify('New PIN Issued', `Generated new 4-digit activation PIN for ${s.name}.`, 'success');
      }
    } catch (err: any) {
      if (onNotify) {
        onNotify('PIN Regeneration Failed', err.message || 'Could not regenerate activation PIN.', 'error');
      }
    }
  };

  const handleOpenHistory = async (s: StaffMember) => {
    setHistoryStaff(s);
    setLoadingHistory(true);
    try {
      const logs = await hospitalApi.getStaffHistory(s.id);
      setStaffAuditLogs(logs);
    } catch {
      setStaffAuditLogs([]);
    } finally {
      setLoadingHistory(false);
    }
  };

  const getDisciplineTag = (discipline?: string): { type: CarbonTagType; label: string } => {
    switch (discipline) {
      case 'AYURVEDA':
        return { type: 'magenta', label: 'AYURVEDA' };
      case 'MODERN_MEDICINE':
        return { type: 'blue', label: 'MODERN MEDICINE' };
      case 'OPERATIONAL':
        return { type: 'teal', label: 'OPERATIONAL' };
      case 'ALLIED':
        return { type: 'purple', label: 'ALLIED' };
      default:
        return { type: 'cool-gray', label: discipline || 'GENERAL' };
    }
  };

  const getAssignmentStatusTag = (status: string): { type: CarbonTagType; label: string } => {
    switch (status) {
      case 'active':
      case 'ACTIVE':
        return { type: 'green', label: 'ACTIVE' };
      case 'completed':
      case 'COMPLETED':
        return { type: 'cool-gray', label: 'COMPLETED' };
      case 'transferred':
      case 'TRANSFERRED':
        return { type: 'purple', label: 'TRANSFERRED' };
      case 'revoked':
      case 'REVOKED':
        return { type: 'red', label: 'REVOKED' };
      default:
        return { type: 'warm-gray', label: status.toUpperCase() };
    }
  };

  const loadStaffDepartmentData = async (staffId: string) => {
    setLoadingAssignments(true);
    try {
      const [assignments, primaryRes] = await Promise.all([
        hospitalApi.getStaffDepartments(staffId),
        hospitalApi.getStaffPrimaryDepartment(staffId)
      ]);
      setStaffAssignments(assignments || []);
      setStaffPrimaryDept(primaryRes?.primaryDepartment || null);
    } catch (err) {
      console.error('Failed to load staff department data:', err);
      setStaffAssignments([]);
      setStaffPrimaryDept(null);
    } finally {
      setLoadingAssignments(false);
    }
  };

  const loadActiveDepartments = async () => {
    try {
      const res = await hospitalApi.getDepartments({ isActive: true });
      setActiveDepartmentsList(res || []);
    } catch (err) {
      console.error('Failed to load active departments:', err);
      setActiveDepartmentsList([]);
    }
  };

  const handleOpenDepartmentManagement = async (s: StaffMember) => {
    setManagingDeptStaff(s);
    setAssignDeptId('');
    setAssignIsPrimary(false);
    setAssignRoleTitle('');
    await Promise.all([
      loadStaffDepartmentData(s.id),
      loadActiveDepartments()
    ]);
  };

  const handleOpenViewStaff = (s: StaffMember) => {
    setViewingStaff(s);
    loadStaffDepartmentData(s.id);
  };

  const handleAssignDepartment = async () => {
    if (!managingDeptStaff || !assignDeptId) {
      if (onNotify) onNotify('Selection Required', 'Please select a department to assign.', 'error');
      return;
    }
    setSubmittingAssign(true);
    try {
      await hospitalApi.assignStaffDepartment(managingDeptStaff.id, {
        departmentId: assignDeptId,
        isPrimary: assignIsPrimary,
        roleTitle: assignRoleTitle.trim() || undefined
      });
      if (onNotify) {
        onNotify('Department Assigned', `Assigned ${managingDeptStaff.name} to department.`, 'success');
      }
      setAssignDeptId('');
      setAssignIsPrimary(false);
      setAssignRoleTitle('');
      await loadStaffDepartmentData(managingDeptStaff.id);
    } catch (err: any) {
      if (onNotify) {
        onNotify('Assignment Failed', err.message || 'Could not assign department.', 'error');
      }
    } finally {
      setSubmittingAssign(false);
    }
  };

  const handleSetPrimary = async (departmentId: string) => {
    if (!managingDeptStaff) return;
    try {
      await hospitalApi.changeStaffPrimaryDepartment(managingDeptStaff.id, departmentId);
      if (onNotify) {
        onNotify('Primary Department Updated', 'Primary department assignment has been updated.', 'success');
      }
      await loadStaffDepartmentData(managingDeptStaff.id);
    } catch (err: any) {
      if (onNotify) {
        onNotify('Update Failed', err.message || 'Could not set primary department.', 'error');
      }
    }
  };

  const handleCompleteAssignment = async (assignmentId: string) => {
    if (!managingDeptStaff) return;
    try {
      await hospitalApi.completeStaffAssignment(managingDeptStaff.id, assignmentId);
      if (onNotify) {
        onNotify('Assignment Completed', 'Staff department assignment marked completed.', 'info');
      }
      await loadStaffDepartmentData(managingDeptStaff.id);
    } catch (err: any) {
      if (onNotify) {
        onNotify('Action Failed', err.message || 'Could not complete assignment.', 'error');
      }
    }
  };

  const handleExecuteTransfer = async () => {
    if (!managingDeptStaff || !transferTargetAsg || !transferTargetDeptId) {
      if (onNotify) onNotify('Target Department Required', 'Please select a target department for transfer.', 'error');
      return;
    }
    setSubmittingTransfer(true);
    try {
      await hospitalApi.transferStaffAssignment(
        managingDeptStaff.id,
        transferTargetAsg.id,
        transferTargetDeptId,
        transferReason.trim() || undefined
      );
      if (onNotify) {
        onNotify('Staff Transferred', 'Staff member transferred to new department.', 'success');
      }
      setTransferTargetAsg(null);
      setTransferTargetDeptId('');
      setTransferReason('');
      await loadStaffDepartmentData(managingDeptStaff.id);
    } catch (err: any) {
      if (onNotify) {
        onNotify('Transfer Failed', err.message || 'Could not transfer staff department.', 'error');
      }
    } finally {
      setSubmittingTransfer(false);
    }
  };

  const handleExecuteRevoke = async () => {
    if (!managingDeptStaff || !revokeTargetAsg) return;
    if (!revokeReason.trim()) {
      if (onNotify) onNotify('Reason Required', 'Please provide a mandatory revocation reason.', 'error');
      return;
    }
    setSubmittingRevoke(true);
    try {
      await hospitalApi.revokeStaffAssignment(
        managingDeptStaff.id,
        revokeTargetAsg.id,
        revokeReason.trim()
      );
      if (onNotify) {
        onNotify('Assignment Revoked', 'Staff department assignment was revoked.', 'warning');
      }
      setRevokeTargetAsg(null);
      setRevokeReason('');
      await loadStaffDepartmentData(managingDeptStaff.id);
    } catch (err: any) {
      if (onNotify) {
        onNotify('Revocation Failed', err.message || 'Could not revoke assignment.', 'error');
      }
    } finally {
      setSubmittingRevoke(false);
    }
  };

  const columns: Column<StaffMember>[] = [
    {
      key: 'employeeId',
      header: 'Employee ID & Lic.',
      width: '140px',
      sortable: true,
      render: (s) => (
        <div>
          <span className="font-mono text-xs font-semibold text-[#0f62fe]">
            {s.employeeId}
          </span>
          <div className="font-mono text-[10px] text-[#525252] mt-0.5">
            {s.licenseNumber || 'Lic: N/A'}
          </div>
        </div>
      )
    },
    {
      key: 'name',
      header: 'Staff Name & Designation',
      sortable: true,
      render: (s) => (
        <div>
          <div className="font-semibold text-sm text-[#161616]">
            {s.name}
          </div>
          <div className="text-[11px] text-[#525252]">
            {s.designation}
          </div>
          {s.qualification && (
            <div className="text-[10px] font-mono text-[#0043ce] mt-0.5">
              {s.qualification}
            </div>
          )}
        </div>
      )
    },
    {
      key: 'role',
      header: 'Workforce Role',
      sortable: true,
      render: (s) => {
        const tag = getRoleTag(s.role);
        return <CarbonTag type={tag.type}>{tag.label}</CarbonTag>;
      }
    },
    {
      key: 'department',
      header: 'Department & Shift',
      sortable: true,
      render: (s) => (
        <div className="text-xs">
          <div className="font-medium text-[#161616]">{s.department}</div>
          <div className="text-[11px] text-[#525252] flex items-center gap-1 mt-0.5">
            <Clock className="w-3 h-3 text-[#525252]" />
            <span>{s.shift || 'General'}</span>
          </div>
        </div>
      )
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      render: (s) => {
        const tag = getStatusTag(s.status, s.isSuspended);
        return <CarbonTag type={tag.type}>{tag.label}</CarbonTag>;
      }
    },
    {
      key: 'contact',
      header: 'Communication',
      render: (s) => (
        <div className="text-xs text-[#525252] font-mono space-y-0.5">
          <div className="flex items-center gap-1">
            <Phone className="w-3 h-3 text-[#0f62fe]" />
            <span>{s.phone}</span>
          </div>
          <div className="text-[10px] text-[#8d8d8d] truncate max-w-[140px]">
            {s.email}
          </div>
        </div>
      )
    },
    {
      key: 'actions',
      header: 'Lifecycle Actions',
      render: (s) => {
        const isTargetSuperAdmin = s.role === 'SUPER_ADMIN';
        const canMutateThisStaff = isSuperAdmin || (currentUserRole === 'ADMIN' && !isTargetSuperAdmin);

        return (
          <div className="flex items-center gap-1">
            {/* View Profile */}
            <CarbonButton
              kind="ghost"
              size="sm"
              onClick={() => handleOpenViewStaff(s)}
              title="View Staff Profile Dossier"
            >
              <Eye className="w-3.5 h-3.5 text-[#0f62fe]" />
            </CarbonButton>

            {/* Department Assignments (Phase 6B) */}
            <CarbonButton
              kind="ghost"
              size="sm"
              onClick={() => handleOpenDepartmentManagement(s)}
              title="Department Assignments (Phase 6B)"
            >
              <Building2 className="w-3.5 h-3.5 text-[#0043ce]" />
            </CarbonButton>

            {canManageStaff && canMutateThisStaff && (
              <>
                {/* Edit Profile */}
                <CarbonButton
                  kind="ghost"
                  size="sm"
                  onClick={() => handleOpenEdit(s)}
                  title="Edit Permitted Staff Details"
                >
                  <Edit className="w-3.5 h-3.5 text-[#525252]" />
                </CarbonButton>

                {/* Change Role */}
                <CarbonButton
                  kind="ghost"
                  size="sm"
                  onClick={() => {
                    setRoleChangeStaff(s);
                    setTargetRole(s.role);
                  }}
                  title="Assign / Modify Role"
                >
                  <ShieldCheck className="w-3.5 h-3.5 text-[#6929c4]" />
                </CarbonButton>

                {/* Regenerate PIN if pending */}
                {s.status === 'pending_activation' && (
                  <CarbonButton
                    kind="ghost"
                    size="sm"
                    onClick={() => handleRegeneratePin(s)}
                    title="Regenerate Security PIN"
                  >
                    <RefreshCw className="w-3.5 h-3.5 text-[#8a3800]" />
                  </CarbonButton>
                )}

                {/* Suspend or Reactivate */}
                {s.status === 'suspended' || s.isSuspended ? (
                  <CarbonButton
                    kind="ghost"
                    size="sm"
                    onClick={() => handleExecuteReactivate(s)}
                    title="Reactivate Account"
                  >
                    <UserCheck className="w-3.5 h-3.5 text-[#0e6027]" />
                  </CarbonButton>
                ) : s.status !== 'archived' ? (
                  <CarbonButton
                    kind="ghost"
                    size="sm"
                    onClick={() => setSuspendStaffTarget(s)}
                    title="Suspend Account"
                  >
                    <ShieldAlert className="w-3.5 h-3.5 text-[#da1e28]" />
                  </CarbonButton>
                ) : null}

                {/* Archive Record */}
                {s.status !== 'archived' && (
                  <CarbonButton
                    kind="ghost"
                    size="sm"
                    onClick={() => setArchiveStaffTarget(s)}
                    title="Archive Employment Record"
                  >
                    <Archive className="w-3.5 h-3.5 text-[#525252]" />
                  </CarbonButton>
                )}
              </>
            )}

            {/* Audit History */}
            <CarbonButton
              kind="ghost"
              size="sm"
              onClick={() => handleOpenHistory(s)}
              title="View Staff Audit Trail"
            >
              <History className="w-3.5 h-3.5 text-[#525252]" />
            </CarbonButton>
          </div>
        );
      }
    }
  ];

  const onDutyCount = staff.filter((s) => s.status === 'on_duty').length;
  const activeCount = staff.filter((s) => s.status === 'active' || s.status === 'on_duty').length;
  const pendingCount = staff.filter((s) => s.status === 'pending_activation').length;
  const departmentsCount = new Set(staff.map((s) => s.department)).size;

  return (
    <div className="space-y-6">
      {/* Title Bar */}
      <div className="bg-white border border-[#e0e0e0] p-4 sm:p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="text-[12px] font-mono uppercase tracking-[0.32px] text-[#525252] mb-1">
            Workforce Directorate & Central Staff Registry (Phase 6A)
          </div>
          <h1 className="text-[28px] font-semibold text-[#161616] tracking-tight leading-none">
            Hospital Staff & Account Lifecycle Management
          </h1>
          <p className="text-[13px] text-[#525252] mt-2">
            Centralized PostgreSQL staff master records with sequence-backed IDs, cryptographic PIN activation, strict 7-role RBAC, session revocation on suspension, and soft-archival.
          </p>
        </div>

        {canManageStaff && (
          <div className="flex flex-wrap items-center gap-2">
            <CarbonButton
              kind="primary"
              renderIcon={UserPlus}
              onClick={() => setIsNewStaffModalOpen(true)}
            >
              Onboard Staff Member
            </CarbonButton>
          </div>
        )}
      </div>

      {/* KPI Tiles */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <CarbonTile>
          <div className="text-xs text-[#525252] font-mono">Total Staff Roster</div>
          <div className="text-2xl font-semibold text-[#161616] mt-1">{staff.length}</div>
          <div className="text-[11px] text-[#525252] mt-0.5">Across {departmentsCount} departments</div>
        </CarbonTile>

        <CarbonTile>
          <div className="text-xs text-[#0e6027] font-mono">Active Workforce</div>
          <div className="text-2xl font-semibold text-[#0e6027] mt-1">{activeCount}</div>
          <div className="text-[11px] text-[#525252] mt-0.5">{onDutyCount} currently on duty</div>
        </CarbonTile>

        <CarbonTile>
          <div className="text-xs text-[#8a3800] font-mono">Pending Activation</div>
          <div className="text-2xl font-semibold text-[#8a3800] mt-1">{pendingCount}</div>
          <div className="text-[11px] text-[#525252] mt-0.5">Temporary PIN issued</div>
        </CarbonTile>

        <CarbonTile>
          <div className="text-xs text-[#6929c4] font-mono">Clinical Practitioners</div>
          <div className="text-2xl font-semibold text-[#6929c4] mt-1">
            {staff.filter((s) => s.role === 'DOCTOR' || s.role === 'VAIDYA').length}
          </div>
          <div className="text-[11px] text-[#525252] mt-0.5">Modern Doctors & Vaidyas</div>
        </CarbonTile>
      </div>

      {/* Category Tabs */}
      <CarbonTabs
        selectedId={selectedCategory}
        onSelect={setSelectedCategory}
        tabs={[
          { id: 'all', label: 'All Workforce', count: staff.length },
          { id: 'VAIDYA', label: 'Vaidyas', count: staff.filter((s) => s.role === 'VAIDYA').length },
          { id: 'DOCTOR', label: 'Doctors', count: staff.filter((s) => s.role === 'DOCTOR').length },
          { id: 'RECEPTIONIST', label: 'Admissions & Reception', count: staff.filter((s) => s.role === 'RECEPTIONIST').length },
          { id: 'PHARMACIST', label: 'Pharmacy', count: staff.filter((s) => s.role === 'PHARMACIST').length },
          { id: 'ACCOUNTANT', label: 'Billing & Accounts', count: staff.filter((s) => s.role === 'ACCOUNTANT').length },
          { id: 'ADMIN', label: 'Administration', count: staff.filter((s) => s.role === 'ADMIN' || s.role === 'SUPER_ADMIN').length },
          { id: 'SUSPENDED', label: 'Suspended', count: staff.filter((s) => s.status === 'suspended' || s.isSuspended).length }
        ]}
      />

      {/* Staff DataTable */}
      <CarbonDataTable<StaffMember>
        title="Central Hospital Staff Directory"
        description="Authoritative master record of hospital personnel, professional licenses, employment status, and RBAC authority."
        columns={columns}
        data={filteredStaff}
        searchPlaceholder="Search by name, employee ID, role, department, or phone..."
        initialSortKey="employeeId"
      />

      {/* 1. Add Staff Modal */}
      {isNewStaffModalOpen && (
        <NewStaffMemberModal
          isOpen={true}
          onClose={() => setIsNewStaffModalOpen(false)}
          onSubmit={async (newStaffData) => {
            const created = await onAddStaff(newStaffData);
            setIsNewStaffModalOpen(false);
            if (created && (created as any).activationPin) {
              setNewlyCreatedPinInfo({
                name: created.name,
                email: created.email,
                employeeId: created.employeeId,
                pin: (created as any).activationPin
              });
            }
          }}
        />
      )}

      {/* 2. Newly Created PIN Secure Dialog */}
      {newlyCreatedPinInfo && (
        <CarbonModal
          isOpen={true}
          title="Staff Member Onboarded — Temporary Security PIN"
          subtitle="A one-time 4-digit security PIN has been generated for account activation."
          onClose={() => setNewlyCreatedPinInfo(null)}
          onRequestSubmit={() => setNewlyCreatedPinInfo(null)}
          primaryButtonText="Done & Dismiss"
        >
          <div className="space-y-4 text-xs">
            <div className="p-4 bg-[#edf5ff] border border-[#a6c8ff] rounded-sm space-y-2">
              <div className="font-semibold text-sm text-[#0043ce]">
                {newlyCreatedPinInfo.name} ({newlyCreatedPinInfo.employeeId})
              </div>
              <div className="text-[11px] text-[#525252]">
                Registered Official Email: <span className="font-mono font-semibold">{newlyCreatedPinInfo.email}</span>
              </div>
              <div className="pt-2 text-center">
                <div className="text-[11px] text-[#525252] uppercase font-mono tracking-wider mb-1">One-Time Activation Security PIN:</div>
                <div className="p-3 bg-white border border-[#a6c8ff] font-mono text-2xl font-bold tracking-widest text-[#0f62fe] inline-block px-8 rounded">
                  {newlyCreatedPinInfo.pin}
                </div>
              </div>
              <p className="text-[11px] text-[#525252] pt-2">
                <strong>Security Notice:</strong> This PIN is single-use, expires in 24 hours, and is stored only as a cryptographic hash in the database. Convey this PIN to the staff member so they can set their password via &quot;Activate Staff Account&quot;.
              </p>
            </div>
          </div>
        </CarbonModal>
      )}



      {/* 10. Transfer Staff Department Modal */}
      {transferTargetAsg && managingDeptStaff && (
        <CarbonModal
          isOpen={true}
          title={`Transfer Department: ${managingDeptStaff.name}`}
          subtitle={`Current Department: ${transferTargetAsg.department?.name || 'Department'} (${transferTargetAsg.department?.code})`}
          onClose={() => setTransferTargetAsg(null)}
          onRequestSubmit={handleExecuteTransfer}
          primaryButtonText={submittingTransfer ? 'Transferring...' : 'Confirm Transfer'}
          secondaryButtonText="Cancel"
        >
          <div className="space-y-3 text-xs">
            <p className="text-[#525252]">
              Transferring will conclude the current assignment and establish a new active assignment in the target department.
            </p>
            <div>
              <label className="block text-[11px] font-mono uppercase text-[#525252] mb-1">Target Department *</label>
              <select
                value={transferTargetDeptId}
                onChange={(e) => setTransferTargetDeptId(e.target.value)}
                className="w-full h-9 px-3 bg-[#f4f4f4] border border-[#8d8d8d] focus:bg-white focus:border-[#0f62fe] outline-none cursor-pointer"
              >
                <option value="">-- Choose destination department --</option>
                {activeDepartmentsList
                  .filter(d => d.id !== transferTargetAsg.departmentId)
                  .map(d => (
                    <option key={d.id} value={d.id}>
                      {d.name} ({d.code}) — {d.discipline}
                    </option>
                  ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-mono uppercase text-[#525252] mb-1">Transfer Reason / Operational Note</label>
              <input
                type="text"
                value={transferReason}
                onChange={(e) => setTransferReason(e.target.value)}
                placeholder="e.g. Inter-departmental clinical rotation, administrative transfer..."
                className="w-full h-9 px-3 bg-[#f4f4f4] border border-[#8d8d8d] focus:bg-white focus:border-[#0f62fe] outline-none"
              />
            </div>
          </div>
        </CarbonModal>
      )}

      {/* 11. Revoke Staff Department Assignment Modal */}
      {revokeTargetAsg && managingDeptStaff && (
        <CarbonModal
          isOpen={true}
          title={`Revoke Assignment: ${managingDeptStaff.name}`}
          subtitle={`Department: ${revokeTargetAsg.department?.name || 'Department'} (${revokeTargetAsg.department?.code})`}
          onClose={() => setRevokeTargetAsg(null)}
          onRequestSubmit={handleExecuteRevoke}
          primaryButtonText={submittingRevoke ? 'Revoking...' : 'Confirm Revocation'}
          secondaryButtonText="Cancel"
        >
          <div className="space-y-3 text-xs">
            <div className="p-3 bg-[#fff1f1] border border-[#ffd7d9] text-[#da1e28]">
              <strong>Mandatory Revocation Notice:</strong> Revoking a department assignment immediately removes the staff member from this department roster. A permanent audit reason is required.
            </div>
            <div>
              <label className="block text-[11px] font-mono uppercase text-[#525252] mb-1">Revocation Reason *</label>
              <textarea
                value={revokeReason}
                onChange={(e) => setRevokeReason(e.target.value)}
                rows={3}
                placeholder="Specify required operational reason for revoking this assignment..."
                className="w-full p-2 bg-[#f4f4f4] border border-[#8d8d8d] focus:bg-white focus:border-[#0f62fe] outline-none"
              />
            </div>
          </div>
        </CarbonModal>
      )}

      {/* 3. View Staff Profile Modal */}
      {viewingStaff && (
        <CarbonModal
          isOpen={true}
          title={`Staff Profile: ${viewingStaff.name}`}
          subtitle={`${viewingStaff.role} • ${viewingStaff.employeeId}`}
          onClose={() => setViewingStaff(null)}
          onRequestSubmit={() => setViewingStaff(null)}
          primaryButtonText="Close"
        >
          <div className="space-y-4 text-xs">
            <div className="grid grid-cols-2 gap-4 p-3 bg-[#f4f4f4] border border-[#e0e0e0]">
              <div>
                <span className="text-[11px] font-mono uppercase text-[#525252]">Employee ID:</span>
                <div className="font-mono font-semibold text-[#0f62fe]">{viewingStaff.employeeId}</div>
              </div>
              <div>
                <span className="text-[11px] font-mono uppercase text-[#525252]">System Role:</span>
                <div><CarbonTag type={getRoleTag(viewingStaff.role).type}>{viewingStaff.role}</CarbonTag></div>
              </div>
              <div>
                <span className="text-[11px] font-mono uppercase text-[#525252]">Designation:</span>
                <div className="font-medium text-[#161616]">{viewingStaff.designation}</div>
              </div>
              <div>
                <span className="text-[11px] font-mono uppercase text-[#525252]">Department:</span>
                <div className="font-medium text-[#161616]">{viewingStaff.department}</div>
              </div>
              <div>
                <span className="text-[11px] font-mono uppercase text-[#525252]">Account Status:</span>
                <div><CarbonTag type={getStatusTag(viewingStaff.status, viewingStaff.isSuspended).type}>{viewingStaff.status.toUpperCase()}</CarbonTag></div>
              </div>
              <div>
                <span className="text-[11px] font-mono uppercase text-[#525252]">Employment Type:</span>
                <div className="text-[#161616]">{viewingStaff.employmentType || 'Full-Time'}</div>
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="font-semibold text-xs text-[#161616] uppercase font-mono tracking-wider">Contact & Personal Details</h4>
              <div className="grid grid-cols-2 gap-2 p-2 border border-[#e0e0e0]">
                <div>Email: <span className="font-mono">{viewingStaff.email}</span></div>
                <div>Phone: <span className="font-mono">{viewingStaff.phone}</span></div>
                <div>Address: <span>{viewingStaff.address || 'Not Recorded'}</span></div>
                <div>Emergency Contact: <span>{viewingStaff.emergencyContactName ? `${viewingStaff.emergencyContactName} (${viewingStaff.emergencyContactPhone || 'No Phone'})` : 'Not Recorded'}</span></div>
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="font-semibold text-xs text-[#161616] uppercase font-mono tracking-wider">Professional Credentials</h4>
              <div className="grid grid-cols-2 gap-2 p-2 border border-[#e0e0e0]">
                <div>Qualification: <span>{viewingStaff.qualification || 'Not Recorded'}</span></div>
                <div>License / Reg No: <span className="font-mono">{viewingStaff.licenseNumber || 'Not Required / Not Recorded'}</span></div>
                <div>Discipline: <span>{viewingStaff.discipline || 'Clinical / Hospital Operations'}</span></div>
                <div>Specialty: <span>{viewingStaff.specialty || 'General Practice'}</span></div>
              </div>
            </div>

            {/* Relational Department Assignments (Phase 6B) */}
            <div className="space-y-3 pt-3 border-t border-[#e0e0e0]">
              <div className="flex items-center justify-between">
                <h4 className="font-semibold text-xs text-[#161616] uppercase font-mono tracking-wider flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5 text-[#0f62fe]" />
                  <span>Relational Department Assignments (Phase 6B)</span>
                </h4>
                <CarbonButton
                  kind="tertiary"
                  size="sm"
                  onClick={() => {
                    handleOpenDepartmentManagement(viewingStaff);
                  }}
                >
                  {canManageStaff ? 'Manage Assignments' : 'View Assignments'}
                </CarbonButton>
              </div>

              {/* Crucial Section 6 Invariant: Primary Department */}
              <div className="p-3 bg-white border border-[#e0e0e0]">
                <div className="text-[11px] font-mono uppercase text-[#525252] mb-1">Authoritative Primary Department:</div>
                {loadingAssignments ? (
                  <div className="text-xs text-[#525252] py-1">Loading department data...</div>
                ) : staffPrimaryDept ? (
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-semibold text-sm text-[#161616]">{staffPrimaryDept.name}</span>
                      <span className="font-mono text-xs text-[#0f62fe] ml-2">[{staffPrimaryDept.code}]</span>
                      <span className="ml-2">
                        <CarbonTag type={getDisciplineTag(staffPrimaryDept.discipline).type}>
                          {staffPrimaryDept.discipline}
                        </CarbonTag>
                      </span>
                    </div>
                    <CarbonTag type="blue">PRIMARY</CarbonTag>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <CarbonTag type="warm-gray">No primary department assigned</CarbonTag>
                    <span className="text-[11px] text-[#525252] italic">
                      (No active primary relational department assignment)
                    </span>
                  </div>
                )}
                <div className="text-[11px] text-[#8d8d8d] mt-2 pt-2 border-t border-[#f4f4f4]">
                  Legacy profile department string: <span className="font-mono text-[#525252]">{viewingStaff.department || 'None'}</span> (Informational legacy record; not authoritative)
                </div>
              </div>

              {/* Active Secondary Assignments */}
              {!loadingAssignments && staffAssignments.filter(a => a.status === 'active').length > 0 && (
                <div className="space-y-1">
                  <div className="text-[11px] font-mono uppercase text-[#525252]">Active Department Roster:</div>
                  <div className="space-y-1">
                    {staffAssignments
                      .filter(a => a.status === 'active')
                      .map(a => (
                        <div key={a.id} className="flex items-center justify-between p-2 bg-[#f4f4f4] border border-[#e0e0e0] text-xs">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-[#161616]">{a.department?.name || 'Department'}</span>
                            <span className="font-mono text-[10px] text-[#525252]">[{a.department?.code}]</span>
                            {a.roleTitle && <span className="text-[#525252]">({a.roleTitle})</span>}
                          </div>
                          <div className="flex items-center gap-1.5">
                            {a.isPrimary ? (
                              <CarbonTag type="blue">PRIMARY</CarbonTag>
                            ) : (
                              <CarbonTag type="teal">SECONDARY</CarbonTag>
                            )}
                            <CarbonTag type="green">ACTIVE</CarbonTag>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>

            {viewingStaff.isSuspended && (
              <div className="p-3 bg-[#fff1f1] border border-[#ffd7d9] text-[#da1e28]">
                <strong>Account Suspended:</strong> {viewingStaff.suspendedReason || 'Administrative suspension'}
                {viewingStaff.suspendedAt && <div className="text-[10px] text-[#525252] mt-1">Suspended on: {new Date(viewingStaff.suspendedAt).toLocaleString()}</div>}
              </div>
            )}

            {viewingStaff.status === 'archived' && (
              <div className="p-3 bg-[#f4f4f4] border border-[#8d8d8d] text-[#525252]">
                <strong>Record Archived:</strong> {viewingStaff.archivedReason || 'Employment concluded'}
                {viewingStaff.archivedAt && <div className="text-[10px] text-[#525252] mt-1">Archived on: {new Date(viewingStaff.archivedAt).toLocaleString()}</div>}
              </div>
            )}
          </div>
        </CarbonModal>
      )}



      {/* 10. Transfer Staff Department Modal */}
      {transferTargetAsg && managingDeptStaff && (
        <CarbonModal
          isOpen={true}
          title={`Transfer Department: ${managingDeptStaff.name}`}
          subtitle={`Current Department: ${transferTargetAsg.department?.name || 'Department'} (${transferTargetAsg.department?.code})`}
          onClose={() => setTransferTargetAsg(null)}
          onRequestSubmit={handleExecuteTransfer}
          primaryButtonText={submittingTransfer ? 'Transferring...' : 'Confirm Transfer'}
          secondaryButtonText="Cancel"
        >
          <div className="space-y-3 text-xs">
            <p className="text-[#525252]">
              Transferring will conclude the current assignment and establish a new active assignment in the target department.
            </p>
            <div>
              <label className="block text-[11px] font-mono uppercase text-[#525252] mb-1">Target Department *</label>
              <select
                value={transferTargetDeptId}
                onChange={(e) => setTransferTargetDeptId(e.target.value)}
                className="w-full h-9 px-3 bg-[#f4f4f4] border border-[#8d8d8d] focus:bg-white focus:border-[#0f62fe] outline-none cursor-pointer"
              >
                <option value="">-- Choose destination department --</option>
                {activeDepartmentsList
                  .filter(d => d.id !== transferTargetAsg.departmentId)
                  .map(d => (
                    <option key={d.id} value={d.id}>
                      {d.name} ({d.code}) — {d.discipline}
                    </option>
                  ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-mono uppercase text-[#525252] mb-1">Transfer Reason / Operational Note</label>
              <input
                type="text"
                value={transferReason}
                onChange={(e) => setTransferReason(e.target.value)}
                placeholder="e.g. Inter-departmental clinical rotation, administrative transfer..."
                className="w-full h-9 px-3 bg-[#f4f4f4] border border-[#8d8d8d] focus:bg-white focus:border-[#0f62fe] outline-none"
              />
            </div>
          </div>
        </CarbonModal>
      )}

      {/* 11. Revoke Staff Department Assignment Modal */}
      {revokeTargetAsg && managingDeptStaff && (
        <CarbonModal
          isOpen={true}
          title={`Revoke Assignment: ${managingDeptStaff.name}`}
          subtitle={`Department: ${revokeTargetAsg.department?.name || 'Department'} (${revokeTargetAsg.department?.code})`}
          onClose={() => setRevokeTargetAsg(null)}
          onRequestSubmit={handleExecuteRevoke}
          primaryButtonText={submittingRevoke ? 'Revoking...' : 'Confirm Revocation'}
          secondaryButtonText="Cancel"
        >
          <div className="space-y-3 text-xs">
            <div className="p-3 bg-[#fff1f1] border border-[#ffd7d9] text-[#da1e28]">
              <strong>Mandatory Revocation Notice:</strong> Revoking a department assignment immediately removes the staff member from this department roster. A permanent audit reason is required.
            </div>
            <div>
              <label className="block text-[11px] font-mono uppercase text-[#525252] mb-1">Revocation Reason *</label>
              <textarea
                value={revokeReason}
                onChange={(e) => setRevokeReason(e.target.value)}
                rows={3}
                placeholder="Specify required operational reason for revoking this assignment..."
                className="w-full p-2 bg-[#f4f4f4] border border-[#8d8d8d] focus:bg-white focus:border-[#0f62fe] outline-none"
              />
            </div>
          </div>
        </CarbonModal>
      )}

      {/* 4. Edit Staff Modal */}
      {editingStaff && (
        <CarbonModal
          isOpen={true}
          title={`Edit Profile: ${editingStaff.name}`}
          subtitle={`Employee ID: ${editingStaff.employeeId}`}
          onClose={() => setEditingStaff(null)}
          onRequestSubmit={handleSaveEdit}
          primaryButtonText="Save Changes"
          secondaryButtonText="Cancel"
        >
          <div className="space-y-3 text-xs max-h-[60vh] overflow-y-auto pr-2">
            <div>
              <label className="block text-[11px] font-mono uppercase text-[#525252] mb-1">Full Name *</label>
              <input
                type="text"
                value={editFormData.name || ''}
                onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                className="w-full h-9 px-3 bg-[#f4f4f4] border border-[#8d8d8d] focus:bg-white focus:border-[#0f62fe] outline-none"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] font-mono uppercase text-[#525252] mb-1">Telephone *</label>
                <input
                  type="text"
                  value={editFormData.phone || ''}
                  onChange={(e) => setEditFormData({ ...editFormData, phone: e.target.value })}
                  className="w-full h-9 px-3 bg-[#f4f4f4] border border-[#8d8d8d] focus:bg-white focus:border-[#0f62fe] outline-none"
                />
              </div>
              <div>
                <label className="block text-[11px] font-mono uppercase text-[#525252] mb-1">Designation *</label>
                <input
                  type="text"
                  value={editFormData.designation || ''}
                  onChange={(e) => setEditFormData({ ...editFormData, designation: e.target.value })}
                  className="w-full h-9 px-3 bg-[#f4f4f4] border border-[#8d8d8d] focus:bg-white focus:border-[#0f62fe] outline-none"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] font-mono uppercase text-[#525252] mb-1">Department *</label>
                <input
                  type="text"
                  value={editFormData.department || ''}
                  onChange={(e) => setEditFormData({ ...editFormData, department: e.target.value })}
                  className="w-full h-9 px-3 bg-[#f4f4f4] border border-[#8d8d8d] focus:bg-white focus:border-[#0f62fe] outline-none"
                />
              </div>
              <div>
                <label className="block text-[11px] font-mono uppercase text-[#525252] mb-1">License / Reg Number</label>
                <input
                  type="text"
                  value={editFormData.licenseNumber || ''}
                  onChange={(e) => setEditFormData({ ...editFormData, licenseNumber: e.target.value })}
                  className="w-full h-9 px-3 bg-[#f4f4f4] border border-[#8d8d8d] focus:bg-white focus:border-[#0f62fe] outline-none"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] font-mono uppercase text-[#525252] mb-1">Qualification</label>
                <input
                  type="text"
                  value={editFormData.qualification || ''}
                  onChange={(e) => setEditFormData({ ...editFormData, qualification: e.target.value })}
                  className="w-full h-9 px-3 bg-[#f4f4f4] border border-[#8d8d8d] focus:bg-white focus:border-[#0f62fe] outline-none"
                />
              </div>
              <div>
                <label className="block text-[11px] font-mono uppercase text-[#525252] mb-1">Discipline</label>
                <input
                  type="text"
                  value={editFormData.discipline || ''}
                  onChange={(e) => setEditFormData({ ...editFormData, discipline: e.target.value })}
                  className="w-full h-9 px-3 bg-[#f4f4f4] border border-[#8d8d8d] focus:bg-white focus:border-[#0f62fe] outline-none"
                />
              </div>
            </div>
            <div>
              <label className="block text-[11px] font-mono uppercase text-[#525252] mb-1">Address</label>
              <input
                type="text"
                value={editFormData.address || ''}
                onChange={(e) => setEditFormData({ ...editFormData, address: e.target.value })}
                className="w-full h-9 px-3 bg-[#f4f4f4] border border-[#8d8d8d] focus:bg-white focus:border-[#0f62fe] outline-none"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] font-mono uppercase text-[#525252] mb-1">Emergency Contact Name</label>
                <input
                  type="text"
                  value={editFormData.emergencyContactName || ''}
                  onChange={(e) => setEditFormData({ ...editFormData, emergencyContactName: e.target.value })}
                  className="w-full h-9 px-3 bg-[#f4f4f4] border border-[#8d8d8d] focus:bg-white focus:border-[#0f62fe] outline-none"
                />
              </div>
              <div>
                <label className="block text-[11px] font-mono uppercase text-[#525252] mb-1">Emergency Contact Phone</label>
                <input
                  type="text"
                  value={editFormData.emergencyContactPhone || ''}
                  onChange={(e) => setEditFormData({ ...editFormData, emergencyContactPhone: e.target.value })}
                  className="w-full h-9 px-3 bg-[#f4f4f4] border border-[#8d8d8d] focus:bg-white focus:border-[#0f62fe] outline-none"
                />
              </div>
            </div>
          </div>
        </CarbonModal>
      )}



      {/* 10. Transfer Staff Department Modal */}
      {transferTargetAsg && managingDeptStaff && (
        <CarbonModal
          isOpen={true}
          title={`Transfer Department: ${managingDeptStaff.name}`}
          subtitle={`Current Department: ${transferTargetAsg.department?.name || 'Department'} (${transferTargetAsg.department?.code})`}
          onClose={() => setTransferTargetAsg(null)}
          onRequestSubmit={handleExecuteTransfer}
          primaryButtonText={submittingTransfer ? 'Transferring...' : 'Confirm Transfer'}
          secondaryButtonText="Cancel"
        >
          <div className="space-y-3 text-xs">
            <p className="text-[#525252]">
              Transferring will conclude the current assignment and establish a new active assignment in the target department.
            </p>
            <div>
              <label className="block text-[11px] font-mono uppercase text-[#525252] mb-1">Target Department *</label>
              <select
                value={transferTargetDeptId}
                onChange={(e) => setTransferTargetDeptId(e.target.value)}
                className="w-full h-9 px-3 bg-[#f4f4f4] border border-[#8d8d8d] focus:bg-white focus:border-[#0f62fe] outline-none cursor-pointer"
              >
                <option value="">-- Choose destination department --</option>
                {activeDepartmentsList
                  .filter(d => d.id !== transferTargetAsg.departmentId)
                  .map(d => (
                    <option key={d.id} value={d.id}>
                      {d.name} ({d.code}) — {d.discipline}
                    </option>
                  ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-mono uppercase text-[#525252] mb-1">Transfer Reason / Operational Note</label>
              <input
                type="text"
                value={transferReason}
                onChange={(e) => setTransferReason(e.target.value)}
                placeholder="e.g. Inter-departmental clinical rotation, administrative transfer..."
                className="w-full h-9 px-3 bg-[#f4f4f4] border border-[#8d8d8d] focus:bg-white focus:border-[#0f62fe] outline-none"
              />
            </div>
          </div>
        </CarbonModal>
      )}

      {/* 11. Revoke Staff Department Assignment Modal */}
      {revokeTargetAsg && managingDeptStaff && (
        <CarbonModal
          isOpen={true}
          title={`Revoke Assignment: ${managingDeptStaff.name}`}
          subtitle={`Department: ${revokeTargetAsg.department?.name || 'Department'} (${revokeTargetAsg.department?.code})`}
          onClose={() => setRevokeTargetAsg(null)}
          onRequestSubmit={handleExecuteRevoke}
          primaryButtonText={submittingRevoke ? 'Revoking...' : 'Confirm Revocation'}
          secondaryButtonText="Cancel"
        >
          <div className="space-y-3 text-xs">
            <div className="p-3 bg-[#fff1f1] border border-[#ffd7d9] text-[#da1e28]">
              <strong>Mandatory Revocation Notice:</strong> Revoking a department assignment immediately removes the staff member from this department roster. A permanent audit reason is required.
            </div>
            <div>
              <label className="block text-[11px] font-mono uppercase text-[#525252] mb-1">Revocation Reason *</label>
              <textarea
                value={revokeReason}
                onChange={(e) => setRevokeReason(e.target.value)}
                rows={3}
                placeholder="Specify required operational reason for revoking this assignment..."
                className="w-full p-2 bg-[#f4f4f4] border border-[#8d8d8d] focus:bg-white focus:border-[#0f62fe] outline-none"
              />
            </div>
          </div>
        </CarbonModal>
      )}

      {/* 5. Role Change Modal */}
      {roleChangeStaff && (
        <CarbonModal
          isOpen={true}
          title={`Assign Authorized Role: ${roleChangeStaff.name}`}
          subtitle={`Current Role: ${roleChangeStaff.role} (${roleChangeStaff.employeeId})`}
          onClose={() => setRoleChangeStaff(null)}
          onRequestSubmit={handleExecuteRoleChange}
          primaryButtonText="Confirm Role Change"
          secondaryButtonText="Cancel"
        >
          <div className="space-y-3 text-xs">
            <div>
              <label className="block text-[11px] font-mono uppercase text-[#525252] mb-1">Select New Role *</label>
              <select
                value={targetRole}
                onChange={(e) => setTargetRole(e.target.value as UserRole)}
                className="w-full h-10 px-3 bg-[#f4f4f4] border border-[#8d8d8d] focus:bg-white focus:border-[#0f62fe] outline-none cursor-pointer"
              >
                <option value="DOCTOR">DOCTOR (Modern Clinical Medicine)</option>
                <option value="VAIDYA">VAIDYA (Ayurvedic Physician)</option>
                <option value="PHARMACIST">PHARMACIST (Dispensing & Stock)</option>
                <option value="ACCOUNTANT">ACCOUNTANT (Patient Billing & Financials)</option>
                <option value="RECEPTIONIST">RECEPTIONIST (Front Desk & Admissions)</option>
                <option value="ADMIN">ADMIN (Hospital Operations Coordinator)</option>
                {isSuperAdmin && <option value="SUPER_ADMIN">SUPER_ADMIN (System Governance Lead)</option>}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-mono uppercase text-[#525252] mb-1">Change Reason *</label>
              <input
                type="text"
                value={roleChangeReason}
                onChange={(e) => setRoleChangeReason(e.target.value)}
                placeholder="Reason for operational authority update..."
                className="w-full h-9 px-3 bg-[#f4f4f4] border border-[#8d8d8d] focus:bg-white focus:border-[#0f62fe] outline-none"
              />
            </div>
            <p className="text-[11px] text-[#525252]">
              <strong>Audit Policy:</strong> Every role change is permanently logged identifying previous role, new role, acting administrator, and timestamp. Self-escalation is strictly prevented.
            </p>
          </div>
        </CarbonModal>
      )}



      {/* 10. Transfer Staff Department Modal */}
      {transferTargetAsg && managingDeptStaff && (
        <CarbonModal
          isOpen={true}
          title={`Transfer Department: ${managingDeptStaff.name}`}
          subtitle={`Current Department: ${transferTargetAsg.department?.name || 'Department'} (${transferTargetAsg.department?.code})`}
          onClose={() => setTransferTargetAsg(null)}
          onRequestSubmit={handleExecuteTransfer}
          primaryButtonText={submittingTransfer ? 'Transferring...' : 'Confirm Transfer'}
          secondaryButtonText="Cancel"
        >
          <div className="space-y-3 text-xs">
            <p className="text-[#525252]">
              Transferring will conclude the current assignment and establish a new active assignment in the target department.
            </p>
            <div>
              <label className="block text-[11px] font-mono uppercase text-[#525252] mb-1">Target Department *</label>
              <select
                value={transferTargetDeptId}
                onChange={(e) => setTransferTargetDeptId(e.target.value)}
                className="w-full h-9 px-3 bg-[#f4f4f4] border border-[#8d8d8d] focus:bg-white focus:border-[#0f62fe] outline-none cursor-pointer"
              >
                <option value="">-- Choose destination department --</option>
                {activeDepartmentsList
                  .filter(d => d.id !== transferTargetAsg.departmentId)
                  .map(d => (
                    <option key={d.id} value={d.id}>
                      {d.name} ({d.code}) — {d.discipline}
                    </option>
                  ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-mono uppercase text-[#525252] mb-1">Transfer Reason / Operational Note</label>
              <input
                type="text"
                value={transferReason}
                onChange={(e) => setTransferReason(e.target.value)}
                placeholder="e.g. Inter-departmental clinical rotation, administrative transfer..."
                className="w-full h-9 px-3 bg-[#f4f4f4] border border-[#8d8d8d] focus:bg-white focus:border-[#0f62fe] outline-none"
              />
            </div>
          </div>
        </CarbonModal>
      )}

      {/* 11. Revoke Staff Department Assignment Modal */}
      {revokeTargetAsg && managingDeptStaff && (
        <CarbonModal
          isOpen={true}
          title={`Revoke Assignment: ${managingDeptStaff.name}`}
          subtitle={`Department: ${revokeTargetAsg.department?.name || 'Department'} (${revokeTargetAsg.department?.code})`}
          onClose={() => setRevokeTargetAsg(null)}
          onRequestSubmit={handleExecuteRevoke}
          primaryButtonText={submittingRevoke ? 'Revoking...' : 'Confirm Revocation'}
          secondaryButtonText="Cancel"
        >
          <div className="space-y-3 text-xs">
            <div className="p-3 bg-[#fff1f1] border border-[#ffd7d9] text-[#da1e28]">
              <strong>Mandatory Revocation Notice:</strong> Revoking a department assignment immediately removes the staff member from this department roster. A permanent audit reason is required.
            </div>
            <div>
              <label className="block text-[11px] font-mono uppercase text-[#525252] mb-1">Revocation Reason *</label>
              <textarea
                value={revokeReason}
                onChange={(e) => setRevokeReason(e.target.value)}
                rows={3}
                placeholder="Specify required operational reason for revoking this assignment..."
                className="w-full p-2 bg-[#f4f4f4] border border-[#8d8d8d] focus:bg-white focus:border-[#0f62fe] outline-none"
              />
            </div>
          </div>
        </CarbonModal>
      )}

      {/* 6. Suspend Confirmation Modal */}
      {suspendStaffTarget && (
        <CarbonModal
          isOpen={true}
          title={`Suspend Staff Account: ${suspendStaffTarget.name}`}
          subtitle={`Employee ID: ${suspendStaffTarget.employeeId}`}
          onClose={() => setSuspendStaffTarget(null)}
          onRequestSubmit={handleExecuteSuspend}
          primaryButtonText="Suspend Account"
          secondaryButtonText="Cancel"
        >
          <div className="space-y-3 text-xs">
            <div className="p-3 bg-[#fff1f1] border border-[#ffd7d9] text-[#da1e28]">
              <strong>Immediate Session Revocation:</strong> Suspending this staff member will immediately revoke all active authentication sessions. The user will not be able to log in or perform any system operations.
            </div>
            <div>
              <label className="block text-[11px] font-mono uppercase text-[#525252] mb-1">Reason for Suspension *</label>
              <textarea
                value={suspendReason}
                onChange={(e) => setSuspendReason(e.target.value)}
                rows={3}
                placeholder="Specify mandatory reason for suspension..."
                className="w-full p-2 bg-[#f4f4f4] border border-[#8d8d8d] focus:bg-white focus:border-[#0f62fe] outline-none"
              />
            </div>
          </div>
        </CarbonModal>
      )}



      {/* 10. Transfer Staff Department Modal */}
      {transferTargetAsg && managingDeptStaff && (
        <CarbonModal
          isOpen={true}
          title={`Transfer Department: ${managingDeptStaff.name}`}
          subtitle={`Current Department: ${transferTargetAsg.department?.name || 'Department'} (${transferTargetAsg.department?.code})`}
          onClose={() => setTransferTargetAsg(null)}
          onRequestSubmit={handleExecuteTransfer}
          primaryButtonText={submittingTransfer ? 'Transferring...' : 'Confirm Transfer'}
          secondaryButtonText="Cancel"
        >
          <div className="space-y-3 text-xs">
            <p className="text-[#525252]">
              Transferring will conclude the current assignment and establish a new active assignment in the target department.
            </p>
            <div>
              <label className="block text-[11px] font-mono uppercase text-[#525252] mb-1">Target Department *</label>
              <select
                value={transferTargetDeptId}
                onChange={(e) => setTransferTargetDeptId(e.target.value)}
                className="w-full h-9 px-3 bg-[#f4f4f4] border border-[#8d8d8d] focus:bg-white focus:border-[#0f62fe] outline-none cursor-pointer"
              >
                <option value="">-- Choose destination department --</option>
                {activeDepartmentsList
                  .filter(d => d.id !== transferTargetAsg.departmentId)
                  .map(d => (
                    <option key={d.id} value={d.id}>
                      {d.name} ({d.code}) — {d.discipline}
                    </option>
                  ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-mono uppercase text-[#525252] mb-1">Transfer Reason / Operational Note</label>
              <input
                type="text"
                value={transferReason}
                onChange={(e) => setTransferReason(e.target.value)}
                placeholder="e.g. Inter-departmental clinical rotation, administrative transfer..."
                className="w-full h-9 px-3 bg-[#f4f4f4] border border-[#8d8d8d] focus:bg-white focus:border-[#0f62fe] outline-none"
              />
            </div>
          </div>
        </CarbonModal>
      )}

      {/* 11. Revoke Staff Department Assignment Modal */}
      {revokeTargetAsg && managingDeptStaff && (
        <CarbonModal
          isOpen={true}
          title={`Revoke Assignment: ${managingDeptStaff.name}`}
          subtitle={`Department: ${revokeTargetAsg.department?.name || 'Department'} (${revokeTargetAsg.department?.code})`}
          onClose={() => setRevokeTargetAsg(null)}
          onRequestSubmit={handleExecuteRevoke}
          primaryButtonText={submittingRevoke ? 'Revoking...' : 'Confirm Revocation'}
          secondaryButtonText="Cancel"
        >
          <div className="space-y-3 text-xs">
            <div className="p-3 bg-[#fff1f1] border border-[#ffd7d9] text-[#da1e28]">
              <strong>Mandatory Revocation Notice:</strong> Revoking a department assignment immediately removes the staff member from this department roster. A permanent audit reason is required.
            </div>
            <div>
              <label className="block text-[11px] font-mono uppercase text-[#525252] mb-1">Revocation Reason *</label>
              <textarea
                value={revokeReason}
                onChange={(e) => setRevokeReason(e.target.value)}
                rows={3}
                placeholder="Specify required operational reason for revoking this assignment..."
                className="w-full p-2 bg-[#f4f4f4] border border-[#8d8d8d] focus:bg-white focus:border-[#0f62fe] outline-none"
              />
            </div>
          </div>
        </CarbonModal>
      )}

      {/* 7. Archive Confirmation Modal */}
      {archiveStaffTarget && (
        <CarbonModal
          isOpen={true}
          title={`Archive Employment Record: ${archiveStaffTarget.name}`}
          subtitle={`Employee ID: ${archiveStaffTarget.employeeId}`}
          onClose={() => setArchiveStaffTarget(null)}
          onRequestSubmit={handleExecuteArchive}
          primaryButtonText="Confirm Archival"
          secondaryButtonText="Cancel"
        >
          <div className="space-y-3 text-xs">
            <div className="p-3 bg-[#f4f4f4] border border-[#8d8d8d] text-[#525252]">
              <strong>Historical Preservation Guarantee:</strong> This operation marks the employment record as archived and revokes login access. Historical clinical encounters, prescriptions, dispensing records, and financial invoices authored by this staff member will remain completely intact.
            </div>
            <div>
              <label className="block text-[11px] font-mono uppercase text-[#525252] mb-1">Reason for Archival *</label>
              <textarea
                value={archiveReason}
                onChange={(e) => setArchiveReason(e.target.value)}
                rows={3}
                placeholder="e.g. Resignation, conclusion of contract, retirement..."
                className="w-full p-2 bg-[#f4f4f4] border border-[#8d8d8d] focus:bg-white focus:border-[#0f62fe] outline-none"
              />
            </div>
          </div>
        </CarbonModal>
      )}



      {/* 10. Transfer Staff Department Modal */}
      {transferTargetAsg && managingDeptStaff && (
        <CarbonModal
          isOpen={true}
          title={`Transfer Department: ${managingDeptStaff.name}`}
          subtitle={`Current Department: ${transferTargetAsg.department?.name || 'Department'} (${transferTargetAsg.department?.code})`}
          onClose={() => setTransferTargetAsg(null)}
          onRequestSubmit={handleExecuteTransfer}
          primaryButtonText={submittingTransfer ? 'Transferring...' : 'Confirm Transfer'}
          secondaryButtonText="Cancel"
        >
          <div className="space-y-3 text-xs">
            <p className="text-[#525252]">
              Transferring will conclude the current assignment and establish a new active assignment in the target department.
            </p>
            <div>
              <label className="block text-[11px] font-mono uppercase text-[#525252] mb-1">Target Department *</label>
              <select
                value={transferTargetDeptId}
                onChange={(e) => setTransferTargetDeptId(e.target.value)}
                className="w-full h-9 px-3 bg-[#f4f4f4] border border-[#8d8d8d] focus:bg-white focus:border-[#0f62fe] outline-none cursor-pointer"
              >
                <option value="">-- Choose destination department --</option>
                {activeDepartmentsList
                  .filter(d => d.id !== transferTargetAsg.departmentId)
                  .map(d => (
                    <option key={d.id} value={d.id}>
                      {d.name} ({d.code}) — {d.discipline}
                    </option>
                  ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-mono uppercase text-[#525252] mb-1">Transfer Reason / Operational Note</label>
              <input
                type="text"
                value={transferReason}
                onChange={(e) => setTransferReason(e.target.value)}
                placeholder="e.g. Inter-departmental clinical rotation, administrative transfer..."
                className="w-full h-9 px-3 bg-[#f4f4f4] border border-[#8d8d8d] focus:bg-white focus:border-[#0f62fe] outline-none"
              />
            </div>
          </div>
        </CarbonModal>
      )}

      {/* 11. Revoke Staff Department Assignment Modal */}
      {revokeTargetAsg && managingDeptStaff && (
        <CarbonModal
          isOpen={true}
          title={`Revoke Assignment: ${managingDeptStaff.name}`}
          subtitle={`Department: ${revokeTargetAsg.department?.name || 'Department'} (${revokeTargetAsg.department?.code})`}
          onClose={() => setRevokeTargetAsg(null)}
          onRequestSubmit={handleExecuteRevoke}
          primaryButtonText={submittingRevoke ? 'Revoking...' : 'Confirm Revocation'}
          secondaryButtonText="Cancel"
        >
          <div className="space-y-3 text-xs">
            <div className="p-3 bg-[#fff1f1] border border-[#ffd7d9] text-[#da1e28]">
              <strong>Mandatory Revocation Notice:</strong> Revoking a department assignment immediately removes the staff member from this department roster. A permanent audit reason is required.
            </div>
            <div>
              <label className="block text-[11px] font-mono uppercase text-[#525252] mb-1">Revocation Reason *</label>
              <textarea
                value={revokeReason}
                onChange={(e) => setRevokeReason(e.target.value)}
                rows={3}
                placeholder="Specify required operational reason for revoking this assignment..."
                className="w-full p-2 bg-[#f4f4f4] border border-[#8d8d8d] focus:bg-white focus:border-[#0f62fe] outline-none"
              />
            </div>
          </div>
        </CarbonModal>
      )}

      {/* 8. Staff Audit History Modal */}
      {historyStaff && (
        <CarbonModal
          isOpen={true}
          title={`Audit History: ${historyStaff.name}`}
          subtitle={`Employee ID: ${historyStaff.employeeId} (${historyStaff.role})`}
          onClose={() => setHistoryStaff(null)}
          onRequestSubmit={() => setHistoryStaff(null)}
          primaryButtonText="Close"
        >
          <div className="space-y-3 text-xs max-h-[60vh] overflow-y-auto">
            {loadingHistory ? (
              <div className="p-4 text-center text-[#525252]">Loading audit records...</div>
            ) : staffAuditLogs.length === 0 ? (
              <div className="p-4 text-center text-[#525252]">No audit records found for this staff member.</div>
            ) : (
              <div className="space-y-2">
                {staffAuditLogs.map((log) => (
                  <div key={log.id} className="p-2 border border-[#e0e0e0] bg-[#f4f4f4] space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-[#161616]">{log.action}</span>
                      <span className="font-mono text-[10px] text-[#525252]">{new Date(log.timestamp).toLocaleString()}</span>
                    </div>
                    <div className="text-[11px] text-[#525252]">{log.details}</div>
                    <div className="text-[10px] text-[#8d8d8d]">
                      Actor: <span className="font-medium text-[#161616]">{log.actor}</span> ({log.role}) • Category: {log.category}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </CarbonModal>
      )}

      {/* 9. Manage Department Assignments Modal */}
      {managingDeptStaff && (
        <CarbonModal
          isOpen={true}
          title={`Department Assignments: ${managingDeptStaff.name}`}
          subtitle={`${managingDeptStaff.employeeId} • ${managingDeptStaff.role}`}
          onClose={() => setManagingDeptStaff(null)}
          onRequestSubmit={() => setManagingDeptStaff(null)}
          primaryButtonText="Done"
        >
          <div className="space-y-4 text-xs max-h-[70vh] overflow-y-auto pr-1">
            {/* Read-only notice for non-administrators */}
            {!canManageStaff && (
              <div className="p-3 bg-[#edf5ff] border border-[#a6c8ff] text-[#0043ce]">
                <strong>Read-Only Access:</strong> You are viewing department assignments. Modifying staff department assignments requires Administrator privileges.
              </div>
            )}

            {/* Primary Department Banner */}
            <div className="p-3 bg-[#f4f4f4] border border-[#e0e0e0] space-y-1">
              <div className="text-[11px] font-mono uppercase text-[#525252]">Authoritative Primary Department (Phase 6B):</div>
              {loadingAssignments ? (
                <div className="text-xs text-[#525252] py-2">Loading relational assignment data...</div>
              ) : staffPrimaryDept ? (
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-sm font-semibold text-[#161616]">{staffPrimaryDept.name}</span>
                    <span className="font-mono text-xs text-[#0f62fe] ml-2">[{staffPrimaryDept.code}]</span>
                    <span className="ml-2">
                      <CarbonTag type={getDisciplineTag(staffPrimaryDept.discipline).type}>
                        {staffPrimaryDept.discipline}
                      </CarbonTag>
                    </span>
                  </div>
                  <CarbonTag type="blue">PRIMARY</CarbonTag>
                </div>
              ) : (
                <div className="flex items-center gap-2 py-1">
                  <CarbonTag type="warm-gray">No primary department assigned</CarbonTag>
                  <span className="text-[11px] text-[#525252] italic">
                    (No active primary relational department assignment)
                  </span>
                </div>
              )}
              <div className="text-[10px] text-[#8d8d8d] pt-1">
                Legacy department string on record: <span className="font-mono text-[#525252]">{managingDeptStaff.department || 'None'}</span> (informational only)
              </div>
            </div>

            {/* Active Assignments Section */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="font-semibold text-xs text-[#161616] uppercase font-mono tracking-wider">
                  Active Department Assignments ({staffAssignments.filter(a => a.status === 'active').length})
                </h4>
              </div>

              {loadingAssignments ? (
                <div className="p-4 text-center text-[#525252]">Loading assignments...</div>
              ) : staffAssignments.filter(a => a.status === 'active').length === 0 ? (
                <div className="p-3 bg-white border border-[#e0e0e0] text-center text-[#525252]">
                  No active department assignments for this staff member.
                </div>
              ) : (
                <div className="space-y-2">
                  {staffAssignments
                    .filter(a => a.status === 'active')
                    .map(a => (
                      <div key={a.id} className="p-3 bg-white border border-[#e0e0e0] space-y-2">
                        <div className="flex items-center justify-between">
                          <div>
                            <span className="font-semibold text-sm text-[#161616]">{a.department?.name || 'Department'}</span>
                            <span className="font-mono text-xs text-[#0f62fe] ml-2">[{a.department?.code}]</span>
                            {a.roleTitle && <span className="text-xs text-[#525252] ml-2 font-mono">({a.roleTitle})</span>}
                          </div>
                          <div className="flex items-center gap-1.5">
                            {a.isPrimary ? (
                              <CarbonTag type="blue">PRIMARY</CarbonTag>
                            ) : (
                              <CarbonTag type="teal">SECONDARY</CarbonTag>
                            )}
                            <CarbonTag type="green">ACTIVE</CarbonTag>
                          </div>
                        </div>

                        <div className="flex items-center justify-between text-[11px] text-[#525252] pt-1 border-t border-[#f4f4f4]">
                          <div>
                            Assigned on: {new Date(a.startDate || a.createdAt).toLocaleDateString()}
                            {a.assignedByName && <span> by {a.assignedByName}</span>}
                          </div>

                          {canManageStaff && (
                            <div className="flex items-center gap-1">
                              {!a.isPrimary && (
                                <CarbonButton
                                  kind="tertiary"
                                  size="sm"
                                  onClick={() => handleSetPrimary(a.departmentId)}
                                  title="Designate this department as staff member's primary department"
                                >
                                  Make Primary
                                </CarbonButton>
                              )}
                              <CarbonButton
                                kind="ghost"
                                size="sm"
                                onClick={() => {
                                  setTransferTargetAsg(a);
                                  setTransferTargetDeptId('');
                                  setTransferReason('');
                                }}
                                title="Transfer assignment to another department"
                              >
                                Transfer
                              </CarbonButton>
                              <CarbonButton
                                kind="ghost"
                                size="sm"
                                onClick={() => handleCompleteAssignment(a.id)}
                                title="Mark assignment as completed"
                              >
                                Complete
                              </CarbonButton>
                              <CarbonButton
                                kind="danger"
                                size="sm"
                                onClick={() => {
                                  setRevokeTargetAsg(a);
                                  setRevokeReason('');
                                }}
                                title="Revoke assignment with mandatory reason"
                              >
                                Revoke
                              </CarbonButton>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>

            {/* Assign New Department Form (Only for Admins) */}
            {canManageStaff && (
              <div className="p-3 bg-[#f4f4f4] border border-[#e0e0e0] space-y-3">
                <h4 className="font-semibold text-xs text-[#161616] uppercase font-mono tracking-wider">
                  Assign to Department
                </h4>

                <div className="space-y-2">
                  <div>
                    <label className="block text-[11px] font-mono uppercase text-[#525252] mb-1">Select Department *</label>
                    <select
                      value={assignDeptId}
                      onChange={(e) => setAssignDeptId(e.target.value)}
                      className="w-full h-9 px-3 bg-white border border-[#8d8d8d] focus:border-[#0f62fe] outline-none cursor-pointer"
                    >
                      <option value="">-- Choose active department --</option>
                      {activeDepartmentsList
                        .filter(d => !staffAssignments.some(a => a.status === 'active' && a.departmentId === d.id))
                        .map(d => (
                          <option key={d.id} value={d.id}>
                            {d.name} ({d.code}) — {d.discipline}
                          </option>
                        ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] font-mono uppercase text-[#525252] mb-1">Role Title / Position (Optional)</label>
                      <input
                        type="text"
                        value={assignRoleTitle}
                        onChange={(e) => setAssignRoleTitle(e.target.value)}
                        placeholder="e.g. Senior Consultant, Lead Vaidya"
                        className="w-full h-9 px-3 bg-white border border-[#8d8d8d] focus:border-[#0f62fe] outline-none"
                      />
                    </div>
                    <div className="flex items-center pt-5">
                      <label className="flex items-center gap-2 cursor-pointer text-xs text-[#161616]">
                        <input
                          type="checkbox"
                          checked={assignIsPrimary}
                          onChange={(e) => setAssignIsPrimary(e.target.checked)}
                          className="w-4 h-4 accent-[#0f62fe]"
                        />
                        <span className="font-medium">Set as Primary Department</span>
                      </label>
                    </div>
                  </div>

                  <div className="flex justify-end pt-2">
                    <CarbonButton
                      kind="primary"
                      size="sm"
                      disabled={!assignDeptId || submittingAssign}
                      onClick={handleAssignDepartment}
                    >
                      {submittingAssign ? 'Assigning...' : 'Assign Department'}
                    </CarbonButton>
                  </div>
                </div>
              </div>
            )}

            {/* Historical Assignments Section */}
            {staffAssignments.filter(a => a.status !== 'active').length > 0 && (
              <div className="space-y-2 pt-2 border-t border-[#e0e0e0]">
                <h4 className="font-semibold text-xs text-[#161616] uppercase font-mono tracking-wider">
                  Assignment History & Concluded Tenures ({staffAssignments.filter(a => a.status !== 'active').length})
                </h4>
                <div className="space-y-2">
                  {staffAssignments
                    .filter(a => a.status !== 'active')
                    .map(a => (
                      <div key={a.id} className="p-2.5 bg-[#f4f4f4] border border-[#e0e0e0] text-xs space-y-1">
                        <div className="flex items-center justify-between">
                          <div>
                            <span className="font-semibold text-[#161616]">{a.department?.name || 'Department'}</span>
                            <span className="font-mono text-[11px] text-[#525252] ml-1.5">[{a.department?.code}]</span>
                            {a.roleTitle && <span className="text-[#525252] ml-1.5 font-mono">({a.roleTitle})</span>}
                          </div>
                          <div>
                            <CarbonTag type={getAssignmentStatusTag(a.status).type}>
                              {getAssignmentStatusTag(a.status).label}
                            </CarbonTag>
                          </div>
                        </div>

                        <div className="text-[11px] text-[#525252] flex items-center justify-between">
                          <span>Tenure: {new Date(a.startDate || a.createdAt).toLocaleDateString()} — {a.endDate ? new Date(a.endDate).toLocaleDateString() : 'N/A'}</span>
                          {a.revocationReason && (
                            <span className="text-[#da1e28] italic">Reason: {a.revocationReason}</span>
                          )}
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
        </CarbonModal>
      )}

      {/* 10. Transfer Staff Department Modal */}
      {transferTargetAsg && managingDeptStaff && (
        <CarbonModal
          isOpen={true}
          title={`Transfer Department: ${managingDeptStaff.name}`}
          subtitle={`Current Department: ${transferTargetAsg.department?.name || 'Department'} (${transferTargetAsg.department?.code})`}
          onClose={() => setTransferTargetAsg(null)}
          onRequestSubmit={handleExecuteTransfer}
          primaryButtonText={submittingTransfer ? 'Transferring...' : 'Confirm Transfer'}
          secondaryButtonText="Cancel"
        >
          <div className="space-y-3 text-xs">
            <p className="text-[#525252]">
              Transferring will conclude the current assignment and establish a new active assignment in the target department.
            </p>
            <div>
              <label className="block text-[11px] font-mono uppercase text-[#525252] mb-1">Target Department *</label>
              <select
                value={transferTargetDeptId}
                onChange={(e) => setTransferTargetDeptId(e.target.value)}
                className="w-full h-9 px-3 bg-[#f4f4f4] border border-[#8d8d8d] focus:bg-white focus:border-[#0f62fe] outline-none cursor-pointer"
              >
                <option value="">-- Choose destination department --</option>
                {activeDepartmentsList
                  .filter(d => d.id !== transferTargetAsg.departmentId)
                  .map(d => (
                    <option key={d.id} value={d.id}>
                      {d.name} ({d.code}) — {d.discipline}
                    </option>
                  ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-mono uppercase text-[#525252] mb-1">Transfer Reason / Operational Note</label>
              <input
                type="text"
                value={transferReason}
                onChange={(e) => setTransferReason(e.target.value)}
                placeholder="e.g. Inter-departmental clinical rotation, administrative transfer..."
                className="w-full h-9 px-3 bg-[#f4f4f4] border border-[#8d8d8d] focus:bg-white focus:border-[#0f62fe] outline-none"
              />
            </div>
          </div>
        </CarbonModal>
      )}

      {/* 11. Revoke Staff Department Assignment Modal */}
      {revokeTargetAsg && managingDeptStaff && (
        <CarbonModal
          isOpen={true}
          title={`Revoke Assignment: ${managingDeptStaff.name}`}
          subtitle={`Department: ${revokeTargetAsg.department?.name || 'Department'} (${revokeTargetAsg.department?.code})`}
          onClose={() => setRevokeTargetAsg(null)}
          onRequestSubmit={handleExecuteRevoke}
          primaryButtonText={submittingRevoke ? 'Revoking...' : 'Confirm Revocation'}
          secondaryButtonText="Cancel"
        >
          <div className="space-y-3 text-xs">
            <div className="p-3 bg-[#fff1f1] border border-[#ffd7d9] text-[#da1e28]">
              <strong>Mandatory Revocation Notice:</strong> Revoking a department assignment immediately removes the staff member from this department roster. A permanent audit reason is required.
            </div>
            <div>
              <label className="block text-[11px] font-mono uppercase text-[#525252] mb-1">Revocation Reason *</label>
              <textarea
                value={revokeReason}
                onChange={(e) => setRevokeReason(e.target.value)}
                rows={3}
                placeholder="Specify required operational reason for revoking this assignment..."
                className="w-full p-2 bg-[#f4f4f4] border border-[#8d8d8d] focus:bg-white focus:border-[#0f62fe] outline-none"
              />
            </div>
          </div>
        </CarbonModal>
      )}
    </div>
  );
};
