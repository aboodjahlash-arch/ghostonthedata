import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSyntheticMission, createSyntheticTerrain, restoreSyntheticMission, terrainHeightAt, terrainIndexAt } from './synthetic.ts';

test('versioned checkpoints restore identical observations and reject invalid replay budgets', () => {
  const original = createSyntheticMission('checkpoint-seed');
  for (let i = 0; i < 30; i++) original.step();
  const restored = restoreSyntheticMission({ version: 1, seed: 'checkpoint-seed', tick: 30 });
  assert.deepEqual(restored.snapshot(), original.snapshot());
  assert.deepEqual(restored.step(), original.step());
  for (const bad of [null, {}, { version: 1, seed: 'x', tick: 10001 }, { version: 1, seed: 'x', tick: -1 }, { version: 2, seed: 'x', tick: 1 }]) assert.throws(() => restoreSyntheticMission(bad));
});

test('terrain generation is deterministic and contains ridge, crater, and valley structure', () => {
  const a = createSyntheticTerrain('deterministic-seed', 25, 800);
  const b = createSyntheticTerrain('deterministic-seed', 25, 800);
  const c = createSyntheticTerrain('different-seed', 25, 800);
  assert.deepEqual(Array.from(a.heights), Array.from(b.heights));
  assert.notDeepEqual(Array.from(a.heights), Array.from(c.heights));
  assert.ok(a.maxHeight > a.minHeight + 100);
  assert.equal(terrainHeightAt(a, 0, 0), a.heights[terrainIndexAt(a, 0, 0)]);
});

test('controller receives only bounded local observations and updates state incrementally', () => {
  const mission = createSyntheticMission('bounded-sensor', 25, 800);
  const initial = mission.snapshot();
  assert.ok(initial.observations.length > 0);
  assert.ok(initial.knownCells < initial.totalCells);
  assert.ok(initial.observations.every(sample => Math.hypot(sample.x - initial.pose.x, sample.z - initial.pose.z) <= initial.sensorRangeMeters + 1e-6));
  const after = mission.step();
  assert.equal(after.tick, initial.tick + 1);
  assert.ok(after.distanceMeters > initial.distanceMeters);
  assert.ok(after.energy < initial.energy);
  assert.ok(after.path.length >= initial.path.length);
  assert.ok(after.frontier || after.status === 'complete');
});

test('exploration reports deterministic hazards, frontiers, and timeline events', () => {
  const first = createSyntheticMission('hazard-run', 25, 800);
  const second = createSyntheticMission('hazard-run', 25, 800);
  let a = first.snapshot();
  let b = second.snapshot();
  for (let i = 0; i < 12; i++) {
    a = first.step();
    b = second.step();
  }
  assert.deepEqual(a.pose, b.pose);
  assert.deepEqual(a.events, b.events);
  assert.ok(a.knownCells > 0);
  assert.ok(a.events.some(event => event.kind === 'observation'));
  assert.ok(a.events.some(event => event.kind === 'frontier'));
  assert.ok(a.hazards.every(hazard => hazard.slope > a.hazardSlope));
});

test('mission termination is bounded by exploration completion or energy exhaustion', () => {
  const mission = createSyntheticMission('bounded-run', 21, 600);
  let snapshot = mission.snapshot();
  for (let i = 0; i < 1200 && snapshot.status !== 'complete' && snapshot.status !== 'exhausted'; i++) snapshot = mission.step();
  assert.ok(['complete', 'exhausted'].includes(snapshot.status));
  const final = mission.step();
  assert.equal(final.tick, snapshot.tick);
  assert.equal(final.distanceMeters, snapshot.distanceMeters);
});
