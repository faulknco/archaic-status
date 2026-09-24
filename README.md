# Archaic Status

A public status page for Archaic's surfaces at https://status.archaic.ie. One Cloudflare Worker, one KV key, no database, no keys, no JavaScript on the page.

Every five minutes a cron trigger probes each surface (GET, 10 s timeout, redirects not followed; 2xx or 3xx counts as up) and folds the result into a single KV document: the latest probe per target, a ring of the last 288 probes (24 h), and a per-day roll-up of checks and failures for the last 90 days. The page is rendered from that document on request and edge-cached for a minute.

Uptime Kuma on the Mac Mini stays the private alerting source; this page is independent of it, so it keeps working when the Mini does not.

## Surfaces

| Target | Probe |
|---|---|
| Archaic | https://archaic.ie/ |
| PlanningWatch | https://planningwatch.ie/health/ |
| Planning Pulse | https://planningwatch.ie/trends/ |
| salaries.ie | https://salaries.ie/ |
| RoleUp | https://roleup.ie/ |
| Ireland Stats MCP | https://stats.archaic.ie/health |
| Forge | https://archaic.ie/forge/ |

Edit `src/targets.ts` to change the list.

## Endpoints

| Path | Returns |
|---|---|
| `/` | The page: a state word per target (Operational, Degraded, Down, Unknown), a 90-day bar (ok, partial, down, no data) and when it was last checked. No percentages, no latencies. |
| `/status.json` | The latest probe per target plus the 90-day roll-up. |
| `/health` | `200` with the worker's own last cron run time and whether it is stale. |

## States

- **Operational**: the last six probes (30 min) all passed.
- **Degraded**: one fresh failure, or a pass after a failure inside the window.
- **Down**: the newest probe failed and so did another in the window.
- **Unknown**: no probes yet, or the newest probe is more than 20 minutes old (the cron has stopped).

Day colours: **down** when at least half the day's probes failed, **partial** when any did, **ok** otherwise, **no data** when nothing ran.

## Run locally

```bash
npm install
npm test                 # vitest, no network
npm run typecheck
npm run dev              # wrangler dev on :8787 with a local KV
curl "http://localhost:8787/__scheduled?cron=*/5+*+*+*+*"   # fire one cron run
```

## Deploy

CI runs typecheck, tests and a `wrangler deploy --dry-run` only. Deploys happen from the laptop with wrangler's OAuth login:

```bash
npx wrangler deploy
```

The KV namespace (`STATUS_KV`, id in `wrangler.jsonc`) and the custom domain `status.archaic.ie` are declared in `wrangler.jsonc`; wrangler creates the DNS record and certificate on first deploy. To seed KV right after a fresh deploy instead of waiting for the first cron tick:

```bash
npx wrangler dev --remote --test-scheduled &
curl "http://localhost:8787/__scheduled?cron=*/5+*+*+*+*"
```

## Licence

MIT.
