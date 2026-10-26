import React, { useState } from 'react';
import { ClinicalResultData, AgentConfig } from '../types';
import { FileText, CheckCircle2, Copy, Sparkles, AlertCircle, Share2, ArrowDownToLine, Check, ShieldCheck, Stethoscope } from 'lucide-react';

interface TranscriptionResultProps {
  data: ClinicalResultData;
  agentConfig: AgentConfig;
}

export const TranscriptionResult: React.FC<TranscriptionResultProps> = ({
  data,
  agentConfig,
}) => {
  const [activeTab, setActiveTab] = useState<'soap' | 'transcription' | 'patient'>('soap');
  const [copiedSection, setCopiedSection] = useState<string | null>(null);

  const handleCopy = (text: string, section: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSection(section);
    setTimeout(() => setCopiedSection(null), 3000);
  };

  const anamneseTextOnly = `=== ANAMNESE DIRETA - CLINICOS ===
[QP - QUEIXA PRINCIPAL / HISTÓRICO]:
${data.summary.subjective}

[EXAME FÍSICO / AVALIAÇÃO TRICOLÓGICA & DERMATOLÓGICA]:
${data.summary.objective}

[HIPÓTESE DIAGNÓSTICA / SÍNTESE CLÍNICA]:
${data.summary.assessment}

[CONDUTA, PROCEDIMENTOS & PRESCRIÇÃO HOME CARE]:
${data.summary.plan}`;

  const fullReportText = `=== PRONTUÁRIO CLINICOS ===
Clínica: ${agentConfig.clinicName}
Especialidade: ${agentConfig.speciality}
Médico(a): ${agentConfig.doctorName || 'Dr(a). Especialista'}
Categoria: ${data.clinicalCategory}
Precisão da Transcrição IA: ${data.confidenceScore}%

${anamneseTextOnly}

--- PRINCIPAIS SINTOMAS & QUEIXAS ---
${data.keySymptoms.join(', ')}

--- ORIENTAÇÕES / HOME CARE ---
${data.patientActionItems.map((item, idx) => `${idx + 1}. ${item}`).join('\n')}

--- RECOMENDAÇÃO DE RETORNO ---
${data.followUpRecommendation}

--- TRANSCRIÇÃO ÍNTEGRA DO ÁUDIO ---
${data.transcription}
`;

  return (
    <div className="bg-[#111615] border border-[#23352f] rounded-2xl p-6 md:p-8 shadow-2xl space-y-6 relative overflow-hidden">
      {/* Decorative Champagne Header Ribbon */}
      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[#10b981] via-[#c8a97e] to-[#ab8a5c]"></div>

      {/* Top Bar Status */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-[#1f302a]">
        <div className="flex items-center space-x-3.5">
          <div className="p-3 bg-[#182a24] border border-[#2d4d41] rounded-xl text-[#c8a97e]">
            <Sparkles className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center space-x-2.5">
              <span className="text-xs font-semibold uppercase tracking-wider text-[#c8a97e]">
                Passo 2 • Prontuário Gerado com IA
              </span>
              <span className="px-2.5 py-0.5 text-[10px] font-bold rounded-full bg-[#162923] text-[#10b981] border border-[#244237]">
                Precisão {data.confidenceScore}%
              </span>
            </div>
            <h3 className="text-xl font-serif font-bold text-[#f5f0eb] mt-0.5">
              Anamnese Direta & Transcrição
            </h3>
            <p className="text-xs text-[#9eb5ad]">
              Médico: <strong className="text-[#e6c89c]">{agentConfig.doctorName || 'Especialista'}</strong> • ({agentConfig.speciality})
            </p>
          </div>
        </div>

        {/* Top Prominent One-Click Copy Buttons */}
        <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-2.5">
          <button
            onClick={() => handleCopy(anamneseTextOnly, 'soap_only')}
            className={`w-full sm:w-auto px-4 py-3 sm:py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center space-x-2 shadow-md min-h-[44px] ${
              copiedSection === 'soap_only'
                ? 'bg-[#18362b] text-[#10b981] border border-[#10b981]/50'
                : 'bg-[#172722] hover:bg-[#20362f] text-[#f1f5f4] border border-[#2d4d41]'
            }`}
          >
            {copiedSection === 'soap_only' ? (
              <>
                <Check className="w-4 h-4 text-[#10b981]" />
                <span>Anamnese Copiada! Colar (Ctrl+V)</span>
              </>
            ) : (
              <>
                <Copy className="w-4 h-4 text-[#c8a97e]" />
                <span>Copiar Anamnese Direta</span>
              </>
            )}
          </button>

          <button
            onClick={() => handleCopy(fullReportText, 'full')}
            className={`w-full sm:w-auto px-4 py-3 sm:py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center space-x-2 shadow-lg min-h-[44px] ${
              copiedSection === 'full'
                ? 'bg-[#18362b] text-[#10b981] border border-[#10b981]/60'
                : 'bg-gradient-to-r from-[#c8a97e] to-[#ab8a5c] hover:from-[#d3b68f] hover:to-[#917145] text-[#0b0f0e]'
            }`}
          >
            {copiedSection === 'full' ? (
              <>
                <Check className="w-4 h-4 text-[#10b981]" />
                <span>Tudo Copiado! Colar no Prontuário (Ctrl+V)</span>
              </>
            ) : (
              <>
                <Copy className="w-4 h-4" />
                <span>Copiar Prontuário Completo</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Copied Success Toast Banner */}
      {copiedSection && (
        <div className="bg-[#142620] border border-[#10b981]/40 rounded-xl p-3.5 flex items-center justify-between text-xs text-[#d1e8df] animate-fadeIn">
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="w-5 h-5 text-[#10b981] shrink-0" />
            <span>
              <strong className="text-[#10b981]">Texto Copiado para a Área de Transferência!</strong> Agora acesse o sistema principal da Clínica Exemplo e pressione <strong>Ctrl+V</strong> (ou Cmd+V) no prontuário do paciente.
            </span>
          </div>
          <span className="text-[10px] text-[#9eb5ad] font-mono">1 clique para colar</span>
        </div>
      )}

      {/* Sub Tabs */}
      <div className="flex space-x-1.5 bg-[#0b0f0e] p-1.5 rounded-xl border border-[#1f302a]">
        <button
          onClick={() => setActiveTab('soap')}
          className={`flex-1 py-2.5 text-xs font-bold rounded-lg transition-all ${
            activeTab === 'soap'
              ? 'bg-[#182b24] text-[#c8a97e] border border-[#2d4d41] shadow-sm'
              : 'text-[#9eb5ad] hover:text-[#f1f5f4]'
          }`}
        >
          Anamnese Direta (Prontuário)
        </button>
        <button
          onClick={() => setActiveTab('patient')}
          className={`flex-1 py-2.5 text-xs font-bold rounded-lg transition-all ${
            activeTab === 'patient'
              ? 'bg-[#182b24] text-[#c8a97e] border border-[#2d4d41] shadow-sm'
              : 'text-[#9eb5ad] hover:text-[#f1f5f4]'
          }`}
        >
          Sintomas & Home Care ({data.keySymptoms.length})
        </button>
        <button
          onClick={() => setActiveTab('transcription')}
          className={`flex-1 py-2.5 text-xs font-bold rounded-lg transition-all ${
            activeTab === 'transcription'
              ? 'bg-[#182b24] text-[#c8a97e] border border-[#2d4d41] shadow-sm'
              : 'text-[#9eb5ad] hover:text-[#f1f5f4]'
          }`}
        >
          Transcrição Literal do Áudio
        </button>
      </div>

      {/* Tab Content 1: SOAP Summary */}
      {activeTab === 'soap' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Subjetivo / QP */}
          <div className="bg-[#0b0f0e] border border-[#1f302a] hover:border-[#c8a97e]/40 rounded-xl p-5 space-y-2.5 transition">
            <div className="flex items-center justify-between border-b border-[#1f302a] pb-2.5">
              <span className="text-xs font-serif font-bold text-[#c8a97e] uppercase tracking-wider">
                QP & HISTÓRICO DA DOENÇA (HDA)
              </span>
              <button
                onClick={() => handleCopy(data.summary.subjective, 'subjetivo')}
                className="text-[11px] text-[#9eb5ad] hover:text-[#e6c89c] flex items-center space-x-1"
              >
                <Copy className="w-3 h-3" />
                <span>{copiedSection === 'subjetivo' ? 'Copiado' : 'Copiar'}</span>
              </button>
            </div>
            <p className="text-xs text-[#e1e9e6] leading-relaxed whitespace-pre-wrap">{data.summary.subjective}</p>
          </div>

          {/* Objetivo / Exame Físico */}
          <div className="bg-[#0b0f0e] border border-[#1f302a] hover:border-[#c8a97e]/40 rounded-xl p-5 space-y-2.5 transition">
            <div className="flex items-center justify-between border-b border-[#1f302a] pb-2.5">
              <span className="text-xs font-serif font-bold text-[#c8a97e] uppercase tracking-wider">
                EXAME FÍSICO / AVALIAÇÃO TRICOLÓGICA & DERMATOLÓGICA
              </span>
              <button
                onClick={() => handleCopy(data.summary.objective, 'objetivo')}
                className="text-[11px] text-[#9eb5ad] hover:text-[#e6c89c] flex items-center space-x-1"
              >
                <Copy className="w-3 h-3" />
                <span>{copiedSection === 'objetivo' ? 'Copiado' : 'Copiar'}</span>
              </button>
            </div>
            <p className="text-xs text-[#e1e9e6] leading-relaxed whitespace-pre-wrap">{data.summary.objective}</p>
          </div>

          {/* Avaliação / Hipótese */}
          <div className="bg-[#0b0f0e] border border-[#1f302a] hover:border-[#c8a97e]/40 rounded-xl p-5 space-y-2.5 transition">
            <div className="flex items-center justify-between border-b border-[#1f302a] pb-2.5">
              <span className="text-xs font-serif font-bold text-[#c8a97e] uppercase tracking-wider">
                HIPÓTESE DIAGNÓSTICA & SÍNTESE CLÍNICA
              </span>
              <button
                onClick={() => handleCopy(data.summary.assessment, 'avaliacao')}
                className="text-[11px] text-[#9eb5ad] hover:text-[#e6c89c] flex items-center space-x-1"
              >
                <Copy className="w-3 h-3" />
                <span>{copiedSection === 'avaliacao' ? 'Copiado' : 'Copiar'}</span>
              </button>
            </div>
            <p className="text-xs text-[#e1e9e6] leading-relaxed whitespace-pre-wrap">{data.summary.assessment}</p>
          </div>

          {/* Plano / Conduta */}
          <div className="bg-[#0f1715] border border-[#27483b] hover:border-[#10b981]/50 rounded-xl p-5 space-y-2.5 transition">
            <div className="flex items-center justify-between border-b border-[#1f302a] pb-2.5">
              <span className="text-xs font-serif font-bold text-[#10b981] uppercase tracking-wider">
                CONDUTA MÉDICA, PROCEDIMENTOS & PRESCRIÇÃO HOME CARE
              </span>
              <button
                onClick={() => handleCopy(data.summary.plan, 'plano')}
                className="text-[11px] text-[#9eb5ad] hover:text-[#10b981] flex items-center space-x-1"
              >
                <Copy className="w-3 h-3" />
                <span>{copiedSection === 'plano' ? 'Copiado' : 'Copiar'}</span>
              </button>
            </div>
            <p className="text-xs text-[#f1f5f4] leading-relaxed whitespace-pre-wrap font-medium">{data.summary.plan}</p>
          </div>
        </div>
      )}

      {/* Tab Content 2: Patient Actions & Symptoms */}
      {activeTab === 'patient' && (
        <div className="space-y-4">
          {/* Key Symptoms */}
          <div className="bg-[#0b0f0e] border border-[#1f302a] rounded-xl p-5 space-y-2.5">
            <h4 className="text-xs font-serif font-bold text-[#c8a97e] uppercase tracking-wider">
              Sintomas / Queixas Identificadas
            </h4>
            <div className="flex flex-wrap gap-2 pt-1">
              {data.keySymptoms.map((symp, idx) => (
                <span
                  key={idx}
                  className="px-3.5 py-1 rounded-full text-xs font-semibold bg-[#172722] text-[#c8a97e] border border-[#2d4d41]"
                >
                  {symp}
                </span>
              ))}
            </div>
          </div>

          {/* Patient Checklist */}
          <div className="bg-[#0b0f0e] border border-[#1f302a] rounded-xl p-5 space-y-3">
            <h4 className="text-xs font-serif font-bold text-[#10b981] uppercase tracking-wider">
              Orientações Home Care & Cuidados Recomendados
            </h4>
            <div className="space-y-2.5">
              {data.patientActionItems.map((item, idx) => (
                <div key={idx} className="flex items-start space-x-2.5 text-xs text-[#e1e9e6]">
                  <CheckCircle2 className="w-4 h-4 text-[#10b981] shrink-0 mt-0.5" />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Follow-up recommendation */}
          <div className="bg-[#0b0f0e] border border-[#1f302a] rounded-xl p-5 space-y-1">
            <h4 className="text-xs font-serif font-bold text-[#9eb5ad] uppercase tracking-wider">
              Recomendação de Retorno / Próxima Sessão
            </h4>
            <p className="text-xs font-semibold text-[#f1f5f4] mt-1">{data.followUpRecommendation}</p>
          </div>
        </div>
      )}

      {/* Tab Content 3: Full Transcription */}
      {activeTab === 'transcription' && (
        <div className="bg-[#0b0f0e] border border-[#1f302a] rounded-xl p-5 space-y-3.5">
          <div className="flex items-center justify-between border-b border-[#1f302a] pb-2.5">
            <span className="text-xs font-serif font-bold text-[#c8a97e] uppercase tracking-wider">
              Transcrição Literal e Íntegra do Áudio
            </span>
            <button
              onClick={() => handleCopy(data.transcription, 'transcription')}
              className="text-[11px] text-[#9eb5ad] hover:text-[#c8a97e] flex items-center space-x-1"
            >
              <Copy className="w-3 h-3" />
              <span>{copiedSection === 'transcription' ? 'Copiado' : 'Copiar Transcrição'}</span>
            </button>
          </div>
          <p className="text-xs text-[#e1e9e6] leading-relaxed font-mono whitespace-pre-wrap bg-[#0c1311] p-4 rounded-xl border border-[#1f302a]">
            {data.transcription}
          </p>
        </div>
      )}
    </div>
  );
};
