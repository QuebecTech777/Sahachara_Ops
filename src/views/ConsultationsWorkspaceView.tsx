import React, { useState, useEffect, useCallback } from 'react';
import {
  Stethoscope,
  BookOpen,
  Plus,
  Search,
  CheckCircle2,
  Clock,
  AlertCircle,
  Activity,
  FileText,
  ChevronRight,
  Flame,
  Pill,
  Heart,
  RefreshCw,
  AlertTriangle,
  User,
  ShieldAlert,
  Calendar,
  Send,
  Check,
  CheckCheck
} from 'lucide-react';
import {
  Consultation,
  Patient,
  Doctor,
  AppUser,
  QueueItem,
  ClinicalEncounter,
  ClinicalVitals,
  DoctorDashboardMetrics,
  VaidyaDashboardMetrics,
  PatientClinicalHistory,
  PrakritiType
} from '../types/hospital';
import { CarbonButton } from '../components/carbon/CarbonButton';
import { CarbonTag } from '../components/carbon/CarbonTag';
import { CarbonTile } from '../components/carbon/CarbonTile';
import { CarbonModal } from '../components/carbon/CarbonModal';
import { PatientDossierModal } from '../components/modals/PatientDossierModal';
import { hospitalApi } from '../services/hospitalApi';

interface ConsultationsWorkspaceViewProps {
  consultations: Consultation[];
  patients: Patient[];
  doctors: Doctor[];
  currentUser: AppUser;
  onSaveConsultation?: (consultation: Partial<Consultation>) => Promise<Consultation>;
  onNavigateToTreatments?: () => void;
  onNavigateToPharmacy?: () => void;
}

