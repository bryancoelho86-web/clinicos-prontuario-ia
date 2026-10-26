import React, { useState } from 'react';
import { AgentConfig } from '../types';
import { X, Settings, Check, Key, Eye, EyeOff } from 'lucide-react';

interface AgentConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: AgentConfig;
  onSaveConfig: (newConfig: AgentConfig) => void;
}

const SPECIALITY_PRESETS = [
  'Dermatologia & Medicina Estética',
  'Medicina da Longevidade',
  'Harmonização Facial & Corporal',
  'Dermatologia Clínica & Capilar',
  'Clínica Geral',
  'Endocrinologia & Longevidade',
  'Nutrologia Médica',
  'Cirurgia Plástica & Estética',
  'Outra Especialidade Médica',
];

export const AgentConfigModal: React.FC<AgentConfigModalProps> = ({
  isOpen,
  onClose,
  config,
  onSaveConfig,
}) => {
  const [clinicName, setClinicName] = useState<string>(config.clinicName);
  const [speciality, setSpeciality] = useState<string>(config.speciality);
  const [customInstructions, setCustomInstructions] = useState<string>(config.customInstructions);
  const [doctorName, setDoctorName] = useState<string>(config.doctorName || '');
  const [apiKey, setApiKey] = useState<string>(() => {
    try {
      return localStorage.getItem('clinicos_gemini_api_key') || config.apiKey || '';
    } catch {
      return config.apiKey || '';
    }
  });
  const [showApiKey, setShowApiKey] = useState<boolean>(false);

  if (!isOpen) return null;

  const handleSave = () => {
    try {
      if (apiKey.trim()) {
        localStorage.setItem('clinicos_gemini_api_key', apiKey.trim());
      } else {
        localStorage.removeItem('clinicos_gemini_api_key');
      }
    } catch (e) {
      console.error('Falha ao salvar chave no localStorage:', e);
    }

    onSaveConfig({
      clinicName,
      speciality,
      summaryFormat: 'Anamnesis',
      customInstructions,
      language: 'Português (Brasil)',
      doctorName,
      apiKey: apiKey.trim(),
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn">
      <div className="bg-[#111615] border border-[#273d35] rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-5 border-b border-[#1f302a] flex items-center justify-between bg-[#0b0f0e]">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-[#182b24] border border-[#2d4d41] rounded-xl text-[#c8a97e]">
              <Settings className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-serif font-bold text-lg text-[#f5f0eb]">Personalizar Médico & Especialidade</h3>
              <p className="text-xs text-[#9eb5ad]">Ajuste o profissional, especialidade e instruções do prontuário ClinicOS</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-[#9eb5ad] hover:text-[#f1f5f4] hover:bg-[#182b24] rounded-lg transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-6 text-[#e1e9e6]">
          {/* Clinic & Doctor Name */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-[#c8a97e] uppercase tracking-wider">Nome da Clínica</label>
              <input
                type="text"
                value={clinicName}
                onChange={(e) => setClinicName(e.target.value)}
                placeholder="Ex: Clínica Exemplo"
                className="w-full bg-[#0b0f0e] border border-[#1f302a] focus:border-[#c8a97e] rounded-xl px-3.5 py-2.5 text-xs text-[#f1f5f4] outline-none transition"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-[#c8a97e] uppercase tracking-wider">Nome do Médico(a) / Especialista</label>
              <input
                type="text"
                value={doctorName}
                onChange={(e) => setDoctorName(e.target.value)}
                placeholder="Ex: Dr(a). Especialista"
                className="w-full bg-[#0b0f0e] border border-[#1f302a] focus:border-[#c8a97e] rounded-xl px-3.5 py-2.5 text-xs text-[#f1f5f4] outline-none transition"
              />
            </div>
          </div>

          {/* Speciality Selection */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-[#c8a97e] uppercase tracking-wider">Especialidade / Segmento da Consulta</label>
            <div className="flex flex-wrap gap-2">
              {SPECIALITY_PRESETS.map((spec) => (
                <button
                  key={spec}
                  type="button"
                  onClick={() => setSpeciality(spec)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
                    speciality === spec
                      ? 'bg-[#1a332a] border-[#c8a97e] text-[#e6c89c]'
                      : 'bg-[#0b0f0e] border-[#1f302a] text-[#8ea89f] hover:text-[#e1e9e6]'
                  }`}
                >
                  {spec}
                </button>
              ))}
            </div>
            <input
              type="text"
              value={speciality}
              onChange={(e) => setSpeciality(e.target.value)}
              placeholder="Outra especialidade customizada..."
              className="w-full bg-[#0b0f0e] border border-[#1f302a] focus:border-[#c8a97e] rounded-xl px-3.5 py-2.5 text-xs text-[#f1f5f4] outline-none transition mt-2"
            />
          </div>

          {/* Custom Instructions / Prompt Tuning */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-[#c8a97e] uppercase tracking-wider">Instruções Extras para a IA (System Prompt)</label>
              <span className="text-[10px] text-[#10b981] font-semibold">Customização ClinicOS</span>
            </div>
            <textarea
              rows={3}
              value={customInstructions}
              onChange={(e) => setCustomInstructions(e.target.value)}
              placeholder="Ex: Priorize tratamentos dermatológicos, protocolos de harmonização, indicações de bioestimuladores e rotina de skincare home care com clareza."
              className="w-full bg-[#0b0f0e] border border-[#1f302a] focus:border-[#c8a97e] rounded-xl p-3.5 text-xs text-[#f1f5f4] outline-none transition"
            />
          </div>

          {/* Gemini API Key Configuration (Opcional se já estiver no Servidor) */}
          <div className="space-y-2 p-4 rounded-xl bg-[#0b0f0e] border border-[#23352f]">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Key className="w-4 h-4 text-[#c8a97e]" />
                <label className="text-xs font-bold text-[#c8a97e] uppercase tracking-wider">Chave de API Gemini (Opcional)</label>
              </div>
              <span className="text-[10px] text-[#10b981] font-semibold">Configurada no Servidor</span>
            </div>
            <p className="text-[11px] text-[#9eb5ad]">
              A chave de API já está protegida e configurada diretamente nas variáveis de ambiente do <strong>Servidor Web (Render/Railway)</strong>. Não é necessário preencher nada aqui. Preencha este campo apenas se desejar sobrescrever com outra chave pessoal.
            </p>
            <div className="relative flex items-center">
              <input
                type={showApiKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Deixe em branco para usar a chave do Servidor"
                className="w-full bg-[#111816] border border-[#1f302a] focus:border-[#c8a97e] rounded-xl pl-3.5 pr-10 py-2.5 text-xs font-mono text-[#f1f5f4] outline-none transition"
              />
              <button
                type="button"
                onClick={() => setShowApiKey(!showApiKey)}
                className="absolute right-3 text-[#8ea89f] hover:text-[#f1f5f4]"
              >
                {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-[#1f302a] bg-[#0b0f0e] flex items-center justify-end space-x-3">
          <button
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl text-xs font-semibold text-[#8ea89f] hover:text-[#f1f5f4] transition"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#c8a97e] to-[#ab8a5c] hover:from-[#d3b68f] hover:to-[#917145] text-[#0c100f] text-xs font-bold transition shadow-lg flex items-center space-x-2"
          >
            <Check className="w-4 h-4" />
            <span>Salvar Especialidade Médica</span>
          </button>
        </div>
      </div>
    </div>
  );
};
