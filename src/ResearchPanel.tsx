import { useEffect, useRef, useState } from 'react';
import { api } from './api';
import type { ResearchObservation, ResearchResponse, ResearchResult } from './research.ts';

export default function ResearchPanel({ observations, session, tick, onResult }: { observations: ResearchObservation[]; session: object; tick: number; onResult: (result: ResearchResult | undefined) => void }) {
  const [answer, setAnswer] = useState<ResearchResponse>();
  const [basedOnTick, setBasedOnTick] = useState<number>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState(false);
  const request = useRef<AbortController | null>(null);
  useEffect(() => {
    request.current?.abort(); setAnswer(undefined); setError(''); setBusy(false); setBasedOnTick(undefined); onResult(undefined);
    return () => request.current?.abort();
  }, [session, onResult]);
  async function interpret() {
    request.current?.abort();
    const controller = new AbortController(); request.current = controller;
    setBusy(true); setError(''); setAnswer(undefined); setBasedOnTick(tick); onResult(undefined);
    try {
      const result = await api.research({ observations: structuredClone(observations),
        ...(search ? { pds_query: { keywords: 'Mars', target: 'urn:nasa:pds:context:target:planet.mars', limit: 3 } } : {}) }, controller.signal);
      if (!controller.signal.aborted) { setAnswer(result); onResult({ response: result, requestedAtTick: tick }); }
    } catch (e) {
      if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'Research request failed');
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  return <section aria-label="Optional scientific research assistant" style={{ padding: 16, border: '1px solid #2b3d38' }}>
    <h3>Optional scientific interpretation</h3>
    <p>Advisory only. No movement interface. Rover autonomy runs without this service.</p>
    <label><input type="checkbox" checked={search} onChange={e => setSearch(e.target.checked)}/> Request bounded Mars PDS metadata context (not a proven analogue)</label>
    <p>{observations.length} observation summaries ready; raw captures remain in the survey export.</p>
    <button className="secondary" disabled={busy || !observations.length} onClick={() => void interpret()}>{busy ? 'Requesting interpretation…' : 'Interpret observed evidence'}</button>
    {basedOnTick !== undefined && <p>Requested snapshot: simulation tick {basedOnTick}. Later rover activity is not included.</p>}
    {error && <p role="alert">{error} · Rover autonomy is unaffected.</p>}
    {answer && <>
      <p role="status">Research {answer.status}{answer.reason ? ` / ${answer.reason}` : ''}. Rover autonomy is unaffected.</p>
      <p>{answer.disclaimer}</p>
      <p>Provider: {answer.provider} / model: {answer.model || 'no verified provider response'}</p>
      <p>Uncertainty: {answer.uncertainty}</p>
      {answer.interpretations.map((h, i) => <article key={i}>
        <h4>Unverified hypothesis</h4><p>{h.statement}</p>
        <p>Supporting observation IDs: {h.supporting.observation_ids.join(', ')} · PDS IDs: {h.supporting.dataset_ids.join(', ') || 'none'}</p>
        <p>Counterevidence observation IDs: {h.against.observation_ids.join(', ') || 'none supplied'} · PDS IDs: {h.against.dataset_ids.join(', ') || 'none'}</p>
        <p>{h.uncertainty}</p>
      </article>)}
      {!answer.interpretations.length && <p>No hypothesis produced.</p>}
      {answer.datasets.map(d => <p key={d.dataset_id}>{d.title} · {d.dataset_id} · {d.provenance} / metadata only. Instrument: {d.instrument || 'not supplied'}; processing: {d.processing_level || 'not supplied'}.</p>)}
      {answer.comparisons.length > 0 && <details><summary>Metadata comparison limitations ({answer.comparisons.length} evidence pairs)</summary>
        {answer.comparisons.map((c, i) => <div key={i}><p>{c.observation_id} / {c.dataset_id}: metadata context only, no measured-property comparison.</p>
          <p>Available metadata: {c.available_metadata_fields.join(', ')}</p><p>Not supplied by adapter: {c.missing_metadata_fields.join(', ')}</p>
          <ul>{c.limitations.map((s, j) => <li key={j}>{s}</li>)}</ul></div>)}
      </details>}
      <h4>Missing information</h4><ul>{answer.missing_information.map((s, i) => <li key={i}>{s}</li>)}</ul>
      <h4>Scientific follow-up information</h4><ul>{answer.followups.map((s, i) => <li key={i}>{s}</li>)}</ul>
    </>}
  </section>;
}
