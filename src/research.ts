export type ResearchFeature = { name: string; value: number; unit: string; kind: 'measurement' | 'model_prediction' };
export type ResearchObservation = {
  observation_id: string;
  source: 'synthetic';
  summary: string;
  model_method: string;
  provenance: string;
  uncertainty: string;
  features: ResearchFeature[];
};
export type ResearchRequest = {
  observations: ResearchObservation[];
  pds_query?: { keywords: string; target: string; limit: number };
};
export type EvidenceLinks = { observation_ids: string[]; dataset_ids: string[] };
export type ResearchHypothesis = { kind: 'hypothesis'; statement: string; supporting: EvidenceLinks; against: EvidenceLinks; uncertainty: string };
export type ResearchResponse = {
  status: 'available' | 'unavailable';
  reason: string | null;
  observation_summary: ResearchObservation[];
  provider: 'OpenRouter';
  model: string | null;
  datasets: { dataset_id: string; title: string; kind: 'registry_metadata'; provenance: string;
    instrument?: string | null; investigation?: string | null; target_name?: string | null; processing_level?: string | null }[];
  comparisons: { observation_id: string; dataset_id: string; kind: 'metadata_context_only'; measured_properties_compared: false;
    available_metadata_fields: string[]; missing_metadata_fields: string[]; limitations: string[] }[];
  interpretations: ResearchHypothesis[];
  missing_information: string[];
  uncertainty: string;
  followups: string[];
  disclaimer: string;
};
export type ResearchResult = { response: ResearchResponse; requestedAtTick: number };
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const textList = (v: unknown): v is string[] => Array.isArray(v) && v.every(s => typeof s === 'string');
export function validateResearchResponse(value: unknown, request: ResearchRequest): asserts value is ResearchResponse {
  if (!record(value) || !['available', 'unavailable'].includes(String(value.status)) || typeof value.disclaimer !== 'string'
    || value.provider !== 'OpenRouter' || !(value.model === null || typeof value.model === 'string')
    || !(value.reason === null || typeof value.reason === 'string')
    || typeof value.uncertainty !== 'string' || !textList(value.missing_information) || !textList(value.followups)
    || !Array.isArray(value.datasets) || !Array.isArray(value.comparisons) || !Array.isArray(value.interpretations) || !Array.isArray(value.observation_summary)) throw new Error('Invalid research response');
  const observationIds = new Set(request.observations.map(o => o.observation_id));
  const echoedIds = new Set<string>();
  for (const o of value.observation_summary) {
    if (!record(o) || typeof o.observation_id !== 'string' || echoedIds.has(o.observation_id)) throw new Error('Mismatched research observations');
    echoedIds.add(o.observation_id);
    const original = request.observations.find(v => v.observation_id === o.observation_id);
    if (!original || o.source !== original.source || o.summary !== original.summary || o.model_method !== original.model_method
      || o.provenance !== original.provenance || o.uncertainty !== original.uncertainty || !Array.isArray(o.features)
      || o.features.length !== original.features.length || o.features.some((f, i) => !record(f) || (['name', 'value', 'unit', 'kind'] as const).some(k => f[k] !== original.features[i][k]))) throw new Error('Mismatched research observations');
  }
  if (echoedIds.size !== observationIds.size) throw new Error('Mismatched research observations');
  const datasetIds = new Set<string>();
  for (const d of value.datasets) {
    if (!record(d) || typeof d.dataset_id !== 'string' || typeof d.title !== 'string' || d.kind !== 'registry_metadata' || typeof d.provenance !== 'string') throw new Error('Invalid dataset evidence');
    datasetIds.add(d.dataset_id);
  }
  const linked = (v: unknown): boolean => record(v) && textList(v.observation_ids) && textList(v.dataset_ids)
    && v.observation_ids.every(id => observationIds.has(id)) && v.dataset_ids.every(id => datasetIds.has(id));
  for (const h of value.interpretations) {
    if (!record(h) || h.kind !== 'hypothesis' || typeof h.statement !== 'string' || typeof h.uncertainty !== 'string'
      || !linked(h.supporting) || !linked(h.against) || !(h.supporting as EvidenceLinks).observation_ids.length) throw new Error('Unlinked research hypothesis rejected');
  }
  for (const c of value.comparisons) {
    if (!record(c) || c.kind !== 'metadata_context_only' || c.measured_properties_compared !== false
      || !observationIds.has(String(c.observation_id)) || !datasetIds.has(String(c.dataset_id))
      || !textList(c.available_metadata_fields) || !textList(c.missing_metadata_fields) || !textList(c.limitations)) throw new Error('Invalid metadata comparison');
  }
  if (value.status === 'unavailable' && value.interpretations.length) throw new Error('Unavailable research cannot contain hypotheses');
}
