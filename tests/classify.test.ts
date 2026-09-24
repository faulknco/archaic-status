import { describe, expect, it } from 'vitest';
import { classify, classifyDay, STALE_AFTER_S } from '../src/classify';
import type { HistoryEntry } from '../src/store';

const ring = (statuses: number[], end: number): HistoryEntry[] => statuses.map((s, i) => [end - (statuses.length - 1 - i) * 300, s, 100]);
const NOW = 1_800_000_000;

describe('classify', () => {
  it('is Unknown with no history', () => {
    expect(classify(undefined, NOW)).toBe('Unknown');
    expect(classify([], NOW)).toBe('Unknown');
  });
  it('is Unknown when the newest probe is stale', () => {
    expect(classify(ring([200, 200, 200], NOW - STALE_AFTER_S - 1), NOW)).toBe('Unknown');
    expect(classify(ring([200, 200, 200], NOW - STALE_AFTER_S + 1), NOW)).toBe('Operational');
  });
  it('is Operational when the recent window all passed', () => {
    expect(classify(ring([503, 503, 200, 200, 200, 200, 200, 200], NOW), NOW)).toBe('Operational');
    expect(classify(ring([301], NOW), NOW)).toBe('Operational');
  });
  it('is Degraded on a single fresh failure', () => {
    expect(classify(ring([200, 200, 200, 503], NOW), NOW)).toBe('Degraded');
    expect(classify(ring([200, 200, 200, 0], NOW), NOW)).toBe('Degraded');
  });
  it('is Degraded while recovering from a failure inside the window', () => {
    expect(classify(ring([200, 503, 200, 200], NOW), NOW)).toBe('Degraded');
  });
  it('is Down after two failures in the window ending with a failure', () => {
    expect(classify(ring([200, 503, 503], NOW), NOW)).toBe('Down');
    expect(classify(ring([503, 200, 200, 200, 200, 0], NOW), NOW)).toBe('Down');
  });
  it('treats 4xx and 5xx and no-response as failures, 2xx and 3xx as passes', () => {
    expect(classify(ring([404, 404], NOW), NOW)).toBe('Down');
    expect(classify(ring([204, 302], NOW), NOW)).toBe('Operational');
  });
});

describe('classifyDay', () => {
  it('maps roll-ups to the four bar classes', () => {
    expect(classifyDay(undefined)).toBe('none');
    expect(classifyDay({ checks: 0, failures: 0 })).toBe('none');
    expect(classifyDay({ checks: 288, failures: 0 })).toBe('ok');
    expect(classifyDay({ checks: 288, failures: 1 })).toBe('partial');
    expect(classifyDay({ checks: 288, failures: 143 })).toBe('partial');
    expect(classifyDay({ checks: 288, failures: 144 })).toBe('down');
    expect(classifyDay({ checks: 1, failures: 1 })).toBe('down');
  });
});
