import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Plus, ChevronRight, X } from 'lucide-react';
import { usePacientes, useCreatePaciente } from '@/hooks/usePacientes';
import { useTags } from '@/hooks/useTags';
import { useProcedimentosParaAtendimento } from '@/hooks/useModoAtendimento';
import { formatarCPF, somenteDigitos, validarCPF } from '@/lib/cpf';
import { toast } from '@/components/ui/use-toast';
import Avatar from '@/components/paciente/Avatar';
import DatePicker from '@/components/DatePicker';

function TagBadge({ tag }) {
  return (
    <span
      className="px-2 py-0.5 rounded-md text-xs font-medium inline-flex items-center gap-1"
      style={{ backgroundColor: `${tag.cor}22`, color: tag.cor }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: tag.cor }} />
      {tag.nome}
    </span>
  );
}

const emptyForm = { nome: '', cpf: '', data_nascimento: '', telefone: '', resumo_clinico: '' };

function AgendarPacienteNovoModal({ paciente, onClose }) {
  const navigate = useNavigate();
  const { data: procedimentos = [], isLoading: isLoadingProcedimentos } = useProcedimentosParaAtendimento();
  const consultaInicial = procedimentos.find((p) => p.nome === 'Consulta Inicial');

  const handleAgendar = () => {
    navigate('/agenda', { state: { novoAgendamento: { patientId: paciente.id, treatmentId: consultaInicial?.id || null } } });
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-card rounded-3xl p-8 w-[420px] shadow-2xl" onClick={(e) => e.stopPropagation()} style={{ borderTop: '3px solid var(--gold)' }}>
        <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Agendar {paciente.nome}?</h3>
        <p className="text-sm mb-6" style={{ color: 'var(--text-secondary)' }}>Deseja agendar uma Consulta Inicial para esse paciente agora?</p>
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-3 rounded-2xl text-sm font-medium border" style={{ borderColor: 'var(--border-color)', color: 'var(--text-secondary)' }}>Não</button>
          <button onClick={handleAgendar} disabled={isLoadingProcedimentos} className="flex-1 py-3 rounded-2xl text-sm font-semibold text-white disabled:opacity-50" style={{ backgroundColor: 'var(--green-primary)' }}>Sim, agendar</button>
        </div>
      </div>
    </div>
  );
}

