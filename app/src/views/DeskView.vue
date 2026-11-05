<template>
  <main data-testid="desk-view">
    <h1>{{ t('desk.today.title', {}, 'Desk today: arrivals, stays, and rooms needing attention') }}</h1>
    <p>{{ t('desk.today.intro', {}, 'The morning view: who arrives, who is in house, who leaves, and which rooms need attention.') }}</p>
    <noscript><p>{{ t('desk.entry.noscript_desk_lead', {}, "This page needs JavaScript to load today's lists.") }} {{ t('desk.entry.noscript_backup', {}, 'No recent backup report — treat as failed. Note this message word for word and call support the same day (runbook section 6).') }}</p></noscript>

    <section data-testid="desk-dashboard">
      <p>
        <span>{{ t('desk.today.business_date', {}, 'Business date: ') }}</span><strong data-testid="desk-business-date">{{ businessDate }}</strong>
        <Button
          id="desk-refresh-button"
          type="button"
          :label="t('desk.today.refresh', {}, 'Refresh')"
          data-testid="desk-refresh"
          @click="onRefresh"
        />
      </p>
      <Message
        v-if="loading"
        severity="info"
        data-testid="desk-loading"
      >
        {{ t('desk.today.loading', {}, 'Loading today’s lists…') }}
      </Message>
      <Message
        v-if="dashboardError"
        severity="error"
        role="alert"
        data-testid="desk-dashboard-error"
      >
        {{ dashboardError }}
      </Message>
      <p data-testid="desk-sheet-line">
        {{ sheetLine }}
      </p>

      <div class="desk-cards">
        <Card data-testid="desk-arrivals-card">
          <template #title>
            <h2>{{ t('desk.today.arrivals', {}, 'Arriving today') }}</h2>
          </template>
          <template #content>
            <DataTable
              id="desk-arrivals-table"
              :value="arrivals"
              data-testid="desk-arrivals-table"
            >
              <Column
                field="primary"
                :header="t('desk.today.th_guest', {}, 'Guest')"
              />
              <Column
                field="secondary"
                :header="t('desk.today.th_room_type', {}, 'Room type')"
              />
              <template #empty>
                <span v-if="!loading">{{ t('desk.today.empty_arrivals', {}, 'No arrivals today. New bookings appear here.') }}</span>
              </template>
            </DataTable>
          </template>
        </Card>

        <Card data-testid="desk-inhouse-card">
          <template #title>
            <h2>{{ t('desk.today.in_house', {}, 'In house') }}</h2>
          </template>
          <template #content>
            <DataTable
              id="desk-inhouse-table"
              :value="inHouse"
              data-testid="desk-inhouse-table"
            >
              <Column
                field="primary"
                :header="t('desk.today.th_guest', {}, 'Guest')"
              />
              <Column
                field="secondary"
                :header="t('desk.today.th_checkout', {}, 'Checkout')"
              />
              <template #empty>
                <span v-if="!loading">{{ t('desk.today.empty_inhouse', {}, 'No guests in house right now.') }}</span>
              </template>
            </DataTable>
          </template>
        </Card>

        <Card data-testid="desk-departures-card">
          <template #title>
            <h2>{{ t('desk.today.departures', {}, 'Leaving today') }}</h2>
          </template>
          <template #content>
            <DataTable
              id="desk-departures-table"
              :value="departures"
              data-testid="desk-departures-table"
            >
              <Column
                field="primary"
                :header="t('desk.today.th_guest', {}, 'Guest')"
              />
              <Column
                field="secondary"
                :header="t('desk.today.th_room_type', {}, 'Room type')"
              />
              <template #empty>
                <span v-if="!loading">{{ t('desk.today.empty_departures', {}, 'No check-outs today.') }}</span>
              </template>
            </DataTable>
          </template>
        </Card>

        <Card data-testid="desk-need-cleaning-card">
          <template #title>
            <h2>{{ t('desk.today.need_cleaning', {}, 'Rooms to clean') }}</h2>
          </template>
          <template #content>
            <Message
              v-if="housekeepingError"
              severity="error"
              role="alert"
              data-testid="desk-housekeeping-error"
            >
              {{ housekeepingError }}
            </Message>
            <h3>{{ t('desk.today.dirty', {}, 'Dirty') }}</h3>
            <ul data-testid="desk-dirty-list">
              <li
                v-for="room in dirty"
                :key="room.number"
                :data-testid="`desk-dirty-${room.number}`"
              >
                {{ room.number }} — {{ typeName(room.roomTypeId) }}
                <Button
                  type="button"
                  :label="t('desk.today.mark_cleaned', {}, 'Mark cleaned')"
                  :data-testid="`desk-mark-cleaned-${room.number}`"
                  :disabled="isBusy(room.number)"
                  :loading="isBusy(room.number)"
                  @click="onMarkCleaned(room)"
                />
              </li>
              <li v-if="!loading && dirty.length === 0">
                {{ t('desk.today.empty_dirty', {}, 'No dirty rooms right now. Rooms needing cleaning appear here.') }}
              </li>
            </ul>
            <h3>{{ t('desk.today.uninspected', {}, 'Clean but uninspected') }}</h3>
            <ul data-testid="desk-uninspected-list">
              <li
                v-for="room in uninspected"
                :key="room.number"
                :data-testid="`desk-clean-${room.number}`"
              >
                {{ room.number }} — {{ typeName(room.roomTypeId) }}
                <Button
                  type="button"
                  :label="t('desk.today.mark_inspected', {}, 'Mark inspected')"
                  :data-testid="`desk-mark-inspected-${room.number}`"
                  :disabled="isBusy(room.number)"
                  :loading="isBusy(room.number)"
                  @click="onMarkInspected(room)"
                />
              </li>
              <li v-if="!loading && uninspected.length === 0">
                {{ t('desk.today.empty_uninspected', {}, 'No rooms waiting for inspection right now.') }}
              </li>
            </ul>
          </template>
        </Card>

        <Card data-testid="desk-outofservice-card">
          <template #title>
            <h2>{{ t('desk.today.out_of_order', {}, 'Out of order') }}</h2>
          </template>
          <template #content>
            <ul data-testid="desk-outoforder-list">
              <li
                v-for="room in outOfOrder"
                :key="room.number"
                :data-testid="`desk-outoforder-${room.number}`"
              >
                {{ room.number }} — {{ typeName(room.roomTypeId) }}
                <span :data-testid="`desk-outoforder-note-${room.number}`">{{ outOfServiceNote(room) }}</span>
              </li>
              <li v-if="!loading && outOfOrder.length === 0">
                {{ t('desk.today.empty_outoforder', {}, 'No rooms out of order right now.') }}
              </li>
            </ul>
          </template>
        </Card>
      </div>

      <h2>{{ t('desk.board.title', {}, 'Room board') }}</h2>
      <p>{{ t('desk.board.intro', {}, 'Every room at a glance, grouped by state. Refresh to update.') }}</p>
      <div data-testid="desk-board">
        <section data-testid="desk-board-lane-occupied">
          <h3>{{ t('desk.board.lane_occupied', {}, 'Occupied') }} ({{ occupied.length }})</h3>
          <ul>
            <li
              v-for="room in occupied"
              :key="room.roomId ?? room.number"
              :data-testid="'desk-board-cell-' + room.number"
            >
              <Tag
                severity="info"
                :value="room.number"
              /> {{ occupantNameFor(room.roomId) }}
            </li>
            <li v-if="!loading && occupied.length === 0">
              {{ t('desk.board.empty_lane', {}, 'No rooms in this state right now.') }}
            </li>
          </ul>
        </section>
        <section data-testid="desk-board-lane-ready">
          <h3>{{ t('desk.board.lane_ready', {}, 'Ready (inspected)') }} ({{ ready.length }})</h3>
          <ul>
            <li
              v-for="room in ready"
              :key="room.roomId ?? room.number"
              :data-testid="'desk-board-cell-' + room.number"
            >
              <Tag
                severity="success"
                :value="room.number"
              />
            </li>
            <li v-if="!loading && ready.length === 0">
              {{ t('desk.board.empty_lane', {}, 'No rooms in this state right now.') }}
            </li>
          </ul>
        </section>
        <section data-testid="desk-board-lane-clean">
          <h3>{{ t('desk.board.lane_clean', {}, 'Clean, awaiting inspection') }} ({{ uninspected.length }})</h3>
          <ul>
            <li
              v-for="room in uninspected"
              :key="room.roomId ?? room.number"
              :data-testid="'desk-board-cell-' + room.number"
            >
              <Tag
                severity="warning"
                :value="room.number"
              />
            </li>
            <li v-if="!loading && uninspected.length === 0">
              {{ t('desk.board.empty_lane', {}, 'No rooms in this state right now.') }}
            </li>
          </ul>
        </section>
        <section data-testid="desk-board-lane-dirty">
          <h3>{{ t('desk.board.lane_dirty', {}, 'Dirty') }} ({{ dirty.length }})</h3>
          <ul>
            <li
              v-for="room in dirty"
              :key="room.roomId ?? room.number"
              :data-testid="'desk-board-cell-' + room.number"
            >
              <Tag
                severity="warning"
                :value="room.number"
              />
            </li>
            <li v-if="!loading && dirty.length === 0">
              {{ t('desk.board.empty_lane', {}, 'No rooms in this state right now.') }}
            </li>
          </ul>
        </section>
        <section data-testid="desk-board-lane-out-of-order">
          <h3>{{ t('desk.board.lane_out_of_order', {}, 'Out of order') }} ({{ outOfOrder.length }})</h3>
          <ul>
            <li
              v-for="room in outOfOrder"
              :key="room.roomId ?? room.number"
              :data-testid="'desk-board-cell-' + room.number"
            >
              <Tag
                severity="danger"
                :value="room.number"
              />
            </li>
            <li v-if="!loading && outOfOrder.length === 0">
              {{ t('desk.board.empty_lane', {}, 'No rooms in this state right now.') }}
            </li>
          </ul>
        </section>
      </div>

      <section
        v-if="!loading && !dashboardError"
        data-testid="desk-roommap"
      >
        <h2>{{ t('desk.rooms.title', {}, 'Room map') }}</h2>
        <p>{{ t('desk.rooms.intro', {}, 'Every room at a glance, grouped by floor. Refresh to update.') }}</p>
        <p>
          <RouterLink
            :to="{ name: 'rooms' }"
            data-testid="desk-roommap-manage"
          >
            {{ t('desk.map.manage', {}, 'Manage rooms') }}
          </RouterLink>
        </p>
        <p
          v-if="totalMapRooms === 0"
          data-testid="desk-roommap-empty"
        >
          {{ t('desk.rooms.empty', {}, 'No rooms yet. Rooms appear here once they are set up.') }}
        </p>
        <template v-else>
          <section data-testid="desk-roommap-summary">
            <h2>{{ t('desk.rooms.summary_heading', {}, 'Rooms by status') }}</h2>
            <ul>
              <li
                v-for="chip in mapChips"
                :key="chip.status"
                :data-testid="`desk-roommap-chip-${chip.status}`"
              >
                <Tag
                  :severity="chip.severity"
                  :value="chip.label"
                /> ({{ chip.count }})
              </li>
            </ul>
          </section>

          <section
            v-for="floor in mapFloors"
            :key="floor.key"
            :data-testid="floor.unknown ? 'desk-roommap-floor-unknown' : 'desk-roommap-floor'"
          >
            <h2>{{ floor.title }}</h2>
            <ul>
              <li
                v-for="room in floor.rooms"
                :key="room.number"
                :data-testid="`desk-roommap-room-${room.number}`"
              >
                <h3>
                  <RouterLink
                    :to="{ name: 'rooms' }"
                    :data-testid="`desk-roommap-open-${room.number}`"
                  >
                    {{ room.number }}
                  </RouterLink>
                </h3>
                <p>
                  <Tag
                    :severity="mapChipSeverity(room.display)"
                    :value="mapChipLabel(room.display)"
                    :data-testid="`desk-roommap-card-chip-${room.number}`"
                  />
                </p>
                <p :data-testid="`desk-roommap-card-type-${room.number}`">
                  {{ typeName(room.roomTypeId) }}
                </p>
              </li>
            </ul>
          </section>
        </template>
      </section>
    </section>
  </main>
