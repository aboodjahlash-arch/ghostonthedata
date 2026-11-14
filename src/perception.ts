export type TerrainFeature = 'plain' | 'ridge' | 'crater' | 'valley';
export interface Position { x: number; z: number }
export interface SensorSampling {
  rangeDefinition: 'patch-center-distance';
  centerRangeMeters: number;
  patchHalfExtentMeters: number;
  footprintRadiusMeters: number;
  maximumSampleRangeMeters: number;
}
export function patchSampling(width: number, metersPerPixel: number, centerRangeMeters: number): SensorSampling {
  const patchHalfExtentMeters = (width - 1) * metersPerPixel / 2;
  const footprintRadiusMeters = Math.SQRT2 * patchHalfExtentMeters;
  return { rangeDefinition: 'patch-center-distance', centerRangeMeters, patchHalfExtentMeters,
    footprintRadiusMeters, maximumSampleRangeMeters: centerRangeMeters + footprintRadiusMeters };
}
export interface CameraPatch {
  id: string;
  index: number;
  center: Position;
  tick: number;
  width: number;
  metersPerPixel: number;
  depth: number[];
  rgb: number[];
  metadata: {
    source: 'idealized-synthetic-orthographic';
    depth: 'absolute-local-height-meters';
    framebuffer: false;
    lighting: number;
    sampling?: SensorSampling;
  };
}
export interface Sensor {
  capture(position: Position, tick: number, focused: boolean): CameraPatch[];
}
export interface TrainingSample { patch: CameraPatch; label: TerrainFeature }
export const CLASSES: readonly TerrainFeature[] = ['plain', 'ridge', 'crater', 'valley'];
export const MODEL_VERSION = 'synthetic-morphology-knn-v2-original-world-2';
export const MODEL_LIMITS = 'Synthetic morphology only; uncalibrated uncertainty, not geological significance. Ideal calibrated depth; no real Mars validation. RGB lighting invariance follows from depth-only features, not learned visual robustness. A +500 m depth bias fails badly; occlusion, dust and other terrain domains are unevaluated. Focused captures repeat static depth: repeat consistency only, not independent geological corroboration.';
export interface ModelMetadata {
  version: string;
  method: 'standardized-supervised-5nn';
  trainingSeeds: readonly string[];
  trainingSamples: number;
  uncertainty: 'uncalibrated-distance-ratio';
  anomaly: 'standardized-feature-distance-not-probability';
  limits: string;
}
export interface MorphologyModel {
  metadata: ModelMetadata;
  means: readonly number[];
  scales: readonly number[];
  samples: readonly { values: readonly number[]; label: TerrainFeature }[];
}
export interface Perception {
  feature: TerrainFeature;
  height: number;
  slope: number;
  uncertainty: number;
  novelty: number;
  anomalyScore: number;
  descriptor: number[];
  valid: boolean;
}

export function validPatch(p: CameraPatch): boolean {
  return !!p && !!p.center && Number.isFinite(p.center.x) && Number.isFinite(p.center.z)
    && Array.isArray(p.depth) && Array.isArray(p.rgb)
    && Number.isInteger(p.width) && p.width >= 5 && p.width <= 65 && p.width % 2 === 1
    && Number.isFinite(p.metersPerPixel) && p.metersPerPixel > 0
    && p.depth.length === p.width ** 2 && p.rgb.length === p.width ** 2 * 3
    && p.depth.every(Number.isFinite) && p.rgb.every(v => Number.isFinite(v) && v >= 0 && v <= 255);
}

export function extractFeatures(p: CameraPatch): number[] {
  if (!validPatch(p)) throw new Error('Invalid calibrated RGB/depth patch');
  const n = p.width, mid = (n - 1) / 2, h = p.depth[mid * n + mid], s = p.metersPerPixel;
  const at = (x: number, z: number) => p.depth[z * n + x];
  const gx = (at(mid + 1, mid) - at(mid - 1, mid)) / (2 * s);
  const gz = (at(mid, mid + 1) - at(mid, mid - 1)) / (2 * s);
  const xx = (at(mid + 2, mid) - 2 * h + at(mid - 2, mid)) / (4 * s * s);
  const zz = (at(mid, mid + 2) - 2 * h + at(mid, mid - 2)) / (4 * s * s);
  const xz = (at(mid + 1, mid + 1) - at(mid - 1, mid + 1) - at(mid + 1, mid - 1) + at(mid - 1, mid - 1)) / (4 * s * s);
  const trace = xx + zz, disc = Math.hypot(xx - zz, 2 * xz);
  let residual = 0, ring = 0;
  for (let z = 0; z < n; z++) for (let x = 0; x < n; x++) {
    const r = at(x, z) - h - gx * (x - mid) * s - gz * (z - mid) * s;
    residual += r * r;
    if (x === 0 || z === 0 || x === n - 1 || z === n - 1) ring += r;
  }
  // Depth-derived descriptors intentionally avoid color shortcuts tied to labels.
  return [h / 100, Math.hypot(gx, gz), trace * 100, disc * 100, ring / (4 * (n - 1)) / 20, Math.sqrt(residual / (n * n)) / 20];
}
const distance = (a: readonly number[], b: readonly number[]) => Math.sqrt(a.reduce((sum, v, i) => sum + (v - b[i]) ** 2, 0));

