# ADR-0003: Desk UI migrates to Vue 3 + Vite (CSR-only, static build served by Nginx)

Status: accepted (owner acceptance 2026-10-25, recorded on #285 as
issuecomment-6396779605, with two mandatory corrections carried in
this file). Owned by `architect`.

Date: 2026-10-25 (proposed); accepted 2026-10-25.

## Context

Owner decision (chat 2026-10-26, recorded in #285): the current
static-HTML desk UI (`frontend/*.html`) is POC-grade only and cannot
carry the MVP — evaluate a professional framework with CSR (Vue,
Next.js, or alternatives) and migrate. Current state, as built:

- 7 static pages, no build step, one inline script block per page:
  `frontend/desk.html` (255 lines), `book.html` (477),
  `stay.html` (869), `folio.html` (419), `print.html` (599),
  `admin.html` (210), `index.html` (74).
- Served as static files through the existing proxy:
  `deploy/nginx/nginx.conf` — `location / { root
  /usr/share/nginx/html; }` with the comment "Static desk entry
  (frontend/, no SSR runtime)". Confirmed in specs:
  `docs/architecture/lld.md` records `frontend/ static SPA
  (framework free choice; served by Nginx, no SSR runtime)`;
  `docs/architecture/system-architecture.md` budgets "Nginx (entry +
  static frontend) | ~32 MB | Static SPA, no SSR runtime".
- Auth: per-page in-memory `var token`
  (`frontend/desk.html:83`, `book.html:112`, `frontend/admin.html:69`),
  sent as `Authorization: Bearer <token>`, 401 to local sign-out
  ("Session expired. Sign in again."). No refresh tokens, no cookies,
  no shared session module — each page re-implements sign-in.
- Catalogue/i18n: `frontend/messages/en.json` holds 488 keys; 196
  `data-msg` bindings across the pages; `frontend/messages.js`
  exposes `DeskMessages.msg(key, params, fallback)` with `{param}`
  substitution. Behaviour switches on envelope codes, never on
  resolved wording. Backend catalogues live per service
  (`services/*/messages*`); there is no `contracts/messages/` tree
  (lld.md contracts section).
- Print: `frontend/print.html:8` `@media print` CSS isolates
  `#print-section > .print-document.active`; print is CSS-driven, no
  JS PDF generation.
- CI: `.github/workflows/ci.yml` runs a Node 22 + `npm ci` matrix
  per backend service; the frontend appears only as a
  `frontend/docs/**` path filter. `script/openapi-route-check.sh`
  enforces `frontend/docs/openapi.yaml` byte-identical to
  `contracts/openapi.yaml` — any migration must keep that mirror
  (or its check) intact.

