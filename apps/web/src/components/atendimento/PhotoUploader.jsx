import { useRef, useState } from 'react';
import { UploadCloud, X, Camera } from 'lucide-react';

// photos: [{ id, signedUrl, nome_arquivo }]
export default function PhotoUploader({ photos, onUpload, onRemove }) {
  const inputRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);

  const addFiles = (files) => {
    if (files?.length) onUpload(files);
  };

  return (
    <div>
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); addFiles(e.dataTransfer.files); }}
        onClick={() => inputRef.current?.click()}
        className="rounded-2xl border-2 border-dashed cursor-pointer transition-[border-color,background-color] duration-200 flex flex-col items-center justify-center py-8 gap-2"
        style={{
          borderColor: dragOver ? 'var(--heading-accent)' : 'var(--border-color)',
          backgroundColor: dragOver ? 'var(--bg-tag)' : 'transparent',
        }}
      >
        <div className="p-3 rounded-full" style={{ backgroundColor: 'var(--bg-tag)' }}>
          <UploadCloud size={20} style={{ color: 'var(--heading-accent)' }} />
        </div>
        <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Arraste as fotos ou clique para selecionar</p>
        <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>PNG, JPG · a secretária ou o médico podem enviar</p>
        <input ref={inputRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
      </div>

      {photos.length > 0 && (
        <div className="grid grid-cols-4 gap-3 mt-4">
          {photos.map((p) => (
            <div key={p.id} className="relative group aspect-square rounded-xl overflow-hidden border" style={{ borderColor: 'var(--border-color)' }}>
              <img src={p.signedUrl} alt={p.nome_arquivo} className="w-full h-full object-cover" />
              <button onClick={() => onRemove(p)} className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <X size={12} className="text-white" />
              </button>
            </div>
          ))}
          <button onClick={() => inputRef.current?.click()} className="aspect-square rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-1 transition-[background-color] duration-200 hover:bg-black/5" style={{ borderColor: 'var(--border-color)' }}>
            <Camera size={16} style={{ color: 'var(--text-secondary)' }} />
            <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>Adicionar</span>
          </button>
        </div>
      )}
    </div>
  );
}
