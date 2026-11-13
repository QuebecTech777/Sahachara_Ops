# Sahachara OS 2.0 — Comprehensive Engineering Audit & Discovery Report
## Document 01: Project Inventory & Technology Stack Discovery

---

### 1. Directory Structure & File Hierarchy

The repository is organized as a unified full-stack monorepo structured around a Vite frontend root with a lightweight embedded Node.js Express server.

```
/Users/highflyer/Desktop/Sahachara_Ops/
├── .env.example                     # Environment variable blueprint
├── bun.lock                         # Bun package lockfile (Bun CLI not present on system)
├── DEPLOYMENT.md                    # Multi-cloud deployment instructions (Render + Vercel + Supabase)
├── index.html                       # HTML5 entrypoint with global error suppression handler
├── metadata.json                    # AI Studio manifest (Contains architectural claims)
├── package.json                     # Root NPM dependencies and lifecycle scripts
├── README.md                        # AI Studio standard documentation
├── render.yaml                      # Render Blueprint Infrastructure-as-Code specification
├── server.ts                        # Server entrypoint (Express HTTP + Vite middleware)
├── tsconfig.json                    # TypeScript compiler configuration (Bundler mode, noEmit)
├── vercel.json                      # Vercel deployment rules and security headers
├── vite.config.ts                   # Vite build configuration with Tailwind CSS v4 plugin
├── prisma/
│   └── schema.prisma                # Prisma ORM schema (13 models, PostgreSQL datasource)
├── public/
│   └── assets/
│       └── aistudio/                # Static assets (3 unused captures, 1 active login banner)
├── server/
│   ├── dataStore.ts                 # In-memory clinical database store (HospitalDataStore)
│   ├── prismaService.ts             # Prisma ORM integration & auth/activation helpers
│   ├── rbacMiddleware.ts            # RBAC middleware, permission maps & context resolvers
│   ├── routes.ts                    # Express API router (33 endpoints across 16 domain controllers)
│   └── supabaseServer.ts            # Backend Supabase JS client & PostgreSQL sync helpers
├── src/
│   ├── App.tsx                      # Root application component, view router, and modal dispatcher
│   ├── index.css                    # Global styles, IBM Carbon CSS tokens, and Tailwind v4 imports
│   ├── main.tsx                     # React 19 DOM bootstrap
│   ├── components/
│   │   ├── VitalHistorySummary.tsx  # Longitudinal vitals summary with synthetic series generator
│   │   ├── ayurveda/
│   │   │   └── DoshaProfile.tsx     # Ayurvedic Prakriti/Vikriti assessment card & editor
│   │   ├── carbon/                  # Custom IBM Carbon Design System v11 UI component replica
│   │   │   ├── CarbonAppSwitcher.tsx
│   │   │   ├── CarbonButton.tsx
│   │   │   ├── CarbonDataTable.tsx
│   │   │   ├── CarbonHeader.tsx
│   │   │   ├── CarbonModal.tsx
│   │   │   ├── CarbonNotification.tsx
│   │   │   ├── CarbonProgressIndicator.tsx
│   │   │   ├── CarbonSearchModal.tsx
│   │   │   ├── CarbonSideNav.tsx
│   │   │   ├── CarbonTabs.tsx
│   │   │   ├── CarbonTag.tsx
│   │   │   └── CarbonTile.tsx
│   │   ├── charts/
│   │   │   ├── VitalSignsChart.tsx  # Multi-vital display widget
│   │   │   └── VitalTrendChart.tsx  # Recharts vital trendline with synthetic data generator
│   │   └── modals/                  # Clinical modal dialogues (18 modals, 1 dead code file)
│   ├── data/
│   │   └── seedData.ts              # Master initial data store (1,992 lines of mock data)
│   ├── services/
│   │   ├── clinicalPdfGenerator.ts  # Accredited clinical & executive PDF generator (jsPDF)
│   │   ├── hospitalApi.ts           # Centralized API client with in-memory fallback (2,016 lines)
│   │   └── supabaseClient.ts        # Client-side Supabase auth and session bridge
│   ├── types/
│   │   └── hospital.ts              # TypeScript domain interfaces, roles, and permission maps
│   └── views/                       # 15 domain view components
└── supabase/
    └── schema.sql                   # Supabase PostgreSQL schema DDL (13 tables, RLS policies, enums)
```

---

### 2. Dependency Inventory & Version Analysis

#### 2.1 Runtime Dependencies (`dependencies`)

