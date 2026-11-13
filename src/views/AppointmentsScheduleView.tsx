import React, { useState, useEffect, useMemo } from 'react';
import {
  Calendar,
  Clock,
  Plus,
  RefreshCw,
  XCircle,
  UserCheck,
  Stethoscope,
  CheckCircle,
  User,
  AlertCircle,
  Activity,
  ArrowRight,
  Filter,
  Search,
  Sliders,
  ChevronRight,
  Users
} from 'lucide-react';
import { CarbonDataTable, Column } from '../components/carbon/CarbonDataTable';
import { CarbonTag, CarbonTagType } from '../components/carbon/CarbonTag';
import { CarbonButton } from '../components/carbon/CarbonButton';
import { CarbonTabs } from '../components/carbon/CarbonTabs';
import {
  Appointment,
  Doctor,
  Patient,
  UserRole,
  QueueItem,
  ReceptionDashboardMetrics,
  QueuePriority,
  AppointmentStatus
} from '../types/hospital';
import { hospitalApi } from '../services/hospitalApi';
import { WalkInModal } from '../components/modals/WalkInModal';
import { ChangePriorityModal } from '../components/modals/ChangePriorityModal';

interface AppointmentsScheduleViewProps {
  appointments: Appointment[];
  doctors: Doctor[];
  patients: Patient[];
  currentUserRole: UserRole;
  onOpenNewAppointmentModal: () => void;
  onOpenRescheduleModal: (apt: Appointment) => void;
  onOpenCancelModal: (apt: Appointment) => void;
}

