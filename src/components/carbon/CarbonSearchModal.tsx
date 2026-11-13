import React, { useState, useEffect, useRef } from 'react';
import {
  Search,
  X,
  Users,
  Calendar,
  BookOpen,
  Flame,
  Pill,
  CreditCard,
  ArrowRight,
  Command,
  CornerDownLeft
} from 'lucide-react';

interface OperationalShortcut {
  id: string;
  label: string;
  route: string;
  destinationId: string;
  description: string;
  tag: string;
  icon: React.ElementType;
}

const OPERATIONAL_SHORTCUTS: OperationalShortcut[] = [
  {
    id: 'patients',
    label: 'Patient Directory',
    route: '/patients',
    destinationId: 'patients',
    description: 'Patient registry, admissions, longitudinal EMR clinical dossiers, and demographics',
    tag: 'Patients',
    icon: Users
  },
  {
    id: 'appointments',
    label: "Today's Appointments",
    route: '/appointments',
    destinationId: 'appointments',
    description: 'Clinical schedule, consultation queue, clinician rosters, and reminders',
    tag: 'Appointments',
    icon: Calendar
  },
  {
    id: 'consultations',
    label: 'Doctor Consultations',
    route: '/consultations',
    destinationId: 'consultations',
    description: 'Ayurvedic clinical encounters, Ashtavidha Pareeksha, Rogi-Roga assessments',
    tag: 'Clinical',
    icon: BookOpen
  },
  {
    id: 'panchakarma',
    label: 'Panchakarma Department',
    route: '/panchakarma',
    destinationId: 'panchakarma',
    description: 'Shodhana cleansing courses, daily therapy session queue, and tolerance protocols',
    tag: 'Panchakarma',
    icon: Flame
  },
  {
    id: 'pharmacy',
    label: 'Ayurvedic Pharmacy',
    route: '/pharmacy',
    destinationId: 'pharmacy',
    description: 'Herbal formulary stock, FEFO batch dispensing, and prescription registry',
    tag: 'Pharmacy',
    icon: Pill
  },
  {
    id: 'billing',
    label: 'Billing & Invoicing',
    route: '/billing',
    destinationId: 'billing',
    description: 'Patient accounts, GST invoice generation, cashier payments, and receipts',
    tag: 'Billing',
    icon: CreditCard
  }
];

interface CarbonSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (viewId: string) => void;
}