export function trainMorphologyModel(samples: readonly TrainingSample[], seeds: readonly string[]): MorphologyModel {
  if (!samples.length || CLASSES.some(label => !samples.some(s => s.label === label))) throw new Error('Training needs all morphology classes');
  const features = samples.map(s => extractFeatures(s.patch));
  const means = features[0].map((_, i) => features.reduce((v, f) => v + f[i], 0) / features.length);
  const scales = means.map((m, i) => Math.max(0.01, Math.sqrt(features.reduce((v, f) => v + (f[i] - m) ** 2, 0) / features.length)));
  return Object.freeze({
    metadata: Object.freeze({ version: MODEL_VERSION, method: 'standardized-supervised-5nn', trainingSeeds: Object.freeze([...seeds]), trainingSamples: samples.length,
      uncertainty: 'uncalibrated-distance-ratio', anomaly: 'standardized-feature-distance-not-probability', limits: MODEL_LIMITS }),
    means: Object.freeze(means), scales: Object.freeze(scales),
    samples: Object.freeze(samples.map((s, i) => Object.freeze({ label: s.label, values: Object.freeze(features[i].map((v, j) => (v - means[j]) / scales[j])) })))
  });
}

const invalidInference = (): Perception => ({ feature: 'plain', height: NaN, slope: Infinity, uncertainty: 1, novelty: Infinity, anomalyScore: Infinity, descriptor: [], valid: false });
export function inferPatch(model: MorphologyModel, patch: CameraPatch): Perception {
  if (!validPatch(patch)) return invalidInference();
  const raw = extractFeatures(patch), descriptor = raw.map((v, i) => (v - model.means[i]) / model.scales[i]);
  if (!raw.every(Number.isFinite) || !descriptor.every(Number.isFinite)) return invalidInference();
  const neighbors: { label: TerrainFeature; d: number }[] = [];
  const nearestClass = new Map<TerrainFeature, number>();
  for (const sample of model.samples) {
    const d = distance(descriptor, sample.values);
    if (d < (nearestClass.get(sample.label) ?? Infinity)) nearestClass.set(sample.label, d);
    if (neighbors.length < 5 || d < neighbors[4].d) {
      neighbors.push({ label: sample.label, d }); neighbors.sort((a, b) => a.d - b.d);
      if (neighbors.length > 5) neighbors.pop();
    }
  }
  if (!neighbors.length || !Number.isFinite(neighbors[0].d)) return invalidInference();
  const votes = CLASSES.map(label => ({ label, score: neighbors.filter(n => n.label === label).reduce((v, n) => v + 1 / (0.05 + n.d), 0) })).sort((a, b) => b.score - a.score);
  const nearestOther = Math.min(...CLASSES.filter(c => c !== votes[0].label).map(c => nearestClass.get(c) ?? Infinity));
  let slope = 0;
  const n = patch.width, s = patch.metersPerPixel;
  for (let z = 0; z < n - 1; z++) for (let x = 0; x < n - 1; x++) {
    const i = z * n + x;
    // Conservative maximum gradient on both triangles of every depth quad.
    slope = Math.max(slope, Math.hypot(patch.depth[i + 1] - patch.depth[i], patch.depth[i + n] - patch.depth[i]) / s,
      Math.hypot(patch.depth[i + n + 1] - patch.depth[i + n], patch.depth[i + n + 1] - patch.depth[i + 1]) / s);
  }
  const uncertainty = Math.min(1, neighbors[0].d / Math.max(1e-9, nearestOther));
  if (!Number.isFinite(slope) || !Number.isFinite(uncertainty)) return invalidInference();
  return { feature: votes[0].label, height: patch.depth[(n * n - 1) / 2], slope, uncertainty,
    novelty: neighbors[0].d, anomalyScore: neighbors[0].d, descriptor, valid: true };
}

export interface EvaluationReport {
  samples: number; accuracy: number; confusion: Record<TerrainFeature, Record<TerrainFeature, number>>;
  lighting: number; limits: string;
}
export function evaluateMorphology(model: MorphologyModel, samples: readonly TrainingSample[], lighting: number): EvaluationReport {
  const confusion = Object.fromEntries(CLASSES.map(a => [a, Object.fromEntries(CLASSES.map(b => [b, 0]))])) as EvaluationReport['confusion'];
  let correct = 0;
  for (const s of samples) { const p = inferPatch(model, s.patch); confusion[s.label][p.feature]++; if (s.label === p.feature) correct++; }
  return { samples: samples.length, accuracy: samples.length ? correct / samples.length : 0, confusion, lighting, limits: MODEL_LIMITS };
}
