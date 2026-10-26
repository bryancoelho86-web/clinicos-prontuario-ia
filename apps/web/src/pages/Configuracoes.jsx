import { useState } from 'react';
import { User, Lock, Sun, Moon, Check } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabaseClient';
import { getStoredTheme, setStoredTheme } from '@/lib/theme';
import { toast } from '@/components/ui/use-toast';

export default function Configuracoes() {
  const { user } = useAuth();

  const [pwForm, setPwForm] = useState({ next: '', confirm: '' });
  const [savingPassword, setSavingPassword] = useState(false);

  const [theme, setTheme] = useState(getStoredTheme());

  const handleChangePassword = async () => {
    if (pwForm.next.length < 6) {
      toast({ title: 'Senha muito curta', description: 'Use pelo menos 6 caracteres.', variant: 'destructive' });
      return;
    }
    if (pwForm.next !== pwForm.confirm) {
      toast({ title: 'As senhas não coincidem', variant: 'destructive' });
      return;
    }
    setSavingPassword(true);
    const { error } = await supabase.auth.updateUser({ password: pwForm.next });
    setSavingPassword(false);
    if (error) {
      toast({ title: 'Erro ao trocar senha', description: error.message, variant: 'destructive' });
    } else {
      setPwForm({ next: '', confirm: '' });
      toast({ title: 'Senha alterada' });
    }
  };

  const handleSetTheme = (value) => {
    setTheme(value);
    setStoredTheme(value);
  };

  return (
    <div className="min-h-full p-4 sm:p-6 lg:p-8 max-w-2xl relative overflow-hidden page-paper-bg">
      <div className="mb-8 animate-fade-in-up">
        <p
          className="text-[11px] font-medium uppercase mb-1"
          style={{ fontFamily: "'IBM Plex Mono', monospace", letterSpacing: '.14em', color: 'var(--text-secondary)' }}
        >
          Preferências
        </p>
        <h1
          className="text-[26px] inline-block pb-1"
          style={{ fontFamily: "'Newsreader', serif", fontStyle: 'italic', fontWeight: 500, color: 'var(--heading-accent)', borderBottom: '1px solid var(--gold)' }}
        >
          Configurações
        </h1>
        <p className="text-sm mt-2" style={{ color: 'var(--text-secondary)' }}>Personalize o sistema conforme sua preferência.</p>
      </div>

      <div className="space-y-4 animate-fade-in-up" style={{ animationDelay: '60ms' }}>
        {/* Profile */}
        <div className="bg-card rounded-2xl p-6" style={{ borderTop: '3px solid var(--gold)', boxShadow: '0 8px 20px rgba(0,0,0,.05)' }}>
          <div className="flex items-center gap-3 mb-5">
            <div className="p-2.5 rounded-xl" style={{ backgroundColor: 'var(--bg-tag)' }}>
              <User size={16} style={{ color: 'var(--heading-accent)' }} />
            </div>
            <h2 className="font-semibold" style={{ color: 'var(--text-primary)' }}>Perfil</h2>
          </div>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium block mb-1.5" style={{ color: 'var(--text-secondary)' }}>E-mail</label>
              <input
                value={user?.email || ''}
                disabled
                className="w-full px-4 py-3 rounded-xl border text-sm outline-none opacity-60 cursor-not-allowed"
                style={{ borderColor: 'var(--border-color)', backgroundColor: 'rgb(var(--card))', color: 'var(--text-primary)' }}
              />
            </div>
          </div>
        </div>

        {/* Password */}
        <div className="bg-card rounded-2xl p-6" style={{ borderTop: '3px solid var(--gold)', boxShadow: '0 8px 20px rgba(0,0,0,.05)' }}>
          <div className="flex items-center gap-3 mb-5">
            <div className="p-2.5 rounded-xl" style={{ backgroundColor: 'var(--bg-tag)' }}>
              <Lock size={16} style={{ color: 'var(--heading-accent)' }} />
            </div>
            <h2 className="font-semibold" style={{ color: 'var(--text-primary)' }}>Segurança</h2>
          </div>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium block mb-1.5" style={{ color: 'var(--text-secondary)' }}>Nova senha</label>
              <input type="password" value={pwForm.next} onChange={(e) => setPwForm((f) => ({ ...f, next: e.target.value }))}
                className="w-full px-4 py-3 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--border-color)', backgroundColor: 'rgb(var(--card))', color: 'var(--text-primary)' }} placeholder="••••••••" />
            </div>
            <div>
              <label className="text-xs font-medium block mb-1.5" style={{ color: 'var(--text-secondary)' }}>Confirmar nova senha</label>
              <input type="password" value={pwForm.confirm} onChange={(e) => setPwForm((f) => ({ ...f, confirm: e.target.value }))}
                className="w-full px-4 py-3 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--border-color)', backgroundColor: 'rgb(var(--card))', color: 'var(--text-primary)' }} placeholder="••••••••" />
            </div>
            <button onClick={handleChangePassword} disabled={savingPassword || !pwForm.next} className="px-4 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50 transition-[transform,box-shadow] duration-200 hover:shadow-lg hover:-translate-y-0.5" style={{ backgroundColor: 'var(--green-primary)' }}>
              {savingPassword ? 'Alterando...' : 'Alterar senha'}
            </button>
          </div>
        </div>

        {/* Appearance */}
        <div className="bg-card rounded-2xl p-6" style={{ borderTop: '3px solid var(--gold)', boxShadow: '0 8px 20px rgba(0,0,0,.05)' }}>
          <div className="flex items-center gap-3 mb-5">
            <div className="p-2.5 rounded-xl" style={{ backgroundColor: 'var(--bg-tag)' }}>
              <Sun size={16} style={{ color: 'var(--heading-accent)' }} />
            </div>
            <h2 className="font-semibold" style={{ color: 'var(--text-primary)' }}>Aparência</h2>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => handleSetTheme('light')}
              className="flex-1 flex flex-col items-center gap-2 p-4 rounded-xl border transition-[border-color,background-color] duration-200"
              style={theme === 'light' ? { borderColor: 'var(--heading-accent)', backgroundColor: 'var(--bg-tag)' } : { borderColor: 'var(--border-color)' }}
            >
              <Sun size={20} style={{ color: theme === 'light' ? 'var(--heading-accent)' : 'var(--text-secondary)' }} />
              <span className="text-sm font-medium" style={{ color: theme === 'light' ? 'var(--heading-accent)' : 'var(--text-secondary)' }}>Claro</span>
            </button>
            <button
              onClick={() => handleSetTheme('dark')}
              className="flex-1 flex flex-col items-center gap-2 p-4 rounded-xl border transition-[border-color,background-color] duration-200"
              style={theme === 'dark' ? { borderColor: 'var(--heading-accent)', backgroundColor: 'var(--bg-tag)' } : { borderColor: 'var(--border-color)' }}
            >
              <Moon size={20} style={{ color: theme === 'dark' ? 'var(--heading-accent)' : 'var(--text-secondary)' }} />
              <span className="text-sm font-medium" style={{ color: theme === 'dark' ? 'var(--heading-accent)' : 'var(--text-secondary)' }}>Escuro</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
