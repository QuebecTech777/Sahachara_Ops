import React, { useState } from 'react';
import {
  UserPlus,
  ShieldCheck,
  Stethoscope,
  Clock,
  Phone,
  Mail,
  Award,
  CheckCircle,
  Building2,
  FileText
} from 'lucide-react';
import { CarbonModal } from '../carbon/CarbonModal';
import { CarbonButton } from '../carbon/CarbonButton';
import { StaffMember, StaffRole } from '../../types/hospital';

interface NewStaffMemberModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (staffData: Partial<StaffMember>) => void;
}

export const NewStaffMemberModal: React.FC<NewStaffMemberModalProps> = ({
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
  const [qualification, setQualification] = useState('BAMS, MD (Ayurveda)');
  const [status, setStatus] = useState<'on_duty' | 'active' | 'on_leave'>('on_duty');
  const [notes, setNotes] = useState('');

  // Department presets for quick select
  const commonDepartments = [
    'Kayachikitsa (Internal Medicine)',
    'Panchakarma Directorate',
    'Shalya Tantra (Surgical / Marma)',
    'Shalakya Tantra (ENT & Ophthalmology)',
    'Kaumarbhritya (Pediatrics)',
    'Prasuti & Stri Roga (Obstetrics & Gynecology)',
    'Ayurvedic Inpatient Facility (IPD)',
    'Pathology & Diagnostic Laboratory',
    'Ayurvedic & Allopathic Pharmacy',
    'Executive Administration',
    'Patient Financial Services & Billing'
  ];

  // Auto-fill sensible defaults when role changes
  const handleRoleChange = (newRole: StaffRole) => {
    setRole(newRole);
    switch (newRole) {
      case 'VAIDYA':
        setDesignation('Ayurvedic Physician (Vaidya)');
        setDepartment('Kayachikitsa & Panchakarma');
        setQualification('BAMS, MD (Ayurveda)');
        break;
      case 'DOCTOR':
        setDesignation('Consultant Physician & Emergency Lead');
        setDepartment('Emergency & Acute Care');
        setQualification('MBBS, MD');
        break;
      case 'RECEPTIONIST':
        setDesignation('Admissions & Front Desk Coordinator');
        setDepartment('Patient Services');
        setQualification('BBA / Healthcare Administration');
        break;
      case 'PHARMACIST':
        setDesignation('Chief Ayurvedic Pharmacist');
        setDepartment('Ayurvedic & Allopathic Pharmacy');
        setQualification('B.Pharm / D.Pharm (Ayurveda)');
        break;
      case 'ACCOUNTANT':
        setDesignation('Patient Accounts & Cashier Executive');
        setDepartment('Patient Financial Services & Billing');
        setQualification('B.Com, Healthcare Billing Specialist');
        break;
      case 'ADMIN':
        setDesignation('Hospital Operations Coordinator');
        setDepartment('Executive Administration');
        setQualification('MHA / MBA Hospital Management');
        break;
      case 'SUPER_ADMIN':
        setDesignation('Executive Governance & IT Director');
        setDepartment('Executive Administration');
        setQualification('Executive Directorate');
        break;
    }
  };

  const [pinNotice, setPinNotice] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    let cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) {
      const slug = name.toLowerCase().replace(/[^a-z0-9]/g, '.').replace(/\.+/g, '.').replace(/^\.|\.$/g, '');
      cleanEmail = `${slug || 'staff'}@sahachara.com`;
    } else if (!cleanEmail.endsWith('@sahachara.com')) {
      alert('Official Staff Email must belong to the @sahachara.com domain.');
      return;
    }

    const generatedPin = Math.floor(1000 + Math.random() * 9000).toString();

    const newStaff: Partial<StaffMember> = {
      name: name.trim(),
      role,
      designation: designation.trim() || `${role} Staff`,
      department: department.trim() || 'General Clinical Services',
      licenseNumber: licenseNumber.trim() || `REG-AY-${Math.floor(1000 + Math.random() * 9000)}`,
      email: cleanEmail,
      phone: phone.trim() || '+91 98450 00000',
      shift,
      qualification: qualification.trim() || 'Qualified Professional',
      status: 'pending_activation',
      activationPin: generatedPin,
      notes: notes.trim(),
      joiningDate: new Date().toISOString().split('T')[0]
    };
    onSubmit(newStaff);
    onClose();
  };

  return (
    <CarbonModal
      isOpen={isOpen}
      onClose={onClose}
      title="Onboard New Hospital Personnel"
      subtitle="Register clinical practitioners, receptionists, pharmacists, accountants, and administrators into Sahachara Ops."
      size="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4 text-xs text-[#161616]">
        {/* Role & Name */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-[11px] font-medium uppercase tracking-[0.32px] text-[#525252] mb-1">
              Staff Role <span className="text-[#da1e28]">*</span>
            </label>
            <select
              value={role}
              onChange={(e) => handleRoleChange(e.target.value as StaffRole)}
              className="w-full bg-[#f4f4f4] border border-[#8d8d8d] px-3 py-2 text-xs text-[#161616] focus:outline-hidden focus:border-[#0f62fe] rounded-none cursor-pointer"
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
            <label className="block text-[11px] font-medium uppercase tracking-[0.32px] text-[#525252] mb-1">
              Full Legal Name <span className="text-[#da1e28]">*</span>
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Dr. Gautham Namboodiri or Smt. Priya Nair"
              className="w-full bg-[#f4f4f4] border border-[#8d8d8d] px-3 py-2 text-xs text-[#161616] focus:outline-hidden focus:border-[#0f62fe] rounded-none"
            />
          </div>
        </div>

        {/* Department & Designation */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-[11px] font-medium uppercase tracking-[0.32px] text-[#525252] mb-1">
              Hospital Department <span className="text-[#da1e28]">*</span>
            </label>
            <div className="space-y-1">
              <input
                type="text"
                required
                list="dept-options"
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                placeholder="Select or enter department"
                className="w-full bg-[#f4f4f4] border border-[#8d8d8d] px-3 py-2 text-xs text-[#161616] focus:outline-hidden focus:border-[#0f62fe] rounded-none"
              />
              <datalist id="dept-options">
                {commonDepartments.map((d) => (
                  <option key={d} value={d} />
                ))}
              </datalist>
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-medium uppercase tracking-[0.32px] text-[#525252] mb-1">
              Designation / Title
            </label>
            <input
              type="text"
              value={designation}
              onChange={(e) => setDesignation(e.target.value)}
              placeholder="e.g. Senior Vaidya, Lead Biochemist"
              className="w-full bg-[#f4f4f4] border border-[#8d8d8d] px-3 py-2 text-xs text-[#161616] focus:outline-hidden focus:border-[#0f62fe] rounded-none"
            />
          </div>
        </div>

        {/* Contact Info: Email & Phone */}
        <div className="p-3 bg-[#f4f4f4] border border-[#e0e0e0]">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.32px] text-[#161616] mb-2">
            <Phone className="w-3.5 h-3.5 text-[#0f62fe]" /> Contact Information <span className="text-[#da1e28]">*</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-medium uppercase text-[#525252] mb-1">
                Official Email Address
              </label>
              <div className="relative">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@sahachara.com"
                  className="w-full bg-white border border-[#8d8d8d] px-3 py-2 text-xs text-[#161616] focus:outline-hidden focus:border-[#0f62fe] rounded-none pl-8"
                />
                <Mail className="w-3.5 h-3.5 text-[#8d8d8d] absolute left-2.5 top-2.5" />
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-medium uppercase text-[#525252] mb-1">
                Direct Contact Phone
              </label>
              <div className="relative">
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+91 98450 XXXXX"
                  className="w-full bg-white border border-[#8d8d8d] px-3 py-2 text-xs text-[#161616] focus:outline-hidden focus:border-[#0f62fe] rounded-none pl-8 font-mono"
                />
                <Phone className="w-3.5 h-3.5 text-[#8d8d8d] absolute left-2.5 top-2.5" />
              </div>
            </div>
          </div>
        </div>

        {/* Professional License & Academic Qualification */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-[11px] font-medium uppercase tracking-[0.32px] text-[#525252] mb-1">
              Council Registration / License #
            </label>
            <input
              type="text"
              value={licenseNumber}
              onChange={(e) => setLicenseNumber(e.target.value)}
              placeholder="e.g. AYUSH-KL-4091 or MLT-AIIMS-7712"
              className="w-full bg-[#f4f4f4] border border-[#8d8d8d] px-3 py-2 text-xs text-[#161616] font-mono focus:outline-hidden focus:border-[#0f62fe] rounded-none"
            />
          </div>

          <div>
            <label className="block text-[11px] font-medium uppercase tracking-[0.32px] text-[#525252] mb-1">
              Qualifications & Degrees
            </label>
            <input
              type="text"
              value={qualification}
              onChange={(e) => setQualification(e.target.value)}
              placeholder="e.g. BAMS, MD (Panchakarma), DAMPT"
              className="w-full bg-[#f4f4f4] border border-[#8d8d8d] px-3 py-2 text-xs text-[#161616] focus:outline-hidden focus:border-[#0f62fe] rounded-none"
            />
          </div>
        </div>

        {/* Shift Schedule & Duty Status */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-[11px] font-medium uppercase tracking-[0.32px] text-[#525252] mb-1">
              Assigned Shift Schedule
            </label>
            <select
              value={shift}
              onChange={(e) => setShift(e.target.value as any)}
              className="w-full bg-[#f4f4f4] border border-[#8d8d8d] px-3 py-2 text-xs text-[#161616] focus:outline-hidden focus:border-[#0f62fe] rounded-none cursor-pointer"
            >
              <option value="Morning (07:00-15:00)">Morning (07:00 - 15:00)</option>
              <option value="Evening (15:00-23:00)">Evening (15:00 - 23:00)</option>
              <option value="Night (23:00-07:00)">Night (23:00 - 07:00)</option>
              <option value="General (09:00-17:00)">General Duty (09:00 - 17:00)</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-medium uppercase tracking-[0.32px] text-[#525252] mb-1">
              Initial Duty Status
            </label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as any)}
              className="w-full bg-[#f4f4f4] border border-[#8d8d8d] px-3 py-2 text-xs text-[#161616] focus:outline-hidden focus:border-[#0f62fe] rounded-none cursor-pointer"
            >
              <option value="on_duty">On Duty (Active on Clinical Floor)</option>
              <option value="active">Active (Hospital Staff Roster)</option>
              <option value="on_leave">On Approved Leave</option>
            </select>
          </div>
        </div>

        {/* Clinical / Administrative Notes */}
        <div>
          <label className="block text-[11px] font-medium uppercase tracking-[0.32px] text-[#525252] mb-1">
            Specialization & Clinical Notes (Optional)
          </label>
          <textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Add relevant notes on clinical sub-specialization, emergency roster, or AYUSH credentials..."
            className="w-full bg-[#f4f4f4] border border-[#8d8d8d] p-2.5 text-xs text-[#161616] focus:outline-hidden focus:border-[#0f62fe] rounded-none resize-none"
          />
        </div>

        {/* Actions */}
        <div className="pt-3 border-t border-[#e0e0e0] flex items-center justify-end gap-2">
          <CarbonButton variant="secondary" size="md" onClick={onClose} type="button">
            Cancel
          </CarbonButton>
          <CarbonButton variant="primary" size="md" type="submit" disabled={!name.trim()}>
            <UserPlus className="w-4 h-4 mr-1.5 inline" /> Onboard Personnel
          </CarbonButton>
        </div>
      </form>
    </CarbonModal>
  );
};
