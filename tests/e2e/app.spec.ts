import { expect, test, type Page } from '@playwright/test';

const DAYS = [
  {
    date: '2026-07-20',
    chip: 'ma. 20.7',
    title: 'Tønsberg – Jettegrytene – Vinje',
    distance: '241 km',
    stops: 4,
    municipalities: 12,
  },
  {
    date: '2026-07-21',
    chip: 'ti. 21.7',
    title: 'Dagstur til Setesdal',
    distance: '229 km',
    stops: 7,
    municipalities: 6,
  },
  {
    date: '2026-07-22',
    chip: 'on. 22.7',
    title: 'Seljord – Bø Sommarland',
    distance: '31 km',
    stops: 3,
    municipalities: 2,
  },
  {
    date: '2026-07-23',
    chip: 'to. 23.7',
    title: 'Norsjø Kabelpark',
    distance: '37 km',
    stops: 3,
    municipalities: 1,
  },
  {
    date: '2026-07-24',
    chip: 'fr. 24.7',
    title: 'Hjemover over Ulefoss og Skien',
    distance: '122 km',
    stops: 3,
    municipalities: 7,
  },
];

async function open(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.locator('body[data-app-ready="true"]')).toBeAttached();
}

function chip(page: Page, day: string) {
  return page.locator(`.day-chip[data-day="${day}"]`);
}

test.describe('initial load', () => {
  test('shows the app with map, legend, day filter and stats', async ({ page }) => {
    await open(page);
    await expect(page).toHaveTitle(/Bobiltur i Sørøst-Norge/);
    await expect(page.locator('#map .leaflet-container, #map.leaflet-container')).toBeVisible();
    await expect(page.locator('.day-chip')).toHaveCount(6);
    await expect(page.locator('.map-legend .legend-row')).toHaveCount(7); // 5 days + stop + overnight
    await expect(page.locator('#selection-title')).toHaveText('Alle dager');
  });

  test('shows the reference totals: 660 km and 14 t 26 min across modes', async ({ page }) => {
    await open(page);
    // Reference table in raw/DATASET.md: 660 km; its "14 h 24 min" total row
    // is the same sum rounded to a tenth of an hour — the exact per-leg sum
    // shown here is 14 t 26 min, and the per-mode rows match exactly.
    await expect(page.locator('#stat-distance')).toHaveText('660 km');
    await expect(page.locator('#stat-duration')).toHaveText('14 t 26 min');

    const rows = page.locator('#mode-table tbody tr');
    await expect(rows).toHaveCount(3);
    await expect(rows.nth(0)).toContainText('Bil');
    await expect(rows.nth(0)).toContainText('657 km');
    await expect(rows.nth(0)).toContainText('13 t 20 min');
    await expect(rows.nth(1)).toContainText('Til fots');
    await expect(rows.nth(1)).toContainText('2,9 km');
    await expect(rows.nth(1)).toContainText('1 t 2 min');
    await expect(rows.nth(2)).toContainText('Sykkel');
    await expect(rows.nth(2)).toContainText('0,6 km');
    await expect(rows.nth(2)).toContainText('3 min');
    await expect(page.locator('#distance-footnote')).toContainText('distanceMeters');
  });

  test('draws five day tracks, 20 stops and 4 overnight markers', async ({ page }) => {
    await open(page);
    await expect(page.locator('path.day-track')).toHaveCount(5);
    await expect(page.locator('path.stop-marker')).toHaveCount(20);
    await expect(page.locator('path.overnight-marker')).toHaveCount(4);
  });

  test('loads municipality and county boundaries from bundled files', async ({ page }) => {
    await open(page);
    await expect(page.locator('body[data-boundaries-loaded="true"]')).toBeAttached();
    await expect(page.locator('path.kommune-boundary')).toHaveCount(19);
    await expect(page.locator('path.fylke-boundary')).toHaveCount(3);
  });

  test('lists all 19 municipalities grouped by county', async ({ page }) => {
    await open(page);
    await expect(page.locator('#muni-chips .muni-chip')).toHaveCount(19);
    await expect(page.locator('#panel')).toContainText('Vestfold');
    await expect(page.locator('#panel')).toContainText('Telemark');
    await expect(page.locator('#panel')).toContainText('Agder');
    await expect(page.locator('#muni-chips')).toContainText('Færder');
  });

  test('shows the charts and the legs table', async ({ page }) => {
    await open(page);
    await expect(page.locator('#day-chart svg')).toBeVisible();
    await expect(page.locator('#day-chart .day-bar')).toHaveCount(5);
    await expect(page.locator('#stop-chart .stop-bar')).toHaveCount(20);
    await expect(page.locator('#stop-chart .stop-bar.overnight')).toHaveCount(4);
    await expect(page.locator('#legs-table tbody tr')).toHaveCount(23);
  });
});

