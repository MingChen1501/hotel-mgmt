# Desk UI migration shell (`app/`)

Vue 3 + Vite + Vue Router + Pinia + TypeScript placeholder shell
served under `/app/` (Refs #291, ADR-0003).

- Build: `npm ci && npm run build` (static `dist/`, Vite `base: '/app/'`)
- Test: `npm test` (Vitest: router, session store, shared client, banner)
- Lint: `npm run lint`
- Serve: Nginx `location /app/` with `try_files $uri $uri/ /app/index.html;`

Design is the single source of truth in `docs/architecture/hld.md`
[section 11](../docs/architecture/hld.md) and `docs/architecture/lld.md` [section 11](../docs/architecture/lld.md); requirements in
`docs/requirements/mvp-requirements.md` [section 7](../docs/requirements/mvp-requirements.md); done-conditions in
`docs/product/acceptance-criteria.md` [section 10](../docs/product/acceptance-criteria.md); guard mapping in
`docs/testing/traceability-matrix.md` [section 3](../docs/testing/traceability-matrix.md). This README repeats no
design prose: see those sections.
