import type { WireHealth, WireRegion, WireLayers, WireTarget, WireTargets, WireAnalysis, WireAnalyzeRequest, WireRoute, WireRouteRequest, WireExperiments } from './wire.ts';
export type Coordinate = { longitude: number; latitude: number; height?: number; frame?: 'backend-unverified' | 'cesium-reference' };
export type Provenance = { source: string; classification: 'real' | 'derived' | 'simulated' };
export type Region = { id: string; name: string; center: Coordinate; description: string; crs?: string };
export type Target = { id: string; name: string; coordinates: Coordinate; provenance: Provenance; imageUrl?: string; context?: string; anomalyScore?: number; uncertainty?: number; priority?: number; priorityScore?: number; explanation?: string; caveats?: string[]; elevationMeters?: number; crs?: string; raw?: WireTarget; analysis?: WireAnalysis };
export type Layer = { id: string; name: string; kind: 'imagery' | 'terrain' | 'geology' | 'rover' | 'targets' | 'risk'; status: 'available' | 'loading' | 'unavailable' | 'error'; provenance: Provenance; geojson?: object; tilesetUrl?: string; message?: string; crs?: string; raw?: unknown };
export type Route = { id: string; name: string; coordinates: Coordinate[]; distanceMeters: number; difficulty: string; simulatedResourceCost: number; resourceUnit: string; explanation: string; provenance: Provenance; crs: string; spatialRendering: 'blocked'; raw: WireRoute };
export type Experiment = { id: string; name: string; modelVersion?: string; status: string; updatedAt: string; metrics: Record<string, number>; family: 'three-ghosts' | 'false-alarm' | 'other'; error?: string; notes: string[]; raw: WireExperiments['items'][number] };
export type ServiceIssue = { service: string; code: string; message: string };
export type Mission = { region: Region; targets: Target[]; layers: Layer[]; health?: WireHealth; landingSite?: Coordinate; issues?: ServiceIssue[]; targetTotal?: number; rawRegion?: WireRegion; rawLayers?: WireLayers };
export const SPATIAL_ALIGNMENT_VERIFIED = false;
export const provisionalRegion: Region = { id: 'provisional-jezero', name: 'Jezero crater', center: { longitude: 77.58, latitude: 18.44 }, description: 'Provisional reference region. Awaiting confirmed coordinate and vertical datum alignment.' };
export function validateCoordinate(value: Coordinate): boolean { return !!value && Number.isFinite(value.longitude) && Number.isFinite(value.latitude) && value.longitude >= -180 && value.longitude <= 180 && value.latitude >= -90 && value.latitude <= 90 && (value.height === undefined || Number.isFinite(value.height)); }
export function safeImageUrl(value?: string): string | undefined { if (!value) return; try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) ? url.href : undefined; } catch { return; } }
export class ApiError extends Error {
  status: number; code: string; detail: unknown; path: string;
  constructor(status: number, code: string, message: string, detail?: unknown, path = '') { super(`${status ? `${status} ` : ''}${code}: ${message}`); this.name = 'ApiError'; this.status = status; this.code = code; this.detail = detail; this.path = path; }
}
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const text = (v: unknown): v is string => typeof v === 'string';
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const nullableNumber = (v: unknown) => v == null || finite(v);
const strings = (v: unknown): v is string[] => Array.isArray(v) && v.every(text);
const point = (v: unknown) => object(v) && validateCoordinate({ longitude: v.longitude_deg as number, latitude: v.latitude_deg as number });
function assertShape(condition: unknown, label: string): asserts condition { if (!condition) throw new ApiError(0, 'contract_invalid', `Invalid ${label} response; expected the backend wire contract.`); }
const unique = (values: string[]) => new Set(values).size === values.length;
const optionalNumber = (v: unknown): number | undefined => finite(v) ? v : undefined;
const readable = (v: unknown) => text(v) && v ? v : undefined;
const nativeCoordinate = (v: { longitude_deg: number; latitude_deg: number }): Coordinate => ({ longitude: v.longitude_deg, latitude: v.latitude_deg, frame: 'backend-unverified' });
function contextOf(geology: Record<string, unknown>) { return ['name', 'symbol', 'description', 'interpretation'].map(k => readable(geology[k])).filter(Boolean).join(' · '); }
function issue(service: string, error: unknown): ServiceIssue { return { service, code: error instanceof ApiError ? error.code : 'network_error', message: error instanceof Error ? error.message : String(error) }; }
export function flattenMetrics(input: Record<string, unknown>, prefix = ''): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(input)) { const name = prefix ? `${prefix}.${key}` : key; if (finite(value)) Object.defineProperty(out, name, { value, enumerable: true }); else if (object(value)) Object.assign(out, flattenMetrics(value, name)); }
  return out;
}
export function createApi(base: string) {
  const root = base.replace(/\/+$/, '');
  const imageUrl = (value: string) => { try { return safeImageUrl(new URL(value, `${root}/`).href); } catch { return undefined; } };
  async function request<T>(path: string, signal?: AbortSignal, body?: unknown, timeoutMs = 15000): Promise<T> {
    const controller = new AbortController();
    const abort = () => controller.abort();
    if (signal?.aborted) controller.abort(); else signal?.addEventListener('abort', abort, { once: true });
    const timeout = setTimeout(abort, timeoutMs);
    try {
      const response = await fetch(`${root}${path}`, { signal: controller.signal, method: body === undefined ? 'GET' : 'POST', headers: { Accept: 'application/json', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      let data: unknown;
      try { data = await response.json(); } catch { if (response.ok) throw new ApiError(response.status, 'contract_invalid', 'Backend returned invalid JSON.', undefined, path); }
      if (!response.ok) { const error = object(data) && object(data.error) ? data.error : undefined; throw new ApiError(response.status, readable(error?.code) || `http_${response.status}`, readable(error?.message) || `Backend returned ${response.status}.`, error?.detail, path); }
      assertShape(object(data), path);
      return data as T;
    } catch (error) {
      if (signal?.aborted) throw new DOMException('Request cancelled', 'AbortError');
      if (controller.signal.aborted) throw new ApiError(0, 'timeout', `Service timed out after ${timeoutMs / 1000} seconds.`, undefined, path);
      throw error;
    } finally { clearTimeout(timeout); signal?.removeEventListener('abort', abort); }
  }
  async function health(signal?: AbortSignal) {
    const data = await request<WireHealth>('/api/health', signal);
    assertShape(['ok', 'degraded'].includes(data.status) && object(data.dataset) && typeof data.dataset.ready === 'boolean' && object(data.model) && typeof data.model.ready === 'boolean', 'health');
    return data;
  }
  async function region(signal?: AbortSignal) {
    const data = await request<WireRegion>('/api/mission/region', signal);
    assertShape(text(data.region_id) && !!data.region_id && text(data.name) && text(data.crs) && point(data.centre) && text(data.rationale) && Array.isArray(data.sources), 'region');
    return data;
  }
  async function layers(signal?: AbortSignal) {
    const data = await request<WireLayers>('/api/map/layers', signal);
    assertShape(text(data.crs) && Array.isArray(data.layers) && data.layers.every(l => object(l) && text(l.layer_id) && text(l.title) && text(l.type) && text(l.crs) && text(l.attribution) && typeof l.available === 'boolean'), 'layers');
    return data;
  }
  function mapTarget(t: WireTarget, crs: string): Target {
    return { id: t.target_id, name: t.target_id, coordinates: nativeCoordinate(t), crs, elevationMeters: optionalNumber(t.elevation_m), provenance: { source: readable(t.provenance.citation) || readable(t.provenance.publisher) || readable(t.provenance.source_key) || 'Source not supplied', classification: 'real' }, imageUrl: t.image_url ? imageUrl(t.image_url) : imageUrl(`/api/targets/${encodeURIComponent(t.target_id)}/image`), anomalyScore: optionalNumber(t.anomaly_score), priorityScore: optionalNumber(t.priority), context: contextOf(t.geology), raw: t };
  }
  async function targets(signal?: AbortSignal): Promise<{ items: Target[]; total: number; crs: string }> {
    const items: Target[] = []; let offset = 0; let total = 0; let crs = '';
    do {
      const data = await request<WireTargets>(`/api/targets?limit=500&offset=${offset}&with_geology=true`, signal);
      assertShape(Number.isInteger(data.count) && data.count >= 0 && Number.isInteger(data.total) && data.total >= 0 && text(data.crs) && Array.isArray(data.items) && data.count === data.items.length && data.items.every(t => object(t) && text(t.target_id) && !!t.target_id && point(t) && nullableNumber(t.elevation_m) && nullableNumber(t.anomaly_score) && nullableNumber(t.priority) && object(t.provenance) && object(t.geology) && (t.image_url == null || text(t.image_url))), 'targets');
      assertShape(!crs || crs === data.crs, 'targets CRS'); crs = data.crs; total = data.total;
      assertShape(data.count > 0 || offset >= total, 'targets pagination');
      items.push(...data.items.map(t => mapTarget(t, crs))); offset += data.count;
      assertShape(items.length <= total && unique(items.map(t => t.id)), 'targets pagination identifiers');
    } while (offset < total);
    return { items, total, crs };
  }
  async function mission(signal?: AbortSignal): Promise<Mission> {
    const results = await Promise.allSettled([health(signal), region(signal), layers(signal), targets(signal)] as const);
    if (signal?.aborted) throw new DOMException('Request cancelled', 'AbortError');
    if (results.every(r => r.status === 'rejected')) throw (results[0] as PromiseRejectedResult).reason;
    const issues = results.flatMap((r, i) => r.status === 'rejected' ? [issue(['health', 'region', 'layers', 'targets'][i], r.reason)] : []);
    const h = results[0].status === 'fulfilled' ? results[0].value : undefined;
    const r = results[1].status === 'fulfilled' ? results[1].value : undefined;
    const l = results[2].status === 'fulfilled' ? results[2].value : undefined;
    const t = results[3].status === 'fulfilled' ? results[3].value : undefined;
    if (h && !h.dataset.ready) issues.push({ service: 'dataset', code: 'dataset_missing', message: 'Data not yet available. Run the backend acquisition pipeline.' });
    if (h && !h.model.ready) issues.push({ service: 'model', code: 'model_missing', message: 'Anomaly detection not trained. Analysis is unavailable.' });
    const kinds: Record<string, Layer['kind'] | undefined> = { imagery: 'imagery', elevation: 'terrain', geology: 'geology', rover_imagery: 'rover' };
    return {
      region: r ? { id: r.region_id, name: r.name, center: nativeCoordinate(r.centre), description: r.rationale, crs: r.crs } : provisionalRegion,
      landingSite: r && point(r.landing_site) ? nativeCoordinate(r.landing_site) : undefined,
      targets: h?.dataset.ready === false ? [] : t?.items || [], targetTotal: t?.total, health: h, issues, rawRegion: r, rawLayers: l,
      layers: (l?.layers || []).flatMap(layer => { const kind = kinds[layer.type]; return kind ? [{ id: layer.layer_id, name: layer.title, kind, status: 'unavailable' as const, provenance: { source: layer.attribution, classification: 'real' as const }, crs: layer.crs, raw: layer, message: layer.available ? 'Backend product available; spatial display blocked pending datum alignment.' : 'Backend product unavailable.' }] : []; })
    };
  }
  async function analyze(target: Target, signal?: AbortSignal): Promise<Target> {
    const body: WireAnalyzeRequest = { target_ids: [target.id], top_k: 1, strategy: 'ghost', budget: 1, include_heatmaps: false };
    const data = await request<WireAnalysis>('/api/analyze', signal, body, 120000);
    assertShape(text(data.crs) && text(data.generated_at) && strings(data.disclaimers) && Array.isArray(data.selected) && data.selected.every(t => object(t) && text(t.target_id) && point(t) && finite(t.priority) && nullableNumber(t.anomaly_score) && strings(t.why) && strings(t.caveats) && object(t.geology) && Array.isArray(t.components) && t.components.every(c => object(c) && text(c.name) && finite(c.value) && finite(c.normalised) && ['learned', 'rule_based'].includes(c.kind))), 'analysis');
    const selected = data.selected.find(t => t.target_id === target.id);
    if (!selected) throw new ApiError(503, 'empty_selection', 'No analysis returned for this target. Selection may exceed the budget or match no available target.');
    const uncertainty = selected.components.find(c => c.name === 'uncertainty');
    return { ...target, anomalyScore: optionalNumber(selected.anomaly_score), uncertainty: optionalNumber(uncertainty?.value), priorityScore: selected.priority, explanation: selected.why.join('\n'), caveats: [...selected.caveats, ...data.disclaimers], context: contextOf(selected.geology) || target.context, analysis: data };
  }
  async function experiments(signal?: AbortSignal): Promise<Experiment[]> {
    const data = await request<WireExperiments>('/api/experiments?limit=200', signal);
    assertShape(Number.isInteger(data.count) && Array.isArray(data.items) && data.count === data.items.length && data.items.every(e => object(e) && text(e.experiment_id) && !!e.experiment_id && text(e.created_at) && text(e.status) && object(e.config) && object(e.metrics) && (e.model_version_id == null || text(e.model_version_id)) && (e.error == null || text(e.error))) && unique(data.items.map(e => e.experiment_id)), 'experiments');
    return data.items.map(e => ({ id: e.experiment_id, name: readable(e.config.name) || e.experiment_id, modelVersion: readable(e.model_version_id), status: e.status, updatedAt: e.created_at, metrics: flattenMetrics(e.metrics), family: e.config.dataset === 'three_ghosts' ? 'three-ghosts' : e.config.dataset === 'false_alarm' ? 'false-alarm' : 'other', error: readable(e.error), notes: [readable(e.config.notes), ...(Array.isArray(e.metrics.notes) ? e.metrics.notes.filter(text) : [])].filter((v): v is string => !!v), raw: e }));
  }
  async function routes(_regionId: string, start: Coordinate, destination: Coordinate, _targetIds: string[], signal?: AbortSignal): Promise<Route[]> {
    if (!validateCoordinate(start) || !validateCoordinate(destination) || start.frame !== 'backend-unverified' || destination.frame !== 'backend-unverified') throw new ApiError(0, 'datum_unresolved', 'Use backend-supplied coordinates only. Cesium map picks cannot be transformed while the datum is unresolved.');
    const body: WireRouteRequest = { start: { longitude_deg: start.longitude, latitude_deg: start.latitude }, goal: { longitude_deg: destination.longitude, latitude_deg: destination.latitude }, waypoints: [] };
    const data = await request<WireRoute>('/api/plan-route', signal, body, 120000);
    assertShape(typeof data.found === 'boolean' && text(data.crs) && Array.isArray(data.path) && data.path.every(p => point(p) && finite(p.elevation_m) && finite(p.slope_deg) && finite(p.cumulative_cost)) && finite(data.total_distance_m) && data.total_distance_m >= 0 && finite(data.total_cost) && data.total_cost >= 0 && finite(data.max_slope_deg) && finite(data.mean_slope_deg) && text(data.message) && object(data.cost_model) && strings(data.warnings), 'route');
    if (!data.found) return [];
    assertShape(data.path.length >= 1, 'route');
    return [{ id: 'backend-route', name: 'Backend route', coordinates: data.path.map(nativeCoordinate), distanceMeters: data.total_distance_m, difficulty: `Max ${data.max_slope_deg.toFixed(1)}° / mean ${data.mean_slope_deg.toFixed(1)}° slope`, simulatedResourceCost: data.total_cost, resourceUnit: 'simulated heuristic units', explanation: [data.message, readable(data.cost_model.label), readable(data.cost_model.disclaimer), ...data.warnings].filter(Boolean).join('\n'), provenance: { source: 'GHOST backend route model over MOLA; see retained cost_model and warnings', classification: 'simulated' }, crs: data.crs, spatialRendering: 'blocked', raw: data }];
  }
  return { mission, health, region, layers, targets, analyze, experiments, routes };
}
export const api = createApi(import.meta.env?.VITE_API_BASE_URL || 'http://localhost:8000');
