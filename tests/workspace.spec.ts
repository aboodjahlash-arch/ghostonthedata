import { test, expect, type Page } from '@playwright/test';
import { backendFixture, backendExperiments, capturedCatalog } from './backend-fixtures.ts';
async function capturedBackend(page: Page) {
  const analysis = backendFixture('analyze_response');
  const catalog = capturedCatalog();
  const a = analysis.selected[0];
  const bounds = a.provenance.extra.bbox_deg;
  catalog.items.unshift({ ...a, image_url: `/api/targets/${encodeURIComponent(a.target_id)}/image`, split: 'fixture-projection', bbox: { west_deg: bounds[0], south_deg: bounds[1], east_deg: bounds[2], north_deg: bounds[3] } });
  catalog.count = catalog.total = catalog.items.length;
  const payloads: Record<string, unknown> = { '/api/health': backendFixture('health'), '/api/mission/region': backendFixture('mission_region'), '/api/map/layers': backendFixture('map_layers'), '/api/targets': catalog, '/api/experiments': backendExperiments(), '/api/analyze': analysis, '/api/plan-route': backendFixture('plan_route_response') };
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/image')) return route.fulfill({ status: 404 });
    return path in payloads ? route.fulfill({ json: payloads[path] }) : route.fulfill({ status: 404, json: { error: { code: 'http_404', message: 'Unexpected test endpoint' } } });
  });
  return { catalog, analysis, payloads };
}
test('offline workspace labels reference geometry and unavailable science', async ({ page }) => {
  await page.route('**/api/**', route => route.abort());
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Mission Control', exact: true })).toBeVisible();
  await expect(page.getByText('REFERENCE GLOBE', { exact: true })).toBeVisible();
  await expect(page.getByText('No scientific targets received')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Request mission route' })).toBeDisabled();
  await page.getByRole('button', { name: 'Research Lab', exact: true }).click();
  await expect(page.getByText('No experiment records')).toHaveCount(3);
  await page.getByRole('button', { name: 'Mission Reports', exact: true }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export JSON report' }).click();
  expect((await download).suggestedFilename()).toBe('ghost-mission-report.json');
});
test('backend capture fixtures: target evidence, one route result, research history, and spatial safeguards', async ({ page }) => {
  const { analysis } = await capturedBackend(page);
  const a = analysis.selected[0];
  await page.goto('/');
  await page.getByRole('button', { name: new RegExp(a.target_id) }).click();
  await expect(page.getByRole('heading', { name: a.target_id, exact: true })).toBeVisible();
  await expect(page.getByText(a.why.join('\n'), { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Use as destination' }).click();
  await page.getByRole('button', { name: 'Use backend landing site' }).click();
  const request = page.waitForRequest('**/api/plan-route');
  await page.getByRole('button', { name: 'Request mission route' }).click();
  const body = (await request).postDataJSON();
  expect(Object.keys(body).sort()).toEqual(['goal', 'start', 'waypoints']);
  expect(body.waypoints).toEqual([]);
  await expect(page.getByText('Backend route · single backend result', { exact: true })).toBeVisible();
  await expect(page.getByText(/Spatial route rendering is disabled pending/)).toBeVisible();
  await expect(page.getByLabel('Route alternative')).toHaveCount(0);
  await expect(page.getByRole('checkbox', { name: /Geological units/ })).toBeDisabled();
  await expect(page.locator('.cesium-widget-errorPanel')).toHaveCount(0);
  await page.getByRole('button', { name: 'Research Lab', exact: true }).click();
  await expect(page.getByRole('heading', { name: backendExperiments().items[0].config.name, exact: true })).toBeVisible();
  await expect(page.getByText('by_class.false_alarm.detected_rate_at_95pct', { exact: true })).toBeVisible();
});
test('dataset_missing and model_missing remain unavailable while metadata survives', async ({ page }) => {
  await capturedBackend(page);
  await page.route('**/api/health', route => route.fulfill({ json: { ...backendFixture<any>('health'), status: 'degraded', dataset: { ready: false }, model: { ready: false } } }));
  await page.route('**/api/targets?*', route => route.fulfill({ status: 503, json: { error: { code: 'dataset_missing', message: 'Dataset acquisition required', detail: { hint: 'Run pipeline' } } } }));
  await page.goto('/');
  await expect(page.getByText('Backend partially available', { exact: true })).toBeVisible();
  await expect(page.getByRole('status')).toContainText('dataset_missing');
  await expect(page.getByRole('status')).toContainText('Anomaly detection not trained');
  await expect(page.getByText('No scientific targets received')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Request mission route' })).toBeDisabled();
});
test('failed refresh clears prior records, selected evidence and routes rather than showing stale success', async ({ page }) => {
  const { catalog } = await capturedBackend(page);
  await page.goto('/');
  await expect(page.getByRole('button', { name: new RegExp(catalog.items[0].target_id) })).toBeVisible();
  await page.route('**/api/**', route => route.abort());
  await page.getByRole('button', { name: 'Sync data' }).click();
  await expect(page.getByText('No scientific targets received')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Request mission route' })).toBeDisabled();
  await page.getByRole('button', { name: 'Research Lab', exact: true }).click();
  await expect(page.getByText('No experiment records')).toHaveCount(3);
});
