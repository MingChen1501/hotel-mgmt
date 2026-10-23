---
name: native-review-broken-manual
date: 2026-10-16
supersedes: publish-and-review
---
REVIEW MECHANICS (newest owner rule, supersedes any cue that says to use ao review trigger): AO native reviews on opencode-v2 are unreliable - runs hang for 10-15 minutes with zero output, end as ineligible, or leave a stuck running state that blocks the next head. Do NOT retrigger stuck runs. Cancel the stuck run, then use the manual fallback: the reviewer posts the review with gh api repos/<owner>/<repo>/pulls/<n>/reviews, records it with ao review submit --session <worker-session> --run <runId> --verdict <approved|changes_requested>, and only then may the orchestrator merge. autoReview stays disabled while the native reviewer is broken.
