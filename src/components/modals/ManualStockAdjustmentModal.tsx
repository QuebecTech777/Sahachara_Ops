import React, { useState } from 'react';
import { X, Sliders, AlertTriangle, CheckCircle, Package } from 'lucide-react';
import { CarbonButton } from '../carbon/CarbonButton';
import { MedicationStock, StockMovement } from '../../types/hospital';

interface ManualStockAdjustmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  medicationStock: MedicationStock[];
  initialMedicationId?: string;
  currentUserName?: string;
  onConfirmAdjustment: (adjustment: {
    medicineId: string;
    medicineName: string;
    batchNumber: string;
    type: StockMovement['type'];
    quantityDelta: number;
    remainingQuantity: number;
    notes: string;
  }) => void;
}

export const ManualStockAdjustmentModal: React.FC<ManualStockAdjustmentModalProps> = ({
  isOpen,
  onClose,
  medicationStock,
  initialMedicationId,
  currentUserName = 'Chief Pharmacist',
  onConfirmAdjustment
}) => {
  const [selectedMedId, setSelectedMedId] = useState<string>(
    initialMedicationId || (medicationStock[0]?.id ?? '')
  );
  const [movementType, setMovementType] = useState<StockMovement['type']>('Audit Adjustment');
  const [adjustmentDirection, setAdjustmentDirection] = useState<'add' | 'subtract'>('add');
  const [quantity, setQuantity] = useState<number>(10);
  const [notes, setNotes] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const selectedMed = medicationStock.find((m) => m.id === selectedMedId) || medicationStock[0];
  const delta = adjustmentDirection === 'add' ? Math.abs(quantity) : -Math.abs(quantity);
  const currentQty = selectedMed?.stockQuantity ?? 0;
  const projectedQty = Math.max(0, currentQty + delta);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMed) {
      setError('Please select a valid medication.');
      return;
    }
    if (!quantity || quantity <= 0) {
      setError('Adjustment quantity must be greater than zero.');
      return;
    }
    if (adjustmentDirection === 'subtract' && quantity > currentQty) {
      setError(`Cannot subtract ${quantity} units: current stock is only ${currentQty} ${selectedMed.unit}.`);
      return;
    }
    if (!notes.trim()) {
      setError('Please provide an accountability reason / notes for this manual stock adjustment.');
      return;
    }

    onConfirmAdjustment({
      medicineId: selectedMed.id,
      medicineName: selectedMed.drugName,
      batchNumber: selectedMed.batchNumber,
      type: movementType,
      quantityDelta: delta,
      remainingQuantity: projectedQty,
      notes: notes.trim()
    });

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-2xs p-4 animate-in fade-in duration-150">
      <div className="bg-white border border-[#393939] shadow-2xl w-full max-w-lg font-sans overflow-hidden">
        {/* Header */}
        <div className="p-4 bg-[#161616] text-white flex items-center justify-between border-b border-[#393939]">
          <div className="flex items-center gap-2">
            <Sliders className="w-4 h-4 text-[#0f62fe]" />
            <div>
              <h3 className="font-semibold text-sm tracking-tight text-white">
                Manual Stock Level Adjustment
              </h3>
              <p className="text-[11px] text-[#8d8d8d]">
                21 CFR / HIPAA Trackable Inventory Movement
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-[#c6c6c6] hover:text-white hover:bg-[#262626] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs">
          {error && (
            <div className="p-3 bg-[#fff1f1] border border-[#ffb3b8] text-[#a2191f] flex items-center gap-2 text-xs">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Select Medication */}
          <div>
            <label className="carbon-label block mb-1 font-semibold text-[#161616]">
              Target Pharmaceutical Item <span className="text-[#da1e28]">*</span>
            </label>
            <select
              value={selectedMedId}
              onChange={(e) => setSelectedMedId(e.target.value)}
              className="carbon-input w-full"
            >
              {medicationStock.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.drugName} (Batch: {m.batchNumber}) &bull; Current: {m.stockQuantity} {m.unit}
                </option>
              ))}
            </select>
          </div>

          {/* Movement Type */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="carbon-label block mb-1 font-semibold text-[#161616]">
                Movement Type <span className="text-[#da1e28]">*</span>
              </label>
              <select
                value={movementType}
                onChange={(e) => setMovementType(e.target.value as StockMovement['type'])}
                className="carbon-input w-full"
              >
                <option value="Audit Adjustment">Audit Adjustment (Cycle Count)</option>
                <option value="Purchase Receipt">Purchase Receipt (Stock Inflow)</option>
                <option value="Expiry Discard">Expiry Discard (Outdated Stock)</option>
                <option value="Dispensed to Patient">Dispensed to Patient (Direct)</option>
                <option value="Internal Transfer">Internal Transfer (Ward Requisition)</option>
              </select>
            </div>

            <div>
              <label className="carbon-label block mb-1 font-semibold text-[#161616]">
                Direction <span className="text-[#da1e28]">*</span>
              </label>
              <div className="flex h-10 border border-[#8d8d8d]">
                <button
                  type="button"
                  onClick={() => setAdjustmentDirection('add')}
                  className={`flex-1 text-xs font-semibold flex items-center justify-center transition-colors cursor-pointer ${
                    adjustmentDirection === 'add'
                      ? 'bg-[#24a148] text-white'
                      : 'bg-[#f4f4f4] text-[#525252] hover:bg-[#e0e0e0]'
                  }`}
                >
                  + Add Stock
                </button>
                <button
                  type="button"
                  onClick={() => setAdjustmentDirection('subtract')}
                  className={`flex-1 text-xs font-semibold flex items-center justify-center transition-colors cursor-pointer ${
                    adjustmentDirection === 'subtract'
                      ? 'bg-[#da1e28] text-white'
                      : 'bg-[#f4f4f4] text-[#525252] hover:bg-[#e0e0e0]'
                  }`}
                >
                  - Deduct Stock
                </button>
              </div>
            </div>
          </div>

          {/* Quantity Input and Projected Calculation */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="carbon-label block mb-1 font-semibold text-[#161616]">
                Adjustment Quantity <span className="text-[#da1e28]">*</span>
              </label>
              <input
                type="number"
                min={1}
                value={quantity}
                onChange={(e) => setQuantity(Number(e.target.value))}
                className="carbon-input w-full font-mono text-sm"
                placeholder="e.g. 25"
                required
              />
            </div>

            <div className="p-2.5 bg-[#f4f4f4] border border-[#e0e0e0] flex flex-col justify-center">
              <span className="text-[10px] uppercase font-mono text-[#525252]">Calculated Balance</span>
              <div className="flex items-center gap-1.5 font-mono text-xs mt-0.5">
                <span className="text-[#525252]">{currentQty}</span>
                <span className={delta >= 0 ? 'text-[#24a148] font-bold' : 'text-[#da1e28] font-bold'}>
                  {delta >= 0 ? `+${delta}` : delta}
                </span>
                <span>=</span>
                <strong className="text-[#161616] text-sm">{projectedQty} {selectedMed?.unit}</strong>
              </div>
            </div>
          </div>

          {/* Accountability Notes */}
          <div>
            <label className="carbon-label block mb-1 font-semibold text-[#161616]">
              Accountability Reason & Audit Justification <span className="text-[#da1e28]">*</span>
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="carbon-input w-full py-2 resize-none"
              placeholder="e.g., Physical cycle count identified 5 unit discrepancy; damaged container discarded during shelf inspection..."
              required
            />
          </div>

          {/* Footer Actions */}
          <div className="pt-3 border-t border-[#e0e0e0] flex items-center justify-between">
            <div className="text-[11px] text-[#525252]">
              Logged by: <strong className="text-[#161616]">{currentUserName}</strong>
            </div>
            <div className="flex items-center gap-2">
              <CarbonButton kind="secondary" size="md" onClick={onClose} type="button">
                Cancel
              </CarbonButton>
              <CarbonButton kind="primary" size="md" renderIcon={CheckCircle} type="submit">
                Commit Adjustment
              </CarbonButton>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
