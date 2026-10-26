import { ChevronRight } from 'lucide-react';
import { parseIso } from '@/lib/agendaUtils';

export default function AgendaListView({ events, getEventMeta, onEventDoubleClick }) {
  const sorted = [...events].sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start));
  const byDate = {};
  sorted.forEach(ev => { (byDate[ev.date] = byDate[ev.date] || []).push(ev); });
  const dates = Object.keys(byDate).sort();

  if (dates.length === 0) {
    return <div className="rounded-2xl bg-card border p-12 text-center" style={{ borderColor: 'var(--border-color)' }}><p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Nenhum agendamento encontrado.</p></div>;
  }

  return (
    <div className="rounded-2xl bg-card border overflow-hidden" style={{ borderColor: 'var(--border-color)', boxShadow: '0 8px 20px rgba(0,0,0,.05)', height: 'calc(100vh - 250px)', overflowY: 'auto' }}>
      {dates.map(date => {
        const d = parseIso(date);
        const label = d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });
        return (
          <div key={date}>
            <div className="sticky top-0 bg-card px-4 sm:px-6 py-3 border-b" style={{ borderColor: 'var(--border-color)' }}>
              <p className="text-sm font-semibold capitalize" style={{ color: 'var(--text-primary)' }}>{label}</p>
            </div>
            {byDate[date].map(ev => {
              const meta = getEventMeta(ev);
              return (
                <div key={ev.id} onClick={() => onEventDoubleClick(ev)}
                  className="flex items-center gap-2 sm:gap-4 px-4 sm:px-6 py-3 border-b cursor-pointer hover:bg-black/[0.02] transition-colors group" style={{ borderColor: 'var(--border-color)' }}>
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: meta.color }} />
                  <div className="w-12 sm:w-20 shrink-0">
                    <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{ev.start}</p>
                    <p className="text-xs hidden sm:block" style={{ color: 'var(--text-secondary)' }}>{ev.end}</p>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{meta.patient?.name}</p>
                    <p className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>{meta.treatment?.name}</p>
                  </div>
                  <span className="px-2 sm:px-2.5 py-1 rounded-lg text-xs font-medium shrink-0" style={{ backgroundColor: `${meta.statusStyle.color}14`, color: meta.statusStyle.color }}>{meta.statusStyle.label}</span>
                  <ChevronRight size={16} className="hidden sm:block shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: 'var(--text-secondary)' }} />
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}