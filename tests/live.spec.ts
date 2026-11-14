import { test, expect } from '@playwright/test';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

async function evidenceFolder(name: string) {
  return process.env.GHOST_EVIDENCE_DIR ? mkdtemp(join(process.env.GHOST_EVIDENCE_DIR, `${name}-`)) : undefined;
}
async function saveEvidence(folder: string | undefined, name: string, data: unknown) {
  if (folder) await writeFile(join(folder, name), JSON.stringify(data, null, 2), { flag: 'wx' });
}

test('opt-in live backend: Mars analysis, route execution and genuine PDS metadata', async ({ page }) => {
  test.skip(process.env.GHOST_LIVE !== '1', 'Requires the real local ML backend and external PDS network; no intercepted fixtures.');
  test.setTimeout(240000);
  const evidence = await evidenceFolder('live-mars');
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.getByText('Data service connected', { exact: true })).toBeVisible({ timeout: 30000 });
  await expect(page.locator('.cesium-map canvas')).toBeVisible();
  await expect(page.locator('.connection-banner')).not.toContainText('Spatial alignment unverified');
  if (evidence) await page.screenshot({ path: join(evidence, 'mission-overview.png') });
  const analysis = page.waitForResponse(response => response.url().includes('/api/analyze') && response.request().method() === 'POST', { timeout: 130000 });
  await page.locator('.target-row').first().click();
  const analysisResponse = await analysis;
  expect(analysisResponse.status()).toBe(200);
  await saveEvidence(evidence, 'analysis.json', await analysisResponse.json());
  const image = page.locator('.target-image');
  await expect(image).toBeVisible();
  await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.naturalWidth)).toBeGreaterThan(0);
  if (evidence) await page.locator('.intelligence').screenshot({ path: join(evidence, 'target-analysis.png') });
  await page.getByRole('button', { name: 'Use as destination' }).click();
  await page.getByRole('button', { name: 'Use backend landing site' }).click();
  const route = page.waitForResponse(response => response.url().includes('/api/plan-route'), { timeout: 130000 });
  await page.getByRole('button', { name: 'Request mission route' }).click();
  const planned = await route;
  expect(planned.status()).toBe(200);
  const routeData = await planned.json();
  expect(routeData.found).toBe(true);
  await saveEvidence(evidence, 'backend-route.json', routeData);
  await page.getByRole('button', { name: 'Execute simulated route' }).click();
  await expect(page.getByText(/moving ·/)).toBeVisible();
  await page.getByRole('button', { name: 'Pause playback' }).click();
  await expect(page.locator('.cesium-widget-errorPanel')).toHaveCount(0);
  expect(errors).toEqual([]);
  if (evidence) {
    await page.locator('.planner').screenshot({ path: join(evidence, 'guided-route-controls.png') });
    await page.locator('.map-wrap').screenshot({ path: join(evidence, 'mars-reference-and-route.png') });
    await page.screenshot({ path: join(evidence, 'route-planning.png') });
    await saveEvidence(evidence, 'layer-availability.json', await page.locator('.layer-control').evaluateAll(elements =>
      elements.map(element => ({ label: element.textContent, disabled: element.querySelector('input')?.disabled }))));
  }
  await page.getByRole('button', { name: 'Scientific Knowledge', exact: true }).click();
  const discovery = page.waitForResponse(response => response.url().includes('/api/discovery/products?'), { timeout: 45000 });
  await page.getByRole('button', { name: 'Search NASA PDS' }).click();
  const response = await discovery;
  expect(response.status()).toBe(200);
  const metadata = await response.json();
  expect(metadata.items.length).toBeGreaterThan(0);
  expect(metadata.query.q).toContain('title LIKE "Mars*"');
  expect(metadata.items.every((item: { title: string }) => /mars/i.test(item.title))).toBe(true);
  await expect(page.getByText(/metadata only; no asset retrieved/).first()).toBeVisible();
  await expect(page.locator('.cesium-widget-errorPanel')).toHaveCount(0);
  await saveEvidence(evidence, 'pds-metadata.json', metadata);
  await saveEvidence(evidence, 'verification.json', {
    verifiedAt: new Date().toISOString(), intercepted: false,
    backend: 'real local dataset/model and measured cached MOLA',
    routeExecution: 'guided simulated playback, not autonomous Mars driving',
    visualization: 'Reference ellipsoid unless authenticated tiles are configured; not a MOLA surface rendering',
    pageErrors: errors,
    pds: 'live registry metadata request; metadata is not a measured comparison',
  });
  if (evidence) await page.screenshot({ path: join(evidence, 'pds-results.png') });
});

test('opt-in live synthetic observations reach research service and PDS without becoming rover commands', async ({ page }) => {
  test.skip(process.env.GHOST_LIVE !== '1', 'Requires a live backend and PDS; use an unconfigured OpenRouter model to verify no-key fallback without paid calls.');
  test.setTimeout(180000);
  const evidence = await evidenceFolder('live-synthetic');
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Synthetic Exploration', exact: true }).click();
  const sandbox = page.getByRole('region', { name: 'Deterministic synthetic exploration sandbox' });
  const research = sandbox.getByRole('region', { name: 'Optional scientific research assistant' });
  await sandbox.getByRole('button', { name: 'Start', exact: true }).click();
  await expect(sandbox.getByText(/Static-depth repeat, not independent/).first()).toBeVisible({ timeout: 45000 });
  await research.getByRole('checkbox').check();
  const pending = page.waitForResponse(r => r.url().includes('/api/research/interpret'), { timeout: 35000 });
  await research.getByRole('button', { name: 'Interpret observed evidence' }).click();
  const response = await pending;
  expect(response.status()).toBe(200);
  const body = await response.json();
  const sent = response.request().postDataJSON();
  expect(body.observation_summary).toEqual(sent.observations);
  expect(body.observation_summary.every((o: { source: string }) => o.source === 'synthetic')).toBe(true);
  expect(body.datasets.length).toBeGreaterThan(0);
  expect(body.comparisons.length).toBe(sent.observations.length * body.datasets.length);
  expect(body.comparisons.every((c: { kind: string; measured_properties_compared: boolean }) => c.kind === 'metadata_context_only' && !c.measured_properties_compared)).toBe(true);
  expect(['available', 'unavailable']).toContain(body.status);
  if (body.status === 'unavailable') expect(body.interpretations).toEqual([]);
  await expect(research.getByRole('status')).toContainText('autonomy is unaffected');
  await expect(sandbox.getByRole('button', { name: 'Pause', exact: true })).toBeEnabled();
  await sandbox.getByRole('button', { name: 'Pause', exact: true }).click();
  if (evidence) {
    await saveEvidence(evidence, 'research-request.json', sent);
    await saveEvidence(evidence, 'research-response.json', body);
    await sandbox.screenshot({ path: join(evidence, 'synthetic-investigation.png') });
    const download = page.waitForEvent('download');
    await sandbox.getByRole('button', { name: 'Export synthetic survey' }).click();
    await (await download).saveAs(join(evidence, 'synthetic-survey.json'));
    await saveEvidence(evidence, 'verification.json', {
      verifiedAt: new Date().toISOString(), intercepted: false,
      provenance: 'synthetic observations and predictions; PDS registry metadata only',
      providerStatus: body.status, providerReason: body.reason,
      roverContinuedAfterResearch: true,
    });
  }
});
