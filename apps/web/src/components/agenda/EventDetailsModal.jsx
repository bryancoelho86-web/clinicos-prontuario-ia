import { useState, useEffect } from 'react';
import { X, Pencil, Trash2, CalendarClock, Phone, Clock, FileText } from 'lucide-react';
import { STATUS_STYLES } from '@/lib/agendaUtils';

export default function EventDetailsModal({ meta, onClose, onEdit, onDelete }) {
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  useEffect(() => { setConfirmDeleteOpen(false); }, [meta?.event?.id]);
  if (!meta) return null;
  const { patient, treatment, event, statusStyle, color } = meta;

  return (
    <>
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-card rounded-3xl w-[460px] max-h-[92vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="p-6 border-b" style={{ borderColor: 'var(--border-color)' }}>
          <div className="flex items-center justify-between mb-3">
            <span className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
            <button onClick={onClose} className="p-1 rounded-lg transition-[background-color] duration-200 hover:bg-black/5"><X size={18} style={{ color: 'var(--text-secondary)' }} /></button>
          </div>
          <h3 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>{patient?.name}</h3>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>{treatment?.name}</p>
        </div>

        <div className="p-6 space-y-4">
          <div className="flex items-center gap-2">
            <span className="px-3 py-1 rounded-lg text-xs font-medium" style={{ backgroundColor: `${statusStyle.color}14`, color: statusStyle.color }}>{statusStyle.label}</span>
          </div>
          <div className="space-y-3">
            <div className="flex items-center gap-3 text-sm" style={{ color: 'var(--text-primary)' }}>
              <Clock size={15} style={{ color: 'var(--text-secondary)' }} /> {event.start} – {event.end}
            </div>
            <div className="flex items-center gap-3 text-sm" style={{ color: 'var(--text-primary)' }}>
              <CalendarClock size={15} style={{ color: 'var(--text-secondary)' }} /> {new Date(event.date + 'T00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}
            </div>
            <div className="flex items-center gap-3 text-sm" style={{ color: 'var(--text-primary)' }}>
              <Phone size={15} style={{ color: 'var(--text-secondary)' }} /> {patient?.phone}
            </div>
            {event.notes && (
              <div className="flex items-start gap-3 text-sm pt-3 border-t" style={{ color: 'var(--text-primary)', borderColor: 'var(--border-color)' }}>
                <FileText size={15} className="mt-0.5 shrink-0" style={{ color: 'var(--text-secondary)' }} /> {event.notes}
              </div>
            )}
          </div>
        </div>

        <div className="flex gap-3 p-6 border-t" style={{ borderColor: 'var(--border-color)' }}>
          <button onClick={() => setConfirmDeleteOpen(true)} className="flex items-center gap-2 px-4 py-3 rounded-2xl text-sm font-medium border text-red-500 transition-[background-color] duration-200 hover:bg-red-500/10" style={{ borderColor: 'rgba(220, 38, 38, 0.35)' }}><Trash2 size={14} /> Excluir</button>
          <button onClick={onClose} className="flex-1 py-3 rounded-2xl text-sm font-medium border" style={{ borderColor: 'var(--border-color)', color: 'var(--text-secondary)' }}>Fechar</button>
          <button onClick={() => onEdit(event)} className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-semibold text-white" style={{ backgroundColor: 'var(--green-primary)' }}><Pencil size={14} /> Remarcar / Editar</button>
        </div>
      </div>
    </div>

    {confirmDeleteOpen && (
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50" onClick={() => setConfirmDeleteOpen(false)}>
        <div className="bg-card rounded-3xl p-8 w-[420px] shadow-2xl" onClick={e => e.stopPropagation()} style={{ borderTop: '3px solid #DC2626' }}>
          <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Excluir agendamento?</h3>
          <p className="text-sm mb-6" style={{ color: 'var(--text-secondary)' }}>
            Tem certeza que quer excluir o agendamento de <strong style={{ color: 'var(--text-primary)' }}>{patient?.name}</strong>? Essa ação não pode ser desfeita.
          </p>
          <div className="flex gap-3">
            <button onClick={() => setConfirmDeleteOpen(false)} className="flex-1 py-3 rounded-2xl text-sm font-medium border" style={{ borderColor: 'var(--border-color)', color: 'var(--text-secondary)' }}>
              Cancelar
            </button>
            <button
              onClick={() => { setConfirmDeleteOpen(false); onDelete(event.id); }}
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