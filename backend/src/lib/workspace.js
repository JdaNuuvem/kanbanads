import { AppError } from './errors.js';

export async function requireWorkspaceMember(client, workspaceId, userId) {
  const { rows } = await client.query(
    'SELECT 1 FROM workspace_members WHERE workspace_id = $1 AND user_id = $2',
    [workspaceId, userId],
  );
  if (rows.length === 0) throw AppError.forbidden('Você não pertence a este workspace');
}

export async function checkProductWorkspace(client, productId, userId) {
  const { rows } = await client.query(
    `SELECT p.name, p.workspace_id, wm.role FROM products p
     JOIN workspace_members wm ON wm.workspace_id = p.workspace_id AND wm.user_id = $2
     WHERE p.id = $1 AND p.archived_at IS NULL`,
    [productId, userId],
  );
  if (rows.length === 0) throw AppError.notFound('Produto não encontrado ou sem acesso');
  return rows[0];
}

export async function checkWorkspaceMember(client, workspaceId, userId) {
  const { rows } = await client.query(
    'SELECT role FROM workspace_members WHERE workspace_id = $1 AND user_id = $2',
    [workspaceId, userId],
  );
  if (rows.length === 0) throw AppError.forbidden('Você não pertence a este workspace');
  return rows[0];
}

export function requireWorkspaceWrite(role) {
  if (role === 'viewer') throw AppError.forbidden('Visualizadores não podem modificar produtos');
}

export function requireWorkspaceManage(role) {
  if (role !== 'owner' && role !== 'admin') {
    throw AppError.forbidden('Apenas owner/admin podem realizar esta ação');
  }
}
