# Error handling — envelope and conflict semantics

Status: active (proposed architecture; ADR-0001 still awaits owner
acceptance). Owned by `architect`. Outline only; implementation and
per-service error catalogues follow later. All messages are
user-visible strings and therefore come from the message catalogue
(`NFR-I18N-1`).

## 1. Error envelope

Every failed contract call returns the same shape:

- `code`: a stable machine-readable token (for example
  `RATE_LIMIT` is not MVP; representative MVP codes:
  `VALIDATION_FAILED`, `NOT_FOUND`, `FORBIDDEN`, `CONFLICT`,
  `STATE_ILLEGAL`, `SETTLEMENT_REQUIRED`).
- `message`: a human-readable sentence naming what was refused and
  why, suitable to show staff at the desk.
- `details`: the named field, restriction, room, or conflicting
  entity that caused the refusal, so the desk can act on it.
- `traceId`: the hotel-local correlation id linking the error to the
  audit entry (`NFR-AUD-1`).

## 2. Conflict semantics (overbooking and double assignment)

- A booking refused for lack of sellable availability returns
  `CONFLICT` naming the room type and dates (`NFR-CON-1`); the
  reservation is not created.
- A check-in refused because the room was just taken returns
  `CONFLICT` naming the room (`NFR-CON-2`); the stay is not created.
- A reservation violating a stay restriction returns
  `STATE_ILLEGAL` naming the violated restriction (`FR-RTE-4`).
- A booking or check-in missing a hotel-mandatory guest field
  returns `VALIDATION_FAILED` naming the missing field
  (`FR-CUS-1`).
- A check-out with an open balance and no recorded approval returns
  `SETTLEMENT_REQUIRED` (`FR-BIL-7`).
- An out-of-role attempt returns `FORBIDDEN` (`NFR-SEC-1`).

## 3. Non-goals

- No retry or backoff policy is set here; transports are undecided
  (see `docs/technical/api-spec.md`, section 3).
- No on-screen audit log view in the MVP (recording only,
  `NFR-AUD-1`).

<!-- ao-role: architect -->
Role: architect · AO session hotel-mgmt-29
