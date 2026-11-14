export type TerrainFeature = 'plain' | 'ridge' | 'crater' | 'valley';
export type ExplorerStatus = 'ready' | 'exploring' | 'complete' | 'exhausted';
export type EventKind = 'system' | 'observation' | 'hazard' | 'frontier' | 'movement' | 'energy';

export interface TerrainCell {
  index: number;
  x: number;
  z: number;
  height: number;
  slope: number;
  hazard: boolean;
  feature: TerrainFeature;
}

export interface TerrainCellPosition {
  x: number;
  z: number;
}

export interface SyntheticTerrain {
  seed: string;
  seedValue: number;
  resolution: number;
  sizeMeters: number;
  spacingMeters: number;
  minHeight: number;
  maxHeight: number;
  heights: Float64Array;
}

export interface Observation extends TerrainCell {
  observedAt: number;
}

export interface RoverPose {
  x: number;
  z: number;
  headingRadians: number;
  cellIndex: number;
}

export interface FrontierTarget extends TerrainCellPosition {
  cellIndex: number;
  estimatedDistanceMeters: number;
}

export interface TimelineEvent {
  tick: number;
  kind: EventKind;
  message: string;
}

export interface ExplorerSnapshot {
  seed: string;
  status: ExplorerStatus;
  tick: number;
  pose: RoverPose;
  energy: number;
  energyMax: number;
  distanceMeters: number;
  knownCells: number;
  totalCells: number;
  coverage: number;
  observations: Observation[];
  visitedCells: number[];
  path: TerrainCellPosition[];
  plannedRoute: TerrainCellPosition[];
  frontier?: FrontierTarget;
  hazards: TerrainCell[];
  events: TimelineEvent[];
  sensorRangeMeters: number;
  hazardSlope: number;
}

interface LocalSensor {
  observe(position: TerrainCellPosition): TerrainCell[];
  cellAt(x: number, z: number): TerrainCell;
}

interface PlannedPath {
  cells: number[];
  cost: number;
}

const CELL_DIRECTIONS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

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

export function terrainCoordinates(terrain: SyntheticTerrain, index: number): TerrainCellPosition {
  const clamped = Math.max(0, Math.min(terrain.heights.length - 1, Math.floor(index)));
  const row = Math.floor(clamped / terrain.resolution);
  const column = clamped % terrain.resolution;
  return { x: column * terrain.spacingMeters - terrain.sizeMeters / 2, z: row * terrain.spacingMeters - terrain.sizeMeters / 2 };
}

export function terrainIndexAt(terrain: SyntheticTerrain, x: number, z: number): number {
  const column = Math.max(0, Math.min(terrain.resolution - 1, Math.round((x + terrain.sizeMeters / 2) / terrain.spacingMeters)));
  const row = Math.max(0, Math.min(terrain.resolution - 1, Math.round((z + terrain.sizeMeters / 2) / terrain.spacingMeters)));
  return row * terrain.resolution + column;
}

export function terrainHeightAt(terrain: SyntheticTerrain, x: number, z: number): number {
  const half = terrain.sizeMeters / 2;
  const gx = Math.max(0, Math.min(terrain.resolution - 1, (x + half) / terrain.spacingMeters));
  const gz = Math.max(0, Math.min(terrain.resolution - 1, (z + half) / terrain.spacingMeters));
  const ix = Math.min(terrain.resolution - 2, Math.floor(gx));
  const iz = Math.min(terrain.resolution - 2, Math.floor(gz));
  const tx = gx - ix;
  const tz = gz - iz;
  const i = iz * terrain.resolution + ix;
  const a = terrain.heights[i];
  const b = terrain.heights[i + 1];
  const c = terrain.heights[i + terrain.resolution];
  const d = terrain.heights[i + terrain.resolution + 1];
  return (a * (1 - tx) + b * tx) * (1 - tz) + (c * (1 - tx) + d * tx) * tz;
}

function slopeAt(terrain: SyntheticTerrain, x: number, z: number): number {
  const delta = terrain.spacingMeters * 0.55;
  const dx = (terrainHeightAt(terrain, x + delta, z) - terrainHeightAt(terrain, x - delta, z)) / (2 * delta);
  const dz = (terrainHeightAt(terrain, x, z + delta) - terrainHeightAt(terrain, x, z - delta)) / (2 * delta);
  return Math.hypot(dx, dz);
}

function featureAt(terrain: SyntheticTerrain, x: number, z: number): TerrainFeature {
  return rawHeight(terrain.seedValue, x, z).feature;
}

function truthCell(terrain: SyntheticTerrain, index: number, hazardSlope: number): TerrainCell {
  const position = terrainCoordinates(terrain, index);
  const height = terrain.heights[index];
  const slope = slopeAt(terrain, position.x, position.z);
  return { index, x: position.x, z: position.z, height, slope, hazard: slope > hazardSlope, feature: featureAt(terrain, position.x, position.z) };
}

