// Design tokens for the desk UI styling pass (Refs #338, the
// approved Phase 1 UI contract §1, LLD §12.1).
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
    page: '#F4F2ED',
    // Text.
    ink: '#1F2933',
    muted: '#6B7280',
    // The single accent (actions, active nav). State colours are
    // used solely for status, never for branding.
    primary: '#1D4ED8',
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
    cardRadiusPx: 8,
    contentMaxPx: 1100,
  },
  focus: {
    ringPx: 2,
    ringColor: '#1D4ED8',
  },
} as const;

// PrimeVue stock preset fed by the tokens above (contract §3,
// LLD §12.1): Aura with its primary scale anchored on desk blue
// (700 is exactly the contract primary). State severities keep
// their stock hues, which match the contract state colours.
import Aura from '@primevue/themes/aura';
import { definePreset } from '@primevue/themes';

export const DeskPreset = definePreset(Aura, {
  semantic: {
    primary: {
      50: '#eff6ff',
      100: '#dbeafe',
      200: '#bfdbfe',
      300: '#93c5fd',
      400: '#60a5fa',
      500: '#3b82f6',
      600: '#2563eb',
      700: '#1D4ED8',
      800: '#1e40af',
      900: '#1e3a8a',
      950: '#172554',
    },
  },
});
