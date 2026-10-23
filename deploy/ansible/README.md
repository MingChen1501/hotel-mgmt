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
ansible-playbook -i deploy/ansible/inventory.ini deploy/ansible/playbook.yaml \
  -e bundle_src=. -e hotel_config=deploy/config/hotel.json
```

Pre-flight (sizing 2 vCPU / 4 GB RAM / 50 GB disk, LAN reachability,
backup target, schema validation of the config set, first-secret
handover) and rollback stay procedural per deployment.md sections 5-6.