</template>

<script lang="ts">
import { computed, defineComponent, onMounted, ref } from 'vue';
import Button from 'primevue/button';
import Card from 'primevue/card';
import Column from 'primevue/column';
import DataTable from 'primevue/datatable';
import Message from 'primevue/message';
import Tag from 'primevue/tag';
import { RouterLink } from 'vue-router';
import { apiFetch } from '../api/client';
import type { ApiError } from '../api/client';
import { t } from '../i18n';
import { useSessionStore } from '../stores/session';

// Desk today dashboard as Vue SFCs (Refs #293, ADR-0003; Main board
// restyle Refs #420 per the owner design rollout #419).
// Behavioural port of the inline script in the former
// `frontend/desk.html` (read-only morning view: sign-in plus
// arrivals, in-house stays, departures, rooms needing housekeeping
// attention, the five-lane room-status board (Refs #371), and the
// DailySheet cross-check counts). The legacy pages are decommissioned
// and now 301-redirect to this view; it runs under `/app/`.
// Node-by-node against the owner design `docs/design/Main.dc.html`
// (Refs #489): the design carries the business-date row plus six
// cards and nothing else, so the legacy backup-report section from
// the former `frontend/index.html` desk entry (Refs #116, #299) is
// gone — FR-ADM-5/NFR-BKP-2 direct the backup report to the
// owner/manager, and the admin audit surface already lists backup
// reports, so the reception board is not its surface. Deliberately
// kept with justification: the h1 plus intro (screen title,
// accessibility, consistent with every screen); the merged
// need-cleaning card (holds exactly the design's dirty plus
// awaiting-inspection content with the same two buttons; splitting
// it into two cards would collide with the #490 empty-state
// alignment); the DailySheet cross-check line (its open-balances
// count exists nowhere else on the desk screen); the five-lane
// room-status board (owner-requested in #371); and the room-map
// section (owner-requested in #479, alignment owned by #491).
// The #420 restyle groups the morning lists into the five design
// cards (arrivals, in-house, departures-or-empty, need-cleaning,
// out-of-service) and adds the two housekeeping action buttons on
// the need-cleaning card: clean advances dirty-to-clean and inspect
// advances clean-to-inspected through the existing
// `UpdateRoomState` transitions only (LLD section 13.2, FR-RMS-2,
// NFR-AUD-1 hold) — no transition logic changes here.
// The #490 alignment shapes the three stay-table internals
// node by node against the `Main.dc.html` card rows: each table
// renders two cells guest-first (arrivals pair the guest with the
// booking code from the calendar join and the booked room type;
// in-house pairs the guest with the room number and the planned
// checkout date in design DD/MM form; departures extend the same
// pattern with the freeing room and its type — the design card is
// empty-state-only, so no departure row shape exists to copy), and
// the departures empty state repeats the design wording. A stay
// with no joined code or date still renders guest plus catalogue
// wording, never a raw UUID.
// The #479 room-map section reuses the same five state reads: the
// lane lists above are retagged into the /rooms display vocabulary
// (floor groups, status chips with counts) with PrimeVue Tag
// styling, and every entry links through to the `rooms` route —
// actions stay on /rooms, so this view performs no room writes
// beyond the two housekeeping buttons above.
//
// Shared-migration contracts, same as the shell:
// - Bearer auth comes only from the Pinia session store via the
//   shared `apiFetch` client; a 401/UNAUTHENTICATED clears the
//   store and returns to sign-in (the single 401 path).
// - Every string goes through the catalogue `t()` wrapper with the
//   same fallbacks as `DeskMessages.msg` in the former legacy pages.
// - Errors switch on envelope codes, never on resolved wording.
// - The only mutating ops are SignIn/SignOut (session,
//   not domain data) plus the two housekeeping buttons
//   (`UpdateRoomState` on room numbers the board already lists).

