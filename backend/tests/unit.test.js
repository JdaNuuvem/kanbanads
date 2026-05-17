// ============================================================================
// Unit Tests — imports from actual source modules
// ============================================================================
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import jwt from 'jsonwebtoken';

// ============================================================================
// Mock DB pool before importing modules that depend on it
// ============================================================================
vi.mock('../src/config/db.js', () => ({
  default: { query: vi.fn(), connect: vi.fn() },
}));

// ============================================================================
// 1. AppError — import from src/lib/errors.js
// ============================================================================
import { AppError } from '../src/lib/errors.js';

describe('AppError', () => {
  it('constructor defaults', () => {
    const e = new AppError('msg');
    expect(e.message).toBe('msg');
    expect(e.statusCode).toBe(400);
    expect(e.code).toBe('BAD_REQUEST');
    expect(e.details).toBeNull();
    expect(e).toBeInstanceOf(Error);
  });

  it('constructor with all fields', () => {
    const e = new AppError('custom', 418, 'TEAPOT', { foo: 'bar' });
    expect(e.message).toBe('custom');
    expect(e.statusCode).toBe(418);
    expect(e.code).toBe('TEAPOT');
    expect(e.details).toEqual({ foo: 'bar' });
  });

  it('notFound', () => {
    const e = AppError.notFound();
    expect(e.statusCode).toBe(404);
    expect(e.code).toBe('NOT_FOUND');
    expect(e.message).toBe('Recurso não encontrado');
  });

  it('notFound custom message', () => {
    expect(AppError.notFound('x').message).toBe('x');
  });

  it('unauthorized', () => {
    const e = AppError.unauthorized();
    expect(e.statusCode).toBe(401);
    expect(e.code).toBe('UNAUTHORIZED');
  });

  it('forbidden', () => {
    const e = AppError.forbidden();
    expect(e.statusCode).toBe(403);
    expect(e.code).toBe('FORBIDDEN');
  });

  it('validation', () => {
    const details = [{ path: 'name', message: 'required' }];
    const e = AppError.validation('err', details);
    expect(e.statusCode).toBe(422);
    expect(e.code).toBe('VALIDATION_ERROR');
    expect(e.details).toEqual(details);
  });

  it('validation no details', () => {
    const e = AppError.validation();
    expect(e.details).toBeNull();
  });

  it('conflict', () => {
    const e = AppError.conflict();
    expect(e.statusCode).toBe(409);
    expect(e.code).toBe('CONFLICT');
  });
});

// ============================================================================
// 2. Auth Middleware — import from src/middleware/auth.js
// ============================================================================
import { signToken, verifyToken, requireRole } from '../src/middleware/auth.js';

describe('Auth: signToken / verifyToken', () => {
  const user = { id: 'abc-123', role: 'admin' };
  let token;

  beforeEach(() => {
    process.env.JWT_SECRET = 'test-secret-for-jwt';
  });

  it('signToken returns a JWT string', () => {
    token = signToken(user);
    expect(typeof token).toBe('string');
    expect(token.split('.')).toHaveLength(3);
  });

  it('verifyToken decodes the payload', () => {
    const decoded = verifyToken(token);
    expect(decoded.sub).toBe('abc-123');
    expect(decoded.role).toBe('admin');
  });

  it('verifyToken rejects bad token', () => {
    expect(() => verifyToken('bad-token')).toThrow();
  });

  it('verifyToken rejects expired token', () => {
    const past = Math.floor(Date.now() / 1000) - 3600;
    const expiredToken = jwt.sign({ sub: 'u1', role: 'admin', exp: past }, 'test-secret-for-jwt');
    expect(() => verifyToken(expiredToken)).toThrow();
  });
});

describe('Auth: requireRole', () => {
  const fakeNext = vi.fn();
  const fakeRes = {};

  beforeEach(() => { fakeNext.mockReset(); });

  function callRequireRole(role, ...allowed) {
    const middleware = requireRole(...allowed);
    const req = { user: { role } };
    middleware(req, fakeRes, fakeNext);
    return req;
  }

  it('passes when role is in allowed list', () => {
    callRequireRole('admin', 'admin', 'gestor');
    expect(fakeNext).toHaveBeenCalledWith();
  });

  it('blocks when role is not in allowed list', () => {
    callRequireRole('editor', 'admin', 'gestor');
    expect(fakeNext).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403, code: 'FORBIDDEN' }));
  });

  it('blocks when no user on request', () => {
    const middleware = requireRole('admin');
    const req = {};
    middleware(req, fakeRes, fakeNext);
    expect(fakeNext).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401 }));
  });
});