export const AppointmentsScheduleView: React.FC<AppointmentsScheduleViewProps> = ({
  appointments: initialAppointments,
  doctors,
  patients,
  currentUserRole,
  onOpenNewAppointmentModal,
  onOpenRescheduleModal,
  onOpenCancelModal
}) => {
  const [activeTab, setActiveTab] = useState<'queue' | 'directory' | 'dashboard' | 'availability'>('queue');
  const [appointments, setAppointments] = useState<Appointment[]>(initialAppointments);
  const [queueItems, setQueueItems] = useState<QueueItem[]>([]);
  const [dashboardMetrics, setDashboardMetrics] = useState<ReceptionDashboardMetrics | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Filters for Directory
  const [dateFilter, setDateFilter] = useState<'today' | 'upcoming' | 'past' | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [disciplineFilter, setDisciplineFilter] = useState<string>('all');
  const [practitionerFilter, setPractitionerFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Queue Discipline Filter
  const [queueDisciplineFilter, setQueueDisciplineFilter] = useState<string>('all');

  // Modals
  const [isWalkInModalOpen, setIsWalkInModalOpen] = useState(false);
  const [selectedQueueItemForPriority, setSelectedQueueItemForPriority] = useState<QueueItem | null>(null);

  // Quick Check-in State
  const [quickCheckInSearch, setQuickCheckInSearch] = useState('');
  const [checkInNotes, setCheckInNotes] = useState('');

  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);
  const isClinician = currentUserRole === 'DOCTOR' || currentUserRole === 'VAIDYA';

  // Fetch live queue & dashboard metrics
  const refreshData = async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const [fetchedApts, fetchedQueue, fetchedMetrics] = await Promise.all([
        hospitalApi.getAppointments(),
        hospitalApi.getReceptionQueue(),
        hospitalApi.getReceptionDashboard()
      ]);
      setAppointments(fetchedApts);
      setQueueItems(fetchedQueue);
      setDashboardMetrics(fetchedMetrics);
    } catch (err: any) {
      console.warn('[AppointmentsScheduleView] Refresh error:', err);
      setErrorMessage(err.message || 'Failed to refresh appointment data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshData();
  }, []);

  // Handlers for Queue Actions
  const handleCheckIn = async (aptId: string, notes?: string) => {
    setErrorMessage(null);
    try {
      await hospitalApi.checkInAppointment(aptId, notes);
      setSuccessMessage('Patient successfully checked in and placed in waiting queue.');
      setCheckInNotes('');
      setQuickCheckInSearch('');
      await refreshData();
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err: any) {
      setErrorMessage(err.message || 'Check-in failed');
    }
  };

  const handleConsultationHandoff = async (aptId: string) => {
    setErrorMessage(null);
    try {
      await hospitalApi.consultationHandoff(aptId);
      setSuccessMessage('Patient called into clinical consultation.');
      await refreshData();
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err: any) {
      setErrorMessage(err.message || 'Consultation handoff failed');
    }
  };

  const handleCompleteConsultation = async (aptId: string) => {
    setErrorMessage(null);
    try {
      await hospitalApi.completeAppointment(aptId);
      setSuccessMessage('Consultation encounter marked as completed.');
      await refreshData();
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err: any) {
      setErrorMessage(err.message || 'Completion failed');
    }
  };

  const handleAdmitWalkIn = async (data: {
    patientId: string;
    practitionerId: string;
    reasonForVisit: string;
    priority?: QueuePriority;
    priorityReason?: string;
    isEscalated?: boolean;
    escalationReason?: string;
    durationMinutes?: number;
  }) => {
    setErrorMessage(null);
    try {
      await hospitalApi.createWalkInAppointment(data);
      setSuccessMessage('Walk-in patient admitted and assigned to waiting queue.');
      await refreshData();
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err: any) {
      setErrorMessage(err.message || 'Walk-in admission failed');
      throw err;
    }
  };

  const handleUpdatePriority = async (id: string, priority: QueuePriority, priorityReason: string) => {
    setErrorMessage(null);
    try {
      await hospitalApi.updateQueuePriority(id, priority, priorityReason);
      setSuccessMessage(`Queue priority updated to ${priority.toUpperCase()}.`);
      await refreshData();
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err: any) {
      setErrorMessage(err.message || 'Priority update failed');
      throw err;
    }
  };

  const handleEscalatePatient = async (id: string, escalationReason: string) => {
    setErrorMessage(null);
    try {
      await hospitalApi.escalateQueuePatient(id, escalationReason);
      setSuccessMessage('Emergency escalation flagged for patient. Placed at top of waiting queue.');
      await refreshData();
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err: any) {
      setErrorMessage(err.message || 'Emergency escalation failed');
      throw err;
    }
  };

  // Helper for Status Tags
  const getStatusTag = (status: Appointment['status']): { type: CarbonTagType; label: string } => {
    switch (status) {
      case 'scheduled':
        return { type: 'blue', label: 'SCHEDULED' };
      case 'confirmed':
        return { type: 'cyan', label: 'CONFIRMED' };
      case 'checked_in':
        return { type: 'teal', label: 'CHECKED IN' };
      case 'waiting':
        return { type: 'warm-gray', label: 'WAITING' };
      case 'in_consultation':
        return { type: 'purple', label: 'IN CONSULTATION' };
      case 'completed':
        return { type: 'green', label: 'COMPLETED' };
      case 'cancelled':
        return { type: 'red', label: 'CANCELLED' };
      case 'rescheduled':
        return { type: 'magenta', label: 'RESCHEDULED' };
      case 'no_show':
        return { type: 'cool-gray', label: 'NO SHOW' };
      default:
        return { type: 'cool-gray', label: String(status).toUpperCase() };
    }
  };

  const getPriorityTag = (priority?: QueuePriority): { type: CarbonTagType; label: string } => {
    switch (priority) {
      case 'urgent':
        return { type: 'red', label: 'URGENT' };
      case 'priority':
        return { type: 'magenta', label: 'PRIORITY' };
      case 'normal':
      default:
        return { type: 'cool-gray', label: 'NORMAL' };
    }
  };

  // Filtered Queue Items
  const filteredQueue = useMemo(() => {
    return queueItems.filter((item) => {
      if (queueDisciplineFilter !== 'all' && item.practitionerRole !== queueDisciplineFilter) {
        return false;
      }
      return true;
    });
  }, [queueItems, queueDisciplineFilter]);

  // Candidates for Quick Check-In (today's scheduled or confirmed appointments not yet checked in)
  const checkInCandidates = useMemo(() => {
    return appointments.filter((a) => {
      const aDate = a.appointmentDate || a.dateTime?.split('T')[0];
      const isToday = aDate === todayStr;
      const isEligibleStatus = a.status === 'scheduled' || a.status === 'confirmed';
      if (!isToday || !isEligibleStatus) return false;

      if (quickCheckInSearch.trim()) {
        const q = quickCheckInSearch.toLowerCase();
        const matchesMrn = a.patientMrn?.toLowerCase().includes(q);
        const matchesName = a.patientName?.toLowerCase().includes(q);
        const matchesRef = a.appointmentNumber?.toLowerCase().includes(q);
        return matchesMrn || matchesName || matchesRef;
      }
      return true;
    });
  }, [appointments, todayStr, quickCheckInSearch]);

  // Filtered Appointments for Directory
  const filteredAppointments = useMemo(() => {
    return appointments.filter((a) => {
      const aDate = a.appointmentDate || a.dateTime?.split('T')[0];

      // Date Filter
      if (dateFilter === 'today' && aDate !== todayStr) return false;
      if (dateFilter === 'upcoming' && aDate < todayStr) return false;
      if (dateFilter === 'past' && aDate >= todayStr) return false;

      // Status Filter
      if (statusFilter !== 'all' && a.status !== statusFilter) return false;

      // Discipline Filter
      if (disciplineFilter !== 'all') {
        const role = a.practitionerRole || ((a.department?.toLowerCase().includes('ayurved') || (a as any).specialty?.toLowerCase().includes('ayurved')) ? 'VAIDYA' : 'DOCTOR');
        if (role !== disciplineFilter) return false;
      }

      // Practitioner Filter
      if (practitionerFilter !== 'all') {
        if (a.practitionerId !== practitionerFilter && a.doctorId !== practitionerFilter) return false;
      }

      // Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = a.patientName?.toLowerCase().includes(q);
        const matchesMrn = a.patientMrn?.toLowerCase().includes(q);
        const matchesDoc = a.doctorName?.toLowerCase().includes(q) || a.practitionerName?.toLowerCase().includes(q);
        const matchesRef = a.appointmentNumber?.toLowerCase().includes(q);
        if (!matchesName && !matchesMrn && !matchesDoc && !matchesRef) return false;
      }

      return true;
    });
  }, [appointments, dateFilter, statusFilter, disciplineFilter, practitionerFilter, searchQuery, todayStr]);

  // Directory Columns
  const directoryColumns: Column<Appointment>[] = [
    {
      key: 'ref',
      header: 'Reference & Source',
      sortable: true,
      render: (a) => (
        <div>
          <div className="font-mono text-xs font-semibold text-[#0f62fe]">
            {a.appointmentNumber || a.id.slice(0, 12)}
          </div>
          <div className="text-[10px] text-[#525252] uppercase font-mono mt-0.5">
            {a.bookingSource === 'walk_in' ? 'Walk-In' : 'Scheduled'}
          </div>
        </div>
      )
    },
    {
      key: 'patient',
      header: 'Patient & MRN',
      sortable: true,
      render: (a) => (
        <div>
          <div className="font-semibold text-xs text-[#161616]">
            {a.patientName}
          </div>
          <div className="text-[11px] font-mono text-[#525252]">
            {a.patientMrn} {a.patientPhone ? `• ${a.patientPhone}` : ''}
          </div>
        </div>
      )
    },
    {
      key: 'doctorName',
      header: 'Practitioner & Discipline',
      sortable: true,
      render: (a) => {
        const isVaidya = a.practitionerRole === 'VAIDYA' || a.department?.toLowerCase().includes('ayurved');
        return (
          <div>
            <div className="font-semibold text-xs text-[#161616] flex items-center gap-1.5">
              <span>{a.practitionerName || a.doctorName}</span>
              <span className={`text-[9px] px-1.5 py-0.2 font-mono uppercase border ${isVaidya ? 'bg-[#f6f2ff] text-[#6929c4] border-[#d4bbff]' : 'bg-[#edf5ff] text-[#0043ce] border-[#a6c8ff]'}`}>
                {isVaidya ? 'VAIDYA' : 'DOCTOR'}
              </span>
            </div>
            <div className="text-[11px] text-[#525252]">
              {a.department || (isVaidya ? 'Ayurvedic Medicine' : 'General Medicine')}
            </div>
          </div>
        );
      }
    },
    {
      key: 'dateTime',
      header: 'Date & Time Slot',
      sortable: true,
      render: (a) => (
        <div className="font-mono text-xs">
          <div className="font-semibold text-[#161616]">
            {a.appointmentDate || a.dateTime?.split('T')[0]}
          </div>
          <div className="text-[#0f62fe] font-medium">
            {a.timeSlot}
          </div>
        </div>
      )
    },
    {
      key: 'priority',
      header: 'Triage Priority',
      render: (a) => {
        const pTag = getPriorityTag(a.priority);
        return (
          <div>
            <CarbonTag type={pTag.type} size="sm">{pTag.label}</CarbonTag>
            {a.priorityReason && (
              <div className="text-[10px] text-[#525252] mt-0.5 italic line-clamp-1">
                {a.priorityReason}
              </div>
            )}
          </div>
        );
      }
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      render: (a) => {
        const tag = getStatusTag(a.status);
        return (
          <div>
            <CarbonTag type={tag.type} size="sm">{tag.label}</CarbonTag>
            {a.cancellationReason && (
              <div className="text-[10px] text-[#da1e28] mt-0.5 line-clamp-1">
                {a.cancellationReason}
              </div>
            )}
          </div>
        );
      }
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (a) => {
        const canCheckIn = a.status === 'scheduled' || a.status === 'confirmed';
        const canReschedule = a.status === 'scheduled' || a.status === 'confirmed' || a.status === 'rescheduled';
        const canCancel = a.status !== 'cancelled' && a.status !== 'completed';

        return (
          <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
            {canCheckIn && (
              <CarbonButton
                kind="tertiary"
                size="sm"
                renderIcon={UserCheck}
                onClick={() => handleCheckIn(a.id)}
                title="Check in patient"
              >
                Check In
              </CarbonButton>
            )}
            {canReschedule && (
              <CarbonButton
                kind="ghost"
                size="sm"
                renderIcon={RefreshCw}
                onClick={() => onOpenRescheduleModal(a)}
                title="Reschedule Appointment"
              >
                Reschedule
              </CarbonButton>
            )}
            {canCancel && (
              <CarbonButton
                kind="ghost"
                size="sm"
                renderIcon={XCircle}
                onClick={() => onOpenCancelModal(a)}
                title="Cancel Appointment"
                className="text-[#da1e28] hover:bg-[#fff1f1]"
              >
                Cancel
              </CarbonButton>
            )}
          </div>
        );
      }
    }
  ];

  // Queue Columns
  const queueColumns: Column<QueueItem>[] = [
    {
      key: 'queuePosition',
      header: 'Queue #',
      sortable: true,
      render: (item) => (
        <div className="flex items-center gap-1.5">
          <div className="w-8 h-8 rounded-full bg-[#161616] text-white flex items-center justify-center font-mono font-bold text-xs">
            {item.queuePosition}
          </div>
        </div>
      )
    },
    {
      key: 'priority',
      header: 'Triage Priority',
      render: (item) => {
        const pTag = getPriorityTag(item.priority);
        return (
          <div>
            <div className="flex flex-wrap items-center gap-1">
              {item.isEscalated && (
                <CarbonTag type="red" size="sm">EMERGENCY</CarbonTag>
              )}
              <CarbonTag type={pTag.type} size="sm">{pTag.label}</CarbonTag>
              <button
                type="button"
                onClick={() => setSelectedQueueItemForPriority(item)}
                className="text-[#0f62fe] hover:underline text-[10px] ml-1 font-mono"
                title={isClinician ? 'Adjust clinical priority' : 'Flag emergency escalation'}
              >
                {isClinician ? 'Triage' : 'Escalate'}
              </button>
            </div>
            {item.isEscalated && item.escalationReason && (
              <div className="text-[10px] text-[#da1e28] font-semibold mt-0.5 line-clamp-1">
                Escalation: {item.escalationReason}
              </div>
            )}
            {item.priorityReason && (
              <div className="text-[10px] text-[#525252] mt-0.5 line-clamp-1">
                {item.priorityReason}
              </div>
            )}
          </div>
        );
      }
    },
    {
      key: 'patient',
      header: 'Patient Details',
      render: (item) => (
        <div>
          <div className="font-semibold text-xs text-[#161616]">
            {item.patientName}
          </div>
          <div className="text-[11px] font-mono text-[#525252]">
            {item.patientMrn} {item.patientPhone ? `• ${item.patientPhone}` : ''}
          </div>
          <div className="text-[10px] font-mono text-[#0f62fe] mt-0.5">
            Ref: {item.appointmentNumber}
          </div>
        </div>
      )
    },
    {
      key: 'practitioner',
      header: 'Attending Practitioner',
      render: (item) => {
        const isVaidya = item.practitionerRole === 'VAIDYA';
        return (
          <div>
            <div className="font-semibold text-xs text-[#161616] flex items-center gap-1.5">
              <span>{item.practitionerName}</span>
              <span className={`text-[9px] px-1.5 py-0.2 font-mono uppercase border ${isVaidya ? 'bg-[#f6f2ff] text-[#6929c4] border-[#d4bbff]' : 'bg-[#edf5ff] text-[#0043ce] border-[#a6c8ff]'}`}>
                {isVaidya ? 'VAIDYA' : 'DOCTOR'}
              </span>
            </div>
            <div className="text-[11px] text-[#525252]">
              {item.department}
            </div>
          </div>
        );
      }
    },
    {
      key: 'waitInfo',
      header: 'Arrival & Waiting Time',
      render: (item) => (
        <div className="text-xs">
          <div className="font-mono text-[#161616]">
            {new Date(item.checkInTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </div>
          <div className={`font-mono text-[11px] font-semibold ${item.waitingDurationMinutes > 30 ? 'text-[#da1e28]' : 'text-[#0f62fe]'}`}>
            Waited: {item.waitingDurationMinutes} mins
          </div>
        </div>
      )
    },
    {
      key: 'source',
      header: 'Source',
      render: (item) => (
        <CarbonTag type={item.bookingSource === 'walk_in' ? 'teal' : 'blue'} size="sm">
          {item.bookingSource === 'walk_in' ? 'WALK-IN' : 'SCHEDULED'}
        </CarbonTag>
      )
    },
    {
      key: 'status',
      header: 'Status',
      render: (item) => {
        const isConsult = item.status === 'in_consultation';
        return (
          <CarbonTag type={isConsult ? 'purple' : 'warm-gray'} size="sm">
            {isConsult ? 'IN CONSULTATION' : 'WAITING'}
          </CarbonTag>
        );
      }
    },
    {
      key: 'actions',
      header: 'Clinical Workflow Actions',
      render: (item) => {
        if (item.status === 'waiting') {
          return (
            <CarbonButton
              kind="primary"
              size="sm"
              renderIcon={ArrowRight}
              onClick={() => handleConsultationHandoff(item.id)}
              title="Call patient into consultation"
            >
              Call Into Room
            </CarbonButton>
          );
        }
        if (item.status === 'in_consultation') {
          return (
            <CarbonButton
              kind="secondary"
              size="sm"
              renderIcon={CheckCircle}
              onClick={() => handleCompleteConsultation(item.id)}
              title="Mark consultation completed"
              className="bg-[#24a148] hover:bg-[#198038] text-white"
            >
              Complete Visit
            </CarbonButton>
          );
        }
        return null;
      }
    }
  ];

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="bg-white border border-[#e0e0e0] p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="text-[12px] font-mono uppercase tracking-[0.32px] text-[#525252] mb-1">
            Clinical Scheduling, Reception & Waiting Queue Operations
          </div>
          <h1 className="text-[28px] font-semibold text-[#161616] tracking-tight leading-none">
            Appointments & Reception Queue
          </h1>
          <p className="text-[13px] text-[#525252] mt-2">
            Integrated patient scheduling, walk-in admissions, real-time waiting queue triage, and consultation handoff.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <CarbonButton
            kind="secondary"
            renderIcon={RefreshCw}
            onClick={refreshData}
            disabled={loading}
          >
            {loading ? 'Refreshing...' : 'Refresh'}
          </CarbonButton>

          <CarbonButton
            kind="tertiary"
            renderIcon={UserCheck}
            onClick={() => setIsWalkInModalOpen(true)}
          >
            Admit Walk-In
          </CarbonButton>

          <CarbonButton
            kind="primary"
            renderIcon={Plus}
            onClick={onOpenNewAppointmentModal}
          >
            Schedule Appointment
          </CarbonButton>
        </div>
      </div>

      {/* Notifications */}
      {errorMessage && (
        <div className="p-3 bg-[#fff1f1] border-l-4 border-l-[#da1e28] border border-[#ffb3b8] text-xs text-[#a2191f] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-[#da1e28]" />
            <span>{errorMessage}</span>
          </div>
          <button
            onClick={() => setErrorMessage(null)}
            className="text-[#da1e28] hover:underline font-mono"
          >
            Dismiss
          </button>
        </div>
      )}

      {successMessage && (
        <div className="p-3 bg-[#defbe6] border-l-4 border-l-[#24a148] border border-[#a7f0ba] text-xs text-[#0e6027] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-[#24a148]" />
            <span>{successMessage}</span>
          </div>
          <button
            onClick={() => setSuccessMessage(null)}
            className="text-[#0e6027] hover:underline font-mono"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Reception Dashboard Operational KPI Cards */}
      {dashboardMetrics && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
          <div className="bg-white border border-[#e0e0e0] p-3 text-center">
            <div className="text-[10px] font-mono text-[#525252] uppercase">Today's Total</div>
            <div className="text-xl font-bold font-mono text-[#161616] mt-0.5">
              {dashboardMetrics.totalScheduled}
            </div>
          </div>
          <div className="bg-white border border-[#e0e0e0] p-3 text-center">
            <div className="text-[10px] font-mono text-[#525252] uppercase">Checked In</div>
            <div className="text-xl font-bold font-mono text-[#0043ce] mt-0.5">
              {dashboardMetrics.checkedIn}
            </div>
          </div>
          <div className="bg-white border border-[#e0e0e0] p-3 text-center bg-[#edf5ff]">
            <div className="text-[10px] font-mono text-[#0043ce] font-semibold uppercase">In Queue</div>
            <div className="text-xl font-bold font-mono text-[#0f62fe] mt-0.5">
              {dashboardMetrics.waiting}
            </div>
          </div>
          <div className="bg-white border border-[#e0e0e0] p-3 text-center">
            <div className="text-[10px] font-mono text-[#525252] uppercase">Consulting</div>
            <div className="text-xl font-bold font-mono text-[#6929c4] mt-0.5">
              {dashboardMetrics.inConsultation}
            </div>
          </div>
          <div className="bg-white border border-[#e0e0e0] p-3 text-center">
            <div className="text-[10px] font-mono text-[#525252] uppercase">Completed</div>
            <div className="text-xl font-bold font-mono text-[#24a148] mt-0.5">
              {dashboardMetrics.completed}
            </div>
          </div>
          <div className="bg-white border border-[#e0e0e0] p-3 text-center">
            <div className="text-[10px] font-mono text-[#525252] uppercase">Walk-Ins</div>
            <div className="text-xl font-bold font-mono text-[#0072c3] mt-0.5">
              {dashboardMetrics.walkIns}
            </div>
          </div>
          <div className="bg-white border border-[#e0e0e0] p-3 text-center">
            <div className="text-[10px] font-mono text-[#525252] uppercase">Doctor Queue</div>
            <div className="text-xl font-bold font-mono text-[#0f62fe] mt-0.5">
              {dashboardMetrics.doctorQueueCount}
            </div>
          </div>
          <div className="bg-white border border-[#e0e0e0] p-3 text-center">
            <div className="text-[10px] font-mono text-[#525252] uppercase">Vaidya Queue</div>
            <div className="text-xl font-bold font-mono text-[#6929c4] mt-0.5">
              {dashboardMetrics.vaidyaQueueCount}
            </div>
          </div>
        </div>
      )}

      {/* Main Tabs */}
      <CarbonTabs
        selectedId={activeTab}
        onSelect={(id) => setActiveTab(id as any)}
        tabs={[
          {
            id: 'queue',
            label: 'Reception Queue & Check-In',
            count: queueItems.length
          },
          {
            id: 'directory',
            label: 'Appointments Master Directory',
            count: appointments.length
          },
          {
            id: 'dashboard',
            label: 'Reception Dashboard & Analytics'
          },
          {
            id: 'availability',
            label: 'Practitioner Availability & Slots',
            count: doctors.length
          }
        ]}
      />

      {/* TAB 1: RECEPTION QUEUE & CHECK-IN */}
      {activeTab === 'queue' && (
        <div className="space-y-6">
          {/* Quick Check-In Bar */}
          <div className="bg-white border border-[#e0e0e0] p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-xs font-semibold text-[#161616] flex items-center gap-1.5">
                <UserCheck className="w-4 h-4 text-[#0f62fe]" />
                <span>Today's Patient Arrival Check-In</span>
              </div>
              <span className="text-[11px] font-mono text-[#525252]">
                Date: {todayStr} &bull; {checkInCandidates.length} eligible today
              </span>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch gap-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#525252]" />
                <input
                  type="text"
                  value={quickCheckInSearch}
                  onChange={(e) => setQuickCheckInSearch(e.target.value)}
                  placeholder="Search arriving patient by Name, MRN, or Ref (e.g. APT-2026-10001)..."
                  className="w-full carbon-input pl-9 text-xs"
                />
              </div>

              <input
                type="text"
                value={checkInNotes}
                onChange={(e) => setCheckInNotes(e.target.value)}
                placeholder="Reception arrival notes (e.g. wheelchair requested, companion present)..."
                className="carbon-input text-xs sm:w-80"
              />
            </div>

            {quickCheckInSearch.trim() && (
              <div className="border border-[#e0e0e0] bg-[#f4f4f4] max-h-48 overflow-y-auto divide-y divide-[#e0e0e0]">
                {checkInCandidates.length === 0 ? (
                  <div className="p-3 text-xs text-[#525252] text-center">
                    No matching scheduled appointments found for today. Use "Admit Walk-In" for unbooked arrivals.
                  </div>
                ) : (
                  checkInCandidates.map((candidate) => (
                    <div
                      key={candidate.id}
                      className="p-3 flex items-center justify-between hover:bg-white transition-colors text-xs"
                    >
                      <div>
                        <div className="font-semibold text-[#161616]">
                          {candidate.patientName} ({candidate.patientMrn})
                        </div>
                        <div className="text-[11px] text-[#525252] font-mono">
                          Ref: {candidate.appointmentNumber} &bull; Time: {candidate.timeSlot} &bull; With: {candidate.doctorName}
                        </div>
                      </div>

                      <CarbonButton
                        kind="primary"
                        size="sm"
                        renderIcon={UserCheck}
                        onClick={() => handleCheckIn(candidate.id, checkInNotes)}
                      >
                        Check In Now
                      </CarbonButton>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Queue Filter Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3 border border-[#e0e0e0]">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-[#161616]">Discipline Filter:</span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setQueueDisciplineFilter('all')}
                  className={`px-3 py-1 text-xs font-medium border ${queueDisciplineFilter === 'all' ? 'bg-[#161616] text-white border-[#161616]' : 'bg-white text-[#525252] border-[#e0e0e0] hover:bg-[#f4f4f4]'}`}
                >
                  All Disciplines ({queueItems.length})
                </button>
                <button
                  type="button"
                  onClick={() => setQueueDisciplineFilter('DOCTOR')}
                  className={`px-3 py-1 text-xs font-medium border ${queueDisciplineFilter === 'DOCTOR' ? 'bg-[#0f62fe] text-white border-[#0f62fe]' : 'bg-white text-[#525252] border-[#e0e0e0] hover:bg-[#f4f4f4]'}`}
                >
                  Modern Medicine (Doctor: {queueItems.filter((i) => i.practitionerRole === 'DOCTOR').length})
                </button>
                <button
                  type="button"
                  onClick={() => setQueueDisciplineFilter('VAIDYA')}
                  className={`px-3 py-1 text-xs font-medium border ${queueDisciplineFilter === 'VAIDYA' ? 'bg-[#6929c4] text-white border-[#6929c4]' : 'bg-white text-[#525252] border-[#e0e0e0] hover:bg-[#f4f4f4]'}`}
                >
                  Ayurvedic Medicine (Vaidya: {queueItems.filter((i) => i.practitionerRole === 'VAIDYA').length})
                </button>
              </div>
            </div>

            <div className="text-xs text-[#525252] font-mono">
              Deterministic Queue Order: Urgent &gt; Priority &gt; Normal &bull; Position Ascending
            </div>
          </div>

          {/* Real-time Queue Table */}
          <CarbonDataTable<QueueItem>
            title="Real-Time Patient Waiting Queue"
            description="Authoritative queue ordered deterministically by clinical priority hierarchy and check-in timestamp."
            columns={queueColumns}
            data={filteredQueue}
            searchPlaceholder="Filter queue by patient name, MRN, or doctor..."
            initialSortKey="queuePosition"
            primaryAction={{
              label: 'Admit Walk-In Patient',
              icon: Plus,
              onClick: () => setIsWalkInModalOpen(true)
            }}
          />
        </div>
      )}

      {/* TAB 2: APPOINTMENTS MASTER DIRECTORY */}
      {activeTab === 'directory' && (
        <div className="space-y-4">
          {/* Multi-Factor Filter Bar */}
          <div className="bg-white p-4 border border-[#e0e0e0] space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
              {/* Date Filter */}
              <div>
                <label className="block font-semibold text-[#161616] mb-1">Date Filter</label>
                <select
                  value={dateFilter}
                  onChange={(e) => setDateFilter(e.target.value as any)}
                  className="w-full carbon-input text-xs"
                >
                  <option value="all">All Dates</option>
                  <option value="today">Today ({todayStr})</option>
                  <option value="upcoming">Upcoming Encounters</option>
                  <option value="past">Past Encounters</option>
                </select>
              </div>

              {/* Status Filter */}
              <div>
                <label className="block font-semibold text-[#161616] mb-1">Status</label>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="w-full carbon-input text-xs"
                >
                  <option value="all">All Statuses</option>
                  <option value="scheduled">Scheduled</option>
                  <option value="confirmed">Confirmed</option>
                  <option value="checked_in">Checked In</option>
                  <option value="waiting">In Waiting Queue</option>
                  <option value="in_consultation">In Consultation</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                  <option value="rescheduled">Rescheduled</option>
                  <option value="no_show">No Show</option>
                </select>
              </div>

              {/* Discipline Filter */}
              <div>
                <label className="block font-semibold text-[#161616] mb-1">Discipline</label>
                <select
                  value={disciplineFilter}
                  onChange={(e) => setDisciplineFilter(e.target.value)}
                  className="w-full carbon-input text-xs"
                >
                  <option value="all">All Disciplines</option>
                  <option value="DOCTOR">Modern Medicine (Doctor)</option>
                  <option value="VAIDYA">Ayurvedic Medicine (Vaidya)</option>
                </select>
              </div>

              {/* Practitioner Filter */}
              <div>
                <label className="block font-semibold text-[#161616] mb-1">Attending Practitioner</label>
                <select
                  value={practitionerFilter}
                  onChange={(e) => setPractitionerFilter(e.target.value)}
                  className="w-full carbon-input text-xs"
                >
                  <option value="all">All Practitioners</option>
                  {doctors.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} ({d.department || d.specialty})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Search Input */}
            <div>
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#525252]" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search directory by Patient Name, MRN, Practitioner, or Reference (e.g. APT-2026-10001)..."
                  className="w-full carbon-input pl-9 text-xs"
                />
              </div>
            </div>
          </div>

          <CarbonDataTable<Appointment>
            title="Hospital Appointment Master Roster"
            description="Authoritative directory of all clinical consultation schedules, walk-ins, and completed encounters."
            columns={directoryColumns}
            data={filteredAppointments}
            searchPlaceholder="Filter listed records..."
            initialSortKey="dateTime"
            primaryAction={{
              label: 'Schedule Appointment',
              icon: Plus,
              onClick: onOpenNewAppointmentModal
            }}
          />
        </div>
      )}

      {/* TAB 3: RECEPTION DASHBOARD & ANALYTICS */}
      {activeTab === 'dashboard' && dashboardMetrics && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Operational Summary */}
            <div className="bg-white border border-[#e0e0e0] p-6 space-y-4">
              <h3 className="text-sm font-semibold text-[#161616] uppercase tracking-wider font-mono">
                Today's Patient Flow
              </h3>
              <div className="space-y-3 text-xs">
                <div className="flex justify-between items-center py-1.5 border-b border-[#e0e0e0]">
                  <span className="text-[#525252]">Total Registered Today:</span>
                  <span className="font-mono font-bold text-[#161616]">{dashboardMetrics.totalScheduled}</span>
                </div>
                <div className="flex justify-between items-center py-1.5 border-b border-[#e0e0e0]">
                  <span className="text-[#525252]">Walk-In Admissions:</span>
                  <span className="font-mono font-bold text-[#0072c3]">{dashboardMetrics.walkIns}</span>
                </div>
                <div className="flex justify-between items-center py-1.5 border-b border-[#e0e0e0]">
                  <span className="text-[#525252]">Checked In at Reception:</span>
                  <span className="font-mono font-bold text-[#0043ce]">{dashboardMetrics.checkedIn}</span>
                </div>
                <div className="flex justify-between items-center py-1.5 border-b border-[#e0e0e0]">
                  <span className="text-[#525252]">Currently in Waiting Queue:</span>
                  <span className="font-mono font-bold text-[#0f62fe]">{dashboardMetrics.waiting}</span>
                </div>
                <div className="flex justify-between items-center py-1.5 border-b border-[#e0e0e0]">
                  <span className="text-[#525252]">Active in Consultations:</span>
                  <span className="font-mono font-bold text-[#6929c4]">{dashboardMetrics.inConsultation}</span>
                </div>
                <div className="flex justify-between items-center py-1.5 border-b border-[#e0e0e0]">
                  <span className="text-[#525252]">Completed Consultations:</span>
                  <span className="font-mono font-bold text-[#24a148]">{dashboardMetrics.completed}</span>
                </div>
                <div className="flex justify-between items-center py-1.5 border-b border-[#e0e0e0]">
                  <span className="text-[#525252]">Cancellations:</span>
                  <span className="font-mono font-bold text-[#da1e28]">{dashboardMetrics.cancelled}</span>
                </div>
                <div className="flex justify-between items-center py-1.5">
                  <span className="text-[#525252]">No-Shows:</span>
                  <span className="font-mono font-bold text-[#8d8d8d]">{dashboardMetrics.noShow}</span>
                </div>
              </div>
            </div>

            {/* Discipline Separation Breakdown */}
            <div className="bg-white border border-[#e0e0e0] p-6 space-y-4">
              <h3 className="text-sm font-semibold text-[#161616] uppercase tracking-wider font-mono">
                Discipline Queue Isolation
              </h3>
              <p className="text-xs text-[#525252]">
                Active patient separation between Modern Clinical Medicine and Ayurvedic Consultation Queues.
              </p>

              <div className="space-y-4">
                <div className="p-4 bg-[#edf5ff] border border-[#a6c8ff] space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-[#0043ce]">Modern Medicine (Doctor) Queue</span>
                    <span className="text-lg font-mono font-bold text-[#0043ce]">{dashboardMetrics.doctorQueueCount}</span>
                  </div>
                  <div className="text-[11px] text-[#525252]">
                    Managed independently by licensed Allopathic Medical Officers.
                  </div>
                </div>

                <div className="p-4 bg-[#f6f2ff] border border-[#d4bbff] space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-[#6929c4]">Ayurvedic Medicine (Vaidya) Queue</span>
                    <span className="text-lg font-mono font-bold text-[#6929c4]">{dashboardMetrics.vaidyaQueueCount}</span>
                  </div>
                  <div className="text-[11px] text-[#525252]">
                    Managed independently by licensed Ayurvedic Physicians (Vaidyas).
                  </div>
                </div>
              </div>
            </div>

            {/* Reception Operating Protocols */}
            <div className="bg-white border border-[#e0e0e0] p-6 space-y-4">
              <h3 className="text-sm font-semibold text-[#161616] uppercase tracking-wider font-mono">
                Reception Protocol Compliance
              </h3>
              <div className="space-y-3 text-xs text-[#525252]">
                <div className="p-3 bg-[#f4f4f4] border-l-4 border-l-[#0f62fe] space-y-1">
                  <strong className="text-[#161616]">Triage Priority Hierarchy:</strong>
                  <div>Queue ordering strictly enforces Urgent (1) &gt; Priority (2) &gt; Normal (3) priority sequence before FIFO check-in times.</div>
                </div>

                <div className="p-3 bg-[#f4f4f4] border-l-4 border-l-[#0f62fe] space-y-1">
                  <strong className="text-[#161616]">No Clinical Fabrication:</strong>
                  <div>Receptionists assign arrival timestamps and queue positions only; vitals and clinical notes remain strictly restricted to clinical staff.</div>
                </div>

                <div className="p-3 bg-[#f4f4f4] border-l-4 border-l-[#0f62fe] space-y-1">
                  <strong className="text-[#161616]">Conflict Prevention:</strong>
                  <div>Active conflict detection prevents overlapping slot scheduling for the same practitioner on the same calendar date.</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: PRACTITIONER AVAILABILITY */}
      {activeTab === 'availability' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {doctors.map((doc) => {
              const isVaidya = doc.department?.toLowerCase().includes('ayurved') || (doc.specialty as string)?.toLowerCase().includes('ayurved');
              return (
                <div
                  key={doc.id}
                  className="bg-white border border-[#e0e0e0] p-4 space-y-3 font-sans"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 text-white flex items-center justify-center font-bold font-mono text-sm ${isVaidya ? 'bg-[#6929c4]' : 'bg-[#0f62fe]'}`}>
                        {doc.name.split(' ').map((n) => n[0]).join('').slice(0, 2)}
                      </div>
                      <div>
                        <h4 className="font-semibold text-sm text-[#161616] flex items-center gap-1.5">
                          <span>{doc.name}</span>
                          <span className={`text-[9px] px-1.5 py-0.2 font-mono uppercase border ${isVaidya ? 'bg-[#f6f2ff] text-[#6929c4] border-[#d4bbff]' : 'bg-[#edf5ff] text-[#0043ce] border-[#a6c8ff]'}`}>
                            {isVaidya ? 'VAIDYA' : 'DOCTOR'}
                          </span>
                        </h4>
                        <p className="text-[11px] text-[#525252]">{doc.specialty} &bull; {doc.department}</p>
                      </div>
                    </div>
                    <CarbonTag type={doc.status === 'on_duty' ? 'green' : 'warm-gray'} size="sm">
                      {doc.status === 'on_duty' ? 'ON DUTY' : 'OFF DUTY'}
                    </CarbonTag>
                  </div>

                  <div className="border-t border-[#e0e0e0] pt-2 text-xs space-y-1">
                    <div className="flex justify-between text-[#525252]">
                      <span>Consultation Room:</span>
                      <strong className="text-[#161616] font-mono">{doc.room}</strong>
                    </div>
                    <div className="flex justify-between text-[#525252]">
                      <span>Contact / License:</span>
                      <strong className="text-[#161616] font-mono">{doc.licenseNumber || doc.phone}</strong>
                    </div>
                  </div>

                  <div className="border-t border-[#e0e0e0] pt-2">
                    <div className="text-[10px] uppercase font-mono text-[#525252] mb-1.5">
                      Available Consultation Slots:
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {(doc.timeSlots || []).map((slot: string) => (
                        <span
                          key={slot}
                          className="px-2 py-0.5 bg-[#edf5ff] text-[#0043ce] text-[10px] font-mono border border-[#a6c8ff]"
                        >
                          {slot}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Modals */}
      <WalkInModal
        isOpen={isWalkInModalOpen}
        onClose={() => setIsWalkInModalOpen(false)}
        patients={patients}
        practitioners={doctors}
        onAdmitWalkIn={handleAdmitWalkIn}
      />

      <ChangePriorityModal
        isOpen={Boolean(selectedQueueItemForPriority)}
        onClose={() => setSelectedQueueItemForPriority(null)}
        queueItem={selectedQueueItemForPriority}
        currentUserRole={currentUserRole}
        onUpdatePriority={handleUpdatePriority}
        onEscalate={handleEscalatePatient}
      />
    </div>
  );
};
