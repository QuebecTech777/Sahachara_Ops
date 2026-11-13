import React, { useState, useEffect } from 'react';
import { CarbonModal } from '../carbon/CarbonModal';
import { CarbonButton } from '../carbon/CarbonButton';
import { Patient, UserRole, AllergyStatus, PatientStatus } from '../../types/hospital';
import { Plus, X, Lock, AlertTriangle } from 'lucide-react';

interface EditPatientModalProps {
  isOpen: boolean;
  onClose: () => void;
  patient: Patient | null;
  currentUserRole?: UserRole;
  onSave: (id: string, updates: Partial<Patient>) => void;
}

export const EditPatientModal: React.FC<EditPatientModalProps> = ({
  isOpen,
  onClose,
  patient,
  currentUserRole = 'DOCTOR',
  onSave
}) => {
  const isClinician =
    currentUserRole === 'DOCTOR' ||
    currentUserRole === 'VAIDYA';

  const [firstName, setFirstName] = useState('');
  const [middleName, setMiddleName] = useState('');
  const [lastName, setLastName] = useState('');
  const [dob, setDob] = useState('');
  const [gender, setGender] = useState<'Male' | 'Female' | 'Other' | 'Undisclosed'>('Male');
  const [bloodGroup, setBloodGroup] = useState<string>('');
  const [preferredLanguage, setPreferredLanguage] = useState('');
  const [status, setStatus] = useState<PatientStatus>('active');

  // Contact
  const [phone, setPhone] = useState('');
  const [secondaryPhone, setSecondaryPhone] = useState('');
  const [email, setEmail] = useState('');

  // Address
  const [addressLine1, setAddressLine1] = useState('');
  const [addressLine2, setAddressLine2] = useState('');
  const [locality, setLocality] = useState('');
  const [city, setCity] = useState('');
  const [district, setDistrict] = useState('');
  const [state, setState] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [country, setCountry] = useState('');

  // Emergency contact
  const [emergencyName, setEmergencyName] = useState('');
  const [emergencyRel, setEmergencyRel] = useState('');
  const [emergencyPhone, setEmergencyPhone] = useState('');
  const [emergencyAltPhone, setEmergencyAltPhone] = useState('');

  // Clinical lists (restricted to clinicians)
  const [allergyStatus, setAllergyStatus] = useState<AllergyStatus>('not_recorded');
  const [allergies, setAllergies] = useState<string[]>([]);
  const [newAllergy, setNewAllergy] = useState('');

  const [chronicConditions, setChronicConditions] = useState<string[]>([]);
  const [newCondition, setNewCondition] = useState('');

  const [currentMedications, setCurrentMedications] = useState<string[]>([]);
  const [newMedication, setNewMedication] = useState('');

  const [pastDiagnoses, setPastDiagnoses] = useState<string[]>([]);
  const [newDiagnosis, setNewDiagnosis] = useState('');

  const [medicalHistoryNotes, setMedicalHistoryNotes] = useState('');
  const [clinicalNotes, setClinicalNotes] = useState('');

  // Status
  const [admissionStatus, setAdmissionStatus] = useState<Patient['admissionStatus']>('outpatient');
  const [assignedDoctorName, setAssignedDoctorName] = useState('');

  useEffect(() => {
    if (patient) {
      setFirstName(patient.firstName || '');
      setMiddleName(patient.middleName || '');
      setLastName(patient.lastName || '');
      setDob(patient.dob || '');
      setGender(patient.gender || 'Male');
      setBloodGroup(patient.bloodGroup || '');
      setPreferredLanguage(patient.preferredLanguage || '');
      setStatus(patient.status || 'active');

      setPhone(patient.phone || '');
      setSecondaryPhone(patient.secondaryPhone || '');
      setEmail(patient.email || '');

      setAddressLine1(patient.addressLine1 || patient.address || '');
      setAddressLine2(patient.addressLine2 || '');
      setLocality(patient.locality || '');
      setCity(patient.city || '');
      setDistrict(patient.district || '');
      setState(patient.state || '');
      setPostalCode(patient.postalCode || '');
      setCountry(patient.country || '');

      setEmergencyName(patient.emergencyContact?.name || patient.emergencyContactName || '');
      setEmergencyRel(patient.emergencyContact?.relationship || patient.emergencyContactRelation || '');
      setEmergencyPhone(patient.emergencyContact?.phone || patient.emergencyContactPhone || '');
      setEmergencyAltPhone(patient.emergencyContact?.altPhone || patient.emergencyContactAltPhone || '');

      setAllergyStatus(patient.allergyStatus || 'not_recorded');
      setAllergies([...(patient.allergies || [])]);
      setChronicConditions([...(patient.chronicConditions || [])]);
      setCurrentMedications([...(patient.currentMedications || [])]);
      setPastDiagnoses([...(patient.pastDiagnoses || [])]);

      setMedicalHistoryNotes(patient.medicalHistoryNotes || '');
      setClinicalNotes(patient.clinicalNotes || '');

      setAdmissionStatus(patient.admissionStatus || '');
      setAssignedDoctorName(patient.assignedDoctorName || '');
    }
  }, [patient]);

  if (!patient) return null;

  const handleAddAllergy = () => {
    if (!isClinician) return;
    if (newAllergy.trim() && !allergies.includes(newAllergy.trim())) {
      setAllergies([...allergies, newAllergy.trim()]);
      setAllergyStatus('known_allergies');
      setNewAllergy('');
    }
  };

  const handleRemoveAllergy = (idx: number) => {
    if (!isClinician) return;
    setAllergies(allergies.filter((_, i) => i !== idx));
  };

  const handleAddCondition = () => {
    if (!isClinician) return;
    if (newCondition.trim() && !chronicConditions.includes(newCondition.trim())) {
      setChronicConditions([...chronicConditions, newCondition.trim()]);
      setNewCondition('');
    }
  };

  const handleRemoveCondition = (idx: number) => {
    if (!isClinician) return;
    setChronicConditions(chronicConditions.filter((_, i) => i !== idx));
  };

  const handleAddMedication = () => {
    if (!isClinician) return;
    if (newMedication.trim() && !currentMedications.includes(newMedication.trim())) {
      setCurrentMedications([...currentMedications, newMedication.trim()]);
      setNewMedication('');
    }
  };

  const handleRemoveMedication = (idx: number) => {
    if (!isClinician) return;
    setCurrentMedications(currentMedications.filter((_, i) => i !== idx));
  };

  const handleAddDiagnosis = () => {
    if (!isClinician) return;
    if (newDiagnosis.trim() && !pastDiagnoses.includes(newDiagnosis.trim())) {
      setPastDiagnoses([...pastDiagnoses, newDiagnosis.trim()]);
      setNewDiagnosis('');
    }
  };

  const handleRemoveDiagnosis = (idx: number) => {
    if (!isClinician) return;
    setPastDiagnoses(pastDiagnoses.filter((_, i) => i !== idx));
  };

  const handleSave = () => {
    const combinedAddress = [addressLine1.trim(), addressLine2.trim(), locality.trim(), city.trim(), district.trim(), state.trim()]
      .filter(Boolean)
      .join(', ');

    const updates: Partial<Patient> = {
      firstName: firstName.trim(),
      middleName: middleName.trim() || undefined,
      lastName: lastName.trim(),
      dob: dob || undefined,
      gender,
      bloodGroup: bloodGroup || undefined,
      preferredLanguage: preferredLanguage || undefined,
      status,
      phone: phone.trim(),
      secondaryPhone: secondaryPhone.trim() || undefined,
      email: email.trim(),
      address: combinedAddress || undefined,
      addressLine1: addressLine1.trim() || undefined,
      addressLine2: addressLine2.trim() || undefined,
      locality: locality.trim() || undefined,
      city: city.trim() || undefined,
      district: district.trim() || undefined,
      state: state.trim() || undefined,
      postalCode: postalCode.trim() || undefined,
      country: country.trim() || undefined,
      emergencyContact: emergencyName.trim() ? {
        name: emergencyName.trim(),
        relationship: emergencyRel.trim() || 'Contact',
        phone: emergencyPhone.trim() || '',
        altPhone: emergencyAltPhone.trim() || undefined
      } : undefined,
      admissionStatus: admissionStatus || undefined,
      assignedDoctorName: assignedDoctorName.trim() || undefined
    };

    // Only include clinical fields if clinician
    if (isClinician) {
      updates.allergyStatus = allergyStatus;
      updates.allergies = allergies;
      updates.chronicConditions = chronicConditions;
      updates.currentMedications = currentMedications;
      updates.pastDiagnoses = pastDiagnoses;
      updates.medicalHistoryNotes = medicalHistoryNotes;
      updates.clinicalNotes = clinicalNotes;
    }

    onSave(patient.id, updates);
    onClose();
  };

  return (
    <CarbonModal
      isOpen={isOpen}
      onClose={onClose}
      title={`Edit Master Patient Record — ${patient.mrn}`}
      label="Sahachara Ops Master Patient Index (MPI)"
      primaryButtonText="Save Changes"
      secondaryButtonText="Discard"
      onRequestSubmit={handleSave}
      size="lg"
    >
      <div className="space-y-4 max-h-[75vh] overflow-y-auto pr-1">
        {/* Core Demographics */}
        <div className="p-3 bg-[#f4f4f4] border border-[#e0e0e0] space-y-3">
          <div className="text-xs font-semibold text-[#161616]">
            Demographic Information & Identifiers
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-[#161616] mb-1">First Name *</label>
              <input
                type="text"
                required
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="w-full carbon-input"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#161616] mb-1">Middle Name</label>
              <input
                type="text"
                value={middleName}
                onChange={(e) => setMiddleName(e.target.value)}
                className="w-full carbon-input"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#161616] mb-1">Last Name *</label>
              <input
                type="text"
                required
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="w-full carbon-input"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-semibold text-[#161616] mb-1">Date of Birth</label>
              <input
                type="date"
                value={dob}
                onChange={(e) => setDob(e.target.value)}
                className="w-full carbon-input font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#161616] mb-1">Gender</label>
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
              <label className="block text-xs font-semibold text-[#161616] mb-1">Blood Group</label>
              <select
                value={bloodGroup}
                onChange={(e) => setBloodGroup(e.target.value)}
                className="w-full carbon-input font-mono"
              >
                <option value="O+">O+</option>
                <option value="O-">O-</option>
                <option value="A+">A+</option>
                <option value="A-">A-</option>
                <option value="B+">B+</option>
                <option value="B-">B-</option>
                <option value="AB+">AB+</option>
                <option value="AB-">AB-</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#161616] mb-1">Patient Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as any)}
                className="w-full carbon-input font-medium"
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="archived">Archived</option>
              </select>
            </div>
          </div>
        </div>

        {/* Contact Information */}
        <div className="p-3 bg-white border border-[#e0e0e0] space-y-3">
          <div className="text-xs font-semibold text-[#161616]">
            Contact & Residential Information
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-[#161616] mb-1">Primary Phone *</label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full carbon-input font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#161616] mb-1">Secondary Phone</label>
              <input
                type="text"
                value={secondaryPhone}
                onChange={(e) => setSecondaryPhone(e.target.value)}
                className="w-full carbon-input font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#161616] mb-1">Email Address</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full carbon-input"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-[#161616] mb-1">Address Line 1</label>
              <input
                type="text"
                value={addressLine1}
                onChange={(e) => setAddressLine1(e.target.value)}
                className="w-full carbon-input"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#161616] mb-1">Address Line 2</label>
              <input
                type="text"
                value={addressLine2}
                onChange={(e) => setAddressLine2(e.target.value)}
                className="w-full carbon-input"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-semibold text-[#161616] mb-1">City / Town</label>
              <input
                type="text"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="w-full carbon-input"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#161616] mb-1">District</label>
              <input
                type="text"
                value={district}
                onChange={(e) => setDistrict(e.target.value)}
                className="w-full carbon-input"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#161616] mb-1">State</label>
              <input
                type="text"
                value={state}
                onChange={(e) => setState(e.target.value)}
                className="w-full carbon-input"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#161616] mb-1">PIN Code</label>
              <input
                type="text"
                value={postalCode}
                onChange={(e) => setPostalCode(e.target.value)}
                className="w-full carbon-input font-mono"
              />
            </div>
          </div>
        </div>

        {/* Emergency Contact */}
        <div className="p-3 bg-white border border-[#e0e0e0] space-y-3">
          <div className="text-xs font-semibold text-[#161616]">
            Emergency Contact Information
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-semibold text-[#161616] mb-1">Contact Name</label>
              <input
                type="text"
                value={emergencyName}
                onChange={(e) => setEmergencyName(e.target.value)}
                className="w-full carbon-input"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#161616] mb-1">Relationship</label>
              <input
                type="text"
                value={emergencyRel}
                onChange={(e) => setEmergencyRel(e.target.value)}
                className="w-full carbon-input"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#161616] mb-1">Primary Phone</label>
              <input
                type="text"
                value={emergencyPhone}
                onChange={(e) => setEmergencyPhone(e.target.value)}
                className="w-full carbon-input font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#161616] mb-1">Alternate Phone</label>
              <input
                type="text"
                value={emergencyAltPhone}
                onChange={(e) => setEmergencyAltPhone(e.target.value)}
                className="w-full carbon-input font-mono"
              />
            </div>
          </div>
        </div>

        {/* Clinical History & Background (RBAC Restricted) */}
        <div className={`p-3 border space-y-3 ${isClinician ? 'bg-white border-[#e0e0e0]' : 'bg-[#f4f4f4] border-[#c6c6c6] opacity-75'}`}>
          <div className="flex items-center justify-between">
            <div className="text-xs font-semibold text-[#161616] flex items-center gap-1.5">
              {!isClinician && <Lock className="w-3.5 h-3.5 text-[#525252]" />}
              <span>Clinical Medical Background & History</span>
            </div>
            {!isClinician && (
              <span className="text-[10px] text-[#da1e28] font-medium flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />
                Locked: Non-clinical roles cannot modify clinical records
              </span>
            )}
          </div>

          {/* Allergy Status */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-[#161616] mb-1">Allergy Classification</label>
              <select
                disabled={!isClinician}
                value={allergyStatus}
                onChange={(e) => setAllergyStatus(e.target.value as any)}
                className="w-full carbon-input"
              >
                <option value="not_recorded">Not Recorded</option>
                <option value="none_confirmed">None Known (Confirmed)</option>
                <option value="known_allergies">Known Allergies Present</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#161616] mb-1">Known Allergies (Tag list)</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  disabled={!isClinician}
                  value={newAllergy}
                  onChange={(e) => setNewAllergy(e.target.value)}
                  placeholder="e.g. Penicillin"
                  className="flex-1 carbon-input"
                />
                <CarbonButton
                  kind="secondary"
                  size="sm"
                  disabled={!isClinician}
                  onClick={handleAddAllergy}
                >
                  Add
                </CarbonButton>
              </div>
              <div className="flex flex-wrap gap-1 mt-1.5">
                {allergies.map((a, i) => (
                  <span key={i} className="px-2 py-0.5 bg-[#fff1f1] border border-[#ffb3b8] text-[#a2191f] text-xs flex items-center gap-1">
                    {a}
                    {isClinician && (
                      <X className="w-3 h-3 cursor-pointer hover:text-black" onClick={() => handleRemoveAllergy(i)} />
                    )}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Chronic Conditions & Current Medications */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-[#161616] mb-1">Chronic Conditions</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  disabled={!isClinician}
                  value={newCondition}
                  onChange={(e) => setNewCondition(e.target.value)}
                  placeholder="e.g. Hypertension"
                  className="flex-1 carbon-input"
                />
                <CarbonButton
                  kind="secondary"
                  size="sm"
                  disabled={!isClinician}
                  onClick={handleAddCondition}
                >
                  Add
                </CarbonButton>
              </div>
              <div className="flex flex-wrap gap-1 mt-1.5">
                {chronicConditions.map((c, i) => (
                  <span key={i} className="px-2 py-0.5 bg-[#f4f4f4] border border-[#e0e0e0] text-[#161616] text-xs flex items-center gap-1">
                    {c}
                    {isClinician && (
                      <X className="w-3 h-3 cursor-pointer hover:text-black" onClick={() => handleRemoveCondition(i)} />
                    )}
                  </span>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#161616] mb-1">Current Medications</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  disabled={!isClinician}
                  value={newMedication}
                  onChange={(e) => setNewMedication(e.target.value)}
                  placeholder="e.g. Amlodipine 5mg"
                  className="flex-1 carbon-input"
                />
                <CarbonButton
                  kind="secondary"
                  size="sm"
                  disabled={!isClinician}
                  onClick={handleAddMedication}
                >
                  Add
                </CarbonButton>
              </div>
              <div className="flex flex-wrap gap-1 mt-1.5">
                {currentMedications.map((m, i) => (
                  <span key={i} className="px-2 py-0.5 bg-[#edf5ff] border border-[#a6c8ff] text-[#0043ce] text-xs flex items-center gap-1">
                    {m}
                    {isClinician && (
                      <X className="w-3 h-3 cursor-pointer hover:text-black" onClick={() => handleRemoveMedication(i)} />
                    )}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Clinical Notes */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-[#161616] mb-1">Medical History Notes</label>
              <textarea
                rows={2}
                disabled={!isClinician}
                value={medicalHistoryNotes}
                onChange={(e) => setMedicalHistoryNotes(e.target.value)}
                className="w-full carbon-input resize-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#161616] mb-1">Clinical Intake Notes</label>
              <textarea
                rows={2}
                disabled={!isClinician}
                value={clinicalNotes}
                onChange={(e) => setClinicalNotes(e.target.value)}
                className="w-full carbon-input resize-none"
              />
            </div>
          </div>
        </div>
      </div>
    </CarbonModal>
  );
};
