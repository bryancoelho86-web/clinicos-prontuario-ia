import { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { addDays, sameDay } from '@/lib/agendaUtils';

const D = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

export default function MiniCalendar({ selectedDate, onSelectDate, eventDates = [] }) {
  const [view, setView] = useState(new Date(selectedDate));

  // Re-sincroniza o mês exibido sempre que selectedDate mudar por fora (ex:
  // clique em "Hoje" na Agenda) — sem isso, navegar o mini-calendário pra
  // outro mês localmente e depois resetar a data por fora deixava o
  // mini-calendário preso no mês antigo (achado #5 da auditoria).
  useEffect(() => {
    setView(new Date(selectedDate));
  }, [selectedDate]);

  const monthStart = new Date(view.getFullYear(), view.getMonth(), 1);
  const startDay = monthStart.getDay();
  const daysInMonth = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < startDay; i++) cells.push(null);
  for (let i = 1; i <= daysInMonth; i++) cells.push(new Date(view.getFullYear(), view.getMonth(), i));
  while (cells.length % 7 !== 0) cells.push(null);

  const today = new Date();
  const eventSet = new Set(eventDates.map(d => d.toDateString()));

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-semibold capitalize" style={{ color: 'var(--text-primary)' }}>
          {MONTHS[view.getMonth()]} {view.getFullYear()}
        </p>
        <div className="flex gap-0.5">
          <button onClick={() => setView(v => new Date(v.getFullYear(), v.getMonth() - 1, 1))} className="p-1 rounded-lg hover:bg-black/5 transition-colors"><ChevronLeft size={14} style={{ color: 'var(--text-secondary)' }} /></button>
          <button onClick={() => setView(v => new Date(v.getFullYear(), v.getMonth() + 1, 1))} className="p-1 rounded-lg hover:bg-black/5 transition-colors"><ChevronRight size={14} style={{ color: 'var(--text-secondary)' }} /></button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-y-0.5">
        {D.map((d, i) => <div key={i} className="text-center text-[10px] font-medium py-1" style={{ color: 'var(--text-secondary)' }}>{d}</div>)}
        {cells.map((c, i) => {
          if (!c) return <div key={i} />;
          const isToday = sameDay(c, today);
          const isSelected = sameDay(c, selectedDate);
          const hasEvents = eventSet.has(c.toDateString());
          return (
            <button key={i} onClick={() => onSelectDate(c)} className="relative h-7 mx-auto w-7 rounded-lg text-xs flex items-center justify-center transition-all"
              style={isSelected ? { backgroundColor: 'var(--green-primary)', color: '#fff' }
                : isToday ? { backgroundColor: 'rgba(26,70,51,0.1)', color: 'var(--green-primary)', fontWeight: 600 }
                : { color: 'var(--text-primary)' }}>
              {c.getDate()}
              {hasEvents && !isSelected && <span className="absolute bottom-0.5 w-1 h-1 rounded-full" style={{ backgroundColor: 'var(--gold)' }} />}
            </button>
          );
        })}
      </div>
    </div>
  );
}