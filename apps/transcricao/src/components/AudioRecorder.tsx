import React, { useState, useRef, useEffect } from 'react';
import { Mic, Square, Upload, Play, Pause, FileAudio, Sparkles, AlertCircle, RefreshCw, CheckCircle2, Shield } from 'lucide-react';

interface AudioRecorderProps {
  onProcessAudio: (audioFile: Blob | File, mimeType: string, fileName?: string) => Promise<void>;
  onSimulateScriptText?: (scriptText: string, sampleTitle: string) => Promise<void>;
  isLoading: boolean;
}

export const AudioRecorder: React.FC<AudioRecorderProps> = ({
  onProcessAudio,
  onSimulateScriptText,
  isLoading,
}) => {
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [recordingTime, setRecordingTime] = useState<number>(0);
  const [recordedAudioUrl, setRecordedAudioUrl] = useState<string | null>(null);
  const [recordedAudioBlob, setRecordedAudioBlob] = useState<Blob | null>(null);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<any>(null);
  const accumulatedTimeRef = useRef<number>(0);
  const startTimeRef = useRef<number>(0);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  // Timer effect based on real system clock
  useEffect(() => {
    if (!isRecording || isPaused) return;

    const startTime = Date.now();
    const initialAccumulated = accumulatedTimeRef.current;

    const interval = setInterval(() => {
      const elapsedSeconds = Math.floor((initialAccumulated + (Date.now() - startTime)) / 1000);
      setRecordingTime(elapsedSeconds);
    }, 250);

    return () => {
      clearInterval(interval);
      accumulatedTimeRef.current += Date.now() - startTime;
    };
  }, [isRecording, isPaused]);

  // Format seconds to mm:ss
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Start Mic Recording
  const startRecording = async () => {
    setErrorMsg(null);
    setRecordedAudioUrl(null);
    setRecordedAudioBlob(null);
    setUploadedFile(null);
    setIsPaused(false);
    setRecordingTime(0);
    accumulatedTimeRef.current = 0;
    audioChunksRef.current = [];

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const audioUrl = URL.createObjectURL(audioBlob);
        setRecordedAudioBlob(audioBlob);
        setRecordedAudioUrl(audioUrl);
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setIsPaused(false);
    } catch (err: any) {
      console.error('Erro ao acessar microfone:', err);
      setErrorMsg('Não foi possível acessar o microfone. Verifique as permissões do navegador.');
    }
  };

  // Stop Mic Recording
  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      if (mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      setIsRecording(false);
      setIsPaused(false);
    }
  };

  // Toggle Pause / Resume Recording
  const togglePauseRecording = () => {
    if (!mediaRecorderRef.current || !isRecording) return;

    if (isPaused) {
      // Retomar gravação
      if (mediaRecorderRef.current.state === 'paused') {
        mediaRecorderRef.current.resume();
      }
      setIsPaused(false);
    } else {
      // Pausar gravação sem perder os dados anteriores
      if (mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.pause();
      }
      setIsPaused(true);
    }
  };

  // Process Recorded Audio
  const handleProcessRecorded = async () => {
    if (!recordedAudioBlob) return;
    try {
      await onProcessAudio(recordedAudioBlob, recordedAudioBlob.type || 'audio/webm', 'Gravacao_Consulta_ClinicOS.webm');
    } catch (e: any) {
      setErrorMsg('Erro ao preparar o áudio gravado.');
    }
  };

  // Handle File Upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    setErrorMsg(null);
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('audio/')) {
      setErrorMsg('Por favor, selecione um arquivo de áudio válido (MP3, WAV, M4A, WEBM, OGG).');
      return;
    }

    setUploadedFile(file);
    setRecordedAudioUrl(null);
    setRecordedAudioBlob(null);
  };

  const handleProcessUploaded = async () => {
    if (!uploadedFile) return;
    try {
      await onProcessAudio(uploadedFile, uploadedFile.type || 'audio/mpeg', uploadedFile.name);
    } catch (e: any) {
      setErrorMsg('Erro ao ler arquivo de áudio.');
    }
  };

  return (
    <div className="bg-[#111615] border border-[#23352f] rounded-2xl p-4 sm:p-6 md:p-8 shadow-2xl space-y-6 relative overflow-hidden">
      {/* Decorative Champagne Header Ribbon */}
      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[#c8a97e] via-[#e6c89c] to-[#10b981]"></div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-[#1f302a]">
        <div>
          <div className="flex items-center space-x-2 text-[#c8a97e] text-xs font-semibold tracking-wider uppercase mb-1">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Passo 1 • Captura ou Upload da Consulta</span>
          </div>
          <h3 className="text-lg md:text-xl font-serif font-bold text-[#f5f0eb] flex items-center space-x-2">
            <span>Gravador de Voz & Anexo de Áudio</span>
          </h3>
          <p className="text-xs text-[#9eb5ad]">
            Grave diretamente no consultório ou anexe o arquivo de áudio gravado em outro dispositivo
          </p>
        </div>
        <div className="text-xs font-semibold px-3.5 py-1.5 rounded-full bg-[#182a24] text-[#c8a97e] border border-[#2b4a3e] self-start sm:self-auto flex items-center space-x-1.5">
          <Shield className="w-3.5 h-3.5 text-[#10b981]" />
          <span>Extensão Sistema Principal</span>
        </div>
      </div>

      {errorMsg && (
        <div className="p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-300 flex items-center space-x-2">
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Main Recording Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Left Column: Microphone Recording */}
        <div className="bg-[#0b0f0e] p-6 sm:p-7 rounded-xl border border-[#1f302a] flex flex-col items-center justify-center space-y-4 text-center relative overflow-hidden group hover:border-[#c8a97e]/40 transition-all">
          {isRecording && !isPaused && (
            <div className="absolute inset-0 bg-rose-500/5 animate-pulse pointer-events-none"></div>
          )}
          {isRecording && isPaused && (
            <div className="absolute inset-0 bg-amber-500/5 pointer-events-none"></div>
          )}

          <div className="relative">
            {isRecording ? (
              <div className="flex items-center justify-center space-x-6">
                {/* Botão de Pausar / Retomar */}
                <div className="flex flex-col items-center space-y-1.5">
                  <button
                    onClick={togglePauseRecording}
                    disabled={isLoading}
                    className={`w-16 h-16 rounded-full flex items-center justify-center shadow-xl transition transform hover:scale-105 active:scale-95 ${
                      isPaused
                        ? 'bg-amber-500 hover:bg-amber-400 text-black shadow-amber-500/40 animate-pulse'
                        : 'bg-[#1a2c26] hover:bg-[#233830] text-[#c8a97e] border-2 border-[#c8a97e]/80 shadow-[#c8a97e]/20'
                    }`}
                    title={isPaused ? 'Clique para retomar a gravação' : 'Clique para pausar a gravação'}
                  >
                    {isPaused ? (
                      <Play className="w-7 h-7 fill-current ml-0.5" />
                    ) : (
                      <Pause className="w-7 h-7" />
                    )}
                  </button>
                  <span className="text-[11px] font-semibold text-[#9eb5ad]">
                    {isPaused ? 'Retomar' : 'Pausar'}
                  </span>
                </div>

                {/* Botão de Finalizar / Concluir */}
                <div className="flex flex-col items-center space-y-1.5">
                  <button
                    onClick={stopRecording}
                    disabled={isLoading}
                    className="w-16 h-16 rounded-full bg-rose-600 hover:bg-rose-500 text-white flex items-center justify-center shadow-xl shadow-rose-600/40 transition transform hover:scale-105 active:scale-95"
                    title="Clique para parar e concluir a gravação"
                  >
                    <Square className="w-6 h-6 fill-current" />
                  </button>
                  <span className="text-[11px] font-semibold text-rose-400">
                    Concluir
                  </span>
                </div>
              </div>
            ) : (
              <button
                onClick={startRecording}
                disabled={isLoading}
                className="w-20 h-20 rounded-full bg-gradient-to-tr from-[#c8a97e] via-[#ab8a5c] to-[#735835] hover:from-[#d3b68f] hover:to-[#8c6d44] text-[#0b0f0e] flex items-center justify-center shadow-xl shadow-[#c8a97e]/30 transition transform hover:scale-105 active:scale-95"
                title="Clique para iniciar gravação do microfone"
              >
                <Mic className="w-8 h-8" />
              </button>
            )}
          </div>

          <div>
            <div className="flex items-center justify-center space-x-2">
              <div className="text-2xl font-mono font-bold text-[#f5f0eb] tracking-wider">
                {formatTime(recordingTime)}
              </div>
              {isRecording && isPaused && (
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/40 uppercase tracking-wide">
                  Pausado
                </span>
              )}
            </div>
            <p className="text-xs text-[#9eb5ad] mt-1 max-w-xs">
              {isRecording ? (
                isPaused ? (
                  <>
                    <span className="text-amber-400 font-semibold">Gravação em pausa.</span> O áudio gravado até aqui está salvo. Clique em <strong>Retomar</strong> para continuar.
                  </>
                ) : (
                  <>
                    Gravação em andamento... Você pode <strong>Pausar</strong> sem perder o áudio ou <strong>Concluir</strong>.
                  </>
                )
              ) : (
                'Clique no ícone dourado para gravar no microfone'
              )}
            </p>
          </div>

          {recordedAudioUrl && !isRecording && (
            <div className="w-full space-y-3 pt-2">
              <audio src={recordedAudioUrl} controls className="w-full h-10 rounded-lg accent-[#c8a97e]" />
              <button
                onClick={handleProcessRecorded}
                disabled={isLoading}
                className="w-full py-3 bg-[#10b981] hover:bg-[#059669] text-white font-semibold text-xs rounded-xl transition shadow-lg shadow-[#10b981]/20 flex items-center justify-center space-x-2"
              >
                {isLoading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Gerando Prontuário & Transcrição...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>Transcrever & Formatar Anamnese</span>
                  </>
                )}
              </button>
            </div>
          )}
        </div>

        {/* Right Column: Upload Audio File */}
        <div className="bg-[#0b0f0e] p-6 sm:p-7 rounded-xl border border-[#1f302a] flex flex-col justify-between space-y-4 group hover:border-[#c8a97e]/40 transition-all">
          <div className="space-y-1.5">
            <h4 className="text-sm font-bold text-[#f5f0eb] flex items-center space-x-2">
              <Upload className="w-4 h-4 text-[#c8a97e]" />
              <span>Anexar Arquivo (.mp3, .wav, .m4a, .webm)</span>
            </h4>
            <p className="text-xs text-[#9eb5ad]">
              Para áudios gravados no celular ou em aplicativo externo de gravação da clínica.
            </p>
          </div>

          <label className="border-2 border-dashed border-[#23352f] hover:border-[#c8a97e]/70 bg-[#0d1311] hover:bg-[#121a18] rounded-xl p-6 flex flex-col items-center justify-center cursor-pointer transition text-center space-y-2.5">
            <FileAudio className="w-8 h-8 text-[#c8a97e]" />
            <span className="text-xs font-semibold text-[#e1e9e6]">
              {uploadedFile ? uploadedFile.name : 'Clique aqui ou arraste seu arquivo de áudio'}
            </span>
            <span className="text-[11px] text-[#789188]">Compatível com qualquer tamanho • MP3, WAV, M4A, OGG</span>
            <input
              type="file"
              accept="audio/*"
              onChange={handleFileUpload}
              className="hidden"
            />
          </label>

          {uploadedFile && (
            <button
              onClick={handleProcessUploaded}
              disabled={isLoading}
              className="w-full py-3 bg-[#10b981] hover:bg-[#059669] text-white font-semibold text-xs rounded-xl transition shadow-lg shadow-[#10b981]/20 flex items-center justify-center space-x-2"
            >
              {isLoading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Processando Arquivo...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>Transcrever & Formatar Anamnese</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
