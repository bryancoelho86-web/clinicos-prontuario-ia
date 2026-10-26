import { useState, useRef, useEffect, lazy, Suspense } from 'react';
import { useParams, useNavigate, useLocation, Link } from 'react-router-dom';
import {
  ArrowLeft, FileText, Plus, Sparkles, ChevronDown, ChevronUp,
  Camera, Check, CheckCircle2, Pencil, Save, X, Trash2, Upload, Download, LineChart as LineChartIcon,
} from 'lucide-react';
import {
  usePaciente, useUpdatePacienteResumo, useUpdatePacienteCpf,
  useTimelineEventos, useAdicionarObservacaoTimeline, useEditarDescricaoTimeline,
  useRegistrarSessaoRetroativa, useVincularFotoASessao,
  useFotosPaciente, useUploadFoto, useRemoverFoto,
  useExames, useUploadExame, useRemoverDocumento,
  useInvestimentos, useNotasFiscais, useCriarInvestimento, useAtualizarInvestimento, useUploadNotaFiscal,
  useGraficosExame, useCriarGraficoExame, useExcluirGraficoExame,
  useAdicionarPontoGrafico, useEditarPontoGrafico, useExcluirPontoGrafico,
  useProtocolosAtivos, useCriarPlanoTratamento, useCancelarPlanoTratamento, useRegistrarDesfechoPlano,
  useExcluirPacienteDefinitivamente,
  useAtualizarFotoPerfil, useRemoverFotoPerfil,
} from '@/hooks/usePacientePerfil';
import { useTags } from '@/hooks/useTags';
import { useProcedimentosParaAtendimento } from '@/hooks/useModoAtendimento';
import { useAgendamentoConsultaInicialPendente } from '@/hooks/useAgendamentos';
import Avatar from '@/components/paciente/Avatar';
import DatePicker from '@/components/DatePicker';
import { toast } from '@/components/ui/use-toast';
import { somenteDigitos, validarCPF, formatarCPF } from '@/lib/cpf';
import { baixarComoJpg } from '@/lib/imageOptimization';

const GraficoLinha = lazy(() => import('@/components/paciente/GraficoLinha'));

function TagBadge({ tag }) {
  return (
    <span className="px-2.5 py-1 rounded-lg text-xs font-medium inline-flex items-center gap-1.5" style={{ backgroundColor: `${tag.cor}22`, color: tag.cor }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: tag.cor }} />
      {tag.nome}
    </span>
  );
}

export default function PacientePerfil() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [activeTab, setActiveTab] = useState('timeline');
  const [modalExcluir, setModalExcluir] = useState(false);
  const [novoPlanoAberto, setNovoPlanoAberto] = useState(false);
  const [planoParaDesfecho, setPlanoParaDesfecho] = useState(null);

  const { data: paciente, isLoading } = usePaciente(id);
  const updateResumo = useUpdatePacienteResumo();

  // Precisam ser chamados incondicionalmente (regras dos Hooks) — por isso ficam
  // antes dos `return` antecipados de loading/não-encontrado, usando optional
  // chaining para tolerar `paciente` ainda não carregado.
  const consultaConcluida = (paciente?.consultas_iniciais || []).some(c => c.status === 'concluida');
  const isNew = !!paciente && !consultaConcluida;
  const consultaEmAndamento = (paciente?.consultas_iniciais || []).find((c) => c.status === 'em_andamento') || null;
  const { data: procedimentosCatalogo = [], isLoading: isLoadingConsultaInicial } = useProcedimentosParaAtendimento();
  const consultaInicialProc = procedimentosCatalogo.find((p) => p.nome === 'Consulta Inicial');
  const { data: agendamentoConsultaInicial } = useAgendamentoConsultaInicialPendente(paciente?.id, isNew ? consultaInicialProc?.id : null);

  // Redirecionado aqui pelo ModoAtendimento.jsx quando concluir a última
  // sessão de um plano com sessões pré-determinadas acaba de finalizá-lo —
  // abre a mesma caixa de desfecho da finalização manual (Tarefa 7 do plano).
  useEffect(() => {
    const planoId = location.state?.abrirDesfechoPlanoId;
    if (!planoId || !paciente) return;
    const plano = (paciente.planos_tratamento || []).find(p => p.id === planoId);
    if (plano) setPlanoParaDesfecho(plano);
    navigate(location.pathname, { replace: true });
  }, [location.state, paciente]);

  if (isLoading) return null;
  if (!paciente) return <div className="p-8">Paciente não encontrado.</div>;

  const tags = (paciente.paciente_tags || []).map(pt => pt.tags).filter(Boolean);
  const planosAtivos = (paciente.planos_tratamento || []).filter(p => p.status === 'ativo');
  const planosFinalizados = (paciente.planos_tratamento || [])
    .filter(p => p.status === 'finalizado')
    .sort((a, b) => new Date(b.data_fim) - new Date(a.data_fim));
  const activePlano = planosAtivos[0]; // mantém o subtítulo do cabeçalho como está hoje — fora de escopo mudar

  const subtitle = activePlano
    ? (activePlano.protocolos?.nome || 'Procedimento avulso')
    : isNew ? 'Aguardando consulta inicial' : 'Sem plano de tratamento ativo';

  // `data_nascimento` vem do banco como "AAAA-MM-DD" puro (coluna `date`,
  // sem hora) — `new Date("AAAA-MM-DD")` sozinho interpreta como meia-noite
  // UTC, e formatar isso no fuso local (ex: Manaus, UTC-4) mostra o dia
  // anterior. Anexar "T00:00:00" força meia-noite local, sem esse desvio
  // (achado real: paciente nascida 01/08 aparecia como 31/07 no card).
  const birthday = paciente.data_nascimento ? new Date(paciente.data_nascimento + 'T00:00:00') : null;
  const age = birthday ? (() => {
    let anos = new Date().getFullYear() - birthday.getFullYear();
    const aindaNaoFezAniversarioEsteAno =
      new Date().getMonth() < birthday.getMonth() ||
      (new Date().getMonth() === birthday.getMonth() && new Date().getDate() < birthday.getDate());
    if (aindaNaoFezAniversarioEsteAno) anos -= 1;
    return anos;
  })() : null;

  return (
    <div className="min-h-full p-4 sm:p-6 lg:p-8 pb-16 relative overflow-hidden page-paper-bg">
      {/* Header */}
      <div className="flex items-center flex-wrap gap-y-2 gap-x-4 mb-6 animate-fade-in-up">
        <button onClick={() => navigate('/pacientes')} className="p-2 rounded-xl border transition-[background-color] duration-200 hover:bg-black/5 shrink-0" style={{ borderColor: 'var(--border-color)' }}><ArrowLeft size={16} style={{ color: 'var(--text-secondary)' }} /></button>
        <div className="min-w-0">
          <h1
            className="text-[24px] inline-block pb-0.5"
            style={{ fontFamily: "'Newsreader', serif", fontStyle: 'italic', fontWeight: 500, color: 'var(--heading-accent)', borderBottom: '1px solid var(--gold)' }}
          >
            {paciente.nome}
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>{subtitle}</p>
        </div>
        <div className="ml-auto flex gap-2 items-center flex-wrap shrink-0">
          {tags.map(t => <TagBadge key={t.id} tag={t} />)}
          {isNew && <span className="px-2.5 py-1 rounded-lg text-xs font-medium" style={{ backgroundColor: 'var(--bg-tag)', color: 'var(--heading-accent)' }}>Novo paciente</span>}
        </div>
      </div>

      {/* Overview */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6 animate-fade-in-up" style={{ animationDelay: '60ms' }}>
        <ResumoCard paciente={paciente} age={age} birthday={birthday} onSave={(resumo) => updateResumo.mutate({ id: paciente.id, resumo_clinico: resumo })} saving={updateResumo.isPending} />
        <div className="space-y-4">
          <ProgressoCard
            pacienteId={paciente.id}
            planos={planosAtivos}
            planosFinalizados={planosFinalizados}
            podeCriarPlano={!isNew}
            onNovoPlano={() => setNovoPlanoAberto(true)}
            onAbrirDesfecho={(plano) => setPlanoParaDesfecho(plano)}
          />
          <ExamesCard pacienteId={paciente.id} />
        </div>
      </div>

      {/* Consulta inicial (paciente novo) */}
      {isNew && (
        <div className="mb-6">
          {consultaEmAndamento ? (
            <ConsultaEmAndamentoCard consulta={consultaEmAndamento} />
          ) : (
            <SemConsultaRegistradaCard
              paciente={paciente}
              consultaInicialId={consultaInicialProc?.id}
              agendamento={agendamentoConsultaInicial}
              isLoadingConsultaInicial={isLoadingConsultaInicial}
            />
          )}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-6 p-1 rounded-xl bg-card border w-fit" style={{ borderColor: 'var(--border-color)' }}>
        {[{ key: 'timeline', label: 'Timeline' }, { key: 'fotos', label: 'Fotos' }, { key: 'perfil', label: 'Gráficos' }, { key: 'investimentos', label: 'Investimentos' }].map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)} className="px-4 py-2 rounded-lg text-sm font-medium transition-[background-color,color] duration-200" style={activeTab === tab.key ? { backgroundColor: 'var(--green-primary)', color: '#fff' } : { color: 'var(--text-secondary)' }}>{tab.label}</button>
        ))}
      </div>

      {activeTab === 'timeline' && <TimelineTab pacienteId={paciente.id} planos={paciente.planos_tratamento} />}
      {activeTab === 'fotos' && <FotosTab pacienteId={paciente.id} />}
      {activeTab === 'perfil' && <GraficosExameTab pacienteId={paciente.id} />}
      {activeTab === 'investimentos' && <InvestimentosTab pacienteId={paciente.id} />}

      <div className="mt-12 pt-6 border-t flex justify-center" style={{ borderColor: 'var(--border-color)' }}>
        <button onClick={() => setModalExcluir(true)} className="text-xs font-medium flex items-center gap-1.5" style={{ color: 'var(--text-secondary)' }}>
          <Trash2 size={12} /> Excluir paciente
        </button>
      </div>
      {modalExcluir && <ExcluirPacienteModal paciente={paciente} onClose={() => setModalExcluir(false)} />}
      {novoPlanoAberto && <NovoPlanoModal pacienteId={paciente.id} onClose={() => setNovoPlanoAberto(false)} />}
      {planoParaDesfecho && (
        <DesfechoPlanoModal
          pacienteId={paciente.id}
          plano={planoParaDesfecho}
          onClose={() => setPlanoParaDesfecho(null)}
          onPrecisaNovoPlano={() => { setPlanoParaDesfecho(null); setNovoPlanoAberto(true); }}
        />
      )}
    </div>
  );
}

