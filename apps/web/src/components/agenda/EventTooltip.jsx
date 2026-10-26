import { Phone, Clock, Stethoscope, FileText, CheckCircle2, AlertCircle } from 'lucide-react';
import { STATUS_STYLES } from '@/lib/agendaUtils';

export default function EventTooltip({ meta, style }) {
  if (!meta) return null;
  const { patient, treatment, event, statusStyle } = meta;
  return (
    <div
      className="fixed z-[60] w-64 bg-card rounded-2xl border p-4 pointer-events-none animate-in fade-in"
      style={{ ...style, borderColor: 'var(--border-color)', boxShadow: '0 12px 28px rgba(0,0,0,.12)' }}
    >
      <div className="flex items-center gap-2 mb-3">
        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: statusStyle.color }} />
        <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{patient?.name}</span>
      </div>
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
          <Stethoscope size={12} /> {treatment?.name}
        </div>
        <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
          <Clock size={12} /> {event.start} – {event.end}
        </div>
        {patient?.phone && (
          <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
            <Phone size={12} /> {patient.phone}
          </div>
        )}
        <div className="flex items-center gap-2 text-xs">
          {event.status === 'confirmed' ? <CheckCircle2 size={12} style={{ color: statusStyle.color }} /> : <AlertCircle size={12} style={{ color: statusStyle.color }} />}
          <span style={{ color: statusStyle.color }}>{statusStyle.label}</span>
        </div>
        {event.notes && (
          <div className="flex items-start gap-2 text-xs pt-2 border-t" style={{ color: 'var(--text-secondary)', borderColor: 'var(--border-color)' }}>
            <FileText size={12} className="mt-0.5 shrink-0" /> <span>{event.notes}</span>
          </div>
        )}
      </div>
    </div>
  );
}