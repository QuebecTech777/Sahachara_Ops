import React, { useState } from 'react';
import {
  Wind,
  Flame,
  Droplets,
  Activity,
  Edit,
  Save,
  X,
  AlertCircle,
  CheckCircle2,
  Calendar,
  Stethoscope,
  Sparkles,
  ArrowUpRight,
  TrendingUp,
  ShieldCheck
} from 'lucide-react';
import { Patient, DoshaProfile as DoshaProfileType, PrakritiType } from '../../types/hospital';
import { CarbonProgressBar } from '../carbon/CarbonProgressIndicator';
import { CarbonTag } from '../carbon/CarbonTag';
import { CarbonButton } from '../carbon/CarbonButton';

export interface DoshaProfileProps {
  patient: Patient;
  onUpdateDoshaProfile?: (updatedProfile: DoshaProfileType) => void;
  canEdit?: boolean;
  variant?: 'full' | 'compact';
}

export const DoshaProfile: React.FC<DoshaProfileProps> = ({
  patient,
  onUpdateDoshaProfile,
  canEdit = true,
  variant = 'full'
}) => {
  // Default dosha profile if not yet documented
  const initialProfile: DoshaProfileType = patient.doshaProfile || {
    prakriti: {
      vata: 45,
      pitta: 35,
      kapha: 20,
      dominant: 'Vata-Pitta'
    },
    vikriti: {
      vata: 60,
      pitta: 25,
      kapha: 15,
      primaryImbalance: 'Vata aggravation in Asthi & Sandhi (joints) with mild Sama Agni',
      severity: 'Moderate'
    },
    subdoshas: {
      vata: ['Vyana Vayu (Circulation & Joint Movement)', 'Apana Vayu (Elimination)'],
      pitta: ['Pachaka Pitta (Digestion)'],
      kapha: ['Shleshaka Kapha (Synovial Lubrication)']
    },
    assessmentDate: new Date().toISOString().split('T')[0],
    assessedByVaidya: patient.assignedDoctorName || 'Attending Vaidya',
    clinicalObservations: 'Patient exhibits signs of Vata vriddhi with joint crepitus, dry skin, and irregular digestive fire.',
    recommendedHerbs: ['Sahacharadi Thailam', 'Dhanwantharam Kashayam', 'Ashwagandha Churna'],
    dietaryGuidance: 'Vata-pacifying warm, unctuous diet (Snigdha ahara); avoid dry, cold, and raw foods.'
  };

  const [profile, setProfile] = useState<DoshaProfileType>(initialProfile);
  const [isEditing, setIsEditing] = useState(false);

  // Edit Form State
  const [editPrakritiVata, setEditPrakritiVata] = useState(profile.prakriti.vata);
  const [editPrakritiPitta, setEditPrakritiPitta] = useState(profile.prakriti.pitta);
  const [editPrakritiKapha, setEditPrakritiKapha] = useState(profile.prakriti.kapha);
  const [editDominant, setEditDominant] = useState<PrakritiType>(profile.prakriti.dominant);

  const [editVikritiVata, setEditVikritiVata] = useState(profile.vikriti.vata);
  const [editVikritiPitta, setEditVikritiPitta] = useState(profile.vikriti.pitta);
  const [editVikritiKapha, setEditVikritiKapha] = useState(profile.vikriti.kapha);
  const [editImbalance, setEditImbalance] = useState(profile.vikriti.primaryImbalance);
  const [editSeverity, setEditSeverity] = useState<'Mild' | 'Moderate' | 'Severe'>(
    profile.vikriti.severity || 'Moderate'
  );
  const [editVaidya, setEditVaidya] = useState(profile.assessedByVaidya);
  const [editObservations, setEditObservations] = useState(profile.clinicalObservations || '');

  const handleSave = () => {
    const updated: DoshaProfileType = {
      ...profile,
      prakriti: {
        vata: editPrakritiVata,
        pitta: editPrakritiPitta,
        kapha: editPrakritiKapha,
        dominant: editDominant
      },
      vikriti: {
        vata: editVikritiVata,
        pitta: editVikritiPitta,
        kapha: editVikritiKapha,
        primaryImbalance: editImbalance,
        severity: editSeverity
      },
      assessmentDate: new Date().toISOString().split('T')[0],
      assessedByVaidya: editVaidya,
      clinicalObservations: editObservations
    };

    setProfile(updated);
    setIsEditing(false);
    if (onUpdateDoshaProfile) {
      onUpdateDoshaProfile(updated);
    }
  };

  // Variance deltas (Vikriti vs Prakriti)
  const vataDelta = profile.vikriti.vata - profile.prakriti.vata;
  const pittaDelta = profile.vikriti.pitta - profile.prakriti.pitta;
  const kaphaDelta = profile.vikriti.kapha - profile.prakriti.kapha;

  const getDeltaBadge = (delta: number) => {
    if (delta > 10) {
      return (
        <span className="text-[10px] font-mono px-1 py-0.5 bg-[#fff1f1] text-[#da1e28] border border-[#ffb3b8] font-semibold">
          +{delta}% Aggravated
        </span>
      );
    }
    if (delta < -10) {
      return (
        <span className="text-[10px] font-mono px-1 py-0.5 bg-[#edf5ff] text-[#0f62fe] border border-[#a6c8ff]">
          {delta}% Depleted
        </span>
      );
    }
    return (
      <span className="text-[10px] font-mono px-1 py-0.5 bg-[#defbe6] text-[#198038] border border-[#a7f0ba]">
        Equilibrium
      </span>
    );
  };

  // Compact Variant (for expandable table row or quick widget)
  if (variant === 'compact') {
    return (
      <div className="p-3 bg-[#f4f4f4] border border-[#e0e0e0] font-sans">
        <div className="flex items-center justify-between mb-2 pb-1.5 border-b border-[#e0e0e0]">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-xs text-[#161616]">Dosha Imbalance Profile</span>
            <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 bg-white border border-[#e0e0e0] text-[#0f62fe]">
              {profile.prakriti.dominant}
            </span>
          </div>
          <span className="text-[10px] text-[#525252] font-mono">
            Assessed: {profile.assessmentDate}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {/* Vata */}
          <div className="p-2 bg-white border border-[#e0e0e0]">
            <div className="flex justify-between items-center text-[11px] mb-1">
              <span className="font-semibold text-[#0f62fe] flex items-center gap-1">
                <Wind className="w-3 h-3 text-[#0f62fe]" /> Vata
              </span>
              <span className="font-mono text-xs font-bold text-[#161616]">
                {profile.vikriti.vata}%
              </span>
            </div>
            <div className="w-full bg-[#e0e0e0] h-1.5">
              <div
                className="h-1.5 bg-[#0f62fe] transition-all"
                style={{ width: `${profile.vikriti.vata}%` }}
              />
            </div>
            <div className="text-[9px] text-[#525252] mt-1 flex justify-between">
              <span>Base: {profile.prakriti.vata}%</span>
              {getDeltaBadge(vataDelta)}
            </div>
          </div>

          {/* Pitta */}
          <div className="p-2 bg-white border border-[#e0e0e0]">
            <div className="flex justify-between items-center text-[11px] mb-1">
              <span className="font-semibold text-[#da1e28] flex items-center gap-1">
                <Flame className="w-3 h-3 text-[#da1e28]" /> Pitta
              </span>
              <span className="font-mono text-xs font-bold text-[#161616]">
                {profile.vikriti.pitta}%
              </span>
            </div>
            <div className="w-full bg-[#e0e0e0] h-1.5">
              <div
                className="h-1.5 bg-[#da1e28] transition-all"
                style={{ width: `${profile.vikriti.pitta}%` }}
              />
            </div>
            <div className="text-[9px] text-[#525252] mt-1 flex justify-between">
              <span>Base: {profile.prakriti.pitta}%</span>
              {getDeltaBadge(pittaDelta)}
            </div>
          </div>

          {/* Kapha */}
          <div className="p-2 bg-white border border-[#e0e0e0]">
            <div className="flex justify-between items-center text-[11px] mb-1">
              <span className="font-semibold text-[#198038] flex items-center gap-1">
                <Droplets className="w-3 h-3 text-[#198038]" /> Kapha
              </span>
              <span className="font-mono text-xs font-bold text-[#161616]">
                {profile.vikriti.kapha}%
              </span>
            </div>
            <div className="w-full bg-[#e0e0e0] h-1.5">
              <div
                className="h-1.5 bg-[#198038] transition-all"
                style={{ width: `${profile.vikriti.kapha}%` }}
              />
            </div>
            <div className="text-[9px] text-[#525252] mt-1 flex justify-between">
              <span>Base: {profile.prakriti.kapha}%</span>
              {getDeltaBadge(kaphaDelta)}
            </div>
          </div>
        </div>

        <div className="mt-2 text-[11px] text-[#525252] line-clamp-1 italic">
          <strong className="text-[#161616] not-italic">Clinical Vikriti:</strong> {profile.vikriti.primaryImbalance}
        </div>
      </div>
    );
  }

  // Full Expanded View
  return (
    <div className="bg-white border border-[#e0e0e0] p-4 sm:p-5 shadow-2xs space-y-4">
      {/* Header with Title, Vaidya Signature & Edit Trigger */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-[#e0e0e0]">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold text-[#161616] tracking-tight">
              Clinical Dosha Imbalance Profile (Prakriti vs. Vikriti)
            </h3>
            <span className="text-[10px] font-mono uppercase px-2 py-0.5 bg-[#edf5ff] text-[#0043ce] border border-[#a6c8ff] font-semibold">
              Rogi-Roga Pareeksha
            </span>
          </div>
          <p className="text-xs text-[#525252] mt-0.5">
            Quantitative assessment of baseline constitution (Deha Prakriti) and active pathological doshic variance (Vikriti).
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {canEdit && !isEditing && (
            <CarbonButton
              kind="tertiary"
              size="sm"
              renderIcon={Edit}
              onClick={() => setIsEditing(true)}
              title="Update Attending Vaidya Dosha Assessment"
            >
              Update Assessment
            </CarbonButton>
          )}
        </div>
      </div>

      {/* Editing Mode */}
      {isEditing ? (
        <div className="p-4 bg-[#f4f4f4] border border-[#0f62fe] space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-[#e0e0e0]">
            <span className="text-xs font-semibold text-[#0f62fe] uppercase font-mono flex items-center gap-1.5">
              <Stethoscope className="w-3.5 h-3.5" /> Vaidya Clinical Assessment Re-evaluation
            </span>
            <div className="flex items-center gap-2">
              <CarbonButton kind="ghost" size="sm" onClick={() => setIsEditing(false)}>
                Cancel
              </CarbonButton>
              <CarbonButton kind="primary" size="sm" renderIcon={Save} onClick={handleSave}>
                Save Assessment
              </CarbonButton>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Baseline Prakriti Editor */}
            <div className="p-3 bg-white border border-[#e0e0e0] space-y-3">
              <div className="flex justify-between items-center text-xs font-semibold text-[#161616]">
                <span>1. Baseline Deha Prakriti (Genetic Constitution)</span>
                <span className="font-mono text-[11px] text-[#0f62fe]">{editDominant}</span>
              </div>

              <div>
                <label className="block text-[11px] text-[#525252] mb-1">Dominant Constitution Type</label>
                <select
                  value={editDominant}
                  onChange={(e) => setEditDominant(e.target.value as PrakritiType)}
                  className="w-full bg-[#f4f4f4] border border-[#8d8d8d] h-8 px-2 text-xs"
                >
                  <option value="Vata">Vata Dominant</option>
                  <option value="Pitta">Pitta Dominant</option>
                  <option value="Kapha">Kapha Dominant</option>
                  <option value="Vata-Pitta">Vata-Pitta (Dvidoshic)</option>
                  <option value="Pitta-Kapha">Pitta-Kapha (Dvidoshic)</option>
                  <option value="Vata-Kapha">Vata-Kapha (Dvidoshic)</option>
                  <option value="Tridoshic (Sama)">Tridoshic (Sama Prakriti)</option>
                </select>
              </div>

              <div className="space-y-2 text-xs font-mono">
                <div>
                  <div className="flex justify-between text-[11px] text-[#525252]">
                    <span>Vata Baseline</span>
                    <span>{editPrakritiVata}%</span>
                  </div>
                  <input
                    type="range"
                    min={5}
                    max={85}
                    value={editPrakritiVata}
                    onChange={(e) => setEditPrakritiVata(Number(e.target.value))}
                    className="w-full accent-[#0f62fe]"
                  />
                </div>
                <div>
                  <div className="flex justify-between text-[11px] text-[#525252]">
                    <span>Pitta Baseline</span>
                    <span>{editPrakritiPitta}%</span>
                  </div>
                  <input
                    type="range"
                    min={5}
                    max={85}
                    value={editPrakritiPitta}
                    onChange={(e) => setEditPrakritiPitta(Number(e.target.value))}
                    className="w-full accent-[#da1e28]"
                  />
                </div>
                <div>
                  <div className="flex justify-between text-[11px] text-[#525252]">
                    <span>Kapha Baseline</span>
                    <span>{editPrakritiKapha}%</span>
                  </div>
                  <input
                    type="range"
                    min={5}
                    max={85}
                    value={editPrakritiKapha}
                    onChange={(e) => setEditPrakritiKapha(Number(e.target.value))}
                    className="w-full accent-[#198038]"
                  />
                </div>
              </div>
            </div>

            {/* Active Vikriti Editor */}
            <div className="p-3 bg-white border border-[#e0e0e0] space-y-3">
              <div className="flex justify-between items-center text-xs font-semibold text-[#161616]">
                <span>2. Active Vikriti (Current Pathological Aggravation)</span>
                <span className="font-mono text-[11px] text-[#da1e28]">{editSeverity} Imbalance</span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] text-[#525252] mb-1">Imbalance Severity</label>
                  <select
                    value={editSeverity}
                    onChange={(e) => setEditSeverity(e.target.value as any)}
                    className="w-full bg-[#f4f4f4] border border-[#8d8d8d] h-8 px-2 text-xs"
                  >
                    <option value="Mild">Mild Aggravation</option>
                    <option value="Moderate">Moderate Aggravation</option>
                    <option value="Severe">Severe Aggravation</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] text-[#525252] mb-1">Attending Vaidya</label>
                  <input
                    type="text"
                    value={editVaidya}
                    onChange={(e) => setEditVaidya(e.target.value)}
                    className="w-full bg-[#f4f4f4] border border-[#8d8d8d] h-8 px-2 text-xs"
                  />
                </div>
              </div>

              <div className="space-y-2 text-xs font-mono">
                <div>
                  <div className="flex justify-between text-[11px] text-[#0f62fe]">
                    <span>Active Vata Vikriti</span>
                    <span>{editVikritiVata}%</span>
                  </div>
                  <input
                    type="range"
                    min={5}
                    max={95}
                    value={editVikritiVata}
                    onChange={(e) => setEditVikritiVata(Number(e.target.value))}
                    className="w-full accent-[#0f62fe]"
                  />
                </div>
                <div>
                  <div className="flex justify-between text-[11px] text-[#da1e28]">
                    <span>Active Pitta Vikriti</span>
                    <span>{editVikritiPitta}%</span>
                  </div>
                  <input
                    type="range"
                    min={5}
                    max={95}
                    value={editVikritiPitta}
                    onChange={(e) => setEditVikritiPitta(Number(e.target.value))}
                    className="w-full accent-[#da1e28]"
                  />
                </div>
                <div>
                  <div className="flex justify-between text-[11px] text-[#198038]">
                    <span>Active Kapha Vikriti</span>
                    <span>{editVikritiKapha}%</span>
                  </div>
                  <input
                    type="range"
                    min={5}
                    max={95}
                    value={editVikritiKapha}
                    onChange={(e) => setEditVikritiKapha(Number(e.target.value))}
                    className="w-full accent-[#198038]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] text-[#525252] mb-1">Primary Clinical Imbalance Formulation</label>
                <input
                  type="text"
                  value={editImbalance}
                  onChange={(e) => setEditImbalance(e.target.value)}
                  placeholder="e.g. Vata localized in Sandhi (joints) with Sama Agni"
                  className="w-full bg-[#f4f4f4] border border-[#8d8d8d] h-8 px-2 text-xs"
                />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-[11px] text-[#525252] mb-1 font-semibold">
              Attending Vaidya Clinical Notes & Dosha Observations
            </label>
            <textarea
              rows={2}
              value={editObservations}
              onChange={(e) => setEditObservations(e.target.value)}
              className="w-full carbon-input resize-none"
            />
          </div>
        </div>
      ) : null}

      {/* The 3 Tri-Dosha Interactive Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* 1. VATA CARD (Air & Space) */}
        <div className="p-4 bg-white border border-[#e0e0e0] flex flex-col justify-between space-y-3 relative group">
          <div className="absolute top-0 left-0 right-0 h-1 bg-[#0f62fe]" />
          <div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 bg-[#edf5ff] text-[#0f62fe] border border-[#a6c8ff] flex items-center justify-center">
                  <Wind className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-[#161616] leading-none">Vata Dosha</h4>
                  <span className="text-[10px] text-[#525252] font-mono">Vayu & Akasha (Air & Ether)</span>
                </div>
              </div>
              {getDeltaBadge(vataDelta)}
            </div>

            <div className="mt-3.5 space-y-2">
              <div className="space-y-1">
                <div className="flex justify-between text-xs font-mono">
                  <span className="text-[#525252]">Active Imbalance (Vikriti):</span>
                  <strong className="text-[#0f62fe] text-sm tabular-nums">{profile.vikriti.vata}%</strong>
                </div>
                <div className="w-full bg-[#e0e0e0] h-2.5">
                  <div
                    className="h-2.5 bg-[#0f62fe] transition-all duration-300"
                    style={{ width: `${profile.vikriti.vata}%` }}
                  />
                </div>
              </div>

              <div className="flex items-center justify-between text-[11px] text-[#525252] font-mono pt-1">
                <span>Baseline Prakriti: <strong>{profile.prakriti.vata}%</strong></span>
                <span className={vataDelta > 0 ? 'text-[#da1e28]' : 'text-[#198038]'}>
                  Delta: {vataDelta > 0 ? `+${vataDelta}%` : `${vataDelta}%`}
                </span>
              </div>
            </div>

            <div className="mt-3 pt-2.5 border-t border-[#f4f4f4] space-y-1.5 text-[11px]">
              <div className="text-[#525252]">
                <strong className="text-[#161616]">Biological Seat:</strong> Colon, joints, bones, ears, skin, touch.
              </div>
              <div className="text-[#525252]">
                <strong className="text-[#161616]">Symptoms of Excess:</strong> Pain, crepitus, dryness, constipation, insomnia, anxiety.
              </div>
              {profile.subdoshas?.vata && (
                <div className="mt-1">
                  <span className="text-[10px] font-mono uppercase text-[#525252] block font-semibold">Subdosha Affliction:</span>
                  <div className="flex flex-wrap gap-1 mt-0.5">
                    {profile.subdoshas.vata.map((s, idx) => (
                      <span key={idx} className="px-1.5 py-0.5 bg-[#edf5ff] text-[#0043ce] text-[10px] font-mono border border-[#a6c8ff]">
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="pt-2 border-t border-[#e0e0e0] text-[10px] font-mono text-[#525252] flex justify-between">
            <span>Pacifying Taste: Sweet, Sour, Salty</span>
            <span className="text-[#0f62fe]">Sneha / Ushna</span>
          </div>
        </div>

        {/* 2. PITTA CARD (Fire & Water) */}
        <div className="p-4 bg-white border border-[#e0e0e0] flex flex-col justify-between space-y-3 relative group">
          <div className="absolute top-0 left-0 right-0 h-1 bg-[#da1e28]" />
          <div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 bg-[#fff1f1] text-[#da1e28] border border-[#ffb3b8] flex items-center justify-center">
                  <Flame className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-[#161616] leading-none">Pitta Dosha</h4>
                  <span className="text-[10px] text-[#525252] font-mono">Tejas & Jala (Fire & Water)</span>
                </div>
              </div>
              {getDeltaBadge(pittaDelta)}
            </div>

            <div className="mt-3.5 space-y-2">
              <div className="space-y-1">
                <div className="flex justify-between text-xs font-mono">
                  <span className="text-[#525252]">Active Imbalance (Vikriti):</span>
                  <strong className="text-[#da1e28] text-sm tabular-nums">{profile.vikriti.pitta}%</strong>
                </div>
                <div className="w-full bg-[#e0e0e0] h-2.5">
                  <div
                    className="h-2.5 bg-[#da1e28] transition-all duration-300"
                    style={{ width: `${profile.vikriti.pitta}%` }}
                  />
                </div>
              </div>

              <div className="flex items-center justify-between text-[11px] text-[#525252] font-mono pt-1">
                <span>Baseline Prakriti: <strong>{profile.prakriti.pitta}%</strong></span>
                <span className={pittaDelta > 0 ? 'text-[#da1e28]' : 'text-[#198038]'}>
                  Delta: {pittaDelta > 0 ? `+${pittaDelta}%` : `${pittaDelta}%`}
                </span>
              </div>
            </div>

            <div className="mt-3 pt-2.5 border-t border-[#f4f4f4] space-y-1.5 text-[11px]">
              <div className="text-[#525252]">
                <strong className="text-[#161616]">Biological Seat:</strong> Small intestine, stomach, liver, blood, eyes, sweat.
              </div>
              <div className="text-[#525252]">
                <strong className="text-[#161616]">Symptoms of Excess:</strong> Inflammation, burning, acid reflux, skin eruptions, irritability.
              </div>
              {profile.subdoshas?.pitta && (
                <div className="mt-1">
                  <span className="text-[10px] font-mono uppercase text-[#525252] block font-semibold">Subdosha Affliction:</span>
                  <div className="flex flex-wrap gap-1 mt-0.5">
                    {profile.subdoshas.pitta.map((s, idx) => (
                      <span key={idx} className="px-1.5 py-0.5 bg-[#fff1f1] text-[#a2191f] text-[10px] font-mono border border-[#ffb3b8]">
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="pt-2 border-t border-[#e0e0e0] text-[10px] font-mono text-[#525252] flex justify-between">
            <span>Pacifying Taste: Sweet, Bitter, Astringent</span>
            <span className="text-[#da1e28]">Sheeta / Manda</span>
          </div>
        </div>

        {/* 3. KAPHA CARD (Earth & Water) */}
        <div className="p-4 bg-white border border-[#e0e0e0] flex flex-col justify-between space-y-3 relative group">
          <div className="absolute top-0 left-0 right-0 h-1 bg-[#198038]" />
          <div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 bg-[#defbe6] text-[#198038] border border-[#a7f0ba] flex items-center justify-center">
                  <Droplets className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-[#161616] leading-none">Kapha Dosha</h4>
                  <span className="text-[10px] text-[#525252] font-mono">Prithvi & Jala (Earth & Water)</span>
                </div>
              </div>
              {getDeltaBadge(kaphaDelta)}
            </div>

            <div className="mt-3.5 space-y-2">
              <div className="space-y-1">
                <div className="flex justify-between text-xs font-mono">
                  <span className="text-[#525252]">Active Imbalance (Vikriti):</span>
                  <strong className="text-[#198038] text-sm tabular-nums">{profile.vikriti.kapha}%</strong>
                </div>
                <div className="w-full bg-[#e0e0e0] h-2.5">
                  <div
                    className="h-2.5 bg-[#198038] transition-all duration-300"
                    style={{ width: `${profile.vikriti.kapha}%` }}
                  />
                </div>
              </div>

              <div className="flex items-center justify-between text-[11px] text-[#525252] font-mono pt-1">
                <span>Baseline Prakriti: <strong>{profile.prakriti.kapha}%</strong></span>
                <span className={kaphaDelta > 0 ? 'text-[#da1e28]' : 'text-[#198038]'}>
                  Delta: {kaphaDelta > 0 ? `+${kaphaDelta}%` : `${kaphaDelta}%`}
                </span>
              </div>
            </div>

            <div className="mt-3 pt-2.5 border-t border-[#f4f4f4] space-y-1.5 text-[11px]">
              <div className="text-[#525252]">
                <strong className="text-[#161616]">Biological Seat:</strong> Chest, throat, lungs, head, lymph, fatty tissue.
              </div>
              <div className="text-[#525252]">
                <strong className="text-[#161616]">Symptoms of Excess:</strong> Heaviness, productive cough, lethargy, slow metabolism, edema.
              </div>
              {profile.subdoshas?.kapha && (
                <div className="mt-1">
                  <span className="text-[10px] font-mono uppercase text-[#525252] block font-semibold">Subdosha Affliction:</span>
                  <div className="flex flex-wrap gap-1 mt-0.5">
                    {profile.subdoshas.kapha.map((s, idx) => (
                      <span key={idx} className="px-1.5 py-0.5 bg-[#defbe6] text-[#0e6027] text-[10px] font-mono border border-[#a7f0ba]">
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="pt-2 border-t border-[#e0e0e0] text-[10px] font-mono text-[#525252] flex justify-between">
            <span>Pacifying Taste: Pungent, Bitter, Astringent</span>
            <span className="text-[#198038]">Ruksha / Laghu</span>
          </div>
        </div>
      </div>

      {/* Primary Diagnosis & Clinical Formulation Details */}
      <div className="p-4 bg-[#f4f4f4] border border-[#e0e0e0] space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-[#e0e0e0]">
          <div>
            <span className="text-[10px] uppercase font-mono text-[#525252] block font-semibold">
              Physician Diagnostic Assessment (Nidana & Samprapti)
            </span>
            <h4 className="text-sm font-semibold text-[#161616] mt-0.5">
              {profile.vikriti.primaryImbalance}
            </h4>
          </div>
          <div className="text-right text-[11px] font-mono text-[#525252]">
            <div>Assessed by: <strong className="text-[#161616]">{profile.assessedByVaidya}</strong></div>
            <div className="text-[10px] text-[#8d8d8d]">Recorded on {profile.assessmentDate}</div>
          </div>
        </div>

        {profile.clinicalObservations && (
          <div className="text-xs text-[#525252] italic bg-white p-2.5 border border-[#e0e0e0]">
            "{profile.clinicalObservations}"
          </div>
        )}

        {/* Recommended Formulations and Dietary Regimen */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
          {profile.recommendedHerbs && profile.recommendedHerbs.length > 0 && (
            <div className="p-2.5 bg-white border border-[#e0e0e0]">
              <span className="text-[10px] uppercase font-mono text-[#0f62fe] font-semibold block mb-1">
                Targeted Ayurvedic Formulations (Aushadha)
              </span>
              <ul className="space-y-1 text-xs text-[#161616]">
                {profile.recommendedHerbs.map((herb, i) => (
                  <li key={i} className="flex items-center gap-1.5 font-medium">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#0f62fe]" />
                    <span>{herb}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {profile.dietaryGuidance && (
            <div className="p-2.5 bg-white border border-[#e0e0e0]">
              <span className="text-[10px] uppercase font-mono text-[#24a148] font-semibold block mb-1">
                Pathya-Apathya (Diet & Lifestyle Guidance)
              </span>
              <p className="text-xs text-[#525252] leading-relaxed">
                {profile.dietaryGuidance}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