// Requisito da clínica: alguns pacientes não querem passar o
// CPF pelo WhatsApp por segurança — ele cadastra provisoriamente com o
// próprio CPF e corrige aqui quando o paciente comparece à clínica. Fica
// atrás de confirmação (não é edição direta como o resumo clínico) porque
// o CPF é o identificador do paciente no sistema, inclusive é o número
// pedido pra confirmar a exclusão de cadastro (ExcluirPacienteModal, logo
// abaixo) — nenhuma migration nova precisou existir pra isso, `cpf` já
// tinha grant de UPDATE desde a 0002.
function EditarCpfModal({ paciente, onClose }) {
  const updateCpf = useUpdatePacienteCpf();
  const [cpf, setCpf] = useState(formatarCPF(paciente.cpf));

  const cpfValido = validarCPF(cpf);
  const mudou = somenteDigitos(cpf) !== paciente.cpf;

  const handleConfirmar = () => {
    updateCpf.mutate({ id: paciente.id, cpf: somenteDigitos(cpf) }, {
      onSuccess: () => { toast({ title: 'CPF atualizado' }); onClose(); },
      onError: (error) => {
        if (error?.code === '23505') {
          toast({ title: 'Já existe outro paciente cadastrado com esse CPF', variant: 'destructive' });
          return;
        }
        toast({ title: 'Erro ao atualizar CPF', description: error?.message, variant: 'destructive' });
      },
    });
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-card rounded-3xl p-8 w-[420px] shadow-2xl" onClick={(e) => e.stopPropagation()} style={{ borderTop: '3px solid var(--gold)' }}>
        <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Editar CPF de {paciente.nome}</h3>
        <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
          O CPF é o identificador do paciente no sistema — é o número pedido pra confirmar a exclusão do cadastro, por exemplo. Confira com atenção antes de salvar.
        </p>
        <label className="text-xs font-medium block mb-1.5" style={{ color: 'var(--text-secondary)' }}>Novo CPF</label>
        <input
          value={cpf}
          onChange={(e) => setCpf(formatarCPF(e.target.value))}
          inputMode="numeric"
          maxLength={14}
          className="w-full px-4 py-3 rounded-xl border text-sm outline-none mb-1"
          style={{ borderColor: cpf.trim() && !cpfValido ? '#DC2626' : 'var(--border-color)', backgroundColor: 'rgb(var(--card))' }}
          placeholder="000.000.000-00"
        />
        {cpf.trim() && !cpfValido && (
          <p className="text-xs" style={{ color: '#DC2626' }}>CPF inválido.</p>
        )}
        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="flex-1 py-3 rounded-2xl text-sm font-medium border" style={{ borderColor: 'var(--border-color)', color: 'var(--text-secondary)' }}>
            Cancelar
          </button>
          <button
            onClick={handleConfirmar}
            disabled={!cpfValido || !mudou || updateCpf.isPending}
            className="flex-1 py-3 rounded-2xl text-sm font-semibold text-white disabled:opacity-50"
            style={{ backgroundColor: 'var(--green-primary)' }}
          >
            {updateCpf.isPending ? 'Salvando...' : 'Confirmar novo CPF'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ExcluirPacienteModal({ paciente, onClose }) {
  const navigate = useNavigate();
  const excluir = useExcluirPacienteDefinitivamente();
  const [cpfDigitado, setCpfDigitado] = useState('');

  const cpfConfere = cpfDigitado.trim() !== '' && somenteDigitos(cpfDigitado) === somenteDigitos(paciente.cpf);
  const sessoesTotais = (paciente.planos_tratamento || []).reduce((acc, p) => acc + (p.sessoes_realizadas || 0), 0);

  const handleConfirmar = () => {
    excluir.mutate({ pacienteId: paciente.id, cpfConfirmacao: cpfDigitado }, {
      onSuccess: (data) => {
        toast({ title: 'Paciente excluído permanentemente.' });
        if (data?.storageWarning) {
          toast({
            title: 'Alguns arquivos podem não ter sido removidos do Storage.',
            description: 'O paciente foi excluído normalmente, mas houve uma falha ao limpar fotos ou gravações. Se precisar, verifique o console ou contate o suporte.',
          });
        }
        navigate('/pacientes');
      },
      onError: (error) => toast({ title: 'Erro ao excluir paciente', description: error?.message, variant: 'destructive' }),
    });
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-card rounded-3xl p-8 w-[480px] shadow-2xl" onClick={(e) => e.stopPropagation()} style={{ borderTop: '3px solid #DC2626' }}>
        <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Excluir {paciente.nome}?</h3>
        <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
          Isso vai apagar permanentemente o cadastro, {sessoesTotais} sessão(ões) registrada(s),
          todas as fotos, exames, timeline e gravações de IA deste paciente. <strong style={{ color: 'var(--text-primary)' }}>Essa ação não pode ser desfeita.</strong>
        </p>
        <label className="text-xs font-medium block mb-1.5" style={{ color: 'var(--text-secondary)' }}>
          Digite o CPF do paciente ({paciente.cpf}) para confirmar
        </label>
        <input
          value={cpfDigitado}
          onChange={(e) => setCpfDigitado(e.target.value)}
          className="w-full px-4 py-3 rounded-xl border text-sm outline-none mb-4"
          style={{ borderColor: 'var(--border-color)', backgroundColor: 'rgb(var(--card))', color: 'var(--text-primary)' }}
          placeholder="000.000.000-00"
        />
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-3 rounded-2xl text-sm font-medium border" style={{ borderColor: 'var(--border-color)', color: 'var(--text-secondary)' }}>
            Cancelar
          </button>
          <button
            onClick={handleConfirmar}
            disabled={!cpfConfere || excluir.isPending}
            className="flex-1 py-3 rounded-2xl text-sm font-semibold text-white disabled:opacity-50"
            style={{ backgroundColor: '#DC2626' }}
          >
            {excluir.isPending ? 'Excluindo...' : 'Excluir permanentemente'}
          </button>
        </div>
      </div>
    </div>
  );
}

function AvatarUpload({ paciente }) {
  const inputRef = useRef(null);
  const atualizar = useAtualizarFotoPerfil();
  const remover = useRemoverFotoPerfil();
  const [confirmRemover, setConfirmRemover] = useState(false);

  const handleFile = (file) => {
    if (!file) return;
    if (file.size > 3 * 1024 * 1024) {
      toast({ title: 'Arquivo muito grande', description: 'O limite é 3MB.', variant: 'destructive' });
      return;
    }
    atualizar.mutate({ pacienteId: paciente.id, file, fotoPerfilPathAtual: paciente.foto_perfil_path }, {
      onSuccess: (data) => {
        if (data?.storageWarning) {
          toast({
            title: 'Foto atualizada, mas a foto antiga pode não ter sido removida do Storage.',
            description: 'Isso não afeta a foto nova, que já está em uso.',
          });
        }
      },
      onError: (error) => toast({ title: 'Erro ao enviar foto', description: error?.message, variant: 'destructive' }),
    });
  };

  return (
    <div className="relative group shrink-0">
      <button onClick={() => inputRef.current?.click()} className="block rounded-2xl overflow-hidden" aria-label="Enviar foto de perfil">
        <Avatar nome={paciente.nome} fotoUrl={paciente.fotoPerfilUrl} size="md" />
        <div className="absolute inset-0 rounded-2xl bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <Camera size={16} className="text-white" />
        </div>
      </button>
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={(e) => { handleFile(e.target.files?.[0]); e.target.value = ''; }} />
      {paciente.foto_perfil_path && (
        <button onClick={() => setConfirmRemover(true)} aria-label="Remover foto de perfil" className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-black/70 flex items-center justify-center">
          <X size={11} className="text-white" />
        </button>
      )}
      {confirmRemover && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50" onClick={() => setConfirmRemover(false)}>
          <div className="bg-card rounded-3xl p-8 w-[420px] shadow-2xl" onClick={(e) => e.stopPropagation()} style={{ borderTop: '3px solid #DC2626' }}>
            <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Remover foto de perfil?</h3>
            <p className="text-sm mb-6" style={{ color: 'var(--text-secondary)' }}>O paciente volta a mostrar as iniciais.</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmRemover(false)} className="flex-1 py-3 rounded-2xl text-sm font-medium border" style={{ borderColor: 'var(--border-color)', color: 'var(--text-secondary)' }}>
                Cancelar
              </button>
              <button
                onClick={() => remover.mutate({ pacienteId: paciente.id, fotoPerfilPath: paciente.foto_perfil_path }, {
                  onSuccess: (data) => {
                    setConfirmRemover(false);
                    if (data?.storageWarning) {
                      toast({
                        title: 'Foto removida, mas o arquivo pode não ter sido apagado do Storage.',
                        description: 'O paciente já não mostra mais essa foto.',
                      });
                    }
                  },
                })}
                disabled={remover.isPending}
                className="flex-1 py-3 rounded-2xl text-sm font-semibold text-white disabled:opacity-50"
                style={{ backgroundColor: '#DC2626' }}
              >
                {remover.isPending ? 'Removendo...' : 'Remover'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ResumoCard({ paciente, age, birthday, onSave, saving }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(paciente.resumo_clinico || '');
  const [editandoCpf, setEditandoCpf] = useState(false);

  const startEdit = () => { setDraft(paciente.resumo_clinico || ''); setEditing(true); };
  const save = () => { onSave(draft); setEditing(false); };
  const destaques = paciente.destaques_clinicos || [];

  return (
    <div className="col-span-2 bg-card rounded-2xl p-6" style={{ borderTop: '3px solid var(--gold)', boxShadow: '0 8px 20px rgba(0,0,0,.05)' }}>
      <div className="flex items-center gap-3 mb-4">
        <AvatarUpload paciente={paciente} />
        <div>
          <h2 className="font-semibold" style={{ color: 'var(--text-primary)' }}>{paciente.nome}</h2>
          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
            {age != null && `${age} anos · `}{birthday ? birthday.toLocaleDateString('pt-BR') : 'data de nascimento não informada'} · {paciente.cpf}
            <button onClick={() => setEditandoCpf(true)} aria-label="Editar CPF" className="inline-flex align-middle ml-1">
              <Pencil size={10} style={{ color: 'var(--text-secondary)' }} />
            </button>
            {' · '}{paciente.telefone || 'Sem telefone cadastrado'}
          </p>
        </div>
      </div>
      {editandoCpf && <EditarCpfModal paciente={paciente} onClose={() => setEditandoCpf(false)} />}

      {editing ? (
        <div className="space-y-2 mb-5">
          <textarea rows={3} value={draft} onChange={(e) => setDraft(e.target.value)} className="w-full px-3 py-2 rounded-xl border text-sm outline-none resize-none" style={{ borderColor: 'var(--border-color)', backgroundColor: 'rgb(var(--card))' }} />
          <div className="flex gap-2 justify-end">
            <button onClick={() => setEditing(false)} className="px-2.5 py-1 rounded-lg text-xs font-medium border" style={{ borderColor: 'var(--border-color)', color: 'var(--text-secondary)' }}>Cancelar</button>
            <button onClick={save} disabled={saving} className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold text-white disabled:opacity-50" style={{ backgroundColor: 'var(--green-primary)' }}><Save size={11} /> Salvar</button>
          </div>
        </div>
      ) : (
        <div className="mb-5">
          <p className="text-sm leading-relaxed whitespace-pre-line" style={{ color: 'var(--text-primary)' }}>{paciente.resumo_clinico || 'Sem resumo clínico registrado.'}</p>
          <div className="flex items-center gap-3 mt-2">
            <button onClick={startEdit} className="flex items-center gap-1.5 text-xs font-medium" style={{ color: 'var(--heading-accent)' }}><Pencil size={11} /> Editar resumo</button>
            {paciente.resumo_ia_atualizado_em && (
              <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--text-secondary)' }}>
                <Sparkles size={11} /> Atualizado por IA em {new Date(paciente.resumo_ia_atualizado_em).toLocaleDateString('pt-BR')}
              </span>
            )}
          </div>
        </div>
      )}

      {destaques.length > 0 && (
        <div>
          <p className="text-xs font-semibold mb-2.5 tracking-wide" style={{ color: 'var(--text-secondary)' }}>PRINCIPAIS PONTOS</p>
          <div className="grid grid-cols-2 gap-2">
            {destaques.map((h, i) => (
              <div key={i} className="flex items-start gap-2 p-3 rounded-xl" style={{ backgroundColor: 'var(--bg-tag)' }}>
                <Sparkles size={14} className="shrink-0 mt-0.5" style={{ color: 'var(--heading-accent)' }} />
                <span className="text-sm" style={{ color: 'var(--text-primary)' }}>{h}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ProgressoCard({ pacienteId, planos, planosFinalizados, podeCriarPlano, onNovoPlano, onAbrirDesfecho }) {
  const [planoParaCancelar, setPlanoParaCancelar] = useState(null);
  return (
    <div className="bg-card rounded-2xl p-5" style={{ borderTop: '3px solid var(--gold)', boxShadow: '0 8px 20px rgba(0,0,0,.05)' }}>
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>PROGRESSO</p>
        {podeCriarPlano && (
          <button onClick={onNovoPlano} className="text-xs font-medium" style={{ color: 'var(--heading-accent)' }}>+ Novo plano</button>
        )}
      </div>
      {planos.length === 0 ? (
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Sem plano de tratamento ativo.</p>
      ) : (
        <div className="space-y-4">
          {planos.map((plano) => (
            <div key={plano.id} className="group">
              <div className="flex items-center justify-between mb-2">
                {plano.tags ? (
                  <span className="px-2 py-0.5 rounded-lg text-xs font-medium inline-flex items-center gap-1.5" style={{ backgroundColor: `${plano.tags.cor}22`, color: plano.tags.cor }}>
                    <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: plano.tags.cor }} />
                    {plano.tags.nome}
                  </span>
                ) : <span />}
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  {!plano.sessoes_contratadas && (
                    <button onClick={() => onAbrirDesfecho(plano)} className="p-1 rounded-lg" aria-label="Finalizar tratamento">
                      <CheckCircle2 size={14} style={{ color: 'var(--green-primary)' }} />
                    </button>
                  )}
                  <button onClick={() => setPlanoParaCancelar(plano)} className="p-1 rounded-lg" aria-label="Cancelar plano">
                    <Trash2 size={14} style={{ color: '#DC2626' }} />
                  </button>
                </div>
              </div>
              {plano.sessoes_contratadas ? (
                <>
                  <div className="flex justify-between mb-2">
                    <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{plano.sessoes_realizadas} de {plano.sessoes_contratadas}</span>
                    <span className="text-sm font-semibold" style={{ color: 'var(--heading-accent)' }}>{Math.round((plano.sessoes_realizadas / plano.sessoes_contratadas) * 100)}%</span>
                  </div>
                  <div className="h-2 rounded-full" style={{ backgroundColor: 'var(--bg-tag)' }}><div className="h-2 rounded-full transition-[width] duration-300" style={{ width: `${Math.min(100, Math.round((plano.sessoes_realizadas / plano.sessoes_contratadas) * 100))}%`, backgroundColor: 'var(--heading-accent)' }} /></div>
                  <p className="text-xs mt-2" style={{ color: 'var(--text-secondary)' }}>Faltam {Math.max(0, plano.sessoes_contratadas - plano.sessoes_realizadas)} sessões</p>
                </>
              ) : (
                <p className="text-sm" style={{ color: 'var(--text-primary)' }}>{plano.sessoes_realizadas} sessões realizadas <span style={{ color: 'var(--text-secondary)' }}>(sem número total fixo)</span></p>
              )}
            </div>
          ))}
        </div>
      )}
      {planosFinalizados.length > 0 && (
        <div className="mt-4 pt-4 border-t space-y-2" style={{ borderColor: 'var(--border-color)' }}>
          {planosFinalizados.map((plano) => (
            <div key={plano.id} className="flex items-center justify-between gap-2" style={{ opacity: 0.6 }}>
              <div className="flex items-center gap-1.5 min-w-0">
                {plano.tags && <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: plano.tags.cor }} />}
                <span className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>
                  {plano.tags?.nome || 'Plano'} · finalizado em {new Date(plano.data_fim + 'T00:00:00').toLocaleDateString('pt-BR')}
                </span>
              </div>
              {plano.finalizado_com_melhora === null ? (
                <button onClick={() => onAbrirDesfecho(plano)} className="text-xs font-medium shrink-0" style={{ color: 'var(--heading-accent)' }}>Registrar desfecho</button>
              ) : (
                <span className="text-xs font-medium shrink-0" style={{ color: plano.finalizado_com_melhora ? 'var(--green-primary)' : 'var(--text-secondary)' }}>
                  {plano.finalizado_com_melhora ? '✓ Melhora relatada' : 'Sem melhora relatada'}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
      {planoParaCancelar && (
        <CancelarPlanoModal
          pacienteId={pacienteId}
          plano={planoParaCancelar}
          onClose={() => setPlanoParaCancelar(null)}
        />
      )}
    </div>
  );
}

const TIPOS_PLANO = ['Avulso', 'Premium', 'Por Sessão', 'Home Care', 'Manutenção'];

function NovoPlanoModal({ pacienteId, onClose }) {
  const { data: protocolos = [] } = useProtocolosAtivos();
  const { data: tags = [] } = useTags();
  const criarPlano = useCriarPlanoTratamento();
  const [tipo, setTipo] = useState('Avulso');
  const [protocoloId, setProtocoloId] = useState('');
  const [temSessoes, setTemSessoes] = useState(true);
  const [sessoes, setSessoes] = useState(10);

  const sessoesInvalidas = temSessoes && (sessoes === '' || Number(sessoes) < 1);

  const handleSave = () => {
    const tag = tags.find((t) => t.nome === tipo);
    criarPlano.mutate({
      pacienteId,
      protocoloId: protocoloId || null,
      sessoesContratadas: temSessoes ? Number(sessoes) : null,
      tagId: tag?.id || null,
    }, {
      onSuccess: () => { onClose(); toast({ title: 'Plano de tratamento criado' }); },
      onError: (error) => toast({ title: 'Erro ao criar plano', description: error?.message, variant: 'destructive' }),
    });
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-card rounded-3xl p-8 w-[440px] shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>Novo plano de tratamento</h3>
          <button onClick={onClose} className="p-1 rounded-lg transition-[background-color] duration-200 hover:bg-black/5"><X size={18} style={{ color: 'var(--text-secondary)' }} /></button>
        </div>
        <div className="space-y-4">
          {protocolos.length > 0 && (
            <div>
              <label className="text-xs font-medium block mb-1.5" style={{ color: 'var(--text-secondary)' }}>Protocolo (opcional)</label>
              <select value={protocoloId} onChange={(e) => setProtocoloId(e.target.value)} className="w-full px-4 py-3 rounded-xl border text-sm outline-none bg-card" style={{ borderColor: 'var(--border-color)' }}>
                <option value="">Nenhum (plano avulso/personalizado)</option>
                {protocolos.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
              </select>
            </div>
          )}
          <div>
            <label className="text-xs font-medium block mb-1.5" style={{ color: 'var(--text-secondary)' }}>Tipo</label>
            <div className="grid grid-cols-2 gap-2">
              {TIPOS_PLANO.map((nome) => (
                <button
                  key={nome}
                  onClick={() => setTipo(nome)}
                  className="py-2.5 rounded-2xl border-2 text-sm font-medium transition-[border-color,background-color,color] duration-200"
                  style={tipo === nome ? { borderColor: 'var(--heading-accent)', backgroundColor: 'var(--bg-tag)', color: 'var(--heading-accent)' } : { borderColor: 'var(--border-color)', color: 'var(--text-secondary)' }}
                >
                  {nome}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs font-medium block mb-1.5" style={{ color: 'var(--text-secondary)' }}>Terá sessões pré-determinadas?</label>
            <div className="grid grid-cols-2 gap-2 mb-3">
              {[['Sim', true], ['Não', false]].map(([label, val]) => (
                <button
                  key={label}
                  onClick={() => setTemSessoes(val)}
                  className="py-2.5 rounded-2xl border-2 text-sm font-medium transition-[border-color,background-color,color] duration-200"
                  style={temSessoes === val ? { borderColor: 'var(--heading-accent)', backgroundColor: 'var(--bg-tag)', color: 'var(--heading-accent)' } : { borderColor: 'var(--border-color)', color: 'var(--text-secondary)' }}
                >
                  {label}
                </button>
              ))}
            </div>
            {temSessoes && (
              <input type="number" min={1} value={sessoes} onChange={(e) => setSessoes(e.target.value)} className="w-full px-4 py-3 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--border-color)', backgroundColor: 'rgb(var(--card))' }} placeholder="Número de sessões" />
            )}
          </div>
        </div>
        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="flex-1 py-3 rounded-2xl text-sm font-medium border" style={{ borderColor: 'var(--border-color)', color: 'var(--text-secondary)' }}>Cancelar</button>
          <button onClick={handleSave} disabled={criarPlano.isPending || sessoesInvalidas} className="flex-1 py-3 rounded-2xl text-sm font-semibold text-white disabled:opacity-50" style={{ backgroundColor: 'var(--green-primary)' }}>
            {criarPlano.isPending ? 'Criando...' : 'Criar plano'}
          </button>
        </div>
      </div>
    </div>
  );
}

function CancelarPlanoModal({ pacienteId, plano, onClose }) {
  const cancelarPlano = useCancelarPlanoTratamento();
  const [motivo, setMotivo] = useState('');

  const handleConfirmar = () => {
    cancelarPlano.mutate({ pacienteId, planoId: plano.id, motivo: motivo.trim() || null }, {
      onSuccess: () => { toast({ title: 'Plano de tratamento cancelado.' }); onClose(); },
      onError: (error) => toast({ title: 'Erro ao cancelar plano', description: error?.message, variant: 'destructive' }),
    });
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-card rounded-3xl p-8 w-[440px] shadow-2xl" onClick={(e) => e.stopPropagation()} style={{ borderTop: '3px solid #DC2626' }}>
        <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
          Cancelar plano{plano.tags ? ` "${plano.tags.nome}"` : ''}?
        </h3>
        <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
          {plano.sessoes_realizadas} sessão(ões) já realizada(s) continuam no histórico. Essa ação não pode ser desfeita.
        </p>
        <label className="text-xs font-medium block mb-1.5" style={{ color: 'var(--text-secondary)' }}>Motivo do cancelamento (opcional)</label>
        <textarea
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          rows={3}
          className="w-full px-4 py-3 rounded-xl border text-sm outline-none resize-none mb-6"
          style={{ borderColor: 'var(--border-color)', backgroundColor: 'rgb(var(--card))' }}
        />
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-3 rounded-2xl text-sm font-medium border" style={{ borderColor: 'var(--border-color)', color: 'var(--text-secondary)' }}>
            Voltar
          </button>
          <button
            onClick={handleConfirmar}
            disabled={cancelarPlano.isPending}
            className="flex-1 py-3 rounded-2xl text-sm font-semibold text-white disabled:opacity-50"
            style={{ backgroundColor: '#DC2626' }}
          >
            {cancelarPlano.isPending ? 'Cancelando...' : 'Cancelar plano'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Cobre os dois contextos de desfecho (registrar_desfecho_plano_tratamento,
// migration 0040): plano.status === 'ativo' (sem sessões pré-determinadas,
// finalização manual pelo botão do card) e plano.status === 'finalizado'
// (já finalizado automaticamente ao bater o total de sessões — ModoAtendimento.jsx
// leva o Dr. até aqui, ou o Dr. reabre depois pelo link "Registrar desfecho").
function DesfechoPlanoModal({ pacienteId, plano, onClose, onPrecisaNovoPlano }) {
  const registrarDesfecho = useRegistrarDesfechoPlano();
  const uploadFoto = useUploadFoto();
  const [teveMelhora, setTeveMelhora] = useState(null);
  const [observacao, setObservacao] = useState('');
  const [foto, setFoto] = useState(null);
  const [precisaNovoPlano, setPrecisaNovoPlano] = useState(null);
  const [enviandoFoto, setEnviandoFoto] = useState(false);

  const jaFinalizado = plano.status === 'finalizado';
  const podeConfirmar = teveMelhora !== null && observacao.trim() !== '' && precisaNovoPlano !== null;

  const finalizarFluxo = () => {
    if (precisaNovoPlano) { onPrecisaNovoPlano(); return; }
    toast({ title: jaFinalizado ? 'Desfecho registrado' : 'Tratamento finalizado' });
    onClose();
  };

  const handleConfirmar = () => {
    registrarDesfecho.mutate({ pacienteId, planoId: plano.id, teveMelhora, observacao: observacao.trim() }, {
      onSuccess: () => {
        if (!foto) { finalizarFluxo(); return; }
        setEnviandoFoto(true);
        uploadFoto.mutate({ pacienteId, file: foto, titulo: 'Finalização' }, {
          onSuccess: finalizarFluxo,
          onError: (error) => {
            toast({ title: 'Desfecho registrado, mas a foto não foi enviada', description: error?.message, variant: 'destructive' });
            finalizarFluxo();
          },
        });
      },
      onError: (error) => toast({ title: 'Erro ao registrar desfecho', description: error?.message, variant: 'destructive' }),
    });
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-card rounded-3xl p-8 w-[440px] shadow-2xl" onClick={(e) => e.stopPropagation()} style={{ borderTop: '3px solid var(--green-primary)' }}>
        <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
          {jaFinalizado ? 'Registrar desfecho' : 'Finalizar tratamento'}{plano.tags ? ` "${plano.tags.nome}"` : ''}
        </h3>
        <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
          {jaFinalizado
            ? 'Esse plano já foi finalizado automaticamente ao concluir a última sessão. Registre aqui como foi o desfecho.'
            : 'O paciente recebe a tag "Finalizado". Essa ação não pode ser desfeita.'}
        </p>
        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium block mb-1.5" style={{ color: 'var(--text-secondary)' }}>O paciente teve uma melhora significativa?</label>
            <div className="grid grid-cols-2 gap-2">
              {[['Sim', true], ['Não', false]].map(([label, val]) => (
                <button key={label} onClick={() => setTeveMelhora(val)} className="py-2.5 rounded-2xl border-2 text-sm font-medium transition-[border-color,background-color,color] duration-200" style={teveMelhora === val ? { borderColor: 'var(--heading-accent)', backgroundColor: 'var(--bg-tag)', color: 'var(--heading-accent)' } : { borderColor: 'var(--border-color)', color: 'var(--text-secondary)' }}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs font-medium block mb-1.5" style={{ color: 'var(--text-secondary)' }}>Observação (obrigatório)</label>
            <textarea value={observacao} onChange={(e) => setObservacao(e.target.value)} rows={3} className="w-full px-4 py-3 rounded-xl border text-sm outline-none resize-none" style={{ borderColor: 'var(--border-color)', backgroundColor: 'rgb(var(--card))' }} placeholder="Ex: paciente relatou redução significativa da queda, encerrando acompanhamento." />
          </div>
          <div>
            <label className="text-xs font-medium block mb-1.5" style={{ color: 'var(--text-secondary)' }}>Foto (opcional)</label>
            <input type="file" accept="image/*" onChange={(e) => setFoto(e.target.files?.[0] || null)} className="w-full text-sm" />
          </div>
          <div>
            <label className="text-xs font-medium block mb-1.5" style={{ color: 'var(--text-secondary)' }}>Esse paciente precisa de mais sessões ou outro plano?</label>
            <div className="grid grid-cols-2 gap-2">
              {[['Sim', true], ['Não', false]].map(([label, val]) => (
                <button key={label} onClick={() => setPrecisaNovoPlano(val)} className="py-2.5 rounded-2xl border-2 text-sm font-medium transition-[border-color,background-color,color] duration-200" style={precisaNovoPlano === val ? { borderColor: 'var(--heading-accent)', backgroundColor: 'var(--bg-tag)', color: 'var(--heading-accent)' } : { borderColor: 'var(--border-color)', color: 'var(--text-secondary)' }}>
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="flex-1 py-3 rounded-2xl text-sm font-medium border" style={{ borderColor: 'var(--border-color)', color: 'var(--text-secondary)' }}>
            Fechar
          </button>
          <button onClick={handleConfirmar} disabled={!podeConfirmar || registrarDesfecho.isPending || enviandoFoto} className="flex-1 py-3 rounded-2xl text-sm font-semibold text-white disabled:opacity-50" style={{ backgroundColor: 'var(--green-primary)' }}>
            {enviandoFoto ? 'Enviando foto...' : registrarDesfecho.isPending ? 'Salvando...' : jaFinalizado ? 'Registrar desfecho' : 'Finalizar tratamento'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ConsultaEmAndamentoCard({ consulta }) {
  return (
    <div className="bg-card rounded-2xl p-6 flex items-center justify-between gap-4" style={{ borderTop: '3px solid var(--gold)', boxShadow: '0 8px 20px rgba(0,0,0,.05)' }}>
      <div>
        <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Consulta Inicial em andamento</p>
        <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
          {consulta.agendamento_id ? 'Continue de onde parou.' : 'Sem agendamento vinculado a este registro.'}
        </p>
      </div>
      {consulta.agendamento_id && (
        <Link to={`/atendimento/${consulta.agendamento_id}`} className="shrink-0 px-4 py-2.5 rounded-2xl text-sm font-semibold text-white" style={{ backgroundColor: 'var(--green-primary)' }}>
          Continuar
        </Link>
      )}
    </div>
  );
}

function SemConsultaRegistradaCard({ paciente, consultaInicialId, agendamento, isLoadingConsultaInicial }) {
  const navigate = useNavigate();

  const handleAgendar = () => {
    navigate('/agenda', { state: { novoAgendamento: { patientId: paciente.id, treatmentId: consultaInicialId || null } } });
  };

  if (agendamento) {
    const dataFormatada = new Date(agendamento.inicio).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    return (
      <div className="bg-card rounded-2xl p-6" style={{ borderTop: '3px solid var(--gold)', boxShadow: '0 8px 20px rgba(0,0,0,.05)' }}>
        <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Consulta Inicial agendada</p>
        <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>Para {dataFormatada}. No dia, inicie pelo Dashboard.</p>
      </div>
    );
  }

  return (
    <div className="bg-card rounded-2xl p-6 flex items-center justify-between gap-4" style={{ borderTop: '3px solid var(--gold)', boxShadow: '0 8px 20px rgba(0,0,0,.05)' }}>
      <div>
        <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Nenhuma consulta registrada</p>
        <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>{paciente.nome} ainda não teve nenhuma Consulta Inicial agendada ou feita.</p>
      </div>
      <button onClick={handleAgendar} disabled={isLoadingConsultaInicial} className="shrink-0 px-4 py-2.5 rounded-2xl text-sm font-semibold text-white disabled:opacity-50" style={{ backgroundColor: 'var(--green-primary)' }}>
        Agendar Consulta Inicial
      </button>
    </div>
  );
}

function ExamesCard({ pacienteId }) {
  const { data: exames = [] } = useExames(pacienteId);
  const [modal, setModal] = useState(false);
  const [exameParaExcluir, setExameParaExcluir] = useState(null);
  return (
    <div className="bg-card rounded-2xl p-5" style={{ borderTop: '3px solid var(--gold)', boxShadow: '0 8px 20px rgba(0,0,0,.05)' }}>
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>EXAMES</p>
        <button onClick={() => setModal(true)} className="text-xs font-medium" style={{ color: 'var(--heading-accent)' }}>+ Adicionar</button>
      </div>
      {exames.length === 0 ? (
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Nenhum exame registrado.</p>
      ) : (
        <div className="space-y-2">
          {exames.slice(0, 5).map(e => (
            <a key={e.id} href={e.signedUrl} target="_blank" rel="noreferrer" className="group flex items-center justify-between p-2.5 rounded-xl border cursor-pointer transition-[background-color] duration-200 hover:bg-black/5" style={{ borderColor: 'var(--border-color)' }}>
              <div><p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{e.nome_exame}</p><p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{new Date(e.data_exame + 'T00:00:00').toLocaleDateString('pt-BR')}</p></div>
              <div className="flex items-center gap-2">
                <button
                  onClick={(ev) => { ev.preventDefault(); ev.stopPropagation(); setExameParaExcluir(e); }}
                  className="p-1 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                  aria-label="Excluir exame"
                >
                  <Trash2 size={14} style={{ color: '#DC2626' }} />
                </button>
                <FileText size={14} style={{ color: 'var(--text-secondary)' }} />
              </div>
            </a>
          ))}
        </div>
      )}
      {modal && <NovoExameModal pacienteId={pacienteId} onClose={() => setModal(false)} />}
      {exameParaExcluir && (
        <ConfirmarExcluirExameModal
          pacienteId={pacienteId}
          exame={exameParaExcluir}
          onClose={() => setExameParaExcluir(null)}
        />
      )}
    </div>
  );
}

function ConfirmarExcluirExameModal({ pacienteId, exame, onClose }) {
  const removerDocumento = useRemoverDocumento();

  const handleConfirmar = () => {
    removerDocumento.mutate({ documentoId: exame.documento_id, pacienteId }, {
      onSuccess: () => { toast({ title: 'Exame excluído.' }); onClose(); },
      onError: (error) => toast({ title: 'Erro ao excluir exame', description: error?.message, variant: 'destructive' }),
    });
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-card rounded-3xl p-8 w-[420px] shadow-2xl" onClick={(e) => e.stopPropagation()} style={{ borderTop: '3px solid #DC2626' }}>
        <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Excluir exame?</h3>
        <p className="text-sm mb-6" style={{ color: 'var(--text-secondary)' }}>
          Tem certeza que quer excluir <strong style={{ color: 'var(--text-primary)' }}>"{exame.nome_exame}"</strong>? Essa ação não pode ser desfeita.
        </p>
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-3 rounded-2xl text-sm font-medium border" style={{ borderColor: 'var(--border-color)', color: 'var(--text-secondary)' }}>
            Cancelar
          </button>
          <button
            onClick={handleConfirmar}
            disabled={removerDocumento.isPending}
            className="flex-1 py-3 rounded-2xl text-sm font-semibold text-white disabled:opacity-50"
            style={{ backgroundColor: '#DC2626' }}
          >
            {removerDocumento.isPending ? 'Excluindo...' : 'Excluir'}
          </button>
        </div>
      </div>
    </div>
  );
}

function NovoExameModal({ pacienteId, onClose }) {
  const [nome, setNome] = useState('');
  const [data, setData] = useState(new Date().toISOString().slice(0, 10));
  const [observacoes, setObservacoes] = useState('');
  const [file, setFile] = useState(null);
  const uploadExame = useUploadExame();

  const handleSave = () => {
    if (!nome.trim() || !file) return;
    uploadExame.mutate({ pacienteId, file, nomeExame: nome.trim(), dataExame: data, observacoes: observacoes.trim() }, {
      onSuccess: () => onClose(),
      onError: (error) => toast({ title: 'Erro ao adicionar exame', description: error?.message, variant: 'destructive' }),
    });
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-card rounded-3xl p-8 w-[440px] shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>Novo exame</h3>
          <button onClick={onClose} className="p-1 rounded-lg transition-[background-color] duration-200 hover:bg-black/5"><X size={18} style={{ color: 'var(--text-secondary)' }} /></button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium block mb-1.5" style={{ color: 'var(--text-secondary)' }}>Nome do exame</label>
            <input value={nome} onChange={(e) => setNome(e.target.value)} className="w-full px-4 py-3 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--border-color)', backgroundColor: 'rgb(var(--card))' }} placeholder="Ex: Hemograma" />
          </div>
          <div>
            <label className="text-xs font-medium block mb-1.5" style={{ color: 'var(--text-secondary)' }}>Data do exame</label>
            <DatePicker value={data} onChange={setData} />
          </div>
          <div>
            <label className="text-xs font-medium block mb-1.5" style={{ color: 'var(--text-secondary)' }}>Observações (opcional)</label>
            <textarea rows={2} value={observacoes} onChange={(e) => setObservacoes(e.target.value)} className="w-full px-4 py-3 rounded-xl border text-sm outline-none resize-none" style={{ borderColor: 'var(--border-color)', backgroundColor: 'rgb(var(--card))' }} />
          </div>
          <div>
            <label className="text-xs font-medium block mb-1.5" style={{ color: 'var(--text-secondary)' }}>Arquivo</label>
            <input type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} className="w-full text-sm" />
          </div>
        </div>
        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="flex-1 py-3 rounded-2xl text-sm font-medium border" style={{ borderColor: 'var(--border-color)', color: 'var(--text-secondary)' }}>Cancelar</button>
          <button onClick={handleSave} disabled={uploadExame.isPending || !nome.trim() || !file} className="flex-1 py-3 rounded-2xl text-sm font-semibold text-white disabled:opacity-50" style={{ backgroundColor: 'var(--green-primary)' }}>
            {uploadExame.isPending ? 'Enviando...' : 'Adicionar exame'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Requisito do cliente (2026-08-25): opcional por paciente — a aba fica vazia até
// ele decidir "iniciar" um investimento. Valor total/pago são campos
// manuais independentes (não somam as notas fiscais, que são só a
// biblioteca de comprovantes anexados — mesmo padrão de ExamesCard).
function InvestimentosTab({ pacienteId }) {
  const { data: investimentos = [] } = useInvestimentos(pacienteId);
  const { data: notasFiscais = [] } = useNotasFiscais(pacienteId);
  const [modalAberto, setModalAberto] = useState(false);

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>INVESTIMENTOS</p>
        <button onClick={() => setModalAberto(true)} className="text-xs font-medium" style={{ color: 'var(--heading-accent)' }}>+ Novo investimento</button>
      </div>
      {investimentos.length === 0 ? (
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Nenhum investimento registrado ainda.</p>
      ) : (
        <div className="space-y-4">
          {investimentos.map((inv) => (
            <InvestimentoCard
              key={inv.id}
              pacienteId={pacienteId}
              investimento={inv}
              notasFiscais={notasFiscais.filter((n) => n.investimento_id === inv.id)}
            />
          ))}
        </div>
      )}
      {modalAberto && <NovoInvestimentoModal pacienteId={pacienteId} onClose={() => setModalAberto(false)} />}
    </div>
  );
}

function NovoInvestimentoModal({ pacienteId, onClose }) {
  const [valorTotal, setValorTotal] = useState('');
  const criar = useCriarInvestimento();

  const valido = Number(valorTotal) > 0;

  const handleSave = () => {
    criar.mutate({ pacienteId, valorTotal: Number(valorTotal) }, {
      onSuccess: () => { onClose(); toast({ title: 'Investimento iniciado' }); },
      onError: (error) => toast({ title: 'Erro ao iniciar investimento', description: error?.message, variant: 'destructive' }),
    });
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-card rounded-3xl p-8 w-[420px] shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>Novo investimento</h3>
          <button onClick={onClose} className="p-1 rounded-lg transition-[background-color] duration-200 hover:bg-black/5"><X size={18} style={{ color: 'var(--text-secondary)' }} /></button>
        </div>
        <label className="text-xs font-medium block mb-1.5" style={{ color: 'var(--text-secondary)' }}>Valor total combinado com o paciente (R$)</label>
        <input type="number" min={0} step="0.01" value={valorTotal} onChange={(e) => setValorTotal(e.target.value)} className="w-full px-4 py-3 rounded-xl border text-sm outline-none mb-6" style={{ borderColor: 'var(--border-color)', backgroundColor: 'rgb(var(--card))' }} placeholder="0,00" />
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-3 rounded-2xl text-sm font-medium border" style={{ borderColor: 'var(--border-color)', color: 'var(--text-secondary)' }}>Cancelar</button>
          <button onClick={handleSave} disabled={!valido || criar.isPending} className="flex-1 py-3 rounded-2xl text-sm font-semibold text-white disabled:opacity-50" style={{ backgroundColor: 'var(--green-primary)' }}>
            {criar.isPending ? 'Criando...' : 'Iniciar investimento'}
          </button>
        </div>
      </div>
    </div>
  );
}

function InvestimentoCard({ pacienteId, investimento, notasFiscais }) {
  const atualizar = useAtualizarInvestimento();
  const [valorTotal, setValorTotal] = useState(String(investimento.valor_total));
  const [modalNotaAberto, setModalNotaAberto] = useState(false);
  const [notaParaExcluir, setNotaParaExcluir] = useState(null);

  const total = Number(valorTotal) || 0;
  // "Pago" é a soma dos valores das notas fiscais enviadas (não um campo
  // manual solto) — ajuste feito logo depois da primeira versão.
  const pago = notasFiscais.reduce((soma, n) => soma + (Number(n.valor) || 0), 0);
  const percentual = total > 0 ? Math.min(100, Math.round((pago / total) * 100)) : 0;
  const mudou = total !== Number(investimento.valor_total);
  const podeSalvar = mudou && total > 0;
  const moeda = (v) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  const salvar = () => {
    atualizar.mutate({ id: investimento.id, pacienteId, valorTotal: total }, {
      onSuccess: () => toast({ title: 'Investimento atualizado' }),
      onError: (error) => toast({ title: 'Erro ao atualizar investimento', description: error?.message, variant: 'destructive' }),
    });
  };

  return (
    <div className="bg-card rounded-2xl p-5" style={{ borderTop: '3px solid var(--gold)', boxShadow: '0 8px 20px rgba(0,0,0,.05)' }}>
      <div className="mb-3">
        <label className="text-xs font-medium block mb-1.5" style={{ color: 'var(--text-secondary)' }}>Valor total combinado</label>
        <input type="number" min={0} step="0.01" value={valorTotal} onChange={(e) => setValorTotal(e.target.value)} className="w-full px-3 py-2 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--border-color)', backgroundColor: 'rgb(var(--card))' }} />
      </div>
      {mudou && (
        <button onClick={salvar} disabled={!podeSalvar || atualizar.isPending} className="text-xs font-semibold mb-3 disabled:opacity-50" style={{ color: 'var(--green-primary)' }}>
          {atualizar.isPending ? 'Salvando...' : 'Salvar valor total'}
        </button>
      )}
      <div className="flex justify-between mb-2">
        <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{moeda(pago)} de {moeda(total)}</span>
        <span className="text-sm font-semibold" style={{ color: 'var(--heading-accent)' }}>{percentual}%</span>
      </div>
      <div className="h-2 rounded-full" style={{ backgroundColor: 'var(--bg-tag)' }}>
        <div className="h-2 rounded-full transition-[width] duration-300" style={{ width: `${percentual}%`, backgroundColor: 'var(--heading-accent)' }} />
      </div>
      <p className="text-xs mt-2 mb-4" style={{ color: 'var(--text-secondary)' }}>Faltam {moeda(Math.max(0, total - pago))}</p>

      <div className="flex items-center justify-between mb-3 pt-3 border-t" style={{ borderColor: 'var(--border-color)' }}>
        <p className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>NOTAS FISCAIS</p>
        <button onClick={() => setModalNotaAberto(true)} className="text-xs font-medium" style={{ color: 'var(--heading-accent)' }}>+ Adicionar</button>
      </div>
      {notasFiscais.length === 0 ? (
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Nenhuma nota fiscal enviada ainda.</p>
      ) : (
        <div className="space-y-2">
          {notasFiscais.map((n) => (
            <a key={n.id} href={n.signedUrl} target="_blank" rel="noreferrer" className="group flex items-center justify-between p-2.5 rounded-xl border cursor-pointer transition-[background-color] duration-200 hover:bg-black/5" style={{ borderColor: 'var(--border-color)' }}>
              <div>
                <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{n.valor != null ? moeda(Number(n.valor)) : n.documentos.nome_arquivo}</p>
                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{new Date(n.data_nota + 'T00:00:00').toLocaleDateString('pt-BR')}</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={(ev) => { ev.preventDefault(); ev.stopPropagation(); setNotaParaExcluir(n); }}
                  className="p-1 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                  aria-label="Excluir nota fiscal"
                >
                  <Trash2 size={14} style={{ color: '#DC2626' }} />
                </button>
                <FileText size={14} style={{ color: 'var(--text-secondary)' }} />
              </div>
            </a>
          ))}
        </div>
      )}
      {modalNotaAberto && <NovaNotaFiscalModal pacienteId={pacienteId} investimentoId={investimento.id} onClose={() => setModalNotaAberto(false)} />}
      {notaParaExcluir && (
        <ConfirmarExcluirNotaFiscalModal pacienteId={pacienteId} nota={notaParaExcluir} onClose={() => setNotaParaExcluir(null)} />
      )}
    </div>
  );
}

function NovaNotaFiscalModal({ pacienteId, investimentoId, onClose }) {
  const [data, setData] = useState(new Date().toISOString().slice(0, 10));
  const [valor, setValor] = useState('');
  const [file, setFile] = useState(null);
  const uploadNota = useUploadNotaFiscal();

  const valido = Number(valor) > 0 && !!file;

  const handleSave = () => {
    if (!valido) return;
    uploadNota.mutate({ pacienteId, investimentoId, file, dataNota: data, valor: Number(valor) }, {
      onSuccess: () => onClose(),
      onError: (error) => toast({ title: 'Erro ao adicionar nota fiscal', description: error?.message, variant: 'destructive' }),
    });
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-card rounded-3xl p-8 w-[420px] shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>Nova nota fiscal</h3>
          <button onClick={onClose} className="p-1 rounded-lg transition-[background-color] duration-200 hover:bg-black/5"><X size={18} style={{ color: 'var(--text-secondary)' }} /></button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium block mb-1.5" style={{ color: 'var(--text-secondary)' }}>Valor pago (R$)</label>
            <input type="number" min={0} step="0.01" value={valor} onChange={(e) => setValor(e.target.value)} className="w-full px-4 py-3 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--border-color)', backgroundColor: 'rgb(var(--card))' }} placeholder="0,00" />
          </div>
          <div>
            <label className="text-xs font-medium block mb-1.5" style={{ color: 'var(--text-secondary)' }}>Data</label>
            <DatePicker value={data} onChange={setData} />
          </div>
          <div>
            <label className="text-xs font-medium block mb-1.5" style={{ color: 'var(--text-secondary)' }}>Arquivo</label>
            <input type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} className="w-full text-sm" />
          </div>
        </div>
        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="flex-1 py-3 rounded-2xl text-sm font-medium border" style={{ borderColor: 'var(--border-color)', color: 'var(--text-secondary)' }}>Cancelar</button>
          <button onClick={handleSave} disabled={uploadNota.isPending || !valido} className="flex-1 py-3 rounded-2xl text-sm font-semibold text-white disabled:opacity-50" style={{ backgroundColor: 'var(--green-primary)' }}>
            {uploadNota.isPending ? 'Enviando...' : 'Adicionar nota fiscal'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ConfirmarExcluirNotaFiscalModal({ pacienteId, nota, onClose }) {
  const removerDocumento = useRemoverDocumento();

  const handleConfirmar = () => {
    removerDocumento.mutate({ documentoId: nota.documento_id, pacienteId }, {
      onSuccess: () => { toast({ title: 'Nota fiscal excluída.' }); onClose(); },
      onError: (error) => toast({ title: 'Erro ao excluir nota fiscal', description: error?.message, variant: 'destructive' }),
    });
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-card rounded-3xl p-8 w-[420px] shadow-2xl" onClick={(e) => e.stopPropagation()} style={{ borderTop: '3px solid #DC2626' }}>
        <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Excluir nota fiscal?</h3>
        <p className="text-sm mb-6" style={{ color: 'var(--text-secondary)' }}>
          Tem certeza que quer excluir essa nota fiscal? Essa ação não pode ser desfeita.
        </p>
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-3 rounded-2xl text-sm font-medium border" style={{ borderColor: 'var(--border-color)', color: 'var(--text-secondary)' }}>
            Cancelar
          </button>
          <button
            onClick={handleConfirmar}
            disabled={removerDocumento.isPending}
            className="flex-1 py-3 rounded-2xl text-sm font-semibold text-white disabled:opacity-50"
            style={{ backgroundColor: '#DC2626' }}
          >
            {removerDocumento.isPending ? 'Excluindo...' : 'Excluir'}
          </button>
        </div>
      </div>
    </div>
  );
}

function RegistroRetroativoPainel({ pacienteId, planos, onClose }) {
  const adicionar = useAdicionarObservacaoTimeline();
  const registrarSessao = useRegistrarSessaoRetroativa();
  const vincularFoto = useVincularFotoASessao();
  const { data: fotos = [] } = useFotosPaciente(pacienteId);

  const [tipo, setTipo] = useState('consulta');
  const [data, setData] = useState(new Date().toISOString().slice(0, 10));
  const [titulo, setTitulo] = useState('');
  const [descricao, setDescricao] = useState('');
  const [planoId, setPlanoId] = useState('');
  const [numeroSessao, setNumeroSessao] = useState('');
  const [ativos, setAtivos] = useState('');
  const [observacoesSessao, setObservacoesSessao] = useState('');
  const [sessaoCriadaId, setSessaoCriadaId] = useState(null);
  const [fotosSelecionadas, setFotosSelecionadas] = useState([]);

  const planosElegiveis = (planos || []).filter(p => p.status === 'ativo' || p.status === 'finalizado');
  const planoSelecionado = planosElegiveis.find(p => p.id === planoId);
  const fotosOrfas = fotos.filter(f => !f.sessao_id);

  const toggleFoto = (id) => setFotosSelecionadas(sel => sel.includes(id) ? sel.filter(x => x !== id) : [...sel, id]);

  const podeSalvarConsulta = titulo.trim() !== '' && descricao.trim() !== '';
  const podeSalvarSessao = planoId !== '' && Number(numeroSessao) > 0 && observacoesSessao.trim() !== '';

  const salvarConsulta = () => {
    adicionar.mutate({ pacienteId, titulo: titulo.trim(), descricao: descricao.trim(), data }, {
      onSuccess: () => { toast({ title: 'Registro adicionado.' }); onClose(); },
      onError: (error) => toast({ title: 'Erro ao adicionar registro', description: error?.message, variant: 'destructive' }),
    });
  };

  const salvarSessao = () => {
    const ativosUtilizados = ativos.split(',').map(s => s.trim()).filter(Boolean);
    registrarSessao.mutate({
      pacienteId, planoTratamentoId: planoId, numeroSessao: Number(numeroSessao),
      data, ativosUtilizados, observacoes: observacoesSessao.trim(),
    }, {
      onSuccess: (novaSessaoId) => {
        toast({ title: 'Sessão registrada.' });
        if (fotosOrfas.length) { setSessaoCriadaId(novaSessaoId); return; }
        onClose();
      },
      onError: (error) => toast({ title: 'Erro ao registrar sessão', description: error?.message, variant: 'destructive' }),
    });
  };

  const vincularFotosEFechar = () => {
    if (!fotosSelecionadas.length) { onClose(); return; }
    let restantes = fotosSelecionadas.length;
    fotosSelecionadas.forEach((documentoId) => {
      vincularFoto.mutate({ pacienteId, documentoId, sessaoId: sessaoCriadaId }, {
        onSettled: () => { restantes -= 1; if (restantes === 0) { toast({ title: 'Fotos vinculadas.' }); onClose(); } },
      });
    });
  };

  // Etapa 2: sessão já criada, oferece vincular fotos soltas (sem sessão) a ela.
  if (sessaoCriadaId) {
    return (
      <div className="bg-card rounded-2xl border p-5 mb-4 space-y-3" style={{ borderColor: 'var(--border-color)' }}>
        <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Vincular fotos sem sessão a este registro?</p>
        <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
          {fotosOrfas.map((f) => (
            <div key={f.id} onClick={() => toggleFoto(f.id)} className="relative aspect-square rounded-lg overflow-hidden cursor-pointer border-2" style={{ borderColor: fotosSelecionadas.includes(f.id) ? 'var(--heading-accent)' : 'transparent' }}>
              <img src={f.signedUrl} alt={f.nome_arquivo} className="w-full h-full object-cover" />
              {fotosSelecionadas.includes(f.id) && (
                <div className="absolute inset-0 bg-black/30 flex items-center justify-center"><Check size={18} className="text-white" /></div>
              )}
            </div>
          ))}
        </div>
        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="px-3 py-2 rounded-lg text-sm font-medium border" style={{ borderColor: 'var(--border-color)', color: 'var(--text-secondary)' }}>Pular</button>
          <button onClick={vincularFotosEFechar} disabled={vincularFoto.isPending} className="px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50" style={{ backgroundColor: 'var(--green-primary)' }}>
            Vincular {fotosSelecionadas.length > 0 ? `(${fotosSelecionadas.length})` : ''}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card rounded-2xl border p-5 mb-4 space-y-3" style={{ borderColor: 'var(--border-color)' }}>
      <div className="grid grid-cols-2 gap-2">
        {[['consulta', 'Consulta'], ['sessao', 'Sessão']].map(([val, label]) => (
          <button key={val} onClick={() => setTipo(val)} className="py-2 rounded-xl border-2 text-sm font-medium transition-[border-color,background-color,color] duration-200" style={tipo === val ? { borderColor: 'var(--heading-accent)', backgroundColor: 'var(--bg-tag)', color: 'var(--heading-accent)' } : { borderColor: 'var(--border-color)', color: 'var(--text-secondary)' }}>
            {label}
          </button>
        ))}
      </div>
      <div>
        <label className="text-xs font-medium block mb-1.5" style={{ color: 'var(--text-secondary)' }}>Data</label>
        <DatePicker value={data} onChange={setData} />
      </div>

      {tipo === 'consulta' ? (
        <>
          <input value={titulo} onChange={(e) => setTitulo(e.target.value)} className="w-full px-4 py-2.5 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--border-color)', backgroundColor: 'rgb(var(--card))' }} placeholder="Título (ex: Retorno, Ligação...)" />
          <textarea rows={3} value={descricao} onChange={(e) => setDescricao(e.target.value)} className="w-full px-4 py-2.5 rounded-xl border text-sm outline-none resize-none" style={{ borderColor: 'var(--border-color)', backgroundColor: 'rgb(var(--card))' }} placeholder="Descrição do que foi feito..." />
        </>
      ) : planosElegiveis.length === 0 ? (
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Este paciente não tem nenhum plano de tratamento — crie um plano primeiro (card Progresso) antes de registrar uma sessão retroativa.</p>
      ) : (
        <>
          <select value={planoId} onChange={(e) => { setPlanoId(e.target.value); setNumeroSessao(''); }} className="w-full px-4 py-2.5 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--border-color)', backgroundColor: 'rgb(var(--card))' }}>
            <option value="">Selecione o plano...</option>
            {planosElegiveis.map((p) => (
              <option key={p.id} value={p.id}>{p.tags?.nome || 'Plano'} {p.status === 'finalizado' ? '(finalizado)' : ''}</option>
            ))}
          </select>
          <div className="flex gap-3">
            <div className="w-40">
              <label className="text-xs font-medium block mb-1.5" style={{ color: 'var(--text-secondary)' }}>Número da sessão</label>
              <input type="number" min={1} value={numeroSessao} onChange={(e) => setNumeroSessao(e.target.value)} placeholder={planoSelecionado ? String((planoSelecionado.sessoes_realizadas || 0) + 1) : ''} className="w-full px-4 py-2.5 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--border-color)', backgroundColor: 'rgb(var(--card))' }} />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium block mb-1.5" style={{ color: 'var(--text-secondary)' }}>Ativos utilizados (opcional, separados por vírgula)</label>
            <input value={ativos} onChange={(e) => setAtivos(e.target.value)} className="w-full px-4 py-2.5 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--border-color)', backgroundColor: 'rgb(var(--card))' }} placeholder="Ex: Vitamina B12, Ácido Fólico" />
          </div>
          <textarea rows={3} value={observacoesSessao} onChange={(e) => setObservacoesSessao(e.target.value)} className="w-full px-4 py-2.5 rounded-xl border text-sm outline-none resize-none" style={{ borderColor: 'var(--border-color)', backgroundColor: 'rgb(var(--card))' }} placeholder="Observações da sessão..." />
        </>
      )}

      <div className="flex gap-2 justify-end">
        <button onClick={onClose} className="px-3 py-2 rounded-lg text-sm font-medium border" style={{ borderColor: 'var(--border-color)', color: 'var(--text-secondary)' }}>Cancelar</button>
        {tipo === 'consulta' ? (
          <button onClick={salvarConsulta} disabled={!podeSalvarConsulta || adicionar.isPending} className="px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50" style={{ backgroundColor: 'var(--green-primary)' }}>Adicionar</button>
        ) : (
          <button onClick={salvarSessao} disabled={!podeSalvarSessao || registrarSessao.isPending} className="px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50" style={{ backgroundColor: 'var(--green-primary)' }}>Registrar sessão</button>
        )}
      </div>
    </div>
  );
}

function TimelineTab({ pacienteId, planos }) {
  const { data: timeline = [] } = useTimelineEventos(pacienteId);
  const editar = useEditarDescricaoTimeline();
  const [expanded, setExpanded] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [noteDraft, setNoteDraft] = useState('');
  const [newEntryOpen, setNewEntryOpen] = useState(false);

  const startEdit = (item) => { setEditingId(item.id); setNoteDraft(item.descricao || ''); };
  const saveEdit = (item) => {
    editar.mutate({ pacienteId, eventoId: item.id, descricao: noteDraft }, {
      onSuccess: () => { setEditingId(null); toast({ title: 'Descrição atualizada.' }); },
      onError: (error) => toast({ title: 'Erro ao editar', description: error?.message, variant: 'destructive' }),
    });
  };

  return (
    <div className="max-w-3xl">
      <button onClick={() => setNewEntryOpen(v => !v)} className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium border mb-4 transition-[background-color] duration-200 hover:bg-card" style={{ borderColor: 'var(--border-color)', color: 'var(--heading-accent)' }}>
        <Plus size={15} /> Adicionar registro
      </button>
      {newEntryOpen && (
        <RegistroRetroativoPainel pacienteId={pacienteId} planos={planos} onClose={() => setNewEntryOpen(false)} />
      )}

      {timeline.length === 0 ? (
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Nenhum registro na timeline ainda.</p>
      ) : (
        <div className="space-y-2">
          {timeline.map((item, i) => (
            <div key={item.id} className="flex gap-4">
              <div className="flex flex-col items-center">
                <div className="w-3 h-3 rounded-full mt-1.5 shrink-0" style={{ backgroundColor: 'var(--heading-accent)' }} />
                {i < timeline.length - 1 && <div className="w-0.5 flex-1 mt-1" style={{ backgroundColor: 'var(--border-color)' }} />}
              </div>
              <div className="bg-card rounded-2xl border p-4 mb-2 flex-1 cursor-pointer transition-[box-shadow] duration-200 hover:shadow-sm" style={{ borderColor: 'var(--border-color)' }} onClick={() => setExpanded(expanded === item.id ? null : item.id)}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{item.titulo}</span>
                    <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{new Date(item.data).toLocaleDateString('pt-BR')}</span>
                  </div>
                  {expanded === item.id ? <ChevronUp size={14} style={{ color: 'var(--text-secondary)' }} /> : <ChevronDown size={14} style={{ color: 'var(--text-secondary)' }} />}
                </div>
                {expanded === item.id && (
                  <div className="mt-3 pt-3 border-t" style={{ borderColor: 'var(--border-color)' }}>
                    {editingId === item.id ? (
                      <div className="space-y-2">
                        <textarea rows={3} value={noteDraft} onChange={(e) => setNoteDraft(e.target.value)} onClick={(e) => e.stopPropagation()} className="w-full px-3 py-2 rounded-xl border text-sm outline-none resize-none" style={{ borderColor: 'var(--border-color)', backgroundColor: 'rgb(var(--card))' }} />
                        <div className="flex gap-2 justify-end">
                          <button onClick={(e) => { e.stopPropagation(); setEditingId(null); }} className="px-2.5 py-1 rounded-lg text-xs font-medium border" style={{ borderColor: 'var(--border-color)', color: 'var(--text-secondary)' }}>Cancelar</button>
                          <button onClick={(e) => { e.stopPropagation(); saveEdit(item); }} className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold text-white" style={{ backgroundColor: 'var(--green-primary)' }}><Save size={11} /> Salvar</button>
                        </div>
                      </div>
                    ) : (
                      <div>
                        {(() => {
                          const observacaoSessao = item.sessoes?.observacoes?.trim();
                          const observacaoFinal = item.descricao?.trim();
                          const temAsDuas = observacaoSessao && observacaoSessao !== observacaoFinal;
                          if (!temAsDuas) {
                            return <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{item.descricao || 'Sem descrição.'}</p>;
                          }
                          return (
                            <div className="space-y-3">
                              <div>
                                <span className="text-xs font-semibold tracking-wide block mb-1" style={{ color: 'var(--text-secondary)' }}>OBSERVAÇÕES DA SESSÃO</span>
                                <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{observacaoSessao}</p>
                              </div>
                              <div className="rounded-xl px-3 py-2.5" style={{ backgroundColor: 'var(--bg-tag)', borderLeft: '3px solid var(--heading-accent)' }}>
                                <span className="text-xs font-semibold tracking-wide block mb-1" style={{ color: 'var(--heading-accent)' }}>OBSERVAÇÃO FINAL</span>
                                <p className="text-sm leading-relaxed font-medium" style={{ color: 'var(--text-primary)' }}>{observacaoFinal || 'Sem descrição.'}</p>
                              </div>
                            </div>
                          );
                        })()}
                        {item.sessoes?.ativos_utilizados?.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mt-3">
                            {item.sessoes.ativos_utilizados.map((ativo) => (
                              <span key={ativo} className="px-2.5 py-1 rounded-full text-xs font-medium" style={{ backgroundColor: 'var(--bg-tag)', color: 'var(--heading-accent)' }}>{ativo}</span>
                            ))}
                          </div>
                        )}
                        {item.editavel && (
                          <button onClick={(e) => { e.stopPropagation(); startEdit(item); }} className="flex items-center gap-1.5 mt-3 text-xs font-medium" style={{ color: 'var(--heading-accent)' }}><Pencil size={11} /> Editar descrição</button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function FotosTab({ pacienteId }) {
  const { data: fotos = [] } = useFotosPaciente(pacienteId);
  const uploadFoto = useUploadFoto();
  const inputRef = useRef(null);
  const [fotoParaExcluir, setFotoParaExcluir] = useState(null);
  const [fotoAberta, setFotoAberta] = useState(null);

  const handleFiles = (files) => {
    Array.from(files || []).forEach((file) => {
      uploadFoto.mutate({ pacienteId, file }, {
        onError: (error) => toast({ title: 'Erro ao enviar foto', description: error?.message, variant: 'destructive' }),
      });
    });
  };

  const groups = new Map();
  fotos.forEach((f) => {
    const key = f.titulo || (f.sessoes?.numero_sessao ? `Sessão ${f.sessoes.numero_sessao}` : 'Sem sessão vinculada');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(f);
  });

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="bg-card rounded-2xl p-5" style={{ borderTop: '3px solid var(--gold)', boxShadow: '0 8px 20px rgba(0,0,0,.05)' }}>
        <div
          onClick={() => inputRef.current?.click()}
          className="rounded-2xl border-2 border-dashed cursor-pointer transition-[border-color] duration-200 flex flex-col items-center justify-center py-8 gap-2"
          style={{ borderColor: 'var(--border-color)' }}
        >
          <div className="p-3 rounded-full" style={{ backgroundColor: 'var(--bg-tag)' }}>
            <Upload size={20} style={{ color: 'var(--heading-accent)' }} />
          </div>
          <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Clique para enviar fotos</p>
          <input ref={inputRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { handleFiles(e.target.files); e.target.value = ''; }} />
        </div>
      </div>

      {groups.size === 0 ? (
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Nenhuma foto registrada ainda.</p>
      ) : (
        [...groups.entries()].map(([label, group]) => (
          <div key={label} className="bg-card rounded-2xl border p-5" style={{ borderColor: 'var(--border-color)', boxShadow: '0 8px 20px rgba(0,0,0,.05)' }}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>{label}</h3>
              <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{group.length} foto{group.length > 1 ? 's' : ''}</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {group.map((f) => (
                <div key={f.id} onClick={() => setFotoAberta(f)} className="relative group aspect-square rounded-xl overflow-hidden cursor-pointer border" style={{ borderColor: 'var(--border-color)' }}>
                  <img src={f.signedUrl} alt={f.nome_arquivo} className="w-full h-full object-cover" />
                  <button onClick={(e) => { e.stopPropagation(); setFotoParaExcluir(f); }} className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <Trash2 size={12} className="text-white" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        ))
      )}
      {fotoParaExcluir && (
        <ConfirmarExcluirFotoModal
          pacienteId={pacienteId}
          foto={fotoParaExcluir}
          onClose={() => setFotoParaExcluir(null)}
        />
      )}
      {fotoAberta && (
        <FotoLightbox foto={fotoAberta} onClose={() => setFotoAberta(null)} />
      )}
    </div>
  );
}

function FotoLightbox({ foto, onClose }) {
  const [baixando, setBaixando] = useState(false);

  const handleBaixar = async () => {
    setBaixando(true);
    try {
      await baixarComoJpg(foto.signedUrl, foto.nome_arquivo);
    } finally {
      setBaixando(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-md flex items-center justify-center z-50" onClick={onClose}>
      <div className="absolute top-4 right-4 flex gap-2 z-10">
        <button
          onClick={(e) => { e.stopPropagation(); handleBaixar(); }}
          disabled={baixando}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium bg-white/10 hover:bg-white/20 transition-colors disabled:opacity-50"
          style={{ color: '#fff' }}
        >
          <Download size={16} /> {baixando ? 'Baixando...' : 'Baixar'}
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onClose(); }}
          aria-label="Fechar"
          className="w-10 h-10 rounded-xl flex items-center justify-center bg-white/10 hover:bg-white/20 transition-colors"
          style={{ color: '#fff' }}
        >
          <X size={18} />
        </button>
      </div>
      <img
        src={foto.signedUrl}
        alt={foto.nome_arquivo}
        onClick={(e) => e.stopPropagation()}
        className="max-w-[92vw] max-h-[88vh] object-contain rounded-lg shadow-2xl"
      />
    </div>
  );
}

function ConfirmarExcluirFotoModal({ pacienteId, foto, onClose }) {
  const removerFoto = useRemoverFoto();

  const handleConfirmar = () => {
    removerFoto.mutate({ pacienteId, documentoId: foto.id, storagePath: foto.storage_path }, {
      onSuccess: () => { toast({ title: 'Foto excluída.' }); onClose(); },
      onError: (error) => toast({ title: 'Erro ao remover foto', description: error?.message, variant: 'destructive' }),
    });
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-card rounded-3xl p-8 w-[420px] shadow-2xl" onClick={(e) => e.stopPropagation()} style={{ borderTop: '3px solid #DC2626' }}>
        <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Excluir foto?</h3>
        <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
          Tem certeza que quer excluir esta foto? Essa ação não pode ser desfeita.
        </p>
        <div className="rounded-xl overflow-hidden mb-6 border" style={{ borderColor: 'var(--border-color)' }}>
          <img src={foto.signedUrl} alt={foto.nome_arquivo} className="w-full max-h-64 object-contain" style={{ backgroundColor: 'var(--bg-tag)' }} />
        </div>
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-3 rounded-2xl text-sm font-medium border" style={{ borderColor: 'var(--border-color)', color: 'var(--text-secondary)' }}>
            Cancelar
          </button>
          <button
            onClick={handleConfirmar}
            disabled={removerFoto.isPending}
            className="flex-1 py-3 rounded-2xl text-sm font-semibold text-white disabled:opacity-50"
            style={{ backgroundColor: '#DC2626' }}
          >
            {removerFoto.isPending ? 'Excluindo...' : 'Excluir'}
          </button>
        </div>
      </div>
    </div>
  );
}

function GraficosExameTab({ pacienteId }) {
  const { data: graficos = [] } = useGraficosExame(pacienteId);
  const [modalNovoGrafico, setModalNovoGrafico] = useState(false);
  const [graficoParaExcluir, setGraficoParaExcluir] = useState(null);

  return (
    <div className="max-w-3xl space-y-4">
      <div className="flex justify-end">
        <button onClick={() => setModalNovoGrafico(true)} className="text-xs font-medium" style={{ color: 'var(--heading-accent)' }}>+ Novo gráfico</button>
      </div>
      {graficos.length === 0 && (
        <div className="bg-card rounded-2xl border p-6 text-center" style={{ borderColor: 'var(--border-color)' }}>
          <LineChartIcon size={20} className="mx-auto mb-2" style={{ color: 'var(--text-secondary)' }} />
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Nenhum gráfico criado ainda.</p>
        </div>
      )}
      {graficos.map((g) => (
        <GraficoExameCard key={g.id} grafico={g} onExcluir={() => setGraficoParaExcluir(g)} />
      ))}
      {modalNovoGrafico && <NovoGraficoModal pacienteId={pacienteId} onClose={() => setModalNovoGrafico(false)} />}
      {graficoParaExcluir && <ConfirmarExcluirGraficoModal grafico={graficoParaExcluir} onClose={() => setGraficoParaExcluir(null)} />}
    </div>
  );
}

function GraficoExameCard({ grafico, onExcluir }) {
  const pontos = [...(grafico.graficos_exame_pontos || [])].sort((a, b) => a.data.localeCompare(b.data));
  const dadosGrafico = pontos.map((p) => ({ data: new Date(p.data + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' }), valor: Number(p.valor) }));
  const [novoData, setNovoData] = useState(new Date().toISOString().slice(0, 10));
  const [novoValor, setNovoValor] = useState('');
  const [novaObs, setNovaObs] = useState('');
  const adicionarPonto = useAdicionarPontoGrafico();

  const handleAdicionar = () => {
    if (!novoData || novoValor === '') return;
    adicionarPonto.mutate({ graficoId: grafico.id, data: novoData, valor: Number(novoValor), observacao: novaObs.trim() || null }, {
      onSuccess: () => { setNovoData(new Date().toISOString().slice(0, 10)); setNovoValor(''); setNovaObs(''); },
      onError: (error) => toast({ title: 'Erro ao adicionar ponto', description: error?.message, variant: 'destructive' }),
    });
  };

  return (
    <div className="bg-card rounded-2xl p-5" style={{ borderTop: '3px solid var(--gold)', boxShadow: '0 8px 20px rgba(0,0,0,.05)' }}>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{grafico.nome}</p>
        <button onClick={onExcluir} className="p-1.5 rounded-lg hover:bg-black/5" aria-label="Excluir gráfico"><Trash2 size={14} style={{ color: '#DC2626' }} /></button>
      </div>

      {pontos.length >= 2 ? (
        <Suspense fallback={<div className="h-48" />}>
          <GraficoLinha dados={dadosGrafico} nome={grafico.nome} />
        </Suspense>
      ) : (
        <p className="text-xs mb-4" style={{ color: 'var(--text-secondary)' }}>Adicione pelo menos 2 pontos pra ver o gráfico.</p>
      )}

      <div className="space-y-1.5 mb-4">
        {pontos.map((p) => (
          <PontoGraficoLinha key={p.id} ponto={p} />
        ))}
      </div>

      <div className="flex gap-2 items-end">
        <div className="flex-1">
          <label className="text-xs font-medium block mb-1" style={{ color: 'var(--text-secondary)' }}>Data</label>
          <DatePicker value={novoData} onChange={setNovoData} />
        </div>
        <div className="flex-1">
          <label className="text-xs font-medium block mb-1" style={{ color: 'var(--text-secondary)' }}>Valor</label>
          <input type="number" step="any" value={novoValor} onChange={(e) => setNovoValor(e.target.value)} className="w-full px-3 py-2 rounded-lg border text-sm outline-none" style={{ borderColor: 'var(--border-color)', backgroundColor: 'rgb(var(--card))' }} />
        </div>
        <div className="flex-[2]">
          <label className="text-xs font-medium block mb-1" style={{ color: 'var(--text-secondary)' }}>Observação (opcional)</label>
          <input value={novaObs} onChange={(e) => setNovaObs(e.target.value)} className="w-full px-3 py-2 rounded-lg border text-sm outline-none" style={{ borderColor: 'var(--border-color)', backgroundColor: 'rgb(var(--card))' }} />
        </div>
        <button onClick={handleAdicionar} disabled={adicionarPonto.isPending} className="px-3 py-2 rounded-lg text-white text-sm disabled:opacity-50" style={{ backgroundColor: 'var(--green-primary)' }}>+</button>
      </div>
    </div>
  );
}

function PontoGraficoLinha({ ponto }) {
  const [editando, setEditando] = useState(false);
  const [valorEdit, setValorEdit] = useState(String(ponto.valor));
  const [dataEdit, setDataEdit] = useState(ponto.data);
  const editarPonto = useEditarPontoGrafico();
  const excluirPonto = useExcluirPontoGrafico();

  const salvar = () => {
    editarPonto.mutate({ pontoId: ponto.id, data: dataEdit, valor: Number(valorEdit), observacao: ponto.observacao }, {
      onSuccess: () => setEditando(false),
      onError: (error) => toast({ title: 'Erro ao editar ponto', description: error?.message, variant: 'destructive' }),
    });
  };

  const dataFormatada = new Date(ponto.data + 'T00:00:00').toLocaleDateString('pt-BR');

  if (editando) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ backgroundColor: 'var(--bg-tag)' }}>
        <div className="w-32"><DatePicker value={dataEdit} onChange={setDataEdit} /></div>
        <input type="number" step="any" value={valorEdit} onChange={(e) => setValorEdit(e.target.value)} className="w-20 px-2 py-1 rounded-md border text-xs outline-none" style={{ borderColor: 'var(--border-color)', backgroundColor: 'rgb(var(--card))' }} />
        <button onClick={salvar} disabled={editarPonto.isPending} className="p-1 rounded-md text-white disabled:opacity-50" style={{ backgroundColor: 'var(--green-primary)' }}><Check size={12} /></button>
        <button onClick={() => { setEditando(false); setValorEdit(String(ponto.valor)); setDataEdit(ponto.data); }} className="p-1 rounded-md border" style={{ borderColor: 'var(--border-color)' }}><X size={12} style={{ color: 'var(--text-secondary)' }} /></button>
      </div>
    );
  }

  return (
    <div className="group flex items-center justify-between px-3 py-2 rounded-lg" style={{ backgroundColor: 'var(--bg-tag)' }}>
      <div className="flex items-center gap-3">
        <span className="text-xs font-mono" style={{ color: 'var(--text-secondary)' }}>{dataFormatada}</span>
        <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{ponto.valor}</span>
        {ponto.observacao && <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{ponto.observacao}</span>}
      </div>
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button onClick={() => setEditando(true)} className="p-1 rounded-md hover:bg-black/5"><Pencil size={12} style={{ color: 'var(--text-secondary)' }} /></button>
        <button onClick={() => excluirPonto.mutate({ pontoId: ponto.id }, { onError: (error) => toast({ title: 'Erro ao excluir ponto', description: error?.message, variant: 'destructive' }) })} className="p-1 rounded-md hover:bg-black/5"><Trash2 size={12} style={{ color: '#DC2626' }} /></button>
      </div>
    </div>
  );
}

function NovoGraficoModal({ pacienteId, onClose }) {
  const [nome, setNome] = useState('');
  const criarGrafico = useCriarGraficoExame();

  const handleCriar = () => {
    if (!nome.trim()) return;
    criarGrafico.mutate({ pacienteId, nome: nome.trim() }, {
      onSuccess: () => onClose(),
      onError: (error) => toast({ title: 'Erro ao criar gráfico', description: error?.message, variant: 'destructive' }),
    });
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-card rounded-3xl p-8 w-[420px] shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>Novo gráfico</h3>
          <button onClick={onClose} className="p-1 rounded-lg transition-[background-color] duration-200 hover:bg-black/5"><X size={18} style={{ color: 'var(--text-secondary)' }} /></button>
        </div>
        <label className="text-xs font-medium block mb-1.5" style={{ color: 'var(--text-secondary)' }}>Nome do gráfico</label>
        <input value={nome} onChange={(e) => setNome(e.target.value)} className="w-full px-4 py-3 rounded-xl border text-sm outline-none mb-6" style={{ borderColor: 'var(--border-color)', backgroundColor: 'rgb(var(--card))' }} placeholder="Ex: Ferritina (ng/mL)" />
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-3 rounded-2xl text-sm font-medium border" style={{ borderColor: 'var(--border-color)', color: 'var(--text-secondary)' }}>Cancelar</button>
          <button onClick={handleCriar} disabled={criarGrafico.isPending || !nome.trim()} className="flex-1 py-3 rounded-2xl text-sm font-semibold text-white disabled:opacity-50" style={{ backgroundColor: 'var(--green-primary)' }}>
            {criarGrafico.isPending ? 'Criando...' : 'Criar gráfico'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ConfirmarExcluirGraficoModal({ grafico, onClose }) {
  const excluirGrafico = useExcluirGraficoExame();

  const handleConfirmar = () => {
    excluirGrafico.mutate({ graficoId: grafico.id }, {
      onSuccess: () => { toast({ title: 'Gráfico excluído.' }); onClose(); },
      onError: (error) => toast({ title: 'Erro ao excluir gráfico', description: error?.message, variant: 'destructive' }),
    });
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-card rounded-3xl p-8 w-[420px] shadow-2xl" onClick={(e) => e.stopPropagation()} style={{ borderTop: '3px solid #DC2626' }}>
        <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Excluir gráfico?</h3>
        <p className="text-sm mb-6" style={{ color: 'var(--text-secondary)' }}>
          Tem certeza que quer excluir <strong style={{ color: 'var(--text-primary)' }}>"{grafico.nome}"</strong>? Todos os pontos registrados serão perdidos. Essa ação não pode ser desfeita.
        </p>
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-3 rounded-2xl text-sm font-medium border" style={{ borderColor: 'var(--border-color)', color: 'var(--text-secondary)' }}>Cancelar</button>
          <button onClick={handleConfirmar} disabled={excluirGrafico.isPending} className="flex-1 py-3 rounded-2xl text-sm font-semibold text-white disabled:opacity-50" style={{ backgroundColor: '#DC2626' }}>
            {excluirGrafico.isPending ? 'Excluindo...' : 'Excluir'}
          </button>
        </div>
      </div>
    </div>
  );
}
