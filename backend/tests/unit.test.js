import { describe, it, expect } from 'vitest';

// Unit test for @mention parser
function parseMentions(text) {
  const re = /@([\w\u00C0-\u00FF-]+)/g;
  const names = [];
  let m;
  while ((m = re.exec(text)) !== null) {
    names.push(m[1].toLowerCase());
  }
  return [...new Set(names)];
}

describe('mention parser', () => {
  it('extracts a single mention', () => {
    const result = parseMentions('Oi @bruno, veja isso');
    expect(result).toEqual(['bruno']);
  });

  it('extracts multiple mentions', () => {
    const result = parseMentions('@bruno e @carla revisem');
    expect(result).toEqual(['bruno', 'carla']);
  });

  it('deduplicates repeated mentions', () => {
    const result = parseMentions('@bruno @bruno @carla');
    expect(result).toEqual(['bruno', 'carla']);
  });

  it('returns empty array for no mentions', () => {
    const result = parseMentions('Sem menções aqui');
    expect(result).toEqual([]);
  });

  it('handles mentions at start and end', () => {
    const result = parseMentions('@inicio meio @fim');
    expect(result).toEqual(['inicio', 'fim']);
  });

  it('handles email addresses gracefully', () => {
    const result = parseMentions('test@email.com @user');
    expect(result).toEqual(['email', 'user']);
  });

  it('matches case-insensitively', () => {
    const result = parseMentions('@BRUNO @Carla');
    expect(result).toEqual(['bruno', 'carla']);
  });

  it('handles empty string', () => {
    const result = parseMentions('');
    expect(result).toEqual([]);
  });
});

// Unit test for metric aggregation
function aggregateMetrics(entries) {
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
}

describe('aggregateMetrics', () => {
  it('returns zeros for empty input', () => {
    expect(aggregateMetrics([])).toEqual({
      cost: 0, revenue: 0, sales: 0, profit: 0, roas: 0, cpa: 0, days: 0,
    });
  });

  it('returns zeros for null input', () => {
    expect(aggregateMetrics(null)).toEqual({
      cost: 0, revenue: 0, sales: 0, profit: 0, roas: 0, cpa: 0, days: 0,
    });
  });

  it('calculates ROAS correctly', () => {
    const result = aggregateMetrics([
      { date: '2026-01-01', cost: '100', revenue: '300', sales: '5' },
      { date: '2026-01-02', cost: '50', revenue: '150', sales: '3' },
    ]);
    expect(result.cost).toBe(150);
    expect(result.revenue).toBe(450);
    expect(result.sales).toBe(8);
    expect(result.profit).toBe(300);
    expect(result.roas).toBe(3);
    expect(result.cpa).toBe(18.75);
    expect(result.days).toBe(2);
  });

  it('handles zero cost (division by zero)', () => {
    const result = aggregateMetrics([
      { date: '2026-01-01', cost: '0', revenue: '100', sales: '3' },
    ]);
    expect(result.roas).toBe(0);
    expect(result.cpa).toBe(0);
  });
});

// Unit test for timeAgo utility
function timeAgo(iso) {
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
}

describe('timeAgo', () => {
  it('returns "—" for null input', () => {
    expect(timeAgo(null)).toBe('—');
  });

  it('returns "agora" for recent timestamp', () => {
    const now = new Date().toISOString();
    expect(timeAgo(now)).toBe('agora');
  });

  it('returns minutes format', () => {
    const ts = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    expect(timeAgo(ts)).toBe('5min atrás');
  });

  it('returns hours format', () => {
    const ts = new Date(Date.now() - 3 * 3600 * 1000).toISOString();
    expect(timeAgo(ts)).toBe('3h atrás');
  });

  it('returns "ontem"', () => {
    const ts = new Date(Date.now() - 25 * 3600 * 1000).toISOString();
    expect(timeAgo(ts)).toBe('ontem');
  });
});
