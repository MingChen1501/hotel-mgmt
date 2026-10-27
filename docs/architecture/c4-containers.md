# C4 — containers and components

Status: active (Closes #193). Owned by `architect`. The deployable
containers for one MVP installation and the as-built component shape
inside each service. Companion to the deployment view
(`docs/architecture/system-architecture.md` [section 1](system-architecture.md), which shows where
these containers run); module responsibilities live in
`docs/architecture/hld.md`, per-service design in
`docs/architecture/services/*.md`. Every node/edge cites its source;
nothing here is invented.

## 1. Container diagram

Sources: container inventory from `services/*/` on disk and
`deploy/compose.yaml` (service names, images, `PORT`,
`DATABASE_URL`); proxy edges from `deploy/nginx/nginx.conf`
(upstreams + `/v1/<contract>/` locations); database edges from the
per-service `DATABASE_URL: ...@db:5432/hotel`; sync/async edge styles
from `docs/technical/integration.md` (transport rules).

```mermaid
flowchart TB
    DESK([Desk clients<br/>staff browsers, hotel LAN<br/>NFR-SEC-1]) -->|HTTPS :80, /v1 routes<br/>nginx.conf locations| PROXY[Nginx proxy<br/>static SPA + reverse proxy<br/>compose.yaml: only published port<br/>nginx.conf: 8 upstreams]
    PROXY -->|sync REST, versioned contract paths<br/>integration.md transport rule| RES[reservations :8081<br/>Go handler/service/store<br/>services/reservations/]
    PROXY -->|sync| STAY[stay :8084<br/>Node flat src/<br/>services/stay/]
    PROXY -->|sync| ROOMS[rooms :8085<br/>Node flat src/<br/>services/rooms/]
    PROXY -->|sync| RATES[rates :8082<br/>Go handler/store<br/>services/rates/]
    PROXY -->|sync| GUESTS[guests :8086<br/>Node flat src/<br/>services/guests/]
    PROXY -->|sync| BILL[billing :8087<br/>Java web/service/repo<br/>services/billing/]
    PROXY -->|sync| RPT[reporting :8083<br/>Go handler/service/store<br/>read API + event consumer<br/>services/reporting/]
    PROXY -->|sync| ADMIN[admin :8088<br/>Node flat src/<br/>config CRUD + identity sessions<br/>services/admin/]
    RES -->|TCP, own schema only<br/>DATABASE_URL @db:5432| DB[(PostgreSQL :5432<br/>one engine, 8 schemas<br/>compose.yaml: db)]
    STAY -->|own schema| DB
    ROOMS -->|own schema| DB
    RATES -->|own schema| DB
    GUESTS -->|own schema| DB
    BILL -->|own schema, DB_USER/DB_PASSWORD| DB
    RPT -->|own schema| DB
    ADMIN -->|own schema, boot identity<br/>ADMIN_BOOT_IDENTITY| DB
    RES -.->|async outbox events<br/>integration.md sections C9, 7| RPT
    STAY -.->|async outbox events| RPT
    ROOMS -.->|async outbox events| RPT
    RATES -.->|async outbox events| RPT
    GUESTS -.->|async outbox events| RPT
    BILL -.->|async outbox events| RPT
    ADMIN -.->|sync GetHotelConfig at startup<br/>cached offline-first, LLD section 0| RES
    ADMIN -.->|sync GetHotelConfig| STAY
    ADMIN -.->|sync GetHotelConfig| ROOMS
    ADMIN -.->|sync GetHotelConfig| RATES
    ADMIN -.->|sync GetHotelConfig| GUESTS
    ADMIN -.->|sync GetHotelConfig| BILL
    ADMIN -.->|sync GetHotelConfig| RPT
```

Admin calls no sibling at runtime (dependency sink in reverse —
`docs/architecture/services/admin.md` [section 5](services/admin.md)); the arrows above are
other modules reading Admin, not Admin calling out. Reporting reads
no other module's store (its only input is the event log —
`docs/architecture/services/reporting.md` [section 5](services/reporting.md)). No component calls
outside the property in the MVP (no OTA, payment, or accounting
integrations — `system-architecture.md` [section 1](system-architecture.md)).

## 2. Component diagram (as-built layering per stack)

Sources: LLD [sections 1–8](lld.md) + the 8 service pages section 2 (layer→file tables).
Three shapes, all intentional per ADR-0002 (accepted 2026-10-24,
Closes #188):

```mermaid
flowchart LR
    subgraph GO[Go × 3 — reservations, rates, reporting<br/>internal/handler + service + store<br/>LLD sections 1, 4, 7]
        GH[handler<br/>HTTP + envelope] --> GS[service<br/>rules + seams] --> GST[store<br/>SQL + outbox INSERT]
    end
    subgraph NODE[Node × 4 — stay, rooms, guests, admin<br/>flat src/ files<br/>LLD sections 2, 3, 5, 8]
        NS[server.ts<br/>HTTP + routes] --> NP[pgstore.ts / store.ts<br/>SQL + outbox] --> NE[errors.ts<br/>shared envelope]
    end
    subgraph JAVA[Java × 1 — billing<br/>web + service + repo<br/>LLD section 6]
        JW[web<br/>controllers + ApiException] --> JV[service<br/>BillingService + outbox] --> JR[repo<br/>BillingRepository SQL]
    end
```

Contract edges between components are the versioned REST operations
and the `contracts/events/` JSON Schemas
(`docs/technical/integration.md` sections C9, 7; event flow in
`docs/architecture/event-flow.md`). Each service's `contract-tests/`
directory pins its side of those contracts.

<!-- ao-role: architect -->
Role: architect · AO session hotel-mgmt-257
