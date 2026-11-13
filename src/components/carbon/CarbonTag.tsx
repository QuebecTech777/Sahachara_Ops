import React from 'react';

export type CarbonTagType =
  | 'blue'
  | 'green'
  | 'red'
  | 'warm-gray'
  | 'cool-gray'
  | 'gray'
  | 'yellow'
  | 'orange'
  | 'purple'
  | 'teal'
  | 'cyan'
  | 'magenta'
  | 'high-contrast';

interface CarbonTagProps {
  type?: CarbonTagType;
  children: React.ReactNode;
  size?: 'sm' | 'md';
  className?: string;
  title?: string;
}

const tagStyles: Record<CarbonTagType, string> = {
  blue: 'bg-[#edf5ff] text-[#0043ce] border border-[#a6c8ff]',
  green: 'bg-[#defbe6] text-[#0e6027] border border-[#6fdc8c]',
  red: 'bg-[#fff1f1] text-[#a2191f] border border-[#ffb3b8]',
  'warm-gray': 'bg-[#f7f3f2] text-[#565151] border border-[#d6d1d0]',
  'cool-gray': 'bg-[#f2f4f8] text-[#4d5358] border border-[#c1c7cd]',
  gray: 'bg-[#f2f4f8] text-[#4d5358] border border-[#c1c7cd]',
  yellow: 'bg-[#fcf4d6] text-[#684e00] border border-[#fddc69]',
  orange: 'bg-[#fff2e8] text-[#8a3800] border border-[#ff832b]',
  purple: 'bg-[#f6f2ff] text-[#6929c4] border border-[#d4bbff]',
  teal: 'bg-[#d9fbfb] text-[#005d5d] border border-[#08bdba]',
  cyan: 'bg-[#e5f6ff] text-[#00539a] border border-[#82cfff]',
  magenta: 'bg-[#fff0f7] text-[#9f1853] border border-[#ffafd2]',
  'high-contrast': 'bg-[#161616] text-[#ffffff] border border-[#393939]'
};

export const CarbonTag: React.FC<CarbonTagProps> = ({
  type = 'cool-gray',
  children,
  size = 'md',
  className = '',
  title
}) => {
  const sizeClasses = size === 'sm' ? 'px-1.5 py-0.5 text-[11px]' : 'px-2 py-0.5 text-[12px]';
  return (
    <span
      title={title}
      className={`inline-flex items-center font-normal tracking-[0.32px] rounded-none whitespace-nowrap shrink-0 ${tagStyles[type]} ${sizeClasses} ${className}`}
    >
      {children}
    </span>
  );
};
