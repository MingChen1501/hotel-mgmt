# Behaviour sequence diagrams — booking, check-in/out, folio and housekeeping

Status: active. Business-side time-ordered depiction of the MVP
behaviours, owned by `business-analyst`. This document adds no new
behaviour: every step cites the FR or NFR that already requires it in
`docs/requirements/mvp-requirements.md`, and every configurable step
names the `FR-CUS-*` control from requirements section 3.1 that governs
it. Fixed lifecycle order (§3.2) is never configurable. States cited
below are those of `docs/architecture/state-machine.md`; entity
relationships are those of `docs/architecture/erd.md`. Where the
behaviour docs disagree, section 6 lists the conflict and this document
follows the FR.

Terminology follows `docs/requirements/domain-consistency-audit.md`
(one term per concept): **reservation** for the stored record
(**booking** only for the act of creating one); **room** for the
physical sellable unit and **room type** for the priced category;
**folio** for the running account per stay, **invoice** for the final
printed account presented at check-out, **receipt** for the proof of
one payment; **guest** for the person staying; **charge item** for a
hotel-defined sellable entity and **charge** for a posted folio line;
**price basis** for what a reservation was quoted from; **hotel** for
the business and **property** for deployment/data-isolation context.

Legend used on every diagram: `[FR-X-n]` is the requiring FR;
`[CUS: FR-CUS-n]` marks a step whose content is per-hotel configurable
(requirements §3.1); `[FIXED §3.2]` marks lifecycle order no hotel may
change. Refusals name their cause per `docs/technical/error-handling.md`.

## 1. Availability search and reservation creation

Search by date range, then hold availability, create the reservation,
and confirm it. The overbooking check runs atomically at creation;
the conflict path is drawn, not only described.

```mermaid
sequenceDiagram
    participant Staff as Front-desk staff
    participant Avail as Availability view
    participant Res as Reservation record
    participant GuestRec as Guest profile
    Staff->>GuestRec: Identify guest [FR-GST-1, FR-GST-3]
    GuestRec-->>Staff: Preferences and notes shown before confirm [FR-GST-2; CUS: FR-CUS-1 fields shown]
    Staff->>Avail: Search sellable rooms by room type and date range [FR-RTE-2]
    Avail-->>Staff: Counts excluding occupied, blocked, already-reserved [FR-RTE-2, FR-RMS-3]
    Staff->>Res: Enter dates, room type, guest, price basis [FR-RES-1; CUS: FR-CUS-1 required fields enforced]
    Res->>Res: Check stay restrictions for the dates [FR-RTE-4; CUS: stay restrictions per §3.1]
    alt Restriction violated
        Res-->>Staff: Reservation refused, restriction named [FR-RTE-4]
    else Restrictions pass
        Res->>Res: Atomic overbooking check: confirmed + in-house vs sellable rooms of the type [NFR-CON-1; FIXED §3.2]
        alt No sellable unit left or simultaneous booking won first
            Res-->>Staff: Reservation refused, room type and dates named as conflict [NFR-CON-1]
        else Sellable unit available
            Res->>Res: Record reservation with price basis from rate plan in force [FR-RES-1, FR-RTE-5; CUS: FR-RTE-3 discount may adjust, FR-CUS-2 times and wording shown]
            Res-->>Staff: Reservation exists with unique reference, appears on calendar [FR-RES-1, FR-RES-5; FIXED §3.2: state confirmed]
            Staff->>GuestRec: Produce confirmation to share with guest [FR-GST-4; CUS: FR-CUS-2 hotel wording]
        end
    end
```

Notes: a walk-in booking is the same flow with today as arrival and
lands ready for immediate check-in on today's arrivals list
(`FR-RES-4`, `FR-FDK-5`). Modifications before check-in reprice from
the rate plan in force (`FR-RES-2`); cancellation needs a reason from
the hotel's list and releases the held availability (`FR-RES-3`,
configurable list per §3.1); an unarrived reservation past its arrival
date is marked no-show with history kept (`FR-RES-6`, hotel no-show
rule per §3.1).

## 2. Check-in and check-out

Check-in registers arrival against a ready room; a room move keeps the
stay in house. Check-out reviews the folio, settles it or records an
approved open balance, then releases the room as vacant-dirty.

