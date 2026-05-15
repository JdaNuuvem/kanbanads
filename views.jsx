// Dashboard view + Table view
const Dashboard = ({ products, users = [], onOpenProduct }) => {
  const total = products.length;
  const totals = products.reduce((acc, p) => {
    const a = aggregateMetrics(p.metrics);
    acc.cost += a.cost; acc.revenue += a.revenue; acc.profit += a.profit; acc.sales += a.sales;
    return acc;
  }, { cost: 0, revenue: 0, profit: 0, sales: 0 });
  const avgRoas = totals.cost > 0 ? totals.revenue / totals.cost : 0;

  // Funnel
  const funnelMax = Math.max(...COLUMNS.map(c => products.filter(p => p.column === c.id).length), 1);

  // Top performers
  const top = [...products]
    .map(p => ({ p, agg: aggregateMetrics(p.metrics) }))
    .filter(x => x.agg.cost > 0)
    .sort((a, b) => b.agg.profit - a.agg.profit)
    .slice(0, 6);

  // Stale products
  const stale = products
    .filter(p => p.column === 'rodando' && daysSince(p.enteredColumnAt) > 7)
    .sort((a, b) => daysSince(b.enteredColumnAt) - daysSince(a.enteredColumnAt));

  // Need review (rodando without comments)
  const needReview = products.filter(p => p.column === 'rodando' && p.comments.length === 0);

  // Time spent in each stage (avg days)
  const stageStats = COLUMNS.map(c => {
    const inCol = products.filter(p => p.column === c.id);
    const avgDays = inCol.length ? Math.round(inCol.reduce((s, p) => s + daysSince(p.enteredColumnAt), 0) / inCol.length) : 0;
    return { ...c, count: inCol.length, avgDays };
  });

  return (
    <div className="dashboard">
      {/* KPI cards */}
      <div className="dashboard-grid">
        <div className="kpi-card">
          <span className="kpi-label">Faturamento total</span>
          <span className="kpi-value">{formatBRL(totals.revenue)}</span>
          <span className="kpi-sub">{totals.sales} vendas</span>
        </div>
        <div className="kpi-card">
          <span className="kpi-label">Gasto em ads</span>
          <span className="kpi-value">{formatBRL(totals.cost)}</span>
          <span className="kpi-sub">de {products.filter(p => p.metrics.length > 0).length} produtos</span>
        </div>
        <div className="kpi-card">
          <span className="kpi-label">Lucro</span>
          <span className="kpi-value" style={{ color: totals.profit >= 0 ? 'var(--accent)' : 'var(--danger)' }}>
            {totals.profit >= 0 ? '+' : ''}{formatBRL(totals.profit)}
          </span>
          <span className="kpi-sub">margem {totals.revenue > 0 ? ((totals.profit/totals.revenue)*100).toFixed(1) : 0}%</span>
        </div>
        <div className="kpi-card">
          <span className="kpi-label">ROAS médio</span>
          <span className="kpi-value" style={{ color: roasColor(avgRoas) }}>{avgRoas.toFixed(2)}x</span>
          <span className="kpi-sub">{total} produtos no funil</span>
        </div>
      </div>

      {/* Funnel */}
      <div className="dashboard-section">
        <h3><Icon name="filter" size={14} /> Funil de produtos</h3>
        <div className="funnel">
          {COLUMNS.map(c => {
            const count = products.filter(p => p.column === c.id).length;
            const pct = (count / funnelMax) * 100;
            return (
              <div key={c.id} className="funnel-row">
                <div className="funnel-label">
                  <span className="col-dot" style={{ background: c.color }} />
                  {c.title}
                </div>
                <div className="funnel-bar-wrap">
                  <div className="funnel-bar" style={{ width: `${Math.max(pct, count > 0 ? 4 : 0)}%`, background: c.color }}>
                    {count > 0 && count}
                  </div>
                </div>
                <div className="funnel-count">{stageStats.find(s => s.id === c.id).avgDays}d médio</div>
              </div>
            );
          })}
        </div>
      </div>

      <WorkloadChart products={products} users={users} onOpenProduct={onOpenProduct} />

      <div className="dashboard-2col">
        {/* Top performers */}
        <div className="dashboard-section">
          <h3><Icon name="rocket" size={14} /> Top performers (por lucro)</h3>
          {top.length === 0 ? (
            <div className="empty"><div className="empty-text">Sem dados de métricas ainda.</div></div>
          ) : (
            <div className="bar-chart">
              {top.map(({ p, agg }) => {
                const max = Math.max(...top.map(t => Math.abs(t.agg.profit)));
                const pct = max > 0 ? Math.abs(agg.profit) / max * 100 : 0;
                return (
                  <div key={p.id} className="bar-row" onClick={() => onOpenProduct(p.id)} style={{ cursor: 'pointer' }}>
                    <div className="bar-row-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div className="card-avatar" style={{ background: p.color, width: 16, height: 16, fontSize: 8 }}>{p.name.charAt(0)}</div>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                    </div>
                    <div className="bar-row-bar-wrap">
                      <div className="bar-row-bar" style={{ width: `${pct}%`, background: agg.profit >= 0 ? 'var(--accent)' : 'var(--danger)' }} />
                    </div>
                    <div className="bar-row-value" style={{ color: agg.profit >= 0 ? 'var(--accent)' : 'var(--danger)' }}>
                      {agg.profit >= 0 ? '+' : ''}{formatBR(agg.profit)}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Alerts */}
        <div className="dashboard-section">
          <h3><Icon name="flame" size={14} /> Atenção necessária</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {stale.length > 0 && (
              <div>
                <div style={{ fontSize: 11, color: 'var(--danger)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                  Parados há +7 dias rodando
                </div>
                {stale.slice(0, 4).map(p => (
                  <div key={p.id} onClick={() => onOpenProduct(p.id)} style={{ padding: 8, background: 'var(--bg-2)', borderRadius: 6, marginBottom: 4, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div className="card-avatar" style={{ background: p.color, width: 20, height: 20, fontSize: 10 }}>{p.name.charAt(0)}</div>
                    <span style={{ fontSize: 12, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                    <span className="card-stale-badge">{daysSince(p.enteredColumnAt)}d</span>
                  </div>
                ))}
              </div>
            )}
            {needReview.length > 0 && (
              <div>
                <div style={{ fontSize: 11, color: 'var(--warn)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                  Sem comentários (rodando)
                </div>
                {needReview.slice(0, 3).map(p => (
                  <div key={p.id} onClick={() => onOpenProduct(p.id)} style={{ padding: 8, background: 'var(--bg-2)', borderRadius: 6, marginBottom: 4, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div className="card-avatar" style={{ background: p.color, width: 20, height: 20, fontSize: 10 }}>{p.name.charAt(0)}</div>
                    <span style={{ fontSize: 12, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                  </div>
                ))}
              </div>
            )}
            {stale.length === 0 && needReview.length === 0 && (
              <div className="empty" style={{ padding: 20 }}><div className="empty-text">Tudo em dia! 🎯</div></div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const TableView = ({ products, users = [], onOpenProduct, onToggleFav }) => {
  const [sortBy, setSortBy] = React.useState('name');
  const [sortDir, setSortDir] = React.useState('asc');

  const sorted = [...products].sort((a, b) => {
    let av, bv;
    if (sortBy === 'roas') { av = aggregateMetrics(a.metrics).roas; bv = aggregateMetrics(b.metrics).roas; }
    else if (sortBy === 'profit') { av = aggregateMetrics(a.metrics).profit; bv = aggregateMetrics(b.metrics).profit; }
    else if (sortBy === 'cost') { av = aggregateMetrics(a.metrics).cost; bv = aggregateMetrics(b.metrics).cost; }
    else if (sortBy === 'days') { av = daysSince(a.enteredColumnAt); bv = daysSince(b.enteredColumnAt); }
    else if (sortBy === 'column') { av = COLUMNS.findIndex(c => c.id === a.column); bv = COLUMNS.findIndex(c => c.id === b.column); }
    else { av = a.name; bv = b.name; }
    if (av < bv) return sortDir === 'asc' ? -1 : 1;
    if (av > bv) return sortDir === 'asc' ? 1 : -1;
    return 0;
  });

  const sort = (col) => {
    if (sortBy === col) setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    else { setSortBy(col); setSortDir('asc'); }
  };

  return (
    <div className="table-view">
      <table className="products-table">
        <thead>
          <tr>
            <th style={{ width: 30 }}></th>
            <th>Produto</th>
            <th>Resp.</th>
            <th onClick={() => sort('column')}>Estágio</th>
            <th onClick={() => sort('days')} style={{ textAlign: 'right' }}>Dias aqui</th>
            <th onClick={() => sort('cost')} style={{ textAlign: 'right' }}>Gasto</th>
            <th style={{ textAlign: 'right' }}>Faturam.</th>
            <th onClick={() => sort('profit')} style={{ textAlign: 'right' }}>Lucro</th>
            <th onClick={() => sort('roas')} style={{ textAlign: 'right' }}>ROAS</th>
            <th style={{ textAlign: 'right' }}>Vendas</th>
            <th style={{ textAlign: 'center' }}>Criativos</th>
            <th>Labels</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map(p => {
            const agg = aggregateMetrics(p.metrics);
            const folderList = window.folders || ['CA1', 'CA2', 'CA3', 'CA4', 'UPSELLS', 'SOURCES', 'VARIAÇÕES'];
            const totalCreatives = folderList.reduce((s, f) => s + (p.creatives[f]?.length || 0), 0);
            const col = COLUMNS.find(c => c.id === p.column);
            return (
              <tr key={p.id} onClick={() => onOpenProduct(p.id)}>
                <td onClick={e => { e.stopPropagation(); onToggleFav(p.id); }}>
                  <button className={`card-fav ${p.favorite ? 'active' : ''}`}><Icon name={p.favorite ? 'starFill' : 'star'} size={14} /></button>
                </td>
                <td style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div className="card-avatar" style={{ background: p.color, width: 22, height: 22, fontSize: 10 }}>{p.name.charAt(0)}</div>
                  <strong>{p.name}</strong>
                </td>
                <td>{(() => { const ids = p.assigneeIds || []; return ids.length > 0 ? <AvatarStack userIds={ids} users={users} size={20} max={3} /> : <span style={{ color: 'var(--text-3)', fontSize: 11 }}>—</span>; })()}</td>
                <td><span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span className="col-dot" style={{ background: col?.color }} />{col?.title}</span></td>
                <td style={{ textAlign: 'right' }}>{daysSince(p.enteredColumnAt)}d</td>
                <td style={{ textAlign: 'right' }}>{agg.cost > 0 ? formatBRL(agg.cost) : '—'}</td>
                <td style={{ textAlign: 'right' }}>{agg.revenue > 0 ? formatBRL(agg.revenue) : '—'}</td>
                <td style={{ textAlign: 'right', color: agg.profit > 0 ? 'var(--accent)' : agg.profit < 0 ? 'var(--danger)' : 'var(--text-3)' }}>
                  {agg.cost > 0 ? `${agg.profit >= 0 ? '+' : ''}${formatBR(agg.profit)}` : '—'}
                </td>
                <td style={{ textAlign: 'right', color: roasColor(agg.roas), fontWeight: 600 }}>{agg.cost > 0 ? `${agg.roas.toFixed(2)}x` : '—'}</td>
                <td style={{ textAlign: 'right' }}>{agg.sales || '—'}</td>
                <td style={{ textAlign: 'center', color: 'var(--text-2)' }}>{totalCreatives}</td>
                <td>
                  <div className="card-labels">
                    {p.labels.map(id => {
                      const l = LABEL_OPTIONS.find(x => x.id === id);
                      return l ? <span key={id} className="label" style={{ background: `color-mix(in oklch, ${l.color} 20%, transparent)`, color: l.color }}>{l.name}</span> : null;
                    })}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

window.Dashboard = Dashboard;
window.TableView = TableView;
