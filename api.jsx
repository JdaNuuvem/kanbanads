// API Client — fetch wrapper with auth, retry, token refresh, SSE
// Substitui localStorage como fonte de dados

const API_BASE = window.KANBAN_API_URL != null ? window.KANBAN_API_URL : 'http://localhost:3001';
const TOKEN_KEY = 'kanban_ads_token_v1';
const REFRESH_MARGIN = 300; // renovar token 5 min antes de expirar

// ===== Token management =====

const getToken = () => {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
};
const setToken = (t) => { try { localStorage.setItem(TOKEN_KEY, t); } catch {} };
const clearToken = () => { try { localStorage.removeItem(TOKEN_KEY); } catch {} };

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

// ===== HTTP client =====

let refreshPromise = null;

async function refreshToken() {
  const token = getToken();
  if (!token) return null;

  try {
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: { ...authHeader(token) },
    });
    if (res.ok) {
      const data = await res.json();
      setToken(data.token);
      return data.token;
    }
  } catch {}
  clearToken();
  return null;
}

async function getValidToken() {
  const token = getToken();
  if (!token) return null;
  if (!isTokenExpired(token)) return token;

  if (!refreshPromise) {
    refreshPromise = refreshToken().finally(() => { refreshPromise = null; });
  }
  return refreshPromise;
}

function authHeader(token) {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function apiFetch(url, options = {}) {
  const token = await getValidToken();

  const config = {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...authHeader(token),
      ...options.headers,
    },
  };

  let res = await fetch(`${API_BASE}${url}`, config);

  // Retry on 401 with fresh token
  if (res.status === 401 && token) {
    const newToken = await refreshToken();
    if (newToken) {
      config.headers.Authorization = `Bearer ${newToken}`;
      res = await fetch(`${API_BASE}${url}`, config);
    }
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const err = new Error(body.error || `Erro ${res.status}`);
    err.status = res.status;
    err.code = body.code;
    err.details = body.details;
    throw err;
  }

  return res.json();
}

// ===== Convenience methods =====

const api = {
  get: (url, opts) => apiFetch(url, { ...opts, method: 'GET' }),
  post: (url, body, opts) => apiFetch(url, { ...opts, method: 'POST', body: JSON.stringify(body) }),
  patch: (url, body, opts) => apiFetch(url, { ...opts, method: 'PATCH', body: JSON.stringify(body) }),
  put: (url, body, opts) => apiFetch(url, { ...opts, method: 'PUT', body: JSON.stringify(body) }),
  delete: (url, opts) => apiFetch(url, { ...opts, method: 'DELETE', ...opts }),
};

// ===== Domain APIs =====

const apiAuth = {
  login: (email, password) => api.post('/auth/login', { email, password }),
  signup: (name, email, password) => api.post('/auth/signup', { name, email, password }),
  logout: () => { clearToken(); refreshPromise = null; sseClient.close(); },
  refresh: () => api.post('/auth/refresh'),
};

const apiUsers = {
  me: () => api.get('/me'),
  updateMe: (patch) => api.patch('/me', patch),
  list: () => api.get('/users'),
  create: (data) => api.post('/users', data),
  update: (id, data) => api.patch(`/users/${id}`, data),
  remove: (id) => api.delete(`/users/${id}`),
};

const apiProducts = {
  list: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return api.get(`/products${qs ? '?' + qs : ''}`);
  },
  get: (id) => api.get(`/products/${id}`),
  create: (data) => api.post('/products', data),
  update: (id, data) => api.patch(`/products/${id}`, data),
  moveStage: (id, stageId) => api.patch(`/products/${id}/stage`, { stage_id: stageId }),
  remove: (id) => api.delete(`/products/${id}`),
  duplicate: (id) => api.post(`/products/${id}/duplicate`),
  setAssignees: (id, userIds) => api.put(`/products/${id}/assignees`, { userIds }),
  setLabels: (id, labelIds) => api.put(`/products/${id}/labels`, { labelIds }),
  toggleChecklist: (id, itemId, done) => api.patch(`/products/${id}/checklist/${itemId}`, { done }),
  addChecklistItem: (id, itemId, text) => api.post(`/products/${id}/checklist`, { item_id: itemId, text }),
  removeChecklistItem: (id, itemId) => api.patch(`/products/${id}/checklist/${itemId}`, { done: false }),
  history: (id) => api.get(`/products/${id}/history`),
  reserve: (id) => api.post(`/products/${id}/reserve`),
  release: (id) => api.post(`/products/${id}/release`),
};

const apiMetrics = {
  list: (productId, params) => {
    const qs = new URLSearchParams(params).toString();
    return api.get(`/products/${productId}/metrics${qs ? '?' + qs : ''}`);
  },
  aggregate: (productId) => api.get(`/products/${productId}/metrics/aggregate`),
  create: (productId, data) => api.post(`/products/${productId}/metrics`, data),
  update: (id, data) => api.patch(`/metrics/${id}`, data),
  remove: (id) => api.delete(`/metrics/${id}`),
};

const apiCreatives = {
  list: (productId, params) => {
    const qs = new URLSearchParams(params).toString();
    return api.get(`/products/${productId}/creatives${qs ? '?' + qs : ''}`);
  },
  create: (productId, data) => api.post(`/products/${productId}/creatives`, data),
  update: (id, data) => api.patch(`/creatives/${id}`, data),
  remove: (id) => api.delete(`/creatives/${id}`),
  moveFolder: (id, folder) => api.patch(`/creatives/${id}/folder`, { folder }),
  duplicate: (id) => api.post(`/creatives/${id}/duplicate`),
};

