// Catalogue layer for the /app/ migration shell (Refs #292, ADR-0003).
//
// The canonical catalogues (`messages/en.json`, `messages/vi.json`)
// are imported as static modules, so Vite bundles them into `dist/`
// at build time: the Vue app serves every string offline over the
// LAN with no CDN and no runtime fetch. There is deliberately no
// vendored copy inside `app/` — the single source of truth stays
// `messages/`, and this module is a read-only consumer (it owns no
// keys and edits none). The default locale stays `en`, so behaviour
// is unchanged until staff switch (Refs #339).
//
// `t()` preserves the `DeskMessages.msg(key, params, fallback)`
// semantics from `frontend/messages.js` exactly:
// - A known key resolves in the active locale to its pattern with
//   `{param}` placeholders substituted from `params`; placeholders
//   with no matching param are left intact.
// - A key missing from the active locale falls back to the default
//   `en` pattern before the explicit `fallback` is considered, so a
//   complete `vi` catalogue never surfaces a missing-key marker in
//   normal use.
// - A key unknown in both locales returns the explicit `fallback`
//   when given, else `"message-missing:<key>"`.
// Behaviour never branches on resolved wording: error paths switch
// on envelope codes, as before.
//
// Locale state (Refs #339): `localeTag` is the single reactive
// source — templates that call `t()` re-render on switch because
// `t()` reads it during render. The choice persists in
// `localStorage` under `hotel-mgmt.desk.locale` (locale only, never
// auth/session data, which stays in `sessionStorage` per the session
// store). Number/currency grouping follows the active locale through
// the shared display formatters below (`formatVnd`,
// `formatDeskDate`, `formatBusinessDate`) plus the per-view
// `Intl.NumberFormat(catalogueLocale())` helpers.
import { ref } from 'vue';
import enDocument from '../../../messages/en.json';
import viDocument from '../../../messages/vi.json';

interface CatalogueDocument {
  locale: string;
  messages: Record<string, string>;
}

export type LocaleTag = 'en' | 'vi';

export const SUPPORTED_LOCALES: readonly LocaleTag[] = ['en', 'vi'];
export const DEFAULT_LOCALE: LocaleTag = 'en';
export const LOCALE_STORAGE_KEY = 'hotel-mgmt.desk.locale';

const enCatalogue: Record<string, string> = (enDocument as CatalogueDocument).messages;
const viCatalogue: Record<string, string> = (viDocument as CatalogueDocument).messages;

const catalogues: Record<LocaleTag, Record<string, string>> = {
  en: enCatalogue,
  vi: viCatalogue,
};

function readStoredLocale(): LocaleTag {
  try {
    return localStorage.getItem(LOCALE_STORAGE_KEY) === 'vi' ? 'vi' : DEFAULT_LOCALE;
  } catch {
    // Storage unavailable (private mode): fall back to the default
    // locale; the desk still works for this session.
    return DEFAULT_LOCALE;
  }
}

// Reactive active locale (module singleton): every `t()` call in a
// template reads it, so switching re-renders all key screens.
export const localeTag = ref<LocaleTag>(readStoredLocale());

export function setLocale(tag: string): void {
  const next: LocaleTag = tag === 'vi' ? 'vi' : DEFAULT_LOCALE;
  localeTag.value = next;
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, next);
  } catch {
    // Storage unavailable: keep the in-memory locale; the desk still
    // works until reload.
  }
}

export type MessageParams = Record<string, unknown>;

const PLACEHOLDER_PATTERN = /\{([A-Za-z0-9_]+)\}/g;

function substitute(pattern: string, params: MessageParams): string {
  return pattern.replace(PLACEHOLDER_PATTERN, (match, name: string) =>
    params[name] === undefined ? match : String(params[name]),
  );
}

export function t(key: string, params: MessageParams = {}, fallback?: string): string {
  const pattern = catalogues[localeTag.value][key] ?? enCatalogue[key];
  if (pattern === undefined) {
    return fallback === undefined ? `message-missing:${key}` : fallback;
  }
  return substitute(pattern, params);
}

export function catalogueLocale(): string {
  return localeTag.value;
}

// Business-date display form (Refs #503, FR-DSK-11, BR-43): pure
// derivation from the canonical ISO `YYYY-MM-DD` ref to the locale
// long-weekday form (VI `Thứ Tư, 28/10/2026`, EN
// `Wednesday, 10/28/2026` for 2026-10-28). The parts are built in
// local time so the hotel's calendar day never shifts, and any
// unparseable input or formatter failure falls back to the canonical
// value (today's rendering) so the screen stays usable. No catalogue
// keys are involved, so catalogue coverage is untouched.
//
// Shared calendar-date parse: the ISO `YYYY-MM-DD` shape only, built
// in local time and rejected when any part would roll over (2026-02-30,
// 2026-13-01), so both desk display forms share one validation path.
function parseCalendarDate(canonical: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(canonical);
  if (!match) {
    return null;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (
    Number.isNaN(date.getTime()) ||
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  return date;
}

export function formatBusinessDate(canonical: string, locale: LocaleTag): string {
  const date = parseCalendarDate(canonical);
  if (date === null) {
    return canonical;
  }
  try {
    return new Intl.DateTimeFormat(locale, {
      weekday: 'long',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(date);
  } catch {
    return canonical;
  }
}

// Desk money display form (Refs #565, AC-DSK-5, G-BK-2/G-FO-2): the
// owner boards draw VND amounts in the design shape — locale
// grouping, no decimals, and the `đ` suffix (`1.200.000 đ` in VI,
// `1,200,000 đ` in EN). Amounts arrive in minor units; this is
// presentation only, so the stored value never changes.
export function formatVnd(minor: number): string {
  const amount = new Intl.NumberFormat(catalogueLocale(), {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(minor / 100);
  return `${amount} đ`;
}

// Desk calendar-date display form (Refs #565, G-BK-2): the
// canonical ISO `YYYY-MM-DD` ref renders as the design desk date
// `dd/mm/yyyy` (`08/12/2026` for 2026-12-08) in both desk locales,
// so quote lines never show a raw ISO string. Unparseable input
// falls back to the canonical value, same as the business-date
// form above. The locale-aware long form stays `formatBusinessDate`.
export function formatDeskDate(canonical: string): string {
  const date = parseCalendarDate(canonical);
  if (date === null) {
    return canonical;
  }
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${day}/${month}/${date.getFullYear()}`;
}

export function hasMessage(key: string): boolean {
  return enCatalogue[key] !== undefined;
}

declare module 'vue' {
  interface ComponentCustomProperties {
    $t: typeof t;
  }
}
