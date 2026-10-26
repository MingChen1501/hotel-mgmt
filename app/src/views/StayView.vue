<template>
  <main data-testid="stay-view">
    <h1>{{ t('desk.stay.title', {}, 'Hotel Management — Desk Stay') }}</h1>
    <p>
      <a href="/app/">{{ t('desk.stay.back', {}, 'Back to the desk entry') }}</a> ·
      <a href="/app/">{{ t('desk.stay.today_link', {}, "Today's arrivals, in-house, and departures") }}</a> ·
      <a href="/app/folio">{{ t('desk.entry.folio_link', {}, 'Stay folio (charges and payments)') }}</a>
    </p>
    <noscript><p>This page needs JavaScript to sign in and run the stay lifecycle.</p></noscript>

    <section
      v-if="!session.isSignedIn"
      data-testid="stay-signin"
    >
      <h2>{{ t('desk.admin.sign_in', {}, 'Sign in') }}</h2>
      <form
        data-testid="stay-signin-form"
        @submit.prevent="onSignIn"
      >
        <label for="stay-signin-identity">
          {{ t('desk.admin.signin_identity', {}, 'Sign-in identity: ') }}
          <input
            id="stay-signin-identity"
            v-model="identity"
            name="signin-identity"
            autocomplete="username"
            data-testid="stay-signin-identity"
          >
        </label>
        <label for="stay-signin-secret">
          {{ t('desk.admin.secret', {}, 'Secret: ') }}
          <input
            id="stay-signin-secret"
            v-model="secret"
            name="signin-secret"
            type="password"
            autocomplete="current-password"
            data-testid="stay-signin-secret"
          >
        </label>
        <button
          type="submit"
          data-testid="stay-signin-submit"
        >
          {{ t('desk.admin.sign_in', {}, 'Sign in') }}
        </button>
      </form>
      <p
        v-if="signInError"
        role="alert"
        data-testid="stay-signin-error"
      >
        {{ signInError }}
      </p>
    </section>

    <section
      v-else
      data-testid="stay-main"
    >
      <p>
        <span>{{ t('desk.admin.signed_in_as', {}, 'Signed in as ') }}</span><strong data-testid="stay-whoami">{{ displayName }}</strong>
        (<span data-testid="stay-myrole">{{ role }}</span>).
        <button
          id="stay-signout-button"
          type="button"
          data-testid="stay-signout"
          @click="onSignOut"
        >
          {{ t('desk.admin.signout', {}, 'Sign out') }}
        </button>
      </p>

      <h2>{{ t('desk.stay.lists_heading', {}, 'Stay lists for the business date') }}</h2>
      <p>
        <span>{{ t('desk.today.business_date', {}, 'Business date: ') }}</span><strong data-testid="stay-business-date">{{ businessDate }}</strong>
        <button
          id="stay-refresh-button"
          type="button"
          data-testid="stay-refresh"
          @click="onRefresh"
        >
          {{ t('desk.today.refresh', {}, 'Refresh') }}
        </button>
      </p>
      <p
        v-if="listsError"
        role="alert"
        data-testid="stay-lists-error"
      >
        {{ listsError }}
      </p>

      <h3>{{ t('desk.stay.arrivals', {}, 'Arriving today') }}</h3>
      <table
        id="stay-arrivals-table"
        data-testid="stay-arrivals-table"
      >
        <thead>
          <tr>
            <th>{{ t('desk.stay.th_guest', {}, 'Guest') }}</th>
            <th>{{ t('desk.stay.th_room', {}, 'Room') }}</th>
            <th>{{ t('desk.stay.th_times', {}, 'Recorded times') }}</th>
            <th>{{ t('desk.stay.th_action', {}, 'Action') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="row in arrivalRows"
            :key="row.key"
          >
            <td>{{ row.guestName }}</td>
            <td>{{ row.roomLabel }}</td>
            <td>{{ row.timesText }}</td>
            <td>
              <button
                v-if="row.reservationRef"
                type="button"
                :data-testid="`stay-use-arrival-${row.reservationRef}`"
                @click="pickArrival(row.reservationRef)"
              >
                {{ t('desk.stay.use_arrival', {}, 'Use for check-in') }}
              </button>
            </td>
          </tr>
          <tr v-if="arrivalRows.length === 0">
            <td colspan="4">
              {{ t('desk.admin.no_entries', {}, 'No entries yet.') }}
            </td>
          </tr>
        </tbody>
      </table>

      <h3>{{ t('desk.stay.in_house', {}, 'In house') }}</h3>
      <table
        id="stay-inhouse-table"
        data-testid="stay-inhouse-table"
      >
        <thead>
          <tr>
            <th>{{ t('desk.stay.th_guest', {}, 'Guest') }}</th>
            <th>{{ t('desk.stay.th_room', {}, 'Room') }}</th>
            <th>{{ t('desk.stay.th_times', {}, 'Recorded times') }}</th>
            <th>{{ t('desk.stay.th_action', {}, 'Action') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="row in inHouseRows"
            :key="row.key"
          >
            <td>{{ row.guestName }}</td>
            <td>{{ row.roomLabel }}</td>
            <td>{{ row.timesText }}</td>
            <td>
              <button
                v-if="row.stayId"
                type="button"
                :data-testid="`stay-use-stay-${row.stayId}`"
                @click="pickStay(row.stayId)"
              >
                {{ t('desk.stay.use_stay', {}, 'Use this stay') }}
              </button>
            </td>
          </tr>
          <tr v-if="inHouseRows.length === 0">
            <td colspan="4">
              {{ t('desk.admin.no_entries', {}, 'No entries yet.') }}
            </td>
          </tr>
        </tbody>
      </table>

      <h3>{{ t('desk.stay.departures', {}, 'Leaving today') }}</h3>
      <table
        id="stay-departures-table"
        data-testid="stay-departures-table"
      >
        <thead>
          <tr>
            <th>{{ t('desk.stay.th_guest', {}, 'Guest') }}</th>
            <th>{{ t('desk.stay.th_room', {}, 'Room') }}</th>
            <th>{{ t('desk.stay.th_times', {}, 'Recorded times') }}</th>
            <th>{{ t('desk.stay.th_action', {}, 'Action') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="row in departureRows"
            :key="row.key"
          >
            <td>{{ row.guestName }}</td>
            <td>{{ row.roomLabel }}</td>
            <td>{{ row.timesText }}</td>
            <td>
              <button
                v-if="row.stayId"
                type="button"
                :data-testid="`stay-use-stay-${row.stayId}`"
                @click="pickStay(row.stayId)"
              >
                {{ t('desk.stay.use_stay', {}, 'Use this stay') }}
              </button>
            </td>
          </tr>
          <tr v-if="departureRows.length === 0">
            <td colspan="4">
              {{ t('desk.admin.no_entries', {}, 'No entries yet.') }}
            </td>
          </tr>
        </tbody>
      </table>

      <h2>{{ t('desk.stay.checkin_heading', {}, 'Check in an arrival') }}</h2>
      <div>
        <label for="stay-booking-ref">
          {{ t('desk.stay.booking_ref', {}, 'Booking reference: ') }}
          <input
            id="stay-booking-ref"
            v-model="bookingRef"
            name="booking-ref"
            autocomplete="off"
            data-testid="stay-booking-ref"
            @input="onBookingRefInput"
          >
        </label>
        <label for="stay-checkin-arrival">
          {{ t('desk.stay.actual_arrival', {}, 'Actual arrival (leave blank for now): ') }}
          <input
            id="stay-checkin-arrival"
            v-model="checkinArrival"
            name="checkin-arrival"
            type="datetime-local"
            data-testid="stay-checkin-arrival"
          >
        </label>
        <br>
        <label for="stay-checkin-room">
          {{ t('desk.stay.room_label', {}, 'Ready room: ') }}
          <select
            id="stay-checkin-room"
            v-model="checkinRoomId"
            data-testid="stay-checkin-room"
          >
            <option
              v-for="room in checkinCandidates"
              :key="room.roomId"
              :value="room.roomId"
            >
              {{ room.number }}
            </option>
          </select>
        </label>
        <button
          id="stay-checkin-button"
          type="button"
          data-testid="stay-checkin"
          :disabled="checkingIn"
          @click="onCheckIn"
        >
          {{ t('desk.stay.checkin_button', {}, 'Check in') }}
        </button>
        <p
          role="status"
          data-testid="stay-checkin-status"
        >
          {{ checkinStatus }}
        </p>
        <p
          v-if="checkinError"
          role="alert"
          data-testid="stay-checkin-error"
        >
          {{ checkinError }}
        </p>
      </div>

      <h2>{{ t('desk.stay.move_heading', {}, 'Move a guest mid-stay') }}</h2>
      <div>
        <label for="stay-move-stay-id">
          {{ t('desk.stay.stay_id', {}, 'Stay ID: ') }}
          <input
            id="stay-move-stay-id"
            v-model="moveStayId"
            name="move-stay-id"
            autocomplete="off"
            data-testid="stay-move-stay-id"
          >
        </label>
        <label for="stay-move-room">
          {{ t('desk.stay.target_room', {}, 'Move to room: ') }}
          <select
            id="stay-move-room"
            v-model="moveRoomId"
            data-testid="stay-move-room"
          >
            <option
              v-for="room in readyRooms"
              :key="room.roomId"
              :value="room.roomId"
            >
              {{ room.number }}
            </option>
          </select>
        </label>
        <button
          id="stay-move-button"
          type="button"
          data-testid="stay-move"
          :disabled="moving"
          @click="onMove"
        >
          {{ t('desk.stay.move_button', {}, 'Move') }}
        </button>
        <p
          role="status"
          data-testid="stay-move-status"
        >
          {{ moveStatus }}
        </p>
        <p
          v-if="moveError"
          role="alert"
          data-testid="stay-move-error"
        >
          {{ moveError }}
        </p>
      </div>

      <h2>{{ t('desk.stay.times_heading', {}, 'Record early arrivals and late departures') }}</h2>
      <div>
        <label for="stay-times-stay-id">
          {{ t('desk.stay.stay_id', {}, 'Stay ID: ') }}
          <input
            id="stay-times-stay-id"
            v-model="timesStayId"
            name="times-stay-id"
            autocomplete="off"
            data-testid="stay-times-stay-id"
          >
        </label>
        <label for="stay-times-arrival">
          {{ t('desk.stay.actual_arrival', {}, 'Actual arrival (leave blank for now): ') }}
          <input
            id="stay-times-arrival"
            v-model="timesArrival"
            name="times-arrival"
            type="datetime-local"
            data-testid="stay-times-arrival"
          >
        </label>
        <label for="stay-times-departure">
          {{ t('desk.stay.actual_departure', {}, 'Actual departure (leave blank for now): ') }}
          <input
            id="stay-times-departure"
            v-model="timesDeparture"
            name="times-departure"
            type="datetime-local"
            data-testid="stay-times-departure"
          >
        </label>
        <button
          id="stay-times-button"
          type="button"
          data-testid="stay-times"
          :disabled="recording"
          @click="onRecordTimes"
        >
          {{ t('desk.stay.times_button', {}, 'Record times') }}
        </button>
        <p
          role="status"
          data-testid="stay-times-status"
        >
          {{ timesStatus }}
        </p>
        <p
          v-if="timesError"
          role="alert"
          data-testid="stay-times-error"
        >
          {{ timesError }}
        </p>
      </div>

      <h2>{{ t('desk.stay.checkout_heading', {}, 'Check out with folio review') }}</h2>
      <div>
        <label for="stay-checkout-stay-id">
          {{ t('desk.stay.stay_id', {}, 'Stay ID: ') }}
          <input
            id="stay-checkout-stay-id"
            v-model="checkoutStayId"
            name="checkout-stay-id"
            autocomplete="off"
            data-testid="stay-checkout-stay-id"
            @input="onCheckoutStayInput"
          >
        </label>
        <label for="stay-checkout-departure">
          {{ t('desk.stay.actual_departure', {}, 'Actual departure (leave blank for now): ') }}
          <input
            id="stay-checkout-departure"
            v-model="checkoutDeparture"
            name="checkout-departure"
            type="datetime-local"
            data-testid="stay-checkout-departure"
          >
        </label>
        <button
          id="stay-review-button"
          type="button"
          data-testid="stay-review"
          :disabled="reviewing"
          @click="onReview"
        >
          {{ t('desk.stay.review_button', {}, 'Review folio') }}
        </button>
        <p
          role="status"
          data-testid="stay-folio-status"
        >
          {{ folioStatus }}
        </p>
        <div
          v-if="showApproval"
          data-testid="stay-approval-section"
        >
          <label for="stay-approval-by">
            {{ t('desk.stay.approved_by', {}, 'Approved by: ') }}
            <input
              id="stay-approval-by"
              v-model="approvalBy"
              name="approval-by"
              autocomplete="off"
              data-testid="stay-approval-by"
            >
          </label>
          <label for="stay-approval-role">
            {{ t('desk.stay.approver_role', {}, 'Approver role: ') }}
            <input
              id="stay-approval-role"
              v-model="approvalRole"
              name="approval-role"
              autocomplete="off"
              data-testid="stay-approval-role"
            >
          </label>
          <label for="stay-approval-reason">
            {{ t('desk.stay.approval_reason', {}, 'Reason (optional): ') }}
            <input
              id="stay-approval-reason"
              v-model="approvalReason"
              name="approval-reason"
              autocomplete="off"
              data-testid="stay-approval-reason"
            >
          </label>
          <button
            id="stay-approve-button"
            type="button"
            data-testid="stay-approve"
            :disabled="approving"
            @click="onApprove"
          >
            {{ t('desk.stay.approve_button', {}, 'Record approval') }}
          </button>
        </div>
        <button
          id="stay-checkout-button"
          type="button"
          data-testid="stay-checkout"
          :disabled="!canCheckOut || checkingOut"
          @click="onCheckOut"
        >
          {{ t('desk.stay.checkout_button', {}, 'Check out') }}
        </button>
        <p
          role="status"
          data-testid="stay-checkout-status"
        >
          {{ checkoutStatus }}
        </p>
        <p
          v-if="checkoutError"
          role="alert"
          data-testid="stay-checkout-error"
        >
          {{ checkoutError }}
        </p>
      </div>
    </section>
  </main>
</template>

<script lang="ts">
import { computed, defineComponent, ref } from 'vue';
import { apiFetch } from '../api/client';
import type { ApiError } from '../api/client';
import { t } from '../i18n';
import { useSessionStore } from '../stores/session';

// Stay screen as Vue SFCs (Refs #295, ADR-0003).
// Behavioural port of the inline script in `frontend/stay.html`
// (Screen 3: check in from a booking reference, mid-stay move,
// actual-time recording, and check-out behind the folio-balance
// gate). The legacy page is untouched and stays served in
// parallel; this view runs under `/app/` (`/app/stay`).
//
// Shared-migration contracts, same as the desk and book screens:
// - Bearer auth comes only from the Pinia session store via the
//   shared `apiFetch` client; a 401/UNAUTHENTICATED clears the
//   store and returns to sign-in (the single 401 path).
// - Every string goes through the catalogue `t()` wrapper with the
//   same fallbacks as the legacy `messages.js` helper in the page.
// - Errors switch on envelope codes, never on resolved wording.
// - Op order, same as the legacy page: AssignRoom (roomNumber,
//   businessDate, a client-generated stayId as stayLink) ->
//   CheckIn (stayId, reservationId and guestId from GetReservation,
//   roomId from the AssignRoom echo) -> CheckInReservation
//   (reservationRef, stayId); AssignRoom (target) -> MoveRoom;
//   RecordActualTimes; GetFolioBalance -> RecordOpenBalanceApproval
//   when the balance is open -> CheckOut carrying the reviewed
//   folio id, balance, and the recorded approval. Daily lists come
//   from ListArrivalsDepartures with guest names via GetGuest; room
//   numbers resolve through ListRoomsByState. Every mutating click
//   carries an in-flight guard plus a client-generated
//   idempotencyKey wherever the contract defines one (AssignRoom,
//   MoveRoom, RecordOpenBalanceApproval, CheckOut).

interface StayRow {
  stayId?: string;
  reservationRef?: string;
  guestId?: string;
  roomId?: string;
  actualArrival?: string | null;
  actualDeparture?: string | null;
}

interface StayListRow {
  key: string;
  guestName: string;
  roomLabel: string;
  timesText: string;
  reservationRef?: string;
  stayId?: string;
}

interface RoomRecord {
  roomId: string;
  number: string;
  roomTypeId: string;
}

interface CheckoutContext {
  stayId: string;
  folioId: string;
  balanceMinor: number;
  approval: unknown;
}

function localBusinessDate(): string {
  const now = new Date();
  const pad = (value: number): string => (value < 10 ? '0' : '') + String(value);
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function plainAmount(minor: number): string {
  return (minor / 100).toFixed(2);
}

function toISO(value: string): string | null {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function isSignedOut(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as ApiError).code === 'UNAUTHENTICATED'
  );
}

function errorCode(err: unknown): string {
  return typeof err === 'object' && err !== null
    ? String((err as ApiError).code ?? '')
    : '';
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Request failed.';
}

function newIdempotencyKey(): string {
  try {
    const randomId = globalThis.crypto?.randomUUID?.();
    if (typeof randomId === 'string' && randomId.length > 0) {
      return randomId;
    }
  } catch {
    // Below: non-crypto fallback, same as the legacy page.
  }
  return `${String(Date.now())}-${String(Math.random()).slice(2)}`;
}

export default defineComponent({
  name: 'StayView',
  setup() {
    const session = useSessionStore();
    const identity = ref('');
    const secret = ref('');
    const signInError = ref('');
    const displayName = ref('');
    const role = ref('');
    const businessDate = ref(localBusinessDate());
    const listsError = ref('');
    const arrivalRows = ref<StayListRow[]>([]);
    const inHouseRows = ref<StayListRow[]>([]);
    const departureRows = ref<StayListRow[]>([]);

    const roomNumbers = ref<Record<string, string>>({});
    const readyRooms = ref<RoomRecord[]>([]);
    const checkinCandidates = ref<RoomRecord[]>([]);
    const checkinRooms = ref<Record<string, string>>({});
    const checkinRef = ref<string | null>(null);

    const bookingRef = ref('');
    const checkinArrival = ref('');
    const checkinRoomId = ref('');
    const checkinStatus = ref('');
    const checkinError = ref('');
    const checkingIn = ref(false);

    const moveStayId = ref('');
    const moveRoomId = ref('');
    const moveStatus = ref('');
    const moveError = ref('');
    const moving = ref(false);

    const timesStayId = ref('');
    const timesArrival = ref('');
    const timesDeparture = ref('');
    const timesStatus = ref('');
    const timesError = ref('');
    const recording = ref(false);

    const checkoutStayId = ref('');
    const checkoutDeparture = ref('');
    const folioStatus = ref('');
    const checkoutStatus = ref('');
    const checkoutError = ref('');
    const reviewing = ref(false);
    const approving = ref(false);
    const checkingOut = ref(false);
    const showApproval = ref(false);
    const approvalBy = ref('');
    const approvalRole = ref('');
    const approvalReason = ref('');
    const checkoutCtx = ref<CheckoutContext | null>(null);

    const canCheckOut = computed(
      () =>
        checkoutCtx.value !== null &&
        (checkoutCtx.value.balanceMinor === 0 || checkoutCtx.value.approval !== null),
    );

    function signOutLocal(): void {
      session.signOut();
      secret.value = '';
      displayName.value = '';
      role.value = '';
      checkoutCtx.value = null;
    }

    function refuseSession(): void {
      signOutLocal();
      signInError.value = t(
        'desk.today.session_expired',
        {},
        'Session expired. Sign in again.',
      );
    }

    function roomLabel(roomId: string | undefined): string {
      if (!roomId) {
        return t('desk.today.not_assigned', {}, 'Not assigned');
      }
      const number = roomNumbers.value[roomId];
      if (number) {
        return number;
      }
      return t('desk.today.room_ref', { roomRef: roomId }, `Room ${roomId}`);
    }

    function timesLine(arrival: string | null | undefined, departure: string | null | undefined): string {
      if (!arrival && !departure) {
        return t('desk.stay.times_empty', {}, 'No times recorded yet.');
      }
      return t(
        'desk.stay.times_line',
        { actualArrival: arrival ?? '', actualDeparture: departure ?? '' },
        `Arrived ${arrival ?? '-'}, leaving ${departure ?? '-'}.`,
      );
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

    async function renderRows(rows: StayRow[], kind: 'arrival' | 'stay'): Promise<StayListRow[]> {
      return Promise.all(
        rows.map(async (row, index) => {
          const guestName = await resolveGuestName(row.guestId);
          return {
            key: row.stayId ?? row.reservationRef ?? `${kind}-${index}`,
            guestName,
            roomLabel: roomLabel(row.roomId),
            timesText: timesLine(row.actualArrival, row.actualDeparture),
            reservationRef: row.reservationRef,
            stayId: row.stayId,
          };
        }),
      );
    }

    async function refreshLists(): Promise<void> {
      businessDate.value = localBusinessDate();
      listsError.value = '';
      try {
        const lists = await apiFetch<{
          arrivals?: StayRow[];
          inHouse?: StayRow[];
          departures?: StayRow[];
        }>('/v1/stay/ListArrivalsDepartures', {
          method: 'POST',
          body: JSON.stringify({ businessDate: businessDate.value }),
        });
        const inspected = await apiFetch<{ rooms?: RoomRecord[] }>(
          '/v1/rooms/ListRoomsByState',
          { method: 'POST', body: JSON.stringify({ state: 'vacant-inspected' }) },
        );
        const occupied = await apiFetch<{ rooms?: RoomRecord[] }>(
          '/v1/rooms/ListRoomsByState',
          { method: 'POST', body: JSON.stringify({ state: 'occupied' }) },
        );
        const numbers: Record<string, string> = {};
        const ready = inspected.rooms ?? [];
        readyRooms.value = ready;
        [...ready, ...(occupied.rooms ?? [])].forEach((room) => {
          numbers[room.roomId] = room.number;
        });
        roomNumbers.value = numbers;
        arrivalRows.value = await renderRows(lists.arrivals ?? [], 'arrival');
        inHouseRows.value = await renderRows(lists.inHouse ?? [], 'stay');
        departureRows.value = await renderRows(lists.departures ?? [], 'stay');
      } catch (err) {
        if (isSignedOut(err) || !session.isSignedIn) {
          refuseSession();
          return;
        }
        listsError.value = errorMessage(err);
      }
    }

    function pickArrival(reservationRef: string | undefined): void {
      if (reservationRef) {
        bookingRef.value = reservationRef;
        checkinRef.value = null;
        checkinStatus.value = '';
        checkinError.value = '';
      } else {
        checkinStatus.value = t('desk.stay.need_ref', {}, 'Enter the booking reference first.');
      }
    }

    function pickStay(stayId: string | undefined): void {
      if (!stayId) {
        return;
      }
      moveStayId.value = stayId;
      timesStayId.value = stayId;
      checkoutStayId.value = stayId;
      checkoutCtx.value = null;
      showApproval.value = false;
      moveStatus.value = t('desk.stay.stay_ready', { stayId }, `Working with stay ${stayId}.`);
      timesStatus.value = '';
      checkoutStatus.value = '';
      checkoutError.value = '';
    }

    function onBookingRefInput(): void {
      checkinRef.value = null;
    }

    function onCheckoutStayInput(): void {
      checkoutCtx.value = null;
      showApproval.value = false;
      checkoutStatus.value = '';
      checkoutError.value = '';
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
        await refreshLists();
      } catch (err) {
        signInError.value = errorMessage(err);
      }
    }

    async function onSignOut(): Promise<void> {
      try {
        await apiFetch<unknown>('/v1/admin/SignOut', { method: 'POST', body: '{}' });
      } catch {
        // A dead token signs out locally all the same (legacy parity).
      }
      signOutLocal();
    }

    function onRefresh(): Promise<void> {
      return refreshLists();
    }

    async function onCheckIn(): Promise<void> {
      if (checkingIn.value) {
        return;
      }
      checkinError.value = '';
      const refValue = bookingRef.value.trim();
      if (!refValue) {
        checkinStatus.value = t('desk.stay.need_ref', {}, 'Enter the booking reference first.');
        return;
      }
      // First click loads the booking and the ready rooms of the
      // booked type into the picker (the quote step of the booking
      // form); the second click commits the check-in.
      if (checkinRef.value !== refValue) {
        checkingIn.value = true;
        try {
          let booking: { roomTypeId: string };
          try {
            booking = await apiFetch<{ roomTypeId: string }>('/v1/reservations/GetReservation', {
              method: 'POST',
              body: JSON.stringify({ reservationRef: refValue }),
            });
          } catch (err) {
            if (isSignedOut(err)) {
              refuseSession();
              return;
            }
            if (errorCode(err) === 'NOT_FOUND') {
              checkinError.value = t(
                'desk.stay.refused_unknown_ref',
                {},
                'Unknown booking reference. Check the reference and try again.',
              );
              return;
            }
            checkinError.value = errorMessage(err);
            return;
          }
          const rooms = await apiFetch<{ rooms?: RoomRecord[] }>(
            '/v1/rooms/ListRoomsByState',
            { method: 'POST', body: JSON.stringify({ state: 'vacant-inspected' }) },
          );
          const candidates = (rooms.rooms ?? []).filter(
            (room) => room.roomTypeId === booking.roomTypeId,
          );
          if (candidates.length === 0) {
            checkinStatus.value = t(
              'desk.stay.booked_type',
              { roomTypeId: booking.roomTypeId },
              `Booked room type: ${booking.roomTypeId}.`,
            );
            checkinError.value = t(
              'desk.stay.no_ready_rooms',
              {},
              'No ready rooms of the booked type right now.',
            );
            return;
          }
          checkinRef.value = refValue;
          const roomsById: Record<string, string> = {};
          candidates.forEach((room) => {
            roomsById[room.roomId] = room.number;
            roomNumbers.value[room.roomId] = room.number;
          });
          checkinRooms.value = roomsById;
          checkinCandidates.value = candidates;
          checkinRoomId.value = '';
          checkinStatus.value = t(
            'desk.stay.booked_type',
            { roomTypeId: booking.roomTypeId },
            `Booked room type: ${booking.roomTypeId}.`,
          );
          checkinError.value = t('desk.stay.need_room', {}, 'Pick a ready room first.');
        } catch (err) {
          if (isSignedOut(err)) {
            refuseSession();
            return;
          }
          checkinError.value = errorMessage(err);
        } finally {
          checkingIn.value = false;
        }
        return;
      }
      const selectedRoomId = checkinRoomId.value;
      if (!selectedRoomId || !checkinRooms.value[selectedRoomId]) {
        checkinError.value = t('desk.stay.need_room', {}, 'Pick a ready room first.');
        return;
      }
      checkingIn.value = true;
      try {
        const stayId = newIdempotencyKey();
        let assigned: { roomId: string; roomNumber: string };
        try {
          assigned = await apiFetch<{ roomId: string; roomNumber: string }>(
            '/v1/rooms/AssignRoom',
            {
              method: 'POST',
              body: JSON.stringify({
                roomNumber: checkinRooms.value[selectedRoomId],
                businessDate: localBusinessDate(),
                stayLink: stayId,
                actor: displayName.value,
                idempotencyKey: newIdempotencyKey(),
              }),
            },
          );
        } catch (err) {
          if (isSignedOut(err)) {
            refuseSession();
            return;
          }
          if (errorCode(err) === 'CONFLICT') {
            checkinRef.value = null;
            checkinError.value = t(
              'desk.stay.refused_taken',
              {},
              'That room was just taken. Pick another ready room.',
            );
            return;
          }
          checkinError.value = errorMessage(err);
          return;
        }
        let readback: { reservationId: string; guest?: { guestId?: string } };
        try {
          readback = await apiFetch<{
            reservationId: string;
            guest?: { guestId?: string };
          }>('/v1/reservations/GetReservation', {
            method: 'POST',
            body: JSON.stringify({ reservationRef: refValue }),
          });
        } catch (err) {
          if (isSignedOut(err)) {
            refuseSession();
            return;
          }
          checkinError.value = errorMessage(err);
          return;
        }
        const checkinBody: Record<string, unknown> = {
          stayId,
          reservationId: readback.reservationId,
          guestId: readback.guest?.guestId ?? null,
          roomId: assigned.roomId,
          actor: displayName.value,
        };
        const actualArrival = toISO(checkinArrival.value);
        if (actualArrival) {
          checkinBody.actualArrival = actualArrival;
        }
        try {
          await apiFetch<unknown>('/v1/stay/CheckIn', {
            method: 'POST',
            body: JSON.stringify(checkinBody),
          });
        } catch (err) {
          if (isSignedOut(err)) {
            refuseSession();
            return;
          }
          if (errorCode(err) === 'CONFLICT') {
            checkinError.value = t(
              'desk.stay.refused_checked_in',
              {},
              'That booking is already checked in.',
            );
            return;
          }
          checkinError.value = errorMessage(err);
          return;
        }
        try {
          await apiFetch<unknown>('/v1/reservations/CheckInReservation', {
            method: 'POST',
            body: JSON.stringify({ reservationRef: refValue, stayId, actor: displayName.value }),
          });
        } catch (err) {
          if (isSignedOut(err)) {
            refuseSession();
            return;
          }
          checkinError.value = errorMessage(err);
          return;
        }
        checkinStatus.value = t(
          'desk.stay.checked_in',
          { stayId, roomNumber: assigned.roomNumber },
          `Checked in: stay ${stayId} in room ${assigned.roomNumber}.`,
        );
        bookingRef.value = '';
        checkinArrival.value = '';
        checkinRef.value = null;
        await refreshLists();
      } catch (err) {
        if (isSignedOut(err)) {
          refuseSession();
          return;
        }
        checkinError.value = errorMessage(err);
      } finally {
        checkingIn.value = false;
      }
    }

    async function onMove(): Promise<void> {
      if (moving.value) {
        return;
      }
      moveError.value = '';
      const stayId = moveStayId.value.trim();
      if (!stayId) {
        moveStatus.value = t('desk.stay.need_stay', {}, 'Choose a stay from the lists first.');
        return;
      }
      const toRoomId = moveRoomId.value;
      if (!toRoomId) {
        moveError.value = t('desk.stay.need_room', {}, 'Pick a ready room first.');
        return;
      }
      let fromRoomId: string | null = null;
      try {
        const current = await apiFetch<{ inHouse?: StayRow[] }>(
          '/v1/stay/ListArrivalsDepartures',
          { method: 'POST', body: JSON.stringify({ businessDate: localBusinessDate() }) },
        );
        (current.inHouse ?? []).forEach((row) => {
          if (row.stayId === stayId) {
            fromRoomId = row.roomId ?? null;
          }
        });
      } catch (err) {
        if (isSignedOut(err)) {
          refuseSession();
          return;
        }
        moveError.value = errorMessage(err);
        return;
      }
      moving.value = true;
      try {
        const target = readyRooms.value.filter((room) => room.roomId === toRoomId)[0];
        const assigned = await apiFetch<{ roomId: string; roomNumber: string }>(
          '/v1/rooms/AssignRoom',
          {
            method: 'POST',
            body: JSON.stringify({
              roomNumber: target ? target.number : toRoomId,
              businessDate: localBusinessDate(),
              stayLink: stayId,
              actor: displayName.value,
              idempotencyKey: newIdempotencyKey(),
            }),
          },
        );
        const moved = await apiFetch<{ move: { movedAt: string } }>('/v1/stay/MoveRoom', {
          method: 'POST',
          body: JSON.stringify({
            stayId,
            toRoomId: assigned.roomId,
            actor: displayName.value,
            idempotencyKey: newIdempotencyKey(),
          }),
        });
        roomNumbers.value[assigned.roomId] = assigned.roomNumber;
        const fromNumber = fromRoomId
          ? roomLabel(fromRoomId)
          : t('desk.today.not_assigned', {}, 'Not assigned');
        moveStatus.value = t(
          'desk.stay.moved',
          { fromRoom: fromNumber, toRoom: assigned.roomNumber, movedAt: moved.move.movedAt },
          `Moved from room ${fromNumber} to room ${assigned.roomNumber} at ${moved.move.movedAt}.`,
        );
        await refreshLists();
      } catch (err) {
        if (isSignedOut(err)) {
          refuseSession();
          return;
        }
        if (errorCode(err) === 'CONFLICT') {
          moveError.value = t(
            'desk.stay.refused_taken',
            {},
            'That room was just taken. Pick another ready room.',
          );
          await refreshLists();
          return;
        }
        moveError.value = errorMessage(err);
      } finally {
        moving.value = false;
      }
    }

    async function onRecordTimes(): Promise<void> {
      if (recording.value) {
        return;
      }
      timesError.value = '';
      const stayId = timesStayId.value.trim();
      if (!stayId) {
        timesStatus.value = t('desk.stay.need_stay', {}, 'Choose a stay from the lists first.');
        return;
      }
      const actualArrival = toISO(timesArrival.value);
      const actualDeparture = toISO(timesDeparture.value);
      if (!actualArrival && !actualDeparture) {
        timesStatus.value = t(
          'desk.stay.need_times',
          {},
          'Enter an arrival or a departure time first.',
        );
        return;
      }
      recording.value = true;
      try {
        const timesBody: Record<string, unknown> = { stayId, actor: displayName.value };
        if (actualArrival) {
          timesBody.actualArrival = actualArrival;
        }
        if (actualDeparture) {
          timesBody.actualDeparture = actualDeparture;
        }
        const recorded = await apiFetch<{ actualArrival?: string | null; actualDeparture?: string | null }>(
          '/v1/stay/RecordActualTimes',
          { method: 'POST', body: JSON.stringify(timesBody) },
        );
        timesStatus.value =
          t('desk.stay.times_kept', { stayId }, `Recorded times kept for stay ${stayId}.`) +
          ' ' +
          timesLine(recorded.actualArrival, recorded.actualDeparture);
        timesArrival.value = '';
        timesDeparture.value = '';
        await refreshLists();
      } catch (err) {
        if (isSignedOut(err)) {
          refuseSession();
          return;
        }
        timesError.value = errorMessage(err);
      } finally {
        recording.value = false;
      }
    }

    async function onReview(): Promise<void> {
      if (reviewing.value) {
        return;
      }
      checkoutError.value = '';
      const stayId = checkoutStayId.value.trim();
      if (!stayId) {
        checkoutStatus.value = t('desk.stay.need_stay', {}, 'Choose a stay from the lists first.');
        return;
      }
      reviewing.value = true;
      try {
        const folio = await apiFetch<{
          folioId: string;
          balanceMinor: number;
          openBalanceApproval?: unknown;
        }>('/v1/billing/GetFolioBalance', {
          method: 'POST',
          body: JSON.stringify({ stayId, actor: displayName.value }),
        });
        checkoutCtx.value = {
          stayId,
          folioId: folio.folioId,
          balanceMinor: folio.balanceMinor,
          approval: folio.openBalanceApproval ?? null,
        };
        folioStatus.value = t(
          'desk.stay.folio_line',
          { folioId: folio.folioId, balance: plainAmount(folio.balanceMinor) },
          `Folio ${folio.folioId}: balance ${plainAmount(folio.balanceMinor)}.`,
        );
        if (folio.balanceMinor === 0) {
          showApproval.value = false;
          checkoutStatus.value = t(
            'desk.stay.balance_zero',
            {},
            'The balance is zero. Check-out is clear.',
          );
        } else if (folio.openBalanceApproval) {
          showApproval.value = false;
          checkoutStatus.value = t(
            'desk.stay.approval_recorded',
            { stayId },
            `Approval recorded for stay ${stayId}.`,
          );
        } else {
          showApproval.value = true;
          checkoutError.value = t(
            'desk.stay.refused_open_balance',
            {},
            'The folio still has an open balance, so check-out is refused and the stay remains in house. Record an approval first.',
          );
        }
      } catch (err) {
        if (isSignedOut(err)) {
          refuseSession();
          return;
        }
        checkoutError.value = errorMessage(err);
      } finally {
        reviewing.value = false;
      }
    }

    async function onApprove(): Promise<void> {
      if (approving.value) {
        return;
      }
      checkoutError.value = '';
      if (!checkoutCtx.value) {
        checkoutStatus.value = t('desk.stay.need_stay', {}, 'Choose a stay from the lists first.');
        return;
      }
      const approvedBy = approvalBy.value.trim();
      const approverRole = approvalRole.value.trim();
      if (!approvedBy || !approverRole) {
        checkoutError.value = t(
          'desk.stay.need_approver',
          {},
          'Enter the approver name and role first.',
        );
        return;
      }
      approving.value = true;
      try {
        const approvalBody: Record<string, unknown> = {
          stayId: checkoutCtx.value.stayId,
          approvedBy,
          role: approverRole,
          actor: displayName.value,
          idempotencyKey: newIdempotencyKey(),
        };
        const reason = approvalReason.value.trim();
        if (reason) {
          approvalBody.reason = reason;
        }
        const recorded = await apiFetch<{
          openBalanceApproval: unknown;
          balanceMinor: number;
        }>('/v1/billing/RecordOpenBalanceApproval', {
          method: 'POST',
          body: JSON.stringify(approvalBody),
        });
        checkoutCtx.value.approval = recorded.openBalanceApproval;
        checkoutCtx.value.balanceMinor = recorded.balanceMinor;
        checkoutStatus.value = t(
          'desk.stay.approval_recorded',
          { stayId: checkoutCtx.value.stayId },
          `Approval recorded for stay ${checkoutCtx.value.stayId}.`,
        );
      } catch (err) {
        if (isSignedOut(err)) {
          refuseSession();
          return;
        }
        checkoutError.value = errorMessage(err);
      } finally {
        approving.value = false;
      }
    }

    async function onCheckOut(): Promise<void> {
      if (checkingOut.value) {
        return;
      }
      checkoutError.value = '';
      if (!checkoutCtx.value) {
        checkoutStatus.value = t('desk.stay.need_stay', {}, 'Choose a stay from the lists first.');
        return;
      }
      checkingOut.value = true;
      try {
        const folio = await apiFetch<{
          folioId: string;
          balanceMinor: number;
          openBalanceApproval?: unknown;
        }>('/v1/billing/GetFolioBalance', {
          method: 'POST',
          body: JSON.stringify({ stayId: checkoutCtx.value.stayId, actor: displayName.value }),
        });
        const approval = folio.openBalanceApproval ?? checkoutCtx.value.approval ?? null;
        const checkoutBody: Record<string, unknown> = {
          stayId: checkoutCtx.value.stayId,
          folioId: folio.folioId,
          folioBalanceMinor: folio.balanceMinor,
          actor: displayName.value,
          idempotencyKey: newIdempotencyKey(),
        };
        if (approval) {
          checkoutBody.openBalanceApproval = approval;
        }
        const actualDeparture = toISO(checkoutDeparture.value);
        if (actualDeparture) {
          checkoutBody.actualDeparture = actualDeparture;
        }
        const closed = await apiFetch<{ stayId: string; invoiceRef: string }>(
          '/v1/stay/CheckOut',
          { method: 'POST', body: JSON.stringify(checkoutBody) },
        );
        checkoutStatus.value = t(
          'desk.stay.checked_out',
          { stayId: closed.stayId, invoiceRef: closed.invoiceRef },
          `Checked out: stay ${closed.stayId}, invoice ${closed.invoiceRef}.`,
        );
        // The checked-out stay leaves the folio context behind: the
        // next review starts from a fresh stay.
        checkoutCtx.value = null;
        showApproval.value = false;
        checkoutStayId.value = '';
        checkoutDeparture.value = '';
        folioStatus.value = '';
        await refreshLists();
      } catch (err) {
        if (isSignedOut(err)) {
          refuseSession();
          return;
        }
        if (errorCode(err) === 'SETTLEMENT_REQUIRED') {
          showApproval.value = true;
          checkoutError.value = t(
            'desk.stay.refused_open_balance',
            {},
            'The folio still has an open balance, so check-out is refused and the stay remains in house. Record an approval first.',
          );
          return;
        }
        checkoutError.value = errorMessage(err);
      } finally {
        checkingOut.value = false;
      }
    }

    return {
      t,
      session,
      identity,
      secret,
      signInError,
      displayName,
      role,
      businessDate,
      listsError,
      arrivalRows,
      inHouseRows,
      departureRows,
      readyRooms,
      checkinCandidates,
      bookingRef,
      checkinArrival,
      checkinRoomId,
      checkinStatus,
      checkinError,
      checkingIn,
      moveStayId,
      moveRoomId,
      moveStatus,
      moveError,
      moving,
      timesStayId,
      timesArrival,
      timesDeparture,
      timesStatus,
      timesError,
      recording,
      checkoutStayId,
      checkoutDeparture,
      folioStatus,
      checkoutStatus,
      checkoutError,
      reviewing,
      approving,
      checkingOut,
      showApproval,
      approvalBy,
      approvalRole,
      approvalReason,
      canCheckOut,
      pickArrival,
      pickStay,
      onBookingRefInput,
      onCheckoutStayInput,
      onSignIn,
      onSignOut,
      onRefresh,
      onCheckIn,
      onMove,
      onRecordTimes,
      onReview,
      onApprove,
      onCheckOut,
    };
  },
});
</script>
