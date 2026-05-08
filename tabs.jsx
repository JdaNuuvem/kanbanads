// Metrics tab — daily entries log
const MetricsTab = ({ product, onUpdate }) => {
  const [adding, setAdding] = React.useState(false);
  const [draft, setDraft] = React.useState({
    time: new Date().toTimeString().slice(0,5),
    date: new Date().toISOString().slice(0,10),
    cost: '', bid: '', budget: '', cpa: '', sales: '', revenue: '', note: '',
  });

  const agg = aggregateMetrics(product.metrics);

  const updateMetric = (id, field, value) => {
    onUpdate({
      ...product,
      metrics: product.metrics.map(m => m.id === id ? { ...m, [field]: field === 'time' || field === 'date' || field === 'note' ? value : (+value || 0) } : m),
    });
  };

  const deleteMetric = (id) => {
    onUpdate({ ...product, metrics: product.metrics.filter(m => m.id !== id) });
  };

  const addEntry = () => {
    const cost = +draft.cost || 0;
    const sales = +draft.sales || 0;
    const revenue = +draft.revenue || 0;
    const newEntry = {
      id: 'm' + Date.now(),
      time: draft.time, date: draft.date,
      cost, bid: +draft.bid || 0, budget: +draft.budget || 0,
      cpa: sales > 0 ? +(cost/sales).toFixed(2) : (+draft.cpa || 0),
      sales, revenue, note: draft.note,
    };
    onUpdate({
      ...product,
      metrics: [...product.metrics, newEntry],
      history: [{ id: 'h' + Date.now(), text: `Métrica registrada: R$ ${cost.toFixed(2)} / ${sales} vendas`, at: new Date().toISOString(), type: 'metric' }, ...product.history],
    });
    setDraft({ ...draft, cost: '', bid: '', budget: '', cpa: '', sales: '', revenue: '', note: '' });
    setAdding(false);
  };

  const sorted = [...product.metrics].sort((a,b) => (b.date + b.time).localeCompare(a.date + a.time));

  return (
    <div style={{ padding: '20px 24px', overflow: 'auto', flex: 1 }}>
      <div className="metrics-summary">
        <div className="metric-summary">
          <span className="metric-summary-label">Gasto total</span>
          <span className="metric-summary-value">{formatBRL(agg.cost)}</span>
        </div>
        <div className="metric-summary">
          <span className="metric-summary-label">Faturamento</span>
          <span className="metric-summary-value">{formatBRL(agg.revenue)}</span>
        </div>
        <div className="metric-summary">
          <span className="metric-summary-label">Lucro</span>
          <span className="metric-summary-value" style={{ color: agg.profit >= 0 ? 'var(--accent)' : 'var(--danger)' }}>
            {agg.profit >= 0 ? '+' : ''}{formatBRL(agg.profit).replace('R$ ', 'R$ ')}
          </span>
        </div>
        <div className="metric-summary">
          <span className="metric-summary-label">ROAS</span>
          <span className="metric-summary-value" style={{ color: roasColor(agg.roas) }}>{agg.roas.toFixed(2)}x</span>
        </div>
        <div className="metric-summary">
          <span className="metric-summary-label">CPA médio</span>
          <span className="metric-summary-value">{agg.cpa > 0 ? formatBRL(agg.cpa) : '—'}</span>
        </div>
        <div className="metric-summary">
          <span className="metric-summary-label">Vendas</span>
          <span className="metric-summary-value">{agg.sales}</span>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <h3 style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--text-1)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Lançamentos diários ({product.metrics.length})
        </h3>
        <button className="btn btn-sm btn-primary" onClick={() => setAdding(!adding)}>
          <Icon name="plus" size={12} /> Novo lançamento
        </button>
      </div>

      <table className="metrics-table">
        <thead>
          <tr>
            <th>Data</th>
            <th className="col-time">Hora</th>
            <th>Cost</th>
            <th>Bid</th>
            <th>Budget</th>
            <th>CPA</th>
            <th>Vendas</th>
            <th>Faturamento</th>
            <th>ROAS</th>
            <th className="col-note">Nota</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {adding && (
            <tr className="add-metric-row">
              <td><input type="date" value={draft.date} onChange={e => setDraft({...draft, date: e.target.value})} /></td>
              <td className="col-time"><input type="time" value={draft.time} onChange={e => setDraft({...draft, time: e.target.value})} /></td>
              <td><input type="number" step="0.01" placeholder="0" value={draft.cost} onChange={e => setDraft({...draft, cost: e.target.value})} /></td>
              <td><input type="number" step="0.01" placeholder="0" value={draft.bid} onChange={e => setDraft({...draft, bid: e.target.value})} /></td>
              <td><input type="number" step="0.01" placeholder="0" value={draft.budget} onChange={e => setDraft({...draft, budget: e.target.value})} /></td>
              <td><input type="number" step="0.01" placeholder="auto" value={draft.cpa} onChange={e => setDraft({...draft, cpa: e.target.value})} /></td>
              <td><input type="number" placeholder="0" value={draft.sales} onChange={e => setDraft({...draft, sales: e.target.value})} /></td>
              <td><input type="number" step="0.01" placeholder="0" value={draft.revenue} onChange={e => setDraft({...draft, revenue: e.target.value})} /></td>
              <td>—</td>
              <td className="col-note"><input type="text" placeholder="ex: aumentei budget" value={draft.note} onChange={e => setDraft({...draft, note: e.target.value})} /></td>
              <td>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button className="btn btn-sm btn-primary" onClick={addEntry}><Icon name="check" size={12} /></button>
                  <button className="btn btn-sm btn-ghost" onClick={() => setAdding(false)}><Icon name="close" size={12} /></button>
                </div>
              </td>
            </tr>
          )}
          {sorted.length === 0 && !adding && (
            <tr><td colSpan="11" style={{ textAlign: 'center', padding: 30, color: 'var(--text-3)' }}>
              Sem lançamentos ainda. Clique em "Novo lançamento" para começar.
            </td></tr>
          )}
          {sorted.map(m => {
            const roas = m.cost > 0 ? m.revenue/m.cost : 0;
            return (
              <tr key={m.id}>
                <td><input type="date" value={m.date} onChange={e => updateMetric(m.id, 'date', e.target.value)} /></td>
                <td className="col-time"><input type="time" value={m.time} onChange={e => updateMetric(m.id, 'time', e.target.value)} /></td>
                <td><input type="number" step="0.01" value={m.cost} onChange={e => updateMetric(m.id, 'cost', e.target.value)} /></td>
                <td><input type="number" step="0.01" value={m.bid} onChange={e => updateMetric(m.id, 'bid', e.target.value)} /></td>
                <td><input type="number" step="0.01" value={m.budget} onChange={e => updateMetric(m.id, 'budget', e.target.value)} /></td>
                <td><input type="number" step="0.01" value={m.cpa} onChange={e => updateMetric(m.id, 'cpa', e.target.value)} /></td>
                <td><input type="number" value={m.sales} onChange={e => updateMetric(m.id, 'sales', e.target.value)} /></td>
                <td><input type="number" step="0.01" value={m.revenue} onChange={e => updateMetric(m.id, 'revenue', e.target.value)} /></td>
                <td style={{ color: roasColor(roas), fontWeight: 600 }}>{roas.toFixed(2)}x</td>
                <td className="col-note"><input type="text" value={m.note || ''} placeholder="—" onChange={e => updateMetric(m.id, 'note', e.target.value)} /></td>
                <td><button className="btn btn-sm btn-ghost btn-icon" onClick={() => deleteMetric(m.id)}><Icon name="trash" size={12} /></button></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

// Checklist tab
const ChecklistTab = ({ product, onUpdate, inPopup }) => {
  const [newText, setNewText] = React.useState('');
  const [editingId, setEditingId] = React.useState(null);
  const [editText, setEditText] = React.useState('');
  const [error, setError] = React.useState(null);

  const templates = STAGE_CHECKLISTS[product.column] || [];
  const checklist = product.checklist || {};

  // Merge template items with custom items from checklist
  const allItems = React.useMemo(() => {
    const map = new Map();
    for (const t of templates) map.set(t.id, { id: t.id, text: t.text, isTemplate: true });
    for (const [key, val] of Object.entries(checklist)) {
      if (!map.has(key)) map.set(key, { id: key, text: val.text || key, isTemplate: false, done: val.done });
      else {
        const existing = map.get(key);
        map.set(key, { ...existing, done: typeof val === 'object' ? val.done : val });
      }
    }
    return [...map.values()].map(item => ({
      ...item,
      done: typeof checklist[item.id] === 'object' ? !!checklist[item.id]?.done : !!checklist[item.id],
    }));
  }, [templates, checklist]);

  const doneCount = allItems.filter(i => i.done).length;
  const pct = allItems.length ? (doneCount / allItems.length) * 100 : 0;

  const toggle = async (itemId, currentDone) => {
    const newDone = !currentDone;
    onUpdate({ ...product, checklist: { ...checklist, [itemId]: { ...(checklist[itemId] || {}), done: newDone } } });
    try { await apiProducts.toggleChecklist(product.id, itemId, newDone); } catch { setError('Erro ao salvar'); }
  };

  const addItem = async () => {
    const text = newText.trim();
    if (!text) return;
    const itemId = 'custom_' + Date.now();
    onUpdate({ ...product, checklist: { ...checklist, [itemId]: { done: false, text } } });
    setNewText('');
    try { await apiProducts.addChecklistItem(product.id, itemId, text); } catch { setError('Erro ao adicionar'); }
  };

  const startEdit = (item) => { setEditingId(item.id); setEditText(item.text); };
  const saveEdit = async (itemId) => {
    const text = editText.trim();
    if (!text) return;
    onUpdate({ ...product, checklist: { ...checklist, [itemId]: { ...(checklist[itemId] || {}), text } } });
    setEditingId(null);
  };
  const cancelEdit = () => { setEditingId(null); setEditText(''); };

  const removeItem = async (itemId) => {
    const next = { ...checklist };
    delete next[itemId];
    onUpdate({ ...product, checklist: next });
    try { await apiProducts.removeChecklistItem(product.id, itemId); } catch { setError('Erro ao remover'); }
  };

  const content = (
    <div style={inPopup ? { padding: 0 } : { padding: '20px 24px', overflow: 'auto', flex: 1, maxWidth: 700 }}>
      {!inPopup && <h3 style={{ margin: '0 0 4px', fontSize: 14 }}>Checklist do estágio: {COLUMNS.find(c => c.id === product.column)?.title}</h3>}
      {!inPopup && <p style={{ color: 'var(--text-3)', fontSize: 12, margin: '0 0 16px' }}>Itens essenciais para validar antes de avançar de estágio.</p>}
      {error && <div style={{ padding: '6px 10px', marginBottom: 8, background: 'var(--danger-dim)', color: 'var(--danger)', borderRadius: 6, fontSize: 12 }}>{error} <button onClick={() => setError(null)} style={{ marginLeft: 8, color: 'inherit', cursor: 'pointer' }}>×</button></div>}
      <div className="checklist-progress">
        <div className="checklist-progress-bar"><div className="checklist-progress-fill" style={{ width: `${pct}%` }} /></div>
        <span className="checklist-progress-text">{doneCount}/{allItems.length} concluídos</span>
      </div>
      <div className="checklist">
        {allItems.map(item => {
          const done = item.done;
          return (
            <div key={item.id} className={`checklist-item ${done ? 'done' : ''}`}>
              <div className="checklist-checkbox" onClick={() => toggle(item.id, done)}
                   style={{ cursor: 'pointer' }}><Icon name="check" size={12} /></div>
              {editingId === item.id ? (
                <>
                  <input value={editText} onChange={e => setEditText(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') saveEdit(item.id); if (e.key === 'Escape') cancelEdit(); }}
                    style={{ flex: 1, background: 'var(--bg-1)', border: '1px solid var(--border-strong)', borderRadius: 4, color: 'var(--text-0)', fontSize: 13, padding: '4px 8px', outline: 'none' }} />
                  <button className="btn btn-sm btn-ghost" onClick={() => saveEdit(item.id)}><Icon name="check" size={12} /></button>
                  <button className="btn btn-sm btn-ghost" onClick={cancelEdit}><Icon name="close" size={12} /></button>
                </>
              ) : (
                <>
                  <span className="checklist-text">{item.text}</span>
                  <button className="btn btn-sm btn-ghost btn-icon" onClick={() => startEdit(item)} title="Editar"><Icon name="edit" size={11} /></button>
                  <button className="btn btn-sm btn-ghost btn-icon" onClick={() => removeItem(item.id)} title="Remover"><Icon name="trash" size={11} /></button>
                </>
              )}
            </div>
          );
        })}
        {allItems.length === 0 && !inPopup && (
          <div className="empty"><div className="empty-text">Sem checklist para este estágio.</div></div>
        )}
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <input value={newText} onChange={e => setNewText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') addItem(); }}
          placeholder="Novo item..."
          style={{ flex: 1, background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-0)', fontSize: 12, padding: '6px 10px', outline: 'none' }} />
        <button className="btn btn-sm btn-primary" onClick={addItem}><Icon name="plus" size={12} /> Adicionar</button>
      </div>
    </div>
  );

  return inPopup ? content : content;
};

window.MetricsTab = MetricsTab;
window.ChecklistTab = ChecklistTab;

// Floating checklist popup
const ChecklistPopup = ({ product, onUpdate, onClose }) => {
  React.useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div className="modal-backdrop" style={{ zIndex: 200, alignItems: 'flex-start', paddingTop: '10vh' }} onClick={onClose}>
      <div className="mini-modal" style={{ width: 420, maxHeight: '70vh', overflow: 'auto' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0, flex: 1 }}>Checklist — {product.name}</h3>
          <button className="modal-close" onClick={onClose}><Icon name="close" size={16} /></button>
        </div>
        <ChecklistTab product={product} onUpdate={onUpdate} inPopup />
      </div>
    </div>
  );
};

window.ChecklistPopup = ChecklistPopup;
