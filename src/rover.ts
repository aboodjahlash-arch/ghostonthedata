export type Position = { longitude: number; latitude: number; height?: number };
export type Playback = { position: Position; index: number; distance: number; battery: number; status: 'ready' | 'moving' | 'arrived' | 'stopped'; heading: number };
const radius = 3396190;
export function distance(a: Position, b: Position) {
  const rad = Math.PI / 180, lat = (b.latitude - a.latitude) * rad, lon = (b.longitude - a.longitude) * rad;
  const h = Math.sin(lat / 2) ** 2 + Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin(lon / 2) ** 2;
  return Math.hypot(2 * radius * Math.asin(Math.sqrt(Math.min(1, h))), (b.height ?? 0) - (a.height ?? 0));
}
export function createPlayback(points: Position[]): Playback {
  if (points.length < 2 || points.some(p => !Number.isFinite(p.longitude) || !Number.isFinite(p.latitude) || Math.abs(p.latitude) > 90 || Math.abs(p.longitude) > 180 || (p.height !== undefined && !Number.isFinite(p.height)))) throw new Error('A valid route with at least two coordinates is required.');
  return { position: { ...points[0] }, index: 1, distance: 0, battery: 100, status: 'ready', heading: 0 };
}
export function advancePlayback(state: Playback, points: Position[], seconds: number, speed = 1): Playback {
  if (!Number.isFinite(seconds) || seconds < 0 || !Number.isFinite(speed) || speed <= 0) throw new Error('Invalid simulation timestep or speed.');
  if (state.status === 'arrived' || state.status === 'stopped') return state;
  let budget = Math.min(seconds, 10) * speed;
  let { position, index, heading } = state;
  let moved = 0;
  budget = Math.min(budget, state.battery / 0.002);
  while (index < points.length) {
    const target = points[index], remaining = distance(position, target);
    if (remaining < 0.001) { position = { ...target }; index++; continue; }
    if (budget <= 0) break;
    const step = Math.min(budget, remaining), t = step / remaining;
    const delta = ((target.longitude - position.longitude + 540) % 360) - 180;
    heading = Math.atan2(delta * Math.cos(position.latitude * Math.PI / 180), target.latitude - position.latitude);
    position = { longitude: ((position.longitude + delta * t + 540) % 360) - 180, latitude: position.latitude + (target.latitude - position.latitude) * t, height: (position.height ?? 0) + ((target.height ?? 0) - (position.height ?? 0)) * t };
    budget -= step; moved += step;
    if (t === 1) { position = { ...target }; index++; }
  }
  const battery = Math.max(0, state.battery - moved * 0.002);
  return { position, index, distance: state.distance + moved, battery, heading, status: index >= points.length ? 'arrived' : battery <= 0 ? 'stopped' : 'moving' };
}
