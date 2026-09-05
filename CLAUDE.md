# DenisSavisko.github.io — project context

GitHub Pages repo behind `mymaingoals.app`. Mostly static marketing/legal pages at the
root (`index.html`, `privacy-policy.html`, `support.html`, `.well-known/apple-app-site-association`
for the `/verify/*` Universal Link, `404.html` as the not-installed fallback for that link) —
**those are untouched and low-risk**; the active development is the web app.

## The web app: `webapp-src/` → deployed to `/webapp/`

A companion client for the **MyMainGoals iOS app** (separate repo, `MyMainGoals`) — same
goal-tracking-with-a-financial-stake product, same backend, built to track iOS feature
parity as closely as possible. Full architecture, feature-by-file mapping, CloudKit JS
setup steps, and known browser quirks/gotchas: **`webapp-src/README.md`** — read that before
making non-trivial changes here, it's the living doc. `WEB_PLAN.md` in the `MyMainGoals`
repo has the original hosting/CI/URL-structure decisions (still accurate) but is otherwise
superseded by that README. The one feature planned but not yet built — ads-driven stake
release/verification-bypass — has its own plan doc, `webapp-src/ADS_RELEASE_PLAN.md`; read
that fresh before starting on it.

Quick orientation:
- **Stack**: React + Konsta UI (`theme="ios"`) + Tailwind CSS v4, Vite. No router — one page
  (`App.tsx`), tabs are local state, `#verify/<token>` read straight from the URL hash.
- **Data**: CloudKit JS talks directly to the same private CloudKit database the iOS app
  syncs to (via SwiftData's automatic mirroring) — no backend of ours in that path at all.
- **Backend**: the same Supabase project the iOS app uses, for the two things CloudKit can't
  do — Stripe staking (`create-hold`/`release-hold` Edge Functions, defined in the
  `MyMainGoals` repo's `supabase/functions/`) and friend verification (`task_verifications`
  table + RPCs, token-keyed, no auth/ownership check server-side at all).
- **Build/deploy**: `cd webapp-src && npm run build` outputs to `../webapp/`. Push to `main`
  triggers the GitHub Actions workflow (`.github/workflows/`) that builds and deploys the
  whole site via `actions/deploy-pages`. Check with `gh run list -R DenisSavisko/DenisSavisko.github.io --limit 1`.

## Before committing a webapp-src change

Always `npx tsc --noEmit && npm run build` from `webapp-src/` first — this is a plain Vite
build with no CI type-check gate, so a broken build only surfaces after deploy otherwise.
There's no browser tooling in this environment: UI verification (does it actually render/
work on an iPhone) has to go through the user, not a screenshot loop.

## Gotchas already hit once (see webapp-src/README.md's "iOS Safari quirks" section for detail)

- Konsta's `<App>`/`min-h-screen` vs iOS Safari's `100vh` (phantom scroll) — fixed via
  `.k-app { min-height: 100dvh }` in `index.css`, deliberately *not* `overflow: hidden` on
  `html`/`body` (that breaks native pull-to-refresh).
- Konsta's `<Glass>` iOS hover-highlight can pile up overlapping overlays under very fast
  repeated taps — disable with `highlight={false}` rather than fighting it with transitions.
- A Tailwind class glued directly against a template-literal `${...}` with no space gets
  silently dropped by the source scanner — always leave a space, and verify by grepping the
  built CSS, not just visually.
- `supabase.functions.invoke()` (Edge Functions) needs CORS added by hand — unlike
  `supabase.rpc()`, which has it by default. See `supabase/functions/_shared/cors.ts` in the
  `MyMainGoals` repo.
- CloudKit JS: the real API is `saveRecords`/`deleteRecords` (plural, batch), not
  `saveRecord`/`deleteRecord`. Every call needs an explicit `zoneID` (`CORE_DATA_ZONE_ID` in
  `cloudkitConfig.ts`) — an omitted one silently targets the empty default zone instead of
  the Core Data/SwiftData custom zone, and looks exactly like "there's no data."
