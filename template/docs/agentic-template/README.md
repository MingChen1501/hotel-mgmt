# Agentic-coding base template

Status: active (template starter). A reusable starter for applying
agentic coding to other projects: the role set, the spec gate, the AO
wiring, the CI/test conventions, and the artefact conventions — without
project-specific parts.

Start here. The other four files in this directory are the template
body; `extraction-plan.md` covers turning this into a real standalone
template repository (decision still open).

## Who it is for

- A solo owner (or small team) running one AI orchestrator plus short-lived
  worker sessions against a GitHub repository.
- Projects where every change flows through issues and pull requests, CI
  is the source of truth for "done", and merges are squash-only.
- Teams willing to trade a little ceremony (specs before code on
  behaviour changes, a manual review verdict per PR) for fewer
  half-understood merges.

## What the template gives you

| File | Content |
|---|---|
| `roles.md` | generalized role table + the file skeleton each role needs |
| `gate.md` | the T0–T4 change-tier spec gate + a blank worked example |
| `conventions.md` | artefact/commit/session naming, language policy, merge policy, verdict-as-comment mechanics |
| `bootstrap.md` | step-by-step: new repo to first guarded PR, with commands |
| `extraction-plan.md` | how to turn this into a real template repo, with the open decision |

## What is deliberately not in the template

Project-specific material stays out and survives only as explicitly marked
"worked example" side notes:

- Stack specifics, styling rules, content-workflow rules, third-party
  integrations, CDN configuration, content workflows with owner-read
  gates, per-page asset budgets, and any actual visual baselines.

Worked example: a web project deployed from its default branch, where
"user-visible" means rendered pages and "guard tests" include build
plus end-to-end checks. Replace those nouns with your own stack when
adopting.

## Adoption checklist

- [ ] Register the AO project for the new repo: `ao project add
  --name [repo] --path $(pwd)`, then `ao project set-config
  [project-id] --agent-rules-file [agent guide, e.g. AGENTS.md]` so
  every session loads the same rules (see `bootstrap.md` step 3;
  `set-config` replaces the whole config, so use `--config-json`
  with the complete object when other settings exist).
- [ ] Copy the `docs/` classification tree and index table
  (`bootstrap.md` step 1); mark every row `active`, `stub (not needed
  yet)`, or `n/a (technical)` — no orphans, no dead links.
- [ ] Install the role files (`roles.md` skeletons) and the spec-gate
  reference (`gate.md`).
- [ ] Turn on branch protection on the default branch (require green CI;
  no direct pushes).
- [ ] Create the risk labels (`risk-low`, `risk-medium`, `risk-high`,
  `risk-very-high`) and require exactly one per issue and PR.
- [ ] Set up the reviewer flow: one dedicated reviewer session per PR,
  reviewer role differs from implementer, verdict posted as a COMMENT
  (`conventions.md`).
- [ ] Run the first guarded PR end to end (`bootstrap.md` step 5) before
  declaring adoption done.
