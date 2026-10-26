# Desk UI migration shell (`app/`)

Vue 3 + Vite + Vue Router + Pinia + TypeScript placeholder shell
served under `/app/` (Refs #291, ADR-0003).

- Build: `npm ci && npm run build` (static `dist/`, Vite `base: '/app/'`)
- Test: `npm test` (Vitest: router, session store, shared client, banner)
- Lint: `npm run lint`
- Serve: Nginx `location /app/` with `try_files $uri $uri/ /app/index.html;`

Design is the single source of truth in `docs/architecture/hld.md`
§11 and `docs/architecture/lld.md` §11; requirements in
`docs/requirements/mvp-requirements.md` §7; done-conditions in
`docs/product/acceptance-criteria.md` §10; guard mapping in
`docs/testing/traceability-matrix.md` §3. This README repeats no
design prose: see those sections.