```mermaid
sequenceDiagram
    participant Staff as Front-desk staff
    participant Stay as Stay record
    participant Rooms as Room inventory
    participant Folio as Folio
    Staff->>Stay: Open arrivals list for today [FR-FDK-5; CUS: FR-CUS-2 hotel times]
    Staff->>Rooms: Pick a vacant, clean, inspected room of the booked type [FR-FDK-1, FR-RMS-2]
    Rooms->>Rooms: Atomic assignment check on the room [NFR-CON-2]
    alt Room just taken by a simultaneous check-in
        Rooms-->>Staff: Check-in refused, room conflict named [NFR-CON-2]
    else Room free
        Staff->>Stay: Check guest in against the room [FR-FDK-1; CUS: FR-CUS-1 check-in fields enforced; FIXED §3.2: confirmed to checked-in]
        Stay->>Rooms: Room state becomes occupied [FR-FDK-1]
    end
    opt Room move mid-stay [FR-FDK-3]
        Staff->>Rooms: Pick a vacant, clean, inspected room [FR-FDK-3]
        Staff->>Stay: Move guest; stay stays in house with history [FR-FDK-3; FIXED §3.2: no state change]
        Stay->>Rooms: Old room becomes vacant and dirty [FR-FDK-3]
    end
    opt Early arrival or late departure recorded [FR-FDK-4]
        Staff->>Stay: Record actual times against the stay [FR-FDK-4; CUS: FR-CUS-2 hotel times]
    end
    Staff->>Folio: Review folio before check-out [FR-BIL-1]
    alt Folio has an open balance
        Staff->>Folio: Settle by recording payment [FR-BIL-3] or record authorised approval [FR-BIL-7; CUS: hotel approval rule per §3.1]
        alt Neither payment nor approval recorded
            Folio-->>Staff: Check-out refused until settled or approved [FR-BIL-7]
        end
    end
    Staff->>Stay: Check guest out; present the invoice [FR-FDK-2, FR-BIL-4; FIXED §3.2: checked-in to closed]
    Stay->>Rooms: Room becomes vacant and dirty [FR-FDK-2]
```

## 3. Folio and billing

Post defined charge items, review the folio, settle it, and issue the
invoice and receipts. Posting an undefined item is refused; the refusal
path is drawn, not only described.

```mermaid
sequenceDiagram
    participant Staff as Front-desk staff
    participant Folio as Folio (one per stay)
    participant Manager as Manager
    Staff->>Folio: Open the stay folio [FR-BIL-1; FIXED §3.2: one folio per stay]
    Staff->>Folio: Post nightly room charge or hotel-defined charge item [FR-BIL-2; CUS: FR-CUS-3 hotel charge items]
    alt Item not defined by the hotel
        Folio-->>Staff: Charge refused, only defined items can be posted [FR-BIL-2, FR-CUS-3]
    else Item defined
        Folio->>Folio: Line shows item, amount, posting time; taxes and fees derived [FR-BIL-2, FR-BIL-5; CUS: FR-BIL-5 hotel tax and fee rules]
    end
    Staff->>Folio: Review folio with running balance [FR-BIL-1]
    Staff->>Folio: Record cash or card payment [FR-BIL-3; FIXED §3.2: cash and card only]
    Folio->>Folio: Payment shown with method and time; balance decreases [FR-BIL-3]
    Staff->>Folio: Produce invoice and per-payment receipts [FR-BIL-4]
    Folio-->>Staff: Invoice matches folio lines and balance; each receipt matches one payment [FR-BIL-4]
    Manager->>Folio: Run day-close totals of charges and payments per method [FR-BIL-6]
```

## 4. Housekeeping loop and front-desk handoff

Rooms walk vacant-dirty to clean to inspected before they are
assignable; out-of-order is a date-ranged block. The handoff with the
front desk is drawn in both directions.

