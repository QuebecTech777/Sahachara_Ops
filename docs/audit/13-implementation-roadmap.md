# Sahachara OS 2.0 — Comprehensive Engineering Audit & Discovery Report
## Document 13: Prioritized Implementation Roadmap & Sprint Plan

---

### Roadmap Strategy Overview

To transition Sahachara OS 2.0 from an in-memory prototype into an enterprise-ready hospital platform, the remediation effort is organized into **eight focused, two-week engineering sprints (Sprints 0 through 7)**.

```
┌────────────────────────────────────────────────────────────────────────┐
│                   SAHACHARA OS 2.0 REMEDIATION TIMELINE                │
├──────────┬───────────────────────────────────────────┬─────────────────┤
│ Sprint   │ Focus Area                                │ Priority Level  │
├──────────┼───────────────────────────────────────────┼─────────────────┤
│ Sprint 0 │ Workspace, Dependencies & CI Stabilization│ Foundation      │
│ Sprint 1 │ Security Hardening & True Authentication │ Critical (P0)   │
│ Sprint 2 │ Database Unification & True Persistence   │ Critical (P0)   │
│ Sprint 3 │ Clinical Workflows & Panchakarma Suite    │ Core EMR (P1)   │
│ Sprint 4 │ Pharmacy, Laboratory & WebCrypto PKI Sign │ Compliance (P1) │
│ Sprint 5 │ Appointments & Conflict Engine            │ Operations (P1) │
│ Sprint 6 │ Billing, Financial Integrity & Reports    │ Revenue (P2)    │
│ Sprint 7 │ Testing, Observability & Production Go-Live│ Readiness (P2)  │
└──────────┴───────────────────────────────────────────┴─────────────────┘
```

---

### Sprint 0 — Workspace, Dependencies & CI Stabilization

- **Objectives**: Stabilize developer tooling, install dependencies safely, clean dead code, and establish automated CI validation.
- **Specific Tasks**:
  1. Perform clean dependency installation (`npm install`) on authorized build environment.
  2. Remove phantom dependencies from `package.json` (`@google/genai`, `motion`, `autoprefixer`, `dotenv`).
  3. Delete ghost lockfile `bun.lock` and obsolete dead component `src/components/modals/NewStaffModal.tsx`.
  4. Fix TypeScript version declaration in `package.json` to standard stable version (`^5.8.0`).
  5. Remove client error suppression script from `index.html` (L4–29).
  6. Create GitHub Actions CI workflow (`.github/workflows/ci.yml`) running lint, typecheck, and build on push.
- **Affected Modules**: Root configuration, build scripts, `index.html`.
- **Dependencies**: None.
- **Acceptance Criteria**:
  - `npm run lint` (`tsc --noEmit`) passes with zero compiler errors.
  - `npm run build` completes successfully, outputting optimized static assets in `dist/`.
  - CI pipeline executes automatically on pull requests.
- **Testing Requirements**: Smoke test build verification.
- **Definition of Done**: Clean workspace state with passing CI pipeline.

---

### Sprint 1 — Security Hardening & Authentication Overhaul

- **Objectives**: Eradicate all backdoor credentials, eliminate client-controlled header spoofing, and implement cryptographic session management.
- **Specific Tasks**:
  1. Remove hardcoded backdoor password `'ayur2026'` from `server/prismaService.ts`.
  2. Remove hardcoded security activation PINs `'7492'` and `'1234'` from `server/prismaService.ts`.
  3. Re-engineer `server/rbacMiddleware.ts`: eliminate reading role from `x-user-role` and `x-user-name` headers; eliminate fallback to `Admin`.
  4. Implement server-side JWT or secure HttpOnly session cookies signed with a cryptographic secret (`SESSION_SECRET`).
  5. Mount strict authorization route guards (`requireRole`, `requirePermission`) on all 21 unprotected mutation endpoints in `server/routes.ts`.
  6. Implement `express-rate-limit` on `/api/auth/login` (5 attempts per 15 minutes) and `/api/auth/activate`.
