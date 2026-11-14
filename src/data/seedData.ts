import {
  Patient,
  TriageRecord,
  Bed,
  Doctor,
  Appointment,
  AppointmentReminder,
  Prescription,
  MedicationStock,
  LabOrder,
  BillInvoice,
  ClinicalAuditLog,
  HospitalOverviewMetrics,
  AppUser,
  Consultation,
  TreatmentPlan,
  PanchakarmaCourse,
  StockMovement,
  PharmacySupplier,
  StaffMember,
  HospitalTariff
} from '../types/hospital';

export const INITIAL_PATIENTS: Patient[] = [
  {
    id: 'pat-101',
    mrn: 'MRN-84920',
    firstName: 'Eleanor',
    lastName: 'Vance',
    dob: '1968-04-12',
    age: 58,
    gender: 'Female',
    bloodGroup: 'O+',
    phone: '+91 9847234 8901',
    email: 'eleanor.vance@example.com',
    address: '742 Evergreen Terrace, Ward 4',
    emergencyContact: {
      name: 'Thomas Vance',
      relationship: 'Spouse',
      phone: '+91 9847234 8902'
    },
    allergies: ['Penicillin', 'Sulfa drugs'],
    chronicConditions: ['Type 2 Diabetes Mellitus', 'Essential Hypertension', 'Coronary Artery Disease'],
    currentMedications: ['Metoprolol Succinate 50mg PO QD', 'Lisinopril 10mg PO QD', 'Metformin 500mg PO BID', 'Aspirin 81mg PO QD'],
    pastDiagnoses: ['Acute NSTEMI (2024)', 'Mild Diastolic Heart Failure', 'Hypertensive Nephrosclerosis'],
    medicalHistoryNotes: 'Patient had drug-eluting stent to LAD in 2024. Routine echocardiogram scheduled. Compliant with lifestyle modifications.',
    admissionStatus: 'consultation',
    assignedDoctorId: 'doc-201',
    assignedDoctorName: 'Dr. Sarah Chen, BAMS, MD (Kayachikitsa)',
    admissionDate: '2026-10-21T08:30:00Z',
    isRegistered: true,
    latestVitals: {
      bpSystolic: 138,
      bpDiastolic: 86,
      heartRate: 74,
      spo2: 98,
      temperature: 36.8,
      respRate: 16,
      recordedAt: '2026-10-23T06:30:00Z'
    },
    doshaProfile: {
      prakriti: {
        vata: 45,
        pitta: 35,
        kapha: 20,
        dominant: 'Vata-Pitta'
      },
      vikriti: {
        vata: 60,
        pitta: 28,
        kapha: 12,
        primaryImbalance: 'Vata-Pitta aggravation with Asthi-Sandhi shula and Hridaya Srotas strain',
        severity: 'Moderate'
      },
      subdoshas: {
        vata: ['Vyana Vayu (Cardiovascular Circulation & Joint movement)', 'Apana Vayu (Pelvic/elimination)'],
        pitta: ['Sadhaka Pitta (Heart & emotional faculties)', 'Pachaka Pitta (Digestion)'],
        kapha: ['Avalambaka Kapha (Thoracic/cardiac support)']
      },
      assessmentDate: '2026-10-22',
      assessedByVaidya: 'Dr. Sarah Chen, BAMS, MD (Ayurveda)',
      clinicalObservations: 'Pulse reveals Sarpa-Manduka gati indicating active Vata-Pitta vriddhi. Joint stiffness in morning hours with mild sama agni.',
      recommendedHerbs: ['Sahacharadi Thailam', 'Dhanwantharam Kwatham', 'Ashwagandha Churna', 'Arjuna Ksheerapaka'],
      dietaryGuidance: 'Warm, unctuous (Snigdha), light diet. Avoid dry, chilled, pungent, and sour items.'
    },
    clinicalNotes: 'Post acute coronary syndrome monitoring. Continuous telemetry indicated stable sinus rhythm. Titrating beta blockers.'
  },
  {
    id: 'pat-102',
    mrn: 'MRN-84921',
    firstName: 'Marcus',
    lastName: 'Sterling',
    dob: '1984-11-23',
    age: 41,
    gender: 'Male',
    bloodGroup: 'A+',
    phone: '+91 9847345 6712',
    email: 'marcus.s@example.com',
    address: '108 Harbor View Blvd, Apt 3B',
    emergencyContact: {
      name: 'Jessica Sterling',
      relationship: 'Sister',
      phone: '+91 9847345 6713'
    },
    allergies: ['Aspirin', 'Ibuprofen (NSAIDs)'],
    chronicConditions: ['Moderate Persistent Asthma'],
    currentMedications: ['Fluticasone/Salmeterol 250/50mcg BID', 'Albuterol HFA Inhaler PRN', 'Zosyn 4.5g IV Q6H (Inpatient)'],
    pastDiagnoses: ['Recurrent Bacterial Bronchitis (2023)', 'Asthma Exacerbation (2025)'],
    medicalHistoryNotes: 'History of multiple ER visits for reactive airway disease. Non-smoker. No prior surgical interventions.',
    admissionStatus: 'outpatient',
    assignedDoctorId: 'doc-202',
    assignedDoctorName: 'Vaidya Anand Kumar, BAMS, MD (Panchakarma)',
    admissionDate: '2026-10-23T01:15:00Z',
    isRegistered: false,
    latestVitals: {
      bpSystolic: 92,
      bpDiastolic: 58,
      heartRate: 118,
      spo2: 91,
      temperature: 38.9,
      respRate: 24,
      gcs: 14,
      recordedAt: '2026-10-23T01:45:00Z'
    },
    doshaProfile: {
      prakriti: {
        vata: 25,
        pitta: 30,
        kapha: 45,
        dominant: 'Pitta-Kapha'
      },
      vikriti: {
        vata: 40,
        pitta: 20,
        kapha: 75,
        primaryImbalance: 'Pranavaha Srotas Avarodha: Severe Kapha vriddhi with secondary Vata viloma',
        severity: 'Severe'
      },
      subdoshas: {
        vata: ['Prana Vayu (Inspiration & Bronchial tone)', 'Udana Vayu (Respiratory effort)'],
        pitta: ['Pachaka Pitta'],
        kapha: ['Kledaka Kapha (Gastric mucosa)', 'Avalambaka Kapha (Lungs & Thorax)']
      },
      assessmentDate: '2026-10-23',
      assessedByVaidya: 'Dr. Robert Rivera, BAMS, MD',
      clinicalObservations: 'Hamsa-gati pulse with prominent Kapha pulse amplitude. Audible wheezing and thick bronchial secretions.',
      recommendedHerbs: ['Vasarishtam', 'Sitopaladi Churna', 'Kanakasavam', 'Trikatu Churna'],
      dietaryGuidance: 'Laghu (light), Ushna (warm) liquids. Strict avoidance of dairy, curds, banana, and oily foods.'
    },
    clinicalNotes: 'Admitted with high-grade sepsis secondary to right lower lobe pneumonia. Empiric broad-spectrum coverage initiated.'
  },
  {
    id: 'pat-103',
    mrn: 'MRN-84922',
    firstName: 'Beatriz',
    lastName: 'Alvarez',
    dob: '1952-09-03',
    age: 74,
    gender: 'Female',
    bloodGroup: 'B+',
    phone: '+91 9847678 9012',
    email: 'b.alvarez@example.com',
    address: '42 Pinecrest Way',
    emergencyContact: {
      name: 'Carlos Alvarez',
      relationship: 'Son',
      phone: '+91 9847678 9014'
    },
    allergies: ['Latex', 'Ciprofloxacin'],
    chronicConditions: ['Atrial Fibrillation', 'Chronic Kidney Disease Stage 3b', 'Osteoarthritis'],
    currentMedications: ['Apixaban 5mg PO BID', 'Torsemide 20mg PO QD', 'Lovenox 40mg SubQ QD', 'Acetaminophen 650mg PRN'],
    pastDiagnoses: ['Transient Ischemic Attack (2021)', 'Total Left Hip Arthroplasty (2020)'],
    medicalHistoryNotes: 'CKD stage 3b baseline Cr 1.8 mg/dL. Renal dosage adjustments strictly observed on all hospital orders.',
    admissionStatus: 'active_treatment',
    assignedDoctorId: 'doc-204',
    assignedDoctorName: 'Dr. Elena Rostova, BAMS, MD (Swasthavritta & Yoga)',
    admissionDate: '2026-10-22T14:20:00Z',
    isRegistered: true,
    latestVitals: {
      bpSystolic: 104,
      bpDiastolic: 62,
      heartRate: 88,
      spo2: 96,
      temperature: 37.1,
      respRate: 18,
      gcs: 15,
      recordedAt: '2026-10-23T05:00:00Z'
    },
    doshaProfile: {
      prakriti: {
        vata: 55,
        pitta: 25,
        kapha: 20,
        dominant: 'Vata'
      },
      vikriti: {
        vata: 78,
        pitta: 15,
        kapha: 12,
        primaryImbalance: 'Severe Vata Vriddhi with Sandhigata Vata & Asthi Dhatu Kshaya',
        severity: 'Severe'
      },
      subdoshas: {
        vata: ['Vyana Vayu (Locomotion & Joint Lubrication)', 'Apana Vayu (Excretion)'],
        pitta: ['Pachaka Pitta'],
        kapha: ['Shleshaka Kapha (Synovial Fluid depletion)']
      },
      assessmentDate: '2026-10-22',
      assessedByVaidya: 'Dr. Elena Rostova, BAMS, MD',
      clinicalObservations: 'Profound crepitus in knee and hip joints. Pulse dry and rapid (Sarpa gati). Insomnia due to nocturia and nocturnal musculoskeletal ache.',
      recommendedHerbs: ['Mahanarayana Thailam', 'Ksheerabala 101', 'Gugguluthikthaka Kwatham', 'Balarishta'],
      dietaryGuidance: 'Nourishing Brimhana diet with ghee, milk with Dashamoola, warm sesame soups.'
    },
    clinicalNotes: 'High-flow nasal cannula weaning protocol ongoing. Renal indices stabilizing after fluid resuscitation.'
  },
  {
    id: 'pat-104',
    mrn: 'MRN-84923',
    firstName: 'Julian',
    lastName: 'Hayes',
    dob: '1995-07-19',
    age: 31,
    gender: 'Male',
    bloodGroup: 'AB-',
    phone: '+91 9847890 1234',
    email: 'julian.hayes@example.com',
    address: '15 Bishopgate Court',
    emergencyContact: {
      name: 'Rachel Hayes',
      relationship: 'Partner',
      phone: '+91 9847890 1235'
    },
    allergies: ['None known'],
    chronicConditions: [],
    currentMedications: ['Cefazolin 2g IV Q8H', 'Oxycodone 5mg PO Q4H PRN pain', 'Enoxaparin 40mg SubQ QD'],
    pastDiagnoses: ['Closed Right Femur Fracture (Traumatic)'],
    medicalHistoryNotes: 'Motorcycle collision. Status post intramedullary nailing. No head trauma or loss of consciousness.',
    admissionStatus: 'active_treatment',
    assignedDoctorId: 'doc-203',
    assignedDoctorName: 'Dr. Arthur Pendelton, BAMS, MS (Shalya Tantra)',
    admissionDate: '2026-10-22T19:40:00Z',
    isRegistered: false,
    latestVitals: {
      bpSystolic: 122,
      bpDiastolic: 78,
      heartRate: 72,
      spo2: 99,
      temperature: 36.6,
      respRate: 14,
      recordedAt: '2026-10-23T04:15:00Z'
    },
    doshaProfile: {
      prakriti: {
        vata: 30,
        pitta: 50,
        kapha: 20,
        dominant: 'Vata-Pitta'
      },
      vikriti: {
        vata: 65,
        pitta: 45,
        kapha: 15,
        primaryImbalance: 'Abhighataja (Post-Traumatic) Vata-Pitta disturbance with Bhagna (fracture healing)',
        severity: 'Moderate'
      },
      subdoshas: {
        vata: ['Vyana Vayu (Musculoskeletal integrity)'],
        pitta: ['Bhrajaka Pitta (Tissue inflammation)'],
        kapha: ['Shleshaka Kapha (Bone callus support)']
      },
      assessmentDate: '2026-10-22',
      assessedByVaidya: 'Dr. Arthur Pendelton, BAMS, MS (Ayurveda Shalya)',
      clinicalObservations: 'Post-reduction orthopedic recovery. Local edema decreasing; needs rapid bone union facilitation.',
      recommendedHerbs: ['Murivenna', 'Gandha Thailam (Bone knitting)', 'Lakshadi Guggulu', 'Hadod (Cissus quadrangularis)'],
      dietaryGuidance: 'Calcium and asthi-supportive diet with bone broth, almond milk, sesame seeds, and Moringa leaf soup.'
    },
    clinicalNotes: 'Right femoral shaft closed fracture, status post intramedullary nailing. Neurovascular intact distally.'
  },
  {
    id: 'pat-105',
    mrn: 'MRN-84924',
    firstName: 'Sophia',
    lastName: 'Kim',
    dob: '2019-02-14',
    age: 7,
    gender: 'Female',
    bloodGroup: 'O-',
    phone: '+91 9847912 3456',
    email: 'daniel.kim@example.com',
    address: '330 Elmhurst Drive',
    emergencyContact: {
      name: 'Daniel Kim',
      relationship: 'Father',
      phone: '+91 9847912 3456'
    },
    allergies: ['Peanuts (Anaphylaxis)'],
    chronicConditions: ['Childhood Asthma'],
    currentMedications: ['Budesonide Nebules 0.5mg BID', 'Albuterol Nebules 2.5mg Q4H PRN', 'EpiPen Jr on file'],
    pastDiagnoses: ['RSV Bronchiolitis (2020)', 'Viral Croup (2023)'],
    medicalHistoryNotes: 'Allergic to peanuts and tree nuts. EpiPen trained family. Immunizations up to date.',
    admissionStatus: 'consultation',
    assignedDoctorId: 'doc-205',
    assignedDoctorName: 'Dr. Maya Lin, BAMS, MD (Kaumarbhritya)',
    admissionDate: '2026-10-22T11:00:00Z',
    isRegistered: true,
    latestVitals: {
      bpSystolic: 102,
      bpDiastolic: 64,
      heartRate: 98,
      spo2: 97,
      temperature: 37.4,
      respRate: 20,
      recordedAt: '2026-10-23T06:00:00Z'
    },
    clinicalNotes: 'Acute viral bronchiolitis with reactive airway. Responding well to nebulized bronchodilators.'
  },
  {
    id: 'pat-106',
    mrn: 'MRN-84925',
    firstName: 'David',
    lastName: 'O’Connor',
    dob: '1976-06-30',
    age: 50,
    gender: 'Male',
    bloodGroup: 'B-',
    phone: '+91 9847789 0123',
    email: 'doconnor@example.com',
    address: '89 Beacon Street',
    emergencyContact: {
      name: 'Nora O’Connor',
      relationship: 'Wife',
      phone: '+91 9847789 0124'
    },
    allergies: ['Iodinated contrast (mild urticaria)'],
    chronicConditions: ['Hyperlipidemia', 'Impaired Fasting Glucose'],
    currentMedications: ['Atorvastatin 40mg PO QD', 'Diet & exercise regimen'],
    pastDiagnoses: ['Pre-diabetes', 'Moderate Coronary Artery Calcification'],
    medicalHistoryNotes: 'Annual preventative cardiology check. Non-smoker, active marathon runner.',
    admissionStatus: 'outpatient',
    assignedDoctorId: 'doc-201',
    assignedDoctorName: 'Dr. Sarah Chen, MD (Cardiology)',
    admissionDate: '2026-10-20T10:00:00Z',
    dischargeDate: '2026-10-21T16:00:00Z',
    isRegistered: true,
    latestVitals: {
      bpSystolic: 126,
      bpDiastolic: 80,
      heartRate: 68,
      spo2: 99,
      temperature: 36.7,
      respRate: 15,
      recordedAt: '2026-10-21T15:30:00Z'
    },
    clinicalNotes: 'Elective coronary CT calcium scoring completed. Scheduled for outpatient stress echo evaluation.'
  }
];

