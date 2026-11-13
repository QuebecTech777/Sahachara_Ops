import React, { useState, useMemo } from 'react';
import {
  Pill,
  Plus,
  CheckCircle,
  AlertTriangle,
  Package,
  Clock,
  ShieldCheck,
  RefreshCw,
  FileCheck,
  AlertCircle,
  Search,
  Filter,
  Sliders,
  FileText,
  Calendar,
  Layers,
  ArrowUpDown
} from 'lucide-react';
import { CarbonDataTable, Column } from '../components/carbon/CarbonDataTable';
import { CarbonTag, CarbonTagType } from '../components/carbon/CarbonTag';
import { CarbonButton } from '../components/carbon/CarbonButton';
import { CarbonTabs } from '../components/carbon/CarbonTabs';
import { Prescription, MedicationStock, StockMovement, UserRole } from '../types/hospital';
import { ManualStockAdjustmentModal } from '../components/modals/ManualStockAdjustmentModal';
import { DispenseMedicationModal } from '../components/modals/DispenseMedicationModal';

interface PharmacyViewProps {
  prescriptions: Prescription[];
  medicationStock: MedicationStock[];
  stockMovements?: StockMovement[];
  onOpenPrescriptionModal: () => void;
  onDispensePrescription: (id: string, pharmacist: string) => void;
  onReorderStock: (id: string, delta: number) => void;
  onOpenAddStockModal?: () => void;
  onAdjustStock?: (adjustment: {
    medicineId: string;
    medicineName: string;
    batchNumber: string;
    type: StockMovement['type'];
    quantityDelta: number;
    remainingQuantity: number;
    notes: string;
  }) => void;
  currentUserRole?: UserRole;
  currentUserName?: string;
  onNotify?: (title: string, subtitle?: string, kind?: 'info' | 'success' | 'warning' | 'error') => void;
}

