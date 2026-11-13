# Sahachara OS 2.0 — Comprehensive Engineering Audit & Discovery Report
## Document 03: Frontend Architecture, Page Inventory & Component Audit

---

### 1. Frontend Architecture & Design System Overview

The frontend is implemented as a Single-Page Application (SPA) built on **React 19.0.1** and bundled with **Vite 8.3.0**. The visual language closely replicates the **IBM Carbon Design System v11** (`white`, `g10` light, and `g100` dark themes), utilizing Carbon 16-column grid proportions, 48px header bars, Carbon typography (`IBM Plex Sans` and `IBM Plex Mono`), and standard status tags (`#0f62fe` blue, `#24a148` green, `#da1e28` red, `#8a3ffc` purple).

> [!NOTE]
> **Design System Implementation Method**: Rather than consuming official `@carbon/react` npm packages, the engineering team constructed a custom set of React components in `src/components/carbon/` using Tailwind CSS v4 classes mapped to CSS custom properties defined in `src/index.css`. The fidelity of the visual presentation is remarkably high, but it lacks Carbon's native accessibility features (ARIA live regions, strict keyboard navigation traps, focus management).

---

### 2. Complete Page & View Inventory

The application utilizes internal state routing driven by `activeView: string` in `src/App.tsx`. Below is an exhaustive audit of all fifteen view modules:

| View Name | File Path | Route / View ID | Purpose | Role Restrictions | Backend Integration Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **01. Overview Dashboard** | `src/views/OverviewDashboard.tsx` | `'overview'` | Executive KPI telemetry, queue status, and quick-action shortcuts | All authenticated roles | **Partially Integrated** (Uses `/api/overview`, but diagnostic health check is 100% mocked) |
| **02. Patients Master Directory** | `src/views/PatientsDirectoryView.tsx` | `'patients'` | Master EMR registry, patient dossiers, admission tracking, and PDF exports | Role-segmented (Patient role restricted to own MRN) | **Partially Integrated** (Calls `/api/patients`, but soft-delete only marks timestamp in-memory) |
| **03. Appointments Schedule** | `src/views/AppointmentsScheduleView.tsx` | `'appointments'` | Consultation booking, rescheduling, cancellations, and doctor availability | Role-segmented | **Partially Integrated** (Calls `/api/appointments`, but conflict prevention is missing) |
| **04. Consultations Workspace** | `src/views/ConsultationsWorkspaceView.tsx` | `'consultations'` | Rogi-Roga Pareeksha, Dosha analysis, Agni/Ama assessment, and notes | Doctor / Admin | **Partially Integrated** (Calls `/api/consultations`, but does not persist to Prisma PostgreSQL) |
| **05. Treatments Management** | `src/views/TreatmentsManagementView.tsx` | `'treatments'` | Chikitsa Upakrama courses (Abhyanga, Shirodhara, Basti) & session logs | Doctor / Nurse / Admin | **Partially Integrated** (Calls `/api/treatments`, in-memory session progression only) |
| **06. Panchakarma Suite** | `src/views/PanchakarmaManagementView.tsx` | `'panchakarma'` | 5 Shodhana protocols (Vamana, Virechana, etc.), phase tracking, daily vitals | Doctor / Nurse / Admin | **Partially Integrated** (Calls `/api/panchakarma`, daily sessions held in-memory array) |
| **07. Pharmacy & Formulary** | `src/views/PharmacyView.tsx` | `'pharmacy'` | E-Prescription queue, digital signatures, formulary inventory, and stock logs | Role-segmented (Sign: Doctor; Dispense: Nurse/Pharm) | **Partially Integrated** (Calls `/api/pharmacy/*`, digital signatures use pseudo-hash) |
| **08. Diagnostic Laboratory** | `src/views/LaboratoryView.tsx` | `'laboratory'` | Diagnostic test orders, panic value reporting, and digital approval signatures | Role-segmented (Sign: Lab Tech/Doctor) | **Partially Integrated** (Calls `/api/laboratory/*`, signatures use pseudo-hash) |
| **09. Billing & Insurance** | `src/views/BillingInsuranceView.tsx` | `'billing'` | Inpatient invoices, Ayush insurance claim clearance, and payment settlement | Admin / Patient | **Partially Integrated** (Calls `/api/billing/*`, currency discrepancy USD vs INR) |
| **10. Reports & Analytics** | `src/views/ReportsAnalyticsView.tsx` | `'reports'` | Doshic distribution, workforce utilization, financial aggregation, and CSV export | Doctor / Admin | **Mocked / Visual Only** (Date range filters do not filter underlying dataset) |
| **11. Doctors & Staff Directorate** | `src/views/DoctorsStaffView.tsx` | `'doctors'` | Clinical workforce roster, duty shifts, registration numbers, signing authority | Admin | **Partially Integrated** (Calls `/api/staff`, duty toggle mutates in-memory state) |
| **12. Settings & Configuration** | `src/views/SettingsWorkspaceView.tsx` | `'settings'` | Hospital profile, patient numbering sequences, theme, and staff PIN audit | Admin | **Mocked (Toast Only)** (Save buttons trigger UI notifications without API persistence) |
| **13. HIPAA Audit Log Trail** | `src/views/AuditLogView.tsx` | `'audit'` | Chronological ePHI access logs, compliance categorization, and CSV export | Admin | **Partially Integrated** (Calls `/api/audit`, checksum is an unauthenticated bitwise hash) |
| **14. RBAC Management** | `src/views/RbacManagementView.tsx` | `'rbac'` | Permission matrix visualization and instant user session switching | Admin | **Partially Integrated** (Instant session switching allows unrestricted privilege escalation) |
| **15. Authentication Screen** | `src/views/AuthScreenView.tsx` | `'login'` / `'activate'` | @sahachara.com staff login and security PIN first-time account activation | Public / Unauthenticated | **Partially Integrated** (Validates domain, but hardcoded backdoor password/PINs exist) |

