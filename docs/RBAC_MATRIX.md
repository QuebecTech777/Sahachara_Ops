# Sahachara Ops — Role-Based Access Control (RBAC) Architecture & Rate Master Specification

## 1. Executive Summary & Permitted Roles

The Sahachara Ops platform enforces a strict, server-side Role-Based Access Control (RBAC) model. Under the product-owner directive, **exactly seven roles** are permitted in the application:
1. `SUPER_ADMIN`
2. `ADMIN`
3. `DOCTOR`
4. `VAIDYA`
5. `RECEPTIONIST`
6. `PHARMACIST`
7. `ACCOUNTANT`

All legacy, deprecated, or informal roles (such as `Nurse`, `Therapist`, or `Patient`) have been completely excised from the database schemas, API routing, authentication tokens, and user interfaces.

### Complete Exclusion of Digital Signatures
Digital signatures, electronic PKI certificates, signature verification schemes, and `LAB_RESULT_SIGN` permissions are **permanently and completely excluded** from the platform. Laboratory result workflows operate through standard authenticated user attribution (`verifiedBy`, `verifiedAt`) and persistent audit logs.

### Distinct Clinical Responsibilities (`DOCTOR` vs. `VAIDYA`)
`DOCTOR` and `VAIDYA` are **distinct, non-interchangeable clinical roles**. They are never aliased, mapped to one another, or conflated.

| Role Identifier | Role Name | Primary Authority & Operational Scope |
| :--- | :--- | :--- |
| `SUPER_ADMIN` | Executive Super Administrator | Highest-level system administration, platform configuration, access management, patient record deletion, and administrative oversight. |
| `ADMIN` | Operational Hospital Administrator | Hospital operations, staff management, authorized Rate Master configuration, inventory, bed tracking, and operational visibility. |
| `DOCTOR` | Modern Medicine & Emergency Physician | Modern medical consultations, acute clinical evaluation, emergency triage intake and scoring, ordering modern pharmacotherapy, ordering diagnostic lab panels, and reviewing/releasing lab results with authenticated attribution. |
| `VAIDYA` | Ayurvedic Physician | Ayurvedic clinical consultations, Prakriti & Vikriti assessments, dosha-related clinical documentation, Ayurvedic therapy plans (e.g. Abhyanga, Kizhi), classical Panchakarma courses, and classical formulation prescriptions. |
| `RECEPTIONIST` | Front Desk & Clinical Registrar | Patient registration, scheduling appointments, dispatching reminders, bed tracking, and triage intake. |
| `PHARMACIST` | Clinical Pharmacist | Central formulary inventory management, stock movement logging, and atomic medication dispensing. |
| `ACCOUNTANT` | Financial Controller | Inpatient billing, insurance copay calculations, payment receipt recording, and financial reporting. |

---

## 2. Least-Privilege Permission Matrix (Seven Roles)

The table below documents the server-side permissions for every functional domain across all seven roles. Every operation is strictly enforced at the HTTP API layer via Express middleware (`requireRole` and `requirePermission`).