export const INITIAL_TRIAGE: TriageRecord[] = [];

export const INITIAL_BEDS: Bed[] = [
  {
    id: 'bed-icu-01',
    bedNumber: 'ICU-01',
    ward: 'ICU',
    floor: 3,
    status: 'available',
    oxygenConnected: true,
    telemetryEquipped: true,
    notes: 'Negative pressure isolation unit capable'
  },
  {
    id: 'bed-icu-02',
    bedNumber: 'ICU-02',
    ward: 'ICU',
    floor: 3,
    status: 'occupied',
    patientId: 'pat-103',
    patientName: 'Beatriz Alvarez',
    patientMrn: 'MRN-84922',
    admittedAt: '2026-10-22T14:20:00Z',
    attendingDoctor: 'Dr. Elena Rostova, MD',
    oxygenConnected: true,
    telemetryEquipped: true,
    notes: 'Ventilator / High-Flow HFNC ready'
  },
  {
    id: 'bed-icu-03',
    bedNumber: 'ICU-03',
    ward: 'ICU',
    floor: 3,
    status: 'cleaning',
    oxygenConnected: true,
    telemetryEquipped: true,
    notes: 'Terminal decontamination following post-op discharge'
  },
  {
    id: 'bed-ccu-01',
    bedNumber: 'CCU-01',
    ward: 'CCU',
    floor: 3,
    status: 'available',
    oxygenConnected: true,
    telemetryEquipped: true
  },
  {
    id: 'bed-ccu-02',
    bedNumber: 'CCU-02',
    ward: 'CCU',
    floor: 3,
    status: 'occupied',
    patientId: 'pat-101',
    patientName: 'Eleanor Vance',
    patientMrn: 'MRN-84920',
    admittedAt: '2026-10-21T08:30:00Z',
    attendingDoctor: 'Dr. Sarah Chen, MD',
    oxygenConnected: true,
    telemetryEquipped: true
  },
  {
    id: 'bed-trm-01',
    bedNumber: 'TRM-01',
    ward: 'Trauma',
    floor: 2,
    status: 'occupied',
    patientId: 'pat-104',
    patientName: 'Julian Hayes',
    patientMrn: 'MRN-84923',
    admittedAt: '2026-10-22T19:40:00Z',
    attendingDoctor: 'Dr. Arthur Pendelton, MD',
    oxygenConnected: true,
    telemetryEquipped: false
  },
  {
    id: 'bed-trm-02',
    bedNumber: 'TRM-02',
    ward: 'Trauma',
    floor: 2,
    status: 'available',
    oxygenConnected: true,
    telemetryEquipped: false
  },
  {
    id: 'bed-ped-01',
    bedNumber: 'PED-01',
    ward: 'Pediatrics',
    floor: 4,
    status: 'available',
    oxygenConnected: true,
    telemetryEquipped: true
  },
  {
    id: 'bed-ped-02',
    bedNumber: 'PED-02',
    ward: 'Pediatrics',
    floor: 4,
    status: 'occupied',
    patientId: 'pat-105',
    patientName: 'Sophia Kim',
    patientMrn: 'MRN-84924',
    admittedAt: '2026-10-22T11:00:00Z',
    attendingDoctor: 'Dr. Maya Lin, MD',
    oxygenConnected: true,
    telemetryEquipped: true
  },
  {
    id: 'bed-er-01',
    bedNumber: 'ER-BAY-01',
    ward: 'Emergency',
    floor: 1,
    status: 'available',
    oxygenConnected: true,
    telemetryEquipped: true
  },
  {
    id: 'bed-er-02',
    bedNumber: 'ER-BAY-02',
    ward: 'Emergency',
    floor: 1,
    status: 'occupied',
    patientId: 'pat-102',
    patientName: 'Marcus Sterling',
    patientMrn: 'MRN-84921',
    admittedAt: '2026-10-23T01:15:00Z',
    attendingDoctor: 'Dr. Robert Rivera, MD',
    oxygenConnected: true,
    telemetryEquipped: true
  },
  {
    id: 'bed-surg-01',
    bedNumber: 'SURG-01',
    ward: 'General Surgical',
    floor: 2,
    status: 'maintenance',
    oxygenConnected: true,
    telemetryEquipped: false,
    notes: 'Calibration scheduled'
  },
  {
    id: 'bed-mat-01',
    bedNumber: 'MAT-01',
    ward: 'Maternity',
    floor: 4,
    status: 'available',
    oxygenConnected: true,
    telemetryEquipped: true
  }
];

