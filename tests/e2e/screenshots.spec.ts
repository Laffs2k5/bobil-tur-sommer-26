import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

// Screenshot-driven visual verification: capture every major state so the
// images can be inspected (and are uploaded as CI artifacts).

const DAYS = [
  '2026-07-20',
  '2026-07-21',
  '2026-07-22',
  '2026-07-23',
  '2026-07-24',
];

function shotPath(testInfo: TestInfo, name: string): string {
  const dir = join('tests', 'e2e', 'screenshots', testInfo.project.name);
  mkdirSync(dir, { recursive: true });
  return join(dir, `${name}.png`);
}

// Wait until Leaflet reports every requested tile as loaded — but tolerate a
// slow or unreachable tile server (CI) instead of failing the run;
// `networkidle` is unreliable here because tile streaming keeps the network busy.
async function waitForTiles(page: Page): Promise<void> {
  await page
    .waitForFunction(
      () => {
        const tiles = document.querySelectorAll('.leaflet-tile');
        const loaded = document.querySelectorAll('.leaflet-tile-loaded');
        return tiles.length > 0 && loaded.length === tiles.length;
      },
      { timeout: 15_000 },
    )
    .catch(() => {
      /* screenshot whatever has painted */
    });
  await page.waitForTimeout(600);
}

async function open(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.locator('body[data-app-ready="true"]')).toBeAttached();
  await expect(page.locator('body[data-boundaries-loaded="true"]')).toBeAttached();
  await waitForTiles(page);
}

test('initial load', async ({ page }, testInfo) => {
  await open(page);
  await page.screenshot({ path: shotPath(testInfo, 'initial-load'), fullPage: false });
});

for (const [i, day] of DAYS.entries()) {
  test(`day ${day} selected`, async ({ page }, testInfo) => {
    await open(page);
    await page.locator(`.day-chip[data-day="${day}"]`).click();
    await waitForTiles(page);
    await page.screenshot({ path: shotPath(testInfo, `day-${i + 1}-${day}`) });
  });
}

test('stop popup open', async ({ page }, testInfo) => {
  await open(page);
  await page.locator('.day-chip[data-day="2026-07-20"]').click();
  await waitForTiles(page);
  await page.locator('path.overnight-marker').first().dispatchEvent('click');
  await expect(page.locator('.leaflet-popup .stop-popup')).toBeVisible();
  await page.waitForTimeout(300);
  await page.screenshot({ path: shotPath(testInfo, 'stop-popup') });
});

test('wakeup marker popup', async ({ page }, testInfo) => {
  await open(page);
  await page.locator('.day-chip[data-day="2026-07-21"]').click();
  await waitForTiles(page);
  await page.locator('path.wakeup-marker').first().dispatchEvent('click');
  await expect(page.locator('.leaflet-popup .stop-popup')).toBeVisible();
  await page.waitForTimeout(300);
  await page.screenshot({ path: shotPath(testInfo, 'wakeup-popup') });
});

test('municipalities highlighted', async ({ page }, testInfo) => {
  await open(page);
  await page.locator('.muni-chip[data-muni="Vinje"]').click();
  await page.locator('.muni-chip[data-muni="Tokke"]').click();
  await page.locator('.muni-chip[data-muni="Bykle"]').click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: shotPath(testInfo, 'munis-highlighted') });
});

test('stats panel', async ({ page }, testInfo) => {
  await open(page);
  await page
    .locator('#panel')
    .screenshot({ path: shotPath(testInfo, 'stats-panel') });
});

test('stats panel scrolled to insights', async ({ page }, testInfo) => {
  await open(page);
  await page.locator('#stop-chart').scrollIntoViewIfNeeded();
  await page.waitForTimeout(200);
  await page.screenshot({ path: shotPath(testInfo, 'panel-insights') });
});
