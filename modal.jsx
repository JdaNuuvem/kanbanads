// Product modal — shell with tabs (Pastas / Métricas / Checklist) + sidebar + aside
// ALL mutations go through the API now
const ProductModal = ({ product, users = [], currentUser, onClose, onUpdate, onDelete, onDuplicate }) => {
  const [activeTab, setActiveTab] = React.useState('pastas');
  const [activeFolder, setActiveFolder] = React.useState('CA1');
  const [activeAside, setActiveAside] = React.useState('comments');
  const [historyFilter, setHistoryFilter] = React.useState('all');
  const [commentText, setCommentText] = React.useState('');
  const [editingLabels, setEditingLabels] = React.useState(false);
  const [showMenu, setShowMenu] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState(null);
  const [showLinkInput, setShowLinkInput] = React.useState(false);
  const [linkUrl, setLinkUrl] = React.useState('');
  const [linkName, setLinkName] = React.useState('');
  const [linkType, setLinkType] = React.useState('video');
  const [showAddFolder, setShowAddFolder] = React.useState(false);
  const [newFolderName, setNewFolderName] = React.useState('');
  const [folderList, setFolderList] = React.useState(() => window.folders?.length ? [...window.folders] : ['CA1', 'CA2', 'CA3', 'CA4', 'UPSELLS', 'SOURCES', 'VARIAÇÕES']);

  const isAdmin = currentUser?.role === 'admin' || currentUser?.role === 'gestor';

  const refreshFolders = () => {
    const list = window.folders?.length ? [...window.folders] : ['CA1', 'CA2', 'CA3', 'CA4', 'UPSELLS', 'SOURCES', 'VARIAÇÕES'];
    setFolderList(list);
    if (!list.includes(activeFolder)) setActiveFolder(list[0] || 'CA1');
  };

  const handleAddFolder = async (name) => {
    const folderName = (name || newFolderName).trim().toUpperCase();
    if (!folderName) return;
    try {
      await apiFolders.create(product.workspaceId, folderName);
      const d = await apiFolders.list(product.workspaceId);
      window.folders = (d.folders || []).map((f) => f.name);
      refreshFolders();
      setNewFolderName('');
      setShowAddFolder(false);
    } catch { showError('Erro ao criar pasta'); }
  };

  const handleDeleteFolder = async (name) => {
    if (!confirm(`Excluir pasta "${name}" e todos os criativos dentro dela?`)) return;
    try {
      await apiFolders.remove(product.workspaceId, name);
      const d = await apiFolders.list(product.workspaceId);
      window.folders = (d.folders || []).map((f) => f.name);
      refreshFolders();
    } catch { showError('Erro ao excluir pasta'); }
  };

  const showError = (msg) => { setError(msg); setTimeout(() => setError(null), 5000); };

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

  // Update basic fields via API
  const updateField = async (field, value) => {
    const next = { ...product, [field]: value };
    onUpdate(next); // Optimistic UI
    try {
      const body = { [field]: value };
      await apiProducts.update(product.id, body);
    } catch (err) {
      showError(err.message);
      onUpdate(product); // Revert
    }
  };

  // Move stage via API
  const moveColumn = async (toCol) => {
    if (toCol === product.column) return;
    const colTitle = COLUMNS.find((c) => c.id === toCol)?.title || toCol;
    const next = {
      ...product,
      column: toCol,
      enteredColumnAt: new Date().toISOString(),
    };
    onUpdate(next);
    try {
      await apiProducts.moveStage(product.id, toCol);
    } catch (err) {
      showError(err.message);
      onUpdate(product);
    }
  };

  // Set assignees via API
  const setAssigneeIds = async (ids) => {
    const next = { ...product, assigneeIds: ids };
    onUpdate(next);
    try {
      await apiProducts.setAssignees(product.id, ids);
    } catch (err) {
      showError(err.message);
      onUpdate(product);
    }
  };

  // Save labels via API when closing label picker
  const saveLabels = async (labelIds) => {
    const next = { ...product, labels: labelIds };
    onUpdate(next);
    setEditingLabels(false);
    try {
      await apiProducts.setLabels(product.id, labelIds);
    } catch (err) {
      showError(err.message);
      onUpdate(product);
    }
  };

  const toggleLabel = (id) => {
    const next = product.labels.includes(id)
      ? product.labels.filter((x) => x !== id)
      : [...product.labels, id];
    onUpdate({ ...product, labels: next });
  };

  // Upload + create creative via API
  const addCreative = () => {
    const picker = document.createElement('input');
    picker.type = 'file';
    picker.accept = 'video/mp4,video/webm,video/quicktime,image/jpeg,image/png,image/gif,image/webp,.zip';
    picker.multiple = false;
    picker.onchange = async () => {
      const file = picker.files[0];
      if (!file) return;
      setSaving(true);
      try {
        // Upload file
        const formData = new FormData();
        formData.append('file', file);
        const uploadRes = await apiFetch('/uploads', {
          method: 'POST',
          headers: { Authorization: authHeader(getToken()) },
          body: formData,
        });
        const uploaded = await uploadRes.json();

        // Create creative in API
        const type = file.type.startsWith('video/') ? 'video' : file.type.startsWith('image/') ? 'image' : 'image';
        const data = await apiCreatives.create(product.id, {
          folder: activeFolder,
          name: file.name,
          type,
          version: 1,
          status: 'rascunho',
          size: formatSize(file.size),
          link: uploaded.url,
          tags: [],
        });

        // Get the full creative data back
        const fullProduct = await apiProducts.get(product.id);
        onUpdate(mapProductLocally(fullProduct.product));
      } catch (err) {
        showError(err.message || 'Erro no upload');
      } finally {
        setSaving(false);
      }
    };
    picker.click();
  };

  // Add creative via link (URL)
  const submitLink = async () => {
    if (!linkUrl.trim()) return;
    setSaving(true);
    try {
      await apiCreatives.create(product.id, {
        folder: activeFolder,
        name: linkName.trim() || linkUrl.split('/').pop() || 'link',
        type: linkType,
        version: 1,
        status: 'rascunho',
        size: '—',
        link: linkUrl.trim(),
        tags: [],
      });
      const fullProduct = await apiProducts.get(product.id);
      onUpdate(mapProductLocally(fullProduct.product));
      setShowLinkInput(false);
      setLinkUrl('');
      setLinkName('');
      setLinkType('video');
    } catch (err) {
      showError(err.message || 'Erro ao adicionar link');
    } finally {
      setSaving(false);
    }
  };

  // Update creative via API
  const updateCreative = async (folder, updated) => {
    // Optimistic
    const nextCreatives = { ...product.creatives };
    nextCreatives[folder] = (nextCreatives[folder] || []).map((c) => c.id === updated.id ? updated : c);
    onUpdate({ ...product, creatives: nextCreatives });
    try {
      await apiCreatives.update(updated.id, {
        name: updated.name,
        status: updated.status,
        link: updated.link,
        tags: updated.tags,
        body_text: updated.body_text,
      });
    } catch (err) {
      showError(err.message);
    }
  };

  // Delete creative via API
  const deleteCreative = async (folder, id) => {
    const nextCreatives = { ...product.creatives };
    nextCreatives[folder] = (nextCreatives[folder] || []).filter((c) => c.id !== id);
    onUpdate({ ...product, creatives: nextCreatives });
    try {
      await apiCreatives.remove(id);
    } catch (err) {
      showError(err.message);
    }
  };

  // Duplicate creative via API
  const duplicateCreative = async (folder, c) => {
    try {
      await apiCreatives.duplicate(c.id);
      const fullProduct = await apiProducts.get(product.id);
      onUpdate(mapProductLocally(fullProduct.product));
    } catch (err) {
      showError(err.message);
    }
  };

  // Add comment via API
  const addComment = async () => {
    if (!commentText.trim()) return;
    setSaving(true);
    try {
      await apiComments.create(product.id, commentText.trim());
      const fullProduct = await apiProducts.get(product.id);
      onUpdate(mapProductLocally(fullProduct.product));
      setCommentText('');
    } catch (err) {
      showError(err.message);
    } finally {
      setSaving(false);
    }
  };

  // Map API product to local format (shared with app.jsx)
  const mapProductLocally = (p) => ({
    id: p.id,
    name: p.name,
    column: p.stage_id,
    color: p.color || 'oklch(0.72 0.12 240)',
    favorite: p.favorite,
    startDate: p.start_date ? new Date(p.start_date).toISOString().slice(0, 10) : null,
    supplier: p.supplier || '',
    labels: (p.labels || []).map((l) => l.id),
    assigneeIds: (p.assignees || []).map((a) => a.id),
    createdById: p.created_by,
    creatives: (p.creatives || []).reduce((acc, c) => {
      if (!acc[c.folder]) acc[c.folder] = [];
      acc[c.folder].push({
        id: c.id, name: c.name, type: c.type, version: c.version,
        status: c.status, size: c.size, body_text: c.body_text,
        link: c.link, tags: c.tags || [],
        metrics: { ctr: String(c.ctr || '0.00'), cpm: String(c.cpm || '0.00'), spent: String(c.spent || '0.00') },
        addedAt: c.added_at,
      });
      return acc;
    }, {}),
    comments: (p.comments || []).map((c) => ({
      id: c.id, authorId: c.author_id, text: c.body,
      mentions: (c.mentions || []).map((m) => m.user_id), at: c.created_at,
    })),
    metrics: p.metrics || [],
    checklist: p.checklist || {},
    history: (p.history || []).map((h) => ({ id: h.id, text: h.text, at: h.at, type: h.type, byId: h.by_id })),
    enteredColumnAt: p.entered_stage_at,
  });

  const formatSize = (bytes) => {
    if (!bytes) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    let i = 0;
    let size = bytes;
    while (size >= 1024 && i < units.length - 1) { size /= 1024; i++; }
    return `${size.toFixed(1)} ${units[i]}`;
  };

  const colIdx = COLUMNS.findIndex((c) => c.id === product.column);
  const goPrev = () => colIdx > 0 && moveColumn(COLUMNS[colIdx - 1].id);
  const goNext = () => colIdx < COLUMNS.length - 1 && moveColumn(COLUMNS[colIdx + 1].id);

  const folderCreatives = product.creatives[activeFolder] || [];
  const currentLabels = product.labels.map((id) => LABEL_OPTIONS.find((l) => l.id === id)).filter(Boolean);
  const daysInStage = daysSince(product.enteredColumnAt);
  const checklistItems = STAGE_CHECKLISTS[product.column] || [];
  const checklistDone = checklistItems.filter((i) => product.checklist?.[i.id]).length;
  const filteredHistory = product.history.filter((h) => historyFilter === 'all' || h.type === historyFilter);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        {error && (
          <div className="toast toast-error" style={{ margin: '8px 20px 0' }}>
            <Icon name="warning" size={14} /> {error}
          </div>
        )}
        <div className="modal-header">
          <div className="card-avatar" style={{ background: product.color || 'var(--text-3)', width: 28, height: 28, fontSize: 12 }}>{product.name.charAt(0).toUpperCase()}</div>
          <button className={`card-fav ${product.favorite ? 'active' : ''}`} onClick={() => updateField('favorite', !product.favorite)} style={{ width: 28, height: 28 }}>
            <Icon name={product.favorite ? 'starFill' : 'star'} size={18} />
          </button>
          <input className="modal-title-input" value={product.name} onChange={(e) => onUpdate({ ...product, name: e.target.value })} onBlur={(e) => updateField('name', e.target.value)} />
          <span className="card-time-badge" title={`${daysInStage} dias em ${COLUMNS.find((c) => c.id === product.column)?.title}`}>
            {daysInStage}d em {COLUMNS.find((c) => c.id === product.column)?.title}
          </span>
          <button className="btn btn-sm btn-ghost btn-icon" onClick={goPrev} disabled={colIdx === 0} title="Estágio anterior"><Icon name="arrowLeft" size={14} /></button>
          <button className="btn btn-sm btn-ghost btn-icon" onClick={goNext} disabled={colIdx === COLUMNS.length - 1} title="Próximo estágio"><Icon name="arrowRight" size={14} /></button>
          <div className="card-labels">
            {currentLabels.map((l) => (
              <span key={l.id} className="label" style={{ background: `color-mix(in oklch, ${l.color} 20%, transparent)`, color: l.color }}>{l.name}</span>
            ))}
            <button className="btn btn-sm btn-ghost" onClick={() => setEditingLabels(!editingLabels)}><Icon name="plus" size={12} /> Label</button>
          </div>
          <div style={{ position: 'relative' }}>
            <button className="btn btn-ghost btn-icon" onClick={() => setShowMenu(!showMenu)}><Icon name="moreH" size={16} /></button>
            {showMenu && (
              <div className="popover" style={{ right: 0, top: 38 }} onMouseLeave={() => setShowMenu(false)}>
                {COLUMNS.map((c) => (
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
              {LABEL_OPTIONS.map((l) => {
                const active = product.labels.includes(l.id);
                return (
                  <button key={l.id} className={`label-chip ${active ? 'active' : ''}`}
                    style={active ? { background: `color-mix(in oklch, ${l.color} 25%, transparent)`, color: l.color } : {}}
                    onClick={() => toggleLabel(l.id)}>{l.name}</button>
                );
              })}
            </div>
            <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
              <button className="btn btn-sm" onClick={() => { onUpdate({ ...product, labels: product.labels }); setEditingLabels(false); }}>Cancelar</button>
              <button className="btn btn-sm btn-primary" onClick={() => saveLabels(product.labels)}>Salvar labels</button>
            </div>
          </div>
        )}

        <div className="modal-tabs">
          <button className={`modal-tab ${activeTab === 'pastas' ? 'active' : ''}`} onClick={() => setActiveTab('pastas')}><Icon name="folder" size={14} /> Pastas</button>
          <button className={`modal-tab ${activeTab === 'metricas' ? 'active' : ''}`} onClick={() => setActiveTab('metricas')}><Icon name="target" size={14} /> Métricas</button>
          <button className={`modal-tab ${activeTab === 'checklist' ? 'active' : ''}`} onClick={() => setActiveTab('checklist')}><Icon name="check" size={14} /> Checklist</button>
        </div>

        <div className="modal-body">
            {activeTab === 'pastas' && (
            <div className="modal-sidebar">
              <div className="sidebar-section">
                <div className="sidebar-section-title">
                  Pastas
                  <FolderManager folderList={folderList} activeFolder={activeFolder} onAdd={handleAddFolder} onDelete={handleDeleteFolder} isAdmin={isAdmin} />
                </div>
                <div className="folder-list">
                  {folderList.map((f) => {
                    const count = product.creatives[f]?.length || 0;
                    return (
                      <div key={f} className={`folder-item ${activeFolder === f ? 'active' : ''}`} onClick={() => setActiveFolder(f)}>
                        <Icon name="folder" size={14} className="folder-icon" />
                        <span>{f}</span>
                        <span className="folder-count">{count}</span>
                        {folderList.length > 1 && (
                          <button className="btn btn-sm btn-ghost btn-icon folder-delete-btn"
                            onClick={(e) => { e.stopPropagation(); handleDeleteFolder(f); }}
                            title="Excluir pasta">
                            <Icon name="x" size={10} />
                          </button>
                        )}
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
                  <input className="meta-input" type="date" value={product.startDate || ''} onChange={(e) => updateField('startDate', e.target.value)} />
                </div>
                <div className="meta-field">
                  <div className="meta-label">Fornecedor</div>
                  <input className="meta-input" type="url" placeholder="https://..." value={product.supplier || ''} onChange={(e) => onUpdate({ ...product, supplier: e.target.value })} onBlur={(e) => updateField('supplier', e.target.value)} />
                  {product.supplier && <a className="meta-link" href={product.supplier} target="_blank" rel="noreferrer">Abrir →</a>}
                </div>
                <div className="meta-field">
                  <div className="meta-label">Cor</div>
                  <div className="color-picker">
                    {['oklch(0.72 0.12 240)', 'oklch(0.72 0.14 340)', 'oklch(0.78 0.14 80)', 'oklch(0.72 0.14 160)', 'oklch(0.72 0.14 30)', 'oklch(0.72 0.14 300)', 'oklch(0.82 0.16 90)', 'oklch(0.78 0.16 135)'].map((c) => (
                      <div key={c} className={`color-swatch ${product.color === c ? 'active' : ''}`} style={{ background: c, width: 20, height: 20 }} onClick={() => updateField('color', c)}>
                        {product.color === c && <Icon name="check" size={10} />}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'pastas' ? (
            <div className="modal-main">
              <div className="modal-toolbar">
                <div className="toolbar-title">
                  <Icon name="folderFill" size={16} /> {activeFolder}
                  <span style={{ color: 'var(--text-3)', fontWeight: 400, marginLeft: 4 }}>· {folderCreatives.length} criativos</span>
                </div>
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
                  {showLinkInput ? (
                    <>
                      <input className="meta-input" style={{ width: 240 }} placeholder="https://..." value={linkUrl} onChange={e => setLinkUrl(e.target.value)} autoFocus />
                      <input className="meta-input" style={{ width: 140 }} placeholder="Nome (opcional)" value={linkName} onChange={e => setLinkName(e.target.value)} />
                      <select value={linkType} onChange={e => setLinkType(e.target.value)}
                        style={{ background: 'var(--bg-1)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text-0)', fontSize: 12, padding: '4px 6px' }}>
                        <option value="video">Vídeo</option>
                        <option value="image">Imagem</option>
                      </select>
                      <button className="btn btn-sm btn-primary" onClick={submitLink} disabled={saving || !linkUrl.trim()}>
                        <Icon name="check" size={12} /> {saving ? 'Salvando...' : 'Salvar'}
                      </button>
                      <button className="btn btn-sm btn-ghost" onClick={() => { setShowLinkInput(false); setLinkUrl(''); setLinkName(''); }}>
                        Cancelar
                      </button>
                    </>
                  ) : (
                    <>
                      <button className="btn btn-sm btn-primary" onClick={addCreative} disabled={saving}>
                        <Icon name="upload" size={12} /> {saving ? 'Enviando...' : 'Upload'}
                      </button>
                      <button className="btn btn-sm btn-ghost" onClick={() => setShowLinkInput(true)}>
                        <Icon name="link" size={12} /> Link
                      </button>
                    </>
                  )}
                </div>
              </div>
              <div className="modal-content">
                {folderCreatives.length === 0 ? (
                  <div className="empty">
                    <div className="empty-icon"><Icon name="folder" size={24} /></div>
                    <div className="empty-title">Pasta vazia</div>
                    <div className="empty-text">Adicione vídeos, imagens ou copies para a campanha {activeFolder}.</div>
                    <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
                      <button className="btn btn-sm" onClick={addCreative}><Icon name="upload" size={12} /> Upload</button>
                      <button className="btn btn-sm" onClick={() => setShowLinkInput(true)}><Icon name="link" size={12} /> Link</button>
                    </div>
                  </div>
                ) : (
                  <div className="creatives-grid">
                    {folderCreatives.map((c) => (
                      <CreativeCard key={c.id} creative={c}
                        onUpdate={(u) => updateCreative(activeFolder, u)}
                        onDelete={() => deleteCreative(activeFolder, c.id)} />
                    ))}
                    <UploadCard onUpload={addCreative} onLinkClick={() => setShowLinkInput(true)} />
                  </div>
                )}
              </div>
            </div>
          ) : activeTab === 'metricas' ? (
            <MetricsTab product={product} onUpdate={onUpdate} />
          ) : (
            <ChecklistTab product={product} onUpdate={onUpdate} />
          )}

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
                  ) : product.comments.map((c) => {
                    const author = users.find((u) => u.id === c.authorId);
                    return (
                      <div key={c.id} className="comment">
                        <div className="comment-head" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <Avatar user={author} size={18} />
                          <span className="comment-author">{author?.name || 'Anônimo'}</span><span>·</span><span>{timeAgo(c.at)}</span>
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
                    <button className="btn btn-sm btn-primary" onClick={addComment} disabled={!commentText.trim() || saving}>Comentar</button>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="history-filter">
                  <select value={historyFilter} onChange={(e) => setHistoryFilter(e.target.value)}>
                    <option value="all">Todos os eventos</option>
                    <option value="move">Movimentações</option>
                    <option value="metric">Métricas</option>
                    <option value="create">Criação</option>
                  </select>
                </div>
                <div className="aside-body">
                  {filteredHistory.length === 0 ? (
                    <div className="empty" style={{ padding: '40px 8px' }}><div className="empty-text">Sem eventos.</div></div>
                  ) : filteredHistory.map((h) => {
                    const by = users.find((u) => u.id === h.byId);
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

const FolderManager = ({ folderList, activeFolder, onAdd, onDelete, isAdmin }) => {
  if (!isAdmin) return null;

  const [showInput, setShowInput] = React.useState(false);
  const [newName, setNewName] = React.useState('');

  const handleAdd = () => {
    if (!newName.trim()) return;
    onAdd(newName);
    setNewName('');
    setShowInput(false);
  };

  return (
    <span style={{ marginLeft: 'auto', display: 'flex', gap: 4, alignItems: 'center' }}>
      {showInput ? (
        <>
          <input
            className="meta-input"
            style={{ width: 80, height: 22, fontSize: 11, padding: '0 4px' }}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); if (e.key === 'Escape') setShowInput(false); }}
            placeholder="NOME"
            autoFocus
          />
          <button className="btn btn-sm btn-ghost btn-icon" onClick={handleAdd} title="Confirmar"><Icon name="check" size={12} /></button>
          <button className="btn btn-sm btn-ghost btn-icon" onClick={() => setShowInput(false)} title="Cancelar"><Icon name="x" size={12} /></button>
        </>
      ) : (
        <>
          <button className="btn btn-sm btn-ghost btn-icon" onClick={() => setShowInput(true)} title="Adicionar pasta"><Icon name="plus" size={12} /></button>
        </>
      )}
    </span>
  );
};

window.ProductModal = ProductModal;
