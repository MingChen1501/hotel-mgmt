// List-backed stay picker for the desk open-folio steps
// (Refs #582, owner request 2026-11-09: the desk offers a list
// wherever a list API exists, and keeps manual entry only as the
// fallback).
//
// Folio and Print both open a folio by stay ID. `ListArrivalsDepartures`
// already returns the business date's in-house stays with `stayId` and
// `guestId` (`contracts/http/ListArrivalsDepartures.json`), and
// `ListRoomsByState` turns each room UUID into the human room number
// (`contracts/http/ListRoomsByState.json`) — the same two reads the
// Stay panel uses. No new endpoint, no contract change.
//
// Degradation rule (issue #582 acceptance 7): an empty or failed list
// read never breaks the open step; it resolves to an empty option set
// plus the `failed` flag, and the caller keeps the manual stay-ID input
// visible.
import { apiFetch } from './api/client';
import type { ApiError } from './api/client';
import { t } from './i18n';

export interface InHouseStayOption {
  /** Stay identifier the open call must send unchanged. */
  stayId: string;
  /** Guest and room, so desk staff recognise the stay without IDs. */
  label: string;
}

export interface InHouseStayOptions {
  options: InHouseStayOption[];
  /** True when the stay list read failed (never for an empty list). */
  failed: boolean;
}

interface StayRow {
  stayId?: string;
  guestId?: string;
  roomId?: string;
}

function isSignedOut(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as ApiError).code === 'UNAUTHENTICATED'
  );
}

// The desk business date is the hotel-local calendar day, the same
// value the Main and Stay screens send to `ListArrivalsDepartures`.
export function localBusinessDate(): string {
  const now = new Date();
  const pad = (value: number): string => (value < 10 ? '0' : '') + String(value);
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function unknownGuest(): string {
  return t('desk.today.unknown_guest', {}, 'Unknown guest');
}

// A guest read failure only loses that option's name (issue #372
// rule: never a raw record ID); a signed-out response still reaches
// the one 401 gate.
async function readGuestName(guestId: string | undefined): Promise<string> {
  if (!guestId) {
    return unknownGuest();
  }
  try {
    const guest = await apiFetch<{ fullName?: string }>('/v1/guests/GetGuest', {
      method: 'POST',
      body: JSON.stringify({ guestId }),
    });
    const name = (guest.fullName ?? '').trim();
    return name === '' ? unknownGuest() : name;
  } catch (err) {
    if (isSignedOut(err)) {
      throw err;
    }
    return unknownGuest();
  }
}

// In-house stays sit in occupied rooms, so one state read covers every
// option. A failed room read keeps the stay pickable with the
// catalogue's unavailable-room wording instead of failing the list.
async function readOccupiedRoomNumbers(): Promise<Record<string, string>> {
  try {
    const listed = await apiFetch<{ rooms?: Array<{ roomId?: string; number?: string }> }>(
      '/v1/rooms/ListRoomsByState',
      { method: 'POST', body: JSON.stringify({ state: 'occupied' }) },
    );
    const numbers: Record<string, string> = {};
    for (const room of listed.rooms ?? []) {
      if (room.roomId && room.number) {
        numbers[room.roomId] = room.number;
      }
    }
    return numbers;
  } catch (err) {
    if (isSignedOut(err)) {
      throw err;
    }
    return {};
  }
}

function roomLabel(roomId: string | undefined, numbers: Record<string, string>): string {
  if (!roomId) {
    return t('desk.today.not_assigned', {}, 'Not assigned');
  }
  const number = numbers[roomId];
  if (number) {
    return t('desk.today.room_short', { room: number }, `Room ${number}`);
  }
  return t('desk.today.room_unknown', {}, 'Room number unavailable');
}

// Reads the business date's in-house stays as pickable options,
// labelled `guest · room`. The list read failing is a normal degraded
// state (`failed: true`), while a signed-out response is rethrown so
// the caller returns to the sign-in gate.
export async function loadInHouseStayOptions(): Promise<InHouseStayOptions> {
  let rows: StayRow[];
  try {
    const lists = await apiFetch<{ inHouse?: StayRow[] }>(
      '/v1/stay/ListArrivalsDepartures',
      { method: 'POST', body: JSON.stringify({ businessDate: localBusinessDate() }) },
    );
    rows = lists.inHouse ?? [];
  } catch (err) {
    if (isSignedOut(err)) {
      throw err;
    }
    return { options: [], failed: true };
  }

  const numbers = await readOccupiedRoomNumbers();
  const options: InHouseStayOption[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    if (!row.stayId || seen.has(row.stayId)) {
      continue;
    }
    seen.add(row.stayId);
    const guestName = await readGuestName(row.guestId);
    const room = roomLabel(row.roomId, numbers);
    options.push({
      stayId: row.stayId,
      label: t('desk.today.name_detail', { name: guestName, detail: room }, `${guestName} · ${room}`),
    });
  }
  options.sort((a, b) => a.label.localeCompare(b.label));
  return { options, failed: false };
}
