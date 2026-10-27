---
name: review-repo-verdict
date: 2026-10-27
supersedes:
---
REVIEW GATE: a merge needs a reviewer verdict on the exact PR head. The gate reads both PR issue comments and formal PR reviews: a verdict counts only when its headline (first non-empty line of the body) LEADS with the verdict word — PASS or APPROVE approves, FAIL or CHANGES_REQUESTED blocks (a formal review in state APPROVED or CHANGES_REQUESTED also counts when its body quotes the head) — and the body quotes the exact head SHA it reviewed; verdicts on older heads are stale and a re-pushed head needs a fresh verdict. A verdict word appearing only later in the headline does not count. Any CHANGES_REQUESTED quoting the head blocks the merge even alongside an APPROVE. Reviewer must differ from the implementer. If the risk label is missing or above risk-medium and the owner has not approved in writing on the PR, do not merge.
