# Sahachara OS 2.0 — Comprehensive Engineering Audit & Discovery Report
## Document 11: Technical Debt Register & Remediation Sizing

---

### 1. Technical Debt Register Overview

This register documents all technical, architectural, and operational shortcuts identified during the engineering audit. Each debt item is assigned a unique identifier, architectural domain, priority ranking (P0 to P3), estimated remediation effort in Person-Days (PD), and impact assessment.

---

### 2. Consolidated Technical Debt Matrix

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                TECHNICAL DEBT REGISTER                                 │
├────────────┬─────────────────────────────┬──────────┬──────────┬──────────┬────────────┤
│ Debt ID    │ Title / Summary             │ Category │ Priority │ Effort   │ Risk Level │
├────────────┼─────────────────────────────┼──────────┼──────────┼──────────┼────────────┤
│ TD-SEC-01  │ Header-Based Auth & Default │ Security │ P0 (Crit)│ 2.0 PD   │ Critical   │
│ TD-SEC-02  │ Backdoor Master Passwords   │ Security │ P0 (Crit)│ 0.5 PD   │ Critical   │
│ TD-DATA-01 │ Ephemeral In-Memory Store   │ Database │ P0 (Crit)│ 5.0 PD   │ Critical   │
│ TD-DATA-02 │ Prisma / Supabase Divergence│ Database │ P0 (Crit)│ 3.0 PD   │ Critical   │
│ TD-SEC-03  │ Missing Route Guards (21)   │ Security │ P1 (High)│ 2.5 PD   │ High       │
│ TD-API-01  │ Unbounded API Queries       │ Backend  │ P1 (High)│ 2.0 PD   │ High       │
│ TD-API-02  │ Missing Request Validation  │ Backend  │ P1 (High)│ 3.0 PD   │ High       │
│ TD-CLIN-01 │ Fabricated Historical Vitals│ Clinical │ P1 (High)│ 2.5 PD   │ High       │
│ TD-SEC-04  │ Simulated PKI Signatures    │ Security │ P1 (High)│ 3.5 PD   │ High       │
│ TD-DATA-03 │ Missing Prisma Relations    │ Database │ P1 (High)│ 2.0 PD   │ High       │
│ TD-FE-01   │ Global Over-Rendering Sub.  │ Frontend │ P2 (Med) │ 2.0 PD   │ Medium     │
│ TD-FE-02   │ Monolithic Bundle Splitting │ Frontend │ P2 (Med) │ 1.5 PD   │ Medium     │
│ TD-FE-03   │ Unpersisted System Settings │ Frontend │ P2 (Med) │ 1.5 PD   │ Medium     │
│ TD-OPS-01  │ Zero Test Automation Harness│ DevOps   │ P2 (Med) │ 4.0 PD   │ Medium     │
│ TD-OPS-02  │ Observability & Structured  │ DevOps   │ P2 (Med) │ 1.5 PD   │ Medium     │
│ TD-FE-04   │ Dead Code (NewStaffModal)   │ Frontend │ P3 (Low) │ 0.5 PD   │ Low        │
│ TD-DEP-01  │ Phantom Dependencies Clean  │ Tooling  │ P3 (Low) │ 0.5 PD   │ Low        │
├────────────┴─────────────────────────────┴──────────┴──────────┴──────────┴────────────┤
│ TOTAL ESTIMATED REMEDIATION EFFORT                             │ 37.5 PD  │            │
└────────────────────────────────────────────────────────────────┴──────────┴────────────┘
```

---

### 3. Detailed Technical Debt Specifications

#### TD-SEC-01: Header-Based Role Resolution & Admin Fallback
- **Category**: Security / Authorization
- **Priority**: P0 (Immediate Blocker)
- **Affected Files**: `server/rbacMiddleware.ts` (L60–90), `src/services/hospitalApi.ts` (L311–318)
- **Description**: The server trusts client-provided headers (`x-user-role`, `x-user-name`) and defaults to `Admin` when headers are absent.
- **Remediation**: Eliminate header-based identity resolution. Validate authenticated user sessions via signed JWTs or HttpOnly secure cookies. Extract role strictly from database user record.
- **Estimated Effort**: 2.0 Person-Days

#### TD-SEC-02: Hardcoded Master Credentials & Universal Security PINs
- **Category**: Security / Authentication
- **Priority**: P0 (Immediate Blocker)
- **Affected Files**: `server/prismaService.ts` (L116, L233, L299), `src/views/AuthScreenView.tsx` (L37–44)
- **Description**: Universal password `'ayur2026'` allows login to any account. Universal PINs `'7492'` and `'1234'` allow arbitrary account activation.
- **Remediation**: Remove all fallback string comparisons. Require cryptographically random one-time tokens for account activation with time-based expiry.
- **Estimated Effort**: 0.5 Person-Days

#### TD-DATA-01: Volatile In-Memory JavaScript Arrays as Primary Data Store
- **Category**: Database Architecture
- **Priority**: P0 (Immediate Blocker)
- **Affected Files**: `server/dataStore.ts`, `server/routes.ts`
- **Description**: 10 clinical modules exist solely in server heap memory. Server restart wipes all operational records.
- **Remediation**: Re-engineer all route handlers to read and write directly to PostgreSQL via Prisma ORM with proper connection pooling.
- **Estimated Effort**: 5.0 Person-Days

#### TD-DATA-02: Complete Schema Divergence (Prisma vs Supabase)
- **Category**: Database Architecture
- **Priority**: P0 (Immediate Blocker)
- **Affected Files**: `prisma/schema.prisma`, `supabase/schema.sql`, `server/supabaseServer.ts`
- **Description**: Prisma defines `users`; Supabase defines `profiles`. Supabase sync writes to non-existent columns (`dosha_vata`, etc.).
- **Remediation**: Establish a single source of truth. Unify on `prisma/schema.prisma` with proper model mappings to Supabase tables. Correct column names in `supabaseServer.ts`.
- **Estimated Effort**: 3.0 Person-Days

#### TD-SEC-03: Missing Authorization Route Guards Across 21 Mutation Endpoints
- **Category**: Security / API
- **Priority**: P1 (High)
- **Affected Files**: `server/routes.ts`
- **Description**: Critical endpoints (`POST /api/pharmacy/prescriptions`, `POST /api/billing`, `PATCH /api/appointments/:id`) lack role middleware.
- **Remediation**: Mount `requirePermission()` guards on every mutation route matching the clinical permissions declared in `rbacMiddleware.ts`.
- **Estimated Effort**: 2.5 Person-Days

#### TD-API-01: Unbounded Query Serialization Without Pagination
- **Category**: Backend API / Performance
- **Priority**: P1 (High)
- **Affected Files**: `server/routes.ts` (L91, L240, L541, L717, L824, L897)
- **Description**: All collection endpoints return full in-memory arrays without `page`, `limit`, or cursor parameters.
- **Remediation**: Introduce standardized pagination query parameters (`?limit=50&cursor=...`) across all collection routes, returning `{ data: [], meta: { total, hasMore, cursor } }`.
- **Estimated Effort**: 2.0 Person-Days

#### TD-CLIN-01: Fabricated Historical Vitals and Observer Attributions
- **Category**: Clinical Safety & Regulatory Compliance
- **Priority**: P1 (High)
- **Affected Files**: `src/components/charts/VitalTrendChart.tsx`, `src/components/VitalHistorySummary.tsx`
- **Description**: Clinical vital history is dynamically synthesized on the frontend using delta offsets and fake clinician names.
- **Remediation**: Create a dedicated `patient_vitals` table in PostgreSQL. Store every telemetry measurement as an authentic record with observer ID. Update frontend to render empty states when history is unavailable.
- **Estimated Effort**: 2.5 Person-Days

#### TD-SEC-04: Simulated PKI Digital Signatures
- **Category**: Security / Legal Compliance
- **Priority**: P1 (High)
- **Affected Files**: `server/routes.ts` (L579–582, L624–627, L774–777)
- **Description**: Non-cryptographic character multiplication loop claims to be "Ayush National Registry PKI".
- **Remediation**: Implement true digital signature verification using WebCrypto API (ECDSA P-256 or RSA-PSS) or integration with India's Ayushman Bharat Digital Mission (ABDM) / e-Sign gateways.
- **Estimated Effort**: 3.5 Person-Days

#### TD-OPS-01: Zero Automated Test Harness
- **Category**: DevOps / Quality Assurance
- **Priority**: P2 (Medium)
- **Affected Files**: Root workspace, `package.json`
- **Description**: Zero unit, integration, or E2E tests exist.
- **Remediation**: Configure Vitest for unit tests, Supertest for API integration tests, and Playwright for core clinical workflow smoke tests. Integrate into CI pipeline.
- **Estimated Effort**: 4.0 Person-Days