| Functional Domain / Endpoint | `SUPER_ADMIN` | `ADMIN` | `DOCTOR` | `VAIDYA` | `RECEPTIONIST` | `PHARMACIST` | `ACCOUNTANT` |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **System Overview & Metrics** (`GET /api/overview`) | Allowed | Allowed | Allowed | Allowed | Allowed | Allowed | Allowed |
| **Patient Directory Read** (`GET /api/patients`) | Allowed | Allowed | Allowed | Allowed | Allowed | Allowed | Allowed |
| **Patient Registration** (`POST /api/patients`) | Allowed | Allowed | Allowed | Allowed | Allowed | Forbidden | Forbidden |
| **Patient Record Update** (`PATCH /api/patients/:id`) | Allowed | Allowed | Allowed | Allowed | Allowed | Forbidden | Forbidden |
| **Patient Record Purge** (`DELETE /api/patients/:id`) | **Allowed** | **Forbidden** | **Forbidden** | **Forbidden** | **Forbidden** | **Forbidden** | **Forbidden** |
| **Appointments Read** (`GET /api/appointments`) | Allowed | Allowed | Allowed | Allowed | Allowed | Forbidden | Forbidden |
| **Appointment Scheduling** (`POST /api/appointments`) | Allowed | Allowed | Allowed | Allowed | Allowed | Forbidden | Forbidden |
| **Emergency Triage Intake & Scoring** (`POST /api/triage`) | Allowed | Allowed | **Allowed** | **Forbidden** | Allowed | Forbidden | Forbidden |
| **Bed Management & Assignment** (`PATCH /api/beds/:id`) | Allowed | Allowed | Allowed | Allowed | Allowed | Forbidden | Forbidden |
| **Staff Member Management** (`POST /api/staff`) | Allowed | Allowed | Forbidden | Forbidden | Forbidden | Forbidden | Forbidden |
| **General Clinical Consultations** (`GET /api/consultations`) | Allowed | Allowed | Allowed | Allowed | Forbidden | Forbidden | Forbidden |
| **Modern Clinical Orders** (`POST /api/prescriptions`) | Allowed | Allowed | Allowed | Allowed | Forbidden | Forbidden | Forbidden |
| **Ayurvedic Therapy Plans** (`POST /api/treatments`) | Allowed | Allowed | **Forbidden** | **Allowed** | Forbidden | Forbidden | Forbidden |
| **Panchakarma Protocol Courses** (`POST /api/panchakarma`) | Allowed | Allowed | **Forbidden** | **Allowed** | Forbidden | Forbidden | Forbidden |
| **Prescription Dispensary Queue** (`GET /api/pharmacy/prescriptions`) | Allowed | Allowed | Allowed | Allowed | Forbidden | Allowed | Forbidden |
| **Medication Dispensing** (`PATCH /api/pharmacy/prescriptions/:id`) | Allowed | Allowed | Forbidden | Forbidden | Forbidden | Allowed | Forbidden |
| **Pharmacy Stock & Movements** (`POST /api/pharmacy/stock`) | Allowed | Allowed | Forbidden | Forbidden | Forbidden | Allowed | Forbidden |
| **Laboratory Ordering** (`POST /api/laboratory`) | Allowed | Allowed | Allowed | Allowed | Forbidden | Forbidden | Forbidden |
| **Laboratory Result Entry & Release** (`PATCH /api/laboratory/:id`) | Allowed | Allowed | **Allowed** | **Allowed** | Forbidden | Forbidden | Forbidden |
| **Rate Master Tariffs Read** (`GET /api/tariffs`) | Allowed | Allowed | Allowed | Allowed | Allowed | Allowed | Allowed |
| **Service & Tariff Management** (`POST/PUT/PATCH /api/tariffs`) | **Allowed** | **Forbidden** | **Forbidden** | **Forbidden** | **Forbidden** | **Forbidden** | **Forbidden** |
| **Billing Ledger Read** (`GET /api/billing`) | Allowed | Allowed | Forbidden | Forbidden | Forbidden | Forbidden | Allowed |
| **Invoice Generation & Settlement** (`POST /api/billing`) | Allowed | Allowed | Forbidden | Forbidden | Forbidden | Forbidden | Allowed |
| **RBAC Directory Read** (`GET /api/rbac/users`) | Allowed | Allowed | Forbidden | Forbidden | Forbidden | Forbidden | Forbidden |
| **RBAC Role Assignment** (`PATCH /api/rbac/users/:id/role`) | Allowed | **Restricted\*** | Forbidden | Forbidden | Forbidden | Forbidden | Forbidden |
| **System Security Audit Trail** (`GET /api/audit`) | Allowed | Allowed | Forbidden | Forbidden | Forbidden | Forbidden | Forbidden |

*\* Operational `ADMIN` users can assign operational roles (`ADMIN`, `DOCTOR`, `VAIDYA`, `RECEPTIONIST`, `PHARMACIST`, `ACCOUNTANT`), but are strictly blocked from promoting any account to `SUPER_ADMIN` or modifying existing `SUPER_ADMIN` accounts.*

---

## 3. Clinical Workflow & Separation

### 3.1 DOCTOR (Modern & Emergency Medicine Lead)
- **Authorized Operations**:
  - Emergency Triage assessment, acuity scoring (ESI-1 through ESI-5), vital sign evaluations (`TRIAGE_MANAGE`).
  - Diagnostic laboratory panels and pathology test ordering.
  - Reviewing, interpreting, and releasing laboratory findings with authenticated user attribution (`verifiedBy`, `verifiedAt`) and persistent audit trail.
  - Prescribing modern pharmaceuticals.
