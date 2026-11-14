import { useEffect, useRef, useState } from 'react';
import { api } from './api';
export default function KnowledgeSearch() {
  const [keywords, setKeywords] = useState('Mars');
  const [data, setData] = useState<Awaited<ReturnType<typeof api.discover>>>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pending = useRef<AbortController | undefined>(undefined);
  useEffect(() => () => pending.current?.abort(), []);
  async function search() {
    pending.current?.abort(); const controller = new AbortController(); pending.current = controller;
    setBusy(true); setData(undefined); setError('');
    try { const result = await api.discover(keywords.trim(), controller.signal); if (!controller.signal.aborted) setData(result); }
    catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'Discovery request failed'); }
    finally { if (pending.current === controller) setBusy(false); }
  }
  return <section className="panel" style={{ padding: 24 }}><h2>Planetary scientific knowledge</h2><p>Search NASA PDS archive metadata using the registry title wildcard query through the backend (for example, Mars). Indexed coverage is incomplete; hit counts are upstream registry estimates. Search results are not downloaded datasets or geological matches.</p><form onSubmit={e => { e.preventDefault(); void search(); }}><label>Archive keywords <input aria-label="Archive keywords" value={keywords} maxLength={200} onChange={e => setKeywords(e.target.value)} style={{ padding: 10, margin: 12 }}/></label><button className="primary" disabled={busy || !keywords.trim()}>{busy ? 'Searching PDS…' : 'Search NASA PDS'}</button></form>{error && <p className="error" role="alert">{error}</p>}{data && <><p role="status">{data.hits} indexed matches · showing {data.items.length} · {data.from_cache ? 'cached metadata' : 'upstream metadata'}</p><p className="caution">{data.disclaimer}</p>{!data.items.length && <p>No indexed products returned. This does not establish that no relevant planetary data exists.</p>}{data.items.map(p => <article key={p.lidvid} style={{ borderTop: '1px solid #36413d', padding: '16px 0' }}><h3>{p.title || p.lidvid}</h3><code style={{ overflowWrap: 'anywhere' }}>{p.lidvid}</code><p>{p.description}</p><p>Instrument: {p.instrument || 'not supplied'} · Target: {p.target_name || 'not supplied'} · Processing: {p.processing_level || 'not supplied'}</p><small>Source: NASA Planetary Data System registry · metadata only; no asset retrieved.</small></article>)}</>}</section>;
}
