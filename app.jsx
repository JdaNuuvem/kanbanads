// Main app with API backend, SSE realtime, JWT auth
const { useState, useEffect, useMemo, useCallback } = React;

const App = () => {
  // ---- Auth ----
  const [currentUser, setCurrentUser] = useState(() => {
    // Try auto-login from token
    const token = getToken();
    if (!token) return null;
    // Will validate with /me API
    return null;
  });
  const [authChecked, setAuthChecked] = useState(false);

  // ---- Data ----
  const [products, setProducts] = useState([]);
  const [users, setUsers] = useState([]);
  const [workspaces, setWorkspaces] = useState([]);
  const [currentWorkspace, setCurrentWorkspace] = useState(null);
  const [activity, setActivity] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // ---- UI state ----
  const [view, setView] = useState('kanban');
  const [compact, setCompact] = useState(false);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput), 200);
    return () => clearTimeout(timer);
  }, [searchInput]);
  const [favOnly, setFavOnly] = useState(false);
  const [mineOnly, setMineOnly] = useState(false);
  const [labelFilter, setLabelFilter] = useState([]);
  const [openProductId, setOpenProductId] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [addDefaultColumn, setAddDefaultColumn] = useState('separados');
  const [draggingId, setDraggingId] = useState(null);
  const [dragOverColumn, setDragOverColumn] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showActivity, setShowActivity] = useState(false);
  const [showManageTeam, setShowManageTeam] = useState(false);
  const [showCreateWs, setShowCreateWs] = useState(false);
  const [showManageWs, setShowManageWs] = useState(false);
  const [checklistPopupId, setChecklistPopupId] = useState(null);

  // ---- Auto-login check ----
  useEffect(() => {
    const token = getToken();
    if (token) {
      apiUsers.me()
        .then((data) => {
          setCurrentUser(data.user);
          sseClient.connect();
        })
        .catch(() => { clearToken(); })
        .finally(() => setAuthChecked(true));
    } else {
      setAuthChecked(true);
    }
  }, []);

  // ---- Load data after auth ----
  useEffect(() => {
    if (!currentUser || !authChecked) return;

    const loadAll = async () => {
      setLoading(true);
      setError(null);
      try {
        const workspacesData = await apiWorkspaces.list();
        const wsList = workspacesData.workspaces || [];
        setWorkspaces(wsList);

        let usersList = [];
        try {
          const usersData = await apiUsers.list();
          usersList = usersData.users || [];
        } catch {
          usersList = [currentUser];
        }
        setUsers(usersList);

        // Set current workspace: prefer last selected from localStorage, else default, else first
        const storedWsId = (() => { try { return localStorage.getItem('kanban_current_ws'); } catch { return null; } })();
        let activeWs = null;
        if (storedWsId) {
          activeWs = wsList.find((w) => w.id === storedWsId);
        }
        if (!activeWs) {
          activeWs = wsList.find((w) => w.is_default) || wsList[0];
        }
        if (activeWs) {
          setCurrentWorkspace(activeWs);
          localStorage.setItem('kanban_current_ws', activeWs.id);
        }

        // Load products and activity for the active workspace
        if (activeWs) {
          const [productsData, activityData, notifsData, foldersData] = await Promise.all([
            apiProducts.list({ workspace_id: activeWs.id, limit: 500 }),
            apiActivity.list({ workspace_id: activeWs.id, limit: 50 }),
            apiNotifications.list({ limit: 100 }),
            apiFolders.list(activeWs.id),
          ]);
          setProducts((productsData.products || []).map(mapProduct));
          setActivity(activityData.activity || []);
          setNotifications(notifsData.notifications || []);
          const folderNames = (foldersData.folders || []).map((f) => f.name);
          window.folders = folderNames;
        }
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    loadAll();
  }, [currentUser, authChecked]);

  // ---- SSE listeners ----
  useEffect(() => {
    if (!currentUser) return;

    const onNotification = () => {
      apiNotifications.list({ limit: 100 }).then((d) => setNotifications(d.notifications || [])).catch(() => {});
    };

    const onActivity = (data) => {
      if (currentWorkspace && data?.workspace_id && data.workspace_id !== currentWorkspace.id) return;
      const wsId = currentWorkspace?.id;
      apiActivity.list({ workspace_id: wsId, limit: 50 }).then((d) => setActivity(d.activity || [])).catch(() => {});
    };

    const onProductUpdated = (data) => {
      if (!data.product_id) return;
      apiProducts.get(data.product_id).then((d) => {
        if (!d?.product) return;
        setProducts((prev) => {
          const idx = prev.findIndex((p) => p.id === d.product.id);
          if (idx === -1) return prev;
          const next = [...prev];
          next[idx] = mapProduct(d.product);
          return next;
        });
      }).catch(() => {});
    };

    const onProductCreated = (data) => {
      if (currentWorkspace && data?.workspace_id && data.workspace_id !== currentWorkspace.id) return;
      if (!data.product_id) return;
      apiProducts.get(data.product_id).then((d) => {
        if (!d?.product) return;
        setProducts((prev) => {
          if (prev.some((p) => p.id === d.product.id)) return prev;
          return [...prev, mapProduct(d.product)];
        });
      }).catch(() => {});
    };

    const onProductDeleted = (data) => {
      setProducts((prev) => prev.filter((p) => p.id !== data.product_id));
    };

    const onFoldersUpdated = (data) => {
      if (currentWorkspace && data?.workspace_id && data.workspace_id !== currentWorkspace.id) return;
      apiFolders.list(currentWorkspace?.id).then((d) => {
        window.folders = (d.folders || []).map((f) => f.name);
      }).catch(() => {});
    };

    sseClient.on('notification.new', onNotification);
    sseClient.on('activity.new', onActivity);
    sseClient.on('product.updated', onProductUpdated);
    sseClient.on('product.created', onProductCreated);
    sseClient.on('product.deleted', onProductDeleted);
    sseClient.on('folders.updated', onFoldersUpdated);

    return () => {
      sseClient.off('notification.new', onNotification);
      sseClient.off('activity.new', onActivity);
      sseClient.off('product.updated', onProductUpdated);
      sseClient.off('product.created', onProductCreated);
      sseClient.off('product.deleted', onProductDeleted);
      sseClient.off('folders.updated', onFoldersUpdated);
    };
  }, [currentUser, currentWorkspace]);

  // ---- Map API product to frontend format ----
  const mapProduct = (p) => ({
    id: p.id,
    name: p.name,
    column: p.stage_id,
    workspaceId: p.workspace_id,
    color: p.color || 'oklch(0.72 0.12 240)',
    favorite: p.favorite,
    startDate: p.start_date ? new Date(p.start_date).toISOString().slice(0, 10) : null,
    supplier: p.supplier || '',
    labels: (p.labels || []).map((l) => l.id),
    assigneeIds: (p.assignees || []).map((a) => a.id),
    createdById: p.created_by,
    reserved_by: p.reserved_by,
    reserved_by_name: p.reserved_by_name,
    reserved_at: p.reserved_at,
    creatives: p.creatives || {},
    comments: (p.comments || []).map((c) => ({
      id: c.id,
      authorId: c.author_id,
      text: c.body,
      mentions: (c.mentions || []).map((m) => m.user_id),
      at: c.created_at,
      editedAt: c.edited_at,
    })),
    metrics: p.metrics || [],
    checklist: p.checklist || {},
    history: (p.history || []).map((h) => ({
      id: h.id,
      text: h.text,
      at: h.at,
      type: h.type,
      byId: h.by_id,
    })),
    enteredColumnAt: p.entered_stage_at,
    archivedAt: p.archived_at,
  });

  const openProduct = products.find((p) => p.id === openProductId);

  // Keyboard shortcuts
  useEffect(() => {
    if (!currentUser) return;
    const h = (e) => {
      if (e.target.matches('input, textarea, select')) return;
      if (e.key === '/') { e.preventDefault(); document.querySelector('.search input')?.focus(); }
      if (e.key === 'n' && !e.metaKey && !e.ctrlKey) { e.preventDefault(); setShowAdd(true); }
      if (e.key === 'k' && !e.metaKey && !e.ctrlKey) setView('kanban');
      if (e.key === 't' && !e.metaKey && !e.ctrlKey) setView('table');
      if (e.key === 'd' && !e.metaKey && !e.ctrlKey) setView('dashboard');
      if (e.key === 'm' && !e.metaKey && !e.ctrlKey) setMineOnly((v) => !v);
    };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [currentUser]);

  const filtered = useMemo(() => products.filter((p) => {
    if (favOnly && !p.favorite) return false;
    if (mineOnly && !(p.assigneeIds || []).includes(currentUser?.id)) return false;
    if (labelFilter.length > 0 && !labelFilter.some((l) => p.labels.includes(l))) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return p.name.toLowerCase().includes(q) ||
           p.labels.some((l) => (LABEL_OPTIONS.find((opt) => opt.id === l)?.name || '').toLowerCase().includes(q));
  }), [products, search, favOnly, mineOnly, labelFilter, currentUser]);

  const updateProduct = useCallback((next) => {
    setProducts((prev) => prev.map((p) => p.id === next.id ? next : p));
  }, []);

  const moveProduct = useCallback(async (id, toColumn) => {
    const target = products.find((p) => p.id === id);
    if (!target || target.column === toColumn) return;

    const colTitle = COLUMNS.find((c) => c.id === toColumn)?.title || toColumn;

    // Optimistic update
    setProducts((prev) => prev.map((p) => {
      if (p.id !== id) return p;
      return {
        ...p, column: toColumn, enteredColumnAt: new Date().toISOString(),
        history: [{ id: 'h' + Date.now(), text: `Movido para ${colTitle}`, at: new Date().toISOString(), type: 'move', byId: currentUser?.id }, ...p.history],
      };
    }));

    try {
      await apiProducts.moveStage(id, toColumn);
      if (currentWorkspace) {
        apiActivity.list({ workspace_id: currentWorkspace.id, limit: 50 }).then((d) => setActivity(d.activity || [])).catch(() => {});
      }
    } catch (err) {
      setError(err.message);
      if (currentWorkspace) {
        apiProducts.list({ workspace_id: currentWorkspace.id, limit: 500 }).then((d) => setProducts(d.products.map(mapProduct))).catch(() => {});
      }
    }
  }, [products, currentUser, currentWorkspace]);

  const handleDragStart = (e, product) => {
    setDraggingId(product.id);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', product.id);
  };
  const handleDragEnd = () => { setDraggingId(null); setDragOverColumn(null); };
  const handleColumnDragOver = (e, columnId) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; if (dragOverColumn !== columnId) setDragOverColumn(columnId); };
  const handleColumnDrop = (e, columnId) => {
    e.preventDefault();
    const id = e.dataTransfer.getData('text/plain') || draggingId;
    if (id) moveProduct(id, columnId);
    setDragOverColumn(null); setDraggingId(null);
  };

  const handleCreate = async ({ name, column, supplier, startDate, labels, color, assigneeIds }) => {
    if (!currentWorkspace) return;
    try {
      const data = await apiProducts.create({
        name,
        stage_id: column,
        workspace_id: currentWorkspace.id,
        color: color || 'oklch(0.72 0.12 240)',
        start_date: startDate || undefined,
        supplier: supplier || undefined,
        label_ids: labels || [],
        assignee_ids: assigneeIds || [],
      });

      setProducts((prev) => [...prev, mapProduct(data.product)]);
      apiActivity.list({ workspace_id: currentWorkspace.id, limit: 50 }).then((d) => setActivity(d.activity || [])).catch(() => {});
      setShowAdd(false);
    } catch (err) {
      setError(err.message);
    }
  };

  const duplicateProduct = async (p) => {
    try {
      const data = await apiProducts.duplicate(p.id);
      setProducts((prev) => [...prev, mapProduct(data.product)]);
      setOpenProductId(null);
    } catch (err) {
      setError(err.message);
    }
  };

  const toggleFavorite = async (id) => {
    const product = products.find((pp) => pp.id === id);
    if (!product) return;
    setProducts((prev) => prev.map((pp) => pp.id === id ? { ...pp, favorite: !pp.favorite } : pp));
    try {
      await apiProducts.update(id, { favorite: !product.favorite });
    } catch (err) {
      setError(err.message);
      setProducts((prev) => prev.map((pp) => pp.id === id ? { ...pp, favorite: product.favorite } : pp));
    }
  };

  const toggleReserve = async (id) => {
    const product = products.find((pp) => pp.id === id);
    if (!product) return;
    try {
      if (product.reserved_by) {
        await apiProducts.release(id);
        setProducts((prev) => prev.map((pp) => pp.id === id ? { ...pp, reserved_by: null, reserved_by_name: null, reserved_at: null } : pp));
      } else {
        await apiProducts.reserve(id);
        setProducts((prev) => prev.map((pp) => pp.id === id ? { ...pp, reserved_by: currentUser.id, reserved_by_name: currentUser.name, reserved_at: new Date().toISOString() } : pp));
      }
    } catch (err) {
      setError(err.message);
    }
  };

  const deleteProduct = async (id) => {
    try {
      await apiProducts.remove(id);
      setProducts((prev) => prev.filter((pp) => pp.id !== id));
      setOpenProductId(null);
    } catch (err) {
      setError(err.message);
    }
  };

  const updateProductWithActivity = async (next) => {
    setProducts((list) => list.map((p) => p.id === next.id ? next : p));
    // In API mode, the activity is created server-side. Just refresh.
    if (currentWorkspace) {
      apiActivity.list({ workspace_id: currentWorkspace.id, limit: 50 }).then((d) => setActivity(d.activity || [])).catch(() => {});
    }
  };

  const productsByColumn = (colId) => filtered.filter((p) => p.column === colId);

  const exportData = async () => {
    try {
      const data = await apiExportImport.export();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `kanban-ads-${new Date().toISOString().slice(0, 10)}.json`;
      a.click(); URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.message);
    }
  };

  const importData = () => {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = 'application/json';
    input.onchange = async (e) => {
      const file = e.target.files[0]; if (!file) return;
      try {
        const text = await file.text();
        const json = JSON.parse(text);
        if (json.products && Array.isArray(json.products)) {
          if (confirm(`Importar ${json.products.length} produtos?`)) {
            await apiExportImport.import(json);
            if (currentWorkspace) {
              const data = await apiProducts.list({ workspace_id: currentWorkspace.id, limit: 500 });
              setProducts(data.products.map(mapProduct));
            }
          }
        }
      } catch (err) {
        setError(err.message);
      }
    };
    input.click();
  };

  const clearAll = () => {
    if (confirm('Apagar TODOS os produtos? Essa ação não pode ser desfeita.')) {
      // Delete all individually
      Promise.all(products.map((p) => apiProducts.remove(p.id).catch(() => {})))
        .then(() => setProducts([]))
        .catch((err) => setError(err.message));
    }
  };

  const toggleLabelFilter = (id) => setLabelFilter((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);

  const handleLogout = () => {
    apiAuth.logout();
    setCurrentUser(null);
    setCurrentWorkspace(null);
    setProducts([]);
    setActivity([]);
    setNotifications([]);
  };

  const handleSwitchWorkspace = async (ws) => {
    if (!ws || ws.id === currentWorkspace?.id) return;

    setCurrentWorkspace(ws);
    localStorage.setItem('kanban_current_ws', ws.id);
    setLoading(true);
    try {
      const [productsData, activityData, foldersData] = await Promise.all([
        apiProducts.list({ workspace_id: ws.id, limit: 500 }),
        apiActivity.list({ workspace_id: ws.id, limit: 50 }),
        apiFolders.list(ws.id),
      ]);
      setProducts((productsData.products || []).map(mapProduct));
      setActivity(activityData.activity || []);
      const folderNames = (foldersData.folders || []).map((f) => f.name);
      window.folders = folderNames;
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateWorkspace = (newWs) => {
    setWorkspaces((prev) => [...prev, { ...newWs, product_count: 0, my_role: 'owner', members: [] }]);
    handleSwitchWorkspace(newWs);
  };

  const handleWorkspaceUpdated = async (updated) => {
    if (updated === '__deleted__') {
      // Workspace was deleted, switch to another
      const remaining = workspaces.filter((w) => w.id !== currentWorkspace?.id);
      setWorkspaces(remaining);
      if (remaining.length > 0) {
        handleSwitchWorkspace(remaining.find((w) => w.is_default) || remaining[0]);
      }
      setShowManageWs(false);
      return;
    }
    if (updated === null) {
      // User left the workspace
      const remaining = workspaces.filter((w) => w.id !== currentWorkspace?.id);
      setWorkspaces(remaining);
      if (remaining.length > 0) {
        handleSwitchWorkspace(remaining[0]);
      }
      setShowManageWs(false);
      return;
    }
    // Update workspace in list
    setWorkspaces((prev) => prev.map((w) => w.id === updated.id ? { ...w, ...updated } : w));
    if (currentWorkspace?.id === updated.id) {
      setCurrentWorkspace((prev) => ({ ...prev, ...updated }));
    }
  };

  const handleLogin = (user) => {
    setCurrentUser(user);
  };

  // Show loading skeleton
  if (!authChecked) {
    return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-3)' }}>Carregando...</div>;
  }

  // Show login screen if no user
  if (!currentUser) {
    return <LoginScreen onLogin={handleLogin} />;
  }

  if (loading && products.length === 0) {
    return (
      <div className="app" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <div style={{ textAlign: 'center', color: 'var(--text-3)' }}>
          <div className="brand-dot" style={{ margin: '0 auto 16px' }}>K</div>
          <p>Carregando dados...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      {error && (
        <div className="toast toast-error" style={{ position: 'fixed', top: 12, right: 12, zIndex: 9999, maxWidth: 400 }}>
          <Icon name="warning" size={14} /> {error}
          <button style={{ marginLeft: 12, background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: 14 }}
            onClick={() => setError(null)}>×</button>
        </div>
      )}

      <div className="topbar">
        <div className="brand">
          <div className="brand-dot">K</div>
          <span>Kanban</span>
          <span className="brand-sub">/ Ads & Dropshipping</span>
        </div>

        <WorkspaceSwitcher
          workspaces={workspaces}
          currentWorkspace={currentWorkspace}
          onSwitch={handleSwitchWorkspace}
          onCreate={() => setShowCreateWs(true)}
          onManage={() => setShowManageWs(true)}
        />

        <div className="view-tabs">
          <button className={`view-tab ${view === 'kanban' ? 'active' : ''}`} onClick={() => setView('kanban')} title="K"><Icon name="layers" size={13} /> Kanban</button>
          <button className={`view-tab ${view === 'table' ? 'active' : ''}`} onClick={() => setView('table')} title="T"><Icon name="filter" size={13} /> Tabela</button>
          <button className={`view-tab ${view === 'dashboard' ? 'active' : ''}`} onClick={() => setView('dashboard')} title="D"><Icon name="target" size={13} /> Dashboard</button>
        </div>

        <div className="search">
          <span className="search-icon"><Icon name="search" size={14} /></span>
          <input placeholder="Buscar… ( / )" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} />
        </div>

        <div className="topbar-actions">
          <button className={`btn btn-sm ${mineOnly ? '' : 'btn-ghost'}`} onClick={() => setMineOnly((v) => !v)}
            title="Somente meus produtos (M)"
            style={mineOnly ? { color: currentUser?.color, borderColor: 'transparent', background: `color-mix(in oklch, ${currentUser?.color} 18%, transparent)` } : {}}>
            <Avatar user={currentUser} size={16} /> Meus
          </button>
          <button className={`btn btn-sm ${favOnly ? '' : 'btn-ghost'}`} onClick={() => setFavOnly((v) => !v)}
            style={favOnly ? { color: 'var(--warn)', borderColor: 'var(--warn-dim)', background: 'var(--warn-dim)' } : {}}>
            <Icon name={favOnly ? 'starFill' : 'star'} size={14} />Favoritos
          </button>
          <button className="btn btn-sm btn-ghost btn-icon" onClick={() => setCompact((v) => !v)} title="Modo compacto">
            <Icon name={compact ? 'eye' : 'box'} size={14} />
          </button>
          <div style={{ position: 'relative' }}>
            <button className="btn btn-sm btn-ghost btn-icon" onClick={() => setShowSettings(!showSettings)}><Icon name="settings" size={14} /></button>
            {showSettings && (
              <div className="popover" style={{ right: 0, top: 38 }} onMouseLeave={() => setShowSettings(false)}>
                <div className="popover-item" onClick={() => { exportData(); setShowSettings(false); }}><Icon name="upload" size={14} /> Exportar JSON</div>
                <div className="popover-item" onClick={() => { importData(); setShowSettings(false); }}><Icon name="folder" size={14} /> Importar JSON</div>
                <div className="popover-divider" />
                <div className="popover-item danger" onClick={() => { clearAll(); setShowSettings(false); }}><Icon name="trash" size={14} /> Limpar tudo</div>
              </div>
            )}
          </div>
          <button className="btn btn-primary btn-sm" onClick={() => { setAddDefaultColumn('separados'); setShowAdd(true); }}>
            <Icon name="plus" size={14} /> Novo (N)
          </button>
          <div style={{ width: 1, height: 22, background: 'var(--border)', margin: '0 4px' }} />
          <button className="btn btn-sm btn-ghost btn-icon" onClick={() => setShowActivity(true)} title="Atividade da equipe">
            <Icon name="history" size={14} />
          </button>
          <NotificationsBell
            notifications={notifications}
            activity={activity}
            users={users}
            currentUserId={currentUser?.id}
            onMarkRead={(id) => { apiNotifications.markRead(id).catch(() => {}); setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, read: true } : n)); }}
            onMarkAllRead={() => { apiNotifications.markAllRead().catch(() => {}); setNotifications((prev) => prev.map((n) => n.userId === currentUser?.id ? { ...n, read: true } : n)); }}
            onOpenProduct={(id) => setOpenProductId(id)}
            onClear={() => setNotifications((prev) => prev.filter((n) => n.userId !== currentUser?.id))}
          />
          <UserSwitcher
            users={users}
            currentUser={currentUser}
            onSwitch={(id) => setCurrentUser(users.find((u) => u.id === id))}
            onLogout={handleLogout}
            onManage={() => setShowManageTeam(true)}
            onManageWs={() => setShowManageWs(true)}
          />
        </div>
      </div>

      {/* Stats */}
      {view === 'kanban' && (
        <div className="stats">
          {COLUMNS.map((c) => (
            <div key={c.id} className="stat" title={c.title}>
              <div className="stat-bar" style={{ background: c.color }} />
              <div>
                <div className="stat-num">{productsByColumn(c.id).length}</div>
                <div className="stat-label">{c.title}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Filter bar */}
      {(view === 'kanban' || view === 'table') && (
        <div className="filter-bar">
          <span style={{ fontSize: 11, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>Labels:</span>
          {LABEL_OPTIONS.map((l) => {
            const active = labelFilter.includes(l.id);
            return (
              <button key={l.id} className={`label-chip ${active ? 'active' : ''}`}
                style={active ? { background: `color-mix(in oklch, ${l.color} 25%, transparent)`, color: l.color } : {}}
                onClick={() => toggleLabelFilter(l.id)}>{l.name}</button>
            );
          })}
          {labelFilter.length > 0 && (
            <button className="btn btn-sm btn-ghost" onClick={() => setLabelFilter([])}><Icon name="close" size={11} /> Limpar</button>
          )}
          <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-3)' }}>
            {filtered.length} de {products.length} produtos
          </span>
        </div>
      )}

      {/* Views */}
      {view === 'kanban' && (
        <div className="board">
          {COLUMNS.map((col) => {
            const items = productsByColumn(col.id);
            return (
              <div key={col.id}
                className={`column ${dragOverColumn === col.id ? 'drag-over' : ''} ${compact ? 'compact' : ''}`}
                onDragOver={(e) => handleColumnDragOver(e, col.id)}
                onDragLeave={() => setDragOverColumn((prev) => prev === col.id ? null : prev)}
                onDrop={(e) => handleColumnDrop(e, col.id)}
                data-screen-label={`Column ${col.title}`}>
                <div className="col-header">
                  <span className="col-dot" style={{ background: col.color }} />
                  <span className="col-title">{col.title}</span>
                  <span className="col-count">{items.length}</span>
                </div>
                <div className="col-body">
                  {items.length === 0 && (
                    <div style={{ padding: '24px 8px', textAlign: 'center', color: 'var(--text-3)', fontSize: 12 }}>
                      {dragOverColumn === col.id ? 'Solte aqui' : 'Vazio'}
                    </div>
                  )}
                  {items.map((p) => (
                    <ProductCard key={p.id} product={p} compact={compact} users={users}
                      onOpen={setOpenProductId} onToggleFav={toggleFavorite} onToggleReserve={toggleReserve}
                      onDragStart={handleDragStart} onDragEnd={handleDragEnd}
                      isDragging={draggingId === p.id} />
                  ))}
                </div>
                <div className="col-add">
                  <button onClick={() => { setAddDefaultColumn(col.id); setShowAdd(true); }}>
                    <Icon name="plus" size={12} /> Adicionar
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {view === 'table' && <TableView products={filtered} users={users} onOpenProduct={setOpenProductId} onToggleFav={toggleFavorite} />}
      {view === 'dashboard' && <Dashboard products={products} users={users} onOpenProduct={setOpenProductId} />}

      {openProduct && (
        <ProductModal product={openProduct} users={users} currentUser={currentUser}
          onClose={() => setOpenProductId(null)}
          onUpdate={updateProductWithActivity} onDelete={deleteProduct} onDuplicate={duplicateProduct} />
      )}

      <ActivityDrawer open={showActivity} activity={activity} users={users} currentUserId={currentUser?.id}
        onClose={() => setShowActivity(false)}
        onOpenProduct={(id) => { setShowActivity(false); setOpenProductId(id); }} />

      {showAdd && (
        <AddProductModal onClose={() => setShowAdd(false)} onCreate={handleCreate}
          defaultColumn={addDefaultColumn} users={users} currentUserId={currentUser?.id} />
      )}

      {showManageTeam && currentUser.role === 'admin' && (
        <ManageTeamModal
          users={users}
          currentUserId={currentUser.id}
          onClose={() => setShowManageTeam(false)}
          onUpdate={(next) => {
            setUsers(next);
            const me = next.find(u => u.id === currentUser.id);
            if (me) setCurrentUser((prev) => ({ ...prev, ...me }));
          }}
        />
      )}

      {showCreateWs && (
        <CreateWorkspaceModal
          onClose={() => setShowCreateWs(false)}
          onCreate={handleCreateWorkspace}
        />
      )}

      {showManageWs && currentWorkspace && (
        <ManageWorkspaceModal
          workspace={currentWorkspace}
          users={users}
          currentUserId={currentUser.id}
          onClose={() => setShowManageWs(false)}
          onUpdate={handleWorkspaceUpdated}
        />
      )}

      {checklistPopupId && (() => {
        const cp = products.find(p => p.id === checklistPopupId);
        if (!cp) return null;
        return <ChecklistPopup product={cp} onUpdate={updateProduct} onClose={() => setChecklistPopupId(null)} />;
      })()}
    </div>
  );
};

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