export const ConsultationsWorkspaceView: React.FC<ConsultationsWorkspaceViewProps> = ({
  patients,
  currentUser,
  onNavigateToPharmacy
}) => {
  // Discipline mode: DOCTOR (Modern Medicine) or VAIDYA (Classical Ayurveda)
  const isDoctorRole = currentUser.role === 'DOCTOR';
  const isVaidyaRole = currentUser.role === 'VAIDYA';
  const [activeDiscipline, setActiveDiscipline] = useState<'DOCTOR' | 'VAIDYA'>(
    isVaidyaRole ? 'VAIDYA' : 'DOCTOR'
  );

  // Synchronize role discipline
  useEffect(() => {
    if (isVaidyaRole) setActiveDiscipline('VAIDYA');
    else if (isDoctorRole) setActiveDiscipline('DOCTOR');
  }, [currentUser.role, isDoctorRole, isVaidyaRole]);

  // Dashboard Metrics state
  const [doctorMetrics, setDoctorMetrics] = useState<DoctorDashboardMetrics | null>(null);
  const [vaidyaMetrics, setVaidyaMetrics] = useState<VaidyaDashboardMetrics | null>(null);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [isLoadingQueue, setIsLoadingQueue] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Active Selected Queue Item & Encounter
  const [selectedQueueItem, setSelectedQueueItem] = useState<QueueItem | null>(null);
  const [activeEncounter, setActiveEncounter] = useState<ClinicalEncounter | null>(null);
  const [clinicalHistory, setClinicalHistory] = useState<PatientClinicalHistory | null>(null);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  // Active Tab inside consultation workspace
  const [activeTab, setActiveTab] = useState<'vitals' | 'assessment' | 'investigations' | 'prescriptions' | 'prakriti' | 'vikriti' | 'dosha' | 'treatment' | 'panchakarma' | 'history'>('vitals');

  // Emergency Escalation Resolution Modal
  const [escalationToResolve, setEscalationToResolve] = useState<QueueItem | null>(null);
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [isResolvingEscalation, setIsResolvingEscalation] = useState(false);

  // Patient Dossier Modal
  const [dossierPatient, setDossierPatient] = useState<Patient | null>(null);

  // Status Notification
  const [notification, setNotification] = useState<{
    kind: 'success' | 'error' | 'info';
    message: string;
  } | null>(null);

  // Form States: Vitals
  const [systolic, setSystolic] = useState<number | ''>('');
  const [diastolic, setDiastolic] = useState<number | ''>('');
  const [heartRate, setHeartRate] = useState<number | ''>('');
  const [respRate, setRespRate] = useState<number | ''>('');
  const [spo2, setSpo2] = useState<number | ''>('');
  const [temperature, setTemperature] = useState<number | ''>('');
  const [height, setHeight] = useState<number | ''>('');
  const [weight, setWeight] = useState<number | ''>('');
  const [latestVitalsRecord, setLatestVitalsRecord] = useState<ClinicalVitals | null>(null);

  // Form States: Modern Medicine Assessment & Diagnoses
  const [subjectiveNotes, setSubjectiveNotes] = useState('');
  const [objectiveFindings, setObjectiveFindings] = useState('');
  const [assessmentNotes, setAssessmentNotes] = useState('');
  const [clinicalPlan, setClinicalPlan] = useState('');
  const [diagnosisName, setDiagnosisName] = useState('');
  const [icd10Code, setIcd10Code] = useState('');
  const [diagnosisType, setDiagnosisType] = useState<'provisional' | 'final' | 'differential'>('provisional');

  // Form States: Modern Medicine Investigations
  const [testType, setTestType] = useState('Complete Blood Count (CBC with Differential)');
  const [investigationPriority, setInvestigationPriority] = useState('Routine');
  const [clinicalIndication, setClinicalIndication] = useState('');
  const [resultEntryOrderId, setResultEntryOrderId] = useState<string | null>(null);
  const [resultValue, setResultValue] = useState('');
  const [normalRange, setNormalRange] = useState('');
  const [isAbnormal, setIsAbnormal] = useState(false);
  const [reviewOrderId, setReviewOrderId] = useState<string | null>(null);
  const [reviewNotes, setReviewNotes] = useState('');

  // Form States: Prescriptions
  const [prescribeMedName, setPrescribeMedName] = useState('');
  const [prescribeDosage, setPrescribeDosage] = useState('1 tablet');
  const [prescribeFrequency, setPrescribeFrequency] = useState('BID (Twice Daily)');
  const [prescribeDuration, setPrescribeDuration] = useState('7 days');
  const [prescribeInstructions, setPrescribeInstructions] = useState('After meals with warm water');

  // Form States: Ayurvedic Prakriti
  const [prakritiVata, setPrakritiVata] = useState(40);
  const [prakritiPitta, setPrakritiPitta] = useState(35);
  const [prakritiKapha, setPrakritiKapha] = useState(25);
  const [prakritiDominant, setPrakritiDominant] = useState<PrakritiType>('Vata-Pitta');
  const [prakritiInterpretation, setPrakritiInterpretation] = useState('');

  // Form States: Ayurvedic Vikriti
  const [vikritiPrimary, setVikritiPrimary] = useState('Vata localized in Sandhi (Joints)');
  const [vikritiSecondary, setVikritiSecondary] = useState('Pitta in Rakta Dhatu');
  const [vikritiInterpretation, setVikritiInterpretation] = useState('');

  // Form States: Ayurvedic Dosha Evaluation & Ashta Vidha Pariksha
  const [agniStatus, setAgniStatus] = useState('Vishama Agni (Irregular)');
  const [amaStatus, setAmaStatus] = useState('Sama (Moderate Ama)');
  const [koshthaType, setKoshthaType] = useState('Krura Koshtha (Hard/Constipated)');
  const [nadiPariksha, setNadiPariksha] = useState('Sarpa Gati (Snake/Vata Pulse)');
  const [jihvaPariksha, setJihvaPariksha] = useState('White Ama coating on posterior third');
  const [sparshaPariksha, setSparshaPariksha] = useState('Sheetala (Cold & Rough)');
  const [doshaInterpretation, setDoshaInterpretation] = useState('');

  // Form States: Treatment Plan & Panchakarma
  const [treatmentPlanTitle, setTreatmentPlanTitle] = useState('Shamana & Snehana Protocol');
  const [treatmentPlanDuration, setTreatmentPlanDuration] = useState(14);
  const [dietaryGuidelines, setDietaryGuidelines] = useState('Ushna, Snigdha, freshly prepared warm diet');
  const [lifestyleGuidelines, setLifestyleGuidelines] = useState('Avoid day sleep, practice gentle Sukshma Vyayama');
  const [panchakarmaTherapy, setPanchakarmaTherapy] = useState('Janu Basti (Medicated Oil Retention - Knees)');
  const [panchakarmaPrecautions, setPanchakarmaPrecautions] = useState('Check skin sensitivity before applying medicated oil');
  const [panchakarmaObservations, setPanchakarmaObservations] = useState('Crepitus noted in bilateral knee joints');

  const [isSubmittingAction, setIsSubmittingAction] = useState(false);

  // Load Dashboard & Queue from PostgreSQL
  const refreshWorkspace = useCallback(async () => {
    setIsLoadingQueue(true);
    try {
      if (activeDiscipline === 'DOCTOR') {
        const [dash, q] = await Promise.all([
          hospitalApi.getDoctorDashboard().catch(() => null),
          hospitalApi.getDoctorQueue().catch(() => [])
        ]);
        if (dash) setDoctorMetrics(dash);
        setQueue(q || []);
      } else {
        const [dash, q] = await Promise.all([
          hospitalApi.getVaidyaDashboard().catch(() => null),
          hospitalApi.getVaidyaQueue().catch(() => [])
        ]);
        if (dash) setVaidyaMetrics(dash);
        setQueue(q || []);
      }
    } catch (err: any) {
      console.warn('[Workspace] Refresh error:', err);
    } finally {
      setIsLoadingQueue(false);
    }
  }, [activeDiscipline]);

  useEffect(() => {
    refreshWorkspace();
  }, [refreshWorkspace]);

  // Load Clinical History when Patient Changes
  useEffect(() => {
    if (!selectedQueueItem?.patientId) {
      setClinicalHistory(null);
      return;
    }
    let isMounted = true;
    setIsLoadingHistory(true);
    hospitalApi.getPatientClinicalHistory(selectedQueueItem.patientId)
      .then((hist) => {
        if (isMounted) setClinicalHistory(hist);
      })
      .catch((err) => {
        console.warn('[Workspace] Failed to fetch history:', err);
        if (isMounted) setClinicalHistory(null);
      })
      .finally(() => {
        if (isMounted) setIsLoadingHistory(false);
      });
    return () => { isMounted = false; };
  }, [selectedQueueItem?.patientId]);

  // Handle Escalation Acknowledge
  const handleAcknowledgeEscalation = async (item: QueueItem) => {
    try {
      await hospitalApi.acknowledgeEscalation(item.id);
      setNotification({
        kind: 'success',
        message: `Emergency escalation acknowledged for ${item.patientName}.`
      });
      await refreshWorkspace();
    } catch (err: any) {
      setNotification({
        kind: 'error',
        message: err.message || 'Failed to acknowledge escalation'
      });
    }
  };

  // Handle Escalation Resolve
  const handleResolveEscalationSubmit = async () => {
    if (!escalationToResolve) return;
    if (!resolutionNotes.trim()) {
      setNotification({ kind: 'error', message: 'Clinical resolution notes are required.' });
      return;
    }
    setIsResolvingEscalation(true);
    try {
      await hospitalApi.resolveEscalation(escalationToResolve.id, resolutionNotes.trim());
      setNotification({
        kind: 'success',
        message: `Emergency escalation resolved for ${escalationToResolve.patientName}.`
      });
      setEscalationToResolve(null);
      setResolutionNotes('');
      await refreshWorkspace();
    } catch (err: any) {
      setNotification({
        kind: 'error',
        message: err.message || 'Failed to resolve escalation'
      });
    } finally {
      setIsResolvingEscalation(false);
    }
  };

  // Initiate Clinical Encounter
  const handleInitiateEncounter = async (item: QueueItem) => {
    setIsSubmittingAction(true);
    try {
      const enc = await hospitalApi.initiateClinicalEncounter({
        patientId: item.patientId,
        appointmentId: item.id,
        reasonForVisit: item.notes || 'Clinical consultation and therapy evaluation'
      });
      setActiveEncounter(enc);
      setSelectedQueueItem(item);
      setNotification({
        kind: 'success',
        message: `Clinical encounter initiated: ${enc.encounterNumber} (${enc.discipline})`
      });
      await refreshWorkspace();
    } catch (err: any) {
      if (err.code === 'ACTIVE_ENCOUNTER_EXISTS') {
        setNotification({
          kind: 'info',
          message: 'An active encounter already exists for this appointment. Loading current encounter.'
        });
        // Try to load by patient history
        const hist = await hospitalApi.getPatientClinicalHistory(item.patientId).catch(() => null);
        if (hist && hist.encounters && hist.encounters.length > 0) {
          const inProg = hist.encounters.find((e) => e.status === 'in_progress');
          if (inProg) setActiveEncounter(inProg);
        }
      } else {
        setNotification({
          kind: 'error',
          message: err.message || 'Failed to initiate clinical encounter'
        });
      }
    } finally {
      setIsSubmittingAction(false);
    }
  };

  // Record Vitals Submit
  const handleSaveVitals = async () => {
    if (!activeEncounter) {
      setNotification({ kind: 'error', message: 'Please initiate an encounter before recording vitals.' });
      return;
    }
    setIsSubmittingAction(true);
    try {
      const vitalsPayload: any = {};
      if (systolic !== '') vitalsPayload.bpSystolic = Number(systolic);
      if (diastolic !== '') vitalsPayload.bpDiastolic = Number(diastolic);
      if (heartRate !== '') vitalsPayload.heartRate = Number(heartRate);
      if (respRate !== '') vitalsPayload.respiratoryRate = Number(respRate);
      if (spo2 !== '') vitalsPayload.spO2 = Number(spo2);
      if (temperature !== '') vitalsPayload.temperature = Number(temperature);
      if (height !== '') vitalsPayload.height = Number(height);
      if (weight !== '') vitalsPayload.weight = Number(weight);

      const saved = await hospitalApi.recordClinicalVitals(activeEncounter.id, vitalsPayload);
      setLatestVitalsRecord(saved);
      setNotification({
        kind: 'success',
        message: `Vitals recorded successfully. Server-calculated BMI: ${saved.bmi ?? 'N/A'}`
      });
      const updatedHistory = await hospitalApi.getPatientClinicalHistory(activeEncounter.patientId).catch(() => null);
      if (updatedHistory) setClinicalHistory(updatedHistory);
    } catch (err: any) {
      setNotification({ kind: 'error', message: err.message || 'Failed to record vitals' });
    } finally {
      setIsSubmittingAction(false);
    }
  };

  // Save Clinical Assessment & Diagnoses
  const handleSaveAssessment = async () => {
    if (!activeEncounter) return;
    setIsSubmittingAction(true);
    try {
      await hospitalApi.saveClinicalAssessment(activeEncounter.id, {
        subjectiveNotes: subjectiveNotes.trim() || undefined,
        objectiveFindings: objectiveFindings.trim() || undefined,
        assessmentNotes: assessmentNotes.trim() || undefined,
        clinicalPlan: clinicalPlan.trim() || undefined
      });
      setNotification({ kind: 'success', message: 'Practitioner clinical assessment saved.' });
    } catch (err: any) {
      setNotification({ kind: 'error', message: err.message || 'Failed to save assessment' });
    } finally {
      setIsSubmittingAction(false);
    }
  };

  const handleAddDiagnosis = async () => {
    if (!activeEncounter) return;
    if (!diagnosisName.trim()) {
      setNotification({ kind: 'error', message: 'Diagnosis name is required.' });
      return;
    }
    setIsSubmittingAction(true);
    try {
      await hospitalApi.addClinicalDiagnosis(activeEncounter.id, {
        diagnosisName: diagnosisName.trim(),
        icd10Code: icd10Code.trim() || undefined,
        diagnosisType
      });
      setNotification({ kind: 'success', message: `Diagnosis "${diagnosisName}" saved.` });
      setDiagnosisName('');
      setIcd10Code('');
      const updatedHistory = await hospitalApi.getPatientClinicalHistory(activeEncounter.patientId).catch(() => null);
      if (updatedHistory) setClinicalHistory(updatedHistory);
    } catch (err: any) {
      setNotification({ kind: 'error', message: err.message || 'Failed to add diagnosis' });
    } finally {
      setIsSubmittingAction(false);
    }
  };

  // Order Modern Investigation
  const handleOrderInvestigation = async () => {
    if (!activeEncounter) return;
    setIsSubmittingAction(true);
    try {
      const order = await hospitalApi.orderClinicalInvestigation(activeEncounter.id, {
        testType,
        priority: investigationPriority,
        clinicalIndication: clinicalIndication.trim() || undefined
      });
      setNotification({
        kind: 'success',
        message: `Investigation ordered: ${order.orderNumber} (${order.testType})`
      });
      setClinicalIndication('');
      const updatedHistory = await hospitalApi.getPatientClinicalHistory(activeEncounter.patientId).catch(() => null);
      if (updatedHistory) setClinicalHistory(updatedHistory);
    } catch (err: any) {
      setNotification({ kind: 'error', message: err.message || 'Failed to order investigation' });
    } finally {
      setIsSubmittingAction(false);
    }
  };

  // Record Investigation Result
  const handleRecordResultSubmit = async () => {
    if (!resultEntryOrderId || !resultValue.trim()) return;
    setIsSubmittingAction(true);
    try {
      await hospitalApi.recordInvestigationResult(resultEntryOrderId, {
        resultValue: resultValue.trim(),
        normalRange: normalRange.trim() || undefined,
        isAbnormal
      });
      setNotification({ kind: 'success', message: 'Laboratory results recorded successfully.' });
      setResultEntryOrderId(null);
      setResultValue('');
      setNormalRange('');
      setIsAbnormal(false);
      if (activeEncounter) {
        const updatedHistory = await hospitalApi.getPatientClinicalHistory(activeEncounter.patientId).catch(() => null);
        if (updatedHistory) setClinicalHistory(updatedHistory);
      }
    } catch (err: any) {
      setNotification({ kind: 'error', message: err.message || 'Failed to record result' });
    } finally {
      setIsSubmittingAction(false);
    }
  };

  // Clinician Review Investigation
  const handleReviewInvestigationSubmit = async () => {
    if (!reviewOrderId) return;
    setIsSubmittingAction(true);
    try {
      await hospitalApi.reviewClinicalInvestigation(reviewOrderId, {
        reviewNotes: reviewNotes.trim() || 'Reviewed and clinically confirmed by attending physician.'
      });
      setNotification({ kind: 'success', message: 'Investigation reviewed and authorized.' });
      setReviewOrderId(null);
      setReviewNotes('');
      if (activeEncounter) {
        const updatedHistory = await hospitalApi.getPatientClinicalHistory(activeEncounter.patientId).catch(() => null);
        if (updatedHistory) setClinicalHistory(updatedHistory);
      }
    } catch (err: any) {
      setNotification({ kind: 'error', message: err.message || 'Failed to review investigation' });
    } finally {
      setIsSubmittingAction(false);
    }
  };

  // Prescribe Medication
  const handlePrescribeMedication = async () => {
    if (!activeEncounter) return;
    if (!prescribeMedName.trim()) {
      setNotification({ kind: 'error', message: 'Medication name is required.' });
      return;
    }
    setIsSubmittingAction(true);
    try {
      const rx = await hospitalApi.prescribeClinicalMedication(activeEncounter.id, {
        medicationName: prescribeMedName.trim(),
        dosage: prescribeDosage.trim(),
        frequency: prescribeFrequency.trim(),
        duration: prescribeDuration.trim(),
        instructions: prescribeInstructions.trim()
      });
      setNotification({
        kind: 'success',
        message: `Prescription issued: ${rx.rxNumber} (${rx.medicationName}). Status: pending.`
      });
      setPrescribeMedName('');
      const updatedHistory = await hospitalApi.getPatientClinicalHistory(activeEncounter.patientId).catch(() => null);
      if (updatedHistory) setClinicalHistory(updatedHistory);
    } catch (err: any) {
      setNotification({ kind: 'error', message: err.message || 'Failed to prescribe medication' });
    } finally {
      setIsSubmittingAction(false);
    }
  };

  // Save Ayurvedic Prakriti
  const handleSavePrakriti = async () => {
    if (!activeEncounter) return;
    if (!prakritiInterpretation.trim()) {
      setNotification({ kind: 'error', message: 'Vaidya clinical interpretation is mandatory for Prakriti.' });
      return;
    }
    setIsSubmittingAction(true);
    try {
      await hospitalApi.recordPrakritiAssessment(activeEncounter.id, {
        vataScore: prakritiVata,
        pittaScore: prakritiPitta,
        kaphaScore: prakritiKapha,
        dominantPrakriti: prakritiDominant,
        clinicalInterpretation: prakritiInterpretation.trim()
      });
      setNotification({ kind: 'success', message: 'Ayurvedic Prakriti assessment saved.' });
      const updatedHistory = await hospitalApi.getPatientClinicalHistory(activeEncounter.patientId).catch(() => null);
      if (updatedHistory) setClinicalHistory(updatedHistory);
    } catch (err: any) {
      setNotification({ kind: 'error', message: err.message || 'Failed to save Prakriti' });
    } finally {
      setIsSubmittingAction(false);
    }
  };

  // Save Ayurvedic Vikriti
  const handleSaveVikriti = async () => {
    if (!activeEncounter) return;
    if (!vikritiInterpretation.trim()) {
      setNotification({ kind: 'error', message: 'Vaidya clinical interpretation is mandatory for Vikriti.' });
      return;
    }
    setIsSubmittingAction(true);
    try {
      await hospitalApi.recordVikritiAssessment(activeEncounter.id, {
        primaryImbalance: vikritiPrimary.trim(),
        secondaryImbalance: vikritiSecondary.trim() || undefined,
        clinicalInterpretation: vikritiInterpretation.trim()
      });
      setNotification({ kind: 'success', message: 'Ayurvedic Vikriti assessment saved.' });
      const updatedHistory = await hospitalApi.getPatientClinicalHistory(activeEncounter.patientId).catch(() => null);
      if (updatedHistory) setClinicalHistory(updatedHistory);
    } catch (err: any) {
      setNotification({ kind: 'error', message: err.message || 'Failed to save Vikriti' });
    } finally {
      setIsSubmittingAction(false);
    }
  };

  // Save Dosha Evaluation & Ashta Vidha Pariksha
  const handleSaveDoshaEvaluation = async () => {
    if (!activeEncounter) return;
    if (!doshaInterpretation.trim()) {
      setNotification({ kind: 'error', message: 'Vaidya clinical interpretation is mandatory for Dosha Evaluation.' });
      return;
    }
    setIsSubmittingAction(true);
    try {
      await hospitalApi.recordDoshaEvaluation(activeEncounter.id, {
        agniStatus,
        amaStatus,
        koshthaType,
        nadiPariksha,
        jihvaPariksha,
        sparshaPariksha,
        clinicalInterpretation: doshaInterpretation.trim()
      });
      setNotification({ kind: 'success', message: 'Dosha evaluation & Ashta Vidha Pariksha saved.' });
      const updatedHistory = await hospitalApi.getPatientClinicalHistory(activeEncounter.patientId).catch(() => null);
      if (updatedHistory) setClinicalHistory(updatedHistory);
    } catch (err: any) {
      setNotification({ kind: 'error', message: err.message || 'Failed to save Dosha evaluation' });
    } finally {
      setIsSubmittingAction(false);
    }
  };

  // Save Treatment Plan
  const handleSaveTreatmentPlan = async () => {
    if (!activeEncounter) return;
    setIsSubmittingAction(true);
    try {
      const plan = await hospitalApi.createAyurvedicTreatmentPlan(activeEncounter.id, {
        diagnosis: vikritiPrimary || 'Classical Ayurvedic Therapy Protocol',
        planType: treatmentPlanTitle.trim(),
        durationDays: Number(treatmentPlanDuration),
        dietaryGuidelines: dietaryGuidelines.trim(),
        lifestyleModifications: lifestyleGuidelines.trim()
      });
      setNotification({
        kind: 'success',
        message: `Ayurvedic Treatment Plan created: ${plan.planNumber}`
      });
      const updatedHistory = await hospitalApi.getPatientClinicalHistory(activeEncounter.patientId).catch(() => null);
      if (updatedHistory) setClinicalHistory(updatedHistory);
    } catch (err: any) {
      setNotification({ kind: 'error', message: err.message || 'Failed to create treatment plan' });
    } finally {
      setIsSubmittingAction(false);
    }
  };

  // Save Panchakarma Referral
  const handleSavePanchakarmaReferral = async () => {
    if (!activeEncounter) return;
    setIsSubmittingAction(true);
    try {
      const ref = await hospitalApi.createPanchakarmaReferral(activeEncounter.id, {
        proposedTherapies: [panchakarmaTherapy.trim()],
        clinicalIndication: vikritiPrimary || 'Shodhana & Shamana Chikitsa',
        precautions: panchakarmaPrecautions.trim(),
        preTreatmentObservations: panchakarmaObservations.trim()
      });
      setNotification({
        kind: 'success',
        message: `Panchakarma Referral generated: ${ref.referralNumber}. Status: referred.`
      });
      const updatedHistory = await hospitalApi.getPatientClinicalHistory(activeEncounter.patientId).catch(() => null);
      if (updatedHistory) setClinicalHistory(updatedHistory);
    } catch (err: any) {
      setNotification({ kind: 'error', message: err.message || 'Failed to create Panchakarma referral' });
    } finally {
      setIsSubmittingAction(false);
    }
  };

  // Complete Encounter
  const handleCompleteEncounter = async () => {
    if (!activeEncounter) return;
    if (!window.confirm(`Complete clinical documentation for ${activeEncounter.encounterNumber}? This will mark the encounter and appointment as completed.`)) {
      return;
    }
    setIsSubmittingAction(true);
    try {
      const completed = await hospitalApi.completeClinicalEncounter(activeEncounter.id);
      setNotification({
        kind: 'success',
        message: `Clinical encounter ${completed.encounterNumber} completed. Clinical documentation verified.`
      });
      setActiveEncounter(null);
      await refreshWorkspace();
    } catch (err: any) {
      setNotification({ kind: 'error', message: err.message || 'Failed to complete encounter' });
    } finally {
      setIsSubmittingAction(false);
    }
  };

  const filteredQueue = queue.filter((item) => {
    const q = searchQuery.toLowerCase();
    return (
      item.patientName.toLowerCase().includes(q) ||
      item.patientMrn.toLowerCase().includes(q) ||
      (item.appointmentNumber && item.appointmentNumber.toLowerCase().includes(q))
    );
  });

  return (
    <div className="space-y-6">
      {/* Top Banner & Discipline Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#e0e0e0] pb-4">
        <div>
          <div className="flex items-center gap-2">
            {activeDiscipline === 'DOCTOR' ? (
              <Stethoscope className="w-6 h-6 text-[#0f62fe]" />
            ) : (
              <Flame className="w-6 h-6 text-[#198038]" />
            )}
            <h1 className="text-xl font-semibold text-[#161616]">
              {activeDiscipline === 'DOCTOR'
                ? 'Doctor Clinical Workspace (Modern Medicine)'
                : 'Vaidya Clinical Workspace (Classical Ayurveda)'}
            </h1>
          </div>
          <p className="text-xs text-[#525252] mt-1">
            Authoritative clinical encounter execution, diagnostic orders, and discipline-isolated governance.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Discipline Switcher for Admin Roles */}
          {!isDoctorRole && !isVaidyaRole && (
            <div className="inline-flex border border-[#c6c6c6] bg-[#f4f4f4] p-0.5 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setActiveDiscipline('DOCTOR')}
                className={`px-3 py-1.5 transition-colors ${
                  activeDiscipline === 'DOCTOR' ? 'bg-[#0f62fe] text-white shadow-sm' : 'text-[#525252] hover:text-[#161616]'
                }`}
              >
                Modern Medicine (Doctor)
              </button>
              <button
                type="button"
                onClick={() => setActiveDiscipline('VAIDYA')}
                className={`px-3 py-1.5 transition-colors ${
                  activeDiscipline === 'VAIDYA' ? 'bg-[#198038] text-white shadow-sm' : 'text-[#525252] hover:text-[#161616]'
                }`}
              >
                Classical Ayurveda (Vaidya)
              </button>
            </div>
          )}

          <CarbonButton
            kind="ghost"
            renderIcon={RefreshCw}
            onClick={refreshWorkspace}
            title="Refresh clinical metrics and waiting queue from PostgreSQL"
          >
            Refresh
          </CarbonButton>
        </div>
      </div>

      {/* Notification Toast Banner */}
      {notification && (
        <div
          className={`p-3 border-l-4 flex items-center justify-between text-xs ${
            notification.kind === 'success'
              ? 'bg-[#defbe6] border-l-[#24a148] text-[#0e6027] border border-[#a7f0ba]'
              : notification.kind === 'error'
              ? 'bg-[#fff1f1] border-l-[#da1e28] text-[#da1e28] border border-[#ffd7d9]'
              : 'bg-[#edf5ff] border-l-[#0f62fe] text-[#0043ce] border border-[#a6c8ff]'
          }`}
        >
          <div className="flex items-center gap-2">
            {notification.kind === 'success' && <Check className="w-4 h-4 shrink-0" />}
            {notification.kind === 'error' && <AlertTriangle className="w-4 h-4 shrink-0" />}
            {notification.kind === 'info' && <Clock className="w-4 h-4 shrink-0" />}
            <span>{notification.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setNotification(null)}
            className="text-xs font-semibold hover:underline ml-4"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Authoritative PostgreSQL Metrics Dashboard */}
      {activeDiscipline === 'DOCTOR' && doctorMetrics && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
          <CarbonTile title="Today's Appts" subtitle="Modern Medicine">
            <span className="text-2xl font-semibold font-mono text-[#161616]">
              {doctorMetrics.todayAppointments}
            </span>
          </CarbonTile>
          <CarbonTile title="Waiting Queue" subtitle="Ready for check-in">
            <span className="text-2xl font-semibold font-mono text-[#0f62fe]">
              {doctorMetrics.waitingQueue}
            </span>
          </CarbonTile>
          <CarbonTile title="Emergency Queue" subtitle="Escalated triage">
            <span className="text-2xl font-semibold font-mono text-[#da1e28]">
              {doctorMetrics.escalatedQueue}
            </span>
          </CarbonTile>
          <CarbonTile title="In Consultation" subtitle="Active encounters">
            <span className="text-2xl font-semibold font-mono text-[#8a6d00]">
              {doctorMetrics.activeConsultations}
            </span>
          </CarbonTile>
          <CarbonTile title="Completed" subtitle="Today's encounters">
            <span className="text-2xl font-semibold font-mono text-[#24a148]">
              {doctorMetrics.completedEncounters}
            </span>
          </CarbonTile>
          <CarbonTile title="Investigations" subtitle="Pending lab review">
            <span className="text-2xl font-semibold font-mono text-[#6929c4]">
              {doctorMetrics.pendingInvestigations}
            </span>
          </CarbonTile>
          <CarbonTile title="Documentation" subtitle="Pending sign-off">
            <span className="text-2xl font-semibold font-mono text-[#525252]">
              {doctorMetrics.pendingDocumentation}
            </span>
          </CarbonTile>
        </div>
      )}

      {activeDiscipline === 'VAIDYA' && vaidyaMetrics && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
          <CarbonTile title="Today's Appts" subtitle="Classical Ayurveda">
            <span className="text-2xl font-semibold font-mono text-[#161616]">
              {vaidyaMetrics.todayAppointments}
            </span>
          </CarbonTile>
          <CarbonTile title="Waiting Queue" subtitle="Rogi Pareeksha">
            <span className="text-2xl font-semibold font-mono text-[#198038]">
              {vaidyaMetrics.waitingQueue}
            </span>
          </CarbonTile>
          <CarbonTile title="Emergency Queue" subtitle="Escalated triage">
            <span className="text-2xl font-semibold font-mono text-[#da1e28]">
              {vaidyaMetrics.escalatedQueue}
            </span>
          </CarbonTile>
          <CarbonTile title="In Consultation" subtitle="Active encounters">
            <span className="text-2xl font-semibold font-mono text-[#8a6d00]">
              {vaidyaMetrics.activeConsultations}
            </span>
          </CarbonTile>
          <CarbonTile title="Treatment Plans" subtitle="Pending formulation">
            <span className="text-2xl font-semibold font-mono text-[#1192e8]">
              {vaidyaMetrics.pendingTreatmentPlans}
            </span>
          </CarbonTile>
          <CarbonTile title="Panchakarma" subtitle="Pending referrals">
            <span className="text-2xl font-semibold font-mono text-[#8a3800]">
              {vaidyaMetrics.panchakarmaReferrals}
            </span>
          </CarbonTile>
          <CarbonTile title="Completed" subtitle="Today's encounters">
            <span className="text-2xl font-semibold font-mono text-[#24a148]">
              {vaidyaMetrics.completedEncounters}
            </span>
          </CarbonTile>
        </div>
      )}

      {/* Main Layout: 2 Columns (Left: Queue & Escalation, Right: Consultation Workspace) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Authorized Clinical Queue (4 cols) */}
        <div className="lg:col-span-4 space-y-4">
          <div className="bg-white border border-[#e0e0e0] p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <User className="w-4 h-4 text-[#525252]" />
                <h2 className="text-sm font-semibold text-[#161616]">
                  {activeDiscipline === 'DOCTOR' ? 'Doctor Waiting Queue' : 'Vaidya Waiting Queue'}
                </h2>
              </div>
              <span className="font-mono text-xs text-[#525252] bg-[#f4f4f4] px-2 py-0.5 border border-[#e0e0e0]">
                {queue.length} in queue
              </span>
            </div>

            <div className="relative">
              <Search className="w-3.5 h-3.5 text-[#525252] absolute left-2.5 top-2.5" />
              <input
                type="text"
                placeholder="Search patient, MRN..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-[#f4f4f4] border border-[#c6c6c6] h-8 pl-8 pr-2 text-xs"
              />
            </div>

            {isLoadingQueue ? (
              <div className="py-8 text-center text-xs text-[#525252]">
                Loading authoritative queue from PostgreSQL...
              </div>
            ) : filteredQueue.length === 0 ? (
              <div className="py-8 text-center text-xs text-[#525252]">
                No patients currently in the {activeDiscipline.toLowerCase()} waiting queue.
              </div>
            ) : (
              <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
                {filteredQueue.map((item) => {
                  const isSelected = selectedQueueItem?.id === item.id;
                  const isEscalated = Boolean(item.isEscalated);
                  const isAcked = item.escalationStatus === 'acknowledged';

                  return (
                    <div
                      key={item.id}
                      className={`p-3 border transition-colors cursor-pointer text-xs ${
                        isEscalated
                          ? 'border-l-4 border-l-[#da1e28] bg-[#fff1f1] border-[#ffd7d9]'
                          : isSelected
                          ? 'border-l-4 border-l-[#0f62fe] bg-[#edf5ff] border-[#a6c8ff]'
                          : 'bg-white border-[#e0e0e0] hover:bg-[#f4f4f4]'
                      }`}
                      onClick={() => setSelectedQueueItem(item)}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="font-semibold text-[#161616] flex items-center gap-1.5">
                            <span>{item.patientName}</span>
                            {isEscalated && (
                              <span className="bg-[#da1e28] text-white text-[10px] font-bold px-1.5 py-0.2 uppercase">
                                EMERGENCY
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-[#525252] font-mono mt-0.5">
                            MRN: {item.patientMrn} • Wait: {item.waitingDurationMinutes || 0}m
                          </div>
                        </div>
                        <CarbonTag
                          type={
                            item.status === 'in_consultation'
                              ? 'warm-gray'
                              : item.priority === 'urgent'
                              ? 'red'
                              : 'blue'
                          }
                          size="sm"
                        >
                          {item.status === 'in_consultation' ? 'In Consultation' : item.priority}
                        </CarbonTag>
                      </div>

                      {/* Escalation Details & Actions */}
                      {isEscalated && (
                        <div className="mt-2 pt-2 border-t border-[#ffd7d9] text-[11px] space-y-1.5">
                          <div className="text-[#da1e28] font-medium flex items-center gap-1">
                            <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
                            <span>Escalation: {item.escalationReason || 'Emergency Priority'}</span>
                          </div>
                          <div className="flex items-center gap-2 pt-1">
                            {!isAcked && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleAcknowledgeEscalation(item);
                                }}
                                className="bg-[#0f62fe] text-white text-[10px] font-semibold px-2 py-0.5 hover:bg-[#0353e9]"
                              >
                                Acknowledge
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setEscalationToResolve(item);
                                setResolutionNotes('');
                              }}
                              className="bg-[#24a148] text-white text-[10px] font-semibold px-2 py-0.5 hover:bg-[#198038]"
                            >
                              Resolve
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Action buttons */}
                      <div className="mt-3 flex items-center justify-between border-t border-[#f4f4f4] pt-2">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            const p = patients.find((pat) => pat.id === item.patientId || pat.mrn === item.patientMrn);
                            if (p) setDossierPatient(p);
                          }}
                          className="text-[#0f62fe] hover:underline text-[11px] font-semibold flex items-center gap-1"
                        >
                          <FileText className="w-3 h-3" />
                          <span>Dossier</span>
                        </button>

                        <button
                          type="button"
                          disabled={isSubmittingAction}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleInitiateEncounter(item);
                          }}
                          className="bg-[#161616] hover:bg-[#393939] text-white text-[11px] font-semibold px-2.5 py-1 flex items-center gap-1"
                        >
                          <span>{item.status === 'in_consultation' ? 'Resume' : 'Initiate'}</span>
                          <ChevronRight className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Active Clinical Workspace (8 cols) */}
        <div className="lg:col-span-8 space-y-4">
          {!activeEncounter ? (
            <div className="bg-white border border-[#e0e0e0] p-12 text-center space-y-4">
              <div className="w-12 h-12 rounded-full bg-[#edf5ff] flex items-center justify-center mx-auto text-[#0f62fe]">
                <Activity className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-[#161616]">
                  No Clinical Encounter Active
                </h3>
                <p className="text-xs text-[#525252] max-w-md mx-auto mt-1">
                  Select a patient from the waiting queue on the left and click{' '}
                  <strong>&quot;Initiate&quot;</strong> to start a database-backed consultation session.
                </p>
              </div>
            </div>
          ) : (
            <div className="bg-white border border-[#e0e0e0] p-4 space-y-4">
              {/* Encounter Header Banner */}
              <div className="p-3 bg-[#edf5ff] border border-[#a6c8ff] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-[#0f62fe] bg-white px-2 py-0.5 border border-[#a6c8ff]">
                      {activeEncounter.encounterNumber}
                    </span>
                    <span className="text-sm font-semibold text-[#161616]">
                      {selectedQueueItem?.patientName || 'Consultation Dossier'}
                    </span>
                    <CarbonTag type="blue" size="sm">
                      {activeEncounter.discipline}
                    </CarbonTag>
                    <CarbonTag type="green" size="sm">
                      IN PROGRESS
                    </CarbonTag>
                  </div>
                  <div className="text-xs text-[#525252] mt-1 font-mono">
                    MRN: {selectedQueueItem?.patientMrn} • Started:{' '}
                    {new Date(activeEncounter.startedAt).toLocaleTimeString()}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <CarbonButton
                    kind="primary"
                    size="sm"
                    renderIcon={CheckCheck}
                    onClick={handleCompleteEncounter}
                    disabled={isSubmittingAction}
                    title="Conclude clinical documentation and synchronize appointment to completed"
                  >
                    Complete Encounter
                  </CarbonButton>
                </div>
              </div>

              {/* Clinical Tabs Bar */}
              <div className="flex items-center gap-1 border-b border-[#e0e0e0] overflow-x-auto text-xs font-semibold">
                {activeDiscipline === 'DOCTOR' ? (
                  <>
                    <button
                      type="button"
                      onClick={() => setActiveTab('vitals')}
                      className={`px-3 py-2 border-b-2 transition-colors ${
                        activeTab === 'vitals'
                          ? 'border-[#0f62fe] text-[#0f62fe]'
                          : 'border-transparent text-[#525252] hover:text-[#161616]'
                      }`}
                    >
                      Vitals & BMI
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab('assessment')}
                      className={`px-3 py-2 border-b-2 transition-colors ${
                        activeTab === 'assessment'
                          ? 'border-[#0f62fe] text-[#0f62fe]'
                          : 'border-transparent text-[#525252] hover:text-[#161616]'
                      }`}
                    >
                      Assessment & Diagnoses
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab('investigations')}
                      className={`px-3 py-2 border-b-2 transition-colors ${
                        activeTab === 'investigations'
                          ? 'border-[#0f62fe] text-[#0f62fe]'
                          : 'border-transparent text-[#525252] hover:text-[#161616]'
                      }`}
                    >
                      Investigations
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab('prescriptions')}
                      className={`px-3 py-2 border-b-2 transition-colors ${
                        activeTab === 'prescriptions'
                          ? 'border-[#0f62fe] text-[#0f62fe]'
                          : 'border-transparent text-[#525252] hover:text-[#161616]'
                      }`}
                    >
                      Prescriptions
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab('history')}
                      className={`px-3 py-2 border-b-2 transition-colors ${
                        activeTab === 'history'
                          ? 'border-[#0f62fe] text-[#0f62fe]'
                          : 'border-transparent text-[#525252] hover:text-[#161616]'
                      }`}
                    >
                      Clinical History
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => setActiveTab('prakriti')}
                      className={`px-3 py-2 border-b-2 transition-colors ${
                        activeTab === 'prakriti'
                          ? 'border-[#198038] text-[#198038]'
                          : 'border-transparent text-[#525252] hover:text-[#161616]'
                      }`}
                    >
                      Prakriti
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab('vikriti')}
                      className={`px-3 py-2 border-b-2 transition-colors ${
                        activeTab === 'vikriti'
                          ? 'border-[#198038] text-[#198038]'
                          : 'border-transparent text-[#525252] hover:text-[#161616]'
                      }`}
                    >
                      Vikriti
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab('dosha')}
                      className={`px-3 py-2 border-b-2 transition-colors ${
                        activeTab === 'dosha'
                          ? 'border-[#198038] text-[#198038]'
                          : 'border-transparent text-[#525252] hover:text-[#161616]'
                      }`}
                    >
                      Dosha & Pariksha
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab('treatment')}
                      className={`px-3 py-2 border-b-2 transition-colors ${
                        activeTab === 'treatment'
                          ? 'border-[#198038] text-[#198038]'
                          : 'border-transparent text-[#525252] hover:text-[#161616]'
                      }`}
                    >
                      Treatment Plan
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab('panchakarma')}
                      className={`px-3 py-2 border-b-2 transition-colors ${
                        activeTab === 'panchakarma'
                          ? 'border-[#198038] text-[#198038]'
                          : 'border-transparent text-[#525252] hover:text-[#161616]'
                      }`}
                    >
                      Panchakarma Referral
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab('prescriptions')}
                      className={`px-3 py-2 border-b-2 transition-colors ${
                        activeTab === 'prescriptions'
                          ? 'border-[#198038] text-[#198038]'
                          : 'border-transparent text-[#525252] hover:text-[#161616]'
                      }`}
                    >
                      Herbal Prescriptions
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab('history')}
                      className={`px-3 py-2 border-b-2 transition-colors ${
                        activeTab === 'history'
                          ? 'border-[#198038] text-[#198038]'
                          : 'border-transparent text-[#525252] hover:text-[#161616]'
                      }`}
                    >
                      Clinical History
                    </button>
                  </>
                )}
              </div>

              {/* Tab 1: Vitals & BMI */}
              {activeTab === 'vitals' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-[#161616] mb-1">Systolic BP (mmHg)</label>
                      <input
                        type="number"
                        placeholder="120"
                        value={systolic}
                        onChange={(e) => setSystolic(e.target.value === '' ? '' : Number(e.target.value))}
                        className="w-full bg-[#f4f4f4] border border-[#c6c6c6] h-8 px-2 text-xs font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-[#161616] mb-1">Diastolic BP (mmHg)</label>
                      <input
                        type="number"
                        placeholder="80"
                        value={diastolic}
                        onChange={(e) => setDiastolic(e.target.value === '' ? '' : Number(e.target.value))}
                        className="w-full bg-[#f4f4f4] border border-[#c6c6c6] h-8 px-2 text-xs font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-[#161616] mb-1">Heart Rate (bpm)</label>
                      <input
                        type="number"
                        placeholder="72"
                        value={heartRate}
                        onChange={(e) => setHeartRate(e.target.value === '' ? '' : Number(e.target.value))}
                        className="w-full bg-[#f4f4f4] border border-[#c6c6c6] h-8 px-2 text-xs font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-[#161616] mb-1">SpO2 (%)</label>
                      <input
                        type="number"
                        placeholder="98"
                        value={spo2}
                        onChange={(e) => setSpo2(e.target.value === '' ? '' : Number(e.target.value))}
                        className="w-full bg-[#f4f4f4] border border-[#c6c6c6] h-8 px-2 text-xs font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-[#161616] mb-1">Resp Rate (/min)</label>
                      <input
                        type="number"
                        placeholder="16"
                        value={respRate}
                        onChange={(e) => setRespRate(e.target.value === '' ? '' : Number(e.target.value))}
                        className="w-full bg-[#f4f4f4] border border-[#c6c6c6] h-8 px-2 text-xs font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-[#161616] mb-1">Temp (°C)</label>
                      <input
                        type="number"
                        step="0.1"
                        placeholder="36.8"
                        value={temperature}
                        onChange={(e) => setTemperature(e.target.value === '' ? '' : Number(e.target.value))}
                        className="w-full bg-[#f4f4f4] border border-[#c6c6c6] h-8 px-2 text-xs font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-[#161616] mb-1">Height (cm)</label>
                      <input
                        type="number"
                        placeholder="175"
                        value={height}
                        onChange={(e) => setHeight(e.target.value === '' ? '' : Number(e.target.value))}
                        className="w-full bg-[#f4f4f4] border border-[#c6c6c6] h-8 px-2 text-xs font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-[#161616] mb-1">Weight (kg)</label>
                      <input
                        type="number"
                        step="0.1"
                        placeholder="70"
                        value={weight}
                        onChange={(e) => setWeight(e.target.value === '' ? '' : Number(e.target.value))}
                        className="w-full bg-[#f4f4f4] border border-[#c6c6c6] h-8 px-2 text-xs font-mono"
                      />
                    </div>
                  </div>

                  {latestVitalsRecord && (
                    <div className="p-3 bg-[#f4f4f4] border border-[#e0e0e0] flex items-center justify-between text-xs">
                      <div>
                        <strong>Latest Persisted Vitals:</strong> Recorded by {latestVitalsRecord.recordedByName}
                      </div>
                      <div className="font-mono font-bold text-[#0f62fe]">
                        Calculated BMI: {latestVitalsRecord.bmi ?? 'N/A'}
                      </div>
                    </div>
                  )}

                  <div className="flex justify-end">
                    <CarbonButton
                      kind="primary"
                      size="sm"
                      onClick={handleSaveVitals}
                      disabled={isSubmittingAction}
                    >
                      Save Vitals
                    </CarbonButton>
                  </div>
                </div>
              )}

              {/* Tab 2: Assessment & Diagnoses */}
              {activeTab === 'assessment' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-[#161616] mb-1">Subjective Complaints</label>
                      <textarea
                        rows={3}
                        placeholder="Chief complaints & history of present illness..."
                        value={subjectiveNotes}
                        onChange={(e) => setSubjectiveNotes(e.target.value)}
                        className="w-full bg-[#f4f4f4] border border-[#c6c6c6] p-2 text-xs resize-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-[#161616] mb-1">Objective Physical Findings</label>
                      <textarea
                        rows={3}
                        placeholder="Physical & systemic examination findings..."
                        value={objectiveFindings}
                        onChange={(e) => setObjectiveFindings(e.target.value)}
                        className="w-full bg-[#f4f4f4] border border-[#c6c6c6] p-2 text-xs resize-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-[#161616] mb-1">Clinical Assessment</label>
                      <textarea
                        rows={3}
                        placeholder="Practitioner clinical reasoning & synthesis..."
                        value={assessmentNotes}
                        onChange={(e) => setAssessmentNotes(e.target.value)}
                        className="w-full bg-[#f4f4f4] border border-[#c6c6c6] p-2 text-xs resize-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-[#161616] mb-1">Clinical Plan</label>
                      <textarea
                        rows={3}
                        placeholder="Therapeutic plan, investigations, and follow-up..."
                        value={clinicalPlan}
                        onChange={(e) => setClinicalPlan(e.target.value)}
                        className="w-full bg-[#f4f4f4] border border-[#c6c6c6] p-2 text-xs resize-none"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <CarbonButton
                      kind="primary"
                      size="sm"
                      onClick={handleSaveAssessment}
                      disabled={isSubmittingAction}
                    >
                      Save Assessment Notes
                    </CarbonButton>
                  </div>

                  {/* Diagnoses Section */}
                  <div className="p-3 bg-[#f4f4f4] border border-[#e0e0e0] space-y-3">
                    <div className="text-xs font-semibold text-[#161616]">
                      Add Practitioner Diagnosis (ICD-10 Categorized)
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-[11px] text-[#525252] mb-1">Diagnosis Name *</label>
                        <input
                          type="text"
                          placeholder="e.g. Essential Hypertension"
                          value={diagnosisName}
                          onChange={(e) => setDiagnosisName(e.target.value)}
                          className="w-full bg-white border border-[#c6c6c6] h-8 px-2 text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-[#525252] mb-1">ICD-10 Code</label>
                        <input
                          type="text"
                          placeholder="e.g. I10"
                          value={icd10Code}
                          onChange={(e) => setIcd10Code(e.target.value)}
                          className="w-full bg-white border border-[#c6c6c6] h-8 px-2 text-xs font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-[#525252] mb-1">Diagnosis Type</label>
                        <select
                          value={diagnosisType}
                          onChange={(e) => setDiagnosisType(e.target.value as any)}
                          className="w-full bg-white border border-[#c6c6c6] h-8 px-2 text-xs"
                        >
                          <option value="provisional">Provisional</option>
                          <option value="final">Final Confirmed</option>
                          <option value="differential">Differential</option>
                        </select>
                      </div>
                    </div>
                    <div className="flex justify-end">
                      <CarbonButton
                        kind="secondary"
                        size="sm"
                        onClick={handleAddDiagnosis}
                        disabled={isSubmittingAction || !diagnosisName.trim()}
                      >
                        Add Diagnosis
                      </CarbonButton>
                    </div>
                  </div>
                </div>
              )}

              {/* Tab 3: Investigations */}
              {activeTab === 'investigations' && (
                <div className="space-y-4">
                  {/* Order Investigation Form */}
                  <div className="p-3 bg-[#f4f4f4] border border-[#e0e0e0] space-y-3">
                    <div className="text-xs font-semibold text-[#161616]">
                      Order Modern Medicine Diagnostic Investigation
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-[11px] text-[#525252] mb-1">Investigation / Test Panel *</label>
                        <select
                          value={testType}
                          onChange={(e) => setTestType(e.target.value)}
                          className="w-full bg-white border border-[#c6c6c6] h-8 px-2 text-xs"
                        >
                          <option value="Complete Blood Count (CBC with Differential)">Complete Blood Count (CBC)</option>
                          <option value="Comprehensive Metabolic Panel (CMP)">Comprehensive Metabolic Panel (CMP)</option>
                          <option value="Lipid Panel (Total, HDL, LDL, Triglycerides)">Lipid Profile</option>
                          <option value="Cardiac Troponin I (High-Sensitivity)">Cardiac Troponin I (High-Sensitivity)</option>
                          <option value="HbA1c Glycated Hemoglobin">HbA1c Glycated Hemoglobin</option>
                          <option value="Thyroid Stimulating Hormone (TSH)">TSH Thyroid Panel</option>
                          <option value="Renal Function Test (BUN, Creatinine, eGFR)">Renal Function Panel</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[11px] text-[#525252] mb-1">Priority</label>
                        <select
                          value={investigationPriority}
                          onChange={(e) => setInvestigationPriority(e.target.value)}
                          className="w-full bg-white border border-[#c6c6c6] h-8 px-2 text-xs"
                        >
                          <option value="Routine">Routine</option>
                          <option value="Urgent (<2 hrs)">Urgent (&lt;2 hrs)</option>
                          <option value="Stat Emergency">Stat Emergency</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[11px] text-[#525252] mb-1">Clinical Indication</label>
                        <input
                          type="text"
                          placeholder="e.g. Chest pain, palpitations"
                          value={clinicalIndication}
                          onChange={(e) => setClinicalIndication(e.target.value)}
                          className="w-full bg-white border border-[#c6c6c6] h-8 px-2 text-xs"
                        />
                      </div>
                    </div>
                    <div className="flex justify-end">
                      <CarbonButton
                        kind="primary"
                        size="sm"
                        onClick={handleOrderInvestigation}
                        disabled={isSubmittingAction}
                      >
                        Order Investigation
                      </CarbonButton>
                    </div>
                  </div>

                  {/* Active Orders List */}
                  <div className="space-y-2">
                    <div className="text-xs font-semibold text-[#161616]">
                      Encounter Diagnostic Orders & Verification
                    </div>
                    {clinicalHistory?.labOrders && clinicalHistory.labOrders.length > 0 ? (
                      <div className="space-y-2">
                        {clinicalHistory.labOrders.map((order) => (
                          <div key={order.id} className="p-3 bg-white border border-[#e0e0e0] text-xs space-y-2">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span className="font-mono font-bold text-[#0f62fe]">{order.orderNumber}</span>
                                <span className="font-semibold">{order.testType}</span>
                              </div>
                              <CarbonTag
                                type={
                                  order.status === 'reviewed'
                                    ? 'green'
                                    : order.status === 'result_available'
                                    ? 'blue'
                                    : 'warm-gray'
                                }
                                size="sm"
                              >
                                {order.status}
                              </CarbonTag>
                            </div>

                            {order.resultValue && (
                              <div className="p-2 bg-[#f4f4f4] text-xs font-mono space-y-0.5">
                                <div><strong>Result:</strong> {order.resultValue} {order.normalRange && `(Ref: ${order.normalRange})`}</div>
                                {order.isAbnormal && <div className="text-[#da1e28] font-bold">⚠️ Flagged Abnormal</div>}
                              </div>
                            )}

                            {order.reviewNotes && (
                              <div className="text-[11px] text-[#24a148]">
                                <strong>Reviewed by {order.reviewedByName}:</strong> {order.reviewNotes}
                              </div>
                            )}

                            <div className="flex items-center justify-end gap-2 pt-1 border-t border-[#f4f4f4]">
                              {order.status === 'ordered' && (
                                <button
                                  type="button"
                                  onClick={() => setResultEntryOrderId(order.id)}
                                  className="text-xs text-[#0f62fe] font-semibold hover:underline"
                                >
                                  Enter Results
                                </button>
                              )}
                              {order.status === 'result_available' && (
                                <button
                                  type="button"
                                  onClick={() => setReviewOrderId(order.id)}
                                  className="text-xs text-[#24a148] font-semibold hover:underline"
                                >
                                  Review & Authorize
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="p-4 text-center text-xs text-[#525252] bg-[#f4f4f4] border border-[#e0e0e0]">
                        No investigation orders recorded for this patient.
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Tab 4: Prescriptions */}
              {activeTab === 'prescriptions' && (
                <div className="space-y-4">
                  <div className="p-3 bg-[#f4f4f4] border border-[#e0e0e0] space-y-3">
                    <div className="text-xs font-semibold text-[#161616]">
                      {activeDiscipline === 'DOCTOR' ? 'Prescribe Medication (Formulary)' : 'Prescribe Classical Ayurvedic Herbal Medicine'}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-[11px] text-[#525252] mb-1">Medication Name *</label>
                        <input
                          type="text"
                          placeholder={activeDiscipline === 'DOCTOR' ? 'e.g. Amlodipine 5mg' : 'e.g. Sahacharadi Thailam 200ml'}
                          value={prescribeMedName}
                          onChange={(e) => setPrescribeMedName(e.target.value)}
                          className="w-full bg-white border border-[#c6c6c6] h-8 px-2 text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-[#525252] mb-1">Dosage</label>
                        <input
                          type="text"
                          value={prescribeDosage}
                          onChange={(e) => setPrescribeDosage(e.target.value)}
                          className="w-full bg-white border border-[#c6c6c6] h-8 px-2 text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-[#525252] mb-1">Frequency</label>
                        <input
                          type="text"
                          value={prescribeFrequency}
                          onChange={(e) => setPrescribeFrequency(e.target.value)}
                          className="w-full bg-white border border-[#c6c6c6] h-8 px-2 text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-[#525252] mb-1">Duration</label>
                        <input
                          type="text"
                          value={prescribeDuration}
                          onChange={(e) => setPrescribeDuration(e.target.value)}
                          className="w-full bg-white border border-[#c6c6c6] h-8 px-2 text-xs"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="block text-[11px] text-[#525252] mb-1">Instructions / Anupana</label>
                        <input
                          type="text"
                          value={prescribeInstructions}
                          onChange={(e) => setPrescribeInstructions(e.target.value)}
                          className="w-full bg-white border border-[#c6c6c6] h-8 px-2 text-xs"
                        />
                      </div>
                    </div>
                    <div className="flex justify-end">
                      <CarbonButton
                        kind="primary"
                        size="sm"
                        onClick={handlePrescribeMedication}
                        disabled={isSubmittingAction || !prescribeMedName.trim()}
                      >
                        Issue Prescription
                      </CarbonButton>
                    </div>
                  </div>

                  {/* List of issued prescriptions */}
                  <div className="space-y-2">
                    <div className="text-xs font-semibold text-[#161616]">
                      Issued Prescriptions (Pending Pharmacy Fulfillment)
                    </div>
                    {clinicalHistory?.prescriptions && clinicalHistory.prescriptions.length > 0 ? (
                      <div className="space-y-2">
                        {clinicalHistory.prescriptions.map((rx) => (
                          <div key={rx.id} className="p-3 bg-white border border-[#e0e0e0] flex items-center justify-between text-xs">
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-mono font-bold text-[#0f62fe]">{rx.rxNumber}</span>
                                <span className="font-semibold">{rx.medicationName}</span>
                              </div>
                              <div className="text-[11px] text-[#525252] mt-0.5">
                                {rx.dosage} • {rx.frequency} • {rx.duration} — {rx.instructions}
                              </div>
                            </div>
                            <CarbonTag type={rx.status === 'dispensed' ? 'green' : 'warm-gray'} size="sm">
                              {rx.status}
                            </CarbonTag>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="p-4 text-center text-xs text-[#525252] bg-[#f4f4f4] border border-[#e0e0e0]">
                        No prescriptions issued for this patient yet.
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Tab 5: Ayurvedic Prakriti */}
              {activeTab === 'prakriti' && (
                <div className="space-y-4">
                  <div className="p-3 bg-[#f4f4f4] border border-[#e0e0e0] space-y-3">
                    <div className="text-xs font-semibold text-[#161616]">
                      Prakriti Pariksha (Baseline Constitution Analysis)
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                      <div>
                        <label className="block text-[11px] text-[#525252] mb-1">Vata Score (%)</label>
                        <input
                          type="number"
                          value={prakritiVata}
                          onChange={(e) => setPrakritiVata(Number(e.target.value))}
                          className="w-full bg-white border border-[#c6c6c6] h-8 px-2 text-xs font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-[#525252] mb-1">Pitta Score (%)</label>
                        <input
                          type="number"
                          value={prakritiPitta}
                          onChange={(e) => setPrakritiPitta(Number(e.target.value))}
                          className="w-full bg-white border border-[#c6c6c6] h-8 px-2 text-xs font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-[#525252] mb-1">Kapha Score (%)</label>
                        <input
                          type="number"
                          value={prakritiKapha}
                          onChange={(e) => setPrakritiKapha(Number(e.target.value))}
                          className="w-full bg-white border border-[#c6c6c6] h-8 px-2 text-xs font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-[#525252] mb-1">Dominant Prakriti</label>
                        <select
                          value={prakritiDominant}
                          onChange={(e) => setPrakritiDominant(e.target.value as any)}
                          className="w-full bg-white border border-[#c6c6c6] h-8 px-2 text-xs"
                        >
                          <option value="Vata">Vata</option>
                          <option value="Pitta">Pitta</option>
                          <option value="Kapha">Kapha</option>
                          <option value="Vata-Pitta">Vata-Pitta</option>
                          <option value="Pitta-Kapha">Pitta-Kapha</option>
                          <option value="Vata-Kapha">Vata-Kapha</option>
                          <option value="Tridoshaja">Tridoshaja (Sama)</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="block text-[11px] text-[#525252] mb-1">
                        Mandatory Vaidya Clinical Interpretation *
                      </label>
                      <textarea
                        rows={3}
                        placeholder="Detailed clinical evaluation of the patient's Sharirika and Manasika Prakriti..."
                        value={prakritiInterpretation}
                        onChange={(e) => setPrakritiInterpretation(e.target.value)}
                        className="w-full bg-white border border-[#c6c6c6] p-2 text-xs resize-none"
                      />
                    </div>

                    <div className="flex justify-end">
                      <CarbonButton
                        kind="primary"
                        size="sm"
                        onClick={handleSavePrakriti}
                        disabled={isSubmittingAction || !prakritiInterpretation.trim()}
                      >
                        Save Prakriti Assessment
                      </CarbonButton>
                    </div>
                  </div>
                </div>
              )}

              {/* Tab 6: Ayurvedic Vikriti */}
              {activeTab === 'vikriti' && (
                <div className="space-y-4">
                  <div className="p-3 bg-[#f4f4f4] border border-[#e0e0e0] space-y-3">
                    <div className="text-xs font-semibold text-[#161616]">
                      Vikriti Pariksha (Pathological State & Dosha Imbalance)
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] text-[#525252] mb-1">Primary Dosha Imbalance *</label>
                        <input
                          type="text"
                          placeholder="e.g. Vata localized in Asthi and Sandhi"
                          value={vikritiPrimary}
                          onChange={(e) => setVikritiPrimary(e.target.value)}
                          className="w-full bg-white border border-[#c6c6c6] h-8 px-2 text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-[#525252] mb-1">Secondary Imbalance / Dushya</label>
                        <input
                          type="text"
                          placeholder="e.g. Pitta in Rakta Dhatu"
                          value={vikritiSecondary}
                          onChange={(e) => setVikritiSecondary(e.target.value)}
                          className="w-full bg-white border border-[#c6c6c6] h-8 px-2 text-xs"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[11px] text-[#525252] mb-1">
                        Mandatory Vaidya Clinical Interpretation *
                      </label>
                      <textarea
                        rows={3}
                        placeholder="Pathophysiological correlation (Samprapti Ghataka) and prognosis..."
                        value={vikritiInterpretation}
                        onChange={(e) => setVikritiInterpretation(e.target.value)}
                        className="w-full bg-white border border-[#c6c6c6] p-2 text-xs resize-none"
                      />
                    </div>

                    <div className="flex justify-end">
                      <CarbonButton
                        kind="primary"
                        size="sm"
                        onClick={handleSaveVikriti}
                        disabled={isSubmittingAction || !vikritiInterpretation.trim()}
                      >
                        Save Vikriti Assessment
                      </CarbonButton>
                    </div>
                  </div>
                </div>
              )}

              {/* Tab 7: Dosha & Ashta Vidha Pariksha */}
              {activeTab === 'dosha' && (
                <div className="space-y-4">
                  <div className="p-3 bg-[#f4f4f4] border border-[#e0e0e0] space-y-3">
                    <div className="text-xs font-semibold text-[#161616]">
                      Ashta Vidha Pariksha (Classical 8-Fold Examination) & Agni/Ama
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-[11px] text-[#525252] mb-1">Agni Status</label>
                        <select
                          value={agniStatus}
                          onChange={(e) => setAgniStatus(e.target.value)}
                          className="w-full bg-white border border-[#c6c6c6] h-8 px-2 text-xs"
                        >
                          <option value="Sama Agni (Balanced)">Sama Agni (Balanced)</option>
                          <option value="Vishama Agni (Irregular)">Vishama Agni (Irregular)</option>
                          <option value="Tikshna Agni (Hyperactive)">Tikshna Agni (Hyperactive)</option>
                          <option value="Manda Agni (Sluggish/Low)">Manda Agni (Sluggish/Low)</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[11px] text-[#525252] mb-1">Ama State</label>
                        <select
                          value={amaStatus}
                          onChange={(e) => setAmaStatus(e.target.value)}
                          className="w-full bg-white border border-[#c6c6c6] h-8 px-2 text-xs"
                        >
                          <option value="Nirama (Free of Ama)">Nirama (Free of Ama)</option>
                          <option value="Sama (Moderate Ama)">Sama (Moderate Ama)</option>
                          <option value="Bahulam (Severe Ama)">Bahulam (Severe Ama)</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[11px] text-[#525252] mb-1">Koshtha Type</label>
                        <select
                          value={koshthaType}
                          onChange={(e) => setKoshthaType(e.target.value)}
                          className="w-full bg-white border border-[#c6c6c6] h-8 px-2 text-xs"
                        >
                          <option value="Madhyama Koshtha (Normal)">Madhyama Koshtha (Normal)</option>
                          <option value="Krura Koshtha (Hard/Constipated)">Krura Koshtha (Hard/Constipated)</option>
                          <option value="Mridu Koshtha (Soft/Laxative Sensitive)">Mridu Koshtha (Soft/Laxative Sensitive)</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[11px] text-[#525252] mb-1">Nadi Pariksha (Pulse)</label>
                        <input
                          type="text"
                          value={nadiPariksha}
                          onChange={(e) => setNadiPariksha(e.target.value)}
                          className="w-full bg-white border border-[#c6c6c6] h-8 px-2 text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-[#525252] mb-1">Jihva Pariksha (Tongue)</label>
                        <input
                          type="text"
                          value={jihvaPariksha}
                          onChange={(e) => setJihvaPariksha(e.target.value)}
                          className="w-full bg-white border border-[#c6c6c6] h-8 px-2 text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-[#525252] mb-1">Sparsha Pariksha (Skin/Touch)</label>
                        <input
                          type="text"
                          value={sparshaPariksha}
                          onChange={(e) => setSparshaPariksha(e.target.value)}
                          className="w-full bg-white border border-[#c6c6c6] h-8 px-2 text-xs"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[11px] text-[#525252] mb-1">
                        Mandatory Vaidya Clinical Interpretation *
                      </label>
                      <textarea
                        rows={3}
                        placeholder="Clinical synthesis of Ashta Vidha Pariksha findings and therapeutic direction..."
                        value={doshaInterpretation}
                        onChange={(e) => setDoshaInterpretation(e.target.value)}
                        className="w-full bg-white border border-[#c6c6c6] p-2 text-xs resize-none"
                      />
                    </div>

                    <div className="flex justify-end">
                      <CarbonButton
                        kind="primary"
                        size="sm"
                        onClick={handleSaveDoshaEvaluation}
                        disabled={isSubmittingAction || !doshaInterpretation.trim()}
                      >
                        Save Dosha & Pariksha
                      </CarbonButton>
                    </div>
                  </div>
                </div>
              )}

              {/* Tab 8: Treatment Plan */}
              {activeTab === 'treatment' && (
                <div className="space-y-4">
                  <div className="p-3 bg-[#f4f4f4] border border-[#e0e0e0] space-y-3">
                    <div className="text-xs font-semibold text-[#161616]">
                      Formulate Ayurvedic Treatment Plan (Chikitsa Sutra)
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] text-[#525252] mb-1">Plan Title *</label>
                        <input
                          type="text"
                          value={treatmentPlanTitle}
                          onChange={(e) => setTreatmentPlanTitle(e.target.value)}
                          className="w-full bg-white border border-[#c6c6c6] h-8 px-2 text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-[#525252] mb-1">Course Duration (Days)</label>
                        <input
                          type="number"
                          value={treatmentPlanDuration}
                          onChange={(e) => setTreatmentPlanDuration(Number(e.target.value))}
                          className="w-full bg-white border border-[#c6c6c6] h-8 px-2 text-xs font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-[#525252] mb-1">Pathya Ahara (Dietary Guidelines)</label>
                        <textarea
                          rows={2}
                          value={dietaryGuidelines}
                          onChange={(e) => setDietaryGuidelines(e.target.value)}
                          className="w-full bg-white border border-[#c6c6c6] p-2 text-xs resize-none"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-[#525252] mb-1">Vihara (Lifestyle Modifications)</label>
                        <textarea
                          rows={2}
                          value={lifestyleGuidelines}
                          onChange={(e) => setLifestyleGuidelines(e.target.value)}
                          className="w-full bg-white border border-[#c6c6c6] p-2 text-xs resize-none"
                        />
                      </div>
                    </div>
                    <div className="flex justify-end">
                      <CarbonButton
                        kind="primary"
                        size="sm"
                        onClick={handleSaveTreatmentPlan}
                        disabled={isSubmittingAction || !treatmentPlanTitle.trim()}
                      >
                        Create Treatment Plan
                      </CarbonButton>
                    </div>
                  </div>
                </div>
              )}

              {/* Tab 9: Panchakarma Referral */}
              {activeTab === 'panchakarma' && (
                <div className="space-y-4">
                  <div className="p-3 bg-[#f4f4f4] border border-[#e0e0e0] space-y-3">
                    <div className="text-xs font-semibold text-[#161616]">
                      Initiate Classical Panchakarma Therapy Referral
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] text-[#525252] mb-1">Proposed Therapy *</label>
                        <select
                          value={panchakarmaTherapy}
                          onChange={(e) => setPanchakarmaTherapy(e.target.value)}
                          className="w-full bg-white border border-[#c6c6c6] h-8 px-2 text-xs"
                        >
                          <option value="Janu Basti (Medicated Oil Retention - Knees)">Janu Basti (Knees)</option>
                          <option value="Kati Basti (Lumbosacral Oil Retention)">Kati Basti (Spine)</option>
                          <option value="Greeva Basti (Cervical Spine Retention)">Greeva Basti (Neck)</option>
                          <option value="Shirodhara (Continuous Medicated Stream)">Shirodhara</option>
                          <option value="Abhyanga & Swedana (Full Body Snehana)">Abhyanga & Swedana</option>
                          <option value="Matra Basti (Daily Enema Course)">Matra Basti Course</option>
                          <option value="Nasya Karma (Medicated Nasal Instillation)">Nasya Karma</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[11px] text-[#525252] mb-1">Pre-treatment Precautions</label>
                        <input
                          type="text"
                          value={panchakarmaPrecautions}
                          onChange={(e) => setPanchakarmaPrecautions(e.target.value)}
                          className="w-full bg-white border border-[#c6c6c6] h-8 px-2 text-xs"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="block text-[11px] text-[#525252] mb-1">Observations & Clinical Indication</label>
                        <textarea
                          rows={2}
                          value={panchakarmaObservations}
                          onChange={(e) => setPanchakarmaObservations(e.target.value)}
                          className="w-full bg-white border border-[#c6c6c6] p-2 text-xs resize-none"
                        />
                      </div>
                    </div>
                    <div className="flex justify-end">
                      <CarbonButton
                        kind="primary"
                        size="sm"
                        onClick={handleSavePanchakarmaReferral}
                        disabled={isSubmittingAction}
                      >
                        Issue Panchakarma Referral
                      </CarbonButton>
                    </div>
                  </div>
                </div>
              )}

              {/* Tab 10: Clinical History Dossier */}
              {activeTab === 'history' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-semibold text-[#161616]">
                      Aggregated Clinical History for {selectedQueueItem?.patientName} ({selectedQueueItem?.patientMrn})
                    </h3>
                    <CarbonButton
                      kind="ghost"
                      size="sm"
                      renderIcon={FileText}
                      onClick={() => {
                        const p = patients.find((pat) => pat.id === selectedQueueItem?.patientId || pat.mrn === selectedQueueItem?.patientMrn);
                        if (p) setDossierPatient(p);
                      }}
                    >
                      Open Full Dossier
                    </CarbonButton>
                  </div>

                  {isLoadingHistory ? (
                    <div className="py-8 text-center text-xs text-[#525252]">
                      Loading clinical history from PostgreSQL...
                    </div>
                  ) : !clinicalHistory ? (
                    <div className="py-8 text-center text-xs text-[#525252]">
                      No historical clinical records found for this patient.
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {/* Vitals History */}
                      <div className="p-3 bg-[#f4f4f4] border border-[#e0e0e0] space-y-2">
                        <div className="text-xs font-semibold text-[#161616] flex items-center gap-1">
                          <Activity className="w-3.5 h-3.5 text-[#0f62fe]" />
                          <span>Recorded Vitals ({clinicalHistory.vitals.length})</span>
                        </div>
                        {clinicalHistory.vitals.length > 0 ? (
                          <div className="space-y-1">
                            {clinicalHistory.vitals.map((v) => (
                              <div key={v.id} className="p-2 bg-white border border-[#e0e0e0] text-xs font-mono flex items-center justify-between">
                                <span>BP: {v.bpSystolic}/{v.bpDiastolic} • HR: {v.heartRate} • SpO2: {v.spO2}% • Temp: {v.temperature}°C</span>
                                <span className="font-bold text-[#0f62fe]">BMI: {v.bmi ?? 'N/A'}</span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-xs text-[#525252]">No vitals on file.</div>
                        )}
                      </div>

                      {/* Diagnoses History */}
                      <div className="p-3 bg-[#f4f4f4] border border-[#e0e0e0] space-y-2">
                        <div className="text-xs font-semibold text-[#161616] flex items-center gap-1">
                          <BookOpen className="w-3.5 h-3.5 text-[#198038]" />
                          <span>Documented Diagnoses ({clinicalHistory.diagnoses.length})</span>
                        </div>
                        {clinicalHistory.diagnoses.length > 0 ? (
                          <div className="space-y-1">
                            {clinicalHistory.diagnoses.map((d) => (
                              <div key={d.id} className="p-2 bg-white border border-[#e0e0e0] text-xs flex items-center justify-between">
                                <span className="font-semibold">{d.diagnosisName} {d.icdCode && `(${d.icdCode})`}</span>
                                <CarbonTag type="warm-gray" size="sm">{d.diagnosisType}</CarbonTag>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-xs text-[#525252]">No diagnoses on file.</div>
                        )}
                      </div>

                      {/* Previous Encounters */}
                      <div className="p-3 bg-[#f4f4f4] border border-[#e0e0e0] space-y-2">
                        <div className="text-xs font-semibold text-[#161616] flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5 text-[#525252]" />
                          <span>Clinical Encounters ({clinicalHistory.encounters.length})</span>
                        </div>
                        {clinicalHistory.encounters.length > 0 ? (
                          <div className="space-y-1">
                            {clinicalHistory.encounters.map((e) => (
                              <div key={e.id} className="p-2 bg-white border border-[#e0e0e0] text-xs flex items-center justify-between">
                                <span className="font-mono font-semibold">{e.encounterNumber} ({e.discipline})</span>
                                <div className="flex items-center gap-2">
                                  <span className="text-[11px] text-[#525252]">{new Date(e.startedAt).toLocaleDateString()}</span>
                                  <CarbonTag type={e.status === 'completed' ? 'green' : 'blue'} size="sm">
                                    {e.status}
                                  </CarbonTag>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-xs text-[#525252]">No past encounters on file.</div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Escalation Resolve Modal */}
      {escalationToResolve && (
        <CarbonModal
          isOpen={Boolean(escalationToResolve)}
          onClose={() => setEscalationToResolve(null)}
          title="Resolve Emergency Escalation"
          label="Clinical Triage De-escalation"
          primaryButtonText={isResolvingEscalation ? 'Resolving...' : 'Resolve Escalation'}
          secondaryButtonText="Cancel"
          onRequestSubmit={handleResolveEscalationSubmit}
          primaryButtonDisabled={isResolvingEscalation || !resolutionNotes.trim()}
          size="md"
        >
          <div className="space-y-3">
            <div className="p-3 bg-[#edf5ff] border-l-4 border-l-[#0f62fe] border border-[#a6c8ff] text-xs text-[#0043ce]">
              <strong>Patient:</strong> {escalationToResolve.patientName} (MRN: {escalationToResolve.patientMrn})
              <br />
              <strong>Escalation Reason:</strong> {escalationToResolve.escalationReason || 'Emergency Priority'}
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#161616] mb-1">
                Clinical Resolution Notes *
              </label>
              <textarea
                rows={3}
                placeholder="Document clinical assessment, stabilization, or resolution rationale..."
                value={resolutionNotes}
                onChange={(e) => setResolutionNotes(e.target.value)}
                className="w-full bg-[#f4f4f4] border border-[#c6c6c6] p-2 text-xs resize-none"
              />
            </div>
          </div>
        </CarbonModal>
      )}

      {/* Result Entry Modal */}
      {resultEntryOrderId && (
        <CarbonModal
          isOpen={Boolean(resultEntryOrderId)}
          onClose={() => setResultEntryOrderId(null)}
          title="Record Diagnostic Laboratory Results"
          label="Laboratory Findings Entry"
          primaryButtonText="Save Results"
          secondaryButtonText="Cancel"
          onRequestSubmit={handleRecordResultSubmit}
          primaryButtonDisabled={!resultValue.trim()}
          size="md"
        >
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-[#161616] mb-1">Quantitative / Qualitative Result *</label>
              <input
                type="text"
                placeholder="e.g. 14.2 g/dL or Negative"
                value={resultValue}
                onChange={(e) => setResultValue(e.target.value)}
                className="w-full bg-[#f4f4f4] border border-[#c6c6c6] h-8 px-2 text-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#161616] mb-1">Reference / Normal Range</label>
              <input
                type="text"
                placeholder="e.g. 13.5 - 17.5 g/dL"
                value={normalRange}
                onChange={(e) => setNormalRange(e.target.value)}
                className="w-full bg-[#f4f4f4] border border-[#c6c6c6] h-8 px-2 text-xs"
              />
            </div>
            <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer">
              <input
                type="checkbox"
                checked={isAbnormal}
                onChange={(e) => setIsAbnormal(e.target.checked)}
                className="h-4 w-4"
              />
              <span className="text-[#da1e28]">Flag as Clinically Abnormal Finding</span>
            </label>
          </div>
        </CarbonModal>
      )}

      {/* Review Investigation Modal */}
      {reviewOrderId && (
        <CarbonModal
          isOpen={Boolean(reviewOrderId)}
          onClose={() => setReviewOrderId(null)}
          title="Physician Investigation Review & Authorization"
          label="Authoritative Clinical Review"
          primaryButtonText="Authorize Finding"
          secondaryButtonText="Cancel"
          onRequestSubmit={handleReviewInvestigationSubmit}
          size="md"
        >
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-[#161616] mb-1">Review Notes & Clinical Interpretation</label>
              <textarea
                rows={3}
                placeholder="Enter clinical impression and correlation with patient symptoms..."
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
                className="w-full bg-[#f4f4f4] border border-[#c6c6c6] p-2 text-xs resize-none"
              />
            </div>
          </div>
        </CarbonModal>
      )}

      {/* Full Patient Dossier Modal */}
      {dossierPatient && (
        <PatientDossierModal
          isOpen={Boolean(dossierPatient)}
          onClose={() => setDossierPatient(null)}
          patient={dossierPatient}
          currentUserRole={currentUser.role}
          currentUserName={currentUser.name}
        />
      )}
    </div>
  );
};
