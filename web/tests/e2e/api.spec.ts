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
  // freshness 쿼리 우회 효과: fresh_ms가 raw 풀스캔(prod 1572ms) 대신 etl_job_status 1행 SELECT라 ms 단위
  expect(body._timing.fresh_ms).toBeLessThan(200);
  // data_freshness 포맷 회귀 가드 — last_contract_date NULL일 때도 graceful 메시지
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

test('POST /api/revalidate without auth returns 401', async ({ request }) => {
  const response = await request.post('/api/revalidate?tag=mv_dong_stats');
  expect(response.status()).toBe(401);
});

test('POST /api/revalidate with wrong tag returns 400', async ({ request }) => {
  const response = await request.post('/api/revalidate', {
    headers: { Authorization: 'Bearer wrong-secret' },
  });
  expect(response.status()).toBe(401);
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

test('GET /api/dong/:bjd/recent paginates trades with has_more flag', async ({ request }) => {
  const probe = await request.get(
    '/api/affordable?mode=trade&cash_min=0&cash_max=500000&size=all',
  );
  if (probe.status() !== 200) test.skip(true, 'affordable probe 실패');
  const probeBody = await probe.json();
  // 매매 표본 11건 이상이어야 has_more 검증 가능 (offset=10 시 추가 row 존재)
  const candidate = probeBody.dongs?.find((d: { tx_count_3m: number }) => d.tx_count_3m >= 11);
  test.skip(!candidate, '거래 11건 이상 동 없음');

  const first = await request.get(
    `/api/dong/${candidate.bjd_code}/recent?mode=trade&offset=0&limit=10`,
  );
  expect(first.status()).toBe(200);
  const firstBody = await first.json();
  expect(firstBody.mode).toBe('trade');
  expect(firstBody.offset).toBe(0);
  expect(firstBody.limit).toBe(10);
  expect(Array.isArray(firstBody.rows)).toBe(true);
  expect(firstBody.rows.length).toBeLessThanOrEqual(10);
  expect(firstBody).toHaveProperty('has_more');
  if (firstBody.rows.length > 0) {
    expect(firstBody.rows[0]).toHaveProperty('amount_man');
    expect(firstBody.rows[0]).toHaveProperty('contract_date');
    expect(firstBody.rows[0]).toHaveProperty('evidence');
  }

  // 11건 이상 거래 동이므로 첫 페이지 has_more=true
  expect(firstBody.has_more).toBe(true);

  // 다음 페이지 fetch — offset=10에 최소 1행 더 있어야 함
  const next = await request.get(
    `/api/dong/${candidate.bjd_code}/recent?mode=trade&offset=10&limit=20`,
  );
  expect(next.status()).toBe(200);
  const nextBody = await next.json();
  expect(nextBody.offset).toBe(10);
  expect(nextBody.rows.length).toBeGreaterThanOrEqual(1);
});

test('GET /api/dong/:bjd/recent allows deep pagination offsets', async ({ request }) => {
  const response = await request.get(
    '/api/dong/1141011000/recent?mode=trade&offset=210&limit=20',
  );

  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(body.offset).toBe(210);
  expect(body.limit).toBe(20);
  expect(Array.isArray(body.rows)).toBe(true);
});

test('GET /api/dong/:bjd/recent rejects invalid mode and bjd', async ({ request }) => {
  const badMode = await request.get('/api/dong/1138010300/recent?mode=invalid&offset=0&limit=10');
  expect(badMode.status()).toBe(400);

  const badBjd = await request.get('/api/dong/abc/recent?mode=trade&offset=0&limit=10');
  expect(badBjd.status()).toBe(400);

  const badLimit = await request.get('/api/dong/1138010300/recent?mode=trade&offset=0&limit=0');
  expect(badLimit.status()).toBe(400);

  const badOffset = await request.get(
    '/api/dong/1138010300/recent?mode=trade&offset=-1&limit=10',
  );
  expect(badOffset.status()).toBe(400);
});
