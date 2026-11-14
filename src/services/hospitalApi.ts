import {
  Patient,
  TriageRecord,
  Doctor,
  Appointment,
  AppointmentReminder,
  Prescription,
  MedicationStock,
  LabOrder,
  BillInvoice,
  Payment,
  PaymentAllocation,
  RefundRequest,
  RefundLedgerEntry,
  PatientAccountSummary,
  BillableItem,
  DailyCollectionReport,
  OutstandingReceivablesReport,
  ClinicalAuditLog,
  HospitalOverviewMetrics,
  AppUser,
  UserRole,
  ROLE_PERMISSIONS,
  Consultation,
  TreatmentPlan,
  PanchakarmaCourse,
  StockMovement,
  PharmacySupplier,
  StaffMember,
  PractitionerCredentials,
  DoshaProfile,
  HospitalTariff,
  PatientDossier,
  DuplicatePatientMatch,
  PatientStatus,
  QueueItem,
  ReceptionDashboardMetrics,
  QueuePriority,
  BookingSource,
  AppointmentStatus,
  ClinicalEncounter,
  DoctorDashboardMetrics,
  VaidyaDashboardMetrics,
  ClinicalVitals,
  ClinicalAssessment,
  ClinicalDiagnosis,
  PrakritiAssessment,
  VikritiAssessment,
  DoshaEvaluation,
  PanchakarmaReferral,
  PatientClinicalHistory,
  HospitalProfile,
  Department,
  DepartmentDiscipline,
  StaffDepartmentAssignment,
  AssignmentStatus,
  TherapyRoom,
  RoomOperationalStatus,
  TherapyRoomType,
  TherapySession,
  SessionExecutionStatus,
  PreProcedureAssessment,
  PostProcedureAssessment,
  PanchakarmaPhaseTransition,
  StaffTherapyAuthorization
} from '../types/hospital';
import {
  INITIAL_PATIENTS,
  INITIAL_TRIAGE,
  INITIAL_DOCTORS,
  INITIAL_APPOINTMENTS,
  INITIAL_REMINDERS,
  INITIAL_PRESCRIPTIONS,
  INITIAL_MEDICATION_STOCK,
  INITIAL_LAB_ORDERS,
  INITIAL_INVOICES,
  INITIAL_AUDIT_LOGS,
  INITIAL_USERS,
  INITIAL_METRICS,
  INITIAL_CONSULTATIONS,
  INITIAL_TREATMENT_PLANS,
  INITIAL_PANCHAKARMA_COURSES,
  INITIAL_STOCK_MOVEMENTS,
  INITIAL_SUPPLIERS,
  INITIAL_STAFF,
  INITIAL_TARIFFS
} from '../data/seedData';

type Listener = () => void;
const listeners: Set<Listener> = new Set();

function notifyListeners() {
  listeners.forEach((fn) => fn());
}

// Live in-memory data cache directly synced with backend database & Prisma (zero localStorage)
const inMemoryStore: Record<string, any> = {};

function loadOr<T>(key: string, fallback: T): T {
  if (inMemoryStore[key] !== undefined) {
    return inMemoryStore[key];
  }
  return fallback;
}

function save<T>(key: string, val: T): void {
  inMemoryStore[key] = val;
}

const API_BASE = typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE_URL
  ? import.meta.env.VITE_API_BASE_URL.replace(/\/$/, '')
  : '';

