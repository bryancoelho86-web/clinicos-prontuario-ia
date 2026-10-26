import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Calendar, Users, FlaskConical, Ellipsis } from 'lucide-react';

const itensBarra = [
  { label: 'Dashboard', icon: LayoutDashboard, path: '/' },
  { label: 'Agenda', icon: Calendar, path: '/agenda' },
  { label: 'Pacientes', icon: Users, path: '/pacientes' },
  { label: 'Tratamentos', icon: FlaskConical, path: '/tratamentos' },
  { label: 'Mais', icon: Ellipsis, path: null },
];

const INDICE_MAIS = itensBarra.length - 1;

export default function BarraNavegacaoMobile({ onAbrirMais }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [indicador, setIndicador] = useState({ largura: 0, esquerda: 0 });
  const [indiceAnimando, setIndiceAnimando] = useState(null);
  const textRefs = useRef([]);
  const itemRefs = useRef([]);

  const indiceAtivo = useMemo(() => {
    const idxDireto = itensBarra.findIndex(
      ({ path }) => path && (path === '/' ? location.pathname === '/' : location.pathname.startsWith(path))
    );
    if (idxDireto !== -1) return idxDireto;
    if (location.pathname.startsWith('/estoque') || location.pathname.startsWith('/configuracoes')) return INDICE_MAIS;
    return -1;
  }, [location.pathname]);

  useEffect(() => {
    const medir = () => {
      if (indiceAtivo === -1) { setIndicador({ largura: 0, esquerda: 0 }); return; }
      const itemEl = itemRefs.current[indiceAtivo];
      const textoEl = textRefs.current[indiceAtivo];
      if (!itemEl || !textoEl) return;
      const larguraTexto = textoEl.offsetWidth;
      const esquerda = itemEl.offsetLeft + (itemEl.offsetWidth - larguraTexto) / 2;
      setIndicador({ largura: larguraTexto, esquerda });
    };
    medir();
    window.addEventListener('resize', medir);
    return () => window.removeEventListener('resize', medir);
  }, [indiceAtivo]);

  const handleClick = (index, path) => {
    setIndiceAnimando(index);
    setTimeout(() => setIndiceAnimando((atual) => (atual === index ? null : atual)), 400);
    if (path) navigate(path);
    else onAbrirMais();
  };

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 flex border-t border-white/10"
      style={{ backgroundColor: 'var(--sidebar-bg)' }}
      aria-label="Navegação principal"
    >
      {itensBarra.map(({ label, icon: Icon, path }, index) => {
        const ativo = index === indiceAtivo;
        return (
          <button
            key={label}
            ref={(el) => (itemRefs.current[index] = el)}
            onClick={() => handleClick(index, path)}
            className="relative flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-medium"
          >
            <Icon
              size={20}
              strokeWidth={1.8}
              className={indiceAnimando === index ? 'animate-icon-bounce' : ''}
              style={{ color: ativo ? 'var(--gold)' : 'rgba(255,255,255,0.55)' }}
            />
            <strong
              ref={(el) => (textRefs.current[index] = el)}
              className="font-medium not-italic"
              style={{ color: ativo ? 'var(--gold)' : 'rgba(255,255,255,0.55)' }}
            >
              {label}
            </strong>
          </button>
        );
      })}
      <span
        className="nav-indicador pointer-events-none absolute bottom-1 h-[2px] rounded-full"
        style={{ backgroundColor: 'var(--gold)', width: `${indicador.largura}px`, transform: `translateX(${indicador.esquerda}px)` }}
      />
    </nav>
  );
}
