// Creative card with status, version, tags, metrics
const CreativeCard = ({ creative, onUpdate, onDelete }) => {
  const [editing, setEditing] = React.useState(false);
  const status = CREATIVE_STATUSES.find(s => s.id === creative.status) || CREATIVE_STATUSES[0];
  const typeIcon = creative.type === 'video' ? 'video' : creative.type === 'image' ? 'image' : 'text';
  const typeLabel = creative.type === 'video' ? 'VÍDEO' : creative.type === 'image' ? 'IMG' : 'COPY';

  if (creative.type === 'copy') {
    return (
      <div className="copy-card">
        <div className="copy-card-header">
          <Icon name="text" size={14} />
          <input
            value={creative.name}
            onChange={e => onUpdate({ ...creative, name: e.target.value })}
            style={{ background: 'transparent', border: 'none', color: 'var(--text-1)', fontWeight: 500, flex: 1, outline: 'none' }}
          />
          <span className="creative-version-badge" style={{ position: 'static' }}>V{creative.version}</span>
          <select value={creative.status} onChange={e => onUpdate({ ...creative, status: e.target.value })}
            style={{ background: `color-mix(in oklch, ${status.color} 20%, transparent)`, color: status.color, border: 'none', borderRadius: 4, padding: '2px 6px', fontSize: 10, fontWeight: 700 }}>
            {CREATIVE_STATUSES.map(s => <option key={s.id} value={s.id}>{s.name.toUpperCase()}</option>)}
          </select>
          <button className="btn-ghost btn-sm btn-icon" onClick={onDelete}><Icon name="trash" size={12} /></button>
        </div>
        <textarea value={creative.text || ''} onChange={e => onUpdate({ ...creative, text: e.target.value })} placeholder="Cole sua copy aqui…" />
      </div>
    );
  }

  return (
    <div className="creative">
      <div className="creative-thumb">
        <div className="creative-thumb-pattern" />
        <span className="creative-type-badge">{typeLabel}</span>
        <span className="creative-status-badge" style={{ background: `color-mix(in oklch, ${status.color} 25%, transparent)`, color: status.color }}>
          {status.name}
        </span>
        <span className="creative-version-badge">V{creative.version}</span>
        <div className="creative-type-icon"><Icon name={typeIcon} size={20} /></div>
      </div>
      <div className="creative-info">
        <input value={creative.name} onChange={e => onUpdate({ ...creative, name: e.target.value })}
          style={{ background: 'transparent', border: 'none', color: 'var(--text-0)', fontSize: 12, fontWeight: 500, padding: 0, outline: 'none', width: '100%' }} />
        <div className="creative-meta">{creative.size} · {timeAgo(creative.addedAt)}</div>
        {creative.link && <a href={creative.link} target="_blank" rel="noreferrer" className="meta-link" style={{ fontSize: 11 }}>🔗 Link externo</a>}
        {creative.tags && creative.tags.length > 0 && (
          <div className="creative-tags">
            {creative.tags.map(t => <span key={t} className="creative-tag">{t}</span>)}
          </div>
        )}
        {creative.metrics && (
          <div className="creative-metrics-mini">
            <div className="creative-metric-mini"><span className="creative-metric-label">CTR</span><span>{creative.metrics.ctr}%</span></div>
            <div className="creative-metric-mini"><span className="creative-metric-label">CPM</span><span>R${creative.metrics.cpm}</span></div>
            <div className="creative-metric-mini"><span className="creative-metric-label">Gasto</span><span>R${creative.metrics.spent}</span></div>
          </div>
        )}
        <div style={{ display: 'flex', gap: 4 }}>
          <select value={creative.status} onChange={e => onUpdate({ ...creative, status: e.target.value })}
            style={{ flex: 1, background: `color-mix(in oklch, ${status.color} 20%, transparent)`, color: status.color, border: 'none', borderRadius: 4, padding: '3px 6px', fontSize: 10, fontWeight: 700 }}>
            {CREATIVE_STATUSES.map(s => <option key={s.id} value={s.id}>{s.name.toUpperCase()}</option>)}
          </select>
          <button className="btn-ghost btn-sm btn-icon" onClick={() => setEditing(!editing)}><Icon name="edit" size={12} /></button>
          <button className="btn-ghost btn-sm btn-icon" onClick={onDelete}><Icon name="trash" size={12} /></button>
        </div>
        {editing && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingTop: 6, borderTop: '1px dashed var(--border)' }}>
            <input placeholder="Link (drive/yt)" value={creative.link || ''} onChange={e => onUpdate({ ...creative, link: e.target.value })}
              style={{ background: 'var(--bg-1)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text-0)', fontSize: 11, padding: '4px 6px', outline: 'none' }} />
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {CREATIVE_TAGS.map(t => {
                const active = (creative.tags || []).includes(t);
                return (
                  <button key={t} className={`label-chip ${active ? 'active' : ''}`}
                    style={{ fontSize: 9, padding: '2px 6px', ...(active ? { background: 'var(--accent-dim)', color: 'var(--accent)' } : {}) }}
                    onClick={() => onUpdate({ ...creative, tags: active ? creative.tags.filter(x => x !== t) : [...(creative.tags || []), t] })}>
                    {t}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const UploadCard = ({ onUpload }) => {
  const [done, setDone] = React.useState(false);
  if (done) {
    return <div className="upload-card" style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}><Icon name="check" size={24} /><div>Adicionado!</div></div>;
  }
  return (
    <button className="upload-card" onClick={() => { onUpload(); setDone(true); setTimeout(() => setDone(false), 1200); }}>
      <Icon name="upload" size={22} /><div>Upload<br/>de criativo</div>
    </button>
  );
};

window.CreativeCard = CreativeCard;
window.UploadCard = UploadCard;
