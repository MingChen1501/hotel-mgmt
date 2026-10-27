# Documents

Status: active (index). Single entry point for every document type in
this project: each row points at its real path with status `active` or
`stub (not needed yet)` plus the owning role. Every file under `docs/`
is in one of the tables — no orphans, no dead links. All content is
English.

Every spec group starts as a stub in a fresh install — the template
ships no product content. Rows flip to `active` through the normal
spec-gated flow (see the `spec-gate` skill) as the owner scopes
slices. Do not invent product requirements to fill them early.

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
| MVP scope | `product/mvp-scope.md` | stub (not needed yet) | `product-owner` | MVP scope for the first product slice (activate when the owner scopes it) |
| PRD | `product/prd.md` | stub (not needed yet) | `product-owner` | product requirements: features, priority, release scope |
| Roadmap | `product/roadmap.md` | stub (not needed yet) | `product-owner` | sequenced direction across milestones |
| Personas | `product/personas.md` | stub (not needed yet) | `product-owner` | user archetypes the product serves |
| User stories | `product/user-stories.md` | stub (not needed yet) | `product-owner` | stories expressing user needs per slice |
| Acceptance criteria | `product/acceptance-criteria.md` | stub (not needed yet) | `product-owner` | done-conditions per story or slice |
| Scope | `product/scope.md` | stub (not needed yet) | `product-owner` | in/out scope statement for the product |

## Requirements

| Type | Path | Status | Owner | Purpose |
|---|---|---|---|---|
| MVP requirements | `requirements/mvp-requirements.md` | stub (not needed yet) | `business-analyst` | numbered FRs, measurable NFRs, traceability inputs (activate with the first tiered change) |
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
| HLD | `architecture/hld.md` | stub (not needed yet) | `architect` | high-level design: subsystems and their responsibilities |
| LLD | `architecture/lld.md` | stub (not needed yet) | `architect` | low-level design: modules, interfaces, data flow |
| System architecture | `architecture/system-architecture.md` | stub (not needed yet) | `architect` | overall system structure and deployment view |
| ERD | `architecture/erd.md` | stub (not needed yet) | `architect` | entity-relationship model of the domain data |
| Sequence diagrams | `architecture/sequence-diagrams.md` | stub (not needed yet) | `architect` | key interaction flows across components |
| State machine | `architecture/state-machine.md` | stub (not needed yet) | `architect` | lifecycle states and transitions of core entities |
| ADR template | `architecture/decisions/adr-0001-template.md` | stub (not needed yet) | `architect` | decision-record template (the decisions directory holds ADRs) |

## Technical

| Type | Path | Status | Owner | Purpose |
|---|---|---|---|---|
| API spec | `technical/api-spec.md` | stub (not needed yet) | `architect` | contracts for service interfaces and endpoints |
| Schema | `technical/schema.md` | stub (not needed yet) | `architect` | data schemas and validation rules |
| Integration | `technical/integration.md` | stub (not needed yet) | `architect` | third-party and cross-system integration contracts |
| Error handling | `technical/error-handling.md` | stub (not needed yet) | `architect` | error taxonomy and handling conventions |
| Security threat model | `technical/security-threat-model.md` | stub (not needed yet) | `architect` | threats, mitigations, and trust boundaries |

## Development

Note: `dev` is the implementer, not a spec role — it builds from
approved specs and owns no spec group. The rows below are working
docs and plans, not gated specs.

| Type | Path | Status | Owner | Purpose |
|---|---|---|---|---|
| Repository README | `../README.md` | stub — create at the first scoped change (the installer ships no repo-root files) | `dev` | repo-root entry point: what this repo is and where to start |
| Contributing guide | `../CONTRIBUTING.md` | stub — create at the first scoped change (the installer ships no repo-root files) | `dev` | repo-root contribution workflow |
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
| Milestone conventions | `project/milestone-conventions.md` | active | `product-owner` | milestone naming, lifecycle, and bookkeeping rules |

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
| `agentic-template/extraction-plan.md` | records how this standalone template was extracted (shipped; no new repository created) |

Harness docs live in this group (`agentic-template/`) and in the
harness paths themselves (`.opencode/`, `script/`, `template/`):
`ai-engineer` owns them and keeps the template and live copies in
sync in the same change.

## Other existing docs

| Path | Purpose |
|---|---|
| `ao-rules.md` | normative AO role rules (canonical roles, signatures, reviewer-must-differ) |
