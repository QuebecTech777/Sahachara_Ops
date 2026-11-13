# Sahachara OS 2.0 — Comprehensive Engineering Audit & Discovery Report
## Document 06: Authentication, Authorization & RBAC Security Audit

---

### 1. Executive Security Assessment

The security architecture of Sahachara OS 2.0 exhibits **critical structural vulnerabilities**. While the application demonstrates good intent through domain filtering (`@sahachara.com`), HIPAA audit logging, and role-segmented UI visibility, the underlying security controls are trivial to bypass due to client-controlled headers, hardcoded credentials, and simulated cryptography.

---

### 2. Authentication Architecture & Token Handling

#### 2.1 The Pseudo-JWT Token Flaw (`server/prismaService.ts` L144, L191, L284)
When a user authenticates or activates an account, the backend generates a session token:
```ts
token: `jwt_sah_${Date.now()}_${Buffer.from(cleanEmail).toString('base64').slice(0, 16)}`
```
- **Vulnerability**: This is **not a JSON Web Token (JWT)**. It has no cryptographic header, no signed payload, and no HMAC/RSA signature.
- **Impact**: Any attacker can construct a valid-looking token for any email address using standard base64 encoding. Furthermore, the backend **never cryptographically verifies this token** on subsequent requests; it simply inspects HTTP headers.

#### 2.2 Client-Controlled Header Authentication (`server/rbacMiddleware.ts` L60–90)
The universal authentication middleware `authenticateContext` inspects headers:
```ts
const headerRole = req.headers['x-user-role'] as string;
const headerName = req.headers['x-user-name'] as string;
const headerMrn = req.headers['x-patient-mrn'] as string;

// Fallback to role header or default to Admin in dev preview
req.userRole = (req.userRole || headerRole || 'Admin') as UserRole;
req.userName = req.userName || headerName || 'Authenticated User';
req.patientMrn = headerMrn;
```
- **Vulnerability**: 
  1. The server trusts the client's self-declared role in `x-user-role`. Any client can send `x-user-role: Admin` to gain immediate superuser access.
  2. If an attacker strips all headers completely, the server **defaults to granting `Admin` privileges** (`|| 'Admin'`).
  3. This completely invalidates all server-side RBAC checks across the entire system.

#### 2.3 Hardcoded Master Backdoor Password (`server/prismaService.ts` L116)
In `authenticateStaffUser`:
```ts
if (dbUser.passwordHash && password) {
  const valid = bcrypt.compareSync(password, dbUser.passwordHash) || password === 'ayur2026';
  if (!valid) {
    return { success: false, error: 'Invalid password credentials...' };
  }
}
```
- **Vulnerability**: The boolean check `|| password === 'ayur2026'` allows anyone who knows an employee's email address to authenticate into their account by supplying the master password `'ayur2026'`.

#### 2.4 Universal Backdoor Security PINs (`server/prismaService.ts` L233, L299)
In `activateStaffAccount`:
```ts
if (cleanPin !== expectedPin && cleanPin !== '7492' && cleanPin !== '1234') {
  return { success: false, error: 'Invalid security PIN...' };
}
```
- **Vulnerability**: Newly created staff members who are in `pending_activation` status can have their accounts hijacked by anyone supplying universal PIN `'7492'` or `'1234'`, setting an attacker-controlled password.

---

### 3. Role-Based Access Control (RBAC) Evaluation

#### 3.1 Evaluation Against Required Hospital Roles

| Required Hospital Role | Implementation Status | Discovered Mapping & Permissions | Privilege Risk |
| :--- | :---: | :--- | :--- |
| **SUPER_ADMIN** | **Not Implemented** | Only mentioned in an isolated string check in `SettingsWorkspaceView.tsx` (L73). Not declared in `UserRole` enum. | System lacks highest-tier governance separation. |
| **ADMIN** | **Implemented** | Defined in `UserRole`. Full CRUD on all data, can purge patient records. | Anyone can assume Admin via missing headers. |
| **DOCTOR / VAIDYA** | **Implemented** | Defined in `UserRole`. Can create consultations, treatment plans, prescriptions, and sign labs. | Protected from patient deletion, but can be bypassed. |
| **NURSE / THERAPIST** | **Partially Implemented** | `Nurse` exists in `UserRole`. `Panchakarma Therapist` exists only as a staff directory label (`StaffRole`), but in auth maps to `Nurse` or `Admin`. | Therapists possess nurse-level dispensing permissions. |
| **PHARMACIST** | **Not Implemented in Auth** | Exists in `StaffRole`, but **not in `UserRole`**. Automatically escalated to `Admin` by `prismaService.ts` L165! | **CRITICAL PRIVILEGE ESCALATION**: Pharmacists receive full Admin access. |
| **RECEPTIONIST** | **Not Implemented** | Not in `UserRole` or `StaffRole`. Treated as `Administrative Officer` and escalated to `Admin`. | Receptionists receive full Admin access. |
| **ACCOUNTANT / BILLING** | **Not Implemented in Auth** | Exists in `StaffRole` (`Billing Specialist`), but **not in `UserRole`**. Escalated to `Admin` by `prismaService.ts` L165. | Billing specialists receive full Admin access. |
| **PATIENT** | **Implemented** | Defined in `UserRole`. Restricted to own MRN in UI. | Severely vulnerable to IDOR at the API layer. |

