import { useState } from 'react';
import { X, Check, Plus, Package } from 'lucide-react';

// materiaisPadrao: [{ material_id, nome, unidade_medida, quantidade }] — união dos
// materiais padrão de todos os procedimentos selecionados (só pra exibição;
// concluir_sessao() sempre debita o padrão de cada procedimento por inteiro,
// não dá pra ajustar a quantidade daqui — só registrar extras).
export default function FinalizarAtendimentoModal({ open, onClose, onConfirm, materiaisPadrao, materiaisAtivos, saving }) {
  const [confirmed, setConfirmed] = useState(null);
  const [extraMaterialId, setExtraMaterialId] = useState('');
  const [extraQty, setExtraQty] = useState(1);
  const [extraMaterials, setExtraMaterials] = useState([]);
  const [finalObservation, setFinalObservation] = useState('');

  if (!open) return null;

  const addExtra = () => {
    const material = materiaisAtivos.find((m) => m.id === extraMaterialId);
    if (!material) return;
    setExtraMaterials((prev) => [...prev, { material_id: material.id, nome: material.nome, unidade_medida: material.unidade_medida, quantidade: extraQty }]);
    setExtraMaterialId('');
    setExtraQty(1);
  };

  const removeExtra = (i) => setExtraMaterials((prev) => prev.filter((_, idx) => idx !== i));

  const handleConfirm = () => {
    onConfirm({
      materiaisConformePadrao: confirmed === 'sim',
      materiaisExtra: extraMaterials.map((m) => ({ material_id: m.material_id, quantidade: m.quantidade })),
      observacaoFinal: finalObservation.trim(),
    });
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-card rounded-3xl p-7 w-[560px] shadow-2xl max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-6">
          <div>
            <h3 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>Finalizar atendimento</h3>
            <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>Confirme os materiais e registre a observação final.</p>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg transition-[background-color] duration-200 hover:bg-black/5"><X size={18} style={{ color: 'var(--text-secondary)' }} /></button>
        </div>

        {/* Materials */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <Package size={15} style={{ color: 'var(--heading-accent)' }} />
            <p className="text-xs font-semibold tracking-wide" style={{ color: 'var(--text-secondary)' }}>MATERIAIS PADRÃO (baixados automaticamente)</p>
          </div>

          {materiaisPadrao.length > 0 ? (
            <div className="space-y-2 mb-4">
              {materiaisPadrao.map((m) => (
                <div key={m.material_id} className="flex items-center justify-between px-4 py-2.5 rounded-xl border" style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-tag)' }}>
                  <span className="text-sm" style={{ color: 'var(--text-primary)' }}>{m.nome}</span>
                  <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{m.quantidade}{m.unidade_medida}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>Nenhum material padrão para os procedimentos selecionados.</p>
          )}

          <p className="text-sm font-medium mb-3" style={{ color: 'var(--text-primary)' }}>Foi utilizado exatamente o previsto?</p>
          <div className="flex gap-3 mb-4">
            <button onClick={() => setConfirmed('sim')} className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl border-2 text-sm font-medium transition-[border-color,background-color,color] duration-200" style={confirmed === 'sim' ? { borderColor: 'var(--heading-accent)', backgroundColor: 'var(--bg-tag)', color: 'var(--heading-accent)' } : { borderColor: 'var(--border-color)', color: 'var(--text-secondary)' }}>
              {confirmed === 'sim' && <Check size={14} />} Sim, exatamente o previsto
            </button>
            <button onClick={() => setConfirmed('nao')} className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl border-2 text-sm font-medium transition-[border-color,background-color,color] duration-200" style={confirmed === 'nao' ? { borderColor: 'var(--gold)', backgroundColor: 'rgba(201,162,77,0.08)', color: 'var(--gold)' } : { borderColor: 'var(--border-color)', color: 'var(--text-secondary)' }}>
              Não, houve variação
            </button>
          </div>

          {confirmed === 'nao' && (
            <div className="rounded-2xl border p-4 mb-2" style={{ borderColor: 'rgba(201,162,77,0.35)', backgroundColor: 'rgba(201,162,77,0.05)' }}>
              <p className="text-xs font-semibold mb-3" style={{ color: 'var(--text-secondary)' }}>MATERIAIS EXTRAS UTILIZADOS</p>
              {extraMaterials.length > 0 && (
                <div className="space-y-2 mb-3">
                  {extraMaterials.map((m, i) => (
                    <div key={i} className="flex items-center justify-between px-4 py-2 rounded-xl" style={{ backgroundColor: 'var(--bg-tag)' }}>
                      <span className="text-sm" style={{ color: 'var(--text-primary)' }}>{m.quantidade}{m.unidade_medida} × {m.nome}</span>
                      <button onClick={() => removeExtra(i)}><X size={14} style={{ color: 'var(--text-secondary)' }} /></button>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <select value={extraMaterialId} onChange={(e) => setExtraMaterialId(e.target.value)} className="flex-1 px-3 py-2.5 rounded-xl border text-sm outline-none bg-card" style={{ borderColor: 'var(--border-color)' }}>
                  <option value="">Selecionar material...</option>
                  {materiaisAtivos.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
                </select>
                <input type="number" min={1} step="1" value={extraQty} onChange={(e) => setExtraQty(Number(e.target.value))} className="w-16 px-3 py-2.5 rounded-xl border text-sm outline-none text-center" style={{ borderColor: 'var(--border-color)', backgroundColor: 'rgb(var(--card))' }} />
                <button onClick={addExtra} disabled={!extraMaterialId} className="px-3 py-2.5 rounded-xl text-white text-sm disabled:opacity-50" style={{ backgroundColor: 'var(--green-primary)' }}><Plus size={16} /></button>
              </div>
            </div>
          )}
        </div>

        {/* Final observation */}
        <div className="mb-6">
          <label className="text-xs font-medium block mb-2" style={{ color: 'var(--text-secondary)' }}>Observação final</label>
          <textarea rows={3} value={finalObservation} onChange={(e) => setFinalObservation(e.target.value)} placeholder="Como foi a sessão, evolução do paciente..." className="w-full px-4 py-3 rounded-xl border text-sm resize-none outline-none" style={{ borderColor: 'var(--border-color)', backgroundColor: 'rgb(var(--card))', color: 'var(--text-primary)' }} />
        </div>

        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-3 rounded-2xl text-sm font-medium border" style={{ borderColor: 'var(--border-color)', color: 'var(--text-secondary)' }}>Cancelar</button>
          <button onClick={handleConfirm} disabled={!confirmed || saving} className="flex-1 py-3 rounded-2xl text-sm font-semibold transition-[transform,box-shadow] duration-200 hover:shadow-lg hover:-translate-y-0.5 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:shadow-none disabled:hover:translate-y-0" style={{ backgroundColor: 'var(--gold)', color: 'var(--green-primary)' }}>
            {saving ? 'Finalizando...' : 'Finalizar atendimento'}
          </button>
        </div>
      </div>
    </div>
  );
}
