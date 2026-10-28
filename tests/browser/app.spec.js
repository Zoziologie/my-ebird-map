import { test as base, expect } from '@playwright/test';
import { rm } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';

// WebKit ephemeral sessions reject Blob/File storage. Use isolated disk-backed profiles
// so the real import/reopen flow is tested without changing application storage.
const test = base.extend({
  context: async (
    { playwright, browserName, baseURL, viewport, isMobile, hasTouch, deviceScaleFactor, userAgent },
    use,
    testInfo,
  ) => {
    const profile = testInfo.outputPath('profile');
    const context = await playwright[browserName].launchPersistentContext(profile, {
      headless: true,
      baseURL,
      viewport,
      isMobile,
      hasTouch,
      deviceScaleFactor,
      userAgent,
    });
    try {
      await use(context);
    } finally {
      await context.close();
      await rm(profile, { recursive: true, force: true });
    }
  },
});

// Complete synthetic checklists: 20,000 observations, 1,000 checklists, 500 sites, two species.
const csv = [
  'Submission ID,Location ID,Location,Scientific Name,Common Name,Count,Date,State/Province,Latitude,Longitude,Exotic Code',
  ...Array.from(
    { length: 20000 },
    (_, i) =>
      `S${Math.floor(i / 20)},L${Math.floor(i / 40)},Site ${Math.floor(i / 40)},${i % 2 ? 'Erithacus rubecula,European Robin' : 'Anas platyrhynchos,Mallard'},1,2025-06-01,CH-VD,${46 + Math.floor(i / 40) / 1000},6,`,
  ),
].join('\n');

test('import, reload, search, sorting and bounded rendering across devices', async ({
  page,
  browserName,
  isMobile,
}, testInfo) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    localStorage.setItem('myebirdmap:analytics-consent', 'denied');
    window.browserMetrics = { longTasks: [], layoutShift: 0 };
    for (const type of ['longtask', 'layout-shift', 'largest-contentful-paint', 'paint']) {
      if (!PerformanceObserver.supportedEntryTypes.includes(type)) continue;
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (type === 'longtask') window.browserMetrics.longTasks.push(entry.duration);
          else if (type === 'layout-shift') {
            if (!entry.hadRecentInput) window.browserMetrics.layoutShift += entry.value;
          } else window.browserMetrics[entry.name || type] = entry.startTime;
        }
      }).observe({ type, buffered: true });
    }
  });
  if (!process.env.BROWSER_MAPBOX_TOKEN)
    await page.route('https://**/*', (route) =>
      route.fulfill({
        body: '',
        contentType: route.request().resourceType() === 'stylesheet' ? 'text/css' : 'application/javascript',
      }),
    );
  await page.goto('./');
  await expect(page.locator('#data-dialog')).toBeVisible();
  await page.locator('#explore-demo').click();
  await expect(page.locator('#demo-notice')).toBeVisible();
  await expect(page.locator('#species-count')).not.toHaveText('0');
  await page.locator('#data-button').click();
  const started = Date.now();
  await page
    .locator('#file-input')
    .setInputFiles({ name: 'MyEBirdData.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
  await expect(page.locator('#data-dialog')).not.toBeVisible();
  const importMs = Date.now() - started;
  await expect(page.locator('#species-count')).toHaveText('2');
  await expect(page.locator('#checklists-count')).toHaveText('1,000');
  await expect(page.locator('#observations-count')).toHaveText('20,000');
  await expect(page.locator('#places-count')).toHaveText('500');
  await page.reload();
  await expect(page.locator('#observations-count')).toHaveText('20,000');
  if (isMobile) await page.locator('#mobile-results').click();
  await page.locator('#locations-tab').click();
  await expect(page.locator('#results tbody tr')).toHaveCount(160);
  await page.locator('[data-more]').click();
  await expect(page.locator('#results tbody tr')).toHaveCount(320);
  await page.locator('#search').fill('Site 499');
  await expect(page.locator('#results tbody tr')).toHaveCount(1);
  await expect(page.locator('#results tbody')).toContainText('Site 499');
  await page.locator('#search').fill('');
  await page.locator('#results [data-sort="name"]').click();
  await expect(page.locator('#results tbody tr').first()).toContainText('Site 0');
  await page.locator('#species-tab').click();
  await page.locator('#search').fill('robin');
  await expect(page.locator('#results tbody tr')).toHaveCount(1);
  await expect(page.locator('#results tbody')).toContainText('European Robin');
  await page.locator('#search').fill('');

  const session = browserName === 'chromium' ? await page.context().newCDPSession(page) : null;
  if (session) await session.send('HeapProfiler.collectGarbage');
  const before = session ? await session.send('Runtime.getHeapUsage') : null;
  // Time work inside the page so automation transport/polling does not dominate measurements.
  const searchMs = await page.evaluate(async () => {
    const samples = [];
    for (let i = 0; i < 20; i++) {
      document.querySelector(i % 2 ? '#species-tab' : '#locations-tab').click();
      const search = document.querySelector('#search');
      const start = performance.now();
      search.value = i % 2 ? 'robin' : 'Site 499';
      search.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      samples.push(performance.now() - start);
      search.value = '';
      search.dispatchEvent(new Event('input', { bubbles: true }));
    }
    return samples;
  });
  if (session) await session.send('HeapProfiler.collectGarbage');
  const after = session ? await session.send('Runtime.getHeapUsage') : null;
  if (before) expect(after.usedSize - before.usedSize).toBeLessThan(16 * 1024 * 1024);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const accessibility = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(accessibility.violations).toEqual([]);
  if (isMobile) {
    await page.locator('#close-results').click();
    await expect(page.locator('.sidebar')).not.toHaveClass(/open/);
  }
  await page.locator('#settings-button').click();
  await expect(page.locator('#settings-dialog')).toBeVisible();
  await page.locator('#date-from-month').selectOption('07');
  await page.locator('#date-to-month').selectOption('12');
  await expect(page.locator('#observations-count')).toHaveText('0');
  await page.locator('#date-from-month').selectOption('');
  await page.locator('#date-to-month').selectOption('');
  await expect(page.locator('#observations-count')).toHaveText('20,000');
  await page.locator('#close-settings').click();
  await expect(page.locator('#settings-dialog')).not.toBeVisible();
  expect(errors).toEqual([]);
  await testInfo.attach('performance.json', {
    body: JSON.stringify(
      {
        project: testInfo.project.name,
        importMs,
        searchMs,
        heapBefore: before,
        heapAfter: after,
        ...(await page.evaluate(() => window.browserMetrics)),
        note: 'Synthetic production-build browser check. Search includes two animation frames; heap is Chromium main-thread JS only. Mapbox is disabled unless BROWSER_MAPBOX_TOKEN is provided. Not field Core Web Vitals or physical-device measurements.',
      },
      null,
      2,
    ),
    contentType: 'application/json',
  });
});

