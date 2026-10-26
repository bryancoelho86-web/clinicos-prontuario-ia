import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, Check, Mic, Square, RotateCcw, Loader2, AlertTriangle, X, ExternalLink } from 'lucide-react';
import { useIniciarConsultaInicial, useConcluirConsultaInicial, useCancelarConsultaInicial, useUpdatePacienteResumo } from '@/hooks/usePacientePerfil';
import {
  useIniciarGravacaoIA,
  useEnviarAudioGravacaoIA,
  useGravacaoIA,
  useReprocessarGravacaoIA,
  useSalvarEdicaoResumoIA,
  useConfirmarResumoIA,
} from '@/hooks/useGravacaoIA';
import { toast } from '@/components/ui/use-toast';

const CATEGORIA_LABEL = {
  medicamento: 'Medicamento',
  alergia: 'Alergia',
  doenca: 'Doença',
  hipotese: 'Hipótese diagnóstica',
  queixa: 'Queixa',
  fator_risco: 'Fator de risco',
  recomendacao: 'Recomendação',
};

function formatDuracao(segundos) {
  const m = Math.floor(segundos / 60).toString().padStart(2, '0');
  const s = Math.floor(segundos % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function GravacaoAudio({ pacienteId, consultaId, agendamentoId }) {
  const [gravacaoId, setGravacaoId] = useState(null);
  const [recording, setRecording] = useState(false);
  const [duracao, setDuracao] = useState(0);
  const [edicao, setEdicao] = useState(null);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);

  useEffect(() => {
    return () => {
      clearInterval(timerRef.current);
      mediaRecorderRef.current?.stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const iniciarGravacao = useIniciarGravacaoIA();
  const enviarAudio = useEnviarAudioGravacaoIA();
  const reprocessar = useReprocessarGravacaoIA();
  const salvarEdicao = useSalvarEdicaoResumoIA();
  const confirmar = useConfirmarResumoIA();
  const { data: gravacao } = useGravacaoIA(gravacaoId);

  useEffect(() => {
    if (gravacao?.status === 'concluido' && !gravacao.confirmado && !edicao) {
      setEdicao({
        resumoClinico: gravacao.resumo_clinico || '',
        itens: (gravacao.resumo_ia_itens || []).map((i) => ({ categoria: i.categoria, texto: i.texto })),
      });
    }
  }, [gravacao, edicao]);

  const iniciarGravador = async () => {
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      toast({ title: 'Não foi possível acessar o microfone', variant: 'destructive' });
      return;
    }

    iniciarGravacao.mutate({ consultaInicialId: consultaId }, {
      onSuccess: (id) => {
        setGravacaoId(id);
        chunksRef.current = [];
        const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4';
        const recorder = new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 32000 });
        recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
        recorder.start();
        mediaRecorderRef.current = recorder;
        setRecording(true);
        setDuracao(0);
        timerRef.current = setInterval(() => setDuracao((d) => d + 1), 1000);
      },
      onError: (error) => {
        stream.getTracks().forEach((t) => t.stop());
        toast({ title: 'Erro ao iniciar gravação', description: error?.message, variant: 'destructive' });
      },
    });
  };

  const pararGravador = () => {
    const recorder = mediaRecorderRef.current;
    if (!recorder) return;
    clearInterval(timerRef.current);
    setRecording(false);

    recorder.onstop = () => {
      recorder.stream.getTracks().forEach((t) => t.stop());
      const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
      enviarAudio.mutate({ gravacaoId, consultaInicialId: consultaId, blob }, {
        onError: (error) => toast({ title: 'Erro ao enviar áudio', description: error?.message, variant: 'destructive' }),
      });
    };
    recorder.stop();
  };

  const handleReprocessar = () => {
    setEdicao(null);
    reprocessar.mutate({ gravacaoId }, {
      onError: (error) => toast({ title: 'Erro ao reprocessar', description: error?.message, variant: 'destructive' }),
    });
  };

  const handleRemoverItem = (index) => {
    setEdicao((e) => ({ ...e, itens: e.itens.filter((_, i) => i !== index) }));
  };

  const handleConfirmar = () => {
    salvarEdicao.mutate(
      { gravacaoId, transcricao: gravacao.transcricao, resumoClinico: edicao.resumoClinico, itens: edicao.itens },
      {
        onSuccess: () => {
          confirmar.mutate({ gravacaoId, pacienteId, consultaId, resumoClinico: edicao.resumoClinico, agendamentoId }, {
            onSuccess: () => toast({ title: 'Resumo da IA confirmado no prontuário' }),
            onError: (error) => toast({ title: 'Erro ao confirmar', description: error?.message, variant: 'destructive' }),
          });
        },
        onError: (error) => toast({ title: 'Erro ao salvar edição', description: error?.message, variant: 'destructive' }),
      },
    );
  };

  if (!gravacaoId) {
    return (
      <button
        onClick={iniciarGravador}
        disabled={iniciarGravacao.isPending}
        className="w-full py-3 rounded-2xl text-sm font-semibold text-white disabled:opacity-50 flex items-center justify-center gap-2"
        style={{ backgroundColor: '#C9A24D' }}
      >
        <Mic size={15} /> {iniciarGravacao.isPending ? 'Preparando...' : 'Gravar Consulta com IA'}
      </button>
    );
  }

  if (recording) {
    return (
      <button
        onClick={pararGravador}
        className="w-full py-3 rounded-2xl text-sm font-semibold text-white flex items-center justify-center gap-2"
        style={{ backgroundColor: '#C0392B' }}
      >
        <Square size={15} /> Parar gravação ({formatDuracao(duracao)})
      </button>
    );
  }

  if (!gravacao || enviarAudio.isPending || gravacao.status === 'gravando' || gravacao.status === 'processando') {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-center gap-2 py-3 text-sm" style={{ color: 'var(--text-secondary)' }}>
          <Loader2 size={15} className="animate-spin" /> Processando áudio com IA (pode levar alguns minutos em gravações longas)...
        </div>
        {gravacao?.status === 'processando' && (
          <button
            onClick={() => { setGravacaoId(null); setEdicao(null); }}
            className="w-full py-2 rounded-xl text-xs font-medium"
            style={{ color: 'var(--text-secondary)', border: '1px solid var(--border-color)' }}
          >
            Está demorando muito? Descartar e gravar de novo
          </button>
        )}
      </div>
    );
  }

  if (gravacao.status === 'erro') {
    return (
      <div className="space-y-2">
        <div className="flex items-start gap-2 text-sm p-3 rounded-xl" style={{ backgroundColor: 'rgba(192,57,43,0.08)', color: '#C0392B' }}>
          <AlertTriangle size={15} className="mt-0.5 shrink-0" />
          <span>{gravacao.erro_detalhe || 'Falha ao processar o áudio.'}</span>
        </div>
        <button
          onClick={handleReprocessar}
          disabled={reprocessar.isPending}
          className="w-full py-3 rounded-2xl text-sm font-semibold text-white disabled:opacity-50 flex items-center justify-center gap-2"
          style={{ backgroundColor: '#C9A24D' }}
        >
          <RotateCcw size={15} /> {reprocessar.isPending ? 'Tentando...' : 'Tentar novamente'}
        </button>
      </div>
    );
  }

  if (gravacao.status === 'concluido' && !gravacao.confirmado && edicao) {
    const salvando = salvarEdicao.isPending || confirmar.isPending;
    return (
      <div className="space-y-3">
        <div>
          <p className="text-xs font-semibold mb-1" style={{ color: 'var(--text-secondary)' }}>Resumo clínico (IA) — revise antes de confirmar</p>
          <textarea
            rows={4}
            value={edicao.resumoClinico}
            onChange={(e) => setEdicao((ed) => ({ ...ed, resumoClinico: e.target.value }))}
            className="w-full px-3 py-2 rounded-xl border text-sm outline-none resize-none"
            style={{ borderColor: 'var(--border-color)', backgroundColor: 'rgb(var(--card))' }}
          />
        </div>
        {edicao.itens.length > 0 && (
          <div className="space-y-1.5">
            {edicao.itens.map((item, i) => (
              <div key={i} className="text-sm flex items-start gap-2">
                <span className="font-semibold shrink-0 mt-1.5" style={{ color: 'var(--gold)' }}>{CATEGORIA_LABEL[item.categoria] ?? item.categoria}:</span>
                <input
                  value={item.texto}
                  onChange={(e) => setEdicao((ed) => ({
                    ...ed,
                    itens: ed.itens.map((it, idx) => (idx === i ? { ...it, texto: e.target.value } : it)),
                  }))}
                  className="flex-1 px-2 py-1.5 rounded-lg border text-sm outline-none"
                  style={{ borderColor: 'var(--border-color)', backgroundColor: 'rgb(var(--card))' }}
                />
                <button onClick={() => handleRemoverItem(i)} className="p-1.5 mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                  <X size={13} />
                </button>
              </div>
            ))}
          </div>
        )}
        <details className="text-xs" style={{ color: 'var(--text-secondary)' }}>
          <summary className="cursor-pointer">Ver transcrição completa</summary>
          <p className="mt-2 whitespace-pre-wrap">{gravacao.transcricao}</p>
        </details>
        <button
          onClick={handleConfirmar}
          disabled={salvando || !edicao.resumoClinico.trim()}
          className="flex items-center justify-center gap-2 w-full py-3 rounded-2xl text-sm font-semibold text-white disabled:opacity-50"
          style={{ backgroundColor: 'var(--green-primary)' }}
        >
          <Check size={15} /> {salvando ? 'Confirmando...' : 'Confirmar e registrar no prontuário'}
        </button>
      </div>
    );
  }

  if (gravacao.confirmado) {
    return (
      <p className="text-sm flex items-center gap-2" style={{ color: 'var(--status-success-text)' }}>
        <Check size={15} /> Resumo da IA já confirmado no prontuário.
      </p>
    );
  }

  return null;
}

