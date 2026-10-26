import { useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import { useResponsiveNav } from '@/hooks/useResponsiveNav';
import Sidebar from '@/components/Sidebar';
import BarraNavegacaoMobile from '@/components/BarraNavegacaoMobile';
import MaisSheet from '@/components/MaisSheet';

export default function Layout() {
  const { modo, colapsada, alternarColapso } = useResponsiveNav();
  const [maisAberto, setMaisAberto] = useState(false);

  // Sem isso, o sheet "Mais" reabre sozinho ao voltar pro modo mobile
  // (ex: rotação de tela portrait→landscape→portrait) — o estado
  // sobrevivia à desmontagem do fragmento mobile.
  useEffect(() => { if (modo !== 'mobile') setMaisAberto(false); }, [modo]);

  return (
    <div className="flex h-screen overflow-hidden" style={{ backgroundColor: 'var(--bg-main)' }}>
      {modo !== 'mobile' && <Sidebar colapsada={colapsada} onAlternar={alternarColapso} />}

      <main className={`flex-1 overflow-auto ${modo === 'mobile' ? 'pb-16' : ''}`}>
        <Outlet />
      </main>

      {modo === 'mobile' && (
        <>
          <BarraNavegacaoMobile onAbrirMais={() => setMaisAberto(true)} />
          {maisAberto && <MaisSheet onClose={() => setMaisAberto(false)} />}
        </>
      )}
    </div>
  );
}
