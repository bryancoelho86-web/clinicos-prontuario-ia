import { Link } from 'react-router-dom';
import { Package, Settings, LogOut, X } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';

const itensMais = [
  { label: 'Estoque', icon: Package, path: '/estoque' },
  { label: 'Configurações', icon: Settings, path: '/configuracoes' },
];

export default function MaisSheet({ onClose }) {
  const { logout } = useAuth();

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full animate-sheet-slide-up rounded-t-3xl pb-8 pt-4"
        style={{ backgroundColor: 'var(--sidebar-bg)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-white/20" />
        <div className="flex items-center justify-between px-5 pb-2">
          <p className="text-sm font-semibold text-white">Mais opções</p>
          <button onClick={onClose} className="rounded-lg p-1.5 text-white/60 hover:bg-white/10 hover:text-white" aria-label="Fechar">
            <X size={18} />
          </button>
        </div>
        <div className="space-y-1 px-3">
          {itensMais.map(({ label, icon: Icon, path }) => (
            <Link
              key={path}
              to={path}
              onClick={onClose}
              className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium text-white/70 transition-colors duration-150 hover:bg-white/10 hover:text-white"
            >
              <Icon size={18} strokeWidth={1.8} />
              {label}
            </Link>
          ))}
          <button
            onClick={() => { onClose(); logout(); }}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-medium text-white/70 transition-colors duration-150 hover:bg-white/10 hover:text-white"
          >
            <LogOut size={18} strokeWidth={1.8} />
            Sair
          </button>
        </div>
      </div>
    </div>
  );
}
