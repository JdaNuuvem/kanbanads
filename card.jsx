// Card with metrics, time-in-stage, checklist progress, assignee
const ProductCard = ({ product, onOpen, onToggleFav, onToggleReserve, onOpenChecklist, onDragStart, onDragEnd, isDragging, compact, users = [] }) => {
  const assigneeIds = product.assigneeIds || [];
  const folderCounts = FOLDERS.map(f => ({ name: f, count: product.creatives[f]?.length || 0 }));
  const totalCreatives = folderCounts.reduce((s, f) => s + f.count, 0);
  const labels = product.labels.map(id => LABEL_OPTIONS.find(l => l.id === id)).filter(Boolean);
  const agg = aggregateMetrics(product.metrics);
  const daysInStage = daysSince(product.enteredColumnAt);
  const isStale = (product.column === 'rodando' && daysInStage > 7) || (product.column === 'subir' && daysInStage > 3);
  const checklistItems = STAGE_CHECKLISTS[product.column] || [];
  const doneCount = checklistItems.filter(i => product.checklist?.[i.id]).length;
  const checklistPct = checklistItems.length ? (doneCount / checklistItems.length) * 100 : 0;
  const initial = product.name.charAt(0).toUpperCase();
  const showMetrics = (product.column === 'rodando' || product.column === 'escala' || product.column === 'morto') && agg.cost > 0;

  return (
    <div
      className={`card ${isDragging ? 'dragging' : ''} ${compact ? 'compact' : ''} ${isStale ? 'stale' : ''}`}
      style={{ borderLeftColor: product.color || 'var(--text-3)' }}
      draggable
      onDragStart={(e) => onDragStart(e, product)}
      onDragEnd={onDragEnd}
      onClick={() => onOpen(product.id)}
    >
      <div className="card-row">
        <div className="card-avatar" style={{ background: product.color || 'var(--text-3)' }}>{initial}</div>
        <div className="card-title">{product.name}</div>
        <AvatarStack userIds={assigneeIds} users={users} size={22} max={3} />
        <button
          className={`card-fav ${product.favorite ? 'active' : ''}`}
          onClick={(e) => { e.stopPropagation(); onToggleFav(product.id); }}
        >
          <Icon name={product.favorite ? 'starFill' : 'star'} size={14} />
        </button>
        <button
          className={`card-fav ${product.reserved_by ? 'active reserved' : ''}`}
          onClick={(e) => { e.stopPropagation(); onToggleReserve && onToggleReserve(product.id); }}
          title={product.reserved_by ? `Reservado por ${product.reserved_by_name || 'alguém'} — clique para liberar` : 'Reservar para você'}
        >
          <Icon name="lock" size={12} />
        </button>
      </div>

      {labels.length > 0 && !compact && (
        <div className="card-labels">
          {labels.map(l => (
            <span key={l.id} className="label" style={{ background: `color-mix(in oklch, ${l.color} 20%, transparent)`, color: l.color }}>
              {l.name}
            </span>
          ))}
        </div>
      )}

      {product.reserved_by && (
        <div className="card-reserved-badge" title="Produto reservado">
          <Icon name="lock" size={11} />
          <span>Reservado por: {product.reserved_by_name || 'Alguém'}</span>
        </div>
      )}

      {showMetrics && (
        <div className="card-metrics">
          <div className="card-metric">
            <span className="card-metric-label">ROAS</span>
            <span className="card-metric-value" style={{ color: roasColor(agg.roas) }}>{agg.roas.toFixed(2)}x</span>
          </div>
          <div className="card-metric">
            <span className="card-metric-label">Lucro</span>
            <span className="card-metric-value" style={{ color: agg.profit >= 0 ? 'var(--accent)' : 'var(--danger)' }}>
              {agg.profit >= 0 ? '+' : ''}{formatBR(agg.profit)}
            </span>
          </div>
          <div className="card-metric">
            <span className="card-metric-label">Vendas</span>
            <span className="card-metric-value">{agg.sales}</span>
          </div>
        </div>
      )}

      <div className="card-meta">
        <span className="card-time-badge" title={`${daysInStage} dias neste estágio`}>
          <Icon name="history" size={9} style={{ marginRight: 3, verticalAlign: -1 }} />
          {daysInStage === 0 ? 'hoje' : `${daysInStage}d aqui`}
        </span>
        {isStale && <span className="card-stale-badge">parado</span>}
        {checklistItems.length > 0 && (
          <div className="card-checklist-mini" title={`Checklist: ${doneCount}/${checklistItems.length}`}
               onClick={(e) => { e.stopPropagation(); onOpenChecklist && onOpenChecklist(product.id); }}
               style={{ cursor: 'pointer' }}>
            <div className="card-checklist-mini-fill" style={{ width: `${checklistPct}%` }} />
          </div>
        )}
        <span className="card-meta-item ml-auto" style={{ marginLeft: 'auto' }}>
          <Icon name="layers" size={11} /> {totalCreatives}
        </span>
      </div>

      {!compact && (
        <div className="card-folders">
          {folderCounts.map(f => (
            <span key={f.name} className={`card-folder-pill ${f.count > 0 ? 'has' : ''}`}>
              {f.name === 'VARIAÇÕES' ? 'VAR' : f.name}
              {f.count > 0 && <strong>{f.count}</strong>}
            </span>
          ))}
        </div>
      )}
    </div>
  );
};

