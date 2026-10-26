import { useState, useEffect } from 'react';
import { X, Search, Check, Clock, AlertTriangle } from 'lucide-react';
import { TIME_OPTIONS, addMinutes, overlaps, isoDate, toMinutes, STATUS_STYLES } from '@/lib/agendaUtils';
import { ClassificationBadge } from '@/lib/classifications';
import { useResponsiveNav } from '@/hooks/useResponsiveNav';
import DatePicker from '@/components/DatePicker';

function SelectableList({ placeholder, items, value, onSelect, renderItem, emptyText }) {
  const [q, setQ] = useState('');
  const filtered = q.trim()
    ? items.filter(i => renderItem(i).label.toLowerCase().includes(q.toLowerCase()) || (renderItem(i).sub || '').toLowerCase().includes(q.toLowerCase()))
    : items;
  return (
    <div className="rounded-2xl border" style={{ borderColor: 'var(--border-color)' }}>
      <div className="relative border-b" style={{ borderColor: 'var(--border-color)' }}>
        <Search size={14} className="absolute left-3 top-3" style={{ color: 'var(--text-secondary)' }} />
        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder={placeholder}
          className="w-full pl-9 pr-3 py-2.5 text-sm outline-none bg-transparent rounded-t-2xl"
          style={{ color: 'var(--text-primary)' }}
        />
      </div>
      <div className="max-h-44 overflow-y-auto p-1.5">
        {filtered.length === 0 && <p className="text-xs text-center py-4" style={{ color: 'var(--text-secondary)' }}>{emptyText}</p>}
        {filtered.map(item => {
          const meta = renderItem(item);
          const active = String(value) === String(item.id);
          return (
            <button
              key={item.id}
              onClick={() => onSelect(item)}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all"
              style={active ? { backgroundColor: 'rgba(26,70,51,0.08)', border: '1px solid var(--green-primary)' } : { border: '1px solid transparent' }}
            >
              {meta.avatar ?? <span className="w-8 h-8 rounded-lg shrink-0 flex items-center justify-center text-white text-xs font-semibold" style={{ backgroundColor: 'var(--green-primary)' }}>{meta.initials}</span>}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{meta.label}</p>
                {meta.sub && <p className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>{meta.sub}</p>}
                {meta.badges && <div className="flex gap-1 mt-1 flex-wrap">{meta.badges}</div>}
              </div>
              {active && <Check size={16} className="shrink-0" style={{ color: 'var(--green-primary)' }} />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function CreateAppointmentModal({ open, initial, mode, onClose, onSave, onDelete, patients, treatments, events }) {
  const { modo: modoTela } = useResponsiveNav();
  const isSheet = modoTela !== 'desktop';
  const [form, setForm] = useState({ patientId: '', treatmentId: '', date: '', start: '09:00', end: '09:30', notes: '', status: 'confirmed' });
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    setConfirmDeleteOpen(false);
    if (mode === 'edit' && initial) {
      setForm({
        patientId: initial.patientId,
        treatmentId: initial.treatmentId,
        date: initial.date,
        start: initial.start,
        end: initial.end,
        notes: initial.notes || '',
        status: initial.status,
      });
    } else {
      const treatmentPrefil = initial?.treatmentId ? treatments.find(t => String(t.id) === String(initial.treatmentId)) : null;
      setForm(f => ({
        ...f,
        patientId: initial?.patientId || '',
        treatmentId: initial?.treatmentId || '',
        end: treatmentPrefil ? addMinutes(initial?.start || f.start, treatmentPrefil.duration) : '09:30',
        notes: '',
        status: 'confirmed',
        date: initial?.date || isoDate(new Date()),
        start: initial?.start || '09:00',
      }));
    }
  }, [open, mode, initial, treatments]);

  if (!open) return null;

  const treatment = treatments.find(t => String(t.id) === String(form.treatmentId));

  const onStartChange = (start) => {
    setForm(f => ({ ...f, start, end: treatment ? addMinutes(start, treatment.duration) : addMinutes(start, 30) }));
  };

  const onSelectTreatment = (t) => {
    setForm(f => ({ ...f, treatmentId: t.id, end: addMinutes(f.start, t.duration) }));
  };

  // Agenda única (mono-médico) — qualquer sobreposição de horário conflita,
  // não só a do mesmo profissional (não existe mais esse conceito).
  const conflict = form.date && events
    .filter(e => e.date === form.date && e.status !== 'cancelled' && (mode !== 'edit' || e.id !== initial?.id))
    .find(e => overlaps(form.start, form.end, e.start, e.end));

  // Guarda extra além do clamp em toTime/addMinutes (agendaUtils.js): mesmo
  // sem dar wrap pra antes da meia-noite, um início muito tarde + tratamento
  // longo ainda pode clampar o fim exatamente em 23:59 e empatar ou inverter
  // com o início — bloqueia o salvamento nesse caso (achado #3 da auditoria).
  const invalidTime = toMinutes(form.end) <= toMinutes(form.start);

  const canSave = form.patientId && form.treatmentId && form.date && !invalidTime;

  const handleSave = () => {
    if (!canSave) return;
    onSave({ ...form });
  };

  return (
    <>
    <div className={`fixed inset-0 bg-black/40 backdrop-blur-sm flex justify-center z-50 ${isSheet ? 'items-end' : 'items-center'}`} onClick={onClose}>
      <div
        className={`bg-card shadow-2xl overflow-y-auto ${isSheet ? 'w-full max-h-[92vh] rounded-t-3xl animate-sheet-slide-up' : 'w-[560px] max-h-[92vh] rounded-3xl'}`}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-6 border-b sticky top-0 bg-card z-10" style={{ borderColor: 'var(--border-color)' }}>
          <h3 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>{mode === 'edit' ? 'Editar agendamento' : 'Novo agendamento'}</h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100"><X size={18} style={{ color: 'var(--text-secondary)' }} /></button>
        </div>

        <div className="p-6 space-y-5">
          {/* Date + time */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium block mb-1.5" style={{ color: 'var(--text-secondary)' }}>Dia *</label>
              <DatePicker value={form.date} onChange={v => setForm(f => ({ ...f, date: v }))} />
            </div>
            <div>
              <label className="text-xs font-medium block mb-1.5" style={{ color: 'var(--text-secondary)' }}>Horário</label>
              <div className="flex gap-2">
                <select value={form.start} onChange={e => onStartChange(e.target.value)} className="flex-1 px-3 py-2.5 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--border-color)', color: 'var(--text-primary)', backgroundColor: 'rgb(var(--card))' }}>
                  {TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                <span className="flex items-center gap-1 px-3 py-2.5 rounded-xl text-xs" style={{ backgroundColor: 'var(--bg-tag)', color: 'var(--text-secondary)' }}>
                  <Clock size={12} /> até {form.end}
                </span>
              </div>
            </div>
          </div>

          {/* Patient */}
          <div>
            <label className="text-xs font-medium block mb-1.5" style={{ color: 'var(--text-secondary)' }}>Paciente *</label>
            <SelectableList
              placeholder="Buscar paciente..."
              items={patients}
              value={form.patientId}
              onSelect={(p) => setForm(f => ({ ...f, patientId: p ? p.id : '' }))}
              emptyText="Nenhum paciente encontrado."
              renderItem={(p) => ({
                label: p.name,
                sub: p.phone,
                initials: p.name.split(' ').map(n => n[0]).join('').slice(0, 2),
                badges: (p.classification || []).map(c => <ClassificationBadge key={c} name={c} />),
              })}
            />
          </div>

          {/* Treatment */}
          <div>
            <label className="text-xs font-medium block mb-1.5" style={{ color: 'var(--text-secondary)' }}>Tratamento *</label>
            <SelectableList
              placeholder="Buscar tratamento..."
              items={treatments}
              value={form.treatmentId ? String(form.treatmentId) : ''}
              onSelect={onSelectTreatment}
              emptyText="Nenhum tratamento encontrado."
              renderItem={(t) => ({
                label: t.name,
                sub: `${t.duration} min${t.value != null ? ` · R$ ${t.value}` : ''}`,
                avatar: <span className="w-8 h-8 rounded-lg shrink-0 flex items-center justify-center text-xs font-semibold" style={{ backgroundColor: `${t.color}1a`, color: t.color }}>{t.name[0]}</span>,
              })}
            />
          </div>

          {/* Notes */}
          <div>
            <label className="text-xs font-medium block mb-1.5" style={{ color: 'var(--text-secondary)' }}>Observações <span className="font-normal">(opcional)</span></label>
            <textarea rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Alguma observação sobre o atendimento..." className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none resize-none" style={{ borderColor: 'var(--border-color)', backgroundColor: 'rgb(var(--card))', color: 'var(--text-primary)' }} />
          </div>

          {/* Conflict */}
          {conflict && (
            <div className="flex items-start gap-2.5 p-3 rounded-xl" style={{ backgroundColor: 'rgba(220, 38, 38, 0.10)', border: '1px solid rgba(220, 38, 38, 0.35)' }}>
              <AlertTriangle size={16} className="text-red-500 shrink-0 mt-0.5" />
              <p className="text-xs text-red-500">Já existe um atendimento nesse horário. Escolha outro horário.</p>
            </div>
          )}

          {/* Invalid time */}
          {invalidTime && (
            <div className="flex items-start gap-2.5 p-3 rounded-xl" style={{ backgroundColor: 'rgba(220, 38, 38, 0.10)', border: '1px solid rgba(220, 38, 38, 0.35)' }}>
              <AlertTriangle size={16} className="text-red-500 shrink-0 mt-0.5" />
              <p className="text-xs text-red-500">O horário de término precisa ser depois do horário de início.</p>
            </div>
          )}
        </div>

        <div className="flex gap-3 p-6 border-t sticky bottom-0 bg-card" style={{ borderColor: 'var(--border-color)' }}>
          {mode === 'edit' && onDelete && (
            <button onClick={() => setConfirmDeleteOpen(true)} className="px-4 py-3 rounded-2xl text-sm font-medium border text-red-500 transition-[background-color] duration-200 hover:bg-red-500/10" style={{ borderColor: 'rgba(220, 38, 38, 0.35)' }}>Excluir</button>
          )}
          <button onClick={onClose} className="flex-1 py-3 rounded-2xl text-sm font-medium border" style={{ borderColor: 'var(--border-color)', color: 'var(--text-secondary)' }}>Cancelar</button>
          <button onClick={handleSave} disabled={!canSave} className="flex-1 py-3 rounded-2xl text-sm font-semibold text-white transition-[transform,box-shadow] duration-200 hover:shadow-lg hover:-translate-y-0.5 disabled:opacity-40" style={{ backgroundColor: 'var(--green-primary)' }}>Salvar agendamento</button>
        </div>
      </div>
    </div>

    {confirmDeleteOpen && (
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50" onClick={() => setConfirmDeleteOpen(false)}>
        <div className="bg-card rounded-3xl p-8 w-[420px] shadow-2xl" onClick={e => e.stopPropagation()} style={{ borderTop: '3px solid #DC2626' }}>
          <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Excluir agendamento?</h3>
          <p className="text-sm mb-6" style={{ color: 'var(--text-secondary)' }}>
            Tem certeza que quer excluir esse agendamento? Essa ação não pode ser desfeita.
          </p>
          <div className="flex gap-3">
            <button onClick={() => setConfirmDeleteOpen(false)} className="flex-1 py-3 rounded-2xl text-sm font-medium border" style={{ borderColor: 'var(--border-color)', color: 'var(--text-secondary)' }}>
              Cancelar
            </button>
            <button
              onClick={() => { setConfirmDeleteOpen(false); onDelete(initial.id); }}
              className="flex-1 py-3 rounded-2xl text-sm font-semibold text-white"
              style={{ backgroundColor: '#DC2626' }}
            >
              Excluir
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}