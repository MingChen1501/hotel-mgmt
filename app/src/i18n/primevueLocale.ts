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
// The `dateFormat` prop on the picker is derived from the same table
// (`primeVueDateFormat`) so the typed/parsed form and the calendar
// header can never drift apart.
import { watch } from 'vue';
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
// keeps it in sync while the component that owns a picker is mounted.
// Called from a component setup, so the watcher stops with the view.
export function syncPrimeVueLocale(): void {
  const primevue = usePrimeVue();
  watch(
    localeTag,
    (tag) => {
      primevue.config.locale = primeVueLocale(tag);
    },
    { immediate: true },
  );
}
