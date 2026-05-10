import { expect, test, type Page } from '@playwright/test';

async function mockMapPageApis(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem('eodigakka:last-seen-version', 'dev');
  });

  await page.route('**/api/affordable?**', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        dongs: [],
        generated_at: '2026-05-11T00:00:00.000Z',
        data_freshness: 'RTMS 2026-05-10 신고분까지',
        evidence: '매매 · 4억~8억 · M',
      }),
    });
  });

  await page.route('**/api/polygons', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        type: 'FeatureCollection',
        features: [],
        _timing: { db_ms: 0, serialize_ms: 0, parse_ms: 0 },
      }),
    });
  });

  await page.route('**/api/recent', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        items: [
          {
            mode: 'TRADE',
            contract_date: '2026-05-10',
            bjd_code: '1141011000',
            sigungu: '서대문구',
            dong: '북아현동',
            complex_name: '북아현테스트',
            area_m2: 84,
            amount_man: 80000,
            floor: 10,
          },
        ],
        generated_at: '2026-05-11T00:00:00.000Z',
        data_freshness: 'RTMS 2026-05-10 신고분까지',
      }),
    });
  });

  await page.route('**/api/dong/1141011000/complexes', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        bjd_code: '1141011000',
        bjd_name: '북아현동',
        trade_top5: [],
        jeonse_top5: [],
        recent_trades: [],
        recent_jeonse: [],
        distributions: [],
        generated_at: '2026-05-11T00:00:00.000Z',
        evidence: '테스트 데이터',
      }),
    });
  });
}

test('페이지는 main landmark와 밑줄 있는 푸터 출처 링크를 제공한다', async ({ page }) => {
  await mockMapPageApis(page);
  await page.goto('/', { waitUntil: 'domcontentloaded' });

  await expect(page.getByRole('main')).toBeVisible();

  const rtmsLink = page.getByRole('link', { name: '국토교통부 RTMS' });
  await expect(rtmsLink).toBeVisible();
  await expect(rtmsLink).toHaveCSS('text-decoration-line', /underline/);
});

test('모바일 — SidePanel bottom sheet를 아래로 스와이프해 닫을 수 있다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockMapPageApis(page);
  await page.goto('/', { waitUntil: 'domcontentloaded' });

  await page
    .getByRole('region', { name: '강북 14구 최근 거래 50건' })
    .getByRole('button')
    .first()
    .click({ force: true });

  const aside = page.locator('aside[role="complementary"]');
  await expect(aside).toBeVisible();
  const box = await aside.boundingBox();
  if (!box) throw new Error('side panel boundingBox 없음');

  await page.mouse.move(box.x + box.width / 2, box.y + 18);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + 150, { steps: 8 });
  await page.mouse.up();

  await expect(aside).toBeHidden();
});