test('live map loads and switches location, cluster, country and region views', async ({ page }, testInfo) => {
  test.skip(!process.env.BROWSER_MAPBOX_TOKEN, 'Set BROWSER_MAPBOX_TOKEN for the live Mapbox integration check.');
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => localStorage.setItem('myebirdmap:analytics-consent', 'denied'));
  await page.goto('./');
  await page
    .locator('#file-input')
    .setInputFiles({ name: 'MyEBirdData.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
  await expect(page.locator('#data-dialog')).not.toBeVisible();
  await expect(page.locator('.mapboxgl-canvas')).toBeVisible();
  await expect(page.locator('#map-message')).not.toBeVisible();
  const timings = {};
  for (const grouping of ['auto', 'country', 'region', 'off']) {
    const started = Date.now();
    const response = ['country', 'region'].includes(grouping)
      ? page.waitForResponse((response) =>
          new RegExp(grouping === 'country' ? '/countries-v1-.*json' : '/CH-.*json').test(response.url()),
        )
      : null;
    await page.locator('#clustering').selectOption(grouping);
    if (response) expect((await response).ok()).toBe(true);
    await expect(page.locator('#species-count')).toHaveText('2');
    timings[grouping] = Date.now() - started;
  }
  await page.locator('#zoom-in').click();
  await page.locator('[data-metric="checklists"]').click();
  expect(errors).toEqual([]);
  await testInfo.attach('map.png', { body: await page.screenshot(), contentType: 'image/png' });
  await testInfo.attach('map-view-timings.json', { body: JSON.stringify(timings), contentType: 'application/json' });
});