export default function ConsultaInicialManual({ pacienteId, consultaEmAndamento, agendamentoId }) {
  const navigate = useNavigate();
  const [anamnese, setAnamnese] = useState('');
  const [confirmCancelOpen, setConfirmCancelOpen] = useState(false);
  const iniciar = useIniciarConsultaInicial();
  const concluir = useConcluirConsultaInicial();
  const cancelar = useCancelarConsultaInicial();
  const atualizarResumo = useUpdatePacienteResumo();

  const handleIniciar = () => {
    iniciar.mutate({ pacienteId, agendamentoId }, {
      onError: (error) => toast({ title: 'Erro ao iniciar consulta', description: error?.message, variant: 'destructive' }),
    });
  };

  const handleConcluir = () => {
    const texto = anamnese.trim();
    if (!texto) return;
    concluir.mutate({ pacienteId, consultaId: consultaEmAndamento.id, anamnese: texto, agendamentoId }, {
      onSuccess: () => {
        setAnamnese('');
        toast({ title: 'Consulta inicial concluída' });
        // O texto colado/digitado aqui (tipicamente o resumo gerado pela IA
        // externa) também vira o resumo_clinico do paciente — mesmo campo
        // exibido no topo do perfil — igual já acontece quando a IA por
        // dentro do app confirma um resumo (confirmar_resumo_ia()).
        // dispararResumoIA: depois de sincronizar o texto colado/digitado
        // (que vira resumo_clinico imediatamente), dispara a regeneração
        // completa via IA (anamnese + todas as sessões concluídas) — ver
        // useUpdatePacienteResumo (usePacientePerfil.js).
        atualizarResumo.mutate({ id: pacienteId, resumo_clinico: texto, dispararResumoIA: true }, {
          onError: (error) => toast({ title: 'Consulta concluída, mas falhou ao atualizar o resumo do paciente', description: error?.message, variant: 'destructive' }),
        });
        // Único ponto de uso deste componente é dentro do Modo de
        // Atendimento (chamado a partir do Dashboard) — navegação
        // incondicional pro perfil, conforme requisito do cliente
        navigate(`/pacientes/${pacienteId}`);
      },
      onError: (error) => toast({ title: 'Erro ao concluir consulta', description: error?.message, variant: 'destructive' }),
    });
  };

  const handleCancelar = () => {
    cancelar.mutate({ consultaId: consultaEmAndamento.id, pacienteId, agendamentoId }, {
      onSuccess: () => {
        setConfirmCancelOpen(false);
        setAnamnese('');
        toast({ title: 'Consulta Inicial cancelada' });
      },
      onError: (error) => toast({ title: 'Erro ao cancelar consulta', description: error?.message, variant: 'destructive' }),
    });
  };

  return (
    <div className="bg-card rounded-2xl p-6" style={{ borderTop: '3px solid var(--gold)', boxShadow: '0 8px 20px rgba(0,0,0,.05)' }}>
      <div className="flex items-center gap-3 mb-5">
        <div className="p-2.5 rounded-xl" style={{ backgroundColor: 'var(--bg-tag)' }}>
          <Sparkles size={16} style={{ color: 'var(--gold)' }} />
        </div>
        <div>
          <h2 className="font-semibold" style={{ color: 'var(--text-primary)' }}>Consulta Inicial</h2>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
            Cole o resumo gerado pelo Portal de Transcrição IA (transcrição externa).
          </p>
        </div>
      </div>

      {!consultaEmAndamento ? (
        <button onClick={handleIniciar} disabled={iniciar.isPending} className="w-full py-3 rounded-2xl text-sm font-semibold text-white disabled:opacity-50" style={{ backgroundColor: 'var(--green-primary)' }}>
          {iniciar.isPending ? 'Iniciando...' : 'Iniciar Consulta Inicial'}
        </button>
      ) : (
        <div className="space-y-5">
          <div className="space-y-3">
            <p className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>Cole aqui o resumo da IA</p>
            <textarea
              rows={6}
              value={anamnese}
              onChange={(e) => setAnamnese(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border text-sm outline-none resize-none"
              style={{ borderColor: 'var(--border-color)', backgroundColor: 'rgb(var(--card))' }}
              placeholder="Cole aqui o resumo clínico gerado pela IA externa, ou digite a anamnese direto: queixa principal, histórico, expectativas do paciente..."
            />
            <button onClick={handleConcluir} disabled={concluir.isPending || !anamnese.trim()} className="flex items-center justify-center gap-2 w-full py-3 rounded-2xl text-sm font-semibold text-white disabled:opacity-50" style={{ backgroundColor: 'var(--green-primary)' }}>
              <Check size={15} /> {concluir.isPending ? 'Concluindo...' : 'Concluir Consulta Inicial'}
            </button>
            <button onClick={() => setConfirmCancelOpen(true)} className="w-full text-center text-xs font-medium py-1" style={{ color: 'var(--text-secondary)' }}>
              Cancelar Consulta Inicial
            </button>
          </div>

          <div className="pt-4 border-t space-y-3" style={{ borderColor: 'var(--border-color)' }}>
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              Ainda não gerou o resumo? Grave ou envie o áudio da consulta no Portal de Transcrição IA e cole o texto pronto acima.
            </p>
            <a
              href={import.meta.env.VITE_TRANSCRICAO_URL || "#"}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 w-full py-3 rounded-2xl text-sm font-semibold text-white"
              style={{ backgroundColor: '#C9A24D' }}
            >
              <ExternalLink size={15} /> Abrir Portal de Transcrição IA
            </a>
          </div>
        </div>
      )}

      {confirmCancelOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50" onClick={() => setConfirmCancelOpen(false)}>
          <div className="bg-card rounded-3xl p-8 w-[420px] shadow-2xl" onClick={(e) => e.stopPropagation()} style={{ borderTop: '3px solid #DC2626' }}>
            <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Cancelar Consulta Inicial?</h3>
            <p className="text-sm mb-6" style={{ color: 'var(--text-secondary)' }}>
              A consulta iniciada será cancelada e o texto digitado acima será perdido. Essa ação não pode ser desfeita.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmCancelOpen(false)} className="flex-1 py-3 rounded-2xl text-sm font-medium border" style={{ borderColor: 'var(--border-color)', color: 'var(--text-secondary)' }}>
                Voltar
              </button>
              <button onClick={handleCancelar} disabled={cancelar.isPending} className="flex-1 py-3 rounded-2xl text-sm font-semibold text-white disabled:opacity-50" style={{ backgroundColor: '#DC2626' }}>
                {cancelar.isPending ? 'Cancelando...' : 'Cancelar consulta'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
