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
- `nginx/nginx.conf` — Nginx entry: static desk UI plus the
  versioned module routes. Convention: the external contract path
  `/v1/<contract>/<Operation>` passes through to the modules
  unchanged (the services route the full versioned path at their
  own root per the transport rule in
  `docs/technical/integration.md`); only the install health check
  `/v1/<contract>/healthz` maps to each module's root `/healthz`.
- `config/` — the per-hotel configuration set (example only). The
  bundle is identical for every property; only this set differs per
  sale, and secrets are never stored here.
- `ansible/` — dependency-free install playbook (only
  `ansible.builtin` plus the `docker compose` CLI on the target).

## Install on a fresh host

Single-host default sale, following `docs/devops/deployment.md`
[section 3](../docs/devops/deployment.md) (installer path proven by issue #153):

```sh
# 0. From the repo root, with the hotel's configuration set ready.
cp deploy/config/hotel.example.json deploy/config/hotel.json
${EDITOR:-vi} deploy/config/hotel.json   # hotel's own values; never commit real hotel data

# 1-3. One command: pre-flight (fails closed on default secrets and
# invalid sets) then the install proof (desk loop end to end, first
# backup, restore drill with desk-state verification), leaving the
# stack up for handover:
DB_PASSWORD=<per-sale secret> ADMIN_BOOT_SECRET=<per-sale secret> \
  script/install.sh --config deploy/config/hotel.json
# Evidence: the install log (pre-flight PASSED, desk-loop proof
# SUCCEEDED), the first backup report in ./backup-staging, and the
# restore-drill report beside it. Record the handover in
# docs/operations/pilot-exit-checklist.md.

# Installer alternatives for the same steps:
# 2a. With Ansible (offline-friendly; only ansible.builtin plus the
# docker compose CLI on the target):
cp deploy/ansible/inventory.example.ini deploy/ansible/inventory.ini
${EDITOR:-vi} deploy/ansible/inventory.ini
DB_PASSWORD=<per-sale secret> ADMIN_BOOT_SECRET=<per-sale secret> \
  ansible-playbook -i deploy/ansible/inventory.ini deploy/ansible/playbook.yaml \
  -e bundle_src=. -e hotel_config=deploy/config/hotel.json
# The playbook validates the set against the release schema before
# copying it, then applies it through Admin after the install health
# check (see deploy/config/README.md).

# 2b. Step by step with compose (container lab):
DB_PASSWORD=<per-sale secret> ADMIN_BOOT_SECRET=<per-sale secret> \
  script/preflight.sh --config deploy/config/hotel.json
DB_PASSWORD=<per-sale secret> ADMIN_BOOT_SECRET=<per-sale secret> \
  docker compose -f deploy/compose.yaml up -d --build
# ...then apply the set, run the health check, and prove the desk:
DB_PASSWORD=<per-sale secret> ADMIN_BOOT_SECRET=<per-sale secret> \
  script/e2e-desk-loop.sh --keep-up
```

Daily operation afterwards is two scripts plus the runbook
(`docs/operations/runbook.md`): `script/backup.sh` writes each
backup with its visible success report, and `script/restore.sh
--verify-only` is the non-disruptive restore drill
(`docs/operations/backup-dr.md` [section 4](../docs/operations/backup-dr.md), RTO 4 hours).

## Run locally (container lab)

Lab bring-up uses throwaway non-default secrets throughout: the
pre-flight and the desk loop both fail closed on dev defaults
(audit S3), so even the lab sets its own values.

```sh
export DB_PASSWORD=lab-db-secret-01 ADMIN_BOOT_SECRET=lab-owner-boot-02
docker compose -f deploy/compose.yaml up -d --build
curl http://127.0.0.1/v1/reservations/healthz
script/e2e-desk-loop.sh --staging-dir ./backup-staging
```

Stop in reverse order (proxy, modules, database), per the upgrade
procedure in deployment.md [section 4](../docs/devops/deployment.md):

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
