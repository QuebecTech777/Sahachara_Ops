import React, { useState, useEffect } from 'react';
import {
  CreditCard,
  Plus,
  DollarSign,
  CheckCircle,
  FileText,
  Clock,
  Printer,
  ShieldCheck,
  X,
  Receipt,
  RotateCcw,
  AlertTriangle,
  ArrowRight
} from 'lucide-react';
import { CarbonDataTable, Column } from '../components/carbon/CarbonDataTable';
import { CarbonTag, CarbonTagType } from '../components/carbon/CarbonTag';
import { CarbonButton } from '../components/carbon/CarbonButton';
import { CarbonModal } from '../components/carbon/CarbonModal';
import { CarbonTabs } from '../components/carbon/CarbonTabs';
import { BillInvoice, Patient, Payment, RefundRequest, AppUser } from '../types/hospital';
import { hospitalApi } from '../services/hospitalApi';
import { RecordPaymentModal } from '../components/modals/RecordPaymentModal';
import { RefundRequestModal } from '../components/modals/RefundRequestModal';

interface BillingInsuranceViewProps {
  invoices: BillInvoice[];
  patients: Patient[];
  currentUser?: AppUser;
  onOpenBillingModal: (patient?: Patient) => void;
  onUpdateInvoiceStatus: (id: string, paymentStatus: BillInvoice['paymentStatus'], claimStatus?: any) => void;
  onNotify?: (title: string, subtitle?: string, kind?: 'success' | 'error' | 'warning' | 'info') => void;
}