export const INITIAL_DOCTORS: Doctor[] = [
  {
    id: 'doc-201',
    name: 'Dr. Sarah Chen, MD, FACC',
    title: 'Director of Interventional Cardiology',
    specialty: 'Cardiology',
    department: 'Cardiovascular Institute',
    licenseNumber: 'MD-NY-84291',
    status: 'on_duty',
    room: 'Suite C-312',
    phone: '+91 9847019 2041',
    email: 'sarah.chen@sahachara.org',
    activePatientsCount: 6,
    shift: 'Morning (07:00-15:00)',
    availableDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
    timeSlots: ['09:00 AM', '09:30 AM', '10:00 AM', '10:30 AM', '11:00 AM', '02:00 PM', '02:30 PM', '03:00 PM']
  },
  {
    id: 'doc-202',
    name: 'Dr. Robert Rivera, MD, FACEP',
    title: 'Attending Emergency Physician',
    specialty: 'Emergency Medicine',
    department: 'Emergency & Trauma Services',
    licenseNumber: 'MD-NY-77142',
    status: 'on_duty',
    room: 'ER Command 1',
    phone: '+91 9847019 3320',
    email: 'robert.rivera@sahachara.org',
    activePatientsCount: 9,
    shift: 'Morning (07:00-15:00)',
    availableDays: ['Monday', 'Wednesday', 'Friday', 'Saturday'],
    timeSlots: ['08:00 AM', '08:30 AM', '09:00 AM', '09:30 AM', '01:00 PM', '01:30 PM']
  },
  {
    id: 'doc-203',
    name: 'Dr. Arthur Pendelton, MD, FAAOS',
    title: 'Senior Trauma & Orthopedic Surgeon',
    specialty: 'Orthopedics',
    department: 'Surgical Services',
    licenseNumber: 'MD-NY-55102',
    status: 'in_surgery',
    room: 'OR-4 & Suite T-205',
    phone: '+91 9847019 4991',
    email: 'arthur.pendelton@sahachara.org',
    activePatientsCount: 4,
    shift: 'Morning (07:00-15:00)',
    availableDays: ['Tuesday', 'Thursday', 'Friday'],
    timeSlots: ['10:00 AM', '10:30 AM', '11:00 AM', '03:00 PM', '03:30 PM', '04:00 PM']
  },
  {
    id: 'doc-204',
    name: 'Dr. Elena Rostova, MD, FCCP',
    title: 'Chief of Critical Care Medicine',
    specialty: 'Pulmonology',
    department: 'Intensive Care Unit',
    licenseNumber: 'MD-NY-99410',
    status: 'on_duty',
    room: 'ICU Station B',
    phone: '+91 9847019 5882',
    email: 'elena.rostova@sahachara.org',
    activePatientsCount: 5,
    shift: 'Morning (07:00-15:00)',
    availableDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday'],
    timeSlots: ['09:00 AM', '10:00 AM', '11:00 AM', '02:00 PM', '03:00 PM']
  },
  {
    id: 'doc-205',
    name: 'Dr. Maya Lin, MD, FAAP',
    title: 'Attending Pediatrician',
    specialty: 'Pediatrics',
    department: 'Pediatric Care Center',
    licenseNumber: 'MD-NY-61294',
    status: 'on_call',
    room: 'Suite P-114',
    phone: '+91 9847019 7104',
    email: 'maya.lin@sahachara.org',
    activePatientsCount: 3,
    shift: 'Morning (07:00-15:00)',
    availableDays: ['Monday', 'Tuesday', 'Wednesday', 'Friday'],
    timeSlots: ['09:00 AM', '09:30 AM', '10:00 AM', '10:30 AM', '01:30 PM', '02:00 PM', '02:30 PM']
  },
  {
    id: 'doc-206',
    name: 'Dr. Tariq Al-Mansoor, MD',
    title: 'Senior Neurologist',
    specialty: 'Neurology',
    department: 'Neurological Sciences',
    licenseNumber: 'MD-NY-44820',
    status: 'off_duty',
    room: 'Suite N-401',
    phone: '+91 9847019 8833',
    email: 'tariq.mansoor@sahachara.org',
    activePatientsCount: 2,
    shift: 'Evening (15:00-23:00)',
    availableDays: ['Wednesday', 'Thursday', 'Friday'],
    timeSlots: ['03:00 PM', '03:30 PM', '04:00 PM', '04:30 PM', '05:00 PM']
  }
];

export const INITIAL_APPOINTMENTS: Appointment[] = [
  {
    id: 'apt-301',
    patientId: 'pat-101',
    patientName: 'Eleanor Vance',
    patientMrn: 'MRN-84920',
    patientPhone: '+91 9847234 8901',
    patientEmail: 'eleanor.vance@example.com',
    doctorId: 'doc-201',
    doctorName: 'Dr. Sarah Chen, MD (Cardiology)',
    department: 'Cardiovascular Institute',
    dateTime: '2026-10-24T10:00:00',
    timeSlot: '10:00 AM',
    type: 'Follow-up',
    status: 'scheduled',
    notes: 'Post-cardiac stent routine echocardiogram evaluation and beta-blocker titration.',
    reminderSent: true,
    reminderChannel: 'both',
    reminderSentAt: '2026-10-23T08:00:00Z'
  },
  {
    id: 'pat-apt-302',
    patientId: 'pat-106',
    patientName: 'David O’Connor',
    patientMrn: 'MRN-84925',
    patientPhone: '+91 9847789 0123',
    patientEmail: 'doconnor@example.com',
    doctorId: 'doc-201',
    doctorName: 'Dr. Sarah Chen, MD (Cardiology)',
    department: 'Cardiovascular Institute',
    dateTime: '2026-10-24T11:00:00',
    timeSlot: '11:00 AM',
    type: 'Diagnostic Review',
    status: 'scheduled',
    notes: 'Coronary CT calcium score review and lipid management strategy.',
    reminderSent: true,
    reminderChannel: 'sms',
    reminderSentAt: '2026-10-23T08:30:00Z'
  },
  {
    id: 'apt-303',
    patientId: 'pat-104',
    patientName: 'Julian Hayes',
    patientMrn: 'MRN-84923',
    patientPhone: '+91 9847890 1234',
    patientEmail: 'julian.hayes@example.com',
    doctorId: 'doc-203',
    doctorName: 'Dr. Arthur Pendelton, MD (Orthopedics)',
    department: 'Surgical Services',
    dateTime: '2026-10-25T14:30:00',
    timeSlot: '02:30 PM',
    type: 'Pre-op Assessment',
    status: 'scheduled',
    notes: 'Right femur post-op wound check, x-ray alignment verification.',
    reminderSent: false
  },
  {
    id: 'apt-304',
    patientId: 'pat-105',
    patientName: 'Sophia Kim',
    patientMrn: 'MRN-84924',
    patientPhone: '+91 9847912 3456',
    patientEmail: 'daniel.kim@example.com',
    doctorId: 'doc-205',
    doctorName: 'Dr. Maya Lin, MD (Pediatrics)',
    department: 'Pediatric Care Center',
    dateTime: '2026-10-24T09:30:00',
    timeSlot: '09:30 AM',
    type: 'Follow-up',
    status: 'scheduled',
    notes: 'Pediatric asthma checkup, peak flow measurement and inhaler review.',
    reminderSent: true,
    reminderChannel: 'email',
    reminderSentAt: '2026-10-23T07:15:00Z'
  },
  {
    id: 'apt-305',
    patientId: 'pat-101',
    patientName: 'Eleanor Vance',
    patientMrn: 'MRN-84920',
    patientPhone: '+91 9847234 8901',
    patientEmail: 'eleanor.vance@example.com',
    doctorId: 'doc-204',
    doctorName: 'Dr. Elena Rostova, MD (Pulmonology)',
    department: 'Intensive Care Unit',
    dateTime: '2026-10-26T10:00:00',
    timeSlot: '10:00 AM',
    type: 'General Consultation',
    status: 'scheduled',
    notes: 'Nocturnal dyspnea evaluation and pulmonary function screening.',
    reminderSent: false
  }
];

export const INITIAL_REMINDERS: AppointmentReminder[] = [
  {
    id: 'rem-01',
    appointmentId: 'apt-301',
    patientId: 'pat-101',
    patientName: 'Eleanor Vance',
    recipientPhone: '+91 9847234 8901',
    recipientEmail: 'eleanor.vance@example.com',
    doctorName: 'Dr. Sarah Chen, MD',
    dateTime: '2026-10-24 at 10:00 AM',
    channel: 'SMS',
    status: 'Delivered',
    sentAt: '2026-10-23T08:00:00Z',
    messageContent: 'SahacharaOS Alert: Eleanor Vance, your Cardiology appointment with Dr. Sarah Chen is scheduled for Oct 24 at 10:00 AM at Suite C-312. Reply CONFIRM to confirm.'
  },
  {
    id: 'rem-02',
    appointmentId: 'apt-301',
    patientId: 'pat-101',
    patientName: 'Eleanor Vance',
    recipientPhone: '+91 9847234 8901',
    recipientEmail: 'eleanor.vance@example.com',
    doctorName: 'Dr. Sarah Chen, MD',
    dateTime: '2026-10-24 at 10:00 AM',
    channel: 'Email',
    status: 'Delivered',
    sentAt: '2026-10-23T08:00:00Z',
    messageContent: 'Subject: Upcoming Cardiology Follow-Up Appointment - SahacharaOS Health System. Instructions: Please bring your current medication list.'
  },
  {
    id: 'rem-03',
    appointmentId: 'pat-apt-302',
    patientId: 'pat-106',
    patientName: 'David O’Connor',
    recipientPhone: '+91 9847789 0123',
    recipientEmail: 'doconnor@example.com',
    doctorName: 'Dr. Sarah Chen, MD',
    dateTime: '2026-10-24 at 11:00 AM',
    channel: 'SMS',
    status: 'Delivered',
    sentAt: '2026-10-23T08:30:00Z',
    messageContent: 'SahacharaOS Alert: David O’Connor, appointment reminder for CT Calcium Scoring review with Dr. Sarah Chen on Oct 24 at 11:00 AM.'
  }
];