test.describe('day filter', () => {
  for (const day of DAYS) {
    test(`filters tracks, stops and statistics for ${day.date}`, async ({ page }) => {
      await open(page);
      await chip(page, day.date).click();
      await expect(page.locator('#selection-title')).toHaveText(day.title);
      await expect(page.locator('#stat-distance')).toHaveText(day.distance);
      await expect(page.locator('path.day-track')).toHaveCount(1);
      await expect(page.locator('path.stop-marker')).toHaveCount(day.stops);
      await expect(page.locator('#muni-chips .muni-chip')).toHaveCount(
        day.municipalities,
      );
      await expect(page.locator('#stop-chart .stop-bar')).toHaveCount(day.stops);
      await expect(chip(page, day.date)).toHaveAttribute('aria-pressed', 'true');
    });
  }

  test('returns to all days', async ({ page }) => {
    await open(page);
    await chip(page, '2026-07-22').click();
    await expect(page.locator('path.day-track')).toHaveCount(1);
    await chip(page, '').click();
    await expect(page.locator('path.day-track')).toHaveCount(5);
    await expect(page.locator('#stat-distance')).toHaveText('660 km');
  });
});

test.describe('stop popups', () => {
  test('verified stop links to Google Maps with full details', async ({ page }) => {
    await open(page);
    await chip(page, '2026-07-22').click(); // all three stops verified that day
    await page.locator('path.stop-marker').first().dispatchEvent('click');
    const popup = page.locator('.leaflet-popup .stop-popup');
    await expect(popup).toBeVisible();
    await expect(popup.locator('h3')).not.toBeEmpty();
    await expect(popup).toContainText('kommune');
    await expect(popup).toContainText('Ankomst');
    await expect(popup).toContainText('Avreise');
    await expect(popup).toContainText('Varighet');
    const link = popup.locator('a');
    await expect(link).toHaveText('Åpne i Google Maps');
    await expect(link).toHaveAttribute('href', /google\.com\/maps/);
    await expect(popup).not.toContainText('Omtrentlig');
  });

  test('unverified stop shows an approximate-locality note and no link', async ({ page }) => {
    await open(page);
    await chip(page, '2026-07-24').click(); // all three stops unverified that day
    await page.locator('path.stop-marker').first().dispatchEvent('click');
    const popup = page.locator('.leaflet-popup .stop-popup');
    await expect(popup).toBeVisible();
    await expect(popup).toContainText('Omtrentlig stedsangivelse');
    await expect(popup.locator('a')).toHaveCount(0);
  });

  test('overnight stop shows badge and local (Europe/Oslo) times across midnight', async ({ page }) => {
    await open(page);
    await chip(page, '2026-07-20').click();
    await page.locator('path.overnight-marker').first().dispatchEvent('click');
    const popup = page.locator('.leaflet-popup .stop-popup');
    await expect(popup).toContainText('Overnatting');
    await expect(popup).toContainText('Groven Camping');
    // 21:46 local must never render as 19:46 (UTC) in any viewer timezone.
    await expect(popup).toContainText('Ankomst 20. juli 21:46');
    await expect(popup).toContainText('Avreise 21. juli 12:10');
    await expect(popup).toContainText('Varighet 14 t 25 min');
  });
});

test.describe('responsive layout', () => {
  test('adapts panel and map to the viewport', async ({ page }) => {
    await open(page);
    const mapBox = (await page.locator('#map').boundingBox())!;
    const panelBox = (await page.locator('#panel').boundingBox())!;
    const viewport = page.viewportSize()!;
    if (viewport.width <= 820) {
      // Mobile: map on top, panel below, both full width.
      expect(mapBox.y).toBeLessThan(panelBox.y);
      expect(mapBox.width).toBeGreaterThan(viewport.width - 2);
    } else {
      // Desktop: panel left of the map.
      expect(panelBox.x).toBeLessThan(mapBox.x);
      expect(Math.abs(panelBox.y - mapBox.y)).toBeLessThan(2);
    }
  });
});
