# Documents

Status: active (index). Single entry point for every document type in
this project: each row points at its real path with status `active` or
`stub (not needed yet)` plus the owning role. Every file under `docs/`
is in one of the tables — no orphans, no dead links. All content is
English.

The product scope and the MVP requirements exist (both rows are
marked active below). The stack and architecture are still undecided, so the
remaining spec groups below stay stubs. They flip to `active` through
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
| PRD | `product/prd.md` | stub (not needed yet) | `product-owner` | product requirements: features, priority, release scope |
| Roadmap | `product/roadmap.md` | stub (not needed yet) | `product-owner` | sequenced direction across milestones |
| Personas | `product/personas.md` | stub (not needed yet) | `product-owner` | user archetypes the product serves |
| User stories | `product/user-stories.md` | stub (not needed yet) | `product-owner` | stories expressing user needs per slice |
| Acceptance criteria | `product/acceptance-criteria.md` | stub (not needed yet) | `product-owner` | done-conditions per story or slice |
| Scope | `product/scope.md` | stub (not needed yet) | `product-owner` | in/out scope statement for the product |

## Requirements

| Type | Path | Status | Owner | Purpose |
|---|---|---|---|---|
| MVP requirements | `requirements/mvp-requirements.md` | active | `business-analyst` | numbered FRs, measurable NFRs, per-hotel workflow customisation, traceability (Closes #10) |
| Functional requirements | `requirements/functional-requirements.md` | stub (not needed yet) | `business-analyst` | numbered functional requirements with one guard each |
| Non-functional requirements | `requirements/non-functional-requirements.md` | stub (not needed yet) | `business-analyst` | measurable NFRs (performance, reliability, usability) |
| SRD | `requirements/srd.md` | stub (not needed yet) | `business-analyst` | stakeholder requirements definition |
| SRS | `requirements/srs.md` | stub (not needed yet) | `business-analyst` | software requirements specification |
| Business rules | `requirements/business-rules.md` | stub (not needed yet) | `business-analyst` | domain policies constraining behaviour |
| Use cases | `requirements/use-cases.md` | stub (not needed yet) | `business-analyst` | actor-goal flows through the system |
| Data dictionary | `requirements/data-dictionary.md` | stub (not needed yet) | `business-analyst` | shared definitions of data entities and fields |

## Architecture

| Type | Path | Status | Owner | Purpose |
|---|---|---|---|---|
| HLD | `architecture/hld.md` | active | `architect` | high-level design: subsystems and their responsibilities (Closes #11) |
| LLD | `architecture/lld.md` | stub (not needed yet) | `architect` | low-level design: modules, interfaces, data flow |
| System architecture | `architecture/system-architecture.md` | active | `architect` | overall system structure and deployment view (Closes #11) |
| ERD | `architecture/erd.md` | active | `architect` | entity-relationship model of the domain data (Closes #11) |
| Sequence diagrams | `architecture/sequence-diagrams.md` | stub (not needed yet) | `architect` | key interaction flows across components |
| State machine | `architecture/state-machine.md` | active | `architect` | lifecycle states and transitions of core entities (Closes #11) |
| ADR template | `architecture/decisions/adr-0001-template.md` | stub (not needed yet) | `architect` | decision-record template (the decisions directory holds ADRs) |
| ADR-0001 monorepo polyglot | `architecture/decisions/adr-0001-monorepo-polyglot.md` | active | `architect` | proposed monorepo with polyglot modules (Closes #11) |

## Technical

| Type | Path | Status | Owner | Purpose |
|---|---|---|---|---|
| API spec | `technical/api-spec.md` | active | `architect` | contracts for service interfaces and endpoints (outline, Closes #11) |
| Schema | `technical/schema.md` | stub (not needed yet) | `architect` | data schemas and validation rules |
| Integration | `technical/integration.md` | stub (not needed yet) | `architect` | third-party and cross-system integration contracts |
| Error handling | `technical/error-handling.md` | active | `architect` | error taxonomy and handling conventions (outline, Closes #11) |
| Security threat model | `technical/security-threat-model.md` | stub (not needed yet) | `architect` | threats, mitigations, and trust boundaries |

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

## Testing

| Type | Path | Status | Owner | Purpose |
|---|---|---|---|---|
| Test strategy | `testing/test-strategy.md` | stub (not needed yet) | `qa-lead` | testing approach, levels, and entry/exit criteria |
| Test plan | `testing/test-plan.md` | stub (not needed yet) | `qa-lead` | scoped plan per release or slice |
| Test cases | `testing/test-cases.md` | stub (not needed yet) | `qa-lead` | cases covering each FR/NFR |
| Test data | `testing/test-data.md` | stub (not needed yet) | `qa-lead` | datasets and fixtures backing the cases |
| Traceability matrix | `testing/traceability-matrix.md` | stub (not needed yet) | `qa-lead` | FR/NFR-to-guard map (every item keeps at least one guard) |
| Test report | `testing/test-report.md` | stub (not needed yet) | `qa-lead` | results and open gaps per run |

## DevOps / Operations / Release

| Type | Path | Status | Owner | Purpose |
|---|---|---|---|---|
| CI/CD | `devops/ci-cd.md` | stub (not needed yet) | `release-manager` | pipeline stages, checks, and merge gates |
| Deployment | `devops/deployment.md` | stub (not needed yet) | `release-manager` | deployment targets and procedures |
| Environment | `devops/environment.md` | stub (not needed yet) | `release-manager` | environment inventory and configuration |
| Runbook | `operations/runbook.md` | stub (not needed yet) | `release-manager` | step-by-step operating procedures, fresh at merge time |
| Monitoring and alerting | `operations/monitoring-alerting.md` | stub (not needed yet) | `release-manager` | signals, dashboards, and alert routing |
| Backup and DR | `operations/backup-dr.md` | stub (not needed yet) | `release-manager` | backup, restore, and disaster-recovery plan |
| Incident response | `operations/incident-response.md` | stub (not needed yet) | `release-manager` | incident roles, severity, and response flow |
| Release notes | `release/release-notes.md` | stub (not needed yet) | `release-manager` | per-release change entries |
| Rollback | `release/rollback.md` | stub (not needed yet) | `release-manager` | rollback procedure per release |

## Project

| Type | Path | Status | Owner | Purpose |
|---|---|---|---|---|
| Plan | `project/plan.md` | stub (not needed yet) | `product-owner` | milestones — issue queue only until scoped |
| Risk register | `project/risk-register.md` | stub (not needed yet) | `product-owner` | live risk list |
| Decision log | `project/decision-log.md` | stub (not needed yet) | `product-owner` | decision list pointing at ADRs |
| Meeting notes | `project/meeting-notes.md` | stub (not needed yet) | `product-owner` | dated notes of owner decisions |
| Issue conventions | `project/issue-conventions.md` | active | `product-owner` | title+label convention for issues and PRs |

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

## Standalone template (shipped, Closes #16)

| Path | Purpose |
|---|---|
| `template/README.md` | what the template is, prerequisites, quick start, payload table |
| `template/ONBOARDING.md` | new-project runbook: install, labels, AO registration, reviewer mode, guardrails, checklist |
| `template/AGENTS.md` | agent guide with `{{PROJECT_NAME}}`, `{{REPO_SLUG}}`, `{{DEFAULT_BRANCH}}`, `{{DOMAIN}}` placeholders, no project-specific rules |
| `template/.opencode/` | 11 role files, 5 skills (`project-verify` replaces `hotel-verify`), commands, `opencode.jsonc` deny rules, `project-guard.ts` |
| `template/.github/` | issue form, blank-issue config, PR template |
| `template/docs/` | document index and taxonomy, role rules, conventions, starter group (extraction plan records the `template/` + AO-assets extraction) |
| `template/config/ao-project.jsonc` | full AO project config template (pool rules, harness/model examples, reviewers, intake, `autoReview`, `workersRequestReview`); applied with `--config-json` |
| `template/cues/` | 16 project-scoped rule cues (`name`/`date`/`supersedes` front-matter; newest cue wins) |
| `template/script/` | sanctioned wrappers plus `install-template.sh` (copy without overwrite unless `--force`, placeholder substitution, `--dry-run`, idempotent, refuses non-git targets) and `install-cues.sh` (`--project <id> [--dry-run]`, idempotent, never duplicates) |

The `agentic-template/` starter above stays as the in-tree design
record; `template/` is the installable artefact (its
`docs/agentic-template/extraction-plan.md` records the extraction).

## Other existing docs

| Path | Purpose |
|---|---|
| `ao-rules.md` | normative AO role rules (canonical roles, signatures, reviewer-must-differ) |
