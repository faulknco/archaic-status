import { isUp } from './check';
import type { DayRollup, HistoryEntry } from './store';
import { CRON_INTERVAL_S } from './store';

export type State = 'Operational' | 'Degraded' | 'Down' | 'Unknown';
export type DayClass = 'ok' | 'partial' | 'down' | 'none';

/** Probes older than this are treated as missing: the cron has stopped, so the state is unknown. */
export const STALE_AFTER_S = CRON_INTERVAL_S * 4;
/** How many recent probes a single failure taints (30 minutes at the 5-minute cadence). */
export const RECENT_WINDOW = 6;

/**
 * State from the probe ring, newest last.
 *  Unknown      no probes, or the newest probe is stale
 *  Down         the newest probe failed and so did at least one other in the recent window
 *  Degraded     the newest probe failed on its own, or it passed but something in the window failed
 *  Operational  the whole recent window passed
 */
export function classify(history: readonly HistoryEntry[] | undefined, nowSeconds: number): State {
  if (!history || history.length === 0) return 'Unknown';
  const last = history[history.length - 1]!;
  if (nowSeconds - last[0] > STALE_AFTER_S) return 'Unknown';
  const recent = history.slice(-RECENT_WINDOW);
  const failures = recent.filter((e) => !isUp(e[1])).length;
  if (!isUp(last[1])) return failures >= 2 ? 'Down' : 'Degraded';
  return failures > 0 ? 'Degraded' : 'Operational';
}

/** Day colour: down when at least half the probes failed, partial when any did, none when nothing ran. */
export function classifyDay(day: DayRollup | undefined): DayClass {
  if (!day || day.checks === 0) return 'none';
  if (day.failures === 0) return 'ok';
  return day.failures * 2 >= day.checks ? 'down' : 'partial';
}
