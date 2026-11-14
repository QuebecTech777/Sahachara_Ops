import React, { useState, useEffect } from 'react';
import {
  HandHeart,
  Plus,
  Search,
  Filter,
  CheckCircle,
  Clock,
  Calendar,
  User,
  Building,
  Activity,
  ArrowRight,
  TrendingUp,
  Sparkles,
  Layers,
  Award,
  CheckCircle2,
  DoorOpen,
  Wrench,
  AlertTriangle,
  Play,
  XCircle,
  ShieldCheck,
  RotateCcw
} from 'lucide-react';
import {
  TreatmentPlan,
  Patient,
  Doctor,
  AppUser,
  TherapyType,
  TherapyRoom,
  TherapySession,
  StaffMember
} from '../types/hospital';
import { CarbonButton } from '../components/carbon/CarbonButton';
import { CarbonTag } from '../components/carbon/CarbonTag';
import { CarbonTile } from '../components/carbon/CarbonTile';
import { CarbonModal } from '../components/carbon/CarbonModal';
import { CarbonProgressBar, CarbonStepProgress } from '../components/carbon/CarbonProgressIndicator';
import { hospitalApi } from '../services/hospitalApi';

interface TreatmentsManagementViewProps {
  treatments: TreatmentPlan[];
  patients: Patient[];
  doctors: Doctor[];
  currentUser: AppUser;
  onCreateTreatment: (plan: Partial<TreatmentPlan>) => Promise<TreatmentPlan>;
  onUpdateTreatment: (id: string, updates: Partial<TreatmentPlan>) => Promise<TreatmentPlan>;
}

