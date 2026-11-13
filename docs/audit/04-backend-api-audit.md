# Sahachara OS 2.0 — Comprehensive Engineering Audit & Discovery Report
## Document 04: Backend & API Architecture Audit

---

### 1. Backend Architecture Overview

The backend is built as an **Express 4.21.2** REST application written in TypeScript and executed via **tsx**. All routing logic is centralized within a single router file: `server/routes.ts` (1,142 lines), mounted at the `/api` prefix in `server.ts`. 

The backend relies on three primary services:
1. `server/rbacMiddleware.ts`: Request authentication and role enforcement.
2. `server/dataStore.ts`: An in-memory JavaScript singleton (`hospitalStore`) holding 17 domain entity arrays.
3. `server/prismaService.ts`: A Prisma ORM wrapper providing database connectivity checks and user/patient queries.
4. `server/supabaseServer.ts`: A Supabase client wrapper for JWT verification and background synchronization.

---

### 2. Comprehensive API Endpoint Catalog

The backend exposes **33 REST API endpoints** categorized across 16 functional domains:

| # | Method | Route | Purpose | Auth & RBAC Guard | Validation | Database Operations | Integration Status |
| :-: | :---: | :--- | :--- | :--- | :--- | :--- | :--- |
| **1** | `POST` | `/api/auth/login` | Staff authentication | Public (`@sahachara.com` check) | Email domain check | Prisma User query (fallback in-memory) | **Functional** (Contains `'ayur2026'` backdoor) |
| **2** | `POST` | `/api/auth/activate` | PIN account activation | Public (`@sahachara.com` check) | Email, PIN, pwd length | Prisma User update (fallback in-memory) | **Functional** (Accepts `'7492'`, `'1234'` PINs) |
| **3** | `GET` | `/api/clinic/info` | Clinic metadata | Public | None | None (Returns static constant) | **Functional** |
| **4** | `GET` | `/api/overview` | Hospital KPI metrics | Authenticated (Any role) | None | In-memory aggregation (`hospitalStore`) | **Functional** (Contains hardcoded metric fallbacks) |
| **5** | `GET` | `/api/patients` | List active patients | Role-segmented (Patient = own MRN) | None | In-memory filter (Prisma not called) | **Functional** |
| **6** | `GET` | `/api/patients/:id` | Get patient by ID/MRN | Authenticated (Any role) | None | In-memory find (`hospitalStore`) | **Functional** |
| **7** | `POST` | `/api/patients` | Register new patient | `PATIENT_CREATE` (Admin, Doctor, Nurse) | None (Default fallbacks) | In-memory unshift + Supabase sync (fails) | **Partially Functional** (Supabase sync fails) |
| **8** | `PATCH`| `/api/patients/:id` | Update patient record | `PATIENT_UPDATE` (Admin, Doctor, Nurse) | None | In-memory update + Supabase sync | **Functional** |
| **9** | `DELETE`| `/api/patients/:id` | Soft-delete patient | `requireRole(['Admin'])` | None | In-memory soft-delete (`deletedAt`) | **Functional** |
| **10**| `GET` | `/api/appointments` | List appointments | Role-segmented (Patient = own MRN) | None | In-memory filter (`hospitalStore`) | **Functional** |
| **11**| `POST` | `/api/appointments` | Book appointment | **NONE (Unprotected Endpoint)** | None (Default fallbacks) | In-memory unshift (`hospitalStore`) | **Vulnerable** (Zero RBAC guard) |
| **12**| `PATCH`| `/api/appointments/:id`| Reschedule / Cancel | **NONE (Unprotected Endpoint)** | None | In-memory update (`hospitalStore`) | **Vulnerable** (Zero RBAC guard) |
| **13**| `POST` | `/api/appointments/:id/remind`| Dispatch SMS/Email | **NONE (Unprotected Endpoint)** | None | In-memory push (`hospitalStore.reminders`)| **Functional** (Simulation only, no SMS gateway) |
| **14**| `GET` | `/api/reminders` | List reminder logs | Authenticated (Any role) | None | In-memory read (`hospitalStore.reminders`) | **Functional** |
| **15**| `GET` | `/api/triage` | List emergency triage | Authenticated (Any role) | None | In-memory read (`hospitalStore.triageRecords`)| **Functional** |
| **16**| `POST` | `/api/triage` | Score triage intake | **NONE (Unprotected Endpoint)** | None | In-memory unshift (`hospitalStore.triageRecords`)| **Functional** |
| **17**| `PATCH`| `/api/triage/:id` | Update triage status | **NONE (Unprotected Endpoint)** | None | In-memory update (`hospitalStore.triageRecords`)| **Functional** |
| **18**| `GET` | `/api/beds` | Bed census list | Authenticated (Any role) | None | In-memory read (`hospitalStore.beds`) | **Functional** |
| **19**| `PATCH`| `/api/beds/:id` | Transfer / change bed | **NONE (Unprotected Endpoint)** | None | In-memory update (`hospitalStore.beds`) | **Functional** |
| **20**| `GET` | `/api/doctors` | List physician roster | Authenticated (Any role) | None | In-memory read (`hospitalStore.doctors`) | **Functional** |
| **21**| `GET` | `/api/staff` | List staff directory | Authenticated (Any role) | Query filtering | In-memory filter (`hospitalStore.staff`) | **Functional** |
| **22**| `POST` | `/api/staff` | Onboard new staff | Admin check (`x-user-role` header) | Email domain check | In-memory unshift + link to `users` | **Vulnerable** (Header spoofable) |
| **23**| `PATCH`| `/api/staff/:id` | Update staff status | **NONE (Unprotected Endpoint)** | None | In-memory update (`hospitalStore.staff`) | **Vulnerable** (Zero RBAC guard) |
| **24**| `GET` | `/api/pharmacy/prescriptions`| List prescriptions | Role-segmented (Patient = own MRN) | None | In-memory filter (`hospitalStore.prescriptions`)| **Functional** |
| **25**| `POST` | `/api/pharmacy/prescriptions`| Prescribe medication | **NONE (Unprotected Endpoint)** | None | In-memory unshift + pseudo-signature | **Vulnerable** (Zero RBAC guard) |
| **26**| `POST` | `/api/pharmacy/prescriptions/:id/sign`| Digitally sign Rx | Doctor / Admin check (`x-user-role`) | None | In-memory update + pseudo-SHA256 stamp | **Partially Functional** (Simulated PKI) |
| **27**| `PATCH`| `/api/pharmacy/prescriptions/:id`| Dispense medication | **NONE (Unprotected Endpoint)** | None | In-memory update (`hospitalStore.prescriptions`)| **Vulnerable** (No inventory decrement check) |
| **28**| `GET` | `/api/pharmacy/stock`| Formulary stock | Authenticated (Any role) | None | In-memory read (`hospitalStore.medicationStock`)| **Functional** |
| **29**| `POST` | `/api/pharmacy/stock`| Add formulary item | **NONE (Unprotected Endpoint)** | None | In-memory unshift (`hospitalStore.medicationStock`)| **Vulnerable** (Zero RBAC guard) |
| **30**| `GET` | `/api/laboratory` | List lab orders | Role-segmented (Patient = own MRN) | None | In-memory filter (`hospitalStore.labOrders`) | **Functional** |
| **31**| `POST` | `/api/laboratory` | Order diagnostic lab | **NONE (Unprotected Endpoint)** | None | In-memory unshift (`hospitalStore.labOrders`) | **Vulnerable** (Zero RBAC guard) |
| **32**| `POST` | `/api/laboratory/:id/sign`| Digitally approve lab | Doctor / Admin / Lab Tech check | None | In-memory update + pseudo-SHA256 stamp | **Partially Functional** (Simulated PKI) |
| **33**| `PATCH`| `/api/laboratory/:id`| Enter lab test values | **NONE (Unprotected Endpoint)** | None | In-memory update (`hospitalStore.labOrders`) | **Vulnerable** (Zero RBAC guard) |
| **34**| `GET` | `/api/billing` | List hospital bills | Role-segmented (Patient = own MRN) | None | In-memory filter (`hospitalStore.invoices`) | **Functional** |
| **35**| `POST` | `/api/billing` | Create inpatient bill | **NONE (Unprotected Endpoint)** | None | In-memory unshift (`hospitalStore.invoices`) | **Vulnerable** (Zero RBAC guard) |
| **36**| `PATCH`| `/api/billing/:id` | Settle bill payment | **NONE (Unprotected Endpoint)** | None | In-memory update (`hospitalStore.invoices`) | **Vulnerable** (Zero RBAC guard) |
| **37**| `GET` | `/api/rbac/users` | List system users | Authenticated (Any role) | None | In-memory read (`hospitalStore.users`) | **Functional** |
| **38**| `PATCH`| `/api/rbac/users/:id/role`| Modify user role | **NONE (Unprotected Endpoint)** | None | In-memory update (`hospitalStore.users`) | **CRITICAL VULNERABILITY** (Unrestricted privilege escalation) |
| **39**| `GET` | `/api/audit` | Read HIPAA audit logs | Authenticated (Any role) | None | In-memory read (`hospitalStore.auditLogs`) | **Functional** (Unbounded read) |
| **40**| `GET` | `/api/consultations` | List consultations | Role-segmented (Patient = own MRN) | None | In-memory filter (`hospitalStore.consultations`)| **Functional** |
| **41**| `POST` | `/api/consultations` | Save consultation | `CONSULTATION_WRITE` (Admin, Doctor) | None | In-memory unshift + Supabase sync | **Functional** |
| **42**| `PATCH`| `/api/consultations/:id`| Update consultation | **NONE (Unprotected Endpoint)** | None | In-memory update (`hospitalStore.consultations`)| **Vulnerable** (Zero RBAC guard) |
| **43**| `GET` | `/api/treatments` | List treatment plans | Role-segmented (Patient = own MRN) | None | In-memory filter (`hospitalStore.treatmentPlans`)| **Functional** |
| **44**| `POST` | `/api/treatments` | Create treatment plan | **NONE (Unprotected Endpoint)** | None | In-memory unshift (`hospitalStore.treatmentPlans`)| **Vulnerable** (Zero RBAC guard) |
| **45**| `PATCH`| `/api/treatments/:id` | Log therapy session | **NONE (Unprotected Endpoint)** | None | In-memory update (`hospitalStore.treatmentPlans`)| **Vulnerable** (Zero RBAC guard) |
| **46**| `GET` | `/api/panchakarma` | List PK courses | Role-segmented (Patient = own MRN) | None | In-memory filter (`hospitalStore.panchakarmaCourses`)| **Functional** |
| **47**| `POST` | `/api/panchakarma` | Initiate PK course | **NONE (Unprotected Endpoint)** | None | In-memory unshift (`hospitalStore.panchakarmaCourses`)| **Vulnerable** (Zero RBAC guard) |
| **48**| `PATCH`| `/api/panchakarma/:id`| Update PK course | **NONE (Unprotected Endpoint)** | None | In-memory update (`hospitalStore.panchakarmaCourses`)| **Vulnerable** (Zero RBAC guard) |
| **49**| `POST` | `/api/panchakarma/:id/session`| Record daily session | **NONE (Unprotected Endpoint)** | None | In-memory push to `dailySessions` | **Vulnerable** (Zero RBAC guard) |
| **50**| `GET` | `/api/stock-movements`| List stock audit logs | Authenticated (Any role) | None | In-memory read (`hospitalStore.stockMovements`)| **Functional** |
| **51**| `POST` | `/api/stock-movements`| Record inventory delta| **NONE (Unprotected Endpoint)** | None | In-memory unshift (`hospitalStore.stockMovements`)| **Vulnerable** (Zero RBAC guard) |
| **52**| `GET` | `/api/suppliers` | List pharmacy vendors| Authenticated (Any role) | None | In-memory read (`hospitalStore.suppliers`) | **Functional** |

