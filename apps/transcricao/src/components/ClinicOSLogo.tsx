import React from 'react';

interface ClinicOSLogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export const ClinicOSLogo: React.FC<ClinicOSLogoProps> = ({ className = '', size = 'md' }) => {
  const titleSizes = {
    sm: 'text-lg',
    md: 'text-2xl',
    lg: 'text-4xl',
  };

  const clinicaSizes = {
    sm: 'text-[8.5px]',
    md: 'text-[11px]',
    lg: 'text-[13px]',
  };

  const subSizes = {
    sm: 'text-[7.5px]',
    md: 'text-[9.5px]',
    lg: 'text-[11.5px]',
  };

  return (
    <div className={`flex flex-col justify-center select-none -space-y-1 ${className}`}>
      {/* Logotipo tipográfico */}
      <span className={`${clinicaSizes[size]} font-serif font-semibold text-[#c8a97e] tracking-[0.32em] uppercase leading-none mb-0.5`}>
        PORTAL
      </span>
      <span className={`${titleSizes[size]} font-serif font-bold text-[#ffffff] tracking-wide leading-none drop-shadow-sm`}>
        ClinicOS
      </span>
      <span className={`${subSizes[size]} font-medium text-[#c8a97e]/90 tracking-[0.28em] uppercase leading-none mt-1`}>
        TRANSCRIÇÃO IA
      </span>
    </div>
  );
};