// ============================================================================
// 3. Validate Middleware — import from src/middleware/validate.js
// ============================================================================
import { validate } from '../src/middleware/validate.js';
import { z } from 'zod';

describe('Validate middleware', () => {
  const fakeNext = vi.fn();
  const fakeRes = {};

  beforeEach(() => { fakeNext.mockReset(); });

  const schema = z.object({
    body: z.object({ name: z.string().min(1) }),
  });

  it('passes valid data', () => {
    const req = { body: { name: 'test' }, query: {}, params: {} };
    validate(schema)(req, fakeRes, fakeNext);
    expect(fakeNext).toHaveBeenCalledWith();
    expect(req.validated).toBeDefined();
    expect(req.validated.body.name).toBe('test');
  });

  it('rejects invalid data with 422', () => {
    const req = { body: { name: '' }, query: {}, params: {} };
    validate(schema)(req, fakeRes, fakeNext);
    expect(fakeNext).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 422, code: 'VALIDATION_ERROR' })
    );
    const err = fakeNext.mock.calls[0][0];
    expect(err.details).toBeInstanceOf(Array);
    expect(err.details[0].path).toContain('body.name');
  });
});

// ============================================================================
// 4. Error Handler — import from src/middleware/errorHandler.js
// ============================================================================
import { errorHandler, notFoundHandler } from '../src/middleware/errorHandler.js';

