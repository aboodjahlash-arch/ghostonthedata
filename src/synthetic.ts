import { inferPatch, patchSampling, validPatch, MODEL_VERSION, type CameraPatch, type ModelMetadata, type MorphologyModel, type Position, type Sensor, type SensorSampling, type TerrainFeature } from './perception.ts';
import { createSyntheticTerrain, createWorldSensor, getFixedMorphologyModel, TRAINING_SEEDS, type SyntheticTerrain } from './synthetic-world.ts';
export { createSyntheticTerrain, terrainCoordinates, terrainHeightAt, terrainIndexAt } from './synthetic-world.ts';
export type { SyntheticTerrain } from './synthetic-world.ts';
export type { TerrainFeature } from './perception.ts';
export type TerrainCellPosition = Position;
export type ExplorerStatus = 'ready' | 'exploring' | 'complete' | 'exhausted' | 'blocked' | 'sensor-fault';
export type InvestigationPhase = 'Discover' | 'Understand' | 'Investigate';
export type EventKind = 'system' | 'observation' | 'hazard' | 'frontier' | 'movement' | 'energy' | 'decision' | 'investigation';
export interface TerrainCell extends Position { index: number; height: number; slope: number; hazard: boolean; feature: TerrainFeature }
export interface Observation extends TerrainCell {
  observedAt: number; captureId: string; uncertainty: number; novelty: number; anomalyScore: number; valid: boolean;
}
export interface RoverPose extends Position { headingRadians: number; cellIndex: number }
export interface FrontierTarget extends Position { cellIndex: number; estimatedDistanceMeters: number; score: number }
export interface TimelineEvent { tick: number; kind: EventKind; message: string; sequence: number; data?: unknown }
export interface InvestigationEvidence {
  target: number; status: 'completed' | 'failed'; reason?: string; surveyCaptureId?: string; focusedCaptureId?: string;
  analyzedAt: number; predictedClass?: TerrainFeature; repeatAgreement?: boolean; uncertainty?: number; novelty?: number;
  evidenceKind?: 'repeat-consistency-only'; independentCorroboration?: false;
}
export interface ControllerConfig {
  resolution: number; spacingMeters: number; sensorRangeMeters: number; hazardSlope: number; speedMetersPerTick: number; energyMax: number;
}
export interface ExplorerSnapshot {
  seed: string; status: ExplorerStatus; phase: InvestigationPhase; tick: number; pose: RoverPose;
  energy: number; energyMax: number; distanceMeters: number; knownCells: number; totalCells: number; coverage: number;
  energyReserve: number;
  sensorSampling: SensorSampling;
  observations: Observation[]; visitedCells: number[]; path: Position[]; plannedRoute: Position[];
  frontier?: FrontierTarget; hazards: TerrainCell[]; events: TimelineEvent[]; sensorRangeMeters: number; hazardSlope: number;
  model: ModelMetadata; investigations: InvestigationEvidence[]; captures: CameraPatch[]; stopReason?: string;
  traversability: { method: 'maximum-depth-quad-gradient-with-margin'; slopeLimit: number; safetyMargin: number };
}
const DIRECTIONS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
export const ENERGY_RESERVE = 5;
const TICK_ENERGY = 0.2;
const MOVE_ENERGY_PER_METER = 0.12;
export function investigationRouteEnergy(route: readonly Position[], speedMetersPerTick: number): number {
  let energy = TICK_ENERGY * 2;
  for (let i = 1; i < route.length; i++) {
    const length = Math.hypot(route[i].x - route[i - 1].x, route[i].z - route[i - 1].z);
    energy += length * MOVE_ENERGY_PER_METER + Math.ceil(length / speedMetersPerTick) * TICK_ENERGY;
  }
  return energy;
}
export function planSafeRoute(start: number, goal: number, observations: ReadonlyMap<number, TerrainCell>, resolution: number): number[] | undefined {
  const safe = (i: number) => observations.has(i) && !observations.get(i)!.hazard;
  if (!safe(start) || !safe(goal)) return undefined;
  const costs = new Map([[start, 0]]), previous = new Map<number, number>(), open = new Set([start]);
  while (open.size) {
    const current = [...open].sort((a, b) => costs.get(a)! - costs.get(b)! || a - b)[0];
    open.delete(current);
    if (current === goal) {
      const path = [goal];
      while (path[0] !== start) path.unshift(previous.get(path[0])!);
      return path;
    }
    const x = current % resolution, z = Math.floor(current / resolution);
    for (const [dx, dz] of DIRECTIONS) {
      const nx = x + dx, nz = z + dz, next = nz * resolution + nx;
      if (nx < 0 || nz < 0 || nx >= resolution || nz >= resolution || !safe(next)) continue;
      if (dx && dz && (!safe(z * resolution + nx) || !safe(nz * resolution + x))) continue;
      const cost = costs.get(current)! + Math.hypot(dx, dz);
      if (cost < (costs.get(next) ?? Infinity)) { costs.set(next, cost); previous.set(next, current); open.add(next); }
    }
  }
  return undefined;
}

