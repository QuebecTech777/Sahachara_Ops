import { createClient, SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';

let serverClient: SupabaseClient | null = null;

export const isSupabaseServerActive = (): boolean => {
  return Boolean(
    SUPABASE_URL &&
    SUPABASE_KEY &&
    SUPABASE_URL.startsWith('http') &&
    !SUPABASE_URL.includes('placeholder')
  );
};

export const getSupabaseServerClient = (): SupabaseClient | null => {
  if (!isSupabaseServerActive()) return null;
  if (!serverClient) {
    serverClient = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    });
  }
  return serverClient;
};

/**
 * Verify a Supabase JWT Token from the Authorization header
 */
export async function verifySupabaseToken(token: string): Promise<{ valid: boolean; user?: any; error?: string }> {
  const client = getSupabaseServerClient();
  if (!client) {
    // If Supabase is not configured on backend, pass through gracefully
    return { valid: true };
  }

  try {
    const { data: { user }, error } = await client.auth.getUser(token);
    if (error || !user) {
      return { valid: false, error: error?.message || 'Invalid authorization token' };
    }
    return { valid: true, user };
  } catch (err: any) {
    return { valid: false, error: err?.message || 'Token verification error' };
  }
}

/**
 * Persist or upsert patient dossier into Supabase PostgreSQL
 */
export async function persistPatientToSupabase(patient: any): Promise<boolean> {
  const client = getSupabaseServerClient();
  if (!client) return false;

  try {
    const row = {
      id: patient.id,
      mrn: patient.mrn,
      first_name: patient.firstName,
      last_name: patient.lastName,
      dob: patient.dob,
      age: patient.age,
      gender: patient.gender,
      blood_group: patient.bloodGroup,
      phone: patient.phone,
      email: patient.email,
      address: patient.address,
      emergency_contact: patient.emergencyContact,
      allergies: patient.allergies,
      chronic_conditions: patient.chronicConditions,
      current_medications: patient.currentMedications,
      admission_status: patient.admissionStatus,
      dosha_vata: patient.doshaProfile?.vata || 40,
      dosha_pitta: patient.doshaProfile?.pitta || 35,
      dosha_kapha: patient.doshaProfile?.kapha || 25,
      prakriti: patient.doshaProfile?.prakriti || 'Vata-Pitta',
      vikriti: patient.doshaProfile?.vikriti || 'Pitta Imbalance',
      agni_status: patient.doshaProfile?.agni || 'Vishama',
      ama_status: patient.doshaProfile?.ama || 'Madhyama',
      clinical_notes: patient.clinicalNotes,
      updated_at: new Date().toISOString()
    };

    const { error } = await client
      .from('patients')
      .upsert(row, { onConflict: 'mrn' });

    if (error) {
      console.warn('[Supabase Sync] Failed to upsert patient:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('[Supabase Sync] Error during patient persistence:', err);
    return false;
  }
}

/**
 * Persist Consultation to Supabase PostgreSQL
 */
export async function persistConsultationToSupabase(consultation: any): Promise<boolean> {
  const client = getSupabaseServerClient();
  if (!client) return false;

  try {
    const row = {
      id: consultation.id,
      consultation_number: consultation.consultationNumber,
      patient_id: consultation.patientId,
      patient_mrn: consultation.patientMrn,
      patient_name: consultation.patientName,
      doctor_id: consultation.doctorId,
      doctor_name: consultation.doctorName,
      chief_complaint: consultation.chiefComplaint,
      classical_diagnosis: consultation.classicalDiagnosis,
      ayurvedic_assessment: consultation.ayurvedicAssessment,
      recommended_therapies: consultation.recommendedTherapies,
      prescriptions: consultation.prescriptions,
      clinical_notes: consultation.clinicalNotes,
      status: consultation.status,
      created_at: consultation.dateTime || new Date().toISOString()
    };

    const { error } = await client.from('consultations').upsert(row, { onConflict: 'consultation_number' });
    if (error) {
      console.warn('[Supabase Sync] Failed to upsert consultation:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    return false;
  }
}

/**
 * Persist Audit Log to Supabase PostgreSQL
 */
export async function persistAuditLogToSupabase(auditLog: any): Promise<boolean> {
  const client = getSupabaseServerClient();
  if (!client) return false;

  try {
    const row = {
      id: auditLog.id,
      timestamp: auditLog.timestamp || new Date().toISOString(),
      actor: auditLog.actor,
      role: auditLog.role,
      action: auditLog.action,
      category: auditLog.category,
      details: auditLog.details,
      patient_mrn: auditLog.patientMrn || null
    };

    const { error } = await client.from('audit_logs').insert(row);
    if (error) {
      console.warn('[Supabase Sync] Failed to record audit log:', error.message);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}
