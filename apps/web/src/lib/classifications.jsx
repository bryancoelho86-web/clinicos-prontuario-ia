export const CLASSIFICATIONS = ['Premium', 'Avulso', 'Aplicação de Vitaminas'];

export const CLASSIFICATION_STYLES = {
  'Premium': { bg: 'rgba(201, 162, 77, 0.14)', text: '#A8842F', solid: '#C9A24D', solidText: '#10291E', dot: '#C9A24D', soft: '#F7EFD8' },
  'Avulso': { bg: 'rgba(110, 110, 110, 0.12)', text: '#5A5A5A', solid: '#9A9A9A', solidText: '#FFFFFF', dot: '#9A9A9A', soft: '#EFEFEF' },
  'Aplicação de Vitaminas': { bg: 'rgba(249, 115, 22, 0.12)', text: '#C2570A', solid: '#F97316', solidText: '#FFFFFF', dot: '#F97316', soft: '#FDEBDD' },
};

export const getClassStyle = (name) => CLASSIFICATION_STYLES[name] || CLASSIFICATION_STYLES['Avulso'];

export const ClassificationBadge = ({ name, size = 'sm' }) => {
  const s = getClassStyle(name);
  const pad = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-xs';
  return (
    <span
      className={`${pad} rounded-md font-medium inline-flex items-center gap-1`}
      style={{ backgroundColor: s.bg, color: s.text }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: s.dot }} />
      {name}
    </span>
  );
};