export const INITIAL_PRESCRIPTIONS: Prescription[] = [
  {
    id: 'rx-501',
    rxNumber: 'RX-2026-9901',
    patientId: 'pat-101',
    patientName: 'Eleanor Vance',
    mrn: 'MRN-84920',
    doctorId: 'doc-201',
    doctorName: 'Dr. Sarah Chen, MD',
    datePrescribed: '2026-10-22T09:00:00Z',
    medicationName: 'Metoprolol Succinate',
    dosage: '50 mg',
    frequency: 'Once daily in the morning',
    route: 'Oral',
    duration: '30 days',
    status: 'dispensed',
    dispensedBy: 'Pharm. Katherine Brooks, RPh',
    dispensedAt: '2026-10-22T10:15:00Z',
    pharmacyNotes: 'Counselled on blood pressure monitoring and heart rate checks.'
  },
  {
    id: 'rx-502',
    rxNumber: 'RX-2026-9902',
    patientId: 'pat-102',
    patientName: 'Marcus Sterling',
    mrn: 'MRN-84921',
    doctorId: 'doc-202',
    doctorName: 'Dr. Robert Rivera, MD',
    datePrescribed: '2026-10-23T01:30:00Z',
    medicationName: 'Piperacillin-Tazobactam (Zosyn)',
    dosage: '4.5 g',
    frequency: 'Every 6 hours extended infusion',
    route: 'IV',
    duration: '7 days',
    status: 'pending',
    pharmacyNotes: 'STAT preparation requested for ICU/ER resuscitation bay.'
    // Awaiting pharmacist verification before dispensing
  },
  {
    id: 'rx-503',
    rxNumber: 'RX-2026-9903',
    patientId: 'pat-103',
    patientName: 'Beatriz Alvarez',
    mrn: 'MRN-84922',
    doctorId: 'doc-204',
    doctorName: 'Dr. Elena Rostova, MD',
    datePrescribed: '2026-10-22T16:00:00Z',
    medicationName: 'Enoxaparin Sodium (Lovenox)',
    dosage: '40 mg',
    frequency: 'Every 24 hours subcutaneous',
    route: 'IM',
    duration: '5 days',
    status: 'dispensed',
    dispensedBy: 'Pharm. Katherine Brooks, RPh',
    dispensedAt: '2026-10-22T17:00:00Z',
    pharmacyNotes: 'Renal dose adjusted based on eGFR 42 mL/min.'
  },
  {
    id: 'rx-504',
    rxNumber: 'RX-2026-9904',
    patientId: 'pat-104',
    patientName: 'Julian Hayes',
    mrn: 'MRN-84923',
    doctorId: 'doc-203',
    doctorName: 'Dr. Arthur Pendelton, MD',
    datePrescribed: '2026-10-22T20:30:00Z',
    medicationName: 'Cefazolin',
    dosage: '2 g',
    frequency: 'Every 8 hours',
    route: 'IV',
    duration: '24 hours post-op',
    status: 'dispensed',
    dispensedBy: 'Pharm. Kevin Patel, PharmD',
    dispensedAt: '2026-10-22T21:00:00Z'
  }
];

export const INITIAL_MEDICATION_STOCK: MedicationStock[] = [
  {
    id: 'med-01',
    drugName: 'Piperacillin-Tazobactam',
    genericName: 'Zosyn',
    category: 'Antibiotic (Broad Spectrum)',
    form: 'Injection',
    stockQuantity: 42,
    unit: 'vials',
    minThreshold: 50,
    batchNumber: 'BT-88910',
    expiryDate: '2027-08-30',
    unitPrice: null, // Price unconfigured - hospital tariff not yet established
    status: 'low_stock'
  },
  {
    id: 'med-02',
    drugName: 'Metoprolol Succinate',
    genericName: 'Toprol-XL',
    category: 'Beta-1 Selective Adrenergic Blocker',
    form: 'Tablet',
    stockQuantity: 480,
    unit: 'tablets',
    minThreshold: 100,
    batchNumber: 'BT-44211',
    expiryDate: '2028-02-15',
    unitPrice: null, // Price unconfigured - hospital tariff not yet established
    status: 'in_stock'
  },
  {
    id: 'med-03',
    drugName: 'Norepinephrine Bitartrate',
    genericName: 'Levophed 4mg/4mL',
    category: 'Vasopressor / Resuscitation',
    form: 'Injection',
    stockQuantity: 14,
    unit: 'ampoules',
    minThreshold: 20,
    batchNumber: 'BT-10294',
    expiryDate: '2027-04-10',
    unitPrice: null, // Price unconfigured - hospital tariff not yet established
    status: 'critical'
  },
  {
    id: 'med-04',
    drugName: 'Enoxaparin Sodium',
    genericName: 'Lovenox 40mg/0.4mL',
    category: 'Low Molecular Weight Heparin',
    form: 'Injection',
    stockQuantity: 180,
    unit: 'syringes',
    minThreshold: 60,
    batchNumber: 'BT-99014',
    expiryDate: '2027-11-20',
    unitPrice: null, // Price unconfigured - hospital tariff not yet established
    status: 'in_stock'
  },
  {
    id: 'med-05',
    drugName: 'Albuterol Sulfate Solution',
    genericName: 'Ventolin Nebules',
    category: 'Bronchodilator',
    form: 'Inhaler',
    stockQuantity: 95,
    unit: 'vials',
    minThreshold: 40,
    batchNumber: 'BT-77291',
    expiryDate: '2027-06-01',
    unitPrice: null, // Price unconfigured - hospital tariff not yet established
    status: 'in_stock'
  },
  {
    id: 'med-ayur-01',
    drugName: 'Sahacharadi Thailam',
    genericName: 'Classical Medicated Oil (Strobilanthes ciliatus)',
    category: 'Vata Hara Medicated Oil',
    form: 'Syrup',
    stockQuantity: 45,
    unit: 'bottles (450ml)',
    minThreshold: 15,
    batchNumber: 'AY-2026-901',
    expiryDate: '2028-05-15',
    unitPrice: null, // Price unconfigured - hospital tariff not yet established
    status: 'in_stock'
  },
  {
    id: 'med-ayur-02',
    drugName: 'Dhanwantharam Kashayam',
    genericName: 'Bala-Dashamula Concentrated Decoction',
    category: 'Neuromuscular & Vata Vyadhi',
    form: 'Syrup',
    stockQuantity: 32,
    unit: 'bottles (200ml)',
    minThreshold: 20,
    batchNumber: 'AY-2026-882',
    expiryDate: '2027-12-10',
    unitPrice: null, // Price unconfigured - hospital tariff not yet established
    status: 'in_stock'
  },
  {
    id: 'med-ayur-03',
    drugName: 'Triphala Churna',
    genericName: 'Haritaki, Bibhitaki, Amalaki Micro-pulverized',
    category: 'Anulomana & Deepana',
    form: 'Tablet',
    stockQuantity: 120,
    unit: 'jars (100g)',
    minThreshold: 30,
    batchNumber: 'AY-2026-744',
    expiryDate: '2028-09-01',
    unitPrice: null, // Price unconfigured - hospital tariff not yet established
    status: 'in_stock'
  },
  {
    id: 'med-ayur-04',
    drugName: 'Ashwagandharishta',
    genericName: 'Self-fermented Rasayana Withania somnifera',
    category: 'Nervine Tonic & Medhya',
    form: 'Syrup',
    stockQuantity: 8,
    unit: 'bottles (450ml)',
    minThreshold: 12,
    batchNumber: 'AY-2026-612',
    expiryDate: '2029-01-20',
    unitPrice: null, // Price unconfigured - hospital tariff not yet established
    status: 'low_stock'
  },
  {
    id: 'med-ayur-05',
    drugName: 'Ksheerabala 101 Avarthana',
    genericName: '101 Times Fortified Sida cordifolia Drops',
    category: 'Intensive Vata Rasayana',
    form: 'Tablet',
    stockQuantity: 24,
    unit: 'dropper vials (25ml)',
    minThreshold: 10,
    batchNumber: 'AY-2026-550',
    expiryDate: '2028-04-12',
    unitPrice: null, // Price unconfigured - hospital tariff not yet established
    status: 'in_stock'
  },
  {
    id: 'med-ayur-06',
    drugName: 'Yogaraja Guggulu',
    genericName: 'Purified Commiphora mukul compound',
    category: 'Amavata & Anti-arthritic',
    form: 'Tablet',
    stockQuantity: 5,
    unit: 'bottles (60 tabs)',
    minThreshold: 15,
    batchNumber: 'AY-2026-402',
    expiryDate: '2027-08-30',
    unitPrice: null, // Price unconfigured - hospital tariff not yet established
    status: 'critical'
  }
];

export const INITIAL_LAB_ORDERS: LabOrder[] = [
  {
    id: 'lab-301',
    orderNumber: 'LAB-2026-8801',
    patientId: 'pat-102',
    patientName: 'Marcus Sterling',
    mrn: 'MRN-84921',
    testType: 'Cardiac Troponin I (High-Sensitivity)',
    priority: 'STAT (Immediate)',
    orderingDoctor: 'Dr. Robert Rivera, MD',
    orderedAt: '2026-10-23T01:25:00Z',
    status: 'completed',
    normalRange: '< 0.04 ng/mL',
    resultValue: '0.18 ng/mL',
    unit: 'ng/mL',
    isAbnormal: true,
    labNotes: 'Elevated. Suggests secondary myocardial injury (Type 2 NSTEMI) in severe sepsis context.'
  },
  {
    id: 'lab-302',
    orderNumber: 'LAB-2026-8802',
    patientId: 'pat-102',
    patientName: 'Marcus Sterling',
    mrn: 'MRN-84921',
    testType: 'Arterial Blood Gas (ABG)',
    priority: 'STAT (Immediate)',
    orderingDoctor: 'Dr. Robert Rivera, MD',
    orderedAt: '2026-10-23T01:30:00Z',
    status: 'completed',
    normalRange: 'pH: 7.35-7.45, PaO2: 80-100',
    resultValue: 'pH: 7.28, PaO2: 66, Lactate: 4.2',
    unit: 'pH / mmHg / mmol/L',
    isAbnormal: true,
    labNotes: 'Metabolic acidosis with hyperlactatemia consistent with hypoperfusion.'
  },
  {
    id: 'lab-303',
    orderNumber: 'LAB-2026-8803',
    patientId: 'pat-101',
    patientName: 'Eleanor Vance',
    mrn: 'MRN-84920',
    testType: 'Comprehensive Metabolic Panel (CMP)',
    priority: 'Routine',
    orderingDoctor: 'Dr. Sarah Chen, MD',
    orderedAt: '2026-10-22T07:00:00Z',
    status: 'verified',
    normalRange: 'K: 3.5-5.0, Creatinine: 0.6-1.2',
    resultValue: 'K: 4.3, Creatinine: 1.0, eGFR: >60',
    unit: 'mg/dL / mEq/L',
    isAbnormal: false,
    labNotes: 'Electrolytes within normal limits. Verified and cleared for release.',
    verifiedBy: 'Smt. Ananya Sen, Senior Biochemist',
    verifiedAt: '2026-10-22T08:15:00Z'
  },
  {
    id: 'lab-304',
    orderNumber: 'LAB-2026-8804',
    patientId: 'pat-104',
    patientName: 'Julian Hayes',
    mrn: 'MRN-84923',
    testType: 'Complete Blood Count (CBC)',
    priority: 'Urgent (<2 hrs)',
    orderingDoctor: 'Dr. Arthur Pendelton, MD',
    orderedAt: '2026-10-23T04:00:00Z',
    status: 'completed',
    normalRange: 'Hb: 13.5-17.5 g/dL, WBC: 4.5-11.0',
    resultValue: 'Hb: 11.2 g/dL, WBC: 12.4 x10^3/uL',
    unit: 'g/dL / x10^3/uL',
    isAbnormal: true,
    labNotes: 'Mild post-surgical anemia; leukocytosis appropriate for surgical trauma.'
  },
  {
    id: 'lab-305',
    orderNumber: 'LAB-2026-8805',
    patientId: 'pat-103',
    patientName: 'Beatriz Alvarez',
    mrn: 'MRN-84922',
    testType: 'Coagulation Panel (PT/INR)',
    priority: 'Routine',
    orderingDoctor: 'Dr. Elena Rostova, MD',
    orderedAt: '2026-10-23T05:30:00Z',
    status: 'analyzing',
    normalRange: 'INR: 0.9 - 1.1',
    labNotes: 'Specimen received in central clinical laboratory.'
  }
];

