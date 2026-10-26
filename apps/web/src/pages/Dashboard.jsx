import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Play, Plus, Calendar, Package, Users, Bell, Settings, ChevronRight, AlertTriangle, Clock, MapPin, CheckCircle2, UserX, AlertCircle, Cake, X } from 'lucide-react';
import { useAgendamentosRange, useUpdateAgendamento, useAgendamentoPorId } from '@/hooks/useAgendamentos';
import { useEstoqueCritico, useRetornosAtrasados, useAniversariantesMes, useTarefas, useCriarTarefa, useEditarTextoTarefa, useConcluirTarefa, useExcluirTarefa } from '@/hooks/useDashboard';
import { useSessoesEmAndamento, useProcedimentosParaAtendimento } from '@/hooks/useModoAtendimento';

const shortcuts = [
  { icon: Plus, label: 'Novo Paciente', path: '/pacientes?novo=true' },
  { icon: Calendar, label: 'Agendamento', path: '/agenda?novo=true' },
  { icon: Package, label: 'Entrada Estoque', path: '/estoque?entrada=true' },
  { icon: Users, label: 'Pacientes', path: '/pacientes' },
];

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}
function startOfTomorrow() {
  const d = startOfToday();
  d.setDate(d.getDate() + 1);
  return d;
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { data: appointments = [] } = useAgendamentosRange(startOfToday(), startOfTomorrow());
  const { data: estoqueCritico = [] } = useEstoqueCritico();
  const { data: retornosAtrasados = [] } = useRetornosAtrasados();
  const { data: aniversariantes = [] } = useAniversariantesMes();
  const updateAgendamento = useUpdateAgendamento();
  const { data: sessoesEmAndamento = [] } = useSessoesEmAndamento();
  const isActiveAppointment = (apptId) => sessoesEmAndamento.some(s => String(s.agendamento_id) === String(apptId));
  const activeSessao = sessoesEmAndamento[0];
  const activeApptHoje = activeSessao ? appointments.find(a => String(a.id) === String(activeSessao.agendamento_id)) : null;
  // Sessão em andamento abandonada de um dia anterior: seu agendamento não
  // está em `appointments` (sempre só de hoje) — busca ele à parte pra não
  // deixar o banner "Atendimento em andamento" invisível (achado #6 da
  // auditoria). Só dispara quando há sessão ativa E ela não foi achada hoje.
  const { data: activeApptFallback } = useAgendamentoPorId(
    activeSessao && !activeApptHoje ? activeSessao.agendamento_id : null
  );
  const activeAppt = activeApptHoje || activeApptFallback;

  const [aniversariantesOpen, setAniversariantesOpen] = useState(false);
  const aniversariantesRef = useRef(null);
  const [apptParaConfirmar, setApptParaConfirmar] = useState(null);

  useEffect(() => {
    if (!aniversariantesOpen) return;
    const handleClickOutside = (e) => {
      if (aniversariantesRef.current && !aniversariantesRef.current.contains(e.target)) {
        setAniversariantesOpen(false);
      }
    };
    const handleEscape = (e) => { if (e.key === 'Escape') setAniversariantesOpen(false); };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [aniversariantesOpen]);

  const handlePacienteFaltou = (appt) => {
    updateAgendamento.mutate({ id: appt.id, status: 'missed' });
  };

  const pending = appointments.filter(a => a.status === 'pending' || a.status === 'confirmed');
  const nextPatient = pending.find(a => !isActiveAppointment(a.id)) || pending[0];
  const today = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
  const capToday = today.charAt(0).toUpperCase() + today.slice(1);
  const startedTime = activeSessao ? new Date(activeSessao.criado_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';

  return (
    <div className="min-h-full p-4 sm:p-6 lg:p-8 relative overflow-hidden page-paper-bg">
      {/* Marca d'água decorativa (ícone da marca, recortado do logo oficial) —
          puramente visual, não deve ser lida por leitor de tela */}
      <img
        src="/clinicos-icon.svg"
        alt=""
        aria-hidden="true"
        width={178}
        height={144}
        className="pointer-events-none select-none absolute -top-4 right-10 w-40 h-auto opacity-[.07]"
      />

      {/* Header */}
      <div className="flex items-start justify-between mb-8 relative z-40 animate-fade-in-up">
        <div>
          <p
            className="text-[11px] font-medium uppercase mb-1"
            style={{ fontFamily: "'IBM Plex Mono', monospace", letterSpacing: '.14em', color: 'var(--text-secondary)' }}
          >
            {capToday}
          </p>
          <h1
            className="text-[26px] inline-block pb-1"
            style={{ fontFamily: "'Newsreader', serif", fontStyle: 'italic', fontWeight: 500, color: 'var(--heading-accent)', borderBottom: '1px solid var(--gold)' }}
          >
            Bom dia 👋
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative" ref={aniversariantesRef}>
            <button
              aria-label="Aniversariantes do mês"
              onClick={() => setAniversariantesOpen(v => !v)}
              className="relative p-2 rounded-xl border transition-[transform,box-shadow,background-color] duration-200 hover:bg-card hover:-translate-y-px hover:shadow-sm"
              style={{ borderColor: 'var(--border-color)', opacity: aniversariantes.length === 0 ? 0.5 : 1 }}
            >
              <Cake size={16} style={{ color: 'var(--text-secondary)' }} />
              {aniversariantes.length > 0 && (
                <span
                  className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full text-[10px] font-semibold flex items-center justify-center"
                  style={{ backgroundColor: 'var(--gold)', color: 'var(--green-primary)' }}
                >
                  {aniversariantes.length}
                </span>
              )}
            </button>
            {aniversariantesOpen && (
              <div
                className="absolute right-0 top-full mt-2 w-64 rounded-2xl bg-card p-4 z-30 animate-pop-in-soft"
                style={{ borderTop: '3px solid var(--gold)', boxShadow: '0 10px 24px rgba(20,30,20,.12)' }}
              >
                <p
                  className="text-[11px] font-semibold uppercase mb-3"
                  style={{ fontFamily: "'IBM Plex Mono', monospace", letterSpacing: '.12em', color: 'var(--text-secondary)' }}
                >
                  Aniversariantes do mês
                </p>
                <div className="max-h-80 overflow-y-auto -mx-1 px-1">
                  {aniversariantes.map((a, i) => (
                    <div
                      key={a.paciente_id}
                      className="flex items-center justify-between cursor-pointer transition-[transform] duration-200 hover:translate-x-0.5 py-2"
                      style={i < aniversariantes.length - 1 ? { borderBottom: '1px solid var(--border-color)' } : undefined}
                      onClick={() => { setAniversariantesOpen(false); navigate(`/pacientes/${a.paciente_id}`); }}
                    >
                      <span className="text-sm" style={{ color: 'var(--text-primary)' }}>{a.nome}</span>
                      <span className="text-xs shrink-0 ml-3" style={{ fontFamily: "'IBM Plex Mono', monospace", color: 'var(--text-secondary)' }}>
                        dia {new Date(a.data_nascimento).getUTCDate()}
                      </span>
                    </div>
                  ))}
                  {aniversariantes.length === 0 && (
                    <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Nenhum aniversariante este mês.</p>
                  )}
                </div>
              </div>
            )}
          </div>
          <button aria-label="Notificações" className="p-2 rounded-xl border transition-[transform,box-shadow,background-color] duration-200 hover:bg-card hover:-translate-y-px hover:shadow-sm" style={{ borderColor: 'var(--border-color)' }}><Bell size={16} style={{ color: 'var(--text-secondary)' }} /></button>
          <button aria-label="Configurações" onClick={() => navigate('/configuracoes')} className="p-2 rounded-xl border transition-[transform,box-shadow,background-color] duration-200 hover:bg-card hover:-translate-y-px hover:shadow-sm" style={{ borderColor: 'var(--border-color)' }}><Settings size={16} style={{ color: 'var(--text-secondary)' }} /></button>
        </div>
      </div>

      {/* Ongoing attendance card */}
      {activeSessao && activeAppt && (
        <div className="mb-6 rounded-2xl p-5 flex items-center justify-between border relative animate-fade-in-up" style={{ backgroundColor: 'rgba(201,162,77,.12)', borderColor: '#C9A24D' }}>
          <div className="flex items-center gap-4">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse" />
            <div>
              <p className="text-xs font-semibold tracking-widest" style={{ color: '#C9A24D' }}>ATENDIMENTO EM ANDAMENTO</p>
              <p className="text-sm font-semibold mt-0.5" style={{ color: 'var(--text-primary)' }}>{activeAppt.patient?.name} · {activeAppt.treatment?.name} · iniciado às {startedTime}</p>
            </div>
          </div>
          <button onClick={() => navigate(`/atendimento/${activeSessao.agendamento_id}`)} className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-[transform,box-shadow] duration-200 hover:shadow-lg hover:-translate-y-0.5" style={{ backgroundColor: 'var(--gold)', color: 'var(--green-primary)' }}>
            <Play size={14} fill="currentColor" /> Continuar atendimento
          </button>
        </div>
      )}

      <div className="flex flex-col lg:flex-row gap-6 lg:gap-8 relative">
        {/* Left — Appointments */}
        <div className="flex-1 min-w-0 animate-fade-in-up" style={{ animationDelay: '60ms' }}>
          <div className="rounded-2xl bg-card p-6 mb-6" style={{ borderTop: '3px solid var(--gold)', boxShadow: '0 10px 24px rgba(20,30,20,.06)' }}>
            <div className="flex items-center justify-between mb-4">
              <h2
                className="text-[11px] font-semibold uppercase"
                style={{ fontFamily: "'IBM Plex Mono', monospace", letterSpacing: '.12em', color: 'var(--text-secondary)' }}
              >
                Atendimentos de hoje
              </h2>
              <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{pending.length} pendentes</span>
            </div>
            <div className="space-y-2">
              {appointments.map((appt) => {
                const patient = appt.patient;
                const tags = patient?.classification || [];
                const alertas = patient?.destaques_clinicos?.length || 0;
                const isOngoing = isActiveAppointment(appt.id);
                return (
                  <div key={appt.id} className="flex items-center justify-between px-4 py-3 rounded-xl border transition-[background-color] duration-200"
                    style={{ borderColor: 'var(--border-color)', backgroundColor: appt.status === 'done' ? 'var(--bg-tag)' : appt.status === 'missed' ? 'rgba(220,38,38,.08)' : isOngoing ? 'rgba(201,162,77,.12)' : 'rgb(var(--card))', opacity: appt.status === 'missed' ? 0.6 : 1 }}>
                    <div className="flex items-center gap-4">
                      <span className="text-sm w-12 shrink-0" style={{ fontFamily: "'IBM Plex Mono', monospace", color: 'var(--text-secondary)' }}>{appt.start}</span>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            onClick={() => patient?.id && navigate(`/pacientes/${patient.id}`)}
                            className="text-sm font-semibold cursor-pointer hover:underline"
                            style={{ color: 'var(--text-primary)' }}
                          >
                            {patient?.name}
                          </span>
                          <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{appt.treatment?.name}</span>
                          {alertas > 0 && (
                            <span className="flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium" style={{ backgroundColor: 'rgba(220,38,38,.12)', color: '#DC2626' }}>
                              <AlertCircle size={10} /> {alertas} alerta{alertas > 1 ? 's' : ''}
                            </span>
                          )}
                        </div>
                        {tags.length > 0 && (
                          <div className="flex gap-1 mt-1">
                            {tags.map(tag => (
                              <span key={tag} className="px-2 py-0.5 rounded-md text-xs font-medium" style={{ backgroundColor: 'var(--bg-tag)', color: 'var(--text-secondary)' }}>{tag}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    <div>
                      {appt.status === 'done' && <span className="text-xs font-medium flex items-center gap-1" style={{ color: 'var(--status-success-text)' }}><CheckCircle2 size={14} /> Concluído</span>}
                      {appt.status === 'missed' && <span className="text-xs font-medium flex items-center gap-1 text-red-400"><UserX size={14} /> Faltou</span>}
                      {(appt.status === 'pending' || appt.status === 'confirmed') && isOngoing && (
                        <button onClick={() => navigate(`/atendimento/${appt.id}`)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-[transform,box-shadow] duration-200 hover:shadow-md hover:-translate-y-px" style={{ backgroundColor: 'var(--gold)', color: 'var(--green-primary)' }}>
                          <Play size={12} fill="currentColor" /> Continuar
                        </button>
                      )}
                      {(appt.status === 'pending' || appt.status === 'confirmed') && !isOngoing && (
                        <div className="flex items-center gap-2">
                          <button onClick={() => handlePacienteFaltou(appt)} className="px-2.5 py-1.5 rounded-xl border text-xs font-medium transition-[background-color] duration-200 hover:bg-gray-50" style={{ borderColor: 'var(--border-color)', color: 'var(--text-secondary)' }}>
                            Faltou
                          </button>
                          <button onClick={() => setApptParaConfirmar(appt)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-medium transition-[transform,box-shadow] duration-200 hover:shadow-sm hover:-translate-y-px" style={{ borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}>
                            <Play size={12} fill="currentColor" /> Iniciar
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              {appointments.length === 0 && (
                <p className="text-sm text-center py-6" style={{ color: 'var(--text-secondary)' }}>Nenhum atendimento hoje.</p>
              )}
            </div>
          </div>

          {/* Shortcuts */}
          <div>
            <p
              className="text-[11px] font-semibold uppercase mb-3"
              style={{ fontFamily: "'IBM Plex Mono', monospace", letterSpacing: '.12em', color: 'var(--text-secondary)' }}
            >
              Atalhos
            </p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {shortcuts.map(({ icon: Icon, label, path }) => (
                <button key={label} onClick={() => navigate(path)} className="flex flex-col items-start gap-3 p-4 rounded-2xl border bg-card transition-[transform,box-shadow] duration-200 hover:shadow-md hover:-translate-y-0.5" style={{ borderColor: 'var(--border-color)', boxShadow: '0 2px 8px rgba(0,0,0,.04)' }}>
                  <div className="p-2 rounded-lg" style={{ backgroundColor: 'var(--bg-tag)' }}><Icon size={16} style={{ color: 'var(--green-primary)' }} /></div>
                  <span className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>{label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Right Panel */}
        <div className="w-full lg:w-72 lg:shrink-0 space-y-4 animate-fade-in-up" style={{ animationDelay: '120ms' }}>
          {/* Next Patient */}
          <div className="rounded-2xl p-5" style={{ background: 'linear-gradient(165deg, #17301F 0%, #0e2117 100%)', borderTop: '3px solid var(--gold)' }}>
            <p className="text-[11px] font-semibold uppercase text-white/50 mb-3" style={{ fontFamily: "'IBM Plex Mono', monospace", letterSpacing: '.14em' }}>Próximo</p>
            {nextPatient ? (
              <>
                <h3 className="text-lg mb-1" style={{ fontFamily: "'Newsreader', serif", fontStyle: 'italic', fontWeight: 500, color: '#fff' }}>{nextPatient.patient?.name}</h3>
                <p className="text-sm text-white/60 mb-3">{nextPatient.treatment?.name}</p>
                <div className="flex items-center gap-4 text-xs text-white/50 mb-4">
                  <span className="flex items-center gap-1" style={{ fontFamily: "'IBM Plex Mono', monospace" }}><Clock size={12} /> {nextPatient.start}</span>
                  <span className="flex items-center gap-1"><MapPin size={12} /> Sala 1</span>
                </div>
                <button onClick={() => isActiveAppointment(nextPatient.id) ? navigate(`/atendimento/${nextPatient.id}`) : setApptParaConfirmar(nextPatient)} className="w-full py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-[transform,box-shadow] duration-200 hover:shadow-lg hover:-translate-y-0.5" style={{ backgroundColor: 'var(--gold)', color: 'var(--green-primary)' }}>
                  <Play size={14} fill="currentColor" /> {isActiveAppointment(nextPatient.id) ? 'Continuar' : 'Iniciar atendimento'}
                </button>
              </>
            ) : <p className="text-white/50 text-sm">Nenhum próximo atendimento.</p>}
          </div>

          {/* Stock Alert */}
          <div className="rounded-2xl bg-card p-5" style={{ borderTop: '3px solid var(--gold)', boxShadow: '0 10px 24px rgba(20,30,20,.06)' }}>
            <div className="flex items-center gap-2 mb-4">
              <AlertTriangle size={14} style={{ color: '#C9A24D' }} />
              <p className="text-[11px] font-semibold uppercase" style={{ fontFamily: "'IBM Plex Mono', monospace", letterSpacing: '.12em', color: 'var(--text-secondary)' }}>Atenção — Estoque</p>
            </div>
            <div className="max-h-80 overflow-y-auto -mx-1 px-1">
              {estoqueCritico.map((item, i) => (
                <div
                  key={item.material_id}
                  className="flex items-center justify-between gap-3 py-2.5"
                  style={i < estoqueCritico.length - 1 ? { borderBottom: '1px solid var(--border-color)' } : undefined}
                >
                  <span className="text-sm min-w-0" style={{ color: 'var(--text-primary)' }}>{item.nome}</span>
                  <span className="text-xs shrink-0 whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>Restam <strong style={{ fontFamily: "'IBM Plex Mono', monospace" }}>{item.quantidade_atual}</strong></span>
                </div>
              ))}
              {estoqueCritico.length === 0 && (
                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Nenhum item em estoque crítico.</p>
              )}
            </div>
          </div>

          {/* Returns */}
          <div className="rounded-2xl bg-card p-5" style={{ borderTop: '3px solid var(--gold)', boxShadow: '0 10px 24px rgba(20,30,20,.06)' }}>
            <p className="text-[11px] font-semibold uppercase mb-4" style={{ fontFamily: "'IBM Plex Mono', monospace", letterSpacing: '.12em', color: 'var(--text-secondary)' }}>Retornos em atraso</p>
            <div className="space-y-3">
              {retornosAtrasados.map(r => (
                <div key={r.paciente_id} className="flex items-center justify-between cursor-pointer transition-[transform,box-shadow] duration-200 hover:translate-x-0.5" onClick={() => navigate(`/pacientes/${r.paciente_id}`)}>
                  <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{r.nome}</span>
                  <div className="flex items-center gap-1">
                    <span className={`text-xs font-medium ${r.dias_sem_retorno >= 30 ? 'text-red-500' : 'text-amber-500'}`} style={{ fontFamily: "'IBM Plex Mono', monospace" }}>{r.dias_sem_retorno} dias</span>
                    <ChevronRight size={12} style={{ color: 'var(--text-secondary)' }} />
                  </div>
                </div>
              ))}
              {retornosAtrasados.length === 0 && (
                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Nenhum retorno em atraso.</p>
              )}
            </div>
          </div>

          <ChecklistCard />
        </div>
      </div>

      {apptParaConfirmar && (
        <ConfirmarInicioAtendimentoModal
          appt={apptParaConfirmar}
          onClose={() => setApptParaConfirmar(null)}
          onFaltou={() => { handlePacienteFaltou(apptParaConfirmar); setApptParaConfirmar(null); }}
        />
      )}
    </div>
  );
}

function ChecklistCard() {
  const { data: tarefas = [] } = useTarefas();
  const criar = useCriarTarefa();
  const editar = useEditarTextoTarefa();
  const concluir = useConcluirTarefa();
  const excluir = useExcluirTarefa();

  const [novoTexto, setNovoTexto] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState('');
  const [saindo, setSaindo] = useState([]);

  const handleAdd = () => {
    const texto = novoTexto.trim();
    if (!texto) return;
    criar.mutate({ texto }, { onSuccess: () => setNovoTexto('') });
  };

  const handleConcluir = (id) => {
    setSaindo((s) => [...s, id]);
    setTimeout(() => {
      concluir.mutate({ id }, {
        onError: () => setSaindo((s) => s.filter((x) => x !== id)),
      });
    }, 300);
  };

  const startEdit = (t) => { setEditingId(t.id); setEditDraft(t.texto); };
  const saveEdit = () => {
    const texto = editDraft.trim();
    if (texto) editar.mutate({ id: editingId, texto });
    setEditingId(null);
  };

  return (
    <div className="rounded-2xl bg-card p-5" style={{ borderTop: '3px solid var(--gold)', boxShadow: '0 10px 24px rgba(20,30,20,.06)' }}>
      <p
        className="text-[11px] font-semibold uppercase mb-4"
        style={{ fontFamily: "'IBM Plex Mono', monospace", letterSpacing: '.14em', color: 'var(--text-secondary)' }}
      >
        Checklist
      </p>
      <div className="flex gap-2 mb-4">
        <input
          value={novoTexto}
          onChange={(e) => setNovoTexto(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
          placeholder="Adicionar tarefa..."
          className="flex-1 px-3 py-2 rounded-lg border text-sm outline-none"
          style={{ borderColor: 'var(--border-color)', backgroundColor: 'rgb(var(--card))', color: 'var(--text-primary)' }}
        />
        <button
          onClick={handleAdd}
          disabled={!novoTexto.trim()}
          className="px-3 py-2 rounded-lg text-white text-sm font-semibold disabled:opacity-50 transition-[transform,box-shadow] duration-200 hover:shadow-md hover:-translate-y-px"
          style={{ backgroundColor: 'var(--green-primary)' }}
        >
          +
        </button>
      </div>
      <div className="space-y-2.5">
        {tarefas.map((t) => (
          <div
            key={t.id}
            className="flex items-center gap-2.5 transition-[opacity,max-height] duration-300 overflow-hidden"
            style={saindo.includes(t.id) ? { opacity: 0, maxHeight: 0 } : { opacity: 1, maxHeight: 40 }}
          >
            <button
              onClick={() => handleConcluir(t.id)}
              className="w-4 h-4 rounded border shrink-0"
              style={{ borderColor: 'var(--border-color)' }}
              aria-label="Concluir tarefa"
            />
            {editingId === t.id ? (
              <input
                autoFocus
                value={editDraft}
                onChange={(e) => setEditDraft(e.target.value)}
                onBlur={saveEdit}
                onKeyDown={(e) => { if (e.key === 'Enter') saveEdit(); }}
                className="flex-1 px-2 py-1 rounded border text-sm outline-none"
                style={{ borderColor: 'var(--border-color)', backgroundColor: 'rgb(var(--card))', color: 'var(--text-primary)' }}
              />
            ) : (
              <span
                onClick={() => startEdit(t)}
                className="flex-1 text-sm cursor-text"
                style={{ color: 'var(--text-primary)' }}
              >
                {t.texto}
              </span>
            )}
            <button
              onClick={() => excluir.mutate({ id: t.id })}
              className="text-xs shrink-0"
              style={{ color: 'var(--text-secondary)' }}
              aria-label="Excluir tarefa"
            >
              ✕
            </button>
          </div>
        ))}
        {tarefas.length === 0 && (
          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Nenhuma tarefa pendente.</p>
        )}
      </div>
    </div>
  );
}

function ConfirmarInicioAtendimentoModal({ appt, onClose, onFaltou }) {
  const navigate = useNavigate();
  const { data: catalogo = [] } = useProcedimentosParaAtendimento();
  const [etapa, setEtapa] = useState('presenca'); // 'presenca' | 'tratamento' | 'extra'
  const [extraId, setExtraId] = useState('');

  const nomeTratamento = appt.treatment?.name;
  const opcoesExtra = catalogo.filter((c) => c.id !== appt.treatment?.id);

  const handleProsseguir = (extra) => {
    if (extra) {
      navigate(`/atendimento/${appt.id}`, { state: { extraProcedimento: { id: extra.id, nome: extra.nome } } });
    } else {
      navigate(`/atendimento/${appt.id}`);
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50" onClick={onClose}>
      <div className="animate-pop-in-soft-center bg-card rounded-3xl p-8 w-[440px] shadow-2xl" onClick={(e) => e.stopPropagation()} style={{ borderTop: '3px solid var(--gold)' }}>
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>{appt.patient?.name}</h3>
          <button onClick={onClose} className="p-1 rounded-lg transition-[background-color] duration-200 hover:bg-black/5"><X size={18} style={{ color: 'var(--text-secondary)' }} /></button>
        </div>

        {etapa === 'presenca' && (
          <>
            <p className="text-sm mb-6" style={{ color: 'var(--text-secondary)' }}>Paciente presente para o atendimento?</p>
            <div className="flex gap-3">
              <button onClick={onFaltou} className="flex-1 py-3 rounded-2xl text-sm font-medium border" style={{ borderColor: 'var(--border-color)', color: 'var(--text-secondary)' }}>Não</button>
              <button onClick={() => setEtapa('tratamento')} className="flex-1 py-3 rounded-2xl text-sm font-semibold text-white" style={{ backgroundColor: 'var(--green-primary)' }}>Sim</button>
            </div>
          </>
        )}

        {etapa === 'tratamento' && (
          <>
            <p className="text-sm mb-6" style={{ color: 'var(--text-secondary)' }}>
              {nomeTratamento ? <>Vai fazer só <strong style={{ color: 'var(--text-primary)' }}>"{nomeTratamento}"</strong>?</> : 'Vai fazer apenas o procedimento previsto?'}
            </p>
            <div className="flex gap-3">
              <button onClick={() => setEtapa('extra')} className="flex-1 py-3 rounded-2xl text-sm font-medium border" style={{ borderColor: 'var(--border-color)', color: 'var(--text-secondary)' }}>Não</button>
              <button onClick={() => handleProsseguir(null)} className="flex-1 py-3 rounded-2xl text-sm font-semibold text-white" style={{ backgroundColor: 'var(--green-primary)' }}>Sim</button>
            </div>
          </>
        )}

        {etapa === 'extra' && (
          <>
            <label className="text-xs font-medium block mb-1.5" style={{ color: 'var(--text-secondary)' }}>Tratamento extra</label>
            <select value={extraId} onChange={(e) => setExtraId(e.target.value)} className="w-full px-4 py-3 rounded-xl border text-sm outline-none mb-6 bg-card" style={{ borderColor: 'var(--border-color)' }}>
              <option value="">Selecione um tratamento</option>
              {opcoesExtra.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </select>
            <button
              onClick={() => handleProsseguir(opcoesExtra.find((p) => p.id === extraId))}
              disabled={!extraId}
              className="w-full py-3 rounded-2xl text-sm font-semibold text-white disabled:opacity-50"
              style={{ backgroundColor: 'var(--green-primary)' }}
            >
              Confirmar e iniciar atendimento
            </button>
          </>
        )}
      </div>
    </div>
  );
}