---

### 3. Critical API Vulnerabilities & Engineering Deficits

#### 3.1 Total Absence of Route Guards on 21 State-Mutating Endpoints
While `server/rbacMiddleware.ts` defines comprehensive permission arrays (`CLINICAL_PERMISSIONS.TREATMENT_PLAN_WRITE`, `BILLING_MANAGE`, `RX_CREATE`), **these guards are never applied to their corresponding endpoints in `server/routes.ts`**.

Specifically, the following sensitive endpoints have **zero authorization guards**:
- `POST /api/appointments`, `PATCH /api/appointments/:id` (Anyone can book, reschedule, or cancel any consultation).
- `POST /api/pharmacy/prescriptions` (Anyone can prescribe controlled herbal formulations).
- `PATCH /api/pharmacy/prescriptions/:id` (Anyone can mark prescriptions as dispensed).
- `POST /api/pharmacy/stock` (Anyone can manipulate drug inventory counts).
- `POST /api/laboratory`, `PATCH /api/laboratory/:id` (Anyone can order labs or alter panic values).
- `POST /api/billing`, `PATCH /api/billing/:id` (Anyone can generate invoices or mark bills as paid).
- `PATCH /api/rbac/users/:id/role` (Anyone can promote any user to Admin).
- `POST /api/treatments`, `PATCH /api/treatments/:id` (Anyone can create or alter therapy sessions).
- `POST /api/panchakarma`, `POST /api/panchakarma/:id/session` (Anyone can initiate or complete purification courses).

