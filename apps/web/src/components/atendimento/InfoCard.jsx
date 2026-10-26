export default function InfoCard({ icon: Icon, label, color = 'var(--text-secondary)', children, empty = 'Nada registrado.' }) {
  return (
    <div className="bg-card rounded-2xl border p-4" style={{ borderColor: 'var(--border-color)', boxShadow: '0 2px 8px rgba(0,0,0,.04)' }}>
      <div className="flex items-center gap-2 mb-2.5">
        {Icon && <Icon size={14} style={{ color }} />}
        <p className="text-xs font-semibold tracking-wide" style={{ color: 'var(--text-secondary)' }}>{label}</p>
      </div>
      {children ? children : <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{empty}</p>}
    </div>
  );
}