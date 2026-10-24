// Resolves user-visible strings from the shared message catalogue
// (messages/en.json) for NFR-I18N-1, per api-spec section 1. The
// default-locale copy is read from the file beside this module at
// startup; setting MESSAGE_CATALOGUE_PATH points the loader at a
// live file instead (catalogue updates without a rebuild). Patterns
// use {name} placeholders substituted verbatim. Integer values pass
// through formatNumber so digit grouping follows the active locale.
// Behaviour never branches on resolved wording: callers switch on
// envelope codes, not messages.
import { readFileSync } from "node:fs";
import { join } from "node:path";

interface FileCatalogue {
  locale: string;
  messages: Record<string, string>;
}

function parse(raw: string): FileCatalogue {
  const file = JSON.parse(raw) as FileCatalogue;
  if (typeof file.locale !== "string" || file.locale === "" || typeof file.messages !== "object" || file.messages === null) {
    throw new Error("messages: catalogue has no locale or no messages");
  }
  return file;
}

function loadDefault(): FileCatalogue {
  const override = process.env["MESSAGE_CATALOGUE_PATH"];
  if (override !== undefined && override.trim() !== "") {
    return parse(readFileSync(override, "utf8"));
  }
  return parse(readFileSync(join(__dirname, "messages.en.json"), "utf8"));
}

let active: FileCatalogue | null = null;

function catalogue(): FileCatalogue {
  if (active === null) {
    active = loadDefault();
  }
  return active;
}

/** For tests only: load a catalogue file without touching the process default. */
export function loadCatalogue(path: string): { locale: string; messages: Record<string, string> } {
  return parse(readFileSync(path, "utf8"));
}

/** The active catalogue locale tag (for example "en"). */
export function catalogueLocale(): string {
  return catalogue().locale;
}

/** Render one catalogue pattern with the given params. Unknown keys
 * render a visible marker so a missing key can never silently pass
 * as a blank desk message; the coverage script fails the build on
 * unknown keys before they reach production. */
export function msg(key: string, params: Record<string, string | number> = {}): string {
  const pattern = catalogue().messages[key];
  if (pattern === undefined) {
    return `message-missing:${key}`;
  }
  return pattern.replace(/\{([A-Za-z0-9_]+)\}/g, (match, name: string) =>
    params[name] === undefined ? match : String(params[name]),
  );
}

/** Active locale override for formatting (MESSAGE_LOCALE), defaulting
 * to the catalogue locale. Message translations are NOT read from
 * here: only the default locale ships; this selects locale data for
 * dates, numbers, and currency. */
export function activeLocale(): string {
  const override = process.env["MESSAGE_LOCALE"];
  return override === undefined || override.trim() === "" ? catalogueLocale() : override;
}

/** Integer with the active locale's digit grouping ("1,234,567" in en). */
export function formatNumber(n: number, locale: string = activeLocale()): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(n);
}

/** Minor-unit amount with the active locale's grouping and decimal
 * mark plus the currency code, which travels with the value (amounts
 * stay integers in minor units on the wire). */
export function formatMoney(minor: number, currencyCode: string, locale: string = activeLocale()): string {
  const amount = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(minor / 100);
  return locale.toLowerCase() === "en" ? `${currencyCode} ${amount}` : `${amount} ${currencyCode}`;
}

/** Calendar date in the active locale's order ("Oct 24, 2026" in en). */
export function formatDate(value: Date, locale: string = activeLocale()): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(value);
}
