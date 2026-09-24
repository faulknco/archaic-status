import { describe, expect, it } from 'vitest';
import { ago, renderPage, rows } from '../src/render';
import { emptySnapshot } from '../src/store';
import { TARGETS } from '../src/targets';
import { snapshotFrom, T0 } from './helpers';

describe('renderPage', () => {
  const snapshot = snapshotFrom(12, T0 - 180, (i) => (i >= 10 ? ['roleup'] : i === 6 ? ['forge'] : []));
  const html = renderPage(snapshot, TARGETS, T0);

  it('has the heading, the one line, and every target', () => {
    expect(html).toContain('<h1>Status</h1>');
    expect(html).toContain("Live checks of the studio's public surfaces.");
    for (const t of TARGETS) expect(html).toContain(`>${t.name}</a>`);
  });

  it('shows one state word per target', () => {
    expect(html).toContain('<span class="state Down">Down</span>');
    expect(html).toContain('<span class="state Degraded">Degraded</span>');
    expect((html.match(/class="state Operational"/g) ?? []).length).toBe(5);
  });

  it('draws a 90-day bar per target with today at the right', () => {
    expect((html.match(/<div class="bar"/g) ?? []).length).toBe(TARGETS.length);
    const forge = rows(snapshot, TARGETS, T0).find((r) => r.target.id === 'forge')!;
    expect(forge.days).toHaveLength(90);
    expect(forge.days[89]).toEqual({ date: '2026-09-24', cls: 'partial' });
    expect(forge.days[88]!.cls).toBe('none');
    expect(html).toContain('title="2026-09-24: partial"');
    expect(html).toContain('title="2026-09-23: no data"');
  });

  it('says how long ago each target was checked', () => {
    expect(html).toContain('checked 3 minutes ago');
  });

  it('shows no percentages, latencies or scripts, and nothing external', () => {
    const body = html.slice(html.indexOf('</style>'));
    expect(body).not.toMatch(/\d+(\.\d+)?\s?%/);
    expect(body).not.toMatch(/\d+\s?ms\b/);
    expect(html).not.toContain('<script');
    expect(html).not.toMatch(/https?:\/\/(fonts|cdn)\./);
  });

  it('links the footer to archaic.ie and the repo', () => {
    expect(html).toContain('href="https://archaic.ie"');
    expect(html).toContain('href="https://github.com/faulknco/archaic-status"');
  });

  it('renders Unknown and empty bars with no data at all', () => {
    const empty = renderPage(emptySnapshot(), TARGETS, T0);
    expect((empty.match(/class="state Unknown"/g) ?? []).length).toBe(TARGETS.length);
    expect(empty).toContain('not yet checked');
    expect((empty.match(/<i class="none"/g) ?? []).length).toBe(TARGETS.length * 90);
  });
});

describe('ago', () => {
  it('rounds to the reader-sized unit', () => {
    expect(ago(undefined, T0)).toBe('not yet checked');
    expect(ago(T0 - 5, T0)).toBe('checked just now');
    expect(ago(T0 - 60, T0)).toBe('checked 1 minute ago');
    expect(ago(T0 - 59 * 60, T0)).toBe('checked 59 minutes ago');
    expect(ago(T0 - 3 * 3600, T0)).toBe('checked 3 hours ago');
    expect(ago(T0 - 3 * 86_400, T0)).toBe('checked 3 days ago');
  });
});
