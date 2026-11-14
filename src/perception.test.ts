import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CLASSES, evaluateMorphology, inferPatch, trainMorphologyModel } from './perception.ts';
import { createSyntheticTerrain, createWorldSensor, getFixedMorphologyModel, HOLDOUT_SEEDS, labeledWorldSamples, renderPatch, TRAINING_SEEDS } from './synthetic-world.ts';

test('fixed supervised training learns deterministic parameters independently of mission worlds', () => {
  const a = getFixedMorphologyModel();
  assert.equal(a.metadata.trainingSamples, 1875);
  const b = trainMorphologyModel(labeledWorldSamples(TRAINING_SEEDS), TRAINING_SEEDS);
  assert.deepEqual(a, b);
  createWorldSensor(createSyntheticTerrain('unseen-mission'), 145).capture({ x: 0, z: 0 }, 0, false);
  assert.equal(getFixedMorphologyModel(), a);
  assert.ok(a.scales.every(v => v > 0));
});

test('heldout depth-morphology confusion, unused RGB lighting invariance, and depth-bias failure', t => {
  const model = getFixedMorphologyModel();
  assert.ok(HOLDOUT_SEEDS.every(seed => !model.metadata.trainingSeeds.includes(seed)));
  const normal = evaluateMorphology(model, labeledWorldSamples(HOLDOUT_SEEDS), 0.8);
  const dim = evaluateMorphology(model, labeledWorldSamples(HOLDOUT_SEEDS, 0.15), 0.15);
  const biased = labeledWorldSamples(HOLDOUT_SEEDS).map(s => ({ ...s, patch: { ...s.patch, depth: s.patch.depth.map(v => v + 500) } }));
  const depthBias = evaluateMorphology(model, biased, 0.8);
  const supports = CLASSES.map(label => Object.values(normal.confusion[label]).reduce((a, b) => a + b, 0));
  const recalls = CLASSES.map((label, i) => normal.confusion[label][label] / supports[i]);
  const majorityBaseline = Math.max(...supports) / normal.samples;
  const balancedAccuracy = recalls.reduce((a, b) => a + b, 0) / CLASSES.length;
  t.diagnostic(JSON.stringify({ normal, dim, outOfDomainDepthBias500m: depthBias, perClassRecall: Object.fromEntries(CLASSES.map((c, i) => [c, recalls[i]])), majorityBaseline, balancedAccuracy }));
  assert.equal(normal.samples, 1250);
  assert.ok(normal.accuracy > majorityBaseline + 0.05);
  assert.ok(balancedAccuracy > 1 / CLASSES.length + 0.1);
  assert.deepEqual(normal.confusion, dim.confusion);
  assert.ok(depthBias.accuracy < normal.accuracy);
  assert.ok(recalls.every(recall => recall > 1 / CLASSES.length));
  assert.match(normal.limits, /no real Mars validation/);
});

test('raw local sensor packet contains RGB/depth and calibration only, never truth features or hazard', () => {
  const t = createSyntheticTerrain('sensor-only');
  const packets = createWorldSensor(t, 145).capture({ x: 0, z: 0 }, 4, false);
  assert.ok(packets.length > 0 && packets.length < t.heights.length);
  for (const p of packets) {
    assert.deepEqual(Object.keys(p).sort(), ['id', 'index', 'center', 'tick', 'width', 'metersPerPixel', 'depth', 'rgb', 'metadata'].sort());
    assert.ok(Math.hypot(p.center.x, p.center.z) <= 145);
    assert.equal(p.metadata.framebuffer, false);
    assert.ok(!/feature|hazard|slope|label|seed/.test(JSON.stringify(p)));
  }
});