#### 3.2 Total Lack of Input Schema Validation
There is no request validation library (`zod`, `joi`, `class-validator`, or `express-validator`) used in `routes.ts`. Payloads are assigned directly:
```ts
const body = req.body;
newPatient.firstName = body.firstName || 'New';
newPatient.age = Number(body.age) || 30;
```
If a client sends non-numeric data, malformed JSON objects, or script injection payloads in string fields, the server blindly stores and reflects the data without sanitization.

#### 3.3 Zero Pagination Across All GET Endpoints (Unbounded Memory & Network Load)
Endpoints returning collections (`GET /api/patients`, `GET /api/appointments`, `GET /api/audit`, `GET /api/pharmacy/prescriptions`) return the entire array in a single unpaginated payload. 
- In a functioning hospital with 10,000 patients and 50,000 audit logs, issuing `GET /api/audit` will attempt to serialize a 25MB JSON string in one synchronous event loop cycle, blocking all other incoming HTTP requests and causing browser memory crashes.

#### 3.4 Missing Database Transactions & Race Conditions
When a prescription is dispensed:
1. `PATCH /api/pharmacy/prescriptions/:id` updates prescription status to `'dispensed'`.
2. The inventory in `medicationStock` is NOT automatically decremented on the backend.
3. Decrementing stock relies on an independent client-side call to `hospitalApi.updateStockQuantity()`.
4. There is no transactional atomicity. If step 2 fails, the medication is dispensed without inventory subtraction. If two clinicians dispense simultaneously, inventory counts diverge.