export default function Pacientes() {
  const navigate = useNavigate();
  const { data: patients = [] } = usePacientes();
  const { data: tags = [] } = useTags();
  const createPaciente = useCreatePaciente();

  const [search, setSearch] = useState('');
  const [searchAberta, setSearchAberta] = useState(false);
  const searchRef = useRef(null);
  const [filterTagId, setFilterTagId] = useState('Todos');
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [pacienteRecemCriado, setPacienteRecemCriado] = useState(null);

  const patientTags = (p) => (p.paciente_tags || []).map(pt => pt.tags).filter(Boolean);
  const activePlano = (p) => (p.planos_tratamento || []).find(pl => pl.status === 'ativo');

  const filtered = patients.filter(p => {
    const matchSearch = p.nome.toLowerCase().includes(search.toLowerCase());
    const matchFilter = filterTagId === 'Todos' || patientTags(p).some(t => t.id === filterTagId);
    return matchSearch && matchFilter;
  });

  // Busca "em botão" só existe abaixo do breakpoint `sm` (ver classes
  // `sm:hidden`/`sm:!w-full` no JSX) — no celular, o ícone abre a barra e
  // fecha sozinho ao clicar fora ou apertar Esc, se estiver vazia.
  useEffect(() => {
    if (!searchAberta) return;
    const fecharSeVazia = () => { if (!search) setSearchAberta(false); };
    const onDocClick = (e) => {
      if (searchRef.current && !searchRef.current.contains(e.target)) fecharSeVazia();
    };
    const onKeyDown = (e) => { if (e.key === 'Escape') fecharSeVazia(); };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [searchAberta, search]);

  const cpfValido = validarCPF(form.cpf);

  const handleSave = () => {
    if (!form.nome.trim() || !cpfValido) return;
    createPaciente.mutate({
      ...form,
      cpf: somenteDigitos(form.cpf),
      data_nascimento: form.data_nascimento || null,
      resumo_clinico: form.resumo_clinico || null,
    }, {
      onSuccess: (pacienteCriado) => {
        setModal(false);
        setForm(emptyForm);
        setPacienteRecemCriado(pacienteCriado);
      },
      onError: (error) => {
        if (error?.code === '23505') {
          toast({ title: 'Já existe um paciente cadastrado com esse CPF.', variant: 'destructive' });
        } else {
          toast({ title: 'Erro ao cadastrar paciente', description: error?.message, variant: 'destructive' });
        }
      },
    });
  };

  return (
    <div className="min-h-full p-4 sm:p-6 lg:p-8 relative overflow-hidden page-paper-bg">
      <div className="flex items-center justify-between mb-8 animate-fade-in-up">
        <div>
          <p
            className="text-[11px] font-medium uppercase mb-1"
            style={{ fontFamily: "'IBM Plex Mono', monospace", letterSpacing: '.14em', color: 'var(--text-secondary)' }}
          >
            {patients.length} pacientes cadastrados
          </p>
          <h1
            className="text-[26px] inline-block pb-1"
            style={{ fontFamily: "'Newsreader', serif", fontStyle: 'italic', fontWeight: 500, color: 'var(--heading-accent)', borderBottom: '1px solid var(--gold)' }}
          >
            Pacientes
          </h1>
        </div>
        <button onClick={() => setModal(true)} className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-white transition-[transform,box-shadow] duration-200 hover:shadow-lg hover:-translate-y-0.5" style={{ backgroundColor: 'var(--green-primary)' }}>
          <Plus size={15} /> Novo Paciente
        </button>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 mb-6 animate-fade-in-up" style={{ animationDelay: '60ms' }}>
        <div ref={searchRef} className="relative sm:flex-1 sm:max-w-xs">
          {/* Ícone de busca colapsado — só existe abaixo do breakpoint `sm`.
              Acima disso a barra já fica sempre expandida (comportamento
              antigo, sem mudança). */}
          <button
            type="button"
            onClick={() => setSearchAberta(true)}
            aria-label="Buscar paciente"
            className={`sm:hidden absolute inset-0 z-10 grid place-items-center w-10 h-10 rounded-xl border transition-opacity duration-150 ${searchAberta ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
            style={{ borderColor: 'var(--border-color)', backgroundColor: 'rgb(var(--card))' }}
          >
            <Search size={15} style={{ color: 'var(--text-secondary)' }} />
          </button>
          <div
            className={`relative overflow-hidden transition-[width] duration-200 [transition-timing-function:cubic-bezier(.16,1,.3,1)] sm:!w-full ${searchAberta ? 'w-full' : 'w-10'}`}
          >
            <Search size={15} className="absolute left-3 top-2.5 pointer-events-none" style={{ color: 'var(--text-secondary)' }} />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              onFocus={() => setSearchAberta(true)}
              placeholder="Buscar paciente..."
              className="w-full pl-9 pr-9 py-2.5 rounded-xl border text-sm outline-none bg-card"
              style={{ borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
            />
            {searchAberta && search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                aria-label="Limpar busca"
                className="sm:hidden absolute right-2.5 top-2.5 p-0.5 rounded-md hover:bg-black/5"
              >
                <X size={14} style={{ color: 'var(--text-secondary)' }} />
              </button>
            )}
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setFilterTagId('Todos')} className="px-3 py-1.5 rounded-xl text-xs font-medium border transition-[background-color,color] duration-200"
            style={filterTagId === 'Todos'
              ? { backgroundColor: 'var(--green-primary)', borderColor: 'var(--green-primary)', color: '#fff' }
              : { borderColor: 'var(--border-color)', color: 'var(--text-secondary)', backgroundColor: 'rgb(var(--card))' }}>
            Todos
          </button>
          {tags.map(t => (
            <button key={t.id} onClick={() => setFilterTagId(t.id)} className="px-3 py-1.5 rounded-xl text-xs font-medium border transition-[background-color,color] duration-200 flex items-center gap-1.5"
              style={filterTagId === t.id
                ? { backgroundColor: t.cor, borderColor: t.cor, color: '#fff' }
                : { borderColor: 'var(--border-color)', color: 'var(--text-secondary)', backgroundColor: 'rgb(var(--card))' }}>
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: t.cor }} />
              {t.nome}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-3 animate-fade-in-up" style={{ animationDelay: '120ms' }}>
        {filtered.map(p => {
          const plano = activePlano(p);
          const progress = plano?.sessoes_contratadas ? Math.round((plano.sessoes_realizadas / plano.sessoes_contratadas) * 100) : null;
          return (
            <div key={p.id} onClick={() => navigate(`/pacientes/${p.id}`)} className="bg-card rounded-2xl p-5 flex items-center flex-wrap gap-y-3 justify-between cursor-pointer transition-[transform,box-shadow] duration-200 hover:shadow-md hover:-translate-y-0.5" style={{ borderTop: '3px solid var(--gold)', boxShadow: '0 2px 8px rgba(0,0,0,.04)' }}>
              <div className="flex items-center gap-4 min-w-0">
                <Avatar nome={p.nome} fotoUrl={p.fotoPerfilUrl} size="sm" />
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm truncate" style={{ color: 'var(--text-primary)' }}>{p.nome}</span>
                    {patientTags(p).map(t => <TagBadge key={t.id} tag={t} />)}
                  </div>
                  <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--text-secondary)' }}>{p.telefone || 'Sem telefone cadastrado'}</p>
                </div>
              </div>
              <div className="flex items-center gap-8 shrink-0">
                {plano ? (
                  <>
                    <div className="text-right">
                      <p className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Sessões</p>
                      <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{plano.sessoes_realizadas}/{plano.sessoes_contratadas ?? '—'}</p>
                    </div>
                    {progress !== null && (
                      <div className="w-24">
                        <div className="flex justify-between mb-1"><span className="text-xs" style={{ color: 'var(--text-secondary)' }}>Progresso</span><span className="text-xs font-medium" style={{ fontFamily: "'IBM Plex Mono', monospace", color: 'var(--heading-accent)' }}>{progress}%</span></div>
                        <div className="h-1.5 rounded-full" style={{ backgroundColor: 'var(--bg-tag)' }}><div className="h-1.5 rounded-full transition-[width] duration-300" style={{ width: `${progress}%`, backgroundColor: 'var(--gold)' }} /></div>
                      </div>
                    )}
                  </>
                ) : (
                  <span className="text-xs whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>Sem plano ativo</span>
                )}
                <ChevronRight size={16} style={{ color: 'var(--text-secondary)' }} />
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && (
          <p className="text-sm text-center py-10" style={{ color: 'var(--text-secondary)' }}>Nenhum paciente encontrado.</p>
        )}
      </div>

      {modal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50" onClick={() => setModal(false)}>
          <div className="bg-card rounded-3xl p-8 w-[520px] shadow-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>Novo Paciente</h3>
              <button onClick={() => setModal(false)} className="p-1 rounded-lg hover:bg-gray-100"><X size={18} style={{ color: 'var(--text-secondary)' }} /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium block mb-1.5" style={{ color: 'var(--text-secondary)' }}>Nome completo</label>
                <input value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} className="w-full px-4 py-3 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--border-color)', backgroundColor: 'rgb(var(--card))', color: 'var(--text-primary)' }} placeholder="Nome completo" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium block mb-1.5" style={{ color: 'var(--text-secondary)' }}>CPF</label>
                  <input
                    value={form.cpf}
                    onChange={e => setForm(f => ({ ...f, cpf: formatarCPF(e.target.value) }))}
                    inputMode="numeric"
                    maxLength={14}
                    className="w-full px-4 py-3 rounded-xl border text-sm outline-none"
                    style={{ borderColor: form.cpf.trim() && !cpfValido ? '#DC2626' : 'var(--border-color)', backgroundColor: 'rgb(var(--card))', color: 'var(--text-primary)' }}
                    placeholder="000.000.000-00"
                  />
                  {form.cpf.trim() && !cpfValido && (
                    <p className="text-xs mt-1" style={{ color: '#DC2626' }}>CPF inválido.</p>
                  )}
                </div>
                <div>
                  <label className="text-xs font-medium block mb-1.5" style={{ color: 'var(--text-secondary)' }}>Nascimento</label>
                  <DatePicker value={form.data_nascimento} onChange={v => setForm(f => ({ ...f, data_nascimento: v }))} />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium block mb-1.5" style={{ color: 'var(--text-secondary)' }}>Telefone</label>
                <input value={form.telefone} onChange={e => setForm(f => ({ ...f, telefone: e.target.value }))} className="w-full px-4 py-3 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--border-color)', backgroundColor: 'rgb(var(--card))', color: 'var(--text-primary)' }} placeholder="(00) 00000-0000" />
              </div>
              <div>
                <label className="text-xs font-medium block mb-1.5" style={{ color: 'var(--text-secondary)' }}>Observação inicial <span className="font-normal">(opcional)</span></label>
                <textarea rows={2} value={form.resumo_clinico} onChange={e => setForm(f => ({ ...f, resumo_clinico: e.target.value }))} className="w-full px-4 py-3 rounded-xl border text-sm outline-none resize-none" style={{ borderColor: 'var(--border-color)', backgroundColor: 'rgb(var(--card))', color: 'var(--text-primary)' }} placeholder="Alguma observação sobre o paciente..." />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setModal(false)} className="flex-1 py-3 rounded-2xl text-sm font-medium border" style={{ borderColor: 'var(--border-color)', color: 'var(--text-secondary)' }}>Cancelar</button>
              <button onClick={handleSave} disabled={createPaciente.isPending || !form.nome.trim() || !cpfValido} className="flex-1 py-3 rounded-2xl text-sm font-semibold text-white disabled:opacity-50" style={{ backgroundColor: 'var(--green-primary)' }}>
                {createPaciente.isPending ? 'Salvando...' : 'Cadastrar paciente'}
              </button>
            </div>
          </div>
        </div>
      )}

      {pacienteRecemCriado && (
        <AgendarPacienteNovoModal paciente={pacienteRecemCriado} onClose={() => setPacienteRecemCriado(null)} />
      )}
    </div>
  );
}
