# SAHACHARA OPS — AUTOMATED SECURITY SCANNING & DEPENDENCY MANAGEMENT

This guide documents the automated code security scanning, software composition analysis (SCA), and dependency automation infrastructure implemented for the **Sahachara Ops** repository (`QuebecTech777/Sahachara_Ops`).

---

## 1. GitHub CodeQL (Static Application Security Testing - SAST)

### Purpose
GitHub CodeQL performs static semantic analysis on the codebase to detect known security vulnerabilities, data leaks, injection flaws, access-control bypasses, and insecure API usages across both frontend and backend TypeScript/JavaScript source code.

### Workflow File
- Path: [`.github/workflows/codeql.yml`](file:///Users/highflyer/Desktop/Sahachara_Ops/.github/workflows/codeql.yml)

### Scan Coverage
- **Languages:** JavaScript and TypeScript (`javascript-typescript`).
- **Target Directories:** Full repository coverage including `src/` (frontend SPA), `server/` (Express API), `server.ts`, and helper scripts.
- **Excluded Paths:** Build artifacts (`dist/**`), runtime packages (`node_modules/**`), database snapshots (`backups/**`), and legacy migration archives (`docs/pharmacy/**`).
- **Query Suites:** `security-extended` and `security-and-quality` for comprehensive vulnerability and code reliability checks.

### Workflow Triggers
1. **Pull Requests:** Automatically executes on any pull request targeting `main`.
2. **Push to Main:** Automatically analyzes merges and direct pushes to `main`.
3. **Scheduled Weekly Run:** Runs every Monday at 06:00 UTC (`0 6 * * 1`) to catch newly disclosed vulnerabilities in static rule sets.
4. **Manual Dispatch:** Supports manual execution via GitHub Actions (`workflow_dispatch`).

### Permissions
Uses least-privilege GitHub Actions tokens:
```yaml
permissions:
  actions: read
  contents: read
  security-events: write
```

---

## 2. Snyk Security Integration (Software Composition Analysis & SAST)

### Purpose
Snyk monitors the project's dependency tree (`package-lock.json`) for known common vulnerabilities and exposures (CVEs), license compliance issues, and code-level vulnerabilities in third-party and first-party code.

### Workflow File
- Path: [`.github/workflows/snyk.yml`](file:///Users/highflyer/Desktop/Sahachara_Ops/.github/workflows/snyk.yml)

### Scan Coverage & Failure Classification
- **Snyk Open Source (SCA):** Scans direct and transitive dependencies against Snyk's vulnerability database using `package-lock.json`. Enforces high and critical severity failure thresholds.
- **Snyk Code (SAST):** Scans application source code for code-level vulnerabilities.
- If Snyk Code is not enabled for the organization, the workflow reports `SNYK-CODE-0005` as a skipped scan; all other Snyk Code operational errors still fail the job.
- **Strict Exit Code Classification:** Distinguishes genuine vulnerabilities from operational or network failures:
  - Exit code `1`: Vulnerability threshold exceeded (high/critical CVE or code vulnerability detected).
  - Exit code `2`: Operational error (invalid CLI arguments or runner execution defect), except `SNYK-CODE-0005` for the unavailable Snyk Code feature.
  - Exit code `3`: Configuration error (unsupported target or missing project manifest).
  - Exit code `> 3`: Network, authentication, or upstream Snyk API service outages.
- **SARIF Upload:** Emits SARIF reports and uploads them to the GitHub Security tab via `github/codeql-action/upload-sarif@v3` only when the output SARIF file is present. Upload errors do not mask underlying scan results.

### Workflow Triggers
1. **Pull Requests:** Triggers on all PRs targeting `main`.
2. **Push to Main:** Triggers on all pushes to `main`.
3. **Manual Dispatch:** Can be run on-demand via GitHub Actions.

---

## 3. How to Configure the `SNYK_TOKEN` Repository Secret

The Snyk workflow requires an authenticated Snyk API token to access Snyk's scanning engine. If the token is missing, the workflow safely reports the configuration error and halts without false passes.

### Step-by-Step Setup
1. **Generate Snyk Token:**
   - Sign up or log into [https://app.snyk.io](https://app.snyk.io).
   - Navigate to **Account Settings** -> **General** -> **API Token**.
   - Copy your 36-character Snyk API token.
2. **Add to GitHub Repository Secrets:**
   - In GitHub, navigate to the `QuebecTech777/Sahachara_Ops` repository.
   - Click **Settings** -> **Secrets and variables** -> **Actions**.
   - Click **New repository secret**.
   - Set **Name**: `SNYK_TOKEN`.
   - Set **Secret**: Paste your copied Snyk API token.
   - Click **Add secret**.

Once added, the Snyk workflow will authenticate seamlessly on subsequent commits and PRs.

---

## 4. Renovate Dependency Automation

### Purpose
Renovate automates the discovery, grouping, scheduling, and pull-request creation for dependency updates, ensuring dependencies remain secure, supported, and up to date without maintainer fatigue.

### Configuration File
- Path: [`renovate.json`](file:///Users/highflyer/Desktop/Sahachara_Ops/renovate.json)

### Update Strategy & Safety Rules
- **Package Manager:** Strictly tracks `npm` via `package.json` and `package-lock.json`.
- **Scheduled Windows:** Standard dependency updates run **before 6:00 AM IST on Mondays** (`before 6:00am on monday` with timezone `Asia/Kolkata`).
- **Immediate Security Alerts:** Vulnerability updates (`vulnerabilityAlerts`) trigger immediately at any time with high priority (`fix(deps-security): `).
- **Rate Limiting:** Maximum **5 concurrent PRs** and **2 PRs per hour** to prevent notification overload.
- **No Automerge:** `automerge: false` is enforced globally. All dependency updates require maintainer review and successful CI execution before merging.
- **Major vs. Minor Separation:** Major breaking updates are always isolated into separate PRs labeled `major-update` and `breaking-change`.

### Dependency Groupings
Renovate bundles compatible packages into logical groups to minimize PR noise:
1. **React and Frontend Ecosystem:** React 19, IBM Carbon Design System, Recharts, Lucide, Motion.
2. **Vite and Build Tooling:** Vite, `@vitejs/plugin-react`, Tailwind Vite plugin.
3. **Express and Backend Ecosystem:** Express, CORS, Dotenv, Bcryptjs.
4. **Prisma and Database Tooling:** Prisma CLI, `@prisma/client`, Supabase JS client.
5. **Observability and Telemetry:** New Relic Agent, Better Stack Logtail SDKs.
6. **Testing and Development Tooling:** TSX, TypeScript, Node type definitions.
7. **GitHub Actions:** Actions workflows in `.github/workflows/`.

### Pinned Package Protections
- `deepmerge-ts`: Security override to prevent prototype pollution regressions. Renovate is configured with `allowedVersions: ">=8.0.2"`, allowing future safe updates at or above the patched version 8.0.2 while strictly blocking any downgrade below 8.0.2.
- Excluded paths: `docs/pharmacy/**`, `backups/**`, `dist/**`.

---

## 5. Verification Architecture & Mathematical Test Breakdown

The automated testing and quality verification framework consists of **22 distinct verification entries** structured into three tiers:

1. **Core Verification Suites (12 Suites via `npm test`):**
   - `verify-rbac.ts`: 7-Role RBAC and service tariffs.
   - `verify-implementation.ts`: System implementation invariants and database constraints.
   - `verify-pharmacy-price.ts`: Medication pricing and zero fallback integrity.
   - `verify-patient-management.ts`: Master patient record and MRN generation.
   - `verify-appointments-reception.ts`: Appointment queueing and triage.
   - `verify-clinical-operations.ts`: Doctor vs Vaidya clinical workflows.
   - `verify-pharmacy-dispensing.ts`: Dispensing atomicity, idempotency, and FEFO.
   - `verify-financial-operations.ts`: Invoicing, payments, and immutable refund ledger.
   - `verify-staff-management.ts`: Staff onboarding, role binding, and state transitions.
   - `verify-ayush-credentials.ts`: AYUSH practitioner registration credentials.
   - `verify-staff-activation-pin.ts`: 4-digit cryptographically random PIN lifecycle.
   - `verify-observability.ts`: Telemetry fail-open, redaction, and EU beacon routing.
2. **Standalone Security & Integrity Suites (4 Suites via `package.json`):**
   - `npm run test:auth-guard` (`verify-frontend-auth-guard.ts`): Route guards, session recovery, and login lifecycle.
   - `npm run test:api-security` (`verify-api-security-inventory.ts`): Comprehensive 206-endpoint security inventory.
   - `npm run test:data-elimination` (`verify-hardcoded-data-elimination.ts`): Strict absence of synthetic/mock clinical data.
   - `npm run test:rls` (`verify-supabase-rls.ts`): PostgreSQL Row Level Security across all 38 tables.
   *(Total automated test scripts in `package.json` = 12 core + 4 standalone = 16 scripts).*
3. **Build, Schema, Lint & Manifest Gates (6 Gates):**
   - `npx prisma generate`: Generates typed client into `node_modules/@prisma/client`.
   - `npx prisma validate`: Verifies schema relationship and syntax validity.
   - `npm run lint` (`tsc --noEmit`): Full TypeScript static compilation check.
   - `shasum -a 256 -c RELEASE_SOURCE_MANIFEST_SHA256.txt`: Cryptographic integrity check of all 164 source files.
   - `npm audit --audit-level=high`: Dependency vulnerability scanning.
   - `npm run build`: Production client bundle build via Vite.
   *(Total Verification Entries = 16 test scripts + 6 build/schema/manifest gates = 22 entries).*

---

## 6. Maintainer Guide: Reviewing & Merging Dependency PRs

When Renovate creates an update PR:
1. **Inspect the PR Description:** Review release notes, changelog diffs, and breaking change warnings automatically compiled by Renovate.
2. **Verify CI Status:** Confirm that all automated checks in `.github/workflows/ci.yml` have passed:
   - TypeScript compilation (`npm run lint`)
   - Production bundle build (`npm run build`)
   - Core 12-suite verification (`npm test`)
   - Security inventory and route guards (`test:auth-guard`, `test:api-security`)
   - Manifest integrity (`shasum -a 256 -c RELEASE_SOURCE_MANIFEST_SHA256.txt`)
3. **Check Code Quality & Invariants:**
   - Ensure the update does not introduce breaking changes to existing UI or API contracts.
   - For database tooling updates (`prisma`, `@prisma/client`), verify database connectivity and migration compatibility.
4. **Merge Method:** Use **Squash and merge** with a clean commit message following semantic commits.

---

## 7. How to Interpret Scan Results

### CodeQL Results
- Located in GitHub: **Security** tab -> **Code scanning**.
- **Alert Levels:**
  - `Critical` / `High`: Must be triaged and resolved immediately. Blocks PR merge.
  - `Medium` / `Low`: Code quality or hardening recommendations; triage in standard sprint cycles.
- **False Positive Handling:** If an alert is a confirmed false positive, dismiss it in the GitHub UI with a documented rationale (e.g., "False positive: sanitized in upstream middleware"). Never suppress rules globally without architecture review.

### Snyk Results
- Viewable in:
  - Pull request comments and check runs.
  - Snyk Dashboard ([https://app.snyk.io](https://app.snyk.io)).
  - GitHub **Security** tab (via uploaded SARIF).
- **Metrics:** Distinguishes direct dependencies from transitive dependencies, showing the exact dependency chain introducing the CVE.

---

## 8. Handling Critical Vulnerabilities

When a `Critical` or `High` CVE is reported:
1. **Identify the Affected Package:** Determine if it is direct or transitive via `npm ls <package-name>`.
2. **Assess Exploitability:** Check whether Sahachara Ops exposes the vulnerable code path (e.g., untrusted user input reaching the affected function).
3. **Apply Remediation:**
   - If a direct dependency has a patched version: update in `package.json` and run `npm install --package-lock-only` to update `package-lock.json`.
   - If a transitive dependency has a patch: use `overrides` in `package.json` (as done with `deepmerge-ts`).
4. **Update Manifest:** Recompute the SHA-256 hash in `RELEASE_SOURCE_MANIFEST_SHA256.txt`.
5. **Run Full Verification:** Execute `npm run lint`, `npm test`, and `npm run build` locally before opening a patch PR.

---

## 9. Known Limitations & Outstanding Configuration Steps

1. **Remote Execution Prerequisite:** Automated workflows will begin running only after these workflow files are committed to `main` and pushed to GitHub.
2. **`SNYK_TOKEN` Configuration:** Requires manual entry of the repository secret by a repository administrator in GitHub Settings.
3. **GitHub CodeQL Language Support:** JavaScript and TypeScript are analyzed under the unified `javascript-typescript` engine.
4. **Renovate App Installation:** For Renovate to open pull requests automatically, the **Renovate GitHub App** must be installed and granted access to `QuebecTech777/Sahachara_Ops` at [https://github.com/apps/renovate](https://github.com/apps/renovate) (or run via self-hosted Renovate runner).
