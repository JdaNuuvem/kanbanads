// Social features: mentions, notifications, activity feed, multi-assignee, workload
const { useState: _useState, useEffect: _useEffect, useRef: _useRef, useMemo: _useMemo } = React;

// ============================================================================
// STORAGE
// ============================================================================
const ACTIVITY_KEY = 'kanban_ads_activity_v1';
const NOTIFS_KEY = 'kanban_ads_notifs_v1';
const ACTIVITY_MAX = 300;

const loadActivity = () => {
  try { return JSON.parse(localStorage.getItem(ACTIVITY_KEY)) || []; } catch { return []; }
};
const saveActivity = (a) => { try { localStorage.setItem(ACTIVITY_KEY, JSON.stringify(a.slice(0, ACTIVITY_MAX))); } catch {} };
const loadNotifs = () => {
  try { return JSON.parse(localStorage.getItem(NOTIFS_KEY)) || []; } catch { return []; }
};
const saveNotifs = (n) => { try { localStorage.setItem(NOTIFS_KEY, JSON.stringify(n.slice(0, 200))); } catch {} };

// ============================================================================
// MENTIONS
// ============================================================================
// Find @mentions in text by trying to match user names (greedy).
// Stored: comment.mentions = [userId, ...]
const parseMentionsFromText = (text, users) => {
  const ids = new Set();
  if (!text) return [];
  // Try each user — match @firstName (case-insensitive)
  for (const u of users) {
    const first = u.name.split(' ')[0];
    const re = new RegExp(`@${first.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
    if (re.test(text)) ids.add(u.id);
  }
  return [...ids];
};

// Render text with @mentions highlighted
const MentionedText = ({ text, users, currentUserId }) => {
  if (!text) return null;
  // Build a regex from user first names
  const firstNames = users.map(u => u.name.split(' ')[0]);
  if (firstNames.length === 0) return <>{text}</>;
  const escaped = firstNames.map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const re = new RegExp(`(@(?:${escaped.join('|')}))\\b`, 'gi');
  const parts = text.split(re);
  return (
    <>
      {parts.map((part, i) => {
        if (!part) return null;
        if (part.startsWith('@')) {
          const name = part.slice(1);
          const u = users.find(x => x.name.split(' ')[0].toLowerCase() === name.toLowerCase());
          if (u) {
            const isMe = u.id === currentUserId;
            return (
              <span key={i} className={`mention ${isMe ? 'mention-me' : ''}`} style={{
                background: `color-mix(in oklch, ${u.color} 22%, transparent)`,
                color: u.color,
                borderColor: `color-mix(in oklch, ${u.color} 35%, transparent)`,
              }}>{part}</span>
            );
          }
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
};

// Textarea with @ autocomplete dropdown
const MentionTextarea = ({ value, onChange, users, placeholder, onSubmit, className = 'comment-input' }) => {
  const ref = _useRef(null);
  const [suggest, setSuggest] = _useState(null); // { query, start, anchor: {top, left} }
  const [activeIdx, setActiveIdx] = _useState(0);

  const matches = _useMemo(() => {
    if (!suggest) return [];
    const q = suggest.query.toLowerCase();
    return (users || [])
      .filter(u => u.name.toLowerCase().includes(q) || (u.name.split(' ')[0] || '').toLowerCase().startsWith(q))
      .slice(0, 5);
  }, [suggest, users]);

  const checkMention = () => {
    const el = ref.current;
    if (!el) return;
    const pos = el.selectionStart;
    const before = el.value.slice(0, pos);
    const m = before.match(/@([\w\u00C0-\u00FF]*)$/);
    if (m) {
      // Position the dropdown under the caret roughly
      setSuggest({ query: m[1], start: pos - m[0].length });
      setActiveIdx(0);
    } else {
      setSuggest(null);
    }
  };

  const insertMention = (user) => {
    if (!suggest) return;
    const el = ref.current;
    const pos = el.selectionStart;
    const first = user.name.split(' ')[0];
    const before = el.value.slice(0, suggest.start);
    const after = el.value.slice(pos);
    const next = `${before}@${first} ${after}`;
    onChange(next);
    setSuggest(null);
    setTimeout(() => {
      el.focus();
      const newPos = (before + '@' + first + ' ').length;
      el.setSelectionRange(newPos, newPos);
    }, 0);
  };

  const handleKey = (e) => {
    if (suggest && matches.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(i => (i + 1) % matches.length); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx(i => (i - 1 + matches.length) % matches.length); return; }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); insertMention(matches[activeIdx]); return; }
      if (e.key === 'Escape') { setSuggest(null); return; }
    }
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && onSubmit) { e.preventDefault(); onSubmit(); }
  };

  return (
    <div style={{ position: 'relative' }}>
      <textarea
        ref={ref}
        className={className}
        value={value}
        placeholder={placeholder || 'Escreva… use @ pra mencionar alguém'}
        onChange={e => { onChange(e.target.value); setTimeout(checkMention, 0); }}
        onKeyDown={handleKey}
        onKeyUp={checkMention}
        onClick={checkMention}
      />
      {suggest && matches.length > 0 && (
        <div className="mention-suggest">
          {matches.map((u, i) => (
            <div key={u.id} className={`mention-suggest-item ${i === activeIdx ? 'active' : ''}`}
              onMouseDown={e => { e.preventDefault(); insertMention(u); }}
              onMouseEnter={() => setActiveIdx(i)}>
              <Avatar user={u} size={20} />
              <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                <span style={{ fontSize: 13, fontWeight: 500 }}>{u.name}</span>
                <span style={{ fontSize: 10, color: 'var(--text-3)' }}>{(window.ROLE_LABELS || {})[u.role] || u.role}</span>
              </div>
              {i === activeIdx && <span style={{ fontSize: 10, color: 'var(--text-3)' }}>↵</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ============================================================================
// AVATAR STACK
// ============================================================================
const AvatarStack = ({ userIds = [], users = [], size = 22, max = 3, onClick, title }) => {
  const list = userIds.map(id => users.find(u => u.id === id)).filter(Boolean);
  if (list.length === 0) {
    return (
      <div onClick={onClick} title={title || 'Sem responsáveis'} style={{
        width: size, height: size, borderRadius: 5,
        border: '1px dashed var(--border-strong)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'var(--text-3)', fontSize: size * 0.5, flexShrink: 0,
        cursor: onClick ? 'pointer' : 'default',
      }}>?</div>
    );
  }
  const visible = list.slice(0, max);
  const overflow = list.length - visible.length;
  return (
    <div onClick={onClick} title={title || list.map(u => u.name).join(', ')} style={{
      display: 'flex', flexShrink: 0,
      cursor: onClick ? 'pointer' : 'default',
    }}>
      {visible.map((u, i) => (
        <div key={u.id} style={{
          width: size, height: size, borderRadius: 5, background: u.color,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#0a0b0d', fontSize: size * 0.42, fontWeight: 700,
          marginLeft: i === 0 ? 0 : -size * 0.32,
          boxShadow: '0 0 0 2px var(--bg-1)',
          position: 'relative', zIndex: visible.length - i,
        }}>{u.name.charAt(0).toUpperCase()}</div>
      ))}
      {overflow > 0 && (
        <div style={{
          width: size, height: size, borderRadius: 5,
          background: 'var(--bg-3)', color: 'var(--text-1)',
          fontSize: size * 0.4, fontWeight: 700,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          marginLeft: -size * 0.32, boxShadow: '0 0 0 2px var(--bg-1)',
        }}>+{overflow}</div>
      )}
    </div>
  );
};

// ============================================================================
// MULTI-ASSIGNEE SELECT
// ============================================================================
const MultiAssigneeSelect = ({ value = [], onChange, users, label }) => {
  const [open, setOpen] = _useState(false);
  const ref = _useRef(null);

  _useEffect(() => {
    if (!open) return;
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  const toggle = (id) => {
    onChange(value.includes(id) ? value.filter(x => x !== id) : [...value, id]);
  };

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button type="button" className="multi-assignee-trigger" onClick={() => setOpen(!open)}>
        {value.length === 0 ? (
          <span style={{ color: 'var(--text-3)' }}>— Sem responsáveis —</span>
        ) : (
          <>
            <AvatarStack userIds={value} users={users} size={20} max={4} />
            <span style={{ fontSize: 12, color: 'var(--text-1)' }}>
              {value.length} {value.length === 1 ? 'pessoa' : 'pessoas'}
            </span>
          </>
        )}
        <Icon name="moreH" size={12} style={{ marginLeft: 'auto', opacity: 0.6 }} />
      </button>
      {open && (
        <div className="popover" style={{ left: 0, top: 38, minWidth: 240, maxHeight: 280, overflowY: 'auto' }}>
          <div style={{ padding: '6px 10px', fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>
            {label || 'Atribuir a…'}
          </div>
          {users.map(u => {
            const active = value.includes(u.id);
            return (
              <div key={u.id} className="popover-item" onClick={() => toggle(u.id)}
                style={active ? { background: 'var(--bg-3)' } : {}}>
                <Avatar user={u} size={20} />
                <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                  <span style={{ fontSize: 13 }}>{u.name}</span>
                  <span style={{ fontSize: 10, color: 'var(--text-3)' }}>{(window.ROLE_LABELS || {})[u.role] || u.role}</span>
                </div>
                {active && <Icon name="check" size={14} style={{ color: 'var(--accent)' }} />}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

// ============================================================================
// ACTIVITY HELPERS
// ============================================================================
// Activity event: { id, type, productId, productName, byId, text, mentionedIds, at }
const makeActivity = (data) => ({
  id: 'a' + Date.now() + Math.random().toString(36).slice(2, 5),
  at: new Date().toISOString(),
  ...data,
});

const activityIcon = (type) => {
  switch (type) {
    case 'comment': return 'message';
    case 'mention': return 'message';
    case 'move': return 'arrowRight';
    case 'create': return 'plus';
    case 'assign': return 'target';
    case 'metric': return 'target';
    case 'delete': return 'trash';
    default: return 'history';
  }
};

const activityColor = (type) => {
  switch (type) {
    case 'comment':
    case 'mention': return 'oklch(0.72 0.12 240)';
    case 'move': return 'oklch(0.78 0.16 135)';
    case 'create': return 'oklch(0.78 0.14 80)';
    case 'assign': return 'oklch(0.72 0.14 340)';
    case 'metric': return 'oklch(0.72 0.14 30)';
    case 'delete': return 'oklch(0.55 0.06 25)';
    default: return 'var(--text-3)';
  }
};

// ============================================================================
// NOTIFICATIONS BELL
// ============================================================================
const NotificationsBell = ({ notifications, activity, users, currentUserId, onMarkRead, onMarkAllRead, onOpenProduct, onClear }) => {
  const [open, setOpen] = _useState(false);
  const ref = _useRef(null);

  _useEffect(() => {
    if (!open) return;
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  const myNotifs = notifications.filter(n => n.userId === currentUserId);
  const unread = myNotifs.filter(n => !n.read).length;

  const enriched = myNotifs.map(n => ({
    ...n,
    activity: activity.find(a => a.id === n.activityId),
  })).filter(n => n.activity);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button className="btn btn-sm btn-ghost btn-icon" onClick={() => setOpen(!open)}
        title={`${unread} notificações novas`} style={{ position: 'relative' }}>
        <BellIcon size={14} />
        {unread > 0 && <span className="notif-dot">{unread > 9 ? '9+' : unread}</span>}
      </button>
      {open && (
        <div className="notif-panel">
          <div className="notif-panel-head">
            <strong style={{ fontSize: 13 }}>Notificações</strong>
            {unread > 0 && (
              <button className="btn btn-sm btn-ghost" onClick={onMarkAllRead}>Marcar todas lidas</button>
            )}
          </div>
          <div className="notif-panel-body">
            {enriched.length === 0 ? (
              <div className="empty" style={{ padding: 30 }}>
                <div className="empty-icon" style={{ width: 36, height: 36 }}><BellIcon size={16} /></div>
                <div className="empty-text">Sem notificações.<br/>Quando alguém te @mencionar ou atribuir um produto, aparece aqui.</div>
              </div>
            ) : enriched.slice(0, 30).map(n => {
              const a = n.activity;
              const by = users.find(u => u.id === a.byId);
              return (
                <div key={n.id} className={`notif-item ${!n.read ? 'unread' : ''}`}
                  onClick={() => {
                    onMarkRead(n.id);
                    if (a.productId) onOpenProduct(a.productId);
                    setOpen(false);
                  }}>
                  <div className="notif-icon" style={{ background: `color-mix(in oklch, ${activityColor(a.type)} 25%, transparent)`, color: activityColor(a.type) }}>
                    <Icon name={activityIcon(a.type)} size={12} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="notif-text">
                      {by && <strong style={{ color: 'var(--text-0)' }}>{by.name}</strong>}{' '}
                      {a.text}{' '}
                      {a.productName && <span style={{ color: 'var(--accent)' }}>{a.productName}</span>}
                    </div>
                    <div className="notif-meta">{timeAgo(a.at)}</div>
                  </div>
                  {!n.read && <div className="notif-unread-dot" />}
                </div>
              );
            })}
          </div>
          {enriched.length > 0 && (
            <div className="notif-panel-foot">
              <button className="btn btn-sm btn-ghost" style={{ width: '100%' }} onClick={onClear}>
                <Icon name="trash" size={11} /> Limpar tudo
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const BellIcon = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
  </svg>
);

// ============================================================================
// ACTIVITY DRAWER
// ============================================================================
const ActivityDrawer = ({ open, activity, users, currentUserId, onClose, onOpenProduct }) => {
  const [filter, setFilter] = _useState('all'); // all | mine | mentions | comments | moves
  const [byUser, setByUser] = _useState('all');

  const filtered = activity.filter(a => {
    if (byUser !== 'all' && a.byId !== byUser) return false;
    if (filter === 'mine') return a.byId === currentUserId || (a.mentionedIds || []).includes(currentUserId) || (a.assigneeIds || []).includes(currentUserId);
    if (filter === 'mentions') return (a.mentionedIds || []).includes(currentUserId);
    if (filter === 'comments') return a.type === 'comment' || a.type === 'mention';
    if (filter === 'moves') return a.type === 'move';
    return true;
  });

  // Group by day
  const groups = {};
  filtered.forEach(a => {
    const d = new Date(a.at);
    const key = d.toDateString() === new Date().toDateString() ? 'Hoje'
      : d.toDateString() === new Date(Date.now() - 86400000).toDateString() ? 'Ontem'
      : d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
    (groups[key] = groups[key] || []).push(a);
  });

  if (!open) return null;

  return (
    <div className="activity-drawer-backdrop" onClick={onClose}>
      <div className="activity-drawer" onClick={e => e.stopPropagation()}>
        <div className="activity-drawer-head">
          <div>
            <h3 style={{ margin: 0, fontSize: 15 }}>Atividade da equipe</h3>
            <p style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--text-3)' }}>
              Tudo que rolou no painel — em ordem cronológica
            </p>
          </div>
          <button className="modal-close" onClick={onClose}><Icon name="close" size={16} /></button>
        </div>
        <div className="activity-drawer-filters">
          <div className="activity-pills">
            {[
              { id: 'all', label: 'Tudo' },
              { id: 'mine', label: 'Meu' },
              { id: 'mentions', label: '@Menções' },
              { id: 'comments', label: 'Comentários' },
              { id: 'moves', label: 'Movimentos' },
            ].map(f => (
              <button key={f.id} className={`activity-pill ${filter === f.id ? 'active' : ''}`}
                onClick={() => setFilter(f.id)}>{f.label}</button>
            ))}
          </div>
          <select className="meta-input" value={byUser} onChange={e => setByUser(e.target.value)}
            style={{ flex: '0 0 140px' }}>
            <option value="all">Todos</option>
            {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </div>
        <div className="activity-drawer-body">
          {filtered.length === 0 ? (
            <div className="empty" style={{ padding: 60 }}>
              <div className="empty-icon"><Icon name="history" size={20} /></div>
              <div className="empty-text">Nenhuma atividade nesse filtro ainda.</div>
            </div>
          ) : Object.entries(groups).map(([day, items]) => (
            <div key={day} className="activity-group">
              <div className="activity-group-head">{day}</div>
              {items.map(a => {
                const by = users.find(u => u.id === a.byId);
                return (
                  <div key={a.id} className="activity-row" onClick={() => a.productId && onOpenProduct(a.productId)}>
                    <div className="activity-row-icon" style={{
                      background: `color-mix(in oklch, ${activityColor(a.type)} 25%, transparent)`,
                      color: activityColor(a.type),
                    }}>
                      <Icon name={activityIcon(a.type)} size={11} />
                    </div>
                    {by && <Avatar user={by} size={20} />}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="activity-row-text">
                        {by && <strong>{by.name}</strong>} {a.text}
                        {a.productName && <span className="activity-product"> · {a.productName}</span>}
                      </div>
                      {a.snippet && (
                        <div className="activity-snippet">
                          <MentionedText text={a.snippet} users={users} currentUserId={currentUserId} />
                        </div>
                      )}
                    </div>
                    <div className="activity-time">{timeAgo(a.at)}</div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// WORKLOAD CHART (Dashboard widget)
// ============================================================================
const WorkloadChart = ({ products, users, onOpenProduct }) => {
  const stats = users.map(u => {
    const assigned = products.filter(p => (p.assigneeIds || []).includes(u.id));
    const active = assigned.filter(p => !['morto'].includes(p.column));
    const rodando = assigned.filter(p => p.column === 'rodando' || p.column === 'escala');
    const stale = assigned.filter(p =>
      (p.column === 'rodando' && daysSince(p.enteredColumnAt) > 7) ||
      (p.column === 'subir' && daysSince(p.enteredColumnAt) > 3)
    );
    const totals = assigned.reduce((acc, p) => {
      const a = aggregateMetrics(p.metrics);
      acc.cost += a.cost; acc.revenue += a.revenue; acc.profit += a.profit;
      return acc;
    }, { cost: 0, revenue: 0, profit: 0 });
    return { user: u, total: assigned.length, active: active.length, rodando: rodando.length, stale: stale.length, ...totals, products: assigned };
  });

  const maxActive = Math.max(...stats.map(s => s.active), 1);

  // Distribution by stage per user (stacked bar)
  const stageColors = {};
  COLUMNS.forEach(c => { stageColors[c.id] = c.color; });

  return (
    <div className="dashboard-section">
      <h3>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
        Carga de trabalho da equipe
      </h3>
      <div className="workload-list">
        {stats.map(s => {
          const segments = COLUMNS.map(c => ({
            id: c.id, title: c.title, color: c.color,
            count: s.products.filter(p => p.column === c.id).length,
          })).filter(seg => seg.count > 0);
          return (
            <div key={s.user.id} className="workload-row">
              <div className="workload-head">
                <Avatar user={s.user} size={26} />
                <div className="workload-name">
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{s.user.name}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    {(window.ROLE_LABELS || {})[s.user.role]}
                  </div>
                </div>
                <div className="workload-stats">
                  <div className="workload-stat" title="Produtos ativos">
                    <span className="workload-stat-num">{s.active}</span>
                    <span className="workload-stat-lbl">ativos</span>
                  </div>
                  <div className="workload-stat" title="Rodando + escala">
                    <span className="workload-stat-num" style={{ color: 'var(--accent)' }}>{s.rodando}</span>
                    <span className="workload-stat-lbl">rodando</span>
                  </div>
                  {s.stale > 0 && (
                    <div className="workload-stat" title="Produtos parados">
                      <span className="workload-stat-num" style={{ color: 'var(--danger)' }}>{s.stale}</span>
                      <span className="workload-stat-lbl">parados</span>
                    </div>
                  )}
                  <div className="workload-stat" title="Lucro total dos produtos atribuídos">
                    <span className="workload-stat-num" style={{ color: s.profit >= 0 ? 'var(--accent)' : 'var(--danger)' }}>
                      {s.profit >= 0 ? '+' : ''}{formatBR(s.profit / 1000)}k
                    </span>
                    <span className="workload-stat-lbl">lucro</span>
                  </div>
                </div>
              </div>
              {segments.length > 0 ? (
                <div className="workload-bar" title={`${s.total} produtos`}>
                  {segments.map(seg => (
                    <div key={seg.id} className="workload-seg" title={`${seg.count} em ${seg.title}`}
                      style={{ flex: seg.count, background: seg.color }}>
                      <span>{seg.count}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="workload-bar empty">
                  <span style={{ color: 'var(--text-3)', fontSize: 11 }}>Sem produtos atribuídos</span>
                </div>
              )}
              {s.products.length > 0 && (
                <div className="workload-products">
                  {s.products.slice(0, 6).map(p => (
                    <button key={p.id} className="workload-chip" onClick={() => onOpenProduct(p.id)}
                      title={`${p.name} · ${COLUMNS.find(c => c.id === p.column)?.title}`}>
                      <span className="workload-chip-dot" style={{ background: p.color }} />
                      <span className="workload-chip-name">{p.name}</span>
                    </button>
                  ))}
                  {s.products.length > 6 && (
                    <span style={{ fontSize: 11, color: 'var(--text-3)', alignSelf: 'center' }}>
                      +{s.products.length - 6} mais
                    </span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ============================================================================
// MIGRATION
// ============================================================================
// Convert legacy products with assigneeId to assigneeIds[]
const migrateProducts = (products) => {
  return products.map(p => {
    if (p.assigneeIds && Array.isArray(p.assigneeIds)) return p;
    const ids = p.assigneeId ? [p.assigneeId] : [];
    const { assigneeId, ...rest } = p;
    return { ...rest, assigneeIds: ids };
  });
};

window.parseMentionsFromText = parseMentionsFromText;
window.MentionedText = MentionedText;
window.MentionTextarea = MentionTextarea;
window.AvatarStack = AvatarStack;
window.MultiAssigneeSelect = MultiAssigneeSelect;
window.NotificationsBell = NotificationsBell;
window.ActivityDrawer = ActivityDrawer;
window.WorkloadChart = WorkloadChart;
window.activityIcon = activityIcon;
window.activityColor = activityColor;
window.loadActivity = loadActivity;
window.saveActivity = saveActivity;
window.loadNotifs = loadNotifs;
window.saveNotifs = saveNotifs;
window.migrateProducts = migrateProducts;
window.BellIcon = BellIcon;
