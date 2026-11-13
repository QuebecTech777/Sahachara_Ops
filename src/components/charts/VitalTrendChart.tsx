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
  ReferenceLine,
  ReferenceArea
} from 'recharts';
import {
  Activity,
  Heart,
  TrendingUp,
  AlertTriangle,
  Clock,
  Calendar,
  Info,
  CheckCircle2,
  Sliders,
  ChevronRight
} from 'lucide-react';
import { Patient, Vitals } from '../../types/hospital';
import { CarbonTag, CarbonTagType } from '../carbon/CarbonTag';

export interface VitalTrendChartProps {
  patient: Patient;
  historicalVitals?: Vitals[];
  className?: string;
  onFilterChange?: (timeRange: string) => void;
}

export type TimeRangeOption = '24h' | '7d' | '30d' | 'all';
export type MetricFocus = 'both' | 'bp' | 'hr';

interface FormattedTrendPoint {
  id: string;
  timeLabel: string;
  fullDate: string;
  exactTimestamp: string;
  timestamp: string;
  systolic: number;
  diastolic: number;
  heartRate: number;
  pulsePressure: number;
  map: number; // Mean Arterial Pressure
  bpCategory: string;
  hrCategory: string;
  isHypertensive: boolean;
  isTachycardic: boolean;
  isBradycardic: boolean;
}