// Only calibrated packets and public geometry configuration cross this boundary.
export class InvestigationController {
  private status: ExplorerStatus = 'ready';
  private phase: InvestigationPhase = 'Discover';
  private tick = 0;
  private energy: number;
  private distanceMeters = 0;
  private pose: RoverPose;
  private memory = new Map<number, Observation>();
  private packets = new Map<string, CameraPatch>();
  private verifiedPixels = new WeakSet<number[]>();
  private visited = new Set<number>();
  private events: TimelineEvent[] = [];
  private investigations: InvestigationEvidence[] = [];
  private finished = new Set<number>();
  private path: Position[] = [];
  private route: number[] = [];
  private frontier?: FrontierTarget;
  private focused?: Observation;
  private survey?: Observation;
  private stopReason?: string;
  private sensor: Sensor;
  private model: MorphologyModel;
  private config: ControllerConfig;
  constructor(sensor: Sensor, model: MorphologyModel, config: ControllerConfig) {
    this.sensor = sensor; this.model = model; this.config = { ...config };
    const index = config.resolution + Math.floor(config.resolution / 3);
    this.pose = { ...this.coordinates(index), cellIndex: index, headingRadians: 0 };
    this.energy = config.energyMax;
    this.path.push({ x: this.pose.x, z: this.pose.z });
    this.visited.add(index);
    this.log('system', 'Fixed seed-independent deployment site; sensor certifies initial footprint before any motion', { index, model: model.metadata });
    this.observe(false);
  }
  private coordinates(index: number): Position {
    const half = (this.config.resolution - 1) * this.config.spacingMeters / 2;
    return { x: index % this.config.resolution * this.config.spacingMeters - half, z: Math.floor(index / this.config.resolution) * this.config.spacingMeters - half };
  }
  private log(kind: EventKind, message: string, data?: unknown) { this.events.push({ tick: this.tick, sequence: this.events.length, kind, message, data }); }
  private stop(status: ExplorerStatus, reason: string) {
    if (this.frontier && !this.finished.has(this.frontier.cellIndex)) {
      this.finished.add(this.frontier.cellIndex);
      this.investigations.push({ target: this.frontier.cellIndex, status: 'failed', reason, analyzedAt: this.tick });
      this.log('investigation', 'Active investigation stopped without success', this.investigations.at(-1));
    }
    this.status = status; this.stopReason = reason; this.route = [];
    this.log('system', reason, { status });
  }
  private retainPixels(values: number[]): number[] {
    if (Object.isFrozen(values)) {
      if (this.verifiedPixels.has(values)) return values;
      let dataOnly = true;
      for (let i = 0; i < values.length; i++) {
        if (!Number.isFinite(Object.getOwnPropertyDescriptor(values, i)?.value)) { dataOnly = false; break; }
      }
      if (dataOnly) { this.verifiedPixels.add(values); return values; }
    }
    const copy = [...values];
    Object.freeze(copy);
    return copy;
  }
  private retainPacket(p: CameraPatch): CameraPatch {
    const metadata = structuredClone(p.metadata);
    if (metadata.sampling) Object.freeze(metadata.sampling);
    return Object.freeze({ id: p.id, index: p.index, tick: p.tick, center: Object.freeze({ ...p.center }),
      width: p.width, metersPerPixel: p.metersPerPixel, metadata: Object.freeze(metadata),
      depth: this.retainPixels(p.depth), rgb: this.retainPixels(p.rgb) });
  }
  private observe(focused: boolean): Observation[] {
    let packets: CameraPatch[];
    try { packets = this.sensor.capture({ x: this.pose.x, z: this.pose.z }, this.tick, focused); }
    catch { this.stop('sensor-fault', 'Sensor capture threw; movement inhibited'); return []; }
    const seen = new Set<number>();
    const captureIds = new Set<string>();
    const valid = Array.isArray(packets) && packets.length > 0 && packets.length <= this.config.resolution ** 2 && packets.every(p => {
      if (!validPatch(p)) return false;
      if (typeof p.id !== 'string' || !/^[A-Za-z0-9_.:-]{1,200}$/.test(p.id) || captureIds.has(p.id) || this.packets.has(p.id)) return false;
      captureIds.add(p.id);
      const expected = this.coordinates(p.index);
      if (!Number.isInteger(p.index) || p.index < 0 || p.index >= this.config.resolution ** 2 || seen.has(p.index)) return false;
      seen.add(p.index);
      return p.width === 9 && p.tick === this.tick && p.metadata?.source === 'idealized-synthetic-orthographic'
        && p.metadata.depth === 'absolute-local-height-meters' && p.metadata.framebuffer === false
        && Number.isFinite(p.metadata.lighting)
        && p.metersPerPixel === this.config.spacingMeters / 4
        && Math.hypot(p.center.x - expected.x, p.center.z - expected.z) < 1e-6
        && Math.hypot(p.center.x - this.pose.x, p.center.z - this.pose.z) <= (focused ? this.config.spacingMeters / 4 : this.config.sensorRangeMeters) + 1e-6;
    });
    if (!valid || !packets.some(p => p.index === this.pose.cellIndex)) {
      this.stop('sensor-fault', 'Missing, malformed or out-of-range calibrated sensor data; movement inhibited'); return [];
    }
    const results: Observation[] = [];
    for (const p of packets) {
      const retained = this.retainPacket(p);
      const inference = inferPatch(this.model, retained);
      if (!inference.valid) { this.stop('sensor-fault', 'Perception returned invalid numeric evidence; movement inhibited'); return []; }
      const observation: Observation = { index: p.index, ...p.center, height: inference.height, slope: inference.slope,
        hazard: !inference.valid || inference.slope >= this.config.hazardSlope * 0.9,
        feature: inference.feature, observedAt: this.tick, captureId: p.id, uncertainty: inference.uncertainty,
        novelty: inference.novelty, anomalyScore: inference.anomalyScore, valid: inference.valid };
      this.memory.set(p.index, observation); this.packets.set(p.id, retained);
      results.push(observation);
    }
    this.log('observation', focused ? 'Focused repeat RGB/depth capture inferred' : 'Local RGB/depth survey inferred', { captureIds: packets.map(p => p.id), focused });
    if (results.some(p => p.hazard)) this.log('hazard', 'Conservative depth-gradient exclusion updated', results.filter(p => p.hazard).map(p => p.index));
    if (this.memory.get(this.pose.cellIndex)?.hazard) this.stop('blocked', 'Current footprint is not certified traversable; no movement');
    return results;
  }
  private selectTarget() {
    const counts = new Map<TerrainFeature, number>();
    for (const e of this.investigations) if (e.predictedClass) counts.set(e.predictedClass, (counts.get(e.predictedClass) ?? 0) + 1);
    const candidates = [...this.memory.values()].filter(o => !o.hazard && !this.finished.has(o.index) && o.index !== this.pose.cellIndex)
      .map(o => {
        const x = o.index % this.config.resolution, z = Math.floor(o.index / this.config.resolution);
        const frontier = DIRECTIONS.some(([dx, dz]) => x + dx >= 0 && x + dx < this.config.resolution && z + dz >= 0 && z + dz < this.config.resolution && !this.memory.has((z + dz) * this.config.resolution + x + dx));
        const diversity = 1 / (1 + (counts.get(o.feature) ?? 0));
        const score = Math.log1p(o.novelty) + o.uncertainty + diversity + (frontier ? 1 : 0) - Math.hypot(o.x - this.pose.x, o.z - this.pose.z) / 1500;
        return { o, score, diversity, frontier };
      }).sort((a, b) => b.score - a.score || a.o.index - b.o.index);
    this.log('decision', 'Rank by novelty distance, uncalibrated uncertainty, class diversity and frontier opportunity; not significance',
      candidates.map(c => ({ index: c.o.index, score: c.score, novelty: c.o.novelty, uncertainty: c.o.uncertainty, diversity: c.diversity, frontier: c.frontier })));
    let energyLimited = false;
    for (const { o, score } of candidates) {
      const route = planSafeRoute(this.pose.cellIndex, o.index, this.memory, this.config.resolution);
      if (!route) {
        this.finished.add(o.index);
        this.investigations.push({ target: o.index, status: 'failed', reason: 'No known-safe route', analyzedAt: this.tick });
        this.log('decision', 'Target unreachable; no unsafe fallback', { target: o.index });
        continue;
      }
      const requiredEnergy = investigationRouteEnergy(route.map(i => this.coordinates(i)), this.config.speedMetersPerTick);
      if (requiredEnergy + ENERGY_RESERVE > this.energy) {
        energyLimited = true;
        this.log('decision', 'Target deferred: route, focused capture and analysis would consume energy reserve', { target: o.index, requiredEnergy, available: this.energy - ENERGY_RESERVE });
        continue;
      }
      this.route = route.slice(1); this.survey = { ...o };
      this.frontier = { x: o.x, z: o.z, cellIndex: o.index, score, estimatedDistanceMeters: route.slice(1).reduce((sum, index, i) => {
        const a = this.coordinates(route[i]), b = this.coordinates(index);
        return sum + Math.hypot(a.x - b.x, a.z - b.z);
      }, 0) };
      this.log('frontier', 'Selected reachable investigation target', { ...this.frontier, route, requiredEnergy, energyReserve: ENERGY_RESERVE });
      this.phase = 'Investigate'; return;
    }
    if (energyLimited) { this.stop('exhausted', 'No affordable investigation fits remaining energy above reserve'); return; }
    const complete = this.memory.size === this.config.resolution ** 2 && !this.investigations.some(e => e.status === 'failed');
    this.stop(complete ? 'complete' : 'blocked', complete ? 'All cells mapped and reachable safe investigations completed' : 'No reachable safe target or frontier remains; exploration incomplete');
  }
  private move() {
    const next = this.route[0];
    if (next === undefined) return;
    const currentCenter = this.coordinates(this.pose.cellIndex);
    if (Math.hypot(this.pose.x - currentCenter.x, this.pose.z - currentCenter.z) < 1e-6) {
      this.observe(false);
      if (this.status !== 'exploring') return;
      const dx = next % this.config.resolution - this.pose.cellIndex % this.config.resolution;
      const dz = Math.floor(next / this.config.resolution) - Math.floor(this.pose.cellIndex / this.config.resolution);
      const required = [next, this.pose.cellIndex];
      if (dx && dz) required.push(this.pose.cellIndex + dx, this.pose.cellIndex + dz * this.config.resolution);
      if (required.some(i => this.memory.get(i)?.observedAt !== this.tick)) {
        this.stop('sensor-fault', 'Route footprint missing from fresh capture; movement inhibited'); return;
      }
      if (planSafeRoute(this.pose.cellIndex, next, this.memory, this.config.resolution)?.length !== 2) {
        this.failTarget('Adjacent route segment no longer certified safe'); return;
      }
    }
    if (this.memory.get(next)?.hazard !== false) { this.failTarget('Route lost safety certification'); return; }
    const destination = this.coordinates(next), dx = destination.x - this.pose.x, dz = destination.z - this.pose.z;
    const remaining = Math.hypot(dx, dz), travel = Math.min(this.config.speedMetersPerTick, remaining);
    if (this.energy - travel * MOVE_ENERGY_PER_METER < ENERGY_RESERVE) {
      this.stop('exhausted', 'Movement would consume protected energy reserve'); return;
    }
    this.pose.headingRadians = Math.atan2(dz, dx);
    this.pose.x += dx / remaining * travel; this.pose.z += dz / remaining * travel;
    this.distanceMeters += travel; this.energy -= travel * MOVE_ENERGY_PER_METER;
    if (travel === remaining) {
      this.pose.x = destination.x; this.pose.z = destination.z; this.pose.cellIndex = next;
      this.route.shift(); this.visited.add(next);
    }
    this.path.push({ x: this.pose.x, z: this.pose.z });
    this.log('movement', 'Executed bounded safe route increment', { travel, remaining: remaining - travel, pose: { ...this.pose } });
    if (travel === remaining) this.observe(false);
  }
  private failTarget(reason: string) {
    if (this.frontier) {
      this.finished.add(this.frontier.cellIndex);
      this.investigations.push({ target: this.frontier.cellIndex, status: 'failed', reason, analyzedAt: this.tick });
    }
    this.log('investigation', reason); this.route = []; this.frontier = undefined; this.focused = undefined; this.phase = 'Discover';
  }
  get currentTick(): number { return this.tick; }
  step(): ExplorerSnapshot {
    if (!['ready', 'exploring'].includes(this.status)) return this.snapshot();
    if (this.energy - TICK_ENERGY < ENERGY_RESERVE) {
      this.stop('exhausted', 'Insufficient energy for another action without consuming reserve'); return this.snapshot();
    }
    this.status = 'exploring'; this.tick++; this.energy -= TICK_ENERGY;
    this.log('decision', `Execute ${this.phase}`, { phase: this.phase });
    if (this.phase === 'Discover') {
      if (this.tick > 1) this.observe(false);
      if (this.status === 'exploring') { this.phase = 'Understand'; this.log('decision', 'Discover -> Understand: inferred memory available'); }
    } else if (this.phase === 'Understand') this.selectTarget();
    else if (this.route.length) this.move();
    else if (!this.focused) {
      this.focused = this.observe(true).find(o => o.index === this.frontier?.cellIndex);
      if (this.status === 'exploring' && !this.focused) this.failTarget('Focused target capture unavailable');
    } else {
      const focused = this.focused;
      this.investigations.push({ target: focused.index, status: 'completed', surveyCaptureId: this.survey?.captureId,
        focusedCaptureId: focused.captureId, analyzedAt: this.tick, predictedClass: focused.feature,
        repeatAgreement: this.survey?.feature === focused.feature, uncertainty: focused.uncertainty, novelty: focused.novelty,
        evidenceKind: 'repeat-consistency-only', independentCorroboration: false });
      this.finished.add(focused.index);
      this.log('investigation', 'Repeat consistency analyzed; static depth and changed RGB lighting are not independent geological corroboration', this.investigations.at(-1));
      this.focused = undefined; this.frontier = undefined; this.phase = 'Discover';
    }
    if (this.energy <= 0 && this.status === 'exploring') this.stop('exhausted', 'Energy exhausted; investigation not claimed successful');
    return this.snapshot();
  }
  snapshot(): ExplorerSnapshot {
    const observations = [...this.memory.values()];
    // One clone preserves pixel sharing and mutation isolation; JSON export expands every capture's arrays.
    return structuredClone({ seed: '', status: this.status, phase: this.phase, tick: this.tick, pose: this.pose,
      energy: this.energy, energyMax: this.config.energyMax, energyReserve: ENERGY_RESERVE, distanceMeters: this.distanceMeters,
      knownCells: this.memory.size, totalCells: this.config.resolution ** 2, coverage: this.memory.size / this.config.resolution ** 2,
      observations, visitedCells: [...this.visited], path: this.path, plannedRoute: this.route.map(i => this.coordinates(i)),
      frontier: this.frontier, hazards: observations.filter(o => o.hazard), events: this.events,
      sensorRangeMeters: this.config.sensorRangeMeters, hazardSlope: this.config.hazardSlope,
      sensorSampling: patchSampling(9, this.config.spacingMeters / 4, this.config.sensorRangeMeters),
      model: this.model.metadata, investigations: this.investigations, captures: [...this.packets.values()], stopReason: this.stopReason,
      traversability: { method: 'maximum-depth-quad-gradient-with-margin', slopeLimit: this.config.hazardSlope * 0.9, safetyMargin: 0.9 } });
  }
}
export interface SyntheticCheckpoint { version: 2; modelVersion: typeof MODEL_VERSION; seed: string; tick: number; config: ControllerConfig }
export interface SyntheticMission { terrain: SyntheticTerrain; step(): ExplorerSnapshot; snapshot(): ExplorerSnapshot; checkpoint(): SyntheticCheckpoint }
function configFor(resolution: number, spacingMeters: number): ControllerConfig {
  return { resolution, spacingMeters, sensorRangeMeters: Math.max(145, spacingMeters * 2), hazardSlope: 0.42, speedMetersPerTick: 18, energyMax: 1200 };
}
export function createSyntheticMission(seed = 'ghost-synthetic', resolution = 31, sizeMeters = 1200): SyntheticMission {
  if (typeof seed !== 'string' || !seed.trim() || seed.length > 200) throw new Error('Mission seed must contain 1-200 characters');
  if (!Number.isFinite(resolution) || !Number.isFinite(sizeMeters) || sizeMeters <= 0 || resolution > 101) throw new Error('Invalid mission dimensions');
  seed = seed || 'ghost-synthetic';
  if (TRAINING_SEEDS.includes(seed)) throw new Error('Mission seed must be independent of fixed training seeds');
  const terrain = createSyntheticTerrain(seed, resolution, sizeMeters), config = configFor(terrain.resolution, terrain.spacingMeters);
  const controller = new InvestigationController(createWorldSensor(terrain, config.sensorRangeMeters), getFixedMorphologyModel(), config);
  const withSeed = (s: ExplorerSnapshot) => ({ ...s, seed });
  return { terrain, step: () => withSeed(controller.step()), snapshot: () => withSeed(controller.snapshot()),
    checkpoint: () => ({ version: 2, modelVersion: MODEL_VERSION, seed, tick: controller.currentTick, config: { ...config } }) };
}
export function restoreSyntheticMission(value: unknown): SyntheticMission {
  const c = value as SyntheticCheckpoint;
  if (!c || c.version !== 2 || c.modelVersion !== MODEL_VERSION || typeof c.seed !== 'string' || !c.seed.length
    || !Number.isInteger(c.tick) || c.tick < 0 || c.tick > 10000 || !c.config
    || !Number.isInteger(c.config.resolution) || c.config.resolution < 9 || c.config.resolution > 101
    || !Number.isFinite(c.config.spacingMeters) || c.config.spacingMeters <= 0) throw new Error('Unsupported or invalid v2 synthetic checkpoint');
  const expected = configFor(c.config.resolution, c.config.spacingMeters);
  if (Object.keys(expected).some(k => expected[k as keyof ControllerConfig] !== c.config[k as keyof ControllerConfig])) throw new Error('Checkpoint config mismatch');
  const mission = createSyntheticMission(c.seed, c.config.resolution, c.config.spacingMeters * (c.config.resolution - 1));
  for (let i = 0; i < c.tick; i++) if (mission.step().tick !== i + 1) throw new Error('Checkpoint tick exceeds terminal mission');
  return mission;
}
