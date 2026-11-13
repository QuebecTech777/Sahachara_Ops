import React, { useState } from 'react';
import {
  BarChart3,
  Calendar,
  Download,
  Users,
  HandHeart,
  Flame,
  Pill,
  CreditCard,
  Filter,
  CheckCircle,
  TrendingUp,
  Activity,
  Building2,
  ShieldCheck,
  Briefcase,
  Clock,
  UserCheck,
  BarChart2,
  Layers,
  ChevronRight
} from 'lucide-react';
import {
  Patient,
  Appointment,
  Consultation,
  TreatmentPlan,
  PanchakarmaCourse,
  MedicationStock,
  BillInvoice,
  AppUser,
  StaffMember
} from '../types/hospital';
import { CarbonButton } from '../components/carbon/CarbonButton';
import { CarbonTag } from '../components/carbon/CarbonTag';
import { CarbonTile } from '../components/carbon/CarbonTile';

interface ReportsAnalyticsViewProps {
  patients: Patient[];
  appointments: Appointment[];
  consultations: Consultation[];
  treatments: TreatmentPlan[];
  panchakarma: PanchakarmaCourse[];
  medicines: MedicationStock[];
  invoices: BillInvoice[];
  currentUser: AppUser;
  staff?: StaffMember[];
}

export const ReportsAnalyticsView: React.FC<ReportsAnalyticsViewProps> = ({
  patients,
  appointments,
  consultations,
  treatments,
  panchakarma,
  medicines,
  invoices,
  currentUser,
  staff = []
}) => {
  const [dateRange, setDateRange] = useState<'today' | '7days' | '30days' | 'month' | 'year'>('30days');
  const [activeReportCategory, setActiveReportCategory] = useState<
    'overview' | 'workforce' | 'ayurvedic' | 'panchakarma' | 'therapies' | 'pharmacy' | 'finance'
  >('overview');
  const [chartOrientation, setChartOrientation] = useState<'horizontal' | 'vertical'>('horizontal');

  // Aggregated calculations
  const totalInvoicedInr = invoices.reduce((acc, inv) => acc + inv.totalAmount, 0);
  const totalCollectedInr = invoices.reduce((acc, inv) => acc + (inv.paymentStatus === 'paid' ? inv.totalAmount : (inv.copayPatient || 0)), 0);
  const totalOutstandingInr = totalInvoicedInr - totalCollectedInr;

  // Department-based breakdown of staff
  const staffList = staff && staff.length > 0 ? staff : [];

  const departmentStatsMap: Record<
    string,
    { count: number; onDuty: number; practitioners: number; roles: Record<string, number>; shifts: Record<string, number> }
  > = {};

  staffList.forEach((s) => {
    const dept = s.department || 'General Clinical Services';
    if (!departmentStatsMap[dept]) {
      departmentStatsMap[dept] = { count: 0, onDuty: 0, practitioners: 0, roles: {}, shifts: {} };
    }
    departmentStatsMap[dept].count += 1;
    if (s.status === 'on_duty') departmentStatsMap[dept].onDuty += 1;
    if (s.role === 'DOCTOR' || s.role === 'VAIDYA') departmentStatsMap[dept].practitioners += 1;
    departmentStatsMap[dept].roles[s.role] = (departmentStatsMap[dept].roles[s.role] || 0) + 1;
    const shiftKey = s.shift ? s.shift.split(' ')[0] : 'General';
    departmentStatsMap[dept].shifts[shiftKey] = (departmentStatsMap[dept].shifts[shiftKey] || 0) + 1;
  });

  const departmentData = Object.entries(departmentStatsMap)
    .map(([department, data]) => ({
      department,
      count: data.count,
      onDuty: data.onDuty,
      practitioners: data.practitioners,
      roles: data.roles,
      shifts: data.shifts,
      percentage: staffList.length > 0 ? Math.round((data.count / staffList.length) * 100) : 0
    }))
    .sort((a, b) => b.count - a.count);

  const maxDeptCount = Math.max(...departmentData.map((d) => d.count), 1);
  const totalStaffCount = staffList.length;
  const onDutyCount = staffList.filter((s) => s.status === 'on_duty').length;
  const practitionerCount = staffList.filter((s) => s.role === 'DOCTOR' || s.role === 'VAIDYA').length;

  // IBM Carbon Design System Color Palette for Categorical Data
  const BAR_COLORS = [
    '#0f62fe', // IBM Blue 60
    '#8a3ffc', // Purple 60
    '#0072c3', // Cyan 50
    '#009d9a', // Teal 50
    '#1192e8', // Blue 50
    '#6929c4', // Purple 70
    '#005d5d', // Teal 70
    '#9f1853', // Magenta 60
    '#fa4d56', // Red 50
    '#0043ce'  // Blue 70
  ];

  // Doshic breakdown from consultations
  const doshicCounts: Record<string, number> = {
    'Vata-Pitta': 0,
    'Pitta-Kapha': 0,
    'Vata-Kapha': 0,
    'Tridoshic (Sama)': 0,
    'Vata': 0,
    'Pitta': 0,
    'Kapha': 0
  };

  consultations.forEach((c) => {
    const dom = c.ayurvedicAssessment.prakriti.dominant;
    if (doshicCounts[dom] !== undefined) {
      doshicCounts[dom] += 1;
    } else {
      doshicCounts['Tridoshic (Sama)'] += 1;
    }
  });

  // Agni counts
  const agniCounts = {
    Sama: consultations.filter((c) => c.ayurvedicAssessment.agni.includes('Sama')).length,
    Tikshna: consultations.filter((c) => c.ayurvedicAssessment.agni.includes('Tikshna')).length,
    Manda: consultations.filter((c) => c.ayurvedicAssessment.agni.includes('Manda')).length,
    Vishama: consultations.filter((c) => c.ayurvedicAssessment.agni.includes('Vishama')).length
  };

  // Panchakarma Protocol distribution
  const pkProtocols = {
    Virechana: panchakarma.filter((pk) => pk.protocol.includes('Virechana')).length,
    Basti: panchakarma.filter((pk) => pk.protocol.includes('Basti')).length,
    Vamana: panchakarma.filter((pk) => pk.protocol.includes('Vamana')).length,
    Nasya: panchakarma.filter((pk) => pk.protocol.includes('Nasya')).length,
    Raktamokshana: panchakarma.filter((pk) => pk.protocol.includes('Raktamokshana')).length
  };

  const handleExportCsv = () => {
    const headers = ['Category', 'Metric', 'Value', 'Unit'];
    const rows = [
      ['Patients', 'Total Patients Registered', patients.length, 'Count'],
      ['Patients', 'Active Inpatients', patients.filter((p) => p.admissionStatus === 'inpatient').length, 'Count'],
      ['Consultations', 'Completed Ayurvedic Consultations', consultations.length, 'Count'],
      ['Panchakarma', 'Active Panchakarma Courses', panchakarma.filter((pk) => pk.status === 'Active').length, 'Courses'],
      ['Therapies', 'Total Active Therapy Plans', treatments.filter((t) => t.status === 'active').length, 'Plans'],
      ['Finance', 'Total Invoiced (INR)', totalInvoicedInr, '₹'],
      ['Finance', 'Total Collected (INR)', totalCollectedInr, '₹'],
      ['Finance', 'Outstanding Balance (INR)', totalOutstandingInr, '₹'],
      ['Pharmacy', 'Medicines in Inventory', medicines.length, 'SKUs'],
      ['Pharmacy', 'Low Stock Alerts', medicines.filter((m) => m.status === 'low_stock' || m.status === 'critical').length, 'Alerts'],
      ['Workforce', 'Total Registered Personnel', totalStaffCount, 'Personnel'],
      ['Workforce', 'Active On-Duty Floor Staff', onDutyCount, 'Personnel'],
      ['Workforce', 'Clinical Practitioners (Doctors & Vaidyas)', practitionerCount, 'Personnel'],
      ['Workforce', 'Departments Represented', departmentData.length, 'Departments']
    ];

    departmentData.forEach((d) => {
      rows.push(['Workforce Department', `${d.department} - Headcount`, d.count, 'Personnel']);
      rows.push(['Workforce Department', `${d.department} - Active On Duty`, d.onDuty, 'Personnel']);
    });

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `SahacharaOS_Clinical_Analytics_${dateRange}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Reusable Department Breakdown Bar Chart Widget (Carbon Light System)
  const renderDepartmentBarChartWidget = () => (
    <div className="bg-white border border-[#e0e0e0] shadow-2xs p-5 text-xs">
      {/* Widget Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 mb-4 border-b border-[#e0e0e0] gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-[#161616] tracking-tight flex items-center gap-1.5">
              <Building2 className="w-4 h-4 text-[#0f62fe]" /> Department-Based Workforce Breakdown
            </h3>
            <span className="text-[10px] font-mono text-[#0043ce] bg-[#edf5ff] border border-[#a6c8ff] px-2 py-0.5">
              {departmentData.length} Departments
            </span>
          </div>
          <p className="text-[11px] text-[#525252] mt-0.5">
            Distribution of healthcare physicians, panchakarma therapists, nursing officers, laboratory diagnosticians, and administrators.
          </p>
        </div>

        {/* Chart Orientation Toggle */}
        <div className="flex items-center gap-1 bg-[#f4f4f4] p-0.5 border border-[#e0e0e0] self-start sm:self-auto">
          <button
            onClick={() => setChartOrientation('horizontal')}
            className={`px-2.5 py-1 text-[11px] font-mono flex items-center gap-1 transition-colors rounded-none cursor-pointer ${
              chartOrientation === 'horizontal'
                ? 'bg-[#0f62fe] text-white font-medium shadow-2xs'
                : 'text-[#525252] hover:text-[#161616]'
            }`}
            title="Horizontal Bar Chart"
          >
            <BarChart2 className="w-3 h-3 rotate-90" /> Horizontal
          </button>
          <button
            onClick={() => setChartOrientation('vertical')}
            className={`px-2.5 py-1 text-[11px] font-mono flex items-center gap-1 transition-colors rounded-none cursor-pointer ${
              chartOrientation === 'vertical'
                ? 'bg-[#0f62fe] text-white font-medium shadow-2xs'
                : 'text-[#525252] hover:text-[#161616]'
            }`}
            title="Vertical Column Chart"
          >
            <BarChart3 className="w-3 h-3" /> Columns
          </button>
        </div>
      </div>

      {/* Topline KPI Ribbon */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <div className="p-3 bg-[#f4f4f4] border border-[#e0e0e0]">
          <span className="text-[10px] font-mono text-[#525252] uppercase block">Total Workforce</span>
          <span className="text-xl font-mono font-semibold text-[#161616] mt-0.5 block">{totalStaffCount} Personnel</span>
          <span className="text-[10px] text-[#0f62fe] mt-0.5 block">100% Master Roster</span>
        </div>
        <div className="p-3 bg-[#f4f4f4] border border-[#e0e0e0]">
          <span className="text-[10px] font-mono text-[#525252] uppercase block">Active on Duty</span>
          <span className="text-xl font-mono font-semibold text-[#24a148] mt-0.5 block">{onDutyCount} Floor Staff</span>
          <span className="text-[10px] text-[#0e6027] mt-0.5 block">
            {totalStaffCount > 0 ? Math.round((onDutyCount / totalStaffCount) * 100) : 0}% Active Coverage
          </span>
        </div>
        <div className="p-3 bg-[#f4f4f4] border border-[#e0e0e0]">
          <span className="text-[10px] font-mono text-[#525252] uppercase block">Clinical Practitioners</span>
          <span className="text-xl font-mono font-semibold text-[#0043ce] mt-0.5 block">{practitionerCount} Active</span>
          <span className="text-[10px] text-[#0f62fe] mt-0.5 block">Vaidyas & Doctors</span>
        </div>
        <div className="p-3 bg-[#f4f4f4] border border-[#e0e0e0]">
          <span className="text-[10px] font-mono text-[#525252] uppercase block">Divisions Active</span>
          <span className="text-xl font-mono font-semibold text-[#161616] mt-0.5 block">{departmentData.length} Units</span>
          <span className="text-[10px] text-[#525252] mt-0.5 block">Clinical & Admin</span>
        </div>
      </div>

      {/* Horizontal Bar Chart Representation */}
      {chartOrientation === 'horizontal' && (
        <div className="space-y-3.5">
          {/* Grid Scale Header */}
          <div className="flex justify-between items-center text-[10px] font-mono text-[#525252] pb-1 border-b border-[#e0e0e0]">
            <span>DEPARTMENT (HEADCOUNT & SHARE)</span>
            <div className="flex gap-8">
              <span>0%</span>
              <span>25%</span>
              <span>50%</span>
              <span>75%</span>
              <span>100%</span>
            </div>
          </div>

          {departmentData.map((d, idx) => {
            const barColor = BAR_COLORS[idx % BAR_COLORS.length];
            const barWidthPercent = (d.count / maxDeptCount) * 100;

            return (
              <div key={d.department} className="group">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between text-xs mb-1 gap-1">
                  <div className="flex items-center gap-2">
                    <span
                      className="w-2.5 h-2.5 shrink-0"
                      style={{ backgroundColor: barColor }}
                    />
                    <span className="text-[#161616] font-medium group-hover:text-[#0f62fe] transition-colors">
                      {d.department}
                    </span>
                    <span className="text-[10px] font-mono text-[#525252] hidden sm:inline">
                      ({d.percentage}% of hospital workforce)
                    </span>
                  </div>

                  <div className="flex items-center gap-2 text-[11px] font-mono shrink-0">
                    <span className="text-[#161616] font-semibold">{d.count} staff</span>
                    <span className="text-[#8d8d8d]">|</span>
                    <span className="text-[#24a148] font-medium">{d.onDuty} on duty</span>
                    {d.practitioners > 0 && (
                      <span className="text-[#0043ce] flex items-center gap-0.5">
                        <UserCheck className="w-3 h-3 text-[#0f62fe]" /> {d.practitioners} MD/Vaidya
                      </span>
                    )}
                  </div>
                </div>

                {/* Bar Track & Fill */}
                <div className="relative w-full bg-[#f4f4f4] h-4 flex items-center border border-[#e0e0e0] group-hover:border-[#8d8d8d] transition-colors">
                  {/* Subtle Grid reference markers */}
                  <div className="absolute inset-0 flex justify-between pointer-events-none opacity-40">
                    <div className="border-r border-[#c6c6c6] h-full" style={{ left: '25%' }} />
                    <div className="border-r border-[#c6c6c6] h-full" style={{ left: '50%' }} />
                    <div className="border-r border-[#c6c6c6] h-full" style={{ left: '75%' }} />
                  </div>

                  {/* Colored Filled Bar */}
                  <div
                    className="h-full transition-all duration-300 relative flex items-center px-1.5"
                    style={{
                      width: `${Math.max(barWidthPercent, 8)}%`,
                      backgroundColor: barColor
                    }}
                  >
                    <span className="text-[9px] font-mono font-bold text-white drop-shadow-xs">
                      {d.count}
                    </span>
                  </div>
                </div>

                {/* Sub-Role Breakdown Chips */}
                <div className="flex flex-wrap gap-1 mt-1 text-[10px] text-[#525252]">
                  {Object.entries(d.roles).map(([roleName, roleCount]) => (
                    <span key={roleName} className="bg-[#f4f4f4] px-1.5 py-0.5 border border-[#e0e0e0] text-[#161616]">
                      {roleCount} {roleName}
                    </span>
                  ))}
                  {Object.entries(d.shifts).map(([shiftName, shiftCount]) => (
                    <span key={shiftName} className="bg-[#f4f4f4] px-1.5 py-0.5 text-[#525252] border border-[#e0e0e0]">
                      {shiftCount} {shiftName} Shift
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Vertical Column Chart Representation */}
      {chartOrientation === 'vertical' && (
        <div className="pt-2">
          {/* Chart Canvas Area */}
          <div className="relative h-56 flex items-end justify-between gap-2 border-b border-l border-[#e0e0e0] px-2 pb-1 pt-6 bg-[#fafafa]">
            {/* Background Grid Lines */}
            <div className="absolute inset-0 flex flex-col justify-between pointer-events-none opacity-30 pl-6">
              <div className="border-b border-[#c6c6c6] w-full" />
              <div className="border-b border-[#c6c6c6] w-full" />
              <div className="border-b border-[#c6c6c6] w-full" />
              <div className="border-b border-[#c6c6c6] w-full" />
            </div>

            {/* Y-Axis Label */}
            <div className="absolute -left-1 top-1 text-[9px] font-mono text-[#525252]">
              Headcount (Max: {maxDeptCount})
            </div>

            {/* Columns */}
            {departmentData.map((d, idx) => {
              const barColor = BAR_COLORS[idx % BAR_COLORS.length];
              const heightPercent = Math.max((d.count / maxDeptCount) * 85, 12);

              return (
                <div
                  key={d.department}
                  className="flex-1 flex flex-col items-center h-full justify-end group relative"
                >
                  {/* Tooltip value */}
                  <div className="mb-1 text-[10px] font-mono font-semibold text-[#161616] group-hover:scale-110 transition-transform">
                    {d.count}
                  </div>

                  {/* Vertical Bar */}
                  <div
                    className="w-full max-w-[42px] transition-all duration-300 relative group-hover:brightness-110 border border-black/10"
                    style={{
                      height: `${heightPercent}%`,
                      backgroundColor: barColor
                    }}
                  />

                  {/* On Duty Badge Indicator */}
                  <div className="mt-1 text-[9px] font-mono text-[#24a148] font-medium">
                    {d.onDuty} duty
                  </div>
                </div>
              );
            })}
          </div>

          {/* X-Axis Department Labels */}
          <div className="flex justify-between gap-2 mt-2 px-2 text-[10px] text-[#525252]">
            {departmentData.map((d) => (
              <div
                key={d.department}
                className="flex-1 text-center truncate font-medium hover:text-[#161616] transition-colors"
                title={d.department}
              >
                {d.department.split(' ')[0]}
              </div>
            ))}
          </div>

          {/* Department Legend */}
          <div className="flex flex-wrap gap-2 mt-4 pt-3 border-t border-[#e0e0e0] text-[10px]">
            {departmentData.map((d, idx) => (
              <div key={d.department} className="flex items-center gap-1.5 text-[#525252]">
                <span className="w-2.5 h-2.5 shrink-0" style={{ backgroundColor: BAR_COLORS[idx % BAR_COLORS.length] }} />
                <span>{d.department}:</span>
                <span className="font-mono text-[#161616] font-semibold">{d.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      {/* View Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-[#e0e0e0]">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold text-[#161616] tracking-tight">Reports & Clinical Analytics</h1>
            <span className="text-[11px] font-mono uppercase tracking-wider text-[#0043ce] px-2 py-0.5 bg-[#edf5ff] border border-[#a6c8ff]">
              Sahachara Intelligence
            </span>
          </div>
          <p className="text-xs text-[#525252] mt-0.5">
            Operational KPIs, department workforce distribution, Ayurvedic clinical dosha trends, and INR revenue cycle.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Date Range Selector */}
          <div className="flex bg-white border border-[#e0e0e0] text-xs">
            {(['today', '7days', '30days', 'month', 'year'] as const).map((r) => (
              <button
                key={r}
                onClick={() => setDateRange(r)}
                className={`px-2.5 py-1 text-xs cursor-pointer ${
                  dateRange === r ? 'bg-[#0f62fe] text-white font-medium' : 'text-[#525252] hover:bg-[#f4f4f4]'
                }`}
              >
                {r === 'today' ? 'Today' : r === '7days' ? 'Last 7D' : r === '30days' ? 'Last 30D' : r === 'month' ? 'This Month' : 'This Year'}
              </button>
            ))}
          </div>

          <CarbonButton kind="secondary" size="sm" renderIcon={Download} onClick={handleExportCsv}>
            Export CSV
          </CarbonButton>
        </div>
      </div>

      {/* KPI Topline in INR & Workforce */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
        <div className="p-3 bg-white border border-[#e0e0e0] shadow-2xs">
          <span className="text-[10px] font-mono uppercase text-[#525252] block">Total Invoiced (INR)</span>
          <span className="text-xl font-mono font-semibold text-[#161616] mt-1 block tabular-nums">
            ₹{Math.round(totalInvoicedInr).toLocaleString()}
          </span>
          <span className="text-[10px] text-[#0f62fe] mt-0.5 block">Total patient billings</span>
        </div>

        <div className="p-3 bg-white border border-[#e0e0e0] shadow-2xs">
          <span className="text-[10px] font-mono uppercase text-[#525252] block">Revenue Collected (INR)</span>
          <span className="text-xl font-mono font-semibold text-[#24a148] mt-1 block tabular-nums">
            ₹{Math.round(totalCollectedInr).toLocaleString()}
          </span>
          <span className="text-[10px] text-[#0e6027] mt-0.5 block">Direct cashier collections</span>
        </div>

        <div className="p-3 bg-white border border-[#e0e0e0] shadow-2xs">
          <span className="text-[10px] font-mono uppercase text-[#525252] block">Outstanding Balance (INR)</span>
          <span className="text-xl font-mono font-semibold text-[#da1e28] mt-1 block tabular-nums">
            ₹{Math.round(totalOutstandingInr).toLocaleString()}
          </span>
          <span className="text-[10px] text-[#da1e28] mt-0.5 block">Pending receivables</span>
        </div>

        <div className="p-3 bg-white border border-[#e0e0e0] shadow-2xs">
          <span className="text-[10px] font-mono uppercase text-[#525252] block">Hospital Staff Roster</span>
          <span className="text-xl font-mono font-semibold text-[#0043ce] mt-1 block tabular-nums">
            {totalStaffCount} Staff ({onDutyCount} On Duty)
          </span>
          <span className="text-[10px] text-[#0f62fe] mt-0.5 block">Across {departmentData.length} Departments</span>
        </div>
      </div>

      {/* Category Tabs */}
      <div className="flex border-b border-[#e0e0e0] bg-[#f4f4f4] overflow-x-auto">
        {[
          { id: 'overview', label: 'Operational Overview' },
          { id: 'workforce', label: 'Staff & Department Breakdown' },
          { id: 'ayurvedic', label: 'Ayurvedic Clinical Demographics' },
          { id: 'panchakarma', label: 'Panchakarma Protocol Analytics' },
          { id: 'therapies', label: 'Therapy & Upakrama Volume' },
          { id: 'pharmacy', label: 'Pharmacy Formulary Stock' },
          { id: 'finance', label: 'Financial Revenue & Invoices' }
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveReportCategory(tab.id as any)}
            className={`px-4 py-2.5 text-xs font-medium transition-colors cursor-pointer border-b-2 rounded-none whitespace-nowrap ${
              activeReportCategory === tab.id
                ? 'border-[#0f62fe] text-[#0f62fe] bg-white font-semibold'
                : 'border-transparent text-[#525252] hover:text-[#161616]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Panels */}
      {activeReportCategory === 'overview' && (
        <div className="space-y-4">
          {/* Top Operational Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <CarbonTile title="Patient Admission & EMR Census">
              <div className="space-y-3 text-xs">
                <div className="flex justify-between p-2.5 bg-[#f4f4f4] border border-[#e0e0e0]">
                  <span className="text-[#525252]">Total Registered Patients</span>
                  <span className="font-mono font-semibold text-[#161616]">{patients.length}</span>
                </div>
                <div className="flex justify-between p-2.5 bg-[#f4f4f4] border border-[#e0e0e0]">
                  <span className="text-[#525252]">Current Inpatients in Wards</span>
                  <span className="font-mono font-semibold text-[#0f62fe]">
                    {patients.filter((p) => p.admissionStatus === 'inpatient').length}
                  </span>
                </div>
                <div className="flex justify-between p-2.5 bg-[#f4f4f4] border border-[#e0e0e0]">
                  <span className="text-[#525252]">Acute Triage / ER Intakes</span>
                  <span className="font-mono font-semibold text-[#da1e28]">
                    {patients.filter((p) => p.admissionStatus === 'er').length}
                  </span>
                </div>
                <div className="flex justify-between p-2.5 bg-[#f4f4f4] border border-[#e0e0e0]">
                  <span className="text-[#525252]">Discharged Post Clinical Recovery</span>
                  <span className="font-mono font-semibold text-[#24a148]">
                    {patients.filter((p) => p.admissionStatus === 'discharged').length}
                  </span>
                </div>
              </div>
            </CarbonTile>

            <CarbonTile title="Consultation & Scheduling Efficiency">
              <div className="space-y-3 text-xs">
                <div className="flex justify-between p-2.5 bg-[#f4f4f4] border border-[#e0e0e0]">
                  <span className="text-[#525252]">Scheduled Appointments</span>
                  <span className="font-mono font-semibold text-[#161616]">{appointments.length}</span>
                </div>
                <div className="flex justify-between p-2.5 bg-[#f4f4f4] border border-[#e0e0e0]">
                  <span className="text-[#525252]">Automated Reminders Delivered (SMS/Email)</span>
                  <span className="font-mono font-semibold text-[#24a148]">
                    {appointments.filter((a) => a.reminderSent).length}
                  </span>
                </div>
                <div className="flex justify-between p-2.5 bg-[#f4f4f4] border border-[#e0e0e0]">
                  <span className="text-[#525252]">Completed Consultations</span>
                  <span className="font-mono font-semibold text-[#0f62fe]">
                    {consultations.filter((c) => c.status === 'completed').length}
                  </span>
                </div>
                <div className="flex justify-between p-2.5 bg-[#f4f4f4] border border-[#e0e0e0]">
                  <span className="text-[#525252]">In-Progress Assessments</span>
                  <span className="font-mono font-semibold text-[#b28600]">
                    {consultations.filter((c) => c.status === 'in_progress').length}
                  </span>
                </div>
              </div>
            </CarbonTile>
          </div>

          {/* Department-Based Workforce Breakdown Bar Chart Widget */}
          {renderDepartmentBarChartWidget()}
        </div>
      )}

      {/* Dedicated Workforce & Department Tab */}
      {activeReportCategory === 'workforce' && (
        <div className="space-y-4">
          {/* Main Bar Chart Widget */}
          {renderDepartmentBarChartWidget()}

          {/* Department Workforce Detailed Roster Matrix - Consistent Light Carbon Table */}
          <CarbonTile title="Hospital Department Workforce Matrix & Coverage">
            <div className="overflow-x-auto border border-[#e0e0e0]">
              <table className="w-full text-left text-xs text-[#161616]">
                <thead className="bg-[#f4f4f4] text-[#525252] font-mono uppercase text-[11px] border-b border-[#e0e0e0]">
                  <tr>
                    <th className="p-3">Department Name</th>
                    <th className="p-3">Total Personnel</th>
                    <th className="p-3">Active On Duty</th>
                    <th className="p-3">Floor Coverage %</th>
                    <th className="p-3">Clinical Practitioners</th>
                    <th className="p-3">Roles Represented</th>
                    <th className="p-3">Shift Spread</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e0e0e0] bg-white">
                  {departmentData.map((d, idx) => (
                    <tr key={d.department} className="hover:bg-[#f4f4f4] transition-colors">
                      <td className="p-3 font-medium flex items-center gap-2">
                        <span className="w-2.5 h-2.5 shrink-0" style={{ backgroundColor: BAR_COLORS[idx % BAR_COLORS.length] }} />
                        {d.department}
                      </td>
                      <td className="p-3 font-mono font-semibold text-[#161616]">
                        {d.count} ({d.percentage}%)
                      </td>
                      <td className="p-3 font-mono text-[#24a148] font-medium">
                        {d.onDuty} on duty
                      </td>
                      <td className="p-3 font-mono text-[#525252]">
                        {Math.round((d.onDuty / d.count) * 100)}%
                      </td>
                      <td className="p-3 font-mono text-[#0043ce] font-medium">
                        {d.practitioners} clinicians
                      </td>
                      <td className="p-3">
                        <div className="flex flex-wrap gap-1">
                          {Object.entries(d.roles).map(([rName, rCount]) => (
                            <CarbonTag key={rName} type="blue" size="sm">
                              {rCount} {rName}
                            </CarbonTag>
                          ))}
                        </div>
                      </td>
                      <td className="p-3 text-[#525252]">
                        {Object.entries(d.shifts)
                          .map(([sName, sCount]) => `${sCount} ${sName}`)
                          .join(', ')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CarbonTile>
        </div>
      )}

      {activeReportCategory === 'ayurvedic' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <CarbonTile title="Deha Prakriti (Constitutional Distribution)">
            <div className="space-y-3 text-xs">
              {Object.entries(doshicCounts).map(([constitution, count]) => {
                const pct = Math.round((count / (consultations.length || 1)) * 100);
                return (
                  <div key={constitution}>
                    <div className="flex justify-between text-[11px] mb-1">
                      <span className="text-[#161616] font-medium">{constitution}</span>
                      <span className="font-mono text-[#0f62fe]">{count} patients ({pct}%)</span>
                    </div>
                    <div className="w-full bg-[#f4f4f4] h-2.5 border border-[#e0e0e0]">
                      <div className="bg-[#0f62fe] h-full" style={{ width: `${Math.max(pct, 5)}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </CarbonTile>

          <CarbonTile title="Agni (Digestive Fire) & Metabolic Status">
            <div className="space-y-3 text-xs">
              {Object.entries(agniCounts).map(([type, count]) => {
                const pct = Math.round((count / (consultations.length || 1)) * 100);
                return (
                  <div key={type}>
                    <div className="flex justify-between text-[11px] mb-1">
                      <span className="text-[#161616] font-medium">{type} Agni</span>
                      <span className="font-mono text-[#b28600]">{count} cases ({pct}%)</span>
                    </div>
                    <div className="w-full bg-[#f4f4f4] h-2.5 border border-[#e0e0e0]">
                      <div className="bg-[#f1c21b] h-full" style={{ width: `${Math.max(pct, 5)}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </CarbonTile>
        </div>
      )}

      {activeReportCategory === 'panchakarma' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <CarbonTile title="Classical Protocol Utilization (The 5 Actions)">
            <div className="space-y-3 text-xs">
              {Object.entries(pkProtocols).map(([name, count]) => {
                const pct = Math.round((count / (panchakarma.length || 1)) * 100);
                return (
                  <div key={name}>
                    <div className="flex justify-between text-[11px] mb-1">
                      <span className="text-[#161616] font-medium">{name} Protocol</span>
                      <span className="font-mono text-[#0f62fe]">{count} courses ({pct}%)</span>
                    </div>
                    <div className="w-full bg-[#f4f4f4] h-2.5 border border-[#e0e0e0]">
                      <div className="bg-[#0f62fe] h-full" style={{ width: `${Math.max(pct, 8)}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </CarbonTile>

          <CarbonTile title="Panchakarma Phase Adherence">
            <div className="space-y-2.5 text-xs text-[#161616]">
              <div className="p-3 bg-[#f4f4f4] border border-[#e0e0e0] flex justify-between items-center">
                <span>Purvakarma (Snehana & Swedana Preparation)</span>
                <span className="font-mono text-[#0043ce] font-semibold">
                  {panchakarma.filter((pk) => pk.currentPhase.includes('Purvakarma')).length} Active
                </span>
              </div>
              <div className="p-3 bg-[#f4f4f4] border border-[#e0e0e0] flex justify-between items-center">
                <span>Pradhanakarma (Main Shodhana Procedure)</span>
                <span className="font-mono text-[#b28600] font-semibold">
                  {panchakarma.filter((pk) => pk.currentPhase.includes('Pradhanakarma')).length} Active
                </span>
              </div>
              <div className="p-3 bg-[#f4f4f4] border border-[#e0e0e0] flex justify-between items-center">
                <span>Paschatkarma (Samsarjana Krama Dietary Recovery)</span>
                <span className="font-mono text-[#24a148] font-semibold">
                  {panchakarma.filter((pk) => pk.currentPhase.includes('Paschatkarma')).length} Active
                </span>
              </div>
            </div>
          </CarbonTile>
        </div>
      )}

      {activeReportCategory === 'therapies' && (
        <div className="space-y-3">
          <CarbonTile title="Therapy Execution & Completion Matrix">
            <div className="overflow-x-auto border border-[#e0e0e0]">
              <table className="w-full text-left text-xs text-[#161616]">
                <thead className="bg-[#f4f4f4] text-[#525252] font-mono uppercase text-[11px] border-b border-[#e0e0e0]">
                  <tr>
                    <th className="p-3">Plan ID</th>
                    <th className="p-3">Therapy Procedure</th>
                    <th className="p-3">Patient</th>
                    <th className="p-3">Formulation</th>
                    <th className="p-3">Sessions Progress</th>
                    <th className="p-3">Therapist</th>
                    <th className="p-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e0e0e0] bg-white">
                  {treatments.map((t) => (
                    <tr key={t.id} className="hover:bg-[#f4f4f4] transition-colors">
                      <td className="p-3 font-mono font-semibold text-[#0f62fe]">{t.planNumber}</td>
                      <td className="p-3 font-medium">{t.therapyType.split('(')[0]}</td>
                      <td className="p-3">{t.patientName}</td>
                      <td className="p-3 text-[#525252]">{t.oilOrFormulation}</td>
                      <td className="p-3 font-mono font-medium">
                        {t.completedSessions}/{t.totalSessions} (
                        {Math.round((t.completedSessions / (t.totalSessions || 1)) * 100)}%)
                      </td>
                      <td className="p-3 text-[#525252]">{t.assignedTherapist}</td>
                      <td className="p-3">
                        <CarbonTag type={t.status === 'completed' ? 'green' : 'purple'} size="sm">
                          {t.status.toUpperCase()}
                        </CarbonTag>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CarbonTile>
        </div>
      )}

      {activeReportCategory === 'pharmacy' && (
        <div className="space-y-3">
          <CarbonTile title="Formulary Stock & Reorder Alerts">
            <div className="overflow-x-auto border border-[#e0e0e0]">
              <table className="w-full text-left text-xs text-[#161616]">
                <thead className="bg-[#f4f4f4] text-[#525252] font-mono uppercase text-[11px] border-b border-[#e0e0e0]">
                  <tr>
                    <th className="p-3">Medicine Name</th>
                    <th className="p-3">Category</th>
                    <th className="p-3">Form</th>
                    <th className="p-3">Available Stock</th>
                    <th className="p-3">Min Threshold</th>
                    <th className="p-3">Unit Price (INR)</th>
                    <th className="p-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e0e0e0] bg-white">
                  {medicines.map((m) => (
                    <tr key={m.id} className="hover:bg-[#f4f4f4] transition-colors">
                      <td className="p-3 font-medium">{m.drugName}</td>
                      <td className="p-3 text-[#525252]">{m.category}</td>
                      <td className="p-3">{m.form}</td>
                      <td className="p-3 font-mono font-semibold text-[#161616]">
                        {m.stockQuantity} {m.unit}
                      </td>
                      <td className="p-3 font-mono text-[#525252]">{m.minThreshold}</td>
                      <td className="p-3 font-mono text-[#0043ce]">₹{m.unitPrice}</td>
                      <td className="p-3">
                        <CarbonTag
                          type={m.status === 'in_stock' ? 'green' : m.status === 'low_stock' ? 'yellow' : 'red'}
                          size="sm"
                        >
                          {m.status.toUpperCase()}
                        </CarbonTag>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CarbonTile>
        </div>
      )}

      {activeReportCategory === 'finance' && (
        <div className="space-y-3">
          <CarbonTile title="Inpatient & Clinical Billing Records (INR ₹)">
            <div className="overflow-x-auto border border-[#e0e0e0]">
              <table className="w-full text-left text-xs text-[#161616]">
                <thead className="bg-[#f4f4f4] text-[#525252] font-mono uppercase text-[11px] border-b border-[#e0e0e0]">
                  <tr>
                    <th className="p-3">Invoice #</th>
                    <th className="p-3">Patient</th>
                    <th className="p-3">MRN</th>
                    <th className="p-3">Total Billed (₹)</th>
                    <th className="p-3">Amount Received (₹)</th>
                    <th className="p-3">Balance Due (₹)</th>
                    <th className="p-3">Payment Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e0e0e0] bg-white">
                  {invoices.map((inv) => (
                    <tr key={inv.id} className="hover:bg-[#f4f4f4] transition-colors">
                      <td className="p-3 font-mono font-semibold text-[#0f62fe]">{inv.invoiceNumber}</td>
                      <td className="p-3 font-medium">{inv.patientName}</td>
                      <td className="p-3 font-mono text-[#525252]">{inv.mrn}</td>
                      <td className="p-3 font-mono font-semibold text-[#161616]">
                        ₹{Math.round(inv.totalAmount).toLocaleString()}
                      </td>
                      <td className="p-3 font-mono text-[#24a148] font-medium">
                        ₹{inv.paymentStatus === 'paid' ? Math.round(inv.totalAmount).toLocaleString() : inv.paymentStatus === 'partial' ? Math.round(inv.totalAmount * 0.5).toLocaleString() : '0'}
                      </td>
                      <td className="p-3 font-mono text-[#da1e28]">
                        ₹{inv.paymentStatus === 'paid' ? '0' : Math.round(inv.copayPatient || inv.totalAmount).toLocaleString()}
                      </td>
                      <td className="p-3">
                        <CarbonTag
                          type={inv.paymentStatus === 'paid' ? 'green' : inv.paymentStatus === 'partial' ? 'yellow' : 'red'}
                          size="sm"
                        >
                          {inv.paymentStatus.toUpperCase()}
                        </CarbonTag>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CarbonTile>
        </div>
      )}
    </div>
  );
};
