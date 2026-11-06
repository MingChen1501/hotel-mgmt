// Primary token guard (Refs #471, #502).
//
// Aura resolves `{primary.color}` from the semantic 500 step. Refs
// #471 pinned the resting primary-button fill and its keyboard
// focus ring to the design token (`#0F766E`); Refs #502 aligns the
// 500 step itself with the same token, so every component bound to
// it renders the design teal and no computed surface keeps the
// stock `#279086`. These tests pin the overrides, the aligned
// scale, and the absence of the residual default together: the
// overrides carry the button fix, and the scale feeds every other
// component exactly the design token.
import { describe, expect, it } from 'vitest';
import { deskTokens, DeskPreset } from './tokens';

interface PrimaryFill {
  background: string;
  borderColor: string;
  hoverBackground: string;
  activeBackground: string;
  focusRing: {
    color: string;
    shadow: string;
  };
}

interface ButtonScheme {
  root: { primary: PrimaryFill };
}

function buttonScheme(mode: 'light' | 'dark'): ButtonScheme {
  const preset = DeskPreset as unknown as {
    components: { button: { colorScheme: Record<'light' | 'dark', ButtonScheme> } };
  };
  return preset.components.button.colorScheme[mode];
}

function primaryScale(): Record<string, string> {
  const preset = DeskPreset as unknown as { semantic: { primary: Record<string, string> } };
  return preset.semantic.primary;
}

describe('desk primary token (Refs #471, #502)', () => {
  it('pins the resting primary-button fill to the design token', () => {
    expect(deskTokens.colors.primary).toBe('#0F766E');
    for (const mode of ['light', 'dark'] as const) {
      const primary = buttonScheme(mode).root.primary;
      expect(primary.background).toBe(deskTokens.colors.primary);
      expect(primary.borderColor).toBe(deskTokens.colors.primary);
    }
  });

  it('pins the primary-button focus ring to the focus token', () => {
    expect(deskTokens.focus.ringColor).toBe('#0F766E');
    for (const mode of ['light', 'dark'] as const) {
      const primary = buttonScheme(mode).root.primary;
      expect(primary.focusRing.color).toBe(deskTokens.focus.ringColor);
      expect(primary.focusRing.shadow).toBe('none');
    }
  });

  it('leaves hover/active fills on their stock scale bindings', () => {
    for (const mode of ['light', 'dark'] as const) {
      const primary = buttonScheme(mode).root.primary;
      expect(primary.hoverBackground).toBe('{primary.hover.color}');
      expect(primary.activeBackground).toBe('{primary.active.color}');
    }
  });

  it('aligns the primary scale with the design token (Refs #502)', () => {
    const scale = primaryScale();
    expect(scale[500]).toBe(deskTokens.colors.primary);
    expect(scale[700]).toBe(deskTokens.colors.primary);
  });

  it('leaves no residual PrimeVue default primary in the preset (Refs #502)', () => {
    const serialized = JSON.stringify(DeskPreset).toLowerCase();
    expect(serialized).not.toContain('#279086');
  });
});
