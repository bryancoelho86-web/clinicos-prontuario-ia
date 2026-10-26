const SIZES = {
  sm: { box: 'w-10 h-10 rounded-xl', text: 'text-sm' },
  md: { box: 'w-12 h-12 rounded-2xl', text: 'text-base' },
  lg: { box: 'w-16 h-16 rounded-2xl', text: 'text-xl' },
};

export default function Avatar({ nome, fotoUrl, size = 'md', className = '' }) {
  const { box, text } = SIZES[size];
  const iniciais = nome.split(' ').map((n) => n[0]).join('').slice(0, 2);
  return (
    <div
      className={`${box} ${text} flex items-center justify-center text-white font-semibold shrink-0 overflow-hidden ${className}`}
      style={{ backgroundColor: 'var(--green-primary)' }}
    >
      {fotoUrl ? <img src={fotoUrl} alt={nome} className="w-full h-full object-cover" /> : iniciais}
    </div>
  );
}
