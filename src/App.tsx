import React, { useState, useEffect, useCallback, useRef } from 'react';
import { CarbonHeader } from './components/carbon/CarbonHeader';
import { CarbonSideNav } from './components/carbon/CarbonSideNav';
import { CarbonNotification } from './components/carbon/CarbonNotification';

// Views
import { OverviewDashboard } from './views/OverviewDashboard';
import { PatientsDirectoryView } from './views/PatientsDirectoryView';
import { AppointmentsScheduleView } from './views/AppointmentsScheduleView';
import { DoctorsStaffView } from './views/DoctorsStaffView';
import { PharmacyView } from './views/PharmacyView';
import { LaboratoryView } from './views/LaboratoryView';
import { BillingInsuranceView } from './views/BillingInsuranceView';
import { AuditLogView } from './views/AuditLogView';
import { RbacManagementView } from './views/RbacManagementView';
import { ConsultationsWorkspaceView } from './views/ConsultationsWorkspaceView';
import { TreatmentsManagementView } from './views/TreatmentsManagementView';
import { PanchakarmaManagementView } from './views/PanchakarmaManagementView';
import { ReportsAnalyticsView } from './views/ReportsAnalyticsView';
import { SettingsWorkspaceView } from './views/SettingsWorkspaceView';
import { AuthScreenView } from './views/AuthScreenView';

// Modals
import { CarbonSearchModal } from './components/carbon/CarbonSearchModal';
import { NewPatientModal } from './components/modals/NewPatientModal';
import { EditPatientModal } from './components/modals/EditPatientModal';
import { DeletePatientModal } from './components/modals/DeletePatientModal';
import { NewAppointmentModal } from './components/modals/NewAppointmentModal';
import { RescheduleAppointmentModal } from './components/modals/RescheduleAppointmentModal';
import { CancelAppointmentModal } from './components/modals/CancelAppointmentModal';
import { PrescriptionModal } from './components/modals/PrescriptionModal';
import { LabOrderModal } from './components/modals/LabOrderModal';
import { GenerateBillModal } from './components/modals/GenerateBillModal';
import { NewPharmacyStockModal } from './components/modals/NewPharmacyStockModal';

// API & Types
import { hospitalApi } from './services/hospitalApi';
import {
  Patient,
  Doctor,
  Appointment,
  Prescription,
  MedicationStock,
  LabOrder,
  BillInvoice,
  ClinicalAuditLog,
  HospitalOverviewMetrics,
  AppUser,
  UserRole,
  Consultation,
  TreatmentPlan,
  PanchakarmaCourse,
  PanchakarmaDailySession,
  StaffMember,
  StockMovement,
  DoshaProfile
} from './types/hospital';

interface RouteState {
  view: string;
  isProtected: boolean;
}

function parseAppRoute(pathname: string, search: string): RouteState {
  try {
    const params = new URLSearchParams(search);
    const viewParam = params.get('view');
    if (viewParam) {
      if (viewParam === 'login' || viewParam === 'activate') {
        return { view: viewParam, isProtected: false };
      }
      return { view: viewParam, isProtected: true };
    }
  } catch {}

  const cleanPath = pathname.replace(/\/+$/, '') || '/';
  if (cleanPath === '/' || cleanPath === '/login') {
    return { view: 'login', isProtected: false };
  }
  if (cleanPath === '/activate') {
    return { view: 'activate', isProtected: false };
  }
  if (cleanPath === '/dashboard' || cleanPath === '/overview') {
    return { view: 'overview', isProtected: true };
  }
  if (cleanPath === '/patients') return { view: 'patients', isProtected: true };
  if (cleanPath === '/appointments') return { view: 'appointments', isProtected: true };
  if (cleanPath === '/consultations') return { view: 'consultations', isProtected: true };
  if (cleanPath === '/treatments') return { view: 'treatments', isProtected: true };
  if (cleanPath === '/panchakarma') return { view: 'panchakarma', isProtected: true };
  if (cleanPath === '/pharmacy') return { view: 'pharmacy', isProtected: true };
  if (cleanPath === '/laboratory') return { view: 'laboratory', isProtected: true };
  if (cleanPath === '/billing') return { view: 'billing', isProtected: true };
  if (cleanPath === '/reports') return { view: 'reports', isProtected: true };
  if (cleanPath === '/settings') return { view: 'settings', isProtected: true };
  if (cleanPath === '/doctors' || cleanPath === '/staff') return { view: 'doctors', isProtected: true };
  if (cleanPath === '/rbac') return { view: 'rbac', isProtected: true };
  if (cleanPath === '/audit') return { view: 'audit', isProtected: true };

  return { view: 'overview', isProtected: true };
}

function syncUrlForView(view: string) {
  try {
    const currentPath = window.location.pathname.replace(/\/+$/, '') || '/';
    let targetPath = '/';
    if (view === 'login') {
      targetPath = '/login';
    } else if (view === 'activate') {
      targetPath = '/activate';
    } else if (view === 'overview') {
      targetPath = '/dashboard';
    } else {
      targetPath = `/${view}`;
    }
    if (currentPath !== targetPath) {
      window.history.pushState(null, '', targetPath);
    }
  } catch {}
}

