import React, { useState, useEffect, useMemo } from 'react';
import {
  Plus,
  Search,
  RefreshCw,
  Edit3,
  Clock,
  DollarSign,
  CheckCircle2,
  AlertTriangle,
  X,
  Filter,
  ShieldAlert,
  History,
  Calendar,
  Lock,
  Layers,
  ArrowUpDown
} from 'lucide-react';
import { CarbonButton } from '../components/carbon/CarbonButton';
import { CarbonTag, CarbonTagType } from '../components/carbon/CarbonTag';
import { CarbonModal } from '../components/carbon/CarbonModal';
import { CarbonTile } from '../components/carbon/CarbonTile';
import { AppUser, HospitalTariff, RateHistory } from '../types/hospital';
import { hospitalApi } from '../services/hospitalApi';

interface ServiceRateManagementSectionProps {
  currentUser: AppUser;
  onNotify?: (title: string, subtitle?: string, kind?: 'info' | 'success' | 'warning' | 'error') => void;
}

const CATEGORY_OPTIONS = [
  'Consultation',
  'Ayurvedic Consultation',
  'General Medical Consultation',
  'Treatment',
  'Panchakarma',
  'Laboratory Investigation',
  'Procedure',
  'Bed Charges',
  'Accommodation',
  'Other Hospital Services'
];

const DEPARTMENT_OPTIONS = [
  'General OPD',
  'Kayachikitsa',
  'Panchakarma Therapy',
  'Shalya Tantra',
  'Shalakya Tantra',
  'Kaumarbhritya',
  'Prasuti & Stri Roga',
  'Swasthavritta',
  'Diagnostic Pathology',
  'Hospital Inpatient / Ward',
  'Emergency & Triage'
];

const SERVICE_TYPE_OPTIONS = [
  'Clinical Consultation',
  'Therapeutic Procedure',
  'Diagnostic Investigation',
  'Inpatient Accommodation',
  'Emergency Triage',
  'Nursing & Ancillary'
];

