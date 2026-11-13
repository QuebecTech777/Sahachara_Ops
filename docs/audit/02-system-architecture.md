# Sahachara OS 2.0 — Comprehensive Engineering Audit & Discovery Report
## Document 02: System Architecture Audit & Request Lifecycles

---

### 1. High-Level Architecture Overview

Sahachara OS 2.0 operates as an **integrated hybrid Single-Page Application (SPA) and Node.js HTTP service**. In development, Vite runs as an embedded middleware inside the Express server process (`server.ts`). In production, Express serves pre-compiled static assets from `dist/` and handles API requests under the `/api` prefix.

However, behind this clean layout lies an architectural divergence: the system maintains **two competing layers of in-memory state** alongside incomplete database persistence integrations.

```mermaid
flowchart TD
    subgraph ClientBrowser["Client Browser (React 19 + Carbon SPA)"]
        UI["UI Views & Modals (15 Views + 18 Modals)"]
        ClientCache["Client-Side In-Memory Cache (inMemoryStore)"]
        HospitalApiClient["HospitalApiClient (src/services/hospitalApi.ts)"]
        SupabaseClientSDK["Supabase Client SDK (src/services/supabaseClient.ts)"]
        PDFGen["Clinical PDF Engine (jspdf / jspdf-autotable)"]
        
        UI -->|Interactions| HospitalApiClient
        HospitalApiClient -->|Read/Write| ClientCache
        UI -->|Export Dossier| PDFGen
        HospitalApiClient -.->|Auth Token Check| SupabaseClientSDK
    end

    subgraph Network["HTTP / REST API Boundary"]
        HTTPReq["HTTP Requests (/api/*)"]
        CustomHeaders["Insecure Headers: x-user-role, x-user-name, x-patient-mrn"]
        HospitalApiClient -->|fetch() + Custom Headers| HTTPReq
    end

    subgraph BackendServer["Backend Application Server (Node.js Express / TSX)"]
        ServerEntry["server.ts (Port 3000 / 10000)"]
        ViteMiddleware["Vite Dev Middleware (Development Only)"]
        StaticServe["Express Static 'dist/' (Production Only)"]
        AuthMiddleware["authenticateContext (server/rbacMiddleware.ts)"]
        RBACGuard["requireRole / requirePermission"]
        ApiRouter["Express API Router (server/routes.ts - 33 Endpoints)"]
        HospitalDataStore["In-Memory Store (server/dataStore.ts - 17 Arrays)"]
        PrismaService["Prisma Service (server/prismaService.ts)"]
        SupabaseServerBridge["Supabase Server Bridge (server/supabaseServer.ts)"]

        HTTPReq --> ServerEntry
        ServerEntry --> AuthMiddleware
        AuthMiddleware --> RBACGuard
        RBACGuard --> ApiRouter
        
        ApiRouter -->|Primary CRUD (10 Modules)| HospitalDataStore
        ApiRouter -->|Patient & Auth CRUD (Partial)| PrismaService
        ApiRouter -.->|Background Sync (Async / Unawaited)| SupabaseServerBridge
    end

    subgraph DataPersistence["External Persistence & Cloud Infrastructure"]
        PostgresDB[("PostgreSQL Database (via Prisma DATABASE_URL)")]
        SupabaseCloud[("Supabase Cloud (PostgreSQL + Auth + Storage)")]
        
        PrismaService -->|Prisma Client Queries| PostgresDB
        SupabaseServerBridge -->|Supabase SDK Upserts| SupabaseCloud
    end

    classDef client fill:#edf5ff,stroke:#0f62fe,stroke-width:1px,color:#0043ce;
    classDef server fill:#f4f4f4,stroke:#525252,stroke-width:1px,color:#161616;
    classDef db fill:#defbe6,stroke:#24a148,stroke-width:1px,color:#0e6027;
    classDef warn fill:#fff1f1,stroke:#da1e28,stroke-width:1px,color:#a2191f;

    class UI,ClientCache,HospitalApiClient,SupabaseClientSDK,PDFGen client;
    class ServerEntry,ViteMiddleware,StaticServe,AuthMiddleware,RBACGuard,ApiRouter,PrismaService,SupabaseServerBridge server;
    class PostgresDB,SupabaseCloud db;
    class CustomHeaders,HospitalDataStore warn;
```

---

### 2. Request Lifecycle Tracing

#### 2.1 Standard Patient Record Creation Lifecycle

Tracing `POST /api/patients` reveals the interaction patterns and failure modes:

