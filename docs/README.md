# Documents

Status: active (index). Single entry point for every document type in
this project: each row points at its real path with status `active` or
`stub (not needed yet)` plus the owning role. Every file under `docs/`
is in one of the tables — no orphans, no dead links. All content is
English.

The product scope, the PRD, and the MVP requirements exist (their rows
are marked active below). The stack direction is decided — ADR-0001
(monorepo polyglot) was accepted 2026-10-23 — and the Architecture and
Technical rows below are active outlines. The remaining spec groups
below stay stubs. They flip to `active` through
the normal spec-gated flow (see the `spec-gate` skill) as the owner
scopes further slices. Do not invent hotel product requirements to
fill them early.

Paths are relative to `docs/`, except the two repo-root files in the
Development table, which use a `../` prefix.

## Spec ownership (role -> groups)

| Role | Groups |
|---|---|
| `product-owner` | Business, Product, Project, Support (`sla-support-policy.md` only) |
| `business-analyst` | Requirements |
| `architect` (as solution architect) | Architecture, Technical |
| `dev` | Development (implementer, not a spec role — see the note there) |
| `qa-lead` | Testing |
| `release-manager` | DevOps, Operations, Release |
| `content` | Support (`user-guide.md` and `faq-troubleshooting.md` only) |
| `ai-engineer` | Agentic template (harness docs; implementer, not a spec role — see the note there) |
| `spec-reviewer` | none (read-only gate over all groups) |

## Business

| Type | Path | Status | Owner | Purpose |
|---|---|---|---|---|
| BRD | `business/brd.md` | stub (not needed yet) | `product-owner` | business requirements: goals, stakeholders, scope boundaries |
| Business case | `business/business-case.md` | stub (not needed yet) | `product-owner` | investment rationale: costs, benefits, options |
| Market research | `business/market-research.md` | stub (not needed yet) | `product-owner` | market and competitor notes feeding scope decisions |
| KPI success metrics | `business/kpi-success-metrics.md` | stub (not needed yet) | `product-owner` | success metrics and targets for the product |

## Product

