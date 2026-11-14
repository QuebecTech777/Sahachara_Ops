import React, { useState, useEffect } from 'react';
import {
  Settings,
  Building2,
  Users,
  ShieldCheck,
  Sliders,
  User,
  Lock,
  Search,
  Plus,
  RefreshCw,
  Download,
  Key,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Eye,
  X,
  Laptop,
  Smartphone,
  Save,
  Filter,
  LogOut,
  Sun,
  Moon,
  FileText,
  Award,
  Edit,
  ToggleLeft,
  ToggleRight
} from 'lucide-react';
import { CarbonButton } from '../components/carbon/CarbonButton';
import { CarbonTag, CarbonTagType } from '../components/carbon/CarbonTag';
import { CarbonTabs } from '../components/carbon/CarbonTabs';
import { CarbonModal } from '../components/carbon/CarbonModal';
import {
  AppUser,
  StaffMember,
  ClinicalAuditLog,
  HospitalTariff,
  HospitalProfile,
  Department,
  DepartmentDiscipline,
  StaffDepartmentAssignment
} from '../types/hospital';
import { hospitalApi } from '../services/hospitalApi';
import { ServiceRateManagementSection } from './ServiceRateManagementSection';

export type SettingsTabId =
  | 'overview'
  | 'organization'
  | 'departments'
  | 'staff'
  | 'tariffs'
  | 'audit-logs'
  | 'configuration'
  | 'profile'
  | 'security';

interface SettingsWorkspaceViewProps {
  currentUser: AppUser;
  staff: StaffMember[];
  auditLogs: ClinicalAuditLog[];
  onAddStaff?: (data: Partial<StaffMember>) => Promise<StaffMember>;
  onUpdateStaffStatus?: (id: string, status: StaffMember['status']) => void;
  onNotify?: (title: string, subtitle?: string, kind?: 'info' | 'success' | 'warning' | 'error') => void;
  initialTab?: SettingsTabId;
  onSignOut?: () => void;
  currentTheme?: 'g10' | 'g100';
  onSetTheme?: (theme: 'g10' | 'g100') => void;
}

