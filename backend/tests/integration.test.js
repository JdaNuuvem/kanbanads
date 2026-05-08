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
