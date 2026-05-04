import { expect, test } from '@playwright/test';

let dbAvailable = false;

test.beforeAll(async ({ request }) => {
  try {
    const response = await request.get('/api/health');
    dbAvailable = response.status() === 200;
  } catch {
    dbAvailable = false;
  }
});

test.beforeEach(() => {
  test.skip(!dbAvailable, 'DB 미기동');
});

test('GET /api/health returns health payload', async ({ request }) => {
  const response = await request.get('/api/health');

  expect(response.status()).toBe(200);

  const body = await response.json();

  expect(body).toHaveProperty('etl_last_succeeded_at');
  expect(body).toHaveProperty('evidence');
  expect(body.raw_counts.tx_apt_trade).toBeGreaterThanOrEqual(0);
});

test('GET /api/polygons returns 467 Seoul polygons', async ({ request }) => {
  const response = await request.get('/api/polygons');

  expect(response.status()).toBe(200);

  const body = await response.json();

  expect(body.type).toBe('FeatureCollection');
  expect(Array.isArray(body.features)).toBe(true);
  expect(body.features).toHaveLength(467);
  expect(body.features[0]?.properties?.bjd_code).toMatch(/^\d{10}$/);
});

test('GET /api/affordable trade returns matching dongs', async ({ request }) => {
  const response = await request.get(
    '/api/affordable?mode=trade&cash_min=40000&cash_max=80000&size=M',
  );

  expect(response.status()).toBe(200);

  const body = await response.json();

  expect(Array.isArray(body.dongs)).toBe(true);
  expect(body.dongs.length).toBeGreaterThanOrEqual(1);
  expect(body.evidence).toContain('조건 일치');
});

test('GET /api/affordable jeonse returns dongs with color when present', async ({ request }) => {
  const response = await request.get(
    '/api/affordable?mode=jeonse&cash_min=30000&cash_max=50000&size=M',
  );

  expect(response.status()).toBe(200);

  const body = await response.json();

  expect(Array.isArray(body.dongs)).toBe(true);

  for (const dong of body.dongs) {
    expect(dong).toHaveProperty('color');
  }
});

test('GET /api/affordable rejects invalid size', async ({ request }) => {
  const response = await request.get('/api/affordable?size=X');

  expect(response.status()).toBe(400);
});
