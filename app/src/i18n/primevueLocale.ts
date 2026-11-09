// PrimeVue locale bridge (Refs #581, G-BK-1).
//
// The Book date pickers must follow the APP locale (VI `dd/mm/yyyy`,
// EN `mm/dd/yyyy`), never the browser UI language. PrimeVue reads its
// calendar wording from `$primevue.config.locale`, so the app locale is
// mirrored into that config here and re-applied on every locale switch.
// Day and month names are generated from `Intl` for the active locale
// instead of being hand-copied into a second catalogue; the only
// catalogue-owned strings remain the field label and the placeholder.
//
// `dateFormat` (the typed/parsed form) is derived from the same table
// as the locale, so the field text and the parsed calendar day cannot
// drift apart. The opened calendar's month/weekday wording comes from
// the generated `monthNames` / `dayNames*` arrays instead — PrimeVue
// does not read `dateFormat` for the header.
//
// Deliberate #581 boundary: the overlay's *accessibility* strings
// (`chooseDate`, `prevMonth`, `nextMonth`, `today`, `clear`, …) stay
// the PrimeVue English defaults from `defaultOptions.locale`. Every
// visible string on the field is catalogue-owned; mapping these
// screen-reader labels needs catalogue keys of their own, which is a
// spec-owned slice filed as the #581 follow-up rather than invented
// here.
import { watch } from 'vue';
import type { App } from 'vue';
import { defaultOptions, usePrimeVue } from 'primevue/config';
import type { PrimeVueLocaleOptions } from 'primevue/config';
import { localeTag, type LocaleTag } from './index';

const WEEKDAY_OFFSETS = [0, 1, 2, 3, 4, 5, 6];
// 2024-01-07 is a Sunday; noon avoids any local DST edge at midnight.
const WEEKDAY_ORIGIN = new Date(2024, 0, 7, 12);

function weekdayNames(tag: LocaleTag, style: 'long' | 'short' | 'narrow'): string[] {
  const format = new Intl.DateTimeFormat(tag, { weekday: style });
  return WEEKDAY_OFFSETS.map((offset) =>
    format.format(new Date(WEEKDAY_ORIGIN.getFullYear(), WEEKDAY_ORIGIN.getMonth(), WEEKDAY_ORIGIN.getDate() + offset)),
  );
}

function monthNames(tag: LocaleTag, style: 'long' | 'short'): string[] {
  const format = new Intl.DateTimeFormat(tag, { month: style });
  return Array.from({ length: 12 }, (_, index) => format.format(new Date(2024, index, 1, 12)));
}

// PrimeVue 4.5.5 formats `yy` as a four-digit year (and its parser takes
// four digits), so `mm/dd/yy` prints `12/08/2026`; the catalogue
// placeholder says `yyyy` to match what the desk actually sees. Pinned
// in `app/src/i18n/primevueLocale.test.ts` so a PrimeVue upgrade cannot
// silently shrink the year.
export function primeVueDateFormat(tag: LocaleTag): string {
  return tag === 'en' ? 'mm/dd/yy' : 'dd/mm/yy';
}

export function primeVueLocale(tag: LocaleTag): PrimeVueLocaleOptions {
  return {
    ...defaultOptions.locale,
    fileSizeTypes: defaultOptions.locale?.fileSizeTypes ?? [],
    dateFormat: primeVueDateFormat(tag),
    firstDayOfWeek: tag === 'en' ? 0 : 1,
    dayNames: weekdayNames(tag, 'long'),
    dayNamesShort: weekdayNames(tag, 'short'),
    dayNamesMin: weekdayNames(tag, 'narrow'),
    monthNames: monthNames(tag, 'long'),
    monthNamesShort: monthNames(tag, 'short'),
  };
}

// Applies the active app locale to the installed PrimeVue config and
// keeps it in sync for the whole app lifetime. Installed once beside
// `app.use(PrimeVue, …)` in `app/src/main.ts`, not from a view's setup:
// a view-scoped watcher would stop with its view and leave the shared
// config stale for whichever component mounts the next picker.
export function installPrimeVueLocale(app: App): void {
  app.runWithContext(() => {
    const primevue = usePrimeVue();
    watch(
      localeTag,
      (tag) => {
        primevue.config.locale = primeVueLocale(tag);
      },
      { immediate: true },
    );
  });
}
