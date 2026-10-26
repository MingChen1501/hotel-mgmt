// Vitest setup for the /app/ migration shell (Refs #338).
//
// The Phase 2 styling pass renders PrimeVue components in every view,
// so every component mount needs two things the jsdom default lacks:
// - the PrimeVue plugin (its components read the `$primevue` app
//   config; without it every styled input crashes on render), and
// - `window.matchMedia` (DatePicker binds a match-media listener on
//   mount; jsdom ships none).
// Both live here so no test file repeats the harness. Pinia stays
// per-test (state isolation), so tests still pass their own pinia.
import { config } from '@vue/test-utils';
import PrimeVue from 'primevue/config';

config.global.plugins.push([PrimeVue, {}] as never);

if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}
