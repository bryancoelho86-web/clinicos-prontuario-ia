import { isoDate, sameDay } from '@/lib/agendaUtils';

const DAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

export default function MonthView({ currentDate, events, getEventMeta, onEventDoubleClick, onSelectDay }) {
  const monthStart = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
  const startDay = monthStart.getDay();
  const daysInMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < startDay; i++) cells.push(null);
  for (let i = 1; i <= daysInMonth; i++) cells.push(new Date(currentDate.getFullYear(), currentDate.getMonth(), i));
  while (cells.length % 7 !== 0) cells.push(null);

  const today = new Date();
  const eventsForDay = (date) => events.filter(ev => ev.date === isoDate(date)).sort((a, b) => a.start.localeCompare(b.start));

  return (
    <div className="rounded-2xl bg-card border overflow-auto" style={{ borderColor: 'var(--border-color)', boxShadow: '0 8px 20px rgba(0,0,0,.05)', height: 'calc(100vh - 250px)' }}>
      <div className="min-w-[560px] h-full">
        <div className="grid border-b" style={{ gridTemplateColumns: 'repeat(7, 1fr)', borderColor: 'var(--border-color)' }}>
          {DAYS.map(d => <div key={d} className="p-3 text-center text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>{d}</div>)}
        </div>
        <div className="grid overflow-y-auto" style={{ gridTemplateColumns: 'repeat(7, 1fr)', height: 'calc(100% - 45px)' }}>
        {cells.map((date, i) => {
          if (!date) return <div key={i} className="border-r border-b" style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-tag)' }} />;
          const isToday = sameDay(date, today);
          const dayEvts = eventsForDay(date);
          return (
            <div key={i} className="border-r border-b p-1.5 min-h-24 cursor-pointer hover:bg-black/[0.02] transition-colors" style={{ borderColor: 'var(--border-color)' }} onClick={() => onSelectDay(date)}>
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium mb-1 ${isToday ? 'text-white' : ''}`} style={isToday ? { backgroundColor: 'var(--green-primary)' } : { color: 'var(--text-secondary)' }}>{date.getDate()}</div>
              <div className="space-y-1">
                {dayEvts.slice(0, 3).map(ev => {
                  const meta = getEventMeta(ev);
                  return (
                    <div key={ev.id} onClick={(e) => { e.stopPropagation(); onEventDoubleClick(ev); }}
                      className="rounded-md px-1.5 py-0.5 text-xs font-medium truncate flex items-center gap-1"
                      style={{ backgroundColor: `${meta.color}1A`, color: meta.color, borderLeft: `2px solid ${meta.color}`, opacity: ev.status === 'cancelled' ? 0.5 : 1 }}>
                      <span className="font-semibold">{ev.start}</span> {meta.patient?.name}
                    </div>
                  );
                })}
                {dayEvts.length > 3 && <div className="text-xs px-1.5" style={{ color: 'var(--text-secondary)' }}>+ {dayEvts.length - 3} mais</div>}
              </div>
            </div>
          );
        })}
        </div>
      </div>
    </div>
  );
}