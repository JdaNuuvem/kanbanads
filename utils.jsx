// Helpers — versão API
const daysSince = (iso) => {
  if (!iso) return 0;
  const ms = Date.now() - new Date(iso).getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
};

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

const formatDate = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
};

const formatBR = (n) => Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const formatBRL = (n) => 'R$ ' + formatBR(n);
const formatInt = (n) => Number(n).toLocaleString('pt-BR');

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

const roasColor = (roas) => {
  if (roas >= 2.5) return 'var(--accent)';
  if (roas >= 1.5) return 'var(--warn)';
  if (roas > 0) return 'var(--danger)';
  return 'var(--text-3)';
};

// Token persistence (only JWT — data lives in API)
const TOKEN_KEY = 'kanban_ads_token_v1';

const loadTokenLegacy = () => {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
};
const saveTokenLegacy = (token) => {
  try { localStorage.setItem(TOKEN_KEY, token); } catch {}
};
const clearTokenLegacy = () => {
  try { localStorage.removeItem(TOKEN_KEY); } catch {}
};

// Compatibility — loadState/saveState still referenced by old components
// Now they just persist view preferences, not full data
const PREF_KEY = 'kanban_ads_prefs_v1';
const loadState = () => {
  try { return JSON.parse(localStorage.getItem(PREF_KEY)); } catch { return null; }
};
const saveState = (prefs) => {
  try { localStorage.setItem(PREF_KEY, JSON.stringify(prefs)); } catch {}
};

// Activity helpers (still used by social.jsx)
const makeActivity = (data) => ({
  id: 'a' + Date.now() + Math.random().toString(36).slice(2, 5),
  at: new Date().toISOString(),
  ...data,
});

window.daysSince = daysSince;
window.timeAgo = timeAgo;
window.formatDate = formatDate;
window.formatBR = formatBR;
window.formatBRL = formatBRL;
window.formatInt = formatInt;
window.aggregateMetrics = aggregateMetrics;
window.roasColor = roasColor;
window.loadState = loadState;
window.saveState = saveState;
window.makeActivity = makeActivity;
window.TOKEN_KEY = TOKEN_KEY;
window.loadTokenLegacy = loadTokenLegacy;
window.saveTokenLegacy = saveTokenLegacy;
window.clearTokenLegacy = clearTokenLegacy;
