import React from 'react';
import { Check, CircleDot, Clock, CheckCircle2 } from 'lucide-react';

export interface CarbonProgressBarProps {
  label?: string;
  helperText?: string;
  value: number; // 0 to 100
  max?: number;  // default 100
  size?: 'sm' | 'md' | 'lg';
  status?: 'active' | 'finished' | 'error';
  showPercentage?: boolean;
  className?: string;
}

export const CarbonProgressBar: React.FC<CarbonProgressBarProps> = ({
  label,
  helperText,
  value,
  max = 100,
  size = 'md',
  status,
  showPercentage = true,
  className = ''
}) => {
  const clampedValue = Math.min(Math.max(value, 0), max);
  const percentage = Math.round((clampedValue / max) * 100);
  const isFinished = status === 'finished' || percentage >= 100;

  const heightClasses = {
    sm: 'h-1.5',
    md: 'h-2.5',
    lg: 'h-4'
  };

  const barColor = isFinished
    ? 'bg-[#24a148]' // Carbon green-60
    : status === 'error'
    ? 'bg-[#da1e28]' // Carbon red-60
    : 'bg-[#0f62fe]'; // Carbon blue-60

  return (
    <div className={`w-full font-sans ${className}`}>
      {(label || showPercentage) && (
        <div className="flex items-center justify-between text-xs mb-1.5">
          {label && (
            <span className="font-medium text-[#161616] tracking-[0.16px]">
              {label}
            </span>
          )}
          {showPercentage && (
            <span className="font-mono text-xs font-semibold tabular-nums text-[#161616] ml-auto">
              {percentage}%
            </span>
          )}
        </div>
      )}

      {/* Progress Track (IBM Carbon 0px sharp corners) */}
      <div
        className={`w-full bg-[#e0e0e0] ${heightClasses[size]} overflow-hidden relative rounded-none`}
        role="progressbar"
        aria-valuenow={percentage}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className={`${heightClasses[size]} ${barColor} transition-all duration-300 ease-out`}
          style={{ width: `${percentage}%` }}
        />
      </div>

      {helperText && (
        <div className="text-[11px] text-[#525252] mt-1 flex items-center justify-between">
          <span>{helperText}</span>
          {isFinished && (
            <span className="text-[#24a148] font-medium flex items-center gap-1 font-mono text-[10px]">
              <Check className="w-3 h-3" /> COMPLETED
            </span>
          )}
        </div>
      )}
    </div>
  );
};

export interface StepItem {
  id: string | number;
  label: string;
  secondaryLabel?: string;
  status: 'complete' | 'current' | 'incomplete';
}

export interface CarbonStepProgressProps {
  steps: StepItem[];
  currentIndex?: number;
  className?: string;
}

export const CarbonStepProgress: React.FC<CarbonStepProgressProps> = ({
  steps,
  className = ''
}) => {
  return (
    <div className={`w-full overflow-x-auto ${className}`}>
      <ol className="flex items-center min-w-max py-2">
        {steps.map((step, idx) => {
          const isComplete = step.status === 'complete';
          const isCurrent = step.status === 'current';
          const isLast = idx === steps.length - 1;

          return (
            <li key={step.id} className="flex items-center">
              <div className="flex items-center gap-2 group">
                {/* Step Icon */}
                <div
                  className={`w-5 h-5 flex items-center justify-center text-[10px] font-mono font-semibold transition-colors shrink-0 ${
                    isComplete
                      ? 'bg-[#24a148] text-white'
                      : isCurrent
                      ? 'border-2 border-[#0f62fe] bg-white text-[#0f62fe]'
                      : 'border border-[#8d8d8d] bg-[#f4f4f4] text-[#8d8d8d]'
                  }`}
                  title={`${step.label}: ${step.status}`}
                >
                  {isComplete ? (
                    <Check className="w-3 h-3 stroke-[2.5]" />
                  ) : isCurrent ? (
                    <span className="w-1.5 h-1.5 rounded-full bg-[#0f62fe]" />
                  ) : (
                    <span>{idx + 1}</span>
                  )}
                </div>

                {/* Step Labels */}
                <div className="text-left pr-2">
                  <div
                    className={`text-[11px] font-medium leading-none ${
                      isComplete
                        ? 'text-[#161616]'
                        : isCurrent
                        ? 'text-[#0f62fe] font-semibold'
                        : 'text-[#8d8d8d]'
                    }`}
                  >
                    {step.label}
                  </div>
                  {step.secondaryLabel && (
                    <div className="text-[9px] text-[#525252] font-mono mt-0.5 leading-none">
                      {step.secondaryLabel}
                    </div>
                  )}
                </div>
              </div>

              {/* Connecting line */}
              {!isLast && (
                <div
                  className={`w-6 sm:w-10 h-0.5 mx-1 transition-colors shrink-0 ${
                    isComplete ? 'bg-[#24a148]' : 'bg-[#e0e0e0]'
                  }`}
                />
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
};
