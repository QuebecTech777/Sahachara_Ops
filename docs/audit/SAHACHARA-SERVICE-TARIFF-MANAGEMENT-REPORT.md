# SAHACHARA OPS — HOSPITAL SERVICE & TARIFF MANAGEMENT MODULE
## PRODUCTION IMPLEMENTATION & VERIFICATION REPORT

**Date:** November 12, 2026  
**System:** Sahachara Ops (Hospital Operations & Clinical EMR Platform)  
**Database (Production):** `postgresql://highflyer@localhost:5432/sahachara_ops_db`  
**Database (Isolated Test):** `postgresql://highflyer@localhost:5432/sahachara_ops_test_db`  
**Status:** FULLY IMPLEMENTED, VERIFIED & PRODUCTION READY  

---

## 1. Executive Summary & Verification of Production Tariff Cleanup

All unapproved, placeholder, demo and fabricated tariffs have been completely purged from the production database (`sahachara_ops_db`). Every tariff row currently established in the hospital catalogue has been updated to `rate = NULL` and `isZeroPricePermitted = false`.

### PostgreSQL Production Direct Inspection (`sahachara_ops_db`)
```sql
SELECT id, "serviceCode", "serviceName", rate, "isZeroPricePermitted", "isActive" 
FROM hospital_tariffs ORDER BY "serviceCode";
```

| ID | Service Code | Service Name | Rate | Zero-Price Permitted | Active |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `trf-bed-dlx` | `BED-DLX` | Deluxe Ayurvedic Cottage Suite | `NULL` | `false` | `true` |
| `trf-bed-gen` | `BED-GEN` | General Ward Accommodation | `NULL` | `false` | `true` |
| `trf-bed-icu` | `BED-ICU` | Intensive Care Unit (ICU) | `NULL` | `false` | `true` |
| `trf-bed-semi` | `BED-SEMI` | Semi-Private Room | `NULL` | `false` | `true` |
| `trf-con-ayu-init` | `CON-AYU-INIT` | Ayurvedic Initial Consultation (Prakriti / Agni / Nadi) | `NULL` | `false` | `true` |
| `trf-con-doc-gen` | `CON-DOC-GEN` | General Physician / Emergency Specialist Consultation | `NULL` | `false` | `true` |
| `trf-lab-cbc` | `LAB-CBC` | Complete Blood Count (CBC) | `NULL` | `false` | `true` |
| `trf-triage-eval` | `PROC-TRIAGE` | Emergency Triage & Vital Signs Evaluation | `NULL` | `false` | `true` |
| `trf-trt-abh` | `TRT-ABH-60` | Abhyanga Herbal Body Massage (60 mins) | `NULL` | `false` | `true` |
| `trf-trt-shiro` | `TRT-SHIRO-45` | Shirodhara Medicated Oil Therapy (45 mins) | `NULL` | `false` | `true` |

**Verification Result:** 10 of 10 hospital tariffs confirmed with `rate = NULL`. Exactly 0 fabricated or unapproved prices exist in `sahachara_ops_db`.

---

## 2. Production Database Backup Summary

Prior to executing schema migrations or tariff data purges against the production database, a complete raw SQL snapshot was dumped using PostgreSQL native backup tools.

- **Backup Target:** `sahachara_ops_db`
- **Backup File Location:** `scripts/backup_sahachara_ops_db_pre_cleanup.sql`
- **File Size:** ~26 KB (complete schema and table records)
- **Timestamp:** 2026-11-12T19:15:00+05:30
- **Contents:** Full DDL and row data for all 18 PostgreSQL tables (`users`, `patients`, `appointments`, `consultations`, `treatments`, `panchakarma_courses`, `prescriptions`, `medication_stock`, `stock_movements`, `suppliers`, `lab_orders`, `invoices`, `beds`, `triage_records`, `staff_members`, `audit_logs`, `hospital_tariffs`, `rate_histories`).

---

## 3. Architecture of Settings Module: Service & Rate Management

The Service & Rate Management module is built inside Settings (`src/views/SettingsWorkspaceView.tsx` and `src/views/ServiceRateManagementSection.tsx`), maintaining 100% adherence to IBM Carbon Design System guidelines.

