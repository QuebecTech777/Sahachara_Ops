import React, { useState, useMemo } from 'react';
import {
  Activity,
  Heart,
  Wind,
  Thermometer,
  Calendar,
  Clock,
  Download,
  AlertTriangle,
  CheckCircle2,
  TrendingDown,
  TrendingUp,
  Search,
  Filter,
  UserCheck
} from 'lucide-react';
import { Patient, Vitals } from '../types/hospital';
import { CarbonTag, CarbonTagType } from './carbon/CarbonTag';
import { CarbonButton } from './carbon/CarbonButton';
import { CarbonTabs } from './carbon/CarbonTabs';

export interface VitalsTimeSeriesRow {
  id: string;
  timestamp: string;
  recordedAtFormatted: string;
  relativeTime: string;
  bpSystolic: number;
  bpDiastolic: number;
  bpStatus: { label: string; tagType: CarbonTagType };
  heartRate: number;
  hrStatus: { label: string; tagType: CarbonTagType };
  spo2: number;
  spo2Status: { label: string; tagType: CarbonTagType };
  temperature: number;
  tempStatus: { label: string; tagType: CarbonTagType };
  respRate: number;
  gcs: number;
  recordedBy: string;
  location: string;
  notes: string;
  isAbnormal: boolean;
}

export interface VitalHistorySummaryProps {
  patient: Patient;
  historicalVitals?: Vitals[];
  className?: string;
  compact?: boolean;
  onExportCsv?: () => void;
}