export default function App() {
  // Navigation State & Route Preservation
  const intendedRouteRef = useRef<string | null>(null);
  const [activeView, setActiveView] = useState<string>('login');
  const [isSideNavOpen, setIsSideNavOpen] = useState<boolean>(() => {
    try {
      return localStorage.getItem('sahachara.sidebar.collapsed') !== 'true';
    } catch {
      return true;
    }
  });

  // Carbon Theme State (g10 light vs g100 dark) - persisted in localStorage
  const [theme, setTheme] = useState<'g10' | 'g100'>(() => {
    try {
      const stored = localStorage.getItem('sahachara.theme');
      if (stored === 'g100' || stored === 'g10') return stored;
    } catch {}
    return 'g10';
  });

  // Session Authentication & Authorization State (Fail-Closed Default: false & initializing: true)
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isAuthInitializing, setIsAuthInitializing] = useState<boolean>(true);
  const [currentUser, setCurrentUser] = useState<AppUser | null>(null);
  const [users, setUsers] = useState<AppUser[]>([]);

  // Sync theme with DOM document and persist to localStorage
  useEffect(() => {
    const validTheme = theme === 'g100' ? 'g100' : 'g10';
    try {
      localStorage.setItem('sahachara.theme', validTheme);
    } catch (e) {
      console.error('Failed to persist theme:', e);
    }
    document.documentElement.setAttribute('data-carbon-theme', validTheme);
    document.body.setAttribute('data-carbon-theme', validTheme);
    if (validTheme === 'g100') {
      document.documentElement.classList.add('dark', 'carbon-theme-g100');
      document.documentElement.classList.remove('carbon-theme-g10');
      document.body.classList.add('dark', 'carbon-theme-g100');
      document.body.classList.remove('carbon-theme-g10');
    } else {
      document.documentElement.classList.remove('dark', 'carbon-theme-g100');
      document.documentElement.classList.add('carbon-theme-g10');
      document.body.classList.remove('dark', 'carbon-theme-g100');
      document.body.classList.add('carbon-theme-g10');
    }
  }, [theme]);

  const handleToggleTheme = (specificTheme?: unknown) => {
    setTheme((prev) => {
      const nextTheme: 'g10' | 'g100' =
        specificTheme === 'g100' || specificTheme === 'g10'
          ? specificTheme
          : prev === 'g100'
          ? 'g10'
          : 'g100';

      return nextTheme;
    });
  };

  // Synchronous route resolution and asynchronous session verification on mount
  useEffect(() => {
    let isCancelled = false;

    const initialRoute = typeof window !== 'undefined'
      ? parseAppRoute(window.location.pathname, window.location.search)
      : { view: 'login', isProtected: false };

    if (initialRoute.isProtected) {
      intendedRouteRef.current = initialRoute.view;
    }

    const initSession = async () => {
      try {
        const token = typeof localStorage !== 'undefined' ? localStorage.getItem('sahachara_auth_token') : null;
        if (!token) {
          if (!isCancelled) {
            setIsAuthenticated(false);
            setCurrentUser(null);
            setUsers(hospitalApi.getUsers());
            setActiveView(initialRoute.view === 'activate' ? 'activate' : 'login');
            setIsAuthInitializing(false);
          }
          return;
        }

        // Token present -> MUST be verified with backend
        const res = await hospitalApi.verifySession(token);
        if (isCancelled) return;

        if (res.success && res.user) {
          setIsAuthenticated(true);
          setCurrentUser(res.user);
          setUsers(hospitalApi.getUsers());
          const target = intendedRouteRef.current;
          const nextView = target && target !== 'login' && target !== 'activate' ? target : 'overview';
          setActiveView(nextView);
          syncUrlForView(nextView);
          intendedRouteRef.current = null;
        } else {
          // Token is expired, invalid, tampered, or rejected by backend -> Fail closed
          console.warn('[Sahachara Ops] Session verification failed or token expired:', res.error);
          hospitalApi.logout();
          setIsAuthenticated(false);
          setCurrentUser(null);
          setUsers(hospitalApi.getUsers());
          setActiveView('login');
          syncUrlForView('login');
        }
      } catch (err) {
        // Network failure during session verification -> Fail closed
        console.error('[Sahachara Ops] Network failure during session verification:', err);
        hospitalApi.logout();
        if (!isCancelled) {
          setIsAuthenticated(false);
          setCurrentUser(null);
          setUsers(hospitalApi.getUsers());
          setActiveView('login');
          syncUrlForView('login');
        }
      } finally {
        if (!isCancelled) {
          setIsAuthInitializing(false);
        }
      }
    };

    initSession();

    return () => {
      isCancelled = true;
    };
  }, []);

  // Listen for browser navigation (back / forward buttons)
  useEffect(() => {
    const handlePopState = () => {
      const route = parseAppRoute(window.location.pathname, window.location.search);
      if (route.isProtected && !isAuthenticated) {
        intendedRouteRef.current = route.view;
        setActiveView('login');
      } else {
        setActiveView(route.view);
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [isAuthenticated]);

  const handleNavigate = (viewId: string) => {
    if (!isAuthenticated) {
      if (viewId === 'login' || viewId === 'activate') {
        setActiveView(viewId);
        syncUrlForView(viewId);
      } else {
        intendedRouteRef.current = viewId;
        setActiveView('login');
        syncUrlForView('login');
      }
      return;
    }
    setActiveView(viewId);
    syncUrlForView(viewId);
  };

  // Global Keyboard Shortcut: ⌘K or Ctrl+K for Operational Search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsSearchModalOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Data State
  const [metrics, setMetrics] = useState<HospitalOverviewMetrics | null>(null);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [medicationStock, setMedicationStock] = useState<MedicationStock[]>([]);
  const [stockMovements, setStockMovements] = useState<StockMovement[]>([]);
  const [labOrders, setLabOrders] = useState<LabOrder[]>([]);
  const [invoices, setInvoices] = useState<BillInvoice[]>([]);
  const [auditLogs, setAuditLogs] = useState<ClinicalAuditLog[]>([]);
  const [consultations, setConsultations] = useState<Consultation[]>([]);
  const [treatments, setTreatments] = useState<TreatmentPlan[]>([]);
  const [panchakarma, setPanchakarma] = useState<PanchakarmaCourse[]>([]);

  // Toast / System Notification State
  const [notification, setNotification] = useState<{
    kind: 'info' | 'success' | 'warning' | 'error';
    title: string;
    subtitle?: string;
  } | null>(null);

  // Global Search Modal
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);

  // Modals
  const [isNewPatientModalOpen, setIsNewPatientModalOpen] = useState(false);
  const [editingPatient, setEditingPatient] = useState<Patient | null>(null);
  const [deletingPatient, setDeletingPatient] = useState<Patient | null>(null);

  const [isNewAppointmentModalOpen, setIsNewAppointmentModalOpen] = useState(false);
  const [reschedulingAppointment, setReschedulingAppointment] = useState<Appointment | null>(null);
  const [cancellingAppointment, setCancellingAppointment] = useState<Appointment | null>(null);

  const [isPrescriptionModalOpen, setIsPrescriptionModalOpen] = useState(false);
  const [isLabModalOpen, setIsLabModalOpen] = useState(false);
  const [isBillingModalOpen, setIsBillingModalOpen] = useState(false);
  const [isAddPharmacyStockModalOpen, setIsAddPharmacyStockModalOpen] = useState(false);

  // Patient context for targeted actions
  const [contextPatient, setContextPatient] = useState<Patient | null>(null);

  // Refresh all state (Only when authenticated)
  const refreshData = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const curUser = hospitalApi.getCurrentUser();
      setCurrentUser(curUser);
      setUsers(hospitalApi.getUsers());

      const [
        m,
        p,
        d,
        apts,
        rx,
        stock,
        labs,
        invs,
        audits,
        cons,
        treats,
        pks,
        stf,
        sm
      ] = await Promise.all([
        hospitalApi.getOverviewMetrics(),
        hospitalApi.getPatients(),
        hospitalApi.getDoctors(),
        hospitalApi.getAppointments(),
        hospitalApi.getPrescriptions(),
        hospitalApi.getMedicationStock(),
        hospitalApi.getLabOrders(),
        hospitalApi.getInvoices(),
        hospitalApi.getAuditLogs(),
        hospitalApi.getConsultations(),
        hospitalApi.getTreatments(),
        hospitalApi.getPanchakarmaCourses(),
        hospitalApi.getStaff(),
        hospitalApi.getStockMovements()
      ]);

      setMetrics(m);
      setPatients(p);
      setDoctors(d);
      setStaff(stf);
      setAppointments(apts);
      setPrescriptions(rx);
      setMedicationStock(stock);
      setStockMovements(sm);
      setLabOrders(labs);
      setInvoices(invs);
      setAuditLogs(audits);
      setConsultations(cons);
      setTreatments(treats);
      setPanchakarma(pks);
    } catch (err) {
      console.error('Failed to refresh SahacharaOS hospital data:', err);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (isAuthenticated) {
      refreshData();
      const unsubscribe = hospitalApi.subscribe(() => {
        refreshData();
      });
      return unsubscribe;
    }
  }, [isAuthenticated, refreshData]);


  // Switch Active RBAC User Session
  const handleSwitchUser = (userId: string) => {
    hospitalApi.setCurrentUser(userId);
    const updatedUser = hospitalApi.getCurrentUser();
    setCurrentUser(updatedUser);
    setNotification({
      kind: 'info',
      title: `Switched Session to ${updatedUser.name}`,
      subtitle: `Active Role: ${updatedUser.role} (${updatedUser.title})`
    });
  };

  const handleUpdateUserRole = (userId: string, newRole: UserRole) => {
    hospitalApi.updateUserRole(userId, newRole);
    setNotification({
      kind: 'success',
      title: 'RBAC Role Reassigned',
      subtitle: `User role permissions updated successfully`
    });
  };

  // Patient Actions
  const handleCreatePatient = async (newPatientData: Partial<Patient>) => {
    const created = await hospitalApi.createPatient(newPatientData);
    setNotification({
      kind: 'success',
      title: 'Patient Profile Created',
      subtitle: `${created.firstName} ${created.lastName} registered with MRN ${created.mrn}`
    });
  };

  const handleSavePatientEdits = async (id: string, updates: Partial<Patient>) => {
    const updated = await hospitalApi.updatePatient(id, updates);
    setNotification({
      kind: 'success',
      title: 'Patient Dossier Updated',
      subtitle: `Clinical details, medications & diagnoses saved for ${updated.mrn}`
    });
  };

  const handleUpdatePatientDoshaProfile = async (patientId: string, profile: DoshaProfile) => {
    try {
      const updated = await hospitalApi.updatePatientDoshaProfile(patientId, profile);
      setPatients((prev) =>
        prev.map((p) => (p.id === patientId || p.mrn === patientId ? updated : p))
      );
      setNotification({
        kind: 'success',
        title: 'Dosha Assessment Documented',
        subtitle: `Physician recorded Prakriti ${profile.prakriti.dominant} & Vikriti assessment for ${updated.firstName} ${updated.lastName}`
      });
    } catch (err: any) {
      setNotification({
        kind: 'error',
        title: 'Failed to Save Dosha Profile',
        subtitle: err.message || 'Error occurred while saving dosha clinical assessment.'
      });
    }
  };

  const handleDeletePatient = async (patientId: string) => {
    try {
      const res = await hospitalApi.deletePatient(patientId);
      setNotification({
        kind: res.archived ? 'info' : 'warning',
        title: res.archived ? 'Patient Safely Archived' : 'Patient Record Purged',
        subtitle: res.message
      });
    } catch (err: any) {
      setNotification({
        kind: 'error',
        title: 'Deletion Failed',
        subtitle: err.message || 'Unauthorized action'
      });
    }
  };

  // Appointment Actions
  const handleScheduleAppointment = async (
    data: Partial<Appointment>,
    sendReminder: boolean,
    reminderChannel: 'SMS' | 'Email'
  ) => {
    const apt = await hospitalApi.createAppointment(data);
    if (sendReminder) {
      await hospitalApi.sendAppointmentReminder(apt.id, reminderChannel);
    }
    setNotification({
      kind: 'success',
      title: 'Appointment Scheduled',
      subtitle: `Consultation confirmed with ${apt.doctorName} for ${apt.patientName}`
    });
  };

  const handleRescheduleAppointment = async (id: string, newDateTime: string, newTimeSlot: string, reason?: string) => {
    await hospitalApi.rescheduleAppointment(id, newDateTime, newTimeSlot, reason);
    setNotification({
      kind: 'info',
      title: 'Appointment Rescheduled',
      subtitle: `New consultation slot set to ${newDateTime.split('T')[0]} at ${newTimeSlot}`
    });
  };

  const handleCancelAppointment = async (id: string, reason: string) => {
    await hospitalApi.cancelAppointment(id, reason);
    setNotification({
      kind: 'warning',
      title: 'Appointment Cancelled',
      subtitle: `Cancellation recorded in EMR schedule`
    });
  };

  const handleCreatePrescription = async (data: Partial<Prescription>) => {
    const created = await hospitalApi.createPrescription(data);
    setNotification({
      kind: 'success',
      title: 'E-Prescription Transmitted',
      subtitle: `${created.medicationName} ${created.dosage} sent to Central Pharmacy`
    });
  };

  const handleDispensePrescription = async (id: string, pharmacist: string) => {
    await hospitalApi.dispensePrescription(id, pharmacist);
    setNotification({
      kind: 'success',
      title: 'Medication Dispensed',
      subtitle: `Pharmacist verified and logged in compliance record`
    });
  };

  const handleReorderStock = async (id: string, delta: number) => {
    await hospitalApi.updateStockQuantity(id, delta);
    setNotification({
      kind: 'info',
      title: 'Stock Replenished',
      subtitle: `Added +${delta} units to pharmaceutical inventory`
    });
  };

  const handleAddPharmacyStock = async (data: Partial<MedicationStock>) => {
    const created = await hospitalApi.createMedicationStock(data);
    setNotification({
      kind: 'success',
      title: 'Pharmacy Stock Registered',
      subtitle: `${created.drugName} (${created.stockQuantity} ${created.unit}) added to formulary inventory`
    });
    await refreshData();
  };

  const handleAdjustStock = async (adjustment: {
    medicineId: string;
    medicineName: string;
    batchNumber: string;
    type: StockMovement['type'];
    quantityDelta: number;
    remainingQuantity: number;
    notes: string;
  }) => {
    await hospitalApi.createStockMovement(adjustment);
    await hospitalApi.updateStockQuantity(adjustment.medicineId, adjustment.quantityDelta);
    await refreshData();
  };

  const handleCreateLabOrder = async (data: Partial<LabOrder>) => {
    const created = await hospitalApi.createLabOrder(data);
    setNotification({
      kind: 'warning',
      title: 'Diagnostic Test Dispatched',
      subtitle: `${created.testType} (${created.priority}) sent to clinical laboratory`
    });
  };

  const handleUpdateLabResult = async (id: string, updates: Partial<LabOrder>) => {
    await hospitalApi.updateLabResult(id, updates);
    setNotification({
      kind: updates.isAbnormal ? 'error' : 'success',
      title: updates.isAbnormal ? 'Critical Lab Panic Value' : 'Lab Result Released',
      subtitle: `Result verified and posted to patient electronic dossier`
    });
  };

  const handleCreateInvoice = async (data: Partial<BillInvoice>) => {
    const created = await hospitalApi.createInvoice(data);
    setNotification({
      kind: 'success',
      title: 'Inpatient Bill Finalized',
      subtitle: `Invoice ${created.invoiceNumber} generated for $${created.totalAmount}`
    });
  };

  const handleUpdateInvoiceStatus = async (id: string, paymentStatus: BillInvoice['paymentStatus'], claimStatus?: BillInvoice['insuranceClaimStatus']) => {
    await hospitalApi.updateInvoiceStatus(id, paymentStatus, claimStatus);
    setNotification({
      kind: 'success',
      title: 'Payment Status Updated',
      subtitle: `Discharge clearance status updated to ${paymentStatus.toUpperCase()}`
    });
  };

  const handleResetData = () => {
    hospitalApi.resetAll();
    setNotification({
      kind: 'info',
      title: 'Clinical Data Reset',
      subtitle: 'Restored SahacharaOS records to initial demo baseline'
    });
  };

  // Ayurvedic Operations Handlers
  const handleSaveConsultation = async (data: Partial<Consultation>) => {
    const created = await hospitalApi.createConsultation(data);
    setNotification({
      kind: 'success',
      title: 'Ayurvedic Consultation Finalized',
      subtitle: `Consultation ${created.consultationNumber} for ${created.patientName} logged to EMR`
    });
    return created;
  };

  const handleCreateTreatment = async (data: Partial<TreatmentPlan>) => {
    const created = await hospitalApi.createTreatmentPlan(data);
    setNotification({
      kind: 'success',
      title: 'Therapy Plan Initialized',
      subtitle: `${created.therapyType} (${created.totalSessions} sessions) allocated to ${created.roomNumber}`
    });
    return created;
  };

  const handleUpdateTreatment = async (id: string, updates: Partial<TreatmentPlan>) => {
    const updated = await hospitalApi.updateTreatmentPlan(id, updates);
    setNotification({
      kind: 'info',
      title: 'Therapy Session Logged',
      subtitle: `${updated.completedSessions} of ${updated.totalSessions} sessions completed`
    });
    return updated;
  };

  const handleCreateCourse = async (data: Partial<PanchakarmaCourse>) => {
    const created = await hospitalApi.createPanchakarmaCourse(data);
    setNotification({
      kind: 'warning',
      title: 'Panchakarma Course Initiated',
      subtitle: `${created.protocol} (${created.totalDays} Days) started for ${created.patientName}`
    });
    return created;
  };

  const handleRecordPanchakarmaSession = async (courseId: string, session: PanchakarmaDailySession) => {
    const updated = await hospitalApi.recordPanchakarmaSession(courseId, session);
    setNotification({
      kind: 'success',
      title: 'Panchakarma Observation Recorded',
      subtitle: `Day ${session.day} clinical parameters logged successfully`
    });
    return updated;
  };

  // Staff Directorate Handlers
  const handleAddStaff = async (data: Partial<StaffMember>) => {
    try {
      const created = await hospitalApi.createStaff(data);
      setNotification({
        kind: 'success',
        title: 'Staff Member Onboarded',
        subtitle: `${created.name} registered as ${created.role} (${created.department})`
      });
      await refreshData();
      return created;
    } catch (err: any) {
      setNotification({
        kind: 'error',
        title: 'Staff Onboarding Failed',
        subtitle: err.message || 'Unable to onboard staff member.'
      });
      throw err;
    }
  };

  const handleUpdateStaffStatus = async (id: string, status: StaffMember['status']) => {
    await hospitalApi.updateStaff(id, { status });
    await refreshData();
  };

  const handleSignOut = useCallback(() => {
    hospitalApi.logout();
    setIsAuthenticated(false);
    setCurrentUser(null);
    intendedRouteRef.current = null;
    setActiveView('login');
    syncUrlForView('login');
    setNotification({
      kind: 'info',
      title: 'Signed Out Successfully',
      subtitle: 'Your clinical session has been terminated securely. Please authenticate to continue.'
    });
  }, []);

  const handleLoginSuccess = useCallback((user?: AppUser) => {
    try {
      localStorage.setItem('sahachara.auth.session', 'true');
    } catch (err) {
      console.error(err);
    }
    const targetUser = user || hospitalApi.getCurrentUser();
    hospitalApi.setCurrentUser(targetUser.id);
    setCurrentUser(targetUser);
    setIsAuthenticated(true);
    setUsers(hospitalApi.getUsers());

    const target = intendedRouteRef.current;
    const nextView = target && target !== 'login' && target !== 'activate' ? target : 'overview';
    setActiveView(nextView);
    syncUrlForView(nextView);
    intendedRouteRef.current = null;

    setNotification({
      kind: 'success',
      title: 'Authentication Successful',
      subtitle: `Welcome back, ${targetUser.name} (${targetUser.role}).`
    });
  }, []);

  const handleReturnToDashboard = useCallback(() => {
    if (isAuthenticated && currentUser) {
      setActiveView('overview');
      syncUrlForView('overview');
    } else {
      setActiveView('login');
      syncUrlForView('login');
    }
  }, [isAuthenticated, currentUser]);

  // Loading & Session Authentication Initialization Guard (Prevents UI Flashing)
  if (isAuthInitializing) {
    return (
      <div
        data-carbon-theme={theme}
        className={`min-h-screen ${
          theme === 'g100' ? 'bg-[#161616] text-[#f4f4f4]' : 'bg-[#f4f4f4] text-[#161616]'
        } flex flex-col items-center justify-center p-6 select-none`}
      >
        <div className="flex flex-col items-center max-w-sm w-full text-center">
          <div className="relative w-12 h-12 mb-4">
            <div className="absolute inset-0 rounded-full border-4 border-[#0f62fe]/20" />
            <div className="absolute inset-0 rounded-full border-4 border-[#0f62fe] border-t-transparent animate-spin" />
          </div>
          <div className="font-semibold text-base mb-1 tracking-tight">Sahachara Ops</div>
          <div className="text-xs text-[#525252] dark:text-[#8d8d8d]">Verifying clinical session security...</div>
        </div>
      </div>
    );
  }

  // Centralized Route Protection Guard:
  // Strictly blocks dashboard and all 14 operational modules for unauthenticated visitors
  if (!isAuthenticated || !currentUser || activeView === 'login' || activeView === 'activate') {
    return (
      <AuthScreenView
        initialMode={activeView === 'activate' ? 'activate' : 'login'}
        onLoginSuccess={handleLoginSuccess}
        onReturnToDashboard={handleReturnToDashboard}
        users={users}
        currentUser={currentUser || undefined}
      />
    );
  }

  return (
    <div
      data-carbon-theme={theme}
      className={`min-h-screen ${
        theme === 'g100' ? 'bg-[#161616] text-[#f4f4f4] carbon-theme-g100' : 'bg-[#f4f4f4] text-[#161616] carbon-theme-g10'
      } flex flex-col font-sans w-full max-w-full overflow-x-hidden`}
    >
      {/* IBM Carbon Shell Header (48px) */}
      <CarbonHeader
        activeView={activeView}
        onNavigate={handleNavigate}
        isSideNavOpen={isSideNavOpen}
        onToggleSideNav={() => setIsSideNavOpen((prev) => !prev)}
        currentUser={currentUser}
        users={users}
        onSwitchUser={handleSwitchUser}
        onOpenSearch={() => setIsSearchModalOpen(true)}
        theme={theme}
        onToggleTheme={handleToggleTheme}
        onSignOut={handleSignOut}
        onRegisterPatient={() => setIsNewPatientModalOpen(true)}
        onBookAppointment={() => {
          setContextPatient(null);
          setIsNewAppointmentModalOpen(true);
        }}
      />

      {/* Main Shell Container: SideNav + Content Viewport */}
      <div className="flex-1 flex w-full max-w-full overflow-x-hidden min-w-0 pt-12">
        {/* Carbon SideNav */}
        <CarbonSideNav
          activeView={activeView}
          onNavigate={handleNavigate}
          isOpen={isSideNavOpen}
          onToggle={() => setIsSideNavOpen((prev) => !prev)}
          currentUser={currentUser}
          onSignOut={handleSignOut}
        />

        {/* Viewport Content Area with padding-left for fixed SideNav */}
        <div
          className={`flex-1 min-w-0 transition-all duration-200 w-full overflow-x-hidden ${
            isSideNavOpen ? 'lg:pl-64' : 'lg:pl-16'
          }`}
        >
          <main id="main-content" tabIndex={-1} className="p-4 sm:p-6 max-w-[1600px] mx-auto w-full min-w-0">
          {/* Global Notification Banner */}
          {notification && (
            <div className="mb-6">
              <CarbonNotification
                kind={notification.kind}
                title={notification.title}
                subtitle={notification.subtitle}
                onClose={() => setNotification(null)}
              />
            </div>
          )}

          {/* Dynamic Module View Routing */}
          {activeView === 'overview' && (
            <OverviewDashboard
              metrics={metrics}
              appointments={appointments}
              consultations={consultations}
              panchakarma={panchakarma}
              prescriptions={prescriptions}
              currentUser={currentUser}
              onNavigate={handleNavigate}
              onOpenNewAppointmentModal={() => {
                setContextPatient(null);
                setIsNewAppointmentModalOpen(true);
              }}
              onOpenNewPrescription={() => {
                setContextPatient(null);
                setIsPrescriptionModalOpen(true);
              }}
              onOpenAddPharmacyStock={() => setIsAddPharmacyStockModalOpen(true)}
              onOpenGenerateBill={() => {
                setContextPatient(null);
                setIsBillingModalOpen(true);
              }}
              onNotify={(title, subtitle, kind) =>
                setNotification({ title, subtitle, kind: kind || 'info' })
              }
              onRefresh={refreshData}
            />
          )}

          {activeView === 'patients' && (
            <PatientsDirectoryView
              patients={patients}
              currentUserRole={currentUser.role}
              currentUserName={currentUser.name}
              onOpenNewPatientModal={() => setIsNewPatientModalOpen(true)}
              onOpenEditPatientModal={(p) => setEditingPatient(p)}
              onOpenDeletePatientModal={(p) => setDeletingPatient(p)}
              onOpenPrescriptionModal={(p) => {
                setContextPatient(p);
                setIsPrescriptionModalOpen(true);
              }}
              onOpenLabModal={(p) => {
                setContextPatient(p);
                setIsLabModalOpen(true);
              }}
              onOpenBillingModal={(p) => {
                setContextPatient(p);
                setIsBillingModalOpen(true);
              }}
              onOpenScheduleModal={(p) => {
                setContextPatient(p);
                setIsNewAppointmentModalOpen(true);
              }}
              onOpenAdmitPatient={(p) => {
                setContextPatient(p);
                setIsNewPatientModalOpen(true);
              }}
              treatmentPlans={treatments}
              panchakarmaCourses={panchakarma}
              prescriptions={prescriptions}
              labOrders={labOrders}
              consultations={consultations}
              onUpdateDoshaProfile={handleUpdatePatientDoshaProfile}
              onNotify={(title, subtitle, kind) =>
                setNotification({ title, subtitle, kind: kind || 'info' })
              }
            />
          )}

          {activeView === 'appointments' && (
            <AppointmentsScheduleView
              appointments={appointments}
              doctors={doctors}
              patients={patients}
              currentUserRole={currentUser.role}
              onOpenNewAppointmentModal={() => setIsNewAppointmentModalOpen(true)}
              onOpenRescheduleModal={(apt) => setReschedulingAppointment(apt)}
              onOpenCancelModal={(apt) => setCancellingAppointment(apt)}
            />
          )}

          {activeView === 'rbac' && (
            <RbacManagementView
              users={users}
              currentActiveUser={currentUser}
              onSwitchUser={handleSwitchUser}
              onUpdateUserRole={handleUpdateUserRole}
            />
          )}

          {activeView === 'doctors' && (
            <DoctorsStaffView
              doctors={doctors}
              staff={staff}
              currentUserRole={currentUser.role}
              onAddStaff={handleAddStaff}
              onUpdateStaffStatus={handleUpdateStaffStatus}
              onNotify={(title, subtitle, kind) =>
                setNotification({ title, subtitle, kind: kind || 'info' })
              }
            />
          )}

          {activeView === 'pharmacy' && (
            <PharmacyView
              prescriptions={prescriptions}
              medicationStock={medicationStock}
              stockMovements={stockMovements}
              onOpenPrescriptionModal={() => setIsPrescriptionModalOpen(true)}
              onDispensePrescription={handleDispensePrescription}
              onReorderStock={handleReorderStock}
              onOpenAddStockModal={() => setIsAddPharmacyStockModalOpen(true)}
              onAdjustStock={handleAdjustStock}
              currentUserRole={currentUser.role}
              currentUserName={currentUser.name}
              onNotify={(title, subtitle, kind) =>
                setNotification({ title, subtitle, kind: kind || 'info' })
              }
            />
          )}

          {activeView === 'laboratory' && (
            <LaboratoryView
              labOrders={labOrders}
              onOpenLabModal={() => setIsLabModalOpen(true)}
              onUpdateLabResult={handleUpdateLabResult}
              currentUserRole={currentUser.role}
              currentUserName={currentUser.name}
              onNotify={(title, subtitle, kind) =>
                setNotification({ title, subtitle, kind: kind || 'info' })
              }
            />
          )}

          {activeView === 'billing' && (
            <BillingInsuranceView
              invoices={invoices}
              patients={patients}
              currentUser={currentUser}
              onOpenBillingModal={(p) => {
                if (p) setContextPatient(p);
                setIsBillingModalOpen(true);
              }}
              onUpdateInvoiceStatus={handleUpdateInvoiceStatus}
              onNotify={(title, subtitle, kind) =>
                setNotification({ title, subtitle, kind: kind || 'info' })
              }
            />
          )}

          {activeView === 'consultations' && (
            <ConsultationsWorkspaceView
              consultations={consultations}
              patients={patients}
              doctors={doctors}
              currentUser={currentUser}
              onSaveConsultation={handleSaveConsultation}
              onNavigateToTreatments={() => handleNavigate('treatments')}
              onNavigateToPharmacy={() => handleNavigate('pharmacy')}
            />
          )}

          {activeView === 'treatments' && (
            <TreatmentsManagementView
              treatments={treatments}
              patients={patients}
              doctors={doctors}
              currentUser={currentUser}
              onCreateTreatment={handleCreateTreatment}
              onUpdateTreatment={handleUpdateTreatment}
            />
          )}

          {activeView === 'panchakarma' && (
            <PanchakarmaManagementView
              courses={panchakarma}
              patients={patients}
              doctors={doctors}
              currentUser={currentUser}
              onCreateCourse={handleCreateCourse}
              onRecordSession={handleRecordPanchakarmaSession}
            />
          )}

          {activeView === 'reports' && (
            <ReportsAnalyticsView
              patients={patients}
              appointments={appointments}
              consultations={consultations}
              treatments={treatments}
              panchakarma={panchakarma}
              medicines={medicationStock}
              invoices={invoices}
              currentUser={currentUser}
              staff={staff}
            />
          )}

          {(activeView === 'settings' || activeView === 'audit') && (
            <SettingsWorkspaceView
              currentUser={currentUser}
              staff={staff}
              auditLogs={auditLogs}
              onAddStaff={handleAddStaff}
              onUpdateStaffStatus={handleUpdateStaffStatus}
              initialTab={activeView === 'audit' ? 'audit-logs' : 'overview'}
              currentTheme={theme}
              onSetTheme={(t) => handleToggleTheme(t)}
              onNotify={(title, subtitle, kind) =>
                setNotification({ title, subtitle, kind: kind || 'info' })
              }
              onSignOut={handleSignOut}
            />
          )}
        </main>
      </div>
    </div>

      {/* Patient Management Modals */}
      <NewPatientModal
        isOpen={isNewPatientModalOpen}
        onClose={() => setIsNewPatientModalOpen(false)}
        onSubmit={handleCreatePatient}
        currentUserRole={currentUser.role}
      />

      <EditPatientModal
        isOpen={Boolean(editingPatient)}
        onClose={() => setEditingPatient(null)}
        patient={editingPatient}
        currentUserRole={currentUser.role}
        onSave={handleSavePatientEdits}
      />

      <DeletePatientModal
        isOpen={Boolean(deletingPatient)}
        onClose={() => setDeletingPatient(null)}
        patient={deletingPatient}
        currentUserRole={currentUser.role}
        onConfirmDelete={handleDeletePatient}
      />

      {/* Appointment Scheduling Modals */}
      <NewAppointmentModal
        isOpen={isNewAppointmentModalOpen}
        onClose={() => {
          setIsNewAppointmentModalOpen(false);
          setContextPatient(null);
        }}
        patients={contextPatient ? [contextPatient, ...patients.filter((p) => p.id !== contextPatient.id)] : patients}
        doctors={doctors}
        selectedPatient={contextPatient}
        onSchedule={handleScheduleAppointment}
      />

      <RescheduleAppointmentModal
        isOpen={Boolean(reschedulingAppointment)}
        onClose={() => setReschedulingAppointment(null)}
        appointment={reschedulingAppointment}
        onReschedule={handleRescheduleAppointment}
      />

      <CancelAppointmentModal
        isOpen={Boolean(cancellingAppointment)}
        onClose={() => setCancellingAppointment(null)}
        appointment={cancellingAppointment}
        onCancelAppointment={handleCancelAppointment}
      />

      {/* Clinical Modals */}
      <PrescriptionModal
        isOpen={isPrescriptionModalOpen}
        onClose={() => {
          setIsPrescriptionModalOpen(false);
          setContextPatient(null);
        }}
        patients={contextPatient ? [contextPatient, ...patients.filter((p) => p.id !== contextPatient.id)] : patients}
        onSubmit={handleCreatePrescription}
      />

      <LabOrderModal
        isOpen={isLabModalOpen}
        onClose={() => {
          setIsLabModalOpen(false);
          setContextPatient(null);
        }}
        patients={contextPatient ? [contextPatient, ...patients.filter((p) => p.id !== contextPatient.id)] : patients}
        onSubmit={handleCreateLabOrder}
      />

      <GenerateBillModal
        isOpen={isBillingModalOpen}
        onClose={() => {
          setIsBillingModalOpen(false);
          setContextPatient(null);
        }}
        patients={contextPatient ? [contextPatient, ...patients.filter((p) => p.id !== contextPatient.id)] : patients}
        onSubmit={handleCreateInvoice}
      />

      {/* Pharmacy Stock Addition Modal */}
      <NewPharmacyStockModal
        isOpen={isAddPharmacyStockModalOpen}
        onClose={() => setIsAddPharmacyStockModalOpen(false)}
        onSubmit={handleAddPharmacyStock}
      />

      {/* Global Command Search Palette */}
      <CarbonSearchModal
        isOpen={isSearchModalOpen}
        onClose={() => setIsSearchModalOpen(false)}
        onNavigate={(viewId) => {
          setActiveView(viewId);
          setIsSearchModalOpen(false);
        }}
      />
    </div>
  );
}
