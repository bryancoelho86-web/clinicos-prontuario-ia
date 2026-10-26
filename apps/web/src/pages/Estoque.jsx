import { useState, useEffect } from 'react';
import { Plus, Pencil, SquarePen, Check, X, AlertTriangle, Trash2, Power, FileText } from 'lucide-react';
import {
  useMateriaisComEstoque,
  useCreateMaterial,
  useEditarItemEstoque,
  useEntradaEstoque,
  useAjustarEstoque,
  useExcluirMaterial,
  useToggleMaterialAtivo,
  useMovimentacoesEstoqueEntrada,
} from '@/hooks/useMateriais';
import { toast } from '@/components/ui/use-toast';
import DatePicker from '@/components/DatePicker';

const EMPTY_NEW_FORM = { nome: '', qty: '', min: '', unit: 'un', preco_unitario: '' };
const EMPTY_ENTRY_FORM = { materialId: '', qty: '', valor: '', motivo: 'Compra / reposição' };

function moeda(v) {
  return Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function startOfDay(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function startOfWeek(d) { const x = startOfDay(d); x.setDate(x.getDate() - x.getDay()); return x; }
function startOfMonth(d) { const x = startOfDay(d); x.setDate(1); return x; }
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }

export default function Estoque() {
  const { data: materiais = [], error: materiaisError } = useMateriaisComEstoque();
  const createMaterial = useCreateMaterial();
  const editarItem = useEditarItemEstoque();
  const entradaEstoque = useEntradaEstoque();
  const ajustarEstoque = useAjustarEstoque();
  const excluirMaterial = useExcluirMaterial();
  const toggleAtivo = useToggleMaterialAtivo();

  const [view, setView] = useState('itens');
  const [editingId, setEditingId] = useState(null);
  const [editQty, setEditQty] = useState('');
  const [modal, setModal] = useState(false);
  const [entryModal, setEntryModal] = useState(false);
  const [form, setForm] = useState(EMPTY_NEW_FORM);
  const [entryForm, setEntryForm] = useState(EMPTY_ENTRY_FORM);
  const [valorEntradaManual, setValorEntradaManual] = useState(false);
  const [materialParaExcluir, setMaterialParaExcluir] = useState(null);
  const [itemParaEditar, setItemParaEditar] = useState(null);

  useEffect(() => {
    if (materiaisError) {
      toast({ title: 'Erro ao carregar itens de estoque', description: materiaisError.message, variant: 'destructive' });
    }
  }, [materiaisError]);

  // "Excluir" tenta apagar de vez; se o item já tem histórico vinculado
  // (movimentação de estoque, uso em procedimento/atendimento), a RPC
  // bloqueia com um erro de texto conhecido — nesse caso, ao invés de só
  // mostrar o erro, desativa o item (preserva o histórico, some da lista
  // de uso diário, pode reativar depois). Mesmo padrão de "Tratamentos".
  const TEM_HISTORICO = [
    'está vinculado a um ou mais procedimentos',
    'já foi usado em atendimentos realizados',
    'já tem movimentações de estoque registradas',
  ];

  const handleExcluir = () => {
    excluirMaterial.mutate({ id: materialParaExcluir.id }, {
      onSuccess: () => {
        toast({ title: 'Item excluído definitivamente.' });
        setMaterialParaExcluir(null);
      },
      onError: (error) => {
        const temHistorico = TEM_HISTORICO.some(trecho => error?.message?.includes(trecho));
        if (!temHistorico) {
          toast({ title: 'Erro ao excluir item', description: error?.message, variant: 'destructive' });
          return;
        }
        toggleAtivo.mutate({ id: materialParaExcluir.id, ativo: false }, {
          onSuccess: () => {
            toast({
              title: 'Item desativado',
              description: 'Esse item tem histórico de estoque vinculado, então foi desativado em vez de excluído — o histórico continua preservado e dá pra reativar quando quiser.',
            });
            setMaterialParaExcluir(null);
          },
          onError: (err2) => toast({ title: 'Erro ao desativar item', description: err2?.message, variant: 'destructive' }),
        });
      },
    });
  };

  const handleReativar = (item) => {
    toggleAtivo.mutate({ id: item.id, ativo: true }, {
      onSuccess: () => toast({ title: 'Item reativado' }),
      onError: (error) => toast({ title: 'Erro ao reativar item', description: error?.message, variant: 'destructive' }),
    });
  };

  const startEdit = (item) => {
    setEditingId(item.id);
    setEditQty(String(item.estoque?.quantidade_atual ?? 0));
  };

  const saveEdit = (item) => {
    const quantidadeAtual = item.estoque?.quantidade_atual ?? 0;
    if (Number(editQty) === quantidadeAtual) {
      setEditingId(null);
      return;
    }
    if (Number(editQty) < 0) {
      toast({ title: 'Quantidade não pode ser negativa.', variant: 'destructive' });
      return;
    }
    ajustarEstoque.mutate({
      materialId: item.id,
      quantidadeContada: Number(editQty),
      motivo: 'Ajuste manual (tela de Estoque)',
    }, {
      onSuccess: () => setEditingId(null),
      onError: (error) => toast({ title: 'Erro ao ajustar estoque', description: error?.message, variant: 'destructive' }),
    });
  };

  const precoValido = Number(form.preco_unitario) > 0;

  const handleAdd = () => {
    if (!form.nome.trim() || !precoValido) return;
    createMaterial.mutate({ nome: form.nome.trim(), unidade_medida: form.unit.trim() || 'un' }, {
      onSuccess: async (material) => {
        const qty = Number(form.qty) || 0;
        const min = Number(form.min) || 0;
        try {
          await editarItem.mutateAsync({
            materialId: material.id,
            quantidade_minima: min > 0 ? min : undefined,
            preco_unitario: Number(form.preco_unitario),
          });
          if (qty > 0) await entradaEstoque.mutateAsync({ materialId: material.id, quantidade: qty, motivo: 'Estoque inicial' });
        } catch (error) {
          toast({ title: 'Item criado, mas houve um erro ao definir os dados iniciais', description: error?.message, variant: 'destructive' });
        }
        setModal(false);
        setForm(EMPTY_NEW_FORM);
      },
      onError: (error) => toast({ title: 'Erro ao criar item', description: error?.message, variant: 'destructive' }),
    });
  };

  // Item selecionado na "Entrada de Estoque" — usado pra sugerir o valor
  // gasto (preço unitário × quantidade), mesmo cálculo que qualquer extrato
  // real faz. Enquanto o Dr. não editar o campo "Valor gasto" na mão
  // (valorEntradaManual), ele recalcula sozinho a cada troca de item/
  // quantidade; assim que ele digita algo ali direto, a sugestão para de
  // sobrescrever (pode ter sido promoção, desconto etc — o valor final é
  // sempre o que ficar no campo, nunca forçado).
  const materialEntradaSelecionado = materiais.find(m => m.id === entryForm.materialId);
  const precoUnitarioEntrada = materialEntradaSelecionado?.estoque?.preco_unitario ?? null;

  useEffect(() => {
    if (!entryModal || valorEntradaManual) return;
    const qty = Number(entryForm.qty);
    if (precoUnitarioEntrada != null && qty > 0) {
      setEntryForm((f) => ({ ...f, valor: (Number(precoUnitarioEntrada) * qty).toFixed(2) }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entryForm.materialId, entryForm.qty, precoUnitarioEntrada, entryModal, valorEntradaManual]);

  const handleEntry = () => {
    if (!entryForm.materialId || !entryForm.qty || !entryForm.motivo.trim()) return;
    if (Number(entryForm.qty) <= 0) {
      toast({ title: 'Quantidade deve ser maior que zero.', variant: 'destructive' });
      return;
    }
    entradaEstoque.mutate({
      materialId: entryForm.materialId,
      quantidade: Number(entryForm.qty),
      motivo: entryForm.motivo.trim(),
      valorGasto: entryForm.valor === '' ? null : Number(entryForm.valor),
    }, {
      onSuccess: () => {
        setEntryModal(false);
        setEntryForm(EMPTY_ENTRY_FORM);
        setValorEntradaManual(false);
      },
      onError: (error) => toast({ title: 'Erro ao registrar entrada', description: error?.message, variant: 'destructive' }),
    });
  };

  const getLevel = (item) => {
    const qty = item.estoque?.quantidade_atual ?? 0;
    const min = item.estoque?.quantidade_minima ?? 0;
    if (min <= 0) return 'ok';
    const ratio = qty / min;
    if (ratio <= 1) return 'critical';
    if (ratio <= 1.5) return 'low';
    return 'ok';
  };

  const critical = materiais.filter(m => m.ativo && getLevel(m) === 'critical');

  const levelColors = {
    critical: { bar: '#EF4444', text: 'text-red-500', bg: 'rgba(239, 68, 68, 0.10)' },
    low: { bar: '#F59E0B', text: 'text-amber-500', bg: 'rgba(245, 158, 11, 0.10)' },
    ok: { bar: '#1A4633', text: '', bg: 'rgb(var(--card))' },
  };

  return (
    <div className="min-h-full p-4 sm:p-6 lg:p-8 relative overflow-hidden page-paper-bg">
      <div className="flex items-center justify-between mb-8 animate-fade-in-up">
        <div>
          <p
            className="text-[11px] font-medium uppercase mb-1"
            style={{ fontFamily: "'IBM Plex Mono', monospace", letterSpacing: '.14em', color: 'var(--text-secondary)' }}
          >
            {materiais.length} itens cadastrados
          </p>
          <h1
            className="text-[26px] inline-block pb-1"
            style={{ fontFamily: "'Newsreader', serif", fontStyle: 'italic', fontWeight: 500, color: 'var(--heading-accent)', borderBottom: '1px solid var(--gold)' }}
          >
            Estoque
          </h1>
        </div>
        <div className="flex gap-3">
          <button onClick={() => { setEntryModal(true); setValorEntradaManual(false); }} className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border transition-[background-color] duration-200 hover:bg-card" style={{ borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}>
            <Plus size={15} /> Entrada de Estoque
          </button>
          <button onClick={() => setModal(true)} className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-white transition-[transform,box-shadow] duration-200 hover:shadow-lg hover:-translate-y-0.5" style={{ backgroundColor: 'var(--green-primary)' }}>
            <Plus size={15} /> Novo Item
          </button>
        </div>
      </div>

      {/* View switcher */}
      <div className="flex gap-1 p-1 rounded-xl mb-6 w-fit" style={{ backgroundColor: 'var(--bg-tag)' }}>
        {[{ key: 'itens', label: 'Itens' }, { key: 'extrato', label: 'Extrato' }].map(v => (
          <button
            key={v.key}
            onClick={() => setView(v.key)}
            className="px-3 py-1.5 rounded-lg text-sm font-medium transition-[background-color,box-shadow] duration-200"
            style={view === v.key ? { backgroundColor: 'rgb(var(--card))', color: 'var(--text-primary)', boxShadow: '0 1px 3px rgba(0,0,0,.08)' } : { color: 'var(--text-secondary)' }}
          >
            {v.label}
          </button>
        ))}
      </div>

      {view === 'extrato' && <ExtratoTab materiais={materiais} />}

      {view === 'itens' && (
        <>
      {/* Critical alert */}
      {critical.length > 0 && (
        <div className="rounded-2xl p-4 mb-6 flex items-start gap-3 border animate-fade-in-up" style={{ backgroundColor: 'rgba(245, 158, 11, 0.10)', borderColor: 'rgba(245, 158, 11, 0.35)' }}>
          <AlertTriangle size={18} className="text-amber-500 shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="text-sm font-semibold mb-2.5" style={{ color: 'var(--text-primary)' }}>
              {critical.length} {critical.length === 1 ? 'item está' : 'itens estão'} abaixo do mínimo
            </p>
            <div className="flex flex-wrap gap-1.5">
              {critical.map(c => (
                <span
                  key={c.id}
                  className="px-2.5 py-1 rounded-lg text-xs font-medium"
                  style={{ backgroundColor: 'rgba(220,38,38,.12)', color: '#DC2626' }}
                >
                  {c.nome} · {c.estoque?.quantidade_atual ?? 0}/{c.estoque?.quantidade_minima ?? 0}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Stock list */}
      <div className="space-y-3 animate-fade-in-up" style={{ animationDelay: '60ms' }}>
        {materiais.map(item => {
          const qty = item.estoque?.quantidade_atual ?? 0;
          const min = item.estoque?.quantidade_minima ?? 0;
          const level = getLevel(item);
          const colors = levelColors[level];
          const barWidth = min > 0 ? Math.min(100, Math.round((qty / (min * 3)) * 100)) : 100;

          return (
            <div key={item.id} className="group rounded-2xl border p-5 flex items-center justify-between" style={{ backgroundColor: colors.bg, borderColor: 'var(--border-color)', boxShadow: '0 2px 8px rgba(0,0,0,.04)', opacity: item.ativo ? 1 : 0.55 }}>
              <div className="flex items-center gap-4 flex-1 min-w-0">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{item.nome}</p>
                    {!item.ativo && (
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-medium uppercase tracking-wide shrink-0" style={{ backgroundColor: 'var(--bg-tag)', color: 'var(--text-secondary)' }}>Inativo</span>
                    )}
                  </div>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                    Mínimo: {min} {item.unidade_medida}
                    {item.estoque?.preco_unitario != null && <> · {moeda(item.estoque.preco_unitario)}/{item.unidade_medida}</>}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-6 shrink-0">
                <div className="w-32">
                  <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--bg-tag)' }}>
                    <div className="h-1.5 rounded-full transition-[width] duration-300" style={{ width: `${barWidth}%`, backgroundColor: colors.bar }} />
                  </div>
                </div>

                {editingId === item.id ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={editQty}
                      onChange={e => setEditQty(e.target.value)}
                      className="w-20 px-3 py-1.5 rounded-lg border text-sm outline-none text-center"
                      style={{ borderColor: 'var(--border-color)', backgroundColor: 'rgb(var(--card))' }}
                    />
                    <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{item.unidade_medida}</span>
                    <button onClick={() => saveEdit(item)} disabled={ajustarEstoque.isPending} className="p-1.5 rounded-lg text-white disabled:opacity-50" style={{ backgroundColor: 'var(--green-primary)' }}>
                      <Check size={13} />
                    </button>
                    <button onClick={() => setEditingId(null)} className="p-1.5 rounded-lg border" style={{ borderColor: 'var(--border-color)' }}>
                      <X size={13} style={{ color: 'var(--text-secondary)' }} />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <span className={`text-sm font-semibold ${colors.text}`} style={level === 'ok' ? { color: 'var(--text-primary)' } : {}}>
                      {qty} <span className="font-normal text-xs" style={{ color: 'var(--text-secondary)' }}>{item.unidade_medida}</span>
                    </span>
                    <button onClick={() => setItemParaEditar(item)} title="Editar item (nome, mínimo, preço)" className="p-2 rounded-xl border hover:bg-card transition-colors" style={{ borderColor: 'var(--border-color)' }}>
                      <SquarePen size={13} style={{ color: 'var(--text-secondary)' }} />
                    </button>
                    <button onClick={() => startEdit(item)} title="Ajustar por contagem física" className="p-2 rounded-xl border hover:bg-card transition-colors" style={{ borderColor: 'var(--border-color)' }}>
                      <Pencil size={13} style={{ color: 'var(--text-secondary)' }} />
                    </button>
                    {item.ativo ? (
                      <button
                        onClick={() => setMaterialParaExcluir(item)}
                        title="Excluir item"
                        className="p-2 rounded-xl border hover:bg-card transition-colors"
                        style={{ borderColor: 'var(--border-color)' }}
                      >
                        <Trash2 size={13} style={{ color: '#DC2626' }} />
                      </button>
                    ) : (
                      <button
                        onClick={() => handleReativar(item)}
                        disabled={toggleAtivo.isPending}
                        title="Reativar item"
                        className="p-2 rounded-xl border hover:bg-card transition-colors disabled:opacity-50"
                        style={{ borderColor: 'var(--border-color)' }}
                      >
                        <Power size={13} style={{ color: 'var(--heading-accent)' }} />
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
        </>
      )}

      {/* Modal Novo Item */}
      {modal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50" onClick={() => setModal(false)}>
          <div className="bg-card rounded-3xl p-8 w-[440px] shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>Novo item de estoque</h3>
              <button onClick={() => setModal(false)} className="p-1 rounded-lg transition-[background-color] duration-200 hover:bg-black/5"><X size={18} style={{ color: 'var(--text-secondary)' }} /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium block mb-1.5" style={{ color: 'var(--text-secondary)' }}>Nome do item</label>
                <input value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))}
                  className="w-full px-4 py-3 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--border-color)', backgroundColor: 'rgb(var(--card))' }} placeholder="Ex: Agulhas" />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-medium block mb-1.5" style={{ color: 'var(--text-secondary)' }}>Quantidade</label>
                  <input type="number" value={form.qty} onChange={e => setForm(f => ({ ...f, qty: e.target.value }))}
                    className="w-full px-4 py-3 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--border-color)', backgroundColor: 'rgb(var(--card))' }} placeholder="0" />
                </div>
                <div>
                  <label className="text-xs font-medium block mb-1.5" style={{ color: 'var(--text-secondary)' }}>Mínimo</label>
                  <input type="number" value={form.min} onChange={e => setForm(f => ({ ...f, min: e.target.value }))}
                    className="w-full px-4 py-3 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--border-color)', backgroundColor: 'rgb(var(--card))' }} placeholder="0" />
                </div>
                <div>
                  <label className="text-xs font-medium block mb-1.5" style={{ color: 'var(--text-secondary)' }}>Unidade</label>
                  <input value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))}
                    className="w-full px-4 py-3 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--border-color)', backgroundColor: 'rgb(var(--card))' }} placeholder="un" />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium block mb-1.5" style={{ color: 'var(--text-secondary)' }}>Preço unitário (R$)</label>
                <input type="number" min={0.01} step="0.01" value={form.preco_unitario} onChange={e => setForm(f => ({ ...f, preco_unitario: e.target.value }))}
                  className="w-full px-4 py-3 rounded-xl border text-sm outline-none" style={{ borderColor: form.preco_unitario !== '' && !precoValido ? '#DC2626' : 'var(--border-color)', backgroundColor: 'rgb(var(--card))' }} placeholder="0,00" />
                {form.preco_unitario !== '' && !precoValido && (
                  <p className="text-xs mt-1" style={{ color: '#DC2626' }}>Preço deve ser maior que zero.</p>
                )}
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setModal(false)} className="flex-1 py-3 rounded-2xl text-sm font-medium border" style={{ borderColor: 'var(--border-color)', color: 'var(--text-secondary)' }}>Cancelar</button>
              <button onClick={handleAdd} disabled={createMaterial.isPending || !form.nome.trim() || !precoValido} className="flex-1 py-3 rounded-2xl text-sm font-semibold text-white disabled:opacity-50" style={{ backgroundColor: 'var(--green-primary)' }}>
                {createMaterial.isPending ? 'Adicionando...' : 'Adicionar item'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Entry Modal */}
      {entryModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50" onClick={() => setEntryModal(false)}>
          <div className="bg-card rounded-3xl p-8 w-[440px] shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>Entrada de estoque</h3>
              <button onClick={() => setEntryModal(false)} className="p-1 rounded-lg transition-[background-color] duration-200 hover:bg-black/5"><X size={18} style={{ color: 'var(--text-secondary)' }} /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium block mb-1.5" style={{ color: 'var(--text-secondary)' }}>Item</label>
                <select value={entryForm.materialId} onChange={e => { setEntryForm(f => ({ ...f, materialId: e.target.value })); setValorEntradaManual(false); }}
                  className="w-full px-4 py-3 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--border-color)', backgroundColor: 'rgb(var(--card))' }}>
                  <option value="">Selecione um item...</option>
                  {materiais.filter(m => m.ativo).map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}
                </select>
                {entryForm.materialId && (
                  <p className="text-xs mt-1.5" style={{ color: 'var(--text-secondary)' }}>
                    {precoUnitarioEntrada != null
                      ? `Preço unitário cadastrado: ${moeda(precoUnitarioEntrada)}`
                      : 'Esse item ainda não tem preço unitário cadastrado — edite o item pra registrar.'}
                  </p>
                )}
              </div>
              <div>
                <label className="text-xs font-medium block mb-1.5" style={{ color: 'var(--text-secondary)' }}>Quantidade a adicionar</label>
                <input type="number" min={1} step="1" value={entryForm.qty} onChange={e => setEntryForm(f => ({ ...f, qty: e.target.value }))}
                  className="w-full px-4 py-3 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--border-color)', backgroundColor: 'rgb(var(--card))' }} placeholder="0" />
              </div>
              <div>
                <label className="text-xs font-medium block mb-1.5" style={{ color: 'var(--text-secondary)' }}>Valor gasto (R$) — opcional</label>
                <input type="number" min={0} step="0.01" value={entryForm.valor} onChange={e => { setEntryForm(f => ({ ...f, valor: e.target.value })); setValorEntradaManual(true); }}
                  className="w-full px-4 py-3 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--border-color)', backgroundColor: 'rgb(var(--card))' }} placeholder="0,00" />
                {entryForm.materialId && (
                  <p className="text-xs mt-1.5" style={{ color: 'var(--text-secondary)' }}>
                    {precoUnitarioEntrada != null
                      ? 'Calculado automaticamente (preço unitário × quantidade) — edite se o valor pago foi diferente.'
                      : 'Sem preço unitário cadastrado, preencha o valor total pago manualmente.'}
                  </p>
                )}
              </div>
              <div>
                <label className="text-xs font-medium block mb-1.5" style={{ color: 'var(--text-secondary)' }}>Motivo</label>
                <input value={entryForm.motivo} onChange={e => setEntryForm(f => ({ ...f, motivo: e.target.value }))}
                  className="w-full px-4 py-3 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--border-color)', backgroundColor: 'rgb(var(--card))' }} placeholder="Ex: Compra / reposição" />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setEntryModal(false)} className="flex-1 py-3 rounded-2xl text-sm font-medium border" style={{ borderColor: 'var(--border-color)', color: 'var(--text-secondary)' }}>Cancelar</button>
              <button onClick={handleEntry} disabled={entradaEstoque.isPending} className="flex-1 py-3 rounded-2xl text-sm font-semibold text-white disabled:opacity-50" style={{ backgroundColor: 'var(--green-primary)' }}>
                {entradaEstoque.isPending ? 'Confirmando...' : 'Confirmar entrada'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Excluir Item */}
      {materialParaExcluir && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50" onClick={() => setMaterialParaExcluir(null)}>
          <div className="bg-card rounded-3xl p-8 w-[440px] shadow-2xl" onClick={(e) => e.stopPropagation()} style={{ borderTop: '3px solid #DC2626' }}>
            <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Remover "{materialParaExcluir.nome}"?</h3>
            <p className="text-sm mb-3" style={{ color: 'var(--text-secondary)' }}>
              Se esse item <strong style={{ color: 'var(--text-primary)' }}>nunca teve</strong> entrada, ajuste ou uso em algum procedimento, ele será <strong style={{ color: 'var(--text-primary)' }}>excluído definitivamente</strong> — não dá pra desfazer.
            </p>
            <p className="text-sm mb-6" style={{ color: 'var(--text-secondary)' }}>
              Se já <strong style={{ color: 'var(--text-primary)' }}>tiver histórico</strong> de movimentação de estoque, ele será <strong style={{ color: 'var(--text-primary)' }}>desativado</strong> em vez de excluído — some da lista de uso do dia a dia, mas o histórico fica preservado e dá pra reativar depois (ícone de energia no lugar da lixeira).
            </p>
            <div className="flex gap-3">
              <button onClick={() => setMaterialParaExcluir(null)} className="flex-1 py-3 rounded-2xl text-sm font-medium border" style={{ borderColor: 'var(--border-color)', color: 'var(--text-secondary)' }}>
                Cancelar
              </button>
              <button
                onClick={handleExcluir}
                disabled={excluirMaterial.isPending || toggleAtivo.isPending}
                className="flex-1 py-3 rounded-2xl text-sm font-semibold text-white disabled:opacity-50"
                style={{ backgroundColor: '#DC2626' }}
              >
                {excluirMaterial.isPending || toggleAtivo.isPending ? 'Removendo...' : 'Remover'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Editar Item */}
      {itemParaEditar && (
        <EditarItemModal item={itemParaEditar} editarItem={editarItem} onClose={() => setItemParaEditar(null)} />
      )}
    </div>
  );
}

// Requisito do cliente (2026-09-01): editar nome/quantidade mínima/preço unitário
// diretamente, sem precisar cadastrar um item novo. UPDATE simples via
// useEditarItemEstoque — diferente do lápis "Ajustar por contagem física"
// (esse continua chamando ajustar_estoque(), muda quantidade_atual/saldo via
// movimentação registrada). Aqui é só metadado de cadastro, nunca gera linha
// em movimentacoes_estoque.
function EditarItemModal({ item, editarItem, onClose }) {
  const [nome, setNome] = useState(item.nome);
  const [min, setMin] = useState(String(item.estoque?.quantidade_minima ?? 0));
  const [preco, setPreco] = useState(item.estoque?.preco_unitario != null ? String(item.estoque.preco_unitario) : '');

  const precoValido = Number(preco) > 0;
  const minValido = Number(min) >= 0;
  const valido = nome.trim() && precoValido && minValido;

  const handleSalvar = () => {
    if (!valido) return;
    editarItem.mutate({
      materialId: item.id,
      nome: nome.trim(),
      quantidade_minima: Number(min),
      preco_unitario: Number(preco),
    }, {
      onSuccess: () => { toast({ title: 'Item atualizado' }); onClose(); },
      onError: (error) => toast({ title: 'Erro ao editar item', description: error?.message, variant: 'destructive' }),
    });
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-card rounded-3xl p-8 w-[440px] shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>Editar item</h3>
          <button onClick={onClose} className="p-1 rounded-lg transition-[background-color] duration-200 hover:bg-black/5"><X size={18} style={{ color: 'var(--text-secondary)' }} /></button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium block mb-1.5" style={{ color: 'var(--text-secondary)' }}>Nome do item</label>
            <input value={nome} onChange={(e) => setNome(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--border-color)', backgroundColor: 'rgb(var(--card))' }} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium block mb-1.5" style={{ color: 'var(--text-secondary)' }}>Quantidade mínima</label>
              <input type="number" min={0} step="1" value={min} onChange={(e) => setMin(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--border-color)', backgroundColor: 'rgb(var(--card))' }} />
            </div>
            <div>
              <label className="text-xs font-medium block mb-1.5" style={{ color: 'var(--text-secondary)' }}>Preço unitário (R$)</label>
              <input type="number" min={0.01} step="0.01" value={preco} onChange={(e) => setPreco(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border text-sm outline-none" style={{ borderColor: preco !== '' && !precoValido ? '#DC2626' : 'var(--border-color)', backgroundColor: 'rgb(var(--card))' }} placeholder="0,00" />
            </div>
          </div>
          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
            Para ajustar a quantidade atual (saldo físico), use o botão de contagem na lista — essa tela só edita o cadastro do item.
          </p>
        </div>
        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="flex-1 py-3 rounded-2xl text-sm font-medium border" style={{ borderColor: 'var(--border-color)', color: 'var(--text-secondary)' }}>Cancelar</button>
          <button onClick={handleSalvar} disabled={editarItem.isPending || !valido} className="flex-1 py-3 rounded-2xl text-sm font-semibold text-white disabled:opacity-50" style={{ backgroundColor: 'var(--green-primary)' }}>
            {editarItem.isPending ? 'Salvando...' : 'Salvar alterações'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Extrato de estoque (2026-08-25) — só entradas, tipo extrato bancário.
// "Hoje"/"Semana"/"Mês" são sempre o período atual (sem navegar pra
// períodos passados); "Personalizado" cobre qualquer intervalo antigo.
const PERIODOS = [
  { key: 'hoje', label: 'Hoje' },
  { key: 'semana', label: 'Semana' },
  { key: 'mes', label: 'Mês' },
  { key: 'personalizado', label: 'Personalizado' },
];

function ExtratoTab({ materiais }) {
  const hoje = new Date();
  const [periodo, setPeriodo] = useState('semana');
  const [dataInicio, setDataInicio] = useState(startOfMonth(hoje).toISOString().slice(0, 10));
  const [dataFim, setDataFim] = useState(hoje.toISOString().slice(0, 10));
  const [materialFiltro, setMaterialFiltro] = useState('');

  let inicio, fim;
  if (periodo === 'hoje') {
    inicio = startOfDay(hoje);
    fim = addDays(inicio, 1);
  } else if (periodo === 'semana') {
    inicio = startOfWeek(hoje);
    fim = addDays(inicio, 7);
  } else if (periodo === 'mes') {
    inicio = startOfMonth(hoje);
    fim = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 1);
  } else {
    inicio = dataInicio ? new Date(dataInicio + 'T00:00:00') : null;
    fim = dataFim ? addDays(new Date(dataFim + 'T00:00:00'), 1) : null;
  }

  const { data: todasEntradas = [], isLoading } = useMovimentacoesEstoqueEntrada(inicio, fim);
  const entradas = materialFiltro ? todasEntradas.filter(m => m.material_id === materialFiltro) : todasEntradas;
  const totalGasto = entradas.reduce((soma, m) => soma + (Number(m.valor_gasto) || 0), 0);
  const materialSelecionado = materiais.find(m => m.id === materialFiltro);

  return (
    <div className="animate-fade-in-up" style={{ animationDelay: '60ms' }}>
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <div className="flex gap-1 p-1 rounded-xl" style={{ backgroundColor: 'var(--bg-tag)' }}>
          {PERIODOS.map(p => (
            <button
              key={p.key}
              onClick={() => setPeriodo(p.key)}
              className="px-3 py-1.5 rounded-lg text-sm font-medium transition-[background-color,box-shadow] duration-200"
              style={periodo === p.key ? { backgroundColor: 'rgb(var(--card))', color: 'var(--text-primary)', boxShadow: '0 1px 3px rgba(0,0,0,.08)' } : { color: 'var(--text-secondary)' }}
            >
              {p.label}
            </button>
          ))}
        </div>
        {periodo === 'personalizado' && (
          <div className="flex items-center gap-2">
            <div className="w-32"><DatePicker value={dataInicio} onChange={setDataInicio} /></div>
            <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>até</span>
            <div className="w-32"><DatePicker value={dataFim} onChange={setDataFim} /></div>
          </div>
        )}
        <select value={materialFiltro} onChange={e => setMaterialFiltro(e.target.value)} className="px-3 py-2 rounded-xl border text-sm outline-none bg-card" style={{ borderColor: 'var(--border-color)' }}>
          <option value="">Todos os materiais</option>
          {materiais.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}
        </select>
      </div>

      <div className="rounded-2xl border p-5 mb-5 flex items-center justify-between" style={{ borderColor: 'var(--border-color)', boxShadow: '0 2px 8px rgba(0,0,0,.04)' }}>
        <div>
          <p className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>ENTRADAS NO PERÍODO</p>
          <p className="text-lg font-semibold mt-1" style={{ color: 'var(--text-primary)' }}>{entradas.length}</p>
        </div>
        <div className="text-right">
          <p className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
            TOTAL GASTO{materialSelecionado ? ` · ${materialSelecionado.nome.toUpperCase()}` : ''}
          </p>
          <p className="text-lg font-semibold mt-1" style={{ color: 'var(--heading-accent)' }}>{moeda(totalGasto)}</p>
        </div>
      </div>

      {isLoading ? null : entradas.length === 0 ? (
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Nenhuma entrada de estoque nesse período.</p>
      ) : (
        <div className="space-y-2">
          {entradas.map(m => (
            <div key={m.id} className="flex items-center justify-between p-3.5 rounded-xl border" style={{ borderColor: 'var(--border-color)' }}>
              <div className="flex items-center gap-3 min-w-0">
                <FileText size={14} className="shrink-0" style={{ color: 'var(--text-secondary)' }} />
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                    {m.materiais?.nome || 'Item removido'} <span className="font-normal text-xs" style={{ color: 'var(--text-secondary)' }}>+{m.quantidade} {m.materiais?.unidade_medida || ''}</span>
                  </p>
                  <p className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>
                    {m.motivo} · {new Date(m.criado_em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </div>
              <span className="text-sm font-semibold shrink-0 ml-3" style={{ color: m.valor_gasto != null ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                {m.valor_gasto != null ? moeda(m.valor_gasto) : '—'}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
