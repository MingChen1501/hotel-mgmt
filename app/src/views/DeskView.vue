<template>
  <main data-testid="desk-view">
    <h1>{{ t('desk.today.title', {}, 'Hotel Management — Desk Today') }}</h1>
    <noscript><p>This page needs JavaScript to sign in and load today's lists. No recent backup report — treat as failed. Note this message word for word and call support the same day (runbook section 6).</p></noscript>

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

    <section
      v-if="!session.isSignedIn"
      data-testid="desk-signin"
    >
      <h2>{{ t('desk.admin.sign_in', {}, 'Sign in') }}</h2>
      <form
        data-testid="desk-signin-form"
        @submit.prevent="onSignIn"
      >
        <label for="desk-signin-identity">
          {{ t('desk.admin.signin_identity', {}, 'Sign-in identity: ') }}
          <input
            id="desk-signin-identity"
            v-model="identity"
            name="signin-identity"
            autocomplete="username"
            data-testid="desk-signin-identity"
          >
        </label>
        <label for="desk-signin-secret">
          {{ t('desk.admin.secret', {}, 'Secret: ') }}
          <input
            id="desk-signin-secret"
            v-model="secret"
            name="signin-secret"
            type="password"
            autocomplete="current-password"
            data-testid="desk-signin-secret"
          >
        </label>
        <button
          type="submit"
          data-testid="desk-signin-submit"
        >
          {{ t('desk.admin.sign_in', {}, 'Sign in') }}
        </button>
      </form>
      <p
        v-if="signInError"
        role="alert"
        data-testid="desk-signin-error"
      >
        {{ signInError }}
      </p>
    </section>

    <section
      v-else
      data-testid="desk-dashboard"
    >
      <p>
        <span>{{ t('desk.admin.signed_in_as', {}, 'Signed in as ') }}</span><strong data-testid="desk-whoami">{{ displayName }}</strong>
        (<span data-testid="desk-myrole">{{ role }}</span>).
        <button
          id="desk-signout-button"
          type="button"
          data-testid="desk-signout"
          @click="onSignOut"
        >
          {{ t('desk.admin.signout', {}, 'Sign out') }}
        </button>
      </p>
      <p>
        <span>{{ t('desk.today.business_date', {}, 'Business date: ') }}</span><strong data-testid="desk-business-date">{{ businessDate }}</strong>
        <button
          id="desk-refresh-button"
          type="button"
          data-testid="desk-refresh"
          @click="onRefresh"
        >
          {{ t('desk.today.refresh', {}, 'Refresh') }}
        </button>
      </p>
      <p
        v-if="loading"
        data-testid="desk-loading"
      >
        {{ t('desk.today.loading', {}, 'Loading today’s lists…') }}
      </p>
      <p
        v-if="dashboardError"
        role="alert"
        data-testid="desk-dashboard-error"
      >
        {{ dashboardError }}
      </p>
      <p data-testid="desk-sheet-line">
        {{ sheetLine }}
      </p>

      <h2>{{ t('desk.today.arrivals', {}, 'Arriving today') }}</h2>
      <table
        id="desk-arrivals-table"
        data-testid="desk-arrivals-table"
      >
        <thead>
          <tr>
            <th>{{ t('desk.today.th_guest', {}, 'Guest') }}</th>
            <th>{{ t('desk.today.th_room', {}, 'Room') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="stay in arrivals"
            :key="stay.key"
          >
            <td>{{ stay.guestName }}</td>
            <td>{{ stay.roomLabel }}</td>
          </tr>
          <tr v-if="!loading && arrivals.length === 0">
            <td colspan="2">
              {{ t('desk.admin.no_entries', {}, 'No entries yet.') }}
            </td>
          </tr>
        </tbody>
      </table>

      <h2>{{ t('desk.today.in_house', {}, 'In house') }}</h2>
      <table
        id="desk-inhouse-table"
        data-testid="desk-inhouse-table"
      >
        <thead>
          <tr>
            <th>{{ t('desk.today.th_guest', {}, 'Guest') }}</th>
            <th>{{ t('desk.today.th_room', {}, 'Room') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="stay in inHouse"
            :key="stay.key"
          >
            <td>{{ stay.guestName }}</td>
            <td>{{ stay.roomLabel }}</td>
          </tr>
          <tr v-if="!loading && inHouse.length === 0">
            <td colspan="2">
              {{ t('desk.admin.no_entries', {}, 'No entries yet.') }}
            </td>
          </tr>
        </tbody>
      </table>

      <h2>{{ t('desk.today.departures', {}, 'Leaving today') }}</h2>
      <table
        id="desk-departures-table"
        data-testid="desk-departures-table"
      >
        <thead>
          <tr>
            <th>{{ t('desk.today.th_guest', {}, 'Guest') }}</th>
            <th>{{ t('desk.today.th_room', {}, 'Room') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="stay in departures"
            :key="stay.key"
          >
            <td>{{ stay.guestName }}</td>
            <td>{{ stay.roomLabel }}</td>
          </tr>
          <tr v-if="!loading && departures.length === 0">
            <td colspan="2">
              {{ t('desk.admin.no_entries', {}, 'No entries yet.') }}
            </td>
          </tr>
        </tbody>
      </table>

      <h2>{{ t('desk.today.attention', {}, 'Rooms needing attention') }}</h2>
      <h3>{{ t('desk.today.dirty', {}, 'Dirty') }}</h3>
      <ul data-testid="desk-dirty-list">
        <li
          v-for="room in dirty"
          :key="room.number"
        >
          {{ room.number }} — {{ t('desk.today.room_type', { roomType: room.roomTypeId }, `Room type ${room.roomTypeId}`) }}
        </li>
        <li v-if="!loading && dirty.length === 0">
          {{ t('desk.admin.no_entries', {}, 'No entries yet.') }}
        </li>
      </ul>
      <h3>{{ t('desk.today.uninspected', {}, 'Clean but uninspected') }}</h3>
      <ul data-testid="desk-uninspected-list">
        <li
          v-for="room in uninspected"
          :key="room.number"
        >
          {{ room.number }} — {{ t('desk.today.room_type', { roomType: room.roomTypeId }, `Room type ${room.roomTypeId}`) }}
        </li>
        <li v-if="!loading && uninspected.length === 0">
          {{ t('desk.admin.no_entries', {}, 'No entries yet.') }}
        </li>
      </ul>
      <h3>{{ t('desk.today.out_of_order', {}, 'Out of order') }}</h3>
      <ul data-testid="desk-outoforder-list">
        <li
          v-for="room in outOfOrder"
          :key="room.number"
        >
          {{ room.number }} — {{ t('desk.today.room_type', { roomType: room.roomTypeId }, `Room type ${room.roomTypeId}`) }}
        </li>
        <li v-if="!loading && outOfOrder.length === 0">
          {{ t('desk.admin.no_entries', {}, 'No entries yet.') }}
        </li>
      </ul>
    </section>
  </main>
</template>

<script lang="ts">
import { defineComponent, onMounted, ref } from 'vue';
import { apiFetch } from '../api/client';
import type { ApiError } from '../api/client';
import { t } from '../i18n';
import { useSessionStore } from '../stores/session';

// Desk today dashboard as Vue SFCs (Refs #293, ADR-0003).
// Behavioural port of the inline script in the former
// `frontend/desk.html` (read-only morning view: sign-in plus
// arrivals, in-house stays, departures, rooms needing housekeeping
// attention, and the DailySheet cross-check counts), plus the backup
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
  setup() {
    const session = useSessionStore();
    const identity = ref('');
    const secret = ref('');
    const signInError = ref('');
    const displayName = ref('');
    const role = ref('');
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
    const backupLine = ref(t('desk.entry.backup_loading', {}, 'Loading the latest backup report…'));
    const backupSupport = ref('');

    function signOutLocal(): void {
      session.signOut();
      secret.value = '';
      displayName.value = '';
      role.value = '';
    }

    async function resolveGuestName(guestId: string | undefined): Promise<string> {
      if (!guestId) {
        return t('desk.today.unknown_guest', { guestId }, 'Unknown guest ({guestId})');
      }
      try {
        const guest = await apiFetch<{ fullName?: string }>('/v1/guests/GetGuest', {
          method: 'POST',
          body: JSON.stringify({ guestId }),
        });
        return guest.fullName ?? String(guestId);
      } catch (err) {
        if (isSignedOut(err)) {
          throw err;
        }
        return t('desk.today.unknown_guest', { guestId }, 'Unknown guest ({guestId})');
      }
    }

    function roomLabelFor(stay: StayRecord): string {
      const roomRef = stay.currentRoomId ?? stay.roomId ?? '';
      if (!roomRef) {
        return t('desk.today.not_assigned', {}, 'Not assigned');
      }
      return t('desk.today.room_ref', { roomRef }, `Room ${roomRef}`);
    }

    async function resolveStays(stays: StayRecord[]): Promise<StayRow[]> {
      return Promise.all(
        stays.map(async (stay, index) => ({
          key: stay.stayId ?? `${stay.guestId ?? 'guest'}-${index}`,
          guestName: await resolveGuestName(stay.guestId),
          roomLabel: roomLabelFor(stay),
        })),
      );
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
        arrivals.value = await resolveStays(lists.arrivals ?? []);
        inHouse.value = await resolveStays(lists.inHouse ?? []);
        departures.value = await resolveStays(lists.departures ?? []);
        const dirtyRes = await apiFetch<{ rooms?: RoomRecord[] }>(
          '/v1/rooms/ListRoomsByState',
          { method: 'POST', body: JSON.stringify({ state: 'vacant-dirty' }) },
        );
        dirty.value = dirtyRes.rooms ?? [];
        const cleanRes = await apiFetch<{ rooms?: RoomRecord[] }>(
          '/v1/rooms/ListRoomsByState',
          { method: 'POST', body: JSON.stringify({ state: 'vacant-clean' }) },
        );
        uninspected.value = cleanRes.rooms ?? [];
        const blockedRes = await apiFetch<{ rooms?: RoomRecord[] }>(
          '/v1/rooms/ListRoomsByState',
          { method: 'POST', body: JSON.stringify({ state: 'out-of-order' }) },
        );
        outOfOrder.value = blockedRes.rooms ?? [];
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
        // The shared client already cleared the session and routed
        // to sign-in on 401: mirror the legacy page by surfacing
        // the session-expired catalogue string there.
        if (isSignedOut(err) || !session.isSignedIn) {
          signOutLocal();
          signInError.value = t(
            'desk.today.session_expired',
            {},
            'Session expired. Sign in again.',
          );
          return;
        }
        dashboardError.value = err instanceof Error ? err.message : 'Request failed.';
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

    async function onSignIn(): Promise<void> {
      signInError.value = '';
      try {
        const payload = await apiFetch<{ token: string; displayName: string; role: string }>(
          '/v1/admin/SignIn',
          {
            method: 'POST',
            body: JSON.stringify({ signinIdentity: identity.value, secret: secret.value }),
          },
        );
        session.signIn(payload.token);
        displayName.value = payload.displayName;
        role.value = payload.role;
        await refreshDashboard();
      } catch (err) {
        signInError.value = err instanceof Error ? err.message : 'Request failed.';
      }
    }

    async function onRefresh(): Promise<void> {
      await refreshDashboard();
      await loadBackupReport();
    }

    async function onSignOut(): Promise<void> {
      try {
        await apiFetch<unknown>('/v1/admin/SignOut', { method: 'POST', body: '{}' });
      } catch {
        // A dead token signs out locally all the same (legacy parity).
      }
      signOutLocal();
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
      session,
      identity,
      secret,
      signInError,
      displayName,
      role,
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
      backupLine,
      backupSupport,
      onSignIn,
      onRefresh,
      onSignOut,
    };
  },
});
</script>
