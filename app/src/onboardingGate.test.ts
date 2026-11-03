// Guards for the fresh-database gate predicate (Refs #456,
// FR-DSK-7): a missing, blank, or boot-seed placeholder hotel name
// counts as unconfigured so the setup wizard launches, while any
// real name keeps the seeded-desk path.
import { describe, expect, it } from 'vitest';
import { SKELETON_HOTEL_NAME, configuredHotelName } from './onboardingGate';

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
});
