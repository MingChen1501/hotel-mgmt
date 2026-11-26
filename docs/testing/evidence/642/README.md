# #642 failed Reporting rebuild — evidence

Before/after reproduction record for
[issue #642](https://github.com/MingChen1501/hotel-mgmt/issues/642)
(audit finding P2; `AC-RPT-8`..`AC-RPT-10`, `FR-RPT-5`..`FR-RPT-7`,
`BR-66`, LLD
[section 35](../../../architecture/lld.md#35-a-failed-reporting-rebuild-keeps-the-last-good-read-model-refs-642),
guards `RB1`-`RB12` and evidence rule `RB-E1` in
[the test traceability](../../failed-rebuild-consistency-test-traceability.md)).
The left column is the pre-change build; the right column is this
change. Every answer below was captured by running the store's rebuild
on both builds, not from a summary assembled afterwards.

## Finding

`Rebuild` took the store mutex, replaced `seen`, `offsets`, `asOf`, and
all six projection maps with empty values
(`services/reporting/internal/store/store.go:225-235` at the pre-change
head), released the mutex (`:236`), and only then replayed the slice
through `Apply` (`:237-241`), returning the first refused event
unchanged (`:239`). Reads take the same mutex per call and never refuse
(`services/reporting/internal/handler/handler.go:1-8`; `Occupancy`
locked at `internal/store/store.go:479`, `Revenue` at `:534`, `Sheet` at
`:560`, `Housekeeping` at `:633`), so a rebuild that aborted part-way
left the desk reading an empty or partial set whose `asOf` was the
newest event that did apply — occupancy and revenue reading as zero or
short behind a plausible freshness stamp.

## Capture method

- **Why not a compose lab.** Reporting has no HTTP rebuild operation:
  `cmd/server/main.go:30-32` mounts only `GET /healthz` and the
  `/v1/reporting/` read prefix, and the read model is exposed to the
  rebuild job through `service.Store()`
  (`internal/service/service.go:25-27`). The reproduction therefore
  drives `Rebuild` — the exact call the rebuild job wiring makes — and
  reads the four reports through the store and HTTP layers. No compose
  project was started, so the shared lab was not touched and no
  container, volume, or database was created.
- Pre-change build: `git worktree add --detach /tmp/opencode/642-prefix
  a9751e2` (the base of this branch; its code tree is the pre-change
  tree because the #642 spec commits touch `docs/` only).
- Fixed build: this branch at `e293508` (the code commit under test).
- The **same guard files** were copied into the pre-change worktree, so
  the two runs execute identical assertions and only
  `internal/store/store.go` differs. That is what turns the pair into a
  before/after rather than two different tests.
- Both runs: `go test` in `services/reporting` with the module's stock
  wiring; the seeded slice is the `seedEvents()` fixture (two Deluxe
  bookings, one cancelled, one Standard booking checked in and out,
  availability baselines, folio charges and a payment), and the bad
  event is the `TestMalformedEventsAreRefused` recipe — a
  `reservation.created` missing `reservationRef` — placed **mid-stream**
  with good events on both sides.

## Before/after — the guards

| Step | Pre-change build (`a9751e2` + the guards) | This change (`e293508`) |
|---|---|---|
| `RB1` served store, bad event mid-stream, read `OccupancyReport` | `FAIL` — `occupancy rows moved on a failed rebuild`, 4 rows before → a **different 4-row set** after (`deluxe` 1/1 became 2/0 on both nights; `standard` 1/0 became 0/1) because the replay stopped after `evt-res-2`, before the cancellation ever applied | `PASS` — the four reports and the offset record still answer the pre-rebuild values |
| `RB2` resume record and last-good stamp | `FAIL` — `consumer offsets moved on a failed rebuild: map[folio:evt-folio-4 rate:evt-rate-4 reservation:evt-res-4 stay:evt-stay-2] -> map[rate:evt-rate-4 reservation:evt-res-2]` (the offset record now names a set the model no longer holds) | `PASS` — offsets and `AsOf()` unchanged; a retry names the same last-applied ids |
| `RB3` never-rebuilt store, failed rebuild | `FAIL` — `occupancy after a failed first rebuild = [4 partial rows], asOf 2026-11-01 10:00:00` — rows invented on a store that never applied an event, with a fresher-looking stamp | `PASS` — zero rows on all four reports, zero `asOf`, empty offset record |
| `RB4` read during a rebuild (`-race` locally) | `FAIL` — `a daily-sheet read during the rebuild returned neither the pre-rebuild nor the post-rebuild sheet with its own stamp (asOf 0001-01-01)` — a read saw the emptied set | `PASS` — every individual read is exactly the pre-rebuild or the post-rebuild value with that set's stamp |
| `RB5` success comparator vs the live `Apply` path | `PASS` — the pre-change path already produced the live-ingest output, so this guard is an equivalence pin, not a finding | `PASS` — unchanged rows, order, zero-filled dates, totals, groups, list, `asOf`, offsets |
| `RB7` per-set `asOf` at store and service level | `FAIL` — `occupancy after the abort asOf = 2026-11-01, want 2026-11-03` (the last-good stamp was replaced by a partial replay stamp); service half: `occupancy rows moved after a failed rebuild` | `PASS` — all four reports carry the served set's stamp before and after an aborted rebuild |
| `RB8` failed rebuild never surfaced through a read | `FAIL` — `/v1/reporting/OccupancyReport answer moved after a failed rebuild` (200 with the partial rows) | `PASS` — all four routes answer `200` with byte-identical pre-rebuild bodies and key sets |
| `RB9` observable failure | `FAIL` — `a failed rebuild advanced the as-of stamp to 2026-11-01, want the last-good stamp 2026-11-03` (the refusal is returned, but the second signal — a stamp that did not move — was destroyed) | `PASS` — the returned `VALIDATION_FAILED` equals the same event's `Apply` refusal, and the stamp stays at the last-good value even though a later good event follows the bad one |

Raw pre-change run (the guards against the pre-change `store.go`):

```text
$ go test ./internal/store/ -run "TestAborted|TestReadDuring|TestSuccessfulRebuild|TestReportsCarry|TestFailedRebuild" -v
    store_test.go:642: occupancy rows moved on a failed rebuild: [{NightDate:2026-11-01 RoomType:deluxe Occupied:1 Available:1} {NightDate:2026-11-02 RoomType:deluxe Occupied:1 Available:1} {NightDate:2026-11-02 RoomType:standard Occupied:1 Available:0} {NightDate:2026-11-03 RoomType:standard Occupied:1 Available:0}] -> [{NightDate:2026-11-01 RoomType:deluxe Occupied:2 Available:0} {NightDate:2026-11-02 RoomType:deluxe Occupied:2 Available:0} {NightDate:2026-11-02 RoomType:standard Occupied:0 Available:1} {NightDate:2026-11-03 RoomType:standard Occupied:0 Available:1}]
--- FAIL: TestAbortedRebuildKeepsServedRows (0.00s)
    store_test.go:662: consumer offsets moved on a failed rebuild: map[folio:evt-folio-4 rate:evt-rate-4 reservation:evt-res-4 stay:evt-stay-2] -> map[rate:evt-rate-4 reservation:evt-res-2]
--- FAIL: TestAbortedRebuildKeepsOffsetsAndStamp (0.00s)
    store_test.go:702: occupancy after a failed first rebuild = [{NightDate:2026-11-01 RoomType:deluxe Occupied:2 Available:0} {NightDate:2026-11-02 RoomType:deluxe Occupied:2 Available:0} {NightDate:2026-11-02 RoomType:standard Occupied:0 Available:1} {NightDate:2026-11-03 RoomType:standard Occupied:0 Available:1}], asOf 2026-11-01 10:00:00 +0000 UTC; want no rows and a zero stamp
--- FAIL: TestAbortedRebuildOnNeverRebuiltStoreKeepsEmptyState (0.00s)
    store_test.go:818: a daily-sheet read during the rebuild returned neither the pre-rebuild nor the post-rebuild sheet with its own stamp (asOf 0001-01-01 00:00:00 +0000 UTC); a partial set reached the desk
--- FAIL: TestReadDuringRebuildAnswersOneCompleteSet (0.00s)
--- PASS: TestSuccessfulRebuildMatchesLiveIngest (0.00s)
    store_test.go:907: occupancy after the abort asOf = 2026-11-01 10:00:00 +0000 UTC, want the served set's stamp 2026-11-03 10:00:00 +0000 UTC
--- FAIL: TestReportsCarryTheirSetsAsOf (0.00s)
    store_test.go:947: a failed rebuild advanced the as-of stamp to 2026-11-01 10:00:00 +0000 UTC, want the last-good stamp 2026-11-03 10:00:00 +0000 UTC
--- FAIL: TestFailedRebuildStaysObservableThroughTheCall (0.00s)

$ go test ./internal/service/ -run TestReportsCarryTheServedSetsAsOf -v
    service_test.go:234: occupancy rows moved after a failed rebuild: [{NightDate:2026-11-01 RoomType:deluxe Occupied:1 Available:1} {NightDate:2026-11-02 RoomType:deluxe Occupied:1 Available:0}] -> [{NightDate:2026-11-01 RoomType:deluxe Occupied:0 Available:2}]
--- FAIL: TestReportsCarryTheServedSetsAsOf (0.00s)

$ go test ./internal/handler/ -run TestFailedRebuildIsNotSurfacedThroughARead -v
    handler_test.go:327: /v1/reporting/OccupancyReport answer moved after a failed rebuild: map[asOf:2026-11-02T10:00:00Z dateFrom:2026-11-01 dateTo:2026-11-02 nights:[map[available:1 nightDate:2026-11-01 occupied:1 roomTypeId:deluxe] map[available:0 nightDate:2026-11-02 occupied:1 roomTypeId:deluxe]]] -> map[asOf:2026-11-02T10:00:00Z dateFrom:2026-11-01 dateTo:2026-11-02 nights:[map[available:2 nightDate:2026-11-01 occupied:0 roomTypeId:deluxe]]]
--- FAIL: TestFailedRebuildIsNotSurfacedThroughARead (0.00s)
```

## After state — the fixed build

The same guards, the same fixtures, the same bad event, on `e293508`:

```text
$ go test -count=1 ./...
ok  	github.com/MingChen1501/hotel-mgmt/services/reporting/cmd/server	0.002s
ok  	github.com/MingChen1501/hotel-mgmt/services/reporting/internal/envelope	0.004s
ok  	github.com/MingChen1501/hotel-mgmt/services/reporting/internal/handler	0.007s
ok  	github.com/MingChen1501/hotel-mgmt/services/reporting/internal/health	0.003s
ok  	github.com/MingChen1501/hotel-mgmt/services/reporting/internal/messages	0.004s
ok  	github.com/MingChen1501/hotel-mgmt/services/reporting/internal/service	0.964s
ok  	github.com/MingChen1501/hotel-mgmt/services/reporting/internal/store	0.008s

$ go test -count=1 ./internal/store/ -run "TestAborted|TestReadDuring|TestSuccessfulRebuild|TestReportsCarry|TestFailedRebuild" -v
--- PASS: TestAbortedRebuildKeepsServedRows (0.00s)
--- PASS: TestAbortedRebuildKeepsOffsetsAndStamp (0.00s)
--- PASS: TestAbortedRebuildOnNeverRebuiltStoreKeepsEmptyState (0.00s)
--- PASS: TestReadDuringRebuildAnswersOneCompleteSet (0.00s)
--- PASS: TestSuccessfulRebuildMatchesLiveIngest (0.00s)
--- PASS: TestSuccessfulRebuildMatchesLiveIngest/seed (0.00s)
--- PASS: TestSuccessfulRebuildMatchesLiveIngest/housekeeping (0.00s)
--- PASS: TestReportsCarryTheirSetsAsOf (0.00s)
--- PASS: TestFailedRebuildStaysObservableThroughTheCall (0.00s)

$ go test -count=1 ./internal/service/ -run TestReportsCarryTheServedSetsAsOf -v
--- PASS: TestReportsCarryTheServedSetsAsOf (0.00s)

$ go test -count=1 ./internal/handler/ -run TestFailedRebuildIsNotSurfacedThroughARead -v
--- PASS: TestFailedRebuildIsNotSurfacedThroughARead (0.00s)
```

The failed-rebuild read path, `-race` (CI's `go-build (reporting)` job
runs `go test ./...` without the race detector, so this run is recorded
here):

```text
$ go test -race ./internal/store/ -run TestReadDuringRebuildAnswersOneCompleteSet -v
=== RUN   TestReadDuringRebuildAnswersOneCompleteSet
--- PASS: TestReadDuringRebuildAnswersOneCompleteSet (0.01s)
PASS
ok  	github.com/MingChen1501/hotel-mgmt/services/reporting/internal/store	1.019s
```

Build, vet, and format gate:

```text
$ go build ./... && go vet ./... && gofmt -l .
(gofmt: no output)
```

Gates from the repo root:

```text
$ bash script/contract-check.sh
openapi-route-check: asserting every spec route resolves to a contract route...
  OK 14 spec operation(s) match the curated 14-op set and resolve to contract routes
openapi-route-check: PASSED.

$ bash script/openapi-route-check.sh
  OK 14 spec operation(s) match the curated 14-op set and resolve to contract routes
openapi-route-check: PASSED.

$ bash script/catalogue-coverage-check.sh
catalogue-coverage-check: PASS
```

## Diff gates (`RB10`, `RB11`)

- **No configuration carries the publication rule.** The build-aside and
  the swap are one behaviour of `Rebuild`
  (`internal/store/store.go:262-273`). `git diff a9751e2 -- deploy/
  docs/devops docs/operations` is empty, `services/reporting` gains no
  configuration key, and the only `os.Getenv` calls in the module are
  the unchanged `PORT` (`cmd/server/main.go:24`) and the
  message-catalogue tooling path (`internal/messages/messages.go:87`).
- **One store, no migration, no contract, no catalogue change.**
  `git diff --stat a9751e2 -- services/reporting/migrations contracts
  services/reporting/internal/messages` is empty;
  `services/reporting/` still holds exactly one store
  (`internal/store/store.go`) with no `postgres.go`, `pgstore`, or
  SQL-driver import, and no migration file is added.
- **The rule stays recorded for the future persisted store.** LLD
  [section 35.2](../../../architecture/lld.md#352-what-publishes-nothing-means-per-store)
  and
  [the reporting page section 9](../../../architecture/services/reporting.md#9-delta--a-failed-rebuild-keeps-the-last-good-read-model-refs-642)
  keep the staging-plus-one-transaction requirement; this change neither
  adds a second store nor loses that sentence.

## Unit-test guards created by this change

| Guard | Test |
|---|---|
| `RB1` | `services/reporting/internal/store/store_test.go` `TestAbortedRebuildKeepsServedRows` |
| `RB2` | `store_test.go` `TestAbortedRebuildKeepsOffsetsAndStamp` |
| `RB3` | `store_test.go` `TestAbortedRebuildOnNeverRebuiltStoreKeepsEmptyState` |
| `RB4` | `store_test.go` `TestReadDuringRebuildAnswersOneCompleteSet` (run under `-race` above) |
| `RB5` | `store_test.go` `TestSuccessfulRebuildMatchesLiveIngest` |
| `RB7` | `store_test.go` `TestReportsCarryTheirSetsAsOf`; `services/reporting/internal/service/service_test.go` `TestReportsCarryTheServedSetsAsOf` |
| `RB8` | `services/reporting/internal/handler/handler_test.go` `TestFailedRebuildIsNotSurfacedThroughARead` |
| `RB9` | `store_test.go` `TestFailedRebuildStaysObservableThroughTheCall` |
| `RB6`, `RB12` | re-run with no assertion edit: `TestDuplicateDeliveryNeverDoubleCounts`, the replay half of `TestRebuildTracksRoomsNeedingWork`, the range-cap guards, the service and handler guards, and `TestPerfTwoYearReportsRecordTimings` — all green in the `./...` run above |

<!-- ao-role: dev -->
Role: dev · AO session hotel-mgmt-1212