#### 3.2 Automatic Privilege Escalation Logic (`server/prismaService.ts` L165, L502)
```ts
const role: UserRole = matchedStaff ? (
  matchedStaff.role.includes('Doctor') ? 'Doctor' : 
  matchedStaff.role.includes('Nurse') ? 'Nurse' : 
  'Admin'
) : (matchedUser?.role || 'Doctor');
```
Because `UserRole` only supports `Admin`, `Doctor`, `Nurse`, and `Patient`, any staff member whose title does not contain `"Doctor"` or `"Nurse"` (including Pharmacists, Lab Technicians, Billing Clerks, Administrative Officers, and Receptionists) **is automatically designated as an `Admin`**.

---

### 4. Vulnerability Catalog & Threat Risk Matrix

```
┌────────────────────────────────────────────────────────────────────────┐
│                      SECURITY VULNERABILITY MATRIX                     │
├─────────┬──────────────────────────────────────────┬──────────┬────────┤
│ ID      │ Vulnerability Title                      │ Severity │ CVSS   │
├─────────┼──────────────────────────────────────────┼──────────┼────────┤
│ SEC-01  │ Header-Based Role Spoofing & Admin Default│ CRITICAL │ 9.8    │
│ SEC-02  │ Hardcoded Master Backdoor Password       │ CRITICAL │ 9.8    │
│ SEC-03  │ Hardcoded Activation Security PINs       │ HIGH     │ 8.6    │
│ SEC-04  │ Arbitrary Privilege Escalation in Staff  │ HIGH     │ 8.8    │
│ SEC-05  │ Insecure Direct Object References (IDOR) │ HIGH     │ 8.2    │
│ SEC-06  │ Permissive Database RLS (`USING (true)`) │ HIGH     │ 8.5    │
│ SEC-07  │ Simulated PKI Digital Signatures         │ MEDIUM   │ 6.5    │
│ SEC-08  │ Missing Rate Limiting on Auth Endpoints  │ MEDIUM   │ 6.8    │
│ SEC-09  │ Client-Side Arbitrary Role Switcher UI   │ MEDIUM   │ 6.0    │
│ SEC-10  │ Overly Permissive CORS Configuration     │ LOW      │ 4.3    │
└─────────┴──────────────────────────────────────────┴──────────┴────────┘
```

#### 4.1 Insecure Direct Object References (IDOR)
While `server/rbacMiddleware.ts` defines `enforcePatientIsolation` (L133–153), **this middleware is not applied to any routes in `server/routes.ts`**.
- An authenticated Patient user can invoke `GET /api/patients/pat-101` or `GET /api/billing/inv-2026-001` or `PATCH /api/appointments/apt-101` and access or modify other patients' medical records simply by changing the ID parameter in the URL.

#### 4.2 Simulated PKI Cryptographic Signatures
In `server/routes.ts` (L624–627):
```ts
const hashSeed = `${rx.rxNumber}|${rx.mrn}|${rx.medicationName}|${rx.dosage}|${signerName}|${signerLicense}|${Date.now()}`;
const pseudoSha256 = 'SHA256:' + Array.from(hashSeed).reduce((acc, char, i) => {
  const code = (char.charCodeAt(0) * (i + 13) * 31).toString(16);
  return (acc + code).slice(0, 64);
}, 'e8b4f190').padEnd(64, 'a93f7c10b');
```
This algorithm does not use SHA-256 (it performs character code multiplication and appends characters) and uses no cryptographic keys. Anyone can generate matching hashes. Legally, under Section 65B of the Indian Evidence Act and the Information Technology Act (IT Act 2000), these signatures are completely void and expose the hospital to statutory non-compliance.

