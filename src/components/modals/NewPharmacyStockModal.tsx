import React, { useState } from 'react';
import { Package, Sparkles } from 'lucide-react';
import { CarbonModal } from '../carbon/CarbonModal';
import { MedicationStock } from '../../types/hospital';

interface NewPharmacyStockModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (stockData: Partial<MedicationStock>) => void;
}

const PRESET_FORMULATIONS = [
  {
    name: 'Sahacharadi Thailam',
    generic: 'Strobilanthes ciliatus & Sesame oil extract',
    category: 'Ayurvedic Oil / Thailam',
    form: 'Oil / Liquid',
    unit: 'bottles',
    minThreshold: 25
  },
  {
    name: 'Ashwagandharishta',
    generic: 'Withania somnifera fermented tonic',
    category: 'Arishta & Asava (Fermented Infusions)',
    form: 'Syrup',
    unit: 'bottles',
    minThreshold: 30
  },
  {
    name: 'Triphala Churna',
    generic: 'Haritaki, Bibhitaki & Amalaki micronized powder',
    category: 'Churna (Herbal Powder)',
    form: 'Powder',
    unit: 'jars',
    minThreshold: 20
  },
  {
    name: 'Ksheerabala 101 Avarthi',
    generic: 'Sida cordifolia & Cow milk high-potency oil drops',
    category: 'Ayurvedic Oil / Thailam',
    form: 'Oil / Liquid',
    unit: 'vials',
    minThreshold: 15
  },
  {
    name: 'Guduchyadi Kashayam',
    generic: 'Tinospora cordifolia concentrated decoction',
    category: 'Kashayam & Kwatha (Decoctions)',
    form: 'Syrup',
    unit: 'bottles',
    minThreshold: 20
  },
  {
    name: 'Brahmi Vati Gold',
    generic: 'Bacopa monnieri & Suvarna Bhasma memory enhancer',
    category: 'Vati & Gutika (Tablets/Pills)',
    form: 'Tablet',
    unit: 'tablets',
    minThreshold: 50
  }
];

