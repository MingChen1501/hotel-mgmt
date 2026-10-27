<template>
  <main data-testid="desk-view">
    <h1>{{ t('desk.today.title', {}, 'Desk today: arrivals, stays, and rooms needing attention') }}</h1>
    <p>{{ t('desk.today.intro', {}, 'The morning view: who arrives, who is in house, who leaves, and which rooms need attention.') }}</p>
    <noscript><p>This page needs JavaScript to load today's lists. No recent backup report — treat as failed. Note this message word for word and call support the same day (runbook section 6).</p></noscript>

    <section data-testid="desk-backup">
      <h2>{{ t('desk.entry.backup_heading', {}, 'Backup report') }}</h2>
      <p data-testid="desk-backup-report">
        {{ backupLine }}
      </p>
      <p
        v-if="backupSupport"
        data-testid="desk-backup-support"
      >
        {{ backupSupport }}
      </p>
    </section>

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

      <h2>{{ t('desk.today.arrivals', {}, 'Arriving today') }}</h2>
      <DataTable
        id="desk-arrivals-table"
        :value="arrivals"
        data-testid="desk-arrivals-table"
      >
        <Column
          field="guestName"
          :header="t('desk.today.th_guest', {}, 'Guest')"
        />
        <Column
          field="roomLabel"
          :header="t('desk.today.th_room', {}, 'Room')"
        />
        <template #empty>
          <span v-if="!loading">{{ t('desk.today.empty_arrivals', {}, 'No arrivals today. New bookings appear here.') }}</span>
        </template>
      </DataTable>

      <h2>{{ t('desk.today.in_house', {}, 'In house') }}</h2>
      <DataTable
        id="desk-inhouse-table"
        :value="inHouse"
        data-testid="desk-inhouse-table"
      >
        <Column
          field="guestName"
          :header="t('desk.today.th_guest', {}, 'Guest')"
        />
        <Column
          field="roomLabel"
          :header="t('desk.today.th_room', {}, 'Room')"
        />
        <template #empty>
          <span v-if="!loading">{{ t('desk.today.empty_inhouse', {}, 'No guests in house right now.') }}</span>
        </template>
      </DataTable>

      <h2>{{ t('desk.today.departures', {}, 'Leaving today') }}</h2>
      <DataTable
        id="desk-departures-table"
        :value="departures"
        data-testid="desk-departures-table"
      >
        <Column
          field="guestName"
          :header="t('desk.today.th_guest', {}, 'Guest')"
        />
        <Column
          field="roomLabel"
          :header="t('desk.today.th_room', {}, 'Room')"
        />
        <template #empty>
          <span v-if="!loading">{{ t('desk.today.empty_departures', {}, 'No departures today.') }}</span>
        </template>
      </DataTable>

      <h2>{{ t('desk.today.attention', {}, 'Rooms needing attention') }}</h2>
      <h3>{{ t('desk.today.dirty', {}, 'Dirty') }}</h3>
      <ul data-testid="desk-dirty-list">
        <li
          v-for="room in dirty"
          :key="room.number"
        >
          {{ room.number }} — {{ t('desk.today.room_type_unresolved', {}, 'Room type') }}
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
        >
          {{ room.number }} — {{ t('desk.today.room_type_unresolved', {}, 'Room type') }}
        </li>
        <li v-if="!loading && uninspected.length === 0">
          {{ t('desk.today.empty_uninspected', {}, 'No rooms waiting for inspection right now.') }}
        </li>
      </ul>
      <h3>{{ t('desk.today.out_of_order', {}, 'Out of order') }}</h3>
      <ul data-testid="desk-outoforder-list">
        <li
          v-for="room in outOfOrder"
          :key="room.number"
        >
          {{ room.number }} — {{ t('desk.today.room_type_unresolved', {}, 'Room type') }}
        </li>
        <li v-if="!loading && outOfOrder.length === 0">
          {{ t('desk.today.empty_outoforder', {}, 'No rooms out of order right now.') }}
        </li>
      </ul>

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
    </section>
  </main>
