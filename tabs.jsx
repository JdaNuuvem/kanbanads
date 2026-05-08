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
const ChecklistTab = ({ product, onUpdate }) => {
  const items = STAGE_CHECKLISTS[product.column] || [];
  const checklist = product.checklist || {};
  const doneCount = items.filter(i => checklist[i.id]).length;
  const pct = items.length ? (doneCount / items.length) * 100 : 0;

  const toggle = (id) => {
    onUpdate({ ...product, checklist: { ...checklist, [id]: !checklist[id] } });
  };

  return (
    <div style={{ padding: '20px 24px', overflow: 'auto', flex: 1, maxWidth: 700 }}>
      <h3 style={{ margin: '0 0 4px', fontSize: 14 }}>Checklist do estágio: {COLUMNS.find(c => c.id === product.column)?.title}</h3>
      <p style={{ color: 'var(--text-3)', fontSize: 12, margin: '0 0 16px' }}>
        Itens essenciais para validar antes de avançar de estágio.
      </p>
      <div className="checklist-progress">
        <div className="checklist-progress-bar"><div className="checklist-progress-fill" style={{ width: `${pct}%` }} /></div>
        <span className="checklist-progress-text">{doneCount}/{items.length} concluídos</span>
      </div>
      <div className="checklist">
        {items.map(item => {
          const done = !!checklist[item.id];
          return (
            <div key={item.id} className={`checklist-item ${done ? 'done' : ''}`} onClick={() => toggle(item.id)}>
              <div className="checklist-checkbox"><Icon name="check" size={12} /></div>
              <span className="checklist-text">{item.text}</span>
            </div>
          );
        })}
        {items.length === 0 && (
          <div className="empty"><div className="empty-text">Sem checklist para este estágio.</div></div>
        )}
      </div>
    </div>
  );
};

window.MetricsTab = MetricsTab;
window.ChecklistTab = ChecklistTab;
