import { expect, test, type Page } from '@playwright/test';
import pkg from '../../package.json';

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
  await page.addInitScript((version) => {
    window.localStorage.setItem('eodigakka:last-seen-version', version);
  }, pkg.version);
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.addStyleTag({
    content: '.recent-ticker-track { animation: none !important; transform: none !important; }',
  });
  await expect(page.getByText('eodigakka', { exact: false })).toBeVisible();
  const notice = page.locator('aside[aria-label="처음 방문 안내"], aside[aria-label="새 버전 안내"]');
  if (await notice.isVisible().catch(() => false)) {
    await notice.getByRole('button', { name: /^(시작하기|확인)$/ }).click();
    await expect(notice).toBeHidden();
  }
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

test('최근 거래 티커가 footer 바로 위에 보이고 항목 클릭으로 SidePanel을 연다', async ({
  page,
}) => {
  await openMap(page);

  const ticker = page.getByRole('region', { name: '강북 14구 최근 거래 50건' });
  await expect(ticker).toBeVisible();
  await expect(ticker.locator('.recent-ticker-track')).toHaveCount(1);

  await ticker.getByRole('button').first().click({ force: true });

  await expect(page.locator('aside[role="complementary"]')).toBeVisible({ timeout: 10000 });
});

test('매매 전세 토글 시 evidence 텍스트가 바뀐다', async ({ page }) => {
  await openMap(page);

  const evidence = page.getByText(/(매매|전세) · .+~.+ · /);
  await expect(evidence).toBeVisible();
  const before = (await evidence.textContent()) ?? '';

  await page.getByRole('button', { name: '전세', exact: true }).click();

  await expect
    .poll(async () => (await evidence.textContent()) ?? '')
    .toContain('전세 ·');
  await expect
    .poll(async () => (await evidence.textContent()) ?? '')
    .not.toBe(before);
});

test('cash 카세트 — 좌측 버튼은 최소만, 우측 버튼은 최대만 변경된다', async ({ page }) => {
  await openMap(page);

  const evidence = page.getByText(/(매매|전세) · .+~.+ · /);
  await expect(evidence).toBeVisible();

  // 시작: 4억~8억. 최소 -1억 → 3억~8억
  await page.getByRole('button', { name: '최소 -1억' }).click();

  await expect
    .poll(async () => (await evidence.textContent()) ?? '')
    .toContain('3억~8억');

  // 최대 +1억 두 번 → 3억~10억
  await page.getByRole('button', { name: '최대 +1억' }).click();
  await page.getByRole('button', { name: '최대 +1억' }).click();

  await expect
    .poll(async () => (await evidence.textContent()) ?? '')
    .toContain('3억~10억');
});

test('cash 카세트 — ±10억 버튼이 큰 폭 점프를 한다', async ({ page }) => {
  await openMap(page);

  const evidence = page.getByText(/(매매|전세) · .+~.+ · /);
  await expect(evidence).toBeVisible();

  // 시작: 4억~8억. 최대 +10억 → 4억~18억
  await page.getByRole('button', { name: '최대 +10억' }).click();

  await expect
    .poll(async () => (await evidence.textContent()) ?? '')
    .toContain('4억~18억');

  // 최소 -10억 → clamp 0 → 0~18억 (4억 - 10억은 음수라 0으로 clamp)
  await page.getByRole('button', { name: '최소 -10억' }).click();

  await expect
    .poll(async () => (await evidence.textContent()) ?? '')
    .toContain('0~18억');
});

test('size 토글 S 선택 시 evidence 텍스트가 유지되며 새 쿼리가 반영된다', async ({ page }) => {
  await openMap(page);

  const evidence = page.getByText(/(매매|전세) · .+~.+ · /);
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

test('모바일 — 접힌 컨트롤 밖에서 범례 chip을 열 수 있다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openMap(page);

  const legendButton = page.getByRole('button', { name: '범례 열기' });
  await expect(legendButton).toBeVisible();

  await legendButton.click();

  const legendDialog = page.getByRole('dialog', { name: '지도 범례' });
  await expect(legendDialog).toBeVisible();
  await expect(legendDialog.getByText('조건 통과 (high)')).toBeVisible();
  await expect(legendDialog.getByText('미통과/표본 부족')).toBeVisible();
});

async function openSidePanel(page: Page) {
  await openMap(page);
  const ticker = page.getByRole('region', { name: '강북 14구 최근 거래 50건' });
  await expect(ticker).toBeVisible();
  await ticker.getByRole('button').first().click({ force: true });
  await expect(page.locator('aside[role="complementary"]')).toBeVisible({ timeout: 10000 });
}

test('SidePanel — 최근 거래 섹션은 매매와 전세를 동시에 표시한다', async ({ page }) => {
  await openSidePanel(page);

  const tradeSection = page.getByRole('heading', { name: /매매 최근 거래/ });
  const jeonseSection = page.getByRole('heading', { name: /전세 최근 거래/ });

  await expect(tradeSection).toBeVisible();
  await expect(jeonseSection).toBeVisible();
});

test('SidePanel — 헤더 mode 토글 후에도 최근 거래 섹션이 유지된다', async ({ page }) => {
  await openSidePanel(page);

  const tradeSection = page.getByRole('heading', { name: /매매 최근 거래/ });
  const jeonseSection = page.getByRole('heading', { name: /전세 최근 거래/ });
  const evidence = page.getByText(/(매매|전세) · .+~.+ · /);
  const aside = page.locator('aside[role="complementary"]');

  await page.getByRole('button', { name: '전세', exact: true }).click();

  await expect
    .poll(async () => (await evidence.textContent()) ?? '')
    .toContain('전세 ·');
  // 사이드패널이 닫히지 않고 같은 dong에 대해 유지 — 2-B 차분 적용으로 selected
  // feature-state가 affordable refetch 후에도 보존되는 회귀 가드
  await expect(aside).toBeVisible();
  await expect(tradeSection).toBeVisible();
  await expect(jeonseSection).toBeVisible();
});

test('SidePanel — 헤더 mode 토글 후 열어도 최근 거래 섹션은 양쪽 모두 보인다', async ({ page }) => {
  await openMap(page);
  const evidence = page.getByText(/(매매|전세) · .+~.+ · /);
  await expect(evidence).toBeVisible();

  // 1. 헤더 mode를 전세로 변경
  await page.getByRole('button', { name: '전세', exact: true }).click();
  await expect
    .poll(async () => (await evidence.textContent()) ?? '')
    .toContain('전세 ·');

  // 2. 최근 거래 티커 클릭으로 SidePanel 열기
  const ticker = page.getByRole('region', { name: '강북 14구 최근 거래 50건' });
  await ticker.getByRole('button').first().click({ force: true });
  await expect(page.locator('aside[role="complementary"]')).toBeVisible({ timeout: 10000 });

  // 3. 두 거래 섹션이 함께 보인다
  await expect(page.getByRole('heading', { name: /매매 최근 거래/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: /전세 최근 거래/ })).toBeVisible();
});
