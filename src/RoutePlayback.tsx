import { useEffect, useState } from 'react';
import type { Route } from './api';
import { advancePlayback, createPlayback, type Playback } from './rover.ts';
export default function RoutePlayback({ route, onState }: { route: Route; onState: (state: Playback | undefined) => void }) {
  const [state, setState] = useState<Playback>();
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const [events, setEvents] = useState<string[]>([]);
  useEffect(() => {
    setRunning(false); setError(''); setEvents([]);
    try { setState(createPlayback(route.coordinates)); } catch (e) { setState(undefined); setError(String(e)); }
    return () => onState(undefined);
  }, [route, onState]);
  useEffect(() => { onState(state); }, [state, onState]);
  useEffect(() => {
    if (!running) return;
    let last = performance.now();
    const timer = window.setInterval(() => { const now = performance.now(); const dt = (now - last) / 1000; last = now; setState(s => s ? advancePlayback(s, route.coordinates, dt, 10) : s); }, 100);
    return () => clearInterval(timer);
  }, [running, route]);
  useEffect(() => { if (state?.status === 'arrived' || state?.status === 'stopped') { setRunning(false); setEvents(old => [...old, `${new Date().toISOString()} / ${state.status === 'arrived' ? 'Route endpoint reached; no sensor observation was inferred.' : 'Stopped: simulated battery depleted.'}`]); } }, [state?.status]);
  return <section className="panel" style={{ padding: 16 }}><h3>Simulated route execution</h3><p className="caution">Guided playback of the backend route, not autonomous driving. 10 m/s accelerated simulation; no collision model or validated mobility physics. Battery uses an illustrative 0.002%/m budget.</p>{error && <p role="alert">{error}</p>}{state && <><p aria-live="polite">{state.status} · {state.distance.toFixed(1)} m traveled · {state.battery.toFixed(2)}% simulated battery</p><p>{state.position.latitude.toFixed(6)}° N / {state.position.longitude.toFixed(6)}° E</p><button className="primary" disabled={state.status === 'arrived' || state.status === 'stopped'} onClick={() => { setRunning(!running); setEvents(old => [...old, `${new Date().toISOString()} / Playback ${running ? 'paused' : 'started'}`]); }}>{running ? 'Pause playback' : 'Execute simulated route'}</button> <button className="secondary" onClick={() => { setRunning(false); setState(createPlayback(route.coordinates)); setEvents([]); }}>Reset playback</button></>}<ol aria-label="Route execution events">{events.map((event, i) => <li key={i}>{event}</li>)}</ol></section>;
}