export const VitalHistorySummary: React.FC<VitalHistorySummaryProps> = ({
  patient,
  historicalVitals,
  className = '',
  compact = false,
  onExportCsv
}) => {
  const [filterMode, setFilterMode] = useState<'all' | 'abnormal' | 'bp' | 'spo2'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<'timestamp' | 'bpSystolic' | 'heartRate' | 'spo2'>('timestamp');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  // Generate or parse chronological time-series rows
  const timeSeriesRows: VitalsTimeSeriesRow[] = useMemo(() => {
    // If historicalVitals array is provided and not empty, use it
    if (historicalVitals && historicalVitals.length > 0) {
      return historicalVitals.map((v, idx) => {
        const sys = v.bpSystolic;
        const dia = v.bpDiastolic;
        const hr = v.heartRate;
        const o2 = v.spo2;
        const temp = v.temperature;

        const isAbnormal =
          sys >= 140 || sys < 90 || dia >= 90 || dia < 60 || hr > 100 || hr < 60 || o2 < 95 || temp > 37.8;

        return {
          id: `vital-${idx}-${v.recordedAt}`,
          timestamp: v.recordedAt,
          recordedAtFormatted: new Date(v.recordedAt).toLocaleString(undefined, {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          }),
          relativeTime: idx === 0 ? 'Latest (Today)' : `Log -${idx}`,
          bpSystolic: sys,
          bpDiastolic: dia,
          bpStatus: getBPStatus(sys, dia),
          heartRate: hr,
          hrStatus: getHRStatus(hr),
          spo2: o2,
          spo2Status: getSpO2Status(o2),
          temperature: temp,
          tempStatus: getTempStatus(temp),
          respRate: v.respRate || 16,
          gcs: v.gcs || 15,
          recordedBy: 'Clinical Triage / Telemetry',
          location: patient.currentWard ? `${patient.currentWard} ${patient.currentBed || ''}` : 'Outpatient Desk',
          notes: isAbnormal ? 'Observation noted for attending physician' : 'Parameters within clinical goal',
          isAbnormal
        };
      });
    }

    // If latest intake vitals exist, display the authentic intake reading
    if (patient.latestVitals) {
      const v = patient.latestVitals;
      const sys = v.bpSystolic;
      const dia = v.bpDiastolic;
      const hr = v.heartRate;
      const o2 = v.spo2;
      const temp = v.temperature;
      const isAbnormal =
        sys >= 140 || sys < 90 || dia >= 90 || dia < 60 || hr > 100 || hr < 60 || o2 < 95 || temp > 37.8;
      const recDate = v.recordedAt ? new Date(v.recordedAt) : new Date();

      return [
        {
          id: `vital-latest-${recDate.getTime()}`,
          timestamp: recDate.toISOString(),
          recordedAtFormatted: recDate.toLocaleString(undefined, {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          }),
          relativeTime: 'Intake Reading',
          bpSystolic: sys,
          bpDiastolic: dia,
          bpStatus: getBPStatus(sys, dia),
          heartRate: hr,
          hrStatus: getHRStatus(hr),
          spo2: o2,
          spo2Status: getSpO2Status(o2),
          temperature: temp,
          tempStatus: getTempStatus(temp),
          respRate: v.respRate || 16,
          gcs: v.gcs || 15,
          recordedBy: 'Clinical Triage / Intake',
          location: patient.currentWard ? `${patient.currentWard} ${patient.currentBed || ''}` : 'Outpatient Desk',
          notes: isAbnormal ? 'Observation noted for attending physician' : 'Parameters within clinical goal',
          isAbnormal
        }
      ];
    }

    return [];
  }, [patient, historicalVitals]);

  // Filtering & Search
  const filteredRows = useMemo(() => {
    let result = [...timeSeriesRows];

    // Filter modes
    if (filterMode === 'abnormal') {
      result = result.filter((r) => r.isAbnormal);
    } else if (filterMode === 'bp') {
      result = result.filter((r) => r.bpSystolic >= 130 || r.bpDiastolic >= 85);
    } else if (filterMode === 'spo2') {
      result = result.filter((r) => r.spo2 < 96);
    }

    // Text search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(
        (r) =>
          r.recordedAtFormatted.toLowerCase().includes(q) ||
          r.recordedBy.toLowerCase().includes(q) ||
          r.location.toLowerCase().includes(q) ||
          r.notes.toLowerCase().includes(q) ||
          `${r.bpSystolic}/${r.bpDiastolic}`.includes(q)
      );
    }

    // Sort
    result.sort((a, b) => {
      let comparison = 0;
      if (sortField === 'timestamp') {
        comparison = new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
      } else {
        comparison = a[sortField] - b[sortField];
      }
      return sortDirection === 'asc' ? comparison : -comparison;
    });

    return result;
  }, [timeSeriesRows, filterMode, searchQuery, sortField, sortDirection]);

  // Export CSV Handler for this patient's vitals
  const handleExportPatientVitalsCsv = () => {
    if (onExportCsv) {
      onExportCsv();
      return;
    }

    const headers = [
      'Timestamp (ISO)',
      'Date & Time',
      'Relative Log Period',
      'Systolic BP (mmHg)',
      'Diastolic BP (mmHg)',
      'BP Classification',
      'Heart Rate (bpm)',
      'Cardiac Rhythm',
      'SpO2 Saturation (%)',
      'SpO2 Status',
      'Temperature (°C)',
      'Temperature (°F)',
      'Respiratory Rate (/min)',
      'GCS Score (3-15)',
      'Recorded By',
      'Clinical Location',
      'Clinical Notes',
      'Abnormal Flag'
    ];

    const escapeCsv = (val: any) => {
      if (val === null || val === undefined) return '""';
      const str = String(val).replace(/"/g, '""');
      return `"${str}"`;
    };

    const csvLines = [
      `# SAHACHARA OS CLINICAL INFORMATION SYSTEM - LONGITUDINAL VITALS AUDIT`,
      `# Patient MRN: ${patient.mrn}`,
      `# Patient Name: ${patient.firstName} ${patient.lastName}`,
      `# Export Date: ${new Date().toISOString()}`,
      `# Total Serial Points: ${timeSeriesRows.length}`,
      headers.join(',')
    ];

    timeSeriesRows.forEach((row) => {
      const tempF = ((row.temperature * 9) / 5 + 32).toFixed(1);
      const rowValues = [
        escapeCsv(row.timestamp),
        escapeCsv(row.recordedAtFormatted),
        escapeCsv(row.relativeTime),
        row.bpSystolic,
        row.bpDiastolic,
        escapeCsv(row.bpStatus.label),
        row.heartRate,
        escapeCsv(row.hrStatus.label),
        row.spo2,
        escapeCsv(row.spo2Status.label),
        row.temperature,
        tempF,
        row.respRate,
        row.gcs,
        escapeCsv(row.recordedBy),
        escapeCsv(row.location),
        escapeCsv(row.notes),
        row.isAbnormal ? '"YES"' : '"NO"'
      ];
      csvLines.push(rowValues.join(','));
    });

    const csvContent = csvLines.join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const safeName = `${patient.firstName}_${patient.lastName}`.replace(/[^a-zA-Z0-9_-]/g, '_');
    link.download = `Vitals_TimeSeries_${patient.mrn}_${safeName}_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleSortToggle = (field: typeof sortField) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  return (
    <div className={`border border-[#e0e0e0] bg-white ${className}`}>
      {/* Component Header with Carbon Title Bar & Action */}
      <div className="p-3 sm:p-4 bg-white border-b border-[#e0e0e0] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="text-[11px] font-mono uppercase tracking-[0.32px] text-[#525252] flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5 text-[#0f62fe]" />
            <span>Time-Series Vitals Summary & Log</span>
          </div>
          <h4 className="text-[14px] font-semibold text-[#161616] tracking-tight mt-0.5">
            Longitudinal Physiological Record &bull; {patient.mrn}
          </h4>
        </div>

        <div className="flex items-center gap-2">
          <CarbonButton
            kind="ghost"
            size="sm"
            renderIcon={Download}
            onClick={handleExportPatientVitalsCsv}
            title="Download CSV table of vitals readings"
          >
            Export Vitals CSV
          </CarbonButton>
        </div>
      </div>

      {/* Control Bar: Filter Tabs & Search */}
      <div className="px-3 py-2 bg-[#f4f4f4] border-b border-[#e0e0e0] flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        {/* Metric Quick Filters */}
        <div className="flex items-center gap-1 text-[11px]">
          <button
            onClick={() => setFilterMode('all')}
            className={`px-2.5 py-1 font-medium transition-colors ${
              filterMode === 'all'
                ? 'bg-[#161616] text-white'
                : 'bg-white text-[#525252] hover:text-[#161616] border border-[#e0e0e0]'
            }`}
          >
            All Logs ({timeSeriesRows.length})
          </button>
          <button
            onClick={() => setFilterMode('abnormal')}
            className={`px-2.5 py-1 font-medium transition-colors ${
              filterMode === 'abnormal'
                ? 'bg-[#ba1b23] text-white'
                : 'bg-white text-[#525252] hover:text-[#161616] border border-[#e0e0e0]'
            }`}
          >
            Abnormal / Alerts ({timeSeriesRows.filter((r) => r.isAbnormal).length})
          </button>
          <button
            onClick={() => setFilterMode('bp')}
            className={`px-2.5 py-1 font-medium transition-colors ${
              filterMode === 'bp'
                ? 'bg-[#0f62fe] text-white'
                : 'bg-white text-[#525252] hover:text-[#161616] border border-[#e0e0e0]'
            }`}
          >
            Elevated BP
          </button>
          <button
            onClick={() => setFilterMode('spo2')}
            className={`px-2.5 py-1 font-medium transition-colors ${
              filterMode === 'spo2'
                ? 'bg-[#0072c3] text-white'
                : 'bg-white text-[#525252] hover:text-[#161616] border border-[#e0e0e0]'
            }`}
          >
            SpO2 &lt; 96%
          </button>
        </div>

        {/* Quick Search */}
        <div className="relative min-w-[180px]">
          <Search className="w-3.5 h-3.5 text-[#525252] absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search date, station, notes..."
            className="w-full pl-8 pr-2.5 py-1 bg-white border border-[#e0e0e0] text-xs text-[#161616] focus:border-[#0f62fe] outline-none"
          />
        </div>
      </div>

      {/* Unified Carbon Light-Gray Header Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            {/* Unified Light-Gray Header Styling (#f4f4f4) */}
            <tr className="bg-[#f4f4f4] border-b border-[#e0e0e0] text-[#161616] text-[11px] font-semibold uppercase tracking-wider select-none">
              <th
                onClick={() => handleSortToggle('timestamp')}
                className="py-2.5 px-3 cursor-pointer hover:bg-[#e0e0e0] transition-colors"
                style={{ width: '180px' }}
              >
                <div className="flex items-center gap-1">
                  <span>Timestamp & Log</span>
                  {sortField === 'timestamp' && (
                    <span className="text-[#0f62fe] font-mono text-xs">
                      {sortDirection === 'asc' ? '▲' : '▼'}
                    </span>
                  )}
                </div>
              </th>
              <th
                onClick={() => handleSortToggle('bpSystolic')}
                className="py-2.5 px-3 cursor-pointer hover:bg-[#e0e0e0] transition-colors"
              >
                <div className="flex items-center gap-1">
                  <span>Blood Pressure</span>
                  {sortField === 'bpSystolic' && (
                    <span className="text-[#0f62fe] font-mono text-xs">
                      {sortDirection === 'asc' ? '▲' : '▼'}
                    </span>
                  )}
                </div>
              </th>
              <th
                onClick={() => handleSortToggle('heartRate')}
                className="py-2.5 px-3 cursor-pointer hover:bg-[#e0e0e0] transition-colors"
              >
                <div className="flex items-center gap-1">
                  <span>Heart Rate</span>
                  {sortField === 'heartRate' && (
                    <span className="text-[#0f62fe] font-mono text-xs">
                      {sortDirection === 'asc' ? '▲' : '▼'}
                    </span>
                  )}
                </div>
              </th>
              <th
                onClick={() => handleSortToggle('spo2')}
                className="py-2.5 px-3 cursor-pointer hover:bg-[#e0e0e0] transition-colors"
              >
                <div className="flex items-center gap-1">
                  <span>SpO2 Sat</span>
                  {sortField === 'spo2' && (
                    <span className="text-[#0f62fe] font-mono text-xs">
                      {sortDirection === 'asc' ? '▲' : '▼'}
                    </span>
                  )}
                </div>
              </th>
              <th className="py-2.5 px-3">Temp / Resp</th>
              <th className="py-2.5 px-3">Station & Observer</th>
              <th className="py-2.5 px-3">Clinical Evaluation</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#e0e0e0] text-xs">
            {filteredRows.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-8 text-center text-[#525252]">
                  No vitals entries match the selected filter.
                </td>
              </tr>
            ) : (
              filteredRows.map((row) => (
                <tr
                  key={row.id}
                  className={`transition-colors hover:bg-[#f4f4f4] ${
                    row.isAbnormal ? 'bg-[#fff8f8]' : 'bg-white'
                  }`}
                >
                  {/* Timestamp & Relative Period */}
                  <td className="py-2.5 px-3 whitespace-nowrap">
                    <div className="font-mono text-[11px] font-semibold text-[#161616]">
                      {row.recordedAtFormatted}
                    </div>
                    <div className="text-[10px] text-[#525252] flex items-center gap-1 mt-0.5">
                      <Clock className="w-3 h-3 text-[#525252]" />
                      <span>{row.relativeTime}</span>
                    </div>
                  </td>

                  {/* Blood Pressure (Sys/Dia) */}
                  <td className="py-2.5 px-3 whitespace-nowrap">
                    <div className="font-mono text-[13px] font-bold text-[#161616]">
                      {row.bpSystolic} / {row.bpDiastolic}{' '}
                      <span className="text-[10px] font-normal text-[#525252]">mmHg</span>
                    </div>
                    <div className="mt-0.5">
                      <CarbonTag type={row.bpStatus.tagType} size="sm">
                        {row.bpStatus.label}
                      </CarbonTag>
                    </div>
                  </td>

                  {/* Heart Rate */}
                  <td className="py-2.5 px-3 whitespace-nowrap">
                    <div className="font-mono text-[13px] font-bold text-[#161616]">
                      {row.heartRate}{' '}
                      <span className="text-[10px] font-normal text-[#525252]">bpm</span>
                    </div>
                    <div className="mt-0.5">
                      <CarbonTag type={row.hrStatus.tagType} size="sm">
                        {row.hrStatus.label}
                      </CarbonTag>
                    </div>
                  </td>

                  {/* SpO2 Saturation */}
                  <td className="py-2.5 px-3 whitespace-nowrap">
                    <div className="font-mono text-[13px] font-bold text-[#161616]">
                      {row.spo2}%
                    </div>
                    <div className="mt-0.5">
                      <CarbonTag type={row.spo2Status.tagType} size="sm">
                        {row.spo2Status.label}
                      </CarbonTag>
                    </div>
                  </td>

                  {/* Temperature & Resp */}
                  <td className="py-2.5 px-3 whitespace-nowrap">
                    <div className="font-mono text-[12px] text-[#161616]">
                      {row.temperature}°C{' '}
                      <span className="text-[#525252] text-[10px]">
                        ({((row.temperature * 9) / 5 + 32).toFixed(1)}°F)
                      </span>
                    </div>
                    <div className="text-[11px] text-[#525252] font-mono mt-0.5">
                      RR: {row.respRate} /min &bull; GCS: {row.gcs}/15
                    </div>
                  </td>

                  {/* Observer & Location */}
                  <td className="py-2.5 px-3">
                    <div className="font-medium text-[#161616] text-[11px]">
                      {row.recordedBy}
                    </div>
                    <div className="text-[10px] text-[#525252] font-mono">
                      {row.location}
                    </div>
                  </td>

                  {/* Clinical Evaluation / Notes */}
                  <td className="py-2.5 px-3 max-w-[200px]">
                    <span className="text-[11px] text-[#525252] leading-tight block line-clamp-2">
                      {row.notes}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Footer Summary Strip */}
      <div className="px-3 py-2 bg-[#f4f4f4] border-t border-[#e0e0e0] flex flex-col sm:flex-row sm:items-center justify-between text-[11px] text-[#525252] gap-1">
        <div className="flex items-center gap-2">
          <span>Displaying <strong>{filteredRows.length}</strong> time-series observations</span>
          &bull;
          <span className="font-mono text-[#0f62fe]">AHA / EMR Telemetry Standards</span>
        </div>
        <div>
          <span>Target Range: 120/80 mmHg &bull; 60-100 bpm &bull; &ge;95% SpO2</span>
        </div>
      </div>
    </div>
  );
};

// Helper clinical classification functions
function getBPStatus(sys: number, dia: number): { label: string; tagType: CarbonTagType } {
  if (sys < 90 || dia < 60) return { label: 'HYPOTENSIVE', tagType: 'warm-gray' };
  if (sys < 120 && dia < 80) return { label: 'NORMAL BP', tagType: 'green' };
  if (sys <= 129 && dia < 80) return { label: 'ELEVATED', tagType: 'warm-gray' };
  if (sys <= 139 || dia <= 89) return { label: 'STAGE 1 HTN', tagType: 'red' };
  return { label: 'STAGE 2 HTN', tagType: 'red' };
}

function getHRStatus(hr: number): { label: string; tagType: CarbonTagType } {
  if (hr < 60) return { label: 'BRADYCARDIA', tagType: 'warm-gray' };
  if (hr <= 100) return { label: 'NORMAL SINUS', tagType: 'green' };
  return { label: 'TACHYCARDIA', tagType: 'red' };
}

function getSpO2Status(o2: number): { label: string; tagType: CarbonTagType } {
  if (o2 >= 96) return { label: 'OPTIMAL', tagType: 'green' };
  if (o2 >= 92) return { label: 'ACCEPTABLE', tagType: 'teal' };
  return { label: 'HYPOXIC ALERT', tagType: 'red' };
}

function getTempStatus(temp: number): { label: string; tagType: CarbonTagType } {
  if (temp <= 37.5) return { label: 'AFEBRILE', tagType: 'green' };
  if (temp <= 38.0) return { label: 'LOW GRADE', tagType: 'warm-gray' };
  return { label: 'FEBRILE', tagType: 'red' };
}
