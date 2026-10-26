# contract-tests (admin)

Provider fixtures for `AdminService` (issues #112, #163), generated
from `contracts/` per `docs/technical/integration.md` section 9: the
`SignIn` happy path plus the `UNAUTHENTICATED` wrong-secret branch,
the `GetHotelConfig` snapshot, `UpdateHotelConfig` plus its
`FORBIDDEN` role branch, and `CreateUser` plus its duplicate
`VALIDATION_FAILED` branch (#112); the user/role management and
audit slice (#163) adds `UpdateUserRole` plus its `FORBIDDEN` role
branch, `UnlockIdentity` plus its `FORBIDDEN` role branch,
`SignOut`, `ListUsers`, and `QueryAuditLog` plus its empty-page
case; the secret-rotation slice (#284) adds `ChangeSecret` plus its
wrong-current-secret `UNAUTHENTICATED` branch.

The repo gate (`script/contract-check.sh`, run from the repo root)
validates every fixture against the `contracts/http/` operation
manifest.
