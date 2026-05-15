// Users / team management — versão API
const DEFAULT_USERS = [
  { id: 'u1', name: 'Você', color: 'oklch(0.78 0.16 135)', role: 'admin' },
  { id: 'u2', name: 'Ana Trafego', color: 'oklch(0.72 0.14 340)', role: 'gestor' },
  { id: 'u3', name: 'Bruno Editor', color: 'oklch(0.72 0.12 240)', role: 'editor' },
  { id: 'u4', name: 'Carla Copy', color: 'oklch(0.82 0.16 90)', role: 'editor' },
];

const ROLE_LABELS = {
  admin: 'Admin',
  gestor: 'Gestor de Tráfego',
  editor: 'Editor',
  viewer: 'Visualizador',
};

const ROLES = ['admin', 'gestor', 'editor', 'viewer'];
const PERMISSIONS = {
  viewer: { canEdit: false, canDelete: false, canManageUsers: false, scope: 'none' },
  editor: { canEdit: true, canDelete: false, canManageUsers: false, scope: 'assigned' },
  gestor: { canEdit: true, canDelete: true, canManageUsers: false, scope: 'all' },
  admin: { canEdit: true, canDelete: true, canManageUsers: true, scope: 'all' },
};

const getPerms = (role) => PERMISSIONS[role] || PERMISSIONS.viewer;

// Token management
const TOKEN_KEY = window.TOKEN_KEY || 'kanban_ads_token_v1';
const loadToken = () => { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } };
const saveToken = (token) => { try { localStorage.setItem(TOKEN_KEY, token); } catch {} };
const clearToken = () => { try { localStorage.removeItem(TOKEN_KEY); } catch {} };

const Avatar = ({ user, size = 24 }) => {
  if (!user) return <div style={{ width: size, height: size, borderRadius: 5, background: 'var(--bg-3)' }} />;
  return (
    <div title={user.name} style={{
      width: size, height: size, borderRadius: 5, background: user.color || 'oklch(0.78 0.16 135)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: '#0a0b0d', fontSize: size * 0.42, fontWeight: 700, flexShrink: 0,
    }}>
      {user.name ? user.name.charAt(0).toUpperCase() : '?'}
    </div>
  );
};

// User switcher dropdown
const UserSwitcher = ({ users, currentUser, onSwitch, onLogout, onManage, onManageWs }) => {
  const [open, setOpen] = React.useState(false);
  return (
    <div style={{ position: 'relative' }}>
      <button className="btn btn-sm btn-ghost" onClick={() => setOpen(!open)}
        style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '0 10px 0 4px' }}>
        <Avatar user={currentUser} size={22} />
        <span style={{ fontSize: 12, fontWeight: 500 }}>{currentUser?.name}</span>
        <Icon name="moreH" size={12} />
      </button>
      {open && (
        <div className="popover" style={{ right: 0, top: 36, minWidth: 200 }} onMouseLeave={() => setOpen(false)}>
          <div style={{ padding: '6px 10px', fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>
            {currentUser?.name} — {ROLE_LABELS[currentUser?.role]}
          </div>
          {currentUser?.role === 'admin' && (
            <div className="popover-item" onClick={() => { onManage(); setOpen(false); }}>
              <Icon name="settings" size={14} /> Gerenciar equipe
            </div>
          )}
          {onManageWs && (
            <div className="popover-item" onClick={() => { onManageWs(); setOpen(false); }}>
              <Icon name="layers" size={14} /> Gerenciar workspace
            </div>
          )}
          <div className="popover-divider" />
          <div className="popover-item" onClick={() => { onLogout(); setOpen(false); }}>
            <Icon name="arrowLeft" size={14} /> Sair
          </div>
        </div>
      )}
    </div>
  );
};

