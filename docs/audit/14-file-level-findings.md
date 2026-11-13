# Sahachara OS 2.0 — Comprehensive Engineering Audit & Discovery Report
## Document 14: Traceable File-Level Findings Register

---

### Format Specification
Every finding in this register is indexed with a unique identifier and documents:
- **Finding ID**
- **Severity**: `CRITICAL`, `HIGH`, `MEDIUM`, `LOW`, or `INFORMATIONAL`
- **Affected File & Line Number(s)**
- **Description**
- **Concrete Code Evidence**
- **Technical & Clinical Impact**
- **Recommended Solution**
- **Dependencies**
- **Suggested Verification Method**

---

### Finding F-SEC-01: Universal RBAC Bypass via Client-Controlled Headers & Admin Default
- **Severity**: `CRITICAL`
- **Affected File**: `server/rbacMiddleware.ts` (Lines 85–88)
- **Description**: The server's identity resolver middleware extracts the caller's role from untrusted client-supplied HTTP request headers (`x-user-role`, `x-user-name`) and defaults to assigning the `Admin` role if headers are missing.
- **Evidence**:
  ```ts
  // server/rbacMiddleware.ts L85-88
  // Fallback to role header or default to Admin in dev preview
  req.userRole = (req.userRole || headerRole || 'Admin') as UserRole;
  req.userName = req.userName || headerName || 'Authenticated User';
  req.patientMrn = headerMrn;
  ```
- **Impact**: Any unauthenticated client or external attacker can perform administrative tasks (purging patient records, changing roles, viewing all HIPAA audit logs) simply by omitting request headers or sending `x-user-role: Admin`.
- **Recommended Solution**: Eliminate reading identity from client headers. Validate authenticated sessions exclusively using cryptographically signed session cookies or verified JWTs. Retrieve the user's role from the verified database record.
- **Dependencies**: None.
- **Suggested Verification Method**: Issue `curl -X POST http://localhost:3000/api/patients` with no headers and verify that the server rejects the request with HTTP 401 Unauthorized.

---

### Finding F-SEC-02: Hardcoded Master Backdoor Password
- **Severity**: `CRITICAL`
- **Affected File**: `server/prismaService.ts` (Line 116)
- **Description**: The staff authentication password verification logic contains a hardcoded fallback string comparison that accepts `'ayur2026'` for any account.
- **Evidence**:
  ```ts
  // server/prismaService.ts L116
  const valid = bcrypt.compareSync(password, dbUser.passwordHash) || password === 'ayur2026';
  if (!valid) {
    return { success: false, error: 'Invalid password credentials...' };
  }
  ```
- **Impact**: Anyone with knowledge of a clinician's email address can authenticate into their account by entering the master password `'ayur2026'`, bypassing cryptographic password hashing.
- **Recommended Solution**: Remove `|| password === 'ayur2026'` entirely. Passwords must be validated solely against the stored bcrypt hash.
- **Dependencies**: None.
- **Suggested Verification Method**: Attempt login with `'ayur2026'` on an account with a different password hash and verify that HTTP 401 is returned.

---

### Finding F-SEC-03: Universal Backdoor Security Activation PINs
- **Severity**: `HIGH`
- **Affected File**: `server/prismaService.ts` (Lines 233, 299)
- **Description**: The staff onboarding account activation logic accepts universal PINs `'7492'` and `'1234'` regardless of the activation PIN assigned to the staff member.
- **Evidence**:
  ```ts
  // server/prismaService.ts L233 & L299
  if (cleanPin !== expectedPin && cleanPin !== '7492' && cleanPin !== '1234') {
    return { success: false, error: 'Invalid security PIN...' };
  }
  ```
- **Impact**: An attacker can hijack any newly created staff account in `pending_activation` status by activating it using `'7492'` or `'1234'` and setting their own password.
- **Recommended Solution**: Remove the hardcoded PIN checks. Require the entered PIN to match `expectedPin` strictly, and implement PIN expiration and rate limiting.
- **Dependencies**: None.
- **Suggested Verification Method**: Attempt account activation using `'7492'` when expected PIN is different; verify that HTTP 400 is returned.

---

