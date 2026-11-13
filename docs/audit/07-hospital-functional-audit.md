# Sahachara OS 2.0 — Comprehensive Engineering Audit & Discovery Report
## Document 07: Hospital Clinical & Operational Workflows Audit

---

### Module 7.1 — Operational Dashboard

#### Implemented Features
- Real-time KPI summary tiles: Active Consultations, Scheduled Appointments, Active Treatments, Active Panchakarma Courses, Doctors on Duty, Critical Lab Alerts, Pending Prescriptions, and Estimated Today Revenue.
- 4 High-Efficiency Quick Action shortcuts ("New Prescription", "New Consultation", "Add Pharmacy Stock", "Generate Bill").
- Operational encounter table displaying active clinical queue with status tags (`SCHEDULED`, `CHECKED IN`, `IN PROGRESS`).
- Accredited executive PDF summary generator (`generateHospitalExecutivePDF`).

#### Partially Implemented Features
- Active Therapy Suites tracker: Displays therapy room cards, but session progress is bound to in-memory state.
- Revenue calculation: Converts invoice amounts using an arbitrary multiplier of 82 (`inv.totalAmount * 82`) to simulate Indian Rupees (INR) from dollar-denominated mock invoices.

#### Mocked / Broken / Missing Features
- **Mocked Diagnostic Runner**: The "Run System Diagnostic" button runs a 600ms timer that displays fabricated strings referencing NestJS and Better Auth.
- **Hardcoded Fallback Counters**: If consultation, treatment, or prescription arrays are empty, the dashboard defaults to hardcoded numbers (`5`, `5`, `4`) instead of reflecting true zero state.
- **Missing Real-Time WebSockets**: No live WebSocket connection updates dashboard metrics; updates require manual clicks on "Refresh Status".

---

### Module 7.2 — Patient Management (EMR)

#### Implemented Features
- Longitudinal Patient Master Registry table with full-text search across MRN, patient name, phone, and clinical condition.
- Demographic data capture: Name, DOB, Age, Gender, Blood Group, Phone, Email, Address, and Emergency Contact.
- Medical background fields: Allergies list, Chronic Conditions, Current Medications, Past Diagnoses, and Medical History Notes.
- Comprehensive Patient Dossier Modal displaying full longitudinal clinical history, vital trends, and encounters.
- Accredited Patient Clinical Summary PDF download via jsPDF (`generatePatientSummaryPDF`).
- Interactive Ayurvedic Dosha Profile widget supporting Prakriti/Vikriti assessments and clinical observations.

#### Partially Implemented Features
- Soft-deletion: Sets `deletedAt` timestamp in memory and marks `deleted_at` in Supabase, but child records (appointments, prescriptions) are not cascaded or soft-deleted.

#### Broken / Missing Features
- **Broken Supabase Database Synchronization**: `persistPatientToSupabase` fails with a PostgreSQL error because the backend attempts to write to non-existent columns (`dosha_vata`, `dosha_pitta`, etc.).
- **Missing Duplicate Patient Prevention**: The registration modal does not verify if a patient with identical phone, email, or government ID (Aadhaar / ABHA) already exists, allowing duplicate patient records.
- **Missing Patient Document Uploads**: No capability exists to attach external laboratory scans, imaging files, or discharge summaries.
- **Fabricated Historical Vitals**: Historical vitals are synthesized dynamically by `VitalHistorySummary.tsx` with fake clinician observer names.

---

### Module 7.3 — Appointments & Scheduling

#### Implemented Features
- Appointment booking modal capturing Patient, Physician, Date, Time Slot, Consultation Type, and Clinical Notes.
- Reschedule appointment modal with new date/time slot selection.
- Cancellation modal with mandatory cancellation reason capture.
- Automated reminder dispatch endpoint simulation (SMS / Email) logging to reminder audit trail.
- Physician availability rosters display.

#### Partially Implemented Features
- Appointment lifecycle statuses (`scheduled`, `checked_in`, `in_progress`, `completed`, `cancelled`, `rescheduled`), but state transitions are not validated by a state machine (e.g. cancelled appointments can be rescheduled without un-cancelling).

