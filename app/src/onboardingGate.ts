// Fresh-database gate for the first-run setup wizard (Refs #456,
// FR-DSK-7, LLD section 13.4). Both admin stores answer
// GetHotelConfig on an unconfigured database with the boot-seed
// placeholder values, including the placeholder hotel name: the
// in-memory store seeds it in its constructor
// (`services/admin/src/store.ts`), the Postgres store falls back to
// CONFIG_DEFAULTS (`services/admin/src/pgstore.ts`), mirroring
// `deploy/seed/boot.sql`. A placeholder name is not a configured
// hotel, so the gate treats a missing, blank, or placeholder name
// as unconfigured: first-run setup launches on a fresh database,
// while any real name keeps the seeded-desk path. No backend
// changes (issue #456 scope): the predicate lives here so the
// shell auto-launch (`App.vue`) and the wizard redirect
// (`OnboardingView.vue`) stay consistent.
export const SKELETON_HOTEL_NAME = 'Skeleton Hotel';

// The boot-seed placeholder is not a hotel name staff can keep:
// the gate above would read it back as unconfigured and relaunch
// the wizard on every visit, so step 1 rejects it (Refs #456) with
// the reserved-name sentence instead of persisting a setup loop.
export function isPlaceholderHotelName(name: string): boolean {
  return name.trim() === SKELETON_HOTEL_NAME;
}

export function configuredHotelName(values: unknown): string {
  if (typeof values !== 'object' || values === null) {
    return '';
  }
  const name = (values as Record<string, unknown>)['name'];
  if (typeof name !== 'string') {
    return '';
  }
  const trimmed = name.trim();
  if (trimmed === '' || isPlaceholderHotelName(trimmed)) {
    return '';
  }
  return trimmed;
}
