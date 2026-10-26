import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useLocation, Link } from 'react-router-dom';
import {
  ArrowLeft, Sparkles, Pill, AlertCircle, HeartPulse, FileText, FlaskConical,
  Plus, X, Check, Clock, Calendar, CheckCircle2, Save,
} from 'lucide-react';
import {
  useAgendamento, useProcedimentosParaAtendimento, useSessaoAtiva,
  useIniciarSessao, useSalvarRascunhoSessao, useConcluirSessao, useCancelarSessao,
  useFotosSessao, useUploadFotoSessao, useRemoverFotoSessao,
} from '@/hooks/useModoAtendimento';
import { useExames } from '@/hooks/usePacientePerfil';
import { useMateriaisAtivos } from '@/hooks/useMateriais';
import InfoCard from '@/components/atendimento/InfoCard';
import PhotoUploader from '@/components/atendimento/PhotoUploader';
import FinalizarAtendimentoModal from '@/components/atendimento/FinalizarAtendimentoModal';
import Avatar from '@/components/paciente/Avatar';
import ConsultaInicialManual from '@/components/paciente/ConsultaInicialManual';
import { toast } from '@/components/ui/use-toast';

function TagBadge({ tag }) {
  return (
    <span className="px-2 py-0.5 rounded-md text-xs font-medium inline-flex items-center gap-1" style={{ backgroundColor: `${tag.cor}22`, color: tag.cor }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: tag.cor }} />
      {tag.nome}
    </span>
  );
}

