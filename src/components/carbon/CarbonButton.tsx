import React from 'react';

export type CarbonButtonKind = 'primary' | 'secondary' | 'tertiary' | 'ghost' | 'danger';
export type CarbonButtonSize = 'sm' | 'md' | 'lg';

interface CarbonButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  kind?: CarbonButtonKind;
  variant?: CarbonButtonKind;
  size?: CarbonButtonSize;
  renderIcon?: React.ElementType;
  iconDescription?: string;
  isSelected?: boolean;
}

export const CarbonButton: React.FC<CarbonButtonProps> = ({
  kind = 'primary',
  variant,
  size = 'md',
  renderIcon: Icon,
  children,
  className = '',
  disabled,
  ...rest
}) => {
  const effectiveKind = variant || kind;
  let kindClasses = '';
  switch (effectiveKind) {
    case 'primary':
      kindClasses = 'bg-[#0f62fe] text-white hover:bg-[#0353e9] active:bg-[#002d9c] border border-transparent';
      break;
    case 'secondary':
      kindClasses = 'bg-[#393939] text-white hover:bg-[#4c4c4c] active:bg-[#262626] border border-transparent';
      break;
    case 'tertiary':
      kindClasses = 'bg-transparent text-[#0f62fe] border border-[#0f62fe] hover:bg-[#0f62fe] hover:text-white';
      break;
    case 'ghost':
      kindClasses = 'bg-transparent text-[#0f62fe] hover:bg-[#edf5ff] border border-transparent';
      break;
    case 'danger':
      kindClasses = 'bg-[#da1e28] text-white hover:bg-[#ba1b23] active:bg-[#750e13] border border-transparent';
      break;
  }

  let sizeClasses = '';
  switch (size) {
    case 'sm':
      sizeClasses = 'h-8 px-3 text-xs';
      break;
    case 'md':
      sizeClasses = 'h-10 px-4 text-sm';
      break;
    case 'lg':
      sizeClasses = 'h-12 px-6 text-sm';
      break;
  }

  const disabledClasses = disabled
    ? 'opacity-40 cursor-not-allowed hover:bg-current pointer-events-none'
    : 'cursor-pointer';

  return (
    <button
      disabled={disabled}
      className={`inline-flex items-center justify-between gap-3 font-normal tracking-[0.16px] rounded-none transition-colors duration-150 whitespace-nowrap shrink-0 outline-none focus:ring-2 focus:ring-[#0f62fe] focus:ring-offset-1 ${kindClasses} ${sizeClasses} ${disabledClasses} ${className}`}
      {...rest}
    >
      <span className="truncate">{children}</span>
      {Icon && <Icon className={`shrink-0 ${size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4'}`} />}
    </button>
  );
};
