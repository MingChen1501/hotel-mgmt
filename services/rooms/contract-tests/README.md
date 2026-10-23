# contract-tests (rooms)

Provider fixtures for `RoomInventoryService` (issue #112), generated
from `contracts/` per `docs/technical/integration.md` section 9:
setup (`UpsertRoomType`, `UpsertRoom` plus the unknown-type
`NOT_FOUND` branch), housekeeping transitions (`UpdateRoomState`
plus the illegal-transition `STATE_ILLEGAL` branch, `ListRoomsByState`),
sellability (`CheckRoomTypeSellability` plus the blocked-date
`STATE_ILLEGAL` branch), assignment (`AssignRoom` plus the
`CONFLICT` taken branch, `ReleaseRoom`), and `BlockRoom`.

The paired-concurrency guard for `NFR-CON-2` runs in
`src/server.test.ts` against the real store. The repo gate
(`script/contract-check.sh`, run from the repo root) validates every
fixture against the `contracts/http/` operation manifest.
