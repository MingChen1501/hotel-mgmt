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
    // Restyle spec section 3 (Refs #519): the boards' muted ink is
    // `#4B5D5B` (labels, hints, empty states;
    // `docs/design/Main.dc.html:2` — all six boards agree).
    muted: '#4B5D5B',
    // Header teal plus the single action accent (actions, active
    // nav). State colours are used solely for status, never for
    // branding.
    header: '#0F4C47',
    primary: '#0F766E',
    success: '#15803D',
    warning: '#B45309',
    danger: '#B91C1C',
    border: '#E5E7EB',
    // Restyle spec section 3 (Refs #519): design card borders are
    // `#D9E0DE` and row dividers `#EEF1F0`
    // (`docs/design/Main.dc.html:2` — all boards except Stay agree
    // on the divider). Surfaces migrate per screen (#519–#524); the
    // legacy `border` token above stays until its last consumer
    // migrates.
    cardBorder: '#D9E0DE',
    rowDivider: '#EEF1F0',
    // Balance-due accent (restyle spec section 3, Refs #522):
    // `#8A4B08` (`docs/design/Folio.dc.html:2`).
    balanceDue: '#8A4B08',
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
    // Restyle spec section 3 (Refs #518): the design boards render
    // a 1200px content column (`docs/design/Main.dc.html:2` root
    // `width:1200px`; every tabbed board agrees).
    contentMaxPx: 1200,
  },
  // Shell/nav chrome tokens (Refs #518; restyle spec section 4).
  // Read verbatim from the header block on line 2 of every board
  // (`docs/design/Main.dc.html:2`, `Book.dc.html:2`, `Stay.dc.html:2`,
  // `Folio.dc.html:2`, `Rooms.dc.html:2`; `Onboarding.dc.html:2`
  // carries the slimmer setup header). The shell stylesheet cites
  // these values; CSS cannot import the TS constants, so both stay
  // in sync by hand.
  shell: {
    headerHeightPx: 60,
    headerPadXPx: 24,
    brandPx: 18,
    brandGapPx: 24,
    tabPadYPx: 10,
    tabPadXPx: 16,
    tabRadiusPx: 8,
    // Locale pill (`margin-left:auto;border:1px solid
    // #9CC9C4;border-radius:8px;padding:6px 12px`, every tabbed
    // board line 2).
    pillBorder: '#9CC9C4',
    pillRadiusPx: 8,
    pillPadYPx: 6,
    pillPadXPx: 12,
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
      // Refs #502: the 500 step carries the design token, so
      // `{primary.color}` — which Aura resolves from this step —
      // renders the design teal on every component bound to it,
      // not the stock `#279086`. The remaining steps keep their
      // stock hues, which match the contract state colours.
      500: deskTokens.colors.primary,
      600: '#147a71',
      700: '#0F766E',
      800: '#0F4C47',
      900: '#0c3f3c',
      950: '#072a28',
    },
  },
  components: {
    // Refs #471: the resting primary-button fill and its keyboard
    // focus ring are pinned to the tokens. Refs #502: the semantic
    // 500 step now carries the design token too, so this resting
    // pin coincides with `{primary.color}`; the explicit pin stays
    // as the guard. Hover/active states and the outlined/text/link
    // variants keep their stock scale bindings; every other
    // component bound to the 500 step resolves the design token by
    // construction. The focus ring uses the focus token (same
    // `#0F766E` value), matching the shell `:focus-visible`
    // outline in `App.vue`.
    button: {
      colorScheme: {
        light: {
          root: {
            primary: {
              background: deskTokens.colors.primary,
              borderColor: deskTokens.colors.primary,
              focusRing: {
                color: deskTokens.focus.ringColor,
              },
            },
          },
        },
        dark: {
          root: {
            primary: {
              background: deskTokens.colors.primary,
              borderColor: deskTokens.colors.primary,
              focusRing: {
                color: deskTokens.focus.ringColor,
              },
            },
          },
        },
      },
    },
  },
});
