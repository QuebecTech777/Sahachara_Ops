import React, { useState, useMemo } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine
} from 'recharts';
import { Activity, Heart, Wind, ShieldAlert, Clock, TrendingUp } from 'lucide-react';
import { Patient, Vitals } from '../../types/hospital';
import { CarbonTag } from '../carbon/CarbonTag';

interface VitalSignsChartProps {
  patient: Patient;
  historicalVitals?: Vitals[];
}

export const VitalSignsChart: React.FC<VitalSignsChartProps> = ({
  patient,
  historicalVitals
}) => {
  const [activeMetric, setActiveMetric] = useState<'all' | 'bp' | 'hr' | 'spo2'>('all');

  // Prepare chronological vitals data points
  const chartData = useMemo(() => {
    const vitalsList = (historicalVitals && historicalVitals.length > 0)
      ? historicalVitals
      : (patient.vitalsHistory && patient.vitalsHistory.length > 0)
      ? patient.vitalsHistory
      : patient.latestVitals
      ? [patient.latestVitals]
      : [];

    return vitalsList.map((v) => ({
      time: new Date(v.recordedAt).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      }),
      systolic: v.bpSystolic,
      diastolic: v.bpDiastolic,
      heartRate: v.heartRate,
      spo2: v.spo2,
      temperature: v.temperature
    }));
  }, [patient, historicalVitals]);

  const latest = patient.latestVitals || (historicalVitals && historicalVitals.length > 0 ? historicalVitals[historicalVitals.length - 1] : null);

  const getBpStatus = (sys: number, dia: number) => {
    if (sys >= 140 || dia >= 90) return { label: 'STAGE 2 HTN', type: 'red' as const };
    if (sys >= 130 || dia >= 85) return { label: 'STAGE 1 HTN', type: 'warm-gray' as const };
    if (sys >= 120 && dia < 80) return { label: 'ELEVATED', type: 'warm-gray' as const };
    return { label: 'NORMAL BP', type: 'green' as const };
  };

  const getHrStatus = (hr: number) => {
    if (hr > 100) return { label: 'TACHYCARDIA', type: 'red' as const };
    if (hr < 60) return { label: 'BRADYCARDIA', type: 'warm-gray' as const };
    return { label: 'NORMAL RHYTHM', type: 'green' as const };
  };

  const getSpo2Status = (o2: number) => {
    if (o2 < 93) return { label: 'HYPOXIA WARNING', type: 'red' as const };
    if (o2 < 95) return { label: 'BORDERLINE', type: 'warm-gray' as const };
    return { label: 'OPTIMAL SpO2', type: 'green' as const };
  };

  const bpStatus = latest ? getBpStatus(latest.bpSystolic, latest.bpDiastolic) : null;
  const hrStatus = latest ? getHrStatus(latest.heartRate) : null;
  const spo2Status = latest ? getSpo2Status(latest.spo2) : null;

  return (
    <div className="w-full bg-white border border-[#e0e0e0] shadow-2xs font-sans">
      {/* Chart Section Header */}
      <div className="p-3 border-b border-[#e0e0e0] flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-[#0f62fe]/10 border border-[#0f62fe]/30 flex items-center justify-center shrink-0">
            <Activity className="w-4 h-4 text-[#0f62fe]" />
          </div>
          <div>
            <h4 className="font-semibold text-xs text-[#161616] flex items-center gap-1.5">
              <span>Longitudinal Vital Signs Trend</span>
              <span className="font-mono text-[10px] text-[#525252] font-normal">
                (7-Point Clinical Telemetry)
              </span>
            </h4>
            <span className="text-[10px] text-[#525252] block">
              Blood Pressure, Heart Rate & Oxygen Saturation tracking
            </span>
          </div>
        </div>

        {/* Metric Selector Tabs */}
        <div className="flex items-center gap-1 bg-[#f4f4f4] p-0.5 border border-[#e0e0e0]">
          {(
            [
              { id: 'all', label: 'Overview' },
              { id: 'bp', label: 'Blood Pressure' },
              { id: 'hr', label: 'Heart Rate' },
              { id: 'spo2', label: 'SpO2 Oxygen' }
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveMetric(tab.id)}
              className={`px-2.5 py-1 text-[11px] font-medium transition-colors cursor-pointer rounded-none ${
                activeMetric === tab.id
                  ? 'bg-white text-[#0f62fe] shadow-2xs font-semibold'
                  : 'text-[#525252] hover:text-[#161616]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Real-time Telemetry Summary Bar */}
      <div className="grid grid-cols-3 divide-x divide-[#e0e0e0] border-b border-[#e0e0e0] bg-[#fcfcfc] text-xs">
        {/* BP */}
        <div className="p-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono uppercase text-[#525252]">Blood Pressure</span>
            <CarbonTag type={bpStatus ? bpStatus.type : 'warm-gray'} size="sm">
              {bpStatus ? bpStatus.label : 'UNRECORDED'}
            </CarbonTag>
          </div>
          <div className="font-mono text-base font-semibold text-[#161616] mt-0.5">
            {latest ? `${latest.bpSystolic}/${latest.bpDiastolic}` : '— / —'}{' '}
            <span className="text-[10px] font-normal text-[#525252]">mmHg</span>
          </div>
        </div>

        {/* Pulse */}
        <div className="p-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono uppercase text-[#525252]">Pulse / HR</span>
            <CarbonTag type={hrStatus ? hrStatus.type : 'warm-gray'} size="sm">
              {hrStatus ? hrStatus.label : 'UNRECORDED'}
            </CarbonTag>
          </div>
          <div className="font-mono text-base font-semibold text-[#161616] mt-0.5">
            {latest ? latest.heartRate : '—'}{' '}
            <span className="text-[10px] font-normal text-[#525252]">bpm</span>
          </div>
        </div>

        {/* SpO2 */}
        <div className="p-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono uppercase text-[#525252]">SpO2 Saturation</span>
            <CarbonTag type={spo2Status ? spo2Status.type : 'warm-gray'} size="sm">
              {spo2Status ? spo2Status.label : 'UNRECORDED'}
            </CarbonTag>
          </div>
          <div className="font-mono text-base font-semibold text-[#161616] mt-0.5">
            {latest ? `${latest.spo2}%` : '— %'}{' '}
            <span className="text-[10px] font-normal text-[#525252]">Room Air</span>
          </div>
        </div>
      </div>

      {/* Recharts Canvas Container */}
      <div className="p-3 pt-4">
        {chartData.length === 0 ? (
          <div className="h-60 w-full flex flex-col items-center justify-center border border-dashed border-[#e0e0e0] bg-[#fafafa] text-[#6f6f6f]">
            <Activity className="w-8 h-8 text-[#8d8d8d] mb-2 stroke-1" />
            <p className="text-xs font-semibold text-[#161616]">No Clinical Vital History Recorded</p>
            <p className="text-[11px] text-[#525252] mt-0.5">Record intake vitals during triage or consultation to populate telemetry trend lines.</p>
          </div>
        ) : (
        <div className="h-60 w-full min-w-0">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
              <CartesianGrid stroke="#e0e0e0" strokeDasharray="3 3" vertical={false} />
              
              <XAxis
                dataKey="time"
                tick={{ fontSize: 10, fill: '#525252' }}
                stroke="#c6c6c6"
                tickLine={false}
              />
              
              {/* Y-Axis: Left for BP / Heart Rate / SpO2 single metric */}
              <YAxis
                yAxisId="left"
                domain={
                  activeMetric === 'hr'
                    ? [40, 130]
                    : activeMetric === 'spo2'
                    ? [85, 100]
                    : [50, 170]
                }
                tick={{ fontSize: 10, fill: activeMetric === 'spo2' ? '#009d9a' : '#525252' }}
                stroke="#c6c6c6"
                tickLine={false}
                unit={activeMetric === 'spo2' ? '%' : undefined}
              />

              {/* Y-Axis: Right for SpO2 % only when viewing combined overview */}
              {activeMetric === 'all' && (
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  domain={[88, 100]}
                  tick={{ fontSize: 10, fill: '#009d9a' }}
                  stroke="#c6c6c6"
                  tickLine={false}
                  unit="%"
                />
              )}

              {/* Reference Lines */}
              {activeMetric === 'bp' && (
                <>
                  <ReferenceLine
                    yAxisId="left"
                    y={120}
                    label={{ value: 'Normal Sys (120)', fill: '#0f62fe', fontSize: 9 }}
                    stroke="#0f62fe"
                    strokeDasharray="4 4"
                  />
                  <ReferenceLine
                    yAxisId="left"
                    y={80}
                    label={{ value: 'Normal Dia (80)', fill: '#8a3ffc', fontSize: 9 }}
                    stroke="#8a3ffc"
                    strokeDasharray="4 4"
                  />
                </>
              )}

              {activeMetric === 'spo2' && (
                <ReferenceLine
                  yAxisId="left"
                  y={95}
                  label={{ value: 'Min Normal (95%)', fill: '#da1e28', fontSize: 9 }}
                  stroke="#da1e28"
                  strokeDasharray="4 4"
                />
              )}

              <Tooltip
                contentStyle={{
                  backgroundColor: '#ffffff',
                  border: '1px solid #e0e0e0',
                  borderRadius: 0,
                  fontSize: '11px',
                  boxShadow: '0 2px 6px rgba(0,0,0,0.1)'
                }}
                labelStyle={{ fontWeight: 600, color: '#161616', marginBottom: '4px' }}
              />

              <Legend
                wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }}
                iconType="plainline"
              />

              {/* Systolic BP Line (Carbon Blue) */}
              {(activeMetric === 'all' || activeMetric === 'bp') && (
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="systolic"
                  name="Systolic BP (mmHg)"
                  stroke="#0f62fe"
                  strokeWidth={2}
                  dot={{ r: 3, fill: '#0f62fe' }}
                  activeDot={{ r: 5 }}
                />
              )}

              {/* Diastolic BP Line (Carbon Purple) */}
              {(activeMetric === 'all' || activeMetric === 'bp') && (
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="diastolic"
                  name="Diastolic BP (mmHg)"
                  stroke="#8a3ffc"
                  strokeWidth={2}
                  dot={{ r: 3, fill: '#8a3ffc' }}
                  activeDot={{ r: 5 }}
                />
              )}

              {/* Heart Rate Line (Carbon Red) */}
              {(activeMetric === 'all' || activeMetric === 'hr') && (
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="heartRate"
                  name="Heart Rate (bpm)"
                  stroke="#da1e28"
                  strokeWidth={2}
                  dot={{ r: 3, fill: '#da1e28' }}
                  activeDot={{ r: 5 }}
                />
              )}

              {/* SpO2 Line (Carbon Teal) */}
              {(activeMetric === 'all' || activeMetric === 'spo2') && (
                <Line
                  yAxisId={activeMetric === 'all' ? 'right' : 'left'}
                  type="monotone"
                  dataKey="spo2"
                  name="SpO2 Saturation (%)"
                  stroke="#009d9a"
                  strokeWidth={2}
                  strokeDasharray={activeMetric === 'all' ? '4 2' : undefined}
                  dot={{ r: 3, fill: '#009d9a' }}
                  activeDot={{ r: 5 }}
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
        )}
      </div>
    </div>
  );
};
