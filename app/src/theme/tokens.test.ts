// Primary-button token guard (Refs #471).
//
// Aura renders filled primary buttons from `{primary.color}` (the
// 500 step, `#279086`); the design token is the 700 step
// (`#0F766E`). The DeskPreset pins only the resting primary-button
// fill and its keyboard focus ring to the tokens, so these tests pin
// the overrides and the untouched scale together: the overrides carry
// the fix, and the scale still feeds every other component exactly as
// before.
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

describe('desk primary-button token (Refs #471)', () => {
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

  it('leaves the primary scale untouched for every other component', () => {
    const scale = primaryScale();
    expect(scale[500]).toBe('#279086');
    expect(scale[700]).toBe(deskTokens.colors.primary);
  });
});
