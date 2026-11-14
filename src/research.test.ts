import test from 'node:test';
import assert from 'node:assert/strict';
import { validateResearchResponse, type ResearchRequest, type EvidenceLinks } from './research.ts';
const request: ResearchRequest = { observations: [{
  observation_id: 'capture-1', source: 'synthetic', summary: 'Captured local depth patch',
  model_method: 'Test model fixture', provenance: 'Synthetic test fixture',
  uncertainty: 'Uncalibrated', features: [{ name: 'slope', value: 0.1, unit: 'rise/run', kind: 'model_prediction' }]
}] };
const base = () => ({
  status: 'available', reason: null, provider: 'OpenRouter', model: 'explicit-fixture-model', observation_summary: request.observations, datasets: [], comparisons: [],
  interpretations: [{ kind: 'hypothesis', statement: 'Unverified morphology interpretation',
    supporting: { observation_ids: ['capture-1'], dataset_ids: [] } as EvidenceLinks, against: { observation_ids: [], dataset_ids: [] } as EvidenceLinks, uncertainty: 'High' }],
  missing_information: ['Composition'], uncertainty: 'Uncalibrated', followups: ['Compare calibrated depth'],
  disclaimer: 'Synthetic test fixture; not a scientific discovery'
});
test('research validates available and unavailable responses without fabricating evidence', () => {
  assert.doesNotThrow(() => validateResearchResponse(base(), request));
  const unavailable = { ...base(), status: 'unavailable', reason: 'not_configured', interpretations: [] };
  assert.doesNotThrow(() => validateResearchResponse(unavailable, request));
  assert.throws(() => validateResearchResponse({ ...base(), status: 'unavailable' }, request));
});
test('research rejects unknown observation and dataset citations and missing evidence', () => {
  for (const supporting of [
    { observation_ids: ['invented'], dataset_ids: [] },
    { observation_ids: ['capture-1'], dataset_ids: ['invented-nasa-product'] },
    { observation_ids: [], dataset_ids: [] }
  ]) {
    const value = base();
    value.interpretations[0].supporting = supporting;
    assert.throws(() => validateResearchResponse(value, request), /Unlinked/);
  }
  assert.throws(() => validateResearchResponse({}, request));
  const changedEvidence = structuredClone(base());
  changedEvidence.observation_summary[0].features[0].value = 99;
  assert.throws(() => validateResearchResponse(changedEvidence, request), /Mismatched/);
});