export const INITIAL_INVOICES: BillInvoice[] = [
  {
    id: 'inv-901',
    invoiceNumber: 'INV-2026-4011',
    patientId: 'pat-101',
    patientName: 'Eleanor Vance',
    mrn: 'MRN-84920',
    admissionDate: '2026-10-21T08:30:00Z',
    items: [
      {
        id: 'bi-1',
        description: 'Cardiology Telemetry Step-Down Bed (2 Days)',
        category: 'Bed/Room',
        quantity: 2,
        unitPrice: 1200,
        total: 2400
      },
      {
        id: 'bi-2',
        description: 'Attending Cardiologist Daily Care & Rounding',
        category: 'Physician Fee',
        quantity: 2,
        unitPrice: 450,
        total: 900
      },
      {
        id: 'bi-3',
        description: 'Serial Troponin & Comprehensive Metabolic Panels',
        category: 'Laboratory',
        quantity: 3,
        unitPrice: 180,
        total: 540
      },
      {
        id: 'bi-4',
        description: 'Pharmacy: Beta-blockers, ACEi & Antiplatelet regimen',
        category: 'Pharmacy',
        quantity: 1,
        unitPrice: 165,
        total: 165
      }
    ],
    subtotal: 4005,
    insuranceCovered: 3204,
    copayPatient: 801,
    totalAmount: 4005,
    paymentStatus: 'partial',
    insuranceClaimStatus: 'approved',
    createdAt: '2026-10-22T18:00:00Z'
  },
  {
    id: 'inv-902',
    invoiceNumber: 'INV-2026-4012',
    patientId: 'pat-106',
    patientName: 'David O’Connor',
    mrn: 'MRN-84925',
    admissionDate: '2026-10-20T10:00:00Z',
    dischargeDate: '2026-10-21T16:00:00Z',
    items: [
      {
        id: 'bi-5',
        description: 'Outpatient Short-Stay Observation Unit (1 Day)',
        category: 'Bed/Room',
        quantity: 1,
        unitPrice: 650,
        total: 650
      },
      {
        id: 'bi-6',
        description: 'Coronary CT Calcium Scoring & Radiologist Read',
        category: 'Laboratory',
        quantity: 1,
        unitPrice: 850,
        total: 850
      },
      {
        id: 'bi-7',
        description: 'Cardiology Specialist Consultation',
        category: 'Physician Fee',
        quantity: 1,
        unitPrice: 350,
        total: 350
      }
    ],
    subtotal: 1850,
    insuranceCovered: 1572.5,
    copayPatient: 277.5,
    totalAmount: 1850,
    paymentStatus: 'paid',
    insuranceClaimStatus: 'settled',
    createdAt: '2026-10-21T17:00:00Z'
  }
];

export const INITIAL_AUDIT_LOGS: ClinicalAuditLog[] = [
  {
    id: 'log-01',
    timestamp: '2026-10-23T01:45:00Z',
    actor: 'Dr. Robert Rivera, MD',
    role: 'DOCTOR',
    action: 'Admitted Patient to Resuscitation Bay',
    category: 'Triage Admission',
    patientMrn: 'MRN-84921',
    details: 'Admitted Marcus Sterling with ESI Level 1 (Severe Septic Shock). Orders placed for IV crystalloid & Zosyn.'
  },
  {
    id: 'log-02',
    timestamp: '2026-10-23T01:30:00Z',
    actor: 'Dr. Sarah Chen, BAMS',
    role: 'DOCTOR',
    action: 'Recorded Emergency Vitals',
    category: 'Triage Admission',
    patientMrn: 'MRN-84921',
    details: 'Recorded BP 92/58, HR 118 bpm, SpO2 91%, Temp 38.9°C.'
  },
  {
    id: 'log-03',
    timestamp: '2026-10-22T21:00:00Z',
    actor: 'Sahachara Systems',
    role: 'SUPER_ADMIN',
    action: 'Verified HIPAA Security Audit Trail',
    category: 'RBAC Change',
    details: 'System-wide compliance audit executed. Zero unauthorized data leaks.'
  },
  {
    id: 'log-04',
    timestamp: '2026-10-22T19:45:00Z',
    actor: 'Sahachara Systems',
    role: 'SUPER_ADMIN',
    action: 'Assigned Inpatient Bed',
    category: 'Bed Transfer',
    patientMrn: 'MRN-84923',
    details: 'Assigned Julian Hayes to Trauma Bed TRM-01 following emergency OR orthopedic surgery.'
  }
];

export const INITIAL_USERS: AppUser[] = [
  {
    id: 'usr-superadmin',
    name: 'Sahachara Systems',
    role: 'SUPER_ADMIN',
    title: 'Chief Executive & Super Administrator',
    email: 'systems@sahachara.com',
    department: 'Executive Governance & Technology',
    avatarInitials: 'SS',
    status: 'active'
  },
  {
    id: 'usr-admin',
    name: 'Marcus Sterling',
    role: 'ADMIN',
    title: 'Hospital Operations Administrator',
    email: 'admin.ops@sahachara.com',
    department: 'Hospital Administration Directorate',
    avatarInitials: 'MS',
    status: 'active'
  },
  {
    id: 'usr-doc',
    name: 'Dr. Robert Rivera, MD',
    role: 'DOCTOR',
    title: 'Consultant Physician & Emergency Lead',
    email: 'robert.rivera@sahachara.com',
    department: 'Emergency & Acute Care',
    avatarInitials: 'RR',
    status: 'active'
  },
  {
    id: 'usr-vaidya',
    name: 'Dr. Sarah Chen, BAMS, MD (Ayu)',
    role: 'VAIDYA',
    title: 'Chief Vaidya & Ayurvedic Medical Director',
    email: 'sarah.chen@sahachara.com',
    department: 'Kayachikitsa & Panchakarma',
    avatarInitials: 'SC',
    status: 'active'
  },
  {
    id: 'usr-reception',
    name: 'Kavita Sharma',
    role: 'RECEPTIONIST',
    title: 'Admissions & Front Desk Lead',
    email: 'receptionist@sahachara.com',
    department: 'Patient Admissions & Customer Care',
    avatarInitials: 'KS',
    status: 'active'
  },
  {
    id: 'usr-pharma',
    name: 'Rajesh Nair, RPh',
    role: 'PHARMACIST',
    title: 'Chief Pharmacist & Formulary Manager',
    email: 'pharmacist@sahachara.com',
    department: 'Ayurvedic Pharmacy & Dispensary',
    avatarInitials: 'RN',
    status: 'active'
  },
  {
    id: 'usr-accountant',
    name: 'Anand Pillai',
    role: 'ACCOUNTANT',
    title: 'Patient Financial Services Lead',
    email: 'accountant@sahachara.com',
    department: 'Finance & Patient Accounts',
    avatarInitials: 'AP',
    status: 'active'
  }
];

export const INITIAL_METRICS: HospitalOverviewMetrics = {
  totalPatientsToday: 148,
  erWaitTimeMinutes: 18,
  occupiedBeds: 5,
  totalBeds: 12,
  occupancyRate: 41.7,
  activeDoctorsOnDuty: 4,
  criticalLabAlerts: 3,
  pendingPrescriptions: 1,
  admittedToday: 4,
  dischargedToday: 2,
  scheduledAppointmentsToday: 5,
  activeTreatments: 8,
  activePanchakarmaCourses: 5,
  todayRevenueInr: 142500
};

// ==========================================
// AYURVEDIC CLINICAL INITIAL SEED DATA
// ==========================================

