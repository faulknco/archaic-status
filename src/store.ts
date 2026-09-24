// Everything the worker remembers lives in one KV document so a cron run costs
// one read and one write (KV's free tier allows 1,000 writes a day; a 5-minute
// cron is 288 runs). The document holds three views per target:
//   latest   — the most recent probe
//   history  — a ring of the last RING_SIZE probes (24 h at 5-minute cadence)
//   daily    — a roll-up of the last DAILY_DAYS UTC days: checks and failures
import { isUp, type CheckResult } from './check';

export const KV_KEY = 'snapshot';
export const RING_SIZE = 288;
export const DAILY_DAYS = 90;
export const CRON_INTERVAL_S = 300;

/** [checked_at unix seconds, http status (0 = no response), latency ms] */
export type HistoryEntry = [number, number, number];
export type Latest = { status: number; latency_ms: number; checked_at: number };
export type DayRollup = { checks: number; failures: number };

export type Snapshot = {
  v: 1;
  run_at: number; // unix seconds of the last completed cron run
  latest: Record<string, Latest>;
  history: Record<string, HistoryEntry[]>;
  daily: Record<string, Record<string, DayRollup>>; // target id -> 'YYYY-MM-DD' -> roll-up
};

export const emptySnapshot = (): Snapshot => ({ v: 1, run_at: 0, latest: {}, history: {}, daily: {} });

export const dayKey = (unixSeconds: number): string => new Date(unixSeconds * 1000).toISOString().slice(0, 10);

/** The DAILY_DAYS day keys ending today (UTC), oldest first. */
export function dayKeys(nowSeconds: number, days = DAILY_DAYS): string[] {
  const todayMs = Math.floor((nowSeconds * 1000) / 86_400_000) * 86_400_000;
  const out: string[] = [];
  for (let i = days - 1; i >= 0; i--) out.push(new Date(todayMs - i * 86_400_000).toISOString().slice(0, 10));
  return out;
}

/** Fold one run of results into the snapshot. Pure: returns a new object, never mutates. */
export function applyRun(prev: Snapshot, results: CheckResult[], runAt: number): Snapshot {
  const next: Snapshot = { v: 1, run_at: runAt, latest: { ...prev.latest }, history: { ...prev.history }, daily: { ...prev.daily } };
  const keep = new Set(dayKeys(runAt));
  for (const r of results) {
    next.latest[r.id] = { status: r.status, latency_ms: r.latency_ms, checked_at: r.checked_at };
    const ring = [...(prev.history[r.id] ?? []), [r.checked_at, r.status, r.latency_ms] as HistoryEntry];
    next.history[r.id] = ring.length > RING_SIZE ? ring.slice(ring.length - RING_SIZE) : ring;
    const day = dayKey(r.checked_at);
    const days: Record<string, DayRollup> = {};
    for (const [k, v] of Object.entries(prev.daily[r.id] ?? {})) if (keep.has(k)) days[k] = v;
    const cur = days[day] ?? { checks: 0, failures: 0 };
    days[day] = { checks: cur.checks + 1, failures: cur.failures + (isUp(r.status) ? 0 : 1) };
    next.daily[r.id] = days;
  }
  return next;
}

export function parseSnapshot(raw: string | null): Snapshot {
  if (!raw) return emptySnapshot();
  try {
    const s = JSON.parse(raw) as Partial<Snapshot>;
    if (s && s.v === 1 && s.latest && s.history && s.daily) return s as Snapshot;
  } catch {
    /* fall through */
  }
  return emptySnapshot();
}
