import { patchSampling, trainMorphologyModel, type CameraPatch, type MorphologyModel, type Position, type Sensor, type TerrainFeature, type TrainingSample } from './perception.ts';

export interface SyntheticTerrain {
  seed: string; seedValue: number; resolution: number; sizeMeters: number; spacingMeters: number;
  minHeight: number; maxHeight: number; heights: Float64Array;
}
function seedValue(seed: string): number {
  let value = 2166136261;
  for (const character of seed) {
    value ^= character.codePointAt(0) ?? 0;
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

function latticeNoise(seed: number, x: number, z: number): number {
  let h = seed ^ Math.imul(x + 374761393, 668265263) ^ Math.imul(z + 2246822519, 3266489917);
  h ^= h >>> 13;
  h = Math.imul(h, 1274126177);
  h ^= h >>> 16;
  return h / 4294967295 * 2 - 1;
}

function smooth(value: number): number {
  return value * value * (3 - 2 * value);
}

function valueNoise(seed: number, x: number, z: number, scale: number): number {
  const nx = x / scale;
  const nz = z / scale;
  const ix = Math.floor(nx);
  const iz = Math.floor(nz);
  const tx = smooth(nx - ix);
  const tz = smooth(nz - iz);
  const a = latticeNoise(seed, ix, iz);
  const b = latticeNoise(seed, ix + 1, iz);
  const c = latticeNoise(seed, ix, iz + 1);
  const d = latticeNoise(seed, ix + 1, iz + 1);
  const ab = a + (b - a) * tx;
  const cd = c + (d - c) * tx;
  return ab + (cd - ab) * tz;
}

function gaussian(distance: number, radius: number): number {
  return Math.exp(-(distance * distance) / (2 * radius * radius));
}

function rawHeight(seed: number, x: number, z: number): { height: number; feature: TerrainFeature } {
  const craterX = -170 + latticeNoise(seed, 11, 3) * 70;
  const craterZ = 90 + latticeNoise(seed, 17, 5) * 60;
  const craterDistance = Math.hypot(x - craterX, z - craterZ);
  const ridgeDistance = Math.abs(z - 0.42 * x + 155);
  const valleyDistance = Math.abs(z + 0.58 * x - 165 - 52 * Math.sin((x + seed % 97) / 230));
  const ridge = 145 * gaussian(ridgeDistance, 105);
  const crater = -125 * gaussian(craterDistance, 155) + 34 * gaussian(Math.abs(craterDistance - 175), 38);
  const valley = -105 * gaussian(valleyDistance, 78);
  const noise = 18 * valueNoise(seed, x, z, 145) + 7 * valueNoise(seed ^ 0x9e3779b9, x, z, 54);
  const height = ridge + crater + valley + noise;
  const feature = ridge > 42 ? 'ridge' : crater < -32 ? 'crater' : valley < -30 ? 'valley' : 'plain';
  return { height, feature };
}

export function createSyntheticTerrain(seedInput = 'ghost-synthetic', resolution = 31, sizeMeters = 1200): SyntheticTerrain {
  const resolutionCells = Math.max(9, Math.floor(resolution));
  const seed = seedValue(seedInput || 'ghost-synthetic');
  const spacingMeters = sizeMeters / (resolutionCells - 1);
  const heights = new Float64Array(resolutionCells * resolutionCells);
  let minHeight = Infinity;
  let maxHeight = -Infinity;
  for (let row = 0; row < resolutionCells; row++) {
    for (let column = 0; column < resolutionCells; column++) {
      const x = column * spacingMeters - sizeMeters / 2;
      const z = row * spacingMeters - sizeMeters / 2;
      const height = rawHeight(seed, x, z).height;
      const index = row * resolutionCells + column;
      heights[index] = height;
      minHeight = Math.min(minHeight, height);
      maxHeight = Math.max(maxHeight, height);
    }
  }
  return { seed: seedInput, seedValue: seed, resolution: resolutionCells, sizeMeters, spacingMeters, minHeight, maxHeight, heights };
}
export function terrainCoordinates(t: SyntheticTerrain, index: number): Position {
  const i = Math.max(0, Math.min(t.heights.length - 1, Math.floor(index)));
  return { x: i % t.resolution * t.spacingMeters - t.sizeMeters / 2, z: Math.floor(i / t.resolution) * t.spacingMeters - t.sizeMeters / 2 };
}
export function terrainIndexAt(t: SyntheticTerrain, x: number, z: number): number {
  const cell = (v: number) => Math.max(0, Math.min(t.resolution - 1, Math.round((v + t.sizeMeters / 2) / t.spacingMeters)));
  return cell(z) * t.resolution + cell(x);
}
export function terrainHeightAt(t: SyntheticTerrain, x: number, z: number): number {
  const cell = (v: number) => Math.max(0, Math.min(t.resolution - 1, (v + t.sizeMeters / 2) / t.spacingMeters));
  const gx = cell(x), gz = cell(z), ix = Math.min(t.resolution - 2, Math.floor(gx)), iz = Math.min(t.resolution - 2, Math.floor(gz));
  const u = gx - ix, v = gz - iz, i = iz * t.resolution + ix;
  return (t.heights[i] * (1 - u) + t.heights[i + 1] * u) * (1 - v) + (t.heights[i + t.resolution] * (1 - u) + t.heights[i + t.resolution + 1] * u) * v;
}
export function renderPatch(t: SyntheticTerrain, index: number, tick = 0, lighting = 0.8, focused = false): CameraPatch {
  const center = terrainCoordinates(t, index), width = 9, metersPerPixel = t.spacingMeters / 4;
  const depth: number[] = [], rgb: number[] = [];
  for (let z = 0; z < width; z++) for (let x = 0; x < width; x++) {
    const px = center.x + (x - 4) * metersPerPixel, pz = center.z + (z - 4) * metersPerPixel;
    const h = terrainHeightAt(t, px, pz);
    const dx = (terrainHeightAt(t, px + 1, pz) - terrainHeightAt(t, px - 1, pz)) / 2;
    const dz = (terrainHeightAt(t, px, pz + 1) - terrainHeightAt(t, px, pz - 1)) / 2;
    const shade = Math.max(0.08, Math.min(1, 0.25 + lighting * (1 - dx * 0.4 - dz * 0.3) / Math.hypot(1, dx, dz)));
    depth.push(h);
    rgb.push(Math.round(176 * shade), Math.round(112 * shade), Math.round(76 * shade));
  }
  return { id: `${tick}:${index}:${focused ? 'focused' : 'survey'}:${lighting}`, index, center, tick, width, metersPerPixel, depth, rgb,
    metadata: { source: 'idealized-synthetic-orthographic', depth: 'absolute-local-height-meters', framebuffer: false, lighting,
      sampling: patchSampling(width, metersPerPixel, 0) } };
}
export function createWorldSensor(t: SyntheticTerrain, range: number): Sensor {
  const world = { ...t, heights: t.heights.slice() };
  const pixels = new Map<string, Pick<CameraPatch, 'depth' | 'rgb' | 'width' | 'metersPerPixel'>>();
  let captureSequence = 0;
  return { capture(position, tick, focused) {
    const sequence = captureSequence++;
    const patches: CameraPatch[] = [];
    const lighting = focused ? 0.55 : 0.8;
    const centerRangeMeters = focused ? world.spacingMeters * 0.25 : range;
    for (let i = 0; i < world.heights.length; i++) {
      const center = terrainCoordinates(world, i);
      if (Math.hypot(center.x - position.x, center.z - position.z) > centerRangeMeters) continue;
      const key = `${i}:${lighting}:${focused}:9:${world.spacingMeters / 4}`;
      let frame = pixels.get(key);
      if (!frame) {
        const rendered = renderPatch(world, i, tick, lighting, focused);
        Object.freeze(rendered.depth); Object.freeze(rendered.rgb);
        frame = { depth: rendered.depth, rgb: rendered.rgb, width: rendered.width, metersPerPixel: rendered.metersPerPixel };
        pixels.set(key, frame);
      }
      patches.push({ ...frame, id: `${tick}:${i}:${focused ? 'focused' : 'survey'}:${lighting}:${sequence}`, index: i, center, tick,
        metadata: { source: 'idealized-synthetic-orthographic', depth: 'absolute-local-height-meters', framebuffer: false, lighting,
          sampling: patchSampling(frame.width, frame.metersPerPixel, centerRangeMeters) } });
    }
    return patches;
  } };
}
export const TRAINING_SEEDS = Object.freeze(['morphology-train-a', 'morphology-train-b', 'morphology-train-c']);
export const HOLDOUT_SEEDS = Object.freeze(['morphology-holdout-1', 'morphology-holdout-2']);
export function labeledWorldSamples(seeds: readonly string[], lighting = 0.8): TrainingSample[] {
  return seeds.flatMap(seed => {
    const t = createSyntheticTerrain(seed, 25);
    return Array.from(t.heights, (_, index) => {
      const p = terrainCoordinates(t, index);
      return { patch: renderPatch(t, index, 0, lighting), label: rawHeight(t.seedValue, p.x, p.z).feature };
    });
  });
}
let fixedModel: MorphologyModel | undefined;
export function getFixedMorphologyModel(): MorphologyModel {
  return fixedModel ??= trainMorphologyModel(labeledWorldSamples(TRAINING_SEEDS), TRAINING_SEEDS);
}
// Evaluation only: never supplied to the controller or its snapshots.
export function evaluateWorldCell(t: SyntheticTerrain, index: number) {
  const p = terrainCoordinates(t, index);
  return { index, ...rawHeight(t.seedValue, p.x, p.z) };
}
