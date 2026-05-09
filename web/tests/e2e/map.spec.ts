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

  const evidence = page.getByText(/(매매|전세) · .+~.+ · /);
  await expect(evidence).toBeVisible();
  const before = (await evidence.textContent()) ?? '';

  await page.getByRole('button', { name: '전세' }).click();

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

// SidePanel은 폴리곤 클릭으로만 열린다. Playwright native mouse는 synthetic
// MouseEvent보다 안정적으로 mapbox 이벤트 시스템에 도달한다. 좌표는 폴리곤이
// 등록된 캔버스 내부 비율(강북구 영역 우상단 짙은 녹색 클러스터).
async function clickPolygon(page: Page) {
  // 폴리곤 source/layer가 등록돼 hit-test가 성공하도록 보증
  await expect(page.getByText(/폴리곤\s+\d+개/)).toBeVisible();
  const canvas = page.locator('canvas.mapboxgl-canvas');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('canvas boundingBox 없음');
  // 강북구 미아동 ~ (66%, 24%) — viewport 1280×720 기준 폴리곤 클러스터
  await page.mouse.click(
    box.x + box.width * 0.66,
    box.y + box.height * 0.24,
  );
}

async function openSidePanelByMapClick(page: Page) {
  await openMap(page);
  await clickPolygon(page);
  await expect(page.locator('aside[role="complementary"]')).toBeVisible({ timeout: 10000 });
}

test('SidePanel — 기본은 매매만 펼치고 전세는 보조 collapsed로 표시한다', async ({ page }) => {
  await openSidePanelByMapClick(page);

  const tradeSection = page.getByRole('heading', { name: /매매 최근 10건/ });
  const jeonseSection = page.getByRole('heading', { name: /전세 최근 10건/ });
  const otherMode = page.locator('details').filter({ hasText: /다른 모드 거래 보기 — 전세 \d+건/ });

  await expect(tradeSection).toBeVisible();
  await expect(page.getByText(/다른 모드 거래 보기 — 전세 \d+건/)).toBeVisible();
  await expect(otherMode).not.toHaveAttribute('open', '');
  await expect(jeonseSection).toBeHidden();
});

test('SidePanel — 보조 거래 펼치기 버튼 클릭 시 전세 섹션도 보인다', async ({ page }) => {
  await openSidePanelByMapClick(page);

  const tradeSection = page.getByRole('heading', { name: /매매 최근 10건/ });
  const jeonseSection = page.getByRole('heading', { name: /전세 최근 10건/ });
  const otherMode = page.locator('details').filter({ hasText: /다른 모드 거래 보기 — 전세 \d+건/ });

  await page.getByText(/다른 모드 거래 보기 — 전세 \d+건/).click();

  await expect(otherMode).toHaveAttribute('open', '');
  await expect(tradeSection).toBeVisible();
  await expect(jeonseSection).toBeVisible();
});

test('SidePanel — 헤더 mode 토글 시 주 섹션이 바뀌고 보조는 closed로 리셋된다', async ({ page }) => {
  await openSidePanelByMapClick(page);

  await page.getByText(/다른 모드 거래 보기 — 전세 \d+건/).click();
  await expect(page.locator('details').filter({ hasText: /다른 모드 거래 보기 — 전세 \d+건/ }))
    .toHaveAttribute('open', '');
  await page.getByRole('button', { name: '전세' }).click();
  await expect
    .poll(async () => (await page.getByText(/(매매|전세) · .+~.+ · /).textContent()) ?? '')
    .toContain('전세 ·');

  await expect(page.getByRole('heading', { name: /전세 최근 10건/ })).toBeVisible();
  await expect(page.getByText(/다른 모드 거래 보기 — 매매 \d+건/)).toBeVisible();
  await expect(page.locator('details').filter({ hasText: /다른 모드 거래 보기 — 매매 \d+건/ }))
    .not.toHaveAttribute('open', '');
  await expect(page.getByRole('heading', { name: /매매 최근 10건/ })).toBeHidden();
});
