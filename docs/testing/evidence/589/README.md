# #589 Booking refusal for a room type with no rate price — evidence

Before/after side-by-side renders plus the lab reproduction record for
[issue #589](https://github.com/MingChen1501/hotel-mgmt/issues/589)
(owner decision: **no booking without rates** — a room type with no
rate price for the selected dates is not yet operational, so the
refusal names the missing price and the rates-setup action, and the
type is marked not open for booking). Left half of every image is the
pre-fix build (session root `c3a18eb`, master), right half is this
change.

## What each pair shows

| Pair | Before | After |
|---|---|---|
| `book-unpriced-refusal-en` | Quoting a vacant room type with no rate price shows only `No price exists for this room type and these dates.` — the cause (no rate price) and the next step (a manager sets the rates) are missing, and the picker still offers the type as if it were bookable. | The refusal reads `No rate price is set for this room type on the selected dates, so it is not open for booking yet.`, the stay card marks `Standard Double is not open for booking: no rate price is set for these dates. Ask a manager to set up its rates.`, and the picker option carries `not open for booking`. No confirm action exists (no quote), so no booking can be created. |
| `book-unpriced-refusal-vi` | Same gap in the VI locale: `Không có giá cho hạng phòng này trong các ngày đã chọn.` | The VI refusal and marking name the missing price and the rates-setup action: `Chưa có giá cho hạng phòng này trong các ngày đã chọn nên hạng phòng chưa mở bán.`, `Standard Double chưa mở bán: chưa có giá cho các ngày này. Hãy đề nghị quản lý thiết lập giá.`, picker suffix `chưa mở bán`. |
| `book-priced-quote-en` (regression half) | A room type with nightly prices quotes normally: two nightly lines, total `2,400 đ`, Confirm booking available. | Byte-identical quote and confirm path — the change touches only the no-price refusal, never the priced quote/confirm flow. |

Both locales are captured for the refusal; the priced pair is EN.

## Capture method

- Isolated compose lab `-p hotel-lab-879` (isolated project and
  volumes, proxy published on host port 8790 so the owner's live lab
  keeps port 80), `deploy/seed/boot.sql` applied after all module
  migrations, hotel set applied from `deploy/config/hotel.example.json`
  with a lab-only property code and name (`LAB879-001` / `Lab 879
  Hotel`) so the shell leaves the first-run wizard. The seed's one
  room type (`Standard Double`, two vacant-inspected rooms) carries no
  rate price, which is exactly the owner QA symptom.
- The fixed half is this branch's `app/dist` served by the lab proxy;
  the pre-fix half is the `c3a18eb` build of `app/dist` served from a
  loopback static server on port 8791 that proxies `/v1/*` to the same
  lab, so both halves read one backend (same technique as the #588
  evidence).
- Chromium (Playwright 1.64.1), 1280px viewport, element screenshots of
  the Book content section (`book-booking`), paired across a 20px
  gutter with a label bar. Each image is left = before, right = after.
- The priced pair is captured after seeding one rate plan
  (`LAB879-RACK`) with nightly prices for 2026-12-01/02 through the
  public contract (`UpsertRatePlan` then `UpsertRatePrice`), which is
  also the interim workaround documented in
  `docs/operations/runbook.md` section 6.

## Reproduction record (before the fix)

- Screen: `/app/book`, signed in as the owner.
- Steps: pick 2026-12-01 → 2026-12-03, choose the seeded `Standard
  Double` type, press Get price.
- Observed (master build): `POST /v1/rates/QuotePrice` answers `404
  NOT_FOUND` (no rate plan prices the type), the desk renders the bare
  sentence `No price exists for this room type and these dates.`, and
  nothing on the screen names the cause or the next step.
- After: the same request answers `404 NOT_FOUND` with
  `details.reason = "no_rate_plan"`; the desk renders the new wording,
  marks the type not open for booking in the stay card and the picker,
  and still offers no confirm action — the block is unchanged, only
  the diagnosis is now actionable.
