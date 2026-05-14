// Workspace switcher + create/manage modals
const { useState } = React;

const WorkspaceSwitcher = ({ workspaces, currentWorkspace, onSwitch, onCreate, onManage }) => {
  const [open, setOpen] = useState(false);

  if (!workspaces || workspaces.length === 0) return null;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <div style={{ position: 'relative' }}>
        <button className="btn btn-sm btn-ghost" onClick={() => setOpen(!open)}
          style={{ display: 'flex', gap: 6, alignItems: 'center', maxWidth: 180 }}>
          <span style={{
            width: 8, height: 8, borderRadius: 2, flexShrink: 0,
            background: currentWorkspace?.color || 'oklch(0.72 0.12 240)',
          }} />
          <span style={{ fontSize: 12, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {currentWorkspace?.name || 'Kanban'}
          </span>
          <Icon name="moreH" size={10} />
        </button>
        {open && (
          <div className="popover" style={{ left: 0, top: 36, minWidth: 220 }} onMouseLeave={() => setOpen(false)}>
            <div style={{ padding: '6px 10px', fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>
              Workspaces
            </div>
            {workspaces.map((ws) => (
              <div key={ws.id} className="popover-item" onClick={() => { onSwitch(ws); setOpen(false); }}
                style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: ws.id === currentWorkspace?.id ? 600 : 400 }}>
                <span style={{
                  width: 8, height: 8, borderRadius: 2, flexShrink: 0,
                  background: ws.color,
                  outline: ws.id === currentWorkspace?.id ? '2px solid var(--accent)' : 'none',
                  outlineOffset: 2,
                }} />
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ws.name}</span>
                <span style={{ fontSize: 10, color: 'var(--text-3)' }}>{ws.product_count} prod.</span>
              </div>
            ))}
            <div className="popover-divider" />
            <div className="popover-item" onClick={() => { onCreate(); setOpen(false); }}>
              <Icon name="plus" size={14} /> Criar workspace
            </div>
          </div>
        )}
      </div>
      {onManage && (
        <button className="btn btn-sm btn-ghost btn-icon" onClick={onManage}
          title="Gerenciar membros do workspace">
          <Icon name="settings" size={14} />
        </button>
      )}
    </div>
  );
};

const CreateWorkspaceModal = ({ onClose, onCreate }) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState('oklch(0.72 0.12 240)');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const colors = [
    'oklch(0.72 0.12 240)','oklch(0.78 0.16 135)','oklch(0.72 0.14 340)',
    'oklch(0.82 0.16 90)','oklch(0.72 0.14 300)','oklch(0.72 0.14 30)',
    'oklch(0.72 0.14 160)','oklch(0.72 0.10 220)',
  ];

  const handleCreate = async () => {
    if (!name.trim()) { setError('Nome é obrigatório'); return; }
    setLoading(true);
    setError('');
    try {
      const data = await apiWorkspaces.create({ name: name.trim(), description: description.trim() || undefined, color });
      onCreate(data.workspace);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="mini-modal" onClick={(e) => e.stopPropagation()} style={{ width: 440 }}>
        <h3>Novo Workspace</h3>
        <p style={{ color: 'var(--text-3)', fontSize: 12, marginBottom: 16 }}>
          Cada workspace tem seu próprio kanban isolado. Convide membros depois.
        </p>
        {error && <div className="toast toast-error" style={{ marginBottom: 12 }}>{error}</div>}
        <label style={{ display: 'block', fontSize: 11, color: 'var(--text-3)', marginBottom: 4, fontWeight: 500 }}>Nome</label>
        <input autoFocus value={name} onChange={(e) => setName(e.target.value)}
          placeholder="Ex: Meu Kanban de Produtos"
          style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', background: 'var(--bg-1)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-0)', fontSize: 14, outline: 'none' }} />
        <label style={{ display: 'block', fontSize: 11, color: 'var(--text-3)', marginBottom: 4, marginTop: 12, fontWeight: 500 }}>Descrição (opcional)</label>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)}
          placeholder="Breve descrição do workspace"
          rows={2}
          style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', background: 'var(--bg-1)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-0)', fontSize: 13, outline: 'none', resize: 'vertical' }} />
        <label style={{ display: 'block', fontSize: 11, color: 'var(--text-3)', marginBottom: 6, marginTop: 12, fontWeight: 500 }}>Cor</label>
        <div style={{ display: 'flex', gap: 6 }}>
          {colors.map((c) => (
            <button key={c} onClick={() => setColor(c)}
              style={{
                width: 28, height: 28, borderRadius: 6, background: c, border: color === c ? '2px solid var(--accent)' : '2px solid transparent',
                cursor: 'pointer', outline: 'none',
              }} />
          ))}
        </div>
        <div className="form-actions" style={{ marginTop: 20 }}>
          <button className="btn" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={handleCreate} disabled={loading}>
            {loading ? 'Criando...' : 'Criar Workspace'}
          </button>
        </div>
      </div>
    </div>
  );
};

