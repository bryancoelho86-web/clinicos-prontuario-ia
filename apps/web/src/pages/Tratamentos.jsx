import { useState, useEffect } from 'react';
import { Plus, Pencil, Power, X, Clock, Package, DollarSign } from 'lucide-react';
import {
  useProcedimentosAdmin,
  useCreateProcedimento,
  useUpdateProcedimento,
  useToggleProcedimentoAtivo,
  useSetProcedimentoMateriais,
} from '@/hooks/useProcedimentos';
import { useMateriaisAtivos, useCreateMaterial } from '@/hooks/useMateriais';
import { toast } from '@/components/ui/use-toast';

const EMPTY_FORM = { nome: '', duracao_padrao_minutos: 60, preco_avulso: '', descricao: '', materiais: [] };

function formToMateriaisList(procedimento) {
  return (procedimento.procedimento_materiais || []).map(pm => ({
    material_id: pm.materiais.id,
    nome: pm.materiais.nome,
    unidade_medida: pm.materiais.unidade_medida,
    quantidade: pm.quantidade,
  }));
}

export default function Tratamentos() {
  const { data: procedimentos = [], error: procedimentosError } = useProcedimentosAdmin();
  const { data: materiaisAtivos = [], error: materiaisError } = useMateriaisAtivos();
  const createProcedimento = useCreateProcedimento();
  const updateProcedimento = useUpdateProcedimento();
  const toggleAtivo = useToggleProcedimentoAtivo();
  const setMateriais = useSetProcedimentoMateriais();
  const createMaterial = useCreateMaterial();

  const [modal, setModal] = useState(null); // null | 'new' | procedimento (edit)
  const [form, setForm] = useState(EMPTY_FORM);
  const [novoMaterial, setNovoMaterial] = useState(false);
  const [novoMaterialNome, setNovoMaterialNome] = useState('');
  const [selectedMaterialId, setSelectedMaterialId] = useState('');
  const [selectedMaterialQty, setSelectedMaterialQty] = useState(1);

  const isSaving = createProcedimento.isPending || updateProcedimento.isPending || setMateriais.isPending;

  useEffect(() => {
    if (procedimentosError) {
      toast({ title: 'Erro ao carregar tratamentos', description: procedimentosError.message, variant: 'destructive' });
    }
  }, [procedimentosError]);

  useEffect(() => {
    if (materiaisError) {
      toast({ title: 'Erro ao carregar materiais', description: materiaisError.message, variant: 'destructive' });
    }
  }, [materiaisError]);

  const openNew = () => {
    setForm(EMPTY_FORM);
    setModal('new');
  };

  const openEdit = (p) => {
    setForm({
      nome: p.nome,
      duracao_padrao_minutos: p.duracao_padrao_minutos,
      preco_avulso: p.preco_avulso ?? '',
      descricao: p.descricao || '',
      materiais: formToMateriaisList(p),
    });
    setModal(p);
  };

  const closeModal = () => {
    setModal(null);
    setNovoMaterial(false);
    setNovoMaterialNome('');
    setSelectedMaterialId('');
    setSelectedMaterialQty(1);
  };

  const addMaterial = () => {
    const material = materiaisAtivos.find(m => m.id === selectedMaterialId);
    if (!material) return;
    if (form.materiais.some(m => m.material_id === material.id)) {
      toast({ title: 'Material já adicionado', variant: 'destructive' });
      return;
    }
    if (Number(selectedMaterialQty) <= 0) {
      toast({ title: 'Quantidade deve ser maior que zero', variant: 'destructive' });
      return;
    }
    setForm(f => ({
      ...f,
      materiais: [...f.materiais, { material_id: material.id, nome: material.nome, unidade_medida: material.unidade_medida, quantidade: selectedMaterialQty }],
    }));
    setSelectedMaterialId('');
    setSelectedMaterialQty(1);
  };

  const removeMaterial = (materialId) => {
    setForm(f => ({ ...f, materiais: f.materiais.filter(m => m.material_id !== materialId) }));
  };

  const handleCreateMaterial = () => {
    if (!novoMaterialNome.trim()) return;
    createMaterial.mutate({ nome: novoMaterialNome.trim() }, {
      onSuccess: (material) => {
        setForm(f => ({ ...f, materiais: [...f.materiais, { material_id: material.id, nome: material.nome, unidade_medida: material.unidade_medida, quantidade: 1 }] }));
        setNovoMaterialNome('');
        setNovoMaterial(false);
      },
      onError: (error) => toast({ title: 'Erro ao criar material', description: error?.message, variant: 'destructive' }),
    });
  };

  const handleSave = () => {
    if (!form.nome.trim()) return;
    const payload = {
      nome: form.nome.trim(),
      descricao: form.descricao.trim(),
      duracao_padrao_minutos: Number(form.duracao_padrao_minutos) || 30,
      preco_avulso: form.preco_avulso === '' ? null : Number(form.preco_avulso),
    };
    const materiaisPayload = form.materiais.map(m => ({ material_id: m.material_id, quantidade: m.quantidade }));

    const onSaved = (procedimentoId) => {
      setMateriais.mutate({ procedimentoId, materiais: materiaisPayload }, {
        onSuccess: () => closeModal(),
        onError: (error) => toast({ title: 'Erro ao salvar materiais', description: error?.message, variant: 'destructive' }),
      });
    };

    if (modal === 'new') {
      createProcedimento.mutate(payload, {
        onSuccess: (p) => onSaved(p.id),
        onError: (error) => toast({ title: 'Erro ao criar tratamento', description: error?.message, variant: 'destructive' }),
      });
    } else {
      updateProcedimento.mutate({ id: modal.id, ...payload }, {
        onSuccess: (p) => onSaved(p.id),
        onError: (error) => toast({ title: 'Erro ao salvar tratamento', description: error?.message, variant: 'destructive' }),
      });
    }
  };

  const handleToggleAtivo = (p) => {
    toggleAtivo.mutate({ id: p.id, ativo: !p.ativo }, {
      onSuccess: () => toast({ title: p.ativo ? 'Tratamento desativado' : 'Tratamento reativado' }),
      onError: (error) => toast({ title: 'Erro', description: error?.message, variant: 'destructive' }),
    });
  };

  return (
    <div className="min-h-full p-4 sm:p-6 lg:p-8 relative overflow-hidden page-paper-bg">
      <div className="flex items-center justify-between mb-8 animate-fade-in-up">
        <div>
          <p
            className="text-[11px] font-medium uppercase mb-1"
            style={{ fontFamily: "'IBM Plex Mono', monospace", letterSpacing: '.14em', color: 'var(--text-secondary)' }}
          >
            {procedimentos.length} tratamentos cadastrados
          </p>
          <h1
            className="text-[26px] inline-block pb-1"
            style={{ fontFamily: "'Newsreader', serif", fontStyle: 'italic', fontWeight: 500, color: 'var(--heading-accent)', borderBottom: '1px solid var(--gold)' }}
          >
            Tratamentos
          </h1>
        </div>
        <button onClick={openNew} className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-white transition-[transform,box-shadow] duration-200 hover:shadow-lg hover:-translate-y-0.5" style={{ backgroundColor: 'var(--green-primary)' }}>
          <Plus size={15} /> Novo Tratamento
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 animate-fade-in-up" style={{ animationDelay: '60ms' }}>
        {procedimentos.map(p => {
          const materiais = formToMateriaisList(p);
          return (
            <div key={p.id} className="bg-card rounded-2xl p-6 transition-[box-shadow] duration-200 hover:shadow-md" style={{ borderTop: '3px solid var(--gold)', boxShadow: '0 8px 20px rgba(0,0,0,.05)', opacity: p.ativo ? 1 : 0.55 }}>
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-4">
                  <div className="p-3 rounded-xl" style={{ backgroundColor: 'var(--bg-tag)' }}>
                    <Package size={18} style={{ color: 'var(--heading-accent)' }} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>{p.nome}</h3>
                      {!p.ativo && (
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-medium uppercase tracking-wide" style={{ backgroundColor: 'var(--bg-tag)', color: 'var(--text-secondary)' }}>Inativo</span>
                      )}
                    </div>
                    {p.descricao && <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>{p.descricao}</p>}
                    <div className="flex items-center gap-4 mt-3">
                      <span className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-secondary)' }}>
                        <Clock size={12} /> {p.duracao_padrao_minutos} min
                      </span>
                      {p.preco_avulso != null && (
                        <span className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-secondary)' }}>
                          <DollarSign size={12} /> {Number(p.preco_avulso).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        </span>
                      )}
                      {materiais.length > 0 && (
                        <span className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-secondary)' }}>
                          <Package size={12} /> {materiais.length} materiais
                        </span>
                      )}
                    </div>
                    {materiais.length > 0 && (
                      <div className="flex gap-2 mt-3 flex-wrap">
                        {materiais.map((m) => (
                          <span key={m.material_id} className="px-2.5 py-1 rounded-lg text-xs" style={{ backgroundColor: 'var(--bg-tag)', color: 'var(--text-secondary)' }}>
                            {m.quantidade}{m.unidade_medida} {m.nome}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => openEdit(p)} className="p-2 rounded-xl border transition-[background-color] duration-200 hover:bg-black/5" style={{ borderColor: 'var(--border-color)' }}>
                    <Pencil size={15} style={{ color: 'var(--text-secondary)' }} />
                  </button>
                  <button onClick={() => handleToggleAtivo(p)} title={p.ativo ? 'Desativar' : 'Reativar'} className="p-2 rounded-xl border transition-[background-color] duration-200 hover:bg-black/5" style={{ borderColor: 'var(--border-color)' }}>
                    <Power size={15} style={{ color: p.ativo ? '#DC2626' : 'var(--heading-accent)' }} />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal form */}
      {modal !== null && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50" onClick={closeModal}>
          <div className="bg-card rounded-3xl p-8 w-[560px] max-h-[90vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>{modal === 'new' ? 'Novo Tratamento' : 'Editar Tratamento'}</h3>
              <button onClick={closeModal} className="p-1 rounded-lg transition-[background-color] duration-200 hover:bg-black/5"><X size={18} style={{ color: 'var(--text-secondary)' }} /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium block mb-1.5" style={{ color: 'var(--text-secondary)' }}>Nome do tratamento</label>
                <input value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))}
                  className="w-full px-4 py-3 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--border-color)', backgroundColor: 'rgb(var(--card))' }} placeholder="Ex: Tratamento Capilar" />
              </div>
              <div>
                <label className="text-xs font-medium block mb-1.5" style={{ color: 'var(--text-secondary)' }}>Descrição</label>
                <textarea rows={2} value={form.descricao} onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))}
                  className="w-full px-4 py-3 rounded-xl border text-sm outline-none resize-none" style={{ borderColor: 'var(--border-color)', backgroundColor: 'rgb(var(--card))' }} placeholder="Descreva o tratamento..." />
              </div>
              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="text-xs font-medium block mb-1.5" style={{ color: 'var(--text-secondary)' }}>Duração (minutos)</label>
                  <input type="number" min={1} value={form.duracao_padrao_minutos} onChange={e => setForm(f => ({ ...f, duracao_padrao_minutos: e.target.value }))}
                    className="w-full px-4 py-3 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--border-color)', backgroundColor: 'rgb(var(--card))' }} />
                </div>
                <div className="flex-1">
                  <label className="text-xs font-medium block mb-1.5" style={{ color: 'var(--text-secondary)' }}>Preço avulso (R$)</label>
                  <input type="number" min={0} step="0.01" value={form.preco_avulso} onChange={e => setForm(f => ({ ...f, preco_avulso: e.target.value }))}
                    className="w-full px-4 py-3 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--border-color)', backgroundColor: 'rgb(var(--card))' }} placeholder="Opcional" />
                </div>
              </div>

              {/* Materials */}
              <div>
                <label className="text-xs font-medium block mb-2" style={{ color: 'var(--text-secondary)' }}>Materiais utilizados</label>
                <div className="space-y-2 mb-2">
                  {form.materiais.map((m) => (
                    <div key={m.material_id} className="flex items-center justify-between px-3 py-2 rounded-xl" style={{ backgroundColor: 'var(--bg-tag)' }}>
                      <span className="text-sm" style={{ color: 'var(--text-primary)' }}>{m.quantidade}{m.unidade_medida} × {m.nome}</span>
                      <button onClick={() => removeMaterial(m.material_id)}><X size={14} style={{ color: 'var(--text-secondary)' }} /></button>
                    </div>
                  ))}
                </div>
                {!novoMaterial ? (
                  <div className="flex gap-2">
                    <select value={selectedMaterialId} onChange={e => setSelectedMaterialId(e.target.value)}
                      className="flex-1 px-3 py-2.5 rounded-xl border text-sm outline-none bg-card" style={{ borderColor: 'var(--border-color)' }}>
                      <option value="">Selecionar material...</option>
                      {materiaisAtivos.filter(m => !form.materiais.some(fm => fm.material_id === m.id)).map(m => (
                        <option key={m.id} value={m.id}>{m.nome}</option>
                      ))}
                    </select>
                    <input type="number" min={1} step="1" value={selectedMaterialQty} onChange={e => setSelectedMaterialQty(Number(e.target.value))}
                      className="w-16 px-3 py-2.5 rounded-xl border text-sm outline-none text-center" style={{ borderColor: 'var(--border-color)', backgroundColor: 'rgb(var(--card))' }} />
                    <button onClick={addMaterial} disabled={!selectedMaterialId} className="px-3 py-2.5 rounded-xl text-white text-sm disabled:opacity-50" style={{ backgroundColor: 'var(--green-primary)' }}>+</button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <input value={novoMaterialNome} onChange={e => setNovoMaterialNome(e.target.value)}
                      className="flex-1 px-3 py-2.5 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--border-color)', backgroundColor: 'rgb(var(--card))' }} placeholder="Nome do novo material" />
                    <button onClick={handleCreateMaterial} disabled={createMaterial.isPending} className="px-3 py-2.5 rounded-xl text-white text-sm disabled:opacity-50" style={{ backgroundColor: 'var(--green-primary)' }}>Criar</button>
                  </div>
                )}
                <button onClick={() => setNovoMaterial(v => !v)} className="text-xs mt-2 underline" style={{ color: 'var(--text-secondary)' }}>
                  {novoMaterial ? 'Escolher material existente' : 'Cadastrar material novo'}
                </button>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={closeModal} className="flex-1 py-3 rounded-2xl text-sm font-medium border" style={{ borderColor: 'var(--border-color)', color: 'var(--text-secondary)' }}>Cancelar</button>
              <button onClick={handleSave} disabled={isSaving} className="flex-1 py-3 rounded-2xl text-sm font-semibold text-white disabled:opacity-50" style={{ backgroundColor: 'var(--green-primary)' }}>
                {isSaving ? 'Salvando...' : modal === 'new' ? 'Cadastrar tratamento' : 'Salvar alterações'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
