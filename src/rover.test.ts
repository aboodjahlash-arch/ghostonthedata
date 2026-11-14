import test from 'node:test';
import assert from 'node:assert/strict';
import { createPlayback, advancePlayback, distance } from './rover.ts';
const points = [{ longitude: 77, latitude: 18, height: 0 }, { longitude: 77.0001, latitude: 18, height: 0 }, { longitude: 77.0002, latitude: 18, height: 0 }];
test('route execution traverses every segment and terminates exactly at endpoint', () => {
  let state = createPlayback(points);
  for (let i = 0; i < 20; i++) state = advancePlayback(state, points, 1);
  assert.equal(state.status, 'arrived');
  assert.deepEqual(state.position, points[2]);
  assert.ok(Math.abs(state.distance - distance(points[0], points[1]) - distance(points[1], points[2])) < 0.001);
  assert.ok(state.battery < 100);
  assert.equal(advancePlayback(state, points, 1), state);
});
test('invalid routes and time inputs are rejected', () => {
  assert.throws(() => createPlayback([]));
  assert.throws(() => createPlayback([{ longitude: NaN, latitude: 0 }, points[0]]));
  assert.throws(() => advancePlayback(createPlayback(points), points, -1));
});
test('zero-length segments, timestep clamping and battery exhaustion are safe', () => {
  assert.equal(advancePlayback(createPlayback([points[0], points[0]]), [points[0], points[0]], 1).status, 'arrived');
  const start = createPlayback(points);
  assert.ok(advancePlayback(start, points, 1000, 0.1).distance <= 1);
  const depleted = advancePlayback({ ...start, battery: 0.001 }, points, 1, 10);
  assert.equal(depleted.status, 'stopped');
  assert.ok(depleted.distance <= 0.5);
});
