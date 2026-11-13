# Sahachara OS 2.0 — Comprehensive Engineering Audit & Discovery Report
## Document 08: Performance, Scalability & Resource Management Audit

---

### 1. Performance & Resource Consumption Analysis

#### 1.1 In-Memory Array Heap Growth & Memory Leak Risks
In `server/dataStore.ts`, the `HospitalDataStore` class holds 17 JavaScript arrays in Node.js process memory. Every time an appointment is created, an invoice is generated, a triage record is scored, or an audit log is emitted, new objects are prepended via `.unshift()`.

- **Memory Leak Vector**: These arrays are **never truncated, paginated, or garbage collected**. In a busy hospital operating 24/7 with 150 daily outpatients, 50 therapy sessions, and continuous audit logging, the `auditLogs` and `triageRecords` arrays will accumulate over 100,000 objects within a month.
- **Node.js Heap Collapse**: Node's default V8 heap limit on Render's free/starter tier is 512MB. As JSON payloads grow and arrays expand, V8 garbage collection cycles will introduce severe event-loop pauses (>500ms latency spikes), ultimately triggering:
  `FATAL ERROR: Ineffective mark-compacts near heap limit Allocation failed - JavaScript heap out of memory`.

#### 1.2 Unbounded API Serialization & Event Loop Blocking
None of the 33 API endpoints support pagination (`limit`, `offset`, `cursor`). 
- When `GET /api/audit` or `GET /api/patients` is requested, the server synchronously serializes the entire array into a JSON string using Express's `res.json()`.
- Synchronously serializing 10,000 clinical records blocks the Node.js single-threaded event loop for 40–120ms, freezing all concurrent requests from other doctors, nurses, and receptionists.

---

### 2. Frontend Performance & Bundle Architecture

#### 2.1 Complete Absence of Code-Splitting & Lazy Loading
In `src/App.tsx`, **all 15 views and all 18 modal dialogs are imported statically at the top of the file**:
```ts
import { OverviewDashboard } from './views/OverviewDashboard';
import { PatientsDirectoryView } from './views/PatientsDirectoryView';
...
import { PatientDossierModal } from './components/modals/PatientDossierModal';
import { DownloadSummaryModal } from './components/modals/DownloadSummaryModal';
```
- **Consequence**: Vite bundles the entire application—including heavy third-party libraries such as `recharts`, `jspdf`, `jspdf-autotable`, and `lucide-react`—into a **single monolithic JavaScript bundle**.
- **Impact on Client**: Users on mobile devices or rural hospital connections in Kerala experience high Initial Server Response and First Contentful Paint (FCP) delays (>3.5 seconds on 3G/4G).
- **Remediation**: Views must be split using `React.lazy()` and `Suspense` so that clinical modules (e.g. `ReportsAnalyticsView`, `BillingInsuranceView`) are only downloaded when navigated to.

#### 2.2 Client-Side Global Subscription Over-Rendering
In `src/App.tsx` (L243–249):
```ts
useEffect(() => {
  refreshData();
  const unsubscribe = hospitalApi.subscribe(() => {
    refreshData();
  });
  return unsubscribe;
}, [refreshData]);
```
- `hospitalApi` implements a coarse global subscriber pattern (`notifyListeners()`).
- Whenever a single prescription is dispensed, a triage bed is updated, or an audit log is added, **`refreshData()` executes 14 parallel HTTP requests across every hospital domain simultaneously**:
  `Promise.all([getOverviewMetrics(), getPatients(), getDoctors(), getAppointments(), ...])`.
- This causes massive network thrashing (14 requests per UI action) and forces complete re-rendering of all active React component trees.

---

### 3. Objective Evaluation: Is Redis Necessary?

A common architectural misstep is proposing Redis as an immediate fix for performance problems. A rigorous engineering evaluation reveals:

> [!IMPORTANT]
> **Redis is NOT Recommended at This Stage**:
> 1. The current bottleneck is **not** database I/O latency; the bottleneck is that data is not persisting to the database at all and is instead accumulating in unpaginated in-memory arrays.
> 2. Introducing Redis now would introduce architectural complexity (cache invalidation, cluster management, connection pooling, network hops) without resolving the underlying absence of transactional persistence.
> 3. **PostgreSQL 16 on Supabase is more than capable of handling 500+ concurrent requests with sub-10ms query times** once proper B-tree indexes, foreign keys, and paginated queries (`LIMIT / OFFSET` or keyset pagination) are implemented.
> 4. Redis should only be evaluated in Phase 3 if WebSocket real-time pub/sub scaling or distributed job queues (BullMQ for automated SMS reminders) require it.

---

### 4. Scalability Suitability Assessment Across Growth Tiers

| Deployment Tier | Current Suitability | Limiting Architectural Bottlenecks | Required Changes for Safe Operation |
| :--- | :---: | :--- | :--- |
| **Tier 1: Single Clinic**<br>*(Sahachara Munnar, 1 facility)* | **UNSUITABLE** | Process crash wipes clinical records; master passwords permit unauthorized access. | Implement true PostgreSQL persistence via Prisma; remove backdoor credentials; add database backups. |
| **Tier 2: Multi-Department**<br>*(Kayachikitsa, Panchakarma, Surgery, Pharmacy, Billing)* | **UNSUITABLE** | Lack of database transactions causes race conditions in medication dispensing and billing clearance. | Implement Prisma `$transaction` blocks; enforce role separation between Pharmacist, Billing, and Doctor. |
| **Tier 3: Concurrent Staff (50+ users)** | **UNSUITABLE** | Coarse subscription pattern fires 14 API requests per action; unbounded queries lock event loop. | Implement React Query / SWR for granular cache invalidation; add keyset pagination to all list APIs. |
| **Tier 4: Multi-Facility SaaS**<br>*(Future network of Ayurvedic wellness centers)* | **UNSUITABLE** | Zero multi-tenancy support; database schemas lack `tenant_id` or clinic isolation keys. | Add `tenant_id` column to all tables; configure PostgreSQL Row Level Security by tenant; support custom subdomains. |

---

### 5. Architectural Requirements for Multi-Tenancy Transition

When Sahachara OS eventually expands from a single facility to a multi-hospital health network, the following architectural transformations will be required:
1. **Tenant Identification**: Add a non-nullable `tenant_id UUID REFERENCES organizations(id)` column to every database table.
2. **PostgreSQL RLS Partitioning**: Re-engineer Supabase RLS policies to enforce tenant isolation:
   ```sql
   CREATE POLICY "Tenant isolation policy" ON public.patients
     FOR ALL TO authenticated
     USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
   ```
3. **JWT Multi-Tenant Claims**: Embed `tenant_id` and granular permissions directly into signed Supabase Auth JWTs.
4. **Subdomain Routing**: Implement dynamic tenant resolution in Express middleware based on `req.hostname` (e.g. `munnar.sahachara.com` vs `kochi.sahachara.com`).

