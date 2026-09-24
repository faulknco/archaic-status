import type { Env, KvLike } from '../src/index';
import { applyRun, emptySnapshot, type Snapshot } from '../src/store';
import type { CheckResult } from '../src/check';
import { TARGETS } from '../src/targets';

export const T0 = Date.UTC(2026, 8, 24, 12, 0, 0) / 1000; // 2026-09-24T12:00:00Z, unix seconds

export function memoryKv(initial: Record<string, string> = {}): KvLike & { store: Map<string, string> } {
  const store = new Map(Object.entries(initial));
  return {
    store,
    get: async (key) => store.get(key) ?? null,
    put: async (key, value) => {
      store.set(key, value);
    },
  };
}

export const envWith = (kv: KvLike): Env => ({ STATUS_KV: kv });

/** Results for every target at time `at`, all up except the ids in `failing`. */
export function results(at: number, failing: string[] = [], status = 200): CheckResult[] {
  return TARGETS.map((t) => ({ id: t.id, status: failing.includes(t.id) ? 503 : status, latency_ms: 120, checked_at: at }));
}

/** A snapshot built from `runs` cron runs ending at `end`, every 300 s, with optional failures per run index. */
export function snapshotFrom(runs: number, end: number, failingAt: (i: number) => string[] = () => []): Snapshot {
  let s = emptySnapshot();
  for (let i = 0; i < runs; i++) {
    const at = end - (runs - 1 - i) * 300;
    s = applyRun(s, results(at, failingAt(i)), at);
  }
  return s;
}