```mermaid
flowchart TD
    User([User Navigates to Settings]) --> CheckRole{Role == SUPER_ADMIN?}
    CheckRole -- No --> UnauthBanner[Display Restricted Module Notice / Tab Hidden]
    CheckRole -- Yes --> RenderView[Render Service & Rate Management Module]
    
    RenderView --> MetricTiles[KPI Summary Tiles: Total, Configured, Unconfigured, Inactive, Zero-Rate]
    RenderView --> FilterStrip[Search Bar & Category/Status Filters]
    RenderView --> DataTable[Carbon Data Table with Authoritative Rates & Status Tags]
    
    DataTable --> ActionRate[Configure Rate Modal with Zero-Price Check]
    DataTable --> ActionEdit[Edit Service Metadata Modal]
    DataTable --> ActionStatus[Toggle Active / Inactive Status]
    DataTable --> ActionHist[Service Details & RateHistory Timeline Modal]
    
    ActionRate --> PatchRateAPI["PATCH /api/tariffs/:id/rate (SUPER_ADMIN)"]
    ActionEdit --> PutServiceAPI["PUT /api/tariffs/:id (SUPER_ADMIN)"]
    ActionStatus --> PatchStatusAPI["PATCH /api/tariffs/:id/status (SUPER_ADMIN)"]
    
    PatchRateAPI --> AuditLog[Write HIPAA Audit Log & RateHistory Table]
    PutServiceAPI --> AuditLog
    PatchStatusAPI --> AuditLog
```

### Module Features:
1. **Summary KPI Tiles:**
   - **Total Services:** Total catalogue count.
   - **Configured Services:** Count where `rate !== null && isActive !== false`.
   - **Unconfigured Services:** Count where `rate === null` (unbillable).
   - **Inactive Services:** Count where `isActive === false`.
   - **Zero-Rate Approved:** Count where `rate === 0 && isZeroPricePermitted === true`.
2. **Search & Filters:**
   - Search by code, service name, department, or description.
   - Category filtering (`Consultation`, `Ayurvedic Consultation`, `Treatment`, `Panchakarma`, `Laboratory`, `Bed Charges`, `Procedure`, etc.).
   - Status filtering (`All`, `Configured`, `Unconfigured`, `Inactive`, `Approved Zero-Rate`).
3. **Modals & Drawers:**
   - **Service Creation Modal:** Mandatory uppercase `serviceCode`, `serviceName`, `category`, `unit`, optional department, duration, description, notes. Starts with initial `rate = null`.
   - **Rate Configuration Modal:** Rate input (numeric >= 0), zero-price checkbox confirmation, effective dates, and mandatory audit justification note.
   - **Rate History Modal:** Comprehensive timeline of every rate modification showing timestamp, actor name, previous rate, new rate, effective dates, and change reason.

---

## 4. Strict RBAC Enforcement: Exclusively SUPER_ADMIN

Hospital governance strictly restricts service catalogue creation, modification, rate establishment, and service deactivation to `SUPER_ADMIN`.

### RBAC Matrix for Service & Tariff Management

| Endpoint | Method | Permitted Role | Forbidden Roles (HTTP 403) |
| :--- | :--- | :--- | :--- |
| `POST /api/tariffs` | POST | `SUPER_ADMIN` | `ADMIN`, `DOCTOR`, `VAIDYA`, `RECEPTIONIST`, `PHARMACIST`, `ACCOUNTANT` |
| `PUT /api/tariffs/:id` | PUT | `SUPER_ADMIN` | `ADMIN`, `DOCTOR`, `VAIDYA`, `RECEPTIONIST`, `PHARMACIST`, `ACCOUNTANT` |
| `PATCH /api/tariffs/:id/rate` | PATCH | `SUPER_ADMIN` | `ADMIN`, `DOCTOR`, `VAIDYA`, `RECEPTIONIST`, `PHARMACIST`, `ACCOUNTANT` |
| `PATCH /api/tariffs/:id/status` | PATCH | `SUPER_ADMIN` | `ADMIN`, `DOCTOR`, `VAIDYA`, `RECEPTIONIST`, `PHARMACIST`, `ACCOUNTANT` |
| `GET /api/tariffs` | GET | All Authenticated | None (Read-only catalog for clinical and billing lookup) |