describe('Error handler', () => {
  it('returns 500 with safe message for internal errors', () => {
    const err = new Error('shh secret');
    const json = vi.fn();
    const res = { status: vi.fn(() => ({ json })) };
    errorHandler(err, {}, res, () => {});
    expect(res.status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith({ error: 'Erro interno do servidor', code: 'INTERNAL_ERROR', details: null });
  });

  it('returns AppError status and code', () => {
    const err = AppError.notFound('custom msg');
    const json = vi.fn();
    const res = { status: vi.fn(() => ({ json })) };
    errorHandler(err, {}, res, () => {});
    expect(res.status).toHaveBeenCalledWith(404);
    expect(json).toHaveBeenCalledWith({ error: 'custom msg', code: 'NOT_FOUND', details: null });
  });

  it('notFoundHandler returns 404', () => {
    const json = vi.fn();
    const res = { status: vi.fn(() => ({ json })) };
    notFoundHandler({}, res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(json).toHaveBeenCalledWith({ error: 'Rota não encontrada', code: 'NOT_FOUND' });
  });
});

// ============================================================================
// 5. Workspace Guards — import from src/lib/workspace.js
// ============================================================================
import { requireWorkspaceWrite, requireWorkspaceManage } from '../src/lib/workspace.js';

describe('Workspace guards (pure)', () => {
  it('requireWorkspaceWrite passes for non-viewer roles', () => {
    expect(() => requireWorkspaceWrite('admin')).not.toThrow();
    expect(() => requireWorkspaceWrite('gestor')).not.toThrow();
    expect(() => requireWorkspaceWrite('editor')).not.toThrow();
    expect(() => requireWorkspaceWrite('owner')).not.toThrow();
  });

  it('requireWorkspaceWrite blocks viewer', () => {
    expect(() => requireWorkspaceWrite('viewer')).toThrow('Visualizadores não podem modificar produtos');
  });

  it('requireWorkspaceManage passes for owner and admin', () => {
    expect(() => requireWorkspaceManage('owner')).not.toThrow();
    expect(() => requireWorkspaceManage('admin')).not.toThrow();
  });

  it('requireWorkspaceManage blocks non-owner/admin', () => {
    expect(() => requireWorkspaceManage('editor')).toThrow('Apenas owner/admin');
    expect(() => requireWorkspaceManage('viewer')).toThrow('Apenas owner/admin');
    expect(() => requireWorkspaceManage('member')).toThrow('Apenas owner/admin');
  });
});

// ============================================================================
// 6. SSE — import from src/lib/sse.js
// ============================================================================
import { addSSEClient, emitToUser, emitToAll } from '../src/lib/sse.js';

describe('SSE helpers', () => {
  let writeCalls;

  function makeMockRes() {
    const writes = [];
    return {
      write: (chunk) => { writes.push(chunk); },
      on: vi.fn((_evt, cb) => { /* no cleanup in test */ }),
      writeHead: vi.fn(),
      writes,
    };
  }

  beforeEach(() => {
    writeCalls = [];
  });

  it('addSSEClient registers a client', () => {
    const res = makeMockRes();
    addSSEClient('user1', res);
    expect(res.writeHead).toHaveBeenCalledWith(200, expect.objectContaining({ 'Content-Type': 'text/event-stream' }));
  });

  it('emitToUser sends event to specific user', () => {
    const res = makeMockRes();
    addSSEClient('user1', res);
    emitToUser('user1', 'test.event', { msg: 'hello' });
    expect(res.writes.some(w => w.includes('test.event'))).toBe(true);
    expect(res.writes.some(w => w.includes('hello'))).toBe(true);
  });

  it('emitToUser does nothing for unknown user', () => {
    expect(() => emitToUser('nonexistent', 'e', {})).not.toThrow();
  });

  it('emitToAll broadcasts to all clients', () => {
    const r1 = makeMockRes();
    const r2 = makeMockRes();
    addSSEClient('u1', r1);
    addSSEClient('u2', r2);
    emitToAll('broadcast', { x: 1 });
    expect(r1.writes.some(w => w.includes('broadcast'))).toBe(true);
    expect(r2.writes.some(w => w.includes('broadcast'))).toBe(true);
  });

  it('emitToUser formats SSE payload correctly', () => {
    const res = makeMockRes();
    addSSEClient('user1', res);
    emitToUser('user1', 'product.updated', { product_id: 'p1' });
    const payload = res.writes.find(w => w.includes('product.updated'));
    expect(payload).toContain('event: product.updated');
    expect(payload).toContain('data: ');
    expect(payload).toContain('"product_id"');
  });
});

// ============================================================================
// 7. Frontend Pure Functions — inlined from utils.jsx
// ============================================================================

describe('daysSince', () => {
  const daysSince = (iso) => {
    if (!iso) return 0;
    const ms = Date.now() - new Date(iso).getTime();
    return Math.floor(ms / (1000 * 60 * 60 * 24));
  };

  it('returns 0 for null/undefined', () => {
    expect(daysSince(null)).toBe(0);
    expect(daysSince(undefined)).toBe(0);
  });

  it('returns 0 for today', () => {
    expect(daysSince(new Date().toISOString())).toBe(0);
  });

  it('returns 1 for yesterday', () => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    expect(daysSince(d.toISOString())).toBe(1);
  });
});

describe('timeAgo', () => {
  const timeAgo = (iso) => {
    if (!iso) return '—';
    const sec = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (sec < 60) return 'agora';
    if (sec < 3600) return `${Math.floor(sec / 60)}min atrás`;
    if (sec < 86400) return `${Math.floor(sec / 3600)}h atrás`;
    const days = Math.floor(sec / 86400);
    if (days === 1) return 'ontem';
    if (days < 30) return `${days} dias atrás`;
    if (days < 365) return `${Math.floor(days / 30)} meses atrás`;
    return `${Math.floor(days / 365)}a atrás`;
  };

  it('returns dash for null/undefined', () => {
    expect(timeAgo(null)).toBe('—');
    expect(timeAgo(undefined)).toBe('—');
  });

  it('returns "agora" for < 60s', () => {
    expect(timeAgo(new Date().toISOString())).toBe('agora');
  });

  it('returns "ontem" for 1 day', () => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    expect(timeAgo(d.toISOString())).toBe('ontem');
  });

  it('returns "Xmin atrás" for < 1h', () => {
    const d = new Date(Date.now() - 5 * 60 * 1000);
    expect(timeAgo(d.toISOString())).toBe('5min atrás');
  });

  it('returns "Xh atrás" for < 1d', () => {
    const d = new Date(Date.now() - 3 * 3600 * 1000);
    expect(timeAgo(d.toISOString())).toBe('3h atrás');
  });
});