</template>

<script lang="ts">
import { defineComponent, onMounted, ref } from 'vue';
import Button from 'primevue/button';
import Column from 'primevue/column';
import DataTable from 'primevue/datatable';
import Message from 'primevue/message';
import Tag from 'primevue/tag';
import { apiFetch } from '../api/client';
import type { ApiError } from '../api/client';
import { t } from '../i18n';
import { useSessionStore } from '../stores/session';

// Desk today dashboard as Vue SFCs (Refs #293, ADR-0003).
// Behavioural port of the inline script in the former
// `frontend/desk.html` (read-only morning view: sign-in plus
// arrivals, in-house stays, departures, rooms needing housekeeping
// attention, the five-lane room-status board (Refs #371), and the
// DailySheet cross-check counts), plus the backup
// report line from the former `frontend/index.html` desk entry
// (Refs #116, #299): the newest `backup-report.json` renders as a
// human-readable success-or-failure line with the runbook support
// wording (NFR-BKP-2). The legacy pages are decommissioned and now
// 301-redirect to this view; it runs under `/app/`.
//
// Shared-migration contracts, same as the shell:
// - Bearer auth comes only from the Pinia session store via the
//   shared `apiFetch` client; a 401/UNAUTHENTICATED clears the
//   store and returns to sign-in (the single 401 path).
// - Every string goes through the catalogue `t()` wrapper with the
//   same fallbacks as `DeskMessages.msg` in the former legacy pages.
// - Errors switch on envelope codes, never on resolved wording.
// - Read-only: the only mutating ops are SignIn/SignOut (session,
//   not domain data). The backup feed is an unauthenticated static
//   file, so it loads over plain `fetch`, never `apiFetch`.

interface StayRow {
  key: string;
  guestName: string;
  roomLabel: string;
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
}

// Newest backup report published beside the static frontend by
// script/publish-backup-report.sh (issue #116): `line` is the
// runbook section 2 wording, `outcome` is success/failure, and
// `support` carries the runbook section 6 pointer on failure.
interface BackupReport {
  line?: unknown;
  outcome?: unknown;
  support?: unknown;
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
  components: { Button, Column, DataTable, Message, Tag },
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
    // Occupant names for occupied board cells, joined client-side
    // from the stay lists below (Refs #371: already-fetched data
    // only — no extra GetGuest calls).
    const occupantNames = ref<Record<string, string>>({});
    // Room-type names have no read op behind the desk UI
    // (Refs #370: follow-up tracks a GetRoomType/ListRoomTypes
    // read): attention rows render the room number with the generic
    // type label, never the raw type UUID.
    const roomNumbers = ref<Record<string, string>>({});
    const backupLine = ref(t('desk.entry.backup_loading', {}, 'Loading the latest backup report…'));
    const backupSupport = ref('');

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

    function roomLabelFor(stay: StayRecord): string {
      const roomRef = stay.currentRoomId ?? stay.roomId ?? '';
      if (!roomRef) {
        return t('desk.today.not_assigned', {}, 'Not assigned');
      }
      const number = roomNumbers.value[roomRef];
      if (number) {
        return t('desk.today.room_ref', { roomRef: number }, `Room ${number}`);
      }
      return t('desk.today.room_unknown', {}, 'Room number unavailable');
    }

    async function resolveStays(stays: StayRecord[]): Promise<StayRow[]> {
      return Promise.all(
        stays.map(async (stay, index) => {
          const guestName = await resolveGuestName(stay.guestId);
          const roomRef = stay.currentRoomId ?? stay.roomId ?? '';
          if (roomRef) {
            occupantNames.value[roomRef] = guestName;
          }
          return {
            key: stay.stayId ?? `${stay.guestId ?? 'guest'}-${index}`,
            guestName,
            roomLabel: roomLabelFor(stay),
          };
        }),
      );
    }