const ManageWorkspaceModal = ({ workspace, users, currentUserId, onClose, onUpdate }) => {
  const [tab, setTab] = useState('members');
  const [addUserId, setAddUserId] = useState('');
  const [addRole, setAddRole] = useState('member');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [localWs, setLocalWs] = useState(workspace);
  const [editName, setEditName] = useState(workspace.name);
  const [editDesc, setEditDesc] = useState(workspace.description || '');

  const myRole = workspace.my_role;
  const canManage = myRole === 'owner' || myRole === 'admin';

  const members = localWs.members || [];

  const saveSettings = async () => {
    if (!editName.trim()) { setError('Nome é obrigatório'); return; }
    setLoading(true);
    try {
      const data = await apiWorkspaces.update(workspace.id, { name: editName.trim(), description: editDesc.trim() || null });
      setLocalWs({ ...localWs, ...data.workspace });
      onUpdate({ ...localWs, ...data.workspace });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const addMember = async () => {
    if (!addUserId) return;
    setLoading(true);
    setError('');
    try {
      await apiWorkspaces.addMember(workspace.id, addUserId, addRole);
      const data = await apiWorkspaces.get(workspace.id);
      setLocalWs(data.workspace);
      onUpdate(data.workspace);
      setAddUserId('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const removeMember = async (userId) => {
    if (userId === currentUserId) { setError('Use a opção Sair para remover a si mesmo'); return; }
    setLoading(true);
    setError('');
    try {
      await apiWorkspaces.removeMember(workspace.id, userId);
      const data = await apiWorkspaces.get(workspace.id);
      setLocalWs(data.workspace);
      onUpdate(data.workspace);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const changeMemberRole = async (userId, newRole) => {
    setLoading(true);
    setError('');
    try {
      await apiWorkspaces.updateMember(workspace.id, userId, newRole);
      const data = await apiWorkspaces.get(workspace.id);
      setLocalWs(data.workspace);
      onUpdate(data.workspace);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const leaveWorkspace = async () => {
    if (!confirm('Tem certeza que deseja sair deste workspace?')) return;
    setLoading(true);
    try {
      await apiWorkspaces.leave(workspace.id);
      onClose();
      onUpdate(null); // Signal to switch to another workspace
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const nonMembers = users.filter((u) => !members.some((m) => m.id === u.id));

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="mini-modal" onClick={(e) => e.stopPropagation()} style={{ width: 560, maxHeight: '80vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <h3>{localWs.name}</h3>
        {error && <div className="toast toast-error" style={{ marginBottom: 12 }}>{error}</div>}

        <div style={{ display: 'flex', gap: 0, marginBottom: 16, borderBottom: '1px solid var(--border)' }}>
          <button className="btn btn-sm btn-ghost" onClick={() => setTab('members')}
            style={{ borderBottom: tab === 'members' ? '2px solid var(--accent)' : '2px solid transparent', borderRadius: 0, fontWeight: tab === 'members' ? 600 : 400 }}>
            Membros ({members.length})
          </button>
          {canManage && (
            <button className="btn btn-sm btn-ghost" onClick={() => setTab('settings')}
              style={{ borderBottom: tab === 'settings' ? '2px solid var(--accent)' : '2px solid transparent', borderRadius: 0, fontWeight: tab === 'settings' ? 600 : 400 }}>
              Configurações
            </button>
          )}
        </div>

        {tab === 'members' && (
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {canManage && (
              <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center' }}>
                <select value={addUserId} onChange={(e) => setAddUserId(e.target.value)}
                  style={{ flex: 1, background: 'var(--bg-1)', border: '1px solid var(--border)', color: 'var(--text-0)', fontSize: 13, padding: '6px 8px', borderRadius: 6, outline: 'none' }}>
                  <option value="">Adicionar usuário...</option>
                  {nonMembers.map((u) => (
                    <option key={u.id} value={u.id}>{u.name} ({u.role})</option>
                  ))}
                </select>
                <select value={addRole} onChange={(e) => setAddRole(e.target.value)}
                  style={{ background: 'var(--bg-1)', border: '1px solid var(--border)', color: 'var(--text-0)', fontSize: 13, padding: '6px 8px', borderRadius: 6, outline: 'none' }}>
                  <option value="member">Membro</option>
                  <option value="admin">Admin</option>
                  <option value="viewer">Viewer</option>
                </select>
                <button className="btn btn-sm btn-primary" onClick={addMember} disabled={!addUserId || loading}>
                  <Icon name="plus" size={12} />
                </button>
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {members.map((m) => {
                const memberRole = m.member_role || m.role;
                const isMe = m.id === currentUserId;
                return (
                  <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', background: 'var(--bg-2)', borderRadius: 6 }}>
                    <Avatar user={m} size={28} />
                    <span style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>{m.name}</span>
                    <span className="tag" style={{ background: 'var(--bg-3)', fontSize: 10, textTransform: 'capitalize' }}>{memberRole}</span>
                    {isMe && <span className="tag" style={{ background: 'var(--accent-dim)', color: 'var(--accent)', fontSize: 10 }}>VOCÊ</span>}
                    {canManage && !isMe && (
                      <>
                        <select value={memberRole} onChange={(e) => changeMemberRole(m.id, e.target.value)}
                          style={{ background: 'var(--bg-3)', border: '1px solid var(--border)', color: 'var(--text-1)', fontSize: 11, padding: '2px 6px', borderRadius: 4, outline: 'none' }}>
                          <option value="admin">Admin</option>
                          <option value="member">Membro</option>
                          <option value="viewer">Viewer</option>
                        </select>
                        <button className="btn btn-sm btn-ghost btn-icon" onClick={() => removeMember(m.id)} disabled={loading}>
                          <Icon name="close" size={12} />
                        </button>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
            <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
              <button className="btn btn-sm btn-ghost" onClick={leaveWorkspace} disabled={loading}
                style={{ color: 'var(--danger)' }}>
                <Icon name="arrowLeft" size={12} /> Sair do workspace
              </button>
            </div>
          </div>
        )}

        {tab === 'settings' && canManage && (
          <div style={{ flex: 1, overflowY: 'auto' }}>
            <label style={{ display: 'block', fontSize: 11, color: 'var(--text-3)', marginBottom: 4, fontWeight: 500 }}>Nome</label>
            <input value={editName} onChange={(e) => setEditName(e.target.value)}
              style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', background: 'var(--bg-1)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-0)', fontSize: 14, outline: 'none' }} />
            <label style={{ display: 'block', fontSize: 11, color: 'var(--text-3)', marginBottom: 4, marginTop: 12, fontWeight: 500 }}>Descrição</label>
            <textarea value={editDesc} onChange={(e) => setEditDesc(e.target.value)}
              rows={3}
              style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', background: 'var(--bg-1)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-0)', fontSize: 13, outline: 'none', resize: 'vertical' }} />
            <div style={{ marginTop: 16 }}>
              <button className="btn btn-primary btn-sm" onClick={saveSettings} disabled={loading}>Salvar</button>
            </div>
            <div style={{ marginTop: 24, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
              <p style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 8 }}>Ações perigosas</p>
              <button className="btn btn-sm btn-ghost" onClick={async () => {
                if (!confirm(`Tem certeza que deseja excluir o workspace "${workspace.name}"? Todos os produtos serão arquivados.`)) return;
                setLoading(true);
                try {
                  await apiWorkspaces.remove(workspace.id);
                  onClose();
                  onUpdate('__deleted__');
                } catch (err) { setError(err.message); }
                finally { setLoading(false); }
              }} disabled={loading}
                style={{ color: 'var(--danger)' }}>
                <Icon name="trash" size={12} /> Excluir workspace
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

window.WorkspaceSwitcher = WorkspaceSwitcher;
window.CreateWorkspaceModal = CreateWorkspaceModal;
window.ManageWorkspaceModal = ManageWorkspaceModal;
