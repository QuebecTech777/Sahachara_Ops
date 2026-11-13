import React, { useState, useEffect, useCallback } from 'react';
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

export default function App() {
  // Navigation State
  const [activeView, setActiveView] = useState<string>('overview');
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

  // Session Authentication State
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem('sahachara.auth.session');
      if (stored === 'false') return false;
      return true;
    } catch {
      return true;
    }
  });

  // Active RBAC User Session
  const [currentUser, setCurrentUser] = useState<AppUser>(hospitalApi.getCurrentUser());
  const [users, setUsers] = useState<AppUser[]>(hospitalApi.getUsers());

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

  // Refresh all state
  const refreshData = useCallback(async () => {
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
  }, []);

  useEffect(() => {
    refreshData();
    const unsubscribe = hospitalApi.subscribe(() => {
      refreshData();
    });
    return unsubscribe;
  }, [refreshData]);


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
    const created = await hospitalApi.createStaff(data);
    setNotification({
      kind: 'success',
      title: 'Staff Member Onboarded',
      subtitle: `${created.name} registered as ${created.role} (${created.department})`
    });
    await refreshData();
    return created;
  };

  const handleUpdateStaffStatus = async (id: string, status: StaffMember['status']) => {
    await hospitalApi.updateStaff(id, { status });
    await refreshData();
  };

  const handleSignOut = useCallback(() => {
    try {
      localStorage.setItem('sahachara.auth.session', 'false');
    } catch (err) {
      console.error(err);
    }
    setIsAuthenticated(false);
    setActiveView('login');
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
    if (user) {
      hospitalApi.setCurrentUser(user.id);
      setCurrentUser(user);
    }
    setIsAuthenticated(true);
    setActiveView('overview');
    setNotification({
      kind: 'success',
      title: 'Authentication Successful',
      subtitle: `Welcome back, ${user ? user.name : currentUser.name} (${user ? user.role : currentUser.role}).`
    });
  }, [currentUser]);

  if (!isAuthenticated || activeView === 'login' || activeView === 'activate') {
    return (
      <AuthScreenView
        initialMode={activeView === 'activate' ? 'activate' : 'login'}
        onLoginSuccess={handleLoginSuccess}
        onReturnToDashboard={() => handleLoginSuccess(currentUser)}
        users={users}
        currentUser={currentUser}
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
        onNavigate={setActiveView}
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
          onNavigate={setActiveView}
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
              onNavigate={setActiveView}
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
              onNavigateToTreatments={() => setActiveView('treatments')}
              onNavigateToPharmacy={() => setActiveView('pharmacy')}
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