function createLocalSensor(terrain: SyntheticTerrain, sensorRangeMeters: number, hazardSlope: number): LocalSensor {
  const radiusCells = Math.ceil(sensorRangeMeters / terrain.spacingMeters);
  return {
    observe(position) {
      const centerColumn = Math.round((position.x + terrain.sizeMeters / 2) / terrain.spacingMeters);
      const centerRow = Math.round((position.z + terrain.sizeMeters / 2) / terrain.spacingMeters);
      const samples: TerrainCell[] = [];
      for (let row = Math.max(0, centerRow - radiusCells); row <= Math.min(terrain.resolution - 1, centerRow + radiusCells); row++) {
        for (let column = Math.max(0, centerColumn - radiusCells); column <= Math.min(terrain.resolution - 1, centerColumn + radiusCells); column++) {
          const index = row * terrain.resolution + column;
          const cell = truthCell(terrain, index, hazardSlope);
          if (Math.hypot(cell.x - position.x, cell.z - position.z) <= sensorRangeMeters) samples.push(cell);
        }
      }
      return samples;
    },
    cellAt(x, z) {
      return truthCell(terrain, terrainIndexAt(terrain, x, z), hazardSlope);
    }
  };
}

class FrontierExplorer {
  private readonly sensor: LocalSensor;
  private readonly resolution: number;
  private readonly spacing: number;
  private readonly sensorRange: number;
  private readonly hazardSlope: number;
  private readonly known = new Uint8Array(0);
  private readonly traversable = new Uint8Array(0);
  private readonly visited = new Uint8Array(0);
  private readonly heights: Float64Array;
  private readonly cells: (TerrainCell | undefined)[];
  private readonly observations: Observation[] = [];
  private readonly path: TerrainCellPosition[] = [];
  private readonly events: TimelineEvent[] = [];
  private readonly announcedFeatures = new Set<TerrainFeature>();
  private route: number[] = [];
  private routeCursor = 0;
  private tick = 0;
  private status: ExplorerStatus = 'ready';
  private energy: number;
  private distance = 0;
  private knownCells = 0;
  private frontier?: FrontierTarget;
  private pose: RoverPose;

  constructor(sensor: LocalSensor, resolution: number, spacing: number, sensorRange: number, hazardSlope: number) {
    this.sensor = sensor;
    this.resolution = resolution;
    this.spacing = spacing;
    this.sensorRange = sensorRange;
    this.hazardSlope = hazardSlope;
    const total = resolution * resolution;
    this.known = new Uint8Array(total);
    this.traversable = new Uint8Array(total);
    this.visited = new Uint8Array(total);
    this.heights = new Float64Array(total);
    this.heights.fill(NaN);
    this.cells = new Array(total);
    this.energy = 320;
    const start = sensor.cellAt(-spacing * 10, -spacing * 10);
    this.pose = { x: start.x, z: start.z, headingRadians: 0, cellIndex: start.index };
    this.path.push({ x: this.pose.x, z: this.pose.z });
    this.addEvent('system', 'Deterministic synthetic survey initialized; controller receives range-limited samples only.');
    this.sense();
  }

  step(): ExplorerSnapshot {
    if (this.status === 'complete' || this.status === 'exhausted') return this.snapshot();
    this.status = 'exploring';
    this.tick++;
    this.ensureRoute();
    if (!this.frontier) {
      this.finish(this.knownCells === this.cells.length ? 'complete' : 'complete', this.knownCells === this.cells.length ? 'All synthetic cells surveyed.' : 'No reachable frontier remains in the known traversable map.');
      return this.snapshot();
    }
    const nextIndex = this.route[this.routeCursor];
    const next = nextIndex === undefined ? undefined : this.indexToPosition(nextIndex);
    if (!next) {
      this.route = [];
      this.routeCursor = 0;
      return this.snapshot();
    }
    const dx = next.x - this.pose.x;
    const dz = next.z - this.pose.z;
    const remaining = Math.hypot(dx, dz);
    const stepDistance = Math.min(32, remaining);
    const ratio = remaining === 0 ? 0 : stepDistance / remaining;
    const previousX = this.pose.x;
    const previousZ = this.pose.z;
    this.pose.x += dx * ratio;
    this.pose.z += dz * ratio;
    this.pose.headingRadians = Math.atan2(dz, dx);
    const moved = Math.hypot(this.pose.x - previousX, this.pose.z - previousZ);
    this.distance += moved;
    const currentIndex = this.nearestIndex(this.pose.x, this.pose.z);
    const targetHeight = this.heights[nextIndex] ?? this.heights[this.pose.cellIndex] ?? 0;
    const currentHeight = this.heights[this.pose.cellIndex] ?? targetHeight;
    const climb = Math.max(0, targetHeight - currentHeight);
    this.energy = Math.max(0, this.energy - moved * (0.014 + Math.min(0.05, climb / Math.max(1, moved) * 0.05) + (this.cells[nextIndex]?.hazard ? 0.025 : 0)));
    this.pose.cellIndex = currentIndex;
    if (!this.visited[currentIndex]) {
      this.visited[currentIndex] = 1;
      this.addEvent('movement', `Rover entered cell ${currentIndex}; motion remains incremental and bounded.`);
    }
    const last = this.path[this.path.length - 1];
    if (!last || Math.hypot(last.x - this.pose.x, last.z - this.pose.z) > this.spacing * 0.45) this.path.push({ x: this.pose.x, z: this.pose.z });
    if (remaining <= 32.5) this.routeCursor++;
    if (this.routeCursor >= this.route.length) {
      this.addEvent('frontier', `Frontier ${this.frontier.cellIndex} reached; local survey continues from the new boundary.`);
      this.route = [];
      this.routeCursor = 0;
      this.frontier = undefined;
    }
    this.sense();
    if (this.energy <= 0.001 && this.status === 'exploring') this.finish('exhausted', 'Energy reserve depleted before all reachable frontiers were surveyed.');
    return this.snapshot();
  }