- **Affected Modules**: `server/rbacMiddleware.ts`, `server/prismaService.ts`, `server/routes.ts`, `src/services/hospitalApi.ts`.
- **Dependencies**: Sprint 0.
- **Acceptance Criteria**:
  - Sending `x-user-role: Admin` in HTTP headers no longer grants administrative access.
  - Logging in with `'ayur2026'` fails unless the account password hash genuinely matches.
  - Brute force requests receive HTTP 429 Too Many Requests.
- **Testing Requirements**: Automated penetration unit tests verifying header injection rejection and rate limiting.
- **Definition of Done**: Zero authentication backdoors; all routes enforce server-verified RBAC.

---

### Sprint 2 — Database Schema Unification & True Persistence

- **Objectives**: Eliminate the in-memory data store for patients and staff; harmonize Prisma schema with PostgreSQL on Supabase.
- **Specific Tasks**:
  1. Unify database schemas: establish `prisma/schema.prisma` as the authoritative source of truth.
  2. Map Prisma `User` model correctly to Supabase `profiles` or migrate `profiles` to standard `users`.
  3. Fix column mismatches in `server/supabaseServer.ts`: correct `dosha_vata` to `dosha_profile JSONB`.
  4. Add explicit foreign key relationships (`@relation`) across all Prisma models.
  5. Generate initial baseline database migration (`npx prisma migrate dev --name init_his_schema`).
  6. Refactor `POST /api/patients`, `PATCH /api/patients/:id`, and `DELETE /api/patients/:id` to write directly to PostgreSQL via Prisma.
  7. Implement `PatientVitalsHistory` table in Prisma to store authentic vital sign records.
- **Affected Modules**: `prisma/schema.prisma`, `server/prismaService.ts`, `server/routes.ts`, `server/supabaseServer.ts`.
- **Dependencies**: Sprint 1.
- **Acceptance Criteria**:
  - Creating, updating, or deleting a patient persists permanently in PostgreSQL.
  - Restarting the Express server retains all registered patients and staff records.
  - No column-not-found errors occur during database synchronization.
- **Testing Requirements**: Integration tests verifying database read/write and persistence across server reboots.
- **Definition of Done**: Patient and staff records persist transactionally in PostgreSQL.

---

### Sprint 3 — Clinical Workflows: Consultations, Treatments & Panchakarma

- **Objectives**: Move Consultations, Treatment Plans, and Panchakarma Courses out of server memory and into transactional PostgreSQL storage.
- **Specific Tasks**:
  1. Wire Prisma client into `server/routes.ts` for `/api/consultations`, `/api/treatments`, and `/api/panchakarma`.
  2. Eliminate the synthetic vitals generator in `VitalTrendChart.tsx` and `VitalHistorySummary.tsx`; query `patient_vitals_history`.
  3. Implement automatic prescription generation: finalizing an Ayurvedic consultation automatically creates linked pharmacy prescription records.
  4. Implement state machine validation for Panchakarma phases: prevent logging *Pradhanakarma* before *Purvakarma* is completed.
- **Affected Modules**: `server/routes.ts`, `src/views/ConsultationsWorkspaceView.tsx`, `src/views/PanchakarmaManagementView.tsx`, `src/components/charts/`.
- **Dependencies**: Sprint 2.
- **Acceptance Criteria**:
  - Consultations, treatments, and daily Panchakarma sessions persist across server restarts.
  - Vitals history displays genuine clinician entries with valid observer timestamps.
- **Testing Requirements**: Workflow integration tests covering clinical encounter documentation.
- **Definition of Done**: 100% of Ayurvedic clinical documentation persists in PostgreSQL.

---

### Sprint 4 — Pharmacy, Laboratory & True Cryptographic PKI

- **Objectives**: Implement transactional pharmacy inventory decrementing, batch expiry checks, and W3C WebCrypto digital signatures.
- **Specific Tasks**:
  1. Implement Prisma `$transaction` blocks for medication dispensation: dispensing an Rx automatically decrements `stockQuantity` atomically.
  2. Add batch expiry validation: prevent dispensing medication from batches whose `expiryDate` is in the past.
  3. Implement allergy and contraindication checking: alert clinicians when prescribing drugs containing allergens documented in patient dossier.
  4. Replace pseudo-hash loop with W3C WebCrypto API: generate client-side ECDSA key pairs and verify digital signatures server-side.
