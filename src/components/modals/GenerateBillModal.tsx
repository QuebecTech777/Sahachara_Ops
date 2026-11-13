import React, { useState, useEffect } from 'react';
import { CarbonModal } from '../carbon/CarbonModal';
import { Patient, BillInvoice, BillItem, TherapySession } from '../../types/hospital';
import { hospitalApi } from '../../services/hospitalApi';

interface GenerateBillModalProps {
  isOpen: boolean;
  onClose: () => void;
  patients: Patient[];
  onSubmit: (invoice: Partial<BillInvoice>) => void;
}

export const GenerateBillModal: React.FC<GenerateBillModalProps> = ({
  isOpen,
  onClose,
  patients,
  onSubmit
}) => {
  const [selectedPatientId, setSelectedPatientId] = useState(patients[0]?.id || '');
  const [bedDays, setBedDays] = useState(0);
  const [bedDailyRate, setBedDailyRate] = useState<number>(0);
  const [physicianFee, setPhysicianFee] = useState<number>(0);
  const [pharmacyTotal, setPharmacyTotal] = useState<number>(0);
  const [labTotal, setLabTotal] = useState<number>(0);
  const [paymentStatus, setPaymentStatus] = useState<BillInvoice['paymentStatus']>('unpaid');
  const [paymentMethod, setPaymentMethod] = useState<'Cash' | 'UPI' | 'Card' | 'Bank Transfer'>('UPI');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Phase 7: Unbilled completed therapy sessions
  const [unbilledSessions, setUnbilledSessions] = useState<TherapySession[]>([]);
  const [selectedSessionIds, setSelectedSessionIds] = useState<string[]>([]);
  const [isLoadingSessions, setIsLoadingSessions] = useState(false);

  const patient = patients.find((p) => p.id === selectedPatientId) || patients[0];

  useEffect(() => {
    if (!isOpen || !selectedPatientId) return;
    setIsLoadingSessions(true);
    hospitalApi.getUnbilledTherapySessions(selectedPatientId)
      .then((sessions) => {
        setUnbilledSessions(sessions || []);
        // By default select all unbilled sessions that have a valid billableAmount
        const validIds = (sessions || []).filter((s) => s.billableAmount && s.billableAmount > 0).map((s) => s.id);
        setSelectedSessionIds(validIds);
      })
      .catch((err) => {
        console.warn('Could not load unbilled sessions:', err);
        setUnbilledSessions([]);
      })
      .finally(() => setIsLoadingSessions(false));
  }, [isOpen, selectedPatientId]);

  const selectedSessions = unbilledSessions.filter((s) => selectedSessionIds.includes(s.id));
  const therapySessionsTotal = selectedSessions.reduce((acc, s) => acc + (s.billableAmount || 0), 0);

  const bedCharge = bedDailyRate > 0 ? bedDays * bedDailyRate : 0;
  const subtotal = bedCharge + physicianFee + pharmacyTotal + labTotal + therapySessionsTotal;
  const totalPayable = subtotal;

  const toggleSessionSelection = (sessionId: string) => {
    setSelectedSessionIds((prev) =>
      prev.includes(sessionId) ? prev.filter((id) => id !== sessionId) : [...prev, sessionId]
    );
  };

  const handleSubmit = () => {
    if (!patient) return;
    setErrorMessage(null);

    const items: BillItem[] = [];

    // Phase 7: Add completed therapy session items
    for (const s of selectedSessions) {
      if (!s.billableAmount || s.billableAmount <= 0) {
        setErrorMessage(`Cannot bill session for ${s.therapyType}: Tariff unconfigured or invalid.`);
        return;
      }
      items.push({
        id: `bi-session-${s.id}`,
        therapySessionId: s.id,
        tariffId: s.tariffId || undefined,
        description: `Ayurvedic Therapy: ${s.therapyType} (Session ${s.sessionNumber || 1}) - ${s.roomNameSnapshot || 'Therapy Suite'}`,
        category: 'Treatment',
        quantity: 1,
        unitPrice: s.billableAmount,
        total: s.billableAmount
      });
    }

    if (bedDays > 0) {
      if (bedDailyRate <= 0) {
        setErrorMessage('Cannot bill ward accommodation: Hospital bed tariff is unconfigured. Authorized administration rate required.');
        return;
      }
      items.push({
        id: `bi-${Date.now()}-1`,
        description: `Inpatient Ward Room Care (${patient.currentWard || 'General'}) - ${bedDays} Days`,
        category: 'Bed/Room',
        quantity: bedDays,
        unitPrice: bedDailyRate,
        total: bedCharge
      });
    }

    if (physicianFee > 0) {
      items.push({
        id: `bi-${Date.now()}-2`,
        description: 'Attending Physician Daily Rounding & Specialist Care',
        category: 'Physician Fee',
        quantity: 1,
        unitPrice: physicianFee,
        total: physicianFee
      });
    }

    if (pharmacyTotal > 0) {
      items.push({
        id: `bi-${Date.now()}-3`,
        description: 'Hospital Pharmacy Dispensed Medications & Formulations',
        category: 'Pharmacy',
        quantity: 1,
        unitPrice: pharmacyTotal,
        total: pharmacyTotal
      });
    }

    if (labTotal > 0) {
      items.push({
        id: `bi-${Date.now()}-4`,
        description: 'Diagnostic Pathology & Clinical Lab Assessments',
        category: 'Laboratory',
        quantity: 1,
        unitPrice: labTotal,
        total: labTotal
      });
    }

    if (items.length === 0 || totalPayable <= 0) {
      setErrorMessage('At least one service line item with an authorized tariff is required to issue an invoice.');
      return;
    }

    const newInvoice: Partial<BillInvoice> = {
      patientId: patient.id,
      patientName: `${patient.firstName} ${patient.lastName}`,
      mrn: patient.mrn,
      admissionDate: patient.admissionDate || new Date().toISOString(),
      dischargeDate: new Date().toISOString(),
      items,
      subtotal,
      insuranceCovered: 0,
      copayPatient: totalPayable,
      totalAmount: totalPayable,
      paymentStatus
    };

    onSubmit(newInvoice);
    onClose();
  };

  return (
    <CarbonModal
      isOpen={isOpen}
      onClose={onClose}
      title="Generate Hospital Invoice"
      label="Patient Financial Services & Direct Settlement"
      primaryButtonText="Finalize & Issue Invoice"
      secondaryButtonText="Cancel"
      onRequestSubmit={handleSubmit}
      size="lg"
    >
      <div className="space-y-4">
        {errorMessage && (
          <div className="p-3 bg-[#fff1f1] border-l-4 border-l-[#da1e28] border border-[#ffd7d9] text-xs text-[#da1e28]">
            <strong>Billing Blocked:</strong> {errorMessage}
          </div>
        )}

        {/* Notice of Tariff Configuration Policy */}
        <div className="p-3 bg-[#edf5ff] border-l-4 border-l-[#0f62fe] border border-[#a6c8ff] text-xs text-[#0043ce]">
          <strong>Tariff Schedule Policy:</strong> Sahachara Clinic operates on transparent direct settlement. Unconfigured accommodation charges cannot be billed until officially established by hospital administration.
        </div>

        <div>
          <label className="block text-xs font-semibold text-[#161616] mb-1">
            Select Patient Record *
          </label>
          <select
            value={selectedPatientId}
            onChange={(e) => setSelectedPatientId(e.target.value)}
            className="w-full carbon-input"
          >
            {patients.map((p) => (
              <option key={p.id} value={p.id}>
                {p.mrn} — {p.firstName} {p.lastName} ({p.admissionStatus.toUpperCase()})
              </option>
            ))}
          </select>
        </div>

        {/* Phase 7: Unbilled Completed Therapy Sessions */}
        <div className="p-3 bg-[#f4f4f4] border border-[#e0e0e0] space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#161616]">
              Ayurvedic Therapy Sessions (Ambulatory / Completed)
            </span>
            <span className="text-[10px] font-mono text-[#0f62fe]">
              {isLoadingSessions ? 'Loading...' : `${unbilledSessions.length} Unbilled Sessions`}
            </span>
          </div>

          {unbilledSessions.length === 0 ? (
            <div className="text-[11px] text-[#525252] italic bg-white p-2 border border-[#e0e0e0]">
              No unbilled completed therapy sessions found for this patient.
            </div>
          ) : (
            <div className="space-y-1.5 max-h-36 overflow-y-auto">
              {unbilledSessions.map((session) => {
                const isSelected = selectedSessionIds.includes(session.id);
                const hasValidPrice = session.billableAmount && session.billableAmount > 0;
                return (
                  <label
                    key={session.id}
                    className={`flex items-center justify-between p-2 text-xs border cursor-pointer transition-colors ${
                      isSelected ? 'bg-white border-[#0f62fe]' : 'bg-[#f4f4f4] border-[#e0e0e0]'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        disabled={!hasValidPrice}
                        onChange={() => toggleSessionSelection(session.id)}
                        className="rounded-none text-[#0f62fe]"
                      />
                      <div>
                        <span className="font-medium text-[#161616]">{session.therapyType}</span>{' '}
                        <span className="text-[10px] font-mono text-[#525252]">
                          ({session.sessionNumber ? `Session ${session.sessionNumber}` : 'Procedure'} &bull; {session.roomCodeSnapshot || 'Room'})
                        </span>
                        {!hasValidPrice && (
                          <span className="text-[10px] text-[#da1e28] block font-mono">
                            Tariff unconfigured (NULL) — Cannot invoice
                          </span>
                        )}
                      </div>
                    </div>
                    <span className="font-mono font-medium text-[#161616]">
                      {hasValidPrice ? `₹${session.billableAmount}` : 'Unpriced'}
                    </span>
                  </label>
                );
              })}
            </div>
          )}
          {therapySessionsTotal > 0 && (
            <div className="flex justify-between text-xs font-mono text-[#0f62fe] pt-1 border-t border-[#e0e0e0]">
              <span>Selected Therapy Charges:</span>
              <span className="font-bold">₹{therapySessionsTotal.toLocaleString()}</span>
            </div>
          )}
        </div>

        {/* Itemized Line Items inputs */}
        <div className="p-3 bg-[#f4f4f4] border border-[#e0e0e0] space-y-3">
          <div className="text-xs font-semibold text-[#161616]">
            Itemized Clinical Charges (₹)
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] text-[#525252] mb-1">
                Ward Stay (Days) &bull; Daily Rate (₹)
              </label>
              <div className="flex gap-2">
                <input
                  type="number"
                  min="0"
                  value={bedDays}
                  onChange={(e) => setBedDays(Number(e.target.value))}
                  className="w-1/3 bg-white border border-[#c6c6c6] h-8 px-2 text-xs font-mono"
                  placeholder="Days"
                />
                <input
                  type="number"
                  value={bedDailyRate}
                  onChange={(e) => setBedDailyRate(Number(e.target.value))}
                  className="w-2/3 bg-white border border-[#c6c6c6] h-8 px-2 text-xs font-mono"
                  placeholder="Daily Rate (₹)"
                />
              </div>
              {bedDays > 0 && bedDailyRate <= 0 && (
                <span className="text-[10px] text-[#da1e28] mt-0.5 block font-medium">
                  Rate Unconfigured — Bed tariffs not established by hospital.
                </span>
              )}
            </div>

            <div>
              <label className="block text-[11px] text-[#525252] mb-1">
                Attending Physician & Specialist Consultations (₹)
              </label>
              <input
                type="number"
                value={physicianFee}
                onChange={(e) => setPhysicianFee(Number(e.target.value))}
                className="w-full bg-white border border-[#c6c6c6] h-8 px-2 text-xs font-mono"
              />
            </div>

            <div>
              <label className="block text-[11px] text-[#525252] mb-1">
                Ayurvedic Pharmacy & Formulations (₹)
              </label>
              <input
                type="number"
                value={pharmacyTotal}
                onChange={(e) => setPharmacyTotal(Number(e.target.value))}
                className="w-full bg-white border border-[#c6c6c6] h-8 px-2 text-xs font-mono"
              />
            </div>

            <div>
              <label className="block text-[11px] text-[#525252] mb-1">
                Diagnostic Laboratory & Investigations (₹)
              </label>
              <input
                type="number"
                value={labTotal}
                onChange={(e) => setLabTotal(Number(e.target.value))}
                className="w-full bg-white border border-[#c6c6c6] h-8 px-2 text-xs font-mono"
              />
            </div>
          </div>
        </div>

        {/* Payment Terms & Method */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-[#161616] mb-1">
              Payment Settlement Method
            </label>
            <select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value as any)}
              className="w-full carbon-input"
            >
              <option value="UPI">UPI / Digital Payment</option>
              <option value="Cash">Cash at Hospital Cashier</option>
              <option value="Card">Debit / Credit Card (POS Terminal)</option>
              <option value="Bank Transfer">NEFT / RTGS Bank Transfer</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#161616] mb-1">
              Payment Clearance Status
            </label>
            <select
              value={paymentStatus}
              onChange={(e) => setPaymentStatus(e.target.value as any)}
              className="w-full carbon-input"
            >
              <option value="unpaid">Payment Due / Pending Clearance</option>
              <option value="partial">Partial Payment Received</option>
              <option value="paid">Paid & Cleared for Discharge</option>
            </select>
          </div>
        </div>

        {/* Financial Summary Card */}
        <div className="p-4 bg-[#f4f4f4] border border-[#e0e0e0] font-mono text-xs space-y-2">
          {therapySessionsTotal > 0 && (
            <div className="flex justify-between text-[#0f62fe]">
              <span>Ayurvedic Therapy Sessions ({selectedSessions.length} billed):</span>
              <span className="tabular-nums font-bold">₹{therapySessionsTotal.toLocaleString()}</span>
            </div>
          )}
          <div className="flex justify-between text-[#525252]">
            <span>Inpatient Stay ({bedDays} Days @ ₹{bedDailyRate}/day):</span>
            <span className="tabular-nums">₹{bedCharge.toLocaleString()}</span>
          </div>
          <div className="flex justify-between text-[#525252]">
            <span>Professional Services & Therapy:</span>
            <span className="tabular-nums">₹{(physicianFee + pharmacyTotal + labTotal).toLocaleString()}</span>
          </div>
          <div className="border-t border-[#c6c6c6] pt-2 flex justify-between text-[#161616] font-bold text-sm">
            <span>Total Patient Balance Due:</span>
            <span className="text-[#0f62fe] tabular-nums">₹{totalPayable.toLocaleString()}</span>
          </div>
        </div>
      </div>
    </CarbonModal>
  );
};