export const BillingInsuranceView: React.FC<BillingInsuranceViewProps> = ({
  invoices,
  patients,
  currentUser,
  onOpenBillingModal,
  onUpdateInvoiceStatus,
  onNotify
}) => {
  const [activeSection, setActiveSection] = useState<'invoices' | 'payments' | 'refunds' | 'reports'>('invoices');
  const [selectedInvoiceStatus, setSelectedInvoiceStatus] = useState<string>('all');
  const [viewingInvoice, setViewingInvoice] = useState<BillInvoice | null>(null);

  const [payments, setPayments] = useState<Payment[]>([]);
  const [refundRequests, setRefundRequests] = useState<RefundRequest[]>([]);
  const [dailyReport, setDailyReport] = useState<any>(null);
  const [receivablesReport, setReceivablesReport] = useState<any>(null);

  const [isRecordPaymentOpen, setIsRecordPaymentOpen] = useState(false);
  const [isRefundModalOpen, setIsRefundModalOpen] = useState(false);

  const isSuperAdmin = currentUser?.role === 'SUPER_ADMIN';
  const isAccountant = currentUser?.role === 'ACCOUNTANT';
  const canManageFinances = isSuperAdmin || isAccountant;

  const loadFinancialData = async () => {
    try {
      const [payList, refList, daily, recv] = await Promise.all([
        hospitalApi.getPayments().catch(() => []),
        hospitalApi.getRefundRequests().catch(() => []),
        hospitalApi.getDailyCollectionReport().catch(() => null),
        hospitalApi.getOutstandingReceivablesReport().catch(() => null)
      ]);
      setPayments(payList);
      setRefundRequests(refList);
      setDailyReport(daily);
      setReceivablesReport(recv);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    loadFinancialData();
  }, [invoices]);

  const filteredInvoices = invoices.filter((i) => {
    if (selectedInvoiceStatus === 'all') return true;
    if (selectedInvoiceStatus === 'voided') return i.status === 'voided';
    return i.paymentStatus === selectedInvoiceStatus;
  });

  const totalGrossRevenue = invoices.reduce((acc, i) => acc + (i.totalAmount || 0), 0);
  const totalCollected = payments.reduce((acc, p) => acc + (p.amount || 0), 0);
  const outstandingBalance = invoices
    .filter((i) => i.status !== 'voided' && i.status !== 'cancelled')
    .reduce((acc, i) => acc + (i.balance !== undefined ? i.balance : (i.paymentStatus === 'paid' ? 0 : i.totalAmount)), 0);
  const unallocatedCredit = payments.reduce((acc, p) => acc + (p.unallocatedAmount || 0), 0);

  const getPaymentStatusTag = (status: BillInvoice['paymentStatus'], invStatus?: string): { type: CarbonTagType; label: string } => {
    if (invStatus === 'voided') {
      return { type: 'cool-gray', label: 'VOIDED' };
    }
    switch (status) {
      case 'paid':
        return { type: 'green', label: 'CLEARED & PAID' };
      case 'partially_paid':
      case 'partial':
        return { type: 'blue', label: 'PARTIAL PAYMENT' };
      case 'unpaid':
      default:
        return { type: 'red', label: 'PAYMENT DUE' };
    }
  };

  const invoiceColumns: Column<BillInvoice>[] = [
    {
      key: 'invoiceNumber',
      header: 'Invoice #',
      width: '150px',
      sortable: true,
      render: (inv) => (
        <span className="font-mono text-xs font-semibold text-[#0f62fe]">
          {inv.invoiceNumber}
        </span>
      )
    },
    {
      key: 'patient',
      header: 'Patient & MRN',
      sortable: true,
      render: (inv) => (
        <div>
          <div className="font-semibold text-sm text-[#161616]">
            {inv.patientName}
          </div>
          <div className="text-[11px] font-mono text-[#525252]">
            {inv.mrn}
          </div>
        </div>
      )
    },
    {
      key: 'date',
      header: 'Issue Date',
      sortable: true,
      render: (inv) => (
        <span className="text-xs text-[#525252] font-mono">
          {new Date(inv.createdAt).toLocaleDateString(undefined, {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
          })}
        </span>
      )
    },
    {
      key: 'totalAmount',
      header: 'Total Charges',
      sortable: true,
      render: (inv) => (
        <span className="font-mono text-xs font-semibold text-[#161616] tabular-nums">
          ₹{Number(inv.totalAmount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
        </span>
      )
    },
    {
      key: 'balance',
      header: 'Balance Due',
      sortable: true,
      render: (inv) => {
        const bal = inv.balance !== undefined ? inv.balance : (inv.paymentStatus === 'paid' ? 0 : inv.totalAmount);
        return (
          <span className={`font-mono text-xs font-semibold tabular-nums ${bal > 0 ? 'text-[#da1e28]' : 'text-[#24a148]'}`}>
            ₹{Number(bal).toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </span>
        );
      }
    },
    {
      key: 'paymentStatus',
      header: 'Status',
      sortable: true,
      render: (inv) => {
        const tag = getPaymentStatusTag(inv.paymentStatus, inv.status);
        return <CarbonTag type={tag.type}>{tag.label}</CarbonTag>;
      }
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (inv) => (
        <div className="flex items-center gap-1.5">
          <CarbonButton
            kind="ghost"
            size="sm"
            renderIcon={FileText}
            onClick={() => setViewingInvoice(inv)}
          >
            Review
          </CarbonButton>
        </div>
      )
    }
  ];

  const paymentColumns: Column<Payment>[] = [
    {
      key: 'paymentNumber',
      header: 'Receipt #',
      width: '150px',
      sortable: true,
      render: (p) => <span className="font-mono text-xs font-semibold text-[#0f62fe]">{p.paymentNumber}</span>
    },
    {
      key: 'patient',
      header: 'Patient & MRN',
      sortable: true,
      render: (p) => (
        <div>
          <div className="font-semibold text-sm text-[#161616]">{p.patientName}</div>
          <div className="text-[11px] font-mono text-[#525252]">{p.mrn}</div>
        </div>
      )
    },
    {
      key: 'amount',
      header: 'Amount Paid',
      sortable: true,
      render: (p) => (
        <span className="font-mono text-xs font-semibold text-[#24a148] tabular-nums">
          ₹{Number(p.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
        </span>
      )
    },
    {
      key: 'unallocatedAmount',
      header: 'Unallocated Credit',
      sortable: true,
      render: (p) => (
        <span className="font-mono text-xs text-[#525252] tabular-nums">
          ₹{Number(p.unallocatedAmount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
        </span>
      )
    },
    {
      key: 'paymentMethod',
      header: 'Method',
      sortable: true,
      render: (p) => (
        <span className="text-xs text-[#161616]">
          {p.paymentMethod} {p.referenceNumber && <span className="text-[#525252] font-mono">({p.referenceNumber})</span>}
        </span>
      )
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      render: (p) => {
        let type: CarbonTagType = 'green';
        if (p.status === 'unallocated') type = 'blue';
        if (p.status === 'partially_allocated') type = 'purple';
        if (p.status === 'refunded') type = 'red';
        return <CarbonTag type={type}>{p.status.toUpperCase()}</CarbonTag>;
      }
    },
    {
      key: 'paymentDate',
      header: 'Date & Time',
      sortable: true,
      render: (p) => (
        <span className="text-xs text-[#525252] font-mono">
          {new Date(p.paymentDate).toLocaleDateString()} {new Date(p.paymentDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      )
    }
  ];

  const handleApproveRefund = async (refundId: string) => {
    try {
      await hospitalApi.approveRefund(refundId);
      if (onNotify) onNotify('Refund Approved', 'The refund request was approved by Super Admin and is ready for disbursement execution.', 'success');
      loadFinancialData();
    } catch (err: any) {
      if (onNotify) onNotify('Approval Rejected', err.message || 'Dual authorization failure', 'error');
    }
  };

  const handleExecuteRefund = async (refund: RefundRequest) => {
    const refundMethod = prompt('Enter payment/refund method (Cash, UPI, Bank Transfer, Card):', 'Cash');
    if (!refundMethod) return;
    const externalReference = prompt('Enter external reference / transaction ID (optional):') || undefined;

    try {
      const res = await hospitalApi.executeRefund(refund.id, { refundMethod, externalReference });
      if (onNotify) {
        onNotify(
          'Refund Executed',
          `Disbursement completed. Immutable Ledger Entry: ${res.ledgerEntry.entryNumber}`,
          'success'
        );
      }
      loadFinancialData();
    } catch (err: any) {
      if (onNotify) onNotify('Execution Error', err.message, 'error');
    }
  };

  const handleRejectRefund = async (refundId: string) => {
    const reason = prompt('Please enter the reason for rejecting this refund request:');
    if (!reason) return;
    try {
      await hospitalApi.rejectRefund(refundId, reason);
      if (onNotify) onNotify('Refund Rejected', 'The request has been formally rejected.', 'info');
      loadFinancialData();
    } catch (err: any) {
      if (onNotify) onNotify('Rejection Error', err.message, 'error');
    }
  };

  const refundColumns: Column<RefundRequest>[] = [
    {
      key: 'requestNumber',
      header: 'Request #',
      width: '150px',
      sortable: true,
      render: (r) => <span className="font-mono text-xs font-semibold text-[#0f62fe]">{r.requestNumber}</span>
    },
    {
      key: 'type',
      header: 'Type',
      sortable: true,
      render: (r) => <span className="font-medium text-xs text-[#161616] uppercase">{r.type.replace('_', ' ')}</span>
    },
    {
      key: 'patient',
      header: 'Patient & MRN',
      sortable: true,
      render: (r) => (
        <div>
          <div className="font-semibold text-sm text-[#161616]">{r.patientName}</div>
          <div className="text-[11px] font-mono text-[#525252]">{r.mrn}</div>
        </div>
      )
    },
    {
      key: 'amount',
      header: 'Amount (INR)',
      sortable: true,
      render: (r) => (
        <span className="font-mono text-xs font-semibold text-[#da1e28] tabular-nums">
          ₹{Number(r.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
        </span>
      )
    },
    {
      key: 'reason',
      header: 'Justification Reason',
      render: (r) => <span className="text-xs text-[#525252] line-clamp-1">{r.reason}</span>
    },
    {
      key: 'status',
      header: 'Governance Status',
      sortable: true,
      render: (r) => {
        let type: CarbonTagType = 'yellow';
        let label = r.status.toUpperCase();
        if (r.status === 'approved') {
          type = 'purple';
          label = 'APPROVED (READY TO EXECUTE)';
        } else if (r.status === 'completed') {
          type = 'green';
          label = 'COMPLETED (EXECUTED)';
        } else if (r.status === 'rejected') {
          type = 'red';
          label = 'REJECTED';
        }
        return <CarbonTag type={type}>{label}</CarbonTag>;
      }
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (r) => {
        if (r.status === 'pending') {
          if (!isSuperAdmin) {
            return <span className="text-[11px] text-[#8d8d8d] italic">Awaiting Super Admin</span>;
          }
          return (
            <div className="flex items-center gap-1.5">
              <CarbonButton kind="primary" size="sm" onClick={() => handleApproveRefund(r.id)}>
                Approve
              </CarbonButton>
              <CarbonButton kind="danger" size="sm" onClick={() => handleRejectRefund(r.id)}>
                Reject
              </CarbonButton>
            </div>
          );
        }
        if (r.status === 'approved') {
          if (!canManageFinances) {
            return <span className="text-[11px] text-[#8d8d8d] italic">Awaiting Disbursement</span>;
          }
          return (
            <CarbonButton kind="primary" size="sm" onClick={() => handleExecuteRefund(r)}>
              Execute
            </CarbonButton>
          );
        }
        if (r.status === 'completed') {
          return (
            <span className="text-[11px] font-mono text-[#24a148]">
              {r.refundLedgerEntry ? r.refundLedgerEntry.entryNumber : (r.refundMethod ? `Executed (${r.refundMethod})` : 'Executed')}
            </span>
          );
        }
        return <span className="text-[11px] text-[#da1e28]">Rejected</span>;
      }
    }
  ];

  return (
    <div className="space-y-6">
      {/* Title */}
      <div className="bg-white border border-[#e0e0e0] p-4 sm:p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="text-[12px] font-mono uppercase tracking-[0.32px] text-[#525252] mb-1">
            Revenue Cycle & Cashier Management
          </div>
          <h1 className="text-[28px] font-semibold text-[#161616] tracking-tight leading-none">
            Hospital Billing & Financial Operations
          </h1>
          <p className="text-[13px] text-[#525252] mt-2">
            Itemized inpatient/outpatient invoicing, cashier payment collection, dual-authorization refunds, and aging reports.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {canManageFinances && (
            <>
              <CarbonButton
                kind="tertiary"
                renderIcon={CreditCard}
                onClick={() => setIsRecordPaymentOpen(true)}
              >
                Record Payment
              </CarbonButton>
              <CarbonButton
                kind="secondary"
                renderIcon={RotateCcw}
                onClick={() => setIsRefundModalOpen(true)}
              >
                Request Refund
              </CarbonButton>
              <CarbonButton
                kind="primary"
                renderIcon={Plus}
                onClick={() => onOpenBillingModal(patients[0])}
              >
                Generate Bill
              </CarbonButton>
            </>
          )}
        </div>
      </div>

      {/* Financial Summary KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 font-mono text-xs">
        <div className="p-4 bg-white border border-[#e0e0e0]">
          <span className="text-[11px] text-[#525252] uppercase block">Total Gross Invoiced (INR)</span>
          <div className="text-2xl font-light text-[#161616] mt-1 tabular-nums">
            ₹{Math.round(totalGrossRevenue).toLocaleString()}
          </div>
        </div>

        <div className="p-4 bg-white border border-[#e0e0e0]">
          <span className="text-[11px] text-[#525252] uppercase block">Direct Collections (INR)</span>
          <div className="text-2xl font-light text-[#24a148] mt-1 tabular-nums">
            ₹{Math.round(totalCollected).toLocaleString()}
          </div>
        </div>

        <div className="p-4 bg-white border border-[#e0e0e0]">
          <span className="text-[11px] text-[#525252] uppercase block">Outstanding Receivables (INR)</span>
          <div className="text-2xl font-light text-[#da1e28] mt-1 tabular-nums">
            ₹{Math.round(outstandingBalance).toLocaleString()}
          </div>
        </div>

        <div className="p-4 bg-white border border-[#e0e0e0]">
          <span className="text-[11px] text-[#525252] uppercase block">Available Unallocated Credit</span>
          <div className="text-2xl font-light text-[#0f62fe] mt-1 tabular-nums">
            ₹{Math.round(unallocatedCredit).toLocaleString()}
          </div>
        </div>
      </div>

      {/* Navigation Sections */}
      <CarbonTabs
        selectedId={activeSection}
        onSelect={(id) => setActiveSection(id as any)}
        tabs={[
          { id: 'invoices', label: 'Invoices & Statements', count: invoices.length },
          { id: 'payments', label: 'Cashier Receipts & Payments', count: payments.length },
          { id: 'refunds', label: 'Dual-Auth Refunds & Adjustments', count: refundRequests.length },
          { id: 'reports', label: 'Financial Aging & Collections' }
        ]}
      />

      {/* INVOICES SECTION */}
      {activeSection === 'invoices' && (
        <div className="space-y-4">
          <CarbonTabs
            selectedId={selectedInvoiceStatus}
            onSelect={setSelectedInvoiceStatus}
            tabs={[
              { id: 'all', label: 'All Invoices', count: invoices.length },
              { id: 'unpaid', label: 'Payment Due', count: invoices.filter((i) => i.paymentStatus === 'unpaid').length },
              { id: 'partially_paid', label: 'Partial Payment', count: invoices.filter((i) => i.paymentStatus === 'partially_paid' || i.paymentStatus === 'partial').length },
              { id: 'paid', label: 'Cleared & Settled', count: invoices.filter((i) => i.paymentStatus === 'paid').length },
              { id: 'voided', label: 'Voided Invoices', count: invoices.filter((i) => i.status === 'voided').length }
            ]}
          />

          <CarbonDataTable<BillInvoice>
            title="Patient Invoices & Discharge Statements"
            description="Authoritative sequence-generated hospital statements with line item pricing snapshots and balance tracking."
            columns={invoiceColumns}
            data={filteredInvoices}
            searchPlaceholder="Search invoice #, patient name, or MRN..."
            initialSortKey="date"
          />
        </div>
      )}

      {/* PAYMENTS SECTION */}
      {activeSection === 'payments' && (
        <CarbonDataTable<Payment>
          title="Hospital Cashier Receipts & Payments Register"
          description="Direct payments received via Cash, UPI, Bank Transfer and Card with allocation breakdown."
          columns={paymentColumns}
          data={payments}
          searchPlaceholder="Search receipt #, patient name, or transaction ref..."
          initialSortKey="paymentDate"
        />
      )}

      {/* DUAL-AUTH REFUNDS SECTION */}
      {activeSection === 'refunds' && (
        <div className="space-y-4">
          <div className="p-4 bg-[#edf5ff] border border-[#a6c8ff] text-xs text-[#0043ce]">
            <strong>Dual-Authorization Governance Enforcement:</strong> Initiators (Accountants) may submit refund and void requests. Approval is strictly restricted to SUPER_ADMIN, and the initiator cannot approve their own request.
          </div>
          <CarbonDataTable<RefundRequest>
            title="Refunds, Credit Adjustments & Voids"
            description="Audited ledger of initiated refunds and credit adjustments awaiting or completed with dual authorization."
            columns={refundColumns}
            data={refundRequests}
            searchPlaceholder="Search request #, patient, or MRN..."
            initialSortKey="requestNumber"
          />
        </div>
      )}

      {/* FINANCIAL REPORTS SECTION */}
      {activeSection === 'reports' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs">
          {/* Daily Collections Report */}
          <div className="bg-white border border-[#e0e0e0] p-4 space-y-4">
            <div className="border-b border-[#e0e0e0] pb-3">
              <span className="text-[11px] font-mono uppercase text-[#525252]">Collections Report</span>
              <h3 className="text-base font-semibold text-[#161616]">Daily Collections by Payment Method</h3>
              <p className="text-[11px] text-[#525252] mt-0.5">Summary of all transactions recorded in the current period.</p>
            </div>

            {dailyReport ? (
              <div className="space-y-3 font-mono">
                <div className="p-3 bg-[#f4f4f4] border border-[#e0e0e0] flex justify-between items-center">
                  <span className="text-[#525252] font-sans font-semibold">Total Direct Collections:</span>
                  <span className="text-lg font-bold text-[#24a148]">₹{Number(dailyReport.totalCollected || 0).toLocaleString()}</span>
                </div>
                {dailyReport.totalRefunded !== undefined && (
                  <div className="p-3 bg-[#fff1f1] border border-[#ffd7d9] flex justify-between items-center">
                    <span className="text-[#525252] font-sans font-semibold">Total Completed Refunds:</span>
                    <span className="text-lg font-bold text-[#da1e28]">-₹{Number(dailyReport.totalRefunded || 0).toLocaleString()}</span>
                  </div>
                )}
                {dailyReport.netCollection !== undefined && (
                  <div className="p-3 bg-[#edf5ff] border border-[#a6c8ff] flex justify-between items-center">
                    <span className="text-[#0043ce] font-sans font-semibold">Net Realized Collection:</span>
                    <span className="text-lg font-bold text-[#0043ce]">₹{Number(dailyReport.netCollection || 0).toLocaleString()}</span>
                  </div>
                )}
                <div className="divide-y divide-[#e0e0e0] border border-[#e0e0e0]">
                  {Object.entries(dailyReport.byMethod || {}).map(([method, amt]: [string, any]) => (
                    <div key={method} className="flex justify-between p-2.5 bg-white">
                      <span className="text-[#161616] font-sans">{method}</span>
                      <span className="font-semibold">₹{Number(amt).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
                <div className="text-[11px] text-[#525252] font-sans">
                  Total Transactions Count: <strong>{dailyReport.paymentCount}</strong>
                </div>
              </div>
            ) : (
              <div className="text-center p-6 text-[#525252]">Loading daily collection summary...</div>
            )}
          </div>

          {/* Receivables Aging Report */}
          <div className="bg-white border border-[#e0e0e0] p-4 space-y-4">
            <div className="border-b border-[#e0e0e0] pb-3">
              <span className="text-[11px] font-mono uppercase text-[#525252]">Aging Analysis</span>
              <h3 className="text-base font-semibold text-[#161616]">Outstanding Receivables Aging</h3>
              <p className="text-[11px] text-[#525252] mt-0.5">Unsettled inpatient and outpatient invoice balances by overdue bucket.</p>
            </div>

            {receivablesReport ? (
              <div className="space-y-3 font-mono">
                <div className="p-3 bg-[#f4f4f4] border border-[#e0e0e0] flex justify-between items-center">
                  <span className="text-[#525252] font-sans font-semibold">Total Outstanding:</span>
                  <span className="text-lg font-bold text-[#da1e28]">₹{receivablesReport.totalOutstanding.toLocaleString()}</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="p-3 bg-[#f4f4f4] border border-[#e0e0e0]">
                    <span className="text-[11px] text-[#525252] font-sans block">0–30 Days (Current)</span>
                    <span className="text-base font-semibold text-[#161616]">₹{receivablesReport.agingBuckets.current.toLocaleString()}</span>
                  </div>
                  <div className="p-3 bg-[#f4f4f4] border border-[#e0e0e0]">
                    <span className="text-[11px] text-[#525252] font-sans block">31–60 Days</span>
                    <span className="text-base font-semibold text-[#da1e28]">₹{receivablesReport.agingBuckets.days31_60.toLocaleString()}</span>
                  </div>
                  <div className="p-3 bg-[#f4f4f4] border border-[#e0e0e0]">
                    <span className="text-[11px] text-[#525252] font-sans block">61–90 Days</span>
                    <span className="text-base font-semibold text-[#da1e28]">₹{receivablesReport.agingBuckets.days61_90.toLocaleString()}</span>
                  </div>
                  <div className="p-3 bg-[#f4f4f4] border border-[#e0e0e0]">
                    <span className="text-[11px] text-[#525252] font-sans block">90+ Days Overdue</span>
                    <span className="text-base font-semibold text-[#da1e28]">₹{receivablesReport.agingBuckets.over90.toLocaleString()}</span>
                  </div>
                </div>
                <div className="text-[11px] text-[#525252] font-sans">
                  Total Open Overdue Invoices: <strong>{receivablesReport.invoiceCount}</strong>
                </div>
              </div>
            ) : (
              <div className="text-center p-6 text-[#525252]">Loading receivables aging analysis...</div>
            )}
          </div>
        </div>
      )}

      {/* Record Payment Modal */}
      {isRecordPaymentOpen && (
        <RecordPaymentModal
          isOpen={isRecordPaymentOpen}
          onClose={() => setIsRecordPaymentOpen(false)}
          patients={patients}
          invoices={invoices}
          onSubmit={async (payData) => {
            await hospitalApi.recordPayment(payData);
            if (onNotify) onNotify('Payment Recorded', `Payment of ₹${payData.amount} recorded successfully.`, 'success');
            loadFinancialData();
          }}
        />
      )}

      {/* Refund Request Modal */}
      {isRefundModalOpen && (
        <RefundRequestModal
          isOpen={isRefundModalOpen}
          onClose={() => setIsRefundModalOpen(false)}
          patients={patients}
          invoices={invoices}
          payments={payments}
          onSubmit={async (refData) => {
            await hospitalApi.requestRefund(refData);
            if (onNotify) onNotify('Refund Request Submitted', 'Queued for SUPER_ADMIN dual-authorization approval.', 'info');
            loadFinancialData();
          }}
        />
      )}

      {/* Invoice Review Modal */}
      {viewingInvoice && (
        <CarbonModal
          isOpen={true}
          onClose={() => setViewingInvoice(null)}
          title={`Hospital Itemized Statement: ${viewingInvoice.invoiceNumber}`}
          label="Billing & Discharge Clearance Record"
          primaryButtonText={viewingInvoice.paymentStatus === 'paid' ? 'Print Statement' : 'Mark as Cleared & Paid'}
          secondaryButtonText="Close"
          onRequestSubmit={() => {
            if (viewingInvoice.paymentStatus !== 'paid') {
              onUpdateInvoiceStatus(viewingInvoice.id, 'paid');
            } else {
              window.print();
            }
            setViewingInvoice(null);
          }}
          size="lg"
        >
          <div className="space-y-4 text-xs">
            <div className="p-4 bg-[#f4f4f4] border border-[#e0e0e0] flex justify-between items-start">
              <div>
                <span className="text-[11px] font-mono text-[#525252]">PATIENT DETAILS</span>
                <h4 className="text-base font-semibold text-[#161616]">
                  {viewingInvoice.patientName}
                </h4>
                <div className="font-mono text-[#525252] mt-0.5">
                  MRN: {viewingInvoice.mrn}
                </div>
              </div>

              <div className="text-right font-mono text-[11px] text-[#525252]">
                <div>Date: {new Date(viewingInvoice.createdAt).toLocaleDateString()}</div>
                <div>Status: <strong className="text-[#161616] uppercase">{viewingInvoice.paymentStatus}</strong></div>
              </div>
            </div>

            {/* Line items table */}
            <div className="border border-[#e0e0e0]">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-[#f4f4f4] border-b border-[#e0e0e0] font-semibold text-[#161616]">
                    <th className="py-2.5 px-3">Service Description</th>
                    <th className="py-2.5 px-3">Category</th>
                    <th className="py-2.5 px-3 text-right">Qty</th>
                    <th className="py-2.5 px-3 text-right">Rate</th>
                    <th className="py-2.5 px-3 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e0e0e0]">
                  {viewingInvoice.items.map((item) => (
                    <tr key={item.id} className="hover:bg-[#f4f4f4]">
                      <td className="py-2 px-3 font-medium text-[#161616]">{item.description}</td>
                      <td className="py-2 px-3 text-[#525252]">{item.category}</td>
                      <td className="py-2 px-3 text-right font-mono">{item.quantity}</td>
                      <td className="py-2 px-3 text-right font-mono">₹{item.unitPrice !== null && item.unitPrice !== undefined ? Math.round(item.unitPrice).toLocaleString() : '—'}</td>
                      <td className="py-2 px-3 text-right font-mono font-semibold">₹{Math.round(item.total).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Financial Totals */}
            <div className="p-4 bg-[#f4f4f4] border border-[#e0e0e0] font-mono space-y-2">
              <div className="flex justify-between text-[#525252]">
                <span>Total Hospital Charges:</span>
                <span className="font-semibold">₹{Number(viewingInvoice.totalAmount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between text-[#525252]">
                <span>Total Paid / Allocated:</span>
                <span className="font-semibold text-[#24a148]">₹{Number(viewingInvoice.paidAmount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="border-t border-[#c6c6c6] pt-2 flex justify-between text-[#161616] font-bold text-sm">
                <span>Total Patient Balance Due:</span>
                <span className="text-[#0f62fe]">₹{Number(viewingInvoice.balance !== undefined ? viewingInvoice.balance : viewingInvoice.totalAmount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
              </div>
            </div>
          </div>
        </CarbonModal>
      )}
    </div>
  );
};