    function occupantNameFor(roomId: string | undefined): string {
      if (roomId && occupantNames.value[roomId]) {
        return occupantNames.value[roomId];
      }
      return t('desk.today.unknown_guest', {}, 'Unknown guest');
    }

    async function refreshDashboard(): Promise<void> {
      businessDate.value = localBusinessDate();
      loading.value = true;
      dashboardError.value = '';
      try {
        const lists = await apiFetch<{
          arrivals?: StayRecord[];
          inHouse?: StayRecord[];
          departures?: StayRecord[];
        }>('/v1/stay/ListArrivalsDepartures', {
          method: 'POST',
          body: JSON.stringify({ businessDate: businessDate.value }),
        });
        // Room numbers for the stay lists (Refs #370): stay rows
        // carry room UUIDs, so every housekeeping state is read to
        // map each room ID to its human number before resolving.
        const numbers: Record<string, string> = {};
        const byState: Record<string, RoomRecord[]> = {};
        for (const state of ['vacant-dirty', 'vacant-clean', 'vacant-inspected', 'occupied', 'out-of-order']) {
          const listed = await apiFetch<{ rooms?: RoomRecord[] }>(
            '/v1/rooms/ListRoomsByState',
            { method: 'POST', body: JSON.stringify({ state }) },
          );
          byState[state] = listed.rooms ?? [];
          for (const room of byState[state] ?? []) {
            if (room.roomId) {
              numbers[room.roomId] = room.number;
            }
          }
        }
        roomNumbers.value = numbers;
        occupantNames.value = {};
        arrivals.value = await resolveStays(lists.arrivals ?? []);
        inHouse.value = await resolveStays(lists.inHouse ?? []);
        departures.value = await resolveStays(lists.departures ?? []);
        dirty.value = byState['vacant-dirty'] ?? [];
        uninspected.value = byState['vacant-clean'] ?? [];
        outOfOrder.value = byState['out-of-order'] ?? [];
        occupied.value = byState['occupied'] ?? [];
        ready.value = byState['vacant-inspected'] ?? [];
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

    // Desk surface for the newest backup report (issue #116,
    // ported from the former `frontend/index.html` in #299): fetch
    // the static feed with no store, render the `line` verbatim, and
    // show the support wording on any failure. A missing or
    // unreadable feed counts as failed (runbook section 1,
    // NFR-BKP-2), same as the legacy page.
    async function loadBackupReport(): Promise<void> {
      backupSupport.value = '';
      try {
        const response = await globalThis.fetch('/backup-report.json', { cache: 'no-store' });
        if (!response.ok) {
          throw new Error('no report');
        }
        const report = (await response.json()) as BackupReport;
        if (!report || typeof report.line !== 'string' || !report.line) {
          throw new Error('bad report');
        }
        backupLine.value = report.line;
        if (report.outcome === 'failure') {
          backupSupport.value = typeof report.support === 'string' && report.support
            ? report.support
            : t(
              'desk.entry.backup_support',
              {},
              'Note this message word for word and call support the same day (runbook section 6).',
            );
        }
      } catch {
        backupLine.value = t(
          'desk.entry.backup_missing',
          {},
          'No recent backup report — treat as failed.',
        );
        backupSupport.value = t(
          'desk.entry.backup_support',
          {},
          'Note this message word for word and call support the same day (runbook section 6).',
        );
      }
    }

    async function onRefresh(): Promise<void> {
      await refreshDashboard();
      await loadBackupReport();
    }

    onMounted(() => {
      // The backup feed needs no session, so it loads on every
      // visit; the dashboard lists still wait for sign-in.
      void loadBackupReport();
      // A reload restores the Bearer token from sessionStorage: go
      // straight back to the dashboard instead of stranding it.
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
      backupLine,
      backupSupport,
      onRefresh,
    };
  },
});
</script>