#### Broken / Missing Features
- **Missing Conflict & Double-Booking Prevention**: The appointment creation endpoint (`POST /api/appointments`) does not verify if a physician or room is already booked for the chosen date and time slot. Multiple patients can be booked with the same doctor at the exact same time.
- **Zero Database Persistence**: Appointments are not persisted via Prisma ORM; all booked appointments reside exclusively in volatile server memory.
- **Unprotected API Endpoints**: Anyone can book, reschedule, or cancel appointments via the API without authentication or role validation.
- **Simulated Notification Channels**: Reminders do not integrate with real SMS gateways (Twilio, Gupshup) or SMTP servers; they only append a log entry to memory.

---

### Module 7.4 — Clinical Consultations

#### Implemented Features
- Rogi-Roga Pareeksha Ayurvedic clinical intake workspace.
- Ashtavidha & Dashavidha Pareeksha parameters: Nadi (Pulse), Jihva (Tongue), Agni (Digestive Fire), Ama (Toxicity level), Koshtha (Bowel habit), and Nidra (Sleep quality).
- Doshic balance analysis: Prakriti and Vikriti breakdown across Vata, Pitta, and Kapha percentages.
- Clinical diagnostic documentation: Classical Ayurvedic Diagnosis (e.g. *Sandhigata Vata*, *Amavata*), Western medical correlation, and treatment recommendations.
- Direct quick-navigation to Treatment Planning and Pharmacy Prescribing from completed consultation.

#### Partially Implemented Features
- Consultation creation and status transitions (`pending`, `in_progress`, `completed`), but lacks digital signing workflows.

#### Broken / Missing Features
- **Zero Database Persistence**: Consultations are omitted from `prismaService.ts` and exist only in server memory.
- **Missing Prescription Interlock**: Writing prescriptions within a consultation does not automatically generate pharmacy orders in `hospitalStore.prescriptions`; they must be manually re-entered in the Pharmacy module.
- **Missing Patient History Timeline Access**: While reviewing a consultation, clinicians cannot view past laboratory diagnostic results or previous consultation notes side-by-side.

---

### Module 7.5 — Treatments (Chikitsa Upakrama)

#### Implemented Features
- Treatment plan creation supporting classical Ayurvedic external therapies: *Abhyanga*, *Shirodhara*, *Pizhichil*, *Kizhi / Patra Pinda Sweda*, *Kati Basti*, *Janu Basti*, *Greeva Basti*, *Udvartana*, *Takradhara*, and *Karna Poorana*.
- Multi-session treatment tracking: Total sessions allocation, completed session tally, frequency, formulation/oil used, and room/suite assignment.
- Step-by-step progress visualizer showing completion percentages and remaining sessions.
- Session logging modal allowing therapists to record clinical progress notes per session.

#### Partially Implemented Features
- Status progression: Automatically marks treatment plan as `completed` once `completedSessions >= totalSessions`.

#### Broken / Missing Features
- **Zero Database Persistence**: Treatment plans do not persist to PostgreSQL via Prisma.
- **Missing Therapist Availability Check**: Does not verify whether the assigned therapist or therapy room is occupied during the scheduled treatment window.
- **Missing Adverse Reaction Protocol**: No structured field exists to log patient adverse reactions, skin allergies, or contraindications during heated oil therapies.

---

### Module 7.6 — Panchakarma Clinical Suite

#### Implemented Features
- Comprehensive protocol tracking for the 5 Classical Purification Therapies (*Shodhana Chikitsa*):
  1. *Vamana* (Therapeutic Emesis - Kapha elimination)
  2. *Virechana* (Therapeutic Purgation - Pitta cleansing)
  3. *Basti* (Medicated Enema - Vata balance)
  4. *Nasya* (Nasal instillation - Head/ENT disorders)
  5. *Raktamokshana* (Leech / Bloodletting purification)
- Phase lifecycle management: *Purvakarma* (Preparatory Snehana/Swedana) -> *Pradhanakarma* (Main procedure) -> *Paschatkarma* (Post-purification diet).
- Daily clinical observation logging: Blood pressure, pulse rate, appetite evaluation, bowel status, and dietary tolerance (*Samsarjana Krama*).

#### Partially Implemented Features
- Course day completion tallying based on recorded daily session objects.

#### Broken / Missing Features
- **Zero Database Persistence**: Panchakarma courses exist exclusively in server memory arrays.
- **Unprotected Daily Session Submission**: `POST /api/panchakarma/:id/session` has no authorization checks; any client can log clinical parameters for any patient.
- **Missing Standardized Clinical Discharge Protocol**: No structured criteria exist to validate whether *Samsarjana Krama* was completed satisfactorily before patient discharge.

---

### Module 7.7 — Pharmacy & Formulary Management