const AddProductModal = ({ onClose, onCreate, defaultColumn, users = [], currentUserId }) => {
  const [name, setName] = React.useState('');
  const [column, setColumn] = React.useState(defaultColumn || 'separados');
  const [supplier, setSupplier] = React.useState('');
  const [startDate, setStartDate] = React.useState(new Date().toISOString().slice(0, 10));
  const [selectedLabels, setSelectedLabels] = React.useState([]);
  const [color, setColor] = React.useState('oklch(0.72 0.12 240)');
  const [assigneeIds, setAssigneeIds] = React.useState(currentUserId ? [currentUserId] : []);

  const colors = [
    'oklch(0.72 0.12 240)', 'oklch(0.72 0.14 340)', 'oklch(0.78 0.14 80)',
    'oklch(0.72 0.14 160)', 'oklch(0.72 0.14 30)', 'oklch(0.72 0.14 300)',
    'oklch(0.82 0.16 90)', 'oklch(0.78 0.16 135)', 'oklch(0.72 0.10 220)',
  ];

  const handleSubmit = () => {
    if (!name.trim()) return;
    onCreate({ name: name.trim(), column, supplier, startDate, labels: selectedLabels, color, assigneeIds });
  };

  const toggleLabel = (id) => {
    setSelectedLabels(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="mini-modal" onClick={e => e.stopPropagation()}>
        <h3>Novo produto</h3>
        <div className="form-row">
          <label>Nome do produto</label>
          <input autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Mini aspirador portátil" onKeyDown={e => e.key === 'Enter' && handleSubmit()} />
        </div>
        <div className="form-row row">
          <div>
            <label>Estágio inicial</label>
            <select value={column} onChange={e => setColumn(e.target.value)}>
              {COLUMNS.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
            </select>
          </div>
          <div>
            <label>Data de início</label>
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
          </div>
        </div>
        <div className="form-row">
          <label>Fornecedor (link)</label>
          <input value={supplier} onChange={e => setSupplier(e.target.value)} placeholder="https://..." />
        </div>
        <div className="form-row">
          <label>Responsáveis</label>
          <MultiAssigneeSelect value={assigneeIds} onChange={setAssigneeIds} users={users} />
        </div>
        <div className="form-row">
          <label>Cor do produto</label>
          <div className="color-picker">
            {colors.map(c => (
              <div key={c} className={`color-swatch ${color === c ? 'active' : ''}`} style={{ background: c }} onClick={() => setColor(c)}>
                {color === c && <Icon name="check" size={14} />}
              </div>
            ))}
          </div>
        </div>
        <div className="form-row">
          <label>Labels</label>
          <div className="labels-picker">
            {LABEL_OPTIONS.map(l => {
              const active = selectedLabels.includes(l.id);
              return (
                <button key={l.id} className={`label-chip ${active ? 'active' : ''}`}
                  style={active ? { background: `color-mix(in oklch, ${l.color} 25%, transparent)`, color: l.color } : {}}
                  onClick={() => toggleLabel(l.id)}>
                  {l.name}
                </button>
              );
            })}
          </div>
        </div>
        <div className="form-actions">
          <button className="btn" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={!name.trim()}>
            <Icon name="plus" size={14} /> Criar produto
          </button>
        </div>
      </div>
    </div>
  );
};

window.ProductCard = ProductCard;
window.AddProductModal = AddProductModal;
