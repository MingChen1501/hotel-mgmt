# AO role rules (normative, #350)

Canonical roles (use verbatim): `orchestrator`, `product-owner`, `business-analyst`, `architect`, `qa-lead`, `release-manager`, `spec-reviewer`, `dev`, `dev-peer-review`, `dev-takeover`, `content`, `content-review`, `ai-engineer`.
Session name: `<role> <target>` (e.g. `dev #12 checkout retry`, `dev-peer-review #13 rate limit`, `content #14 room policy page`).

Commits: `git config --worktree user.name "Ming Chen (<role>)"`, email unchanged. Never rewrite history, change accounts, add bots, or spoof authorship beyond the name suffix.

Artefacts (PR/issue/review bodies, comments) end with a blank line plus two lines (via `script/ao-role-footer.sh <role> [session-id]`, never hand-written):

`<!-- ao-role: <role> -->`
`Role: <role> · AO session <session-id>`

Session id is optional in review bodies only; otherwise always include it. Merge commits keep the squash subject; the role stays visible in the PR marker and squash trailer `Role: <role>`.

Reviewer must differ from implementer (`dev` vs `dev-peer-review`, `content` vs `content-review`). A reviewer posts one COMMENT verdict with its footer and never posts code.

## Reporting contract (owner-facing reports, #746)

Owner-facing readiness reports carry checkable evidence, not a summary assembled from an earlier check.

- Reference every PR and issue named in a report by its full URL, never by number alone.
- Never claim "ready to merge" (or "ready for owner merge") without a fresh merge-readiness preflight: run `script/merge-readiness.sh <pr...>` immediately before the report, paste its output block verbatim (it names the exact head SHAs it read), and report its exit status. A report without that output is incomplete.
- Never quote an earlier preflight. A readiness snapshot goes stale as the default branch moves: a stack member's base is the member below it, so one default-branch commit can turn a clean member `DIRTY`, and GitHub retargets the surviving members after a stack merge.
- The preflight is read-only (no push, merge, comment, label, or branch operation). Recording it for an audit trail is the orchestrator's action (for example a PR/issue comment), not the script's.
- A `NOT READY` preflight (CONFLICTING, DIRTY, or no head-quoting APPROVE / SPEC-GATE PASS verdict) is never reported as ready; a `DIRTY`/`CONFLICTING` PR is routed to a worker, never resolved in the orchestrator.
- A stacked PR set needs the default branch merged into the **bottom** member before the owner is asked to merge; re-verify the stack afterwards (fresh preflight plus green CI) and only then ask.