  snapshot(): ExplorerSnapshot {
    return {
      seed: '',
      status: this.status,
      tick: this.tick,
      pose: { ...this.pose },
      energy: this.energy,
      energyMax: 320,
      distanceMeters: this.distance,
      knownCells: this.knownCells,
      totalCells: this.cells.length,
      coverage: this.cells.length ? this.knownCells / this.cells.length : 0,
      observations: this.observations.map(observation => ({ ...observation })),
      visitedCells: Array.from(this.visited).flatMap((value, index) => value ? [index] : []),
      path: this.path.map(point => ({ ...point })),
      plannedRoute: this.route.slice(this.routeCursor).map(index => this.indexToPosition(index)),
      frontier: this.frontier ? { ...this.frontier } : undefined,
      hazards: this.cells.filter((cell): cell is TerrainCell => Boolean(cell?.hazard)).map(cell => ({ ...cell })),
      events: this.events.map(event => ({ ...event })),
      sensorRangeMeters: this.sensorRange,
      hazardSlope: this.hazardSlope
    };
  }

  private sense(): void {
    const samples = this.sensor.observe({ x: this.pose.x, z: this.pose.z });
    let added = 0;
    let hazards = 0;
    for (const sample of samples) {
      if (!this.known[sample.index]) {
        this.known[sample.index] = 1;
        this.cells[sample.index] = sample;
        this.heights[sample.index] = sample.height;
        this.knownCells++;
        added++;
        if (sample.hazard) hazards++;
        if (sample.feature !== 'plain' && !this.announcedFeatures.has(sample.feature)) {
          this.announcedFeatures.add(sample.feature);
          this.addEvent('observation', `Range-limited sample classified local ${sample.feature} morphology from the deterministic height field.`);
        }
        this.observations.push({ ...sample, observedAt: this.tick });
      }
      if (!sample.hazard) this.traversable[sample.index] = 1;
    }
    if (added > 0) this.addEvent('observation', `${added} new cells mapped inside ${Math.round(this.sensorRange)} m simulated sensor radius.`);
    if (hazards > 0) this.addEvent('hazard', `${hazards} sampled cells exceed the ${(Math.atan(this.hazardSlope) * 180 / Math.PI).toFixed(1)}° slope hazard threshold.`);
  }

  private ensureRoute(): void {
    if (this.frontier && this.route.length > this.routeCursor) return;
    let plan = this.planToFrontier(false);
    if (!plan) {
      plan = this.planToFrontier(true);
      if (plan) this.addEvent('hazard', 'No hazard-free frontier route remains; selecting the least costly known slope-hazard crossing.');
    }
    if (!plan) {
      this.frontier = undefined;
      return;
    }
    this.route = plan.cells;
    this.routeCursor = 1;
    this.frontier = { ...this.indexToPosition(plan.cells[plan.cells.length - 1]), cellIndex: plan.cells[plan.cells.length - 1], estimatedDistanceMeters: plan.cost };
    this.addEvent('frontier', `Selected frontier ${this.frontier.cellIndex} at ${this.frontier.estimatedDistanceMeters.toFixed(0)} m using known-cell path search.`);
  }