const apiComments = {
  list: (productId) => api.get(`/products/${productId}/comments`),
  create: (productId, text) => api.post(`/products/${productId}/comments`, { text }),
  update: (id, text) => api.patch(`/comments/${id}`, { text }),
  remove: (id) => api.delete(`/comments/${id}`),
};

const apiActivity = {
  list: (params) => {
    const qs = new URLSearchParams(params).toString();
    return api.get(`/activity${qs ? '?' + qs : ''}`);
  },
  me: (params) => {
    const qs = new URLSearchParams(params).toString();
    return api.get(`/activity/me${qs ? '?' + qs : ''}`);
  },
};

const apiNotifications = {
  list: (params) => {
    const qs = new URLSearchParams(params).toString();
    return api.get(`/notifications${qs ? '?' + qs : ''}`);
  },
  count: () => api.get('/notifications/count'),
  markRead: (id) => api.patch(`/notifications/${id}/read`),
  markAllRead: () => api.post('/notifications/read-all'),
  remove: (id) => api.delete(`/notifications/${id}`),
};

const apiDashboard = {
  funnel: () => api.get('/dashboard/funnel'),
  workload: () => api.get('/dashboard/workload'),
  kpis: () => api.get('/dashboard/kpis'),
  timeline: (params) => {
    const qs = new URLSearchParams(params).toString();
    return api.get(`/dashboard/timeline${qs ? '?' + qs : ''}`);
  },
};

const apiCatalogs = {
  stages: () => api.get('/stages'),
  labels: () => api.get('/labels'),
  createLabel: (data) => api.post('/labels', data),
  updateLabel: (id, data) => api.patch(`/labels/${id}`, data),
  removeLabel: (id) => api.delete(`/labels/${id}`),
};

const apiExportImport = {
  export: () => api.get('/export'),
  import: (data) => api.post('/import', data),
  exportCsv: (type) => api.get(`/export/csv?type=${type}`),
};

const apiWorkspaces = {
  list: () => api.get('/workspaces'),
  get: (id) => api.get(`/workspaces/${id}`),
  create: (data) => api.post('/workspaces', data),
  update: (id, data) => api.patch(`/workspaces/${id}`, data),
  remove: (id) => api.delete(`/workspaces/${id}`),
  addMember: (id, userId, role) => api.post(`/workspaces/${id}/members`, { user_id: userId, role }),
  removeMember: (id, userId) => api.delete(`/workspaces/${id}/members/${userId}`),
  updateMember: (id, userId, role) => api.patch(`/workspaces/${id}/members/${userId}`, { role }),
  leave: (id) => api.post(`/workspaces/${id}/leave`),
};

const apiUploads = {
  sign: (filename, contentType) => {
    const qs = new URLSearchParams({ filename, contentType }).toString();
    return api.get(`/uploads/sign?${qs}`);
  },
  uploadUrl: () => `${API_BASE}/uploads`,
};

// ===== SSE Client =====

class SSEClient {
  constructor() {
    this.source = null;
    this.listeners = new Map();
    this.connected = false;
  }

  connect() {
    const token = getToken();
    if (!token) return;
    if (this.source) this.source.close();

    this.source = new EventSource(`${API_BASE}/events?token=${encodeURIComponent(token)}`);

    this.source.onopen = () => { this.connected = true; };
    this.source.onerror = () => {
      this.connected = false;
      setTimeout(() => this.connect(), 5000);
    };

    // Standard events
    const events = ['notification.new', 'activity.new', 'product.updated', 'product.created', 'product.deleted'];
    for (const evt of events) {
      this.source.addEventListener(evt, (e) => {
        try {
          const data = JSON.parse(e.data);
          const handlers = this.listeners.get(evt) || [];
          for (const fn of handlers) fn(data);
        } catch {}
      });
    }
  }

  on(event, fn) {
    if (!this.listeners.has(event)) this.listeners.set(event, []);
    this.listeners.get(event).push(fn);
  }

  off(event, fn) {
    const handlers = this.listeners.get(event);
    if (handlers) {
      this.listeners.set(event, handlers.filter((h) => h !== fn));
    }
  }

  close() {
    if (this.source) { this.source.close(); this.source = null; }
    this.connected = false;
  }
}

const sseClient = new SSEClient();

// ===== Export =====

window.apiFetch = apiFetch;
window.API_BASE = API_BASE;
window.api = api;
window.apiAuth = apiAuth;
window.apiUsers = apiUsers;
window.apiProducts = apiProducts;
window.apiMetrics = apiMetrics;
window.apiCreatives = apiCreatives;
window.apiComments = apiComments;
window.apiActivity = apiActivity;
window.apiNotifications = apiNotifications;
window.apiDashboard = apiDashboard;
window.apiCatalogs = apiCatalogs;
window.apiExportImport = apiExportImport;
window.apiWorkspaces = apiWorkspaces;
window.apiUploads = apiUploads;
window.sseClient = sseClient;
window.getToken = getToken;
window.setToken = setToken;
window.clearToken = clearToken;
window.authHeader = authHeader;
