// Unit tests for the catalogue `t()` wrapper (Refs #292).
//
// They pin `DeskMessages.msg` parity from `frontend/messages.js`:
// fallback semantics plus `{param}` interpolation, so follow-up
// screen slices can rely on identical rendering.
import { beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_LOCALE,
  LOCALE_STORAGE_KEY,
  catalogueLocale,
  hasMessage,
  setLocale,
  t,
} from './index';

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

// Locale switching (Refs #339): default stays `en`, `vi` resolves
// the same keys with placeholders intact, the missing-key fallback
// path is unchanged, and only the locale persists.
describe('desk locale (en/vi)', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    setLocale('en');
  });

  it('defaults to the en catalogue', () => {
    expect(DEFAULT_LOCALE).toBe('en');
    expect(catalogueLocale()).toBe('en');
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('en');
    expect(t('desk.shell.nav_desk')).toBe('Desk');
  });

  it('resolves desk keys in Vietnamese with placeholders intact', () => {
    setLocale('vi');
    expect(catalogueLocale()).toBe('vi');
    expect(t('desk.shell.nav_desk')).toBe('Lễ tân');
    expect(t('desk.book.reference', { ref: 'ABC-123' })).toBe('Mã đặt phòng: ABC-123');
    expect(t('desk.today.sheet_line', {
      arrivals: 2,
      inHouse: 3,
      departures: 1,
      openBalances: 0,
      asOf: '2026-10-26',
    })).toBe(
      '2 khách đến, 3 khách đang ở, 1 khách đi, 0 số dư chưa thanh toán (tính đến 2026-10-26).',
    );
    expect(t('desk.stay.checked_in', { stayId: 's-1', roomNumber: '101' })).toBe(
      'Đã nhận phòng: lưu trú s-1 ở phòng 101.',
    );
  });

  it('keeps the missing-key fallback path unchanged under vi', () => {
    setLocale('vi');
    expect(t('no.such.key')).toBe('message-missing:no.such.key');
    expect(t('no.such.key', {}, 'Fallback text')).toBe('Fallback text');
    expect(t('desk.book.reference')).toBe('Mã đặt phòng: {ref}');
  });

  it('persists the locale only, never auth or session data', () => {
    setLocale('vi');
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('vi');
    expect(sessionStorage.getItem(LOCALE_STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem('hotel-mgmt.session.token')).toBeNull();
    setLocale('en');
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('en');
  });

  it('treats unknown locale tags as the default', () => {
    setLocale('xx');
    expect(catalogueLocale()).toBe('en');
    expect(t('desk.shell.nav_desk')).toBe('Desk');
  });

  it('formats numbers for the active locale (existing Intl formatters)', () => {
    const figure = 1234567.89;
    const format = (tag: string): string =>
      new Intl.NumberFormat(tag, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(figure);
    setLocale('en');
    expect(format(catalogueLocale())).toBe('1,234,567.89');
    setLocale('vi');
    expect(format(catalogueLocale())).toBe('1.234.567,89');
  });
});
