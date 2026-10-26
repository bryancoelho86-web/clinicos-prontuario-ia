import { useState, useMemo, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useResponsiveNav } from '@/hooks/useResponsiveNav';
import { Plus, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import MiniCalendar from '@/components/agenda/MiniCalendar';
import CreateAppointmentModal from '@/components/agenda/CreateAppointmentModal';
import EventDetailsModal from '@/components/agenda/EventDetailsModal';
import EventTooltip from '@/components/agenda/EventTooltip';
import WeekView from '@/components/agenda/WeekView';
import DayView from '@/components/agenda/DayView';
import MonthView from '@/components/agenda/MonthView';
import AgendaListView from '@/components/agenda/AgendaListView';
import { usePacientes } from '@/hooks/usePacientes';
import { useProcedimentos } from '@/hooks/useProcedimentos';
import {
  useAgendamentosRange, useCreateAgendamento, useUpdateAgendamento, useDeleteAgendamento,
  OVERLAP_ERROR_CODE, DELETE_RESTRICT_MESSAGE_FRAGMENT, adaptPatient, adaptTreatment,
} from '@/hooks/useAgendamentos';
import { startOfWeek, addDays, isoDate, parseIso, STATUS_STYLES } from '@/lib/agendaUtils';
import { toast } from '@/components/ui/use-toast';

const VIEWS = [
  { key: 'day', label: 'Dia' },
  { key: 'week', label: 'Semana' },
  { key: 'month', label: 'Mês' },
  { key: 'agenda', label: 'Agenda' },
];

const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

const OVERLAP_MESSAGE = 'Já existe um atendimento nesse horário. Escolha outro horário.';
const DELETE_RESTRICT_MESSAGE = 'Não é possível excluir um agendamento que já teve atendimento iniciado.';

export default function Agenda() {
  const { modo } = useResponsiveNav();
  const [view, setView] = useState(() => (modo === 'mobile' ? 'day' : 'week'));
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [colorMode, setColorMode] = useState('treatment'); // treatment | status
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [createInitial, setCreateInitial] = useState(null);
  const [createMode, setCreateMode] = useState('create');
  const [detailsEvent, setDetailsEvent] = useState(null);
  const [hover, setHover] = useState(null);
  // Cartão de detalhe "fixado" por clique (funciona em toque, sem depender
  // de hover) — nunca altera altura/posição do bloco em si (evita
  // sobrepor o agendamento vizinho), só mostra um cartão flutuante por
  // cima, igual o tooltip de hover já existente.
  const [pinned, setPinned] = useState(null);
  const handlePin = (meta, id, x, y) => setPinned(p => (id && p?.id === id) ? null : (id ? { id, meta, x, y } : null));
  useEffect(() => { setPinned(null); }, [view, currentDate]);

  const location = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    const prefil = location.state?.novoAgendamento;
    if (!prefil) return;
    setCreateInitial({ patientId: prefil.patientId, treatmentId: prefil.treatmentId });
    setCreateMode('create');
    setCreateOpen(true);
    navigate(location.pathname, { replace: true, state: null });
  }, [location.state]);

  const weekDates = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(currentDate), i)), [currentDate]);

  // Busca sempre o mês inteiro (com folga de semanas) em volta de currentDate —
  // cobre as visões dia/semana/mês/agenda sem refetch a cada troca de view.
  const { rangeStart, rangeEnd } = useMemo(() => {
    const monthStart = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
    const gridStart = startOfWeek(monthStart);
    return { rangeStart: gridStart, rangeEnd: addDays(gridStart, 42) };
  }, [currentDate]);

  const { data: events = [] } = useAgendamentosRange(rangeStart, rangeEnd);
  const { data: pacientesData = [] } = usePacientes();
  const { data: procedimentosData = [] } = useProcedimentos();
  const patients = useMemo(() => pacientesData.map(adaptPatient), [pacientesData]);
  const treatments = useMemo(() => procedimentosData.map(adaptTreatment), [procedimentosData]);

  const createAgendamento = useCreateAgendamento();
  const updateAgendamento = useUpdateAgendamento();
  const deleteAgendamento = useDeleteAgendamento();

  const getEventMeta = (ev) => {
    const statusStyle = STATUS_STYLES[ev.status] || STATUS_STYLES.pending;
    const color = colorMode === 'status' ? statusStyle.color : (ev.treatment?.color || '#2F7D5A');
    return { patient: ev.patient, treatment: ev.treatment, statusStyle, color, event: ev };
  };

  const filteredEvents = useMemo(() => {
    if (!search.trim()) return events;
    const q = search.toLowerCase();
    return events.filter(ev => (
      ev.patient?.name?.toLowerCase().includes(q) ||
      ev.patient?.phone?.toLowerCase().includes(q) ||
      ev.treatment?.name?.toLowerCase().includes(q) ||
      ev.date.includes(q) ||
      new Date(ev.date + 'T00:00').toLocaleDateString('pt-BR').includes(q)
    ));
  }, [events, search]);

  const eventDates = useMemo(() => events.map(ev => parseIso(ev.date)), [events]);

  const prev = () => {
    if (view === 'day') setCurrentDate(d => addDays(d, -1));
    else if (view === 'week') setCurrentDate(d => addDays(d, -7));
    else setCurrentDate(d => new Date(d.getFullYear(), d.getMonth() - 1, 1));
  };
  const next = () => {
    if (view === 'day') setCurrentDate(d => addDays(d, 1));
    else if (view === 'week') setCurrentDate(d => addDays(d, 7));
    else setCurrentDate(d => new Date(d.getFullYear(), d.getMonth() + 1, 1));
  };

  const openCreate = (date, start) => {
    setCreateInitial({ date: date || isoDate(selectedDate), start: start || '09:00' });
    setCreateMode('create');
    setCreateOpen(true);
  };

  const openEdit = (event) => {
    setDetailsEvent(null);
    setCreateInitial(event);
    setCreateMode('edit');
    setCreateOpen(true);
  };

  const handleOverlapError = (error) => {
    if (error?.code === OVERLAP_ERROR_CODE) {
      toast({ title: 'Conflito de horário', description: OVERLAP_MESSAGE, variant: 'destructive' });
      return true;
    }
    toast({ title: 'Erro', description: error?.message || 'Não foi possível salvar o agendamento.', variant: 'destructive' });
    return false;
  };

  const handleSave = (data) => {
    if (createMode === 'edit' && createInitial) {
      updateAgendamento.mutate({ id: createInitial.id, ...data }, {
        onSuccess: () => setCreateOpen(false),
        onError: handleOverlapError,
      });
    } else {
      createAgendamento.mutate(data, {
        onSuccess: () => setCreateOpen(false),
        onError: handleOverlapError,
      });
    }
  };

  const handleDeleteError = (error) => {
    if (error?.message?.includes(DELETE_RESTRICT_MESSAGE_FRAGMENT)) {
      toast({ title: 'Não é possível excluir', description: DELETE_RESTRICT_MESSAGE, variant: 'destructive' });
      return;
    }
    toast({ title: 'Erro', description: error?.message || 'Não foi possível excluir o agendamento.', variant: 'destructive' });
  };

  const handleDelete = (id) => {
    deleteAgendamento.mutate(id, { onSuccess: () => setCreateOpen(false), onError: handleDeleteError });
  };

  const handleEventMove = (id, newDate, newStart, newEnd) => {
    updateAgendamento.mutate({ id, date: newDate, start: newStart, end: newEnd }, { onError: handleOverlapError });
  };
  const handleEventResize = (id, newEnd) => {
    const ev = events.find(e => e.id === id);
    if (!ev) return;
    updateAgendamento.mutate({ id, date: ev.date, end: newEnd }, { onError: handleOverlapError });
  };

  const title = view === 'day'
    ? `${currentDate.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}`
    : view === 'month' ? `${MONTHS[currentDate.getMonth()]} ${currentDate.getFullYear()}`
    : `${currentDate.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })} – ${addDays(currentDate, 6).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}`;

  return (
    <div className="flex flex-col lg:flex-row min-h-full lg:h-full relative page-paper-bg">
      {/* Sidebar */}
      <aside className="w-full lg:w-64 lg:shrink-0 p-5 border-b lg:border-b-0 lg:border-r overflow-y-auto bg-card" style={{ borderColor: 'var(--border-color)' }}>
        <button onClick={() => openCreate()} className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-sm font-semibold text-white transition-[transform,box-shadow] duration-200 hover:shadow-lg hover:-translate-y-0.5 mb-5" style={{ backgroundColor: 'var(--green-primary)' }}>
          <Plus size={16} /> Novo Agendamento
        </button>

        <MiniCalendar selectedDate={selectedDate} onSelectDate={(d) => { setSelectedDate(d); setCurrentDate(d); if (view === 'month') setView('day'); }} eventDates={eventDates} />

        {/* Color mode */}
        <div className="mt-6">
          <p
            className="text-[11px] font-semibold uppercase mb-2.5"
            style={{ fontFamily: "'IBM Plex Mono', monospace", letterSpacing: '.12em', color: 'var(--text-secondary)' }}
          >
            Cor dos blocos
          </p>
          <div className="flex gap-1 p-1 rounded-xl" style={{ backgroundColor: 'var(--bg-tag)' }}>
            {[{ k: 'treatment', l: 'Tratamento' }, { k: 'status', l: 'Status' }].map(o => (
              <button key={o.k} onClick={() => setColorMode(o.k)} className="flex-1 py-1.5 rounded-lg text-xs font-medium transition-[background-color,box-shadow] duration-200" style={colorMode === o.k ? { backgroundColor: 'rgb(var(--card))', color: 'var(--text-primary)', boxShadow: '0 1px 3px rgba(0,0,0,.08)' } : { color: 'var(--text-secondary)' }}>{o.l}</button>
            ))}
          </div>
          {colorMode === 'status' && (
            <div className="mt-3 space-y-1.5">
              {Object.values(STATUS_STYLES).map(s => (
                <div key={s.label} className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: s.color }} /> {s.label}
                </div>
              ))}
            </div>
          )}
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0 relative">
        {/* Top bar */}
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between px-4 lg:px-6 py-4 border-b bg-card" style={{ borderColor: 'var(--border-color)' }}>
          <div className="flex items-center gap-4">
            <button onClick={() => { setCurrentDate(new Date()); setSelectedDate(new Date()); }} className="px-3 py-1.5 rounded-lg text-sm font-medium border transition-[background-color] duration-200 hover:bg-black/5" style={{ borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}>Hoje</button>
            <div className="flex">
              <button onClick={prev} className="p-1.5 rounded-lg transition-[background-color] duration-200 hover:bg-black/5"><ChevronLeft size={18} style={{ color: 'var(--text-secondary)' }} /></button>
              <button onClick={next} className="p-1.5 rounded-lg transition-[background-color] duration-200 hover:bg-black/5"><ChevronRight size={18} style={{ color: 'var(--text-secondary)' }} /></button>
            </div>
            <h2
              className="text-base capitalize"
              style={{ fontFamily: "'IBM Plex Mono', monospace", letterSpacing: '.02em', color: 'var(--heading-accent)' }}
            >
              {title}
            </h2>
          </div>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:gap-4">
            <div className="relative">
              <Search size={15} className="absolute left-3 top-2.5" style={{ color: 'var(--text-secondary)' }} />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Pesquisar paciente, telefone, tratamento..." className="pl-9 pr-4 py-2 rounded-xl border text-sm outline-none w-full lg:w-72" style={{ borderColor: 'var(--border-color)', color: 'var(--text-primary)', backgroundColor: 'var(--bg-tag)' }} />
            </div>
            <div className="flex gap-1 p-1 rounded-full border" style={{ backgroundColor: 'var(--bg-tag)', borderColor: 'var(--border-color)' }}>
              {VIEWS.map(v => (
                <button
                  key={v.key}
                  onClick={() => setView(v.key)}
                  className="px-4 py-1.5 rounded-full text-sm font-medium transition-[background-color,box-shadow,color] duration-200"
                  style={view === v.key
                    ? { backgroundColor: 'var(--green-primary)', color: '#fff', boxShadow: '0 2px 10px rgba(201,162,77,.35)' }
                    : { color: 'var(--text-secondary)' }}
                >
                  {v.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Calendar area */}
        <div className="flex-1 p-6 overflow-hidden">
          {view === 'week' && (
            <WeekView weekDates={weekDates} events={filteredEvents} getEventMeta={getEventMeta} colorMode={colorMode}
              onEventDoubleClick={setDetailsEvent} onSlotClick={openCreate}
              onEventMove={handleEventMove} onEventResize={handleEventResize}
              onHover={(meta, x, y) => setHover({ meta, x, y })} onHoverEnd={() => setHover(null)}
              onPin={handlePin} pinnedId={pinned?.id} />
          )}
          {view === 'day' && (
            <DayView date={currentDate} events={filteredEvents} getEventMeta={getEventMeta}
              onEventDoubleClick={setDetailsEvent} onSlotClick={openCreate}
              onEventMove={handleEventMove} onEventResize={handleEventResize}
              onHover={(meta, x, y) => setHover({ meta, x, y })} onHoverEnd={() => setHover(null)}
              onPin={handlePin} pinnedId={pinned?.id} />
          )}
          {view === 'month' && (
            <MonthView currentDate={currentDate} events={filteredEvents} getEventMeta={getEventMeta}
              onEventDoubleClick={setDetailsEvent} onSelectDay={(d) => { setSelectedDate(d); setCurrentDate(d); setView('day'); }} />
          )}
          {view === 'agenda' && (
            <AgendaListView events={filteredEvents} getEventMeta={getEventMeta} onEventDoubleClick={setDetailsEvent} />
          )}
        </div>
      </div>

      {/* Create/Edit modal */}
      <CreateAppointmentModal open={createOpen} initial={createInitial} mode={createMode}
        onClose={() => setCreateOpen(false)} onSave={handleSave} onDelete={handleDelete}
        patients={patients} treatments={treatments} events={events} />

      {/* Details modal */}
      <EventDetailsModal meta={detailsEvent ? getEventMeta(detailsEvent) : null}
        onClose={() => setDetailsEvent(null)} onEdit={openEdit} onDelete={(id) => { handleDelete(id); setDetailsEvent(null); }} />

      {/* Tooltip — clique num agendamento fixa o cartão (funciona em toque); hover mostra sem precisar clicar */}
      {(() => {
        const active = pinned || hover;
        return <EventTooltip meta={active?.meta} style={active ? { top: active.y + 14, left: Math.min(active.x + 14, window.innerWidth - 280) } : {}} />;
      })()}
    </div>
  );
}
