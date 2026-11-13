import React, { useState } from 'react';
import {
  TestTube,
  Plus,
  AlertTriangle,
  CheckCircle,
  FileCheck,
  Clock,
  FlaskConical,
  X,
  ShieldCheck,
  Award
} from 'lucide-react';
import { CarbonDataTable, Column } from '../components/carbon/CarbonDataTable';
import { CarbonTag, CarbonTagType } from '../components/carbon/CarbonTag';
import { CarbonButton } from '../components/carbon/CarbonButton';
import { CarbonModal } from '../components/carbon/CarbonModal';
import { CarbonTabs } from '../components/carbon/CarbonTabs';
import { LabOrder, UserRole } from '../types/hospital';

interface LaboratoryViewProps {
  labOrders: LabOrder[];
  onOpenLabModal: () => void;
  onUpdateLabResult: (id: string, updates: Partial<LabOrder>) => void;
  currentUserRole?: UserRole;
  currentUserName?: string;
  onNotify?: (title: string, subtitle?: string, kind?: 'info' | 'success' | 'warning' | 'error') => void;
}

export const LaboratoryView: React.FC<LaboratoryViewProps> = ({
  labOrders,
  onOpenLabModal,
  onUpdateLabResult,
  currentUserRole = 'ADMIN',
  currentUserName = 'System User',
  onNotify
}) => {
  const [selectedPriority, setSelectedPriority] = useState<string>('all');
  const [editingOrder, setEditingOrder] = useState<LabOrder | null>(null);
  const [resultVal, setResultVal] = useState('');
  const [normalRangeVal, setNormalRangeVal] = useState('');
  const [isAbnormal, setIsAbnormal] = useState(false);
  const [labNotesVal, setLabNotesVal] = useState('');

  const filteredOrders = labOrders.filter((o) => {
    if (selectedPriority === 'all') return true;
    if (selectedPriority === 'STAT') return o.priority.includes('STAT');
    if (selectedPriority === 'abnormal') return o.isAbnormal;
    return o.priority.toLowerCase().includes(selectedPriority.toLowerCase());
  });

  const getPriorityTag = (priority: LabOrder['priority']): { type: CarbonTagType; label: string } => {
    if (priority.includes('STAT')) return { type: 'red', label: 'STAT IMMEDIATE' };
    if (priority.includes('Urgent')) return { type: 'warm-gray', label: 'URGENT <2H' };
    return { type: 'cool-gray', label: 'ROUTINE' };
  };

  const getStatusTag = (status: LabOrder['status']): { type: CarbonTagType; label: string } => {
    switch (status) {
      case 'verified':
        return { type: 'green', label: 'VERIFIED' };
      case 'completed':
        return { type: 'blue', label: 'COMPLETED' };
      case 'analyzing':
        return { type: 'purple', label: 'ANALYZING' };
      case 'sample_collected':
        return { type: 'cyan', label: 'SAMPLE COLLECTED' };
      case 'ordered':
      default:
        return { type: 'cool-gray', label: 'ORDERED' };
    }
  };

  const handleOpenResultModal = (order: LabOrder) => {
    setEditingOrder(order);
    setResultVal(order.resultValue || '');
    setNormalRangeVal(order.normalRange || '< 0.04 ng/mL');
    setIsAbnormal(order.isAbnormal || false);
    setLabNotesVal(order.labNotes || '');
  };

  const handleSaveResult = () => {
    if (!editingOrder) return;
    onUpdateLabResult(editingOrder.id, {
      resultValue: resultVal,
      normalRange: normalRangeVal,
      isAbnormal,
      labNotes: labNotesVal,
      status: 'verified',
      verifiedBy: currentUserName,
      verifiedAt: new Date().toISOString()
    });
    setEditingOrder(null);
    if (onNotify) {
      onNotify('Lab Result Verified & Released', `${editingOrder.testType} for ${editingOrder.patientName} verified by ${currentUserName}.`, 'success');
    }
  };

  const columns: Column<LabOrder>[] = [
    {
      key: 'orderNumber',
      header: 'Order #',
      width: '130px',
      sortable: true,
      render: (o) => (
        <span className="font-mono text-xs font-semibold text-[#0f62fe]">
          {o.orderNumber}
        </span>
      )
    },
    {
      key: 'patient',
      header: 'Patient & MRN',
      sortable: true,
      render: (o) => (
        <div>
          <div className="font-semibold text-sm text-[#161616]">
            {o.patientName}
          </div>
          <div className="text-[11px] font-mono text-[#525252]">
            {o.mrn}
          </div>
        </div>
      )
    },
    {
      key: 'testType',
      header: 'Diagnostic Test / Specimen',
      sortable: true,
      render: (o) => (
        <div>
          <div className="font-medium text-xs text-[#161616]">
            {o.testType}
          </div>
          <div className="text-[11px] text-[#525252]">
            Dr: {o.orderingDoctor}
          </div>
        </div>
      )
    },
    {
      key: 'priority',
      header: 'Clinical Priority',
      sortable: true,
      render: (o) => {
        const tag = getPriorityTag(o.priority);
        return <CarbonTag type={tag.type}>{tag.label}</CarbonTag>;
      }
    },
    {
      key: 'status',
      header: 'Test Status',
      sortable: true,
      render: (o) => {
        const tag = getStatusTag(o.status);
        return <CarbonTag type={tag.type}>{tag.label}</CarbonTag>;
      }
    },
    {
      key: 'results',
      header: 'Diagnostic Results & Range',
      render: (o) => {
        if (!o.resultValue) {
          return <span className="text-[11px] text-[#8d8d8d] italic">Awaiting specimen run...</span>;
        }
        return (
          <div className="text-xs">
            <div className="flex items-center gap-1.5">
              <strong className={`font-mono ${o.isAbnormal ? 'text-[#da1e28]' : 'text-[#161616]'}`}>
                {o.resultValue}
              </strong>
              {o.isAbnormal && (
                <span className="px-1 py-0.2 bg-[#fff1f1] text-[#a2191f] border border-[#ffb3b8] text-[10px] font-bold">
                  CRITICAL / HIGH
                </span>
              )}
            </div>
            {o.normalRange && (
              <span className="text-[10px] text-[#525252] font-mono">
                Ref: {o.normalRange}
              </span>
            )}
          </div>
        );
      }
    },
    {
      key: 'verificationStatus',
      header: 'Review & Verification',
      render: (o) => {
        if (o.status === 'verified') {
          return (
            <div>
              <CarbonTag type="green" size="sm">
                <CheckCircle className="w-3 h-3 mr-1 inline text-[#0e6027]" />
                VERIFIED & RELEASED
              </CarbonTag>
              <div className="text-[10px] text-[#525252] mt-0.5">
                {o.verifiedBy || 'Attending Clinical Staff'}
              </div>
            </div>
          );
        }

        return (
          <CarbonTag type="warm-gray" size="sm">
            PENDING CLINICAL REVIEW
          </CarbonTag>
        );
      }
    },
    {
      key: 'actions',
      header: 'Action',
      render: (o) => (
        <div className="flex items-center gap-1">
          <CarbonButton
            kind={o.status === 'verified' ? 'ghost' : 'primary'}
            size="sm"
            renderIcon={FileCheck}
            onClick={() => handleOpenResultModal(o)}
          >
            {o.status === 'verified' ? 'Review / Edit' : 'Enter Result'}
          </CarbonButton>
        </div>
      )
    }
  ];

  return (
    <div className="space-y-6">
      {/* Title */}
      <div className="bg-white border border-[#e0e0e0] p-4 sm:p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="text-[12px] font-mono uppercase tracking-[0.32px] text-[#525252] mb-1">
            Pathology & Diagnostic Laboratory
          </div>
          <h1 className="text-[28px] font-semibold text-[#161616] tracking-tight leading-none">
            Clinical Diagnostic Laboratory Orders
          </h1>
          <p className="text-[13px] text-[#525252] mt-2">
            Real-time analyzer interface, critical panic value telemetry, and clinical pathology verification.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <CarbonButton
            kind="primary"
            renderIcon={Plus}
            onClick={onOpenLabModal}
          >
            Order Lab Test
          </CarbonButton>
        </div>
      </div>

      {/* Filter Tabs */}
      <CarbonTabs
        selectedId={selectedPriority}
        onSelect={setSelectedPriority}
        tabs={[
          { id: 'all', label: 'All Orders', count: labOrders.length },
          { id: 'STAT', label: 'STAT Alerts', count: labOrders.filter((o) => o.priority.includes('STAT')).length },
          { id: 'abnormal', label: 'Abnormal Critical Flags', count: labOrders.filter((o) => o.isAbnormal).length },
          { id: 'urgent', label: 'Urgent', count: labOrders.filter((o) => o.priority.includes('Urgent')).length },
          { id: 'routine', label: 'Routine', count: labOrders.filter((o) => o.priority.includes('Routine')).length }
        ]}
      />

      {/* Lab DataTable */}
      <CarbonDataTable<LabOrder>
        title="Pathology Diagnostic Queue"
        description="STAT markers (Troponin, Blood Gas, Lactate) prioritized for emergency intervention."
        columns={columns}
        data={filteredOrders}
        searchPlaceholder="Search order #, patient name, or test type..."
        initialSortKey="priority"
      />

      {/* Result Entry Modal */}
      {editingOrder && (
        <CarbonModal
          isOpen={true}
          onClose={() => setEditingOrder(null)}
          title={`Enter Lab Result: ${editingOrder.testType}`}
          label={`Diagnostic Report — ${editingOrder.orderNumber}`}
          primaryButtonText="Verify & Release Result"
          secondaryButtonText="Cancel"
          onRequestSubmit={handleSaveResult}
          size="md"
        >
          <div className="space-y-4">
            <div className="p-3 bg-[#f4f4f4] border border-[#e0e0e0] text-xs">
              <div>Patient: <strong className="text-[#161616]">{editingOrder.patientName}</strong> ({editingOrder.mrn})</div>
              <div>Ordering Physician: {editingOrder.orderingDoctor}</div>
              <div>Priority: <strong className={editingOrder.priority.includes('STAT') ? 'text-[#da1e28]' : 'text-[#161616]'}>{editingOrder.priority}</strong></div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#161616] mb-1">
                Quantitative Result / Finding *
              </label>
              <input
                type="text"
                required
                value={resultVal}
                onChange={(e) => setResultVal(e.target.value)}
                placeholder="e.g. 0.22 ng/mL or pH 7.26"
                className="w-full carbon-input font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#161616] mb-1">
                Reference Normal Range
              </label>
              <input
                type="text"
                value={normalRangeVal}
                onChange={(e) => setNormalRangeVal(e.target.value)}
                placeholder="e.g. < 0.04 ng/mL"
                className="w-full carbon-input font-mono"
              />
            </div>

            <div className="p-3 bg-[#fff1f1] border border-[#ffb3b8]">
              <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-[#a2191f]">
                <input
                  type="checkbox"
                  checked={isAbnormal}
                  onChange={(e) => setIsAbnormal(e.target.checked)}
                  className="w-4 h-4 rounded-none text-[#da1e28]"
                />
                <span>Flag as Abnormal / Critical Panic Value</span>
              </label>
              <p className="text-[11px] text-[#525252] mt-1">
                Triggers high-priority telemetry notification to attending physician and nursing command.
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#161616] mb-1">
                Pathologist / Technologist Clinical Interpretation
              </label>
              <textarea
                rows={2}
                value={labNotesVal}
                onChange={(e) => setLabNotesVal(e.target.value)}
                placeholder="Specimen integrity verified on automated clinical analyzer..."
                className="w-full carbon-input resize-none"
              />
            </div>
          </div>
        </CarbonModal>
      )}
    </div>
  );
};