export const INITIAL_CONSULTATIONS: Consultation[] = [
  {
    id: 'con-101',
    consultationNumber: 'CON-2026-0042',
    patientId: 'pat-101',
    patientName: 'Eleanor Vance',
    patientMrn: 'MRN-84920',
    doctorId: 'doc-201',
    doctorName: 'Dr. Sarah Chen, MD (Cardiology & Ayur-Cardio)',
    dateTime: '2026-10-23T09:30:00Z',
    chiefComplaint: 'Bilateral knee stiffness, chronic low back dull ache, and episodic postprandial retrosternal burning',
    duration: '45 minutes',
    presentIllness: 'Symptoms progressive over 6 months; aggravated by cold weather and prolonged standing. Intermittent acidity relieved with warm milk.',
    ayurvedicAssessment: {
      prakriti: {
        vata: 52,
        pitta: 34,
        kapha: 14,
        dominant: 'Vata-Pitta'
      },
      vikriti: {
        vata: 68,
        pitta: 24,
        kapha: 8,
        primaryImbalance: 'Aggravated Vata localized in Sandhi (joints) and Asthi dhatu, with mild Pitta Vidagdha Agni'
      },
      agni: 'Vishama (Irregular)',
      ama: 'Madhyama (Moderate)',
      koshtha: 'Krura (Hard / Constipated)',
      nadi: 'Sarpa gati (Vata snake pulse) with periodic Manduka gati (Pitta frog pulse)',
      jihva: 'Pale pink body with moderate white slimy coating over mid-posterior third (Sama Vata)',
      nidra: 'Alpanidra (Insomnia / Fragmented)',
      ahara: 'Excessive dry crackers, irregular lunch schedules, low intake of warm ghee or unctuous food',
      vihara: 'Air conditioned office environment, long commute, high psychological stress',
      recordedAt: '2026-10-23T09:45:00Z'
    },
    classicalDiagnosis: 'Sandhigata Vata (Osteoarthritis) associated with Sama Agni and Amlapitta',
    westernCorrelation: 'Degenerative joint disease of knees with mild gastroesophageal reflux',
    treatmentRecommendations: 'Deepana-Pachana for 3 days followed by Snehana and Swedana. Janu Basti series with Sahacharadi Thailam.',
    recommendedTherapies: ['Janu Basti (Medicated Oil Retention - Knees)', 'Abhyanga (Herbal Full Body Massage)'],
    prescriptions: ['Dhanwantharam Kashayam 15ml + 45ml lukewarm water BID before food', 'Triphala Churna 5g with warm water at bedtime', 'Sahacharadi Thailam for external application'],
    status: 'completed',
    clinicalNotes: 'Patient advised strict avoidance of cold/refrigerated food, raw salads at night, and excessive dry grains. Follow-up post 7-day therapy.',
    completedAt: '2026-10-23T10:15:00Z'
  },
  {
    id: 'con-102',
    consultationNumber: 'CON-2026-0043',
    patientId: 'pat-102',
    patientName: 'Marcus Sterling',
    patientMrn: 'MRN-84921',
    doctorId: 'doc-202',
    doctorName: 'Dr. Robert Rivera, MD (Emergency Medicine)',
    dateTime: '2026-10-23T11:00:00Z',
    chiefComplaint: 'Acute productive cough with yellowish-white phlegm, nocturnal wheezing, and feverish heaviness',
    duration: '35 minutes',
    presentIllness: 'Recent viral URI 4 days prior, progressed to chest congestion and difficulty exhaling smoothly.',
    ayurvedicAssessment: {
      prakriti: {
        vata: 28,
        pitta: 44,
        kapha: 28,
        dominant: 'Pitta'
      },
      vikriti: {
        vata: 38,
        pitta: 42,
        kapha: 55,
        primaryImbalance: 'Prana Vaha Srotas Pratiloma Vata obstructed by thick Kapha (Tamaka Shwasa Santarpana)'
      },
      agni: 'Manda (Sluggish)',
      ama: 'Teevra (Severe)',
      koshtha: 'Madhyama (Moderate / Regular)',
      nadi: 'Hamsa gati with heavy Kapha drag (Manduka-Hamsa hybrid)',
      jihva: 'Heavily coated thick yellowish-white slime throughout central dorsal region',
      nidra: 'Alpanidra (Insomnia / Fragmented)',
      ahara: 'Cold dairy, ice creams, nocturnal dining habits past 10 PM',
      vihara: 'Exposure to seasonal cold drafts and indoor dust mites',
      recordedAt: '2026-10-23T11:15:00Z'
    },
    classicalDiagnosis: 'Tamaka Shwasa (Bronchial Asthma exacerbation) with Kapha-Vata Prana Pratilomatva',
    westernCorrelation: 'Acute infective exacerbation of moderate persistent asthma with lower airway obstruction',
    treatmentRecommendations: 'Immediate Sadyo Vamana or Snehana-Swedana with Lavana taila over chest followed by Nadi Sweda. Deepana-Pachana herbs.',
    recommendedTherapies: ['Patra Pinda Sweda over thoracic region', 'Nasya (Nasal Medication - Urdhvajatru Disorders)'],
    prescriptions: ['Talisadi Churna 3g with honey TID', 'Kantakari Avaleha 1 tsp BID', 'Karpooradi Thailam chest rub'],
    status: 'in_progress',
    clinicalNotes: 'Stabilizing acute respiratory status under observation in acute bay. Monitor pulse oximetry continuously.',
    completedAt: undefined
  },
  {
    id: 'con-103',
    consultationNumber: 'CON-2026-0044',
    patientId: 'pat-103',
    patientName: 'Beatriz Alvarez',
    patientMrn: 'MRN-84922',
    doctorId: 'doc-204',
    doctorName: 'Dr. Elena Rostova, MD (Internal Medicine)',
    dateTime: '2026-10-22T14:30:00Z',
    chiefComplaint: 'Multiple small joint swelling, morning stiffness exceeding 90 minutes, severe lethargy and heaviness (Gaurava)',
    duration: '50 minutes',
    presentIllness: 'Symmetrical PIP and wrist synovitis; episodic fever spikes in afternoon without focal bacterial infection.',
    ayurvedicAssessment: {
      prakriti: {
        vata: 36,
        pitta: 32,
        kapha: 32,
        dominant: 'Tridoshic (Sama)'
      },
      vikriti: {
        vata: 60,
        pitta: 30,
        kapha: 65,
        primaryImbalance: 'Amavata: Undigested Ama circulated by aggravated Vyana Vayu lodging in Shleshma sthanas (synovium)'
      },
      agni: 'Manda (Sluggish)',
      ama: 'Teevra (Severe)',
      koshtha: 'Krura (Hard / Constipated)',
      nadi: 'Gabhira, heavy, slow Sarpa-Gaja gait with elevated tension',
      jihva: 'Thick greasy white coating, scalloped margins',
      nidra: 'Atinidra (Excessive Somnolence)',
      ahara: 'Viruddha Ahara (incompatible food combinations: fruit smoothies with milk), heavy cheese',
      vihara: 'Daytime sleeping (Diva Swapna), physical inactivity',
      recordedAt: '2026-10-22T14:50:00Z'
    },
    classicalDiagnosis: 'Amavata (Classical Rheumatoid Polyarthritis) in acute inflammatory state',
    westernCorrelation: 'Seropositive Rheumatoid Arthritis flare',
    treatmentRecommendations: 'Ruksha Swedana (Valuka Sweda / Sand bag fomentation), Langhana (therapeutic fasting), Castor oil purgation (Erandasneha Virechana).',
    recommendedTherapies: ['Udvartana (Herbal Powder Exfoliation)', 'Kizhi / Patra Pinda Sweda (Herbal Bolus)'],
    prescriptions: ['Yogaraja Guggulu 2 tabs TID after food', 'Simhanada Guggulu 2 tabs BID', 'Amrutarishta 20ml BID'],
    status: 'completed',
    clinicalNotes: 'Strict prohibition of curd, fermented foods, cold baths, and night vigil. Scheduled for Basti protocol next week.',
    completedAt: '2026-10-22T15:25:00Z'
  }
];

export const INITIAL_TREATMENT_PLANS: TreatmentPlan[] = [
  {
    id: 'tp-301',
    planNumber: 'TP-2026-0031',
    patientId: 'pat-101',
    patientName: 'Eleanor Vance',
    patientMrn: 'MRN-84920',
    doctorId: 'doc-201',
    doctorName: 'Dr. Sarah Chen, MD',
    assignedTherapist: 'Senior Therapist Anand Kumar',
    therapyType: 'Janu Basti (Medicated Oil Retention - Knees)',
    clinicalObjective: 'Alleviate subchondral crepitus, lubricate synovial capsular membrane, and balance localized Sandhivata',
    oilOrFormulation: 'Warm Sahacharadi Thailam + Ksheerabala 101 Avarthana',
    totalSessions: 7,
    completedSessions: 4,
    frequency: 'Daily',
    startDate: '2026-10-20',
    endDate: '2026-10-27',
    roomNumber: 'Ayur Therapy Suite 02',
    status: 'active',
    notes: 'Patient reports 40% reduction in knee crepitus after Session 3. Dough rings hold oil well at 42°C for 35 mins.',
    lastSessionDate: '2026-10-23'
  },
  {
    id: 'tp-302',
    planNumber: 'TP-2026-0032',
    patientId: 'pat-102',
    patientName: 'Marcus Sterling',
    patientMrn: 'MRN-84921',
    doctorId: 'doc-202',
    doctorName: 'Dr. Robert Rivera, MD',
    assignedTherapist: 'Therapist Lakshmi Menon',
    therapyType: 'Kizhi / Patra Pinda Sweda (Herbal Bolus)',
    clinicalObjective: 'Liquefy accumulated bronchial Kapha and relax intercostal accessory respiratory muscles',
    oilOrFormulation: 'Karpooradi Thailam + Herbal leaf bolus (Nirgundi & Eranda leaves)',
    totalSessions: 5,
    completedSessions: 2,
    frequency: 'Daily',
    startDate: '2026-10-22',
    endDate: '2026-10-26',
    roomNumber: 'Inpatient Treatment Bay 01',
    status: 'active',
    notes: 'Expectorant reflex active post-swedana. Temperature maintained at comfortable warm tolerance.',
    lastSessionDate: '2026-10-23'
  },
  {
    id: 'tp-303',
    planNumber: 'TP-2026-0033',
    patientId: 'pat-103',
    patientName: 'Beatriz Alvarez',
    patientMrn: 'MRN-84922',
    doctorId: 'doc-204',
    doctorName: 'Dr. Elena Rostova, MD',
    assignedTherapist: 'Therapist Priya Nambiar',
    therapyType: 'Udvartana (Herbal Powder Exfoliation)',
    clinicalObjective: 'Mobilize deep subcutaneous Ama, clear medas stagnation, and stimulate lymphatic drainage',
    oilOrFormulation: 'Kolate Kulatthadi dry herbal micro-churna',
    totalSessions: 6,
    completedSessions: 6,
    frequency: 'Alternate Days',
    startDate: '2026-10-10',
    endDate: '2026-10-22',
    roomNumber: 'Ayur Therapy Suite 03',
    status: 'completed',
    notes: 'Course completed with marked reduction in joint puffiness and skin unctuousness normalized.',
    lastSessionDate: '2026-10-22'
  },
  {
    id: 'tp-304',
    planNumber: 'TP-2026-0034',
    patientId: 'pat-104',
    patientName: 'Julian Hayes',
    patientMrn: 'MRN-84923',
    doctorId: 'doc-203',
    doctorName: 'Dr. Arthur Pendelton, MD',
    assignedTherapist: 'Therapist Anand Kumar',
    therapyType: 'Kati Basti (Medicated Oil Retention - Spine)',
    clinicalObjective: 'Post-op spinal stabilization, facet joint pain relief, and lumbar radiculopathy reduction',
    oilOrFormulation: 'Mahanarayana Thailam + Dhanwantharam Thailam',
    totalSessions: 10,
    completedSessions: 3,
    frequency: 'Daily',
    startDate: '2026-10-21',
    endDate: '2026-10-31',
    roomNumber: 'Spinal Care Suite 01',
    status: 'active',
    notes: 'Dough well sealed over L4-L5-S1. Oil temperature carefully regulated with thermometer.',
    lastSessionDate: '2026-10-23'
  },
  {
    id: 'tp-305',
    planNumber: 'TP-2026-0035',
    patientId: 'pat-106',
    patientName: 'David O’Connor',
    patientMrn: 'MRN-84925',
    doctorId: 'doc-201',
    doctorName: 'Dr. Sarah Chen, MD',
    assignedTherapist: 'Therapist Priya Nambiar',
    therapyType: 'Shirodhara (Continuous Medicated Oil Pouring)',
    clinicalObjective: 'Regulate autonomic nervous hyperactivity, lower diastolic BP, and induce parasympathetic calming',
    oilOrFormulation: 'Ksheerabala Thailam infused with Chandana & Jatamansi',
    totalSessions: 7,
    completedSessions: 5,
    frequency: 'Daily',
    startDate: '2026-10-18',
    endDate: '2026-10-25',
    roomNumber: 'Neuro-Psych Shirodhara Suite',
    status: 'active',
    notes: 'Excellent therapeutic relaxation response. Pulse rate dropped from 84 to 68 bpm during 40-min flow.',
    lastSessionDate: '2026-10-22'
  }
];

