<template>
  <main data-testid="rooms-view">
    <!-- Rooms title block (Refs #543,
      `docs/design/Rooms.dc.html:2`: the v2 board carries no screen
      title or intro — the head row is a flex row with
      `justify-content:space-between` carrying the muted `14px`
      eyebrow (`{title} · {date}`) above the `26px/700` counts
      headline (`{total} · {occupied}`) left and the primary reload
      button right. The intro, the standalone business-date row
      (folded into the eyebrow), and the `Rooms by status` section
      heading are gone (zero extras vs the board). The eyebrow date
      keeps the locale long-weekday form (AC-DSK-12, #513); the
      eyebrow stays the page h1 so the gate prefix still opens on
      the catalogue title. Hooks and copy otherwise unchanged). -->
    <div class="rooms-title-row">
      <div class="rooms-title-block">
        <h1 class="rooms-eyebrow">
          {{ t('desk.rooms.title', {}, 'Room map') }} · <strong data-testid="rooms-business-date">{{ businessDateDisplay }}</strong>
        </h1>
        <p class="rooms-headline">
          {{ t('desk.rooms.headline', { total: totalRooms, occupied: occupiedCount }, `${totalRooms} rooms, ${occupiedCount} occupied`) }}
        </p>
      </div>
      <Button
        id="rooms-refresh-button"
        type="button"
        class="rooms-action"
        :label="t('desk.rooms.refresh', {}, 'Refresh')"
        data-testid="rooms-refresh"
        :disabled="loading"
        :loading="loading"
        @click="onRefresh"
      />
    </div>
    <noscript><p>{{ t('desk.rooms.noscript', {}, 'This page needs JavaScript to load the room map.') }}</p></noscript>
    <Message
      v-if="loading"
      severity="info"
      data-testid="rooms-loading"
    >
      {{ t('desk.rooms.loading', {}, 'Loading the room map…') }}
    </Message>
    <Message
      v-if="loadError"
      severity="error"
      role="alert"
      data-testid="rooms-error"
    >
      {{ loadError }}
    </Message>

    <template v-if="!loading && !loadError">
      <Message
        v-if="housekeepingError"
        severity="error"
        role="alert"
        data-testid="rooms-housekeeping-error"
      >
        {{ housekeepingError }}
      </Message>
      <p
        v-if="totalRooms === 0"
        data-testid="rooms-empty"
        class="rooms-empty"
      >
        {{ t('desk.rooms.empty', {}, 'No rooms yet. Rooms appear here once they are set up.') }}
      </p>
      <template v-else>
        <section
          data-testid="rooms-summary"
          class="rooms-summary"
        >
          <!-- Status-chip row (restyle Refs #523, Refs #543,
            `docs/design/Rooms.dc.html:2`: `display:flex;gap:10px`
            with wrap; each chip is a white `999px` pill
            (`8px 14px`, `14px`) with a `12px` status dot at
            radius `3px`; the v2 board carries no section heading,
            so the `Rooms by status` h2 is gone (zero extras). The
            app keeps its qualified chip wording (the R3 REPORTED
            item #499 stays reported) and the live counts — hooks
            and copy unchanged). -->
          <ul class="rooms-chips">
            <li
              v-for="chip in chips"
              :key="chip.status"
              :data-testid="`rooms-chip-${chip.status}`"
              :class="['rooms-chip', `rooms-chip-${chip.status}`]"
            >
              <i
                class="rooms-chip-dot"
                aria-hidden="true"
              />
              <Tag
                class="rooms-chip-tag"
                :severity="chip.severity"
                :value="chip.label"
              /> ({{ chip.count }})
            </li>
          </ul>
        </section>

        <!-- Floor sections (restyle Refs #523,
          `docs/design/Rooms.dc.html:2`: floor h2 renders
          `margin:0 0 8px;font-size:18px` above a
          `repeat(6,1fr)` grid with `gap:12px`; grouping and
          unknown-floor behaviour unchanged). -->
        <section
          v-for="floor in floors"
          :key="floor.key"
          :data-testid="floor.unknown ? 'rooms-floor-unknown' : 'rooms-floor'"
          class="rooms-floor"
        >
          <h2 class="rooms-section-title">
            {{ floor.title }}
          </h2>
          <div class="rooms-grid">
            <!-- Room cards (restyle Refs #523,
              `docs/design/Rooms.dc.html:2`): status-tint cards at
              `radius:12px;padding:14px;gap:6px;min-height:104px`;
              the head row carries the `22px` number left and the
              `12px/600` status badge (`radius:6px;padding:4px 8px`,
              white on the status accent) right; the type line
              renders `13px #3B4A48` and the live note `14px`.
              PrimeVue Card/Tag/Button stay as logic carriers only.
              Housekeeping buttons keep their transitions and take
              the primary treatment (the board shows no buttons;
              they stay because the transitions are behaviour).
              Hooks, notes, and copy unchanged. -->
            <Card
              v-for="room in floor.rooms"
              :key="room.number"
              :data-testid="`rooms-card-${room.number}`"
              :class="['room-card', `room-card-${room.display}`]"
            >
              <template #title>
                <div class="room-card-head">
                  <h3 class="room-card-number">
                    {{ room.number }}
                  </h3>
                  <Tag
                    class="room-card-badge"
                    :severity="chipSeverity(room.display)"
                    :value="chipLabel(room.display)"
                    :data-testid="`rooms-card-chip-${room.number}`"
                  />
                </div>
              </template>
              <template #content>
                <p
                  class="room-card-type"
                  :data-testid="`rooms-card-type-${room.number}`"
                >
                  {{ typeName(room.roomTypeId) }}
                </p>
                <p
                  class="room-card-note"
                  :data-testid="`rooms-card-note-${room.number}`"
                >
                  {{ noteFor(room) }}
                </p>
                <p
                  v-if="room.display === 'needs-cleaning'"
                  class="room-card-action"
                >
                  <Button
                    type="button"
                    class="rooms-action"
                    :label="t('desk.today.mark_cleaned', {}, 'Mark cleaned')"
                    :data-testid="`rooms-mark-cleaned-${room.number}`"
                    :disabled="isBusy(room.number)"
                    :loading="isBusy(room.number)"
                    @click="onMarkCleaned(room)"
                  />
                </p>
                <p
                  v-if="room.display === 'awaiting-inspection'"
                  class="room-card-action"
                >
                  <Button
                    type="button"
                    class="rooms-action"
                    :label="t('desk.today.mark_inspected', {}, 'Mark inspected')"
                    :data-testid="`rooms-mark-inspected-${room.number}`"
                    :disabled="isBusy(room.number)"
                    :loading="isBusy(room.number)"
                    @click="onMarkInspected(room)"
                  />
                </p>
              </template>
            </Card>
          </div>
        </section>
      </template>
    </template>
  </main>
</template>

<script lang="ts">
import { computed, defineComponent, onMounted, ref } from 'vue';
import Button from 'primevue/button';
import Card from 'primevue/card';
import Message from 'primevue/message';
import Tag from 'primevue/tag';
import { apiFetch } from '../api/client';
import type { ApiError } from '../api/client';
import { formatBusinessDate, localeTag, t } from '../i18n';
import { useSessionStore } from '../stores/session';

// Rooms visual map (Refs #424, #435, FR-DSK-6, LLD section 13.3,
// AC-DSK-6). Floor-grouped map over existing room state: the summary
// chips and the rendered cards derive from the one fetched payload,
// so counts match cards by construction. Per-room cards show the one
// status-chip vocabulary shared with the Main board, the room type,
// and one live note line (occupant plus checkout date,
// out-of-service reason plus date, or upcoming arrival). Dirty cards
// carry a Mark cleaned button and clean cards a Mark inspected
// button, advancing vacant-dirty to clean and clean to inspected
// through the existing `UpdateRoomState` transitions only (reuse,
// never new transitions); success re-reads the map so the chips
// match the cards again.
//
// Shared-migration contracts, same as the desk shell:
// - Bearer auth comes only from the Pinia session store via the
//   shared `apiFetch` client; a 401/UNAUTHENTICATED clears the
//   store and returns to sign-in (the single 401 path).
// - Every string goes through the catalogue `t()` wrapper; the
//   housekeeping buttons reuse the `desk.today.*` catalogue keys
//   shared with the Main board so both surfaces stay worded alike.
// - Errors switch on envelope codes, never on resolved wording.
// - The only writes are the two housekeeping buttons above;
//   refresh re-reads, and other staleness resolves by re-fetch,
//   never by client patching.

type DisplayStatus =
  | 'ready'
  | 'occupied'
  | 'needs-cleaning'
  | 'awaiting-inspection'
  | 'out-of-service';

interface RoomRecord {
  roomId?: string;
  number: string;
  roomTypeId: string;
  state: string;
  floor?: string | null;
}

interface StayRecord {
  stayId?: string;
  guestId?: string;
  currentRoomId?: string;
  roomId?: string;
}

interface DisplayRoom extends RoomRecord {
  display: DisplayStatus;
}

interface FloorGroup {
  key: string;
  title: string;
  unknown: boolean;
  rooms: DisplayRoom[];
}

const BACKEND_STATES: Record<string, DisplayStatus> = {
  occupied: 'occupied',
  'vacant-dirty': 'needs-cleaning',
  'vacant-clean': 'awaiting-inspection',
  'vacant-inspected': 'ready',
  'out-of-order': 'out-of-service',
};

function localBusinessDate(): string {
  const now = new Date();
  const pad = (value: number): string => (value < 10 ? '0' : '') + String(value);
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function isSignedOut(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as ApiError).code === 'UNAUTHENTICATED'
  );
}

export default defineComponent({
  name: 'RoomsView',
  // eslint-disable-next-line vue/no-reserved-component-names -- PrimeVue registers Button under this canonical name (Refs #338 component mapping).
  components: { Button, Card, Message, Tag },
  setup() {
    const session = useSessionStore();
    const businessDate = ref(localBusinessDate());
    // Business-date display form (Refs #503, FR-DSK-11): pure
    // derivation of the canonical ISO ref into the locale
    // long-weekday form; the ref itself stays ISO for the wire.
    const businessDateDisplay = computed(() => formatBusinessDate(businessDate.value, localeTag.value));
    const loading = ref(false);
    const loadError = ref('');
    const rooms = ref<DisplayRoom[]>([]);
    // Room-type names resolve through ListRoomTypes (issue #372):
    // cards render the human name, and typeName falls back to the
    // generic label when the type is unknown — never the raw ID.
    const roomTypeNames = ref<Record<string, string>>({});
    // Occupant names keyed by room UUID, joined client-side from
    // the in-house stays below (already-fetched data only — no
    // extra GetGuest calls beyond the stay lists).
    const occupantNames = ref<Record<string, string>>({});
    // In-house stay UUID per room UUID, so the checkout-date join
    // below names the right date for each occupied card.
    const stayForRoom = ref<Record<string, string>>({});
    // Planned checkout dates keyed by stay UUID, joined from the
    // reservation calendar (best effort: a calendar outage leaves
    // occupied notes at guest-name only, never failing the map).
    const checkoutDates = ref<Record<string, string>>({});
    // Arrival guests keyed by room UUID for today's arrivals that
    // already reference a room (the upcoming-arrival note on
    // ready cards).
    const arrivalGuests = ref<Record<string, string>>({});
    // Covering-block notes keyed by room UUID for out-of-service
    // cards: reason plus date from the existing sellability read
    // (no new endpoint) — rooms with no covering block render the
    // catalogue unknown-reason line.
    const blockNotes = ref<Record<string, { reason: string; date: string }>>({});
    // Housekeeping action state (Refs #435, same as the Main
    // board): each button stays disabled until its own call
    // returns, and a refusal names the room in plain words
    // without touching the map.
    const housekeepingError = ref('');
    const busyRooms = ref<Record<string, boolean>>({});

    // The shell owns the one sign-in gate (Refs #338): a
    // 401/UNAUTHENTICATED expires the shared session and the gate
    // takes over.
    function expireToGate(): void {
      session.expireSession();
    }

    function typeName(roomTypeId: string | undefined): string {
      if (roomTypeId && roomTypeNames.value[roomTypeId]) {
        return roomTypeNames.value[roomTypeId];
      }
      return t('desk.today.room_type_unresolved', {}, 'Room type');
    }

    // Board severities mirror the Main board lanes exactly (rollout
    // section 4.2: identical wording and colour meaning on both
    // surfaces).
    function chipSeverity(status: DisplayStatus): string {
      switch (status) {
        case 'occupied':
          return 'info';
        case 'ready':
          return 'success';
        case 'needs-cleaning':
        case 'awaiting-inspection':
          return 'warning';
        case 'out-of-service':
          return 'danger';
      }
    }

    function chipLabel(status: DisplayStatus): string {
      switch (status) {
        case 'ready':
          return t('desk.rooms.chip_ready', {}, 'Ready (inspected)');
        case 'occupied':
          return t('desk.rooms.chip_occupied', {}, 'Occupied');
        case 'needs-cleaning':
          return t('desk.rooms.chip_needs_cleaning', {}, 'Dirty');
        case 'awaiting-inspection':
          return t('desk.rooms.chip_awaiting_inspection', {}, 'Clean, awaiting inspection');
        case 'out-of-service':
          return t('desk.rooms.chip_out_of_service', {}, 'Out of order');
      }
    }

    // One live note per card (FR-DSK-6): occupant plus checkout
    // date, out-of-service reason plus date, or upcoming arrival.
    // States with no live data render a plain catalogue line so no
    // card ever shows a blank note.
    function noteFor(room: DisplayRoom): string {
      if (room.display === 'occupied') {
        const guest = room.roomId ? (occupantNames.value[room.roomId] ?? '') : '';
        const name = guest !== '' ? guest : t('desk.today.unknown_guest', {}, 'Unknown guest');
        const stayId = room.roomId ? stayForRoom.value[room.roomId] : undefined;
        const date = stayId ? checkoutDates.value[stayId] : undefined;
        if (date) {
          return t('desk.rooms.note_occupied', { guest: name, date }, `${name} · Checkout ${date}`);
        }
        return t('desk.rooms.note_occupied_no_date', { guest: name }, name);
      }
      if (room.display === 'out-of-service') {
        const note = room.roomId ? blockNotes.value[room.roomId] : undefined;
        if (note) {
          return t(
            'desk.rooms.note_out_of_service',
            { reason: note.reason, date: note.date },
            `${note.reason} · ${note.date}`,
          );
        }
        return t(
          'desk.today.out_of_service_unknown',
          {},
          'Reason not recorded. Ask the manager.',
        );
      }
      if (room.display === 'ready') {
        const guest = room.roomId ? arrivalGuests.value[room.roomId] : undefined;
        if (guest) {
          return t(
            'desk.rooms.note_arrival',
            { guest, date: businessDate.value },
            `${guest} · Arriving ${businessDate.value}`,
          );
        }
        return t('desk.rooms.note_ready', {}, 'Ready for check-in.');
      }
      if (room.display === 'needs-cleaning') {
        return t('desk.rooms.note_needs_cleaning', {}, 'Needs cleaning.');
      }
      return t('desk.rooms.note_awaiting_inspection', {}, 'Cleaned, awaiting inspection.');
    }

    // Summary chips derive from the same payload as the cards
    // (LLD section 13.3): counts match cards by construction,
    // never by reconciling two sources.
    const chips = computed(() => {
      const counts: Record<DisplayStatus, number> = {
        ready: 0,
        occupied: 0,
        'needs-cleaning': 0,
        'awaiting-inspection': 0,
        'out-of-service': 0,
      };
      for (const room of rooms.value) {
        counts[room.display] += 1;
      }
      return (Object.keys(counts) as DisplayStatus[]).map((status) => ({
        status,
        label: chipLabel(status),
        severity: chipSeverity(status),
        count: counts[status],
      }));
    });

    const totalRooms = computed(() => rooms.value.length);

    // Counts headline (Refs #543,
    // `docs/design/Rooms.dc.html:2`): the v2 board heads the map
    // with the live `{total} · {occupied}` line; the occupied
    // count reuses the chips derivation so the headline matches
    // the cards by construction.
    const occupiedCount = computed(
      () => chips.value.find((chip) => chip.status === 'occupied')?.count ?? 0,
    );

    // Floors group the same payload (LLD section 13.3 edge B–D).
    // Rooms whose payload carries no floor render under the
    // catalogue unknown-floor section so no room is ever dropped
    // from the map.
    const floors = computed<FloorGroup[]>(() => {
      const groups = new Map<string, DisplayRoom[]>();
      const unknown: DisplayRoom[] = [];
      for (const room of rooms.value) {
        if (typeof room.floor === 'string' && room.floor.trim() !== '') {
          const key = room.floor;
          const list = groups.get(key);
          if (list) {
            list.push(room);
          } else {
            groups.set(key, [room]);
          }
        } else {
          unknown.push(room);
        }
      }
      const byNumber = (a: DisplayRoom, b: DisplayRoom): number =>
        a.number.localeCompare(b.number, undefined, { numeric: true });
      const ordered = [...groups.entries()]
        .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
        .map(([key, list]) => ({
          key,
          title: t('desk.rooms.floor_title', { floor: key }, `Floor ${key}`),
          unknown: false,
          rooms: [...list].sort(byNumber),
        }));
      if (unknown.length > 0) {
        ordered.push({
          key: 'unknown',
          title: t('desk.rooms.floor_unknown', {}, 'Rooms without a listed floor'),
          unknown: true,
          rooms: [...unknown].sort(byNumber),
        });
      }
      return ordered;
    });

    async function resolveGuestName(guestId: string | undefined): Promise<string> {
      if (!guestId) {
        return t('desk.today.unknown_guest', {}, 'Unknown guest');
      }
      try {
        const guest = await apiFetch<{ fullName?: string }>('/v1/guests/GetGuest', {
          method: 'POST',
          body: JSON.stringify({ guestId }),
        });
        return guest.fullName ?? t('desk.today.unknown_guest', {}, 'Unknown guest');
      } catch (err) {
        if (isSignedOut(err)) {
          throw err;
        }
        return t('desk.today.unknown_guest', {}, 'Unknown guest');
      }
    }

    // Planned checkout dates for occupied cards (Refs #420 join,
    // reused here): one single-day calendar read joined on stay ID.
    async function loadCheckoutDates(day: string): Promise<Record<string, string>> {
      try {
        const calendar = await apiFetch<{
          reservations?: Array<{ stayId?: string; departureDate?: string }>;
        }>('/v1/reservations/QueryCalendar', {
          method: 'POST',
          body: JSON.stringify({ dateFrom: day, dateTo: day }),
        });
        const dates: Record<string, string> = {};
        for (const entry of calendar.reservations ?? []) {
          if (entry.stayId && entry.departureDate) {
            dates[entry.stayId] = entry.departureDate;
          }
        }
        return dates;
      } catch (err) {
        if (isSignedOut(err)) {
          throw err;
        }
        return {};
      }
    }

    // Covering-block notes for out-of-service cards (Refs #420
    // read, reused here): the existing sellability read names the
    // block covering each room today in its STATE_ILLEGAL details.
    // The request field is `roomType` (name or id); the contract
    // rejects `roomTypeId` (Refs #420 fix).
    async function loadBlockNotes(
      outOfService: DisplayRoom[],
      day: string,
    ): Promise<Record<string, { reason: string; date: string }>> {
      const notes: Record<string, { reason: string; date: string }> = {};
      for (const room of outOfService) {
        if (!room.roomId) {
          continue;
        }
        try {
          await apiFetch('/v1/rooms/CheckRoomTypeSellability', {
            method: 'POST',
            body: JSON.stringify({
              roomType: room.roomTypeId,
              roomNumber: room.number,
              dateFrom: day,
              dateTo: day,
            }),
          });
        } catch (err) {
          if (isSignedOut(err)) {
            throw err;
          }
          const details = (err as ApiError).details as
            | { reason?: unknown; dateFrom?: unknown; dateTo?: unknown }
            | undefined;
          if (
            (err as ApiError).code === 'STATE_ILLEGAL' &&
            details !== undefined &&
            typeof details.reason === 'string' &&
            details.reason !== '' &&
            typeof details.dateFrom === 'string' &&
            typeof details.dateTo === 'string'
          ) {
            notes[room.roomId] = {
              reason: details.reason,
              date: details.dateFrom === details.dateTo
                ? details.dateFrom
                : `${details.dateFrom}–${details.dateTo}`,
            };
          }
        }
      }
      return notes;
    }

    async function refreshMap(): Promise<void> {
      businessDate.value = localBusinessDate();
      loading.value = true;
      loadError.value = '';
      // Refs #435: a refresh re-reads the map, so a stale refusal
      // banner clears instead of lingering after a resolved failure.
      housekeepingError.value = '';
      try {
        const listed = await apiFetch<{ roomTypes?: Array<{ id: string; name: string }> }>(
          '/v1/rooms/ListRoomTypes',
          { method: 'POST', body: JSON.stringify({}) },
        );
        const names: Record<string, string> = {};
        for (const type of listed.roomTypes ?? []) {
          if (type.id && type.name) {
            names[type.id] = type.name;
          }
        }
        roomTypeNames.value = names;

        const collected: DisplayRoom[] = [];
        for (const state of Object.keys(BACKEND_STATES)) {
          const answer = await apiFetch<{ rooms?: RoomRecord[] }>(
            '/v1/rooms/ListRoomsByState',
            { method: 'POST', body: JSON.stringify({ state }) },
          );
          for (const room of answer.rooms ?? []) {
            const display = BACKEND_STATES[room.state];
            if (display) {
              collected.push({ ...room, display });
            }
          }
        }
        rooms.value = collected;

        const lists = await apiFetch<{
          arrivals?: StayRecord[];
          inHouse?: StayRecord[];
        }>('/v1/stay/ListArrivalsDepartures', {
          method: 'POST',
          body: JSON.stringify({ businessDate: businessDate.value }),
        });

        const occupants: Record<string, string> = {};
        const stays: Record<string, string> = {};
        for (const stay of lists.inHouse ?? []) {
          const name = await resolveGuestName(stay.guestId);
          const roomRef = stay.currentRoomId ?? stay.roomId ?? '';
          if (roomRef) {
            occupants[roomRef] = name;
            if (stay.stayId) {
              stays[roomRef] = stay.stayId;
            }
          }
        }
        occupantNames.value = occupants;
        stayForRoom.value = stays;

        const arrivals: Record<string, string> = {};
        for (const stay of lists.arrivals ?? []) {
          const roomRef = stay.currentRoomId ?? stay.roomId ?? '';
          if (roomRef) {
            arrivals[roomRef] = await resolveGuestName(stay.guestId);
          }
        }
        arrivalGuests.value = arrivals;

        checkoutDates.value = (lists.inHouse ?? []).length > 0
          ? await loadCheckoutDates(businessDate.value)
          : {};
        blockNotes.value = await loadBlockNotes(
          collected.filter((room) => room.display === 'out-of-service'),
          businessDate.value,
        );
      } catch (err) {
        // The shared client already expired the session and routed
        // to the gate on 401: mirror the desk view by leaving the
        // session-expired notice for the gate to show.
        if (isSignedOut(err) || !session.isSignedIn) {
          expireToGate();
          return;
        }
        loadError.value = t(
          'desk.shell.request_failed',
          {},
          'That did not work. Try again; if it keeps failing, tell the manager.',
        );
      } finally {
        loading.value = false;
      }
    }

    async function onRefresh(): Promise<void> {
      await refreshMap();
    }

    function isBusy(roomNumber: string): boolean {
      return busyRooms.value[roomNumber] === true;
    }

    // Housekeeping buttons (Refs #435): clean advances
    // dirty-to-clean, inspect advances clean-to-inspected through
    // the existing `UpdateRoomState` transitions only. Success
    // re-reads the map so the chips match the cards by
    // construction; a refusal names the room in plain words and
    // leaves the map untouched.
    async function markRoom(
      room: DisplayRoom,
      newState: 'vacant-clean' | 'vacant-inspected',
    ): Promise<void> {
      const number = room.number;
      if (isBusy(number)) {
        return;
      }
      busyRooms.value[number] = true;
      housekeepingError.value = '';
      try {
        await apiFetch('/v1/rooms/UpdateRoomState', {
          method: 'POST',
          body: JSON.stringify({
            roomNumber: number,
            newState,
            actor: session.displayName ?? '',
          }),
        });
        await refreshMap();
      } catch (err) {
        if (isSignedOut(err) || !session.isSignedIn) {
          expireToGate();
          return;
        }
        housekeepingError.value = t(
          'desk.today.housekeeping_failed',
          { room: number },
          `Could not update room ${number}. It may have changed; refresh and try again.`,
        );
      } finally {
        busyRooms.value[number] = false;
      }
    }

    async function onMarkCleaned(room: DisplayRoom): Promise<void> {
      await markRoom(room, 'vacant-clean');
    }

    async function onMarkInspected(room: DisplayRoom): Promise<void> {
      await markRoom(room, 'vacant-inspected');
    }

    onMounted(() => {
      // A reload restores the Bearer token from sessionStorage: go
      // straight back to the map instead of stranding it.
      if (session.isSignedIn) {
        void refreshMap();
      }
    });

    return {
      t,
      businessDate,
      businessDateDisplay,
      loading,
      loadError,
      housekeepingError,
      chips,
      totalRooms,
      occupiedCount,
      floors,
      typeName,
      chipSeverity,
      chipLabel,
      noteFor,
      isBusy,
      onMarkCleaned,
      onMarkInspected,
      onRefresh,
    };
  },
});
</script>
