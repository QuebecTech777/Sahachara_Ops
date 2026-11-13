import React, { useState, useEffect } from 'react';
import {
  Flame,
  Plus,
  Search,
  CheckCircle,
  Clock,
  Calendar,
  User,
  Activity,
  Heart,
  FileText,
  ChevronRight,
  AlertTriangle,
  Play,
  Pause,
  XCircle,
  ArrowRight,
  GitCommit,
  Check
} from 'lucide-react';
import {
  PanchakarmaCourse,
  Patient,
  Doctor,
  AppUser,
  PanchakarmaProtocol,
  PanchakarmaDailySession,
  PanchakarmaReferral,
  PanchakarmaPhaseTransition,
  StaffMember
} from '../types/hospital';
import { CarbonButton } from '../components/carbon/CarbonButton';
import { CarbonTag } from '../components/carbon/CarbonTag';
import { CarbonTile } from '../components/carbon/CarbonTile';
import { CarbonModal } from '../components/carbon/CarbonModal';
import { CarbonTableWrapper } from '../components/carbon/CarbonDataTable';
import { hospitalApi } from '../services/hospitalApi';

interface PanchakarmaManagementViewProps {
  courses: PanchakarmaCourse[];
  patients: Patient[];
  doctors: Doctor[];
  currentUser: AppUser;
  onCreateCourse: (course: Partial<PanchakarmaCourse>) => Promise<PanchakarmaCourse>;
  onRecordSession: (courseId: string, session: PanchakarmaDailySession) => Promise<PanchakarmaCourse>;
}