### Finding F-SEC-04: Permissive PostgreSQL Row-Level Security Policies
- **Severity**: `HIGH`
- **Affected File**: `supabase/schema.sql` (Lines 350–410)
- **Description**: All Supabase RLS policies grant unrestricted read and write permissions to any authenticated user using `USING (true)`.
- **Evidence**:
  ```sql
  -- supabase/schema.sql L351-354
  CREATE POLICY "Clinical staff can view patient dossiers"
    ON public.patients FOR SELECT TO authenticated USING (true);

  CREATE POLICY "Clinical staff can create and update patients"
    ON public.patients FOR ALL TO authenticated USING (true);
  ```
- **Impact**: Any authenticated user—including an outpatient authenticated on the patient portal—can query the entire `patients`, `invoices`, and `consultations` tables directly via PostgREST, violating HIPAA privacy rules.
- **Recommended Solution**: Re-engineer RLS policies to check the user's role from JWT claims (`auth.jwt() ->> 'role'`) and restrict patients to rows matching their own `mrn`.
- **Dependencies**: Supabase Auth integration.
- **Suggested Verification Method**: Query `public.patients` using a Patient user's JWT token and verify that only their own row is returned.

---

### Finding F-SEC-05: Automatic Privilege Escalation for Unmapped Staff Roles
- **Severity**: `HIGH`
- **Affected File**: `server/prismaService.ts` (Lines 165, 502)
- **Description**: Staff members whose titles do not contain `"Doctor"` or `"Nurse"` are automatically designated with the `Admin` role.
- **Evidence**:
  ```ts
  // server/prismaService.ts L165
  const role: UserRole = matchedStaff ? (
    matchedStaff.role.includes('Doctor') ? 'Doctor' : 
    matchedStaff.role.includes('Nurse') ? 'Nurse' : 
    'Admin'
  ) : (matchedUser?.role || 'Doctor');
  ```
- **Impact**: Non-clinical staff (Pharmacists, Billing Specialists, Lab Technicians, Administrative Officers) receive full administrative privileges, including the ability to delete patient medical records.
- **Recommended Solution**: Expand the `UserRole` union to include `Pharmacist`, `Therapist`, `Billing`, `LabTech`, and `Receptionist` with granular permissions. Default unknown roles to least-privileged access (`Patient` or `StaffRead`), never `Admin`.
- **Dependencies**: `src/types/hospital.ts` role enum expansion.
- **Suggested Verification Method**: Onboard a user with role `'Billing Specialist'` and verify that their resolved role is `'Billing'`, not `'Admin'`.

---

### Finding F-SEC-06: Simulated Cryptographic PKI Digital Signatures
- **Severity**: `HIGH`
- **Affected File**: `server/routes.ts` (Lines 579–582, 624–627, 774–777)
- **Description**: Digital signatures on electronic prescriptions and laboratory reports claim to use "Ayush National Registry PKI", but are generated using an arithmetic character-code multiplication loop with a static salt string.
- **Evidence**:
  ```ts
  // server/routes.ts L624-627
  const hashSeed = `${rx.rxNumber}|${rx.mrn}|${rx.medicationName}|${rx.dosage}|${signerName}|${signerLicense}|${Date.now()}`;
  const pseudoSha256 = 'SHA256:' + Array.from(hashSeed).reduce((acc, char, i) => {
    const code = (char.charCodeAt(0) * (i + 13) * 31).toString(16);
    return (acc + code).slice(0, 64);
  }, 'e8b4f190').padEnd(64, 'a93f7c10b');
  ```
- **Impact**: Signatures are legally invalid under the Information Technology Act (IT Act 2000) and Indian Evidence Act. Tampering cannot be detected.
- **Recommended Solution**: Implement authentic digital signatures using the W3C WebCrypto API (ECDSA P-256) with client-stored private keys and server-side public key verification.
- **Dependencies**: WebCrypto API implementation.
- **Suggested Verification Method**: Verify signatures using standard OpenSSL or Node.js `crypto.verify()`.

---

