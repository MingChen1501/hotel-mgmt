---
name: review-repo-verdict
date: 2026-10-23
supersedes:
---
REVIEW GATE: a merge needs a recorded review verdict on the exact PR head. A COMMENT body saying APPROVE/CHANGES_REQUESTED counts only when ao review ls shows the matching verdict. Reviewer must differ from the implementer. If the risk label is missing or above risk-medium and the owner has not approved in writing on the PR, do not merge.