export const CarbonSearchModal: React.FC<CarbonSearchModalProps> = ({
  isOpen,
  onClose,
  onNavigate
}) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 40);
    }
  }, [isOpen]);

  // Filter the six fixed quick links by label, description, or tag
  const filteredShortcuts = OPERATIONAL_SHORTCUTS.filter((item) => {
    if (!query.trim()) return true;
    const q = query.toLowerCase().trim();
    return (
      item.label.toLowerCase().includes(q) ||
      item.description.toLowerCase().includes(q) ||
      item.tag.toLowerCase().includes(q) ||
      item.route.toLowerCase().includes(q)
    );
  });

  // Handle keyboard navigation: Esc, ArrowUp, ArrowDown, Enter
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;

      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) =>
          filteredShortcuts.length === 0 ? 0 : (prev + 1) % filteredShortcuts.length
        );
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) =>
          filteredShortcuts.length === 0
            ? 0
            : (prev - 1 + filteredShortcuts.length) % filteredShortcuts.length
        );
      } else if (e.key === 'Enter') {
        if (filteredShortcuts.length > 0 && filteredShortcuts[selectedIndex]) {
          e.preventDefault();
          onNavigate(filteredShortcuts[selectedIndex].destinationId);
          onClose();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, filteredShortcuts, selectedIndex, onNavigate, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-16 sm:pt-24 px-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150 select-none"
      onClick={onClose}
    >
      <div
        className="bg-white border border-[#393939] shadow-2xl w-full max-w-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Bar */}
        <div className="bg-[#161616] text-white px-4 py-2.5 flex items-center justify-between border-b border-[#393939]">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-xs tracking-wider uppercase text-white">
              Operational Search
            </span>
            <span className="text-[#8d8d8d] text-xs">/</span>
            <span className="text-xs text-[#c6c6c6]">Sahachara Ayurveda Operations</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono text-[#8d8d8d] hidden sm:inline-flex items-center gap-1 bg-[#262626] px-1.5 py-0.5 border border-[#393939]">
              <Command className="w-2.5 h-2.5" /> K
            </span>
            <button
              onClick={onClose}
              className="text-[#8d8d8d] hover:text-white p-1 transition-colors"
              title="Close (Esc)"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Large Search Input */}
        <div className="relative border-b border-[#e0e0e0] bg-[#f4f4f4]">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#525252]" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            placeholder="Search operational destinations by name, description, or tag..."
            className="w-full pl-12 pr-12 py-3.5 bg-transparent text-[#161616] placeholder-[#525252] text-sm focus:outline-none focus:bg-white font-sans transition-colors"
          />
          {query && (
            <button
              onClick={() => {
                setQuery('');
                inputRef.current?.focus();
              }}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-[#525252] hover:text-[#161616]"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Shortcuts List */}
        <div className="max-h-[380px] overflow-y-auto divide-y divide-[#e0e0e0]">
          {filteredShortcuts.length === 0 ? (
            <div className="py-12 px-4 text-center">
              <p className="text-xs text-[#525252] font-mono">
                No operational items match &ldquo;<span className="text-[#161616] font-semibold">{query}</span>&rdquo;
              </p>
              <p className="text-[11px] text-[#8d8d8d] mt-1">
                Try searching for Patients, Appointments, Consultations, Panchakarma, Pharmacy, or Billing.
              </p>
            </div>
          ) : (
            filteredShortcuts.map((item, idx) => {
              const Icon = item.icon;
              const isSelected = idx === selectedIndex;
              return (
                <div
                  key={item.id}
                  onClick={() => {
                    onNavigate(item.destinationId);
                    onClose();
                  }}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`px-4 py-3 cursor-pointer flex items-center justify-between transition-colors ${
                    isSelected ? 'bg-[#edf5ff] text-[#0043ce]' : 'hover:bg-[#f4f4f4] text-[#161616]'
                  }`}
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div
                      className={`w-8 h-8 flex items-center justify-center shrink-0 border ${
                        isSelected
                          ? 'bg-[#0f62fe] text-white border-[#0f62fe]'
                          : 'bg-white text-[#525252] border-[#e0e0e0]'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-xs tracking-tight text-[#161616]">
                          {item.label}
                        </span>
                        <span className="font-mono text-[11px] text-[#0f62fe]">
                          {item.route}
                        </span>
                        <span className="text-[10px] uppercase font-mono px-1.5 py-0.2 bg-[#e0e0e0] text-[#525252]">
                          {item.tag}
                        </span>
                      </div>
                      <p className="text-[11px] text-[#525252] mt-0.5 line-clamp-1">
                        {item.description}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 ml-3">
                    {isSelected && (
                      <span className="text-[10px] font-mono text-[#0043ce] flex items-center gap-1 hidden sm:inline-flex">
                        Press <CornerDownLeft className="w-3 h-3" />
                      </span>
                    )}
                    <ArrowRight className={`w-3.5 h-3.5 ${isSelected ? 'text-[#0f62fe]' : 'text-[#8d8d8d]'}`} />
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-4 py-2 bg-[#f4f4f4] border-t border-[#e0e0e0] flex items-center justify-between text-[11px] text-[#525252] font-mono">
          <div className="flex items-center gap-3">
            <span>&uarr;&darr; Navigate</span>
            <span>&crarr; Select</span>
            <span>ESC Close</span>
          </div>
          <div className="text-[10px] text-[#8d8d8d]">
            Sahachara Operational Palette
          </div>
        </div>
      </div>
    </div>
  );
};
