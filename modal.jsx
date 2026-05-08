// Product modal — shell with tabs (Pastas / Métricas / Checklist) + sidebar + aside
const ProductModal = ({ product, users = [], currentUser, onClose, onUpdate, onDelete, onDuplicate }) => {
  const [activeTab, setActiveTab] = React.useState('pastas');
  const [activeFolder, setActiveFolder] = React.useState('CA1');
  const [activeAside, setActiveAside] = React.useState('comments');
  const [historyFilter, setHistoryFilter] = React.useState('all');
  const [commentText, setCommentText] = React.useState('');
  const [editingLabels, setEditingLabels] = React.useState(false);
  const [showMenu, setShowMenu] = React.useState(false);

  React.useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handler = (e) => {
      if (e.key === 'Escape') onClose();
      if ((e.metaKey || e.ctrlKey) && e.key === '1') setActiveTab('pastas');
      if ((e.metaKey || e.ctrlKey) && e.key === '2') setActiveTab('metricas');
      if ((e.metaKey || e.ctrlKey) && e.key === '3') setActiveTab('checklist');
    };
    document.addEventListener('keydown', handler);
    return () => { document.body.style.overflow = prev; document.removeEventListener('keydown', handler); };
  }, [onClose]);

  const updateField = (field, value) => onUpdate({ ...product, [field]: value });

  const moveColumn = (toCol) => {
    if (toCol === product.column) return;
    const colTitle = COLUMNS.find(c => c.id === toCol)?.title;
    onUpdate({
      ...product,
      column: toCol,
      enteredColumnAt: new Date().toISOString(),
      history: [{ id: 'h' + Date.now(), text: `Movido para ${colTitle}`, at: new Date().toISOString(), type: 'move', byId: currentUser?.id }, ...product.history],
    });
  };

  const setAssigneeIds = (ids) => {
    const prev = product.assigneeIds || [];
    const added = ids.filter(x => !prev.includes(x));
    const removed = prev.filter(x => !ids.includes(x));
    let text;
    if (added.length && !removed.length) {
      const names = added.map(id => users.find(u => u.id === id)?.name).filter(Boolean).join(', ');
      text = `Adicionado(s) responsável(eis): ${names}`;
    } else if (removed.length && !added.length) {
      const names = removed.map(id => users.find(u => u.id === id)?.name).filter(Boolean).join(', ');
      text = `Removido(s) responsável(eis): ${names}`;
    } else {
      text = 'Responsáveis atualizados';
    }
    onUpdate({
      ...product,
      assigneeIds: ids,
      history: [{ id: 'h' + Date.now(), text, at: new Date().toISOString(), type: 'assign', byId: currentUser?.id }, ...product.history],
    });
  };

  const colIdx = COLUMNS.findIndex(c => c.id === product.column);
  const goPrev = () => colIdx > 0 && moveColumn(COLUMNS[colIdx - 1].id);
  const goNext = () => colIdx < COLUMNS.length - 1 && moveColumn(COLUMNS[colIdx + 1].id);

  const addCreative = (folder) => {
    const types = ['video', 'image', 'copy'];
    const type = types[Math.floor(Math.random() * 3)];
    const newC = {
      id: `${folder}-${Date.now()}`,
      name: type === 'copy' ? `Copy ${folder} ${(product.creatives[folder]?.length || 0) + 1}` : `${type === 'video' ? 'VID' : 'IMG'}_${folder}_${String((product.creatives[folder]?.length || 0) + 1).padStart(2, '0')}`,
      type, version: 1, status: 'rascunho',
      size: type === 'video' ? `${(Math.random()*30+5).toFixed(1)} MB` : type === 'image' ? `${(Math.random()*2+0.4).toFixed(1)} MB` : '—',
      text: type === 'copy' ? '' : null, link: '', tags: [],
      metrics: { ctr: '0.00', cpm: '0.00', spent: '0.00' },
      addedAt: new Date().toISOString(),
    };
    onUpdate({ ...product, creatives: { ...product.creatives, [folder]: [...(product.creatives[folder] || []), newC] } });
  };

  const updateCreative = (folder, updated) => {
    onUpdate({ ...product, creatives: { ...product.creatives, [folder]: product.creatives[folder].map(c => c.id === updated.id ? updated : c) } });
  };

  const deleteCreative = (folder, id) => {
    onUpdate({ ...product, creatives: { ...product.creatives, [folder]: product.creatives[folder].filter(c => c.id !== id) } });
  };

  const duplicateCreative = (folder, c) => {
    const newC = { ...c, id: `${folder}-${Date.now()}`, version: c.version + 1, name: c.name.replace(/V\d+$/, '') + ` V${c.version+1}`, addedAt: new Date().toISOString(), status: 'rascunho' };
    onUpdate({ ...product, creatives: { ...product.creatives, [folder]: [...product.creatives[folder], newC] } });
  };

  const addComment = () => {
    if (!commentText.trim()) return;
    const mentions = parseMentionsFromText(commentText, users);
    onUpdate({ ...product, comments: [{ id: 'c' + Date.now(), authorId: currentUser?.id, text: commentText.trim(), mentions, at: new Date().toISOString() }, ...product.comments] });
    setCommentText('');
  };

  const toggleLabel = (id) => {
    updateField('labels', product.labels.includes(id) ? product.labels.filter(x => x !== id) : [...product.labels, id]);
  };

  const folderCreatives = product.creatives[activeFolder] || [];
  const currentLabels = product.labels.map(id => LABEL_OPTIONS.find(l => l.id === id)).filter(Boolean);
  const daysInStage = daysSince(product.enteredColumnAt);
  const checklistItems = STAGE_CHECKLISTS[product.column] || [];
  const checklistDone = checklistItems.filter(i => product.checklist?.[i.id]).length;

  const filteredHistory = product.history.filter(h => historyFilter === 'all' || h.type === historyFilter);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="card-avatar" style={{ background: product.color || 'var(--text-3)', width: 28, height: 28, fontSize: 12 }}>{product.name.charAt(0).toUpperCase()}</div>
          <button className={`card-fav ${product.favorite ? 'active' : ''}`} onClick={() => updateField('favorite', !product.favorite)} style={{ width: 28, height: 28 }}>
            <Icon name={product.favorite ? 'starFill' : 'star'} size={18} />
          </button>
          <input className="modal-title-input" value={product.name} onChange={e => updateField('name', e.target.value)} />
          <span className="card-time-badge" title={`${daysInStage} dias em ${COLUMNS.find(c => c.id === product.column)?.title}`}>
            {daysInStage}d em {COLUMNS.find(c => c.id === product.column)?.title}
          </span>
          <button className="btn btn-sm btn-ghost btn-icon" onClick={goPrev} disabled={colIdx === 0} title="Estágio anterior"><Icon name="arrowLeft" size={14} /></button>
          <button className="btn btn-sm btn-ghost btn-icon" onClick={goNext} disabled={colIdx === COLUMNS.length-1} title="Próximo estágio"><Icon name="arrowRight" size={14} /></button>
          <div className="card-labels">
            {currentLabels.map(l => (
              <span key={l.id} className="label" style={{ background: `color-mix(in oklch, ${l.color} 20%, transparent)`, color: l.color }}>{l.name}</span>
            ))}
            <button className="btn btn-sm btn-ghost" onClick={() => setEditingLabels(!editingLabels)}><Icon name="plus" size={12} /> Label</button>
          </div>
          <div style={{ position: 'relative' }}>
            <button className="btn btn-ghost btn-icon" onClick={() => setShowMenu(!showMenu)}><Icon name="moreH" size={16} /></button>
            {showMenu && (
              <div className="popover" style={{ right: 0, top: 38 }} onMouseLeave={() => setShowMenu(false)}>
                {COLUMNS.map(c => (
                  <div key={c.id} className="popover-item" onClick={() => { moveColumn(c.id); setShowMenu(false); }}>
                    <span className="col-dot" style={{ background: c.color }} />Mover para {c.title}
                    {product.column === c.id && <Icon name="check" size={14} style={{ marginLeft: 'auto' }} />}
                  </div>
                ))}
                <div className="popover-divider" />
                <div className="popover-item" onClick={() => { onDuplicate(product); setShowMenu(false); }}>
                  <Icon name="layers" size={14} /> Duplicar como template
                </div>
                <div className="popover-item danger" onClick={() => { if (confirm('Excluir este produto?')) onDelete(product.id); }}>
                  <Icon name="trash" size={14} /> Excluir produto
                </div>
              </div>
            )}
          </div>
          <button className="modal-close" onClick={onClose}><Icon name="close" size={16} /></button>
        </div>

        {editingLabels && (
          <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', background: 'var(--bg-2)' }}>
            <div className="labels-picker">
              {LABEL_OPTIONS.map(l => {
                const active = product.labels.includes(l.id);
                return (
                  <button key={l.id} className={`label-chip ${active ? 'active' : ''}`}
                    style={active ? { background: `color-mix(in oklch, ${l.color} 25%, transparent)`, color: l.color } : {}}
                    onClick={() => toggleLabel(l.id)}>{l.name}</button>
                );
              })}
            </div>
          </div>
        )}

        <div className="modal-tabs">
          <button className={`modal-tab ${activeTab==='pastas'?'active':''}`} onClick={() => setActiveTab('pastas')}>
            <Icon name="folder" size={14} /> Pastas
          </button>
          <button className={`modal-tab ${activeTab==='metricas'?'active':''}`} onClick={() => setActiveTab('metricas')}>
            <Icon name="target" size={14} /> Métricas
            {product.metrics.length > 0 && <span className="badge">{product.metrics.length}</span>}
          </button>
          <button className={`modal-tab ${activeTab==='checklist'?'active':''}`} onClick={() => setActiveTab('checklist')}>
            <Icon name="check" size={14} /> Checklist
            {checklistItems.length > 0 && <span className="badge">{checklistDone}/{checklistItems.length}</span>}
          </button>
        </div>

        <div className="modal-body">
          {activeTab === 'pastas' && (
            <div className="modal-sidebar">
              <div className="sidebar-section">
                <div className="sidebar-section-title">Pastas</div>
                <div className="folder-list">
                  {FOLDERS.map(f => {
                    const count = product.creatives[f]?.length || 0;
                    return (
                      <div key={f} className={`folder-item ${activeFolder === f ? 'active' : ''}`} onClick={() => setActiveFolder(f)}>
                        <Icon name="folder" size={14} className="folder-icon" />
                        <span>{f}</span>
                        <span className="folder-count">{count}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="sidebar-meta">
                <div className="meta-field">
                  <div className="meta-label">Responsáveis</div>
                  <MultiAssigneeSelect value={product.assigneeIds || []} onChange={setAssigneeIds} users={users} />
                </div>
                <div className="meta-field">
                  <div className="meta-label">Início</div>
                  <input className="meta-input" type="date" value={product.startDate} onChange={e => updateField('startDate', e.target.value)} />
                </div>
                <div className="meta-field">
                  <div className="meta-label">Fornecedor</div>
                  <input className="meta-input" type="url" placeholder="https://..." value={product.supplier} onChange={e => updateField('supplier', e.target.value)} />
                  {product.supplier && <a className="meta-link" href={product.supplier} target="_blank" rel="noreferrer">Abrir →</a>}
                </div>
                <div className="meta-field">
                  <div className="meta-label">Cor</div>
                  <div className="color-picker">
                    {['oklch(0.72 0.12 240)','oklch(0.72 0.14 340)','oklch(0.78 0.14 80)','oklch(0.72 0.14 160)','oklch(0.72 0.14 30)','oklch(0.72 0.14 300)','oklch(0.82 0.16 90)','oklch(0.78 0.16 135)'].map(c => (
                      <div key={c} className={`color-swatch ${product.color === c ? 'active' : ''}`} style={{ background: c, width: 20, height: 20 }} onClick={() => updateField('color', c)}>
                        {product.color === c && <Icon name="check" size={10} />}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Main content */}
          {activeTab === 'pastas' ? (
            <div className="modal-main">
              <div className="modal-toolbar">
                <div className="toolbar-title">
                  <Icon name="folderFill" size={16} /> {activeFolder}
                  <span style={{ color: 'var(--text-3)', fontWeight: 400, marginLeft: 4 }}>· {folderCreatives.length} criativos</span>
                </div>
                <button className="btn btn-sm btn-primary" style={{ marginLeft: 'auto' }} onClick={() => addCreative(activeFolder)}>
                  <Icon name="plus" size={12} /> Adicionar
                </button>
              </div>
              <div className="modal-content">
                {folderCreatives.length === 0 ? (
                  <div className="empty">
                    <div className="empty-icon"><Icon name="folder" size={24} /></div>
                    <div className="empty-title">Pasta vazia</div>
                    <div className="empty-text">Adicione vídeos, imagens ou copies para a campanha {activeFolder}.</div>
                    <button className="btn btn-sm" style={{ marginTop: 16 }} onClick={() => addCreative(activeFolder)}>
                      <Icon name="upload" size={12} /> Adicionar criativo
                    </button>
                  </div>
                ) : (
                  <div className="creatives-grid">
                    {folderCreatives.map(c => (
                      <CreativeCard key={c.id} creative={c}
                        onUpdate={(u) => updateCreative(activeFolder, u)}
                        onDelete={() => deleteCreative(activeFolder, c.id)} />
                    ))}
                    <UploadCard onUpload={() => addCreative(activeFolder)} />
                  </div>
                )}
              </div>
            </div>
          ) : activeTab === 'metricas' ? (
            <MetricsTab product={product} onUpdate={onUpdate} />
          ) : (
            <ChecklistTab product={product} onUpdate={onUpdate} />
          )}

          {/* Aside */}
          <div className="modal-aside">
            <div className="aside-tabs">
              <button className={`aside-tab ${activeAside === 'comments' ? 'active' : ''}`} onClick={() => setActiveAside('comments')}>
                Comentários ({product.comments.length})
              </button>
              <button className={`aside-tab ${activeAside === 'history' ? 'active' : ''}`} onClick={() => setActiveAside('history')}>
                Histórico
              </button>
            </div>
            {activeAside === 'comments' ? (
              <>
                <div className="aside-body">
                  {product.comments.length === 0 ? (
                    <div className="empty" style={{ padding: '40px 8px' }}>
                      <div className="empty-icon" style={{ width: 40, height: 40 }}><Icon name="message" size={18} /></div>
                      <div className="empty-text">Sem comentários ainda.</div>
                    </div>
                  ) : product.comments.map(c => {
                    const author = users.find(u => u.id === c.authorId);
                    return (
                      <div key={c.id} className="comment">
                        <div className="comment-head" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <Avatar user={author} size={18} />
                          <span className="comment-author">{author?.name || c.author || 'Anônimo'}</span><span>·</span><span>{timeAgo(c.at)}</span>
                        </div>
                        <div className="comment-text"><MentionedText text={c.text} users={users} currentUserId={currentUser?.id} /></div>
                      </div>
                    );
                  })}
                </div>
                <div className="comment-input-wrap">
                  <MentionTextarea value={commentText} onChange={setCommentText} users={users}
                    placeholder="Comentar… use @ pra mencionar alguém"
                    onSubmit={addComment} />
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                    <span style={{ fontSize: 11, color: 'var(--text-3)' }}>@ pra mencionar · ⌘+Enter pra enviar</span>
                    <button className="btn btn-sm btn-primary" onClick={addComment} disabled={!commentText.trim()}>Comentar</button>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="history-filter">
                  <select value={historyFilter} onChange={e => setHistoryFilter(e.target.value)}>
                    <option value="all">Todos os eventos</option>
                    <option value="move">Movimentações</option>
                    <option value="metric">Métricas</option>
                    <option value="create">Criação</option>
                  </select>
                </div>
                <div className="aside-body">
                  {filteredHistory.length === 0 ? (
                    <div className="empty" style={{ padding: '40px 8px' }}><div className="empty-text">Sem eventos.</div></div>
                  ) : filteredHistory.map(h => {
                    const by = users.find(u => u.id === h.byId);
                    return (
                      <div key={h.id} className="history-item">
                        <div className={`history-dot ${h.type || ''}`} />
                        <div style={{ flex: 1 }}>
                          <div className="history-text">{h.text}</div>
                          <div className="history-time" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                            {by && <Avatar user={by} size={14} />}
                            <span>{by ? `${by.name} · ` : ''}{timeAgo(h.at)}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

window.ProductModal = ProductModal;