  private planToFrontier(includeHazards: boolean): PlannedPath | undefined {
    const start = this.pose.cellIndex;
    const queue = [start];
    const previous = new Int32Array(this.cells.length);
    previous.fill(-2);
    previous[start] = -1;
    const candidates = new Map<number, { cost: number; hazards: number }>();
    let cursor = 0;
    while (cursor < queue.length) {
      const index = queue[cursor++];
      if (index !== start && this.isFrontier(index, includeHazards)) candidates.set(index, this.pathMetrics(previous, index));
      for (const neighbor of this.neighbors(index)) {
        if (previous[neighbor] !== -2 || !this.known[neighbor] || (!includeHazards && !this.traversable[neighbor])) continue;
        previous[neighbor] = index;
        queue.push(neighbor);
      }
    }
    let best: number | undefined;
    let bestCost = Infinity;
    let bestDistance = 0;
    for (const [index, metrics] of candidates) {
      const unknownNeighbors = this.neighbors(index).filter(neighbor => !this.known[neighbor]).length;
      const score = metrics.cost + metrics.hazards * this.spacing * 9 - unknownNeighbors * this.spacing * 0.35;
      if (score < bestCost) {
        best = index;
        bestCost = score;
        bestDistance = metrics.cost;
      }
    }
    if (best === undefined) return undefined;
    const cells: number[] = [];
    for (let index = best; index >= 0; index = previous[index]) cells.unshift(index);
    return { cells, cost: bestDistance };
  }

  private pathMetrics(previous: Int32Array, index: number): { cost: number; hazards: number } {
    let cost = 0;
    let hazards = 0;
    for (let current = index; previous[current] >= 0; current = previous[current]) {
      const from = this.indexToPosition(previous[current]);
      const to = this.indexToPosition(current);
      cost += Math.hypot(to.x - from.x, to.z - from.z);
      if (this.cells[current]?.hazard) hazards++;
    }
    return { cost, hazards };
  }

  private isFrontier(index: number, includeHazards: boolean): boolean {
    return this.known[index] === 1 && (includeHazards || this.traversable[index] === 1) && this.neighbors(index).some(neighbor => !this.known[neighbor]);
  }

  private neighbors(index: number): number[] {
    const row = Math.floor(index / this.resolution);
    const column = index % this.resolution;
    const result: number[] = [];
    for (const [dx, dz] of CELL_DIRECTIONS) {
      const nextColumn = column + dx;
      const nextRow = row + dz;
      if (nextColumn >= 0 && nextColumn < this.resolution && nextRow >= 0 && nextRow < this.resolution) result.push(nextRow * this.resolution + nextColumn);
    }
    return result;
  }

  private indexToPosition(index: number): TerrainCellPosition {
    const row = Math.floor(index / this.resolution);
    const column = index % this.resolution;
    const half = this.spacing * (this.resolution - 1) / 2;
    return { x: column * this.spacing - half, z: row * this.spacing - half };
  }

  private nearestIndex(x: number, z: number): number {
    const half = this.spacing * (this.resolution - 1) / 2;
    const column = Math.max(0, Math.min(this.resolution - 1, Math.round((x + half) / this.spacing)));
    const row = Math.max(0, Math.min(this.resolution - 1, Math.round((z + half) / this.spacing)));
    return row * this.resolution + column;
  }

  private finish(status: ExplorerStatus, message: string): void {
    this.status = status;
    this.addEvent('system', message);
  }

  private addEvent(kind: EventKind, message: string): void {
    this.events.push({ tick: this.tick, kind, message });
    if (this.events.length > 160) this.events.splice(0, this.events.length - 160);
  }
}

export function restoreSyntheticMission(value: unknown): SyntheticMission {
  if (!value || typeof value !== 'object') throw new Error('Invalid synthetic checkpoint');
  const checkpoint = value as Record<string, unknown>;
  if (checkpoint.version !== 1 || typeof checkpoint.seed !== 'string' || checkpoint.seed.length > 200 || !Number.isInteger(checkpoint.tick) || (checkpoint.tick as number) < 0 || (checkpoint.tick as number) > 10000) throw new Error('Unsupported or invalid synthetic checkpoint');
  const mission = createSyntheticMission(checkpoint.seed);
  for (let tick = 0; tick < (checkpoint.tick as number); tick++) {
    const current = mission.step();
    if (current.status === 'complete' || current.status === 'exhausted') break;
  }
  return mission;
}

export interface SyntheticMission {
  terrain: SyntheticTerrain;
  step(): ExplorerSnapshot;
  snapshot(): ExplorerSnapshot;
}

export function createSyntheticMission(seed = 'ghost-synthetic', resolution = 31, sizeMeters = 1200): SyntheticMission {
  const terrain = createSyntheticTerrain(seed, resolution, sizeMeters);
  const sensor = createLocalSensor(terrain, 145, 0.42);
  const explorer = new FrontierExplorer(sensor, terrain.resolution, terrain.spacingMeters, 145, 0.42);
  const withSeed = (snapshot: ExplorerSnapshot): ExplorerSnapshot => ({ ...snapshot, seed });
  return {
    terrain,
    step: () => withSeed(explorer.step()),
    snapshot: () => withSeed(explorer.snapshot())
  };
}
