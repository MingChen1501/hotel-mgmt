# Deploy baseline

Single-host install baseline for hotel-mgmt (see
`docs/devops/deployment.md`): one reverse proxy, eight module
containers, one shared PostgreSQL engine (one schema per module),
and the on-premise backup staging area — all on one host by
default, or spread across hotel-LAN hosts in the small-cluster
variant.

## Layout

- `compose.yaml` — the single-host service map with the start order
  encoded (`depends_on`: database, then modules, then proxy).
- `nginx/nginx.conf` — Nginx entry: static frontend plus the
  versioned module routes. Convention: Nginx owns the
  `/v1/<contract>` prefix and strips it before proxying, so modules
  route operation paths (`/<Operation>`) and `/healthz` at their
  own root while the external contract stays
  `/v1/<contract>/<Operation>` (LLD section 0).
- `config/` — the per-hotel configuration set (example only). The
  bundle is identical for every property; only this set differs per
  sale, and secrets are never stored here.
- `ansible/` — dependency-free install playbook (only
  `ansible.builtin` plus the `docker compose` CLI on the target).

## Run locally

```sh
DB_PASSWORD=hotel-dev-only docker compose -f deploy/compose.yaml up -d --build
curl http://127.0.0.1/v1/reservations/healthz
```

Stop in reverse order (proxy, modules, database), per the upgrade
procedure in deployment.md section 4:

```sh
docker compose -f deploy/compose.yaml stop proxy
docker compose -f deploy/compose.yaml stop reservations rates reporting stay rooms guests billing admin
docker compose -f deploy/compose.yaml stop db
```

## Next slices (out of skeleton scope)

Monitoring (Prometheus scrape of module `/metrics` plus on-prem
Grafana), TLS/LAN hardening, and offline image packaging land with
the slices that introduce `/metrics` and the release bundle; the
topology positions are fixed in
`docs/architecture/system-architecture.md`.