```
[User Form Submit]
      │
      ▼
1. React Modal (NewPatientModal.tsx)
      │ invokes onSubmit(formData)
      ▼
2. App.tsx (handleCreatePatient)
      │ calls hospitalApi.createPatient(newPatientData)
      ▼
3. HospitalApiClient (src/services/hospitalApi.ts L408–472)
      │ 3a. Retrieves active user from local state (getCurrentUser)
      │ 3b. Formulates fetch('/api/patients', {
      │       method: 'POST',
      │       headers: {
      │         'x-user-role': currentUser.role,     <-- CLIENT CONTROLS ROLE!
      │         'x-user-name': currentUser.name
      │       },
      │       body: JSON.stringify(patientData)
      │     })
      ▼
4. Express Server (server.ts L28–29 -> server/routes.ts L115)
      │
      ▼
5. Middleware: authenticateContext (server/rbacMiddleware.ts L60–91)
      │ 5a. Checks req.headers['x-user-role'] -> accepts client-provided role!
      │ 5b. Falls back to 'Admin' if header is absent.
      ▼
6. Middleware: requirePermission(CLINICAL_PERMISSIONS.PATIENT_CREATE)
      │ Verifies that resolved role is in ['Admin', 'Doctor', 'Nurse']
      ▼
7. Route Handler: apiRouter.post('/patients') (server/routes.ts L115–173)
      │ 7a. Generates MRN: SAH-[Random 5-digit number] (Non-sequential, collision risk)
      │ 7b. Appends new record to memory: hospitalStore.patients.unshift(newPatient)
      │ 7c. Emits in-memory audit log: hospitalStore.logAudit(...)
      │ 7d. Triggers unawaited sync: persistPatientToSupabase(newPatient).catch(...)
      ▼
8. Supabase Sync (server/supabaseServer.ts L54–100)
      │ Maps properties into row object:
      │   dosha_vata: patient.doshaProfile?.vata ...
      │ EXCEPTION: Column "dosha_vata" does not exist in Supabase schema!
      │ Catch block catches error and logs warning. Database write FAILS SILENTLY!
      ▼
9. HTTP 201 Response returned to client with newPatient JSON
      │
      ▼
10. HospitalApiClient (src/services/hospitalApi.ts L423–427)
      │ 10a. Updates local client cache: this.localPatients.unshift(data)
      │ 10b. Triggers notifyListeners() to re-render all subscribing React components.
```

---

### 3. Critical Architectural Inconsistencies & Anti-Patterns

#### 3.1 The Dual-State "Split-Brain" Architecture

The system maintains two completely independent state stores:
1. **Client-Side Cache (`inMemoryStore` in `hospitalApi.ts`)**: Stored in a closure variable in browser memory.
2. **Server-Side Store (`hospitalStore` in `dataStore.ts`)**: Stored in Node.js heap memory.

**Failure Mode**: Every method in `hospitalApi.ts` wraps its remote `fetch()` in a `try/catch` block. If the Express backend is down, unreachable, returns a 500 error, or fails authentication, the catch block catches the failure and **silently mutates the client-side cache instead**. The user is presented with a success notification and can continue creating records, scheduling appointments, and issuing prescriptions locally. When the browser tab is closed or refreshed, `inMemoryStore` is garbage collected, and **all offline clinical data is permanently lost without notice**.

#### 3.2 Tight Coupling and Absence of Layered Abstractions

In enterprise clinical systems, Clean Architecture dictates strict separation:
`Presentation -> Application/Use Cases -> Domain Core -> Infrastructure/Persistence`.

In Sahachara OS 2.0:
- Route handlers in `server/routes.ts` directly manipulate global arrays (`hospitalStore.prescriptions.unshift(newRx)`).
- Route handlers directly synthesize mock digital signature hashes (`pseudoSha256`).
- Route handlers write directly to an unindexed audit log array.
- There are **no Data Transfer Objects (DTOs)**, no class validators (`class-validator` / `zod`), no Service classes, and no Repository interfaces.

#### 3.3 Premature Fallback Defaults That Introduce Silent Bugs

In `server/routes.ts` and `src/services/hospitalApi.ts`, fallback defaults mask missing data instead of rejecting bad payloads:
- If a patient MRN is missing, a random number is minted: `` `SAH-${Math.floor(10000 + Math.random() * 90000)}` ``. No uniqueness check is executed before insertion.
- If an appointment time slot is omitted, it defaults to `'09:00 AM'`.
- If an appointment type is omitted, it defaults to `'General Consultation'`.
- If emergency contacts are omitted, it populates fake default contact data (`Family Contact, Kin, +91 98470 00001`).

#### 3.4 Single Points of Failure (SPOF) & Concurrency Vulnerabilities

1. **Stateful Node Process**: Because transactions reside in Node.js memory, multi-instance horizontal scaling (e.g. running multiple web dynos or containers behind a load balancer on Render) will cause state divergence where requests hit different server instances with different arrays.
2. **Lack of Mutexes / Concurrency Controls**: When dispensing medications (`/api/pharmacy/prescriptions/:id`), no atomic locks exist. Two concurrent requests to dispense medication or decrement stock quantities will encounter classic race conditions, resulting in negative or corrupt inventory counts.
3. **Unbounded Heap Allocation**: Because in-memory arrays (`hospitalStore.auditLogs`, `hospitalStore.patients`) grow indefinitely with every request and are never truncated or persisted to disk, the server process will eventually crash due to out-of-memory (`FATAL ERROR: Ineffective mark-compacts near heap limit Allocation failed - JavaScript heap out of memory`).