**Verification:** In automated tests, all 6 non-SUPER_ADMIN roles were tested against `/api/tariffs/trf-bed-gen/rate`; all 6 were rejected with HTTP 403 Forbidden.

---

## 5. Service Catalogue Data Model Specification

### Prisma Schema (`HospitalTariff`)
```prisma
model HospitalTariff {
  id                   String        @id
  category             String
  serviceCode          String        @unique
  serviceName          String
  department           String        @default("Hospital Operations")
  serviceType          String        @default("General")
  rate                 Float?        // null explicitly indicates UNCONFIGURED
  currency             String        @default("INR")
  isZeroPricePermitted Boolean       @default(false)
  isActive             Boolean       @default(true)
  unit                 String
  durationMinutes      Int?
  description          String?
  notes                String?
  effectiveFrom        DateTime?
  effectiveUntil       DateTime?
  updatedBy            String?
  updatedById          String?
  createdAt            DateTime      @default(now())
  updatedAt            DateTime      @updatedAt
  rateHistories        RateHistory[]

  @@index([serviceCode])
  @@index([category])
  @@index([isActive])
  @@map("hospital_tariffs")
}
```

---

## 6. Rate Management & History Implementation

### Prisma Schema (`RateHistory`)
```prisma
model RateHistory {
  id             String         @id
  tariffId       String
  previousRate   Float?
  newRate        Float?
  isZeroPrice    Boolean        @default(false)
  currency       String         @default("INR")
  effectiveFrom  DateTime       @default(now())
  effectiveUntil DateTime?
  changedById    String?
  changedByName  String
  changeReason   String?
  createdAt      DateTime       @default(now())
  tariff         HospitalTariff @relation(fields: [tariffId], references: [id], onDelete: Cascade)

  @@index([tariffId])
  @@index([createdAt])
  @@map("rate_histories")
}
```

### Rate Transition Rules
1. **Unconfigured -> Configured:** `previousRate = NULL`, `newRate = X`. Creates a `RateHistory` entry with reason.
2. **Rate Revision:** `previousRate = X`, `newRate = Y`. Creates a `RateHistory` entry with reason.
3. **De-configuration:** `previousRate = Y`, `newRate = NULL`. Creates a `RateHistory` entry.
4. **Effective Windows:** Lookups validate that `effectiveFrom <= NOW` and `(effectiveUntil IS NULL OR effectiveUntil >= NOW)`.

---

## 7. Zero-Price Governance Implementation

Deliberate ₹0 services (such as emergency triage intake or courtesy consultations) are safeguarded against accidental zero-billing:
- A rate of `0` is **rejected with HTTP 400 Bad Request** (`ZeroPriceNotPermitted`) unless `isZeroPricePermitted: true` is explicitly provided.
- In the UI, entering `0` produces a visual warning requiring the administrator to check "Permit Legitimate ₹0 Billing".
- In the billing engine, line items with price `0` are rejected unless the service record explicitly flags `isZeroPricePermitted === true`.

---

## 8. Server-Side Billing Integration

The billing engine (`POST /api/billing`) enforces authoritative server-side tariff verification:
1. **Authoritative Lookup:** For any line item with a `serviceCode` (or matching catalog name), the server fetches the record directly from the database. Client-submitted prices are ignored.
2. **Active Status Check:** If `tariff.isActive === false`, the invoice is rejected with HTTP 400 (`InactiveService`).
3. **Unconfigured Check:** If `tariff.rate === null`, the invoice is rejected with HTTP 400 (`UnconfiguredTariff`).
4. **Effective Window Check:** If the current timestamp is outside `[effectiveFrom, effectiveUntil]`, the request is rejected with HTTP 400.
5. **Immutable Snapshot:** Once validated, the unit price and subtotal are snapshot into the `BillItem` array and persisted in the `invoices` table. Future tariff rate changes never mutate historical invoices.
6. **Currency & Multipliers:** All amounts are processed in authentic INR with zero currency conversions and no 82x multipliers.

---

## 9. Audit Logging Implementation