| Type | Path | Status | Owner | Purpose |
|---|---|---|---|---|
| MVP scope | `product/mvp-scope.md` | active | `product-owner` | MVP scope for the small-hotel PMS (Closes #9) |
| PRD | `product/prd.md` | active | `product-owner` | product requirements document for the small-hotel PMS (Closes #29) |
| Roadmap | `product/roadmap.md` | active | `product-owner` | sequenced direction across milestones (Closes #30) |
| Personas | `product/personas.md` | active | `product-owner` | user archetypes the product serves (Closes #30) |
| User stories | `product/user-stories.md` | active | `product-owner` | stories expressing user needs per slice (Closes #30) |
| Acceptance criteria | `product/acceptance-criteria.md` | active | `product-owner` | done-conditions per slice (Closes #59) |
| Phase glossary | `product/phase-glossary.md` | active | `product-owner` | project phase definitions with entry/exit evidence (Closes #226) |
| Scope | `product/scope.md` | stub (not needed yet) | `product-owner` | in/out scope statement for the product (`product/mvp-scope.md` is the operative scope statement) |

## Requirements

| Type | Path | Status | Owner | Purpose |
|---|---|---|---|---|
| MVP requirements | `requirements/mvp-requirements.md` | active | `business-analyst` | numbered FRs, measurable NFRs, per-hotel workflow customisation, traceability (Closes #10; §8 Refs #338) |
| Domain consistency audit | `requirements/domain-consistency-audit.md` | active | `business-analyst` | cross-doc audit: scope↔PRD↔stories↔FRs/NFRs, gaps, contradictions, deduped questions, terminology (Closes #41) |
| Behaviour sequence diagrams | `requirements/sequence-diagrams.md` | active | `business-analyst` | time-ordered booking, check-in/out, folio and housekeeping flows with FR and FR-CUS mapping (Closes #43) |
| Functional requirements | `requirements/functional-requirements.md` | stub (not needed yet) | `business-analyst` | numbered functional requirements with one guard each |
| Non-functional requirements | `requirements/non-functional-requirements.md` | stub (not needed yet) | `business-analyst` | measurable NFRs (performance, reliability, usability) |
| SRD | `requirements/srd.md` | stub (not needed yet) | `business-analyst` | stakeholder requirements definition |
| SRS | `requirements/srs.md` | stub (not needed yet) | `business-analyst` | software requirements specification |
| Business rules | `requirements/business-rules.md` | active | `business-analyst` | domain policies constraining behaviour (Closes #58) |
| Use cases | `requirements/use-cases.md` | active | `business-analyst` | actor-goal flows through the system (Closes #58) |
| Data dictionary | `requirements/data-dictionary.md` | active | `business-analyst` | shared definitions of data entities and fields (Closes #58) |
| Integration contract needs | `requirements/integration-contract-needs.md` | active | `business-analyst` | requirements-side input to module contracts: operations, payloads, sync/async, errors, config (Closes #96) |

## Architecture

| Type | Path | Status | Owner | Purpose |
|---|---|---|---|---|
| HLD | `architecture/hld.md` | active | `architect` | high-level design: subsystems and their responsibilities (Closes #11) |
| LLD | `architecture/lld.md` | active | `architect` | low-level design: modules, interfaces, data flow (Closes #97) |
| System architecture | `architecture/system-architecture.md` | active | `architect` | overall system structure and deployment view (Closes #11) |
| ERD | `architecture/erd.md` | active | `architect` | entity-relationship model of the domain data (Closes #11) |
| Sequence diagrams | `requirements/sequence-diagrams.md` (see Requirements) | stub (not needed yet) | `architect` | behaviour depiction lives with requirements per #43; no separate architecture diagram |
| State machine | `architecture/state-machine.md` | active | `architect` | lifecycle states and transitions of core entities (Closes #11) |
| ADR template | `architecture/decisions/adr-0001-template.md` | stub (not needed yet) | `architect` | decision-record template (the decisions directory holds ADRs) |
| ADR-0001 monorepo polyglot | `architecture/decisions/adr-0001-monorepo-polyglot.md` | active | `architect` | accepted monorepo with polyglot modules (Closes #11; accepted 2026-10-23, Closes #85) |
| ADR-0002 cross-stack layering | `architecture/decisions/adr-0002-cross-stack-layering.md` | active | `architect` | stack-idiomatic layering differences are intentional (Closes #181; accepted 2026-10-24, Closes #188) |
| ADR-0003 desk UI framework | `architecture/decisions/adr-0003-desk-ui-vue-vite.md` | active | `architect` | desk UI migrates to Vue 3 + Vite CSR static build served by Nginx (Refs #285; accepted 2026-10-25) |
| Candidate architectures | `architecture/candidate-architectures.md` | active | `architect` | candidate structures, customisation, strategies, trade-offs, recommendation (Closes #67) |
| Contract readiness | `architecture/contract-readiness.md` | active | `architect` | walking-skeleton contract/file checklist with traces, stub boundary, CI gate, open questions (Closes #108) |
| C4 containers | `architecture/c4-containers.md` | active | `architect` | container + component diagrams with per-edge sources (Closes #193) |
| Event flow | `architecture/event-flow.md` | active | `architect` | outbox-to-reporting data flow with flagged gaps (Closes #193) |

### Service design (as-built, per service)

| Type | Path | Status | Owner | Purpose |
|---|---|---|---|---|
| Reservations design | `architecture/services/reservations.md` | active | `architect` | as-built pattern/layers, verified flowcharts, deps, error mapping, operations (Closes #181) |
| Stay design | `architecture/services/stay.md` | active | `architect` | as-built pattern/layers, verified flowcharts, deps, error mapping, operations (Closes #181) |
| Rooms design | `architecture/services/rooms.md` | active | `architect` | as-built pattern/layers, verified flowcharts, deps, error mapping, operations (Closes #181) |
| Rates design | `architecture/services/rates.md` | active | `architect` | as-built pattern/layers, verified flowcharts, deps, error mapping, operations (Closes #181) |
| Guests design | `architecture/services/guests.md` | active | `architect` | as-built pattern/layers, verified flowcharts, deps, error mapping, operations (Closes #181) |
| Billing design | `architecture/services/billing.md` | active | `architect` | as-built pattern/layers, verified flowcharts, deps, error mapping, operations (Closes #181) |
| Reporting design | `architecture/services/reporting.md` | active | `architect` | as-built pattern/layers, verified flowcharts, deps, error mapping, operations (Closes #181) |
| Admin design | `architecture/services/admin.md` | active | `architect` | as-built pattern/layers, verified flowcharts, deps, error mapping, operations (Closes #181) |

## Technical

| Type | Path | Status | Owner | Purpose |
|---|---|---|---|---|
| API spec | `technical/api-spec.md` | active | `architect` | contracts for service interfaces and endpoints (outline, Closes #11) |
| Schema | `technical/schema.md` | active | `architect` | data schemas and validation rules (Closes #97) |
| Integration | `technical/integration.md` | active | `architect` | third-party and cross-system integration contracts (Closes #97) |
| Error handling | `technical/error-handling.md` | active | `architect` | error taxonomy and handling conventions (outline, Closes #11) |
| Security threat model | `technical/security-threat-model.md` | active | `architect` | threats, mitigations, and trust boundaries (Closes #97) |

## Development

Note: `dev` is the implementer, not a spec role — it builds from
approved specs and owns no spec group. The rows below are working
docs and plans, not gated specs.

| Type | Path | Status | Owner | Purpose |
|---|---|---|---|---|
| Repository README | `../README.md` | active | `dev` | repo-root entry point: what this repo is and where to start |
| Contributing guide | `../CONTRIBUTING.md` | stub (not needed yet) | `dev` | repo-root contribution workflow |
| Setup | `development/setup.md` | stub (not needed yet) | `dev` | local environment setup steps |
| Coding standards | `development/coding-standards.md` | stub (not needed yet) | `dev` | code style and review conventions |
| Implementation plan | `development/implementation-plan.md` | stub (not needed yet) | `dev` | build sequencing per approved scope |
| Task breakdown | `development/task-breakdown.md` | stub (not needed yet) | `dev` | work items derived from the plan |
| Desk-loop API spec | `../contracts/openapi.yaml` | active | `dev` | curated desk-loop OpenAPI source of truth, 14 ops (Closes #228) |
| Desk-loop API docs | `../frontend/docs/index.html` | active | `dev` | Swagger UI served at `/docs` on a local stack (Closes #228) |

## Testing

| Type | Path | Status | Owner | Purpose |
|---|---|---|---|---|
| Test strategy | `testing/test-strategy.md` | active | `qa-lead` | testing approach, levels, and entry/exit criteria (Closes #62) |
| Traceability matrix | `testing/traceability-matrix.md` | active | `qa-lead` | FR/NFR-to-guard map (every item keeps at least one guard) (Closes #62) |
| Test report | `testing/test-report.md` | active | `qa-lead` | consolidated full-MVP results with pass evidence per cell (Closes #214) |
| Phase 6 QA plan | `testing/phase-6-qa-plan.md` | active | `qa-lead` | scoped independent-QA pass plan: entry, activities, bug flow, exit (Closes #264) |
| A1 desk-loop run log | `testing/phase-6-qa-a1-run-log.md` | active | `qa-lead` | scripted live-stack desk-loop record: per-step observed-vs-expected, screen surfaces, admin reads, evidence, defects (Closes #267) |
| A1-lite Vue desk-loop run log | `testing/phase-6-qa-a1-lite-run-log.md` | active | `qa-lead` | post-migration desk-loop record through the Vue SPA: same seed discipline as A1, `/app/*` surfaces + legacy redirects, admin reads, evidence, clean bill (Closes #316) |
| A2 PERF bounds run log | `testing/phase-6-qa-a2-run-log.md` | active | `qa-lead` | PERF bounds run record: hardware decision, variant numbers with environment labels, CI job/run ids, regression comparison, defects (Closes #268) |
| A3 exploratory run log | `testing/phase-6-qa-a3-run-log.md` | active | `qa-lead` | exploratory pass per FE screen: time-boxed front-desk sessions per screen + scenario with outcomes, defects filed (Closes #269) |
| A3 Vue exploratory run log | `testing/phase-6-qa-a3-vue-run-log.md` | active | `qa-lead` | exploratory pass per Vue SPA screen: time-boxed live sessions per screen + scenario with outcomes, defects filed (Closes #317) |
| A4 full-CI regression run log | `testing/phase-6-qa-a4-run-log.md` | active | `qa-lead` | full CI regression record on the QA build: build SHA, CI run/job ids, per-stack verdicts, all-green (Closes #270) |
| Browser E2E plan | `testing/browser-e2e-plan.md` | active | `qa-lead` | Playwright browser-E2E spec for the Vue desk flows: flows, browsers, CI placement, install/caching, pass criteria incl. MIME smoke (Closes #334) |

## DevOps / Operations / Release

| Type | Path | Status | Owner | Purpose |
|---|---|---|---|---|
| CI/CD | `devops/ci-cd.md` | active | `release-manager` | pipeline stages, checks, and merge gates (Closes #133) |
| Deployment | `devops/deployment.md` | active | `release-manager` | deployment targets and procedures (Closes #63) |
| Local dev setup | `devops/local-dev-setup.md` | active | `release-manager` | dev-lab setup + admin secret management (Closes #283) |
| Environment | `devops/environment.md` | stub (not needed yet) | `release-manager` | environment inventory and configuration |
| Runbook | `operations/runbook.md` | active | `release-manager` | step-by-step operating procedures, fresh at merge time (Closes #63) |
| Monitoring and alerting | `operations/monitoring-alerting.md` | stub (not needed yet) | `release-manager` | signals, dashboards, and alert routing — stub stays until the first exporter lands (ADR-0001 Prometheus + Grafana) |
| Backup and DR | `operations/backup-dr.md` | active | `release-manager` | backup, restore, and disaster-recovery plan (Closes #63) |
| Pilot exit checklist | `operations/pilot-exit-checklist.md` | active | `release-manager` | per-sale runbook walkthrough record and pilot exit checklist (Closes #153) |
| POC demo checklist | `operations/demo-poc-checklist.md` | active | `release-manager` | owner-runnable demo pass/fail checklist with sign-off (Closes #185) |
| Incident response | `operations/incident-response.md` | stub (not needed yet) | `release-manager` | incident roles, severity, and response flow |
| Release notes | `release/release-notes.md` | stub (not needed yet) | `release-manager` | per-release change entries |
| Rollback | `release/rollback.md` | stub (not needed yet) | `release-manager` | rollback procedure per release |

## Project

| Type | Path | Status | Owner | Purpose |
|---|---|---|---|---|
| Plan | `project/plan.md` | active | `product-owner` | milestones from specs to pilot (Closes #63) |
| Risk register | `project/risk-register.md` | active | `product-owner` | live risk list (Closes #63) |
| Decision log | `project/decision-log.md` | active | `product-owner` | decision list pointing at ADRs (Closes #63) |
| Meeting notes | `project/meeting-notes.md` | stub (not needed yet) | `product-owner` | dated notes of owner decisions |
| Issue conventions | `project/issue-conventions.md` | active | `product-owner` | title+label convention for issues and PRs |
| Milestone conventions | `project/milestone-conventions.md` | active | `product-owner` | milestone naming, lifecycle, and bookkeeping rules (Closes #224) |

## User and Support

| Type | Path | Status | Owner | Purpose |
|---|---|---|---|---|
| User guide | `support/user-guide.md` | stub (not needed yet) | `content` | end-user instructions for the product |
| FAQ and troubleshooting | `support/faq-troubleshooting.md` | stub (not needed yet) | `content` | frequent questions and fixes |
| SLA and support policy | `support/sla-support-policy.md` | stub (not needed yet) | `product-owner` | support scope, response targets, and policy |

## Agentic template (reusable starter)

| Path | Purpose |
|---|---|
| `agentic-template/README.md` | template overview, audience, adoption checklist |
| `agentic-template/roles.md` | generalized role table + role file skeletons |
| `agentic-template/gate.md` | T0–T4 gate + worked example |
| `agentic-template/conventions.md` | artefact/commit/session naming, language, merge, verdict mechanics |
| `agentic-template/bootstrap.md` | step-by-step: new repo to first guarded PR |
| `agentic-template/extraction-plan.md` | options for a standalone template repo + open decision |

Harness docs live in this group (`agentic-template/`) and in the
harness paths themselves (`.opencode/`, `script/`, `template/`):
`ai-engineer` owns them and keeps the template and live copies in
sync in the same change.

## Standalone template (shipped, Closes #16)

| Path | Purpose |
|---|---|
| `template/README.md` | what the template is, prerequisites, quick start, payload table |
| `template/ONBOARDING.md` | new-project runbook: install, labels, AO registration, reviewer mode, guardrails, checklist |
| `template/AGENTS.md` | agent guide with `{{PROJECT_NAME}}`, `{{REPO_SLUG}}`, `{{DEFAULT_BRANCH}}`, `{{DOMAIN}}` placeholders, no project-specific rules |
| `template/.opencode/` | 12 role files, 8 skills (`project-verify` replaces `hotel-verify`; plus `go-module`, `node-module`, `spring-module`), commands, `opencode.jsonc` deny rules, `project-guard.ts` |
| `template/.github/` | issue form, blank-issue config, PR template |
| `template/docs/` | document index and taxonomy, role rules, conventions, starter group (extraction plan records the `template/` + AO-assets extraction) |
| `template/config/ao-project.jsonc` | full AO project config template (pool rules, harness/model examples, reviewers, intake, `autoReview`, `workersRequestReview`); applied with `--config-json` |
| `template/cues/` | 18 project-scoped rule cues (`name`/`date`/`supersedes` front-matter; newest cue wins) |
| `template/script/` | sanctioned wrappers (including `harness-conventions-check.sh`) plus `install-template.sh` (copy without overwrite unless `--force`, placeholder substitution, `--dry-run`, idempotent, refuses non-git targets) and `install-cues.sh` (`--project <id> [--dry-run]`, idempotent, never duplicates) |

The `agentic-template/` starter above stays as the in-tree design
record; `template/` is the installable artefact (its
`agentic-template/extraction-plan.md` records the extraction).

## Other existing docs

| Path | Purpose |
|---|---|
| `ao-rules.md` | normative AO role rules (canonical roles, signatures, reviewer-must-differ) |