export const PharmacyView: React.FC<PharmacyViewProps> = ({
  prescriptions,
  medicationStock,
  stockMovements = [],
  onOpenPrescriptionModal,
  onDispensePrescription,
  onReorderStock,
  onOpenAddStockModal,
  onAdjustStock,
  currentUserRole = 'ADMIN',
  currentUserName = 'System User',
  onNotify
}) => {
  const [activeTab, setActiveTab] = useState<'prescriptions' | 'inventory' | 'stock_logs'>('prescriptions');
  const [rxStatusFilter, setRxStatusFilter] = useState<string>('all');

  // Formulary Inventory Specific Search and Category Filters
  const [inventorySearch, setInventorySearch] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [inventoryStockFilter, setInventoryStockFilter] = useState<'all' | 'low_stock' | 'critical' | 'expired'>('all');

  // Manual Stock Adjustment Modal State
  const [isAdjustmentModalOpen, setIsAdjustmentModalOpen] = useState(false);
  const [targetMedForAdjustment, setTargetMedForAdjustment] = useState<string | undefined>(undefined);

  // Dispense Medication Modal State
  const [selectedRxForDispense, setSelectedRxForDispense] = useState<Prescription | null>(null);
  const [isDispenseModalOpen, setIsDispenseModalOpen] = useState(false);

  const isDoctor = currentUserRole === 'DOCTOR' || currentUserRole === 'SUPER_ADMIN' || currentUserRole === 'ADMIN';

  const filteredRx = prescriptions.filter((p) => {
    if (rxStatusFilter === 'all') return true;
    return p.status === rxStatusFilter;
  });

  // Filter Formulary Inventory by search query, category, and state
  const filteredStock = useMemo(() => {
    const now = Date.now();
    return medicationStock.filter((s) => {
      // 1. Text Search: name or generic category
      if (inventorySearch.trim()) {
        const q = inventorySearch.toLowerCase().trim();
        const matchesName = s.drugName.toLowerCase().includes(q);
        const matchesGeneric = s.genericName.toLowerCase().includes(q);
        const matchesCat = s.category.toLowerCase().includes(q);
        const matchesBatch = s.batchNumber.toLowerCase().includes(q);
        if (!matchesName && !matchesGeneric && !matchesCat && !matchesBatch) return false;
      }

      // 2. Category Filter
      if (selectedCategory !== 'all') {
        if (!s.category.toLowerCase().includes(selectedCategory.toLowerCase())) {
          return false;
        }
      }

      // 3. Stock State Filter
      if (inventoryStockFilter === 'low_stock') {
        if (s.stockQuantity > s.minThreshold) return false;
      } else if (inventoryStockFilter === 'critical') {
        if (s.stockQuantity > s.minThreshold * 0.4) return false;
      } else if (inventoryStockFilter === 'expired') {
        const expTime = new Date(s.expiryDate).getTime();
        const isExp = expTime < now;
        const isSoon = !isExp && expTime - now < 90 * 86400000;
        if (!isExp && !isSoon) return false;
      }

      return true;
    });
  }, [medicationStock, inventorySearch, selectedCategory, inventoryStockFilter]);

  // Derived counts for quick filter buttons
  const lowStockCount = useMemo(
    () => medicationStock.filter((s) => s.stockQuantity <= s.minThreshold).length,
    [medicationStock]
  );
  const criticalCount = useMemo(
    () => medicationStock.filter((s) => s.stockQuantity <= s.minThreshold * 0.4).length,
    [medicationStock]
  );
  const expiredOrSoonCount = useMemo(() => {
    const now = Date.now();
    return medicationStock.filter((s) => {
      const expTime = new Date(s.expiryDate).getTime();
      return expTime - now < 90 * 86400000;
    }).length;
  }, [medicationStock]);

  // Extract unique categories
  const categoriesList = useMemo(() => {
    const set = new Set<string>();
    medicationStock.forEach((s) => {
      if (s.category) set.add(s.category);
    });
    return Array.from(set);
  }, [medicationStock]);

  const getRxStatusTag = (status: Prescription['status']): { type: CarbonTagType; label: string } => {
    switch (status) {
      case 'dispensed':
        return { type: 'green', label: 'DISPENSED' };
      case 'pending':
        return { type: 'warm-gray', label: 'PENDING VERIFICATION' };
      case 'cancelled':
        return { type: 'red', label: 'CANCELLED' };
    }
  };

  const getStockTag = (s: MedicationStock): { type: CarbonTagType; label: string } => {
    if (s.stockQuantity <= s.minThreshold * 0.4) {
      return { type: 'red', label: 'CRITICAL SHORTAGE' };
    }
    if (s.stockQuantity <= s.minThreshold) {
      return { type: 'warm-gray', label: 'LOW STOCK' };
    }
    return { type: 'green', label: 'OPTIMAL' };
  };

  const rxColumns: Column<Prescription>[] = [
    {
      key: 'rxNumber',
      header: 'Rx Number',
      width: '130px',
      sortable: true,
      render: (rx) => (
        <span className="font-mono text-xs font-semibold text-[#0f62fe]">
          {rx.rxNumber}
        </span>
      )
    },
    {
      key: 'patient',
      header: 'Patient & MRN',
      sortable: true,
      render: (rx) => (
        <div>
          <div className="font-semibold text-sm text-[#161616]">
            {rx.patientName}
          </div>
          <div className="text-[11px] font-mono text-[#525252]">
            {rx.mrn}
          </div>
        </div>
      )
    },
    {
      key: 'medication',
      header: 'Medication & Dosage',
      sortable: true,
      render: (rx) => (
        <div>
          <div className="font-medium text-xs text-[#161616]">
            {rx.medicationName} <strong className="font-mono text-[#0043ce]">{rx.dosage}</strong>
          </div>
          <div className="text-[11px] text-[#525252]">
            {rx.route} &bull; {rx.frequency} &bull; {rx.duration}
          </div>
        </div>
      )
    },
    {
      key: 'doctorName',
      header: 'Prescriber',
      render: (rx) => (
        <span className="text-xs text-[#161616]">{rx.doctorName}</span>
      )
    },
    {
      key: 'status',
      header: 'Dispense Status',
      sortable: true,
      render: (rx) => {
        if (rx.dispensingStatus === 'partially_dispensed') {
          return (
            <div className="space-y-1">
              <CarbonTag type="teal">PARTIALLY DISPENSED</CarbonTag>
              <div className="text-[10px] font-mono text-[#525252]">
                Dispensed: {rx.dispensedQuantity || 0} / {rx.quantity || 1}
              </div>
            </div>
          );
        }
        const tag = getRxStatusTag(rx.status);
        return (
          <div className="space-y-1">
            <CarbonTag type={tag.type}>{tag.label}</CarbonTag>
            {rx.quantity && rx.quantity > 1 && (
              <div className="text-[10px] font-mono text-[#525252]">
                Total: {rx.quantity} units
              </div>
            )}
          </div>
        );
      }
    },
    {
      key: 'actions',
      header: 'Dispensing Action',
      render: (rx) => {
        const canDispense = rx.status === 'pending' || rx.dispensingStatus === 'partially_dispensed';
        const isPharmacist = currentUserRole === 'PHARMACIST' || currentUserRole === 'SUPER_ADMIN';

        if (canDispense) {
          return (
            <div className="flex items-center gap-1.5">
              <CarbonButton
                kind="primary"
                size="sm"
                renderIcon={CheckCircle}
                disabled={!isPharmacist}
                title={!isPharmacist ? 'Pharmacist credentials required for medication dispensing' : 'Dispense medication'}
                onClick={() => {
                  setSelectedRxForDispense(rx);
                  setIsDispenseModalOpen(true);
                }}
              >
                {rx.dispensingStatus === 'partially_dispensed' ? 'Dispense Remaining' : 'Dispense Order'}
              </CarbonButton>
            </div>
          );
        }
        return (
          <div className="space-y-0.5">
            <span className="text-[11px] text-[#24a148] font-mono flex items-center gap-1">
              <CheckCircle className="w-3.5 h-3.5" />
              {rx.dispensedBy?.split(',')[0]}
            </span>
            <div className="text-[10px] text-[#525252] font-mono">
              Total: {rx.dispensedQuantity || rx.quantity || 1} units
            </div>
          </div>
        );
      }
    }
  ];

  // Stock Table Columns with 'Low Stock' badge & dedicated 'Expiration Date' column
  const stockColumns: Column<MedicationStock>[] = [
    {
      key: 'drugName',
      header: 'Pharmaceutical Drug & Category',
      sortable: true,
      render: (s) => (
        <div>
          <div className="font-semibold text-sm text-[#161616]">
            {s.drugName}
          </div>
          <div className="text-[11px] text-[#525252]">
            {s.genericName} &bull; <span className="font-medium text-[#0f62fe]">{s.category}</span>
          </div>
        </div>
      )
    },
    {
      key: 'form',
      header: 'Form',
      render: (s) => <span className="text-xs text-[#161616]">{s.form}</span>
    },
    {
      key: 'stockQuantity',
      header: 'Available Stock',
      sortable: true,
      render: (s) => {
        const isCritical = s.stockQuantity <= s.minThreshold * 0.4;
        const isLow = s.stockQuantity <= s.minThreshold;

        return (
          <div className="space-y-1">
            <div className="font-mono text-xs flex items-center gap-1.5">
              <strong className={isCritical ? 'text-[#da1e28]' : isLow ? 'text-[#b28600]' : 'text-[#161616]'}>
                {s.stockQuantity} {s.unit}
              </strong>
              <span className="text-[#8d8d8d] text-[10px]">(Min: {s.minThreshold})</span>
            </div>

            {/* Prominent Low Stock Badges */}
            {isCritical ? (
              <div className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-[#fff1f1] border border-[#ffb3b8] text-[#da1e28] text-[10px] font-bold font-mono">
                <AlertTriangle className="w-3 h-3 text-[#da1e28] shrink-0" />
                CRITICAL SHORTAGE
              </div>
            ) : isLow ? (
              <div className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-[#fef3d6] border border-[#f1c21b] text-[#8a3800] text-[10px] font-semibold font-mono">
                <AlertTriangle className="w-3 h-3 text-[#8a3800] shrink-0" />
                LOW STOCK BADGE
              </div>
            ) : null}
          </div>
        );
      }
    },
    {
      key: 'status',
      header: 'Inventory State',
      sortable: true,
      render: (s) => {
        const tag = getStockTag(s);
        return <CarbonTag type={tag.type}>{tag.label}</CarbonTag>;
      }
    },
    {
      key: 'expiryDate',
      header: 'Expiration Date',
      sortable: true,
      render: (s) => {
        const now = Date.now();
        const expTime = new Date(s.expiryDate).getTime();
        const isExpired = expTime < now;
        const isExpiringSoon = !isExpired && expTime - now < 90 * 86400000;

        if (isExpired) {
          return (
            <div className="space-y-0.5">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-[#fff1f1] border-2 border-[#da1e28] text-[#da1e28] font-bold font-mono text-[11px] shadow-2xs">
                <AlertCircle className="w-3.5 h-3.5 text-[#da1e28] shrink-0 animate-pulse" />
                EXPIRED: {s.expiryDate}
              </span>
              <div className="text-[10px] text-[#ba1b23] font-sans">Immediate quarantine & discard required</div>
            </div>
          );
        }

        if (isExpiringSoon) {
          return (
            <div className="space-y-0.5">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-[#fef3d6] border border-[#f1c21b] text-[#8a3800] font-semibold font-mono text-[11px]">
                <Clock className="w-3.5 h-3.5 text-[#8a3800] shrink-0" />
                EXPIRING SOON: {s.expiryDate}
              </span>
              <div className="text-[10px] text-[#8d8d8d] font-sans">&lt; 90 days remaining shelf-life</div>
            </div>
          );
        }

        return (
          <div className="font-mono text-xs text-[#161616]">
            {s.expiryDate}
          </div>
        );
      }
    },
    {
      key: 'batchNumber',
      header: 'Batch & Pricing',
      render: (s) => (
        <div className="font-mono text-[11px] text-[#525252]">
          <div>Batch: <span className="text-[#161616] font-medium">{s.batchNumber}</span></div>
          <div className="text-[10px]">
            {s.unitPrice !== null && s.unitPrice !== undefined ? (
              <span className="text-[#525252]">₹{Number(s.unitPrice).toFixed(2)} / {s.unit}</span>
            ) : (
              <span className="text-[#da1e28] font-medium">Price unconfigured</span>
            )}
          </div>
        </div>
      )
    },
    {
      key: 'actions',
      header: 'Stock Actions',
      render: (s) => (
        <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
          <CarbonButton
            kind="tertiary"
            size="sm"
            renderIcon={Plus}
            onClick={() => onReorderStock(s.id, 50)}
            title="Rapid Restock (+50 Units)"
          >
            +50
          </CarbonButton>

          <CarbonButton
            kind="ghost"
            size="sm"
            renderIcon={Sliders}
            onClick={() => {
              setTargetMedForAdjustment(s.id);
              setIsAdjustmentModalOpen(true);
            }}
            title="Manual stock level audit adjustment"
          >
            Adjust
          </CarbonButton>
        </div>
      )
    }
  ];

  // Stock Movement Audit Log Columns
  const movementColumns: Column<StockMovement>[] = [
    {
      key: 'timestamp',
      header: 'Audit Timestamp',
      width: '160px',
      sortable: true,
      render: (m) => (
        <div className="font-mono text-xs">
          <div className="text-[#161616] font-medium">
            {new Date(m.timestamp).toLocaleDateString([], { month: 'short', day: '2-digit', year: 'numeric' })}
          </div>
          <div className="text-[10px] text-[#8d8d8d]">
            {new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </div>
        </div>
      )
    },
    {
      key: 'medicineName',
      header: 'Pharmaceutical Drug & Batch',
      sortable: true,
      render: (m) => (
        <div>
          <div className="font-semibold text-xs text-[#161616]">
            {m.medicineName}
          </div>
          <div className="font-mono text-[10px] text-[#525252]">
            Batch: {m.batchNumber} &bull; Ref: <span className="text-[#0f62fe]">{m.referenceNumber}</span>
          </div>
        </div>
      )
    },
    {
      key: 'type',
      header: 'Movement Classification',
      sortable: true,
      render: (m) => {
        let tagType: CarbonTagType = 'cool-gray';
        if (m.type === 'Purchase Receipt') tagType = 'green';
        else if (m.type === 'Audit Adjustment') tagType = 'purple';
        else if (m.type === 'Expiry Discard') tagType = 'red';
        else if (m.type === 'Dispensed to Patient') tagType = 'blue';

        return <CarbonTag type={tagType} size="sm">{m.type.toUpperCase()}</CarbonTag>;
      }
    },
    {
      key: 'quantityDelta',
      header: 'Stock Delta',
      sortable: true,
      render: (m) => (
        <span
          className={`font-mono font-bold text-xs ${
            m.quantityDelta > 0 ? 'text-[#24a148]' : 'text-[#da1e28]'
          }`}
        >
          {m.quantityDelta > 0 ? `+${m.quantityDelta}` : m.quantityDelta}
        </span>
      )
    },
    {
      key: 'remainingQuantity',
      header: 'Balance',
      sortable: true,
      render: (m) => (
        <span className="font-mono font-medium text-xs text-[#161616]">
          {m.remainingQuantity}
        </span>
      )
    },
    {
      key: 'actor',
      header: 'Authorized Staff',
      render: (m) => (
        <span className="text-xs text-[#161616] font-medium">{m.actor}</span>
      )
    },
    {
      key: 'notes',
      header: 'Accountability Justification',
      render: (m) => (
        <span className="text-xs text-[#525252] leading-tight line-clamp-2" title={m.notes}>
          {m.notes}
        </span>
      )
    }
  ];

  return (
    <div className="space-y-6">
      {/* Title Bar */}
      <div className="bg-white border border-[#e0e0e0] p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="text-[12px] font-mono uppercase tracking-[0.32px] text-[#525252] mb-1">
            Clinical Pharmacy & Dispensing Services
          </div>
          <h1 className="text-[28px] font-semibold text-[#161616] tracking-tight leading-none">
            Central Hospital Pharmacy & Formulary
          </h1>
          <p className="text-[13px] text-[#525252] mt-2">
            Physician electronic order verification, barcoded inpatient dispensing, threshold alert surveillance, and manual audit accountability.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <CarbonButton
            kind="ghost"
            renderIcon={Sliders}
            onClick={() => {
              setTargetMedForAdjustment(undefined);
              setIsAdjustmentModalOpen(true);
            }}
          >
            Adjust Stock Level
          </CarbonButton>

          {onOpenAddStockModal && (
            <CarbonButton
              kind="secondary"
              renderIcon={Package}
              onClick={onOpenAddStockModal}
            >
              Add Pharmacy Stock
            </CarbonButton>
          )}

          <CarbonButton
            kind="primary"
            renderIcon={Plus}
            onClick={onOpenPrescriptionModal}
          >
            Write E-Prescription
          </CarbonButton>
        </div>
      </div>

      {/* Main Tabs */}
      <CarbonTabs
        selectedId={activeTab}
        onSelect={(id) => setActiveTab(id as any)}
        tabs={[
          {
            id: 'prescriptions',
            label: 'Active Prescriptions Queue',
            count: prescriptions.filter((p) => p.status === 'pending').length
          },
          {
            id: 'inventory',
            label: 'Hospital Drug Formulary & Stock',
            count: medicationStock.length
          },
          {
            id: 'stock_logs',
            label: 'Inventory Adjustment Logs',
            count: stockMovements.length
          }
        ]}
      />

      {/* Tab 1: Prescriptions Queue */}
      {activeTab === 'prescriptions' && (
        <div className="space-y-4">
          {/* Secondary Filter for Rx */}
          <div className="flex gap-2">
            {[
              { id: 'all', label: 'All Orders' },
              { id: 'pending', label: 'Pending Dispense' },
              { id: 'dispensed', label: 'Dispensed' }
            ].map((f) => (
              <button
                key={f.id}
                onClick={() => setRxStatusFilter(f.id)}
                className={`px-3 py-1.5 text-xs font-medium border cursor-pointer transition-colors ${
                  rxStatusFilter === f.id
                    ? 'bg-[#161616] text-white border-[#161616]'
                    : 'bg-white text-[#525252] border-[#e0e0e0] hover:bg-[#f4f4f4]'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          <CarbonDataTable<Prescription>
            title="E-Prescription Verification Queue"
            description="Verified clinical pharmacotherapy orders awaiting registered pharmacist review and dispensing."
            columns={rxColumns}
            data={filteredRx}
            searchPlaceholder="Search by Rx number, medication, or patient..."
            initialSortKey="status"
          />
        </div>
      )}

      {/* Tab 2: Hospital Drug Formulary & Stock with dedicated Search & Category Filter */}
      {activeTab === 'inventory' && (
        <div className="space-y-4">
          {/* Formulary Search & Filter Controls Toolbar */}
          <div className="p-4 bg-white border border-[#e0e0e0] flex flex-col md:flex-row md:items-center justify-between gap-4">
            {/* Search Input Field */}
            <div className="flex items-center gap-3 flex-1 flex-wrap sm:flex-nowrap">
              <div className="relative flex-1 sm:max-w-md w-full">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#525252]" />
                <input
                  type="text"
                  value={inventorySearch}
                  onChange={(e) => setInventorySearch(e.target.value)}
                  placeholder="Quick filter stock by drug name or generic category..."
                  className="carbon-input w-full pl-9 pr-4 text-xs font-sans"
                />
              </div>

              {/* Category Dropdown */}
              <div className="w-full sm:w-auto min-w-[200px]">
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="carbon-input w-full text-xs font-sans"
                  aria-label="Filter by generic category"
                >
                  <option value="all">All Generic Categories ({categoriesList.length})</option>
                  {categoriesList.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Quick Status Filter Buttons */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                type="button"
                onClick={() => setInventoryStockFilter('all')}
                className={`px-3 py-2 text-xs font-medium border transition-colors cursor-pointer rounded-none ${
                  inventoryStockFilter === 'all'
                    ? 'bg-[#161616] text-white border-[#161616]'
                    : 'bg-[#f4f4f4] text-[#525252] border-[#e0e0e0] hover:bg-[#e0e0e0]'
                }`}
              >
                All Items ({medicationStock.length})
              </button>

              <button
                type="button"
                onClick={() => setInventoryStockFilter('low_stock')}
                className={`px-3 py-2 text-xs font-medium border transition-colors cursor-pointer rounded-none flex items-center gap-1.5 ${
                  inventoryStockFilter === 'low_stock'
                    ? 'bg-[#8a3800] text-white border-[#8a3800]'
                    : 'bg-[#fef3d6] text-[#8a3800] border-[#f1c21b] hover:bg-[#fde7ad]'
                }`}
              >
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>Low Stock ({lowStockCount})</span>
              </button>

              <button
                type="button"
                onClick={() => setInventoryStockFilter('critical')}
                className={`px-3 py-2 text-xs font-medium border transition-colors cursor-pointer rounded-none flex items-center gap-1.5 ${
                  inventoryStockFilter === 'critical'
                    ? 'bg-[#da1e28] text-white border-[#da1e28]'
                    : 'bg-[#fff1f1] text-[#da1e28] border-[#ffb3b8] hover:bg-[#ffe3e5]'
                }`}
              >
                <AlertCircle className="w-3.5 h-3.5" />
                <span>Critical Shortage ({criticalCount})</span>
              </button>

              <button
                type="button"
                onClick={() => setInventoryStockFilter('expired')}
                className={`px-3 py-2 text-xs font-medium border transition-colors cursor-pointer rounded-none flex items-center gap-1.5 ${
                  inventoryStockFilter === 'expired'
                    ? 'bg-[#161616] text-[#ff8389] border-[#da1e28]'
                    : 'bg-[#fff1f1] text-[#ba1b23] border-[#ffb3b8] hover:bg-[#ffe3e5]'
                }`}
              >
                <Clock className="w-3.5 h-3.5" />
                <span>Expiring / Expired ({expiredOrSoonCount})</span>
              </button>
            </div>
          </div>

          <CarbonDataTable<MedicationStock>
            title="Hospital Medication Formulary & Active Stock"
            description="Monitored clinical inventory with low-stock badges, expiration alerts, and reorder controls."
            columns={stockColumns}
            data={filteredStock}
            searchPlaceholder="Search in filtered results..."
            initialSortKey="status"
            primaryAction={
              onOpenAddStockModal
                ? {
                    label: 'Add Pharmacy Stock',
                    icon: Plus,
                    onClick: onOpenAddStockModal
                  }
                : undefined
            }
          />
        </div>
      )}

      {/* Tab 3: Inventory Adjustment Logs */}
      {activeTab === 'stock_logs' && (
        <div className="space-y-4">
          <div className="p-4 bg-[#f4f4f4] border border-[#e0e0e0] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-[#161616] flex items-center gap-2">
                <Sliders className="w-4 h-4 text-[#0f62fe]" />
                Accountability & Manual Stock Adjustment Audit Logs
              </h3>
              <p className="text-xs text-[#525252] mt-0.5">
                Every physical count variance, damaged discard, and reorder intake is cryptographically timestamped and attributed for 21 CFR Part 11 compliance.
              </p>
            </div>

            <CarbonButton
              kind="primary"
              size="sm"
              renderIcon={Plus}
              onClick={() => {
                setTargetMedForAdjustment(undefined);
                setIsAdjustmentModalOpen(true);
              }}
            >
              Record Manual Adjustment
            </CarbonButton>
          </div>

          <CarbonDataTable<StockMovement>
            title="Stock Movement Ledger"
            description="Chronological audit records of manual stock level changes, dispensing deductions, and supplier receipts."
            columns={movementColumns}
            data={stockMovements}
            searchPlaceholder="Search by medicine name, batch number, or actor..."
            initialSortKey="timestamp"
            initialSortDirection="desc"
          />
        </div>
      )}

      {/* Manual Stock Adjustment Modal */}
      {isAdjustmentModalOpen && (
        <ManualStockAdjustmentModal
          isOpen={true}
          onClose={() => setIsAdjustmentModalOpen(false)}
          medicationStock={medicationStock}
          initialMedicationId={targetMedForAdjustment}
          currentUserName={currentUserName}
          onConfirmAdjustment={(adj) => {
            if (onAdjustStock) {
              onAdjustStock(adj);
            }
            if (onNotify) {
              onNotify(
                'Manual Stock Adjustment Recorded',
                `Recorded ${adj.type}: ${adj.quantityDelta > 0 ? '+' : ''}${adj.quantityDelta} units for ${adj.medicineName} (Balance: ${adj.remainingQuantity}).`,
                'success'
              );
            }
          }}
        />
      )}

      {/* Dispense Medication Modal with FEFO & Partial Dispensing */}
      {isDispenseModalOpen && selectedRxForDispense && (
        <DispenseMedicationModal
          isOpen={true}
          onClose={() => {
            setIsDispenseModalOpen(false);
            setSelectedRxForDispense(null);
          }}
          prescription={selectedRxForDispense}
          medicationStock={medicationStock}
          currentUserName={currentUserName}
          currentUserRole={currentUserRole}
          onConfirmDispense={async (rxId, options) => {
            await onDispensePrescription(rxId, currentUserName);
            if (onNotify) {
              onNotify(
                'Prescription Dispensed',
                `Dispensed ${options.quantityToDispense} units for ${selectedRxForDispense.medicationName}.`,
                'success'
              );
            }
          }}
        />
      )}
    </div>
  );
};