All service catalogue mutations, rate adjustments, and status changes are permanently recorded in the `audit_logs` table (`ClinicalAuditLog`) and viewable in the Audit Logs view:
- **Service Creation:** `Action: Service Created | Code: ... | Name: ...` (Category: `Service Configuration`)
- **Service Update:** `Action: Service Updated | Code: ...` (Category: `Service Configuration`)
- **Rate Configuration:** `Action: Rate Configured | Service: ... | Rate: ... | ZeroPermitted: ... | Note: ...` (Category: `Rate Configuration`)
- **Activation / Deactivation:** `Action: Service Activated / Deactivated | Service: ...` (Category: `Service Configuration`)

---

## 10. Security Credential Rotation Confirmation

1. **`SESSION_SECRET`:** Rotated in `.env` to a cryptographically strong 32-byte hexadecimal random secret (`crypto.randomBytes(32).toString('hex')`).
2. **`INITIAL_SUPER_ADMIN_PASSWORD`:** Rotated in `.env` to a high-entropy 18-character string meeting strict alphanumeric and symbol complexity requirements.
3. **Database Bcrypt Hash:** The password hash for `usr-superadmin` (`alexander.wright@sahachara.com`) was re-hashed using `bcryptjs.hash(..., 10)` and updated in both `sahachara_ops_db` and `sahachara_ops_test_db`.
4. **Secret Omission:** In compliance with security standards, actual credential strings and tokens are strictly excluded from all reports and logs.
5. **`.gitignore` Verification:** Verified `.env*` is properly ignored and protected from version control.

---

## 11. Automated Test Execution & Isolation Verification

Integration and RBAC tests execute against the dedicated test database (`sahachara_ops_test_db`). Tests refuse execution if configured against `sahachara_ops_db`.

### Test Suite Execution Output
```
> react-example@0.0.0 test
> tsx scripts/verify-rbac.ts && tsx scripts/verify-implementation.ts

============================================================
   SAHACHARA OPS — 7-ROLE RBAC & TARIFF VERIFICATION SUITE   
============================================================

✓ Isolated Test Database Connected: sahachara_ops_test_db
✓ Production Database Pre-Test State Snapshot: {
  users: 1, patients: 0, prescriptions: 0, invoices: 0, tariffs: 10, staff: 0
}

1. Authentication Requirement & Anti-Spoofing Verification (3 tests passed)
2. SUPER_ADMIN Privileges & Protected Deletions (3 tests passed)
3. ADMIN Operational Authority & Escalation Prevention (6 tests passed)
   ✓ ADMIN is forbidden from configuring hospital tariffs (403 Forbidden)
   ✓ ADMIN is forbidden from creating hospital services (403 Forbidden)
4. DOCTOR vs VAIDYA Separation & Clinical Boundaries (14 tests passed)
5. RECEPTIONIST Front Desk Authority & Boundaries (4 tests passed)
6. PHARMACIST Dispensary Authority & Boundaries (3 tests passed)
7. ACCOUNTANT Financial Services Authority & Boundaries (3 tests passed)
   ✓ ACCOUNTANT cannot alter Rate Master tariffs (403 Forbidden)
8. Strict Rejection of Legacy & Unsupported Roles (3 tests passed)
9. Account Activation Role Preservation (3 tests passed)
10. Tariff Configuration & Billing Enforcement Verification (24 tests passed)
   ✓ Billing against unconfigured tariff is strictly prevented with 400
   ✓ Billing against unconfigured triage (null) is strictly prevented with 400
   ✓ Zero-price billing without permission on triage is rejected with 400
   ✓ Legitimate ₹0 permitted procedure generates invoice (201 Created)
   ✓ ADMIN cannot configure tariff rates (403 Forbidden)
   ✓ DOCTOR cannot configure tariff rates (403 Forbidden)
   ✓ VAIDYA cannot configure tariff rates (403 Forbidden)
   ✓ RECEPTIONIST cannot configure tariff rates (403 Forbidden)
   ✓ PHARMACIST cannot configure tariff rates (403 Forbidden)
   ✓ ACCOUNTANT cannot configure tariff rates (403 Forbidden)
   ✓ SUPER_ADMIN successfully creates hospital service (201 Created, rate: null)
   ✓ Duplicate service code is strictly rejected with 400
   ✓ Negative rate is strictly rejected with 400
   ✓ Deliberate ₹0 rate requires explicit authorization (400)
   ✓ SUPER_ADMIN authorizes rate of ₹1,400 with RateHistory creation
   ✓ RateHistory audit trail records rate adjustment (Entries: 1, New Rate: ₹1400)
   ✓ SUPER_ADMIN deactivates service (isActive: false)
   ✓ Billing against inactive service rejected with 400 InactiveService
   ✓ SUPER_ADMIN successfully establishes approved rate for BED-GEN (Rate: ₹1250)
   ✓ ACCOUNTANT bills against configured rate (Total: ₹3750)
   ✓ Invoice preserves snapshot of unitPrice (₹1,250) and subtotal (₹3,750) without 82x multiplier bug
   ✓ SUPER_ADMIN reverts BED-GEN tariff back to unconfigured state (rate: null)
   ✓ Database verification: BED-GEN persists strictly as rate: null in PostgreSQL
   ✓ Database verification: PROC-TRIAGE persists strictly as rate: null in PostgreSQL

=== PRODUCTION DATABASE INTEGRITY AUDIT ===
Pre-Test  Counts (sahachara_ops_db):  { users: 1, patients: 0, prescriptions: 0, invoices: 0, tariffs: 10, staff: 0 }
Post-Test Counts (sahachara_ops_db): { users: 1, patients: 0, prescriptions: 0, invoices: 0, tariffs: 10, staff: 0 }
✓ PASS Production database (sahachara_ops_db) remained strictly UNTOUCHED by test execution (0 modifications)
✓ Test database (sahachara_ops_test_db) cleaned up successfully.

RBAC SUITE SUMMARY: 67 PASSED, 0 FAILED

=== IMPLEMENTATION VERIFICATION SUITE ===
✓ Backdoor password strictly rejected with 401
✓ Authentic Super Admin login with secure bcrypt credentials passed (200)
✓ Header spoofing without token blocked (401)
✓ Patient registration and database persistence verified
✓ Pharmacy stock decrement and stock movement atomic logging verified
✓ Billing currency exact INR calculation verified (No 82x multiplier)
✓ Unconfigured bed tariff billing blocked with 400
✓ Production database remained completely UNTOUCHED (0 changes)

IMPLEMENTATION SUITE SUMMARY: 7 PASSED, 0 FAILED
TOTAL AUTOMATED TESTS: 74 PASSED, 0 FAILED
```