test('static sensor caches frozen pixel arrays but every capture retains fresh identity and isolated calibration', () => {
  const world = createSyntheticTerrain('cached-sensor');
  const sensor = createWorldSensor(world, 145);
  const position = { x: -200, z: -560 };
  const first = sensor.capture(position, 2, false);
  const second = sensor.capture(position, 3, false);
  const sameTick = sensor.capture(position, 3, false);
  assert.ok(first.length > 1);
  for (let i = 0; i < first.length; i++) {
    const a = first[i], b = second[i], c = sameTick[i];
    assert.equal(a.depth, b.depth);
    assert.equal(a.rgb, b.rgb);
    assert.equal(b.depth, c.depth);
    assert.ok(Object.isFrozen(a.depth) && Object.isFrozen(a.rgb));
    assert.notEqual(a.id, b.id);
    assert.notEqual(b.id, c.id);
    assert.equal(a.tick, 2); assert.equal(b.tick, 3);
    assert.notEqual(a, b); assert.notEqual(a.center, b.center);
    assert.notEqual(a.metadata, b.metadata);
    assert.notEqual(a.metadata.sampling, b.metadata.sampling);
  }
  const before = first[0].depth[0];
  assert.throws(() => { first[0].depth[0] = 9999; }, TypeError);
  assert.throws(() => { first[0].rgb.fill(0); }, TypeError);
  first[0].center.x = 9999; first[0].metadata.lighting = 9;
  first[0].metadata.sampling!.centerRangeMeters = 9999;
  world.heights.fill(9999);
  const later = sensor.capture(position, 4, false);
  assert.equal(later[0].depth[0], before);
  assert.notEqual(later[0].center.x, 9999);
  assert.equal(later[0].metadata.lighting, 0.8);
  assert.equal(later[0].metadata.sampling!.centerRangeMeters, 145);
});

test('range explicitly bounds patch centers, with a separate Euclidean bound for sampled footprint corners', () => {
  const sensor = createWorldSensor(createSyntheticTerrain('sampling-range'), 145);
  const position = { x: 0, z: 0 };
  const packets = sensor.capture(position, 0, false);
  let measuredMaximum = 0;
  for (const p of packets) {
    const sampling = p.metadata.sampling!;
    assert.equal(sampling.rangeDefinition, 'patch-center-distance');
    assert.equal(sampling.centerRangeMeters, 145);
    assert.equal(sampling.patchHalfExtentMeters, 40);
    assert.equal(sampling.footprintRadiusMeters, Math.SQRT2 * 40);
    assert.equal(sampling.maximumSampleRangeMeters, 145 + Math.SQRT2 * 40);
    assert.ok(Math.hypot(p.center.x - position.x, p.center.z - position.z) <= 145);
    for (let z = 0; z < p.width; z++) for (let x = 0; x < p.width; x++) {
      const distance = Math.hypot(p.center.x + (x - 4) * p.metersPerPixel - position.x, p.center.z + (z - 4) * p.metersPerPixel - position.z);
      measuredMaximum = Math.max(measuredMaximum, distance);
      assert.ok(distance <= sampling.maximumSampleRangeMeters + 1e-9);
    }
  }
  assert.ok(measuredMaximum > 145, 'Footprints extend beyond the advertised patch-center range');
  const focused = sensor.capture(position, 1, true)[0].metadata.sampling!;
  assert.equal(focused.centerRangeMeters, 10);
  assert.equal(focused.maximumSampleRangeMeters, 10 + Math.SQRT2 * 40);
});

test('novelty/anomaly is unbounded feature distance, uncertainty explicitly uncalibrated; invalid depth fails closed', () => {
  const p = renderPatch(createSyntheticTerrain('anomaly'), 400);
  const model = getFixedMorphologyModel();
  const base = inferPatch(model, p);
  const shifted = inferPatch(model, { ...p, depth: p.depth.map(v => v + 10000) });
  assert.ok(shifted.novelty > 1 && shifted.novelty > base.novelty);
  assert.equal(shifted.anomalyScore, shifted.novelty);
  assert.match(model.metadata.anomaly, /not-probability/);
  assert.match(model.metadata.uncertainty, /uncalibrated/);
  const bad = structuredClone(p); bad.depth[3] = NaN;
  assert.equal(inferPatch(model, bad).valid, false);
  assert.equal(inferPatch(model, bad).slope, Infinity);
  const overflow = structuredClone(p);
  overflow.depth = overflow.depth.map((_, i) => i % 2 ? 1e308 : -1e308);
  assert.equal(inferPatch(model, overflow).valid, false);
});
