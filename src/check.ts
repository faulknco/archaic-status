import type { Target } from './targets';

export const CHECK_TIMEOUT_MS = 10_000;
const USER_AGENT = 'archaic-status/1.0 (+https://status.archaic.ie)';

/** One probe result. `status` is 0 when no HTTP response arrived (timeout, DNS, TLS). */
export type CheckResult = { id: string; status: number; latency_ms: number; checked_at: number };

export const isUp = (status: number): boolean => status >= 200 && status < 400;

export async function checkTarget(target: Target, fetchImpl: typeof fetch, now: () => number = Date.now): Promise<CheckResult> {
  const started = now();
  let status = 0;
  try {
    const res = await fetchImpl(target.url, {
      method: 'GET',
      redirect: 'manual',
      headers: { 'user-agent': USER_AGENT, accept: 'text/html,application/json;q=0.9,*/*;q=0.8' },
      signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
    });
    status = res.status;
    // Drain so the connection is released; the body is never inspected.
    await res.body?.cancel();
  } catch {
    status = 0;
  }
  const finished = now();
  return { id: target.id, status, latency_ms: Math.max(0, finished - started), checked_at: Math.floor(finished / 1000) };
}

export function checkAll(targets: readonly Target[], fetchImpl: typeof fetch, now: () => number = Date.now): Promise<CheckResult[]> {
  return Promise.all(targets.map((t) => checkTarget(t, fetchImpl, now)));
}
