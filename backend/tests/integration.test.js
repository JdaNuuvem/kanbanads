import { describe, it, expect, beforeAll } from 'vitest';

// Integration tests — require a running Postgres.
// Run: npm run db:migrate && npm test

let baseUrl;

beforeAll(() => {
  const port = process.env.PORT || '3002';
  baseUrl = `http://localhost:${port}`;
});

describe('Health endpoint', () => {
  it('returns 200 with status', async () => {
    const res = await fetch(`${baseUrl}/health`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe('ok');
  });
});

describe('Auth endpoints', () => {
  const email = `test-${Date.now()}@test.local`;
  let token;

  it('signup creates a user', async () => {
    const res = await fetch(`${baseUrl}/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Test User',
        email,
        password: 'test123456',
      }),
    });

    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.token).toBeTruthy();
    expect(data.user.name).toBe('Test User');
    token = data.token;
  });

  it('login returns token', async () => {
    const res = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'test123456' }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.token).toBeTruthy();
  });

  it('rejects invalid password', async () => {
    const res = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'wrong' }),
    });

    expect(res.status).toBe(401);
  });
});

describe('Products CRUD', () => {
  const email = `test-prod-${Date.now()}@test.local`;
  let token;
  let productId;

  beforeAll(async () => {
    const res = await fetch(`${baseUrl}/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Product Tester',
        email,
        password: 'test123456',
      }),
    });
    token = (await res.json()).token;
  });

  it('creates a product', async () => {
    const res = await fetch(`${baseUrl}/products`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        name: 'Test Product',
        stage_id: 'separados',
        assignee_ids: [],
        label_ids: ['test_label_1'],
      }),
    });

    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.product.name).toBe('Test Product');
    expect(data.product.stage_id).toBe('separados');
    productId = data.product.id;
  });

  it('lists products', async () => {
    const res = await fetch(`${baseUrl}/products`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data.products)).toBe(true);
  });

  it('gets product by id', async () => {
    const res = await fetch(`${baseUrl}/products/${productId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.product.name).toBe('Test Product');
  });

  it('moves product stage', async () => {
    const res = await fetch(`${baseUrl}/products/${productId}/stage`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ stage_id: 'coletados' }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.product.stage_id).toBe('coletados');
  });

  it('deletes product (soft archive)', async () => {
    const res = await fetch(`${baseUrl}/products/${productId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(200);
  });
});

