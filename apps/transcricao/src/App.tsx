import React, { useState } from 'react';
import { Header } from './components/Header';
import { AudioRecorder } from './components/AudioRecorder';
import { TranscriptionResult } from './components/TranscriptionResult';
import { AgentConfigModal } from './components/AgentConfigModal';
import { AgentConfig, ClinicalResultData } from './types';
import { processAudioWithGemini } from './lib/gemini';
import { AlertCircle, RefreshCw } from 'lucide-react';

export default function App() {
  const [isAgentModalOpen, setIsAgentModalOpen] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Agent Configuration State - Default to Clínica Exemplo
  const [agentConfig, setAgentConfig] = useState<AgentConfig>(() => {
    let savedKey = '';
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        savedKey = window.localStorage.getItem('clinicos_gemini_api_key') || '';
      }
    } catch (e) {}

    return {
      clinicName: 'Clínica Exemplo',
      speciality: 'Dermatologia & Medicina Estética',
      summaryFormat: 'Anamnesis',
      customInstructions: 'Organize as informações médicas com precisão em formato de Anamnese Direta (Queixa Principal, HDA, Exame Físico, Hipótese e Conduta). Destaque tratamentos dermatológicos, harmonização, prescrições e rotina home care.',
      language: 'Português (Brasil)',
      doctorName: 'Dr(a). Especialista',
      apiKey: savedKey,
    };
  });

  // Current Processed Result State
  const [currentResult, setCurrentResult] = useState<ClinicalResultData | null>(null);
  const [lastAudioAttempt, setLastAudioAttempt] = useState<{
    audioFile: Blob | File;
    mimeType: string;
    fileName?: string;
  } | null>(null);

  // Process Real Audio File/Recording using Multipart Binary (Zero Base64 memory overhead)
  const handleProcessAudio = async (audioFile: Blob | File, mimeType: string, _fileName?: string) => {
    setIsLoading(true);
    setErrorMsg(null);
    setCurrentResult(null);
    setLastAudioAttempt({ audioFile, mimeType, fileName: _fileName });

    try {
      let resultData: ClinicalResultData | null = null;

      // 1. Send native binary stream via multipart/form-data to Web Service /api/process-audio
      const formData = new FormData();
      formData.append('audio', audioFile, _fileName || 'consulta.webm');
      formData.append('mimeType', mimeType);
      formData.append('agentConfig', JSON.stringify(agentConfig));

      // Configurable Backend URL for split hosting (Vercel Frontend + Render/Railway Backend)
      const backendBaseUrl = (
        (import.meta.env.VITE_BACKEND_URL as string | undefined) ||
        (import.meta.env.VITE_API_URL as string | undefined) ||
        ''
      ).replace(/\/$/, '');

      const endpointUrl = backendBaseUrl ? `${backendBaseUrl}/api/process-audio` : '/api/process-audio';

      const response = await fetch(endpointUrl, {
        method: 'POST',
        body: formData,
      });

      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const resData = await response.json();
        if (response.ok && resData && resData.success) {
          resultData = resData.data;
        } else {
          const serverError = resData?.error || resData?.message || 'Falha no processamento pelo servidor.';
          throw new Error(serverError);
        }
      } else {
        const textResponse = await response.text();
        throw new Error(`Erro retornado pelo servidor (Status ${response.status}): ${textResponse.slice(0, 120)}`);
      }

      setCurrentResult(resultData);
    } catch (err: any) {
      console.error('Erro no processamento da transcrição:', err);
      let rawMsg = err?.message || String(err);
      
      // Try to parse if rawMsg is a JSON string with error
      try {
        if (rawMsg.startsWith('{') && rawMsg.endsWith('}')) {
          const parsed = JSON.parse(rawMsg);
          if (parsed?.error?.message) {
            rawMsg = parsed.error.message;
          }
        }
      } catch {}

      if (rawMsg.includes('503') || rawMsg.includes('high demand') || rawMsg.includes('UNAVAILABLE')) {
        setErrorMsg(
          'Os servidores do Google Gemini estão com alta demanda temporária neste momento. Por favor, clique em "Tentar Novamente" abaixo para reprocessar.'
        );
      } else if (rawMsg.includes('Chave') || rawMsg.includes('GEMINI_API_KEY')) {
        setErrorMsg(
          'A variável GEMINI_API_KEY não foi configurada no servidor Web (Render/Railway). Adicione a variável de ambiente no painel de controle do serviço e reinicie.'
        );
      } else {
        setErrorMsg(rawMsg || 'Ocorreu um erro ao processar o áudio. Por favor, tente novamente.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0c100f] text-[#f1f5f4] flex flex-col font-sans antialiased selection:bg-[#c8a97e] selection:text-[#0c100f]">
      {/* Navigation Header */}
      <Header
        onOpenAgentSettings={() => setIsAgentModalOpen(true)}
        clinicName={agentConfig.clinicName}
        speciality={agentConfig.speciality}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Error Alert Box */}
        {errorMsg && (
          <div className="p-4 bg-rose-500/10 border border-rose-500/30 rounded-2xl text-xs text-rose-300 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-lg">
            <div className="flex items-center space-x-2.5">
              <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
              <span>{errorMsg}</span>
            </div>
            <div className="flex items-center space-x-2 shrink-0">
              {lastAudioAttempt && (
                <button
                  disabled={isLoading}
                  onClick={() =>
                    handleProcessAudio(
                      lastAudioAttempt.audioFile,
                      lastAudioAttempt.mimeType,
                      lastAudioAttempt.fileName
                    )
                  }
                  className="px-3 py-1.5 rounded-lg bg-[#10b981]/20 hover:bg-[#10b981]/30 text-[#10b981] border border-[#10b981]/40 text-xs font-semibold transition flex items-center space-x-1.5 disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                  <span>{isLoading ? 'Reprocessando...' : 'Tentar Novamente'}</span>
                </button>
              )}
              <button
                onClick={() => setErrorMsg(null)}
                className="text-xs underline text-rose-400 hover:text-rose-200 ml-1"
              >
                Fechar
              </button>
            </div>
          </div>
        )}

        {/* ClinicOS Workflow Guide Banner */}
        <div className="bg-gradient-to-r from-[#111816] via-[#141f1c] to-[#111816] p-6 sm:p-7 rounded-2xl border border-[#23352f] shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-[#c8a97e]/5 rounded-full blur-3xl pointer-events-none"></div>
          
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-5 relative z-10">
            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-widest uppercase bg-[#c8a97e]/15 text-[#e6c89c] border border-[#c8a97e]/30">
                  Extensão Clínica • Prontuário IA
                </span>
                <span className="text-xs text-[#8da89e]">• Gemini 3.6 Flash</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-serif font-bold text-[#f5f0eb] tracking-tight">
                Transcrição & Anamnese Instantânea
              </h1>
              <p className="text-xs sm:text-sm text-[#a8c2b9] max-w-2xl leading-relaxed">
                Desenvolvido para a <strong className="text-[#c8a97e]">Clínica Exemplo</strong>. Grave o áudio da consulta ou anexe uma gravação para transcrever e gerar automaticamente o resumo de Anamnese Direta — pronto para ser copiado e colado em 1 clique no seu prontuário eletrônico.
              </p>
            </div>

            {/* Quick 3-step pills */}
            <div className="flex flex-col gap-2 shrink-0 bg-[#0c1110]/80 p-3.5 rounded-xl border border-[#1f302a] text-xs">
              <div className="flex items-center space-x-2 text-[#e1e9e6]">
                <span className="w-5 h-5 rounded-full bg-[#182b24] text-[#10b981] font-bold text-[11px] flex items-center justify-center border border-[#27483b]">1</span>
                <span>Grave ou selecione o áudio</span>
              </div>
              <div className="flex items-center space-x-2 text-[#e1e9e6]">
                <span className="w-5 h-5 rounded-full bg-[#182b24] text-[#10b981] font-bold text-[11px] flex items-center justify-center border border-[#27483b]">2</span>
                <span>IA transcreve e estrutura Anamnese</span>
              </div>
              <div className="flex items-center space-x-2 text-[#e1e9e6]">
                <span className="w-5 h-5 rounded-full bg-[#c8a97e]/20 text-[#c8a97e] font-bold text-[11px] flex items-center justify-center border border-[#c8a97e]/40">3</span>
                <span className="font-semibold text-[#c8a97e]">Copie e cole no sistema</span>
              </div>
            </div>
          </div>
        </div>

        {/* Audio Recorder & Sample Selector */}
        <AudioRecorder
          onProcessAudio={handleProcessAudio}
          isLoading={isLoading}
        />

        {/* Processing Loading Indicator */}
        {isLoading && (
          <div className="bg-[#111615] border border-[#c8a97e]/40 rounded-2xl p-10 text-center space-y-4 shadow-2xl animate-pulse">
            <div className="w-14 h-14 rounded-full bg-[#c8a97e]/15 text-[#c8a97e] flex items-center justify-center mx-auto border border-[#c8a97e]/30">
              <RefreshCw className="w-7 h-7 animate-spin" />
            </div>
            <h3 className="text-lg font-serif font-bold text-[#f5f0eb]">
              Formatando Prontuário & Anamnese Clínica Exemplo...
            </h3>
            <p className="text-xs text-[#a8c2b9] max-w-md mx-auto leading-relaxed">
              O Gemini está transcrevendo o áudio de forma literal e sintetizando o resumo médico em Anamnese Direta personalizada da sua clínica.
            </p>
          </div>
        )}

        {/* Transcription & Summary Output */}
        {currentResult && !isLoading && (
          <TranscriptionResult
            data={currentResult}
            agentConfig={agentConfig}
          />
        )}
      </main>

      {/* Agent Settings Modal */}
      <AgentConfigModal
        isOpen={isAgentModalOpen}
        onClose={() => setIsAgentModalOpen(false)}
        config={agentConfig}
        onSaveConfig={(newConfig) => setAgentConfig(newConfig)}
      />

      {/* Footer */}
      <footer className="border-t border-[#1b2824] bg-[#090d0c] py-7 mt-16 text-center text-xs text-[#789188]">
        <div className="max-w-5xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <span className="font-serif text-[#a8c2b9]">Clínica Exemplo • Medicina Estética & Longevidade</span>
          <span className="text-[#688179]">Extensão de Anamnese & Transcrição IA • Copiar e Colar (1-Clique)</span>
        </div>
      </footer>
    </div>
  );
}
