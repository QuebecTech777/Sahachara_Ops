import React, { useState, useMemo } from 'react';
import { Pill, AlertTriangle, AlertCircle, CheckCircle, Clock, ShieldCheck } from 'lucide-react';
import { CarbonModal } from '../carbon/CarbonModal';
import { CarbonTag } from '../carbon/CarbonTag';
import { Prescription, MedicationStock, UserRole } from '../../types/hospital';

interface DispenseMedicationModalProps {
  isOpen: boolean;
  onClose: () => void;
  prescription: Prescription | null;
  medicationStock: MedicationStock[];
  currentUserName?: string;
  currentUserRole?: UserRole;
  onConfirmDispense: (rxId: string, options: {
    quantityToDispense: number;
    stockId?: string;
    pharmacyNotes?: string;
  }) => Promise<void>;
}

export const DispenseMedicationModal: React.FC<DispenseMedicationModalProps> = ({
  isOpen,
  onClose,
  prescription,
  medicationStock,
  currentUserName = 'Pharm. Katherine Brooks, RPh',
  currentUserRole = 'PHARMACIST',
  onConfirmDispense
}) => {
  const [quantityToDispense, setQuantityToDispense] = useState<number>(1);
  const [selectedStockId, setSelectedStockId] = useState<string>('auto_fefo');
  const [pharmacyNotes, setPharmacyNotes] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');

  // Total prescribed, already dispensed, remaining
  const prescribedTotal = prescription?.quantity || 1;
  const alreadyDispensed = prescription?.dispensedQuantity || 0;
  const remainingQuantity = Math.max(0, prescription?.remainingQuantity !== undefined ? prescription.remainingQuantity : (prescribedTotal - alreadyDispensed));

  // Reset state when prescription changes
  React.useEffect(() => {
    if (prescription) {
      setQuantityToDispense(remainingQuantity > 0 ? remainingQuantity : 1);
      setSelectedStockId('auto_fefo');
      setPharmacyNotes('');
      setErrorMsg('');
      setIsSubmitting(false);
    }
  }, [prescription, remainingQuantity]);

  // Find candidate batches for this medication
  const candidateBatches = useMemo(() => {
    if (!prescription) return [];
    const medLower = prescription.medicationName.toLowerCase();
    const now = Date.now();

    return medicationStock
      .filter((s) => s.drugName.toLowerCase().includes(medLower) && s.stockQuantity > 0)
      .map((s) => {
        let expDate: Date;
        if (/^\d{4}-\d{2}$/.test(s.expiryDate)) {
          const [year, month] = s.expiryDate.split('-').map(Number);
          expDate = new Date(year, month, 0, 23, 59, 59);
        } else {
          expDate = new Date(s.expiryDate);
          expDate.setHours(23, 59, 59);
        }
        const isExpired = !isNaN(expDate.getTime()) && expDate.getTime() < now;
        return {
          ...s,
          isExpired,
          expTimestamp: expDate.getTime()
        };
      })
      .sort((a, b) => a.expTimestamp - b.expTimestamp); // FEFO sorting
  }, [prescription, medicationStock]);

  if (!isOpen || !prescription) return null;

  const isPharmacist = currentUserRole === 'PHARMACIST' || currentUserRole === 'SUPER_ADMIN';
  const selectedBatch = candidateBatches.find((b) => b.id === selectedStockId);
  const isSelectedBatchExpired = selectedBatch?.isExpired || false;

  const handleSubmit = async () => {
    setErrorMsg('');

    if (!isPharmacist) {
      setErrorMsg('Unauthorized: Only authorized PHARMACIST accounts may dispense medications.');
      return;
    }

    if (quantityToDispense <= 0) {
      setErrorMsg('Dispensing quantity must be at least 1 unit.');
      return;
    }

    if (quantityToDispense > remainingQuantity) {
      setErrorMsg(`Cannot dispense ${quantityToDispense} units. Only ${remainingQuantity} remaining of prescribed ${prescribedTotal}.`);
      return;
    }

    if (selectedStockId !== 'auto_fefo' && isSelectedBatchExpired) {
      setErrorMsg('Cannot dispense from an expired medication batch.');
      return;
    }

    if (selectedBatch && selectedBatch.stockQuantity < quantityToDispense) {
      setErrorMsg(`Insufficient stock in batch ${selectedBatch.batchNumber} (available: ${selectedBatch.stockQuantity}).`);
      return;
    }

    try {
      setIsSubmitting(true);
      await onConfirmDispense(prescription.id, {
        quantityToDispense,
        stockId: selectedStockId === 'auto_fefo' ? undefined : selectedStockId,
        pharmacyNotes: pharmacyNotes.trim() || undefined
      });
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Dispensing failed. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <CarbonModal
      isOpen={isOpen}
      onClose={onClose}
      title="Dispense Medication Order"
      label="Pharmacy & Formulary Operations"
      subtitle={`Prescription: ${prescription.rxNumber} • Patient: ${prescription.patientName} (${prescription.mrn})`}
      primaryButtonText={isSubmitting ? 'Dispensing...' : 'Confirm & Dispense'}
      secondaryButtonText="Cancel"
      onRequestSubmit={handleSubmit}
      primaryButtonDisabled={
        isSubmitting ||
        !isPharmacist ||
        quantityToDispense <= 0 ||
        quantityToDispense > remainingQuantity ||
        (selectedStockId !== 'auto_fefo' && isSelectedBatchExpired)
      }
      size="lg"
    >
      <div className="space-y-4 font-sans text-xs">
        {/* Error notification */}
        {errorMsg && (
          <div className="p-3 bg-[#fff1f1] border-l-4 border-[#da1e28] text-[#da1e28] flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold text-xs">Dispensing Blocked</div>
              <div className="text-[11px]">{errorMsg}</div>
            </div>
          </div>
        )}

        {/* Clinical Authority Guard */}
        {!isPharmacist && (
          <div className="p-3 bg-[#fef3d6] border-l-4 border-[#f1c21b] text-[#8a3800] flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold text-xs">Restricted Authority</div>
              <div className="text-[11px]">
                You are currently signed in as <strong>{currentUserRole}</strong>. Medication dispensing is restricted to licensed Pharmacists.
              </div>
            </div>
          </div>
        )}

        {/* Prescription Summary Card */}
        <div className="p-3 bg-[#f4f4f4] border border-[#e0e0e0] grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <div className="text-[10px] text-[#525252] uppercase font-mono">Medication</div>
            <div className="font-semibold text-[#161616] text-xs mt-0.5 flex items-center gap-1">
              <Pill className="w-3.5 h-3.5 text-[#0f62fe]" />
              {prescription.medicationName}
            </div>
          </div>
          <div>
            <div className="text-[10px] text-[#525252] uppercase font-mono">Dosage & Frequency</div>
            <div className="font-semibold text-[#161616] text-xs mt-0.5">
              {prescription.dosage} • {prescription.frequency}
            </div>
          </div>
          <div>
            <div className="text-[10px] text-[#525252] uppercase font-mono">Route & Duration</div>
            <div className="font-semibold text-[#161616] text-xs mt-0.5">
              {prescription.route} • {prescription.duration}
            </div>
          </div>
          <div>
            <div className="text-[10px] text-[#525252] uppercase font-mono">Prescribed By</div>
            <div className="font-semibold text-[#161616] text-xs mt-0.5">
              {prescription.doctorName}
            </div>
          </div>
        </div>

        {/* Partial Dispensing Progress */}
        <div className="p-3 bg-white border border-[#e0e0e0] flex items-center justify-between">
          <div>
            <div className="text-[10px] text-[#525252] uppercase font-mono">Prescription Fulfillment Progress</div>
            <div className="flex items-center gap-2 mt-1">
              <span className="font-bold text-[#161616] text-sm font-mono">
                {alreadyDispensed} of {prescribedTotal} Units Dispensed
              </span>
              <CarbonTag type={remainingQuantity === 0 ? 'green' : alreadyDispensed > 0 ? 'teal' : 'warm-gray'}>
                {remainingQuantity === 0 ? 'FULLY DISPENSED' : alreadyDispensed > 0 ? 'PARTIALLY DISPENSED' : 'PENDING'}
              </CarbonTag>
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] text-[#525252] uppercase font-mono">Remaining To Dispense</div>
            <div className="font-mono text-base font-bold text-[#0f62fe]">{remainingQuantity} Units</div>
          </div>
        </div>

        {/* Dispense Form Inputs */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Quantity to Dispense */}
          <div>
            <label className="block text-xs font-semibold text-[#161616] mb-1 font-mono">
              Quantity to Dispense (Units) *
            </label>
            <input
              type="number"
              min={1}
              max={remainingQuantity}
              value={quantityToDispense}
              onChange={(e) => setQuantityToDispense(Math.max(1, parseInt(e.target.value) || 1))}
              className="w-full h-10 px-3 border border-[#8d8d8d] bg-white text-xs font-mono focus:outline-2 focus:outline-[#0f62fe]"
              disabled={!isPharmacist || remainingQuantity <= 0}
            />
            <p className="text-[10px] text-[#525252] mt-1">
              Maximum allowable for this dispense: {remainingQuantity} units.
            </p>
          </div>

          {/* Batch Allocation Selection */}
          <div>
            <label className="block text-xs font-semibold text-[#161616] mb-1 font-mono">
              Inventory Batch Allocation (FEFO) *
            </label>
            <select
              value={selectedStockId}
              onChange={(e) => setSelectedStockId(e.target.value)}
              className="w-full h-10 px-3 border border-[#8d8d8d] bg-white text-xs font-mono focus:outline-2 focus:outline-[#0f62fe]"
              disabled={!isPharmacist || candidateBatches.length === 0}
            >
              <option value="auto_fefo">
                ✨ Auto-FEFO (Earliest Expiring Non-Expired Batch)
              </option>
              {candidateBatches.map((b, idx) => (
                <option key={b.id} value={b.id}>
                  Batch {b.batchNumber} (Exp: {b.expiryDate}) — Stock: {b.stockQuantity} {b.unit} {b.isExpired ? '⚠️ [EXPIRED]' : idx === 0 ? '⭐ [Earliest Expiry]' : ''}
                </option>
              ))}
            </select>
            <p className="text-[10px] text-[#525252] mt-1">
              Follows First-Expiry, First-Out (FEFO) policy. Expired batches are prohibited.
            </p>
          </div>
        </div>

        {/* Selected Batch Details & Expiry Indicator */}
        {selectedStockId !== 'auto_fefo' && selectedBatch && (
          <div className={`p-2.5 border ${selectedBatch.isExpired ? 'bg-[#fff1f1] border-[#da1e28]' : 'bg-[#edf5ff] border-[#0f62fe]'} text-xs font-mono flex items-center justify-between`}>
            <div>
              <span className="font-semibold">Selected Batch:</span> {selectedBatch.batchNumber} • Stock: {selectedBatch.stockQuantity} {selectedBatch.unit}
            </div>
            <div>
              {selectedBatch.isExpired ? (
                <span className="text-[#da1e28] font-bold flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5" /> EXPIRED: {selectedBatch.expiryDate}
                </span>
              ) : (
                <span className="text-[#0043ce] flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" /> Expiry: {selectedBatch.expiryDate}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Pharmacy Notes */}
        <div>
          <label className="block text-xs font-semibold text-[#161616] mb-1 font-mono">
            Pharmacist Dispensing Notes & Instructions (Optional)
          </label>
          <textarea
            rows={2}
            value={pharmacyNotes}
            onChange={(e) => setPharmacyNotes(e.target.value)}
            placeholder="Add dispensing advisory, batch notes, or patient counseling remarks..."
            className="w-full p-2.5 border border-[#8d8d8d] bg-white text-xs font-sans focus:outline-2 focus:outline-[#0f62fe]"
            disabled={!isPharmacist}
          />
        </div>

        {/* Pharmacist Attribution Banner */}
        <div className="p-2.5 bg-[#f4f4f4] border border-[#e0e0e0] flex items-center justify-between text-[11px] text-[#525252]">
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-[#0043ce]" />
            <span>Dispensing Pharmacist Attribution: <strong className="text-[#161616]">{currentUserName}</strong></span>
          </div>
          <div className="font-mono text-[10px]">
            Atomic Ledger & Stock Movement
          </div>
        </div>
      </div>
    </CarbonModal>
  );
};

