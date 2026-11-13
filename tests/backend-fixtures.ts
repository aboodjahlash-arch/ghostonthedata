import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
export const backendRoot = process.env.GHOST_BACKEND_WORKSPACE || resolve(process.cwd(), '../ml_ghost');
export function backendFixture<T = any>(name: string): T { return JSON.parse(readFileSync(resolve(backendRoot, 'fixtures', `${name}.json`), 'utf8')); }
export function backendExperiments(): any {
  const markdown = readFileSync(resolve(backendRoot, 'docs/HANDOFF_EXAMPLES.md'), 'utf8');
  const section = markdown.slice(markdown.indexOf('## 3. `GET /api/experiments`'));
  const json = section.match(/```json\s*([\s\S]*?)```/)?.[1];
  if (!json) throw new Error('Backend captured experiment response missing. Set GHOST_BACKEND_WORKSPACE to the reviewed backend workspace.');
  const start = json.indexOf('{', json.indexOf('"items"'));
  let depth = 0; let quoted = false; let escaped = false;
  for (let i = start; i < json.length; i++) {
    const char = json[i];
    if (quoted) { if (escaped) escaped = false; else if (char === '\\') escaped = true; else if (char === '"') quoted = false; }
    else if (char === '"') quoted = true;
    else if (char === '{') depth++;
    else if (char === '}' && --depth === 0) return { count: 1, items: [JSON.parse(json.slice(start, i + 1))] };
  }
  throw new Error('No complete captured experiment record found; truncated records are never repaired.');
}
export function capturedCatalog() { const data = backendFixture('targets'); return { ...data, count: data.items.length, total: data.items.length }; }
