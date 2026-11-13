import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ApiError, createApi, flattenMetrics, safeImageUrl, SPATIAL_ALIGNMENT_VERIFIED, validateCoordinate, type Coordinate, type Target } from './api.ts';
import { backendFixture, backendExperiments, capturedCatalog } from '../tests/backend-fixtures.ts';
const base = 'http://localhost:8000';
const point: Coordinate = { longitude: 77.45, latitude: 18.44, frame: 'backend-unverified' };
const response = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
const captured = () => ({ '/api/health': backendFixture('health'), '/api/mission/region': backendFixture('mission_region'), '/api/map/layers': backendFixture('map_layers') });
async function mockFetch(fn: typeof fetch, run: () => Promise<void>) { const original = globalThis.fetch; try { globalThis.fetch = fn; await run(); } finally { globalThis.fetch = original; } }
test('coordinates reject invalid ranges and nonfinite values', () => {
  assert.equal(validateCoordinate(point), true);
  for (const p of [{ longitude: 181, latitude: 0 }, { longitude: 0, latitude: -91 }, { longitude: NaN, latitude: 0 }, { longitude: 0, latitude: 0, height: Infinity }]) assert.equal(validateCoordinate(p), false);
});
test('source imagery only permits HTTP protocols', () => {
  assert.equal(safeImageUrl('javascript:alert(1)'), undefined);
  assert.equal(safeImageUrl('data:text/html,test'), undefined);
  assert.equal(safeImageUrl('https://example.org/image.jpg'), 'https://example.org/image.jpg');
});
test('typed client handles service errors, malformed payloads, and route requests', async () => {
  await mockFetch(async () => response({}, 503), async () => { await assert.rejects(createApi(base).health(), /503/); });
  await mockFetch(async () => response({ centre: { latitude_deg: 95, longitude_deg: 0 } }), async () => { await assert.rejects(createApi(base).region(), /contract/); });
  await mockFetch(async () => response({ found: true, path: [] }), async () => { await assert.rejects(createApi(base).routes('region', point, point, []), /route/); });
  await mockFetch(async (url, options) => { assert.equal(url, `${base}/api/plan-route`); assert.equal(options?.method, 'POST'); assert.deepEqual(JSON.parse(options?.body as string), { start: { longitude_deg: 77.45, latitude_deg: 18.44 }, goal: { longitude_deg: 77.45, latitude_deg: 18.44 }, waypoints: [] }); return response({ ...backendFixture<any>('plan_route_response'), found: false }); }, async () => { assert.deepEqual(await createApi(base).routes('region', point, point, ['not-a-waypoint']), []); });
  await mockFetch(async () => response({ items: [{ metrics: { invalid: 'not numeric' } }] }), async () => { await assert.rejects(createApi(base).experiments(), /experiment/); });
  const controller = new AbortController(); controller.abort();
  await mockFetch(async (_url, options) => { assert.equal(options?.signal?.aborted, true); throw new DOMException('Aborted', 'AbortError'); }, async () => { await assert.rejects(createApi(base).mission(controller.signal), { name: 'AbortError' }); });
});
test('actual backend captures compose mission metadata and paginate without dropping CRS or guessing height', async () => {
  const fixtures = captured(); const catalog = capturedCatalog(); let requests = 0;
  await mockFetch(async url => { const u = new URL(String(url)); if (u.pathname === '/api/targets') { requests++; const offset = Number(u.searchParams.get('offset')); assert.equal(u.searchParams.get('with_geology'), 'true'); const items = catalog.items.slice(offset, offset + 3); return response({ ...catalog, count: items.length, items }); } return response(fixtures[u.pathname as keyof typeof fixtures]); }, async () => {
    const mission = await createApi(base).mission(); assert.equal(requests, 3); assert.equal(mission.region.id, fixtures['/api/mission/region'].region_id); assert.equal(mission.region.crs, fixtures['/api/mission/region'].crs); assert.equal(mission.targets.length, catalog.items.length); assert.equal(mission.issues?.length, 0);
    const t = mission.targets[0]; assert.equal(t.id, catalog.items[0].target_id); assert.equal(t.coordinates.height, undefined); assert.equal(t.coordinates.frame, 'backend-unverified'); assert.equal(t.elevationMeters, catalog.items[0].elevation_m); assert.equal(t.priority, undefined); assert.equal(t.raw?.provenance.crs, catalog.items[0].provenance.crs); assert.ok(t.imageUrl?.startsWith(base)); assert.equal(mission.layers.every(l => l.status === 'unavailable' && l.crs && !l.geojson), true);
  });
});
test('503 dataset_missing is unavailable, not empty success; metadata survives partial failure', async () => {
  const fixtures = captured();
  await mockFetch(async url => { const u = new URL(String(url)); return u.pathname === '/api/targets' ? response({ error: { code: 'dataset_missing', message: 'Dataset acquisition required', detail: { hint: 'Run acquisition' } } }, 503) : response(u.pathname === '/api/health' ? { ...fixtures['/api/health'], dataset: { ready: false }, model: { ready: false } } : fixtures[u.pathname as keyof typeof fixtures]); }, async () => {
    const mission = await createApi(base).mission(); assert.equal(mission.region.id, 'jezero-crater'); assert.equal(mission.targets.length, 0); assert.ok(mission.issues?.some(i => i.code === 'dataset_missing')); assert.ok(mission.issues?.some(i => i.code === 'model_missing'));
  });
});
test('model_missing, empty_selection, error details and non-JSON errors stay distinguishable', async () => {
  for (const code of ['dataset_missing', 'model_missing', 'empty_selection']) await mockFetch(async () => response({ error: { code, message: 'Pipeline unavailable', detail: { hint: 'backend action' } } }, 503), async () => { await assert.rejects(createApi(base).health(), (error: unknown) => error instanceof ApiError && error.status === 503 && error.code === code && (error.detail as any).hint === 'backend action'); });
  await mockFetch(async () => new Response('Unavailable', { status: 502 }), async () => { await assert.rejects(createApi(base).health(), /http_502/); });
});
test('relative image URLs and colon IDs resolve against the API origin', async () => {
  const catalog = capturedCatalog(); catalog.items = [{ ...catalog.items[0], image_url: null, anomaly_score: null, priority: null, elevation_m: null }]; catalog.count = catalog.total = 1;
  await mockFetch(async () => response(catalog), async () => { const t = (await createApi(base).targets()).items[0]; assert.equal(t.imageUrl, `${base}/api/targets/${encodeURIComponent(t.id)}/image`); assert.equal(t.anomalyScore, undefined); assert.equal(t.elevationMeters, undefined); assert.equal(t.priorityScore, undefined); });
});
test('actual analysis capture preserves backend score, uncertainty, reasons, caveats and CRS', async () => {
  const wire = backendFixture('analyze_response'); const a = wire.selected[0];
  const target: Target = { id: a.target_id, name: a.target_id, coordinates: { longitude: a.longitude_deg, latitude: a.latitude_deg, frame: 'backend-unverified' }, provenance: { source: 'Backend captured target', classification: 'real' } };
  await mockFetch(async (url, options) => { assert.equal(url, `${base}/api/analyze`); const body = JSON.parse(options?.body as string); assert.deepEqual(body.target_ids, [target.id]); assert.equal(body.include_heatmaps, false); return response(wire); }, async () => { const result = await createApi(base).analyze(target); assert.equal(result.priorityScore, a.priority); assert.equal(result.priority, undefined); assert.equal(result.uncertainty, a.components.find((c: any) => c.name === 'uncertainty')?.value); assert.equal(result.explanation, a.why.join('\n')); assert.deepEqual(result.caveats, [...a.caveats, ...wire.disclaimers]); assert.equal(result.analysis?.crs, wire.crs); });
});
test('actual route capture keeps raw areoid elevations and GeoJSON but never enables spatial display or alternatives', async () => {
  const wire = backendFixture('plan_route_response');
  await mockFetch(async () => response(wire), async () => { const routes = await createApi(base).routes('region', point, point, []); assert.equal(routes.length, 1); assert.equal(routes[0].distanceMeters, wire.total_distance_m); assert.equal(routes[0].raw.path[0].elevation_m, wire.path[0].elevation_m); assert.deepEqual(routes[0].raw.geojson, wire.geojson); assert.equal(routes[0].coordinates[0].height, undefined); assert.equal(routes[0].spatialRendering, 'blocked'); assert.equal(SPATIAL_ALIGNMENT_VERIFIED, false); await assert.rejects(createApi(base).routes('region', { ...point, frame: 'cesium-reference' }, point, []), /datum_unresolved/); });
});
test('actual captured experiment history maps nested numbers, notes, missing models and genuine families', async () => {
  const capture = backendExperiments();
  await mockFetch(async () => response(capture), async () => { const experiments = await createApi(base).experiments(); assert.equal(experiments.length, capture.items.length); const first = experiments[0]; assert.equal(first.name, capture.items[0].config.name); assert.equal(first.modelVersion, capture.items[0].model_version_id ?? undefined); assert.equal(first.updatedAt, capture.items[0].created_at); assert.equal(first.metrics['test_metrics.auroc'], capture.items[0].metrics.test_metrics.auroc); assert.equal(first.metrics['by_class.false_alarm.detected_rate_at_95pct'], capture.items[0].metrics.by_class.false_alarm.detected_rate_at_95pct); assert.equal(first.metrics['by_class.false_alarm.is_anomaly'], undefined); assert.deepEqual(first.raw.metrics, capture.items[0].metrics); });
  assert.deepEqual(flattenMetrics({ missing: null, string: 'test', bool: false, nested: { missing: NaN, zero: 0, metric: 0.2 } }), { 'nested.zero': 0, 'nested.metric': 0.2 });
});
test('empty lists are valid while duplicate pagination and invalid scientific numbers are rejected', async () => {
  const catalog = capturedCatalog();
  await mockFetch(async () => response({ ...catalog, count: 0, total: 0, items: [] }), async () => { assert.deepEqual((await createApi(base).targets()).items, []); });
  await mockFetch(async () => response({ count: 0, items: [] }), async () => { assert.deepEqual(await createApi(base).experiments(), []); });
  await mockFetch(async () => response({ ...catalog, count: 1, items: [catalog.items[0]] }), async () => { await assert.rejects(createApi(base).targets(), /identifiers/); });
  await mockFetch(async () => response({ ...catalog, count: 1, total: 1, items: [{ ...catalog.items[0], anomaly_score: '0.9' }] }), async () => { await assert.rejects(createApi(base).targets(), /targets/); });
});