export const INITIAL_PANCHAKARMA_COURSES: PanchakarmaCourse[] = [
  {
    id: 'pk-401',
    courseNumber: 'PK-2026-0014',
    patientId: 'pat-101',
    patientName: 'Eleanor Vance',
    patientMrn: 'MRN-84920',
    vaidyaName: 'Dr. Sarah Chen, MD & Vaidya K. Sharma',
    protocol: 'Virechana (Therapeutic Purgation - Pitta Cleansing)',
    currentPhase: 'Paschatkarma (Dietary Samsarjana)',
    startDate: '2026-10-12',
    expectedEndDate: '2026-10-26',
    totalDays: 14,
    completedDays: 12,
    dietaryPrescription: 'Stage 4 Samsarjana Krama: Akruta Yusha (Unseasoned green gram soup) advancing to Kruta Yusha with pinch of Saindhava & Jeeraka',
    status: 'Active',
    dailySessions: [
      {
        day: 1,
        date: '2026-10-12',
        phase: 'Purvakarma (Prep/Snehana-Swedana)',
        procedureName: 'Deepana-Pachana with Trikatu Churna',
        therapist: 'Anand Kumar',
        bloodPressure: '136/84',
        pulseRate: '72 bpm',
        appetiteAssessment: 'Sluggish, coated tongue',
        bowelStatus: '1 hard stool',
        observations: 'Initiated digestive stimulant regimen.',
        status: 'completed'
      },
      {
        day: 4,
        date: '2026-10-15',
        phase: 'Purvakarma (Prep/Snehana-Swedana)',
        procedureName: 'Snehapana: Medicated Ghee (Indukantham Ghritam 60ml)',
        therapist: 'Anand Kumar',
        bloodPressure: '132/80',
        pulseRate: '70 bpm',
        appetiteAssessment: 'Appetite blunted due to unctuousness (Sneha)',
        bowelStatus: 'Soft, greasy stool',
        observations: 'Attained intermediate symptoms of unctuous saturation (Snigdha lakshana).',
        status: 'completed'
      },
      {
        day: 8,
        date: '2026-10-19',
        phase: 'Purvakarma (Prep/Snehana-Swedana)',
        procedureName: 'Sarvanga Abhyanga & Bashpa Sweda (Steam box)',
        therapist: 'Lakshmi Menon',
        bloodPressure: '130/78',
        pulseRate: '74 bpm',
        appetiteAssessment: 'Gradually returning post-digestion of sneha',
        bowelStatus: 'Regular soft',
        observations: 'Full body sweat achieved without exhaustion.',
        status: 'completed'
      },
      {
        day: 10,
        date: '2026-10-21',
        phase: 'Pradhanakarma (Main Procedure)',
        procedureName: 'Virechana Purgative Administration (Trivrit Lehyam 35g)',
        therapist: 'Senior Vaidya K. Sharma',
        bloodPressure: '124/76',
        pulseRate: '76 bpm',
        appetiteAssessment: 'Fasting state maintained during purgation',
        bowelStatus: '12 bouts of purgation (Madhyama Shuddhi achieved)',
        observations: 'Clear watery discharge at final bout. Pulse and BP stable throughout.',
        status: 'completed'
      },
      {
        day: 11,
        date: '2026-10-22',
        phase: 'Paschatkarma (Dietary Samsarjana)',
        procedureName: 'Samsarjana Day 1: Manda (Thin clear rice water)',
        therapist: 'Priya Nambiar',
        bloodPressure: '120/76',
        pulseRate: '72 bpm',
        appetiteAssessment: 'Clean sharp appetite, Agni rekindled',
        bowelStatus: 'Quiescent',
        observations: 'Digested Manda easily without distension.',
        status: 'completed'
      },
      {
        day: 12,
        date: '2026-10-23',
        phase: 'Paschatkarma (Dietary Samsarjana)',
        procedureName: 'Samsarjana Day 2: Peya & Vilepi (Warm seasoned rice gruel)',
        therapist: 'Priya Nambiar',
        bloodPressure: '122/78',
        pulseRate: '70 bpm',
        appetiteAssessment: 'Strong, healthy hunger',
        bowelStatus: 'Formed normal stool passed spontaneously',
        observations: 'Patient expresses lightness of body (Laghuta) and clarity of mind.',
        status: 'in_progress'
      }
    ],
    dischargeNotes: 'Planned discharge on Day 14. Prescribe Rasayana protocol: Chyavanaprash 1 tsp daily with warm milk for 45 days.'
  },
  {
    id: 'pk-402',
    courseNumber: 'PK-2026-0015',
    patientId: 'pat-103',
    patientName: 'Beatriz Alvarez',
    patientMrn: 'MRN-84922',
    vaidyaName: 'Dr. Elena Rostova, MD & Vaidya S. Namboothiri',
    protocol: 'Basti (Medicated Decoction/Oil Enema - Vata Balance)',
    currentPhase: 'Pradhanakarma (Main Procedure)',
    startDate: '2026-10-20',
    expectedEndDate: '2026-10-28',
    totalDays: 8,
    completedDays: 3,
    dietaryPrescription: 'Light Mudga Yusha (Lentil soup), cooked red rice with ghee, boiled warm water only',
    status: 'Active',
    dailySessions: [
      {
        day: 1,
        date: '2026-10-20',
        phase: 'Pradhanakarma (Main Procedure)',
        procedureName: 'Anuvasana Basti (Oil enema: Sahacharadi Thailam 60ml)',
        therapist: 'Priya Nambiar',
        bloodPressure: '142/86',
        pulseRate: '78 bpm',
        appetiteAssessment: 'Moderate',
        bowelStatus: 'Oil retained for 4 hours 15 mins (Uttama retention)',
        observations: 'Good retention, zero abdominal discomfort.',
        status: 'completed'
      },
      {
        day: 2,
        date: '2026-10-21',
        phase: 'Pradhanakarma (Main Procedure)',
        procedureName: 'Niruha Basti (Decoction enema: Dashamula Kashayam + Madhu + Saindhava + Sneha)',
        therapist: 'Priya Nambiar',
        bloodPressure: '138/82',
        pulseRate: '74 bpm',
        appetiteAssessment: 'Good digestive fire',
        bowelStatus: 'Evacuation within 22 minutes with foul Ama discharge',
        observations: 'Joint stiffness substantially relieved immediately post evacuation.',
        status: 'completed'
      },
      {
        day: 3,
        date: '2026-10-22',
        phase: 'Pradhanakarma (Main Procedure)',
        procedureName: 'Anuvasana Basti (Ksheerabala 101 Avarthana 60ml)',
        therapist: 'Priya Nambiar',
        bloodPressure: '136/80',
        pulseRate: '72 bpm',
        appetiteAssessment: 'Excellent',
        bowelStatus: 'Retained 5 hours',
        observations: 'Knee flexion increased by 25 degrees without acute pain.',
        status: 'completed'
      }
    ]
  },
  {
    id: 'pk-403',
    courseNumber: 'PK-2026-0016',
    patientId: 'pat-104',
    patientName: 'Julian Hayes',
    patientMrn: 'MRN-84923',
    vaidyaName: 'Dr. Arthur Pendelton, MD & Vaidya Anand',
    protocol: 'Nasya (Nasal Medication - Urdhvajatru Disorders)',
    currentPhase: 'Purvakarma (Prep/Snehana-Swedana)',
    startDate: '2026-10-23',
    expectedEndDate: '2026-10-29',
    totalDays: 7,
    completedDays: 1,
    dietaryPrescription: 'Warm vegetarian soup, avoidance of cold drafts, warm spiced tea with Tulsi & Shunthi',
    status: 'Active',
    dailySessions: [
      {
        day: 1,
        date: '2026-10-23',
        phase: 'Purvakarma (Prep/Snehana-Swedana)',
        procedureName: 'Mukha Abhyanga with Ksheerabala + Nadi Sweda over face and neck',
        therapist: 'Anand Kumar',
        bloodPressure: '128/82',
        pulseRate: '76 bpm',
        appetiteAssessment: 'Normal',
        bowelStatus: 'Normal',
        observations: 'Pre-nasya fomentation completed. Patient prepped for Anu Thailam 4 drops per nostril.',
        status: 'completed'
      }
    ]
  }
];