- **Strictly Prohibited Operations**:
  - Creating or authorizing Ayurvedic therapy treatment plans (Abhyanga, Shirodhara, Kizhi) (`AYURVEDIC_TREATMENT_WRITE` -> 403 Forbidden).
  - Initiating or managing Panchakarma purificatory protocols (Vamana, Virechana, Basti, Nasya, Raktamokshana) (`PANCHAKARMA_MANAGE` -> 403 Forbidden).
  - Billing invoice generation or fee settlement.
  - Digital signing workflows (permanently excluded).

### 3.2 VAIDYA (Ayurvedic Physician & Panchakarma Director)
- **Authorized Operations**:
  - Ayurvedic diagnostic consultations (Roga-Rogi Pariksha, Nadi, Jihva, Prakriti, Vikriti assessment) (`AYURVEDIC_CONSULTATION_WRITE`).
  - Formulating customized Ayurvedic therapy treatment plans (`AYURVEDIC_TREATMENT_WRITE`).
  - Prescribing and managing classical Panchakarma courses and logging daily therapy sessions (`PANCHAKARMA_MANAGE`, `TREATMENT_SESSION_LOG`).
  - Reviewing diagnostic lab results for clinical context.
  - Ordering Ayurvedic formulations and internal herbal decoctions.
- **Strictly Prohibited Operations**:
  - Acute emergency triage scoring and trauma admission management (`TRIAGE_MANAGE` -> 403 Forbidden).
  - Billing invoice generation or fee settlement.
  - Digital signing workflows (permanently excluded).

---

## 4. Rate Master & Tariff Configuration Policy

Under explicit product-owner decisions, all tariffs adhere to strict financial integrity rules:

### 4.1 All Unapproved Tariffs Remain Null
- The hospital has not established standard bed tariffs, accommodation rates, or free procedure policies.
- `BED-GEN`, `BED-SEMI`, `BED-ICU`, `BED-DLX`, and `PROC-TRIAGE` must remain strictly `rate: null` and `isZeroPricePermitted: false` until authorized rates are established by the hospital.
- Initial emergency triage is **not** assumed to be a free procedure; its tariff remains unconfigured (`null`).

### 4.2 Invoice Creation Guard
- Any invoice creation attempt (`POST /api/billing`) referencing a service or bed with an unconfigured rate (`rate === null || undefined`) is **strictly rejected with HTTP 400 Bad Request** (`UnconfiguredTariff`).
- Billing against ₹0 is rejected with HTTP 400 unless the tariff explicitly has `isZeroPricePermitted: true` (which requires explicit administrative authorization).

### 4.3 Test Database Isolation
- Automated tests must not contaminate the production hospital database with invented rates.
- Any temporary tariff establishment during testing must be executed in isolated test fixtures or immediately restored to unconfigured (`null`) status upon test completion.

### 4.4 Currency Multiplier Bug Elimination
- Removed the historical `* 82` multiplier from all billing aggregates and ledger totals. All amounts calculate directly in INR (₹).

---

## 5. Account Seeding & Identity Architecture

1. **Production Account Isolation**:
   - In production (`NODE_ENV === 'production'`), the platform never creates fictitious operational users, demo doctors, or placeholder staff.
   - Only the root `SUPER_ADMIN` governance account is verified. All operational hospital users must be created by authorized administrators via `POST /api/staff`.
2. **Account Activation Role Preservation**:
   - Staff account activation (`POST /api/auth/activate`) validates the security PIN and preserves the exact role pre-assigned by the administrator. There is no silent fallback or promotion.
3. **Cryptographic Tokens & Anti-Spoofing**:
   - Authenticated requests require `Authorization: Bearer sah_<claims>.<signature>`. Tokens are verified using HMAC-SHA256 with `SESSION_SECRET`.
   - Incoming `x-user-role`, `x-user-name`, or body-supplied roles are ignored for authorization.
4. **PostgreSQL Persistence**:
   - Models are persisted durably via PostgreSQL and managed by version-controlled Prisma migrations.
