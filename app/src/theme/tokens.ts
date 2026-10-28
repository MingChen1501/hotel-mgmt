// Design tokens for the desk UI rollout (Refs #419, #420; the
// shared tokens in `docs/product/desk-ui-design-rollout.md`
// section 3, LLD section 12.1).
//
// These values are the ONLY styling inputs: the PrimeVue stock
// preset below is fed by them, and the SFC stylesheets reuse the
// same constants through CSS variables. There is no custom design
// system beyond these tokens, and money and dates render exactly
// as today (hotel locale settings govern; presentation never
// changes values).
export const deskTokens = {
  colors: {
    // Page and surface.
    surface: '#FFFFFF',
    page: '#F4F6F5',
    // Text.
    ink: '#1B2B2A',
    muted: '#6B7280',
    // Header teal plus the single action accent (actions, active
    // nav). State colours are used solely for status, never for
    // branding.
    header: '#0F4C47',
    primary: '#0F766E',
    success: '#15803D',
    warning: '#B45309',
    danger: '#B91C1C',
    border: '#E5E7EB',
  },
  type: {
    fontStack: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    basePx: 16,
    headingPx: [20, 24, 30],
  },
  spacing: {
    unitPx: 4,
    stepsPx: [8, 12, 16, 24],
    cardRadiusPx: 12,
    contentMaxPx: 1100,
  },
  targets: {
    // Every interactive element meets the 44px minimum touch and
    // keyboard target (NFR-DSK-3); the shell stylesheet enforces
    // it, audited per screen in D9.
    minPx: 44,
  },
  focus: {
    ringPx: 2,
    ringColor: '#0F766E',
  },
} as const;

// PrimeVue stock preset fed by the tokens above (rollout section 3,
// LLD section 12.1): Aura with its primary scale anchored on the
// design teal (700 is exactly the action accent). State severities
// keep their stock hues, which match the contract state colours.
import Aura from '@primevue/themes/aura';
import { definePreset } from '@primevue/themes';

export const DeskPreset = definePreset(Aura, {
  semantic: {
    primary: {
      50: '#effaf8',
      100: '#d7f0ec',
      200: '#b0e0d8',
      300: '#7fc9be',
      400: '#4dada1',
      500: '#279086',
      600: '#147a71',
      700: '#0F766E',
      800: '#0F4C47',
      900: '#0c3f3c',
      950: '#072a28',
    },
  },
});
