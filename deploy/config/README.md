# Per-hotel configuration

The release bundle is identical for every property; the hotel's
differences are carried in a per-hotel configuration set applied at
install time and re-applied at every upgrade (see
`docs/devops/deployment.md` section 2). This directory holds the
example set:

- `hotel.example.json` — example values for every section-2
  category: hotel identity and local settings, standard times, rooms
  and capacity, rate plans, stay policies (required guest fields,
  cancellation reasons and wording, no-show rule, open-balance
  check-out rule), charge items, tax and fee rules, stay
  restrictions, discounts, and the backup schedule with its
  retention floor.

To install: copy `hotel.example.json` to `hotel.json` (kept next to
the bundle on the host, never committed with real hotel data), fill
in the hotel's values, and validate it against the release bundle's
configuration schema before install (deployment.md section 5).

Secrets are never stored here and never in plaintext inside the
bundle. The first secrets for the three role accounts
(owner/manager/front-desk) are provisioned per the handover step in
deployment.md section 2: one unique initial secret per account,
handed over one-to-one, changed on first sign-in.
