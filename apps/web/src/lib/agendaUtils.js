export const HOUR_START = 6;
export const HOUR_END = 19;
export const SLOT_MINUTES = 30;
export const SLOT_HEIGHT = 30;

export const HOURS = Array.from({ length: HOUR_END - HOUR_START }, (_, i) => HOUR_START + i);

// Cores fixas (não variáveis CSS) porque são consumidas em JS — inclusive
// como sufixo de opacidade tipo `${color}1A` pra fundo translúcido dos
// blocos de evento — então não dá pra trocar por tema dinamicamente sem uma
// refatoração maior. 'confirmed' era #1A4633 (verde bem escuro) — ilegível
// sobre fundo escuro; trocado por um verde mais claro que funciona nos dois
// temas (achado testando o modo escuro da Agenda).
export const STATUS_STYLES = {
  confirmed: { label: 'Confirmado', color: '#2F7D5A' },
  pending: { label: 'Pendente', color: '#F59E0B' },
  cancelled: { label: 'Cancelado', color: '#9CA3AF' },
  done: { label: 'Realizado', color: '#3B82F6' },
  missed: { label: 'Faltou', color: '#DC2626' },
};

export const toMinutes = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
// Clampa em vez de dar wrap (mod 1440) — antes, um resize/drag que passasse
// da meia-noite (grid sem limite superior no listener de mousemove, ver
// WeekView.jsx/DayView.jsx) ou um tratamento longo perto do fim do dia
// (CreateAppointmentModal.jsx) podia gerar um `fim` no dia seguinte, cedo da
// manhã — menor que o `início`, no mesmo `date` — e isso ia direto pro banco
// sem nenhuma guarda (achado #3 da auditoria). Clampar em 23:59 garante que
// nenhum horário computado por essa função passe da virada do dia.
export const toTime = (mins) => { mins = Math.max(0, Math.min(1439, mins)); const h = Math.floor(mins / 60), m = mins % 60; return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`; };
export const addMinutes = (t, mins) => toTime(toMinutes(t) + mins);
export const durationMin = (start, end) => toMinutes(end) - toMinutes(start);

export const timeToTop = (t) => ((toMinutes(t) - HOUR_START * 60) / SLOT_MINUTES) * SLOT_HEIGHT;
export const durationToHeight = (start, end) => ((toMinutes(end) - toMinutes(start)) / SLOT_MINUTES) * SLOT_HEIGHT;
export const slotIndexToTime = (idx) => toTime(HOUR_START * 60 + idx * SLOT_MINUTES);
export const yToTime = (y) => slotIndexToTime(Math.max(0, Math.floor(y / SLOT_HEIGHT)));

export const isoDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const parseIso = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
export const sameDay = (a, b) => a.toDateString() === b.toDateString();

export const startOfWeek = (d) => { const x = new Date(d); x.setDate(x.getDate() - x.getDay()); x.setHours(0, 0, 0, 0); return x; };
export const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

export const overlaps = (aStart, aEnd, bStart, bEnd) => toMinutes(aStart) < toMinutes(bEnd) && toMinutes(bStart) < toMinutes(aEnd);

export const TIME_OPTIONS = (() => {
  const opts = [];
  for (let h = HOUR_START; h < HOUR_END; h++) for (const m of [0, 15, 30, 45]) opts.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
  return opts;
})();

// Position overlapping events side-by-side (Google Calendar style)
export const layoutEvents = (events) => {
  const sorted = [...events].sort((a, b) => toMinutes(a.start) - toMinutes(b.start));
  const result = [];
  let cluster = [];
  let clusterEnd = -1;
  const flush = () => {
    if (!cluster.length) return;
    const cols = [];
    cluster.forEach(ev => {
      let c = 0;
      while (cols[c] && toMinutes(cols[c]) > toMinutes(ev.start)) c++;
      cols[c] = ev.end;
      result.push({ ev, col: c, total: 0 });
    });
    const total = cols.length;
    result.forEach(r => { if (cluster.includes(r.ev)) r.total = total; });
    cluster = [];
  };
  sorted.forEach(ev => {
    if (cluster.length === 0 || toMinutes(ev.start) >= clusterEnd) { flush(); cluster = [ev]; clusterEnd = toMinutes(ev.end); }
    else { cluster.push(ev); clusterEnd = Math.max(clusterEnd, toMinutes(ev.end)); }
  });
  flush();
  return result;
};

// Sem cor cadastrada por procedimento no schema real — deriva uma cor estável
// a partir do id, só para diferenciar blocos visualmente no modo "Tratamento".
const TREATMENT_PALETTE = ['#1A4633', '#C9A24D', '#3B82F6', '#F97316', '#8B5CF6', '#DC2626', '#0EA5E9', '#059669'];
export const colorForId = (id) => {
  let hash = 0;
  for (const ch of String(id)) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return TREATMENT_PALETTE[hash % TREATMENT_PALETTE.length];
};