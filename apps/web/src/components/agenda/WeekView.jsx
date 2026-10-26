import { useState, useRef, useEffect } from 'react';
import { HOURS, SLOT_HEIGHT, timeToTop, durationToHeight, isoDate, sameDay, yToTime, addMinutes, toMinutes, layoutEvents } from '@/lib/agendaUtils';

const DAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const GRID_HEIGHT = HOURS.length * 2 * SLOT_HEIGHT;

export default function WeekView({ weekDates, events, getEventMeta, colorMode, onEventDoubleClick, onSlotClick, onEventMove, onEventResize, onHover, onHoverEnd, onPin, pinnedId }) {
  const scrollRef = useRef(null);
  const bodyRef = useRef(null);
  const [resizing, setResizing] = useState(null);
  const [previewEnd, setPreviewEnd] = useState(null);
  const today = new Date();

  useEffect(() => {
    if (!resizing) return;
    const onMove = (e) => {
      const rect = bodyRef.current.getBoundingClientRect();
      const y = e.clientY - rect.top;
      const newEnd = yToTime(y + SLOT_HEIGHT / 2);
      setPreviewEnd(toMinutes(newEnd) > toMinutes(resizing.start) + 15 ? newEnd : addMinutes(resizing.start, 30));
    };
    const onUp = () => {
      if (previewEnd) onEventResize(resizing.id, previewEnd);
      setResizing(null); setPreviewEnd(null);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [resizing, previewEnd]);

  const startResize = (e, event) => { e.stopPropagation(); e.preventDefault(); setResizing({ id: event.id, start: event.start }); };

  const handleDrop = (e, date) => {
    e.preventDefault();
    const id = e.dataTransfer.getData('text/plain');
    if (!id) return;
    const rect = bodyRef.current.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const ev = events.find(x => String(x.id) === String(id));
    const dur = ev ? toMinutes(ev.end) - toMinutes(ev.start) : 60;
    const newStart = yToTime(y);
    onEventMove(id, isoDate(date), newStart, addMinutes(newStart, dur));
  };

  const handleColumnClick = (e, date) => {
    onPin(null, null);
    const rect = bodyRef.current.getBoundingClientRect();
    const y = e.clientY - rect.top;
    onSlotClick(isoDate(date), yToTime(y));
  };

  const eventsForDay = (date) => events.filter(ev => ev.date === isoDate(date));

  return (
    <div ref={scrollRef} className="rounded-2xl bg-card border overflow-auto" style={{ borderColor: 'var(--border-color)', boxShadow: '0 8px 20px rgba(0,0,0,.05)', height: 'calc(100vh - 250px)' }}>
      <div className="min-w-[700px]">
        {/* Header */}
        <div className="grid sticky top-0 bg-card z-20 border-b" style={{ gridTemplateColumns: '56px repeat(7, 1fr)', borderColor: 'var(--border-color)' }}>
          <div />
          {weekDates.map((d, i) => {
            const isToday = sameDay(d, today);
            return (
              <div key={i} className="border-l p-2 text-center" style={{ borderColor: 'var(--border-color)' }}>
                <p className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>{DAY_LABELS[d.getDay()]}</p>
                <div className="w-8 h-8 rounded-full flex items-center justify-center mx-auto text-sm font-semibold mt-0.5" style={isToday ? { backgroundColor: 'var(--green-primary)', color: '#fff' } : { color: 'var(--text-primary)' }}>{d.getDate()}</div>
              </div>
            );
          })}
        </div>

        {/* Body */}
        <div ref={bodyRef} className="grid relative" style={{ gridTemplateColumns: '56px repeat(7, 1fr)' }}>
        {/* Time gutter */}
        <div className="relative" style={{ height: GRID_HEIGHT }}>
          {HOURS.map((h, i) => (
            <div key={h} className="absolute right-2 text-right text-[11px]" style={{ top: i === 0 ? 0 : i * 2 * SLOT_HEIGHT - 8, color: 'var(--text-secondary)', fontFamily: "'IBM Plex Mono', monospace" }}>{String(h).padStart(2, '0')}:00</div>
          ))}
        </div>

        {/* Day columns */}
        {weekDates.map((d, dayIdx) => (
          <div key={dayIdx} className="relative border-l" style={{ borderColor: 'var(--border-color)', height: GRID_HEIGHT, backgroundColor: sameDay(d, today) ? 'rgba(26,70,51,0.025)' : 'transparent' }}
            onClick={(e) => handleColumnClick(e, d)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => handleDrop(e, d)}>
            {/* slot lines */}
            {HOURS.map((h, i) => (
              <div key={h}>
                <div className="absolute left-0 right-0 border-t" style={{ top: i * 2 * SLOT_HEIGHT, borderColor: 'var(--border-color)' }} />
                <div className="absolute left-0 right-0 border-t border-dashed opacity-50" style={{ top: i * 2 * SLOT_HEIGHT + SLOT_HEIGHT, borderColor: 'var(--border-color)' }} />
              </div>
            ))}
            {/* events */}
            {layoutEvents(eventsForDay(d)).map(({ ev, col, total }) => {
              const meta = getEventMeta(ev);
              const end = resizing?.id === ev.id && previewEnd ? previewEnd : ev.end;
              const top = timeToTop(ev.start);
              const height = Math.max(22, durationToHeight(ev.start, end) - 4);
              const widthPct = 100 / total;
              const isPinned = pinnedId === ev.id;
              // Bloco curto demais pra caber horário + nome sem cortar o texto no meio
              // (overflow-hidden cortaria a linha, não só truncar com "...") — nesse
              // caso colapsa pra uma linha só, sempre legível via truncate. O tamanho/
              // posição do bloco em si nunca muda (evita sobrepor o vizinho) — ver
              // full detail no cartão flutuante (onPin), não esticando o bloco.
              const compact = height < 34;
              return (
                <div
                  key={ev.id}
                  draggable
                  onDragStart={(e) => { e.dataTransfer.setData('text/plain', String(ev.id)); e.dataTransfer.effectAllowed = 'move'; }}
                  onDoubleClick={(e) => { e.stopPropagation(); onEventDoubleClick(ev); }}
                  onMouseEnter={(e) => onHover(meta, e.clientX, e.clientY)}
                  onMouseMove={(e) => onHover(meta, e.clientX, e.clientY)}
                  onMouseLeave={onHoverEnd}
                  onClick={(e) => { e.stopPropagation(); onPin(meta, ev.id, e.clientX, e.clientY); }}
                  className="absolute rounded-lg px-2 py-1 overflow-hidden cursor-pointer transition-shadow hover:shadow-md group"
                  style={{
                    top, height,
                    left: `calc(${col * widthPct}% + 2px)`,
                    width: `calc(${widthPct}% - 4px)`,
                    backgroundColor: `${meta.color}1A`,
                    borderLeft: `3px solid ${meta.color}`,
                    outline: isPinned ? `2px solid ${meta.color}` : undefined,
                    opacity: ev.status === 'cancelled' ? 0.5 : 1,
                  }}
                >
                  {compact ? (
                    <div className="flex items-center gap-1 h-full">
                      <span className="text-[9px] font-semibold shrink-0" style={{ color: meta.color }}>{ev.start}</span>
                      <span className="text-[10px] font-medium truncate" style={{ color: 'var(--text-primary)' }}>{meta.patient?.name}</span>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] font-semibold" style={{ color: meta.color }}>{ev.start}</span>
                        {ev.status !== 'confirmed' && <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: meta.statusStyle.color }} />}
                      </div>
                      <p className="text-xs font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{meta.patient?.name}</p>
                      {height > 44 && <p className="text-[10px] truncate" style={{ color: 'var(--text-secondary)' }}>{meta.treatment?.name}</p>}
                    </>
                  )}
                  <div
                    onMouseDown={(e) => startResize(e, ev)}
                    className="absolute bottom-0 left-0 right-0 h-1.5 cursor-ns-resize opacity-0 group-hover:opacity-100 transition-opacity"
                    style={{ backgroundColor: meta.color }}
                  />
                </div>
              );
            })}
          </div>
        ))}
        </div>
      </div>
    </div>
  );
}