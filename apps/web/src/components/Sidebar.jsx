import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Calendar, Users, FlaskConical, Package, Settings, LogOut,
  PanelLeftClose, PanelLeftOpen,
} from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';

const navItems = [
  { label: 'Dashboard', icon: LayoutDashboard, path: '/' },
  { label: 'Agenda', icon: Calendar, path: '/agenda' },
  { label: 'Pacientes', icon: Users, path: '/pacientes' },
  { label: 'Tratamentos', icon: FlaskConical, path: '/tratamentos' },
  { label: 'Estoque', icon: Package, path: '/estoque' },
];

function ItemNav({ to, icon: Icon, label, ativo, colapsada, onClick }) {
  return (
    <Link
      to={to}
      onClick={onClick}
      className={`group relative flex items-center gap-3 rounded-xl text-sm font-medium transition-all duration-150 ${
        colapsada ? 'justify-center px-2.5 py-2.5' : 'px-3 py-2.5'
      } ${ativo ? 'bg-white/15 text-white' : 'text-white/60 hover:text-white hover:bg-white/10'}`}
    >
      <Icon size={16} strokeWidth={1.8} className="shrink-0" />
      {!colapsada && label}
      {colapsada && (
        <span
          className="nav-tooltip pointer-events-none absolute left-full top-1/2 z-50 ml-2 -translate-x-1 -translate-y-1/2 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-xs font-medium text-white opacity-0 shadow-lg transition-all duration-150 [transition-timing-function:cubic-bezier(.16,1,.3,1)] group-hover:translate-x-0 group-hover:opacity-100 group-focus-visible:translate-x-0 group-focus-visible:opacity-100"
          style={{ backgroundColor: 'var(--sidebar-hover)' }}
        >
          {label}
        </span>
      )}
    </Link>
  );
}

export default function Sidebar({ colapsada, onAlternar }) {
  const location = useLocation();
  const { logout } = useAuth();

  const isActive = (path) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  return (
    <aside
      className={`relative flex h-full flex-shrink-0 flex-col transition-[width] duration-200 [transition-timing-function:cubic-bezier(.16,1,.3,1)] ${
        colapsada ? 'w-[72px]' : 'w-60'
      }`}
      style={{ backgroundColor: 'var(--sidebar-bg)' }}
    >
      {/* Logo + toggle */}
      <div className={`flex items-center border-b border-white/10 py-6 ${colapsada ? 'flex-col gap-3 px-4' : 'justify-between px-6'}`}>
        <img
          src={colapsada ? '/clinicos-icon.svg' : '/clinicos-logo.svg'}
          alt="Clínica Exemplo"
          className={`object-contain ${colapsada ? 'h-8 w-auto' : 'h-10 w-auto max-w-[150px]'}`}
        />
        <button
          onClick={onAlternar}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-white/50 transition-colors duration-150 hover:bg-white/10 hover:text-white"
          aria-label={colapsada ? 'Expandir menu' : 'Minimizar menu'}
        >
          {colapsada ? <PanelLeftOpen size={15} strokeWidth={1.8} /> : <PanelLeftClose size={15} strokeWidth={1.8} />}
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-1 px-3 py-4">
        {navItems.map(({ label, icon, path }) => (
          <ItemNav key={path} to={path} icon={icon} label={label} ativo={isActive(path)} colapsada={colapsada} />
        ))}
      </nav>

      {/* Footer */}
      <div className="space-y-3 border-t border-white/10 px-3 py-5">
        <ItemNav to="/configuracoes" icon={Settings} label="Configurações" ativo={isActive('/configuracoes')} colapsada={colapsada} />
        <button
          onClick={logout}
          className={`group relative flex w-full items-center gap-3 rounded-xl text-sm font-medium text-white/60 transition-all duration-150 hover:bg-white/10 hover:text-white ${
            colapsada ? 'justify-center px-2.5 py-2.5' : 'px-3 py-2.5 text-left'
          }`}
        >
          <LogOut size={16} strokeWidth={1.8} className="shrink-0" />
          {!colapsada && 'Sair'}
          {colapsada && (
            <span
              className="nav-tooltip pointer-events-none absolute left-full top-1/2 z-50 ml-2 -translate-x-1 -translate-y-1/2 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-xs font-medium text-white opacity-0 shadow-lg transition-all duration-150 [transition-timing-function:cubic-bezier(.16,1,.3,1)] group-hover:translate-x-0 group-hover:opacity-100 group-focus-visible:translate-x-0 group-focus-visible:opacity-100"
              style={{ backgroundColor: 'var(--sidebar-hover)' }}
            >
              Sair
            </span>
          )}
        </button>
        {!colapsada && (
          <div className="px-3 pt-1">
            <p className="text-xs font-semibold text-white">ClinicOS</p>
            <p className="text-xs text-white/40">Clínica Exemplo</p>
          </div>
        )}
      </div>
    </aside>
  );
}
