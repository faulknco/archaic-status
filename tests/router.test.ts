import { describe, expect, it } from 'vitest';
import { handleRequest, runOnce, statusJson } from '../src/index';
import { KV_KEY } from '../src/store';
import { TARGETS } from '../src/targets';
import { envWith, memoryKv, snapshotFrom, T0 } from './helpers';

const nowMs = () => T0 * 1000;
const seeded = () => memoryKv({ [KV_KEY]: JSON.stringify(snapshotFrom(12, T0 - 120, (i) => (i >= 10 ? ['roleup'] : []))) });

describe('runOnce', () => {
  it('probes every target through the injected fetch and writes one document', async () => {
    const kv = memoryKv();
    const seen: string[] = [];
    const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
      seen.push(String(input));
      expect(init?.redirect).toBe('manual');
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      return String(input).includes('roleup') ? new Response(null, { status: 302, headers: { location: '/x' } }) : new Response('ok');
    }) as typeof fetch;
    const snap = await runOnce(envWith(kv), { fetch: fetchImpl, now: nowMs });
    expect(seen.sort()).toEqual(TARGETS.map((t) => t.url).sort());
    expect(kv.store.size).toBe(1);
    expect(snap.run_at).toBe(T0);
    expect(snap.latest.roleup?.status).toBe(302);
    expect(snap.daily.roleup?.['2026-09-24']).toEqual({ checks: 1, failures: 0 });
  });

  it('records a thrown fetch as status 0 and keeps going', async () => {
    const kv = memoryKv();
    const fetchImpl = (async (input: RequestInfo | URL) => {
      if (String(input).includes('salaries')) throw new TypeError('network');
      return new Response('ok');
    }) as typeof fetch;
    const snap = await runOnce(envWith(kv), { fetch: fetchImpl, now: nowMs });
    expect(snap.latest.salaries?.status).toBe(0);
    expect(snap.daily.salaries?.['2026-09-24']).toEqual({ checks: 1, failures: 1 });
    expect(snap.latest.archaic?.status).toBe(200);
  });
});

describe('GET /', () => {
  it('renders HTML from KV with cache and security headers', async () => {
    const res = await handleRequest(new Request('https://status.archaic.ie/'), envWith(seeded()), { now: nowMs, cache: null });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    expect(res.headers.get('cache-control')).toBe('public, max-age=60');
    expect(res.headers.get('content-security-policy')).toContain("default-src 'none'");
    expect(res.headers.get('x-frame-options')).toBe('DENY');
    const html = await res.text();
    expect(html).toContain('<h1>Status</h1>');
    expect(html).toContain('class="state Down">Down');
    expect(html).toContain('checked 2 minutes ago');
  });

  it('serves from the cache when it has an entry and fills it when it does not', async () => {
    const store = new Map<string, Response>();
    const cache = {
      match: async (req: Request) => store.get(req.url)?.clone(),
      put: async (req: Request, res: Response) => {
        store.set(req.url, res);
      },
    } as unknown as Cache;
    const env = envWith(seeded());
    const first = await handleRequest(new Request('https://status.archaic.ie/?x=1'), env, { now: nowMs, cache });
    expect(first.status).toBe(200);
    expect(store.has('https://status.archaic.ie/')).toBe(true);
    store.get('https://status.archaic.ie/')!.headers.set('cache-control', 'public, max-age=14400'); // what the zone does to hits
    const second = await handleRequest(new Request('https://status.archaic.ie/'), envWith(memoryKv()), { now: nowMs, cache });
    expect(second.headers.get('cache-control')).toBe('public, max-age=60');
    expect(await second.text()).toContain('class="state Down">Down');
  });
});

describe('GET /status.json', () => {
  it('returns latest plus the 90-day roll-up per target', async () => {
    const res = await handleRequest(new Request('https://status.archaic.ie/status.json'), envWith(seeded()), { now: nowMs });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/json');
    expect(res.headers.get('cache-control')).toBe('public, max-age=60');
    const body = (await res.json()) as ReturnType<typeof statusJson> & { targets: Record<string, unknown>[]; generated_at: string; last_run_at: string };
    expect(body.generated_at).toBe('2026-09-24T12:00:00.000Z');
    expect(body.last_run_at).toBe('2026-09-24T11:58:00.000Z');
    expect(body.targets).toHaveLength(TARGETS.length);
    const roleup = body.targets.find((t) => t.id === 'roleup') as { state: string; http_status: number; latency_ms: number; checked_at: string; daily: { date: string; checks: number; failures: number }[] };
    expect(Object.keys(roleup).sort()).toEqual(['checked_at', 'daily', 'http_status', 'id', 'latency_ms', 'name', 'state', 'url']);
    expect(roleup.state).toBe('Down');
    expect(roleup.http_status).toBe(503);
    expect(roleup.checked_at).toBe('2026-09-24T11:58:00.000Z');
    expect(roleup.daily).toHaveLength(90);
    expect(roleup.daily[89]).toEqual({ date: '2026-09-24', checks: 12, failures: 2 });
    expect(roleup.daily[0]).toEqual({ date: '2026-06-27', checks: 0, failures: 0 });
  });

  it('is empty but well-formed before the first run', async () => {
    const res = await handleRequest(new Request('https://status.archaic.ie/status.json'), envWith(memoryKv()), { now: nowMs });
    const body = (await res.json()) as { last_run_at: null; targets: { state: string; http_status: null }[] };
    expect(body.last_run_at).toBeNull();
    expect(body.targets.every((t) => t.state === 'Unknown' && t.http_status === null)).toBe(true);
  });
});

describe('GET /health and the rest', () => {
  it('reports the last run time and staleness', async () => {
    const fresh = await handleRequest(new Request('https://status.archaic.ie/health'), envWith(seeded()), { now: nowMs });
    expect(fresh.status).toBe(200);
    expect(await fresh.json()).toEqual({ ok: true, last_run_at: '2026-09-24T11:58:00.000Z', stale: false });
    const old = await handleRequest(new Request('https://status.archaic.ie/health'), envWith(seeded()), { now: () => nowMs() + 3 * 3600 * 1000 });
    expect(await old.json()).toMatchObject({ ok: true, stale: true });
    const never = await handleRequest(new Request('https://status.archaic.ie/health'), envWith(memoryKv()), { now: nowMs });
    expect(await never.json()).toEqual({ ok: true, last_run_at: null, stale: true });
  });
  it('404s unknown paths and 405s writes', async () => {
    expect((await handleRequest(new Request('https://status.archaic.ie/nope'), envWith(memoryKv()))).status).toBe(404);
    expect((await handleRequest(new Request('https://status.archaic.ie/', { method: 'POST' }), envWith(memoryKv()))).status).toBe(405);
  });
});
