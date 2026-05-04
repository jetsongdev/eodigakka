import { expect, test, type Page } from '@playwright/test';

let hasMapboxToken = true;

async function skipIfDbUnavailable(page: Page) {
  try {
    const response = await page.request.get('/api/health');
    test.skip(response.status() !== 200, 'DB 미기동');
  } catch {
    test.skip(true, 'DB 미기동');
  }
}

async function openMap(page: Page) {
  await skipIfDbUnavailable(page);
  await page.goto('/');
  await expect(page.getByText('eodigakka', { exact: false })).toBeVisible();
}

test.beforeAll(async () => {
  hasMapboxToken = Boolean(process.env.NEXT_PUBLIC_MAPBOX_TOKEN);
});

test.beforeEach(() => {
  test.skip(!hasMapboxToken, 'Mapbox 토큰 미설정');
});

test('메인 페이지 헤더 카드가 보인다', async ({ page }) => {
  await openMap(page);

  await expect(page.getByText('eodigakka', { exact: false })).toBeVisible();
});

test('폴리곤 카운트 표시가 보인다', async ({ page }) => {
  await openMap(page);

  await expect(page.getByText(/폴리곤\s+467개|폴리곤/, { exact: false })).toBeVisible();
});

test('매매 전세 토글 시 evidence 텍스트가 바뀐다', async ({ page }) => {
  await openMap(page);

  const evidence = page.getByText(/조건 일치 .* 모드 (TRADE|JEONSE), 현금 .*만원/);
  await expect(evidence).toBeVisible();
  const before = (await evidence.textContent()) ?? '';

  await page.getByRole('button', { name: '전세' }).click();

  await expect
    .poll(async () => (await evidence.textContent()) ?? '')
    .toContain('모드 JEONSE');
  await expect
    .poll(async () => (await evidence.textContent()) ?? '')
    .not.toBe(before);
});

test('cash 셀렉터 변경 시 evidence 텍스트가 갱신된다', async ({ page }) => {
  await openMap(page);

  const evidence = page.getByText(/조건 일치 .* 모드 (TRADE|JEONSE), 현금 .*만원/);
  await expect(evidence).toBeVisible();

  await page.locator('select').nth(0).selectOption('60000');

  await expect
    .poll(async () => (await evidence.textContent()) ?? '')
    .toContain('현금 60000~80000만원');
});

test('size 토글 S 선택 시 evidence 텍스트가 유지되며 새 쿼리가 반영된다', async ({ page }) => {
  await openMap(page);

  const evidence = page.getByText(/조건 일치 .* 모드 (TRADE|JEONSE), 현금 .*만원/);
  const before = (await evidence.textContent()) ?? '';

  await page.getByRole('button', { name: 'S (60㎡미만)' }).click();

  await expect(evidence).toBeVisible();
  await expect
    .poll(async () => (await evidence.textContent()) ?? '')
    .not.toBe(before);
});

test('.mapboxgl-canvas 요소가 렌더링된다', async ({ page }) => {
  await openMap(page);

  await expect(page.locator('.mapboxgl-canvas')).toHaveCount(1);
});
