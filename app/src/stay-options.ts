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

interface InHousePair {
  rows: StayRow[];
  /** Room number keyed by room id, from the occupied lane. */
  roomNumbers: Record<string, string>;
  /** True when the in-house stay list read failed. */
  staysFailed: boolean;
  /** True when the occupied-room read failed. */
  roomsFailed: boolean;
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
async function readOccupiedRoomNumbers(): Promise<{
  numbers: Record<string, string>;
  failed: boolean;
}> {
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
    return { numbers, failed: false };
  } catch (err) {
    if (isSignedOut(err)) {
      throw err;
    }
    return { numbers: {}, failed: true };
  }
}

// One read pair, one degradation rule (LLD section 24.2): the business
// date's in-house list supplies `stayId -> roomId` and the occupied
// lane supplies `roomId -> number`. The stay read runs first because
// the room id comes from it. Neither failure throws past the caller —
// only a signed-out response does, so the one 401 gate still owns it.
async function readInHousePair(): Promise<InHousePair> {
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
    return { rows: [], roomNumbers: {}, staysFailed: true, roomsFailed: false };
  }
  const occupied = await readOccupiedRoomNumbers();
  return {
    rows,
    roomNumbers: occupied.numbers,
    staysFailed: false,
    roomsFailed: occupied.failed,
  };
}

// Read-only in-house room map for the booking register (Refs #648, LLD
// section 24.2). The register resolves a checked-in booking's room from
// this map and never calls `loadInHouseStayOptions`, because that helper
// pays one `GetGuest` read per in-house stay for labels the register
// already has from its row reads.
export interface InHouseRoomMap {
  /** Room number keyed by stay id; a stay with no resolvable room is absent. */
  roomsByStayId: Record<string, string>;
  /** True when the room column could not be read (either read failed). */
  failed: boolean;
}

export async function loadInHouseRoomMap(): Promise<InHouseRoomMap> {
  const pair = await readInHousePair();
  if (pair.staysFailed) {
    return { roomsByStayId: {}, failed: true };
  }
  const roomsByStayId: Record<string, string> = {};
  for (const row of pair.rows) {
    if (!row.stayId) {
      continue;
    }
    const number = row.roomId ? pair.roomNumbers[row.roomId] : undefined;
    if (number) {
      roomsByStayId[row.stayId] = number;
    }
  }
  return { roomsByStayId, failed: pair.roomsFailed };
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
  const pair = await readInHousePair();
  if (pair.staysFailed) {
    return { options: [], failed: true };
  }

  const options: InHouseStayOption[] = [];
  const seen = new Set<string>();
  for (const row of pair.rows) {
    if (!row.stayId || seen.has(row.stayId)) {
      continue;
    }
    seen.add(row.stayId);
    const guestName = await readGuestName(row.guestId);
    const room = roomLabel(row.roomId, pair.roomNumbers);
    options.push({
      stayId: row.stayId,
      label: t('desk.today.name_detail', { name: guestName, detail: room }, `${guestName} · ${room}`),
    });
  }
  options.sort((a, b) => a.label.localeCompare(b.label));
  return { options, failed: false };
}
