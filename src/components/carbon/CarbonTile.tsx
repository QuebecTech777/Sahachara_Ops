import React from 'react';

interface CarbonTileProps extends React.HTMLAttributes<HTMLDivElement> {
  light?: boolean;
  clickable?: boolean;
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
}

export const CarbonTile: React.FC<CarbonTileProps> = ({
  light = false,
  clickable = false,
  title,
  subtitle,
  children,
  className = '',
  ...rest
}) => {
  const bg = light ? 'bg-[#ffffff]' : 'bg-[#ffffff]';
  const hoverClasses = clickable
    ? 'cursor-pointer hover:bg-[#f4f4f4] transition-colors duration-150 active:border-[#0f62fe]'
    : '';

  return (
    <div
      className={`relative p-4 rounded-none border border-[#e0e0e0] ${bg} ${hoverClasses} ${className}`}
      {...rest}
    >
      {(title || subtitle) && (
        <div className="mb-3">
          {title && <h4 className="text-sm font-semibold text-[#161616] tracking-[0.16px]">{title}</h4>}
          {subtitle && <p className="text-xs text-[#525252] mt-0.5">{subtitle}</p>}
        </div>
      )}
      {children}
    </div>
  );
};
