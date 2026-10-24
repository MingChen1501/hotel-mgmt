# Issue conventions

Status: active. Structural title+label convention for issues and PRs:
every new issue and PR carries one type token and the matching labels, so the
backlog stays scannable without periodic retitling drives.

## Title

Issue titles and PR titles use different formats. Issues keep the
bracketed form for backlog scannability; PR titles — and therefore
squash-merge commit messages — use Conventional Commits.

### Issue titles

`[type] Imperative summary` — a lowercase type token in square brackets,
then one sentence-case sentence with no trailing period.

- Imperative mood: start with a verb (`Add`, `Fix`, `Remove`, `Split`).
  `content` issues are the exception: their title is the working content
  title (`[content] Rewrite the cancellation policy page`).
- One line, no period, no extra prefixes (`docs:` / `Perf:` / `CI:` are
  legacy forms — use `[docs]` / `[perf]` / `[ci]` instead).

### PR titles

`type(scope): Subject` — Conventional Commits form: a lowercase `type`
from the table below, an optional lowercase `scope` in parentheses naming
the affected module or area (e.g. `project`, `reporting`, `rooms`;
omit `scope` only for cross-cutting changes), a colon and one space,
then a sentence-case `Subject` with no trailing period.

- Imperative mood, same as issue titles: start with a verb (`Add`,
  `Fix`, `Split`).
- `Subject` states what the PR does, not the issue number: `Closes #n`
  stays in the PR body (Linked issue section), never in the title.
- Reviewer checklist: an off-format PR title is a blocking finding
  (verdict requests changes until the title matches this format).
- No retroactive rewrite: already-merged history keeps its old title
  styles; this convention applies to new PRs only.

## Type to label table

Each type maps 1:1 to a label of the same name. Every issue and PR carries
exactly one type label and exactly one `risk-*` label (`risk-low` /
`risk-medium` / `risk-high` / `risk-very-high`).

| Type | Label | Use for |
|---|---|---|
| `feat` | `feat` | new behaviour or capability |
| `fix` | `fix` | bug fix |
| `docs` | `docs` | documentation only |
| `test` | `test` | tests without behaviour change |
| `ci` | `ci` | CI, workflows, automation |
| `perf` | `perf` | performance |
| `a11y` | `a11y` | accessibility |
| `i18n` | `i18n` | internationalisation / localisation handling |
| `chore` | `chore` | maintenance with no user-visible change |
| `content` | `content` | guest-facing content (room descriptions, policies, announcements) |
| `security` | `security` | security fix or hardening |

## Priority and Size

Every issue carries a Priority and a Size (both are required fields
in the issue form) for triage.

Priority — urgency:

| Priority | Meaning |
|---|---|
| `P0` | must-fix-now: drop everything, fix immediately |
| `P1` | next: the next thing to pick up |
| `P2` | normal: scheduled routinely |
| `P3` | backlog: wanted, no near-term plan |

Size — T-shirt effort relative to one worker session:

| Size | Meaning |
|---|---|
| `XS` | trivial edit, well under one session |
| `S` | fits comfortably in one session |
| `M` | fills one session |
| `L` | large for one session, may need splitting into smaller issues |

Defaults: docs/process issues default to `P2`/`S` unless stated;
code issues default to `P1`/`M`. The buffer proposes both values when
filing, subject to orchestrator confirmation.

## Body

Issues use `.github/ISSUE_TEMPLATE/task.yml` (blank issues are
disabled via `config.yml`, so the form is the only path). Required sections:
Type, Priority, Size, Summary, Context (with evidence/links), Scope (in/out),
Acceptance criteria (testable statements — Given/When/Then or numbered),
Risk and rollback.

Acceptance criteria are testable statements (Given/When/Then or numbered),
not a tracking affordance: tick the boxes only to track progress, never as
a substitute for verifiable criteria. Checkboxes are also the affordance
for owner-acceptance gates and adoption checklists — those gates are not
acceptance criteria.

Issue forms cannot apply a label from a dropdown choice, so after
filing add exactly one type label matching the Type field plus exactly one
`risk-*` label by hand. Every artefact ends with the AO role footer lines
(appended via `script/ao-role-footer.sh`, never hand-written).

PRs use `.github/PULL_REQUEST_TEMPLATE.md`: Summary, linked issue
(`Closes #`), Type, Risk label, Test evidence (which suites/CI checks),
and the role footer.

## Examples of good titles

Issues:

- `[chore] Add issue and PR templates with a title and label convention`
- `[fix] Correct the checkout total when a discount applies`
- `[feat] Add room availability search for a date range`
- `[docs] House every SWE document type in-tree with index table`
- `[content] Rewrite the cancellation policy page`

Example pair (issue title vs its PR title) for this convention change:

- Issue: `[docs] Split PR title format to Conventional Commits`
- PR: `docs(project): Split PR title format to Conventional Commits`

## Retitle rule for old issues

Do not bulk-retitle the backlog. Normalise an old issue's title and labels
when touching it (commenting, implementing, or closing): apply the
`[type] Imperative summary` title, exactly one type label, and exactly one
`risk-*` label, and note the retitle in passing.
