// PrimeVue locale bridge guard (Refs #581, G-BK-1): the Book date
// pickers follow the APP locale (VI `dd/mm/yyyy`, EN `mm/dd/yyyy`),
// never the browser UI language. This file pins the format table and
// the generated calendar wording so a PrimeVue or ICU upgrade cannot
// silently change what the desk sees, and pins the app-level install so
// a locale switch keeps updating the shared PrimeVue config.
import { afterEach, describe, expect, it } from 'vitest';
import { createApp, nextTick } from 'vue';
import PrimeVue from 'primevue/config';
import { setLocale } from './index';
import { installPrimeVueLocale, primeVueDateFormat, primeVueLocale } from './primevueLocale';

afterEach(() => {
  setLocale('en');
});

describe('PrimeVue picker locale (Refs #581)', () => {
  it('pins the typed/parsed date format per app locale', () => {
    // PrimeVue 4.5.5 renders `yy` as a four-digit year, so the field
    // text matches the `yyyy` catalogue placeholder the desk reads.
    expect(primeVueDateFormat('vi')).toBe('dd/mm/yy');
    expect(primeVueDateFormat('en')).toBe('mm/dd/yy');
  });

  it('generates the calendar wording from the app locale, not a second catalogue', () => {
    const vi = primeVueLocale('vi');
    expect(vi.firstDayOfWeek).toBe(1);
    expect(vi.dayNamesMin?.slice(0, 3)).toEqual(['CN', 'T2', 'T3']);
    expect(vi.monthNames?.[0]).toBe('Tháng 1');
    expect(vi.monthNames?.[11]).toBe('Tháng 12');

    const en = primeVueLocale('en');
    expect(en.firstDayOfWeek).toBe(0);
    expect(en.dayNamesMin?.slice(0, 3)).toEqual(['S', 'M', 'T']);
    expect(en.monthNames?.[0]).toBe('January');
    expect(en.monthNames?.[11]).toBe('December');
  });

  it('installs the active app locale on the PrimeVue config and follows a switch', async () => {
    const app = createApp({});
    app.use(PrimeVue, {});
    installPrimeVueLocale(app);
    const config = app.config.globalProperties.$primevue.config as {
      locale?: { dateFormat?: string; firstDayOfWeek?: number };
    };
    expect(config.locale?.dateFormat).toBe('mm/dd/yy');
    expect(config.locale?.firstDayOfWeek).toBe(0);

    setLocale('vi');
    await nextTick();
    expect(config.locale?.dateFormat).toBe('dd/mm/yy');
    expect(config.locale?.firstDayOfWeek).toBe(1);
  });
});
