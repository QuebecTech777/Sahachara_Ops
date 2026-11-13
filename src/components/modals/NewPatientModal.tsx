import React, { useState, useEffect } from 'react';
import { CarbonModal } from '../carbon/CarbonModal';
import {
  Patient,
  DuplicatePatientMatch,
  AllergyStatus,
  MedicalHistoryStatus,
  CommunicationPreference,
  UserRole
} from '../../types/hospital';
import { hospitalApiClient } from '../../services/hospitalApi';
import { AlertTriangle } from 'lucide-react';

interface NewPatientModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (patient: Partial<Patient> & { overrideDuplicate?: boolean }) => Promise<void> | void;
  currentUserRole?: UserRole;
}

export const NewPatientModal: React.FC<NewPatientModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  currentUserRole
}) => {
  const isClinician = !currentUserRole || currentUserRole === 'DOCTOR' || currentUserRole === 'VAIDYA';

  // Basic Demographics
  const [firstName, setFirstName] = useState('');
  const [middleName, setMiddleName] = useState('');
  const [lastName, setLastName] = useState('');
  const [dob, setDob] = useState('1985-05-15');
  const [age, setAge] = useState<number | ''>(41);
  const [gender, setGender] = useState<'Male' | 'Female' | 'Other' | 'Undisclosed'>('Male');
  const [bloodGroup, setBloodGroup] = useState<string>('O+');
  const [preferredLanguage, setPreferredLanguage] = useState('Malayalam');

  // Contact Information
  const [phone, setPhone] = useState('+91 ');
  const [secondaryPhone, setSecondaryPhone] = useState('');
  const [email, setEmail] = useState('');
  const [communicationPreference, setCommunicationPreference] = useState<CommunicationPreference>('sms');

  // Address
  const [addressLine1, setAddressLine1] = useState('');
  const [addressLine2, setAddressLine2] = useState('');
  const [city, setCity] = useState('');
  const [district, setDistrict] = useState('');
  const [state, setState] = useState('');
  const [postalCode, setPostalCode] = useState('');

  // Emergency Contact
  const [emergencyName, setEmergencyName] = useState('');
  const [emergencyRelation, setEmergencyRelation] = useState('');
  const [emergencyPhone, setEmergencyPhone] = useState('');

  // Clinical Focus & Attending Vaidya
  const [departmentFocus, setDepartmentFocus] = useState('Kayachikitsa (Internal Medicine & Chronic Care)');
  const [assignedDoctorName, setAssignedDoctorName] = useState('Dr. Sarah Chen, BAMS, MD (Ayurveda)');

  // Medical Background & Allergies
  const [allergyStatus, setAllergyStatus] = useState<AllergyStatus>('not_recorded');
  const [allergiesText, setAllergiesText] = useState('');
  const [medicalHistoryStatus, setMedicalHistoryStatus] = useState<MedicalHistoryStatus>('not_recorded');
  const [chronicConditionsText, setChronicConditionsText] = useState('Sandhigata Vata (Joint Stiffness)');
  const [currentMedicationsText, setCurrentMedicationsText] = useState('');
  const [clinicalNotes, setClinicalNotes] = useState('Patient registered for classical Ayurvedic consultation and therapy assessment.');

  // Duplicate Detection & Submission State
  const [duplicateMatches, setDuplicateMatches] = useState<DuplicatePatientMatch[]>([]);
  const [overrideDuplicate, setOverrideDuplicate] = useState(false);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Auto-calculate age from DOB
  useEffect(() => {
    if (dob) {
      const birthDate = new Date(dob);
      if (!isNaN(birthDate.getTime())) {
        const today = new Date();
        let calculatedAge = today.getFullYear() - birthDate.getFullYear();
        const m = today.getMonth() - birthDate.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
          calculatedAge--;
        }
        setAge(Math.max(0, calculatedAge));
      }
    }
  }, [dob]);

  // Reset form on open
  useEffect(() => {
    if (isOpen) {
      setFirstName('');
      setMiddleName('');
      setLastName('');
      setDob('1985-05-15');
      setAge(41);
      setGender('Male');
      setBloodGroup('O+');
      setPreferredLanguage('Malayalam');
      setPhone('+91 ');
      setSecondaryPhone('');
      setEmail('');
      setCommunicationPreference('sms');
      setAddressLine1('');
      setAddressLine2('');
      setCity('');
      setDistrict('');
      setState('');
      setPostalCode('');
      setEmergencyName('');
      setEmergencyRelation('');
      setEmergencyPhone('');
      setDepartmentFocus('Kayachikitsa (Internal Medicine & Chronic Care)');
      setAssignedDoctorName('Dr. Sarah Chen, BAMS, MD (Ayurveda)');
      setAllergyStatus('not_recorded');
      setAllergiesText('');
      setMedicalHistoryStatus('not_recorded');
      setChronicConditionsText('Sandhigata Vata (Joint Stiffness)');
      setCurrentMedicationsText('');
      setClinicalNotes('Patient registered for classical Ayurvedic consultation and therapy assessment.');
      setDuplicateMatches([]);
      setOverrideDuplicate(false);
      setSubmissionError(null);
      setIsSubmitting(false);
    }
  }, [isOpen]);

  const checkDuplicatesOnBlur = async () => {
    const rawDigits = phone.replace(/\D/g, '');
    if (rawDigits.length >= 10 && firstName.trim() && lastName.trim()) {
      try {
        const res = await hospitalApiClient.checkDuplicatePatients({
          phone: phone.trim(),
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          dob: dob || undefined,
          email: email.trim() || undefined
        });
        setDuplicateMatches(res.matches || []);
      } catch (err) {
        // Soft fail
      }
    }
  };

  const handleSubmit = async () => {
    if (!firstName.trim() || !lastName.trim()) {
      setSubmissionError('First Name and Last Name are required.');
      return;
    }

    if (!phone.trim() || phone.trim() === '+91' || phone.trim() === '+91 ') {
      setSubmissionError('A valid primary contact phone number is required.');
      return;
    }

    // Run duplicate check if matches not yet reviewed or not overridden
    if (duplicateMatches.length > 0 && !overrideDuplicate) {
      setSubmissionError('Duplicate records detected. Check the authorization box to override and proceed.');
      return;
    }

    setIsSubmitting(true);
    setSubmissionError(null);

    const allergies = allergiesText
      .split(',')
      .map((s) => s.trim())
      .filter((s) => Boolean(s) && s.toLowerCase() !== 'none');

    const chronicConditions = chronicConditionsText
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    const currentMedications = currentMedicationsText
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    const combinedAddress = [addressLine1.trim(), addressLine2.trim(), city.trim(), district.trim(), state.trim()]
      .filter(Boolean)
      .join(', ');

    const newPatient: Partial<Patient> & { overrideDuplicate?: boolean } = {
      firstName: firstName.trim(),
      middleName: middleName.trim() || undefined,
      lastName: lastName.trim(),
      dob: dob || undefined,
      age: age !== '' ? Number(age) : undefined,
      gender,
      bloodGroup: bloodGroup || undefined,
      preferredLanguage: preferredLanguage || undefined,
      phone: phone.trim(),
      secondaryPhone: secondaryPhone.trim() || undefined,
      email: email.trim() || undefined,
      communicationPreference,
      address: combinedAddress || undefined,
      addressLine1: addressLine1.trim() || undefined,
      addressLine2: addressLine2.trim() || undefined,
      city: city.trim() || undefined,
      district: district.trim() || undefined,
      state: state.trim() || undefined,
      postalCode: postalCode.trim() || undefined,
      emergencyContact: emergencyName.trim() ? {
        name: emergencyName.trim(),
        relationship: emergencyRelation.trim() || 'Contact',
        phone: emergencyPhone.trim() || '',
        altPhone: undefined
      } : undefined,
      emergencyContactName: emergencyName.trim() || undefined,
      emergencyContactRelation: emergencyRelation.trim() || undefined,
      emergencyContactPhone: emergencyPhone.trim() || undefined,
      assignedDoctorName: assignedDoctorName.trim() || undefined,
      admissionStatus: 'outpatient',
      isRegistered: true,
      overrideDuplicate
    };

    // Only submit clinical fields if authorized clinician
    if (isClinician) {
      if (allergies.length > 0) {
        newPatient.allergies = allergies;
        newPatient.allergyStatus = allergyStatus === 'not_recorded' ? 'known_allergies' : allergyStatus;
      }
      if (chronicConditions.length > 0) {
        newPatient.chronicConditions = chronicConditions;
        newPatient.medicalHistoryStatus = medicalHistoryStatus === 'not_recorded' ? 'documented' : medicalHistoryStatus;
      }
      if (currentMedications.length > 0) {
        newPatient.currentMedications = currentMedications;
      }
      if (clinicalNotes.trim()) {
        newPatient.clinicalNotes = `${departmentFocus} - ${clinicalNotes.trim()}`;
      }
    }

    try {
      await onSubmit(newPatient);
      onClose();
    } catch (err: any) {
      if (err.code === 'DUPLICATE_PATIENT_DETECTED' || err.status === 409) {
        setDuplicateMatches(err.duplicates || [{
          id: 'dup-1',
          mrn: 'Existing Record',
          name: `${firstName} ${lastName}`.trim(),
          phone: phone.trim(),
          matchReasons: ['Duplicate phone or name match found in master patient registry.']
        }]);
        setSubmissionError('Duplicate records detected. Check the authorization box below to proceed with registration.');
      } else {
        setSubmissionError(err.message || 'Failed to register patient record.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <CarbonModal
      isOpen={isOpen}
      onClose={onClose}
      title="Register New Patient"
      label="Sahachara Ayurveda Clinic & Consultation Registration"
      primaryButtonText={isSubmitting ? 'Registering...' : 'Register Patient'}
      secondaryButtonText="Discard"
      onRequestSubmit={handleSubmit}
      primaryButtonDisabled={!firstName.trim() || !lastName.trim() || isSubmitting}
      size="lg"
    >
      <div className="space-y-4 max-h-[75vh] overflow-y-auto pr-1">
        {/* Patient Registration Context Banner */}
        <div className="p-3 bg-[#edf5ff] border-l-4 border-l-[#0f62fe] border border-[#a6c8ff] text-xs text-[#0043ce] flex items-center justify-between">
          <div>
            <strong>Sahachara Ayurveda Registration:</strong> Registers a patient into the clinic directory for Ayurvedic consultations (Rogi Pareeksha), Panchakarma therapy scheduling, and classical herbal prescriptions.
          </div>
          <span className="font-mono text-[10px] text-[#0f62fe] font-semibold uppercase px-2 py-0.5 bg-white border border-[#a6c8ff] shrink-0 ml-2">
            New Dossier
          </span>
        </div>

        {/* Submission Error Banner */}
        {submissionError && (
          <div className="p-3 bg-[#fff1f1] border-l-4 border-l-[#da1e28] border border-[#ffd7d9] text-xs text-[#da1e28] flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <div>{submissionError}</div>
          </div>
        )}

        {/* Duplicate Warning & Override Box */}
        {duplicateMatches.length > 0 && (
          <div className="p-3 bg-[#fff8e1] border-l-4 border-l-[#f1c21b] border border-[#fddc69] space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-[#8a6d00]">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>Potential Duplicate Patient Records Detected ({duplicateMatches.length})</span>
            </div>
            <div className="space-y-1.5 max-h-36 overflow-y-auto">
              {duplicateMatches.map((d, idx) => (
                <div key={idx} className="bg-white p-2 border border-[#fddc69] text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                  <div>
                    <span className="font-semibold text-[#161616]">{d.name}</span>
                    <span className="font-mono text-[#525252] ml-2 text-[11px]">MRN: {d.mrn}</span>
                  </div>
                  <div className="text-[11px] text-[#525252]">
                    <span>{d.phone || 'No Phone'}</span>
                    <span className="mx-1">•</span>
                    <span className="text-[#da1e28] font-medium">{d.matchReasons?.join(', ') || 'Duplicate match'}</span>
                  </div>
                </div>
              ))}
            </div>
            <label className="flex items-center gap-2 text-xs font-semibold text-[#161616] cursor-pointer pt-1">
              <input
                type="checkbox"
                checked={overrideDuplicate}
                onChange={(e) => setOverrideDuplicate(e.target.checked)}
                className="h-4 w-4 rounded border-[#8d8d8d] text-[#0f62fe] focus:ring-0"
              />
              <span>Authorize Registration: Confirm this is a distinct patient and proceed with duplicate override</span>
            </label>
          </div>
        )}

        {/* Name Fields */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-semibold text-[#161616] mb-1">
              First Name *
            </label>
            <input
              type="text"
              required
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="e.g. Rajesh"
              className="w-full carbon-input"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#161616] mb-1">
              Middle Name
            </label>
            <input
              type="text"
              value={middleName}
              onChange={(e) => setMiddleName(e.target.value)}
              placeholder="e.g. Kumar"
              className="w-full carbon-input"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#161616] mb-1">
              Last Name *
            </label>
            <input
              type="text"
              required
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              placeholder="e.g. Varma"
              className="w-full carbon-input"
            />
          </div>
        </div>

        {/* Demographics */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <div className="col-span-2 sm:col-span-1">
            <label className="block text-xs font-semibold text-[#161616] mb-1">
              Date of Birth
            </label>
            <input
              type="date"
              value={dob}
              onChange={(e) => setDob(e.target.value)}
              className="w-full carbon-input font-mono"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#161616] mb-1">
              Age
            </label>
            <input
              type="number"
              min="0"
              max="130"
              value={age}
              onChange={(e) => setAge(e.target.value === '' ? '' : Number(e.target.value))}
              placeholder="Years"
              className="w-full carbon-input font-mono"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#161616] mb-1">
              Gender
            </label>
            <select
              value={gender}
              onChange={(e) => setGender(e.target.value as any)}
              className="w-full carbon-input"
            >
              <option value="Male">Male</option>
              <option value="Female">Female</option>
              <option value="Other">Other</option>
              <option value="Undisclosed">Undisclosed</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#161616] mb-1">
              Blood Group
            </label>
            <select
              value={bloodGroup}
              onChange={(e) => setBloodGroup(e.target.value)}
              className="w-full carbon-input font-mono"
            >
              <option value="">Select</option>
              <option value="A+">A+</option>
              <option value="A-">A-</option>
              <option value="B+">B+</option>
              <option value="B-">B-</option>
              <option value="AB+">AB+</option>
              <option value="AB-">AB-</option>
              <option value="O+">O+</option>
              <option value="O-">O-</option>
              <option value="Unknown">Unknown</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#161616] mb-1">
              Language
            </label>
            <select
              value={preferredLanguage}
              onChange={(e) => setPreferredLanguage(e.target.value)}
              className="w-full carbon-input"
            >
              <option value="Malayalam">Malayalam</option>
              <option value="English">English</option>
              <option value="Hindi">Hindi</option>
              <option value="Tamil">Tamil</option>
              <option value="Kannada">Kannada</option>
              <option value="Telugu">Telugu</option>
              <option value="Other">Other</option>
            </select>
          </div>
        </div>

        {/* Contact info: Phone (+91), Secondary Phone, Email, Comm Preference */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs font-semibold text-[#161616] mb-1">
              Telephone (India +91) *
            </label>
            <input
              type="text"
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              onBlur={checkDuplicatesOnBlur}
              placeholder="+91 98470 XXXXX"
              className="w-full carbon-input font-mono"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#161616] mb-1">
              Secondary Phone
            </label>
            <input
              type="text"
              value={secondaryPhone}
              onChange={(e) => setSecondaryPhone(e.target.value)}
              placeholder="+91 98470 YYYYY"
              className="w-full carbon-input font-mono"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#161616] mb-1">
              Email Address
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="patient@example.com"
              className="w-full carbon-input"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#161616] mb-1">
              Comm Preference
            </label>
            <select
              value={communicationPreference}
              onChange={(e) => setCommunicationPreference(e.target.value as any)}
              className="w-full carbon-input"
            >
              <option value="sms">SMS</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="phone">Phone Call</option>
              <option value="email">Email</option>
              <option value="none">None</option>
            </select>
          </div>
        </div>

        {/* Residential Address */}
        <div className="space-y-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-[#161616] mb-1">
                Address Line 1
              </label>
              <input
                type="text"
                value={addressLine1}
                onChange={(e) => setAddressLine1(e.target.value)}
                placeholder="e.g. 42 Temple Road"
                className="w-full carbon-input"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#161616] mb-1">
                Address Line 2 / Locality
              </label>
              <input
                type="text"
                value={addressLine2}
                onChange={(e) => setAddressLine2(e.target.value)}
                placeholder="e.g. Near Ganapathy Temple, Kadavanthra"
                className="w-full carbon-input"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-semibold text-[#161616] mb-1">
                City / Town
              </label>
              <input
                type="text"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="e.g. Kochi"
                className="w-full carbon-input"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#161616] mb-1">
                District
              </label>
              <input
                type="text"
                value={district}
                onChange={(e) => setDistrict(e.target.value)}
                placeholder="e.g. Ernakulam"
                className="w-full carbon-input"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#161616] mb-1">
                State
              </label>
              <input
                type="text"
                value={state}
                onChange={(e) => setState(e.target.value)}
                placeholder="e.g. Kerala"
                className="w-full carbon-input"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#161616] mb-1">
                PIN / Postal Code
              </label>
              <input
                type="text"
                value={postalCode}
                onChange={(e) => setPostalCode(e.target.value)}
                placeholder="e.g. 682020"
                className="w-full carbon-input font-mono"
              />
            </div>
          </div>
        </div>

        {/* Emergency Contact */}
        <div className="p-3 bg-[#f4f4f4] border border-[#e0e0e0] space-y-2">
          <div className="text-xs font-semibold text-[#161616]">
            Emergency Contact Information
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-[11px] text-[#525252] mb-1">Contact Name</label>
              <input
                type="text"
                value={emergencyName}
                onChange={(e) => setEmergencyName(e.target.value)}
                placeholder="e.g. Anjali Menon"
                className="w-full bg-white border border-[#c6c6c6] h-8 px-2 text-xs"
              />
            </div>
            <div>
              <label className="block text-[11px] text-[#525252] mb-1">Relationship</label>
              <input
                type="text"
                value={emergencyRelation}
                onChange={(e) => setEmergencyRelation(e.target.value)}
                placeholder="e.g. Spouse / Sister"
                className="w-full bg-white border border-[#c6c6c6] h-8 px-2 text-xs"
              />
            </div>
            <div>
              <label className="block text-[11px] text-[#525252] mb-1">Emergency Phone</label>
              <input
                type="text"
                value={emergencyPhone}
                onChange={(e) => setEmergencyPhone(e.target.value)}
                placeholder="+91 98470 ZZZZZ"
                className="w-full bg-white border border-[#c6c6c6] h-8 px-2 text-xs font-mono"
              />
            </div>
          </div>
        </div>

        {/* Clinical Focus & Attending Vaidya */}
        <div className="p-3 bg-[#f4f4f4] border border-[#e0e0e0] space-y-3">
          <div className="text-xs font-semibold text-[#161616]">
            Clinical Department & Attending Vaidya
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] text-[#525252] mb-1">
                Clinical Focus Department
              </label>
              <select
                value={departmentFocus}
                onChange={(e) => setDepartmentFocus(e.target.value)}
                className="w-full bg-white border border-[#c6c6c6] h-8 px-2 text-xs"
              >
                <option value="Kayachikitsa (Internal Medicine & Chronic Care)">Kayachikitsa (Internal Medicine & Chronic Care)</option>
                <option value="Panchakarma Therapy & Shodhana Chikitsa">Panchakarma Therapy & Shodhana Chikitsa</option>
                <option value="Shalya Tantra (Marma, Joint & Spine Disorders)">Shalya Tantra (Marma, Joint & Spine Disorders)</option>
                <option value="Shalakya Tantra (ENT, Eye & Head Disorders)">Shalakya Tantra (ENT, Eye & Head Disorders)</option>
                <option value="Prasuti & Stri Roga (Women's Health & Fertility)">Prasuti & Stri Roga (Women's Health & Fertility)</option>
                <option value="Rasayana & Swasthavritta (Preventive & Rejuvenation)">Rasayana & Swasthavritta (Preventive & Rejuvenation)</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] text-[#525252] mb-1">
                Attending Vaidya / Physician
              </label>
              <select
                value={assignedDoctorName}
                onChange={(e) => setAssignedDoctorName(e.target.value)}
                className="w-full bg-white border border-[#c6c6c6] h-8 px-2 text-xs"
              >
                <option value="Dr. Sarah Chen, BAMS, MD (Ayurveda)">Dr. Sarah Chen, BAMS, MD (Ayurveda)</option>
                <option value="Dr. Rajesh Varma, BAMS (Panchakarma Senior Vaidya)">Dr. Rajesh Varma, BAMS (Panchakarma Senior Vaidya)</option>
                <option value="Dr. Priya Radhakrishnan, BAMS (Swasthavritta & Stri Roga)">Dr. Priya Radhakrishnan, BAMS (Swasthavritta & Stri Roga)</option>
                <option value="Dr. Anand Kumar, BAMS (Marma Chikitsa & Shalya)">Dr. Anand Kumar, BAMS (Marma Chikitsa & Shalya)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Clinical History & Allergies */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-semibold text-[#161616] mb-1">
              Allergy Status
            </label>
            <select
              value={allergyStatus}
              onChange={(e) => setAllergyStatus(e.target.value as any)}
              className="w-full carbon-input"
            >
              <option value="not_recorded">Not Recorded</option>
              <option value="none_confirmed">None Confirmed</option>
              <option value="known_allergies">Known Allergies</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold text-[#161616] mb-1">
              Known Sensitivities / Allergies (comma-separated)
            </label>
            <input
              type="text"
              value={allergiesText}
              onChange={(e) => setAllergiesText(e.target.value)}
              placeholder="e.g. Mustard seed, Honey, Penicillin"
              className="w-full carbon-input"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-[#161616] mb-1">
              Pre-existing Chronic Conditions
            </label>
            <input
              type="text"
              value={chronicConditionsText}
              onChange={(e) => setChronicConditionsText(e.target.value)}
              placeholder="e.g. Sandhigata Vata, Amavata, Prameha (Diabetes)"
              className="w-full carbon-input"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#161616] mb-1">
              Current Ongoing Medications
            </label>
            <input
              type="text"
              value={currentMedicationsText}
              onChange={(e) => setCurrentMedicationsText(e.target.value)}
              placeholder="e.g. Dhanwantharam Kwatham, Sahacharadi Thailam"
              className="w-full carbon-input"
            />
          </div>
        </div>

        {/* Clinical Notes */}
        <div>
          <label className="block text-xs font-semibold text-[#161616] mb-1">
            Clinical Consultation & Intake Notes
          </label>
          <textarea
            rows={2}
            value={clinicalNotes}
            onChange={(e) => setClinicalNotes(e.target.value)}
            className="w-full carbon-input resize-none"
          />
        </div>
      </div>
    </CarbonModal>
  );
};
