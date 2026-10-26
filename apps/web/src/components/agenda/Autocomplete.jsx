import { useState, useRef, useEffect } from 'react';
import { Search, Check } from 'lucide-react';

export default function Autocomplete({ placeholder, items, value, onSelect, getSublabel }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const ref = useRef(null);

  const selected = items.find(i => i.id === value);
  const inputValue = query !== '' ? query : (selected ? selected.label : '');

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filtered = items
    .filter(i => !query || i.label.toLowerCase().includes(query.toLowerCase()))
    .slice(0, 8);

  const handleSelect = (item) => {
    setQuery('');
    setOpen(false);
    setHighlight(-1);
    onSelect(item);
  };

  const onKeyDown = (e) => {
    if (!open) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setHighlight(h => Math.min(h + 1, filtered.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlight(h => Math.max(h - 1, 0)); }
    else if (e.key === 'Enter' && highlight >= 0 && filtered[highlight]) { e.preventDefault(); handleSelect(filtered[highlight]); }
    else if (e.key === 'Escape') setOpen(false);
  };

  return (
    <div className="relative" ref={ref}>
      <div className="relative">
        <Search size={14} className="absolute left-3 top-3" style={{ color: 'var(--text-secondary)' }} />
        <input
          value={inputValue}
          onFocus={() => setOpen(true)}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); if (selected) onSelect(null); }}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          className="w-full pl-9 pr-3 py-2.5 rounded-xl border text-sm outline-none transition-colors focus:border-[var(--green-primary)]"
          style={{ borderColor: 'var(--border-color)', color: 'var(--text-primary)', backgroundColor: '#fff' }}
        />
        {selected && query === '' && <Check size={14} className="absolute right-3 top-3" style={{ color: 'var(--green-primary)' }} />}
      </div>
      {open && filtered.length > 0 && (
        <div className="absolute z-50 mt-1 w-full bg-card rounded-xl border shadow-lg max-h-60 overflow-y-auto" style={{ borderColor: 'var(--border-color)' }}>
          {filtered.map((item, i) => (
            <button
              key={item.id}
              onMouseEnter={() => setHighlight(i)}
              onClick={() => handleSelect(item)}
              className="w-full text-left px-3 py-2.5 transition-colors flex items-center justify-between gap-2"
              style={i === highlight ? { backgroundColor: 'var(--bg-tag)' } : {}}
            >
              <div className="min-w-0">
                <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{item.label}</p>
                {getSublabel && getSublabel(item) && <p className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>{getSublabel(item)}</p>}
              </div>
            </button>
          ))}
        </div>
      )}
      {open && query && filtered.length === 0 && (
        <div className="absolute z-50 mt-1 w-full bg-card rounded-xl border shadow-lg px-3 py-3 text-sm" style={{ borderColor: 'var(--border-color)', color: 'var(--text-secondary)' }}>
          Nenhum resultado encontrado.
        </div>
      )}
    </div>
  );
}