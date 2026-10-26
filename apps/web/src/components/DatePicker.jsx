import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import { isoDate, parseIso, sameDay } from '@/lib/agendaUtils';

const DIAS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const PANEL_WIDTH = 264;
const PANEL_HEIGHT_ESTIMADA = 360;

function formatarExibicao(valorIso) {
  if (!valorIso) return '';
  const [y, m, d] = valorIso.split('-');
  return `${d}/${m}/${y}`;
}

// Substitui o `<input type="date">` nativo (calendário do navegador, fora da
// identidade visual do sistema) em todo o app. Reaproveita a mesma grade de
// dias do `MiniCalendar.jsx` da Agenda (mesmas cores verde/dourado), mas
// portalado em `document.body` e posicionado via `getBoundingClientRect` —
// necessário porque a maioria dos usos fica dentro de modais com
// `overflow-y-auto`, que cortaria um dropdown posicionado só com `absolute`.
export default function DatePicker({ value, onChange, placeholder = 'Selecionar data' }) {
  const [open, setOpen] = useState(false);
  const [pickerMes, setPickerMes] = useState(false);
  const [pickerAno, setPickerAno] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const triggerRef = useRef(null);
  const panelRef = useRef(null);

  const selected = value ? parseIso(value) : null;
  const [view, setView] = useState(selected || new Date());

  const abrir = () => {
    const rect = triggerRef.current.getBoundingClientRect();
    const abrirParaCima = rect.bottom + PANEL_HEIGHT_ESTIMADA > window.innerHeight;
    setPos({
      top: abrirParaCima ? rect.top - PANEL_HEIGHT_ESTIMADA - 6 : rect.bottom + 6,
      left: Math.min(Math.max(8, rect.left), window.innerWidth - PANEL_WIDTH - 8),
    });
    setView(selected || new Date());
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const fechar = () => { setOpen(false); setPickerMes(false); setPickerAno(false); };
    const aoClicarFora = (e) => {
      if (triggerRef.current?.contains(e.target)) return;
      if (panelRef.current?.contains(e.target)) return;
      fechar();
    };
    const aoTeclar = (e) => { if (e.key === 'Escape') fechar(); };
    // Listener de scroll em capture pega qualquer rolagem da página, inclusive
    // a rolagem interna das listas de mês/ano (`overflow-y-auto` dentro do
    // próprio painel) — sem esse filtro, rolar a lista de anos fechava o
    // calendário inteiro no meio da navegação.
    const aoRolar = (e) => { if (panelRef.current?.contains(e.target)) return; fechar(); };
    document.addEventListener('mousedown', aoClicarFora);
    document.addEventListener('keydown', aoTeclar);
    window.addEventListener('scroll', aoRolar, true);
    window.addEventListener('resize', fechar);
    return () => {
      document.removeEventListener('mousedown', aoClicarFora);
      document.removeEventListener('keydown', aoTeclar);
      window.removeEventListener('scroll', aoRolar, true);
      window.removeEventListener('resize', fechar);
    };
  }, [open]);

  const monthStart = new Date(view.getFullYear(), view.getMonth(), 1);
  const startDay = monthStart.getDay();
  const daysInMonth = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < startDay; i++) cells.push(null);
  for (let i = 1; i <= daysInMonth; i++) cells.push(new Date(view.getFullYear(), view.getMonth(), i));
  while (cells.length % 7 !== 0) cells.push(null);

  const today = new Date();
  const anoAtual = today.getFullYear();
  const anos = Array.from({ length: 121 }, (_, i) => anoAtual + 20 - i);

  const selecionar = (d) => { onChange(isoDate(d)); setOpen(false); };

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => (open ? setOpen(false) : abrir())}
        className="w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl border text-sm text-left outline-none"
        style={{ borderColor: 'var(--border-color)', backgroundColor: 'rgb(var(--card))', color: value ? 'var(--text-primary)' : 'var(--text-secondary)' }}
      >
        <span>{value ? formatarExibicao(value) : placeholder}</span>
        <Calendar size={15} style={{ color: 'var(--text-secondary)' }} />
      </button>

      {open && createPortal(
        <div
          ref={panelRef}
          className="fixed z-50 p-3 rounded-xl border shadow-lg"
          style={{ top: pos.top, left: pos.left, width: PANEL_WIDTH, borderColor: 'var(--border-color)', backgroundColor: 'rgb(var(--card))', boxShadow: '0 8px 24px rgba(0,0,0,.16)' }}
        >
          <div className="flex items-center justify-between mb-3 gap-1">
            <div className="flex items-center gap-0.5 relative">
              <button type="button" onClick={() => { setPickerMes(m => !m); setPickerAno(false); }} className="text-sm font-semibold capitalize px-1.5 py-0.5 rounded-md hover:bg-black/5 transition-colors" style={{ color: 'var(--text-primary)' }}>
                {MESES[view.getMonth()]}
              </button>
              <button type="button" onClick={() => { setPickerAno(a => !a); setPickerMes(false); }} className="text-sm font-semibold px-1.5 py-0.5 rounded-md hover:bg-black/5 transition-colors" style={{ color: 'var(--text-primary)' }}>
                {view.getFullYear()}
              </button>

              {pickerMes && (
                <div className="absolute top-full left-0 mt-1 z-10 max-h-48 overflow-y-auto rounded-lg border py-1 w-32" style={{ borderColor: 'var(--border-color)', backgroundColor: 'rgb(var(--card))', boxShadow: '0 8px 24px rgba(0,0,0,.16)' }}>
                  {MESES.map((m, i) => (
                    <button key={m} type="button" onClick={() => { setView(v => new Date(v.getFullYear(), i, 1)); setPickerMes(false); }}
                      ref={i === view.getMonth() ? (el) => el?.scrollIntoView({ block: 'center' }) : undefined}
                      className="w-full text-left px-3 py-1.5 text-xs capitalize hover:bg-black/5 transition-colors"
                      style={i === view.getMonth() ? { color: 'var(--heading-accent)', fontWeight: 600 } : { color: 'var(--text-primary)' }}>
                      {m}
                    </button>
                  ))}
                </div>
              )}
              {pickerAno && (
                <div className="absolute top-full left-24 mt-1 z-10 max-h-48 overflow-y-auto rounded-lg border py-1 w-20" style={{ borderColor: 'var(--border-color)', backgroundColor: 'rgb(var(--card))', boxShadow: '0 8px 24px rgba(0,0,0,.16)' }}>
                  {anos.map(a => (
                    <button key={a} type="button" onClick={() => { setView(v => new Date(a, v.getMonth(), 1)); setPickerAno(false); }}
                      ref={a === view.getFullYear() ? (el) => el?.scrollIntoView({ block: 'center' }) : undefined}
                      className="w-full text-left px-3 py-1.5 text-xs hover:bg-black/5 transition-colors"
                      style={a === view.getFullYear() ? { color: 'var(--heading-accent)', fontWeight: 600 } : { color: 'var(--text-primary)' }}>
                      {a}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="flex gap-0.5">
              <button type="button" onClick={() => setView(v => new Date(v.getFullYear(), v.getMonth() - 1, 1))} className="p-1 rounded-lg hover:bg-black/5 transition-colors"><ChevronLeft size={14} style={{ color: 'var(--text-secondary)' }} /></button>
              <button type="button" onClick={() => setView(v => new Date(v.getFullYear(), v.getMonth() + 1, 1))} className="p-1 rounded-lg hover:bg-black/5 transition-colors"><ChevronRight size={14} style={{ color: 'var(--text-secondary)' }} /></button>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-y-0.5">
            {DIAS.map((d, i) => <div key={i} className="text-center text-[10px] font-medium py-1" style={{ color: 'var(--text-secondary)' }}>{d}</div>)}
            {cells.map((c, i) => {
              if (!c) return <div key={i} />;
              const isToday = sameDay(c, today);
              const isSelected = selected && sameDay(c, selected);
              return (
                <button key={i} type="button" onClick={() => selecionar(c)} className="h-7 mx-auto w-7 rounded-lg text-xs flex items-center justify-center transition-colors"
                  style={isSelected ? { backgroundColor: 'var(--green-primary)', color: '#fff' }
                    : isToday ? { backgroundColor: 'rgba(26,70,51,0.1)', color: 'var(--heading-accent)', fontWeight: 600 }
                    : { color: 'var(--text-primary)' }}>
                  {c.getDate()}
                </button>
              );
            })}
          </div>

          <div className="flex items-center justify-between mt-3 pt-2 border-t" style={{ borderColor: 'var(--border-color)' }}>
            <button type="button" onClick={() => { onChange(''); setOpen(false); }} className="text-xs font-medium hover:underline" style={{ color: 'var(--text-secondary)' }}>Limpar</button>
            <button type="button" onClick={() => selecionar(new Date())} className="text-xs font-medium hover:underline" style={{ color: 'var(--heading-accent)' }}>Hoje</button>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