// Wrap native fetch to automatically route cross-origin Render requests and attach authentic Bearer tokens
const nativeFetch = typeof window !== 'undefined' && window.fetch ? window.fetch.bind(window) : globalThis.fetch.bind(globalThis);
const hospitalFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  let url = input;
  if (typeof input === 'string' && input.startsWith('/api') && API_BASE) {
    url = `${API_BASE}${input}`;
  }
  const headers = new Headers(init?.headers);
  const localAuthToken = typeof localStorage !== 'undefined' ? localStorage.getItem('sahachara_auth_token') : null;
  if (localAuthToken && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${localAuthToken}`);
  } else {
    try {
      const { supabaseGetAccessToken } = await import('./supabaseClient.ts');
      const token = await supabaseGetAccessToken();
      if (token && !headers.has('Authorization')) {
        headers.set('Authorization', `Bearer ${token}`);
      }
    } catch {}
  }
  return nativeFetch(url, { ...init, headers });
};

// Scoped fetch alias within this module
const fetch = hospitalFetch;

class HospitalApiClient {
  private localPatients: Patient[] = loadOr('patients', INITIAL_PATIENTS);
  private localTriage: TriageRecord[] = loadOr('triage', INITIAL_TRIAGE);
  private localDoctors: Doctor[] = loadOr('doctors', INITIAL_DOCTORS);
  private localAppointments: Appointment[] = loadOr('appointments', INITIAL_APPOINTMENTS);
  private localReminders: AppointmentReminder[] = loadOr('reminders', INITIAL_REMINDERS);
  private localPrescriptions: Prescription[] = loadOr('prescriptions', INITIAL_PRESCRIPTIONS);
  private localStock: MedicationStock[] = loadOr('stock', INITIAL_MEDICATION_STOCK);
  private localLabOrders: LabOrder[] = loadOr('labs', INITIAL_LAB_ORDERS);
  private localInvoices: BillInvoice[] = loadOr('invoices', INITIAL_INVOICES);
  private localAuditLogs: ClinicalAuditLog[] = loadOr('audit', INITIAL_AUDIT_LOGS);
  private localUsers: AppUser[] = loadOr('users', INITIAL_USERS);
  private localConsultations: Consultation[] = loadOr('consultations', INITIAL_CONSULTATIONS);
  private localTreatments: TreatmentPlan[] = loadOr('treatments', INITIAL_TREATMENT_PLANS);
  private localPanchakarma: PanchakarmaCourse[] = loadOr('panchakarma', INITIAL_PANCHAKARMA_COURSES);
  private localStockMovements: StockMovement[] = loadOr('stock_movements', INITIAL_STOCK_MOVEMENTS);
  private localSuppliers: PharmacySupplier[] = loadOr('suppliers', INITIAL_SUPPLIERS);
  private localStaff: StaffMember[] = loadOr('staff', INITIAL_STAFF);
  private localTariffs: HospitalTariff[] = loadOr('tariffs', INITIAL_TARIFFS);
  private currentUserId: string = loadOr('current_user_id', '');

  constructor() {
    this.init().catch(() => {});
  }

  async init(): Promise<void> {
    if (typeof localStorage !== 'undefined' && !localStorage.getItem('sahachara_auth_token')) {
      return;
    }
    try {
      const auth = this.getAuthHeaders();
      const [
        patientsRes,
        aptsRes,
        staffRes,
        rxRes,
        stockRes,
        labRes,
        billingRes,
        consultRes,
        treatRes,
        pkRes,
        usersRes,
        auditRes,
        tariffsRes
      ] = await Promise.allSettled([
        fetch('/api/patients', { headers: auth }),
        fetch('/api/appointments', { headers: auth }),
        fetch('/api/staff', { headers: auth }),
        fetch('/api/pharmacy/prescriptions', { headers: auth }),
        fetch('/api/pharmacy/stock', { headers: auth }),
        fetch('/api/laboratory', { headers: auth }),
        fetch('/api/billing', { headers: auth }),
        fetch('/api/consultations', { headers: auth }),
        fetch('/api/treatments', { headers: auth }),
        fetch('/api/panchakarma', { headers: auth }),
        fetch('/api/rbac/users', { headers: auth }),
        fetch('/api/audit', { headers: auth }),
        fetch('/api/tariffs', { headers: auth })
      ]);

      if (patientsRes.status === 'fulfilled' && patientsRes.value.ok) {
        const d = await patientsRes.value.json();
        if (d.success && Array.isArray(d.data)) {
          this.localPatients = d.data;
          save('patients', this.localPatients);
        }
      }
      if (aptsRes.status === 'fulfilled' && aptsRes.value.ok) {
        const d = await aptsRes.value.json();
        if (d.success && Array.isArray(d.data)) {
          this.localAppointments = d.data;
          save('appointments', this.localAppointments);
        }
      }
      if (staffRes.status === 'fulfilled' && staffRes.value.ok) {
        const d = await staffRes.value.json();
        if (d.success && Array.isArray(d.data)) {
          this.localStaff = d.data;
          save('staff', this.localStaff);
        }
      }
      if (rxRes.status === 'fulfilled' && rxRes.value.ok) {
        const d = await rxRes.value.json();
        if (d.success && Array.isArray(d.data)) {
          this.localPrescriptions = d.data;
          save('prescriptions', this.localPrescriptions);
        }
      }
      if (stockRes.status === 'fulfilled' && stockRes.value.ok) {
        const d = await stockRes.value.json();
        if (d.success && Array.isArray(d.data)) {
          this.localStock = d.data;
          save('stock', this.localStock);
        }
      }
      if (labRes.status === 'fulfilled' && labRes.value.ok) {
        const d = await labRes.value.json();
        if (d.success && Array.isArray(d.data)) {
          this.localLabOrders = d.data;
          save('labs', this.localLabOrders);
        }
      }
      if (billingRes.status === 'fulfilled' && billingRes.value.ok) {
        const d = await billingRes.value.json();
        if (d.success && Array.isArray(d.data)) {
          this.localInvoices = d.data;
          save('invoices', this.localInvoices);
        }
      }
      if (consultRes.status === 'fulfilled' && consultRes.value.ok) {
        const d = await consultRes.value.json();
        if (d.success && Array.isArray(d.data)) {
          this.localConsultations = d.data;
          save('consultations', this.localConsultations);
        }
      }
      if (treatRes.status === 'fulfilled' && treatRes.value.ok) {
        const d = await treatRes.value.json();
        if (d.success && Array.isArray(d.data)) {
          this.localTreatments = d.data;
          save('treatments', this.localTreatments);
        }
      }
      if (pkRes.status === 'fulfilled' && pkRes.value.ok) {
        const d = await pkRes.value.json();
        if (d.success && Array.isArray(d.data)) {
          this.localPanchakarma = d.data;
          save('panchakarma', this.localPanchakarma);
        }
      }
      if (usersRes.status === 'fulfilled' && usersRes.value.ok) {
        const d = await usersRes.value.json();
        if (d.success && Array.isArray(d.data)) {
          this.localUsers = d.data;
          save('users', this.localUsers);
        }
      }
      if (auditRes.status === 'fulfilled' && auditRes.value.ok) {
        const d = await auditRes.value.json();
        if (d.success && Array.isArray(d.data)) {
          this.localAuditLogs = d.data;
          save('audit', this.localAuditLogs);
        }
      }
      if (tariffsRes.status === 'fulfilled' && tariffsRes.value.ok) {
        const d = await tariffsRes.value.json();
        if (d.success && Array.isArray(d.data)) {
          this.localTariffs = d.data;
          save('tariffs', this.localTariffs);
        }
      }
      notifyListeners();
    } catch {
      // Continue with in-memory state
    }
  }

  async login(email: string, password?: string): Promise<{ success: boolean; user?: AppUser; error?: string }> {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();
      if (data.success && data.user) {
        if (data.token && typeof localStorage !== 'undefined') {
          localStorage.setItem('sahachara_auth_token', data.token);
          localStorage.setItem('sahachara.auth.session', 'true');
        }
        const idx = this.localUsers.findIndex((u) => u.email.toLowerCase() === data.user.email.toLowerCase());
        if (idx >= 0) {
          this.localUsers[idx] = data.user;
        } else {
          this.localUsers.push(data.user);
        }
        this.currentUserId = data.user.id;
        save('current_user_id', data.user.id);
        save('users', this.localUsers);
        notifyListeners();
        return { success: true, user: data.user };
      }
      return { success: false, error: data.error || data.message || 'Login failed' };
    } catch (err: any) {
      return { success: false, error: err.message || 'Connection error' };
    }
  }

  async activateAccount(email: string, pin: string, newPassword: string): Promise<{ success: boolean; user?: AppUser; error?: string; message?: string }> {
    try {
      const res = await fetch('/api/auth/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, pin, newPassword })
      });
      const data = await res.json();
      if (data.success && data.user) {
        if (data.token && typeof localStorage !== 'undefined') {
          localStorage.setItem('sahachara_auth_token', data.token);
          localStorage.setItem('sahachara.auth.session', 'true');
        }
        const idx = this.localUsers.findIndex((u) => u.email.toLowerCase() === data.user.email.toLowerCase());
        if (idx >= 0) {
          this.localUsers[idx] = data.user;
        } else {
          this.localUsers.push(data.user);
        }
        // Also update staff status to on_duty
        const staffIdx = this.localStaff.findIndex((s) => s.email.toLowerCase() === data.user.email.toLowerCase());
        if (staffIdx >= 0) {
          this.localStaff[staffIdx].status = 'on_duty';
          this.localStaff[staffIdx].activationPin = undefined;
          save('staff', this.localStaff);
        }
        this.currentUserId = data.user.id;
        save('current_user_id', data.user.id);
        save('users', this.localUsers);
        notifyListeners();
        return { success: true, user: data.user, message: data.message };
      }
      return { success: false, error: data.error || data.message || 'Activation failed' };
    } catch (err: any) {
      return { success: false, error: err.message || 'Connection error' };
    }
  }

  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  // Session Verification & Lifecycle
  async verifySession(tokenOverride?: string): Promise<{ success: boolean; user?: AppUser; error?: string }> {
    try {
      const token = tokenOverride || (typeof localStorage !== 'undefined' ? localStorage.getItem('sahachara_auth_token') : null);
      if (!token) {
        return { success: false, error: 'No active session token' };
      }
      const res = await fetch('/api/auth/verify', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });
      if (!res.ok) {
        const errorJson = await res.json().catch(() => ({}));
        return { success: false, error: errorJson.message || `Session verification failed (HTTP ${res.status})` };
      }
      const data = await res.json();
      if (data.success && data.user) {
        this.currentUserId = data.user.id;
        if (typeof localStorage !== 'undefined') {
          save('current_user_id', data.user.id);
          localStorage.setItem('sahachara.auth.session', 'true');
          const idx = this.localUsers.findIndex((u) => u.id === data.user.id || u.email.toLowerCase() === data.user.email.toLowerCase());
          if (idx >= 0) {
            this.localUsers[idx] = data.user;
          } else {
            this.localUsers.push(data.user);
          }
          save('users', this.localUsers);
        }
        notifyListeners();
        return { success: true, user: data.user };
      }
      return { success: false, error: data.error || data.message || 'Session verification failed' };
    } catch (err: any) {
      return { success: false, error: err.message || 'Network error during session verification' };
    }
  }

  logout(): void {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('sahachara_auth_token');
      localStorage.setItem('sahachara.auth.session', 'false');
      localStorage.removeItem('current_user_id');
    }
    this.currentUserId = '';
    notifyListeners();
  }

  // Current User & RBAC Management
  getCurrentUser(): AppUser {
    const found = this.localUsers.find((u) => u.id === this.currentUserId);
    return found || this.localUsers[0];
  }

  getAuthHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };
    if (typeof localStorage !== 'undefined') {
      const token = localStorage.getItem('sahachara_auth_token');
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
    }
    return headers;
  }

  setCurrentUser(userId: string): void {
    this.currentUserId = userId;
    save('current_user_id', userId);
    notifyListeners();
  }

  getUsers(): AppUser[] {
    return this.localUsers;
  }

  async updateUserRole(userId: string, newRole: UserRole): Promise<void> {
    try {
      await fetch(`/api/rbac/users/${userId}/role`, {
        method: 'PATCH',
        headers: this.getAuthHeaders(),
        body: JSON.stringify({ role: newRole })
      });
    } catch (err) {
      console.warn('Backend update role failed, updated local cache', err);
    }
    const user = this.localUsers.find((u) => u.id === userId);
    if (user) {
      const old = user.role;
      user.role = newRole;
      save('users', this.localUsers);
      this.addAuditLog('System Administrator', 'SUPER_ADMIN', 'Updated RBAC User Role', 'RBAC Change', `Changed role of ${user.name} from ${old} to ${newRole}`);
      notifyListeners();
    }
  }

  // Rate Master & Tariffs
  getTariffs(): HospitalTariff[] {
    return this.localTariffs;
  }

  async fetchTariffs(includeInactive: boolean = true): Promise<HospitalTariff[]> {
    try {
      const url = includeInactive ? '/api/tariffs?includeInactive=true' : '/api/tariffs';
      const res = await fetch(url, { headers: this.getAuthHeaders() });
      if (res.ok) {
        const json = await res.json();
        if (json.success && Array.isArray(json.data)) {
          this.localTariffs = json.data;
          save('tariffs', this.localTariffs);
          notifyListeners();
          return json.data;
        }
      }
    } catch {}
    return this.localTariffs;
  }

  async getTariffById(id: string): Promise<HospitalTariff | null> {
    try {
      const res = await fetch(`/api/tariffs/${id}`, { headers: this.getAuthHeaders() });
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) {
          return json.data;
        }
      }
    } catch {}
    return this.localTariffs.find((t) => t.id === id || t.serviceCode === id) || null;
  }

  async createService(data: Partial<HospitalTariff>): Promise<HospitalTariff> {
    const res = await fetch('/api/tariffs', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.getAuthHeaders()
      },
      body: JSON.stringify(data)
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json.error || json.message || 'Failed to create service');
    }
    await this.fetchTariffs(true);
    return json.data;
  }

  async updateService(id: string, data: Partial<HospitalTariff>): Promise<HospitalTariff> {
    const res = await fetch(`/api/tariffs/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...this.getAuthHeaders()
      },
      body: JSON.stringify(data)
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json.error || json.message || 'Failed to update service');
    }
    await this.fetchTariffs(true);
    return json.data;
  }

  async configureTariffRate(id: string, payload: {
    rate: number | null;
    isZeroPricePermitted?: boolean;
    effectiveFrom?: string;
    effectiveUntil?: string;
    note?: string;
  }): Promise<HospitalTariff> {
    const res = await fetch(`/api/tariffs/${id}/rate`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...this.getAuthHeaders()
      },
      body: JSON.stringify(payload)
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json.error || json.message || 'Failed to configure tariff rate');
    }
    await this.fetchTariffs(true);
    return json.data;
  }

  async toggleTariffStatus(id: string, isActive: boolean): Promise<HospitalTariff> {
    const res = await fetch(`/api/tariffs/${id}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...this.getAuthHeaders()
      },
      body: JSON.stringify({ isActive })
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json.error || json.message || 'Failed to toggle tariff status');
    }
    await this.fetchTariffs(true);
    return json.data;
  }

  async updateTariffRate(id: string, rate: number | null, isZeroPricePermitted?: boolean): Promise<HospitalTariff> {
    return this.configureTariffRate(id, { rate, isZeroPricePermitted });
  }

  // 1. Overview Metrics
  async getOverviewMetrics(): Promise<HospitalOverviewMetrics> {
    try {
      const res = await fetch('/api/overview', { headers: this.getAuthHeaders() });
      if (res.ok) {
        const json = await res.json();
        if (json.success) return json.data;
      }
    } catch {
      // fallback
    }
    const activePatients = this.localPatients.filter((p) => !p.deletedAt);
    const criticalLabs = this.localLabOrders.filter((l) => l.isAbnormal).length;
    const pendingRx = this.localPrescriptions.filter((p) => p.status === 'pending').length;
    const doctorsOnDuty = this.localDoctors.filter((d) => d.status === 'on_duty').length;
    const scheduledApts = this.localAppointments.filter((a) => a.status === 'scheduled').length;
    const activeTreatmentsCount = this.localTreatments.filter((t) => t.status === 'active').length;
    const activePkCount = this.localPanchakarma.filter((pk) => pk.status === 'Active').length;
    const revenueInr = this.localInvoices.reduce((acc, inv) => acc + (inv.paymentStatus === 'paid' ? inv.totalAmount : inv.copayPatient), 0);

    return {
      totalPatientsToday: activePatients.length,
      erWaitTimeMinutes: 0,
      occupiedBeds: 0,
      totalBeds: 0,
      occupancyRate: 0,
      activeDoctorsOnDuty: doctorsOnDuty,
      criticalLabAlerts: criticalLabs,
      pendingPrescriptions: pendingRx,
      admittedToday: 0,
      dischargedToday: 0,
      scheduledAppointmentsToday: scheduledApts,
      activeTreatments: activeTreatmentsCount,
      activePanchakarmaCourses: activePkCount,
      todayRevenueInr: revenueInr
    };
  }

  // 2. Patients EMR
  async getPatients(): Promise<Patient[]> {
    try {
      const res = await fetch('/api/patients', {
        headers: this.getAuthHeaders()
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success && Array.isArray(json.data)) {
          return json.data;
        }
      }
    } catch {
      // fallback
    }

    return this.localPatients.filter((p) => !p.deletedAt);
  }

  async searchPatients(options: {
    search?: string;
    status?: string;
    admissionStatus?: string;
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }): Promise<{ patients: Patient[]; total: number; page: number; limit: number; totalPages: number }> {
    const params = new URLSearchParams();
    if (options.search) params.set('search', options.search);
    if (options.status) params.set('status', options.status);
    if (options.admissionStatus) params.set('admissionStatus', options.admissionStatus);
    if (options.page) params.set('page', String(options.page));
    if (options.limit) params.set('limit', String(options.limit));
    if (options.sortBy) params.set('sortBy', options.sortBy);
    if (options.sortOrder) params.set('sortOrder', options.sortOrder);

    try {
      const res = await fetch(`/api/patients?${params.toString()}`, {
        headers: this.getAuthHeaders()
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          return {
            patients: json.data || [],
            total: json.total || (json.data ? json.data.length : 0),
            page: json.page || 1,
            limit: json.limit || 50,
            totalPages: json.totalPages || 1
          };
        }
      }
    } catch (err) {
      console.warn('[searchPatients] Fetch failed, falling back:', err);
    }

    // Local fallback
    let list = this.localPatients.filter((p) => !p.deletedAt);
    if (options.search) {
      const q = options.search.toLowerCase();
      list = list.filter(p =>
        p.mrn.toLowerCase().includes(q) ||
        p.firstName.toLowerCase().includes(q) ||
        p.lastName.toLowerCase().includes(q) ||
        p.phone.includes(q)
      );
    }
    if (options.status && options.status !== 'all') {
      list = list.filter(p => p.status === options.status);
    }
    if (options.admissionStatus && options.admissionStatus !== 'all') {
      list = list.filter(p => p.admissionStatus === options.admissionStatus);
    }
    return {
      patients: list,
      total: list.length,
      page: 1,
      limit: list.length,
      totalPages: 1
    };
  }

  async checkDuplicatePatients(params: {
    phone?: string;
    firstName?: string;
    lastName?: string;
    dob?: string;
    email?: string;
    mrn?: string;
  }): Promise<{ hasDuplicates: boolean; matches: DuplicatePatientMatch[] }> {
    try {
      const res = await fetch('/api/patients/check-duplicates', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...this.getAuthHeaders()
        },
        body: JSON.stringify(params)
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          return {
            hasDuplicates: json.hasDuplicates,
            matches: json.matches || []
          };
        }
      }
    } catch (err) {
      console.warn('[checkDuplicatePatients] Error:', err);
    }
    return { hasDuplicates: false, matches: [] };
  }

  async getPatientById(idOrMrn: string): Promise<Patient | null> {
    try {
      const res = await fetch(`/api/patients/${encodeURIComponent(idOrMrn)}`, {
        headers: this.getAuthHeaders()
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success) return json.data;
      }
    } catch {
      // fallback
    }
    const found = this.localPatients.find(p => (p.id === idOrMrn || p.mrn === idOrMrn) && !p.deletedAt);
    return found || null;
  }

  async getPatientDossier(idOrMrn: string): Promise<PatientDossier | null> {
    try {
      const res = await fetch(`/api/patients/${encodeURIComponent(idOrMrn)}/dossier`, {
        headers: this.getAuthHeaders()
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success) return json.data;
      }
    } catch (err) {
      console.warn('[getPatientDossier] Error:', err);
    }
    return null;
  }

  async createPatient(patientData: Partial<Patient> & { overrideDuplicate?: boolean }): Promise<Patient> {
    const currentUser = this.getCurrentUser();
    const res = await fetch('/api/patients', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.getAuthHeaders()
      },
      body: JSON.stringify(patientData)
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err: any = new Error(json.message || 'Failed to register patient');
      err.status = res.status;
      err.code = json.code;
      err.duplicates = json.duplicates;
      throw err;
    }

    if (json.success && json.data) {
      this.localPatients.unshift(json.data);
      save('patients', this.localPatients);
      notifyListeners();
      return json.data;
    }

    throw new Error('Unexpected response registering patient');
  }

  async updatePatient(id: string, updates: Partial<Patient>): Promise<Patient> {
    const currentUser = this.getCurrentUser();
    const res = await fetch(`/api/patients/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...this.getAuthHeaders()
      },
      body: JSON.stringify(updates)
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err: any = new Error(json.message || 'Failed to update patient record');
      err.status = res.status;
      err.code = json.code;
      throw err;
    }

    if (json.success && json.data) {
      const idx = this.localPatients.findIndex((p) => p.id === id || p.mrn === id);
      if (idx !== -1) this.localPatients[idx] = json.data;
      save('patients', this.localPatients);
      notifyListeners();
      return json.data;
    }

    throw new Error('Unexpected response updating patient');
  }

  async updatePatientDoshaProfile(id: string, doshaProfile: DoshaProfile): Promise<Patient> {
    const updated = await this.updatePatient(id, { doshaProfile });
    const currentUser = this.getCurrentUser();
    this.addAuditLog(
      currentUser.name,
      currentUser.role,
      'Clinical Assessment Recorded',
      'EMR Access',
      `Documented Dosha Profile assessment for ${updated.firstName} ${updated.lastName} (${updated.mrn}) - Imbalance: ${doshaProfile.vikriti.primaryImbalance}`,
      updated.mrn
    );
    return updated;
  }

  async deletePatient(id: string, reason?: string): Promise<{ success: boolean; archived: boolean; message: string }> {
    const currentUser = this.getCurrentUser();
    if (currentUser.role !== 'SUPER_ADMIN' && currentUser.role !== 'ADMIN') {
      throw new Error('Access Denied: Only users with the SUPER_ADMIN or ADMIN role are permitted to archive or purge patient records.');
    }

    const res = await fetch(`/api/patients/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        ...this.getAuthHeaders()
      },
      body: JSON.stringify({ reason })
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(json.message || 'Failed to delete/archive patient');
    }

    const idx = this.localPatients.findIndex((p) => p.id === id || p.mrn === id);
    if (idx !== -1) {
      if (json.archived) {
        this.localPatients[idx].status = 'archived';
      } else {
        this.localPatients[idx].deletedAt = new Date().toISOString();
      }
      save('patients', this.localPatients);
      notifyListeners();
    }

    return {
      success: true,
      archived: !!json.archived,
      message: json.message || 'Patient record processed successfully'
    };
  }

  // 3. Appointments & Reception Management
  async getAppointments(params?: {
    date?: string;
    status?: string;
    practitionerId?: string;
    discipline?: string;
    search?: string;
  }): Promise<Appointment[]> {
    try {
      const queryParams = new URLSearchParams();
      if (params?.date) queryParams.set('date', params.date);
      if (params?.status && params.status !== 'all') queryParams.set('status', params.status);
      if (params?.practitionerId && params.practitionerId !== 'all') queryParams.set('practitionerId', params.practitionerId);
      if (params?.discipline && params.discipline !== 'all') queryParams.set('discipline', params.discipline);
      if (params?.search) queryParams.set('search', params.search);

      const qs = queryParams.toString();
      const url = `/api/appointments${qs ? `?${qs}` : ''}`;
      const res = await fetch(url, {
        headers: this.getAuthHeaders()
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success && Array.isArray(json.data)) {
          this.localAppointments = json.data;
          save('appointments', this.localAppointments);
          return json.data;
        }
      }
    } catch {
      // fallback
    }

    return this.localAppointments;
  }

  async createAppointment(data: Partial<Appointment>): Promise<Appointment> {
    const currentUser = this.getCurrentUser();
    const res = await fetch('/api/appointments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.getAuthHeaders()
      },
      body: JSON.stringify(data)
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err: any = new Error(json.message || json.error || 'Failed to schedule appointment');
      err.status = res.status;
      err.code = json.code;
      err.conflict = json.conflict;
      throw err;
    }

    if (json.success && json.data) {
      this.localAppointments.unshift(json.data);
      save('appointments', this.localAppointments);
      notifyListeners();
      return json.data;
    }

    throw new Error('Unexpected response scheduling appointment');
  }

  async createWalkInAppointment(data: {
    patientId: string;
    practitionerId: string;
    reasonForVisit?: string;
    priority?: QueuePriority;
    priorityReason?: string;
    isEscalated?: boolean;
    escalationReason?: string;
    durationMinutes?: number;
  }): Promise<Appointment> {
    const res = await fetch('/api/appointments/walk-in', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.getAuthHeaders()
      },
      body: JSON.stringify(data)
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err: any = new Error(json.message || json.error || 'Failed to create walk-in appointment');
      err.status = res.status;
      err.code = json.code;
      throw err;
    }

    if (json.success && json.data) {
      this.localAppointments.unshift(json.data);
      save('appointments', this.localAppointments);
      notifyListeners();
      return json.data;
    }

    throw new Error('Unexpected response creating walk-in appointment');
  }

  async checkInAppointment(id: string, receptionNotes?: string): Promise<Appointment> {
    const res = await fetch(`/api/appointments/${encodeURIComponent(id)}/check-in`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.getAuthHeaders()
      },
      body: JSON.stringify({ receptionNotes })
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err: any = new Error(json.message || json.error || 'Failed to check in patient');
      err.status = res.status;
      err.code = json.code;
      throw err;
    }

    if (json.success && json.data) {
      const idx = this.localAppointments.findIndex((a) => a.id === id || a.appointmentNumber === id);
      if (idx !== -1) {
        this.localAppointments[idx] = json.data;
      } else {
        this.localAppointments.unshift(json.data);
      }
      save('appointments', this.localAppointments);
      notifyListeners();
      return json.data;
    }

    throw new Error('Unexpected response checking in patient');
  }

  async rescheduleAppointment(id: string, newDateTime: string, newTimeSlot: string, reason?: string): Promise<Appointment> {
    const res = await fetch(`/api/appointments/${encodeURIComponent(id)}/reschedule`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.getAuthHeaders()
      },
      body: JSON.stringify({
        newDateTime,
        newTimeSlot,
        reason
      })
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err: any = new Error(json.message || json.error || 'Failed to reschedule appointment');
      err.status = res.status;
      err.code = json.code;
      err.conflict = json.conflict;
      throw err;
    }

    if (json.success && json.data) {
      const idx = this.localAppointments.findIndex((a) => a.id === id || a.appointmentNumber === id);
      if (idx !== -1) this.localAppointments[idx] = json.data;
      save('appointments', this.localAppointments);
      notifyListeners();
      return json.data;
    }

    throw new Error('Unexpected response rescheduling appointment');
  }

  async cancelAppointment(id: string, cancellationReason: string): Promise<Appointment> {
    const res = await fetch(`/api/appointments/${encodeURIComponent(id)}/cancel`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.getAuthHeaders()
      },
      body: JSON.stringify({ cancellationReason })
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err: any = new Error(json.message || json.error || 'Failed to cancel appointment');
      err.status = res.status;
      err.code = json.code;
      throw err;
    }

    if (json.success && json.data) {
      const idx = this.localAppointments.findIndex((a) => a.id === id || a.appointmentNumber === id);
      if (idx !== -1) this.localAppointments[idx] = json.data;
      save('appointments', this.localAppointments);
      notifyListeners();
      return json.data;
    }

    throw new Error('Unexpected response cancelling appointment');
  }

  async consultationHandoff(id: string): Promise<Appointment> {
    const res = await fetch(`/api/appointments/${encodeURIComponent(id)}/consultation-handoff`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.getAuthHeaders()
      }
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err: any = new Error(json.message || json.error || 'Failed to start consultation');
      err.status = res.status;
      err.code = json.code;
      throw err;
    }

    if (json.success && json.data) {
      const idx = this.localAppointments.findIndex((a) => a.id === id || a.appointmentNumber === id);
      if (idx !== -1) this.localAppointments[idx] = json.data;
      save('appointments', this.localAppointments);
      notifyListeners();
      return json.data;
    }

    throw new Error('Unexpected response during consultation handoff');
  }

  async completeAppointment(id: string): Promise<Appointment> {
    const res = await fetch(`/api/appointments/${encodeURIComponent(id)}/complete`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.getAuthHeaders()
      }
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err: any = new Error(json.message || json.error || 'Failed to complete appointment');
      err.status = res.status;
      err.code = json.code;
      throw err;
    }

    if (json.success && json.data) {
      const idx = this.localAppointments.findIndex((a) => a.id === id || a.appointmentNumber === id);
      if (idx !== -1) this.localAppointments[idx] = json.data;
      save('appointments', this.localAppointments);
      notifyListeners();
      return json.data;
    }

    throw new Error('Unexpected response completing appointment');
  }

  async getReceptionQueue(params?: { discipline?: string; status?: string }): Promise<QueueItem[]> {
    try {
      const queryParams = new URLSearchParams();
      if (params?.discipline && params.discipline !== 'all') queryParams.set('discipline', params.discipline);
      if (params?.status && params.status !== 'all') queryParams.set('status', params.status);
      const qs = queryParams.toString();
      const res = await fetch(`/api/reception/queue${qs ? `?${qs}` : ''}`, {
        headers: this.getAuthHeaders()
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success && Array.isArray(json.data)) {
          return json.data;
        }
      }
    } catch {
      // fallback
    }
    return [];
  }

  async updateQueuePriority(id: string, priority: QueuePriority, priorityReason: string): Promise<Appointment> {
    const res = await fetch(`/api/reception/queue/${encodeURIComponent(id)}/priority`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...this.getAuthHeaders()
      },
      body: JSON.stringify({ priority, priorityReason })
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err: any = new Error(json.message || json.error || 'Failed to update queue priority');
      err.status = res.status;
      err.code = json.code;
      throw err;
    }

    if (json.success && json.data) {
      const idx = this.localAppointments.findIndex((a) => a.id === id || a.appointmentNumber === id);
      if (idx !== -1) this.localAppointments[idx] = json.data;
      save('appointments', this.localAppointments);
      notifyListeners();
      return json.data;
    }

    throw new Error('Unexpected response updating queue priority');
  }

  async escalateQueuePatient(id: string, escalationReason: string): Promise<Appointment> {
    const res = await fetch(`/api/reception/queue/${encodeURIComponent(id)}/escalate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.getAuthHeaders()
      },
      body: JSON.stringify({ escalationReason })
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err: any = new Error(json.message || json.error || 'Failed to flag emergency escalation');
      err.status = res.status;
      err.code = json.code;
      throw err;
    }

    if (json.success && json.data) {
      const idx = this.localAppointments.findIndex((a) => a.id === id || a.appointmentNumber === id);
      if (idx !== -1) this.localAppointments[idx] = json.data;
      save('appointments', this.localAppointments);
      notifyListeners();
      return json.data;
    }

    throw new Error('Unexpected response escalating queue patient');
  }

  async acknowledgeEscalation(id: string): Promise<Appointment> {
    const res = await fetch(`/api/reception/queue/${encodeURIComponent(id)}/escalate/acknowledge`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.getAuthHeaders()
      }
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err: any = new Error(json.message || json.error || 'Failed to acknowledge emergency escalation');
      err.status = res.status;
      err.code = json.code;
      throw err;
    }

    if (json.success && json.data) {
      const idx = this.localAppointments.findIndex((a) => a.id === id || a.appointmentNumber === id);
      if (idx !== -1) this.localAppointments[idx] = json.data;
      save('appointments', this.localAppointments);
      notifyListeners();
      return json.data;
    }

    throw new Error('Unexpected response acknowledging emergency escalation');
  }

  async resolveEscalation(id: string, resolutionNotes: string): Promise<Appointment> {
    const res = await fetch(`/api/reception/queue/${encodeURIComponent(id)}/escalate/resolve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.getAuthHeaders()
      },
      body: JSON.stringify({ resolutionNotes })
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err: any = new Error(json.message || json.error || 'Failed to resolve emergency escalation');
      err.status = res.status;
      err.code = json.code;
      throw err;
    }

    if (json.success && json.data) {
      const idx = this.localAppointments.findIndex((a) => a.id === id || a.appointmentNumber === id);
      if (idx !== -1) this.localAppointments[idx] = json.data;
      save('appointments', this.localAppointments);
      notifyListeners();
      return json.data;
    }

    throw new Error('Unexpected response resolving emergency escalation');
  }

  async getReceptionDashboard(date?: string): Promise<ReceptionDashboardMetrics | null> {
    try {
      const qs = date ? `?date=${encodeURIComponent(date)}` : '';
      const res = await fetch(`/api/reception/dashboard${qs}`, {
        headers: this.getAuthHeaders()
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) {
          return json.data;
        }
      }
    } catch {
      // fallback
    }
    return null;
  }

  async sendAppointmentReminder(id: string, channel: 'SMS' | 'Email'): Promise<AppointmentReminder> {
    try {
      const res = await fetch(`/api/appointments/${id}/remind`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel })
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          this.localReminders.unshift(json.data);
          save('reminders', this.localReminders);
          const apt = this.localAppointments.find((a) => a.id === id);
          if (apt) {
            apt.reminderSent = true;
            apt.reminderChannel = channel.toLowerCase() as any;
            apt.reminderSentAt = new Date().toISOString();
            save('appointments', this.localAppointments);
          }
          notifyListeners();
          return json.data;
        }
      }
    } catch {
      // fallback
    }

    const apt = this.localAppointments.find((a) => a.id === id);
    if (!apt) throw new Error('Appointment not found');

    const reminder: AppointmentReminder = {
      id: `rem-${Date.now()}`,
      appointmentId: apt.id,
      patientId: apt.patientId,
      patientName: apt.patientName,
      recipientPhone: apt.patientPhone,
      recipientEmail: apt.patientEmail || 'patient@sahachara.com',
      doctorName: apt.doctorName || 'Attending Physician',
      dateTime: `${apt.dateTime.split('T')[0]} at ${apt.timeSlot}`,
      channel,
      status: 'Delivered',
      sentAt: new Date().toISOString(),
      messageContent:
        channel === 'SMS'
          ? `SahacharaOS Alert: Hello ${apt.patientName}, your ${apt.type} appointment with ${apt.doctorName} is confirmed for ${apt.timeSlot} on ${apt.dateTime.split('T')[0]}.`
          : `Subject: Upcoming Appointment Reminder - SahacharaOS. Dear ${apt.patientName}, your appointment with ${apt.doctorName} (${apt.department}) is scheduled for ${apt.timeSlot} on ${apt.dateTime.split('T')[0]}.`
    };

    apt.reminderSent = true;
    apt.reminderChannel = channel.toLowerCase() as any;
    apt.reminderSentAt = new Date().toISOString();
    save('appointments', this.localAppointments);

    this.localReminders.unshift(reminder);
    save('reminders', this.localReminders);
    this.addAuditLog('Automated Notification Service', 'System Daemon', `Sent ${channel} Reminder`, 'Appointment Scheduled', `Dispatched automated reminder to ${apt.patientName}`, apt.patientMrn);
    notifyListeners();
    return reminder;
  }

  async getReminders(): Promise<AppointmentReminder[]> {
    try {
      const res = await fetch('/api/reminders');
      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          this.localReminders = json.data;
          save('reminders', this.localReminders);
          return json.data;
        }
      }
    } catch {
      // fallback
    }
    return this.localReminders;
  }

  // 4. Triage
  async getTriageRecords(): Promise<TriageRecord[]> {
    try {
      const res = await fetch('/api/triage');
      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          this.localTriage = json.data;
          save('triage', this.localTriage);
          return json.data;
        }
      }
    } catch {
      // fallback
    }
    return this.localTriage;
  }

  async createTriageRecord(data: Partial<TriageRecord>): Promise<TriageRecord> {
    const currentUser = this.getCurrentUser();
    try {
      const res = await fetch('/api/triage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          this.localTriage.unshift(json.data);
          save('triage', this.localTriage);
          notifyListeners();
          return json.data;
        }
      }
    } catch {
      // fallback
    }

    const newRecord: TriageRecord = {
      id: `trg-${Date.now()}`,
      patientId: data.patientId || `pat-${Date.now()}`,
      patientName: data.patientName || 'Emergency Patient',
      mrn: data.mrn || `MRN-${Math.floor(10000 + Math.random() * 90000)}`,
      age: Number(data.age) || 45,
      gender: data.gender || 'Other',
      esiLevel: data.esiLevel || 3,
      chiefComplaint: data.chiefComplaint || 'Acute presentation',
      vitals: data.vitals || {
        bpSystolic: 120,
        bpDiastolic: 80,
        heartRate: 76,
        spo2: 98,
        temperature: 37.0,
        respRate: 16,
        recordedAt: new Date().toISOString()
      },
      triageNurse: data.triageNurse || currentUser.name,
      arrivalTime: new Date().toISOString(),
      triageStatus: 'waiting',
      assignedRoom: data.assignedRoom,
      notes: data.notes
    };

    this.localTriage.unshift(newRecord);
    save('triage', this.localTriage);
    this.addAuditLog(newRecord.triageNurse, currentUser.role, 'Emergency Triage Scored', 'Triage Intake', `ESI ${newRecord.esiLevel} assigned to ${newRecord.patientName}`, newRecord.mrn);
    notifyListeners();
    return newRecord;
  }

  async updateTriageStatus(id: string, status: TriageRecord['triageStatus'], room?: string): Promise<void> {
    try {
      await fetch(`/api/triage/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ triageStatus: status, assignedRoom: room })
      });
    } catch {
      // fallback
    }
    const idx = this.localTriage.findIndex((t) => t.id === id);
    if (idx !== -1) {
      this.localTriage[idx].triageStatus = status;
      if (room) this.localTriage[idx].assignedRoom = room;
      save('triage', this.localTriage);
      notifyListeners();
    }
  }

  // 6. Doctors
  async getDoctors(): Promise<Doctor[]> {
    try {
      const res = await fetch('/api/doctors');
      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          this.localDoctors = json.data;
          save('doctors', this.localDoctors);
          return json.data;
        }
      }
    } catch {
      // fallback
    }
    return this.localDoctors;
  }

  // 6b. Clinical Staff & Operational Workforce
  async getStaff(
    roleOrFilters?: string | { role?: string; department?: string; search?: string; status?: string; page?: number; limit?: number; includeArchived?: boolean },
    deptArg?: string
  ): Promise<StaffMember[]> {
    try {
      const params = new URLSearchParams();
      if (typeof roleOrFilters === 'string') {
        if (roleOrFilters && roleOrFilters !== 'all') params.append('role', roleOrFilters);
        if (deptArg && deptArg !== 'all') params.append('department', deptArg);
      } else if (roleOrFilters && typeof roleOrFilters === 'object') {
        if (roleOrFilters.role && roleOrFilters.role !== 'all') params.append('role', roleOrFilters.role);
        if (roleOrFilters.department && roleOrFilters.department !== 'all') params.append('department', roleOrFilters.department);
        if (roleOrFilters.search) params.append('search', roleOrFilters.search);
        if (roleOrFilters.status && roleOrFilters.status !== 'all') params.append('status', roleOrFilters.status);
        if (roleOrFilters.page) params.append('page', String(roleOrFilters.page));
        if (roleOrFilters.limit) params.append('limit', String(roleOrFilters.limit));
        if (roleOrFilters.includeArchived) params.append('includeArchived', 'true');
      }

      const url = `/api/staff${params.toString() ? `?${params.toString()}` : ''}`;
      const res = await fetch(url, { headers: this.getAuthHeaders() });
      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          this.localStaff = json.data;
          save('staff', this.localStaff);
          return json.data;
        }
      }
    } catch {
      // fallback
    }

    let list = this.localStaff;
    const filterRole = typeof roleOrFilters === 'string' ? roleOrFilters : roleOrFilters?.role;
    const filterDept = typeof roleOrFilters === 'string' ? deptArg : roleOrFilters?.department;
    if (filterRole && filterRole !== 'all') {
      list = list.filter((s) => s.role.toLowerCase() === filterRole.toLowerCase());
    }
    if (filterDept && filterDept !== 'all') {
      list = list.filter((s) => s.department.toLowerCase() === filterDept.toLowerCase());
    }
    return list;
  }

  async getStaffMember(id: string): Promise<StaffMember> {
    try {
      const res = await fetch(`/api/staff/${id}`, { headers: this.getAuthHeaders() });
      if (res.ok) {
        const json = await res.json();
        if (json.success) return json.data;
      }
    } catch {
      // fallback
    }
    const match = this.localStaff.find((s) => s.id === id || s.employeeId === id);
    if (match) return match;
    throw new Error('Staff member not found');
  }

  async createStaff(data: Partial<StaffMember>): Promise<StaffMember> {
    const currentUser = this.getCurrentUser();
    try {
      const res = await fetch('/api/staff', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...this.getAuthHeaders()
        },
        body: JSON.stringify(data)
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          const created = { ...json.data, activationPin: json.activationPin || json.data.activationPin };
          this.localStaff.unshift(created);
          save('staff', this.localStaff);
          notifyListeners();
          return created;
        }
      } else {
        const errJson = await res.json().catch(() => null);
        if (errJson && errJson.message) {
          throw new Error(errJson.message);
        }
        throw new Error(`Failed to create staff member: HTTP ${res.status}`);
      }
    } catch (err: any) {
      if (err.message && !err.message.includes('fetch')) {
        throw err;
      }
    }

    if (!data.phone || data.phone.trim() === '') {
      throw new Error('PhoneRequired: Contact telephone number is mandatory.');
    }
    const cleanPhone = data.phone.trim();
    const phoneDigits = cleanPhone.replace(/\D/g, '');
    const phonePattern = /^\+?[0-9\s\-()]{7,25}$/;
    if (!phonePattern.test(cleanPhone) || phoneDigits.length < 7 || phoneDigits.length > 15) {
      throw new Error('InvalidPhone: Contact telephone number must be a valid telephone format (e.g. +91 98450 12345).');
    }

    const pin = data.activationPin || Math.floor(1000 + Math.random() * 9000).toString();
    const newStaff: StaffMember = {
      id: `stf-${Date.now()}`,
      employeeId: data.employeeId || `STF-2026-${Math.floor(10000 + Math.random() * 90000)}`,
      name: data.name || 'New Staff Member',
      role: (data.role as UserRole) || 'DOCTOR',
      designation: data.designation || 'Ayurvedic Medical Officer',
      department: data.department || 'Kayachikitsa (Internal Medicine)',
      email: data.email || `staff.${Date.now()}@sahachara.com`,
      phone: cleanPhone,
      licenseNumber: data.licenseNumber || null,
      status: (data.status as any) || 'pending_activation',
      activationPin: pin,
      shift: data.shift || null,
      qualification: data.qualification || null,
      joiningDate: data.joiningDate || new Date().toISOString().split('T')[0],
      notes: data.notes || null
    };

    this.localStaff.unshift(newStaff);
    save('staff', this.localStaff);
    this.addAuditLog(currentUser.name, currentUser.role, 'Onboarded Staff Member', 'Staff Management', `Added ${newStaff.name} as ${newStaff.role} (${newStaff.department})`);
    notifyListeners();
    return newStaff;
  }

  async updateStaff(id: string, updates: Partial<StaffMember>): Promise<StaffMember> {
    const currentUser = this.getCurrentUser();
    try {
      const res = await fetch(`/api/staff/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...this.getAuthHeaders()
        },
        body: JSON.stringify(updates)
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          const idx = this.localStaff.findIndex((s) => s.id === id);
          if (idx !== -1) {
            this.localStaff[idx] = json.data;
            save('staff', this.localStaff);
            notifyListeners();
          }
          return json.data;
        }
      }
    } catch {
      // fallback
    }

    const idx = this.localStaff.findIndex((s) => s.id === id);
    if (idx !== -1) {
      this.localStaff[idx] = { ...this.localStaff[idx], ...updates };
      save('staff', this.localStaff);
      this.addAuditLog(currentUser.name, currentUser.role, 'Updated Staff Record', 'Staff Management', `Updated profile of ${this.localStaff[idx].name}`);
      notifyListeners();
      return this.localStaff[idx];
    }
    throw new Error('Staff member not found');
  }

  async changeStaffRole(id: string, newRole: UserRole, reason?: string): Promise<StaffMember> {
    const res = await fetch(`/api/staff/${id}/role`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...this.getAuthHeaders()
      },
      body: JSON.stringify({ newRole, reason })
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json.message || 'Failed to change staff role');
    }
    const idx = this.localStaff.findIndex((s) => s.id === id);
    if (idx !== -1) {
      this.localStaff[idx] = json.data;
      save('staff', this.localStaff);
      notifyListeners();
    }
    return json.data;
  }

  async suspendStaff(id: string, reason: string): Promise<StaffMember> {
    const res = await fetch(`/api/staff/${id}/suspend`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.getAuthHeaders()
      },
      body: JSON.stringify({ reason })
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json.message || 'Failed to suspend staff member');
    }
    const idx = this.localStaff.findIndex((s) => s.id === id);
    if (idx !== -1) {
      this.localStaff[idx] = json.data;
      save('staff', this.localStaff);
      notifyListeners();
    }
    return json.data;
  }

  async reactivateStaff(id: string, reason?: string): Promise<StaffMember> {
    const res = await fetch(`/api/staff/${id}/reactivate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.getAuthHeaders()
      },
      body: JSON.stringify({ reason })
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json.message || 'Failed to reactivate staff member');
    }
    const idx = this.localStaff.findIndex((s) => s.id === id);
    if (idx !== -1) {
      this.localStaff[idx] = json.data;
      save('staff', this.localStaff);
      notifyListeners();
    }
    return json.data;
  }

  async archiveStaff(id: string, reason: string): Promise<StaffMember> {
    const res = await fetch(`/api/staff/${id}/archive`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.getAuthHeaders()
      },
      body: JSON.stringify({ reason })
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json.message || 'Failed to archive staff record');
    }
    const idx = this.localStaff.findIndex((s) => s.id === id);
    if (idx !== -1) {
      this.localStaff[idx] = json.data;
      save('staff', this.localStaff);
      notifyListeners();
    }
    return json.data;
  }

  async regenerateStaffPin(id: string): Promise<{ success: boolean; activationPin: string }> {
    const res = await fetch(`/api/staff/${id}/regenerate-pin`, {
      method: 'POST',
      headers: this.getAuthHeaders()
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json.message || 'Failed to regenerate activation PIN');
    }
    return json;
  }

  async getStaffHistory(id: string): Promise<ClinicalAuditLog[]> {
    const res = await fetch(`/api/staff/${id}/history`, {
      headers: this.getAuthHeaders()
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json.message || 'Failed to fetch staff history');
    }
    return json.data;
  }

  async getPractitionerCredentials(): Promise<PractitionerCredentials | null> {
    const res = await fetch('/api/practitioner/credentials', {
      headers: this.getAuthHeaders()
    });
    if (!res.ok) {
      if (res.status === 403 || res.status === 401) {
        return null;
      }
      const json = await res.json().catch(() => ({}));
      throw new Error(json.message || `Failed to fetch practitioner credentials (${res.status})`);
    }
    const json = await res.json();
    return json.data || null;
  }

  async updatePractitionerCredentials(credentials: Partial<PractitionerCredentials>): Promise<PractitionerCredentials> {
    const res = await fetch('/api/practitioner/credentials', {
      method: 'PUT',
      headers: {
        ...this.getAuthHeaders(),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(credentials)
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json.message || 'Failed to update practitioner credentials');
    }
    return json.data;
  }

  // ============================================================================
  // PHASE 6B: HOSPITAL CONFIGURATION & DEPARTMENT MANAGEMENT
  // ============================================================================

  // 1. Hospital Institutional Profile
  async getHospitalProfile(): Promise<HospitalProfile> {
    const res = await fetch('/api/hospital/profile', {
      headers: this.getAuthHeaders()
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json.message || 'Failed to retrieve hospital institutional profile');
    }
    return json.data;
  }

  async updateHospitalProfile(
    data: Partial<HospitalProfile> & { version: number }
  ): Promise<{ success: boolean; data?: HospitalProfile; error?: string; code?: string }> {
    try {
      const res = await fetch('/api/hospital/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...this.getAuthHeaders()
        },
        body: JSON.stringify(data)
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        return {
          success: false,
          error: json.message || 'Failed to update hospital profile',
          code: json.code
        };
      }
      return { success: true, data: json.data };
    } catch (err: any) {
      return { success: false, error: err.message || 'Network error updating hospital profile' };
    }
  }

  // 2. Department Master Management
  async getDepartments(filters?: {
    isActive?: boolean;
    discipline?: DepartmentDiscipline;
    search?: string;
  }): Promise<Department[]> {
    const params = new URLSearchParams();
    if (filters?.isActive !== undefined) {
      params.append('isActive', String(filters.isActive));
    }
    if (filters?.discipline) {
      params.append('discipline', filters.discipline);
    }
    if (filters?.search) {
      params.append('search', filters.search);
    }
    const query = params.toString() ? `?${params.toString()}` : '';
    const res = await fetch(`/api/departments${query}`, {
      headers: this.getAuthHeaders()
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json.message || 'Failed to list departments');
    }
    return json.data;
  }

  async getDepartmentById(id: string): Promise<Department> {
    const res = await fetch(`/api/departments/${id}`, {
      headers: this.getAuthHeaders()
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json.message || 'Failed to retrieve department');
    }
    return json.data;
  }

  async createDepartment(data: {
    code: string;
    name: string;
    discipline?: DepartmentDiscipline;
    description?: string;
  }): Promise<{ success: boolean; data?: Department; error?: string; code?: string }> {
    try {
      const res = await fetch('/api/departments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...this.getAuthHeaders()
        },
        body: JSON.stringify(data)
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        return {
          success: false,
          error: json.message || 'Failed to create department',
          code: json.code
        };
      }
      notifyListeners();
      return { success: true, data: json.data };
    } catch (err: any) {
      return { success: false, error: err.message || 'Network error creating department' };
    }
  }

  async updateDepartment(
    id: string,
    data: { name?: string; discipline?: DepartmentDiscipline; description?: string }
  ): Promise<{ success: boolean; data?: Department; error?: string; code?: string }> {
    try {
      const res = await fetch(`/api/departments/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...this.getAuthHeaders()
        },
        body: JSON.stringify(data)
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        return {
          success: false,
          error: json.message || 'Failed to update department',
          code: json.code
        };
      }
      notifyListeners();
      return { success: true, data: json.data };
    } catch (err: any) {
      return { success: false, error: err.message || 'Network error updating department' };
    }
  }

  async deactivateDepartment(
    id: string,
    reason: string
  ): Promise<{ success: boolean; data?: Department; error?: string; code?: string }> {
    try {
      const res = await fetch(`/api/departments/${id}/deactivate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...this.getAuthHeaders()
        },
        body: JSON.stringify({ reason })
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        return {
          success: false,
          error: json.message || 'Failed to deactivate department',
          code: json.code
        };
      }
      notifyListeners();
      return { success: true, data: json.data };
    } catch (err: any) {
      return { success: false, error: err.message || 'Network error deactivating department' };
    }
  }

  async activateDepartment(
    id: string
  ): Promise<{ success: boolean; data?: Department; error?: string; code?: string }> {
    try {
      const res = await fetch(`/api/departments/${id}/activate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...this.getAuthHeaders()
        }
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        return {
          success: false,
          error: json.message || 'Failed to activate department',
          code: json.code
        };
      }
      notifyListeners();
      return { success: true, data: json.data };
    } catch (err: any) {
      return { success: false, error: err.message || 'Network error activating department' };
    }
  }

  async getDepartmentStaff(id: string): Promise<StaffDepartmentAssignment[]> {
    const res = await fetch(`/api/departments/${id}/staff`, {
      headers: this.getAuthHeaders()
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json.message || 'Failed to query department staff');
    }
    return json.data;
  }

  // 3. Staff Department Assignments
  async getStaffDepartments(staffId: string): Promise<StaffDepartmentAssignment[]> {
    const res = await fetch(`/api/staff/${staffId}/departments`, {
      headers: this.getAuthHeaders()
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json.message || 'Failed to retrieve staff department assignments');
    }
    return json.data;
  }

  async getStaffPrimaryDepartment(staffId: string): Promise<{
    assignment: StaffDepartmentAssignment | null;
    primaryDepartment: Department | null;
  }> {
    const res = await fetch(`/api/staff/${staffId}/departments/primary`, {
      headers: this.getAuthHeaders()
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json.message || 'Failed to retrieve primary department');
    }
    return {
      assignment: json.data || null,
      primaryDepartment: json.primaryDepartment || null
    };
  }

  async assignStaffDepartment(
    staffId: string,
    data: {
      departmentId: string;
      isPrimary?: boolean;
      roleTitle?: string;
      startDate?: string;
    }
  ): Promise<{ success: boolean; data?: StaffDepartmentAssignment; error?: string; code?: string }> {
    try {
      const res = await fetch(`/api/staff/${staffId}/departments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...this.getAuthHeaders()
        },
        body: JSON.stringify(data)
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        return {
          success: false,
          error: json.message || 'Failed to assign staff to department',
          code: json.code
        };
      }
      notifyListeners();
      return { success: true, data: json.data };
    } catch (err: any) {
      return { success: false, error: err.message || 'Network error assigning staff to department' };
    }
  }

  async changeStaffPrimaryDepartment(
    staffId: string,
    departmentId: string,
    reason?: string
  ): Promise<{ success: boolean; data?: StaffDepartmentAssignment; error?: string; code?: string }> {
    try {
      const res = await fetch(`/api/staff/${staffId}/departments/primary`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...this.getAuthHeaders()
        },
        body: JSON.stringify({ departmentId, reason })
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        return {
          success: false,
          error: json.message || 'Failed to change primary department',
          code: json.code
        };
      }
      notifyListeners();
      return { success: true, data: json.data };
    } catch (err: any) {
      return { success: false, error: err.message || 'Network error changing primary department' };
    }
  }

  async completeStaffAssignment(
    staffId: string,
    assignmentId: string,
    reason?: string
  ): Promise<{ success: boolean; data?: StaffDepartmentAssignment; error?: string; code?: string }> {
    try {
      const res = await fetch(`/api/staff/${staffId}/departments/${assignmentId}/complete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...this.getAuthHeaders()
        },
        body: JSON.stringify({ reason })
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        return {
          success: false,
          error: json.message || 'Failed to complete department assignment',
          code: json.code
        };
      }
      notifyListeners();
      return { success: true, data: json.data };
    } catch (err: any) {
      return { success: false, error: err.message || 'Network error completing assignment' };
    }
  }

  async transferStaffAssignment(
    staffId: string,
    assignmentId: string,
    newDepartmentId: string,
    reason?: string
  ): Promise<{ success: boolean; data?: StaffDepartmentAssignment; error?: string; code?: string }> {
    try {
      const res = await fetch(`/api/staff/${staffId}/departments/${assignmentId}/transfer`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...this.getAuthHeaders()
        },
        body: JSON.stringify({ newDepartmentId, reason })
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        return {
          success: false,
          error: json.message || 'Failed to transfer department assignment',
          code: json.code
        };
      }
      notifyListeners();
      return { success: true, data: json.data };
    } catch (err: any) {
      return { success: false, error: err.message || 'Network error transferring assignment' };
    }
  }

  async revokeStaffAssignment(
    staffId: string,
    assignmentId: string,
    reason: string
  ): Promise<{ success: boolean; data?: StaffDepartmentAssignment; error?: string; code?: string }> {
    try {
      const res = await fetch(`/api/staff/${staffId}/departments/${assignmentId}/revoke`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...this.getAuthHeaders()
        },
        body: JSON.stringify({ reason })
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        return {
          success: false,
          error: json.message || 'Failed to revoke department assignment',
          code: json.code
        };
      }
      notifyListeners();
      return { success: true, data: json.data };
    } catch (err: any) {
      return { success: false, error: err.message || 'Network error revoking assignment' };
    }
  }

  // 7. Pharmacy
  async getPrescriptions(): Promise<Prescription[]> {
    try {
      const res = await fetch('/api/pharmacy/prescriptions', {
        headers: this.getAuthHeaders()
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success) return json.data;
      }
    } catch {
      // fallback
    }

    return this.localPrescriptions;
  }

  async createPrescription(data: Partial<Prescription>): Promise<Prescription> {
    const currentUser = this.getCurrentUser();
    try {
      const res = await fetch('/api/pharmacy/prescriptions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...this.getAuthHeaders()
        },
        body: JSON.stringify(data)
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          this.localPrescriptions.unshift(json.data);
          save('prescriptions', this.localPrescriptions);
          notifyListeners();
          return json.data;
        }
      }
    } catch {
      // fallback
    }

    const newRx: Prescription = {
      id: `rx-${Date.now()}`,
      rxNumber: `RX-2026-${Math.floor(1000 + Math.random() * 9000)}`,
      patientId: data.patientId || '',
      patientName: data.patientName || 'Patient',
      mrn: data.mrn || 'MRN-UNKNOWN',
      doctorId: data.doctorId || 'doc-201',
      doctorName: data.doctorName || currentUser.name,
      datePrescribed: new Date().toISOString(),
      medicationName: data.medicationName || 'Medication',
      dosage: data.dosage || '10 mg',
      frequency: data.frequency || 'Daily',
      route: data.route || 'Oral',
      duration: data.duration || '7 days',
      status: 'pending',
      pharmacyNotes: data.pharmacyNotes
    };

    this.localPrescriptions.unshift(newRx);
    save('prescriptions', this.localPrescriptions);
    this.addAuditLog(newRx.doctorName, currentUser.role, 'Ordered E-Prescription', 'Medication Dispense', `Prescribed ${newRx.medicationName} for ${newRx.patientName}`, newRx.mrn);
    notifyListeners();
    return newRx;
  }

  async dispensePrescription(id: string, pharmacistName: string, notes?: string, quantity?: number): Promise<void> {
    try {
      await fetch(`/api/pharmacy/prescriptions/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...this.getAuthHeaders()
        },
        body: JSON.stringify({ status: 'dispensed', dispensedBy: pharmacistName, notes, quantity })
      });
    } catch {
      // fallback
    }
    const idx = this.localPrescriptions.findIndex((p) => p.id === id);
    if (idx !== -1) {
      this.localPrescriptions[idx].status = 'dispensed';
      this.localPrescriptions[idx].dispensedAt = new Date().toISOString();
      this.localPrescriptions[idx].dispensedBy = pharmacistName;
      save('prescriptions', this.localPrescriptions);
      this.addAuditLog(pharmacistName, 'PHARMACIST', 'Dispensed Medication', 'Medication Dispense', `Dispensed ${this.localPrescriptions[idx].medicationName}`, this.localPrescriptions[idx].mrn);
      notifyListeners();
    }
  }

  async getMedicationStock(): Promise<MedicationStock[]> {
    try {
      const res = await fetch('/api/pharmacy/stock', {
        headers: this.getAuthHeaders()
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success) return json.data;
      }
    } catch {
      // fallback
    }
    return this.localStock;
  }

  async updateStockQuantity(id: string, delta: number): Promise<void> {
    const idx = this.localStock.findIndex((s) => s.id === id);
    if (idx !== -1) {
      this.localStock[idx].stockQuantity = Math.max(0, this.localStock[idx].stockQuantity + delta);
      if (this.localStock[idx].stockQuantity <= this.localStock[idx].minThreshold * 0.4) {
        this.localStock[idx].status = 'critical';
      } else if (this.localStock[idx].stockQuantity <= this.localStock[idx].minThreshold) {
        this.localStock[idx].status = 'low_stock';
      } else {
        this.localStock[idx].status = 'in_stock';
      }
      save('stock', this.localStock);
      notifyListeners();
    }
  }

  async createMedicationStock(data: Partial<MedicationStock>): Promise<MedicationStock> {
    const currentUser = this.getCurrentUser();
    const qty = Number(data.stockQuantity) || 0;
    const min = Number(data.minThreshold) || 20;
    let status: MedicationStock['status'] = 'in_stock';
    if (qty <= min * 0.4) {
      status = 'critical';
    } else if (qty <= min) {
      status = 'low_stock';
    }

    const newStock: MedicationStock = {
      id: `med-${Date.now()}`,
      drugName: data.drugName || 'Ayurvedic Formulation',
      genericName: data.genericName || 'Classical Herb/Formulation',
      category: data.category || 'Ayurvedic Oil / Thailam',
      form: (data.form as any) || 'Oil / Liquid',
      stockQuantity: qty,
      unit: data.unit || 'bottles',
      minThreshold: min,
      batchNumber: data.batchNumber || `AY-${new Date().getFullYear()}-B${Math.floor(100 + Math.random() * 900)}`,
      expiryDate: data.expiryDate || '2028-12-31',
      unitPrice:
        data.unitPrice !== null && data.unitPrice !== undefined && !isNaN(Number(data.unitPrice))
          ? Number(data.unitPrice)
          : null,
      status
    };

    try {
      const res = await fetch('/api/pharmacy/stock', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...this.getAuthHeaders()
        },
        body: JSON.stringify(newStock)
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          this.localStock.unshift(json.data);
          save('stock', this.localStock);
          notifyListeners();
          return json.data;
        }
      }
    } catch {
      // fallback
    }

    this.localStock.unshift(newStock);
    save('stock', this.localStock);
    this.addAuditLog(currentUser.name, currentUser.role, 'Added Pharmacy Stock', 'Medication Dispense', `Added ${newStock.drugName} (Qty: ${qty} ${newStock.unit}) to central formulary inventory`);
    notifyListeners();
    return newStock;
  }

  // 8. Laboratory
  async getLabOrders(): Promise<LabOrder[]> {
    try {
      const res = await fetch('/api/laboratory', {
        headers: this.getAuthHeaders()
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success) return json.data;
      }
    } catch {
      // fallback
    }

    return this.localLabOrders;
  }

  async createLabOrder(data: Partial<LabOrder>): Promise<LabOrder> {
    const currentUser = this.getCurrentUser();
    try {
      const res = await fetch('/api/laboratory', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...this.getAuthHeaders()
        },
        body: JSON.stringify(data)
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          this.localLabOrders.unshift(json.data);
          save('labs', this.localLabOrders);
          notifyListeners();
          return json.data;
        }
      }
    } catch {
      // fallback
    }

    const newOrder: LabOrder = {
      id: `lab-${Date.now()}`,
      orderNumber: `LAB-2026-${Math.floor(1000 + Math.random() * 9000)}`,
      patientId: data.patientId || '',
      patientName: data.patientName || 'Patient',
      mrn: data.mrn || 'MRN-UNKNOWN',
      testType: data.testType || 'Complete Blood Count (CBC)',
      priority: data.priority || 'Routine',
      orderingDoctor: data.orderingDoctor || currentUser.name,
      orderedAt: new Date().toISOString(),
      status: 'ordered',
      labNotes: data.labNotes
    };

    this.localLabOrders.unshift(newOrder);
    save('labs', this.localLabOrders);
    this.addAuditLog(newOrder.orderingDoctor, currentUser.role, 'Ordered Diagnostic Lab', 'Lab Release', `Ordered ${newOrder.testType}`, newOrder.mrn);
    notifyListeners();
    return newOrder;
  }

  async updateLabResult(id: string, updates: Partial<LabOrder>): Promise<void> {
    try {
      await fetch(`/api/laboratory/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...this.getAuthHeaders()
        },
        body: JSON.stringify(updates)
      });
    } catch {
      // fallback
    }
    const idx = this.localLabOrders.findIndex((l) => l.id === id);
    if (idx !== -1) {
      this.localLabOrders[idx] = { ...this.localLabOrders[idx], ...updates };
      save('labs', this.localLabOrders);
      this.addAuditLog('Pathology Lab Technologist', 'DOCTOR', 'Reported Lab Result', 'Lab Release', `Result updated for ${this.localLabOrders[idx].testType}`, this.localLabOrders[idx].mrn);
      notifyListeners();
    }
  }

  async verifyLabResult(
    id: string,
    resultData: { resultValue: string; normalRange?: string; isAbnormal?: boolean; labNotes?: string; notes?: string }
  ): Promise<LabOrder> {
    const currentUser = this.getCurrentUser();
    try {
      const res = await fetch(`/api/laboratory/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...this.getAuthHeaders()
        },
        body: JSON.stringify({
          ...resultData,
          status: 'verified',
          verifiedBy: currentUser.name,
          verifiedAt: new Date().toISOString()
        })
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          const idx = this.localLabOrders.findIndex((l) => l.id === id);
          if (idx !== -1) {
            this.localLabOrders[idx] = json.data;
            save('labs', this.localLabOrders);
            notifyListeners();
          }
          return json.data;
        }
      }
    } catch {
      // fallback
    }

    const idx = this.localLabOrders.findIndex((l) => l.id === id);
    if (idx !== -1) {
      const lab = this.localLabOrders[idx];
      lab.status = 'verified';
      lab.resultValue = resultData.resultValue;
      if (resultData.normalRange) lab.normalRange = resultData.normalRange;
      if (resultData.isAbnormal !== undefined) lab.isAbnormal = resultData.isAbnormal;
      lab.verifiedBy = currentUser.name;
      lab.verifiedAt = new Date().toISOString();
      if (resultData.labNotes || resultData.notes) lab.labNotes = resultData.labNotes || resultData.notes;
      this.localLabOrders[idx] = lab;
      save('labs', this.localLabOrders);
      this.addAuditLog(currentUser.name, currentUser.role, 'Verified Lab Result', 'Lab Release', `Lab order ${lab.orderNumber} reviewed & verified`, lab.mrn);
      notifyListeners();
      return lab;
    }
    throw new Error('Lab order not found');
  }

  // 9. Billing
  async getInvoices(filters?: { patientId?: string; mrn?: string; status?: string }): Promise<BillInvoice[]> {
    try {
      const q = new URLSearchParams();
      if (filters?.patientId) q.set('patientId', filters.patientId);
      if (filters?.mrn) q.set('mrn', filters.mrn);
      if (filters?.status) q.set('status', filters.status);
      const url = filters && Object.keys(filters).length > 0
        ? `/api/billing/invoices?${q.toString()}`
        : '/api/billing';
      const res = await fetch(url, {
        headers: this.getAuthHeaders()
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success) return json.data;
      }
    } catch {
      // fallback
    }

    let result = [...this.localInvoices];
    if (filters?.patientId) result = result.filter((i) => i.patientId === filters.patientId);
    if (filters?.mrn) result = result.filter((i) => i.mrn === filters.mrn);
    if (filters?.status) result = result.filter((i) => i.status === filters.status);
    return result;
  }

  async createInvoice(data: Partial<BillInvoice>): Promise<BillInvoice> {
    const currentUser = this.getCurrentUser();
    try {
      const res = await fetch('/api/billing', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...this.getAuthHeaders()
        },
        body: JSON.stringify(data)
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          this.localInvoices.unshift(json.data);
          save('invoices', this.localInvoices);
          notifyListeners();
          return json.data;
        }
      }
    } catch {
      // fallback
    }

    const items = data.items || [];
    const subtotal = items.reduce((acc, i) => acc + i.total, 0);
    const totalAmount = data.totalAmount || subtotal;
    const copay = data.copayPatient !== undefined ? data.copayPatient : totalAmount;

    const newInv: BillInvoice = {
      id: `inv-${Date.now()}`,
      invoiceNumber: `INV-2026-${Math.floor(1000 + Math.random() * 9000)}`,
      patientId: data.patientId || '',
      patientName: data.patientName || 'Patient',
      mrn: data.mrn || 'MRN-UNKNOWN',
      admissionDate: data.admissionDate || new Date().toISOString(),
      dischargeDate: data.dischargeDate,
      items,
      subtotal,
      insuranceCovered: 0,
      copayPatient: copay,
      totalAmount,
      paymentStatus: data.paymentStatus || 'unpaid',
      createdAt: new Date().toISOString()
    };

    this.localInvoices.unshift(newInv);
    save('invoices', this.localInvoices);
    this.addAuditLog(currentUser.name, currentUser.role, 'Generated Inpatient Bill', 'Billing Clearance', `Invoice ${newInv.invoiceNumber} created for $${subtotal}`, newInv.mrn);
    notifyListeners();
    return newInv;
  }

  async updateInvoiceStatus(id: string, paymentStatus: BillInvoice['paymentStatus'], claimStatus?: BillInvoice['insuranceClaimStatus']): Promise<void> {
    const currentUser = this.getCurrentUser();
    try {
      await fetch(`/api/billing/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...this.getAuthHeaders()
        },
        body: JSON.stringify({ paymentStatus, insuranceClaimStatus: claimStatus })
      });
    } catch {
      // fallback
    }
    const idx = this.localInvoices.findIndex((i) => i.id === id);
    if (idx !== -1) {
      this.localInvoices[idx].paymentStatus = paymentStatus;
      if (claimStatus) this.localInvoices[idx].insuranceClaimStatus = claimStatus;
      save('invoices', this.localInvoices);
      this.addAuditLog(currentUser.name, currentUser.role, 'Updated Payment Status', 'Billing Clearance', `Invoice ${this.localInvoices[idx].invoiceNumber} marked as ${paymentStatus}`, this.localInvoices[idx].mrn);
      notifyListeners();
    }
  }

  async getInvoiceById(id: string): Promise<BillInvoice | null> {
    try {
      const res = await fetch(`/api/billing/invoices/${id}`, {
        headers: this.getAuthHeaders()
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success) return json.data;
      }
    } catch {
      // fallback
    }
    return this.localInvoices.find((i) => i.id === id) || null;
  }

  async issueInvoice(id: string): Promise<BillInvoice> {
    const res = await fetch(`/api/billing/invoices/${id}/issue`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.getAuthHeaders()
      }
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json.message || json.error || 'Failed to issue invoice');
    }
    notifyListeners();
    return json.data;
  }

  async getPatientAccount(patientIdOrMrn: string): Promise<PatientAccountSummary> {
    const res = await fetch(`/api/billing/patients/${patientIdOrMrn}/account`, {
      headers: this.getAuthHeaders()
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json.message || json.error || 'Failed to fetch patient account');
    }
    return json.data;
  }

  async getPatientBillableItems(patientIdOrMrn: string): Promise<BillableItem[]> {
    const res = await fetch(`/api/billing/patients/${patientIdOrMrn}/billable-items`, {
      headers: this.getAuthHeaders()
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json.message || json.error || 'Failed to fetch billable items');
    }
    return json.data;
  }

  async recordPayment(data: {
    patientId?: string;
    mrn?: string;
    amount: number;
    paymentMethod: string;
    referenceNumber?: string;
    notes?: string;
    idempotencyKey?: string;
    allocations?: Array<{ invoiceId: string; amount: number }>;
  }): Promise<Payment> {
    const res = await fetch('/api/billing/payments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.getAuthHeaders()
      },
      body: JSON.stringify(data)
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json.message || json.error || 'Failed to record payment');
    }
    notifyListeners();
    return json.data;
  }

  async allocatePayment(paymentId: string, allocations: Array<{ invoiceId: string; amount: number }>): Promise<Payment> {
    const res = await fetch(`/api/billing/payments/${paymentId}/allocate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.getAuthHeaders()
      },
      body: JSON.stringify({ allocations })
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json.message || json.error || 'Failed to allocate payment');
    }
    notifyListeners();
    return json.data;
  }

  async getPayments(filters?: { patientId?: string; mrn?: string; status?: string }): Promise<Payment[]> {
    const q = new URLSearchParams();
    if (filters?.patientId) q.set('patientId', filters.patientId);
    if (filters?.mrn) q.set('mrn', filters.mrn);
    if (filters?.status) q.set('status', filters.status);
    const res = await fetch(`/api/billing/payments?${q.toString()}`, {
      headers: this.getAuthHeaders()
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json.message || json.error || 'Failed to fetch payments');
    }
    return json.data;
  }

  async requestRefund(data: {
    type: 'refund' | 'credit_adjustment' | 'invoice_void';
    paymentId?: string;
    invoiceId?: string;
    patientId?: string;
    mrn?: string;
    amount: number;
    reason: string;
  }): Promise<RefundRequest> {
    const res = await fetch('/api/billing/refunds/request', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.getAuthHeaders()
      },
      body: JSON.stringify(data)
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json.message || json.error || 'Failed to submit refund request');
    }
    notifyListeners();
    return json.data;
  }

  async approveRefund(id: string, approvalNotes?: string): Promise<RefundRequest> {
    const res = await fetch(`/api/billing/refunds/${id}/approve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.getAuthHeaders()
      },
      body: JSON.stringify({ approvalNotes })
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json.message || json.error || 'Failed to approve refund');
    }
    notifyListeners();
    return json.data;
  }

  async rejectRefund(id: string, reason: string): Promise<RefundRequest> {
    const res = await fetch(`/api/billing/refunds/${id}/reject`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.getAuthHeaders()
      },
      body: JSON.stringify({ reason })
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json.message || json.error || 'Failed to reject refund');
    }
    notifyListeners();
    return json.data;
  }

  async executeRefund(
    id: string,
    data: { refundMethod?: string; externalReference?: string; notes?: string }
  ): Promise<{ refund: RefundRequest; ledgerEntry: RefundLedgerEntry }> {
    const res = await fetch(`/api/billing/refunds/${id}/execute`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.getAuthHeaders()
      },
      body: JSON.stringify(data)
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json.message || json.error || 'Failed to execute refund');
    }
    notifyListeners();
    return json.data;
  }

  async configureMedicationPrice(
    stockId: string,
    unitPrice: number,
    reason?: string
  ): Promise<MedicationStock> {
    const res = await fetch(`/api/pharmacy/inventory/${stockId}/price`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...this.getAuthHeaders()
      },
      body: JSON.stringify({ unitPrice, reason })
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json.message || json.error || 'Failed to configure medication price');
    }
    notifyListeners();
    return json.data;
  }

  async getRefundRequests(filters?: { status?: string; patientId?: string; mrn?: string }): Promise<RefundRequest[]> {
    const q = new URLSearchParams();
    if (filters?.status) q.set('status', filters.status);
    if (filters?.patientId) q.set('patientId', filters.patientId);
    if (filters?.mrn) q.set('mrn', filters.mrn);
    const res = await fetch(`/api/billing/refunds?${q.toString()}`, {
      headers: this.getAuthHeaders()
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json.message || json.error || 'Failed to fetch refund requests');
    }
    return json.data;
  }

  async getDailyCollectionReport(startDate?: string, endDate?: string, paymentMethod?: string): Promise<DailyCollectionReport> {
    const q = new URLSearchParams();
    if (startDate) q.set('startDate', startDate);
    if (endDate) q.set('endDate', endDate);
    if (paymentMethod) q.set('paymentMethod', paymentMethod);
    const res = await fetch(`/api/billing/reports/daily-collection?${q.toString()}`, {
      headers: this.getAuthHeaders()
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json.message || json.error || 'Failed to fetch collection report');
    }
    return json.data;
  }

  async getOutstandingReceivablesReport(): Promise<OutstandingReceivablesReport> {
    const res = await fetch('/api/billing/reports/outstanding-receivables', {
      headers: this.getAuthHeaders()
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json.message || json.error || 'Failed to fetch receivables report');
    }
    return json.data;
  }

  // 10. Audit Logs
  async getAuditLogs(): Promise<ClinicalAuditLog[]> {
    try {
      const res = await fetch('/api/audit');
      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          this.localAuditLogs = json.data;
          save('audit', this.localAuditLogs);
          return json.data;
        }
      }
    } catch {
      // fallback
    }
    return this.localAuditLogs;
  }

  private addAuditLog(actor: string, role: string, action: string, category: ClinicalAuditLog['category'], details: string, patientMrn?: string) {
    const log: ClinicalAuditLog = {
      id: `log-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      timestamp: new Date().toISOString(),
      actor,
      role,
      action,
      category,
      details,
      patientMrn
    };
    this.localAuditLogs.unshift(log);
    save('audit', this.localAuditLogs);
  }

  // ==========================================
  // AYURVEDIC CLINICAL & OPERATIONS METHODS
  // ==========================================

  async getConsultations(): Promise<Consultation[]> {
    try {
      const res = await fetch('/api/consultations', {
        headers: this.getAuthHeaders()
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          this.localConsultations = json.data;
          save('consultations', this.localConsultations);
          return json.data;
        }
      }
    } catch {
      // fallback
    }
    return this.localConsultations;
  }

  async createConsultation(consultation: Partial<Consultation>): Promise<Consultation> {
    const cur = this.getCurrentUser();
    const newCon: Consultation = {
      id: `con-${Date.now()}`,
      consultationNumber: `CON-2026-00${Math.floor(50 + Math.random() * 50)}`,
      patientId: consultation.patientId || '',
      patientName: consultation.patientName || 'Registered Patient',
      patientMrn: consultation.patientMrn || '',
      doctorId: consultation.doctorId || cur.id,
      doctorName: consultation.doctorName || cur.name,
      appointmentId: consultation.appointmentId,
      dateTime: new Date().toISOString(),
      chiefComplaint: consultation.chiefComplaint || 'Clinical evaluation',
      duration: consultation.duration || '40 mins',
      presentIllness: consultation.presentIllness || 'Assessed doshic state',
      vitals: consultation.vitals,
      ayurvedicAssessment: consultation.ayurvedicAssessment || {
        prakriti: { vata: 40, pitta: 40, kapha: 20, dominant: 'Vata-Pitta' },
        vikriti: { vata: 55, pitta: 30, kapha: 15, primaryImbalance: 'Vata aggravation in joints' },
        agni: 'Vishama (Irregular)',
        ama: 'Madhyama (Moderate)',
        koshtha: 'Madhyama (Moderate / Regular)',
        nadi: 'Sarpa gati',
        jihva: 'Mild Ama coating',
        nidra: 'Samyak (Sound/Restful)',
        ahara: 'Normal diet',
        vihara: 'Moderate',
        recordedAt: new Date().toISOString()
      },
      classicalDiagnosis: consultation.classicalDiagnosis || 'Vata Vyadhi with Sama Agni',
      westernCorrelation: consultation.westernCorrelation,
      treatmentRecommendations: consultation.treatmentRecommendations || 'Deepana Pachana regimen',
      recommendedTherapies: consultation.recommendedTherapies || ['Abhyanga (Herbal Full Body Massage)'],
      prescriptions: consultation.prescriptions || ['Triphala Churna 5g with warm water'],
      status: 'completed',
      clinicalNotes: consultation.clinicalNotes || 'Consultation complete.',
      completedAt: new Date().toISOString()
    };

    try {
      const res = await fetch('/api/consultations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...this.getAuthHeaders()
        },
        body: JSON.stringify(newCon)
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          this.localConsultations.unshift(json.data);
          save('consultations', this.localConsultations);
          notifyListeners();
          return json.data;
        }
      }
    } catch {
      // fallback
    }

    this.localConsultations.unshift(newCon);
    save('consultations', this.localConsultations);
    this.addAuditLog(cur.name, cur.role, 'Completed Ayurvedic Consultation', 'EMR Access', `Consultation ${newCon.consultationNumber} for ${newCon.patientName}`, newCon.patientMrn);
    notifyListeners();
    return newCon;
  }

  async getTreatments(): Promise<TreatmentPlan[]> {
    try {
      const res = await fetch('/api/treatments', {
        headers: this.getAuthHeaders()
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          this.localTreatments = json.data;
          save('treatments', this.localTreatments);
          return json.data;
        }
      }
    } catch {
      // fallback
    }
    return this.localTreatments;
  }

  async createTreatmentPlan(plan: Partial<TreatmentPlan>): Promise<TreatmentPlan> {
    const cur = this.getCurrentUser();
    const newPlan: TreatmentPlan = {
      id: `tp-${Date.now()}`,
      planNumber: `TP-2026-00${Math.floor(40 + Math.random() * 50)}`,
      patientId: plan.patientId || '',
      patientName: plan.patientName || 'Registered Patient',
      patientMrn: plan.patientMrn || '',
      doctorId: plan.doctorId || cur.id,
      doctorName: plan.doctorName || cur.name,
      assignedTherapist: plan.assignedTherapist || 'Assigned Clinical Therapist',
      therapyType: plan.therapyType || 'Abhyanga (Herbal Full Body Massage)',
      clinicalObjective: plan.clinicalObjective || 'Therapeutic Dosha Balancing',
      oilOrFormulation: plan.oilOrFormulation || 'Sahacharadi Thailam',
      totalSessions: Number(plan.totalSessions) || 7,
      completedSessions: 0,
      frequency: plan.frequency || 'Daily',
      startDate: plan.startDate || new Date().toISOString().split('T')[0],
      endDate: plan.endDate || new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0],
      roomNumber: plan.roomNumber || 'Therapy Suite 01',
      status: 'active',
      notes: plan.notes || 'Initiated customized therapy plan.'
    };

    try {
      const res = await fetch('/api/treatments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...this.getAuthHeaders()
        },
        body: JSON.stringify(newPlan)
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          this.localTreatments.unshift(json.data);
          save('treatments', this.localTreatments);
          notifyListeners();
          return json.data;
        }
      }
    } catch {
      // fallback
    }

    this.localTreatments.unshift(newPlan);
    save('treatments', this.localTreatments);
    this.addAuditLog(cur.name, cur.role, 'Created Treatment Plan', 'EMR Access', `Plan ${newPlan.planNumber} (${newPlan.therapyType}) for ${newPlan.patientName}`, newPlan.patientMrn);
    notifyListeners();
    return newPlan;
  }

  async updateTreatmentPlan(id: string, updates: Partial<TreatmentPlan>): Promise<TreatmentPlan> {
    const index = this.localTreatments.findIndex((t) => t.id === id);
    if (index !== -1) {
      this.localTreatments[index] = { ...this.localTreatments[index], ...updates };
      save('treatments', this.localTreatments);
      notifyListeners();
      try {
        await fetch(`/api/treatments/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', ...this.getAuthHeaders() },
          body: JSON.stringify(updates)
        });
      } catch {
        // fallback
      }
      return this.localTreatments[index];
    }
    throw new Error('Treatment plan not found');
  }

  async getPanchakarmaCourses(): Promise<PanchakarmaCourse[]> {
    try {
      const res = await fetch('/api/panchakarma', {
        headers: this.getAuthHeaders()
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          this.localPanchakarma = json.data;
          save('panchakarma', this.localPanchakarma);
          return json.data;
        }
      }
    } catch {
      // fallback
    }
    return this.localPanchakarma;
  }

  async createPanchakarmaCourse(course: Partial<PanchakarmaCourse>): Promise<PanchakarmaCourse> {
    const cur = this.getCurrentUser();
    const newCourse: PanchakarmaCourse = {
      id: `pk-${Date.now()}`,
      courseNumber: `PK-2026-00${Math.floor(20 + Math.random() * 50)}`,
      patientId: course.patientId || '',
      patientName: course.patientName || 'Patient',
      patientMrn: course.patientMrn || '',
      vaidyaName: course.vaidyaName || `${cur.name} & Vaidya Team`,
      protocol: course.protocol || 'Virechana (Therapeutic Purgation - Pitta Cleansing)',
      currentPhase: 'Purvakarma (Prep/Snehana-Swedana)',
      startDate: course.startDate || new Date().toISOString().split('T')[0],
      expectedEndDate: course.expectedEndDate || new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0],
      totalDays: Number(course.totalDays) || 14,
      completedDays: 1,
      dietaryPrescription: course.dietaryPrescription || 'Samsarjana Krama protocol',
      status: 'Active',
      dailySessions: [
        {
          day: 1,
          date: new Date().toISOString().split('T')[0],
          phase: 'Purvakarma (Prep/Snehana-Swedana)',
          procedureName: 'Preparatory Deepana-Pachana & Snehana',
          therapist: 'Assigned Clinical Therapist',
          bloodPressure: '124/80',
          pulseRate: '72 bpm',
          appetiteAssessment: 'Normal',
          bowelStatus: 'Normal formed',
          observations: 'Initial session commenced successfully.',
          status: 'completed'
        }
      ],
      dischargeNotes: course.dischargeNotes
    };

    try {
      const res = await fetch('/api/panchakarma', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...this.getAuthHeaders()
        },
        body: JSON.stringify(newCourse)
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          this.localPanchakarma.unshift(json.data);
          save('panchakarma', this.localPanchakarma);
          notifyListeners();
          return json.data;
        }
      }
    } catch {
      // fallback
    }

    this.localPanchakarma.unshift(newCourse);
    save('panchakarma', this.localPanchakarma);
    this.addAuditLog(cur.name, cur.role, 'Created Panchakarma Course', 'EMR Access', `Course ${newCourse.courseNumber} (${newCourse.protocol}) for ${newCourse.patientName}`, newCourse.patientMrn);
    notifyListeners();
    return newCourse;
  }

  async recordPanchakarmaSession(courseId: string, session: any): Promise<PanchakarmaCourse> {
    const course = this.localPanchakarma.find((pk) => pk.id === courseId);
    if (!course) throw new Error('Course not found');
    course.dailySessions.push(session);
    course.completedDays = course.dailySessions.filter((s) => s.status === 'completed').length;
    if (course.completedDays >= course.totalDays) {
      course.status = 'Completed';
    }
    save('panchakarma', this.localPanchakarma);
    notifyListeners();
    try {
      await fetch(`/api/panchakarma/${courseId}/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...this.getAuthHeaders() },
        body: JSON.stringify(session)
      });
    } catch {
      // fallback
    }
    return course;
  }

  async getStockMovements(): Promise<StockMovement[]> {
    try {
      const res = await fetch('/api/stock-movements');
      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          this.localStockMovements = json.data;
          save('stock_movements', this.localStockMovements);
          return json.data;
        }
      }
    } catch {
      // fallback
    }
    return this.localStockMovements;
  }

  async createStockMovement(movement: Partial<StockMovement>): Promise<StockMovement> {
    const cur = this.getCurrentUser();
    const newMove: StockMovement = {
      id: `sm-${Date.now()}`,
      timestamp: new Date().toISOString(),
      medicineId: movement.medicineId || 'med-ayur-01',
      medicineName: movement.medicineName || 'Sahacharadi Thailam',
      batchNumber: movement.batchNumber || 'AY-BATCH',
      type: movement.type || 'Audit Adjustment',
      quantityDelta: Number(movement.quantityDelta) || 0,
      remainingQuantity: Number(movement.remainingQuantity) || 10,
      actor: cur.name,
      referenceNumber: movement.referenceNumber || `REF-${Date.now()}`,
      notes: movement.notes || 'Movement recorded'
    };

    try {
      const res = await fetch('/api/stock-movements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...this.getAuthHeaders() },
        body: JSON.stringify(newMove)
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          this.localStockMovements.unshift(json.data);
          save('stock_movements', this.localStockMovements);
          notifyListeners();
          return json.data;
        }
      }
    } catch {
      // fallback
    }

    this.localStockMovements.unshift(newMove);
    save('stock_movements', this.localStockMovements);
    notifyListeners();
    return newMove;
  }

  async getSuppliers(): Promise<PharmacySupplier[]> {
    try {
      const res = await fetch('/api/suppliers');
      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          this.localSuppliers = json.data;
          save('suppliers', this.localSuppliers);
          return json.data;
        }
      }
    } catch {
      // fallback
    }
    return this.localSuppliers;
  }

  // ==========================================
  // PHASE 3: CLINICAL OPERATIONS
  // ==========================================

  async getDoctorDashboard(practitionerId?: string): Promise<DoctorDashboardMetrics> {
    const qs = practitionerId ? `?practitionerId=${encodeURIComponent(practitionerId)}` : '';
    const res = await fetch(`/api/clinical/doctor/dashboard${qs}`, {
      headers: this.getAuthHeaders()
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.message || 'Failed to fetch doctor dashboard');
    return json.data;
  }

  async getVaidyaDashboard(practitionerId?: string): Promise<VaidyaDashboardMetrics> {
    const qs = practitionerId ? `?practitionerId=${encodeURIComponent(practitionerId)}` : '';
    const res = await fetch(`/api/clinical/vaidya/dashboard${qs}`, {
      headers: this.getAuthHeaders()
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.message || 'Failed to fetch vaidya dashboard');
    return json.data;
  }

  async getDoctorQueue(params?: { date?: string; practitionerId?: string }): Promise<QueueItem[]> {
    const queryParams = new URLSearchParams();
    if (params?.date) queryParams.set('date', params.date);
    if (params?.practitionerId) queryParams.set('practitionerId', params.practitionerId);
    const qs = queryParams.toString();
    const res = await fetch(`/api/clinical/doctor/queue${qs ? `?${qs}` : ''}`, {
      headers: this.getAuthHeaders()
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.message || 'Failed to fetch doctor queue');
    return json.data;
  }

  async getVaidyaQueue(params?: { date?: string; practitionerId?: string }): Promise<QueueItem[]> {
    const queryParams = new URLSearchParams();
    if (params?.date) queryParams.set('date', params.date);
    if (params?.practitionerId) queryParams.set('practitionerId', params.practitionerId);
    const qs = queryParams.toString();
    const res = await fetch(`/api/clinical/vaidya/queue${qs ? `?${qs}` : ''}`, {
      headers: this.getAuthHeaders()
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.message || 'Failed to fetch vaidya queue');
    return json.data;
  }

  async initiateClinicalEncounter(data: {
    patientId: string;
    appointmentId?: string;
    encounterType?: string;
    reasonForVisit?: string;
  }): Promise<ClinicalEncounter> {
    const res = await fetch('/api/clinical/encounters/initiate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.getAuthHeaders()
      },
      body: JSON.stringify(data)
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err: any = new Error(json.message || 'Failed to initiate encounter');
      err.status = res.status;
      err.code = json.code;
      throw err;
    }
    return json.data;
  }

  async getClinicalEncounter(id: string): Promise<ClinicalEncounter> {
    const res = await fetch(`/api/clinical/encounters/${encodeURIComponent(id)}`, {
      headers: this.getAuthHeaders()
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.message || 'Failed to fetch encounter');
    return json.data;
  }

  async completeClinicalEncounter(id: string): Promise<ClinicalEncounter> {
    const res = await fetch(`/api/clinical/encounters/${encodeURIComponent(id)}/complete`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.getAuthHeaders()
      }
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err: any = new Error(json.message || 'Failed to complete encounter');
      err.status = res.status;
      err.code = json.code;
      throw err;
    }
    return json.data;
  }

  async recordClinicalVitals(encounterId: string, data: any): Promise<ClinicalVitals> {
    const res = await fetch(`/api/clinical/encounters/${encodeURIComponent(encounterId)}/vitals`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.getAuthHeaders()
      },
      body: JSON.stringify(data)
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err: any = new Error(json.message || 'Failed to record vitals');
      err.status = res.status;
      err.code = json.code;
      throw err;
    }
    return json.data;
  }

  async saveClinicalAssessment(encounterId: string, data: any): Promise<ClinicalAssessment> {
    const res = await fetch(`/api/clinical/encounters/${encodeURIComponent(encounterId)}/assessment`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.getAuthHeaders()
      },
      body: JSON.stringify(data)
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err: any = new Error(json.message || 'Failed to save assessment');
      err.status = res.status;
      err.code = json.code;
      throw err;
    }
    return json.data;
  }

  async addClinicalDiagnosis(encounterId: string, data: any): Promise<ClinicalDiagnosis> {
    const res = await fetch(`/api/clinical/encounters/${encodeURIComponent(encounterId)}/diagnoses`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.getAuthHeaders()
      },
      body: JSON.stringify(data)
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err: any = new Error(json.message || 'Failed to add diagnosis');
      err.status = res.status;
      err.code = json.code;
      throw err;
    }
    return json.data;
  }

  async orderClinicalInvestigation(encounterId: string, data: any): Promise<LabOrder> {
    const res = await fetch(`/api/clinical/encounters/${encodeURIComponent(encounterId)}/investigations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.getAuthHeaders()
      },
      body: JSON.stringify(data)
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err: any = new Error(json.message || 'Failed to order investigation');
      err.status = res.status;
      err.code = json.code;
      throw err;
    }
    return json.data;
  }

  async recordInvestigationResult(orderId: string, data: any): Promise<LabOrder> {
    const res = await fetch(`/api/clinical/investigations/${encodeURIComponent(orderId)}/results`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.getAuthHeaders()
      },
      body: JSON.stringify(data)
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err: any = new Error(json.message || 'Failed to record results');
      err.status = res.status;
      err.code = json.code;
      throw err;
    }
    return json.data;
  }

  async reviewClinicalInvestigation(orderId: string, data: any): Promise<LabOrder> {
    const res = await fetch(`/api/clinical/investigations/${encodeURIComponent(orderId)}/review`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.getAuthHeaders()
      },
      body: JSON.stringify(data)
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err: any = new Error(json.message || 'Failed to review investigation');
      err.status = res.status;
      err.code = json.code;
      throw err;
    }
    return json.data;
  }

  async prescribeClinicalMedication(encounterId: string, data: any): Promise<Prescription> {
    const res = await fetch(`/api/clinical/encounters/${encodeURIComponent(encounterId)}/prescriptions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.getAuthHeaders()
      },
      body: JSON.stringify(data)
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err: any = new Error(json.message || 'Failed to prescribe medication');
      err.status = res.status;
      err.code = json.code;
      throw err;
    }
    return json.data;
  }

  async recordPrakritiAssessment(encounterId: string, data: any): Promise<PrakritiAssessment> {
    const res = await fetch(`/api/clinical/encounters/${encodeURIComponent(encounterId)}/prakriti`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.getAuthHeaders()
      },
      body: JSON.stringify(data)
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err: any = new Error(json.message || 'Failed to record Prakriti');
      err.status = res.status;
      err.code = json.code;
      throw err;
    }
    return json.data;
  }

  async recordVikritiAssessment(encounterId: string, data: any): Promise<VikritiAssessment> {
    const res = await fetch(`/api/clinical/encounters/${encodeURIComponent(encounterId)}/vikriti`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.getAuthHeaders()
      },
      body: JSON.stringify(data)
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err: any = new Error(json.message || 'Failed to record Vikriti');
      err.status = res.status;
      err.code = json.code;
      throw err;
    }
    return json.data;
  }

  async recordDoshaEvaluation(encounterId: string, data: any): Promise<DoshaEvaluation> {
    const res = await fetch(`/api/clinical/encounters/${encodeURIComponent(encounterId)}/dosha-evaluation`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.getAuthHeaders()
      },
      body: JSON.stringify(data)
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err: any = new Error(json.message || 'Failed to record Dosha evaluation');
      err.status = res.status;
      err.code = json.code;
      throw err;
    }
    return json.data;
  }

  async createAyurvedicTreatmentPlan(encounterId: string, data: any): Promise<TreatmentPlan> {
    const res = await fetch(`/api/clinical/encounters/${encodeURIComponent(encounterId)}/treatment-plans`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.getAuthHeaders()
      },
      body: JSON.stringify(data)
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err: any = new Error(json.message || 'Failed to create treatment plan');
      err.status = res.status;
      err.code = json.code;
      throw err;
    }
    return json.data;
  }

  async createPanchakarmaReferral(encounterId: string, data: any): Promise<PanchakarmaReferral> {
    const res = await fetch(`/api/clinical/encounters/${encodeURIComponent(encounterId)}/panchakarma-referrals`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.getAuthHeaders()
      },
      body: JSON.stringify(data)
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err: any = new Error(json.message || 'Failed to create Panchakarma referral');
      err.status = res.status;
      err.code = json.code;
      throw err;
    }
    return json.data;
  }

  async getPatientClinicalHistory(patientId: string): Promise<PatientClinicalHistory> {
    const res = await fetch(`/api/clinical/patients/${encodeURIComponent(patientId)}/history`, {
      headers: this.getAuthHeaders()
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.message || 'Failed to fetch patient history');
    return json.data;
  }

  // ==========================================
  // PHASE 7: THERAPY ROOM OPERATIONS
  // ==========================================

  async getTherapyRooms(params?: { operationalStatus?: string; roomType?: string; isActive?: boolean }): Promise<TherapyRoom[]> {
    const query = new URLSearchParams();
    if (params?.operationalStatus) query.set('operationalStatus', params.operationalStatus);
    if (params?.roomType) query.set('roomType', params.roomType);
    if (params?.isActive !== undefined) query.set('isActive', String(params.isActive));

    const res = await fetch(`/api/therapy-rooms?${query.toString()}`, {
      headers: this.getAuthHeaders()
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.message || 'Failed to fetch therapy rooms');
    return json.data;
  }

  async getTherapyRoomById(id: string): Promise<TherapyRoom> {
    const res = await fetch(`/api/therapy-rooms/${encodeURIComponent(id)}`, {
      headers: this.getAuthHeaders()
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.message || 'Failed to fetch therapy room');
    return json.data;
  }

  async createTherapyRoom(data: Partial<TherapyRoom>): Promise<TherapyRoom> {
    const res = await fetch('/api/therapy-rooms', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.getAuthHeaders()
      },
      body: JSON.stringify(data)
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err: any = new Error(json.message || 'Failed to create therapy room');
      err.status = res.status;
      err.code = json.code;
      throw err;
    }
    return json.data;
  }

  async updateTherapyRoom(id: string, data: Partial<TherapyRoom>): Promise<TherapyRoom> {
    const res = await fetch(`/api/therapy-rooms/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...this.getAuthHeaders()
      },
      body: JSON.stringify(data)
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err: any = new Error(json.message || 'Failed to update therapy room');
      err.status = res.status;
      err.code = json.code;
      throw err;
    }
    return json.data;
  }

  async enterRoomMaintenance(id: string, reason: string): Promise<TherapyRoom> {
    const res = await fetch(`/api/therapy-rooms/${encodeURIComponent(id)}/maintenance/enter`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.getAuthHeaders()
      },
      body: JSON.stringify({ reason })
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err: any = new Error(json.message || 'Failed to enter maintenance');
      err.status = res.status;
      err.code = json.code;
      throw err;
    }
    return json.data;
  }

  async exitRoomMaintenance(id: string): Promise<TherapyRoom> {
    const res = await fetch(`/api/therapy-rooms/${encodeURIComponent(id)}/maintenance/exit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.getAuthHeaders()
      },
      body: JSON.stringify({})
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err: any = new Error(json.message || 'Failed to exit maintenance');
      err.status = res.status;
      err.code = json.code;
      throw err;
    }
    return json.data;
  }

  async recordRoomSanitization(id: string, sanitizedByStaffId?: string, notes?: string): Promise<TherapyRoom> {
    const res = await fetch(`/api/therapy-rooms/${encodeURIComponent(id)}/sanitize`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.getAuthHeaders()
      },
      body: JSON.stringify({ sanitizedByStaffId, notes })
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err: any = new Error(json.message || 'Failed to record sanitization');
      err.status = res.status;
      err.code = json.code;
      throw err;
    }
    return json.data;
  }

  async reconcileStaleRoom(id: string): Promise<TherapyRoom> {
    const res = await fetch(`/api/therapy-rooms/${encodeURIComponent(id)}/reconcile-stale`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.getAuthHeaders()
      },
      body: JSON.stringify({})
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err: any = new Error(json.message || 'Failed to reconcile stale room');
      err.status = res.status;
      err.code = json.code;
      throw err;
    }
    return json.data;
  }

  // ==========================================
  // PHASE 7: STAFF THERAPY AUTHORIZATIONS
  // ==========================================

  async getEligibleAdministeringStaff(): Promise<StaffMember[]> {
    const res = await fetch('/api/therapy-staff/eligible', {
      headers: this.getAuthHeaders()
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.message || 'Failed to fetch eligible therapy staff');
    return json.data;
  }

  async getResponsibleVaidyas(): Promise<StaffMember[]> {
    const res = await fetch('/api/therapy-staff/vaidyas', {
      headers: this.getAuthHeaders()
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.message || 'Failed to fetch responsible Vaidyas');
    return json.data;
  }

  async getStaffTherapyAuthorizations(params?: { staffId?: string; therapyType?: string; activeOnly?: boolean }): Promise<StaffTherapyAuthorization[]> {
    const query = new URLSearchParams();
    if (params?.staffId) query.set('staffId', params.staffId);
    if (params?.therapyType) query.set('therapyType', params.therapyType);
    if (params?.activeOnly !== undefined) query.set('activeOnly', String(params.activeOnly));

    const res = await fetch(`/api/staff-therapy-authorizations?${query.toString()}`, {
      headers: this.getAuthHeaders()
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.message || 'Failed to fetch staff therapy authorizations');
    return json.data;
  }

  async createStaffTherapyAuthorization(data: { staffId: string; therapyType: string; notes?: string; expiresAt?: string }): Promise<StaffTherapyAuthorization> {
    const res = await fetch('/api/staff-therapy-authorizations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.getAuthHeaders()
      },
      body: JSON.stringify(data)
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err: any = new Error(json.message || 'Failed to authorize staff for therapy');
      err.status = res.status;
      err.code = json.code;
      throw err;
    }
    return json.data;
  }

  async revokeStaffTherapyAuthorization(id: string, reason: string): Promise<StaffTherapyAuthorization> {
    const res = await fetch(`/api/staff-therapy-authorizations/${encodeURIComponent(id)}/revoke`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.getAuthHeaders()
      },
      body: JSON.stringify({ reason })
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err: any = new Error(json.message || 'Failed to revoke authorization');
      err.status = res.status;
      err.code = json.code;
      throw err;
    }
    return json.data;
  }

  // ==========================================
  // PHASE 7: THERAPY SESSIONS
  // ==========================================

  async getTherapySessions(params?: {
    status?: string;
    roomId?: string;
    administeringStaffId?: string;
    responsibleVaidyaId?: string;
    patientId?: string;
    treatmentPlanId?: string;
    panchakarmaCourseId?: string;
    fromDate?: string;
    toDate?: string;
  }): Promise<TherapySession[]> {
    const query = new URLSearchParams();
    if (params?.status) query.set('status', params.status);
    if (params?.roomId) query.set('roomId', params.roomId);
    if (params?.administeringStaffId) query.set('administeringStaffId', params.administeringStaffId);
    if (params?.responsibleVaidyaId) query.set('responsibleVaidyaId', params.responsibleVaidyaId);
    if (params?.patientId) query.set('patientId', params.patientId);
    if (params?.treatmentPlanId) query.set('treatmentPlanId', params.treatmentPlanId);
    if (params?.panchakarmaCourseId) query.set('panchakarmaCourseId', params.panchakarmaCourseId);
    if (params?.fromDate) query.set('fromDate', params.fromDate);
    if (params?.toDate) query.set('toDate', params.toDate);

    const res = await fetch(`/api/therapy-sessions?${query.toString()}`, {
      headers: this.getAuthHeaders()
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.message || 'Failed to fetch therapy sessions');
    return json.data;
  }

  async getTherapySessionById(id: string): Promise<TherapySession> {
    const res = await fetch(`/api/therapy-sessions/${encodeURIComponent(id)}`, {
      headers: this.getAuthHeaders()
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.message || 'Failed to fetch therapy session');
    return json.data;
  }

  async scheduleTherapySession(data: {
    patientId: string;
    roomId: string;
    administeringStaffId: string;
    responsibleVaidyaId: string;
    therapyType: string;
    scheduledStartTime: string;
    scheduledEndTime: string;
    treatmentPlanId?: string;
    panchakarmaCourseId?: string;
    sessionNumber?: number;
    billingMode?: string;
    tariffId?: string;
    turnaroundBufferMinutes?: number;
    clinicalNotes?: string;
  }): Promise<TherapySession> {
    const res = await fetch('/api/therapy-sessions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.getAuthHeaders()
      },
      body: JSON.stringify(data)
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err: any = new Error(json.message || 'Failed to schedule therapy session');
      err.status = res.status;
      err.code = json.code;
      throw err;
    }
    return json.data;
  }

  async rescheduleTherapySession(id: string, data: {
    scheduledStartTime: string;
    scheduledEndTime: string;
    roomId?: string;
    administeringStaffId?: string;
    responsibleVaidyaId?: string;
    reason?: string;
  }): Promise<TherapySession> {
    const res = await fetch(`/api/therapy-sessions/${encodeURIComponent(id)}/reschedule`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...this.getAuthHeaders()
      },
      body: JSON.stringify(data)
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err: any = new Error(json.message || 'Failed to reschedule therapy session');
      err.status = res.status;
      err.code = json.code;
      throw err;
    }
    return json.data;
  }

  async cancelTherapySession(id: string, cancellationReason: string): Promise<TherapySession> {
    const res = await fetch(`/api/therapy-sessions/${encodeURIComponent(id)}/cancel`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.getAuthHeaders()
      },
      body: JSON.stringify({ cancellationReason })
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err: any = new Error(json.message || 'Failed to cancel therapy session');
      err.status = res.status;
      err.code = json.code;
      throw err;
    }
    return json.data;
  }

  async noShowTherapySession(id: string, notes?: string): Promise<TherapySession> {
    const res = await fetch(`/api/therapy-sessions/${encodeURIComponent(id)}/no-show`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.getAuthHeaders()
      },
      body: JSON.stringify({ notes })
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err: any = new Error(json.message || 'Failed to mark therapy session as no-show');
      err.status = res.status;
      err.code = json.code;
      throw err;
    }
    return json.data;
  }

  async startTherapySession(id: string, data: {
    preAssessment: PreProcedureAssessment;
    administeringStaffId?: string;
  }): Promise<TherapySession> {
    const res = await fetch(`/api/therapy-sessions/${encodeURIComponent(id)}/start`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.getAuthHeaders()
      },
      body: JSON.stringify(data)
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err: any = new Error(json.message || 'Failed to start therapy session');
      err.status = res.status;
      err.code = json.code;
      throw err;
    }
    return json.data;
  }

  async completeTherapySession(id: string, data: {
    postAssessment: PostProcedureAssessment;
    procedureNotes?: string;
    complications?: string;
  }): Promise<TherapySession> {
    const res = await fetch(`/api/therapy-sessions/${encodeURIComponent(id)}/complete`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.getAuthHeaders()
      },
      body: JSON.stringify(data)
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err: any = new Error(json.message || 'Failed to complete therapy session');
      err.status = res.status;
      err.code = json.code;
      throw err;
    }
    return json.data;
  }

  async abortTherapySession(id: string, data: {
    clinicalNotes: string;
    postAssessment?: Partial<PostProcedureAssessment>;
    complications?: string;
  }): Promise<TherapySession> {
    const res = await fetch(`/api/therapy-sessions/${encodeURIComponent(id)}/abort`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.getAuthHeaders()
      },
      body: JSON.stringify(data)
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err: any = new Error(json.message || 'Failed to abort therapy session');
      err.status = res.status;
      err.code = json.code;
      throw err;
    }
    return json.data;
  }

  // ==========================================
  // PHASE 7: PANCHAKARMA REFERRALS & PHASES
  // ==========================================

  async getPanchakarmaReferrals(params?: { patientId?: string; status?: string }): Promise<PanchakarmaReferral[]> {
    const query = new URLSearchParams();
    if (params?.patientId) query.set('patientId', params.patientId);
    if (params?.status) query.set('status', params.status);

    const res = await fetch(`/api/panchakarma-referrals?${query.toString()}`, {
      headers: this.getAuthHeaders()
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.message || 'Failed to fetch Panchakarma referrals');
    return json.data;
  }

  async getPanchakarmaReferralById(id: string): Promise<PanchakarmaReferral> {
    const res = await fetch(`/api/panchakarma-referrals/${encodeURIComponent(id)}`, {
      headers: this.getAuthHeaders()
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.message || 'Failed to fetch Panchakarma referral');
    return json.data;
  }

  async convertReferralToCourse(referralId: string, data: {
    attendingVaidyaId: string;
    startDate: string;
    primaryProcedure: string;
    totalPlannedDays: number;
    billingMode?: string;
    packageTariffId?: string;
    customPackageAmount?: number;
    dietaryInstructions?: string;
    lifestyleRestrictions?: string;
    dailyRegimenNotes?: string;
  }): Promise<PanchakarmaCourse> {
    const res = await fetch(`/api/panchakarma-referrals/${encodeURIComponent(referralId)}/convert`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.getAuthHeaders()
      },
      body: JSON.stringify(data)
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err: any = new Error(json.message || 'Failed to convert referral to course');
      err.status = res.status;
      err.code = json.code;
      throw err;
    }
    return json.data;
  }

  async advancePanchakarmaPhase(courseId: string, data: {
    toPhase: string;
    clinicalRationaleNotes: string;
    vitalsAtTransition?: any;
    samayakLakshanasObserved?: string[];
    asamyakLakshanasObserved?: string[];
  }): Promise<{ course: PanchakarmaCourse; transition: PanchakarmaPhaseTransition }> {
    const res = await fetch(`/api/panchakarma-courses/${encodeURIComponent(courseId)}/advance-phase`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.getAuthHeaders()
      },
      body: JSON.stringify(data)
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err: any = new Error(json.message || 'Failed to advance Panchakarma phase');
      err.status = res.status;
      err.code = json.code;
      throw err;
    }
    return json.data;
  }

  async pausePanchakarmaCourse(courseId: string, reason: string): Promise<PanchakarmaCourse> {
    const res = await fetch(`/api/panchakarma-courses/${encodeURIComponent(courseId)}/pause`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.getAuthHeaders()
      },
      body: JSON.stringify({ reason })
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err: any = new Error(json.message || 'Failed to pause Panchakarma course');
      err.status = res.status;
      err.code = json.code;
      throw err;
    }
    return json.data;
  }

  async resumePanchakarmaCourse(courseId: string, reason?: string): Promise<PanchakarmaCourse> {
    const res = await fetch(`/api/panchakarma-courses/${encodeURIComponent(courseId)}/resume`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.getAuthHeaders()
      },
      body: JSON.stringify({ reason })
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err: any = new Error(json.message || 'Failed to resume Panchakarma course');
      err.status = res.status;
      err.code = json.code;
      throw err;
    }
    return json.data;
  }

  async terminatePanchakarmaCourse(courseId: string, reason: string): Promise<PanchakarmaCourse> {
    const res = await fetch(`/api/panchakarma-courses/${encodeURIComponent(courseId)}/terminate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.getAuthHeaders()
      },
      body: JSON.stringify({ reason })
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err: any = new Error(json.message || 'Failed to terminate Panchakarma course');
      err.status = res.status;
      err.code = json.code;
      throw err;
    }
    return json.data;
  }

  async getUnbilledTherapySessions(patientId?: string): Promise<TherapySession[]> {
    const query = new URLSearchParams();
    if (patientId) query.set('patientId', patientId);

    const res = await fetch(`/api/therapy-sessions/unbilled?${query.toString()}`, {
      headers: this.getAuthHeaders()
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.message || 'Failed to fetch unbilled therapy sessions');
    return json.data;
  }

  resetAll() {
    this.localPatients = [...INITIAL_PATIENTS];
    this.localTriage = [...INITIAL_TRIAGE];
    this.localDoctors = [...INITIAL_DOCTORS];
    this.localAppointments = [...INITIAL_APPOINTMENTS];
    this.localReminders = [...INITIAL_REMINDERS];
    this.localPrescriptions = [...INITIAL_PRESCRIPTIONS];
    this.localStock = [...INITIAL_MEDICATION_STOCK];
    this.localLabOrders = [...INITIAL_LAB_ORDERS];
    this.localInvoices = [...INITIAL_INVOICES];
    this.localAuditLogs = [...INITIAL_AUDIT_LOGS];
    this.localUsers = [...INITIAL_USERS];
    this.localConsultations = [...INITIAL_CONSULTATIONS];
    this.localTreatments = [...INITIAL_TREATMENT_PLANS];
    this.localPanchakarma = [...INITIAL_PANCHAKARMA_COURSES];
    this.localStockMovements = [...INITIAL_STOCK_MOVEMENTS];
    this.localSuppliers = [...INITIAL_SUPPLIERS];
    this.localStaff = [...INITIAL_STAFF];

    save('patients', this.localPatients);
    save('triage', this.localTriage);
    save('doctors', this.localDoctors);
    save('appointments', this.localAppointments);
    save('reminders', this.localReminders);
    save('prescriptions', this.localPrescriptions);
    save('stock', this.localStock);
    save('labs', this.localLabOrders);
    save('invoices', this.localInvoices);
    save('audit', this.localAuditLogs);
    save('users', this.localUsers);
    save('consultations', this.localConsultations);
    save('treatments', this.localTreatments);
    save('panchakarma', this.localPanchakarma);
    save('stock_movements', this.localStockMovements);
    save('suppliers', this.localSuppliers);
    save('staff', this.localStaff);
    notifyListeners();
  }
}

export const hospitalApi = new HospitalApiClient();
export const hospitalApiClient = hospitalApi;