interface StayRow {
  key: string;
  // Design two-cell rows (Refs #490): the guest-first primary cell
  // plus the card-specific secondary cell (room type, checkout
  // date), matching the left/right spans of each design card row.
  primary: string;
  secondary: string;
}

interface StayRecord {
  stayId?: string;
  guestId?: string;
  currentRoomId?: string;
  roomId?: string;
}

interface RoomRecord {
  roomId?: string;
  number: string;
  roomTypeId: string;
  floor?: string | null;
}

// Room-map display vocabulary (Refs #479, FR-DSK-6): the same five
// display states, chip labels, and severities as the /rooms screen,
// so both surfaces stay worded and coloured alike. The map derives
// from the five lane lists the dashboard already reads — no new
// endpoints, no backend changes.
type MapDisplayStatus =
  | 'ready'
  | 'occupied'
  | 'needs-cleaning'
  | 'awaiting-inspection'
  | 'out-of-service';

interface MapRoom extends RoomRecord {
  display: MapDisplayStatus;
}

interface MapFloorGroup {
  key: string;
  title: string;
  unknown: boolean;
  rooms: MapRoom[];
}

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
  name: 'DeskView',
  // eslint-disable-next-line vue/no-reserved-component-names -- PrimeVue registers Button/Dialog under these canonical names (Refs #338 component mapping).
  components: { Button, Card, Column, DataTable, Message, RouterLink, Tag },
  setup() {
    const session = useSessionStore();
    const businessDate = ref(localBusinessDate());
    const loading = ref(false);
    const dashboardError = ref('');
    const sheetLine = ref('');
    const arrivals = ref<StayRow[]>([]);
    const inHouse = ref<StayRow[]>([]);
    const departures = ref<StayRow[]>([]);
    const dirty = ref<RoomRecord[]>([]);
    const uninspected = ref<RoomRecord[]>([]);
    const outOfOrder = ref<RoomRecord[]>([]);
    // Board lanes reusing the same state reads (Refs #371): occupied
    // and ready (vacant-inspected) complete the five-lane board; the
    // other three lanes render the attention lists above.
    const occupied = ref<RoomRecord[]>([]);
    const ready = ref<RoomRecord[]>([]);
    // Room-map section (Refs #479, FR-DSK-6): the same rooms the
    // lanes above already list, retagged into the /rooms display
    // vocabulary and grouped by floor. The summary chips and the
    // floor cards derive from this one computed list, so counts
    // match cards by construction — no new endpoints, no backend
    // changes. Entries link through to /rooms; actions stay there.
    const mapRooms = computed<MapRoom[]>(() => [
      ...occupied.value.map((room) => ({ ...room, display: 'occupied' as const })),
      ...ready.value.map((room) => ({ ...room, display: 'ready' as const })),
      ...dirty.value.map((room) => ({ ...room, display: 'needs-cleaning' as const })),
      ...uninspected.value.map((room) => ({ ...room, display: 'awaiting-inspection' as const })),
      ...outOfOrder.value.map((room) => ({ ...room, display: 'out-of-service' as const })),
    ]);

    const totalMapRooms = computed(() => mapRooms.value.length);

    const mapChips = computed(() => {
      const counts: Record<MapDisplayStatus, number> = {
        ready: 0,
        occupied: 0,
        'needs-cleaning': 0,
        'awaiting-inspection': 0,
        'out-of-service': 0,
      };
      for (const room of mapRooms.value) {
        counts[room.display] += 1;
      }
      return (Object.keys(counts) as MapDisplayStatus[]).map((status) => ({
        status,
        label: mapChipLabel(status),
        severity: mapChipSeverity(status),
        count: counts[status],
      }));
    });

    const mapFloors = computed<MapFloorGroup[]>(() => {
      const groups = new Map<string, MapRoom[]>();
      const unknown: MapRoom[] = [];
      for (const room of mapRooms.value) {
        // Trim the grouping key (Refs #479): payloads may pad the
        // floor label, and untrimmed keys would split one floor
        // into duplicate groups.
        const key = typeof room.floor === 'string' ? room.floor.trim() : '';
        if (key !== '') {
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
      const byNumber = (a: MapRoom, b: MapRoom): number =>
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

    // Occupant names for occupied board cells, joined client-side
    // from the stay lists below (Refs #371: already-fetched data
    // only — no extra GetGuest calls).
    const occupantNames = ref<Record<string, string>>({});
    // Room-type names resolve through ListRoomTypes (issue
    // #372): room rows render the human type name, and typeName
    // falls back to the generic label when the type is unknown —
    // never the raw type UUID.
    // Room-type names (issue #372): one ListRoomTypes read fills
    // this map; typeName resolves the human name and falls back to
    // the generic label when the type is unknown, never the raw ID.
    const roomTypeNames = ref<Record<string, string>>({});

    // The shell owns the one sign-in gate (Refs #338): a
    // 401/UNAUTHENTICATED expires the shared session, the gate
    // takes over, and the stored notice tells the stand-in the
    // session ended in plain words.
    function expireToGate(): void {
      session.expireSession();
    }

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

    // Room records keyed by room UUID (Refs #420): the stay
    // lists carry room UUIDs, so this map resolves each stay row
    // to its human number plus type name for the design cards.
    const roomsById = ref<Record<string, RoomRecord>>({});
    // Planned checkout dates plus booking codes keyed by stay UUID
    // (Refs #490): joined client-side from the reservation calendar
    // below, so each in-house row names its checkout date and each
    // arrival row names its booking code per the design.
    const checkoutDates = ref<Record<string, string>>({});
    const bookingRefs = ref<Record<string, string>>({});
    // Out-of-service notes keyed by room UUID (Refs #420): the
    // covering block reason plus date, resolved through the
    // existing sellability read (no new endpoint) — rooms with no
    // covering block render the catalogue unknown-reason line.
    const blockNotes = ref<Record<string, { reason: string; date: string }>>({});
    // Housekeeping action state (Refs #420, LLD section 13.2): the
    // two need-cleaning buttons stay disabled per room until their
    // own call returns, and a refusal names the room in plain
    // words without touching the board.
    const housekeepingError = ref('');
    const busyRooms = ref<Record<string, boolean>>({});

    function roomDetail(roomId: string | undefined): string {
      if (!roomId) {
        return t('desk.today.not_assigned', {}, 'Not assigned');
      }
      const room = roomsById.value[roomId];
      if (!room) {
        return t('desk.today.room_unknown', {}, 'Room number unavailable');
      }
      return joinDetail(shortRoom(room), typeName(room.roomTypeId));
    }

    function joinDetail(name: string, detail: string): string {
      return t('desk.today.name_detail', { name, detail }, `${name} · ${detail}`);
    }

    function shortRoom(room: RoomRecord): string {
      return t('desk.today.room_short', { room: room.number }, `Room ${room.number}`);
    }

    async function resolveStays(
      stays: StayRecord[],
      build: (stay: StayRecord, guestName: string) => { primary: string; secondary: string },
    ): Promise<StayRow[]> {
      return Promise.all(
        stays.map(async (stay, index) => {
          const guestName = await resolveGuestName(stay.guestId);
          const roomRef = stay.currentRoomId ?? stay.roomId ?? '';
          if (roomRef) {
            occupantNames.value[roomRef] = guestName;
          }
          return {
            key: stay.stayId ?? `${stay.guestId ?? 'guest'}-${index}`,
            ...build(stay, guestName),
          };
        }),
      );
    }

    // Design card rows (Refs #490, docs/design/Main.dc.html): each
    // row is two cells, guest first. The arrivals card pairs the
    // guest with the booking code and the room type (arrivals hold
    // no room yet, only the booked type); the in-house card pairs
    // the guest with the room number and the planned checkout date;
    // the departures card is empty in the design, so its rows extend
    // the same two-cell pattern with the freeing room and its type.
    // A stay with no joined code or date still renders its guest
    // plus catalogue wording — never a raw UUID.
    function arrivalCells(stay: StayRecord, guestName: string): { primary: string; secondary: string } {
      const code = stay.stayId ? bookingRefs.value[stay.stayId] : undefined;
      const primary = code ? joinDetail(guestName, code) : guestName;
      const roomRef = stay.currentRoomId ?? stay.roomId ?? '';
      const room = roomRef ? roomsById.value[roomRef] : undefined;
      return { primary, secondary: typeName(room?.roomTypeId) };
    }

    function inHouseCells(stay: StayRecord, guestName: string): { primary: string; secondary: string } {
      const roomRef = stay.currentRoomId ?? stay.roomId ?? '';
      const room = roomRef ? roomsById.value[roomRef] : undefined;
      const primary = room
        ? joinDetail(guestName, shortRoom(room))
        : joinDetail(guestName, t('desk.today.not_assigned', {}, 'Not assigned'));
      const date = stay.stayId ? checkoutDates.value[stay.stayId] : undefined;
      if (date) {
        return {
          primary,
          secondary: t('desk.today.until_date', { date: formatShortDate(date) }, `until ${formatShortDate(date)}`),
        };
      }
      return { primary, secondary: roomDetail(roomRef) };
    }

    function departureCells(stay: StayRecord, guestName: string): { primary: string; secondary: string } {
      const roomRef = stay.currentRoomId ?? stay.roomId ?? '';
      const room = roomRef ? roomsById.value[roomRef] : undefined;
      const primary = room
        ? joinDetail(guestName, shortRoom(room))
        : joinDetail(guestName, t('desk.today.not_assigned', {}, 'Not assigned'));
      return { primary, secondary: typeName(room?.roomTypeId) };
    }

    // Design short date (Refs #490: "đến 30/10"): the calendar
    // carries ISO dates, so design-facing cells render DD/MM.
    // Unparseable input renders as-is rather than blanking the row.
    function formatShortDate(iso: string): string {
      const parts = iso.split('-');
      if (parts.length === 3 && parts[0].length === 4 && parts[1].length === 2 && parts[2].length === 2) {
        return `${parts[2]}/${parts[1]}`;
      }
      return iso;
    }

    // Out-of-service note per the design (Refs #420): the covering
    // block reason plus date when the sellability read below found
    // one, else the catalogue unknown-reason line — never blank.
    function outOfServiceNote(room: RoomRecord): string {
      const note = room.roomId ? blockNotes.value[room.roomId] : undefined;
      if (note) {
        return t(
          'desk.today.out_of_service_detail',
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

    function isBusy(roomNumber: string): boolean {
      return busyRooms.value[roomNumber] === true;
    }

    // The two housekeeping buttons (Refs #420, LLD section 13.2):
    // clean advances dirty-to-clean, inspect advances
    // clean-to-inspected through the existing `UpdateRoomState`
    // transitions only. Success reloads the board so the counts
    // match the lanes by construction; a refusal names the room
    // in plain words (FR-DSP-3) and leaves the board untouched.
    async function markRoom(
      room: RoomRecord,
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
        await refreshDashboard();
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

    async function onMarkCleaned(room: RoomRecord): Promise<void> {
      await markRoom(room, 'vacant-clean');
    }

    async function onMarkInspected(room: RoomRecord): Promise<void> {
      await markRoom(room, 'vacant-inspected');
    }

    function occupantNameFor(roomId: string | undefined): string {
      if (roomId && occupantNames.value[roomId]) {
        return occupantNames.value[roomId];
      }
      return t('desk.today.unknown_guest', {}, 'Unknown guest');
    }

    function typeName(roomTypeId: string | undefined): string {
      if (roomTypeId && roomTypeNames.value[roomTypeId]) {
        return roomTypeNames.value[roomTypeId];
      }
      return t('desk.today.room_type_unresolved', {}, 'Room type');
    }

    // Room-map chip vocabulary (Refs #479): identical wording and
    // colour meaning to the /rooms screen on both surfaces.
    function mapChipSeverity(status: MapDisplayStatus): string {
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

    function mapChipLabel(status: MapDisplayStatus): string {
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

    async function loadRoomTypeNames(): Promise<void> {
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
      } catch (err) {
        // The generic type label covers a failed read (Refs #372):
        // attention rows never render the raw type UUID.
        if (isSignedOut(err)) {
          throw err;
        }
      }
    }

    // Planned checkout dates plus booking codes for the design
    // cards (Refs #490): one single-day calendar read joined on
    // stay ID — dates feed the in-house checkout cells, refs feed
    // the arrivals booking-code cells. Best effort — a calendar
    // outage leaves both maps empty and the rows fall back to
    // catalogue wording, never a raw UUID.
    async function loadCalendarMaps(day: string): Promise<{ dates: Record<string, string>; refs: Record<string, string> }> {
      try {
        const calendar = await apiFetch<{
          reservations?: Array<{ stayId?: string; reservationRef?: string; departureDate?: string }>;
        }>('/v1/reservations/QueryCalendar', {
          method: 'POST',
          body: JSON.stringify({ dateFrom: day, dateTo: day }),
        });
        const dates: Record<string, string> = {};
        const refs: Record<string, string> = {};
        for (const entry of calendar.reservations ?? []) {
          if (!entry.stayId) {
            continue;
          }
          if (entry.departureDate) {
            dates[entry.stayId] = entry.departureDate;
          }
          if (entry.reservationRef) {
            refs[entry.stayId] = entry.reservationRef;
          }
        }
        return { dates, refs };
      } catch (err) {
        if (isSignedOut(err)) {
          throw err;
        }
        return { dates: {}, refs: {} };
      }
    }

    // Covering-block notes for the out-of-service design card
    // (Refs #420): the existing sellability read names the block
    // covering each room today in its STATE_ILLEGAL details
    // (reason plus date range). Rooms with no covering block keep
    // no entry and render the catalogue unknown-reason line.
    async function loadBlockNotes(
      rooms: RoomRecord[],
      day: string,
    ): Promise<Record<string, { reason: string; date: string }>> {
      const notes: Record<string, { reason: string; date: string }> = {};
      for (const room of rooms) {
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

    async function refreshDashboard(): Promise<void> {
      businessDate.value = localBusinessDate();
      loading.value = true;
      dashboardError.value = '';
      try {
        await loadRoomTypeNames();
        const lists = await apiFetch<{
          arrivals?: StayRecord[];
          inHouse?: StayRecord[];
          departures?: StayRecord[];
        }>('/v1/stay/ListArrivalsDepartures', {
          method: 'POST',
          body: JSON.stringify({ businessDate: businessDate.value }),
        });
        // Room records for the stay lists (Refs #370): stay rows
        // carry room UUIDs, so every housekeeping state is read to
        // map each room ID to its record before resolving. The same
        // payload fills the room-by-ID map backing the design-card
        // details (Refs #490: number plus type name).
        const byId: Record<string, RoomRecord> = {};
        const byState: Record<string, RoomRecord[]> = {};
        for (const state of ['vacant-dirty', 'vacant-clean', 'vacant-inspected', 'occupied', 'out-of-order']) {
          const listed = await apiFetch<{ rooms?: RoomRecord[] }>(
            '/v1/rooms/ListRoomsByState',
            { method: 'POST', body: JSON.stringify({ state }) },
          );
          byState[state] = listed.rooms ?? [];
          for (const room of byState[state] ?? []) {
            if (room.roomId) {
              byId[room.roomId] = room;
            }
          }
        }
        roomsById.value = byId;
        // Planned checkout dates plus booking codes (Refs #490):
        // the reservation calendar joined on stay ID. Skipped when
        // every stay list is empty, and a calendar outage degrades
        // to catalogue-worded rows rather than failing the board.
        const calendarMaps = (lists.arrivals ?? []).length > 0
          || (lists.inHouse ?? []).length > 0
          || (lists.departures ?? []).length > 0
          ? await loadCalendarMaps(businessDate.value)
          : { dates: {}, refs: {} };
        checkoutDates.value = calendarMaps.dates;
        bookingRefs.value = calendarMaps.refs;
        occupantNames.value = {};
        arrivals.value = await resolveStays(lists.arrivals ?? [], arrivalCells);
        inHouse.value = await resolveStays(lists.inHouse ?? [], inHouseCells);
        departures.value = await resolveStays(lists.departures ?? [], departureCells);
        dirty.value = byState['vacant-dirty'] ?? [];
        uninspected.value = byState['vacant-clean'] ?? [];
        outOfOrder.value = byState['out-of-order'] ?? [];
        occupied.value = byState['occupied'] ?? [];
        ready.value = byState['vacant-inspected'] ?? [];
        // Out-of-service notes for the design card (Refs #420):
        // resolved after the lanes so each room carries its type.
        blockNotes.value = await loadBlockNotes(outOfOrder.value, businessDate.value);
        const sheet = await apiFetch<{
          arrivals?: unknown[];
          inHouse?: unknown[];
          departures?: unknown[];
          openBalances?: unknown[];
          asOf?: string;
        }>('/v1/reporting/DailySheet', {
          method: 'POST',
          body: JSON.stringify({ businessDate: businessDate.value }),
        });
        sheetLine.value = t(
          'desk.today.sheet_line',
          {
            arrivals: (sheet.arrivals ?? []).length,
            inHouse: (sheet.inHouse ?? []).length,
            departures: (sheet.departures ?? []).length,
            openBalances: (sheet.openBalances ?? []).length,
            asOf: sheet.asOf ?? '',
          },
          '{arrivals} arriving, {inHouse} in house, {departures} leaving, {openBalances} open balances (as of {asOf}).',
        );
      } catch (err) {
        // The shared client already expired the session and routed
        // to the gate on 401: mirror the legacy page by leaving
        // the session-expired notice for the gate to show.
        if (isSignedOut(err) || !session.isSignedIn) {
          expireToGate();
          return;
        }
        dashboardError.value = t(
          'desk.shell.request_failed',
          {},
          'That did not work. Try again; if it keeps failing, tell the manager.',
        );
      } finally {
        loading.value = false;
      }
    }

    async function onRefresh(): Promise<void> {
      await refreshDashboard();
    }

    onMounted(() => {
      // A reload restores the Bearer token from sessionStorage: go
      // straight back to the dashboard instead of stranding it.
      // The dashboard lists still wait for sign-in.
      if (session.isSignedIn) {
        void refreshDashboard();
      }
    });

    return {
      t,
      businessDate,
      loading,
      dashboardError,
      sheetLine,
      arrivals,
      inHouse,
      departures,
      dirty,
      uninspected,
      outOfOrder,
      occupied,
      ready,
      occupantNameFor,
      typeName,
      outOfServiceNote,
      mapChips,
      mapFloors,
      totalMapRooms,
      mapChipSeverity,
      mapChipLabel,
      isBusy,
      onMarkCleaned,
      onMarkInspected,
      housekeepingError,
      onRefresh,
    };
  },
});
</script>