#### Implemented Features
- Centralized formulary medication stock table tracking Drug Name, Classical Formulation, Category (Kashayam, Thailam, Churna, Arishtam, Vati), Stock Quantity, Unit, Min Threshold, Batch Number, Expiry Date, and Unit Price.
- Low stock and critical stock automated tag calculation (`critical` at <= 40% of threshold; `low_stock` at <= threshold).
- E-Prescription queue displaying patient, doctor, medication, dosage, frequency, route, duration, and status (`pending`, `dispensed`, `cancelled`).
- Digital signature workflow with visual signature canvas capture and verification badge.
- Manual inventory adjustment modal recording stock delta, transaction type, and audit notes.

#### Partially Implemented Features
- Dispensation workflow: Pharmacist marks prescription as `dispensed`, but **does not decrement formulary stock quantity automatically on the server**.

#### Broken / Missing Features
- **Simulated Cryptography**: Digital signatures use an in-memory character code loop rather than real PKI cryptographic certificates.
- **Missing Drug-Drug & Allergy Contraindication Checks**: Issuing a prescription does not cross-check the patient's documented allergies (e.g. Sulfa, Guggulu sensitivity) or concurrent medications.
- **Missing Batch Expiry Interlock**: The system allows dispensing medication from batches whose `expiryDate` has already elapsed.
- **Race Condition on Dispensation**: Simultaneous dispensing by multiple pharmacists causes stock count corruption.

---

### Module 7.8 — Billing & Inpatient Accounting

#### Implemented Features
- Inpatient and outpatient invoice generation with dynamic itemized line items (Bed/Room charges, Physician fees, Pharmacy dispensing, Laboratory tests, Nursing care).
- Co-pay and Ayush health insurance coverage calculation based on coverage percentage.
- Payment clearance workflow (`unpaid`, `partial`, `paid`) and insurance claim status tracking (`pending`, `approved`, `settled`, `rejected`).
- Invoice review modal with printable view and PDF export option.

#### Partially Implemented Features
- Financial aggregation: Computes gross revenue, collected revenue, and outstanding accounts receivable.

#### Broken / Missing Features
- **Currency Inconsistency & Arbitrary Multiplier**: Invoices in `seedData.ts` are stored with dollar values ($2,400, $1,850). The UI and backend multiply these amounts by 82 (`inv.totalAmount * 82`) to present them in Indian Rupees (₹), resulting in inconsistent currency symbols across different views and modal forms.
- **Missing True Invoice Number Sequencing**: Invoice numbers are generated using random numbers (`` `INV-2026-${Math.floor(1000 + Math.random() * 9000)}` ``), creating collision risks and violating statutory sequential numbering requirements for tax compliance (GST / IT Act).
- **Zero Database Persistence**: Invoices are not saved to PostgreSQL via Prisma.

---

### Module 7.9 — Reports & Operational Analytics

#### Implemented Features
- Visual analytics dashboard presenting Workforce Allocation, Doshic Prakriti Distribution, Panchakarma Protocol breakdown, Formulary Valuation, and Financial Totals.
- CSV export utility generating tabular analytics summaries for clinical and administrative review.

#### Partially Implemented Features
- Departmental staff distribution charts showing on-duty clinicians and digital signing authority ratios.

#### Broken / Missing Features
- **Non-Functional Date Range Filtering**: Selecting `Today`, `7 Days`, `30 Days`, `This Month`, or `This Year` updates the UI button state but does not filter any underlying data. All statistics reflect the entire unfiltered dataset.
- **Missing Clinical Audit Aggregations**: No reports track clinical outcomes, readmission rates, therapy completion success rates, or antibiotic/herbal adverse event frequencies.

---

### Module 7.10 — System Settings & Workforce Administration

#### Implemented Features
- Hospital Organization profile editing (Name, Address, City, State, Country, Postal Code, Phone, Email).
- Clinical staff directory management with duty shift assignments, license numbers, and digital signing authorization toggles.
- Document numbering sequence configuration (Patient MRN prefix, Invoice prefix, Receipt prefix).
- Staff onboarding modal generating employee IDs and temporary security activation PINs.

#### Broken / Missing Features
- **Zero Persistence for Organization & System Settings**: Clicking "Save Organization Profile" or "Save System Configuration" only triggers a UI notification toast. No data is sent to the server, and no data is saved to storage.
- **Unrestricted PIN Disclosure**: Temporary security PINs are logged directly in audit details in plain text, making them visible to anyone with access to the Audit Log view.

