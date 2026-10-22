# Bootstrap: new repo to first guarded PR

Status: active (template starter). Follow top to bottom on a brand-new
repository. A reader who has never seen the source repo should be able
to complete this without opening its history. Bracketed values are
yours to set.

## Prerequisites

- A GitHub account with permission to create repositories.
- `git`, `gh` (authenticated: `gh auth login`), and your language
  toolchain installed.
- An AO (agent orchestrator) installation with permission to spawn
  worker sessions.

## Step 1 — create the repo and the docs tree

```sh
gh repo create [owner]/[repo] --public --clone
cd [repo]
mkdir -p docs/{business,product,requirements,architecture,technical,development,testing,devops,operations,project,release,support}
```

Write `docs/README.md` as the single index: one table per group, one
row per document type, each row carrying status `active`,
`stub (not needed yet)`, or `n/a (technical)`. Every file under
`docs/` must appear in exactly one table — no orphans, no dead links.
Stubs say why they are not needed and when to revisit. Real docs either
own content or explicitly defer with a link — no duplicated source of
truth.

Then copy in this template group: `agentic-template/README.md`,
`roles.md`, `gate.md`, `conventions.md`, `bootstrap.md`,
`extraction-plan.md` (drop the last once the template repo exists),
and link the group from `docs/README.md`.

## Step 2 — install the roles

Create one role file per role in `roles.md` (e.g.
`.opencode/agents/<role>.md`) from the skeleton there. At minimum
install: `orchestrator` (operating loop), `spec-reviewer` (gate),
`dev`, `dev-peer-review` (implement + review), and whichever spec owner
your first change needs (`product-owner`, `business-analyst`,
`architect`, `qa-lead`, or `release-manager`). Add the rest when a tier
first requires them.

Exclude operator-only material from the built product if your stack
ships a build (e.g. add `docs/` and `.opencode/` to the build's exclude
list) so internal specs never leak to users.

## Step 3 — configure the AO project

```sh
ao project add --name [repo] --path $(pwd)
ao project set-config [project-id] --agent-rules-file [repo-relative path to your agent guide, e.g. AGENTS.md]
```

`[project-id]` is the id shown by `ao project ls` (derived from the
path unless overridden with `--id` at add time). The rules file path
is repo-relative, so every session loads the same rules.

Warning: `ao project set-config` replaces the whole per-project
config, even when focused flags are used. If the project already has
other settings (model, env, branch, reviewers), pass the complete
object with `--config-json` so nothing is dropped:

```sh
ao project set-config [project-id] --config-json \
  '{"agentRulesFile":"AGENTS.md","defaultBranch":"main"}'
```

Write the agent guide for the new repo: precedence (owner instruction >
project config > guide > skills > role files), build/test commands,
non-negotiables (never edit build outputs, never push to the default
branch, one risk label per issue/PR, squash merge only). Keep the
canonical role list, footer/marker format, reviewer-differs rule, and
session naming in one normative file (cf. `conventions.md`) and link
it from everywhere else.

## Step 4 — branch protection, labels, CI

```sh
gh label create risk-low --color 0E8A16
gh label create risk-medium --color FBCA04
gh label create risk-high --color D93F0B
gh label create risk-very-high --color B60205
```

Label meanings are normative in `conventions.md` (Risk labels
section) — use those wordings as the `--description` values when
creating the labels. If the commands above and `conventions.md`
drift, `conventions.md` wins.

In the repository settings, protect the default branch: require pull
requests, require green CI, forbid direct pushes. Set up the smallest
useful CI: build + the guard tests your stack needs, with least-privilege
workflow permissions and pinned dependencies.

## Step 5 — run the first guarded PR

1. File an issue with a risk label and a proposed tier (`gate.md`).
   Suggested first issue: a T0 docs-only change (e.g. the project
   scope note) — no gate ceremony, exercises the whole pipeline.
2. The orchestrator spawns the owning spec role for T2+; specs are
   written and index rows flip to `active`.
3. The orchestrator spawns `spec-reviewer`; implementation starts only
   on `SPEC-GATE PASS`.
4. A `dev` (or `content`) session implements on a feature branch, pushes,
   and opens a PR with `Closes #<n>`, the risk label, and the role
   footer.
5. The orchestrator spawns a reviewer session (`dev-peer-review` or
   `content-review`, differing from the implementer); the reviewer posts
   one COMMENT verdict (`APPROVE` / `CHANGES_REQUESTED` + `file:line`
   findings).
6. On APPROVE + green CI + `risk-low`/`risk-medium`, squash-merge and
   delete the branch:
   `gh pr merge <n> --squash --delete-branch`.
   Anything higher-risk waits for explicit owner approval.

## Step 6 — declare adoption done

Adoption is done when: the index covers all of `docs/` with no
orphans, every role file exists with reads/writes/forbiddens/artefacts
sections, branch protection + labels + CI are live, and one PR has gone
from issue to squash-merge through the gate and the COMMENT verdict.
Record that PR as your own first worked example.
