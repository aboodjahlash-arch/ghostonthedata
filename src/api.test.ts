import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApi, safeImageUrl, validateCoordinate } from './api.ts';
test('coordinates reject invalid ranges and nonfinite values', () => {
  assert.equal(validateCoordinate({ longitude: 77.58, latitude: 18.44 }), true);
  for (const point of [{ longitude: 181, latitude: 0 }, { longitude: 0, latitude: -91 }, { longitude: NaN, latitude: 0 }, { longitude: 0, latitude: 0, height: Infinity }]) assert.equal(validateCoordinate(point), false);
});
test('source imagery only permits HTTP protocols', () => {
  assert.equal(safeImageUrl('javascript:alert(1)'), undefined);
  assert.equal(safeImageUrl('data:text/html,test'), undefined);
  assert.equal(safeImageUrl('https://example.org/image.jpg'), 'https://example.org/image.jpg');
});
test('typed client handles service errors, malformed payloads, and route requests', async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response('{}', { status: 503 });
    await assert.rejects(createApi('http://localhost').mission(), /503/);
    globalThis.fetch = async () => new Response(JSON.stringify({ region: { center: { latitude: 95, longitude: 0 } }, targets: [], layers: [] }));
    await assert.rejects(createApi('http://localhost').mission(), /contract/);
    globalThis.fetch = async () => new Response(JSON.stringify({ routes: [{ coordinates: [] }] }));
    await assert.rejects(createApi('http://localhost').routes('region', { latitude: 0, longitude: 0 }, { latitude: 1, longitude: 1 }, []), /route/);
    globalThis.fetch = async (url, options) => { assert.equal(url, 'http://localhost/api/routes'); assert.equal(options?.method, 'POST'); assert.deepEqual(JSON.parse(options?.body as string).targetIds, ['target-1']); return new Response('{"routes":[]}'); };
    assert.deepEqual(await createApi('http://localhost/').routes('region', { latitude: 0, longitude: 0 }, { latitude: 1, longitude: 1 }, ['target-1']), []);
    const region = { id: 'test-only', name: 'SIMULATED TEST REGION', description: 'Test fixture only', center: { latitude: 18.44, longitude: 77.58 } };
    globalThis.fetch = async () => new Response(JSON.stringify({ region, targets: [], layers: [] }));
    assert.equal((await createApi('http://localhost').mission()).region.id, 'test-only');
    globalThis.fetch = async () => new Response(JSON.stringify({ region, targets: [null], layers: [] }));
    await assert.rejects(createApi('http://localhost').mission(), /contract/);
    globalThis.fetch = async () => new Response(JSON.stringify({ experiments: [{ id: 'test', name: 'TEST', modelVersion: 'test', status: 'test', updatedAt: 'test', family: 'false-alarm', metrics: { invalid: 'not numeric' } }] }));
    await assert.rejects(createApi('http://localhost').experiments(), /experiment/);
    const controller = new AbortController(); controller.abort();
    globalThis.fetch = async (_url, options) => { assert.equal(options?.signal, controller.signal); throw new DOMException('Aborted', 'AbortError'); };
    await assert.rejects(createApi('http://localhost').mission(controller.signal), { name: 'AbortError' });
  } finally { globalThis.fetch = original; }
});
