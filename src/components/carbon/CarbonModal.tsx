import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import { CarbonButton } from './CarbonButton';

interface CarbonModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  label?: string;
  subtitle?: string;
  primaryButtonText?: string;
  secondaryButtonText?: string;
  onRequestSubmit?: () => void;
  onSecondarySubmit?: () => void;
  danger?: boolean;
  primaryButtonDisabled?: boolean;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  children: React.ReactNode;
}

export const CarbonModal: React.FC<CarbonModalProps> = ({
  isOpen,
  onClose,
  title,
  label,
  subtitle,
  primaryButtonText = 'Save',
  secondaryButtonText = 'Cancel',
  onRequestSubmit,
  onSecondarySubmit,
  danger = false,
  primaryButtonDisabled = false,
  size = 'md',
  children
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.body.style.overflow = 'auto';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  let maxWidth = 'max-w-xl';
  if (size === 'sm') maxWidth = 'max-w-md';
  if (size === 'lg') maxWidth = 'max-w-3xl';
  if (size === 'xl') maxWidth = 'max-w-5xl';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div
        className={`relative w-full ${maxWidth} bg-white shadow-2xl border border-[#c6c6c6] animate-in fade-in zoom-in-95 duration-150 flex flex-col max-h-[90vh]`}
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="p-6 pb-4 border-b border-[#e0e0e0] flex items-start justify-between">
          <div>
            {label && (
              <span className="block text-[12px] font-normal uppercase tracking-[0.32px] text-[#525252] mb-1">
                {label}
              </span>
            )}
            <h2 className="text-[20px] font-semibold text-[#161616] leading-tight tracking-tight">
              {title}
            </h2>
            {subtitle && (
              <p className="text-[12px] text-[#525252] mt-1">
                {subtitle}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-2 -mr-2 -mt-2 text-[#525252] hover:text-[#161616] hover:bg-[#e0e0e0] transition-colors rounded-none"
            aria-label="Close dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto flex-1 text-[14px] text-[#161616]">
          {children}
        </div>

        {/* Footer */}
        <div className="flex border-t border-[#e0e0e0] bg-[#f4f4f4] h-14">
          <button
            type="button"
            onClick={onSecondarySubmit || onClose}
            className="flex-1 px-4 h-full bg-[#393939] hover:bg-[#4c4c4c] text-white text-sm font-normal text-left transition-colors duration-150 rounded-none cursor-pointer"
          >
            {secondaryButtonText}
          </button>
          <button
            type="button"
            disabled={primaryButtonDisabled}
            onClick={onRequestSubmit}
            className={`flex-1 px-4 h-full text-white text-sm font-normal text-left transition-colors duration-150 rounded-none ${
              danger
                ? 'bg-[#da1e28] hover:bg-[#ba1b23]'
                : 'bg-[#0f62fe] hover:bg-[#0353e9]'
            } ${primaryButtonDisabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
          >
            {primaryButtonText}
          </button>
        </div>
      </div>
    </div>
  );
};
