// Unit tests for the catalogue `t()` wrapper (Refs #292).
//
// They pin `DeskMessages.msg` parity from `frontend/messages.js`:
// fallback semantics plus `{param}` interpolation, so follow-up
// screen slices can rely on identical rendering.
import { describe, expect, it } from 'vitest';
import { catalogueLocale, hasMessage, t } from './index';

describe('catalogue t() wrapper', () => {
  it('resolves a plain catalogue key without placeholders', () => {
    expect(t('error.transport.bad_json')).toBe('Request body is not valid JSON.');
  });

  it('interpolates a single {param} placeholder', () => {
    expect(t('desk.book.reference', { ref: 'ABC-123' })).toBe('Booking reference: ABC-123');
  });

  it('interpolates several placeholders in one pattern', () => {
    expect(
      t('desk.today.sheet_line', {
        arrivals: 2,
        inHouse: 3,
        departures: 1,
        openBalances: 0,
        asOf: '2026-10-26',
      }),
    ).toBe('2 arriving, 3 in house, 1 leaving, 0 open balances (as of 2026-10-26).');
  });

  it('leaves placeholders without a matching param intact', () => {
    expect(t('desk.book.reference')).toBe('Booking reference: {ref}');
    expect(t('desk.book.reference', { other: 'x' })).toBe('Booking reference: {ref}');
  });

  it('coerces non-string param values to strings', () => {
    expect(t('desk.book.reference', { ref: 42 })).toBe('Booking reference: 42');
  });

  it('returns message-missing:<key> for unknown keys without a fallback', () => {
    expect(t('no.such.key')).toBe('message-missing:no.such.key');
  });

  it('returns the explicit fallback for unknown keys', () => {
    expect(t('no.such.key', {}, 'Fallback text')).toBe('Fallback text');
  });

  it('exposes the catalogue locale', () => {
    expect(catalogueLocale()).toBe('en');
  });

  it('covers keys across every per-service catalogue boundary', () => {
    const keys = [
      'error.auth.missing_token',
      'desk.entry.title',
      'rates.notfound.room_type',
      'rooms.notfound.room',
      'stay.notfound.stay',
      'guests.notfound.guest',
      'reporting.validation.event_required',
    ];
    for (const key of keys) {
      expect(hasMessage(key), key).toBe(true);
      expect(t(key)).not.toBe(`message-missing:${key}`);
    }
  });
});