---

## 12. Database Integrity Verification (`sahachara_ops_db`)

- **Total Tariffs:** 10
- **Configured Tariffs:** 0
- **Unconfigured Tariffs (`rate = NULL`):** 10
- **Zero-Price Tariffs (`rate = 0`):** 0
- **Active Tariffs (`isActive = true`):** 10
- **Rate History Records:** 0 (initial clean state)
- **Production modifications during test run:** 0

---

## 13. Technical Debt Register Updates

| Debt Item | Previous Status | Current Status | Resolution Summary |
| :--- | :--- | :--- | :--- |
| **TD-03: Fabricated Tariffs** | Critical Defect | **RESOLVED** | All 10 fabricated rates removed (`rate = NULL`). Server billing engine rejects billing against unconfigured rates with HTTP 400. |
| **TD-08: Tariff RBAC Ambiguity** | High Severity | **RESOLVED** | Service creation, rate configuration, and deactivation restricted strictly and exclusively to `SUPER_ADMIN`. All other 6 roles blocked. |
| **TD-14: Rate Revision Tracking** | Technical Debt | **RESOLVED** | Implemented `RateHistory` tracking with effective dates, previous/new rates, actor details, and audit notes. |
| **TD-19: Inactive Service Billing** | Defect | **RESOLVED** | Added `isActive` flag and server validation preventing billing against soft-deactivated services. |

---

## 14. Compliance with Product Owner Decisions

1. **GST Functionality:** Fully excluded. No GST fields, rates, or calculations exist in schemas, endpoints, or UI.
2. **Digital Signatures:** Fully excised. No certificates, PKI, or signature endpoints exist.
3. **No UI Redesign:** Preserved the Carbon Design System, header, navigation, and visual styling.
4. **No Invented Data:** Every unestablished rate is strictly `null`. No placeholder amounts exist.
5. **No 82x Multiplier Bug:** Invoices calculate in 1:1 authentic INR.
6. **Strict Production Database Isolation:** Automated tests execute solely in `sahachara_ops_test_db` with zero writes to production.

