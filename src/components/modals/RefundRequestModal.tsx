import React, { useState } from 'react';
import { CarbonModal } from '../carbon/CarbonModal';
import { Patient, BillInvoice, Payment, RefundRequestType } from '../../types/hospital';

interface RefundRequestModalProps {
  isOpen: boolean;
  onClose: () => void;
  patients: Patient[];
  invoices: BillInvoice[];
  payments: Payment[];
  onSubmit: (data: {
    type: RefundRequestType;
    paymentId?: string;
    invoiceId?: string;
    patientId?: string;
    mrn?: string;
    amount: number;
    reason: string;
  }) => Promise<void>;
}

export const RefundRequestModal: React.FC<RefundRequestModalProps> = ({
  isOpen,
  onClose,
  patients,
  invoices,
  payments,
  onSubmit
}) => {
  const [type, setType] = useState<RefundRequestType>('refund');
  const [selectedPatientId, setSelectedPatientId] = useState<string>(patients[0]?.id || '');
  const [selectedPaymentId, setSelectedPaymentId] = useState<string>('');
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string>('');
  const [amount, setAmount] = useState<string>('');
  const [reason, setReason] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const selectedPatient = patients.find((p) => p.id === selectedPatientId);
  const patientPayments = payments.filter((p) => p.patientId === selectedPatientId || (selectedPatient && p.mrn === selectedPatient.mrn));
  const patientInvoices = invoices.filter((i) => i.patientId === selectedPatientId || (selectedPatient && i.mrn === selectedPatient.mrn));

  const handleSubmit = async () => {
    setError(null);
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) {
      setError('Amount must be greater than zero.');
      return;
    }
    if (!reason.trim()) {
      setError('A clinical or administrative reason is required for dual-authorization audit review.');
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmit({
        type,
        patientId: selectedPatient?.id,
        mrn: selectedPatient?.mrn,
        paymentId: type === 'refund' ? (selectedPaymentId || undefined) : undefined,
        invoiceId: (type === 'invoice_void' || type === 'credit_adjustment') ? (selectedInvoiceId || undefined) : undefined,
        amount: amt,
        reason: reason.trim()
      });
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to submit refund request');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <CarbonModal
      isOpen={isOpen}
      onClose={onClose}
      title="Initiate Refund / Financial Credit Adjustment"
      label="Dual Authorization Required (SUPER_ADMIN Approval Required)"
      primaryButtonText={isSubmitting ? 'Submitting...' : 'Submit Request'}
      secondaryButtonText="Cancel"
      onRequestSubmit={handleSubmit}
      size="md"
    >
      <div className="space-y-4 text-xs font-sans">
        {error && (
          <div className="p-3 bg-[#fff1f1] border-l-4 border-[#da1e28] text-[#da1e28]">
            <p className="font-semibold text-xs">{error}</p>
          </div>
        )}

        <div className="p-3 bg-[#edf5ff] border-l-4 border-[#0f62fe] text-[#0043ce]">
          <p className="font-semibold text-xs">Dual Authorization Governance</p>
          <p className="text-[11px] text-[#525252] mt-0.5">
            This request will be queued in "pending" status. Per clinical governance policy, the initiator cannot approve their own request; approval strictly requires a distinct SUPER_ADMIN signature.
          </p>
        </div>

        <div>
          <label className="block text-[11px] font-semibold text-[#525252] uppercase mb-1">
            Adjustment Type *
          </label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as RefundRequestType)}
            className="w-full bg-[#f4f4f4] border border-[#8d8d8d] p-2 text-xs text-[#161616] focus:outline-none focus:border-[#0f62fe]"
          >
            <option value="refund">Direct Cash/UPI/Bank Refund (from unallocated credit)</option>
            <option value="credit_adjustment">Credit Adjustment / Ledger Correction</option>
            <option value="invoice_void">Invoice Void & Reversal</option>
          </select>
        </div>

        <div>
          <label className="block text-[11px] font-semibold text-[#525252] uppercase mb-1">
            Patient
          </label>
          <select
            value={selectedPatientId}
            onChange={(e) => {
              setSelectedPatientId(e.target.value);
              setSelectedPaymentId('');
              setSelectedInvoiceId('');
            }}
            className="w-full bg-[#f4f4f4] border border-[#8d8d8d] p-2 text-xs text-[#161616] focus:outline-none focus:border-[#0f62fe]"
          >
            {patients.map((p) => (
              <option key={p.id} value={p.id}>
                {p.firstName} {p.lastName} ({p.mrn})
              </option>
            ))}
          </select>
        </div>

        {type === 'refund' && (
          <div>
            <label className="block text-[11px] font-semibold text-[#525252] uppercase mb-1">
              Source Payment Receipt (Optional)
            </label>
            <select
              value={selectedPaymentId}
              onChange={(e) => {
                setSelectedPaymentId(e.target.value);
                const p = patientPayments.find((item) => item.id === e.target.value);
                if (p) setAmount(p.unallocatedAmount.toString());
              }}
              className="w-full bg-[#f4f4f4] border border-[#8d8d8d] p-2 text-xs text-[#161616] focus:outline-none focus:border-[#0f62fe]"
            >
              <option value="">-- Direct Patient Balance Refund --</option>
              {patientPayments.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.paymentNumber} ({p.paymentMethod}) - Total: ₹{p.amount} (Available: ₹{p.unallocatedAmount})
                </option>
              ))}
            </select>
          </div>
        )}

        {(type === 'invoice_void' || type === 'credit_adjustment') && (
          <div>
            <label className="block text-[11px] font-semibold text-[#525252] uppercase mb-1">
              Target Invoice *
            </label>
            <select
              value={selectedInvoiceId}
              onChange={(e) => {
                setSelectedInvoiceId(e.target.value);
                const inv = patientInvoices.find((i) => i.id === e.target.value);
                if (inv) setAmount(inv.totalAmount.toString());
              }}
              className="w-full bg-[#f4f4f4] border border-[#8d8d8d] p-2 text-xs text-[#161616] focus:outline-none focus:border-[#0f62fe]"
            >
              <option value="">-- Select Target Invoice --</option>
              {patientInvoices.map((inv) => (
                <option key={inv.id} value={inv.id}>
                  {inv.invoiceNumber} - Total: ₹{inv.totalAmount} | Status: {inv.status}
                </option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label className="block text-[11px] font-semibold text-[#525252] uppercase mb-1">
            Amount (INR) *
          </label>
          <input
            type="number"
            step="0.01"
            min="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            className="w-full bg-[#f4f4f4] border border-[#8d8d8d] p-2 text-xs font-mono text-[#161616] focus:outline-none focus:border-[#0f62fe]"
          />
        </div>

        <div>
          <label className="block text-[11px] font-semibold text-[#525252] uppercase mb-1">
            Clinical / Administrative Justification Reason *
          </label>
          <textarea
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Specify reason (e.g. Inpatient discharge early departure, billing tariff rate correction, or patient requested deposit refund)"
            className="w-full bg-[#f4f4f4] border border-[#8d8d8d] p-2 text-xs text-[#161616] focus:outline-none focus:border-[#0f62fe]"
          />
        </div>
      </div>
    </CarbonModal>
  );
};