---

### 3. Detailed View Audits & Discovered Deficiencies

#### 3.1 Overview Dashboard (`src/views/OverviewDashboard.tsx`)
- **Telemetry Discrepancy**: If the backend is running with zero consultations, the view renders hardcoded fallback counts (`consultations.length || 5`, `panchakarma.length || 5`, `prescriptions.length || 4`) in lines 82–84, misrepresenting actual operational metrics.
- **Diagnostic Tooling Mock (`handleRunDiagnostic` L95–115)**: The "Run System Diagnostic" button runs a 600ms `setTimeout` that outputs completely fabricated strings claiming:
  - `"NestJS REST API v1.0.0 (Mounted at /api/v1) - Healthy"` (There is no NestJS or `/api/v1` route).
  - `"PostgreSQL 16.2 / Prisma ORM - Active Connection Pool"` (Hardcoded string).
  - `"Better Auth Session Verified"` (There is no Better Auth engine).
  - `"Latency: 14ms"` (Hardcoded number).

#### 3.2 Reports & Analytics View (`src/views/ReportsAnalyticsView.tsx`)
- **Non-Functional Date Range Filters**: The header presents pills for `Today`, `7 Days`, `30 Days`, `This Month`, and `This Year` (L456–468). Selecting these options updates `dateRange` state, but **none of the chart datasets, aggregations, or summary cards filter their data by date**. Every metric calculates over the entire unfiltered array. The only effect of `dateRange` is its inclusion in the downloaded CSV filename.

#### 3.3 Settings Workspace View (`src/views/SettingsWorkspaceView.tsx`)
- **Non-Functional Save Handlers**:
  - Organization Profile Save (L396–400): Clicking "Save Organization Profile" executes `onNotify('Organization Profile Saved', ...)`. No HTTP request is sent; no state is stored in `localStorage` or the database.
  - System Configuration Save (L761–765): Saves document numbering prefixes (`SAH-`, `SAH-INV-`) purely via an ephemeral toast.
  - Clinician Profile Save (L808–812): Replaces credentials only in transient React state.

#### 3.4 Patient Master Registry (`src/views/PatientsDirectoryView.tsx`)
- **Duplicate Registration / Admission Buttons**: In lines 225–254, the actions column dynamically renders either a blue "Book Appt" button or a green "Register Patient" button based on `p.isRegistered`. However, both buttons invoke modals that overlap in functionality, leading to confusion between outpatient appointment booking and inpatient admission.

---

### 4. Modal Dialogues & Interaction Audit

The application contains 18 modal dialogue components located in `src/components/modals/`:

