import React, { useState } from 'react';
import { UserPlus, ShieldCheck, Stethoscope, Clock, Phone, Mail, Award, CheckCircle, AlertTriangle } from 'lucide-react';
import { CarbonModal } from '../carbon/CarbonModal';
import { CarbonButton } from '../carbon/CarbonButton';
import { StaffMember, StaffRole } from '../../types/hospital';

interface NewStaffModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (staffData: Partial<StaffMember>) => Promise<any> | void;
}

export const NewStaffModal: React.FC<NewStaffModalProps> = ({
  isOpen,
  onClose,
  onSubmit
}) => {
  const [name, setName] = useState('');
  const [role, setRole] = useState<StaffRole>('DOCTOR');
  const [designation, setDesignation] = useState('Ayurvedic Physician (Vaidya)');
  const [department, setDepartment] = useState('Kayachikitsa (Internal Medicine)');
  const [licenseNumber, setLicenseNumber] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [shift, setShift] = useState<'Morning (07:00-15:00)' | 'Evening (15:00-23:00)' | 'Night (23:00-07:00)' | 'General (09:00-17:00)'>('Morning (07:00-15:00)');
  const [qualification, setQualification] = useState('');
  const [status, setStatus] = useState<'on_duty' | 'active' | 'on_leave'>('on_duty');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [inlineError, setInlineError] = useState<string | null>(null);

  // Auto-fill sensible defaults when role changes
  const handleRoleChange = (newRole: StaffRole) => {
    setRole(newRole);
    switch (newRole) {
      case 'VAIDYA':
        setDesignation('Ayurvedic Physician (Vaidya)');
        setDepartment('Kayachikitsa & Panchakarma');
        break;
      case 'DOCTOR':
        setDesignation('Consultant Physician & Emergency Lead');
        setDepartment('Emergency & Acute Care');
        break;
      case 'RECEPTIONIST':
        setDesignation('Admissions & Front Desk Coordinator');
        setDepartment('Patient Admissions & Front Desk');
        break;
      case 'PHARMACIST':
        setDesignation('Chief Ayurvedic Pharmacist');
        setDepartment('Ayurvedic & Allopathic Pharmacy');
        break;
      case 'ACCOUNTANT':
        setDesignation('Patient Accounts & Cashier Officer');
        setDepartment('Patient Financial Services');
        break;
      case 'ADMIN':
        setDesignation('Hospital Operations Coordinator');
        setDepartment('Hospital Operations Administration');
        break;
      case 'SUPER_ADMIN':
        setDesignation('Executive Governance & IT Director');
        setDepartment('Executive Directorate');
        setQualification('Executive Directorate');
        break;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setInlineError('Full staff name is mandatory.');
      return;
    }

    if (!phone.trim()) {
      setInlineError('Contact telephone number is mandatory.');
      return;
    }

    const cleanPhone = phone.trim();
    const phoneDigits = cleanPhone.replace(/\D/g, '');
    const phonePattern = /^\+?[0-9\s\-()]{7,25}$/;
    if (!phonePattern.test(cleanPhone) || phoneDigits.length < 7 || phoneDigits.length > 15) {
      setInlineError('Contact telephone number must be a valid telephone format (e.g. +91 98450 12345).');
      return;
    }

    let cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) {
      const slug = name.toLowerCase().replace(/[^a-z0-9]/g, '.').replace(/\.+/g, '.').replace(/^\.|\.$/g, '');
      cleanEmail = `${slug || 'staff'}@sahachara.com`;
    } else if (!cleanEmail.endsWith('@sahachara.com')) {
      setInlineError('Official Staff Email must belong to the @sahachara.com domain.');
      return;
    }

    const newStaff: Partial<StaffMember> = {
      name: name.trim(),
      role,
      designation: designation.trim() || `${role} Staff`,
      department: department.trim() || 'General Clinical Services',
      licenseNumber: licenseNumber.trim() || undefined,
      email: cleanEmail,
      phone: cleanPhone,
      shift,
      qualification: qualification.trim() || undefined,
      status,
      notes: notes.trim() || undefined,
      joiningDate: new Date().toISOString().split('T')[0]
    };

    setInlineError(null);
    setIsSubmitting(true);
    try {
      await onSubmit(newStaff);
      onClose();
    } catch (err: any) {
      setInlineError(err.message || 'Failed to onboard staff member.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <CarbonModal
      isOpen={isOpen}
      onClose={onClose}
      title="Onboard New Hospital Staff Member"
      subtitle="Register physicians, receptionists, pharmacists, accountants, and administrators into Sahachara Ops."
      size="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4 text-xs text-[#161616]">
        {inlineError && (
          <div className="p-3 bg-[#fff1f1] border-l-4 border-[#da1e28] text-xs text-[#da1e28] flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 text-[#da1e28]" />
            <span>{inlineError}</span>
          </div>
        )}
        {/* Role & Category */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-medium text-[#161616] mb-1">
              Workforce Role <span className="text-[#da1e28]">*</span>
            </label>
            <select
              value={role}
              onChange={(e) => handleRoleChange(e.target.value as StaffRole)}
              className="w-full h-9 px-3 bg-white border border-[#8d8d8d] text-xs text-[#161616] focus:outline-2 focus:outline-[#0f62fe]"
            >
              <option value="VAIDYA">VAIDYA (Ayurvedic Physician)</option>
              <option value="DOCTOR">DOCTOR (Modern / Emergency Physician)</option>
              <option value="RECEPTIONIST">RECEPTIONIST (Front Desk & Admissions)</option>
              <option value="PHARMACIST">PHARMACIST (Dispensary & Formulations)</option>
              <option value="ACCOUNTANT">ACCOUNTANT (Billing & Finance)</option>
              <option value="ADMIN">ADMIN (Operations Administration)</option>
              <option value="SUPER_ADMIN">SUPER_ADMIN (Executive Governance)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-[#161616] mb-1">
              Full Legal Name <span className="text-[#da1e28]">*</span>
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full h-9 px-3 bg-white border border-[#8d8d8d] text-xs text-[#161616] focus:outline-2 focus:outline-[#0f62fe]"
              placeholder="e.g. Dr. K. Radhakrishnan, BAMS"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[#161616] mb-1">
              Designation / Title <span className="text-[#da1e28]">*</span>
            </label>
            <input
              type="text"
              required
              value={designation}
              onChange={(e) => setDesignation(e.target.value)}
              className="w-full h-9 px-3 bg-white border border-[#8d8d8d] text-xs text-[#161616] focus:outline-2 focus:outline-[#0f62fe]"
              placeholder="e.g. Senior Ayurvedic Physician"
            />
          </div>
        </div>

        {/* Department & Licensing */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-[#161616] mb-1">
              Clinical Department <span className="text-[#da1e28]">*</span>
            </label>
            <select
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              className="w-full h-9 px-3 bg-white border border-[#8d8d8d] text-xs text-[#161616] focus:outline-2 focus:outline-[#0f62fe]"
            >
              <option value="Kayachikitsa (Internal Medicine)">Kayachikitsa (Internal Medicine)</option>
              <option value="Panchakarma Directorate">Panchakarma Directorate</option>
              <option value="Shalya & Shalakya Tantra">Shalya & Shalakya Tantra (Surgery & ENT)</option>
              <option value="Dravyaguna & Rasashastra">Dravyaguna & Rasashastra (Pharmacology)</option>
              <option value="Cardiovascular Institute">Cardiovascular Institute</option>
              <option value="Emergency & Trauma Services">Emergency & Trauma Services</option>
              <option value="Intensive Care Unit (ICU)">Intensive Care Unit (ICU)</option>
              <option value="Pathology & Diagnostic Laboratory">Pathology & Diagnostic Laboratory</option>
              <option value="Ayurvedic & Allopathic Pharmacy">Ayurvedic & Allopathic Pharmacy</option>
              <option value="Executive Administration">Executive Administration</option>
              <option value="Patient Financial Services">Patient Financial Services</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-[#161616] mb-1">
              AYUSH / Medical Council / Professional License No. <span className="text-[#da1e28]">*</span>
            </label>
            <input
              type="text"
              required
              value={licenseNumber}
              onChange={(e) => setLicenseNumber(e.target.value)}
              className="w-full h-9 px-3 bg-white border border-[#8d8d8d] font-mono text-xs text-[#161616] focus:outline-2 focus:outline-[#0f62fe]"
              placeholder="e.g. AYUSH-KL-99214 or MLT-AIIMS-8801"
            />
          </div>
        </div>

        {/* Contact Info */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-[#161616] mb-1">
              Official Email Address <span className="text-[#da1e28]">*</span>
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full h-9 px-3 bg-white border border-[#8d8d8d] text-xs text-[#161616] focus:outline-2 focus:outline-[#0f62fe]"
              placeholder="e.g. radhakrishnan@sahachara.com"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[#161616] mb-1">
              Contact Telephone Number <span className="text-[#da1e28]">*</span>
            </label>
            <input
              type="tel"
              required
              value={phone}
              onChange={(e) => {
                setPhone(e.target.value);
                if (inlineError) setInlineError(null);
              }}
              className="w-full h-9 px-3 bg-white border border-[#8d8d8d] font-mono text-xs text-[#161616] focus:outline-2 focus:outline-[#0f62fe]"
              placeholder="e.g. +91 98450 12345"
            />
          </div>
        </div>

        {/* Shift, Status, Qualifications */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-medium text-[#161616] mb-1">
              Primary Shift
            </label>
            <select
              value={shift}
              onChange={(e) => setShift(e.target.value as any)}
              className="w-full h-9 px-3 bg-white border border-[#8d8d8d] text-xs text-[#161616] focus:outline-2 focus:outline-[#0f62fe]"
            >
              <option value="Morning (07:00-15:00)">Morning (07:00-15:00)</option>
              <option value="Evening (15:00-23:00)">Evening (15:00-23:00)</option>
              <option value="Night (23:00-07:00)">Night (23:00-07:00)</option>
              <option value="General (09:00-17:00)">General (09:00-17:00)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-[#161616] mb-1">
              Initial Duty Status
            </label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as any)}
              className="w-full h-9 px-3 bg-white border border-[#8d8d8d] text-xs text-[#161616] focus:outline-2 focus:outline-[#0f62fe]"
            >
              <option value="on_duty">On Duty (Active in ward/clinic)</option>
              <option value="active">Active (Rostered)</option>
              <option value="on_leave">On Leave</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-[#161616] mb-1">
              Degree & Qualifications
            </label>
            <input
              type="text"
              value={qualification}
              onChange={(e) => setQualification(e.target.value)}
              className="w-full h-9 px-3 bg-white border border-[#8d8d8d] text-xs text-[#161616] focus:outline-2 focus:outline-[#0f62fe]"
              placeholder="e.g. BAMS, MD (Kayachikitsa)"
            />
          </div>
        </div>

        {/* Optional Notes */}
        <div>
          <label className="block text-xs font-medium text-[#161616] mb-1">
            Clinical Scope & Operational Notes
          </label>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full h-9 px-3 bg-white border border-[#8d8d8d] text-xs text-[#161616] focus:outline-2 focus:outline-[#0f62fe]"
            placeholder="e.g. Lead practitioner for Kizhi & Janu Basti; emergency room coverage on weekends"
          />
        </div>

        {/* Buttons */}
        <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#e0e0e0]">
          <CarbonButton kind="secondary" size="md" type="button" onClick={onClose}>
            Cancel
          </CarbonButton>

          <CarbonButton
            kind="primary"
            size="md"
            type="submit"
            disabled={isSubmitting || !name.trim() || !phone.trim()}
            renderIcon={UserPlus}
          >
            {isSubmitting ? 'Onboarding...' : 'Confirm & Onboard Staff'}
          </CarbonButton>
        </div>
      </form>
    </CarbonModal>
  );
};
