import { describe, expect, it } from 'vitest';
import { applyRun, DAILY_DAYS, dayKey, dayKeys, emptySnapshot, parseSnapshot, RING_SIZE } from '../src/store';
import { results, snapshotFrom, T0 } from './helpers';
import { TARGETS } from '../src/targets';

describe('applyRun', () => {
  it('records latest, appends to the ring and counts the day', () => {
    const s = applyRun(emptySnapshot(), results(T0, ['roleup']), T0);
    expect(s.run_at).toBe(T0);
    expect(s.latest.roleup).toEqual({ status: 503, latency_ms: 120, checked_at: T0 });
    expect(s.latest.archaic?.status).toBe(200);
    expect(s.history.archaic).toEqual([[T0, 200, 120]]);
    expect(s.daily.roleup?.['2026-09-24']).toEqual({ checks: 1, failures: 1 });
    expect(s.daily.archaic?.['2026-09-24']).toEqual({ checks: 1, failures: 0 });
  });

  it('does not mutate the previous snapshot', () => {
    const prev = applyRun(emptySnapshot(), results(T0), T0);
    const frozen = JSON.stringify(prev);
    applyRun(prev, results(T0 + 300, ['forge']), T0 + 300);
    expect(JSON.stringify(prev)).toBe(frozen);
  });

  it('caps the ring at RING_SIZE, newest last', () => {
    const s = snapshotFrom(RING_SIZE + 10, T0);
    for (const t of TARGETS) {
      expect(s.history[t.id]).toHaveLength(RING_SIZE);
      expect(s.history[t.id]![RING_SIZE - 1]![0]).toBe(T0);
      expect(s.history[t.id]![0]![0]).toBe(T0 - (RING_SIZE - 1) * 300);
    }
  });

  it('rolls a full day up into checks and failures', () => {
    const end = Date.UTC(2026, 8, 24, 23, 55, 0) / 1000;
    const s = snapshotFrom(288, end, (i) => (i % 10 === 0 ? ['salaries'] : []));
    expect(s.daily.salaries?.['2026-09-24']).toEqual({ checks: 288, failures: 29 });
    expect(s.daily.archaic?.['2026-09-24']).toEqual({ checks: 288, failures: 0 });
  });

  it('splits runs across UTC midnight into two days', () => {
    const s = snapshotFrom(4, Date.UTC(2026, 8, 25, 0, 5, 0) / 1000);
    expect(s.daily.archaic?.['2026-09-24']).toEqual({ checks: 2, failures: 0 });
    expect(s.daily.archaic?.['2026-09-25']).toEqual({ checks: 2, failures: 0 });
  });

  it('drops roll-ups older than DAILY_DAYS', () => {
    let s = applyRun(emptySnapshot(), results(T0 - 100 * 86_400), T0 - 100 * 86_400);
    s = applyRun(s, results(T0 - 89 * 86_400), T0 - 89 * 86_400);
    s = applyRun(s, results(T0), T0);
    expect(Object.keys(s.daily.archaic!).sort()).toEqual([dayKey(T0 - 89 * 86_400), dayKey(T0)]);
  });
});

describe('dayKeys', () => {
  it('gives DAILY_DAYS UTC days ending today, oldest first', () => {
    const keys = dayKeys(T0);
    expect(keys).toHaveLength(DAILY_DAYS);
    expect(keys[DAILY_DAYS - 1]).toBe('2026-09-24');
    expect(keys[0]).toBe('2026-06-27');
    expect(dayKeys(Date.UTC(2026, 8, 24, 23, 59, 59) / 1000)[DAILY_DAYS - 1]).toBe('2026-09-24');
  });
});

describe('parseSnapshot', () => {
  it('falls back to an empty snapshot on missing, corrupt or foreign data', () => {
    expect(parseSnapshot(null)).toEqual(emptySnapshot());
    expect(parseSnapshot('{not json')).toEqual(emptySnapshot());
    expect(parseSnapshot('{"v":2}')).toEqual(emptySnapshot());
  });
  it('round-trips a real snapshot', () => {
    const s = snapshotFrom(3, T0);
    expect(parseSnapshot(JSON.stringify(s))).toEqual(s);
  });
});