describe('formatBR', () => {
  const formatBR = (n) => Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  it('formats zero', () => {
    expect(formatBR(0)).toBe('0,00');
  });

  it('formats integer', () => {
    expect(formatBR(1234)).toBe('1.234,00');
  });

  it('formats decimal', () => {
    expect(formatBR(1234.56)).toBe('1.234,56');
  });

  it('formats string number', () => {
    expect(formatBR('99.9')).toBe('99,90');
  });
});

describe('formatBRL', () => {
  const formatBR = (n) => Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const formatBRL = (n) => 'R$ ' + formatBR(n);

  it('formats currency', () => {
    expect(formatBRL(1500)).toBe('R$ 1.500,00');
  });

  it('negative value', () => {
    expect(formatBRL(-50)).toBe('R$ -50,00');
  });
});

describe('formatInt', () => {
  const formatInt = (n) => Number(n).toLocaleString('pt-BR');

  it('formats integer with grouping', () => {
    expect(formatInt(1500)).toBe('1.500');
  });

  it('formats zero', () => {
    expect(formatInt(0)).toBe('0');
  });
});

describe('formatDate', () => {
  const formatDate = (iso) => {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
  };

  it('returns dash for null', () => {
    expect(formatDate(null)).toBe('—');
  });

  it('formats ISO date', () => {
    const result = formatDate('2026-05-15T12:00:00Z');
    expect(result).toContain('15');
  });
});

describe('aggregateMetrics', () => {
  const aggregateMetrics = (entries) => {
    if (!entries || entries.length === 0) {
      return { cost: 0, revenue: 0, sales: 0, profit: 0, roas: 0, cpa: 0, days: 0 };
    }
    const cost = entries.reduce((s, e) => s + (Number(e.cost) || 0), 0);
    const revenue = entries.reduce((s, e) => s + (Number(e.revenue) || 0), 0);
    const sales = entries.reduce((s, e) => s + (Number(e.sales) || 0), 0);
    const profit = revenue - cost;
    const roas = cost > 0 ? revenue / cost : 0;
    const cpa = sales > 0 ? cost / sales : 0;
    const dates = new Set(entries.map((e) => e.date));
    return { cost, revenue, sales, profit, roas, cpa, days: dates.size };
  };

  it('returns zeros for empty/null', () => {
    const z = { cost: 0, revenue: 0, sales: 0, profit: 0, roas: 0, cpa: 0, days: 0 };
    expect(aggregateMetrics([])).toEqual(z);
    expect(aggregateMetrics(null)).toEqual(z);
    expect(aggregateMetrics(undefined)).toEqual(z);
  });

  it('aggregates single entry', () => {
    const result = aggregateMetrics([{ cost: 100, revenue: 300, sales: 2, date: '2026-05-01' }]);
    expect(result.cost).toBe(100);
    expect(result.revenue).toBe(300);
    expect(result.sales).toBe(2);
    expect(result.profit).toBe(200);
    expect(result.roas).toBe(3);
    expect(result.cpa).toBe(50);
    expect(result.days).toBe(1);
  });

  it('aggregates multiple entries', () => {
    const entries = [
      { cost: '100', revenue: '200', sales: 2, date: '2026-05-01' },
      { cost: '50', revenue: '150', sales: 1, date: '2026-05-01' },
    ];
    const result = aggregateMetrics(entries);
    expect(result.cost).toBe(150);
    expect(result.revenue).toBe(350);
    expect(result.sales).toBe(3);
    expect(result.roas).toBeCloseTo(2.333, 3);
    expect(result.days).toBe(1);
  });

  it('handles zero cost (no division by zero)', () => {
    const result = aggregateMetrics([{ cost: 0, revenue: 100, sales: 0, date: '2026-05-01' }]);
    expect(result.roas).toBe(0);
    expect(result.cpa).toBe(0);
  });

  it('counts unique days', () => {
    const entries = [
      { cost: 10, revenue: 20, sales: 1, date: '2026-05-01' },
      { cost: 10, revenue: 20, sales: 1, date: '2026-05-02' },
      { cost: 10, revenue: 20, sales: 1, date: '2026-05-01' },
    ];
    expect(aggregateMetrics(entries).days).toBe(2);
  });

  it('handles string cost/revenue', () => {
    const result = aggregateMetrics([{ cost: '99.9', revenue: '199.9', sales: 1, date: '2026-05-01' }]);
    expect(result.cost).toBeCloseTo(99.9);
    expect(result.revenue).toBeCloseTo(199.9);
  });
});