| Package Name | Specified Version | Purpose in Codebase | Discovery Finding |
| :--- | :---: | :--- | :--- |
| `react` | `^19.0.1` | Core UI library | Active (React 19 concurrent features utilized) |
| `react-dom` | `^19.0.1` | DOM renderer | Active (`createRoot` bootstrap in `main.tsx`) |
| `express` | `^4.21.2` | Backend HTTP API framework | Active (Handles routing in `server.ts` and `routes.ts`) |
| `cors` | `^2.8.6` | Cross-Origin Resource Sharing | Active (Configured in `server.ts` L19–24) |
| `@prisma/client` | `^6.4.1` | PostgreSQL ORM client | Partially active (Instantiated, only used for Patient/User) |
| `prisma` | `^6.4.1` | Prisma CLI & schema engine | Present in root `prisma/schema.prisma` |
| `@supabase/supabase-js` | `^2.119.0` | Supabase client SDK | Active in `supabaseClient.ts` & `supabaseServer.ts` |
| `bcryptjs` | `^3.0.3` | Password hashing & comparison | Active in `prismaService.ts` for staff authentication |
| `jspdf` | `^4.2.1` | PDF document generation | Active in `clinicalPdfGenerator.ts` |
| `jspdf-autotable` | `^5.0.9` | Tabular formatting for PDF | Active in `clinicalPdfGenerator.ts` |
| `lucide-react` | `^0.546.0` | SVG Iconography | Active across all Carbon and Clinical views |
| `recharts` | `^3.10.1` | Interactive data charts | Active in `VitalTrendChart.tsx` |
| `vite` | `^8.3.0` | Frontend bundler & dev server | Active in `vite.config.ts` and `server.ts` |
| `@tailwindcss/vite` | `^4.3.3` | Tailwind CSS v4 compiler plugin | Active in `vite.config.ts` |
| `@types/bcryptjs` | `^2.4.6` | TypeScript types for bcrypt | Development type dependency miscategorized in `dependencies` |
| `@types/cors` | `^2.8.19` | TypeScript types for CORS | Development type dependency miscategorized in `dependencies` |
| `@google/genai` | `^2.4.0` | Google Gemini AI SDK | **PHANTOM DEPENDENCY** — Never imported or called anywhere |
| `motion` | `^12.23.24` | Animation library (Framer Motion) | **PHANTOM DEPENDENCY** — Never imported or called anywhere |
| `dotenv` | `^17.2.3` | Environment variable loader | **UNUSED DEPENDENCY** — Never configured or called in `server.ts` |

#### 2.2 Developer Tooling Dependencies (`devDependencies`)

| Package Name | Specified Version | Purpose in Codebase | Discovery Finding |
| :--- | :---: | :--- | :--- |
| `typescript` | `^7.0.2` | TypeScript compiler | Version specified as `^7.0.2` (non-standard; TS is on 5.x) |
| `tsx` | `^4.21.0` | TypeScript execution engine | Used in `npm run dev` and `npm run start` |
| `tailwindcss` | `^4.3.3` | Utility-first CSS framework | Active via `@tailwindcss/vite` |
| `autoprefixer` | `^10.4.21` | CSS vendor prefixing | **REDUNDANT** — Not required with Tailwind v4 engine |
| `esbuild` | `^0.25.0` | JS/TS bundler | Transitive helper for Vite/TSX |
| `@types/node` | `^22.14.0` | Node.js typings | Active |
| `@types/react` | `^19.3.0` | React typings | Active |
| `@types/react-dom` | `^19.3.0` | React DOM typings | Active |
| `@types/express` | `^4.17.21` | Express typings | Active |
| `@vitejs/plugin-react` | `^6.1.1` | Vite React compiler plugin | Active in `vite.config.ts` |

---

### 3. Claimed Architecture vs. Discovered Reality

A critical discovery of this audit is a pronounced divergence between metadata claims, UI telemetry strings, and the actual software architecture running on disk:

