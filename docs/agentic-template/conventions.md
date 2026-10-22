# Template conventions

Status: active (template starter). Artefact, commit, session, language,
and merge conventions. Generalized; bracketed values are yours to set.

## Artefact signatures

Every public artefact (issue, PR, review, comment) ends with a blank
line plus two lines:

```html
<!-- ao-role: <role> -->
Role: <role> · AO session <session-id>
```

- Generate the footer with a script (e.g.
  `script/ao-role-footer.sh <role> [session-id]`); never hand-write it.
- Session id is optional in review verdicts only; otherwise always
  include it.
- Merge commits keep the squash subject; the role stays visible in the
  PR marker and squash trailer `Role: <role>`.

## Commit identity

Set the per-worktree git identity before committing:

```sh
git config --worktree user.name "Your Name (<role>)"
```

Email unchanged. Never rewrite history, change accounts, add bots, or
spoof authorship beyond the name suffix.

## Session naming

Every worker session is named `<role> <target>`, e.g.
`dev #123 checkout retry`, `dev-peer-review #124 rate limit`.
The spawn prompt names the session and states the role string verbatim
from the canonical list (`orchestrator`, `product-owner`,
`business-analyst`, `architect`, `qa-lead`, `release-manager`,
`spec-reviewer`, `dev`, `dev-peer-review`, `dev-takeover`, `content`,
`content-review`).

## Language policy

All public repository artefacts are in [YOUR LANGUAGE, e.g. English]:
issues, PRs, commits, issues bodies, review comments, code comments.
Any second language is allowed only for internal operator reporting,
never in the repo.

Worked example (this repo): public artefacts are English; Vietnamese is
used only for internal AO reporting.

## Merge policy

- **Squash merge only**: `gh pr merge <n> --squash --delete-branch`.
  Never `--merge` or `--rebase`. Never push directly to the default
  branch; work on a branch + PR.
- Merge only when CI is green.
- `risk-low` / `risk-medium`: merge autonomously once CI is green + the
  reviewer COMMENT verdict is APPROVE, then report.
- `risk-high` / `risk-very-high` / missing label: explicit owner
  approval required before merging.
- If the reviewer raises the risk above the planned label, escalate to
  the owner instead of merging.

## Risk labels

Every issue and PR carries exactly one of `risk-low`, `risk-medium`,
`risk-high`, `risk-very-high`:

- `risk-low`: no user-visible behaviour change, nothing irreversible.
- `risk-medium`: user-visible change, reversible and guarded.
- `risk-high`: can break published URLs/SEO/content, weaken guards,
  change how assets are served/cached, or needs manual owner action.
- `risk-very-high`: irreversible or high-blast-radius — owner approval
  required and the owner is pinged explicitly.

## Review mechanics (no native reviewer)

Reviews are run by a dedicated manual reviewer session — never a
built-in reviewer trigger:

- The orchestrator spawns one reviewer session per PR, targeting the PR
  opened by the implementing session. No session reviews its own PR.
- The reviewer posts the verdict as a **COMMENT** on the PR (never a
  platform approval object, which may be blocked for same-account
  review): `APPROVE` or `CHANGES_REQUESTED` in comment text, plus
  findings by severity with `file:line`.
- Review happens **after the PR is up**, never before.
- A review session counts as a task worker under the pool rule.
- A review approval is internal: it does not satisfy required or
  independent-account reviews or branch protection. Do not work around
  branch protection; report what is still required.
