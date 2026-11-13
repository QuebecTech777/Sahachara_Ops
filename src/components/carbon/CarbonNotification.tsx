import React from 'react';
import { AlertCircle, CheckCircle, Info, AlertTriangle, X } from 'lucide-react';

export type NotificationKind = 'info' | 'success' | 'warning' | 'error';

interface CarbonNotificationProps {
  kind?: NotificationKind;
  title: string;
  subtitle?: string;
  onClose?: () => void;
  className?: string;
  lowContrast?: boolean;
}

export const CarbonNotification: React.FC<CarbonNotificationProps> = ({
  kind = 'info',
  title,
  subtitle,
  onClose,
  className = '',
  lowContrast = true
}) => {
  let borderLeftColor = '#0f62fe';
  let icon = <Info className="w-4 h-4 text-[#0f62fe] shrink-0" />;
  let bgColor = 'bg-[#edf5ff]';

  switch (kind) {
    case 'success':
      borderLeftColor = '#24a148';
      icon = <CheckCircle className="w-4 h-4 text-[#24a148] shrink-0" />;
      bgColor = lowContrast ? 'bg-[#defbe6]' : 'bg-[#198038] text-white';
      break;
    case 'warning':
      borderLeftColor = '#f1c21b';
      icon = <AlertTriangle className="w-4 h-4 text-[#b28600] shrink-0" />;
      bgColor = lowContrast ? 'bg-[#fef8e7]' : 'bg-[#b28600] text-white';
      break;
    case 'error':
      borderLeftColor = '#da1e28';
      icon = <AlertCircle className="w-4 h-4 text-[#da1e28] shrink-0" />;
      bgColor = lowContrast ? 'bg-[#fff1f1]' : 'bg-[#da1e28] text-white';
      break;
    case 'info':
    default:
      borderLeftColor = '#0f62fe';
      icon = <Info className="w-4 h-4 text-[#0f62fe] shrink-0" />;
      bgColor = lowContrast ? 'bg-[#edf5ff]' : 'bg-[#0f62fe] text-white';
      break;
  }

  return (
    <div
      style={{ borderLeft: `3px solid ${borderLeftColor}` }}
      className={`p-3 text-[13px] border border-[#e0e0e0] flex items-start justify-between gap-3 ${bgColor} ${className}`}
      role="alert"
    >
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5">{icon}</span>
        <div>
          <span className="font-semibold text-[#161616] mr-2">{title}</span>
          {subtitle && <span className="text-[#393939]">{subtitle}</span>}
        </div>
      </div>
      {onClose && (
        <button
          onClick={onClose}
          className="text-[#525252] hover:text-[#161616] p-1 -mr-1 -mt-1 rounded-none cursor-pointer"
          aria-label="Close notification"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
};
