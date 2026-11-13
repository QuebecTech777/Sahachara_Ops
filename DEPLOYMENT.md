# Sahachara Ayurveda Clinic - Production Deployment Guide

This system is engineered for enterprise-grade deployment across:
- **Frontend**: [Vercel](https://vercel.com) (React 19 + IBM Carbon Design System v11 SPA)
- **Database & Auth**: [Supabase](https://supabase.com) (PostgreSQL 15+ with Row Level Security & Supabase Auth)
- **Backend API**: [Render](https://render.com) (Node.js Express TypeScript with RBAC security middleware)

---

## 1. Supabase Database & Auth Setup

1. Create a new project in your **[Supabase Dashboard](https://app.supabase.com)** (e.g. `sahachara-ayurveda-his`).
2. Navigate to the **SQL Editor** tab in your Supabase dashboard.
3. Open `supabase/schema.sql` from this repository, paste the entire SQL content into the SQL Editor, and click **Run**.
   - This provisions all 12 clinical tables: `patients`, `consultations`, `treatment_plans`, `panchakarma_courses`, `appointments`, `prescriptions`, `medication_stock`, `stock_movements`, `lab_orders`, `invoices`, `staff_members`, and `audit_logs`.
   - Enables **Row Level Security (RLS)** and adds performance indexes on MRNs, dates, and doctor assignments.
4. Go to **Project Settings** -> **API**:
   - Copy **Project URL** (e.g., `https://xyzcompany.supabase.co`).
   - Copy **anon / public** key.
   - Copy **service_role** secret key (for backend).
5. (Optional) In **Authentication** -> **Providers**, verify Email authentication is enabled.

---

## 2. Render Backend Deployment

1. Go to your **[Render Dashboard](https://dashboard.render.com)**.
2. Click **New +** -> **Web Service**.
3. Connect your repository containing this codebase.
4. Configure the Web Service settings:
   - **Name**: `sahachara-ayurveda-backend`
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm run start` (executes `tsx server.ts`)
5. Under **Environment Variables**, add:
   - `NODE_ENV`: `production`
   - `PORT`: `10000` (Render handles this automatically)
   - `CLIENT_URL`: `https://your-app.vercel.app` (your Vercel frontend URL, or `*` for initial testing)
   - `SUPABASE_URL`: `https://<project-ref>.supabase.co`
   - `SUPABASE_SERVICE_ROLE_KEY`: `<your-supabase-service-role-key>`
   - `SUPABASE_ANON_KEY`: `<your-supabase-anon-key>`
6. Click **Deploy Web Service**.
7. Once deployed, copy your Render service URL (e.g., `https://sahachara-ayurveda-backend.onrender.com`).

---

## 3. Vercel Frontend Deployment

1. Go to your **[Vercel Dashboard](https://vercel.com)**.
2. Click **Add New...** -> **Project** and import this repository.
3. Vercel automatically detects the framework preset as **Vite** (configured via `vercel.json`).
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
4. Under **Environment Variables**, add:
   - `VITE_API_BASE_URL`: `https://sahachara-ayurveda-backend.onrender.com` (your Render backend URL)
   - `VITE_SUPABASE_URL`: `https://<project-ref>.supabase.co`
   - `VITE_SUPABASE_ANON_KEY`: `<your-supabase-anon-key>`
5. Click **Deploy**.
6. After deployment completes, copy your Vercel URL (e.g., `https://sahachara-ayurveda.vercel.app`) and update the `CLIENT_URL` variable in your Render backend settings.

---

## 4. Role-Based Access Control (RBAC) Security Matrix

The system enforces strict RBAC security on both the client interface and backend API routes via `server/rbacMiddleware.ts`:

| Resource / Action | Admin | Doctor / Vaidya | Nurse / Therapist | Pharmacist | Billing | Patient |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **EMR Patient Records** | Full CRUD | Read / Write | Read / Write | Read Only | Read Only | Own MRN Only |
| **Purge / Delete Patient** | Yes | No (403) | No (403) | No (403) | No (403) | No (403) |
| **Ayurvedic Consultations** | Full | Create / Sign | View | View | View | View Own |
| **Panchakarma Therapies** | Full | Create / Manage | Log Sessions | View | View | View Own |
| **E-Prescriptions (Issue)** | Full | Create / Sign | View | Dispense | View | View Own |
| **Digital PKI Signatures** | Yes | Authorized | No | No | No | No |
| **Pharmacy Formulary** | Full | View | View | Manage Stock | View | View |
| **Lab Diagnostic Reports** | Full | Verify & Sign | Log Vitals | View | View | View Own |
| **Inpatient Billing** | Full | View | View | View | Full Invoicing | View Own |
| **Staff Onboarding & PIN** | Full | No (403) | No (403) | No (403) | No (403) | No (403) |
| **HIPAA Audit Log Export** | Full | No (403) | No (403) | No (403) | No (403) | No (403) |

---

## 5. Local Dev Preview Verification

When running locally or in development:
- The server runs unified on port 3000 (`npm run dev`), executing Express backend and Vite frontend middleware together.
- If Supabase environment variables are not set, the system gracefully operates on the local high-fidelity clinical data store so all features work seamlessly out of the box.
