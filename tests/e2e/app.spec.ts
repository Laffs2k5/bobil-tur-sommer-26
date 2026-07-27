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
    await expect(page.locator('.map-legend .legend-row')).toHaveCount(8); // 5 days + stop + overnight + day start
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

test.describe('wakeup (day start) markers', () => {
  const WAKEUPS: Record<string, string> = {
    '2026-07-21': 'Groven Camping',
    '2026-07-22': 'Garvikstrondi Camping',
    '2026-07-23': 'Åsgrav Family Camping',
    '2026-07-24': 'First Camp Norsjø',
  };

  for (const [day, place] of Object.entries(WAKEUPS)) {
    test(`day ${day} shows a clickable start marker at ${place}`, async ({ page }) => {
      await open(page);
      await chip(page, day).click();
      const marker = page.locator('path.wakeup-marker');
      await expect(marker).toHaveCount(1);
      await marker.dispatchEvent('click');
      const popup = page.locator('.leaflet-popup .stop-popup');
      await expect(popup).toBeVisible();
      await expect(popup).toContainText('Dagens start');
      await expect(popup).toContainText(place);
      await expect(popup).toContainText('Våknet her etter overnatting');
      await expect(popup).toContainText('Avreise');
    });
  }

  test('the first day and the all-days view have no wakeup marker', async ({ page }) => {
    await open(page);
    await expect(page.locator('path.wakeup-marker')).toHaveCount(0);
    await chip(page, '2026-07-20').click();
    await expect(page.locator('path.wakeup-marker')).toHaveCount(0);
    // The panel notes what the day started from on later days.
    await chip(page, '2026-07-21').click();
    await expect(page.locator('#selection-sub')).toContainText(
      'startet fra Groven Camping og Hyttegrend',
    );
  });
});

test.describe('municipality highlighting', () => {
  test('chips toggle highlighted polygons on the map, multi-select, clearable', async ({ page }) => {
    await open(page);
    await expect(page.locator('body[data-boundaries-loaded="true"]')).toBeAttached();
    // Default: nothing highlighted.
    await expect(page.locator('path.kommune-highlighted')).toHaveCount(0);

    const vinje = page.locator('.muni-chip[data-muni="Vinje"]');
    await vinje.click();
    await expect(vinje).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('path.kommune-highlighted')).toHaveCount(1);

    await page.locator('.muni-chip[data-muni="Tokke"]').click();
    await expect(page.locator('path.kommune-highlighted')).toHaveCount(2);

    // Toggle off again.
    await page.locator('.muni-chip[data-muni="Vinje"]').click();
    await expect(page.locator('path.kommune-highlighted')).toHaveCount(1);

    // Clear-all affordance.
    await page.locator('#muni-clear').click();
    await expect(page.locator('path.kommune-highlighted')).toHaveCount(0);
    await expect(page.locator('#muni-clear')).toHaveCount(0);
  });

  test('clicking a municipality polygon on the map toggles its chip', async ({ page }) => {
    await open(page);
    await expect(page.locator('body[data-boundaries-loaded="true"]')).toBeAttached();
    const polygons = page.locator('path.kommune-boundary');
    await expect(polygons).toHaveCount(19);
    await polygons.first().dispatchEvent('click');
    await expect(page.locator('path.kommune-highlighted')).toHaveCount(1);
    await expect(page.locator('.muni-chip[aria-pressed="true"]')).toHaveCount(1);
  });

  test('selection persists in the URL hash and is restored on load', async ({ page }) => {
    await open(page);
    await page.locator('.muni-chip[data-muni="Vinje"]').click();
    await chip(page, '2026-07-21').click();
    await expect(page).toHaveURL(/dag=2026-07-21/);
    await expect(page).toHaveURL(/kommuner=Vinje/);

    // Fresh load with the same hash restores the state.
    await page.goto('/#dag=2026-07-21&kommuner=Vinje,Tokke');
    await expect(page.locator('body[data-app-ready="true"]')).toBeAttached();
    await expect(page.locator('#selection-title')).toHaveText(
      'Dagstur til Setesdal',
    );
    await expect(page.locator('body[data-boundaries-loaded="true"]')).toBeAttached();
    await expect(page.locator('path.kommune-highlighted')).toHaveCount(2);
    await expect(
      page.locator('.muni-chip[data-muni="Vinje"]'),
    ).toHaveAttribute('aria-pressed', 'true');
  });
});

test.describe('stop chart cross-link', () => {
  test('clicking a chart row opens the stop popup on the map', async ({ page }) => {
    await open(page);
    await chip(page, '2026-07-22').click();
    // Longest stop that day is Åsgrav Family Camping (sorted first).
    await page.locator('#stop-chart g[data-stop]').first().dispatchEvent('click');
    const popup = page.locator('.leaflet-popup .stop-popup');
    await expect(popup).toBeVisible();
    await expect(popup).toContainText('Åsgrav Family Camping');
  });
});

test.describe('map polish', () => {
  test('clicking a polygon never leaves a focus-ring rectangle', async ({ page }) => {
    await open(page);
    await expect(page.locator('body[data-boundaries-loaded="true"]')).toBeAttached();
    const polygon = page.locator('path.kommune-boundary').first();
    await polygon.dispatchEvent('click');
    const outline = await polygon.evaluate(
      (el) => getComputedStyle(el).outlineStyle,
    );
    expect(['none', 'auto']).toContain(outline);
    // The pointer-focus case must resolve to no outline.
    const focused = await page.evaluate(() => {
      const el = document.querySelector('path.kommune-boundary');
      if (!(el instanceof SVGElement)) return 'missing';
      el.focus();
      return el.matches(':focus-visible')
        ? 'focus-visible'
        : getComputedStyle(el).outlineStyle;
    });
    expect(focused === 'none' || focused === 'focus-visible').toBe(true);
  });
});

test.describe('UI polish regressions', () => {
  test('legend mirrors the day filter by dimming other days', async ({ page }) => {
    await open(page);
    await expect(page.locator('.map-legend .legend-row-muted')).toHaveCount(0);
    await chip(page, '2026-07-21').click();
    await expect(page.locator('.map-legend .legend-row-muted')).toHaveCount(4);
    await expect(
      page.locator('.legend-row-day[data-day="2026-07-21"]'),
    ).not.toHaveClass(/legend-row-muted/);
    await chip(page, '').click();
    await expect(page.locator('.map-legend .legend-row-muted')).toHaveCount(0);
  });

  test('legend steps aside while a popup is open (mobile overlap fix)', async ({ page }) => {
    await open(page);
    await page.locator('path.stop-marker').first().dispatchEvent('click');
    await expect(page.locator('.leaflet-popup .stop-popup')).toBeVisible();
    await expect(page.locator('.map-legend')).toHaveClass(/map-legend-popup-open/);
    await page.locator('a.leaflet-popup-close-button').dispatchEvent('click');
    await expect(page.locator('.map-legend')).not.toHaveClass(
      /map-legend-popup-open/,
    );
  });

  test('map attribution is fully visible inside the viewport', async ({ page }) => {
    await open(page);
    const attribution = page.locator('.leaflet-control-attribution');
    await expect(attribution).toBeVisible();
    const box = (await attribution.boundingBox())!;
    const viewport = page.viewportSize()!;
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 1);
    await expect(attribution).toContainText('Kartverket');
    await expect(attribution).toContainText('OpenStreetMap');
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