```mermaid
sequenceDiagram
    participant Desk as Front-desk staff
    participant Rooms as Room inventory
    participant HK as Housekeeping staff
    participant Manager as Manager
    Desk->>Rooms: Check-out or room move releases room as vacant and dirty [FR-FDK-2, FR-FDK-3]
    Rooms-->>HK: Dirty rooms visible in housekeeping report [FR-RPT-4]
    HK->>Rooms: Mark room clean when work completes [FR-RMS-2]
    Rooms-->>HK: Clean-but-uninspected rooms visible for inspection [FR-RPT-4]
    HK->>Rooms: Mark room inspected [FR-RMS-2; FIXED §3.2: dirty to clean to inspected]
    Rooms-->>Desk: Inspected vacant rooms offered for check-in assignment [FR-RMS-2, FR-FDK-1]
    Desk->>Rooms: Assign inspected room at check-in [FR-FDK-1]
    opt Out-of-order block [FR-RMS-3]
        Manager->>Rooms: Block room for a date range with recorded reason [FR-RMS-3]
        Rooms-->>Desk: Blocked dates excluded from availability and check-in [FR-RMS-3, FR-RTE-2]
    end
    Desk->>Rooms: View live status of every room [FR-RMS-1]
```

Every status change records who made it and when (`NFR-AUD-1`).
Rooms needing cleaning or inspection appear in the housekeeping
report; inspected and out-of-order rooms do not (`FR-RPT-4`).

## 5. Per-hotel customisation overlay

For each flow above, which steps are configurable (§3.1, via the named
`FR-CUS`/`FR` control) and which order is fixed (§3.2).

| Flow step | Configurable content (control) | Fixed order (not configurable) |
|---|---|---|
| Guest fields at booking and check-in | Which fields are mandatory; refusal names the field (`FR-CUS-1`) | — |
| Standard times shown and enforced | Hotel check-in/check-out times (`FR-CUS-2`, `FR-ADM-4`) | — |
| Cancellation wording and reasons | Hotel wording (`FR-CUS-2`); hotel's reason list (`FR-RES-3`) | Cancel only before check-in |
| No-show handling | Whether a charge is kept and which reason list applies (`FR-RES-6`) | Only past arrival date; history kept |
| Charge items posted | Hotel's own items with names and prices (`FR-CUS-3`); only defined items postable | One folio per stay |
| Taxes and fees derived | Hotel tax and fee rules (`FR-BIL-5`) | — |
| Stay restrictions enforced | Minimum stay, closed-to-arrival days (`FR-RTE-4`) | — |
| Discounts applied | Named discounts kept by name (`FR-RTE-3`) | Quoted price basis unchanged unless recalculated (`FR-RTE-5`) |
| Open-balance check-out | Whether approval is needed and which role may approve (`FR-BIL-7`) | Lifecycle confirmed to checked-in to closed, never skipped or reordered |
| Room assignment and moves | Room attributes used at assignment (`FR-RMS-4`) | Only inspected vacant rooms assigned; moves keep the stay in house |
| Housekeeping progression | — (no configuration point) | Dirty to clean to inspected; check-out releases vacant-dirty |

Owner or manager changes to any §3.1 item apply at once with no code
changes, and each change records who made it and when (`NFR-AUD-1`,
requirements §3.3).

## 6. Consistency statement and conflicts

Each step above was checked against `docs/architecture/state-machine.md`
(booking: confirmed to checked-in to closed, with cancelled and
no-show branches; room: vacant-dirty to vacant-clean to
vacant-inspected to occupied), `docs/architecture/erd.md` (one folio
per stay; a stay links one room at a time; sellable count excludes
occupied, blocked, already-reserved), and the FR/NFR wording. No step
contradicts them except the finding below, which is listed, not hidden:

- F-SEQ-1 (wording, from audit C-5): `NFR-CON-1` in
  `docs/requirements/mvp-requirements.md` speaks of booking "the last
  sellable room or bed", but beds exist only as room/room-type
  attributes — no story or FR sells a bed separately. This document
  follows the domain model throughout: the sellable unit is the room,
  and diagram 1 checks room-type sellability only. Recommended
  resolution: delete "or bed" from `NFR-CON-1` (audit fix F-5).

Path note: issue #43 asked for `docs/architecture/sequence-diagrams.md`;
behaviour content belongs to requirements, so this depiction lives at
`docs/requirements/sequence-diagrams.md` and the document index points
here.