export const ServiceRateManagementSection: React.FC<ServiceRateManagementSectionProps> = ({
  currentUser,
  onNotify
}) => {
  const isSuperAdmin = currentUser.role === 'SUPER_ADMIN';

  const [tariffs, setTariffs] = useState<HospitalTariff[]>(() => hospitalApi.getTariffs());
  const [isLoading, setIsLoading] = useState<boolean>(false);

  // Filters
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'configured' | 'unconfigured' | 'inactive' | 'zero_rate'>('all');

  // Modals state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState<boolean>(false);
  const [editingService, setEditingService] = useState<HospitalTariff | null>(null);
  const [configuringRateService, setConfiguringRateService] = useState<HospitalTariff | null>(null);
  const [historyService, setHistoryService] = useState<HospitalTariff | null>(null);
  const [historyDetails, setHistoryDetails] = useState<RateHistory[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState<boolean>(false);

  // Service form state (Create / Edit metadata)
  const [formServiceCode, setFormServiceCode] = useState<string>('');
  const [formServiceName, setFormServiceName] = useState<string>('');
  const [formCategory, setFormCategory] = useState<string>('Consultation');
  const [formDepartment, setFormDepartment] = useState<string>('General OPD');
  const [formServiceType, setFormServiceType] = useState<string>('Clinical Consultation');
  const [formUnit, setFormUnit] = useState<string>('per consultation');
  const [formDuration, setFormDuration] = useState<string>('30');
  const [formDescription, setFormDescription] = useState<string>('');
  const [formNotes, setFormNotes] = useState<string>('');
  const [isSavingService, setIsSavingService] = useState<boolean>(false);

  // Rate configuration form state
  const [rateInput, setRateInput] = useState<string>('');
  const [rateIsZeroPermitted, setRateIsZeroPermitted] = useState<boolean>(false);
  const [rateEffectiveFrom, setRateEffectiveFrom] = useState<string>(new Date().toISOString().split('T')[0]);
  const [rateEffectiveUntil, setRateEffectiveUntil] = useState<string>('');
  const [rateChangeReason, setRateChangeReason] = useState<string>('');
  const [isSavingRate, setIsSavingRate] = useState<boolean>(false);
  const [rateValidationError, setRateValidationError] = useState<string | null>(null);

  // Fetch tariffs on mount
  const loadTariffs = async () => {
    setIsLoading(true);
    try {
      const data = await hospitalApi.fetchTariffs(true);
      setTariffs(data);
    } catch (err: any) {
      if (onNotify) {
        onNotify('Failed to Load Tariffs', err?.message || 'Could not fetch services from server.', 'error');
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isSuperAdmin) {
      loadTariffs();
    }
  }, [isSuperAdmin]);

  // If not SUPER_ADMIN, display explicit unauthorized notice
  if (!isSuperAdmin) {
    return (
      <div className="p-6 bg-white border border-[#e0e0e0] space-y-4">
        <div className="flex items-center gap-3 p-4 bg-[#fff1f1] border-l-4 border-l-[#da1e28] border border-[#ffd7d9]">
          <ShieldAlert className="w-6 h-6 text-[#da1e28] flex-shrink-0" />
          <div>
            <h3 className="text-sm font-semibold text-[#161616]">Access Denied — Restricted Module</h3>
            <p className="text-xs text-[#525252] mt-1">
              Hospital Service & Rate Management is restricted <strong>exclusively to the SUPER_ADMIN</strong> role under hospital governance policy.
              Your current role (<span className="font-mono font-semibold text-[#da1e28]">{currentUser.role}</span>) does not possess tariff administrative privileges.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Summary Metrics
  const metrics = useMemo(() => {
    const total = tariffs.length;
    const configured = tariffs.filter((t) => t.rate !== null && t.rate !== undefined && t.isActive !== false).length;
    const unconfigured = tariffs.filter((t) => t.rate === null || t.rate === undefined).length;
    const inactive = tariffs.filter((t) => t.isActive === false).length;
    const zeroRate = tariffs.filter((t) => t.rate === 0 && t.isZeroPricePermitted).length;
    return { total, configured, unconfigured, inactive, zeroRate };
  }, [tariffs]);

  // Filtered Services List
  const filteredTariffs = useMemo(() => {
    return tariffs.filter((t) => {
      // Search
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const matches =
          t.serviceName.toLowerCase().includes(q) ||
          t.serviceCode.toLowerCase().includes(q) ||
          (t.department && t.department.toLowerCase().includes(q)) ||
          (t.category && t.category.toLowerCase().includes(q)) ||
          (t.description && t.description.toLowerCase().includes(q));
        if (!matches) return false;
      }

      // Category
      if (categoryFilter !== 'all' && t.category !== categoryFilter) {
        return false;
      }

      // Status
      if (statusFilter === 'configured') {
        if (t.rate === null || t.rate === undefined || t.isActive === false) return false;
      } else if (statusFilter === 'unconfigured') {
        if (t.rate !== null && t.rate !== undefined) return false;
      } else if (statusFilter === 'inactive') {
        if (t.isActive !== false) return false;
      } else if (statusFilter === 'zero_rate') {
        if (t.rate !== 0 || !t.isZeroPricePermitted) return false;
      }

      return true;
    });
  }, [tariffs, searchTerm, categoryFilter, statusFilter]);

  // Open Create Modal
  const handleOpenCreateModal = () => {
    setFormServiceCode('');
    setFormServiceName('');
    setFormCategory('Consultation');
    setFormDepartment('General OPD');
    setFormServiceType('Clinical Consultation');
    setFormUnit('per consultation');
    setFormDuration('30');
    setFormDescription('');
    setFormNotes('');
    setIsCreateModalOpen(true);
  };

  // Open Edit Service Modal
  const handleOpenEditModal = (service: HospitalTariff) => {
    setEditingService(service);
    setFormServiceCode(service.serviceCode);
    setFormServiceName(service.serviceName);
    setFormCategory(service.category);
    setFormDepartment(service.department || 'General OPD');
    setFormServiceType(service.serviceType || 'Clinical Consultation');
    setFormUnit(service.unit);
    setFormDuration(service.durationMinutes ? String(service.durationMinutes) : '');
    setFormDescription(service.description || '');
    setFormNotes(service.notes || '');
  };

  // Save Service Metadata (Create / Edit)
  const handleSaveService = async () => {
    if (!formServiceCode.trim() || !formServiceName.trim()) {
      if (onNotify) {
        onNotify('Validation Error', 'Service Code and Service Name are mandatory.', 'warning');
      }
      return;
    }

    setIsSavingService(true);
    try {
      if (editingService) {
        const updated = await hospitalApi.updateService(editingService.id, {
          serviceName: formServiceName.trim(),
          category: formCategory,
          department: formDepartment,
          serviceType: formServiceType,
          unit: formUnit.trim(),
          durationMinutes: formDuration ? parseInt(formDuration, 10) : undefined,
          description: formDescription.trim(),
          notes: formNotes.trim()
        });
        setTariffs((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
        setEditingService(null);
        if (onNotify) {
          onNotify('Service Updated', `Updated service details for ${updated.serviceName} (${updated.serviceCode}).`, 'success');
        }
      } else {
        const created = await hospitalApi.createService({
          serviceCode: formServiceCode.trim().toUpperCase(),
          serviceName: formServiceName.trim(),
          category: formCategory,
          department: formDepartment,
          serviceType: formServiceType,
          unit: formUnit.trim(),
          durationMinutes: formDuration ? parseInt(formDuration, 10) : undefined,
          description: formDescription.trim(),
          notes: formNotes.trim()
        });
        setTariffs((prev) => [created, ...prev]);
        setIsCreateModalOpen(false);
        if (onNotify) {
          onNotify('Service Created', `Created service ${created.serviceName} (${created.serviceCode}) with UNCONFIGURED initial rate.`, 'success');
        }
      }
    } catch (err: any) {
      if (onNotify) {
        onNotify('Action Failed', err?.message || 'Could not save hospital service.', 'error');
      }
    } finally {
      setIsSavingService(false);
    }
  };

  // Open Rate Configuration Modal
  const handleOpenRateModal = (service: HospitalTariff) => {
    setConfiguringRateService(service);
    setRateInput(service.rate !== null && service.rate !== undefined ? String(service.rate) : '');
    setRateIsZeroPermitted(service.isZeroPricePermitted || false);
    setRateEffectiveFrom(service.effectiveFrom ? service.effectiveFrom.split('T')[0] : new Date().toISOString().split('T')[0]);
    setRateEffectiveUntil(service.effectiveUntil ? service.effectiveUntil.split('T')[0] : '');
    setRateChangeReason('');
    setRateValidationError(null);
  };

  // Save Rate Configuration
  const handleSaveRate = async () => {
    if (!configuringRateService) return;
    setRateValidationError(null);

    let parsedRate: number | null = null;
    if (rateInput.trim() !== '') {
      parsedRate = Number(rateInput);
      if (isNaN(parsedRate)) {
        setRateValidationError('Tariff rate must be a valid number.');
        return;
      }
      if (parsedRate < 0) {
        setRateValidationError('Tariff rate cannot be negative. Must be >= 0.');
        return;
      }
      if (parsedRate === 0 && !rateIsZeroPermitted) {
        setRateValidationError('Deliberate ₹0 tariff requires explicit authorization. Please check "Permit Legitimate ₹0 Billing".');
        return;
      }
    }

    setIsSavingRate(true);
    try {
      const updated = await hospitalApi.configureTariffRate(configuringRateService.id, {
        rate: parsedRate,
        isZeroPricePermitted: rateIsZeroPermitted,
        effectiveFrom: rateEffectiveFrom || undefined,
        effectiveUntil: rateEffectiveUntil || undefined,
        note: rateChangeReason.trim() || undefined
      });
      setTariffs((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
      setConfiguringRateService(null);
      if (onNotify) {
        onNotify(
          'Tariff Rate Established',
          `Configured ${updated.serviceName} to ${updated.rate !== null ? `₹${updated.rate.toLocaleString('en-IN')}` : 'UNCONFIGURED'}.`,
          'success'
        );
      }
    } catch (err: any) {
      setRateValidationError(err?.message || 'Failed to save authorized tariff rate.');
    } finally {
      setIsSavingRate(false);
    }
  };

  // Toggle Active / Inactive Status
  const handleToggleStatus = async (service: HospitalTariff) => {
    const newStatus = service.isActive === false ? true : false;
    try {
      const updated = await hospitalApi.toggleTariffStatus(service.id, newStatus);
      setTariffs((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
      if (onNotify) {
        onNotify(
          newStatus ? 'Service Activated' : 'Service Deactivated',
          `${service.serviceName} is now ${newStatus ? 'ACTIVE and available for clinical billing' : 'INACTIVE and prevented from billing'}.`,
          newStatus ? 'success' : 'warning'
        );
      }
    } catch (err: any) {
      if (onNotify) {
        onNotify('Status Update Failed', err?.message || 'Could not update service status.', 'error');
      }
    }
  };

  // Open Rate History Modal
  const handleOpenHistoryModal = async (service: HospitalTariff) => {
    setHistoryService(service);
    setIsLoadingHistory(true);
    setHistoryDetails([]);
    try {
      const fullTariff = await hospitalApi.getTariffById(service.id);
      if (fullTariff && fullTariff.rateHistories) {
        setHistoryDetails(fullTariff.rateHistories);
      } else {
        setHistoryDetails([]);
      }
    } catch (err) {
      setHistoryDetails([]);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Governance Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-[#e0e0e0]">
        <div>
          <div className="text-[11px] font-mono uppercase tracking-[0.32px] text-[#0f62fe] mb-0.5">
            Super Admin Exclusive &bull; Financial Governance
          </div>
          <h3 className="text-lg font-semibold text-[#161616]">Hospital Service & Rate Management</h3>
          <p className="text-xs text-[#525252] mt-0.5">
            Master service catalogue, authorized clinical tariffs, rate history audit trails, and billing validation controls.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <CarbonButton
            kind="secondary"
            size="sm"
            renderIcon={RefreshCw}
            disabled={isLoading}
            onClick={loadTariffs}
          >
            {isLoading ? 'Refreshing...' : 'Refresh'}
          </CarbonButton>

          <CarbonButton
            kind="primary"
            size="sm"
            renderIcon={Plus}
            onClick={handleOpenCreateModal}
          >
            New Hospital Service
          </CarbonButton>
        </div>
      </div>

      {/* Governance Policy Notice */}
      <div className="p-3.5 bg-[#edf5ff] border-l-4 border-l-[#0f62fe] border border-[#a6c8ff] text-xs text-[#0043ce] flex flex-col md:flex-row md:items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Lock className="w-4 h-4 flex-shrink-0 text-[#0f62fe]" />
          <div>
            <strong>Strict Tariff Governance:</strong> Unconfigured services (<code>rate = null</code>) and inactive services cannot be billed. ₹0 services require explicit authorization.
          </div>
        </div>
        <div className="font-mono text-[11px] font-semibold flex items-center gap-1.5 flex-shrink-0">
          <span className="w-2 h-2 rounded-full bg-[#24a148]"></span>
          {metrics.configured} of {metrics.total} Active Tariffs Configured
        </div>
      </div>

      {/* Metric Tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <CarbonTile title="TOTAL SERVICES" subtitle="Hospital Catalogue">
          <div className="text-2xl font-bold font-mono text-[#161616] mt-1">{metrics.total}</div>
        </CarbonTile>

        <CarbonTile title="CONFIGURED" subtitle="Active & Billable">
          <div className="text-2xl font-bold font-mono text-[#24a148] mt-1">{metrics.configured}</div>
        </CarbonTile>

        <CarbonTile title="UNCONFIGURED" subtitle="Rate = NULL (Unbillable)">
          <div className="text-2xl font-bold font-mono text-[#da1e28] mt-1">{metrics.unconfigured}</div>
        </CarbonTile>

        <CarbonTile title="INACTIVE" subtitle="Soft-Deactivated">
          <div className="text-2xl font-bold font-mono text-[#8d8d8d] mt-1">{metrics.inactive}</div>
        </CarbonTile>

        <CarbonTile title="ZERO-RATE" subtitle="Authorized ₹0">
          <div className="text-2xl font-bold font-mono text-[#0072c3] mt-1">{metrics.zeroRate}</div>
        </CarbonTile>
      </div>

      {/* Search & Filter Bar */}
      <div className="p-3 bg-[#f4f4f4] border border-[#e0e0e0] flex flex-wrap items-center gap-3 text-xs">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="w-4 h-4 text-[#525252] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by code, service name, department, or description..."
            className="w-full h-10 min-h-[40px] pl-9 pr-3 bg-white border border-[#8d8d8d] text-xs focus:border-[#0f62fe] outline-none"
          />
        </div>

        <div className="flex items-center gap-2">
          <span className="font-semibold text-[#161616] whitespace-nowrap">Category:</span>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="h-10 min-h-[40px] bg-white border border-[#8d8d8d] px-3 text-xs outline-none focus:border-[#0f62fe] cursor-pointer min-w-[170px]"
          >
            <option value="all">All Categories ({tariffs.length})</option>
            {CATEGORY_OPTIONS.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <span className="font-semibold text-[#161616] whitespace-nowrap">Status:</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="h-10 min-h-[40px] bg-white border border-[#8d8d8d] px-3 text-xs outline-none focus:border-[#0f62fe] cursor-pointer min-w-[170px]"
          >
            <option value="all">All Statuses</option>
            <option value="configured">Configured (Billable)</option>
            <option value="unconfigured">Unconfigured (NULL)</option>
            <option value="inactive">Inactive</option>
            <option value="zero_rate">Approved ₹0</option>
          </select>
        </div>
      </div>

      {/* Services Table */}
      <div className="border border-[#e0e0e0] bg-white overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-[#f4f4f4] border-b border-[#e0e0e0] text-[#161616] text-[11px] font-semibold uppercase tracking-wider">
              <th className="py-2.5 px-3">Service Code</th>
              <th className="py-2.5 px-3">Service Name & Department</th>
              <th className="py-2.5 px-3">Category</th>
              <th className="py-2.5 px-3">Billing Unit</th>
              <th className="py-2.5 px-3">Authorized Rate</th>
              <th className="py-2.5 px-3">Status</th>
              <th className="py-2.5 px-3">Effective Window</th>
              <th className="py-2.5 px-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#e0e0e0] text-xs">
            {filteredTariffs.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-8 text-center text-[#525252]">
                  No services matching the selected filters.
                </td>
              </tr>
            ) : (
              filteredTariffs.map((t) => {
                const isInactive = t.isActive === false;
                const isUnconfigured = t.rate === null || t.rate === undefined;
                const isZero = t.rate === 0 && t.isZeroPricePermitted;

                return (
                  <tr key={t.id} className={`hover:bg-[#f4f4f4]/60 ${isInactive ? 'opacity-60 bg-[#fafafa]' : ''}`}>
                    {/* Service Code */}
                    <td className="py-3 px-3 font-mono font-medium text-[#0f62fe] whitespace-nowrap">
                      {t.serviceCode}
                    </td>

                    {/* Service Name & Details */}
                    <td className="py-3 px-3">
                      <div className="font-semibold text-[#161616]">{t.serviceName}</div>
                      <div className="text-[11px] text-[#525252] flex items-center gap-2 mt-0.5">
                        {t.department && <span className="font-medium text-[#161616]">{t.department}</span>}
                        {t.durationMinutes && <span>&bull; {t.durationMinutes} min</span>}
                        {t.description && <span className="truncate max-w-[240px]">&bull; {t.description}</span>}
                      </div>
                    </td>

                    {/* Category */}
                    <td className="py-3 px-3 whitespace-nowrap">
                      <CarbonTag type="warm-gray" size="sm">{t.category}</CarbonTag>
                    </td>

                    {/* Unit */}
                    <td className="py-3 px-3 text-[#525252] whitespace-nowrap capitalize">
                      {t.unit}
                    </td>

                    {/* Authorized Rate */}
                    <td className="py-3 px-3 whitespace-nowrap">
                      {isUnconfigured ? (
                        <CarbonTag type="warm-gray" size="sm">UNCONFIGURED</CarbonTag>
                      ) : isZero ? (
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono font-bold text-[#161616]">₹0</span>
                          <CarbonTag type="teal" size="sm">APPROVED ZERO</CarbonTag>
                        </div>
                      ) : (
                        <span className="font-mono font-semibold text-[#161616] text-[13px]">
                          ₹{t.rate?.toLocaleString('en-IN')}
                        </span>
                      )}
                    </td>

                    {/* Status */}
                    <td className="py-3 px-3 whitespace-nowrap">
                      {isInactive ? (
                        <CarbonTag type="red" size="sm">INACTIVE</CarbonTag>
                      ) : isUnconfigured ? (
                        <CarbonTag type="warm-gray" size="sm">ACTIVE (UNCONFIGURED)</CarbonTag>
                      ) : (
                        <CarbonTag type="green" size="sm">ACTIVE (CONFIGURED)</CarbonTag>
                      )}
                    </td>

                    {/* Effective Window */}
                    <td className="py-3 px-3 text-[11px] text-[#525252] whitespace-nowrap">
                      {t.effectiveFrom ? (
                        <span>
                          {new Date(t.effectiveFrom).toLocaleDateString('en-IN')}
                          {t.effectiveUntil ? ` → ${new Date(t.effectiveUntil).toLocaleDateString('en-IN')}` : ' → Indefinite'}
                        </span>
                      ) : (
                        <span className="text-[#8d8d8d]">Immediate / Indefinite</span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="py-3 px-3 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1.5">
                        <CarbonButton
                          kind="ghost"
                          size="sm"
                          renderIcon={DollarSign}
                          onClick={() => handleOpenRateModal(t)}
                          title="Configure Tariff Rate"
                        >
                          {isUnconfigured ? 'Establish Rate' : 'Edit Rate'}
                        </CarbonButton>

                        <CarbonButton
                          kind="ghost"
                          size="sm"
                          renderIcon={Edit3}
                          onClick={() => handleOpenEditModal(t)}
                          title="Edit Service Metadata"
                        >
                          Edit
                        </CarbonButton>

                        <CarbonButton
                          kind="ghost"
                          size="sm"
                          renderIcon={History}
                          onClick={() => handleOpenHistoryModal(t)}
                          title="View Rate History"
                        >
                          History
                        </CarbonButton>

                        <button
                          type="button"
                          onClick={() => handleToggleStatus(t)}
                          className={`px-2 py-1 text-[11px] font-semibold border transition-colors ${
                            isInactive
                              ? 'border-[#24a148] text-[#24a148] hover:bg-[#24a148]/10'
                              : 'border-[#da1e28] text-[#da1e28] hover:bg-[#da1e28]/10'
                          }`}
                          title={isInactive ? 'Reactivate Service' : 'Deactivate Service'}
                        >
                          {isInactive ? 'Reactivate' : 'Deactivate'}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Modal 1: Create New Service */}
      {isCreateModalOpen && (
        <CarbonModal
          isOpen={true}
          onClose={() => setIsCreateModalOpen(false)}
          title="Create New Hospital Service"
          label="Hospital Service Catalogue Master"
          primaryButtonText={isSavingService ? 'Creating...' : 'Create Service'}
          secondaryButtonText="Cancel"
          onRequestSubmit={handleSaveService}
        >
          <div className="space-y-4 text-xs">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold uppercase text-[#161616] mb-1">
                  Service Code *
                </label>
                <input
                  type="text"
                  value={formServiceCode}
                  onChange={(e) => setFormServiceCode(e.target.value.toUpperCase())}
                  placeholder="e.g. TRT-NASYA-30"
                  className="w-full h-10 px-3 bg-white border border-[#8d8d8d] text-xs font-mono uppercase focus:border-[#0f62fe] outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold uppercase text-[#161616] mb-1">
                  Category *
                </label>
                <select
                  value={formCategory}
                  onChange={(e) => setFormCategory(e.target.value)}
                  className="w-full h-10 px-3 bg-white border border-[#8d8d8d] text-xs focus:border-[#0f62fe] outline-none"
                >
                  {CATEGORY_OPTIONS.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold uppercase text-[#161616] mb-1">
                Service Name *
              </label>
              <input
                type="text"
                value={formServiceName}
                onChange={(e) => setFormServiceName(e.target.value)}
                placeholder="e.g. Nasya Karma Therapy (30 Minutes)"
                className="w-full h-10 px-3 bg-white border border-[#8d8d8d] text-xs focus:border-[#0f62fe] outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold uppercase text-[#161616] mb-1">
                  Department
                </label>
                <select
                  value={formDepartment}
                  onChange={(e) => setFormDepartment(e.target.value)}
                  className="w-full h-10 px-3 bg-white border border-[#8d8d8d] text-xs focus:border-[#0f62fe] outline-none"
                >
                  {DEPARTMENT_OPTIONS.map((dep) => (
                    <option key={dep} value={dep}>
                      {dep}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold uppercase text-[#161616] mb-1">
                  Service Type
                </label>
                <select
                  value={formServiceType}
                  onChange={(e) => setFormServiceType(e.target.value)}
                  className="w-full h-10 px-3 bg-white border border-[#8d8d8d] text-xs focus:border-[#0f62fe] outline-none"
                >
                  {SERVICE_TYPE_OPTIONS.map((st) => (
                    <option key={st} value={st}>
                      {st}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold uppercase text-[#161616] mb-1">
                  Billing Unit *
                </label>
                <input
                  type="text"
                  value={formUnit}
                  onChange={(e) => setFormUnit(e.target.value)}
                  placeholder="e.g. per session, per day"
                  className="w-full h-10 px-3 bg-white border border-[#8d8d8d] text-xs focus:border-[#0f62fe] outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold uppercase text-[#161616] mb-1">
                  Duration (Minutes)
                </label>
                <input
                  type="number"
                  min="0"
                  step="5"
                  value={formDuration}
                  onChange={(e) => setFormDuration(e.target.value)}
                  placeholder="e.g. 45"
                  className="w-full h-10 px-3 bg-white border border-[#8d8d8d] text-xs font-mono focus:border-[#0f62fe] outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold uppercase text-[#161616] mb-1">
                Clinical Description
              </label>
              <textarea
                rows={2}
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                placeholder="Detailed clinical scope and therapy indications..."
                className="w-full p-2.5 bg-white border border-[#8d8d8d] text-xs focus:border-[#0f62fe] outline-none"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold uppercase text-[#161616] mb-1">
                Administrative Notes
              </label>
              <textarea
                rows={2}
                value={formNotes}
                onChange={(e) => setFormNotes(e.target.value)}
                placeholder="Billing notes, pre-requisites, consumables included..."
                className="w-full p-2.5 bg-white border border-[#8d8d8d] text-xs focus:border-[#0f62fe] outline-none"
              />
            </div>

            <div className="p-3 bg-[#edf5ff] border border-[#a6c8ff] text-[11px] text-[#0043ce]">
              <strong>Note:</strong> Newly created services start with <code>rate = null</code> (unconfigured). You can establish authorized rates immediately afterwards via the Rate Configuration dialog.
            </div>
          </div>
        </CarbonModal>
      )}

      {/* Modal 2: Edit Service Metadata */}
      {editingService && (
        <CarbonModal
          isOpen={true}
          onClose={() => setEditingService(null)}
          title={`Edit Service: ${editingService.serviceName}`}
          label="Hospital Service Catalogue Master"
          primaryButtonText={isSavingService ? 'Saving...' : 'Save Changes'}
          secondaryButtonText="Cancel"
          onRequestSubmit={handleSaveService}
        >
          <div className="space-y-4 text-xs">
            <div className="p-3 bg-[#f4f4f4] border border-[#e0e0e0] flex items-center justify-between">
              <div>
                <span className="text-[11px] font-mono text-[#525252]">Service Code (Immutable):</span>
                <div className="font-mono font-semibold text-sm text-[#0f62fe]">{editingService.serviceCode}</div>
              </div>
              <CarbonTag type="warm-gray" size="sm">{editingService.category}</CarbonTag>
            </div>

            <div>
              <label className="block text-[11px] font-semibold uppercase text-[#161616] mb-1">
                Service Name *
              </label>
              <input
                type="text"
                value={formServiceName}
                onChange={(e) => setFormServiceName(e.target.value)}
                className="w-full h-10 px-3 bg-white border border-[#8d8d8d] text-xs focus:border-[#0f62fe] outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold uppercase text-[#161616] mb-1">
                  Category *
                </label>
                <select
                  value={formCategory}
                  onChange={(e) => setFormCategory(e.target.value)}
                  className="w-full h-10 px-3 bg-white border border-[#8d8d8d] text-xs focus:border-[#0f62fe] outline-none"
                >
                  {CATEGORY_OPTIONS.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold uppercase text-[#161616] mb-1">
                  Department
                </label>
                <select
                  value={formDepartment}
                  onChange={(e) => setFormDepartment(e.target.value)}
                  className="w-full h-10 px-3 bg-white border border-[#8d8d8d] text-xs focus:border-[#0f62fe] outline-none"
                >
                  {DEPARTMENT_OPTIONS.map((dep) => (
                    <option key={dep} value={dep}>
                      {dep}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold uppercase text-[#161616] mb-1">
                  Billing Unit *
                </label>
                <input
                  type="text"
                  value={formUnit}
                  onChange={(e) => setFormUnit(e.target.value)}
                  className="w-full h-10 px-3 bg-white border border-[#8d8d8d] text-xs focus:border-[#0f62fe] outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold uppercase text-[#161616] mb-1">
                  Duration (Minutes)
                </label>
                <input
                  type="number"
                  min="0"
                  step="5"
                  value={formDuration}
                  onChange={(e) => setFormDuration(e.target.value)}
                  className="w-full h-10 px-3 bg-white border border-[#8d8d8d] text-xs font-mono focus:border-[#0f62fe] outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold uppercase text-[#161616] mb-1">
                Clinical Description
              </label>
              <textarea
                rows={2}
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                className="w-full p-2.5 bg-white border border-[#8d8d8d] text-xs focus:border-[#0f62fe] outline-none"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold uppercase text-[#161616] mb-1">
                Administrative Notes
              </label>
              <textarea
                rows={2}
                value={formNotes}
                onChange={(e) => setFormNotes(e.target.value)}
                className="w-full p-2.5 bg-white border border-[#8d8d8d] text-xs focus:border-[#0f62fe] outline-none"
              />
            </div>
          </div>
        </CarbonModal>
      )}

      {/* Modal 3: Rate Configuration Modal */}
      {configuringRateService && (
        <CarbonModal
          isOpen={true}
          onClose={() => setConfiguringRateService(null)}
          title={`Configure Tariff Rate: ${configuringRateService.serviceName}`}
          label="Super Admin Rate Establishment Schedule"
          primaryButtonText={isSavingRate ? 'Saving Rate...' : 'Authorize & Save Rate'}
          secondaryButtonText="Cancel"
          onRequestSubmit={handleSaveRate}
        >
          <div className="space-y-4 text-xs">
            {rateValidationError && (
              <div className="p-3 bg-[#fff1f1] border-l-4 border-l-[#da1e28] border border-[#ffd7d9] text-[#da1e28] flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                <span>{rateValidationError}</span>
              </div>
            )}

            <div className="p-3 bg-[#f4f4f4] border border-[#e0e0e0] flex items-center justify-between">
              <div>
                <div className="font-mono text-[11px] text-[#0f62fe]">{configuringRateService.serviceCode} &bull; {configuringRateService.category}</div>
                <div className="font-semibold text-sm text-[#161616]">{configuringRateService.serviceName}</div>
              </div>
              <div className="text-right">
                <span className="text-[11px] text-[#525252] block">Current Established Rate:</span>
                <span className="font-mono font-bold text-sm text-[#161616]">
                  {configuringRateService.rate !== null && configuringRateService.rate !== undefined
                    ? `₹${configuringRateService.rate.toLocaleString('en-IN')}`
                    : 'UNCONFIGURED'}
                </span>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold uppercase text-[#161616] mb-1">
                Authorized Tariff Rate (₹ per {configuringRateService.unit})
              </label>
              <input
                type="number"
                min="0"
                step="any"
                value={rateInput}
                onChange={(e) => {
                  setRateInput(e.target.value);
                  setRateValidationError(null);
                }}
                placeholder="Leave blank to set UNCONFIGURED (null)"
                className="w-full h-10 px-3 bg-white border border-[#8d8d8d] text-sm font-mono focus:border-[#0f62fe] outline-none"
              />
              <span className="text-[11px] text-[#525252] mt-1 block">
                Leave blank to keep tariff explicitly unconfigured. Billing against unconfigured tariffs will be strictly prevented by the server.
              </span>
            </div>

            {/* Zero Price Warning & Authorization */}
            <div className="p-3 border border-[#e0e0e0] space-y-2 bg-[#fbfbfb]">
              <div className="flex items-start gap-2">
                <input
                  type="checkbox"
                  id="zeroPermitted"
                  checked={rateIsZeroPermitted}
                  onChange={(e) => {
                    setRateIsZeroPermitted(e.target.checked);
                    setRateValidationError(null);
                  }}
                  className="w-4 h-4 mt-0.5 cursor-pointer"
                />
                <label htmlFor="zeroPermitted" className="text-xs text-[#161616] cursor-pointer">
                  <strong>Permit Legitimate ₹0 Billing:</strong> Check if this procedure/service is intentionally provided at no charge (e.g. emergency triage intake or courtesy consultations).
                </label>
              </div>

              {rateInput.trim() === '0' && !rateIsZeroPermitted && (
                <div className="p-2.5 bg-[#fff8e1] border-l-2 border-l-[#f1c21b] text-[11px] text-[#8a6d3b] flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                  <span>Entering ₹0 requires this checkbox to be ticked to verify explicit financial authorization.</span>
                </div>
              )}
            </div>

            {/* Effective Dates */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold uppercase text-[#161616] mb-1">
                  Effective From *
                </label>
                <input
                  type="date"
                  value={rateEffectiveFrom}
                  onChange={(e) => setRateEffectiveFrom(e.target.value)}
                  className="w-full h-10 px-3 bg-white border border-[#8d8d8d] text-xs font-mono focus:border-[#0f62fe] outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold uppercase text-[#161616] mb-1">
                  Effective Until (Optional)
                </label>
                <input
                  type="date"
                  value={rateEffectiveUntil}
                  onChange={(e) => setRateEffectiveUntil(e.target.value)}
                  className="w-full h-10 px-3 bg-white border border-[#8d8d8d] text-xs font-mono focus:border-[#0f62fe] outline-none"
                />
              </div>
            </div>

            {/* Change Reason / Audit Note */}
            <div>
              <label className="block text-[11px] font-semibold uppercase text-[#161616] mb-1">
                Authorization Reason / Audit Note *
              </label>
              <textarea
                rows={2}
                value={rateChangeReason}
                onChange={(e) => setRateChangeReason(e.target.value)}
                placeholder="Reason for rate revision (e.g. Hospital Executive Committee Tariff Revision Q1)..."
                className="w-full p-2.5 bg-white border border-[#8d8d8d] text-xs focus:border-[#0f62fe] outline-none"
              />
              <span className="text-[11px] text-[#525252] mt-0.5 block">
                This note is recorded in the permanent, immutable Rate History audit ledger.
              </span>
            </div>
          </div>
        </CarbonModal>
      )}

      {/* Modal 4: Rate History & Service Details Drawer/Modal */}
      {historyService && (
        <CarbonModal
          isOpen={true}
          onClose={() => setHistoryService(null)}
          title={`Rate History & Audit Trail: ${historyService.serviceName}`}
          label="Hospital Rate Master Schedule"
          primaryButtonText="Close"
          onRequestSubmit={() => setHistoryService(null)}
        >
          <div className="space-y-4 text-xs">
            {/* Metadata Summary */}
            <div className="p-3 bg-[#f4f4f4] border border-[#e0e0e0] grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div>
                <span className="text-[11px] text-[#525252] block">Service Code:</span>
                <span className="font-mono font-semibold text-[#0f62fe]">{historyService.serviceCode}</span>
              </div>
              <div>
                <span className="text-[11px] text-[#525252] block">Category:</span>
                <span className="font-medium text-[#161616]">{historyService.category}</span>
              </div>
              <div>
                <span className="text-[11px] text-[#525252] block">Unit:</span>
                <span className="capitalize text-[#161616]">{historyService.unit}</span>
              </div>
              <div>
                <span className="text-[11px] text-[#525252] block">Current Rate:</span>
                <span className="font-mono font-bold text-[#161616]">
                  {historyService.rate !== null && historyService.rate !== undefined
                    ? `₹${historyService.rate.toLocaleString('en-IN')}`
                    : 'UNCONFIGURED'}
                </span>
              </div>
            </div>

            {/* Timeline */}
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-[#161616] mb-3 flex items-center gap-1.5">
                <History className="w-4 h-4 text-[#0f62fe]" />
                Rate Revision History Timeline
              </h4>

              {isLoadingHistory ? (
                <div className="py-6 text-center text-[#525252]">Loading rate revision history...</div>
              ) : historyDetails.length === 0 ? (
                <div className="p-4 bg-[#f4f4f4] border border-[#e0e0e0] text-center text-[#525252]">
                  No historical rate adjustments recorded. Initial catalogue state.
                </div>
              ) : (
                <div className="space-y-3 relative before:absolute before:left-3 before:top-2 before:bottom-2 before:w-[2px] before:bg-[#e0e0e0] pl-7">
                  {historyDetails.map((hist, idx) => (
                    <div key={hist.id || idx} className="relative bg-white border border-[#e0e0e0] p-3 space-y-1">
                      <div className="absolute -left-[23px] top-3 w-3 h-3 rounded-full bg-[#0f62fe] border-2 border-white"></div>
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-[11px]">
                        <span className="font-semibold text-[#161616] flex items-center gap-1">
                          <Clock className="w-3 h-3 text-[#525252]" />
                          {new Date(hist.createdAt).toLocaleString('en-IN')}
                        </span>
                        <span className="text-[#525252]">
                          Authorized by: <strong className="text-[#161616]">{hist.changedByName}</strong>
                        </span>
                      </div>

                      <div className="flex items-center gap-2 pt-1 font-mono text-xs">
                        <span className="text-[#525252]">
                          {hist.previousRate !== null ? `₹${hist.previousRate.toLocaleString('en-IN')}` : 'UNCONFIGURED'}
                        </span>
                        <span className="text-[#0f62fe] font-bold">&rarr;</span>
                        <span className="font-bold text-[#161616]">
                          {hist.newRate !== null ? `₹${hist.newRate.toLocaleString('en-IN')}` : 'UNCONFIGURED'}
                        </span>
                        {hist.isZeroPrice && (
                          <CarbonTag type="teal" size="sm">₹0 PERMITTED</CarbonTag>
                        )}
                      </div>

                      <div className="text-[11px] text-[#525252] pt-0.5">
                        <span className="font-medium text-[#161616]">Effective:</span>{' '}
                        {new Date(hist.effectiveFrom).toLocaleDateString('en-IN')}
                        {hist.effectiveUntil ? ` to ${new Date(hist.effectiveUntil).toLocaleDateString('en-IN')}` : ' (Indefinite)'}
                      </div>

                      {hist.changeReason && (
                        <div className="text-[11px] text-[#525252] bg-[#f4f4f4] p-2 mt-1 border-l-2 border-l-[#0f62fe]">
                          <strong>Audit Note:</strong> {hist.changeReason}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </CarbonModal>
      )}
    </div>
  );
};