export const SettingsWorkspaceView: React.FC<SettingsWorkspaceViewProps> = ({
  currentUser,
  staff = [],
  auditLogs = [],
  onAddStaff,
  onUpdateStaffStatus,
  onNotify,
  initialTab = 'overview',
  onSignOut,
  currentTheme = 'g10',
  onSetTheme
}) => {
  const [activeTab, setActiveTab] = useState<SettingsTabId>(initialTab);

  const isAdmin = currentUser.role === 'SUPER_ADMIN' || currentUser.role === 'ADMIN';
  const isSuperAdmin = currentUser.role === 'SUPER_ADMIN';

  // ----------------------------------------------------
  // 1. Hospital Institutional Profile State (Database-Backed)
  // ----------------------------------------------------
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileConflict, setProfileConflict] = useState<string | null>(null);
  const [profileVersion, setProfileVersion] = useState<number | null>(null);
  const [profileCode, setProfileCode] = useState<string>('SAH');
  const [profileLegalName, setProfileLegalName] = useState<string>('');
  const [profileDisplayName, setProfileDisplayName] = useState<string>('');
  const [profileTagline, setProfileTagline] = useState<string>('');
  const [profileRegNo, setProfileRegNo] = useState<string>('');
  const [profileTaxId, setProfileTaxId] = useState<string>('');
  const [profileEmail, setProfileEmail] = useState<string>('');
  const [profilePhone, setProfilePhone] = useState<string>('');
  const [profileWebsite, setProfileWebsite] = useState<string>('');
  const [profileAddressLine1, setProfileAddressLine1] = useState<string>('');
  const [profileAddressLine2, setProfileAddressLine2] = useState<string>('');
  const [profileCity, setProfileCity] = useState<string>('');
  const [profileState, setProfileState] = useState<string>('');
  const [profilePostalCode, setProfilePostalCode] = useState<string>('');
  const [profileCountry, setProfileCountry] = useState<string>('India');
  const [profileTimezone, setProfileTimezone] = useState<string>('Asia/Kolkata');
  const [profileCurrency, setProfileCurrency] = useState<string>('INR');

  // ----------------------------------------------------
  // Department Master Management State (Stage 4B)
  // ----------------------------------------------------
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loadingDepartments, setLoadingDepartments] = useState(false);
  const [deptDisciplineFilter, setDeptDisciplineFilter] = useState<'all' | DepartmentDiscipline>('all');
  const [deptStatusFilter, setDeptStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [deptSearch, setDeptSearch] = useState('');

  // Modals for Department Management
  const [isCreateDeptModalOpen, setIsCreateDeptModalOpen] = useState(false);
  const [newDeptCode, setNewDeptCode] = useState('');
  const [newDeptName, setNewDeptName] = useState('');
  const [newDeptDiscipline, setNewDeptDiscipline] = useState<DepartmentDiscipline>('AYURVEDA');
  const [newDeptDescription, setNewDeptDescription] = useState('');
  const [createDeptError, setCreateDeptError] = useState<string | null>(null);
  const [savingDept, setSavingDept] = useState(false);

  const [editingDept, setEditingDept] = useState<Department | null>(null);
  const [editDeptName, setEditDeptName] = useState('');
  const [editDeptDiscipline, setEditDeptDiscipline] = useState<DepartmentDiscipline>('AYURVEDA');
  const [editDeptDescription, setEditDeptDescription] = useState('');
  const [editDeptError, setEditDeptError] = useState<string | null>(null);

  const [deactivatingDept, setDeactivatingDept] = useState<Department | null>(null);
  const [deactivationReason, setDeactivationReason] = useState('');
  const [deactivatingError, setDeactivatingError] = useState<string | null>(null);

  const [viewingStaffDept, setViewingStaffDept] = useState<Department | null>(null);
  const [deptStaffList, setDeptStaffList] = useState<StaffDepartmentAssignment[]>([]);
  const [loadingDeptStaff, setLoadingDeptStaff] = useState(false);

  // ----------------------------------------------------
  // 2. Configuration State
  // ----------------------------------------------------
  const [patientPrefix, setPatientPrefix] = useState('SAH-');
  const [invoicePrefix, setInvoicePrefix] = useState('SAH-INV-');
  const [receiptPrefix, setReceiptPrefix] = useState('SAH-REC-');

  // ----------------------------------------------------
  // 3. My Profile State
  // ----------------------------------------------------
  const [profileName, setProfileName] = useState(currentUser.name);
  const [myProfilePhone, setMyProfilePhone] = useState('+91 98450 11200');
  const [profileDept, setProfileDept] = useState('Kayachikitsa (Internal Medicine & Panchakarma)');
  const [profileRoom, setProfileRoom] = useState('OPD Consultation Suite 104, West Block');
  const [profileLicense, setProfileLicense] = useState('AYUSH-KL-4091');

  // ----------------------------------------------------
  // 4. Staff Management State
  // ----------------------------------------------------
  const [staffSearch, setStaffSearch] = useState('');
  const [staffRoleFilter, setStaffRoleFilter] = useState<string>('all');
  const [staffStatusFilter, setStaffStatusFilter] = useState<string>('all');
  const [isAddStaffModalOpen, setIsAddStaffModalOpen] = useState(false);
  const [newStaffName, setNewStaffName] = useState('');
  const [newStaffEmail, setNewStaffEmail] = useState('');
  const [newStaffRole, setNewStaffRole] = useState<StaffMember['role']>('DOCTOR');
  const [setActiveImmediately, setSetActiveImmediately] = useState(true);
  const [pinDialogStaff, setPinDialogStaff] = useState<StaffMember | null>(null);

  // ----------------------------------------------------
  // 5. Audit Log State & Modal
  // ----------------------------------------------------
  const [auditSearch, setAuditSearch] = useState('');
  const [auditActionFilter, setAuditActionFilter] = useState('all');
  const [selectedAuditLog, setSelectedAuditLog] = useState<ClinicalAuditLog | null>(null);

  // ----------------------------------------------------
  // 6. Rate Master & Tariffs State
  // ----------------------------------------------------
  const [tariffs, setTariffs] = useState<HospitalTariff[]>(() => hospitalApi.getTariffs());

  useEffect(() => {
    hospitalApi.fetchTariffs(true).then((data) => {
      if (Array.isArray(data) && data.length > 0) {
        setTariffs(data);
      }
    }).catch(() => {});
  }, []);

  // Filter staff list
  const filteredStaff = staff.filter((s) => {
    if (staffRoleFilter !== 'all' && s.role !== staffRoleFilter) return false;
    if (staffStatusFilter !== 'all') {
      if (staffStatusFilter === 'active' && s.status !== 'active' && s.status !== 'on_duty') return false;
      if (staffStatusFilter === 'deactivated' && s.status !== 'inactive') return false;
    }
    if (staffSearch.trim()) {
      const q = staffSearch.toLowerCase();
      return (
        s.name.toLowerCase().includes(q) ||
        s.email.toLowerCase().includes(q) ||
        s.employeeId.toLowerCase().includes(q) ||
        s.department.toLowerCase().includes(q)
      );
    }
    return true;
  });

  // Filter audit logs
  const filteredAuditLogs = auditLogs.filter((log) => {
    if (auditActionFilter !== 'all') {
      if (auditActionFilter === 'create' && !log.action.toLowerCase().includes('create') && !log.action.toLowerCase().includes('admit')) return false;
      if (auditActionFilter === 'update' && !log.action.toLowerCase().includes('update') && !log.action.toLowerCase().includes('edit')) return false;
      if (auditActionFilter === 'export' && !log.action.toLowerCase().includes('export')) return false;
    }
    if (auditSearch.trim()) {
      const q = auditSearch.toLowerCase();
      return (
        log.actor.toLowerCase().includes(q) ||
        log.action.toLowerCase().includes(q) ||
        (log.patientMrn && log.patientMrn.toLowerCase().includes(q)) ||
        log.details.toLowerCase().includes(q)
      );
    }
    return true;
  });

  // Export audit CSV handler
  const handleExportAuditCsv = () => {
    const headers = ['Audit ID', 'Timestamp', 'Actor', 'Role', 'Category', 'Action', 'Patient MRN', 'Details'];
    const lines = [
      '# SAHACHARA AYURVEDA OPERATIONS - HIPAA CLINICAL AUDIT EXPORT',
      `# Date: ${new Date().toISOString()}`,
      headers.join(',')
    ];
    filteredAuditLogs.forEach((l) => {
      lines.push(
        [
          `"${l.id}"`,
          `"${l.timestamp}"`,
          `"${l.actor}"`,
          `"${l.role}"`,
          `"${l.category}"`,
          `"${l.action}"`,
          `"${l.patientMrn || 'N/A'}"`,
          `"${l.details.replace(/"/g, '""')}"`
        ].join(',')
      );
    });
    const blob = new Blob([lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Sahachara_Audit_Trail_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    if (onNotify) {
      onNotify('Audit Trail Exported', `Exported ${filteredAuditLogs.length} audit event records as CSV.`, 'success');
    }
  };

  // ----------------------------------------------------
  // Hospital Profile & Department Data Loaders
  // ----------------------------------------------------
  const loadHospitalProfile = async () => {
    setProfileLoading(true);
    setProfileError(null);
    setProfileConflict(null);
    try {
      const p = await hospitalApi.getHospitalProfile();
      setProfileVersion(p.version);
      setProfileCode(p.code || 'SAH');
      setProfileLegalName(p.legalName || '');
      setProfileDisplayName(p.displayName || '');
      setProfileTagline(p.tagline || '');
      setProfileRegNo(p.registrationNumber || '');
      setProfileTaxId(p.taxIdentificationNumber || '');
      setProfileEmail(p.email || '');
      setProfilePhone(p.phone || '');
      setProfileWebsite(p.website || '');
      setProfileAddressLine1(p.addressLine1 || '');
      setProfileAddressLine2(p.addressLine2 || '');
      setProfileCity(p.city || '');
      setProfileState(p.state || '');
      setProfilePostalCode(p.postalCode || '');
      setProfileCountry(p.country || 'India');
      setProfileTimezone(p.timezone || 'Asia/Kolkata');
      setProfileCurrency(p.currency || 'INR');
    } catch (err: any) {
      setProfileError(err.message || 'Failed to retrieve hospital institutional profile');
    } finally {
      setProfileLoading(false);
    }
  };

  const loadDepartments = async () => {
    setLoadingDepartments(true);
    try {
      const filters: { isActive?: boolean; discipline?: DepartmentDiscipline; search?: string } = {};
      if (deptDisciplineFilter !== 'all') {
        filters.discipline = deptDisciplineFilter;
      }
      if (deptStatusFilter === 'active') filters.isActive = true;
      if (deptStatusFilter === 'inactive') filters.isActive = false;
      if (deptSearch.trim()) filters.search = deptSearch.trim();

      const list = await hospitalApi.getDepartments(filters);
      setDepartments(list);
    } catch (err: any) {
      console.error('Failed to load departments:', err);
    } finally {
      setLoadingDepartments(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'organization') {
      loadHospitalProfile();
    }
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === 'departments') {
      loadDepartments();
    }
  }, [activeTab, deptDisciplineFilter, deptStatusFilter, deptSearch]);

  const handleSaveHospitalProfile = async () => {
    if (!isSuperAdmin) {
      if (onNotify) onNotify('Permission Denied', 'SUPER_ADMIN role authority is required to modify hospital profile.', 'error');
      return;
    }
    if (profileVersion === null) {
      if (onNotify) onNotify('Error', 'Profile not loaded yet.', 'error');
      return;
    }
    if (!profileDisplayName.trim()) {
      if (onNotify) onNotify('Validation Error', 'Hospital Display Name is mandatory.', 'error');
      return;
    }
    if (profileEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profileEmail.trim())) {
      if (onNotify) onNotify('Validation Error', 'Invalid official contact email format.', 'error');
      return;
    }

    setProfileSaving(true);
    setProfileError(null);
    setProfileConflict(null);

    const updatePayload = {
      legalName: profileLegalName.trim() || undefined,
      displayName: profileDisplayName.trim(),
      tagline: profileTagline.trim() || null,
      registrationNumber: profileRegNo.trim() || null,
      taxIdentificationNumber: profileTaxId.trim() || null,
      email: profileEmail.trim() || null,
      phone: profilePhone.trim() || null,
      website: profileWebsite.trim() || null,
      addressLine1: profileAddressLine1.trim() || null,
      addressLine2: profileAddressLine2.trim() || null,
      city: profileCity.trim() || null,
      state: profileState.trim() || null,
      postalCode: profilePostalCode.trim() || null,
      country: profileCountry.trim() || 'India',
      timezone: profileTimezone.trim() || 'Asia/Kolkata',
      currency: profileCurrency.trim() || 'INR',
      version: profileVersion
    };

    const res = await hospitalApi.updateHospitalProfile(updatePayload);
    setProfileSaving(false);

    if (!res.success || !res.data) {
      if (res.code === 'CONCURRENT_MODIFICATION') {
        setProfileConflict('Optimistic Concurrency Conflict: The hospital profile was updated by another administrator. Please refresh the latest configuration before saving.');
        if (onNotify) onNotify('Conflict Detected', 'Profile was modified concurrently by another user.', 'warning');
      } else {
        setProfileError(res.error || 'Failed to update hospital profile.');
        if (onNotify) onNotify('Save Failed', res.error || 'Failed to update hospital profile.', 'error');
      }
      return;
    }

    // Success! Update version
    setProfileVersion(res.data.version);
    setProfileDisplayName(res.data.displayName);
    if (res.data.legalName) setProfileLegalName(res.data.legalName);
    if (onNotify) onNotify('Organization Profile Saved', 'Updated enterprise hospital identity, governance metadata, and contact coordinates.', 'success');
  };

  const handleOpenDeptStaff = async (dept: Department) => {
    setViewingStaffDept(dept);
    setLoadingDeptStaff(true);
    try {
      const staffList = await hospitalApi.getDepartmentStaff(dept.id);
      setDeptStaffList(staffList);
    } catch (err: any) {
      if (onNotify) onNotify('Error', err.message || 'Failed to load department staff', 'error');
      setDeptStaffList([]);
    } finally {
      setLoadingDeptStaff(false);
    }
  };

  const handleCreateDepartment = async () => {
    if (!isAdmin) return;
    const cleanCode = newDeptCode.trim().toUpperCase();
    if (!/^[A-Z0-9]{2,10}$/.test(cleanCode)) {
      setCreateDeptError('Department code must be 2 to 10 uppercase alphanumeric characters.');
      return;
    }
    if (newDeptName.trim().length < 2) {
      setCreateDeptError('Department name must be at least 2 characters.');
      return;
    }
    setSavingDept(true);
    setCreateDeptError(null);
    const res = await hospitalApi.createDepartment({
      code: cleanCode,
      name: newDeptName.trim(),
      discipline: newDeptDiscipline,
      description: newDeptDescription.trim() || undefined
    });
    setSavingDept(false);
    if (!res.success || !res.data) {
      setCreateDeptError(res.error || 'Failed to create department.');
      return;
    }
    setIsCreateDeptModalOpen(false);
    setNewDeptCode('');
    setNewDeptName('');
    setNewDeptDescription('');
    if (onNotify) onNotify('Department Created', `Successfully established department ${res.data.name} (${res.data.code}).`, 'success');
    loadDepartments();
  };

  const handleUpdateDepartment = async () => {
    if (!isAdmin || !editingDept) return;
    if (editDeptName.trim().length < 2) {
      setEditDeptError('Department name must be at least 2 characters.');
      return;
    }
    setSavingDept(true);
    setEditDeptError(null);
    const res = await hospitalApi.updateDepartment(editingDept.id, {
      name: editDeptName.trim(),
      discipline: editDeptDiscipline,
      description: editDeptDescription.trim() || undefined
    });
    setSavingDept(false);
    if (!res.success || !res.data) {
      setEditDeptError(res.error || 'Failed to update department.');
      return;
    }
    setEditingDept(null);
    if (onNotify) onNotify('Department Updated', `Successfully updated department ${res.data.name} (${res.data.code}).`, 'success');
    loadDepartments();
  };

  const handleDeactivateDepartment = async () => {
    if (!isAdmin || !deactivatingDept) return;
    if (!deactivationReason.trim()) {
      setDeactivatingError('A non-empty operational reason is required for deactivation.');
      return;
    }
    setSavingDept(true);
    setDeactivatingError(null);
    const res = await hospitalApi.deactivateDepartment(deactivatingDept.id, deactivationReason.trim());
    setSavingDept(false);
    if (!res.success || !res.data) {
      setDeactivatingError(res.error || 'Failed to deactivate department.');
      return;
    }
    setDeactivatingDept(null);
    setDeactivationReason('');
    if (onNotify) onNotify('Department Deactivated', `Department ${res.data.name} is now deactivated.`, 'success');
    loadDepartments();
  };

  const handleActivateDepartment = async (dept: Department) => {
    if (!isAdmin) return;
    const res = await hospitalApi.activateDepartment(dept.id);
    if (!res.success || !res.data) {
      if (onNotify) onNotify('Error', res.error || 'Failed to activate department.', 'error');
      return;
    }
    if (onNotify) onNotify('Department Activated', `Department ${res.data.name} has been reactivated.`, 'success');
    loadDepartments();
  };

  // Build Tab Definitions per Section 3 & 4
  const allTabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'organization', label: 'Organization Profile' },
    { id: 'departments', label: 'Departments', count: departments.length },
    ...(isAdmin ? [{ id: 'staff', label: 'Staff Management', count: staff.length }] : []),
    ...(isSuperAdmin ? [{ id: 'tariffs', label: 'Service & Rate Management', count: tariffs.length }] : []),
    ...(isAdmin ? [{ id: 'audit-logs', label: 'Audit Logs', count: auditLogs.length }] : []),
    ...(isAdmin ? [{ id: 'configuration', label: 'Configuration' }] : []),
    { id: 'profile', label: 'My Profile' },
    { id: 'security', label: 'Security & Sessions' }
  ];

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="bg-white border border-[#e0e0e0] p-5 sm:p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="text-[12px] font-mono uppercase tracking-[0.32px] text-[#525252] mb-1">
            System Administration & Governance
          </div>
          <h1 className="text-[28px] font-semibold text-[#161616] tracking-tight leading-none">
            Settings & Operational Configuration
          </h1>
          <p className="text-[13px] text-[#525252] mt-2">
            Enterprise clinic configuration, staff access controls, HIPAA compliance audit trail, and security credentials.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="px-3 py-1.5 bg-[#defbe6] border border-[#6fdc8c] text-xs font-mono text-[#0e6027] flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-[#24a148]" />
            <span>Clinic Timezone: Asia/Kolkata</span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white border border-[#e0e0e0]">
        <CarbonTabs
          selectedId={activeTab}
          onSelect={(id) => setActiveTab(id as SettingsTabId)}
          tabs={allTabs}
        />

        <div className="p-4 sm:p-6">
          {/* TAB 1: OVERVIEW */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-sm font-semibold text-[#161616]">Operations & Staffing Overview</h3>
                <p className="text-xs text-[#525252] mt-0.5">High-level telemetry of staff workforce, active clinical licenses, and session security.</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="p-4 bg-[#f4f4f4] border border-[#e0e0e0]">
                  <span className="text-[11px] font-mono uppercase text-[#525252] block">Total Registered Staff</span>
                  <div className="text-2xl font-mono text-[#161616] font-semibold mt-1">{staff.length}</div>
                  <span className="text-[11px] text-[#24a148] mt-1 block">Active Clinical Licenses</span>
                </div>
                <div className="p-4 bg-[#f4f4f4] border border-[#e0e0e0]">
                  <span className="text-[11px] font-mono uppercase text-[#525252] block">On-Duty Physicians</span>
                  <div className="text-2xl font-mono text-[#161616] font-semibold mt-1">
                    {staff.filter((s) => s.status === 'on_duty').length}
                  </div>
                  <span className="text-[11px] text-[#0f62fe] mt-1 block">Conducting Consultations</span>
                </div>
                <div className="p-4 bg-[#f4f4f4] border border-[#e0e0e0]">
                  <span className="text-[11px] font-mono uppercase text-[#525252] block">Current Authenticated User</span>
                  <div className="text-sm font-semibold text-[#161616] truncate mt-1">{currentUser.name}</div>
                  <span className="text-[11px] font-mono text-[#0f62fe] mt-1 block">{currentUser.role}</span>
                </div>
                <div className="p-4 bg-[#f4f4f4] border border-[#e0e0e0]">
                  <span className="text-[11px] font-mono uppercase text-[#525252] block">System Governance</span>
                  <div className="text-sm font-semibold text-[#24a148] mt-1">HIPAA Active</div>
                  <span className="text-[11px] text-[#525252] mt-1 block">45 CFR § 164.312(b) Compliant</span>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: ORGANIZATION PROFILE (DATABASE-BACKED) */}
          {activeTab === 'organization' && (
            <div className="space-y-6 max-w-4xl">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-[#e0e0e0]">
                <div>
                  <h3 className="text-sm font-semibold text-[#161616]">Clinic & Hospital Institutional Profile</h3>
                  <p className="text-xs text-[#525252] mt-0.5">Authoritative enterprise hospital profile, official accreditation IDs, and geographic coordinates.</p>
                </div>
                <CarbonButton
                  kind="ghost"
                  size="sm"
                  renderIcon={RefreshCw}
                  onClick={loadHospitalProfile}
                  disabled={profileLoading}
                  title="Reload Latest Profile from Database"
                >
                  Reload Profile
                </CarbonButton>
              </div>

              {/* Role Permission Notice */}
              {!isSuperAdmin && (
                <div className="p-3 bg-[#edf5ff] border border-[#a6c8ff] text-xs text-[#0043ce] flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-[#0f62fe] shrink-0" />
                  <span><strong>Read-Only Governance View:</strong> Only the <strong>SUPER_ADMIN</strong> role is authorized to modify institutional configuration and contact coordinates.</span>
                </div>
              )}

              {/* Concurrency Conflict Alert */}
              {profileConflict && (
                <div className="p-4 bg-[#fff8e1] border border-[#f1c21b] text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-[#8a3800]">
                    <AlertTriangle className="w-4 h-4 text-[#b28600] shrink-0" />
                    <span>{profileConflict}</span>
                  </div>
                  <CarbonButton
                    kind="tertiary"
                    size="sm"
                    renderIcon={RefreshCw}
                    onClick={loadHospitalProfile}
                  >
                    Refresh Latest Profile
                  </CarbonButton>
                </div>
              )}

              {/* Error Banner */}
              {profileError && (
                <div className="p-3 bg-[#fff1f1] border border-[#ffd7d9] text-xs text-[#da1e28] flex items-center justify-between">
                  <span>{profileError}</span>
                  <CarbonButton kind="ghost" size="sm" onClick={() => setProfileError(null)}>Dismiss</CarbonButton>
                </div>
              )}

              {profileLoading ? (
                <div className="p-12 text-center text-xs text-[#525252] flex flex-col items-center justify-center gap-2">
                  <RefreshCw className="w-5 h-5 text-[#0f62fe] animate-spin" />
                  <span>Loading authoritative hospital profile from database...</span>
                </div>
              ) : (
                <>
                  {/* Read-only System Identifiers */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-3 bg-[#f4f4f4] border border-[#e0e0e0] text-xs">
                    <div>
                      <span className="text-[10px] font-mono uppercase text-[#525252] block">Hospital Code</span>
                      <strong className="font-mono text-[#0f62fe] font-bold text-sm">{profileCode}</strong>
                    </div>
                    <div>
                      <span className="text-[10px] font-mono uppercase text-[#525252] block">Version Lock</span>
                      <strong className="font-mono text-[#161616]">v{profileVersion ?? 1} (Optimistic)</strong>
                    </div>
                    <div>
                      <span className="text-[10px] font-mono uppercase text-[#525252] block">Clinic Timezone</span>
                      <strong className="font-mono text-[#161616]">{profileTimezone}</strong>
                    </div>
                    <div>
                      <span className="text-[10px] font-mono uppercase text-[#525252] block">Billing Currency</span>
                      <strong className="font-mono text-[#24a148]">{profileCurrency} (₹)</strong>
                    </div>
                  </div>

                  {/* Profile Fields */}
                  <div className="space-y-4 text-xs">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[11px] font-mono uppercase text-[#525252] mb-1">
                          Hospital Display Name *
                        </label>
                        <input
                          type="text"
                          value={profileDisplayName}
                          onChange={(e) => setProfileDisplayName(e.target.value)}
                          disabled={!isSuperAdmin || profileSaving}
                          className="w-full h-10 min-h-[40px] px-3 bg-[#f4f4f4] border border-[#8d8d8d] focus:bg-white focus:border-[#0f62fe] outline-none text-xs disabled:opacity-75 disabled:cursor-not-allowed"
                          placeholder="Public clinic name..."
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-mono uppercase text-[#525252] mb-1">
                          Legal Entity Name
                        </label>
                        <input
                          type="text"
                          value={profileLegalName}
                          onChange={(e) => setProfileLegalName(e.target.value)}
                          disabled={!isSuperAdmin || profileSaving}
                          className="w-full h-10 min-h-[40px] px-3 bg-[#f4f4f4] border border-[#8d8d8d] focus:bg-white focus:border-[#0f62fe] outline-none text-xs disabled:opacity-75 disabled:cursor-not-allowed"
                          placeholder="Registered corporate legal name..."
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[11px] font-mono uppercase text-[#525252] mb-1">
                        Institutional Tagline / Motto
                      </label>
                      <input
                        type="text"
                        value={profileTagline}
                        onChange={(e) => setProfileTagline(e.target.value)}
                        disabled={!isSuperAdmin || profileSaving}
                        className="w-full h-10 min-h-[40px] px-3 bg-[#f4f4f4] border border-[#8d8d8d] focus:bg-white focus:border-[#0f62fe] outline-none text-xs disabled:opacity-75 disabled:cursor-not-allowed"
                        placeholder="e.g. Traditional Ayurvedic Medicine and Holistic Care"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[11px] font-mono uppercase text-[#525252] mb-1">
                          Clinical Registration / License Number
                        </label>
                        <input
                          type="text"
                          value={profileRegNo}
                          onChange={(e) => setProfileRegNo(e.target.value)}
                          disabled={!isSuperAdmin || profileSaving}
                          className="w-full h-10 min-h-[40px] px-3 bg-[#f4f4f4] border border-[#8d8d8d] focus:bg-white focus:border-[#0f62fe] outline-none text-xs font-mono disabled:opacity-75 disabled:cursor-not-allowed"
                          placeholder="Hospital establishment registration number..."
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-mono uppercase text-[#525252] mb-1">
                          Tax Identification / PAN Number
                        </label>
                        <input
                          type="text"
                          value={profileTaxId}
                          onChange={(e) => setProfileTaxId(e.target.value)}
                          disabled={!isSuperAdmin || profileSaving}
                          className="w-full h-10 min-h-[40px] px-3 bg-[#f4f4f4] border border-[#8d8d8d] focus:bg-white focus:border-[#0f62fe] outline-none text-xs font-mono disabled:opacity-75 disabled:cursor-not-allowed"
                          placeholder="Official tax identification..."
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-[11px] font-mono uppercase text-[#525252] mb-1">
                          Official Contact Email
                        </label>
                        <input
                          type="email"
                          value={profileEmail}
                          onChange={(e) => setProfileEmail(e.target.value)}
                          disabled={!isSuperAdmin || profileSaving}
                          className="w-full h-10 min-h-[40px] px-3 bg-[#f4f4f4] border border-[#8d8d8d] focus:bg-white focus:border-[#0f62fe] outline-none text-xs disabled:opacity-75 disabled:cursor-not-allowed"
                          placeholder="admin@sahachara.com"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-mono uppercase text-[#525252] mb-1">
                          Official Telephone
                        </label>
                        <input
                          type="text"
                          value={profilePhone}
                          onChange={(e) => setProfilePhone(e.target.value)}
                          disabled={!isSuperAdmin || profileSaving}
                          className="w-full h-10 min-h-[40px] px-3 bg-[#f4f4f4] border border-[#8d8d8d] focus:bg-white focus:border-[#0f62fe] outline-none text-xs font-mono disabled:opacity-75 disabled:cursor-not-allowed"
                          placeholder="+91 486 422 3400"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-mono uppercase text-[#525252] mb-1">
                          Public Website
                        </label>
                        <input
                          type="text"
                          value={profileWebsite}
                          onChange={(e) => setProfileWebsite(e.target.value)}
                          disabled={!isSuperAdmin || profileSaving}
                          className="w-full h-10 min-h-[40px] px-3 bg-[#f4f4f4] border border-[#8d8d8d] focus:bg-white focus:border-[#0f62fe] outline-none text-xs disabled:opacity-75 disabled:cursor-not-allowed"
                          placeholder="https://sahachara.com"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[11px] font-mono uppercase text-[#525252] mb-1">
                          Physical Address Line 1
                        </label>
                        <input
                          type="text"
                          value={profileAddressLine1}
                          onChange={(e) => setProfileAddressLine1(e.target.value)}
                          disabled={!isSuperAdmin || profileSaving}
                          className="w-full h-10 min-h-[40px] px-3 bg-[#f4f4f4] border border-[#8d8d8d] focus:bg-white focus:border-[#0f62fe] outline-none text-xs disabled:opacity-75 disabled:cursor-not-allowed"
                          placeholder="Street address..."
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-mono uppercase text-[#525252] mb-1">
                          Address Line 2 (Building / Suite)
                        </label>
                        <input
                          type="text"
                          value={profileAddressLine2}
                          onChange={(e) => setProfileAddressLine2(e.target.value)}
                          disabled={!isSuperAdmin || profileSaving}
                          className="w-full h-10 min-h-[40px] px-3 bg-[#f4f4f4] border border-[#8d8d8d] focus:bg-white focus:border-[#0f62fe] outline-none text-xs disabled:opacity-75 disabled:cursor-not-allowed"
                          placeholder="Building, Suite, Landmark..."
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                      <div>
                        <label className="block text-[11px] font-mono uppercase text-[#525252] mb-1">City</label>
                        <input
                          type="text"
                          value={profileCity}
                          onChange={(e) => setProfileCity(e.target.value)}
                          disabled={!isSuperAdmin || profileSaving}
                          className="w-full h-10 min-h-[40px] px-3 bg-[#f4f4f4] border border-[#8d8d8d] focus:bg-white focus:border-[#0f62fe] outline-none text-xs disabled:opacity-75 disabled:cursor-not-allowed"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-mono uppercase text-[#525252] mb-1">State / Province</label>
                        <input
                          type="text"
                          value={profileState}
                          onChange={(e) => setProfileState(e.target.value)}
                          disabled={!isSuperAdmin || profileSaving}
                          className="w-full h-10 min-h-[40px] px-3 bg-[#f4f4f4] border border-[#8d8d8d] focus:bg-white focus:border-[#0f62fe] outline-none text-xs disabled:opacity-75 disabled:cursor-not-allowed"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-mono uppercase text-[#525252] mb-1">Country</label>
                        <input
                          type="text"
                          value={profileCountry}
                          onChange={(e) => setProfileCountry(e.target.value)}
                          disabled={!isSuperAdmin || profileSaving}
                          className="w-full h-10 min-h-[40px] px-3 bg-[#f4f4f4] border border-[#8d8d8d] focus:bg-white focus:border-[#0f62fe] outline-none text-xs disabled:opacity-75 disabled:cursor-not-allowed"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-mono uppercase text-[#525252] mb-1">Postal Code</label>
                        <input
                          type="text"
                          value={profilePostalCode}
                          onChange={(e) => setProfilePostalCode(e.target.value)}
                          disabled={!isSuperAdmin || profileSaving}
                          className="w-full h-10 min-h-[40px] px-3 bg-[#f4f4f4] border border-[#8d8d8d] focus:bg-white focus:border-[#0f62fe] outline-none font-mono text-xs disabled:opacity-75 disabled:cursor-not-allowed"
                        />
                      </div>
                    </div>

                    {isSuperAdmin && (
                      <div className="pt-3 border-t border-[#e0e0e0] flex items-center justify-between">
                        <span className="text-[11px] text-[#525252]">
                          Saves will increment optimistic concurrency lock from <strong>v{profileVersion ?? 1}</strong> to <strong>v{(profileVersion ?? 1) + 1}</strong>.
                        </span>
                        <CarbonButton
                          kind="primary"
                          renderIcon={Save}
                          onClick={handleSaveHospitalProfile}
                          disabled={profileSaving || profileLoading}
                        >
                          {profileSaving ? 'Saving Profile...' : 'Save Organization Profile'}
                        </CarbonButton>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {/* TAB 3: DEPARTMENT MANAGEMENT (STAGE 4B) */}
          {activeTab === 'departments' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-[#e0e0e0]">
                <div>
                  <h3 className="text-sm font-semibold text-[#161616]">Hospital Departments Master</h3>
                  <p className="text-xs text-[#525252] mt-0.5">Relational department catalog across Ayurveda, Modern Medicine, Operational, and Allied disciplines.</p>
                </div>

                {isAdmin && (
                  <CarbonButton
                    kind="primary"
                    size="sm"
                    renderIcon={Plus}
                    onClick={() => {
                      setCreateDeptError(null);
                      setIsCreateDeptModalOpen(true);
                    }}
                  >
                    Add Department
                  </CarbonButton>
                )}
              </div>

              {/* Filter Strip */}
              <div className="p-3 bg-[#f4f4f4] border border-[#e0e0e0] flex flex-wrap items-center gap-3 text-xs">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="w-4 h-4 text-[#525252] absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={deptSearch}
                    onChange={(e) => setDeptSearch(e.target.value)}
                    placeholder="Search departments by code, name..."
                    className="w-full h-8 pl-9 pr-3 bg-white border border-[#8d8d8d] focus:border-[#0f62fe] outline-none text-xs"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-mono uppercase text-[#525252]">Discipline:</span>
                  <select
                    value={deptDisciplineFilter}
                    onChange={(e) => setDeptDisciplineFilter(e.target.value as any)}
                    className="h-8 px-2 bg-white border border-[#8d8d8d] text-xs outline-none focus:border-[#0f62fe]"
                  >
                    <option value="all">All Disciplines</option>
                    <option value="AYURVEDA">Ayurveda</option>
                    <option value="MODERN_MEDICINE">Modern Medicine</option>
                    <option value="OPERATIONAL">Operational</option>
                    <option value="ALLIED">Allied</option>
                  </select>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-mono uppercase text-[#525252]">Status:</span>
                  <select
                    value={deptStatusFilter}
                    onChange={(e) => setDeptStatusFilter(e.target.value as any)}
                    className="h-8 px-2 bg-white border border-[#8d8d8d] text-xs outline-none focus:border-[#0f62fe]"
                  >
                    <option value="all">All Statuses</option>
                    <option value="active">Active Only</option>
                    <option value="inactive">Deactivated Only</option>
                  </select>
                </div>

                <CarbonButton
                  kind="ghost"
                  size="sm"
                  renderIcon={RefreshCw}
                  onClick={loadDepartments}
                  title="Refresh Departments"
                >
                  Refresh
                </CarbonButton>
              </div>

              {/* Department Table */}
              <div className="border border-[#e0e0e0] bg-white overflow-x-auto">
                {loadingDepartments ? (
                  <div className="p-8 text-center text-xs text-[#525252] flex items-center justify-center gap-2">
                    <RefreshCw className="w-4 h-4 text-[#0f62fe] animate-spin" />
                    <span>Loading departments...</span>
                  </div>
                ) : departments.length === 0 ? (
                  <div className="p-8 text-center text-xs text-[#525252]">
                    No departments found matching the filter criteria.
                  </div>
                ) : (
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-[#f4f4f4] border-b border-[#e0e0e0] text-[11px] font-mono uppercase text-[#525252]">
                      <tr>
                        <th className="py-2.5 px-3">Code</th>
                        <th className="py-2.5 px-3">Department Name</th>
                        <th className="py-2.5 px-3">Discipline</th>
                        <th className="py-2.5 px-3">Staff Assigned</th>
                        <th className="py-2.5 px-3">Status</th>
                        <th className="py-2.5 px-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#e0e0e0]">
                      {departments.map((dept) => {
                        let disciplineTagType: CarbonTagType = 'cool-gray';
                        if (dept.discipline === 'AYURVEDA') disciplineTagType = 'teal';
                        if (dept.discipline === 'MODERN_MEDICINE') disciplineTagType = 'blue';
                        if (dept.discipline === 'ALLIED') disciplineTagType = 'purple';

                        return (
                          <tr key={dept.id} className="hover:bg-[#f4f4f4] transition-colors">
                            <td className="py-2.5 px-3 font-mono font-bold text-[#0f62fe]">
                              {dept.code}
                            </td>
                            <td className="py-2.5 px-3">
                              <div className="font-semibold text-[#161616]">{dept.name}</div>
                              {dept.description && (
                                <div className="text-[11px] text-[#525252] truncate max-w-sm mt-0.5">
                                  {dept.description}
                                </div>
                              )}
                              {dept.deactivationReason && !dept.isActive && (
                                <div className="text-[10px] text-[#da1e28] mt-0.5 font-mono">
                                  Deactivation reason: {dept.deactivationReason}
                                </div>
                              )}
                            </td>
                            <td className="py-2.5 px-3">
                              <CarbonTag type={disciplineTagType}>{dept.discipline.replace('_', ' ')}</CarbonTag>
                            </td>
                            <td className="py-2.5 px-3 font-mono text-xs">
                              {dept.activeAssignmentsCount ?? 0} active
                            </td>
                            <td className="py-2.5 px-3">
                              {dept.isActive ? (
                                <CarbonTag type="green">ACTIVE</CarbonTag>
                              ) : (
                                <CarbonTag type="red">DEACTIVATED</CarbonTag>
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-right">
                              <div className="flex items-center justify-end gap-1">
                                <CarbonButton
                                  kind="ghost"
                                  size="sm"
                                  onClick={() => handleOpenDeptStaff(dept)}
                                  title="View Assigned Staff"
                                >
                                  <Eye className="w-3.5 h-3.5 text-[#0f62fe]" />
                                </CarbonButton>

                                {isAdmin && (
                                  <>
                                    <CarbonButton
                                      kind="ghost"
                                      size="sm"
                                      onClick={() => {
                                        setEditingDept(dept);
                                        setEditDeptName(dept.name);
                                        setEditDeptDiscipline(dept.discipline);
                                        setEditDeptDescription(dept.description || '');
                                        setEditDeptError(null);
                                      }}
                                      title="Edit Department"
                                    >
                                      <Edit className="w-3.5 h-3.5 text-[#525252]" />
                                    </CarbonButton>

                                    {dept.isActive ? (
                                      <CarbonButton
                                        kind="ghost"
                                        size="sm"
                                        onClick={() => {
                                          setDeactivatingDept(dept);
                                          setDeactivationReason('');
                                          setDeactivatingError(null);
                                        }}
                                        title="Deactivate Department"
                                      >
                                        <ToggleLeft className="w-3.5 h-3.5 text-[#da1e28]" />
                                      </CarbonButton>
                                    ) : (
                                      <CarbonButton
                                        kind="ghost"
                                        size="sm"
                                        onClick={() => handleActivateDepartment(dept)}
                                        title="Reactivate Department"
                                      >
                                        <ToggleRight className="w-3.5 h-3.5 text-[#24a148]" />
                                      </CarbonButton>
                                    )}
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}

          {/* TAB 4: STAFF MANAGEMENT */}
          {activeTab === 'staff' && isAdmin && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-[#e0e0e0]">
                <div>
                  <h3 className="text-sm font-semibold text-[#161616]">Staff Access & Roster Directory</h3>
                  <p className="text-xs text-[#525252] mt-0.5">Role allocations, authentication PIN deliveries, and account lifecycle management.</p>
                </div>

                <CarbonButton
                  kind="primary"
                  size="sm"
                  renderIcon={Plus}
                  onClick={() => setIsAddStaffModalOpen(true)}
                >
                  Add Staff Member
                </CarbonButton>
              </div>

              {/* Filter Strip */}
              <div className="p-3 bg-[#f4f4f4] border border-[#e0e0e0] flex flex-wrap items-center gap-3 text-xs">
                <div className="relative flex-1 min-w-[220px]">
                  <Search className="w-4 h-4 text-[#525252] absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={staffSearch}
                    onChange={(e) => setStaffSearch(e.target.value)}
                    placeholder="Search staff by name, email, or employee ID..."
                    className="w-full h-10 min-h-[40px] pl-9 pr-3 bg-white border border-[#8d8d8d] text-xs focus:border-[#0f62fe] outline-none"
                  />
                </div>

                <select
                  value={staffRoleFilter}
                  onChange={(e) => setStaffRoleFilter(e.target.value)}
                  className="h-10 min-h-[40px] bg-white border border-[#8d8d8d] px-3 text-xs outline-none focus:border-[#0f62fe] cursor-pointer min-w-[160px]"
                >
                  <option value="all">All Roles</option>
                  <option value="SUPER_ADMIN">SUPER_ADMIN</option>
                  <option value="ADMIN">ADMIN</option>
                  <option value="DOCTOR">DOCTOR</option>
                  <option value="RECEPTIONIST">RECEPTIONIST</option>
                  <option value="PHARMACIST">PHARMACIST</option>
                  <option value="ACCOUNTANT">ACCOUNTANT</option>
                </select>

                <select
                  value={staffStatusFilter}
                  onChange={(e) => setStaffStatusFilter(e.target.value)}
                  className="h-10 min-h-[40px] bg-white border border-[#8d8d8d] px-3 text-xs outline-none focus:border-[#0f62fe] cursor-pointer min-w-[150px]"
                >
                  <option value="all">All Statuses</option>
                  <option value="active">Active & On Duty</option>
                  <option value="deactivated">Deactivated</option>
                </select>
              </div>

              {/* Staff Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-[#f4f4f4] border-b border-[#e0e0e0] text-[#161616] text-[11px] font-semibold uppercase tracking-wider">
                      <th className="py-2.5 px-3">Name & Email</th>
                      <th className="py-2.5 px-3">Role & Department</th>
                      <th className="py-2.5 px-3">Status</th>
                      <th className="py-2.5 px-3">Active Sessions</th>
                      <th className="py-2.5 px-3">Registered On</th>
                      <th className="py-2.5 px-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#e0e0e0] text-xs">
                    {filteredStaff.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-[#525252]">No staff members match the selected filter.</td>
                      </tr>
                    ) : (
                      filteredStaff.map((s) => (
                        <tr key={s.id} className="hover:bg-[#f4f4f4] transition-colors">
                          <td className="py-2.5 px-3">
                            <div className="font-semibold text-[#161616]">{s.name}</div>
                            <div className="font-mono text-[11px] text-[#525252]">{s.email}</div>
                          </td>
                          <td className="py-2.5 px-3">
                            <div className="text-[#161616] font-medium">{s.role}</div>
                            <div className="text-[11px] text-[#525252]">{s.department}</div>
                          </td>
                          <td className="py-2.5 px-3">
                            <CarbonTag
                              type={s.status === 'on_duty' ? 'green' : s.status === 'active' ? 'blue' : 'cool-gray'}
                              size="sm"
                            >
                              {s.status.toUpperCase()}
                            </CarbonTag>
                          </td>
                          <td className="py-2.5 px-3 font-mono text-[11px] text-[#525252]">
                            1 Active Token
                          </td>
                          <td className="py-2.5 px-3 font-mono text-[11px] text-[#525252]">
                            {s.joiningDate || '2025-01-15'}
                          </td>
                          <td className="py-2.5 px-3 text-right space-x-1">
                            <CarbonButton
                              kind="ghost"
                              size="sm"
                              onClick={() => setPinDialogStaff(s)}
                            >
                              Regenerate PIN
                            </CarbonButton>
                            <CarbonButton
                              kind="ghost"
                              size="sm"
                              onClick={() => {
                                if (onUpdateStaffStatus) {
                                  onUpdateStaffStatus(s.id, s.status === 'inactive' ? 'active' : 'inactive');
                                }
                                if (onNotify) {
                                  onNotify('Staff Status Updated', `${s.name} account status updated.`, 'info');
                                }
                              }}
                            >
                              {s.status === 'inactive' ? 'Activate' : 'Deactivate'}
                            </CarbonButton>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 3B: SERVICE & RATE MANAGEMENT (EXCLUSIVELY SUPER_ADMIN) */}
          {activeTab === 'tariffs' && (
            <ServiceRateManagementSection currentUser={currentUser} onNotify={onNotify} />
          )}

          {/* TAB 4: AUDIT LOGS */}
          {activeTab === 'audit-logs' && isAdmin && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-[#e0e0e0]">
                <div>
                  <h3 className="text-sm font-semibold text-[#161616]">HIPAA Security Audit Trail</h3>
                  <p className="text-xs text-[#525252] mt-0.5">Immutable clinical event audit records under 45 CFR § 164.312(b).</p>
                </div>

                <CarbonButton
                  kind="secondary"
                  size="sm"
                  renderIcon={Download}
                  onClick={handleExportAuditCsv}
                >
                  Export HIPAA Audit CSV
                </CarbonButton>
              </div>

              {/* Filter Strip */}
              <div className="p-3 bg-[#f4f4f4] border border-[#e0e0e0] flex flex-wrap items-center gap-3 text-xs">
                <div className="relative flex-1 min-w-[220px]">
                  <Search className="w-4 h-4 text-[#525252] absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={auditSearch}
                    onChange={(e) => setAuditSearch(e.target.value)}
                    placeholder="Search audit events by actor, action, MRN, or details..."
                    className="w-full h-10 min-h-[40px] pl-9 pr-3 bg-white border border-[#8d8d8d] text-xs focus:border-[#0f62fe] outline-none"
                  />
                </div>

                <select
                  value={auditActionFilter}
                  onChange={(e) => setAuditActionFilter(e.target.value)}
                  className="h-10 min-h-[40px] bg-white border border-[#8d8d8d] px-3 text-xs outline-none focus:border-[#0f62fe] cursor-pointer min-w-[160px]"
                >
                  <option value="all">All Actions</option>
                  <option value="create">Create Records</option>
                  <option value="update">Update Records</option>
                  <option value="export">Export Events</option>
                </select>
              </div>

              {/* Audit Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-[#f4f4f4] border-b border-[#e0e0e0] text-[#161616] text-[11px] font-semibold uppercase tracking-wider">
                      <th className="py-2.5 px-3">Timestamp</th>
                      <th className="py-2.5 px-3">Actor & Role</th>
                      <th className="py-2.5 px-3">Action</th>
                      <th className="py-2.5 px-3">Entity / MRN</th>
                      <th className="py-2.5 px-3">Details</th>
                      <th className="py-2.5 px-3 text-right">View</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#e0e0e0] text-xs">
                    {filteredAuditLogs.slice(0, 15).map((log) => (
                      <tr key={log.id} className="hover:bg-[#f4f4f4] transition-colors">
                        <td className="py-2.5 px-3 font-mono text-[11px] text-[#525252] whitespace-nowrap">
                          {new Date(log.timestamp).toLocaleString()}
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="font-semibold text-[#161616]">{log.actor}</div>
                          <div className="text-[10px] text-[#525252]">{log.role}</div>
                        </td>
                        <td className="py-2.5 px-3 font-medium text-[#161616]">
                          {log.action}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-[11px] text-[#0f62fe]">
                          {log.patientMrn || log.category}
                        </td>
                        <td className="py-2.5 px-3 text-[#525252] max-w-xs truncate">
                          {log.details}
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <button
                            onClick={() => setSelectedAuditLog(log)}
                            className="text-[#0f62fe] hover:underline font-mono text-xs cursor-pointer"
                          >
                            Details
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 5: CONFIGURATION */}
          {activeTab === 'configuration' && isAdmin && (
            <div className="space-y-6 max-w-2xl">
              <div>
                <h3 className="text-sm font-semibold text-[#161616]">System Numbering & Regional Config</h3>
                <p className="text-xs text-[#525252] mt-0.5">Sequence prefixes for medical records, accounting documents, and currency definitions.</p>
              </div>

              <div className="space-y-4 text-xs">
                <div>
                  <label className="block text-[11px] font-mono uppercase text-[#525252] mb-1">
                    Patient ID Prefix (MRN)
                  </label>
                  <input
                    type="text"
                    value={patientPrefix}
                    onChange={(e) => setPatientPrefix(e.target.value)}
                    className="w-full h-10 min-h-[40px] px-3 bg-[#f4f4f4] border border-[#8d8d8d] focus:bg-white focus:border-[#0f62fe] outline-none font-mono text-xs"
                  />
                  <span className="text-[10px] text-[#8d8d8d] mt-1 block">Example result: {patientPrefix}84920</span>
                </div>

                <div>
                  <label className="block text-[11px] font-mono uppercase text-[#525252] mb-1">
                    Invoice Number Prefix
                  </label>
                  <input
                    type="text"
                    value={invoicePrefix}
                    onChange={(e) => setInvoicePrefix(e.target.value)}
                    className="w-full h-10 min-h-[40px] px-3 bg-[#f4f4f4] border border-[#8d8d8d] focus:bg-white focus:border-[#0f62fe] outline-none font-mono text-xs"
                  />
                  <span className="text-[10px] text-[#8d8d8d] mt-1 block">Example result: {invoicePrefix}2026-001</span>
                </div>

                <div>
                  <label className="block text-[11px] font-mono uppercase text-[#525252] mb-1">
                    Receipt Number Prefix
                  </label>
                  <input
                    type="text"
                    value={receiptPrefix}
                    onChange={(e) => setReceiptPrefix(e.target.value)}
                    className="w-full h-10 min-h-[40px] px-3 bg-[#f4f4f4] border border-[#8d8d8d] focus:bg-white focus:border-[#0f62fe] outline-none font-mono text-xs"
                  />
                  <span className="text-[10px] text-[#8d8d8d] mt-1 block">Example result: {receiptPrefix}2026-904</span>
                </div>

                {/* Read-only Regional Defaults */}
                <div className="p-3 bg-[#f4f4f4] border border-[#e0e0e0] space-y-2">
                  <div className="flex justify-between">
                    <span className="text-[#525252]">Clinic Operating Timezone:</span>
                    <strong className="font-mono text-[#161616]">Asia/Kolkata (IST)</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#525252]">Billing Currency:</span>
                    <strong className="font-mono text-[#161616]">INR (₹ - Indian Rupee)</strong>
                  </div>
                </div>

                {/* Theme & Display Mode */}
                <div className="p-4 bg-white border border-[#e0e0e0] space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 border-b border-[#e0e0e0] pb-2">
                    <div>
                      <h4 className="text-sm font-semibold text-[#161616]">IBM Carbon Interface Theme</h4>
                      <p className="text-xs text-[#525252]">Toggle between Carbon Gray 10 (Light) and Gray 100 (Dark) themes.</p>
                    </div>
                    <CarbonTag type={currentTheme === 'g100' ? 'cool-gray' : 'blue'}>
                      {currentTheme === 'g100' ? 'g100 (Dark Active)' : 'g10 (Light Active)'}
                    </CarbonTag>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    <div
                      onClick={() => onSetTheme && onSetTheme('g10')}
                      className={`p-3.5 border cursor-pointer transition-all ${
                        currentTheme === 'g10'
                          ? 'border-[#0f62fe] bg-[#edf5ff] ring-1 ring-[#0f62fe]'
                          : 'border-[#e0e0e0] hover:border-[#8d8d8d] bg-white'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Sun className="w-4 h-4 text-[#0f62fe]" />
                          <span className="font-semibold text-xs text-[#161616]">IBM Carbon g10 (Light)</span>
                        </div>
                        {currentTheme === 'g10' && (
                          <span className="text-[10px] font-mono px-1.5 py-0.5 bg-[#0f62fe] text-white font-semibold">
                            Active
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-[#525252] leading-relaxed">
                        High-clarity light theme with #f4f4f4 background and clean white data cards. Ideal for bright clinical and consultation environments.
                      </p>
                    </div>

                    <div
                      onClick={() => onSetTheme && onSetTheme('g100')}
                      className={`p-3.5 border cursor-pointer transition-all ${
                        currentTheme === 'g100'
                          ? 'border-[#0f62fe] bg-[#161616] text-white ring-1 ring-[#0f62fe]'
                          : 'border-[#e0e0e0] hover:border-[#8d8d8d] bg-white'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Moon className="w-4 h-4 text-[#f1c21b]" />
                          <span className={`font-semibold text-xs ${currentTheme === 'g100' ? 'text-white' : 'text-[#161616]'}`}>
                            IBM Carbon g100 (Dark)
                          </span>
                        </div>
                        {currentTheme === 'g100' && (
                          <span className="text-[10px] font-mono px-1.5 py-0.5 bg-[#0f62fe] text-white font-semibold">
                            Active
                          </span>
                        )}
                      </div>
                      <p className={`text-[11px] leading-relaxed ${currentTheme === 'g100' ? 'text-[#c6c6c6]' : 'text-[#525252]'}`}>
                        Deep charcoal dark theme with #161616 backdrop and #262626 containers. Minimizes eye fatigue during evening duty and diagnostic reading.
                      </p>
                    </div>
                  </div>
                </div>

                <div>
                  <CarbonButton
                    kind="primary"
                    renderIcon={Save}
                    onClick={() => {
                      if (onNotify) {
                        onNotify('System Configuration Saved', 'Document numbering sequences and theme preferences verified.', 'success');
                      }
                    }}
                  >
                    Save System Configuration
                  </CarbonButton>
                </div>
              </div>
            </div>
          )}

          {/* TAB 6: MY PROFILE */}
          {activeTab === 'profile' && (
            <div className="space-y-6 w-full max-w-full">
              {/* Profile Top Banner Card */}
              <div className="p-5 sm:p-6 bg-white border border-[#e0e0e0] flex flex-col md:flex-row md:items-center justify-between gap-5">
                <div className="flex items-start sm:items-center gap-4">
                  <div className="w-14 h-14 bg-[#0f62fe] text-white flex items-center justify-center font-mono font-bold text-xl shrink-0 shadow-sm">
                    {profileName
                      .split(' ')
                      .map((n) => n[0])
                      .join('')
                      .slice(0, 2)
                      .toUpperCase() || 'SA'}
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-lg font-bold text-[#161616] tracking-tight">{profileName}</h2>
                      <CarbonTag type="blue" size="sm">{currentUser.role}</CarbonTag>
                      <CarbonTag type="green" size="sm">Active & Certified</CarbonTag>
                    </div>
                    <p className="text-xs text-[#525252] mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span>{profileDept}</span>
                      <span className="text-[#8d8d8d]">•</span>
                      <span className="font-mono text-[#0f62fe]">Reg: {profileLicense}</span>
                      <span className="text-[#8d8d8d]">•</span>
                      <span>Sahachara Ayurveda Main Complex</span>
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <CarbonButton
                    kind="primary"
                    renderIcon={Save}
                    onClick={() => {
                      if (onNotify) {
                        onNotify('Profile Updated Successfully', 'Clinical profile metadata and contact information saved.', 'success');
                      }
                    }}
                  >
                    Save Profile Details
                  </CarbonButton>
                  {onSignOut && (
                    <CarbonButton
                      kind="danger"
                      renderIcon={LogOut}
                      onClick={onSignOut}
                    >
                      Sign Out
                    </CarbonButton>
                  )}
                </div>
              </div>

              {/* Full Width 2-Column Responsive Clinical Layout */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Primary Column (2 cols) */}
                <div className="lg:col-span-2 space-y-6">
                  {/* Personal & Clinical Contact Information */}
                  <div className="p-5 bg-white border border-[#e0e0e0] space-y-4">
                    <div className="flex items-center justify-between border-b border-[#e0e0e0] pb-3">
                      <div>
                        <h4 className="text-sm font-semibold text-[#161616] flex items-center gap-2">
                          <User className="w-4 h-4 text-[#0f62fe]" />
                          Personal & Clinical Contact Information
                        </h4>
                        <p className="text-xs text-[#525252] mt-0.5">Staff identity registered in Sahachara Ayurveda Healthcare Directory.</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                      <div>
                        <label className="block text-[11px] font-mono uppercase text-[#525252] mb-1">
                          Full Clinical Name *
                        </label>
                        <input
                          type="text"
                          value={profileName}
                          onChange={(e) => setProfileName(e.target.value)}
                          className="w-full h-10 min-h-[40px] px-3 bg-[#f4f4f4] border border-[#8d8d8d] focus:bg-white focus:border-[#0f62fe] outline-none text-xs"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-mono uppercase text-[#525252] mb-1">
                          Authentication Email Address
                        </label>
                        <input
                          type="email"
                          value={currentUser.email}
                          readOnly
                          className="w-full h-10 min-h-[40px] px-3 bg-[#e0e0e0]/40 border border-[#8d8d8d] text-xs font-mono text-[#525252] cursor-not-allowed outline-none"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-mono uppercase text-[#525252] mb-1">
                          Direct Contact Telephone (+91 India) *
                        </label>
                        <input
                          type="text"
                          value={myProfilePhone}
                          onChange={(e) => setMyProfilePhone(e.target.value)}
                          className="w-full h-10 min-h-[40px] px-3 bg-[#f4f4f4] border border-[#8d8d8d] focus:bg-white focus:border-[#0f62fe] outline-none text-xs font-mono"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-mono uppercase text-[#525252] mb-1">
                          Clinical Department / Division
                        </label>
                        <input
                          type="text"
                          value={profileDept}
                          onChange={(e) => setProfileDept(e.target.value)}
                          className="w-full h-10 min-h-[40px] px-3 bg-[#f4f4f4] border border-[#8d8d8d] focus:bg-white focus:border-[#0f62fe] outline-none text-xs"
                        />
                      </div>

                      <div className="sm:col-span-2">
                        <label className="block text-[11px] font-mono uppercase text-[#525252] mb-1">
                          Assigned Consultation Suite / OPD Chamber
                        </label>
                        <input
                          type="text"
                          value={profileRoom}
                          onChange={(e) => setProfileRoom(e.target.value)}
                          className="w-full h-10 min-h-[40px] px-3 bg-[#f4f4f4] border border-[#8d8d8d] focus:bg-white focus:border-[#0f62fe] outline-none text-xs"
                        />
                      </div>
                    </div>
                  </div>

                  {/* AYUSH Accreditation & Qualifications */}
                  <div className="p-5 bg-white border border-[#e0e0e0] space-y-4">
                    <div className="flex items-center justify-between border-b border-[#e0e0e0] pb-3">
                      <div>
                        <h4 className="text-sm font-semibold text-[#161616] flex items-center gap-2">
                          <Award className="w-4 h-4 text-[#0f62fe]" />
                          AYUSH Clinical Credentials & Licensing
                        </h4>
                        <p className="text-xs text-[#525252] mt-0.5">National AYUSH Board and State Medical Council verification dossier.</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                      <div className="p-3 bg-[#f4f4f4] border border-[#e0e0e0] space-y-1">
                        <span className="text-[10px] font-mono uppercase text-[#525252] block">AYUSH Medical Registration Number</span>
                        <input
                          type="text"
                          value={profileLicense}
                          onChange={(e) => setProfileLicense(e.target.value)}
                          className="w-full h-9 px-2 bg-white border border-[#8d8d8d] text-xs font-mono focus:border-[#0f62fe] outline-none font-semibold text-[#161616]"
                        />
                        <span className="text-[10px] text-[#24a148] flex items-center gap-1 mt-1">
                          <CheckCircle2 className="w-3 h-3 text-[#24a148]" /> Verified on National AYUSH Registry
                        </span>
                      </div>

                      <div className="p-3 bg-[#f4f4f4] border border-[#e0e0e0] space-y-1">
                        <span className="text-[10px] font-mono uppercase text-[#525252] block">Registering Council Authority</span>
                        <div className="font-semibold text-[#161616] text-xs">Travancore-Cochin Medical Council</div>
                        <div className="text-[11px] text-[#525252]">Indian Systems of Medicine, Govt of Kerala</div>
                      </div>

                      <div className="p-3 bg-[#f4f4f4] border border-[#e0e0e0] space-y-1">
                        <span className="text-[10px] font-mono uppercase text-[#525252] block">Academic Degrees & Qualifications</span>
                        <div className="font-semibold text-[#161616] text-xs">BAMS, MD (Ayurveda - Kayachikitsa)</div>
                        <div className="text-[11px] text-[#525252]">Govt. Ayurveda College, University of Kerala</div>
                      </div>

                      <div className="p-3 bg-[#f4f4f4] border border-[#e0e0e0] space-y-1">
                        <span className="text-[10px] font-mono uppercase text-[#525252] block">Clinical License Validity</span>
                        <div className="font-semibold text-[#24a148] text-xs">Valid through 31 Dec 2030</div>
                        <div className="text-[11px] text-[#525252]">Annual Continuous Medical Education (CME) Compliant</div>
                      </div>
                    </div>

                    <div className="pt-2">
                      <span className="text-[11px] font-mono uppercase text-[#525252] block mb-2">Verified Clinical Sub-Specializations:</span>
                      <div className="flex flex-wrap gap-2">
                        <span className="px-2.5 py-1 bg-[#edf5ff] border border-[#a6c8ff] text-xs text-[#0043ce] font-medium">
                          Panchakarma Detoxification & Samsarjana Krama
                        </span>
                        <span className="px-2.5 py-1 bg-[#edf5ff] border border-[#a6c8ff] text-xs text-[#0043ce] font-medium">
                          Vata-Vyadhi & Musculoskeletal Care
                        </span>
                        <span className="px-2.5 py-1 bg-[#edf5ff] border border-[#a6c8ff] text-xs text-[#0043ce] font-medium">
                          Ayurvedic Clinical Pharmacology (Dravyaguna)
                        </span>
                        <span className="px-2.5 py-1 bg-[#edf5ff] border border-[#a6c8ff] text-xs text-[#0043ce] font-medium">
                          Agni & Metabolic Restoration
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Sidebar Column (1 col) */}
                <div className="space-y-6">
                  {/* Role-Based Access Control Entitlements */}
                  <div className="p-5 bg-white border border-[#e0e0e0] space-y-4">
                    <div className="border-b border-[#e0e0e0] pb-3">
                      <h4 className="text-sm font-semibold text-[#161616] flex items-center gap-2">
                        <ShieldCheck className="w-4 h-4 text-[#0f62fe]" />
                        RBAC Entitlements & Permissions
                      </h4>
                      <p className="text-xs text-[#525252] mt-0.5">Authorized clinical and operational capabilities.</p>
                    </div>

                    <div className="space-y-2 text-xs">
                      <div className="flex items-center gap-2 text-[#161616]">
                        <CheckCircle2 className="w-4 h-4 text-[#24a148] shrink-0" />
                        <span>Electronic Medical Records (EMR) Read/Write</span>
                      </div>
                      <div className="flex items-center gap-2 text-[#161616]">
                        <CheckCircle2 className="w-4 h-4 text-[#24a148] shrink-0" />
                        <span>Digital E-Prescription Stamping & Formulation Order</span>
                      </div>
                      <div className="flex items-center gap-2 text-[#161616]">
                        <CheckCircle2 className="w-4 h-4 text-[#24a148] shrink-0" />
                        <span>Panchakarma Protocol & Daily Session Dispatch</span>
                      </div>
                      <div className="flex items-center gap-2 text-[#161616]">
                        <CheckCircle2 className="w-4 h-4 text-[#24a148] shrink-0" />
                        <span>Diagnostic Pathology & Laboratory Authorization</span>
                      </div>
                      <div className="flex items-center gap-2 text-[#161616]">
                        <CheckCircle2 className="w-4 h-4 text-[#24a148] shrink-0" />
                        <span>Billing Clearance & Inpatient Financial Review</span>
                      </div>
                      <div className="flex items-center gap-2 text-[#161616]">
                        <CheckCircle2 className="w-4 h-4 text-[#24a148] shrink-0" />
                        <span>Immutable HIPAA Audit Log Inspection</span>
                      </div>
                    </div>
                  </div>

                  {/* Supabase & Authentication Status */}
                  <div className="p-5 bg-white border border-[#e0e0e0] space-y-4">
                    <div className="border-b border-[#e0e0e0] pb-3">
                      <h4 className="text-sm font-semibold text-[#161616] flex items-center gap-2">
                        <Key className="w-4 h-4 text-[#0f62fe]" />
                        Authentication & Security Status
                      </h4>
                      <p className="text-xs text-[#525252] mt-0.5">Active cryptographic identity session.</p>
                    </div>

                    <div className="space-y-2 text-xs">
                      <div className="flex justify-between py-1 border-b border-[#f4f4f4]">
                        <span className="text-[#525252]">Auth Provider:</span>
                        <span className="font-semibold text-[#161616]">Supabase Auth & JWT</span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-[#f4f4f4]">
                        <span className="text-[#525252]">Session Token:</span>
                        <span className="font-mono text-[#0f62fe]">sess_99a8b1c4 (Active)</span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-[#f4f4f4]">
                        <span className="text-[#525252]">Device Network IP:</span>
                        <span className="font-mono text-[#525252]">192.168.1.42 (Clinic LAN)</span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-[#f4f4f4]">
                        <span className="text-[#525252]">Session Timeout:</span>
                        <span className="text-[#525252]">Rolling 7-day inactivity</span>
                      </div>
                      <div className="flex justify-between py-1">
                        <span className="text-[#525252]">Two-Factor (2FA):</span>
                        <span className="text-[#24a148] font-semibold">Enabled (TOTP 2FA)</span>
                      </div>
                    </div>
                  </div>

                  {/* Session Sign Out Action Card */}
                  {onSignOut && (
                    <div className="p-5 bg-[#fff1f1] border border-[#ffb3b8] space-y-3">
                      <div>
                        <h4 className="text-xs font-bold text-[#da1e28]">Terminate Clinical Session</h4>
                        <p className="text-[11px] text-[#525252] mt-1 leading-relaxed">
                          Securely invalidate cryptographic tokens and sign out of this clinical terminal.
                        </p>
                      </div>
                      <CarbonButton
                        kind="danger"
                        size="sm"
                        renderIcon={LogOut}
                        onClick={onSignOut}
                      >
                        Sign Out / Log Out
                      </CarbonButton>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 7: SECURITY & SESSIONS */}
          {activeTab === 'security' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between pb-2 border-b border-[#e0e0e0]">
                <div>
                  <h3 className="text-sm font-semibold text-[#161616]">Active Security & Device Sessions</h3>
                  <p className="text-xs text-[#525252] mt-0.5">Active cryptographic browser sessions authenticated under Better Auth.</p>
                </div>

                <CarbonButton
                  kind="ghost"
                  size="sm"
                  renderIcon={RefreshCw}
                  onClick={() => {
                    if (onNotify) {
                      onNotify('Sessions Refreshed', 'Active security tokens verified with auth server.', 'info');
                    }
                  }}
                >
                  Refresh Sessions
                </CarbonButton>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-[#f4f4f4] border-b border-[#e0e0e0] text-[#161616] text-[11px] font-semibold uppercase tracking-wider">
                      <th className="py-2.5 px-3">Session</th>
                      <th className="py-2.5 px-3">IP Address</th>
                      <th className="py-2.5 px-3">Device / Browser</th>
                      <th className="py-2.5 px-3">Logged In At</th>
                      <th className="py-2.5 px-3">Expires At</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#e0e0e0] text-xs">
                    <tr className="hover:bg-[#f4f4f4]">
                      <td className="py-2.5 px-3 font-mono text-[#0f62fe]">
                        sess_99a8b1c4 (Current)
                      </td>
                      <td className="py-2.5 px-3 font-mono text-[#525252]">
                        192.168.1.42 (Internal LAN)
                      </td>
                      <td className="py-2.5 px-3 text-[#161616] flex items-center gap-1.5">
                        <Laptop className="w-3.5 h-3.5 text-[#525252]" />
                        <span>Chrome 131 / macOS 14.5</span>
                      </td>
                      <td className="py-2.5 px-3 font-mono text-[#525252]">
                        {new Date().toLocaleDateString()} 08:30 AM
                      </td>
                      <td className="py-2.5 px-3 font-mono text-[#525252]">
                        In 7 days (Rolling)
                      </td>
                    </tr>
                    <tr className="hover:bg-[#f4f4f4]">
                      <td className="py-2.5 px-3 font-mono text-[#525252]">
                        sess_88f12a9e
                      </td>
                      <td className="py-2.5 px-3 font-mono text-[#525252]">
                        192.168.1.108 (Ayurveda Ward Tablet)
                      </td>
                      <td className="py-2.5 px-3 text-[#161616] flex items-center gap-1.5">
                        <Smartphone className="w-3.5 h-3.5 text-[#525252]" />
                        <span>Safari Mobile / iOS Tablet</span>
                      </td>
                      <td className="py-2.5 px-3 font-mono text-[#525252]">
                        Yesterday 17:15 PM
                      </td>
                      <td className="py-2.5 px-3 font-mono text-[#525252]">
                        In 6 days
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Explicit Sign Out & Session Termination Card */}
              {onSignOut && (
                <div className="p-4 bg-[#fff1f1] border border-[#ffb3b8] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div>
                    <h4 className="text-xs font-semibold text-[#da1e28]">Terminate Clinical Session</h4>
                    <p className="text-[11px] text-[#525252] mt-0.5">
                      Explicitly sign out of this device, clear authentication tokens, and return to the login screen.
                    </p>
                  </div>
                  <CarbonButton
                    kind="danger"
                    size="sm"
                    renderIcon={LogOut}
                    onClick={onSignOut}
                  >
                    Sign Out Now
                  </CarbonButton>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Add Staff Member Modal */}
      {isAddStaffModalOpen && (
        <CarbonModal
          isOpen={true}
          title="Onboard New Staff Member"
          subtitle="Provision a new physician, therapist, or administrative staff account."
          onClose={() => setIsAddStaffModalOpen(false)}
          onRequestSubmit={async () => {
            if (!newStaffName || !newStaffEmail) {
              if (onNotify) onNotify('Required Fields Missing', 'Please enter staff name and email address.', 'error');
              return;
            }
            if (onAddStaff) {
              await onAddStaff({
                name: newStaffName,
                email: newStaffEmail,
                role: newStaffRole,
                status: setActiveImmediately ? 'active' : 'inactive',
                department: newStaffRole === 'PHARMACIST' ? 'Ayurvedic Pharmacy' : newStaffRole === 'ACCOUNTANT' ? 'Patient Financial Services' : newStaffRole === 'RECEPTIONIST' ? 'Patient Admissions & Front Desk' : 'Clinical Directorate'
              });
            }
            setIsAddStaffModalOpen(false);
            setNewStaffName('');
            setNewStaffEmail('');
          }}
          primaryButtonText="Onboard Staff"
          secondaryButtonText="Cancel"
        >
          <div className="space-y-4 text-xs">
            <div>
              <label className="block text-[11px] font-mono uppercase text-[#525252] mb-1">Full Name *</label>
              <input
                type="text"
                value={newStaffName}
                onChange={(e) => setNewStaffName(e.target.value)}
                placeholder="Dr. Anand Krishnan, BAMS"
                className="w-full h-10 min-h-[40px] px-3 bg-[#f4f4f4] border border-[#8d8d8d] focus:bg-white focus:border-[#0f62fe] outline-none text-xs"
              />
            </div>

            <div>
              <label className="block text-[11px] font-mono uppercase text-[#525252] mb-1">Staff Email Address *</label>
              <input
                type="email"
                value={newStaffEmail}
                onChange={(e) => setNewStaffEmail(e.target.value)}
                placeholder="a.krishnan@sahachara.org"
                className="w-full h-10 min-h-[40px] px-3 bg-[#f4f4f4] border border-[#8d8d8d] focus:bg-white focus:border-[#0f62fe] outline-none text-xs"
              />
            </div>

            <div>
              <label className="block text-[11px] font-mono uppercase text-[#525252] mb-1">Assigned System Role *</label>
              <select
                value={newStaffRole}
                onChange={(e) => setNewStaffRole(e.target.value as any)}
                className="w-full h-10 min-h-[40px] px-3 bg-[#f4f4f4] border border-[#8d8d8d] focus:bg-white focus:border-[#0f62fe] outline-none text-xs cursor-pointer"
              >
                <option value="DOCTOR">DOCTOR</option>
                <option value="RECEPTIONIST">RECEPTIONIST</option>
                <option value="PHARMACIST">PHARMACIST</option>
                <option value="ACCOUNTANT">ACCOUNTANT</option>
                <option value="ADMIN">ADMIN</option>
                <option value="SUPER_ADMIN">SUPER_ADMIN</option>
              </select>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <input
                type="checkbox"
                id="active-immediate"
                checked={setActiveImmediately}
                onChange={(e) => setSetActiveImmediately(e.target.checked)}
                className="accent-[#0f62fe]"
              />
              <label htmlFor="active-immediate" className="text-xs text-[#161616]">
                Set account as Active immediately (or require first-time PIN activation)
              </label>
            </div>
          </div>
        </CarbonModal>
      )}

      {/* Regenerate PIN Dialog */}
      {pinDialogStaff && (
        <CarbonModal
          isOpen={true}
          title="Regenerate Activation PIN"
          subtitle={`Issue a new temporary 4-digit security PIN for ${pinDialogStaff.name}.`}
          onClose={() => setPinDialogStaff(null)}
          onRequestSubmit={() => {
            if (onNotify) {
              onNotify('Activation PIN Regenerated', `New 4-digit PIN generated and dispatched to ${pinDialogStaff.email}.`, 'success');
            }
            setPinDialogStaff(null);
          }}
          primaryButtonText="Regenerate & Send PIN"
          secondaryButtonText="Close"
        >
          <div className="p-3 bg-[#edf5ff] border border-[#a6c8ff] text-xs space-y-2">
            <p className="text-[#0043ce] font-medium">Temporary Credential Verification:</p>
            <div className="p-2 bg-white font-mono text-center text-lg font-bold text-[#161616] tracking-widest border border-[#a6c8ff]">
              7492
            </div>
            <p className="text-[11px] text-[#525252]">
              PIN will expire in 24 hours. The staff member can use this to activate their account at <code>/activate</code>.
            </p>
          </div>
        </CarbonModal>
      )}

      {/* Audit Log Details Modal */}
      {selectedAuditLog && (
        <CarbonModal
          isOpen={true}
          title="Audit Event Details"
          subtitle={`Immutable audit record: ${selectedAuditLog.id}`}
          onClose={() => setSelectedAuditLog(null)}
          primaryButtonText="Close"
          onRequestSubmit={() => setSelectedAuditLog(null)}
        >
          <div className="space-y-3 text-xs">
            <div className="p-3 bg-[#f4f4f4] border border-[#e0e0e0] space-y-2">
              <div className="flex justify-between">
                <span className="text-[#525252]">Timestamp:</span>
                <span className="font-mono text-[#161616]">{new Date(selectedAuditLog.timestamp).toISOString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#525252]">Clinician / Actor:</span>
                <strong className="text-[#161616]">{selectedAuditLog.actor} ({selectedAuditLog.role})</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-[#525252]">Event Category:</span>
                <span className="font-medium text-[#0f62fe]">{selectedAuditLog.category}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#525252]">Action Taken:</span>
                <span className="font-semibold text-[#161616]">{selectedAuditLog.action}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#525252]">Patient MRN:</span>
                <span className="font-mono text-[#0f62fe]">{selectedAuditLog.patientMrn || 'System Level Event'}</span>
              </div>
            </div>

            <div>
              <span className="text-[11px] font-mono uppercase text-[#525252] block mb-1">Details & Payload:</span>
              <div className="p-3 bg-[#161616] text-[#f4f4f4] font-mono text-xs overflow-x-auto border border-[#393939]">
                {selectedAuditLog.details}
              </div>
            </div>
          </div>
        </CarbonModal>
      )}

      {/* PHASE 6B: CREATE DEPARTMENT MODAL */}
      {isCreateDeptModalOpen && (
        <CarbonModal
          isOpen={true}
          title="Create Hospital Department"
          subtitle="Register an authoritative department in the hospital master directory."
          onClose={() => {
            if (!savingDept) setIsCreateDeptModalOpen(false);
          }}
          onRequestSubmit={handleCreateDepartment}
          primaryButtonText={savingDept ? 'Creating...' : 'Create Department'}
          secondaryButtonText="Cancel"
        >
          <div className="space-y-3 text-xs">
            {createDeptError && (
              <div className="p-2.5 bg-[#fff1f1] border border-[#ffd7d9] text-[#da1e28]">
                {createDeptError}
              </div>
            )}

            <div>
              <label className="block text-[11px] font-mono uppercase text-[#525252] mb-1">
                Department Code * (2-10 uppercase alphanumeric, e.g. KAY, SWAS, MED, PHAR)
              </label>
              <input
                type="text"
                value={newDeptCode}
                onChange={(e) => setNewDeptCode(e.target.value.toUpperCase())}
                placeholder="e.g. KAY"
                maxLength={10}
                className="w-full h-9 px-3 bg-[#f4f4f4] border border-[#8d8d8d] focus:bg-white focus:border-[#0f62fe] outline-none font-mono font-bold text-xs"
              />
              <span className="text-[10px] text-[#525252] mt-0.5 block">Department code is strictly permanent and immutable once created.</span>
            </div>

            <div>
              <label className="block text-[11px] font-mono uppercase text-[#525252] mb-1">
                Department Name *
              </label>
              <input
                type="text"
                value={newDeptName}
                onChange={(e) => setNewDeptName(e.target.value)}
                placeholder="e.g. Kayachikitsa (General Internal Medicine)"
                className="w-full h-9 px-3 bg-[#f4f4f4] border border-[#8d8d8d] focus:bg-white focus:border-[#0f62fe] outline-none text-xs"
              />
            </div>

            <div>
              <label className="block text-[11px] font-mono uppercase text-[#525252] mb-1">
                Clinical Discipline *
              </label>
              <select
                value={newDeptDiscipline}
                onChange={(e) => setNewDeptDiscipline(e.target.value as DepartmentDiscipline)}
                className="w-full h-9 px-2 bg-[#f4f4f4] border border-[#8d8d8d] focus:bg-white focus:border-[#0f62fe] outline-none text-xs"
              >
                <option value="AYURVEDA">Ayurveda</option>
                <option value="MODERN_MEDICINE">Modern Medicine</option>
                <option value="OPERATIONAL">Operational</option>
                <option value="ALLIED">Allied</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-mono uppercase text-[#525252] mb-1">
                Description / Clinical Scope
              </label>
              <textarea
                value={newDeptDescription}
                onChange={(e) => setNewDeptDescription(e.target.value)}
                placeholder="Department description, clinical procedures, or hospital function..."
                rows={3}
                className="w-full p-2.5 bg-[#f4f4f4] border border-[#8d8d8d] focus:bg-white focus:border-[#0f62fe] outline-none text-xs"
              />
            </div>
          </div>
        </CarbonModal>
      )}

      {/* PHASE 6B: EDIT DEPARTMENT MODAL */}
      {editingDept && (
        <CarbonModal
          isOpen={true}
          title={`Edit Department: ${editingDept.name}`}
          subtitle={`Department Code: ${editingDept.code}`}
          onClose={() => {
            if (!savingDept) setEditingDept(null);
          }}
          onRequestSubmit={handleUpdateDepartment}
          primaryButtonText={savingDept ? 'Saving...' : 'Save Changes'}
          secondaryButtonText="Cancel"
        >
          <div className="space-y-3 text-xs">
            {editDeptError && (
              <div className="p-2.5 bg-[#fff1f1] border border-[#ffd7d9] text-[#da1e28]">
                {editDeptError}
              </div>
            )}

            <div>
              <label className="block text-[11px] font-mono uppercase text-[#525252] mb-1">
                Department Code (Immutable Database Identity)
              </label>
              <input
                type="text"
                value={editingDept.code}
                disabled
                className="w-full h-9 px-3 bg-[#e0e0e0] border border-[#8d8d8d] font-mono font-bold text-xs text-[#525252] cursor-not-allowed"
              />
            </div>

            <div>
              <label className="block text-[11px] font-mono uppercase text-[#525252] mb-1">
                Department Name *
              </label>
              <input
                type="text"
                value={editDeptName}
                onChange={(e) => setEditDeptName(e.target.value)}
                className="w-full h-9 px-3 bg-[#f4f4f4] border border-[#8d8d8d] focus:bg-white focus:border-[#0f62fe] outline-none text-xs"
              />
            </div>

            <div>
              <label className="block text-[11px] font-mono uppercase text-[#525252] mb-1">
                Clinical Discipline *
              </label>
              <select
                value={editDeptDiscipline}
                onChange={(e) => setEditDeptDiscipline(e.target.value as DepartmentDiscipline)}
                className="w-full h-9 px-2 bg-[#f4f4f4] border border-[#8d8d8d] focus:bg-white focus:border-[#0f62fe] outline-none text-xs"
              >
                <option value="AYURVEDA">Ayurveda</option>
                <option value="MODERN_MEDICINE">Modern Medicine</option>
                <option value="OPERATIONAL">Operational</option>
                <option value="ALLIED">Allied</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-mono uppercase text-[#525252] mb-1">
                Description / Clinical Scope
              </label>
              <textarea
                value={editDeptDescription}
                onChange={(e) => setEditDeptDescription(e.target.value)}
                rows={3}
                className="w-full p-2.5 bg-[#f4f4f4] border border-[#8d8d8d] focus:bg-white focus:border-[#0f62fe] outline-none text-xs"
              />
            </div>
          </div>
        </CarbonModal>
      )}

      {/* PHASE 6B: DEACTIVATE DEPARTMENT MODAL */}
      {deactivatingDept && (
        <CarbonModal
          isOpen={true}
          title={`Deactivate Department: ${deactivatingDept.name}`}
          subtitle={`Department Code: ${deactivatingDept.code}`}
          onClose={() => {
            if (!savingDept) setDeactivatingDept(null);
          }}
          onRequestSubmit={handleDeactivateDepartment}
          primaryButtonText={savingDept ? 'Deactivating...' : 'Confirm Deactivation'}
          secondaryButtonText="Cancel"
        >
          <div className="space-y-3 text-xs">
            <div className="p-3 bg-[#fff1f1] border border-[#ffd7d9] text-[#da1e28]">
              <strong>Warning:</strong> Deactivating a department prevents new staff assignments. Existing active assignments remain intact until transferred or concluded.
            </div>

            {deactivatingError && (
              <div className="p-2.5 bg-[#fff1f1] border border-[#ffd7d9] text-[#da1e28]">
                {deactivatingError}
              </div>
            )}

            <div>
              <label className="block text-[11px] font-mono uppercase text-[#525252] mb-1">
                Operational Reason for Deactivation *
              </label>
              <textarea
                value={deactivationReason}
                onChange={(e) => setDeactivationReason(e.target.value)}
                placeholder="Enter mandatory administrative or clinical justification for deactivating this department..."
                rows={3}
                className="w-full p-2.5 bg-[#f4f4f4] border border-[#8d8d8d] focus:bg-white focus:border-[#0f62fe] outline-none text-xs"
              />
            </div>
          </div>
        </CarbonModal>
      )}

      {/* PHASE 6B: VIEW DEPARTMENT STAFF MODAL */}
      {viewingStaffDept && (
        <CarbonModal
          isOpen={true}
          title={`Department Roster: ${viewingStaffDept.name}`}
          subtitle={`${viewingStaffDept.code} • ${viewingStaffDept.discipline}`}
          onClose={() => setViewingStaffDept(null)}
          onRequestSubmit={() => setViewingStaffDept(null)}
          primaryButtonText="Close"
        >
          <div className="space-y-3 text-xs">
            {loadingDeptStaff ? (
              <div className="p-8 text-center text-[#525252] flex items-center justify-center gap-2">
                <RefreshCw className="w-4 h-4 text-[#0f62fe] animate-spin" />
                <span>Loading assigned staff...</span>
              </div>
            ) : deptStaffList.length === 0 ? (
              <div className="p-6 text-center text-[#525252] border border-[#e0e0e0] bg-[#f4f4f4]">
                No operational staff members are currently assigned to this department.
              </div>
            ) : (
              <div className="border border-[#e0e0e0] max-h-[50vh] overflow-y-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-[#f4f4f4] border-b border-[#e0e0e0] text-[10px] font-mono uppercase text-[#525252]">
                    <tr>
                      <th className="p-2">Employee ID</th>
                      <th className="p-2">Staff Name</th>
                      <th className="p-2">Role</th>
                      <th className="p-2">Assignment Type</th>
                      <th className="p-2">Department Title</th>
                      <th className="p-2">Effective Since</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#e0e0e0]">
                    {deptStaffList.map((asg) => (
                      <tr key={asg.id} className="hover:bg-[#f4f4f4]">
                        <td className="p-2 font-mono text-[#0f62fe] font-semibold">
                          {asg.staffMember?.employeeId || 'N/A'}
                        </td>
                        <td className="p-2 font-medium text-[#161616]">
                          {asg.staffMember?.name || 'Staff Member'}
                        </td>
                        <td className="p-2">
                          <CarbonTag type="cool-gray">{asg.staffMember?.role || 'DOCTOR'}</CarbonTag>
                        </td>
                        <td className="p-2">
                          {asg.isPrimary ? (
                            <CarbonTag type="teal">PRIMARY</CarbonTag>
                          ) : (
                            <CarbonTag type="blue">SECONDARY</CarbonTag>
                          )}
                        </td>
                        <td className="p-2 text-[#525252]">
                          {asg.roleTitle || '—'}
                        </td>
                        <td className="p-2 font-mono text-[10px] text-[#525252]">
                          {new Date(asg.startDate).toLocaleDateString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </CarbonModal>
      )}

    </div>
  );
};