export const INITIAL_STOCK_MOVEMENTS: StockMovement[] = [
  {
    id: 'sm-501',
    timestamp: '2026-10-23T08:15:00Z',
    medicineId: 'med-ayur-01',
    medicineName: 'Sahacharadi Thailam',
    batchNumber: 'AY-2026-901',
    type: 'Purchase Receipt',
    quantityDelta: 20,
    remainingQuantity: 45,
    actor: 'Katherine Brooks, RPh (Lead Pharmacist)',
    referenceNumber: 'GRN-2026-118',
    notes: 'Received fresh consignment from Kerala Ayurveda Herbal Labs. Batch CoA verified.'
  },
  {
    id: 'sm-502',
    timestamp: '2026-10-23T07:40:00Z',
    medicineId: 'med-ayur-06',
    medicineName: 'Yogaraja Guggulu',
    batchNumber: 'AY-2026-402',
    type: 'Dispensed to Patient',
    quantityDelta: -2,
    remainingQuantity: 5,
    actor: 'Kevin Patel, PharmD',
    referenceNumber: 'DISP-2026-891',
    notes: 'Dispensed 2 bottles to Beatriz Alvarez for Amavata treatment regimen.'
  },
  {
    id: 'sm-503',
    timestamp: '2026-10-22T16:20:00Z',
    medicineId: 'med-ayur-03',
    medicineName: 'Triphala Churna',
    batchNumber: 'AY-2026-744',
    type: 'Internal Transfer',
    quantityDelta: -5,
    remainingQuantity: 120,
    actor: 'Katherine Brooks, RPh',
    referenceNumber: 'TRF-PK-09',
    notes: 'Transferred 5 jars to Panchakarma Therapy Unit for digestive prep.'
  }
];

export const INITIAL_SUPPLIERS: PharmacySupplier[] = [
  {
    id: 'sup-1',
    name: 'Arya Vaidya Sala Kottakkal Logistics',
    contactPerson: 'S. Ramanathan, Operations Director',
    phone: '+91 (483) 2742216',
    email: 'supply@kottakkal.example.org',
    gmpCertified: true,
    categoriesSupplied: ['Classical Thailams', 'Arishta & Asava', 'Guggulu Formulations', 'Kashayam Tablets'],
    leadTimeDays: 2,
    paymentTerms: 'Net 30 Days'
  },
  {
    id: 'sup-2',
    name: 'Kerala Ayurveda Natural Extracts Ltd.',
    contactPerson: 'Dr. Meera Namboodiri',
    phone: '+91 (484) 2608400',
    email: 'b2b@keralaayurveda.example.in',
    gmpCertified: true,
    categoriesSupplied: ['Single Herb Churnas', 'Avarthana Concentrated Drops', 'Rasayanas', 'Massage Oils'],
    leadTimeDays: 3,
    paymentTerms: 'Net 45 Days'
  },
  {
    id: 'sup-3',
    name: 'Vaidyaratnam Oushadhasala Herbals',
    contactPerson: 'K. Unnikrishnan',
    phone: '+91 (487) 2352210',
    email: 'institutional@vaidyaratnam.example.org',
    gmpCertified: true,
    categoriesSupplied: ['Medicated Ghritams', 'Classical Kashayams', 'Panchakarma Bulk Oils'],
    leadTimeDays: 4,
    paymentTerms: 'Advance 50% / Net 15 Days'
  }
];

export const INITIAL_STAFF: StaffMember[] = [
  {
    id: 'stf-101',
    employeeId: 'EMP-AY-101',
    name: 'Dr. Sarah Chen, BAMS, MD (Ayu)',
    role: 'VAIDYA',
    designation: 'Chief Vaidya & Director of Ayurvedic Medicine',
    department: 'Kayachikitsa & Panchakarma',
    email: 'sarah.chen@sahachara.com',
    phone: '+91 9847019 2831',
    licenseNumber: 'AYUSH-KL-88201',
    status: 'on_duty',
    shift: 'Morning (07:00-15:00)',
    qualification: 'BAMS, MD (Ayurveda), Senior Physician',
    joiningDate: '2021-03-15',
    notes: 'Classical Ayurvedic clinical consultation and Panchakarma directorate lead.'
  },
  {
    id: 'stf-102',
    employeeId: 'EMP-AY-102',
    name: 'Dr. Rajeshwar Sharma, BAMS, MD (Ayu)',
    role: 'VAIDYA',
    designation: 'Senior Vaidya & Head of Kayachikitsa',
    department: 'Kayachikitsa (Internal Medicine)',
    email: 'rajeshwar.sharma@sahachara.com',
    phone: '+91 98450 11202',
    licenseNumber: 'AYUSH-KL-4091',
    status: 'on_duty',
    shift: 'Morning (07:00-15:00)',
    qualification: 'BAMS (Kerala), MD Ayurveda (Kayachikitsa, IPGTRA Jamnagar)',
    joiningDate: '2020-01-10',
    notes: 'National Board Examiner for Ayurvedic Shodhana & Chikitsa Sutra.'
  },
  {
    id: 'stf-103',
    employeeId: 'EMP-AY-103',
    name: 'Dr. Robert Rivera, MD, FACEP',
    role: 'DOCTOR',
    designation: 'Emergency Directorate Lead Physician',
    department: 'Emergency & Trauma Services',
    email: 'robert.rivera@sahachara.com',
    phone: '+91 9847019 3320',
    licenseNumber: 'MD-NY-77142',
    status: 'on_duty',
    shift: 'Morning (07:00-15:00)',
    qualification: 'MD, Emergency Medicine Board Certified',
    joiningDate: '2022-06-01'
  },
  {
    id: 'stf-104',
    employeeId: 'EMP-AY-104',
    name: 'Anand Kumar, Admissions Officer',
    role: 'RECEPTIONIST',
    designation: 'Lead Patient Admissions & Front Desk',
    department: 'Patient Services',
    email: 'anand.kumar@sahachara.com',
    phone: '+91 98450 88201',
    licenseNumber: 'REG-REC-KL-9921',
    status: 'on_duty',
    shift: 'Morning (07:00-15:00)',
    qualification: 'B.Com, Healthcare Operations Diploma',
    joiningDate: '2021-08-15',
    notes: 'Admissions, patient registration, and bed coordination.'
  },
  {
    id: 'stf-105',
    employeeId: 'EMP-AY-105',
    name: 'Meenakshi Warrier, Front Desk Coordinator',
    role: 'RECEPTIONIST',
    designation: 'Patient Reception & Scheduling Lead',
    department: 'Patient Services',
    email: 'meenakshi.warrier@sahachara.com',
    phone: '+91 98450 66341',
    licenseNumber: 'REG-REC-KL-7740',
    status: 'active',
    shift: 'Morning (07:00-15:00)',
    qualification: 'BBA Healthcare Management',
    joiningDate: '2022-02-10'
  },
  {
    id: 'stf-106',
    employeeId: 'EMP-AY-106',
    name: 'Priya Nair, Front Desk Specialist',
    role: 'RECEPTIONIST',
    designation: 'Clinical Ward Admissions Coordinator',
    department: 'Ayurvedic Inpatient Facility (IPD)',
    email: 'priya.nair@sahachara.com',
    phone: '+91 98450 99422',
    licenseNumber: 'REG-REC-KL-55102',
    status: 'pending_activation',
    shift: 'Morning (07:00-15:00)',
    qualification: 'B.Sc Administration',
    joiningDate: '2026-01-10',
    activationPin: '849201'
  },
  {
    id: 'stf-107',
    employeeId: 'EMP-AY-107',
    name: 'David Miller, Senior Accountant',
    role: 'ACCOUNTANT',
    designation: 'Lead Patient Accounts & Cashier Officer',
    department: 'Patient Financial Services',
    email: 'david.miller@sahachara.com',
    phone: '+91 9847019 9021',
    licenseNumber: 'FIN-NY-44821',
    status: 'on_duty',
    shift: 'Morning (07:00-15:00)',
    qualification: 'CPA, B.Sc Accounting',
    joiningDate: '2023-01-15'
  },
  {
    id: 'stf-108',
    employeeId: 'EMP-AY-108',
    name: 'Rajesh Nair, Senior Pharmacist',
    role: 'PHARMACIST',
    designation: 'Dispensary & Batch Quality Specialist',
    department: 'Ayurvedic Pharmacy',
    email: 'pharmacist@sahachara.com',
    phone: '+91 98450 44299',
    licenseNumber: 'RPH-KL-7712',
    status: 'on_duty',
    shift: 'Morning (07:00-15:00)',
    qualification: 'B.Pharm (Ayurveda)',
    joiningDate: '2020-09-01',
    notes: 'Authorized pharmacist for dispensing and FEFO batch movements.'
  },
  {
    id: 'stf-109',
    employeeId: 'EMP-AY-109',
    name: 'Pharm. Katherine Brooks, B.Pharm, RPh',
    role: 'PHARMACIST',
    designation: 'Chief Hospital Pharmacist & Formulations Lead',
    department: 'Ayurvedic & Allopathic Pharmacy',
    email: 'katherine.brooks@sahachara.com',
    phone: '+91 9847019 7412',
    licenseNumber: 'RPH-NY-33290',
    status: 'on_duty',
    shift: 'General (09:00-17:00)',
    qualification: 'B.Pharm, Registered Pharmacist (RPh)',
    joiningDate: '2021-05-10',
    notes: 'Lead inspector for Ayurvedic Good Manufacturing Practices (GMP).'
  },
  {
    id: 'stf-110',
    employeeId: 'EMP-AY-110',
    name: 'Marcus Sterling, MHA',
    role: 'ADMIN',
    designation: 'Director of Healthcare Operations & Governance',
    department: 'Executive Administration',
    email: 'admin.ops@sahachara.com',
    phone: '+91 98450 22001',
    licenseNumber: 'HOSP-ADMIN-KL-004',
    status: 'active',
    shift: 'General (09:00-17:00)',
    qualification: 'Masters in Hospital Administration (MHA)',
    joiningDate: '2019-11-15'
  }
];

/**
 * Initial hospital tariffs catalogue.
 * Initially empty per approved Ayurvedic outpatient, day-care and ambulatory operating model.
 * The SUPER_ADMIN establishes authorized services and rates through Settings -> Services and Rates.
 * Inpatient accommodation, ward, ICU and bed tariffs are strictly excluded.
 */
export const INITIAL_TARIFFS: HospitalTariff[] = [];