Fixed constraints for the evaluation (from #285, non-negotiable):
LAN-only offline-first operation with no CDN; static-export or
single-container serving through the existing proxy; Bearer session
handling reuse; catalogue/i18n reuse (`messages/en.json`); form-heavy
desk flows; print CSS preserved; build/test/CI integration; team
cost. Backend contracts stay source of truth (no contract changes to
suit the framework); no native/mobile.

## Options considered

Three options scored against nine weighted criteria (weights sum to
100, scores 1-5). The two decisive criteria are named first:
form-heavy desk + component library (w=20) and team cost / hiring +
learnability (w=15). Payload size is deliberately not a criterion:
desk terminals sit on the hotel LAN behind Nginx, so first-load
deltas in the tens of KB do not move NFR-PERF-1 (named views within
2 s) against LAN timings, and all three options ship vendored static
bundles with no runtime CDN. Earlier uncited client-runtime figures
were withdrawn for this reason; if numbers are wanted, the scaffold
step records measured `dist/` totals per screen from the actual
build — measured, not cited.

| # | Criterion (source) | W | A — Vue 3 + Vite (CSR, static `dist/`) | B — Next.js `output: export` (CSR) | C — SvelteKit + adapter-static |
|---|---|---|---|---|---|
| 1 | Form-heavy desk flows + component library (DECISIVE) | 20 | **5** — `stay.html` (27 controls), `book.html` (20), `folio.html` (14), `admin.html` (15) map 1:1 onto SFCs; `v-model` + per-field validation is the smallest rewrite distance. PrimeVue / Element Plus / Vuetify give dense data-entry components (tables, dialogs, date pickers, validation states) with built-in keyboard support and a11y attributes out of the box. | 4 — MUI / shadcn are excellent, but every form is rewritten into controlled-component + hook-form idioms: larger rewrite distance for identical behaviour. | 3 — Two-way bindings are concise, but the Svelte enterprise-form ecosystem (Skeleton, Flowbite-Svelte) is thinner than PrimeVue/MUI for dense receptionist forms; more custom component work. |
| 2 | Team cost: hiring + learnability (DECISIVE) | 15 | **4** — No in-repo framework exposure for any option (see below). Vue keeps the lead on market facts only: the largest hiring pool for small-team CRUD work, and SFCs are incremental HTML+JS knowledge on top of the TypeScript the team already ships daily. | 3 — No in-repo React; Next adds SSR concepts (routing, server components, caching) the team must learn and then deliberately not use in export mode. | 3 — Smallest framework to learn, but the smallest hiring pool; every future contributor learns it from scratch. |
| 3 | Offline-first LAN, no CDN; serve via existing proxy | 15 | **5** — `npm ci` from lockfile at build time; vendored static `dist/`; dedicated `location /app/` block (decision below). | 4 — Same static-output shape, but export-mode guards (trailing-slash, image/export restrictions) add config surface for zero runtime benefit; there is deliberately no SSR runtime here. | 5 — Same vendored static story as A. |
| 4 | Bearer session handling | 10 | **4** — One Pinia store + one `fetch` wrapper replaces the 5+ copy-pasted per-page token blocks (`desk.html:83`, `book.html:112`, `admin.html:69`); single 401 to sign-out path. Token persistence: `sessionStorage` (decision below). | 4 — Same single-client pattern. Next's server-side auth helpers (cookies, middleware) are unusable in static-export mode and must be consciously avoided. | 4 — Same single-client pattern via Svelte stores. Non-decisive: all three equal. |
| 5 | Catalogue / i18n reuse (`messages/en.json`, 488 keys; 196 `data-msg` bindings) | 10 | **5** — `en.json` imports as a module; a thin `t(key, params, fallback)` wrapper preserves `DeskMessages.msg` semantics (fallback + `{param}` substitution, `messages.js`); `data-msg` bindings become template bindings 1:1. | 4 — Same import-and-wrap works, but `next-intl` routing machinery is built for multi-locale apps and is dead weight for a single-locale LAN desk. | 4 — Same import-and-wrap (`svelte-i18n` or thin wrapper); thinner ecosystem, sufficient. |
| 6 | Accessibility + keyboard operation (receptionist speed) | 10 | **4** — PrimeVue/Vuetify ship focus management, keyboard-operable dialogs/menus/date pickers, and ARIA roles by default. Hard scaffold requirement: every desk action reachable and completable without a mouse, visible focus, logical tab order; verified by keyboard-navigation Playwright checks (characterization suite below). | 4 — MUI's a11y is equally strong. Equal to A on this axis. | 3 — Fewer component libraries with baked-in a11y; more manual ARIA/focus work. |
| 7 | Build / test / CI integration | 10 | **5** — Smallest delta: one CI job (Node 22 + `npm ci` + build + test, matching the existing Node matrix), `dist/` into the Nginx image, `openapi-route-check.sh` byte-identical mirror stays green. Vitest + Vue Test Utils; Playwright is framework-agnostic. | 3 — Heaviest toolchain (larger install, export-mode lint guards, no-SSR discipline enforced in review) for no behavioural gain. | 4 — Comparable to A; component-test ecosystem thinner than Vue's but sufficient. |
| 8 | Print CSS (print is CSS-driven: `print.html:8` `@media print` isolating `#print-section > .print-document.active`) | 5 | **5** — Print routes namespaced as `/app/print/...`: directly navigable history URLs rendering `.print-document` markup under the existing rules. Framework-agnostic. | 4 — Same, minus export-mode friction on dynamic print routes. | 5 — Same as A. |
| 9 | Network-loss / offline behaviour on LAN disconnect | 5 | **4** — All three behave identically here (no framework differentiator, hence low weight): in-flight `fetch` rejects, and the shared API client must own connectivity state — `online`/`offline` events + failed-fetch banner + safe manual retry. Explicitly **no write queueing** in Phase 1: desk actions are synchronous authoritative ops (charge, payment, check-in) and queueing risks double-charge; disconnect = clearly blocked, same as today's static pages (fetch fails to error text). Recorded as a scaffold-step requirement for all options. | 4 — Same. | 4 — Same. |

Weighted totals (criterion order): A = 100+60+75+40+50+40+50+25+20
= 460 (4.60); B = 80+45+60+40+40+40+30+20+20 = 375 (3.75); C =
60+45+75+40+40+30+40+25+20 = 375 (3.75). The decision is carried by
criteria 1 + 2 (combined weight 35): Vue leads forms+library by a
full point over both alternatives and ties-or-leads team cost.
Criterion 3 confirms all options satisfy the hard LAN/proxy
constraint; criteria 4 and 9 are recorded as equal-across-options
requirements, not differentiators.

React + plain Vite was considered and dropped without full scoring:
it matches A technically but buys nothing over A for this team while
splitting the choice into two React flavours for no reason.

### Team experience: verified from repo history, rest marked unknown

Verified (evidence, not assumption):

- The team ships TypeScript daily: `services/stay`, `rooms`,
  `guests`, `admin` each build on Node.js/TS (`typescript`, `tsx`,
  `eslint`, `typescript-eslint` in every `package.json`
  devDependencies; runtime deps are `pg` only).
- The team's main stack for money-critical logic is Java/Spring
  (Billing); Go covers Reservations/Rates/Reporting (ADR-0001
  mapping).
- **Zero FE-framework exposure exists anywhere in repo history**:
  `grep -rli "vue|react|svelte|next"` over code matches only
  vendored `frontend/docs/swagger-ui-*.js` and the
  `candidate-architectures.md` mention ("framework free choice;
  proposed: Vue or React build" — a proposal, never implemented).
  All `frontend/` commits are vanilla HTML + per-page inline
  scripts. No `package.json` exists under `frontend/`.
- Transferable-skill fact: Vue SFCs and Svelte components build
  directly on the HTML/JS/TS the team demonstrably writes; React JSX
  + hook-form idioms and Next SSR concepts do not exist in-repo.

Marked UNKNOWN (not claimed as advantage): individual contributors'
personal Vue/React experience outside this repo; hiring-market
availability beyond the general "Vue is common for small-team CRUD"
position; actual onboarding time for any option. The
decision-relevant, verifiable edge is smallest rewrite distance from
the vanilla code the team demonstrably maintains (criterion 1), not
assumed familiarity.

## Decision (accepted 2026-10-25)

Adopt **Option A**: the desk UI migrates to **Vue 3 + Vite
(CSR-only, static build served by Nginx)**, with PrimeVue component
default, history routing, and `sessionStorage` Bearer token.
Concretely:

- Single `frontend/` Vite app (Vue 3, Vue Router in history mode,
  Pinia, TypeScript, PrimeVue default with Element Plus as
  fallback; final library confirmation is a scaffold-step checkbox,
  not a new decision gate). CSR-only, static `dist/` output.
- One shared Bearer API client (connectivity state: `online` /
  `offline` events + failed-fetch banner + safe manual retry; no
  write queueing — see criterion 9) + one Pinia session store
  (`sessionStorage` token, single 401 to sign-out path, no refresh
  tokens — unchanged from today) + one `t()` catalogue wrapper over
  the 488 existing `en.json` keys (fallback + `{param}` semantics
  preserved; no `contracts/messages/` change; per-service catalogue
  boundary documented).
- Served from a dedicated nginx `location /app/` block with Vite
  `base '/app/'`; history-routing fallback **inside that block** is
  `try_files $uri $uri/ /app/index.html;` (not `/index.html`).
- Print routes namespaced as **`/app/print/...`** — directly
  navigable and bookmarkable history URLs rendering
  `.print-document` markup under the existing `@media print` rules.
- Contracts unchanged (`contracts/openapi.yaml` +
  `frontend/docs/openapi.yaml` byte-identical mirror stays green);
  `/docs` Swagger preserved.

Rejected: B — SSR-oriented toolchain weight with no usable SSR,
largest rewrite distance; C (runner-up, tied 3.75 with B) —
thinnest dense-form/a11y ecosystem and smallest hiring pool.

## Owner acceptance (2026-10-25, recorded on #285)

Source: OWNER ACCEPT comment on #285 (issuecomment-6396779605,
2026-10-25, in chat — architect direction approved in principle),
recorded answers:

- ADR-0003 direction ACCEPTED: Vue 3 + Vite, CSR-only static build
  served by Nginx.
- Mandatory correction 1 ACCEPTED: option-C total is 375 (3.75),
  not 395 — conclusion unchanged (A still leads clearly). Carried
  in this file (weighted totals above).
- Mandatory correction 2 ACCEPTED: Nginx fallback is
  `/app/index.html` (not `/index.html`) inside `location /app/`,
  and print routes are namespaced `/app/print/...`. Carried in this
  file (Decision section) and in the scaffold checklist below.
- Conditions ACCEPTED: the accepted ADR file carries the corrected
  numbers and the `/app/`-namespaced routes (this file); the
  scaffold issue includes both fixes in its acceptance criteria
  (checklist below).
- Owner homework noted separately (real team Vue/React exposure;
  optional PrimeVue book-form spike) — tracked by the owner, not
  blocking.

## Consequences

- One new CI job (Node 22 + `npm ci` + build + test, matching the
  existing Node matrix) + `dist/` packaged into the Nginx image +
  the `/app/` location block with its one `try_files` line (reviewed
  like any `deploy/` change).
- Per-page inline scripts deleted screen by screen as cutover
  lands; print route and `/docs` Swagger preserved throughout.
- `security-threat-model.md` delta recorded in the scaffold step
  (`sessionStorage` token: survives reload, dies with the tab; no
  meaningful XSS regression in the LAN-only / no-guest-sign-in
  posture per NFR-SEC-1, since injected JS reads an in-memory token
  exactly as easily).
- Follow-up migration issues (split plan below) each carry their
  own risk label and review; `risk-high`, `risk-very-high`, or a
  missing label still needs explicit owner approval before merge.

## Migration + split plan (starts ONLY after this acceptance)

Sequenced follow-ups, one worker = one small issue/PR each
(per-screen except where a layer must land first). Parallel run
throughout: the SPA is built with Vite `base '/app/'` and served
from the dedicated nginx location block; the existing static pages
stay untouched at their current paths. Staff pilots on `/app/`
while production desk work continues on the old pages. Cutover is
per screen via nginx redirects from the old `.html` path to the
matching SPA route; each cutover is independently reversible.
Rollback is proxy-only (remove the redirect / redeploy the previous
Nginx image) — the old static files remain in place until the final
decommission step, so there is no data migration in either direction
(no contract or schema change anywhere in this plan).

1. **#0 Characterization suite** — Playwright baseline over the
   CURRENT static pages before any migration code: sign-in + today
   dashboard, price-quote-then-confirm booking, check-in/move/
   check-out, charge + payment recording, print-document render,
   admin save — plus keyboard-navigation checks (every desk action
   completable without a mouse, visible focus, logical tab order).
   This suite is the regression baseline: the same assertions re-run
   against `/app/` per screen, and any divergence blocks that
   screen's cutover.
2. **Shell scaffold** — Vite + Vue + Router (history mode) + Pinia
   + PrimeVue, `/app/` location block + `try_files $uri $uri/
   /app/index.html;` (mandatory correction 2: fallback path is
   `/app/index.html`, not `/index.html`), shared Bearer client
   (connectivity state, `sessionStorage` token, single 401 path),
   session store, CI build job, `/docs` mirror intact,
   threat-model delta. Acceptance criteria must restate both owner
   corrections: corrected scoring totals (A 460/4.60, B 375/3.75, C
   375/3.75) and the `/app/`-namespaced fallback + print routes.
   Unblocks 3-9.
3. **Catalogue layer** — `en.json` import + `t()` wrapper
   (fallback + `{param}` semantics preserved); per-service
   catalogue boundary documented (no `contracts/messages/` change).
   Unblocks 4-9.
4. **Desk screen** (`desk.html` to arrivals / in-house / departures
   view).
5. **Book screen** (`book.html` to QuotePrice-then-confirm flow).
6. **Stay screen** (`stay.html` to check-in / move / check-out
   flows; largest form surface).
7. **Folio screen** (`folio.html` to charges / payments /
   day-close gate).
8. **Print route** (`print.html` to directly navigable
   `/app/print/...` URLs under the existing `@media print` rules).
9. **Admin console** (`admin.html` to users / roles / config +
   identity sessions).
10. **Decommission** — per-screen redirects land here cumulatively;
    final removal of static pages + inline scripts, refresh of the
    `lld.md` `frontend/` line and system-architecture wording.

Out of scope throughout (per #285): backend contract changes,
native/mobile, chain-scale concerns, offline write queueing.

## Owner-acceptance checklist

- [x] The owner confirms Vue 3 + Vite (CSR-only, static build) as
  the desk UI direction (2026-10-25, #285).
- [x] The owner confirms the corrected scoring totals (A 4.60, B
  3.75, C 375/3.75 corrected) with the conclusion unchanged
  (2026-10-25, #285).
- [x] The owner confirms the `/app/`-namespaced fallback
  (`/app/index.html` inside `location /app/`) and print routes
  (`/app/print/...`) (2026-10-25, #285).
- [x] On acceptance the architect flips this ADR status from
  `proposed` to `accepted` (done in this change: status `accepted`
  2026-10-25).
