import React, { useState } from 'react';
import { CarbonModal } from '../carbon/CarbonModal';
import { CarbonButton } from '../carbon/CarbonButton';
import { Patient, BillInvoice, PaymentMethod } from '../../types/hospital';

interface RecordPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  patients: Patient[];
  invoices: BillInvoice[];
  onSubmit: (paymentData: {
    patientId?: string;
    mrn?: string;
    amount: number;
    paymentMethod: PaymentMethod;
    referenceNumber?: string;
    notes?: string;
    allocations?: Array<{ invoiceId: string; amount: number }>;
  }) => Promise<void>;
}

export const RecordPaymentModal: React.FC<RecordPaymentModalProps> = ({
  isOpen,
  onClose,
  patients,
  invoices,
  onSubmit
}) => {
  const [selectedPatientId, setSelectedPatientId] = useState<string>(patients[0]?.id || '');
  const [amount, setAmount] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('UPI');
  const [referenceNumber, setReferenceNumber] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [allocations, setAllocations] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const selectedPatient = patients.find((p) => p.id === selectedPatientId);
  const patientInvoices = invoices.filter(
    (i) => (i.patientId === selectedPatientId || (selectedPatient && i.mrn === selectedPatient.mrn)) &&
           (i.status === 'issued' || i.status === 'partially_paid' || i.paymentStatus !== 'paid') &&
           (i.balance === undefined || i.balance > 0)
  );

  const handleAllocationChange = (invoiceId: string, val: string) => {
    const num = parseFloat(val);
    setAllocations((prev) => ({
      ...prev,
      [invoiceId]: isNaN(num) || num <= 0 ? 0 : num
    }));
  };

  const handleAutoAllocate = () => {
    const payAmt = parseFloat(amount);
    if (isNaN(payAmt) || payAmt <= 0) {
      setError('Please enter a valid payment amount first.');
      return;
    }
    let remaining = payAmt;
    const newAlloc: Record<string, number> = {};
    for (const inv of patientInvoices) {
      const invBal = inv.balance !== undefined ? inv.balance : inv.totalAmount;
      if (remaining <= 0) break;
      const allocAmt = Math.min(remaining, invBal);
      newAlloc[inv.id] = parseFloat(allocAmt.toFixed(2));
      remaining = parseFloat((remaining - allocAmt).toFixed(2));
    }
    setAllocations(newAlloc);
    setError(null);
  };

  const handleSubmit = async () => {
    setError(null);
    const payAmt = parseFloat(amount);
    if (isNaN(payAmt) || payAmt <= 0) {
      setError('Payment amount must be greater than zero.');
      return;
    }

    const allocList: Array<{ invoiceId: string; amount: number }> = [];
    let totalAlloc = 0;
    for (const [invId, allocAmt] of Object.entries(allocations)) {
      if (allocAmt > 0) {
        allocList.push({ invoiceId: invId, amount: allocAmt });
        totalAlloc += allocAmt;
      }
    }

    if (totalAlloc > payAmt) {
      setError(`Allocated sum (₹${totalAlloc.toFixed(2)}) cannot exceed total payment amount (₹${payAmt.toFixed(2)}).`);
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmit({
        patientId: selectedPatient?.id,
        mrn: selectedPatient?.mrn,
        amount: payAmt,
        paymentMethod,
        referenceNumber: referenceNumber.trim() || undefined,
        notes: notes.trim() || undefined,
        allocations: allocList.length > 0 ? allocList : undefined
      });
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to record payment');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <CarbonModal
      isOpen={isOpen}
      onClose={onClose}
      title="Record Patient Payment & Receipt"
      label="Financial Operations / Cashier Desk"
      primaryButtonText={isSubmitting ? 'Recording...' : 'Record Payment'}
      secondaryButtonText="Cancel"
      onRequestSubmit={handleSubmit}
      size="lg"
    >
      <div className="space-y-4 text-xs font-sans">
        {error && (
          <div className="p-3 bg-[#fff1f1] border-l-4 border-[#da1e28] text-[#da1e28]">
            <p className="font-semibold text-xs">{error}</p>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-[11px] font-semibold text-[#525252] uppercase mb-1">
              Select Patient
            </label>
            <select
              value={selectedPatientId}
              onChange={(e) => {
                setSelectedPatientId(e.target.value);
                setAllocations({});
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

          <div>
            <label className="block text-[11px] font-semibold text-[#525252] uppercase mb-1">
              Payment Amount (INR) *
            </label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="e.g. 2500.00"
              className="w-full bg-[#f4f4f4] border border-[#8d8d8d] p-2 text-xs font-mono text-[#161616] focus:outline-none focus:border-[#0f62fe]"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-[#525252] uppercase mb-1">
              Payment Method *
            </label>
            <select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
              className="w-full bg-[#f4f4f4] border border-[#8d8d8d] p-2 text-xs text-[#161616] focus:outline-none focus:border-[#0f62fe]"
            >
              <option value="Cash">Cash</option>
              <option value="UPI">UPI</option>
              <option value="Bank Transfer">Bank Transfer (NEFT/RTGS/IMPS)</option>
              <option value="Card">Debit / Credit Card</option>
              <option value="Other">Other</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-[#525252] uppercase mb-1">
              Transaction / Reference Number
            </label>
            <input
              type="text"
              value={referenceNumber}
              onChange={(e) => setReferenceNumber(e.target.value)}
              placeholder="UTR, Cheque #, or Card Auth Ref"
              className="w-full bg-[#f4f4f4] border border-[#8d8d8d] p-2 text-xs font-mono text-[#161616] focus:outline-none focus:border-[#0f62fe]"
            />
          </div>
        </div>

        <div>
          <label className="block text-[11px] font-semibold text-[#525252] uppercase mb-1">
            Notes / Cashier Narration
          </label>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. Advance deposit against Ayurvedic inpatient panchakarma"
            className="w-full bg-[#f4f4f4] border border-[#8d8d8d] p-2 text-xs text-[#161616] focus:outline-none focus:border-[#0f62fe]"
          />
        </div>

        {/* Invoice Allocation Table */}
        <div className="border border-[#e0e0e0] p-3 bg-[#fcfcfc]">
          <div className="flex justify-between items-center mb-2">
            <div>
              <span className="font-semibold text-xs text-[#161616]">Invoice Allocation (Optional)</span>
              <p className="text-[11px] text-[#525252]">
                Allocate this payment directly across open invoices, or leave unallocated as patient account credit.
              </p>
            </div>
            {patientInvoices.length > 0 && (
              <CarbonButton kind="tertiary" size="sm" onClick={handleAutoAllocate}>
                Auto-Allocate
              </CarbonButton>
            )}
          </div>

          {patientInvoices.length === 0 ? (
            <div className="text-[11px] text-[#525252] italic p-2 bg-[#f4f4f4]">
              No outstanding unpaid invoices found for this patient. This payment will be retained as unallocated patient credit balance.
            </div>
          ) : (
            <div className="space-y-2 mt-2">
              {patientInvoices.map((inv) => {
                const bal = inv.balance !== undefined ? inv.balance : inv.totalAmount;
                const allocated = allocations[inv.id] || 0;
                return (
                  <div key={inv.id} className="flex items-center justify-between p-2 bg-white border border-[#e0e0e0]">
                    <div>
                      <span className="font-mono text-xs font-semibold text-[#0f62fe]">{inv.invoiceNumber}</span>
                      <span className="text-[11px] text-[#525252] ml-2">
                        Total: ₹{inv.totalAmount.toLocaleString()} | Due: ₹{bal.toLocaleString()}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-[#525252]">Allocate (₹):</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        max={bal}
                        value={allocations[inv.id] !== undefined ? allocations[inv.id] : ''}
                        onChange={(e) => handleAllocationChange(inv.id, e.target.value)}
                        placeholder="0.00"
                        className="w-24 bg-[#f4f4f4] border border-[#8d8d8d] p-1 text-xs font-mono text-right"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </CarbonModal>
  );
};