export const TreatmentsManagementView: React.FC<TreatmentsManagementViewProps> = ({
  treatments,
  patients,
  doctors,
  currentUser,
  onCreateTreatment,
  onUpdateTreatment
}) => {
  const [activeSection, setActiveSection] = useState<'plans' | 'rooms' | 'sessions'>('plans');
  const [activeTab, setActiveTab] = useState<'all' | 'active' | 'completed' | 'planned'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isTrackerCollapsed, setIsTrackerCollapsed] = useState(false);

  // Phase 7: Therapy Rooms & Staff State
  const [therapyRooms, setTherapyRooms] = useState<TherapyRoom[]>([]);
  const [therapySessions, setTherapySessions] = useState<TherapySession[]>([]);
  const [eligibleStaff, setEligibleStaff] = useState<StaffMember[]>([]);
  const [responsibleVaidyas, setResponsibleVaidyas] = useState<StaffMember[]>([]);
  const [loadingData, setLoadingData] = useState(false);

  // Room Maintenance Modal State
  const [selectedRoom, setSelectedRoom] = useState<TherapyRoom | null>(null);
  const [isMaintenanceModalOpen, setIsMaintenanceModalOpen] = useState(false);
  const [maintenanceReason, setMaintenanceReason] = useState('Routine mechanical servicing of Droni table and steam generator');

  // Schedule Session Modal State
  const [isScheduleSessionModalOpen, setIsScheduleSessionModalOpen] = useState(false);
  const [schedulePatientId, setSchedulePatientId] = useState(patients[0]?.id || '');
  const [scheduleRoomId, setScheduleRoomId] = useState('');
  const [scheduleStaffId, setScheduleStaffId] = useState('');
  const [scheduleVaidyaId, setScheduleVaidyaId] = useState('');
  const [scheduleTherapyType, setScheduleTherapyType] = useState('Abhyanga (Herbal Full Body Massage)');
  const [scheduleStartTime, setScheduleStartTime] = useState(new Date(Date.now() + 3600000).toISOString().slice(0, 16));
  const [scheduleEndTime, setScheduleEndTime] = useState(new Date(Date.now() + 7200000).toISOString().slice(0, 16));
  const [scheduleBuffer, setScheduleBuffer] = useState(15);
  const [scheduleError, setScheduleError] = useState<string | null>(null);

  // Session Execution State (Pre-Procedure / Start)
  const [sessionToStart, setSessionToStart] = useState<TherapySession | null>(null);
  const [preBpSystolic, setPreBpSystolic] = useState(120);
  const [preBpDiastolic, setPreBpDiastolic] = useState(80);
  const [preHeartRate, setPreHeartRate] = useState(72);
  const [preAgniStatus, setPreAgniStatus] = useState<'SAMA' | 'VISHAMA' | 'TIKSHNA' | 'MANDA'>('SAMA');
  const [preVaidyaClearance, setPreVaidyaClearance] = useState(true);
  const [preNotes, setPreNotes] = useState('Patient resting comfortably; Koshta and Agni assessed suitable for protocol.');

  // Session Execution State (Post-Procedure / Complete)
  const [sessionToComplete, setSessionToComplete] = useState<TherapySession | null>(null);
  const [postBpSystolic, setPostBpSystolic] = useState(118);
  const [postBpDiastolic, setPostBpDiastolic] = useState(76);
  const [postHeartRate, setPostHeartRate] = useState(70);
  const [postTolerance, setPostTolerance] = useState<'EXCELLENT' | 'GOOD' | 'FAIR' | 'POOR'>('GOOD');
  const [postProcedureNotes, setPostProcedureNotes] = useState('Full body synchronized strokes executed; gentle steam applied; skin adequately lubricated.');
  const [postComplications, setPostComplications] = useState('');

  // Session Abort State
  const [sessionToAbort, setSessionToAbort] = useState<TherapySession | null>(null);
  const [abortReason, setAbortReason] = useState('');

  const canManage = ['SUPER_ADMIN', 'ADMIN', 'VAIDYA'].includes(currentUser.role);
  const canAdminister = ['SUPER_ADMIN', 'ADMIN', 'VAIDYA', 'DOCTOR'].includes(currentUser.role);

  const loadPhase7Data = async () => {
    try {
      setLoadingData(true);
      const [rooms, sessions, staff, vaidyas] = await Promise.all([
        hospitalApi.getTherapyRooms().catch(() => []),
        hospitalApi.getTherapySessions().catch(() => []),
        hospitalApi.getEligibleAdministeringStaff().catch(() => []),
        hospitalApi.getResponsibleVaidyas().catch(() => [])
      ]);
      setTherapyRooms(rooms);
      setTherapySessions(sessions);
      setEligibleStaff(staff);
      setResponsibleVaidyas(vaidyas);
      if (rooms.length > 0 && !scheduleRoomId) setScheduleRoomId(rooms[0].id);
      if (staff.length > 0 && !scheduleStaffId) setScheduleStaffId(staff[0].id);
      if (vaidyas.length > 0 && !scheduleVaidyaId) setScheduleVaidyaId(vaidyas[0].id);
    } catch (err) {
      console.warn('Error loading Phase 7 clinical data:', err);
    } finally {
      setLoadingData(false);
    }
  };

  useEffect(() => {
    loadPhase7Data();
  }, []);

  // Form State for New Treatment Plan
  const [patientId, setPatientId] = useState(patients[0]?.id || '');
  const [therapyType, setTherapyType] = useState<TherapyType>('Abhyanga (Herbal Full Body Massage)');
  const [clinicalObjective, setClinicalObjective] = useState('');
  const [oilOrFormulation, setOilOrFormulation] = useState('Sahacharadi Thailam');
  const [totalSessions, setTotalSessions] = useState(7);
  const [frequency, setFrequency] = useState<'Daily' | 'Alternate Days' | 'Twice Weekly' | 'Weekly'>('Daily');
  const [assignedTherapist, setAssignedTherapist] = useState('');
  const [roomNumber, setRoomNumber] = useState('Therapy Suite 01');
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');

  const [availableTherapists, setAvailableTherapists] = useState<StaffMember[]>([]);

  useEffect(() => {
    let mounted = true;
    hospitalApi.getStaff().then((staffList) => {
      if (mounted && Array.isArray(staffList)) {
        const therapists = staffList.filter(
          (s) => s.designation?.toLowerCase().includes('therapist') || s.role === 'DOCTOR' || s.role === 'VAIDYA'
        );
        setAvailableTherapists(therapists);
        if (therapists.length > 0 && !assignedTherapist) {
          setAssignedTherapist(therapists[0].name);
        }
      }
    }).catch(() => {});
    return () => { mounted = false; };
  }, []);

  const [recordingSessionPlanId, setRecordingSessionPlanId] = useState<string | null>(null);
  const [sessionNotes, setSessionNotes] = useState('');

  // Ongoing Active Plans & Progress Metrics
  const ongoingPlans = treatments.filter(
    (t) => t.status === 'active' || (t.status !== 'completed' && t.completedSessions > 0)
  );
  const displayOngoing = ongoingPlans.length > 0 ? ongoingPlans : treatments.filter((t) => t.status !== 'completed').slice(0, 3);
  const totalActiveSessions = ongoingPlans.reduce((sum, t) => sum + t.totalSessions, 0);
  const totalCompletedActiveSessions = ongoingPlans.reduce((sum, t) => sum + t.completedSessions, 0);
  const overallActiveProgressPercent =
    totalActiveSessions > 0 ? Math.round((totalCompletedActiveSessions / totalActiveSessions) * 100) : 0;

  const filteredPlans = treatments.filter((t) => {
    const matchesSearch =
      t.patientName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.patientMrn.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.planNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.therapyType.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.oilOrFormulation.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesTab = activeTab === 'all' || t.status === activeTab;
    return matchesSearch && matchesTab;
  });

  const handleCreate = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const pat = patients.find((p) => p.id === patientId) || patients[0];
    const doc = doctors[0] || { name: currentUser.name, id: currentUser.id };

    await onCreateTreatment({
      patientId: pat.id,
      patientName: `${pat.firstName} ${pat.lastName}`,
      patientMrn: pat.mrn,
      doctorId: doc.id,
      doctorName: doc.name,
      therapyType,
      clinicalObjective: clinicalObjective || `Classical ${therapyType} therapy for doshic stabilization`,
      oilOrFormulation,
      totalSessions,
      frequency,
      assignedTherapist,
      roomNumber,
      startDate,
      notes
    });

    setIsModalOpen(false);
    setClinicalObjective('');
    setNotes('');
  };

  const handleRecordSession = async (plan: TreatmentPlan) => {
    const nextCompleted = plan.completedSessions + 1;
    const isNowCompleted = nextCompleted >= plan.totalSessions;
    await onUpdateTreatment(plan.id, {
      completedSessions: nextCompleted,
      status: isNowCompleted ? 'completed' : 'active',
      lastSessionDate: new Date().toISOString().split('T')[0],
      notes: sessionNotes ? `${plan.notes} | Session ${nextCompleted}: ${sessionNotes}` : plan.notes
    });
    setRecordingSessionPlanId(null);
    setSessionNotes('');
  };

  // Phase 7 Action Handlers
  const handleEnterMaintenanceSubmit = async () => {
    if (!selectedRoom) return;
    try {
      await hospitalApi.enterRoomMaintenance(selectedRoom.id, maintenanceReason);
      setIsMaintenanceModalOpen(false);
      setSelectedRoom(null);
      await loadPhase7Data();
    } catch (err: any) {
      alert(err.message || 'Failed to enter maintenance');
    }
  };

  const handleExitMaintenance = async (room: TherapyRoom) => {
    try {
      await hospitalApi.exitRoomMaintenance(room.id);
      await loadPhase7Data();
    } catch (err: any) {
      alert(err.message || 'Failed to exit maintenance');
    }
  };

  const handleRecordSanitization = async (room: TherapyRoom) => {
    try {
      await hospitalApi.recordRoomSanitization(room.id, currentUser.id, 'Disinfected and prepared with herbal fumigation');
      await loadPhase7Data();
    } catch (err: any) {
      alert(err.message || 'Failed to record sanitization');
    }
  };

  const handleReconcileStale = async (room: TherapyRoom) => {
    try {
      await hospitalApi.reconcileStaleRoom(room.id);
      await loadPhase7Data();
    } catch (err: any) {
      alert(err.message || 'Failed to reconcile room status');
    }
  };

  const handleScheduleSessionSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setScheduleError(null);
    try {
      await hospitalApi.scheduleTherapySession({
        patientId: schedulePatientId,
        roomId: scheduleRoomId,
        administeringStaffId: scheduleStaffId,
        responsibleVaidyaId: scheduleVaidyaId,
        therapyType: scheduleTherapyType,
        scheduledStartTime: new Date(scheduleStartTime).toISOString(),
        scheduledEndTime: new Date(scheduleEndTime).toISOString(),
        turnaroundBufferMinutes: Number(scheduleBuffer)
      });
      setIsScheduleSessionModalOpen(false);
      await loadPhase7Data();
    } catch (err: any) {
      setScheduleError(err.message || 'Failed to schedule session');
    }
  };

  const handleStartSessionSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!sessionToStart) return;
    try {
      await hospitalApi.startTherapySession(sessionToStart.id, {
        preAssessment: {
          bpSystolic: Number(preBpSystolic),
          bpDiastolic: Number(preBpDiastolic),
          heartRate: Number(preHeartRate),
          agniStatus: preAgniStatus,
          vaidyaClearanceConfirmed: preVaidyaClearance,
          clinicalNotes: preNotes
        }
      });
      setSessionToStart(null);
      await loadPhase7Data();
    } catch (err: any) {
      alert(err.message || 'Failed to start therapy session');
    }
  };

  const handleCompleteSessionSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!sessionToComplete) return;
    try {
      await hospitalApi.completeTherapySession(sessionToComplete.id, {
        postAssessment: {
          bpSystolic: Number(postBpSystolic),
          bpDiastolic: Number(postBpDiastolic),
          heartRate: Number(postHeartRate),
          patientTolerance: postTolerance,
          procedureNotes: postProcedureNotes,
          complications: postComplications || undefined
        }
      });
      setSessionToComplete(null);
      await loadPhase7Data();
    } catch (err: any) {
      alert(err.message || 'Failed to complete therapy session');
    }
  };

  const handleAbortSessionSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!sessionToAbort) return;
    try {
      await hospitalApi.abortTherapySession(sessionToAbort.id, {
        clinicalNotes: abortReason
      });
      setSessionToAbort(null);
      setAbortReason('');
      await loadPhase7Data();
    } catch (err: any) {
      alert(err.message || 'Failed to abort therapy session');
    }
  };

  const handleCancelSession = async (sessionId: string) => {
    const reason = prompt('Reason for cancelling therapy session:');
    if (!reason) return;
    try {
      await hospitalApi.cancelTherapySession(sessionId, reason);
      await loadPhase7Data();
    } catch (err: any) {
      alert(err.message || 'Failed to cancel session');
    }
  };

  const handleNoShowSession = async (sessionId: string) => {
    if (!confirm('Mark this therapy session as No-Show?')) return;
    try {
      await hospitalApi.noShowTherapySession(sessionId, 'Patient did not arrive');
      await loadPhase7Data();
    } catch (err: any) {
      alert(err.message || 'Failed to mark no-show');
    }
  };

  return (
    <div className="space-y-4">
      {/* View Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-[#e0e0e0]">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 bg-[#8a3ffc]/10 border border-[#8a3ffc]/30 flex items-center justify-center shrink-0">
            <HandHeart className="w-5 h-5 text-[#8a3ffc]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold text-[#161616] tracking-tight">Ayurvedic Therapy Management</h1>
              <span className="text-[11px] font-mono uppercase tracking-wider text-[#8a3ffc] px-2 py-0.5 bg-[#8a3ffc]/10 border border-[#8a3ffc]/30">
                Chikitsa Upakrama
              </span>
            </div>
            <p className="text-xs text-[#525252] mt-0.5">
              Active therapy courses: Abhyanga, Shirodhara, Pizhichil, Kizhi, Basti series & therapist tracking.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {canManage && (
            <>
              <CarbonButton
                variant="secondary"
                size="sm"
                onClick={() => setIsScheduleSessionModalOpen(true)}
              >
                + Schedule Session
              </CarbonButton>
              <CarbonButton
                variant="primary"
                size="sm"
                onClick={() => setIsModalOpen(true)}
              >
                + Create Therapy Plan
              </CarbonButton>
            </>
          )}
        </div>
      </div>

      {/* Phase 7 Section Switcher */}
      <div className="flex items-center gap-1 border-b border-[#e0e0e0] pb-2 text-xs">
        <button
          onClick={() => setActiveSection('plans')}
          className={`px-3 py-1.5 font-medium transition-colors cursor-pointer flex items-center gap-1.5 ${
            activeSection === 'plans'
              ? 'bg-[#8a3ffc] text-white shadow-xs'
              : 'bg-[#f4f4f4] text-[#161616] hover:bg-[#e0e0e0]'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          <span>Therapy Plans & Protocols ({treatments.length})</span>
        </button>

        <button
          onClick={() => setActiveSection('rooms')}
          className={`px-3 py-1.5 font-medium transition-colors cursor-pointer flex items-center gap-1.5 ${
            activeSection === 'rooms'
              ? 'bg-[#8a3ffc] text-white shadow-xs'
              : 'bg-[#f4f4f4] text-[#161616] hover:bg-[#e0e0e0]'
          }`}
        >
          <DoorOpen className="w-3.5 h-3.5" />
          <span>Therapy Suites & Sanitation ({therapyRooms.length})</span>
        </button>

        <button
          onClick={() => setActiveSection('sessions')}
          className={`px-3 py-1.5 font-medium transition-colors cursor-pointer flex items-center gap-1.5 ${
            activeSection === 'sessions'
              ? 'bg-[#8a3ffc] text-white shadow-xs'
              : 'bg-[#f4f4f4] text-[#161616] hover:bg-[#e0e0e0]'
          }`}
        >
          <Calendar className="w-3.5 h-3.5" />
          <span>Session Schedule & Execution ({therapySessions.length})</span>
        </button>
      </div>

      {activeSection === 'plans' && (
        <>
          {/* Metric Tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="p-3 bg-white border border-[#e0e0e0] shadow-2xs">
          <span className="text-[11px] font-mono uppercase text-[#525252] block">Total Therapy Plans</span>
          <span className="text-2xl font-mono font-semibold text-[#161616] mt-1 block tabular-nums">
            {treatments.length}
          </span>
          <span className="text-[10px] text-[#0f62fe] mt-0.5 block font-medium">Recorded in SahacharaOS</span>
        </div>

        <div className="p-3 bg-white border border-[#e0e0e0] shadow-2xs">
          <span className="text-[11px] font-mono uppercase text-[#525252] block">Active In-Progress</span>
          <span className="text-2xl font-mono font-semibold text-[#0f62fe] mt-1 block tabular-nums">
            {treatments.filter((t) => t.status === 'active').length}
          </span>
          <span className="text-[10px] text-[#198038] mt-0.5 block font-medium">Active clinical sessions</span>
        </div>

        <div className="p-3 bg-white border border-[#e0e0e0] shadow-2xs">
          <span className="text-[11px] font-mono uppercase text-[#525252] block">Completed Courses</span>
          <span className="text-2xl font-mono font-semibold text-[#198038] mt-1 block tabular-nums">
            {treatments.filter((t) => t.status === 'completed').length}
          </span>
          <span className="text-[10px] text-[#525252] mt-0.5 block">Full course adherence</span>
        </div>

        <div className="p-3 bg-white border border-[#e0e0e0] shadow-2xs">
          <span className="text-[11px] font-mono uppercase text-[#525252] block">Total Sessions Executed</span>
          <span className="text-2xl font-mono font-semibold text-[#b28600] mt-1 block tabular-nums">
            {treatments.reduce((acc, t) => acc + t.completedSessions, 0)}
          </span>
          <span className="text-[10px] text-[#525252] mt-0.5 block">Across all therapy suites</span>
        </div>
      </div>

      {/* Visual Progress Tracker for Ongoing Ayurvedic Therapy Plans */}
      <div className="bg-white border border-[#e0e0e0] p-4 sm:p-5 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#e0e0e0] mb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-[#8a3ffc] text-white flex items-center justify-center font-bold text-xs shrink-0 shadow-xs">
              <TrendingUp className="w-4 h-4 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-[#161616] tracking-tight leading-none">
                  Ongoing Therapy Progress Tracker
                </h2>
                <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 bg-[#8a3ffc]/10 text-[#8a3ffc] border border-[#8a3ffc]/30 font-semibold">
                  Chikitsa Adherence
                </span>
              </div>
              <p className="text-[12px] text-[#525252] mt-1">
                Visual percentage completion and multi-step session milestones for active Ayurvedic therapies
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2 text-xs font-mono text-[#525252]">
              <span className="w-2 h-2 rounded-full bg-[#24a148] animate-pulse" />
              <span>{displayOngoing.length} Courses Tracked ({overallActiveProgressPercent}% Avg Adherence)</span>
            </div>
            <button
              type="button"
              onClick={() => setIsTrackerCollapsed((prev) => !prev)}
              className="text-xs text-[#0f62fe] hover:underline font-mono flex items-center gap-1 cursor-pointer"
            >
              {isTrackerCollapsed ? 'Expand Tracker' : 'Collapse Tracker'}
            </button>
          </div>
        </div>

        {/* Tracker Body */}
        {!isTrackerCollapsed && (
          <div className="space-y-4">
            {displayOngoing.length === 0 ? (
              <div className="p-6 text-center bg-[#f4f4f4] border border-dashed border-[#e0e0e0] text-[#525252] text-xs">
                No active ongoing therapies currently in progress. Create a new therapy plan below.
              </div>
            ) : (
              displayOngoing.map((plan) => {
                const progressPercent = Math.round((plan.completedSessions / (plan.totalSessions || 1)) * 100);
                const isCompleted = plan.status === 'completed' || plan.completedSessions >= plan.totalSessions;

                // Multi-step session items for CarbonStepProgress
                const sessionSteps = Array.from({ length: plan.totalSessions }, (_, i) => {
                  const sessionNum = i + 1;
                  const isComplete = sessionNum <= plan.completedSessions;
                  const isCurrent = sessionNum === plan.completedSessions + 1 && !isCompleted;
                  return {
                    id: `step-${plan.id}-${sessionNum}`,
                    label: `Session ${sessionNum}`,
                    secondaryLabel: isComplete ? 'Complete' : isCurrent ? 'Next Up' : 'Pending',
                    status: isComplete ? ('complete' as const) : isCurrent ? ('current' as const) : ('incomplete' as const)
                  };
                });

                return (
                  <div
                    key={`tracker-${plan.id}`}
                    className="p-3.5 sm:p-4 bg-[#f4f4f4] border border-[#e0e0e0] hover:border-[#8a3ffc] transition-colors"
                  >
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 pb-2.5 mb-2.5 border-b border-[#e0e0e0]">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-xs font-semibold text-[#8a3ffc]">
                            {plan.planNumber}
                          </span>
                          <span className="text-xs font-semibold text-[#161616]">
                            {plan.therapyType}
                          </span>
                          <CarbonTag
                            type={isCompleted ? 'green' : plan.status === 'active' ? 'purple' : 'warm-gray'}
                            size="sm"
                          >
                            {isCompleted ? 'COMPLETED' : plan.status === 'active' ? 'ACTIVE / ONGOING' : 'PLANNED'}
                          </CarbonTag>
                        </div>
                        <div className="text-[11px] text-[#525252] mt-1 flex items-center gap-2 flex-wrap">
                          <span>Patient: <strong className="text-[#161616]">{plan.patientName}</strong> ({plan.patientMrn})</span>
                          <span>&bull;</span>
                          <span>Formulation: <span className="font-medium text-[#0f62fe]">{plan.oilOrFormulation}</span></span>
                          <span>&bull;</span>
                          <span>Chamber: <span className="font-mono text-[#161616]">{plan.roomNumber}</span></span>
                          <span>&bull;</span>
                          <span>Therapist: <span className="text-[#161616]">{plan.assignedTherapist}</span></span>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        <div className="text-right font-mono">
                          <div className="text-base font-semibold text-[#161616] tabular-nums">
                            {progressPercent}%
                          </div>
                          <div className="text-[10px] text-[#525252]">
                            {plan.completedSessions} of {plan.totalSessions} Sessions
                          </div>
                        </div>

                        {['SUPER_ADMIN', 'ADMIN', 'DOCTOR'].includes(currentUser.role) && !isCompleted && (
                          <CarbonButton
                            kind="primary"
                            size="sm"
                            renderIcon={CheckCircle}
                            onClick={() => handleRecordSession(plan)}
                            className="bg-[#0f62fe] hover:bg-[#0353e9]"
                            title={`Record completion for Session ${plan.completedSessions + 1}`}
                          >
                            Log Session {plan.completedSessions + 1}
                          </CarbonButton>
                        )}
                      </div>
                    </div>

                    {/* Carbon ProgressBar Indicator */}
                    <div className="mb-3">
                      <CarbonProgressBar
                        value={progressPercent}
                        size="md"
                        status={isCompleted ? 'finished' : 'active'}
                        label={`Clinical Course Milestones: ${plan.completedSessions} / ${plan.totalSessions} sessions completed`}
                        helperText={
                          isCompleted
                            ? 'Therapy protocol course fully completed with documented clinical response.'
                            : `Next scheduled procedure: Session ${plan.completedSessions + 1} (${plan.frequency}) in ${plan.roomNumber}`
                        }
                      />
                    </div>

                    {/* Multi-step Carbon Visual Step Milestones */}
                    <div className="bg-white p-2.5 border border-[#e0e0e0]">
                      <div className="text-[10px] font-mono uppercase text-[#525252] mb-1 font-semibold flex items-center justify-between">
                        <span>Session Execution Schedule ({plan.frequency})</span>
                        <span className="text-[#0f62fe] font-medium">{plan.totalSessions - plan.completedSessions} sessions remaining</span>
                      </div>
                      <CarbonStepProgress steps={sessionSteps} />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* Filter and Search Bar */}
      <div className="p-3 bg-white border border-[#e0e0e0] flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 shadow-2xs">
        <div className="relative flex-1 max-w-md">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-[#525252]" />
          <input
            type="text"
            placeholder="Search therapy plans by patient, oil formulation, plan number..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[#f4f4f4] border border-[#8d8d8d] pl-8 pr-2 py-1.5 text-xs text-[#161616] placeholder-[#525252] focus:bg-white focus:border-[#0f62fe] outline-none"
          />
        </div>

        <div className="flex items-center gap-1 text-xs">
          <span className="font-mono text-[10px] uppercase text-[#525252] mr-1">Status:</span>
          {(['all', 'active', 'completed', 'planned'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-3 py-1 capitalize cursor-pointer rounded-none text-xs transition-colors ${
                activeTab === tab
                  ? 'bg-[#0f62fe] text-white font-medium'
                  : 'bg-[#f4f4f4] text-[#161616] hover:bg-[#e0e0e0]'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* Treatment Plans Grid / Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredPlans.map((plan) => {
          const progressPercent = Math.round((plan.completedSessions / (plan.totalSessions || 1)) * 100);
          const isRecording = recordingSessionPlanId === plan.id;

          return (
            <div
              key={plan.id}
              className="bg-white border border-[#e0e0e0] p-4 flex flex-col justify-between space-y-3 shadow-2xs"
            >
              <div>
                <div className="flex items-center justify-between pb-2 border-b border-[#e0e0e0]">
                  <span className="font-mono text-xs text-[#0f62fe] font-semibold">{plan.planNumber}</span>
                  <CarbonTag
                    type={plan.status === 'completed' ? 'green' : plan.status === 'active' ? 'purple' : 'gray'}
                    size="sm"
                  >
                    {plan.status.toUpperCase()}
                  </CarbonTag>
                </div>

                <div className="mt-2.5">
                  <h3 className="font-semibold text-[#161616] text-sm">{plan.therapyType}</h3>
                  <div className="text-xs text-[#525252] mt-0.5">
                    Patient: <span className="font-medium text-[#161616]">{plan.patientName}</span>{' '}
                    <span className="font-mono text-[10px] text-[#525252]">({plan.patientMrn})</span>
                  </div>
                  <div className="text-[11px] text-[#525252] mt-1">
                    <span className="font-medium text-[#0f62fe]">Formulation:</span> {plan.oilOrFormulation}
                  </div>
                  <p className="text-[11px] text-[#525252] mt-1.5 italic bg-[#f4f4f4] p-1.5 border border-[#e0e0e0]">
                    "{plan.clinicalObjective}"
                  </p>
                </div>

                {/* Carbon Progress Indicator */}
                <div className="mt-3 p-2.5 bg-[#f4f4f4] border border-[#e0e0e0]">
                  <CarbonProgressBar
                    value={progressPercent}
                    size="sm"
                    label="Sessions Progress"
                    helperText={`${plan.completedSessions} of ${plan.totalSessions} sessions completed`}
                    status={plan.status === 'completed' ? 'finished' : 'active'}
                  />

                  {/* Segmented Session Visual Track */}
                  <div className="flex items-center gap-1 mt-2 pt-2 border-t border-[#e0e0e0]">
                    {Array.from({ length: plan.totalSessions }).map((_, idx) => {
                      const isDone = idx < plan.completedSessions;
                      const isCurrent = idx === plan.completedSessions && plan.status !== 'completed';
                      return (
                        <div
                          key={idx}
                          className={`h-1.5 flex-1 transition-all ${
                            isDone
                              ? 'bg-[#24a148]'
                              : isCurrent
                              ? 'bg-[#0f62fe] ring-1 ring-[#0f62fe]'
                              : 'bg-[#e0e0e0]'
                          }`}
                          title={`Session ${idx + 1}: ${isDone ? 'Completed' : isCurrent ? 'Next in Queue' : 'Upcoming'}`}
                        />
                      );
                    })}
                  </div>
                </div>

                {/* Meta Details */}
                <div className="grid grid-cols-2 gap-2 mt-3 text-[11px] text-[#525252] font-mono">
                  <div className="p-1.5 bg-[#f4f4f4] border border-[#e0e0e0]">
                    <span className="block text-[9px] uppercase text-[#525252]">Therapist</span>
                    <span className="text-[#161616] font-sans font-medium truncate block">{plan.assignedTherapist}</span>
                  </div>
                  <div className="p-1.5 bg-[#f4f4f4] border border-[#e0e0e0]">
                    <span className="block text-[9px] uppercase text-[#525252]">Room Suite</span>
                    <span className="text-[#161616] font-sans font-medium truncate block">{plan.roomNumber}</span>
                  </div>
                  <div className="p-1.5 bg-[#f4f4f4] border border-[#e0e0e0]">
                    <span className="block text-[9px] uppercase text-[#525252]">Frequency</span>
                    <span className="text-[#161616] font-sans font-medium block">{plan.frequency}</span>
                  </div>
                  <div className="p-1.5 bg-[#f4f4f4] border border-[#e0e0e0]">
                    <span className="block text-[9px] uppercase text-[#525252]">Last Session</span>
                    <span className="text-[#161616] font-sans font-medium block">{plan.lastSessionDate || 'Pending'}</span>
                  </div>
                </div>
              </div>

              {/* Action Section */}
              <div className="pt-3 border-t border-[#e0e0e0]">
                {canAdminister && plan.status !== 'completed' ? (
                  isRecording ? (
                    <div className="space-y-2 p-2 bg-[#f4f4f4] border border-[#e0e0e0]">
                      <input
                        type="text"
                        placeholder="Session observations, pulse, tolerance..."
                        value={sessionNotes}
                        onChange={(e) => setSessionNotes(e.target.value)}
                        className="w-full bg-white text-[#161616] border border-[#8d8d8d] p-1.5 text-xs focus:border-[#0f62fe] outline-none"
                      />
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => setRecordingSessionPlanId(null)}
                          className="px-2 py-1 text-xs text-[#525252] bg-[#e0e0e0] hover:bg-[#c6c6c6] cursor-pointer"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => handleRecordSession(plan)}
                          className="px-3 py-1 text-xs text-white bg-[#0f62fe] hover:bg-[#0353e9] cursor-pointer"
                        >
                          Confirm Session {plan.completedSessions + 1}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => setRecordingSessionPlanId(plan.id)}
                      className="w-full py-1.5 bg-[#f4f4f4] hover:bg-[#e0e0e0] border border-[#8d8d8d] text-[#0f62fe] hover:text-[#0353e9] text-xs font-medium flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <CheckCircle className="w-3.5 h-3.5 text-[#198038]" />
                      <span>Record Therapy Session ({plan.completedSessions + 1}/{plan.totalSessions})</span>
                    </button>
                  )
                ) : (
                  <div className="text-center text-[11px] font-mono text-[#198038] font-medium py-1 bg-[#defbe6] border border-[#198038]/30">
                    {plan.status === 'completed' ? '✓ Full Course Protocol Completed' : 'Session scheduled'}
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {filteredPlans.length === 0 && (
          <div className="col-span-full p-12 text-center text-xs text-[#525252] bg-white border border-[#e0e0e0]">
            No therapy plans matching your filter.
          </div>
        )}
      </div>
        </>
      )}

      {/* PHASE 7: THERAPY ROOMS & SANITIZATION VIEW */}
      {activeSection === 'rooms' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="p-3 bg-white border border-[#e0e0e0]">
              <span className="text-[10px] uppercase font-mono text-[#525252] block">Available Rooms</span>
              <span className="text-xl font-bold font-mono text-[#198038]">
                {therapyRooms.filter((r) => r.operationalStatus === 'AVAILABLE').length}
              </span>
            </div>
            <div className="p-3 bg-white border border-[#e0e0e0]">
              <span className="text-[10px] uppercase font-mono text-[#525252] block">Occupied Active</span>
              <span className="text-xl font-bold font-mono text-[#8a3ffc]">
                {therapyRooms.filter((r) => r.operationalStatus === 'OCCUPIED').length}
              </span>
            </div>
            <div className="p-3 bg-white border border-[#e0e0e0]">
              <span className="text-[10px] uppercase font-mono text-[#525252] block">Sanitizing Turnaround</span>
              <span className="text-xl font-bold font-mono text-[#b28600]">
                {therapyRooms.filter((r) => r.operationalStatus === 'SANITIZING').length}
              </span>
            </div>
            <div className="p-3 bg-white border border-[#e0e0e0]">
              <span className="text-[10px] uppercase font-mono text-[#525252] block">Under Maintenance</span>
              <span className="text-xl font-bold font-mono text-[#da1e28]">
                {therapyRooms.filter((r) => r.operationalStatus === 'MAINTENANCE').length}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {therapyRooms.map((room) => {
              const statusTagType =
                room.operationalStatus === 'AVAILABLE'
                  ? 'green'
                  : room.operationalStatus === 'OCCUPIED'
                  ? 'purple'
                  : room.operationalStatus === 'SANITIZING'
                  ? 'yellow'
                  : 'red';

              return (
                <div key={room.id} className="p-4 bg-white border border-[#e0e0e0] flex flex-col justify-between space-y-3 shadow-2xs">
                  <div>
                    <div className="flex items-center justify-between pb-2 border-b border-[#e0e0e0]">
                      <span className="font-mono text-xs font-bold text-[#161616]">{room.roomCode}</span>
                      <CarbonTag type={statusTagType} size="sm">
                        {room.operationalStatus}
                      </CarbonTag>
                    </div>

                    <div className="mt-2.5">
                      <h3 className="font-semibold text-sm text-[#161616]">{room.name}</h3>
                      <div className="text-[11px] font-mono text-[#8a3ffc] mt-0.5">
                        {room.roomType.replace(/_/g, ' ')}
                      </div>
                      {room.description && (
                        <p className="text-xs text-[#525252] mt-1 italic">
                          "{room.description}"
                        </p>
                      )}
                    </div>

                    <div className="mt-3 p-2 bg-[#f4f4f4] border border-[#e0e0e0] text-[11px] font-mono space-y-1">
                      <div className="flex justify-between text-[#525252]">
                        <span>Turnaround Buffer:</span>
                        <span className="text-[#161616]">{room.turnaroundBufferMinutes} mins</span>
                      </div>
                      <div className="flex justify-between text-[#525252]">
                        <span>Last Sanitized:</span>
                        <span className="text-[#161616] truncate max-w-[140px]">
                          {room.lastSanitizedAt ? new Date(room.lastSanitizedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Pending'}
                        </span>
                      </div>
                      {room.currentSessionId && (
                        <div className="flex justify-between text-[#8a3ffc] pt-1 border-t border-[#e0e0e0]">
                          <span>Active Session:</span>
                          <span className="truncate max-w-[130px]">{room.currentSessionId}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Room Actions */}
                  <div className="pt-2 border-t border-[#e0e0e0] flex flex-wrap gap-1.5 text-xs">
                    {room.operationalStatus === 'SANITIZING' && (
                      <button
                        onClick={() => handleRecordSanitization(room)}
                        className="flex-1 py-1 px-2 bg-[#defbe6] hover:bg-[#bdf3ca] text-[#198038] border border-[#198038]/30 font-medium text-xs flex items-center justify-center gap-1 cursor-pointer"
                      >
                        <ShieldCheck className="w-3.5 h-3.5" />
                        <span>Complete Sanitization</span>
                      </button>
                    )}

                    {room.operationalStatus === 'MAINTENANCE' && canManage && (
                      <button
                        onClick={() => handleExitMaintenance(room)}
                        className="flex-1 py-1 px-2 bg-[#edf5ff] hover:bg-[#d0e2ff] text-[#0f62fe] border border-[#0f62fe]/30 font-medium text-xs flex items-center justify-center gap-1 cursor-pointer"
                      >
                        <Wrench className="w-3.5 h-3.5" />
                        <span>Exit Maintenance</span>
                      </button>
                    )}

                    {room.operationalStatus === 'AVAILABLE' && canManage && (
                      <button
                        onClick={() => {
                          setSelectedRoom(room);
                          setIsMaintenanceModalOpen(true);
                        }}
                        className="py-1 px-2 bg-[#f4f4f4] hover:bg-[#e0e0e0] text-[#da1e28] border border-[#da1e28]/30 font-medium text-xs flex items-center justify-center gap-1 cursor-pointer"
                      >
                        <Wrench className="w-3.5 h-3.5" />
                        <span>Maintenance</span>
                      </button>
                    )}

                    {canManage && (
                      <button
                        onClick={() => handleReconcileStale(room)}
                        title="Reconcile stale room status with finished sessions"
                        className="py-1 px-2 bg-[#f4f4f4] hover:bg-[#e0e0e0] text-[#525252] border border-[#8d8d8d] text-xs flex items-center justify-center cursor-pointer"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}

            {therapyRooms.length === 0 && (
              <div className="col-span-full p-8 text-center text-xs text-[#525252] bg-white border border-[#e0e0e0]">
                No therapy rooms configured. Create therapy rooms via administration.
              </div>
            )}
          </div>
        </div>
      )}

      {/* PHASE 7: THERAPY SESSIONS CALENDAR & EXECUTION */}
      {activeSection === 'sessions' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-white border border-[#e0e0e0]">
            <div>
              <h2 className="font-semibold text-sm text-[#161616]">Ambulatory Procedure Schedule & Clinical Execution</h2>
              <p className="text-xs text-[#525252] mt-0.5">
                Vaidya pre-procedure clinical clearance, vital sign tracking, and room turnaround state transitions.
              </p>
            </div>
            {canManage && (
              <CarbonButton
                variant="primary"
                size="sm"
                onClick={() => setIsScheduleSessionModalOpen(true)}
              >
                + Schedule New Session
              </CarbonButton>
            )}
          </div>

          <div className="space-y-2">
            {therapySessions.map((session) => {
              const statusTagType =
                session.executionStatus === 'COMPLETED'
                  ? 'green'
                  : session.executionStatus === 'IN_PROGRESS'
                  ? 'purple'
                  : session.executionStatus === 'SCHEDULED'
                  ? 'blue'
                  : 'red';

              return (
                <div key={session.id} className="p-3.5 bg-white border border-[#e0e0e0] flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs shadow-2xs">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-[#8a3ffc]">{session.sessionNumber ? `Session #${session.sessionNumber}` : 'Therapy Procedure'}</span>
                      <CarbonTag type={statusTagType} size="sm">
                        {session.executionStatus}
                      </CarbonTag>
                      <span className="font-semibold text-[#161616] text-sm">{session.therapyType}</span>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 text-[#525252] text-[11px]">
                      <span>
                        Patient: <strong className="text-[#161616]">{session.patient?.firstName ? `${session.patient.firstName} ${session.patient.lastName}` : session.patientId}</strong>
                      </span>
                      <span>&bull;</span>
                      <span>
                        Room: <strong className="text-[#161616]">{session.roomNameSnapshot || session.room?.name || session.roomId}</strong>
                      </span>
                      <span>&bull;</span>
                      <span>
                        Staff: <strong className="text-[#161616]">{session.administeringStaff?.name || session.administeringStaffId}</strong>
                      </span>
                      <span>&bull;</span>
                      <span>
                        Vaidya: <strong className="text-[#161616]">{session.responsibleVaidya?.name || session.responsibleVaidyaId}</strong>
                      </span>
                    </div>

                    <div className="text-[11px] font-mono text-[#0f62fe]">
                      Scheduled: {new Date(session.scheduledStartAt || session.scheduledStartTime || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} &mdash; {new Date(session.scheduledEndAt || session.scheduledEndTime || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>

                  {/* Session Action Buttons */}
                  <div className="flex items-center gap-2 shrink-0">
                    {session.executionStatus === 'SCHEDULED' && canManage && (
                      <>
                        <button
                          onClick={() => {
                            setSessionToStart(session);
                            setPreBpSystolic(120);
                            setPreBpDiastolic(80);
                            setPreHeartRate(72);
                            setPreVaidyaClearance(true);
                          }}
                          className="px-3 py-1.5 bg-[#8a3ffc] hover:bg-[#7b2cbf] text-white font-medium text-xs flex items-center gap-1 cursor-pointer"
                        >
                          <Play className="w-3.5 h-3.5" />
                          <span>Start (Vaidya Clearance)</span>
                        </button>
                        <button
                          onClick={() => handleCancelSession(session.id)}
                          className="px-2 py-1.5 bg-[#f4f4f4] hover:bg-[#e0e0e0] text-[#da1e28] border border-[#da1e28]/30 text-xs cursor-pointer"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => handleNoShowSession(session.id)}
                          className="px-2 py-1.5 bg-[#f4f4f4] hover:bg-[#e0e0e0] text-[#525252] border border-[#8d8d8d] text-xs cursor-pointer"
                        >
                          No-Show
                        </button>
                      </>
                    )}

                    {session.executionStatus === 'IN_PROGRESS' && canManage && (
                      <>
                        <button
                          onClick={() => {
                            setSessionToComplete(session);
                            setPostBpSystolic(118);
                            setPostBpDiastolic(76);
                            setPostHeartRate(70);
                            setPostTolerance('GOOD');
                          }}
                          className="px-3 py-1.5 bg-[#198038] hover:bg-[#156e30] text-white font-medium text-xs flex items-center gap-1 cursor-pointer"
                        >
                          <CheckCircle className="w-3.5 h-3.5" />
                          <span>Complete Procedure</span>
                        </button>
                        <button
                          onClick={() => {
                            setSessionToAbort(session);
                            setAbortReason('');
                          }}
                          className="px-2 py-1.5 bg-[#da1e28] hover:bg-[#b81922] text-white text-xs cursor-pointer flex items-center gap-1"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          <span>Abort</span>
                        </button>
                      </>
                    )}

                    {session.executionStatus === 'COMPLETED' && (
                      <span className="font-mono text-[#198038] text-[11px] font-medium bg-[#defbe6] px-2 py-1 border border-[#198038]/30">
                        {session.isBilled ? '✓ Billed' : 'Unbilled Session'}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}

            {therapySessions.length === 0 && (
              <div className="p-8 text-center text-xs text-[#525252] bg-white border border-[#e0e0e0]">
                No therapy sessions scheduled. Click "+ Schedule New Session" to create an ambulatory appointment.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal: Create New Treatment Plan */}
      <CarbonModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Create Classical Ayurvedic Therapy Plan"
        primaryButtonText="Save & Initialize Plan"
        secondaryButtonText="Cancel"
        onRequestSubmit={handleCreate}
        size="md"
      >
        <form onSubmit={handleCreate} className="space-y-3 text-xs">
          <div>
            <label className="block text-[11px] text-[#525252] uppercase font-mono mb-1">
              Patient *
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
              Therapy Procedure *
            </label>
            <select
              value={therapyType}
              onChange={(e) => setTherapyType(e.target.value as TherapyType)}
              className="w-full bg-[#f4f4f4] text-[#161616] border border-[#8d8d8d] p-2 text-xs focus:bg-white focus:border-[#0f62fe] outline-none"
            >
              <option>Abhyanga (Herbal Full Body Massage)</option>
              <option>Shirodhara (Continuous Medicated Oil Pouring)</option>
              <option>Pizhichil (Royal Medicated Oil Bath)</option>
              <option>Kizhi / Patra Pinda Sweda (Herbal Bolus)</option>
              <option>Kati Basti (Medicated Oil Retention - Spine)</option>
              <option>Janu Basti (Medicated Oil Retention - Knees)</option>
              <option>Greeva Basti (Medicated Oil Retention - Cervical)</option>
              <option>Udvartana (Herbal Powder Exfoliation)</option>
              <option>Takradhara (Medicated Buttermilk Pouring)</option>
              <option>Karna Poorana (Ear Cleansing & Oil Filling)</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[11px] text-[#525252] uppercase font-mono mb-1">
                Oil / Herbal Formulation *
              </label>
              <input
                type="text"
                required
                value={oilOrFormulation}
                onChange={(e) => setOilOrFormulation(e.target.value)}
                className="w-full bg-[#f4f4f4] text-[#161616] border border-[#8d8d8d] p-2 text-xs focus:bg-white focus:border-[#0f62fe] outline-none"
              />
            </div>
            <div>
              <label className="block text-[11px] text-[#525252] uppercase font-mono mb-1">
                Total Sessions
              </label>
              <input
                type="number"
                min="1"
                max="30"
                value={totalSessions}
                onChange={(e) => setTotalSessions(Number(e.target.value))}
                className="w-full bg-[#f4f4f4] text-[#161616] border border-[#8d8d8d] p-2 text-xs focus:bg-white focus:border-[#0f62fe] outline-none font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[11px] text-[#525252] uppercase font-mono mb-1">
                Assigned Therapist
              </label>
              <select
                value={assignedTherapist}
                onChange={(e) => setAssignedTherapist(e.target.value)}
                className="w-full bg-[#f4f4f4] text-[#161616] border border-[#8d8d8d] p-2 text-xs focus:bg-white focus:border-[#0f62fe] outline-none"
              >
                {availableTherapists.length === 0 ? (
                  <option value="">No registered therapy staff</option>
                ) : (
                  availableTherapists.map((t) => (
                    <option key={t.id} value={t.name}>{t.name} ({t.designation || t.role})</option>
                  ))
                )}
              </select>
            </div>
            <div>
              <label className="block text-[11px] text-[#525252] uppercase font-mono mb-1">
                Therapy Suite / Room
              </label>
              <input
                type="text"
                value={roomNumber}
                onChange={(e) => setRoomNumber(e.target.value)}
                className="w-full bg-[#f4f4f4] text-[#161616] border border-[#8d8d8d] p-2 text-xs focus:bg-white focus:border-[#0f62fe] outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[11px] text-[#525252] uppercase font-mono mb-1">
                Frequency
              </label>
              <select
                value={frequency}
                onChange={(e) => setFrequency(e.target.value as any)}
                className="w-full bg-[#f4f4f4] text-[#161616] border border-[#8d8d8d] p-2 text-xs focus:bg-white focus:border-[#0f62fe] outline-none"
              >
                <option>Daily</option>
                <option>Alternate Days</option>
                <option>Twice Weekly</option>
                <option>Weekly</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] text-[#525252] uppercase font-mono mb-1">
                Start Date
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full bg-[#f4f4f4] text-[#161616] border border-[#8d8d8d] p-2 text-xs focus:bg-white focus:border-[#0f62fe] outline-none font-mono"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] text-[#525252] uppercase font-mono mb-1">
              Clinical Objective
            </label>
            <input
              type="text"
              placeholder="e.g. Alleviate subchondral crepitus & balance localized Sandhivata"
              value={clinicalObjective}
              onChange={(e) => setClinicalObjective(e.target.value)}
              className="w-full bg-[#f4f4f4] text-[#161616] border border-[#8d8d8d] p-2 text-xs focus:bg-white focus:border-[#0f62fe] outline-none"
            />
          </div>
        </form>
      </CarbonModal>

      {/* Modal: Schedule Therapy Session */}
      <CarbonModal
        isOpen={isScheduleSessionModalOpen}
        onClose={() => {
          setIsScheduleSessionModalOpen(false);
          setScheduleError(null);
        }}
        title="Schedule Ambulatory Therapy Session"
        primaryButtonText="Confirm Booking"
        secondaryButtonText="Cancel"
        onRequestSubmit={handleScheduleSessionSubmit}
        size="md"
      >
        <form onSubmit={handleScheduleSessionSubmit} className="space-y-3 text-xs">
          {scheduleError && (
            <div className="p-2.5 bg-[#fff1f1] border-l-4 border-l-[#da1e28] text-xs text-[#da1e28]">
              <strong>Scheduling Conflict:</strong> {scheduleError}
            </div>
          )}

          <div>
            <label className="block text-[11px] text-[#525252] uppercase font-mono mb-1">
              Patient *
            </label>
            <select
              value={schedulePatientId}
              onChange={(e) => setSchedulePatientId(e.target.value)}
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
              Therapy Suite / Room *
            </label>
            <select
              value={scheduleRoomId}
              onChange={(e) => setScheduleRoomId(e.target.value)}
              className="w-full bg-[#f4f4f4] text-[#161616] border border-[#8d8d8d] p-2 text-xs focus:bg-white focus:border-[#0f62fe] outline-none"
            >
              {therapyRooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.roomCode} — {r.name} ({r.operationalStatus})
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[11px] text-[#525252] uppercase font-mono mb-1">
                Administering Staff (Ayurveda) *
              </label>
              <select
                value={scheduleStaffId}
                onChange={(e) => setScheduleStaffId(e.target.value)}
                className="w-full bg-[#f4f4f4] text-[#161616] border border-[#8d8d8d] p-2 text-xs focus:bg-white focus:border-[#0f62fe] outline-none"
              >
                {eligibleStaff.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.discipline || s.designation || 'Staff'})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] text-[#525252] uppercase font-mono mb-1">
                Responsible Vaidya *
              </label>
              <select
                value={scheduleVaidyaId}
                onChange={(e) => setScheduleVaidyaId(e.target.value)}
                className="w-full bg-[#f4f4f4] text-[#161616] border border-[#8d8d8d] p-2 text-xs focus:bg-white focus:border-[#0f62fe] outline-none"
              >
                {responsibleVaidyas.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name} ({v.designation || 'Vaidya'})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-[11px] text-[#525252] uppercase font-mono mb-1">
              Therapy Procedure *
            </label>
            <input
              type="text"
              required
              value={scheduleTherapyType}
              onChange={(e) => setScheduleTherapyType(e.target.value)}
              className="w-full bg-[#f4f4f4] text-[#161616] border border-[#8d8d8d] p-2 text-xs focus:bg-white focus:border-[#0f62fe] outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[11px] text-[#525252] uppercase font-mono mb-1">
                Start Time *
              </label>
              <input
                type="datetime-local"
                required
                value={scheduleStartTime}
                onChange={(e) => setScheduleStartTime(e.target.value)}
                className="w-full bg-[#f4f4f4] text-[#161616] border border-[#8d8d8d] p-2 text-xs font-mono outline-none"
              />
            </div>
            <div>
              <label className="block text-[11px] text-[#525252] uppercase font-mono mb-1">
                End Time *
              </label>
              <input
                type="datetime-local"
                required
                value={scheduleEndTime}
                onChange={(e) => setScheduleEndTime(e.target.value)}
                className="w-full bg-[#f4f4f4] text-[#161616] border border-[#8d8d8d] p-2 text-xs font-mono outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] text-[#525252] uppercase font-mono mb-1">
              Turnaround Buffer (Minutes)
            </label>
            <input
              type="number"
              min="0"
              max="60"
              value={scheduleBuffer}
              onChange={(e) => setScheduleBuffer(Number(e.target.value))}
              className="w-full bg-[#f4f4f4] text-[#161616] border border-[#8d8d8d] p-2 text-xs font-mono outline-none"
            />
          </div>
        </form>
      </CarbonModal>

      {/* Modal: Pre-Procedure Assessment (Start Session) */}
      <CarbonModal
        isOpen={!!sessionToStart}
        onClose={() => setSessionToStart(null)}
        title="Pre-Procedure Clinical Assessment & Vaidya Clearance"
        primaryButtonText="Confirm Clearance & Start"
        secondaryButtonText="Cancel"
        onRequestSubmit={handleStartSessionSubmit}
        size="md"
      >
        <form onSubmit={handleStartSessionSubmit} className="space-y-3 text-xs">
          <div className="p-2.5 bg-[#edf5ff] border-l-4 border-l-[#0f62fe] text-xs text-[#0043ce]">
            <strong>Clinical Safety:</strong> Classical Ayurvedic therapies require pre-vital sign validation and attending Vaidya Koshta/Agni clearance before administration.
          </div>

          <div className="grid grid-cols-3 gap-2 font-mono">
            <div>
              <label className="block text-[10px] text-[#525252] uppercase mb-1">Systolic BP</label>
              <input
                type="number"
                value={preBpSystolic}
                onChange={(e) => setPreBpSystolic(Number(e.target.value))}
                className="w-full bg-[#f4f4f4] border border-[#8d8d8d] p-1.5 text-xs font-mono"
              />
            </div>
            <div>
              <label className="block text-[10px] text-[#525252] uppercase mb-1">Diastolic BP</label>
              <input
                type="number"
                value={preBpDiastolic}
                onChange={(e) => setPreBpDiastolic(Number(e.target.value))}
                className="w-full bg-[#f4f4f4] border border-[#8d8d8d] p-1.5 text-xs font-mono"
              />
            </div>
            <div>
              <label className="block text-[10px] text-[#525252] uppercase mb-1">Pulse (bpm)</label>
              <input
                type="number"
                value={preHeartRate}
                onChange={(e) => setPreHeartRate(Number(e.target.value))}
                className="w-full bg-[#f4f4f4] border border-[#8d8d8d] p-1.5 text-xs font-mono"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] text-[#525252] uppercase font-mono mb-1">
              Agni Status (Digestive Fire)
            </label>
            <select
              value={preAgniStatus}
              onChange={(e) => setPreAgniStatus(e.target.value as any)}
              className="w-full bg-[#f4f4f4] text-[#161616] border border-[#8d8d8d] p-2 text-xs"
            >
              <option value="SAMA">Sama Agni (Balanced Equilibrium)</option>
              <option value="VISHAMA">Vishama Agni (Irregular / Vata Aggravated)</option>
              <option value="TIKSHNA">Tikshna Agni (Hyperactive / Pitta Aggravated)</option>
              <option value="MANDA">Manda Agni (Sluggish / Kapha Aggravated)</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] text-[#525252] uppercase font-mono mb-1">
              Pre-Procedure Observations
            </label>
            <textarea
              rows={2}
              value={preNotes}
              onChange={(e) => setPreNotes(e.target.value)}
              className="w-full bg-[#f4f4f4] text-[#161616] border border-[#8d8d8d] p-2 text-xs"
            />
          </div>

          <label className="flex items-center gap-2 p-2.5 bg-[#defbe6] border border-[#198038]/30 cursor-pointer">
            <input
              type="checkbox"
              checked={preVaidyaClearance}
              onChange={(e) => setPreVaidyaClearance(e.target.checked)}
              className="rounded-none text-[#198038]"
            />
            <span className="text-xs font-medium text-[#198038]">
              Attending Vaidya certifies patient is fit and cleared for procedure
            </span>
          </label>
        </form>
      </CarbonModal>

      {/* Modal: Post-Procedure Assessment (Complete Session) */}
      <CarbonModal
        isOpen={!!sessionToComplete}
        onClose={() => setSessionToComplete(null)}
        title="Post-Procedure Assessment & Completion"
        primaryButtonText="Complete Procedure"
        secondaryButtonText="Cancel"
        onRequestSubmit={handleCompleteSessionSubmit}
        size="md"
      >
        <form onSubmit={handleCompleteSessionSubmit} className="space-y-3 text-xs">
          <div className="grid grid-cols-3 gap-2 font-mono">
            <div>
              <label className="block text-[10px] text-[#525252] uppercase mb-1">Post-Systolic</label>
              <input
                type="number"
                value={postBpSystolic}
                onChange={(e) => setPostBpSystolic(Number(e.target.value))}
                className="w-full bg-[#f4f4f4] border border-[#8d8d8d] p-1.5 text-xs font-mono"
              />
            </div>
            <div>
              <label className="block text-[10px] text-[#525252] uppercase mb-1">Post-Diastolic</label>
              <input
                type="number"
                value={postBpDiastolic}
                onChange={(e) => setPostBpDiastolic(Number(e.target.value))}
                className="w-full bg-[#f4f4f4] border border-[#8d8d8d] p-1.5 text-xs font-mono"
              />
            </div>
            <div>
              <label className="block text-[10px] text-[#525252] uppercase mb-1">Post-Pulse (bpm)</label>
              <input
                type="number"
                value={postHeartRate}
                onChange={(e) => setPostHeartRate(Number(e.target.value))}
                className="w-full bg-[#f4f4f4] border border-[#8d8d8d] p-1.5 text-xs font-mono"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] text-[#525252] uppercase font-mono mb-1">
              Patient Procedure Tolerance
            </label>
            <select
              value={postTolerance}
              onChange={(e) => setPostTolerance(e.target.value as any)}
              className="w-full bg-[#f4f4f4] text-[#161616] border border-[#8d8d8d] p-2 text-xs"
            >
              <option value="EXCELLENT">Excellent Tolerance</option>
              <option value="GOOD">Good / Stable Response</option>
              <option value="FAIR">Fair / Mild Fatigue Reported</option>
              <option value="POOR">Poor / Rest Required</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] text-[#525252] uppercase font-mono mb-1">
              Therapist Procedure Notes
            </label>
            <textarea
              rows={2}
              value={postProcedureNotes}
              onChange={(e) => setPostProcedureNotes(e.target.value)}
              className="w-full bg-[#f4f4f4] text-[#161616] border border-[#8d8d8d] p-2 text-xs"
            />
          </div>

          <div>
            <label className="block text-[11px] text-[#525252] uppercase font-mono mb-1">
              Complications / Adverse Reactions (if any)
            </label>
            <input
              type="text"
              placeholder="Leave blank if uneventful"
              value={postComplications}
              onChange={(e) => setPostComplications(e.target.value)}
              className="w-full bg-[#f4f4f4] text-[#161616] border border-[#8d8d8d] p-2 text-xs"
            />
          </div>
        </form>
      </CarbonModal>

      {/* Modal: Abort Session */}
      <CarbonModal
        isOpen={!!sessionToAbort}
        onClose={() => setSessionToAbort(null)}
        title="Abort Therapy Procedure"
        primaryButtonText="Confirm Abort"
        secondaryButtonText="Cancel"
        onRequestSubmit={handleAbortSessionSubmit}
        size="sm"
      >
        <form onSubmit={handleAbortSessionSubmit} className="space-y-3 text-xs">
          <div className="p-2.5 bg-[#fff1f1] border-l-4 border-l-[#da1e28] text-xs text-[#da1e28]">
            <strong>Clinical Warning:</strong> Aborting marks this procedure as non-completed and immediately sets the therapy suite to SANITIZING.
          </div>
          <div>
            <label className="block text-[11px] text-[#525252] uppercase font-mono mb-1">
              Clinical Abort Rationale *
            </label>
            <textarea
              required
              rows={3}
              placeholder="Document patient vital changes, severe discomfort, or medical reason..."
              value={abortReason}
              onChange={(e) => setAbortReason(e.target.value)}
              className="w-full bg-[#f4f4f4] text-[#161616] border border-[#8d8d8d] p-2 text-xs"
            />
          </div>
        </form>
      </CarbonModal>

      {/* Modal: Enter Room Maintenance */}
      <CarbonModal
        isOpen={isMaintenanceModalOpen}
        onClose={() => {
          setIsMaintenanceModalOpen(false);
          setSelectedRoom(null);
        }}
        title={`Take Room Offline: ${selectedRoom?.roomCode || ''}`}
        primaryButtonText="Confirm Maintenance"
        secondaryButtonText="Cancel"
        onRequestSubmit={handleEnterMaintenanceSubmit}
        size="sm"
      >
        <div className="space-y-3 text-xs">
          <div>
            <label className="block text-[11px] text-[#525252] uppercase font-mono mb-1">
              Maintenance Rationale *
            </label>
            <textarea
              rows={3}
              value={maintenanceReason}
              onChange={(e) => setMaintenanceReason(e.target.value)}
              className="w-full bg-[#f4f4f4] text-[#161616] border border-[#8d8d8d] p-2 text-xs"
            />
          </div>
        </div>
      </CarbonModal>
    </div>
  );
};
