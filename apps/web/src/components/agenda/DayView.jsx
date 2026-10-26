import { useState, useRef, useEffect } from 'react';
import { HOURS, SLOT_HEIGHT, timeToTop, durationToHeight, isoDate, yToTime, addMinutes, toMinutes, layoutEvents } from '@/lib/agendaUtils';

const GRID_HEIGHT = HOURS.length * 2 * SLOT_HEIGHT;

export default function DayView({ date, events, getEventMeta, onEventDoubleClick, onSlotClick, onEventMove, onEventResize, onHover, onHoverEnd, onPin, pinnedId }) {
  const scrollRef = useRef(null);
  const [resizing, setResizing] = useState(null);
  const [previewEnd, setPreviewEnd] = useState(null);

  useEffect(() => {
    if (!resizing) return;
    const onMove = (e) => {
      const rect = scrollRef.current.getBoundingClientRect();
      const y = e.clientY - rect.top + scrollRef.current.scrollTop;
      const newEnd = yToTime(y + SLOT_HEIGHT / 2);
      setPreviewEnd(toMinutes(newEnd) > toMinutes(resizing.start) + 15 ? newEnd : addMinutes(resizing.start, 30));
    };
    const onUp = () => { if (previewEnd) onEventResize(resizing.id, previewEnd); setResizing(null); setPreviewEnd(null); };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [resizing, previewEnd]);

  const startResize = (e, event) => { e.stopPropagation(); e.preventDefault(); setResizing({ id: event.id, start: event.start }); };

  const handleDrop = (e) => {
    e.preventDefault();
    const id = e.dataTransfer.getData('text/plain');
    if (!id) return;
    const rect = scrollRef.current.getBoundingClientRect();
    const y = e.clientY - rect.top + scrollRef.current.scrollTop;
    const ev = events.find(x => String(x.id) === String(id));
    const dur = ev ? toMinutes(ev.end) - toMinutes(ev.start) : 60;
    const newStart = yToTime(y);
    onEventMove(id, isoDate(date), newStart, addMinutes(newStart, dur));
  };

  const handleColumnClick = (e) => {
    onPin(null, null);
    const rect = scrollRef.current.getBoundingClientRect();
    const y = e.clientY - rect.top + scrollRef.current.scrollTop;
    onSlotClick(isoDate(date), yToTime(y));
  };

  const dayEvents = events.filter(ev => ev.date === isoDate(date));

  return (
    <div ref={scrollRef} className="rounded-2xl bg-card border overflow-y-auto" style={{ borderColor: 'var(--border-color)', boxShadow: '0 8px 20px rgba(0,0,0,.05)', height: 'calc(100vh - 250px)' }}>
      <div className="grid relative" style={{ gridTemplateColumns: '64px 1fr' }}>
        <div className="relative" style={{ height: GRID_HEIGHT }}>
          {HOURS.map((h, i) => (
            <div key={h} className="absolute right-2 text-right text-xs" style={{ top: i === 0 ? 0 : i * 2 * SLOT_HEIGHT - 8, color: 'var(--text-secondary)', fontFamily: "'IBM Plex Mono', monospace" }}>{String(h).padStart(2, '0')}:00</div>
          ))}
        </div>
        <div className="relative border-l" style={{ borderColor: 'var(--border-color)', height: GRID_HEIGHT }}
          onClick={handleColumnClick}
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}>
          {HOURS.map((h, i) => (
            <div key={h}>
              <div className="absolute left-0 right-0 border-t" style={{ top: i * 2 * SLOT_HEIGHT, borderColor: 'var(--border-color)' }} />
              <div className="absolute left-0 right-0 border-t border-dashed opacity-50" style={{ top: i * 2 * SLOT_HEIGHT + SLOT_HEIGHT, borderColor: 'var(--border-color)' }} />
            </div>
          ))}
          {layoutEvents(dayEvents).map(({ ev, col, total }) => {
            const meta = getEventMeta(ev);
            const end = resizing?.id === ev.id && previewEnd ? previewEnd : ev.end;
            const top = timeToTop(ev.start);
            const height = Math.max(24, durationToHeight(ev.start, end) - 4);
            const widthPct = 100 / total;
            const isPinned = pinnedId === ev.id;
            // Mesma lógica do WeekView: bloco curto demais corta o texto no meio
            // em vez de só truncar — colapsa pra uma linha só nesse caso. O
            // tamanho/posição do bloco em si nunca muda (evita sobrepor o
            // vizinho) — detalhe completo vai no cartão flutuante (onPin).
            const compact = height < 40;
            return (
              <div key={ev.id}
                draggable
                onDragStart={(e) => { e.dataTransfer.setData('text/plain', String(ev.id)); e.dataTransfer.effectAllowed = 'move'; }}
                onDoubleClick={(e) => { e.stopPropagation(); onEventDoubleClick(ev); }}
                onMouseEnter={(e) => onHover(meta, e.clientX, e.clientY)}
                onMouseMove={(e) => onHover(meta, e.clientX, e.clientY)}
                onMouseLeave={onHoverEnd}
                onClick={(e) => { e.stopPropagation(); onPin(meta, ev.id, e.clientX, e.clientY); }}
                className="absolute rounded-xl px-3 py-2 overflow-hidden cursor-pointer transition-shadow hover:shadow-md group"
                style={{
                  top, height,
                  left: `calc(${col * widthPct}% + 2px)`, width: `calc(${widthPct}% - 4px)`,
                  backgroundColor: `${meta.color}1A`, borderLeft: `4px solid ${meta.color}`,
                  outline: isPinned ? `2px solid ${meta.color}` : undefined,
                  opacity: ev.status === 'cancelled' ? 0.5 : 1,
                }}>
                {compact ? (
                  <div className="flex items-center gap-1.5 h-full">
                    <span className="text-[11px] font-semibold shrink-0" style={{ color: meta.color }}>{ev.start}</span>
                    <span className="text-xs font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{meta.patient?.name}</span>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-semibold" style={{ color: meta.color }}>{ev.start} – {end}</span>
                      {ev.status !== 'confirmed' && <span className="w-2 h-2 rounded-full" style={{ backgroundColor: meta.statusStyle.color }} />}
                    </div>
                    <p className="text-sm font-semibold truncate mt-0.5" style={{ color: 'var(--text-primary)' }}>{meta.patient?.name}</p>
                    {height > 55 && <p className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>{meta.treatment?.name}</p>}
                    {ev.notes && height > 70 && <p className="text-xs truncate mt-1" style={{ color: 'var(--text-secondary)' }}>{ev.notes}</p>}
                  </>
                )}
                <div onMouseDown={(e) => startResize(e, ev)} className="absolute bottom-0 left-0 right-0 h-2 cursor-ns-resize opacity-0 group-hover:opacity-100 transition-opacity" style={{ backgroundColor: meta.color }} />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}