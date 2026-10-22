# AO role rules (normative, #350)

Canonical roles (use verbatim): `orchestrator`, `product-owner`, `business-analyst`, `architect`, `qa-lead`, `release-manager`, `spec-reviewer`, `dev`, `dev-peer-review`, `dev-takeover`, `content`, `content-review`, `ai-engineer`.
Session name: `<role> <target>` (e.g. `dev #12 checkout retry`, `dev-peer-review #13 rate limit`, `content #14 room policy page`).

Commits: `git config --worktree user.name "Ming Chen (<role>)"`, email unchanged. Never rewrite history, change accounts, add bots, or spoof authorship beyond the name suffix.

Artefacts (PR/issue/review bodies, comments) end with a blank line plus two lines (via `script/ao-role-footer.sh <role> [session-id]`, never hand-written):

`<!-- ao-role: <role> -->`
`Role: <role> · AO session <session-id>`

Session id is optional in review bodies only; otherwise always include it. Merge commits keep the squash subject; the role stays visible in the PR marker and squash trailer `Role: <role>`.

Reviewer must differ from implementer (`dev` vs `dev-peer-review`, `content` vs `content-review`). A reviewer posts one COMMENT verdict with its footer and never posts code.