### Finding F-DATA-01: Ephemeral In-Memory Store as Primary Source of Truth
- **Severity**: `CRITICAL`
- **Affected File**: `server/dataStore.ts` (Lines 47–66), `server/routes.ts`
- **Description**: 10 out of 12 clinical modules are stored exclusively in in-memory JavaScript arrays on the Node.js process heap.
- **Evidence**:
  ```ts
  // server/dataStore.ts L47-66
  class HospitalDataStore {
    patients: Patient[] = [...INITIAL_PATIENTS];
    appointments: Appointment[] = [...INITIAL_APPOINTMENTS];
    prescriptions: Prescription[] = [...INITIAL_PRESCRIPTIONS];
    consultations: Consultation[] = [...INITIAL_CONSULTATIONS];
    treatmentPlans: TreatmentPlan[] = [...INITIAL_TREATMENT_PLANS];
    panchakarmaCourses: PanchakarmaCourse[] = [...INITIAL_PANCHAKARMA_COURSES];
    ...
  }
  ```
- **Impact**: Any server restart, container redeployment on Render, or autoscaling event causes catastrophic data loss, wiping all appointments, consultations, treatments, prescriptions, and invoices.
- **Recommended Solution**: Refactor all route handlers in `server/routes.ts` to execute database queries against PostgreSQL via Prisma ORM.
- **Dependencies**: Database schema unification.
- **Suggested Verification Method**: Restart the server process and verify that previously added clinical records still exist.

---

### Finding F-DATA-02: Broken Supabase Patient Sync due to Missing Schema Columns
- **Severity**: `CRITICAL`
- **Affected File**: `server/supabaseServer.ts` (Lines 76–83)
- **Description**: The backend patient synchronization function attempts to insert fields (`dosha_vata`, `dosha_pitta`, `dosha_kapha`, `prakriti`, `vikriti`, `agni_status`, `ama_status`) that do not exist in the Supabase PostgreSQL table.
- **Evidence**:
  ```ts
  // server/supabaseServer.ts L76-83
  const row = {
    ...
    dosha_vata: patient.doshaProfile?.vata || 40,
    dosha_pitta: patient.doshaProfile?.pitta || 35,
    dosha_kapha: patient.doshaProfile?.kapha || 25,
    prakriti: patient.doshaProfile?.prakriti || 'Vata-Pitta',
    vikriti: patient.doshaProfile?.vikriti || 'Pitta Imbalance',
    ...
  };
  const { error } = await client.from('patients').upsert(row, { onConflict: 'mrn' });
  ```
- **Impact**: PostgreSQL throws a runtime error (`column "dosha_vata" does not exist`), causing patient persistence to Supabase to fail silently.
- **Recommended Solution**: Update the mapping to write to the `dosha_profile` JSONB column as defined in `supabase/schema.sql`.
- **Dependencies**: None.
- **Suggested Verification Method**: Execute `persistPatientToSupabase()` against Supabase and verify that the call succeeds without error.

---

### Finding F-DATA-03: Missing Prisma Model Relations and Foreign Keys
- **Severity**: `HIGH`
- **Affected File**: `prisma/schema.prisma` (Entire file)
- **Description**: Zero Prisma `@relation` directives exist. Foreign keys (`patientId`, `doctorId`) are defined as unindexed, unconstrained strings.
- **Evidence**:
  ```prisma
  // prisma/schema.prisma L65
  model Appointment {
    id String @id @default(uuid())
    patientId String?   // No @relation(fields: [patientId], references: [id])!
  ```
- **Impact**: Database does not enforce referential integrity; cascading deletes and relation joins are not supported.
- **Recommended Solution**: Add explicit `@relation` annotations across all child models referencing `Patient` and `User`.
- **Dependencies**: Prisma schema update.
- **Suggested Verification Method**: Run `npx prisma validate` to confirm relational integrity.

---

### Finding F-CLIN-01: Fabricated Historical Vitals and Synthetic Observation Logs
- **Severity**: `HIGH`
- **Affected File**: `src/components/charts/VitalTrendChart.tsx` (L113–160), `src/components/VitalHistorySummary.tsx` (L109–180)
- **Description**: Longitudinal vital trends are synthesized on the frontend using delta offsets and attributed to fictitious medical staff (`RN D. Sharma`, `Dr. V. Menon`).
- **Evidence**:
  ```ts
  // src/components/charts/VitalTrendChart.tsx L114-118
  const hours = [
    { label: '00:00', deltaSys: -4, deltaDia: -3, deltaHr: -6 },
    { label: '04:00', deltaSys: -6, deltaDia: -4, deltaHr: -8 },
    { label: '08:00', deltaSys: +5, deltaDia: +3, deltaHr: +8 }
  ```
