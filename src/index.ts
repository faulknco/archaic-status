import { checkAll } from './check';
import { classify, STALE_AFTER_S } from './classify';
import { renderPage } from './render';
import { applyRun, dayKeys, KV_KEY, parseSnapshot, type Snapshot } from './store';
import { TARGETS } from './targets';

/** The slice of KVNamespace the worker uses; tests pass a Map-backed stub. */
export type KvLike = {
  get(key: string, options: { type: 'text'; cacheTtl?: number }): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
};
export type Env = { STATUS_KV: KvLike };
export type Deps = { fetch?: typeof fetch; now?: () => number; cache?: Cache | null };

const PAGE_TTL_S = 60;
const SECURITY_HEADERS: Record<string, string> = {
  'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  'strict-transport-security': 'max-age=31536000; includeSubDomains',
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'permissions-policy': 'camera=(), microphone=(), geolocation=(), browsing-topics=()',
};

const nowSeconds = (now: () => number): number => Math.floor(now() / 1000);

async function loadSnapshot(env: Env, cacheTtl?: number): Promise<Snapshot> {
  return parseSnapshot(await env.STATUS_KV.get(KV_KEY, cacheTtl ? { type: 'text', cacheTtl } : { type: 'text' }));
}

/** One cron run: probe every target, fold the results in, write the document back. */
export async function runOnce(env: Env, deps: Deps = {}): Promise<Snapshot> {
  const fetchImpl = deps.fetch ?? fetch;
  const now = deps.now ?? Date.now;
  const [prev, results] = await Promise.all([loadSnapshot(env), checkAll(TARGETS, fetchImpl, now)]);
  const next = applyRun(prev, results, nowSeconds(now));
  await env.STATUS_KV.put(KV_KEY, JSON.stringify(next));
  return next;
}

export function statusJson(snapshot: Snapshot, now: number): unknown {
  const days = dayKeys(now);
  return {
    generated_at: new Date(now * 1000).toISOString(),
    last_run_at: snapshot.run_at ? new Date(snapshot.run_at * 1000).toISOString() : null,
    targets: TARGETS.map((t) => {
      const latest = snapshot.latest[t.id];
      return {
        id: t.id,
        name: t.name,
        url: t.url,
        state: classify(snapshot.history[t.id], now),
        http_status: latest?.status ?? null,
        latency_ms: latest?.latency_ms ?? null,
        checked_at: latest ? new Date(latest.checked_at * 1000).toISOString() : null,
        daily: days.map((date) => ({ date, ...(snapshot.daily[t.id]?.[date] ?? { checks: 0, failures: 0 }) })),
      };
    }),
  };
}

function withHeaders(res: Response, extra: Record<string, string>): Response {
  const h = new Headers(res.headers);
  for (const [k, v] of Object.entries({ ...SECURITY_HEADERS, ...extra })) h.set(k, v);
  return new Response(res.body, { status: res.status, headers: h });
}

export async function handleRequest(request: Request, env: Env, deps: Deps = {}): Promise<Response> {
  const now = deps.now ?? Date.now;
  const url = new URL(request.url);
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return withHeaders(new Response('Method not allowed', { status: 405 }), { allow: 'GET, HEAD' });
  }

  if (url.pathname === '/health') {
    const snapshot = await loadSnapshot(env, PAGE_TTL_S);
    const t = nowSeconds(now);
    const body = {
      ok: true,
      last_run_at: snapshot.run_at ? new Date(snapshot.run_at * 1000).toISOString() : null,
      stale: !snapshot.run_at || t - snapshot.run_at > STALE_AFTER_S,
    };
    return withHeaders(Response.json(body), { 'cache-control': 'no-store' });
  }

  if (url.pathname === '/status.json') {
    const snapshot = await loadSnapshot(env, PAGE_TTL_S);
    return withHeaders(Response.json(statusJson(snapshot, nowSeconds(now))), {
      'cache-control': `public, max-age=${PAGE_TTL_S}`,
      'access-control-allow-origin': '*',
    });
  }

  if (url.pathname === '/') {
    // Edge cache for a minute: the Cache API on the custom domain, keyed by the bare URL.
    const cache = deps.cache === undefined ? (typeof caches !== 'undefined' ? caches.default : null) : deps.cache;
    const key = new Request(`${url.origin}/`, { method: 'GET' });
    if (cache) {
      // The zone's Browser Cache TTL rewrites cache-control on Cache API hits; put ours back.
      const hit = await cache.match(key);
      if (hit) return withHeaders(hit, { 'cache-control': `public, max-age=${PAGE_TTL_S}` });
    }
    const snapshot = await loadSnapshot(env);
    const html = renderPage(snapshot, TARGETS, nowSeconds(now));
    const res = withHeaders(new Response(html), {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': `public, max-age=${PAGE_TTL_S}`,
    });
    if (cache) await cache.put(key, res.clone());
    return res;
  }

  return withHeaders(new Response('Not found', { status: 404 }), { 'cache-control': 'no-store' });
}

export default {
  fetch: (request: Request, env: Env) => handleRequest(request, env),
  scheduled: (_event: ScheduledEvent, env: Env, ctx: ExecutionContext) => {
    ctx.waitUntil(runOnce(env));
  },
};
