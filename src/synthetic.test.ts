import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { stripTypeScriptTypes } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createSyntheticMission, createSyntheticTerrain, ENERGY_RESERVE, investigationRouteEnergy, InvestigationController, planSafeRoute, restoreSyntheticMission, terrainHeightAt, terrainIndexAt, type ControllerConfig, type TerrainCell } from './synthetic.ts';
import { createWorldSensor, getFixedMorphologyModel, renderPatch, TRAINING_SEEDS } from './synthetic-world.ts';
import { CLASSES, inferPatch, trainMorphologyModel, type CameraPatch, type Sensor } from './perception.ts';

test('numeric world is exactly e77e3f9 terrain, including original signed noise and Unicode seed hashing', async () => {
  const original = execFileSync('git', ['show', 'e77e3f9:src/synthetic.ts'], { cwd: fileURLToPath(new URL('..', import.meta.url)), encoding: 'utf8' }).replace(/\r\n/g, '\n');
  const moved = readFileSync(new URL('./synthetic-world.ts', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const originalFunctions = original.slice(original.indexOf('function seedValue('), original.indexOf('export function createSyntheticTerrain(')).trim();
  assert.ok(moved.includes(originalFunctions), 'Original procedural functions must be moved unchanged, not corrected or smoothed');
  const js = stripTypeScriptTypes(original.slice(0, original.indexOf('\nfunction slopeAt(')));
  const baseline = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
  for (const [seed, resolution, size] of [['ghost-synthetic', 31, 1200], ['alpha', 25, 800], ['🛰️-terrain', 17, 925], ['', 9, 1200]] as const) {
    const expected = baseline.createSyntheticTerrain(seed, resolution, size);
    const actual = createSyntheticTerrain(seed, resolution, size);
    assert.deepEqual(actual, expected);
    for (const [x, z] of [[0, 0], [-167.25, 91.5], [size / 2, -size / 2]]) {
      assert.equal(terrainHeightAt(actual, x, z), baseline.terrainHeightAt(expected, x, z));
    }
  }
});

test('version 2 checkpoints preserve configured replay and identical continued decisions; v1 rejected', () => {
  const mission = createSyntheticMission('checkpoint-seed', 25, 1200);
  for (let i = 0; i < 25; i++) mission.step();
  const checkpoint = JSON.parse(JSON.stringify(mission.checkpoint()));
  const restored = restoreSyntheticMission(checkpoint);
  assert.deepEqual(restored.snapshot(), mission.snapshot());
  for (let i = 0; i < 6; i++) assert.deepEqual(restored.step(), mission.step());
  for (const bad of [null, {}, { version: 1, seed: 'x', tick: 30 }, { ...checkpoint, tick: -1 },
    { ...checkpoint, tick: 10001 }, { ...checkpoint, modelVersion: 'old' }, { ...checkpoint, modelVersion: 'synthetic-morphology-knn-v2' },
    { ...checkpoint, modelVersion: 'synthetic-morphology-knn-v2-original-world-1' },
    { ...checkpoint, config: { ...checkpoint.config, hazardSlope: 9 } }]) assert.throws(() => restoreSyntheticMission(bad));
});

test('terrain and mission model independent seeds; terrain height API retained', () => {
  const a = createSyntheticTerrain('deterministic', 25, 800);
  assert.deepEqual(a, createSyntheticTerrain('deterministic', 25, 800));
  assert.notDeepEqual(a.heights, createSyntheticTerrain('other', 25, 800).heights);
  assert.ok(a.maxHeight - a.minHeight > 100);
  assert.equal(terrainHeightAt(a, 0, 0), a.heights[terrainIndexAt(a, 0, 0)]);
  assert.throws(() => createSyntheticMission(TRAINING_SEEDS[0]));
});

test('complete Discover Understand Investigate cycles use actual focused evidence and vary with seed', t => {
  const targets: number[][] = [];
  for (const seed of ['alpha', 'beta', 'gamma']) {
    const mission = createSyntheticMission(seed);
    let snapshot = mission.snapshot();
    assert.equal(snapshot.phase, 'Discover');
    assert.ok(snapshot.knownCells < snapshot.totalCells);
    const firstEvent = snapshot.events[0];
    assert.equal(mission.step().phase, 'Understand');
    assert.equal(mission.step().phase, 'Investigate');
    const initialSnapshotBytes = Buffer.byteLength(JSON.stringify(mission.snapshot()));
    for (let i = 0; i < 63; i++) snapshot = mission.step();
    const completed = snapshot.investigations.filter(e => e.status === 'completed');
    assert.ok(completed.length >= 2);
    for (const evidence of completed) {
      const survey = snapshot.captures.find(p => p.id === evidence.surveyCaptureId)!;
      const focused = snapshot.captures.find(p => p.id === evidence.focusedCaptureId)!;
      assert.ok(survey && focused);
      assert.ok(focused.tick > survey.tick);
      assert.equal(focused.index, evidence.target);
      assert.equal(evidence.predictedClass, inferPatch(getFixedMorphologyModel(), focused).feature);
      assert.ok(evidence.analyzedAt > focused.tick);
      assert.equal(evidence.evidenceKind, 'repeat-consistency-only');
      assert.equal(evidence.independentCorroboration, false);
      assert.deepEqual(focused.depth, survey.depth);
      assert.notDeepEqual(focused.rgb, survey.rgb);
    }
    assert.ok(snapshot.events.length > 160);
    assert.deepEqual(snapshot.events[0], firstEvent);
    assert.ok(snapshot.events.every((event, i) => event.sequence === i));
    const uniqueDepth = new Set(snapshot.captures.map(p => p.depth)), uniqueRgb = new Set(snapshot.captures.map(p => p.rgb));
    const uniquePixelValues = [...uniqueDepth, ...uniqueRgb].reduce((sum, a) => sum + a.length, 0);
    const expandedPixelValues = snapshot.captures.reduce((sum, p) => sum + p.depth.length + p.rgb.length, 0);
    assert.ok(uniquePixelValues < expandedPixelValues / 2);
    t.diagnostic(JSON.stringify({ seed, ticks: snapshot.tick, captures: snapshot.captures.length, events: snapshot.events.length,
      initialSnapshotBytes, laterSnapshotBytes: Buffer.byteLength(JSON.stringify(snapshot)), uniqueDepthArrays: uniqueDepth.size,
      uniqueRgbArrays: uniqueRgb.size, uniquePixelValues, expandedPixelValues }));
    assert.ok(!('truth' in snapshot));
    for (const o of snapshot.observations) {
      const p = snapshot.captures.find(p => p.id === o.captureId)!;
      assert.equal(o.feature, inferPatch(getFixedMorphologyModel(), p).feature);
      assert.equal(o.slope, inferPatch(getFixedMorphologyModel(), p).slope);
    }
    targets.push(completed.map(e => e.target));
  }
  assert.notDeepEqual(targets[0], targets[1]);
});

test('increments cannot snap early to a waypoint and distance matches physical travel', () => {
  const mission = createSyntheticMission('alpha');
  mission.step(); const selected = mission.step();
  const first = selected.plannedRoute[0];
  let s = mission.step();
  assert.equal(s.distanceMeters, 18);
  assert.equal(s.pose.cellIndex, selected.pose.cellIndex);
  assert.ok(Math.hypot(s.pose.x - first.x, s.pose.z - first.z) > 0);
  for (let i = 0; i < 5; i++) {
    const before = s; s = mission.step();
    const physical = Math.hypot(s.pose.x - before.pose.x, s.pose.z - before.pose.z);
    assert.ok(physical <= 18 + 1e-9);
    assert.ok(Math.abs(s.distanceMeters - before.distanceMeters - physical) < 1e-8);
  }
});

test('safe planner excludes unknown and hazards, blocks diagonal corner cuts, never falls back', () => {
  const cell = (index: number, hazard = false): TerrainCell => ({ index, x: index % 3, z: Math.floor(index / 3), height: 0, slope: hazard ? 1 : 0, hazard, feature: 'plain' });
  const map = new Map([0, 1, 2, 3, 4, 5, 6, 7, 8].map(i => [i, cell(i)]));
  map.set(1, cell(1, true)); map.set(3, cell(3, true));
  assert.equal(planSafeRoute(0, 4, map, 3), undefined);
  assert.equal(planSafeRoute(0, 8, map, 3), undefined);
  map.set(1, cell(1));
  assert.deepEqual(planSafeRoute(0, 4, map, 3), [0, 1, 4]);
  map.delete(1);
  assert.equal(planSafeRoute(0, 8, map, 3), undefined);
});

const config: ControllerConfig = { resolution: 31, spacingMeters: 40, sensorRangeMeters: 145, hazardSlope: 0.42, speedMetersPerTick: 18, energyMax: 100 };
test('retained frozen sensor pixels share only within a snapshot; metadata and external mutations cannot affect internal state', () => {
  const raw: CameraPatch[] = [];
  const sensor = createWorldSensor(createSyntheticTerrain('alpha'), 145);
  const c = new InvestigationController({ capture: (...args) => {
    const packets = sensor.capture(...args); raw.push(...packets); return packets;
  } }, getFixedMorphologyModel(), config);
  c.step(); c.step();
  const snapshot = c.step();
  const first = snapshot.captures.find(p => p.tick === 0 && p.index === 41)!;
  const repeated = snapshot.captures.find(p => p.tick > 0 && p.index === 41)!;
  assert.ok(first && repeated);
  assert.notEqual(first.id, repeated.id);
  assert.notEqual(first.tick, repeated.tick);
  assert.equal(first.depth, repeated.depth);
  assert.equal(first.rgb, repeated.rgb);
  assert.notEqual(first.center, repeated.center);
  assert.notEqual(first.metadata, repeated.metadata);
  assert.notEqual(first.depth, raw.find(p => p.id === first.id)!.depth);
  const latest = snapshot.observations.find(o => o.index === 41)!;
  assert.equal(latest.observedAt, repeated.tick);
  assert.equal(latest.captureId, repeated.id);
  const expected = c.snapshot();
  first.depth[0] = 9999; first.rgb[0] = 0;
  first.center.x = 9999; first.metadata.lighting = 9;
  snapshot.sensorSampling.maximumSampleRangeMeters = 0;
  const exposedRaw = raw.find(p => p.id === first.id)!;
  exposedRaw.center.x = 8888; exposedRaw.metadata.lighting = 8;
  exposedRaw.metadata.sampling!.centerRangeMeters = 8888;
  assert.throws(() => { exposedRaw.depth[0] = 7777; }, TypeError);
  assert.deepEqual(c.snapshot(), expected);
  const fresh = c.snapshot();
  assert.notEqual(fresh.captures[0].depth, expected.captures[0].depth);
  assert.equal(snapshot.sensorRangeMeters, 145);
  assert.equal(expected.sensorSampling.maximumSampleRangeMeters, 145 + Math.SQRT2 * 40);
});

test('mutable reused sensor buffers are cloned and frozen on ingress, and each new frame is inferred rather than cached by index', () => {
  const world = createSyntheticTerrain('mutable-sensor-fixture');
  const mutable = [41, 42].map(index => {
    const p = renderPatch(world, index); p.depth.fill(0); return p;
  });
  let sequence = 0;
  const sensor: Sensor = { capture(_, tick) {
    return mutable.map(p => ({ ...p, id: `mutable-${sequence++}`, tick }));
  } };
  const c = new InvestigationController(sensor, getFixedMorphologyModel(), config);
  const initial = c.snapshot();
  const initialCapture = initial.captures.find(p => p.index === 41)!;
  mutable.forEach(p => p.depth.fill(1));
  mutable[0].rgb.fill(1);
  assert.deepEqual(c.snapshot(), initial);
  c.step(); c.step();
  const next = c.step();
  const newObservation = next.observations.find(o => o.index === 41)!;
  assert.equal(newObservation.height, 1);
  assert.equal(newObservation.observedAt, next.tick);
  const retainedOld = next.captures.find(p => p.id === initialCapture.id)!;
  const retainedNew = next.captures.find(p => p.id === newObservation.captureId)!;
  assert.equal(retainedOld.depth[0], 0);
  assert.equal(retainedNew.depth[0], 1);
  assert.notEqual(retainedOld.depth, retainedNew.depth);
  const expected = c.snapshot();
  mutable.forEach(p => { p.depth.fill(9999); p.rgb.fill(255); });
  assert.deepEqual(c.snapshot(), expected);
});

test('deployment site is seed independent; unsafe actual original-world seeds stop honestly without teleporting', () => {
  for (const seed of ['alpha', 'beta', 'gamma']) {
    const m = createSyntheticMission(seed, 31, 800);
    const s = m.snapshot();
    assert.equal(s.status, 'blocked');
    assert.equal(s.pose.cellIndex, 41);
    assert.equal(s.distanceMeters, 0);
    assert.ok(s.observations.find(o => o.index === 41)!.hazard);
    assert.deepEqual(m.step(), s);
  }
});

test('route admission budgets discrete movement, focused capture and analysis without spending protected reserve', () => {
  const world = createSyntheticTerrain('energy-fixture');
  const sensor: Sensor = { capture(position, tick, focused) {
    const indices = focused ? [position.x === -160 ? 42 : 41] : [41, 42];
    return indices.map(index => { const p = renderPatch(world, index, tick); p.depth.fill(0); return p; });
  } };
  const refused = new InvestigationController(sensor, getFixedMorphologyModel(), { ...config, energyMax: 11 });
  refused.step();
  const noBudget = refused.step();
  assert.equal(noBudget.status, 'exhausted');
  assert.equal(noBudget.distanceMeters, 0);
  const c = new InvestigationController(sensor, getFixedMorphologyModel(), { ...config, energyMax: 11.3 });
  c.step();
  let s = c.step();
  assert.ok(s.frontier);
  const required = investigationRouteEnergy([s.pose, ...s.plannedRoute], 18);
  assert.ok(required <= s.energy - ENERGY_RESERVE);
  const admittedEnergy = s.energy;
  for (let i = 0; i < 12 && ['ready', 'exploring'].includes(s.status); i++) {
    const before = s;
    s = c.step();
    assert.ok(s.energy >= ENERGY_RESERVE);
    assert.ok(s.energy <= before.energy);
  }
  assert.equal(s.status, 'exhausted');
  assert.equal(s.investigations.filter(e => e.status === 'completed').length, 1);
  assert.ok(Math.abs(admittedEnergy - s.energy - required) < 1e-8);
});

test('counterfactual sensor features change learned uncertainty/novelty and selected target at identical decision ticks', () => {
  const world = createSyntheticTerrain('ranking-fixture');
  const flat = (index: number, height: number, tick = 0): CameraPatch => {
    const p = renderPatch(world, index, tick); p.depth.fill(height); return p;
  };
  const training = CLASSES.flatMap((label, i) => Array.from({ length: 5 }, () => ({ patch: flat(41, i * 10), label })));
  const model = trainMorphologyModel(training, ['explicit-counterfactual-training-fixture']);
  const run = (height: number) => {
    const sensor: Sensor = { capture(_, tick) { return [flat(41, 0, tick), flat(42, 10, tick), flat(72, height, tick)]; } };
    const c = new InvestigationController(sensor, model, config);
    c.step(); return c.step();
  };
  const baseline = run(20), ambiguous = run(15), novel = run(1000);
  assert.equal(baseline.tick, ambiguous.tick);
  assert.equal(baseline.frontier!.cellIndex, 42);
  assert.equal(ambiguous.frontier!.cellIndex, 72);
  assert.equal(novel.frontier!.cellIndex, 72);
  const b = baseline.observations.find(o => o.index === 72)!;
  const a = ambiguous.observations.find(o => o.index === 72)!;
  const n = novel.observations.find(o => o.index === 72)!;
  assert.ok(a.uncertainty > b.uncertainty);
  assert.ok(n.novelty > b.novelty + 1);
  assert.ok([baseline, ambiguous, novel].every(s => s.observations.every(o => !o.hazard)));
});
test('empty, throwing, malformed, and mid-mission failed sensors stop without unsafe movement', () => {
  const world = createSyntheticTerrain('alpha');
  const normal = createWorldSensor(world, 145);
  const bad = renderPatch(world, 41); bad.depth[0] = NaN;
  for (const sensor of [{ capture: () => [] }, { capture: () => { throw Error('offline'); } }, { capture: () => [bad] }] satisfies Sensor[]) {
    const c = new InvestigationController(sensor, getFixedMorphologyModel(), config);
    assert.equal(c.snapshot().status, 'sensor-fault');
    assert.equal(c.step().distanceMeters, 0);
  }
  let working = true;
  const c = new InvestigationController({ capture: (...args) => working ? normal.capture(...args) : [] }, getFixedMorphologyModel(), config);
  c.step(); c.step(); working = false;
  const stopped = c.step();
  assert.equal(stopped.status, 'sensor-fault');
  assert.equal(stopped.distanceMeters, 0);
  assert.ok(stopped.investigations.some(e => e.status === 'failed'));
  let sparse = false;
  const partial = new InvestigationController({ capture: (...args) => {
    const patches = normal.capture(...args);
    return sparse ? patches.filter(p => p.index === 41) : patches;
  } }, getFixedMorphologyModel(), config);
  partial.step(); partial.step(); sparse = true;
  assert.equal(partial.step().status, 'sensor-fault');
  assert.equal(partial.snapshot().distanceMeters, 0);
});

test('duplicate capture identities and overflow measurements cannot corrupt evidence or advance the rover', () => {
  const world = createSyntheticTerrain('alpha');
  const normal = createWorldSensor(world, 145);
  const seenId: Sensor = { capture: (...args) => normal.capture(...args).map(p => ({ ...p, id: 'duplicate' })) };
  assert.equal(new InvestigationController(seenId, getFixedMorphologyModel(), config).snapshot().status, 'sensor-fault');
  const invalid: Sensor = { capture: (...args) => normal.capture(...args).map(p => ({
    ...p, depth: p.depth.map((_, i) => i % 2 ? 1e308 : -1e308)
  })) };
  const controller = new InvestigationController(invalid, getFixedMorphologyModel(), config);
  assert.equal(controller.snapshot().status, 'sensor-fault');
  assert.equal(controller.step().distanceMeters, 0);
});

test('unreachable targets are recorded; no reachable route is not success; terminal calls are stable', () => {
  const world = createSyntheticTerrain('alpha');
  const sensor: Sensor = { capture(_, tick) {
    return [41, 43].map(index => {
      const p = renderPatch(world, index, tick); p.depth.fill(0);
      return p;
    });
  } };
  const c = new InvestigationController(sensor, getFixedMorphologyModel(), config);
  c.step(); const blocked = c.step();
  assert.equal(blocked.status, 'blocked');
  assert.equal(blocked.distanceMeters, 0);
  assert.ok(blocked.investigations.some(e => e.target === 43 && e.status === 'failed'));
  assert.deepEqual(c.step(), blocked);
});

test('energy exhaustion remains distinct from completed investigations', () => {
  const world = createSyntheticTerrain('alpha');
  const c = new InvestigationController(createWorldSensor(world, 145), getFixedMorphologyModel(), { ...config, energyMax: 0.1 });
  const s = c.step();
  assert.equal(s.status, 'exhausted');
  assert.deepEqual(c.step(), s);
});
