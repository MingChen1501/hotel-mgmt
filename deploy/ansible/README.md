# Ansible baseline

Offline-friendly install baseline for the single-host layout (see
`docs/devops/deployment.md` sections 3-5). Uses only
`ansible.builtin` modules plus the `docker compose` CLI on the
target: no Galaxy collections required.

- `inventory.example.ini` — hosts. `[hotel]` is the single host
  (default sale). For the small-cluster variant, put the hosts in
  `[db]`, `[modules]`, and `[proxy]` and run the same playbook with
  `--limit`: inter-component endpoints use configuration/service
  names, so a container moves between hosts without image changes.
- `playbook.yaml` — copies the release bundle and the hotel's
  configuration set, starts database then modules then proxy
  (deployment.md start order), and runs the install health check
  (proxy reachable, each module answering through the proxy).

Run from the repo root against a filled-in inventory:

```sh
cp deploy/ansible/inventory.example.ini deploy/ansible/inventory.ini
${EDITOR:-vi} deploy/ansible/inventory.ini
cp deploy/config/hotel.example.json deploy/config/hotel.json
${EDITOR:-vi} deploy/config/hotel.json   # hotel's own values; never commit real hotel data
DB_PASSWORD=<per-sale secret> ADMIN_BOOT_SECRET=<per-sale secret> \
  script/preflight.sh --config deploy/config/hotel.json
DB_PASSWORD=<per-sale secret> ADMIN_BOOT_SECRET=<per-sale secret> \
  ansible-playbook -i deploy/ansible/inventory.ini deploy/ansible/playbook.yaml \
  -e bundle_src=. -e hotel_config=deploy/config/hotel.json
```

The playbook validates the set against the release schema
(`script/validate-hotel-config.sh`) before copying it, fails closed
while `DB_PASSWORD` or `ADMIN_BOOT_SECRET` still holds a dev default
(audit S3), then copies the release bundle, applies the per-hotel
configuration set, starts database then modules then proxy
(deployment.md start order), and runs the install health check (proxy
reachable, each module answering through the proxy). After the health
check it applies the set through Admin
(`script/apply-hotel-config.sh`), so the hotel's own identity and
standard times are in effect before handover. Migrations, the boot
seed, and the desk-loop proof run next via `script/e2e-desk-loop.sh`
(see `deploy/README.md`).

Pre-flight (sizing 2 vCPU / 4 GB RAM / 50 GB disk, LAN reachability,
backup target, schema validation of the config set, first-secret
handover) and rollback stay procedural per deployment.md sections 5-6.
