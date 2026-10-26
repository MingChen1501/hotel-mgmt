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
// the existing `Intl.NumberFormat(catalogueLocale())` formatters in
// the views, so no formatter code changes.
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

export function hasMessage(key: string): boolean {
  return enCatalogue[key] !== undefined;
}

declare module 'vue' {
  interface ComponentCustomProperties {
    $t: typeof t;
  }
}