export const NewPharmacyStockModal: React.FC<NewPharmacyStockModalProps> = ({
  isOpen,
  onClose,
  onSubmit
}) => {
  const [drugName, setDrugName] = useState('');
  const [genericName, setGenericName] = useState('');
  const [category, setCategory] = useState('Ayurvedic Oil / Thailam');
  const [form, setForm] = useState('Oil / Liquid');
  const [stockQuantity, setStockQuantity] = useState('100');
  const [unit, setUnit] = useState('bottles');
  const [minThreshold, setMinThreshold] = useState('25');
  const [batchNumber, setBatchNumber] = useState(`AY-${new Date().getFullYear()}-B${Math.floor(100 + Math.random() * 900)}`);
  const [expiryDate, setExpiryDate] = useState('2028-12-31');
  const [unitPrice, setUnitPrice] = useState('');
  const [rackLocation, setRackLocation] = useState('Central Pharmacy Rack A-01');
  const [errorMsg, setErrorMsg] = useState('');

  const applyPreset = (preset: typeof PRESET_FORMULATIONS[0]) => {
    setDrugName(preset.name);
    setGenericName(preset.generic);
    setCategory(preset.category);
    setForm(preset.form);
    setUnit(preset.unit);
    setUnitPrice('');
    setMinThreshold(String(preset.minThreshold));
    setErrorMsg('');
  };

  const handleSubmit = () => {
    if (!drugName.trim()) {
      setErrorMsg('Formulation / Drug Name is required.');
      return;
    }
    const qty = Number(stockQuantity);
    if (isNaN(qty) || qty < 0) {
      setErrorMsg('Stock quantity must be a valid non-negative number.');
      return;
    }
    const price = unitPrice.trim() !== '' ? Number(unitPrice) : null;
    if (price !== null && (isNaN(price) || price < 0)) {
      setErrorMsg('Unit price must be a valid non-negative number if entered, or left blank if unconfigured.');
      return;
    }

    const payload: Partial<MedicationStock> = {
      drugName: drugName.trim(),
      genericName: genericName.trim() || 'Classical Ayurvedic Herb Formulation',
      category,
      form: form as any,
      stockQuantity: qty,
      unit: unit.trim() || 'units',
      minThreshold: Number(minThreshold) || 20,
      batchNumber: batchNumber.trim() || `AY-${Date.now().toString().slice(-6)}`,
      expiryDate: expiryDate || '2028-12-31',
      unitPrice: price
    };

    onSubmit(payload);
    onClose();
  };

  return (
    <CarbonModal
      isOpen={isOpen}
      onClose={onClose}
      title="Add Pharmacy Inventory Stock"
      label="Central Hospital Formulary"
      subtitle="Register new batch receipts, classical oils, churnas, arishtas, and therapeutic medications."
      primaryButtonText="Add to Stock Inventory"
      secondaryButtonText="Cancel"
      onRequestSubmit={handleSubmit}
      size="lg"
    >
      <div className="space-y-4">
        {/* Quick autofill presets */}
        <div>
          <div className="flex items-center gap-1.5 text-xs font-semibold text-[#525252] uppercase tracking-wider mb-1.5">
            <Sparkles className="w-3.5 h-3.5 text-[#0f62fe]" />
            <span>Quick Autofill Standard Ayurvedic Formulations</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {PRESET_FORMULATIONS.map((preset) => (
              <button
                key={preset.name}
                type="button"
                onClick={() => applyPreset(preset)}
                className="px-2.5 py-1 text-xs bg-[#f4f4f4] hover:bg-[#e0e0e0] border border-[#c6c6c6] text-[#161616] cursor-pointer transition-colors text-left"
              >
                + {preset.name}
              </button>
            ))}
          </div>
        </div>

        {errorMsg && (
          <div className="p-2.5 bg-[#fff1f1] border-l-2 border-[#da1e28] text-xs text-[#a2191f]">
            {errorMsg}
          </div>
        )}

        {/* Row 1: Medicine Name & Generic */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="carbon-label">
              Medication / Formulation Name *
            </label>
            <input
              type="text"
              required
              value={drugName}
              onChange={(e) => {
                setDrugName(e.target.value);
                if (errorMsg) setErrorMsg('');
              }}
              placeholder="e.g. Sahacharadi Thailam"
              className="w-full carbon-input"
            />
          </div>

          <div>
            <label className="carbon-label">
              Botanical / Generic Formulation
            </label>
            <input
              type="text"
              value={genericName}
              onChange={(e) => setGenericName(e.target.value)}
              placeholder="e.g. Strobilanthes ciliatus & sesame oil"
              className="w-full carbon-input"
            />
          </div>
        </div>

        {/* Row 2: Category & Dosage Form */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="carbon-label">
              Formulary Category *
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full carbon-input"
            >
              <option value="Ayurvedic Oil / Thailam">Ayurvedic Oil / Thailam (External/Internal)</option>
              <option value="Arishta & Asava (Fermented Infusions)">Arishta & Asava (Fermented Herbal Tonics)</option>
              <option value="Churna (Herbal Powder)">Churna (Herbal Micronized Powder)</option>
              <option value="Vati & Gutika (Tablets/Pills)">Vati & Gutika (Classical Compressed Tablets)</option>
              <option value="Kashayam & Kwatha (Decoctions)">Kashayam & Kwatha (Decoctions/Extracts)</option>
              <option value="Ghrita (Medicated Ghee)">Ghrita (Medicated Cow Ghee Preparations)</option>
              <option value="Capsule / Modern Formulation">Capsule / Standardized Extract</option>
              <option value="Allopathic & Emergency OTC">Allopathic & Emergency Inpatient Supply</option>
            </select>
          </div>

          <div>
            <label className="carbon-label">
              Dosage Form *
            </label>
            <select
              value={form}
              onChange={(e) => setForm(e.target.value)}
              className="w-full carbon-input"
            >
              <option value="Oil / Liquid">Oil / Medicated Liquid</option>
              <option value="Syrup">Syrup / Arishta Liquid</option>
              <option value="Tablet">Tablet / Vati</option>
              <option value="Powder">Powder / Churna</option>
              <option value="Capsule">Capsule</option>
              <option value="Injection">Injection / Ampoule</option>
              <option value="IV Bag">IV Bag / Infusion</option>
              <option value="Inhaler">Inhaler / Nasal Dhoomapana</option>
            </select>
          </div>
        </div>

        {/* Row 3: Stock Quantity, Unit, Min Threshold */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="carbon-label">
              Initial Stock Units *
            </label>
            <input
              type="number"
              min="0"
              required
              value={stockQuantity}
              onChange={(e) => setStockQuantity(e.target.value)}
              className="w-full carbon-input font-mono"
            />
          </div>

          <div>
            <label className="carbon-label">
              Unit of Measurement *
            </label>
            <select
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              className="w-full carbon-input"
            >
              <option value="bottles">bottles</option>
              <option value="vials">vials</option>
              <option value="jars">jars</option>
              <option value="tablets">tablets</option>
              <option value="strips">strips</option>
              <option value="grams">grams</option>
              <option value="ml">ml</option>
              <option value="ampoules">ampoules</option>
              <option value="pouches">pouches</option>
            </select>
          </div>

          <div>
            <label className="carbon-label">
              Min Reorder Level *
            </label>
            <input
              type="number"
              min="1"
              required
              value={minThreshold}
              onChange={(e) => setMinThreshold(e.target.value)}
              className="w-full carbon-input font-mono"
            />
          </div>
        </div>

        {/* Row 4: Batch Number, Expiry Date, Unit Price */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="carbon-label">
              Batch / Lot Number *
            </label>
            <input
              type="text"
              required
              value={batchNumber}
              onChange={(e) => setBatchNumber(e.target.value)}
              className="w-full carbon-input font-mono"
            />
          </div>

          <div>
            <label className="carbon-label">
              Batch Expiry Date *
            </label>
            <input
              type="date"
              required
              value={expiryDate}
              onChange={(e) => setExpiryDate(e.target.value)}
              className="w-full carbon-input font-mono"
            />
          </div>

          <div>
            <label className="carbon-label">
              Selling Price / Unit (₹) (Optional)
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder="Unconfigured"
              value={unitPrice}
              onChange={(e) => setUnitPrice(e.target.value)}
              className="w-full carbon-input font-mono"
            />
          </div>
        </div>

        {/* Storage location */}
        <div>
          <label className="carbon-label">
            Pharmacy Storage Rack / Shelf Location
          </label>
          <input
            type="text"
            value={rackLocation}
            onChange={(e) => setRackLocation(e.target.value)}
            placeholder="e.g. Rack A-03 (Ayurvedic Thailam Section)"
            className="w-full carbon-input"
          />
        </div>
      </div>
    </CarbonModal>
  );
};