export const PanchakarmaManagementView: React.FC<PanchakarmaManagementViewProps> = ({
  courses,
  patients,
  doctors,
  currentUser,
  onCreateCourse,
  onRecordSession
}) => {
  const [selectedCourse, setSelectedCourse] = useState<PanchakarmaCourse | null>(courses[0] || null);
  const [activeSection, setActiveSection] = useState<'courses' | 'referrals' | 'phases'>('courses');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isRecordSessionModalOpen, setIsRecordSessionModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Phase 7: Referrals & Vaidyas State
  const [pendingReferrals, setPendingReferrals] = useState<PanchakarmaReferral[]>([]);
  const [responsibleVaidyas, setResponsibleVaidyas] = useState<StaffMember[]>([]);
  const [selectedReferral, setSelectedReferral] = useState<PanchakarmaReferral | null>(null);
  const [isConvertModalOpen, setIsConvertModalOpen] = useState(false);

  // Conversion Form State
  const [convertVaidyaId, setConvertVaidyaId] = useState('');
  const [convertStartDate, setConvertStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [convertTotalDays, setConvertTotalDays] = useState(14);
  const [convertBillingMode, setConvertBillingMode] = useState<'PACKAGE' | 'PER_SESSION'>('PACKAGE');
  const [convertCustomAmount, setConvertCustomAmount] = useState(18000);
  const [convertDietary, setConvertDietary] = useState('Samsarjana Krama: Manda (Clear rice water) -> Peya (Rice gruel) -> Vilepi (Thick gruel) -> Yusha (Lentil soup)');

  // Phase Progression State
  const [isAdvancePhaseModalOpen, setIsAdvancePhaseModalOpen] = useState(false);
  const [toPhase, setToPhase] = useState<'PURVAKARMA' | 'PRADHANAKARMA' | 'PASCHATKARMA'>('PRADHANAKARMA');
  const [phaseRationale, setPhaseRationale] = useState('Samyak Snigdha lakshanas attained (soft skin, passage of unctuous flatus); Koshta and Agni assessed ready for Pradhanakarma.');
  const [phaseBpSystolic, setPhaseBpSystolic] = useState(120);
  const [phaseBpDiastolic, setPhaseBpDiastolic] = useState(80);
  const [phasePulse, setPhasePulse] = useState(72);
  const [phaseAgni, setPhaseAgni] = useState('SAMA');
  const [samayakLakshanas, setSamayakLakshanas] = useState('Vatanulomana, Dehalaghava, Snehodvega');
  const [asamyakLakshanas, setAsamyakLakshanas] = useState('');

  const canManage = ['SUPER_ADMIN', 'ADMIN', 'VAIDYA'].includes(currentUser.role);
  const canRecord = ['SUPER_ADMIN', 'ADMIN', 'VAIDYA', 'DOCTOR'].includes(currentUser.role);

  const loadPhase7PanchakarmaData = async () => {
    try {
      const [refs, vaidyas] = await Promise.all([
        hospitalApi.getPanchakarmaReferrals({ status: 'PENDING' }).catch(() => []),
        hospitalApi.getResponsibleVaidyas().catch(() => [])
      ]);
      setPendingReferrals(refs);
      setResponsibleVaidyas(vaidyas);
      if (vaidyas.length > 0 && !convertVaidyaId) setConvertVaidyaId(vaidyas[0].id);
    } catch (err) {
      console.warn('Error loading referrals/vaidyas:', err);
    }
  };

  useEffect(() => {
    loadPhase7PanchakarmaData();
  }, []);

  // Course Creation State
  const [patientId, setPatientId] = useState(patients[0]?.id || '');
  const [protocol, setProtocol] = useState<PanchakarmaProtocol>(
    'Virechana (Therapeutic Purgation - Pitta Cleansing)'
  );
  const [totalDays, setTotalDays] = useState(14);
  const [vaidyaName, setVaidyaName] = useState('Dr. Sarah Chen, MD & Vaidya Team');
  const [dietaryPrescription, setDietaryPrescription] = useState(
    'Samsarjana Krama: Manda (Clear rice water) -> Peya (Rice gruel) -> Vilepi (Thick gruel) -> Yusha (Lentil soup)'
  );
  const [dischargeNotes, setDischargeNotes] = useState('');

  // Daily Session Recording Form
  const [sessionPhase, setSessionPhase] = useState<
    'Purvakarma (Prep/Snehana-Swedana)' | 'Pradhanakarma (Main Procedure)' | 'Paschatkarma (Dietary Samsarjana)'
  >('Purvakarma (Prep/Snehana-Swedana)');
  const [procedureName, setProcedureName] = useState('Snehapana with Medicated Ghritam');
  const [therapist, setTherapist] = useState('Senior Therapist Anand Kumar');
  const [bloodPressure, setBloodPressure] = useState('126/80');
  const [pulseRate, setPulseRate] = useState('74 bpm');
  const [appetiteAssessment, setAppetiteAssessment] = useState('Normal digestive fire');
  const [bowelStatus, setBowelStatus] = useState('Soft formed, regular');
  const [observations, setObservations] = useState('Patient tolerated procedure smoothly without nausea or fatigue.');

  const filteredCourses = courses.filter((c) => {
    return (
      c.patientName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.patientMrn.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.courseNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.protocol.toLowerCase().includes(searchQuery.toLowerCase())
    );
  });

  const handleCreateCourse = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const pat = patients.find((p) => p.id === patientId) || patients[0];

    const newCourse = await onCreateCourse({
      patientId: pat.id,
      patientName: `${pat.firstName} ${pat.lastName}`,
      patientMrn: pat.mrn,
      vaidyaName,
      protocol,
      totalDays,
      dietaryPrescription,
      dischargeNotes
    });

    setSelectedCourse(newCourse);
    setIsModalOpen(false);
  };

  const handleRecordSessionSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!selectedCourse) return;

    const nextDay = (selectedCourse.dailySessions?.length || 0) + 1;
    const newSession: PanchakarmaDailySession = {
      day: nextDay,
      date: new Date().toISOString().split('T')[0],
      phase: sessionPhase,
      procedureName,
      therapist,
      bloodPressure,
      pulseRate,
      appetiteAssessment,
      bowelStatus,
      observations,
      status: 'completed'
    };

    const updated = await onRecordSession(selectedCourse.id, newSession);
    setSelectedCourse(updated);
    setIsRecordSessionModalOpen(false);
  };

  // Phase 7 Action Handlers
  const handleConvertReferralSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!selectedReferral) return;
    try {
      const course = await hospitalApi.convertReferralToCourse(selectedReferral.id, {
        attendingVaidyaId: convertVaidyaId,
        startDate: convertStartDate,
        primaryProcedure: selectedReferral.proposedProcedure || 'Classical Shodhana Protocol',
        totalPlannedDays: Number(convertTotalDays),
        billingMode: convertBillingMode,
        customPackageAmount: convertBillingMode === 'PACKAGE' ? Number(convertCustomAmount) : undefined,
        dietaryInstructions: convertDietary
      });
      setIsConvertModalOpen(false);
      setSelectedReferral(null);
      setSelectedCourse(course);
      await loadPhase7PanchakarmaData();
      alert(`Panchakarma Referral successfully converted to Course ${course.courseNumber}!`);
    } catch (err: any) {
      alert(err.message || 'Failed to convert referral');
    }
  };

  const handleAdvancePhaseSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!selectedCourse) return;
    try {
      const res = await hospitalApi.advancePanchakarmaPhase(selectedCourse.id, {
        toPhase,
        clinicalRationaleNotes: phaseRationale,
        vitalsAtTransition: {
          bpSystolic: Number(phaseBpSystolic),
          bpDiastolic: Number(phaseBpDiastolic),
          pulseRate: Number(phasePulse),
          agniStatus: phaseAgni
        },
        samayakLakshanasObserved: samayakLakshanas.split(',').map((s) => s.trim()).filter(Boolean),
        asamyakLakshanasObserved: asamyakLakshanas.split(',').map((s) => s.trim()).filter(Boolean)
      });
      setSelectedCourse(res.course);
      setIsAdvancePhaseModalOpen(false);
      alert(`Course advanced successfully to ${toPhase}!`);
    } catch (err: any) {
      alert(err.message || 'Failed to advance phase');
    }
  };

  const handlePauseCourse = async (course: PanchakarmaCourse) => {
    const reason = prompt('Enter clinical justification for pausing Panchakarma course:');
    if (!reason) return;
    try {
      const updated = await hospitalApi.pausePanchakarmaCourse(course.id, reason);
      setSelectedCourse(updated);
    } catch (err: any) {
      alert(err.message || 'Failed to pause course');
    }
  };

  const handleResumeCourse = async (course: PanchakarmaCourse) => {
    const reason = prompt('Enter clinical notes for resuming Panchakarma course:') || 'Clinical condition stabilized; resuming protocol';
    try {
      const updated = await hospitalApi.resumePanchakarmaCourse(course.id, reason);
      setSelectedCourse(updated);
    } catch (err: any) {
      alert(err.message || 'Failed to resume course');
    }
  };

  const handleTerminateCourse = async (course: PanchakarmaCourse) => {
    const reason = prompt('Enter clinical justification for prematurely terminating Panchakarma course:');
    if (!reason) return;
    try {
      const updated = await hospitalApi.terminatePanchakarmaCourse(course.id, reason);
      setSelectedCourse(updated);
    } catch (err: any) {
      alert(err.message || 'Failed to terminate course');
    }
  };

  return (
    <div className="space-y-4">
      {/* View Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-[#e0e0e0]">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold text-[#161616] tracking-tight">Panchakarma Management Suite</h1>
            <span className="text-[11px] font-mono uppercase tracking-wider text-[#b28600] px-2 py-0.5 bg-[#f1c21b]/15 border border-[#b28600]/30 font-medium">
              Shodhana Chikitsa (5 Classical Purification Therapies)
            </span>
          </div>
          <p className="text-xs text-[#525252] mt-0.5">
            Purvakarma, Pradhanakarma & Paschatkarma stages: Vamana, Virechana, Basti, Nasya & Raktamokshana.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {canManage && (
            <CarbonButton variant="primary" size="sm" onClick={() => setIsModalOpen(true)}>
              + Initiate Panchakarma Course
            </CarbonButton>
          )}
        </div>
      </div>

      {/* Phase 7 Section Switcher */}
      <div className="flex items-center gap-1 border-b border-[#e0e0e0] pb-2 text-xs">
        <button
          onClick={() => setActiveSection('courses')}
          className={`px-3 py-1.5 font-medium transition-colors cursor-pointer flex items-center gap-1.5 ${
            activeSection === 'courses'
              ? 'bg-[#b28600] text-white shadow-xs'
              : 'bg-[#f4f4f4] text-[#161616] hover:bg-[#e0e0e0]'
          }`}
        >
          <Flame className="w-3.5 h-3.5" />
          <span>Active Courses ({courses.length})</span>
        </button>

        <button
          onClick={() => setActiveSection('referrals')}
          className={`px-3 py-1.5 font-medium transition-colors cursor-pointer flex items-center gap-1.5 ${
            activeSection === 'referrals'
              ? 'bg-[#b28600] text-white shadow-xs'
              : 'bg-[#f4f4f4] text-[#161616] hover:bg-[#e0e0e0]'
          }`}
        >
          <FileText className="w-3.5 h-3.5" />
          <span>Pending Referrals ({pendingReferrals.length})</span>
        </button>

        <button
          onClick={() => setActiveSection('phases')}
          className={`px-3 py-1.5 font-medium transition-colors cursor-pointer flex items-center gap-1.5 ${
            activeSection === 'phases'
              ? 'bg-[#b28600] text-white shadow-xs'
              : 'bg-[#f4f4f4] text-[#161616] hover:bg-[#e0e0e0]'
          }`}
        >
          <GitCommit className="w-3.5 h-3.5" />
          <span>Phase Progression & History</span>
        </button>
      </div>

      {activeSection === 'courses' && (
        <>
          {/* Protocol Guide Tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2 text-xs">
        {[
          { name: 'Vamana', target: 'Kapha Dosha', method: 'Therapeutic Emesis' },
          { name: 'Virechana', target: 'Pitta Dosha', method: 'Therapeutic Purgation' },
          { name: 'Basti', target: 'Vata Dosha', method: 'Medicated Enema' },
          { name: 'Nasya', target: 'Urdhvajatru', method: 'Nasal Errhine Drops' },
          { name: 'Raktamokshana', target: 'Rakta / Pitta', method: 'Leech / Bloodletting' }
        ].map((proto) => (
          <div key={proto.name} className="p-2.5 bg-white border border-[#e0e0e0] shadow-2xs">
            <div className="flex items-center gap-1.5 font-semibold text-[#161616]">
              <Flame className="w-3.5 h-3.5 text-[#b28600]" />
              <span>{proto.name}</span>
            </div>
            <div className="text-[10px] text-[#0f62fe] font-mono mt-0.5 font-medium">{proto.target}</div>
            <div className="text-[11px] text-[#525252] mt-1">{proto.method}</div>
          </div>
        ))}
      </div>

      {/* Main Two-Column View */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left Column: Course Registry */}
        <div className="lg:col-span-4 space-y-3">
          <div className="p-3 bg-white border border-[#e0e0e0] shadow-2xs">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-[#525252]" />
              <input
                type="text"
                placeholder="Search courses by patient, protocol, ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-[#f4f4f4] border border-[#8d8d8d] pl-8 pr-2 py-1.5 text-xs text-[#161616] placeholder-[#525252] focus:bg-white focus:border-[#0f62fe] outline-none"
              />
            </div>
          </div>

          <div className="space-y-2">
            {filteredCourses.map((c) => {
              const isSelected = selectedCourse?.id === c.id;
              const percent = Math.round((c.completedDays / (c.totalDays || 1)) * 100);

              return (
                <div
                  key={c.id}
                  onClick={() => setSelectedCourse(c)}
                  className={`p-3 border transition-colors cursor-pointer text-xs shadow-2xs ${
                    isSelected
                      ? 'bg-white border-l-4 border-l-[#f1c21b] border-[#0f62fe]'
                      : 'bg-white border-[#e0e0e0] hover:bg-[#f4f4f4]'
                  }`}
                >
                  <div className="flex items-center justify-between font-semibold text-[#161616]">
                    <span>{c.patientName}</span>
                    <span className="font-mono text-[10px] text-[#b28600] font-semibold">{c.courseNumber}</span>
                  </div>

                  <div className="text-[11px] text-[#0f62fe] mt-1 font-medium truncate">
                    {c.protocol}
                  </div>

                  <div className="text-[10px] text-[#525252] mt-1">
                    Phase: <span className="text-[#161616] font-medium">{c.currentPhase.split('(')[0]}</span>
                  </div>

                  {/* Micro Progress */}
                  <div className="mt-2 flex items-center justify-between text-[10px] font-mono text-[#525252]">
                    <span>Day {c.completedDays} of {c.totalDays}</span>
                    <span className="text-[#161616] font-medium">{percent}%</span>
                  </div>
                  <div className="w-full bg-[#e0e0e0] h-1.5 mt-1">
                    <div className="bg-[#b28600] h-1.5" style={{ width: `${percent}%` }} />
                  </div>
                </div>
              );
            })}

            {filteredCourses.length === 0 && (
              <div className="p-6 text-center text-xs text-[#525252] bg-white border border-[#e0e0e0]">
                No Panchakarma courses matching filter.
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Selected Course Dossier & Daily Session Protocol */}
        <div className="lg:col-span-8">
          {selectedCourse ? (
            <div className="space-y-4">
              {/* Dossier Header */}
              <div className="p-4 bg-white border border-[#e0e0e0] flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-[#b28600] font-semibold">
                      {selectedCourse.courseNumber}
                    </span>
                    <CarbonTag type="yellow" size="sm">
                      {selectedCourse.status.toUpperCase()}
                    </CarbonTag>
                    <span className="text-[11px] font-mono text-[#0f62fe] font-medium">
                      {selectedCourse.completedDays}/{selectedCourse.totalDays} Days Completed
                    </span>
                  </div>
                  <h2 className="text-base font-semibold text-[#161616] mt-1">
                    {selectedCourse.protocol} &bull; {selectedCourse.patientName}{' '}
                    <span className="text-xs font-mono font-normal text-[#525252]">
                      ({selectedCourse.patientMrn})
                    </span>
                  </h2>
                  <p className="text-xs text-[#525252] mt-0.5">
                    Prescribing Vaidya: {selectedCourse.vaidyaName} &bull; Active Phase: {selectedCourse.currentPhase}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  {canRecord && (
                    <CarbonButton
                      variant="primary"
                      size="sm"
                      onClick={() => setIsRecordSessionModalOpen(true)}
                    >
                      + Record Daily Observation
                    </CarbonButton>
                  )}
                  {canManage && selectedCourse.status === 'Active' && (
                    <CarbonButton
                      variant="secondary"
                      size="sm"
                      onClick={() => setIsAdvancePhaseModalOpen(true)}
                    >
                      Advance Phase
                    </CarbonButton>
                  )}
                  {canManage && selectedCourse.status === 'Active' && (
                    <button
                      onClick={() => handlePauseCourse(selectedCourse)}
                      className="px-2 py-1 bg-[#f4f4f4] hover:bg-[#e0e0e0] border border-[#8d8d8d] text-[#b28600] font-medium text-xs flex items-center gap-1 cursor-pointer"
                    >
                      <Pause className="w-3.5 h-3.5" />
                      <span>Pause</span>
                    </button>
                  )}
                  {canManage && selectedCourse.status === 'Paused' && (
                    <button
                      onClick={() => handleResumeCourse(selectedCourse)}
                      className="px-2 py-1 bg-[#defbe6] hover:bg-[#bdf3ca] border border-[#198038]/30 text-[#198038] font-medium text-xs flex items-center gap-1 cursor-pointer"
                    >
                      <Play className="w-3.5 h-3.5" />
                      <span>Resume</span>
                    </button>
                  )}
                  {canManage && selectedCourse.status !== 'Completed' && selectedCourse.status !== 'Cancelled' && (
                    <button
                      onClick={() => handleTerminateCourse(selectedCourse)}
                      className="px-2 py-1 bg-[#fff1f1] hover:bg-[#ffd7d9] border border-[#da1e28]/30 text-[#da1e28] font-medium text-xs flex items-center gap-1 cursor-pointer"
                    >
                      <XCircle className="w-3.5 h-3.5" />
                      <span>Terminate</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Course Protocol Stages */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                <div className={`p-3 border shadow-2xs ${selectedCourse.currentPhase.includes('Purvakarma') ? 'border-[#b28600] bg-[#fcf9e8]' : 'border-[#e0e0e0] bg-white'}`}>
                  <span className="text-[10px] font-mono uppercase text-[#525252] block">Stage 1</span>
                  <span className="font-semibold text-[#161616] block mt-0.5">Purvakarma (Prep)</span>
                  <p className="text-[11px] text-[#525252] mt-1">
                    Deepana-Pachana herbs, Internal Snehapana (medicated ghee titration) & Sarvanga Swedana steam.
                  </p>
                </div>

                <div className={`p-3 border shadow-2xs ${selectedCourse.currentPhase.includes('Pradhanakarma') ? 'border-[#b28600] bg-[#fcf9e8]' : 'border-[#e0e0e0] bg-white'}`}>
                  <span className="text-[10px] font-mono uppercase text-[#525252] block">Stage 2</span>
                  <span className="font-semibold text-[#161616] block mt-0.5">Pradhanakarma (Main)</span>
                  <p className="text-[11px] text-[#525252] mt-1">
                    Active purification procedure (Virechana flush / Niruha Basti / Nasya instillation).
                  </p>
                </div>

                <div className={`p-3 border shadow-2xs ${selectedCourse.currentPhase.includes('Paschatkarma') ? 'border-[#b28600] bg-[#fcf9e8]' : 'border-[#e0e0e0] bg-white'}`}>
                  <span className="text-[10px] font-mono uppercase text-[#525252] block">Stage 3</span>
                  <span className="font-semibold text-[#161616] block mt-0.5">Paschatkarma (Diet)</span>
                  <p className="text-[11px] text-[#525252] mt-1">
                    Gradual Samsarjana Krama dietary reintroduction from liquid Manda to solid food.
                  </p>
                </div>
              </div>

              {/* Samsarjana Krama Dietary Prescription */}
              <div className="p-3 bg-white border-l-4 border-l-[#f1c21b] border-[#e0e0e0] text-xs shadow-2xs">
                <span className="text-[10px] font-mono uppercase text-[#b28600] block font-semibold">Authoritative Dietary Samsarjana Prescription</span>
                <p className="text-[#161616] mt-1 font-medium">{selectedCourse.dietaryPrescription}</p>
              </div>

              {/* Daily Clinical Session Log Table */}
              <CarbonTableWrapper
                headerContent={
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-[#161616] text-xs">
                      Panchakarma Daily Clinical Session Log & Observations
                    </span>
                    <span className="font-mono text-[11px] text-[#525252]">
                      {selectedCourse.dailySessions?.length || 0} Recorded Days
                    </span>
                  </div>
                }
              >
                <table className="w-full text-left text-xs text-[#161616]">
                  <thead className="carbon-table-header bg-[#f4f4f4] text-[#161616] font-mono uppercase text-[10px] border-b border-[#e0e0e0]">
                    <tr>
                      <th className="p-2.5">Day</th>
                      <th className="p-2.5">Phase & Procedure</th>
                      <th className="p-2.5">Vitals (BP/Pulse)</th>
                      <th className="p-2.5">Appetite & Bowel</th>
                      <th className="p-2.5">Observations</th>
                      <th className="p-2.5">Therapist</th>
                      <th className="p-2.5">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#e0e0e0]">
                    {selectedCourse.dailySessions?.map((session) => (
                      <tr key={session.day} className="carbon-table-row hover:bg-[#f4f4f4] transition-colors">
                        <td className="p-2.5 font-mono text-[#b28600] font-semibold">
                          Day {session.day}
                        </td>
                        <td className="p-2.5">
                          <div className="font-medium text-[#161616]">{session.procedureName}</div>
                          <div className="text-[10px] text-[#525252]">{session.phase.split('(')[0]}</div>
                        </td>
                        <td className="p-2.5 font-mono text-[#0f62fe]">
                          {session.bloodPressure} &bull; {session.pulseRate}
                        </td>
                        <td className="p-2.5 text-[#525252]">
                          <div>Appetite: {session.appetiteAssessment}</div>
                          <div className="text-[10px] text-[#525252]">Bowel: {session.bowelStatus}</div>
                        </td>
                        <td className="p-2.5 text-[#525252] max-w-xs truncate" title={session.observations}>
                          {session.observations}
                        </td>
                        <td className="p-2.5 text-[#161616]">{session.therapist}</td>
                        <td className="p-2.5">
                          <span className="inline-flex items-center gap-1 text-[10px] font-mono text-[#198038] font-medium bg-[#defbe6] px-1.5 py-0.5 border border-[#198038]/30">
                            <CheckCircle className="w-3 h-3 text-[#198038]" />
                            Completed
                          </span>
                        </td>
                      </tr>
                    ))}

                    {(!selectedCourse.dailySessions || selectedCourse.dailySessions.length === 0) && (
                      <tr>
                        <td colSpan={7} className="p-6 text-center text-xs text-[#525252]">
                          No daily sessions recorded yet for this course. Click "+ Record Daily Observation" to log Day 1.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </CarbonTableWrapper>
            </div>
          ) : (
            <div className="p-12 text-center text-xs text-[#525252] bg-white border border-[#e0e0e0]">
              Select a Panchakarma course to view its comprehensive clinical dossier.
            </div>
          )}
        </div>
      </div>
        </>
      )}

      {/* PHASE 7: PENDING PANCHAKARMA REFERRALS */}
      {activeSection === 'referrals' && (
        <div className="space-y-4">
          <div className="p-3 bg-white border border-[#e0e0e0] flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
            <div>
              <h2 className="font-semibold text-sm text-[#161616]">Consultation Referrals Pending Conversion</h2>
              <p className="text-xs text-[#525252] mt-0.5">
                Vaidya clinical evaluations requesting classical Panchakarma Shodhana therapy protocols.
              </p>
            </div>
            <span className="text-xs font-mono font-medium text-[#b28600] bg-[#f1c21b]/15 px-2 py-1 border border-[#b28600]/30">
              {pendingReferrals.length} Pending Conversion
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {pendingReferrals.map((ref) => (
              <div key={ref.id} className="p-4 bg-white border border-[#e0e0e0] flex flex-col justify-between space-y-3 shadow-2xs">
                <div>
                  <div className="flex items-center justify-between pb-2 border-b border-[#e0e0e0]">
                    <span className="font-mono text-xs font-bold text-[#b28600]">REFERRAL #{ref.id.slice(-6).toUpperCase()}</span>
                    <CarbonTag type="yellow" size="sm">PENDING</CarbonTag>
                  </div>

                  <div className="mt-2.5">
                    <h3 className="font-semibold text-sm text-[#161616]">{ref.proposedProcedure || 'Classical Shodhana Protocol'}</h3>
                    <div className="text-xs text-[#525252] mt-0.5">
                      Patient: <strong className="text-[#161616]">{ref.patient?.firstName ? `${ref.patient.firstName} ${ref.patient.lastName}` : ref.patientId}</strong>
                    </div>
                    {ref.clinicalIndication && (
                      <p className="text-xs text-[#525252] mt-1.5 italic bg-[#f4f4f4] p-1.5 border border-[#e0e0e0]">
                        Indication: "{ref.clinicalIndication}"
                      </p>
                    )}
                    {ref.precautions && (
                      <div className="text-[11px] text-[#da1e28] mt-1.5 font-mono">
                        Precautions: {ref.precautions}
                      </div>
                    )}
                  </div>
                </div>

                <div className="pt-2 border-t border-[#e0e0e0]">
                  {canManage ? (
                    <button
                      onClick={() => {
                        setSelectedReferral(ref);
                        setIsConvertModalOpen(true);
                      }}
                      className="w-full py-1.5 bg-[#b28600] hover:bg-[#8e6a00] text-white font-medium text-xs flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
                    >
                      <span>Convert to Active Course</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  ) : (
                    <div className="text-center text-xs text-[#525252]">Requires Vaidya or Admin role</div>
                  )}
                </div>
              </div>
            ))}

            {pendingReferrals.length === 0 && (
              <div className="col-span-full p-8 text-center text-xs text-[#525252] bg-white border border-[#e0e0e0]">
                No pending Panchakarma referrals. Clinicians can create referrals during clinical consultations.
              </div>
            )}
          </div>
        </div>
      )}

      {/* PHASE 7: PHASE PROGRESSION & TRANSITIONS */}
      {activeSection === 'phases' && (
        <div className="space-y-4">
          <div className="p-4 bg-white border border-[#e0e0e0] shadow-2xs">
            <h2 className="font-semibold text-sm text-[#161616]">Classical Shodhana Three-Stage Phase Progression</h2>
            <p className="text-xs text-[#525252] mt-0.5">
              Strictly enforced clinical milestone progression from Purvakarma to Pradhanakarma to Paschatkarma Samsarjana Krama.
            </p>
          </div>

          {selectedCourse ? (
            <div className="p-4 bg-white border border-[#e0e0e0] space-y-4 shadow-2xs">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-[#e0e0e0]">
                <div>
                  <span className="font-mono text-xs font-bold text-[#b28600]">{selectedCourse.courseNumber}</span>
                  <h3 className="font-semibold text-base text-[#161616] mt-0.5">{selectedCourse.protocol} &bull; {selectedCourse.patientName}</h3>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-[#525252]">Current Stage:</span>
                  <CarbonTag type="purple" size="md">{selectedCourse.currentPhase}</CarbonTag>
                </div>
              </div>

              {/* Visual 3-Stage Progress Path */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className={`p-3 border ${selectedCourse.currentPhase.includes('Purvakarma') ? 'border-[#b28600] bg-[#fcf9e8] shadow-xs' : 'border-[#e0e0e0] bg-[#f4f4f4]'}`}>
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs text-[#161616]">Stage 1: Purvakarma</span>
                    {selectedCourse.currentPhase.includes('Purvakarma') && <span className="text-[10px] font-mono text-[#b28600] font-bold">CURRENT</span>}
                  </div>
                  <p className="text-[11px] text-[#525252] mt-1">Deepana, Pachana herbs, Snehapana ghee titration & Swedana sweat therapies.</p>
                </div>

                <div className={`p-3 border ${selectedCourse.currentPhase.includes('Pradhanakarma') ? 'border-[#b28600] bg-[#fcf9e8] shadow-xs' : 'border-[#e0e0e0] bg-[#f4f4f4]'}`}>
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs text-[#161616]">Stage 2: Pradhanakarma</span>
                    {selectedCourse.currentPhase.includes('Pradhanakarma') && <span className="text-[10px] font-mono text-[#b28600] font-bold">CURRENT</span>}
                  </div>
                  <p className="text-[11px] text-[#525252] mt-1">Primary Shodhana procedure (Vamana emesis / Virechana purgation / Basti enema).</p>
                </div>

                <div className={`p-3 border ${selectedCourse.currentPhase.includes('Paschatkarma') ? 'border-[#b28600] bg-[#fcf9e8] shadow-xs' : 'border-[#e0e0e0] bg-[#f4f4f4]'}`}>
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs text-[#161616]">Stage 3: Paschatkarma</span>
                    {selectedCourse.currentPhase.includes('Paschatkarma') && <span className="text-[10px] font-mono text-[#b28600] font-bold">CURRENT</span>}
                  </div>
                  <p className="text-[11px] text-[#525252] mt-1">Samsarjana Krama dietary reintroduction & Rasayana rejuvenation therapy.</p>
                </div>
              </div>

              {canManage && selectedCourse.status === 'Active' && (
                <div className="pt-2 flex justify-end">
                  <CarbonButton
                    variant="primary"
                    size="sm"
                    onClick={() => setIsAdvancePhaseModalOpen(true)}
                  >
                    Advance Phase Protocol
                  </CarbonButton>
                </div>
              )}
            </div>
          ) : (
            <div className="p-8 text-center text-xs text-[#525252] bg-white border border-[#e0e0e0]">
              Select an active Panchakarma course from the Active Courses tab to inspect its phase progression history.
            </div>
          )}
        </div>
      )}

      {/* Modal: Initiate Panchakarma Course */}
      <CarbonModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Initiate Classical Panchakarma Course"
        primaryButtonText="Prescribe & Start Course"
        secondaryButtonText="Cancel"
        onRequestSubmit={handleCreateCourse}
        size="md"
      >
        <form onSubmit={handleCreateCourse} className="space-y-3 text-xs">
          <div>
            <label className="block text-[11px] text-[#525252] uppercase font-mono mb-1">
              Target Patient *
            </label>
            <select
              value={patientId}
              onChange={(e) => setPatientId(e.target.value)}
              className="w-full bg-[#f4f4f4] text-[#161616] border border-[#8d8d8d] p-2 text-xs focus:bg-white focus:border-[#0f62fe] outline-none"
            >
              {patients.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.firstName} {p.lastName} ({p.mrn})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] text-[#525252] uppercase font-mono mb-1">
              Panchakarma Protocol *
            </label>
            <select
              value={protocol}
              onChange={(e) => setProtocol(e.target.value as PanchakarmaProtocol)}
              className="w-full bg-[#f4f4f4] text-[#161616] border border-[#8d8d8d] p-2 text-xs focus:bg-white focus:border-[#0f62fe] outline-none"
            >
              <option>Vamana (Therapeutic Emesis - Kapha Cleansing)</option>
              <option>Virechana (Therapeutic Purgation - Pitta Cleansing)</option>
              <option>Basti (Medicated Enemas - Classical Karma / Kala / Yoga Basti)</option>
              <option>Nasya (Nasal Errhines & Shiro Shodhana)</option>
              <option>Raktamokshana (Jalaukavacharana / Leech Therapy)</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[11px] text-[#525252] uppercase font-mono mb-1">
                Total Protocol Days
              </label>
              <input
                type="number"
                min="7"
                max="30"
                value={totalDays}
                onChange={(e) => setTotalDays(Number(e.target.value))}
                className="w-full bg-[#f4f4f4] text-[#161616] border border-[#8d8d8d] p-2 text-xs focus:bg-white focus:border-[#0f62fe] outline-none font-mono"
              />
            </div>
            <div>
              <label className="block text-[11px] text-[#525252] uppercase font-mono mb-1">
                Lead Vaidya
              </label>
              <input
                type="text"
                value={vaidyaName}
                onChange={(e) => setVaidyaName(e.target.value)}
                className="w-full bg-[#f4f4f4] text-[#161616] border border-[#8d8d8d] p-2 text-xs focus:bg-white focus:border-[#0f62fe] outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] text-[#525252] uppercase font-mono mb-1">
              Samsarjana Krama Dietary Regimen
            </label>
            <textarea
              rows={2}
              value={dietaryPrescription}
              onChange={(e) => setDietaryPrescription(e.target.value)}
              className="w-full bg-[#f4f4f4] text-[#161616] border border-[#8d8d8d] p-2 text-xs focus:bg-white focus:border-[#0f62fe] outline-none"
            />
          </div>

          <div>
            <label className="block text-[11px] text-[#525252] uppercase font-mono mb-1">
              Clinical Discharge Goal & Post-Care
            </label>
            <input
              type="text"
              placeholder="e.g. Alleviate visceral toxins, recalibrate Pitta fire, rebuild Ojas"
              value={dischargeNotes}
              onChange={(e) => setDischargeNotes(e.target.value)}
              className="w-full bg-[#f4f4f4] text-[#161616] border border-[#8d8d8d] p-2 text-xs focus:bg-white focus:border-[#0f62fe] outline-none"
            />
          </div>
        </form>
      </CarbonModal>

      {/* Modal: Record Daily Session Observation */}
      <CarbonModal
        isOpen={isRecordSessionModalOpen}
        onClose={() => setIsRecordSessionModalOpen(false)}
        title={`Record Observation - Day ${(selectedCourse?.dailySessions?.length || 0) + 1}`}
        primaryButtonText="Save Observation"
        secondaryButtonText="Cancel"
        onRequestSubmit={handleRecordSessionSubmit}
        size="md"
      >
        <form onSubmit={handleRecordSessionSubmit} className="space-y-3 text-xs">
          <div>
            <label className="block text-[11px] text-[#525252] uppercase font-mono mb-1">
              Clinical Stage
            </label>
            <select
              value={sessionPhase}
              onChange={(e) => setSessionPhase(e.target.value as any)}
              className="w-full bg-[#f4f4f4] text-[#161616] border border-[#8d8d8d] p-2 text-xs focus:bg-white focus:border-[#0f62fe] outline-none"
            >
              <option>Purvakarma (Prep/Snehana-Swedana)</option>
              <option>Pradhanakarma (Main Procedure)</option>
              <option>Paschatkarma (Dietary Samsarjana)</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[11px] text-[#525252] uppercase font-mono mb-1">
                Procedure Executed *
              </label>
              <input
                type="text"
                required
                value={procedureName}
                onChange={(e) => setProcedureName(e.target.value)}
                className="w-full bg-[#f4f4f4] text-[#161616] border border-[#8d8d8d] p-2 text-xs focus:bg-white focus:border-[#0f62fe] outline-none"
              />
            </div>
            <div>
              <label className="block text-[11px] text-[#525252] uppercase font-mono mb-1">
                Attending Therapist
              </label>
              <input
                type="text"
                value={therapist}
                onChange={(e) => setTherapist(e.target.value)}
                className="w-full bg-[#f4f4f4] text-[#161616] border border-[#8d8d8d] p-2 text-xs focus:bg-white focus:border-[#0f62fe] outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[11px] text-[#525252] uppercase font-mono mb-1">
                Blood Pressure
              </label>
              <input
                type="text"
                value={bloodPressure}
                onChange={(e) => setBloodPressure(e.target.value)}
                className="w-full bg-[#f4f4f4] text-[#161616] border border-[#8d8d8d] p-2 text-xs focus:bg-white focus:border-[#0f62fe] outline-none font-mono"
              />
            </div>
            <div>
              <label className="block text-[11px] text-[#525252] uppercase font-mono mb-1">
                Pulse Rate
              </label>
              <input
                type="text"
                value={pulseRate}
                onChange={(e) => setPulseRate(e.target.value)}
                className="w-full bg-[#f4f4f4] text-[#161616] border border-[#8d8d8d] p-2 text-xs focus:bg-white focus:border-[#0f62fe] outline-none font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[11px] text-[#525252] uppercase font-mono mb-1">
                Appetite / Agni
              </label>
              <input
                type="text"
                value={appetiteAssessment}
                onChange={(e) => setAppetiteAssessment(e.target.value)}
                className="w-full bg-[#f4f4f4] text-[#161616] border border-[#8d8d8d] p-2 text-xs focus:bg-white focus:border-[#0f62fe] outline-none"
              />
            </div>
            <div>
              <label className="block text-[11px] text-[#525252] uppercase font-mono mb-1">
                Bowel Movement
              </label>
              <input
                type="text"
                value={bowelStatus}
                onChange={(e) => setBowelStatus(e.target.value)}
                className="w-full bg-[#f4f4f4] text-[#161616] border border-[#8d8d8d] p-2 text-xs focus:bg-white focus:border-[#0f62fe] outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] text-[#525252] uppercase font-mono mb-1">
              Physiological Observations & Tolerance
            </label>
            <textarea
              rows={2}
              value={observations}
              onChange={(e) => setObservations(e.target.value)}
              className="w-full bg-[#f4f4f4] text-[#161616] border border-[#8d8d8d] p-2 text-xs focus:bg-white focus:border-[#0f62fe] outline-none"
            />
          </div>
        </form>
      </CarbonModal>

      {/* Modal: Convert Panchakarma Referral to Active Course */}
      <CarbonModal
        isOpen={isConvertModalOpen && !!selectedReferral}
        onClose={() => {
          setIsConvertModalOpen(false);
          setSelectedReferral(null);
        }}
        title={`Convert Referral to Active Course: ${selectedReferral?.proposedProcedure || ''}`}
        primaryButtonText="Confirm & Initiate Course"
        secondaryButtonText="Cancel"
        onRequestSubmit={handleConvertReferralSubmit}
        size="md"
      >
        <form onSubmit={handleConvertReferralSubmit} className="space-y-3 text-xs">
          <div className="p-2.5 bg-[#edf5ff] border-l-4 border-l-[#0f62fe] text-xs text-[#0043ce]">
            Converting this clinical referral establishes an authoritative Panchakarma course record and enables stage-gated phase tracking.
          </div>

          <div>
            <label className="block text-[11px] text-[#525252] uppercase font-mono mb-1">
              Attending Vaidya *
            </label>
            <select
              value={convertVaidyaId}
              onChange={(e) => setConvertVaidyaId(e.target.value)}
              className="w-full bg-[#f4f4f4] text-[#161616] border border-[#8d8d8d] p-2 text-xs focus:bg-white focus:border-[#0f62fe] outline-none"
            >
              {responsibleVaidyas.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name} ({v.designation || 'Vaidya'})
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[11px] text-[#525252] uppercase font-mono mb-1">
                Course Start Date *
              </label>
              <input
                type="date"
                required
                value={convertStartDate}
                onChange={(e) => setConvertStartDate(e.target.value)}
                className="w-full bg-[#f4f4f4] text-[#161616] border border-[#8d8d8d] p-2 text-xs font-mono outline-none"
              />
            </div>
            <div>
              <label className="block text-[11px] text-[#525252] uppercase font-mono mb-1">
                Planned Protocol Days *
              </label>
              <input
                type="number"
                min="7"
                max="60"
                required
                value={convertTotalDays}
                onChange={(e) => setConvertTotalDays(Number(e.target.value))}
                className="w-full bg-[#f4f4f4] text-[#161616] border border-[#8d8d8d] p-2 text-xs font-mono outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[11px] text-[#525252] uppercase font-mono mb-1">
                Billing Mode
              </label>
              <select
                value={convertBillingMode}
                onChange={(e) => setConvertBillingMode(e.target.value as any)}
                className="w-full bg-[#f4f4f4] text-[#161616] border border-[#8d8d8d] p-2 text-xs"
              >
                <option value="PACKAGE">Comprehensive Course Package</option>
                <option value="PER_SESSION">Itemized Per-Session Tariff</option>
              </select>
            </div>
            {convertBillingMode === 'PACKAGE' && (
              <div>
                <label className="block text-[11px] text-[#525252] uppercase font-mono mb-1">
                  Package Amount (₹)
                </label>
                <input
                  type="number"
                  min="0"
                  value={convertCustomAmount}
                  onChange={(e) => setConvertCustomAmount(Number(e.target.value))}
                  className="w-full bg-[#f4f4f4] text-[#161616] border border-[#8d8d8d] p-2 text-xs font-mono outline-none"
                />
              </div>
            )}
          </div>

          <div>
            <label className="block text-[11px] text-[#525252] uppercase font-mono mb-1">
              Samsarjana Krama Dietary Regimen
            </label>
            <textarea
              rows={2}
              value={convertDietary}
              onChange={(e) => setConvertDietary(e.target.value)}
              className="w-full bg-[#f4f4f4] text-[#161616] border border-[#8d8d8d] p-2 text-xs"
            />
          </div>
        </form>
      </CarbonModal>

      {/* Modal: Advance Panchakarma Phase */}
      <CarbonModal
        isOpen={isAdvancePhaseModalOpen}
        onClose={() => setIsAdvancePhaseModalOpen(false)}
        title={`Advance Panchakarma Phase: ${selectedCourse?.courseNumber || ''}`}
        primaryButtonText="Authorize Phase Transition"
        secondaryButtonText="Cancel"
        onRequestSubmit={handleAdvancePhaseSubmit}
        size="md"
      >
        <form onSubmit={handleAdvancePhaseSubmit} className="space-y-3 text-xs">
          <div className="p-2.5 bg-[#edf5ff] border-l-4 border-l-[#0f62fe] text-xs text-[#0043ce]">
            <strong>Clinical Gating:</strong> Advancing Phase requires attending Vaidya confirmation of Samyak Snigdha / Swinna signs and vital stability.
          </div>

          <div>
            <label className="block text-[11px] text-[#525252] uppercase font-mono mb-1">
              Transition To Stage *
            </label>
            <select
              value={toPhase}
              onChange={(e) => setToPhase(e.target.value as any)}
              className="w-full bg-[#f4f4f4] text-[#161616] border border-[#8d8d8d] p-2 text-xs font-bold"
            >
              <option value="PRADHANAKARMA">Stage 2: Pradhanakarma (Main Procedure)</option>
              <option value="PASCHATKARMA">Stage 3: Paschatkarma (Dietary Samsarjana & Post-Care)</option>
              <option value="PURVAKARMA">Stage 1: Purvakarma (Reset/Re-preparation)</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] text-[#525252] uppercase font-mono mb-1">
              Mandatory Clinical Rationale Notes *
            </label>
            <textarea
              required
              rows={3}
              placeholder="Document observed signs, Agni status, koshta response justifying progression..."
              value={phaseRationale}
              onChange={(e) => setPhaseRationale(e.target.value)}
              className="w-full bg-[#f4f4f4] text-[#161616] border border-[#8d8d8d] p-2 text-xs"
            />
          </div>

          <div className="grid grid-cols-4 gap-2 font-mono">
            <div>
              <label className="block text-[9px] text-[#525252] uppercase mb-1">BP Systolic</label>
              <input
                type="number"
                value={phaseBpSystolic}
                onChange={(e) => setPhaseBpSystolic(Number(e.target.value))}
                className="w-full bg-[#f4f4f4] border border-[#8d8d8d] p-1.5 text-xs font-mono"
              />
            </div>
            <div>
              <label className="block text-[9px] text-[#525252] uppercase mb-1">BP Diastolic</label>
              <input
                type="number"
                value={phaseBpDiastolic}
                onChange={(e) => setPhaseBpDiastolic(Number(e.target.value))}
                className="w-full bg-[#f4f4f4] border border-[#8d8d8d] p-1.5 text-xs font-mono"
              />
            </div>
            <div>
              <label className="block text-[9px] text-[#525252] uppercase mb-1">Pulse (bpm)</label>
              <input
                type="number"
                value={phasePulse}
                onChange={(e) => setPhasePulse(Number(e.target.value))}
                className="w-full bg-[#f4f4f4] border border-[#8d8d8d] p-1.5 text-xs font-mono"
              />
            </div>
            <div>
              <label className="block text-[9px] text-[#525252] uppercase mb-1">Agni Status</label>
              <select
                value={phaseAgni}
                onChange={(e) => setPhaseAgni(e.target.value)}
                className="w-full bg-[#f4f4f4] border border-[#8d8d8d] p-1.5 text-xs"
              >
                <option value="SAMA">Sama</option>
                <option value="VISHAMA">Vishama</option>
                <option value="TIKSHNA">Tikshna</option>
                <option value="MANDA">Manda</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-[11px] text-[#525252] uppercase font-mono mb-1">
              Samyak Lakshanas Observed (Proper Signs)
            </label>
            <input
              type="text"
              placeholder="e.g. Vatanulomana, Dehalaghava, Snehodvega"
              value={samayakLakshanas}
              onChange={(e) => setSamayakLakshanas(e.target.value)}
              className="w-full bg-[#f4f4f4] text-[#161616] border border-[#8d8d8d] p-2 text-xs"
            />
          </div>

          <div>
            <label className="block text-[11px] text-[#525252] uppercase font-mono mb-1">
              Asamyak Lakshanas Observed (Deficiency / Complications)
            </label>
            <input
              type="text"
              placeholder="Leave blank if classical equilibrium attained"
              value={asamyakLakshanas}
              onChange={(e) => setAsamyakLakshanas(e.target.value)}
              className="w-full bg-[#f4f4f4] text-[#161616] border border-[#8d8d8d] p-2 text-xs"
            />
          </div>
        </form>
      </CarbonModal>
    </div>
  );
};