export default function ModoAtendimento() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const extraProcedimento = location.state?.extraProcedimento;

  const { data: agendamento, isLoading: loadingAgendamento } = useAgendamento(id);
  const { data: sessaoAtiva, isLoading: loadingSessao, isError: isErrorSessaoAtiva, refetch: refetchSessaoAtiva } = useSessaoAtiva(id);
  const { data: catalogo = [] } = useProcedimentosParaAtendimento();
  const { data: materiaisAtivos = [] } = useMateriaisAtivos();

  const iniciarSessao = useIniciarSessao();
  const salvarRascunho = useSalvarRascunhoSessao();
  const concluirSessao = useConcluirSessao();
  const cancelarSessao = useCancelarSessao();

  const [planoSelecionadoId, setPlanoSelecionadoId] = useState('');
  const [observations, setObservations] = useState('');
  const [procedures, setProcedures] = useState([]);
  const [showProceduresMenu, setShowProceduresMenu] = useState(false);
  const [finalizeOpen, setFinalizeOpen] = useState(false);
  const [confirmCancelOpen, setConfirmCancelOpen] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const seededRef = useRef(false);
  const autosaveTimeoutRef = useRef(null);

  const paciente = agendamento?.pacientes;
  const { data: exames = [] } = useExames(paciente?.id);
  const { data: fotos = [] } = useFotosSessao(sessaoAtiva?.id);
  const uploadFoto = useUploadFotoSessao();
  const removerFoto = useRemoverFotoSessao();

  const consultaConcluida = (paciente?.consultas_iniciais || []).some((c) => c.status === 'concluida');
  const isNew = paciente ? !consultaConcluida : false;
  const planosAtivos = (paciente?.planos_tratamento || []).filter((p) => p.status === 'ativo');

  // Seed do rascunho (retomando sessão existente) ou dos procedimentos
  // previstos (agendamento.procedimento) na primeira carga.
  useEffect(() => {
    if (seededRef.current || !agendamento) return;
    if (sessaoAtiva) {
      setObservations(sessaoAtiva.observacoes || '');
      const base = agendamento.procedimentos
        ? [{ procedimento_id: agendamento.procedimentos.id, nome: agendamento.procedimentos.nome, planned: true }]
        : [];
      const extra = extraProcedimento && extraProcedimento.id !== agendamento.procedimentos?.id
        ? [{ procedimento_id: extraProcedimento.id, nome: extraProcedimento.nome, planned: true }]
        : [];
      setProcedures(sessaoAtiva.rascunho?.procedures?.length ? sessaoAtiva.rascunho.procedures : [...base, ...extra]);
      seededRef.current = true;
    } else if (!isNew && planosAtivos.length <= 1) {
      const base = agendamento.procedimentos
        ? [{ procedimento_id: agendamento.procedimentos.id, nome: agendamento.procedimentos.nome, planned: true }]
        : [];
      const extra = extraProcedimento && extraProcedimento.id !== agendamento.procedimentos?.id
        ? [{ procedimento_id: extraProcedimento.id, nome: extraProcedimento.nome, planned: true }]
        : [];
      setProcedures([...base, ...extra]);
      seededRef.current = true;
    }
  }, [agendamento, sessaoAtiva, isNew, planosAtivos.length]);

  // Autosave (debounced) — só depois que a sessão real já existe.
  useEffect(() => {
    if (!sessaoAtiva || !seededRef.current) return;
    const t = setTimeout(() => {
      salvarRascunho.mutate({ sessaoId: sessaoAtiva.id, observacoes: observations, rascunho: { procedures } }, {
        onSuccess: () => { setSaveFailed(false); setSavedFlash(true); setTimeout(() => setSavedFlash(false), 1200); },
        onError: (error) => {
          setSaveFailed(true);
          toast({ title: 'Falha ao salvar automaticamente', description: error?.message, variant: 'destructive' });
        },
      });
    }, 1500);
    autosaveTimeoutRef.current = t;
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [observations, procedures, sessaoAtiva?.id]);

  const handleIniciar = (planoId) => {
    iniciarSessao.mutate({ planoTratamentoId: planoId, agendamentoId: id }, {
      onError: (error) => {
        if (error?.code === '23505' && error?.message?.includes('sessoes_agendamento_ativa_uk')) {
          toast({ title: 'Este atendimento já foi iniciado', description: 'Atualizando a tela com a sessão em andamento...' });
          refetchSessaoAtiva();
          return;
        }
        if (error?.message?.includes('já existe uma sessão em andamento')) {
          toast({ title: 'Já existe uma sessão em andamento', description: error.message, variant: 'destructive' });
          refetchSessaoAtiva();
          return;
        }
        toast({ title: 'Erro ao iniciar atendimento', description: error?.message, variant: 'destructive' });
      },
    });
  };

  if (loadingAgendamento || loadingSessao) return null;

  if (!agendamento) {
    return (
      <div className="min-h-full p-10 text-center page-paper-bg" style={{ color: 'var(--text-secondary)' }}>
        Atendimento não encontrado.
        <div className="mt-4"><button onClick={() => navigate('/')} className="text-sm font-medium" style={{ color: 'var(--heading-accent)' }}>Voltar ao Dashboard</button></div>
      </div>
    );
  }

  const inicio = new Date(agendamento.inicio);
  const today = inicio.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });
  const capToday = today.charAt(0).toUpperCase() + today.slice(1);
  const tags = (paciente.paciente_tags || []).map((pt) => pt.tags).filter(Boolean);

  if (isNew) {
    const consultaEmAndamento = (paciente.consultas_iniciais || []).find((c) => c.status === 'em_andamento') || null;
    return (
      <div className="min-h-full pb-16 relative overflow-hidden page-paper-bg">
        {/* Top bar */}
        <div className="sticky top-0 z-30 backdrop-blur-md border-b" style={{ backgroundColor: 'rgb(var(--background) / 0.85)', borderColor: 'var(--border-color)' }}>
          <div className="px-4 sm:px-8 py-3.5 flex items-center gap-3">
            <button onClick={() => navigate('/')} className="p-2 rounded-xl border transition-[background-color] duration-200 hover:bg-black/5" style={{ borderColor: 'var(--border-color)' }}><ArrowLeft size={16} style={{ color: 'var(--text-secondary)' }} /></button>
            <span className="text-xs font-semibold tracking-widest px-2.5 py-1 rounded-lg" style={{ backgroundColor: 'rgba(201,162,77,0.12)', color: 'var(--gold)' }}>MODO ATENDIMENTO</span>
          </div>
        </div>

        <div className="px-8 pt-6 max-w-5xl mx-auto">
          {/* Patient header */}
          <div className="flex items-start gap-5 mb-8">
            <Avatar nome={paciente.nome} fotoUrl={paciente.fotoPerfilUrl} size="lg" />
            <div className="flex-1 min-w-0">
              <h1
                className="text-[22px] inline-block pb-0.5"
                style={{ fontFamily: "'Newsreader', serif", fontStyle: 'italic', fontWeight: 500, color: 'var(--heading-accent)', borderBottom: '1px solid var(--gold)' }}
              >
                {paciente.nome}
              </h1>
              <div className="flex items-center gap-2 flex-wrap mt-1.5">
                {tags.map((t) => <TagBadge key={t.id} tag={t} />)}
              </div>
              <p className="text-xs mt-1.5" style={{ color: 'var(--text-secondary)' }}>{paciente.telefone} · CPF {paciente.cpf}</p>
            </div>
            <div className="text-right">
              <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Consulta Inicial</p>
              <p className="text-xs flex items-center gap-1 justify-end mt-1" style={{ color: 'var(--text-secondary)' }}><Calendar size={11} /> {capToday}</p>
              <p className="text-xs flex items-center gap-1 justify-end mt-0.5" style={{ color: 'var(--text-secondary)' }}><Clock size={11} /> {inicio.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</p>
            </div>
          </div>

          <ConsultaInicialManual pacienteId={paciente.id} consultaEmAndamento={consultaEmAndamento} agendamentoId={id} />
        </div>
      </div>
    );
  }

  if (planosAtivos.length === 0) {
    return (
      <div className="min-h-full p-10 text-center page-paper-bg">
        <div className="max-w-md mx-auto" style={{ color: 'var(--text-secondary)' }}>
          <AlertCircle size={24} className="mx-auto mb-3" style={{ color: 'var(--gold)' }} />
          <p className="text-sm font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>{paciente.nome} não tem plano de tratamento ativo</p>
          <p className="text-sm mb-4">Crie um plano no perfil do paciente antes de iniciar o atendimento.</p>
          <Link to={`/pacientes/${paciente.id}`} className="text-sm font-medium" style={{ color: 'var(--heading-accent)' }}>Ir para o perfil do paciente</Link>
        </div>
      </div>
    );
  }

  if (isErrorSessaoAtiva) {
    return (
      <div className="min-h-full p-10 text-center page-paper-bg">
        <div className="max-w-sm mx-auto" style={{ color: 'var(--text-secondary)' }}>
          <AlertCircle size={24} className="mx-auto mb-3" style={{ color: '#DC2626' }} />
          <p className="text-sm font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Não foi possível carregar o atendimento</p>
          <p className="text-sm mb-4">Tente novamente em instantes.</p>
          <button onClick={() => refetchSessaoAtiva()} className="text-sm font-medium" style={{ color: 'var(--heading-accent)' }}>Tentar novamente</button>
        </div>
      </div>
    );
  }

  if (!sessaoAtiva) {
    return (
      <div className="min-h-full p-10 text-center page-paper-bg">
        <div className="max-w-sm mx-auto">
          <p className="text-sm font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>Iniciar atendimento de {paciente.nome}</p>
          {planosAtivos.length > 1 && (
            <select value={planoSelecionadoId} onChange={(e) => setPlanoSelecionadoId(e.target.value)} className="w-full mb-4 px-4 py-3 rounded-xl border text-sm outline-none bg-card" style={{ borderColor: 'var(--border-color)' }}>
              <option value="">Qual plano de tratamento é esta sessão?</option>
              {planosAtivos.map((p) => (
                <option key={p.id} value={p.id}>{p.protocolo_id ? 'Pacote' : 'Avulso'} · {p.sessoes_realizadas}{p.sessoes_contratadas ? `/${p.sessoes_contratadas}` : ''} sessões</option>
              ))}
            </select>
          )}
          <button
            onClick={() => handleIniciar(planosAtivos.length === 1 ? planosAtivos[0].id : planoSelecionadoId)}
            disabled={iniciarSessao.isPending || (planosAtivos.length > 1 && !planoSelecionadoId)}
            className="w-full py-3 rounded-2xl text-sm font-semibold text-white disabled:opacity-50"
            style={{ backgroundColor: 'var(--green-primary)' }}
          >
            {iniciarSessao.isPending ? 'Iniciando...' : 'Iniciar atendimento'}
          </button>
        </div>
      </div>
    );
  }

  const startedTime = new Date(sessaoAtiva.criado_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  const addProcedure = (proc) => {
    if (procedures.some((p) => p.procedimento_id === proc.id)) return;
    setProcedures((prev) => [...prev, { procedimento_id: proc.id, nome: proc.nome, planned: true }]);
    setShowProceduresMenu(false);
  };
  const removeProcedure = (procId) => setProcedures((prev) => prev.filter((p) => p.procedimento_id !== procId));
  const toggleProcedure = (procId) => setProcedures((prev) => prev.map((p) => p.procedimento_id === procId ? { ...p, planned: !p.planned } : p));

  const availableToAdd = catalogo.filter((c) => !procedures.some((p) => p.procedimento_id === c.id));
  const plannedProcedures = procedures.filter((p) => p.planned !== false);

  const materiaisPadrao = (() => {
    const map = new Map();
    plannedProcedures.forEach((p) => {
      const full = catalogo.find((c) => c.id === p.procedimento_id);
      (full?.procedimento_materiais || []).forEach((pm) => {
        const existing = map.get(pm.materiais.id);
        map.set(pm.materiais.id, {
          material_id: pm.materiais.id,
          nome: pm.materiais.nome,
          unidade_medida: pm.materiais.unidade_medida,
          quantidade: (existing?.quantidade || 0) + Number(pm.quantidade),
        });
      });
    });
    return [...map.values()];
  })();

  const handleUploadFotos = (files) => {
    Array.from(files).forEach((file) => {
      uploadFoto.mutate({ pacienteId: paciente.id, sessaoId: sessaoAtiva.id, file }, {
        onError: (error) => toast({ title: 'Erro ao enviar foto', description: error?.message, variant: 'destructive' }),
      });
    });
  };
  const handleRemoveFoto = (foto) => {
    removerFoto.mutate({ sessaoId: sessaoAtiva.id, documentoId: foto.id, storagePath: foto.storage_path }, {
      onError: (error) => toast({ title: 'Erro ao remover foto', description: error?.message, variant: 'destructive' }),
    });
  };

  const handleFinalize = ({ materiaisConformePadrao, materiaisExtra, observacaoFinal }) => {
    const payload = plannedProcedures.map((p, i) => ({
      procedimento_id: p.procedimento_id,
      materiais_conforme_padrao: materiaisConformePadrao,
      // extras só entram uma vez (no primeiro procedimento), pra não baixar
      // estoque em dobro caso mais de um procedimento tenha sido feito.
      ...(i === 0 && materiaisExtra.length > 0 ? { materiais_extra: materiaisExtra } : {}),
    }));
    concluirSessao.mutate({ sessaoId: sessaoAtiva.id, observacaoFinal: observacaoFinal || observations, procedimentos: payload, agendamentoId: id, pacienteId: paciente?.id }, {
      onSuccess: (data) => {
        setFinalizeOpen(false);
        toast({ title: 'Atendimento finalizado', description: 'Estoque atualizado automaticamente.' });
        // Plano com sessões pré-determinadas que acabou de bater o total —
        // leva o Dr. direto pro perfil do paciente com a caixa de desfecho
        // já aberta (mesma pergunta da finalização manual, PacientePerfil.jsx).
        if (data?.plano_finalizou && paciente?.id) {
          navigate(`/pacientes/${paciente.id}`, { state: { abrirDesfechoPlanoId: data.plano_tratamento_id } });
        } else {
          navigate('/');
        }
      },
      onError: (error) => {
        if (error?.message?.includes('não está mais ativo')) {
          toast({ title: 'Plano de tratamento cancelado', description: 'O plano de tratamento deste atendimento foi cancelado — não é possível finalizar.', variant: 'destructive' });
          return;
        }
        toast({ title: 'Erro ao finalizar atendimento', description: error?.message, variant: 'destructive' });
      },
    });
  };

  const handlePausar = () => {
    if (sessaoAtiva && seededRef.current) {
      clearTimeout(autosaveTimeoutRef.current);
      salvarRascunho.mutate({ sessaoId: sessaoAtiva.id, observacoes: observations, rascunho: { procedures } }, {
        onError: (error) => toast({ title: 'Falha ao salvar automaticamente', description: error?.message, variant: 'destructive' }),
      });
    }
    navigate('/');
  };

  const handleCancelarSessao = () => {
    cancelarSessao.mutate({ sessaoId: sessaoAtiva.id, agendamentoId: id }, {
      onSuccess: () => {
        toast({ title: 'Atendimento cancelado' });
        navigate('/');
      },
      onError: (error) => toast({ title: 'Erro ao cancelar atendimento', description: error?.message, variant: 'destructive' }),
    });
  };

  return (
    <div className="min-h-full pb-16 relative overflow-hidden page-paper-bg">
      {/* Top bar */}
      <div className="sticky top-0 z-30 backdrop-blur-md border-b" style={{ backgroundColor: 'rgb(var(--background) / 0.85)', borderColor: 'var(--border-color)' }}>
        <div className="px-4 sm:px-8 py-3.5 flex items-center flex-wrap gap-y-2 justify-between">
          <div className="flex items-center gap-3 flex-wrap">
            <button onClick={() => navigate('/')} className="p-2 rounded-xl border transition-[background-color] duration-200 hover:bg-black/5 shrink-0" style={{ borderColor: 'var(--border-color)' }}><ArrowLeft size={16} style={{ color: 'var(--text-secondary)' }} /></button>
            <span className="text-xs font-semibold tracking-widest px-2.5 py-1 rounded-lg shrink-0" style={{ backgroundColor: 'rgba(201,162,77,0.12)', color: 'var(--gold)' }}>MODO ATENDIMENTO</span>
            <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse shrink-0" /> Em andamento · iniciado às {startedTime}
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs shrink-0" style={{ color: saveFailed ? '#DC2626' : savedFlash ? 'var(--status-success-text)' : 'var(--text-secondary)' }}>
            {saveFailed ? <AlertCircle size={13} /> : savedFlash ? <Check size={13} /> : <Save size={13} />}
            <span>{saveFailed ? 'Falha ao salvar' : savedFlash ? 'Salvo' : 'Salvamento automático'}</span>
          </div>
        </div>
      </div>

      <div className="px-8 pt-6 max-w-5xl mx-auto">
        {/* Patient header */}
        <div className="flex items-start gap-5 mb-8">
          <Avatar nome={paciente.nome} fotoUrl={paciente.fotoPerfilUrl} size="lg" />
          <div className="flex-1 min-w-0">
            <h1
              className="text-[22px] inline-block pb-0.5"
              style={{ fontFamily: "'Newsreader', serif", fontStyle: 'italic', fontWeight: 500, color: 'var(--heading-accent)', borderBottom: '1px solid var(--gold)' }}
            >
              {paciente.nome}
            </h1>
            <div className="flex items-center gap-2 flex-wrap mt-1.5">
              {tags.map((t) => <TagBadge key={t.id} tag={t} />)}
            </div>
            <p className="text-xs mt-1.5" style={{ color: 'var(--text-secondary)' }}>{paciente.telefone} · CPF {paciente.cpf}</p>
          </div>
          <div className="text-right">
            <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{agendamento.procedimentos?.nome}</p>
            <p className="text-xs flex items-center gap-1 justify-end mt-1" style={{ color: 'var(--text-secondary)' }}><Calendar size={11} /> {capToday}</p>
            <p className="text-xs flex items-center gap-1 justify-end mt-0.5" style={{ color: 'var(--text-secondary)' }}><Clock size={11} /> {inicio.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main column */}
          <div className="lg:col-span-2 space-y-6">
            {/* Clinical summary */}
            {paciente.resumo_clinico && (
              <div className="rounded-2xl p-5 bg-card" style={{ borderTop: '3px solid var(--gold)', boxShadow: '0 2px 8px rgba(0,0,0,.04)' }}>
                <div className="flex items-center gap-2 mb-3">
                  <span className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'rgba(201,162,77,0.12)' }}><Sparkles size={14} style={{ color: 'var(--gold)' }} /></span>
                  <p className="text-xs font-semibold tracking-wide" style={{ color: 'var(--text-secondary)' }}>RESUMO CLÍNICO</p>
                </div>
                <p className="text-sm leading-relaxed" style={{ color: 'var(--text-primary)' }}>{paciente.resumo_clinico}</p>
              </div>
            )}

            {/* Important info */}
            <div>
              <p className="text-xs font-semibold tracking-wide mb-3" style={{ color: 'var(--text-secondary)' }}>INFORMAÇÕES IMPORTANTES</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <InfoCard icon={Pill} label="Medicamentos" color="var(--heading-accent)">
                  {paciente.medicamentos_uso?.length ? (
                    <div className="space-y-1">{paciente.medicamentos_uso.map((m) => <p key={m} className="text-sm" style={{ color: 'var(--text-primary)' }}>· {m}</p>)}</div>
                  ) : null}
                </InfoCard>
                <InfoCard icon={HeartPulse} label="Doenças" color="var(--gold)">
                  {paciente.doencas_historico?.length ? (
                    <div className="space-y-1">{paciente.doencas_historico.map((d) => <p key={d} className="text-sm" style={{ color: 'var(--text-primary)' }}>· {d}</p>)}</div>
                  ) : null}
                </InfoCard>
                <InfoCard icon={FileText} label="Destaques clínicos" color="var(--heading-accent)">
                  {paciente.destaques_clinicos?.length ? (
                    <div className="space-y-1">{paciente.destaques_clinicos.map((d, i) => <p key={i} className="text-sm" style={{ color: 'var(--text-primary)' }}>· {d}</p>)}</div>
                  ) : null}
                </InfoCard>
                <InfoCard icon={FlaskConical} label="Últimos exames" color="#3B82F6">
                  {exames.length ? (
                    <div className="space-y-1">{exames.slice(0, 3).map((e) => <div key={e.id} className="flex justify-between text-sm"><span style={{ color: 'var(--text-primary)' }}>{e.nome_exame}</span><span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{new Date(e.data_exame + 'T00:00:00').toLocaleDateString('pt-BR')}</span></div>)}</div>
                  ) : null}
                </InfoCard>
              </div>
            </div>

            {/* Procedures */}
            <div className="rounded-2xl p-5 bg-card" style={{ borderTop: '3px solid var(--gold)', boxShadow: '0 2px 8px rgba(0,0,0,.04)' }}>
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-semibold tracking-wide" style={{ color: 'var(--text-secondary)' }}>PROCEDIMENTOS DA SESSÃO</p>
                <div className="relative">
                  <button onClick={() => setShowProceduresMenu((v) => !v)} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-[background-color] duration-200 hover:bg-black/5" style={{ borderColor: 'var(--border-color)', color: 'var(--heading-accent)' }}>
                    <Plus size={12} /> Adicionar
                  </button>
                  {showProceduresMenu && (
                    <div className="absolute right-0 top-full mt-1 w-56 bg-card rounded-xl border py-1 z-20 shadow-lg" style={{ borderColor: 'var(--border-color)' }}>
                      {availableToAdd.length === 0 ? <p className="px-3 py-2 text-xs" style={{ color: 'var(--text-secondary)' }}>Todos adicionados.</p> :
                        availableToAdd.map((c) => (
                          <button key={c.id} onClick={() => addProcedure(c)} className="w-full text-left px-3 py-2 text-sm transition-[background-color] duration-200 hover:bg-black/5" style={{ color: 'var(--text-primary)' }}>{c.nome}</button>
                        ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="space-y-2">
                {procedures.length === 0 && <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Nenhum procedimento. Adicione os que serão realizados.</p>}
                {procedures.map((p) => (
                  <div key={p.procedimento_id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl border" style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-tag)' }}>
                    <button onClick={() => toggleProcedure(p.procedimento_id)} className="w-5 h-5 rounded-md flex items-center justify-center transition-[background-color] duration-200" style={p.planned !== false ? { backgroundColor: 'var(--green-primary)', color: '#fff' } : { border: '1.5px solid var(--border-color)' }}>
                      {p.planned !== false && <Check size={12} />}
                    </button>
                    <span className="text-sm flex-1" style={{ color: p.planned !== false ? 'var(--text-primary)' : 'var(--text-secondary)' }}>{p.nome}</span>
                    <button onClick={() => removeProcedure(p.procedimento_id)} className="p-1 rounded-lg hover:bg-card transition-colors"><X size={13} style={{ color: 'var(--text-secondary)' }} /></button>
                  </div>
                ))}
              </div>
            </div>

            {/* Observations */}
            <div>
              <label className="text-xs font-semibold tracking-wide block mb-2" style={{ color: 'var(--text-secondary)' }}>OBSERVAÇÕES DA SESSÃO</label>
              <textarea rows={5} value={observations} onChange={(e) => setObservations(e.target.value)} placeholder="Registre a evolução, queixas e observações desta sessão..." className="w-full px-4 py-3.5 rounded-2xl border text-sm resize-none outline-none leading-relaxed bg-card" style={{ borderColor: 'var(--border-color)', color: 'var(--text-primary)' }} />
            </div>

            {/* Photos */}
            <div>
              <label className="text-xs font-semibold tracking-wide block mb-2" style={{ color: 'var(--text-secondary)' }}>FOTOS</label>
              <PhotoUploader photos={fotos} onUpload={handleUploadFotos} onRemove={handleRemoveFoto} />
            </div>
          </div>

          {/* Right rail */}
          <div className="col-span-1">
            <div className="sticky top-24 space-y-4">
              <div className="rounded-2xl p-5" style={{ backgroundColor: 'var(--sidebar-bg)' }}>
                <p className="text-xs font-semibold text-white/50 mb-3 tracking-widest">ATENDIMENTO</p>
                <h3 className="text-white font-semibold text-sm mb-3">{paciente.nome}</h3>
                <div className="space-y-2 text-xs text-white/60 mb-5">
                  <div className="flex justify-between"><span>{agendamento.procedimentos?.nome}</span></div>
                  <div className="flex justify-between"><span>Iniciado às</span><span className="text-white/90">{startedTime}</span></div>
                  <div className="flex justify-between"><span>Fotos</span><span className="text-white/90">{fotos.length}</span></div>
                </div>
                <button
                  onClick={() => setFinalizeOpen(true)}
                  disabled={plannedProcedures.length === 0}
                  className="w-full py-3.5 rounded-2xl text-sm font-semibold transition-[transform,box-shadow] duration-200 hover:shadow-lg hover:-translate-y-0.5 flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:shadow-none disabled:hover:translate-y-0"
                  style={{ backgroundColor: 'var(--gold)', color: 'var(--green-primary)' }}
                >
                  <CheckCircle2 size={15} /> Finalizar atendimento
                </button>
                <button onClick={handlePausar} className="w-full mt-2 py-2.5 rounded-2xl text-xs font-medium text-white/60 hover:text-white/90 transition-colors">
                  Pausar e voltar ao Dashboard
                </button>
                <button onClick={() => setConfirmCancelOpen(true)} className="w-full mt-1 py-2 rounded-2xl text-xs font-medium text-red-300/70 hover:text-red-300 transition-colors">
                  Cancelar atendimento
                </button>
              </div>
              <p className="text-xs text-center px-4" style={{ color: 'var(--text-secondary)' }}>Tudo é salvo automaticamente. Você pode pausar e continuar exatamente de onde parou.</p>
            </div>
          </div>
        </div>
      </div>

      <FinalizarAtendimentoModal
        open={finalizeOpen}
        onClose={() => setFinalizeOpen(false)}
        onConfirm={handleFinalize}
        materiaisPadrao={materiaisPadrao}
        materiaisAtivos={materiaisAtivos}
        saving={concluirSessao.isPending}
      />

      {confirmCancelOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50" onClick={() => setConfirmCancelOpen(false)}>
          <div className="bg-card rounded-3xl p-8 w-[420px] shadow-2xl" onClick={(e) => e.stopPropagation()} style={{ borderTop: '3px solid #DC2626' }}>
            <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Cancelar atendimento?</h3>
            <p className="text-sm mb-6" style={{ color: 'var(--text-secondary)' }}>
              O atendimento de <strong style={{ color: 'var(--text-primary)' }}>{paciente.nome}</strong> será cancelado e as observações/procedimentos registrados até agora serão perdidos. Essa ação não pode ser desfeita.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmCancelOpen(false)} className="flex-1 py-3 rounded-2xl text-sm font-medium border" style={{ borderColor: 'var(--border-color)', color: 'var(--text-secondary)' }}>
                Voltar
              </button>
              <button onClick={handleCancelarSessao} disabled={cancelarSessao.isPending} className="flex-1 py-3 rounded-2xl text-sm font-semibold text-white disabled:opacity-50" style={{ backgroundColor: '#DC2626' }}>
                {cancelarSessao.isPending ? 'Cancelando...' : 'Cancelar atendimento'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
