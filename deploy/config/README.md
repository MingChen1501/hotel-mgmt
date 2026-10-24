# Per-hotel configuration

The release bundle is identical for every property; the hotel's
differences are carried in a per-hotel configuration set applied at
install time and re-applied at every upgrade (see
`docs/devops/deployment.md` section 2). This directory holds the
example set plus the release bundle's configuration schema:

- `hotel.example.json` — example values for every section-2
  category: hotel identity and local settings, standard times, rooms
  and capacity, rate plans, stay policies (required guest fields,
  cancellation reasons and wording, no-show rule, open-balance
  check-out rule), charge items, tax and fee rules, stay
  restrictions, discounts, and the backup schedule with its
  retention floor.
- `schema.json` — the validation shape for the set. Enforcement
  lives in `script/validate-hotel-config.sh`, which checks the full
  set (identity present and never the EXAMPLE placeholder, standard
  times well-formed, room/rate/charge sections non-empty with
  references that resolve, stay policies complete, retention floor
  honoured) and fails closed on any default, placeholder, or
  malformed value.

## Install path with a hotel config (issue #158)

From the repo root, with the stack's secrets ready:

```sh
# 1. Copy the example and fill in the hotel's own values.
cp deploy/config/hotel.example.json deploy/config/hotel.json
${EDITOR:-vi} deploy/config/hotel.json   # hotel's own values; never commit real hotel data

# 2. Validate before anything is applied (deployment.md section 5).
# Fails closed on the EXAMPLE-001 placeholder and on any missing or
# malformed value.
script/validate-hotel-config.sh --config deploy/config/hotel.json

# 3. Pre-flight gates the install (secrets, sizing, backup target).
DB_PASSWORD=<per-sale secret> ADMIN_BOOT_SECRET=<per-sale secret> \
  script/preflight.sh --config deploy/config/hotel.json

# 4. Install (Ansible validates again before copying, then applies
# the set through Admin after the health check), or bring up the
# container lab directly:
DB_PASSWORD=<per-sale secret> ADMIN_BOOT_SECRET=<per-sale secret> \
  ansible-playbook -i deploy/ansible/inventory.ini deploy/ansible/playbook.yaml \
  -e bundle_src=. -e hotel_config=deploy/config/hotel.json

# 5. With the stack up, apply (or re-apply) the set at any time.
# Idempotent: the same set yields the same values, so upgrades
# re-apply reproducibly. Verifies the hotel's identity and standard
# times are in effect via GetHotelConfig.
DB_PASSWORD=<per-sale secret> ADMIN_BOOT_SECRET=<per-sale secret> \
  script/apply-hotel-config.sh --config deploy/config/hotel.json
```

The desk-loop proof (`script/e2e-desk-loop.sh`) applies the set
automatically when `deploy/config/hotel.json` exists and asserts
the hotel's own values are in effect (FR-ADM-1, FR-ADM-4,
NFR-DEP-1).

Secrets are never stored here and never in plaintext inside the
bundle. The first secrets for the three role accounts
(owner/manager/front-desk) are provisioned per the handover step in
deployment.md section 2: one unique initial secret per account,
handed over one-to-one, changed on first sign-in.