describe('Metrics CRUD', () => {
  const email = `test-metrics-${Date.now()}@test.local`;
  let token;
  let productId;
  let metricId;

  beforeAll(async () => {
    const res = await fetch(`${baseUrl}/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Metrics Tester',
        email,
        password: 'test123456',
      }),
    });
    token = (await res.json()).token;

    const prodRes = await fetch(`${baseUrl}/products`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        name: `Metrics Test Product ${Date.now()}`,
        stage_id: 'rodando',
        assignee_ids: [],
        label_ids: [],
      }),
    });
    productId = (await prodRes.json()).product.id;
  });

  it('POST /products/:id/metrics — creates a metric entry', async () => {
    const res = await fetch(`${baseUrl}/products/${productId}/metrics`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        date: '2026-05-17',
        time: '14:30',
        cost: 100,
        bid: 2.5,
        budget: 500,
        sales: 5,
        revenue: 300,
        note: 'teste integração',
      }),
    });

    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.metric).toBeTruthy();
    expect(data.metric.product_id).toBe(productId);
    expect(data.metric.cost).toBe('100');
    expect(data.metric.sales).toBe(5);
    expect(data.metric.revenue).toBe('300');
    expect(data.metric.date).toContain('2026-05-17');
    metricId = data.metric.id;
  });

  it('GET /products/:id/metrics — lists metrics for a product', async () => {
    const res = await fetch(`${baseUrl}/products/${productId}/metrics`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data.metrics)).toBe(true);
    expect(data.metrics.length).toBeGreaterThan(0);
    expect(data.metrics[0].product_id).toBe(productId);
  });

  it('GET /products/:id/metrics — rejects requests without token', async () => {
    const res = await fetch(`${baseUrl}/products/${productId}/metrics`);
    expect(res.status).toBe(401);
  });

  it('GET /products/:id/metrics/aggregate — returns aggregated data', async () => {
    const res = await fetch(`${baseUrl}/products/${productId}/metrics/aggregate`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.aggregate).toBeTruthy();
    expect(data.aggregate.product_id).toBe(productId);
    expect(Number(data.aggregate.total_cost)).toBe(100);
    expect(Number(data.aggregate.total_revenue)).toBe(300);
    expect(Number(data.aggregate.total_sales)).toBe(5);
  });

  it('PATCH /metrics/:id — updates a metric entry', async () => {
    const res = await fetch(`${baseUrl}/metrics/${metricId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        cost: 150,
        sales: 8,
        revenue: 450,
        note: 'atualizado',
      }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.metric.cost).toBe('150');
    expect(data.metric.sales).toBe(8);
    expect(data.metric.revenue).toBe('450');
    expect(data.metric.note).toBe('atualizado');
  });

  it('PATCH /metrics/:id — rejects non-existent metric', async () => {
    const fakeId = '00000000-0000-0000-0000-000000000000';
    const res = await fetch(`${baseUrl}/metrics/${fakeId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ cost: 100 }),
    });
    expect(res.status).toBe(404);
  });

  it('PATCH /metrics/:id — rejects update with negative cost', async () => {
    const res = await fetch(`${baseUrl}/metrics/${metricId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ cost: -50 }),
    });
    expect(res.status).toBe(422);
  });

  it('POST /products/:id/metrics — upserts on same date', async () => {
    const res = await fetch(`${baseUrl}/products/${productId}/metrics`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        date: '2026-05-17',
        cost: 200,
        sales: 10,
        revenue: 600,
        note: 'upserted',
      }),
    });

    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.metric.cost).toBe('200');
    expect(data.metric.sales).toBe(10);
    expect(data.metric.note).toBe('upserted');

    const listRes = await fetch(`${baseUrl}/products/${productId}/metrics`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const listData = await listRes.json();
    const may17Metrics = listData.metrics.filter(m => m.date.startsWith('2026-05-17'));
    expect(may17Metrics.length).toBe(1);
  });

  it('POST /products/:id/metrics — creates metric for a different date', async () => {
    const res = await fetch(`${baseUrl}/products/${productId}/metrics`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        date: '2026-05-18',
        cost: 50,
        sales: 2,
        revenue: 100,
      }),
    });

    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.metric.date).toContain('2026-05-18');
  });

  it('GET /products/:id/metrics — filter by date range', async () => {
    const res = await fetch(`${baseUrl}/products/${productId}/metrics?from=2026-05-17&to=2026-05-17`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.metrics.length).toBe(1);
  });

  it('DELETE /metrics/:id — deletes a metric', async () => {
    const res = await fetch(`${baseUrl}/metrics/${metricId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.deleted).toBe(true);
  });

  it('DELETE /metrics/:id — returns 404 for already deleted metric', async () => {
    const res = await fetch(`${baseUrl}/metrics/${metricId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(404);
  });

  it('POST /products/:id/metrics — rejects invalid date', async () => {
    const res = await fetch(`${baseUrl}/products/${productId}/metrics`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        date: 'invalid-date',
        cost: 100,
        sales: 5,
        revenue: 300,
      }),
    });
    expect(res.status).toBe(422);
  });

  it('POST /products/:id/metrics — rejects without token', async () => {
    const res = await fetch(`${baseUrl}/products/${productId}/metrics`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date: '2026-05-17',
        cost: 100,
        sales: 5,
        revenue: 300,
      }),
    });
    expect(res.status).toBe(401);
  });

  it('PATCH /metrics/:id — rejects without token', async () => {
    const res = await fetch(`${baseUrl}/metrics/${metricId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cost: 100 }),
    });
    expect(res.status).toBe(401);
  });
});

describe('Catalogs', () => {
  it('returns stages', async () => {
    const res = await fetch(`${baseUrl}/stages`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data.stages)).toBe(true);
    expect(data.stages.length).toBeGreaterThan(0);
  });

  it('returns labels', async () => {
    const res = await fetch(`${baseUrl}/labels`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data.labels)).toBe(true);
  });
});