// Manage team modal (admin)
const ManageTeamModal = ({ users, currentUserId, onClose, onUpdate }) => {
  const [list, setList] = React.useState(users);
  const [adding, setAdding] = React.useState(false);
  const [draft, setDraft] = React.useState({ name: '', email: '', password: '', role: 'editor', color: 'oklch(0.78 0.16 135)' });
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');

  const handleClose = () => { onUpdate(list); onClose(); };

  const removeUser = async (id) => {
    if (id === currentUserId) { setError('Não pode remover o usuário atual.'); return; }
    setLoading(true);
    try {
      await apiUsers.remove(id);
      setList((l) => l.map((u) => u.id === id ? { ...u, active: false } : u));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const updateUser = async (id, patch) => {
    setList((l) => l.map((u) => u.id === id ? { ...u, ...patch } : u));
    try {
      const data = await apiUsers.update(id, patch);
      if (data.user) {
        setList((l) => l.map((u) => u.id === id ? { ...u, ...data.user } : u));
      }
    } catch (err) {
      setError(err.message);
    }
  };

  const addUser = async () => {
    if (!draft.name.trim() || !draft.email.trim() || !draft.password) {
      setError('Preencha todos os campos'); return;
    }
    setLoading(true);
    try {
      const data = await apiUsers.create(draft);
      setList((l) => [...l, data.user]);
      setDraft({ name: '', email: '', password: '', role: 'editor', color: 'oklch(0.78 0.16 135)' });
      setAdding(false);
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const colors = [
    'oklch(0.78 0.16 135)','oklch(0.72 0.14 340)','oklch(0.72 0.12 240)',
    'oklch(0.82 0.16 90)','oklch(0.72 0.14 300)','oklch(0.72 0.14 30)',
    'oklch(0.72 0.14 160)','oklch(0.72 0.10 220)',
  ];

  return (
    <div className="modal-backdrop" onClick={handleClose}>
      <div className="mini-modal" onClick={(e) => e.stopPropagation()} style={{ width: 560 }}>
        <h3>Gerenciar equipe</h3>
        {error && <div className="toast toast-error" style={{ marginBottom: 12 }}>{error}</div>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16, maxHeight: 400, overflowY: 'auto' }}>
          {list.filter((u) => u.active !== false).map((u) => (
            <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 10, background: 'var(--bg-2)', borderRadius: 8, border: '1px solid var(--border)' }}>
              <Avatar user={u} size={32} />
              <input value={u.name} onChange={(e) => updateUser(u.id, { name: e.target.value })}
                style={{ flex: 1, background: 'transparent', border: 'none', color: 'var(--text-0)', fontSize: 13, fontWeight: 500, outline: 'none' }} />
              <select value={u.role} onChange={(e) => updateUser(u.id, { role: e.target.value })}
                style={{ background: 'var(--bg-3)', border: '1px solid var(--border)', color: 'var(--text-1)', fontSize: 12, padding: '4px 8px', borderRadius: 6, outline: 'none' }}>
                {Object.entries(ROLE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              {u.id === currentUserId ? (
                <span className="tag" style={{ background: 'var(--accent-dim)', color: 'var(--accent)' }}>VOCÊ</span>
              ) : (
                <button className="btn btn-sm btn-ghost btn-icon" onClick={() => removeUser(u.id)} disabled={loading}>
                  <Icon name="trash" size={12} />
                </button>
              )}
            </div>
          ))}
        </div>
        {adding ? (
          <div style={{ display: 'flex', gap: 8, padding: 10, background: 'var(--bg-2)', borderRadius: 8, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
            <input autoFocus placeholder="Nome" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              style={{ flex: 1, minWidth: 100, background: 'var(--bg-1)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 8px', color: 'var(--text-0)', fontSize: 13, outline: 'none' }} />
            <input placeholder="Email" type="email" value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })}
              style={{ flex: 1, minWidth: 140, background: 'var(--bg-1)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 8px', color: 'var(--text-0)', fontSize: 13, outline: 'none' }} />
            <input placeholder="Senha" type="password" value={draft.password} onChange={(e) => setDraft({ ...draft, password: e.target.value })}
              style={{ width: 100, background: 'var(--bg-1)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 8px', color: 'var(--text-0)', fontSize: 13, outline: 'none' }} />
            <select value={draft.role} onChange={(e) => setDraft({ ...draft, role: e.target.value })}
              style={{ background: 'var(--bg-3)', border: '1px solid var(--border)', color: 'var(--text-1)', fontSize: 12, padding: '6px 8px', borderRadius: 6, outline: 'none' }}>
              {Object.entries(ROLE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <button className="btn btn-sm btn-primary" onClick={addUser} disabled={loading}><Icon name="check" size={12} /></button>
            <button className="btn btn-sm btn-ghost" onClick={() => setAdding(false)}><Icon name="close" size={12} /></button>
          </div>
        ) : (
          <button className="btn" style={{ width: '100%', marginBottom: 16 }} onClick={() => setAdding(true)}>
            <Icon name="plus" size={14} /> Adicionar pessoa
          </button>
        )}
        <div className="form-actions">
          <button className="btn" onClick={handleClose}>Fechar</button>
        </div>
      </div>
    </div>
  );
};

window.DEFAULT_USERS = DEFAULT_USERS;
window.ROLE_LABELS = ROLE_LABELS;
window.ROLES = ROLES;
window.PERMISSIONS = PERMISSIONS;
window.getPerms = getPerms;
window.Avatar = Avatar;
window.UserSwitcher = UserSwitcher;
window.ManageTeamModal = ManageTeamModal;
