import {
  Activity,
  Users,
  Stethoscope,
  Pill,
  TestTube,
  CreditCard,
  ShieldCheck,
  Building,
  Calendar,
  Lock,
  X,
  BookOpen,
  HandHeart,
  Flame,
  BarChart3
} from 'lucide-react';

interface CarbonAppSwitcherProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (viewId: string) => void;
}

export const CarbonAppSwitcher: React.FC<CarbonAppSwitcherProps> = ({
  isOpen,
  onClose,
  onNavigate
}) => {
  if (!isOpen) return null;

  const applications = [
    {
      id: 'overview',
      name: 'Clinical Command Center',
      category: 'Hospital Intelligence',
      icon: Activity,
      desc: 'Real-time census, appointments & clinical telemetry'
    },
    {
      id: 'patients',
      name: 'Patient EMR Records & 360',
      category: 'Health Records',
      icon: Users,
      desc: 'Electronic medical records, Ayurvedic dosha baselines & diagnoses'
    },
    {
      id: 'appointments',
      name: 'Appointments & Scheduling',
      category: 'Outpatient Care',
      icon: Calendar,
      desc: 'Vaidya availability slots & automated SMS/Email reminders'
    },
    {
      id: 'consultations',
      name: 'Ayurvedic Consultations Workspace',
      category: 'Clinical Assessment',
      icon: BookOpen,
      desc: 'Prakriti, Vikriti, Agni, Ama, Nadi examination & prescription drafting'
    },
    {
      id: 'treatments',
      name: 'Therapy & Treatment Plans',
      category: 'Ayurvedic Care',
      icon: HandHeart,
      desc: 'Abhyanga, Shirodhara, Janu Basti series & therapist session tracking'
    },
    {
      id: 'panchakarma',
      name: 'Panchakarma Management Suite',
      category: 'Purification Protocols',
      icon: Flame,
      desc: 'Virechana, Basti, Vamana, Nasya protocols, phases & daily progress'
    },
    {
      id: 'doctors',
      name: 'Physician & Staff Roster',
      category: 'Clinical Workforce',
      icon: Stethoscope,
      desc: 'On-duty specialists, surgery schedules & consultations'
    },
    {
      id: 'pharmacy',
      name: 'Central Pharmacy & Dispensing',
      category: 'Medication Management',
      icon: Pill,
      desc: 'E-prescriptions, narcotic controls & batch stocks'
    },
    {
      id: 'laboratory',
      name: 'Pathology & Diagnostic Labs',
      category: 'Diagnostics',
      icon: TestTube,
      desc: 'STAT troponin, ABG, blood gas & automated analyzers'
    },
    {
      id: 'billing',
      name: 'Billing & Invoices (INR ₹)',
      category: 'Revenue Cycle',
      icon: CreditCard,
      desc: 'Inpatient invoicing, payments, receipts & outstanding balances in INR'
    },
    {
      id: 'reports',
      name: 'Reports & Clinical Analytics',
      category: 'Insights',
      icon: BarChart3,
      desc: 'Patient growth, Panchakarma completion rates, pharmacy movements & revenue'
    },
    {
      id: 'rbac',
      name: 'Role-Based Access Control',
      category: 'Security Governance',
      icon: Lock,
      desc: 'Granular permissions matrix for the 6 permitted hospital roles'
    },
    {
      id: 'audit',
      name: 'Audit Trail & Compliance',
      category: 'Governance & Security',
      icon: ShieldCheck,
      desc: 'Clinical operations audit trail & security access governance'
    }
  ];

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-2xs"
      />

      {/* Drawer */}
      <div className="fixed top-12 left-0 w-80 sm:w-96 max-h-[calc(100vh-48px)] bg-[#161616] text-white z-50 shadow-2xl border-r border-[#393939] overflow-y-auto flex flex-col animate-in slide-in-from-left-4 duration-150">
        <div className="p-4 border-b border-[#393939] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Building className="w-4 h-4 text-[#0f62fe]" />
            <span className="text-[13px] font-semibold text-white tracking-wide">
              SahacharaOS Enterprise Health Suite
            </span>
          </div>
          <button
            onClick={onClose}
            className="text-[#c6c6c6] hover:text-white p-1 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-3 text-[11px] font-mono uppercase tracking-wider text-[#8d8d8d]">
          Integrated Clinical & Administrative Modules
        </div>

        <div className="p-2 space-y-1">
          {applications.map((app) => {
            const Icon = app.icon;
            return (
              <button
                key={app.id}
                onClick={() => {
                  onNavigate(app.id);
                  onClose();
                }}
                className="w-full text-left p-2.5 hover:bg-[#262626] transition-colors group flex items-start gap-3 rounded-none cursor-pointer"
              >
                <div className="p-2 bg-[#262626] group-hover:bg-[#0f62fe] text-white transition-colors shrink-0">
                  <Icon className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-[13px] font-medium text-white truncate">
                      {app.name}
                    </span>
                    <span className="text-[10px] text-[#8d8d8d] group-hover:text-[#a6c8ff]">
                      {app.category}
                    </span>
                  </div>
                  <p className="text-[11px] text-[#8d8d8d] mt-0.5 line-clamp-1">
                    {app.desc}
                  </p>
                </div>
              </button>
            );
          })}
        </div>

        <div className="mt-auto p-4 border-t border-[#393939] bg-[#262626] text-[11px] text-[#8d8d8d] flex items-center justify-between">
          <span>SahacharaOS Version 2026.4</span>
          <span className="text-[#a6c8ff]">Nest &bull; Next &bull; Carbon v11</span>
        </div>
      </div>
    </>
  );
};