- **Affected Modules**: `server/routes.ts`, `src/views/PharmacyView.tsx`, `src/views/LaboratoryView.tsx`, `src/components/modals/DigitalSignatureModal.tsx`.
- **Dependencies**: Sprint 3.
- **Acceptance Criteria**:
  - Medication dispensation atomically decrements formulary stock with zero race conditions.
  - Digital signatures are verifiable using public-key cryptography.
- **Testing Requirements**: Concurrency tests simulating simultaneous dispensations; cryptographic signature validation tests.
- **Definition of Done**: Legally compliant, cryptographically authenticated prescription and lab workflows.

---

### Sprint 5 — Appointments & Scheduling Conflict Engine

- **Objectives**: Implement database-backed appointment persistence and a conflict prevention engine.
- **Specific Tasks**:
  1. Persist appointments and reminders in PostgreSQL via Prisma.
  2. Implement double-booking and schedule conflict prevention: verify doctor and therapy room availability before booking.
  3. Implement strict appointment state machine transitions (`scheduled` -> `checked_in` -> `in_progress` -> `completed`).
  4. Wire automated reminders to an authentic notification provider (Twilio SMS or transactional email).
- **Affected Modules**: `server/routes.ts`, `src/views/AppointmentsScheduleView.tsx`, `src/components/modals/NewAppointmentModal.tsx`.
- **Dependencies**: Sprint 2.
- **Acceptance Criteria**:
  - Booking an overlapping slot for the same doctor or room returns HTTP 409 Conflict.
  - Appointment reschedules and cancellations update PostgreSQL transactionally.
- **Testing Requirements**: Concurrency tests attempting duplicate slot bookings.
- **Definition of Done**: Conflict-free clinical scheduling with true persistence.

---

### Sprint 6 — Billing, Financial Integrity & Reports Alignment

- **Objectives**: Standardize currency arithmetic (INR), implement sequential invoice numbering, and fix analytics date filtering.
- **Specific Tasks**:
  1. Standardize all invoice items, copays, and charges in Indian Rupees (INR ₹); remove arbitrary `* 82` multiplier.
  2. Implement sequential invoice numbering (`SAH-INV-2026-00001`) using PostgreSQL database sequences to ensure GST compliance.
  3. Persist hospital system settings and clinic profile in `organization_settings` table.
  4. Implement server-side date range filtering for Reports and Analytics endpoints (`?startDate=...&endDate=...`).
- **Affected Modules**: `server/routes.ts`, `src/views/BillingInsuranceView.tsx`, `src/views/ReportsAnalyticsView.tsx`, `src/views/SettingsWorkspaceView.tsx`.
- **Dependencies**: Sprint 4.
- **Acceptance Criteria**:
  - Invoice numbers are strictly sequential with zero gaps or collisions.
  - Selecting date range pills in Reports updates all charts and metrics accurately.
  - Organization settings changes persist across reloads.
- **Testing Requirements**: Financial ledger reconciliation tests; date range query filtering tests.
- **Definition of Done**: Fully reconciled, compliant billing and accurate analytics.

---

### Sprint 7 — Production Hardening, Observability & Go-Live Readiness

- **Objectives**: Integrate comprehensive observability, implement code-splitting, execute load testing, and validate production readiness.
- **Specific Tasks**:
  1. Introduce route-based lazy loading in `src/App.tsx` using `React.lazy()` and `Suspense`.
  2. Replace `console.log` with structured JSON logging (`pino`) and install `sentry` for error monitoring.
  3. Install `helmet` in Express and configure strict Content Security Policy (CSP) and HSTS.
  4. Execute end-to-end Playwright test suite covering all critical hospital workflows.
  5. Execute load testing using k6 (simulating 100 concurrent staff members).
- **Affected Modules**: `server.ts`, `src/App.tsx`, build and deployment pipelines.
- **Dependencies**: Sprints 0 through 6.
- **Acceptance Criteria**:
  - Initial JS bundle size reduced by >50%.
  - Zero critical security vulnerabilities in automated scans.
  - Sub-200ms API response latency under 100 concurrent users.
- **Testing Requirements**: Full E2E regression suite; k6 load testing report.
- **Definition of Done**: Production readiness score >= 90/100; application ready for clinical go-live.

