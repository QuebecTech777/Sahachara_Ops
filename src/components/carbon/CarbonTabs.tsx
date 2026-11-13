import React from 'react';

export interface TabItem {
  id: string;
  label: string;
  count?: number;
}

interface CarbonTabsProps {
  tabs: TabItem[];
  selectedId: string;
  onSelect: (id: string) => void;
  className?: string;
}

export const CarbonTabs: React.FC<CarbonTabsProps> = ({
  tabs,
  selectedId,
  onSelect,
  className = ''
}) => {
  return (
    <div className={`flex items-center border-b border-[#e0e0e0] bg-white overflow-x-auto ${className}`}>
      {tabs.map((tab) => {
        const isSelected = tab.id === selectedId;
        return (
          <button
            key={tab.id}
            onClick={() => onSelect(tab.id)}
            className={`relative h-11 px-5 text-[14px] font-normal transition-colors whitespace-nowrap shrink-0 flex items-center gap-2 outline-none cursor-pointer ${
              isSelected
                ? 'text-[#161616] font-medium'
                : 'text-[#525252] hover:text-[#161616] hover:bg-[#f4f4f4]'
            }`}
          >
            <span>{tab.label}</span>
            {tab.count !== undefined && (
              <span
                className={`text-[11px] font-mono tabular-nums px-1.5 py-0.2 ${
                  isSelected ? 'bg-[#edf5ff] text-[#0043ce]' : 'bg-[#f4f4f4] text-[#525252]'
                }`}
              >
                {tab.count}
              </span>
            )}
            {isSelected && (
              <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#0f62fe]" />
            )}
          </button>
        );
      })}
    </div>
  );
};
