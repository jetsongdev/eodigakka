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
  expect(response.headers()['server-timing']).toMatch(/db;dur=/);
  expect(body._timing).toHaveProperty('db_ms');
  expect(body._timing).toHaveProperty('serialize_ms');
  expect(body._timing).toHaveProperty('parse_ms');
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
  expect(response.headers()['server-timing']).toMatch(/stats;dur=\d.*db;dur=\d/);
  // freshness 쿼리 우회 효과: tFresh가 raw 풀스캔(prod 1604ms) 대신 etl_job_status 1행 SELECT라 ms 단위
  expect(body._timing.fresh_ms).toBeLessThan(200);
  // 결과는 ETL이 채운 데이터 신선도를 그대로 반영
  expect(body.data_freshness).toMatch(/RTMS \d{4}-\d{2}-\d{2} 신고분까지|RTMS 신고분 없음/);
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

test('GET /api/dong/:bjd/complexes returns separate trade and jeonse arrays', async ({
  request,
}) => {
  // 거래 표본 충분한 동(강북구 미아동)으로 검증. bjd_polygon에 매칭 안 되면 skip.
  const probe = await request.get(
    '/api/affordable?mode=trade&cash_min=0&cash_max=500000&size=all',
  );
  if (probe.status() !== 200) test.skip(true, 'affordable probe 실패');
  const probeBody = await probe.json();
  const candidate = probeBody.dongs?.find((d: { tx_count_3m: number }) => d.tx_count_3m >= 5);
  test.skip(!candidate, '거래 5건 이상 동 없음');

  const response = await request.get(`/api/dong/${candidate.bjd_code}/complexes`);
  expect(response.status()).toBe(200);

  const body = await response.json();
  const serverTiming = response.headers()['server-timing'];
  expect(serverTiming).toContain('dong_name;dur=');
  expect(serverTiming).toContain('trade_top;dur=');
  expect(serverTiming).toContain('jeonse_top;dur=');
  expect(serverTiming).toContain('recent_trade;dur=');
  expect(serverTiming).toContain('recent_jeonse;dur=');
  expect(serverTiming).toContain('distribution;dur=');
  expect(body._timing).toHaveProperty('dong_name_ms');
  expect(body._timing).toHaveProperty('trade_top_ms');
  expect(body._timing).toHaveProperty('jeonse_top_ms');
  expect(body._timing).toHaveProperty('recent_trade_ms');
  expect(body._timing).toHaveProperty('recent_jeonse_ms');
  expect(body._timing).toHaveProperty('distribution_ms');
  expect(body).toHaveProperty('recent_trades');
  expect(body).toHaveProperty('recent_jeonse');
  expect(Array.isArray(body.recent_trades)).toBe(true);
  expect(Array.isArray(body.recent_jeonse)).toBe(true);
  expect(body).not.toHaveProperty('recent_transactions');
  // mode 컬럼 제거 검증
  if (body.recent_trades.length > 0) {
    expect(body.recent_trades[0]).not.toHaveProperty('mode');
    expect(body.recent_trades[0]).toHaveProperty('amount_man');
  }
});
