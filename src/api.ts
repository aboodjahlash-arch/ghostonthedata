export type Coordinate = { longitude: number; latitude: number; height?: number };
export type Provenance = { source: string; classification: 'real' | 'derived' | 'simulated' };
export type Region = { id: string; name: string; center: Coordinate; description: string };
export type Target = { id: string; name: string; coordinates: Coordinate; provenance: Provenance; imageUrl?: string; context?: string; anomalyScore?: number; uncertainty?: number; priority?: number; explanation?: string };
export type Layer = { id: string; name: string; kind: 'imagery' | 'terrain' | 'geology' | 'rover' | 'targets' | 'risk'; status: 'available' | 'loading' | 'unavailable' | 'error'; provenance: Provenance; geojson?: object; tilesetUrl?: string; message?: string };
export type Route = { id: string; name: string; coordinates: Coordinate[]; distanceMeters: number; difficulty: string; simulatedResourceCost: number; resourceUnit: string; explanation: string; provenance: Provenance };
export type Experiment = { id: string; name: string; modelVersion: string; status: string; updatedAt: string; metrics: Record<string, number>; family: 'three-ghosts' | 'false-alarm' | 'other' };
export type Mission = { region: Region; targets: Target[]; layers: Layer[] };
export const provisionalRegion: Region = { id: 'provisional-jezero', name: 'Jezero crater', center: { longitude: 77.58, latitude: 18.44 }, description: 'Provisional reference region. Awaiting confirmation from the data team.' };
export function validateCoordinate(value: Coordinate): boolean { return !!value && Number.isFinite(value.longitude) && Number.isFinite(value.latitude) && value.longitude >= -180 && value.longitude <= 180 && value.latitude >= -90 && value.latitude <= 90 && (value.height === undefined || Number.isFinite(value.height)); }
function validProvenance(value: Provenance): boolean { return !!value && typeof value.source === 'string' && ['real', 'derived', 'simulated'].includes(value.classification); }
function named(value: { id: string; name: string }): boolean { return !!value && typeof value.id === 'string' && !!value.id && typeof value.name === 'string'; }
function uniqueIds(values: { id: string }[]): boolean { return new Set(values.map(v => v.id)).size === values.length; }
export function safeImageUrl(value?: string): string | undefined { if (!value) return; try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) ? url.href : undefined; } catch { return; } }
export function createApi(base: string) {
  async function request<T>(path: string, signal?: AbortSignal, body?: unknown): Promise<T> {
    const response = await fetch(`${base.replace(/\/$/, '')}${path}`, { signal, method: body ? 'POST' : 'GET', headers: { Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    if (!response.ok) throw new Error(`Backend returned ${response.status}. Check service availability and integration contract.`);
    const data = await response.json();
    if (!data || typeof data !== 'object') throw new Error('Backend returned an invalid JSON response.');
    return data as T;
  }
  return {
    mission: async (signal?: AbortSignal) => {
      const data = await request<Mission>('/api/mission', signal);
      if (!named(data.region) || !validateCoordinate(data.region.center) || typeof data.region.description !== 'string' || !Array.isArray(data.targets) || !Array.isArray(data.layers) || data.targets.some(t => !named(t) || ['route-start', 'route-end'].includes(t.id) || !validateCoordinate(t.coordinates) || !validProvenance(t.provenance) || [t.anomalyScore, t.uncertainty, t.priority].some(v => v !== undefined && !Number.isFinite(v))) || !uniqueIds(data.targets) || data.layers.some(l => !named(l) || !validProvenance(l.provenance) || !['imagery', 'terrain', 'geology', 'rover', 'targets', 'risk'].includes(l.kind) || !['available', 'loading', 'unavailable', 'error'].includes(l.status) || (l.tilesetUrl !== undefined && !safeImageUrl(l.tilesetUrl))) || !uniqueIds(data.layers)) throw new Error('Mission response does not match the integration contract.');
      return data;
    },
    experiments: async (signal?: AbortSignal) => {
      const data = await request<{ experiments: Experiment[] }>('/api/experiments', signal);
      if (!Array.isArray(data.experiments) || data.experiments.some(e => !named(e) || typeof e.modelVersion !== 'string' || typeof e.status !== 'string' || typeof e.updatedAt !== 'string' || !['three-ghosts', 'false-alarm', 'other'].includes(e.family) || !e.metrics || typeof e.metrics !== 'object' || Array.isArray(e.metrics) || Object.values(e.metrics).some(v => !Number.isFinite(v))) || !uniqueIds(data.experiments)) throw new Error('Invalid experiment response.');
      return data.experiments;
    },
    routes: async (regionId: string, start: Coordinate, destination: Coordinate, targetIds: string[], signal?: AbortSignal) => {
      const data = await request<{ routes: Route[] }>('/api/routes', signal, { regionId, start, destination, targetIds });
      if (!Array.isArray(data.routes) || data.routes.some(r => !named(r) || !Array.isArray(r.coordinates) || r.coordinates.length < 2 || !r.coordinates.every(validateCoordinate) || !validProvenance(r.provenance) || !Number.isFinite(r.distanceMeters) || r.distanceMeters < 0 || !Number.isFinite(r.simulatedResourceCost) || r.simulatedResourceCost < 0 || typeof r.difficulty !== 'string' || typeof r.resourceUnit !== 'string' || typeof r.explanation !== 'string') || !uniqueIds(data.routes)) throw new Error('Invalid route response.');
      return data.routes;
    }
  };
}
export const api = createApi(import.meta.env?.VITE_API_BASE_URL || 'http://localhost:8000');
