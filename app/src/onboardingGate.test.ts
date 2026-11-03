// Guards for the fresh-database gate predicate (Refs #456,
// FR-DSK-7): a missing, blank, or boot-seed placeholder hotel name
// counts as unconfigured so the setup wizard launches, while any
// real name keeps the seeded-desk path.
import { describe, expect, it } from 'vitest';
import { SKELETON_HOTEL_NAME, configuredHotelName, isPlaceholderHotelName } from './onboardingGate';

describe('onboarding gate predicate', () => {
  it('treats a missing values payload as unconfigured', () => {
    expect(configuredHotelName(undefined)).toBe('');
    expect(configuredHotelName(null)).toBe('');
    expect(configuredHotelName({})).toBe('');
    expect(configuredHotelName({ name: null })).toBe('');
    expect(configuredHotelName({ name: 42 })).toBe('');
  });

  it('treats a blank hotel name as unconfigured', () => {
    expect(configuredHotelName({ name: '' })).toBe('');
    expect(configuredHotelName({ name: '   ' })).toBe('');
  });

  it('treats the boot-seed placeholder name as unconfigured', () => {
    expect(SKELETON_HOTEL_NAME).toBe('Skeleton Hotel');
    expect(configuredHotelName({ name: 'Skeleton Hotel' })).toBe('');
    expect(configuredHotelName({ name: '  Skeleton Hotel  ' })).toBe('');
  });

  it('keeps a real hotel name as configured', () => {
    expect(configuredHotelName({ name: 'Riverside Hotel' })).toBe('Riverside Hotel');
    expect(configuredHotelName({ name: '  Riverside Hotel  ' })).toBe('Riverside Hotel');
  });

  it('shares one placeholder check between the gate and step-1 validation', () => {
    // Step-1 validation reuses this helper (Refs #456), so the
    // rejected input and the gate predicate can never drift apart.
    expect(isPlaceholderHotelName('Skeleton Hotel')).toBe(true);
    expect(isPlaceholderHotelName('  Skeleton Hotel  ')).toBe(true);
    expect(isPlaceholderHotelName('Riverside Hotel')).toBe(false);
    expect(isPlaceholderHotelName('')).toBe(false);
  });
});