| Modal Component | File | Invocation Trigger | Form Validation Quality | Backend Endpoint Invoked |
| :--- | :--- | :--- | :--- | :--- |
| **New Patient Modal** | `NewPatientModal.tsx` | "Register Patient" button | Moderate (Requires First/Last Name, Age) | `POST /api/patients` |
| **Edit Patient Modal** | `EditPatientModal.tsx` | "Edit" button on Patient row | Moderate (Populates existing data) | `PATCH /api/patients/:id` |
| **Delete Patient Modal** | `DeletePatientModal.tsx` | "Delete" button on Patient row | Strong (Requires typing MRN to confirm) | `DELETE /api/patients/:id` |
| **New Appointment Modal** | `NewAppointmentModal.tsx`| "Book Appointment" button | Weak (No slot collision validation) | `POST /api/appointments` |
| **Reschedule Appointment** | `RescheduleAppointmentModal.tsx` | "Reschedule" button | Weak (Allows any arbitrary date/time) | `PATCH /api/appointments/:id` |
| **Cancel Appointment** | `CancelAppointmentModal.tsx` | "Cancel" button | Moderate (Captures reason) | `PATCH /api/appointments/:id` |
| **E-Prescription Modal** | `PrescriptionModal.tsx` | "New Prescription" button | Moderate (Requires drug, dose, duration) | `POST /api/pharmacy/prescriptions` |
| **Diagnostic Lab Order** | `LabOrderModal.tsx` | "Order Lab" button | Moderate (Selects test panel and priority) | `POST /api/laboratory` |
| **Generate Inpatient Bill**| `GenerateBillModal.tsx` | "Generate Bill" button | Moderate (Adds dynamic line items) | `POST /api/billing` |
| **Add Pharmacy Stock** | `NewPharmacyStockModal.tsx` | "Add Formulary Drug" button | Moderate (Validates min threshold, batch) | `POST /api/pharmacy/stock` |
| **Manual Stock Adjustment**| `ManualStockAdjustmentModal.tsx` | "Adjust Stock" button | Moderate (Captures delta and reason) | `POST /api/stock-movements` |
| **New Staff Member** | `NewStaffMemberModal.tsx` | "Onboard Staff" button | Strong (Enforces `@sahachara.com` email) | `POST /api/staff` |
| **New Staff Modal (Legacy)**| `NewStaffModal.tsx` | **NEVER INVOKED (DEAD CODE)** | N/A | None |
| **Patient Dossier Modal** | `PatientDossierModal.tsx` | "View Dossier" button | Read-only comprehensive clinical dossier | Reads local memory state |
| **Digital Signature Modal**| `DigitalSignatureModal.tsx`| "Sign Document" button | Strong (Canvas signature + PIN input) | `POST .../:id/sign` |
| **Download Summary Modal** | `DownloadSummaryModal.tsx` | "Export Summary" button | Option selection for PDF generation | Local jsPDF engine |
| **Carbon Command Search** | `CarbonSearchModal.tsx` | Keyboard shortcut `⌘K` / `Ctrl+K` | Instant fuzzy search across routes/actions | Client-side routing |
| **Carbon Modal Primitive** | `CarbonModal.tsx` | Base modal shell | Base wrapper supporting Escape / Backdrop | N/A |

---

### 5. Fabricated Clinical Data & Synthetic Series Audit

A major healthcare compliance issue is the presentation of synthetic data as genuine patient medical records:

#### 5.1 Synthetic Longitudinal Vitals (`src/components/charts/VitalTrendChart.tsx` L105–160)
When longitudinal vital records are missing (which is always the case, as the database does not model vitals history), the component constructs a fictitious timeline:
```ts
const hours = [
  { label: '00:00', deltaSys: -4, deltaDia: -3, deltaHr: -6 },
  { label: '04:00', deltaSys: -6, deltaDia: -4, deltaHr: -8 },
  { label: '08:00', deltaSys: +5, deltaDia: +3, deltaHr: +8 },
  { label: '12:00', deltaSys: +6, deltaDia: +4, deltaHr: +6 },
  ...
];
```
This generates synthetic blood pressure and heart rate curves that appear clinical and dynamic on the screen, but have no basis in patient telemetry.

#### 5.2 Synthetic Vitals Time Series (`src/components/VitalHistorySummary.tsx` L109–180)
The vital history table populates a 7-point retrospective log attributing synthetic vitals to fictitious medical staff:
```ts
const seriesConfig = [
  { daysAgo: 6, sysDelta: +8, diaDelta: +5, observer: 'RN D. Sharma', station: 'Emergency Triage' },
  { daysAgo: 5, sysDelta: +6, diaDelta: +4, observer: 'RN M. Joseph', station: 'Inpatient Station 2' },
  { daysAgo: 4, sysDelta: +5, diaDelta: +3, observer: 'Dr. V. Menon', station: 'Ayurvedic Ward' },
  ...
];
```
Presenting fabricated historical vitals with fabricated observer names in a clinical hospital operations platform violates healthcare documentation integrity standards (NABH / HIPAA ePHI accuracy requirements).

---

### 6. Accessibility & Theme Persistence Audit

1. **Carbon Theme Switcher**:
   - The theme state (`'g10'` vs `'g100'`) is persisted in `localStorage` under `sahachara.theme` and properly synchronizes with `document.documentElement` attributes. Contrast ratios in both themes comply with WCAG 2.1 AA standards.
2. **Keyboard Navigation & ARIA**:
   - Global search opens on `⌘K` / `Ctrl+K`.
   - Modals support closing via the `Escape` key.
   - **Deficit**: Custom modal dialogs lack `aria-modal="true"`, focus trapping is not enforced (tabbing can escape into background DOM), and table row expansions lack `aria-expanded` attributes.