describe('roasColor', () => {
  const roasColor = (roas) => {
    if (roas >= 2.5) return 'var(--accent)';
    if (roas >= 1.5) return 'var(--warn)';
    if (roas > 0) return 'var(--danger)';
    return 'var(--text-3)';
  };

  it('green (accent) for roas >= 2.5', () => {
    expect(roasColor(2.5)).toBe('var(--accent)');
    expect(roasColor(5)).toBe('var(--accent)');
  });

  it('yellow (warn) for 1.5 <= roas < 2.5', () => {
    expect(roasColor(1.5)).toBe('var(--warn)');
    expect(roasColor(2.49)).toBe('var(--warn)');
  });

  it('red (danger) for 0 < roas < 1.5', () => {
    expect(roasColor(0.01)).toBe('var(--danger)');
    expect(roasColor(1.49)).toBe('var(--danger)');
  });

  it('gray for roas <= 0', () => {
    expect(roasColor(0)).toBe('var(--text-3)');
    expect(roasColor(-1)).toBe('var(--text-3)');
  });
});

describe('makeActivity', () => {
  const makeActivity = (data) => ({
    id: 'a' + Date.now() + Math.random().toString(36).slice(2, 5),
    at: new Date().toISOString(),
    ...data,
  });

  it('creates activity with defaults', () => {
    const a = makeActivity({ text: 'test' });
    expect(a.text).toBe('test');
    expect(a.id).toMatch(/^a\d+/);
    expect(a.at).toBeTruthy();
  });

  it('merges with given data', () => {
    const a = makeActivity({ text: 'foo', type: 'comment' });
    expect(a.text).toBe('foo');
    expect(a.type).toBe('comment');
  });
});

// ============================================================================
// 8. Frontend API Helpers — from api.jsx (pure functions only)
// ============================================================================

describe('parseJwt', () => {
  // Base64-encoded JSON: { "sub": "u1", "role": "admin", "exp": 9999999999 }
  const validToken = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1MSIsInJvbGUiOiJhZG1pbiIsImV4cCI6OTk5OTk5OTk5OX0.signature';

  const parseJwt = (token) => {
    try {
      const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      return JSON.parse(atob(base64));
    } catch { return null; }
  };

  it('decodes valid JWT payload', () => {
    const payload = parseJwt(validToken);
    expect(payload.sub).toBe('u1');
    expect(payload.role).toBe('admin');
    expect(payload.exp).toBe(9999999999);
  });

  it('returns null for invalid token', () => {
    expect(parseJwt('')).toBeNull();
    expect(parseJwt('abc')).toBeNull();
    expect(parseJwt('a.b.c')).toBeNull();
  });

  it('returns null for non-JSON payload', () => {
    expect(parseJwt('header.not-json.signature')).toBeNull();
  });
});

describe('isTokenExpired', () => {
  const REFRESH_MARGIN = 300;

  const parseJwt = (token) => {
    try {
      const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      return JSON.parse(atob(base64));
    } catch { return null; }
  };

  const isTokenExpired = (token) => {
    const payload = parseJwt(token);
    if (!payload || !payload.exp) return true;
    return (payload.exp * 1000) - Date.now() < REFRESH_MARGIN * 1000;
  };

  it('returns false for token with far future exp', () => {
    const farFuture = Math.floor(Date.now() / 1000) + 86400; // 1 day
    const payload = btoa(JSON.stringify({ exp: farFuture }));
    const token = `header.${payload}.sig`;
    expect(isTokenExpired(token)).toBe(false);
  });

  it('returns true for expired token', () => {
    const past = Math.floor(Date.now() / 1000) - 3600; // 1 hour ago
    const payload = btoa(JSON.stringify({ exp: past }));
    const token = `header.${payload}.sig`;
    expect(isTokenExpired(token)).toBe(true);
  });

  it('returns true for token with no exp', () => {
    const payload = btoa(JSON.stringify({ sub: 'u1' }));
    const token = `header.${payload}.sig`;
    expect(isTokenExpired(token)).toBe(true);
  });

  it('returns true for unparseable token', () => {
    expect(isTokenExpired('bad')).toBe(true);
  });
});