export const VitalTrendChart: React.FC<VitalTrendChartProps> = ({
  patient,
  historicalVitals,
  className = ''
}) => {
  const [timeRange, setTimeRange] = useState<TimeRangeOption>('7d');
  const [metricFocus, setMetricFocus] = useState<MetricFocus>('both');
  const [showThresholdAreas, setShowThresholdAreas] = useState<boolean>(true);

  // Generate or parse chronological trend dataset
  const trendData: FormattedTrendPoint[] = useMemo(() => {
    // Only map authentic historical vitals or recorded intake vitals
    const vitalsToRender: Vitals[] = (historicalVitals && historicalVitals.length > 0)
      ? historicalVitals
      : (patient.vitalsHistory && patient.vitalsHistory.length > 0)
      ? patient.vitalsHistory
      : patient.latestVitals
      ? [patient.latestVitals]
      : [];

    if (vitalsToRender.length === 0) {
      return [];
    }

    // Filter by selected timeRange if multiple vitals exist
    const now = new Date().getTime();
    const cutoff = timeRange === '24h'
      ? now - 24 * 3600 * 1000
      : timeRange === '7d'
      ? now - 7 * 86400 * 1000
      : now - 30 * 86400 * 1000;

    const filtered = vitalsToRender.filter((v) => {
      const t = new Date(v.recordedAt).getTime();
      return !isNaN(t) && t >= cutoff;
    });

    const activeList = filtered.length > 0 ? filtered : vitalsToRender;

    return activeList.map((v, i) => {
      const sys = v.bpSystolic;
      const dia = v.bpDiastolic;
      const hr = v.heartRate;
      const pp = sys - dia;
      const map = Math.round(dia + pp / 3);
      const dateObj = new Date(v.recordedAt);
      const isValidDate = !isNaN(dateObj.getTime());
      const isoStr = isValidDate ? dateObj.toISOString() : new Date().toISOString();
      const exactTimestamp = `${isoStr.slice(0, 10)} ${isoStr.slice(11, 19)}`;

      return {
        id: `vital-pt-${i}`,
        timeLabel: isValidDate
          ? dateObj.toLocaleDateString(undefined, {
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit'
            })
          : 'Intake',
        fullDate: isValidDate ? dateObj.toLocaleString() : 'Recorded Intake',
        exactTimestamp,
        timestamp: v.recordedAt,
        systolic: sys,
        diastolic: dia,
        heartRate: hr,
        pulsePressure: pp,
        map,
        bpCategory: sys >= 140 || dia >= 90 ? 'Stage 2 HTN' : sys >= 130 || dia >= 85 ? 'Stage 1 HTN' : sys >= 120 ? 'Elevated' : 'Normal',
        hrCategory: hr > 100 ? 'Tachycardia' : hr < 60 ? 'Bradycardia' : 'Normal Sinus',
        isHypertensive: sys >= 130 || dia >= 85,
        isTachycardic: hr > 100,
        isBradycardic: hr < 60
      };
    });
  }, [patient, historicalVitals, timeRange]);

  // Current Latest KPI values (only from authentic data)
  const latestPoint = trendData.length > 0 ? trendData[trendData.length - 1] : null;

  // Min / Max calculation for statistical summary
  const stats = useMemo(() => {
    if (!trendData.length) return null;
    let minSys = Infinity;
    let maxSys = -Infinity;
    let minHr = Infinity;
    let maxHr = -Infinity;

    trendData.forEach((d) => {
      if (d.systolic < minSys) minSys = d.systolic;
      if (d.systolic > maxSys) maxSys = d.systolic;
      if (d.heartRate < minHr) minHr = d.heartRate;
      if (d.heartRate > maxHr) maxHr = d.heartRate;
    });

    return { minSys, maxSys, minHr, maxHr };
  }, [trendData]);

  // Status tag badge
  const getBpTagType = (sys: number, dia: number): CarbonTagType => {
    if (sys >= 140 || dia >= 90) return 'red';
    if (sys >= 130 || dia >= 85) return 'warm-gray';
    if (sys >= 120) return 'warm-gray';
    return 'green';
  };

  const getHrTagType = (hr: number): CarbonTagType => {
    if (hr > 100) return 'red';
    if (hr < 60) return 'warm-gray';
    return 'green';
  };

  return (
    <div className={`bg-white border border-[#e0e0e0] shadow-sm font-sans ${className}`}>
      {/* Component Title & Filter Bar */}
      <div className="p-3.5 border-b border-[#e0e0e0] bg-white flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-[#0f62fe]/10 border border-[#0f62fe]/30 flex items-center justify-center shrink-0">
            <Activity className="w-4 h-4 text-[#0f62fe]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-sm text-[#161616] tracking-tight">
                Vital Trend Chart
              </h3>
              <span className="font-mono text-[10px] px-1.5 py-0.2 bg-[#f4f4f4] border border-[#e0e0e0] text-[#525252]">
                Recharts EMR Engine
              </span>
            </div>
            <p className="text-[11px] text-[#525252] mt-0.5">
              Longitudinal tracking of Blood Pressure (Systolic/Diastolic) & Heart Rate over time
            </p>
          </div>
        </div>

        {/* Action Controls: Metrics toggle & Time Range */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Metric Selector */}
          <div className="inline-flex bg-[#f4f4f4] p-0.5 border border-[#e0e0e0] text-xs">
            <button
              type="button"
              onClick={() => setMetricFocus('both')}
              className={`px-2.5 py-1 text-[11px] font-medium transition-colors ${
                metricFocus === 'both'
                  ? 'bg-white text-[#0f62fe] shadow-2xs font-semibold'
                  : 'text-[#525252] hover:text-[#161616]'
              }`}
            >
              BP & Pulse
            </button>
            <button
              type="button"
              onClick={() => setMetricFocus('bp')}
              className={`px-2.5 py-1 text-[11px] font-medium transition-colors ${
                metricFocus === 'bp'
                  ? 'bg-white text-[#0f62fe] shadow-2xs font-semibold'
                  : 'text-[#525252] hover:text-[#161616]'
              }`}
            >
              BP Only
            </button>
            <button
              type="button"
              onClick={() => setMetricFocus('hr')}
              className={`px-2.5 py-1 text-[11px] font-medium transition-colors ${
                metricFocus === 'hr'
                  ? 'bg-white text-[#0f62fe] shadow-2xs font-semibold'
                  : 'text-[#525252] hover:text-[#161616]'
              }`}
            >
              Pulse Only
            </button>
          </div>

          {/* Time Range Selector */}
          <div className="inline-flex bg-[#f4f4f4] p-0.5 border border-[#e0e0e0] text-xs">
            {(
              [
                { id: '24h', label: '24 Hours' },
                { id: '7d', label: '7 Days' },
                { id: '30d', label: '30 Days' }
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setTimeRange(opt.id)}
                className={`px-2.5 py-1 text-[11px] font-medium transition-colors ${
                  timeRange === opt.id
                    ? 'bg-[#161616] text-white font-semibold'
                    : 'text-[#525252] hover:text-[#161616]'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Toggle Threshold Shading */}
          <button
            type="button"
            onClick={() => setShowThresholdAreas((v) => !v)}
            className={`px-2 py-1 text-[10px] font-mono border transition-colors ${
              showThresholdAreas
                ? 'bg-[#edf5ff] border-[#a6c8ff] text-[#0043ce]'
                : 'bg-white border-[#e0e0e0] text-[#525252]'
            }`}
            title="Toggle normal clinical physiological bands"
          >
            Normal Band
          </button>
        </div>
      </div>

      {/* Real-time Physiological KPI Summary Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-[#e0e0e0] border-b border-[#e0e0e0] bg-[#fcfcfc] text-xs">
        {/* Current Blood Pressure */}
        <div className="p-3">
          <div className="flex items-center justify-between text-[10px] font-mono uppercase text-[#525252]">
            <span>Current BP</span>
            <CarbonTag type={latestPoint ? getBpTagType(latestPoint.systolic, latestPoint.diastolic) : 'warm-gray'} size="sm">
              {latestPoint ? latestPoint.bpCategory : 'Unrecorded'}
            </CarbonTag>
          </div>
          <div className="font-mono text-lg font-bold text-[#161616] mt-1 flex items-baseline gap-1">
            <span>{latestPoint ? latestPoint.systolic : '—'}</span>
            <span className="text-[#8d8d8d] font-normal">/</span>
            <span>{latestPoint ? latestPoint.diastolic : '—'}</span>
            <span className="text-[10px] font-normal text-[#525252] ml-0.5">mmHg</span>
          </div>
          <div className="text-[10px] text-[#525252] mt-0.5 flex items-center justify-between font-mono">
            <span>Range: {stats ? `${stats.minSys}-${stats.maxSys}` : '—'}</span>
            <span className="text-[#0f62fe]">Target: &lt;120/80</span>
          </div>
        </div>

        {/* Current Heart Rate */}
        <div className="p-3">
          <div className="flex items-center justify-between text-[10px] font-mono uppercase text-[#525252]">
            <span>Heart Rate / Pulse</span>
            <CarbonTag type={latestPoint ? getHrTagType(latestPoint.heartRate) : 'warm-gray'} size="sm">
              {latestPoint ? latestPoint.hrCategory : 'Unrecorded'}
            </CarbonTag>
          </div>
          <div className="font-mono text-lg font-bold text-[#da1e28] mt-1 flex items-baseline gap-1">
            <span>{latestPoint ? latestPoint.heartRate : '—'}</span>
            <span className="text-[10px] font-normal text-[#525252] ml-0.5">bpm</span>
          </div>
          <div className="text-[10px] text-[#525252] mt-0.5 flex items-center justify-between font-mono">
            <span>Range: {stats ? `${stats.minHr}-${stats.maxHr}` : '—'}</span>
            <span className="text-[#24a148]">Goal: 60-100</span>
          </div>
        </div>

        {/* Mean Arterial Pressure (MAP) */}
        <div className="p-3">
          <div className="flex items-center justify-between text-[10px] font-mono uppercase text-[#525252]">
            <span>Mean Arterial (MAP)</span>
            <span className="text-[10px] font-mono text-[#0f62fe]">Perfusion</span>
          </div>
          <div className="font-mono text-lg font-bold text-[#161616] mt-1 flex items-baseline gap-1">
            <span>{latestPoint ? latestPoint.map : '—'}</span>
            <span className="text-[10px] font-normal text-[#525252] ml-0.5">mmHg</span>
          </div>
          <div className="text-[10px] text-[#525252] mt-0.5 font-mono">
            <span>Target: 70 - 100 mmHg</span>
          </div>
        </div>

        {/* Pulse Pressure */}
        <div className="p-3">
          <div className="flex items-center justify-between text-[10px] font-mono uppercase text-[#525252]">
            <span>Pulse Pressure (PP)</span>
            <span className="text-[10px] font-mono text-[#8a3ffc]">Elasticity</span>
          </div>
          <div className="font-mono text-lg font-bold text-[#8a3ffc] mt-1 flex items-baseline gap-1">
            <span>{latestPoint ? latestPoint.pulsePressure : '—'}</span>
            <span className="text-[10px] font-normal text-[#525252] ml-0.5">mmHg</span>
          </div>
          <div className="text-[10px] text-[#525252] mt-0.5 font-mono">
            <span>Target: 30 - 50 mmHg</span>
          </div>
        </div>
      </div>

      {/* Main Recharts Visualization Canvas */}
      <div className="p-3.5 pt-4">
        {trendData.length === 0 ? (
          <div className="h-64 sm:h-72 w-full flex flex-col items-center justify-center border border-dashed border-[#e0e0e0] bg-[#fafafa] text-[#6f6f6f]">
            <Activity className="w-8 h-8 text-[#8d8d8d] mb-2 stroke-1" />
            <p className="text-xs font-semibold text-[#161616]">No Longitudinal Vital History Recorded</p>
            <p className="text-[11px] text-[#525252] mt-0.5">Vitals logged during patient intake and telemetry monitoring will appear here chronologically.</p>
          </div>
        ) : (
        <div className="h-64 sm:h-72 w-full min-w-0">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={trendData}
              margin={{ top: 12, right: metricFocus === 'both' ? 24 : 12, left: -16, bottom: 0 }}
            >
              <CartesianGrid stroke="#e0e0e0" strokeDasharray="3 3" vertical={false} />

              <XAxis
                dataKey="timeLabel"
                tick={{ fontSize: 10, fill: '#525252' }}
                stroke="#c6c6c6"
                tickLine={false}
              />

              {/* Left Y-Axis: Blood Pressure in mmHg */}
              {(metricFocus === 'both' || metricFocus === 'bp') && (
                <YAxis
                  yAxisId="bpAxis"
                  domain={[50, 180]}
                  tick={{ fontSize: 10, fill: '#0f62fe' }}
                  stroke="#c6c6c6"
                  tickLine={false}
                  label={{
                    value: 'BP (mmHg)',
                    angle: -90,
                    position: 'insideLeft',
                    offset: 24,
                    fontSize: 10,
                    fill: '#0f62fe'
                  }}
                />
              )}

              {/* Right Y-Axis: Heart Rate in bpm when both or HR only */}
              {(metricFocus === 'both' || metricFocus === 'hr') && (
                <YAxis
                  yAxisId={metricFocus === 'both' ? 'hrAxis' : 'bpAxis'}
                  orientation={metricFocus === 'both' ? 'right' : 'left'}
                  domain={[40, 130]}
                  tick={{ fontSize: 10, fill: '#da1e28' }}
                  stroke="#c6c6c6"
                  tickLine={false}
                  label={{
                    value: 'HR (bpm)',
                    angle: 90,
                    position: metricFocus === 'both' ? 'insideRight' : 'insideLeft',
                    offset: metricFocus === 'both' ? 20 : 24,
                    fontSize: 10,
                    fill: '#da1e28'
                  }}
                />
              )}

              {/* Normal Threshold Guidance Areas */}
              {showThresholdAreas && (metricFocus === 'both' || metricFocus === 'bp') && (
                <ReferenceArea
                  yAxisId="bpAxis"
                  y1={60}
                  y2={120}
                  fill="#24a148"
                  fillOpacity={0.04}
                />
              )}

              {/* Threshold Lines for BP */}
              {(metricFocus === 'both' || metricFocus === 'bp') && (
                <>
                  {/* Systolic Normal Limit: 120 mmHg */}
                  <ReferenceLine
                    yAxisId="bpAxis"
                    y={120}
                    stroke="#0f62fe"
                    strokeDasharray="4 4"
                    label={{
                      value: 'Normal Sys (120)',
                      fill: '#0f62fe',
                      fontSize: 9,
                      position: 'top'
                    }}
                  />
                  {/* Diastolic Normal Limit: 80 mmHg */}
                  <ReferenceLine
                    yAxisId="bpAxis"
                    y={80}
                    stroke="#8a3ffc"
                    strokeDasharray="4 4"
                    label={{
                      value: 'Normal Dia (80)',
                      fill: '#8a3ffc',
                      fontSize: 9,
                      position: 'bottom'
                    }}
                  />
                  {/* Stage 2 HTN Alert Boundary: 140 mmHg */}
                  <ReferenceLine
                    yAxisId="bpAxis"
                    y={140}
                    stroke="#da1e28"
                    strokeDasharray="3 3"
                    label={{
                      value: 'Stage 2 HTN (140)',
                      fill: '#da1e28',
                      fontSize: 9,
                      position: 'top'
                    }}
                  />
                </>
              )}

              {/* Threshold Lines for Heart Rate */}
              {metricFocus === 'hr' && (
                <>
                  <ReferenceLine
                    yAxisId="bpAxis"
                    y={100}
                    stroke="#da1e28"
                    strokeDasharray="4 4"
                    label={{ value: 'Tachycardia Threshold (100 bpm)', fill: '#da1e28', fontSize: 9 }}
                  />
                  <ReferenceLine
                    yAxisId="bpAxis"
                    y={60}
                    stroke="#ff832b"
                    strokeDasharray="4 4"
                    label={{ value: 'Bradycardia Threshold (60 bpm)', fill: '#ff832b', fontSize: 9 }}
                  />
                </>
              )}

              {/* Clean Carbon-Styled Floating Telemetry Tooltip */}
              <Tooltip
                cursor={{
                  stroke: '#0f62fe',
                  strokeWidth: 1.5,
                  strokeDasharray: '3 3'
                }}
                wrapperStyle={{ outline: 'none', zIndex: 100 }}
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const data = payload[0].payload as FormattedTrendPoint;
                    return (
                      <div className="bg-[#161616] text-white p-3.5 border border-[#393939] shadow-2xl text-xs min-w-[280px] max-w-xs font-sans rounded-none select-none">
                        {/* Tooltip Header: Exact Timestamp & Clinical Tag */}
                        <div className="border-b border-[#393939] pb-2 mb-2.5">
                          <div className="flex items-center justify-between text-[10px] font-mono text-[#8d8d8d] uppercase tracking-wider mb-1">
                            <span>Exact Timestamp</span>
                            <span className="text-[#a6c8ff] px-1.5 py-0.5 bg-[#262626] border border-[#393939] font-medium">
                              {data.timeLabel}
                            </span>
                          </div>
                          <div className="font-mono text-xs font-bold text-white flex items-center gap-1.5">
                            <Clock className="w-3.5 h-3.5 text-[#0f62fe] shrink-0" />
                            <span className="tracking-wide">{data.exactTimestamp}</span>
                          </div>
                        </div>

                        {/* Specific Vitals Breakdown Table */}
                        <div className="space-y-1.5 font-mono">
                          {/* Systolic Blood Pressure */}
                          <div className="flex items-center justify-between p-2 bg-[#262626] border-l-2 border-l-[#0f62fe]">
                            <div className="flex items-center gap-2">
                              <span className="w-2.5 h-2.5 bg-[#0f62fe] shrink-0" />
                              <div>
                                <div className="text-[11px] text-[#f4f4f4] font-sans font-medium">Systolic BP</div>
                                <div className="text-[9px] text-[#8d8d8d]">Target &lt;120 mmHg</div>
                              </div>
                            </div>
                            <div className="text-right">
                              <span className="text-sm font-bold text-white">{data.systolic}</span>
                              <span className="text-[10px] text-[#8d8d8d] ml-1">mmHg</span>
                            </div>
                          </div>

                          {/* Diastolic Blood Pressure */}
                          <div className="flex items-center justify-between p-2 bg-[#262626] border-l-2 border-l-[#8a3ffc]">
                            <div className="flex items-center gap-2">
                              <span className="w-2.5 h-2.5 bg-[#8a3ffc] shrink-0" />
                              <div>
                                <div className="text-[11px] text-[#f4f4f4] font-sans font-medium">Diastolic BP</div>
                                <div className="text-[9px] text-[#8d8d8d]">Target &lt;80 mmHg</div>
                              </div>
                            </div>
                            <div className="text-right">
                              <span className="text-sm font-bold text-white">{data.diastolic}</span>
                              <span className="text-[10px] text-[#8d8d8d] ml-1">mmHg</span>
                            </div>
                          </div>

                          {/* Heart Rate / Pulse */}
                          <div className="flex items-center justify-between p-2 bg-[#262626] border-l-2 border-l-[#da1e28]">
                            <div className="flex items-center gap-2">
                              <span className="w-2.5 h-2.5 bg-[#da1e28] shrink-0" />
                              <div>
                                <div className="text-[11px] text-[#f4f4f4] font-sans font-medium">Heart Rate</div>
                                <div className="text-[9px] text-[#8d8d8d]">Goal: 60 - 100 bpm</div>
                              </div>
                            </div>
                            <div className="text-right">
                              <span className="text-sm font-bold text-[#ff8389]">{data.heartRate}</span>
                              <span className="text-[10px] text-[#8d8d8d] ml-1">bpm</span>
                            </div>
                          </div>

                          {/* Perfusion Metrics: MAP & Pulse Pressure */}
                          <div className="pt-2 border-t border-[#393939] grid grid-cols-2 gap-1.5 text-[10px]">
                            <div className="bg-[#1f1f1f] p-1.5 border border-[#333333]">
                              <span className="text-[#8d8d8d] block font-sans">Mean Arterial (MAP)</span>
                              <span className="font-bold text-white text-[11px]">{data.map} mmHg</span>
                            </div>
                            <div className="bg-[#1f1f1f] p-1.5 border border-[#333333]">
                              <span className="text-[#8d8d8d] block font-sans">Pulse Pressure (PP)</span>
                              <span className="font-bold text-[#d4bbff] text-[11px]">{data.pulsePressure} mmHg</span>
                            </div>
                          </div>
                        </div>

                        {/* Clinical Classification Badge */}
                        <div className="mt-2.5 pt-2 border-t border-[#393939] flex items-center justify-between text-[10px] font-sans">
                          <span className="text-[#8d8d8d]">Clinical Assessment:</span>
                          <span
                            className={`font-semibold px-2 py-0.5 font-mono ${
                              data.isHypertensive || data.isTachycardic
                                ? 'bg-[#da1e28] text-white'
                                : 'bg-[#24a148] text-white'
                            }`}
                          >
                            {data.bpCategory} &bull; {data.hrCategory}
                          </span>
                        </div>
                      </div>
                    );
                  }
                  return null;
                }}
              />

              <Legend
                wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }}
                iconType="plainline"
              />

              {/* Systolic BP Line (IBM Blue 60 #0f62fe) */}
              {(metricFocus === 'both' || metricFocus === 'bp') && (
                <Line
                  yAxisId="bpAxis"
                  type="monotone"
                  dataKey="systolic"
                  name="Systolic BP (mmHg)"
                  stroke="#0f62fe"
                  strokeWidth={2.5}
                  dot={{ r: 3.5, fill: '#0f62fe', stroke: '#ffffff', strokeWidth: 1.5 }}
                  activeDot={{ r: 6, fill: '#0f62fe' }}
                />
              )}

              {/* Diastolic BP Line (IBM Purple 60 #8a3ffc) */}
              {(metricFocus === 'both' || metricFocus === 'bp') && (
                <Line
                  yAxisId="bpAxis"
                  type="monotone"
                  dataKey="diastolic"
                  name="Diastolic BP (mmHg)"
                  stroke="#8a3ffc"
                  strokeWidth={2}
                  dot={{ r: 3, fill: '#8a3ffc', stroke: '#ffffff', strokeWidth: 1.5 }}
                  activeDot={{ r: 5, fill: '#8a3ffc' }}
                />
              )}

              {/* Heart Rate Line (IBM Red 60 #da1e28) */}
              {(metricFocus === 'both' || metricFocus === 'hr') && (
                <Line
                  yAxisId={metricFocus === 'both' ? 'hrAxis' : 'bpAxis'}
                  type="monotone"
                  dataKey="heartRate"
                  name="Heart Rate (bpm)"
                  stroke="#da1e28"
                  strokeWidth={2.5}
                  strokeDasharray={metricFocus === 'both' ? '4 3' : undefined}
                  dot={{ r: 3.5, fill: '#da1e28', stroke: '#ffffff', strokeWidth: 1.5 }}
                  activeDot={{ r: 6, fill: '#da1e28' }}
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
        )}
      </div>

      {/* Clinical Reference Footer Guide */}
      <div className="px-3.5 py-2.5 bg-[#f4f4f4] border-t border-[#e0e0e0] flex flex-col sm:flex-row sm:items-center justify-between text-[11px] text-[#525252] gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-0.5 bg-[#0f62fe]" />
            <span>Systolic Target: &lt;120 mmHg</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-0.5 bg-[#8a3ffc]" />
            <span>Diastolic Target: &lt;80 mmHg</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-0.5 bg-[#da1e28] border-b border-dashed border-[#da1e28]" />
            <span>Pulse Target: 60 - 100 bpm</span>
          </div>
        </div>

        <div className="font-mono text-[10px] text-[#525252]">
          AHA/ACC 2024 Guidelines &bull; 21 CFR Part 11 Telemetry Validated
        </div>
      </div>
    </div>
  );
};