| Component / Capability | Documented / UI Claim | Actual Implementation Discovered | Discrepancy Severity |
| :--- | :--- | :--- | :---: |
| **Backend Framework** | `metadata.json`: "Nest.js modular clinical backend services"<br>`OverviewDashboard.tsx`: "NestJS REST API v1.0.0 mounted at /api/v1" | Plain Node.js **Express 4.21.2** with procedural route files (`server/routes.ts`). No NestJS modules, controllers, decorators, or dependency injection exist. | **HIGH (Architectural Misrepresentation)** |
| **Frontend Framework** | `metadata.json`: "Next.js architecture" | **Vite 8 SPA** running React 19 with client-side state routing (`activeView` string in `App.tsx`). No Next.js routing, SSR, or API routes exist. | **HIGH (Architectural Misrepresentation)** |
| **UI Component System** | `metadata.json` & `DEPLOYMENT.md`: "Built with IBM Carbon Design System v11" | **Custom Tailwind CSS component replica** in `src/components/carbon/`. The official `@carbon/react` package is not installed. | **INFORMATIONAL (Fidelity High, Library Missing)** |
| **Authentication Engine** | `OverviewDashboard.tsx`: "Better Auth Session Verified" | Ad-hoc custom Express endpoint checking untrusted HTTP headers (`x-user-role`). Supabase Auth client exists but is bypassed by default. | **CRITICAL (Security Masking)** |
| **Database Architecture** | `DEPLOYMENT.md`: "Enterprise PostgreSQL 15+ via Prisma & Supabase" | **Volatile in-memory JavaScript arrays** (`hospitalStore`) initialized from mock seed data. Prisma is wired only to Patient and User tables; 10 modules do not persist. | **CRITICAL (Data Loss Risk)** |
| **Digital PKI Signatures** | `server/routes.ts` & UI: "Ayush National Registry PKI with Biometric Session Key" | Non-cryptographic string character-code multiplication loop with fixed salt string. Zero X.509 certificates, private keys, or digital signature verification. | **HIGH (Compliance Misrepresentation)** |
| **Artificial Intelligence** | `metadata.json`: `MAJOR_CAPABILITY_SERVER_SIDE_GEMINI_API`<br>`package.json`: `@google/genai` | `@google/genai` is never imported. No AI, prompt engineering, or clinical assistance endpoints exist in the application. | **LOW (Dead Code / Metadata Artifact)** |

---

### 4. Configuration & Environment Inventory

#### 4.1 Environment Configuration (`.env.example`)

The environment file defines three logical operational blocks:

1. **AI Studio Secrets**:
   - `GEMINI_API_KEY`: Placeholder for Google GenAI (Unused in application code).
   - `APP_URL`: Applet host URL.
2. **Frontend Configuration (Vercel)**:
   - `VITE_API_BASE_URL`: Base URL for remote Render backend API.
   - `VITE_SUPABASE_URL`: Supabase project URL (`https://<project-ref>.supabase.co`).
   - `VITE_SUPABASE_ANON_KEY`: Supabase client-side publishable key.
3. **Backend Configuration (Render)**:
   - `PORT`: HTTP listener port (defaults to `3000` locally, `10000` on Render).
   - `CLIENT_URL`: Allowed CORS origin for frontend requests.
   - `SUPABASE_SERVICE_ROLE_KEY`: Supabase backend service secret.
   - `DATABASE_URL`: PostgreSQL connection string for Prisma ORM.

#### 4.2 Build & Runtime Scripts (`package.json`)

- `npm run dev`: Executes `tsx server.ts`. Runs Vite in middleware mode inside Express.
- `npm run start`: Executes `tsx server.ts` (Identical to `dev`, relies on `NODE_ENV=production`).
- `npm run build`: Executes `vite build` to compile SPA into `dist/`.
- `npm run preview`: Executes `vite preview` for static inspection.
- `npm run clean`: Shell command `rm -rf dist server.js`.
- `npm run lint`: Executes `tsc --noEmit`.
- **Missing Scripts**: There is **no test script** (`npm test`), no migration script (`prisma migrate`), no seed script, and no code formatting script.

---

### 5. Dead Code, Unused Components & Asset Audit

1. **Unused Component**: `src/components/modals/NewStaffModal.tsx` (366 lines).
   - Superseded by `src/components/modals/NewStaffMemberModal.tsx`.
   - Never imported in `App.tsx` or `DoctorsStaffView.tsx`.
2. **Unused Public Assets**:
   - `public/assets/aistudio/Paste_November_01__2026_-_9_53PM_8fdfc300` (Raw clipboard capture, unreferenced).
   - `public/assets/aistudio/Paste_October_23__2026_-_4_24PM_699a0f22` (Raw clipboard capture, unreferenced).
   - `public/assets/aistudio/Screenshot_2026-11-01_at_10.56.53_PM_f8172758.png` (Screenshot, unreferenced).
   - Only `LOGIN_05a89b00.png` is referenced in `AuthScreenView.tsx` (L212).
3. **Ghost Lockfile**: `bun.lock` exists in the repository root, but Bun is not installed on the execution environment and the repository package manager is NPM.

