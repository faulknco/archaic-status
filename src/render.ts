import { classify, classifyDay, type DayClass, type State } from './classify';
import { dayKeys, type Snapshot } from './store';
import type { Target } from './targets';

export const REPO_URL = 'https://github.com/faulknco/archaic-status';

const esc = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** "checked 3 minutes ago" without numbers finer than the reader needs. */
export function ago(checkedAt: number | undefined, nowSeconds: number): string {
  if (!checkedAt) return 'not yet checked';
  const s = Math.max(0, nowSeconds - checkedAt);
  if (s < 60) return 'checked just now';
  const m = Math.floor(s / 60);
  if (m < 90) return `checked ${m} minute${m === 1 ? '' : 's'} ago`;
  const h = Math.round(m / 60);
  if (h < 36) return `checked ${h} hours ago`;
  return `checked ${Math.round(h / 24)} days ago`;
}

const DAY_WORD: Record<DayClass, string> = { ok: 'ok', partial: 'partial', down: 'down', none: 'no data' };

export type Row = { target: Target; state: State; checkedAt: number | undefined; days: { date: string; cls: DayClass }[] };

export function rows(snapshot: Snapshot, targets: readonly Target[], nowSeconds: number): Row[] {
  const keys = dayKeys(nowSeconds);
  return targets.map((target) => ({
    target,
    state: classify(snapshot.history[target.id], nowSeconds),
    checkedAt: snapshot.latest[target.id]?.checked_at,
    days: keys.map((date) => ({ date, cls: classifyDay(snapshot.daily[target.id]?.[date]) })),
  }));
}

const CSS = `
*{margin:0;padding:0;box-sizing:border-box}
:root{color-scheme:dark;--ground:oklch(12.21% 0 0);--panel:oklch(14.48% 0 0);--panel-border:oklch(19.57% 0 0);--rule:oklch(16.84% 0 0);
--text-footer:oklch(25.2% 0 0);--text-faint:oklch(32.11% 0 0);--text-caption:oklch(40.91% 0 0);--text:oklch(51.73% 0 0);--text-hover:oklch(62.68% 0 0);--bone:oklch(91.87% 0.0166 91.6);
--ok:oklch(66% 0.09 155);--partial:oklch(74% 0.11 80);--down:oklch(58% 0.15 25);--none:oklch(19.57% 0 0);--unknown:oklch(34.85% 0 0);
--font-display:Cinzel,Georgia,'Times New Roman',serif;--font-body:'Space Grotesk',system-ui,-apple-system,'Segoe UI',sans-serif}
html,body{background:var(--ground);color:var(--text);font-family:var(--font-body);-webkit-font-smoothing:antialiased}
.wrap{max-width:720px;margin:0 auto;padding:72px 24px 96px}
.eyebrow{font-size:10px;letter-spacing:2px;text-transform:uppercase;color:var(--text-caption);margin-bottom:24px}
.eyebrow a{color:inherit;text-decoration:none;border:0}
h1{font-family:var(--font-display);text-transform:uppercase;font-weight:400;font-size:clamp(22px,3vw,30px);letter-spacing:3px;color:var(--bone);margin-bottom:12px}
.lede{font-size:14px;line-height:1.8;margin-bottom:48px}
a{color:var(--text-hover);text-decoration:none;border-bottom:1px solid oklch(32.11% 0 0)}a:hover{color:var(--bone)}
a:focus-visible{outline:1px solid var(--text-hover);outline-offset:4px}
ul{list-style:none}
li{padding:22px 0;border-top:1px solid var(--rule)}li:last-child{border-bottom:1px solid var(--rule)}
.head{display:flex;justify-content:space-between;align-items:baseline;gap:16px;margin-bottom:12px}
.name{font-size:14px;color:var(--bone)}.name a{color:inherit;border-color:var(--panel-border)}.name a:hover{border-color:var(--text-caption)}
.state{font-size:11px;letter-spacing:1.5px;text-transform:uppercase;display:inline-flex;align-items:center;gap:8px;white-space:nowrap}
.state::before{content:"";width:7px;height:7px;border-radius:50%;background:var(--unknown)}
.state.Operational{color:var(--ok)}.state.Operational::before{background:var(--ok)}
.state.Degraded{color:var(--partial)}.state.Degraded::before{background:var(--partial)}
.state.Down{color:var(--down)}.state.Down::before{background:var(--down)}
.state.Unknown{color:var(--text-caption)}
.bar{display:flex;gap:2px;height:22px}
.bar i{flex:1 1 0;min-width:0;border-radius:1px;background:var(--none)}
.bar i.ok{background:var(--ok)}.bar i.partial{background:var(--partial)}.bar i.down{background:var(--down)}
.meta{display:flex;justify-content:space-between;font-size:10px;letter-spacing:1px;text-transform:uppercase;color:var(--text-faint);margin-top:8px}
.legend{display:flex;flex-wrap:wrap;gap:6px 18px;margin-top:28px;font-size:10px;letter-spacing:1px;text-transform:uppercase;color:var(--text-faint)}
.legend span{display:inline-flex;align-items:center;gap:6px}.legend span::before{content:"";width:9px;height:9px;border-radius:1px;background:var(--none)}
.legend .ok::before{background:var(--ok)}.legend .partial::before{background:var(--partial)}.legend .down::before{background:var(--down)}
footer{margin-top:72px;font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:var(--text-footer)}
footer a{color:var(--text-caption);border-color:var(--rule)}footer a:hover{color:var(--bone)}
footer span{margin:0 8px}
@media (max-width:480px){.wrap{padding:48px 18px 72px}.head{flex-direction:column;gap:6px}.bar{gap:1px;height:18px}}
`;

export function renderPage(snapshot: Snapshot, targets: readonly Target[], nowSeconds: number): string {
  const items = rows(snapshot, targets, nowSeconds)
    .map(
      (r) => `<li>
<div class="head"><span class="name"><a href="${esc(r.target.url)}" rel="noopener">${esc(r.target.name)}</a></span><span class="state ${r.state}">${r.state}</span></div>
<div class="bar" role="img" aria-label="${esc(r.target.name)}: last 90 days">${r.days.map((d) => `<i class="${d.cls}" title="${d.date}: ${DAY_WORD[d.cls]}"></i>`).join('')}</div>
<div class="meta"><span>90 days ago</span><span>${esc(ago(r.checkedAt, nowSeconds))}</span><span>today</span></div>
</li>`,
    )
    .join('\n');
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Status — Archaic</title>
<meta name="description" content="Live checks of Archaic's public surfaces." />
<meta name="robots" content="noindex" />
<link rel="icon" href="data:," />
<style>${CSS}</style>
</head>
<body>
<div class="wrap">
<p class="eyebrow"><a href="https://archaic.ie">Archaic</a></p>
<h1>Status</h1>
<p class="lede">Live checks of the studio's public surfaces.</p>
<ul>
${items}
</ul>
<div class="legend"><span class="ok">ok</span><span class="partial">partial</span><span class="down">down</span><span class="none">no data</span></div>
<footer><a href="https://archaic.ie">archaic.ie</a><span>·</span><a href="${REPO_URL}">source</a><span>·</span>Checked every five minutes</footer>
</div>
</body>
</html>
`;
}