- **Impact**: Fabricated clinical telemetry presented as genuine patient medical history violates healthcare documentation integrity standards (NABH/HIPAA).
- **Recommended Solution**: Implement an authentic `patient_vitals_history` database table; display empty states when historical telemetry is not present.
- **Dependencies**: Database migration for vitals table.
- **Suggested Verification Method**: Verify that charts render only authentic vitals recorded in the database.

---

### Finding F-FE-01: Non-Functional Save Handlers in Settings Workspace
- **Severity**: `MEDIUM`
- **Affected File**: `src/views/SettingsWorkspaceView.tsx` (Lines 396–400, 761–765, 808–812)
- **Description**: Clicking "Save Organization Profile" or "Save System Configuration" triggers a UI toast notification without sending any HTTP request or saving data.
- **Evidence**:
  ```tsx
  // src/views/SettingsWorkspaceView.tsx L396-400
  <CarbonButton
    kind="primary"
    renderIcon={Save}
    onClick={() => {
      if (onNotify) {
        onNotify('Organization Profile Saved', 'Updated enterprise hospital identity and contact info.', 'success');
      }
    }}
  >
  ```
- **Impact**: All clinic profile and numbering configuration edits are lost upon page reload.
- **Recommended Solution**: Create dedicated API endpoints (`PUT /api/settings/organization`, `PUT /api/settings/configuration`) backed by an `organization_settings` database table.
- **Dependencies**: Database schema addition.
- **Suggested Verification Method**: Modify organization details, refresh the browser, and verify that changes persist.

---

### Finding F-FE-02: Non-Functional Date Range Filtering in Reports & Analytics
- **Severity**: `MEDIUM`
- **Affected File**: `src/views/ReportsAnalyticsView.tsx` (Lines 62, 456–468)
- **Description**: Selecting date range pills (`Today`, `7 Days`, `30 Days`, `This Month`, `This Year`) does not filter the charts or summary cards. All calculations compute over the entire unfiltered array.
- **Evidence**:
  ```ts
  // src/views/ReportsAnalyticsView.tsx L62, L191
  const [dateRange, setDateRange] = useState<'today' | '7days' | '30days' | 'month' | 'year'>('30days');
  // dateRange is only used in:
  link.setAttribute('download', `SahacharaOS_Clinical_Analytics_${dateRange}.csv`);
  ```
- **Impact**: Clinical administrators cannot analyze departmental metrics or financial performance across specific time windows.
- **Recommended Solution**: Implement client-side filtering functions or backend query parameters (`?startDate=...&endDate=...`) that filter consultations, invoices, and treatments by date.
- **Dependencies**: None.
- **Suggested Verification Method**: Select "Today" and verify that counts reflect only today's clinical encounters.

---

### Finding F-FE-03: Global Error Suppression Script in HTML Entrypoint
- **Severity**: `MEDIUM`
- **Affected File**: `index.html` (Lines 4–29)
- **Description**: An inline IIFE in `index.html` intercepts and suppresses unhandled exceptions matching keywords like `websocket`, `vite`, and `closed without opened`.
- **Evidence**:
  ```html
  <!-- index.html L4-29 -->
  <script>
    (function() {
      function shouldSuppress(val) { ... }
      window.addEventListener('unhandledrejection', function (e) {
        if (e && shouldSuppress(e.reason)) { e.preventDefault(); return false; }
      }, true);
    })();
  </script>
  ```
- **Impact**: Masks critical runtime errors, preventing developers and monitoring tools from diagnosing WebSocket connection failures and telemetry crashes.
- **Recommended Solution**: Remove the error suppression script and handle connection lifecycle errors gracefully in application code.
- **Dependencies**: None.
- **Suggested Verification Method**: Trigger a WebSocket disconnect and verify that errors log properly to the console.

---

### Finding F-OPS-01: Zero Automated Test Coverage
- **Severity**: `HIGH`
- **Affected File**: `package.json` (Entire project)
- **Description**: There are zero unit, integration, API, database, or E2E tests in the repository.
- **Impact**: Any refactoring or architectural remediation risks introducing undetected regressions into clinical workflows.
- **Recommended Solution**: Install Vitest and Supertest; build test suites for permissions, billing arithmetic, and patient CRUD.
- **Dependencies**: Sprint 0.
- **Suggested Verification Method**: Execute `npm test` and verify that all test suites pass.

