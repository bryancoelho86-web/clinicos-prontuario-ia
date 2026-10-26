import React from 'react';
import { Settings, ShieldCheck } from 'lucide-react';
import { ClinicOSLogo } from './ClinicOSLogo';

interface HeaderProps {
  onOpenAgentSettings: () => void;
  clinicName: string;
  speciality: string;
}

export const Header: React.FC<HeaderProps> = ({
  onOpenAgentSettings,
}) => {
  return (
    <header className="bg-[#0b0f0e]/90 backdrop-blur-md border-b border-[#1b2824] text-white sticky top-0 z-40 shadow-xl">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-20">
          {/* Logo / Brand ClinicOS */}
          <div className="flex items-center space-x-3.5">
            <ClinicOSLogo size="md" />
            <span className="hidden sm:inline-block px-2.5 py-0.5 text-[10px] font-semibold tracking-wider uppercase rounded-full bg-[#172c25] text-[#c8a97e] border border-[#2d4d41] ml-2">
              Portal IA • Anamnese
            </span>
          </div>

          {/* Right Action: Badge + Configure Agent */}
          <div className="flex items-center space-x-3">
            <div className="hidden md:flex items-center space-x-2 px-3.5 py-1.5 rounded-full bg-[#131d1a] border border-[#243831] text-xs text-[#a8c2b9]">
              <ShieldCheck className="w-4 h-4 text-[#10b981]" />
              <span>Anamnese Direta • Pronto para Colar</span>
            </div>

            <button
              onClick={onOpenAgentSettings}
              className="flex items-center space-x-1.5 sm:space-x-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl text-xs font-semibold bg-[#14231f] text-[#f1f5f4] hover:bg-[#1c302a] border border-[#2d4d41] transition-all duration-200 shadow-sm shrink-0"
              title="Personalizar Médico ou Especialidade da Anamnese"
            >
              <Settings className="w-4 h-4 text-[#c8a97e] shrink-0" />
              <span className="hidden sm:inline">Ajustar Médico / Especialidade</span>
              <span className="sm:hidden">Ajustes</span>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};