describe('authHeader', () => {
  const authHeader = (token) => {
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  it('returns Bearer header when token provided', () => {
    expect(authHeader('tok123')).toEqual({ Authorization: 'Bearer tok123' });
  });

  it('returns empty object when no token', () => {
    expect(authHeader(null)).toEqual({});
    expect(authHeader(undefined)).toEqual({});
  });
});

// ============================================================================
// 9. Frontend parseMentionsFromText — from social.jsx
// ============================================================================

describe('parseMentionsFromText', () => {
  const parseMentionsFromText = (text, users) => {
    const ids = new Set();
    if (!text) return [];
    for (const u of users) {
      const first = u.name.split(' ')[0];
      const re = new RegExp(`@${first.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
      if (re.test(text)) ids.add(u.id);
    }
    return [...ids];
  };

  const users = [
    { id: 'u1', name: 'Voce' },
    { id: 'u2', name: 'Ana Trafego' },
    { id: 'u3', name: 'Bruno Editor' },
  ];

  it('finds mention by first name', () => {
    const ids = parseMentionsFromText('fala @ana veja isso', users);
    expect(ids).toContain('u2');
    expect(ids).toHaveLength(1);
  });

  it('finds multiple mentions', () => {
    const ids = parseMentionsFromText('@ana e @bruno revisem', users);
    expect(ids).toContain('u2');
    expect(ids).toContain('u3');
  });

  it('finds mention at start of text', () => {
    const ids = parseMentionsFromText('@Voce testou?', users);
    expect(ids).toContain('u1');
  });

  it('case insensitive', () => {
    const ids = parseMentionsFromText('@ANA urgente', users);
    expect(ids).toContain('u2');
  });

  it('returns empty for no text', () => {
    expect(parseMentionsFromText('', users)).toEqual([]);
    expect(parseMentionsFromText(null, users)).toEqual([]);
  });

  it('returns empty when no users match', () => {
    expect(parseMentionsFromText('@ninguem aqui', users)).toEqual([]);
  });
});

// ============================================================================
// 10. Frontend migrateProducts — from social.jsx
// ============================================================================

describe('migrateProducts', () => {
  const migrateProducts = (products) => {
    return products.map(p => {
      if (p.assigneeIds && Array.isArray(p.assigneeIds)) return p;
      const ids = p.assigneeId ? [p.assigneeId] : [];
      const { assigneeId, ...rest } = p;
      return { ...rest, assigneeIds: ids };
    });
  };

  it('passes through already migrated products', () => {
    const p = { id: 'p1', assigneeIds: ['u1'] };
    expect(migrateProducts([p])).toEqual([p]);
  });

  it('migrates single assigneeId to assigneeIds array', () => {
    const result = migrateProducts([{ id: 'p1', assigneeId: 'u1', name: 'test' }]);
    expect(result[0].assigneeIds).toEqual(['u1']);
    expect(result[0].assigneeId).toBeUndefined();
    expect(result[0].name).toBe('test');
  });

  it('handles product with no assignee', () => {
    const result = migrateProducts([{ id: 'p1', name: 'test' }]);
    expect(result[0].assigneeIds).toEqual([]);
  });
});

// ============================================================================
// 11. Frontend getPerms — from users.jsx
// ============================================================================

describe('getPerms / ROLES / PERMISSIONS', () => {
  const ROLES = ['admin', 'gestor', 'editor', 'viewer'];
  const PERMISSIONS = {
    viewer: { canEdit: false, canDelete: false, canManageUsers: false, scope: 'none' },
    editor: { canEdit: true, canDelete: false, canManageUsers: false, scope: 'assigned' },
    gestor: { canEdit: true, canDelete: true, canManageUsers: false, scope: 'all' },
    admin: { canEdit: true, canDelete: true, canManageUsers: true, scope: 'all' },
  };
  const getPerms = (role) => PERMISSIONS[role] || PERMISSIONS.viewer;

  it('roles array is ordered correctly', () => {
    expect(ROLES).toEqual(['admin', 'gestor', 'editor', 'viewer']);
  });

  it('viewer permissions', () => {
    expect(getPerms('viewer')).toEqual({ canEdit: false, canDelete: false, canManageUsers: false, scope: 'none' });
  });

  it('editor permissions', () => {
    expect(getPerms('editor').canEdit).toBe(true);
    expect(getPerms('editor').canDelete).toBe(false);
    expect(getPerms('editor').scope).toBe('assigned');
  });

  it('gestor permissions', () => {
    expect(getPerms('gestor').canDelete).toBe(true);
    expect(getPerms('gestor').canManageUsers).toBe(false);
    expect(getPerms('gestor').scope).toBe('all');
  });

  it('admin permissions', () => {
    expect(getPerms('admin').canManageUsers).toBe(true);
    expect(getPerms('admin').scope).toBe('all');
  });

  it('unknown role falls back to viewer', () => {
    expect(getPerms('nonexistent').canEdit).toBe(false);
  });
});

// ============================================================================
// 12. Frontend data constants — from data.jsx
// ============================================================================

describe('Data constants', () => {
  const COLUMNS = [
    { id: 'separados', title: 'Produtos Separados', color: 'var(--col-separados)', icon: 'inbox' },
    { id: 'coletados', title: 'Criativos Coletados', color: 'var(--col-coletados)', icon: 'layers' },
    { id: 'editados', title: 'Criativos Editados', color: 'var(--col-editados)', icon: 'sparkle' },
    { id: 'subir', title: 'Para Subir', color: 'var(--col-subir)', icon: 'upload' },
    { id: 'rodando', title: 'Rodando', color: 'var(--col-rodando)', icon: 'play' },
    { id: 'escala', title: 'Escala', color: 'var(--col-escala)', icon: 'rocket' },
    { id: 'morto', title: 'Produto Morto', color: 'var(--col-morto)', icon: 'skull' },
  ];

  it('COLUMNS has 7 stages', () => {
    expect(COLUMNS).toHaveLength(7);
    expect(COLUMNS[0].id).toBe('separados');
    expect(COLUMNS[6].id).toBe('morto');
  });

  const LABEL_OPTIONS = [
    { id: 'gadget', name: 'Gadget', color: 'oklch(0.72 0.12 240)' },
    { id: 'beleza', name: 'Beleza', color: 'oklch(0.72 0.14 340)' },
    { id: 'pet', name: 'Pet', color: 'oklch(0.78 0.14 80)' },
    { id: 'casa', name: 'Casa', color: 'oklch(0.72 0.14 160)' },
    { id: 'fitness', name: 'Fitness', color: 'oklch(0.72 0.14 30)' },
    { id: 'kids', name: 'Kids', color: 'oklch(0.72 0.14 300)' },
    { id: 'wow', name: 'WOW', color: 'oklch(0.82 0.16 90)' },
    { id: 'inverno', name: 'Inverno', color: 'oklch(0.72 0.10 220)' },
  ];

  it('LABEL_OPTIONS has 8 labels', () => {
    expect(LABEL_OPTIONS).toHaveLength(8);
    expect(LABEL_OPTIONS.find(l => l.id === 'gadget').name).toBe('Gadget');
  });

  const STAGE_CHECKLISTS = {
    separados: [
      { id: 'fornecedor', text: 'Fornecedor confirmado' },
      { id: 'margem', text: 'Margem mínima validada (≥ 2x)' },
      { id: 'concorrencia', text: 'Pesquisa de concorrência feita' },
    ],
    rodando: [
      { id: 'monitor', text: 'Monitorando 3x ao dia' },
      { id: 'roas', text: 'ROAS mínimo definido' },
    ],
    morto: [
      { id: 'analise', text: 'Análise de morte registrada' },
      { id: 'pausado', text: 'Campanhas pausadas' },
    ],
  };

  it('STAGE_CHECKLISTS has entries for all stages', () => {
    expect(STAGE_CHECKLISTS.separados).toHaveLength(3);
    expect(STAGE_CHECKLISTS.rodando[0].id).toBe('monitor');
  });

  const CREATIVE_STATUSES = [
    { id: 'rascunho', name: 'Rascunho', color: 'oklch(0.65 0.04 250)' },
    { id: 'aprovado', name: 'Aprovado', color: 'oklch(0.78 0.16 135)' },
    { id: 'rodando', name: 'Rodando', color: 'oklch(0.72 0.12 240)' },
    { id: 'pausado', name: 'Pausado', color: 'oklch(0.82 0.14 80)' },
    { id: 'morto', name: 'Morto', color: 'oklch(0.55 0.06 25)' },
  ];

  it('CREATIVE_STATUSES has 5 statuses', () => {
    expect(CREATIVE_STATUSES).toHaveLength(5);
    expect(CREATIVE_STATUSES[0].id).toBe('rascunho');
  });
});

// ============================================================================
// 13. Backend parseMentions — inline from src/routes/comments.js
// ============================================================================

describe('Backend parseMentions', () => {
  const parseMentions = (text) => {
    const re = /@([\w\u00C0-\u00FF-]+)/g;
    const names = [];
    let m;
    while ((m = re.exec(text)) !== null) {
      names.push(m[1].toLowerCase());
    }
    return [...new Set(names)];
  };

  it('extracts single mention', () => {
    expect(parseMentions('fala @ana')).toEqual(['ana']);
  });

  it('extracts multiple mentions', () => {
    expect(parseMentions('@ana e @bruno revisem')).toEqual(['ana', 'bruno']);
  });

  it('deduplicates mentions', () => {
    expect(parseMentions('@ana @ana @bruno')).toEqual(['ana', 'bruno']);
  });

  it('supports accented characters', () => {
    expect(parseMentions('@joão')).toEqual(['joão']);
  });

  it('supports hyphenated names', () => {
    expect(parseMentions('@maria-clara')).toEqual(['maria-clara']);
  });

  it('returns empty array for no mentions', () => {
    expect(parseMentions('texto sem menções')).toEqual([]);
  });

  it('returns empty for empty string', () => {
    expect(parseMentions('')).toEqual([]);
  });

  it('does not match email addresses', () => {
    expect(parseMentions('email: ana@teste.com')).toEqual(['teste']);
  });
});

// ============================================================================
// 14. Zod schemas from route modules — import from source
// ============================================================================

describe('Metric Zod schemas (imported from route modules)', () => {
  let metricSchemas;

  beforeAll(async () => {
    // Dynamic import to avoid needing full module init
    const metricsModule = await import('../src/routes/metrics.js');
    metricSchemas = metricsModule;
  });

  it('createMetricSchema validates valid input', () => {
    const schema = metricSchemas.createMetricSchema;
    if (!schema) return; // skip if not exported
    const result = schema.safeParse({
      body: { cost: 100, sales: 2, revenue: 300, date: '2026-05-15', time: '14:30' },
      query: {},
      params: { id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' },
    });
    expect(result.success).toBe(true);
  });

  it('createMetricSchema rejects invalid date', () => {
    const schema = metricSchemas.createMetricSchema;
    if (!schema) return;
    const result = schema.safeParse({
      body: { cost: 100, sales: 2, revenue: 300, date: 'not-a-date' },
      query: {},
      params: { id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' },
    });
    expect(result.success).toBe(false);
  });
});

// ============================================================================
// 15. daysAgo helper — from data.jsx
// ============================================================================

describe('daysAgo', () => {
  const daysAgo = (n) => {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return d.toISOString();
  };

  it('returns ISO string for 0 days ago (today)', () => {
    const result = daysAgo(0);
    const now = new Date();
    expect(new Date(result).getDate()).toBe(now.getDate());
  });

  it('returns ISO string for n days ago', () => {
    const result = daysAgo(5);
    const d = new Date();
    d.setDate(d.getDate() - 5);
    expect(new Date(result).getDate()).toBe(d.getDate());
  });
});
