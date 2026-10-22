---
name: native-review-broken-manual
date: 2026-10-16
supersedes: publish-and-review
---
REVIEW MECHANICS (newest owner rule 2026-10-16; supersedes publish-and-review for review mechanics): native AO reviews are unreliable, with runs hanging with zero output or stalling and blocking the next head. Do NOT trigger native reviews and do NOT retrigger stuck runs. Use the manual fallback: the reviewer posts the review with gh api repos/<owner>/<repo>/pulls/<n>/reviews, then the orchestrator records it with ao review submit --session <id> --run <runId> --verdict <approved|changes_requested>. autoReview stays disabled until the reviewer sandbox is fixed AO-side.
